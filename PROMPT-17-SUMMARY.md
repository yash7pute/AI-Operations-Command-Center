# Prompt 17: Retry Strategy Manager - Quick Reference

**Status**: ✅ Complete  
**File**: `src/workflows/retry-manager.ts`  
**Lines**: 1,100+ lines  
**Build**: ✅ Passing (0 errors)

---

## What It Does

Sophisticated retry logic with platform-specific policies:
- ✅ Smart error classification (API, rate limit, network, validation, auth)
- ✅ Platform-specific policies (Notion, Trello, Slack, Gmail, etc.)
- ✅ Exponential backoff with jitter
- ✅ Rate limit handling (wait for reset + 5s buffer)
- ✅ Auth token refresh on auth errors
- ✅ Statistics tracking per platform

---

## Quick Start

```typescript
import { retryTrello, retryNotion, retrySlack } from './retry-manager';

// Trello with automatic retry
const card = await retryTrello(
  () => createTrelloCard({ name: 'Task' }),
  'create_card'
);

// Notion with automatic retry
const page = await retryNotion(
  () => createNotionPage({ title: 'Page' }),
  'create_page'
);

// Slack with automatic retry
const msg = await retrySlack(
  () => sendSlackMessage({ channel: 'general', text: 'Hello' }),
  'send_message'
);
```

---

## Error Classification

```typescript
enum ErrorType {
  API_ERROR        // 5xx server errors → Retry
  RATE_LIMIT       // 429 rate limit → Wait for reset
  NETWORK_ERROR    // Connection failures → Retry
  VALIDATION_ERROR // 400, 422 → No retry
  AUTH_ERROR       // 401, 403 → Refresh token, then retry
  TIMEOUT_ERROR    // Timeouts → Retry
  UNKNOWN_ERROR    // Unknown → No retry
}
```

---

## Retry Policies

| Platform | Max Attempts | Initial Delay | Backoff | Auth Refresh |
|----------|-------------|---------------|---------|--------------|
| Notion   | 3           | 1s            | Exponential (2x) | Yes |
| Trello   | 3           | 1s            | Exponential (2x) | Yes |
| Asana    | 3           | 1s            | Exponential (2x) | Yes |
| Slack    | 3           | 1s            | Exponential (2x) | No |
| Gmail    | 5           | 2s            | Exponential (2x) | Yes |
| Drive    | 5           | 2s            | Exponential (2x) | Yes |
| Sheets   | 5           | 2s            | Exponential (2x) | Yes |

**Retry Delays:**
- Notion/Trello/Asana: 1s, 2s, 4s
- Gmail/Drive/Sheets: 2s, 4s, 8s, 16s, 32s

---

## Core Functions

### Retry Execution
- `retry(fn, options)` - Execute with retry logic
- `retryNotion(fn, operation)` - Retry with Notion policy
- `retryTrello(fn, operation)` - Retry with Trello policy
- `retryAsana(fn, operation)` - Retry with Asana policy
- `retrySlack(fn, operation)` - Retry with Slack policy
- `retryGmail(fn, operation)` - Retry with Gmail policy
- `retryDrive(fn, operation)` - Retry with Drive policy
- `retrySheets(fn, operation)` - Retry with Sheets policy

### Error Classification
- `classifyError(error)` - Classify error into error type
- `isRetryableError(error, policy)` - Check if error is retryable
- `getRetryableErrors()` - Get list of retryable error types
- `extractRateLimitInfo(error)` - Extract rate limit headers

### Backoff Calculation
- `calculateDelay(attempt, policy, rateLimitInfo?)` - Calculate next delay

### Token Management
- `registerTokenRefresh(platform, refreshFn)` - Register refresh function

### Statistics
- `getStatistics(platform)` - Get retry statistics
- `getAllStatistics()` - Get all platform statistics
- `resetStatistics(platform?)` - Reset statistics
- `formatStatistics(stats)` - Format for display
- `getStatisticsSummary()` - Get summary of all stats

### Policy Management
- `getRetryPolicy(platform)` - Get retry policy
- `setRetryPolicy(platform, policy)` - Set custom policy
- `resetRetryPolicy(platform)` - Reset to default
- `createRetryPolicy(options)` - Create custom policy

---

## Backoff Strategies

```typescript
enum BackoffStrategy {
  EXPONENTIAL  // 1s, 2s, 4s, 8s, 16s... (default)
  LINEAR       // 1s, 2s, 3s, 4s, 5s...
  FIXED        // 1s, 1s, 1s, 1s, 1s...
  FIBONACCI    // 1s, 1s, 2s, 3s, 5s...
}
```

---

## Usage Examples

### Basic Retry

```typescript
import { retry, Platform } from './retry-manager';

const result = await retry(
  async () => {
    return await apiCall();
  },
  {
    platform: Platform.TRELLO,
    operation: 'create_card'
  }
);
```

### With Callbacks

```typescript
const result = await retry(
  () => apiCall(),
  {
    platform: Platform.NOTION,
    operation: 'create_page',
    
    onRetry: (context) => {
      console.log(`Retry ${context.attempt}/${context.maxAttempts}`);
      console.log(`Wait ${context.nextDelay}ms`);
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

### Register Token Refresh

```typescript
import { registerTokenRefresh, Platform } from './retry-manager';

// Gmail token refresh
registerTokenRefresh(Platform.GMAIL, async () => {
  const newToken = await oAuth2Client.getAccessToken();
  return newToken.token;
});

// Notion token refresh
registerTokenRefresh(Platform.NOTION, async () => {
  const response = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: REFRESH_TOKEN })
  });
  const data = await response.json();
  return data.access_token;
});
```

### Custom Retry Policy

```typescript
import { setRetryPolicy, Platform, BackoffStrategy } from './retry-manager';

// More aggressive policy
setRetryPolicy(Platform.TRELLO, {
  maxAttempts: 5,
  initialDelay: 2000,
  maxDelay: 10000,
  backoffStrategy: BackoffStrategy.EXPONENTIAL,
  backoffMultiplier: 3,
  jitter: 0.2
});
```

---

## Rate Limit Handling

When rate limit detected (429):

1. Extract rate limit headers:
   - `X-RateLimit-Reset` - Reset timestamp
   - `Retry-After` - Seconds to wait

2. Calculate wait time:
   - Reset time + 5s buffer
   - Or retry-after + 5s buffer

3. Wait

4. Retry

**Example:**
```
Rate limit hit: 10:00:00
Reset time: 10:01:00 (60 seconds)
Wait time: 65 seconds (60s + 5s buffer)
Retry at: 10:01:05 ✅
```

---

## Auth Token Refresh

For auth errors (401/403):

1. Detect auth error
2. Check if refresh function registered
3. Check if already refreshed (only once)
4. Call refresh function
5. Retry with new token

**Example:**
```
Attempt 1: 401 Unauthorized ❌
Refresh token... ✅
Retry: Success ✅
```

---

## Statistics Example

```typescript
import { getStatistics, formatStatistics } from './retry-manager';

const stats = getStatistics(Platform.TRELLO);

console.log(formatStatistics(stats));

// Output:
// === Retry Statistics: trello ===
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

## Integration Examples

### With Workflow Orchestrator

```typescript
import { retry, Platform } from './retry-manager';

async function executeTool(tool: Tool, params: any) {
  const platform = getPlatformFromTool(tool);
  
  return await retry(
    () => tool.execute(params),
    {
      platform,
      operation: tool.name
    }
  );
}
```

### With Idempotency Manager

```typescript
import { executeWithIdempotency } from './idempotency-manager';
import { retry, Platform } from './retry-manager';

// Combined: Idempotency + Retry
const result = await executeWithIdempotency(
  reasoningResult,
  async () => {
    return await retry(
      () => createTrelloCard({ name: 'Task' }),
      {
        platform: Platform.TRELLO,
        operation: 'create_card'
      }
    );
  }
);

// Benefits:
// - Prevents duplicates (idempotency)
// - Retries on failures (retry manager)
// - Complete reliability! ✅
```

---

## Error Handling Examples

### API Error (Retry)

```
Attempt 1: 500 Internal Server Error ❌
Wait 1s...
Attempt 2: 500 Internal Server Error ❌
Wait 2s...
Attempt 3: Success ✅
```

### Network Error (Retry)

```
Attempt 1: ECONNREFUSED ❌
Wait 2s...
Attempt 2: ETIMEDOUT ❌
Wait 4s...
Attempt 3: Success ✅
```

### Validation Error (No Retry)

```
Attempt 1: 400 Bad Request (name is required) ❌
Error classified as VALIDATION_ERROR
Not retryable - fail immediately
```

### Rate Limit (Wait + Retry)

```
Attempt 1: 429 Too Many Requests ❌
Rate limit reset: 60 seconds
Wait 65s (60s + 5s buffer)...
Retry: Success ✅
```

---

## Monitoring Dashboard

```typescript
function displayRetryDashboard() {
  const platforms = [
    Platform.NOTION,
    Platform.TRELLO,
    Platform.SLACK,
    Platform.GMAIL
  ];
  
  platforms.forEach(platform => {
    const stats = getStatistics(platform);
    
    if (stats) {
      const successRate = (
        (stats.successfulFirstAttempt + stats.successfulAfterRetries) /
        stats.totalOperations * 100
      ).toFixed(1);
      
      console.log(`${platform}:`);
      console.log(`  Success Rate: ${successRate}%`);
      console.log(`  Total Ops: ${stats.totalOperations}`);
      console.log(`  Avg Retries: ${stats.avgRetriesPerOperation.toFixed(2)}`);
      console.log(`  Rate Limits: ${stats.rateLimitHits}`);
      console.log(`  Token Refreshes: ${stats.tokenRefreshes}`);
    }
  });
}

// Run every 5 minutes
setInterval(displayRetryDashboard, 5 * 60 * 1000);
```

---

## Key Features

✅ **Smart Error Classification** - Automatic detection of 7 error types  
✅ **Platform-Specific Policies** - Optimized for each API  
✅ **Exponential Backoff** - 4 strategies available  
✅ **Rate Limit Handling** - Respects reset times + 5s buffer  
✅ **Auth Token Refresh** - Automatic token refresh on 401/403  
✅ **Statistics Tracking** - Success rate, retry count, error breakdown  
✅ **Timeout Support** - Per-operation timeouts  
✅ **Jitter** - Random delay to prevent thundering herd  

---

## Production Notes

### Configuration

```typescript
// At startup
import { setRetryPolicy, registerTokenRefresh } from './retry-manager';

// Custom policies for production
setRetryPolicy(Platform.TRELLO, {
  maxAttempts: 5,
  maxDelay: 10000
});

// Register token refresh functions
registerTokenRefresh(Platform.GMAIL, refreshGmailToken);
registerTokenRefresh(Platform.NOTION, refreshNotionToken);
```

### Monitoring

```typescript
// Send to monitoring system
import { getStatistics } from './retry-manager';

setInterval(() => {
  const stats = getStatistics(Platform.TRELLO);
  
  if (stats) {
    sendToDatadog({
      'retry.success_rate': (stats.successfulFirstAttempt + stats.successfulAfterRetries) / stats.totalOperations,
      'retry.avg_retries': stats.avgRetriesPerOperation,
      'retry.rate_limit_hits': stats.rateLimitHits
    });
  }
}, 60 * 1000);
```

---

## Documentation

📖 **Full Documentation**: `PROMPT-17-RETRY-MANAGER.md` (3,500+ lines)
- Complete API reference
- Error classification guide
- Retry policy details
- Usage examples
- Best practices
- Production deployment

---

## Summary

The Retry Strategy Manager provides **intelligent, platform-aware retry logic** with automatic error classification, exponential backoff, rate limit handling, auth token refresh, and comprehensive statistics tracking.

**Key Benefits:**
- 🔄 Automatic retry on transient failures
- ⏱️ Smart rate limit handling
- 🔐 Automatic token refresh
- 📊 Complete visibility with statistics
- 🎯 Platform-optimized policies

**Result**: Production-ready retry system with 20+ functions! ✅

---

*Quick reference complete - See full documentation for details! 🚀*
