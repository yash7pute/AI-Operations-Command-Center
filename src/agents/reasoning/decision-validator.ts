/**
 * Decision Validator
 * 
 * Validates LLM decisions against business rules before execution.
 * Prevents common mistakes like duplicate tasks, weekend scheduling,
 * high-impact actions without approval, ignoring VIP senders, and spam.
 * 
 * @module agents/reasoning/decision-validator
 */

import logger from '../../utils/logger';
import { DecisionContext, Task } from './context-builder';

// ============================================================================
// Types
// ============================================================================

/**
 * Action type for decisions
 */
export type ActionType = 
    | 'create_task'
    | 'send_notification'
    | 'update_sheet'
    | 'file_document'
    | 'delegate'
    | 'ignore';

/**
 * Priority level (1-5)
 */
export type Priority = 1 | 2 | 3 | 4 | 5;

/**
 * LLM decision to validate
 */
export interface Decision {
    action: ActionType;
    reasoning: string;
    confidence: number;
    platform?: 'notion' | 'trello' | 'sheets' | 'drive' | 'slack';
    taskDetails?: {
        title: string;
        description?: string;
        priority: Priority;
        dueDate?: string;
        assignee?: string;
        labels?: string[];
    };
    notificationDetails?: {
        recipient: string;
        message: string;
        channel?: string;
        urgent?: boolean;
    };
    metadata?: {
        requiresApproval?: boolean;
        estimatedImpact?: 'low' | 'medium' | 'high';
        [key: string]: any;
    };
}

/**
 * Signal information
 */
export interface Signal {
    id: string;
    source: 'email' | 'slack' | 'sheets';
    subject?: string;
    body: string;
    sender?: string;
    timestamp: string;
    classification?: {
        urgency: string;
        importance: string;
        category: string;
    };
}

/**
 * Validation result
 */
export interface ValidationResult {
    valid: boolean;
    warnings: string[];
    blockers: string[];
    adjustments: DecisionAdjustment;
    validatedAt: string;
    rulesApplied: string[];
}

/**
 * Decision adjustments to apply
 */
export interface DecisionAdjustment {
    priority?: Priority;
    requiresApproval?: boolean;
    platform?: 'notion' | 'trello' | 'sheets' | 'drive' | 'slack';
    assignee?: string;
    dueDate?: string;
    action?: ActionType;
    reason?: string;
}

/**
 * Validation rule definition
 */
export interface ValidationRule {
    id: string;
    name: string;
    description: string;
    severity: 'blocker' | 'warning';
    category: 'duplicate' | 'scheduling' | 'impact' | 'sender' | 'rate_limit';
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Validation rules documentation
 */
export const VALIDATION_RULES: ValidationRule[] = [
    {
        id: 'NO_DUPLICATES',
        name: 'No Duplicate Tasks',
        description: 'Prevent creating tasks with >80% title similarity to existing tasks',
        severity: 'blocker',
        category: 'duplicate',
    },
    {
        id: 'NO_WEEKEND_TASKS',
        name: 'No Weekend/Holiday Tasks',
        description: 'Don\'t schedule non-critical tasks on weekends or holidays',
        severity: 'warning',
        category: 'scheduling',
    },
    {
        id: 'HIGH_IMPACT_APPROVAL',
        name: 'High Impact Requires Approval',
        description: 'Financial, external communication, or system changes need approval',
        severity: 'blocker',
        category: 'impact',
    },
    {
        id: 'VIP_PROTECTION',
        name: 'VIP Sender Protection',
        description: 'Never ignore or downgrade signals from VIP senders (CEO, clients)',
        severity: 'blocker',
        category: 'sender',
    },
    {
        id: 'RATE_LIMIT',
        name: 'Task Creation Rate Limit',
        description: 'Maximum 10 tasks per hour to prevent spam',
        severity: 'blocker',
        category: 'rate_limit',
    },
];

/**
 * Thresholds for validation
 */
export const VALIDATION_THRESHOLDS = {
    DUPLICATE_SIMILARITY: 0.80,
    MAX_TASKS_PER_HOUR: 10,
    HIGH_QUEUE_THRESHOLD: 20,
    BORDERLINE_CONFIDENCE_MIN: 0.70,
    BORDERLINE_CONFIDENCE_MAX: 0.85,
};

/**
 * VIP senders (would be loaded from config in production)
 */
const VIP_SENDERS = [
    'ceo@company.com',
    'founder@company.com',
    'president@company.com',
    'client@',
    'customer@',
    'board@company.com',
    'executive@company.com',
];

/**
 * High-impact keywords
 */
const HIGH_IMPACT_KEYWORDS = {
    financial: ['payment', 'invoice', 'transaction', 'refund', 'charge', 'billing', 'purchase', 'money', 'cost', 'budget', 'expense'],
    external: ['client', 'customer', 'public', 'press', 'media', 'announcement', 'release', 'external', 'partner'],
    destructive: ['delete', 'remove', 'drop', 'destroy', 'wipe', 'terminate', 'cancel'],
    system: ['production', 'deploy', 'release', 'migrate', 'upgrade', 'downgrade', 'database', 'server', 'infrastructure'],
};

/**
 * US Holidays 2025
 */
const US_HOLIDAYS_2025 = [
    '2025-01-01', // New Year's Day
    '2025-01-20', // MLK Day
    '2025-02-17', // Presidents' Day
    '2025-05-26', // Memorial Day
    '2025-07-04', // Independence Day
    '2025-09-01', // Labor Day
    '2025-10-13', // Columbus Day
    '2025-11-11', // Veterans Day
    '2025-11-27', // Thanksgiving
    '2025-12-25', // Christmas
];

// ============================================================================
// Decision Validator Class
// ============================================================================

export class DecisionValidator {
    private static instance: DecisionValidator;
    private taskCreationHistory: Array<{ timestamp: number; taskId: string }> = [];
    
    private constructor() {
        logger.info('[DecisionValidator] Initialized');
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): DecisionValidator {
        if (!DecisionValidator.instance) {
            DecisionValidator.instance = new DecisionValidator();
        }
        return DecisionValidator.instance;
    }

    /**
     * Validate decision against all business rules
     * 
     * @param decision - LLM decision to validate
     * @param signal - Original signal
     * @param context - Decision context
     * @returns Validation result
     */
    public validateDecision(
        decision: Decision,
        signal: Signal,
        context: DecisionContext
    ): ValidationResult {
        const startTime = Date.now();
        const warnings: string[] = [];
        const blockers: string[] = [];
        const adjustments: DecisionAdjustment = {};
        const rulesApplied: string[] = [];

        logger.debug('[DecisionValidator] Validating decision', {
            action: decision.action,
            confidence: decision.confidence,
        });

        // Rule 1: Check for duplicate tasks
        if (decision.action === 'create_task' && decision.taskDetails) {
            const duplicateCheck = this.checkDuplicateTask(
                decision.taskDetails,
                context.relatedTasks
            );
            if (duplicateCheck.isDuplicate) {
                blockers.push(
                    `Duplicate task detected: "${duplicateCheck.matchedTask?.title}" ` +
                    `(${(duplicateCheck.similarity * 100).toFixed(0)}% similar)`
                );
                rulesApplied.push('NO_DUPLICATES');
            }
        }

        // Rule 2: Check weekend/holiday scheduling
        if (decision.action === 'create_task' && decision.taskDetails?.dueDate) {
            const scheduleCheck = this.checkWeekendHoliday(
                decision.taskDetails.dueDate,
                signal.classification?.urgency || 'medium'
            );
            if (!scheduleCheck.isValid) {
                if (signal.classification?.urgency === 'critical') {
                    warnings.push(scheduleCheck.message);
                } else {
                    warnings.push(scheduleCheck.message);
                    if (scheduleCheck.suggestedDate) {
                        adjustments.dueDate = scheduleCheck.suggestedDate;
                        adjustments.reason = 'Moved to next business day';
                    }
                }
                rulesApplied.push('NO_WEEKEND_TASKS');
            }
        }

        // Rule 3: Check high-impact actions
        const impactCheck = this.checkHighImpact(decision, signal);
        if (impactCheck.isHighImpact) {
            adjustments.requiresApproval = true;
            warnings.push(
                `High-impact action detected: ${impactCheck.categories.join(', ')}. ` +
                `Manual approval required.`
            );
            rulesApplied.push('HIGH_IMPACT_APPROVAL');
        }

        // Rule 4: Check VIP senders
        if (signal.sender) {
            const vipCheck = this.checkVIPSender(signal.sender, decision.action);
            if (vipCheck.isVIP && (decision.action === 'ignore' || decision.action === 'delegate')) {
                blockers.push(
                    `Cannot ${decision.action} signal from VIP sender: ${signal.sender}`
                );
                adjustments.action = 'create_task';
                adjustments.priority = 1;
                adjustments.reason = 'VIP sender requires direct action';
                rulesApplied.push('VIP_PROTECTION');
            }
        }

        // Rule 5: Check rate limiting
        if (decision.action === 'create_task') {
            const rateLimitCheck = this.checkRateLimit();
            if (!rateLimitCheck.allowed) {
                blockers.push(
                    `Task creation rate limit exceeded: ${rateLimitCheck.count}/` +
                    `${VALIDATION_THRESHOLDS.MAX_TASKS_PER_HOUR} tasks in last hour`
                );
                adjustments.action = 'delegate';
                adjustments.reason = 'Rate limit exceeded, consider batching tasks';
                rulesApplied.push('RATE_LIMIT');
            }
        }

        // Additional adjustments based on context
        this.applyContextualAdjustments(decision, context, adjustments, warnings);

        const valid = blockers.length === 0;
        const validationTime = Date.now() - startTime;

        logger.info('[DecisionValidator] Validation complete', {
            valid,
            warnings: warnings.length,
            blockers: blockers.length,
            adjustments: Object.keys(adjustments).length,
            validationTime: `${validationTime}ms`,
        });

        return {
            valid,
            warnings,
            blockers,
            adjustments,
            validatedAt: new Date().toISOString(),
            rulesApplied,
        };
    }

    /**
     * Apply adjustments to decision
     * 
     * @param decision - Original decision
     * @param adjustments - Adjustments to apply
     * @returns Adjusted decision
     */
    public adjustDecision(
        decision: Decision,
        adjustments: DecisionAdjustment
    ): Decision {
        const adjusted: Decision = { ...decision };

        logger.debug('[DecisionValidator] Applying adjustments', {
            adjustments,
        });

        // Apply action change
        if (adjustments.action) {
            adjusted.action = adjustments.action;
            logger.info(`[DecisionValidator] Action changed: ${decision.action} → ${adjustments.action}`);
        }

        // Apply priority change
        if (adjustments.priority && adjusted.taskDetails) {
            const oldPriority = adjusted.taskDetails.priority;
            adjusted.taskDetails.priority = adjustments.priority;
            logger.info(`[DecisionValidator] Priority adjusted: ${oldPriority} → ${adjustments.priority}`);
        }

        // Apply platform change
        if (adjustments.platform) {
            adjusted.platform = adjustments.platform;
            logger.info(`[DecisionValidator] Platform changed to: ${adjustments.platform}`);
        }

        // Apply assignee change
        if (adjustments.assignee && adjusted.taskDetails) {
            adjusted.taskDetails.assignee = adjustments.assignee;
            logger.info(`[DecisionValidator] Assignee changed to: ${adjustments.assignee}`);
        }

        // Apply due date change
        if (adjustments.dueDate && adjusted.taskDetails) {
            const oldDate = adjusted.taskDetails.dueDate;
            adjusted.taskDetails.dueDate = adjustments.dueDate;
            logger.info(`[DecisionValidator] Due date adjusted: ${oldDate} → ${adjustments.dueDate}`);
        }

        // Apply approval requirement
        if (adjustments.requiresApproval) {
            if (!adjusted.metadata) adjusted.metadata = {};
            adjusted.metadata.requiresApproval = true;
            logger.info('[DecisionValidator] Manual approval required');
        }

        return adjusted;
    }

    /**
     * Record task creation for rate limiting
     * 
     * @param taskId - ID of created task
     */
    public recordTaskCreation(taskId: string): void {
        this.taskCreationHistory.push({
            timestamp: Date.now(),
            taskId,
        });

        // Clean up old entries (>1 hour)
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        this.taskCreationHistory = this.taskCreationHistory.filter(
            entry => entry.timestamp > oneHourAgo
        );

        logger.debug('[DecisionValidator] Task creation recorded', {
            taskId,
            recentCount: this.taskCreationHistory.length,
        });
    }

    // ========================================================================
    // Private Validation Methods
    // ========================================================================

    /**
     * Check for duplicate tasks
     */
    private checkDuplicateTask(
        taskDetails: { title: string },
        existingTasks: Task[]
    ): { isDuplicate: boolean; similarity: number; matchedTask?: Task } {
        let maxSimilarity = 0;
        let matchedTask: Task | undefined;

        for (const existing of existingTasks) {
            // Skip completed tasks
            if (existing.status === 'done') continue;

            const similarity = this.calculateTitleSimilarity(
                taskDetails.title,
                existing.title
            );

            if (similarity > maxSimilarity) {
                maxSimilarity = similarity;
                matchedTask = existing;
            }

            if (similarity >= VALIDATION_THRESHOLDS.DUPLICATE_SIMILARITY) {
                return { isDuplicate: true, similarity, matchedTask: existing };
            }
        }

        return { isDuplicate: false, similarity: maxSimilarity, matchedTask };
    }

    /**
     * Calculate title similarity (0-1)
     */
    private calculateTitleSimilarity(title1: string, title2: string): number {
        // Normalize titles
        const normalize = (str: string) => 
            str.toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .split(/\s+/)
                .filter(w => w.length > 2);

        const words1 = new Set(normalize(title1));
        const words2 = new Set(normalize(title2));

        if (words1.size === 0 || words2.size === 0) return 0;

        // Calculate Jaccard similarity
        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);

        return intersection.size / union.size;
    }

    /**
     * Check weekend/holiday scheduling
     */
    private checkWeekendHoliday(
        dueDate: string,
        urgency: string
    ): { isValid: boolean; message: string; suggestedDate?: string } {
        const date = new Date(dueDate);
        const dayOfWeek = date.getDay();
        const dateStr = date.toISOString().split('T')[0];

        // Check weekend
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            if (urgency === 'critical') {
                return {
                    isValid: true,
                    message: 'Task scheduled on weekend but urgency is critical',
                };
            }

            // Find next Monday
            const nextMonday = new Date(date);
            nextMonday.setDate(date.getDate() + (dayOfWeek === 0 ? 1 : 2));

            return {
                isValid: false,
                message: `Task scheduled on ${dayOfWeek === 0 ? 'Sunday' : 'Saturday'}. Consider rescheduling to next business day.`,
                suggestedDate: nextMonday.toISOString(),
            };
        }

        // Check holiday
        if (US_HOLIDAYS_2025.includes(dateStr)) {
            if (urgency === 'critical') {
                return {
                    isValid: true,
                    message: 'Task scheduled on holiday but urgency is critical',
                };
            }

            // Find next business day
            const nextDay = new Date(date);
            nextDay.setDate(date.getDate() + 1);
            while (nextDay.getDay() === 0 || nextDay.getDay() === 6 || 
                   US_HOLIDAYS_2025.includes(nextDay.toISOString().split('T')[0])) {
                nextDay.setDate(nextDay.getDate() + 1);
            }

            return {
                isValid: false,
                message: 'Task scheduled on holiday. Consider rescheduling to next business day.',
                suggestedDate: nextDay.toISOString(),
            };
        }

        return { isValid: true, message: 'Schedule is valid' };
    }

    /**
     * Check for high-impact actions
     */
    private checkHighImpact(
        decision: Decision,
        signal: Signal
    ): { isHighImpact: boolean; categories: string[] } {
        const categories: string[] = [];
        const content = `${signal.subject || ''} ${signal.body} ${decision.reasoning}`.toLowerCase();

        // Check financial keywords
        if (HIGH_IMPACT_KEYWORDS.financial.some(kw => content.includes(kw))) {
            categories.push('financial');
        }

        // Check external communication keywords
        if (HIGH_IMPACT_KEYWORDS.external.some(kw => content.includes(kw))) {
            categories.push('external communication');
        }

        // Check destructive keywords
        if (HIGH_IMPACT_KEYWORDS.destructive.some(kw => content.includes(kw))) {
            categories.push('destructive operation');
        }

        // Check system keywords
        if (HIGH_IMPACT_KEYWORDS.system.some(kw => content.includes(kw))) {
            categories.push('system change');
        }

        // Check action type
        if (decision.action === 'send_notification' && 
            decision.notificationDetails?.urgent) {
            categories.push('urgent notification');
        }

        return {
            isHighImpact: categories.length > 0,
            categories,
        };
    }

    /**
     * Check if sender is VIP
     */
    private checkVIPSender(
        sender: string,
        action: ActionType
    ): { isVIP: boolean; reason?: string } {
        const senderLower = sender.toLowerCase();

        for (const vip of VIP_SENDERS) {
            if (vip.endsWith('@') ? senderLower.includes(vip) : senderLower === vip) {
                return {
                    isVIP: true,
                    reason: `Sender matches VIP pattern: ${vip}`,
                };
            }
        }

        return { isVIP: false };
    }

    /**
     * Check rate limiting
     */
    private checkRateLimit(): { allowed: boolean; count: number } {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const recentCount = this.taskCreationHistory.filter(
            entry => entry.timestamp > oneHourAgo
        ).length;

        return {
            allowed: recentCount < VALIDATION_THRESHOLDS.MAX_TASKS_PER_HOUR,
            count: recentCount,
        };
    }

    /**
     * Apply contextual adjustments
     */
    private applyContextualAdjustments(
        decision: Decision,
        context: DecisionContext,
        adjustments: DecisionAdjustment,
        warnings: string[]
    ): void {
        // Downgrade priority if queue is full
        if (context.systemState.queueDepth >= VALIDATION_THRESHOLDS.HIGH_QUEUE_THRESHOLD &&
            decision.taskDetails &&
            decision.taskDetails.priority <= 3) {
            
            const newPriority = Math.min(5, decision.taskDetails.priority + 1) as Priority;
            if (!adjustments.priority || adjustments.priority < newPriority) {
                adjustments.priority = newPriority;
                warnings.push(
                    `Queue depth is high (${context.systemState.queueDepth}). ` +
                    `Priority downgraded to ${newPriority}.`
                );
            }
        }

        // Require approval if confidence is borderline
        if (decision.confidence >= VALIDATION_THRESHOLDS.BORDERLINE_CONFIDENCE_MIN &&
            decision.confidence < VALIDATION_THRESHOLDS.BORDERLINE_CONFIDENCE_MAX) {
            
            adjustments.requiresApproval = true;
            warnings.push(
                `Confidence is borderline (${(decision.confidence * 100).toFixed(0)}%). ` +
                `Manual review recommended.`
            );
        }

        // Change platform based on complexity
        if (decision.action === 'create_task' && decision.taskDetails) {
            const descLength = decision.taskDetails.description?.length || 0;
            const hasLabels = (decision.taskDetails.labels?.length || 0) > 3;
            
            // Complex tasks → Notion
            if ((descLength > 500 || hasLabels) && decision.platform !== 'notion') {
                adjustments.platform = 'notion';
                warnings.push('Task complexity suggests Notion over Trello');
            }
            
            // Simple tasks → Trello
            if (descLength < 100 && !hasLabels && decision.platform === 'notion') {
                adjustments.platform = 'trello';
                warnings.push('Simple task can use Trello');
            }
        }

        // Adjust assignee based on availability
        if (decision.taskDetails?.assignee && context.teamAvailability) {
            const member = context.teamAvailability.members.find(
                m => m.email === decision.taskDetails?.assignee
            );
            
            if (member && member.status === 'offline') {
                warnings.push(
                    `Assignee ${decision.taskDetails.assignee} is offline. ` +
                    `Consider reassigning.`
                );
            }
        }

        // Adjust for after-hours
        if (!context.timeContext.isBusinessHours && 
            decision.action === 'send_notification' &&
            decision.notificationDetails?.urgent !== true) {
            
            warnings.push(
                'After business hours. Consider delaying non-urgent notifications.'
            );
        }
    }

    /**
     * Clear rate limit history (for testing)
     */
    public clearHistory(): void {
        this.taskCreationHistory = [];
        logger.info('[DecisionValidator] History cleared');
    }
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Get singleton validator instance
 */
export function getDecisionValidator(): DecisionValidator {
    return DecisionValidator.getInstance();
}

/**
 * Export default instance
 */
export default getDecisionValidator();
