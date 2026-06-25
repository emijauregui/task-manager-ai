# MLB Outcome Learning

## Objetivo

`MLB Outcome Learning` agrega una capa ligera de aprendizaje historico sobre el
motor actual de Daily Ticket AI.

No reemplaza el generador.
No bloquea picks por si sola.
No cambia endpoints principales.

Su funcion actual es:

- guardar tickets MLB manuales y generados
- resumir patrones de fallo y exposicion
- aplicar ajustes conservadores a `confidenceScore`, `valueScore` y `riskFlags`

## Archivos de datos

Los datos viven en:

- `backend/data/mlb-ticket-history.json`
- `backend/data/mlb-generated-ticket-results.json`

### `mlb-ticket-history.json`

Guarda tickets historicos agregados manualmente o desde fuentes propias del
usuario, siempre en formato estructurado y sin secretos.

### `mlb-generated-ticket-results.json`

Guarda una copia ligera de tickets generados por el sistema para evaluacion
posterior.

No guarda el cache completo ni payloads grandes de proveedores.

## Como agregar tickets manuales

Endpoint:

- `POST /api/daily-ticket/history/manual`

Solo esta habilitado cuando `NODE_ENV !== "production"`.

Formato esperado:

```json
{
  "id": "manual-20260625-001",
  "source": "manual",
  "date": "2026-06-25",
  "ticketType": "emi",
  "stake": 50,
  "potentialPayout": 220,
  "odds": "4.4x",
  "status": "lost",
  "legs": [
    {
      "game": "Athletics vs Giants",
      "team": "Athletics",
      "player": "",
      "market": "h2h",
      "marketCategory": "moneyline",
      "pick": "Athletics ML",
      "odds": "2.05",
      "result": "lost",
      "lostByMargin": 1,
      "wouldProtectedSpreadHaveWon": true,
      "lineupIssue": false,
      "notes": "ML fragil en juego cerrado"
    }
  ],
  "lessons": ["Preferir +1.5 en juegos cerrados"],
  "tags": ["close-game", "moneyline"]
}
```

## Endpoints nuevos

- `GET /api/daily-ticket/history/summary`
- `GET /api/daily-ticket/history/manual`
- `POST /api/daily-ticket/history/manual`

## Que aprende hoy

La capa actual detecta patrones conservadores como:

- Money Line perdido por una carrera
- casos donde `+1.5` habria protegido mejor que ML
- parlays largos que caen por una sola leg
- player props con riesgo de lineup no confirmado
- spreads `-1.5` de mayor riesgo
- home runs como props demasiado agresivas
- favoritos ML de cuota baja con poco valor
- totals con contexto insuficiente
- exposicion repetida a equipos o jugadores con historial flojo

## Como afecta `confidenceScore`

El efecto actual es deliberadamente pequeno:

- penalizaciones tipicas entre `-3` y `-8`
- boosts pequenos a spreads protegidos si el historial lo respalda
- baja ligera en `valueScore` para equipos/jugadores sobreexpuestos en tickets perdidos
- mas `riskFlags` y `evidence` para explicar el ajuste

Ejemplos de evidencia:

- `Historical pattern: ML one-run loss risk.`
- `Historical pattern: protected spread preferred.`
- `Historical pattern: player prop requires lineup confirmation.`
- `Historical pattern: long parlay exposure.`

## Que NO hace todavia

Todavia no:

- cierra o bloquea picks automaticamente por historial
- recalifica resultados reales de tickets generados
- consume screenshots o OCR
- usa base de datos persistente
- aprende por usuario o sesion
- modifica Bedrock prompts segun un perfil historico profundo

## Como se evaluaran tickets generados despues

La idea es usar `mlb-generated-ticket-results.json` como registro ligero para:

- saber que mercados se generaron
- medir que tan seguido aparecen props, ML, spreads y totals
- cruzar esos tickets con resultados reales despues
- alimentar una futura fase mas fuerte de `Outcome Learning`

## Recomendacion operativa

Primero carga algunos tickets historicos manuales bien estructurados.
Despues deja que el motor siga guardando tickets generados de forma ligera.

Con eso, el ajuste historico empieza a ser util sin volver agresivo el modelo.
