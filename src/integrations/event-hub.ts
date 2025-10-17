import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

export type EventPriority = 'low' | 'normal' | 'high';

export interface HubEvent {
  source: string;
  type: string;
  timestamp: string; // ISO
  data: any;
  metadata?: Record<string, any>;
  priority?: EventPriority;
}

const EVENT_LOG_PATH = path.resolve(process.cwd(), 'logs', 'events.log');
ensureLogDir();

function ensureLogDir() {
  const dir = path.resolve(process.cwd(), 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

class EventHub extends EventEmitter {
  private queue: HubEvent[] = [];
  private processing = false;
  private history: HubEvent[] = [];
  private maxHistory = 1000;

  subscribe(eventType: string, handler: (e: HubEvent) => void) {
    this.on(eventType, handler);
    return () => this.off(eventType, handler);
  }

  async emitEvent(event: Omit<HubEvent, 'timestamp'>) {
    const hubEvent: HubEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    // enqueue for burst handling
    this.queue.push(hubEvent);
    this.history.push(hubEvent);
    if (this.history.length > this.maxHistory) this.history.shift();
    // append to file log asynchronously
    try {
      fs.appendFile(EVENT_LOG_PATH, JSON.stringify(hubEvent) + '\n', (err) => {
        if (err) logger.error('Failed to write event log', err instanceof Error ? err.message : String(err));
      });
    } catch (err: any) {
      logger.error('Failed to append event to log', err?.message || String(err));
    }

    this.processQueue().catch((e) => logger.warn('Event queue processing failed', e?.message || String(e)));
    return hubEvent;
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length) {
        const batch = this.consumeBatch();
        await Promise.all(batch.map((e) => this.dispatch(e)));
        // small throttle between batches
        await new Promise((r) => setTimeout(r, 50));
      }
    } finally {
      this.processing = false;
    }
  }

  private consumeBatch(batchSize = 25) {
    const items = this.queue.splice(0, batchSize);
    // sort by priority: high first
    items.sort((a, b) => priorityValue(b.priority) - priorityValue(a.priority));
    return items;
  }

  private async dispatch(e: HubEvent) {
    try {
      // Emit typed event and a generic 'event' channel
      this.emit(e.type, e);
      this.emit('event', e);
      logger.info('Event emitted', { source: e.source, type: e.type, priority: e.priority || 'normal' });
    } catch (err: any) {
      logger.error('Failed to dispatch event', { error: err?.message || String(err), event: e });
    }
  }

  getEventHistory(source?: string, limit = 50) {
    let items = this.history.slice().reverse();
    if (source) items = items.filter((i) => i.source === source);
    return items.slice(0, limit);
  }

  filterEvents(opts: { source?: string; minPriority?: EventPriority } = {}) {
    const { source, minPriority } = opts;
    const minVal = priorityValue(minPriority || 'low');
    return this.history.filter((h) => (source ? h.source === source : true) && priorityValue(h.priority) >= minVal);
  }
}

function priorityValue(p?: EventPriority) {
  switch (p) {
    case 'high':
      return 3;
    case 'normal':
      return 2;
    default:
      return 1;
  }
}

const hub = new EventHub();

// Aggregation wiring helpers
// Integrations can import `hub` and call hub.emitEvent({ source: 'gmail', type: 'message.received', data: {...} })

export default hub;
