/**
 * Reasoning Pipeline
 * 
 * Orchestrates the complete reasoning flow from signal to action:
 * 1. Preprocess signal (clean, extract entities)
 * 2. Classify signal (urgency, importance, category)
 * 3. Check cache for similar past decisions
 * 4. Decide action (based on classification and context)
 * 5. Extract task details (if creating task)
 * 6. Build action parameters (platform-specific)
 * 7. Validate everything end-to-end
 * 8. Return complete reasoning result
 * 
 * Features:
 * - Complete end-to-end orchestration
 * - Graceful error handling with fallbacks
 * - Stage-level telemetry and metrics
 * - Batch processing support
 * - Cache integration
 * - Comprehensive logging
 */

import { getSignalProcessor, type PreprocessedSignal } from './preprocessing';
import { getClassifierAgent, type SignalClassification } from './classifier-agent';
import { getClassificationCache } from './cache';
import { getDecisionAgent, type ActionDecision } from './decision-agent';
import { 
    getActionParamsBuilder, 
    type TaskDetails, 
    type ActionParams,
    type PlatformType,
} from './action-params-builder';
import logger from '../utils/logger';
import type { Signal } from './reasoning/context-builder';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Pipeline stage names
 */
export type PipelineStage = 
    | 'preprocessing' 
    | 'classification' 
    | 'caching'
    | 'decision' 
    | 'task_extraction' 
    | 'parameter_building'
    | 'validation';

/**
 * Result from preprocessing stage
 */
export interface PreprocessResult {
    /** Preprocessed signal */
    signal: PreprocessedSignal;
    
    /** Processing time in ms */
    processingTime: number;
    
    /** Whether preprocessing succeeded */
    success: boolean;
    
    /** Error message if failed */
    error?: string;
}

/**
 * Result from classification stage
 */
export interface ClassificationResult {
    /** Signal classification */
    classification: SignalClassification;
    
    /** Processing time in ms */
    processingTime: number;
    
    /** Whether classification succeeded */
    success: boolean;
    
    /** Whether result was from cache */
    cached: boolean;
    
    /** Error message if failed */
    error?: string;
}

/**
 * Result from decision stage
 */
export interface DecisionResult {
    /** Action decision */
    decision: ActionDecision;
    
    /** Processing time in ms */
    processingTime: number;
    
    /** Whether decision succeeded */
    success: boolean;
    
    /** Error message if failed */
    error?: string;
}

/**
 * Result from parameter building stage
 */
export interface ParameterBuildResult {
    /** Built action parameters */
    params: ActionParams;
    
    /** Target platform */
    platform: PlatformType;
    
    /** Processing time in ms */
    processingTime: number;
    
    /** Whether building succeeded */
    success: boolean;
    
    /** Validation warnings */
    warnings?: string[];
    
    /** Error message if failed */
    error?: string;
}

/**
 * Complete reasoning pipeline result
 */
export interface ReasoningResult {
    /** Original signal */
    signal: Signal;
    
    /** Preprocessing result */
    preprocessing: PreprocessResult;
    
    /** Classification result */
    classification: ClassificationResult;
    
    /** Decision result */
    decision: DecisionResult;
    
    /** Extracted task details */
    taskDetails?: TaskDetails;
    
    /** Built action parameters */
    actionParams?: ParameterBuildResult;
    
    /** Pipeline metadata */
    metadata: {
        /** Total processing time in ms */
        processingTime: number;
        
        /** Overall confidence score (0-1) */
        confidence: number;
        
        /** Whether classification was cached */
        cached: boolean;
        
        /** Number of warnings */
        warningCount: number;
        
        /** Whether requires human review */
        requiresHumanReview: boolean;
        
        /** Pipeline completion status */
        status: 'success' | 'partial' | 'failed';
        
        /** Stage timings */
        stageTimings: Record<PipelineStage, number>;
    };
    
    /** Pipeline errors (if any) */
    errors?: Array<{
        stage: PipelineStage;
        error: string;
        timestamp: string;
    }>;
}

/**
 * Batch processing result
 */
export interface BatchReasoningResult {
    /** Successfully processed results */
    successful: ReasoningResult[];
    
    /** Failed processing attempts */
    failed: Array<{
        signal: Signal;
        error: string;
        stage: PipelineStage;
    }>;
    
    /** Total processing time */
    totalTime: number;
    
    /** Batch statistics */
    stats: {
        total: number;
        successful: number;
        failed: number;
        cached: number;
        requiresReview: number;
        avgProcessingTime: number;
        avgConfidence: number;
    };
}

/**
 * Pipeline metrics for monitoring
 */
export interface PipelineMetrics {
    /** Total signals processed */
    totalProcessed: number;
    
    /** Successful completions */
    successful: number;
    
    /** Partial completions */
    partial: number;
    
    /** Complete failures */
    failed: number;
    
    /** Cache hit rate */
    cacheHitRate: number;
    
    /** Average processing time per stage */
    avgStageTimings: Record<PipelineStage, number>;
    
    /** Total processing time */
    totalProcessingTime: number;
    
    /** Average confidence */
    avgConfidence: number;
    
    /** Signals requiring review */
    requiresReview: number;
    
    /** Error counts by stage */
    errorsByStage: Record<PipelineStage, number>;
    
    /** Success rates by stage */
    successRatesByStage: Record<PipelineStage, number>;
}

/**
 * Pipeline options
 */
export interface PipelineOptions {
    /** Skip preprocessing (use original signal) */
    skipPreprocessing?: boolean;
    
    /** Skip cache lookup */
    skipCache?: boolean;
    
    /** Force fresh classification (bypass cache) */
    forceFresh?: boolean;
    
    /** Target platform for action params */
    targetPlatform?: PlatformType;
    
    /** Custom context to pass to decision agent */
    customContext?: Record<string, any>;
    
    /** Timeout in milliseconds (default: 30000) */
    timeout?: number;
}

// ============================================================================
// Reasoning Pipeline Class
// ============================================================================

/**
 * Orchestrates the complete reasoning flow
 */
export class ReasoningPipeline {
    private static instance: ReasoningPipeline;
    
    // Component instances
    private processor = getSignalProcessor();
    private classifier = getClassifierAgent();
    private cache = getClassificationCache();
    private decisionAgent = getDecisionAgent();
    private paramsBuilder = getActionParamsBuilder();
    
    // Metrics tracking
    private metrics: PipelineMetrics = {
        totalProcessed: 0,
        successful: 0,
        partial: 0,
        failed: 0,
        cacheHitRate: 0,
        avgStageTimings: {
            preprocessing: 0,
            classification: 0,
            caching: 0,
            decision: 0,
            task_extraction: 0,
            parameter_building: 0,
            validation: 0,
        },
        totalProcessingTime: 0,
        avgConfidence: 0,
        requiresReview: 0,
        errorsByStage: {
            preprocessing: 0,
            classification: 0,
            caching: 0,
            decision: 0,
            task_extraction: 0,
            parameter_building: 0,
            validation: 0,
        },
        successRatesByStage: {
            preprocessing: 1,
            classification: 1,
            caching: 1,
            decision: 1,
            task_extraction: 1,
            parameter_building: 1,
            validation: 1,
        },
    };

    private constructor() {
        logger.info('[ReasoningPipeline] Initialized');
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): ReasoningPipeline {
        if (!ReasoningPipeline.instance) {
            ReasoningPipeline.instance = new ReasoningPipeline();
        }
        return ReasoningPipeline.instance;
    }

    /**
     * Process a single signal through the complete pipeline
     */
    public async processSignal(
        signal: Signal,
        options: PipelineOptions = {}
    ): Promise<ReasoningResult> {
        const pipelineStartTime = Date.now();
        const stageTimings: Record<PipelineStage, number> = {
            preprocessing: 0,
            classification: 0,
            caching: 0,
            decision: 0,
            task_extraction: 0,
            parameter_building: 0,
            validation: 0,
        };
        const errors: ReasoningResult['errors'] = [];
        let warningCount = 0;

        logger.info('[ReasoningPipeline] Starting pipeline', {
            signalId: signal.id,
            source: signal.source,
            skipPreprocessing: options.skipPreprocessing,
            skipCache: options.skipCache,
        });

        try {
            // Stage 1: Preprocessing
            const preprocessResult = await this.runPreprocessing(signal, options);
            stageTimings.preprocessing = preprocessResult.processingTime;
            
            if (!preprocessResult.success) {
                errors.push({
                    stage: 'preprocessing',
                    error: preprocessResult.error || 'Unknown preprocessing error',
                    timestamp: new Date().toISOString(),
                });
                warningCount++;
            }

            const effectiveSignal = preprocessResult.success 
                ? this.convertToSignal(preprocessResult.signal, signal)
                : signal;

            // Stage 2: Classification (with cache check)
            const classificationResult = await this.runClassification(
                effectiveSignal,
                options
            );
            stageTimings.classification = classificationResult.processingTime;
            
            if (!classificationResult.success) {
                errors.push({
                    stage: 'classification',
                    error: classificationResult.error || 'Unknown classification error',
                    timestamp: new Date().toISOString(),
                });
                
                // Classification failure is critical - return early with manual review flag
                return this.createFailureResult(
                    signal,
                    preprocessResult,
                    classificationResult,
                    stageTimings,
                    errors,
                    pipelineStartTime
                );
            }

            // Stage 3: Decision Making
            const decisionResult = await this.runDecision(
                effectiveSignal,
                classificationResult.classification,
                options
            );
            stageTimings.decision = decisionResult.processingTime;
            
            if (!decisionResult.success) {
                errors.push({
                    stage: 'decision',
                    error: decisionResult.error || 'Unknown decision error',
                    timestamp: new Date().toISOString(),
                });
                
                // Decision failure is critical - return early with manual review flag
                return this.createFailureResult(
                    signal,
                    preprocessResult,
                    classificationResult,
                    stageTimings,
                    errors,
                    pipelineStartTime,
                    decisionResult
                );
            }

            // Stage 4: Task Detail Extraction (if creating task)
            let taskDetails: TaskDetails | undefined;
            if (this.shouldExtractTaskDetails(decisionResult.decision.action)) {
                const extractStart = Date.now();
                taskDetails = this.extractTaskDetails(
                    decisionResult.decision,
                    effectiveSignal,
                    classificationResult.classification
                );
                stageTimings.task_extraction = Date.now() - extractStart;
            }

            // Stage 5: Parameter Building
            const parameterResult = await this.runParameterBuilding(
                decisionResult.decision,
                taskDetails,
                effectiveSignal,
                options
            );
            stageTimings.parameter_building = parameterResult.processingTime;
            
            if (!parameterResult.success) {
                errors.push({
                    stage: 'parameter_building',
                    error: parameterResult.error || 'Unknown parameter building error',
                    timestamp: new Date().toISOString(),
                });
                warningCount++;
            }

            if (parameterResult.warnings) {
                warningCount += parameterResult.warnings.length;
            }

            // Calculate metadata
            const totalTime = Date.now() - pipelineStartTime;
            const confidence = this.calculateOverallConfidence(
                classificationResult.classification,
                decisionResult.decision,
                errors.length
            );
            const requiresHumanReview = this.determineReviewRequirement(
                decisionResult.decision,
                classificationResult.classification,
                errors.length
            );

            // Update metrics
            this.updateMetrics(stageTimings, confidence, classificationResult.cached, requiresHumanReview, true);

            const result: ReasoningResult = {
                signal,
                preprocessing: preprocessResult,
                classification: classificationResult,
                decision: decisionResult,
                taskDetails,
                actionParams: parameterResult.success ? parameterResult : undefined,
                metadata: {
                    processingTime: totalTime,
                    confidence,
                    cached: classificationResult.cached,
                    warningCount,
                    requiresHumanReview,
                    status: errors.length === 0 ? 'success' : 'partial',
                    stageTimings,
                },
                errors: errors.length > 0 ? errors : undefined,
            };

            logger.info('[ReasoningPipeline] Pipeline completed', {
                signalId: signal.id,
                status: result.metadata.status,
                processingTime: totalTime,
                confidence,
                requiresReview: requiresHumanReview,
                errorCount: errors.length,
                warningCount,
            });

            return result;

        } catch (error) {
            logger.error('[ReasoningPipeline] Pipeline error', {
                signalId: signal.id,
                error: error instanceof Error ? error.message : String(error),
            });

            this.updateMetrics(stageTimings, 0, false, true, false);

            // Return complete failure result
            return {
                signal,
                preprocessing: {
                    signal: signal as any,
                    processingTime: 0,
                    success: false,
                    error: 'Pipeline failed before preprocessing',
                },
                classification: {
                    classification: this.createDefaultClassification(),
                    processingTime: 0,
                    success: false,
                    cached: false,
                    error: 'Pipeline failed',
                },
                decision: {
                    decision: this.createDefaultDecision(signal),
                    processingTime: 0,
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                },
                metadata: {
                    processingTime: Date.now() - pipelineStartTime,
                    confidence: 0,
                    cached: false,
                    warningCount: 0,
                    requiresHumanReview: true,
                    status: 'failed',
                    stageTimings,
                },
                errors: [{
                    stage: 'preprocessing',
                    error: error instanceof Error ? error.message : String(error),
                    timestamp: new Date().toISOString(),
                }],
            };
        }
    }

    /**
     * Process multiple signals in batch
     */
    public async processBatch(
        signals: Signal[],
        options: PipelineOptions = {}
    ): Promise<BatchReasoningResult> {
        const batchStartTime = Date.now();
        
        logger.info('[ReasoningPipeline] Starting batch processing', {
            count: signals.length,
        });

        const results: ReasoningResult[] = [];
        const failed: BatchReasoningResult['failed'] = [];

        // Process in chunks of 10 for better performance
        const chunkSize = 10;
        for (let i = 0; i < signals.length; i += chunkSize) {
            const chunk = signals.slice(i, i + chunkSize);
            
            const chunkResults = await Promise.allSettled(
                chunk.map(signal => this.processSignal(signal, options))
            );

            for (let j = 0; j < chunkResults.length; j++) {
                const result = chunkResults[j];
                const signal = chunk[j];

                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    failed.push({
                        signal,
                        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
                        stage: 'preprocessing',
                    });
                }
            }
        }

        const totalTime = Date.now() - batchStartTime;
        
        // Calculate statistics
        const stats = {
            total: signals.length,
            successful: results.filter(r => r.metadata.status === 'success').length,
            failed: failed.length,
            cached: results.filter(r => r.metadata.cached).length,
            requiresReview: results.filter(r => r.metadata.requiresHumanReview).length,
            avgProcessingTime: results.length > 0 
                ? results.reduce((sum, r) => sum + r.metadata.processingTime, 0) / results.length 
                : 0,
            avgConfidence: results.length > 0
                ? results.reduce((sum, r) => sum + r.metadata.confidence, 0) / results.length
                : 0,
        };

        logger.info('[ReasoningPipeline] Batch processing completed', {
            total: stats.total,
            successful: stats.successful,
            failed: stats.failed,
            cached: stats.cached,
            requiresReview: stats.requiresReview,
            totalTime,
            avgTime: stats.avgProcessingTime,
        });

        return {
            successful: results,
            failed,
            totalTime,
            stats,
        };
    }

    /**
     * Get current pipeline metrics
     */
    public getMetrics(): Readonly<PipelineMetrics> {
        return { ...this.metrics };
    }

    /**
     * Reset pipeline metrics
     */
    public resetMetrics(): void {
        this.metrics = {
            totalProcessed: 0,
            successful: 0,
            partial: 0,
            failed: 0,
            cacheHitRate: 0,
            avgStageTimings: {
                preprocessing: 0,
                classification: 0,
                caching: 0,
                decision: 0,
                task_extraction: 0,
                parameter_building: 0,
                validation: 0,
            },
            totalProcessingTime: 0,
            avgConfidence: 0,
            requiresReview: 0,
            errorsByStage: {
                preprocessing: 0,
                classification: 0,
                caching: 0,
                decision: 0,
                task_extraction: 0,
                parameter_building: 0,
                validation: 0,
            },
            successRatesByStage: {
                preprocessing: 1,
                classification: 1,
                caching: 1,
                decision: 1,
                task_extraction: 1,
                parameter_building: 1,
                validation: 1,
            },
        };
        
        logger.info('[ReasoningPipeline] Metrics reset');
    }

    // ========================================================================
    // Pipeline Stage Methods
    // ========================================================================

    /**
     * Run preprocessing stage
     */
    private async runPreprocessing(
        signal: Signal,
        options: PipelineOptions
    ): Promise<PreprocessResult> {
        if (options.skipPreprocessing) {
            return {
                signal: signal as any,
                processingTime: 0,
                success: true,
            };
        }

        const startTime = Date.now();

        try {
            const preprocessed = await this.processor.preprocessSignal(signal);
            
            return {
                signal: preprocessed,
                processingTime: Date.now() - startTime,
                success: true,
            };
        } catch (error) {
            logger.warn('[ReasoningPipeline] Preprocessing failed, using original signal', {
                signalId: signal.id,
                error: error instanceof Error ? error.message : String(error),
            });

            return {
                signal: signal as any,
                processingTime: Date.now() - startTime,
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Run classification stage (with cache)
     */
    private async runClassification(
        signal: Signal,
        options: PipelineOptions
    ): Promise<ClassificationResult> {
        const startTime = Date.now();

        try {
            // Check cache first (unless skipped)
            if (!options.skipCache && !options.forceFresh) {
                const cacheKey = this.cache.generateKey({
                    subject: signal.subject || '',
                    body: signal.body,
                    sender: signal.sender || '',
                });

                const cached = this.cache.get(cacheKey);
                if (cached) {
                    logger.debug('[ReasoningPipeline] Classification cache hit', {
                        signalId: signal.id,
                        cacheKey,
                    });

                    return {
                        classification: cached,
                        processingTime: Date.now() - startTime,
                        success: true,
                        cached: true,
                    };
                }
            }

            // Classify signal
            const classification = await this.classifier.classifySignal(signal);

            // Cache the result
            if (!options.skipCache) {
                const cacheKey = this.cache.generateKey({
                    subject: signal.subject || '',
                    body: signal.body,
                    sender: signal.sender || '',
                });
                this.cache.set(cacheKey, classification);
            }

            return {
                classification,
                processingTime: Date.now() - startTime,
                success: true,
                cached: false,
            };
        } catch (error) {
            logger.error('[ReasoningPipeline] Classification failed', {
                signalId: signal.id,
                error: error instanceof Error ? error.message : String(error),
            });

            // Return default classification for manual review
            return {
                classification: this.createDefaultClassification(),
                processingTime: Date.now() - startTime,
                success: false,
                cached: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Run decision stage
     */
    private async runDecision(
        signal: Signal,
        classification: SignalClassification,
        options: PipelineOptions
    ): Promise<DecisionResult> {
        const startTime = Date.now();

        try {
            const decision = await this.decisionAgent.decideAction(
                signal,
                classification,
                { customContext: options.customContext }
            );

            return {
                decision,
                processingTime: Date.now() - startTime,
                success: true,
            };
        } catch (error) {
            logger.error('[ReasoningPipeline] Decision failed', {
                signalId: signal.id,
                error: error instanceof Error ? error.message : String(error),
            });

            // Return default decision for manual review
            return {
                decision: this.createDefaultDecision(signal),
                processingTime: Date.now() - startTime,
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Run parameter building stage
     */
    private async runParameterBuilding(
        decision: ActionDecision,
        taskDetails: TaskDetails | undefined,
        signal: Signal,
        options: PipelineOptions
    ): Promise<ParameterBuildResult> {
        const startTime = Date.now();

        try {
            // Determine target platform
            const platform = options.targetPlatform || 
                           decision.actionParams.platform as PlatformType ||
                           'notion';

            // Build parameters
            if (!taskDetails) {
                // For non-task actions, create minimal task details
                taskDetails = {
                    title: signal.subject || 'Untitled',
                    description: signal.body,
                };
            }

            const result = this.paramsBuilder.buildParams(
                decision.action as any,
                platform,
                taskDetails,
                signal
            );

            if (!result.success) {
                return {
                    params: {} as ActionParams,
                    platform,
                    processingTime: Date.now() - startTime,
                    success: false,
                    error: result.error,
                };
            }

            return {
                params: result.params!,
                platform,
                processingTime: Date.now() - startTime,
                success: true,
                warnings: result.warnings,
            };
        } catch (error) {
            logger.error('[ReasoningPipeline] Parameter building failed', {
                signalId: signal.id,
                error: error instanceof Error ? error.message : String(error),
            });

            return {
                params: {} as ActionParams,
                platform: 'notion',
                processingTime: Date.now() - startTime,
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    // ========================================================================
    // Helper Methods
    // ========================================================================

    /**
     * Convert PreprocessedSignal back to Signal format
     */
    private convertToSignal(preprocessed: PreprocessedSignal, original: Signal): Signal {
        return {
            id: original.id,
            source: original.source,
            subject: preprocessed.cleaned?.subject || original.subject,
            body: preprocessed.cleaned?.body || original.body,
            sender: preprocessed.entities?.people?.[0]?.name || original.sender,
            timestamp: original.timestamp,
        };
    }

    /**
     * Check if task details should be extracted
     */
    private shouldExtractTaskDetails(action: ActionDecision['action']): boolean {
        return action === 'create_task' || action === 'schedule_meeting';
    }

    /**
     * Extract task details from decision
     */
    private extractTaskDetails(
        decision: ActionDecision,
        signal: Signal,
        classification: SignalClassification
    ): TaskDetails {
        return {
            title: decision.actionParams.title || signal.subject || 'Untitled Task',
            description: decision.actionParams.description || signal.body,
            priority: this.mapUrgencyToPriority(classification.urgency),
            dueDate: decision.actionParams.dueDate,
            assignee: decision.actionParams.assignee,
            source: this.mapSignalSource(signal.source),
            metadata: decision.actionParams.metadata,
        };
    }

    /**
     * Map urgency to priority
     */
    private mapUrgencyToPriority(urgency: string): 'High' | 'Medium' | 'Low' {
        if (urgency === 'critical' || urgency === 'high') return 'High';
        if (urgency === 'medium') return 'Medium';
        return 'Low';
    }

    /**
     * Map signal source to task source
     */
    private mapSignalSource(source: Signal['source']): 'Email' | 'Slack' | 'Sheet' {
        if (source === 'slack') return 'Slack';
        if (source === 'sheets') return 'Sheet';
        return 'Email';
    }

    /**
     * Calculate overall confidence
     */
    private calculateOverallConfidence(
        classification: SignalClassification,
        decision: ActionDecision,
        errorCount: number
    ): number {
        let confidence = (classification.confidence + decision.confidence) / 2;
        
        // Penalize for errors
        confidence *= Math.pow(0.9, errorCount);
        
        return Math.max(0, Math.min(1, confidence));
    }

    /**
     * Determine if human review is required
     */
    private determineReviewRequirement(
        decision: ActionDecision,
        classification: SignalClassification,
        errorCount: number
    ): boolean {
        // Explicit approval required
        if (decision.requiresApproval) return true;
        
        // Low confidence
        if (classification.confidence < 0.5 || decision.confidence < 0.5) return true;
        
        // Errors occurred
        if (errorCount > 1) return true;
        
        return false;
    }

    /**
     * Create default classification for failures
     */
    private createDefaultClassification(): SignalClassification {
        return {
            category: 'question',
            urgency: 'medium',
            importance: 'medium',
            confidence: 0.3,
            reasoning: 'Classification failed - manual review required',
            suggestedActions: ['escalate'],
            requiresImmediate: false,
        };
    }

    /**
     * Create default decision for failures
     */
    private createDefaultDecision(signal: Signal): ActionDecision {
        return {
            decisionId: `decision-${Date.now()}`,
            signalId: signal.id,
            action: 'escalate',
            actionParams: {
                title: 'Manual Review Required',
                description: 'Automated processing failed - requires human review',
                priority: 1,
            },
            reasoning: 'Decision process failed - flagged for manual review',
            confidence: 0.3,
            requiresApproval: true,
            validation: {
                valid: false,
                warnings: ['Processing failed'],
                blockers: ['Automated decision unavailable'],
                adjustments: {
                    requiresApproval: true,
                },
                validatedAt: new Date().toISOString(),
                rulesApplied: [],
            },
            timestamp: new Date().toISOString(),
            processingTime: 0,
        };
    }

    /**
     * Create failure result
     */
    private createFailureResult(
        signal: Signal,
        preprocessing: PreprocessResult,
        classification: ClassificationResult,
        stageTimings: Record<PipelineStage, number>,
        errors: ReasoningResult['errors'],
        startTime: number,
        decision?: DecisionResult
    ): ReasoningResult {
        const totalTime = Date.now() - startTime;
        
        this.updateMetrics(stageTimings, 0, classification.cached, true, false);

        return {
            signal,
            preprocessing,
            classification,
            decision: decision || {
                decision: this.createDefaultDecision(signal),
                processingTime: 0,
                success: false,
                error: 'Decision stage not reached',
            },
            metadata: {
                processingTime: totalTime,
                confidence: 0.3,
                cached: classification.cached,
                warningCount: errors?.length || 0,
                requiresHumanReview: true,
                status: 'failed',
                stageTimings,
            },
            errors,
        };
    }

    /**
     * Update pipeline metrics
     */
    private updateMetrics(
        stageTimings: Record<PipelineStage, number>,
        confidence: number,
        cached: boolean,
        requiresReview: boolean,
        success: boolean
    ): void {
        this.metrics.totalProcessed++;
        
        if (success) {
            this.metrics.successful++;
        } else if (confidence > 0) {
            this.metrics.partial++;
        } else {
            this.metrics.failed++;
        }

        // Update stage timings (running average)
        for (const [stage, time] of Object.entries(stageTimings)) {
            const currentAvg = this.metrics.avgStageTimings[stage as PipelineStage];
            this.metrics.avgStageTimings[stage as PipelineStage] = 
                (currentAvg * (this.metrics.totalProcessed - 1) + time) / this.metrics.totalProcessed;
        }

        // Update other metrics
        const total = this.metrics.totalProcessed;
        const currentAvgConfidence = this.metrics.avgConfidence;
        this.metrics.avgConfidence = (currentAvgConfidence * (total - 1) + confidence) / total;

        if (cached) {
            this.metrics.cacheHitRate = 
                (this.metrics.cacheHitRate * (total - 1) + 1) / total;
        } else {
            this.metrics.cacheHitRate = 
                (this.metrics.cacheHitRate * (total - 1)) / total;
        }

        if (requiresReview) {
            this.metrics.requiresReview++;
        }

        const totalTime = Object.values(stageTimings).reduce((sum, t) => sum + t, 0);
        this.metrics.totalProcessingTime += totalTime;
    }
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Get singleton instance of ReasoningPipeline
 */
export function getReasoningPipeline(): ReasoningPipeline {
    return ReasoningPipeline.getInstance();
}

/**
 * Process a signal through the pipeline (convenience function)
 */
export async function processSignal(
    signal: Signal,
    options?: PipelineOptions
): Promise<ReasoningResult> {
    const pipeline = getReasoningPipeline();
    return pipeline.processSignal(signal, options);
}

/**
 * Process multiple signals in batch (convenience function)
 */
export async function processBatch(
    signals: Signal[],
    options?: PipelineOptions
): Promise<BatchReasoningResult> {
    const pipeline = getReasoningPipeline();
    return pipeline.processBatch(signals, options);
}

/**
 * Get pipeline metrics (convenience function)
 */
export function getPipelineMetrics(): Readonly<PipelineMetrics> {
    const pipeline = getReasoningPipeline();
    return pipeline.getMetrics();
}

/**
 * Reset pipeline metrics (convenience function)
 */
export function resetPipelineMetrics(): void {
    const pipeline = getReasoningPipeline();
    pipeline.resetMetrics();
}
