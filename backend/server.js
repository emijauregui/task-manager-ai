require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize AWS Bedrock client
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const MODEL_ID = 'anthropic.claude-sonnet-4-5-20250929-v1:0';

// Helper function to invoke Bedrock model
async function invokeBedrockModel(prompt, maxTokens = 2048) {
  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: maxTokens,
    messages: [{
      role: 'user',
      content: prompt
    }]
  };

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  return responseBody.content[0].text;
}

// In-memory storage (en producción usarías una base de datos)
let tasks = [];
let nextId = 1;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Get all tasks
app.get('/api/tasks', (req, res) => {
  res.json(tasks);
});

// Get task by ID
app.get('/api/tasks/:id', (req, res) => {
  const task = tasks.find(t => t.id === parseInt(req.params.id));
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json(task);
});

// Create task
app.post('/api/tasks', (req, res) => {
  const { title, description, priority, completed } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const newTask = {
    id: nextId++,
    title,
    description: description || '',
    priority: priority || 'medium',
    completed: completed || false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  tasks.push(newTask);
  res.status(201).json(newTask);
});

// Update task
app.put('/api/tasks/:id', (req, res) => {
  const taskIndex = tasks.findIndex(t => t.id === parseInt(req.params.id));

  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const { title, description, priority, completed } = req.body;

  tasks[taskIndex] = {
    ...tasks[taskIndex],
    title: title !== undefined ? title : tasks[taskIndex].title,
    description: description !== undefined ? description : tasks[taskIndex].description,
    priority: priority !== undefined ? priority : tasks[taskIndex].priority,
    completed: completed !== undefined ? completed : tasks[taskIndex].completed,
    updatedAt: new Date().toISOString()
  };

  res.json(tasks[taskIndex]);
});

// Delete task
app.delete('/api/tasks/:id', (req, res) => {
  const taskIndex = tasks.findIndex(t => t.id === parseInt(req.params.id));

  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  tasks.splice(taskIndex, 1);
  res.status(204).send();
});

// AI: Suggest priority for a task
app.post('/api/ai/suggest-priority', async (req, res) => {
  const { title, description } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return res.status(500).json({ error: 'AWS credentials not configured' });
  }

  try {
    const prompt = `Analiza esta tarea y sugiere un nivel de prioridad (high, medium, o low) basándote en su urgencia, importancia e impacto.

Título: ${title}
Descripción: ${description || 'Sin descripción'}

Responde SOLO con un objeto JSON en este formato exacto:
{
  "priority": "high|medium|low",
  "reasoning": "breve explicación de por qué elegiste esta prioridad"
}`;

    const responseText = await invokeBedrockModel(prompt, 1024);
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      res.json(result);
    } else {
      throw new Error('Invalid response format from AI');
    }
  } catch (error) {
    console.error('Error suggesting priority:', error);
    res.status(500).json({
      error: 'Failed to suggest priority',
      message: error.message
    });
  }
});

// AI: Break down complex task into subtasks
app.post('/api/ai/break-down-task', async (req, res) => {
  const { title, description } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return res.status(500).json({ error: 'AWS credentials not configured' });
  }

  try {
    const prompt = `Analiza esta tarea y divídela en subtareas más pequeñas y manejables. Cada subtarea debe ser específica y accionable.

Título: ${title}
Descripción: ${description || 'Sin descripción'}

Responde SOLO con un objeto JSON en este formato exacto:
{
  "subtasks": [
    {
      "title": "título de la subtarea",
      "description": "descripción breve",
      "priority": "high|medium|low"
    }
  ],
  "reasoning": "breve explicación de cómo dividiste la tarea"
}`;

    const responseText = await invokeBedrockModel(prompt, 2048);
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      res.json(result);
    } else {
      throw new Error('Invalid response format from AI');
    }
  } catch (error) {
    console.error('Error breaking down task:', error);
    res.status(500).json({
      error: 'Failed to break down task',
      message: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 API available at http://localhost:${PORT}/api`);
  const awsConfigured = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
  console.log(`🤖 AI features (AWS Bedrock) ${awsConfigured ? 'enabled' : 'disabled (no AWS credentials)'}`);
  if (awsConfigured) {
    console.log(`📍 AWS Region: ${process.env.AWS_REGION || 'us-east-1'}`);
    console.log(`🧠 Model: ${MODEL_ID}`);
  }
});
