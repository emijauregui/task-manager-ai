# Draftea MLB Rules Engine

This document captures the MLB-specific constraints enforced by `drafteaRulesService`.

## Core rules

1. Do not allow more than one MLB player prop from the same team inside the same ticket.
2. Player props require a starting-lineup check.
3. If lineup confidence is unknown, player props stay medium/high risk and are not preferred for `Ticket Seguro`.
4. Money Line is preferred for conservative tickets because it includes extra innings.
5. Spreads and totals carry `voidRisk: medium` because Draftea can void them if the game does not finish.
6. Pitcher changes do not auto-void a pick, but they lower confidence.
7. Postponed, cancelled, suspended, final, live, or otherwise non-bettable games are excluded.
8. Alternative integer props like `1+ hit` or `1+ base total` are valid, but still respect the one-player-prop-per-team-per-ticket rule.

## Candidate annotations

Each candidate can receive:

- `candidateType`: `game_market` or `player_prop`
- `candidateTeam`
- `lineupRequired`
- `lineupConfidence`
- `voidRisk`
- `safeEligible`
- `drafteaCompliant`
- `ruleWarnings`

## Ticket post-validation

After Claude returns JSON, the post-parse validator:

1. Removes duplicate player props from the same MLB team inside a single ticket.
2. Keeps the strongest version of that prop cluster.
3. Tries to keep `Ticket Seguro` centered on Money Line when a valid replacement exists.
4. Marks the ticket unavailable if nothing Draftea-compliant remains.

## Debug expectations

`/api/daily-ticket/debug-candidates` should surface:

- player props grouped by team
- same-team prop rejections when applicable
- low/medium/high void-risk counts
