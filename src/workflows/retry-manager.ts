/**
 * Retry Strategy Manager
 * 
 * Implements sophisticated retry logic with:
 * - Platform-specific retry policies
 * - Error classification and handling
 * - Exponential backoff strategies
 * - Rate limit awareness
 * - Statistics tracking
 * - Token refresh for auth errors
 */

import logger from '../utils/logger';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Error types for classification
 */
export enum ErrorType {
  API_ERROR = 'api_error',
  RATE_LIMIT = 'rate_limit',
  NETWORK_ERROR = 'network_error',
  VALIDATION_ERROR = 'validation_error',
  AUTH_ERROR = 'auth_error',
  TIMEOUT_ERROR = 'timeout_error',
  UNKNOWN_ERROR = 'unknown_error'
}

/**
 * Platform types
 */
export enum Platform {
  NOTION = 'notion',
  TRELLO = 'trello',
  ASANA = 'asana',
  SLACK = 'slack',
  GMAIL = 'gmail',
  DRIVE = 'drive',
  SHEETS = 'sheets',
  GENERIC = 'generic'
}

/**
 * Backoff strategy types
 */
export enum BackoffStrategy {
  EXPONENTIAL = 'exponential',
  LINEAR = 'linear',
  FIXED = 'fixed',
  FIBONACCI = 'fibonacci'
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  /**
   * Maximum number of retry attempts
   */
  maxAttempts: number;

  /**
   * Initial delay in milliseconds
   */
  initialDelay: number;

  /**
   * Maximum delay in milliseconds
   */
  maxDelay: number;

  /**
   * Backoff strategy to use
   */
  backoffStrategy: BackoffStrategy;

  /**
   * Multiplier for exponential backoff
   */
  backoffMultiplier: number;

  /**
   * Jitter to add (0-1, percentage of delay)
   */
  jitter: number;

  /**
   * Error types to retry
   */
  retryableErrors: ErrorType[];

  /**
   * Whether to refresh auth token on auth errors
   */
  refreshAuthOnError: boolean;

  /**
   * Timeout for each attempt in milliseconds
   */
  timeout?: number;
}

/**
 * Retry context for tracking attempts
 */
export interface RetryContext {
  /**
   * Current attempt number (1-indexed)
   */
  attempt: number;

  /**
   * Total attempts allowed
   */
  maxAttempts: number;

  /**
   * Last error encountered
   */
  lastError?: Error;

  /**
   * Error type classification
   */
  errorType?: ErrorType;

  /**
   * Delay before next retry (ms)
   */
  nextDelay?: number;

  /**
   * Platform being retried
   */
  platform: Platform;

  /**
   * Operation being retried
   */
  operation: string;

  /**
   * Start time of first attempt
   */
  startTime: Date;

  /**
   * Total time elapsed (ms)
   */
  elapsedTime: number;

  /**
   * Whether auth token was refreshed
   */
  tokenRefreshed: boolean;
}

/**
 * Retry result
 */
export interface RetryResult<T> {
  /**
   * Whether operation succeeded
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
   * Number of attempts made
   */
  attempts: number;

  /**
   * Total time taken (ms)
   */
  totalTime: number;

  /**
   * Retry context
   */
  context: RetryContext;
}

/**
 * Retry statistics per platform
 */
export interface RetryStatistics {
  /**
   * Platform name
   */
  platform: Platform;

  /**
   * Total operations attempted
   */
  totalOperations: number;

  /**
   * Successful on first attempt
   */
  successfulFirstAttempt: number;

  /**
   * Successful after retries
   */
  successfulAfterRetries: number;

  /**
   * Failed after all retries
   */
  failedAfterRetries: number;

  /**
   * Total retry attempts
   */
  totalRetries: number;

  /**
   * Average retries per operation
   */
  avgRetriesPerOperation: number;

  /**
   * Errors by type
   */
  errorsByType: Map<ErrorType, number>;

  /**
   * Rate limit hits
   */
  rateLimitHits: number;

  /**
   * Auth token refreshes
   */
  tokenRefreshes: number;

  /**
   * Average success time (ms)
   */
  avgSuccessTime: number;

  /**
   * Last updated
   */
  lastUpdated: Date;
}

/**
 * Rate limit information
 */
export interface RateLimitInfo {
  /**
   * When rate limit resets (timestamp)
   */
  resetTime?: number;

  /**
   * Remaining requests
   */
  remaining?: number;

  /**
   * Total requests allowed
   */
  limit?: number;

  /**
   * Retry-After header value (seconds)
   */
  retryAfter?: number;
}

/**
 * Token refresh function type
 */
export type TokenRefreshFunction = () => Promise<string>;

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default retry policies per platform
 */
const DEFAULT_POLICIES: Map<Platform, RetryPolicy> = new Map([
  // Notion API: 3 retries with exponential backoff
  [Platform.NOTION, {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 4000,
    backoffStrategy: BackoffStrategy.EXPONENTIAL,
    backoffMultiplier: 2,
    jitter: 0.1,
    retryableErrors: [ErrorType.API_ERROR, ErrorType.NETWORK_ERROR, ErrorType.TIMEOUT_ERROR],
    refreshAuthOnError: true,
    timeout: 10000
  }],

  // Trello API: 3 retries with exponential backoff
  [Platform.TRELLO, {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 4000,
    backoffStrategy: BackoffStrategy.EXPONENTIAL,
    backoffMultiplier: 2,
    jitter: 0.1,
    retryableErrors: [ErrorType.API_ERROR, ErrorType.NETWORK_ERROR, ErrorType.TIMEOUT_ERROR, ErrorType.RATE_LIMIT],
    refreshAuthOnError: true,
    timeout: 10000
  }],

  // Asana API: 3 retries with exponential backoff
  [Platform.ASANA, {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 4000,
    backoffStrategy: BackoffStrategy.EXPONENTIAL,
    backoffMultiplier: 2,
    jitter: 0.1,
    retryableErrors: [ErrorType.API_ERROR, ErrorType.NETWORK_ERROR, ErrorType.TIMEOUT_ERROR, ErrorType.RATE_LIMIT],
    refreshAuthOnError: true,
    timeout: 10000
  }],

  // Slack API: 3 retries with exponential backoff
  [Platform.SLACK, {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 5000,
    backoffStrategy: BackoffStrategy.EXPONENTIAL,
    backoffMultiplier: 2,
    jitter: 0.1,
    retryableErrors: [ErrorType.API_ERROR, ErrorType.NETWORK_ERROR, ErrorType.TIMEOUT_ERROR, ErrorType.RATE_LIMIT],
    refreshAuthOnError: false,
    timeout: 15000
  }],

  // Gmail API: 5 retries with network-focused policy
  [Platform.GMAIL, {
    maxAttempts: 5,
    initialDelay: 2000,
    maxDelay: 32000,
    backoffStrategy: BackoffStrategy.EXPONENTIAL,
    backoffMultiplier: 2,
    jitter: 0.15,
    retryableErrors: [ErrorType.API_ERROR, ErrorType.NETWORK_ERROR, ErrorType.TIMEOUT_ERROR, ErrorType.RATE_LIMIT],
    refreshAuthOnError: true,
    timeout: 20000
  }],

  // Google Drive: 5 retries with network-focused policy
  [Platform.DRIVE, {
    maxAttempts: 5,
    initialDelay: 2000,
    maxDelay: 32000,
    backoffStrategy: BackoffStrategy.EXPONENTIAL,
    backoffMultiplier: 2,
    jitter: 0.15,
    retryableErrors: [ErrorType.API_ERROR, ErrorType.NETWORK_ERROR, ErrorType.TIMEOUT_ERROR, ErrorType.RATE_LIMIT],
    refreshAuthOnError: true,
    timeout: 30000
  }],

  // Google Sheets: 5 retries with network-focused policy
  [Platform.SHEETS, {
    maxAttempts: 5,
    initialDelay: 2000,
    maxDelay: 32000,
    backoffStrategy: BackoffStrategy.EXPONENTIAL,
    backoffMultiplier: 2,
    jitter: 0.15,
    retryableErrors: [ErrorType.API_ERROR, ErrorType.NETWORK_ERROR, ErrorType.TIMEOUT_ERROR, ErrorType.RATE_LIMIT],
    refreshAuthOnError: true,
    timeout: 20000
  }],

  // Generic: Conservative retry policy
  [Platform.GENERIC, {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 8000,
    backoffStrategy: BackoffStrategy.EXPONENTIAL,
    backoffMultiplier: 2,
    jitter: 0.1,
    retryableErrors: [ErrorType.API_ERROR, ErrorType.NETWORK_ERROR, ErrorType.TIMEOUT_ERROR],
    refreshAuthOnError: false,
    timeout: 10000
  }]
]);

/**
 * Buffer time for rate limit resets (ms)
 */
const RATE_LIMIT_BUFFER_MS = 5000;

/**
 * Maximum total retry time (ms)
 */
const MAX_TOTAL_RETRY_TIME = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// STATE
// ============================================================================

/**
 * Statistics per platform
 */
const statistics = new Map<Platform, RetryStatistics>();

/**
 * Token refresh functions per platform
 */
const tokenRefreshFunctions = new Map<Platform, TokenRefreshFunction>();

/**
 * Custom retry policies
 */
const customPolicies = new Map<string, RetryPolicy>();

// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================

/**
 * Classify error into error type
 */
export function classifyError(error: any): ErrorType {
  // Check error message and properties
  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code || error.statusCode || error.status;

  // Rate limit errors
  if (
    errorCode === 429 ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('too many requests') ||
    error.isRateLimit
  ) {
    return ErrorType.RATE_LIMIT;
  }

  // Auth errors
  if (
    errorCode === 401 ||
    errorCode === 403 ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('authentication') ||
    errorMessage.includes('invalid token') ||
    errorMessage.includes('expired token') ||
    error.isAuthError
  ) {
    return ErrorType.AUTH_ERROR;
  }

  // Validation errors
  if (
    errorCode === 400 ||
    errorCode === 422 ||
    errorMessage.includes('validation') ||
    errorMessage.includes('invalid') ||
    errorMessage.includes('required') ||
    error.isValidationError
  ) {
    return ErrorType.VALIDATION_ERROR;
  }

  // Network errors
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('connect') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('enotfound') ||
    errorMessage.includes('etimedout') ||
    error.code === 'ECONNREFUSED' ||
    error.code === 'ENOTFOUND' ||
    error.code === 'ETIMEDOUT' ||
    error.isNetworkError
  ) {
    return ErrorType.NETWORK_ERROR;
  }

  // Timeout errors
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('timed out') ||
    error.code === 'ETIMEDOUT' ||
    error.isTimeout
  ) {
    return ErrorType.TIMEOUT_ERROR;
  }

  // API errors (5xx)
  if (
    errorCode >= 500 && errorCode < 600 ||
    errorMessage.includes('server error') ||
    errorMessage.includes('internal error')
  ) {
    return ErrorType.API_ERROR;
  }

  // Default to unknown
  return ErrorType.UNKNOWN_ERROR;
}

/**
 * Get retryable error types
 */
export function getRetryableErrors(): ErrorType[] {
  return [
    ErrorType.API_ERROR,
    ErrorType.RATE_LIMIT,
    ErrorType.NETWORK_ERROR,
    ErrorType.TIMEOUT_ERROR
    // Note: AUTH_ERROR may be retryable after token refresh
    // VALIDATION_ERROR and UNKNOWN_ERROR are not retryable
  ];
}

/**
 * Check if error is retryable based on policy
 */
export function isRetryableError(error: any, policy: RetryPolicy): boolean {
  const errorType = classifyError(error);
  return policy.retryableErrors.includes(errorType);
}

/**
 * Extract rate limit info from error
 */
export function extractRateLimitInfo(error: any): RateLimitInfo {
  const info: RateLimitInfo = {};

  // Check headers (common in API responses)
  if (error.response?.headers) {
    const headers = error.response.headers;

    // X-RateLimit-Reset (Unix timestamp)
    if (headers['x-ratelimit-reset']) {
      info.resetTime = parseInt(headers['x-ratelimit-reset']) * 1000;
    }

    // Retry-After (seconds)
    if (headers['retry-after']) {
      info.retryAfter = parseInt(headers['retry-after']);
    }

    // X-RateLimit-Remaining
    if (headers['x-ratelimit-remaining']) {
      info.remaining = parseInt(headers['x-ratelimit-remaining']);
    }

    // X-RateLimit-Limit
    if (headers['x-ratelimit-limit']) {
      info.limit = parseInt(headers['x-ratelimit-limit']);
    }
  }

  // Check error properties
  if (error.resetTime) {
    info.resetTime = error.resetTime;
  }
  if (error.retryAfter) {
    info.retryAfter = error.retryAfter;
  }

  return info;
}

// ============================================================================
// BACKOFF CALCULATION
// ============================================================================

/**
 * Calculate delay for next retry
 */
export function calculateDelay(
  attempt: number,
  policy: RetryPolicy,
  rateLimitInfo?: RateLimitInfo
): number {
  // Handle rate limit specially
  if (rateLimitInfo) {
    if (rateLimitInfo.resetTime) {
      // Wait until reset time + buffer
      const waitTime = rateLimitInfo.resetTime - Date.now() + RATE_LIMIT_BUFFER_MS;
      return Math.max(0, Math.min(waitTime, policy.maxDelay));
    }
    if (rateLimitInfo.retryAfter) {
      // Use Retry-After header + buffer
      return Math.min(
        rateLimitInfo.retryAfter * 1000 + RATE_LIMIT_BUFFER_MS,
        policy.maxDelay
      );
    }
  }

  let delay: number;

  switch (policy.backoffStrategy) {
    case BackoffStrategy.EXPONENTIAL:
      // Exponential: initialDelay * (multiplier ^ (attempt - 1))
      delay = policy.initialDelay * Math.pow(policy.backoffMultiplier, attempt - 1);
      break;

    case BackoffStrategy.LINEAR:
      // Linear: initialDelay * attempt
      delay = policy.initialDelay * attempt;
      break;

    case BackoffStrategy.FIXED:
      // Fixed: always initialDelay
      delay = policy.initialDelay;
      break;

    case BackoffStrategy.FIBONACCI:
      // Fibonacci sequence
      delay = policy.initialDelay * fibonacci(attempt);
      break;

    default:
      delay = policy.initialDelay;
  }

  // Apply max delay cap
  delay = Math.min(delay, policy.maxDelay);

  // Apply jitter (randomness to prevent thundering herd)
  if (policy.jitter > 0) {
    const jitterAmount = delay * policy.jitter;
    const randomJitter = Math.random() * jitterAmount * 2 - jitterAmount;
    delay += randomJitter;
  }

  return Math.max(0, Math.round(delay));
}

/**
 * Calculate fibonacci number (for fibonacci backoff)
 */
function fibonacci(n: number): number {
  if (n <= 1) return 1;
  let a = 1, b = 1;
  for (let i = 2; i < n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

/**
 * Execute function with retry logic
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    platform: Platform;
    operation: string;
    policy?: RetryPolicy;
    onRetry?: (context: RetryContext) => void;
    onSuccess?: (result: RetryResult<T>) => void;
    onFailure?: (result: RetryResult<T>) => void;
  }
): Promise<T> {
  const { platform, operation, policy: customPolicy, onRetry, onSuccess, onFailure } = options;

  // Get retry policy
  const policy = customPolicy || DEFAULT_POLICIES.get(platform) || DEFAULT_POLICIES.get(Platform.GENERIC)!;

  // Initialize retry context
  const context: RetryContext = {
    attempt: 0,
    maxAttempts: policy.maxAttempts,
    platform,
    operation,
    startTime: new Date(),
    elapsedTime: 0,
    tokenRefreshed: false
  };

  let lastError: Error | undefined;

  // Retry loop
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    context.attempt = attempt;
    context.elapsedTime = Date.now() - context.startTime.getTime();

    // Check total time limit
    if (context.elapsedTime > MAX_TOTAL_RETRY_TIME) {
      logger.error('Retry timeout exceeded', {
        platform,
        operation,
        elapsedTime: context.elapsedTime,
        maxTime: MAX_TOTAL_RETRY_TIME
      });
      break;
    }

    try {
      logger.info(`Attempting operation (attempt ${attempt}/${policy.maxAttempts})`, {
        platform,
        operation,
        attempt,
        elapsedTime: context.elapsedTime
      });

      // Execute with timeout if specified
      let result: T;
      if (policy.timeout) {
        result = await executeWithTimeout(fn, policy.timeout);
      } else {
        result = await fn();
      }

      // Success!
      logger.info('Operation succeeded', {
        platform,
        operation,
        attempt,
        elapsedTime: context.elapsedTime
      });

      // Update statistics
      updateStatistics(platform, context, true);

      // Call success callback
      if (onSuccess) {
        onSuccess({
          success: true,
          data: result,
          attempts: attempt,
          totalTime: context.elapsedTime,
          context
        });
      }

      return result;

    } catch (error: any) {
      lastError = error;
      context.lastError = error;

      // Classify error
      const errorType = classifyError(error);
      context.errorType = errorType;

      logger.warn('Operation failed', {
        platform,
        operation,
        attempt,
        errorType,
        errorMessage: error.message,
        willRetry: attempt < policy.maxAttempts
      });

      // Check if error is retryable
      if (!isRetryableError(error, policy)) {
        logger.error('Error is not retryable', {
          platform,
          operation,
          errorType,
          errorMessage: error.message
        });
        break;
      }

      // Handle auth errors
      if (errorType === ErrorType.AUTH_ERROR && policy.refreshAuthOnError && !context.tokenRefreshed) {
        try {
          logger.info('Attempting to refresh auth token', { platform, operation });
          await refreshAuthToken(platform);
          context.tokenRefreshed = true;
          logger.info('Auth token refreshed successfully', { platform, operation });
          // Don't count this as a retry attempt
          continue;
        } catch (refreshError: any) {
          logger.error('Failed to refresh auth token', {
            platform,
            operation,
            error: refreshError.message
          });
          // Fall through to normal retry logic
        }
      }

      // Last attempt - don't wait
      if (attempt >= policy.maxAttempts) {
        logger.error('Max retry attempts reached', {
          platform,
          operation,
          attempts: attempt,
          errorType
        });
        break;
      }

      // Calculate delay for next retry
      const rateLimitInfo = errorType === ErrorType.RATE_LIMIT
        ? extractRateLimitInfo(error)
        : undefined;

      const delay = calculateDelay(attempt, policy, rateLimitInfo);
      context.nextDelay = delay;

      logger.info('Waiting before retry', {
        platform,
        operation,
        attempt,
        nextAttempt: attempt + 1,
        delay,
        errorType
      });

      // Call retry callback
      if (onRetry) {
        onRetry(context);
      }

      // Wait before next retry
      await sleep(delay);
    }
  }

  // All retries exhausted
  updateStatistics(platform, context, false);

  // Call failure callback
  if (onFailure) {
    onFailure({
      success: false,
      error: lastError,
      attempts: context.attempt,
      totalTime: context.elapsedTime,
      context
    });
  }

  // Throw last error
  throw lastError || new Error('Operation failed after all retry attempts');
}

/**
 * Execute function with timeout
 */
async function executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// TOKEN REFRESH
// ============================================================================

/**
 * Register token refresh function for platform
 */
export function registerTokenRefresh(platform: Platform, refreshFn: TokenRefreshFunction): void {
  tokenRefreshFunctions.set(platform, refreshFn);
  logger.info('Token refresh function registered', { platform });
}

/**
 * Refresh auth token for platform
 */
async function refreshAuthToken(platform: Platform): Promise<string> {
  const refreshFn = tokenRefreshFunctions.get(platform);

  if (!refreshFn) {
    throw new Error(`No token refresh function registered for platform: ${platform}`);
  }

  const newToken = await refreshFn();

  // Update statistics
  const stats = getOrCreateStatistics(platform);
  stats.tokenRefreshes++;

  return newToken;
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get or create statistics for platform
 */
function getOrCreateStatistics(platform: Platform): RetryStatistics {
  if (!statistics.has(platform)) {
    statistics.set(platform, {
      platform,
      totalOperations: 0,
      successfulFirstAttempt: 0,
      successfulAfterRetries: 0,
      failedAfterRetries: 0,
      totalRetries: 0,
      avgRetriesPerOperation: 0,
      errorsByType: new Map(),
      rateLimitHits: 0,
      tokenRefreshes: 0,
      avgSuccessTime: 0,
      lastUpdated: new Date()
    });
  }
  return statistics.get(platform)!;
}

/**
 * Update statistics after operation
 */
function updateStatistics(platform: Platform, context: RetryContext, success: boolean): void {
  const stats = getOrCreateStatistics(platform);

  stats.totalOperations++;
  stats.lastUpdated = new Date();

  if (success) {
    if (context.attempt === 1) {
      stats.successfulFirstAttempt++;
    } else {
      stats.successfulAfterRetries++;
      stats.totalRetries += (context.attempt - 1);
    }
  } else {
    stats.failedAfterRetries++;
    stats.totalRetries += context.attempt;
  }

  // Update error count
  if (context.errorType) {
    const currentCount = stats.errorsByType.get(context.errorType) || 0;
    stats.errorsByType.set(context.errorType, currentCount + 1);

    if (context.errorType === ErrorType.RATE_LIMIT) {
      stats.rateLimitHits++;
    }
  }

  // Update average retries
  stats.avgRetriesPerOperation = stats.totalRetries / stats.totalOperations;

  // Update average success time
  if (success) {
    const successCount = stats.successfulFirstAttempt + stats.successfulAfterRetries;
    stats.avgSuccessTime = (
      (stats.avgSuccessTime * (successCount - 1) + context.elapsedTime) / successCount
    );
  }
}

/**
 * Get statistics for platform
 */
export function getStatistics(platform: Platform): RetryStatistics | undefined {
  return statistics.get(platform);
}

/**
 * Get statistics for all platforms
 */
export function getAllStatistics(): Map<Platform, RetryStatistics> {
  return new Map(statistics);
}

/**
 * Reset statistics for platform
 */
export function resetStatistics(platform?: Platform): void {
  if (platform) {
    statistics.delete(platform);
    logger.info('Statistics reset', { platform });
  } else {
    statistics.clear();
    logger.info('All statistics reset');
  }
}

// ============================================================================
// POLICY MANAGEMENT
// ============================================================================

/**
 * Set custom retry policy for platform
 */
export function setRetryPolicy(platform: Platform, policy: Partial<RetryPolicy>): void {
  const defaultPolicy = DEFAULT_POLICIES.get(platform) || DEFAULT_POLICIES.get(Platform.GENERIC)!;
  const mergedPolicy: RetryPolicy = { ...defaultPolicy, ...policy };
  customPolicies.set(platform, mergedPolicy);
  logger.info('Custom retry policy set', { platform, policy: mergedPolicy });
}

/**
 * Get retry policy for platform
 */
export function getRetryPolicy(platform: Platform): RetryPolicy {
  return (
    customPolicies.get(platform) ||
    DEFAULT_POLICIES.get(platform) ||
    DEFAULT_POLICIES.get(Platform.GENERIC)!
  );
}

/**
 * Reset retry policy for platform to default
 */
export function resetRetryPolicy(platform: Platform): void {
  customPolicies.delete(platform);
  logger.info('Retry policy reset to default', { platform });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create custom retry policy
 */
export function createRetryPolicy(options: Partial<RetryPolicy>): RetryPolicy {
  const defaultPolicy = DEFAULT_POLICIES.get(Platform.GENERIC)!;
  return { ...defaultPolicy, ...options };
}

/**
 * Format retry statistics for display
 */
export function formatStatistics(stats: RetryStatistics): string {
  const successRate = (
    (stats.successfulFirstAttempt + stats.successfulAfterRetries) / stats.totalOperations * 100
  ).toFixed(1);

  const retryRate = (
    stats.successfulAfterRetries / (stats.successfulFirstAttempt + stats.successfulAfterRetries) * 100
  ).toFixed(1);

  let output = `\n=== Retry Statistics: ${stats.platform} ===\n`;
  output += `Total Operations: ${stats.totalOperations}\n`;
  output += `Success Rate: ${successRate}%\n`;
  output += `  - First Attempt: ${stats.successfulFirstAttempt}\n`;
  output += `  - After Retries: ${stats.successfulAfterRetries} (${retryRate}% retry rate)\n`;
  output += `  - Failed: ${stats.failedAfterRetries}\n`;
  output += `\n`;
  output += `Retry Statistics:\n`;
  output += `  - Total Retries: ${stats.totalRetries}\n`;
  output += `  - Avg Retries/Op: ${stats.avgRetriesPerOperation.toFixed(2)}\n`;
  output += `  - Rate Limit Hits: ${stats.rateLimitHits}\n`;
  output += `  - Token Refreshes: ${stats.tokenRefreshes}\n`;
  output += `\n`;
  output += `Performance:\n`;
  output += `  - Avg Success Time: ${stats.avgSuccessTime.toFixed(0)}ms\n`;
  output += `\n`;
  output += `Errors by Type:\n`;
  
  stats.errorsByType.forEach((count, type) => {
    output += `  - ${type}: ${count}\n`;
  });

  output += `\nLast Updated: ${stats.lastUpdated.toISOString()}\n`;
  output += `========================================\n`;

  return output;
}

/**
 * Get retry statistics summary for all platforms
 */
export function getStatisticsSummary(): string {
  let summary = '\n========================================\n';
  summary += '      RETRY STATISTICS SUMMARY\n';
  summary += '========================================\n';

  const allStats = getAllStatistics();
  
  if (allStats.size === 0) {
    summary += '\nNo statistics available yet.\n';
    summary += '========================================\n';
    return summary;
  }

  allStats.forEach((stats) => {
    summary += formatStatistics(stats);
  });

  return summary;
}

// ============================================================================
// CONVENIENCE WRAPPERS
// ============================================================================

/**
 * Retry with Notion policy
 */
export async function retryNotion<T>(
  fn: () => Promise<T>,
  operation: string
): Promise<T> {
  return retry(fn, { platform: Platform.NOTION, operation });
}

/**
 * Retry with Trello policy
 */
export async function retryTrello<T>(
  fn: () => Promise<T>,
  operation: string
): Promise<T> {
  return retry(fn, { platform: Platform.TRELLO, operation });
}

/**
 * Retry with Asana policy
 */
export async function retryAsana<T>(
  fn: () => Promise<T>,
  operation: string
): Promise<T> {
  return retry(fn, { platform: Platform.ASANA, operation });
}

/**
 * Retry with Slack policy
 */
export async function retrySlack<T>(
  fn: () => Promise<T>,
  operation: string
): Promise<T> {
  return retry(fn, { platform: Platform.SLACK, operation });
}

/**
 * Retry with Gmail policy
 */
export async function retryGmail<T>(
  fn: () => Promise<T>,
  operation: string
): Promise<T> {
  return retry(fn, { platform: Platform.GMAIL, operation });
}

/**
 * Retry with Drive policy
 */
export async function retryDrive<T>(
  fn: () => Promise<T>,
  operation: string
): Promise<T> {
  return retry(fn, { platform: Platform.DRIVE, operation });
}

/**
 * Retry with Sheets policy
 */
export async function retrySheets<T>(
  fn: () => Promise<T>,
  operation: string
): Promise<T> {
  return retry(fn, { platform: Platform.SHEETS, operation });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Core functions
  retry,
  classifyError,
  isRetryableError,
  getRetryableErrors,
  extractRateLimitInfo,
  calculateDelay,

  // Token management
  registerTokenRefresh,

  // Statistics
  getStatistics,
  getAllStatistics,
  resetStatistics,
  formatStatistics,
  getStatisticsSummary,

  // Policy management
  setRetryPolicy,
  getRetryPolicy,
  resetRetryPolicy,
  createRetryPolicy,

  // Convenience wrappers
  retryNotion,
  retryTrello,
  retryAsana,
  retrySlack,
  retryGmail,
  retryDrive,
  retrySheets,

  // Enums
  ErrorType,
  Platform,
  BackoffStrategy
};
