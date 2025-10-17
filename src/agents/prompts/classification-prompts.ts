/**
 * Signal Classification Prompt Template
 * 
 * Provides structured prompts for LLM-based signal classification.
 * Includes system instructions, few-shot examples, and prompt validation.
 * 
 * @module agents/prompts/classification-prompts
 */

import { getTokenManager } from '../llm/token-manager';
import logger from '../../utils/logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Signal data for classification
 */
export interface SignalData {
    source: 'email' | 'slack' | 'sheet';
    sender?: string;
    senderEmail?: string;
    senderRole?: string;
    timestamp: string;
    subject?: string;
    body: string;
    channel?: string;
    thread?: string;
    metadata?: Record<string, any>;
}

/**
 * Classification example for few-shot learning
 */
export interface ClassificationExample {
    signal: {
        source: string;
        sender: string;
        subject?: string;
        body: string;
    };
    classification: {
        type: 'email' | 'slack' | 'sheet';
        urgency: 'critical' | 'high' | 'medium' | 'low';
        importance: 'high' | 'medium' | 'low';
        category: 'meeting' | 'task' | 'report' | 'question' | 'notification' | 'alert';
        confidence: number;
        reasoning: string;
    };
}

/**
 * Prompt validation result
 */
export interface PromptValidationResult {
    isValid: boolean;
    tokenCount: number;
    maxTokens: number;
    warnings: string[];
}

// ============================================================================
// System Prompt
// ============================================================================

const CLASSIFICATION_SYSTEM_PROMPT = `You are an AI operations assistant specialized in analyzing and classifying incoming signals from various communication channels (email, Slack, Google Sheets).

Your task is to analyze each signal and classify it based on urgency, importance, and category to help prioritize operational responses.

**CLASSIFICATION CRITERIA:**

**Urgency** (time-sensitivity):
- CRITICAL: Immediate action required (production issues, security incidents, system outages, emergency escalations)
  * Keywords: "down", "broken", "urgent", "asap", "critical", "emergency", "production", "outage"
  * Timeframe: Requires response within minutes
  * Impact: Operations are blocked or at risk

- HIGH: Action needed within hours (executive requests, deadline-driven tasks, customer escalations)
  * Keywords: "today", "EOD", "ASAP", "deadline", "important", "priority"
  * Timeframe: Requires response same day
  * Impact: Significant delay would cause problems

- MEDIUM: Action needed within 1-3 days (regular work items, scheduled meetings, routine updates)
  * Keywords: "this week", "upcoming", "scheduled", "planned"
  * Timeframe: Can be handled in normal workflow
  * Impact: Part of regular operations

- LOW: Informational or can wait (FYI messages, announcements, low-priority updates)
  * Keywords: "FYI", "announcement", "reminder", "update"
  * Timeframe: No specific deadline
  * Impact: Minimal or informational only

**Importance** (business impact):
- HIGH: Strategic value, affects multiple teams/customers, revenue impact, compliance requirements
  * Affects company goals, multiple stakeholders, or critical systems
  * Executive involvement or customer-facing

- MEDIUM: Affects single team or project, moderate business impact
  * Standard operational work
  * Team-level decisions

- LOW: Individual-level, minimal business impact, informational only
  * Personal updates, minor announcements
  * No decision or action required

**Category**:
- MEETING: Calendar invites, meeting requests, schedule changes
- TASK: Action items, to-dos, work requests, deliverables
- REPORT: Status updates, metrics, dashboards, analytics
- QUESTION: Inquiries requiring response, clarifications, support requests
- NOTIFICATION: FYI messages, system alerts, announcements
- ALERT: Urgent notifications, warnings, error messages, incidents

**Confidence Score** (0.0 to 1.0):
- 0.9-1.0: Very clear signal with explicit indicators (keywords, sender authority, clear context)
- 0.7-0.8: Clear signal but some ambiguity (unclear urgency, missing context)
- 0.5-0.6: Ambiguous signal requiring interpretation (vague language, unclear intent)
- Below 0.5: Insufficient information (very short message, unclear purpose)

**ANALYSIS FACTORS:**
1. **Content Keywords**: Scan for urgency/importance keywords
2. **Sender Authority**: CEO/Executive → higher importance, On-call engineer → higher urgency
3. **Time Sensitivity**: Explicit deadlines, time references
4. **Business Impact**: Customer-facing, revenue-related, compliance, multi-team
5. **Context Clues**: Thread history, channel type, message length, formatting

**OUTPUT FORMAT:**
You MUST respond with valid JSON matching this exact structure:
{
  "type": "email" | "slack" | "sheet",
  "urgency": "critical" | "high" | "medium" | "low",
  "importance": "high" | "medium" | "low",
  "category": "meeting" | "task" | "report" | "question" | "notification" | "alert",
  "confidence": 0.0 to 1.0,
  "reasoning": "Detailed explanation of classification (minimum 10 characters)"
}

**IMPORTANT:**
- Always output valid JSON, no additional text
- Reasoning must explain your classification decision
- Consider both content AND context (sender, time, source)
- When in doubt, be conservative (lower urgency/importance)
- Confidence reflects your certainty, not the signal's importance`;

// ============================================================================
// Few-Shot Examples
// ============================================================================

const CLASSIFICATION_EXAMPLES: ClassificationExample[] = [
    // Example 1: Critical Alert
    {
        signal: {
            source: 'slack',
            sender: 'monitoring-bot',
            body: '🚨 CRITICAL ALERT: Production database (prod-db-01) is down. All customer transactions are failing. Error rate: 100%. Incident #INC-2947'
        },
        classification: {
            type: 'slack',
            urgency: 'critical',
            importance: 'high',
            category: 'alert',
            confidence: 0.98,
            reasoning: 'Production system outage with 100% error rate affecting all customers. Contains explicit critical keywords and incident number. Requires immediate response to restore service.'
        }
    },

    // Example 2: High Urgency Executive Request
    {
        signal: {
            source: 'email',
            sender: 'Sarah Chen (CEO)',
            subject: 'Need Q4 Financial Report by EOD',
            body: 'Hi team, I need the Q4 financial summary for the board meeting tomorrow morning. Please send me the latest numbers by end of day today. Thanks!'
        },
        classification: {
            type: 'email',
            urgency: 'high',
            importance: 'high',
            category: 'task',
            confidence: 0.95,
            reasoning: 'CEO request with explicit EOD deadline for board meeting. High business impact (financial reporting for board). Clear time constraint and strategic importance.'
        }
    },

    // Example 3: High Urgency Customer Escalation
    {
        signal: {
            source: 'email',
            sender: 'support@company.com',
            subject: 'URGENT: Enterprise customer unable to access platform',
            body: 'Priority escalation from Acme Corp (our largest customer). They cannot log in to the platform and have a critical demo in 2 hours. Need immediate attention.'
        },
        classification: {
            type: 'email',
            urgency: 'high',
            importance: 'high',
            category: 'alert',
            confidence: 0.92,
            reasoning: 'Enterprise customer (largest) with urgent access issue before critical demo. Revenue impact and customer satisfaction risk. Explicit urgency keywords and time constraint (2 hours).'
        }
    },

    // Example 4: Medium Urgency - Meeting Request
    {
        signal: {
            source: 'email',
            sender: 'John Smith (Product Manager)',
            subject: 'Sprint Planning - Thursday 2pm',
            body: 'Hi everyone, let\'s schedule our sprint planning for this Thursday at 2pm. We\'ll review the backlog and plan the next 2 weeks. Please confirm attendance.'
        },
        classification: {
            type: 'email',
            urgency: 'medium',
            importance: 'medium',
            category: 'meeting',
            confidence: 0.88,
            reasoning: 'Scheduled meeting with specific date/time for sprint planning. Standard operational cadence affecting single team. Not urgent but requires timely response for attendance confirmation.'
        }
    },

    // Example 5: Medium Urgency - Task Assignment
    {
        signal: {
            source: 'slack',
            sender: 'Maria Garcia (Engineering Manager)',
            body: 'Hey @team, can someone review the API documentation updates by end of this week? It\'s blocking the release notes. Thanks!'
        },
        classification: {
            type: 'slack',
            urgency: 'medium',
            importance: 'medium',
            category: 'task',
            confidence: 0.85,
            reasoning: 'Task request with end-of-week deadline. Blocking release notes suggests moderate importance. Team-level impact, not critical to operations but needs attention this week.'
        }
    },

    // Example 6: Medium Priority Question
    {
        signal: {
            source: 'email',
            sender: 'Alex Turner (Designer)',
            subject: 'Question about new dashboard mockups',
            body: 'Hi! I\'m working on the dashboard redesign and have a few questions about the data requirements. When you get a chance, could we hop on a quick call to discuss?'
        },
        classification: {
            type: 'email',
            urgency: 'medium',
            importance: 'medium',
            category: 'question',
            confidence: 0.82,
            reasoning: 'Design question requiring input but no explicit deadline. "When you get a chance" indicates flexibility. Project-related so medium importance but not urgent.'
        }
    },

    // Example 7: Low Urgency - Weekly Report
    {
        signal: {
            source: 'email',
            sender: 'reports@company.com',
            subject: 'Weekly Team Metrics - Week of Oct 9',
            body: 'Here are your team\'s metrics for the week:\n- Tickets closed: 47\n- Average response time: 2.3 hours\n- Customer satisfaction: 94%\n\nFull report attached.'
        },
        classification: {
            type: 'email',
            urgency: 'low',
            importance: 'medium',
            category: 'report',
            confidence: 0.91,
            reasoning: 'Automated weekly metrics report for informational purposes. No action required, standard operational reporting. Medium importance for tracking but low urgency.'
        }
    },

    // Example 8: Low Urgency - FYI Announcement
    {
        signal: {
            source: 'slack',
            sender: 'Office Manager',
            body: 'FYI: We have a new coffee machine in the break room on the 3rd floor! ☕ It makes espresso, cappuccino, and lattes. Enjoy!'
        },
        classification: {
            type: 'slack',
            urgency: 'low',
            importance: 'low',
            category: 'notification',
            confidence: 0.96,
            reasoning: 'Informational announcement with explicit "FYI" indicator. Office amenity update with no business impact. No action required, purely informational.'
        }
    },

    // Example 9: Low Urgency - Reminder
    {
        signal: {
            source: 'email',
            sender: 'HR Department',
            subject: 'Reminder: Annual performance reviews open November 1',
            body: 'This is a friendly reminder that the annual performance review cycle will open on November 1st. You\'ll have until November 30th to complete your self-assessment. More details to follow.'
        },
        classification: {
            type: 'email',
            urgency: 'low',
            importance: 'medium',
            category: 'notification',
            confidence: 0.87,
            reasoning: 'Advance reminder for process starting in 2+ weeks with month-long window. Important for compliance but not time-sensitive yet. Informational at this stage.'
        }
    },

    // Example 10: Ambiguous Signal (Medium-Low Confidence)
    {
        signal: {
            source: 'slack',
            sender: 'Unknown User',
            body: 'Hey, can you check something for me?'
        },
        classification: {
            type: 'slack',
            urgency: 'medium',
            importance: 'low',
            category: 'question',
            confidence: 0.55,
            reasoning: 'Vague request with no context, deadline, or details. Unknown sender reduces urgency assessment. Classified as medium-low priority question requiring clarification. Low confidence due to insufficient information.'
        }
    }
];

// ============================================================================
// Prompt Builder Functions
// ============================================================================

/**
 * Build classification prompt for a signal
 * 
 * @param signal - Signal data to classify
 * @param includeExamples - Whether to include few-shot examples (default: true)
 * @returns Complete prompt string
 */
export function classificationPrompt(signal: SignalData, includeExamples: boolean = true): string {
    // Build signal context
    const signalContext = buildSignalContext(signal);

    // Build few-shot examples section
    const examplesSection = includeExamples ? buildExamplesSection() : '';

    // Build user prompt
    const userPrompt = `${examplesSection}

**NOW CLASSIFY THIS SIGNAL:**

${signalContext}

Analyze the signal above and provide your classification in valid JSON format. Consider:
1. Urgency keywords and time constraints
2. Sender authority and role
3. Business impact and scope
4. Content type and category
5. Confidence in your assessment

Remember: Output ONLY valid JSON, no additional text.`;

    return userPrompt;
}

/**
 * Build signal context section
 */
function buildSignalContext(signal: SignalData): string {
    const parts: string[] = [];

    parts.push(`**Signal Source:** ${signal.source}`);
    
    if (signal.sender) {
        parts.push(`**Sender:** ${signal.sender}`);
    }
    
    if (signal.senderEmail) {
        parts.push(`**Sender Email:** ${signal.senderEmail}`);
    }
    
    if (signal.senderRole) {
        parts.push(`**Sender Role:** ${signal.senderRole}`);
    }
    
    parts.push(`**Timestamp:** ${signal.timestamp}`);
    
    if (signal.subject) {
        parts.push(`**Subject:** ${signal.subject}`);
    }
    
    if (signal.channel) {
        parts.push(`**Channel:** ${signal.channel}`);
    }
    
    if (signal.thread) {
        parts.push(`**Thread:** ${signal.thread}`);
    }
    
    parts.push(`**Content:**\n${signal.body}`);
    
    if (signal.metadata && Object.keys(signal.metadata).length > 0) {
        parts.push(`**Metadata:** ${JSON.stringify(signal.metadata, null, 2)}`);
    }

    return parts.join('\n');
}

/**
 * Build few-shot examples section
 */
function buildExamplesSection(): string {
    const exampleStrings = CLASSIFICATION_EXAMPLES.map((example, index) => {
        const signal = example.signal;
        const classification = example.classification;

        let exampleText = `**Example ${index + 1}:**\n`;
        exampleText += `Signal Source: ${signal.source}\n`;
        exampleText += `Sender: ${signal.sender}\n`;
        
        if (signal.subject) {
            exampleText += `Subject: ${signal.subject}\n`;
        }
        
        exampleText += `Content: ${signal.body}\n\n`;
        exampleText += `Classification:\n${JSON.stringify(classification, null, 2)}`;
        
        return exampleText;
    });

    return `**CLASSIFICATION EXAMPLES:**\n\n${exampleStrings.join('\n\n---\n\n')}`;
}

/**
 * Get system prompt for classification
 * 
 * @returns System prompt string
 */
export function getClassificationSystemPrompt(): string {
    return CLASSIFICATION_SYSTEM_PROMPT;
}

/**
 * Get all classification examples
 * 
 * @returns Array of classification examples
 */
export function getClassificationExamples(): ClassificationExample[] {
    return [...CLASSIFICATION_EXAMPLES];
}

/**
 * Validate prompt length to ensure it fits in context window
 * 
 * @param prompt - Prompt to validate
 * @param maxTokens - Maximum tokens allowed (default: 4000 for safety)
 * @returns Validation result
 */
export function validatePromptLength(prompt: string, maxTokens: number = 4000): PromptValidationResult {
    const tokenManager = getTokenManager();
    const tokenCount = tokenManager.countTokens(prompt);
    
    const warnings: string[] = [];
    
    if (tokenCount > maxTokens) {
        warnings.push(`Prompt exceeds maximum tokens: ${tokenCount} > ${maxTokens}`);
    } else if (tokenCount > maxTokens * 0.8) {
        warnings.push(`Prompt approaching token limit: ${tokenCount} / ${maxTokens} (${((tokenCount / maxTokens) * 100).toFixed(1)}%)`);
    }
    
    const result: PromptValidationResult = {
        isValid: tokenCount <= maxTokens,
        tokenCount,
        maxTokens,
        warnings
    };
    
    if (!result.isValid) {
        logger.warn(`[ClassificationPrompt] Prompt validation failed: ${result.warnings.join(', ')}`);
    } else if (warnings.length > 0) {
        logger.warn(`[ClassificationPrompt] Prompt validation warnings: ${result.warnings.join(', ')}`);
    }
    
    return result;
}

/**
 * Build complete classification prompt with system and user messages
 * 
 * @param signal - Signal to classify
 * @param includeExamples - Whether to include few-shot examples
 * @returns Array of messages for LLM
 */
export function buildClassificationMessages(
    signal: SignalData,
    includeExamples: boolean = true
): Array<{ role: 'system' | 'user'; content: string }> {
    const systemPrompt = getClassificationSystemPrompt();
    const userPrompt = classificationPrompt(signal, includeExamples);
    
    return [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];
}

/**
 * Validate complete prompt (system + user) fits in context
 * 
 * @param messages - Array of messages
 * @param maxTokens - Maximum tokens for entire conversation
 * @returns Validation result
 */
export function validateMessages(
    messages: Array<{ role: string; content: string }>,
    maxTokens: number = 6000
): PromptValidationResult {
    const tokenManager = getTokenManager();
    const totalTokens = tokenManager.countMessageTokens(messages);
    
    const warnings: string[] = [];
    
    if (totalTokens > maxTokens) {
        warnings.push(`Messages exceed maximum tokens: ${totalTokens} > ${maxTokens}`);
    } else if (totalTokens > maxTokens * 0.8) {
        warnings.push(`Messages approaching token limit: ${totalTokens} / ${maxTokens} (${((totalTokens / maxTokens) * 100).toFixed(1)}%)`);
    }
    
    return {
        isValid: totalTokens <= maxTokens,
        tokenCount: totalTokens,
        maxTokens,
        warnings
    };
}

// ============================================================================
// Exports
// ============================================================================

export default {
    classificationPrompt,
    getClassificationSystemPrompt,
    getClassificationExamples,
    buildClassificationMessages,
    validatePromptLength,
    validateMessages
};
