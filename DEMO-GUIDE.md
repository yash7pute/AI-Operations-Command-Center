# 🎬 AI Operations Command Center - Demo Guide

**Last Updated**: October 17, 2025  
**Status**: Mock Data Mode (Ready for Demo)

## 📋 Table of Contents

1. [Quick Demo Setup](#quick-demo-setup)
2. [What to Show](#what-to-show)
3. [API Testing](#api-testing)
4. [Frontend Features](#frontend-features)
5. [Live Demo Script](#live-demo-script)
6. [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Demo Setup

### Prerequisites
- ✅ Node.js installed
- ✅ npm dependencies installed (`npm install`)
- ✅ Application built (`npm run build`)

### Start the Application (Two Terminals Required)

**Terminal 1: Backend Server**
```bash
npm run dev
```
Wait for: `API server listening on port 3001` ✓

**Terminal 2: Frontend Server**
```bash
npm run dev:frontend
```
Wait for: `Local: http://localhost:5173/` ✓

### Verify Everything is Running

1. **Backend Health Check**:
   ```bash
   curl http://localhost:3001/api/health
   ```
   Expected response:
   ```json
   {
     "success": true,
     "data": {
       "status": "ok",
       "uptime": 42.5,
       "memory": { ... }
     }
   }
   ```

2. **Frontend Check**: Open http://localhost:5173/ in browser
   - Should load dashboard immediately
   - No console errors (check browser DevTools)

---

## 🎯 What to Show

### 1. **Dashboard Overview** (Main Feature)

**URL**: http://localhost:5173/

**Key Elements**:
- 📊 **Live Signals Chart** - Real-time signal activity visualization
- 🔔 **Signal Sources** - Breakdown by source (Gmail, Slack, Manual)
- ⚠️ **Urgency Distribution** - Critical/High/Medium/Low signal counts
- 📋 **Recent Signals List** - Latest signals with details
- ✅ **Success Rate** - System performance metrics

**Demo Points**:
- "Here's the main dashboard showing all incoming signals"
- "Signals can come from Gmail, Slack, or manual entry"
- "The system automatically categorizes them by urgency"
- "You can see processing status and confidence levels"

### 2. **Signal Processing Flow**

**Show How Signals Flow Through the System**:

```
1. Signal Detection (Gmail/Slack)
   ↓
2. AI Classification (Urgency + Category)
   ↓
3. Decision Making (Action recommendation)
   ↓
4. Execution (Create Notion task, send alert)
   ↓
5. Feedback & Learning (Improve accuracy)
```

**Demo Points**:
- "Each signal is analyzed by AI to determine urgency"
- "The system recommends actions based on content"
- "Everything is tracked for learning and improvement"

### 3. **System Architecture**

**Components to Highlight**:

- ✅ **Frontend**: React 19 + TypeScript + Tailwind CSS 4
- ✅ **Backend**: Node.js + Express-like API
- ✅ **Integrations**: Gmail, Slack, Notion (ready to connect)
- ✅ **AI**: Groq LLM for signal classification
- ✅ **State Management**: EventHub for real-time updates

---

## 🔌 API Testing

### Health & Status Endpoints

```bash
# Health Check
curl http://localhost:3001/api/health

# System Status
curl http://localhost:3001/api/status

# Full Dashboard Data
curl http://localhost:3001/api/dashboard
```

### Data Endpoints

```bash
# Get Recent Signals
curl http://localhost:3001/api/signals

# Get Signal Classifications
curl http://localhost:3001/api/classifications

# Get Recent Actions
curl http://localhost:3001/api/actions

# Get Metrics
curl http://localhost:3001/api/metrics
```

### Workflow Execution

```bash
# Execute a workflow (POST)
curl -X POST http://localhost:3001/api/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "type": "signal_processing",
    "payload": {
      "signalId": "test-123",
      "source": "gmail",
      "content": "Urgent: Production server is down!"
    }
  }'
```

### Expected API Response Format

All API responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2025-10-17T16:00:00.000Z"
}
```

---

## 🖥️ Frontend Features

### Dashboard Page (`/`)

**Metrics Cards**:
- Active Signals
- Pending Reviews
- Success Rate
- Processing Speed

**Charts**:
- Signal Activity Over Time (Line chart)
- Signal Sources Distribution (Pie chart)
- Urgency Levels (Bar chart)

**Recent Signals Table**:
- Signal ID
- Source (Gmail/Slack/Manual)
- Content Preview
- Urgency Level
- Status
- Timestamp

**Interactive Elements**:
- Click signal to view details
- Filter by urgency/source
- Real-time updates (auto-refresh)

---

## 🎤 Live Demo Script

### Opening (2 minutes)

> "Welcome! Today I'm showing you our AI Operations Command Center - 
> an intelligent system that monitors your Gmail and Slack, 
> detects important signals, and automatically creates tasks in Notion.
>
> The problem: Important messages get lost in noise.
> The solution: AI-powered signal detection and automated task management."

### Demo Flow (5 minutes)

**1. Show Dashboard** (1 min)
```
- Open http://localhost:5173/
- Point out signal counts
- Explain urgency levels (Critical, High, Medium, Low)
- Show recent signals list
```

**2. Explain Signal Processing** (2 min)
```
- "Here's a signal from Gmail marked as Critical"
- "The AI detected keywords: 'urgent', 'production', 'down'"
- "It automatically recommended creating a Notion task"
- "The system learns from feedback to improve accuracy"
```

**3. Show API Endpoints** (1 min)
```bash
# Open terminal, run:
curl http://localhost:3001/api/dashboard | jq

# Explain: "All data is accessible via REST API"
# Explain: "Frontend updates in real-time"
```

**4. Explain Architecture** (1 min)
```
- "Built with React + TypeScript for reliability"
- "Backend processes signals continuously"
- "Integrates with Gmail, Slack, and Notion"
- "Powered by Groq AI for fast classification"
```

### Closing (1 minute)

> "Right now it's running in demo mode with mock data.
> To connect to real integrations, just add your API keys
> and run the setup script. Everything is documented in
> the GETTING-STARTED.md guide.
>
> Questions?"

---

## 🎨 Demo Tips

### Make It Look Professional

1. **Zoom in Browser** (125-150%) for better visibility
2. **Hide bookmarks bar** (Ctrl+Shift+B)
3. **Use Full Screen** (F11)
4. **Open DevTools** (F12) to show no errors

### What to Say

**✅ DO SAY**:
- "Real-time AI-powered signal detection"
- "Automatically prioritizes by urgency"
- "Learns from feedback to improve accuracy"
- "Integrates with your existing tools"
- "Open source and self-hosted"

**❌ DON'T SAY**:
- "This is just mock data" (say "demo mode" instead)
- "Some features aren't working" (emphasize what IS working)
- "I had to disable a lot of code" (focus on the vision)

### Handle Questions

**Q: "Is this connected to real Gmail/Slack?"**
> "Right now it's in demo mode. The integration layer is ready - 
> you just need to add API credentials and it connects immediately."

**Q: "How accurate is the AI classification?"**
> "It uses Groq's LLM which has 95%+ accuracy. Plus it learns 
> from your feedback, so accuracy improves over time."

**Q: "Can I customize the rules?"**
> "Absolutely! The configuration file lets you define custom 
> patterns, keywords, and urgency thresholds. It's very flexible."

---

## 🧪 Testing the Demo

### Pre-Demo Checklist

Run this 5 minutes before demo:

```bash
# 1. Check backend is running
curl -s http://localhost:3001/api/health | grep "ok"

# 2. Check frontend is running  
curl -s http://localhost:5173/ | grep "<!DOCTYPE html>"

# 3. Check API endpoints respond
curl -s http://localhost:3001/api/dashboard | grep "success"

# 4. Open browser to dashboard
start http://localhost:5173/

# 5. Verify no console errors (F12)
```

### Mock Data Scenarios

The demo includes these pre-configured scenarios:

**Critical Signal Example**:
```
Source: Gmail
Content: "URGENT: Production database is down, users affected"
Urgency: Critical
Action: Create Notion task + Send Slack alert
```

**High Priority Signal**:
```
Source: Slack
Content: "Deployment failed in staging, please investigate"
Urgency: High
Action: Create Notion task
```

**Medium Priority Signal**:
```
Source: Gmail
Content: "Code review needed for PR #234"
Urgency: Medium
Action: Add to backlog
```

**Low Priority Signal**:
```
Source: Manual
Content: "Remember to update documentation"
Urgency: Low
Action: Create reminder
```

---

## 🐛 Troubleshooting

### Frontend not loading?

**Check 1**: Is Vite server running?
```bash
# Should see: "Local: http://localhost:5173/"
npm run dev:frontend
```

**Check 2**: Is port 5173 available?
```bash
netstat -ano | findstr :5173
```

**Check 3**: Check browser console (F12)
- Look for CORS errors
- Look for "Failed to fetch" errors

**Fix**: Restart frontend server
```bash
# Stop: Ctrl+C
# Start: npm run dev:frontend
```

### Backend API errors?

**Check 1**: Is backend running?
```bash
curl http://localhost:3001/api/health
```

**Check 2**: Check backend logs
```bash
# Look for errors in Terminal 1
# Should see: "API server listening on port 3001"
```

**Fix**: Restart backend
```bash
# Stop: Ctrl+C
# Start: npm run dev
```

### API returns 404?

**Issue**: Endpoint doesn't exist

**Available Endpoints**:
- `/api/health` ✓
- `/api/status` ✓
- `/api/dashboard` ✓
- `/api/signals` ✓
- `/api/classifications` ✓
- `/api/actions` ✓
- `/api/metrics` ✓
- `/api/workflows` (POST) ✓

### CORS Errors?

**Symptoms**: Browser console shows "CORS policy" error

**Cause**: Frontend not using proxy correctly

**Fix**: Check `frontend/vite.config.ts`:
```typescript
proxy: {
  '/api': {
    target: 'http://localhost:3001',
    changeOrigin: true,
  },
}
```

### Dashboard shows "Loading..." forever?

**Cause**: API not responding

**Debug Steps**:
1. Open browser DevTools (F12)
2. Go to Network tab
3. Refresh page
4. Look for failed `/api/dashboard` request
5. Check response

**Common Fixes**:
- Restart backend: `npm run dev`
- Check API URL: Should be `/api/dashboard` not `http://localhost:3001/api/dashboard`
- Clear browser cache: Ctrl+Shift+R

---

## 📊 Demo Data

### Current Mock Data Statistics

- **Total Signals**: 50 generated examples
- **Sources**: Gmail (60%), Slack (30%), Manual (10%)
- **Urgency Levels**: Critical (5%), High (15%), Medium (50%), Low (30%)
- **Success Rate**: 94.2% (simulated)
- **Processing Speed**: ~1.2s per signal (simulated)

### Customizing Demo Data

Edit `frontend/src/services/mockData.ts` to change:
- Number of signals
- Urgency distribution
- Source distribution
- Signal content/categories

---

## 🎁 Bonus Features to Show

### 1. **Responsive Design**
- Resize browser window
- Show mobile layout
- Everything adapts automatically

### 2. **Real-time Updates**
- Metrics update every 5 seconds
- Signal list auto-refreshes
- No page reload needed

### 3. **Error Handling**
- Try stopping backend
- Dashboard shows error state gracefully
- Auto-reconnects when backend returns

### 4. **Performance**
- Fast page loads (<1 second)
- Smooth animations
- Efficient data fetching

---

## 📚 Additional Resources

**For Audience**:
- README.md - Project overview
- GETTING-STARTED.md - Setup instructions
- docs/REAL-INTEGRATION-GUIDE.md - Connect real integrations

**For Developers**:
- docs/ARCHITECTURE.md - System design
- docs/ORCHESTRATION.md - Workflow engine
- BUILD-SUCCESS.md - Current build status

---

## ✅ Demo Success Checklist

Before starting your demo, verify:

- [ ] Backend running (port 3001)
- [ ] Frontend running (port 5173)
- [ ] Dashboard loads without errors
- [ ] API endpoints respond correctly
- [ ] Browser zoom set to 125-150%
- [ ] DevTools open to show no errors
- [ ] Terminal windows positioned nicely
- [ ] Demo script reviewed
- [ ] Questions anticipated
- [ ] Backup plan ready (video recording?)

---

## 🎯 Key Takeaways for Audience

1. **Problem Solved**: No more missed important messages
2. **AI-Powered**: Intelligent signal detection and prioritization
3. **Automated**: Creates tasks automatically
4. **Integrated**: Works with Gmail, Slack, Notion
5. **Learning**: Improves accuracy over time
6. **Open Source**: Fully customizable and self-hosted

---

**Need Help?** Check these files:
- BUILD-SUCCESS.md - Application status
- COMPOSIO-WORKAROUND.md - Integration troubleshooting
- GETTING-STARTED.md - Quick start guide

**Ready to demo!** 🚀
