/**
 * Response Cache & Reuse for AI Operations Command Center
 * 
 * Caches LLM responses to avoid redundant API calls:
 * - Hash-based cache keys (prompt + model + temperature)
 * - TTL-based expiration (1 hour classifications, 30 min decisions)
 * - Intelligent cache invalidation based on feedback
 * - Cache warming for common patterns
 * - Persistence of hot cache entries
 * - Comprehensive statistics and efficiency tracking
 * 
 * Features:
 * - Automatic TTL management
 * - Feedback-based invalidation
 * - Pattern change detection
 * - Cache warming on startup
 * - Disk persistence
 * - Hit/miss statistics
 * - Token and cost savings calculation
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import logger from '../../utils/logger';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Cache entry with metadata
 */
export interface CacheEntry {
  /** Unique cache key */
  key: string;
  
  /** Cached LLM response */
  response: string;
  
  /** Cache creation timestamp */
  cachedAt: string;
  
  /** Cache expiration timestamp */
  expiresAt: string;
  
  /** Number of times this entry was used */
  hitCount: number;
  
  /** Last access timestamp */
  lastAccessedAt: string;
  
  /** Estimated tokens in response */
  estimatedTokens: number;
  
  /** Cache entry type */
  type: 'classification' | 'decision' | 'other';
  
  /** Associated signal ID (if any) */
  signalId?: string;
  
  /** Associated source (email, slack, etc.) */
  source?: string;
  
  /** Feedback status */
  feedbackStatus?: 'correct' | 'incorrect' | 'modified';
}

/**
 * Cache key components
 */
export interface CacheKeyComponents {
  /** LLM prompt text */
  prompt: string;
  
  /** Model name */
  model: string;
  
  /** Temperature setting */
  temperature: number;
  
  /** Optional additional context */
  context?: string;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total cache hits */
  totalHits: number;
  
  /** Total cache misses */
  totalMisses: number;
  
  /** Cache hit rate (0-1) */
  hitRate: number;
  
  /** Total entries in cache */
  totalEntries: number;
  
  /** Active (non-expired) entries */
  activeEntries: number;
  
  /** Expired entries */
  expiredEntries: number;
  
  /** Total tokens saved */
  totalTokensSaved: number;
  
  /** Estimated cost saved (USD) */
  estimatedCostSaved: number;
  
  /** Cache size on disk (bytes) */
  cacheSizeBytes: number;
  
  /** Hot entries (high hit count) */
  hotEntriesCount: number;
  
  /** Average hit count per entry */
  avgHitCount: number;
  
  /** Last updated timestamp */
  lastUpdated: string;
}

/**
 * Cache efficiency metrics
 */
export interface CacheEfficiency {
  /** Current hit rate */
  hitRate: number;
  
  /** Tokens saved from cache hits */
  tokensSaved: number;
  
  /** Estimated API cost saved (USD) */
  costSaved: number;
  
  /** Number of API calls avoided */
  apiCallsAvoided: number;
  
  /** Average response time from cache (ms) */
  avgCacheResponseTime: number;
  
  /** Time saved from cache hits (ms) */
  timeSaved: number;
  
  /** Cache memory usage (MB) */
  memoryUsageMB: number;
  
  /** Efficiency score (0-100) */
  efficiencyScore: number;
}

/**
 * Cache warming pattern
 */
export interface WarmingPattern {
  /** Pattern identifier */
  id: string;
  
  /** Pattern type */
  type: 'common_signal' | 'frequent_sender' | 'category_template';
  
  /** Pattern priority (1-10) */
  priority: number;
  
  /** Prompt template */
  promptTemplate: string;
  
  /** Expected model */
  model: string;
  
  /** Expected temperature */
  temperature: number;
  
  /** Pre-computed response */
  precomputedResponse?: string;
}

/**
 * Cache invalidation rule
 */
export interface InvalidationRule {
  /** Rule identifier */
  id: string;
  
  /** Rule type */
  type: 'feedback' | 'pattern_change' | 'time_based' | 'manual';
  
  /** Condition for invalidation */
  condition: (entry: CacheEntry) => boolean;
  
  /** Rule description */
  description: string;
  
  /** Times triggered */
  triggerCount: number;
}

/**
 * Configuration for response cache
 */
export interface ResponseCacheConfig {
  /** Cache directory path */
  cachePath: string;
  
  /** Default TTL for classifications (ms) */
  classificationTTL: number;
  
  /** Default TTL for decisions (ms) */
  decisionTTL: number;
  
  /** Default TTL for other responses (ms) */
  defaultTTL: number;
  
  /** Maximum cache entries in memory */
  maxCacheSize: number;
  
  /** Minimum hit count to persist to disk */
  hotCacheThreshold: number;
  
  /** Enable automatic cache warming */
  enableCacheWarming: boolean;
  
  /** Enable disk persistence */
  enablePersistence: boolean;
  
  /** Cost per 1K tokens (USD) */
  costPer1KTokens: number;
  
  /** Average LLM response time (ms) */
  avgLLMResponseTime: number;
}

// ============================================================================
// Response Cache Implementation
// ============================================================================

export class ResponseCache {
  private static instance: ResponseCache | null = null;
  private config: ResponseCacheConfig;
  
  // In-memory cache storage
  private cache: Map<string, CacheEntry> = new Map();
  
  // Statistics tracking
  private stats = {
    totalHits: 0,
    totalMisses: 0,
    totalTokensSaved: 0,
    cacheTiming: [] as number[], // Response times
  };
  
  // Invalidation rules
  private invalidationRules: Map<string, InvalidationRule> = new Map();
  
  // Warming patterns
  private warmingPatterns: WarmingPattern[] = [];
  
  // Cleanup interval
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  private constructor(config?: Partial<ResponseCacheConfig>) {
    this.config = {
      cachePath: 'cache/llm-responses',
      classificationTTL: 60 * 60 * 1000, // 1 hour
      decisionTTL: 30 * 60 * 1000, // 30 minutes
      defaultTTL: 60 * 60 * 1000, // 1 hour
      maxCacheSize: 10000,
      hotCacheThreshold: 5,
      enableCacheWarming: true,
      enablePersistence: true,
      costPer1KTokens: 0.002, // $0.002 per 1K tokens (approximate)
      avgLLMResponseTime: 2000, // 2 seconds
      ...config,
    };
    
    this.initializeInvalidationRules();
    this.startCleanupTimer();
    
    logger.info('ResponseCache initialized', { config: this.config });
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<ResponseCacheConfig>): ResponseCache {
    if (!ResponseCache.instance) {
      ResponseCache.instance = new ResponseCache(config);
    }
    return ResponseCache.instance;
  }
  
  // ==========================================================================
  // Public API
  // ==========================================================================
  
  /**
   * Cache an LLM response
   */
  public async cacheResponse(
    keyComponents: CacheKeyComponents,
    response: string,
    ttl?: number,
    type: 'classification' | 'decision' | 'other' = 'other',
    metadata?: { signalId?: string; source?: string }
  ): Promise<string> {
    const key = this.generateCacheKey(keyComponents);
    const estimatedTokens = this.estimateTokens(response);
    
    // Determine TTL based on type
    const effectiveTTL = ttl || this.getTTLForType(type);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + effectiveTTL);
    
    const entry: CacheEntry = {
      key,
      response,
      cachedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      hitCount: 0,
      lastAccessedAt: now.toISOString(),
      estimatedTokens,
      type,
      signalId: metadata?.signalId,
      source: metadata?.source,
    };
    
    this.cache.set(key, entry);
    
    logger.debug('Response cached', {
      key: key.substring(0, 16) + '...',
      type,
      ttl: effectiveTTL,
      tokens: estimatedTokens,
    });
    
    // Check if we should persist this entry
    if (this.config.enablePersistence && entry.hitCount >= this.config.hotCacheThreshold) {
      await this.persistEntry(entry);
    }
    
    // Enforce cache size limit
    await this.enforceMaxSize();
    
    return key;
  }
  
  /**
   * Get cached response
   */
  public getCachedResponse(keyComponents: CacheKeyComponents): string | null {
    const key = this.generateCacheKey(keyComponents);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.totalMisses++;
      logger.debug('Cache miss', { key: key.substring(0, 16) + '...' });
      return null;
    }
    
    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.totalMisses++;
      logger.debug('Cache miss (expired)', { key: key.substring(0, 16) + '...' });
      return null;
    }
    
    // Update hit statistics
    entry.hitCount++;
    entry.lastAccessedAt = new Date().toISOString();
    this.stats.totalHits++;
    this.stats.totalTokensSaved += entry.estimatedTokens;
    
    logger.debug('Cache hit', {
      key: key.substring(0, 16) + '...',
      hitCount: entry.hitCount,
      type: entry.type,
    });
    
    // Persist if now hot
    if (this.config.enablePersistence && entry.hitCount === this.config.hotCacheThreshold) {
      this.persistEntry(entry).catch(err => {
        logger.error('Failed to persist hot cache entry', { error: err.message });
      });
    }
    
    return entry.response;
  }
  
  /**
   * Invalidate cache entry
   */
  public invalidate(keyComponents: CacheKeyComponents): boolean {
    const key = this.generateCacheKey(keyComponents);
    const deleted = this.cache.delete(key);
    
    if (deleted) {
      logger.info('Cache entry invalidated', { key: key.substring(0, 16) + '...' });
    }
    
    return deleted;
  }
  
  /**
   * Invalidate by signal ID
   */
  public invalidateBySignalId(signalId: string): number {
    let count = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.signalId === signalId) {
        this.cache.delete(key);
        count++;
      }
    }
    
    if (count > 0) {
      logger.info('Cache entries invalidated by signal ID', { signalId, count });
    }
    
    return count;
  }
  
  /**
   * Invalidate by source
   */
  public invalidateBySource(source: string): number {
    let count = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.source === source) {
        this.cache.delete(key);
        count++;
      }
    }
    
    if (count > 0) {
      logger.info('Cache entries invalidated by source', { source, count });
    }
    
    return count;
  }
  
  /**
   * Mark cache entry based on feedback
   */
  public markFeedback(
    keyComponents: CacheKeyComponents,
    status: 'correct' | 'incorrect' | 'modified'
  ): boolean {
    const key = this.generateCacheKey(keyComponents);
    const entry = this.cache.get(key);
    
    if (!entry) return false;
    
    entry.feedbackStatus = status;
    
    // Invalidate if incorrect
    if (status === 'incorrect') {
      this.cache.delete(key);
      logger.info('Cache entry invalidated due to incorrect feedback', {
        key: key.substring(0, 16) + '...',
      });
      return true;
    }
    
    return false;
  }
  
  /**
   * Warm cache with common patterns
   */
  public async warmCache(): Promise<number> {
    if (!this.config.enableCacheWarming) {
      logger.info('Cache warming disabled');
      return 0;
    }
    
    logger.info('Starting cache warming', { patterns: this.warmingPatterns.length });
    
    let warmed = 0;
    
    for (const pattern of this.warmingPatterns) {
      if (pattern.precomputedResponse) {
        const keyComponents: CacheKeyComponents = {
          prompt: pattern.promptTemplate,
          model: pattern.model,
          temperature: pattern.temperature,
        };
        
        await this.cacheResponse(
          keyComponents,
          pattern.precomputedResponse,
          undefined,
          'classification'
        );
        
        warmed++;
      }
    }
    
    logger.info('Cache warming complete', { entriesWarmed: warmed });
    return warmed;
  }
  
  /**
   * Add warming pattern
   */
  public addWarmingPattern(pattern: WarmingPattern): void {
    this.warmingPatterns.push(pattern);
    this.warmingPatterns.sort((a, b) => b.priority - a.priority);
    
    logger.debug('Warming pattern added', {
      id: pattern.id,
      type: pattern.type,
      priority: pattern.priority,
    });
  }
  
  /**
   * Get cache statistics
   */
  public getCacheStats(): CacheStats {
    const now = new Date();
    let activeEntries = 0;
    let expiredEntries = 0;
    let totalHitCount = 0;
    let hotEntries = 0;
    
    for (const entry of this.cache.values()) {
      if (this.isExpired(entry)) {
        expiredEntries++;
      } else {
        activeEntries++;
      }
      
      totalHitCount += entry.hitCount;
      
      if (entry.hitCount >= this.config.hotCacheThreshold) {
        hotEntries++;
      }
    }
    
    const totalRequests = this.stats.totalHits + this.stats.totalMisses;
    const hitRate = totalRequests > 0 ? this.stats.totalHits / totalRequests : 0;
    
    const estimatedCostSaved = (this.stats.totalTokensSaved / 1000) * this.config.costPer1KTokens;
    
    return {
      totalHits: this.stats.totalHits,
      totalMisses: this.stats.totalMisses,
      hitRate,
      totalEntries: this.cache.size,
      activeEntries,
      expiredEntries,
      totalTokensSaved: this.stats.totalTokensSaved,
      estimatedCostSaved,
      cacheSizeBytes: this.estimateCacheSize(),
      hotEntriesCount: hotEntries,
      avgHitCount: activeEntries > 0 ? totalHitCount / activeEntries : 0,
      lastUpdated: now.toISOString(),
    };
  }
  
  /**
   * Get cache efficiency metrics
   */
  public getCacheEfficiency(): CacheEfficiency {
    const stats = this.getCacheStats();
    
    const apiCallsAvoided = this.stats.totalHits;
    const timeSaved = apiCallsAvoided * this.config.avgLLMResponseTime;
    
    const avgCacheTime = this.stats.cacheTiming.length > 0
      ? this.stats.cacheTiming.reduce((a, b) => a + b, 0) / this.stats.cacheTiming.length
      : 5; // 5ms typical cache response
    
    const memoryUsageMB = this.estimateCacheSize() / (1024 * 1024);
    
    // Efficiency score: weighted combination of hit rate, cost savings, and memory efficiency
    const efficiencyScore = Math.min(100, (
      (stats.hitRate * 50) +
      (Math.min(stats.estimatedCostSaved / 10, 1) * 30) +
      (Math.min(1 - (memoryUsageMB / 100), 1) * 20)
    ));
    
    return {
      hitRate: stats.hitRate,
      tokensSaved: stats.totalTokensSaved,
      costSaved: stats.estimatedCostSaved,
      apiCallsAvoided,
      avgCacheResponseTime: avgCacheTime,
      timeSaved,
      memoryUsageMB,
      efficiencyScore,
    };
  }
  
  /**
   * Clear entire cache
   */
  public clearCache(): number {
    const count = this.cache.size;
    this.cache.clear();
    
    logger.info('Cache cleared', { entriesRemoved: count });
    return count;
  }
  
  /**
   * Clear expired entries
   */
  public clearExpired(): number {
    let count = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        count++;
      }
    }
    
    if (count > 0) {
      logger.info('Expired entries cleared', { count });
    }
    
    return count;
  }
  
  /**
   * Load cache from disk
   */
  public async loadCache(): Promise<number> {
    if (!this.config.enablePersistence) {
      return 0;
    }
    
    try {
      await fs.mkdir(this.config.cachePath, { recursive: true });
      
      const files = await fs.readdir(this.config.cachePath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      let loaded = 0;
      
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(this.config.cachePath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const entry: CacheEntry = JSON.parse(content);
          
          // Only load non-expired entries
          if (!this.isExpired(entry)) {
            this.cache.set(entry.key, entry);
            loaded++;
          }
        } catch (error) {
          logger.warn('Failed to load cache entry', {
            file,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      
      logger.info('Cache loaded from disk', { entriesLoaded: loaded });
      return loaded;
    } catch (error) {
      logger.error('Failed to load cache from disk', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }
  
  /**
   * Save hot cache entries to disk
   */
  public async saveCache(): Promise<number> {
    if (!this.config.enablePersistence) {
      return 0;
    }
    
    try {
      await fs.mkdir(this.config.cachePath, { recursive: true });
      
      let saved = 0;
      
      for (const entry of this.cache.values()) {
        if (entry.hitCount >= this.config.hotCacheThreshold && !this.isExpired(entry)) {
          await this.persistEntry(entry);
          saved++;
        }
      }
      
      logger.info('Hot cache entries saved to disk', { entriesSaved: saved });
      return saved;
    } catch (error) {
      logger.error('Failed to save cache to disk', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }
  
  // ==========================================================================
  // Private Methods
  // ==========================================================================
  
  /**
   * Generate cache key from components
   */
  private generateCacheKey(components: CacheKeyComponents): string {
    const data = `${components.prompt}|${components.model}|${components.temperature}|${components.context || ''}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  
  /**
   * Get TTL based on entry type
   */
  private getTTLForType(type: 'classification' | 'decision' | 'other'): number {
    switch (type) {
      case 'classification':
        return this.config.classificationTTL;
      case 'decision':
        return this.config.decisionTTL;
      default:
        return this.config.defaultTTL;
    }
  }
  
  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return new Date(entry.expiresAt) < new Date();
  }
  
  /**
   * Estimate tokens in text
   */
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Estimate cache size in bytes
   */
  private estimateCacheSize(): number {
    let size = 0;
    
    for (const entry of this.cache.values()) {
      size += JSON.stringify(entry).length;
    }
    
    return size;
  }
  
  /**
   * Persist cache entry to disk
   */
  private async persistEntry(entry: CacheEntry): Promise<void> {
    try {
      await fs.mkdir(this.config.cachePath, { recursive: true });
      
      const fileName = `${entry.key}.json`;
      const filePath = path.join(this.config.cachePath, fileName);
      
      await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
      
      logger.debug('Cache entry persisted', {
        key: entry.key.substring(0, 16) + '...',
        hitCount: entry.hitCount,
      });
    } catch (error) {
      logger.error('Failed to persist cache entry', {
        key: entry.key.substring(0, 16) + '...',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  /**
   * Enforce maximum cache size
   */
  private async enforceMaxSize(): Promise<void> {
    if (this.cache.size <= this.config.maxCacheSize) {
      return;
    }
    
    // Sort entries by hit count (ascending) and last accessed (oldest first)
    const entries = Array.from(this.cache.entries()).sort((a, b) => {
      if (a[1].hitCount !== b[1].hitCount) {
        return a[1].hitCount - b[1].hitCount;
      }
      return new Date(a[1].lastAccessedAt).getTime() - new Date(b[1].lastAccessedAt).getTime();
    });
    
    // Remove oldest/least-used entries
    const toRemove = this.cache.size - this.config.maxCacheSize;
    
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
    
    logger.info('Cache size enforced', {
      removed: toRemove,
      currentSize: this.cache.size,
    });
  }
  
  /**
   * Initialize invalidation rules
   */
  private initializeInvalidationRules(): void {
    // Rule: Invalidate entries marked as incorrect
    this.invalidationRules.set('incorrect-feedback', {
      id: 'incorrect-feedback',
      type: 'feedback',
      condition: (entry) => entry.feedbackStatus === 'incorrect',
      description: 'Invalidate cache entries with incorrect feedback',
      triggerCount: 0,
    });
    
    // Rule: Invalidate old entries (beyond TTL)
    this.invalidationRules.set('expired', {
      id: 'expired',
      type: 'time_based',
      condition: (entry) => this.isExpired(entry),
      description: 'Invalidate expired cache entries',
      triggerCount: 0,
    });
  }
  
  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    // Clean expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const removed = this.clearExpired();
      if (removed > 0) {
        logger.debug('Automatic cleanup completed', { entriesRemoved: removed });
      }
    }, 5 * 60 * 1000);
  }
  
  /**
   * Stop cleanup timer
   */
  public stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

let cacheInstance: ResponseCache | null = null;

/**
 * Get response cache instance
 */
export function getResponseCache(config?: Partial<ResponseCacheConfig>): ResponseCache {
  if (!cacheInstance) {
    cacheInstance = ResponseCache.getInstance(config);
  }
  return cacheInstance;
}

/**
 * Cache a response
 */
export async function cacheResponse(
  keyComponents: CacheKeyComponents,
  response: string,
  ttl?: number,
  type?: 'classification' | 'decision' | 'other',
  metadata?: { signalId?: string; source?: string }
): Promise<string> {
  const cache = getResponseCache();
  return await cache.cacheResponse(keyComponents, response, ttl, type, metadata);
}

/**
 * Get cached response
 */
export function getCachedResponse(keyComponents: CacheKeyComponents): string | null {
  const cache = getResponseCache();
  return cache.getCachedResponse(keyComponents);
}

/**
 * Invalidate cache entry
 */
export function invalidateCache(keyComponents: CacheKeyComponents): boolean {
  const cache = getResponseCache();
  return cache.invalidate(keyComponents);
}

/**
 * Invalidate by signal ID
 */
export function invalidateCacheBySignal(signalId: string): number {
  const cache = getResponseCache();
  return cache.invalidateBySignalId(signalId);
}

/**
 * Invalidate by source
 */
export function invalidateCacheBySource(source: string): number {
  const cache = getResponseCache();
  return cache.invalidateBySource(source);
}

/**
 * Mark feedback on cached response
 */
export function markCacheFeedback(
  keyComponents: CacheKeyComponents,
  status: 'correct' | 'incorrect' | 'modified'
): boolean {
  const cache = getResponseCache();
  return cache.markFeedback(keyComponents, status);
}

/**
 * Warm cache with common patterns
 */
export async function warmCache(): Promise<number> {
  const cache = getResponseCache();
  return await cache.warmCache();
}

/**
 * Add warming pattern
 */
export function addWarmingPattern(pattern: WarmingPattern): void {
  const cache = getResponseCache();
  cache.addWarmingPattern(pattern);
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats {
  const cache = getResponseCache();
  return cache.getCacheStats();
}

/**
 * Get cache efficiency
 */
export function getCacheEfficiency(): CacheEfficiency {
  const cache = getResponseCache();
  return cache.getCacheEfficiency();
}

/**
 * Clear cache
 */
export function clearResponseCache(): number {
  const cache = getResponseCache();
  return cache.clearCache();
}

/**
 * Clear expired entries
 */
export function clearExpiredCache(): number {
  const cache = getResponseCache();
  return cache.clearExpired();
}

/**
 * Load cache from disk
 */
export async function loadCacheFromDisk(): Promise<number> {
  const cache = getResponseCache();
  return await cache.loadCache();
}

/**
 * Save hot cache entries to disk
 */
export async function saveCacheToDisk(): Promise<number> {
  const cache = getResponseCache();
  return await cache.saveCache();
}
