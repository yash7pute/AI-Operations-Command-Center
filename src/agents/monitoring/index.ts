/**
 * Monitoring Module
 * 
 * Performance tracking and monitoring for AI Operations Command Center
 */

export {
  // Main class
  PerformanceMonitor,
  
  // Convenience functions
  getPerformanceMonitor,
  recordMetric,
  getPerformanceReport,
  detectPerformanceIssues,
  getDashboardMetrics,
  recordQueueDepth,
  setActiveSignals,
  getQueueHistory,
  
  // Types
  PipelineStage,
  MetricMetadata,
  PerformanceMetric,
  StageStats,
  PerformanceReport,
  PerformanceIssue,
  QueueSnapshot,
  DashboardMetrics,
  PerformanceMonitorConfig,
} from './performance-monitor';
