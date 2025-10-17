/**
 * OpenRouter Provider Adapter
 * Implements the ILLMClient interface for OpenRouter's API
 * OpenRouter provides access to multiple AI models through a unified API
 */

import OpenAI from 'openai';
import {
    ILLMClient,
    LLMProvider,
    LLMMessage,
    LLMChatOptions,
    LLMResponse,
    StreamHandler,
    TokenUsage,
    CostEstimate,
    LLMError,
    LLMErrorType,
    ProviderConfig
} from '../../../types';
import logger from '../../../utils/logger';

export class OpenRouterProvider implements ILLMClient {
    public readonly provider = LLMProvider.OPENROUTER;
    private client: OpenAI;
    private config: ProviderConfig;

    // OpenRouter available models (selected popular free/cheap ones)
    private readonly AVAILABLE_MODELS = [
        'meta-llama/llama-3.1-70b-instruct',
        'meta-llama/llama-3.1-8b-instruct',
        'mistralai/mixtral-8x7b-instruct',
        'mistralai/mistral-7b-instruct',
        'google/gemma-2-9b-it',
        'anthropic/claude-3-haiku',
        'openai/gpt-3.5-turbo',
        'openai/gpt-4-turbo'
    ];

    // Pricing per 1M tokens (in USD) - these are dynamic, check OpenRouter docs
    private readonly PRICING = {
        'meta-llama/llama-3.1-70b-instruct': { input: 0.52, output: 0.75 },
        'meta-llama/llama-3.1-8b-instruct': { input: 0.06, output: 0.06 },
        'mistralai/mixtral-8x7b-instruct': { input: 0.24, output: 0.24 },
        'mistralai/mistral-7b-instruct': { input: 0.06, output: 0.06 },
        'google/gemma-2-9b-it': { input: 0.08, output: 0.08 },
        'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
        'openai/gpt-3.5-turbo': { input: 0.50, output: 1.50 },
        'openai/gpt-4-turbo': { input: 10.00, output: 30.00 }
    };

    constructor(config: ProviderConfig) {
        this.config = config;
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: 'https://openrouter.ai/api/v1',
            timeout: config.timeout || 30000,
            defaultHeaders: {
                'HTTP-Referer': 'https://github.com/ai-operations-command-center',
                'X-Title': 'AI Operations Command Center'
            }
        });
    }

    /**
     * Send a chat completion request
     */
    async chat<T = string>(
        messages: LLMMessage[],
        options?: LLMChatOptions
    ): Promise<LLMResponse<T>> {
        const startTime = Date.now();
        const model = options?.model || this.config.defaultModel;

        try {
            logger.info(`[OpenRouter] Sending chat request to model: ${model}`);

            const response = await this.client.chat.completions.create({
                model,
                messages: messages.map(msg => {
                    const baseMsg: any = {
                        role: msg.role,
                        content: msg.content
                    };
                    if (msg.name && msg.role === 'function') {
                        baseMsg.name = msg.name;
                    }
                    return baseMsg;
                }),
                temperature: options?.temperature ?? 0.7,
                max_tokens: options?.maxTokens,
                top_p: options?.topP,
                stop: options?.stopSequences,
                stream: false,
                ...(options?.responseFormat === 'json' && {
                    response_format: { type: 'json_object' }
                })
            });

            const latency = Date.now() - startTime;
            const content = response.choices[0]?.message?.content || '';
            
            const usage: TokenUsage = {
                promptTokens: response.usage?.prompt_tokens || 0,
                completionTokens: response.usage?.completion_tokens || 0,
                totalTokens: response.usage?.total_tokens || 0
            };

            const cost = this.calculateCost(model, usage);

            logger.info(`[OpenRouter] Response received in ${latency}ms - Tokens: ${usage.totalTokens}, Cost: $${cost.totalCost.toFixed(6)}`);

            // Parse JSON if requested
            let parsedContent: T;
            if (options?.responseFormat === 'json') {
                try {
                    parsedContent = JSON.parse(content) as T;
                } catch (e) {
                    logger.warn('[OpenRouter] Failed to parse JSON response, returning raw content');
                    parsedContent = content as T;
                }
            } else {
                parsedContent = content as T;
            }

            return {
                content: parsedContent,
                provider: this.provider,
                model,
                usage,
                cost,
                latency,
                timestamp: new Date(),
                finishReason: this.mapFinishReason(response.choices[0]?.finish_reason)
            };
        } catch (error: any) {
            const latency = Date.now() - startTime;
            logger.error(`[OpenRouter] Chat request failed after ${latency}ms:`, error);
            throw this.mapError(error);
        }
    }

    /**
     * Send a streaming chat completion request
     */
    async chatStream(
        messages: LLMMessage[],
        handler: StreamHandler,
        options?: LLMChatOptions
    ): Promise<void> {
        const startTime = Date.now();
        const model = options?.model || this.config.defaultModel;

        try {
            logger.info(`[OpenRouter] Starting streaming chat request to model: ${model}`);

            const stream = await this.client.chat.completions.create({
                model,
                messages: messages.map(msg => {
                    const baseMsg: any = {
                        role: msg.role,
                        content: msg.content
                    };
                    if (msg.name && msg.role === 'function') {
                        baseMsg.name = msg.name;
                    }
                    return baseMsg;
                }),
                temperature: options?.temperature ?? 0.7,
                max_tokens: options?.maxTokens,
                top_p: options?.topP,
                stop: options?.stopSequences,
                stream: true
            });

            let fullContent = '';
            let totalTokens = 0;

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta?.content || '';
                
                if (delta) {
                    fullContent += delta;
                    handler.onChunk({
                        content: delta,
                        done: false
                    });
                }

                totalTokens = Math.ceil(fullContent.length / 4);
            }

            const latency = Date.now() - startTime;
            
            const usage: TokenUsage = {
                promptTokens: Math.ceil(messages.reduce((acc, msg) => acc + msg.content.length, 0) / 4),
                completionTokens: totalTokens,
                totalTokens: Math.ceil(messages.reduce((acc, msg) => acc + msg.content.length, 0) / 4) + totalTokens
            };

            handler.onChunk({ content: '', done: true });
            handler.onComplete(fullContent, usage);

            logger.info(`[OpenRouter] Stream completed in ${latency}ms - Est. Tokens: ${usage.totalTokens}`);
        } catch (error: any) {
            logger.error('[OpenRouter] Streaming chat request failed:', error);
            handler.onError(this.mapError(error));
        }
    }

    /**
     * Check if the provider is available
     */
    async isAvailable(): Promise<boolean> {
        try {
            // Make a minimal request to check availability
            await this.client.models.list();
            return true;
        } catch (error) {
            logger.warn('[OpenRouter] Provider availability check failed:', error);
            return false;
        }
    }

    /**
     * Get available models for this provider
     */
    getAvailableModels(): string[] {
        return [...this.AVAILABLE_MODELS];
    }

    /**
     * Calculate cost for the API call
     */
    private calculateCost(model: string, usage: TokenUsage): CostEstimate {
        const pricing = this.PRICING[model as keyof typeof this.PRICING] || {
            input: 0.50,
            output: 0.50
        };

        const promptCost = (usage.promptTokens / 1_000_000) * pricing.input;
        const completionCost = (usage.completionTokens / 1_000_000) * pricing.output;

        return {
            provider: this.provider,
            model,
            promptCost,
            completionCost,
            totalCost: promptCost + completionCost,
            currency: 'USD'
        };
    }

    /**
     * Map finish reason to our standard format
     */
    private mapFinishReason(reason?: string): 'stop' | 'length' | 'content_filter' | 'function_call' {
        switch (reason) {
            case 'stop':
                return 'stop';
            case 'length':
                return 'length';
            case 'content_filter':
                return 'content_filter';
            default:
                return 'stop';
        }
    }

    /**
     * Map errors to our error format
     */
    private mapError(error: any): LLMError {
        const status = error?.status || error?.response?.status;

        if (status === 401) {
            return new LLMError(
                LLMErrorType.AUTHENTICATION,
                'Invalid OpenRouter API key. Please check your OPENROUTER_API_KEY environment variable.',
                this.provider,
                error
            );
        }

        if (status === 429) {
            return new LLMError(
                LLMErrorType.RATE_LIMIT,
                'OpenRouter rate limit exceeded. Please wait before retrying.',
                this.provider,
                error
            );
        }

        if (status === 400) {
            return new LLMError(
                LLMErrorType.INVALID_REQUEST,
                `Invalid request to OpenRouter: ${error.message}`,
                this.provider,
                error
            );
        }

        if (status === 404) {
            return new LLMError(
                LLMErrorType.MODEL_NOT_FOUND,
                `Model not found on OpenRouter. Available models: ${this.AVAILABLE_MODELS.join(', ')}`,
                this.provider,
                error
            );
        }

        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return new LLMError(
                LLMErrorType.TIMEOUT,
                'OpenRouter request timed out. The service may be experiencing high load.',
                this.provider,
                error
            );
        }

        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return new LLMError(
                LLMErrorType.NETWORK,
                'Network error connecting to OpenRouter. Please check your internet connection.',
                this.provider,
                error
            );
        }

        return new LLMError(
            LLMErrorType.PROVIDER_ERROR,
            `OpenRouter provider error: ${error.message}`,
            this.provider,
            error
        );
    }
}
