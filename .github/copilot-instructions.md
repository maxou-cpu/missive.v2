# Missive repository instructions

## Project overview

Missive is a small Node.js/vanilla-browser correspondence application. It has no framework build pipeline: `server.js` is the HTTP API and static-file server, and `public/` contains the complete browser UI.

- `server.js` owns routing, request validation, JSON persistence, and static-file serving.
- `public/index.html` is the entry screen; `public/correspondence.html` is the two-pane writing/library screen.
- `public/app.js` contains all browser behavior and calls the `/api/rooms/...` endpoints.
- `public/styles.css` contains shared styles for both pages.
- `data/letters.json` is runtime data, not source code. `MISSIVE_DATA_DIR` can redirect its storage directory.

## Commands

- Install the exact locked dependencies: `npm ci`
- Start locally: `npm start` (http://localhost:3000)
- Start on another port: `PORT=3001 npm start`
- Run the repository build check: `npm run build`
- The build script syntax-checks `server.js` and `public/app.js`, then verifies the main HTML and CSS files exist.

There is currently no test runner or lint script, and no test files. Do not add `npm test` or a single-test command; add a runner and script first if tests are introduced.

## Architecture and data flow

- The server listens on `127.0.0.1` and uses Node's built-in `http` module; Express and the other declared dependencies are currently not used by `server.js`.
- API routes are `POST /api/rooms/:room/join`, `GET /api/rooms/:room/letters`, and `POST /api/rooms/:room/letters`.
- Room codes are normalized to lowercase, hyphenated, alphanumeric values before lookup; keep this consistent with `public/app.js`'s `slug()` helper.
- Database operations are serialized in process with `databaseQueue`. Reads and writes are performed against one JSON file, with writes made through a temporary file and rename.
- Runtime state is stored at `data/letters.json` by default. Never commit actual runtime contents or modify the file as source code.
- The browser remembers the latest join with `localStorage`; the active joined session is passed to the correspondence page through `sessionStorage`. The correspondence page poll-refreshes letters every four seconds.

## Code conventions

- Preserve the application's French user-facing text and existing French error messages.
- Keep API error bodies in JSON as `{ "error": "..." }` and use explicit HTTP status codes.
- Reuse server-side validation for names, room codes, and letter content; the browser and server both have 40-character name and 5000-character letter limits.
- Static assets and API routes share the same server. Add route handling before the static-file branch, and preserve URL decoding and traversal protection.
- The frontend is an IIFE in `public/app.js` and uses plain DOM APIs and `fetch`; do not introduce framework-specific patterns without an accompanying architectural change.
- HTML element IDs are shared directly between the HTML pages and `public/app.js`. When renaming an element, update both the markup and JavaScript references.
- Escaping letter content before injecting it into `innerHTML` is required. Reuse or preserve `escapeHtml()` rather than rendering user content directly.
- Keep changes small and compatible with Node.js 18, with no TypeScript or bundler assumptions.
