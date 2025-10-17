/**
 * Output Publisher (Prompt 29)
 * 
 * Publishes reasoning results to Member 3's orchestration layer for action execution.
 * Handles validation, formatting, event emission, and approval workflows.
 * 
 * Features:
 * - Event-based publication to Member 3's action executor
 * - Validation of reasoning results before publication
 * - Human review queuing and notification
 * - Retry logic for unavailable services
 * - Audit trail of all published actions
 * - Correlation ID tracking
 * 
 * Events Emitted:
 * - action:ready - Decision ready for immediate execution
 * - action:requires_approval - Decision needs human review
 * - action:rejected - Decision validation failed
 * 
 * @module output-publisher
 */

import eventHub from '../integrations/event-hub';
import logger from '../utils/logger';
import type { ReasoningResult } from './reasoning-pipeline';
import type { ActionDecision } from './decision-agent';
import type { EventPriority } from '../integrations/event-hub';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Published action record for audit trail
 */
export interface PublishedAction {
    /** Unique publication ID */
    publicationId: string;
    
    /** Correlation ID for tracking across systems */
    correlationId: string;
    
    /** Original signal ID that triggered this action */
    signalId: string;
    
    /** Source of the signal */
    signalSource: 'email' | 'slack' | 'sheets';
    
    /** Action decision */
    decision: ActionDecision;
    
    /** Publication status */
    status: 'published' | 'pending_approval' | 'rejected' | 'failed' | 'approved' | 'executed';
    
    /** Event type emitted */
    eventType: 'action:ready' | 'action:requires_approval' | 'action:rejected';
    
    /** Publication timestamp */
    publishedAt: string;
    
    /** Approval/execution timestamp */
    processedAt?: string;
    
    /** Review ID if pending approval */
    reviewId?: string;
    
    /** Rejection reason if applicable */
    rejectionReason?: string;
    
    /** Number of retry attempts */
    retryCount: number;
    
    /** Full reasoning result */
    reasoningResult: ReasoningResult;
}

/**
 * Pending review item
 */
export interface PendingReview {
    /** Unique review ID */
    reviewId: string;
    
    /** Publication ID */
    publicationId: string;
    
    /** Reasoning result */
    reasoningResult: ReasoningResult;
    
    /** Reason for review */
    reason: string;
    
    /** Requested timestamp */
    requestedAt: string;
    
    /** Timeout timestamp (auto-approve/reject) */
    timeoutAt: string;
    
    /** Timeout action */
    timeoutAction: 'approve' | 'reject';
    
    /** Dashboard notification sent */
    notificationSent: boolean;
    
    /** Review status */
    status: 'pending' | 'approved' | 'rejected' | 'timeout';
    
    /** Reviewer (if processed) */
    reviewer?: string;
    
    /** Review notes */
    notes?: string;
}

/**
 * Validation result for reasoning output
 */
export interface ValidationResult {
    /** Whether result is valid and actionable */
    valid: boolean;
    
    /** Validation errors */
    errors: string[];
    
    /** Validation warnings (non-blocking) */
    warnings: string[];
    
    /** Missing required fields */
    missingFields: string[];
    
    /** Validation timestamp */
    validatedAt: string;
}

/**
 * Formatted action for Member 3's executor
 */
export interface FormattedAction {
    /** Action ID */
    actionId: string;
    
    /** Action type */
    actionType: 'create_task' | 'send_notification' | 'update_document' | 'schedule_meeting' | 'ignore' | 'escalate' | 'clarify';
    
    /** Target platform */
    platform: 'gmail' | 'slack' | 'sheets' | 'trello' | 'notion';
    
    /** Action parameters */
    parameters: Record<string, any>;
    
    /** Context for execution */
    context: {
        signalId: string;
        signalSource: string;
        urgency: string;
        confidence: number;
        reasoning: string;
    };
    
    /** Execution priority */
    priority: EventPriority;
    
    /** Correlation ID */
    correlationId: string;
    
    /** Retry policy */
    retryPolicy: {
        maxAttempts: number;
        backoffMs: number;
    };
}

/**
 * Publication statistics
 */
export interface PublicationStats {
    /** Total actions published */
    totalPublished: number;
    
    /** Actions ready for execution */
    readyCount: number;
    
    /** Actions pending approval */
    pendingApprovalCount: number;
    
    /** Actions rejected */
    rejectedCount: number;
    
    /** Failed publications */
    failedCount: number;
    
    /** Average publication time (ms) */
    avgPublicationTime: number;
    
    /** Current retry queue size */
    retryQueueSize: number;
    
    /** Active pending reviews */
    activePendingReviews: number;
}

/**
 * Output publisher configuration
 */
export interface OutputPublisherConfig {
    /** Max retry attempts for publication */
    maxRetryAttempts?: number;
    
    /** Retry interval in ms */
    retryIntervalMs?: number;
    
    /** Review timeout in ms (default 1 hour) */
    reviewTimeoutMs?: number;
    
    /** Default timeout action */
    defaultTimeoutAction?: 'approve' | 'reject';
    
    /** Enable audit logging */
    enableAuditLog?: boolean;
    
    /** Max audit log size */
    maxAuditLogSize?: number;
    
    /** Enable verbose logging */
    verboseLogging?: boolean;
}

// ============================================================================
// Output Publisher Class
// ============================================================================

/**
 * Publishes reasoning results to Member 3's orchestration layer
 */
export class OutputPublisher {
    private config: Required<OutputPublisherConfig>;
    private publishedActions: Map<string, PublishedAction> = new Map();
    private pendingReviews: Map<string, PendingReview> = new Map();
    private retryQueue: PublishedAction[] = [];
    private stats: PublicationStats;
    private retryTimer: NodeJS.Timeout | null = null;
    
    constructor(config: OutputPublisherConfig = {}) {
        this.config = {
            maxRetryAttempts: config.maxRetryAttempts ?? 3,
            retryIntervalMs: config.retryIntervalMs ?? 5000,
            reviewTimeoutMs: config.reviewTimeoutMs ?? 3600000, // 1 hour
            defaultTimeoutAction: config.defaultTimeoutAction ?? 'reject',
            enableAuditLog: config.enableAuditLog ?? true,
            maxAuditLogSize: config.maxAuditLogSize ?? 10000,
            verboseLogging: config.verboseLogging ?? false,
        };
        
        this.stats = {
            totalPublished: 0,
            readyCount: 0,
            pendingApprovalCount: 0,
            rejectedCount: 0,
            failedCount: 0,
            avgPublicationTime: 0,
            retryQueueSize: 0,
            activePendingReviews: 0,
        };
        
        // Start retry processor
        this.startRetryProcessor();
        
        // Start timeout checker
        this.startTimeoutChecker();
        
        logger.info('[OutputPublisher] Initialized', { config: this.config });
    }
    
    // ========================================================================
    // Public API
    // ========================================================================
    
    /**
     * Publish an action decision to Member 3's orchestration layer
     */
    public async publishActionDecision(reasoningResult: ReasoningResult): Promise<string> {
        const startTime = Date.now();
        const publicationId = `pub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const correlationId = `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        logger.info('[OutputPublisher] Publishing action decision', {
            publicationId,
            correlationId,
            signalId: reasoningResult.signal.id,
        });
        
        try {
            // Step 1: Validate result
            const validation = this.validateResult(reasoningResult);
            if (!validation.valid) {
                logger.error('[OutputPublisher] Validation failed', {
                    publicationId,
                    errors: validation.errors,
                });
                
                await this.publishRejection(reasoningResult, validation, publicationId, correlationId);
                return publicationId;
            }
            
            // Log warnings if any
            if (validation.warnings.length > 0) {
                logger.warn('[OutputPublisher] Validation warnings', {
                    publicationId,
                    warnings: validation.warnings,
                });
            }
            
            // Step 2: Format for Member 3
            const formattedAction = this.formatForExecutor(reasoningResult, correlationId);
            
            // Step 3: Determine publication path
            const requiresApproval = reasoningResult.decision.decision.requiresApproval;
            
            let eventType: 'action:ready' | 'action:requires_approval';
            let status: PublishedAction['status'];
            
            if (requiresApproval) {
                eventType = 'action:requires_approval';
                status = 'pending_approval';
            } else {
                eventType = 'action:ready';
                status = 'published';
            }
            
            // Step 4: Store in pending actions queue
            const publishedAction: PublishedAction = {
                publicationId,
                correlationId,
                signalId: reasoningResult.signal.id,
                signalSource: reasoningResult.signal.source,
                decision: reasoningResult.decision.decision,
                status,
                eventType,
                publishedAt: new Date().toISOString(),
                retryCount: 0,
                reasoningResult,
            };
            
            this.publishedActions.set(publicationId, publishedAction);
            
            // Step 5: Emit appropriate event
            try {
                await this.emitActionEvent(eventType, formattedAction, reasoningResult);
                
                // Update statistics
                this.stats.totalPublished++;
                if (requiresApproval) {
                    this.stats.pendingApprovalCount++;
                } else {
                    this.stats.readyCount++;
                }
                
                // Update average publication time
                const publicationTime = Date.now() - startTime;
                this.stats.avgPublicationTime =
                    (this.stats.avgPublicationTime * (this.stats.totalPublished - 1) + publicationTime) /
                    this.stats.totalPublished;
                
                logger.info('[OutputPublisher] Action published successfully', {
                    publicationId,
                    correlationId,
                    eventType,
                    publicationTime,
                });
                
            } catch (error) {
                // If emission fails, add to retry queue
                logger.error('[OutputPublisher] Event emission failed, queuing for retry', {
                    publicationId,
                    error: error instanceof Error ? error.message : String(error),
                });
                
                publishedAction.status = 'failed';
                this.retryQueue.push(publishedAction);
                this.stats.retryQueueSize = this.retryQueue.length;
                this.stats.failedCount++;
            }
            
            return publicationId;
            
        } catch (error) {
            logger.error('[OutputPublisher] Publication failed', {
                publicationId,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
            
            this.stats.failedCount++;
            throw error;
        }
    }
    
    /**
     * Publish action for human review
     */
    public async publishForReview(
        reasoningResult: ReasoningResult,
        reason: string
    ): Promise<string> {
        const reviewId = `review-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const publicationId = `pub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const correlationId = `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        logger.info('[OutputPublisher] Publishing for review', {
            reviewId,
            publicationId,
            reason,
            signalId: reasoningResult.signal.id,
        });
        
        try {
            // Step 1: Queue for approval
            const timeoutAt = new Date(Date.now() + this.config.reviewTimeoutMs).toISOString();
            
            const pendingReview: PendingReview = {
                reviewId,
                publicationId,
                reasoningResult,
                reason,
                requestedAt: new Date().toISOString(),
                timeoutAt,
                timeoutAction: this.config.defaultTimeoutAction,
                notificationSent: false,
                status: 'pending',
            };
            
            this.pendingReviews.set(reviewId, pendingReview);
            this.stats.activePendingReviews = this.pendingReviews.size;
            
            // Step 2: Create published action record
            const publishedAction: PublishedAction = {
                publicationId,
                correlationId,
                signalId: reasoningResult.signal.id,
                signalSource: reasoningResult.signal.source,
                decision: reasoningResult.decision.decision,
                status: 'pending_approval',
                eventType: 'action:requires_approval',
                publishedAt: new Date().toISOString(),
                reviewId,
                retryCount: 0,
                reasoningResult,
            };
            
            this.publishedActions.set(publicationId, publishedAction);
            
            // Step 3: Notify Member 4's dashboard
            await this.notifyDashboard(pendingReview);
            pendingReview.notificationSent = true;
            
            // Step 4: Emit approval event
            const formattedAction = this.formatForExecutor(reasoningResult, correlationId);
            await this.emitActionEvent('action:requires_approval', formattedAction, reasoningResult);
            
            this.stats.totalPublished++;
            this.stats.pendingApprovalCount++;
            
            logger.info('[OutputPublisher] Review queued successfully', {
                reviewId,
                publicationId,
                timeoutAt,
            });
            
            return reviewId;
            
        } catch (error) {
            logger.error('[OutputPublisher] Failed to publish for review', {
                reviewId,
                error: error instanceof Error ? error.message : String(error),
            });
            
            throw error;
        }
    }
    
    /**
     * Approve a pending review
     */
    public async approveReview(reviewId: string, reviewer: string, notes?: string): Promise<void> {
        const review = this.pendingReviews.get(reviewId);
        if (!review) {
            throw new Error(`Review not found: ${reviewId}`);
        }
        
        logger.info('[OutputPublisher] Approving review', { reviewId, reviewer });
        
        review.status = 'approved';
        review.reviewer = reviewer;
        review.notes = notes;
        
        // Update published action
        const publishedAction = this.publishedActions.get(review.publicationId);
        if (publishedAction) {
            publishedAction.status = 'approved';
            publishedAction.processedAt = new Date().toISOString();
            
            // Re-publish as action:ready
            const formattedAction = this.formatForExecutor(
                review.reasoningResult,
                publishedAction.correlationId
            );
            await this.emitActionEvent('action:ready', formattedAction, review.reasoningResult);
            
            this.stats.pendingApprovalCount--;
            this.stats.readyCount++;
        }
        
        // Remove from pending reviews
        this.pendingReviews.delete(reviewId);
        this.stats.activePendingReviews = this.pendingReviews.size;
        
        logger.info('[OutputPublisher] Review approved', { reviewId });
    }
    
    /**
     * Reject a pending review
     */
    public async rejectReview(reviewId: string, reviewer: string, notes?: string): Promise<void> {
        const review = this.pendingReviews.get(reviewId);
        if (!review) {
            throw new Error(`Review not found: ${reviewId}`);
        }
        
        logger.info('[OutputPublisher] Rejecting review', { reviewId, reviewer });
        
        review.status = 'rejected';
        review.reviewer = reviewer;
        review.notes = notes;
        
        // Update published action
        const publishedAction = this.publishedActions.get(review.publicationId);
        if (publishedAction) {
            publishedAction.status = 'rejected';
            publishedAction.processedAt = new Date().toISOString();
            publishedAction.rejectionReason = notes || 'Rejected by reviewer';
            
            this.stats.pendingApprovalCount--;
            this.stats.rejectedCount++;
        }
        
        // Remove from pending reviews
        this.pendingReviews.delete(reviewId);
        this.stats.activePendingReviews = this.pendingReviews.size;
        
        logger.info('[OutputPublisher] Review rejected', { reviewId });
    }
    
    /**
     * Get all published actions (audit trail)
     */
    public getPublishedActions(filters?: {
        status?: PublishedAction['status'];
        signalSource?: 'email' | 'slack' | 'sheets';
        fromDate?: string;
        toDate?: string;
    }): PublishedAction[] {
        let actions = Array.from(this.publishedActions.values());
        
        if (filters) {
            if (filters.status) {
                actions = actions.filter(a => a.status === filters.status);
            }
            if (filters.signalSource) {
                actions = actions.filter(a => a.signalSource === filters.signalSource);
            }
            if (filters.fromDate) {
                actions = actions.filter(a => a.publishedAt >= filters.fromDate!);
            }
            if (filters.toDate) {
                actions = actions.filter(a => a.publishedAt <= filters.toDate!);
            }
        }
        
        return actions.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    }
    
    /**
     * Get pending reviews
     */
    public getPendingReviews(): PendingReview[] {
        return Array.from(this.pendingReviews.values())
            .filter(r => r.status === 'pending')
            .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
    }
    
    /**
     * Get publication statistics
     */
    public getStats(): PublicationStats {
        return { ...this.stats };
    }
    
    /**
     * Clear audit log (keep only recent N entries)
     */
    public clearOldAuditEntries(keepCount: number = 1000): number {
        const actions = Array.from(this.publishedActions.values())
            .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
        
        const toDelete = actions.slice(keepCount);
        toDelete.forEach(action => {
            this.publishedActions.delete(action.publicationId);
        });
        
        logger.info('[OutputPublisher] Cleared old audit entries', {
            deleted: toDelete.length,
            remaining: this.publishedActions.size,
        });
        
        return toDelete.length;
    }
    
    /**
     * Shutdown publisher (clean up timers)
     */
    public shutdown(): void {
        if (this.retryTimer) {
            clearInterval(this.retryTimer);
            this.retryTimer = null;
        }
        
        logger.info('[OutputPublisher] Shutdown complete');
    }
    
    // ========================================================================
    // Private Methods
    // ========================================================================
    
    /**
     * Validate reasoning result before publication
     */
    private validateResult(result: ReasoningResult): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        const missingFields: string[] = [];
        
        // Check required fields
        if (!result.signal) {
            missingFields.push('signal');
        }
        if (!result.decision) {
            missingFields.push('decision');
        }
        if (!result.classification) {
            missingFields.push('classification');
        }
        
        // Check decision completeness
        if (result.decision) {
            const decision = result.decision.decision;
            if (!decision.action) {
                missingFields.push('decision.action');
            }
            if (!decision.actionParams) {
                missingFields.push('decision.actionParams');
            }
            if (decision.confidence === undefined) {
                missingFields.push('decision.confidence');
            }
        }
        
        // Check metadata
        if (!result.metadata) {
            warnings.push('Missing metadata');
        } else {
            if (result.metadata.warningCount > 0) {
                warnings.push(`Decision has ${result.metadata.warningCount} warnings`);
            }
            if (result.metadata.confidence < 0.5) {
                warnings.push(`Low confidence: ${result.metadata.confidence}`);
            }
        }
        
        // Validate errors
        if (result.errors && result.errors.length > 0) {
            errors.push(`Reasoning pipeline has ${result.errors.length} errors`);
        }
        
        // Check if actionable
        if (result.decision?.decision.action === 'ignore') {
            warnings.push('Action type is "ignore" - may not require execution');
        }
        
        const valid = errors.length === 0 && missingFields.length === 0;
        
        return {
            valid,
            errors,
            warnings,
            missingFields,
            validatedAt: new Date().toISOString(),
        };
    }
    
    /**
     * Format reasoning result for Member 3's executor
     */
    private formatForExecutor(
        result: ReasoningResult,
        correlationId: string
    ): FormattedAction {
        const decision = result.decision.decision;
        const classification = result.classification.classification;
        
        // Map urgency to priority
        let priority: EventPriority = 'normal';
        if (classification.urgency === 'critical') {
            priority = 'high';
        } else if (classification.urgency === 'low') {
            priority = 'low';
        }
        
        return {
            actionId: decision.decisionId,
            actionType: decision.action,
            platform: decision.actionParams.platform || 'gmail',
            parameters: decision.actionParams,
            context: {
                signalId: result.signal.id,
                signalSource: result.signal.source,
                urgency: classification.urgency,
                confidence: decision.confidence,
                reasoning: decision.reasoning,
            },
            priority,
            correlationId,
            retryPolicy: {
                maxAttempts: 3,
                backoffMs: 1000,
            },
        };
    }
    
    /**
     * Emit action event to EventHub
     */
    private async emitActionEvent(
        eventType: 'action:ready' | 'action:requires_approval' | 'action:rejected',
        formattedAction: FormattedAction,
        reasoningResult: ReasoningResult
    ): Promise<void> {
        try {
            await eventHub.emitEvent({
                source: 'output-publisher',
                type: eventType,
                data: {
                    action: formattedAction,
                    reasoningResult,
                },
                priority: formattedAction.priority,
                metadata: {
                    correlationId: formattedAction.correlationId,
                    timestamp: new Date().toISOString(),
                },
            });
            
            if (this.config.verboseLogging) {
                logger.info('[OutputPublisher] Event emitted', {
                    eventType,
                    actionId: formattedAction.actionId,
                    correlationId: formattedAction.correlationId,
                });
            }
        } catch (error) {
            logger.error('[OutputPublisher] Failed to emit event', {
                eventType,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }
    
    /**
     * Publish rejection event
     */
    private async publishRejection(
        result: ReasoningResult,
        validation: ValidationResult,
        publicationId: string,
        correlationId: string
    ): Promise<void> {
        const rejectionReason = [
            ...validation.errors,
            ...validation.missingFields.map(f => `Missing field: ${f}`),
        ].join('; ');
        
        const publishedAction: PublishedAction = {
            publicationId,
            correlationId,
            signalId: result.signal.id,
            signalSource: result.signal.source,
            decision: result.decision.decision,
            status: 'rejected',
            eventType: 'action:rejected',
            publishedAt: new Date().toISOString(),
            rejectionReason,
            retryCount: 0,
            reasoningResult: result,
        };
        
        this.publishedActions.set(publicationId, publishedAction);
        
        // Emit rejection event
        try {
            await eventHub.emitEvent({
                source: 'output-publisher',
                type: 'action:rejected',
                data: {
                    publicationId,
                    correlationId,
                    signalId: result.signal.id,
                    reason: rejectionReason,
                    validation,
                },
                priority: 'normal',
            });
            
            this.stats.totalPublished++;
            this.stats.rejectedCount++;
            
        } catch (error) {
            logger.error('[OutputPublisher] Failed to emit rejection event', {
                publicationId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    
    /**
     * Notify Member 4's dashboard about pending review
     */
    private async notifyDashboard(review: PendingReview): Promise<void> {
        try {
            await eventHub.emitEvent({
                source: 'output-publisher',
                type: 'review:pending',
                data: {
                    reviewId: review.reviewId,
                    signalId: review.reasoningResult.signal.id,
                    signalSource: review.reasoningResult.signal.source,
                    action: review.reasoningResult.decision.decision.action,
                    reason: review.reason,
                    requestedAt: review.requestedAt,
                    timeoutAt: review.timeoutAt,
                },
                priority: 'high',
            });
            
            logger.info('[OutputPublisher] Dashboard notified', {
                reviewId: review.reviewId,
            });
        } catch (error) {
            logger.error('[OutputPublisher] Failed to notify dashboard', {
                reviewId: review.reviewId,
                error: error instanceof Error ? error.message : String(error),
            });
            // Non-critical, don't throw
        }
    }
    
    /**
     * Start retry processor for failed publications
     */
    private startRetryProcessor(): void {
        this.retryTimer = setInterval(() => {
            if (this.retryQueue.length === 0) return;
            
            const action = this.retryQueue.shift();
            if (!action) return;
            
            if (action.retryCount >= this.config.maxRetryAttempts) {
                logger.error('[OutputPublisher] Max retries exceeded', {
                    publicationId: action.publicationId,
                    retryCount: action.retryCount,
                });
                action.status = 'failed';
                this.stats.failedCount++;
                return;
            }
            
            action.retryCount++;
            
            logger.info('[OutputPublisher] Retrying publication', {
                publicationId: action.publicationId,
                retryCount: action.retryCount,
            });
            
            // Retry emission
            const formattedAction = this.formatForExecutor(
                action.reasoningResult,
                action.correlationId
            );
            
            this.emitActionEvent(action.eventType, formattedAction, action.reasoningResult)
                .then(() => {
                    action.status = action.eventType === 'action:requires_approval' 
                        ? 'pending_approval' 
                        : 'published';
                    logger.info('[OutputPublisher] Retry successful', {
                        publicationId: action.publicationId,
                    });
                })
                .catch(error => {
                    logger.warn('[OutputPublisher] Retry failed, re-queuing', {
                        publicationId: action.publicationId,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    this.retryQueue.push(action);
                });
            
            this.stats.retryQueueSize = this.retryQueue.length;
        }, this.config.retryIntervalMs);
    }
    
    /**
     * Start timeout checker for pending reviews
     */
    private startTimeoutChecker(): void {
        setInterval(() => {
            const now = Date.now();
            
            for (const [reviewId, review] of this.pendingReviews.entries()) {
                if (review.status !== 'pending') continue;
                
                const timeoutTime = new Date(review.timeoutAt).getTime();
                if (now >= timeoutTime) {
                    logger.warn('[OutputPublisher] Review timeout reached', {
                        reviewId,
                        timeoutAction: review.timeoutAction,
                    });
                    
                    review.status = 'timeout';
                    
                    if (review.timeoutAction === 'approve') {
                        this.approveReview(reviewId, 'system-timeout', 'Auto-approved on timeout')
                            .catch(error => {
                                logger.error('[OutputPublisher] Failed to auto-approve', {
                                    reviewId,
                                    error: error instanceof Error ? error.message : String(error),
                                });
                            });
                    } else {
                        this.rejectReview(reviewId, 'system-timeout', 'Auto-rejected on timeout')
                            .catch(error => {
                                logger.error('[OutputPublisher] Failed to auto-reject', {
                                    reviewId,
                                    error: error instanceof Error ? error.message : String(error),
                                });
                            });
                    }
                }
            }
        }, 60000); // Check every minute
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let publisherInstance: OutputPublisher | null = null;

/**
 * Get or create the output publisher singleton
 */
export function getOutputPublisher(config?: OutputPublisherConfig): OutputPublisher {
    if (!publisherInstance) {
        publisherInstance = new OutputPublisher(config);
    }
    return publisherInstance;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Publish an action decision
 */
export async function publishActionDecision(reasoningResult: ReasoningResult): Promise<string> {
    const publisher = getOutputPublisher();
    return publisher.publishActionDecision(reasoningResult);
}

/**
 * Publish for human review
 */
export async function publishForReview(
    reasoningResult: ReasoningResult,
    reason: string
): Promise<string> {
    const publisher = getOutputPublisher();
    return publisher.publishForReview(reasoningResult, reason);
}

/**
 * Get published actions (audit trail)
 */
export function getPublishedActions(filters?: Parameters<OutputPublisher['getPublishedActions']>[0]): PublishedAction[] {
    const publisher = getOutputPublisher();
    return publisher.getPublishedActions(filters);
}

/**
 * Get publication statistics
 */
export function getPublicationStats(): PublicationStats {
    const publisher = getOutputPublisher();
    return publisher.getStats();
}

// ============================================================================
// Event Interface Documentation for Member 3
// ============================================================================

/**
 * Event Interface Documentation for Member 3's Action Executor
 * 
 * This module emits the following events to EventHub for Member 3's orchestration layer:
 * 
 * 1. action:ready
 *    - Emitted when: A decision is ready for immediate execution (no approval needed)
 *    - Data structure:
 *      {
 *        action: FormattedAction,
 *        reasoningResult: ReasoningResult
 *      }
 *    - Priority: Matches signal urgency (low/normal/high)
 *    - Expected action: Execute the action immediately
 * 
 * 2. action:requires_approval
 *    - Emitted when: A decision requires human review before execution
 *    - Data structure:
 *      {
 *        action: FormattedAction,
 *        reasoningResult: ReasoningResult
 *      }
 *    - Priority: Always 'high'
 *    - Expected action: Queue for human review, do not execute yet
 * 
 * 3. action:rejected
 *    - Emitted when: Validation fails or decision is rejected
 *    - Data structure:
 *      {
 *        publicationId: string,
 *        correlationId: string,
 *        signalId: string,
 *        reason: string,
 *        validation: ValidationResult
 *      }
 *    - Priority: 'normal'
 *    - Expected action: Log rejection, do not execute
 * 
 * FormattedAction Interface:
 * {
 *   actionId: string,              // Unique action identifier
 *   actionType: string,             // create_task, send_notification, etc.
 *   platform: string,               // gmail, slack, sheets, trello, notion
 *   parameters: Record<string, any>, // Platform-specific parameters
 *   context: {
 *     signalId: string,
 *     signalSource: string,
 *     urgency: string,
 *     confidence: number,
 *     reasoning: string
 *   },
 *   priority: 'low' | 'normal' | 'high',
 *   correlationId: string,          // For tracking across systems
 *   retryPolicy: {
 *     maxAttempts: number,
 *     backoffMs: number
 *   }
 * }
 * 
 * Subscription Example:
 * ```typescript
 * import eventHub from '../integrations/event-hub';
 * 
 * // Subscribe to ready actions
 * eventHub.subscribe('action:ready', async (event) => {
 *   const { action, reasoningResult } = event.data;
 *   await executeAction(action);
 * });
 * 
 * // Subscribe to approval-required actions
 * eventHub.subscribe('action:requires_approval', async (event) => {
 *   const { action, reasoningResult } = event.data;
 *   await queueForApproval(action);
 * });
 * 
 * // Subscribe to rejections
 * eventHub.subscribe('action:rejected', async (event) => {
 *   const { publicationId, reason } = event.data;
 *   logger.warn('Action rejected', { publicationId, reason });
 * });
 * ```
 */

// ============================================================================
// Export Default
// ============================================================================

export default {
    getOutputPublisher,
    publishActionDecision,
    publishForReview,
    getPublishedActions,
    getPublicationStats,
};
