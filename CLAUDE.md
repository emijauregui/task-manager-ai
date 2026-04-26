# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Task Manager AI is a full-stack web application that uses Anthropic's Claude API to provide intelligent task management. The app allows users to create, edit, delete, and filter tasks, with AI-powered features for suggesting task priorities and breaking down complex tasks into manageable subtasks.

## Technology Stack

### Frontend
- **HTML5/CSS3/Vanilla JavaScript**: No frameworks, pure web technologies
- **Deployment**: Netlify (static hosting)

### Backend
- **Node.js + Express**: RESTful API server
- **Anthropic SDK**: Claude API integration for AI features
- **Deployment**: Render (free tier with auto-sleep)

## Project Structure

```
task-manager-ai/
├── frontend/
│   ├── index.html          # Main UI with task form and list
│   ├── styles.css          # Complete responsive styling
│   └── app.js              # Client-side logic and API calls
├── backend/
│   ├── server.js           # Express server with CRUD + AI endpoints
│   ├── package.json        # Backend dependencies
│   └── .env.example        # Environment variables template
├── .gitignore
├── README.md
├── DEPLOYMENT.md           # Detailed deployment instructions
├── netlify.toml            # Netlify configuration
├── render.yaml             # Render configuration
└── package.json            # Root package.json for scripts
```

## Development Commands

### Backend Development

```bash
# Install dependencies
cd backend
npm install

# Start development server with auto-reload
npm run dev

# Start production server
npm start
```

Backend runs on `http://localhost:3000` by default.

### Frontend Development

```bash
# Serve frontend locally (from project root)
npx serve frontend

# Or open index.html directly in browser for simple testing
```

### Environment Setup

Create `backend/.env` file:
```
ANTHROPIC_API_KEY=your_api_key_here
PORT=3000
NODE_ENV=development
```

Get your API key from [console.anthropic.com](https://console.anthropic.com)

## Architecture

### Backend API Endpoints

**Tasks CRUD:**
- `GET /api/tasks` - Get all tasks
- `GET /api/tasks/:id` - Get single task
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

**AI Features:**
- `POST /api/ai/suggest-priority` - Analyze task and suggest priority level
- `POST /api/ai/break-down-task` - Divide complex task into subtasks

**Health Check:**
- `GET /health` - Server status

### Data Flow

1. **Task Management**: Frontend → Backend CRUD API → In-memory storage (tasks array)
2. **AI Suggestions**: Frontend → Backend → Anthropic API → Parse JSON response → Frontend

### Frontend State Management

- `tasks[]`: Array of task objects
- `currentFilter`: 'all' | 'pending' | 'completed'
- `editingTaskId`: Currently editing task ID (null when creating)
- `currentSubtasks[]`: AI-generated subtasks for modal display

### API Integration Points

**frontend/app.js:3** - API_URL configuration:
- Development: `http://localhost:3000`
- Production: Update to your Render backend URL

**backend/server.js** - Anthropic client initialization:
- Uses `@anthropic-ai/sdk` package
- Model: `claude-sonnet-4-6` for balance of speed and quality
- Prompt caching is automatically enabled by the SDK

## AI Features Implementation

### Priority Suggestion
The AI analyzes the task title and description to suggest one of three priority levels (high/medium/low) based on urgency, importance, and potential impact. The backend sends a structured prompt requesting JSON output.

### Task Breakdown
For complex tasks, the AI generates a list of actionable subtasks with individual priorities and descriptions. The response includes reasoning for how the task was divided.

### Error Handling
- Missing API key: Returns 500 with clear error message
- Invalid responses: JSON parsing with fallback error handling
- Network errors: Frontend shows toast notifications

## Deployment

### Prerequisites
1. GitHub account and repository
2. Netlify account (free)
3. Render account (free)
4. Anthropic API key

### Deployment Flow
1. Push code to GitHub
2. Deploy backend to Render (configure ANTHROPIC_API_KEY env var)
3. Update frontend/app.js with production backend URL
4. Deploy frontend to Netlify

See `DEPLOYMENT.md` for detailed step-by-step instructions.

## Common Development Tasks

### Adding a new task field
1. Update task object structure in `backend/server.js` (newTask object)
2. Add form input in `frontend/index.html`
3. Update form handler in `frontend/app.js` (handleSubmit function)
4. Update task card rendering in `renderTasks()` function

### Modifying AI prompts
Edit the prompt strings in:
- `backend/server.js:89` - Priority suggestion prompt
- `backend/server.js:125` - Task breakdown prompt

### Styling changes
All styles are in `frontend/styles.css` with CSS variables in `:root` for easy theming.

## Important Notes

- **No database**: Tasks are stored in-memory. Restarting the backend clears all data. For persistence, integrate a database like MongoDB or PostgreSQL.
- **CORS**: Backend has CORS enabled for all origins. Restrict in production if needed.
- **Free tier limits**: Render free tier sleeps after 15 minutes of inactivity. First request after sleep takes 30-60 seconds.
- **API costs**: Anthropic API is pay-as-you-go. Monitor usage at console.anthropic.com.
- **Prompt caching**: The Anthropic SDK automatically uses prompt caching when beneficial, reducing costs for repeated prompts.

## Testing AI Features Locally

1. Start backend with valid ANTHROPIC_API_KEY
2. Open frontend
3. Create a task like "Implement user authentication system with OAuth, JWT tokens, and password reset"
4. Click "🤖 Sugerir Prioridad" - should suggest "high" priority
5. After creating, click "✂️" button - should generate 4-6 subtasks

## Security Considerations

- **API Key**: Never commit `.env` file. Use environment variables in production.
- **Input validation**: Basic validation exists. For production, add sanitization for XSS prevention.
- **Rate limiting**: Consider adding rate limiting middleware for production.
- **HTTPS**: Both Netlify and Render provide HTTPS by default.
