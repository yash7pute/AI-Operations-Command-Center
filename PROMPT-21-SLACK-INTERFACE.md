# Prompt 21: Slack Approval Interface

## 📋 Overview

The **Slack Approval Interface** provides rich interactive Slack messages for action approvals with buttons, modals, and real-time updates. It creates a seamless approval experience directly within Slack.

## 🎯 What Was Built

### File Created
- **`src/workflows/slack-approval-interface.ts`** (1,300+ lines)
  - Interactive Slack message builder
  - Button click handlers
  - Modal dialogs for modifications
  - Real-time message updates
  - Simulated and real Slack API support

## 🔑 Core Functions

### 1. **sendApprovalRequest()**
```typescript
async function sendApprovalRequest(
  reasoningResult: ReasoningResult,
  approvalId: string,
  channel?: string
): Promise<SlackMessageResponse>
```
- **Purpose**: Send interactive approval message to Slack
- **Features**:
  - **Signal Summary**: Source, subject, content excerpt
  - **Reasoning**: Why this action was chosen
  - **Proposed Action**: Detailed description with service and operation
  - **Confidence Score**: Visual indicator with bar and percentage
  - **Action Buttons**: [Approve] [Approve with Changes] [Reject]
  - **Priority & Risk**: Color-coded emojis
  - **Alternatives**: List of considered alternatives
  - **Parameters**: Formatted JSON display

### 2. **handleApprovalButton()**
```typescript
async function handleApprovalButton(
  interaction: SlackButtonInteraction
): Promise<void>
```
- **Purpose**: Handle button click interactions
- **Features**:
  - **If "Approve"**: 
    - Execute immediately
    - Update message to "✅ Approved & Executing"
    - Send confirmation to user
  - **If "Approve with Changes"**: 
    - Open modal for modifications
    - Collect title, priority, assignee, due date
  - **If "Reject"**: 
    - Open modal for rejection reason
    - Collect detailed explanation

### 3. **handleModificationModal()**
```typescript
async function handleModificationModal(
  submission: SlackModalSubmission
): Promise<void>
```
- **Purpose**: Process modification modal submission
- **Features**:
  - **Collects Modifications**:
    - Change title
    - Change priority (low/medium/high/critical)
    - Change assignee (email/username)
    - Change due date (YYYY-MM-DD)
    - Additional parameters (JSON format)
  - **Executes**: Action with modifications
  - **Records**: Modifications for learning system
  - **Updates**: Message to "✅ Approved with Modifications"

### 4. **handleRejectionModal()**
```typescript
async function handleRejectionModal(
  submission: SlackModalSubmission
): Promise<void>
```
- **Purpose**: Process rejection modal submission
- **Features**:
  - Collects rejection reason
  - Processes rejection
  - Provides feedback to learning system
  - Updates message to "❌ Rejected"

## 📊 Key Features

### 1. **Rich Slack Message**

```
🔴 📝 Action Approval Required

Signal Information:
• Source: slack
• Subject: Deploy New Feature
• From: john@example.com
• Channel: #engineering
• Content: Can you deploy the new authentication feature?

─────────────────────────────────

Reasoning:
Deploy requested in Slack with high urgency. User is authorized 
engineering lead. Feature is ready based on recent commits.

Proposed Action:
• Service: Notion
• Operation: CreatePage
• Title: Deploy Authentication Feature
• Database: Engineering Tasks

Action: notion:createPage
Priority: HIGH
Risk Level: 🚨 HIGH
Confidence: 87% 🟡

Confidence Score:
████████░░ 87% 🟡

Parameters:
{
  "database": "engineering-tasks",
  "title": "Deploy Authentication Feature",
  "assignee": "devops-team",
  "priority": "high",
  "dueDate": "2025-10-20"
}

Alternatives Considered:
• trello:createCard
• jira:createIssue
• Linear:createIssue

─────────────────────────────────

[✅ Approve] [✏️ Approve with Changes] [❌ Reject]

Approval ID: approval_1729163400000_abc123 | Created: Oct 17, 2025 at 10:30 AM
```

### 2. **Modification Modal**

```
┌────────────────────────────────┐
│      Modify Action             │
├────────────────────────────────┤
│                                │
│ Modifying: notion:createPage   │
│                                │
│ ─────────────────────────────  │
│                                │
│ Title                          │
│ ┌────────────────────────────┐ │
│ │ Deploy Auth Feature - V2   │ │
│ └────────────────────────────┘ │
│                                │
│ Priority                       │
│ ┌────────────────────────────┐ │
│ │ Critical              ▼    │ │
│ └────────────────────────────┘ │
│                                │
│ Assignee                       │
│ ┌────────────────────────────┐ │
│ │ security-team@example.com  │ │
│ └────────────────────────────┘ │
│                                │
│ Due Date                       │
│ ┌────────────────────────────┐ │
│ │ 2025-10-18                 │ │
│ └────────────────────────────┘ │
│                                │
│ Additional Parameters (JSON)   │
│ ┌────────────────────────────┐ │
│ │ {"notify": true,           │ │
│ │  "tags": ["security"]}     │ │
│ └────────────────────────────┘ │
│                                │
├────────────────────────────────┤
│      [Cancel] [Approve & ✓]   │
└────────────────────────────────┘
```

### 3. **Rejection Modal**

```
┌────────────────────────────────┐
│      Reject Action             │
├────────────────────────────────┤
│                                │
│ ⚠️ You are about to reject    │
│    this action.                │
│                                │
│ Please provide a reason to help│
│ improve future decisions.      │
│                                │
│ Rejection Reason               │
│ ┌────────────────────────────┐ │
│ │ Feature not ready for      │ │
│ │ production. Needs security │ │
│ │ audit first. Please        │ │
│ │ schedule audit before      │ │
│ │ deploying.                 │ │
│ └────────────────────────────┘ │
│                                │
├────────────────────────────────┤
│      [Cancel] [Reject]         │
└────────────────────────────────┘
```

### 4. **Updated Message (After Approval)**

```
✅ Approved & Executing

Approval ID: approval_1729163400000_abc123 | Updated: Oct 17, 2025 at 10:32 AM
```

### 5. **Updated Message (With Modifications)**

```
✅ Approved with Modifications

Modifications Applied:
• title: Deploy Auth Feature - V2
• priority: critical
• assignee: security-team@example.com
• dueDate: 2025-10-18
• notify: true
• tags: ["security"]

Approval ID: approval_1729163400000_abc123 | Updated: Oct 17, 2025 at 10:35 AM
```

### 6. **Updated Message (After Rejection)**

```
❌ Rejected

Rejection Reason:
Feature not ready for production. Needs security audit first. 
Please schedule audit before deploying.

Approval ID: approval_1729163400000_abc123 | Updated: Oct 17, 2025 at 10:33 AM
```

## 📖 Usage Examples

### Example 1: Send Approval Request
```typescript
import slackInterface from './workflows/slack-approval-interface';

const reasoningResult = {
  action: 'notion:createPage',
  parameters: {
    database: 'engineering-tasks',
    title: 'Deploy Authentication Feature',
    assignee: 'devops-team',
    priority: 'high'
  },
  reasoning: 'Deploy requested in Slack with high urgency',
  confidence: 0.87,
  riskLevel: RiskLevel.HIGH,
  priority: ApprovalPriority.HIGH,
  signal: {
    source: 'slack',
    subject: 'Deploy New Feature',
    content: 'Can you deploy the new authentication feature?',
    sender: 'john@example.com',
    channel: '#engineering'
  },
  alternatives: ['trello:createCard', 'jira:createIssue']
};

const response = await slackInterface.sendApprovalRequest(
  reasoningResult,
  'approval_123',
  '#approvals'
);

console.log('Message sent:', response.permalink);
```

### Example 2: Handle Approve Button
```typescript
// User clicks "Approve" button
const interaction: SlackButtonInteraction = {
  type: 'button_click',
  actionId: 'approve',
  approvalId: 'approval_123',
  userId: 'U12345',
  userName: 'john@example.com',
  channelId: 'C12345',
  messageTs: '1729163400.123456',
  responseUrl: 'https://hooks.slack.com/...'
};

await slackInterface.handleApprovalButton(interaction);
// → Approval processed
// → Action executed
// → Message updated: "✅ Approved & Executing"
```

### Example 3: Handle Modify Button
```typescript
// User clicks "Approve with Changes" button
const interaction: SlackButtonInteraction = {
  type: 'button_click',
  actionId: 'modify',
  approvalId: 'approval_123',
  userId: 'U12345',
  userName: 'john@example.com',
  channelId: 'C12345',
  messageTs: '1729163400.123456',
  triggerId: 'trigger_abc123'
};

await slackInterface.handleApprovalButton(interaction);
// → Modification modal opens
```

### Example 4: Process Modification Modal
```typescript
// User submits modification modal
const submission: SlackModalSubmission = {
  type: 'modification',
  approvalId: 'approval_123',
  userId: 'U12345',
  userName: 'john@example.com',
  values: {
    title: 'Deploy Auth Feature - V2',
    priority: 'critical',
    assignee: 'security-team@example.com',
    dueDate: '2025-10-18',
    additionalParams: '{"notify": true, "tags": ["security"]}'
  },
  messageTs: '1729163400.123456',
  channelId: 'C12345'
};

await slackInterface.handleModificationModal(submission);
// → Modifications collected
// → Action executed with modifications
// → Modifications recorded for learning
// → Message updated: "✅ Approved with Modifications"
```

### Example 5: Handle Reject Button
```typescript
// User clicks "Reject" button
const interaction: SlackButtonInteraction = {
  type: 'button_click',
  actionId: 'reject',
  approvalId: 'approval_123',
  userId: 'U12345',
  userName: 'john@example.com',
  channelId: 'C12345',
  messageTs: '1729163400.123456',
  triggerId: 'trigger_xyz789'
};

await slackInterface.handleApprovalButton(interaction);
// → Rejection modal opens
```

### Example 6: Process Rejection Modal
```typescript
// User submits rejection modal
const submission: SlackModalSubmission = {
  type: 'rejection',
  approvalId: 'approval_123',
  userId: 'U12345',
  userName: 'john@example.com',
  values: {
    rejectionReason: 'Feature not ready. Needs security audit first.'
  },
  messageTs: '1729163400.123456',
  channelId: 'C12345'
};

await slackInterface.handleRejectionModal(submission);
// → Rejection processed
// → Feedback sent to learning system
// → Message updated: "❌ Rejected"
```

### Example 7: Configure Slack Interface
```typescript
slackInterface.configure({
  enabled: true,
  botToken: 'xoxb-your-bot-token',
  defaultChannel: '#approvals',
  mentionOnCritical: true,
  mentionUsers: ['U12345', 'U67890'],
  includeSignalDetails: true,
  includeAlternatives: true,
  showConfidenceBar: true,
  useEmojis: true,
  simulatedMode: false // Use real Slack API
});
```

### Example 8: Integration with Approval Handler
```typescript
import approvalHandler from './workflows/approval-handler';
import slackInterface from './workflows/slack-approval-interface';

// Listen to approval queued event
approvalHandler.on('approval:queued', async (request) => {
  // Send Slack message
  await slackInterface.sendApprovalRequest(
    request.reasoningResult,
    request.id
  );
});

// Handle Slack button clicks
app.post('/slack/interactions', async (req, res) => {
  const payload = JSON.parse(req.body.payload);
  
  if (payload.type === 'block_actions') {
    const interaction = parseSlackInteraction(payload);
    await slackInterface.handleApprovalButton(interaction);
  } else if (payload.type === 'view_submission') {
    const submission = parseSlackSubmission(payload);
    
    if (submission.type === 'modification') {
      await slackInterface.handleModificationModal(submission);
    } else if (submission.type === 'rejection') {
      await slackInterface.handleRejectionModal(submission);
    }
  }
  
  res.status(200).send();
});
```

## 🔄 Interaction Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   SLACK APPROVAL FLOW                            │
└─────────────────────────────────────────────────────────────────┘

1. Approval Queued
   └─> approvalHandler.queueApproval()
       └─> Emit: 'approval:queued' event

2. Send Slack Message
   └─> slackInterface.sendApprovalRequest()
       ├─> Build rich message with:
       │   ├─> Signal information
       │   ├─> Reasoning
       │   ├─> Proposed action
       │   ├─> Confidence visualization
       │   └─> Action buttons
       └─> Send to Slack channel

3. User Sees Message
   └─> Slack displays interactive message
       └─> User clicks button

4. Button Click Handler
   └─> slackInterface.handleApprovalButton()
       ├─> If "Approve":
       │   ├─> approvalHandler.processApproval(APPROVE)
       │   ├─> Execute action immediately
       │   └─> Update message: "✅ Approved"
       │
       ├─> If "Approve with Changes":
       │   ├─> Open modification modal
       │   └─> Show input fields
       │
       └─> If "Reject":
           ├─> Open rejection modal
           └─> Ask for reason

5. Modal Submission
   └─> If Modification:
       └─> slackInterface.handleModificationModal()
           ├─> Parse modifications
           ├─> approvalHandler.processApproval(MODIFY, mods)
           ├─> Execute with modifications
           ├─> Record for learning
           └─> Update message: "✅ Approved with Mods"
   
   └─> If Rejection:
       └─> slackInterface.handleRejectionModal()
           ├─> Parse rejection reason
           ├─> approvalHandler.processApproval(REJECT, reason)
           ├─> Send feedback to learning
           └─> Update message: "❌ Rejected"

6. Learning Feedback
   └─> Feedback sent to Member 2
       ├─> Decision outcome
       ├─> Modifications made
       ├─> Rejection reason
       └─> Improves future confidence
```

## 📊 Message Components

### Header Section
- **Priority emoji**: 🟢 🟡 🟠 🔴
- **Action emoji**: 📝 ✏️ 🔍 🎴 📋 💬 📧
- **Title**: "Action Approval Required"
- **Mentions**: @user for critical approvals

### Signal Information (Optional)
- Source (slack, email, calendar)
- Subject line
- Sender information
- Channel/location
- Content excerpt

### Reasoning Section
- Why this action was chosen
- Context explanation
- Confidence factors

### Proposed Action
- Service name
- Operation type
- Key parameters preview

### Details Section
- Action identifier
- Priority level
- Risk level with emoji
- Confidence score with color

### Confidence Visualization
- Progress bar: ████████░░
- Percentage: 87%
- Color indicator: 🟢 🟡 🟠 🔴

### Parameters
- JSON formatted display
- Syntax highlighted
- Full parameter object

### Alternatives (Optional)
- List of considered actions
- Helps understand decision

### Action Buttons
- **Approve**: Primary button (green)
- **Approve with Changes**: Default button
- **Reject**: Danger button (red)

### Footer
- Approval ID (for tracking)
- Timestamp (Slack formatted)

## 🎯 Benefits

### 1. **Seamless Experience**
- No context switching
- Approve directly in Slack
- Real-time updates

### 2. **Rich Context**
- Complete signal information
- Detailed reasoning
- Visual confidence indicators

### 3. **Flexible Modifications**
- Easy to modify parameters
- Modal-based input
- JSON support for complex changes

### 4. **Learning Integration**
- Records all modifications
- Captures rejection reasons
- Improves future decisions

### 5. **Team Collaboration**
- Shared approval channel
- Mentions for critical items
- Visible to entire team

### 6. **Audit Trail**
- Message history
- Decision timestamps
- Who approved/rejected

## 🔗 Integration Points

### With Approval Handler
```typescript
// Listen to approval events
approvalHandler.on('approval:queued', async (request) => {
  await slackInterface.sendApprovalRequest(
    request.reasoningResult,
    request.id
  );
});
```

### With Web Server (Express)
```typescript
app.post('/slack/interactions', async (req, res) => {
  const payload = JSON.parse(req.body.payload);
  
  if (payload.type === 'block_actions') {
    await slackInterface.handleApprovalButton(
      parseSlackInteraction(payload)
    );
  } else if (payload.type === 'view_submission') {
    const submission = parseSlackSubmission(payload);
    
    if (submission.type === 'modification') {
      await slackInterface.handleModificationModal(submission);
    } else {
      await slackInterface.handleRejectionModal(submission);
    }
  }
  
  res.status(200).send();
});
```

### With Member 2 (Reasoning)
```typescript
// Approval request includes reasoning
const reasoningResult = {
  action: 'notion:createPage',
  reasoning: member2.getReasoningExplanation(),
  confidence: member2.getConfidence(),
  alternatives: member2.getAlternatives(),
  // ... other fields
};
```

## 📈 Configuration Options

```typescript
{
  // Enable/disable Slack integration
  enabled: true,
  
  // Slack bot token
  botToken: 'xoxb-your-bot-token',
  
  // Default approval channel
  defaultChannel: '#approvals',
  
  // Mention users for critical approvals
  mentionOnCritical: true,
  mentionUsers: ['U12345', 'U67890'],
  
  // Include signal details in message
  includeSignalDetails: true,
  
  // Show alternative actions considered
  includeAlternatives: true,
  
  // Show confidence bar visualization
  showConfidenceBar: true,
  
  // Use emoji indicators
  useEmojis: true,
  
  // Simulated mode (for testing without real Slack)
  simulatedMode: false
}
```

## 🚀 Production Deployment

### Environment Variables
```bash
# Enable Slack approvals
SLACK_APPROVALS_ENABLED=true

# Slack bot token
SLACK_BOT_TOKEN=xoxb-your-bot-token

# Approval channel
SLACK_APPROVALS_CHANNEL=#approvals

# Users to mention for critical approvals
SLACK_APPROVAL_USERS=U12345,U67890

# Simulated mode (false for production)
SLACK_SIMULATED_MODE=false
```

### Slack App Setup
1. Create Slack App in workspace
2. Enable Interactive Components
3. Set Request URL: `https://your-domain.com/slack/interactions`
4. Add Bot Token Scopes:
   - `chat:write` - Post messages
   - `chat:update` - Update messages
   - `views:open` - Open modals
5. Install app to workspace
6. Copy Bot Token to `SLACK_BOT_TOKEN`

### Webhook Endpoint
```typescript
// Express server
import express from 'express';
import slackInterface from './workflows/slack-approval-interface';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/slack/interactions', async (req, res) => {
  const payload = JSON.parse(req.body.payload);
  
  // Handle button clicks
  if (payload.type === 'block_actions') {
    const action = payload.actions[0];
    
    const interaction: SlackButtonInteraction = {
      type: 'button_click',
      actionId: action.action_id,
      approvalId: action.value,
      userId: payload.user.id,
      userName: payload.user.username,
      channelId: payload.channel.id,
      messageTs: payload.message.ts,
      responseUrl: payload.response_url,
      triggerId: payload.trigger_id
    };
    
    await slackInterface.handleApprovalButton(interaction);
  }
  
  // Handle modal submissions
  else if (payload.type === 'view_submission') {
    const callbackId = payload.view.callback_id;
    const approvalId = callbackId.split('_')[1];
    
    const values = payload.view.state.values;
    
    const submission: SlackModalSubmission = {
      type: callbackId.startsWith('modification') ? 'modification' : 'rejection',
      approvalId,
      userId: payload.user.id,
      userName: payload.user.username,
      values: {
        title: values.title_block?.title_input?.value,
        priority: values.priority_block?.priority_select?.selected_option?.value,
        assignee: values.assignee_block?.assignee_input?.value,
        dueDate: values.due_date_block?.due_date_input?.value,
        additionalParams: values.additional_params_block?.additional_params_input?.value,
        rejectionReason: values.rejection_reason_block?.rejection_reason_input?.value
      },
      messageTs: payload.view.private_metadata,
      channelId: payload.view.private_metadata
    };
    
    if (submission.type === 'modification') {
      await slackInterface.handleModificationModal(submission);
    } else {
      await slackInterface.handleRejectionModal(submission);
    }
  }
  
  res.status(200).send();
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## ✅ Success Criteria

All requirements met:
- ✅ Sends interactive Slack messages for approvals
- ✅ `sendApprovalRequest()` creates message with:
  - ✅ Signal summary (source, subject, content excerpt)
  - ✅ Reasoning (why action was chosen)
  - ✅ Proposed action (detailed description)
  - ✅ Confidence score with visual indicator
  - ✅ Action buttons: [Approve] [Approve with Changes] [Reject]
- ✅ `handleApprovalButton()` implementation:
  - ✅ Parses button click
  - ✅ If "Approve": execute immediately, update to "✅ Approved"
  - ✅ If "Approve with Changes": open modal for modifications
  - ✅ If "Reject": open modal for rejection reason
- ✅ `handleModificationModal()` implementation:
  - ✅ Collects user modifications (title, priority, assignee)
  - ✅ Executes action with modifications
  - ✅ Records modifications for learning

## 📊 Project Status

**21 of 21 Prompts Complete!** 🎉

**Human-in-the-Loop Infrastructure**: 2,400+ lines, 60+ functions

**Next Steps**:
1. Deploy Slack app to workspace
2. Configure webhook endpoints
3. Integration testing with real Slack
4. Production deployment
5. User training and documentation

---

*Slack Approval Interface - Seamless approvals in your workflow* ✅
