# Prompt 23 Summary: Health Check System

## What Was Built

A comprehensive **Health Check System** that monitors all integration executors with periodic health checks, latency measurement, status tracking, and event-driven alerting.

**File Created:** `src/workflows/health-checker.ts` (1,000+ lines)

## Core Functions

### 1. checkHealth()
Performs health checks on all configured executors:
- **Tests:** Notion (query DB), Trello (list boards), Slack (post message), Drive (list root), Sheets (read cell), Gmail (list labels), Google Tasks (list task lists)
- **Measures:** Latency per executor (ms)
- **Tracks:** Consecutive failures
- **Returns:** Complete health report with overall status and per-executor details

### 2. start()
Starts periodic health checks:
- **Initial Check:** Runs immediately on start
- **Interval:** Every 5 minutes (configurable)
- **Auto-Scheduling:** Continues until stopped
- **Event Emission:** Emits events on status changes

### 3. getCurrentHealth()
Gets current health status:
- **Overall:** healthy, degraded, or unhealthy
- **Summary:** Total, up, down, degraded, unknown counts
- **Per-Executor:** Status, latency, last check, errors

### 4. getExecutorHealth(executor)
Gets health status of specific executor:
- **Status:** up, down, degraded, unknown
- **Latency:** Response time in milliseconds
- **Last Check:** Timestamp of last check
- **Last Success:** Timestamp of last successful check
- **Consecutive Failures:** Count of consecutive failures
- **Error:** Error message if down

### 5. getHealthHistory(executor, limit)
Gets historical health data:
- **History:** Last N checks (default: 100, max: 1000)
- **Use Cases:** Uptime calculation, latency trends, downtime analysis

## Key Features

### 1. Executor-Specific Tests
Each integration has a tailored health check:
- **Notion:** Query test database (simple read)
- **Trello:** List user's boards
- **Slack:** Post to test channel
- **Gmail:** List labels
- **Drive:** List root folder
- **Sheets:** Read cell from test sheet
- **Google Tasks:** List task lists

### 2. Health Status Types
```typescript
// Executor status
UP: "up"           // Functioning normally
DOWN: "down"       // 3+ consecutive failures
DEGRADED: "degraded" // 1-2 consecutive failures
UNKNOWN: "unknown"   // Unable to determine

// Overall status
HEALTHY: "healthy"     // All executors up
DEGRADED: "degraded"   // 1+ executors down
UNHEALTHY: "unhealthy" // 3+ executors down
```

### 3. Health Report Structure
```typescript
{
  overall: "degraded",
  timestamp: "2025-10-17T10:30:00.000Z",
  
  executors: {
    notion: {
      executor: "notion",
      status: "up",
      latency: 150,
      lastCheck: "2025-10-17T10:30:00.000Z",
      lastSuccess: "2025-10-17T10:30:00.000Z",
      consecutiveFailures: 0
    },
    sheets: {
      executor: "sheets",
      status: "down",
      latency: 0,
      lastCheck: "2025-10-17T10:30:00.000Z",
      error: "Health check timeout after 10000ms",
      lastSuccess: "2025-10-17T10:20:00.000Z",
      consecutiveFailures: 3
    }
    // ... other executors
  },
  
  summary: {
    total: 7,
    up: 5,
    down: 1,
    degraded: 1,
    unknown: 0
  }
}
```

### 4. Event System
**7 Event Types:**
1. **health:checked** - Every check completion
2. **health:degraded** - System degraded
3. **health:unhealthy** - System unhealthy
4. **health:recovered** - System recovered
5. **executor:status_changed** - Executor status changed
6. **executor:down** - Executor went down
7. **executor:recovered** - Executor recovered

### 5. Consecutive Failure Tracking
```typescript
// First failure
{ status: 'degraded', consecutiveFailures: 1 }

// Second failure
{ status: 'degraded', consecutiveFailures: 2 }

// Third failure (threshold reached)
{ status: 'down', consecutiveFailures: 3 }

// Recovery
{ status: 'up', consecutiveFailures: 0 }
```

### 6. Latency Measurement
```typescript
// Each check measures response time
{
  executor: 'slack',
  status: 'up',
  latency: 85  // 85ms response time
}
```

### 7. Historical Tracking
- Last 1000 checks per executor
- Calculate uptime percentages
- Track latency trends
- Analyze downtime patterns

### 8. Configuration
```typescript
{
  enabled: true,
  checkInterval: 300000,          // 5 minutes
  checkTimeout: 10000,            // 10 seconds
  degradedThreshold: 1,           // 1 down = degraded
  unhealthyThreshold: 3,          // 3 down = unhealthy
  consecutiveFailureThreshold: 3, // 3 failures = down
  enableAutoRecovery: true,
  executors: ['notion', 'trello', 'slack', 'gmail', 'drive', 'sheets', 'google-tasks'],
  testConfigs: {
    notion: { testDatabase: 'test-db', operation: 'query' },
    slack: { testChannel: '#health-checks', operation: 'postMessage' },
    sheets: { testSpreadsheet: 'test-sheet', testCell: 'A1', operation: 'readCell' }
  }
}
```

### 9. Formatted Output
```
========================================
      HEALTH CHECK REPORT
========================================

Overall Status: DEGRADED
Timestamp: 2025-10-17T10:30:00.000Z

Summary:
  Total: 7
  Up: 5
  Down: 1
  Degraded: 1
  Unknown: 0

Executors:
  ✅ notion: UP (150ms)
  ✅ trello: UP (120ms)
  ✅ slack: UP (80ms)
  ⚠️ gmail: DEGRADED (523ms)
     Consecutive Failures: 1
  ✅ drive: UP (180ms)
  ❌ sheets: DOWN (0ms)
     Error: Health check timeout after 10000ms
     Consecutive Failures: 3
  ✅ google-tasks: UP (140ms)

========================================
```

## Usage Examples

### Basic Monitoring
```typescript
import healthChecker from './workflows/health-checker';

healthChecker.start();

const health = healthChecker.getCurrentHealth();
console.log(`Overall: ${health?.overall}`);
console.log(`Up: ${health?.summary.up}/${health?.summary.total}`);
```

### Event Handling
```typescript
healthChecker.on('health:degraded', (report) => {
  console.log('⚠️ System health degraded!');
  sendSlackAlert('#ops', 'System health degraded');
});

healthChecker.on('executor:down', (executor, error) => {
  console.log(`❌ ${executor} is down: ${error}`);
  sendPagerDuty({ severity: 'error', summary: `${executor} down` });
});

healthChecker.on('executor:recovered', (executor) => {
  console.log(`✅ ${executor} has recovered`);
});
```

### Calculate Uptime
```typescript
const history = healthChecker.getHealthHistory('notion', 288); // 24h
const uptime = history.filter(h => h.status === 'up').length / history.length * 100;
console.log(`Notion uptime (24h): ${uptime.toFixed(2)}%`);
```

### Dashboard Integration
```typescript
app.get('/health', (req, res) => {
  const health = healthChecker.getCurrentHealth();
  const status = health?.overall === 'unhealthy' ? 503 : 200;
  res.status(status).json(health);
});
```

## Benefits

1. **Proactive Monitoring** - Detect issues before users report them
2. **Operational Visibility** - Real-time health status and trends
3. **Automated Alerting** - Event-driven notifications on degradation
4. **Performance Insights** - Latency measurement and trending
5. **SLA Compliance** - Uptime tracking and reporting
6. **Debugging Support** - Error capture and health history

## Integration Flow

```
Start Health Checker
      ↓
Initial Check (immediate)
      ↓
Schedule Periodic Checks (5 min)
      ↓
For Each Executor:
  ├─ Run Health Test
  ├─ Measure Latency
  ├─ Track Consecutive Failures
  └─ Determine Status
      ↓
Calculate Overall Health
      ↓
Emit Events (if status changed)
      ↓
Update Health History
      ↓
Return Health Report
      ↓
Wait for Next Interval
```

## Success Criteria

✅ **Executor Tests:** Notion, Trello, Slack, Gmail, Drive, Sheets, Google Tasks  
✅ **Health Status:** up/down/degraded/unknown with latency  
✅ **Overall Health:** healthy/degraded/unhealthy  
✅ **Periodic Checks:** Every 5 minutes  
✅ **Events:** health:degraded and status change events  
✅ **Logging:** Status changes logged  
✅ **Additional:** Historical tracking, configuration, formatted output

---

**Status:** ✅ Complete - Session 10 Prompt 23 (2/2 complete)  
**Next:** Session 10 complete! Moving to Session 11  
**Total Code:** 13,200+ lines across 25 files
