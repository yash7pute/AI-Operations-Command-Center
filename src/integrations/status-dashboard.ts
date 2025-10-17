/**
 * Status Dashboard
 * 
 * Collects and exposes real-time metrics from all integrations:
 * - Connection status
 * - Messages/events processed
 * - Errors encountered
 * - Last activity timestamps
 * - Queue sizes (retry queue)
 * - Circuit breaker states
 * 
 * Provides:
 * - getStatusData() for polling endpoint
 * - WebSocket server for real-time updates
 * - Periodic logging every 5 minutes
 */

import { EventEmitter } from 'events';
import logger from '../utils/logger';
import eventHub from './event-hub';
import manager from './manager';

export interface IntegrationMetrics {
  name: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error' | 'unknown';
  messagesProcessed: number;
  errorsEncountered: number;
  lastActivityAt: string | null; // ISO timestamp
  uptime: number; // seconds
  metadata?: Record<string, any>;
}

export interface QueueMetrics {
  size: number;
  pending: number;
  failed: number;
  succeeded: number;
  oldestItemAge?: number; // seconds
}

export interface CircuitBreakerMetrics {
  name: string;
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  successCount: number;
  lastStateChange: string | null;
}

export interface DashboardStatus {
  timestamp: string;
  uptime: number; // seconds since dashboard started
  integrations: IntegrationMetrics[];
  retryQueue: QueueMetrics;
  circuitBreakers: CircuitBreakerMetrics[];
  eventHub: {
    totalEvents: number;
    recentEvents: number; // last 5 minutes
    eventsBySource: Record<string, number>;
  };
  system: {
    memoryUsage: NodeJS.MemoryUsage;
    nodeVersion: string;
  };
}

class StatusDashboard extends EventEmitter {
  private startTime: number;
  private metrics: Map<string, IntegrationMetrics>;
  private circuitBreakers: Map<string, CircuitBreakerMetrics>;
  private eventCounts: Map<string, number>;
  private recentEventCount: number;
  private lastRecentReset: number;
  private loggingInterval: NodeJS.Timeout | null;
  private subscribers: Set<(status: DashboardStatus) => void>;

  constructor() {
    super();
    this.startTime = Date.now();
    this.metrics = new Map();
    this.circuitBreakers = new Map();
    this.eventCounts = new Map();
    this.recentEventCount = 0;
    this.lastRecentReset = Date.now();
    this.loggingInterval = null;
    this.subscribers = new Set();

    this.initializeMetrics();
    this.attachEventListeners();
  }

  private initializeMetrics() {
    // Initialize metrics for known integrations
    const integrations = ['gmail', 'slack', 'sheets', 'drive', 'notion', 'trello', 'composio'];
    integrations.forEach(name => {
      this.metrics.set(name, {
        name,
        status: 'unknown',
        messagesProcessed: 0,
        errorsEncountered: 0,
        lastActivityAt: null,
        uptime: 0,
      });
    });
  }

  private attachEventListeners() {
    // Listen to all events on EventHub to track activity
    eventHub.on('event', (event: any) => {
      this.trackEvent(event.source, event.type);
    });

    // Track service lifecycle events
    eventHub.on('service.started', (event: any) => {
      this.updateIntegrationStatus(event.source, 'connected');
    });

    eventHub.on('service.stopped', (event: any) => {
      this.updateIntegrationStatus(event.source, 'disconnected');
    });

    eventHub.on('service.reconnected', (event: any) => {
      this.updateIntegrationStatus(event.source, 'connected');
    });

    // Track errors
    eventHub.on('error', (event: any) => {
      this.trackError(event.source || 'unknown');
    });
  }

  private trackEvent(source: string, eventType: string) {
    // Update integration metrics
    const metric = this.metrics.get(source);
    if (metric) {
      metric.messagesProcessed += 1;
      metric.lastActivityAt = new Date().toISOString();
      this.metrics.set(source, metric);
    } else {
      // Create new metric for unknown integration
      this.metrics.set(source, {
        name: source,
        status: 'unknown',
        messagesProcessed: 1,
        errorsEncountered: 0,
        lastActivityAt: new Date().toISOString(),
        uptime: 0,
      });
    }

    // Update event counts
    const currentCount = this.eventCounts.get(source) || 0;
    this.eventCounts.set(source, currentCount + 1);
    this.recentEventCount += 1;

    // Emit update to subscribers
    this.notifySubscribers();
  }

  private trackError(source: string) {
    const metric = this.metrics.get(source);
    if (metric) {
      metric.errorsEncountered += 1;
      metric.lastActivityAt = new Date().toISOString();
      this.metrics.set(source, metric);
    }

    this.notifySubscribers();
  }

  private updateIntegrationStatus(source: string, status: IntegrationMetrics['status']) {
    const metric = this.metrics.get(source);
    if (metric) {
      metric.status = status;
      metric.lastActivityAt = new Date().toISOString();
      this.metrics.set(source, metric);
    }

    this.notifySubscribers();
  }

  /**
   * Register a circuit breaker for monitoring
   */
  registerCircuitBreaker(name: string, state: CircuitBreakerMetrics['state']) {
    this.circuitBreakers.set(name, {
      name,
      state,
      failureCount: 0,
      successCount: 0,
      lastStateChange: new Date().toISOString(),
    });
  }

  /**
   * Update circuit breaker state
   */
  updateCircuitBreaker(name: string, updates: Partial<CircuitBreakerMetrics>) {
    const breaker = this.circuitBreakers.get(name);
    if (breaker) {
      Object.assign(breaker, updates);
      if (updates.state) {
        breaker.lastStateChange = new Date().toISOString();
      }
      this.circuitBreakers.set(name, breaker);
      this.notifySubscribers();
    }
  }

  /**
   * Get retry queue metrics
   */
  private async getRetryQueueMetrics(): Promise<QueueMetrics> {
    try {
      // Import retry queue dynamically to avoid circular dependencies
      const retryQueue = require('../utils/retry-queue').default;
      const queue = retryQueue.getQueue();

      const pending = queue.filter((item: any) => item.attempts < 5).length;
      const failed = queue.filter((item: any) => item.attempts >= 5).length;

      let oldestItemAge: number | undefined;
      if (queue.length > 0) {
        const oldest = queue.reduce((prev: any, curr: any) => {
          return new Date(curr.createdAt) < new Date(prev.createdAt) ? curr : prev;
        });
        oldestItemAge = Math.floor((Date.now() - new Date(oldest.createdAt).getTime()) / 1000);
      }

      return {
        size: queue.length,
        pending,
        failed,
        succeeded: 0, // Would need to track this separately
        oldestItemAge,
      };
    } catch (err) {
      logger.warn('Failed to get retry queue metrics', err instanceof Error ? err.message : String(err));
      return { size: 0, pending: 0, failed: 0, succeeded: 0 };
    }
  }

  /**
   * Get current status data for dashboard
   */
  async getStatusData(): Promise<DashboardStatus> {
    // Sync with integration manager
    const managerStatus = manager.getStatusDashboard();
    for (const [name, status] of Object.entries(managerStatus)) {
      const metric = this.metrics.get(name);
      if (metric) {
        // Map manager status to our status type
        const mappedStatus = ['connected', 'disconnected', 'connecting', 'error'].includes(status)
          ? (status as IntegrationMetrics['status'])
          : 'unknown';
        metric.status = mappedStatus;
        metric.uptime = Math.floor((Date.now() - this.startTime) / 1000);
        this.metrics.set(name, metric);
      }
    }

    // Reset recent event count every 5 minutes
    const now = Date.now();
    if (now - this.lastRecentReset > 5 * 60 * 1000) {
      this.recentEventCount = 0;
      this.lastRecentReset = now;
    }

    const retryQueue = await this.getRetryQueueMetrics();

    return {
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      integrations: Array.from(this.metrics.values()),
      retryQueue,
      circuitBreakers: Array.from(this.circuitBreakers.values()),
      eventHub: {
        totalEvents: eventHub.getEventHistory().length,
        recentEvents: this.recentEventCount,
        eventsBySource: Object.fromEntries(this.eventCounts),
      },
      system: {
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
      },
    };
  }

  /**
   * Subscribe to real-time status updates (for WebSocket)
   */
  subscribe(callback: (status: DashboardStatus) => void) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Notify all subscribers of status change
   */
  private async notifySubscribers() {
    if (this.subscribers.size === 0) return;

    const status = await this.getStatusData();
    this.subscribers.forEach(callback => {
      try {
        callback(status);
      } catch (err) {
        logger.error('Subscriber callback failed', err instanceof Error ? err.message : String(err));
      }
    });
  }

  /**
   * Start periodic logging (every 5 minutes)
   */
  startPeriodicLogging(intervalMs = 5 * 60 * 1000) {
    if (this.loggingInterval) return; // Already started

    this.loggingInterval = setInterval(async () => {
      try {
        const status = await this.getStatusData();
        logger.info('Dashboard Status', {
          uptime: status.uptime,
          integrations: status.integrations.map(i => ({
            name: i.name,
            status: i.status,
            messagesProcessed: i.messagesProcessed,
            errors: i.errorsEncountered,
          })),
          retryQueue: status.retryQueue,
          eventHub: status.eventHub,
        });
      } catch (err) {
        logger.error('Failed to log dashboard status', err instanceof Error ? err.message : String(err));
      }
    }, intervalMs) as unknown as NodeJS.Timeout;

    logger.info('Dashboard periodic logging started', { intervalMs });
  }

  /**
   * Stop periodic logging
   */
  stopPeriodicLogging() {
    if (this.loggingInterval) {
      clearInterval(this.loggingInterval);
      this.loggingInterval = null;
      logger.info('Dashboard periodic logging stopped');
    }
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset() {
    this.metrics.clear();
    this.circuitBreakers.clear();
    this.eventCounts.clear();
    this.recentEventCount = 0;
    this.initializeMetrics();
  }
}

// Singleton instance
const dashboard = new StatusDashboard();

// Start periodic logging by default (can be disabled if needed)
dashboard.startPeriodicLogging();

/**
 * HTTP endpoint handler for polling
 * Usage with Express:
 *   app.get('/api/status', async (req, res) => {
 *     const status = await getStatusForPolling();
 *     res.json(status);
 *   });
 */
export async function getStatusForPolling(): Promise<DashboardStatus> {
  return dashboard.getStatusData();
}

/**
 * WebSocket handler for real-time updates
 * Usage with ws library:
 *   import WebSocket from 'ws';
 *   const wss = new WebSocket.Server({ port: 8080 });
 *   wss.on('connection', (ws) => {
 *     attachWebSocketHandler(ws);
 *   });
 */
export function attachWebSocketHandler(ws: any) {
  // Send initial status
  dashboard.getStatusData().then(status => {
    ws.send(JSON.stringify({ type: 'status', data: status }));
  });

  // Subscribe to updates
  const unsubscribe = dashboard.subscribe((status) => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(JSON.stringify({ type: 'status', data: status }));
    }
  });

  // Cleanup on disconnect
  ws.on('close', () => {
    unsubscribe();
  });

  // Send heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'ping' }));
    } else {
      clearInterval(heartbeat);
    }
  }, 30000);

  ws.on('close', () => clearInterval(heartbeat));
}

/**
 * Expose dashboard instance for advanced usage
 */
export { dashboard };

export default dashboard;
