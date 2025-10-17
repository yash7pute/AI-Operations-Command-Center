# 🚀 Quick Start Cheat Sheet

## Start the Application

```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Frontend
npm run dev:frontend
```

## Access URLs

- **Dashboard**: http://localhost:5173/
- **API Health**: http://localhost:3001/api/health
- **API Docs**: See DEMO-GUIDE.md

## Test APIs

```powershell
# Run all tests
.\test-simple.ps1

# Or test manually
curl http://localhost:3001/api/dashboard
curl http://localhost:3001/api/signals
curl http://localhost:3001/api/health
```

## Available API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/status` | GET | System status |
| `/api/dashboard` | GET | Full dashboard data |
| `/api/signals` | GET | Recent signals |
| `/api/classifications` | GET | Signal classifications |
| `/api/actions` | GET | Recent actions |
| `/api/metrics` | GET | Performance metrics |
| `/api/workflows` | POST | Execute workflow |

## Demo Tips

1. **Open dashboard first**: http://localhost:5173/
2. **Show mock data working**: Metrics, charts, signals list
3. **Test API**: Run `.\test-simple.ps1`
4. **Explain architecture**: React + Node.js + AI + Integrations
5. **Show next steps**: Connect real Gmail/Slack/Notion

## Troubleshooting

### Frontend not loading?
```bash
cd frontend
npm install
npm run dev
```

### Backend errors?
```bash
npm install
npm run build
npm run dev
```

### Port in use?
```bash
# Check what's using port 3001 or 5173
netstat -ano | findstr :3001
netstat -ano | findstr :5173
```

## Key Files

- **DEMO-GUIDE.md** - Complete demo presentation guide
- **BUILD-SUCCESS.md** - What's working and next steps
- **GETTING-STARTED.md** - Setup instructions
- **COMPOSIO-WORKAROUND.md** - Integration alternatives

## Demo Script (1 minute)

> "This is an AI-powered operations command center that monitors Gmail and Slack for important signals, classifies them by urgency using AI, and automatically creates tasks in Notion. 
>
> Right now it's running in demo mode - the UI works, the API works, and the architecture is ready. To go live, just add your API keys and it connects to real Gmail, Slack, and Notion.
>
> Built with React, TypeScript, Node.js, and powered by Groq AI."

## Current Status

✅ Frontend working (React 19)  
✅ Backend working (Node.js API)  
✅ API endpoints responding  
✅ TypeScript compiling (0 errors)  
✅ Mock data displaying  
⏸️ Real integrations (need API setup)

## Next Steps

1. **Test dashboard**: Open http://localhost:5173/
2. **Run API tests**: `.\test-simple.ps1`
3. **Review demo guide**: See DEMO-GUIDE.md
4. **Connect real data** (optional): See GETTING-STARTED.md

---

**Ready to demo!** 🎉
