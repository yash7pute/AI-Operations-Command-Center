# Prompt 23: Health Check System

## Overview

The **Health Check System** monitors the health of all integration executors in the AI Operations Command Center. It performs periodic health checks, tracks status changes, measures latency, and provides real-time health visibility for operational monitoring.

## What Was Built

A complete health monitoring system in `src/workflows/health-checker.ts` (1,000+ lines) featuring:

### Core Components

1. **Periodic Health Checks**
   - Runs every 5 minutes (configurable)
   - Tests all configured executors
   - Measures latency per check
   - Tracks consecutive failures

2. **Executor-Specific Tests**
   - **Notion:** Query database (simple read test)
   - **Trello:** List boards (simple read test)
   - **Slack:** Post to test channel
   - **Gmail:** List labels
   - **Drive:** List root folder
   - **Sheets:** Read cell from test sheet
   - **Google Tasks:** List task lists

3. **Health Status Tracking**
   - UP: Executor functioning normally
   - DOWN: Executor failed consecutively
   - DEGRADED: Executor experiencing issues
   - UNKNOWN: Unable to determine status

4. **Overall Health Aggregation**
   - HEALTHY: All executors up
   - DEGRADED: 1+ executors down
   - UNHEALTHY: 3+ executors down

5. **Event System**
   - Health degraded events
   - Health unhealthy events
   - Health recovered events
   - Executor status changed
   - Executor down/recovered

6. **Historical Tracking**
   - Maintains health history per executor
   - Tracks last 1000 checks per executor
   - Last successful check timestamp
   - Consecutive failure counting

## Core Functions

### 1. checkHealth()

Performs health checks on all configured executors.

```typescript
async function checkHealth(): Promise<HealthReport>
```

**Returns:**
```typescript
{
  overall: "healthy" | "degraded" | "unhealthy",
  timestamp: "2025-10-17T10:30:00.000Z",
  
  executors: {
    notion: {
      executor: "notion",
      status: "up" | "down" | "degraded" | "unknown",
      latency: 150,  // ms
      lastCheck: "2025-10-17T10:30:00.000Z",
      lastSuccess: "2025-10-17T10:30:00.000Z",
      consecutiveFailures: 0,
      error?: "Error message"
    },
    trello: { ... },
    slack: { ... },
    drive: { ... },
    sheets: { ... },
    gmail: { ... },
    "google-tasks": { ... }
  },
  
  summary: {
    total: 7,
    up: 6,
    down: 1,
    degraded: 0,
    unknown: 0
  }
}
```

**Process:**
1. Run health check for each executor in parallel
2. Measure latency (ms)
3. Track consecutive failures
4. Determine status (UP/DOWN/DEGRADED)
5. Calculate overall health
6. Emit events on status changes
7. Update health history
8. Return health report

**Features:**
- Timeout protection (10 seconds default)
- Consecutive failure threshold (3 failures = DOWN)
- Status change detection
- Event emission
- Error capture

### 2. start()

Starts periodic health checks.

```typescript
function start(): void
```

**Behavior:**
- Runs initial health check immediately
- Schedules periodic checks every 5 minutes (configurable)
- Logs health status changes
- Emits events on degradation

**Example:**
```typescript
import healthChecker from './workflows/health-checker';

// Start health checker
healthChecker.start();

// Listen for degradation
healthChecker.on('health:degraded', (report) => {
  console.log('⚠️ Health degraded!');
  console.log(`Down executors: ${report.summary.down}`);
  
  // Send alert
  notifyOpsTeam(report);
});
```

### 3. stop()

Stops periodic health checks.

```typescript
function stop(): void
```

**Behavior:**
- Clears interval timer
- Stops scheduling new checks
- Preserves current health status
- Does not clear history

### 4. getCurrentHealth()

Gets current health status.

```typescript
function getCurrentHealth(): HealthReport | null
```

**Returns:** Latest health report or null if no checks run yet

**Example:**
```typescript
const health = healthChecker.getCurrentHealth();

if (health) {
  console.log(`Overall: ${health.overall}`);
  console.log(`Up: ${health.summary.up}/${health.summary.total}`);
  
  // Check specific executor
  const notionHealth = health.executors.notion;
  if (notionHealth?.status === 'down') {
    console.log(`Notion is down: ${notionHealth.error}`);
  }
}
```

### 5. getExecutorHealth()

Gets health status of specific executor.

```typescript
function getExecutorHealth(executor: ExecutorType): ExecutorHealth | null
```

**Example:**
```typescript
const slackHealth = healthChecker.getExecutorHealth('slack');

if (slackHealth) {
  console.log(`Slack Status: ${slackHealth.status}`);
  console.log(`Latency: ${slackHealth.latency}ms`);
  console.log(`Last Check: ${slackHealth.lastCheck}`);
}
```

### 6. getHealthHistory()

Gets health history for an executor.

```typescript
function getHealthHistory(
  executor: ExecutorType,
  limit?: number
): ExecutorHealth[]
```

**Parameters:**
- `executor`: Executor to get history for
- `limit`: Max entries to return (default: 100)

**Returns:** Array of historical health checks

**Example:**
```typescript
const history = healthChecker.getHealthHistory('notion', 50);

// Calculate uptime
const totalChecks = history.length;
const successfulChecks = history.filter(h => h.status === 'up').length;
const uptime = (successfulChecks / totalChecks) * 100;

console.log(`Notion uptime (last 50 checks): ${uptime.toFixed(2)}%`);
```

### 7. getExecutorsByStatus()

Gets all executors with a specific status.

```typescript
function getExecutorsByStatus(status: HealthStatus): ExecutorType[]
```

**Example:**
```typescript
// Get all down executors
const downExecutors = healthChecker.getExecutorsByStatus('down');

if (downExecutors.length > 0) {
  console.log('⚠️ Down executors:', downExecutors.join(', '));
  
  // Alert ops team
  sendAlert({
    severity: 'critical',
    message: `${downExecutors.length} executors down`,
    executors: downExecutors
  });
}
```

## Key Features

### 1. Executor-Specific Health Checks

Each executor has a tailored health check:

**Notion:**
```typescript
// Query test database (simple read)
await notionClient.databases.query({
  database_id: config.testDatabase
});
```

**Trello:**
```typescript
// List boards (simple read)
await fetch(
  `https://api.trello.com/1/members/me/boards?key=${key}&token=${token}`
);
```

**Slack:**
```typescript
// Post to test channel
await slackClient.chat.postMessage({
  channel: config.testChannel,
  text: 'Health check ping'
});
```

**Gmail:**
```typescript
// List labels
await gmail.users.labels.list({ userId: 'me' });
```

**Drive:**
```typescript
// List root folder
await drive.files.list({
  pageSize: 1,
  fields: 'files(id, name)'
});
```

**Sheets:**
```typescript
// Read cell from test sheet
await sheets.spreadsheets.values.get({
  spreadsheetId: config.testSpreadsheet,
  range: config.testCell
});
```

**Google Tasks:**
```typescript
// List task lists
await tasks.tasklists.list();
```

### 2. Health Status Determination

**UP (Healthy):**
- Check succeeded
- Latency measured
- No consecutive failures

**DEGRADED:**
- Check failed but below threshold
- 1-2 consecutive failures
- Executor may recover

**DOWN:**
- Check failed consistently
- 3+ consecutive failures (configurable)
- Requires attention

**UNKNOWN:**
- Unable to determine status
- Configuration issue
- First check pending

### 3. Overall Health Calculation

```typescript
if (down === 0 && degraded === 0) {
  overall = 'healthy';
} else if (down >= 3) {  // unhealthyThreshold
  overall = 'unhealthy';
} else if (down >= 1 || degraded > 0) {  // degradedThreshold
  overall = 'degraded';
} else {
  overall = 'healthy';
}
```

### 4. Event System

**Available Events:**

1. **health:checked** - Every health check completion
2. **health:degraded** - Overall health degraded
3. **health:unhealthy** - Overall health unhealthy
4. **health:recovered** - Overall health recovered
5. **executor:status_changed** - Executor status changed
6. **executor:down** - Executor went down
7. **executor:recovered** - Executor recovered

**Example Usage:**
```typescript
// Monitor overall health
healthChecker.on('health:degraded', (report) => {
  console.log('⚠️ System health degraded');
  console.log(`Down: ${report.summary.down}`);
  console.log(`Degraded: ${report.summary.degraded}`);
  
  // Send notification
  sendSlackAlert('#ops', 'System health degraded');
});

// Monitor specific executors
healthChecker.on('executor:down', (executor, error) => {
  console.log(`❌ ${executor} is down: ${error}`);
  
  // Send page
  sendPagerDutyAlert({
    severity: 'error',
    summary: `${executor} executor is down`,
    details: error
  });
});

// Track recoveries
healthChecker.on('executor:recovered', (executor) => {
  console.log(`✅ ${executor} has recovered`);
  
  // Send notification
  sendSlackMessage('#ops', `${executor} is back online`);
});
```

### 5. Consecutive Failure Tracking

```typescript
{
  executor: 'notion',
  status: 'degraded',  // First failure
  consecutiveFailures: 1,
  lastSuccess: '2025-10-17T10:25:00.000Z'
}

// After 2nd failure
{
  status: 'degraded',  // Still degraded
  consecutiveFailures: 2
}

// After 3rd failure (threshold reached)
{
  status: 'down',  // Now marked as down
  consecutiveFailures: 3
}

// After recovery
{
  status: 'up',
  consecutiveFailures: 0,
  lastSuccess: '2025-10-17T10:45:00.000Z'
}
```

### 6. Latency Measurement

```typescript
// Each check measures latency
{
  executor: 'slack',
  status: 'up',
  latency: 85,  // 85ms response time
  lastCheck: '2025-10-17T10:30:00.000Z'
}
```

**Use Cases:**
- Performance monitoring
- Timeout tuning
- SLA tracking
- Degradation detection (latency spikes)

### 7. Historical Tracking

```typescript
// Maintains last 1000 checks per executor
const history = healthChecker.getHealthHistory('notion', 100);

// Calculate metrics
const avgLatency = history.reduce((sum, h) => sum + h.latency, 0) / history.length;
const uptime = history.filter(h => h.status === 'up').length / history.length * 100;

console.log(`Notion - Avg Latency: ${avgLatency.toFixed(2)}ms, Uptime: ${uptime.toFixed(2)}%`);
```

### 8. Configuration System

```typescript
healthChecker.configure({
  enabled: true,
  checkInterval: 5 * 60 * 1000,      // 5 minutes
  checkTimeout: 10000,                // 10 seconds
  degradedThreshold: 1,               // 1 down = degraded
  unhealthyThreshold: 3,              // 3 down = unhealthy
  consecutiveFailureThreshold: 3,     // 3 failures = down
  enableAutoRecovery: true,
  
  executors: [
    'notion',
    'trello',
    'slack',
    'gmail',
    'drive',
    'sheets',
    'google-tasks'
  ],
  
  testConfigs: {
    notion: {
      testDatabase: process.env.NOTION_TEST_DATABASE_ID,
      operation: 'query'
    },
    slack: {
      testChannel: '#health-checks',
      operation: 'postMessage'
    },
    sheets: {
      testSpreadsheet: process.env.SHEETS_TEST_SPREADSHEET_ID,
      testCell: 'A1',
      operation: 'readCell'
    }
    // ...
  }
});
```

**Environment Variables:**
```bash
HEALTH_CHECKS_ENABLED=true
NOTION_TEST_DATABASE_ID=abc123
SLACK_TEST_CHANNEL=#health-checks
SHEETS_TEST_SPREADSHEET_ID=xyz789
```

### 9. Formatted Output

```typescript
const report = await healthChecker.checkHealth();
const formatted = healthChecker.formatHealthReport(report);

console.log(formatted);
```

**Output:**
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

### 10. Auto-Recovery Monitoring

```typescript
// Automatically tracks recovery
healthChecker.on('executor:recovered', (executor) => {
  const health = healthChecker.getExecutorHealth(executor);
  const history = healthChecker.getHealthHistory(executor, 10);
  
  // Calculate downtime
  const downPeriod = history.filter(h => h.status === 'down').length * 5; // 5 min intervals
  
  console.log(`${executor} recovered after ${downPeriod} minutes`);
  
  // Notify
  sendSlackMessage('#ops', `✅ ${executor} is back online after ${downPeriod}min downtime`);
});
```

## Usage Examples

### Example 1: Basic Health Monitoring

```typescript
import healthChecker from './workflows/health-checker';

// Configure
healthChecker.configure({
  enabled: true,
  checkInterval: 5 * 60 * 1000,  // 5 minutes
  checkTimeout: 10000             // 10 seconds
});

// Start monitoring
healthChecker.start();

// Check current health
const health = healthChecker.getCurrentHealth();
console.log(`Overall: ${health?.overall}`);
console.log(`Up: ${health?.summary.up}/${health?.summary.total}`);
```

### Example 2: Monitor Degradation

```typescript
import healthChecker from './workflows/health-checker';

healthChecker.start();

// Listen for degradation
healthChecker.on('health:degraded', (report) => {
  console.log('⚠️ System health degraded!');
  
  // Get down executors
  const downExecutors = Object.entries(report.executors)
    .filter(([_, health]) => health?.status === 'down')
    .map(([executor]) => executor);
  
  console.log('Down executors:', downExecutors);
  
  // Send alert
  sendSlackAlert('#ops', {
    text: '⚠️ System health degraded',
    fields: [
      { title: 'Down', value: report.summary.down.toString() },
      { title: 'Executors', value: downExecutors.join(', ') }
    ]
  });
});
```

### Example 3: Track Specific Executor

```typescript
import healthChecker from './workflows/health-checker';

healthChecker.start();

// Monitor Notion specifically
healthChecker.on('executor:status_changed', (executor, oldStatus, newStatus) => {
  if (executor === 'notion') {
    console.log(`Notion status: ${oldStatus} → ${newStatus}`);
    
    if (newStatus === 'down') {
      // Notion is down, send alert
      sendPagerDuty({
        severity: 'error',
        summary: 'Notion integration is down',
        service: 'notion-executor'
      });
    }
  }
});
```

### Example 4: Calculate Uptime

```typescript
import healthChecker from './workflows/health-checker';

// Get history
const history = healthChecker.getHealthHistory('slack', 288); // Last 24 hours (5min checks)

// Calculate uptime
const totalChecks = history.length;
const successfulChecks = history.filter(h => h.status === 'up').length;
const uptime = (successfulChecks / totalChecks) * 100;

console.log(`Slack uptime (last 24h): ${uptime.toFixed(2)}%`);

// Calculate average latency
const avgLatency = history.reduce((sum, h) => sum + h.latency, 0) / totalChecks;
console.log(`Slack avg latency: ${avgLatency.toFixed(2)}ms`);
```

### Example 5: Dashboard Integration

```typescript
import express from 'express';
import healthChecker from './workflows/health-checker';

const app = express();

healthChecker.start();

// Health endpoint for load balancer
app.get('/health', (req, res) => {
  const health = healthChecker.getCurrentHealth();
  
  if (!health || health.overall === 'unhealthy') {
    return res.status(503).json({
      status: 'unhealthy',
      message: 'System is unhealthy'
    });
  }
  
  res.json({
    status: health.overall,
    timestamp: health.timestamp,
    summary: health.summary
  });
});

// Detailed health endpoint
app.get('/health/detailed', (req, res) => {
  const health = healthChecker.getCurrentHealth();
  res.json(health);
});

// Executor-specific endpoint
app.get('/health/:executor', (req, res) => {
  const executor = req.params.executor;
  const health = healthChecker.getExecutorHealth(executor);
  
  if (!health) {
    return res.status(404).json({ error: 'Executor not found' });
  }
  
  res.json(health);
});

app.listen(3000);
```

### Example 6: Alert on Critical Executors

```typescript
import healthChecker from './workflows/health-checker';

healthChecker.start();

// Define critical executors
const criticalExecutors = ['notion', 'slack'];

healthChecker.on('executor:down', (executor, error) => {
  if (criticalExecutors.includes(executor)) {
    // Critical executor down, send page
    sendPagerDuty({
      severity: 'critical',
      summary: `CRITICAL: ${executor} is down`,
      details: error,
      urgency: 'high'
    });
    
    // Also send SMS
    sendSMS(ON_CALL_NUMBER, `CRITICAL: ${executor} down - ${error}`);
  } else {
    // Non-critical, just Slack
    sendSlackAlert('#ops', `⚠️ ${executor} is down: ${error}`);
  }
});
```

### Example 7: Auto-Recovery Notifications

```typescript
import healthChecker from './workflows/health-checker';

healthChecker.start();

// Track downtime
const downtimeStart = new Map<string, Date>();

healthChecker.on('executor:down', (executor) => {
  downtimeStart.set(executor, new Date());
});

healthChecker.on('executor:recovered', (executor) => {
  const startTime = downtimeStart.get(executor);
  
  if (startTime) {
    const downtime = Date.now() - startTime.getTime();
    const minutes = Math.floor(downtime / 60000);
    
    console.log(`✅ ${executor} recovered after ${minutes} minutes`);
    
    // Send notification
    sendSlackMessage('#ops', {
      text: `✅ ${executor} is back online`,
      fields: [
        { title: 'Downtime', value: `${minutes} minutes` }
      ]
    });
    
    downtimeStart.delete(executor);
  }
});
```

### Example 8: Scheduled Reports

```typescript
import healthChecker from './workflows/health-checker';
import cron from 'node-cron';

healthChecker.start();

// Daily health report at 9 AM
cron.schedule('0 9 * * *', () => {
  const report = healthChecker.getCurrentHealth();
  
  if (report) {
    // Calculate 24h uptime for each executor
    const uptimeReport = healthChecker.getConfig().executors.map(executor => {
      const history = healthChecker.getHealthHistory(executor, 288); // 24h
      const uptime = history.filter(h => h.status === 'up').length / history.length * 100;
      const avgLatency = history.reduce((sum, h) => sum + h.latency, 0) / history.length;
      
      return {
        executor,
        uptime: uptime.toFixed(2),
        avgLatency: avgLatency.toFixed(2)
      };
    });
    
    // Send email report
    sendEmail({
      to: 'ops-team@company.com',
      subject: 'Daily Health Report',
      body: `
        Overall Status: ${report.overall}
        
        24-Hour Uptime:
        ${uptimeReport.map(r => `${r.executor}: ${r.uptime}% (${r.avgLatency}ms avg)`).join('\n')}
      `
    });
  }
});
```

### Example 9: Retry Failed Checks

```typescript
import healthChecker from './workflows/health-checker';

healthChecker.start();

// Auto-retry when executor goes down
healthChecker.on('executor:down', async (executor, error) => {
  console.log(`${executor} is down, initiating immediate retry...`);
  
  // Wait 30 seconds
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  // Trigger manual check
  const report = await healthChecker.checkHealth();
  
  const executorHealth = report.executors[executor];
  
  if (executorHealth?.status === 'up') {
    console.log(`✅ ${executor} recovered on retry`);
  } else {
    console.log(`❌ ${executor} still down after retry`);
  }
});
```

### Example 10: Integration with Metrics Collector

```typescript
import healthChecker from './workflows/health-checker';
import metricsCollector from './workflows/metrics-collector';

healthChecker.start();

// Record health metrics
healthChecker.on('health:checked', (report) => {
  // Record overall health
  metricsCollector.recordMetric(
    'system:health_check',
    metricsCollector.ActionStatus.SUCCESS,
    0,
    {
      overall: report.overall,
      up: report.summary.up,
      down: report.summary.down,
      degraded: report.summary.degraded
    }
  );
  
  // Record per-executor metrics
  Object.entries(report.executors).forEach(([executor, health]) => {
    if (health) {
      metricsCollector.recordMetric(
        `${executor}:health_check`,
        health.status === 'up' ? 
          metricsCollector.ActionStatus.SUCCESS : 
          metricsCollector.ActionStatus.FAILURE,
        health.latency,
        {
          status: health.status,
          consecutiveFailures: health.consecutiveFailures
        }
      );
    }
  });
});
```

## Benefits

1. **Proactive Monitoring**
   - Detect issues before users report them
   - Early warning system
   - Prevent cascading failures
   - Maintain high availability

2. **Operational Visibility**
   - Real-time health status
   - Historical tracking
   - Uptime calculations
   - Latency monitoring

3. **Automated Alerting**
   - Event-driven notifications
   - Severity-based routing
   - Auto-recovery tracking
   - Status change logging

4. **Performance Insights**
   - Latency measurement
   - Response time trends
   - Degradation detection
   - Capacity planning

5. **SLA Compliance**
   - Uptime tracking
   - Downtime reporting
   - Performance baselines
   - Compliance evidence

6. **Debugging Support**
   - Error capture
   - Consecutive failure tracking
   - Last success timestamp
   - Health history

## Integration Points

### With Metrics Collector
```typescript
healthChecker.on('health:checked', (report) => {
  metricsCollector.recordMetric(
    'system:health_check',
    report.overall === 'healthy' ? 'success' : 'failure',
    0,
    { summary: report.summary }
  );
});
```

### With Alerting System
```typescript
healthChecker.on('health:degraded', (report) => {
  alerting.send({
    severity: 'warning',
    title: 'System Health Degraded',
    details: report
  });
});
```

### With Dashboard
```typescript
app.get('/api/health', (req, res) => {
  const health = healthChecker.getCurrentHealth();
  res.json(health);
});
```

### With Load Balancer
```typescript
app.get('/health', (req, res) => {
  const health = healthChecker.getCurrentHealth();
  const status = health?.overall === 'unhealthy' ? 503 : 200;
  res.status(status).json({ status: health?.overall });
});
```

## Success Criteria

✅ **Executor Health Checks**
- [x] Notion: Query database (simple read test)
- [x] Trello: List boards (simple read test)
- [x] Slack: Post to test channel
- [x] Drive: List root folder
- [x] Sheets: Read cell from test sheet
- [x] Gmail: List labels
- [x] Google Tasks: List task lists

✅ **Health Status**
- [x] Status types: up, down, degraded, unknown
- [x] Overall health: healthy, degraded, unhealthy
- [x] Latency measurement (ms)
- [x] Last check timestamp
- [x] Consecutive failure tracking

✅ **Periodic Checks**
- [x] Runs every 5 minutes (configurable)
- [x] Automatic scheduling
- [x] Start/stop controls

✅ **Events**
- [x] health:degraded event
- [x] health:unhealthy event
- [x] health:recovered event
- [x] executor:down event
- [x] executor:recovered event
- [x] Status change logging

✅ **Additional Features**
- [x] Historical tracking
- [x] Configuration system
- [x] Timeout protection
- [x] Formatted output
- [x] Dashboard integration

---

**Status:** ✅ Prompt 23 Complete - Health Check System implemented with periodic monitoring, executor-specific tests, event system, and comprehensive health tracking. (1,000+ lines)
