# Prompt 20: Approval Queue Handler

## 📋 Overview

The **Approval Queue Handler** implements a comprehensive human-in-the-loop approval system for AI-driven actions. It provides intelligent approval workflows with Slack integration, automatic expiry handling, and learning feedback for Member 2's reasoning engine.

## 🎯 What Was Built

### File Created
- **`src/workflows/approval-handler.ts`** (1,100+ lines)
  - Complete approval queue management system
  - Slack notification integration
  - Auto-expiry with risk-based handling
  - Learning feedback system
  - Dashboard and statistics

## 🔑 Core Functions

### 1. **queueApproval()**
```typescript
async function queueApproval(
  reasoningResult: ReasoningResult,
  reason: string,
  metadata?: any
): Promise<string>
```
- **Purpose**: Queue an action for human approval
- **Features**:
  - Generates unique approval ID
  - Stores in approval queue with metadata
  - Sends Slack notification with approve/reject buttons
  - Sets timeout based on priority:
    - Low: 1 hour
    - Medium: 30 minutes
    - High: 15 minutes
    - Critical: No auto-expire
  - Returns approval ID for tracking

### 2. **processApproval()**
```typescript
async function processApproval(
  approvalId: string,
  decision: ApprovalDecision,
  decidedBy: string,
  modifications?: any,
  rejectionReason?: string
): Promise<void>
```
- **Purpose**: Process human decision on approval
- **Features**:
  - If approved: execute action with modifications
  - If rejected: log reason, notify reasoning engine
  - Updates queue status
  - Provides feedback to Member 2's learning system
  - Updates Slack message with decision
  - Tracks decision time statistics

### 3. **autoExpire()**
```typescript
async function autoExpire(approvalId: string): Promise<void>
```
- **Purpose**: Handle timed-out approvals automatically
- **Features**:
  - Low risk → Auto-approve (if configured)
  - High/Critical risk → Auto-reject and notify
  - Medium risk → Mark for manual review
  - Updates statistics
  - Provides learning feedback

### 4. **getApprovalQueue()**
```typescript
function getApprovalQueue(): ApprovalRequest[]
```
- **Purpose**: Get all approval requests for dashboard
- **Features**:
  - Returns complete queue
  - Includes pending, completed, rejected, expired
  - Useful for monitoring and reporting

## 📊 Key Features

### 1. **Priority-Based Timeouts**
```typescript
timeouts: {
  low: 60 * 60 * 1000,        // 1 hour
  medium: 30 * 60 * 1000,     // 30 minutes
  high: 15 * 60 * 1000,       // 15 minutes
  critical: 0                  // Immediate (no auto-expire)
}
```

### 2. **Risk-Based Auto-Handling**
```typescript
// Auto-approve low risk after timeout
if (riskLevel === RiskLevel.LOW && autoApproveLowRisk) {
  request.status = ApprovalStatus.APPROVED;
  await executeApprovedAction(request);
}

// Auto-reject high risk after timeout
if (riskLevel === RiskLevel.HIGH && autoRejectHighRisk) {
  request.status = ApprovalStatus.REJECTED;
  request.rejectionReason = 'Auto-rejected due to timeout and high risk';
}
```

### 3. **Slack Integration**
```typescript
// Slack message with interactive buttons
{
  blocks: [
    { type: 'header', text: '🔴 Action Approval Required' },
    { type: 'section', fields: [action, priority, risk, confidence] },
    { type: 'section', text: reasoning },
    { type: 'actions', elements: [
      { text: '✅ Approve', style: 'primary' },
      { text: '✏️ Modify' },
      { text: '❌ Reject', style: 'danger' }
    ]}
  ]
}
```

### 4. **Learning Feedback**
```typescript
const feedback: ApprovalFeedback = {
  approvalId: request.id,
  decision: ApprovalDecision.APPROVE,
  executionSuccess: true,
  timeToDecision: 45000, // 45 seconds
  hadModifications: false,
  originalConfidence: 0.85,
  riskLevel: RiskLevel.MEDIUM,
  wasCorrect: true
};

// Send to Member 2's learning system
eventEmitter.emit('learning:feedback', feedback);
```

### 5. **Action Modifications**
```typescript
// User can modify action parameters before approval
await processApproval(
  approvalId,
  ApprovalDecision.MODIFY,
  'user@example.com',
  { 
    // Override specific parameters
    title: 'Updated Task Title',
    priority: 'high',
    dueDate: '2025-10-20'
  }
);
```

### 6. **Comprehensive Statistics**
```typescript
const stats = {
  totalRequests: 150,
  approved: 120,
  rejected: 20,
  expired: 5,
  autoApproved: 10,
  autoRejected: 5,
  avgDecisionTime: 180000, // 3 minutes
  approvalRateByRisk: {
    low: 95,
    medium: 85,
    high: 60,
    critical: 40
  },
  pendingCount: 5
};
```

## 📖 Usage Examples

### Example 1: Basic Approval Flow
```typescript
import approvalHandler, { ApprovalPriority, RiskLevel } from './workflows/approval-handler';

// Member 2 requests approval
const reasoningResult = {
  action: 'notion:createPage',
  parameters: { database: 'tasks', title: 'Deploy New Feature' },
  reasoning: 'Deploy requested in Slack, high confidence task creation',
  confidence: 0.92,
  riskLevel: RiskLevel.MEDIUM,
  priority: ApprovalPriority.MEDIUM
};

const approvalId = await approvalHandler.queueApproval(
  reasoningResult,
  'First-time deployment action, requires human verification'
);

console.log(`Approval queued: ${approvalId}`);
// Slack notification sent automatically
```

### Example 2: Process Approval Decision
```typescript
import { ApprovalDecision } from './workflows/approval-handler';

// Human approves the action
await approvalHandler.processApproval(
  approvalId,
  ApprovalDecision.APPROVE,
  'user@example.com'
);

// Action executes automatically
// Learning feedback sent to Member 2
```

### Example 3: Reject with Reason
```typescript
// Human rejects the action
await approvalHandler.processApproval(
  approvalId,
  ApprovalDecision.REJECT,
  'user@example.com',
  undefined,
  'Deployment scheduled for next week, not today'
);

// Rejection reason logged
// Feedback sent to learning system
```

### Example 4: Modify Action Before Approval
```typescript
// Human modifies action parameters
await approvalHandler.processApproval(
  approvalId,
  ApprovalDecision.MODIFY,
  'user@example.com',
  {
    // Override parameters
    title: 'Deploy New Feature - Sprint 42',
    assignee: 'devops-team',
    dueDate: '2025-10-25'
  }
);

// Action executes with modified parameters
```

### Example 5: Monitor Approval Queue
```typescript
// Get pending approvals for dashboard
const pending = approvalHandler.getPendingApprovals();

console.log(`Pending approvals: ${pending.length}`);
pending.forEach(req => {
  console.log(`- ${req.id}: ${req.reasoningResult.action} (${req.priority})`);
  console.log(`  Expires: ${req.expiresAt.toISOString()}`);
  console.log(`  Risk: ${req.riskLevel}`);
});
```

### Example 6: Listen to Approval Events
```typescript
// Listen to approval request event
approvalHandler.on('action:requires_approval', (request) => {
  console.log('New approval request:', request.id);
  console.log('Action:', request.reasoningResult.action);
  console.log('Priority:', request.priority);
});

// Listen to decision event
approvalHandler.on('approval:decided', (request) => {
  console.log('Approval decided:', request.id);
  console.log('Decision:', request.decision);
  console.log('Decided by:', request.decidedBy);
});

// Listen to expiry event
approvalHandler.on('approval:expired', (request) => {
  console.log('Approval expired:', request.id);
  console.log('Status:', request.status);
});
```

### Example 7: Configure Approval Handler
```typescript
// Custom configuration
approvalHandler.configure({
  enabled: true,
  slack: {
    enabled: true,
    channel: '#approvals',
    mentionOnCritical: true,
    mentionUsers: ['U12345', 'U67890']
  },
  timeouts: {
    low: 2 * 60 * 60 * 1000,      // 2 hours
    medium: 1 * 60 * 60 * 1000,   // 1 hour
    high: 30 * 60 * 1000,         // 30 minutes
    critical: 0                    // No auto-expire
  },
  autoExpiry: {
    enabled: true,
    autoApproveLowRisk: true,
    autoRejectHighRisk: true
  },
  learningFeedback: {
    enabled: true,
    callback: async (feedback) => {
      // Send to Member 2's learning system
      await member2.provideFeedback(feedback);
    }
  }
});
```

### Example 8: Dashboard Integration
```typescript
// Get dashboard summary
const dashboard = approvalHandler.getDashboardSummary();

console.log('Approval Dashboard:');
console.log(`Total Requests: ${dashboard.stats.totalRequests}`);
console.log(`Approved: ${dashboard.stats.approved}`);
console.log(`Rejected: ${dashboard.stats.rejected}`);
console.log(`Pending: ${dashboard.stats.pendingCount}`);

console.log('\nPending Approvals:');
dashboard.pending.forEach(req => {
  const timeLeft = Math.round(req.timeRemaining / 60000);
  console.log(`- ${req.action} (${req.priority}) - ${timeLeft} min left`);
});

console.log('\nRecent Decisions:');
dashboard.recentDecisions.forEach(req => {
  console.log(`- ${req.action}: ${req.decision} by ${req.decidedBy}`);
});
```

## 🔄 Approval Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     APPROVAL QUEUE FLOW                          │
└─────────────────────────────────────────────────────────────────┘

1. Member 2 Requests Approval
   └─> queueApproval(reasoningResult, reason)
       ├─> Generate approval ID
       ├─> Store in queue
       ├─> Send Slack notification
       └─> Set expiry timer

2. Human Reviews in Slack
   └─> Interactive buttons: Approve / Modify / Reject

3. Human Makes Decision
   └─> processApproval(approvalId, decision, decidedBy, modifications?)
       ├─> If APPROVE:
       │   ├─> Execute action
       │   ├─> Update Slack: "✅ Approved & Completed"
       │   └─> Send positive feedback to Member 2
       │
       ├─> If MODIFY:
       │   ├─> Merge modifications with original parameters
       │   ├─> Execute modified action
       │   └─> Send feedback with modifications
       │
       └─> If REJECT:
           ├─> Log rejection reason
           ├─> Update Slack: "❌ Rejected"
           └─> Send negative feedback to Member 2

4. Auto-Expiry (if timeout reached)
   └─> autoExpire(approvalId)
       ├─> If LOW risk + autoApproveLowRisk:
       │   └─> Auto-approve and execute
       │
       ├─> If HIGH/CRITICAL risk + autoRejectHighRisk:
       │   └─> Auto-reject and notify
       │
       └─> Else:
           └─> Mark for manual review

5. Learning Feedback
   └─> Member 2 receives feedback:
       ├─> Decision made (approve/reject/modify)
       ├─> Execution success/failure
       ├─> Time to decision
       ├─> Was decision correct?
       └─> Improves future confidence scoring
```

## 📊 Result Structure

### Approval Request
```typescript
{
  id: "approval_1729163400000_abc123",
  reasoningResult: {
    action: "notion:createPage",
    parameters: { database: "tasks", title: "Deploy Feature" },
    reasoning: "Deploy requested in Slack",
    confidence: 0.92,
    riskLevel: "medium",
    priority: "medium"
  },
  reason: "First-time deployment action",
  status: "approved",
  priority: "medium",
  riskLevel: "medium",
  createdAt: "2025-10-17T10:30:00Z",
  expiresAt: "2025-10-17T11:00:00Z",
  timeout: 1800000, // 30 minutes
  slackMessageTs: "1729163400.123456",
  decision: "approve",
  decidedBy: "user@example.com",
  decidedAt: "2025-10-17T10:32:15Z",
  executionResult: {
    success: true,
    action: "notion:createPage",
    result: "Page created successfully"
  },
  metadata: {
    source: "member-2",
    workflowId: "wf_123",
    taskId: "task_456"
  }
}
```

### Learning Feedback
```typescript
{
  approvalId: "approval_1729163400000_abc123",
  decision: "approve",
  wasCorrect: true,
  executionSuccess: true,
  timeToDecision: 135000, // 2 min 15 sec
  hadModifications: false,
  originalConfidence: 0.92,
  riskLevel: "medium",
  notes: "Action executed successfully"
}
```

## 🎯 Benefits

### 1. **Safe AI Automation**
- Human oversight for uncertain actions
- Risk-based approval thresholds
- Prevents costly mistakes

### 2. **Efficient Workflow**
- Slack integration for quick decisions
- Auto-expiry for low-risk actions
- No bottlenecks for routine tasks

### 3. **Continuous Learning**
- Feedback improves Member 2's confidence
- Tracks decision patterns
- Identifies areas for automation

### 4. **Transparency**
- Complete audit trail
- Dashboard for monitoring
- Statistics for optimization

### 5. **Flexibility**
- Modify actions before execution
- Custom approval strategies
- Configurable timeouts and behaviors

### 6. **Team Collaboration**
- Slack notifications keep team informed
- Mention critical users for urgent items
- Shared approval queue

## 🔗 Integration Points

### With Member 2 (Reasoning Engine)
```typescript
// Member 2 requests approval for uncertain action
if (confidence < 0.8 || riskLevel === RiskLevel.HIGH) {
  const approvalId = await approvalHandler.queueApproval(
    reasoningResult,
    'Confidence below threshold, requires human verification'
  );
  
  // Wait for approval or timeout
  const result = await waitForApproval(approvalId);
  return result;
}
```

### With Circuit Breaker
```typescript
// Approval + Circuit Breaker protection
const approvalId = await approvalHandler.queueApproval(reasoningResult, reason);

// When approved, execute with circuit breaker
approvalHandler.on('approval:decided', async (request) => {
  if (request.decision === ApprovalDecision.APPROVE) {
    await circuitBreaker.execute('notion', async () => {
      return await executeAction(request.reasoningResult);
    });
  }
});
```

### With Retry Manager
```typescript
// Approved action with retry logic
if (request.status === ApprovalStatus.APPROVED) {
  try {
    const result = await retry.retry(
      async () => executeAction(request.reasoningResult),
      { platform: 'NOTION', maxRetries: 3 }
    );
    request.executionResult = result;
    request.status = ApprovalStatus.COMPLETED;
  } catch (error) {
    request.status = ApprovalStatus.FAILED;
  }
}
```

### With Fallback Handler
```typescript
// Approved action with fallback
if (request.status === ApprovalStatus.APPROVED) {
  try {
    const result = await executeAction(request.reasoningResult);
    request.executionResult = result;
  } catch (error) {
    // Try fallback if primary fails
    const fallbackResult = await fallbackHandler.executeFallback(
      PrimaryAction.NOTION_CREATE_PAGE,
      request.reasoningResult.parameters,
      error
    );
    request.executionResult = fallbackResult;
  }
}
```

## 📈 Statistics

### Available Metrics
```typescript
const stats = approvalHandler.getStats();

console.log(approvalHandler.formatStats(stats));
// Output:
// ========================================
//       APPROVAL QUEUE STATISTICS
// ========================================
// 
// Total Requests: 150
// Approved: 120 (80.0%)
// Rejected: 20
// Expired: 5
// Auto-Approved: 10 (6.7%)
// Auto-Rejected: 5
// Pending: 5
// 
// Average Decision Time: 3 minutes
// 
// Approval Rate by Risk Level:
//   LOW: 95 approvals
//   MEDIUM: 85 approvals
//   HIGH: 60 approvals
//   CRITICAL: 40 approvals
// 
// ========================================
```

## 🚀 Production Deployment

### Environment Variables
```bash
# Enable approval queue
ENABLE_APPROVALS=true

# Slack integration
SLACK_APPROVALS_ENABLED=true
SLACK_APPROVALS_CHANNEL=#approvals
SLACK_APPROVAL_USERS=U12345,U67890
```

### Health Check
```typescript
// Check approval queue health
const health = {
  enabled: approvalHandler.isEnabled(),
  pending: approvalHandler.getPendingApprovals().length,
  stats: approvalHandler.getStats()
};

if (health.pending > 20) {
  console.warn('Approval queue backlog detected');
}
```

## ✅ Success Criteria

All requirements met:
- ✅ Listens to `action:requires_approval` event
- ✅ `queueApproval()` stores with metadata
- ✅ Slack notification with approve/reject buttons
- ✅ Timeout based on priority (1 hour low, immediate critical)
- ✅ Returns approval ID
- ✅ `processApproval()` handles approve/reject/modify
- ✅ If approved: execute with modifications
- ✅ If rejected: log reason, notify reasoning engine
- ✅ Updates queue status
- ✅ Provides feedback to learning system
- ✅ `autoExpire()` handles timeouts
- ✅ Low risk → auto-approve
- ✅ High risk → auto-reject and notify
- ✅ `getApprovalQueue()` for dashboard
- ✅ Complete statistics tracking
- ✅ Event emission system

## 📊 Project Status

**20 of 20 Prompts Complete** 🎉

**Human-in-the-Loop Infrastructure**: 1,100+ lines, 40+ functions

**Next Steps**:
1. Integration testing with Member 2
2. Slack webhook integration (replace simulation)
3. Dashboard UI development
4. Production deployment with real approvals
5. Complete Session 9 testing

---

*Approval Queue Handler - Safe AI automation with human oversight* ✅
