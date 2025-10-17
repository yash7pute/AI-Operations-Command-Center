# Orchestration Layer API

**Version**: 1.0  
**Last Updated**: October 17, 2025  
**Status**: Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [For Member 2 (Reasoning Engine)](#for-member-2-reasoning-engine)
   - [Events to Listen](#events-to-listen)
   - [Events to Emit Back](#events-to-emit-back)
   - [Feedback Interface](#feedback-interface)
   - [Action Schema](#action-schema)
3. [For Member 4 (Dashboard)](#for-member-4-dashboard)
   - [REST Endpoints](#rest-endpoints)
   - [WebSocket Events](#websocket-events)
   - [Data Models](#data-models)
4. [For Member 1 (Context Aggregator)](#for-member-1-context-aggregator)
5. [Error Codes](#error-codes)
6. [Rate Limits](#rate-limits)
7. [Usage Examples](#usage-examples)
8. [Security](#security)

---

## Overview

The **Orchestration Layer API** provides interfaces for all agents in the AI Operations Command Center to interact with action execution. This document specifies:

- **Member 2 (Reasoning Engine)**: Event-driven action submission and feedback
- **Member 4 (Dashboard)**: REST API and WebSocket for monitoring
- **Member 1 (Context Aggregator)**: Action history queries

### Architecture

```
┌─────────────────┐         ┌─────────────────┐
│    MEMBER 1     │         │    MEMBER 2     │
│  Context Agg.   │         │ Reasoning Engine│
└────────┬────────┘         └────────┬────────┘
         │                           │
         │ GET /context/actions      │ event:action:ready
         │                           │ event:action:requires_approval
         ▼                           ▼
    ┌────────────────────────────────────────┐
    │       ORCHESTRATION LAYER API          │
    │  ┌──────────────────────────────────┐  │
    │  │     Event Bus (EventEmitter)     │  │
    │  └──────────────────────────────────┘  │
    │  ┌──────────────────────────────────┐  │
    │  │     REST API (Express)           │  │
    │  └──────────────────────────────────┘  │
    │  ┌──────────────────────────────────┐  │
    │  │     WebSocket (Socket.io)        │  │
    │  └──────────────────────────────────┘  │
    └─────────────────┬──────────────────────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
         ▼            ▼            ▼
    ┌────────┐  ┌────────┐  ┌────────┐
    │ Queue  │  │Workflow│  │Approval│
    │Manager │  │Orchest.│  │Handler │
    └────────┘  └────────┘  └────────┘
         │            │            │
         ▼            ▼            ▼
    ┌─────────────────────────────────┐
    │      Platform Executors         │
    │ Notion│Trello│Slack│Drive│Sheets│
    └─────────────────────────────────┘
         │            │            │
         ▼            ▼            ▼
    ┌─────────────────────────────────┐
    │    MEMBER 4 (Dashboard)         │
    │  • WebSocket subscriptions      │
    │  • REST API polling             │
    │  • Real-time metrics            │
    └─────────────────────────────────┘
```

---

## For Member 2 (Reasoning Engine)

Member 2 is the reasoning agent that analyzes context and decides which actions to execute. It communicates with the orchestration layer via **event-driven interface**.

### Events to Listen

Member 2 should listen to these events from the orchestration layer to get action results and feedback.

#### `action:completed`

Emitted when an action completes successfully.

**Event Data**:
```typescript
interface ActionCompletedEvent {
  actionId: string;           // Unique action identifier
  type: string;               // Action type (create, update, notify, etc.)
  platform: string;           // Platform (notion, trello, slack, drive, sheets)
  result: any;                // Platform-specific result
  executionTime: number;      // Execution time in milliseconds
  queueTime: number;          // Time spent in queue (ms)
  retries: number;            // Number of retry attempts
  timestamp: string;          // ISO 8601 timestamp
  metadata?: any;             // Additional context
}
```

**Example Usage**:
```typescript
import { eventBus } from './orchestration/event-bus';

eventBus.on('action:completed', async (event: ActionCompletedEvent) => {
  console.log(`Action ${event.actionId} completed in ${event.executionTime}ms`);
  
  // Update reasoning model with success
  await reasoningEngine.recordSuccess(event);
  
  // Learn from execution patterns
  if (event.executionTime > 5000) {
    await reasoningEngine.flagSlowAction(event);
  }
});
```

#### `action:failed`

Emitted when an action fails after all retry attempts.

**Event Data**:
```typescript
interface ActionFailedEvent {
  actionId: string;           // Unique action identifier
  type: string;               // Action type
  platform: string;           // Platform
  error: string;              // Error message
  errorCode: string;          // Standardized error code
  retriable: boolean;         // Whether retry is possible
  retries: number;            // Number of retry attempts made
  timestamp: string;          // ISO 8601 timestamp
  stackTrace?: string;        // Stack trace (debug mode only)
  metadata?: any;             // Additional context
}
```

**Example Usage**:
```typescript
eventBus.on('action:failed', async (event: ActionFailedEvent) => {
  console.error(`Action ${event.actionId} failed: ${event.error}`);
  
  if (event.retriable) {
    // Consider alternative approach
    await reasoningEngine.retryWithModification(event);
  } else {
    // Learn from permanent failure
    await reasoningEngine.recordFailure(event);
  }
});
```

#### `action:queued`

Emitted when an action is added to the execution queue.

**Event Data**:
```typescript
interface ActionQueuedEvent {
  actionId: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  queuePosition: number;      // Position in queue
  estimatedWait: number;      // Estimated wait time (ms)
  timestamp: string;
}
```

**Example Usage**:
```typescript
eventBus.on('action:queued', async (event: ActionQueuedEvent) => {
  console.log(`Action ${event.actionId} queued at position ${event.queuePosition}`);
  
  // Update user if wait time is long
  if (event.estimatedWait > 30000) {
    await notifyUser(`Action will execute in ~${event.estimatedWait / 1000}s`);
  }
});
```

#### `action:executing`

Emitted when an action starts execution (picked up by worker).

**Event Data**:
```typescript
interface ActionExecutingEvent {
  actionId: string;
  workerId: string;           // Worker ID executing the action
  startTime: string;          // ISO 8601 timestamp
  queueTime: number;          // Time spent in queue (ms)
}
```

**Example Usage**:
```typescript
eventBus.on('action:executing', async (event: ActionExecutingEvent) => {
  console.log(`Action ${event.actionId} now executing by ${event.workerId}`);
  
  // Track execution start
  await reasoningEngine.markExecuting(event.actionId);
});
```

#### `approval:pending`

Emitted when an action requires human approval.

**Event Data**:
```typescript
interface ApprovalPendingEvent {
  actionId: string;
  approvalId: string;         // Unique approval ID
  action: Action;             // Full action details
  reason: string;             // Why approval is needed
  slackMessageTs: string;     // Slack message timestamp
  expiresAt: string;          // Approval timeout (ISO 8601)
  timestamp: string;
}
```

**Example Usage**:
```typescript
eventBus.on('approval:pending', async (event: ApprovalPendingEvent) => {
  console.log(`Action ${event.actionId} requires approval: ${event.reason}`);
  
  // Monitor approval status
  await reasoningEngine.trackApproval(event);
});
```

#### `approval:resolved`

Emitted when approval is granted or rejected.

**Event Data**:
```typescript
interface ApprovalResolvedEvent {
  actionId: string;
  approvalId: string;
  status: 'approved' | 'rejected' | 'timeout';
  resolvedBy?: string;        // User ID who resolved
  reason?: string;            // Rejection reason
  timestamp: string;
}
```

**Example Usage**:
```typescript
eventBus.on('approval:resolved', async (event: ApprovalResolvedEvent) => {
  if (event.status === 'approved') {
    console.log(`Action ${event.actionId} approved by ${event.resolvedBy}`);
    // Action will auto-execute
  } else if (event.status === 'rejected') {
    console.log(`Action ${event.actionId} rejected: ${event.reason}`);
    await reasoningEngine.handleRejection(event);
  } else {
    console.log(`Action ${event.actionId} timed out`);
    await reasoningEngine.handleTimeout(event);
  }
});
```

### Events to Emit Back

Member 2 emits these events to request action execution.

#### `action:ready`

Emit this event to execute an action immediately (no approval required).

**Event Data**:
```typescript
interface ActionReadyEvent {
  action: Action;             // Action to execute (see schema below)
  context?: any;              // Additional context for debugging
  correlationId?: string;     // For tracking related actions
}
```

**Example Usage**:
```typescript
import { eventBus } from './orchestration/event-bus';
import { Action } from './orchestration/types';

// Create action
const action: Action = {
  id: generateActionId(),
  type: 'create',
  platform: 'notion',
  priority: 'normal',
  data: {
    database_id: process.env.NOTION_DATABASE_ID,
    title: 'Review Q4 budget',
    properties: {
      status: { select: { name: 'To Do' } },
      priority: { select: { name: 'High' } }
    }
  },
  requiresApproval: false
};

// Emit event
eventBus.emit('action:ready', {
  action,
  context: {
    userRequest: 'Create task for budget review',
    reasoning: 'User mentioned budget in email'
  },
  correlationId: 'email-123'
});
```

#### `action:requires_approval`

Emit this event to queue an action for human approval.

**Event Data**:
```typescript
interface ActionRequiresApprovalEvent {
  action: Action;             // Action to approve
  reason: string;             // Why approval is needed
  context?: any;              // Additional context
  approvers?: string[];       // Specific approvers (Slack user IDs)
  timeout?: number;           // Approval timeout (ms, default: 3600000)
}
```

**Example Usage**:
```typescript
// High-impact action requiring approval
const action: Action = {
  id: generateActionId(),
  type: 'delete',
  platform: 'trello',
  priority: 'critical',
  data: {
    operation: 'bulk_delete',
    cardIds: ['card-1', 'card-2', /* ... 20 cards */]
  },
  requiresApproval: true
};

// Emit event
eventBus.emit('action:requires_approval', {
  action,
  reason: 'Bulk delete operation affects 20 cards',
  context: {
    userRequest: 'Archive all Q3 completed tasks',
    estimatedImpact: 'Permanent deletion of 20 cards'
  },
  approvers: ['U12345', 'U67890'],  // Specific team leads
  timeout: 1800000  // 30 minutes
});
```

#### `workflow:ready`

Emit this event to execute a multi-step workflow.

**Event Data**:
```typescript
interface WorkflowReadyEvent {
  workflowId: string;
  name: string;               // Workflow name
  steps: WorkflowStep[];      // Ordered steps
  transactional: boolean;     // Enable rollback on failure
  idempotencyKey?: string;    // Prevent duplicate execution
  context?: any;
}

interface WorkflowStep {
  name: string;
  action: Action;
  dependsOn?: string;         // Previous step name
  rollback?: () => Promise<void>;  // Rollback function
}
```

**Example Usage**:
```typescript
eventBus.emit('workflow:ready', {
  workflowId: 'wf-invoice-001',
  name: 'invoice-processing',
  transactional: true,
  idempotencyKey: 'invoice-2025-10-001',
  steps: [
    {
      name: 'create_file',
      action: {
        id: 'action-001',
        type: 'file',
        platform: 'drive',
        priority: 'normal',
        data: { /* file data */ }
      }
    },
    {
      name: 'update_sheet',
      action: {
        id: 'action-002',
        type: 'log',
        platform: 'sheets',
        priority: 'normal',
        data: { /* sheet data */ }
      },
      dependsOn: 'create_file'
    },
    {
      name: 'notify',
      action: {
        id: 'action-003',
        type: 'notify',
        platform: 'slack',
        priority: 'high',
        data: { /* notification data */ }
      },
      dependsOn: 'update_sheet'
    }
  ],
  context: {
    invoiceId: 'INV-001',
    amount: '$5,000'
  }
});
```

### Feedback Interface

Member 2 can provide feedback on action execution to improve future decisions.

#### `provideFeedback()`

Submit feedback on action execution quality.

**Function Signature**:
```typescript
import { provideFeedback } from './workflows/feedback';

async function provideFeedback(
  actionId: string,
  feedback: Feedback
): Promise<void>;

interface Feedback {
  outcome: 'success' | 'failure' | 'modified';
  userModifications?: object;   // Changes user made to output
  executionQuality: 1 | 2 | 3 | 4 | 5;  // 1=poor, 5=excellent
  notes?: string;               // Additional feedback
  learningPoints?: string[];    // Key takeaways
}
```

**Example Usage**:
```typescript
import { provideFeedback } from './workflows/feedback';

// Scenario 1: Perfect execution
await provideFeedback('action-123', {
  outcome: 'success',
  executionQuality: 5,
  notes: 'Task created exactly as requested'
});

// Scenario 2: User modified output
await provideFeedback('action-456', {
  outcome: 'modified',
  userModifications: {
    before: { priority: 'High', status: 'To Do' },
    after: { priority: 'Critical', status: 'In Progress' }
  },
  executionQuality: 3,
  notes: 'Priority should have been Critical based on context',
  learningPoints: [
    'User email had "urgent" keyword',
    'Deadline was within 24 hours',
    'Should map "urgent" → "Critical" priority'
  ]
});

// Scenario 3: Complete failure
await provideFeedback('action-789', {
  outcome: 'failure',
  executionQuality: 1,
  notes: 'Wrong database selected',
  learningPoints: [
    'Misinterpreted "client projects" as internal projects',
    'Need better disambiguation of workspace context'
  ]
});
```

### Action Schema

Complete schema for the `Action` object.

```typescript
interface Action {
  // Identification
  id: string;                       // Unique action ID (UUID)
  type: ActionType;                 // Action type
  platform: Platform;               // Target platform
  
  // Execution
  priority: Priority;               // Execution priority
  requiresApproval: boolean;        // Whether approval is needed
  
  // Data
  data: any;                        // Platform-specific data
  
  // Metadata (optional)
  correlationId?: string;           // Related actions
  userId?: string;                  // User who triggered
  source?: string;                  // Source (email, slack, api)
  timeout?: number;                 // Execution timeout (ms)
  retryConfig?: RetryConfig;        // Custom retry settings
  tags?: string[];                  // For categorization
}

type ActionType = 
  | 'create'          // Create new item
  | 'update'          // Update existing item
  | 'delete'          // Delete item
  | 'notify'          // Send notification
  | 'file'            // File operation
  | 'log'             // Log data
  | 'query'           // Query data
  | 'approve';        // Approval request

type Platform = 
  | 'notion'
  | 'trello'
  | 'slack'
  | 'drive'
  | 'sheets';

type Priority = 
  | 'critical'        // Execute immediately (0-5s)
  | 'high'            // Execute soon (5-30s)
  | 'normal'          // Standard queue (30s-2min)
  | 'low';            // Background (2min+)

interface RetryConfig {
  maxRetries: number;         // Default: 3
  initialDelay: number;       // Default: 1000ms
  backoffMultiplier: number;  // Default: 2
  maxDelay: number;           // Default: 30000ms
}
```

#### Platform-Specific Data Schemas

**Notion**:
```typescript
// Create task
{
  database_id: string;
  title: string;
  properties?: {
    status?: { select: { name: string } };
    priority?: { select: { name: string } };
    due_date?: { date: { start: string } };
    assignee?: { people: [{ id: string }] };
    [key: string]: any;
  };
}

// Update task
{
  page_id: string;
  properties: { [key: string]: any };
}
```

**Trello**:
```typescript
// Create card
{
  name: string;
  listId: string;
  desc?: string;
  labels?: string[];
  due?: string;  // ISO 8601
  members?: string[];
}

// Move card
{
  cardId: string;
  listId: string;
}
```

**Slack**:
```typescript
// Send notification
{
  channel: string;      // #channel or @user
  text: string;
  blocks?: any[];       // Rich formatting
  thread_ts?: string;   // Reply in thread
}

// Approval request
{
  channel: string;
  action: Action;
  reason: string;
}
```

**Drive**:
```typescript
// Upload file
{
  name: string;
  content: string | Buffer;
  mimeType: string;
  folderId?: string;
  permissions?: {
    type: 'user' | 'group' | 'domain' | 'anyone';
    role: 'owner' | 'writer' | 'commenter' | 'reader';
    emailAddress?: string;
  }[];
}
```

**Sheets**:
```typescript
// Append row
{
  spreadsheetId: string;
  range: string;  // e.g., "Sheet1!A:E"
  values: any[][];
}

// Update cell
{
  spreadsheetId: string;
  range: string;  // e.g., "Sheet1!A1"
  value: string | number;
}
```

---

## For Member 4 (Dashboard)

Member 4 is the dashboard/UI that displays real-time action execution status. It uses **REST API** for queries and **WebSocket** for real-time updates.

### REST Endpoints

Base URL: `http://localhost:3000/api`

#### GET `/api/actions/recent`

Get recently executed actions.

**Query Parameters**:
```typescript
{
  limit?: number;       // Max results (default: 50, max: 500)
  offset?: number;      // Pagination offset (default: 0)
  platform?: string;    // Filter by platform
  status?: string;      // Filter by status (success, failed, pending)
  startDate?: string;   // ISO 8601 timestamp
  endDate?: string;     // ISO 8601 timestamp
}
```

**Response**:
```typescript
{
  actions: Array<{
    id: string;
    type: string;
    platform: string;
    priority: string;
    status: 'success' | 'failed' | 'pending';
    result?: any;
    error?: string;
    executionTime?: number;
    queueTime?: number;
    retries: number;
    timestamp: string;
  }>;
  total: number;
  limit: number;
  offset: number;
}
```

**Example**:
```bash
curl "http://localhost:3000/api/actions/recent?limit=20&platform=notion&status=success"
```

```typescript
// TypeScript
const response = await fetch('/api/actions/recent?limit=20');
const data = await response.json();

console.log(`Total actions: ${data.total}`);
data.actions.forEach(action => {
  console.log(`${action.type} on ${action.platform}: ${action.status}`);
});
```

#### GET `/api/actions/queue`

Get current queue status.

**Query Parameters**: None

**Response**:
```typescript
{
  queues: {
    critical: Array<{
      actionId: string;
      type: string;
      platform: string;
      queuedAt: string;
      estimatedWait: number;
    }>;
    high: Array<{ /* same */ }>;
    normal: Array<{ /* same */ }>;
    low: Array<{ /* same */ }>;
  };
  stats: {
    totalQueued: number;
    avgWaitTime: number;
    workerUtilization: number;  // 0-1
  };
}
```

**Example**:
```bash
curl "http://localhost:3000/api/actions/queue"
```

```typescript
const response = await fetch('/api/actions/queue');
const data = await response.json();

console.log(`Queue depth: ${data.stats.totalQueued}`);
console.log(`Critical: ${data.queues.critical.length}`);
console.log(`High: ${data.queues.high.length}`);
console.log(`Normal: ${data.queues.normal.length}`);
console.log(`Low: ${data.queues.low.length}`);
```

#### GET `/api/actions/metrics`

Get performance metrics.

**Query Parameters**:
```typescript
{
  timeWindow?: string;  // '1h', '6h', '24h', '7d' (default: '24h')
  platform?: string;    // Filter by platform
}
```

**Response**:
```typescript
{
  timeWindow: string;
  metrics: {
    totalActions: number;
    successRate: number;        // 0-1
    avgExecutionTime: number;   // milliseconds
    avgQueueTime: number;       // milliseconds
    retryRate: number;          // 0-1
    fallbackRate: number;       // 0-1
  };
  byPlatform: {
    [platform: string]: {
      total: number;
      successRate: number;
      avgExecutionTime: number;
    };
  };
  timeline: Array<{
    timestamp: string;
    actionsPerMinute: number;
    successRate: number;
  }>;
}
```

**Example**:
```bash
curl "http://localhost:3000/api/actions/metrics?timeWindow=6h&platform=notion"
```

```typescript
const response = await fetch('/api/actions/metrics?timeWindow=24h');
const data = await response.json();

console.log(`Success rate: ${(data.metrics.successRate * 100).toFixed(1)}%`);
console.log(`Avg execution: ${data.metrics.avgExecutionTime}ms`);

// Platform breakdown
Object.entries(data.byPlatform).forEach(([platform, stats]) => {
  console.log(`${platform}: ${(stats.successRate * 100).toFixed(1)}% success`);
});
```

#### GET `/api/actions/health`

Get executor health status.

**Query Parameters**: None

**Response**:
```typescript
{
  overall: 'healthy' | 'degraded' | 'critical';
  executors: {
    [platform: string]: {
      status: 'healthy' | 'degraded' | 'down';
      circuitBreaker: {
        state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
        failureCount: number;
        lastFailure?: string;
      };
      rateLimit: {
        current: number;
        limit: number;
        resetAt: string;
      };
      lastSuccess?: string;
      avgResponseTime: number;
    };
  };
  queue: {
    depth: number;
    oldestAction?: string;
    workerUtilization: number;
  };
}
```

**Example**:
```bash
curl "http://localhost:3000/api/actions/health"
```

```typescript
const response = await fetch('/api/actions/health');
const data = await response.json();

if (data.overall === 'critical') {
  console.error('System critical! Check executors.');
}

// Check each platform
Object.entries(data.executors).forEach(([platform, health]) => {
  console.log(`${platform}: ${health.status} (${health.circuitBreaker.state})`);
  
  if (health.status === 'down') {
    console.error(`❌ ${platform} is down!`);
  }
});
```

#### POST `/api/approvals/:id/approve`

Approve a pending action.

**URL Parameters**:
- `id`: Approval ID (from `approval:pending` event)

**Request Body**:
```typescript
{
  userId: string;       // User approving (Slack user ID)
  reason?: string;      // Optional approval reason
}
```

**Response**:
```typescript
{
  status: 'approved';
  approvalId: string;
  actionId: string;
  approvedBy: string;
  timestamp: string;
}
```

**Example**:
```bash
curl -X POST "http://localhost:3000/api/approvals/apv-123/approve" \
  -H "Content-Type: application/json" \
  -d '{"userId": "U12345", "reason": "Budget approved"}'
```

```typescript
const response = await fetch('/api/approvals/apv-123/approve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'U12345',
    reason: 'Approved after review'
  })
});

const data = await response.json();
console.log(`Approval ${data.approvalId} approved by ${data.approvedBy}`);
```

#### POST `/api/approvals/:id/reject`

Reject a pending action.

**URL Parameters**:
- `id`: Approval ID

**Request Body**:
```typescript
{
  userId: string;       // User rejecting
  reason: string;       // Required: Rejection reason
}
```

**Response**:
```typescript
{
  status: 'rejected';
  approvalId: string;
  actionId: string;
  rejectedBy: string;
  reason: string;
  timestamp: string;
}
```

**Example**:
```bash
curl -X POST "http://localhost:3000/api/approvals/apv-123/reject" \
  -H "Content-Type: application/json" \
  -d '{"userId": "U12345", "reason": "Insufficient budget"}'
```

```typescript
const response = await fetch('/api/approvals/apv-123/reject', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'U12345',
    reason: 'Budget not yet allocated'
  })
});

const data = await response.json();
console.log(`Approval rejected: ${data.reason}`);
```

### WebSocket Events

Connect to WebSocket for real-time updates.

**Connection**:
```typescript
import io from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to orchestration layer');
});

socket.on('disconnect', () => {
  console.log('Disconnected from orchestration layer');
});
```

#### `action:executing`

Real-time notification when action starts execution.

**Event Data**:
```typescript
{
  actionId: string;
  type: string;
  platform: string;
  priority: string;
  workerId: string;
  startTime: string;
  queueTime: number;
}
```

**Example**:
```typescript
socket.on('action:executing', (data) => {
  console.log(`▶️ Action ${data.actionId} executing on ${data.platform}`);
  
  // Update UI
  updateActionStatus(data.actionId, 'executing');
});
```

#### `action:completed`

Real-time notification when action completes successfully.

**Event Data**:
```typescript
{
  actionId: string;
  type: string;
  platform: string;
  result: any;
  executionTime: number;
  queueTime: number;
  retries: number;
  timestamp: string;
}
```

**Example**:
```typescript
socket.on('action:completed', (data) => {
  console.log(`✅ Action ${data.actionId} completed in ${data.executionTime}ms`);
  
  // Update UI with success
  updateActionStatus(data.actionId, 'success', data.result);
  
  // Show notification
  showNotification('success', `${data.type} on ${data.platform} completed`);
});
```

#### `action:failed`

Real-time notification when action fails.

**Event Data**:
```typescript
{
  actionId: string;
  type: string;
  platform: string;
  error: string;
  errorCode: string;
  retriable: boolean;
  retries: number;
  timestamp: string;
}
```

**Example**:
```typescript
socket.on('action:failed', (data) => {
  console.error(`❌ Action ${data.actionId} failed: ${data.error}`);
  
  // Update UI with error
  updateActionStatus(data.actionId, 'failed', data.error);
  
  // Show error notification
  showNotification('error', `${data.type} failed: ${data.error}`);
});
```

#### `queue:updated`

Real-time notification when queue depth changes.

**Event Data**:
```typescript
{
  totalQueued: number;
  byPriority: {
    critical: number;
    high: number;
    normal: number;
    low: number;
  };
  avgWaitTime: number;
  workerUtilization: number;
}
```

**Example**:
```typescript
socket.on('queue:updated', (data) => {
  console.log(`Queue depth: ${data.totalQueued}`);
  
  // Update queue visualization
  updateQueueChart(data.byPriority);
  
  // Alert if queue is growing
  if (data.totalQueued > 100) {
    showNotification('warning', 'Queue depth exceeds 100 actions');
  }
});
```

#### `health:changed`

Real-time notification when executor health changes.

**Event Data**:
```typescript
{
  platform: string;
  previousStatus: 'healthy' | 'degraded' | 'down';
  currentStatus: 'healthy' | 'degraded' | 'down';
  circuitBreaker: {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failureCount: number;
  };
  timestamp: string;
}
```

**Example**:
```typescript
socket.on('health:changed', (data) => {
  console.log(`${data.platform} status: ${data.previousStatus} → ${data.currentStatus}`);
  
  // Update health indicators
  updateHealthIndicator(data.platform, data.currentStatus);
  
  // Alert on degradation
  if (data.currentStatus === 'down') {
    showNotification('error', `${data.platform} executor is down!`);
  } else if (data.currentStatus === 'healthy' && data.previousStatus !== 'healthy') {
    showNotification('success', `${data.platform} executor recovered`);
  }
});
```

#### `approval:pending`

Real-time notification when approval is needed.

**Event Data**:
```typescript
{
  approvalId: string;
  actionId: string;
  action: Action;
  reason: string;
  expiresAt: string;
  slackMessageTs: string;
}
```

**Example**:
```typescript
socket.on('approval:pending', (data) => {
  console.log(`🔔 Approval needed: ${data.reason}`);
  
  // Show approval modal
  showApprovalModal({
    id: data.approvalId,
    action: data.action,
    reason: data.reason,
    expiresAt: data.expiresAt
  });
});
```

#### `metrics:updated`

Real-time metrics update (emitted every 10 seconds).

**Event Data**:
```typescript
{
  actionsPerMinute: number;
  successRate: number;
  avgExecutionTime: number;
  queueDepth: number;
  timestamp: string;
}
```

**Example**:
```typescript
socket.on('metrics:updated', (data) => {
  // Update real-time metrics chart
  updateMetricsChart({
    timestamp: data.timestamp,
    throughput: data.actionsPerMinute,
    successRate: data.successRate,
    latency: data.avgExecutionTime
  });
});
```

### Data Models

Complete TypeScript interfaces for dashboard data models.

```typescript
// Action result
interface ActionResult {
  id: string;
  type: string;
  platform: string;
  priority: string;
  status: 'pending' | 'executing' | 'success' | 'failed';
  result?: any;
  error?: string;
  executionTime?: number;
  queueTime?: number;
  retries: number;
  timestamp: string;
  metadata?: any;
}

// Queue status
interface QueueStatus {
  queues: {
    critical: QueuedAction[];
    high: QueuedAction[];
    normal: QueuedAction[];
    low: QueuedAction[];
  };
  stats: {
    totalQueued: number;
    avgWaitTime: number;
    workerUtilization: number;
  };
}

interface QueuedAction {
  actionId: string;
  type: string;
  platform: string;
  queuedAt: string;
  estimatedWait: number;
}

// Health status
interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'critical';
  executors: Record<string, ExecutorHealth>;
  queue: QueueHealth;
}

interface ExecutorHealth {
  status: 'healthy' | 'degraded' | 'down';
  circuitBreaker: {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failureCount: number;
    lastFailure?: string;
  };
  rateLimit: {
    current: number;
    limit: number;
    resetAt: string;
  };
  lastSuccess?: string;
  avgResponseTime: number;
}

interface QueueHealth {
  depth: number;
  oldestAction?: string;
  workerUtilization: number;
}

// Metrics
interface Metrics {
  timeWindow: string;
  metrics: {
    totalActions: number;
    successRate: number;
    avgExecutionTime: number;
    avgQueueTime: number;
    retryRate: number;
    fallbackRate: number;
  };
  byPlatform: Record<string, PlatformMetrics>;
  timeline: TimelinePoint[];
}

interface PlatformMetrics {
  total: number;
  successRate: number;
  avgExecutionTime: number;
}

interface TimelinePoint {
  timestamp: string;
  actionsPerMinute: number;
  successRate: number;
}
```

---

## For Member 1 (Context Aggregator)

Member 1 aggregates context from various sources. It can query action history to understand patterns.

### REST Endpoints

#### GET `/api/context/actions`

Get action history for context aggregation.

**Query Parameters**:
```typescript
{
  limit?: number;
  startDate?: string;
  endDate?: string;
  userId?: string;       // Filter by user
  source?: string;       // Filter by source (email, slack, etc.)
  tags?: string;         // Comma-separated tags
}
```

**Response**:
```typescript
{
  actions: Array<{
    id: string;
    type: string;
    platform: string;
    status: string;
    timestamp: string;
    userId?: string;
    source?: string;
    tags?: string[];
    metadata?: any;
  }>;
  patterns: {
    mostFrequentType: string;
    mostFrequentPlatform: string;
    peakHours: number[];
    avgActionsPerDay: number;
  };
}
```

**Example**:
```typescript
const response = await fetch('/api/context/actions?userId=user-123&limit=100');
const data = await response.json();

console.log(`User's most frequent action: ${data.patterns.mostFrequentType}`);
console.log(`Peak hours: ${data.patterns.peakHours.join(', ')}`);
```

---

## Error Codes

Standardized error codes for action failures.

| Code | Description | Retriable | Common Causes |
|------|-------------|-----------|---------------|
| `AUTH_ERROR` | Authentication failed | ❌ No | Invalid API key, expired token |
| `RATE_LIMITED` | Rate limit exceeded | ✅ Yes | Too many requests |
| `NOT_FOUND` | Resource not found | ❌ No | Invalid ID, deleted resource |
| `VALIDATION_ERROR` | Invalid data | ❌ No | Missing fields, wrong format |
| `NETWORK_ERROR` | Network issue | ✅ Yes | Timeout, connection reset |
| `SERVICE_DOWN` | Service unavailable | ✅ Yes | API down, maintenance |
| `QUOTA_EXCEEDED` | Storage/API quota exceeded | ❌ No | Storage full, quota limit |
| `PERMISSION_DENIED` | Insufficient permissions | ❌ No | Missing scope, wrong workspace |
| `DUPLICATE_ERROR` | Duplicate resource | ❌ No | Idempotency conflict |
| `TIMEOUT_ERROR` | Operation timeout | ✅ Yes | Slow API, large file |
| `UNKNOWN_ERROR` | Unexpected error | ✅ Yes | Uncaught exception |

**Error Response Format**:
```typescript
{
  error: {
    code: string;        // Error code from table above
    message: string;     // Human-readable message
    retriable: boolean;  // Whether retry is possible
    platform: string;    // Platform that errored
    details?: any;       // Additional error details
  }
}
```

---

## Rate Limits

API rate limits for REST endpoints.

| Endpoint | Rate Limit | Window |
|----------|------------|--------|
| `/api/actions/*` | 100 requests | 1 minute |
| `/api/approvals/*` | 50 requests | 1 minute |
| `/api/context/*` | 200 requests | 1 minute |

**Rate Limit Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1697529600
```

**Rate Limit Exceeded Response**:
```typescript
{
  error: {
    code: 'RATE_LIMITED',
    message: 'API rate limit exceeded',
    retryAfter: 15  // seconds
  }
}
```

---

## Usage Examples

### Complete Member 2 Integration

```typescript
import { eventBus } from './orchestration/event-bus';
import { Action, provideFeedback } from './orchestration';

class ReasoningEngine {
  async initialize() {
    // Listen to all action events
    this.setupEventListeners();
  }
  
  private setupEventListeners() {
    // Action completed successfully
    eventBus.on('action:completed', async (event) => {
      await this.handleSuccess(event);
    });
    
    // Action failed
    eventBus.on('action:failed', async (event) => {
      await this.handleFailure(event);
    });
    
    // Approval resolved
    eventBus.on('approval:resolved', async (event) => {
      await this.handleApprovalResolution(event);
    });
  }
  
  async executeAction(reasoning: any) {
    // Determine if approval needed
    const requiresApproval = this.shouldRequireApproval(reasoning);
    
    // Create action
    const action: Action = {
      id: this.generateActionId(),
      type: reasoning.actionType,
      platform: reasoning.targetPlatform,
      priority: this.determinePriority(reasoning),
      data: reasoning.actionData,
      requiresApproval,
      correlationId: reasoning.contextId
    };
    
    // Emit appropriate event
    if (requiresApproval) {
      eventBus.emit('action:requires_approval', {
        action,
        reason: reasoning.approvalReason,
        context: reasoning.context
      });
    } else {
      eventBus.emit('action:ready', {
        action,
        context: reasoning.context
      });
    }
    
    return action.id;
  }
  
  private async handleSuccess(event: any) {
    console.log(`Action ${event.actionId} succeeded`);
    
    // Learn from success
    await this.recordSuccess(event);
    
    // Provide feedback if user reviewed
    if (event.metadata?.userReviewed) {
      await provideFeedback(event.actionId, {
        outcome: 'success',
        executionQuality: 5,
        notes: 'User confirmed success'
      });
    }
  }
  
  private async handleFailure(event: any) {
    console.error(`Action ${event.actionId} failed: ${event.error}`);
    
    // Try alternative approach
    if (event.retriable) {
      await this.retryWithModification(event);
    } else {
      await this.recordFailure(event);
    }
  }
}
```

### Complete Member 4 Integration

```typescript
import io from 'socket.io-client';

class DashboardClient {
  private socket: any;
  
  async initialize() {
    // Connect WebSocket
    this.socket = io('http://localhost:3000');
    
    // Setup event listeners
    this.setupWebSocket();
    
    // Load initial data
    await this.loadInitialData();
    
    // Start polling metrics
    this.startMetricsPolling();
  }
  
  private setupWebSocket() {
    this.socket.on('action:executing', (data: any) => {
      this.updateActionStatus(data.actionId, 'executing');
    });
    
    this.socket.on('action:completed', (data: any) => {
      this.updateActionStatus(data.actionId, 'success');
      this.showNotification('success', `${data.type} completed`);
    });
    
    this.socket.on('action:failed', (data: any) => {
      this.updateActionStatus(data.actionId, 'failed');
      this.showNotification('error', `${data.type} failed: ${data.error}`);
    });
    
    this.socket.on('queue:updated', (data: any) => {
      this.updateQueueChart(data);
    });
    
    this.socket.on('health:changed', (data: any) => {
      this.updateHealthIndicator(data.platform, data.currentStatus);
    });
    
    this.socket.on('metrics:updated', (data: any) => {
      this.updateMetricsChart(data);
    });
  }
  
  private async loadInitialData() {
    // Load recent actions
    const actions = await this.fetchRecentActions();
    this.displayActions(actions);
    
    // Load queue status
    const queue = await this.fetchQueueStatus();
    this.displayQueue(queue);
    
    // Load health status
    const health = await this.fetchHealthStatus();
    this.displayHealth(health);
  }
  
  private async fetchRecentActions() {
    const response = await fetch('/api/actions/recent?limit=50');
    return response.json();
  }
  
  private async fetchQueueStatus() {
    const response = await fetch('/api/actions/queue');
    return response.json();
  }
  
  private async fetchHealthStatus() {
    const response = await fetch('/api/actions/health');
    return response.json();
  }
  
  private startMetricsPolling() {
    // Poll metrics every 30 seconds
    setInterval(async () => {
      const metrics = await this.fetchMetrics();
      this.displayMetrics(metrics);
    }, 30000);
  }
  
  private async fetchMetrics() {
    const response = await fetch('/api/actions/metrics?timeWindow=1h');
    return response.json();
  }
  
  async approveAction(approvalId: string, userId: string, reason?: string) {
    const response = await fetch(`/api/approvals/${approvalId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, reason })
    });
    
    return response.json();
  }
  
  async rejectAction(approvalId: string, userId: string, reason: string) {
    const response = await fetch(`/api/approvals/${approvalId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, reason })
    });
    
    return response.json();
  }
}
```

---

## Security

### Authentication

**API Key Authentication** (REST):
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/actions/recent"
```

**WebSocket Authentication**:
```typescript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'YOUR_API_KEY'
  }
});
```

### CORS Configuration

```typescript
// Allowed origins
const allowedOrigins = [
  'http://localhost:3000',
  'https://dashboard.company.com'
];
```

### Rate Limiting

- **Per IP**: 1000 requests / hour
- **Per API Key**: 10,000 requests / hour

### Sensitive Data

Sensitive fields are redacted in logs:
- API keys
- Tokens
- Email addresses
- File contents

---

## Summary

The Orchestration Layer API provides:

✅ **Event-driven interface** for Member 2 (Reasoning Engine)  
✅ **REST API** for Member 4 (Dashboard) queries  
✅ **WebSocket** for real-time updates  
✅ **Complete schemas** for all data types  
✅ **Error handling** with standardized codes  
✅ **Rate limiting** and security  

**Next Steps**:
1. Review event schemas
2. Implement event listeners (Member 2)
3. Build dashboard UI (Member 4)
4. Test API endpoints
5. Monitor real-time events

---

**Documentation Version**: 1.0  
**Last Updated**: October 17, 2025  
**Status**: ✅ Complete & Production Ready
