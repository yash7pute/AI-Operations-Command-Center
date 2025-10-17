# Idempotency Manager - Complete Documentation

**Module**: `src/workflows/idempotency-manager.ts`  
**Lines**: 850+ lines  
**Purpose**: Ensure actions execute exactly once even if retried  
**Status**: ✅ Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Quick Start](#quick-start)
4. [API Reference](#api-reference)
5. [Idempotency Key Generation](#idempotency-key-generation)
6. [Cache Management](#cache-management)
7. [Usage Examples](#usage-examples)
8. [Configuration](#configuration)
9. [Statistics & Monitoring](#statistics--monitoring)
10. [Best Practices](#best-practices)
11. [Production Deployment](#production-deployment)

---

## Overview

The Idempotency Manager prevents duplicate action execution by:
- Generating unique idempotency keys
- Caching execution results
- Returning cached results for duplicate requests
- Auto-expiring stale entries

### Key Features

✅ **Exact-Once Execution** - Actions execute exactly once even if retried  
✅ **Smart Key Generation** - signalId + action + target + params hash  
✅ **Result Caching** - Cache results with configurable TTL  
✅ **Duplicate Prevention** - Prevents duplicate tasks, notifications, files  
✅ **Auto-Cleanup** - Automatic expiration of stale entries  
✅ **Statistics** - Track cache hits, duplicates prevented  
✅ **Query Functions** - Find keys by action type, target, signal ID  

### What Problems Does It Solve?

**Problem**: Network retry creates duplicate Trello cards  
**Solution**: Second request returns cached card ID

**Problem**: Webhook triggered twice, sends duplicate Slack notification  
**Solution**: Second notification prevented, cached result returned

**Problem**: File upload retried, creates multiple copies  
**Solution**: Duplicate upload prevented, original file ID returned

**Problem**: API timeout causes retry, duplicates database entry  
**Solution**: Retry detects existing entry via idempotency key

---

## Core Concepts

### 1. Idempotency Keys

Unique identifier for each action:

```
Format: signalId:actionType:target:paramsHash

Example: signal-123:create_task:trello:a3f2c1b4e5d6
```

**Components**:
- `signalId` - Source signal identifier
- `actionType` - Action being performed (create_task, upload_file, etc.)
- `target` - Target platform (trello, drive, slack, etc.)
- `paramsHash` - SHA-256 hash of parameters (first 16 chars)

### 2. Execution Flow

```
Request 1:
  ├─ Generate key
  ├─ Check cache → NOT FOUND
  ├─ Execute action
  ├─ Cache result
  └─ Return result

Request 2 (retry):
  ├─ Generate key (same)
  ├─ Check cache → FOUND
  ├─ Log duplicate prevented
  └─ Return cached result ✅
```

### 3. Cache Expiration

Entries automatically expire after TTL:

```
Default TTL: 24 hours
Configurable: Any duration
Auto-cleanup: Every hour
```

After expiration, action can be re-executed.

### 4. Parameter Hashing

Parameters are hashed deterministically:

```typescript
// Same parameters = same hash
hash({ name: 'Task', id: 123 }) === hash({ id: 123, name: 'Task' })

// Different parameters = different hash
hash({ name: 'Task A' }) !== hash({ name: 'Task B' })
```

---

## Quick Start

### Basic Usage

```typescript
import {
  generateIdempotencyKey,
  checkExecuted,
  markExecuted
} from './idempotency-manager';

// 1. Generate idempotency key
const key = generateIdempotencyKey({
  signalId: 'signal-123',
  action: 'create_task',
  target: 'trello',
  params: { name: 'Review Invoice', boardId: 'board-456' }
});

// 2. Check if already executed
const check = checkExecuted(key);

if (check.executed) {
  console.log('Action already executed, returning cached result');
  return check.cachedResult;
}

// 3. Execute action
const result = await createTrelloCard({ name: 'Review Invoice' });

// 4. Mark as executed
markExecuted(key, result);

return result;
```

### Simplified Wrapper

```typescript
import { executeWithIdempotency } from './idempotency-manager';

// Automatic idempotency handling
const result = await executeWithIdempotency(
  {
    signalId: 'signal-123',
    action: 'create_task',
    target: 'trello',
    params: { name: 'Review Invoice' }
  },
  async () => {
    return await createTrelloCard({ name: 'Review Invoice' });
  }
);

// If called again with same params, returns cached result!
```

---

## API Reference

### Core Functions

#### `generateIdempotencyKey(reasoningResult)`

Generate unique idempotency key from action details.

**Parameters:**
- `reasoningResult` (object) - Action details:
  - `signalId` (string) - Signal identifier
  - `action` (string) - Action type
  - `target` (string) - Target platform
  - `params` (object) - Action parameters
  - `context` (object, optional) - Additional context

**Returns:** `string` - Idempotency key

**Example:**
```typescript
const key = generateIdempotencyKey({
  signalId: 'signal-123',
  action: 'create_task',
  target: 'trello',
  params: {
    name: 'Review Invoice',
    description: 'Check vendor details',
    boardId: 'board-456'
  }
});

console.log(key);
// Output: "signal-123:create_task:trello:a3f2c1b4e5d6"
```

---

#### `checkExecuted(idempotencyKey)`

Check if action has already been executed.

**Parameters:**
- `idempotencyKey` (string) - Idempotency key to check

**Returns:** `IdempotencyCheckResult` - Check result:
  - `executed` (boolean) - Whether action was executed
  - `cachedResult` (any, optional) - Cached result if executed
  - `executedAt` (Date, optional) - When action was executed
  - `idempotencyKey` (string) - Key that was checked
  - `ttl` (number, optional) - Time until cache expires (ms)

**Example:**
```typescript
const check = checkExecuted('signal-123:create_task:trello:a3f2c1b4');

if (check.executed) {
  console.log('✅ Action already executed');
  console.log('Cached result:', check.cachedResult);
  console.log('Executed at:', check.executedAt);
  console.log('TTL:', check.ttl, 'ms');
  
  // Return cached result
  return check.cachedResult;
}

// Proceed with execution
```

---

#### `markExecuted(idempotencyKey, result, ttl?, metadata?)`

Mark action as executed and cache the result.

**Parameters:**
- `idempotencyKey` (string) - Idempotency key
- `result` (any) - Execution result to cache
- `ttl` (number, optional) - Time to live in ms (default: 24 hours)
- `metadata` (object, optional) - Additional metadata:
  - `actionType` (string) - Action type
  - `target` (string) - Target platform
  - `params` (object) - Action parameters
  - `signalId` (string) - Signal ID

**Returns:** `void`

**Example:**
```typescript
// Execute action
const result = await createTrelloCard({ name: 'Review' });

// Mark as executed with 12-hour TTL
markExecuted(
  'signal-123:create_task:trello:a3f2c1b4',
  result,
  12 * 60 * 60 * 1000,  // 12 hours
  {
    actionType: 'create_task',
    target: 'trello',
    params: { name: 'Review' },
    signalId: 'signal-123'
  }
);

console.log('✅ Action marked as executed');
```

---

#### `executeWithIdempotency(reasoningResult, executor, ttl?)`

Execute action with automatic idempotency protection.

**Parameters:**
- `reasoningResult` (object) - Action details
- `executor` (async function) - Function that executes the action
- `ttl` (number, optional) - Cache TTL in ms

**Returns:** `Promise<T>` - Execution result (cached or fresh)

**Example:**
```typescript
const result = await executeWithIdempotency(
  {
    signalId: 'signal-123',
    action: 'upload_file',
    target: 'drive',
    params: { name: 'invoice.pdf', content: pdfBuffer }
  },
  async () => {
    // This only executes once
    return await uploadToDrive({
      name: 'invoice.pdf',
      content: pdfBuffer
    });
  },
  24 * 60 * 60 * 1000  // 24 hour TTL
);

console.log('File ID:', result.id);
```

---

### Cache Management

#### `cleanupExpired()`

Remove expired entries from cache.

**Returns:** `number` - Number of entries removed

**Example:**
```typescript
const removed = cleanupExpired();
console.log(`Removed ${removed} expired entries`);
```

---

#### `clearIdempotencyKey(idempotencyKey)`

Clear specific key from cache to allow re-execution.

**Parameters:**
- `idempotencyKey` (string) - Key to clear

**Returns:** `boolean` - Whether key was found and removed

**Example:**
```typescript
// Force re-execution of specific action
const cleared = clearIdempotencyKey('signal-123:create_task:trello:a3f2c1b4');

if (cleared) {
  console.log('✅ Action can now be re-executed');
}
```

---

#### `clearAllCache()`

Clear all cache entries (use with caution).

**Returns:** `number` - Number of entries cleared

**Example:**
```typescript
const count = clearAllCache();
console.log(`Cleared ${count} cache entries`);
```

---

#### `getIdempotencyRecord(idempotencyKey)`

Get detailed record for a key.

**Parameters:**
- `idempotencyKey` (string) - Key to look up

**Returns:** `IdempotencyRecord | null` - Record if found

**Example:**
```typescript
const record = getIdempotencyRecord('signal-123:create_task:trello:a3f2c1b4');

if (record) {
  console.log('Action type:', record.actionType);
  console.log('Target:', record.target);
  console.log('Executed at:', record.executedAt);
  console.log('Expires at:', record.expiresAt);
  console.log('Attempt count:', record.attemptCount);
  console.log('Result:', record.result);
}
```

---

#### `getCachedKeys(filter?)`

Get all cached keys, optionally filtered.

**Parameters:**
- `filter` (function, optional) - Filter function

**Returns:** `string[]` - Array of keys

**Example:**
```typescript
// Get all keys
const allKeys = getCachedKeys();

// Get keys for specific action type
const taskKeys = getCachedKeys(record => record.actionType === 'create_task');

// Get keys for specific target
const trelloKeys = getCachedKeys(record => record.target === 'trello');
```

---

### Statistics & Monitoring

#### `getIdempotencyStats()`

Get cache statistics.

**Returns:** `IdempotencyStats` - Statistics object:
  - `totalCached` (number) - Total cached entries
  - `duplicatesPrevented` (number) - Duplicate executions prevented
  - `cacheHits` (number) - Number of cache hits
  - `cacheMisses` (number) - Number of cache misses
  - `hitRate` (number) - Hit rate percentage
  - `expiredCleaned` (number) - Expired entries cleaned

**Example:**
```typescript
const stats = getIdempotencyStats();

console.log('Idempotency Statistics:');
console.log(`  Total cached: ${stats.totalCached}`);
console.log(`  Duplicates prevented: ${stats.duplicatesPrevented}`);
console.log(`  Cache hits: ${stats.cacheHits}`);
console.log(`  Cache misses: ${stats.cacheMisses}`);
console.log(`  Hit rate: ${stats.hitRate.toFixed(1)}%`);
console.log(`  Expired cleaned: ${stats.expiredCleaned}`);
```

---

#### `getCacheInfo()`

Get detailed cache information.

**Returns:** Object with cache details:
  - `currentSize` (number) - Current cache size
  - `maxSize` (number) - Maximum cache size
  - `utilizationPercent` (number) - Cache utilization
  - `oldestEntry` (Date, optional) - Oldest entry timestamp
  - `newestEntry` (Date, optional) - Newest entry timestamp

**Example:**
```typescript
const info = getCacheInfo();

console.log('Cache Information:');
console.log(`  Size: ${info.currentSize}/${info.maxSize}`);
console.log(`  Utilization: ${info.utilizationPercent.toFixed(1)}%`);
console.log(`  Oldest entry: ${info.oldestEntry}`);
console.log(`  Newest entry: ${info.newestEntry}`);
```

---

#### `resetStats()`

Reset statistics counters.

**Returns:** `void`

**Example:**
```typescript
resetStats();
console.log('Statistics reset');
```

---

### Configuration

#### `configure(config)`

Configure idempotency manager.

**Parameters:**
- `config` (object) - Configuration options:
  - `defaultTTL` (number, optional) - Default TTL in ms (default: 24 hours)
  - `maxCacheSize` (number, optional) - Max cache entries (default: 10000)
  - `enableAutoCleanup` (boolean, optional) - Enable auto-cleanup (default: true)
  - `cleanupInterval` (number, optional) - Cleanup interval in ms (default: 1 hour)
  - `includeParamsInKey` (boolean, optional) - Include params in key (default: true)

**Returns:** `void`

**Example:**
```typescript
configure({
  defaultTTL: 12 * 60 * 60 * 1000,  // 12 hours
  maxCacheSize: 5000,
  enableAutoCleanup: true,
  cleanupInterval: 30 * 60 * 1000,  // 30 minutes
  includeParamsInKey: true
});
```

---

#### `getConfig()`

Get current configuration.

**Returns:** `IdempotencyConfig` - Current config

**Example:**
```typescript
const config = getConfig();
console.log('Current configuration:', config);
```

---

### Query Functions

#### `findKeysByActionType(actionType)`

Find keys by action type.

**Parameters:**
- `actionType` (string) - Action type to search

**Returns:** `string[]` - Matching keys

**Example:**
```typescript
const taskKeys = findKeysByActionType('create_task');
console.log(`Found ${taskKeys.length} task creation actions`);
```

---

#### `findKeysByTarget(target)`

Find keys by target platform.

**Parameters:**
- `target` (string) - Target platform

**Returns:** `string[]` - Matching keys

**Example:**
```typescript
const driveKeys = findKeysByTarget('drive');
console.log(`Found ${driveKeys.length} Drive actions`);
```

---

#### `findKeysBySignalId(signalId)`

Find keys by signal ID.

**Parameters:**
- `signalId` (string) - Signal ID

**Returns:** `string[]` - Matching keys

**Example:**
```typescript
const signalKeys = findKeysBySignalId('signal-123');
console.log(`Signal 123 has ${signalKeys.length} actions`);
```

---

#### `getExpiringSoon(withinMs?)`

Get records expiring soon.

**Parameters:**
- `withinMs` (number, optional) - Time window in ms (default: 1 hour)

**Returns:** `IdempotencyRecord[]` - Expiring records

**Example:**
```typescript
// Get records expiring in next 30 minutes
const expiring = getExpiringSoon(30 * 60 * 1000);

console.log(`${expiring.length} records expiring soon:`);
expiring.forEach(record => {
  console.log(`  ${record.key} - expires ${record.expiresAt}`);
});
```

---

### Utility Functions

#### `parseIdempotencyKey(key)`

Parse key into components.

**Parameters:**
- `key` (string) - Idempotency key

**Returns:** Object with components

**Example:**
```typescript
const parts = parseIdempotencyKey('signal-123:create_task:trello:a3f2c1b4');

console.log(parts);
// {
//   signalId: 'signal-123',
//   actionType: 'create_task',
//   target: 'trello',
//   paramsHash: 'a3f2c1b4'
// }
```

---

#### `paramsAreEquivalent(params1, params2)`

Check if two parameter sets would generate same key.

**Parameters:**
- `params1` (object) - First params
- `params2` (object) - Second params

**Returns:** `boolean` - Whether equivalent

**Example:**
```typescript
const equiv = paramsAreEquivalent(
  { name: 'Task', id: 123 },
  { id: 123, name: 'Task' }  // Same content, different order
);

console.log(equiv);  // true
```

---

## Idempotency Key Generation

### Key Structure

```
Format: signalId:actionType:target:paramsHash

Examples:
- signal-123:create_task:trello:a3f2c1b4e5d6
- signal-456:upload_file:drive:f7e8d9c0b1a2
- signal-789:send_notification:slack:4d3c2b1a0e9f
```

### Parameter Hashing

Parameters are hashed using SHA-256:

```typescript
// Example parameters
const params = {
  name: 'Review Invoice',
  description: 'Check vendor details',
  boardId: 'board-456',
  dueDate: '2025-10-20'
};

// Hash process:
// 1. Sort keys alphabetically
// 2. Convert to JSON string
// 3. SHA-256 hash
// 4. Take first 16 characters

// Result: a3f2c1b4e5d6f7e8
```

### Key Generation Examples

```typescript
// Example 1: Create Trello Task
const key1 = generateIdempotencyKey({
  signalId: 'signal-001',
  action: 'create_task',
  target: 'trello',
  params: { name: 'Task A', boardId: 'board-1' }
});
// Result: "signal-001:create_task:trello:abc123def456"

// Example 2: Upload File
const key2 = generateIdempotencyKey({
  signalId: 'signal-002',
  action: 'upload_file',
  target: 'drive',
  params: { name: 'doc.pdf', folderId: 'folder-1' }
});
// Result: "signal-002:upload_file:drive:def456ghi789"

// Example 3: Send Notification
const key3 = generateIdempotencyKey({
  signalId: 'signal-003',
  action: 'send_notification',
  target: 'slack',
  params: { channel: 'general', message: 'Hello' }
});
// Result: "signal-003:send_notification:slack:ghi789jkl012"
```

### Same vs Different Keys

```typescript
// Same key (parameters in different order)
const key_a = generateIdempotencyKey({
  signalId: 'sig-1',
  action: 'create_task',
  target: 'trello',
  params: { name: 'Task', id: 123 }
});

const key_b = generateIdempotencyKey({
  signalId: 'sig-1',
  action: 'create_task',
  target: 'trello',
  params: { id: 123, name: 'Task' }  // Same, different order
});

console.log(key_a === key_b);  // true

// Different key (different parameters)
const key_c = generateIdempotencyKey({
  signalId: 'sig-1',
  action: 'create_task',
  target: 'trello',
  params: { name: 'Different Task', id: 123 }
});

console.log(key_a === key_c);  // false
```

---

## Cache Management

### TTL (Time To Live)

Default: 24 hours

```typescript
// Use default TTL (24 hours)
markExecuted(key, result);

// Custom TTL (12 hours)
markExecuted(key, result, 12 * 60 * 60 * 1000);

// Short TTL (1 hour)
markExecuted(key, result, 60 * 60 * 1000);

// Long TTL (7 days)
markExecuted(key, result, 7 * 24 * 60 * 60 * 1000);
```

### Auto-Cleanup

Automatically removes expired entries:

```typescript
// Default: Cleanup every 1 hour
// Configured in: config.cleanupInterval

// Manual cleanup
const removed = cleanupExpired();
console.log(`Removed ${removed} expired entries`);

// Start auto-cleanup
startAutoCleanup();

// Stop auto-cleanup
stopAutoCleanup();
```

### Cache Size Management

Maximum 10,000 entries by default:

```typescript
// Configure max size
configure({ maxCacheSize: 5000 });

// When limit reached:
// - Oldest 20% of entries removed
// - New entry added

// Check utilization
const info = getCacheInfo();
console.log(`Utilization: ${info.utilizationPercent.toFixed(1)}%`);
```

### Manual Cache Control

```typescript
// Clear specific key
clearIdempotencyKey('signal-123:create_task:trello:abc123');

// Clear all (dangerous!)
clearAllCache();

// Get specific record
const record = getIdempotencyRecord('signal-123:create_task:trello:abc123');

// Find keys by criteria
const taskKeys = findKeysByActionType('create_task');
const driveKeys = findKeysByTarget('drive');
```

---

## Usage Examples

### Example 1: Prevent Duplicate Trello Cards

```typescript
import {
  executeWithIdempotency
} from './idempotency-manager';

async function createTaskWithIdempotency(signal: Signal) {
  const result = await executeWithIdempotency(
    {
      signalId: signal.id,
      action: 'create_task',
      target: 'trello',
      params: {
        name: `Review: ${signal.title}`,
        description: signal.description,
        boardId: TRELLO_BOARD_ID
      }
    },
    async () => {
      // This only executes once!
      return await createTrelloCard({
        name: `Review: ${signal.title}`,
        description: signal.description,
        boardId: TRELLO_BOARD_ID
      });
    }
  );
  
  console.log('Task created (or retrieved from cache):', result.id);
  return result;
}

// First call: Creates card
await createTaskWithIdempotency(signal);

// Retry (network error): Returns cached card ✅
await createTaskWithIdempotency(signal);

// Another retry: Still cached ✅
await createTaskWithIdempotency(signal);
```

### Example 2: Prevent Duplicate File Uploads

```typescript
async function uploadInvoiceWithIdempotency(invoice: Invoice) {
  const result = await executeWithIdempotency(
    {
      signalId: `invoice-${invoice.id}`,
      action: 'upload_file',
      target: 'drive',
      params: {
        name: `Invoice-${invoice.id}.pdf`,
        folderId: INVOICES_FOLDER_ID,
        contentHash: invoice.contentHash  // Include for uniqueness
      }
    },
    async () => {
      // Only uploads once!
      return await uploadToDrive({
        name: `Invoice-${invoice.id}.pdf`,
        content: invoice.pdfBuffer,
        folderId: INVOICES_FOLDER_ID
      });
    }
  );
  
  console.log('File uploaded (or retrieved from cache):', result.webViewLink);
  return result;
}

// First upload: Creates file
const result1 = await uploadInvoiceWithIdempotency(invoice);

// Retry due to timeout: Returns cached file ID ✅
const result2 = await uploadInvoiceWithIdempotency(invoice);

console.log(result1.id === result2.id);  // true
```

### Example 3: Prevent Duplicate Slack Notifications

```typescript
async function notifyTeamWithIdempotency(signal: Signal) {
  const result = await executeWithIdempotency(
    {
      signalId: signal.id,
      action: 'send_notification',
      target: 'slack',
      params: {
        channel: 'engineering',
        message: `New bug report: ${signal.title}`
      }
    },
    async () => {
      // Only sends once!
      return await sendSlackMessage({
        channel: 'engineering',
        message: `New bug report: ${signal.title}`,
        attachments: [{
          title: signal.title,
          text: signal.description,
          color: 'danger'
        }]
      });
    }
  );
  
  console.log('Notification sent (or skipped):', result.ts);
  return result;
}

// First call: Sends notification
await notifyTeamWithIdempotency(signal);

// Webhook retries: Notification NOT sent again ✅
await notifyTeamWithIdempotency(signal);
```

### Example 4: Manual Idempotency Control

```typescript
async function createTaskManual(signal: Signal) {
  // 1. Generate key
  const key = generateIdempotencyKey({
    signalId: signal.id,
    action: 'create_task',
    target: 'trello',
    params: { name: signal.title }
  });
  
  // 2. Check if executed
  const check = checkExecuted(key);
  
  if (check.executed) {
    console.log('✅ Task already created');
    console.log('Cached card ID:', check.cachedResult.id);
    console.log('Created at:', check.executedAt);
    console.log('TTL remaining:', check.ttl, 'ms');
    return check.cachedResult;
  }
  
  // 3. Execute
  console.log('Creating new task...');
  const result = await createTrelloCard({ name: signal.title });
  
  // 4. Mark as executed
  markExecuted(key, result, 24 * 60 * 60 * 1000, {
    actionType: 'create_task',
    target: 'trello',
    params: { name: signal.title },
    signalId: signal.id
  });
  
  console.log('✅ Task created and cached');
  return result;
}
```

### Example 5: Monitoring Dashboard

```typescript
function displayIdempotencyDashboard() {
  const stats = getIdempotencyStats();
  const info = getCacheInfo();
  
  console.log('=== Idempotency Dashboard ===\n');
  
  console.log('Cache Statistics:');
  console.log(`  Total cached: ${stats.totalCached}`);
  console.log(`  Utilization: ${info.utilizationPercent.toFixed(1)}%`);
  console.log(`  Max size: ${info.maxSize}`);
  
  console.log('\nPerformance:');
  console.log(`  Cache hits: ${stats.cacheHits}`);
  console.log(`  Cache misses: ${stats.cacheMisses}`);
  console.log(`  Hit rate: ${stats.hitRate.toFixed(1)}%`);
  
  console.log('\nDuplicate Prevention:');
  console.log(`  Duplicates prevented: ${stats.duplicatesPrevented}`);
  
  console.log('\nMaintenance:');
  console.log(`  Expired cleaned: ${stats.expiredCleaned}`);
  
  if (info.oldestEntry) {
    const age = Date.now() - info.oldestEntry.getTime();
    console.log(`  Oldest entry: ${(age / 1000 / 60 / 60).toFixed(1)} hours ago`);
  }
  
  // Show expiring soon
  const expiring = getExpiringSoon(60 * 60 * 1000);  // Next hour
  if (expiring.length > 0) {
    console.log(`\n⚠️ ${expiring.length} entries expiring in next hour`);
  }
}

// Run every 5 minutes
setInterval(displayIdempotencyDashboard, 5 * 60 * 1000);
```

### Example 6: Query and Analysis

```typescript
async function analyzeIdempotencyUsage() {
  // Group by action type
  const actionTypes = ['create_task', 'upload_file', 'send_notification'];
  
  console.log('Actions by type:');
  for (const type of actionTypes) {
    const keys = findKeysByActionType(type);
    console.log(`  ${type}: ${keys.length}`);
  }
  
  // Group by target
  const targets = ['trello', 'drive', 'slack', 'sheets'];
  
  console.log('\nActions by target:');
  for (const target of targets) {
    const keys = findKeysByTarget(target);
    console.log(`  ${target}: ${keys.length}`);
  }
  
  // Find high-retry signals
  const allKeys = getCachedKeys();
  const signalAttempts = new Map<string, number>();
  
  for (const key of allKeys) {
    const record = getIdempotencyRecord(key);
    if (record && record.signalId) {
      const current = signalAttempts.get(record.signalId) || 0;
      signalAttempts.set(record.signalId, current + record.attemptCount);
    }
  }
  
  console.log('\nTop retry signals:');
  const sorted = Array.from(signalAttempts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  sorted.forEach(([signalId, attempts]) => {
    console.log(`  ${signalId}: ${attempts} attempts`);
  });
}
```

---

## Configuration

### Configuration Options

```typescript
interface IdempotencyConfig {
  defaultTTL?: number;           // Default TTL in ms (24 hours)
  maxCacheSize?: number;         // Max entries (10000)
  enableAutoCleanup?: boolean;   // Auto cleanup (true)
  cleanupInterval?: number;      // Cleanup interval (1 hour)
  includeParamsInKey?: boolean;  // Include params in key (true)
}
```

### Configuration Examples

#### Example 1: Short TTL for Rapid Operations

```typescript
configure({
  defaultTTL: 1 * 60 * 60 * 1000,  // 1 hour
  cleanupInterval: 15 * 60 * 1000   // Cleanup every 15 minutes
});
```

#### Example 2: Large Cache for High Volume

```typescript
configure({
  maxCacheSize: 50000,
  enableAutoCleanup: true,
  cleanupInterval: 10 * 60 * 1000  // Cleanup every 10 minutes
});
```

#### Example 3: Memory-Constrained Environment

```typescript
configure({
  maxCacheSize: 1000,
  defaultTTL: 6 * 60 * 60 * 1000,  // 6 hours
  enableAutoCleanup: true
});
```

#### Example 4: Disable Parameter Hashing

```typescript
// Use for actions where params don't affect outcome
configure({
  includeParamsInKey: false
});

// Keys will be: signalId:action:target (no params hash)
```

---

## Statistics & Monitoring

### Available Statistics

```typescript
interface IdempotencyStats {
  totalCached: number;           // Total entries in cache
  duplicatesPrevented: number;   // Duplicate executions prevented
  cacheHits: number;             // Number of cache hits
  cacheMisses: number;           // Number of cache misses
  hitRate: number;               // Hit rate percentage
  expiredCleaned: number;        // Expired entries cleaned
}
```

### Monitoring Examples

#### Basic Statistics

```typescript
const stats = getIdempotencyStats();

console.log(`Cache hit rate: ${stats.hitRate.toFixed(1)}%`);
console.log(`Duplicates prevented: ${stats.duplicatesPrevented}`);
```

#### Detailed Monitoring

```typescript
function monitorIdempotency() {
  const stats = getIdempotencyStats();
  const info = getCacheInfo();
  
  // Send to monitoring system
  sendMetrics({
    'idempotency.cache_size': stats.totalCached,
    'idempotency.cache_utilization': info.utilizationPercent,
    'idempotency.hit_rate': stats.hitRate,
    'idempotency.duplicates_prevented': stats.duplicatesPrevented,
    'idempotency.expired_cleaned': stats.expiredCleaned
  });
  
  // Alert if hit rate drops
  if (stats.hitRate < 50 && stats.cacheHits + stats.cacheMisses > 100) {
    alertOpsTeam('Low idempotency cache hit rate', {
      hitRate: stats.hitRate,
      cacheHits: stats.cacheHits,
      cacheMisses: stats.cacheMisses
    });
  }
  
  // Alert if cache nearly full
  if (info.utilizationPercent > 90) {
    alertOpsTeam('Idempotency cache nearly full', {
      currentSize: info.currentSize,
      maxSize: info.maxSize,
      utilization: info.utilizationPercent
    });
  }
}

// Run every minute
setInterval(monitorIdempotency, 60 * 1000);
```

---

## Best Practices

### 1. Always Use for External Actions

**DO:**
```typescript
// Wrap all external API calls
await executeWithIdempotency(reasoning, () => createTrelloCard(...));
await executeWithIdempotency(reasoning, () => uploadToDrive(...));
await executeWithIdempotency(reasoning, () => sendSlackMessage(...));
```

**DON'T:**
```typescript
// Without idempotency - duplicates possible!
await createTrelloCard(...);
```

### 2. Include Meaningful Parameters

**DO:**
```typescript
// Include params that make action unique
const key = generateIdempotencyKey({
  signalId: 'sig-1',
  action: 'create_task',
  target: 'trello',
  params: {
    name: 'Task A',
    description: 'Details',
    boardId: 'board-1',
    dueDate: '2025-10-20'
  }
});
```

**DON'T:**
```typescript
// Empty params - all tasks have same key!
params: {}
```

### 3. Choose Appropriate TTL

**DO:**
```typescript
// Short-lived operations: 1 hour
markExecuted(key, result, 1 * 60 * 60 * 1000);

// Standard operations: 24 hours (default)
markExecuted(key, result);

// Long-lived operations: 7 days
markExecuted(key, result, 7 * 24 * 60 * 60 * 1000);
```

**DON'T:**
```typescript
// Too short - might allow duplicates
markExecuted(key, result, 1000);  // 1 second

// Too long - wastes memory
markExecuted(key, result, 365 * 24 * 60 * 60 * 1000);  // 1 year
```

### 4. Monitor Statistics

```typescript
// Regular monitoring
setInterval(() => {
  const stats = getIdempotencyStats();
  
  if (stats.duplicatesPrevented > 0) {
    logger.info('Idempotency preventing duplicates', {
      prevented: stats.duplicatesPrevented,
      hitRate: stats.hitRate
    });
  }
}, 5 * 60 * 1000);  // Every 5 minutes
```

### 5. Handle Cache Misses Gracefully

**DO:**
```typescript
const check = checkExecuted(key);

if (check.executed) {
  return check.cachedResult;
}

// Execute with error handling
try {
  const result = await executeAction();
  markExecuted(key, result);
  return result;
} catch (error) {
  logger.error('Action failed', error);
  throw error;
}
```

### 6. Use Meaningful Signal IDs

**DO:**
```typescript
// Use unique, meaningful IDs
signalId: `invoice-${invoice.id}`
signalId: `bug-report-${bugId}`
signalId: `user-signup-${userId}`
```

**DON'T:**
```typescript
// Generic IDs
signalId: 'signal-1'
signalId: 'request'
```

### 7. Clear Cache When Needed

```typescript
// Clear specific action to allow retry
if (userRequestsRetry) {
  clearIdempotencyKey(key);
  // Action can now be re-executed
}

// Clear old entries periodically
setInterval(() => {
  cleanupExpired();
}, 60 * 60 * 1000);  // Every hour
```

---

## Production Deployment

### Replace In-Memory Cache with Redis

```typescript
// Example Redis integration (pseudo-code)
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT
});

export async function checkExecuted(key: string): Promise<IdempotencyCheckResult> {
  const cached = await redis.get(`idempotency:${key}`);
  
  if (cached) {
    return {
      executed: true,
      cachedResult: JSON.parse(cached),
      idempotencyKey: key
    };
  }
  
  return {
    executed: false,
    idempotencyKey: key
  };
}

export async function markExecuted(key: string, result: any, ttl: number): Promise<void> {
  await redis.setex(
    `idempotency:${key}`,
    Math.floor(ttl / 1000),  // Redis uses seconds
    JSON.stringify(result)
  );
}
```

### Environment Variables

```bash
# .env
IDEMPOTENCY_DEFAULT_TTL=86400000       # 24 hours in ms
IDEMPOTENCY_MAX_CACHE_SIZE=10000
IDEMPOTENCY_CLEANUP_INTERVAL=3600000   # 1 hour in ms
IDEMPOTENCY_ENABLE_AUTO_CLEANUP=true
```

### Monitoring Integration

```typescript
// Send metrics to monitoring system
setInterval(() => {
  const stats = getIdempotencyStats();
  const info = getCacheInfo();
  
  sendToDatadog({
    'idempotency.cache.size': stats.totalCached,
    'idempotency.cache.hit_rate': stats.hitRate,
    'idempotency.duplicates.prevented': stats.duplicatesPrevented,
    'idempotency.cache.utilization': info.utilizationPercent
  });
}, 60 * 1000);
```

### Logging

```typescript
// Log duplicate prevention
logger.info('Duplicate execution prevented', {
  idempotencyKey: key,
  actionType: 'create_task',
  target: 'trello',
  attemptCount: 3
});

// Log cache statistics
logger.info('Idempotency statistics', getIdempotencyStats());
```

---

## Summary

The Idempotency Manager ensures **exact-once execution** by:

1. **Generating unique keys** from signalId + action + target + params
2. **Caching results** with configurable TTL
3. **Returning cached results** for duplicate requests
4. **Preventing duplicates** across all action types
5. **Auto-expiring** stale entries
6. **Monitoring** cache performance

**Key Benefits**:
✅ No duplicate Trello cards  
✅ No duplicate Slack notifications  
✅ No duplicate file uploads  
✅ Automatic retry handling  
✅ Complete visibility with statistics  

**Ready for production deployment with Redis integration!** 🚀

---

*Documentation complete - Production ready! ✅*
