# AI Assistance Interview System

Premium SaaS-style stakeholder interview platform with AI question generation, answer collection, AI analysis, and summary reports.

## Quick start

1. Install Node.js 18+ (https://nodejs.org)
2. Open a terminal in this folder and run:
   ```
   npm install
   npm start
   ```
3. Open http://localhost:3000
4. Log in with:
   - Username: **Dan**
   - Password: **10231998**

## Field survey (QR + offline PWA) — no login needed

- **Survey page:** `/survey` (installable PWA: `manifest.json` + `sw.js`)
- **QR entry:** `/survey?role=Farmer&lang=Tagalog` — admin generates the QR in-app under **QR Survey Setup** (QR image via free `api.qrserver.com`; the app works even if the QR image CDN is blocked — the link itself still opens)
- **Languages:** Tagalog | English toggle (`interviewerSystemPrompt` / `evaluatorSystemPrompt` in `ai.js`); answers + reports stay in the chosen language
- **Offline flow:** answers save to Dexie.js `ai_survey_offline.outbox` FIRST (`offline-db.js`), then `sync.js` auto-pushes to `/api/survey/submit` when online (`online` event + 30s retry + sync-status badge)
- **Field checklist:** open `/survey` once while online (caches shell + topics + questions), then it works offline in the field

## Dual AI engine (OpenAI → Ollama → local)

1. **Primary:** OpenAI `gpt-4o-mini` when `OPENAI_API_KEY` is set
2. **Fallback:** local Ollama (`OLLAMA_URL`, default `http://localhost:11434/api/generate`, model `OLLAMA_MODEL`, default `llama3`) — install from https://ollama.com then `ollama pull llama3`
3. **Final:** built-in heuristic (`localSurveyQuestions` / `localScoreEvaluation`) — 5 Tagalog/English questions + 1-5 sentiment scoring, so field work never blocks

Survey endpoints (public, no login): `GET /api/survey/topics`, `GET /api/survey/roles`, `POST /api/ai/questions`, `POST /api/ai/evaluate`, `POST /api/survey/submit` (auto-evaluates and stores a 1-5 `ai_reports` row).

## Public dashboard (1-5 scale, no login)

- **Page:** `/public/dashboard` (alias `/reports`) — also mirrored logged-in as **Survey Analytics**
- **Data:** `GET /api/public/analytics`, `GET /api/public/reports` (public read-only)
- **Scale:** 5-Very High · 4-High · 3-Moderate · 2-Low · 1-Very Low (see `SCALE_META` in `db.js`)
- Tables: `stakeholder_topics`, `survey_responses`, `ai_reports` in `data/db.json` (+ Dexie outbox in the browser).

## Enable real OpenAI (optional — interview module)

1. Get a key at https://platform.openai.com/api-keys
2. Copy `.env.example` to `.env` and fill in:
   ```
   OPENAI_API_KEY=sk-your-key-here
   OPENAI_MODEL=gpt-4o-mini
   ```
3. Restart the server. The top bar badge switches from
   "Built-in Smart" to "OpenAI", and question generation,
   suggestions, and reports use OpenAI.
4. Without a key the app still works fully using its
   built-in adaptive generator (title + stakeholders aware).

## Features

- Session login/logout, bcrypt password hashing, protected routes
- Dashboard with live stat cards + 14-day interactive line chart
- Create Interview (any title + stakeholders, up to 50 AI questions)
- Q&A walkthrough with Previous / Save / Next, progress bar, jump-to
- Results & Suggestions (AI analysis grounded in real answers)
- History table with search, status filter, view/print only for regular users (edit/delete for administrators only)
- Summary Report with statistics, Q&A recap, view/print only for regular users (edit/delete for administrators only)
- Questions Bank with search, interview + stakeholder filters, pagination
- Profile (display name, email, password change with show/hide)
- Settings (accent theme, pagination, defaults, notifications, AI model)
- Persistent file database in `data/db.json` (survives restarts)
- Toasts, loading states, confirmations, empty states, responsive layout

## Security notes

- Change `ADMIN_PASSWORD` / `SESSION_SECRET` in `.env` for production.
- Never commit `.env` (it is git-ignored). The frontend never sees the key.
