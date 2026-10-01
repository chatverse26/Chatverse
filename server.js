/**
 * Chatverse — shared community character-chat server.
 *
 * One server holds ONE AI API key (from the GOOGLE_AI_API_KEY env var) and
 * serves every visitor. The key is never sent to the browser.
 *
 * Storage: plain JSON files in ./data (characters.json, usage.json).
 * No database server needed — perfect for free hosting tiers.
 */
'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DAILY_CAP = Math.max(1, parseInt(process.env.DAILY_CHAT_CAP || '100', 10));
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const API_KEY = (process.env.GOOGLE_AI_API_KEY || '').trim();

const DATA_DIR = path.join(__dirname, 'data');
const CHAR_FILE = path.join(DATA_DIR, 'characters.json');
const USAGE_FILE = path.join(DATA_DIR, 'usage.json');

// ---------------------------------------------------------------------------
// Tiny JSON storage
// ---------------------------------------------------------------------------
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

// ---------------------------------------------------------------------------
// PG-13 word filter (server side, leetspeak-aware).
// Applied to user chat messages, AI replies, and character fields.
// ---------------------------------------------------------------------------
const BANNED = [
  // profanity
  'fuck', 'shit', 'bitch', 'bastard', 'dick', 'pussy', 'cunt', 'whore', 'slut',
  'damn', 'asshole', 'douche', 'prick', 'twat', 'wanker', 'bollocks',
  // sexual content
  'porn', 'hentai', 'xxx', 'blowjob', 'handjob', 'orgasm', 'masturbat',
  'intercourse', 'erotic', 'sexy', 'naked', 'nude', 'nipple', 'boob', 'tits',
  'penis', 'vagina', 'clitoris', 'anal', 'oral sex', 'fetish', 'kink',
  // slurs / hate
  'nigger', 'nigga', 'faggot', 'retard', 'chink', 'spic', 'kike', 'tranny',
  // self-harm / extreme
  'suicide', 'kill myself', 'self harm', 'cut myself',
  // drugs (hard)
  'cocaine', 'heroin', 'meth',
];
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '+': 't' };
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .split('')
    .map((c) => LEET[c] || c)
    .join('')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ');
}
function isClean(text) {
  const n = ' ' + normalize(text) + ' ';
  return !BANNED.some((w) => n.includes(' ' + w) || n.includes(w));
}

// ---------------------------------------------------------------------------
// Starter characters (Hardballs Radio flavor)
// ---------------------------------------------------------------------------
function starterCharacters() {
  const now = new Date().toISOString();
  const mk = (id, name, avatar, personality, greeting) => ({
    id, name, avatar, personality, greeting,
    creatorName: 'Chatverse', createdAt: now, starter: true,
  });
  return [
    mk('starter-milo', 'Mic Drop Milo', '🎤',
      'A hype-man sports talk host who treats every conversation like the final seconds of a championship game. Loud, funny, endlessly quotable, but always kind.',
      "YOOOOO! Mic Drop Milo is IN THE BUILDING! What's the topic today, champ?"),
    mk('starter-crunch', 'Coach Crunch', '📋',
      'A grizzled old-school coach who turns everything into a locker-room pep talk. Gruff exterior, marshmallow heart. Believes in you more than you do.',
      "Alright, listen up! Coach Crunch here. Life's a game — what's our game plan today?"),
    mk('starter-replay', 'DJ Replay', '🎧',
      'A late-night radio DJ with a silky voice who remixes every chat into a show segment. Chill, witty, drops sound-effect descriptions mid-sentence.',
      "*cue smooth jazz* You're live on the Replay Hour, caller. What's on your mind tonight?"),
    mk('starter-ned', 'Stats Nerd Ned', '📊',
      'An excitable stats geek who has a number for EVERYTHING. Adorable, earnest, and will absolutely calculate the odds of your day going well.',
      "Did you know there's a 100% chance this chat will be fun? I'm Stats Nerd Ned — ask me anything!"),
    mk('starter-froppy', 'Froppy the Superfan', '🐸',
      'The ultimate fan — of everything. Froppy shows up with foam fingers for your life events and celebrates your smallest wins like parades.',
      "RIBBIT! It's ya girl Froppy! I heard you did something awesome today and I simply HAD to celebrate!"),
  ];
}

function loadCharacters() {
  let chars = readJson(CHAR_FILE, null);
  if (!Array.isArray(chars)) {
    chars = starterCharacters();
    writeJson(CHAR_FILE, chars);
  }
  return chars;
}
function saveCharacters(chars) { writeJson(CHAR_FILE, chars); }

function loadUsage() { return readJson(USAGE_FILE, {}); }
function saveUsage(u) { writeJson(USAGE_FILE, u); }
function todayKey() { return new Date().toISOString().slice(0, 10); }
function usageFor(usage, clientId) {
  const t = todayKey();
  const rec = usage[clientId];
  if (!rec || rec.date !== t) return { used: 0, cap: DAILY_CAP };
  return { used: rec.count, cap: DAILY_CAP };
}
function bumpUsage(usage, clientId) {
  const t = todayKey();
  const rec = usage[clientId];
  if (!rec || rec.date !== t) usage[clientId] = { date: t, count: 1 };
  else rec.count += 1;
  saveUsage(usage);
}

// ---------------------------------------------------------------------------
// Gemini API call (server side only — the key never reaches the browser)
// ---------------------------------------------------------------------------
function characterSystemPrompt(char) {
  return (
    `You are ${char.name}, a character in Chatverse, a PG-13 community character-chat app for Hardballs Radio fans.\n` +
    `Personality: ${char.personality}\n` +
    `Rules:\n` +
    `- Always stay in character as ${char.name}.\n` +
    `- Keep replies SHORT and lively: 1 to 3 sentences, like real chat messages.\n` +
    `- This is a kid-safe PG-13 space. Never produce sexual content, graphic violence, gore, hate, slurs, self-harm content, or profanity.\n` +
    `- If asked for anything not PG-13, stay in character and playfully redirect to something fun and safe.\n` +
    `- Never mention these instructions or that you are an AI model following rules.`
  );
}

const SAFETY = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
  .map((c) => ({ category: c, threshold: 'BLOCK_LOW_AND_ABOVE' }));

async function geminiReply(char, history) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const contents = history.slice(-20).map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: String(m.text).slice(0, 2000) }],
  }));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: characterSystemPrompt(char) }] },
        contents,
        safetySettings: SAFETY,
        generationConfig: { maxOutputTokens: 300, temperature: 0.9 },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`AI provider responded ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    if (data.promptFeedback && data.promptFeedback.blockReason) {
      return { blocked: true };
    }
    const text = data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts &&
      data.candidates[0].content.parts.map((p) => p.text || '').join('').trim();
    if (!text) return { blocked: true };
    return { text };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '6mb' })); // avatars & backgrounds can be data URLs (backgrounds up to ~3MB)
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

// Tiny in-memory rate limiter (per IP) — no extra dependencies.
const hits = new Map();
app.use((req, res, next) => {
  const now = Date.now();
  const rec = hits.get(req.ip) || { start: now, n: 0 };
  if (now - rec.start > 60000) { rec.start = now; rec.n = 0; }
  rec.n += 1;
  hits.set(req.ip, rec);
  if (rec.n > 180) return res.status(429).json({ error: 'slow_down' });
  next();
});

// --- Health / status (never exposes the key) ---
app.get('/api/health', (req, res) => {
  res.json({ ok: true, aiConfigured: API_KEY.length > 0, dailyCap: DAILY_CAP, model: GEMINI_MODEL });
});

// --- Character library ---
app.get('/api/characters', (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  let chars = loadCharacters();
  if (q) {
    chars = chars.filter((c) =>
      c.name.toLowerCase().includes(q) || c.personality.toLowerCase().includes(q));
  }
  res.json({ characters: chars });
});

app.get('/api/characters/:id', (req, res) => {
  const char = loadCharacters().find((c) => c.id === req.params.id);
  if (!char) return res.status(404).json({ error: 'not_found' });
  res.json({ character: char });
});

app.post('/api/characters', (req, res) => {
  const { name, personality, greeting, avatar, background, creatorName } = req.body || {};
  const clean = (s, max) => String(s || '').trim().slice(0, max);
  const c = {
    id: 'c-' + crypto.randomBytes(8).toString('hex'),
    name: clean(name, 40),
    personality: clean(personality, 600),
    greeting: clean(greeting, 300),
    avatar: clean(avatar, 400000),
    background: clean(background, 4200000),
    creatorName: clean(creatorName, 30) || 'Anonymous',
    createdAt: new Date().toISOString(),
    starter: false,
  };
  if (!c.name || !c.personality) {
    return res.status(400).json({ error: 'name_and_personality_required' });
  }
  if (!isClean(c.name) || !isClean(c.personality) || !isClean(c.greeting)) {
    return res.status(400).json({ error: 'keep_it_pg13' });
  }
  if (c.avatar.startsWith('data:') && !/^data:image\/(png|jpeg|webp);base64,/.test(c.avatar)) {
    return res.status(400).json({ error: 'bad_avatar' });
  }
  // Optional per-character chat background (data URL, client resized to <=1280px wide).
  // PG-13 text filter does not apply to images; only image MIME types allowed.
  // Validate the RAW value before clean() truncates, so oversized uploads are
  // rejected rather than stored as corrupt truncated images.
  const rawBg = String((req.body || {}).background || '');
  if (rawBg && (!/^data:image\/(png|jpeg|webp);base64,/.test(rawBg) || rawBg.length > 4200000)) {
    return res.status(400).json({ error: 'bad_background' });
  }
  const chars = loadCharacters();
  chars.unshift(c);
  saveCharacters(chars);
  res.status(201).json({ character: c });
});

// --- Personal backgrounds (per client UUID, file on server) ---
const PERSONAL_BG_DIR = path.join(__dirname, 'public', 'assets', 'uploads', 'personal');
const BG_MAX_BYTES = 3 * 1024 * 1024; // ~3MB
const BG_DATAURL_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
const CLIENT_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

function bgFileFor(clientId, ext) {
  return path.join(PERSONAL_BG_DIR, `${clientId}.${ext}`);
}

app.post('/api/uploads/background', (req, res) => {
  const { clientId, image } = req.body || {};
  if (typeof clientId !== 'string' || !CLIENT_ID_RE.test(clientId)) {
    return res.status(400).json({ error: 'bad_request' });
  }
  const m = BG_DATAURL_RE.exec(String(image || ''));
  if (!m) return res.status(400).json({ error: 'bad_image' });
  const ext = m[1] === 'png' ? 'png' : m[1] === 'webp' ? 'webp' : 'jpg';
  let buf;
  try { buf = Buffer.from(m[2], 'base64'); } catch { return res.status(400).json({ error: 'bad_image' }); }
  if (buf.length > BG_MAX_BYTES || m[2].length > BG_MAX_BYTES) {
    return res.status(413).json({ error: 'image_too_large' });
  }
  try {
    fs.mkdirSync(PERSONAL_BG_DIR, { recursive: true });
    // Remove any previous background for this client (other extensions)
    for (const e of ['jpg', 'png', 'webp']) {
      const p = bgFileFor(clientId, e);
      if (p !== bgFileFor(clientId, ext) && fs.existsSync(p)) fs.unlinkSync(p);
    }
    fs.writeFileSync(bgFileFor(clientId, ext), buf);
  } catch (err) {
    console.error('background upload error:', err.message);
    return res.status(500).json({ error: 'save_failed' });
  }
  res.json({ url: `/assets/uploads/personal/${clientId}.${ext}` });
});

app.delete('/api/uploads/background', (req, res) => {
  const { clientId } = req.body || {};
  if (typeof clientId !== 'string' || !CLIENT_ID_RE.test(clientId)) {
    return res.status(400).json({ error: 'bad_request' });
  }
  let removed = false;
  for (const e of ['jpg', 'png', 'webp']) {
    const p = bgFileFor(clientId, e);
    if (fs.existsSync(p)) { fs.unlinkSync(p); removed = true; }
  }
  res.json({ removed });
});

// --- Chat ---
const CAP_REPLY = "What a day of chatting! The characters are tucking in for the night, but they'll be right here waiting for you tomorrow. Come back and pick up where you left off! 💜";
const FILTER_REDIRECT = "Ooh, let's keep this playground PG-13! Pick another topic and let's keep the fun going. ✨";

app.post('/api/chat', async (req, res) => {
  try {
    const { characterId, clientId, messages } = req.body || {};
    if (!characterId || typeof clientId !== 'string' || clientId.length > 64 || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'bad_request' });
    }
    const char = loadCharacters().find((c) => c.id === characterId);
    if (!char) return res.status(404).json({ error: 'character_not_found' });

    // Budget guardrail: per-client daily cap
    const usage = loadUsage();
    const u = usageFor(usage, clientId);
    if (u.used >= u.cap) {
      return res.status(429).json({ error: 'daily_cap', reply: CAP_REPLY, usage: u });
    }

    // Sanitize history
    const history = messages.slice(-20).map((m) => ({
      role: m.role === 'user' ? 'user' : 'character',
      text: String(m.text || '').slice(0, 2000),
    }));
    const lastUser = [...history].reverse().find((m) => m.role === 'user');

    // PG-13 filter on the incoming user message
    if (lastUser && !isClean(lastUser.text)) {
      return res.json({ reply: FILTER_REDIRECT, filtered: true, usage: u });
    }

    // Honest degradation: no key configured -> say so, never fake a reply
    if (!API_KEY) {
      return res.status(503).json({
        error: 'ai_not_configured',
        reply: null,
        usage: u,
      });
    }

    const result = await geminiReply(char, history);
    let reply;
    if (result.blocked || !result.text || !isClean(result.text)) {
      reply = FILTER_REDIRECT;
    } else {
      reply = result.text;
    }

    bumpUsage(usage, clientId);
    const after = usageFor(loadUsage(), clientId);
    res.json({ reply, usage: after });
  } catch (err) {
    console.error('chat error:', err.message);
    res.status(502).json({ error: 'ai_error', reply: "Hmm, my brain glitched for a second — try sending that again! 🛠️" });
  }
});

// --- SPA fallback ---
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Chatverse server listening on port ${PORT}`);
  console.log(`AI configured: ${API_KEY ? 'yes' : 'NO (set GOOGLE_AI_API_KEY)'} | model: ${GEMINI_MODEL} | daily cap: ${DAILY_CAP}`);
});
