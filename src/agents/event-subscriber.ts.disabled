/**
 * Event Subscriber for Member 1's Integrations
 * 
 * Subscribes to events from the EventHub and processes signals from:
 * - Gmail (new messages)
 * - Slack (new messages)
 * - Google Sheets (data changes)
 * 
 * Features:
 * - Rate limiting (max 10 signals/minute)
 * - Queue management with urgency prioritization
 * - Automatic reconnection on EventHub disconnection
 * - Standardized signal conversion
 * - Complete reasoning pipeline integration
 * - Comprehensive error handling and logging
 * 
 * @module agents/event-subscriber
 */

import eventHub, { type HubEvent, type EventPriority } from '../integrations/event-hub';
import { processSignal, type ReasoningResult } from './reasoning-pipeline';
import type { Signal } from './reasoning/context-builder';
import logger from '../utils/logger';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Gmail message data from EventHub
 */
export interface GmailMessageData {
    messageId: string;
    from: string;
    to: string[];
    subject: string;
    body: string;
    snippet?: string;
    timestamp: string;
    labels?: string[];
    threadId?: string;
    attachments?: Array<{
        filename: string;
        mimeType: string;
        size: number;
    }>;
}

/**
 * Slack message data from EventHub
 */
export interface SlackMessageData {
    messageId: string;
    channelId: string;
    channelName?: string;
    userId: string;
    username?: string;
    text: string;
    timestamp: string;
    threadTs?: string;
    attachments?: any[];
    reactions?: Array<{
        name: string;
        count: number;
    }>;
}

/**
 * Google Sheets data change from EventHub
 */
export interface SheetDataChange {
    spreadsheetId: string;
    spreadsheetName?: string;
    sheetName: string;
    range: string;
    changeType: 'insert' | 'update' | 'delete';
    oldValues?: any[][];
    newValues?: any[][];
    timestamp: string;
    user?: string;
}

/**
 * Queued signal with priority
 */
interface QueuedSignal {
    signal: Signal;
    priority: EventPriority;
    timestamp: string;
    retryCount: number;
}

/**
 * Rate limiter state
 */
interface RateLimiterState {
    processedCount: number;
    windowStart: number;
    maxPerMinute: number;
}

/**
 * Event subscriber configuration
 */
export interface EventSubscriberConfig {
    /** Maximum signals to process per minute */
    maxSignalsPerMinute?: number;
    
    /** Maximum queue size before dropping low-priority signals */
    maxQueueSize?: number;
    
    /** Reconnection attempt interval (ms) */
    reconnectInterval?: number;
    
    /** Maximum reconnection attempts before giving up */
    maxReconnectAttempts?: number;
    
    /** Enable detailed logging */
    verboseLogging?: boolean;
}

/**
 * Subscriber statistics
 */
export interface SubscriberStats {
    signalsProcessed: number;
    signalsQueued: number;
    signalsDropped: number;
    gmailSignals: number;
    slackSignals: number;
    sheetSignals: number;
    errors: number;
    avgProcessingTime: number;
    rateLimitHits: number;
    reconnections: number;
    uptime: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<EventSubscriberConfig> = {
    maxSignalsPerMinute: 10,
    maxQueueSize: 100,
    reconnectInterval: 5000,
    maxReconnectAttempts: 10,
    verboseLogging: false,
};

// ============================================================================
// Event Subscriber Class
// ============================================================================

class EventSubscriber {
    private config: Required<EventSubscriberConfig>;
    private signalQueue: QueuedSignal[] = [];
    private isListening: boolean = false;
    private isProcessing: boolean = false;
    private rateLimiter: RateLimiterState;
    private unsubscribeFunctions: Array<() => void> = [];
    private reconnectAttempts: number = 0;
    private reconnectTimer?: NodeJS.Timeout;
    private startTime: number = 0;
    
    // Statistics
    private stats: SubscriberStats = {
        signalsProcessed: 0,
        signalsQueued: 0,
        signalsDropped: 0,
        gmailSignals: 0,
        slackSignals: 0,
        sheetSignals: 0,
        errors: 0,
        avgProcessingTime: 0,
        rateLimitHits: 0,
        reconnections: 0,
        uptime: 0,
    };
    
    private processingTimes: number[] = [];
    
    constructor(config: EventSubscriberConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.rateLimiter = {
            processedCount: 0,
            windowStart: Date.now(),
            maxPerMinute: this.config.maxSignalsPerMinute,
        };
    }
    
    // ========================================================================
    // Public API
    // ========================================================================
    
    /**
     * Start listening to EventHub events
     */
    public startListening(): void {
        if (this.isListening) {
            logger.warn('Event subscriber already listening');
            return;
        }
        
        this.isListening = true;
        this.startTime = Date.now();
        this.reconnectAttempts = 0;
        
        this.subscribeToEvents();
        this.startQueueProcessor();
        
        logger.info('Event subscriber started', {
            maxSignalsPerMinute: this.config.maxSignalsPerMinute,
            maxQueueSize: this.config.maxQueueSize,
        });
    }
    
    /**
     * Stop listening to EventHub events
     */
    public stopListening(): void {
        if (!this.isListening) {
            logger.warn('Event subscriber not listening');
            return;
        }
        
        this.isListening = false;
        this.isProcessing = false;
        
        // Unsubscribe from all events
        this.unsubscribeFunctions.forEach(unsub => unsub());
        this.unsubscribeFunctions = [];
        
        // Clear reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        
        logger.info('Event subscriber stopped', {
            signalsProcessed: this.stats.signalsProcessed,
            signalsQueued: this.stats.signalsQueued,
            uptime: Date.now() - this.startTime,
        });
    }
    
    /**
     * Get current subscriber statistics
     */
    public getStats(): SubscriberStats {
        return {
            ...this.stats,
            uptime: this.isListening ? Date.now() - this.startTime : 0,
        };
    }
    
    /**
     * Get current queue size
     */
    public getQueueSize(): number {
        return this.signalQueue.length;
    }
    
    /**
     * Clear the signal queue
     */
    public clearQueue(): void {
        const queueSize = this.signalQueue.length;
        this.signalQueue = [];
        logger.info('Signal queue cleared', { droppedSignals: queueSize });
    }
    
    // ========================================================================
    // Event Subscription
    // ========================================================================
    
    /**
     * Subscribe to all EventHub events
     */
    private subscribeToEvents(): void {
        // Subscribe to Gmail new message events
        const unsubGmail = eventHub.subscribe('gmail:new_message', (event: HubEvent) => {
            this.handleGmailSignal(event.data as GmailMessageData, event.priority);
        });
        this.unsubscribeFunctions.push(unsubGmail);
        
        // Subscribe to Slack new message events
        const unsubSlack = eventHub.subscribe('slack:new_message', (event: HubEvent) => {
            this.handleSlackSignal(event.data as SlackMessageData, event.priority);
        });
        this.unsubscribeFunctions.push(unsubSlack);
        
        // Subscribe to Sheets data changed events
        const unsubSheets = eventHub.subscribe('sheets:data_changed', (event: HubEvent) => {
            this.handleSheetSignal(event.data as SheetDataChange, event.priority);
        });
        this.unsubscribeFunctions.push(unsubSheets);
        
        // Subscribe to error events for reconnection logic
        eventHub.on('error', this.handleEventHubError.bind(this));
        
        if (this.config.verboseLogging) {
            logger.info('Subscribed to EventHub events', {
                events: ['gmail:new_message', 'slack:new_message', 'sheets:data_changed'],
            });
        }
    }
    
    // ========================================================================
    // Signal Handlers
    // ========================================================================
    
    /**
     * Handle Gmail message signal
     */
    private handleGmailSignal(emailData: GmailMessageData, priority: EventPriority = 'normal'): void {
        try {
            this.stats.gmailSignals++;
            
            // Convert to standardized Signal format
            const signal: Signal = {
                id: `gmail-${emailData.messageId}`,
                source: 'email',
                subject: emailData.subject,
                body: emailData.body || emailData.snippet || '',
                sender: emailData.from,
                timestamp: emailData.timestamp,
            };
            
            // Queue for processing
            this.queueSignal(signal, priority);
            
            if (this.config.verboseLogging) {
                logger.debug('Gmail signal queued', {
                    signalId: signal.id,
                    sender: signal.sender,
                    subject: signal.subject,
                    priority,
                });
            }
        } catch (error) {
            this.stats.errors++;
            logger.error('Failed to handle Gmail signal', {
                error: error instanceof Error ? error.message : String(error),
                messageId: emailData.messageId,
            });
        }
    }
    
    /**
     * Handle Slack message signal
     */
    private handleSlackSignal(messageData: SlackMessageData, priority: EventPriority = 'normal'): void {
        try {
            this.stats.slackSignals++;
            
            // Convert to standardized Signal format
            const signal: Signal = {
                id: `slack-${messageData.messageId}`,
                source: 'slack',
                subject: `Message in #${messageData.channelName || messageData.channelId}`,
                body: messageData.text,
                sender: messageData.username || messageData.userId,
                timestamp: messageData.timestamp,
            };
            
            // Queue for processing
            this.queueSignal(signal, priority);
            
            if (this.config.verboseLogging) {
                logger.debug('Slack signal queued', {
                    signalId: signal.id,
                    channel: messageData.channelName,
                    user: messageData.username,
                    priority,
                });
            }
        } catch (error) {
            this.stats.errors++;
            logger.error('Failed to handle Slack signal', {
                error: error instanceof Error ? error.message : String(error),
                messageId: messageData.messageId,
            });
        }
    }
    
    /**
     * Handle Google Sheets data change signal
     */
    private handleSheetSignal(sheetData: SheetDataChange, priority: EventPriority = 'normal'): void {
        try {
            this.stats.sheetSignals++;
            
            // Convert to standardized Signal format
            const signal: Signal = {
                id: `sheet-${sheetData.spreadsheetId}-${Date.now()}`,
                source: 'sheets',
                subject: `${sheetData.changeType} in ${sheetData.spreadsheetName || sheetData.spreadsheetId}`,
                body: this.formatSheetChangeDescription(sheetData),
                sender: sheetData.user || 'system',
                timestamp: sheetData.timestamp,
            };
            
            // Queue for processing
            this.queueSignal(signal, priority);
            
            if (this.config.verboseLogging) {
                logger.debug('Sheet signal queued', {
                    signalId: signal.id,
                    spreadsheet: sheetData.spreadsheetName,
                    sheet: sheetData.sheetName,
                    changeType: sheetData.changeType,
                    priority,
                });
            }
        } catch (error) {
            this.stats.errors++;
            logger.error('Failed to handle Sheet signal', {
                error: error instanceof Error ? error.message : String(error),
                spreadsheetId: sheetData.spreadsheetId,
            });
        }
    }
    
    /**
     * Format sheet change into human-readable description
     */
    private formatSheetChangeDescription(sheetData: SheetDataChange): string {
        const parts: string[] = [];
        
        parts.push(`Sheet: ${sheetData.sheetName}`);
        parts.push(`Range: ${sheetData.range}`);
        parts.push(`Change: ${sheetData.changeType}`);
        
        if (sheetData.newValues && sheetData.newValues.length > 0) {
            const rowCount = sheetData.newValues.length;
            const colCount = sheetData.newValues[0]?.length || 0;
            parts.push(`Affected: ${rowCount} rows, ${colCount} columns`);
        }
        
        if (sheetData.user) {
            parts.push(`By: ${sheetData.user}`);
        }
        
        return parts.join(' | ');
    }
    
    // ========================================================================
    // Queue Management
    // ========================================================================
    
    /**
     * Queue a signal for processing with priority
     */
    private queueSignal(signal: Signal, priority: EventPriority): void {
        // Check queue size limit
        if (this.signalQueue.length >= this.config.maxQueueSize) {
            // Drop lowest priority signal
            const lowestPriority = this.findLowestPrioritySignal();
            if (lowestPriority !== -1) {
                this.signalQueue.splice(lowestPriority, 1);
                this.stats.signalsDropped++;
                logger.warn('Dropped signal due to queue overflow', {
                    queueSize: this.signalQueue.length,
                    droppedPriority: this.signalQueue[lowestPriority]?.priority,
                });
            } else {
                // Queue full with all high priority, drop this one
                this.stats.signalsDropped++;
                logger.warn('Dropped signal - queue full with high priority signals', {
                    signalId: signal.id,
                    priority,
                });
                return;
            }
        }
        
        // Add to queue
        this.signalQueue.push({
            signal,
            priority,
            timestamp: new Date().toISOString(),
            retryCount: 0,
        });
        
        this.stats.signalsQueued++;
        
        // Sort queue by priority (high first)
        this.sortQueueByPriority();
    }
    
    /**
     * Sort queue by priority
     */
    private sortQueueByPriority(): void {
        this.signalQueue.sort((a, b) => {
            const priorityOrder: Record<EventPriority, number> = {
                high: 3,
                normal: 2,
                low: 1,
            };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }
    
    /**
     * Find index of lowest priority signal in queue
     */
    private findLowestPrioritySignal(): number {
        let lowestIndex = -1;
        let lowestValue = 4; // Higher than any priority
        
        const priorityOrder: Record<EventPriority, number> = {
            high: 3,
            normal: 2,
            low: 1,
        };
        
        this.signalQueue.forEach((item, index) => {
            const value = priorityOrder[item.priority];
            if (value < lowestValue) {
                lowestValue = value;
                lowestIndex = index;
            }
        });
        
        return lowestIndex;
    }
    
    // ========================================================================
    // Queue Processing
    // ========================================================================
    
    /**
     * Start the queue processor loop
     */
    private startQueueProcessor(): void {
        if (this.isProcessing) {
            return;
        }
        
        this.isProcessing = true;
        this.processQueueLoop();
    }
    
    /**
     * Main queue processing loop
     */
    private async processQueueLoop(): Promise<void> {
        while (this.isListening && this.isProcessing) {
            try {
                // Check rate limit
                if (!this.checkRateLimit()) {
                    // Wait until rate limit window resets
                    await this.waitForRateLimitReset();
                    continue;
                }
                
                // Get next signal from queue
                const queuedSignal = this.signalQueue.shift();
                if (!queuedSignal) {
                    // Queue empty, wait a bit
                    await this.sleep(100);
                    continue;
                }
                
                // Process signal
                await this.processSignal(queuedSignal);
                
                // Small delay between processing
                await this.sleep(50);
            } catch (error) {
                logger.error('Error in queue processing loop', {
                    error: error instanceof Error ? error.message : String(error),
                });
                await this.sleep(1000); // Wait longer on error
            }
        }
        
        this.isProcessing = false;
    }
    
    /**
     * Process a single queued signal
     */
    private async processSignal(queuedSignal: QueuedSignal): Promise<void> {
        const startTime = Date.now();
        
        try {
            // Run through reasoning pipeline
            const result: ReasoningResult = await processSignal(queuedSignal.signal);
            
            // Emit "reasoning:complete" event
            await eventHub.emitEvent({
                source: 'reasoning-pipeline',
                type: 'reasoning:complete',
                data: {
                    signalId: queuedSignal.signal.id,
                    signalSource: queuedSignal.signal.source,
                    result,
                },
                priority: queuedSignal.priority,
            });
            
            // Update statistics
            this.stats.signalsProcessed++;
            this.rateLimiter.processedCount++;
            
            const processingTime = Date.now() - startTime;
            this.processingTimes.push(processingTime);
            
            // Keep only last 100 processing times for average calculation
            if (this.processingTimes.length > 100) {
                this.processingTimes.shift();
            }
            
            this.stats.avgProcessingTime =
                this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length;
            
            if (this.config.verboseLogging) {
                logger.info('Signal processed successfully', {
                    signalId: queuedSignal.signal.id,
                    source: queuedSignal.signal.source,
                    processingTime: `${processingTime}ms`,
                    action: result.decision?.action,
                    confidence: result.decision?.confidence,
                });
            }
        } catch (error) {
            this.stats.errors++;
            
            logger.error('Failed to process signal', {
                signalId: queuedSignal.signal.id,
                source: queuedSignal.signal.source,
                error: error instanceof Error ? error.message : String(error),
                retryCount: queuedSignal.retryCount,
            });
            
            // Retry logic (up to 3 attempts)
            if (queuedSignal.retryCount < 3) {
                queuedSignal.retryCount++;
                this.signalQueue.push(queuedSignal);
                logger.info('Signal requeued for retry', {
                    signalId: queuedSignal.signal.id,
                    retryCount: queuedSignal.retryCount,
                });
            } else {
                logger.error('Signal processing failed after max retries', {
                    signalId: queuedSignal.signal.id,
                    maxRetries: 3,
                });
            }
        }
    }
    
    // ========================================================================
    // Rate Limiting
    // ========================================================================
    
    /**
     * Check if we can process more signals (rate limit check)
     */
    private checkRateLimit(): boolean {
        const now = Date.now();
        const windowElapsed = now - this.rateLimiter.windowStart;
        
        // Reset window if 1 minute has passed
        if (windowElapsed >= 60000) {
            this.rateLimiter.processedCount = 0;
            this.rateLimiter.windowStart = now;
            return true;
        }
        
        // Check if under limit
        if (this.rateLimiter.processedCount < this.rateLimiter.maxPerMinute) {
            return true;
        }
        
        // Rate limit hit
        this.stats.rateLimitHits++;
        return false;
    }
    
    /**
     * Wait until rate limit window resets
     */
    private async waitForRateLimitReset(): Promise<void> {
        const now = Date.now();
        const windowElapsed = now - this.rateLimiter.windowStart;
        const waitTime = Math.max(0, 60000 - windowElapsed);
        
        if (this.config.verboseLogging) {
            logger.debug('Rate limit hit, waiting', {
                waitTime: `${Math.ceil(waitTime / 1000)}s`,
                processedInWindow: this.rateLimiter.processedCount,
            });
        }
        
        await this.sleep(waitTime);
    }
    
    // ========================================================================
    // Reconnection Logic
    // ========================================================================
    
    /**
     * Handle EventHub error for reconnection
     */
    private handleEventHubError(error: Error): void {
        logger.error('EventHub error detected', {
            error: error.message,
            reconnectAttempts: this.reconnectAttempts,
        });
        
        if (!this.isListening) {
            return;
        }
        
        // Attempt reconnection
        if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this.attemptReconnection();
        } else {
            logger.error('Max reconnection attempts reached, stopping subscriber', {
                maxAttempts: this.config.maxReconnectAttempts,
            });
            this.stopListening();
        }
    }
    
    /**
     * Attempt to reconnect to EventHub
     */
    private attemptReconnection(): void {
        this.reconnectAttempts++;
        this.stats.reconnections++;
        
        logger.info('Attempting to reconnect to EventHub', {
            attempt: this.reconnectAttempts,
            maxAttempts: this.config.maxReconnectAttempts,
        });
        
        // Clear existing subscriptions
        this.unsubscribeFunctions.forEach(unsub => unsub());
        this.unsubscribeFunctions = [];
        
        // Wait and resubscribe
        this.reconnectTimer = setTimeout(() => {
            try {
                this.subscribeToEvents();
                this.reconnectAttempts = 0; // Reset on successful reconnection
                logger.info('Successfully reconnected to EventHub');
            } catch (error) {
                logger.error('Reconnection failed', {
                    error: error instanceof Error ? error.message : String(error),
                });
                this.handleEventHubError(error as Error);
            }
        }, this.config.reconnectInterval);
    }
    
    // ========================================================================
    // Utility Methods
    // ========================================================================
    
    /**
     * Sleep for specified milliseconds
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let subscriberInstance: EventSubscriber | null = null;

/**
 * Get or create the event subscriber singleton
 */
export function getEventSubscriber(config?: EventSubscriberConfig): EventSubscriber {
    if (!subscriberInstance) {
        subscriberInstance = new EventSubscriber(config);
    }
    return subscriberInstance;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Start listening to EventHub events
 */
export function startListening(config?: EventSubscriberConfig): void {
    const subscriber = getEventSubscriber(config);
    subscriber.startListening();
}

/**
 * Stop listening to EventHub events
 */
export function stopListening(): void {
    if (subscriberInstance) {
        subscriberInstance.stopListening();
    }
}

/**
 * Get subscriber statistics
 */
export function getSubscriberStats(): SubscriberStats | null {
    return subscriberInstance?.getStats() || null;
}

/**
 * Get current queue size
 */
export function getQueueSize(): number {
    return subscriberInstance?.getQueueSize() || 0;
}

/**
 * Clear the signal queue
 */
export function clearQueue(): void {
    subscriberInstance?.clearQueue();
}

// ============================================================================
// Export Default
// ============================================================================

export default {
    getEventSubscriber,
    startListening,
    stopListening,
    getSubscriberStats,
    getQueueSize,
    clearQueue,
};
