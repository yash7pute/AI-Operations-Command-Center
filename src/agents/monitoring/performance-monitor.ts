/**
 * Performance Monitor for AI Operations Command Center
 * 
 * Tracks detailed performance metrics for the reasoning pipeline:
 * - Processing time per stage (preprocess, classify, decide, extract)
 * - LLM latency and token usage
 * - Cache hit rates
 * - Error rates by stage
 * - Throughput (signals per minute)
 * - Queue depth over time
 * 
 * Features:
 * - Real-time metric recording
 * - Performance issue detection
 * - Automated alerts
 * - Periodic logging (10 minutes)
 * - Dashboard-ready exports
 */

import { EventEmitter } from 'events';
import logger from '../../utils/logger';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Pipeline stages
 */
export type PipelineStage = 
  | 'preprocess'
  | 'classify'
  | 'decide'
  | 'extract'
  | 'total'
  | 'llm_call'
  | 'cache_lookup';

/**
 * Metric metadata
 */
export interface MetricMetadata {
  /** Signal ID being processed */
  signalId?: string;
  
  /** Signal source */
  source?: string;
  
  /** Success status */
  success: boolean;
  
  /** Error message if failed */
  error?: string;
  
  /** LLM tokens used */
  tokensUsed?: number;
  
  /** Cache hit status */
  cacheHit?: boolean;
  
  /** Batch size if applicable */
  batchSize?: number;
  
  /** Additional context */
  [key: string]: any;
}

/**
 * Performance metric entry
 */
export interface PerformanceMetric {
  /** Metric ID */
  id: string;
  
  /** Pipeline stage */
  stage: PipelineStage;
  
  /** Duration in milliseconds */
  duration: number;
  
  /** Timestamp */
  timestamp: string;
  
  /** Metadata */
  metadata: MetricMetadata;
}

/**
 * Stage statistics
 */
export interface StageStats {
  /** Total executions */
  count: number;
  
  /** Total duration (ms) */
  totalDuration: number;
  
  /** Average duration (ms) */
  avgDuration: number;
  
  /** Min duration (ms) */
  minDuration: number;
  
  /** Max duration (ms) */
  maxDuration: number;
  
  /** Success count */
  successCount: number;
  
  /** Error count */
  errorCount: number;
  
  /** Error rate (0-1) */
  errorRate: number;
  
  /** P50 percentile (median) */
  p50: number;
  
  /** P95 percentile */
  p95: number;
  
  /** P99 percentile */
  p99: number;
}

/**
 * Performance report
 */
export interface PerformanceReport {
  /** Average total processing time (ms) */
  averageTotalTime: number;
  
  /** Stage breakdown */
  stageBreakdown: Record<PipelineStage, number>;
  
  /** Throughput (signals per minute) */
  throughput: number;
  
  /** Overall error rate (0-1) */
  errorRate: number;
  
  /** Cache efficiency (hit rate 0-1) */
  cacheEfficiency: number;
  
  /** Token usage statistics */
  tokenUsage: {
    total: number;
    cost: number;
    avgPerSignal: number;
  };
  
  /** Detailed stage statistics */
  detailedStats: Record<PipelineStage, StageStats>;
  
  /** Time period for this report */
  period: {
    startTime: string;
    endTime: string;
    durationMinutes: number;
  };
  
  /** Report generation timestamp */
  generatedAt: string;
}

/**
 * Performance issue
 */
export interface PerformanceIssue {
  /** Issue ID */
  id: string;
  
  /** Issue type */
  type: 'high_latency' | 'high_error_rate' | 'low_cache_hit' | 'high_token_usage' | 'queue_backup';
  
  /** Severity level */
  severity: 'warning' | 'critical';
  
  /** Issue description */
  description: string;
  
  /** Current value */
  currentValue: number;
  
  /** Threshold value */
  threshold: number;
  
  /** Detection timestamp */
  detectedAt: string;
  
  /** Recommended action */
  recommendation: string;
}

/**
 * Queue depth snapshot
 */
export interface QueueSnapshot {
  /** Snapshot timestamp */
  timestamp: string;
  
  /** Queue depth */
  depth: number;
  
  /** Processing rate (signals/min) */
  processingRate: number;
}

/**
 * Real-time metrics for dashboard
 */
export interface DashboardMetrics {
  /** Current throughput (signals/min) */
  currentThroughput: number;
  
  /** Average processing time (ms) */
  avgProcessingTime: number;
  
  /** Current error rate (0-1) */
  errorRate: number;
  
  /** Cache hit rate (0-1) */
  cacheHitRate: number;
  
  /** Active signals being processed */
  activeSignals: number;
  
  /** Queue depth */
  queueDepth: number;
  
  /** Recent issues */
  recentIssues: PerformanceIssue[];
  
  /** Token usage today */
  tokenUsageToday: number;
  
  /** Stage latencies (ms) */
  stageLatencies: Record<PipelineStage, number>;
  
  /** Last updated */
  lastUpdated: string;
}

/**
 * Performance monitor configuration
 */
export interface PerformanceMonitorConfig {
  /** High latency threshold (ms) */
  highLatencyThreshold: number;
  
  /** High error rate threshold (0-1) */
  highErrorRateThreshold: number;
  
  /** Low cache hit rate threshold (0-1) */
  lowCacheHitThreshold: number;
  
  /** Daily token limit */
  dailyTokenLimit: number;
  
  /** Token warning threshold (% of limit) */
  tokenWarningThreshold: number;
  
  /** Logging interval (ms) */
  loggingInterval: number;
  
  /** Metrics retention period (ms) */
  metricsRetentionPeriod: number;
  
  /** Queue depth warning threshold */
  queueDepthThreshold: number;
  
  /** Cost per 1K tokens (USD) */
  costPer1KTokens: number;
}

// ============================================================================
// Performance Monitor Implementation
// ============================================================================

export class PerformanceMonitor extends EventEmitter {
  private static instance: PerformanceMonitor | null = null;
  private config: PerformanceMonitorConfig;
  
  // Metrics storage
  private metrics: PerformanceMetric[] = [];
  private queueSnapshots: QueueSnapshot[] = [];
  private detectedIssues: PerformanceIssue[] = [];
  
  // Logging interval
  private loggingInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  // Real-time tracking
  private activeSignalsCount: number = 0;
  private currentQueueDepth: number = 0;
  private tokenUsageToday: number = 0;
  private lastTokenReset: Date = new Date();
  
  private constructor(config?: Partial<PerformanceMonitorConfig>) {
    super();
    
    this.config = {
      highLatencyThreshold: 5000, // 5 seconds
      highErrorRateThreshold: 0.05, // 5%
      lowCacheHitThreshold: 0.30, // 30%
      dailyTokenLimit: 1000000, // 1M tokens per day
      tokenWarningThreshold: 0.80, // 80% of limit
      loggingInterval: 10 * 60 * 1000, // 10 minutes
      metricsRetentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
      queueDepthThreshold: 100,
      costPer1KTokens: 0.002, // $0.002 per 1K tokens
      ...config,
    };
    
    this.startLogging();
    this.startCleanup();
    
    logger.info('PerformanceMonitor initialized', { config: this.config });
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<PerformanceMonitorConfig>): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor(config);
    }
    return PerformanceMonitor.instance;
  }
  
  // ==========================================================================
  // Public API
  // ==========================================================================
  
  /**
   * Record a performance metric
   */
  public recordMetric(
    stage: PipelineStage,
    duration: number,
    metadata: MetricMetadata
  ): void {
    const metric: PerformanceMetric = {
      id: `metric-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      stage,
      duration,
      timestamp: new Date().toISOString(),
      metadata,
    };
    
    this.metrics.push(metric);
    
    // Update token usage
    if (metadata.tokensUsed) {
      this.tokenUsageToday += metadata.tokensUsed;
      this.checkTokenUsage();
    }
    
    // Emit real-time event
    this.emit('metric-recorded', metric);
    
    logger.debug('Metric recorded', {
      stage,
      duration,
      success: metadata.success,
    });
  }
  
  /**
   * Get performance report
   */
  public getPerformanceReport(periodMinutes?: number): PerformanceReport {
    const now = new Date();
    const period = periodMinutes || 60; // Default: 1 hour
    const startTime = new Date(now.getTime() - period * 60 * 1000);
    
    // Filter metrics in period
    const periodMetrics = this.metrics.filter(
      m => new Date(m.timestamp) >= startTime
    );
    
    // Calculate stage breakdown
    const stageBreakdown: Partial<Record<PipelineStage, number>> = {};
    const detailedStats: Partial<Record<PipelineStage, StageStats>> = {};
    
    const stages: PipelineStage[] = ['preprocess', 'classify', 'decide', 'extract', 'total', 'llm_call', 'cache_lookup'];
    
    for (const stage of stages) {
      const stageMetrics = periodMetrics.filter(m => m.stage === stage);
      
      if (stageMetrics.length > 0) {
        const durations = stageMetrics.map(m => m.duration).sort((a, b) => a - b);
        const totalDuration = durations.reduce((sum, d) => sum + d, 0);
        const successCount = stageMetrics.filter(m => m.metadata.success).length;
        const errorCount = stageMetrics.length - successCount;
        
        stageBreakdown[stage] = totalDuration / stageMetrics.length;
        
        detailedStats[stage] = {
          count: stageMetrics.length,
          totalDuration,
          avgDuration: totalDuration / stageMetrics.length,
          minDuration: Math.min(...durations),
          maxDuration: Math.max(...durations),
          successCount,
          errorCount,
          errorRate: errorCount / stageMetrics.length,
          p50: this.calculatePercentile(durations, 50),
          p95: this.calculatePercentile(durations, 95),
          p99: this.calculatePercentile(durations, 99),
        };
      }
    }
    
    // Calculate throughput
    const totalSignals = periodMetrics.filter(m => m.stage === 'total').length;
    const throughput = totalSignals / period;
    
    // Calculate error rate
    const totalErrors = periodMetrics.filter(m => !m.metadata.success).length;
    const errorRate = periodMetrics.length > 0 ? totalErrors / periodMetrics.length : 0;
    
    // Calculate cache efficiency
    const cacheMetrics = periodMetrics.filter(m => m.stage === 'cache_lookup');
    const cacheHits = cacheMetrics.filter(m => m.metadata.cacheHit).length;
    const cacheEfficiency = cacheMetrics.length > 0 ? cacheHits / cacheMetrics.length : 0;
    
    // Calculate token usage
    const totalTokens = periodMetrics.reduce((sum, m) => sum + (m.metadata.tokensUsed || 0), 0);
    const tokenCost = (totalTokens / 1000) * this.config.costPer1KTokens;
    const avgTokensPerSignal = totalSignals > 0 ? totalTokens / totalSignals : 0;
    
    return {
      averageTotalTime: stageBreakdown.total || 0,
      stageBreakdown: stageBreakdown as Record<PipelineStage, number>,
      throughput,
      errorRate,
      cacheEfficiency,
      tokenUsage: {
        total: totalTokens,
        cost: tokenCost,
        avgPerSignal: avgTokensPerSignal,
      },
      detailedStats: detailedStats as Record<PipelineStage, StageStats>,
      period: {
        startTime: startTime.toISOString(),
        endTime: now.toISOString(),
        durationMinutes: period,
      },
      generatedAt: now.toISOString(),
    };
  }
  
  /**
   * Detect performance issues
   */
  public detectPerformanceIssues(): PerformanceIssue[] {
    const issues: PerformanceIssue[] = [];
    const report = this.getPerformanceReport(10); // Last 10 minutes
    
    // Check average processing time
    if (report.averageTotalTime > this.config.highLatencyThreshold) {
      issues.push({
        id: `issue-latency-${Date.now()}`,
        type: 'high_latency',
        severity: 'critical',
        description: 'Average processing time exceeds threshold',
        currentValue: report.averageTotalTime,
        threshold: this.config.highLatencyThreshold,
        detectedAt: new Date().toISOString(),
        recommendation: 'Consider scaling up resources or optimizing slow stages',
      });
    }
    
    // Check error rate
    if (report.errorRate > this.config.highErrorRateThreshold) {
      issues.push({
        id: `issue-errors-${Date.now()}`,
        type: 'high_error_rate',
        severity: 'critical',
        description: 'Error rate exceeds acceptable threshold',
        currentValue: report.errorRate,
        threshold: this.config.highErrorRateThreshold,
        detectedAt: new Date().toISOString(),
        recommendation: 'Investigate error logs and fix underlying issues',
      });
    }
    
    // Check cache hit rate
    if (report.cacheEfficiency < this.config.lowCacheHitThreshold) {
      issues.push({
        id: `issue-cache-${Date.now()}`,
        type: 'low_cache_hit',
        severity: 'warning',
        description: 'Cache hit rate is below optimal threshold',
        currentValue: report.cacheEfficiency,
        threshold: this.config.lowCacheHitThreshold,
        detectedAt: new Date().toISOString(),
        recommendation: 'Review cache warming strategies and TTL settings',
      });
    }
    
    // Check token usage
    const tokenUsagePercent = this.tokenUsageToday / this.config.dailyTokenLimit;
    if (tokenUsagePercent > this.config.tokenWarningThreshold) {
      issues.push({
        id: `issue-tokens-${Date.now()}`,
        type: 'high_token_usage',
        severity: tokenUsagePercent > 0.95 ? 'critical' : 'warning',
        description: 'Token usage approaching daily limit',
        currentValue: this.tokenUsageToday,
        threshold: this.config.dailyTokenLimit * this.config.tokenWarningThreshold,
        detectedAt: new Date().toISOString(),
        recommendation: 'Enable aggressive caching or reduce processing volume',
      });
    }
    
    // Check queue depth
    if (this.currentQueueDepth > this.config.queueDepthThreshold) {
      issues.push({
        id: `issue-queue-${Date.now()}`,
        type: 'queue_backup',
        severity: this.currentQueueDepth > this.config.queueDepthThreshold * 2 ? 'critical' : 'warning',
        description: 'Queue depth indicates processing backup',
        currentValue: this.currentQueueDepth,
        threshold: this.config.queueDepthThreshold,
        detectedAt: new Date().toISOString(),
        recommendation: 'Scale up processing capacity or enable batching',
      });
    }
    
    // Store detected issues
    this.detectedIssues.push(...issues);
    
    // Keep only recent issues (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    this.detectedIssues = this.detectedIssues.filter(
      issue => new Date(issue.detectedAt) > oneHourAgo
    );
    
    // Emit alerts
    issues.forEach(issue => {
      logger.warn('Performance issue detected', {
        type: issue.type,
        severity: issue.severity,
        description: issue.description,
        currentValue: issue.currentValue,
        threshold: issue.threshold,
      });
      
      this.emit('performance-issue', issue);
    });
    
    return issues;
  }
  
  /**
   * Get real-time dashboard metrics
   */
  public getDashboardMetrics(): DashboardMetrics {
    const report = this.getPerformanceReport(5); // Last 5 minutes
    
    // Calculate current throughput
    const recentMetrics = this.metrics.filter(
      m => new Date(m.timestamp) > new Date(Date.now() - 60 * 1000) // Last minute
    );
    const currentThroughput = recentMetrics.filter(m => m.stage === 'total').length;
    
    // Get stage latencies
    const stageLatencies: Partial<Record<PipelineStage, number>> = {};
    const stages: PipelineStage[] = ['preprocess', 'classify', 'decide', 'extract', 'llm_call'];
    
    for (const stage of stages) {
      const stageMetrics = recentMetrics.filter(m => m.stage === stage);
      if (stageMetrics.length > 0) {
        const avgDuration = stageMetrics.reduce((sum, m) => sum + m.duration, 0) / stageMetrics.length;
        stageLatencies[stage] = avgDuration;
      }
    }
    
    return {
      currentThroughput,
      avgProcessingTime: report.averageTotalTime,
      errorRate: report.errorRate,
      cacheHitRate: report.cacheEfficiency,
      activeSignals: this.activeSignalsCount,
      queueDepth: this.currentQueueDepth,
      recentIssues: this.detectedIssues.slice(-5), // Last 5 issues
      tokenUsageToday: this.tokenUsageToday,
      stageLatencies: stageLatencies as Record<PipelineStage, number>,
      lastUpdated: new Date().toISOString(),
    };
  }
  
  /**
   * Record queue depth snapshot
   */
  public recordQueueDepth(depth: number, processingRate: number): void {
    this.currentQueueDepth = depth;
    
    this.queueSnapshots.push({
      timestamp: new Date().toISOString(),
      depth,
      processingRate,
    });
    
    // Keep only recent snapshots (last 24 hours)
    const cutoff = new Date(Date.now() - this.config.metricsRetentionPeriod);
    this.queueSnapshots = this.queueSnapshots.filter(
      s => new Date(s.timestamp) > cutoff
    );
  }
  
  /**
   * Update active signals count
   */
  public setActiveSignals(count: number): void {
    this.activeSignalsCount = count;
  }
  
  /**
   * Get queue depth history
   */
  public getQueueHistory(periodMinutes: number = 60): QueueSnapshot[] {
    const cutoff = new Date(Date.now() - periodMinutes * 60 * 1000);
    return this.queueSnapshots.filter(s => new Date(s.timestamp) > cutoff);
  }
  
  /**
   * Clear all metrics
   */
  public clearMetrics(): void {
    this.metrics = [];
    this.queueSnapshots = [];
    this.detectedIssues = [];
    logger.info('Performance metrics cleared');
  }
  
  /**
   * Get metrics count
   */
  public getMetricsCount(): number {
    return this.metrics.length;
  }
  
  /**
   * Update configuration
   */
  public updateConfig(config: Partial<PerformanceMonitorConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Performance monitor configuration updated', { config: this.config });
  }
  
  // ==========================================================================
  // Private Methods
  // ==========================================================================
  
  /**
   * Start periodic logging
   */
  private startLogging(): void {
    this.loggingInterval = setInterval(() => {
      this.logPerformanceReport();
      this.detectPerformanceIssues();
    }, this.config.loggingInterval);
    
    logger.info('Performance logging started', {
      interval: this.config.loggingInterval / 1000 / 60,
      unit: 'minutes',
    });
  }
  
  /**
   * Start periodic cleanup
   */
  private startCleanup(): void {
    // Clean old metrics every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldMetrics();
      this.checkTokenReset();
    }, 60 * 60 * 1000);
  }
  
  /**
   * Log performance report
   */
  private logPerformanceReport(): void {
    const report = this.getPerformanceReport(10); // Last 10 minutes
    
    logger.info('Performance Report', {
      averageTotalTime: `${report.averageTotalTime.toFixed(2)}ms`,
      throughput: `${report.throughput.toFixed(2)} signals/min`,
      errorRate: `${(report.errorRate * 100).toFixed(2)}%`,
      cacheEfficiency: `${(report.cacheEfficiency * 100).toFixed(2)}%`,
      tokenUsage: report.tokenUsage.total,
      tokenCost: `$${report.tokenUsage.cost.toFixed(4)}`,
      stageBreakdown: {
        preprocess: `${(report.stageBreakdown.preprocess || 0).toFixed(2)}ms`,
        classify: `${(report.stageBreakdown.classify || 0).toFixed(2)}ms`,
        decide: `${(report.stageBreakdown.decide || 0).toFixed(2)}ms`,
        extract: `${(report.stageBreakdown.extract || 0).toFixed(2)}ms`,
      },
    });
  }
  
  /**
   * Cleanup old metrics
   */
  private cleanupOldMetrics(): void {
    const cutoff = new Date(Date.now() - this.config.metricsRetentionPeriod);
    const initialCount = this.metrics.length;
    
    this.metrics = this.metrics.filter(m => new Date(m.timestamp) > cutoff);
    
    const removed = initialCount - this.metrics.length;
    if (removed > 0) {
      logger.debug('Old metrics cleaned up', { removed, remaining: this.metrics.length });
    }
  }
  
  /**
   * Check token usage
   */
  private checkTokenUsage(): void {
    const usagePercent = this.tokenUsageToday / this.config.dailyTokenLimit;
    
    if (usagePercent > this.config.tokenWarningThreshold) {
      logger.warn('High token usage detected', {
        used: this.tokenUsageToday,
        limit: this.config.dailyTokenLimit,
        percent: `${(usagePercent * 100).toFixed(2)}%`,
      });
    }
  }
  
  /**
   * Check if token counter needs reset
   */
  private checkTokenReset(): void {
    const now = new Date();
    
    // Reset at midnight
    if (now.getDate() !== this.lastTokenReset.getDate()) {
      logger.info('Daily token counter reset', {
        previousUsage: this.tokenUsageToday,
        cost: `$${((this.tokenUsageToday / 1000) * this.config.costPer1KTokens).toFixed(4)}`,
      });
      
      this.tokenUsageToday = 0;
      this.lastTokenReset = now;
    }
  }
  
  /**
   * Calculate percentile
   */
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  }
  
  /**
   * Stop all intervals
   */
  public stop(): void {
    if (this.loggingInterval) {
      clearInterval(this.loggingInterval);
      this.loggingInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    logger.info('Performance monitor stopped');
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

let monitorInstance: PerformanceMonitor | null = null;

/**
 * Get performance monitor instance
 */
export function getPerformanceMonitor(config?: Partial<PerformanceMonitorConfig>): PerformanceMonitor {
  if (!monitorInstance) {
    monitorInstance = PerformanceMonitor.getInstance(config);
  }
  return monitorInstance;
}

/**
 * Record a performance metric
 */
export function recordMetric(
  stage: PipelineStage,
  duration: number,
  metadata: MetricMetadata
): void {
  const monitor = getPerformanceMonitor();
  monitor.recordMetric(stage, duration, metadata);
}

/**
 * Get performance report
 */
export function getPerformanceReport(periodMinutes?: number): PerformanceReport {
  const monitor = getPerformanceMonitor();
  return monitor.getPerformanceReport(periodMinutes);
}

/**
 * Detect performance issues
 */
export function detectPerformanceIssues(): PerformanceIssue[] {
  const monitor = getPerformanceMonitor();
  return monitor.detectPerformanceIssues();
}

/**
 * Get dashboard metrics
 */
export function getDashboardMetrics(): DashboardMetrics {
  const monitor = getPerformanceMonitor();
  return monitor.getDashboardMetrics();
}

/**
 * Record queue depth
 */
export function recordQueueDepth(depth: number, processingRate: number): void {
  const monitor = getPerformanceMonitor();
  monitor.recordQueueDepth(depth, processingRate);
}

/**
 * Set active signals count
 */
export function setActiveSignals(count: number): void {
  const monitor = getPerformanceMonitor();
  monitor.setActiveSignals(count);
}

/**
 * Get queue history
 */
export function getQueueHistory(periodMinutes?: number): QueueSnapshot[] {
  const monitor = getPerformanceMonitor();
  return monitor.getQueueHistory(periodMinutes);
}
