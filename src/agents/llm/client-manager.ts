/**
 * LLM Client Manager
 * Unified interface for multiple LLM providers with automatic fallback,
 * retry logic, token tracking, and cost estimation.
 * 
 * Features:
 * - Multi-provider support (Groq, Together AI, OpenRouter)
 * - Automatic provider fallback
 * - Exponential backoff retry logic
 * - Token usage and cost tracking
 * - Streaming support
 * - Comprehensive error handling
 * - Singleton pattern for global access
 */

import dotenv from 'dotenv';
import {
    ILLMClient,
    LLMProvider,
    LLMMessage,
    LLMChatOptions,
    LLMResponse,
    StreamHandler,
    LLMError,
    LLMErrorType,
    RetryConfig,
    LLMClientManagerConfig,
    ProviderConfig,
    TokenUsage
} from '../../types';
import logger from '../../utils/logger';
import { GroqProvider } from './providers/groq-provider';
import { TogetherProvider } from './providers/together-provider';
import { OpenRouterProvider } from './providers/openrouter-provider';

// Load environment variables
dotenv.config();

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2
};

/**
 * Default model mappings for each provider
 */
const DEFAULT_MODELS = {
    [LLMProvider.GROQ]: 'llama-3.1-70b-versatile',
    [LLMProvider.TOGETHER]: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    [LLMProvider.OPENROUTER]: 'meta-llama/llama-3.1-70b-instruct'
};

/**
 * LLM Client Manager - Manages multiple LLM providers with fallback and retry
 */
export class LLMClientManager {
    private providers: Map<LLMProvider, ILLMClient> = new Map();
    private providerOrder: LLMProvider[];
    private retryConfig: RetryConfig;
    private totalTokensUsed: number = 0;
    private totalCost: number = 0;
    private requestCount: number = 0;
    private enableCostTracking: boolean;
    private enableDetailedLogging: boolean;

    constructor(config?: Partial<LLMClientManagerConfig>) {
        this.retryConfig = config?.retryConfig || DEFAULT_RETRY_CONFIG;
        this.enableCostTracking = config?.enableCostTracking ?? true;
        this.enableDetailedLogging = config?.enableDetailedLogging ?? true;
        
        // Initialize providers based on available API keys
        this.initializeProviders();
        
        // Set provider order (from config or use all available)
        this.providerOrder = config?.providers || this.getDefaultProviderOrder();

        logger.info(`[LLM Manager] Initialized with providers: ${this.providerOrder.join(', ')}`);
        logger.info(`[LLM Manager] Retry config: ${JSON.stringify(this.retryConfig)}`);
    }

    /**
     * Initialize LLM providers based on available API keys
     */
    private initializeProviders(): void {
        // Initialize Groq if API key is available
        const groqKey = process.env.GROQ_API_KEY;
        if (groqKey) {
            try {
                const groqConfig: ProviderConfig = {
                    apiKey: groqKey,
                    defaultModel: process.env.LLM_DEFAULT_MODEL || DEFAULT_MODELS[LLMProvider.GROQ],
                    timeout: 30000,
                    maxRetries: this.retryConfig.maxAttempts
                };
                this.providers.set(LLMProvider.GROQ, new GroqProvider(groqConfig));
                logger.info('[LLM Manager] Groq provider initialized');
            } catch (error) {
                logger.warn('[LLM Manager] Failed to initialize Groq provider:', error);
            }
        }

        // Initialize Together AI if API key is available
        const togetherKey = process.env.TOGETHER_API_KEY;
        if (togetherKey) {
            try {
                const togetherConfig: ProviderConfig = {
                    apiKey: togetherKey,
                    defaultModel: DEFAULT_MODELS[LLMProvider.TOGETHER],
                    timeout: 30000,
                    maxRetries: this.retryConfig.maxAttempts
                };
                this.providers.set(LLMProvider.TOGETHER, new TogetherProvider(togetherConfig));
                logger.info('[LLM Manager] Together AI provider initialized');
            } catch (error) {
                logger.warn('[LLM Manager] Failed to initialize Together AI provider:', error);
            }
        }

        // Initialize OpenRouter if API key is available
        const openRouterKey = process.env.OPENROUTER_API_KEY;
        if (openRouterKey) {
            try {
                const openRouterConfig: ProviderConfig = {
                    apiKey: openRouterKey,
                    defaultModel: DEFAULT_MODELS[LLMProvider.OPENROUTER],
                    timeout: 30000,
                    maxRetries: this.retryConfig.maxAttempts
                };
                this.providers.set(LLMProvider.OPENROUTER, new OpenRouterProvider(openRouterConfig));
                logger.info('[LLM Manager] OpenRouter provider initialized');
            } catch (error) {
                logger.warn('[LLM Manager] Failed to initialize OpenRouter provider:', error);
            }
        }

        if (this.providers.size === 0) {
            throw new Error(
                'No LLM providers configured. Please set at least one of: GROQ_API_KEY, TOGETHER_API_KEY, OPENROUTER_API_KEY'
            );
        }
    }

    /**
     * Get default provider order based on available providers and env config
     */
    private getDefaultProviderOrder(): LLMProvider[] {
        const defaultProvider = (process.env.LLM_DEFAULT_PROVIDER || 'groq') as LLMProvider;
        const availableProviders = Array.from(this.providers.keys());

        // Put default provider first, then others
        const order: LLMProvider[] = [];
        if (availableProviders.includes(defaultProvider)) {
            order.push(defaultProvider);
        }

        availableProviders.forEach(provider => {
            if (provider !== defaultProvider) {
                order.push(provider);
            }
        });

        return order;
    }

    /**
     * Send a chat completion request with automatic retry and fallback
     */
    async chat<T = string>(
        messages: LLMMessage[],
        options?: LLMChatOptions
    ): Promise<LLMResponse<T>> {
        const requestId = ++this.requestCount;
        const startTime = Date.now();

        if (this.enableDetailedLogging) {
            logger.info(`[LLM Manager] Request #${requestId} started with ${messages.length} messages`);
        }

        let lastError: LLMError | null = null;

        // Try each provider in order
        for (const providerType of this.providerOrder) {
            const provider = this.providers.get(providerType);
            if (!provider) {
                continue;
            }

            try {
                // Attempt the request with retry logic
                const response = await this.chatWithRetry<T>(provider, messages, options);
                
                // Track usage and cost
                this.trackUsage(response);

                const totalLatency = Date.now() - startTime;
                logger.info(
                    `[LLM Manager] Request #${requestId} completed successfully using ${providerType} in ${totalLatency}ms`
                );

                return response;
            } catch (error) {
                lastError = error as LLMError;
                logger.warn(
                    `[LLM Manager] Provider ${providerType} failed for request #${requestId}:`,
                    lastError.message
                );

                // If it's an authentication or invalid request error, don't try other providers
                if (
                    lastError.type === LLMErrorType.AUTHENTICATION ||
                    lastError.type === LLMErrorType.INVALID_REQUEST
                ) {
                    break;
                }

                // Continue to next provider
                continue;
            }
        }

        // All providers failed
        const totalLatency = Date.now() - startTime;
        logger.error(
            `[LLM Manager] Request #${requestId} failed after trying all providers (${totalLatency}ms)`
        );

        throw new LLMError(
            LLMErrorType.PROVIDER_ERROR,
            `All LLM providers failed. Last error: ${lastError?.message || 'Unknown error'}`,
            undefined,
            lastError || undefined
        );
    }

    /**
     * Send a streaming chat request with automatic retry and fallback
     */
    async chatStream(
        messages: LLMMessage[],
        handler: StreamHandler,
        options?: LLMChatOptions
    ): Promise<void> {
        const requestId = ++this.requestCount;

        if (this.enableDetailedLogging) {
            logger.info(`[LLM Manager] Stream request #${requestId} started with ${messages.length} messages`);
        }

        let lastError: LLMError | null = null;

        // Try each provider in order
        for (const providerType of this.providerOrder) {
            const provider = this.providers.get(providerType);
            if (!provider) {
                continue;
            }

            try {
                // Attempt streaming with retry logic
                await this.chatStreamWithRetry(provider, messages, handler, options);
                
                logger.info(
                    `[LLM Manager] Stream request #${requestId} completed successfully using ${providerType}`
                );

                return;
            } catch (error) {
                lastError = error as LLMError;
                logger.warn(
                    `[LLM Manager] Provider ${providerType} failed for stream request #${requestId}:`,
                    lastError.message
                );

                // If it's an authentication or invalid request error, don't try other providers
                if (
                    lastError.type === LLMErrorType.AUTHENTICATION ||
                    lastError.type === LLMErrorType.INVALID_REQUEST
                ) {
                    break;
                }

                continue;
            }
        }

        // All providers failed
        logger.error(`[LLM Manager] Stream request #${requestId} failed after trying all providers`);

        const error = new LLMError(
            LLMErrorType.PROVIDER_ERROR,
            `All LLM providers failed for streaming. Last error: ${lastError?.message || 'Unknown error'}`,
            undefined,
            lastError || undefined
        );

        handler.onError(error);
    }

    /**
     * Chat with retry logic for a specific provider
     */
    private async chatWithRetry<T = string>(
        provider: ILLMClient,
        messages: LLMMessage[],
        options?: LLMChatOptions
    ): Promise<LLMResponse<T>> {
        let lastError: Error | null = null;
        let delay = this.retryConfig.initialDelayMs;

        for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
            try {
                return await provider.chat<T>(messages, options);
            } catch (error: any) {
                lastError = error;

                // Don't retry on authentication or invalid request errors
                if (
                    error.type === LLMErrorType.AUTHENTICATION ||
                    error.type === LLMErrorType.INVALID_REQUEST ||
                    error.type === LLMErrorType.MODEL_NOT_FOUND
                ) {
                    throw error;
                }

                if (attempt < this.retryConfig.maxAttempts) {
                    logger.warn(
                        `[LLM Manager] ${provider.provider} attempt ${attempt} failed, retrying in ${delay}ms...`
                    );
                    await this.sleep(delay);
                    delay = Math.min(delay * this.retryConfig.backoffMultiplier, this.retryConfig.maxDelayMs);
                }
            }
        }

        throw lastError;
    }

    /**
     * Chat stream with retry logic for a specific provider
     */
    private async chatStreamWithRetry(
        provider: ILLMClient,
        messages: LLMMessage[],
        handler: StreamHandler,
        options?: LLMChatOptions
    ): Promise<void> {
        let lastError: Error | null = null;
        let delay = this.retryConfig.initialDelayMs;

        for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
            try {
                await provider.chatStream(messages, handler, options);
                return;
            } catch (error: any) {
                lastError = error;

                // Don't retry on authentication or invalid request errors
                if (
                    error.type === LLMErrorType.AUTHENTICATION ||
                    error.type === LLMErrorType.INVALID_REQUEST ||
                    error.type === LLMErrorType.MODEL_NOT_FOUND
                ) {
                    throw error;
                }

                if (attempt < this.retryConfig.maxAttempts) {
                    logger.warn(
                        `[LLM Manager] ${provider.provider} stream attempt ${attempt} failed, retrying in ${delay}ms...`
                    );
                    await this.sleep(delay);
                    delay = Math.min(delay * this.retryConfig.backoffMultiplier, this.retryConfig.maxDelayMs);
                }
            }
        }

        throw lastError;
    }

    /**
     * Track token usage and cost
     */
    private trackUsage(response: LLMResponse<any>): void {
        if (!this.enableCostTracking) {
            return;
        }

        this.totalTokensUsed += response.usage.totalTokens;
        this.totalCost += response.cost.totalCost;

        if (this.enableDetailedLogging) {
            logger.info(
                `[LLM Manager] Usage: +${response.usage.totalTokens} tokens ($${response.cost.totalCost.toFixed(6)}) | Total: ${this.totalTokensUsed} tokens ($${this.totalCost.toFixed(6)})`
            );
        }
    }

    /**
     * Get usage statistics
     */
    getUsageStats() {
        return {
            totalRequests: this.requestCount,
            totalTokens: this.totalTokensUsed,
            totalCost: this.totalCost,
            averageTokensPerRequest: this.requestCount > 0 ? this.totalTokensUsed / this.requestCount : 0,
            averageCostPerRequest: this.requestCount > 0 ? this.totalCost / this.requestCount : 0
        };
    }

    /**
     * Reset usage statistics
     */
    resetUsageStats(): void {
        this.totalTokensUsed = 0;
        this.totalCost = 0;
        this.requestCount = 0;
        logger.info('[LLM Manager] Usage statistics reset');
    }

    /**
     * Get list of available providers
     */
    getAvailableProviders(): LLMProvider[] {
        return Array.from(this.providers.keys());
    }

    /**
     * Check if a specific provider is available
     */
    async isProviderAvailable(provider: LLMProvider): Promise<boolean> {
        const providerClient = this.providers.get(provider);
        if (!providerClient) {
            return false;
        }
        return await providerClient.isAvailable();
    }

    /**
     * Get available models for a provider
     */
    getAvailableModels(provider: LLMProvider): string[] {
        const providerClient = this.providers.get(provider);
        if (!providerClient) {
            return [];
        }
        return providerClient.getAvailableModels();
    }

    /**
     * Sleep utility for retry delays
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Singleton instance
 */
let llmClientInstance: LLMClientManager | null = null;

/**
 * Get or create the singleton LLM client manager instance
 * 
 * @param config Optional configuration (only used on first call)
 * @returns LLMClientManager instance
 */
export function getLLMClient(config?: Partial<LLMClientManagerConfig>): LLMClientManager {
    if (!llmClientInstance) {
        llmClientInstance = new LLMClientManager(config);
        logger.info('[LLM Manager] Singleton instance created');
    }
    return llmClientInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetLLMClient(): void {
    llmClientInstance = null;
    logger.info('[LLM Manager] Singleton instance reset');
}
