/**
 * Queue Manager (Member 3: Orchestration Layer)
 * Manages priority queue for actions with retry logic and rate limiting
 * Handles concurrent execution, crash recovery, and queue statistics
 */

import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import logger from '../utils/logger';
import { routeAction } from './action-router';
import {
    logExecutionStart,
    logExecutionSuccess,
    logExecutionFailure
} from './execution-logger';
import {
    ReasoningResult,
    QueuedAction,
    QueueStats,
    RateLimitConfig,
    QueuePersistenceData,
    ActionStatus
} from '../types';

// Configuration constants
const QUEUE_FILE_PATH = path.join(process.cwd(), 'queue', 'actions.json');
const PROCESSING_INTERVAL_MS = 2000; // Process queue every 2 seconds
const MAX_CONCURRENT_ACTIONS = 5; // Process max 5 actions concurrently
const MAX_RETRY_ATTEMPTS = 3; // Retry failed actions up to 3 times
const BACKOFF_BASE_MS = 1000; // Base delay for exponential backoff (1s, 2s, 4s)

// Rate limit configurations per platform (in milliseconds)
const RATE_LIMITS: { [platform: string]: number } = {
    notion: 330, // ~3 requests per second
    trello: 100, // 10 requests per second
    slack: 1000, // 1 request per second
    drive: 100, // 10 requests per second
    sheets: 100  // 10 requests per second
};

// Queue state
let actionQueue: QueuedAction[] = [];
let isPaused = false;
let processingInterval: NodeJS.Timeout | null = null;
let rateLimitTrackers: Map<string, RateLimitConfig> = new Map();

// Statistics tracking
let completedActions: QueuedAction[] = [];
let failedActions: QueuedAction[] = [];

/**
 * Initializes rate limit trackers for all platforms
 */
function initializeRateLimitTrackers(): void {
    Object.keys(RATE_LIMITS).forEach(platform => {
        rateLimitTrackers.set(platform, {
            platform,
            minDelayMs: RATE_LIMITS[platform],
            lastExecutionTime: 0
        });
    });
}

/**
 * Checks if an action can be executed based on rate limits
 * @param platform - Target platform
 * @returns True if action can execute, false if rate limited
 */
function canExecuteNow(platform: string): boolean {
    const tracker = rateLimitTrackers.get(platform);
    if (!tracker) {
        logger.warn('No rate limit tracker for platform', { platform });
        return true; // Allow execution if no tracker
    }

    const now = Date.now();
    const timeSinceLastExecution = now - tracker.lastExecutionTime;
    
    if (timeSinceLastExecution < tracker.minDelayMs) {
        logger.debug('Rate limit hit', {
            platform,
            timeSinceLastExecution,
            minDelay: tracker.minDelayMs,
            waitTime: tracker.minDelayMs - timeSinceLastExecution
        });
        return false;
    }

    return true;
}

/**
 * Updates rate limit tracker after execution
 * @param platform - Target platform
 */
function updateRateLimitTracker(platform: string): void {
    const tracker = rateLimitTrackers.get(platform);
    if (tracker) {
        tracker.lastExecutionTime = Date.now();
    }
}

/**
 * Sorts queue by priority (1=highest, 5=lowest) and creation time
 */
function sortQueue(): void {
    actionQueue.sort((a, b) => {
        // First sort by priority (lower number = higher priority)
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }
        // If same priority, sort by creation time (older first)
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
}

/**
 * Persists queue to disk for crash recovery
 */
async function saveQueue(): Promise<void> {
    try {
        // Ensure queue directory exists
        const queueDir = path.dirname(QUEUE_FILE_PATH);
        await fs.mkdir(queueDir, { recursive: true });

        const data: QueuePersistenceData = {
            actions: actionQueue,
            lastSaved: new Date().toISOString(),
            version: '1.0.0'
        };

        await fs.writeFile(QUEUE_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
        logger.debug('Queue persisted to disk', {
            actionCount: actionQueue.length,
            path: QUEUE_FILE_PATH
        });
    } catch (error) {
        logger.error('Failed to persist queue to disk', {
            error: error instanceof Error ? error.message : String(error),
            path: QUEUE_FILE_PATH
        });
    }
}

/**
 * Loads queue from disk for crash recovery
 */
async function loadQueue(): Promise<void> {
    try {
        const fileContent = await fs.readFile(QUEUE_FILE_PATH, 'utf-8');
        const data: QueuePersistenceData = JSON.parse(fileContent);
        
        // Restore actions that were pending or executing (crashed mid-execution)
        actionQueue = data.actions.filter(action => 
            action.status === 'pending' || action.status === 'executing'
        );
        
        // Reset executing actions to pending (they were interrupted)
        actionQueue.forEach(action => {
            if (action.status === 'executing') {
                action.status = 'pending';
                logger.info('Recovered interrupted action', {
                    actionId: action.id,
                    correlationId: action.reasoningResult.correlationId
                });
            }
        });

        sortQueue();
        
        logger.info('Queue loaded from disk', {
            recoveredActions: actionQueue.length,
            path: QUEUE_FILE_PATH,
            lastSaved: data.lastSaved
        });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            logger.info('No existing queue file found, starting fresh');
        } else {
            logger.error('Failed to load queue from disk', {
                error: error instanceof Error ? error.message : String(error),
                path: QUEUE_FILE_PATH
            });
        }
    }
}

/**
 * Enqueues an action with specified priority
 * @param reasoningResult - The action to enqueue
 * @param priority - Priority level (1=highest, 5=lowest)
 * @returns The queued action ID
 */
export async function enqueue(reasoningResult: ReasoningResult, priority: number = 3): Promise<string> {
    // Validate priority
    if (priority < 1 || priority > 5) {
        logger.warn('Invalid priority, defaulting to 3', { priority });
        priority = 3;
    }

    const action: QueuedAction = {
        id: randomUUID(),
        reasoningResult,
        priority,
        status: 'pending',
        attempts: 0,
        createdAt: new Date().toISOString()
    };

    actionQueue.push(action);
    sortQueue();

    logger.info('Action enqueued', {
        actionId: action.id,
        correlationId: reasoningResult.correlationId,
        priority,
        action: reasoningResult.action,
        target: reasoningResult.target,
        queueSize: actionQueue.length
    });

    // Persist to disk
    await saveQueue();

    return action.id;
}

/**
 * Dequeues the next highest priority pending action
 * @returns The next action to execute, or null if none available
 */
export function dequeue(): QueuedAction | null {
    // Find first pending action that can be executed (respecting rate limits)
    for (let i = 0; i < actionQueue.length; i++) {
        const action = actionQueue[i];
        
        if (action.status !== 'pending') {
            continue;
        }

        const platform = action.reasoningResult.target;
        if (!canExecuteNow(platform)) {
            continue; // Skip this action due to rate limit
        }

        // Update status and move to executing
        action.status = 'executing';
        action.lastAttemptAt = new Date().toISOString();
        
        logger.info('Action dequeued', {
            actionId: action.id,
            correlationId: action.reasoningResult.correlationId,
            priority: action.priority,
            attempts: action.attempts,
            platform
        });

        // Update rate limit tracker
        updateRateLimitTracker(platform);

        return action;
    }

    return null; // No action available
}

/**
 * Calculates exponential backoff delay
 * @param attempts - Number of attempts made
 * @returns Delay in milliseconds
 */
function calculateBackoffDelay(attempts: number): number {
    // 1st retry: 1s, 2nd retry: 2s, 3rd retry: 4s
    return BACKOFF_BASE_MS * Math.pow(2, attempts - 1);
}

/**
 * Handles retry logic for failed actions
 * @param action - The failed action
 * @param error - Error message
 */
async function handleRetry(action: QueuedAction, error: string): Promise<void> {
    action.attempts += 1;

    if (action.attempts < MAX_RETRY_ATTEMPTS) {
        // Re-enqueue for retry with exponential backoff
        const backoffDelay = calculateBackoffDelay(action.attempts);
        
        logger.info('Scheduling action retry', {
            actionId: action.id,
            correlationId: action.reasoningResult.correlationId,
            attempt: action.attempts,
            maxAttempts: MAX_RETRY_ATTEMPTS,
            backoffDelay,
            error
        });

        // Wait for backoff delay, then re-enqueue
        setTimeout(async () => {
            action.status = 'pending';
            action.error = undefined;
            sortQueue();
            await saveQueue();
            
            logger.debug('Action re-enqueued after backoff', {
                actionId: action.id,
                attempt: action.attempts
            });
        }, backoffDelay);
    } else {
        // Max retries exceeded, mark as failed
        action.status = 'failed';
        action.error = error;
        action.executedAt = new Date().toISOString();
        
        // Remove from queue and add to failed list
        const index = actionQueue.findIndex(a => a.id === action.id);
        if (index !== -1) {
            actionQueue.splice(index, 1);
        }
        failedActions.push(action);

        logger.error('Action failed after max retries', {
            actionId: action.id,
            correlationId: action.reasoningResult.correlationId,
            attempts: action.attempts,
            error
        });

        await saveQueue();
    }
}

/**
 * Processes a single action
 * @param action - The action to process
 */
async function processAction(action: QueuedAction): Promise<void> {
    const attemptNumber = action.attempts + 1;
    const retriedFrom = action.attempts > 0 ? action.id : undefined;
    
    try {
        logger.info('Processing action', {
            actionId: action.id,
            correlationId: action.reasoningResult.correlationId,
            action: action.reasoningResult.action,
            target: action.reasoningResult.target,
            attempt: attemptNumber
        });

        // Log execution start
        await logExecutionStart(
            action.id,
            action.reasoningResult.correlationId,
            action.reasoningResult.action,
            action.reasoningResult.target,
            action.reasoningResult.params,
            retriedFrom,
            attemptNumber
        );

        const result = await routeAction(action.reasoningResult);

        if (result.success) {
            // Action succeeded
            action.status = 'completed';
            action.executedAt = new Date().toISOString();
            
            // Remove from queue and add to completed list
            const index = actionQueue.findIndex(a => a.id === action.id);
            if (index !== -1) {
                actionQueue.splice(index, 1);
            }
            completedActions.push(action);

            logger.info('Action completed successfully', {
                actionId: action.id,
                correlationId: action.reasoningResult.correlationId,
                executionTime: result.executionTime,
                data: result.data
            });

            // Log execution success
            await logExecutionSuccess(
                action.id,
                action.reasoningResult.correlationId,
                action.reasoningResult.action,
                action.reasoningResult.target,
                action.reasoningResult.params,
                result.data,
                result.executionTime || 0,
                retriedFrom,
                attemptNumber
            );

            await saveQueue();
        } else {
            // Log execution failure
            await logExecutionFailure(
                action.id,
                action.reasoningResult.correlationId,
                action.reasoningResult.action,
                action.reasoningResult.target,
                action.reasoningResult.params,
                result.error || 'Unknown error',
                result.executionTime || 0,
                retriedFrom,
                attemptNumber
            );
            
            // Action failed, handle retry
            await handleRetry(action, result.error || 'Unknown error');
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Unexpected error processing action', {
            actionId: action.id,
            correlationId: action.reasoningResult.correlationId,
            error: errorMessage
        });

        // Log execution failure
        await logExecutionFailure(
            action.id,
            action.reasoningResult.correlationId,
            action.reasoningResult.action,
            action.reasoningResult.target,
            action.reasoningResult.params,
            errorMessage,
            0,
            retriedFrom,
            attemptNumber
        );

        await handleRetry(action, errorMessage);
    }
}

/**
 * Processes the queue (main processing loop)
 * Dequeues and executes up to MAX_CONCURRENT_ACTIONS actions
 */
export async function processQueue(): Promise<void> {
    if (isPaused) {
        logger.debug('Queue processing paused');
        return;
    }

    const executingCount = actionQueue.filter(a => a.status === 'executing').length;
    const availableSlots = MAX_CONCURRENT_ACTIONS - executingCount;

    if (availableSlots <= 0) {
        logger.debug('Max concurrent actions reached', {
            executing: executingCount,
            max: MAX_CONCURRENT_ACTIONS
        });
        return;
    }

    logger.debug('Processing queue', {
        pendingActions: actionQueue.filter(a => a.status === 'pending').length,
        executingActions: executingCount,
        availableSlots
    });

    // Dequeue and process actions up to available slots
    const promises: Promise<void>[] = [];
    for (let i = 0; i < availableSlots; i++) {
        const action = dequeue();
        if (!action) {
            break; // No more actions available
        }

        promises.push(processAction(action));
    }

    if (promises.length > 0) {
        await Promise.all(promises);
    }
}

/**
 * Starts automatic queue processing
 */
function startProcessing(): void {
    if (processingInterval) {
        logger.warn('Queue processing already started');
        return;
    }

    processingInterval = setInterval(() => {
        processQueue().catch(error => {
            logger.error('Error in queue processing loop', {
                error: error instanceof Error ? error.message : String(error)
            });
        });
    }, PROCESSING_INTERVAL_MS);

    logger.info('Queue processing started', {
        interval: PROCESSING_INTERVAL_MS,
        maxConcurrent: MAX_CONCURRENT_ACTIONS
    });
}

/**
 * Stops automatic queue processing
 */
function stopProcessing(): void {
    if (processingInterval) {
        clearInterval(processingInterval);
        processingInterval = null;
        logger.info('Queue processing stopped');
    }
}

/**
 * Pauses queue processing
 * Waits for currently executing actions to finish
 */
export function pause(): void {
    if (isPaused) {
        logger.warn('Queue already paused');
        return;
    }

    isPaused = true;
    logger.info('Queue paused', {
        pendingActions: actionQueue.filter(a => a.status === 'pending').length,
        executingActions: actionQueue.filter(a => a.status === 'executing').length
    });
}

/**
 * Resumes queue processing
 */
export function resume(): void {
    if (!isPaused) {
        logger.warn('Queue not paused');
        return;
    }

    isPaused = false;
    logger.info('Queue resumed');
}

/**
 * Clears all pending actions from the queue
 * Does not affect currently executing actions
 */
export async function clear(): Promise<void> {
    const pendingCount = actionQueue.filter(a => a.status === 'pending').length;
    
    actionQueue = actionQueue.filter(a => a.status === 'executing');
    
    logger.info('Queue cleared', {
        removedActions: pendingCount,
        remainingExecuting: actionQueue.length
    });

    await saveQueue();
}

/**
 * Gets queue statistics
 * @returns Queue statistics
 */
export function getQueueStats(): QueueStats {
    const pending = actionQueue.filter(a => a.status === 'pending').length;
    const executing = actionQueue.filter(a => a.status === 'executing').length;
    const completed = completedActions.length;
    const failed = failedActions.length;

    // Calculate average wait time (time from creation to execution)
    let totalWaitTime = 0;
    let countWithWaitTime = 0;

    [...completedActions, ...failedActions].forEach(action => {
        if (action.executedAt) {
            const waitTime = new Date(action.executedAt).getTime() - new Date(action.createdAt).getTime();
            totalWaitTime += waitTime;
            countWithWaitTime++;
        }
    });

    const avgWaitTime = countWithWaitTime > 0 ? totalWaitTime / countWithWaitTime : 0;

    // Find oldest pending action
    const pendingActions = actionQueue.filter(a => a.status === 'pending');
    let oldestPendingAge: number | undefined;
    if (pendingActions.length > 0) {
        const oldestAction = pendingActions.reduce((oldest, current) => 
            new Date(current.createdAt) < new Date(oldest.createdAt) ? current : oldest
        );
        oldestPendingAge = Date.now() - new Date(oldestAction.createdAt).getTime();
    }

    return {
        pending,
        executing,
        completed,
        failed,
        total: pending + executing + completed + failed,
        avgWaitTime,
        oldestPendingAge
    };
}

/**
 * Initializes the queue manager
 * Loads persisted queue and starts processing
 */
export async function initializeQueueManager(): Promise<void> {
    logger.info('Initializing Queue Manager');

    // Initialize rate limit trackers
    initializeRateLimitTrackers();

    // Load persisted queue from disk
    await loadQueue();

    // Start automatic processing
    startProcessing();

    logger.info('Queue Manager initialized successfully', getQueueStats());
}

/**
 * Shuts down the queue manager gracefully
 */
export async function shutdownQueueManager(): Promise<void> {
    logger.info('Shutting down Queue Manager');
    
    stopProcessing();
    await saveQueue();
    
    logger.info('Queue Manager shut down successfully');
}
