# Error Handling Quick Start Guide

**For**: Prompt 26 - Error Handling Tests  
**Version**: 1.0  
**Status**: Production Ready

---

## Table of Contents

1. [Quick Overview](#quick-overview)
2. [Running Tests](#running-tests)
3. [RetryManager Quick Reference](#retrymanager-quick-reference)
4. [CircuitBreaker Quick Reference](#circuitbreaker-quick-reference)
5. [FallbackHandler Quick Reference](#fallbackhandler-quick-reference)
6. [RollbackCoordinator Quick Reference](#rollbackcoordinator-quick-reference)
7. [Common Patterns](#common-patterns)
8. [Troubleshooting](#troubleshooting)

---

## Quick Overview

The error handling system provides 4 key mechanisms:

```
┌──────────────────────────────────────────────────────┐
│ 1. RetryManager        → Retry transient failures    │
│ 2. CircuitBreaker      → Prevent cascading failures  │
│ 3. FallbackHandler     → Switch to alternatives      │
│ 4. RollbackCoordinator → Restore original state      │
└──────────────────────────────────────────────────────┘
```

### When to Use What?

| Scenario | Use | Why |
|----------|-----|-----|
| Network timeout | RetryManager | Transient, likely to succeed on retry |
| Service down | CircuitBreaker | Protect other services from cascading failure |
| API rate limit | RetryManager + FallbackHandler | Retry first, then fallback if exhausted |
| Transaction failure | RollbackCoordinator | Maintain data consistency |

---

## Running Tests

### Run All Error Handling Tests

```powershell
# Run only error handling tests
npm test -- error-handling.test.ts

# Run with coverage
npm test -- --coverage error-handling.test.ts

# Run specific test suite
npm test -- error-handling.test.ts -t "Retry Logic"
npm test -- error-handling.test.ts -t "Circuit Breaker"
npm test -- error-handling.test.ts -t "Fallback"
npm test -- error-handling.test.ts -t "Rollback"
```

### Run Specific Tests

```powershell
# Run retry tests only
npm test -- error-handling.test.ts -t "should retry 3 times"

# Run circuit breaker tests only
npm test -- error-handling.test.ts -t "should open circuit after threshold"

# Run integration tests
npm test -- error-handling.test.ts -t "Integration"
```

### Watch Mode (Development)

```powershell
# Auto-run tests on file changes
npm test -- --watch error-handling.test.ts
```

---

## RetryManager Quick Reference

### Basic Usage

```typescript
import { RetryHandler } from './error-handling';

const retryHandler = new RetryHandler();

// Simple retry (3 attempts, 1s initial delay)
const result = await retryHandler.executeWithRetry(async () => {
  return await apiCall();
});

// Custom configuration
const result = await retryHandler.executeWithRetry(
  async () => await apiCall(),
  {
    maxRetries: 5,           // Total attempts: 6 (initial + 5 retries)
    initialDelayMs: 2000,    // 2 second initial delay
    maxDelayMs: 60000,       // Cap at 60 seconds
    backoffMultiplier: 3     // 3x exponential increase
  }
);
```

### Configuration Options

| Option | Default | Description | Example Values |
|--------|---------|-------------|----------------|
| `maxRetries` | 3 | Number of retry attempts | 1, 3, 5, 10 |
| `initialDelayMs` | 1000 | Starting delay (ms) | 500, 1000, 2000 |
| `maxDelayMs` | 30000 | Maximum delay cap (ms) | 10000, 30000, 60000 |
| `backoffMultiplier` | 2 | Exponential multiplier | 1.5, 2, 3 |

### Delay Progression Examples

**Standard (2x multiplier)**:
```
Attempt 1: 0ms (immediate)
Attempt 2: 1000ms wait
Attempt 3: 2000ms wait
Attempt 4: 4000ms wait
Attempt 5: 8000ms wait
```

**Aggressive (3x multiplier)**:
```
Attempt 1: 0ms
Attempt 2: 1000ms
Attempt 3: 3000ms
Attempt 4: 9000ms
Attempt 5: 27000ms → capped at maxDelayMs
```

### Common Use Cases

#### 1. API Call with Network Issues

```typescript
const retryHandler = new RetryHandler();

try {
  const data = await retryHandler.executeWithRetry(
    async () => await fetch('https://api.example.com/data'),
    { maxRetries: 3, initialDelayMs: 1000 }
  );
  console.log('Success:', data);
} catch (error) {
  console.error('Failed after retries:', error);
}
```

#### 2. Database Operation

```typescript
const result = await retryHandler.executeWithRetry(
  async () => await db.query('SELECT * FROM users'),
  { maxRetries: 2, initialDelayMs: 500 }
);
```

#### 3. File Upload

```typescript
const uploadResult = await retryHandler.executeWithRetry(
  async () => await storageAPI.upload(file),
  { 
    maxRetries: 5,        // Allow more retries for large files
    initialDelayMs: 2000, // Longer initial delay
    maxDelayMs: 10000     // Cap at 10 seconds
  }
);
```

---

## CircuitBreaker Quick Reference

### Basic Usage

```typescript
import { CircuitBreaker, CircuitState } from './error-handling';

const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,      // Open after 5 failures
  resetTimeoutMs: 30000,    // Wait 30s before HALF_OPEN
  halfOpenMaxAttempts: 3    // 3 successes to close
});

// Execute operation through circuit breaker
try {
  const result = await circuitBreaker.execute(async () => {
    return await apiCall();
  });
  console.log('Success:', result);
} catch (error) {
  if (error.message.includes('Circuit breaker is OPEN')) {
    console.log('Circuit is open, service unavailable');
  }
}
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `failureThreshold` | 5 | Failures before opening circuit |
| `resetTimeoutMs` | 30000 | Time before attempting HALF_OPEN |
| `halfOpenMaxAttempts` | 3 | Successes needed to close circuit |

### State Checking

```typescript
// Check current state
const state = circuitBreaker.getState();
console.log('Current state:', state); // CLOSED, OPEN, or HALF_OPEN

// Check failure count
const failures = circuitBreaker.getFailureCount();
console.log('Failures:', failures);

// Conditional execution based on state
if (circuitBreaker.getState() === CircuitState.CLOSED) {
  // Safe to execute
  await circuitBreaker.execute(operation);
} else {
  // Use fallback or skip
  console.log('Circuit not closed, using fallback');
}
```

### State Machine Flow

```
1. CLOSED (normal)
   ↓ (5 failures)
   
2. OPEN (blocking)
   ↓ (wait 30 seconds)
   
3. HALF_OPEN (testing)
   ↓ (3 successes) OR ↓ (1 failure)
   CLOSED             OPEN
```

### Common Use Cases

#### 1. Protect Downstream Service

```typescript
const circuitBreaker = new CircuitBreaker({ failureThreshold: 3 });

async function callExternalAPI(data: any) {
  try {
    return await circuitBreaker.execute(async () => {
      return await externalAPI.call(data);
    });
  } catch (error) {
    if (error.message.includes('Circuit breaker is OPEN')) {
      // Service is down, use cached data
      return getCachedData();
    }
    throw error;
  }
}
```

#### 2. Database Connection Protection

```typescript
const dbCircuit = new CircuitBreaker({
  failureThreshold: 2,    // Fail fast with DB
  resetTimeoutMs: 10000   // Check again in 10s
});

const result = await dbCircuit.execute(async () => {
  return await database.query(sql);
});
```

---

## FallbackHandler Quick Reference

### Basic Usage

```typescript
import { FallbackHandler } from './error-handling';

const fallbackHandler = new FallbackHandler();

// Primary → Fallback
const result = await fallbackHandler.executeWithFallback(
  async () => await primaryAPI.call(),    // Try this first
  async () => await fallbackAPI.call(),   // Use this if primary fails
  'Fallback API'                          // Optional name for logging
);

console.log('Result:', result.result);
console.log('Used fallback?', result.usedFallback);
console.log('Fallback name:', result.fallbackName);
```

### Return Value Structure

```typescript
interface FallbackResult<T> {
  result: T;              // The actual result
  usedFallback: boolean;  // true if fallback was used
  fallbackName?: string;  // Name of fallback service
}
```

### Common Use Cases

#### 1. Notion → Trello Fallback

```typescript
const result = await fallbackHandler.executeWithFallback(
  async () => {
    // Try Notion first
    return await notionAPI.pages.create({
      parent: { database_id: 'db-id' },
      properties: { Title: { title: [{ text: { content: 'Task' } }] } }
    });
  },
  async () => {
    // Fall back to Trello
    return await trelloAPI.cards.create({
      name: 'Task',
      idList: 'list-id'
    });
  },
  'Trello'
);

if (result.usedFallback) {
  console.log('Created in Trello instead of Notion');
}
```

#### 2. Slack → Email Fallback

```typescript
async function sendNotification(message: string) {
  const result = await fallbackHandler.executeWithFallback(
    async () => {
      // Try Slack
      return await slackAPI.chat.postMessage({
        channel: 'general',
        text: message
      });
    },
    async () => {
      // Fall back to Email
      return await emailAPI.sendMail({
        to: 'team@company.com',
        subject: 'Notification',
        text: message
      });
    },
    'Email'
  );
  
  return result;
}
```

#### 3. Cascade Fallback Chain

```typescript
// Try 3 services in order
let result = await fallbackHandler.executeWithFallback(
  primaryService,
  fallback1Service,
  'Fallback1'
);

if (result.usedFallback) {
  // First fallback failed too, try second
  result = await fallbackHandler.executeWithFallback(
    () => Promise.reject(new Error('Both failed')),
    fallback2Service,
    'Fallback2'
  );
}

// Result now contains data from first successful service
```

---

## RollbackCoordinator Quick Reference

### Basic Usage

```typescript
import { RollbackCoordinator } from './error-handling';

const rollbackHandler = new RollbackCoordinator();

try {
  // Step 1: Create file
  const file = await createFile(data);
  rollbackHandler.registerOperation({
    name: 'create_file',
    rollback: async () => await deleteFile(file.id),
    data: file  // Optional: store result for reference
  });
  
  // Step 2: Update database
  const dbRecord = await updateDatabase(data);
  rollbackHandler.registerOperation({
    name: 'update_db',
    rollback: async () => await deleteRecord(dbRecord.id),
    data: dbRecord
  });
  
  // Step 3: Send notification (might fail)
  await sendNotification(data);
  
  // Success - clear rollback operations
  rollbackHandler.clear();
  
} catch (error) {
  // Failure - rollback all operations in reverse order
  const rollbackResult = await rollbackHandler.rollbackAll();
  console.log('Rolled back:', rollbackResult.rolledBack);
  console.log('Errors:', rollbackResult.errors);
}
```

### API Methods

#### `registerOperation(operation)`

```typescript
rollbackHandler.registerOperation({
  name: 'operation_name',           // Required: unique identifier
  rollback: async () => { ... },    // Required: rollback function
  data: { ... }                     // Optional: operation result data
});
```

#### `rollbackAll()`

```typescript
const result = await rollbackHandler.rollbackAll();

// Result structure:
{
  success: boolean,                     // true if all rollbacks succeeded
  rolledBack: string[],                 // Names of rolled back operations
  errors: Array<{                       // Errors during rollback
    operation: string,
    error: string
  }>
}
```

#### `clear()`

```typescript
// Clear all registered operations (after success)
rollbackHandler.clear();
```

#### `getOperations()`

```typescript
// Get list of registered operations
const ops = rollbackHandler.getOperations();
console.log('Pending rollbacks:', ops.length);
```

### Common Use Cases

#### 1. Invoice Processing Transaction

```typescript
async function processInvoice(invoice: Invoice) {
  const rollback = new RollbackCoordinator();
  
  try {
    // Create file in Drive
    const file = await driveAPI.files.create({...});
    rollback.registerOperation({
      name: 'drive_file',
      rollback: async () => await driveAPI.files.delete({ fileId: file.id }),
      data: file
    });
    
    // Add row to Sheets
    const sheet = await sheetsAPI.spreadsheets.values.append({...});
    rollback.registerOperation({
      name: 'sheet_row',
      rollback: async () => await sheetsAPI.deleteRow(sheet.row)
    });
    
    // Send Slack notification
    await slackAPI.chat.postMessage({...});
    
    // Success!
    rollback.clear();
    return { success: true };
    
  } catch (error) {
    // Rollback everything
    await rollback.rollbackAll();
    throw error;
  }
}
```

#### 2. Multi-Service Workflow

```typescript
async function createProjectWorkflow(project: Project) {
  const rollback = new RollbackCoordinator();
  
  try {
    // Step 1: Create Notion page
    const notion = await notionAPI.pages.create({...});
    rollback.registerOperation({
      name: 'notion_page',
      rollback: async () => await notionAPI.pages.update({
        page_id: notion.id,
        archived: true
      })
    });
    
    // Step 2: Create Trello board
    const trello = await trelloAPI.boards.create({...});
    rollback.registerOperation({
      name: 'trello_board',
      rollback: async () => await trelloAPI.boards.delete(trello.id)
    });
    
    // Step 3: Send team notification
    await slackAPI.chat.postMessage({...});
    
    rollback.clear();
    return { notion, trello };
    
  } catch (error) {
    const result = await rollback.rollbackAll();
    console.log('Rolled back:', result.rolledBack);
    throw error;
  }
}
```

---

## Common Patterns

### Pattern 1: Retry → Circuit Breaker

```typescript
const retryHandler = new RetryHandler();
const circuitBreaker = new CircuitBreaker({ failureThreshold: 5 });

const result = await retryHandler.executeWithRetry(
  () => circuitBreaker.execute(async () => {
    return await apiCall();
  }),
  { maxRetries: 3, initialDelayMs: 1000 }
);
```

**Use Case**: Retry transient failures, but protect service if too many failures

### Pattern 2: Retry → Fallback

```typescript
const retryHandler = new RetryHandler();
const fallbackHandler = new FallbackHandler();

try {
  // Try primary with retries
  return await retryHandler.executeWithRetry(
    async () => await primaryAPI.call(),
    { maxRetries: 2 }
  );
} catch (error) {
  // Primary exhausted, use fallback
  const result = await fallbackHandler.executeWithFallback(
    () => Promise.reject(error),
    async () => await fallbackAPI.call(),
    'Fallback'
  );
  return result.result;
}
```

**Use Case**: Exhaust retries on primary, then switch to alternative

### Pattern 3: Complete Resilient Workflow

```typescript
const retryHandler = new RetryHandler();
const circuitBreaker = new CircuitBreaker({ failureThreshold: 5 });
const fallbackHandler = new FallbackHandler();
const rollbackHandler = new RollbackCoordinator();

async function resilientWorkflow(data: any) {
  try {
    // Step 1: Primary service with retry + circuit breaker
    const step1 = await retryHandler.executeWithRetry(
      () => circuitBreaker.execute(async () => {
        return await primaryService.process(data);
      }),
      { maxRetries: 3 }
    );
    
    rollbackHandler.registerOperation({
      name: 'step1',
      rollback: async () => await primaryService.rollback(step1.id)
    });
    
    // Step 2: Secondary service with fallback
    const step2 = await fallbackHandler.executeWithFallback(
      async () => await secondaryService.process(step1),
      async () => await fallbackService.process(step1),
      'Fallback Service'
    );
    
    rollbackHandler.registerOperation({
      name: 'step2',
      rollback: async () => await secondaryService.rollback(step2.result.id)
    });
    
    // Success
    rollbackHandler.clear();
    return { step1, step2 };
    
  } catch (error) {
    // Rollback all
    await rollbackHandler.rollbackAll();
    throw error;
  }
}
```

**Use Case**: Production-grade workflow with all error mechanisms

---

## Troubleshooting

### Issue 1: Retry Not Working

**Symptoms**: Operation fails immediately without retries

**Check**:
```typescript
// Is error being thrown correctly?
throw new Error('Something failed');

// Check retry configuration
const result = await retryHandler.executeWithRetry(
  operation,
  { maxRetries: 3 }  // Make sure this is set
);
```

### Issue 2: Circuit Breaker Always Open

**Symptoms**: Circuit never closes, always blocks requests

**Solutions**:
```typescript
// 1. Check reset timeout
const cb = new CircuitBreaker({
  resetTimeoutMs: 10000  // Try shorter timeout
});

// 2. Check failure threshold
const cb = new CircuitBreaker({
  failureThreshold: 10  // Increase threshold
});

// 3. Manual state check
console.log('State:', cb.getState());
console.log('Failures:', cb.getFailureCount());
```

### Issue 3: Fallback Not Triggered

**Symptoms**: Primary fails but fallback doesn't execute

**Check**:
```typescript
// Ensure fallback function is provided
const result = await fallbackHandler.executeWithFallback(
  primaryOp,
  fallbackOp,  // Must be provided
  'FallbackName'
);

// Check if primary is actually failing
try {
  await primaryOp();
} catch (e) {
  console.log('Primary fails with:', e);
}
```

### Issue 4: Rollback Not Executing

**Symptoms**: State remains modified after rollback

**Check**:
```typescript
// 1. Verify operations are registered
console.log('Operations:', rollbackHandler.getOperations().length);

// 2. Ensure rollbackAll is called
const result = await rollbackHandler.rollbackAll();
console.log('Rollback result:', result);

// 3. Check for errors during rollback
if (!result.success) {
  console.log('Rollback errors:', result.errors);
}
```

---

## Performance Tips

### 1. Configure Retry Delays Appropriately

```typescript
// Fast operations (< 100ms)
{ maxRetries: 2, initialDelayMs: 100 }

// Normal operations (100ms - 1s)
{ maxRetries: 3, initialDelayMs: 1000 }

// Slow operations (> 1s)
{ maxRetries: 5, initialDelayMs: 2000, maxDelayMs: 10000 }
```

### 2. Set Circuit Breaker Thresholds Based on Traffic

```typescript
// Low traffic (< 10 req/s)
{ failureThreshold: 3, resetTimeoutMs: 10000 }

// Medium traffic (10-100 req/s)
{ failureThreshold: 10, resetTimeoutMs: 30000 }

// High traffic (> 100 req/s)
{ failureThreshold: 50, resetTimeoutMs: 60000 }
```

### 3. Use Fallback for Degraded Experience

```typescript
// Full experience
await primaryService.fullFeature(data);

// Degraded (fallback)
await fallbackService.limitedFeature(data);  // Works, but limited
```

### 4. Register Rollback Only for State-Changing Operations

```typescript
// DO register rollback
const created = await api.create(data);
rollbackHandler.registerOperation({ 
  name: 'create',
  rollback: () => api.delete(created.id)
});

// DON'T register rollback for reads
const read = await api.get(id);  // No rollback needed
```

---

## Quick Command Reference

```powershell
# Build project
npm run build

# Run all tests
npm test

# Run error handling tests only
npm test -- error-handling.test.ts

# Run specific suite
npm test -- error-handling.test.ts -t "Retry Logic"

# Run in watch mode
npm test -- --watch error-handling.test.ts

# Run with coverage
npm test -- --coverage error-handling.test.ts

# Check TypeScript errors
npx tsc --noEmit

# Lint code
npm run lint  # (if configured)
```

---

## Additional Resources

- **Full Documentation**: `docs/PROMPT-26-ERROR-HANDLING-TESTS.md`
- **Status Summary**: `docs/FINAL-STATUS-PROMPT-26.md`
- **Project Summary**: `docs/PROJECT-FINAL-SUMMARY.md`
- **Test File**: `tests/workflows/error-handling.test.ts`

---

**Quick Start Guide Complete** ✅  
**Version**: 1.0  
**Last Updated**: Current Session
