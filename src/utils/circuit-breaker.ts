import logger from './logger';

type State = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitOptions {
  failureThreshold?: number; // failures to open
  successThreshold?: number; // successes in half-open to close
  timeoutMs?: number; // how long to stay open before trying half-open
  cacheTtlMs?: number; // cached value TTL while open
}

interface CacheEntry {
  value: any;
  expiresAt: number;
}

class CircuitBreaker {
  private name: string;
  private state: State = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private openedAt: number | null = null;
  private options: Required<CircuitOptions>;
  private cache: CacheEntry | null = null;

  constructor(name: string, opts: CircuitOptions = {}) {
    this.name = name;
    this.options = {
      failureThreshold: opts.failureThreshold ?? 5,
      successThreshold: opts.successThreshold ?? 2,
      timeoutMs: opts.timeoutMs ?? 60_000,
      cacheTtlMs: opts.cacheTtlMs ?? 30_000,
    };
  }

  private transitionTo(newState: State, reason?: string) {
    if (this.state === newState) return;
    logger.info('Circuit state change', { name: this.name, from: this.state, to: newState, reason });
    this.state = newState;
    if (newState === 'OPEN') {
      this.openedAt = Date.now();
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === 'CLOSED') {
      this.failureCount = 0;
      this.successCount = 0;
      this.openedAt = null;
    } else if (newState === 'HALF_OPEN') {
      this.successCount = 0;
      this.failureCount = 0;
    }
  }

  private isTimeoutExceeded() {
    if (!this.openedAt) return false;
    return (Date.now() - this.openedAt) >= this.options.timeoutMs;
  }

  async call<T>(fn: () => Promise<T>, fallback?: () => Promise<T> | T): Promise<T> {
    // If OPEN, check timeout to transition to HALF_OPEN or return cached/fallback
    if (this.state === 'OPEN') {
      if (this.isTimeoutExceeded()) {
        this.transitionTo('HALF_OPEN', 'timeout-exceeded');
      } else {
        logger.warn('Circuit is OPEN - returning cached/fallback', { name: this.name });
        if (this.cache && Date.now() < this.cache.expiresAt) return this.cache.value as T;
        if (fallback) return await Promise.resolve(fallback());
        throw new Error(`Circuit ${this.name} is OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess(result);
      return result;
    } catch (err: any) {
      await this.onFailure(err, fallback);
      // onFailure either throws or returns fallback result
      if (fallback) return await Promise.resolve(fallback());
      throw err;
    }
  }

  private onSuccess(result?: any) {
    if (this.state === 'HALF_OPEN') {
      this.successCount += 1;
      if (this.successCount >= this.options.successThreshold) {
        this.transitionTo('CLOSED', 'half-open-success-threshold');
      }
    } else if (this.state === 'OPEN') {
      // ignore successes in OPEN
    } else {
      // CLOSED
      this.failureCount = 0;
    }
  }

  private async onFailure(err: any, fallback?: () => Promise<any> | any) {
    logger.warn('Circuit call failed', { name: this.name, error: err?.message || String(err) });
    if (this.state === 'HALF_OPEN') {
      // move back to OPEN
      this.transitionTo('OPEN', 'half-open-failure');
      // cache fallback if provided
      if (fallback) {
        const value = await Promise.resolve(fallback());
        this.cache = { value, expiresAt: Date.now() + this.options.cacheTtlMs };
      }
      return;
    }

    if (this.state === 'CLOSED') {
      this.failureCount += 1;
      if (this.failureCount >= this.options.failureThreshold) {
        this.transitionTo('OPEN', 'failure-threshold-exceeded');
        // if fallback available, cache result
        if (fallback) {
          try {
            const value = await Promise.resolve(fallback());
            this.cache = { value, expiresAt: Date.now() + this.options.cacheTtlMs };
          } catch (e) {
            // ignore fallback failure
          }
        }
      }
    }
  }

  getState() {
    // attempt automatic transition from OPEN to HALF_OPEN if timeout passed
    if (this.state === 'OPEN' && this.isTimeoutExceeded()) {
      this.transitionTo('HALF_OPEN', 'auto-timeout');
    }
    return this.state;
  }
}

export function createCircuitBreaker(name: string, options?: CircuitOptions) {
  return new CircuitBreaker(name, options);
}

export default { createCircuitBreaker };
