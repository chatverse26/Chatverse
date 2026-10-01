/* Chatverse frontend — talks only to our own backend. No API keys here. */
'use strict';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
if (!store.get('chatverse_client_id')) {
  store.set('chatverse_client_id', 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  }));
}
const clientId = store.get('chatverse_client_id');
let myName = store.get('chatverse_name', '');
let characters = [];
let filter = 'all';
let currentChar = null;
let aiReady = false;
let dailyCap = 100;

const AVATARS = ['🎤', '📋', '🎧', '📊', '🐸', '🦊', '🤖', '🧙', '🦄', '🐉', '⚡', '🌟'];
let pickedAvatar = AVATARS[0];
let uploadedAvatar = '';

// ---------- Background crossfade ----------
const bgEl = $('bg');
let bgTimer = null;
function setBackgroundImage(url) {
  if (bgEl.dataset.cur === url) return;
  bgEl.classList.add('dim');
  clearTimeout(bgTimer);
  bgTimer = setTimeout(() => {
    bgEl.style.backgroundImage = `url("${url}")`;
    bgEl.dataset.cur = url;
    bgEl.classList.remove('dim');
  }, 350);
}
function setBackground(file) {
  setBackgroundImage(`/assets/backgrounds/${file}`);
}

// Personal background: one per anonymous client, shown behind the
// welcome and library screens for that visitor only. Falls back to
// the built-in art when unset.
let myBgUrl = store.get('chatverse_my_bg', '');
const PERSONAL_BG_SCREENS = ['scr-welcome', 'scr-library'];

// ---------- Screens ----------
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const el = $(id);
  el.classList.add('active');
  document.body.classList.remove('chatting');
  if (myBgUrl && PERSONAL_BG_SCREENS.includes(id)) {
    setBackgroundImage(myBgUrl);
  } else {
    setBackground(el.dataset.bg || 'bg-celestial.jpg');
  }
  document.querySelectorAll('#nav button').forEach((b) =>
    b.classList.toggle('on', b.dataset.go === id));
  window.scrollTo(0, 0);
}
document.querySelectorAll('#nav button').forEach((b) =>
  b.addEventListener('click', () => show(b.dataset.go)));

// ---------- Welcome ----------
if (myName) $('nameInput').value = myName;
$('enterBtn').addEventListener('click', () => {
  const v = $('nameInput').value.trim().slice(0, 30);
  if (!v) { $('nameInput').focus(); return; }
  setName(v);
  show('scr-library');
});

// ---------- Library ----------
function avatarHtml(c, cls) {
  if (c.avatar && c.avatar.startsWith('data:')) {
    return `<img class="${cls || 'avatar'}" src="${c.avatar}" alt="">`;
  }
  return `<div class="${cls || 'avatar'}">${escapeHtml(c.avatar || '✨')}</div>`;
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
async function loadLibrary() {
  try {
    const r = await fetch('/api/characters');
    const d = await r.json();
    characters = d.characters || [];
  } catch { characters = []; }
  renderLibrary();
}
function renderLibrary() {
  const q = $('searchInput').value.trim().toLowerCase();
  const grid = $('charGrid');
  let list = characters;
  if (filter === 'mine') list = list.filter((c) => c.creatorName === myName);
  if (filter === 'starters') list = list.filter((c) => c.starter);
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || c.personality.toLowerCase().includes(q));
  $('libCount').textContent = list.length ? `${list.length} character${list.length === 1 ? '' : 's'} in the verse` : '';
  grid.innerHTML = list.length ? '' : `<div class="empty">No characters here yet.<br>Be the first to create one! ✨</div>`;
  list.forEach((c) => {
    const el = document.createElement('div');
    el.className = 'char-card';
    el.innerHTML = `${avatarHtml(c)}<h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.personality)}</p><div class="by">by ${escapeHtml(c.creatorName)}${c.starter ? ' <span class="badge">starter</span>' : ''}</div>`;
    el.addEventListener('click', () => openChat(c));
    grid.appendChild(el);
  });
}
$('searchInput').addEventListener('input', renderLibrary);
document.querySelectorAll('.chip').forEach((ch) => ch.addEventListener('click', () => {
  document.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
  ch.classList.add('on');
  filter = ch.dataset.f;
  renderLibrary();
}));

// ---------- Creator ----------
const row = $('avatarRow');
AVATARS.forEach((a, i) => {
  const d = document.createElement('div');
  d.className = 'avatar-pick' + (i === 0 ? ' on' : '');
  d.textContent = a;
  d.addEventListener('click', () => {
    row.querySelectorAll('.avatar-pick').forEach((x) => x.classList.remove('on'));
    d.classList.add('on');
    pickedAvatar = a; uploadedAvatar = '';
    $('avatarPreview').style.display = 'none';
  });
  row.appendChild(d);
});
$('photoInput').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    const s = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const side = Math.min(img.width, img.height);
    cv.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, s, s);
    uploadedAvatar = cv.toDataURL('image/jpeg', 0.8);
    row.querySelectorAll('.avatar-pick').forEach((x) => x.classList.remove('on'));
    const pv = $('avatarPreview');
    pv.src = uploadedAvatar;
    pv.style.display = 'block';
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f);
});
// Optional per-character chat background: kept wide (max 1280px), not square-cropped.
let uploadedBg = '';
$('bgInput').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (!f.type.startsWith('image/')) { alert('Please pick an image file.'); return; }
  const img = new Image();
  img.onload = () => {
    const MAXW = 1280;
    const scale = Math.min(1, MAXW / img.width);
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * scale);
    cv.height = Math.round(img.height * scale);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    uploadedBg = cv.toDataURL('image/jpeg', 0.85);
    const pv = $('bgPreview');
    pv.src = uploadedBg;
    pv.style.display = 'block';
    $('bgRemoveBtn').style.display = 'block';
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f);
});
$('bgRemoveBtn').addEventListener('click', () => {
  uploadedBg = '';
  $('bgInput').value = '';
  $('bgPreview').style.display = 'none';
  $('bgRemoveBtn').style.display = 'none';
});
$('createBtn').addEventListener('click', async () => {
  const name = $('cName').value.trim();
  const personality = $('cPersonality').value.trim();
  const greeting = $('cGreeting').value.trim();
  if (!name || !personality) { alert('Give your character a name and a personality!'); return; }
  $('createBtn').disabled = true;
  try {
    const r = await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, personality, greeting, avatar: uploadedAvatar || pickedAvatar, background: uploadedBg, creatorName: myName || 'Anonymous' }),
    });
    const d = await r.json();
    if (!r.ok) {
      alert(d.error === 'keep_it_pg13' ? 'Keep it PG-13, please! ✨' : d.error === 'bad_background' ? 'That background image didn\'t work — try a JPG, PNG or WebP under 3MB.' : 'Something went wrong — try again.');
      return;
    }
    $('cName').value = ''; $('cPersonality').value = ''; $('cGreeting').value = '';
    uploadedBg = ''; $('bgInput').value = ''; $('bgPreview').style.display = 'none'; $('bgRemoveBtn').style.display = 'none';
    await loadLibrary();
    show('scr-library');
    openChat(d.character);
  } finally {
    $('createBtn').disabled = false;
  }
});

// ---------- Chat ----------
function getHistory(id) { return store.get('chatverse_chats', {})[id] || []; }
function saveHistory(id, h) {
  const all = store.get('chatverse_chats', {});
  all[id] = h.slice(-40);
  store.set('chatverse_chats', all);
}
function openChat(c) {
  currentChar = c;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.body.classList.add('chatting');
  $('chatHead').style.display = 'flex';
  $('chatLog').style.display = 'flex';
  $('chatAvatar').outerHTML = avatarHtml(c).replace('class="avatar"', 'id="chatAvatar" class="avatar"');
  $('chatName').textContent = c.name;
  if (!getHistory(c.id).length && c.greeting) {
    saveHistory(c.id, [{ role: 'character', text: c.greeting }]);
  }
  renderChat();
  if (currentChar.background && currentChar.background.startsWith('data:')) {
    setBackgroundImage(currentChar.background);
  } else {
    setBackground('bg-hangout.jpg');
  }
  window.scrollTo(0, 0);
}
$('chatBack').addEventListener('click', () => {
  $('chatHead').style.display = 'none';
  $('chatLog').style.display = 'none';
  show('scr-library');
});
function renderChat() {
  const log = $('chatLog');
  log.innerHTML = '';
  const h = getHistory(currentChar.id);
  h.forEach((m) => addBubble(m.text, m.role === 'user' ? 'me' : 'them'));
  if (!aiReady) addBubble('⚙️ The community AI brain isn\'t switched on yet — the host still needs to add the free API key on the server. Your messages are saved here for now.', 'sys');
  updateCapNote();
  log.scrollTop = log.scrollHeight;
}
function addBubble(text, cls) {
  const d = document.createElement('div');
  d.className = 'bubble ' + cls;
  d.textContent = text;
  $('chatLog').appendChild(d);
  $('chatLog').scrollTop = $('chatLog').scrollHeight;
  return d;
}
function updateCapNote() {
  $('capNote').textContent = `Daily chats are limited (${dailyCap}/day) so the fun stays free for everyone 💜`;
}
async function sendChat() {
  const inp = $('chatInput');
  const text = inp.value.trim();
  if (!text || !currentChar) return;
  inp.value = '';
  const h = getHistory(currentChar.id);
  h.push({ role: 'user', text });
  saveHistory(currentChar.id, h);
  addBubble(text, 'me');
  const typing = addBubble('…', 'them typing');
  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId: currentChar.id, clientId, messages: h }),
    });
    const d = await r.json();
    typing.remove();
    if (d.reply) {
      h.push({ role: 'character', text: d.reply });
      saveHistory(currentChar.id, h);
      addBubble(d.reply, 'them');
    } else if (d.error === 'ai_not_configured') {
      addBubble("⚙️ The community brain isn't on yet — tell the host to add the free API key on the server. Nothing was faked!", 'sys');
    } else if (d.error === 'daily_cap') {
      addBubble(d.reply, 'sys');
    } else {
      addBubble(d.reply || 'Hmm, glitch in the verse — try again! 🛠️', 'sys');
    }
  } catch {
    typing.remove();
    addBubble('Connection hiccup — check your signal and try again! 📡', 'sys');
  }
}
$('sendBtn').addEventListener('click', sendChat);
$('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

// ---------- You / settings ----------
function setName(v) {
  myName = v;
  store.set('chatverse_name', myName);
  $('nameInput').value = myName;
  $('youNameInput').value = myName;
  $('byLine').textContent = myName ? `Creating as ${myName}.` : '';
}
$('saveNameBtn').addEventListener('click', () => {
  const v = $('youNameInput').value.trim().slice(0, 30);
  if (!v) { $('youNameInput').focus(); return; }
  setName(v);
  show('scr-library');
});

// Personal background: resized client-side (max 1280px wide), stored as a
// file on the server under this visitor's anonymous client ID.
let pendingMyBg = '';
$('myBgInput').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (!f.type.startsWith('image/')) { alert('Please pick an image file.'); return; }
  const img = new Image();
  img.onload = () => {
    const MAXW = 1280;
    const scale = Math.min(1, MAXW / img.width);
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * scale);
    cv.height = Math.round(img.height * scale);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    pendingMyBg = cv.toDataURL('image/jpeg', 0.85);
    const pv = $('myBgPreview');
    pv.src = pendingMyBg;
    pv.style.display = 'block';
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f);
});
function refreshMyBgPreview() {
  const pv = $('myBgPreview');
  const src = pendingMyBg || myBgUrl;
  if (src) { pv.src = src; pv.style.display = 'block'; }
  else { pv.style.display = 'none'; }
}
$('saveBgBtn').addEventListener('click', async () => {
  if (!pendingMyBg) { alert('Pick an image first!'); return; }
  $('saveBgBtn').disabled = true;
  try {
    const r = await fetch('/api/uploads/background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, image: pendingMyBg }),
    });
    const d = await r.json();
    if (!r.ok) {
      alert(d.error === 'image_too_large' ? 'That image is over 3MB — try a smaller one.' : 'Couldn\'t save that background — try again.');
      return;
    }
    myBgUrl = d.url;
    store.set('chatverse_my_bg', myBgUrl);
    pendingMyBg = '';
    $('myBgInput').value = '';
    refreshMyBgPreview();
    alert('Your background is set! 🎨');
  } finally {
    $('saveBgBtn').disabled = false;
  }
});
$('clearBgBtn').addEventListener('click', async () => {
  try {
    await fetch('/api/uploads/background', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
  } catch {}
  myBgUrl = '';
  store.set('chatverse_my_bg', '');
  pendingMyBg = '';
  $('myBgInput').value = '';
  refreshMyBgPreview();
});

// ---------- Boot ----------
(async function boot() {
  try {
    const r = await fetch('/api/health');
    const d = await r.json();
    aiReady = !!d.aiConfigured;
    dailyCap = d.dailyCap || 100;
  } catch { aiReady = false; }
  $('byLine').textContent = myName ? `Creating as ${myName}.` : '';
  $('youNameInput').value = myName;
  refreshMyBgPreview();
  await loadLibrary();
  show(myName ? 'scr-library' : 'scr-welcome');
})();

// ---------- Replay videos ----------
// 100% client-side: replays the current chat as a captioned, narrated
// "video" (canvas + speechSynthesis) and can record it to a .webm via
// canvas.captureStream() + MediaRecorder. Only replays messages already
// shown in chat (already PG-13 filtered) — no new input path, no server,
// no API keys, no cost.
const Replay = (() => {
  const canvas = $('replayCanvas');
  const ctx = canvas.getContext('2d');
  const W = 540, H = 960;
  let playlist = []; // {speaker:'character'|'user', name, avatar, avatarImg, text}
  let idx = 0;
  let playing = false;
  let timer = null;
  let raf = 0;
  let bgImg = null;
  let rec = null, stream = null, chunks = [], recording = false;
  let voices = [];

  const canRecord = () =>
    typeof MediaRecorder !== 'undefined' &&
    typeof canvas.captureStream === 'function';

  function loadVoices() {
    try { voices = ('speechSynthesis' in window) ? speechSynthesis.getVoices() : []; }
    catch { voices = []; }
  }
  if ('speechSynthesis' in window) {
    loadVoices();
    try { speechSynthesis.onvoiceschanged = loadVoices; } catch {}
  }

  function voiceFor(speaker) {
    if (!voices.length) return { voice: null, pitch: speaker === 'character' ? 1.25 : 0.85, rate: 1 };
    return speaker === 'character'
      ? { voice: voices[1 % voices.length], pitch: 1.15, rate: 1 }
      : { voice: voices[0], pitch: 0.9, rate: 1.05 };
  }

  function stopSpeech() {
    try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch {}
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapText(text, maxW) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
      else line = t;
    }
    if (line) lines.push(line);
    return lines.slice(0, 6);
  }

  function drawAvatar(m, cx, cy, r) {
    const ai = m.avatarImg;
    if (ai && ai.complete && ai.naturalWidth) {
      const s = Math.max((2 * r) / ai.naturalWidth, (2 * r) / ai.naturalHeight);
      const dw = ai.naturalWidth * s, dh = ai.naturalHeight * s;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(ai, cx - dw / 2, cy - dh / 2, dw, dh);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,209,102,0.85)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.font = Math.round(r * 1.4) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.avatar || '✨', cx, cy + 4);
      ctx.textBaseline = 'alphabetic';
    }
  }

  function draw() {
    ctx.fillStyle = '#0b0718';
    ctx.fillRect(0, 0, W, H);
    if (bgImg && bgImg.complete && bgImg.naturalWidth) {
      const s = Math.max(W / bgImg.naturalWidth, H / bgImg.naturalHeight);
      const dw = bgImg.naturalWidth * s, dh = bgImg.naturalHeight * s;
      ctx.drawImage(bgImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(8,5,20,0.55)');
    g.addColorStop(0.55, 'rgba(8,5,20,0.35)');
    g.addColorStop(1, 'rgba(8,5,20,0.88)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(244,241,255,0.8)';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText('🎬 Chatverse Replay', W / 2, 60);
    if (!playlist.length) return;
    const m = playlist[idx] || playlist[0];

    drawAvatar(m, W / 2, 230, 80);

    ctx.fillStyle = '#ffd166';
    ctx.font = '700 34px system-ui, sans-serif';
    ctx.fillText(String(m.name).slice(0, 24), W / 2, 362);
    ctx.fillStyle = 'rgba(207,200,236,0.85)';
    ctx.font = '400 22px system-ui, sans-serif';
    ctx.fillText(m.speaker === 'character' ? 'character' : 'you', W / 2, 394);

    const lines = wrapText(m.text, W - 140);
    const lh = 42, pad = 30;
    const boxH = lines.length * lh + pad * 2;
    const boxY = H - boxH - 130;
    rr(50, boxY, W - 100, boxH, 26);
    ctx.fillStyle = 'rgba(16,12,34,0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#f4f1ff';
    ctx.font = '400 30px system-ui, sans-serif';
    ctx.textAlign = 'left';
    lines.forEach((ln, i) => ctx.fillText(ln, 80, boxY + pad + 28 + i * lh));

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(207,200,236,0.9)';
    ctx.font = '400 24px system-ui, sans-serif';
    ctx.fillText((idx + 1) + ' / ' + playlist.length, W / 2, H - 60);
    const bw = W - 200;
    rr(100, H - 46, bw, 8, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
    if (playlist.length > 1) {
      rr(100, H - 46, Math.max(8, bw * ((idx + 1) / playlist.length)), 8, 4);
      ctx.fillStyle = '#7bdff2';
      ctx.fill();
    }
  }

  function updateChrome() {
    $('replayProg').textContent = playlist.length ? ((idx + 1) + ' / ' + playlist.length) : '';
    $('replayPlayBtn').textContent = playing ? '⏸' : '▶';
    const ok = canRecord();
    $('replaySaveBtn').style.display = ok ? '' : 'none';
    $('replayStopBtn').style.display = recording ? '' : 'none';
    $('replayNote').textContent = !ok
      ? "Video saving isn't supported in this browser — but you can screen-record the replay! 🎬"
      : recording
        ? 'Recording… tap ⏹ Stop & download when done. (Silent video — captions carry the story.)'
        : 'Tip: tap ⏺ Save video to record this replay as a .webm to share. (Silent video — captions carry the story.)';
  }

  function speakCurrent() {
    stopSpeech();
    clearTimeout(timer);
    const m = playlist[idx];
    draw();
    updateChrome();
    if (!('speechSynthesis' in window)) { timedAdvance(m); return; }
    let done = false;
    const next = () => { if (done) return; done = true; clearTimeout(timer); advance(); };
    try {
      const u = new SpeechSynthesisUtterance(m.text);
      const v = voiceFor(m.speaker);
      if (v.voice) u.voice = v.voice;
      u.pitch = v.pitch;
      u.rate = v.rate;
      u.onend = next;
      u.onerror = next;
      speechSynthesis.speak(u);
    } catch { next(); return; }
    // Safety: never stall on one line longer than ~12s.
    timer = setTimeout(next, Math.min(12000, 2500 + m.text.length * 90));
  }

  function timedAdvance(m) {
    clearTimeout(timer);
    timer = setTimeout(advance, Math.min(9000, Math.max(2200, m.text.length * 70)));
  }

  function advance() {
    if (!playing) return;
    if (idx < playlist.length - 1) { idx += 1; speakCurrent(); }
    else {
      playing = false;
      stopSpeech();
      if (recording) stopRecording();
      else updateChrome();
    }
  }

  function play() {
    if (!playlist.length) return;
    if (idx >= playlist.length) idx = 0;
    playing = true;
    speakCurrent();
  }

  function pauseToggle() {
    playing = false;
    clearTimeout(timer);
    stopSpeech();
    updateChrome();
  }

  function skip(d) {
    if (!playlist.length) return;
    clearTimeout(timer);
    stopSpeech();
    idx = Math.max(0, Math.min(playlist.length - 1, idx + d));
    if (playing) speakCurrent();
    else { draw(); updateChrome(); }
  }

  function pickMime() {
    const cands = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (const c of cands) {
      try { if (MediaRecorder.isTypeSupported(c)) return c; } catch {}
    }
    return '';
  }

  function startRecording() {
    if (!canRecord() || recording) return;
    const mime = pickMime();
    try {
      stream = canvas.captureStream(30);
      rec = mime
        ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000 })
        : new MediaRecorder(stream);
    } catch {
      alert("Couldn't start recording in this browser — try screen-recording instead! 🎬");
      return;
    }
    chunks = [];
    recording = true;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const doneRec = rec;
      rec = null;
      recording = false;
      try {
        const blob = new Blob(chunks, { type: (doneRec && doneRec.mimeType) || 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'chatverse-replay-' + Date.now() + '.webm';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } catch {}
      try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch {}
      stream = null;
      updateChrome();
    };
    idx = 0;
    updateChrome();
    try { rec.start(250); }
    catch { recording = false; rec = null; updateChrome(); return; }
    play();
  }

  function stopRecording() {
    if (!recording || !rec) return;
    playing = false;
    clearTimeout(timer);
    stopSpeech();
    try { rec.stop(); }
    catch { recording = false; updateChrome(); }
  }

  function loop() {
    draw();
    raf = requestAnimationFrame(loop);
  }

  function open() {
    if (!currentChar) return;
    const h = getHistory(currentChar.id)
      .filter((m) => m.role === 'user' || m.role === 'character')
      .slice(-30);
    if (!h.length) { alert('Chat a little first, then replay it! 💬'); return; }
    playlist = h.map((m) => (m.role === 'user'
      ? { speaker: 'user', name: myName || 'You', avatar: '👤', avatarImg: null, text: m.text }
      : { speaker: 'character', name: currentChar.name, avatar: currentChar.avatar, avatarImg: null, text: m.text }));
    const cav = currentChar.avatar;
    if (cav && cav.startsWith('data:')) {
      const ai = new Image();
      ai.src = cav;
      playlist.forEach((p) => { if (p.speaker === 'character') p.avatarImg = ai; });
    }
    const bgSrc = (currentChar.background && currentChar.background.startsWith('data:'))
      ? currentChar.background
      : '/assets/backgrounds/bg-hangout.jpg';
    bgImg = new Image();
    bgImg.src = bgSrc;
    idx = 0;
    playing = false;
    $('replay').hidden = false;
    draw();
    updateChrome();
    cancelAnimationFrame(raf);
    loop();
    play();
  }

  function close() {
    playing = false;
    clearTimeout(timer);
    stopSpeech();
    if (rec) {
      rec.onstop = null;
      rec.ondataavailable = null;
      try { rec.stop(); } catch {}
      rec = null;
    }
    recording = false;
    try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch {}
    stream = null;
    cancelAnimationFrame(raf);
    $('replay').hidden = true;
  }

  $('replayBtn').addEventListener('click', open);
  $('replayCloseBtn').addEventListener('click', close);
  $('replayPlayBtn').addEventListener('click', () => (playing ? pauseToggle() : play()));
  $('replayBackBtn').addEventListener('click', () => skip(-1));
  $('replayFwdBtn').addEventListener('click', () => skip(1));
  $('replaySaveBtn').addEventListener('click', startRecording);
  $('replayStopBtn').addEventListener('click', stopRecording);

  return { open, close };
})();
