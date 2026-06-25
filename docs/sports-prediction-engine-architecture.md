# Sports Prediction Engine Architecture

## Purpose

This project already has a working MLB-first flow under `Daily Ticket AI`.
The goal of this architecture is not to rewrite that flow today. The goal is to
prepare the codebase to grow into a modular `Sports Prediction Engine` that can
support MLB now and sports like soccer, NBA, NFL, NHL, or UFC later.

The current MLB flow must remain stable while the architecture becomes easier to
extend.

## Current Architecture

Today the main generation path lives in `backend/services/dailyTicketService.js`.
That service orchestrates the full pipeline:

1. Read cached tickets and status.
2. Fetch MLB odds and player props from `oddsService`.
3. Fetch MLB scoreboard context from `espnService`.
4. Validate player/team integrity with `mlbStatsService`.
5. Apply `drafteaRulesService`.
6. Apply enrichment and intelligence layers:
   - `marketProtectionService`
   - `confidenceEngine`
   - `outcomeLearningService`
   - `pickEnrichmentService`
   - `marketMixService`
7. Build prompt candidates for Bedrock.
8. Generate or rebuild tickets.
9. Sanitize confidence, props, and final `why`.
10. Cache the ticket.

This works well for MLB, but the orchestration is still highly sport-aware.

## Why Modularize

Modularization solves these problems:

- MLB-specific assumptions are mixed with cross-sport ticket logic.
- It is hard to add soccer or NBA without touching a large MLB-oriented file.
- Rules, data providers, and normalization are not yet separated by intent.
- Future provider changes should not require rewriting the generator core.
- A generic sports engine should reuse intelligence layers without copying logic.

## Target Architecture

The long-term architecture should evolve into these layers:

### 1. Data Layer

Provider-specific data fetchers.

- ESPN
- MLB Stats
- The Odds API
- API-Football in the future
- Other league APIs in the future

Responsibilities:

- Fetch raw data
- Cache provider payloads
- Handle quota, stale cache, and provider-specific failures

### 2. Sport Adapter Layer

One adapter per sport.

- `mlbAdapter`
- `soccerAdapter`
- `nbaAdapter`
- `nflAdapter`

Responsibilities:

- Know which providers belong to that sport
- Fetch the sport's games, odds, and props
- Expose sport rules and supported markets
- Act as the boundary between raw provider data and normalized engine data

### 3. Normalization Layer

Convert provider-shaped payloads into a common engine format.

Responsibilities:

- Normalize game identity
- Normalize candidate identity
- Normalize market categories
- Normalize player/team references
- Preserve metadata needed by intelligence and rules

### 4. Intelligence Layer

Reusable cross-sport scoring and enrichment logic where possible.

Current modules already aligned with this layer:

- `confidenceEngine`
- `marketProtectionService`
- `outcomeLearningService`
- `pickEnrichmentService`

Some logic will remain sport-aware inside these modules, but the layer itself
should be reusable.

### 5. Rules Layer

Validation and platform-specific constraints.

Examples:

- Draftea rules
- Sport-specific risk rules
- Betting platform constraints
- One-pick-per-game or correlation rules

### 6. Ticket Generator Layer

Builds ticket types from normalized and enriched candidates.

- Safe
- Estilo Emi
- Free Bet

This layer should become increasingly sport-agnostic, relying on adapters,
normalizers, and rules to provide the sport context.

### 7. API Layer

Presentation endpoints for frontend and clients.

Current:

- `/api/daily-ticket/*`

Future:

- `/api/sports-ticket/:sport/*`
- keep `/api/daily-ticket/*` as MLB alias during migration

## What Is MLB-Specific Today

These modules or behaviors are primarily MLB-specific:

- `mlbStatsService`
- MLB event props flow in `oddsService`
- ESPN MLB scoreboard mapping in `espnService`
- Draftea MLB prop rules
- MLB-specific market categories such as:
  - `pitcher_strikeouts`
  - `batter_hits`
  - `batter_total_bases`
  - `batter_runs_scored`
  - `batter_rbis`
  - `batter_home_runs`
- MLB game status assumptions and lineup checks
- MLB-oriented prompt language in `dailyTicketService`

## What Should Become Generic

These modules should move toward generic engine behavior:

- candidate normalization helpers
- prompt candidate assembly
- confidence thresholds by ticket type
- one-pick-per-game enforcement
- market diversity enforcement
- fallback ticket construction
- cache-aware ticket response shaping
- final confidence sanitization
- final `why` sanitization

The goal is not to eliminate sport rules, but to isolate them from the generic
ticket pipeline.

## What Should Stay Sport-Specific

These areas should remain sport-specific even in the future:

- provider combinations per sport
- sport market taxonomy
- player/team integrity validation
- lineup or starter confidence
- sport-specific void rules
- platform restrictions that apply only to a sport
- prompt guidance for risky market families

## Current Data Flow

### Generate Flow

1. Frontend calls `/api/daily-ticket/generate`.
2. `dailyTicketService` checks cache.
3. `oddsService` gets MLB game odds and MLB event props.
4. `espnService` gets scoreboard context.
5. `mlbStatsService` resolves player-team-game integrity.
6. `drafteaRulesService` filters or annotates candidates.
7. Intelligence and market mix score the candidates.
8. Bedrock receives a compact prompt with curated candidates.
9. Ticket is validated, sanitized, and cached.

### Dashboard Flow

1. Frontend calls `/api/daily-ticket/dashboard`.
2. Dashboard reads cache and ESPN only.
3. No Bedrock call.
4. No expensive The Odds API call.

## Future Data Flow

The future flow should become:

1. API endpoint selects a sport.
2. `sportsTicketService` asks the sport adapter for:
   - games
   - odds
   - props
   - sport rules
3. Normalization layer converts raw sport/provider payloads into common
   candidates.
4. Intelligence layer scores normalized candidates.
5. Rules layer validates candidates and tickets.
6. Ticket generator builds Safe, Emi, and Free Bet.
7. API layer returns the result in the same frontend-friendly shape.

## How Soccer Can Fit Later

The next likely extension is soccer with `API-Football`.

Expected adapter:

- `backend/services/sports/adapters/soccerAdapter.js`

Expected provider mix:

- `footballService`
- ESPN soccer scoreboard where useful
- The Odds API for game odds if available

Likely sport-specific logic:

- fixture status and match clock handling
- draw-aware markets
- team totals and over/under behavior
- player props if provider supports them
- bookmaker/platform rules that differ from MLB

The key design principle is: soccer should plug into the same generator layers
through a sport adapter and normalized candidates, not by duplicating the MLB
service.

## Transitional Strategy

The current implementation should remain source-of-truth for live MLB behavior.
The new `sports/` folder is an additive foundation:

- adapter contract
- MLB adapter wrapper
- normalization helpers
- docs and migration plan

No endpoint behavior should change during this step.

## Success Criteria For This Phase

- Current MLB endpoints continue to behave the same.
- Architecture for future sports is documented.
- New sport adapters have a clear contract.
- MLB services are wrapped in an adapter without replacing the live flow.
- Future migration can happen incrementally instead of in one rewrite.
