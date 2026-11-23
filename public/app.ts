(function(){
  interface Letter {
    id: string;
    author: string;
    content: string;
    date: string;
  }

  interface JoinedSession {
    room: string;
    name: string;
  }

  interface ApiErrorResponse {
    error?: string;
  }

  async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options && options.headers) }
    });
    const result = await response.json() as T | ApiErrorResponse;
    if(!response.ok) throw new Error((result as ApiErrorResponse).error || 'Une erreur est survenue.');
    return result as T;
  }

  const corrScreen = document.getElementById('corr-screen');
  const roomInput = document.getElementById('room-code') as HTMLInputElement | null;
  const nameInput = document.getElementById('user-name') as HTMLInputElement | null;
  const enterBtn = document.getElementById('enter-btn') as HTMLButtonElement | null;
  const entryError = document.getElementById('entry-error') as HTMLElement | null;
  const tbCode = document.getElementById('tb-code') as HTMLElement | null;
  const tbName = document.getElementById('tb-name') as HTMLElement | null;
  const storageStatus = (document.getElementById('storage-status') as HTMLElement | null) || entryError;
  const leaveBtn = document.getElementById('leave-btn') as HTMLButtonElement | null;
  const letterText = document.getElementById('letter-text') as HTMLTextAreaElement | null;
  const charCount = document.getElementById('char-count') as HTMLElement | null;
  const sendBtn = document.getElementById('send-btn') as HTMLButtonElement | null;
  const threadContainer = document.getElementById('thread-container') as HTMLElement | null;
  const tabWrite = document.getElementById('tab-write') as HTMLButtonElement | null;
  const tabLibrary = document.getElementById('tab-library') as HTMLButtonElement | null;
  const layout = document.getElementById('layout') as HTMLElement | null;

  let ROOM: string | null = null;
  let ME: string | null = null;
  let currentLetters: Letter[] = [];
  let lastCount = 0;
  let pollTimer: number | null = null;

  function slug(s: string): string { return s.trim().toLowerCase().replace(/\s+/g,'-'); }
  function roomUrl(room: string, action: 'join' | 'letters'): string { return `/api/rooms/${encodeURIComponent(slug(room))}/${action}`; }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    const jours = ['dim','lun','mar','mer','jeu','ven','sam'];
    const mois = ['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'];
    const j = jours[d.getDay()], da = d.getDate(), mo = mois[d.getMonth()], y = d.getFullYear();
    const h = String(d.getHours()).padStart(2,'0'), mi = String(d.getMinutes()).padStart(2,'0');
    return `${j} ${da} ${mo} ${y} · ${h}h${mi}`;
  }

  function loadRemembered(){
    try{
      const remembered = JSON.parse(localStorage.getItem('missive-last-session') || 'null');
      if(remembered && typeof remembered === 'object'){
        if(remembered.room && roomInput) roomInput.value = remembered.room;
        if(remembered.name && nameInput) nameInput.value = remembered.name;
      }
    }catch(e){
      console.error('Unable to load the previous session', e);
    }
  }

  async function getLetters(): Promise<Letter[]>{
    if(!ROOM) throw new Error('Correspondance non ouverte.');
    const result = await apiRequest<{ letters: Letter[] }>(roomUrl(ROOM, 'letters'));
    return result.letters;
  }

  function escapeHtml(s: string): string {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };

    return s.replace(/[&<>"']/g, character => replacements[character]);
  }

  function renderThread(
    letters: Letter[],
    opts: { newIds?: Set<string> } = {}
  ): void {
    if (!threadContainer) return;

    if (letters.length === 0) {
      threadContainer.innerHTML =
        '<div class="empty-shelf">Aucune lettre pour l\'instant. La première ouvrira le fil.</div>';
      return;
    }

    const sorted = letters
      .slice()
      .sort(
        (a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
      );

    threadContainer.innerHTML = '<div class="thread"></div>';

    const thread = threadContainer.querySelector<HTMLElement>('.thread');
    if (!thread) return;

    sorted.forEach(letter => {
      const mine = letter.author === ME;
      const isNew =
        opts.newIds?.has(letter.id) === true && !mine;

      const row = document.createElement('div');
      row.className = 'letter-row ' + (mine ? 'mine' : 'theirs');

      row.innerHTML = `
        <div class="letter-card">
          <div class="postmark">${formatDate(letter.date)}</div>
          <div class="letter-body">${escapeHtml(letter.content)}</div>
          <div class="letter-sign">
            ${escapeHtml(letter.author)}
            ${isNew ? '<span class="new-badge">nouveau</span>' : ''}
          </div>
        </div>`;

      thread.appendChild(row);
    });

    threadContainer.scrollTop = threadContainer.scrollHeight;
  }

  function pollLoop(): void {
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
    }

    pollTimer = window.setInterval(async () => {
      try {
        const letters = await getLetters();
        currentLetters = letters;

        if (letters.length !== lastCount) {
          renderThread(letters);
          lastCount = letters.length;
        }

        if (storageStatus) storageStatus.textContent = '';
      } catch (error) {
        console.error('Unable to refresh letters', error);

        if (storageStatus) {
          storageStatus.textContent =
            'Impossible d’actualiser les lettres. Vérifiez la connexion au serveur.';
        }
      }
    }, 4000);
  }

  async function enterCorrespondence(room: string, name: string): Promise<void>{
    ROOM = room; ME = name;
    if(tbCode) tbCode.textContent = slug(room);
    if(tbName) tbName.textContent = name;
    try{
      const letters = await getLetters();
      currentLetters = letters;
      lastCount = letters.length;
      renderThread(letters);
      if(storageStatus) storageStatus.textContent = '';
    }catch(error){
      console.error('Unable to load letters', error);
      if(storageStatus) storageStatus.textContent = 'Impossible de charger les lettres. Vérifiez que le serveur fonctionne, puis réessayez.';
      renderThread([]);
    }
    pollLoop();
  }

  if(enterBtn && roomInput && nameInput && entryError){
    enterBtn.addEventListener('click', async (e)=>{
      e.preventDefault();
      if(!roomInput || !nameInput) return;
      const room = roomInput.value.trim();
      const name = nameInput.value.trim();
      if(!room || !name){
        entryError.textContent = 'Merci de renseigner le code et votre prénom.';
        return;
      }
      entryError.textContent = '';
      enterBtn.disabled = true;
      try{
        const joined = await apiRequest<JoinedSession>(roomUrl(room, 'join'), {
          method: 'POST',
          body: JSON.stringify({name})
        });
        localStorage.setItem('missive-last-session', JSON.stringify({room: joined.room, name: joined.name}));
        sessionStorage.setItem('missive-session', JSON.stringify(joined));
        window.location.assign('/correspondence.html');
      }catch(error){
        console.error('Unable to open correspondence', error);
        entryError.textContent = error instanceof Error ? error.message : "Impossible d'ouvrir la correspondance. Vérifiez que le serveur fonctionne puis réessayez.";
      }finally{
        enterBtn.disabled = false;
      }
    });

    [roomInput, nameInput].forEach(el=>{
      el.addEventListener('keydown', e=>{
        if(e.key === 'Enter'){ e.preventDefault(); enterBtn.click(); }
      });
    });

    loadRemembered();
  }

  if(corrScreen && leaveBtn && letterText && charCount && sendBtn && tabWrite && tabLibrary && layout){
    let session: JoinedSession | null = null;
    try{
      session = JSON.parse(sessionStorage.getItem('missive-session') || 'null');
    }catch(error){
      console.error('Unable to read correspondence session', error);
    }

    if(!session || !session.room || !session.name){
      window.location.replace('/');
    }else{
      enterCorrespondence(session.room, session.name);
    }

    leaveBtn.addEventListener('click', (e)=>{
      e.preventDefault();
      if(pollTimer) clearInterval(pollTimer);
      sessionStorage.removeItem('missive-session');
      window.location.assign('/');
    });

    letterText.addEventListener('input', ()=>{
      const n = letterText.value.length;
      charCount.textContent = n + (n === 1 ? ' caractère' : ' caractères');
      sendBtn.disabled = letterText.value.trim().length === 0;
    });

    sendBtn.addEventListener('click', async (e)=>{
      e.preventDefault();
      const content = letterText.value.trim();
      if(!content || !ROOM || !ME) return;
      sendBtn.disabled = true;
      try{
        const result = await apiRequest<{ letter: Letter }>(roomUrl(ROOM, 'letters'), {
          method: 'POST',
          body: JSON.stringify({author: ME, content})
        });
        currentLetters.push(result.letter);
        letterText.value = '';
        charCount.textContent = '0 caractère';
        lastCount = currentLetters.length;
        renderThread(currentLetters);
        if(storageStatus) storageStatus.textContent = '';
        if(window.innerWidth <= 760){ tabLibrary.click(); }
      }catch(error){
        console.error('Unable to send letter', error);
        if(storageStatus) storageStatus.textContent = error instanceof Error ? error.message : "La lettre n’a pas pu être envoyée. Réessayez.";
        alert(error instanceof Error ? error.message : "La lettre n'a pas pu être envoyée. Réessayez.");
      }finally{
        sendBtn.disabled = false;
      }
    });

    tabWrite.addEventListener('click', (e)=>{
      e.preventDefault();
      tabWrite.classList.add('active'); tabLibrary.classList.remove('active');
      layout.classList.add('show-write'); layout.classList.remove('show-library');
    });
    tabLibrary.addEventListener('click', (e)=>{
      e.preventDefault();
      tabLibrary.classList.add('active'); tabWrite.classList.remove('active');
      layout.classList.add('show-library'); layout.classList.remove('show-write');
    });
  }

  if(enterBtn && entryError){
    try{
      const message = sessionStorage.getItem('missive-entry-error');
      if(message){
        entryError.textContent = message;
        sessionStorage.removeItem('missive-entry-error');
      }
    }catch(error){
      console.error('Unable to read entry message', error);
    }
  }

})();
