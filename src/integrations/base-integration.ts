import logger from '../utils/logger';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export abstract class BaseIntegration<TClient = any> {
  protected client: TClient | null = null;
  protected status: ConnectionStatus = 'disconnected';
  private lastRequestTs = 0;
  private minIntervalMs: number; // rate limit minimum interval between requests

  constructor(minIntervalMs = 0) {
    this.minIntervalMs = minIntervalMs;
  }

  abstract connect(...args: any[]): Promise<TClient>;
  abstract disconnect(): Promise<void>;

  isConnected(): boolean {
    return this.status === 'connected' && this.client !== null;
  }

  protected async withRetry<R>(fn: () => Promise<R>, attempts = 3): Promise<R> {
    let attempt = 0;
    let lastErr: unknown;
    while (attempt < attempts) {
      try {
        attempt += 1;
        this.status = 'connecting';
        const res = await fn();
        this.status = 'connected';
        return res;
      } catch (err) {
        lastErr = err;
        this.status = 'error';
        const delayMs = 1000 * Math.pow(2, attempt - 1); // 1s,2s,4s
        logger.warn(`Attempt ${attempt} failed, retrying in ${delayMs}ms`, err instanceof Error ? err.message : String(err));
        await this.delay(delayMs);
      }
    }
    logger.error('All retry attempts failed', lastErr instanceof Error ? lastErr.message : String(lastErr));
    throw lastErr;
  }

  // Generic retry wrapper callable by subclasses
  async retry<R>(fn: () => Promise<R>): Promise<R> {
    try {
      return await this.withRetry(fn, 3);
    } catch (err) {
      // bubble up
      throw err;
    }
  }

  protected async delay(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  // Simple rate limiter: ensures at least minIntervalMs between requests
  protected async rateLimit() {
    if (this.minIntervalMs <= 0) return;
    const now = Date.now();
    const elapsed = now - this.lastRequestTs;
    if (elapsed < this.minIntervalMs) {
      await this.delay(this.minIntervalMs - elapsed);
    }
    this.lastRequestTs = Date.now();
  }
}
