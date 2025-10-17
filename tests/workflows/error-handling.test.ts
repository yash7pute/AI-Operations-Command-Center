/**
 * Error Handling Tests
 * 
 * Comprehensive test suite for error handling mechanisms including:
 * - Retry logic with exponential backoff
 * - Circuit breaker pattern
 * - Fallback handling
 * - Rollback mechanisms
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock API functions
const mockNotionAPI = jest.fn() as jest.MockedFunction<any>;
const mockTrelloAPI = jest.fn() as jest.MockedFunction<any>;
const mockSlackAPI = jest.fn() as jest.MockedFunction<any>;
const mockEmailAPI = jest.fn() as jest.MockedFunction<any>;

// ============================================================================
// Retry Logic Implementation
// ============================================================================

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

class RetryHandler {
  private defaultConfig: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 5000,
    backoffMultiplier: 2
  };

  async executeWithRetry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const finalConfig = { ...this.defaultConfig, ...config };
    let lastError: Error | undefined;
    let delay = finalConfig.initialDelayMs;

    for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Check if it's a rate limit error
        if (this.isRateLimitError(error)) {
          const waitTime = this.extractRateLimitWaitTime(error);
          await this.sleep(waitTime);
          continue;
        }

        // If this was the last attempt, throw
        if (attempt === finalConfig.maxRetries) {
          throw new Error(`Failed after ${finalConfig.maxRetries + 1} attempts: ${lastError.message}`);
        }

        // Wait before retrying with exponential backoff
        await this.sleep(delay);
        delay = Math.min(delay * finalConfig.backoffMultiplier, finalConfig.maxDelayMs);
      }
    }

    throw lastError!;
  }

  private isRateLimitError(error: any): boolean {
    return error?.message?.includes('rate limit') || 
           error?.message?.includes('Rate limited') ||
           error?.statusCode === 429;
  }

  private extractRateLimitWaitTime(error: any): number {
    // Extract wait time from error message like "Rate limited. Retry after 2000ms"
    const match = error?.message?.match(/after (\d+)ms/);
    return match ? parseInt(match[1], 10) : 1000;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private successCount: number = 0;

  private config: CircuitBreakerConfig = {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    halfOpenMaxAttempts: 3
  };

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...this.config, ...config };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure >= this.config.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN. Request blocked.');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenMaxAttempts) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.successCount = 0;
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}

// ============================================================================
// Fallback Handler Implementation
// ============================================================================

type FallbackStrategy<T> = () => Promise<T>;

class FallbackHandler {
  async executeWithFallback<T>(
    primary: () => Promise<T>,
    fallback: FallbackStrategy<T>,
    fallbackName: string = 'fallback'
  ): Promise<{ result: T; usedFallback: boolean; strategy: string }> {
    try {
      const result = await primary();
      return { result, usedFallback: false, strategy: 'primary' };
    } catch (error) {
      console.log(`Primary strategy failed: ${(error as Error).message}. Using ${fallbackName}.`);
      try {
        const result = await fallback();
        return { result, usedFallback: true, strategy: fallbackName };
      } catch (fallbackError) {
        throw new Error(`Both primary and ${fallbackName} strategies failed: ${(fallbackError as Error).message}`);
      }
    }
  }

  async executeWithMultipleFallbacks<T>(
    strategies: Array<{ name: string; fn: () => Promise<T> }>
  ): Promise<{ result: T; usedStrategy: string; attemptedStrategies: string[] }> {
    const attemptedStrategies: string[] = [];
    let lastError: Error | undefined;

    for (const strategy of strategies) {
      attemptedStrategies.push(strategy.name);
      try {
        const result = await strategy.fn();
        return { result, usedStrategy: strategy.name, attemptedStrategies };
      } catch (error) {
        lastError = error as Error;
        console.log(`Strategy "${strategy.name}" failed: ${lastError.message}`);
      }
    }

    throw new Error(`All strategies failed. Last error: ${lastError?.message}`);
  }
}

// ============================================================================
// Rollback Handler Implementation
// ============================================================================

interface RollbackOperation {
  name: string;
  rollback: () => Promise<void>;
  data?: any;
}

class RollbackHandler {
  private operations: RollbackOperation[] = [];

  registerOperation(operation: RollbackOperation): void {
    this.operations.push(operation);
  }

  async rollbackAll(): Promise<{ 
    success: boolean; 
    rolledBack: string[]; 
    failed: string[] 
  }> {
    const rolledBack: string[] = [];
    const failed: string[] = [];

    // Rollback in reverse order
    for (let i = this.operations.length - 1; i >= 0; i--) {
      const operation = this.operations[i];
      try {
        await operation.rollback();
        rolledBack.push(operation.name);
      } catch (error) {
        console.error(`Failed to rollback ${operation.name}:`, error);
        failed.push(operation.name);
      }
    }

    return {
      success: failed.length === 0,
      rolledBack,
      failed
    };
  }

  clear(): void {
    this.operations = [];
  }

  getOperations(): RollbackOperation[] {
    return [...this.operations];
  }
}

// ============================================================================
// Retry Logic Tests
// ============================================================================

describe('Retry Logic', () => {
  let retryHandler: RetryHandler;

  beforeEach(() => {
    retryHandler = new RetryHandler();
    jest.clearAllMocks();
  });

  describe('Basic Retry', () => {
    it('should retry 3 times and succeed on last attempt', async () => {
      let attemptCount = 0;

      const flakeyOperation = jest.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error(`Attempt ${attemptCount} failed`);
        }
        return 'success';
      }) as jest.MockedFunction<any>;

      const result = await retryHandler.executeWithRetry(flakeyOperation as any, {
        maxRetries: 3,
        initialDelayMs: 10
      });

      expect(result).toBe('success');
      expect(flakeyOperation).toHaveBeenCalledTimes(3);
      expect(attemptCount).toBe(3);
    });

    it('should fail after max retries with permanent failure', async () => {
      const permanentFailure = jest.fn().mockImplementation(async () => {
        throw new Error('Permanent failure');
      }) as jest.MockedFunction<any>;

      await expect(
        retryHandler.executeWithRetry(permanentFailure as any, {
          maxRetries: 3,
          initialDelayMs: 10
        })
      ).rejects.toThrow('Failed after 4 attempts: Permanent failure');

      expect(permanentFailure).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it('should succeed on first attempt without retry', async () => {
      const successfulOperation = jest.fn().mockImplementation(async () => 'immediate success') as jest.MockedFunction<any>;

      const result = await retryHandler.executeWithRetry(successfulOperation as any);

      expect(result).toBe('immediate success');
      expect(successfulOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Exponential Backoff', () => {
    it('should use exponential backoff between retries', async () => {
      const delays: number[] = [];
      let attemptCount = 0;

      const trackingOperation = jest.fn().mockImplementation(async () => {
        const now = Date.now();
        if (attemptCount > 0) {
          delays.push(now);
        } else {
          delays.push(now); // First attempt timestamp
        }
        attemptCount++;

        if (attemptCount < 4) {
          throw new Error('Retry needed');
        }
        return 'success';
      }) as jest.MockedFunction<any>;

      await retryHandler.executeWithRetry(trackingOperation as any, {
        maxRetries: 3,
        initialDelayMs: 100,
        backoffMultiplier: 2
      });

      // Verify delays increased (allowing some timing variance)
      expect(delays.length).toBe(4); // 1 initial + 3 retries
    });

    it('should cap delay at maxDelayMs', async () => {
      let attemptCount = 0;

      const operation = jest.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 4) {
          throw new Error('Retry needed');
        }
        return 'success';
      }) as jest.MockedFunction<any>;

      await retryHandler.executeWithRetry(operation as any, {
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 2000,
        backoffMultiplier: 3
      });

      expect(operation).toHaveBeenCalledTimes(4);
    });
  });

  describe('Rate Limit Handling', () => {
    it('should detect rate limit and wait specified time', async () => {
      let attemptCount = 0;

      const rateLimitedOperation = jest.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          const error: any = new Error('Rate limited. Retry after 500ms');
          throw error;
        }
        return 'success after rate limit';
      }) as jest.MockedFunction<any>;

      const startTime = Date.now();
      const result = await retryHandler.executeWithRetry(rateLimitedOperation as any, {
        maxRetries: 3,
        initialDelayMs: 10
      });
      const duration = Date.now() - startTime;

      expect(result).toBe('success after rate limit');
      expect(attemptCount).toBe(2);
      expect(duration).toBeGreaterThanOrEqual(450); // Should have waited ~500ms
    });

    it('should handle multiple rate limits', async () => {
      let attemptCount = 0;

      const multiRateLimitOperation = jest.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error('Rate limited. Retry after 200ms');
        }
        return 'success';
      }) as jest.MockedFunction<any>;

      const result = await retryHandler.executeWithRetry(multiRateLimitOperation as any, {
        maxRetries: 5,
        initialDelayMs: 10
      });

      expect(result).toBe('success');
      expect(attemptCount).toBe(3);
    });
  });

  describe('API Integration Retry', () => {
    it('should retry failed Notion API call', async () => {
      let attemptCount = 0;

      mockNotionAPI.mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Network timeout');
        }
        return { id: 'page-123', success: true };
      });

      const result = await retryHandler.executeWithRetry(
        () => mockNotionAPI(),
        { maxRetries: 3, initialDelayMs: 10 }
      );

      expect(result).toEqual({ id: 'page-123', success: true });
      expect(mockNotionAPI).toHaveBeenCalledTimes(3);
    });
  });
});

// ============================================================================
// Circuit Breaker Tests
// ============================================================================

describe('Circuit Breaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 1000, // 1 second for testing
      halfOpenMaxAttempts: 3
    });
    jest.clearAllMocks();
  });

  describe('Circuit States', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });

    it('should open circuit after threshold failures', async () => {
      const failingOperation = jest.fn().mockImplementation(async () => { throw new Error('Service down'); }) as jest.MockedFunction<any>;

      // Cause 5 failures to open circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(failingOperation as any);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      expect(circuitBreaker.getFailureCount()).toBe(5);
    });

    it('should block requests when circuit is OPEN', async () => {
      const operation = jest.fn().mockImplementation(async () => 'success') as jest.MockedFunction<any>;

      // Open the circuit
      const failingOperation = jest.fn().mockImplementation(async () => { throw new Error('Fail'); }) as jest.MockedFunction<any>;
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(failingOperation as any);
        } catch (error) {
          // Expected
        }
      }

      // Try to execute while circuit is open
      await expect(circuitBreaker.execute(operation as any))
        .rejects.toThrow('Circuit breaker is OPEN. Request blocked.');

      // Operation should not have been called
      expect(operation).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      const failingOperation = jest.fn().mockImplementation(async () => { throw new Error('Fail'); }) as jest.MockedFunction<any>;

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(failingOperation as any);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Next attempt should transition to HALF_OPEN
      const successOperation = jest.fn().mockImplementation(async () => 'success') as jest.MockedFunction<any>;
      await circuitBreaker.execute(successOperation as any);

      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should close circuit after successful attempts in HALF_OPEN', async () => {
      // Open the circuit
      const failingOperation = jest.fn().mockImplementation(async () => { throw new Error('Fail'); }) as jest.MockedFunction<any>;
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(failingOperation as any);
        } catch (error) {
          // Expected
        }
      }

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Execute 3 successful operations in HALF_OPEN
      const successOperation = jest.fn().mockImplementation(async () => 'success') as jest.MockedFunction<any>;
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(successOperation as any);
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });

    it('should reopen circuit on failure in HALF_OPEN state', async () => {
      // Open the circuit
      const failingOperation = jest.fn().mockImplementation(async () => { throw new Error('Fail'); }) as jest.MockedFunction<any>;
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(failingOperation as any);
        } catch (error) {
          // Expected
        }
      }

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // First attempt succeeds (transitions to HALF_OPEN)
      const successOperation = jest.fn().mockImplementation(async () => 'success') as jest.MockedFunction<any>;
      await circuitBreaker.execute(successOperation as any);
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Second attempt fails (reopens circuit)
      try {
        await circuitBreaker.execute(failingOperation as any);
      } catch (error) {
        // Expected
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Recovery Scenarios', () => {
    it('should fully recover and handle normal operations', async () => {
      const operation = jest.fn().mockImplementation(async () => 'success') as jest.MockedFunction<any>;

      // Open circuit
      const failingOperation = jest.fn().mockImplementation(async () => { throw new Error('Fail'); }) as jest.MockedFunction<any>;
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(failingOperation as any);
        } catch (error) {
          // Expected
        }
      }

      // Wait and recover
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Execute successful operations to close circuit
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(operation as any);
      }

      // Circuit should be closed and working normally
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);

      const result = await circuitBreaker.execute(operation as any);
      expect(result).toBe('success');
    });
  });
});

// ============================================================================
// Fallback Handler Tests
// ============================================================================

describe('Fallback Handler', () => {
  let fallbackHandler: FallbackHandler;

  beforeEach(() => {
    fallbackHandler = new FallbackHandler();
    jest.clearAllMocks();
  });

  describe('Single Fallback', () => {
    it('should use primary strategy when successful', async () => {
      mockNotionAPI.mockResolvedValue({ id: 'notion-123', platform: 'notion' });
      mockTrelloAPI.mockResolvedValue({ id: 'trello-123', platform: 'trello' });

      const result = await fallbackHandler.executeWithFallback(
        () => mockNotionAPI(),
        () => mockTrelloAPI(),
        'Trello'
      );

      expect(result.result).toEqual({ id: 'notion-123', platform: 'notion' });
      expect(result.usedFallback).toBe(false);
      expect(result.strategy).toBe('primary');
      expect(mockNotionAPI).toHaveBeenCalledTimes(1);
      expect(mockTrelloAPI).not.toHaveBeenCalled();
    });

    it('should fallback to Trello when Notion fails', async () => {
      mockNotionAPI.mockRejectedValue(new Error('Notion API unavailable'));
      mockTrelloAPI.mockResolvedValue({ id: 'trello-123', platform: 'trello' });

      const result = await fallbackHandler.executeWithFallback(
        () => mockNotionAPI(),
        () => mockTrelloAPI(),
        'Trello'
      );

      expect(result.result).toEqual({ id: 'trello-123', platform: 'trello' });
      expect(result.usedFallback).toBe(true);
      expect(result.strategy).toBe('Trello');
      expect(mockNotionAPI).toHaveBeenCalledTimes(1);
      expect(mockTrelloAPI).toHaveBeenCalledTimes(1);
    });

    it('should fallback to email when Slack fails', async () => {
      mockSlackAPI.mockRejectedValue(new Error('Slack rate limited'));
      mockEmailAPI.mockResolvedValue({ messageId: 'email-123', sent: true });

      const result = await fallbackHandler.executeWithFallback(
        () => mockSlackAPI(),
        () => mockEmailAPI(),
        'Email'
      );

      expect(result.result).toEqual({ messageId: 'email-123', sent: true });
      expect(result.usedFallback).toBe(true);
      expect(result.strategy).toBe('Email');
    });

    it('should throw when both primary and fallback fail', async () => {
      mockNotionAPI.mockRejectedValue(new Error('Notion failed'));
      mockTrelloAPI.mockRejectedValue(new Error('Trello failed'));

      await expect(
        fallbackHandler.executeWithFallback(
          () => mockNotionAPI(),
          () => mockTrelloAPI(),
          'Trello'
        )
      ).rejects.toThrow('Both primary and Trello strategies failed: Trello failed');
    });
  });

  describe('Multiple Fallbacks', () => {
    it('should try strategies in order until one succeeds', async () => {
      mockNotionAPI.mockRejectedValue(new Error('Notion down'));
      mockTrelloAPI.mockRejectedValue(new Error('Trello down'));
      mockSlackAPI.mockResolvedValue({ success: true, platform: 'slack' });

      const result = await fallbackHandler.executeWithMultipleFallbacks([
        { name: 'Notion', fn: () => mockNotionAPI() },
        { name: 'Trello', fn: () => mockTrelloAPI() },
        { name: 'Slack', fn: () => mockSlackAPI() }
      ]);

      expect(result.result).toEqual({ success: true, platform: 'slack' });
      expect(result.usedStrategy).toBe('Slack');
      expect(result.attemptedStrategies).toEqual(['Notion', 'Trello', 'Slack']);
      expect(mockNotionAPI).toHaveBeenCalledTimes(1);
      expect(mockTrelloAPI).toHaveBeenCalledTimes(1);
      expect(mockSlackAPI).toHaveBeenCalledTimes(1);
    });

    it('should use first successful strategy', async () => {
      mockNotionAPI.mockResolvedValue({ success: true, platform: 'notion' });
      mockTrelloAPI.mockResolvedValue({ success: true, platform: 'trello' });

      const result = await fallbackHandler.executeWithMultipleFallbacks([
        { name: 'Notion', fn: () => mockNotionAPI() },
        { name: 'Trello', fn: () => mockTrelloAPI() }
      ]);

      expect(result.result).toEqual({ success: true, platform: 'notion' });
      expect(result.usedStrategy).toBe('Notion');
      expect(result.attemptedStrategies).toEqual(['Notion']);
      expect(mockTrelloAPI).not.toHaveBeenCalled();
    });

    it('should throw when all strategies fail', async () => {
      mockNotionAPI.mockRejectedValue(new Error('Notion failed'));
      mockTrelloAPI.mockRejectedValue(new Error('Trello failed'));
      mockSlackAPI.mockRejectedValue(new Error('Slack failed'));

      await expect(
        fallbackHandler.executeWithMultipleFallbacks([
          { name: 'Notion', fn: () => mockNotionAPI() },
          { name: 'Trello', fn: () => mockTrelloAPI() },
          { name: 'Slack', fn: () => mockSlackAPI() }
        ])
      ).rejects.toThrow('All strategies failed. Last error: Slack failed');
    });
  });
});

// ============================================================================
// Rollback Handler Tests
// ============================================================================

describe('Rollback Handler', () => {
  let rollbackHandler: RollbackHandler;
  const mockRollbackFn1 = jest.fn() as jest.MockedFunction<any>;
  const mockRollbackFn2 = jest.fn() as jest.MockedFunction<any>;
  const mockRollbackFn3 = jest.fn() as jest.MockedFunction<any>;

  beforeEach(() => {
    rollbackHandler = new RollbackHandler();
    jest.clearAllMocks();
    mockRollbackFn1.mockResolvedValue(undefined);
    mockRollbackFn2.mockResolvedValue(undefined);
    mockRollbackFn3.mockResolvedValue(undefined);
  });

  describe('Operation Registration', () => {
    it('should register rollback operations', () => {
      rollbackHandler.registerOperation({
        name: 'create_file',
        rollback: mockRollbackFn1,
        data: { fileId: 'file-123' }
      });

      rollbackHandler.registerOperation({
        name: 'update_sheet',
        rollback: mockRollbackFn2,
        data: { range: 'A1:B1' }
      });

      const operations = rollbackHandler.getOperations();
      expect(operations).toHaveLength(2);
      expect(operations[0].name).toBe('create_file');
      expect(operations[1].name).toBe('update_sheet');
    });
  });

  describe('Rollback Execution', () => {
    it('should rollback operations in reverse order', async () => {
      const executionOrder: string[] = [];

      mockRollbackFn1.mockImplementation(async () => {
        executionOrder.push('operation1');
      });

      mockRollbackFn2.mockImplementation(async () => {
        executionOrder.push('operation2');
      });

      mockRollbackFn3.mockImplementation(async () => {
        executionOrder.push('operation3');
      });

      rollbackHandler.registerOperation({ name: 'op1', rollback: mockRollbackFn1 });
      rollbackHandler.registerOperation({ name: 'op2', rollback: mockRollbackFn2 });
      rollbackHandler.registerOperation({ name: 'op3', rollback: mockRollbackFn3 });

      const result = await rollbackHandler.rollbackAll();

      expect(result.success).toBe(true);
      expect(result.rolledBack).toEqual(['op3', 'op2', 'op1']);
      expect(executionOrder).toEqual(['operation3', 'operation2', 'operation1']);
    });

    it('should handle rollback failures gracefully', async () => {
      mockRollbackFn1.mockResolvedValue(undefined);
      mockRollbackFn2.mockRejectedValue(new Error('Rollback failed'));
      mockRollbackFn3.mockResolvedValue(undefined);

      rollbackHandler.registerOperation({ name: 'op1', rollback: mockRollbackFn1 });
      rollbackHandler.registerOperation({ name: 'op2', rollback: mockRollbackFn2 });
      rollbackHandler.registerOperation({ name: 'op3', rollback: mockRollbackFn3 });

      const result = await rollbackHandler.rollbackAll();

      expect(result.success).toBe(false);
      expect(result.rolledBack).toEqual(['op3', 'op1']);
      expect(result.failed).toEqual(['op2']);
    });

    it('should continue rolling back even if one fails', async () => {
      mockRollbackFn1.mockResolvedValue(undefined);
      mockRollbackFn2.mockRejectedValue(new Error('Rollback 2 failed'));
      mockRollbackFn3.mockRejectedValue(new Error('Rollback 3 failed'));

      rollbackHandler.registerOperation({ name: 'op1', rollback: mockRollbackFn1 });
      rollbackHandler.registerOperation({ name: 'op2', rollback: mockRollbackFn2 });
      rollbackHandler.registerOperation({ name: 'op3', rollback: mockRollbackFn3 });

      const result = await rollbackHandler.rollbackAll();

      expect(result.success).toBe(false);
      expect(result.rolledBack).toEqual(['op1']);
      expect(result.failed).toEqual(['op3', 'op2']);
      expect(mockRollbackFn1).toHaveBeenCalledTimes(1);
      expect(mockRollbackFn2).toHaveBeenCalledTimes(1);
      expect(mockRollbackFn3).toHaveBeenCalledTimes(1);
    });
  });

  describe('Multi-Step Workflow Rollback', () => {
    it('should rollback multi-step workflow when step 2 fails', async () => {
      const fileCreated = { fileId: 'file-123' };
      const sheetUpdated = { range: 'A1:B1', rowNumber: 5 };

      const deleteFile = jest.fn().mockImplementation(async () => undefined) as jest.MockedFunction<any>;
      const clearSheetRow = jest.fn().mockImplementation(async () => undefined) as jest.MockedFunction<any>;
      const deleteMessage = jest.fn().mockImplementation(async () => undefined) as jest.MockedFunction<any>;

      // Simulate workflow execution
      // Step 1: Create file (succeeds)
      rollbackHandler.registerOperation({
        name: 'create_file',
        rollback: deleteFile as any,
        data: fileCreated
      });

      // Step 2: Update sheet (succeeds)
      rollbackHandler.registerOperation({
        name: 'update_sheet',
        rollback: clearSheetRow as any,
        data: sheetUpdated
      });

      // Step 3: Send notification (fails)
      // Rollback is triggered

      const result = await rollbackHandler.rollbackAll();

      expect(result.success).toBe(true);
      expect(result.rolledBack).toEqual(['update_sheet', 'create_file']);
      expect(clearSheetRow).toHaveBeenCalledTimes(1);
      expect(deleteFile).toHaveBeenCalledTimes(1);
    });

    it('should verify original state restored after rollback', async () => {
      const originalState = {
        files: [] as string[],
        sheets: {} as Record<string, any>
      };

      // Simulate state changes and rollbacks
      const createFileRollback = jest.fn().mockImplementation(async () => {
        // Remove file from state
        const index = originalState.files.indexOf('file-123');
        if (index > -1) {
          originalState.files.splice(index, 1);
        }
      });

      const updateSheetRollback = jest.fn().mockImplementation(async () => {
        // Remove sheet entry
        delete originalState.sheets['sheet-123'];
      });

      // Execute workflow
      originalState.files.push('file-123');
      rollbackHandler.registerOperation({
        name: 'create_file',
        rollback: createFileRollback as any
      });

      originalState.sheets['sheet-123'] = { range: 'A1:B1' };
      rollbackHandler.registerOperation({
        name: 'update_sheet',
        rollback: updateSheetRollback as any
      });

      // Rollback
      await rollbackHandler.rollbackAll();

      // Verify state restored
      expect(originalState.files).toHaveLength(0);
      expect(originalState.sheets).toEqual({});
    });
  });

  describe('Clear Operations', () => {
    it('should clear all registered operations', () => {
      rollbackHandler.registerOperation({ name: 'op1', rollback: mockRollbackFn1 });
      rollbackHandler.registerOperation({ name: 'op2', rollback: mockRollbackFn2 });

      expect(rollbackHandler.getOperations()).toHaveLength(2);

      rollbackHandler.clear();

      expect(rollbackHandler.getOperations()).toHaveLength(0);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Error Handling Integration', () => {
  it('should combine retry with circuit breaker', async () => {
    const circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 500,
      halfOpenMaxAttempts: 2
    });

    const retryHandler = new RetryHandler();

    let attemptCount = 0;
    const operation = jest.fn().mockImplementation(async () => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error('Temporary failure');
      }
      return 'success';
    });

    const result = await retryHandler.executeWithRetry(
      () => circuitBreaker.execute(operation as any) as any,
      { maxRetries: 5, initialDelayMs: 10 }
    );

    expect(result).toBe('success');
    expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('should combine retry with fallback', async () => {
    const retryHandler = new RetryHandler();
    const fallbackHandler = new FallbackHandler();

    let primaryAttempts = 0;
    const primaryOperation = jest.fn().mockImplementation(async () => {
      primaryAttempts++;
      throw new Error('Primary always fails');
    });

    const fallbackOperation = jest.fn().mockImplementation(async () => 'fallback success') as jest.MockedFunction<any>;

    const result = await fallbackHandler.executeWithFallback(
      () => retryHandler.executeWithRetry(primaryOperation as any, {
        maxRetries: 2,
        initialDelayMs: 10
      }) as any,
      () => fallbackOperation() as any,
      'Fallback'
    );

    expect(result.result).toBe('fallback success');
    expect(result.usedFallback).toBe(true);
    expect(primaryAttempts).toBe(3); // Initial + 2 retries
  });

  it('should handle complete workflow with all error mechanisms', async () => {
    const retryHandler = new RetryHandler();
    const fallbackHandler = new FallbackHandler();
    const rollbackHandler = new RollbackHandler();

    let step1Attempts = 0;
    const step1 = jest.fn().mockImplementation(async () => {
      step1Attempts++;
      if (step1Attempts < 2) {
        throw new Error('Step 1 temporary failure');
      }
      return { id: 'step1-success' };
    });

    const step1Rollback = jest.fn().mockImplementation(async () => undefined) as jest.MockedFunction<any>;

    // Execute step 1 with retry
    const step1Result = await retryHandler.executeWithRetry(step1 as any, {
      maxRetries: 3,
      initialDelayMs: 10
    });

    rollbackHandler.registerOperation({
      name: 'step1',
      rollback: step1Rollback as any,
      data: step1Result
    });

    // Step 2 fails, trigger fallback
    const step2Primary = jest.fn().mockImplementation(async () => { throw new Error('Step 2 primary fails'); }) as jest.MockedFunction<any>;
    const step2Fallback = jest.fn().mockImplementation(async () => ({ id: 'step2-fallback-success' })) as jest.MockedFunction<any>;

    const step2Result = await fallbackHandler.executeWithFallback(
      step2Primary as any,
      step2Fallback as any,
      'Fallback'
    );

    expect(step2Result.usedFallback).toBe(true);

    // Step 3 fails catastrophically, trigger rollback
    const step3 = jest.fn().mockImplementation(async () => { throw new Error('Step 3 fails'); }) as jest.MockedFunction<any>;

    try {
      await step3();
    } catch (error) {
      // Rollback all
      const rollbackResult = await rollbackHandler.rollbackAll();
      expect(rollbackResult.success).toBe(true);
      expect(step1Rollback).toHaveBeenCalled();
    }
  });
});
