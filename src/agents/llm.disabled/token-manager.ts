/**
 * Token Manager
 * 
 * Comprehensive token tracking and budget management system for LLM operations.
 * 
 * Features:
 * - Accurate token counting using tiktoken
 * - Daily budget limits per provider
 * - 80% budget warning system
 * - Automatic midnight reset
 * - Persistent usage tracking
 * - Cost estimation
 * - Dashboard statistics
 * 
 * @module agents/llm/token-manager
 */

import { encoding_for_model, get_encoding } from 'tiktoken';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../../utils/logger';
import { LLMProvider } from '../../types';

// ============================================================================
// Types
// ============================================================================

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

/**
 * Historical usage data stored in JSON
 */
interface UsageHistory {
    dailyUsage: Record<string, DailyUsage>;
    lastReset: string;
}

// ============================================================================
// Provider Pricing (per 1M tokens)
// ============================================================================

const PROVIDER_PRICING: Record<LLMProvider, { input: number; output: number }> = {
    [LLMProvider.GROQ]: {
        input: 0.59,   // Llama 3.1 70B
        output: 0.79,
    },
    [LLMProvider.TOGETHER]: {
        input: 0.88,   // Meta Llama 3.1 70B
        output: 0.88,
    },
    [LLMProvider.OPENROUTER]: {
        input: 3.00,   // Average for premium models
        output: 15.00,
    },
};

// ============================================================================
// Token Manager Class
// ============================================================================

export class TokenManager {
    private static instance: TokenManager;
    private dailyLimit: number;
    private currentUsage: DailyUsage;
    private usageFilePath: string;
    private resetTimer: NodeJS.Timeout | null = null;
    private encoding: any;

    private constructor() {
        // Load configuration
        this.dailyLimit = parseInt(process.env.MAX_DAILY_TOKENS || '500000', 10);
        this.usageFilePath = path.join(process.cwd(), 'logs', 'token-usage.json');

        // Initialize tiktoken encoding
        try {
            // Use cl100k_base encoding (GPT-4, GPT-3.5-turbo)
            this.encoding = get_encoding('cl100k_base');
            logger.info('[TokenManager] Initialized with cl100k_base encoding');
        } catch (error) {
            logger.error('[TokenManager] Failed to initialize tiktoken:', error);
            throw error;
        }

        // Load or initialize usage data
        this.currentUsage = this.loadTodayUsage();

        // Schedule midnight reset
        this.scheduleMidnightReset();

        logger.info(`[TokenManager] Initialized with daily limit: ${this.dailyLimit.toLocaleString()} tokens`);
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): TokenManager {
        if (!TokenManager.instance) {
            TokenManager.instance = new TokenManager();
        }
        return TokenManager.instance;
    }

    /**
     * Count tokens in text using tiktoken
     * 
     * @param text - Text to count tokens for
     * @returns Number of tokens
     */
    public countTokens(text: string): number {
        try {
            if (!text || text.length === 0) {
                return 0;
            }

            const tokens = this.encoding.encode(text);
            return tokens.length;
        } catch (error) {
            logger.error('[TokenManager] Error counting tokens:', error);
            // Fallback: rough estimation (1 token ≈ 4 characters)
            return Math.ceil(text.length / 4);
        }
    }

    /**
     * Count tokens in messages array
     * 
     * @param messages - Array of messages
     * @returns Total token count
     */
    public countMessageTokens(messages: Array<{ role: string; content: string }>): number {
        try {
            let totalTokens = 0;

            // Count tokens for each message
            for (const message of messages) {
                // Add tokens for role
                totalTokens += this.countTokens(message.role);
                // Add tokens for content
                totalTokens += this.countTokens(message.content);
                // Add 4 tokens per message for formatting
                totalTokens += 4;
            }

            // Add 2 tokens for assistant's reply priming
            totalTokens += 2;

            return totalTokens;
        } catch (error) {
            logger.error('[TokenManager] Error counting message tokens:', error);
            // Fallback estimation
            const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
            return Math.ceil(totalChars / 4);
        }
    }

    /**
     * Check if request is within budget
     * 
     * @param estimatedTokens - Estimated tokens for the request
     * @param provider - LLM provider
     * @returns Budget check result
     */
    public checkBudget(estimatedTokens: number, provider: LLMProvider = LLMProvider.GROQ): BudgetCheckResult {
        const currentUsed = this.currentUsage.totalTokens;
        const remaining = this.dailyLimit - currentUsed;
        const percentUsed = (currentUsed / this.dailyLimit) * 100;
        const estimatedCost = this.estimateCost(estimatedTokens, provider);

        // Check if over limit
        if (currentUsed >= this.dailyLimit) {
            logger.warn(`[TokenManager] Daily limit exceeded: ${currentUsed.toLocaleString()}/${this.dailyLimit.toLocaleString()} tokens`);
            return {
                allowed: false,
                reason: `Daily token limit of ${this.dailyLimit.toLocaleString()} exceeded. Used: ${currentUsed.toLocaleString()}`,
                remainingTokens: 0,
                percentUsed: percentUsed,
                estimatedCost,
            };
        }

        // Check if request would exceed limit
        if (currentUsed + estimatedTokens > this.dailyLimit) {
            logger.warn(`[TokenManager] Request would exceed limit: ${(currentUsed + estimatedTokens).toLocaleString()}/${this.dailyLimit.toLocaleString()}`);
            return {
                allowed: false,
                reason: `Request of ${estimatedTokens.toLocaleString()} tokens would exceed daily limit. Remaining: ${remaining.toLocaleString()}`,
                remainingTokens: remaining,
                percentUsed: percentUsed,
                estimatedCost,
            };
        }

        // Warn if approaching limit (80%)
        const newPercentUsed = ((currentUsed + estimatedTokens) / this.dailyLimit) * 100;
        if (newPercentUsed >= 80 && percentUsed < 80) {
            logger.warn(`[TokenManager] ⚠️  Approaching budget limit: ${newPercentUsed.toFixed(1)}% of daily tokens will be used`);
        }

        return {
            allowed: true,
            remainingTokens: remaining - estimatedTokens,
            percentUsed: newPercentUsed,
            estimatedCost,
        };
    }

    /**
     * Track token usage for a request
     * 
     * @param tokens - Number of tokens used
     * @param provider - LLM provider
     */
    public trackUsage(tokens: number, provider: LLMProvider): void {
        // Update total tokens
        this.currentUsage.totalTokens += tokens;

        // Find or create provider entry
        let providerUsage = this.currentUsage.providers.find(p => p.provider === provider);
        
        if (!providerUsage) {
            providerUsage = {
                provider,
                tokensUsed: 0,
                requestCount: 0,
                estimatedCost: 0,
                lastUpdated: new Date().toISOString(),
            };
            this.currentUsage.providers.push(providerUsage);
        }

        // Update provider usage
        providerUsage.tokensUsed += tokens;
        providerUsage.requestCount += 1;
        providerUsage.estimatedCost = this.estimateCost(providerUsage.tokensUsed, provider);
        providerUsage.lastUpdated = new Date().toISOString();

        // Update total cost
        this.currentUsage.totalCost = this.currentUsage.providers.reduce(
            (sum, p) => sum + p.estimatedCost,
            0
        );

        // Persist to file
        this.saveUsage();

        // Log warning if approaching limit
        const percentUsed = (this.currentUsage.totalTokens / this.dailyLimit) * 100;
        if (percentUsed >= 80) {
            logger.warn(
                `[TokenManager] ⚠️  ${percentUsed.toFixed(1)}% of daily budget used ` +
                `(${this.currentUsage.totalTokens.toLocaleString()}/${this.dailyLimit.toLocaleString()} tokens)`
            );
        }

        logger.debug(
            `[TokenManager] Tracked ${tokens} tokens for ${provider} ` +
            `(Total: ${this.currentUsage.totalTokens.toLocaleString()}, Cost: $${this.currentUsage.totalCost.toFixed(4)})`
        );
    }

    /**
     * Estimate cost for tokens
     * 
     * @param tokens - Number of tokens
     * @param provider - LLM provider
     * @param isOutput - Whether tokens are output (vs input)
     * @returns Estimated cost in USD
     */
    public estimateCost(tokens: number, provider: LLMProvider, isOutput: boolean = false): number {
        const pricing = PROVIDER_PRICING[provider];
        if (!pricing) {
            logger.warn(`[TokenManager] Unknown provider pricing: ${provider}`);
            return 0;
        }

        const pricePerToken = isOutput ? pricing.output / 1_000_000 : pricing.input / 1_000_000;
        return tokens * pricePerToken;
    }

    /**
     * Get usage statistics for dashboard
     * 
     * @returns Usage statistics
     */
    public getUsageStats(): UsageStats {
        const history = this.loadHistory();
        const today = this.currentUsage;
        
        // Get yesterday's data
        const yesterday = this.getYesterdayUsage(history);

        // Calculate current month stats
        const monthStats = this.calculateMonthStats(history);

        // Calculate budget status
        const percentUsed = (today.totalTokens / this.dailyLimit) * 100;
        const budgetStatus = {
            dailyLimit: this.dailyLimit,
            used: today.totalTokens,
            remaining: Math.max(0, this.dailyLimit - today.totalTokens),
            percentUsed: percentUsed,
            isNearLimit: percentUsed >= 80,
            isOverLimit: percentUsed >= 100,
        };

        // Get top providers
        const topProviders = today.providers
            .sort((a, b) => b.tokensUsed - a.tokensUsed)
            .map(p => ({
                provider: p.provider,
                tokens: p.tokensUsed,
                cost: p.estimatedCost,
                percentage: today.totalTokens > 0 ? (p.tokensUsed / today.totalTokens) * 100 : 0,
            }));

        return {
            today,
            yesterday,
            currentMonth: monthStats,
            budgetStatus,
            topProviders,
        };
    }

    /**
     * Reset daily counter (called at midnight)
     */
    public resetDailyCounter(): void {
        logger.info(`[TokenManager] Resetting daily counter. Previous usage: ${this.currentUsage.totalTokens.toLocaleString()} tokens, $${this.currentUsage.totalCost.toFixed(4)}`);

        // Save current day's data
        this.saveUsage();

        // Reset to new day
        this.currentUsage = {
            date: this.getTodayDate(),
            totalTokens: 0,
            totalCost: 0,
            providers: [],
        };

        // Save new day
        this.saveUsage();

        logger.info(`[TokenManager] Daily counter reset complete`);
    }

    /**
     * Manually set daily limit (for testing or dynamic adjustment)
     * 
     * @param limit - New daily limit
     */
    public setDailyLimit(limit: number): void {
        logger.info(`[TokenManager] Updating daily limit from ${this.dailyLimit.toLocaleString()} to ${limit.toLocaleString()}`);
        this.dailyLimit = limit;
    }

    /**
     * Get current daily limit
     */
    public getDailyLimit(): number {
        return this.dailyLimit;
    }

    /**
     * Clean up resources
     */
    public destroy(): void {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }
        if (this.encoding) {
            this.encoding.free();
        }
        logger.info('[TokenManager] Destroyed');
    }

    // ========================================================================
    // Private Methods
    // ========================================================================

    /**
     * Load today's usage from file
     */
    private loadTodayUsage(): DailyUsage {
        const history = this.loadHistory();
        const today = this.getTodayDate();

        if (history.dailyUsage[today]) {
            logger.info(`[TokenManager] Loaded existing usage for ${today}: ${history.dailyUsage[today].totalTokens.toLocaleString()} tokens`);
            return history.dailyUsage[today];
        }

        // Create new entry for today
        const newUsage: DailyUsage = {
            date: today,
            totalTokens: 0,
            totalCost: 0,
            providers: [],
        };

        logger.info(`[TokenManager] Created new usage entry for ${today}`);
        return newUsage;
    }

    /**
     * Load usage history from file
     */
    private loadHistory(): UsageHistory {
        try {
            // Ensure logs directory exists
            const logsDir = path.dirname(this.usageFilePath);
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }

            // Load existing data
            if (fs.existsSync(this.usageFilePath)) {
                const data = fs.readFileSync(this.usageFilePath, 'utf-8');
                return JSON.parse(data);
            }

            // Return empty history
            return {
                dailyUsage: {},
                lastReset: new Date().toISOString(),
            };
        } catch (error) {
            logger.error('[TokenManager] Error loading usage history:', error);
            return {
                dailyUsage: {},
                lastReset: new Date().toISOString(),
            };
        }
    }

    /**
     * Save current usage to file
     */
    private saveUsage(): void {
        try {
            const history = this.loadHistory();
            history.dailyUsage[this.currentUsage.date] = this.currentUsage;
            history.lastReset = new Date().toISOString();

            // Ensure logs directory exists
            const logsDir = path.dirname(this.usageFilePath);
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }

            // Write to file
            fs.writeFileSync(
                this.usageFilePath,
                JSON.stringify(history, null, 2),
                'utf-8'
            );

            logger.debug(`[TokenManager] Saved usage data to ${this.usageFilePath}`);
        } catch (error) {
            logger.error('[TokenManager] Error saving usage:', error);
        }
    }

    /**
     * Get today's date string (YYYY-MM-DD)
     */
    private getTodayDate(): string {
        const now = new Date();
        return now.toISOString().split('T')[0];
    }

    /**
     * Get yesterday's usage
     */
    private getYesterdayUsage(history: UsageHistory): DailyUsage | undefined {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayDate = yesterday.toISOString().split('T')[0];
        return history.dailyUsage[yesterdayDate];
    }

    /**
     * Calculate current month statistics
     */
    private calculateMonthStats(history: UsageHistory): {
        totalTokens: number;
        totalCost: number;
        daysActive: number;
    } {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        let totalTokens = 0;
        let totalCost = 0;
        let daysActive = 0;

        Object.entries(history.dailyUsage).forEach(([date, usage]) => {
            if (date.startsWith(currentMonth)) {
                totalTokens += usage.totalTokens;
                totalCost += usage.totalCost;
                if (usage.totalTokens > 0) {
                    daysActive++;
                }
            }
        });

        return { totalTokens, totalCost, daysActive };
    }

    /**
     * Schedule midnight reset
     */
    private scheduleMidnightReset(): void {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        const msUntilMidnight = tomorrow.getTime() - now.getTime();

        this.resetTimer = setTimeout(() => {
            this.resetDailyCounter();
            // Reschedule for next midnight
            this.scheduleMidnightReset();
        }, msUntilMidnight);

        logger.info(`[TokenManager] Scheduled reset in ${(msUntilMidnight / 1000 / 60 / 60).toFixed(2)} hours`);
    }
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Get singleton token manager instance
 */
export function getTokenManager(): TokenManager {
    return TokenManager.getInstance();
}

/**
 * Export default instance
 */
export default getTokenManager();
