/**
 * Circuit Breaker for Actions
 * 
 * Implements circuit breaker pattern to prevent cascading failures:
 * - Per-executor circuit breakers (Notion, Trello, Slack, etc.)
 * - Three states: CLOSED, OPEN, HALF_OPEN
 * - Automatic state transitions based on failures/successes
 * - Event emission for monitoring
 * - Statistics tracking
 */

import { EventEmitter } from 'events';
import logger from '../utils/logger';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'CLOSED',       // Normal operation
  OPEN = 'OPEN',           // Failing, reject immediately
  HALF_OPEN = 'HALF_OPEN'  // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /**
   * Name of the executor (e.g., 'notion', 'trello', 'slack')
   */
  executorName: string;

  /**
   * Failure threshold (consecutive failures to open circuit)
   */
  failureThreshold: number;

  /**
   * Time window for counting failures (ms)
   */
  failureWindow: number;

  /**
   * Timeout before moving from OPEN to HALF_OPEN (ms)
   */
  resetTimeout: number;

  /**
   * Success threshold to close circuit from HALF_OPEN
   */
  successThreshold: number;

  /**
   * Timeout for individual requests (ms)
   */
  requestTimeout: number;

  /**
   * Whether to cache last successful result
   */
  cacheFallback: boolean;

  /**
   * Maximum age of cached result (ms)
   */
  fallbackMaxAge: number;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  /**
   * Executor name
   */
  executorName: string;

  /**
   * Current state
   */
  state: CircuitState;

  /**
   * Total requests
   */
  totalRequests: number;

  /**
   * Successful requests
   */
  successfulRequests: number;

  /**
   * Failed requests
   */
  failedRequests: number;

  /**
   * Rejected requests (circuit open)
   */
  rejectedRequests: number;

  /**
   * Consecutive failures
   */
  consecutiveFailures: number;

  /**
   * Consecutive successes (in HALF_OPEN)
   */
  consecutiveSuccesses: number;

  /**
   * Times circuit opened
   */
  timesOpened: number;

  /**
   * Times circuit closed
   */
  timesClosed: number;

  /**
   * Last state change timestamp
   */
  lastStateChange: Date | null;

  /**
   * Last failure time
   */
  lastFailureTime: Date | null;

  /**
   * Last success time
   */
  lastSuccessTime: Date | null;

  /**
   * When circuit will attempt half-open (if open)
   */
  nextAttemptTime: Date | null;

  /**
   * Average response time (ms)
   */
  avgResponseTime: number;
}

/**
 * Execution result
 */
export interface ExecutionResult<T> {
  /**
   * Whether execution succeeded
   */
  success: boolean;

  /**
   * Result data if successful
   */
  data?: T;

  /**
   * Error if failed
   */
  error?: Error;

  /**
   * Whether result is from cache
   */
  fromCache: boolean;

  /**
   * Whether request was rejected by circuit breaker
   */
  rejected: boolean;

  /**
   * Circuit state at execution time
   */
  circuitState: CircuitState;

  /**
   * Execution time (ms)
   */
  executionTime: number;
}

/**
 * Failure record for tracking failure window
 */
interface FailureRecord {
  timestamp: Date;
  error: Error;
}

/**
 * Cached result
 */
interface CachedResult {
  data: any;
  timestamp: Date;
}

/**
 * Circuit breaker events
 */
export interface CircuitBreakerEvents {
  'circuit:opened': (executorName: string, stats: CircuitBreakerStats) => void;
  'circuit:closed': (executorName: string, stats: CircuitBreakerStats) => void;
  'circuit:half-open': (executorName: string, stats: CircuitBreakerStats) => void;
  'request:success': (executorName: string, executionTime: number) => void;
  'request:failure': (executorName: string, error: Error) => void;
  'request:rejected': (executorName: string) => void;
  'fallback:used': (executorName: string) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Omit<CircuitBreakerConfig, 'executorName'> = {
  failureThreshold: 5,           // Open after 5 failures
  failureWindow: 60 * 1000,      // Within 1 minute
  resetTimeout: 30 * 1000,       // Try half-open after 30 seconds
  successThreshold: 2,           // Close after 2 successes in half-open
  requestTimeout: 10 * 1000,     // 10 second request timeout
  cacheFallback: true,           // Use cached fallback
  fallbackMaxAge: 5 * 60 * 1000  // Cache valid for 5 minutes
};

// ============================================================================
// CIRCUIT BREAKER CLASS
// ============================================================================

/**
 * Circuit Breaker implementation
 */
class CircuitBreaker<T = any> {
  private config: CircuitBreakerConfig;
  private state: CircuitState;
  private failureRecords: FailureRecord[];
  private consecutiveFailures: number;
  private consecutiveSuccesses: number;
  private stats: CircuitBreakerStats;
  private nextAttemptTime: Date | null;
  private cachedResult: CachedResult | null;
  private resetTimer: NodeJS.Timeout | null;
  private responseTimes: number[];

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
    this.state = CircuitState.CLOSED;
    this.failureRecords = [];
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.nextAttemptTime = null;
    this.cachedResult = null;
    this.resetTimer = null;
    this.responseTimes = [];

    // Initialize statistics
    this.stats = {
      executorName: config.executorName,
      state: this.state,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      timesOpened: 0,
      timesClosed: 0,
      lastStateChange: null,
      lastFailureTime: null,
      lastSuccessTime: null,
      nextAttemptTime: null,
      avgResponseTime: 0
    };

    logger.info('Circuit breaker initialized', {
      executorName: config.executorName,
      config
    });
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute(fn: () => Promise<T>): Promise<ExecutionResult<T>> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      return this.handleOpenCircuit();
    }

    // Execute the function
    try {
      const result = await this.executeWithTimeout(fn);
      const executionTime = Date.now() - startTime;

      // Record success
      this.onSuccess(executionTime, result);

      return {
        success: true,
        data: result,
        fromCache: false,
        rejected: false,
        circuitState: this.state,
        executionTime
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      // Record failure
      this.onFailure(error);

      // Try to return cached result if available
      if (this.config.cacheFallback && this.cachedResult) {
        const cacheAge = Date.now() - this.cachedResult.timestamp.getTime();
        
        if (cacheAge <= this.config.fallbackMaxAge) {
          logger.warn('Using cached fallback result', {
            executorName: this.config.executorName,
            cacheAge
          });

        eventEmitter.emit('fallback:used', this.config.executorName);

        return {
          success: true,
          data: this.cachedResult.data as T,
          fromCache: true,
          rejected: false,
          circuitState: this.state,
          executionTime
        };
      }
    }      // No fallback available, return error
      return {
        success: false,
        error,
        fromCache: false,
        rejected: false,
        circuitState: this.state,
        executionTime
      };
    }
  }

  /**
   * Handle request when circuit is open
   */
  private handleOpenCircuit<T>(): ExecutionResult<T> {
    this.stats.rejectedRequests++;

    logger.warn('Circuit breaker is open, rejecting request', {
      executorName: this.config.executorName,
      nextAttemptTime: this.nextAttemptTime
    });

    eventEmitter.emit('request:rejected', this.config.executorName);

    // Check if it's time to try half-open
    if (this.nextAttemptTime && Date.now() >= this.nextAttemptTime.getTime()) {
      this.transitionToHalfOpen();
    }

    // Try to return cached result
    if (this.config.cacheFallback && this.cachedResult) {
      const cacheAge = Date.now() - this.cachedResult.timestamp.getTime();
      
      if (cacheAge <= this.config.fallbackMaxAge) {
        logger.info('Using cached fallback for rejected request', {
          executorName: this.config.executorName,
          cacheAge
        });

        eventEmitter.emit('fallback:used', this.config.executorName);

        return {
          success: true,
          data: this.cachedResult.data as T,
          fromCache: true,
          rejected: true,
          circuitState: this.state,
          executionTime: 0
        };
      }
    }

    // No fallback, return circuit open error
    return {
      success: false,
      error: new Error(
        `Circuit breaker is open for ${this.config.executorName}. ` +
        `Next attempt at ${this.nextAttemptTime?.toISOString()}`
      ),
      fromCache: false,
      rejected: true,
      circuitState: this.state,
      executionTime: 0
    };
  }

  /**
   * Execute function with timeout
   */
  private executeWithTimeout(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Request timeout after ${this.config.requestTimeout}ms`)),
          this.config.requestTimeout
        )
      )
    ]);
  }

  /**
   * Handle successful execution
   */
  private onSuccess(executionTime: number, result: T): void {
    this.stats.successfulRequests++;
    this.stats.lastSuccessTime = new Date();
    this.consecutiveFailures = 0;

    // Track response time
    this.responseTimes.push(executionTime);
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }
    this.stats.avgResponseTime = 
      this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;

    // Cache result if enabled
    if (this.config.cacheFallback) {
      this.cachedResult = {
        data: result,
        timestamp: new Date()
      };
    }

    logger.debug('Request succeeded', {
      executorName: this.config.executorName,
      executionTime,
      state: this.state
    });

    eventEmitter.emit('request:success', this.config.executorName, executionTime);

    // Handle state transitions
    if (this.state === CircuitState.HALF_OPEN) {
      this.consecutiveSuccesses++;
      this.stats.consecutiveSuccesses = this.consecutiveSuccesses;

      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: Error): void {
    this.stats.failedRequests++;
    this.stats.lastFailureTime = new Date();
    this.consecutiveSuccesses = 0;

    // Record failure
    this.failureRecords.push({
      timestamp: new Date(),
      error
    });

    // Clean old failures outside window
    this.cleanOldFailures();

    // Count recent failures
    const recentFailures = this.failureRecords.length;
    this.consecutiveFailures++;
    this.stats.consecutiveFailures = this.consecutiveFailures;

    logger.warn('Request failed', {
      executorName: this.config.executorName,
      error: error.message,
      consecutiveFailures: this.consecutiveFailures,
      recentFailures,
      state: this.state
    });

    eventEmitter.emit('request:failure', this.config.executorName, error);

    // Check if circuit should open
    if (this.state === CircuitState.CLOSED) {
      if (recentFailures >= this.config.failureThreshold) {
        this.transitionToOpen();
      }
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open immediately opens circuit
      this.transitionToOpen();
    }
  }

  /**
   * Clean failures outside the failure window
   */
  private cleanOldFailures(): void {
    const cutoffTime = Date.now() - this.config.failureWindow;
    this.failureRecords = this.failureRecords.filter(
      record => record.timestamp.getTime() > cutoffTime
    );
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    if (this.state === CircuitState.OPEN) return;

    this.state = CircuitState.OPEN;
    this.stats.state = this.state;
    this.stats.timesOpened++;
    this.stats.lastStateChange = new Date();
    this.nextAttemptTime = new Date(Date.now() + this.config.resetTimeout);
    this.stats.nextAttemptTime = this.nextAttemptTime;

    logger.error('Circuit breaker opened', {
      executorName: this.config.executorName,
      consecutiveFailures: this.consecutiveFailures,
      recentFailures: this.failureRecords.length,
      nextAttemptTime: this.nextAttemptTime.toISOString()
    });

    eventEmitter.emit('circuit:opened', this.config.executorName, { ...this.stats });

    // Schedule transition to half-open
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    this.resetTimer = setTimeout(() => {
      this.transitionToHalfOpen();
    }, this.config.resetTimeout);
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    if (this.state === CircuitState.HALF_OPEN) return;

    this.state = CircuitState.HALF_OPEN;
    this.stats.state = this.state;
    this.stats.lastStateChange = new Date();
    this.consecutiveSuccesses = 0;
    this.stats.consecutiveSuccesses = 0;
    this.nextAttemptTime = null;
    this.stats.nextAttemptTime = null;

    logger.info('Circuit breaker half-opened', {
      executorName: this.config.executorName
    });

    eventEmitter.emit('circuit:half-open', this.config.executorName, { ...this.stats });
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    if (this.state === CircuitState.CLOSED) return;

    this.state = CircuitState.CLOSED;
    this.stats.state = this.state;
    this.stats.timesClosed++;
    this.stats.lastStateChange = new Date();
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.stats.consecutiveFailures = 0;
    this.stats.consecutiveSuccesses = 0;
    this.failureRecords = [];

    logger.info('Circuit breaker closed', {
      executorName: this.config.executorName
    });

    eventEmitter.emit('circuit:closed', this.config.executorName, { ...this.stats });

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get statistics
   */
  getStats(): CircuitBreakerStats {
    return { ...this.stats };
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureRecords = [];
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.nextAttemptTime = null;
    this.cachedResult = null;
    this.responseTimes = [];

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    this.stats = {
      executorName: this.config.executorName,
      state: this.state,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      timesOpened: 0,
      timesClosed: 0,
      lastStateChange: null,
      lastFailureTime: null,
      lastSuccessTime: null,
      nextAttemptTime: null,
      avgResponseTime: 0
    };

    logger.info('Circuit breaker reset', {
      executorName: this.config.executorName
    });
  }

  /**
   * Manually open circuit
   */
  open(): void {
    this.transitionToOpen();
  }

  /**
   * Manually close circuit
   */
  close(): void {
    this.transitionToClosed();
  }

  /**
   * Clean up
   */
  destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}

// ============================================================================
// GLOBAL STATE
// ============================================================================

/**
 * Event emitter for circuit breaker events
 */
export const eventEmitter = new EventEmitter();

/**
 * Circuit breakers by executor name
 */
const circuitBreakers = new Map<string, CircuitBreaker<any>>();

/**
 * Custom configurations
 */
const customConfigs = new Map<string, Partial<CircuitBreakerConfig>>();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Execute function with circuit breaker protection
 */
export async function execute<T>(
  executorName: string,
  fn: () => Promise<T>
): Promise<ExecutionResult<T>> {
  // Get or create circuit breaker
  let breaker = circuitBreakers.get(executorName);
  
  if (!breaker) {
    breaker = createCircuitBreaker(executorName);
    circuitBreakers.set(executorName, breaker);
  }

  // Execute with circuit breaker
  return breaker.execute(fn);
}

/**
 * Create circuit breaker for executor
 */
function createCircuitBreaker<T>(executorName: string): CircuitBreaker<T> {
  const customConfig = customConfigs.get(executorName) || {};
  const config: CircuitBreakerConfig = {
    ...DEFAULT_CONFIG,
    ...customConfig,
    executorName
  };

  return new CircuitBreaker<T>(config);
}

/**
 * Get circuit breaker for executor
 */
export function getCircuitBreaker(executorName: string): CircuitBreaker<any> | undefined {
  return circuitBreakers.get(executorName);
}

/**
 * Get circuit state for executor
 */
export function getState(executorName: string): CircuitState | null {
  const breaker = circuitBreakers.get(executorName);
  return breaker ? breaker.getState() : null;
}

/**
 * Get statistics for executor
 */
export function getStats(executorName: string): CircuitBreakerStats | null {
  const breaker = circuitBreakers.get(executorName);
  return breaker ? breaker.getStats() : null;
}

/**
 * Get statistics for all executors
 */
export function getAllStats(): Map<string, CircuitBreakerStats> {
  const stats = new Map<string, CircuitBreakerStats>();
  
  circuitBreakers.forEach((breaker, name) => {
    stats.set(name, breaker.getStats());
  });

  return stats;
}

/**
 * Configure circuit breaker for executor
 */
export function configure(
  executorName: string,
  config: Partial<Omit<CircuitBreakerConfig, 'executorName'>>
): void {
  customConfigs.set(executorName, config);

  // Update existing circuit breaker if exists
  const breaker = circuitBreakers.get(executorName);
  if (breaker) {
    breaker.destroy();
    circuitBreakers.delete(executorName);
  }

  logger.info('Circuit breaker configured', {
    executorName,
    config
  });
}

/**
 * Reset circuit breaker for executor
 */
export function reset(executorName: string): void {
  const breaker = circuitBreakers.get(executorName);
  if (breaker) {
    breaker.reset();
  }
}

/**
 * Reset all circuit breakers
 */
export function resetAll(): void {
  circuitBreakers.forEach(breaker => breaker.reset());
  logger.info('All circuit breakers reset');
}

/**
 * Manually open circuit
 */
export function openCircuit(executorName: string): void {
  const breaker = circuitBreakers.get(executorName);
  if (breaker) {
    breaker.open();
  }
}

/**
 * Manually close circuit
 */
export function closeCircuit(executorName: string): void {
  const breaker = circuitBreakers.get(executorName);
  if (breaker) {
    breaker.close();
  }
}

/**
 * Get list of all executors with circuit breakers
 */
export function getExecutors(): string[] {
  return Array.from(circuitBreakers.keys());
}

/**
 * Check if circuit is open
 */
export function isOpen(executorName: string): boolean {
  const state = getState(executorName);
  return state === CircuitState.OPEN;
}

/**
 * Check if circuit is closed
 */
export function isClosed(executorName: string): boolean {
  const state = getState(executorName);
  return state === CircuitState.CLOSED;
}

/**
 * Check if circuit is half-open
 */
export function isHalfOpen(executorName: string): boolean {
  const state = getState(executorName);
  return state === CircuitState.HALF_OPEN;
}

/**
 * Register event listener
 */
export function on<E extends keyof CircuitBreakerEvents>(
  event: E,
  listener: CircuitBreakerEvents[E]
): void {
  eventEmitter.on(event, listener);
}

/**
 * Remove event listener
 */
export function off<E extends keyof CircuitBreakerEvents>(
  event: E,
  listener: CircuitBreakerEvents[E]
): void {
  eventEmitter.off(event, listener);
}

/**
 * Format statistics for display
 */
export function formatStats(stats: CircuitBreakerStats): string {
  const successRate = stats.totalRequests > 0
    ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1)
    : '0.0';

  const rejectionRate = stats.totalRequests > 0
    ? ((stats.rejectedRequests / stats.totalRequests) * 100).toFixed(1)
    : '0.0';

  let output = `\n=== Circuit Breaker: ${stats.executorName} ===\n`;
  output += `State: ${stats.state}\n`;
  
  if (stats.state === CircuitState.OPEN && stats.nextAttemptTime) {
    const timeUntilAttempt = stats.nextAttemptTime.getTime() - Date.now();
    output += `Next Attempt: ${Math.max(0, Math.round(timeUntilAttempt / 1000))}s\n`;
  }

  output += `\n`;
  output += `Requests:\n`;
  output += `  Total: ${stats.totalRequests}\n`;
  output += `  Successful: ${stats.successfulRequests} (${successRate}%)\n`;
  output += `  Failed: ${stats.failedRequests}\n`;
  output += `  Rejected: ${stats.rejectedRequests} (${rejectionRate}%)\n`;
  output += `\n`;
  output += `Current Streak:\n`;
  output += `  Consecutive Failures: ${stats.consecutiveFailures}\n`;
  output += `  Consecutive Successes: ${stats.consecutiveSuccesses}\n`;
  output += `\n`;
  output += `Circuit History:\n`;
  output += `  Times Opened: ${stats.timesOpened}\n`;
  output += `  Times Closed: ${stats.timesClosed}\n`;
  output += `\n`;
  output += `Performance:\n`;
  output += `  Avg Response Time: ${stats.avgResponseTime.toFixed(0)}ms\n`;
  
  if (stats.lastSuccessTime) {
    const timeSinceSuccess = Date.now() - stats.lastSuccessTime.getTime();
    output += `  Last Success: ${Math.round(timeSinceSuccess / 1000)}s ago\n`;
  }
  
  if (stats.lastFailureTime) {
    const timeSinceFailure = Date.now() - stats.lastFailureTime.getTime();
    output += `  Last Failure: ${Math.round(timeSinceFailure / 1000)}s ago\n`;
  }

  if (stats.lastStateChange) {
    const timeSinceChange = Date.now() - stats.lastStateChange.getTime();
    output += `\n`;
    output += `Last State Change: ${Math.round(timeSinceChange / 1000)}s ago\n`;
  }

  output += `========================================\n`;

  return output;
}

/**
 * Get summary of all circuit breakers
 */
export function getSummary(): string {
  let summary = '\n========================================\n';
  summary += '      CIRCUIT BREAKER SUMMARY\n';
  summary += '========================================\n';

  const allStats = getAllStats();
  
  if (allStats.size === 0) {
    summary += '\nNo circuit breakers active.\n';
    summary += '========================================\n';
    return summary;
  }

  // Summary table
  summary += '\nExecutor         State       Requests   Success%   Rejected\n';
  summary += '--------------------------------------------------------\n';

  allStats.forEach((stats) => {
    const successRate = stats.totalRequests > 0
      ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1)
      : '0.0';

    summary += `${stats.executorName.padEnd(16)} `;
    summary += `${stats.state.padEnd(11)} `;
    summary += `${stats.totalRequests.toString().padEnd(10)} `;
    summary += `${(successRate + '%').padEnd(10)} `;
    summary += `${stats.rejectedRequests}\n`;
  });

  summary += '\n';

  // Detailed stats for open circuits
  const openCircuits = Array.from(allStats.values()).filter(
    stats => stats.state === CircuitState.OPEN
  );

  if (openCircuits.length > 0) {
    summary += '⚠️  Open Circuits:\n';
    openCircuits.forEach(stats => {
      summary += `  - ${stats.executorName}`;
      if (stats.nextAttemptTime) {
        const timeUntil = Math.max(0, Math.round(
          (stats.nextAttemptTime.getTime() - Date.now()) / 1000
        ));
        summary += ` (retry in ${timeUntil}s)`;
      }
      summary += `\n`;
    });
  }

  summary += '\n========================================\n';

  return summary;
}

/**
 * Clean up all circuit breakers
 */
export function destroy(): void {
  circuitBreakers.forEach(breaker => breaker.destroy());
  circuitBreakers.clear();
  customConfigs.clear();
  eventEmitter.removeAllListeners();
  logger.info('All circuit breakers destroyed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Core functions
  execute,
  getCircuitBreaker,
  getState,
  getStats,
  getAllStats,

  // Configuration
  configure,

  // Control
  reset,
  resetAll,
  openCircuit,
  closeCircuit,

  // Query
  getExecutors,
  isOpen,
  isClosed,
  isHalfOpen,

  // Events
  on,
  off,
  eventEmitter,

  // Utilities
  formatStats,
  getSummary,
  destroy,

  // Enums
  CircuitState
};
