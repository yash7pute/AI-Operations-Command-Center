import fs from 'fs';
import path from 'path';
import os from 'os';
import logger from './logger';
import manager from '../integrations/manager';

export type ServiceStatusMap = Record<string, string>;

interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: ServiceStatusMap;
  disk: { path: string; sizeBytes: number; status: 'ok' | 'degraded' | 'unhealthy' };
  memory: { rss: number; heapUsed: number; status: 'ok' | 'degraded' | 'unhealthy' };
  timestamp: string;
  details?: any;
}

let lastReport: HealthReport | null = null;

const LOGS_DIR = path.resolve(process.cwd(), 'logs');
const HEALTH_LOG_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const CHECK_TIMEOUT_MS = 8_000; // 8s default timeout for checks

function sizeofDir(dir: string): number {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  const items = fs.readdirSync(dir);
  for (const it of items) {
    try {
      const p = path.join(dir, it);
      const s = fs.statSync(p);
      if (s.isFile()) total += s.size;
      else if (s.isDirectory()) total += sizeofDir(p);
    } catch (e) {
      // ignore
    }
  }
  return total;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error('health-check-timeout')), ms);
  });
  try {
    const res = await Promise.race([p, timeout]);
    return res as T;
  } finally {
    clearTimeout(timer!);
  }
}

export async function runHealthCheck(timeoutMs = CHECK_TIMEOUT_MS): Promise<HealthReport> {
  const start = Date.now();
  // run service checks via manager.healthCheck()
  let services: ServiceStatusMap = {};
  try {
    services = await withTimeout(Promise.resolve(manager.healthCheck()), timeoutMs) as ServiceStatusMap;
  } catch (err: any) {
    logger.warn('Service health check failed or timed out', err?.message || String(err));
    // fallback to dashboard statuses if possible
    try {
      services = manager.getStatusDashboard();
    } catch (e) {
      services = { manager: 'unknown' };
    }
  }

  // disk: compute logs directory size and classify
  const logsSize = sizeofDir(LOGS_DIR);
  // thresholds: degraded 200MB, unhealthy 500MB
  const degradedThreshold = 200 * 1024 * 1024;
  const unhealthyThreshold = 500 * 1024 * 1024;
  let diskStatus: HealthReport['disk']['status'] = 'ok';
  if (logsSize >= unhealthyThreshold) diskStatus = 'unhealthy';
  else if (logsSize >= degradedThreshold) diskStatus = 'degraded';

  // memory checks
  const mem = process.memoryUsage();
  const rss = mem.rss;
  const heapUsed = mem.heapUsed;
  // thresholds in bytes
  const memDegraded = 1.2 * 1024 * 1024 * 1024; // 1.2GB
  const memUnhealthy = 1.5 * 1024 * 1024 * 1024; // 1.5GB
  let memoryStatus: HealthReport['memory']['status'] = 'ok';
  if (rss >= memUnhealthy) memoryStatus = 'unhealthy';
  else if (rss >= memDegraded) memoryStatus = 'degraded';

  // evaluate overall
  const serviceFailures = Object.values(services).filter((v) => v !== 'connected').length;
  let overall: HealthReport['status'] = 'healthy';
  if (diskStatus === 'unhealthy' || memoryStatus === 'unhealthy') overall = 'unhealthy';
  else if (serviceFailures > 0 || diskStatus === 'degraded' || memoryStatus === 'degraded') overall = 'degraded';

  const report: HealthReport = {
    status: overall,
    services,
    disk: { path: LOGS_DIR, sizeBytes: logsSize, status: diskStatus },
    memory: { rss, heapUsed, status: memoryStatus },
    timestamp: new Date().toISOString(),
    details: { runtimeMs: Date.now() - start },
  };

  lastReport = report;
  logger.info('Health check', { status: report.status, services: report.services, disk: report.disk, memory: report.memory });
  return report;
}

// schedule periodic logging
setInterval(() => {
  runHealthCheck().then((r) => logger.info('Periodic health report', { status: r.status, timestamp: r.timestamp })).catch((e) => logger.warn('Periodic health check failed', e?.message || String(e)));
}, HEALTH_LOG_INTERVAL_MS);

export function getHealthStatus(): HealthReport | null {
  return lastReport;
}

// also run once on module load
runHealthCheck().catch((e) => logger.warn('Initial health check failed', e?.message || String(e)));

export default { runHealthCheck, getHealthStatus };
