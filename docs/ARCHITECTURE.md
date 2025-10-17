# Architecture Documentation

This document describes the architecture of the AI Operations Command Center integration layer, including design patterns, data flow, error handling strategies, and API reference for team collaboration.

---

## Table of Contents
1. [Integration Layer Architecture](#integration-layer-architecture)
2. [BaseIntegration Pattern](#baseintegration-pattern)
3. [EventHub Data Flow](#eventhub-data-flow)
4. [Error Handling & Retry Strategies](#error-handling--retry-strategies)
5. [Rate Limiting Implementation](#rate-limiting-implementation)
6. [Circuit Breaker Pattern](#circuit-breaker-pattern)
7. [Sequence Diagrams](#sequence-diagrams)
8. [Exported Functions Reference](#exported-functions-reference)
9. [Team Integration Guide](#team-integration-guide)

---

## Integration Layer Architecture

The integration layer follows a **modular adapter pattern** where each external service (Gmail, Slack, Sheets, Drive, Notion, Trello) is wrapped in a dedicated integration module.

### Key Components

```
src/integrations/
├── base-integration.ts       # Abstract base class for all integrations
├── event-hub.ts              # Central event router (pub/sub)
├── manager.ts                # Integration lifecycle manager
├── gmail/                    # Gmail integration (listener, fetcher, auth)
├── slack/                    # Slack integration (listener, actions, connection)
├── sheets/                   # Google Sheets (reader, writer)
├── drive/                    # Google Drive (file-manager, attachment-handler)
└── composio/                 # Composio-based integrations (Notion, Trello)
    ├── auth-manager.ts       # Centralized auth for Composio apps
    ├── notion-tools.ts       # Notion page/database operations
    ├── trello-tools.ts       # Trello card operations
    └── executor.ts           # Generic tool executor with rollback
```

### Design Principles
1. **Separation of Concerns**: Each integration is self-contained with its own auth, fetch, and action logic.
2. **Event-Driven**: Integrations emit events to EventHub; subscribers react asynchronously.
3. **Resilience**: Built-in retry, rate limiting, and circuit-breaking for fault tolerance.
4. **Testability**: Modules can be mocked/stubbed using Jest's module system.

---

## BaseIntegration Pattern

The `BaseIntegration<TClient>` abstract class provides common functionality for all integrations.

### Class Definition
```typescript
export abstract class BaseIntegration<TClient = any> {
  protected client: TClient | null = null;
  protected status: ConnectionStatus = 'disconnected';
  private lastRequestTs = 0;
  private minIntervalMs: number;

  constructor(minIntervalMs = 0) { ... }

  // Must be implemented by subclasses
  abstract connect(...args: any[]): Promise<TClient>;
  abstract disconnect(): Promise<void>;

  // Utility methods
  isConnected(): boolean;
  protected async withRetry<R>(fn: () => Promise<R>, attempts = 3): Promise<R>;
  async retry<R>(fn: () => Promise<R>): Promise<R>;
  protected async delay(ms: number);
  protected async rateLimit();
}
```

### Key Features
- **Connection Management**: Track connection status (`disconnected`, `connecting`, `connected`, `error`).
- **Retry Logic**: `withRetry` provides exponential backoff (1s, 2s, 4s) for transient failures.
- **Rate Limiting**: `rateLimit()` enforces minimum interval between requests.
- **Type Safety**: Generic `TClient` type allows type-safe client references.

### Example Subclass
```typescript
export class GmailFetcher extends BaseIntegration<Auth.OAuth2Client> {
  async connect(): Promise<Auth.OAuth2Client> {
    this.client = await getAuthenticatedClient();
    this.status = 'connected';
    return this.client;
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.status = 'disconnected';
  }

  async fetchUnreadMessages(minutes: number): Promise<ParsedMessage[]> {
    await this.rateLimit(); // Enforce rate limit
    return this.retry(async () => {
      // API call with automatic retry on failure
      const messages = await this.client!.users.messages.list(...);
      return messages;
    });
  }
}
```

---

## EventHub Data Flow

The `EventHub` is a centralized event router built on Node.js `EventEmitter`. All integrations publish events to the hub; downstream consumers subscribe to specific event types.

### EventHub Interface
```typescript
export interface HubEvent {
  source: string;         // e.g., 'gmail', 'slack', 'composio'
  type: string;           // e.g., 'message.received', 'service.started'
  timestamp: string;      // ISO 8601
  data: any;              // Event payload
  metadata?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
}
```

### Event Flow Diagram (ASCII)
```
┌──────────────┐       emitEvent()      ┌────────────┐
│ Gmail        │ ───────────────────────>│            │
│ Listener     │                         │  EventHub  │
└──────────────┘                         │            │
                                         │  (queue +  │
┌──────────────┐       emitEvent()      │   history) │       subscribe()
│ Slack        │ ───────────────────────>│            │ ────────────────> Handlers
│ Listener     │                         │            │                   (Workers,
└──────────────┘                         │            │                    LLM, etc.)
                                         └────────────┘
┌──────────────┐       emitEvent()              │
│ Integration  │ ───────────────────────────────┘
│ Manager      │        (lifecycle events)
└──────────────┘
```

### Key Methods
- `emitEvent(event)` — Enqueue event and dispatch to subscribers.
- `subscribe(eventType, handler)` — Register handler for specific event type.
- `getEventHistory(source?, limit)` — Retrieve recent events for debugging.
- `filterEvents(opts)` — Query events by source or priority.

### Event Processing
- Events are queued and processed in **batches** (25 at a time).
- High-priority events are dispatched first.
- Events are logged to `logs/events.log` for audit trail.
- History is kept in-memory (last 1000 events).

### Example Usage
```typescript
import eventHub from './integrations/event-hub';

// Producer: Gmail listener emits event
eventHub.emitEvent({
  source: 'gmail',
  type: 'message.received',
  data: { messageId: 'msg-123', subject: 'Urgent issue', from: 'user@example.com' },
  priority: 'high',
});

// Consumer: Subscribe to Gmail events
eventHub.subscribe('message.received', async (event: HubEvent) => {
  console.log('New email:', event.data.subject);
  // Process email (classify, route, trigger actions)
});
```

---

## Error Handling & Retry Strategies

### Retry Logic (BaseIntegration)
- **Exponential Backoff**: 1s → 2s → 4s between retries.
- **Max Attempts**: 3 attempts by default.
- **Error Propagation**: After exhausting retries, error is thrown to caller.

### Retry Queue (Global)
For operations that fail even after retries (e.g., rate limits, downstream outages), use the global retry queue:

```typescript
import retryQueue from './utils/retry-queue';

// Register handler
retryQueue.registerHandler('create-notion-page', async (params) => {
  return await notion.createPage(params.databaseId, params.properties);
});

// Enqueue operation
const id = retryQueue.enqueue({
  type: 'create-notion-page',
  params: { databaseId: 'db-123', properties: { title: 'Test' } },
});

// Process queue (scheduled automatically, or call manually)
await retryQueue.processQueue();
```

**Retry Queue Features:**
- Persists to `data/retry-queue.json` for durability.
- Exponential backoff with fixed delays: 30s, 2m, 5m, 15m, 1h.
- Max 5 attempts before marking as failed.
- Background processing every 60 seconds.

### Error Classification
- **Transient Errors**: Network timeouts, 5xx errors → Retry automatically.
- **Client Errors**: 4xx, invalid params → Log and fail immediately.
- **Auth Errors**: 401, 403 → Re-authenticate and retry once.
- **Rate Limits**: 429 → Enqueue to retry queue with exponential backoff.

---

## Rate Limiting Implementation

### Per-Integration Rate Limiting
Each integration sets a `minIntervalMs` to enforce minimum time between requests:

```typescript
const fetcher = new GmailFetcher(1000); // Min 1 second between requests
await fetcher.rateLimit(); // Waits if called too soon
await fetcher.fetchUnreadMessages(60);
```

### How It Works
```typescript
protected async rateLimit() {
  if (this.minIntervalMs <= 0) return;
  const now = Date.now();
  const elapsed = now - this.lastRequestTs;
  if (elapsed < this.minIntervalMs) {
    await this.delay(this.minIntervalMs - elapsed);
  }
  this.lastRequestTs = Date.now();
}
```

### Recommended Intervals
- Gmail API: 1000ms (1 req/sec for bursts, avoid quota exhaustion).
- Slack API: 500ms (Tier 3 = ~50 req/min safe with headroom).
- Notion/Trello (Composio): 200ms (depends on provider rate limits).
- Sheets/Drive: 1000ms (safe default for batch operations).

---

## Circuit Breaker Pattern

The `CircuitBreaker` utility prevents cascading failures by temporarily disabling calls to failing services.

### States
1. **Closed** (normal): Requests flow through.
2. **Open** (failure threshold reached): Requests fail immediately without calling service.
3. **Half-Open** (testing recovery): Allow one test request; if successful, close circuit; if failed, reopen.

### Usage
```typescript
import CircuitBreaker from './utils/circuit-breaker';

const breaker = new CircuitBreaker({
  failureThreshold: 5,    // Open after 5 consecutive failures
  resetTimeoutMs: 30000,  // Try half-open after 30 seconds
  monitoringWindowMs: 60000,
});

async function callExternalAPI() {
  return breaker.execute(async () => {
    const response = await fetch('https://api.example.com/data');
    if (!response.ok) throw new Error('API error');
    return response.json();
  });
}
```

### Benefits
- **Fast Fail**: When service is down, fail immediately instead of waiting for timeouts.
- **Automatic Recovery**: Circuit auto-recovers when service is healthy again.
- **Resource Protection**: Reduces load on failing services.

### Integration with Modules
Wrap high-risk external calls (payment APIs, third-party integrations) in circuit breakers:

```typescript
const notionBreaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 60000 });

export async function createPageWithCircuitBreaker(dbId: string, props: any) {
  return notionBreaker.execute(async () => {
    return await createPage(dbId, props);
  });
}
```

---

## Sequence Diagrams

### 1. Gmail Message → EventHub → Action Flow
```
User sends email
     │
     v
Gmail API
     │
     └──> GmailListener.pollOnce()
               │
               ├──> GmailFetcher.fetchUnreadMessages()
               │         │
               │         └──> [BaseIntegration.retry] ──> API call with backoff
               │
               └──> eventHub.emitEvent({
                      source: 'gmail',
                      type: 'message.received',
                      data: ParsedMessage
                    })
                         │
                         v
                    EventHub queues event
                         │
                         └──> dispatch to subscribers
                                   │
                                   ├──> Worker Agent (classifies email)
                                   │         │
                                   │         └──> LLM API → extract intent
                                   │                   │
                                   │                   └──> Decision: create Notion page
                                   │                             │
                                   │                             v
                                   │                   notion-tools.createPage()
                                   │                             │
                                   │                             └──> [if fails] → retryQueue.enqueue()
                                   │
                                   └──> Slack notifier (posts summary to #ops channel)
```

### 2. Integration Manager Lifecycle
```
App starts
     │
     v
IntegrationManager.startAll()
     │
     ├──> gmail.start()
     │      │
     │      ├──> GmailListener.connect() ──> OAuth client
     │      └──> GmailListener.start() ──> Start polling timer
     │            └──> eventHub.emitEvent({ type: 'service.started' })
     │
     ├──> slack.start()
     │      └──> SlackListener.start() ──> WebSocket connection
     │
     └──> [if any fails] ──> scheduleReconnect()
                                   │
                                   └──> setTimeout(reconnectAttempt, 10s)
```

### 3. Retry Queue Processing
```
Operation fails (e.g., Notion API 429 rate limit)
     │
     v
retryQueue.enqueue({
  type: 'create-notion-page',
  params: { ... }
})
     │
     └──> Save to data/retry-queue.json
            │
            v
Background timer (every 60s)
     │
     └──> retryQueue.processQueue()
               │
               ├──> Check nextAttemptAt for each item
               │
               ├──> [if ready] ──> Execute handler
               │         │
               │         ├──> Success ──> Remove from queue
               │         │
               │         └──> Failure ──> Increment attempt, schedule next retry
               │                   │
               │                   └──> [if attempts >= 5] ──> Mark as failed, log
               │
               └──> Persist updated queue to disk
```

---

## Exported Functions Reference

### `src/integrations/base-integration.ts`
- `BaseIntegration<TClient>` (abstract class)
  - `connect(...args): Promise<TClient>`
  - `disconnect(): Promise<void>`
  - `isConnected(): boolean`
  - `retry<R>(fn: () => Promise<R>): Promise<R>`

### `src/integrations/event-hub.ts`
- **Default export**: `eventHub` instance
- `emitEvent(event: Omit<HubEvent, 'timestamp'>): Promise<HubEvent>`
- `subscribe(eventType: string, handler: (e: HubEvent) => void): () => void`
- `getEventHistory(source?: string, limit = 50): HubEvent[]`
- `filterEvents(opts: { source?: string; minPriority?: EventPriority }): HubEvent[]`

### `src/integrations/manager.ts`
- **Default export**: `manager` instance
- `register(service: ServiceHandle): void`
- `startAll(): Promise<void>`
- `stopAll(): Promise<void>`
- `healthCheck(): Promise<Record<string, string>>`
- `getStatusDashboard(): Record<string, string>`

### `src/integrations/gmail/auth.ts`
- `generateAuthUrl(): string`
- `setTokenFromCode(code: string): Promise<void>`
- `getAuthenticatedClient(): Promise<Auth.OAuth2Client>`

### `src/integrations/gmail/fetcher.ts`
- `GmailFetcher` class
  - `fetchUnreadMessages(minutes: number): Promise<ParsedMessage[]>`
  - `fetchMessageById(id: string): Promise<ParsedMessage | null>`
  - `searchMessages(query: string, maxResults?: number): Promise<ParsedMessage[]>`

### `src/integrations/gmail/listener.ts`
- `GmailListener` class
  - `start(): Promise<void>`
  - `stop(): void`
  - `on(event: 'message' | 'error', listener: Function): void`
  - `getStatus(): object`

### `src/integrations/slack/connection.ts`
- `getSlackApp(retries = 3, backoffMs = 1000): App`

### `src/integrations/slack/listener.ts`
- `SlackListener` class
  - `start(): Promise<void>`
  - `stop(): Promise<void>`
  - `on(event: 'message' | 'error', listener: Function): void`

### `src/integrations/slack/actions.ts`
- **Default export**: `slackActions` instance
- `sendMessage(channel: string, text: string, blocks?: any): Promise<any>`
- `sendDirectMessage(userId: string, text: string): Promise<any>`
- `addReaction(channel: string, timestamp: string, emoji: string): Promise<void>`
- `updateMessage(channel: string, timestamp: string, newText: string): Promise<void>`

### `src/integrations/sheets/reader.ts`
- **Default export**: `SheetsReader` instance
- `readRange(spreadsheetId: string, range: string): Promise<any[][]>`
- `readNamedRange(spreadsheetId: string, rangeName: string): Promise<any[][]>`
- `getSpreadsheetMetadata(spreadsheetId: string): Promise<any>`

### `src/integrations/sheets/writer.ts`
- **Default export**: `SheetsWriter` instance
- `writeRange(spreadsheetId: string, range: string, values: any[][]): Promise<void>`
- `appendRows(spreadsheetId: string, range: string, values: any[][]): Promise<void>`
- `clearRange(spreadsheetId: string, range: string): Promise<void>`
- `batchUpdate(spreadsheetId: string, requests: any[]): Promise<any>`

### `src/integrations/drive/file-manager.ts`
- **Default export**: `DriveFileManager` instance
- `uploadFile(source: UploadSource, name: string, mimeType: string, folderId?: string): Promise<string>`
- `downloadFile(fileId: string): Promise<Buffer>`
- `listFiles(query?: string, pageSize = 100): Promise<any[]>`
- `deleteFile(fileId: string): Promise<void>`
- `createFolder(name: string, parentId?: string): Promise<string>`

### `src/integrations/drive/attachment-handler.ts`
- `handleAttachment(attachment: ParsedAttachment, opts?: AttachmentHandlerOptions): Promise<AttachmentResult>`
- `handleAttachments(attachments: ParsedAttachment[], opts?: AttachmentHandlerOptions): Promise<AttachmentResult[]>`

### `src/integrations/composio/auth-manager.ts`
- **Default export**: Auth manager object
  - `authenticateApp(appName: 'notion' | 'trello'): Promise<any>`
  - `refreshAuth(appName): Promise<any>`
  - `isAuthenticated(appName): boolean`
  - `getClient(appName): Promise<any>`

### `src/integrations/composio/notion-tools.ts`
- `createPage(databaseId: string, properties: NotionProperties): Promise<OperationResult>`
- `updatePage(pageId: string, properties: NotionProperties): Promise<OperationResult>`
- `queryDatabase(databaseId: string, filter?: any, sort?: any): Promise<OperationResult>`

### `src/integrations/composio/trello-tools.ts`
- `createCard(listId: string, name: string, desc?: string, due?: Date, labels?: string[], attachments?: string[]): Promise<CreateCardResult>`
- `moveCard(cardId: string, newListId: string): Promise<any>`
- `addComment(cardId: string, text: string): Promise<any>`
- `getCard(cardId: string): Promise<any>`

### `src/integrations/composio/executor.ts`
- **Default export**: Executor object
  - `executeTool(tool: string, params: any): Promise<any>`
  - `rollbackLast(): Promise<void>`

---

## Team Integration Guide

### For Team Members Using These Modules

#### 1. Adding a New Event Listener
If you want to react to events (e.g., new emails, Slack messages):

```typescript
import eventHub from './integrations/event-hub';

// Subscribe to Gmail events
const unsubscribe = eventHub.subscribe('message.received', async (event) => {
  const { data } = event;
  console.log('New email from:', data.from, 'Subject:', data.subject);
  
  // Your processing logic here (e.g., classify with LLM, route to workflow)
});

// Later: unsubscribe if needed
unsubscribe();
```

#### 2. Triggering Actions (Notion, Trello, Slack)
Use the exported helper functions:

```typescript
import { createPage } from './integrations/composio/notion-tools';
import { sendMessage } from './integrations/slack/actions';

// Create a Notion page
const result = await createPage('database-id-123', {
  title: { title: [{ text: { content: 'New Task' } }] },
  status: { select: { name: 'In Progress' } },
});

if (result.success) {
  // Notify Slack
  await sendMessage('#ops', `Created Notion page: ${result.pageId}`);
}
```

#### 3. Using Retry Queue for Resilient Operations
For operations that may hit rate limits or fail transiently:

```typescript
import retryQueue from './utils/retry-queue';

// Register your handler
retryQueue.registerHandler('my-operation', async (params) => {
  return await someExternalAPI(params);
});

// Enqueue operation (will retry on failure)
const id = retryQueue.enqueue({
  type: 'my-operation',
  params: { key: 'value' },
});
```

#### 4. Health Checks & Monitoring
Query integration status:

```typescript
import manager from './integrations/manager';

const health = await manager.healthCheck();
console.log(health); // { gmail: 'connected', slack: 'connected', ... }
```

#### 5. Testing with Sample Data
Use the sample data generator for tests:

```typescript
import { demoMode } from '../tests/sample-data/generator';

// Get a sample urgent email
const email = demoMode.getEmail('urgent');

// Filter emails by criteria
const highPriority = demoMode.filterEmails({ priority: 'high', unread: true });

// Get Slack message
const message = demoMode.getSlackMessage('#incidents');
```

#### 6. Best Practices
- **Always use EventHub** for cross-module communication (don't tightly couple modules).
- **Handle errors gracefully**: Wrap external calls in try-catch and use retry queue for failures.
- **Respect rate limits**: Set appropriate `minIntervalMs` for your integration.
- **Log important events**: Use the logger utility for debugging.
- **Write tests**: Use `jest.isolateModules` and `jest.doMock` to mock integrations (see existing tests for patterns).

#### 7. Adding a New Integration
Steps:
1. Create a new file under `src/integrations/your-service/`.
2. Extend `BaseIntegration<YourClient>` for connection management.
3. Implement `connect()` and `disconnect()` methods.
4. Emit events to EventHub when data arrives.
5. Register with IntegrationManager for lifecycle management.
6. Add unit tests under `tests/integrations/your-service.test.ts`.

Example skeleton:

```typescript
import { BaseIntegration } from '../base-integration';
import eventHub from '../event-hub';

export class MyServiceIntegration extends BaseIntegration<MyClient> {
  async connect(): Promise<MyClient> {
    this.client = await authenticateMyService();
    this.status = 'connected';
    return this.client;
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.status = 'disconnected';
  }

  async fetchData() {
    await this.rateLimit();
    return this.retry(async () => {
      const data = await this.client!.getData();
      eventHub.emitEvent({
        source: 'my-service',
        type: 'data.received',
        data,
      });
      return data;
    });
  }
}
```

---

## Summary

This architecture provides:
- ✅ **Modularity**: Each integration is independent and testable.
- ✅ **Resilience**: Retry, rate limiting, circuit-breakers built-in.
- ✅ **Event-Driven**: Loose coupling via EventHub.
- ✅ **Observability**: Event history, logging, health checks.
- ✅ **Extensibility**: Easy to add new integrations following the pattern.

For questions or contributions, see `docs/TROUBLESHOOTING.md` and `README.md`.
