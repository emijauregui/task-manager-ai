# Daily Ticket AI Backend Handoff v1

Fecha: 2026-07-06

Este documento resume el estado real del backend de Daily Ticket AI despues de las fases recientes. Su objetivo es permitir continuar el desarrollo del motor v8 sin depender del contexto del chat.

## 1. Estado actual del repo

Repo: `C:\dev\task-manager-ai`

Estado observado al crear este handoff:

```text
git status --short --untracked-files=all
# limpio
```

La rama actual ya contiene commits recientes para frontend polish, scoreboard live situation, Budget Gate v2, dataset manual y Event Timing Filter v2.

## 2. Ultimos commits importantes

```text
3ffc0e8 feat(backend): add event timing filter v2 [skip netlify]
0280a29 docs(tickets): add manual calibration samples v1 [skip netlify]
608261d feat(backend): add Odds API budget gate v2 [skip netlify]
a990c49 feat(scoreboard): enrich and render live game situation [skip netlify]
4454f0d style(frontend): finalize app shell history and scoreboard polish [skip netlify]
d1dd550 fix(frontend): polish Daily Ticket visual QA leftovers [skip netlify]
cb36b21 style(frontend): finalize Daily Ticket premium visual system [skip netlify]
e356add fix(backend): alias fallback ticket for today lookup [skip netlify]
```

## 3. Rutas principales

- `backend/services/oddsService.js`
  - Odds API cache-first service.
  - Budget Gate v2.
  - Per-market request estimation.
  - Local ledger for estimated/actual usage.
  - Guard status helpers.

- `backend/services/dailyTicketService.js`
  - Main Daily Ticket generation pipeline.
  - Candidate enrichment.
  - Draftea rules, market mix, confidence, historical context.
  - Event Timing Filter v2 integration.
  - Cache aliasing for fallback-to-tomorrow tickets.

- `backend/services/eventTimingFilterService.js`
  - Central timing gate for live/started/final/postponed/rain delay/cutoff logic.
  - Modes: `safe`, `emi`, `free_bet`.
  - Timezone: `America/Mazatlan`.

- `backend/services/espnService.js`
  - ESPN scoreboard cache.
  - ESPN summary enrichment.
  - MLB StatsAPI live situation enrichment.
  - Mapping ESPN event id to MLB StatsAPI `gamePk`.

- `docs/ticket-calibration/manual-ticket-samples-v1.md`
  - Manual calibration dataset from real user tickets.
  - Calibration only, not automated training.

## 4. Que esta cerrado

- Frontend premium polish for Daily Ticket, History, Scoreboard and shell.
- Scoreboard live situation UI with real B/S/O, bases and innings when backend data exists.
- MLB StatsAPI live situation enrichment for scoreboard.
- Odds API Budget Gate v2.
- Manual Ticket Calibration Dataset v1.
- Event Timing Filter v2 integrated into Daily Ticket candidate selection.
- Fallback ticket aliasing so a tomorrow-cache fallback can also satisfy `/today`.

## 5. Que NO se debe tocar sin una fase explicita

- `.env` and `backend/.env`.
- `package.json` and `package-lock.json`.
- Frontend code during backend-only phases.
- Scoreboard UI when working on Daily Ticket engine.
- ESPN/StatsAPI enrichment unless the task is explicitly scoreboard/backend data.
- Odds API live mode.
- Generate endpoints automatically during validation.

## 6. Reglas duras

- No `git add .`.
- No commits unless the user explicitly asks.
- No `.env` edits.
- No package file edits.
- No Odds API live unless explicitly approved in a future phase.
- No automatic Daily Ticket generate.
- No odds refresh.
- Prefer cache-first validation.
- Keep `ODDS_API_LIVE_ENABLED=false` unless the user explicitly starts a live-odds phase.

## 7. Estado del Budget Gate v2

File: `backend/services/oddsService.js`

Current behavior:

- Counts real Odds API cost by market, not by logical function call.
- Examples:
  - `h2h,spreads,totals` => 3 estimated requests.
  - `1 event x 3 prop markets` => 3 estimated requests.
  - `3 events x 3 prop markets` => 9 estimated requests.
- Supports endpoint types:
  - `sports_odds`
  - `event_props`
  - `events`
  - `event_markets`
  - `sports_list`
  - fallback `unknown`
- Fails closed when:
  - live odds are disabled.
  - markets are missing for market-based endpoints.
  - markets are not allowed.
  - estimated operation cost exceeds limit.
  - daily budget is exhausted.
- Writes local ledger:
  - `backend/cache/odds-api-budget-ledger-YYYY-MM-DD.json`
- Does not store API keys or secrets.
- Diagnostic endpoint:
  - `GET /api/daily-ticket/odds/guard`

Important: dry-run estimation is safe and should not call Odds API.

## 8. Estado del Timing Filter v2

File: `backend/services/eventTimingFilterService.js`

Exports:

- `getCurrentServerTimeContext()`
- `evaluateGameTiming()`
- `filterGamesByTiming()`
- `buildTimingGateSummary()`

Default mode in Daily Ticket generate: `safe`.

Cutoffs:

- `safe`: 20 minutes before first pitch.
- `emi`: 10 minutes before first pitch.
- `free_bet`: 5 minutes before first pitch, with warnings and only higher-risk tolerance when explicitly allowed.

Blocks:

- `game_live`
- `game_started`
- `game_final`
- `game_postponed`
- `game_cancelled`
- `rain_delay`
- `cutoff_expired`
- `missing_start_time` in safe mode
- `unreliable_clock`

Adds metadata through Daily Ticket diagnostics:

- `diagnostics.timingGateSummary`
- `diagnostics.rejectedByTiming`
- `ticket.meta.timingGate`

Current source fields used:

- From Odds/candidates:
  - `eventId`
  - `startTime`
  - `homeTeam`
  - `awayTeam`
  - `game`
  - `market`
  - `pick`

- From ESPN:
  - `gameId`
  - `status`
  - `statusType`
  - `statusDescription`
  - `isLive`
  - `isFinal`
  - `isScheduled`
  - `isPostponed`
  - `inning`
  - `inningHalf`

## 9. Estado del Scoreboard enrichment

File: `backend/services/espnService.js`

Current behavior:

- Primary scoreboard source is ESPN cache/live API.
- ESPN summary enrichment adds metadata when available.
- MLB StatsAPI live feed enrichment adds live situation for live games:
  - `balls`
  - `strikes`
  - `outs`
  - `bases`
  - `onFirst`
  - `onSecond`
  - `onThird`
  - `runners`
  - `situation.source = "mlb_statsapi_live"`
- ESPN event id is mapped to MLB `gamePk` through MLB schedule matching by home/away teams and start time.
- Live enrichment is capped and cached.
- `enrichLiveDetails=false` keeps enrichment off.

Do not confuse StatsAPI enrichment with The Odds API. StatsAPI does not consume Odds API budget.

## 10. Lecciones de tickets reales

Source:

- `docs/ticket-calibration/manual-ticket-samples-v1.md`
- `backend/data/manual-ticket-samples-v1.json` exists locally but may be ignored by git because `backend/data/*.json` is ignored.

Derived lessons:

- Ticket Seguro must reject in-progress games.
- Ticket Seguro should penalize same-game correlation.
- Estilo Emi may allow positive correlation with explicit warning.
- Free Bet may allow higher correlation/upside.
- Odds contribution below `1.10` should be rejected or heavily penalized unless there is a special reason.
- Pitcher strikeout props near 0.5 margins require matchup, lineup and context confidence.
- Hits and total bases `1.0+` require lineup confirmation.
- Void/salvado/cancelado must reduce multiplier and must not count as loss.
- Manual dataset is calibration only, not automated model training yet.

## 11. Roadmap siguiente

Recommended next backend sequence:

1. Odds Ingestion v2
   - Normalize all usable odds payloads into a stable internal format.
   - Keep Budget Gate v2 as the only live gate.

2. Pick Candidate Generator v2
   - Create a candidate layer independent of ticket construction.
   - Include game markets, player props, confidence inputs and timing metadata.

3. Scoring Engine v2
   - Score by confidence, value, timing safety, volatility, odds contribution and market type.
   - Penalize weak low-odds legs and thin edge props.

4. Ticket Builder v2
   - Build safe, emi and free_bet tickets from candidate pools.
   - Avoid direct model dependence for structural constraints.

5. Correlation Guard
   - Penalize or block dangerous same-game combinations.
   - Allow positive correlation in emi/free_bet only with explicit warning.

6. Lineup Gate
   - Require player lineup/probable starter confirmation for player props.
   - Treat unknown lineup as risk or block depending on mode.

7. Explanation Engine v2
   - Generate short user-facing explanations from structured evidence.
   - Avoid raw API details.

8. Settlement v2
   - Standardize won/lost/void/salvado/cancelado handling.
   - Track reduced multipliers.

9. Shadow Mode v2
   - Run candidate/ticket generation without user-facing publication.
   - Log decisions and compare against manual dataset.

10. Daily Ticket Engine v8
   - Integrate ingestion, scoring, guards, builder, explanations and settlement into a safer full engine.

## 12. Comandos para levantar proyecto

Backend:

```bash
cd backend
npm run dev
```

Frontend:

```bash
cd frontend
npm run dev -- --force
```

From repo root, scripts also exist:

```bash
npm run dev-backend
npm run dev -- --force
```

## 13. Comandos de validacion

Odds guard:

```bash
curl -s http://localhost:3000/api/daily-ticket/odds/guard
```

Expected safe state:

```json
{
  "oddsLiveEnabled": false,
  "runtimeMode": "cache_only",
  "budgetGateVersion": "v2"
}
```

Scoreboard:

```bash
curl -s http://localhost:3000/api/mlb/scoreboard
```

Syntax checks:

```bash
node --check backend/services/oddsService.js
node --check backend/services/dailyTicketService.js
node --check backend/services/eventTimingFilterService.js
node --check backend/services/espnService.js
node --check backend/server.js
git diff --check
git status --short
```

Budget dry-run examples:

```bash
curl -s "http://localhost:3000/api/daily-ticket/odds/guard?dryRun=true&endpointType=sports_odds&markets=h2h,spreads,totals"
curl -s "http://localhost:3000/api/daily-ticket/odds/guard?dryRun=true&endpointType=event_props&eventCount=3&markets=batter_hits,batter_total_bases,pitcher_strikeouts"
```

Expected estimates:

- `h2h,spreads,totals` => 3
- `3 events x 3 props` => 9

## 14. Riesgos pendientes

- The Daily Ticket engine still needs a cleaner v8 separation between ingestion, candidate generation, scoring and final ticket building.
- Player prop quality depends on lineup/probable starter confidence and should not be treated as safe without a stronger Lineup Gate.
- Same-game correlation is not yet a standalone guard with mode-specific policies.
- Very low odds legs can inflate perceived confidence while adding little value; Scoring Engine v2 should penalize this.
- Event timing is safer now, but any future live-odds phase must test cache/live boundaries carefully.
- Manual calibration samples are small and should guide rules, not act as statistical proof.
- `backend/data/*.json` is ignored by git; if a JSON dataset must be versioned, adjust strategy deliberately instead of forcing `git add`.
- Do not run live Odds API validation without explicit user approval and a declared budget.
