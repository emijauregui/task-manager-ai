# ✅ Pre-Launch Checklist

## 📋 Before Local Development

- [ ] Node.js installed (v18 or higher)
- [ ] npm installed
- [ ] Text editor ready (VS Code, etc.)
- [ ] Browser ready (Chrome, Firefox, etc.)

## 🔑 API Setup

- [ ] Anthropic account created
- [ ] API key generated from console.anthropic.com
- [ ] API key copied and ready to paste

## 💻 Local Setup

### Backend
- [ ] Navigated to `backend/` folder
- [ ] Ran `npm install` successfully
- [ ] Created `.env` file
- [ ] Added `ANTHROPIC_API_KEY=your_key` to `.env`
- [ ] Added `PORT=3000` to `.env`
- [ ] Ran `npm run dev` successfully
- [ ] Server shows "AI features enabled"
- [ ] Server accessible at http://localhost:3000

### Frontend
- [ ] Opened `frontend/index.html` in browser OR
- [ ] Ran `npx serve frontend` successfully
- [ ] Can see Task Manager interface
- [ ] No console errors (F12 → Console)

## 🧪 Feature Testing

### Basic Features
- [ ] Can create a task
- [ ] Task appears in the list
- [ ] Can check/uncheck task as complete
- [ ] Can edit a task
- [ ] Can delete a task (with confirmation)
- [ ] Can filter tasks (All/Pending/Completed)

### AI Features
- [ ] "🤖 Sugerir Prioridad" button works
- [ ] AI suggests a priority with reasoning
- [ ] Priority gets set in the dropdown
- [ ] "✂️" button on task cards works
- [ ] Modal shows AI-generated subtasks
- [ ] "Crear Todas" creates all subtasks
- [ ] Subtasks appear in main list

### UI/UX
- [ ] Toast notifications appear for actions
- [ ] Loading spinner shows during AI calls
- [ ] Priority badges show correct colors
  - High = Red
  - Medium = Yellow
  - Low = Green
- [ ] Responsive design works on mobile
- [ ] Smooth animations and transitions

## 📱 Browser Compatibility

Test in at least 2 browsers:
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari (if on Mac)
- [ ] Mobile browser

## 🚀 Pre-Deployment

### Code Quality
- [ ] No console.errors in browser
- [ ] No unhandled errors in backend logs
- [ ] All files committed to git
- [ ] .gitignore excludes node_modules and .env

### Configuration Files
- [ ] `netlify.toml` present
- [ ] `render.yaml` present
- [ ] `.github/workflows/backend-test.yml` present
- [ ] `package.json` in both root and backend/

### Documentation
- [ ] README.md complete
- [ ] QUICKSTART.md tested
- [ ] DEPLOYMENT.md reviewed
- [ ] All .md files have correct info

## 🌐 GitHub Setup

- [ ] GitHub account ready
- [ ] Repository created (public or private)
- [ ] Git initialized locally (`git init`)
- [ ] All files added (`git add .`)
- [ ] Initial commit made
- [ ] Remote added (`git remote add origin ...`)
- [ ] Code pushed to GitHub (`git push -u origin main`)

## 🌍 Production Deployment

### Backend on Render
- [ ] Render account created
- [ ] New Web Service created
- [ ] GitHub repo connected
- [ ] Build command set: `cd backend && npm install`
- [ ] Start command set: `cd backend && npm start`
- [ ] Environment variables added:
  - [ ] `ANTHROPIC_API_KEY`
  - [ ] `NODE_ENV=production`
- [ ] Service deployed successfully
- [ ] Health check works: `/health` endpoint
- [ ] Backend URL copied (e.g., https://xxx.onrender.com)

### Frontend on Netlify
- [ ] Backend URL updated in `frontend/app.js` line 3
- [ ] Changes committed and pushed to GitHub
- [ ] Netlify account created
- [ ] New site created
- [ ] GitHub repo connected
- [ ] Publish directory set to `frontend`
- [ ] Site deployed successfully
- [ ] Custom domain configured (optional)

## 🧪 Production Testing

- [ ] Frontend loads without errors
- [ ] Can create tasks in production
- [ ] AI features work in production
- [ ] No CORS errors in console
- [ ] Backend responds within reasonable time
- [ ] All features from local testing work

## 📊 Monitoring Setup (Optional)

- [ ] Render logs accessible
- [ ] Netlify deploy logs accessible
- [ ] Anthropic API usage dashboard checked
- [ ] Error tracking set up (Sentry, etc.)
- [ ] Uptime monitoring set up (UptimeRobot, etc.)

## 🎉 Launch Ready!

Once all items are checked, your Task Manager AI is:
- ✅ Fully functional locally
- ✅ Deployed to production
- ✅ Tested and verified
- ✅ Documented and maintainable
- ✅ Ready for users!

---

## 🆘 If Something Fails

### Backend won't start
1. Check `.env` file exists and has correct API key
2. Run `npm install` again
3. Check port 3000 isn't already in use
4. Try `PORT=3001` instead

### Frontend can't connect
1. Verify backend is running
2. Check `frontend/app.js` has correct API_URL
3. Look for CORS errors in browser console
4. Try clearing browser cache

### AI features don't work
1. Verify API key is valid at console.anthropic.com
2. Check you have credits available
3. Look at backend logs for errors
4. Try a simpler task first

### Deployment fails
1. Check all environment variables are set
2. Verify build/start commands are correct
3. Check service logs for errors
4. Ensure GitHub repo has latest code

---

## 📞 Need Help?

If stuck on any item:
1. Check the relevant documentation file
2. Review backend/frontend logs
3. Check browser console (F12)
4. Verify all prerequisites are met
5. Try the troubleshooting section in QUICKSTART.md

---

**Pro Tip:** Don't try to check all boxes at once. Go section by section, and test thoroughly before moving to deployment!
