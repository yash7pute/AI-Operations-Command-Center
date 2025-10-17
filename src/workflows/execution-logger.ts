/**
 * Execution Logger (Member 3: Orchestration Layer)
 * Logs every action execution with full context for audit trail and analytics
 * Provides query capabilities, real-time feed, and daily summaries
 */

import { promises as fs } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import logger from '../utils/logger';
import {
    ExecutionLog,
    ExecutionStatus,
    ExecutionFilters,
    DailySummary,
    ExecutionFeedEvent,
    QueueStats
} from '../types';

// Configuration constants
const EXECUTION_LOG_FILE = path.join(process.cwd(), 'logs', 'executions.jsonl');
const SUMMARY_DIR = path.join(process.cwd(), 'logs', 'summaries');
const MAX_IN_MEMORY_LOGS = 100; // Keep last 100 executions in memory
const LOG_RETENTION_DAYS = 90; // Keep logs for 90 days

// In-memory cache for recent executions (for fast lookups)
let recentExecutions: ExecutionLog[] = [];

// Real-time execution feed
export const executionFeed = new EventEmitter();

/**
 * Ensures log directory exists
 */
async function ensureLogDirectory(): Promise<void> {
    try {
        const logDir = path.dirname(EXECUTION_LOG_FILE);
        await fs.mkdir(logDir, { recursive: true });
        await fs.mkdir(SUMMARY_DIR, { recursive: true });
    } catch (error) {
        logger.error('Failed to create log directories', {
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Appends a log entry to the JSONL file
 * @param log - Execution log to append
 */
async function appendToLogFile(log: ExecutionLog): Promise<void> {
    try {
        await ensureLogDirectory();
        
        // Append as JSON line (one JSON object per line)
        const logLine = JSON.stringify(log) + '\n';
        await fs.appendFile(EXECUTION_LOG_FILE, logLine, 'utf-8');
        
        logger.debug('Execution logged to file', {
            actionId: log.actionId,
            status: log.status
        });
    } catch (error) {
        // Fallback to console if file write fails
        logger.error('Failed to write execution log to file', {
            actionId: log.actionId,
            error: error instanceof Error ? error.message : String(error)
        });
        
        // Still log to console as fallback
        console.error('[EXECUTION LOG FALLBACK]', JSON.stringify(log));
    }
}

/**
 * Adds log to in-memory cache
 * @param log - Execution log to cache
 */
function addToCache(log: ExecutionLog): void {
    recentExecutions.push(log);
    
    // Keep only last MAX_IN_MEMORY_LOGS entries
    if (recentExecutions.length > MAX_IN_MEMORY_LOGS) {
        recentExecutions = recentExecutions.slice(-MAX_IN_MEMORY_LOGS);
    }
}

/**
 * Core logging function - logs an execution with full context
 * @param log - Complete execution log
 */
export async function logExecution(log: ExecutionLog): Promise<void> {
    try {
        // Ensure timestamp is set
        if (!log.timestamp) {
            log.timestamp = new Date().toISOString();
        }

        // Add to in-memory cache
        addToCache(log);

        // Write to file asynchronously
        await appendToLogFile(log);

        // Emit to real-time feed
        const feedEvent: ExecutionFeedEvent = { log };
        executionFeed.emit('execution:logged', feedEvent);

        logger.debug('Execution logged', {
            actionId: log.actionId,
            correlationId: log.correlationId,
            status: log.status,
            executionTime: log.executionTime
        });
    } catch (error) {
        logger.error('Error in logExecution', {
            error: error instanceof Error ? error.message : String(error),
            actionId: log.actionId
        });
    }
}

/**
 * Logs the start of an action execution
 * @param actionId - Action identifier
 * @param correlationId - Correlation ID from reasoning
 * @param action - Action type
 * @param target - Target platform
 * @param params - Action parameters
 * @param retriedFrom - Original action ID if retry
 * @param attemptNumber - Attempt number
 */
export async function logExecutionStart(
    actionId: string,
    correlationId: string,
    action: string,
    target: string,
    params: Record<string, any>,
    retriedFrom?: string,
    attemptNumber?: number
): Promise<void> {
    const log: ExecutionLog = {
        actionId,
        correlationId,
        action,
        target,
        params,
        status: 'started',
        executionTime: 0,
        timestamp: new Date().toISOString(),
        retriedFrom,
        attemptNumber,
        platform: target
    };

    await logExecution(log);
}

/**
 * Logs a successful action execution
 * @param actionId - Action identifier
 * @param correlationId - Correlation ID from reasoning
 * @param action - Action type
 * @param target - Target platform
 * @param params - Action parameters
 * @param result - Execution result data
 * @param executionTime - Time taken in milliseconds
 * @param retriedFrom - Original action ID if retry
 * @param attemptNumber - Attempt number
 */
export async function logExecutionSuccess(
    actionId: string,
    correlationId: string,
    action: string,
    target: string,
    params: Record<string, any>,
    result: any,
    executionTime: number,
    retriedFrom?: string,
    attemptNumber?: number
): Promise<void> {
    const log: ExecutionLog = {
        actionId,
        correlationId,
        action,
        target,
        params,
        status: 'success',
        result,
        executionTime,
        timestamp: new Date().toISOString(),
        retriedFrom,
        attemptNumber,
        platform: target
    };

    await logExecution(log);
}

/**
 * Logs a failed action execution
 * @param actionId - Action identifier
 * @param correlationId - Correlation ID from reasoning
 * @param action - Action type
 * @param target - Target platform
 * @param params - Action parameters
 * @param error - Error message
 * @param executionTime - Time taken in milliseconds
 * @param retriedFrom - Original action ID if retry
 * @param attemptNumber - Attempt number
 */
export async function logExecutionFailure(
    actionId: string,
    correlationId: string,
    action: string,
    target: string,
    params: Record<string, any>,
    error: string,
    executionTime: number,
    retriedFrom?: string,
    attemptNumber?: number
): Promise<void> {
    const log: ExecutionLog = {
        actionId,
        correlationId,
        action,
        target,
        params,
        status: 'failed',
        error,
        executionTime,
        timestamp: new Date().toISOString(),
        retriedFrom,
        attemptNumber,
        platform: target
    };

    await logExecution(log);
}

/**
 * Reads all execution logs from file
 * @returns Array of execution logs
 */
async function readAllLogs(): Promise<ExecutionLog[]> {
    try {
        const fileContent = await fs.readFile(EXECUTION_LOG_FILE, 'utf-8');
        const lines = fileContent.trim().split('\n');
        
        const logs: ExecutionLog[] = [];
        for (const line of lines) {
            if (line.trim()) {
                try {
                    logs.push(JSON.parse(line));
                } catch (parseError) {
                    logger.warn('Skipping corrupted log line', { line });
                }
            }
        }
        
        return logs;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            // File doesn't exist yet
            return [];
        }
        
        logger.error('Failed to read execution logs', {
            error: error instanceof Error ? error.message : String(error)
        });
        return [];
    }
}

/**
 * Filters execution logs based on criteria
 * @param logs - Array of logs to filter
 * @param filters - Filter criteria
 * @returns Filtered logs
 */
function applyFilters(logs: ExecutionLog[], filters: ExecutionFilters): ExecutionLog[] {
    let filtered = logs;

    if (filters.actionId) {
        filtered = filtered.filter(log => log.actionId === filters.actionId);
    }

    if (filters.correlationId) {
        filtered = filtered.filter(log => log.correlationId === filters.correlationId);
    }

    if (filters.status) {
        filtered = filtered.filter(log => log.status === filters.status);
    }

    if (filters.target) {
        filtered = filtered.filter(log => log.target === filters.target);
    }

    if (filters.action) {
        filtered = filtered.filter(log => log.action === filters.action);
    }

    if (filters.startDate) {
        const startTime = new Date(filters.startDate).getTime();
        filtered = filtered.filter(log => new Date(log.timestamp).getTime() >= startTime);
    }

    if (filters.endDate) {
        const endTime = new Date(filters.endDate).getTime();
        filtered = filtered.filter(log => new Date(log.timestamp).getTime() <= endTime);
    }

    // Apply pagination
    const offset = filters.offset || 0;
    const limit = filters.limit || filtered.length;
    
    return filtered.slice(offset, offset + limit);
}

/**
 * Gets execution history with optional filters
 * @param filters - Optional filter criteria
 * @returns Array of execution logs matching filters
 */
export async function getExecutionHistory(filters: ExecutionFilters = {}): Promise<ExecutionLog[]> {
    try {
        const allLogs = await readAllLogs();
        const filtered = applyFilters(allLogs, filters);
        
        logger.debug('Execution history retrieved', {
            totalLogs: allLogs.length,
            filteredLogs: filtered.length,
            filters
        });
        
        return filtered;
    } catch (error) {
        logger.error('Failed to get execution history', {
            error: error instanceof Error ? error.message : String(error),
            filters
        });
        return [];
    }
}

/**
 * Gets a specific execution log by action ID
 * @param actionId - Action identifier
 * @returns Execution log or null if not found
 */
export async function getExecutionById(actionId: string): Promise<ExecutionLog | null> {
    try {
        // Check in-memory cache first (fast path)
        const cached = recentExecutions.find(log => log.actionId === actionId);
        if (cached) {
            logger.debug('Execution found in cache', { actionId });
            return cached;
        }

        // Search in file (slower path)
        const allLogs = await readAllLogs();
        const found = allLogs.find(log => log.actionId === actionId);
        
        if (found) {
            logger.debug('Execution found in file', { actionId });
            return found;
        }

        logger.debug('Execution not found', { actionId });
        return null;
    } catch (error) {
        logger.error('Failed to get execution by ID', {
            error: error instanceof Error ? error.message : String(error),
            actionId
        });
        return null;
    }
}

/**
 * Generates a daily summary report
 * @param date - Date in YYYY-MM-DD format (defaults to today)
 * @returns Daily summary
 */
export async function generateDailySummary(date?: string): Promise<DailySummary> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    try {
        // Get all executions for the target date
        const startDate = `${targetDate}T00:00:00.000Z`;
        const endDate = `${targetDate}T23:59:59.999Z`;
        
        const dayLogs = await getExecutionHistory({ startDate, endDate });
        
        // Initialize summary
        const summary: DailySummary = {
            date: targetDate,
            totalExecutions: dayLogs.length,
            byStatus: {
                started: 0,
                success: 0,
                failed: 0
            },
            byTarget: {},
            byAction: {},
            avgExecutionTime: 0,
            successRate: 0,
            generatedAt: new Date().toISOString()
        };

        if (dayLogs.length === 0) {
            return summary;
        }

        let totalExecutionTime = 0;
        let slowest: ExecutionLog | undefined;
        let fastest: ExecutionLog | undefined;

        // Process each log
        for (const log of dayLogs) {
            // Count by status
            summary.byStatus[log.status]++;

            // Track execution times
            totalExecutionTime += log.executionTime;
            
            if (!slowest || log.executionTime > slowest.executionTime) {
                slowest = log;
            }
            
            if (!fastest || log.executionTime < fastest.executionTime) {
                fastest = log;
            }

            // Group by target platform
            if (!summary.byTarget[log.target]) {
                summary.byTarget[log.target] = {
                    total: 0,
                    success: 0,
                    failed: 0,
                    avgExecutionTime: 0
                };
            }
            summary.byTarget[log.target].total++;
            if (log.status === 'success') summary.byTarget[log.target].success++;
            if (log.status === 'failed') summary.byTarget[log.target].failed++;

            // Group by action type
            if (!summary.byAction[log.action]) {
                summary.byAction[log.action] = {
                    total: 0,
                    success: 0,
                    failed: 0
                };
            }
            summary.byAction[log.action].total++;
            if (log.status === 'success') summary.byAction[log.action].success++;
            if (log.status === 'failed') summary.byAction[log.action].failed++;
        }

        // Calculate averages
        summary.avgExecutionTime = totalExecutionTime / dayLogs.length;
        
        // Calculate average execution time per target
        for (const target in summary.byTarget) {
            const targetLogs = dayLogs.filter(log => log.target === target);
            const targetTotal = targetLogs.reduce((sum, log) => sum + log.executionTime, 0);
            summary.byTarget[target].avgExecutionTime = targetTotal / targetLogs.length;
        }

        // Calculate success rate
        const successCount = summary.byStatus.success;
        const totalWithStatus = summary.byStatus.success + summary.byStatus.failed;
        summary.successRate = totalWithStatus > 0 ? (successCount / totalWithStatus) * 100 : 0;

        // Set slowest/fastest
        summary.slowestExecution = slowest;
        summary.fastestExecution = fastest;

        // Save summary to file
        const summaryFile = path.join(SUMMARY_DIR, `${targetDate}.json`);
        await fs.mkdir(SUMMARY_DIR, { recursive: true });
        await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2), 'utf-8');

        logger.info('Daily summary generated', {
            date: targetDate,
            totalExecutions: summary.totalExecutions,
            successRate: summary.successRate.toFixed(2) + '%',
            file: summaryFile
        });

        return summary;
    } catch (error) {
        logger.error('Failed to generate daily summary', {
            error: error instanceof Error ? error.message : String(error),
            date: targetDate
        });
        
        // Return empty summary on error
        return {
            date: targetDate,
            totalExecutions: 0,
            byStatus: { started: 0, success: 0, failed: 0 },
            byTarget: {},
            byAction: {},
            avgExecutionTime: 0,
            successRate: 0,
            generatedAt: new Date().toISOString()
        };
    }
}

/**
 * Cleans up old execution logs based on retention policy
 */
async function cleanupOldLogs(): Promise<void> {
    try {
        const allLogs = await readAllLogs();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - LOG_RETENTION_DAYS);
        
        const retainedLogs = allLogs.filter(log => 
            new Date(log.timestamp) >= cutoffDate
        );

        if (retainedLogs.length < allLogs.length) {
            // Rewrite file with only retained logs
            const content = retainedLogs.map(log => JSON.stringify(log)).join('\n') + '\n';
            await fs.writeFile(EXECUTION_LOG_FILE, content, 'utf-8');
            
            const removedCount = allLogs.length - retainedLogs.length;
            logger.info('Old execution logs cleaned up', {
                removed: removedCount,
                retained: retainedLogs.length,
                retentionDays: LOG_RETENTION_DAYS
            });
        }
    } catch (error) {
        logger.error('Failed to cleanup old logs', {
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Initializes the execution logger
 * Sets up directories and loads recent logs into cache
 */
export async function initializeExecutionLogger(): Promise<void> {
    logger.info('Initializing Execution Logger');

    try {
        // Ensure log directories exist
        await ensureLogDirectory();

        // Load recent logs into cache
        const allLogs = await readAllLogs();
        recentExecutions = allLogs.slice(-MAX_IN_MEMORY_LOGS);

        logger.info('Execution Logger initialized', {
            cachedLogs: recentExecutions.length,
            logFile: EXECUTION_LOG_FILE,
            summaryDir: SUMMARY_DIR
        });

        // Schedule daily cleanup (run once per day at midnight)
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const msUntilMidnight = tomorrow.getTime() - now.getTime();

        setTimeout(() => {
            cleanupOldLogs();
            // Then run daily
            setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);
        }, msUntilMidnight);

    } catch (error) {
        logger.error('Failed to initialize Execution Logger', {
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Gets recent executions from memory cache
 * @param count - Number of recent executions to return
 * @returns Recent execution logs
 */
export function getRecentExecutions(count: number = 10): ExecutionLog[] {
    return recentExecutions.slice(-count);
}
