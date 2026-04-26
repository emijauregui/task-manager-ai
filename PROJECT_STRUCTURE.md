# Project Structure

```
task-manager-ai/
│
├── 📁 frontend/                    # Frontend application
│   ├── index.html                  # Main HTML with UI structure
│   ├── styles.css                  # Complete styling with CSS variables
│   └── app.js                      # JavaScript logic, API calls, state management
│
├── 📁 backend/                     # Backend API server
│   ├── server.js                   # Express server with CRUD + AI endpoints
│   ├── package.json                # Backend dependencies
│   └── .env.example                # Environment variables template
│
├── 📁 .github/                     # GitHub configuration
│   └── workflows/
│       └── backend-test.yml        # CI workflow for backend
│
├── 📄 .gitignore                   # Git ignore rules
├── 📄 CLAUDE.md                    # Documentation for Claude Code
├── 📄 DEPLOYMENT.md                # Detailed deployment guide
├── 📄 LICENSE                      # MIT License
├── 📄 netlify.toml                 # Netlify deployment config
├── 📄 package.json                 # Root package.json with scripts
├── 📄 PROJECT_STRUCTURE.md         # This file
├── 📄 QUICKSTART.md                # Quick start guide (5 min setup)
├── 📄 README.md                    # Main project documentation
└── 📄 render.yaml                  # Render deployment config
```

## File Descriptions

### Frontend Files

- **index.html** (320 lines)
  - Task form with title, description, priority
  - Filters for all/pending/completed tasks
  - Task list with checkboxes and action buttons
  - Modal for displaying AI-generated subtasks
  - Toast notification container
  - Loading spinner

- **styles.css** (630 lines)
  - CSS variables for theming
  - Responsive design (mobile-first)
  - Modern card-based layout
  - Smooth animations and transitions
  - Priority-based color coding
  - Modal and toast styles

- **app.js** (410 lines)
  - API configuration and calls
  - State management (tasks, filters, editing)
  - Form handlers for create/update
  - AI integration (suggest priority, break down tasks)
  - Task rendering with filters
  - Modal management
  - Toast notifications
  - Utility functions (date formatting, HTML escaping)

### Backend Files

- **server.js** (180 lines)
  - Express server setup with CORS
  - In-memory task storage
  - RESTful CRUD endpoints
  - Two AI endpoints using Anthropic SDK
  - Health check endpoint
  - Error handling
  - JSON parsing for AI responses

- **package.json**
  - Dependencies: express, cors, dotenv, @anthropic-ai/sdk
  - Dev dependency: nodemon
  - Scripts: start, dev

### Configuration Files

- **netlify.toml**
  - Frontend deployment config
  - Publish directory: frontend
  - SPA redirect rules

- **render.yaml**
  - Backend deployment config
  - Build and start commands
  - Environment variables
  - Health check path

- **.gitignore**
  - node_modules, .env, logs
  - OS and IDE files

### Documentation Files

- **README.md**: Main project documentation with features, setup, and usage
- **QUICKSTART.md**: 5-minute setup guide for local development
- **DEPLOYMENT.md**: Step-by-step production deployment guide
- **CLAUDE.md**: Technical documentation for AI-assisted development
- **LICENSE**: MIT License

## Key Features by File

### Task Management (CRUD)
- **Frontend**: app.js (lines 70-140)
- **Backend**: server.js (lines 30-95)

### AI Features
- **Priority Suggestion**
  - Frontend: app.js (lines 260-285)
  - Backend: server.js (lines 97-125)
  
- **Task Breakdown**
  - Frontend: app.js (lines 287-310)
  - Backend: server.js (lines 127-160)

### UI Components
- **Task Form**: index.html (lines 14-42), app.js (lines 142-180)
- **Task List**: index.html (lines 52-58), app.js (lines 360-395)
- **Filters**: index.html (lines 45-49), app.js (lines 397-405)
- **Modal**: index.html (lines 72-87), app.js (lines 312-345)
- **Toast**: index.html (line 92), app.js (lines 425-435)

## Lines of Code

- **Frontend**: ~1,360 lines
  - HTML: 95 lines
  - CSS: 630 lines
  - JavaScript: 410 lines
  - CSS comments: ~225 lines

- **Backend**: ~180 lines
  - JavaScript: 160 lines
  - Comments: ~20 lines

- **Documentation**: ~450 lines
- **Configuration**: ~40 lines

**Total**: ~2,030 lines of code and documentation

## Dependencies

### Backend
- @anthropic-ai/sdk: ^0.20.0
- express: ^4.18.3
- cors: ^2.8.5
- dotenv: ^16.4.5
- nodemon: ^3.1.0 (dev)

### Frontend
- No external dependencies (vanilla JavaScript)

## API Endpoints

### Tasks CRUD
- GET /api/tasks
- GET /api/tasks/:id
- POST /api/tasks
- PUT /api/tasks/:id
- DELETE /api/tasks/:id

### AI Features
- POST /api/ai/suggest-priority
- POST /api/ai/break-down-task

### Health
- GET /health
