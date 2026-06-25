require('dotenv').config();

const cors = require('cors');
const express = require('express');

const bedrockService = require('./services/bedrockService');
const dailyTicketService = require('./services/dailyTicketService');
const oddsService = require('./services/oddsService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

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

app.get('/api/odds/cache/status', asyncRoute(async (req, res) => {
  const result = await oddsService.getCacheStatus();
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

app.listen(PORT, () => {
  const bedrockHealth = bedrockService.getHealthStatus();
  console.log(`[server] Listening on port ${PORT}`);
  console.log('[server] API base path: /api');
  console.log('[server] Bedrock configuration', bedrockHealth);
  console.log('[server] The Odds API configured', {
    configured: oddsService.isConfigured(),
  });
});
