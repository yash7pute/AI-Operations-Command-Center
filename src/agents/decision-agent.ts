/**
 * Action Decision Agent
 * 
 * Makes intelligent action decisions based on signal classifications with:
 * - Multi-step decision process (immediate, conflict checking, batching)
 * - Business rule validation
 * - Special case handling (human judgment, ambiguous signals, duplicates)
 * - Batch processing for efficiency
 * - Comprehensive statistics tracking
 */

import { getLLMClient } from './llm/client-manager';
import { getContextBuilder, type Signal, type DecisionContext } from './reasoning/context-builder';
import { getDecisionValidator, type ValidationResult } from './reasoning/decision-validator';
import { actionDecisionPrompt } from './prompts/action-decision-prompts';
import logger from '../utils/logger';
import type { SignalClassification } from './classifier-agent';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Action decision made by the agent
 */
export interface ActionDecision {
    /** Unique decision ID */
    decisionId: string;
    
    /** Signal ID that triggered this decision */
    signalId: string;
    
    /** Recommended action type */
    action: 'create_task' | 'send_notification' | 'update_document' | 'schedule_meeting' | 'ignore' | 'escalate' | 'clarify';
    
    /** Action parameters */
    actionParams: {
        /** Task/meeting title */
        title?: string;
        
        /** Description/body */
        description?: string;
        
        /** Assignee email */
        assignee?: string;
        
        /** Due date (ISO string) */
        dueDate?: string;
        
        /** Priority (1-5) */
        priority?: number;
        
        /** Target platform */
        platform?: 'gmail' | 'slack' | 'sheets' | 'trello' | 'notion';
        
        /** Additional metadata */
        metadata?: Record<string, any>;
    };
    
    /** Reasoning behind the decision */
    reasoning: string;
    
    /** Confidence in decision (0-1) */
    confidence: number;
    
    /** Whether human approval is required */
    requiresApproval: boolean;
    
    /** Business rule validation result */
    validation: ValidationResult;
    
    /** Decision timestamp */
    timestamp: string;
    
    /** Processing time in milliseconds */
    processingTime: number;
}

/**
 * Signal with classification for decision making
 */
export interface SignalWithClassification {
    signal: Signal;
    classification: SignalClassification;
}

/**
 * Batch decision result
 */
export interface BatchDecisionResult {
    /** Successful decisions */
    successful: ActionDecision[];
    
    /** Failed decisions with errors */
    failed: Array<{
        signalId: string;
        error: string;
    }>;
    
    /** Total processing time */
    totalTime: number;
}

/**
 * Decision statistics
 */
export interface DecisionStats {
    /** Total decisions made */
    totalDecisions: number;
    
    /** Decisions by action type */
    byAction: Record<string, number>;
    
    /** Decisions requiring approval */
    approvalsRequired: number;
    
    /** Approval rate (0-1) */
    approvalRate: number;
    
    /** Average processing time (ms) */
    avgProcessingTime: number;
    
    /** Average confidence */
    avgConfidence: number;
    
    /** Decisions by priority */
    byPriority: Record<string, number>;
    
    /** Business rule violations */
    ruleViolations: number;
}

/**
 * Decision options
 */
export interface DecisionOptions {
    /** Whether to force immediate decision */
    forceImmediate?: boolean;
    
    /** Custom context to include */
    customContext?: Partial<DecisionContext>;
    
    /** Skip business rule validation */
    skipValidation?: boolean;
}

// ============================================================================
// Action Decision Agent
// ============================================================================

/**
 * Agent that decides actions based on signal classifications
 */
export class DecisionAgent {
    private static instance: DecisionAgent;
    
    /** Decision statistics */
    private stats: {
        totalDecisions: number;
        byAction: Map<string, number>;
        approvalsRequired: number;
        processingTimes: number[];
        confidences: number[];
        byPriority: Map<number, number>;
        ruleViolations: number;
    };
    
    /** Cache of recent decisions for duplicate detection */
    private recentDecisions: Map<string, ActionDecision>;
    
    private constructor() {
        this.stats = {
            totalDecisions: 0,
            byAction: new Map(),
            approvalsRequired: 0,
            processingTimes: [],
            confidences: [],
            byPriority: new Map(),
            ruleViolations: 0,
        };
        this.recentDecisions = new Map();
        
        logger.info('[DecisionAgent] Initialized');
    }
    
    /**
     * Get singleton instance
     */
    public static getInstance(): DecisionAgent {
        if (!DecisionAgent.instance) {
            DecisionAgent.instance = new DecisionAgent();
        }
        return DecisionAgent.instance;
    }
    
    // ========================================================================
    // Main Decision Logic
    // ========================================================================
    
    /**
     * Decide action for a classified signal
     */
    public async decideAction(
        signal: Signal,
        classification: SignalClassification,
        options: DecisionOptions = {}
    ): Promise<ActionDecision> {
        const startTime = Date.now();
        const decisionId = this.generateDecisionId(signal);
        
        logger.info('[DecisionAgent] Starting decision process', {
            signalId: signal.id,
            category: classification.category,
            urgency: classification.urgency,
            importance: classification.importance,
        });
        
        try {
            // Step 1: Check for special cases first
            const specialCase = this.checkSpecialCases(signal, classification);
            if (specialCase) {
                logger.info('[DecisionAgent] Special case detected', {
                    signalId: signal.id,
                    case: specialCase.action,
                });
                return this.finalizeDecision(specialCase, startTime);
            }
            
            // Step 2: Determine processing strategy based on priority
            const strategy = this.determineProcessingStrategy(classification, options);
            logger.debug('[DecisionAgent] Processing strategy', {
                signalId: signal.id,
                strategy,
            });
            
            // Step 3: Build comprehensive context
            const context = await this.buildDecisionContext(signal, classification, options);
            
            // Step 4: Check for conflicts and dependencies (for high priority)
            if (strategy === 'check_conflicts') {
                const conflicts = await this.checkConflictsAndDependencies(signal, context);
                if (conflicts.hasConflicts) {
                    logger.warn('[DecisionAgent] Conflicts detected', {
                        signalId: signal.id,
                        conflicts: conflicts.details,
                    });
                    // Note: Conflicts detected but context structure doesn't support storing them
                }
            }
            
            // Step 5: Generate action decision prompt
            const prompt = this.generateActionPrompt(signal, classification, context);
            
            // Step 6: Call LLM to get action recommendation
            const llmResponse = await this.callLLM(prompt);
            
            // Step 7: Validate output against schema
            const decision = this.validateAndParseDecision(llmResponse, signal, classification);
            
            // Step 8: Run business rule validation (unless skipped)
            if (!options.skipValidation) {
                const validation = await this.validateDecision(decision, signal, context);
                decision.validation = validation;
                
                // Step 9: Apply adjustments if needed
                if (!validation.valid) {
                    this.applyAdjustments(decision, validation);
                    this.stats.ruleViolations++;
                }
            }
            
            // Step 10: Finalize and log decision
            return this.finalizeDecision(decision, startTime);
            
        } catch (error) {
            logger.error('[DecisionAgent] Decision failed', {
                signalId: signal.id,
                error: error instanceof Error ? error.message : String(error),
            });
            
            // Return safe default decision
            return this.createSafeDefaultDecision(signal, classification, startTime);
        }
    }
    
    /**
     * Batch decide actions for multiple signals
     */
    public async batchDecide(
        signalsWithClassifications: SignalWithClassification[],
        options: DecisionOptions = {}
    ): Promise<BatchDecisionResult> {
        const startTime = Date.now();
        
        logger.info('[DecisionAgent] Starting batch decision', {
            count: signalsWithClassifications.length,
        });
        
        // Separate by processing strategy
        const immediate: SignalWithClassification[] = [];
        const highPriority: SignalWithClassification[] = [];
        const batchable: SignalWithClassification[] = [];
        
        for (const item of signalsWithClassifications) {
            const strategy = this.determineProcessingStrategy(item.classification, options);
            
            if (strategy === 'immediate') {
                immediate.push(item);
            } else if (strategy === 'check_conflicts') {
                highPriority.push(item);
            } else {
                batchable.push(item);
            }
        }
        
        logger.debug('[DecisionAgent] Batch strategy breakdown', {
            immediate: immediate.length,
            highPriority: highPriority.length,
            batchable: batchable.length,
        });
        
        const successful: ActionDecision[] = [];
        const failed: Array<{ signalId: string; error: string }> = [];
        
        // Process immediate signals first (parallel)
        if (immediate.length > 0) {
            const immediateResults = await Promise.allSettled(
                immediate.map(item => this.decideAction(item.signal, item.classification, options))
            );
            
            for (let i = 0; i < immediateResults.length; i++) {
                const result = immediateResults[i];
                if (result.status === 'fulfilled') {
                    successful.push(result.value);
                } else {
                    failed.push({
                        signalId: immediate[i].signal.id,
                        error: result.reason.message || 'Unknown error',
                    });
                }
            }
        }
        
        // Process high priority with conflict checking (sequential to avoid race conditions)
        if (highPriority.length > 0) {
            for (const item of highPriority) {
                try {
                    const decision = await this.decideAction(item.signal, item.classification, options);
                    successful.push(decision);
                } catch (error) {
                    failed.push({
                        signalId: item.signal.id,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    });
                }
            }
        }
        
        // Process batchable signals in chunks of 5 (parallel within chunks)
        if (batchable.length > 0) {
            const chunkSize = 5;
            for (let i = 0; i < batchable.length; i += chunkSize) {
                const chunk = batchable.slice(i, i + chunkSize);
                const chunkResults = await Promise.allSettled(
                    chunk.map(item => this.decideAction(item.signal, item.classification, options))
                );
                
                for (let j = 0; j < chunkResults.length; j++) {
                    const result = chunkResults[j];
                    if (result.status === 'fulfilled') {
                        successful.push(result.value);
                    } else {
                        failed.push({
                            signalId: chunk[j].signal.id,
                            error: result.reason.message || 'Unknown error',
                        });
                    }
                }
            }
        }
        
        const totalTime = Date.now() - startTime;
        
        logger.info('[DecisionAgent] Batch decision complete', {
            successful: successful.length,
            failed: failed.length,
            totalTime: `${totalTime}ms`,
        });
        
        return {
            successful,
            failed,
            totalTime,
        };
    }
    
    // ========================================================================
    // Special Cases
    // ========================================================================
    
    /**
     * Check for special cases that require specific handling
     */
    private checkSpecialCases(
        signal: Signal,
        classification: SignalClassification
    ): ActionDecision | null {
        // Check for duplicate signals
        const duplicateKey = this.generateDuplicateKey(signal);
        const existingDecision = this.recentDecisions.get(duplicateKey);
        
        if (existingDecision) {
            logger.info('[DecisionAgent] Duplicate signal detected', {
                signalId: signal.id,
                originalDecision: existingDecision.decisionId,
            });
            
            return {
                decisionId: this.generateDecisionId(signal),
                signalId: signal.id,
                action: 'ignore',
                actionParams: {
                    metadata: {
                        reason: 'duplicate',
                        originalDecision: existingDecision.decisionId,
                    },
                },
                reasoning: `This signal is a duplicate of signal ${existingDecision.signalId}. Referencing original decision ${existingDecision.decisionId}.`,
                confidence: 0.95,
                requiresApproval: false,
                validation: {
                    valid: true,
                    warnings: [],
                    blockers: [],
                    adjustments: {},
                    validatedAt: new Date().toISOString(),
                    rulesApplied: ['NO_DUPLICATE_TASKS'],
                },
                timestamp: new Date().toISOString(),
                processingTime: 0,
            };
        }
        
        // Check for ambiguous signals (low confidence)
        if (classification.confidence < 0.5) {
            logger.info('[DecisionAgent] Ambiguous signal detected', {
                signalId: signal.id,
                confidence: classification.confidence,
            });
            
            return {
                decisionId: this.generateDecisionId(signal),
                signalId: signal.id,
                action: 'clarify',
                actionParams: {
                    title: `Clarification needed: ${signal.subject || 'Signal'}`,
                    description: `This signal requires clarification due to low confidence (${classification.confidence.toFixed(2)}). Original content: ${signal.body.substring(0, 200)}...`,
                    platform: 'slack',
                    priority: 3,
                },
                reasoning: 'Low classification confidence requires human clarification.',
                confidence: 0.8,
                requiresApproval: false,
                validation: {
                    valid: true,
                    warnings: [],
                    blockers: [],
                    adjustments: {},
                    validatedAt: new Date().toISOString(),
                    rulesApplied: [],
                },
                timestamp: new Date().toISOString(),
                processingTime: 0,
            };
        }
        
        // Check for signals requiring human judgment
        const requiresHumanJudgment = this.checkHumanJudgmentRequired(signal, classification);
        if (requiresHumanJudgment.required) {
            logger.info('[DecisionAgent] Human judgment required', {
                signalId: signal.id,
                reason: requiresHumanJudgment.reason,
            });
            
            return {
                decisionId: this.generateDecisionId(signal),
                signalId: signal.id,
                action: 'escalate',
                actionParams: {
                    title: `Escalation: ${signal.subject || 'Important Signal'}`,
                    description: requiresHumanJudgment.reason,
                    platform: 'slack',
                    priority: 1,
                },
                reasoning: requiresHumanJudgment.reason,
                confidence: 0.9,
                requiresApproval: true,
                validation: {
                    valid: true,
                    warnings: ['Human judgment required'],
                    blockers: [],
                    adjustments: {},
                    validatedAt: new Date().toISOString(),
                    rulesApplied: [],
                },
                timestamp: new Date().toISOString(),
                processingTime: 0,
            };
        }
        
        return null;
    }
    
    /**
     * Check if signal requires human judgment
     */
    private checkHumanJudgmentRequired(
        signal: Signal,
        classification: SignalClassification
    ): { required: boolean; reason: string } {
        // High-stakes financial decisions
        const financialKeywords = ['budget', 'payment', 'invoice', 'contract', 'purchase'];
        const hasFinancialContent = financialKeywords.some(keyword =>
            signal.body.toLowerCase().includes(keyword) || 
            signal.subject?.toLowerCase().includes(keyword)
        );
        
        if (hasFinancialContent && classification.importance === 'high') {
            return {
                required: true,
                reason: 'High-importance financial decision requires human approval.',
            };
        }
        
        // Legal or compliance matters
        const legalKeywords = ['legal', 'compliance', 'regulation', 'lawsuit', 'attorney'];
        const hasLegalContent = legalKeywords.some(keyword =>
            signal.body.toLowerCase().includes(keyword) || 
            signal.subject?.toLowerCase().includes(keyword)
        );
        
        if (hasLegalContent) {
            return {
                required: true,
                reason: 'Legal or compliance matter requires human review.',
            };
        }
        
        // Executive-level communications
        const executiveKeywords = ['ceo', 'cto', 'cfo', 'board', 'executive'];
        const hasExecutiveContent = executiveKeywords.some(keyword =>
            signal.body.toLowerCase().includes(keyword) ||
            (signal.sender && signal.sender.toLowerCase().includes(keyword))
        );
        
        if (hasExecutiveContent && classification.urgency === 'high') {
            return {
                required: true,
                reason: 'Executive-level communication requires human oversight.',
            };
        }
        
        return { required: false, reason: '' };
    }
    
    // ========================================================================
    // Processing Strategy
    // ========================================================================
    
    /**
     * Determine processing strategy based on classification
     */
    private determineProcessingStrategy(
        classification: SignalClassification,
        options: DecisionOptions
    ): 'immediate' | 'check_conflicts' | 'batch' {
        if (options.forceImmediate) {
            return 'immediate';
        }
        
        // Critical/high urgency or high importance signals: process immediately
        if (classification.urgency === 'critical' || 
            classification.urgency === 'high' || 
            classification.importance === 'high') {
            return 'immediate';
        }
        
        // Medium urgency/importance: check for conflicts and dependencies
        if (classification.urgency === 'medium' || classification.importance === 'medium') {
            return 'check_conflicts';
        }
        
        // Low priority: can be batched for efficiency
        return 'batch';
    }
    
    // ========================================================================
    // Context Building
    // ========================================================================
    
    /**
     * Build comprehensive context for decision making
     */
    private async buildDecisionContext(
        signal: Signal,
        classification: SignalClassification,
        options: DecisionOptions
    ): Promise<DecisionContext> {
        const contextBuilder = getContextBuilder();
        const context = await contextBuilder.buildContext(signal);
        
        // Add custom context if provided
        if (options.customContext) {
            Object.assign(context, options.customContext);
        }
        
        return context;
    }
    
    /**
     * Check for conflicts and dependencies
     */
    private async checkConflictsAndDependencies(
        signal: Signal,
        context: DecisionContext
    ): Promise<{ hasConflicts: boolean; details: string[] }> {
        const conflicts: string[] = [];
        
        // Check for high task count
        if (context.relatedTasks && context.relatedTasks.length > 10) {
            conflicts.push(`High number of related tasks (${context.relatedTasks.length})`);
        }
        
        // Check system load
        if (context.systemState && context.systemState.queueDepth > 20) {
            conflicts.push(`High system queue depth (${context.systemState.queueDepth})`);
        }
        
        return {
            hasConflicts: conflicts.length > 0,
            details: conflicts,
        };
    }
    
    // ========================================================================
    // LLM Integration
    // ========================================================================
    
    /**
     * Generate action decision prompt
     */
    private generateActionPrompt(
        signal: Signal,
        classification: SignalClassification,
        context: DecisionContext
    ): string {
        return actionDecisionPrompt(
            signal,
            classification,
            context
        );
    }
    
    /**
     * Call LLM for action recommendation
     */
    private async callLLM(prompt: string): Promise<string> {
        const llmClient = getLLMClient();
        
        const messages = [
            {
                role: 'system' as const,
                content: 'You are an AI assistant that helps decide actions for incoming signals. Respond with a JSON object containing: action, actionParams, reasoning, confidence, requiresApproval.',
            },
            {
                role: 'user' as const,
                content: prompt,
            },
        ];
        
        try {
            const response = await llmClient.chat(messages, {
                temperature: 0.3, // Lower temperature for more consistent decisions
                maxTokens: 500,
            });
            
            return response.content;
        } catch (error) {
            logger.error('[DecisionAgent] LLM call failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }
    
    /**
     * Validate and parse LLM response
     */
    private validateAndParseDecision(
        llmResponse: string,
        signal: Signal,
        classification: SignalClassification
    ): ActionDecision {
        try {
            // Parse JSON response (simple parse since we don't have a schema yet)
            const cleanResponse = llmResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleanResponse) as any;
            
            // Create decision object
            const decision: ActionDecision = {
                decisionId: this.generateDecisionId(signal),
                signalId: signal.id,
                action: parsed.action || 'ignore',
                actionParams: parsed.actionParams || {},
                reasoning: parsed.reasoning || 'No reasoning provided',
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
                requiresApproval: parsed.requiresApproval || false,
                validation: {
                    valid: true,
                    warnings: [],
                    blockers: [],
                    adjustments: {},
                    validatedAt: new Date().toISOString(),
                    rulesApplied: [],
                },
                timestamp: new Date().toISOString(),
                processingTime: 0,
            };
            
            return decision;
        } catch (error) {
            logger.error('[DecisionAgent] Failed to parse LLM response', {
                error: error instanceof Error ? error.message : String(error),
            });
            
            // Return safe default
            return {
                decisionId: this.generateDecisionId(signal),
                signalId: signal.id,
                action: 'ignore',
                actionParams: {},
                reasoning: 'Failed to parse LLM response',
                confidence: 0.3,
                requiresApproval: true,
                validation: {
                    valid: false,
                    warnings: ['Failed to parse LLM response'],
                    blockers: ['Manual review required'],
                    adjustments: {},
                    validatedAt: new Date().toISOString(),
                    rulesApplied: [],
                },
                timestamp: new Date().toISOString(),
                processingTime: 0,
            };
        }
    }
    
    // ========================================================================
    // Validation and Adjustments
    // ========================================================================
    
    /**
     * Validate decision against business rules
     */
    private async validateDecision(
        decision: ActionDecision,
        signal: Signal,
        context: DecisionContext
    ): Promise<ValidationResult> {
        const validator = getDecisionValidator();
        
        // Convert ActionDecision to Decision format expected by validator
        const validatorDecision = {
            action: decision.action as any,
            reasoning: decision.reasoning,
            confidence: decision.confidence,
            platform: decision.actionParams.platform as any,
            taskDetails: decision.action === 'create_task' ? {
                title: decision.actionParams.title || '',
                description: decision.actionParams.description,
                priority: decision.actionParams.priority || 3,
                dueDate: decision.actionParams.dueDate,
                assignee: decision.actionParams.assignee,
            } : undefined,
            metadata: {
                requiresApproval: decision.requiresApproval,
                ...decision.actionParams.metadata,
            },
        };
        
        return validator.validateDecision(
            validatorDecision as any,
            signal,
            context
        );
    }
    
    /**
     * Apply adjustments based on validation violations
     */
    private applyAdjustments(decision: ActionDecision, validation: ValidationResult): void {
        logger.info('[DecisionAgent] Applying adjustments', {
            decisionId: decision.decisionId,
            warnings: validation.warnings.length,
            blockers: validation.blockers.length,
        });
        
        // If there are blockers, require approval
        if (validation.blockers.length > 0) {
            decision.requiresApproval = true;
        }
        
        // Apply adjustments from validation
        if (validation.adjustments.requiresApproval !== undefined) {
            decision.requiresApproval = validation.adjustments.requiresApproval;
        }
        
        if (validation.adjustments.action) {
            decision.action = validation.adjustments.action as any;
            decision.reasoning += ' (Action adjusted due to validation)';
        }
        
        if (validation.adjustments.priority && decision.actionParams.priority) {
            decision.actionParams.priority = validation.adjustments.priority;
        }
        
        // Lower confidence due to warnings and blockers
        const penaltyCount = validation.warnings.length + validation.blockers.length;
        decision.confidence = Math.max(0.3, decision.confidence - (penaltyCount * 0.1));
    }
    
    // ========================================================================
    // Finalization
    // ========================================================================
    
    /**
     * Finalize decision and update statistics
     */
    private finalizeDecision(decision: ActionDecision, startTime: number): ActionDecision {
        const processingTime = Date.now() - startTime;
        decision.processingTime = processingTime;
        
        // Update statistics
        this.stats.totalDecisions++;
        this.stats.byAction.set(
            decision.action,
            (this.stats.byAction.get(decision.action) || 0) + 1
        );
        
        if (decision.requiresApproval) {
            this.stats.approvalsRequired++;
        }
        
        this.stats.processingTimes.push(processingTime);
        this.stats.confidences.push(decision.confidence);
        
        if (decision.actionParams.priority) {
            this.stats.byPriority.set(
                decision.actionParams.priority,
                (this.stats.byPriority.get(decision.actionParams.priority) || 0) + 1
            );
        }
        
        // Cache decision for duplicate detection (keep for 1 hour)
        const duplicateKey = this.generateDuplicateKey({
            id: decision.signalId,
            source: 'email',
            body: '',
            sender: '',
            timestamp: '',
        });
        this.recentDecisions.set(duplicateKey, decision);
        
        // Clean old decisions (older than 1 hour)
        setTimeout(() => {
            this.recentDecisions.delete(duplicateKey);
        }, 60 * 60 * 1000);
        
        logger.info('[DecisionAgent] Decision finalized', {
            decisionId: decision.decisionId,
            signalId: decision.signalId,
            action: decision.action,
            confidence: decision.confidence,
            requiresApproval: decision.requiresApproval,
            processingTime: `${processingTime}ms`,
        });
        
        return decision;
    }
    
    /**
     * Create safe default decision
     */
    private createSafeDefaultDecision(
        signal: Signal,
        classification: SignalClassification,
        startTime: number
    ): ActionDecision {
        return this.finalizeDecision(
            {
                decisionId: this.generateDecisionId(signal),
                signalId: signal.id,
                action: 'ignore',
                actionParams: {
                    metadata: {
                        reason: 'error',
                        fallback: true,
                    },
                },
                reasoning: 'Decision process failed, defaulting to safe action',
                confidence: 0.3,
                requiresApproval: true,
                validation: {
                    valid: false,
                    warnings: ['Decision process failed'],
                    blockers: ['Manual review required'],
                    adjustments: {},
                    validatedAt: new Date().toISOString(),
                    rulesApplied: [],
                },
                timestamp: new Date().toISOString(),
                processingTime: 0,
            },
            startTime
        );
    }
    
    // ========================================================================
    // Helper Functions
    // ========================================================================
    
    /**
     * Generate unique decision ID
     */
    private generateDecisionId(signal: Signal): string {
        return `decision_${signal.id}_${Date.now()}`;
    }
    
    /**
     * Generate duplicate detection key
     */
    private generateDuplicateKey(signal: Signal): string {
        const content = `${signal.subject || ''}|${signal.body.substring(0, 200)}`;
        return Buffer.from(content).toString('base64').substring(0, 32);
    }
    
    // ========================================================================
    // Statistics
    // ========================================================================
    
    /**
     * Get decision statistics
     */
    public getStats(): DecisionStats {
        const avgProcessingTime = this.stats.processingTimes.length > 0
            ? this.stats.processingTimes.reduce((a, b) => a + b, 0) / this.stats.processingTimes.length
            : 0;
        
        const avgConfidence = this.stats.confidences.length > 0
            ? this.stats.confidences.reduce((a, b) => a + b, 0) / this.stats.confidences.length
            : 0;
        
        const approvalRate = this.stats.totalDecisions > 0
            ? this.stats.approvalsRequired / this.stats.totalDecisions
            : 0;
        
        return {
            totalDecisions: this.stats.totalDecisions,
            byAction: Object.fromEntries(this.stats.byAction),
            approvalsRequired: this.stats.approvalsRequired,
            approvalRate,
            avgProcessingTime,
            avgConfidence,
            byPriority: Object.fromEntries(this.stats.byPriority),
            ruleViolations: this.stats.ruleViolations,
        };
    }
    
    /**
     * Reset statistics
     */
    public resetStats(): void {
        this.stats = {
            totalDecisions: 0,
            byAction: new Map(),
            approvalsRequired: 0,
            processingTimes: [],
            confidences: [],
            byPriority: new Map(),
            ruleViolations: 0,
        };
        
        logger.info('[DecisionAgent] Statistics reset');
    }
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Get singleton decision agent instance
 */
export function getDecisionAgent(): DecisionAgent {
    return DecisionAgent.getInstance();
}

/**
 * Get decision statistics
 */
export function getDecisionStats(): DecisionStats {
    return getDecisionAgent().getStats();
}

export default DecisionAgent;
