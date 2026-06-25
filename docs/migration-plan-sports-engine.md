# Migration Plan: Sports Prediction Engine

## Goal

Evolve the current MLB-first `Daily Ticket AI` into a generic
`Sports Prediction Engine` without breaking working MLB endpoints.

The migration should be additive, reversible, and incremental.

## Phase 1: Foundation Without Behavior Changes

Status for this task:

- Keep `dailyTicketService` as the active orchestrator.
- Create `backend/services/sports/`.
- Add adapter contract documentation.
- Add `mlbAdapter` as a wrapper around existing MLB services.
- Add normalization helpers for future shared candidate shape.
- Do not change endpoint behavior.
- Do not change frontend contract.

Expected outcome:

- Current endpoints continue working:
  - `/api/daily-ticket/generate`
  - `/api/daily-ticket/debug-candidates`
  - `/api/daily-ticket/dashboard`
- Architecture is clearer for future sports.

## Phase 2: Normalize MLB Candidate Creation

Target work:

- Move MLB candidate-shape creation toward `normalizedCandidateService`.
- Keep current ticket output identical.
- Introduce normalization helpers gradually inside `dailyTicketService`,
  `oddsService`, or adapter wrappers.
- Keep all current logs and cache behavior stable.

Expected outcome:

- MLB candidates use a common shape internally.
- Intelligence and rules become easier to reuse with other sports.

## Phase 3: Add Soccer Adapter

Target work:

- Create `soccerAdapter` using:
  - `footballService`
  - ESPN soccer data where useful
  - The Odds API where available
- Map soccer fixtures, teams, and markets into normalized candidates.
- Reuse:
  - `confidenceEngine`
  - `marketMixService`
  - `pickEnrichmentService`
  - generic sanitizers

Expected outcome:

- Soccer generation can exist behind a new experimental endpoint.
- MLB remains untouched.

## Phase 4: Introduce Generic sportsTicketService

Target work:

- Create a generic orchestration service such as
  `backend/services/sportsTicketService.js`.
- Accept a sport key, then delegate to the relevant adapter.
- Move common flow from `dailyTicketService` into generic helpers:
  - cache checks
  - prompt candidate preparation
  - Bedrock call
  - rebuild fallback
  - final sanitizers

Expected outcome:

- `/api/daily-ticket/*` can become an MLB alias over the generic service.
- New endpoints can be introduced, for example:
  - `/api/sports-ticket/mlb/generate`
  - `/api/sports-ticket/soccer/generate`

## Phase 5: Outcome Learning With Real User History

Target work:

- Persist ticket outcomes and results beyond cache-only behavior.
- Attach user or session history to `outcomeLearningService`.
- Add sport-aware learning signals.
- Keep privacy and quota controls clear.

Expected outcome:

- Candidate scoring uses actual past ticket outcomes.
- Learning can improve by sport and market family.

## Guardrails For Every Phase

- Do not break working MLB live flow.
- Do not expose API keys.
- Do not remove cache protections.
- Do not make dashboard more expensive.
- Do not force a React or frontend rewrite.
- Do not migrate everything in one pass.

## Recommended Order Of Refactors

1. Introduce adapters and normalizers.
2. Move candidate shaping behind helpers.
3. Move generic prompt assembly behind helpers.
4. Move generic post-validation behind helpers.
5. Add a second sport experimentally.
6. Only then promote a generic sports service.

## Definition Of Done For Migration Readiness

The project is ready for multi-sport growth when:

- each sport has an adapter
- normalized candidate helpers are reused
- intelligence layers consume common candidate fields
- rules can be added per sport
- API endpoints can select a sport without branching all over the codebase
