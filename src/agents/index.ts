/**
 * Agents Module
 * 
 * Exports all agent functionality including:
 * - Classifier Agent for signal classification
 * - Signal Processor for preprocessing
 * - Classification Cache for performance optimization
 * - Decision Agent for action decision making
 * - Action Parameter Builder for platform-specific parameters
 * - Reasoning Pipeline for complete end-to-end orchestration
 * - LLM client management
 * - Token management
 * - Output validation
 * - Reasoning and confidence scoring
 */

// Classifier Agent
export {
    ClassifierAgent,
    getClassifierAgent,
    type SignalClassification,
    type ClassificationOptions,
    type ClassificationStats,
    type BatchClassificationResult,
} from './classifier-agent';

// Signal Processor
export {
    getSignalProcessor,
    SignalProcessor,
    type PreprocessedSignal,
    type ExtractedData,
    type SignalMetadata,
    type ExtractedEntities,
} from './preprocessing';

// Classification Cache
export {
    ClassificationCache,
    getClassificationCache,
    getCacheStats,
    saveCacheToDisk,
    type CacheEntry,
    type CacheStats,
    type SignalContent,
} from './cache';

// Decision Agent
export {
    getDecisionAgent,
    DecisionAgent,
    type ActionDecision,
    type SignalWithClassification,
    type BatchDecisionResult,
    type DecisionStats,
    type DecisionOptions,
} from './decision-agent';

// Action Parameter Builder
export {
    getActionParamsBuilder,
    ActionParamsBuilder,
    buildActionParams,
    validateTaskDetails,
    type ActionType,
    type PlatformType,
    type TaskDetails,
    type NotionTaskParams,
    type TrelloCardParams,
    type SlackNotificationParams,
    type DriveFileParams,
    type ActionParams,
    type ParamsBuildResult,
    type ParamsBuilderConfig,
} from './action-params-builder';

// Reasoning Pipeline
export {
    getReasoningPipeline,
    ReasoningPipeline,
    processSignal,
    processBatch,
    getPipelineMetrics,
    resetPipelineMetrics,
    type ReasoningResult,
    type BatchReasoningResult,
    type PipelineMetrics,
    type PipelineOptions,
    type PipelineStage,
    type PreprocessResult,
    type ClassificationResult,
    type DecisionResult,
    type ParameterBuildResult,
} from './reasoning-pipeline';

// Human-in-the-Loop Review Manager
export {
    getReviewManager,
    ReviewManager,
    queueForReview,
    getReviewQueue,
    approveAction,
    rejectAction,
    getReviewStats,
    type ReviewItem,
    type ReviewStatus,
    type ReviewReason,
    type RiskLevel,
    type ReviewStats,
    type ReviewManagerConfig,
} from './human-review/review-manager';

// Decision Feedback Tracker
export {
    getFeedbackTracker,
    FeedbackTracker,
    recordFeedback,
    getFeedbackStats,
    generateLearningReport,
    exportForRetraining,
    type FeedbackRecord,
    type FeedbackOutcome,
    type FeedbackStats,
    type LearningInsight,
    type LearningReport,
    type FeedbackExport,
    type FeedbackTrackerConfig,
} from './learning/feedback-tracker';

// Prompt Optimizer
export {
    getPromptOptimizer,
    PromptOptimizer,
    getCurrentPromptVersion,
    optimizeClassificationPrompt,
    optimizeDecisionPrompt,
    type PromptType,
    type PromptExample,
    type PromptTemplate,
    type PromptMetrics,
    type OptimizationAttempt,
    type ABTestConfig,
    type PromptOptimizerConfig,
} from './learning/prompt-optimizer';

// Pattern Recognizer
export {
    getPatternRecognizer,
    PatternRecognizer,
    recognizePatterns,
    applyPatterns,
    updatePatterns,
    type UrgencyKeyword,
    type SenderPattern,
    type TimePattern,
    type CategoryActionPattern,
    type SubjectPattern,
    type RecognizedPatterns,
    type PatternApplicationResult,
    type PatternRecognizerConfig,
} from './learning/pattern-recognizer';

// Batch Processor
export {
    getBatchProcessor,
    BatchProcessor,
    addSignalToQueue,
    processBatch as processBatchSignals,
    processQueueNow,
    getBatchStats,
    getBatchHistory,
    clearBatchQueue,
    getBatchQueueSize,
    type BatchProcessorConfig,
    type SignalGroup,
    type BatchRequest,
    type BatchResult,
    type BatchStats,
} from './batch-processor';

// Performance Monitor
export {
    getPerformanceMonitor,
    PerformanceMonitor,
    recordMetric,
    getPerformanceReport,
    detectPerformanceIssues,
    getDashboardMetrics,
    recordQueueDepth,
    setActiveSignals,
    getQueueHistory,
    type PipelineStage as MonitoringPipelineStage,
    type MetricMetadata,
    type PerformanceMetric,
    type StageStats,
    type PerformanceReport,
    type PerformanceIssue,
    type QueueSnapshot,
    type DashboardMetrics,
    type PerformanceMonitorConfig,
} from './monitoring';

// Placeholder for agent logic (LLM orchestration)
export async function runAgents() {
  // TODO: wire LLM provider and implement agent workflows
  return;
}