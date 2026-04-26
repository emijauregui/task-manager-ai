# 🚀 Getting Started in 3 Steps

## Step 1: Get Your API Key (2 minutes)

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Navigate to "API Keys" section
4. Click "Create Key"
5. Copy your API key (starts with `sk-ant-`)

## Step 2: Setup Backend (2 minutes)

```bash
# Navigate to backend folder
cd backend

# Install dependencies
npm install

# Create environment file
echo "ANTHROPIC_API_KEY=your_key_here" > .env
echo "PORT=3000" >> .env
echo "NODE_ENV=development" >> .env

# Start server
npm run dev
```

You should see:
```
🚀 Server running on port 3000
📝 API available at http://localhost:3000/api
🤖 AI features enabled
```

## Step 3: Open Frontend (1 minute)

**Option A - Direct (simplest):**
- Just open `frontend/index.html` in your browser

**Option B - Local server (recommended):**
```bash
# From project root
npx serve frontend
```

Then open http://localhost:3000 (or whatever port is shown)

---

## ✅ You're Ready!

Try these features:

1. **Create a task**: Type "Buy groceries" and click "Agregar Tarea"
2. **AI Priority**: Type "CEO presentation tomorrow" and click "🤖 Sugerir Prioridad"
3. **Break down task**: Create "Build authentication system" and click "✂️"

---

## 🎯 What's Next?

- **Full documentation**: See `README.md`
- **Deployment guide**: See `DEPLOYMENT.md`
- **More examples**: See `EXAMPLES.md`
- **Code details**: See `CLAUDE.md`

---

## ⚠️ Troubleshooting

**Backend shows "AI features disabled"**
→ Check your `.env` file has the correct API key

**Frontend can't connect**
→ Make sure backend is running on port 3000

**"Port already in use"**
→ Change `PORT=3001` in `.env` and update `frontend/app.js` line 3

---

## 📱 Need Help?

- Check `QUICKSTART.md` for detailed setup
- Review `SUMMARY.md` for project overview
- See `EXAMPLES.md` for usage examples
