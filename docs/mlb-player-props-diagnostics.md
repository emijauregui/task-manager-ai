# MLB Player Props Diagnostics

Este documento describe la capa de observabilidad para player props MLB sin cambiar el comportamiento de `Daily Ticket AI`.

## Que diagnostica

El diagnostico sigue el pipeline completo de props MLB:

1. `Feed`
   Cuenta cuantas props llegaron desde The Odds API por flujo `event_level_markets`.
2. `Roster`
   Cuenta cuantas props sobrevivieron la validacion de jugador-equipo-evento.
3. `Status`
   Cuenta cuantas props siguen vivas despues del filtro de estado del juego.
4. `Time`
   Cuenta cuantas props siguen vivas despues del time lock.
5. `Odds`
   Cuenta cuantas props pasan las reglas de momios.
6. `Prompt`
   Cuenta cuantas props llegaron al prompt final.
7. `Final Ticket`
   Cuenta cuantas props terminaron en el ticket cacheado para esa fecha.

## Endpoints

### `GET /api/odds/mlb/player-props/diagnostics`

Query params opcionales:

- `date=YYYY-MM-DD`
- `useLive=true|false`
- `limitEvents=number`

Notas:

- Por default usa cache y evita gastar The Odds API.
- Solo usa live cuando `useLive=true`.
- Si `ODDS_API_LIVE_ENABLED=false`, el endpoint intenta responder desde cache.

Respuesta resumida:

```json
{
  "targetDate": "2026-06-25",
  "feed": {
    "eventsFound": 9,
    "eventsWithMarkets": 7,
    "eventsWithProps": 5,
    "totalPropsFetched": 1369
  },
  "pipeline": {
    "eligibleRaw": 1369,
    "afterRosterValidation": 1324,
    "afterStatusFilter": 1100,
    "afterTimeFilter": 955,
    "afterOddsFilter": 846,
    "promptCandidates": 2,
    "finalTicketProps": 3
  }
}
```

### `GET /api/odds/mlb/player-props/game/:eventId`

Devuelve todas las props detectadas para un juego especifico.

Campos relevantes por prop:

- `game`
- `eventId`
- `startTime`
- `market`
- `player`
- `team`
- `pick`
- `line`
- `odds`
- `decimalOdds`
- `eligible`
- `rejectedReason`
- `voidRisk`
- `lineupRequired`
- `teamResolved`
- `oddsVerified`

### `GET /api/odds/mlb/player-props/player/:player`

Ejemplo:

```txt
GET /api/odds/mlb/player-props/player/Alec%20Bohm
```

Devuelve props, juegos, mercados y picks asociados al jugador.

## Como leer `rejectedReasons`

Codigos actuales:

- `player_not_on_roster`
  El jugador no pertenece a ninguno de los equipos del evento.
- `team_unresolved`
  No se pudo resolver el equipo real del jugador.
- `lineup_required`
  La prop requiere confirmacion adicional de lineup o pitcher.
- `game_started`
  La prop se bloqueo por estado live/final o por time lock.
- `odds_filter`
  La prop no paso reglas de momios validos.
- `duplicate_player`
  La prop choca con reglas tipo Draftea de props correlacionadas.
- `market_rules`
  La prop fue descartada por reglas de correlacion o elegibilidad del pipeline.

## Como usarlo sin gastar The Odds API

Usa:

```txt
GET /api/odds/mlb/player-props/diagnostics
```

o:

```txt
GET /api/odds/mlb/player-props/diagnostics?date=2026-06-25
```

Ese flujo intenta responder desde cache primero. Si no hay cache disponible y live esta apagado, el endpoint devuelve warning controlado.

## Como usarlo con live de forma controlada

Solo cuando realmente quieras refrescar feed live:

```txt
GET /api/odds/mlb/player-props/diagnostics?useLive=true&limitEvents=3
```

Recomendaciones:

- Mantener `limitEvents` bajo.
- Usar live solo para diagnostico puntual.
- Revisar `oddsSource`, `warning` y `quotaReached` en la respuesta.

## Props bloqueadas por horario

Cuando el diagnostico devuelve:

- `propsAvailabilityStatus: "blocked_by_time"`
- `humanSummary.status: "blocked_by_time"`

significa que:

- si llegaron props al feed,
- si pasaron la validacion de roster,
- pero ya no quedo ninguna utilizable porque el juego empezo o entro al `time lock`.

Ejemplo tipico:

```json
{
  "feed": {
    "totalPropsFetched": 624
  },
  "pipeline": {
    "afterRosterValidation": 614,
    "afterStatusFilter": 614,
    "afterTimeFilter": 0,
    "promptCandidates": 0
  },
  "propsAvailabilityStatus": "blocked_by_time"
}
```

Eso no cambia picks ni reordena el generador. Solo explica por que hubo props en el feed pero `0` props llegaron al prompt o al ticket final.

Campos utiles:

- `propsAvailabilityMessage`
  Mensaje humano corto del bloqueo.
- `propsAvailabilityDetails`
  Incluye cuantas props llegaron, cuantas pasaron roster y cuantas quedaron bloqueadas por tiempo.
- `humanSummary`
  Resume el estado con titulo, mensaje y recomendacion.

Como evitarlo:

- genera el ticket antes del primer juego del slate,
- o usa una fecha futura,
- o revisa el diagnostico con `useLive=true&limitEvents=3` antes de que inicien los juegos.

## Frontend debug

La UI incluye un panel dev-only de Player Props Pipeline:

- Se muestra en `localhost`, `127.0.0.1` o con `?debug=props`.
- No altera el dashboard principal.
- No ejecuta `generate`.
- Usa el endpoint de diagnostico en modo cache-first por default.
