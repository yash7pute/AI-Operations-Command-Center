/**
 * Action Decision Prompt Templates
 * 
 * Generates prompts for LLM to decide which actions to take based on classified signals.
 * Includes system prompts, few-shot examples, and context-aware prompt building.
 * 
 * @module agents/prompts/action-prompts
 */

import { getTokenManager } from '../llm/token-manager';
import logger from '../../utils/logger';
import type { SignalClassification } from '../llm/output-validator';

// ============================================================================
// Types
// ============================================================================

/**
 * Signal content for action decision
 */
export interface SignalContent {
    source: 'email' | 'slack' | 'sheets';
    subject?: string;
    body: string;
    sender?: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
}

/**
 * Current context for decision making
 */
export interface ActionContext {
    existingTasks?: Array<{
        title: string;
        priority: number;
        status: string;
    }>;
    teamAvailability?: {
        available: number;
        busy: number;
        offline: number;
    };
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    dayOfWeek?: 'weekday' | 'weekend';
    recentActions?: Array<{
        action: string;
        target: string;
        timestamp: string;
    }>;
}

/**
 * Action decision example for few-shot learning
 */
interface ActionExample {
    scenario: string;
    signal: SignalContent;
    classification: SignalClassification;
    context?: ActionContext;
    decision: {
        action: string;
        target: string;
        params: Record<string, unknown>;
        priority: number;
        reasoning: string;
        requiresApproval: boolean;
    };
}

// ============================================================================
// System Prompt
// ============================================================================

const ACTION_SYSTEM_PROMPT = `You are an AI Operations Orchestrator for an enterprise command center.

Your role is to analyze classified signals and decide the optimal action to take. You have access to multiple automation platforms (Notion, Trello, Google Sheets, Google Drive, Slack) and must choose the best action and target for each situation.

## Action Decision Framework

### 1. Action Types
Choose the appropriate action based on signal characteristics:

- **create_task**: For actionable items requiring tracking and completion
  - Use for: bugs, feature requests, action items, deadlines, assignments
  - Creates a task in Notion (for complex projects) or Trello (for simple tasks)

- **send_notification**: For informational items requiring immediate awareness
  - Use for: alerts, announcements, time-sensitive updates, status changes
  - Sends Slack message to relevant channel

- **update_sheet**: For data that belongs in structured storage
  - Use for: metrics, KPIs, logs, reports, time series data
  - Updates Google Sheets with new row or cell data

- **file_document**: For reference materials requiring organized storage
  - Use for: invoices, contracts, reports, meeting notes, documentation
  - Saves to Google Drive with proper folder structure

- **delegate**: For items requiring human decision or routing to specific team
  - Use for: ambiguous requests, cross-functional issues, escalations
  - Notifies relevant team lead or manager

- **ignore**: For non-actionable content
  - Use for: spam, marketing, out-of-office replies, duplicates
  - No action taken, logged for audit

### 2. Target Platform Selection

**Notion** (database-driven, complex projects):
- Multi-step projects with dependencies
- Cross-functional initiatives
- Long-term tracking with custom properties
- Team collaboration with comments and mentions

**Trello** (board-based, simple tasks):
- Quick action items
- Individual assignments
- Visual kanban workflows
- Time-sensitive tasks with clear completion

**Google Sheets** (structured data):
- Numeric data and calculations
- Time series tracking
- Dashboard data sources
- Bulk data updates

**Google Drive** (document storage):
- File organization by category/date
- Document versioning
- Shared access with permissions
- Long-term archival

**Slack** (real-time communication):
- Urgent notifications
- Team announcements
- Status updates
- Quick questions

### 3. Priority Assignment (1-5)

- **Priority 1** (Drop Everything): Production outages, security breaches, critical bugs
- **Priority 2** (Today): High-impact bugs, CEO requests, deadline-driven tasks
- **Priority 3** (This Week): Standard tasks, feature requests, routine updates
- **Priority 4** (This Month): Nice-to-have improvements, documentation, cleanup
- **Priority 5** (When Convenient): Low-impact items, future considerations

Consider:
- Urgency from classification (critical → priority 1-2, high → 2-3, medium → 3-4, low → 4-5)
- Business impact (revenue, customers, compliance)
- Dependencies (blocking other work)
- Team capacity (don't overload with priority 1-2)

### 4. Approval Requirements

Set **requiresApproval: true** for:
- Financial actions (>$1000, budget changes, purchases)
- External communication (customer emails, public announcements)
- Data deletion or destructive operations
- Policy changes or compliance-related actions
- Cross-team resource allocation

Set **requiresApproval: false** for:
- Routine task creation
- Internal notifications
- Data logging and updates
- Standard file organization
- Normal operational tasks

### 5. Context Awareness

Consider the current context when making decisions:
- **Time of Day**: Avoid urgent notifications during night/weekend unless critical
- **Team Availability**: Delegate if no one available; queue for later
- **Existing Tasks**: Check if similar task already exists; update instead of creating duplicate
- **Recent Actions**: Avoid redundant actions (e.g., already notified about same issue)

## Output Format

You MUST respond with valid JSON matching this schema:
{
  "action": "create_task" | "send_notification" | "update_sheet" | "file_document" | "delegate" | "ignore",
  "target": "notion" | "trello" | "slack" | "sheets" | "drive" | string,
  "params": {
    // Action-specific parameters
    // For create_task: { database: string, title: string, description: string, assignee?: string, dueDate?: string, labels?: string[] }
    // For send_notification: { channel: string, message: string, mentions?: string[] }
    // For update_sheet: { spreadsheetId: string, range: string, values: any[][] }
    // For file_document: { folderId: string, fileName: string, content: string }
    // For delegate: { team: string, reason: string }
    // For ignore: { reason: string }
  },
  "priority": 1 | 2 | 3 | 4 | 5,
  "reasoning": "Clear explanation of why this action and target were chosen",
  "requiresApproval": true | false
}

## Decision Process

1. Analyze the signal content and classification
2. Consider the current context (time, team, existing tasks)
3. Choose the most appropriate action type
4. Select the best target platform
5. Determine priority based on urgency, importance, and impact
6. Decide if approval is required
7. Construct action-specific parameters
8. Provide clear reasoning for the decision

Be pragmatic and efficient. Choose actions that minimize human overhead while maintaining quality and safety.`;

// ============================================================================
// Few-Shot Examples
// ============================================================================

const ACTION_EXAMPLES: ActionExample[] = [
    // Example 1: Critical Bug - Immediate Action
    {
        scenario: 'Critical production bug reported',
        signal: {
            source: 'email',
            subject: 'URGENT: Payment processing down',
            body: 'Multiple customers reporting failed payments. Error: "Gateway timeout". Started 10 minutes ago.',
            sender: 'monitoring@company.com',
            timestamp: '2025-10-16T10:30:00Z',
        },
        classification: {
            type: 'email',
            urgency: 'critical',
            importance: 'high',
            category: 'alert',
            confidence: 0.98,
            reasoning: 'Production system failure affecting revenue',
        },
        decision: {
            action: 'create_task',
            target: 'trello',
            params: {
                board: 'incident-response',
                title: '🚨 CRITICAL: Payment processing down',
                description: 'Multiple customers reporting failed payments. Error: "Gateway timeout". Started at 10:20 AM.\n\nImmediate investigation required.',
                assignee: 'backend-oncall',
                labels: ['critical', 'production', 'payments'],
            },
            priority: 1,
            reasoning: 'Critical production issue affecting revenue requires immediate task creation in Trello for quick action tracking. Using Trello over Notion for speed.',
            requiresApproval: false,
        },
    },

    // Example 2: CEO Request - High Priority with Approval
    {
        scenario: 'CEO requests budget reallocation',
        signal: {
            source: 'email',
            subject: 'Q4 Budget Adjustment Needed',
            body: 'Need to reallocate $50K from marketing to engineering for the new AI initiative. Please prepare proposal by Friday.',
            sender: 'ceo@company.com',
            timestamp: '2025-10-16T09:00:00Z',
        },
        classification: {
            type: 'email',
            urgency: 'high',
            importance: 'high',
            category: 'task',
            confidence: 0.95,
            reasoning: 'CEO request for significant budget change with deadline',
        },
        decision: {
            action: 'create_task',
            target: 'notion',
            params: {
                database: 'finance-projects',
                title: 'Q4 Budget Reallocation: Marketing to Engineering ($50K)',
                description: 'CEO requested budget reallocation for AI initiative.\n\nAmount: $50,000\nFrom: Marketing budget\nTo: Engineering budget\nDeadline: Friday EOD\n\nRequires finance team proposal and executive approval.',
                assignee: 'cfo@company.com',
                dueDate: '2025-10-18T17:00:00Z',
                labels: ['budget', 'executive', 'q4', 'high-priority'],
                properties: {
                    'Request Type': 'Budget Change',
                    'Amount': '$50,000',
                    'Requester': 'CEO',
                },
            },
            priority: 2,
            reasoning: 'High-priority executive request for budget change requires structured tracking in Notion. Significant financial impact requires approval before execution.',
            requiresApproval: true,
        },
    },

    // Example 3: Weekly Metrics - Routine Data Update
    {
        scenario: 'Weekly performance metrics received',
        signal: {
            source: 'slack',
            body: 'Week 42 metrics: 1,250 active users (+5%), 98.5% uptime, 45 support tickets (-12%), $125K revenue (+8%)',
            sender: 'metrics-bot',
            timestamp: '2025-10-16T08:00:00Z',
        },
        classification: {
            type: 'slack',
            urgency: 'medium',
            importance: 'medium',
            category: 'report',
            confidence: 0.92,
            reasoning: 'Routine weekly metrics for tracking and dashboards',
        },
        context: {
            timeOfDay: 'morning',
            dayOfWeek: 'weekday',
        },
        decision: {
            action: 'update_sheet',
            target: 'sheets',
            params: {
                spreadsheetId: 'metrics-dashboard-2025',
                range: 'Weekly Metrics!A:F',
                values: [
                    ['2025-10-16', 1250, 98.5, 45, 125000, 'Week 42'],
                ],
            },
            priority: 3,
            reasoning: 'Routine metrics belong in structured Google Sheets for dashboard tracking and trend analysis. Standard weekly update requires no approval.',
            requiresApproval: false,
        },
    },

    // Example 4: Invoice Storage
    {
        scenario: 'Vendor invoice received via email',
        signal: {
            source: 'email',
            subject: 'Invoice #INV-2025-1234 from AWS',
            body: 'Please find attached invoice for October cloud services. Amount: $8,450.00. Due: November 15, 2025.',
            sender: 'billing@aws.amazon.com',
            timestamp: '2025-10-16T11:00:00Z',
            metadata: {
                hasAttachment: true,
                attachmentName: 'AWS-INV-2025-1234.pdf',
            },
        },
        classification: {
            type: 'email',
            urgency: 'low',
            importance: 'medium',
            category: 'task',
            confidence: 0.90,
            reasoning: 'Invoice for routine cloud services requiring filing and payment processing',
        },
        decision: {
            action: 'file_document',
            target: 'drive',
            params: {
                folderId: 'finance/invoices/2025-10',
                fileName: 'AWS-Invoice-October-2025.pdf',
                metadata: {
                    vendor: 'AWS',
                    amount: 8450.00,
                    invoiceNumber: 'INV-2025-1234',
                    dueDate: '2025-11-15',
                    category: 'Cloud Services',
                },
            },
            priority: 4,
            reasoning: 'Invoice should be filed in Drive under proper folder structure for accounting. Routine vendor invoice does not require immediate action.',
            requiresApproval: false,
        },
    },

    // Example 5: Spam Email
    {
        scenario: 'Marketing spam received',
        signal: {
            source: 'email',
            subject: '🎉 50% OFF Premium LinkedIn Subscription!',
            body: 'Limited time offer! Upgrade now and save big on LinkedIn Premium. Click here to claim your discount...',
            sender: 'marketing@linkedin-offers.com',
            timestamp: '2025-10-16T14:30:00Z',
        },
        classification: {
            type: 'email',
            urgency: 'low',
            importance: 'low',
            category: 'notification',
            confidence: 0.88,
            reasoning: 'Promotional marketing email with no business relevance',
        },
        decision: {
            action: 'ignore',
            target: 'none',
            params: {
                reason: 'Marketing spam with no business value',
            },
            priority: 5,
            reasoning: 'Promotional email with no actionable business content should be ignored to avoid noise.',
            requiresApproval: false,
        },
    },

    // Example 6: Meeting Request - Create Task
    {
        scenario: 'Important client meeting request',
        signal: {
            source: 'email',
            subject: 'Meeting: Q1 Planning with Enterprise Client',
            body: 'Hi team, our largest client wants to discuss Q1 roadmap and expansion plans. Available dates: Oct 23-25. Need deck preparation.',
            sender: 'sales-lead@company.com',
            timestamp: '2025-10-16T15:00:00Z',
        },
        classification: {
            type: 'email',
            urgency: 'high',
            importance: 'high',
            category: 'meeting',
            confidence: 0.94,
            reasoning: 'Important client meeting requiring preparation and coordination',
        },
        decision: {
            action: 'create_task',
            target: 'notion',
            params: {
                database: 'client-success',
                title: 'Q1 Planning Meeting with Enterprise Client',
                description: 'Prepare for strategic planning meeting with largest client.\n\nAvailable dates: Oct 23-25\nRequired: Presentation deck covering Q1 roadmap and expansion options\n\nStakeholders: Sales, Product, Engineering leads',
                assignee: 'product-manager@company.com',
                dueDate: '2025-10-22T17:00:00Z',
                labels: ['client-meeting', 'enterprise', 'q1-planning', 'high-priority'],
            },
            priority: 2,
            reasoning: 'High-importance client meeting requires structured preparation in Notion with clear deliverables and stakeholder coordination.',
            requiresApproval: false,
        },
    },

    // Example 7: Security Alert - Immediate Notification
    {
        scenario: 'Security vulnerability detected',
        signal: {
            source: 'slack',
            body: '⚠️ Security scan detected critical vulnerability CVE-2024-1234 in production dependency. CVSS score: 9.8. Patch available.',
            sender: 'security-bot',
            timestamp: '2025-10-16T16:45:00Z',
        },
        classification: {
            type: 'slack',
            urgency: 'critical',
            importance: 'high',
            category: 'alert',
            confidence: 0.97,
            reasoning: 'Critical security vulnerability requiring immediate awareness and action',
        },
        decision: {
            action: 'send_notification',
            target: 'slack',
            params: {
                channel: 'security-incidents',
                message: '🚨 CRITICAL SECURITY ALERT\n\nVulnerability: CVE-2024-1234\nSeverity: CVSS 9.8 (Critical)\nStatus: Patch available\n\n@security-team @engineering-leads - Immediate review required',
                mentions: ['security-team', 'engineering-leads'],
                priority: 'high',
            },
            priority: 1,
            reasoning: 'Critical security issue requires immediate Slack notification to security team for rapid response. Task creation will follow after initial assessment.',
            requiresApproval: false,
        },
    },

    // Example 8: Team Announcement - Low Priority
    {
        scenario: 'New office amenity announcement',
        signal: {
            source: 'email',
            subject: 'FYI: New espresso machine in 3rd floor break room',
            body: 'Good news! We\'ve installed a new espresso machine. Enjoy! Instructions posted on the wall.',
            sender: 'facilities@company.com',
            timestamp: '2025-10-16T12:00:00Z',
        },
        classification: {
            type: 'email',
            urgency: 'low',
            importance: 'low',
            category: 'notification',
            confidence: 0.85,
            reasoning: 'Non-urgent informational announcement about office amenity',
        },
        decision: {
            action: 'ignore',
            target: 'none',
            params: {
                reason: 'Informational announcement with no required action',
            },
            priority: 5,
            reasoning: 'Office amenity announcement is informational only and does not require any action or task creation.',
            requiresApproval: false,
        },
    },

    // Example 9: Data Request - Delegate
    {
        scenario: 'Ambiguous cross-functional data request',
        signal: {
            source: 'slack',
            body: 'Hey, can someone pull the data on customer churn for the new feature? Not sure if this is analytics or product team\'s responsibility.',
            sender: 'marketing-manager',
            timestamp: '2025-10-16T13:30:00Z',
        },
        classification: {
            type: 'slack',
            urgency: 'medium',
            importance: 'medium',
            category: 'question',
            confidence: 0.70,
            reasoning: 'Data request with unclear ownership requiring routing',
        },
        decision: {
            action: 'delegate',
            target: 'analytics-lead@company.com',
            params: {
                team: 'analytics',
                originalRequest: 'Customer churn data for new feature',
                requester: 'marketing-manager',
                reason: 'Cross-functional data request requiring analytics team expertise',
                suggestedAction: 'Clarify requirements and assign to appropriate analyst',
            },
            priority: 3,
            reasoning: 'Ambiguous data request with unclear ownership should be delegated to analytics lead for proper routing and requirement clarification.',
            requiresApproval: false,
        },
    },

    // Example 10: Customer Complaint - High Priority
    {
        scenario: 'Escalated customer complaint',
        signal: {
            source: 'email',
            subject: 'RE: Escalation - Data Export Issue',
            body: 'This is the 3rd time I\'m reporting this. Your export feature has been broken for 2 weeks. Our compliance audit is next week and we NEED our data. This is unacceptable.',
            sender: 'enterprise-customer@bigcorp.com',
            timestamp: '2025-10-16T10:00:00Z',
        },
        classification: {
            type: 'email',
            urgency: 'high',
            importance: 'high',
            category: 'alert',
            confidence: 0.96,
            reasoning: 'Escalated customer complaint about broken feature affecting compliance',
        },
        decision: {
            action: 'create_task',
            target: 'trello',
            params: {
                board: 'customer-escalations',
                title: '🔥 ESCALATION: Data export broken for enterprise customer',
                description: 'Enterprise customer (bigcorp.com) escalating data export issue.\n\nContext:\n- Issue reported 3 times over 2 weeks\n- Blocking compliance audit next week\n- Customer frustration level: HIGH\n\nRequires:\n1. Immediate engineer assignment\n2. Customer communication with ETA\n3. Workaround if fix takes >24 hours',
                assignee: 'support-lead',
                labels: ['escalation', 'enterprise', 'bug', 'urgent'],
                dueDate: '2025-10-17T17:00:00Z',
            },
            priority: 1,
            reasoning: 'Escalated enterprise customer issue affecting compliance requires immediate task creation in Trello for rapid response. Using Trello for visibility and quick assignment.',
            requiresApproval: false,
        },
    },

    // Example 11: Report Request - Medium Priority
    {
        scenario: 'Monthly report generation request',
        signal: {
            source: 'slack',
            body: 'Can we get the monthly revenue breakdown by region? Need it for board meeting next Thursday.',
            sender: 'finance-director',
            timestamp: '2025-10-16T14:00:00Z',
        },
        classification: {
            type: 'slack',
            urgency: 'medium',
            importance: 'high',
            category: 'report',
            confidence: 0.89,
            reasoning: 'Important report request with clear deadline for board meeting',
        },
        decision: {
            action: 'create_task',
            target: 'notion',
            params: {
                database: 'finance-requests',
                title: 'Monthly Revenue Breakdown by Region - Board Meeting',
                description: 'Generate monthly revenue report broken down by geographic region.\n\nDeliverable: Revenue analysis report\nDeadline: Next Thursday (before board meeting)\nFormat: Presentation-ready slides or PDF\n\nRequester: Finance Director',
                assignee: 'finance-analyst@company.com',
                dueDate: '2025-10-24T12:00:00Z',
                labels: ['report', 'board-meeting', 'revenue', 'finance'],
            },
            priority: 3,
            reasoning: 'Report request for board meeting requires task tracking in Notion with clear deadline. Medium-high priority given board meeting context.',
            requiresApproval: false,
        },
    },

    // Example 12: System Maintenance - Notification
    {
        scenario: 'Scheduled maintenance notification',
        signal: {
            source: 'email',
            subject: 'Scheduled Maintenance: Database Upgrade Sunday 2 AM',
            body: 'Planned database maintenance window this Sunday 2-4 AM. Expect 2 hours downtime. All users will be notified.',
            sender: 'infrastructure@company.com',
            timestamp: '2025-10-16T09:30:00Z',
        },
        classification: {
            type: 'email',
            urgency: 'medium',
            importance: 'medium',
            category: 'notification',
            confidence: 0.91,
            reasoning: 'Scheduled maintenance requiring team awareness',
        },
        decision: {
            action: 'send_notification',
            target: 'slack',
            params: {
                channel: 'general',
                message: '📅 SCHEDULED MAINTENANCE\n\nDatabase upgrade scheduled for:\n🕐 Sunday, Oct 20, 2:00 AM - 4:00 AM\n⏱️ Expected downtime: 2 hours\n\nAll services will be unavailable during this window. Plan accordingly!',
                priority: 'normal',
            },
            priority: 3,
            reasoning: 'Scheduled maintenance requires Slack notification for team awareness. Non-urgent but important for planning.',
            requiresApproval: false,
        },
    },

    // Example 13: Policy Update - Approval Required
    {
        scenario: 'Company policy change proposal',
        signal: {
            source: 'email',
            subject: 'Proposal: Remote Work Policy Update',
            body: 'Proposing change to remote work policy: increase from 2 to 3 days/week remote. Based on employee survey results and productivity data.',
            sender: 'hr-director@company.com',
            timestamp: '2025-10-16T11:30:00Z',
        },
        classification: {
            type: 'email',
            urgency: 'medium',
            importance: 'high',
            category: 'task',
            confidence: 0.93,
            reasoning: 'Significant policy change proposal requiring review and approval',
        },
        decision: {
            action: 'create_task',
            target: 'notion',
            params: {
                database: 'hr-initiatives',
                title: 'Policy Update: Remote Work Days (2 → 3 days/week)',
                description: 'Proposal to increase remote work allowance based on survey results.\n\nCurrent: 2 days/week remote\nProposed: 3 days/week remote\n\nSupporting data:\n- Employee survey feedback\n- Productivity metrics\n\nRequires:\n- Executive review and approval\n- Legal review for compliance\n- Communication plan',
                assignee: 'hr-director@company.com',
                labels: ['policy', 'remote-work', 'hr', 'executive-review'],
                properties: {
                    'Approval Status': 'Pending',
                    'Impact Level': 'Company-wide',
                },
            },
            priority: 3,
            reasoning: 'Policy change affecting all employees requires structured tracking in Notion with executive approval before implementation.',
            requiresApproval: true,
        },
    },

    // Example 14: Bug Report - Create Task
    {
        scenario: 'User-reported bug',
        signal: {
            source: 'slack',
            body: 'Users reporting that the search feature returns no results when filtering by date range. Seems to work fine without filters.',
            sender: 'support-agent',
            timestamp: '2025-10-16T15:45:00Z',
        },
        classification: {
            type: 'slack',
            urgency: 'medium',
            importance: 'medium',
            category: 'task',
            confidence: 0.88,
            reasoning: 'Feature bug affecting user experience but not blocking critical functionality',
        },
        decision: {
            action: 'create_task',
            target: 'trello',
            params: {
                board: 'product-bugs',
                title: 'Bug: Search returns no results with date filter',
                description: 'Search feature broken when date range filter is applied.\n\nReproduction:\n1. Go to search\n2. Apply date range filter\n3. Search returns 0 results (should return filtered results)\n\nWorkaround: Search without date filter works fine\n\nReported by: Support team (multiple users affected)',
                labels: ['bug', 'search', 'filters', 'medium-priority'],
            },
            priority: 3,
            reasoning: 'Bug affecting user experience should be tracked in Trello for investigation and fix. Medium priority as workaround exists.',
            requiresApproval: false,
        },
    },

    // Example 15: Document Request - File Document
    {
        scenario: 'Meeting notes for archival',
        signal: {
            source: 'email',
            subject: 'Meeting Notes: Product Roadmap Review Oct 16',
            body: 'Attached are the notes from today\'s product roadmap review meeting. Key decisions: prioritize mobile app, defer API v2 to Q2.',
            sender: 'product-manager@company.com',
            timestamp: '2025-10-16T17:00:00Z',
            metadata: {
                hasAttachment: true,
                attachmentName: 'roadmap-review-notes-2025-10-16.docx',
            },
        },
        classification: {
            type: 'email',
            urgency: 'low',
            importance: 'medium',
            category: 'report',
            confidence: 0.87,
            reasoning: 'Meeting notes for documentation and future reference',
        },
        decision: {
            action: 'file_document',
            target: 'drive',
            params: {
                folderId: 'product/meetings/2025-10',
                fileName: 'Product-Roadmap-Review-2025-10-16.docx',
                metadata: {
                    meetingDate: '2025-10-16',
                    meetingType: 'Product Roadmap Review',
                    attendees: ['product-manager', 'engineering-lead', 'design-lead'],
                    keyDecisions: ['Prioritize mobile app', 'Defer API v2 to Q2'],
                },
            },
            priority: 4,
            reasoning: 'Meeting notes should be filed in Drive under product meetings folder for future reference and knowledge management.',
            requiresApproval: false,
        },
    },
];

// ============================================================================
// Prompt Builder
// ============================================================================

/**
 * Build action decision prompt
 * 
 * @param signal - Signal content
 * @param classification - Classification results
 * @param context - Current operational context
 * @returns Complete prompt for LLM
 */
export function actionDecisionPrompt(
    signal: SignalContent,
    classification: SignalClassification,
    context?: ActionContext
): string {
    const tokenManager = getTokenManager();

    // Build context section
    let contextSection = '';
    if (context) {
        contextSection = '\n## Current Context\n\n';

        if (context.timeOfDay && context.dayOfWeek) {
            contextSection += `**Time**: ${context.timeOfDay} on a ${context.dayOfWeek}\n`;
        }

        if (context.teamAvailability) {
            contextSection += `**Team Availability**: ${context.teamAvailability.available} available, ${context.teamAvailability.busy} busy, ${context.teamAvailability.offline} offline\n`;
        }

        if (context.existingTasks && context.existingTasks.length > 0) {
            contextSection += '\n**Existing Tasks** (check for duplicates):\n';
            context.existingTasks.slice(0, 5).forEach(task => {
                contextSection += `- [P${task.priority}] ${task.title} (${task.status})\n`;
            });
            if (context.existingTasks.length > 5) {
                contextSection += `- ... and ${context.existingTasks.length - 5} more tasks\n`;
            }
        }

        if (context.recentActions && context.recentActions.length > 0) {
            contextSection += '\n**Recent Actions** (avoid duplicates):\n';
            context.recentActions.slice(0, 3).forEach(action => {
                const timeAgo = new Date(action.timestamp).toLocaleString();
                contextSection += `- ${action.action} → ${action.target} at ${timeAgo}\n`;
            });
        }
    }

    // Build examples section (few-shot learning)
    const examplesSection = '\n## Decision Examples\n\n' +
        ACTION_EXAMPLES.map((example, index) => {
            return `### Example ${index + 1}: ${example.scenario}

**Signal**:
- Source: ${example.signal.source}
${example.signal.subject ? `- Subject: ${example.signal.subject}\n` : ''}- Content: ${example.signal.body}
${example.signal.sender ? `- Sender: ${example.signal.sender}\n` : ''}
**Classification**:
- Urgency: ${example.classification.urgency}
- Importance: ${example.classification.importance}
- Category: ${example.classification.category}
- Confidence: ${example.classification.confidence}

**Decision**:
\`\`\`json
${JSON.stringify(example.decision, null, 2)}
\`\`\`
`;
        }).join('\n');

    // Build signal section
    const signalSection = `
## Signal to Analyze

**Source**: ${signal.source}
${signal.subject ? `**Subject**: ${signal.subject}\n` : ''}**Content**: ${signal.body}
${signal.sender ? `**Sender**: ${signal.sender}\n` : ''}**Timestamp**: ${signal.timestamp}
${signal.metadata ? `**Metadata**: ${JSON.stringify(signal.metadata, null, 2)}\n` : ''}
## Classification Results

- **Type**: ${classification.type}
- **Urgency**: ${classification.urgency}
- **Importance**: ${classification.importance}
- **Category**: ${classification.category}
- **Confidence**: ${classification.confidence}
- **Reasoning**: ${classification.reasoning}
`;

    // Build complete prompt
    const fullPrompt = `${ACTION_SYSTEM_PROMPT}
${examplesSection}
${contextSection}
${signalSection}

## Your Task

Based on the signal, classification, and context above, decide the optimal action to take.

Respond with ONLY valid JSON matching the ActionDecision schema. No additional text or explanation outside the JSON.`;

    // Validate prompt length
    const tokenCount = tokenManager.countTokens(fullPrompt);
    const maxTokens = 16000; // Leave room for response

    if (tokenCount > maxTokens) {
        logger.warn(`[ActionPrompts] Prompt too long: ${tokenCount} tokens (max: ${maxTokens})`);
        // Could truncate examples or context here if needed
    } else {
        logger.debug(`[ActionPrompts] Generated prompt: ${tokenCount} tokens`);
    }

    return fullPrompt;
}

/**
 * Validate prompt length
 * 
 * @param prompt - Prompt to validate
 * @param maxTokens - Maximum allowed tokens (default: 16000)
 * @returns Validation result
 */
export function validatePromptLength(prompt: string, maxTokens: number = 16000): {
    valid: boolean;
    tokenCount: number;
    maxTokens: number;
    message: string;
} {
    const tokenManager = getTokenManager();
    const tokenCount = tokenManager.countTokens(prompt);
    const valid = tokenCount <= maxTokens;

    return {
        valid,
        tokenCount,
        maxTokens,
        message: valid
            ? `Prompt is valid (${tokenCount}/${maxTokens} tokens)`
            : `Prompt exceeds limit (${tokenCount}/${maxTokens} tokens). Consider reducing examples or context.`,
    };
}

/**
 * Get action examples for reference
 * 
 * @returns Array of action examples
 */
export function getActionExamples(): ActionExample[] {
    return ACTION_EXAMPLES;
}

/**
 * Get system prompt for reference
 * 
 * @returns System prompt text
 */
export function getActionSystemPrompt(): string {
    return ACTION_SYSTEM_PROMPT;
}
