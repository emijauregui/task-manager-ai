# Daily Ticket AI Backend Handoff v2

Fecha: 2026-07-06

Este documento es el handoff principal del backend de Daily Ticket AI. Resume el estado real del motor diagnostico actual y las reglas para continuar hacia Daily Ticket Engine v8 sin depender del contexto del chat.

Repo: `C:\dev\task-manager-ai`

## Current Backend Engine State

El backend ya tiene un pipeline diagnostico cache-only con estas etapas:

1. Odds Guard
2. Odds Ingestion
3. Pick Candidate Generator
4. Scoring Engine
5. Ticket Builder
6. Engine Pipeline Status

El pipeline esta disenado para auditar datos, candidatos, scoring y construccion diagnostica de tickets. No debe publicar picks reales cuando el estado esta bloqueado por odds stale, timing vencido o falta de candidatos confiables.

Modo operativo actual esperado:

- `runtimeMode: "cache_only"`
- `oddsLiveEnabled: false`
- `budgetGateVersion: "v2"`

The Odds API live no debe activarse sin aprobacion explicita del usuario. Cualquier fase live futura debe pasar por Budget Gate v2.

## Backend Diagnostic Endpoints

### `GET /api/daily-ticket/odds/guard`

- Confirma `runtimeMode`, `oddsLiveEnabled`, `budgetGateVersion` y capacidad de usar live odds.
- No llama Odds API live.
- Tambien soporta dry-runs de estimacion de costo por endpoint/mercado/evento.

### `GET /api/daily-ticket/odds/ingestion`

- Normaliza odds desde cache local.
- Devuelve `totalNormalized`, `byMarket`, `byBookmaker`, `freshness`, warnings y samples.
- No hace refresh.
- No llama Odds API live.

### `GET /api/daily-ticket/candidates`

- Genera candidatos cache-only desde odds normalizadas.
- Devuelve candidatos activos/rechazados, `riskTags`, freshness y resumen por tipo de mercado.
- Aplica Timing Filter v2 por default.
- No genera tickets.

### `GET /api/daily-ticket/scoring`

- Scorea candidatos.
- Devuelve `confidenceTier`, `valueTier`, `riskLevel`, `scoringBreakdown`, warnings y samples.
- No genera tickets.

### `GET /api/daily-ticket/ticket-builder`

- Construye tickets diagnosticos por modo: `safe`, `emi`, `free_bet`.
- Puede devolver `no_ticket` si no hay candidatos confiables.
- No inventa picks.
- No llama generate real.

### `GET /api/daily-ticket/engine/status`

- Endpoint unificado del pipeline.
- Junta Odds Guard, Odds Ingestion, Candidates, Scoring y Ticket Builder.
- Devuelve `readiness`, `overallStatus`, `blockers`, `warnings` y `nextRecommendedPhase`.

### `GET /api/mlb/scoreboard`

- Scoreboard MLB con ESPN como fuente principal.
- Enriquecimiento live con MLB StatsAPI cuando aplica.
- Puede exponer bases, balls, strikes, outs, runners e inning/half.
- MLB StatsAPI no consume presupuesto de The Odds API.

## New Backend Services

### `backend/services/oddsIngestionService.js`

- Normaliza odds desde cache.
- Soporta `h2h`, `spreads`, `totals` y player props:
  - `pitcher_strikeouts`
  - `batter_hits`
  - `batter_total_bases`
  - `batter_hits_runs_rbis`
  - `batter_rbis`
  - `batter_runs_scored`
  - `batter_home_runs`
- Marca freshness:
  - `fresh`: last update <= 30 min
  - `stale`: last update > 30 min
  - `unknown`: sin timestamp valido

### `backend/services/pickCandidateGeneratorService.js`

- Convierte odds normalizadas en candidatos.
- Clasifica mercados:
  - `h2h -> team_moneyline`
  - `spreads -> team_spread`
  - `totals -> game_total`
  - `pitcher_strikeouts -> pitcher_prop`
  - `batter_* -> batter_prop`
- Agrega `riskTags`.
- Calcula implied probability desde decimal odds.
- Aplica Timing Filter v2 por default.
- Rechaza solo casos basicos: sin eventId, sin marketKey, precio invalido o mercado no soportado.

### `backend/services/scoringEngineService.js`

- Asigna score `0-100`.
- Asigna `confidenceTier`, `valueTier` y `riskLevel`.
- Aplica penalties por stale odds, unknown freshness, missing data, low value odds, volatility, pitcher K lines, batter props, lineup required y timing blocked.
- No infiere edge real; solo puntua calidad/riesgo diagnostico.

### `backend/services/ticketBuilderService.js`

- Construye tickets diagnosticos por modo:
  - `safe`
  - `emi`
  - `free_bet`
- Devuelve `ticket_candidate` o `no_ticket`.
- Detecta correlacion basica:
  - mismo evento
  - mismo equipo
  - mismo jugador
  - moneyline + player prop mismo equipo
  - total + batter props mismo juego
- No inventa picks si el pool no cumple.

### `backend/services/enginePipelineStatusService.js`

- Orquesta el pipeline completo en modo cache-only.
- Devuelve readiness:
  - `blocked`
  - `diagnostic_ready`
  - `ready`
- Resume blockers y warnings.
- Sirve como panel tecnico backend para revisar salud del motor.

### `backend/services/eventTimingFilterService.js`

- Bloquea juegos live, started, final, postponed, cancelled, rain delay, cutoff expired y missing start time en safe mode.
- Timezone por default: `America/Mazatlan`.
- Modos:
  - `safe`: cutoff 20 min
  - `emi`: cutoff 10 min
  - `free_bet`: cutoff 5 min

## Current Known Runtime Result

Ultimo estado validado del pipeline diagnostico:

```json
{
  "oddsLiveEnabled": false,
  "runtimeMode": "cache_only",
  "budgetGateVersion": "v2",
  "totalNormalized": 7140,
  "freshness": {
    "fresh": 0,
    "stale": 7140,
    "unknown": 0
  },
  "totalCandidates": 7140,
  "activeCandidates": 1,
  "rejectedCandidates": 7139,
  "totalScored": 7140,
  "ticketBuilder": {
    "safe": "no_ticket",
    "emi": "no_ticket",
    "free_bet": "no_ticket"
  },
  "engineReadiness": "blocked"
}
```

Blockers actuales:

- `cache_only_mode`
- `odds_live_disabled`
- `all_odds_stale`
- `no_fresh_odds`
- `timing_gate_blocked_games`
- `no_safe_ticket`
- `ticket_builder_no_ticket`
- `not_enough_candidates`
- `all_candidates_low_score`

Esto es correcto y esperado con odds viejas en cache-only. El motor no debe inventar picks ni sugerir apuestas reales cuando `engine/status` esta blocked.

## Budget Gate v2

Archivo: `backend/services/oddsService.js`

Estado:

- Cuenta costo real por mercado.
- Falla cerrado si live odds no estan habilitadas explicitamente.
- Falla cerrado si faltan markets, si hay markets invalidos, si el costo estimado supera el limite o si el presupuesto diario esta agotado.
- Mantiene ledger local:
  - `backend/cache/odds-api-budget-ledger-YYYY-MM-DD.json`
- Endpoint:
  - `GET /api/daily-ticket/odds/guard`

Dry-runs del guard son seguros y no llaman Odds API live.

## Scoreboard Enrichment

Archivo: `backend/services/espnService.js`

Estado:

- ESPN es la fuente principal del scoreboard.
- ESPN summary agrega metadata de venue/weather/status cuando existe.
- MLB StatsAPI live feed enriquece situacion en vivo:
  - `balls`
  - `strikes`
  - `outs`
  - `bases`
  - `onFirst`
  - `onSecond`
  - `onThird`
  - `runners`
  - `situation.source = "mlb_statsapi_live"`
- Mapping ESPN event id -> MLB `gamePk` se hace por schedule, equipos y start time.
- `enrichLiveDetails=false` apaga enrichment.

No confundir MLB StatsAPI con The Odds API.

## Manual Ticket Calibration Dataset v1

Archivos:

- `docs/ticket-calibration/manual-ticket-samples-v1.md`
- `docs/ticket-calibration/manual-ticket-samples-v1.json`

Lecciones documentadas:

- Ticket Seguro debe rechazar juegos in-progress.
- Ticket Seguro debe penalizar same-game correlation.
- Estilo Emi puede aceptar correlacion positiva con warning explicito.
- Free Bet puede aceptar mas correlacion/upside.
- Odds menores a `1.10` deben rechazarse o penalizarse fuerte.
- Pitcher strikeout props cerca de 0.5 margen requieren contexto de matchup, lineup y workload.
- Hits/TB `1.0+` requieren lineup confirmation.
- Void/salvado/cancelado debe reducir multiplier, no contar como loss.

El dataset es calibracion manual, no training automation.

## Roadmap Siguiente

1. Live Sync Guard v1
   - Detectar desfase ESPN status vs MLB StatsAPI situation.

2. Lineup Gate v1
   - Estados: `lineup_confirmed`, `projected`, `unknown`, `player_not_starting`.

3. Correlation Guard v2
   - Correlacion mas fina por juego/equipo/jugador/mercado.

4. Scoring Engine v2.1
   - Usar lineup, matchup, freshness real y contexto de mercado.

5. Ticket Builder v2.1
   - Construir tickets solo con candidates frescos y timing ok.

6. Explanation Engine v2
   - Razones cortas/largas, `riskFactors`, `dataNotes`.

7. Shadow Mode v2
   - Simular tickets y medir hit rate/ROI sin publicar picks reales.

8. Daily Ticket Engine v8
   - Integrar pipeline completo al generate real.

## Comandos Para Levantar Proyecto

Backend:

```bash
cd /c/dev/task-manager-ai/backend
npm run dev
```

Frontend:

```bash
cd /c/dev/task-manager-ai/frontend
npm run dev -- --force
```

## Comandos De Validacion

Endpoints diagnosticos:

```bash
curl -s http://localhost:3000/api/daily-ticket/odds/guard
curl -s http://localhost:3000/api/daily-ticket/odds/ingestion
curl -s http://localhost:3000/api/daily-ticket/candidates
curl -s http://localhost:3000/api/daily-ticket/scoring
curl -s http://localhost:3000/api/daily-ticket/ticket-builder
curl -s http://localhost:3000/api/daily-ticket/engine/status
curl -s http://localhost:3000/api/mlb/scoreboard
```

Syntax checks:

```bash
node --check backend/services/oddsService.js
node --check backend/services/oddsIngestionService.js
node --check backend/services/pickCandidateGeneratorService.js
node --check backend/services/scoringEngineService.js
node --check backend/services/ticketBuilderService.js
node --check backend/services/enginePipelineStatusService.js
node --check backend/services/eventTimingFilterService.js
node --check backend/services/espnService.js
node --check backend/services/dailyTicketService.js
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

## Reglas Duras Permanentes

- No usar `git add .`.
- No tocar `.env`.
- No tocar `backend/.env`.
- No tocar `package.json`.
- No tocar `package-lock.json`.
- No activar Odds API live sin aprobacion explicita.
- No ejecutar odds refresh sin aprobacion explicita.
- No ejecutar generate automatico.
- No inventar picks si `engine/status` dice `blocked`.
- Si odds estan stale, no sugerir picks reales.
- Todo live odds debe pasar por Budget Gate v2.
- Mantener fases backend-only lejos de frontend salvo instruccion explicita.

## Riesgos Pendientes

- El estado actual esta bloqueado por cache stale y timing; eso no es bug, es proteccion.
- Lineup Gate todavia no existe y es obligatorio antes de confiar en player props.
- Correlation Guard aun es basico; necesita version dedicada.
- Scoring Engine v2 no usa edge real ni matchup profundo.
- Ticket Builder v2 es diagnostico; no debe alimentar tickets reales todavia.
- Shadow Mode debe medir picks simulados antes de integrar a generate real.
- Cualquier refresh live debe ser una fase explicita con presupuesto declarado.
