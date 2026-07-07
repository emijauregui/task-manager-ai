# Manual Ticket Calibration Samples v1

Purpose: local documentation dataset for calibrating the future ticket engine v8.

Source: manual Draftea tickets provided by the user.

Scope:
- Calibration only.
- No automated model training yet.
- No betting logic changes in this phase.
- Do not treat unresolved/live tickets as settled results.

## Tickets

### T1

- sport: MLB
- status: live_or_unresolved
- stake: 100
- odds: 3.35
- potentialPayout: 335
- createdAtText: `06/Jul (15:23)`
- game: Padres vs Diamondbacks
- scoreAtCapture: Padres 0, Diamondbacks 6

Legs:
- Spread SD +1.5
- Total Runs Over 6.5
- Walker Buehler strikeouts Over 3.5

Notes:
- Ticket live/in-progress.
- Useful for Event Timing Filter and live-risk guard.
- Do not use as settled result unless final result is provided.

### T2

- sport: MLB
- status: lost
- stake: 65
- odds: 3.07
- potentialPayout: 199.55
- createdAtText: `03/Jul (23:28)`
- game: Braves 14, Mets 3

Legs:
- Mets +2.5 spread: lost
- Francisco Lindor total bases 1.0+: won, result 2.0
- Sean Manaea strikeouts over 4.5: lost, result 4.0

Notes:
- Same-game exposure.
- Spread was crushed by blowout.
- Pitcher K missed by 0.5.

### T3

- sport: MLB
- status: lost
- stake: 58
- odds: 3.44
- potentialPayout: 199.52
- createdAtText: `03/Jul (16:36)`

Legs:
- Jarren Duran hits 1.0+: lost, result 0.0, odds 1.56
- Brice Turang hits 1.0+: won, result 3.0, odds 1.33
- Luis Castillo strikeouts over 4.5: lost, result 4.0, odds 1.66

Notes:
- Multi-game player props.
- Two misses, one by 0.5.
- Useful for player prop volatility and K-line caution.

### T4

- sport: MLB
- status: won
- stake: 100
- odds: 1.71
- payout: 171
- createdAtText: `02/Jul (18:33)`

Legs:
- Mariners moneyline: won
- Julio Rodriguez total bases 1.0+: void/salvado
- Freddie Freeman total bases 1.0+: won, result 1.0

Notes:
- Reduced multiplier / void handling.
- Conservative active legs.

### T5

- sport: NFL
- status: won
- stake: 50
- odds: 3.99
- payout: 199.50
- createdAtText: `29/Dec (23:37)`
- game: 49ers 34, Lions 40

Legs:
- Lions moneyline: won, odds 1.56
- Jake Bates field goals made over 1.5: won, result 2.0, odds 1.83
- Jahmyr Gibbs rush + receiving touchdowns over 0.5: won, result 1.0, odds 1.40

Notes:
- Positive same-team correlation.
- Useful for aggressive/free-bet mode, not MLB core.

### T6

- sport: mixed
- status: won
- stake: 100
- odds: 1.62
- payout: 162
- createdAtText: `23/Jun (00:23)`

Legs:
- Tennis winner J. Fearnley: canceled
- Marlins moneyline: won, odds 1.62

Notes:
- Cancelado/void leg.
- Reduced active legs settlement.

### T7

- sport: NFL
- status: won
- stake: 50
- odds: 3.22
- payout: 161
- createdAtText: `03/Jan (22:19)`
- game: Ravens 35, Browns 10

Legs:
- Ravens moneyline: won, odds 1.02
- Derrick Henry rush yards over 89.5: won, result 138.0, odds 1.88
- Lamar Jackson pass TDs over 1.5: won, result 2.0, odds 1.68

Notes:
- Same-game correlation.
- Very low odds leg 1.02 adds little value and should be penalized in future engine.

## Derived Engine Lessons

- Ticket Seguro must reject in-progress games.
- Ticket Seguro should penalize same-game correlation.
- Estilo Emi may allow positive correlation with explicit warning.
- Free Bet may allow higher correlation/upside.
- Reject or heavily penalize odds contribution below 1.10 unless there is a special reason.
- Pitcher strikeout props near 0.5 margins require matchup/lineup/context confidence.
- Hits and total bases 1.0+ require lineup confirmation.
- Void/salvado/cancelado must reduce multiplier, not count as loss.
- Manual dataset is for calibration only, not model training automation yet.
