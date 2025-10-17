/**
 * Idempotency Manager
 * 
 * Ensures actions execute exactly once even if retried by:
 * - Generating unique idempotency keys
 * - Caching execution results
 * - Preventing duplicate operations
 * - Auto-expiring stale entries
 * 
 * @module workflows/idempotency-manager
 */

import crypto from 'crypto';
import logger from '../utils/logger';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Idempotency check result
 */
export interface IdempotencyCheckResult {
  /** Whether action was already executed */
  executed: boolean;
  
  /** Cached result if already executed */
  cachedResult?: any;
  
  /** When the action was first executed */
  executedAt?: Date;
  
  /** Idempotency key used */
  idempotencyKey: string;
  
  /** Time until cache expires (ms) */
  ttl?: number;
}

/**
 * Idempotency record stored in cache
 */
interface IdempotencyRecord {
  /** Idempotency key */
  key: string;
  
  /** Original action parameters */
  params: Record<string, any>;
  
  /** Action type */
  actionType: string;
  
  /** Target platform */
  target: string;
  
  /** Result from execution */
  result: any;
  
  /** When action was executed */
  executedAt: Date;
  
  /** When cache entry expires */
  expiresAt: Date;
  
  /** Signal ID (if applicable) */
  signalId?: string;
  
  /** How many times this was attempted */
  attemptCount: number;
}

/**
 * Reasoning result for generating idempotency key
 */
export interface ReasoningResult {
  /** Signal identifier */
  signalId: string;
  
  /** Action to execute */
  action: string;
  
  /** Target platform */
  target: string;
  
  /** Action parameters */
  params: Record<string, any>;
  
  /** Additional context */
  context?: Record<string, any>;
}

/**
 * Idempotency statistics
 */
export interface IdempotencyStats {
  /** Total number of cached entries */
  totalCached: number;
  
  /** Number of duplicate executions prevented */
  duplicatesPrevented: number;
  
  /** Number of cache hits */
  cacheHits: number;
  
  /** Number of cache misses */
  cacheMisses: number;
  
  /** Cache hit rate (percentage) */
  hitRate: number;
  
  /** Number of expired entries cleaned up */
  expiredCleaned: number;
}

/**
 * Idempotency configuration
 */
export interface IdempotencyConfig {
  /** Default TTL in milliseconds (default: 24 hours) */
  defaultTTL?: number;
  
  /** Maximum cache size (default: 10000) */
  maxCacheSize?: number;
  
  /** Whether to enable auto-cleanup (default: true) */
  enableAutoCleanup?: boolean;
  
  /** Cleanup interval in milliseconds (default: 1 hour) */
  cleanupInterval?: number;
  
  /** Whether to include params in key hash (default: true) */
  includeParamsInKey?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Default TTL: 24 hours in milliseconds */
const DEFAULT_TTL = 24 * 60 * 60 * 1000;

/** Maximum cache size */
const MAX_CACHE_SIZE = 10000;

/** Cleanup interval: 1 hour in milliseconds */
const CLEANUP_INTERVAL = 60 * 60 * 1000;

/** Hash algorithm for generating keys */
const HASH_ALGORITHM = 'sha256';

/** Hash encoding */
const HASH_ENCODING = 'hex' as const;

// ============================================================================
// In-Memory Cache (Replace with Redis in production)
// ============================================================================

/** Idempotency cache: key -> record */
const idempotencyCache = new Map<string, IdempotencyRecord>();

/** Statistics tracker */
let stats: IdempotencyStats = {
  totalCached: 0,
  duplicatesPrevented: 0,
  cacheHits: 0,
  cacheMisses: 0,
  hitRate: 0,
  expiredCleaned: 0
};

/** Configuration */
let config: Required<IdempotencyConfig> = {
  defaultTTL: DEFAULT_TTL,
  maxCacheSize: MAX_CACHE_SIZE,
  enableAutoCleanup: true,
  cleanupInterval: CLEANUP_INTERVAL,
  includeParamsInKey: true
};

/** Cleanup interval handle */
let cleanupIntervalHandle: NodeJS.Timeout | null = null;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Generate idempotency key from reasoning result
 * 
 * Key format: signalId + actionType + target + hash(params)
 * 
 * @param reasoningResult - Reasoning result containing action details
 * @returns Unique idempotency key
 * 
 * @example
 * ```typescript
 * const key = generateIdempotencyKey({
 *   signalId: 'signal-123',
 *   action: 'create_task',
 *   target: 'trello',
 *   params: { name: 'Review Invoice', boardId: 'board-456' }
 * });
 * // Returns: "signal-123:create_task:trello:a3f2c1b4..."
 * ```
 */
export function generateIdempotencyKey(reasoningResult: ReasoningResult): string {
  const { signalId, action, target, params } = reasoningResult;
  
  // Create base key components
  const components = [
    signalId || 'no-signal',
    action,
    target
  ];
  
  // Add params hash if enabled
  if (config.includeParamsInKey && params) {
    const paramsHash = hashObject(params);
    components.push(paramsHash);
  }
  
  // Join components with colon separator
  const key = components.join(':');
  
  logger.debug('Generated idempotency key:', {
    key,
    signalId,
    action,
    target,
    paramsIncluded: config.includeParamsInKey
  });
  
  return key;
}

/**
 * Check if action has already been executed
 * 
 * @param idempotencyKey - Idempotency key to check
 * @returns Check result with cached data if executed
 * 
 * @example
 * ```typescript
 * const result = checkExecuted('signal-123:create_task:trello:a3f2c1b4');
 * 
 * if (result.executed) {
 *   console.log('Action already executed');
 *   console.log('Cached result:', result.cachedResult);
 *   console.log('Executed at:', result.executedAt);
 *   return result.cachedResult;
 * }
 * 
 * // Proceed with execution...
 * ```
 */
export function checkExecuted(idempotencyKey: string): IdempotencyCheckResult {
  const record = idempotencyCache.get(idempotencyKey);
  
  if (!record) {
    // Cache miss
    stats.cacheMisses++;
    updateHitRate();
    
    logger.debug('Idempotency check: NOT executed', { idempotencyKey });
    
    return {
      executed: false,
      idempotencyKey
    };
  }
  
  // Check if expired
  if (record.expiresAt < new Date()) {
    logger.debug('Idempotency check: expired entry', {
      idempotencyKey,
      expiresAt: record.expiresAt
    });
    
    // Remove expired entry
    idempotencyCache.delete(idempotencyKey);
    stats.cacheMisses++;
    updateHitRate();
    
    return {
      executed: false,
      idempotencyKey
    };
  }
  
  // Cache hit - action already executed
  stats.cacheHits++;
  stats.duplicatesPrevented++;
  updateHitRate();
  
  const ttl = record.expiresAt.getTime() - Date.now();
  
  logger.info('Idempotency check: DUPLICATE PREVENTED', {
    idempotencyKey,
    actionType: record.actionType,
    target: record.target,
    executedAt: record.executedAt,
    attemptCount: record.attemptCount + 1,
    ttl
  });
  
  // Increment attempt count
  record.attemptCount++;
  
  return {
    executed: true,
    cachedResult: record.result,
    executedAt: record.executedAt,
    idempotencyKey,
    ttl
  };
}

/**
 * Mark action as executed and cache the result
 * 
 * @param idempotencyKey - Idempotency key
 * @param result - Execution result to cache
 * @param ttl - Time to live in milliseconds (default: 24 hours)
 * @param metadata - Additional metadata to store
 * 
 * @example
 * ```typescript
 * const key = generateIdempotencyKey(reasoningResult);
 * 
 * // Execute action
 * const result = await createTrelloCard({ name: 'Review' });
 * 
 * // Mark as executed
 * markExecuted(key, result, 24 * 60 * 60 * 1000);
 * 
 * // Future attempts will return cached result
 * ```
 */
export function markExecuted(
  idempotencyKey: string,
  result: any,
  ttl: number = config.defaultTTL,
  metadata?: {
    actionType?: string;
    target?: string;
    params?: Record<string, any>;
    signalId?: string;
  }
): void {
  // Check cache size limit
  if (idempotencyCache.size >= config.maxCacheSize) {
    logger.warn('Idempotency cache full, cleaning up oldest entries', {
      currentSize: idempotencyCache.size,
      maxSize: config.maxCacheSize
    });
    cleanupOldestEntries(Math.floor(config.maxCacheSize * 0.2)); // Remove 20%
  }
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl);
  
  // Parse key to extract components
  const [signalId, actionType, target] = idempotencyKey.split(':');
  
  const record: IdempotencyRecord = {
    key: idempotencyKey,
    params: metadata?.params || {},
    actionType: metadata?.actionType || actionType || 'unknown',
    target: metadata?.target || target || 'unknown',
    result,
    executedAt: now,
    expiresAt,
    signalId: metadata?.signalId || signalId,
    attemptCount: 1
  };
  
  idempotencyCache.set(idempotencyKey, record);
  stats.totalCached = idempotencyCache.size;
  
  logger.info('Action marked as executed', {
    idempotencyKey,
    actionType: record.actionType,
    target: record.target,
    expiresAt,
    ttl
  });
}

/**
 * Execute action with idempotency protection
 * 
 * This is a high-level wrapper that combines checking and marking.
 * 
 * @param reasoningResult - Reasoning result
 * @param executor - Async function that executes the action
 * @param ttl - Cache TTL in milliseconds
 * @returns Execution result (cached or fresh)
 * 
 * @example
 * ```typescript
 * const result = await executeWithIdempotency(
 *   {
 *     signalId: 'signal-123',
 *     action: 'create_task',
 *     target: 'trello',
 *     params: { name: 'Review Invoice' }
 *   },
 *   async () => {
 *     return await createTrelloCard({ name: 'Review Invoice' });
 *   }
 * );
 * 
 * // If called again with same params, returns cached result
 * ```
 */
export async function executeWithIdempotency<T = any>(
  reasoningResult: ReasoningResult,
  executor: () => Promise<T>,
  ttl?: number
): Promise<T> {
  // Generate idempotency key
  const key = generateIdempotencyKey(reasoningResult);
  
  // Check if already executed
  const check = checkExecuted(key);
  
  if (check.executed) {
    logger.info('Returning cached result due to idempotency', {
      idempotencyKey: key,
      actionType: reasoningResult.action,
      target: reasoningResult.target
    });
    return check.cachedResult as T;
  }
  
  // Execute action
  logger.info('Executing action (first time)', {
    idempotencyKey: key,
    actionType: reasoningResult.action,
    target: reasoningResult.target
  });
  
  const result = await executor();
  
  // Mark as executed
  markExecuted(key, result, ttl, {
    actionType: reasoningResult.action,
    target: reasoningResult.target,
    params: reasoningResult.params,
    signalId: reasoningResult.signalId
  });
  
  return result;
}

// ============================================================================
// Cache Management Functions
// ============================================================================

/**
 * Clear expired entries from cache
 * 
 * @returns Number of entries removed
 */
export function cleanupExpired(): number {
  const now = new Date();
  let removed = 0;
  
  for (const [key, record] of idempotencyCache.entries()) {
    if (record.expiresAt < now) {
      idempotencyCache.delete(key);
      removed++;
    }
  }
  
  if (removed > 0) {
    stats.expiredCleaned += removed;
    stats.totalCached = idempotencyCache.size;
    
    logger.info('Cleaned up expired idempotency entries', {
      removed,
      remaining: idempotencyCache.size
    });
  }
  
  return removed;
}

/**
 * Clear oldest entries to make room for new ones
 * 
 * @param count - Number of entries to remove
 * @returns Number of entries removed
 */
function cleanupOldestEntries(count: number): number {
  // Sort by executedAt (oldest first)
  const entries = Array.from(idempotencyCache.entries())
    .sort((a, b) => a[1].executedAt.getTime() - b[1].executedAt.getTime());
  
  let removed = 0;
  for (let i = 0; i < Math.min(count, entries.length); i++) {
    idempotencyCache.delete(entries[i][0]);
    removed++;
  }
  
  stats.totalCached = idempotencyCache.size;
  
  logger.info('Cleaned up oldest idempotency entries', {
    removed,
    remaining: idempotencyCache.size
  });
  
  return removed;
}

/**
 * Clear a specific idempotency key from cache
 * 
 * Useful for forcing re-execution of an action.
 * 
 * @param idempotencyKey - Key to clear
 * @returns Whether key was found and removed
 * 
 * @example
 * ```typescript
 * // Clear specific action to allow re-execution
 * const cleared = clearIdempotencyKey('signal-123:create_task:trello:a3f2c1b4');
 * 
 * if (cleared) {
 *   console.log('Action can now be re-executed');
 * }
 * ```
 */
export function clearIdempotencyKey(idempotencyKey: string): boolean {
  const existed = idempotencyCache.has(idempotencyKey);
  
  if (existed) {
    idempotencyCache.delete(idempotencyKey);
    stats.totalCached = idempotencyCache.size;
    
    logger.info('Cleared idempotency key', { idempotencyKey });
  }
  
  return existed;
}

/**
 * Clear all idempotency cache entries
 * 
 * Use with caution - this will allow all actions to be re-executed.
 * 
 * @returns Number of entries cleared
 */
export function clearAllCache(): number {
  const count = idempotencyCache.size;
  idempotencyCache.clear();
  
  stats.totalCached = 0;
  
  logger.warn('Cleared ALL idempotency cache entries', { count });
  
  return count;
}

/**
 * Get idempotency record for a key
 * 
 * @param idempotencyKey - Key to look up
 * @returns Record if found, null otherwise
 */
export function getIdempotencyRecord(idempotencyKey: string): IdempotencyRecord | null {
  const record = idempotencyCache.get(idempotencyKey);
  
  if (!record) {
    return null;
  }
  
  // Check if expired
  if (record.expiresAt < new Date()) {
    idempotencyCache.delete(idempotencyKey);
    return null;
  }
  
  return record;
}

/**
 * Get all cached idempotency keys
 * 
 * @param filter - Optional filter function
 * @returns Array of idempotency keys
 */
export function getCachedKeys(
  filter?: (record: IdempotencyRecord) => boolean
): string[] {
  const now = new Date();
  const keys: string[] = [];
  
  for (const [key, record] of idempotencyCache.entries()) {
    // Skip expired
    if (record.expiresAt < now) {
      continue;
    }
    
    // Apply filter if provided
    if (filter && !filter(record)) {
      continue;
    }
    
    keys.push(key);
  }
  
  return keys;
}

// ============================================================================
// Statistics and Monitoring
// ============================================================================

/**
 * Get idempotency statistics
 * 
 * @returns Current statistics
 * 
 * @example
 * ```typescript
 * const stats = getIdempotencyStats();
 * 
 * console.log('Cache Stats:');
 * console.log(`  Total cached: ${stats.totalCached}`);
 * console.log(`  Duplicates prevented: ${stats.duplicatesPrevented}`);
 * console.log(`  Hit rate: ${stats.hitRate.toFixed(1)}%`);
 * ```
 */
export function getIdempotencyStats(): IdempotencyStats {
  return { ...stats };
}

/**
 * Reset statistics counters
 */
export function resetStats(): void {
  stats = {
    totalCached: idempotencyCache.size,
    duplicatesPrevented: 0,
    cacheHits: 0,
    cacheMisses: 0,
    hitRate: 0,
    expiredCleaned: 0
  };
  
  logger.info('Reset idempotency statistics');
}

/**
 * Update hit rate calculation
 */
function updateHitRate(): void {
  const total = stats.cacheHits + stats.cacheMisses;
  stats.hitRate = total > 0 ? (stats.cacheHits / total) * 100 : 0;
}

/**
 * Get cache size information
 * 
 * @returns Cache size details
 */
export function getCacheInfo(): {
  currentSize: number;
  maxSize: number;
  utilizationPercent: number;
  oldestEntry?: Date;
  newestEntry?: Date;
} {
  let oldestEntry: Date | undefined;
  let newestEntry: Date | undefined;
  
  for (const record of idempotencyCache.values()) {
    if (!oldestEntry || record.executedAt < oldestEntry) {
      oldestEntry = record.executedAt;
    }
    if (!newestEntry || record.executedAt > newestEntry) {
      newestEntry = record.executedAt;
    }
  }
  
  return {
    currentSize: idempotencyCache.size,
    maxSize: config.maxCacheSize,
    utilizationPercent: (idempotencyCache.size / config.maxCacheSize) * 100,
    oldestEntry,
    newestEntry
  };
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configure idempotency manager
 * 
 * @param newConfig - Configuration options
 * 
 * @example
 * ```typescript
 * configure({
 *   defaultTTL: 12 * 60 * 60 * 1000,  // 12 hours
 *   maxCacheSize: 5000,
 *   enableAutoCleanup: true,
 *   cleanupInterval: 30 * 60 * 1000    // 30 minutes
 * });
 * ```
 */
export function configure(newConfig: Partial<IdempotencyConfig>): void {
  // Update config
  config = {
    ...config,
    ...newConfig
  };
  
  logger.info('Updated idempotency configuration', config);
  
  // Restart auto-cleanup if settings changed
  if (newConfig.enableAutoCleanup !== undefined || newConfig.cleanupInterval !== undefined) {
    stopAutoCleanup();
    if (config.enableAutoCleanup) {
      startAutoCleanup();
    }
  }
}

/**
 * Get current configuration
 * 
 * @returns Current configuration
 */
export function getConfig(): Required<IdempotencyConfig> {
  return { ...config };
}

// ============================================================================
// Auto-Cleanup
// ============================================================================

/**
 * Start automatic cleanup of expired entries
 */
export function startAutoCleanup(): void {
  if (cleanupIntervalHandle) {
    logger.warn('Auto-cleanup already running');
    return;
  }
  
  cleanupIntervalHandle = setInterval(() => {
    cleanupExpired();
  }, config.cleanupInterval);
  
  logger.info('Started auto-cleanup of expired idempotency entries', {
    interval: config.cleanupInterval
  });
}

/**
 * Stop automatic cleanup
 */
export function stopAutoCleanup(): void {
  if (cleanupIntervalHandle) {
    clearInterval(cleanupIntervalHandle);
    cleanupIntervalHandle = null;
    logger.info('Stopped auto-cleanup of idempotency entries');
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Hash an object to create a deterministic string
 * 
 * @param obj - Object to hash
 * @returns Hash string
 */
function hashObject(obj: any): string {
  // Sort keys for deterministic hash
  const sorted = sortObjectKeys(obj);
  const str = JSON.stringify(sorted);
  
  const hash = crypto
    .createHash(HASH_ALGORITHM)
    .update(str)
    .digest(HASH_ENCODING);
  
  // Return first 16 characters for brevity
  return hash.substring(0, 16);
}

/**
 * Recursively sort object keys for deterministic hashing
 * 
 * @param obj - Object to sort
 * @returns Object with sorted keys
 */
function sortObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  
  const sorted: any = {};
  const keys = Object.keys(obj).sort();
  
  for (const key of keys) {
    sorted[key] = sortObjectKeys(obj[key]);
  }
  
  return sorted;
}

/**
 * Parse idempotency key into components
 * 
 * @param idempotencyKey - Key to parse
 * @returns Parsed components
 */
export function parseIdempotencyKey(idempotencyKey: string): {
  signalId: string;
  actionType: string;
  target: string;
  paramsHash?: string;
} {
  const parts = idempotencyKey.split(':');
  
  return {
    signalId: parts[0] || 'unknown',
    actionType: parts[1] || 'unknown',
    target: parts[2] || 'unknown',
    paramsHash: parts[3]
  };
}

/**
 * Check if two sets of parameters would generate the same idempotency key
 * 
 * @param params1 - First parameter set
 * @param params2 - Second parameter set
 * @returns Whether they would generate the same key
 */
export function paramsAreEquivalent(
  params1: Record<string, any>,
  params2: Record<string, any>
): boolean {
  return hashObject(params1) === hashObject(params2);
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Find idempotency keys by action type
 * 
 * @param actionType - Action type to search for
 * @returns Array of matching keys
 */
export function findKeysByActionType(actionType: string): string[] {
  return getCachedKeys(record => record.actionType === actionType);
}

/**
 * Find idempotency keys by target
 * 
 * @param target - Target platform to search for
 * @returns Array of matching keys
 */
export function findKeysByTarget(target: string): string[] {
  return getCachedKeys(record => record.target === target);
}

/**
 * Find idempotency keys by signal ID
 * 
 * @param signalId - Signal ID to search for
 * @returns Array of matching keys
 */
export function findKeysBySignalId(signalId: string): string[] {
  return getCachedKeys(record => record.signalId === signalId);
}

/**
 * Get all records that will expire soon
 * 
 * @param withinMs - Time window in milliseconds (default: 1 hour)
 * @returns Array of records expiring soon
 */
export function getExpiringSoon(withinMs: number = 60 * 60 * 1000): IdempotencyRecord[] {
  const threshold = new Date(Date.now() + withinMs);
  const expiring: IdempotencyRecord[] = [];
  
  for (const record of idempotencyCache.values()) {
    if (record.expiresAt <= threshold && record.expiresAt > new Date()) {
      expiring.push(record);
    }
  }
  
  return expiring;
}

// ============================================================================
// Initialization
// ============================================================================

// Start auto-cleanup by default
if (config.enableAutoCleanup) {
  startAutoCleanup();
}

// Graceful shutdown handler
process.on('SIGINT', () => {
  stopAutoCleanup();
});

process.on('SIGTERM', () => {
  stopAutoCleanup();
});

// ============================================================================
// Exports
// ============================================================================

export default {
  // Core functions
  generateIdempotencyKey,
  checkExecuted,
  markExecuted,
  executeWithIdempotency,
  
  // Cache management
  cleanupExpired,
  clearIdempotencyKey,
  clearAllCache,
  getIdempotencyRecord,
  getCachedKeys,
  
  // Statistics
  getIdempotencyStats,
  resetStats,
  getCacheInfo,
  
  // Configuration
  configure,
  getConfig,
  
  // Auto-cleanup
  startAutoCleanup,
  stopAutoCleanup,
  
  // Utilities
  parseIdempotencyKey,
  paramsAreEquivalent,
  
  // Query functions
  findKeysByActionType,
  findKeysByTarget,
  findKeysBySignalId,
  getExpiringSoon
};
