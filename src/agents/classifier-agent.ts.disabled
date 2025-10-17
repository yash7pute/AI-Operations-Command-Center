/**
 * Signal Classifier Agent
 * 
 * Orchestrates the complete signal classification workflow:
 * - Input validation
 * - Context building
 * - LLM-based classification with retry logic
 * - Output validation and confidence scoring
 * - Result caching and statistics tracking
 * 
 * @module agents/classifier-agent
 */

import logger from '../utils/logger';
import { getContextBuilder, type Signal, type DecisionContext } from './reasoning/context-builder';
import { calculateConfidence, type ConfidenceScore } from './reasoning/confidence-scorer';
import { classificationPrompt, validatePromptLength } from './prompts/classification-prompts';
import { TokenManager } from './llm/token-manager';
import { getLLMClient } from './llm/client-manager';
import { LLMProvider } from '../types';
import { parseAndValidate, SignalClassificationSchema } from './llm/output-validator';

// ============================================================================
// Types
// ============================================================================

/**
 * Signal classification result
 */
export interface SignalClassification {
    urgency: 'critical' | 'high' | 'medium' | 'low';
    importance: 'high' | 'medium' | 'low';
    category: 'incident' | 'request' | 'issue' | 'question' | 'information' | 'discussion' | 'spam';
    reasoning: string;
    suggestedActions: string[];
    confidence: number;
    requiresImmediate: boolean;
}

/**
 * Classification options
 */
export interface ClassificationOptions {
    provider?: LLMProvider;
    includeContext?: boolean;
    skipCache?: boolean;
    maxRetries?: number;
    timeout?: number;
}

/**
 * Classification cache entry
 */
interface ClassificationCacheEntry {
    classification: SignalClassification;
    timestamp: number;
    signalHash: string;
}

/**
 * Classification statistics
 */
export interface ClassificationStats {
    totalClassified: number;
    byCategory: Record<string, number>;
    byUrgency: Record<string, number>;
    byImportance: Record<string, number>;
    averageConfidence: number;
    cacheHitRate: number;
    errorRate: number;
    averageProcessingTime: number;
}

/**
 * Batch classification result
 */
export interface BatchClassificationResult {
    successful: Array<{ signal: Signal; classification: SignalClassification }>;
    failed: Array<{ signal: Signal; error: string }>;
    stats: {
        total: number;
        successful: number;
        failed: number;
        cached: number;
        processingTime: number;
    };
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds
const MAX_SIGNAL_TOKENS = 5000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 30000; // 30 seconds

const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'zh', 'ko'];

// ============================================================================
// Classifier Agent Class
// ============================================================================

export class ClassifierAgent {
    private static instance: ClassifierAgent;
    private cache: Map<string, ClassificationCacheEntry> = new Map();
    private stats = {
        totalClassified: 0,
        totalCacheHits: 0,
        totalErrors: 0,
        totalProcessingTime: 0,
        byCategory: {} as Record<string, number>,
        byUrgency: {} as Record<string, number>,
        byImportance: {} as Record<string, number>,
        confidenceSum: 0,
    };

    private contextBuilder = getContextBuilder();
    private tokenManager = TokenManager.getInstance();
    private llmClient = getLLMClient();

    private constructor() {
        logger.info('[ClassifierAgent] Initialized');
        
        // Start cache cleanup interval
        setInterval(() => this.cleanupCache(), 5 * 60 * 1000); // Every 5 minutes
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): ClassifierAgent {
        if (!ClassifierAgent.instance) {
            ClassifierAgent.instance = new ClassifierAgent();
        }
        return ClassifierAgent.instance;
    }

    /**
     * Classify a signal
     * 
     * @param signal - Signal to classify
     * @param options - Classification options
     * @returns Signal classification with confidence score
     */
    public async classifySignal(
        signal: Signal,
        options?: ClassificationOptions
    ): Promise<SignalClassification> {
        const startTime = Date.now();
        
        try {
            logger.debug('[ClassifierAgent] Starting classification', {
                signalId: signal.id,
                source: signal.source,
            });

            // Step 1: Validate input signal
            this.validateSignalStructure(signal);

            // Step 2: Check for edge cases
            const edgeCase = await this.handleEdgeCases(signal);
            if (edgeCase) {
                this.updateStats(edgeCase, Date.now() - startTime, false);
                return edgeCase;
            }

            // Step 3: Check cache (unless skipCache is true)
            if (!options?.skipCache) {
                const cached = this.getFromCache(signal);
                if (cached) {
                    logger.debug('[ClassifierAgent] Cache hit', { signalId: signal.id });
                    this.stats.totalCacheHits++;
                    this.updateStats(cached, Date.now() - startTime, true);
                    return cached;
                }
            }

            // Step 4: Build context
            let context: DecisionContext | undefined;
            if (options?.includeContext !== false) {
                context = this.contextBuilder.buildContext(signal, {
                    maxRecentSignals: 30,
                    maxRelatedTasks: 15,
                });
            }

            // Step 5: Generate classification prompt
            const prompt = classificationPrompt({
                subject: signal.subject,
                body: signal.body,
                sender: signal.sender,
                timestamp: signal.timestamp,
                source: signal.source === 'sheets' ? 'sheet' : signal.source, // Convert sheets to sheet
                metadata: {},
            });
            
            // Validate prompt length
            const tokenCount = this.tokenManager.countTokens(prompt);
            if (tokenCount > MAX_SIGNAL_TOKENS) {
                logger.warn('[ClassifierAgent] Signal too long, summarizing', {
                    tokens: tokenCount,
                    maxTokens: MAX_SIGNAL_TOKENS,
                });
                const summarized = await this.summarizeSignal(signal);
                return this.classifySignal(summarized, options);
            }

            // Step 6: Call LLM with retry logic
            const provider = options?.provider || LLMProvider.GROQ;
            const maxRetries = options?.maxRetries || DEFAULT_MAX_RETRIES;
            const timeout = options?.timeout || DEFAULT_TIMEOUT;

            const llmResponse = await this.callLLMWithRetry(
                prompt,
                provider,
                maxRetries,
                timeout
            );

            // Step 7: Validate output
            const rawClassification = parseAndValidate(llmResponse, SignalClassificationSchema);
            const validatedClassification = this.validateClassificationOutput(rawClassification);

            // Step 8: Calculate final confidence score
            const confidenceScore = calculateConfidence(
                {
                    subject: signal.subject,
                    body: signal.body,
                    sender: signal.sender,
                    timestamp: signal.timestamp,
                    source: signal.source,
                    metadata: {},
                },
                validatedClassification.confidence,
                {
                    urgency: validatedClassification.urgency,
                    importance: validatedClassification.importance,
                    category: validatedClassification.category,
                    reasoning: validatedClassification.reasoning,
                },
                context ? {
                    similarPastSignals: context.similarSignals.map(s => ({
                        signal: s.body,
                        classification: s.classification?.category || 'unknown',
                        success: true,
                    })),
                    knownSenders: [signal.sender].filter((s): s is string => s !== undefined),
                } : undefined
            );

            const finalClassification: SignalClassification = {
                ...validatedClassification,
                confidence: confidenceScore.score,
                requiresImmediate: validatedClassification.urgency === 'critical' || 
                    (validatedClassification.urgency === 'high' && validatedClassification.importance === 'high'),
            };

            // Step 9: Cache result
            this.saveToCache(signal, finalClassification);

            // Step 10: Update stats and log
            this.updateStats(finalClassification, Date.now() - startTime, false);

            logger.info('[ClassifierAgent] Classification complete', {
                signalId: signal.id,
                urgency: finalClassification.urgency,
                importance: finalClassification.importance,
                category: finalClassification.category,
                confidence: finalClassification.confidence.toFixed(2),
                processingTime: `${Date.now() - startTime}ms`,
            });

            return finalClassification;

        } catch (error) {
            this.stats.totalErrors++;
            logger.error('[ClassifierAgent] Classification failed', {
                signalId: signal.id,
                error: error instanceof Error ? error.message : String(error),
            });

            // Return safe default classification on error
            return {
                urgency: 'medium',
                importance: 'medium',
                category: 'question',
                reasoning: `Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}. Defaulting to manual review.`,
                suggestedActions: ['Manual review required'],
                confidence: 0.3,
                requiresImmediate: false,
            };
        }
    }

    /**
     * Batch classify multiple signals
     * 
     * @param signals - Signals to classify
     * @param options - Classification options
     * @returns Batch classification results
     */
    public async batchClassify(
        signals: Signal[],
        options?: ClassificationOptions
    ): Promise<BatchClassificationResult> {
        const startTime = Date.now();
        
        logger.info('[ClassifierAgent] Starting batch classification', {
            count: signals.length,
        });

        const successful: Array<{ signal: Signal; classification: SignalClassification }> = [];
        const failed: Array<{ signal: Signal; error: string }> = [];
        let cached = 0;

        // Process signals with controlled concurrency
        const batchSize = 5; // Process 5 at a time
        for (let i = 0; i < signals.length; i += batchSize) {
            const batch = signals.slice(i, i + batchSize);
            
            const results = await Promise.allSettled(
                batch.map(signal => this.classifySignal(signal, options))
            );

            results.forEach((result, index) => {
                const signal = batch[index];
                
                if (result.status === 'fulfilled') {
                    successful.push({
                        signal,
                        classification: result.value,
                    });
                    
                    // Check if it was a cache hit
                    const cacheEntry = this.getFromCache(signal);
                    if (cacheEntry) {
                        cached++;
                    }
                } else {
                    failed.push({
                        signal,
                        error: result.reason?.message || 'Unknown error',
                    });
                }
            });

            // Progress log
            logger.debug('[ClassifierAgent] Batch progress', {
                processed: Math.min(i + batchSize, signals.length),
                total: signals.length,
            });
        }

        const processingTime = Date.now() - startTime;

        logger.info('[ClassifierAgent] Batch classification complete', {
            total: signals.length,
            successful: successful.length,
            failed: failed.length,
            cached,
            processingTime: `${processingTime}ms`,
            avgTimePerSignal: `${(processingTime / signals.length).toFixed(0)}ms`,
        });

        return {
            successful,
            failed,
            stats: {
                total: signals.length,
                successful: successful.length,
                failed: failed.length,
                cached,
                processingTime,
            },
        };
    }

    /**
     * Get classification statistics
     * 
     * @returns Classification statistics
     */
    public getClassificationStats(): ClassificationStats {
        const averageConfidence = this.stats.totalClassified > 0
            ? this.stats.confidenceSum / this.stats.totalClassified
            : 0;

        const cacheHitRate = this.stats.totalClassified > 0
            ? (this.stats.totalCacheHits / this.stats.totalClassified) * 100
            : 0;

        const errorRate = (this.stats.totalClassified + this.stats.totalErrors) > 0
            ? (this.stats.totalErrors / (this.stats.totalClassified + this.stats.totalErrors)) * 100
            : 0;

        const averageProcessingTime = this.stats.totalClassified > 0
            ? this.stats.totalProcessingTime / this.stats.totalClassified
            : 0;

        return {
            totalClassified: this.stats.totalClassified,
            byCategory: { ...this.stats.byCategory },
            byUrgency: { ...this.stats.byUrgency },
            byImportance: { ...this.stats.byImportance },
            averageConfidence,
            cacheHitRate,
            errorRate,
            averageProcessingTime,
        };
    }

    /**
     * Clear all statistics and cache
     */
    public clearAll(): void {
        this.cache.clear();
        this.stats = {
            totalClassified: 0,
            totalCacheHits: 0,
            totalErrors: 0,
            totalProcessingTime: 0,
            byCategory: {},
            byUrgency: {},
            byImportance: {},
            confidenceSum: 0,
        };
        logger.info('[ClassifierAgent] Cleared all data');
    }

    // ========================================================================
    // Private Helper Methods
    // ========================================================================

    /**
     * Validate signal structure
     */
    private validateSignalStructure(signal: Signal): void {
        if (!signal.id || typeof signal.id !== 'string') {
            throw new Error('Invalid signal: missing or invalid id');
        }

        if (!signal.source || !['email', 'slack', 'sheets'].includes(signal.source)) {
            throw new Error('Invalid signal: missing or invalid source');
        }

        if (!signal.body || typeof signal.body !== 'string') {
            throw new Error('Invalid signal: missing or invalid body');
        }

        if (!signal.timestamp) {
            throw new Error('Invalid signal: missing timestamp');
        }
    }

    /**
     * Handle edge cases
     */
    private async handleEdgeCases(signal: Signal): Promise<SignalClassification | null> {
        // Empty or very short signal
        if (signal.body.trim().length < 10) {
            logger.warn('[ClassifierAgent] Signal too short, marking as spam', {
                signalId: signal.id,
                bodyLength: signal.body.length,
            });

            return {
                urgency: 'low',
                importance: 'low',
                category: 'spam',
                reasoning: 'Signal body is too short to be meaningful',
                suggestedActions: ['ignore'],
                confidence: 0.95,
                requiresImmediate: false,
            };
        }

        // Malformed signal (missing critical fields)
        if (!signal.subject && signal.source === 'email') {
            logger.warn('[ClassifierAgent] Email signal missing subject', {
                signalId: signal.id,
            });
            // Continue with classification but log warning
        }

        // Check for unsupported language
        const language = this.detectLanguage(signal.body);
        if (language && !SUPPORTED_LANGUAGES.includes(language)) {
            logger.warn('[ClassifierAgent] Unsupported language detected', {
                signalId: signal.id,
                language,
            });

            return {
                urgency: 'medium',
                importance: 'medium',
                category: 'question',
                reasoning: `Unsupported language detected: ${language}. Manual review required.`,
                suggestedActions: ['translate', 'manual_review'],
                confidence: 0.4,
                requiresImmediate: false,
            };
        }

        return null; // No edge case, proceed with normal classification
    }

    /**
     * Summarize long signal
     */
    private async summarizeSignal(signal: Signal): Promise<Signal> {
        logger.info('[ClassifierAgent] Summarizing long signal', {
            signalId: signal.id,
            originalLength: signal.body.length,
        });

        // Simple summarization: take first and last parts
        const maxChars = 2000;
        const halfMax = maxChars / 2;
        
        const summary = signal.body.length > maxChars
            ? signal.body.substring(0, halfMax) + 
              '\n\n[... content truncated ...]\n\n' +
              signal.body.substring(signal.body.length - halfMax)
            : signal.body;

        return {
            ...signal,
            body: summary,
        };
    }

    /**
     * Detect language (simple heuristic)
     */
    private detectLanguage(text: string): string | null {
        // Very simple language detection based on common words
        const lowerText = text.toLowerCase();
        
        if (/\b(the|is|are|was|were|have|has|been)\b/.test(lowerText)) {
            return 'en';
        }
        if (/\b(el|la|los|las|es|está|son|están)\b/.test(lowerText)) {
            return 'es';
        }
        if (/\b(le|la|les|est|sont|a|ont|été)\b/.test(lowerText)) {
            return 'fr';
        }
        if (/\b(der|die|das|ist|sind|hat|haben)\b/.test(lowerText)) {
            return 'de';
        }
        
        // Default to English if uncertain
        return 'en';
    }

    /**
     * Call LLM with retry logic
     */
    private async callLLMWithRetry(
        prompt: string,
        provider: LLMProvider,
        maxRetries: number,
        timeout: number
    ): Promise<string> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logger.debug('[ClassifierAgent] Calling LLM', {
                    provider,
                    attempt,
                    maxRetries,
                });

                // Check token budget
                const estimatedTokens = this.tokenManager.countTokens(prompt) + 500; // +500 for response
                const budget = this.tokenManager.checkBudget(estimatedTokens, provider);
                
                if (!budget.allowed) {
                    throw new Error(`Token budget exceeded: ${budget.reason}`);
                }

                // Call LLM with timeout
                const response = await Promise.race([
                    this.llmClient.chat([
                        { role: 'user', content: prompt },
                    ]),
                    new Promise<never>((_, reject) => 
                        setTimeout(() => reject(new Error('LLM call timeout')), timeout)
                    ),
                ]);

                // Track token usage
                const responseTokens = this.tokenManager.countTokens(response.content);
                this.tokenManager.trackUsage(estimatedTokens + responseTokens, provider);

                return response.content;

            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                logger.warn('[ClassifierAgent] LLM call failed', {
                    attempt,
                    maxRetries,
                    error: lastError.message,
                });

                if (attempt < maxRetries) {
                    // Exponential backoff
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw new Error(`LLM call failed after ${maxRetries} attempts: ${lastError?.message}`);
    }

    /**
     * Validate classification output
     */
    private validateClassificationOutput(output: any): SignalClassification {
        if (!output || typeof output !== 'object') {
            throw new Error('Invalid classification output: not an object');
        }

        // Validate urgency
        if (!['critical', 'high', 'medium', 'low'].includes(output.urgency)) {
            throw new Error(`Invalid urgency: ${output.urgency}`);
        }

        // Validate importance
        if (!['high', 'medium', 'low'].includes(output.importance)) {
            throw new Error(`Invalid importance: ${output.importance}`);
        }

        // Validate category
        const validCategories = ['incident', 'request', 'issue', 'question', 'information', 'discussion', 'spam'];
        if (!validCategories.includes(output.category)) {
            throw new Error(`Invalid category: ${output.category}`);
        }

        // Validate confidence
        const confidence = typeof output.confidence === 'number' 
            ? output.confidence 
            : parseFloat(output.confidence);

        if (isNaN(confidence) || confidence < 0 || confidence > 1) {
            throw new Error(`Invalid confidence: ${output.confidence}`);
        }

        return {
            urgency: output.urgency,
            importance: output.importance,
            category: output.category,
            reasoning: output.reasoning || 'No reasoning provided',
            suggestedActions: Array.isArray(output.suggestedActions) 
                ? output.suggestedActions 
                : [],
            confidence,
            requiresImmediate: false, // Will be set by caller
        };
    }

    /**
     * Generate cache key
     */
    private generateCacheKey(signal: Signal): string {
        // Hash based on content
        const content = `${signal.source}_${signal.sender}_${signal.subject}_${signal.body}`;
        
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return `class_${Math.abs(hash)}`;
    }

    /**
     * Get from cache
     */
    private getFromCache(signal: Signal): SignalClassification | null {
        const key = this.generateCacheKey(signal);
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        const now = Date.now();
        if (now - entry.timestamp > CACHE_TTL) {
            this.cache.delete(key);
            return null;
        }

        return entry.classification;
    }

    /**
     * Save to cache
     */
    private saveToCache(signal: Signal, classification: SignalClassification): void {
        const key = this.generateCacheKey(signal);
        
        this.cache.set(key, {
            classification,
            timestamp: Date.now(),
            signalHash: key,
        });
    }

    /**
     * Cleanup expired cache entries
     */
    private cleanupCache(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > CACHE_TTL) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.debug('[ClassifierAgent] Cleaned cache entries', { cleaned });
        }
    }

    /**
     * Update statistics
     */
    private updateStats(
        classification: SignalClassification,
        processingTime: number,
        isCacheHit: boolean
    ): void {
        if (!isCacheHit) {
            this.stats.totalClassified++;
            this.stats.totalProcessingTime += processingTime;
            this.stats.confidenceSum += classification.confidence;

            // Update category stats
            this.stats.byCategory[classification.category] = 
                (this.stats.byCategory[classification.category] || 0) + 1;

            // Update urgency stats
            this.stats.byUrgency[classification.urgency] = 
                (this.stats.byUrgency[classification.urgency] || 0) + 1;

            // Update importance stats
            this.stats.byImportance[classification.importance] = 
                (this.stats.byImportance[classification.importance] || 0) + 1;
        }
    }
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Get singleton classifier agent instance
 */
export function getClassifierAgent(): ClassifierAgent {
    return ClassifierAgent.getInstance();
}

/**
 * Export default instance
 */
export default getClassifierAgent();
