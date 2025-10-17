/**
 * Task Extraction Prompt Templates
 * 
 * Generates prompts for LLM to extract structured task information from signals.
 * Handles date parsing, title generation, assignee detection, and label inference.
 * 
 * @module agents/prompts/task-extraction-prompts
 */

import { getTokenManager } from '../llm/token-manager';
import logger from '../../utils/logger';
import type { SignalClassification } from '../llm/output-validator';

// ============================================================================
// Types
// ============================================================================

/**
 * Signal content for task extraction
 */
export interface TaskSignal {
    source: 'email' | 'slack' | 'sheets';
    subject?: string;
    body: string;
    sender?: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
}

/**
 * Task extraction example for few-shot learning
 */
interface TaskExtractionExample {
    scenario: string;
    signal: TaskSignal;
    classification?: SignalClassification;
    extractedTask: {
        title: string;
        description: string;
        dueDate?: string;
        assignee?: string;
        labels: string[];
        project?: string;
    };
}

/**
 * Date inference context
 */
interface DateContext {
    currentDate: Date;
    currentTime: string;
}

// ============================================================================
// System Prompt
// ============================================================================

const TASK_EXTRACTION_SYSTEM_PROMPT = `You are an AI Task Extraction Assistant for an enterprise operations system.

Your role is to analyze incoming signals and extract structured task information that can be used to create actionable tasks in project management systems (Notion, Trello, etc.).

## Extraction Guidelines

### 1. Title Extraction
Create concise, actionable titles that clearly describe the task:

**Naming Conventions**:
- Start with action verbs: Review, Create, Fix, Update, Implement, Analyze, Schedule, Send, Deploy
- Keep under 200 characters
- Be specific but concise
- Include key context (what, not how)

**Examples**:
- ✅ "Review Q4 budget proposal"
- ❌ "Someone needs to look at the budget thing"
- ✅ "Fix mobile app login bug"
- ❌ "Mobile login not working"
- ✅ "Deploy v2.1.0 to production"
- ❌ "Production deployment"

### 2. Description Extraction
Build comprehensive descriptions including:

**Required Elements**:
- **Context**: Background information, why this task exists
- **Requirements**: What needs to be done, specific deliverables
- **Success Criteria**: How to know when task is complete
- **Additional Details**: Any constraints, dependencies, or notes

**Minimum Length**: 10 characters (enforce this strictly)

**Example Structure**:
\`\`\`
Context: Why this task exists

Requirements:
- Specific deliverable 1
- Specific deliverable 2

Success Criteria:
- How to verify completion

Notes: Any additional context
\`\`\`

### 3. Due Date Inference
Parse dates from natural language and context:

**Common Patterns**:
- "EOD" or "end of day" → Today at 5:00 PM (17:00)
- "COB" or "close of business" → Today at 5:00 PM (17:00)
- "tomorrow" → Next calendar day at 9:00 AM
- "next week" → Following Monday at 9:00 AM
- "next Monday/Tuesday/etc" → Next occurrence of that day at 9:00 AM
- "by Friday" → This coming Friday at 5:00 PM
- "in 2 days" → 2 days from now at 9:00 AM
- "next month" → First day of next month at 9:00 AM
- Specific dates: "Oct 25", "10/25", "2025-10-25" → Specified date at 9:00 AM

**Date Format**: Always output ISO 8601 format: "YYYY-MM-DDTHH:MM:SSZ"

**Current Date Reference**: Use the signal timestamp as reference point for relative dates

**If No Date Found**: Leave dueDate as undefined (don't make up dates)

### 4. Assignee Detection
Extract assignee from signal content:

**Detection Methods**:
- Email mentions: "@john.doe", "@team-lead"
- Direct assignments: "John, can you...", "Please have Sarah..."
- Role-based: "backend team", "design lead", "on-call engineer"
- Email addresses: "john@company.com"

**Format**: Use email format when possible: "user@company.com"

**If Multiple Assignees**: Choose the primary assignee (the one with main responsibility)

**If No Assignee**: Leave undefined (task will be assigned manually)

### 5. Label Inference
Generate relevant labels based on content analysis:

**Label Categories**:
- **Type**: bug, feature, task, documentation, meeting, review, deployment
- **Priority**: urgent, high-priority, low-priority, routine
- **Area**: frontend, backend, infrastructure, mobile, api, database
- **Status**: blocked, waiting, in-progress (only if explicitly mentioned)
- **Category**: Based on signal category (report, alert, question, etc.)

**Rules**:
- Use lowercase, hyphen-separated format: "high-priority", not "High Priority"
- 2-5 labels per task (avoid over-labeling)
- Include signal category as a label
- Add urgency-based labels from classification

### 6. Project Inference
Determine which project/workspace this task belongs to:

**Inference Methods**:
- Direct mentions: "for the mobile app project", "Q4 initiative"
- Context clues: "customer dashboard" → "Dashboard Project"
- Subject/title keywords: "API v2" → "API Development"
- Sender's team/role: from "product@..." → "Product Backlog"

**Format**: Title case, clear project name

**If Unclear**: Leave undefined (will be assigned during task creation)

## Output Format

You MUST respond with valid JSON matching this schema:
{
  "title": "Actionable verb + concise description (3-200 chars)",
  "description": "Detailed context and requirements (10-2000 chars)",
  "dueDate": "2025-10-25T17:00:00Z" | undefined,
  "assignee": "user@company.com" | undefined,
  "labels": ["label1", "label2", "label3"],
  "project": "Project Name" | undefined
}

## Extraction Process

1. Read and understand the signal content
2. Identify the core task or action item
3. Generate concise, action-oriented title
4. Extract or build comprehensive description
5. Parse and infer due date from text
6. Detect assignee from mentions or context
7. Infer relevant labels based on content
8. Determine project from context
9. Validate against schema (especially string lengths)
10. Return valid JSON

Be thorough but pragmatic. Extract all available information, but don't invent details that aren't in the signal.`;

// ============================================================================
// Few-Shot Examples
// ============================================================================

const TASK_EXTRACTION_EXAMPLES: TaskExtractionExample[] = [
    // Example 1: Simple task with deadline
    {
        scenario: 'Review request with specific deadline',
        signal: {
            source: 'email',
            subject: 'Q4 Proposal Review',
            body: 'Can you review the Q4 budget proposal by Friday? Need your feedback on the infrastructure spending section.',
            sender: 'cfo@company.com',
            timestamp: '2025-10-16T10:00:00Z',
        },
        extractedTask: {
            title: 'Review Q4 budget proposal',
            description: 'Review the Q4 budget proposal with focus on infrastructure spending section.\n\nRequested by: CFO\nDeadline: Friday EOD\n\nSuccess criteria: Provide feedback on infrastructure spending allocations',
            dueDate: '2025-10-18T17:00:00Z',
            labels: ['review', 'budget', 'q4', 'proposal'],
            project: 'Q4 Planning',
        },
    },

    // Example 2: Bug report
    {
        scenario: 'Bug report requiring immediate fix',
        signal: {
            source: 'slack',
            body: 'Bug: Users can\'t login on mobile app. Getting "Invalid credentials" error even with correct password. Multiple reports in last hour.',
            sender: 'support-team',
            timestamp: '2025-10-16T14:30:00Z',
        },
        classification: {
            type: 'slack',
            urgency: 'high',
            importance: 'high',
            category: 'alert',
            confidence: 0.95,
            reasoning: 'Critical bug affecting user login',
        },
        extractedTask: {
            title: 'Fix mobile app login authentication bug',
            description: 'Critical bug preventing users from logging into mobile app.\n\nIssue: Users receiving "Invalid credentials" error despite entering correct password\nAffected: Mobile app users\nReports: Multiple in last hour\n\nSuccess criteria:\n- Users can successfully login with valid credentials\n- Error no longer appears for valid logins\n- Root cause identified and fixed',
            assignee: 'mobile-team@company.com',
            labels: ['bug', 'urgent', 'mobile', 'authentication', 'high-priority'],
            project: 'Mobile App',
        },
    },

    // Example 3: Meeting scheduling
    {
        scenario: 'Meeting request for next week',
        signal: {
            source: 'email',
            subject: 'Planning Meeting',
            body: 'Let\'s schedule a planning meeting next week to discuss the new feature rollout. Need product, engineering, and design leads present.',
            sender: 'project-manager@company.com',
            timestamp: '2025-10-16T09:00:00Z',
        },
        extractedTask: {
            title: 'Schedule feature rollout planning meeting',
            description: 'Organize planning meeting for new feature rollout discussion.\n\nRequired attendees:\n- Product lead\n- Engineering lead\n- Design lead\n\nAgenda: Discuss new feature rollout strategy and timeline\n\nSuccess criteria: Meeting scheduled with all stakeholders confirmed',
            dueDate: '2025-10-21T09:00:00Z',
            assignee: 'project-manager@company.com',
            labels: ['meeting', 'planning', 'feature-rollout'],
            project: 'Feature Rollout',
        },
    },

    // Example 4: EOD deadline
    {
        scenario: 'Urgent report needed by end of day',
        signal: {
            source: 'slack',
            body: '@analytics-team Can you pull the user engagement metrics for the exec meeting? Need it by EOD.',
            sender: 'vp-product',
            timestamp: '2025-10-16T13:00:00Z',
        },
        extractedTask: {
            title: 'Generate user engagement metrics report',
            description: 'Pull user engagement metrics for executive meeting.\n\nRequested by: VP Product\nDeadline: End of day\nPurpose: Executive meeting presentation\n\nRequired metrics:\n- User engagement statistics\n- Formatted for executive presentation\n\nSuccess criteria: Report delivered by 5 PM today',
            dueDate: '2025-10-16T17:00:00Z',
            assignee: 'analytics-team@company.com',
            labels: ['report', 'urgent', 'analytics', 'executive'],
            project: 'Analytics',
        },
    },

    // Example 5: Feature request with assignee mention
    {
        scenario: 'Feature implementation request',
        signal: {
            source: 'email',
            subject: 'Feature Request: Export to Excel',
            body: 'Sarah, can you implement the Excel export feature for the dashboard? Several customers are requesting it. Target: next sprint.',
            sender: 'product-manager@company.com',
            timestamp: '2025-10-16T11:00:00Z',
        },
        extractedTask: {
            title: 'Implement Excel export for dashboard',
            description: 'Add Excel export functionality to dashboard based on customer requests.\n\nContext: Multiple customer requests for export capability\nTarget: Next sprint\n\nRequirements:\n- Export dashboard data to Excel format\n- Include all visible data and charts\n- User-friendly download button\n\nSuccess criteria:\n- Users can export dashboard to Excel\n- All data exports correctly\n- Feature tested and working',
            assignee: 'sarah@company.com',
            labels: ['feature', 'dashboard', 'export', 'customer-request'],
            project: 'Dashboard',
        },
    },

    // Example 6: Documentation task
    {
        scenario: 'Documentation update needed',
        signal: {
            source: 'slack',
            body: 'We need to update the API documentation with the new authentication endpoints before next week\'s release.',
            sender: 'api-team-lead',
            timestamp: '2025-10-16T10:30:00Z',
        },
        extractedTask: {
            title: 'Update API documentation with new auth endpoints',
            description: 'Update API documentation to include new authentication endpoints.\n\nContext: Upcoming release includes new auth endpoints\nDeadline: Before next week\'s release\n\nRequired updates:\n- Document new authentication endpoints\n- Include request/response examples\n- Update authentication flow diagrams\n\nSuccess criteria:\n- All new endpoints documented\n- Examples tested and accurate\n- Documentation deployed before release',
            dueDate: '2025-10-21T09:00:00Z',
            assignee: 'api-team-lead@company.com',
            labels: ['documentation', 'api', 'authentication', 'release'],
            project: 'API Development',
        },
    },

    // Example 7: Deployment task with specific date
    {
        scenario: 'Scheduled deployment',
        signal: {
            source: 'email',
            subject: 'Production Deployment: Oct 25',
            body: 'Deployment of v2.1.0 scheduled for October 25th at 2 AM. Please prepare release notes and notify customers.',
            sender: 'release-manager@company.com',
            timestamp: '2025-10-16T15:00:00Z',
        },
        extractedTask: {
            title: 'Deploy v2.1.0 to production',
            description: 'Deploy version 2.1.0 to production environment.\n\nScheduled: October 25th at 2:00 AM\n\nPre-deployment tasks:\n- Prepare release notes\n- Notify customers of deployment\n- Verify staging deployment\n- Prepare rollback plan\n\nSuccess criteria:\n- v2.1.0 deployed successfully\n- Release notes published\n- Customer notifications sent\n- Post-deployment verification complete',
            dueDate: '2025-10-25T02:00:00Z',
            assignee: 'release-manager@company.com',
            labels: ['deployment', 'production', 'release', 'high-priority'],
            project: 'Platform',
        },
    },

    // Example 8: Investigation task
    {
        scenario: 'Performance investigation',
        signal: {
            source: 'slack',
            body: 'Database queries are slow today. Average response time jumped from 50ms to 300ms. @backend-oncall can you investigate?',
            sender: 'monitoring-bot',
            timestamp: '2025-10-16T16:45:00Z',
        },
        classification: {
            type: 'slack',
            urgency: 'high',
            importance: 'high',
            category: 'alert',
            confidence: 0.92,
            reasoning: 'Significant performance degradation requiring investigation',
        },
        extractedTask: {
            title: 'Investigate database performance degradation',
            description: 'Investigate sudden database performance degradation.\n\nIssue: Query response time increased significantly\n- Previous: 50ms average\n- Current: 300ms average (6x slower)\n- Started: Today\n\nInvestigation steps:\n1. Check database metrics and logs\n2. Identify slow queries\n3. Check for blocking/deadlocks\n4. Review recent changes\n5. Implement fix or optimization\n\nSuccess criteria:\n- Root cause identified\n- Response time back to normal (<100ms)\n- Monitoring confirms resolution',
            assignee: 'backend-oncall@company.com',
            labels: ['investigation', 'performance', 'database', 'urgent', 'backend'],
            project: 'Infrastructure',
        },
    },

    // Example 9: Customer follow-up
    {
        scenario: 'Customer follow-up task',
        signal: {
            source: 'email',
            subject: 'Follow up: Enterprise trial',
            body: 'Remember to follow up with BigCorp about their enterprise trial. They mentioned wanting to discuss custom integrations tomorrow.',
            sender: 'sales-manager@company.com',
            timestamp: '2025-10-16T12:00:00Z',
        },
        extractedTask: {
            title: 'Follow up with BigCorp on enterprise trial',
            description: 'Follow up with BigCorp regarding their enterprise trial and custom integration needs.\n\nContext: Enterprise trial in progress\nDiscussion topic: Custom integrations\nTiming: Tomorrow\n\nDiscussion points:\n- Trial feedback and experience\n- Custom integration requirements\n- Timeline and pricing\n- Next steps for conversion\n\nSuccess criteria:\n- Call/meeting completed\n- Integration requirements documented\n- Next steps agreed upon',
            dueDate: '2025-10-17T09:00:00Z',
            assignee: 'sales-manager@company.com',
            labels: ['customer', 'follow-up', 'enterprise', 'sales'],
            project: 'Enterprise Sales',
        },
    },

    // Example 10: Code review
    {
        scenario: 'Code review request',
        signal: {
            source: 'slack',
            body: 'PR #456 is ready for review - new payment processing feature. @tech-lead can you review by tomorrow morning?',
            sender: 'developer',
            timestamp: '2025-10-16T17:00:00Z',
        },
        extractedTask: {
            title: 'Review PR #456: Payment processing feature',
            description: 'Code review for pull request implementing new payment processing feature.\n\nPR: #456\nAuthor: Developer team\nDeadline: Tomorrow morning\n\nReview focus:\n- Payment processing logic\n- Security considerations\n- Error handling\n- Test coverage\n- Code quality and standards\n\nSuccess criteria:\n- PR reviewed and feedback provided\n- Security aspects verified\n- Approval or requested changes submitted',
            dueDate: '2025-10-17T09:00:00Z',
            assignee: 'tech-lead@company.com',
            labels: ['code-review', 'payment', 'feature', 'backend'],
            project: 'Payment System',
        },
    },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get current date context for date inference
 */
function getDateContext(referenceTimestamp?: string): DateContext {
    const currentDate = referenceTimestamp ? new Date(referenceTimestamp) : new Date();
    const currentTime = currentDate.toISOString();
    return { currentDate, currentTime };
}

/**
 * Format date context for prompt
 */
function formatDateContext(context: DateContext): string {
    const date = context.currentDate;
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    return `Current Date: ${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} (${dayNames[date.getDay()]})
Current Time: ${date.toTimeString().split(' ')[0]}
ISO Format: ${context.currentTime}`;
}

// ============================================================================
// Prompt Builder
// ============================================================================

/**
 * Build task extraction prompt
 * 
 * @param signal - Signal content to extract task from
 * @param classification - Optional classification results for context
 * @returns Complete prompt for LLM
 */
export function taskExtractionPrompt(
    signal: TaskSignal,
    classification?: SignalClassification
): string {
    const tokenManager = getTokenManager();
    const dateContext = getDateContext(signal.timestamp);

    // Build classification section
    let classificationSection = '';
    if (classification) {
        classificationSection = `\n## Signal Classification

This signal was classified as:
- **Urgency**: ${classification.urgency}
- **Importance**: ${classification.importance}
- **Category**: ${classification.category}
- **Confidence**: ${classification.confidence}

Consider this classification when inferring labels and priority.
`;
    }

    // Build examples section
    const examplesSection = '\n## Extraction Examples\n\n' +
        TASK_EXTRACTION_EXAMPLES.map((example, index) => {
            return `### Example ${index + 1}: ${example.scenario}

**Input Signal**:
- Source: ${example.signal.source}
${example.signal.subject ? `- Subject: ${example.signal.subject}\n` : ''}- Content: ${example.signal.body}
${example.signal.sender ? `- Sender: ${example.signal.sender}\n` : ''}
**Extracted Task**:
\`\`\`json
${JSON.stringify(example.extractedTask, null, 2)}
\`\`\`
`;
        }).join('\n');

    // Build signal section
    const signalSection = `
## Signal to Extract

**Date Context**:
${formatDateContext(dateContext)}

**Signal**:
- **Source**: ${signal.source}
${signal.subject ? `- **Subject**: ${signal.subject}\n` : ''}- **Content**: ${signal.body}
${signal.sender ? `- **Sender**: ${signal.sender}\n` : ''}- **Timestamp**: ${signal.timestamp}
${signal.metadata ? `- **Metadata**: ${JSON.stringify(signal.metadata, null, 2)}\n` : ''}`;

    // Build complete prompt
    const fullPrompt = `${TASK_EXTRACTION_SYSTEM_PROMPT}
${examplesSection}
${classificationSection}
${signalSection}

## Your Task

Extract structured task information from the signal above.

Use the current date context for inferring relative dates ("tomorrow", "next week", etc.).
${classification ? 'Use the classification results to infer appropriate labels and context.' : ''}

Respond with ONLY valid JSON matching the TaskDetails schema. No additional text or explanation outside the JSON.`;

    // Validate prompt length
    const tokenCount = tokenManager.countTokens(fullPrompt);
    const maxTokens = 16000;

    if (tokenCount > maxTokens) {
        logger.warn(`[TaskExtractionPrompts] Prompt too long: ${tokenCount} tokens (max: ${maxTokens})`);
    } else {
        logger.debug(`[TaskExtractionPrompts] Generated prompt: ${tokenCount} tokens`);
    }

    return fullPrompt;
}

/**
 * Validate prompt length
 * 
 * @param prompt - Prompt to validate
 * @param maxTokens - Maximum allowed tokens
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
            : `Prompt exceeds limit (${tokenCount}/${maxTokens} tokens)`,
    };
}

/**
 * Get extraction examples for reference
 * 
 * @returns Array of extraction examples
 */
export function getExtractionExamples(): TaskExtractionExample[] {
    return TASK_EXTRACTION_EXAMPLES;
}

/**
 * Get system prompt for reference
 * 
 * @returns System prompt text
 */
export function getExtractionSystemPrompt(): string {
    return TASK_EXTRACTION_SYSTEM_PROMPT;
}
