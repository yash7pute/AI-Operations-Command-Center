# Circuit Breaker for Actions - Complete Documentation

## Overview

The Circuit Breaker pattern prevents cascading failures by automatically detecting failing operations and temporarily stopping requests to give the failing service time to recover. This implementation provides per-executor circuit breakers for all external services (Notion, Trello, Slack, Gmail, Drive, Sheets, etc.).

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Quick Start](#quick-start)
3. [Circuit States](#circuit-states)
4. [Configuration](#configuration)
5. [API Reference](#api-reference)
6. [Usage Examples](#usage-examples)
7. [Event System](#event-system)
8. [Statistics & Monitoring](#statistics--monitoring)
9. [Best Practices](#best-practices)
10. [Production Deployment](#production-deployment)

---

## Core Concepts

### What is a Circuit Breaker?

A circuit breaker monitors function execution and prevents cascading failures:

1. **Normal Operation (CLOSED)**: Requests pass through normally
2. **Failure Detection**: Tracks consecutive failures
3. **Automatic Shutdown (OPEN)**: Stops requests after threshold
4. **Recovery Testing (HALF_OPEN)**: Tries limited requests
5. **Auto-Recovery (CLOSED)**: Returns to normal after successes

### Why Use Circuit Breakers?

- **Prevent Cascading Failures**: Stop retrying a service that's down
- **Fast Fail**: Return immediately instead of waiting for timeout
- **Automatic Recovery**: Test service health automatically
- **Resource Protection**: Prevent resource exhaustion
- **Fallback Support**: Return cached results when circuit is open

---

## Quick Start

### Basic Usage

```typescript
import * as circuitBreaker from './workflows/circuit-breaker';

// Execute with circuit breaker protection
const result = await circuitBreaker.execute(
  'notion',
  async () => {
    // Your API call
    return await notionClient.createPage({ ... });
  }
);

if (result.success) {
  console.log('Success:', result.data);
} else if (result.rejected) {
  console.log('Circuit is open, request rejected');
} else {
  console.log('Request failed:', result.error);
}
```

### Check Circuit State

```typescript
// Check if circuit is open
if (circuitBreaker.isOpen('notion')) {
  console.log('Notion circuit is open - service may be down');
}

// Get detailed state
const state = circuitBreaker.getState('notion');
console.log(`Circuit state: ${state}`); // CLOSED, OPEN, or HALF_OPEN
```

### Monitor Events

```typescript
// Listen for circuit state changes
circuitBreaker.on('circuit:opened', (executorName, stats) => {
  console.error(`⚠️ Circuit opened for ${executorName}`);
  console.log(`Consecutive failures: ${stats.consecutiveFailures}`);
  console.log(`Next attempt at: ${stats.nextAttemptTime}`);
});

circuitBreaker.on('circuit:closed', (executorName, stats) => {
  console.log(`✅ Circuit closed for ${executorName} - service recovered`);
});
```

---

## Circuit States

### CLOSED (Normal Operation)

- **Behavior**: All requests pass through
- **Transition**: Opens after 5 failures within 1 minute
- **Monitoring**: Tracks failure count

```typescript
// Example: CLOSED state
const result = await circuitBreaker.execute('trello', async () => {
  return await trelloClient.createCard({ ... });
});
// Request executes normally
```

### OPEN (Circuit Tripped)

- **Behavior**: Rejects all requests immediately
- **Duration**: 30 seconds (configurable)
- **Transition**: Moves to HALF_OPEN after timeout
- **Fallback**: Returns cached result if available

```typescript
// Example: OPEN state behavior
const result = await circuitBreaker.execute('slack', async () => {
  return await slackClient.postMessage({ ... });
});

if (result.rejected) {
  console.log('Circuit is open');
  if (result.fromCache) {
    console.log('Using cached result');
  }
}
```

### HALF_OPEN (Testing Recovery)

- **Behavior**: Allows limited requests through
- **Success**: After 2 successes, transitions to CLOSED
- **Failure**: Any failure immediately reopens circuit
- **Purpose**: Test if service has recovered

```typescript
// Example: HALF_OPEN state
// After 30 seconds of being OPEN, circuit moves to HALF_OPEN
// Next 2 requests will test if service recovered

const result = await circuitBreaker.execute('notion', async () => {
  return await notionClient.query({ ... });
});

// If successful, consecutive success count increases
// After 2 successes, circuit closes
```

---

## Configuration

### Default Configuration

```typescript
{
  failureThreshold: 5,           // Open after 5 failures
  failureWindow: 60 * 1000,      // Within 1 minute
  resetTimeout: 30 * 1000,       // Try half-open after 30 seconds
  successThreshold: 2,           // Close after 2 successes in half-open
  requestTimeout: 10 * 1000,     // 10 second request timeout
  cacheFallback: true,           // Use cached fallback
  fallbackMaxAge: 5 * 60 * 1000  // Cache valid for 5 minutes
}
```

### Custom Configuration

```typescript
// Configure for a specific executor
circuitBreaker.configure('notion', {
  failureThreshold: 3,        // More sensitive
  failureWindow: 30 * 1000,   // Shorter window
  resetTimeout: 60 * 1000,    // Longer recovery time
  successThreshold: 3,        // Need more successes
  cacheFallback: true,        // Enable fallback
  fallbackMaxAge: 10 * 60 * 1000 // 10 minute cache
});

// Configure for high-traffic service
circuitBreaker.configure('slack', {
  failureThreshold: 10,       // More tolerant
  failureWindow: 120 * 1000,  // Longer window
  resetTimeout: 20 * 1000,    // Quick recovery
  requestTimeout: 5 * 1000    // Fast timeout
});
```

### Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `failureThreshold` | number | 5 | Failures to open circuit |
| `failureWindow` | number | 60000 | Time window for counting failures (ms) |
| `resetTimeout` | number | 30000 | Time before trying HALF_OPEN (ms) |
| `successThreshold` | number | 2 | Successes to close from HALF_OPEN |
| `requestTimeout` | number | 10000 | Individual request timeout (ms) |
| `cacheFallback` | boolean | true | Enable cached fallback |
| `fallbackMaxAge` | number | 300000 | Max cache age (ms) |

---

## API Reference

### Core Functions

#### `execute<T>(executorName: string, fn: () => Promise<T>): Promise<ExecutionResult<T>>`

Execute function with circuit breaker protection.

```typescript
const result = await circuitBreaker.execute('notion', async () => {
  return await notionClient.createPage({ ... });
});

// Result structure
interface ExecutionResult<T> {
  success: boolean;        // Whether execution succeeded
  data?: T;               // Result data if successful
  error?: Error;          // Error if failed
  fromCache: boolean;     // Whether result is from cache
  rejected: boolean;      // Whether request was rejected
  circuitState: CircuitState; // State at execution time
  executionTime: number;  // Execution time in ms
}
```

#### `getState(executorName: string): CircuitState | null`

Get current circuit state.

```typescript
const state = circuitBreaker.getState('trello');
// Returns: CircuitState.CLOSED | CircuitState.OPEN | CircuitState.HALF_OPEN | null
```

#### `getStats(executorName: string): CircuitBreakerStats | null`

Get detailed statistics for executor.

```typescript
const stats = circuitBreaker.getStats('slack');
if (stats) {
  console.log(`State: ${stats.state}`);
  console.log(`Total requests: ${stats.totalRequests}`);
  console.log(`Success rate: ${(stats.successfulRequests / stats.totalRequests * 100).toFixed(1)}%`);
  console.log(`Consecutive failures: ${stats.consecutiveFailures}`);
}
```

#### `getAllStats(): Map<string, CircuitBreakerStats>`

Get statistics for all executors.

```typescript
const allStats = circuitBreaker.getAllStats();
allStats.forEach((stats, executorName) => {
  console.log(`${executorName}: ${stats.state}`);
});
```

### Configuration Functions

#### `configure(executorName: string, config: Partial<CircuitBreakerConfig>): void`

Configure circuit breaker for executor.

```typescript
circuitBreaker.configure('gmail', {
  failureThreshold: 3,
  resetTimeout: 45 * 1000,
  cacheFallback: true
});
```

### Control Functions

#### `reset(executorName: string): void`

Reset circuit breaker to initial state.

```typescript
// Manually reset a circuit
circuitBreaker.reset('notion');
```

#### `resetAll(): void`

Reset all circuit breakers.

```typescript
// Reset all circuits (e.g., during deployment)
circuitBreaker.resetAll();
```

#### `openCircuit(executorName: string): void`

Manually open circuit.

```typescript
// Force circuit open (e.g., during maintenance)
circuitBreaker.openCircuit('notion');
```

#### `closeCircuit(executorName: string): void`

Manually close circuit.

```typescript
// Force circuit closed after manual fix
circuitBreaker.closeCircuit('notion');
```

### Query Functions

#### `isOpen(executorName: string): boolean`

Check if circuit is open.

```typescript
if (circuitBreaker.isOpen('trello')) {
  console.log('Trello service is currently unavailable');
}
```

#### `isClosed(executorName: string): boolean`

Check if circuit is closed.

```typescript
if (circuitBreaker.isClosed('slack')) {
  console.log('Slack service is healthy');
}
```

#### `isHalfOpen(executorName: string): boolean`

Check if circuit is half-open.

```typescript
if (circuitBreaker.isHalfOpen('gmail')) {
  console.log('Gmail service is being tested for recovery');
}
```

#### `getExecutors(): string[]`

Get list of all executors with circuit breakers.

```typescript
const executors = circuitBreaker.getExecutors();
console.log('Active circuit breakers:', executors);
// ['notion', 'trello', 'slack', 'gmail']
```

### Event Functions

#### `on<E>(event: E, listener: CircuitBreakerEvents[E]): void`

Register event listener.

```typescript
circuitBreaker.on('circuit:opened', (executorName, stats) => {
  console.error(`Circuit opened for ${executorName}`);
});

circuitBreaker.on('request:failure', (executorName, error) => {
  console.warn(`Request failed for ${executorName}: ${error.message}`);
});
```

#### `off<E>(event: E, listener: CircuitBreakerEvents[E]): void`

Remove event listener.

```typescript
const listener = (executorName, stats) => {
  console.log(`Circuit opened: ${executorName}`);
};

circuitBreaker.on('circuit:opened', listener);
// Later...
circuitBreaker.off('circuit:opened', listener);
```

### Utility Functions

#### `formatStats(stats: CircuitBreakerStats): string`

Format statistics for display.

```typescript
const stats = circuitBreaker.getStats('notion');
if (stats) {
  console.log(circuitBreaker.formatStats(stats));
}

// Output:
// === Circuit Breaker: notion ===
// State: CLOSED
// 
// Requests:
//   Total: 150
//   Successful: 145 (96.7%)
//   Failed: 5
//   Rejected: 0 (0.0%)
// ...
```

#### `getSummary(): string`

Get summary of all circuit breakers.

```typescript
console.log(circuitBreaker.getSummary());

// Output:
// ========================================
//       CIRCUIT BREAKER SUMMARY
// ========================================
// 
// Executor         State       Requests   Success%   Rejected
// --------------------------------------------------------
// notion           CLOSED      150        96.7%      0
// trello           OPEN        85         70.6%      15
// slack            CLOSED      200        99.0%      0
// ...
```

#### `destroy(): void`

Clean up all circuit breakers.

```typescript
// Clean up before shutdown
circuitBreaker.destroy();
```

---

## Usage Examples

### Example 1: Basic API Call Protection

```typescript
import * as circuitBreaker from './workflows/circuit-breaker';

async function createNotionPage(title: string, content: string) {
  const result = await circuitBreaker.execute('notion', async () => {
    return await notionClient.pages.create({
      parent: { database_id: databaseId },
      properties: {
        title: { title: [{ text: { content: title } }] },
        content: { rich_text: [{ text: { content } }] }
      }
    });
  });

  if (result.success) {
    return result.data;
  } else if (result.rejected) {
    throw new Error('Notion service is currently unavailable');
  } else {
    throw result.error;
  }
}
```

### Example 2: With Retry Integration

```typescript
import * as retry from './workflows/retry-manager';
import * as circuitBreaker from './workflows/circuit-breaker';

async function robustNotionCall(operation: string, fn: () => Promise<any>) {
  // First check circuit breaker
  if (circuitBreaker.isOpen('notion')) {
    throw new Error('Notion circuit is open - service unavailable');
  }

  // Execute with both retry and circuit breaker
  const result = await circuitBreaker.execute('notion', async () => {
    return await retry.retry(fn, {
      platform: retry.Platform.NOTION,
      operation
    });
  });

  if (result.rejected) {
    throw new Error('Circuit breaker rejected request');
  }

  if (!result.success) {
    throw result.error;
  }

  return result.data;
}
```

### Example 3: Fallback Pattern

```typescript
async function getNotionData() {
  const result = await circuitBreaker.execute('notion', async () => {
    return await notionClient.databases.query({
      database_id: databaseId
    });
  });

  if (result.success) {
    if (result.fromCache) {
      console.log('⚠️ Using cached data - Notion may be down');
    }
    return result.data;
  }

  // Circuit is open and no cache available
  throw new Error('Notion service unavailable and no cached data');
}
```

### Example 4: Monitoring Dashboard

```typescript
import * as circuitBreaker from './workflows/circuit-breaker';

// Setup monitoring
function setupCircuitBreakerMonitoring() {
  // Log circuit state changes
  circuitBreaker.on('circuit:opened', (executorName, stats) => {
    console.error(`🔴 CIRCUIT OPENED: ${executorName}`);
    console.error(`  Consecutive failures: ${stats.consecutiveFailures}`);
    console.error(`  Total failures: ${stats.failedRequests}`);
    console.error(`  Next attempt: ${stats.nextAttemptTime?.toISOString()}`);
    
    // Send alert
    alerting.send({
      severity: 'critical',
      title: `Circuit Breaker Opened: ${executorName}`,
      message: `Service is experiencing failures. Circuit will retry in 30 seconds.`
    });
  });

  circuitBreaker.on('circuit:closed', (executorName, stats) => {
    console.log(`🟢 CIRCUIT CLOSED: ${executorName}`);
    console.log(`  Service recovered after ${stats.timesOpened} openings`);
    
    // Send recovery notification
    alerting.send({
      severity: 'info',
      title: `Circuit Breaker Closed: ${executorName}`,
      message: `Service has recovered and is operating normally.`
    });
  });

  circuitBreaker.on('circuit:half-open', (executorName, stats) => {
    console.log(`🟡 CIRCUIT HALF-OPEN: ${executorName}`);
    console.log(`  Testing service recovery...`);
  });

  // Log all failures
  circuitBreaker.on('request:failure', (executorName, error) => {
    console.warn(`⚠️ Request failed for ${executorName}: ${error.message}`);
  });

  // Log rejections
  circuitBreaker.on('request:rejected', (executorName) => {
    console.warn(`🚫 Request rejected by circuit breaker: ${executorName}`);
  });

  // Log fallback usage
  circuitBreaker.on('fallback:used', (executorName) => {
    console.warn(`💾 Using cached fallback for ${executorName}`);
  });
}

// Display dashboard
function displayCircuitBreakerDashboard() {
  console.log(circuitBreaker.getSummary());
  
  const allStats = circuitBreaker.getAllStats();
  allStats.forEach((stats) => {
    if (stats.state !== circuitBreaker.CircuitState.CLOSED) {
      console.log(circuitBreaker.formatStats(stats));
    }
  });
}

// Periodic monitoring
setInterval(displayCircuitBreakerDashboard, 30 * 1000); // Every 30 seconds
```

### Example 5: Integration with Workflow Orchestrator

```typescript
import * as circuitBreaker from './workflows/circuit-breaker';

async function executeToolWithCircuitBreaker(
  toolName: string,
  executorName: string,
  args: any
) {
  // Check circuit state before expensive operations
  if (circuitBreaker.isOpen(executorName)) {
    logger.warn(`Circuit open for ${executorName}, skipping tool ${toolName}`);
    return {
      success: false,
      error: `Service ${executorName} is currently unavailable`
    };
  }

  // Execute with circuit breaker
  const result = await circuitBreaker.execute(executorName, async () => {
    return await executeTool(toolName, args);
  });

  return {
    success: result.success,
    data: result.data,
    error: result.error?.message,
    fromCache: result.fromCache,
    rejected: result.rejected
  };
}
```

### Example 6: Graceful Degradation

```typescript
async function createTaskWithGracefulDegradation(task: Task) {
  // Try primary service (Notion)
  const notionResult = await circuitBreaker.execute('notion', async () => {
    return await notionClient.createTask(task);
  });

  if (notionResult.success) {
    return { service: 'notion', id: notionResult.data.id };
  }

  // Fallback to Trello
  logger.warn('Notion failed, falling back to Trello');
  const trelloResult = await circuitBreaker.execute('trello', async () => {
    return await trelloClient.createCard(task);
  });

  if (trelloResult.success) {
    return { service: 'trello', id: trelloResult.data.id };
  }

  // Both services failed
  throw new Error('All task services are unavailable');
}
```

### Example 7: Maintenance Mode

```typescript
// Put service in maintenance mode
function enableMaintenanceMode(executorName: string, durationMinutes: number) {
  logger.info(`Enabling maintenance mode for ${executorName}`);
  
  // Open circuit
  circuitBreaker.openCircuit(executorName);
  
  // Automatically close after maintenance
  setTimeout(() => {
    logger.info(`Maintenance mode ended for ${executorName}`);
    circuitBreaker.closeCircuit(executorName);
  }, durationMinutes * 60 * 1000);
}

// Usage
enableMaintenanceMode('notion', 15); // 15 minute maintenance
```

---

## Event System

### Available Events

```typescript
interface CircuitBreakerEvents {
  'circuit:opened': (executorName: string, stats: CircuitBreakerStats) => void;
  'circuit:closed': (executorName: string, stats: CircuitBreakerStats) => void;
  'circuit:half-open': (executorName: string, stats: CircuitBreakerStats) => void;
  'request:success': (executorName: string, executionTime: number) => void;
  'request:failure': (executorName: string, error: Error) => void;
  'request:rejected': (executorName: string) => void;
  'fallback:used': (executorName: string) => void;
}
```

### Event Examples

```typescript
// Circuit state changes
circuitBreaker.on('circuit:opened', (executorName, stats) => {
  console.error(`Circuit opened: ${executorName}`);
  metrics.increment('circuit_breaker.opened', { executor: executorName });
});

circuitBreaker.on('circuit:closed', (executorName, stats) => {
  console.log(`Circuit closed: ${executorName}`);
  metrics.increment('circuit_breaker.closed', { executor: executorName });
});

circuitBreaker.on('circuit:half-open', (executorName, stats) => {
  console.log(`Circuit testing recovery: ${executorName}`);
  metrics.increment('circuit_breaker.half_open', { executor: executorName });
});

// Request events
circuitBreaker.on('request:success', (executorName, executionTime) => {
  metrics.timing('circuit_breaker.request_duration', executionTime, {
    executor: executorName
  });
});

circuitBreaker.on('request:failure', (executorName, error) => {
  metrics.increment('circuit_breaker.request_failed', {
    executor: executorName,
    error: error.message
  });
});

circuitBreaker.on('request:rejected', (executorName) => {
  metrics.increment('circuit_breaker.request_rejected', {
    executor: executorName
  });
});

circuitBreaker.on('fallback:used', (executorName) => {
  metrics.increment('circuit_breaker.fallback_used', {
    executor: executorName
  });
});
```

---

## Statistics & Monitoring

### Statistics Structure

```typescript
interface CircuitBreakerStats {
  executorName: string;
  state: CircuitState;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rejectedRequests: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  timesOpened: number;
  timesClosed: number;
  lastStateChange: Date | null;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  nextAttemptTime: Date | null;
  avgResponseTime: number;
}
```

### Monitoring Metrics

```typescript
// Key metrics to track
function trackCircuitBreakerMetrics() {
  const allStats = circuitBreaker.getAllStats();
  
  allStats.forEach((stats, executorName) => {
    // Success rate
    const successRate = stats.totalRequests > 0
      ? (stats.successfulRequests / stats.totalRequests) * 100
      : 100;
    metrics.gauge('circuit_breaker.success_rate', successRate, {
      executor: executorName
    });

    // Rejection rate
    const rejectionRate = stats.totalRequests > 0
      ? (stats.rejectedRequests / stats.totalRequests) * 100
      : 0;
    metrics.gauge('circuit_breaker.rejection_rate', rejectionRate, {
      executor: executorName
    });

    // Circuit state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)
    const stateValue = {
      [circuitBreaker.CircuitState.CLOSED]: 0,
      [circuitBreaker.CircuitState.HALF_OPEN]: 1,
      [circuitBreaker.CircuitState.OPEN]: 2
    }[stats.state];
    metrics.gauge('circuit_breaker.state', stateValue, {
      executor: executorName
    });

    // Consecutive failures
    metrics.gauge('circuit_breaker.consecutive_failures', stats.consecutiveFailures, {
      executor: executorName
    });

    // Average response time
    metrics.gauge('circuit_breaker.avg_response_time', stats.avgResponseTime, {
      executor: executorName
    });
  });
}

// Run every 10 seconds
setInterval(trackCircuitBreakerMetrics, 10 * 1000);
```

### Health Check Endpoint

```typescript
// Express endpoint for health checks
app.get('/health/circuit-breakers', (req, res) => {
  const allStats = circuitBreaker.getAllStats();
  const health: any = {
    overall: 'healthy',
    circuits: {}
  };

  allStats.forEach((stats, executorName) => {
    const successRate = stats.totalRequests > 0
      ? (stats.successfulRequests / stats.totalRequests) * 100
      : 100;

    health.circuits[executorName] = {
      state: stats.state,
      healthy: stats.state === circuitBreaker.CircuitState.CLOSED,
      successRate: successRate.toFixed(1) + '%',
      totalRequests: stats.totalRequests,
      rejectedRequests: stats.rejectedRequests,
      avgResponseTime: Math.round(stats.avgResponseTime) + 'ms'
    };

    if (stats.state === circuitBreaker.CircuitState.OPEN) {
      health.overall = 'degraded';
    }
  });

  const statusCode = health.overall === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

---

## Best Practices

### 1. Configure Per Service Characteristics

```typescript
// Fast, reliable service
circuitBreaker.configure('slack', {
  failureThreshold: 10,      // More tolerant
  resetTimeout: 20 * 1000,   // Quick recovery
  requestTimeout: 5 * 1000   // Fast timeout
});

// Slow, less reliable service
circuitBreaker.configure('external-api', {
  failureThreshold: 3,       // Less tolerant
  resetTimeout: 60 * 1000,   // Slower recovery
  requestTimeout: 30 * 1000  // Longer timeout
});
```

### 2. Always Handle Rejected Requests

```typescript
const result = await circuitBreaker.execute('notion', fn);

if (result.rejected) {
  // Handle circuit open scenario
  if (result.fromCache) {
    console.warn('Using cached data');
    return result.data;
  } else {
    // No cache, return error or use fallback service
    throw new Error('Service unavailable');
  }
}
```

### 3. Monitor Circuit State Changes

```typescript
// Always log circuit state changes
circuitBreaker.on('circuit:opened', (executorName, stats) => {
  logger.error('Circuit opened', { executorName, stats });
  // Alert operations team
  alerting.send({
    severity: 'critical',
    message: `Circuit breaker opened for ${executorName}`
  });
});
```

### 4. Combine with Retry Logic

```typescript
// Use circuit breaker with retry manager
async function resilientCall(executorName: string, fn: () => Promise<any>) {
  // Check circuit first
  if (circuitBreaker.isOpen(executorName)) {
    throw new Error(`Circuit open for ${executorName}`);
  }

  // Execute with both circuit breaker and retry
  return await circuitBreaker.execute(executorName, async () => {
    return await retry.retry(fn, {
      platform: executorName as any,
      operation: 'api-call'
    });
  });
}
```

### 5. Use Fallback Cache

```typescript
// Enable caching for read operations
circuitBreaker.configure('notion', {
  cacheFallback: true,
  fallbackMaxAge: 10 * 60 * 1000  // 10 minutes
});

// For write operations, disable cache
circuitBreaker.configure('notion-write', {
  cacheFallback: false  // Can't cache writes
});
```

### 6. Reset During Deployments

```typescript
// Reset circuits during deployment
async function handleDeployment() {
  logger.info('Deployment starting, resetting circuit breakers');
  circuitBreaker.resetAll();
  
  // Wait for services to stabilize
  await sleep(5000);
  
  logger.info('Circuit breakers reset, ready for traffic');
}
```

### 7. Test Circuit Breaker Behavior

```typescript
// Test circuit breaker opening
async function testCircuitBreaker() {
  const executorName = 'test-service';
  
  // Configure for quick testing
  circuitBreaker.configure(executorName, {
    failureThreshold: 3,
    failureWindow: 10 * 1000,
    resetTimeout: 5 * 1000,
    successThreshold: 2
  });

  // Cause failures
  for (let i = 0; i < 3; i++) {
    try {
      await circuitBreaker.execute(executorName, async () => {
        throw new Error('Test failure');
      });
    } catch (error) {
      console.log(`Failure ${i + 1}`);
    }
  }

  // Circuit should be open now
  assert(circuitBreaker.isOpen(executorName), 'Circuit should be open');

  // Wait for half-open
  await sleep(5000);

  // Should try requests again
  assert(circuitBreaker.isHalfOpen(executorName), 'Circuit should be half-open');
}
```

---

## Production Deployment

### 1. Configuration

```typescript
// config/circuit-breaker.ts
export const circuitBreakerConfig = {
  notion: {
    failureThreshold: 5,
    failureWindow: 60 * 1000,
    resetTimeout: 30 * 1000,
    successThreshold: 2,
    requestTimeout: 10 * 1000,
    cacheFallback: true,
    fallbackMaxAge: 5 * 60 * 1000
  },
  trello: {
    failureThreshold: 5,
    failureWindow: 60 * 1000,
    resetTimeout: 30 * 1000,
    successThreshold: 2,
    requestTimeout: 10 * 1000,
    cacheFallback: true,
    fallbackMaxAge: 5 * 60 * 1000
  },
  slack: {
    failureThreshold: 10,
    failureWindow: 120 * 1000,
    resetTimeout: 20 * 1000,
    successThreshold: 2,
    requestTimeout: 5 * 1000,
    cacheFallback: false
  },
  gmail: {
    failureThreshold: 5,
    failureWindow: 60 * 1000,
    resetTimeout: 30 * 1000,
    successThreshold: 2,
    requestTimeout: 15 * 1000,
    cacheFallback: true,
    fallbackMaxAge: 10 * 60 * 1000
  }
};

// Apply configuration
Object.entries(circuitBreakerConfig).forEach(([executor, config]) => {
  circuitBreaker.configure(executor, config);
});
```

### 2. Monitoring Setup

```typescript
// monitoring/circuit-breaker.ts
import * as circuitBreaker from '../workflows/circuit-breaker';
import logger from '../utils/logger';

export function setupCircuitBreakerMonitoring() {
  // Log all state changes
  circuitBreaker.on('circuit:opened', (executorName, stats) => {
    logger.error('Circuit opened', {
      executor: executorName,
      consecutiveFailures: stats.consecutiveFailures,
      totalFailures: stats.failedRequests,
      nextAttempt: stats.nextAttemptTime
    });

    // Send alert
    alerting.sendAlert({
      severity: 'critical',
      title: `Circuit Breaker Opened: ${executorName}`,
      description: `Circuit breaker has opened for ${executorName} after ${stats.consecutiveFailures} consecutive failures.`,
      metadata: stats
    });
  });

  circuitBreaker.on('circuit:closed', (executorName, stats) => {
    logger.info('Circuit closed', {
      executor: executorName,
      timesOpened: stats.timesOpened
    });

    // Send recovery notification
    alerting.sendNotification({
      severity: 'info',
      title: `Circuit Breaker Closed: ${executorName}`,
      description: `Circuit breaker for ${executorName} has recovered.`
    });
  });

  // Track metrics
  setInterval(() => {
    const allStats = circuitBreaker.getAllStats();
    allStats.forEach((stats, executorName) => {
      metrics.gauge('circuit_breaker.state', 
        stats.state === circuitBreaker.CircuitState.OPEN ? 1 : 0,
        { executor: executorName }
      );
      
      const successRate = stats.totalRequests > 0
        ? (stats.successfulRequests / stats.totalRequests) * 100
        : 100;
      
      metrics.gauge('circuit_breaker.success_rate', successRate, {
        executor: executorName
      });
    });
  }, 10 * 1000);
}
```

### 3. Graceful Shutdown

```typescript
// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  // Clean up circuit breakers
  circuitBreaker.destroy();
  
  // Wait for in-flight requests
  await sleep(5000);
  
  process.exit(0);
});
```

### 4. Health Checks

```typescript
// Health check with circuit breaker status
app.get('/health', (req, res) => {
  const allStats = circuitBreaker.getAllStats();
  const openCircuits = Array.from(allStats.values()).filter(
    stats => stats.state === circuitBreaker.CircuitState.OPEN
  );

  const health = {
    status: openCircuits.length === 0 ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    circuits: {
      total: allStats.size,
      open: openCircuits.length,
      details: Array.from(allStats.values()).map(stats => ({
        executor: stats.executorName,
        state: stats.state,
        successRate: stats.totalRequests > 0
          ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1) + '%'
          : '100%'
      }))
    }
  };

  res.status(openCircuits.length === 0 ? 200 : 503).json(health);
});
```

---

## Integration Examples

### With Workflow Orchestrator

```typescript
// workflows/orchestrator.ts
import * as circuitBreaker from './circuit-breaker';

async function executeWorkflowStep(step: WorkflowStep) {
  const executorName = step.tool.split(':')[0]; // e.g., 'notion:createPage' -> 'notion'
  
  return await circuitBreaker.execute(executorName, async () => {
    return await executeTool(step.tool, step.args);
  });
}
```

### With Retry Manager

```typescript
// Combined retry + circuit breaker
import * as retry from './retry-manager';
import * as circuitBreaker from './circuit-breaker';

async function robustExecute(
  executorName: string,
  operation: string,
  fn: () => Promise<any>
) {
  // Check circuit first (fast fail)
  if (circuitBreaker.isOpen(executorName)) {
    throw new Error(`Circuit open for ${executorName}`);
  }

  // Execute with circuit breaker and retry
  return await circuitBreaker.execute(executorName, async () => {
    return await retry.retry(fn, {
      platform: executorName as any,
      operation
    });
  });
}
```

### With Idempotency Manager

```typescript
// Triple protection: idempotency + retry + circuit breaker
import * as idempotency from './idempotency-manager';
import * as retry from './retry-manager';
import * as circuitBreaker from './circuit-breaker';

async function ultraRobustExecute(
  executorName: string,
  operation: string,
  reasoning: string,
  fn: () => Promise<any>
) {
  // Check circuit
  if (circuitBreaker.isOpen(executorName)) {
    throw new Error(`Circuit open for ${executorName}`);
  }

  // Execute with all protections
  return await idempotency.executeWithIdempotency(
    reasoning,
    async () => {
      return await circuitBreaker.execute(executorName, async () => {
        return await retry.retry(fn, {
          platform: executorName as any,
          operation
        });
      });
    }
  );
}
```

---

## Troubleshooting

### Circuit Opens Too Frequently

```typescript
// Increase failure threshold or window
circuitBreaker.configure('notion', {
  failureThreshold: 10,      // Increase from 5
  failureWindow: 120 * 1000  // Increase from 60s
});
```

### Circuit Doesn't Open

```typescript
// Check if failures are within the window
const stats = circuitBreaker.getStats('notion');
console.log('Consecutive failures:', stats?.consecutiveFailures);
console.log('Last failure:', stats?.lastFailureTime);

// Decrease threshold
circuitBreaker.configure('notion', {
  failureThreshold: 3  // Decrease from 5
});
```

### Circuit Takes Too Long to Recover

```typescript
// Reduce reset timeout
circuitBreaker.configure('notion', {
  resetTimeout: 15 * 1000  // Reduce from 30s
});
```

### Cache Not Working

```typescript
// Ensure cache is enabled
circuitBreaker.configure('notion', {
  cacheFallback: true,
  fallbackMaxAge: 10 * 60 * 1000  // Increase cache age
});

// Check if result has data
const result = await circuitBreaker.execute('notion', fn);
console.log('From cache:', result.fromCache);
```

---

## Summary

The Circuit Breaker provides:

- **Automatic Failure Detection**: Opens after 5 failures in 1 minute
- **Fast Fail**: Rejects requests immediately when open
- **Automatic Recovery**: Tests service after 30 seconds
- **Fallback Support**: Returns cached results when available
- **Comprehensive Monitoring**: Events and statistics for all operations
- **Per-Executor Configuration**: Customize behavior per service

**Next Steps**: Integrate with workflow orchestrator, retry manager, and idempotency manager for complete reliability infrastructure.
