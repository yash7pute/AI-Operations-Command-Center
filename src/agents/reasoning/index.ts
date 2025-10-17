/**
 * Reasoning Module Index
 * Exports all reasoning, confidence scoring, context building, and validation functionality
 */

export {
    calculateConfidence,
    getConfidenceLevel,
    getConfidenceLevelDescription,
    getRecommendedAction,
    REQUIRE_APPROVAL_THRESHOLD,
    AUTO_EXECUTE_THRESHOLD,
    ConfidenceLevel,
    type SignalData,
    type ClassificationResult,
    type ConfidenceContext,
    type ConfidenceScore,
} from './confidence-scorer';

export {
    ContextBuilder,
    getContextBuilder,
    type Signal,
    type Task,
    type TimeContext,
    type SystemState,
    type TeamAvailability,
    type DecisionContext,
} from './context-builder';

export {
    DecisionValidator,
    getDecisionValidator,
    VALIDATION_RULES,
    VALIDATION_THRESHOLDS,
    type Decision,
    type ActionType,
    type Priority,
    type ValidationResult,
    type DecisionAdjustment,
    type ValidationRule,
} from './decision-validator';
