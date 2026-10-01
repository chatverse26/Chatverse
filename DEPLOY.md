# Deploying Chatverse online (free) — Render

This puts the shared Chatverse on the internet so everyone in the Hardballs Radio family can open one link, make characters, and chat. **Cost: $0** on Render's free tier. The only thing you pay for is AI usage, which stays tiny (about $1 per 3,000–5,000 chat messages).

## What you'll need

1. A **GitHub account** (free) — Render deploys from a GitHub repo.
2. A **Render account** (free) — sign up at https://render.com with GitHub.
3. A **free Google AI Studio key** — https://aistudio.google.com/apikey → sign in with Google → "Create API key". Copy it; you'll paste it into Render (never into chat or code).

## Step 1 — Put the code on GitHub

```bash
cd ~/workspace/chatverse
git init
git add -A
git commit -m "Chatverse shared server"
# create an empty repo on github.com (no README), then:
git remote add origin https://github.com/YOUR-USERNAME/chatverse.git
git push -u origin main
```

> If `git push` asks for a password, use a GitHub personal access token, not your password.

## Step 2 — Create the Render web service

1. Go to https://dashboard.render.com → **New +** → **Web Service**.
2. Connect your GitHub and pick the `chatverse` repo.
3. Settings:
   - **Name:** `chatverse` (becomes `chatverse.onrender.com`)
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
4. Under **Environment variables**, add:
   - `GOOGLE_AI_API_KEY` → paste your Google AI Studio key
   - `GEMINI_MODEL` → `gemini-2.5-flash` (default is fine)
   - `DAILY_CHAT_CAP` → `100` (default is fine; raise/lower anytime)
   - (Render sets `PORT` automatically — don't add it yourself.)
5. Click **Deploy**. First deploy takes a few minutes.

## Step 3 — Check it's alive

Open `https://chatverse.onrender.com/api/health` — you should see:

```json
{"ok":true,"aiConfigured":true,"dailyCap":100,"model":"gemini-2.5-flash"}
```

Then open `https://chatverse.onrender.com` on your phone, pick a display name, and chat with Mic Drop Milo. 🎤

## Step 4 — Share it

Send the crew the URL: `https://chatverse.onrender.com`
Nobody needs an account or a key — they just open the link, pick a name, and chat. Characters anyone creates show up for everyone.

## Good to know

- **Free-tier sleep:** Render's free tier spins down after ~15 minutes of no traffic; the first visitor of the day waits ~30 seconds while it wakes up. That's the tradeoff for $0.
- **Data:** characters and daily usage counts live in `data/*.json` on the server's disk. On the free tier, disk is ephemeral — if Render restarts the service, community-created characters reset to the 5 starters. (Upgrading to a paid instance with a persistent disk fixes this later.)
- **Changing the cap:** edit the `DAILY_CHAT_CAP` env var in Render → it redeploys automatically.
- **Rotating the key:** paste a new `GOOGLE_AI_API_KEY` in Render anytime; the old one stops working immediately.
- **Never** put the API key in the code, in GitHub, or in chat — env vars only.
