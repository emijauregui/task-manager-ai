require('dotenv').config();

const cors = require('cors');
const express = require('express');

const bedrockService = require('./services/bedrockService');
const dailyTicketService = require('./services/dailyTicketService');
const enginePipelineStatusService = require('./services/enginePipelineStatusService');
const espnService = require('./services/espnService');
const historicalPatternEngine = require('./services/historicalPatternEngine');
const lineupGateService = require('./services/lineupGateService');
const mlbTicketHistoryService = require('./services/mlbTicketHistoryService');
const oddsIngestionService = require('./services/oddsIngestionService');
const oddsService = require('./services/oddsService');
const playerPropsDiagnosticsService = require('./services/playerPropsDiagnosticsService');
const pickCandidateGeneratorService = require('./services/pickCandidateGeneratorService');
const scoringEngineService = require('./services/scoringEngineService');
const ticketBuilderService = require('./services/ticketBuilderService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && Object.prototype.hasOwnProperty.call(error, 'body')) {
    return res.status(400).json({
      error: 'Invalid JSON payload',
      message: 'Request body is not valid JSON.',
    });
  }

  return next(error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection', {
    message: reason?.message || String(reason),
    name: reason?.name || 'UnknownRejection',
  });
});

process.on('uncaughtException', (error) => {
  console.error('[server] Uncaught exception', {
    message: error.message,
    name: error.name,
  });
});

let tasks = [];
let nextId = 1;

function asyncRoute(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('[server] Request failed', {
        path: req.path,
        method: req.method,
        message: error.message,
        name: error.name,
      });

      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
      });
    }
  };
}

function buildTaskPriorityPrompt(title, description) {
  return `
Analiza esta tarea y sugiere un nivel de prioridad (high, medium, o low) basandote en urgencia, importancia e impacto.

Titulo: ${title}
Descripcion: ${description || 'Sin descripcion'}

Responde SOLO con JSON valido:
{
  "priority": "high|medium|low",
  "reasoning": "explicacion breve"
}
  `.trim();
}

function buildBreakdownPrompt(title, description) {
  return `
Analiza esta tarea y dividela en subtareas accionables, pequenas y claras.

Titulo: ${title}
Descripcion: ${description || 'Sin descripcion'}

Responde SOLO con JSON valido:
{
  "subtasks": [
    {
      "title": "titulo de la subtarea",
      "description": "descripcion breve",
      "priority": "high|medium|low"
    }
  ],
  "reasoning": "explicacion breve"
}
  `.trim();
}

function getBedrockFailureStatus(error) {
  if (/not configured/i.test(error.message)) {
    return 503;
  }

  return 502;
}

function parseBooleanQuery(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is running',
  });
});

app.get('/api/tasks', (req, res) => {
  res.json(tasks);
});

app.get('/api/tasks/:id', (req, res) => {
  const task = tasks.find((item) => item.id === Number(req.params.id));

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  return res.json(task);
});

app.post('/api/tasks', (req, res) => {
  const { title, description, priority, completed } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const task = {
    id: nextId,
    title,
    description: description || '',
    priority: priority || 'medium',
    completed: Boolean(completed),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  tasks.push(task);
  nextId += 1;

  return res.status(201).json(task);
});

app.put('/api/tasks/:id', (req, res) => {
  const index = tasks.findIndex((item) => item.id === Number(req.params.id));

  if (index === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const { title, description, priority, completed } = req.body;
  tasks[index] = {
    ...tasks[index],
    title: title !== undefined ? title : tasks[index].title,
    description: description !== undefined ? description : tasks[index].description,
    priority: priority !== undefined ? priority : tasks[index].priority,
    completed: completed !== undefined ? completed : tasks[index].completed,
    updatedAt: new Date().toISOString(),
  };

  return res.json(tasks[index]);
});

app.delete('/api/tasks/:id', (req, res) => {
  const index = tasks.findIndex((item) => item.id === Number(req.params.id));

  if (index === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  tasks.splice(index, 1);
  return res.status(204).send();
});

app.get('/api/ai/health', asyncRoute(async (req, res) => {
  const health = bedrockService.getHealthStatus();

  if (req.query.test === 'true') {
    if (!health.configured) {
      return res.status(503).json({
        ...health,
        test: {
          ok: false,
          message: 'Bedrock is not fully configured.',
        },
      });
    }

    try {
      const test = await bedrockService.testConnection();
      return res.json({
        ...health,
        test,
      });
    } catch (error) {
      return res.status(502).json({
        ...health,
        test: {
          ok: false,
          message: error.message,
        },
      });
    }
  }

  return res.json(health);
}));

app.post('/api/ai/suggest-priority', asyncRoute(async (req, res) => {
  const { title, description } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const result = await bedrockService.invokeJson({
      system: 'Return valid JSON only.',
      prompt: buildTaskPriorityPrompt(title, description),
      maxTokens: 180,
      temperature: 0.2,
    });

    return res.json({
      priority: result.priority || 'medium',
      reasoning: result.reasoning || 'No reasoning returned by the model.',
    });
  } catch (error) {
    return res.status(getBedrockFailureStatus(error)).json({
      error: 'Failed to suggest priority',
      message: error.message,
      bedrock: bedrockService.getHealthStatus(),
    });
  }
}));

app.post('/api/ai/break-down-task', asyncRoute(async (req, res) => {
  const { title, description } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const result = await bedrockService.invokeJson({
      system: 'Return valid JSON only.',
      prompt: buildBreakdownPrompt(title, description),
      maxTokens: 600,
      temperature: 0.2,
    });

    return res.json({
      subtasks: Array.isArray(result.subtasks) ? result.subtasks : [],
      reasoning: result.reasoning || 'No reasoning returned by the model.',
    });
  } catch (error) {
    return res.status(getBedrockFailureStatus(error)).json({
      error: 'Failed to break down task',
      message: error.message,
      bedrock: bedrockService.getHealthStatus(),
    });
  }
}));

app.get('/api/odds/health', asyncRoute(async (req, res) => {
  const health = await oddsService.getHealth();
  return res.json(health);
}));

app.get('/api/odds/mlb/test', asyncRoute(async (req, res) => {
  const result = await oddsService.testMlbH2h();
  return res.json(result);
}));

app.get('/api/odds/mlb/props/test', asyncRoute(async (req, res) => {
  const limitEvents = Number(req.query.limitEvents);
  const result = await oddsService.testMlbProps({
    date: req.query.date,
    limitEvents: Number.isFinite(limitEvents) && limitEvents > 0 ? limitEvents : undefined,
  });
  return res.json(result);
}));

app.get('/api/odds/mlb/player-props/diagnostics', asyncRoute(async (req, res) => {
  const limitEvents = Number(req.query.limitEvents);
  const result = await playerPropsDiagnosticsService.getPlayerPropsDiagnostics({
    targetDate: req.query.date,
    useLive: parseBooleanQuery(req.query.useLive),
    limitEvents: Number.isFinite(limitEvents) && limitEvents > 0 ? limitEvents : undefined,
  });
  return res.json(result);
}));

app.get('/api/odds/mlb/player-props/game/:eventId', asyncRoute(async (req, res) => {
  const limitEvents = Number(req.query.limitEvents);
  const result = await playerPropsDiagnosticsService.getPlayerPropsByGame(req.params.eventId, {
    targetDate: req.query.date,
    useLive: parseBooleanQuery(req.query.useLive),
    limitEvents: Number.isFinite(limitEvents) && limitEvents > 0 ? limitEvents : undefined,
  });
  return res.json(result);
}));

app.get('/api/odds/mlb/player-props/player/:player', asyncRoute(async (req, res) => {
  const limitEvents = Number(req.query.limitEvents);
  const result = await playerPropsDiagnosticsService.getPlayerPropsByPlayer(req.params.player, {
    targetDate: req.query.date,
    useLive: parseBooleanQuery(req.query.useLive),
    limitEvents: Number.isFinite(limitEvents) && limitEvents > 0 ? limitEvents : undefined,
  });
  return res.json(result);
}));

app.get('/api/odds/cache/status', asyncRoute(async (req, res) => {
  const result = await oddsService.getCacheStatus();
  return res.json(result);
}));

app.get('/api/daily-ticket/odds/guard', asyncRoute(async (req, res) => {
  const dryRunRequested = parseBooleanQuery(req.query.dryRun)
    || Boolean(req.query.endpointType || req.query.markets || req.query.eventCount);
  const eventCount = Number(req.query.eventCount);
  const allowedRequests = Number(req.query.allowedRequests);
  const status = await oddsService.getGuardStatusDetailed({
    dryRun: dryRunRequested
      ? {
        endpointType: req.query.endpointType,
        markets: req.query.markets,
        eventCount: Number.isFinite(eventCount) && eventCount > 0 ? eventCount : undefined,
        allowedRequests: Number.isFinite(allowedRequests) && allowedRequests > 0 ? allowedRequests : undefined,
      }
      : null,
  });

  return res.json(status);
}));

app.get('/api/daily-ticket/odds/ingestion', asyncRoute(async (req, res) => {
  const sampleLimit = Number(req.query.sampleLimit);
  const guard = await oddsService.getGuardStatusDetailed();
  const result = await oddsIngestionService.getCachedOddsIngestion({
    date: req.query.date,
    sampleLimit: Number.isFinite(sampleLimit) && sampleLimit > 0 ? sampleLimit : undefined,
  });

  return res.json({
    ...result,
    runtimeMode: guard.runtimeMode,
    oddsLiveEnabled: guard.oddsLiveEnabled,
    budgetGateVersion: guard.budgetGateVersion,
    canUseLiveOdds: guard.canUseLiveOdds,
    cacheOnly: true,
  });
}));

app.get('/api/daily-ticket/candidates', asyncRoute(async (req, res) => {
  const sampleLimit = Number(req.query.sampleLimit);
  const applyTiming = req.query.applyTiming === undefined
    ? true
    : parseBooleanQuery(req.query.applyTiming);
  const guard = await oddsService.getGuardStatusDetailed();
  const ingestion = await oddsIngestionService.getCachedOddsIngestion({
    date: req.query.date,
    includeNormalized: true,
    sampleLimit: 1,
  });
  const candidates = pickCandidateGeneratorService.generatePickCandidatesFromOdds(
    ingestion.normalizedOdds || [],
    {
      applyTiming,
      timingMode: req.query.timingMode,
    }
  );
  const summary = pickCandidateGeneratorService.buildCandidateSummary(candidates, {
    sampleLimit: Number.isFinite(sampleLimit) && sampleLimit > 0 ? sampleLimit : 20,
  });

  return res.json({
    ...summary,
    runtimeMode: guard.runtimeMode,
    oddsLiveEnabled: guard.oddsLiveEnabled,
    budgetGateVersion: guard.budgetGateVersion,
    canUseLiveOdds: guard.canUseLiveOdds,
    ingestion: {
      version: ingestion.version,
      totalNormalized: ingestion.totalNormalized,
      dateFilter: ingestion.dateFilter,
      warnings: ingestion.warnings,
      cacheAudit: ingestion.cacheAudit
        ? {
          coreOddsFiles: ingestion.cacheAudit.coreOddsFiles,
          eventsFiles: ingestion.cacheAudit.eventsFiles,
          eventMarketsFiles: ingestion.cacheAudit.eventMarketsFiles,
          eventPropsFiles: ingestion.cacheAudit.eventPropsFiles,
          normalizedFiles: ingestion.cacheAudit.normalizedFiles,
        }
        : null,
    },
    timing: {
      applied: applyTiming,
      mode: req.query.timingMode || 'safe',
      version: pickCandidateGeneratorService.VERSION,
    },
  });
}));

app.get('/api/daily-ticket/lineup-gate', asyncRoute(async (req, res) => {
  const sampleLimit = Number(req.query.sampleLimit);
  const applyTiming = req.query.applyTiming === undefined
    ? true
    : parseBooleanQuery(req.query.applyTiming);
  const guard = await oddsService.getGuardStatusDetailed();
  const ingestion = await oddsIngestionService.getCachedOddsIngestion({
    date: req.query.date,
    includeNormalized: true,
    sampleLimit: 1,
  });
  const candidates = pickCandidateGeneratorService.generatePickCandidatesFromOdds(
    ingestion.normalizedOdds || [],
    {
      applyTiming,
      timingMode: req.query.timingMode,
    }
  );
  const summary = lineupGateService.buildLineupGateSummary(candidates, {
    sampleLimit: Number.isFinite(sampleLimit) && sampleLimit > 0 ? sampleLimit : 20,
  });

  return res.json({
    ...summary,
    runtimeMode: guard.runtimeMode,
    oddsLiveEnabled: guard.oddsLiveEnabled,
    budgetGateVersion: guard.budgetGateVersion,
    canUseLiveOdds: guard.canUseLiveOdds,
    ingestion: {
      version: ingestion.version,
      totalNormalized: ingestion.totalNormalized,
      dateFilter: ingestion.dateFilter,
      warnings: ingestion.warnings,
    },
    timing: {
      applied: applyTiming,
      mode: req.query.timingMode || 'safe',
    },
    source: 'no_lineup_cache_available',
  });
}));

app.get('/api/daily-ticket/scoring', asyncRoute(async (req, res) => {
  const sampleLimit = Number(req.query.sampleLimit);
  const applyTiming = req.query.applyTiming === undefined
    ? true
    : parseBooleanQuery(req.query.applyTiming);
  const guard = await oddsService.getGuardStatusDetailed();
  const ingestion = await oddsIngestionService.getCachedOddsIngestion({
    date: req.query.date,
    includeNormalized: true,
    sampleLimit: 1,
  });
  const candidates = pickCandidateGeneratorService.generatePickCandidatesFromOdds(
    ingestion.normalizedOdds || [],
    {
      applyTiming,
      timingMode: req.query.timingMode,
    }
  );
  const scoredCandidates = scoringEngineService.scoreCandidates(candidates);
  const summary = scoringEngineService.buildScoringSummary(scoredCandidates, {
    sampleLimit: Number.isFinite(sampleLimit) && sampleLimit > 0 ? sampleLimit : 20,
  });

  return res.json({
    ...summary,
    runtimeMode: guard.runtimeMode,
    oddsLiveEnabled: guard.oddsLiveEnabled,
    budgetGateVersion: guard.budgetGateVersion,
    canUseLiveOdds: guard.canUseLiveOdds,
    candidates: {
      version: pickCandidateGeneratorService.VERSION,
      totalCandidates: candidates.length,
      activeCandidates: candidates.filter((candidate) => candidate.candidateStatus === 'candidate').length,
      rejectedCandidates: candidates.filter((candidate) => candidate.candidateStatus === 'rejected').length,
    },
    ingestion: {
      version: ingestion.version,
      totalNormalized: ingestion.totalNormalized,
      dateFilter: ingestion.dateFilter,
      warnings: ingestion.warnings,
    },
    timing: {
      applied: applyTiming,
      mode: req.query.timingMode || 'safe',
    },
  });
}));

app.get('/api/daily-ticket/ticket-builder', asyncRoute(async (req, res) => {
  const applyTiming = req.query.applyTiming === undefined
    ? true
    : parseBooleanQuery(req.query.applyTiming);
  const guard = await oddsService.getGuardStatusDetailed();
  const ingestion = await oddsIngestionService.getCachedOddsIngestion({
    date: req.query.date,
    includeNormalized: true,
    sampleLimit: 1,
  });
  const candidates = pickCandidateGeneratorService.generatePickCandidatesFromOdds(
    ingestion.normalizedOdds || [],
    {
      applyTiming,
      timingMode: req.query.timingMode,
    }
  );
  const scoredCandidates = scoringEngineService.scoreCandidates(candidates);
  const builderResult = ticketBuilderService.buildTicketsFromScoredCandidates(scoredCandidates);

  return res.json({
    ...builderResult,
    runtimeMode: guard.runtimeMode,
    oddsLiveEnabled: guard.oddsLiveEnabled,
    budgetGateVersion: guard.budgetGateVersion,
    canUseLiveOdds: guard.canUseLiveOdds,
    scoring: {
      version: scoringEngineService.VERSION,
      totalScored: scoredCandidates.length,
    },
    candidates: {
      version: pickCandidateGeneratorService.VERSION,
      totalCandidates: candidates.length,
      activeCandidates: candidates.filter((candidate) => candidate.candidateStatus === 'candidate').length,
      rejectedCandidates: candidates.filter((candidate) => candidate.candidateStatus === 'rejected').length,
    },
    ingestion: {
      version: ingestion.version,
      totalNormalized: ingestion.totalNormalized,
      dateFilter: ingestion.dateFilter,
      warnings: ingestion.warnings,
    },
    timing: {
      applied: applyTiming,
      mode: req.query.timingMode || 'safe',
    },
  });
}));

app.get('/api/daily-ticket/engine/status', asyncRoute(async (req, res) => {
  const applyTiming = req.query.applyTiming === undefined
    ? true
    : parseBooleanQuery(req.query.applyTiming);
  const status = await enginePipelineStatusService.buildEnginePipelineStatus({
    date: req.query.date,
    applyTiming,
    timingMode: req.query.timingMode,
  });

  return res.json(status);
}));

app.post('/api/daily-ticket/odds/refresh', asyncRoute(async (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const result = await oddsService.refreshMlbOdds({
    targetDate: payload.targetDate,
    confirmLive: payload.confirmLive === true,
    regions: payload.regions,
    markets: payload.markets,
  });

  return res.json(result);
}));

app.get('/api/mlb/scoreboard', asyncRoute(async (req, res) => {
  const includeTomorrow = parseBooleanQuery(req.query.includeTomorrow);
  const refreshLive = parseBooleanQuery(req.query.refreshLive);
  const enrichLiveDetails = req.query.enrichLiveDetails === undefined
    ? true
    : parseBooleanQuery(req.query.enrichLiveDetails);
  const result = await espnService.getMlbScoreboardBundle({
    dateKey: req.query.date,
    includeTomorrow,
    refreshLive,
    enrichLiveDetails,
  });
  return res.json(result);
}));

app.get('/api/daily-ticket/status', asyncRoute(async (req, res) => {
  const status = await dailyTicketService.getStatus();
  return res.json(status);
}));

app.get('/api/daily-ticket/today', asyncRoute(async (req, res) => {
  const ticket = await dailyTicketService.getTodayTicket();
  return res.json({
    hasTicketToday: Boolean(ticket),
    ticket,
  });
}));

app.get('/api/daily-ticket/upcoming', asyncRoute(async (req, res) => {
  const ticket = await dailyTicketService.getUpcomingTicket();
  return res.json({
    hasUpcomingTicket: Boolean(ticket),
    ticket,
  });
}));

app.get('/api/daily-ticket/history', asyncRoute(async (req, res) => {
  const history = await dailyTicketService.getHistory(5);
  return res.json({
    items: history,
  });
}));

app.get('/api/daily-ticket/history/summary', asyncRoute(async (req, res) => {
  const summary = await mlbTicketHistoryService.summarizeHistoricalTickets();
  return res.json(summary);
}));

app.get('/api/daily-ticket/history/patterns', asyncRoute(async (req, res) => {
  const patterns = await historicalPatternEngine.summarizeHistoricalPatterns();
  return res.json(patterns);
}));

app.get('/api/daily-ticket/history/manual', asyncRoute(async (req, res) => {
  const items = await mlbTicketHistoryService.listHistoricalTickets({
    includeGenerated: false,
    manualOnly: true,
  });
  return res.json({
    items,
  });
}));

app.post('/api/daily-ticket/history/manual', asyncRoute(async (req, res) => {
  if ((process.env.NODE_ENV || 'development') === 'production') {
    return res.status(403).json({
      error: 'Disabled in production',
      message: 'Manual MLB ticket history is only enabled outside production.',
    });
  }

  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({
      error: 'Invalid payload',
      message: 'A JSON ticket payload is required.',
    });
  }

  const normalized = mlbTicketHistoryService.normalizeHistoricalTicket(payload, {
    sourceHint: 'manual',
  });

  if (!Array.isArray(normalized.legs) || normalized.legs.length === 0) {
    return res.status(400).json({
      error: 'Invalid ticket',
      message: 'At least one leg is required.',
    });
  }

  const saved = await mlbTicketHistoryService.saveHistoricalTicket(normalized);
  return res.status(201).json({
    success: true,
    item: saved,
  });
}));

app.post('/api/daily-ticket/history/import', asyncRoute(async (req, res) => {
  if ((process.env.NODE_ENV || 'development') === 'production') {
    return res.status(403).json({
      error: 'Disabled in production',
      message: 'Bulk MLB ticket import is only enabled outside production.',
    });
  }

  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({
      error: 'Invalid payload',
      message: 'A JSON payload with a tickets array is required.',
    });
  }

  if (!Array.isArray(payload.tickets) || payload.tickets.length === 0) {
    return res.status(400).json({
      error: 'Invalid payload',
      message: 'tickets must be a non-empty array.',
    });
  }

  for (let index = 0; index < payload.tickets.length; index += 1) {
    const validationError = mlbTicketHistoryService.validateImportedTicket(payload.tickets[index], index);
    if (validationError) {
      return res.status(400).json({
        error: 'Invalid ticket payload',
        message: validationError,
      });
    }
  }

  const result = await mlbTicketHistoryService.importHistoricalTickets(payload.tickets, {
    sourceHint: 'manual',
  });

  return res.status(201).json(result);
}));

app.get('/api/daily-ticket/dashboard', asyncRoute(async (req, res) => {
  const dashboard = await dailyTicketService.getDashboard();
  return res.json(dashboard);
}));

app.get('/api/daily-ticket/debug-candidates', asyncRoute(async (req, res) => {
  const diagnostics = await dailyTicketService.getDebugCandidates();
  return res.json(diagnostics);
}));

app.post('/api/daily-ticket/generate', asyncRoute(async (req, res) => {
  const force = req.body?.force === true;
  const result = await dailyTicketService.generateDailyTicket({ force });
  const statusCode = result.success === false && result.source === 'error' ? 500 : 200;
  return res.status(statusCode).json(result);
}));

const server = app.listen(PORT, () => {
  const bedrockHealth = bedrockService.getHealthStatus();
  console.log(`[server] Listening on port ${PORT}`);
  console.log('[server] API base path: /api');
  console.log('[server] Bedrock configuration', bedrockHealth);
console.log('[server] The Odds API configured', {
  configured: oddsService.isConfigured(),
  runtimeMode: oddsService.getOddsRuntimeMode?.() || 'cache_only',
});
});

module.exports = {
  app,
  server,
};
