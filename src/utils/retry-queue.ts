import fs from 'fs';
import path from 'path';
import logger from './logger';

type OperationType = string;

interface FailedOperation {
  id: string;
  type: OperationType;
  params: any;
  attempts: number;
  lastError?: string;
  timestamp: number; // created timestamp
  nextAttemptAt: number; // epoch ms when to retry next
}

interface RetryStats {
  attempted: number;
  succeeded: number;
  failed: number;
  removed: number; // removed due to max attempts
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'retry-queue.json');
const FAILED_LOG = path.resolve(process.cwd(), 'logs', 'failed-operations.log');

ensureDirs();

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const logsDir = path.resolve(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
}

const FIXED_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

class RetryQueue {
  private handlers: Map<OperationType, (params: any) => Promise<any>> = new Map();
  private queue: FailedOperation[] = [];
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor() {
    this.loadQueue();
    // run immediately then every 5 minutes
    this.start();
  }

  registerHandler(type: OperationType, handler: (params: any) => Promise<any>) {
    this.handlers.set(type, handler);
  }

  enqueue(op: { id?: string; type: OperationType; params: any }) {
    const id = op.id || `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    const now = Date.now();
    const fo: FailedOperation = { id, type: op.type, params: op.params, attempts: 0, timestamp: now, nextAttemptAt: now };
    this.queue.push(fo);
    this.saveQueue();
    logger.info('Enqueued failed operation', { id: fo.id, type: fo.type });
    return fo.id;
  }

  async processQueue(): Promise<RetryStats> {
    if (this.running) {
      logger.info('Retry queue already running, skipping invocation');
      return { attempted: 0, succeeded: 0, failed: 0, removed: 0 };
    }
    this.running = true;
    let attempted = 0;
    let succeeded = 0;
    let failed = 0;
    let removed = 0;

    try {
      const now = Date.now();
      // clone list to iterate safely
      const due = this.queue.filter((q) => q.nextAttemptAt <= now);
      for (const item of due) {
        attempted += 1;
        const handler = this.handlers.get(item.type);
        if (!handler) {
          logger.warn('No handler registered for queued operation type', { type: item.type, id: item.id });
          // increment attempts and schedule next
          item.attempts += 1;
          item.lastError = `No handler for type ${item.type}`;
          this.scheduleNext(item);
          failed += 1;
          continue;
        }

        try {
          await handler(item.params);
          // success -> remove from queue
          this.queue = this.queue.filter((q) => q.id !== item.id);
          succeeded += 1;
          logger.info('Retried operation succeeded', { id: item.id, type: item.type });
        } catch (err: any) {
          item.attempts += 1;
          item.lastError = err?.message || String(err);
          logger.warn('Retried operation failed', { id: item.id, type: item.type, attempts: item.attempts, error: item.lastError });
          if (item.attempts >= FIXED_RETRY_DELAYS_MS.length) {
            // remove and log final failure
            this.queue = this.queue.filter((q) => q.id !== item.id);
            removed += 1;
            this.logFinalFailure(item);
          } else {
            this.scheduleNext(item);
            failed += 1;
          }
        }
      }
      this.saveQueue();
      return { attempted, succeeded, failed, removed };
    } finally {
      this.running = false;
    }
  }

  private scheduleNext(item: FailedOperation) {
    const idx = Math.min(item.attempts, FIXED_RETRY_DELAYS_MS.length) - 1; // attempts starts at 1 after increment
    const delay = FIXED_RETRY_DELAYS_MS[Math.max(0, idx)];
    item.nextAttemptAt = Date.now() + delay;
    // persist
    this.saveQueue();
    logger.info('Scheduled next retry', { id: item.id, nextAttemptAt: new Date(item.nextAttemptAt).toISOString(), attempts: item.attempts });
  }

  private logFinalFailure(item: FailedOperation) {
    try {
      const record = { ...item, failedAt: new Date().toISOString() };
      fs.appendFileSync(FAILED_LOG, JSON.stringify(record) + '\n');
      logger.error('Operation removed after max retry attempts', { id: item.id, type: item.type });
    } catch (err: any) {
      logger.error('Failed to write final failure log', err?.message || String(err));
    }
  }

  private loadQueue() {
    try {
      if (!fs.existsSync(QUEUE_FILE)) {
        this.queue = [];
        return;
      }
      const raw = fs.readFileSync(QUEUE_FILE, 'utf8');
      this.queue = JSON.parse(raw) as FailedOperation[];
    } catch (err: any) {
      logger.error('Failed to load retry queue from disk', err?.message || String(err));
      this.queue = [];
    }
  }

  private saveQueue() {
    try {
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(this.queue, null, 2), { encoding: 'utf8' });
    } catch (err: any) {
      logger.error('Failed to persist retry queue', err?.message || String(err));
    }
  }

  start() {
    // run immediately
    this.processQueue().catch((e) => logger.warn('Initial retry queue run failed', e?.message || String(e)));
    // schedule every 5 minutes
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.processQueue().then((stats) => logger.info('Periodic retry-queue run', stats)).catch((e) => logger.warn('Periodic retry-queue error', e?.message || String(e)));
    }, 5 * 60 * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // processQueue is implemented above and returns RetryStats

  getQueue() {
    return this.queue.slice();
  }

  stats() {
    const total = this.queue.length;
    const pending = this.queue.filter((q) => q.nextAttemptAt > Date.now()).length;
    return { total, pending };
  }
}

const retryQueue = new RetryQueue();

export default retryQueue;
