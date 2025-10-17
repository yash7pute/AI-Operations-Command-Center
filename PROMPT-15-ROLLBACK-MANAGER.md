# Rollback Manager - Complete Documentation

**Module**: `src/workflows/rollback-manager.ts`  
**Lines**: 1,200+  
**Purpose**: Intelligent rollback system for failed multi-step workflows  
**Status**: ✅ Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Quick Start](#quick-start)
4. [API Reference](#api-reference)
5. [Rollback Strategies](#rollback-strategies)
6. [Action Reversibility](#action-reversibility)
7. [Usage Examples](#usage-examples)
8. [Manual Intervention](#manual-intervention)
9. [History & Debugging](#history--debugging)
10. [Best Practices](#best-practices)
11. [Integration Guide](#integration-guide)

---

## Overview

The Rollback Manager provides intelligent, automatic rollback capabilities for failed multi-step workflows. It tracks all executed actions and can reverse them in the opposite order to maintain system consistency.

### Key Features

✅ **Automatic Rollback** - Reverse actions in proper order  
✅ **Action Tracking** - Complete audit trail of all operations  
✅ **Partial Rollback** - Undo only last N steps  
✅ **Smart Reversibility** - Classify actions as reversible/non-reversible  
✅ **Manual Intervention** - Clear guidance for non-reversible actions  
✅ **History Tracking** - Complete rollback history for debugging  
✅ **Timeout Support** - Prevent hanging rollback operations  
✅ **Confirmation Flow** - Require approval for destructive operations  

### What Problems Does It Solve?

**Problem**: Multi-step workflow fails halfway through, leaving system in inconsistent state  
**Solution**: Automatic rollback of all completed steps

**Problem**: Some actions (like sending notifications) can't be automatically reversed  
**Solution**: Clear manual intervention steps with specific guidance

**Problem**: Need to undo just the last few steps without full rollback  
**Solution**: Partial rollback functionality

**Problem**: Difficult to debug failed rollbacks  
**Solution**: Complete history with detailed logging

---

## Core Concepts

### 1. Workflow Tracking

Every workflow is tracked from start to finish:

```typescript
// Start tracking
const workflow = startWorkflow('wf-001', 'Invoice Processing');

// Record each action
recordAction('wf-001', {
  actionId: 'action-001',
  actionType: 'create_task',
  target: 'trello',
  originalParams: { name: 'Review Invoice' },
  result: { id: 'card-123', url: 'https://...' }
});

// Complete or rollback
await rollback('wf-001');
```

### 2. Action Reversibility

Actions are automatically classified:

| Classification | Description | Examples |
|----------------|-------------|----------|
| **REVERSIBLE** | Can be automatically undone | create_task, upload_file, create_folder |
| **PARTIALLY_REVERSIBLE** | Can be partially undone | update_task, append_data |
| **NON_REVERSIBLE** | Cannot be undone | send_notification, send_email |
| **CONFIRMATION_REQUIRED** | Needs user approval | delete_file (destructive) |

### 3. Undo Operations

Each action has a corresponding undo:

```typescript
// Original action
createTask → Result: { id: 'card-123' }

// Undo operation
deleteTask(cardId: 'card-123')

// Original action
uploadFile → Result: { fileId: 'file-456' }

// Undo operation
deleteFile(fileId: 'file-456')
```

### 4. Reverse-Order Execution

Rollback executes in reverse order:

```
Executed:    Step 1 → Step 2 → Step 3 → Step 4 (FAILED)
Rollback:    Step 3 ← Step 2 ← Step 1
```

This ensures dependencies are respected during rollback.

---

## Quick Start

### Basic Usage

```typescript
import {
  startWorkflow,
  recordAction,
  rollback,
  completeWorkflow
} from './rollback-manager';

// 1. Start tracking workflow
const workflow = startWorkflow('wf-invoice-001', 'Process Invoice');

try {
  // 2. Execute action and record it
  const cardResult = await createTrelloCard({ name: 'Review Invoice' });
  
  recordAction('wf-invoice-001', {
    actionId: 'create-card',
    actionType: 'create_task',
    target: 'trello',
    originalParams: { name: 'Review Invoice' },
    result: cardResult
  });
  
  // 3. More actions...
  const fileResult = await uploadToDrive({ name: 'invoice.pdf' });
  
  recordAction('wf-invoice-001', {
    actionId: 'upload-file',
    actionType: 'upload_file',
    target: 'drive',
    originalParams: { name: 'invoice.pdf' },
    result: fileResult
  });
  
  // 4. Workflow completed successfully
  completeWorkflow('wf-invoice-001');
  
} catch (error) {
  // 5. Rollback on failure
  console.log('Workflow failed, rolling back...');
  
  const rollbackResult = await rollback('wf-invoice-001');
  
  if (rollbackResult.success) {
    console.log('✅ Successfully rolled back');
  } else {
    console.log('⚠️ Manual intervention required:');
    console.log(rollbackResult.manualSteps);
  }
}
```

### Partial Rollback

```typescript
import { partialRollback } from './rollback-manager';

// Undo only last 2 steps
const result = await partialRollback('wf-001', 2);

console.log(`Rolled back ${result.rolledBackActions.length} actions`);
```

### Configuration Options

```typescript
const result = await rollback('wf-001', {
  maxActions: 5,                  // Roll back max 5 actions
  requireConfirmation: true,      // Require approval for destructive ops
  stopOnFailure: false,           // Continue even if one rollback fails
  timeoutPerAction: 30000,        // 30 second timeout per action
  skipNonReversible: true         // Skip non-reversible actions
});
```

---

## API Reference

### Workflow Management

#### `startWorkflow(workflowId, workflowName)`

Start tracking a new workflow for potential rollback.

**Parameters:**
- `workflowId` (string) - Unique workflow identifier
- `workflowName` (string) - Human-readable workflow name

**Returns:** `WorkflowRollback` - Workflow record

**Example:**
```typescript
const workflow = startWorkflow('wf-bug-report-001', 'Handle Bug Report');
```

---

#### `recordAction(workflowId, action)`

Record an executed action for potential rollback.

**Parameters:**
- `workflowId` (string) - Workflow ID
- `action` (object) - Action details:
  - `actionId` (string) - Unique action identifier
  - `actionType` (string) - Action type (create_task, upload_file, etc.)
  - `target` (string) - Target platform (trello, drive, etc.)
  - `originalParams` (object) - Original parameters used
  - `result` (object) - Result returned from execution

**Returns:** `WorkflowRollback | null` - Updated workflow record

**Example:**
```typescript
recordAction('wf-001', {
  actionId: 'action-create-card',
  actionType: 'create_task',
  target: 'trello',
  originalParams: { 
    name: 'Review Bug Report',
    description: 'Check severity and assign'
  },
  result: { 
    id: 'card-123',
    url: 'https://trello.com/c/card-123'
  }
});
```

---

#### `completeWorkflow(workflowId)`

Mark workflow as successfully completed.

**Parameters:**
- `workflowId` (string) - Workflow ID

**Returns:** `boolean` - Success status

**Example:**
```typescript
completeWorkflow('wf-001');
```

---

#### `getWorkflow(workflowId)`

Get workflow record.

**Parameters:**
- `workflowId` (string) - Workflow ID

**Returns:** `WorkflowRollback | null` - Workflow record or null

**Example:**
```typescript
const workflow = getWorkflow('wf-001');
console.log(`Workflow has ${workflow.executedActions.length} actions`);
```

---

#### `getActiveWorkflows()`

Get all active (non-completed) workflows.

**Returns:** `WorkflowRollback[]` - Array of workflow records

**Example:**
```typescript
const active = getActiveWorkflows();
console.log(`${active.length} workflows currently active`);
```

---

### Rollback Operations

#### `rollback(workflowId, config?)`

Roll back an entire workflow (all executed actions).

**Parameters:**
- `workflowId` (string) - Workflow ID to roll back
- `config` (object, optional) - Rollback configuration:
  - `maxActions` (number) - Maximum actions to roll back
  - `requireConfirmation` (boolean) - Require approval for destructive ops
  - `stopOnFailure` (boolean) - Stop on first rollback failure
  - `timeoutPerAction` (number) - Timeout per action (ms)
  - `skipNonReversible` (boolean) - Skip non-reversible actions

**Returns:** `Promise<RollbackResult>` - Rollback result:
  - `success` (boolean) - Overall success
  - `workflowId` (string) - Workflow ID
  - `rolledBackActions` (string[]) - Successfully rolled back action IDs
  - `failedActions` (string[]) - Failed rollback action IDs
  - `manualInterventionActions` (string[]) - Actions requiring manual steps
  - `duration` (number) - Total time taken (ms)
  - `error` (string, optional) - Error message if failed
  - `manualSteps` (string[], optional) - Manual steps to complete rollback

**Example:**
```typescript
const result = await rollback('wf-001', {
  stopOnFailure: false,
  timeoutPerAction: 30000
});

if (result.success) {
  console.log('✅ Complete rollback successful');
  console.log(`Rolled back ${result.rolledBackActions.length} actions`);
} else {
  console.log('⚠️ Rollback incomplete');
  console.log(`Failed: ${result.failedActions.length}`);
  console.log(`Manual required: ${result.manualInterventionActions.length}`);
  
  if (result.manualSteps) {
    console.log('\nManual steps:');
    result.manualSteps.forEach(step => console.log(`  - ${step}`));
  }
}
```

---

#### `partialRollback(workflowId, numberOfSteps, config?)`

Roll back only the last N steps of a workflow.

**Parameters:**
- `workflowId` (string) - Workflow ID
- `numberOfSteps` (number) - Number of steps to roll back (from end)
- `config` (object, optional) - Same as `rollback()`

**Returns:** `Promise<RollbackResult>` - Rollback result

**Example:**
```typescript
// Undo only last 3 steps
const result = await partialRollback('wf-001', 3);

console.log(`Rolled back ${result.rolledBackActions.length}/3 steps`);
```

---

### History & Debugging

#### `getRollbackHistory(limit?)`

Get rollback history.

**Parameters:**
- `limit` (number, optional) - Maximum entries to return (default: 50)

**Returns:** `WorkflowRollback[]` - Array of historical workflow records

**Example:**
```typescript
const history = getRollbackHistory(20);

history.forEach(workflow => {
  console.log(`${workflow.workflowId}: ${workflow.status}`);
  console.log(`  Started: ${workflow.startedAt}`);
  console.log(`  Actions: ${workflow.executedActions.length}`);
  
  if (workflow.rollbackStats) {
    console.log(`  Rolled back: ${workflow.rollbackStats.rolledBack}`);
    console.log(`  Failed: ${workflow.rollbackStats.failed}`);
  }
});
```

---

#### `getWorkflowHistory(workflowId)`

Get history for a specific workflow.

**Parameters:**
- `workflowId` (string) - Workflow ID

**Returns:** `WorkflowRollback | null` - Workflow record or null

**Example:**
```typescript
const workflow = getWorkflowHistory('wf-001');

if (workflow) {
  console.log('Rollback history:');
  workflow.executedActions.forEach(action => {
    console.log(`  ${action.actionId}: ${action.rollbackStatus}`);
  });
}
```

---

#### `exportWorkflowForDebugging(workflowId)`

Export complete workflow record as JSON for debugging.

**Parameters:**
- `workflowId` (string) - Workflow ID

**Returns:** `string | null` - JSON string or null if not found

**Example:**
```typescript
const json = exportWorkflowForDebugging('wf-001');

if (json) {
  fs.writeFileSync('workflow-debug.json', json);
  console.log('Workflow exported for debugging');
}
```

---

#### `getRollbackStatistics()`

Get overall rollback statistics.

**Returns:** Object with statistics:
  - `activeWorkflows` (number) - Currently active workflows
  - `historyEntries` (number) - Total history entries
  - `totalRollbacks` (number) - Total rollbacks performed
  - `successfulRollbacks` (number) - Successful rollbacks
  - `failedRollbacks` (number) - Failed rollbacks
  - `partialRollbacks` (number) - Partial rollbacks

**Example:**
```typescript
const stats = getRollbackStatistics();

console.log('Rollback Statistics:');
console.log(`  Active workflows: ${stats.activeWorkflows}`);
console.log(`  Total rollbacks: ${stats.totalRollbacks}`);
console.log(`  Success rate: ${(stats.successfulRollbacks / stats.totalRollbacks * 100).toFixed(1)}%`);
```

---

#### `clearRollbackHistory(olderThanDays?)`

Clear rollback history (use with caution).

**Parameters:**
- `olderThanDays` (number, optional) - Only clear history older than N days

**Returns:** `number` - Number of entries removed

**Example:**
```typescript
// Clear history older than 30 days
const removed = clearRollbackHistory(30);
console.log(`Removed ${removed} old history entries`);

// Clear ALL history (dangerous!)
const totalRemoved = clearRollbackHistory();
console.log(`Removed ALL ${totalRemoved} history entries`);
```

---

### Utility Functions

#### `getActionReversibility(actionType)`

Check if an action type is reversible.

**Parameters:**
- `actionType` (string) - Action type to check

**Returns:** `ActionReversibility` - Classification enum

**Example:**
```typescript
import { getActionReversibility, ActionReversibility } from './rollback-manager';

const reversibility = getActionReversibility('create_task');

if (reversibility === ActionReversibility.REVERSIBLE) {
  console.log('✅ This action can be automatically reversed');
}
```

---

#### `estimateRollbackDuration(workflowId)`

Estimate how long rollback will take.

**Parameters:**
- `workflowId` (string) - Workflow ID

**Returns:** `number | null` - Estimated duration in milliseconds

**Example:**
```typescript
const estimate = estimateRollbackDuration('wf-001');

if (estimate) {
  console.log(`Estimated rollback time: ${(estimate / 1000).toFixed(1)}s`);
}
```

---

#### `validateWorkflowRollback(workflowId)`

Validate if workflow can be rolled back and get warnings.

**Parameters:**
- `workflowId` (string) - Workflow ID

**Returns:** Object with validation details:
  - `canRollback` (boolean) - Whether rollback is possible
  - `reversibleActions` (number) - Count of reversible actions
  - `nonReversibleActions` (number) - Count of non-reversible actions
  - `requiresConfirmation` (number) - Count requiring confirmation
  - `warnings` (string[]) - Warning messages

**Example:**
```typescript
const validation = validateWorkflowRollback('wf-001');

if (validation.canRollback) {
  console.log('✅ Workflow can be rolled back');
  console.log(`  Reversible: ${validation.reversibleActions}`);
  console.log(`  Non-reversible: ${validation.nonReversibleActions}`);
  
  if (validation.warnings.length > 0) {
    console.log('\n⚠️ Warnings:');
    validation.warnings.forEach(w => console.log(`  - ${w}`));
  }
} else {
  console.log('❌ Workflow cannot be rolled back');
}
```

---

#### `getWorkflowsRequiringManualIntervention()`

Find workflows that need manual steps.

**Returns:** `WorkflowRollback[]` - Workflows with manual steps

**Example:**
```typescript
const needsManual = getWorkflowsRequiringManualIntervention();

console.log(`${needsManual.length} workflows need manual intervention`);

needsManual.forEach(workflow => {
  console.log(`\n${workflow.workflowId}:`);
  workflow.manualInterventionSteps?.forEach(step => {
    console.log(`  ${step}`);
  });
});
```

---

## Rollback Strategies

### Strategy 1: Full Automatic Rollback

Best for workflows with only reversible actions.

```typescript
const result = await rollback('wf-001', {
  stopOnFailure: true,
  requireConfirmation: false
});

if (result.success) {
  console.log('✅ Complete automatic rollback');
}
```

### Strategy 2: Partial Rollback

Undo only recent steps, keep earlier work.

```typescript
// Workflow had 10 steps, only undo last 3
const result = await partialRollback('wf-001', 3);

console.log('Kept first 7 steps, rolled back last 3');
```

### Strategy 3: Skip Non-Reversible

Roll back what you can, skip the rest.

```typescript
const result = await rollback('wf-001', {
  skipNonReversible: true,
  stopOnFailure: false
});

console.log(`Rolled back ${result.rolledBackActions.length} actions`);
console.log(`Skipped ${result.manualInterventionActions.length} non-reversible`);
```

### Strategy 4: Require Confirmation

Pause for approval on destructive operations.

```typescript
const result = await rollback('wf-001', {
  requireConfirmation: true
});

// Actions marked CONFIRMATION_REQUIRED will need manual approval
if (result.manualInterventionActions.length > 0) {
  console.log('⚠️ Some actions require manual confirmation');
}
```

---

## Action Reversibility

### Reversible Actions

These can be automatically reversed:

| Action | Undo Operation | Notes |
|--------|----------------|-------|
| `create_task` | `delete_task` | Delete Trello/task card |
| `create_card` | `delete_card` | Delete card by ID |
| `create_page` | `delete_page` | Delete Notion page |
| `create_folder` | `delete_folder` | Delete empty folder |

**Example:**
```typescript
// Action executed
const result = await createTrelloCard({ name: 'Task' });
// result = { id: 'card-123', url: '...' }

// Automatic rollback
await deleteTrelloCard({ cardId: 'card-123' });
```

### Partially Reversible Actions

Can be undone but may not restore exact state:

| Action | Undo Operation | Limitation |
|--------|----------------|------------|
| `append_data` | `delete_rows` | Can delete rows but loses formatting |
| `update_cell` | `restore_value` | Only if previous value was stored |
| `update_task` | `restore_task` | Only if previous state was captured |
| `move_file` | `move_back` | Only if original location was recorded |

**Example:**
```typescript
// Store previous value for rollback
recordAction('wf-001', {
  actionId: 'update-cell',
  actionType: 'update_cell',
  target: 'sheets',
  originalParams: {
    range: 'A1',
    value: 'New Value',
    previousValue: 'Old Value'  // ← Store for rollback
  },
  result: { updated: true }
});

// Rollback restores previous value
// Cell A1 will be set back to 'Old Value'
```

### Non-Reversible Actions

Cannot be automatically undone:

| Action | Why Non-Reversible | Manual Steps Required |
|--------|-------------------|----------------------|
| `send_notification` | Can't unsend messages | Inform recipients of rollback |
| `send_message` | Message already delivered | Send follow-up message |
| `send_email` | Email can't be recalled | Send correction email |
| `trigger_webhook` | External system triggered | Contact webhook recipient |
| `log_action` | Intentional audit trail | Add rollback note to logs |

**Example:**
```typescript
// This action is non-reversible
recordAction('wf-001', {
  actionId: 'notify-team',
  actionType: 'send_notification',
  target: 'slack',
  originalParams: {
    channel: 'engineering',
    message: 'Bug fixed in production'
  },
  result: { ts: '1234567890.123', channel: 'engineering' }
});

// When rolled back, manual steps provided:
const result = await rollback('wf-001');

console.log(result.manualSteps);
// Output:
// [
//   'Action: send_notification (notify-team)',
//   'Target: slack',
//   '⚠️ This notification cannot be automatically deleted',
//   'Manual action: Inform recipients that the action was rolled back',
//   '   Channel: engineering',
//   '   Original message: "Bug fixed in production"',
//   ''
// ]
```

### Confirmation Required Actions

Reversible but destructive (need approval):

| Action | Risk | Why Confirmation Needed |
|--------|------|------------------------|
| `upload_file` → `delete_file` | Data loss | File permanently deleted |
| `file_document` → `delete_file` | Data loss | Document permanently removed |

**Example:**
```typescript
const result = await rollback('wf-001', {
  requireConfirmation: true
});

// File deletion marked for manual confirmation
if (result.manualInterventionActions.includes('upload-file')) {
  console.log('⚠️ Manual confirmation required to delete file');
  
  // User must manually confirm and execute:
  // await deleteFile({ fileId: 'file-123' });
}
```

---

## Usage Examples

### Example 1: Invoice Processing Workflow

Complete workflow with rollback on failure.

```typescript
import {
  startWorkflow,
  recordAction,
  rollback,
  completeWorkflow
} from './rollback-manager';

async function processInvoice(invoice: Invoice) {
  const workflowId = `wf-invoice-${invoice.id}`;
  
  // Start tracking
  startWorkflow(workflowId, 'Process Invoice');
  
  try {
    // Step 1: Upload invoice to Drive
    const fileResult = await uploadToDrive({
      name: `Invoice-${invoice.id}.pdf`,
      content: invoice.pdf
    });
    
    recordAction(workflowId, {
      actionId: 'upload-invoice',
      actionType: 'file_document',
      target: 'drive',
      originalParams: { name: `Invoice-${invoice.id}.pdf` },
      result: fileResult
    });
    
    // Step 2: Create Trello card for review
    const cardResult = await createTrelloCard({
      name: `Review Invoice ${invoice.id}`,
      description: `Vendor: ${invoice.vendor}\nAmount: $${invoice.amount}\nFile: ${fileResult.webViewLink}`
    });
    
    recordAction(workflowId, {
      actionId: 'create-review-card',
      actionType: 'create_task',
      target: 'trello',
      originalParams: { name: `Review Invoice ${invoice.id}` },
      result: cardResult
    });
    
    // Step 3: Add to tracking spreadsheet
    const sheetResult = await appendToSheet({
      spreadsheetId: INVOICE_SHEET_ID,
      range: 'Sheet1!A:E',
      values: [[
        invoice.id,
        invoice.vendor,
        invoice.amount,
        fileResult.webViewLink,
        cardResult.url
      ]]
    });
    
    recordAction(workflowId, {
      actionId: 'track-invoice',
      actionType: 'append_data',
      target: 'sheets',
      originalParams: {
        spreadsheetId: INVOICE_SHEET_ID,
        sheetName: 'Sheet1'
      },
      result: sheetResult
    });
    
    // Step 4: Notify accounting team
    const slackResult = await sendSlackMessage({
      channel: 'accounting',
      message: `New invoice ready for review: ${cardResult.url}`
    });
    
    recordAction(workflowId, {
      actionId: 'notify-accounting',
      actionType: 'send_notification',
      target: 'slack',
      originalParams: { channel: 'accounting' },
      result: slackResult
    });
    
    // Workflow completed successfully
    completeWorkflow(workflowId);
    
    return {
      success: true,
      fileUrl: fileResult.webViewLink,
      cardUrl: cardResult.url
    };
    
  } catch (error) {
    console.error('Invoice processing failed:', error);
    
    // Roll back all completed steps
    const rollbackResult = await rollback(workflowId, {
      stopOnFailure: false,
      requireConfirmation: false
    });
    
    if (rollbackResult.success) {
      console.log('✅ Successfully rolled back all changes');
    } else {
      console.log('⚠️ Rollback completed with warnings:');
      console.log(`  Rolled back: ${rollbackResult.rolledBackActions.length}`);
      console.log(`  Failed: ${rollbackResult.failedActions.length}`);
      console.log(`  Manual required: ${rollbackResult.manualInterventionActions.length}`);
      
      if (rollbackResult.manualSteps) {
        console.log('\nManual steps required:');
        rollbackResult.manualSteps.forEach(step => console.log(`  ${step}`));
      }
    }
    
    return {
      success: false,
      error: error.message,
      rollbackResult
    };
  }
}
```

### Example 2: Bug Report Workflow with Partial Rollback

Sometimes you want to undo just the last step.

```typescript
async function handleBugReport(bug: BugReport) {
  const workflowId = `wf-bug-${bug.id}`;
  
  startWorkflow(workflowId, 'Handle Bug Report');
  
  try {
    // Step 1: Create Trello card
    const card = await createTrelloCard({
      name: `[BUG] ${bug.title}`,
      description: bug.description
    });
    
    recordAction(workflowId, {
      actionId: 'create-card',
      actionType: 'create_card',
      target: 'trello',
      originalParams: { name: `[BUG] ${bug.title}` },
      result: card
    });
    
    // Step 2: Notify engineering
    const notification = await sendSlackMessage({
      channel: 'engineering',
      message: `New bug: ${card.url}`
    });
    
    recordAction(workflowId, {
      actionId: 'notify-team',
      actionType: 'send_notification',
      target: 'slack',
      originalParams: { channel: 'engineering' },
      result: notification
    });
    
    // Step 3: Add to bug tracking sheet
    const sheet = await appendToSheet({
      spreadsheetId: BUG_SHEET_ID,
      values: [[bug.id, bug.title, bug.severity, card.url]]
    });
    
    recordAction(workflowId, {
      actionId: 'track-bug',
      actionType: 'append_data',
      target: 'sheets',
      originalParams: { spreadsheetId: BUG_SHEET_ID },
      result: sheet
    });
    
    completeWorkflow(workflowId);
    
  } catch (error) {
    // Only undo last step (spreadsheet append)
    // Keep the Trello card and notification
    const result = await partialRollback(workflowId, 1);
    
    console.log('Kept Trello card, rolled back spreadsheet entry');
  }
}
```

### Example 3: Validation Before Rollback

Check what will happen before executing rollback.

```typescript
async function smartRollback(workflowId: string) {
  // Validate rollback
  const validation = validateWorkflowRollback(workflowId);
  
  if (!validation.canRollback) {
    console.log('❌ Cannot roll back this workflow');
    return;
  }
  
  // Show warnings
  if (validation.warnings.length > 0) {
    console.log('⚠️ Rollback warnings:');
    validation.warnings.forEach(w => console.log(`  - ${w}`));
  }
  
  // Estimate duration
  const estimate = estimateRollbackDuration(workflowId);
  console.log(`\n⏱️  Estimated rollback time: ${(estimate! / 1000).toFixed(1)}s`);
  
  // Show what will be rolled back
  console.log('\n📊 Rollback plan:');
  console.log(`  Reversible actions: ${validation.reversibleActions}`);
  console.log(`  Non-reversible actions: ${validation.nonReversibleActions}`);
  console.log(`  Requires confirmation: ${validation.requiresConfirmation}`);
  
  // Ask for confirmation
  const confirmed = await askUserConfirmation('Proceed with rollback?');
  
  if (!confirmed) {
    console.log('Rollback cancelled');
    return;
  }
  
  // Execute rollback
  const result = await rollback(workflowId, {
    stopOnFailure: false,
    skipNonReversible: false
  });
  
  // Report results
  console.log('\n📋 Rollback results:');
  console.log(`  Success: ${result.success ? '✅' : '❌'}`);
  console.log(`  Duration: ${(result.duration / 1000).toFixed(1)}s`);
  console.log(`  Rolled back: ${result.rolledBackActions.length}`);
  console.log(`  Failed: ${result.failedActions.length}`);
  console.log(`  Manual required: ${result.manualInterventionActions.length}`);
  
  if (result.manualSteps && result.manualSteps.length > 0) {
    console.log('\n📝 Manual steps required:');
    result.manualSteps.forEach(step => console.log(`  ${step}`));
  }
}
```

### Example 4: Monitoring Rollback History

Track and report on rollback activity.

```typescript
function generateRollbackReport() {
  const stats = getRollbackStatistics();
  
  console.log('=== Rollback Statistics ===\n');
  console.log(`Active workflows: ${stats.activeWorkflows}`);
  console.log(`History entries: ${stats.historyEntries}`);
  console.log(`Total rollbacks: ${stats.totalRollbacks}`);
  console.log(`  Successful: ${stats.successfulRollbacks}`);
  console.log(`  Failed: ${stats.failedRollbacks}`);
  console.log(`  Partial: ${stats.partialRollbacks}`);
  
  if (stats.totalRollbacks > 0) {
    const successRate = (stats.successfulRollbacks / stats.totalRollbacks * 100).toFixed(1);
    console.log(`\nSuccess rate: ${successRate}%`);
  }
  
  // Find workflows needing manual intervention
  const needsManual = getWorkflowsRequiringManualIntervention();
  
  if (needsManual.length > 0) {
    console.log(`\n⚠️ ${needsManual.length} workflows need manual intervention:\n`);
    
    needsManual.forEach(workflow => {
      console.log(`${workflow.workflowId} - ${workflow.workflowName}`);
      console.log(`  Rolled back at: ${workflow.rollbackCompletedAt}`);
      console.log(`  Manual steps required: ${workflow.manualInterventionSteps?.length || 0}`);
      console.log('');
    });
  }
  
  // Recent rollback history
  const recent = getRollbackHistory(10);
  
  console.log('\n=== Recent Rollbacks ===\n');
  recent.forEach(workflow => {
    const duration = workflow.rollbackCompletedAt && workflow.rollbackStartedAt
      ? (workflow.rollbackCompletedAt.getTime() - workflow.rollbackStartedAt.getTime()) / 1000
      : 0;
    
    console.log(`${workflow.workflowId} - ${workflow.workflowName}`);
    console.log(`  Status: ${workflow.status}`);
    console.log(`  Actions: ${workflow.executedActions.length}`);
    console.log(`  Duration: ${duration.toFixed(1)}s`);
    
    if (workflow.rollbackStats) {
      console.log(`  Rolled back: ${workflow.rollbackStats.rolledBack}`);
      console.log(`  Failed: ${workflow.rollbackStats.failed}`);
      console.log(`  Manual required: ${workflow.rollbackStats.manualRequired}`);
    }
    
    console.log('');
  });
}
```

---

## Manual Intervention

Some actions cannot be automatically reversed. The system provides clear guidance on what needs to be done manually.

### Manual Steps Format

```typescript
const result = await rollback('wf-001');

if (result.manualSteps) {
  console.log('Manual steps required:');
  result.manualSteps.forEach(step => console.log(step));
}

// Example output:
// Manual steps required:
// Action: send_notification (notify-team)
// Target: slack
// Executed at: 2025-10-16T10:30:00.000Z
// ⚠️ This notification/message cannot be automatically deleted
// Manual action: Inform recipients that the action was rolled back
//    Channel: engineering
//    Original message: "Deployment complete - v2.0.1 now live"
```

### Common Manual Interventions

#### 1. Slack Notification (Non-Reversible)

```typescript
// Manual steps provided:
// - Send follow-up message explaining rollback
// - Channel: #engineering
// - Original: "Bug fixed in v2.0.1"
// - Follow-up: "Previous notification was incorrect - rollback in progress"
```

#### 2. Email (Non-Reversible)

```typescript
// Manual steps provided:
// - Send correction email to recipients
// - Original recipients: team@company.com
// - Subject line should reference original email
// - Explain the situation and corrected information
```

#### 3. Webhook Trigger (Non-Reversible)

```typescript
// Manual steps provided:
// - Contact webhook recipient system
// - Webhook URL: https://external-api.com/webhook
// - Payload sent: { event: 'completed', id: '123' }
// - Ask recipient to ignore/reverse the event
```

#### 4. File Deletion (Confirmation Required)

```typescript
// Manual steps provided:
// - Manually confirm and delete file
// - File ID: file-abc-123
// - File name: Invoice-2025-001.pdf
// - Drive URL: https://drive.google.com/file/d/...
// - WARNING: This action is permanent
```

### Handling Manual Steps in Code

```typescript
async function handleRollbackWithManualSteps(workflowId: string) {
  const result = await rollback(workflowId);
  
  if (result.manualSteps && result.manualSteps.length > 0) {
    // Log manual steps
    logger.warn(`Workflow ${workflowId} requires manual intervention`);
    logger.warn('Manual steps:', result.manualSteps);
    
    // Send to monitoring system
    await sendToMonitoring({
      type: 'MANUAL_INTERVENTION_REQUIRED',
      workflowId,
      steps: result.manualSteps,
      timestamp: new Date()
    });
    
    // Create task for ops team
    await createOpsTicket({
      title: `Manual Rollback Steps Required: ${workflowId}`,
      description: result.manualSteps.join('\n'),
      priority: 'high'
    });
    
    // Send email alert
    await sendEmail({
      to: 'ops-team@company.com',
      subject: `Action Required: Rollback Manual Steps - ${workflowId}`,
      body: `
        The following workflow requires manual intervention to complete rollback:
        
        Workflow: ${workflowId}
        Status: ${result.success ? 'Partially rolled back' : 'Failed'}
        
        Manual Steps:
        ${result.manualSteps.join('\n')}
        
        Please complete these steps and update the workflow status.
      `
    });
  }
}
```

---

## History & Debugging

### Accessing History

```typescript
// Get recent history
const recent = getRollbackHistory(20);

recent.forEach(workflow => {
  console.log(`${workflow.workflowId}: ${workflow.status}`);
  
  // Show execution details
  workflow.executedActions.forEach(action => {
    console.log(`  ${action.actionId}: ${action.rollbackStatus}`);
  });
});
```

### Debugging Failed Rollbacks

```typescript
// Export workflow for detailed analysis
const workflowJson = exportWorkflowForDebugging('wf-failed-001');

if (workflowJson) {
  // Save to file
  fs.writeFileSync('debug-workflow.json', workflowJson);
  
  // Parse and analyze
  const workflow = JSON.parse(workflowJson);
  
  console.log('Failed actions:');
  workflow.executedActions
    .filter(a => a.rollbackStatus === 'failed')
    .forEach(action => {
      console.log(`  ${action.actionId}:`);
      console.log(`    Type: ${action.actionType}`);
      console.log(`    Error: ${action.rollbackMetadata?.rollbackError}`);
      console.log(`    Original params:`, action.originalParams);
      console.log(`    Result:`, action.result);
    });
}
```

### History Cleanup

```typescript
// Clear old history periodically
setInterval(() => {
  const removed = clearRollbackHistory(30); // 30 days
  logger.info(`Cleared ${removed} old rollback history entries`);
}, 24 * 60 * 60 * 1000); // Daily
```

---

## Best Practices

### 1. Always Track Workflows

**DO:**
```typescript
const workflow = startWorkflow('wf-001', 'Process Order');

// Execute and record each step
const result = await executeStep();
recordAction('wf-001', { ... });
```

**DON'T:**
```typescript
// Forgetting to start tracking
const result = await executeStep();
// Can't rollback - not tracked!
```

### 2. Store Previous Values

For update operations, always store the previous value.

**DO:**
```typescript
recordAction('wf-001', {
  actionId: 'update-status',
  actionType: 'update_cell',
  target: 'sheets',
  originalParams: {
    range: 'A1',
    value: 'Completed',
    previousValue: 'Pending'  // ← Store for rollback
  },
  result: { updated: true }
});
```

**DON'T:**
```typescript
// No previous value stored
originalParams: {
  range: 'A1',
  value: 'Completed'
  // Can't restore previous state!
}
```

### 3. Handle Non-Reversible Actions Appropriately

**DO:**
```typescript
// Send notification last
await createTrelloCard();  // Reversible
await uploadFile();        // Reversible
await sendNotification();  // Non-reversible - do last
```

**DON'T:**
```typescript
// Notification sent first
await sendNotification();  // Non-reversible
await createTrelloCard();  // If this fails, can't unsend notification
```

### 4. Use Partial Rollback Strategically

**Good Use Case:**
```typescript
// Keep important work, undo last step only
await partialRollback('wf-001', 1);
```

**Bad Use Case:**
```typescript
// Rolling back middle steps breaks dependencies
// Always roll back from the end
```

### 5. Set Appropriate Timeouts

**DO:**
```typescript
await rollback('wf-001', {
  timeoutPerAction: 30000  // 30 seconds
});
```

**DON'T:**
```typescript
// No timeout - could hang forever
await rollback('wf-001');
```

### 6. Monitor Rollback Statistics

```typescript
// Regularly check rollback health
const stats = getRollbackStatistics();

if (stats.failedRollbacks / stats.totalRollbacks > 0.1) {
  alertOpsTeam('High rollback failure rate detected');
}
```

### 7. Complete Workflows

**DO:**
```typescript
try {
  // Execute workflow
  completeWorkflow('wf-001');
} catch (error) {
  await rollback('wf-001');
}
```

**DON'T:**
```typescript
// Forgetting to complete
// Workflow stays in active state forever
```

---

## Integration Guide

### Integration with Workflow Orchestrator

The Rollback Manager integrates seamlessly with the Workflow Orchestrator:

```typescript
import { executeWorkflow } from './workflow-orchestrator';
import {
  startWorkflow,
  recordAction,
  rollback
} from './rollback-manager';

async function executeWorkflowWithRollback(workflow: WorkflowDefinition) {
  const workflowId = workflow.id;
  
  // Start rollback tracking
  startWorkflow(workflowId, workflow.name);
  
  try {
    // Execute workflow
    const result = await executeWorkflow(workflow);
    
    if (result.success) {
      // Record all successful steps
      result.steps.forEach(step => {
        recordAction(workflowId, {
          actionId: step.stepId,
          actionType: step.action,
          target: step.target,
          originalParams: step.params,
          result: step.result
        });
      });
      
      completeWorkflow(workflowId);
    } else {
      // Workflow failed - roll back
      await rollback(workflowId);
    }
    
    return result;
    
  } catch (error) {
    // Unexpected error - roll back
    await rollback(workflowId);
    throw error;
  }
}
```

### Integration with Action Router

Route rollback operations through the action router:

```typescript
// In action-router.ts
import * as RollbackManager from './rollback-manager';

async function handleAction(action: string, params: any) {
  // Existing action handling...
  
  // New rollback actions
  if (action === 'rollback_workflow') {
    return await RollbackManager.rollback(params.workflowId, params.config);
  }
  
  if (action === 'partial_rollback') {
    return await RollbackManager.partialRollback(
      params.workflowId,
      params.numberOfSteps,
      params.config
    );
  }
  
  // ... other actions
}
```

### Integration with Monitoring

Send rollback events to monitoring system:

```typescript
import { getRollbackStatistics, getRollbackHistory } from './rollback-manager';

// Periodic monitoring
setInterval(async () => {
  const stats = getRollbackStatistics();
  
  await sendMetrics({
    'rollback.active_workflows': stats.activeWorkflows,
    'rollback.total_rollbacks': stats.totalRollbacks,
    'rollback.successful': stats.successfulRollbacks,
    'rollback.failed': stats.failedRollbacks,
    'rollback.success_rate': stats.totalRollbacks > 0
      ? stats.successfulRollbacks / stats.totalRollbacks
      : 1
  });
}, 60000); // Every minute
```

---

## TypeScript Types Reference

```typescript
// Main Types
export enum RollbackStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  MANUAL_REQUIRED = 'manual_required'
}

export enum WorkflowRollbackStatus {
  ACTIVE = 'active',
  ROLLING_BACK = 'rolling_back',
  ROLLED_BACK = 'rolled_back',
  PARTIALLY_ROLLED_BACK = 'partially_rolled_back',
  ROLLBACK_FAILED = 'rollback_failed'
}

export enum ActionReversibility {
  REVERSIBLE = 'reversible',
  PARTIALLY_REVERSIBLE = 'partially_reversible',
  NON_REVERSIBLE = 'non_reversible',
  CONFIRMATION_REQUIRED = 'confirmation_required'
}

export interface ExecutedAction {
  actionId: string;
  workflowId: string;
  actionType: string;
  target: string;
  originalParams: Record<string, any>;
  result: Record<string, any>;
  executedAt: Date;
  reversibility: ActionReversibility;
  rollbackStatus: RollbackStatus;
  rollbackMetadata?: {
    rolledBackAt: Date;
    rollbackResult?: Record<string, any>;
    rollbackError?: string;
    manualSteps?: string[];
  };
}

export interface WorkflowRollback {
  workflowId: string;
  workflowName: string;
  executedActions: ExecutedAction[];
  status: WorkflowRollbackStatus;
  startedAt: Date;
  rollbackStartedAt?: Date;
  rollbackCompletedAt?: Date;
  rollbackStats?: {
    totalActions: number;
    rolledBack: number;
    failed: number;
    manualRequired: number;
  };
  manualInterventionSteps?: string[];
}

export interface RollbackConfig {
  maxActions?: number;
  requireConfirmation?: boolean;
  stopOnFailure?: boolean;
  timeoutPerAction?: number;
  skipNonReversible?: boolean;
}

export interface RollbackResult {
  success: boolean;
  workflowId: string;
  rolledBackActions: string[];
  failedActions: string[];
  manualInterventionActions: string[];
  duration: number;
  error?: string;
  manualSteps?: string[];
}
```

---

## Summary

The Rollback Manager provides enterprise-grade rollback capabilities:

✅ **Automatic rollback** of reversible actions  
✅ **Partial rollback** for selective undo  
✅ **Smart classification** of action reversibility  
✅ **Clear guidance** for non-reversible actions  
✅ **Complete history** for debugging and audit  
✅ **Flexible configuration** for different scenarios  
✅ **Timeout protection** to prevent hanging  
✅ **Manual intervention** support with detailed steps  

**Key Takeaway**: The Rollback Manager ensures system consistency by automatically undoing failed workflow steps while providing clear guidance for actions that require manual intervention.

---

*Documentation complete - Ready for production use! 🚀*
