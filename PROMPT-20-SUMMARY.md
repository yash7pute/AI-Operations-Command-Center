# Prompt 20 Summary: Approval Queue Handler

## What Was Built

A comprehensive **human-in-the-loop approval system** that:
- Queues actions requiring human approval
- Sends Slack notifications with interactive buttons
- Auto-expires based on risk level
- Provides learning feedback to Member 2
- Tracks statistics and provides dashboard

## Files Created

1. **`src/workflows/approval-handler.ts`** (1,100+ lines)
   - Complete approval queue management
   - Slack integration (simulated)
   - Auto-expiry with risk-based handling
   - Learning feedback system
   - Dashboard and statistics

## Core Functions

### queueApproval()
```typescript
const approvalId = await queueApproval(reasoningResult, reason);
```
- Stores approval request in queue
- Sends Slack notification with buttons
- Sets timeout based on priority:
  - Low: 1 hour
  - Medium: 30 minutes
  - High: 15 minutes
  - Critical: No auto-expire
- Returns approval ID

### processApproval()
```typescript
await processApproval(approvalId, decision, decidedBy, modifications?, rejectionReason?);
```
- Handles human decision (approve/reject/modify)
- If approved: execute action with modifications
- If rejected: log reason, notify Member 2
- Provides learning feedback
- Updates statistics

### autoExpire()
```typescript
await autoExpire(approvalId);
```
- Handles timed-out approvals
- Low risk → Auto-approve (if configured)
- High/Critical risk → Auto-reject and notify
- Medium risk → Mark for manual review

### getApprovalQueue()
```typescript
const queue = getApprovalQueue();
```
- Returns all approval requests
- Used for dashboard display
- Includes pending, completed, rejected, expired

## Key Features

### 1. Priority-Based Timeouts
- **Low**: 1 hour before auto-handling
- **Medium**: 30 minutes
- **High**: 15 minutes
- **Critical**: Immediate (no auto-expire)

### 2. Risk-Based Auto-Handling
- **Low Risk**: Auto-approve after timeout
- **High/Critical Risk**: Auto-reject after timeout
- **Medium Risk**: Mark for manual review

### 3. Slack Integration
- Interactive approval message
- Approve / Modify / Reject buttons
- Mention users for critical approvals
- Update message with decision status

### 4. Learning Feedback
```typescript
{
  approvalId: "approval_123",
  decision: "approve",
  wasCorrect: true,
  executionSuccess: true,
  timeToDecision: 135000,
  hadModifications: false,
  originalConfidence: 0.92,
  riskLevel: "medium"
}
```
- Sent to Member 2's learning system
- Improves confidence scoring
- Tracks decision patterns

### 5. Action Modifications
```typescript
await processApproval(approvalId, ApprovalDecision.MODIFY, 'user@example.com', {
  title: 'Updated Title',
  priority: 'high'
});
```
- Human can modify parameters before execution
- Merges modifications with original
- Executes modified action

### 6. Comprehensive Statistics
```typescript
{
  totalRequests: 150,
  approved: 120,
  rejected: 20,
  expired: 5,
  autoApproved: 10,
  autoRejected: 5,
  avgDecisionTime: 180000,
  approvalRateByRisk: Map,
  pendingCount: 5
}
```

## Usage Examples

### Basic Approval
```typescript
import approvalHandler from './workflows/approval-handler';

const reasoningResult = {
  action: 'notion:createPage',
  parameters: { database: 'tasks', title: 'Deploy Feature' },
  reasoning: 'Deploy requested in Slack',
  confidence: 0.92,
  riskLevel: RiskLevel.MEDIUM,
  priority: ApprovalPriority.MEDIUM
};

const approvalId = await approvalHandler.queueApproval(
  reasoningResult,
  'First-time deployment, requires verification'
);
```

### Process Decision
```typescript
// Approve
await approvalHandler.processApproval(
  approvalId,
  ApprovalDecision.APPROVE,
  'user@example.com'
);

// Reject
await approvalHandler.processApproval(
  approvalId,
  ApprovalDecision.REJECT,
  'user@example.com',
  undefined,
  'Not authorized for deployment'
);

// Modify
await approvalHandler.processApproval(
  approvalId,
  ApprovalDecision.MODIFY,
  'user@example.com',
  { title: 'Deploy Feature - Sprint 42' }
);
```

### Monitor Queue
```typescript
const pending = approvalHandler.getPendingApprovals();
console.log(`${pending.length} approvals pending`);

const stats = approvalHandler.getStats();
console.log(approvalHandler.formatStats(stats));
```

### Listen to Events
```typescript
approvalHandler.on('action:requires_approval', (request) => {
  console.log('New approval request:', request.id);
});

approvalHandler.on('approval:decided', (request) => {
  console.log('Decision:', request.decision, 'by', request.decidedBy);
});

approvalHandler.on('approval:expired', (request) => {
  console.log('Approval expired:', request.id);
});
```

## Approval Flow

```
Member 2 Reasoning
    ↓
queueApproval()
    ├─> Store in queue
    ├─> Send Slack notification
    └─> Set expiry timer
    ↓
Human Reviews (Slack)
    ↓
Decision: Approve / Modify / Reject
    ↓
processApproval()
    ├─> If APPROVE:
    │   ├─> Execute action
    │   └─> Send positive feedback
    ├─> If MODIFY:
    │   ├─> Merge modifications
    │   ├─> Execute modified action
    │   └─> Send feedback
    └─> If REJECT:
        ├─> Log reason
        └─> Send negative feedback
    ↓
Learning Feedback → Member 2
```

## Auto-Expiry Flow

```
Timeout Reached
    ↓
autoExpire()
    ├─> If LOW risk + autoApproveLowRisk:
    │   └─> Auto-approve and execute
    ├─> If HIGH/CRITICAL risk + autoRejectHighRisk:
    │   └─> Auto-reject and notify
    └─> Else:
        └─> Mark for manual review
```

## Benefits

1. **Safe AI Automation**
   - Human oversight for uncertain actions
   - Risk-based approval thresholds
   - Prevents costly mistakes

2. **Efficient Workflow**
   - Slack integration for quick decisions
   - Auto-expiry for low-risk actions
   - No bottlenecks for routine tasks

3. **Continuous Learning**
   - Feedback improves Member 2's confidence
   - Tracks decision patterns
   - Identifies areas for automation

4. **Transparency**
   - Complete audit trail
   - Dashboard for monitoring
   - Statistics for optimization

5. **Flexibility**
   - Modify actions before execution
   - Custom approval strategies
   - Configurable timeouts

## Integration with Other Systems

### With Member 2
```typescript
if (confidence < 0.8 || riskLevel === RiskLevel.HIGH) {
  const approvalId = await approvalHandler.queueApproval(
    reasoningResult,
    'Confidence below threshold'
  );
}
```

### With Circuit Breaker
```typescript
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
if (request.status === ApprovalStatus.APPROVED) {
  const result = await retry.retry(
    async () => executeAction(request.reasoningResult),
    { platform: 'NOTION', maxRetries: 3 }
  );
}
```

### With Fallback Handler
```typescript
try {
  const result = await executeAction(request.reasoningResult);
} catch (error) {
  const fallbackResult = await fallbackHandler.executeFallback(
    PrimaryAction.NOTION_CREATE_PAGE,
    request.reasoningResult.parameters,
    error
  );
}
```

## Statistics Dashboard

```
========================================
      APPROVAL QUEUE STATISTICS
========================================

Total Requests: 150
Approved: 120 (80.0%)
Rejected: 20
Expired: 5
Auto-Approved: 10 (6.7%)
Auto-Rejected: 5
Pending: 5

Average Decision Time: 3 minutes

Approval Rate by Risk Level:
  LOW: 95 approvals
  MEDIUM: 85 approvals
  HIGH: 60 approvals
  CRITICAL: 40 approvals

========================================
```

## Configuration

```typescript
approvalHandler.configure({
  enabled: true,
  slack: {
    enabled: true,
    channel: '#approvals',
    mentionOnCritical: true,
    mentionUsers: ['U12345', 'U67890']
  },
  timeouts: {
    low: 60 * 60 * 1000,      // 1 hour
    medium: 30 * 60 * 1000,   // 30 minutes
    high: 15 * 60 * 1000,     // 15 minutes
    critical: 0                // No auto-expire
  },
  autoExpiry: {
    enabled: true,
    autoApproveLowRisk: true,
    autoRejectHighRisk: true
  },
  learningFeedback: {
    enabled: true,
    callback: async (feedback) => {
      await member2.provideFeedback(feedback);
    }
  }
});
```

## Success Criteria ✅

All requirements met:
- ✅ Listens to `action:requires_approval` event
- ✅ `queueApproval()` implementation
- ✅ Stores in approval queue with metadata
- ✅ Sends Slack notification with buttons
- ✅ Sets timeout (1 hour low, immediate critical)
- ✅ Returns approval ID
- ✅ `processApproval()` implementation
- ✅ If approved: execute with modifications
- ✅ If rejected: log reason, notify reasoning engine
- ✅ Updates queue status
- ✅ Provides feedback to learning system
- ✅ `autoExpire()` implementation
- ✅ Low risk → auto-approve
- ✅ High risk → auto-reject and notify
- ✅ `getApprovalQueue()` for dashboard
- ✅ Complete event system

## Project Status

**20 of 20 Prompts Complete!** 🎉

**Total Human-in-the-Loop Code**: 1,100+ lines, 40+ functions

**Next Steps**:
1. Integration testing with Member 2
2. Replace Slack simulation with real API
3. Build approval dashboard UI
4. Production deployment
5. Complete Session 9 testing

---

*Built with ❤️ for safe AI automation*
