# CLAUDE.md

Compact context for Claude Code / Antigravity before React Migration.

## 1. Project Summary
Daily Ticket AI is an MLB picks, scoreboard, ticket builder, and history app.

- Backend: Express in `backend/`.
- Current frontend: vanilla HTML/CSS/JS in `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`.
- Current product surface: Ballpark Betting Desk with ticket slips, scorebug scoreboard, AI Lean, and archive slips.

## 2. Current Phase
- Chosen route: Ruta B.
- Closed phase: Frontend Art Direction v12.1.
- Current phase: Docs v1.
- Next phase: React Migration v1 - Foundation.
- Later phases: React App Shell, Daily Ticket React, Scoreboard React, History React, Standings, All-Star Mode, Premium Animations, then Engine Training Foundation.

## 3. Safety Rules
- Do not touch `backend/` or `.env` unless explicitly requested.
- Never expose API keys or credentials.
- `ODDS_API_LIVE_ENABLED=false` by default.
- Dashboard and Scoreboard must not call Bedrock or The Odds API live.
- Generate may call Bedrock only after an explicit user action.
- The Odds API live requires both `confirmLive` and `ODDS_API_LIVE_ENABLED=true`.
- Do not use `git add .`.
- Do not auto-commit.

## 4. Important Endpoints
- `GET /api/daily-ticket/today`
- `GET /api/daily-ticket/dashboard`
- `POST /api/daily-ticket/generate`
- `GET /api/mlb/scoreboard`
- `GET /api/daily-ticket/odds/guard`
- `GET /api/daily-ticket/history/summary`
- `GET /api/daily-ticket/history/patterns`

## 5. Frontend Current Features
Hash navigation:

- `#dashboard`
- `#daily-ticket`
- `#scoreboard`
- `#history`
- `#debug-props`
- `#tasks`

Current views:

- Dashboard: Daily Slate Desk + desk chrome.
- Daily Ticket: selector cards + selected bet slip + leg details + team/player visual fallback.
- Scoreboard: tabs + game cards + AI Lean + Ver tendencias.
- History: metrics + filters + archive slip cards.
- Assets live in `frontend/assets/`.

## 6. Visual Identity
Name: Ballpark Betting Desk.

- Avoid a generic AI dashboard look.
- Use sports desk, ticket booth, sportsbook receipt, and MLB scoreboard cues.
- Preserve navy, cream, amber, and green scoreboard accents.
- Avoid excessive glow, glassmorphism, and purple/blue AI blobs.
- Keep the UI fast, compact, and premium.

## 7. React Migration Goal
- Migrate the vanilla frontend to React + Vite in controlled phases.
- Do not rewrite everything blindly.
- Preserve current design and behavior.
- Improve component structure, animations, maintainability, and performance.
- Keep compatibility with the current backend and Netlify.

## 8. Suggested React Structure
Files:

- `frontend/src/main.jsx`
- `frontend/src/App.jsx`
- `frontend/src/services/api.js`
- `frontend/src/hooks/`
- `frontend/src/components/`
- `frontend/src/views/`
- `frontend/src/styles/`

Views:

- `DashboardView`
- `DailyTicketView`
- `ScoreboardView`
- `HistoryView`
- `DebugPropsView`
- `TasksView`

Components:

- `AppShell`
- `Sidebar`
- `DeskChrome`
- `BetSlip`
- `TicketSelector`
- `LegRow`
- `ScoreboardGameCard`
- `AiLeanPanel`
- `HistorySlipCard`
- `StandingsTable` future
- `AllStarPanel` future

## 9. Validation Commands
Vanilla phase:

```bash
node --check frontend/app.js
```

React phase:

```bash
npm install
npm run dev
npm run build
git status --short
```

Safety check:

```bash
curl -s http://localhost:3000/api/daily-ticket/odds/guard
```

## 10. Development Rules
- Prefer small phases.
- Report files touched.
- Report validation results.
- Do not auto-commit.
- Do not use `git add .`.
- Preserve current behavior before adding new features.
- Do not start Engine Training until the React Migration route is completed or explicitly requested.
