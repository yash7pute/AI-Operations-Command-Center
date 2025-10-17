/**
 * Classification Cache Manager
 * 
 * Implements in-memory LRU cache for signal classifications with:
 * - LRU eviction (max 1000 entries)
 * - TTL-based expiration (default 1 hour)
 * - Disk persistence (cache/classifications.json)
 * - Periodic cleanup
 * - Performance monitoring and statistics
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import logger from '../../utils/logger';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Cached classification entry
 */
export interface CacheEntry {
    /** Cache key (hash of signal content) */
    key: string;
    
    /** Cached classification data */
    value: any;
    
    /** Timestamp when entry was created (ms) */
    createdAt: number;
    
    /** Timestamp when entry was last accessed (ms) */
    lastAccessedAt: number;
    
    /** Time-to-live in milliseconds */
    ttl: number;
    
    /** Number of times this entry was accessed */
    hitCount: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
    /** Total number of cache hits */
    hitCount: number;
    
    /** Total number of cache misses */
    missCount: number;
    
    /** Cache hit rate (0-1) */
    hitRate: number;
    
    /** Current number of entries in cache */
    entryCount: number;
    
    /** Maximum cache capacity */
    maxEntries: number;
    
    /** Total cache operations */
    totalOperations: number;
    
    /** Average entry age (ms) */
    avgEntryAge: number;
    
    /** Cache size in bytes (estimated) */
    sizeBytes: number;
    
    /** Last cleanup timestamp */
    lastCleanup: string;
    
    /** Number of evictions due to LRU */
    evictionCount: number;
    
    /** Number of entries expired by TTL */
    expirationCount: number;
}

/**
 * Signal content for hashing
 */
export interface SignalContent {
    subject?: string;
    body: string;
    sender: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_CACHE_ENTRIES = 1000;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_FILE_PATH = path.join(process.cwd(), 'data', 'cache', 'classifications.json');

// ============================================================================
// Classification Cache Manager
// ============================================================================

/**
 * LRU cache for signal classifications with disk persistence
 */
export class ClassificationCache {
    private static instance: ClassificationCache;
    
    /** Cache storage (Map maintains insertion order for LRU) */
    private cache: Map<string, CacheEntry>;
    
    /** Cache statistics */
    private stats: {
        hitCount: number;
        missCount: number;
        evictionCount: number;
        expirationCount: number;
        lastCleanup: Date;
    };
    
    /** Cleanup interval timer */
    private cleanupTimer: NodeJS.Timeout | null;
    
    /** Whether cache has been modified since last save */
    private isDirty: boolean;
    
    private constructor() {
        this.cache = new Map();
        this.stats = {
            hitCount: 0,
            missCount: 0,
            evictionCount: 0,
            expirationCount: 0,
            lastCleanup: new Date(),
        };
        this.cleanupTimer = null;
        this.isDirty = false;
        
        // Load cache from disk
        this.loadFromDisk();
        
        // Start periodic cleanup
        this.startPeriodicCleanup();
        
        // Setup graceful shutdown handlers
        this.setupShutdownHandlers();
        
        logger.info('[ClassificationCache] Initialized', {
            maxEntries: MAX_CACHE_ENTRIES,
            ttl: `${DEFAULT_TTL_MS / 1000}s`,
            cleanupInterval: `${CLEANUP_INTERVAL_MS / 1000}s`,
        });
    }
    
    /**
     * Get singleton instance
     */
    public static getInstance(): ClassificationCache {
        if (!ClassificationCache.instance) {
            ClassificationCache.instance = new ClassificationCache();
        }
        return ClassificationCache.instance;
    }
    
    // ========================================================================
    // Cache Operations
    // ========================================================================
    
    /**
     * Generate cache key from signal content
     */
    public generateKey(content: SignalContent): string {
        const data = `${content.subject || ''}|${content.body}|${content.sender}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }
    
    /**
     * Get cached classification
     */
    public get(key: string): any | null {
        const entry = this.cache.get(key);
        
        if (!entry) {
            this.stats.missCount++;
            logger.debug('[ClassificationCache] Cache miss', { key: key.substring(0, 8) });
            return null;
        }
        
        // Check if entry has expired
        const now = Date.now();
        if (now - entry.createdAt > entry.ttl) {
            this.cache.delete(key);
            this.stats.expirationCount++;
            this.stats.missCount++;
            this.isDirty = true;
            logger.debug('[ClassificationCache] Cache entry expired', {
                key: key.substring(0, 8),
                age: `${(now - entry.createdAt) / 1000}s`,
            });
            return null;
        }
        
        // Update access time and hit count (LRU)
        entry.lastAccessedAt = now;
        entry.hitCount++;
        
        // Move to end (most recently used) by deleting and re-inserting
        this.cache.delete(key);
        this.cache.set(key, entry);
        
        this.stats.hitCount++;
        this.isDirty = true;
        
        logger.debug('[ClassificationCache] Cache hit', {
            key: key.substring(0, 8),
            hitCount: entry.hitCount,
            age: `${(now - entry.createdAt) / 1000}s`,
        });
        
        return entry.value;
    }
    
    /**
     * Set cached classification
     */
    public set(key: string, value: any, ttl: number = DEFAULT_TTL_MS): void {
        const now = Date.now();
        
        // Check if we need to evict oldest entry (LRU)
        if (this.cache.size >= MAX_CACHE_ENTRIES && !this.cache.has(key)) {
            this.evictOldest();
        }
        
        // Create or update entry
        const entry: CacheEntry = {
            key,
            value,
            createdAt: now,
            lastAccessedAt: now,
            ttl,
            hitCount: 0,
        };
        
        // Remove existing entry first to update order
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        
        this.cache.set(key, entry);
        this.isDirty = true;
        
        logger.debug('[ClassificationCache] Cache set', {
            key: key.substring(0, 8),
            ttl: `${ttl / 1000}s`,
            size: this.cache.size,
        });
    }
    
    /**
     * Check if key exists in cache (without updating access time)
     */
    public has(key: string): boolean {
        const entry = this.cache.get(key);
        
        if (!entry) {
            return false;
        }
        
        // Check if expired
        const now = Date.now();
        if (now - entry.createdAt > entry.ttl) {
            this.cache.delete(key);
            this.stats.expirationCount++;
            this.isDirty = true;
            return false;
        }
        
        return true;
    }
    
    /**
     * Invalidate (remove) cached entry
     */
    public invalidate(key: string): boolean {
        const deleted = this.cache.delete(key);
        
        if (deleted) {
            this.isDirty = true;
            logger.info('[ClassificationCache] Cache invalidated', {
                key: key.substring(0, 8),
            });
        }
        
        return deleted;
    }
    
    /**
     * Clear all cache entries
     */
    public clear(): void {
        const size = this.cache.size;
        this.cache.clear();
        this.isDirty = true;
        
        logger.info('[ClassificationCache] Cache cleared', { entriesRemoved: size });
    }
    
    // ========================================================================
    // LRU Eviction
    // ========================================================================
    
    /**
     * Evict oldest (least recently used) entry
     */
    private evictOldest(): void {
        // Map maintains insertion order, first entry is oldest
        const oldestKey = this.cache.keys().next().value;
        
        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.stats.evictionCount++;
            this.isDirty = true;
            
            logger.debug('[ClassificationCache] LRU eviction', {
                key: oldestKey.substring(0, 8),
                evictionCount: this.stats.evictionCount,
            });
        }
    }
    
    // ========================================================================
    // Cleanup
    // ========================================================================
    
    /**
     * Start periodic cleanup of expired entries
     */
    private startPeriodicCleanup(): void {
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, CLEANUP_INTERVAL_MS);
        
        logger.info('[ClassificationCache] Periodic cleanup started', {
            interval: `${CLEANUP_INTERVAL_MS / 1000}s`,
        });
    }
    
    /**
     * Stop periodic cleanup
     */
    private stopPeriodicCleanup(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
            logger.info('[ClassificationCache] Periodic cleanup stopped');
        }
    }
    
    /**
     * Remove expired entries
     */
    public cleanup(): void {
        const now = Date.now();
        let removedCount = 0;
        
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.createdAt > entry.ttl) {
                this.cache.delete(key);
                this.stats.expirationCount++;
                removedCount++;
            }
        }
        
        if (removedCount > 0) {
            this.isDirty = true;
            logger.info('[ClassificationCache] Cleanup completed', {
                removedCount,
                remainingCount: this.cache.size,
            });
        }
        
        this.stats.lastCleanup = new Date();
    }
    
    // ========================================================================
    // Persistence
    // ========================================================================
    
    /**
     * Load cache from disk
     */
    private loadFromDisk(): void {
        try {
            // Ensure cache directory exists
            const cacheDir = path.dirname(CACHE_FILE_PATH);
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }
            
            // Check if cache file exists
            if (!fs.existsSync(CACHE_FILE_PATH)) {
                logger.info('[ClassificationCache] No cache file found, starting fresh');
                return;
            }
            
            // Read and parse cache file
            const data = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
            const parsed = JSON.parse(data);
            
            // Restore cache entries
            const now = Date.now();
            let loadedCount = 0;
            let expiredCount = 0;
            
            for (const entry of parsed.entries || []) {
                // Skip expired entries
                if (now - entry.createdAt > entry.ttl) {
                    expiredCount++;
                    continue;
                }
                
                this.cache.set(entry.key, entry);
                loadedCount++;
            }
            
            // Restore statistics
            if (parsed.stats) {
                this.stats = {
                    ...this.stats,
                    ...parsed.stats,
                    lastCleanup: new Date(parsed.stats.lastCleanup),
                };
            }
            
            logger.info('[ClassificationCache] Cache loaded from disk', {
                loaded: loadedCount,
                expired: expiredCount,
                file: CACHE_FILE_PATH,
            });
            
        } catch (error) {
            logger.error('[ClassificationCache] Failed to load cache from disk', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    
    /**
     * Save cache to disk
     */
    public saveToDisk(): void {
        if (!this.isDirty) {
            logger.debug('[ClassificationCache] Cache unchanged, skipping save');
            return;
        }
        
        try {
            // Ensure cache directory exists
            const cacheDir = path.dirname(CACHE_FILE_PATH);
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }
            
            // Prepare data for serialization
            const data = {
                version: '1.0',
                savedAt: new Date().toISOString(),
                entries: Array.from(this.cache.values()),
                stats: {
                    ...this.stats,
                    lastCleanup: this.stats.lastCleanup.toISOString(),
                },
            };
            
            // Write to disk
            fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
            this.isDirty = false;
            
            logger.info('[ClassificationCache] Cache saved to disk', {
                entries: this.cache.size,
                file: CACHE_FILE_PATH,
            });
            
        } catch (error) {
            logger.error('[ClassificationCache] Failed to save cache to disk', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    
    // ========================================================================
    // Statistics
    // ========================================================================
    
    /**
     * Get cache statistics
     */
    public getStats(): CacheStats {
        const totalOps = this.stats.hitCount + this.stats.missCount;
        const hitRate = totalOps > 0 ? this.stats.hitCount / totalOps : 0;
        
        // Calculate average entry age
        const now = Date.now();
        let totalAge = 0;
        for (const entry of this.cache.values()) {
            totalAge += now - entry.createdAt;
        }
        const avgAge = this.cache.size > 0 ? totalAge / this.cache.size : 0;
        
        // Estimate cache size in bytes
        const sizeBytes = JSON.stringify(Array.from(this.cache.values())).length;
        
        return {
            hitCount: this.stats.hitCount,
            missCount: this.stats.missCount,
            hitRate,
            entryCount: this.cache.size,
            maxEntries: MAX_CACHE_ENTRIES,
            totalOperations: totalOps,
            avgEntryAge: avgAge,
            sizeBytes,
            lastCleanup: this.stats.lastCleanup.toISOString(),
            evictionCount: this.stats.evictionCount,
            expirationCount: this.stats.expirationCount,
        };
    }
    
    /**
     * Reset statistics
     */
    public resetStats(): void {
        this.stats.hitCount = 0;
        this.stats.missCount = 0;
        this.stats.evictionCount = 0;
        this.stats.expirationCount = 0;
        
        logger.info('[ClassificationCache] Statistics reset');
    }
    
    // ========================================================================
    // Shutdown Handlers
    // ========================================================================
    
    /**
     * Setup graceful shutdown handlers
     */
    private setupShutdownHandlers(): void {
        const shutdown = () => {
            logger.info('[ClassificationCache] Shutting down...');
            this.stopPeriodicCleanup();
            this.saveToDisk();
            logger.info('[ClassificationCache] Shutdown complete');
        };
        
        // Handle various shutdown signals
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        process.on('exit', shutdown);
        
        // Handle uncaught errors (save cache before crash)
        process.on('uncaughtException', (error) => {
            logger.error('[ClassificationCache] Uncaught exception, saving cache', {
                error: error.message,
            });
            this.saveToDisk();
            process.exit(1);
        });
    }
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Get singleton cache instance
 */
export function getClassificationCache(): ClassificationCache {
    return ClassificationCache.getInstance();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats {
    return getClassificationCache().getStats();
}

/**
 * Save cache to disk (manual trigger)
 */
export function saveCacheToDisk(): void {
    getClassificationCache().saveToDisk();
}

export default ClassificationCache;
