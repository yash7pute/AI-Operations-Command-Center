/**
 * Health Check System
 * 
 * Monitors health of all integration executors:
 * - Periodic health checks (every 5 minutes)
 * - Simple read tests per integration
 * - Latency measurement
 * - Status tracking (up/down)
 * - Overall health aggregation
 * - Event emission on degradation
 * - Health status change logging
 * - Historical health tracking
 */

import { EventEmitter } from 'events';
import logger from '../utils/logger';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Health status
 */
export enum HealthStatus {
  UP = 'up',
  DOWN = 'down',
  DEGRADED = 'degraded',
  UNKNOWN = 'unknown'
}

/**
 * Overall health
 */
export enum OverallHealth {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy'
}

/**
 * Executor type
 */
export enum ExecutorType {
  NOTION = 'notion',
  TRELLO = 'trello',
  SLACK = 'slack',
  GMAIL = 'gmail',
  DRIVE = 'drive',
  SHEETS = 'sheets',
  GOOGLE_TASKS = 'google-tasks'
}

/**
 * Health check result for single executor
 */
export interface ExecutorHealth {
  /**
   * Executor name
   */
  executor: ExecutorType;

  /**
   * Health status
   */
  status: HealthStatus;

  /**
   * Latency in milliseconds
   */
  latency: number;

  /**
   * Last check timestamp
   */
  lastCheck: string;

  /**
   * Error message (if down)
   */
  error?: string;

  /**
   * Last successful check
   */
  lastSuccess?: string;

  /**
   * Consecutive failures
   */
  consecutiveFailures?: number;

  /**
   * Additional metadata
   */
  metadata?: {
    [key: string]: any;
  };
}

/**
 * Overall health status
 */
export interface HealthReport {
  /**
   * Overall health
   */
  overall: OverallHealth;

  /**
   * Timestamp
   */
  timestamp: string;

  /**
   * Executors health
   */
  executors: {
    [key in ExecutorType]?: ExecutorHealth;
  };

  /**
   * Summary
   */
  summary: {
    total: number;
    up: number;
    down: number;
    degraded: number;
    unknown: number;
  };
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  /**
   * Enable health checks
   */
  enabled: boolean;

  /**
   * Check interval (ms)
   */
  checkInterval: number;

  /**
   * Timeout per check (ms)
   */
  checkTimeout: number;

  /**
   * Failure threshold for degraded status
   */
  degradedThreshold: number;

  /**
   * Failure threshold for unhealthy status
   */
  unhealthyThreshold: number;

  /**
   * Consecutive failures before marking as down
   */
  consecutiveFailureThreshold: number;

  /**
   * Enable auto-recovery checks
   */
  enableAutoRecovery: boolean;

  /**
   * Executors to monitor
   */
  executors: ExecutorType[];

  /**
   * Test configurations per executor
   */
  testConfigs: {
    [key in ExecutorType]?: any;
  };
}

/**
 * Health events
 */
export interface HealthEvents {
  /**
   * Health check completed
   */
  'health:checked': (report: HealthReport) => void;

  /**
   * Health degraded
   */
  'health:degraded': (report: HealthReport) => void;

  /**
   * Health unhealthy
   */
  'health:unhealthy': (report: HealthReport) => void;

  /**
   * Health recovered
   */
  'health:recovered': (report: HealthReport) => void;

  /**
   * Executor status changed
   */
  'executor:status_changed': (executor: ExecutorType, oldStatus: HealthStatus, newStatus: HealthStatus) => void;

  /**
   * Executor down
   */
  'executor:down': (executor: ExecutorType, error: string) => void;

  /**
   * Executor recovered
   */
  'executor:recovered': (executor: ExecutorType) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default configuration
 */
const DEFAULT_CONFIG: HealthCheckConfig = {
  enabled: process.env.HEALTH_CHECKS_ENABLED !== 'false',
  checkInterval: 5 * 60 * 1000, // 5 minutes
  checkTimeout: 10000, // 10 seconds
  degradedThreshold: 1, // 1 executor down = degraded
  unhealthyThreshold: 3, // 3 executors down = unhealthy
  consecutiveFailureThreshold: 3,
  enableAutoRecovery: true,
  executors: [
    ExecutorType.NOTION,
    ExecutorType.TRELLO,
    ExecutorType.SLACK,
    ExecutorType.GMAIL,
    ExecutorType.DRIVE,
    ExecutorType.SHEETS,
    ExecutorType.GOOGLE_TASKS
  ],
  testConfigs: {
    [ExecutorType.NOTION]: {
      testDatabase: process.env.NOTION_TEST_DATABASE_ID || 'test-db',
      operation: 'query'
    },
    [ExecutorType.TRELLO]: {
      operation: 'listBoards'
    },
    [ExecutorType.SLACK]: {
      testChannel: process.env.SLACK_TEST_CHANNEL || '#health-checks',
      operation: 'postMessage'
    },
    [ExecutorType.GMAIL]: {
      operation: 'listLabels'
    },
    [ExecutorType.DRIVE]: {
      operation: 'listRoot'
    },
    [ExecutorType.SHEETS]: {
      testSpreadsheet: process.env.SHEETS_TEST_SPREADSHEET_ID || 'test-sheet',
      testCell: 'A1',
      operation: 'readCell'
    },
    [ExecutorType.GOOGLE_TASKS]: {
      operation: 'listTaskLists'
    }
  }
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

/**
 * Event emitter
 */
const eventEmitter = new EventEmitter();

/**
 * Current configuration
 */
let currentConfig: HealthCheckConfig = { ...DEFAULT_CONFIG };

/**
 * Check interval timer
 */
let checkIntervalTimer: NodeJS.Timeout | null = null;

/**
 * Current health status
 */
let currentHealth: HealthReport | null = null;

/**
 * Previous health status (for change detection)
 */
let previousHealth: HealthReport | null = null;

/**
 * Executor health history
 */
const healthHistory = new Map<ExecutorType, ExecutorHealth[]>();

/**
 * Running flag
 */
let isRunning = false;

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Check health of all executors
 */
export async function checkHealth(): Promise<HealthReport> {
  if (!currentConfig.enabled) {
    logger.warn('Health checks are disabled');
    return createEmptyReport();
  }

  logger.info('Starting health checks');

  const timestamp = new Date().toISOString();
  const executors: { [key in ExecutorType]?: ExecutorHealth } = {};

  // Run health checks for all configured executors
  const checkPromises = currentConfig.executors.map(async (executor) => {
    try {
      const health = await checkExecutorHealth(executor);
      executors[executor] = health;

      // Update history
      updateHealthHistory(executor, health);

      // Detect status changes
      if (currentHealth?.executors[executor]) {
        const oldStatus = currentHealth.executors[executor]!.status;
        const newStatus = health.status;

        if (oldStatus !== newStatus) {
          eventEmitter.emit('executor:status_changed', executor, oldStatus, newStatus);

          logger.info('Executor status changed', {
            executor,
            oldStatus,
            newStatus,
            latency: health.latency
          });

          // Emit specific events
          if (newStatus === HealthStatus.DOWN) {
            eventEmitter.emit('executor:down', executor, health.error || 'Unknown error');
          } else if (oldStatus === HealthStatus.DOWN && newStatus === HealthStatus.UP) {
            eventEmitter.emit('executor:recovered', executor);
          }
        }
      }
    } catch (error: any) {
      logger.error('Failed to check executor health', {
        executor,
        error: error.message
      });

      executors[executor] = {
        executor,
        status: HealthStatus.UNKNOWN,
        latency: 0,
        lastCheck: timestamp,
        error: error.message
      };
    }
  });

  await Promise.all(checkPromises);

  // Calculate summary
  const summary = {
    total: Object.keys(executors).length,
    up: 0,
    down: 0,
    degraded: 0,
    unknown: 0
  };

  Object.values(executors).forEach((health) => {
    if (health) {
      switch (health.status) {
        case HealthStatus.UP:
          summary.up++;
          break;
        case HealthStatus.DOWN:
          summary.down++;
          break;
        case HealthStatus.DEGRADED:
          summary.degraded++;
          break;
        case HealthStatus.UNKNOWN:
          summary.unknown++;
          break;
      }
    }
  });

  // Determine overall health
  let overall: OverallHealth;
  if (summary.down === 0 && summary.degraded === 0) {
    overall = OverallHealth.HEALTHY;
  } else if (summary.down >= currentConfig.unhealthyThreshold) {
    overall = OverallHealth.UNHEALTHY;
  } else if (summary.down >= currentConfig.degradedThreshold || summary.degraded > 0) {
    overall = OverallHealth.DEGRADED;
  } else {
    overall = OverallHealth.HEALTHY;
  }

  const report: HealthReport = {
    overall,
    timestamp,
    executors,
    summary
  };

  // Store current health
  previousHealth = currentHealth;
  currentHealth = report;

  // Emit events based on overall health changes
  if (previousHealth) {
    if (previousHealth.overall !== overall) {
      logger.info('Overall health changed', {
        from: previousHealth.overall,
        to: overall
      });

      if (overall === OverallHealth.DEGRADED) {
        eventEmitter.emit('health:degraded', report);
      } else if (overall === OverallHealth.UNHEALTHY) {
        eventEmitter.emit('health:unhealthy', report);
      } else if (overall === OverallHealth.HEALTHY && previousHealth.overall !== OverallHealth.HEALTHY) {
        eventEmitter.emit('health:recovered', report);
      }
    }
  }

  // Always emit health checked event
  eventEmitter.emit('health:checked', report);

  logger.info('Health checks completed', {
    overall,
    summary
  });

  return report;
}

/**
 * Check health of single executor
 */
async function checkExecutorHealth(executor: ExecutorType): Promise<ExecutorHealth> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    // Get test configuration
    const testConfig = currentConfig.testConfigs[executor];

    // Run health check with timeout
    await Promise.race([
      runHealthCheck(executor, testConfig),
      timeout(currentConfig.checkTimeout)
    ]);

    const latency = Date.now() - startTime;

    // Get previous health for consecutive failures tracking
    const previousExecutorHealth = currentHealth?.executors[executor];
    
    return {
      executor,
      status: HealthStatus.UP,
      latency,
      lastCheck: timestamp,
      lastSuccess: timestamp,
      consecutiveFailures: 0
    };

  } catch (error: any) {
    const latency = Date.now() - startTime;

    // Get previous health for consecutive failures tracking
    const previousExecutorHealth = currentHealth?.executors[executor];
    const consecutiveFailures = (previousExecutorHealth?.consecutiveFailures || 0) + 1;

    // Determine if executor should be marked as down
    const status = consecutiveFailures >= currentConfig.consecutiveFailureThreshold
      ? HealthStatus.DOWN
      : HealthStatus.DEGRADED;

    return {
      executor,
      status,
      latency,
      lastCheck: timestamp,
      error: error.message,
      lastSuccess: previousExecutorHealth?.lastSuccess,
      consecutiveFailures
    };
  }
}

/**
 * Run health check for specific executor
 */
async function runHealthCheck(executor: ExecutorType, config: any): Promise<void> {
  switch (executor) {
    case ExecutorType.NOTION:
      await checkNotionHealth(config);
      break;
    case ExecutorType.TRELLO:
      await checkTrelloHealth(config);
      break;
    case ExecutorType.SLACK:
      await checkSlackHealth(config);
      break;
    case ExecutorType.GMAIL:
      await checkGmailHealth(config);
      break;
    case ExecutorType.DRIVE:
      await checkDriveHealth(config);
      break;
    case ExecutorType.SHEETS:
      await checkSheetsHealth(config);
      break;
    case ExecutorType.GOOGLE_TASKS:
      await checkGoogleTasksHealth(config);
      break;
    default:
      throw new Error(`Unknown executor: ${executor}`);
  }
}

// ============================================================================
// EXECUTOR-SPECIFIC HEALTH CHECKS
// ============================================================================

/**
 * Check Notion health
 */
async function checkNotionHealth(config: any): Promise<void> {
  // Simulate Notion health check (query database)
  // In production, replace with actual Notion API call:
  // const notionClient = new Client({ auth: process.env.NOTION_TOKEN });
  // await notionClient.databases.query({ database_id: config.testDatabase });

  logger.debug('Checking Notion health', { config });

  // Simulated check
  await simulateHealthCheck('notion', 150);

  logger.debug('Notion health check passed');
}

/**
 * Check Trello health
 */
async function checkTrelloHealth(config: any): Promise<void> {
  // Simulate Trello health check (list boards)
  // In production, replace with actual Trello API call:
  // const response = await fetch(
  //   `https://api.trello.com/1/members/me/boards?key=${key}&token=${token}`
  // );

  logger.debug('Checking Trello health', { config });

  // Simulated check
  await simulateHealthCheck('trello', 120);

  logger.debug('Trello health check passed');
}

/**
 * Check Slack health
 */
async function checkSlackHealth(config: any): Promise<void> {
  // Simulate Slack health check (post to test channel)
  // In production, replace with actual Slack API call:
  // const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
  // await slackClient.chat.postMessage({
  //   channel: config.testChannel,
  //   text: 'Health check ping'
  // });

  logger.debug('Checking Slack health', { config });

  // Simulated check
  await simulateHealthCheck('slack', 80);

  logger.debug('Slack health check passed');
}

/**
 * Check Gmail health
 */
async function checkGmailHealth(config: any): Promise<void> {
  // Simulate Gmail health check (list labels)
  // In production, replace with actual Gmail API call:
  // const gmail = google.gmail({ version: 'v1', auth });
  // await gmail.users.labels.list({ userId: 'me' });

  logger.debug('Checking Gmail health', { config });

  // Simulated check
  await simulateHealthCheck('gmail', 200);

  logger.debug('Gmail health check passed');
}

/**
 * Check Drive health
 */
async function checkDriveHealth(config: any): Promise<void> {
  // Simulate Drive health check (list root folder)
  // In production, replace with actual Drive API call:
  // const drive = google.drive({ version: 'v3', auth });
  // await drive.files.list({
  //   pageSize: 1,
  //   fields: 'files(id, name)'
  // });

  logger.debug('Checking Drive health', { config });

  // Simulated check
  await simulateHealthCheck('drive', 180);

  logger.debug('Drive health check passed');
}

/**
 * Check Sheets health
 */
async function checkSheetsHealth(config: any): Promise<void> {
  // Simulate Sheets health check (read cell from test sheet)
  // In production, replace with actual Sheets API call:
  // const sheets = google.sheets({ version: 'v4', auth });
  // await sheets.spreadsheets.values.get({
  //   spreadsheetId: config.testSpreadsheet,
  //   range: config.testCell
  // });

  logger.debug('Checking Sheets health', { config });

  // Simulated check
  await simulateHealthCheck('sheets', 160);

  logger.debug('Sheets health check passed');
}

/**
 * Check Google Tasks health
 */
async function checkGoogleTasksHealth(config: any): Promise<void> {
  // Simulate Google Tasks health check (list task lists)
  // In production, replace with actual Tasks API call:
  // const tasks = google.tasks({ version: 'v1', auth });
  // await tasks.tasklists.list();

  logger.debug('Checking Google Tasks health', { config });

  // Simulated check
  await simulateHealthCheck('google-tasks', 140);

  logger.debug('Google Tasks health check passed');
}

/**
 * Simulate health check (for development)
 */
async function simulateHealthCheck(executor: string, baseLatency: number): Promise<void> {
  // Add some random variation to latency
  const latency = baseLatency + Math.random() * 50;

  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, latency));

  // Simulate occasional failures (5% chance)
  if (Math.random() < 0.05) {
    throw new Error(`Simulated failure for ${executor}`);
  }
}

// ============================================================================
// PERIODIC CHECKS
// ============================================================================

/**
 * Start periodic health checks
 */
export function start(): void {
  if (isRunning) {
    logger.warn('Health checker is already running');
    return;
  }

  if (!currentConfig.enabled) {
    logger.warn('Health checks are disabled, cannot start');
    return;
  }

  isRunning = true;

  logger.info('Starting health checker', {
    interval: currentConfig.checkInterval,
    executors: currentConfig.executors
  });

  // Run initial check
  checkHealth().catch((error) => {
    logger.error('Initial health check failed', { error: error.message });
  });

  // Schedule periodic checks
  checkIntervalTimer = setInterval(() => {
    checkHealth().catch((error) => {
      logger.error('Periodic health check failed', { error: error.message });
    });
  }, currentConfig.checkInterval);

  logger.info('Health checker started');
}

/**
 * Stop periodic health checks
 */
export function stop(): void {
  if (!isRunning) {
    logger.warn('Health checker is not running');
    return;
  }

  if (checkIntervalTimer) {
    clearInterval(checkIntervalTimer);
    checkIntervalTimer = null;
  }

  isRunning = false;

  logger.info('Health checker stopped');
}

/**
 * Restart health checker
 */
export function restart(): void {
  logger.info('Restarting health checker');
  stop();
  start();
}

// ============================================================================
// GETTERS
// ============================================================================

/**
 * Get current health status
 */
export function getCurrentHealth(): HealthReport | null {
  return currentHealth;
}

/**
 * Get executor health
 */
export function getExecutorHealth(executor: ExecutorType): ExecutorHealth | null {
  return currentHealth?.executors[executor] || null;
}

/**
 * Get health history for executor
 */
export function getHealthHistory(
  executor: ExecutorType,
  limit: number = 100
): ExecutorHealth[] {
  const history = healthHistory.get(executor) || [];
  return history.slice(-limit);
}

/**
 * Get executors by status
 */
export function getExecutorsByStatus(status: HealthStatus): ExecutorType[] {
  if (!currentHealth) {
    return [];
  }

  return Object.entries(currentHealth.executors)
    .filter(([_, health]) => health?.status === status)
    .map(([executor]) => executor as ExecutorType);
}

// ============================================================================
// HISTORY MANAGEMENT
// ============================================================================

/**
 * Update health history
 */
function updateHealthHistory(executor: ExecutorType, health: ExecutorHealth): void {
  if (!healthHistory.has(executor)) {
    healthHistory.set(executor, []);
  }

  const history = healthHistory.get(executor)!;
  history.push(health);

  // Keep only last 1000 entries per executor
  if (history.length > 1000) {
    history.shift();
  }
}

/**
 * Clear health history
 */
export function clearHealthHistory(executor?: ExecutorType): void {
  if (executor) {
    healthHistory.delete(executor);
    logger.info('Health history cleared', { executor });
  } else {
    healthHistory.clear();
    logger.info('All health history cleared');
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configure health checker
 */
export function configure(config: Partial<HealthCheckConfig>): void {
  const wasRunning = isRunning;

  // Stop if running
  if (wasRunning) {
    stop();
  }

  // Update configuration
  currentConfig = {
    ...currentConfig,
    ...config
  };

  // Restart if was running
  if (wasRunning && currentConfig.enabled) {
    start();
  }

  logger.info('Health checker configured', { config: currentConfig });
}

/**
 * Get current configuration
 */
export function getConfig(): HealthCheckConfig {
  return { ...currentConfig };
}

// ============================================================================
// EVENT HANDLING
// ============================================================================

/**
 * Register event listener
 */
export function on<K extends keyof HealthEvents>(
  event: K,
  listener: HealthEvents[K]
): void {
  eventEmitter.on(event, listener as any);
}

/**
 * Unregister event listener
 */
export function off<K extends keyof HealthEvents>(
  event: K,
  listener: HealthEvents[K]
): void {
  eventEmitter.off(event, listener as any);
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Timeout promise
 */
function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Health check timeout after ${ms}ms`)), ms);
  });
}

/**
 * Create empty report
 */
function createEmptyReport(): HealthReport {
  return {
    overall: OverallHealth.HEALTHY,
    timestamp: new Date().toISOString(),
    executors: {},
    summary: {
      total: 0,
      up: 0,
      down: 0,
      degraded: 0,
      unknown: 0
    }
  };
}

/**
 * Check if running
 */
export function isHealthCheckerRunning(): boolean {
  return isRunning;
}

/**
 * Enable health checks
 */
export function enable(): void {
  currentConfig.enabled = true;
  logger.info('Health checks enabled');
}

/**
 * Disable health checks
 */
export function disable(): void {
  currentConfig.enabled = false;
  if (isRunning) {
    stop();
  }
  logger.info('Health checks disabled');
}

/**
 * Check if enabled
 */
export function isEnabled(): boolean {
  return currentConfig.enabled;
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format health report
 */
export function formatHealthReport(report: HealthReport): string {
  let output = '\n========================================\n';
  output += '      HEALTH CHECK REPORT\n';
  output += '========================================\n\n';

  output += `Overall Status: ${report.overall.toUpperCase()}\n`;
  output += `Timestamp: ${report.timestamp}\n\n`;

  output += 'Summary:\n';
  output += `  Total: ${report.summary.total}\n`;
  output += `  Up: ${report.summary.up}\n`;
  output += `  Down: ${report.summary.down}\n`;
  output += `  Degraded: ${report.summary.degraded}\n`;
  output += `  Unknown: ${report.summary.unknown}\n\n`;

  if (Object.keys(report.executors).length > 0) {
    output += 'Executors:\n';
    Object.entries(report.executors).forEach(([executor, health]) => {
      if (health) {
        const statusIcon = health.status === HealthStatus.UP ? '✅' :
                          health.status === HealthStatus.DOWN ? '❌' :
                          health.status === HealthStatus.DEGRADED ? '⚠️' : '❓';
        
        output += `  ${statusIcon} ${executor}: ${health.status.toUpperCase()} (${health.latency}ms)\n`;
        
        if (health.error) {
          output += `     Error: ${health.error}\n`;
        }
        
        if (health.consecutiveFailures && health.consecutiveFailures > 0) {
          output += `     Consecutive Failures: ${health.consecutiveFailures}\n`;
        }
      }
    });
  }

  output += '\n========================================\n';

  return output;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Destroy health checker
 */
export async function destroy(): Promise<void> {
  stop();
  healthHistory.clear();
  currentHealth = null;
  previousHealth = null;
  eventEmitter.removeAllListeners();
  logger.info('Health checker destroyed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Core functions
  checkHealth,
  start,
  stop,
  restart,

  // Getters
  getCurrentHealth,
  getExecutorHealth,
  getHealthHistory,
  getExecutorsByStatus,

  // History
  clearHealthHistory,

  // Configuration
  configure,
  getConfig,

  // Events
  on,
  off,

  // Utilities
  isHealthCheckerRunning,
  enable,
  disable,
  isEnabled,

  // Formatting
  formatHealthReport,

  // Cleanup
  destroy,

  // Enums
  HealthStatus,
  OverallHealth,
  ExecutorType
};
