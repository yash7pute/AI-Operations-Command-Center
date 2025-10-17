# 🚀 Getting Started with AI Operations Command Center

This guide will get you up and running with the AI Operations Command Center in minutes.

## Prerequisites

- ✅ **Node.js 18+** installed ([Download](https://nodejs.org/))
- ✅ **npm** or yarn package manager
- ✅ **API Keys** for:
  - Composio ([Get Key](https://app.composio.dev))
  - Groq ([Get Key](https://console.groq.com))
  - Notion ([Get Key](https://www.notion.so/my-integrations))
  - Gmail (OAuth from [Google Cloud Console](https://console.cloud.google.com))
  - Slack ([Create App](https://api.slack.com/apps))

## Quick Start (5 Minutes)

### Step 1: Clone & Install (1 min)

```bash
# Clone the repository (or download ZIP)
cd AI-Operations-Command-Center

# Install all dependencies
npm install
cd frontend && npm install && cd ..
```

### Step 2: Configure Environment (2 min)

1. Copy the example environment file:
   ```bash
   copy .env.example .env   # Windows
   # OR
   cp .env.example .env     # Mac/Linux
   ```

2. Edit `.env` and add your API keys:
   ```env
   # Required Keys
   COMPOSIO_API_KEY=your_composio_key
   GROQ_API_KEY=your_groq_key
   NOTION_DATABASE_ID=your_notion_database_id

   # Optional (for full functionality)
   NOTION_API_KEY=your_notion_key
   GMAIL_CLIENT_ID=your_gmail_client_id
   SLACK_BOT_TOKEN=your_slack_bot_token
   ```

### Step 3: Connect Integrations (2 min)

```bash
# Install Composio CLI globally
npm install -g composio-core

# Login to Composio
composio login

# Connect your accounts
composio add gmail
composio add slack
composio add notion
```

**Note:** Each `composio add` command will open your browser for OAuth authentication.

### Step 4: Set Up Notion Database (Optional, 3 min)

See detailed guide: [NOTION-SETUP.md](./NOTION-SETUP.md)

**Quick Version:**
1. Create a new Notion database
2. Add these columns: Name (title), Due Date (date), Priority (select), Source (select), Status (select)
3. Copy the Database ID from the URL
4. Add to `.env`: `NOTION_DATABASE_ID=your-32-char-id`
5. Share database with Composio integration

### Step 5: Start the Application (30 seconds)

```bash
# Start everything
npm start
```

Or run backend and frontend separately:

**Terminal 1 - Backend:**
```bash
npm run start:api
```

**Terminal 2 - Frontend:**
```bash
npm run dev:frontend
```

### Step 6: Access the Dashboard (10 seconds)

Open your browser to:
- **Frontend Dashboard**: http://localhost:5173
- **Backend API**: http://localhost:3001/api/health

You should see:
- ✅ Dashboard loading with metrics
- ✅ Backend logs showing "Composio initialized"
- ✅ "Real-time monitoring started" message

## What Happens Next?

The system is now:
1. **Monitoring Gmail** - Checking for new emails every 60 seconds
2. **Monitoring Slack** - Checking for messages every 30 seconds
3. **Analyzing Messages** - Using Groq AI to extract deadlines and tasks
4. **Creating Tasks** - Automatically adding high-confidence tasks to Notion

## Test It Out

### Test 1: Send Email with Deadline
1. Send yourself an email:
   ```
   Subject: Project Reminder
   
   Don't forget to submit the quarterly report by December 31st.
   This is a high priority task!
   ```

2. Within 60 seconds:
   - Check terminal logs: Should see "Processing Gmail signal"
   - Check Notion database: New task should appear
   - Check dashboard: Signal should show up in feed

### Test 2: Post in Slack
1. In your connected Slack workspace:
   ```
   Team meeting scheduled for tomorrow at 2 PM. 
   Please review the agenda before the call.
   ```

2. Within 30 seconds:
   - Check terminal logs: "Processing Slack signal"
   - Check Notion: Meeting task created
   - Slack bot may reply with confirmation ✅

## Folder Structure

```
AI-Operations-Command-Center/
├── frontend/                  # React Frontend
│   ├── src/
│   │   ├── pages/            # Dashboard pages
│   │   ├── components/       # UI components
│   │   ├── services/         # API client
│   │   └── types/            # TypeScript types
│   └── package.json
│
├── src/                       # Backend
│   ├── index.ts              # Main entry point
│   ├── api-server.ts         # REST API server
│   ├── config/
│   │   └── agent-config.ts   # Signal patterns, rules
│   ├── integrations/
│   │   └── composio-client.ts # Real integration layer
│   ├── agents/               # AI agents
│   └── workflows/            # Workflow automation
│
├── docs/                      # Documentation
│   ├── REAL-INTEGRATION-GUIDE.md
│   ├── NOTION-SETUP.md
│   └── ...
│
├── .env                       # Your API keys (NEVER commit!)
└── package.json               # Backend dependencies
```

## Available Commands

### Development
```bash
npm start                  # Start backend + auto-reload
npm run start:api          # Start API server only
npm run dev:frontend       # Start frontend dev server
```

### Building
```bash
npm run build              # Build backend
npm run build:frontend     # Build frontend
npm run build:all          # Build both
```

### Testing
```bash
npm test                   # Run all tests
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Generate coverage report
```

### Debugging
```bash
LOG_LEVEL=debug npm start  # Enable debug logs
```

## Configuration

### Adjust Signal Detection

Edit `src/config/agent-config.ts`:

```typescript
// Add your own deadline keywords
export const SIGNAL_PATTERNS = {
  deadlines: [
    'due by',
    'deadline',
    'finish before',  // Add your own
  ],
};

// Add priority senders
export const HIGH_PRIORITY_SENDERS = [
  'boss@company.com',
  'client@important.com',
];
```

### Adjust Polling Intervals

```typescript
export const GMAIL_CONFIG = {
  pollInterval: 60000,  // Check every 60 seconds
};

export const SLACK_CONFIG = {
  pollInterval: 30000,  // Check every 30 seconds
};
```

### Adjust AI Confidence

```typescript
export const CONFIDENCE_THRESHOLD = {
  autoExecute: 0.8,      // Auto-create if >80% confident
  requireApproval: 0.5,  // Queue for approval if 50-80%
  reject: 0.3,           // Ignore if <30%
};
```

## Troubleshooting

### "Cannot find module"
```bash
# Reinstall dependencies
npm install
cd frontend && npm install
```

### "COMPOSIO_API_KEY not configured"
- Check `.env` file exists
- Check API key is set correctly
- Try: `node -e "require('dotenv').config(); console.log(process.env.COMPOSIO_API_KEY)"`

### "Gmail not connected"
```bash
composio apps              # Check connections
composio remove gmail      # Remove old connection
composio add gmail         # Re-connect
```

### "Tasks not being created"
1. Check terminal logs for errors
2. Verify `NOTION_DATABASE_ID` is set
3. Ensure database is shared with Composio integration
4. Lower confidence threshold if needed

### "Frontend not loading"
```bash
cd frontend
npm install    # Reinstall dependencies
npm run dev    # Start dev server
```

### Port Already in Use
```bash
# Frontend (5173)
# Kill process using port:
npx kill-port 5173

# Backend (3001)
npx kill-port 3001
```

## Next Steps

1. ✅ **Read Detailed Guides:**
   - [Real Integration Setup](./REAL-INTEGRATION-GUIDE.md)
   - [Notion Database Setup](./NOTION-SETUP.md)

2. ✅ **Customize Configuration:**
   - Edit `src/config/agent-config.ts`
   - Add your priority senders
   - Adjust signal patterns

3. ✅ **Create Notion Views:**
   - Filter by priority
   - Group by source
   - Sort by due date

4. ✅ **Set Up Notifications:**
   - Configure Slack alerts
   - Set up email digests

5. ✅ **Explore the API:**
   ```bash
   curl http://localhost:3001/api/dashboard
   curl http://localhost:3001/api/status
   curl http://localhost:3001/api/health
   ```

## Support

- 📖 **Documentation**: `/docs` folder
- 🐛 **Issues**: GitHub Issues
- 💬 **Slack**: #ai-operations-help

## Security Reminder

⚠️ **NEVER commit your `.env` file to version control!**

It's already in `.gitignore`, but double-check:
```bash
git status
# .env should NOT appear in the list
```

## Success Checklist

- ✅ All dependencies installed
- ✅ `.env` file configured
- ✅ Composio integrations connected (gmail, slack, notion)
- ✅ Notion database created and shared
- ✅ Application starts without errors
- ✅ Dashboard loads at http://localhost:5173
- ✅ Test email creates Notion task
- ✅ Backend logs show "Monitoring started"

**Congratulations! 🎉** You're now running the AI Operations Command Center!

## What's Next?

Your system is now:
- 📧 Monitoring your Gmail for deadlines
- 💬 Watching Slack for important tasks
- 🤖 Using AI to extract and categorize information
- ✅ Automatically creating tasks in Notion

Sit back and watch it work!
