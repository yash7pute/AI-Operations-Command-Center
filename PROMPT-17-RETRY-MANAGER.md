# Retry Strategy Manager - Complete Documentation

**Module**: `src/workflows/retry-manager.ts`  
**Lines**: 1,100+ lines  
**Purpose**: Sophisticated retry logic with platform-specific policies  
**Status**: ✅ Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Quick Start](#quick-start)
4. [API Reference](#api-reference)
5. [Error Classification](#error-classification)
6. [Retry Policies](#retry-policies)
7. [Usage Examples](#usage-examples)
8. [Statistics & Monitoring](#statistics--monitoring)
9. [Best Practices](#best-practices)
10. [Production Deployment](#production-deployment)

---

## Overview

The Retry Strategy Manager provides intelligent retry logic with:
- Platform-specific retry policies
- Automatic error classification
- Multiple backoff strategies
- Rate limit awareness
- Auth token refresh
- Statistics tracking

### Key Features

✅ **Smart Error Classification** - API, rate limit, network, validation, auth errors  
✅ **Platform-Specific Policies** - Notion, Trello, Asana, Slack, Gmail, Drive, Sheets  
✅ **Exponential Backoff** - Multiple strategies (exponential, linear, fixed, fibonacci)  
✅ **Rate Limit Handling** - Wait for reset time + buffer  
✅ **Auth Token Refresh** - Automatic token refresh on auth errors  
✅ **Statistics Tracking** - Success rate, retry count, error types  
✅ **Timeout Support** - Per-operation timeouts  

### What Problems Does It Solve?

**Problem**: API returns 429 rate limit error  
**Solution**: Wait for rate limit reset time + 5s buffer, then retry

**Problem**: Network error during Trello API call  
**Solution**: Retry 3 times with exponential backoff (1s, 2s, 4s)

**Problem**: Auth token expired during Gmail operation  
**Solution**: Refresh token automatically, then retry

**Problem**: Validation error (400) from API  
**Solution**: No retry, log and fail immediately

**Problem**: Transient server error (500) from Notion  
**Solution**: Retry 3 times with exponential backoff

---

## Core Concepts

### 1. Error Classification

Automatically classifies errors into types:

```typescript
enum ErrorType {
  API_ERROR        // 5xx server errors
  RATE_LIMIT       // 429 rate limit errors
  NETWORK_ERROR    // Connection failures
  VALIDATION_ERROR // 400, 422 validation errors
  AUTH_ERROR       // 401, 403 auth failures
  TIMEOUT_ERROR    // Operation timeouts
  UNKNOWN_ERROR    // Unclassified errors
}
```

### 2. Retry Policies

Each platform has optimized retry policy:

| Platform | Max Attempts | Initial Delay | Strategy | Auth Refresh |
|----------|-------------|---------------|----------|--------------|
| Notion   | 3           | 1s            | Exponential | Yes |
| Trello   | 3           | 1s            | Exponential | Yes |
| Asana    | 3           | 1s            | Exponential | Yes |
| Slack    | 3           | 1s            | Exponential | No |
| Gmail    | 5           | 2s            | Exponential | Yes |
| Drive    | 5           | 2s            | Exponential | Yes |
| Sheets   | 5           | 2s            | Exponential | Yes |

### 3. Backoff Strategies

```typescript
enum BackoffStrategy {
  EXPONENTIAL  // 1s, 2s, 4s, 8s, 16s...
  LINEAR       // 1s, 2s, 3s, 4s, 5s...
  FIXED        // 1s, 1s, 1s, 1s, 1s...
  FIBONACCI    // 1s, 1s, 2s, 3s, 5s...
}
```

**Exponential** (default): Best for most APIs, prevents overwhelming server  
**Linear**: Predictable delays  
**Fixed**: Simple, same delay each time  
**Fibonacci**: Gradual increase

### 4. Rate Limit Handling

Respects rate limit headers:

```
X-RateLimit-Reset: Unix timestamp when limit resets
Retry-After: Seconds to wait before retry
X-RateLimit-Remaining: Requests remaining
X-RateLimit-Limit: Total requests allowed
```

Automatically waits until reset time + 5s buffer.

### 5. Auth Token Refresh

For auth errors (401/403):
1. Detect auth error
2. Call registered token refresh function
3. Retry operation with new token
4. Only refresh once per operation

---

## Quick Start

### Basic Usage

```typescript
import { retry, Platform } from './retry-manager';

// Wrap API call with retry
const result = await retry(
  async () => {
    return await createTrelloCard({ name: 'Task' });
  },
  {
    platform: Platform.TRELLO,
    operation: 'create_card'
  }
);

// Automatic retry on failure!
```

### Platform-Specific Wrappers

```typescript
import { retryTrello, retryNotion, retrySlack } from './retry-manager';

// Trello operation
const card = await retryTrello(
  () => createTrelloCard({ name: 'Task' }),
  'create_card'
);

// Notion operation
const page = await retryNotion(
  () => createNotionPage({ title: 'Page' }),
  'create_page'
);

// Slack operation
const message = await retrySlack(
  () => sendSlackMessage({ channel: 'general', text: 'Hello' }),
  'send_message'
);
```

---

## API Reference

### Core Functions

#### `retry<T>(fn, options)`

Execute function with retry logic.

**Parameters:**
- `fn` (async function) - Function to execute
- `options` (object):
  - `platform` (Platform) - Platform type
  - `operation` (string) - Operation name
  - `policy` (RetryPolicy, optional) - Custom retry policy
  - `onRetry` (function, optional) - Called before each retry
  - `onSuccess` (function, optional) - Called on success
  - `onFailure` (function, optional) - Called on failure

**Returns:** `Promise<T>` - Result from function

**Example:**
```typescript
const result = await retry(
  async () => {
    return await apiCall();
  },
  {
    platform: Platform.TRELLO,
    operation: 'create_card',
    onRetry: (context) => {
      console.log(`Retry attempt ${context.attempt}/${context.maxAttempts}`);
      console.log(`Next delay: ${context.nextDelay}ms`);
    },
    onSuccess: (result) => {
      console.log(`Success after ${result.attempts} attempts`);
    },
    onFailure: (result) => {
      console.error(`Failed after ${result.attempts} attempts`);
    }
  }
);
```

---

### Error Classification

#### `classifyError(error)`

Classify error into error type.

**Parameters:**
- `error` (any) - Error object

**Returns:** `ErrorType` - Classified error type

**Example:**
```typescript
try {
  await apiCall();
} catch (error) {
  const errorType = classifyError(error);
  console.log('Error type:', errorType);
  
  if (errorType === ErrorType.RATE_LIMIT) {
    console.log('Rate limit hit!');
  }
}
```

---

#### `isRetryableError(error, policy)`

Check if error is retryable based on policy.

**Parameters:**
- `error` (any) - Error object
- `policy` (RetryPolicy) - Retry policy

**Returns:** `boolean` - Whether error is retryable

**Example:**
```typescript
const policy = getRetryPolicy(Platform.TRELLO);
const shouldRetry = isRetryableError(error, policy);

if (shouldRetry) {
  console.log('Error is retryable');
} else {
  console.log('Error is NOT retryable');
}
```

---

#### `getRetryableErrors()`

Get list of retryable error types.

**Returns:** `ErrorType[]` - Array of retryable error types

**Example:**
```typescript
const retryable = getRetryableErrors();
console.log('Retryable errors:', retryable);
// [API_ERROR, RATE_LIMIT, NETWORK_ERROR, TIMEOUT_ERROR]
```

---

#### `extractRateLimitInfo(error)`

Extract rate limit information from error.

**Parameters:**
- `error` (any) - Error object

**Returns:** `RateLimitInfo` - Rate limit information

**Example:**
```typescript
try {
  await apiCall();
} catch (error) {
  if (classifyError(error) === ErrorType.RATE_LIMIT) {
    const rateLimitInfo = extractRateLimitInfo(error);
    
    console.log('Reset time:', new Date(rateLimitInfo.resetTime));
    console.log('Retry after:', rateLimitInfo.retryAfter, 'seconds');
    console.log('Remaining:', rateLimitInfo.remaining);
    console.log('Limit:', rateLimitInfo.limit);
  }
}
```

---

### Backoff Calculation

#### `calculateDelay(attempt, policy, rateLimitInfo?)`

Calculate delay for next retry.

**Parameters:**
- `attempt` (number) - Current attempt number
- `policy` (RetryPolicy) - Retry policy
- `rateLimitInfo` (RateLimitInfo, optional) - Rate limit info

**Returns:** `number` - Delay in milliseconds

**Example:**
```typescript
const policy = getRetryPolicy(Platform.NOTION);

// Exponential backoff delays
console.log('Attempt 1 delay:', calculateDelay(1, policy)); // ~1000ms
console.log('Attempt 2 delay:', calculateDelay(2, policy)); // ~2000ms
console.log('Attempt 3 delay:', calculateDelay(3, policy)); // ~4000ms

// With rate limit info
const rateLimitInfo = { resetTime: Date.now() + 60000 }; // Reset in 1 min
const rateLimitDelay = calculateDelay(1, policy, rateLimitInfo);
console.log('Rate limit delay:', rateLimitDelay); // ~65000ms (60s + 5s buffer)
```

---

### Token Management

#### `registerTokenRefresh(platform, refreshFn)`

Register token refresh function for platform.

**Parameters:**
- `platform` (Platform) - Platform type
- `refreshFn` (async function) - Function that returns new token

**Returns:** `void`

**Example:**
```typescript
import { registerTokenRefresh, Platform } from './retry-manager';

// Register token refresh for Gmail
registerTokenRefresh(Platform.GMAIL, async () => {
  // Refresh OAuth token
  const newToken = await oAuth2Client.getAccessToken();
  return newToken.token;
});

// Register for Notion
registerTokenRefresh(Platform.NOTION, async () => {
  // Refresh Notion token
  const response = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: REFRESH_TOKEN })
  });
  const data = await response.json();
  return data.access_token;
});
```

---

### Policy Management

#### `getRetryPolicy(platform)`

Get retry policy for platform.

**Parameters:**
- `platform` (Platform) - Platform type

**Returns:** `RetryPolicy` - Retry policy

**Example:**
```typescript
const notionPolicy = getRetryPolicy(Platform.NOTION);

console.log('Max attempts:', notionPolicy.maxAttempts);
console.log('Initial delay:', notionPolicy.initialDelay);
console.log('Strategy:', notionPolicy.backoffStrategy);
console.log('Retryable errors:', notionPolicy.retryableErrors);
```

---

#### `setRetryPolicy(platform, policy)`

Set custom retry policy for platform.

**Parameters:**
- `platform` (Platform) - Platform type
- `policy` (Partial<RetryPolicy>) - Custom policy (merged with defaults)

**Returns:** `void`

**Example:**
```typescript
// Custom policy for Trello
setRetryPolicy(Platform.TRELLO, {
  maxAttempts: 5,           // More retries
  initialDelay: 2000,       // Longer initial delay
  maxDelay: 10000,          // Higher max delay
  backoffMultiplier: 3,     // Faster exponential growth
  jitter: 0.2               // More randomness
});

// Custom policy with different strategy
setRetryPolicy(Platform.SLACK, {
  backoffStrategy: BackoffStrategy.LINEAR,
  maxAttempts: 4
});
```

---

#### `resetRetryPolicy(platform)`

Reset retry policy to default.

**Parameters:**
- `platform` (Platform) - Platform type

**Returns:** `void`

**Example:**
```typescript
// Reset Trello policy to default
resetRetryPolicy(Platform.TRELLO);
```

---

#### `createRetryPolicy(options)`

Create custom retry policy.

**Parameters:**
- `options` (Partial<RetryPolicy>) - Policy options

**Returns:** `RetryPolicy` - Complete retry policy

**Example:**
```typescript
const aggressivePolicy = createRetryPolicy({
  maxAttempts: 10,
  initialDelay: 500,
  maxDelay: 60000,
  backoffStrategy: BackoffStrategy.EXPONENTIAL,
  backoffMultiplier: 2,
  jitter: 0.15,
  retryableErrors: [
    ErrorType.API_ERROR,
    ErrorType.NETWORK_ERROR,
    ErrorType.TIMEOUT_ERROR,
    ErrorType.RATE_LIMIT
  ],
  refreshAuthOnError: true,
  timeout: 30000
});

// Use custom policy
await retry(
  () => apiCall(),
  {
    platform: Platform.GENERIC,
    operation: 'custom_op',
    policy: aggressivePolicy
  }
);
```

---

### Statistics

#### `getStatistics(platform)`

Get statistics for platform.

**Parameters:**
- `platform` (Platform) - Platform type

**Returns:** `RetryStatistics | undefined` - Statistics if available

**Example:**
```typescript
const stats = getStatistics(Platform.TRELLO);

if (stats) {
  console.log('Total operations:', stats.totalOperations);
  console.log('Success on first attempt:', stats.successfulFirstAttempt);
  console.log('Success after retries:', stats.successfulAfterRetries);
  console.log('Failed after retries:', stats.failedAfterRetries);
  console.log('Total retries:', stats.totalRetries);
  console.log('Avg retries per op:', stats.avgRetriesPerOperation);
  console.log('Rate limit hits:', stats.rateLimitHits);
  console.log('Token refreshes:', stats.tokenRefreshes);
  console.log('Avg success time:', stats.avgSuccessTime, 'ms');
  
  // Errors by type
  stats.errorsByType.forEach((count, type) => {
    console.log(`${type}: ${count}`);
  });
}
```

---

#### `getAllStatistics()`

Get statistics for all platforms.

**Returns:** `Map<Platform, RetryStatistics>` - Statistics map

**Example:**
```typescript
const allStats = getAllStatistics();

allStats.forEach((stats, platform) => {
  console.log(`\n${platform}:`);
  console.log(`  Total operations: ${stats.totalOperations}`);
  console.log(`  Success rate: ${
    (stats.successfulFirstAttempt + stats.successfulAfterRetries) / 
    stats.totalOperations * 100
  }%`);
});
```

---

#### `resetStatistics(platform?)`

Reset statistics.

**Parameters:**
- `platform` (Platform, optional) - Platform to reset, or all if omitted

**Returns:** `void`

**Example:**
```typescript
// Reset specific platform
resetStatistics(Platform.TRELLO);

// Reset all platforms
resetStatistics();
```

---

#### `formatStatistics(stats)`

Format statistics for display.

**Parameters:**
- `stats` (RetryStatistics) - Statistics to format

**Returns:** `string` - Formatted string

**Example:**
```typescript
const stats = getStatistics(Platform.NOTION);
if (stats) {
  console.log(formatStatistics(stats));
}

// Output:
// === Retry Statistics: notion ===
// Total Operations: 150
// Success Rate: 94.7%
//   - First Attempt: 120
//   - After Retries: 22 (15.5% retry rate)
//   - Failed: 8
// 
// Retry Statistics:
//   - Total Retries: 35
//   - Avg Retries/Op: 0.23
//   - Rate Limit Hits: 5
//   - Token Refreshes: 2
// 
// Performance:
//   - Avg Success Time: 1234ms
// 
// Errors by Type:
//   - api_error: 18
//   - rate_limit: 5
//   - network_error: 12
```

---

#### `getStatisticsSummary()`

Get summary of all statistics.

**Returns:** `string` - Formatted summary

**Example:**
```typescript
console.log(getStatisticsSummary());

// Output:
// ========================================
//       RETRY STATISTICS SUMMARY
// ========================================
// 
// === Retry Statistics: notion ===
// ...
// 
// === Retry Statistics: trello ===
// ...
```

---

### Convenience Wrappers

#### Platform-Specific Functions

```typescript
// Notion
await retryNotion(() => createNotionPage(...), 'create_page');

// Trello
await retryTrello(() => createTrelloCard(...), 'create_card');

// Asana
await retryAsana(() => createAsanaTask(...), 'create_task');

// Slack
await retrySlack(() => sendSlackMessage(...), 'send_message');

// Gmail
await retryGmail(() => sendGmailMessage(...), 'send_email');

// Drive
await retryDrive(() => uploadToDrive(...), 'upload_file');

// Sheets
await retrySheets(() => updateSheet(...), 'update_sheet');
```

---

## Error Classification

### Error Types

#### 1. API_ERROR
**Description**: Server-side errors (5xx)  
**HTTP Codes**: 500, 502, 503, 504  
**Retryable**: Yes  
**Default Retries**: 3-5 depending on platform

**Example:**
```typescript
// 500 Internal Server Error
// 502 Bad Gateway
// 503 Service Unavailable
```

#### 2. RATE_LIMIT
**Description**: Rate limit exceeded  
**HTTP Code**: 429  
**Retryable**: Yes (with rate limit wait)  
**Special Handling**: Waits for reset time + 5s buffer

**Example:**
```typescript
// 429 Too Many Requests
// Response headers:
// X-RateLimit-Reset: 1634567890
// Retry-After: 60
```

#### 3. NETWORK_ERROR
**Description**: Network/connection failures  
**Error Codes**: ECONNREFUSED, ENOTFOUND, ETIMEDOUT  
**Retryable**: Yes  
**Default Retries**: 5

**Example:**
```typescript
// ECONNREFUSED: Connection refused
// ENOTFOUND: DNS lookup failed
// ETIMEDOUT: Connection timed out
```

#### 4. VALIDATION_ERROR
**Description**: Invalid input/parameters  
**HTTP Codes**: 400, 422  
**Retryable**: No  
**Action**: Log and fail immediately

**Example:**
```typescript
// 400 Bad Request
// 422 Unprocessable Entity
// "name is required"
// "invalid email format"
```

#### 5. AUTH_ERROR
**Description**: Authentication/authorization failures  
**HTTP Codes**: 401, 403  
**Retryable**: Yes (after token refresh)  
**Special Handling**: Attempts token refresh once

**Example:**
```typescript
// 401 Unauthorized
// 403 Forbidden
// "invalid token"
// "token expired"
```

#### 6. TIMEOUT_ERROR
**Description**: Operation timeout  
**Retryable**: Yes  
**Default Retries**: 3-5

**Example:**
```typescript
// Operation timed out after 10000ms
```

#### 7. UNKNOWN_ERROR
**Description**: Unclassified errors  
**Retryable**: No  
**Action**: Log and fail

---

## Retry Policies

### Default Policies

#### Notion/Trello/Asana Policy

```typescript
{
  maxAttempts: 3,
  initialDelay: 1000,        // 1 second
  maxDelay: 4000,            // 4 seconds
  backoffStrategy: EXPONENTIAL,
  backoffMultiplier: 2,
  jitter: 0.1,               // 10% randomness
  retryableErrors: [
    API_ERROR,
    NETWORK_ERROR,
    TIMEOUT_ERROR
  ],
  refreshAuthOnError: true,
  timeout: 10000             // 10 second timeout
}

// Retry delays: 1s, 2s, 4s
```

#### Gmail/Drive/Sheets Policy

```typescript
{
  maxAttempts: 5,
  initialDelay: 2000,        // 2 seconds
  maxDelay: 32000,           // 32 seconds
  backoffStrategy: EXPONENTIAL,
  backoffMultiplier: 2,
  jitter: 0.15,              // 15% randomness
  retryableErrors: [
    API_ERROR,
    NETWORK_ERROR,
    TIMEOUT_ERROR,
    RATE_LIMIT
  ],
  refreshAuthOnError: true,
  timeout: 20000             // 20 second timeout
}

// Retry delays: 2s, 4s, 8s, 16s, 32s
```

#### Slack Policy

```typescript
{
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 5000,
  backoffStrategy: EXPONENTIAL,
  backoffMultiplier: 2,
  jitter: 0.1,
  retryableErrors: [
    API_ERROR,
    NETWORK_ERROR,
    TIMEOUT_ERROR,
    RATE_LIMIT
  ],
  refreshAuthOnError: false,  // Slack uses bot token
  timeout: 15000
}
```

### Rate Limit Handling

When rate limit error detected:

1. **Extract rate limit info** from error headers
2. **Calculate wait time**:
   - If `X-RateLimit-Reset` header: Wait until reset time + 5s
   - If `Retry-After` header: Wait retry-after seconds + 5s
   - Otherwise: Use exponential backoff
3. **Wait** for calculated time
4. **Retry** operation

**Example:**
```typescript
// Rate limit hit at 10:00:00
// X-RateLimit-Reset: 10:01:00 (60 seconds)
// Wait time: 65 seconds (60s + 5s buffer)
// Retry at: 10:01:05
```

### Token Refresh

For auth errors (401/403):

1. **Detect auth error**
2. **Check if refresh available** (registered function)
3. **Check if already refreshed** (only once per operation)
4. **Call refresh function**
5. **Retry with new token**
6. **If refresh fails**: Proceed with normal retry logic

**Example:**
```typescript
// Auth error detected
// Call registered refresh function
const newToken = await refreshAuthToken(Platform.GMAIL);
// Update token in client
gmailClient.setToken(newToken);
// Retry operation
```

---

## Usage Examples

### Example 1: Basic Retry

```typescript
import { retry, Platform } from './retry-manager';

async function createTask() {
  const card = await retry(
    async () => {
      return await trelloApi.createCard({
        name: 'New Task',
        idList: LIST_ID
      });
    },
    {
      platform: Platform.TRELLO,
      operation: 'create_card'
    }
  );
  
  console.log('Card created:', card.id);
  return card;
}

// First attempt: Success ✅
// No retries needed
```

### Example 2: Network Error Retry

```typescript
import { retryGmail } from './retry-manager';

async function sendEmail() {
  try {
    const result = await retryGmail(
      async () => {
        return await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedMessage
          }
        });
      },
      'send_email'
    );
    
    console.log('Email sent:', result.data.id);
    return result;
    
  } catch (error) {
    console.error('Failed to send email after retries:', error);
    throw error;
  }
}

// Attempt 1: Network error (ETIMEDOUT)
// Wait 2s...
// Attempt 2: Network error
// Wait 4s...
// Attempt 3: Success ✅
```

### Example 3: Rate Limit Handling

```typescript
import { retryTrello } from './retry-manager';

async function batchCreateCards() {
  const cards = [];
  
  for (const cardData of cardsData) {
    const card = await retryTrello(
      async () => {
        return await trelloApi.createCard(cardData);
      },
      'create_card'
    );
    
    cards.push(card);
  }
  
  return cards;
}

// Card 1: Success
// Card 2: Success
// Card 3: Rate limit (429)
// Wait 65s (reset time + 5s buffer)...
// Card 3 retry: Success ✅
// Card 4: Success
```

### Example 4: Auth Token Refresh

```typescript
import { retry, Platform, registerTokenRefresh } from './retry-manager';

// Register token refresh function
registerTokenRefresh(Platform.NOTION, async () => {
  const response = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: process.env.NOTION_REFRESH_TOKEN
    })
  });
  
  const data = await response.json();
  
  // Update stored token
  process.env.NOTION_TOKEN = data.access_token;
  
  return data.access_token;
});

// Use with auto token refresh
async function createPage() {
  const page = await retry(
    async () => {
      return await notionClient.pages.create({
        parent: { database_id: DATABASE_ID },
        properties: {
          title: { title: [{ text: { content: 'New Page' } }] }
        }
      });
    },
    {
      platform: Platform.NOTION,
      operation: 'create_page'
    }
  );
  
  return page;
}

// Attempt 1: 401 Unauthorized
// Refresh token...
// Token refreshed ✅
// Retry: Success ✅
```

### Example 5: Custom Retry Policy

```typescript
import { retry, Platform, createRetryPolicy, BackoffStrategy } from './retry-manager';

// Create custom aggressive policy
const aggressivePolicy = createRetryPolicy({
  maxAttempts: 10,
  initialDelay: 500,
  maxDelay: 60000,
  backoffStrategy: BackoffStrategy.EXPONENTIAL,
  backoffMultiplier: 3,
  jitter: 0.2,
  timeout: 30000
});

// Use custom policy
async function criticalOperation() {
  const result = await retry(
    async () => {
      return await importantApiCall();
    },
    {
      platform: Platform.GENERIC,
      operation: 'critical_op',
      policy: aggressivePolicy
    }
  );
  
  return result;
}

// Will retry up to 10 times with aggressive backoff
```

### Example 6: Retry Callbacks

```typescript
import { retry, Platform } from './retry-manager';

async function operationWithCallbacks() {
  const result = await retry(
    async () => {
      return await apiCall();
    },
    {
      platform: Platform.TRELLO,
      operation: 'api_call',
      
      onRetry: (context) => {
        console.log(`⚠️ Retry attempt ${context.attempt}/${context.maxAttempts}`);
        console.log(`Error: ${context.lastError?.message}`);
        console.log(`Error type: ${context.errorType}`);
        console.log(`Next delay: ${context.nextDelay}ms`);
        console.log(`Elapsed time: ${context.elapsedTime}ms`);
        
        // Send to monitoring
        sendMetric('retry_attempt', {
          platform: context.platform,
          operation: context.operation,
          attempt: context.attempt,
          errorType: context.errorType
        });
      },
      
      onSuccess: (result) => {
        console.log(`✅ Success after ${result.attempts} attempts`);
        console.log(`Total time: ${result.totalTime}ms`);
        
        // Track success
        sendMetric('operation_success', {
          attempts: result.attempts,
          totalTime: result.totalTime
        });
      },
      
      onFailure: (result) => {
        console.error(`❌ Failed after ${result.attempts} attempts`);
        console.error(`Error: ${result.error?.message}`);
        console.error(`Total time: ${result.totalTime}ms`);
        
        // Alert on failure
        alertOps('Operation failed after retries', {
          operation: result.context.operation,
          attempts: result.attempts,
          error: result.error?.message
        });
      }
    }
  );
  
  return result;
}
```

### Example 7: Validation Error (No Retry)

```typescript
import { retryTrello } from './retry-manager';

async function createCardWithValidation() {
  try {
    const card = await retryTrello(
      async () => {
        return await trelloApi.createCard({
          name: '',  // Empty name - validation error!
          idList: LIST_ID
        });
      },
      'create_card'
    );
    
    return card;
    
  } catch (error) {
    // Validation error - no retry
    console.error('Validation error:', error.message);
    // "name is required"
    throw error;
  }
}

// Attempt 1: 400 Validation Error
// Error classified as VALIDATION_ERROR
// Not retryable - fail immediately ❌
// No retries attempted
```

---

## Statistics & Monitoring

### Tracking Statistics

Statistics are automatically tracked for each platform:

```typescript
interface RetryStatistics {
  platform: Platform;
  totalOperations: number;
  successfulFirstAttempt: number;
  successfulAfterRetries: number;
  failedAfterRetries: number;
  totalRetries: number;
  avgRetriesPerOperation: number;
  errorsByType: Map<ErrorType, number>;
  rateLimitHits: number;
  tokenRefreshes: number;
  avgSuccessTime: number;
  lastUpdated: Date;
}
```

### Monitoring Dashboard

```typescript
import { getStatistics, formatStatistics } from './retry-manager';

function displayDashboard() {
  const platforms = [
    Platform.NOTION,
    Platform.TRELLO,
    Platform.SLACK,
    Platform.GMAIL
  ];
  
  platforms.forEach(platform => {
    const stats = getStatistics(platform);
    
    if (stats && stats.totalOperations > 0) {
      console.log(formatStatistics(stats));
    }
  });
}

// Run every 5 minutes
setInterval(displayDashboard, 5 * 60 * 1000);
```

### Real-time Monitoring

```typescript
import { retry, Platform } from './retry-manager';

async function monitoredOperation() {
  return await retry(
    async () => apiCall(),
    {
      platform: Platform.TRELLO,
      operation: 'api_call',
      
      onRetry: (context) => {
        // Send to monitoring system
        sendToDatadog({
          metric: 'retry.attempt',
          value: 1,
          tags: [
            `platform:${context.platform}`,
            `operation:${context.operation}`,
            `attempt:${context.attempt}`,
            `error_type:${context.errorType}`
          ]
        });
      },
      
      onSuccess: (result) => {
        sendToDatadog({
          metric: 'operation.success',
          value: 1,
          tags: [
            `platform:${result.context.platform}`,
            `attempts:${result.attempts}`
          ]
        });
        
        sendToDatadog({
          metric: 'operation.duration',
          value: result.totalTime,
          tags: [`platform:${result.context.platform}`]
        });
      }
    }
  );
}
```

### Alerting

```typescript
import { getStatistics } from './retry-manager';

function checkRetryHealth() {
  const platforms = [Platform.NOTION, Platform.TRELLO, Platform.SLACK];
  
  platforms.forEach(platform => {
    const stats = getStatistics(platform);
    
    if (!stats || stats.totalOperations === 0) return;
    
    // Calculate success rate
    const successRate = (
      (stats.successfulFirstAttempt + stats.successfulAfterRetries) /
      stats.totalOperations
    ) * 100;
    
    // Alert if success rate drops below 90%
    if (successRate < 90) {
      alertOps(`Low success rate for ${platform}`, {
        successRate: successRate.toFixed(1) + '%',
        totalOperations: stats.totalOperations,
        failed: stats.failedAfterRetries
      });
    }
    
    // Alert if rate limit hits are high
    if (stats.rateLimitHits > 10) {
      alertOps(`High rate limit hits for ${platform}`, {
        rateLimitHits: stats.rateLimitHits,
        totalOperations: stats.totalOperations
      });
    }
    
    // Alert if retry rate is high
    const retryRate = stats.avgRetriesPerOperation;
    if (retryRate > 0.5) {
      alertOps(`High retry rate for ${platform}`, {
        avgRetries: retryRate.toFixed(2),
        totalRetries: stats.totalRetries
      });
    }
  });
}

// Check every minute
setInterval(checkRetryHealth, 60 * 1000);
```

---

## Best Practices

### 1. Use Platform-Specific Wrappers

**DO:**
```typescript
// Clear which platform
await retryTrello(() => createCard(...), 'create_card');
await retryNotion(() => createPage(...), 'create_page');
await retrySlack(() => sendMessage(...), 'send_message');
```

**DON'T:**
```typescript
// Generic, loses platform context
await retry(() => apiCall(), { platform: Platform.GENERIC, operation: 'call' });
```

### 2. Register Token Refresh Functions

**DO:**
```typescript
// Register at startup
registerTokenRefresh(Platform.GMAIL, async () => {
  return await refreshGmailToken();
});

registerTokenRefresh(Platform.NOTION, async () => {
  return await refreshNotionToken();
});
```

### 3. Use Descriptive Operation Names

**DO:**
```typescript
await retryTrello(() => createCard(...), 'create_card');
await retryTrello(() => updateCard(...), 'update_card');
await retryTrello(() => deleteCard(...), 'delete_card');
```

**DON'T:**
```typescript
await retryTrello(() => createCard(...), 'op1');
await retryTrello(() => updateCard(...), 'op2');
```

### 4. Monitor Statistics

```typescript
// Regular monitoring
setInterval(() => {
  const stats = getStatistics(Platform.TRELLO);
  
  if (stats) {
    logger.info('Retry statistics', {
      platform: stats.platform,
      totalOps: stats.totalOperations,
      successRate: (
        (stats.successfulFirstAttempt + stats.successfulAfterRetries) /
        stats.totalOperations * 100
      ).toFixed(1) + '%',
      avgRetries: stats.avgRetriesPerOperation.toFixed(2)
    });
  }
}, 5 * 60 * 1000);
```

### 5. Handle Non-Retryable Errors

**DO:**
```typescript
try {
  await retryTrello(() => createCard(...), 'create_card');
} catch (error) {
  const errorType = classifyError(error);
  
  if (errorType === ErrorType.VALIDATION_ERROR) {
    // Fix validation issue
    logger.error('Validation error, check inputs', { error: error.message });
    // Don't retry
  } else {
    // Other error, already retried
    logger.error('Operation failed after retries', { error: error.message });
  }
}
```

### 6. Set Appropriate Timeouts

**DO:**
```typescript
// Quick operations: 10s timeout
setRetryPolicy(Platform.SLACK, { timeout: 10000 });

// File uploads: 60s timeout
setRetryPolicy(Platform.DRIVE, { timeout: 60000 });

// Large data: 120s timeout
setRetryPolicy(Platform.SHEETS, { timeout: 120000 });
```

### 7. Use Callbacks for Monitoring

**DO:**
```typescript
await retry(
  () => apiCall(),
  {
    platform: Platform.TRELLO,
    operation: 'api_call',
    onRetry: (context) => {
      sendMetric('retry', { attempt: context.attempt });
    },
    onSuccess: (result) => {
      sendMetric('success', { attempts: result.attempts });
    }
  }
);
```

---

## Production Deployment

### Configuration

```typescript
// config/retry.ts
import { Platform, setRetryPolicy, registerTokenRefresh } from './retry-manager';

export function configureRetryManager() {
  // Custom policies based on environment
  if (process.env.NODE_ENV === 'production') {
    // Production: More aggressive retries
    setRetryPolicy(Platform.TRELLO, {
      maxAttempts: 5,
      maxDelay: 10000
    });
    
    setRetryPolicy(Platform.NOTION, {
      maxAttempts: 5,
      maxDelay: 10000
    });
  }
  
  // Register token refresh functions
  registerTokenRefresh(Platform.GMAIL, refreshGmailToken);
  registerTokenRefresh(Platform.NOTION, refreshNotionToken);
  registerTokenRefresh(Platform.ASANA, refreshAsanaToken);
  
  logger.info('Retry manager configured');
}
```

### Integration with Workflow Orchestrator

```typescript
// workflows/workflow-orchestrator.ts
import { retry, Platform } from './retry-manager';

export async function executeTool(tool: Tool, params: any) {
  // Determine platform
  const platform = getPlatformFromTool(tool);
  
  // Execute with retry
  const result = await retry(
    async () => {
      return await tool.execute(params);
    },
    {
      platform,
      operation: tool.name,
      onRetry: (context) => {
        logger.warn('Tool execution retry', {
          tool: tool.name,
          attempt: context.attempt,
          errorType: context.errorType
        });
      }
    }
  );
  
  return result;
}
```

### Integration with Idempotency Manager

```typescript
// Combined retry + idempotency
import { executeWithIdempotency } from './idempotency-manager';
import { retry, Platform } from './retry-manager';

export async function reliableExecution<T>(
  reasoning: ReasoningResult,
  executor: () => Promise<T>,
  platform: Platform
): Promise<T> {
  // First: Check idempotency
  return await executeWithIdempotency(
    reasoning,
    async () => {
      // Second: Execute with retry
      return await retry(
        executor,
        {
          platform,
          operation: reasoning.action
        }
      );
    }
  );
}

// Usage
const result = await reliableExecution(
  reasoningResult,
  () => createTrelloCard({ name: 'Task' }),
  Platform.TRELLO
);

// Benefits:
// - Prevents duplicates (idempotency)
// - Retries on transient failures (retry manager)
// - Complete reliability! ✅
```

---

## Summary

The **Retry Strategy Manager** provides intelligent, platform-aware retry logic:

✅ **Smart Error Classification** - Automatic detection of error types  
✅ **Platform-Specific Policies** - Optimized for each API  
✅ **Multiple Backoff Strategies** - Exponential, linear, fixed, fibonacci  
✅ **Rate Limit Handling** - Respects reset times and headers  
✅ **Auth Token Refresh** - Automatic token refresh on auth errors  
✅ **Statistics Tracking** - Complete visibility into retry behavior  
✅ **Production Ready** - Timeout support, callbacks, monitoring integration  

**Ready for production deployment!** 🚀

---

*Documentation complete - Production ready! ✅*
