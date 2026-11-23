const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const publicDirectory = path.join(__dirname, "public");
const indexFile = path.join(publicDirectory, "index.html");
const dataDirectory = process.env.MISSIVE_DATA_DIR || path.join(__dirname, "data");
const dataFile = path.join(dataDirectory, "letters.json");
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT) || 3000;
const maxRequestSize = 64 * 1024;
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

let databaseQueue = Promise.resolve();

function respondJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

function serializeDatabase(operation) {
  const result = databaseQueue.then(operation);
  databaseQueue = result.catch(() => {});
  return result;
}

async function readDatabase() {
  try {
    const contents = await fs.readFile(dataFile, "utf8");
    const database = JSON.parse(contents);
    if (!database || typeof database.rooms !== "object" || Array.isArray(database.rooms)) {
      throw new Error("The letters database has an invalid format.");
    }
    return database;
  } catch (error) {
    if (error.code === "ENOENT") return { rooms: {} };
    throw error;
  }
}

async function writeDatabase(database) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${dataFile}.${process.pid}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(database), "utf8");
  await fs.rename(temporaryFile, dataFile);
}

function readJsonBody(request): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body) > maxRequestSize) {
        tooLarge = true;
        body = "";
      }
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(Object.assign(new Error("Request body is too large."), { status: 413 }));
        return;
      }
      try {
        const parsed: unknown = JSON.parse(body);
        resolve(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {});
      } catch {
        reject(Object.assign(new Error("Request body must be valid JSON."), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function normalizeRoom(value) {
  const room = value.trim().toLowerCase().replace(/\s+/g, "-");
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(room)) {
    throw Object.assign(new Error("Le code doit contenir au maximum 64 lettres, chiffres ou tirets."), { status: 400 });
  }
  return room;
}

function validateName(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 40) {
    throw Object.assign(new Error("Le prénom doit contenir entre 1 et 40 caractères."), { status: 400 });
  }
  return value.trim();
}

function validateContent(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 5000) {
    throw Object.assign(new Error("La lettre doit contenir entre 1 et 5 000 caractères."), { status: 400 });
  }
  return value.trim();
}

async function handleApi(request, response, pathname) {
  const match = pathname.match(/^\/api\/rooms\/([^/]+)\/(join|letters)$/);
  if (!match) {
    respondJson(response, 404, { error: "Route API introuvable." });
    return;
  }

  let room;
  try {
    room = normalizeRoom(match[1]);
  } catch (error) {
    respondJson(response, error.status, { error: error.message });
    return;
  }

  const action = match[2];
  if (action === "join" && request.method === "POST") {
    try {
      const body = await readJsonBody(request);
      const name = validateName(body.name);
      const result = await serializeDatabase(async () => {
        const database = await readDatabase();
        const roomData = database.rooms[room] || { participants: [], letters: [] };
        const existingName = roomData.participants.find(
          (participant) => participant.toLowerCase() === name.toLowerCase(),
        );
        if (!existingName && roomData.participants.length >= 2) {
          throw Object.assign(new Error("Ce code est déjà utilisé par un duo complet."), { status: 409 });
        }
        if (!existingName) {
          roomData.participants.push(name);
          database.rooms[room] = roomData;
          await writeDatabase(database);
        }
        return { room, name: existingName || name };
      });
      respondJson(response, 200, result);
    } catch (error) {
      if (!error.status || error.status >= 500) console.error("Unable to join correspondence:", error);
      respondJson(response, error.status || 500, { error: error.status ? error.message : "Impossible d'enregistrer la correspondance." });
    }
    return;
  }

  if (action === "letters" && request.method === "GET") {
    try {
      const letters = await serializeDatabase(async () => {
        const database = await readDatabase();
        return database.rooms[room]?.letters || [];
      });
      respondJson(response, 200, { letters });
    } catch (error) {
      console.error("Unable to load letters:", error);
      respondJson(response, 500, { error: "Impossible de charger les lettres." });
    }
    return;
  }

  if (action === "letters" && request.method === "POST") {
    try {
      const body = await readJsonBody(request);
      const author = validateName(body.author);
      const content = validateContent(body.content);
      const letter = await serializeDatabase(async () => {
        const database = await readDatabase();
        const roomData = database.rooms[room];
        if (!roomData || !roomData.participants.some(
          (participant) => participant.toLowerCase() === author.toLowerCase(),
        )) {
          throw Object.assign(new Error("Rejoignez cette correspondance avant d'envoyer une lettre."), { status: 403 });
        }
        const savedLetter = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          author,
          content,
          date: new Date().toISOString(),
        };
        roomData.letters.push(savedLetter);
        await writeDatabase(database);
        return savedLetter;
      });
      respondJson(response, 201, { letter });
    } catch (error) {
      if (!error.status || error.status >= 500) console.error("Unable to send letter:", error);
      respondJson(response, error.status || 500, { error: error.status ? error.message : "Impossible d'enregistrer la lettre." });
    }
    return;
  }

  respondJson(response, 405, { error: "Méthode non autorisée." });
}

const server = http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    respondJson(response, 400, { error: "Adresse invalide." });
    return;
  }

  if (pathname.startsWith("/api/")) {
    void handleApi(request, response, pathname);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  const requestedFile = path.resolve(publicDirectory, `.${pathname}`);
  if (requestedFile !== publicDirectory && !requestedFile.startsWith(`${publicDirectory}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.stat(requestedFile).then((stats) => {
    const file = stats.isFile()
      ? requestedFile
      : path.extname(pathname)
        ? null
        : indexFile;
    if (!file) {
      response.writeHead(404);
      response.end("Not found");
      return null;
    }
    return fs.readFile(file).then((contents) => ({ file, contents }));
  }).then((result) => {
    if (!result) return;
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(result.file)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : result.contents);
  }).catch((error) => {
    if (error.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    console.error("Unable to serve file:", error);
    response.writeHead(500);
    response.end("Internal server error");
  });
});

server.on("error", (error) => {
  console.error("Unable to start the local server:", error.message);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Missive est disponible sur http://localhost:${port}`);
});
