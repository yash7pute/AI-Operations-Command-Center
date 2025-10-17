/**
 * Together AI Provider Adapter
 * Implements the ILLMClient interface for Together AI's API
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

export class TogetherProvider implements ILLMClient {
    public readonly provider = LLMProvider.TOGETHER;
    private client: OpenAI;
    private config: ProviderConfig;

    // Together AI available models (selected popular ones)
    private readonly AVAILABLE_MODELS = [
        'meta-llama/Llama-3-70b-chat-hf',
        'meta-llama/Llama-3-8b-chat-hf',
        'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
        'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
        'mistralai/Mixtral-8x7B-Instruct-v0.1',
        'mistralai/Mistral-7B-Instruct-v0.2',
        'Qwen/Qwen2-72B-Instruct',
        'google/gemma-2-9b-it'
    ];

    // Pricing per 1M tokens (in USD) - approximate values
    private readonly PRICING = {
        'meta-llama/Llama-3-70b-chat-hf': { input: 0.90, output: 0.90 },
        'meta-llama/Llama-3-8b-chat-hf': { input: 0.20, output: 0.20 },
        'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': { input: 0.88, output: 0.88 },
        'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': { input: 0.18, output: 0.18 },
        'mistralai/Mixtral-8x7B-Instruct-v0.1': { input: 0.60, output: 0.60 },
        'mistralai/Mistral-7B-Instruct-v0.2': { input: 0.20, output: 0.20 },
        'Qwen/Qwen2-72B-Instruct': { input: 0.90, output: 0.90 },
        'google/gemma-2-9b-it': { input: 0.30, output: 0.30 }
    };

    constructor(config: ProviderConfig) {
        this.config = config;
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: 'https://api.together.xyz/v1',
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
            logger.info(`[Together AI] Sending chat request to model: ${model}`);

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

            logger.info(`[Together AI] Response received in ${latency}ms - Tokens: ${usage.totalTokens}, Cost: $${cost.totalCost.toFixed(6)}`);

            // Parse JSON if requested
            let parsedContent: T;
            if (options?.responseFormat === 'json') {
                try {
                    parsedContent = JSON.parse(content) as T;
                } catch (e) {
                    logger.warn('[Together AI] Failed to parse JSON response, returning raw content');
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
            logger.error(`[Together AI] Chat request failed after ${latency}ms:`, error);
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
            logger.info(`[Together AI] Starting streaming chat request to model: ${model}`);

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

            logger.info(`[Together AI] Stream completed in ${latency}ms - Est. Tokens: ${usage.totalTokens}`);
        } catch (error: any) {
            logger.error('[Together AI] Streaming chat request failed:', error);
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
            logger.warn('[Together AI] Provider availability check failed:', error);
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
                'Invalid Together AI API key. Please check your TOGETHER_API_KEY environment variable.',
                this.provider,
                error
            );
        }

        if (status === 429) {
            return new LLMError(
                LLMErrorType.RATE_LIMIT,
                'Together AI rate limit exceeded. Please wait before retrying.',
                this.provider,
                error
            );
        }

        if (status === 400) {
            return new LLMError(
                LLMErrorType.INVALID_REQUEST,
                `Invalid request to Together AI: ${error.message}`,
                this.provider,
                error
            );
        }

        if (status === 404) {
            return new LLMError(
                LLMErrorType.MODEL_NOT_FOUND,
                `Model not found on Together AI. Available models: ${this.AVAILABLE_MODELS.join(', ')}`,
                this.provider,
                error
            );
        }

        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return new LLMError(
                LLMErrorType.TIMEOUT,
                'Together AI request timed out. The service may be experiencing high load.',
                this.provider,
                error
            );
        }

        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return new LLMError(
                LLMErrorType.NETWORK,
                'Network error connecting to Together AI. Please check your internet connection.',
                this.provider,
                error
            );
        }

        return new LLMError(
            LLMErrorType.PROVIDER_ERROR,
            `Together AI provider error: ${error.message}`,
            this.provider,
            error
        );
    }
}
