/**
 * Cache Module Exports
 * 
 * Exports cache functionality for signal classifications and LLM responses.
 */

export {
    ClassificationCache,
    getClassificationCache,
    getCacheStats,
    saveCacheToDisk,
    type CacheEntry,
    type CacheStats,
    type SignalContent,
} from './classification-cache';

export {
    ResponseCache,
    getResponseCache,
    cacheResponse,
    getCachedResponse,
    invalidateCache,
    invalidateCacheBySignal,
    invalidateCacheBySource,
    markCacheFeedback,
    warmCache,
    addWarmingPattern,
    getCacheStats as getResponseCacheStats,
    getCacheEfficiency,
    clearResponseCache,
    clearExpiredCache,
    loadCacheFromDisk,
    saveCacheToDisk as saveResponseCacheToDisk,
    type CacheEntry as ResponseCacheEntry,
    type CacheKeyComponents,
    type CacheStats as ResponseCacheStats,
    type CacheEfficiency,
    type WarmingPattern,
    type InvalidationRule,
    type ResponseCacheConfig,
} from './response-cache';

export { default } from './classification-cache';
