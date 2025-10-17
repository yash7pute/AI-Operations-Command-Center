/**
 * LLM Module Index
 * Exports all LLM-related functionality
 */

export { getLLMClient, resetLLMClient, LLMClientManager } from './client-manager';
export { GroqProvider } from './providers/groq-provider';
export { TogetherProvider } from './providers/together-provider';
export { OpenRouterProvider } from './providers/openrouter-provider';

// Export token manager
export {
    getTokenManager,
    TokenManager
} from './token-manager';

// Export output validator
export {
    SignalClassificationSchema,
    ActionDecisionSchema,
    TaskDetailsSchema,
    CompleteResponseSchema,
    validateOutput,
    safeValidateOutput,
    parseAndValidate,
    validatePartial,
    isValidOutput,
    getValidationErrors,
    formatValidationErrors,
    getSchemaExample,
    getSchemaDocumentation,
    ValidationError,
    type SignalClassification,
    type ActionDecision,
    type TaskDetails,
    type CompleteResponse
} from './output-validator';

// Re-export types for convenience
export type {
    LLMMessage,
    LLMChatOptions,
    LLMResponse,
    StreamHandler,
    TokenUsage,
    CostEstimate,
    ILLMClient,
    ProviderConfig,
    RetryConfig,
    LLMClientManagerConfig,
    ProviderUsage,
    DailyUsage,
    UsageStats,
    BudgetCheckResult
} from '../../types';

export { LLMProvider, LLMError, LLMErrorType } from '../../types';
