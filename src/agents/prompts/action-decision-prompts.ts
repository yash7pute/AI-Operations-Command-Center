/**
 * Action Decision Prompt Template
 * 
 * Provides structured prompts for LLM-based action decision making.
 */

import type { Signal, DecisionContext } from '../reasoning/context-builder';
import type { SignalClassification } from '../classifier-agent';

/**
 * Generate action decision prompt
 */
export function actionDecisionPrompt(
    signal: Signal,
    classification: SignalClassification,
    context: DecisionContext
): string {
    return `You are an AI assistant that decides actions for incoming signals.

SIGNAL INFORMATION:
- ID: ${signal.id}
- Source: ${signal.source}
- Sender: ${signal.sender}
${signal.subject ? `- Subject: ${signal.subject}` : ''}
- Timestamp: ${signal.timestamp}
- Body: ${signal.body.substring(0, 500)}${signal.body.length > 500 ? '...' : ''}

CLASSIFICATION:
- Category: ${classification.category}
- Urgency: ${classification.urgency}
- Importance: ${classification.importance}
- Confidence: ${classification.confidence.toFixed(2)}

CONTEXT:
${context.recentSignals ? `- Recent similar signals: ${context.recentSignals.length}` : ''}
${context.relatedTasks ? `- Related tasks: ${context.relatedTasks.length}` : ''}
${context.systemState ? `- System queue depth: ${context.systemState.queueDepth}` : ''}

Based on the signal and classification, decide the best action to take.

AVAILABLE ACTIONS:
1. create_task - Create a new task in task management system
2. send_notification - Send a notification to relevant team members
3. update_document - Update a document or spreadsheet
4. schedule_meeting - Schedule a meeting
5. ignore - No action needed
6. escalate - Escalate to human for decision
7. clarify - Request clarification from sender

RESPONSE FORMAT (JSON):
{
  "action": "create_task|send_notification|update_document|schedule_meeting|ignore|escalate|clarify",
  "actionParams": {
    "title": "string (required for create_task, schedule_meeting)",
    "description": "string (optional)",
    "assignee": "email (optional for create_task)",
    "dueDate": "ISO date string (optional for create_task)",
    "priority": 1-5 (1=highest, 5=lowest, optional),
    "platform": "gmail|slack|sheets|trello|notion (optional)",
    "metadata": {}
  },
  "reasoning": "Explain why you chose this action",
  "confidence": 0.0-1.0,
  "requiresApproval": true|false
}

DECISION GUIDELINES:
- For critical/high urgency: create tasks with appropriate priority
- For questions: send notifications or create clarification tasks
- For reports/data: update documents or ignore if FYI
- For meetings: schedule if actionable, otherwise ignore
- Set requiresApproval: true for high-stakes decisions (financial, legal, executive-level)
- Set confidence based on classification confidence and context clarity

Respond ONLY with the JSON object, no additional text.`;
}
