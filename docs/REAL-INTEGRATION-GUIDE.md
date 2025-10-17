# Real Integration Setup Guide

This guide will walk you through connecting your AI Operations Command Center to real Gmail, Slack, and Notion accounts.

## Prerequisites

- ✅ Node.js installed
- ✅ All dependencies installed (`npm install`)
- ✅ `.env` file configured with API keys
- ✅ Composio CLI installed globally

## Step 1: Install Composio CLI

```bash
npm install -g composio-core
```

Verify installation:
```bash
composio --version
```

## Step 2: Login to Composio

```bash
composio login
```

This will:
1. Open your browser to Composio's login page
2. Ask you to authenticate
3. Store your credentials locally

You should see:
```
✅ Successfully logged in to Composio
```

## Step 3: Connect Gmail

```bash
composio add gmail
```

This will:
1. Open your browser to Google's OAuth consent screen
2. Ask you to select your Google account
3. Request permissions to:
   - Read emails
   - Send emails (for confirmations)
   - Modify labels (optional, for marking processed emails)

**Note:** You may see a warning that the app is not verified. This is normal for development. Click "Advanced" → "Go to app (unsafe)" to continue.

After authorization, you should see:
```
✅ Gmail connected successfully
```

### Verify Gmail Connection

```bash
composio apps
```

You should see:
```
gmail - ✅ Connected
  - Email: your-email@gmail.com
  - Scopes: gmail.readonly, gmail.send
```

## Step 4: Connect Slack

```bash
composio add slack
```

This will:
1. Open your browser to Slack's OAuth consent screen
2. Ask you to select your Slack workspace
3. Request permissions to:
   - Read messages
   - Post messages (for confirmations)
   - Access channel information

After authorization:
```
✅ Slack connected successfully
```

### Verify Slack Connection

```bash
composio apps
```

You should see:
```
slack - ✅ Connected
  - Workspace: your-workspace
  - Bot User: @ai-operations-bot
```

## Step 5: Connect Notion

```bash
composio add notion
```

This will:
1. Open your browser to Notion's integration page
2. Ask you to select pages/databases to share
3. Request permissions to:
   - Create pages
   - Update pages
   - Read database contents

**Important:** You must share your task database with this integration! See [NOTION-SETUP.md](./NOTION-SETUP.md) for details.

After authorization:
```
✅ Notion connected successfully
```

### Verify Notion Connection

```bash
composio apps
```

You should see:
```
notion - ✅ Connected
  - Workspace: your-workspace
  - Pages Shared: 1
```

## Step 6: Configure Notion Database

Follow the detailed guide in [NOTION-SETUP.md](./NOTION-SETUP.md) to:
1. Create a Notion database with required properties
2. Get your Database ID
3. Add it to `.env`:
   ```env
   NOTION_DATABASE_ID=your-32-character-database-id
   ```
4. Share the database with the Composio integration

## Step 7: Configure Environment Variables

Your `.env` file should have:

```env
# Composio (for Gmail, Slack, Notion)
COMPOSIO_API_KEY=your_composio_api_key

# Groq (for AI analysis)
GROQ_API_KEY=your_groq_api_key

# Notion
NOTION_API_KEY=your_notion_api_key
NOTION_DATABASE_ID=your_notion_database_id

# Gmail (OAuth - from Google Cloud Console)
GMAIL_CLIENT_ID=your_gmail_client_id
GMAIL_CLIENT_SECRET=your_gmail_client_secret
GMAIL_REDIRECT_URI=http://localhost:3000/oauth2callback

# Slack (from Slack App settings)
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your_signing_secret
SLACK_APP_TOKEN=xapp-your-app-token

# Optional: Trello
TRELLO_API_KEY=your_trello_api_key
TRELLO_TOKEN=your_trello_token
```

## Step 8: Verify Configuration

Check that all required environment variables are set:

```bash
npm run check-env
```

Or manually verify:
```bash
node -e "require('dotenv').config(); console.log({
  COMPOSIO_API_KEY: !!process.env.COMPOSIO_API_KEY,
  GROQ_API_KEY: !!process.env.GROQ_API_KEY,
  NOTION_DATABASE_ID: !!process.env.NOTION_DATABASE_ID
})"
```

Should output:
```json
{
  "COMPOSIO_API_KEY": true,
  "GROQ_API_KEY": true,
  "NOTION_DATABASE_ID": true
}
```

## Step 9: Test Connections

Start the application:

```bash
npm start
```

You should see:
```
Starting AI-Operations-Command-Center
✅ Composio initialized
✅ Real-time monitoring started (Gmail + Slack)
   - Gmail: Checking every 60 seconds
   - Slack: Checking every 30 seconds
Frontend: http://localhost:5173
Backend API: http://localhost:3001
```

## Step 10: Send Test Signal

### Test Gmail

1. Send yourself an email with:
   ```
   Subject: Test Task
   
   Reminder: Complete the project proposal by December 31st.
   This is a high priority task.
   ```

2. Within 60 seconds, check:
   - Terminal logs: Should show "Processing Gmail signal"
   - Notion database: Should have a new task created
   - Frontend dashboard: Should show the signal processing

### Test Slack

1. In your Slack workspace, send a message:
   ```
   Don't forget to review the budget by Friday!
   ```

2. Within 30 seconds, check:
   - Terminal logs: Should show "Processing Slack signal"
   - Notion database: Should have a new task created
   - Slack: Should receive confirmation (if enabled)
   - Frontend dashboard: Should show the signal

## Troubleshooting

### "Composio not initialized"
- Check that `COMPOSIO_API_KEY` is in `.env`
- Run `composio login` again
- Restart the application

### "Gmail not connected"
```bash
# Check connections
composio apps

# If not connected, reconnect
composio remove gmail
composio add gmail
```

### "Slack not connected"
```bash
# Check connections
composio apps

# If not connected, reconnect
composio remove slack
composio add slack
```

### "Notion not connected" or "Permission Denied"
```bash
# Reconnect Notion
composio remove notion
composio add notion

# Make sure to share your database with the integration!
```

Then in Notion:
1. Open your database
2. Click "Share" → "Add connections"
3. Select the Composio integration
4. Click "Confirm"

### "No Database ID" Error
- Make sure `NOTION_DATABASE_ID` is in `.env`
- Verify it's exactly 32 characters
- See [NOTION-SETUP.md](./NOTION-SETUP.md) for how to get your Database ID

### "Rate Limit Exceeded"
- Adjust polling intervals in `src/config/agent-config.ts`:
  ```typescript
  export const GMAIL_CONFIG = {
    pollInterval: 120000, // 2 minutes instead of 1
  };
  
  export const SLACK_CONFIG = {
    pollInterval: 60000, // 1 minute instead of 30 seconds
  };
  ```

### Tasks Not Being Created
1. Check terminal logs for errors
2. Verify AI extraction is working:
   - Look for "Task extracted" in logs
   - Check confidence score (must be > 0.3)
3. Verify Notion properties match config:
   - Open `src/config/agent-config.ts`
   - Check property names match your database exactly
4. Test manually:
   ```bash
   curl http://localhost:3001/api/dashboard
   ```

### AI Confidence Too Low
Adjust thresholds in `src/config/agent-config.ts`:
```typescript
export const CONFIDENCE_THRESHOLD = {
  autoExecute: 0.7,      // Lower from 0.8
  requireApproval: 0.4,  // Lower from 0.5
  reject: 0.2,           // Lower from 0.3
};
```

## Advanced Configuration

### Custom Signal Patterns

Edit `src/config/agent-config.ts` to add your own keywords:

```typescript
export const SIGNAL_PATTERNS = {
  deadlines: [
    'due by',
    'deadline',
    // Add your own:
    'submit by',
    'finish before',
  ],
  urgent: [
    'urgent',
    'ASAP',
    // Add your own:
    'immediately',
    'right away',
  ],
};
```

### High Priority Senders

Emails from specific people are automatically marked high priority:

```typescript
export const HIGH_PRIORITY_SENDERS = [
  'boss@company.com',
  'client@important.com',
  'manager@company.com',
];
```

### Monitor Specific Channels

For Slack, monitor only specific channels:

```typescript
export const SLACK_CONFIG = {
  monitorChannels: [
    'C01234567',  // #general
    'C98765432',  // #important
  ],
};
```

Get channel IDs from Slack's channel URL.

## Integration Flow

Here's how the system works:

```
Gmail/Slack
    ↓
[New Message]
    ↓
[Composio Polling] ← Every 30-60 seconds
    ↓
[Extract Signal]
    ↓
[Groq AI Analysis] ← Extracts task, date, priority
    ↓
[Confidence Check]
    ├─→ High (>80%) → [Auto-create Notion Task] ✅
    ├─→ Medium (50-80%) → [Queue for Approval] ⏸️
    └─→ Low (<50%) → [Reject] ❌
```

## Monitoring Dashboard

Access the real-time dashboard:
```
http://localhost:5173
```

Features:
- ✅ Live signal processing status
- ✅ Recent decisions and classifications
- ✅ Pending approvals
- ✅ Performance metrics
- ✅ Integration health

## API Endpoints

Test integrations via API:

```bash
# Get dashboard data
curl http://localhost:3001/api/dashboard

# Get integration status
curl http://localhost:3001/api/status

# Health check
curl http://localhost:3001/api/health
```

## Next Steps

1. ✅ **Customize patterns**: Edit signal detection rules
2. ✅ **Adjust confidence**: Lower/raise thresholds based on accuracy
3. ✅ **Add priority senders**: Automatically prioritize important emails
4. ✅ **Create Notion views**: Filter by priority, source, due date
5. ✅ **Set up notifications**: Get Slack alerts for high-priority tasks

## Security Best Practices

- ✅ Never commit `.env` file to version control
- ✅ Use environment-specific API keys (dev vs prod)
- ✅ Regularly rotate API keys
- ✅ Limit OAuth scopes to minimum required
- ✅ Monitor integration logs for suspicious activity

## Support

If you run into issues:

1. Check terminal logs for detailed error messages
2. Verify all steps in this guide are completed
3. See [NOTION-SETUP.md](./NOTION-SETUP.md) for Notion-specific issues
4. Review Composio docs: https://docs.composio.dev
5. Check Groq API status: https://status.groq.com

## Useful Commands

```bash
# Check Composio connections
composio apps

# Re-authenticate integration
composio add <app-name>

# Remove integration
composio remove <app-name>

# Logout from Composio
composio logout

# Start application
npm start

# Start with debug logs
LOG_LEVEL=debug npm start

# Run tests
npm test
```

Enjoy your automated task management system! 🎉
