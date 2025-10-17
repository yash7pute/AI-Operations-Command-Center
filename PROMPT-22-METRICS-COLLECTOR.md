# Prompt 22: Action Metrics Collector

## Overview

The **Action Metrics Collector** is a comprehensive telemetry system that tracks detailed execution metrics for all actions in the AI Operations Command Center. It provides real-time statistics, historical analysis, percentile calculations, and persistent storage for operational insights and performance monitoring.

## What Was Built

A complete metrics collection system in `src/workflows/metrics-collector.ts` (1,200+ lines) featuring:

### Core Components

1. **Metric Recording**
   - Action execution tracking
   - Platform-specific metrics
   - Status tracking (success/failure/retry)
   - Duration measurement
   - Metadata capture

2. **Real-Time Statistics**
   - Current queue depth
   - Actions per minute
   - Success rates
   - Average execution times
   - Recent failures
   - Circuit breaker status

3. **Historical Analysis**
   - Time-range queries
   - Percentile calculations (P50, P95, P99)
   - Retry analysis
   - Approval rate tracking
   - Platform comparisons

4. **Persistent Storage**
   - JSONL file format
   - Automatic flushing
   - Retention management
   - Load on startup

5. **Data Visualization**
   - Export to JSON
   - Export to CSV
   - Formatted console output
   - Dashboard-ready stats

## Core Functions

### 1. recordMetric()

Records a single metric entry with comprehensive metadata.

```typescript
function recordMetric(
  action: string,
  status: ActionStatus,
  duration: number,
  metadata?: any
): string
```

**Parameters:**
- `action`: Action identifier (format: "platform:actionType", e.g., "notion:createPage")
- `status`: Action status (SUCCESS, FAILURE, RETRY, TIMEOUT, CIRCUIT_OPEN, APPROVAL_REQUIRED, APPROVED, REJECTED)
- `duration`: Execution duration in milliseconds
- `metadata`: Optional metadata object containing:
  - `retryCount`: Number of retry attempts
  - `retryReason`: Reason for retry (e.g., "rate_limit", "timeout", "network_error")
  - `circuitBreakerTripped`: Whether circuit breaker was triggered
  - `circuitBreakerState`: Current circuit breaker state
  - `requiredApproval`: Whether action required human approval
  - `wasApproved`: Whether action was approved (if applicable)
  - `confidence`: Confidence score (0-1)
  - `riskLevel`: Risk level (low/medium/high/critical)
  - `fallbackUsed`: Fallback action used
  - `error`: Error message (for failures)
  - Custom fields

**Returns:** Metric ID (string)

**Features:**
- Generates unique metric ID
- Parses action into platform and action type
- Captures current queue depth
- Updates circuit breaker state
- Stores in memory and pending writes
- Auto-trims memory to max entries
- Triggers flush timer

### 2. getMetrics()

Retrieves aggregated metrics for a time range.

```typescript
function getMetrics(timeRange?: TimeRange): AggregatedMetrics
```

**Parameters:**
- `timeRange`: Optional time range (defaults to last 24 hours)
  - `start`: Start date
  - `end`: End date

**Returns:** AggregatedMetrics object containing:

```typescript
{
  timeRange: { start: Date, end: Date },
  
  // Overall stats
  totalExecuted: number,
  successful: number,
  failed: number,
  successRate: number,  // 0-1
  
  // Execution time
  avgExecutionTime: number,  // ms
  executionTimePercentiles: {
    p50: number,  // Median
    p95: number,  // 95th percentile
    p99: number   // 99th percentile
  },
  
  // Reliability
  totalRetries: number,
  circuitBreakerTrips: number,
  
  // Approvals
  actionsRequiringApproval: number,
  approvalRate: number,  // 0-1
  
  // Queue
  avgQueueDepth: number,
  maxQueueDepth: number,
  
  // Breakdowns
  byPlatform: Map<Platform, PlatformMetrics>,
  byActionType: Map<ActionType, ActionTypeMetrics>,
  retryReasons: Map<string, number>
}
```

**Platform Metrics:**
```typescript
{
  platform: Platform,
  totalExecutions: number,
  successful: number,
  failed: number,
  successRate: number,
  avgExecutionTime: number,
  totalRetries: number,
  circuitBreakerTrips: number
}
```

**Action Type Metrics:**
```typescript
{
  actionType: ActionType,
  totalExecutions: number,
  successful: number,
  failed: number,
  successRate: number,
  avgExecutionTime: number
}
```

### 3. getRealTimeStats()

Gets current real-time statistics for dashboard display.

```typescript
function getRealTimeStats(): RealTimeStats
```

**Returns:**
```typescript
{
  // Overall (last hour)
  totalExecuted: number,
  successRate: number,  // 0-1
  avgExecutionTime: number,  // ms
  queueDepth: number,  // Current queue depth
  actionsPerMinute: number,  // Last 5 minutes
  
  // By platform
  byPlatform: {
    [platform: string]: {
      totalExecutions: number,
      successRate: number,
      avgExecutionTime: number,
      lastExecuted?: Date
    }
  },
  
  // By action type
  byActionType: {
    [actionType: string]: {
      totalExecutions: number,
      successRate: number,
      avgExecutionTime: number
    }
  },
  
  // Recent failures (last 10)
  recentFailures: Array<{
    timestamp: Date,
    platform: string,
    actionType: string,
    error: string
  }>,
  
  // Circuit breaker status
  circuitBreakers: {
    [platform: string]: {
      state: string,  // CLOSED, OPEN, HALF_OPEN
      failureCount: number,
      lastTrip?: Date
    }
  }
}
```

**Features:**
- Uses 1-hour window for overall stats
- Uses 5-minute window for actions/minute
- Shows last 10 failures
- Real-time circuit breaker status
- Last execution time per platform

### 4. exportMetrics()

Exports metrics in JSON or CSV format for visualization tools.

```typescript
async function exportMetrics(
  format: 'json' | 'csv',
  timeRange?: TimeRange
): Promise<string>
```

**Parameters:**
- `format`: Export format ('json' or 'csv')
- `timeRange`: Optional time range (defaults to last 24 hours)

**Returns:** Formatted metrics string

**JSON Export:**
```json
{
  "timeRange": {
    "start": "2025-10-17T10:00:00.000Z",
    "end": "2025-10-18T10:00:00.000Z"
  },
  "totalExecuted": 1543,
  "successful": 1487,
  "failed": 56,
  "successRate": 0.964,
  "avgExecutionTime": 245.7,
  "executionTimePercentiles": {
    "p50": 180,
    "p95": 450,
    "p99": 890
  },
  "totalRetries": 23,
  "circuitBreakerTrips": 2,
  "actionsRequiringApproval": 45,
  "approvalRate": 0.933,
  "avgQueueDepth": 3.2,
  "maxQueueDepth": 12,
  "byPlatform": {...},
  "byActionType": {...}
}
```

**CSV Export:**
```csv
metric,value
total_executed,1543
successful,1487
failed,56
success_rate,96.40%
avg_execution_time,245.70ms
p50_execution_time,180.00ms
p95_execution_time,450.00ms
p99_execution_time,890.00ms
total_retries,23
circuit_breaker_trips,2
actions_requiring_approval,45
approval_rate,93.30%
avg_queue_depth,3.20
max_queue_depth,12
```

## Key Features

### 1. Comprehensive Metric Tracking

**Action Execution:**
- Action type (create_task, notify, file, update, query, delete, upload, send, search)
- Platform (notion, trello, slack, gmail, drive, sheets, google-tasks, email)
- Status (success, failure, retry, timeout, circuit_open, approval_required, approved, rejected)
- Duration (milliseconds)
- Timestamp

**Reliability Metrics:**
- Retry count per action
- Retry reasons (rate_limit, timeout, network_error, server_error)
- Circuit breaker trips
- Fallback usage

**Approval Metrics:**
- Actions requiring approval
- Approval/rejection rates
- Approval decision metadata

**Queue Metrics:**
- Queue depth at execution time
- Average queue depth
- Maximum queue depth
- Queue depth trends

### 2. Percentile Calculations

Accurate percentile calculations for execution times:

- **P50 (Median):** 50% of actions complete within this time
- **P95:** 95% of actions complete within this time (typical SLA target)
- **P99:** 99% of actions complete within this time (tail latency)

Used for:
- SLA monitoring
- Performance regression detection
- Capacity planning
- Timeout tuning

### 3. Real-Time Dashboard Statistics

Optimized for dashboard display:

```typescript
// Example real-time stats
{
  totalExecuted: 156,        // Last hour
  successRate: 0.968,        // 96.8%
  avgExecutionTime: 234.5,   // ms
  queueDepth: 4,             // Current
  actionsPerMinute: 2.6,     // Last 5 min
  
  byPlatform: {
    notion: {
      totalExecutions: 67,
      successRate: 0.985,
      avgExecutionTime: 312,
      lastExecuted: Date
    },
    slack: {
      totalExecutions: 45,
      successRate: 1.0,
      avgExecutionTime: 123,
      lastExecuted: Date
    }
    // ...
  },
  
  byActionType: {
    create_task: {
      totalExecutions: 89,
      successRate: 0.977,
      avgExecutionTime: 287
    },
    notify: {
      totalExecutions: 34,
      successRate: 1.0,
      avgExecutionTime: 98
    }
    // ...
  },
  
  recentFailures: [
    {
      timestamp: Date,
      platform: 'notion',
      actionType: 'create_task',
      error: 'Rate limit exceeded'
    }
    // ...
  ],
  
  circuitBreakers: {
    notion: {
      state: 'HALF_OPEN',
      failureCount: 3,
      lastTrip: Date
    }
  }
}
```

### 4. Persistent Storage

**JSONL Format:**
- Each metric is one JSON line
- Easy to append (no file rewrite)
- Efficient parsing (line-by-line)
- Compatible with log aggregators

**Example metrics.jsonl:**
```jsonl
{"id":"metric_1729163400_abc123","timestamp":"2025-10-17T10:30:00.000Z","actionType":"create_task","platform":"notion","status":"success","duration":287,"queueDepth":3}
{"id":"metric_1729163402_def456","timestamp":"2025-10-17T10:30:02.000Z","actionType":"notify","platform":"slack","status":"success","duration":95,"queueDepth":3}
{"id":"metric_1729163405_ghi789","timestamp":"2025-10-17T10:30:05.000Z","actionType":"create_task","platform":"trello","status":"failure","duration":523,"retryCount":2,"retryReason":"rate_limit","queueDepth":4,"metadata":{"error":"Rate limit exceeded"}}
```

**Auto-Flush:**
- Pending writes flushed every 5 seconds
- Ensures data persistence
- Minimizes I/O operations
- Configurable flush interval

**Retention Management:**
- Default 30-day retention
- Old metrics auto-pruned on load
- Configurable retention period
- Keeps only recent metrics in memory

### 5. Memory Management

**In-Memory Store:**
- Max 10,000 entries (configurable)
- Auto-trim when exceeded
- FIFO eviction (oldest first)
- Fast query performance

**Pending Writes Buffer:**
- Accumulates writes between flushes
- Minimizes disk I/O
- Batch writes for efficiency
- Cleared after successful flush

### 6. Platform & Action Type Breakdowns

**By Platform:**
```typescript
{
  platform: 'notion',
  totalExecutions: 456,
  successful: 442,
  failed: 14,
  successRate: 0.969,
  avgExecutionTime: 298.5,
  totalRetries: 8,
  circuitBreakerTrips: 1
}
```

**By Action Type:**
```typescript
{
  actionType: 'create_task',
  totalExecutions: 289,
  successful: 276,
  failed: 13,
  successRate: 0.955,
  avgExecutionTime: 315.7
}
```

### 7. Retry Analysis

**Retry Reasons:**
```typescript
{
  'rate_limit': 45,        // Most common
  'timeout': 12,
  'network_error': 8,
  'server_error': 5,
  'conflict': 3
}
```

Used for:
- Identifying problematic integrations
- Tuning retry strategies
- Capacity planning
- Error budget tracking

### 8. Circuit Breaker Monitoring

**State Tracking:**
```typescript
circuitBreakers: {
  notion: {
    state: 'OPEN',           // Circuit tripped
    failureCount: 5,
    lastTrip: Date           // When it opened
  },
  slack: {
    state: 'CLOSED',         // Healthy
    failureCount: 0
  }
}
```

**Benefits:**
- Real-time circuit breaker status
- Failure count tracking
- Trip time recording
- Recovery monitoring

### 9. Approval Rate Tracking

**Metrics:**
- Actions requiring approval (count)
- Approval rate (%)
- Rejection reasons
- Approval latency

**Example:**
```typescript
{
  actionsRequiringApproval: 45,
  approvedActions: 42,
  approvalRate: 0.933,  // 93.3% approval rate
  rejectedActions: 3
}
```

### 10. Configuration System

**Configuration Options:**
```typescript
{
  enabled: true,                    // Enable/disable collection
  metricsDir: './logs',             // Storage directory
  metricsFile: 'metrics.jsonl',     // File name
  retentionDays: 30,                // Keep 30 days
  maxInMemoryEntries: 10000,        // Max in memory
  flushInterval: 5000,              // Flush every 5s
  enableRealTimeStats: true,        // Enable real-time
  realTimeWindow: 3600000           // 1-hour window
}
```

**Environment Variables:**
```bash
ENABLE_METRICS=true
METRICS_DIR=./logs
```

## Usage Examples

### Example 1: Record Successful Action

```typescript
import metricsCollector from './workflows/metrics-collector';

// Execute action
const startTime = Date.now();
try {
  await notionIntegration.createPage({
    title: 'New Task',
    database: 'tasks'
  });
  
  const duration = Date.now() - startTime;
  
  // Record success
  metricsCollector.recordMetric(
    'notion:createPage',
    metricsCollector.ActionStatus.SUCCESS,
    duration,
    {
      confidence: 0.92,
      riskLevel: 'low',
      queueDepth: 3
    }
  );
  
} catch (error) {
  const duration = Date.now() - startTime;
  
  // Record failure
  metricsCollector.recordMetric(
    'notion:createPage',
    metricsCollector.ActionStatus.FAILURE,
    duration,
    {
      error: error.message,
      confidence: 0.92,
      riskLevel: 'low'
    }
  );
}
```

### Example 2: Record Action with Retries

```typescript
import metricsCollector from './workflows/metrics-collector';

let retryCount = 0;
const maxRetries = 3;
let lastError: any;

const startTime = Date.now();

while (retryCount <= maxRetries) {
  try {
    await trelloIntegration.createCard({
      title: 'New Card',
      list: 'todo'
    });
    
    const duration = Date.now() - startTime;
    
    // Record success (with retry count)
    metricsCollector.recordMetric(
      'trello:createCard',
      metricsCollector.ActionStatus.SUCCESS,
      duration,
      {
        retryCount,
        retryReason: retryCount > 0 ? 'rate_limit' : undefined
      }
    );
    
    break;
    
  } catch (error: any) {
    lastError = error;
    retryCount++;
    
    if (retryCount <= maxRetries) {
      // Record retry
      metricsCollector.recordMetric(
        'trello:createCard',
        metricsCollector.ActionStatus.RETRY,
        Date.now() - startTime,
        {
          retryCount,
          retryReason: error.code === 429 ? 'rate_limit' : 'server_error',
          error: error.message
        }
      );
      
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
    }
  }
}

if (retryCount > maxRetries) {
  // Record final failure
  metricsCollector.recordMetric(
    'trello:createCard',
    metricsCollector.ActionStatus.FAILURE,
    Date.now() - startTime,
    {
      retryCount,
      retryReason: 'max_retries_exceeded',
      error: lastError.message
    }
  );
}
```

### Example 3: Record Circuit Breaker Trip

```typescript
import metricsCollector from './workflows/metrics-collector';

// Update circuit breaker state
metricsCollector.updateCircuitBreakerState('notion', {
  state: 'OPEN',
  failureCount: 5,
  lastTrip: new Date()
});

// Record action with circuit breaker trip
metricsCollector.recordMetric(
  'notion:createPage',
  metricsCollector.ActionStatus.CIRCUIT_OPEN,
  0,
  {
    circuitBreakerTripped: true,
    circuitBreakerState: {
      state: 'OPEN',
      failureCount: 5,
      lastTrip: new Date()
    },
    fallbackUsed: 'trello:createCard'
  }
);
```

### Example 4: Record Approval Action

```typescript
import metricsCollector from './workflows/metrics-collector';

// High-risk action requires approval
const startTime = Date.now();

// Send for approval
const approvalId = await approvalHandler.queueApproval({
  action: 'gmail:send',
  parameters: { to: 'ceo@company.com', subject: 'Important' },
  confidence: 0.68,
  riskLevel: 'high'
});

metricsCollector.recordMetric(
  'gmail:send',
  metricsCollector.ActionStatus.APPROVAL_REQUIRED,
  Date.now() - startTime,
  {
    requiredApproval: true,
    confidence: 0.68,
    riskLevel: 'high'
  }
);

// Wait for approval...
const decision = await waitForApproval(approvalId);

if (decision === 'approved') {
  // Execute and record
  const execStart = Date.now();
  await gmailIntegration.send(...);
  
  metricsCollector.recordMetric(
    'gmail:send',
    metricsCollector.ActionStatus.APPROVED,
    Date.now() - execStart,
    {
      requiredApproval: true,
      wasApproved: true,
      confidence: 0.68,
      riskLevel: 'high'
    }
  );
}
```

### Example 5: Get Historical Metrics

```typescript
import metricsCollector from './workflows/metrics-collector';

// Get last 24 hours
const metrics = metricsCollector.getMetrics();

console.log(`Total Executed: ${metrics.totalExecuted}`);
console.log(`Success Rate: ${(metrics.successRate * 100).toFixed(2)}%`);
console.log(`Avg Execution Time: ${metrics.avgExecutionTime.toFixed(2)}ms`);
console.log(`P95 Execution Time: ${metrics.executionTimePercentiles.p95.toFixed(2)}ms`);
console.log(`P99 Execution Time: ${metrics.executionTimePercentiles.p99.toFixed(2)}ms`);
console.log(`Total Retries: ${metrics.totalRetries}`);
console.log(`Circuit Breaker Trips: ${metrics.circuitBreakerTrips}`);
console.log(`Approval Rate: ${(metrics.approvalRate * 100).toFixed(2)}%`);

// By platform
metrics.byPlatform.forEach((platformMetrics, platform) => {
  console.log(`\n${platform}:`);
  console.log(`  Executions: ${platformMetrics.totalExecutions}`);
  console.log(`  Success Rate: ${(platformMetrics.successRate * 100).toFixed(2)}%`);
  console.log(`  Avg Time: ${platformMetrics.avgExecutionTime.toFixed(2)}ms`);
});

// Get specific time range
const lastWeek = metricsCollector.getMetrics({
  start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  end: new Date()
});
```

### Example 6: Get Real-Time Dashboard Stats

```typescript
import metricsCollector from './workflows/metrics-collector';

// Update queue depth
metricsCollector.setQueueDepth(5);

// Get real-time stats
const stats = metricsCollector.getRealTimeStats();

// Dashboard display
console.log('=== REAL-TIME DASHBOARD ===');
console.log(`Total Executed (last hour): ${stats.totalExecuted}`);
console.log(`Success Rate: ${(stats.successRate * 100).toFixed(2)}%`);
console.log(`Avg Execution Time: ${stats.avgExecutionTime.toFixed(2)}ms`);
console.log(`Queue Depth: ${stats.queueDepth}`);
console.log(`Actions/Minute: ${stats.actionsPerMinute.toFixed(2)}`);

// Platform breakdown
console.log('\nBy Platform:');
Object.entries(stats.byPlatform).forEach(([platform, metrics]) => {
  console.log(`  ${platform}: ${metrics.totalExecutions} actions (${(metrics.successRate * 100).toFixed(0)}% success)`);
});

// Recent failures
if (stats.recentFailures.length > 0) {
  console.log('\nRecent Failures:');
  stats.recentFailures.forEach(failure => {
    console.log(`  ${failure.timestamp.toISOString()}: ${failure.platform}:${failure.actionType} - ${failure.error}`);
  });
}

// Circuit breakers
console.log('\nCircuit Breakers:');
Object.entries(stats.circuitBreakers).forEach(([platform, cb]) => {
  console.log(`  ${platform}: ${cb.state} (failures: ${cb.failureCount})`);
});
```

### Example 7: Export Metrics for Visualization

```typescript
import metricsCollector from './workflows/metrics-collector';
import fs from 'fs';

// Export to JSON
const jsonMetrics = await metricsCollector.exportMetrics('json', {
  start: new Date('2025-10-01'),
  end: new Date('2025-10-17')
});

fs.writeFileSync('metrics-oct.json', jsonMetrics);

// Export to CSV
const csvMetrics = await metricsCollector.exportMetrics('csv', {
  start: new Date('2025-10-01'),
  end: new Date('2025-10-17')
});

fs.writeFileSync('metrics-oct.csv', csvMetrics);

// Can now import into:
// - Grafana
// - Tableau
// - Google Sheets
// - Excel
// - Custom dashboards
```

### Example 8: Load Metrics on Startup

```typescript
import metricsCollector from './workflows/metrics-collector';

// Configure
metricsCollector.configure({
  enabled: true,
  metricsDir: './logs',
  retentionDays: 30,
  maxInMemoryEntries: 10000
});

// Load existing metrics
const loaded = await metricsCollector.loadMetrics();
console.log(`Loaded ${loaded} metrics from disk`);

// Now ready to record new metrics
```

### Example 9: Format for Console Output

```typescript
import metricsCollector from './workflows/metrics-collector';

// Get metrics
const metrics = metricsCollector.getMetrics();

// Format and display
const report = metricsCollector.formatMetrics(metrics);
console.log(report);

// Output:
// ========================================
//       ACTION METRICS REPORT
// ========================================
// 
// Time Range: 2025-10-16T10:00:00.000Z to 2025-10-17T10:00:00.000Z
// 
// Overall Statistics:
//   Total Executed: 1543
//   Successful: 1487
//   Failed: 56
//   Success Rate: 96.40%
// 
// Execution Time:
//   Average: 245.70ms
//   P50: 180.00ms
//   P95: 450.00ms
//   P99: 890.00ms
// ...
```

### Example 10: Integrate with Action Executor

```typescript
import metricsCollector from './workflows/metrics-collector';
import actionExecutor from './workflows/action-executor';

// Wrap executor with metrics
async function executeWithMetrics(action: string, params: any) {
  const startTime = Date.now();
  
  try {
    // Update queue depth
    metricsCollector.setQueueDepth(actionExecutor.getQueueDepth());
    
    // Execute
    const result = await actionExecutor.execute(action, params);
    
    const duration = Date.now() - startTime;
    
    // Record success
    metricsCollector.recordMetric(
      action,
      metricsCollector.ActionStatus.SUCCESS,
      duration,
      {
        confidence: params.confidence,
        riskLevel: params.riskLevel,
        requiredApproval: result.requiredApproval,
        wasApproved: result.wasApproved
      }
    );
    
    return result;
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    // Determine status
    let status = metricsCollector.ActionStatus.FAILURE;
    if (error.code === 'CIRCUIT_OPEN') {
      status = metricsCollector.ActionStatus.CIRCUIT_OPEN;
    } else if (error.code === 'TIMEOUT') {
      status = metricsCollector.ActionStatus.TIMEOUT;
    }
    
    // Record failure
    metricsCollector.recordMetric(
      action,
      status,
      duration,
      {
        error: error.message,
        circuitBreakerTripped: error.code === 'CIRCUIT_OPEN',
        fallbackUsed: error.fallbackAction
      }
    );
    
    throw error;
  }
}
```

## Benefits

1. **Operational Visibility**
   - Real-time performance monitoring
   - Historical trend analysis
   - Failure detection and alerting
   - Capacity planning insights

2. **Performance Optimization**
   - Identify slow actions
   - Detect performance regressions
   - Optimize timeout values
   - Tune retry strategies

3. **Reliability Improvement**
   - Track success rates
   - Monitor circuit breaker health
   - Analyze retry patterns
   - Identify problematic integrations

4. **Data-Driven Decisions**
   - Percentile-based SLAs
   - Platform comparison
   - Action type analysis
   - Resource allocation

5. **Approval Insights**
   - Track approval requirements
   - Monitor approval rates
   - Identify high-risk actions
   - Optimize confidence thresholds

6. **Queue Management**
   - Monitor queue depth
   - Detect backlog buildup
   - Optimize worker count
   - Plan scaling needs

7. **Error Analysis**
   - Recent failure tracking
   - Retry reason breakdown
   - Error pattern detection
   - Root cause analysis

8. **Persistent History**
   - 30-day retention (configurable)
   - Export for long-term storage
   - Compliance and audit trails
   - Historical comparisons

## Integration Points

### With Action Executor
```typescript
// Wrap executions with metrics
actionExecutor.on('action:executed', (event) => {
  metricsCollector.recordMetric(
    event.action,
    event.status,
    event.duration,
    event.metadata
  );
});
```

### With Approval Handler
```typescript
// Track approval metrics
approvalHandler.on('approval:required', (event) => {
  metricsCollector.recordMetric(
    event.action,
    metricsCollector.ActionStatus.APPROVAL_REQUIRED,
    0,
    { requiredApproval: true, riskLevel: event.riskLevel }
  );
});

approvalHandler.on('approval:approved', (event) => {
  metricsCollector.recordMetric(
    event.action,
    metricsCollector.ActionStatus.APPROVED,
    event.duration,
    { wasApproved: true }
  );
});
```

### With Circuit Breaker
```typescript
// Update circuit breaker state
circuitBreaker.on('state:changed', (event) => {
  metricsCollector.updateCircuitBreakerState(
    event.platform,
    {
      state: event.newState,
      failureCount: event.failureCount,
      lastTrip: event.timestamp
    }
  );
});
```

### With Dashboard
```typescript
// Provide real-time stats
app.get('/api/metrics/realtime', (req, res) => {
  const stats = metricsCollector.getRealTimeStats();
  res.json(stats);
});

app.get('/api/metrics/history', (req, res) => {
  const { start, end } = req.query;
  const metrics = metricsCollector.getMetrics({
    start: new Date(start),
    end: new Date(end)
  });
  res.json(metrics);
});
```

## Configuration

```typescript
import metricsCollector from './workflows/metrics-collector';

metricsCollector.configure({
  // Enable/disable
  enabled: true,
  
  // Storage
  metricsDir: './logs',
  metricsFile: 'metrics.jsonl',
  
  // Retention
  retentionDays: 30,
  
  // Memory
  maxInMemoryEntries: 10000,
  
  // Flush
  flushInterval: 5000,  // 5 seconds
  
  // Real-time stats
  enableRealTimeStats: true,
  realTimeWindow: 60 * 60 * 1000  // 1 hour
});
```

## Success Criteria

✅ **Comprehensive Tracking**
- [x] Actions executed by type (create_task, notify, file, update)
- [x] Success/failure rates per platform
- [x] Execution times with percentiles (P50, P95, P99)
- [x] Retry counts and reasons
- [x] Circuit breaker trips
- [x] Queue depth over time
- [x] Actions requiring approval (%)

✅ **Core Functions**
- [x] recordMetric(action, status, duration, metadata)
- [x] getMetrics(timeRange) with aggregation
- [x] getRealTimeStats() for dashboard
- [x] Persistent storage to logs/metrics.jsonl
- [x] Export metrics (JSON, CSV)

✅ **Additional Features**
- [x] In-memory store with auto-trim
- [x] Automatic flush to disk
- [x] Retention management
- [x] Load metrics on startup
- [x] Platform and action type breakdowns
- [x] Retry reason analysis
- [x] Circuit breaker monitoring
- [x] Approval rate tracking
- [x] Formatted console output
- [x] Configuration system

## Next Steps

1. **Immediate:**
   - Test metric recording
   - Verify persistence
   - Test load on startup
   - Validate percentile calculations

2. **Short-term:**
   - Integrate with action executor
   - Add dashboard endpoints
   - Create visualization charts
   - Set up alerting thresholds

3. **Long-term:**
   - Implement metric aggregation service
   - Add anomaly detection
   - Create performance baselines
   - Build custom dashboards

---

**Status:** ✅ Prompt 22 Complete - Action Metrics Collector implemented with comprehensive tracking, real-time statistics, percentile calculations, persistent storage, and export capabilities. (1,200+ lines)
