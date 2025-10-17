/**
 * Context Builder
 * 
 * Builds rich contextual information for LLM decision-making by gathering:
 * - Recent signals from same source/sender
 * - Related existing tasks
 * - Time and business context
 * - System state and health
 * 
 * Includes caching to reduce overhead.
 * 
 * @module agents/reasoning/context-builder
 */

import logger from '../../utils/logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Signal for context tracking
 */
export interface Signal {
    id: string;
    source: 'email' | 'slack' | 'sheets';
    subject?: string;
    body: string;
    sender?: string;
    timestamp: string;
    classification?: {
        urgency: string;
        importance: string;
        category: string;
    };
}

/**
 * Task information
 */
export interface Task {
    id: string;
    title: string;
    description?: string;
    status: 'todo' | 'in-progress' | 'done' | 'blocked';
    priority: number;
    assignee?: string;
    dueDate?: string;
    labels?: string[];
    createdAt: string;
    source: 'notion' | 'trello';
}

/**
 * Time context information
 */
export interface TimeContext {
    isBusinessHours: boolean;
    dayOfWeek: string;
    isWeekend: boolean;
    isHoliday: boolean;
    currentHour: number;
    timeZone: string;
    timestamp: string;
}

/**
 * System state information
 */
export interface SystemState {
    queueDepth: number;
    activeTasksCount: number;
    pendingSignalsCount: number;
    healthStatus: 'healthy' | 'degraded' | 'down';
    avgProcessingTime: number; // in milliseconds
    errorRate: number; // percentage 0-100
    lastHealthCheck: string;
}

/**
 * Team availability (placeholder for calendar integration)
 */
export interface TeamAvailability {
    available: number;
    busy: number;
    offline: number;
    members: Array<{
        name: string;
        email: string;
        status: 'available' | 'busy' | 'offline';
    }>;
}

/**
 * Complete context for decision making
 */
export interface DecisionContext {
    recentSignals: Signal[];
    relatedTasks: Task[];
    similarSignals: Signal[];
    timeContext: TimeContext;
    systemState: SystemState;
    teamAvailability?: TeamAvailability;
    metadata: {
        buildTime: number; // milliseconds
        cacheHit: boolean;
        timestamp: string;
    };
}

/**
 * Context cache entry
 */
interface CacheEntry {
    context: DecisionContext;
    timestamp: number;
    key: string;
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const MAX_RECENT_SIGNALS = 50;
const MAX_RELATED_TASKS = 20;
const MAX_SIMILAR_SIGNALS = 10;

const US_HOLIDAYS_2025 = [
    '2025-01-01', // New Year's Day
    '2025-01-20', // MLK Day
    '2025-02-17', // Presidents' Day
    '2025-05-26', // Memorial Day
    '2025-07-04', // Independence Day
    '2025-09-01', // Labor Day
    '2025-10-13', // Columbus Day
    '2025-11-11', // Veterans Day
    '2025-11-27', // Thanksgiving
    '2025-12-25', // Christmas
];

// ============================================================================
// Context Builder Class
// ============================================================================

export class ContextBuilder {
    private static instance: ContextBuilder;
    private signalHistory: Signal[] = [];
    private taskRegistry: Task[] = [];
    private contextCache: Map<string, CacheEntry> = new Map();
    private systemMetrics = {
        queueDepth: 0,
        errorCount: 0,
        totalProcessed: 0,
        totalProcessingTime: 0,
    };

    private constructor() {
        logger.info('[ContextBuilder] Initialized');
        
        // Start cache cleanup interval
        setInterval(() => this.cleanupCache(), 60000); // Every minute
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): ContextBuilder {
        if (!ContextBuilder.instance) {
            ContextBuilder.instance = new ContextBuilder();
        }
        return ContextBuilder.instance;
    }

    /**
     * Build complete context for decision making
     * 
     * @param signal - Current signal to build context for
     * @param options - Optional configuration
     * @returns Decision context
     */
    public buildContext(
        signal: Signal,
        options?: {
            includeTeamAvailability?: boolean;
            maxRecentSignals?: number;
            maxRelatedTasks?: number;
        }
    ): DecisionContext {
        const startTime = Date.now();
        
        // Generate cache key
        const cacheKey = this.generateCacheKey(signal);
        
        // Check cache
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            logger.debug('[ContextBuilder] Cache hit', { cacheKey });
            cached.metadata.cacheHit = true;
            return cached;
        }

        logger.debug('[ContextBuilder] Building context', {
            source: signal.source,
            sender: signal.sender,
        });

        // Build context components
        const recentSignals = this.getRecentSignals(
            signal,
            options?.maxRecentSignals || MAX_RECENT_SIGNALS
        );
        
        const relatedTasks = this.getRelatedTasks(
            signal,
            options?.maxRelatedTasks || MAX_RELATED_TASKS
        );
        
        const similarSignals = this.findSimilarSignals(
            signal,
            MAX_SIMILAR_SIGNALS
        );
        
        const timeContext = this.getTimeContext();
        const systemState = this.getSystemState();
        
        let teamAvailability: TeamAvailability | undefined;
        if (options?.includeTeamAvailability) {
            teamAvailability = this.getTeamAvailability();
        }

        const buildTime = Date.now() - startTime;

        const context: DecisionContext = {
            recentSignals,
            relatedTasks,
            similarSignals,
            timeContext,
            systemState,
            teamAvailability,
            metadata: {
                buildTime,
                cacheHit: false,
                timestamp: new Date().toISOString(),
            },
        };

        // Cache the context
        this.saveToCache(cacheKey, context);

        logger.info('[ContextBuilder] Context built', {
            buildTime: `${buildTime}ms`,
            recentSignals: recentSignals.length,
            relatedTasks: relatedTasks.length,
            similarSignals: similarSignals.length,
        });

        return context;
    }

    /**
     * Get recent signals from same source or sender
     * 
     * @param signal - Current signal
     * @param limit - Maximum number to return
     * @returns Recent signals
     */
    public getRecentSignals(signal: Signal, limit: number = MAX_RECENT_SIGNALS): Signal[] {
        const filtered = this.signalHistory
            .filter(s => 
                s.id !== signal.id && // Exclude current signal
                (s.source === signal.source || s.sender === signal.sender)
            )
            .sort((a, b) => 
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            )
            .slice(0, limit);

        return filtered;
    }

    /**
     * Find similar signals using keyword matching
     * 
     * @param signal - Current signal
     * @param limit - Maximum number to return
     * @returns Similar signals
     */
    public findSimilarSignals(signal: Signal, limit: number = MAX_SIMILAR_SIGNALS): Signal[] {
        // Extract keywords from signal
        const keywords = this.extractKeywords(signal);
        
        if (keywords.length === 0) {
            return [];
        }

        // Score each signal by keyword overlap
        const scored = this.signalHistory
            .filter(s => s.id !== signal.id)
            .map(s => {
                const signalKeywords = this.extractKeywords(s);
                const overlap = keywords.filter(k => signalKeywords.includes(k)).length;
                const score = overlap / keywords.length;
                return { signal: s, score };
            })
            .filter(item => item.score > 0.3) // Minimum 30% overlap
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        return scored.map(item => item.signal);
    }

    /**
     * Get related tasks based on signal content
     * 
     * @param signal - Current signal
     * @param limit - Maximum number to return
     * @returns Related tasks
     */
    public getRelatedTasks(signal: Signal, limit: number = MAX_RELATED_TASKS): Task[] {
        const keywords = this.extractKeywords(signal);
        
        if (keywords.length === 0) {
            return this.taskRegistry
                .filter(t => t.status !== 'done')
                .slice(0, limit);
        }

        // Score tasks by keyword overlap
        const scored = this.taskRegistry
            .map(task => {
                const taskText = `${task.title} ${task.description || ''} ${task.labels?.join(' ') || ''}`.toLowerCase();
                const matches = keywords.filter(k => taskText.includes(k)).length;
                const score = matches / keywords.length;
                return { task, score };
            })
            .filter(item => item.score > 0.2) // Minimum 20% overlap
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        return scored.map(item => item.task);
    }

    /**
     * Get current workload statistics
     * 
     * @returns Workload information
     */
    public getCurrentWorkload(): {
        totalTasks: number;
        todoTasks: number;
        inProgressTasks: number;
        blockedTasks: number;
        highPriorityTasks: number;
        overdueT: number;
    } {
        const now = new Date();
        
        return {
            totalTasks: this.taskRegistry.length,
            todoTasks: this.taskRegistry.filter(t => t.status === 'todo').length,
            inProgressTasks: this.taskRegistry.filter(t => t.status === 'in-progress').length,
            blockedTasks: this.taskRegistry.filter(t => t.status === 'blocked').length,
            highPriorityTasks: this.taskRegistry.filter(t => t.priority <= 2).length,
            overdueT: this.taskRegistry.filter(t => 
                t.dueDate && new Date(t.dueDate) < now && t.status !== 'done'
            ).length,
        };
    }

    /**
     * Add signal to history
     * 
     * @param signal - Signal to add
     */
    public addSignal(signal: Signal): void {
        this.signalHistory.unshift(signal);
        
        // Keep only recent signals
        if (this.signalHistory.length > MAX_RECENT_SIGNALS * 2) {
            this.signalHistory = this.signalHistory.slice(0, MAX_RECENT_SIGNALS);
        }

        logger.debug('[ContextBuilder] Signal added to history', { 
            signalId: signal.id,
            historySize: this.signalHistory.length 
        });
    }

    /**
     * Add task to registry
     * 
     * @param task - Task to add
     */
    public addTask(task: Task): void {
        // Remove existing task with same ID
        this.taskRegistry = this.taskRegistry.filter(t => t.id !== task.id);
        
        // Add new/updated task
        this.taskRegistry.unshift(task);
        
        // Keep only recent tasks
        if (this.taskRegistry.length > MAX_RELATED_TASKS * 2) {
            this.taskRegistry = this.taskRegistry.slice(0, MAX_RELATED_TASKS);
        }

        logger.debug('[ContextBuilder] Task added to registry', { 
            taskId: task.id,
            registrySize: this.taskRegistry.length 
        });
    }

    /**
     * Update system metrics
     * 
     * @param metrics - Metrics to update
     */
    public updateSystemMetrics(metrics: {
        queueDepth?: number;
        errorCount?: number;
        processedCount?: number;
        processingTime?: number;
    }): void {
        if (metrics.queueDepth !== undefined) {
            this.systemMetrics.queueDepth = metrics.queueDepth;
        }
        if (metrics.errorCount !== undefined) {
            this.systemMetrics.errorCount += metrics.errorCount;
        }
        if (metrics.processedCount !== undefined) {
            this.systemMetrics.totalProcessed += metrics.processedCount;
        }
        if (metrics.processingTime !== undefined) {
            this.systemMetrics.totalProcessingTime += metrics.processingTime;
        }
    }

    // ========================================================================
    // Private Helper Methods
    // ========================================================================

    /**
     * Get time context
     */
    private getTimeContext(): TimeContext {
        const now = new Date();
        const hour = now.getHours();
        const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
        const isWeekend = now.getDay() === 0 || now.getDay() === 6;
        const isBusinessHours = hour >= 9 && hour < 17 && !isWeekend;
        
        const dateStr = now.toISOString().split('T')[0];
        const isHoliday = US_HOLIDAYS_2025.includes(dateStr);

        return {
            isBusinessHours,
            dayOfWeek,
            isWeekend,
            isHoliday,
            currentHour: hour,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            timestamp: now.toISOString(),
        };
    }

    /**
     * Get system state
     */
    private getSystemState(): SystemState {
        const avgProcessingTime = this.systemMetrics.totalProcessed > 0
            ? this.systemMetrics.totalProcessingTime / this.systemMetrics.totalProcessed
            : 0;

        const errorRate = this.systemMetrics.totalProcessed > 0
            ? (this.systemMetrics.errorCount / this.systemMetrics.totalProcessed) * 100
            : 0;

        let healthStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
        if (errorRate > 10 || avgProcessingTime > 5000) {
            healthStatus = 'degraded';
        }
        if (errorRate > 50 || avgProcessingTime > 30000) {
            healthStatus = 'down';
        }

        return {
            queueDepth: this.systemMetrics.queueDepth,
            activeTasksCount: this.taskRegistry.filter(t => t.status === 'in-progress').length,
            pendingSignalsCount: this.systemMetrics.queueDepth,
            healthStatus,
            avgProcessingTime,
            errorRate,
            lastHealthCheck: new Date().toISOString(),
        };
    }

    /**
     * Get team availability (placeholder)
     */
    private getTeamAvailability(): TeamAvailability {
        // Placeholder implementation
        // In production, this would integrate with calendar APIs
        const timeContext = this.getTimeContext();
        
        // Simple heuristic based on time
        const isWorkingHours = timeContext.isBusinessHours;
        const totalMembers = 10; // Placeholder
        
        const available = isWorkingHours ? 7 : 2;
        const busy = isWorkingHours ? 2 : 0;
        const offline = totalMembers - available - busy;

        return {
            available,
            busy,
            offline,
            members: [], // Placeholder - would be populated from calendar API
        };
    }

    /**
     * Extract keywords from signal
     */
    private extractKeywords(signal: Signal): string[] {
        const text = `${signal.subject || ''} ${signal.body}`.toLowerCase();
        
        // Remove common words
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
        ]);

        // Extract words (3+ characters, alphanumeric)
        const words = text
            .match(/\b[a-z0-9]{3,}\b/g) || [];

        // Filter and deduplicate
        const keywords = [...new Set(
            words.filter(word => !stopWords.has(word))
        )];

        return keywords.slice(0, 20); // Limit to top 20 keywords
    }

    /**
     * Generate cache key
     */
    private generateCacheKey(signal: Signal): string {
        return `${signal.source}_${signal.sender || 'unknown'}_${signal.subject || 'no-subject'}`;
    }

    /**
     * Get from cache
     */
    private getFromCache(key: string): DecisionContext | null {
        const entry = this.contextCache.get(key);
        
        if (!entry) {
            return null;
        }

        const now = Date.now();
        if (now - entry.timestamp > CACHE_TTL) {
            this.contextCache.delete(key);
            return null;
        }

        return entry.context;
    }

    /**
     * Save to cache
     */
    private saveToCache(key: string, context: DecisionContext): void {
        this.contextCache.set(key, {
            context,
            timestamp: Date.now(),
            key,
        });
    }

    /**
     * Cleanup expired cache entries
     */
    private cleanupCache(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.contextCache.entries()) {
            if (now - entry.timestamp > CACHE_TTL) {
                this.contextCache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.debug('[ContextBuilder] Cleaned cache entries', { cleaned });
        }
    }

    /**
     * Clear all caches and history (for testing)
     */
    public clearAll(): void {
        this.signalHistory = [];
        this.taskRegistry = [];
        this.contextCache.clear();
        this.systemMetrics = {
            queueDepth: 0,
            errorCount: 0,
            totalProcessed: 0,
            totalProcessingTime: 0,
        };
        logger.info('[ContextBuilder] Cleared all data');
    }
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Get singleton context builder instance
 */
export function getContextBuilder(): ContextBuilder {
    return ContextBuilder.getInstance();
}

/**
 * Export default instance
 */
export default getContextBuilder();
