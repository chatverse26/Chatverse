# Chatverse — shared community character-chat server

A PG-13 community character-chat hub for Hardballs Radio fans. **One server holds one AI key and serves everyone**: visitors pick a display name (no email, no passwords), browse a shared character library, create characters, and chat 1-on-1 with any character.

## Run it locally

**You need:** Node.js 18+ ([nodejs.org](https://nodejs.org)).

```bash
cd chatverse
npm install
npm start
```

Then open **http://localhost:3000** on your phone or computer.

- Without an API key, everything works except AI replies — the app says so honestly and never fakes a response. Characters, search, creation, and chat UI all function.
- To enable real AI chat, set the key and restart:
  ```bash
  # macOS / Linux
  GOOGLE_AI_API_KEY=your_key_here npm start
  # Windows (PowerShell)
  $env:GOOGLE_AI_API_KEY="your_key_here"; npm start
  ```
  Get a free key at **https://aistudio.google.com/apikey** (sign in with Google → "Create API key"). The free tier is plenty for a community this size.

## Environment variables

| Variable | Default | What it does |
|---|---|---|
| `GOOGLE_AI_API_KEY` | *(empty)* | **Required for AI chat.** Server-side only — never sent to browsers. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model used for character replies. |
| `DAILY_CHAT_CAP` | `100` | Max AI chat messages per visitor per day (anonymous client id in localStorage). |
| `PORT` | `3000` | Port to listen on. |

Copy `.env.example` to `.env` for local use. **Never commit `.env`.**

## How it works

- `server.js` — Express backend + JSON-file storage (`data/characters.json`, `data/usage.json`). No database server needed.
- `public/` — mobile-first frontend (no build step, no framework).
- `POST /api/chat` — checks the daily cap, runs the PG-13 word filter on the user message, calls Gemini server-side with max safety settings (`BLOCK_LOW_AND_ABOVE` on all harm categories), filters the reply, then counts it against the cap.
- `GET /api/health` — status endpoint. Reports `aiConfigured` (boolean only — the key itself is never exposed).

## 🎬 Replay videos

In any 1-on-1 chat, tap **🎬 Replay** in the chat header to play the last up to 30 messages as a captioned, narrated replay — each line shows the speaker's avatar and name and is read aloud in the browser (via `speechSynthesis`, with a different voice/pitch per speaker so characters sound distinct from you). The stage is vertical (9:16) so it posts nicely to socials, over the character's custom background (or the built-in scene when none is set).

- **Save video:** the ⏺ button records the replay straight from the page into a downloadable `.webm` using `canvas.captureStream()` + `MediaRecorder`. No server, no ffmpeg, no API keys, no cost. Note: the saved file is **silent** — browsers can't route text-to-speech audio into a recording, so the captions carry the story. Where recording isn't supported, the button hides itself with a note suggesting screen-recording instead.
- Only messages already shown in chat are replayed (already PG-13 filtered) — the player adds no new input path.

## Project layout

```
chatverse/
├── server.js            # backend: API, safety filter, budget caps, Gemini calls
├── package.json         # one dependency: express
├── .env.example         # env var template (copy to .env locally)
├── data/                # JSON storage (created/seeded on first run)
├── public/
│   ├── index.html       # the app
│   ├── styles.css
│   ├── app.js
│   └── assets/backgrounds/  # the 10 Chatverse background images
├── README.md
└── DEPLOY.md            # put it online free (Render)
```
