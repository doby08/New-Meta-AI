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

## Enable real OpenAI (optional but recommended)

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
