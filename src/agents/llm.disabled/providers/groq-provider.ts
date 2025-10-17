/**
 * Groq LLM Provider Adapter
 * Implements the ILLMClient interface for Groq's API
 */

import Groq from 'groq-sdk';
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

export class GroqProvider implements ILLMClient {
    public readonly provider = LLMProvider.GROQ;
    private client: Groq;
    private config: ProviderConfig;

    // Groq available models
    private readonly AVAILABLE_MODELS = [
        'llama-3.1-70b-versatile',
        'llama-3.1-8b-instant',
        'llama-3.2-1b-preview',
        'llama-3.2-3b-preview',
        'llama-3.2-11b-vision-preview',
        'llama-3.2-90b-vision-preview',
        'mixtral-8x7b-32768',
        'gemma2-9b-it',
        'gemma-7b-it'
    ];

    // Pricing per 1M tokens (in USD)
    private readonly PRICING = {
        'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
        'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
        'llama-3.2-1b-preview': { input: 0.04, output: 0.04 },
        'llama-3.2-3b-preview': { input: 0.06, output: 0.06 },
        'llama-3.2-11b-vision-preview': { input: 0.18, output: 0.18 },
        'llama-3.2-90b-vision-preview': { input: 0.90, output: 1.20 },
        'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
        'gemma2-9b-it': { input: 0.20, output: 0.20 },
        'gemma-7b-it': { input: 0.07, output: 0.07 }
    };

    constructor(config: ProviderConfig) {
        this.config = config;
        this.client = new Groq({
            apiKey: config.apiKey,
            timeout: config.timeout || 30000
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
            logger.info(`[Groq] Sending chat request to model: ${model}`);

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

            logger.info(`[Groq] Response received in ${latency}ms - Tokens: ${usage.totalTokens}, Cost: $${cost.totalCost.toFixed(6)}`);

            // Parse JSON if requested
            let parsedContent: T;
            if (options?.responseFormat === 'json') {
                try {
                    parsedContent = JSON.parse(content) as T;
                } catch (e) {
                    logger.warn('[Groq] Failed to parse JSON response, returning raw content');
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
            logger.error(`[Groq] Chat request failed after ${latency}ms:`, error);
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
            logger.info(`[Groq] Starting streaming chat request to model: ${model}`);

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

                // Estimate token count (rough approximation)
                totalTokens = Math.ceil(fullContent.length / 4);
            }

            const latency = Date.now() - startTime;
            
            // Estimate usage for streaming (Groq doesn't provide usage in streaming mode)
            const usage: TokenUsage = {
                promptTokens: Math.ceil(messages.reduce((acc, msg) => acc + msg.content.length, 0) / 4),
                completionTokens: totalTokens,
                totalTokens: Math.ceil(messages.reduce((acc, msg) => acc + msg.content.length, 0) / 4) + totalTokens
            };

            handler.onChunk({ content: '', done: true });
            handler.onComplete(fullContent, usage);

            logger.info(`[Groq] Stream completed in ${latency}ms - Est. Tokens: ${usage.totalTokens}`);
        } catch (error: any) {
            logger.error('[Groq] Streaming chat request failed:', error);
            handler.onError(this.mapError(error));
        }
    }

    /**
     * Check if the provider is available
     */
    async isAvailable(): Promise<boolean> {
        try {
            // Try to list models as a health check
            await this.client.models.list();
            return true;
        } catch (error) {
            logger.warn('[Groq] Provider availability check failed:', error);
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
            input: 0.10,
            output: 0.10
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
     * Map Groq finish reason to our standard format
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
     * Map Groq errors to our error format
     */
    private mapError(error: any): LLMError {
        if (error.status === 401) {
            return new LLMError(
                LLMErrorType.AUTHENTICATION,
                'Invalid Groq API key. Please check your GROQ_API_KEY environment variable.',
                this.provider,
                error
            );
        }

        if (error.status === 429) {
            return new LLMError(
                LLMErrorType.RATE_LIMIT,
                'Groq rate limit exceeded. Please wait before retrying.',
                this.provider,
                error
            );
        }

        if (error.status === 400) {
            return new LLMError(
                LLMErrorType.INVALID_REQUEST,
                `Invalid request to Groq: ${error.message}`,
                this.provider,
                error
            );
        }

        if (error.status === 404) {
            return new LLMError(
                LLMErrorType.MODEL_NOT_FOUND,
                `Model not found on Groq. Available models: ${this.AVAILABLE_MODELS.join(', ')}`,
                this.provider,
                error
            );
        }

        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return new LLMError(
                LLMErrorType.TIMEOUT,
                'Groq request timed out. The service may be experiencing high load.',
                this.provider,
                error
            );
        }

        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return new LLMError(
                LLMErrorType.NETWORK,
                'Network error connecting to Groq. Please check your internet connection.',
                this.provider,
                error
            );
        }

        return new LLMError(
            LLMErrorType.PROVIDER_ERROR,
            `Groq provider error: ${error.message}`,
            this.provider,
            error
        );
    }
}
