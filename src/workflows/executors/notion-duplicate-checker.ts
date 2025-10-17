/**
 * Notion Duplicate Checker
 * Detects duplicate tasks in Notion databases using fuzzy matching
 */

import { Client } from '@notionhq/client';
import logger from '../../utils/logger';
import { config } from '../../config';

// Initialize Notion client
const NOTION_API_KEY = config.NOTION_API_KEY;
const notion = new Client({ auth: NOTION_API_KEY });

// Similarity threshold for duplicate detection
const DUPLICATE_THRESHOLD = 0.85;

// Cache for recent duplicate checks (LRU-style, max 100 entries)
interface CacheEntry {
    taskTitle: string;
    databaseId: string;
    result: DuplicateCheckResult;
    timestamp: number;
}

const duplicateCheckCache: CacheEntry[] = [];
const MAX_CACHE_SIZE = 100;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Common words to ignore in fuzzy matching
const COMMON_WORDS = new Set([
    'a', 'an', 'the', 'to', 'for', 'of', 'in', 'on', 'at', 'by',
    'with', 'from', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
    'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did'
]);

/**
 * Duplicate check result
 */
export interface DuplicateCheckResult {
    isDuplicate: boolean;
    existingPageId?: string;
    existingPageUrl?: string;
    similarity: number;
    matchedTitle?: string;
}

/**
 * Normalizes a string for comparison
 * - Converts to lowercase
 * - Removes punctuation
 * - Removes common words
 * - Trims whitespace
 * @param text - Text to normalize
 * @returns Normalized text
 */
function normalizeText(text: string): string {
    // Convert to lowercase
    let normalized = text.toLowerCase();
    
    // Remove punctuation (keep alphanumeric and spaces)
    normalized = normalized.replace(/[^a-z0-9\s]/g, ' ');
    
    // Split into words, filter common words, rejoin
    const words = normalized
        .split(/\s+/)
        .filter(word => word.length > 0 && !COMMON_WORDS.has(word));
    
    return words.join(' ').trim();
}

/**
 * Calculates Levenshtein distance between two strings
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Edit distance
 */
function levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    
    // Create 2D array for dynamic programming
    const dp: number[][] = Array(len1 + 1)
        .fill(null)
        .map(() => Array(len2 + 1).fill(0));
    
    // Initialize first row and column
    for (let i = 0; i <= len1; i++) {
        dp[i][0] = i;
    }
    for (let j = 0; j <= len2; j++) {
        dp[0][j] = j;
    }
    
    // Fill the dp table
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,      // deletion
                    dp[i][j - 1] + 1,      // insertion
                    dp[i - 1][j - 1] + 1   // substitution
                );
            }
        }
    }
    
    return dp[len1][len2];
}

/**
 * Calculates similarity score between two strings (0-1)
 * Uses normalized Levenshtein distance
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Similarity score (1 = identical, 0 = completely different)
 */
function calculateSimilarity(str1: string, str2: string): number {
    // Normalize both strings
    const normalized1 = normalizeText(str1);
    const normalized2 = normalizeText(str2);
    
    // Handle empty strings
    if (normalized1.length === 0 && normalized2.length === 0) return 1.0;
    if (normalized1.length === 0 || normalized2.length === 0) return 0.0;
    
    // Calculate Levenshtein distance
    const distance = levenshteinDistance(normalized1, normalized2);
    
    // Normalize by maximum possible distance (length of longer string)
    const maxLength = Math.max(normalized1.length, normalized2.length);
    const similarity = 1 - (distance / maxLength);
    
    return similarity;
}

/**
 * Generates a safe page URL from page ID
 * @param pageId - Notion page ID
 * @returns Public URL
 */
function safePageUrl(pageId: string): string {
    const compact = pageId.replace(/-/g, '');
    return `https://www.notion.so/${compact}`;
}

/**
 * Retrieves a cached duplicate check result if available and not expired
 * @param taskTitle - Task title to check
 * @param databaseId - Database ID
 * @returns Cached result or undefined
 */
function getCachedResult(taskTitle: string, databaseId: string): DuplicateCheckResult | undefined {
    const now = Date.now();
    
    // Find matching cache entry
    const cacheEntry = duplicateCheckCache.find(
        entry => entry.taskTitle === taskTitle && 
                 entry.databaseId === databaseId &&
                 (now - entry.timestamp) < CACHE_TTL_MS
    );
    
    if (cacheEntry) {
        logger.debug('Duplicate check cache hit', { taskTitle, databaseId });
        return cacheEntry.result;
    }
    
    return undefined;
}

/**
 * Caches a duplicate check result
 * @param taskTitle - Task title
 * @param databaseId - Database ID
 * @param result - Check result to cache
 */
function cacheResult(taskTitle: string, databaseId: string, result: DuplicateCheckResult): void {
    // Remove oldest entry if cache is full
    if (duplicateCheckCache.length >= MAX_CACHE_SIZE) {
        duplicateCheckCache.shift();
    }
    
    // Add new entry
    duplicateCheckCache.push({
        taskTitle,
        databaseId,
        result,
        timestamp: Date.now()
    });
    
    logger.debug('Cached duplicate check result', { 
        taskTitle, 
        databaseId, 
        cacheSize: duplicateCheckCache.length 
    });
}

/**
 * Checks if a task title is a duplicate in the Notion database
 * Uses fuzzy matching with configurable similarity threshold
 * @param taskTitle - Title of the task to check
 * @param databaseId - Notion database ID to search (optional, uses default if not provided)
 * @returns Duplicate check result with similarity score and existing page info
 */
export async function checkDuplicate(
    taskTitle: string,
    databaseId?: string
): Promise<DuplicateCheckResult> {
    const startTime = Date.now();
    
    try {
        // Use default database ID if not provided
        const targetDatabaseId = databaseId || config.NOTION_DATABASE_ID;
        
        if (!targetDatabaseId) {
            throw new Error('Database ID not provided and NOTION_DATABASE_ID not configured');
        }
        
        if (!taskTitle || taskTitle.trim().length === 0) {
            logger.warn('Empty task title provided for duplicate check');
            return {
                isDuplicate: false,
                similarity: 0
            };
        }
        
        logger.info('Starting duplicate check', { 
            taskTitle, 
            databaseId: targetDatabaseId 
        });
        
        // Check cache first
        const cachedResult = getCachedResult(taskTitle, targetDatabaseId);
        if (cachedResult) {
            return cachedResult;
        }
        
        // Query Notion database for all pages
        // Note: Notion API doesn't support fuzzy search, so we retrieve all and compare locally
        const response = await notion.databases.query({
            database_id: targetDatabaseId,
            page_size: 100 // Limit to prevent excessive API calls
        });
        
        logger.debug('Retrieved pages from Notion', { 
            pageCount: response.results.length 
        });
        
        // Find best match
        let bestMatch: {
            pageId: string;
            title: string;
            similarity: number;
        } | null = null;
        
        for (const page of response.results) {
            if (!('properties' in page)) continue;
            
            // Extract title from properties
            // Notion typically uses "Name" or "Title" property
            let pageTitle = '';
            
            // Try to find title property (try common property names)
            const titleProp = page.properties['Name'] || 
                             page.properties['Title'] || 
                             page.properties['name'] || 
                             page.properties['title'];
            
            if (titleProp && titleProp.type === 'title' && 'title' in titleProp) {
                const titleArray = titleProp.title;
                if (Array.isArray(titleArray) && titleArray.length > 0) {
                    pageTitle = titleArray
                        .map((t: any) => t.plain_text || '')
                        .join('');
                }
            }
            
            if (!pageTitle) continue;
            
            // Calculate similarity
            const similarity = calculateSimilarity(taskTitle, pageTitle);
            
            logger.debug('Comparing titles', {
                inputTitle: taskTitle,
                existingTitle: pageTitle,
                similarity: similarity.toFixed(3)
            });
            
            // Update best match if this is better
            if (!bestMatch || similarity > bestMatch.similarity) {
                bestMatch = {
                    pageId: page.id,
                    title: pageTitle,
                    similarity
                };
            }
        }
        
        // Determine if duplicate based on threshold
        const isDuplicate = bestMatch ? bestMatch.similarity >= DUPLICATE_THRESHOLD : false;
        
        const result: DuplicateCheckResult = {
            isDuplicate,
            similarity: bestMatch ? bestMatch.similarity : 0
        };
        
        if (isDuplicate && bestMatch) {
            result.existingPageId = bestMatch.pageId;
            result.existingPageUrl = safePageUrl(bestMatch.pageId);
            result.matchedTitle = bestMatch.title;
            
            logger.warn('Duplicate task detected', {
                inputTitle: taskTitle,
                matchedTitle: bestMatch.title,
                similarity: bestMatch.similarity.toFixed(3),
                existingPageUrl: result.existingPageUrl,
                executionTime: Date.now() - startTime
            });
        } else {
            logger.info('No duplicate found', {
                taskTitle,
                bestSimilarity: bestMatch ? bestMatch.similarity.toFixed(3) : 'N/A',
                threshold: DUPLICATE_THRESHOLD,
                executionTime: Date.now() - startTime
            });
        }
        
        // Cache the result
        cacheResult(taskTitle, targetDatabaseId, result);
        
        return result;
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        logger.error('Error during duplicate check', {
            taskTitle,
            databaseId,
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            executionTime: Date.now() - startTime
        });
        
        // Return non-duplicate result on error (fail-open approach)
        // This prevents blocking task creation due to duplicate check failures
        return {
            isDuplicate: false,
            similarity: 0
        };
    }
}

/**
 * Clears the duplicate check cache
 * Useful for testing or manual cache invalidation
 */
export function clearCache(): void {
    duplicateCheckCache.length = 0;
    logger.info('Duplicate check cache cleared');
}

/**
 * Gets current cache statistics
 * @returns Cache size and oldest entry age
 */
export function getCacheStats(): { size: number; oldestEntryAge?: number } {
    if (duplicateCheckCache.length === 0) {
        return { size: 0 };
    }
    
    const now = Date.now();
    const oldestEntry = duplicateCheckCache[0];
    const oldestEntryAge = now - oldestEntry.timestamp;
    
    return {
        size: duplicateCheckCache.length,
        oldestEntryAge
    };
}

export default {
    checkDuplicate,
    clearCache,
    getCacheStats
};
