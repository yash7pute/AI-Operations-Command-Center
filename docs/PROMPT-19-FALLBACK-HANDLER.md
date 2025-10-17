# Fallback Action Handler - Complete Documentation

## Overview

The Fallback Action Handler provides intelligent fallback strategies when primary actions fail. It automatically tries alternative actions, logs degraded service usage, and notifies teams of service issues.

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Quick Start](#quick-start)
3. [Fallback Strategies](#fallback-strategies)
4. [Configuration](#configuration)
5. [API Reference](#api-reference)
6. [Usage Examples](#usage-examples)
7. [Custom Strategies](#custom-strategies)
8. [Statistics & Monitoring](#statistics--monitoring)
9. [Best Practices](#best-practices)
10. [Production Deployment](#production-deployment)

---

## Core Concepts

### What is a Fallback Handler?

A fallback handler provides alternative actions when the primary action fails:

1. **Primary Action Fails**: Notion API returns error
2. **Detect Failure**: Handler catches the error
3. **Execute Fallback**: Try Trello instead
4. **Mark as Fallback**: Tag result as "executed via fallback"
5. **Notify Team**: Alert that service is degraded

### Why Use Fallbacks?

- **Graceful Degradation**: Continue operation when services fail
- **Service Alternatives**: Use similar services as backups
- **Data Preservation**: Save to local files if remote fails
- **Team Awareness**: Notify team of degraded service
- **Automatic Recovery**: No manual intervention needed

---

## Quick Start

### Basic Usage

```typescript
import * as fallbackHandler from './workflows/fallback-handler';
import { PrimaryAction } from './workflows/fallback-handler';

// Execute with fallback
try {
  // Try primary action (Notion)
  const result = await notionClient.createPage({ ... });
  return result;
} catch (error) {
  // Primary failed, try fallback
  const fallbackResult = await fallbackHandler.executeFallback(
    PrimaryAction.NOTION_CREATE_PAGE,
    { title: 'Task', description: 'Task description' },
    error
  );

  if (fallbackResult.success) {
    console.log('✅ Fallback succeeded:', fallbackResult.fallbackUsed);
    console.log('Data:', fallbackResult.data);
    // Data includes: executedViaFallback: true
  } else {
    console.log('❌ All fallbacks failed');
  }
}
```

### Check Available Fallbacks

```typescript
// Check if fallback exists
if (fallbackHandler.hasFallback(PrimaryAction.NOTION_CREATE_PAGE)) {
  console.log('Fallback available');
}

// Get list of fallbacks
const fallbacks = fallbackHandler.getAvailableFallbacks(
  PrimaryAction.NOTION_CREATE_PAGE
);
console.log('Available fallbacks:', fallbacks);
// ['trello:createCard', 'googleTasks:create', 'csv:log']
```

### Configuration

```typescript
// Configure fallback handler
fallbackHandler.configure({
  enabled: true,
  backupDir: './backups',
  csvLogDir: './logs',
  notificationEmail: 'team@example.com',
  maxFallbackAttempts: 3,
  notificationThrottle: 5 * 60 * 1000 // 5 minutes
});
```

---

## Fallback Strategies

### Default Strategies

#### Notion Actions

**Notion Create Page** → Trello → Google Tasks → CSV Log
```typescript
PrimaryAction.NOTION_CREATE_PAGE
├─ FallbackAction.TRELLO_CREATE_CARD
├─ FallbackAction.GOOGLE_TASKS_CREATE
└─ FallbackAction.CSV_LOG
```

**Notion Update Page** → Trello → CSV Log
```typescript
PrimaryAction.NOTION_UPDATE_PAGE
├─ FallbackAction.TRELLO_CREATE_CARD
└─ FallbackAction.CSV_LOG
```

**Notion Query** → Local Backup → CSV Log
```typescript
PrimaryAction.NOTION_QUERY
├─ FallbackAction.LOCAL_BACKUP
└─ FallbackAction.CSV_LOG
```

#### Trello Actions

**Trello Create Card** → Google Tasks → CSV Log
```typescript
PrimaryAction.TRELLO_CREATE_CARD
├─ FallbackAction.GOOGLE_TASKS_CREATE
└─ FallbackAction.CSV_LOG
```

**Trello Update Card** → CSV Log
```typescript
PrimaryAction.TRELLO_UPDATE_CARD
└─ FallbackAction.CSV_LOG
```

#### Slack Actions

**Slack Post Message** → Email → Webhook → Console Log
```typescript
PrimaryAction.SLACK_POST_MESSAGE
├─ FallbackAction.EMAIL_NOTIFICATION
├─ FallbackAction.WEBHOOK_POST
└─ FallbackAction.CONSOLE_LOG
```

**Slack Update Message** → Email → Console Log
```typescript
PrimaryAction.SLACK_UPDATE_MESSAGE
├─ FallbackAction.EMAIL_NOTIFICATION
└─ FallbackAction.CONSOLE_LOG
```

#### Drive Actions

**Drive Upload** → Local Backup → File Write
```typescript
PrimaryAction.DRIVE_UPLOAD
├─ FallbackAction.LOCAL_BACKUP
└─ FallbackAction.FILE_WRITE
```

**Drive Create Folder** → Local Backup
```typescript
PrimaryAction.DRIVE_CREATE_FOLDER
└─ FallbackAction.LOCAL_BACKUP
```

#### Sheets Actions

**Sheets Update** → CSV Log → File Write
```typescript
PrimaryAction.SHEETS_UPDATE
├─ FallbackAction.CSV_LOG
└─ FallbackAction.FILE_WRITE
```

**Sheets Append** → CSV Log → File Write
```typescript
PrimaryAction.SHEETS_APPEND
├─ FallbackAction.CSV_LOG
└─ FallbackAction.FILE_WRITE
```

#### Gmail Actions

**Gmail Send** → Webhook → Queue Retry → File Write
```typescript
PrimaryAction.GMAIL_SEND
├─ FallbackAction.WEBHOOK_POST
├─ FallbackAction.QUEUE_RETRY
└─ FallbackAction.FILE_WRITE
```

### Fallback Actions Explained

| Fallback Action | Description | Use Case |
|----------------|-------------|----------|
| `TRELLO_CREATE_CARD` | Create Trello card | Alternative task tracking |
| `GOOGLE_TASKS_CREATE` | Create Google Task | Simpler task tracking |
| `EMAIL_NOTIFICATION` | Send email | Alternative notification |
| `LOCAL_BACKUP` | Save to local JSON file | Data preservation |
| `CSV_LOG` | Append to CSV file | Structured logging |
| `CONSOLE_LOG` | Log to console | Debugging/monitoring |
| `FILE_WRITE` | Write to text file | Generic data storage |
| `WEBHOOK_POST` | POST to webhook | External notification |
| `QUEUE_RETRY` | Queue for later retry | Deferred execution |

---

## Configuration

### Environment Variables

```bash
# Enable/disable fallbacks
ENABLE_FALLBACKS=true

# Backup directory
FALLBACK_BACKUP_DIR=./backups

# CSV log directory
FALLBACK_CSV_DIR=./logs

# Webhook URL for notifications
FALLBACK_WEBHOOK_URL=https://hooks.example.com/fallback

# Notification email
FALLBACK_NOTIFICATION_EMAIL=team@example.com
```

### Configuration Options

```typescript
interface FallbackConfig {
  enabled: boolean;                 // Enable fallbacks globally
  backupDir: string;                // Local backup directory
  csvLogDir: string;                // CSV log directory
  webhookUrl?: string;              // Webhook URL for notifications
  notificationEmail?: string;       // Email for notifications
  maxFallbackAttempts: number;      // Max fallbacks to try (default: 3)
  notificationThrottle: number;     // Min time between notifications (ms)
}
```

### Default Configuration

```typescript
{
  enabled: true,                           // Fallbacks enabled by default
  backupDir: './backups',                  // Save backups here
  csvLogDir: './logs',                     // Save CSV logs here
  webhookUrl: undefined,                   // No webhook by default
  notificationEmail: undefined,            // No email by default
  maxFallbackAttempts: 3,                  // Try up to 3 fallbacks
  notificationThrottle: 5 * 60 * 1000     // 5 minutes between notifications
}
```

---

## API Reference

### Core Functions

#### `executeFallback(primaryAction, data, error): Promise<FallbackResult>`

Execute fallback strategy for failed action.

```typescript
const result = await fallbackHandler.executeFallback(
  PrimaryAction.NOTION_CREATE_PAGE,
  { title: 'Task', description: 'Details' },
  new Error('Notion API error')
);

// Result structure
interface FallbackResult {
  success: boolean;
  fallbackUsed?: FallbackAction;
  data?: any;  // Includes executedViaFallback: true
  error?: Error;
  metadata: {
    primaryAction: PrimaryAction;
    primaryError: Error;
    fallbacksAttempted: FallbackAction[];
    timestamp: Date;
    teamNotified: boolean;
    executionTime: number;
  };
}
```

### Configuration Functions

#### `configure(config: Partial<FallbackConfig>): void`

Configure fallback handler.

```typescript
fallbackHandler.configure({
  enabled: true,
  backupDir: '/var/backups',
  csvLogDir: '/var/logs',
  webhookUrl: 'https://hooks.example.com/fallback',
  notificationEmail: 'ops@example.com',
  maxFallbackAttempts: 2,
  notificationThrottle: 10 * 60 * 1000 // 10 minutes
});
```

#### `getConfig(): FallbackConfig`

Get current configuration.

```typescript
const config = fallbackHandler.getConfig();
console.log('Fallbacks enabled:', config.enabled);
console.log('Backup directory:', config.backupDir);
```

### Strategy Functions

#### `setStrategy(primaryAction, strategy): void`

Set custom fallback strategy.

```typescript
fallbackHandler.setStrategy(
  PrimaryAction.NOTION_CREATE_PAGE,
  {
    fallbacks: [
      FallbackAction.TRELLO_CREATE_CARD,
      FallbackAction.LOCAL_BACKUP
    ],
    notifyTeam: true,
    customHandler: async (data, error) => {
      // Custom fallback logic
      return {
        success: true,
        fallbackUsed: FallbackAction.TRELLO_CREATE_CARD,
        data: { ... },
        metadata: { ... }
      };
    }
  }
);
```

#### `getStrategy(primaryAction): FallbackStrategy | null`

Get fallback strategy for action.

```typescript
const strategy = fallbackHandler.getStrategy(
  PrimaryAction.NOTION_CREATE_PAGE
);

if (strategy) {
  console.log('Fallbacks:', strategy.fallbacks);
  console.log('Notify team:', strategy.notifyTeam);
}
```

#### `removeStrategy(primaryAction): void`

Remove custom strategy (revert to default).

```typescript
fallbackHandler.removeStrategy(PrimaryAction.NOTION_CREATE_PAGE);
```

#### `resetStrategies(): void`

Reset all custom strategies.

```typescript
fallbackHandler.resetStrategies();
```

### Statistics Functions

#### `getStats(): FallbackStats`

Get fallback statistics.

```typescript
const stats = fallbackHandler.getStats();
console.log('Total fallbacks:', stats.totalFallbacks);
console.log('Success rate:', 
  (stats.successfulFallbacks / stats.totalFallbacks * 100).toFixed(1) + '%'
);
```

#### `resetStats(): void`

Reset statistics.

```typescript
fallbackHandler.resetStats();
```

#### `formatStats(stats): string`

Format statistics for display.

```typescript
const stats = fallbackHandler.getStats();
console.log(fallbackHandler.formatStats(stats));
```

### Utility Functions

#### `hasFallback(primaryAction): boolean`

Check if fallback exists for action.

```typescript
if (fallbackHandler.hasFallback(PrimaryAction.NOTION_CREATE_PAGE)) {
  console.log('Fallback available');
}
```

#### `getAvailableFallbacks(primaryAction): FallbackAction[]`

Get list of fallbacks for action.

```typescript
const fallbacks = fallbackHandler.getAvailableFallbacks(
  PrimaryAction.SLACK_POST_MESSAGE
);
console.log('Fallbacks:', fallbacks);
// ['email:notification', 'webhook:post', 'console:log']
```

#### `listActions(): PrimaryAction[]`

List all actions with fallbacks.

```typescript
const actions = fallbackHandler.listActions();
console.log('Actions with fallbacks:', actions);
```

#### `enable(): void`

Enable fallbacks.

```typescript
fallbackHandler.enable();
```

#### `disable(): void`

Disable fallbacks.

```typescript
fallbackHandler.disable();
```

#### `isEnabled(): boolean`

Check if fallbacks are enabled.

```typescript
if (fallbackHandler.isEnabled()) {
  console.log('Fallbacks are enabled');
}
```

---

## Usage Examples

### Example 1: Basic Fallback

```typescript
import * as fallbackHandler from './workflows/fallback-handler';
import { PrimaryAction } from './workflows/fallback-handler';

async function createTask(title: string, description: string) {
  // Try Notion first
  try {
    const page = await notionClient.pages.create({
      parent: { database_id: databaseId },
      properties: {
        title: { title: [{ text: { content: title } }] },
        description: { rich_text: [{ text: { content: description } }] }
      }
    });
    
    return { service: 'notion', id: page.id };
    
  } catch (error: any) {
    // Notion failed, try fallback
    logger.warn('Notion failed, trying fallback', { error: error.message });
    
    const fallbackResult = await fallbackHandler.executeFallback(
      PrimaryAction.NOTION_CREATE_PAGE,
      { title, description },
      error
    );
    
    if (fallbackResult.success) {
      logger.info('Fallback succeeded', {
        fallback: fallbackResult.fallbackUsed,
        executedViaFallback: fallbackResult.data.executedViaFallback
      });
      return fallbackResult.data;
    }
    
    // All fallbacks failed
    throw new Error('All task creation methods failed');
  }
}
```

### Example 2: With Circuit Breaker

```typescript
import * as circuitBreaker from './workflows/circuit-breaker';
import * as fallbackHandler from './workflows/fallback-handler';

async function resilientAction(action: string, data: any) {
  // Try with circuit breaker first
  const result = await circuitBreaker.execute('notion', async () => {
    return await notionClient.createPage(data);
  });
  
  if (result.success) {
    return result.data;
  }
  
  // Circuit breaker failed or circuit open, try fallback
  const fallbackResult = await fallbackHandler.executeFallback(
    PrimaryAction.NOTION_CREATE_PAGE,
    data,
    result.error || new Error('Circuit breaker rejected')
  );
  
  if (fallbackResult.success) {
    return fallbackResult.data;
  }
  
  throw new Error('All methods failed');
}
```

### Example 3: Custom Strategy

```typescript
// Custom fallback for critical operations
fallbackHandler.setStrategy(
  PrimaryAction.NOTION_CREATE_PAGE,
  {
    fallbacks: [
      FallbackAction.TRELLO_CREATE_CARD,
      FallbackAction.LOCAL_BACKUP,
      FallbackAction.EMAIL_NOTIFICATION
    ],
    notifyTeam: true,
    customHandler: async (data, error) => {
      // Custom logic for critical pages
      logger.critical('Critical page creation failed', { error });
      
      // Try to save to multiple locations
      await Promise.all([
        saveToLocalDatabase(data),
        sendToBackupService(data),
        notifyOpsTeam(data, error)
      ]);
      
      return {
        success: true,
        fallbackUsed: FallbackAction.LOCAL_BACKUP,
        data: { ...data, backupCreated: true },
        metadata: {
          primaryAction: PrimaryAction.NOTION_CREATE_PAGE,
          primaryError: error,
          fallbacksAttempted: [FallbackAction.LOCAL_BACKUP],
          timestamp: new Date(),
          teamNotified: true,
          executionTime: 0
        }
      };
    }
  }
);
```

### Example 4: Notification Integration

```typescript
// Send Slack message with email fallback
async function sendNotification(message: string) {
  try {
    await slackClient.chat.postMessage({
      channel: '#notifications',
      text: message
    });
    
    return { service: 'slack', sent: true };
    
  } catch (error: any) {
    logger.warn('Slack failed, using fallback', { error: error.message });
    
    const fallbackResult = await fallbackHandler.executeFallback(
      PrimaryAction.SLACK_POST_MESSAGE,
      { message, channel: '#notifications' },
      error
    );
    
    if (fallbackResult.success) {
      logger.info('Notification sent via fallback', {
        fallback: fallbackResult.fallbackUsed
      });
      return fallbackResult.data;
    }
    
    throw new Error('Failed to send notification');
  }
}
```

### Example 5: File Upload with Backup

```typescript
// Upload to Drive with local backup fallback
async function uploadFile(filename: string, content: Buffer) {
  try {
    const file = await driveClient.files.create({
      requestBody: { name: filename },
      media: { body: content }
    });
    
    return { service: 'drive', id: file.data.id };
    
  } catch (error: any) {
    logger.warn('Drive upload failed, saving locally', { 
      error: error.message 
    });
    
    const fallbackResult = await fallbackHandler.executeFallback(
      PrimaryAction.DRIVE_UPLOAD,
      { filename, content: content.toString('base64') },
      error
    );
    
    if (fallbackResult.success) {
      logger.info('File saved to local backup', {
        path: fallbackResult.data.filepath
      });
      return fallbackResult.data;
    }
    
    throw new Error('Failed to save file');
  }
}
```

### Example 6: Data Update with CSV Log

```typescript
// Update Google Sheet with CSV fallback
async function updateSpreadsheet(data: any[]) {
  try {
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: { values: data }
    });
    
    return { service: 'sheets', updated: true };
    
  } catch (error: any) {
    logger.warn('Sheets update failed, logging to CSV', { 
      error: error.message 
    });
    
    const fallbackResult = await fallbackHandler.executeFallback(
      PrimaryAction.SHEETS_UPDATE,
      { values: data },
      error
    );
    
    if (fallbackResult.success) {
      logger.info('Data logged to CSV', {
        path: fallbackResult.data.filepath
      });
      return fallbackResult.data;
    }
    
    throw new Error('Failed to save data');
  }
}
```

### Example 7: Statistics Monitoring

```typescript
// Monitor fallback usage
function monitorFallbacks() {
  const stats = fallbackHandler.getStats();
  
  console.log(fallbackHandler.formatStats(stats));
  
  // Alert if fallback rate is high
  const fallbackRate = stats.totalFallbacks / 
    (stats.totalFallbacks + stats.successfulFallbacks);
  
  if (fallbackRate > 0.1) { // More than 10% fallback rate
    alerting.send({
      severity: 'warning',
      title: 'High Fallback Rate',
      message: `${(fallbackRate * 100).toFixed(1)}% of actions using fallbacks`
    });
  }
  
  // Show top failing actions
  const topFailing = Array.from(stats.byPrimaryAction.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  console.log('\nTop Failing Actions:');
  topFailing.forEach(([action, count]) => {
    console.log(`  ${action}: ${count} fallbacks`);
  });
}

// Run every 10 minutes
setInterval(monitorFallbacks, 10 * 60 * 1000);
```

---

## Custom Strategies

### Custom Fallback Function

```typescript
fallbackHandler.setStrategy(
  PrimaryAction.NOTION_CREATE_PAGE,
  {
    fallbacks: [],
    notifyTeam: true,
    customHandler: async (data, error) => {
      // Implement custom logic
      logger.info('Custom fallback handler', { data, error });
      
      try {
        // Try custom solution
        const result = await myCustomFallback(data);
        
        return {
          success: true,
          fallbackUsed: FallbackAction.CONSOLE_LOG,
          data: { ...result, executedViaFallback: true },
          metadata: {
            primaryAction: PrimaryAction.NOTION_CREATE_PAGE,
            primaryError: error,
            fallbacksAttempted: [],
            timestamp: new Date(),
            teamNotified: true,
            executionTime: 0
          }
        };
      } catch (customError: any) {
        return {
          success: false,
          error: customError,
          metadata: {
            primaryAction: PrimaryAction.NOTION_CREATE_PAGE,
            primaryError: error,
            fallbacksAttempted: [],
            timestamp: new Date(),
            teamNotified: false,
            executionTime: 0
          }
        };
      }
    }
  }
);
```

### Multi-Service Fallback Chain

```typescript
// Complex fallback chain with multiple services
fallbackHandler.setStrategy(
  PrimaryAction.NOTION_CREATE_PAGE,
  {
    fallbacks: [
      FallbackAction.TRELLO_CREATE_CARD,  // Try Trello first
      FallbackAction.GOOGLE_TASKS_CREATE,  // Then Google Tasks
      FallbackAction.LOCAL_BACKUP,         // Then local backup
      FallbackAction.EMAIL_NOTIFICATION    // Finally email
    ],
    notifyTeam: true
  }
);
```

---

## Statistics & Monitoring

### Statistics Structure

```typescript
interface FallbackStats {
  totalFallbacks: number;
  successfulFallbacks: number;
  failedFallbacks: number;
  byPrimaryAction: Map<PrimaryAction, number>;
  byFallbackAction: Map<FallbackAction, number>;
  notificationsSent: number;
  lastFallbackTime: Date | null;
}
```

### Monitoring Dashboard

```typescript
function createFallbackDashboard() {
  const stats = fallbackHandler.getStats();
  
  const dashboard = {
    overview: {
      total: stats.totalFallbacks,
      successful: stats.successfulFallbacks,
      failed: stats.failedFallbacks,
      successRate: stats.totalFallbacks > 0
        ? (stats.successfulFallbacks / stats.totalFallbacks * 100).toFixed(1) + '%'
        : '100%'
    },
    
    byAction: Array.from(stats.byPrimaryAction.entries()).map(([action, count]) => ({
      action,
      count,
      percentage: (count / stats.totalFallbacks * 100).toFixed(1) + '%'
    })),
    
    byFallback: Array.from(stats.byFallbackAction.entries()).map(([fallback, count]) => ({
      fallback,
      count,
      percentage: (count / stats.totalFallbacks * 100).toFixed(1) + '%'
    })),
    
    health: {
      status: stats.failedFallbacks === 0 ? 'healthy' : 'degraded',
      lastFallback: stats.lastFallbackTime?.toISOString() || 'never',
      notificationsSent: stats.notificationsSent
    }
  };
  
  return dashboard;
}
```

### Health Check Endpoint

```typescript
app.get('/health/fallbacks', (req, res) => {
  const stats = fallbackHandler.getStats();
  
  const health = {
    status: stats.failedFallbacks === 0 ? 'healthy' : 'degraded',
    fallbacks: {
      total: stats.totalFallbacks,
      successful: stats.successfulFallbacks,
      failed: stats.failedFallbacks,
      successRate: stats.totalFallbacks > 0
        ? (stats.successfulFallbacks / stats.totalFallbacks * 100).toFixed(1) + '%'
        : '100%'
    },
    lastFallback: stats.lastFallbackTime?.toISOString() || 'never'
  };
  
  res.json(health);
});
```

---

## Best Practices

### 1. Order Fallbacks by Similarity

```typescript
// Order: Most similar → Least similar
PrimaryAction.NOTION_CREATE_PAGE
├─ FallbackAction.TRELLO_CREATE_CARD    // Similar task tracking
├─ FallbackAction.GOOGLE_TASKS_CREATE   // Simpler task tracking
└─ FallbackAction.CSV_LOG               // Just log it
```

### 2. Always Include Data Preservation

```typescript
// Always have a way to preserve data
fallbacks: [
  FallbackAction.TRELLO_CREATE_CARD,  // Try alternative service
  FallbackAction.LOCAL_BACKUP,        // Save data locally
  FallbackAction.CSV_LOG              // At minimum, log it
]
```

### 3. Mark Fallback Executions

```typescript
// Data returned from fallback includes:
{
  ...originalData,
  executedViaFallback: true,
  primaryAction: 'notion:createPage',
  fallbackAction: 'trello:createCard',
  originalError: 'Notion API error'
}
```

### 4. Throttle Notifications

```typescript
// Don't spam team with notifications
fallbackHandler.configure({
  notificationThrottle: 5 * 60 * 1000  // 5 minutes between notifications
});
```

### 5. Monitor Fallback Usage

```typescript
// High fallback rate indicates problems
const stats = fallbackHandler.getStats();
const fallbackRate = stats.totalFallbacks / totalOperations;

if (fallbackRate > 0.1) {
  // More than 10% using fallbacks - investigate!
  alerting.send({
    severity: 'warning',
    message: 'High fallback usage detected'
  });
}
```

### 6. Test Fallback Paths

```typescript
// Regularly test fallbacks work
async function testFallbacks() {
  const testData = { title: 'Test', description: 'Test task' };
  
  const result = await fallbackHandler.executeFallback(
    PrimaryAction.NOTION_CREATE_PAGE,
    testData,
    new Error('Test error')
  );
  
  assert(result.success, 'Fallback should succeed');
  assert(result.fallbackUsed, 'Should use a fallback');
}
```

### 7. Handle Fallback Cleanup

```typescript
// Clean up fallback data periodically
async function cleanupFallbacks() {
  // Clean old backup files
  const files = fs.readdirSync(fallbackHandler.getConfig().backupDir);
  const oldFiles = files.filter(f => {
    const stat = fs.statSync(path.join(backupDir, f));
    const age = Date.now() - stat.mtimeMs;
    return age > 7 * 24 * 60 * 60 * 1000; // 7 days
  });
  
  oldFiles.forEach(f => {
    fs.unlinkSync(path.join(backupDir, f));
  });
  
  logger.info('Cleaned up old fallback files', { count: oldFiles.length });
}
```

---

## Production Deployment

### 1. Configuration

```typescript
// config/fallback.ts
export const fallbackConfig = {
  enabled: process.env.NODE_ENV !== 'test',
  backupDir: process.env.FALLBACK_BACKUP_DIR || '/var/backups/app',
  csvLogDir: process.env.FALLBACK_CSV_DIR || '/var/logs/app',
  webhookUrl: process.env.FALLBACK_WEBHOOK_URL,
  notificationEmail: process.env.FALLBACK_NOTIFICATION_EMAIL,
  maxFallbackAttempts: 3,
  notificationThrottle: 5 * 60 * 1000
};

fallbackHandler.configure(fallbackConfig);
```

### 2. Ensure Directories Exist

```typescript
// Ensure backup and log directories exist
import * as fs from 'fs';

const config = fallbackHandler.getConfig();

if (!fs.existsSync(config.backupDir)) {
  fs.mkdirSync(config.backupDir, { recursive: true });
}

if (!fs.existsSync(config.csvLogDir)) {
  fs.mkdirSync(config.csvLogDir, { recursive: true });
}
```

### 3. Set Up Monitoring

```typescript
// Monitor fallback usage
setInterval(() => {
  const stats = fallbackHandler.getStats();
  
  // Send metrics
  metrics.gauge('fallback.total', stats.totalFallbacks);
  metrics.gauge('fallback.successful', stats.successfulFallbacks);
  metrics.gauge('fallback.failed', stats.failedFallbacks);
  
  // Calculate success rate
  const successRate = stats.totalFallbacks > 0
    ? stats.successfulFallbacks / stats.totalFallbacks
    : 1;
  metrics.gauge('fallback.success_rate', successRate);
  
}, 30 * 1000); // Every 30 seconds
```

### 4. Health Checks

```typescript
app.get('/health', (req, res) => {
  const stats = fallbackHandler.getStats();
  
  res.json({
    fallbacks: {
      enabled: fallbackHandler.isEnabled(),
      total: stats.totalFallbacks,
      successful: stats.successfulFallbacks,
      failed: stats.failedFallbacks,
      lastUsed: stats.lastFallbackTime?.toISOString() || 'never'
    }
  });
});
```

---

## Integration Examples

### With Complete Reliability Stack

```typescript
import * as idempotency from './idempotency-manager';
import * as circuitBreaker from './circuit-breaker';
import * as retry from './retry-manager';
import * as fallback from './fallback-handler';

async function ultraReliableExecution(operation: Operation) {
  // 1. Idempotency (prevent duplicates)
  return await idempotency.executeWithIdempotency(
    operation.reasoning,
    async () => {
      try {
        // 2. Circuit breaker (prevent cascading failures)
        const cbResult = await circuitBreaker.execute(
          operation.executor,
          async () => {
            // 3. Retry (handle transient failures)
            return await retry.retry(
              () => operation.fn(),
              { platform: operation.executor }
            );
          }
        );
        
        if (cbResult.success) {
          return cbResult.data;
        }
        
        // Circuit breaker failed or circuit open
        throw cbResult.error || new Error('Circuit breaker rejected');
        
      } catch (error: any) {
        // 4. Fallback (graceful degradation)
        const fallbackResult = await fallback.executeFallback(
          operation.primaryAction,
          operation.data,
          error
        );
        
        if (fallbackResult.success) {
          return fallbackResult.data;
        }
        
        throw new Error('All reliability mechanisms failed');
      }
    }
  );
}
```

---

## Summary

The Fallback Action Handler provides:

- **Graceful Degradation**: Continue operation when services fail
- **Multiple Strategies**: Notion → Trello → Google Tasks → CSV
- **Data Preservation**: Local backups and CSV logs
- **Team Notifications**: Alert team of degraded service
- **Flexible Configuration**: Customize strategies per action
- **Comprehensive Monitoring**: Track usage and success rates

**Next Steps**: Integrate with workflow orchestrator and reliability stack for complete failure handling.
