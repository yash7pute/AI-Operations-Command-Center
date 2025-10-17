// Shared TypeScript types and interfaces
export interface AppConfig {
  gmailClientId?: string;
  gmailClientSecret?: string;
}
export interface SlackMessage {
    channel: string;
    text: string;
    attachments?: Array<{
        text: string;
        color?: string;
        fields?: Array<{ title: string; value: string; short?: boolean }>;
    }>;
}

export interface GoogleAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

export interface NotionDatabaseQuery {
    filter?: {
        property: string;
        text: {
            contains: string;
        };
    };
    sorts?: Array<{
        property: string;
        direction: 'ascending' | 'descending';
    }>;
}

export interface AppConfig {
    slackToken: string;
    googleAuth: GoogleAuthConfig;
    notionToken: string;
}

// ========================================
// LLM Types and Interfaces
// ========================================

/**
 * Supported LLM providers
 */
export enum LLMProvider {
    GROQ = 'groq',
    TOGETHER = 'together',
    OPENROUTER = 'openrouter'
}

/**
 * Message role in the conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'function';

/**
 * Single message in the conversation
 */
export interface LLMMessage {
    role: MessageRole;
    content: string;
    name?: string; // Optional function name for function role
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

/**
 * Cost estimation for LLM call
 */
export interface CostEstimate {
    provider: LLMProvider;
    model: string;
    promptCost: number;
    completionCost: number;
    totalCost: number;
    currency: string;
}

/**
 * Streaming chunk from LLM response
 */
export interface StreamChunk {
    content: string;
    done: boolean;
    tokenCount?: number;
}

/**
 * Options for LLM chat calls
 */
export interface LLMChatOptions {
    model?: string; // Model to use (defaults to provider's default)
    temperature?: number; // 0.0 to 2.0, controls randomness
    maxTokens?: number; // Maximum tokens in response
    topP?: number; // Nucleus sampling parameter
    stream?: boolean; // Enable streaming responses
    responseFormat?: 'text' | 'json'; // Expected response format
    stopSequences?: string[]; // Stop generation at these sequences
    presencePenalty?: number; // -2.0 to 2.0, penalize new tokens
    frequencyPenalty?: number; // -2.0 to 2.0, penalize repeated tokens
    user?: string; // User identifier for tracking
}

/**
 * Structured LLM response
 */
export interface LLMResponse<T = string> {
    content: T; // Response content (string or parsed JSON)
    provider: LLMProvider; // Provider that fulfilled the request
    model: string; // Actual model used
    usage: TokenUsage; // Token usage statistics
    cost: CostEstimate; // Cost estimate
    latency: number; // Response time in milliseconds
    timestamp: Date; // When the response was generated
    finishReason: 'stop' | 'length' | 'content_filter' | 'function_call';
}

/**
 * Streaming response handler
 */
export interface StreamHandler {
    onChunk: (chunk: StreamChunk) => void;
    onComplete: (fullContent: string, usage: TokenUsage) => void;
    onError: (error: Error) => void;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
    apiKey: string;
    baseURL?: string;
    defaultModel: string;
    timeout?: number; // Request timeout in milliseconds
    maxRetries?: number; // Max retry attempts
}

/**
 * LLM Client interface that all providers must implement
 */
export interface ILLMClient {
    provider: LLMProvider;
    
    /**
     * Send a chat completion request
     */
    chat<T = string>(
        messages: LLMMessage[],
        options?: LLMChatOptions
    ): Promise<LLMResponse<T>>;
    
    /**
     * Send a streaming chat completion request
     */
    chatStream(
        messages: LLMMessage[],
        handler: StreamHandler,
        options?: LLMChatOptions
    ): Promise<void>;
    
    /**
     * Check if the provider is available
     */
    isAvailable(): Promise<boolean>;
    
    /**
     * Get available models for this provider
     */
    getAvailableModels(): string[];
}

/**
 * Retry configuration
 */
export interface RetryConfig {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
}

/**
 * LLM Client Manager configuration
 */
export interface LLMClientManagerConfig {
    providers: LLMProvider[]; // Ordered list of providers (first is primary)
    retryConfig?: RetryConfig;
    enableCostTracking?: boolean;
    enableDetailedLogging?: boolean;
}

/**
 * LLM error types
 */
export enum LLMErrorType {
    AUTHENTICATION = 'authentication',
    RATE_LIMIT = 'rate_limit',
    INVALID_REQUEST = 'invalid_request',
    MODEL_NOT_FOUND = 'model_not_found',
    TIMEOUT = 'timeout',
    NETWORK = 'network',
    PROVIDER_ERROR = 'provider_error',
    UNKNOWN = 'unknown'
}

/**
 * Custom error class for LLM operations
 */
export class LLMError extends Error {
    constructor(
        public type: LLMErrorType,
        public message: string,
        public provider?: LLMProvider,
        public originalError?: Error
    ) {
        super(message);
        this.name = 'LLMError';
    }
}

// ========================================
// Token Manager Types
// ========================================

/**
 * Token usage statistics for a provider
 */
export interface ProviderUsage {
    provider: LLMProvider;
    tokensUsed: number;
    requestCount: number;
    estimatedCost: number;
    lastUpdated: string;
}

/**
 * Daily usage statistics
 */
export interface DailyUsage {
    date: string;
    totalTokens: number;
    totalCost: number;
    providers: ProviderUsage[];
}

/**
 * Token usage statistics for dashboard
 */
export interface UsageStats {
    today: DailyUsage;
    yesterday?: DailyUsage;
    currentMonth: {
        totalTokens: number;
        totalCost: number;
        daysActive: number;
    };
    budgetStatus: {
        dailyLimit: number;
        used: number;
        remaining: number;
        percentUsed: number;
        isNearLimit: boolean;
        isOverLimit: boolean;
    };
    topProviders: Array<{
        provider: LLMProvider;
        tokens: number;
        cost: number;
        percentage: number;
    }>;
}

/**
 * Budget check result
 */
export interface BudgetCheckResult {
    allowed: boolean;
    reason?: string;
    remainingTokens: number;
    percentUsed: number;
    estimatedCost: number;
}
