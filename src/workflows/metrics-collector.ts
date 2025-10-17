/**
 * Action Metrics Collector
 * 
 * Comprehensive execution metrics tracking:
 * - Action execution by type and platform
 * - Success/failure rates
 * - Execution time percentiles (P50, P95, P99)
 * - Retry statistics
 * - Circuit breaker metrics
 * - Queue depth monitoring
 * - Approval rate tracking
 * - Real-time dashboard stats
 * - Persistent metrics storage
 */

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Action types
 */
export enum ActionType {
  CREATE_TASK = 'create_task',
  UPDATE_TASK = 'update_task',
  NOTIFY = 'notify',
  FILE = 'file',
  UPDATE = 'update',
  QUERY = 'query',
  DELETE = 'delete',
  UPLOAD = 'upload',
  SEND = 'send',
  SEARCH = 'search'
}

/**
 * Platform types
 */
export enum Platform {
  NOTION = 'notion',
  TRELLO = 'trello',
  SLACK = 'slack',
  GMAIL = 'gmail',
  GOOGLE_DRIVE = 'drive',
  GOOGLE_SHEETS = 'sheets',
  GOOGLE_TASKS = 'google-tasks',
  EMAIL = 'email'
}

/**
 * Action status
 */
export enum ActionStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
  RETRY = 'retry',
  TIMEOUT = 'timeout',
  CIRCUIT_OPEN = 'circuit_open',
  APPROVAL_REQUIRED = 'approval_required',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

/**
 * Metric entry
 */
export interface MetricEntry {
  /**
   * Unique metric ID
   */
  id: string;

  /**
   * Timestamp
   */
  timestamp: Date;

  /**
   * Action type
   */
  actionType: ActionType;

  /**
   * Platform
   */
  platform: Platform;

  /**
   * Action status
   */
  status: ActionStatus;

  /**
   * Execution duration (ms)
   */
  duration: number;

  /**
   * Retry count
   */
  retryCount?: number;

  /**
   * Retry reason
   */
  retryReason?: string;

  /**
   * Circuit breaker tripped
   */
  circuitBreakerTripped?: boolean;

  /**
   * Required approval
   */
  requiredApproval?: boolean;

  /**
   * Was approved
   */
  wasApproved?: boolean;

  /**
   * Queue depth at execution
   */
  queueDepth?: number;

  /**
   * Additional metadata
   */
  metadata?: {
    /**
     * Error message
     */
    error?: string;

    /**
     * Confidence score
     */
    confidence?: number;

    /**
     * Risk level
     */
    riskLevel?: string;

    /**
     * Fallback used
     */
    fallbackUsed?: string;

    /**
     * Custom fields
     */
    [key: string]: any;
  };
}

/**
 * Aggregated metrics
 */
export interface AggregatedMetrics {
  /**
   * Time range
   */
  timeRange: {
    start: Date;
    end: Date;
  };

  /**
   * Total actions executed
   */
  totalExecuted: number;

  /**
   * Successful actions
   */
  successful: number;

  /**
   * Failed actions
   */
  failed: number;

  /**
   * Success rate (0-1)
   */
  successRate: number;

  /**
   * Average execution time (ms)
   */
  avgExecutionTime: number;

  /**
   * Execution time percentiles
   */
  executionTimePercentiles: {
    p50: number;
    p95: number;
    p99: number;
  };

  /**
   * Total retries
   */
  totalRetries: number;

  /**
   * Circuit breaker trips
   */
  circuitBreakerTrips: number;

  /**
   * Actions requiring approval
   */
  actionsRequiringApproval: number;

  /**
   * Approval rate (0-1)
   */
  approvalRate: number;

  /**
   * Average queue depth
   */
  avgQueueDepth: number;

  /**
   * Max queue depth
   */
  maxQueueDepth: number;

  /**
   * Metrics by platform
   */
  byPlatform: Map<Platform, PlatformMetrics>;

  /**
   * Metrics by action type
   */
  byActionType: Map<ActionType, ActionTypeMetrics>;

  /**
   * Retry reasons breakdown
   */
  retryReasons: Map<string, number>;
}

/**
 * Platform metrics
 */
export interface PlatformMetrics {
  /**
   * Platform name
   */
  platform: Platform;

  /**
   * Total executions
   */
  totalExecutions: number;

  /**
   * Successful executions
   */
  successful: number;

  /**
   * Failed executions
   */
  failed: number;

  /**
   * Success rate (0-1)
   */
  successRate: number;

  /**
   * Average execution time (ms)
   */
  avgExecutionTime: number;

  /**
   * Total retries
   */
  totalRetries: number;

  /**
   * Circuit breaker trips
   */
  circuitBreakerTrips: number;
}

/**
 * Action type metrics
 */
export interface ActionTypeMetrics {
  /**
   * Action type
   */
  actionType: ActionType;

  /**
   * Total executions
   */
  totalExecutions: number;

  /**
   * Successful executions
   */
  successful: number;

  /**
   * Failed executions
   */
  failed: number;

  /**
   * Success rate (0-1)
   */
  successRate: number;

  /**
   * Average execution time (ms)
   */
  avgExecutionTime: number;
}

/**
 * Real-time statistics
 */
export interface RealTimeStats {
  /**
   * Total executed (last hour)
   */
  totalExecuted: number;

  /**
   * Success rate (0-1)
   */
  successRate: number;

  /**
   * Average execution time (ms)
   */
  avgExecutionTime: number;

  /**
   * Current queue depth
   */
  queueDepth: number;

  /**
   * Actions per minute (last 5 min)
   */
  actionsPerMinute: number;

  /**
   * By platform
   */
  byPlatform: {
    [key: string]: {
      totalExecutions: number;
      successRate: number;
      avgExecutionTime: number;
      lastExecuted?: Date;
    };
  };

  /**
   * By action type
   */
  byActionType: {
    [key: string]: {
      totalExecutions: number;
      successRate: number;
      avgExecutionTime: number;
    };
  };

  /**
   * Recent failures
   */
  recentFailures: {
    timestamp: Date;
    platform: string;
    actionType: string;
    error: string;
  }[];

  /**
   * Circuit breaker status
   */
  circuitBreakers: {
    [key: string]: {
      state: string;
      failureCount: number;
      lastTrip?: Date;
    };
  };
}

/**
 * Time range
 */
export interface TimeRange {
  /**
   * Start time
   */
  start: Date;

  /**
   * End time
   */
  end: Date;
}

/**
 * Configuration
 */
export interface MetricsConfig {
  /**
   * Enable metrics collection
   */
  enabled: boolean;

  /**
   * Metrics directory
   */
  metricsDir: string;

  /**
   * Metrics file name
   */
  metricsFile: string;

  /**
   * Retention period (days)
   */
  retentionDays: number;

  /**
   * Max entries in memory
   */
  maxInMemoryEntries: number;

  /**
   * Flush interval (ms)
   */
  flushInterval: number;

  /**
   * Enable real-time stats
   */
  enableRealTimeStats: boolean;

  /**
   * Real-time stats window (ms)
   */
  realTimeWindow: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default configuration
 */
const DEFAULT_CONFIG: MetricsConfig = {
  enabled: process.env.ENABLE_METRICS !== 'false',
  metricsDir: process.env.METRICS_DIR || './logs',
  metricsFile: 'metrics.jsonl',
  retentionDays: 30,
  maxInMemoryEntries: 10000,
  flushInterval: 5000, // 5 seconds
  enableRealTimeStats: true,
  realTimeWindow: 60 * 60 * 1000 // 1 hour
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

/**
 * Current configuration
 */
let currentConfig: MetricsConfig = { ...DEFAULT_CONFIG };

/**
 * In-memory metrics store
 */
const metricsStore: MetricEntry[] = [];

/**
 * Pending writes (not yet flushed to disk)
 */
const pendingWrites: MetricEntry[] = [];

/**
 * Flush timer
 */
let flushTimer: NodeJS.Timeout | null = null;

/**
 * Current queue depth
 */
let currentQueueDepth = 0;

/**
 * Circuit breaker states
 */
const circuitBreakerStates = new Map<string, {
  state: string;
  failureCount: number;
  lastTrip?: Date;
}>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record a metric
 */
export function recordMetric(
  action: string,
  status: ActionStatus,
  duration: number,
  metadata?: any
): string {
  if (!currentConfig.enabled) {
    return '';
  }

  // Parse action (format: "platform:actionType")
  const [platformStr, actionTypeStr] = action.split(':');
  const platform = platformStr as Platform;
  const actionType = actionTypeStr as ActionType;

  // Generate metric ID
  const metricId = generateMetricId();

  // Create metric entry
  const entry: MetricEntry = {
    id: metricId,
    timestamp: new Date(),
    actionType,
    platform,
    status,
    duration,
    retryCount: metadata?.retryCount,
    retryReason: metadata?.retryReason,
    circuitBreakerTripped: metadata?.circuitBreakerTripped,
    requiredApproval: metadata?.requiredApproval,
    wasApproved: metadata?.wasApproved,
    queueDepth: currentQueueDepth,
    metadata: metadata ? { ...metadata } : undefined
  };

  // Add to stores
  metricsStore.push(entry);
  pendingWrites.push(entry);

  // Trim in-memory store if needed
  if (metricsStore.length > currentConfig.maxInMemoryEntries) {
    metricsStore.shift();
  }

  // Update circuit breaker state if relevant
  if (metadata?.circuitBreakerTripped) {
    updateCircuitBreakerState(platform, metadata.circuitBreakerState);
  }

  // Start flush timer if not already running
  if (!flushTimer) {
    flushTimer = setTimeout(flushMetrics, currentConfig.flushInterval);
  }

  logger.debug('Metric recorded', {
    metricId,
    action,
    status,
    duration
  });

  return metricId;
}

/**
 * Get metrics for a time range
 */
export function getMetrics(timeRange?: TimeRange): AggregatedMetrics {
  const now = new Date();
  const range = timeRange || {
    start: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Last 24 hours
    end: now
  };

  // Filter metrics by time range
  const filteredMetrics = metricsStore.filter(
    m => m.timestamp >= range.start && m.timestamp <= range.end
  );

  // Calculate aggregated metrics
  return aggregateMetrics(filteredMetrics, range);
}

/**
 * Get real-time statistics
 */
export function getRealTimeStats(): RealTimeStats {
  if (!currentConfig.enableRealTimeStats) {
    return createEmptyStats();
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - currentConfig.realTimeWindow);
  const last5MinStart = new Date(now.getTime() - 5 * 60 * 1000);

  // Filter metrics for window
  const windowMetrics = metricsStore.filter(
    m => m.timestamp >= windowStart
  );

  const last5MinMetrics = metricsStore.filter(
    m => m.timestamp >= last5MinStart
  );

  // Calculate stats
  const totalExecuted = windowMetrics.length;
  const successful = windowMetrics.filter(m => m.status === ActionStatus.SUCCESS).length;
  const successRate = totalExecuted > 0 ? successful / totalExecuted : 0;

  const totalDuration = windowMetrics.reduce((sum, m) => sum + m.duration, 0);
  const avgExecutionTime = totalExecuted > 0 ? totalDuration / totalExecuted : 0;

  const actionsPerMinute = (last5MinMetrics.length / 5);

  // By platform
  const byPlatform: any = {};
  const platformGroups = groupBy(windowMetrics, 'platform');

  for (const [platform, metrics] of platformGroups) {
    const platformSuccessful = metrics.filter(m => m.status === ActionStatus.SUCCESS).length;
    const platformTotal = metrics.length;
    const platformDuration = metrics.reduce((sum, m) => sum + m.duration, 0);
    const lastMetric = metrics[metrics.length - 1];

    byPlatform[platform] = {
      totalExecutions: platformTotal,
      successRate: platformTotal > 0 ? platformSuccessful / platformTotal : 0,
      avgExecutionTime: platformTotal > 0 ? platformDuration / platformTotal : 0,
      lastExecuted: lastMetric?.timestamp
    };
  }

  // By action type
  const byActionType: any = {};
  const actionTypeGroups = groupBy(windowMetrics, 'actionType');

  for (const [actionType, metrics] of actionTypeGroups) {
    const actionSuccessful = metrics.filter(m => m.status === ActionStatus.SUCCESS).length;
    const actionTotal = metrics.length;
    const actionDuration = metrics.reduce((sum, m) => sum + m.duration, 0);

    byActionType[actionType] = {
      totalExecutions: actionTotal,
      successRate: actionTotal > 0 ? actionSuccessful / actionTotal : 0,
      avgExecutionTime: actionTotal > 0 ? actionDuration / actionTotal : 0
    };
  }

  // Recent failures
  const recentFailures = windowMetrics
    .filter(m => m.status === ActionStatus.FAILURE)
    .slice(-10)
    .map(m => ({
      timestamp: m.timestamp,
      platform: m.platform,
      actionType: m.actionType,
      error: m.metadata?.error || 'Unknown error'
    }));

  // Circuit breaker status
  const circuitBreakers: any = {};
  circuitBreakerStates.forEach((state, platform) => {
    circuitBreakers[platform] = {
      state: state.state,
      failureCount: state.failureCount,
      lastTrip: state.lastTrip
    };
  });

  return {
    totalExecuted,
    successRate,
    avgExecutionTime,
    queueDepth: currentQueueDepth,
    actionsPerMinute,
    byPlatform,
    byActionType,
    recentFailures,
    circuitBreakers
  };
}

/**
 * Set queue depth
 */
export function setQueueDepth(depth: number): void {
  currentQueueDepth = depth;
}

/**
 * Update circuit breaker state
 */
export function updateCircuitBreakerState(
  platform: string,
  state: any
): void {
  circuitBreakerStates.set(platform, {
    state: state.state || 'CLOSED',
    failureCount: state.failureCount || 0,
    lastTrip: state.lastTrip
  });
}

// ============================================================================
// AGGREGATION FUNCTIONS
// ============================================================================

/**
 * Aggregate metrics
 */
function aggregateMetrics(
  metrics: MetricEntry[],
  timeRange: TimeRange
): AggregatedMetrics {
  const totalExecuted = metrics.length;
  const successful = metrics.filter(m => m.status === ActionStatus.SUCCESS).length;
  const failed = metrics.filter(m => m.status === ActionStatus.FAILURE).length;
  const successRate = totalExecuted > 0 ? successful / totalExecuted : 0;

  // Execution time
  const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
  const totalDuration = durations.reduce((sum, d) => sum + d, 0);
  const avgExecutionTime = totalExecuted > 0 ? totalDuration / totalExecuted : 0;

  const executionTimePercentiles = {
    p50: calculatePercentile(durations, 0.5),
    p95: calculatePercentile(durations, 0.95),
    p99: calculatePercentile(durations, 0.99)
  };

  // Retries
  const totalRetries = metrics.reduce((sum, m) => sum + (m.retryCount || 0), 0);

  // Circuit breaker trips
  const circuitBreakerTrips = metrics.filter(m => m.circuitBreakerTripped).length;

  // Approvals
  const actionsRequiringApproval = metrics.filter(m => m.requiredApproval).length;
  const approvedActions = metrics.filter(m => m.wasApproved).length;
  const approvalRate = actionsRequiringApproval > 0
    ? approvedActions / actionsRequiringApproval
    : 0;

  // Queue depth
  const queueDepths = metrics
    .filter(m => m.queueDepth !== undefined)
    .map(m => m.queueDepth!);
  const avgQueueDepth = queueDepths.length > 0
    ? queueDepths.reduce((sum, d) => sum + d, 0) / queueDepths.length
    : 0;
  const maxQueueDepth = queueDepths.length > 0
    ? Math.max(...queueDepths)
    : 0;

  // By platform
  const byPlatform = new Map<Platform, PlatformMetrics>();
  const platformGroups = groupBy(metrics, 'platform');

  for (const [platform, platformMetrics] of platformGroups) {
    byPlatform.set(platform as Platform, aggregatePlatformMetrics(
      platform as Platform,
      platformMetrics
    ));
  }

  // By action type
  const byActionType = new Map<ActionType, ActionTypeMetrics>();
  const actionTypeGroups = groupBy(metrics, 'actionType');

  for (const [actionType, actionTypeMetrics] of actionTypeGroups) {
    byActionType.set(actionType as ActionType, aggregateActionTypeMetrics(
      actionType as ActionType,
      actionTypeMetrics
    ));
  }

  // Retry reasons
  const retryReasons = new Map<string, number>();
  metrics.forEach(m => {
    if (m.retryReason) {
      retryReasons.set(m.retryReason, (retryReasons.get(m.retryReason) || 0) + 1);
    }
  });

  return {
    timeRange,
    totalExecuted,
    successful,
    failed,
    successRate,
    avgExecutionTime,
    executionTimePercentiles,
    totalRetries,
    circuitBreakerTrips,
    actionsRequiringApproval,
    approvalRate,
    avgQueueDepth,
    maxQueueDepth,
    byPlatform,
    byActionType,
    retryReasons
  };
}

/**
 * Aggregate platform metrics
 */
function aggregatePlatformMetrics(
  platform: Platform,
  metrics: MetricEntry[]
): PlatformMetrics {
  const totalExecutions = metrics.length;
  const successful = metrics.filter(m => m.status === ActionStatus.SUCCESS).length;
  const failed = metrics.filter(m => m.status === ActionStatus.FAILURE).length;
  const successRate = totalExecutions > 0 ? successful / totalExecutions : 0;

  const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0);
  const avgExecutionTime = totalExecutions > 0 ? totalDuration / totalExecutions : 0;

  const totalRetries = metrics.reduce((sum, m) => sum + (m.retryCount || 0), 0);
  const circuitBreakerTrips = metrics.filter(m => m.circuitBreakerTripped).length;

  return {
    platform,
    totalExecutions,
    successful,
    failed,
    successRate,
    avgExecutionTime,
    totalRetries,
    circuitBreakerTrips
  };
}

/**
 * Aggregate action type metrics
 */
function aggregateActionTypeMetrics(
  actionType: ActionType,
  metrics: MetricEntry[]
): ActionTypeMetrics {
  const totalExecutions = metrics.length;
  const successful = metrics.filter(m => m.status === ActionStatus.SUCCESS).length;
  const failed = metrics.filter(m => m.status === ActionStatus.FAILURE).length;
  const successRate = totalExecutions > 0 ? successful / totalExecutions : 0;

  const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0);
  const avgExecutionTime = totalExecutions > 0 ? totalDuration / totalExecutions : 0;

  return {
    actionType,
    totalExecutions,
    successful,
    failed,
    successRate,
    avgExecutionTime
  };
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Flush metrics to disk
 */
async function flushMetrics(): Promise<void> {
  if (pendingWrites.length === 0) {
    flushTimer = null;
    return;
  }

  try {
    // Ensure metrics directory exists
    if (!fs.existsSync(currentConfig.metricsDir)) {
      fs.mkdirSync(currentConfig.metricsDir, { recursive: true });
    }

    const metricsPath = path.join(currentConfig.metricsDir, currentConfig.metricsFile);

    // Append metrics to JSONL file
    const lines = pendingWrites.map(m => JSON.stringify(m)).join('\n') + '\n';
    fs.appendFileSync(metricsPath, lines, 'utf8');

    logger.debug('Metrics flushed to disk', {
      count: pendingWrites.length,
      path: metricsPath
    });

    // Clear pending writes
    pendingWrites.length = 0;

  } catch (error: any) {
    logger.error('Failed to flush metrics', {
      error: error.message
    });
  }

  flushTimer = null;
}

/**
 * Load metrics from disk
 */
export async function loadMetrics(): Promise<number> {
  const metricsPath = path.join(currentConfig.metricsDir, currentConfig.metricsFile);

  if (!fs.existsSync(metricsPath)) {
    logger.info('No metrics file found, starting fresh');
    return 0;
  }

  try {
    const content = fs.readFileSync(metricsPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    let loaded = 0;
    const cutoffDate = new Date(Date.now() - currentConfig.retentionDays * 24 * 60 * 60 * 1000);

    for (const line of lines) {
      try {
        const metric: MetricEntry = JSON.parse(line);
        metric.timestamp = new Date(metric.timestamp);

        // Only load recent metrics
        if (metric.timestamp >= cutoffDate) {
          metricsStore.push(metric);
          loaded++;
        }
      } catch (error) {
        logger.warn('Failed to parse metric line', { error });
      }
    }

    // Trim to max entries
    if (metricsStore.length > currentConfig.maxInMemoryEntries) {
      metricsStore.splice(0, metricsStore.length - currentConfig.maxInMemoryEntries);
    }

    logger.info('Metrics loaded from disk', {
      loaded,
      total: metricsStore.length
    });

    return loaded;

  } catch (error: any) {
    logger.error('Failed to load metrics', {
      error: error.message
    });
    return 0;
  }
}

/**
 * Export metrics for visualization
 */
export async function exportMetrics(
  format: 'json' | 'csv',
  timeRange?: TimeRange
): Promise<string> {
  const metrics = getMetrics(timeRange);

  if (format === 'json') {
    return JSON.stringify(metrics, null, 2);
  } else if (format === 'csv') {
    return convertToCSV(metrics);
  }

  throw new Error(`Unsupported export format: ${format}`);
}

/**
 * Convert metrics to CSV
 */
function convertToCSV(metrics: AggregatedMetrics): string {
  const lines: string[] = [];

  // Header
  lines.push('metric,value');

  // Overall stats
  lines.push(`total_executed,${metrics.totalExecuted}`);
  lines.push(`successful,${metrics.successful}`);
  lines.push(`failed,${metrics.failed}`);
  lines.push(`success_rate,${(metrics.successRate * 100).toFixed(2)}%`);
  lines.push(`avg_execution_time,${metrics.avgExecutionTime.toFixed(2)}ms`);
  lines.push(`p50_execution_time,${metrics.executionTimePercentiles.p50.toFixed(2)}ms`);
  lines.push(`p95_execution_time,${metrics.executionTimePercentiles.p95.toFixed(2)}ms`);
  lines.push(`p99_execution_time,${metrics.executionTimePercentiles.p99.toFixed(2)}ms`);
  lines.push(`total_retries,${metrics.totalRetries}`);
  lines.push(`circuit_breaker_trips,${metrics.circuitBreakerTrips}`);
  lines.push(`actions_requiring_approval,${metrics.actionsRequiringApproval}`);
  lines.push(`approval_rate,${(metrics.approvalRate * 100).toFixed(2)}%`);
  lines.push(`avg_queue_depth,${metrics.avgQueueDepth.toFixed(2)}`);
  lines.push(`max_queue_depth,${metrics.maxQueueDepth}`);

  return lines.join('\n');
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Generate metric ID
 */
function generateMetricId(): string {
  return `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculate percentile
 */
function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.ceil(sortedValues.length * percentile) - 1;
  return sortedValues[Math.max(0, index)];
}

/**
 * Group by field
 */
function groupBy<T>(items: T[], field: keyof T): Map<any, T[]> {
  const groups = new Map<any, T[]>();

  for (const item of items) {
    const key = item[field];
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }

  return groups;
}

/**
 * Create empty stats
 */
function createEmptyStats(): RealTimeStats {
  return {
    totalExecuted: 0,
    successRate: 0,
    avgExecutionTime: 0,
    queueDepth: 0,
    actionsPerMinute: 0,
    byPlatform: {},
    byActionType: {},
    recentFailures: [],
    circuitBreakers: {}
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configure metrics collector
 */
export function configure(config: Partial<MetricsConfig>): void {
  currentConfig = {
    ...currentConfig,
    ...config
  };

  logger.info('Metrics collector configured', { config: currentConfig });
}

/**
 * Get current configuration
 */
export function getConfig(): MetricsConfig {
  return { ...currentConfig };
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format metrics for display
 */
export function formatMetrics(metrics: AggregatedMetrics): string {
  let output = '\n========================================\n';
  output += '      ACTION METRICS REPORT\n';
  output += '========================================\n\n';

  output += `Time Range: ${metrics.timeRange.start.toISOString()} to ${metrics.timeRange.end.toISOString()}\n\n`;

  output += 'Overall Statistics:\n';
  output += `  Total Executed: ${metrics.totalExecuted}\n`;
  output += `  Successful: ${metrics.successful}\n`;
  output += `  Failed: ${metrics.failed}\n`;
  output += `  Success Rate: ${(metrics.successRate * 100).toFixed(2)}%\n\n`;

  output += 'Execution Time:\n';
  output += `  Average: ${metrics.avgExecutionTime.toFixed(2)}ms\n`;
  output += `  P50: ${metrics.executionTimePercentiles.p50.toFixed(2)}ms\n`;
  output += `  P95: ${metrics.executionTimePercentiles.p95.toFixed(2)}ms\n`;
  output += `  P99: ${metrics.executionTimePercentiles.p99.toFixed(2)}ms\n\n`;

  output += 'Reliability:\n';
  output += `  Total Retries: ${metrics.totalRetries}\n`;
  output += `  Circuit Breaker Trips: ${metrics.circuitBreakerTrips}\n\n`;

  output += 'Approvals:\n';
  output += `  Required Approval: ${metrics.actionsRequiringApproval}\n`;
  output += `  Approval Rate: ${(metrics.approvalRate * 100).toFixed(2)}%\n\n`;

  output += 'Queue:\n';
  output += `  Average Depth: ${metrics.avgQueueDepth.toFixed(2)}\n`;
  output += `  Max Depth: ${metrics.maxQueueDepth}\n\n`;

  if (metrics.byPlatform.size > 0) {
    output += 'By Platform:\n';
    metrics.byPlatform.forEach((platformMetrics, platform) => {
      output += `  ${platform}:\n`;
      output += `    Executions: ${platformMetrics.totalExecutions}\n`;
      output += `    Success Rate: ${(platformMetrics.successRate * 100).toFixed(2)}%\n`;
      output += `    Avg Time: ${platformMetrics.avgExecutionTime.toFixed(2)}ms\n`;
      output += `    Retries: ${platformMetrics.totalRetries}\n`;
      output += `    CB Trips: ${platformMetrics.circuitBreakerTrips}\n`;
    });
    output += '\n';
  }

  if (metrics.byActionType.size > 0) {
    output += 'By Action Type:\n';
    metrics.byActionType.forEach((actionMetrics, actionType) => {
      output += `  ${actionType}:\n`;
      output += `    Executions: ${actionMetrics.totalExecutions}\n`;
      output += `    Success Rate: ${(actionMetrics.successRate * 100).toFixed(2)}%\n`;
      output += `    Avg Time: ${actionMetrics.avgExecutionTime.toFixed(2)}ms\n`;
    });
    output += '\n';
  }

  output += '========================================\n';

  return output;
}

/**
 * Format real-time stats
 */
export function formatRealTimeStats(stats: RealTimeStats): string {
  let output = '\n========================================\n';
  output += '      REAL-TIME STATISTICS\n';
  output += '========================================\n\n';

  output += `Total Executed (last hour): ${stats.totalExecuted}\n`;
  output += `Success Rate: ${(stats.successRate * 100).toFixed(2)}%\n`;
  output += `Avg Execution Time: ${stats.avgExecutionTime.toFixed(2)}ms\n`;
  output += `Current Queue Depth: ${stats.queueDepth}\n`;
  output += `Actions/Minute: ${stats.actionsPerMinute.toFixed(2)}\n\n`;

  if (Object.keys(stats.byPlatform).length > 0) {
    output += 'By Platform:\n';
    Object.entries(stats.byPlatform).forEach(([platform, metrics]) => {
      output += `  ${platform}: ${metrics.totalExecutions} (${(metrics.successRate * 100).toFixed(0)}%)\n`;
    });
    output += '\n';
  }

  if (stats.recentFailures.length > 0) {
    output += 'Recent Failures:\n';
    stats.recentFailures.slice(0, 5).forEach(failure => {
      output += `  ${failure.timestamp.toISOString()}: ${failure.platform}:${failure.actionType} - ${failure.error}\n`;
    });
    output += '\n';
  }

  output += '========================================\n';

  return output;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Enable metrics collection
 */
export function enable(): void {
  currentConfig.enabled = true;
  logger.info('Metrics collection enabled');
}

/**
 * Disable metrics collection
 */
export function disable(): void {
  currentConfig.enabled = false;
  logger.info('Metrics collection disabled');
}

/**
 * Check if enabled
 */
export function isEnabled(): boolean {
  return currentConfig.enabled;
}

/**
 * Clear in-memory metrics
 */
export function clearMetrics(): void {
  metricsStore.length = 0;
  pendingWrites.length = 0;
  logger.info('In-memory metrics cleared');
}

/**
 * Destroy metrics collector
 */
export async function destroy(): Promise<void> {
  // Flush pending writes
  if (pendingWrites.length > 0) {
    await flushMetrics();
  }

  // Clear timer
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  // Clear stores
  metricsStore.length = 0;
  pendingWrites.length = 0;
  circuitBreakerStates.clear();

  logger.info('Metrics collector destroyed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Core functions
  recordMetric,
  getMetrics,
  getRealTimeStats,
  setQueueDepth,
  updateCircuitBreakerState,

  // Persistence
  loadMetrics,
  exportMetrics,

  // Configuration
  configure,
  getConfig,

  // Formatting
  formatMetrics,
  formatRealTimeStats,

  // Utilities
  enable,
  disable,
  isEnabled,
  clearMetrics,
  destroy,

  // Enums
  ActionType,
  Platform,
  ActionStatus
};
