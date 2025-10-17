import logger from '../utils/logger';
import eventHub from './event-hub';

type ServiceName = 'gmail' | 'slack' | 'sheets' | 'drive' | 'composio';

interface ServiceHandle {
  name: ServiceName;
  start?: () => Promise<void> | void;
  stop?: () => Promise<void> | void;
  health?: () => Promise<boolean> | boolean;
}

class IntegrationManager {
  private services: Record<string, ServiceHandle> = {};
  private status: Record<string, string> = {};
  private reconnectIntervalMs = 10_000;
  private reconnectTimers: Record<string, NodeJS.Timeout | null> = {};

  register(service: ServiceHandle) {
    this.services[service.name] = service;
    this.status[service.name] = 'stopped';
  }

  async startAll() {
    logger.info('Starting all integrations');
    const starts = Object.values(this.services).map(async (s) => {
      try {
        if (s.start) await Promise.resolve(s.start());
        this.status[s.name] = 'connected';
        eventHub.emitEvent({ source: s.name, type: 'service.started', data: {}, metadata: {} });
        logger.info('Started service', { service: s.name });
      } catch (err: any) {
        this.status[s.name] = 'error';
        logger.error('Failed to start service', { service: s.name, error: err?.message || String(err) });
        this.scheduleReconnect(s.name);
      }
    });
    await Promise.all(starts);
  }

  async stopAll() {
    logger.info('Stopping all integrations');
    const stops = Object.values(this.services).map(async (s) => {
      try {
        if (s.stop) await Promise.resolve(s.stop());
        this.status[s.name] = 'stopped';
        eventHub.emitEvent({ source: s.name, type: 'service.stopped', data: {}, metadata: {} });
        logger.info('Stopped service', { service: s.name });
      } catch (err: any) {
        logger.warn('Failed to stop service cleanly', { service: s.name, error: err?.message || String(err) });
        this.status[s.name] = 'error';
      }
    });
    await Promise.all(stops);
  }

  async healthCheck() {
    const results: Record<string, string> = {};
    await Promise.all(Object.values(this.services).map(async (s) => {
      try {
        if (s.health) {
          const ok = await Promise.resolve(s.health());
          results[s.name] = ok ? 'connected' : 'disconnected';
          this.status[s.name] = ok ? 'connected' : 'disconnected';
        } else {
          results[s.name] = this.status[s.name] || 'unknown';
        }
      } catch (err: any) {
        results[s.name] = 'error';
        this.status[s.name] = 'error';
      }
    }));
    return results;
  }

  getStatusDashboard() {
    return { ...this.status };
  }

  private scheduleReconnect(serviceName: string) {
    if (this.reconnectTimers[serviceName]) return; // already scheduled
    logger.info('Scheduling reconnect', { service: serviceName, waitMs: this.reconnectIntervalMs });
    this.reconnectTimers[serviceName] = setTimeout(async () => {
      try {
        const s = this.services[serviceName];
        if (!s) return;
        if (s.start) await Promise.resolve(s.start());
        this.status[serviceName] = 'connected';
        logger.info('Reconnected service', { service: serviceName });
        eventHub.emitEvent({ source: serviceName, type: 'service.reconnected', data: {}, metadata: {} });
      } catch (err: any) {
        logger.warn('Reconnect attempt failed', { service: serviceName, error: err?.message || String(err) });
        this.reconnectTimers[serviceName] = null;
        // schedule again
        this.scheduleReconnect(serviceName);
      }
    }, this.reconnectIntervalMs) as unknown as NodeJS.Timeout;
  }
}

const manager = new IntegrationManager();

// Example: integrations should register themselves on import. The manager is available for app-level control.
export default manager;
