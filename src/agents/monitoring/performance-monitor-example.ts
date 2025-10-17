/**
 * Performance Monitor - Comprehensive Usage Examples
 * 
 * Demonstrates all features of the performance monitoring system.
 */

import {
  getPerformanceMonitor,
  recordMetric,
  getPerformanceReport,
  detectPerformanceIssues,
  getDashboardMetrics,
  recordQueueDepth,
  setActiveSignals,
  getQueueHistory,
  type PerformanceMonitor,
  type PerformanceReport,
  type PerformanceIssue,
  type DashboardMetrics,
  type PipelineStage,
  type MetricMetadata,
} from './performance-monitor';

// ============================================================================
// Example 1: Basic Metric Recording
// ============================================================================

async function example1_BasicMetricRecording() {
  console.log('\n=== Example 1: Basic Metric Recording ===\n');
  
  const monitor = getPerformanceMonitor();
  
  // Record preprocessing stage
  recordMetric('preprocess', 150, {
    signalId: 'signal-001',
    source: 'email',
    success: true,
  });
  
  // Record classification stage with token usage
  recordMetric('classify', 850, {
    signalId: 'signal-001',
    success: true,
    tokensUsed: 450,
  });
  
  // Record decision stage with cache hit
  recordMetric('decide', 320, {
    signalId: 'signal-001',
    success: true,
    cacheHit: false,
    tokensUsed: 280,
  });
  
  // Record extraction stage
  recordMetric('extract', 95, {
    signalId: 'signal-001',
    success: true,
  });
  
  // Record total processing time
  recordMetric('total', 1415, {
    signalId: 'signal-001',
    source: 'email',
    success: true,
    tokensUsed: 730,
  });
  
  console.log('✅ Successfully recorded metrics for signal-001');
  console.log(`Total metrics: ${monitor.getMetricsCount()}`);
}

// ============================================================================
// Example 2: Recording with Errors
// ============================================================================

async function example2_RecordingWithErrors() {
  console.log('\n=== Example 2: Recording with Errors ===\n');
  
  // Successful signal
  recordMetric('preprocess', 120, {
    signalId: 'signal-002',
    source: 'slack',
    success: true,
  });
  
  recordMetric('classify', 780, {
    signalId: 'signal-002',
    success: true,
    tokensUsed: 420,
  });
  
  // Failed decision stage
  recordMetric('decide', 450, {
    signalId: 'signal-002',
    success: false,
    error: 'LLM timeout - model overloaded',
  });
  
  recordMetric('total', 1350, {
    signalId: 'signal-002',
    source: 'slack',
    success: false,
    error: 'Decision stage failed',
    tokensUsed: 420,
  });
  
  console.log('✅ Recorded metrics with error for signal-002');
}

// ============================================================================
// Example 3: Cache Hit Recording
// ============================================================================

async function example3_CacheHitRecording() {
  console.log('\n=== Example 3: Cache Hit Recording ===\n');
  
  // Signal with cache hits
  recordMetric('preprocess', 95, {
    signalId: 'signal-003',
    source: 'email',
    success: true,
  });
  
  // Cache lookup
  recordMetric('cache_lookup', 5, {
    signalId: 'signal-003',
    success: true,
    cacheHit: true,
  });
  
  // Classification from cache (much faster)
  recordMetric('classify', 10, {
    signalId: 'signal-003',
    success: true,
    cacheHit: true,
    tokensUsed: 0, // No tokens used for cache hit
  });
  
  // Decision from cache
  recordMetric('decide', 8, {
    signalId: 'signal-003',
    success: true,
    cacheHit: true,
    tokensUsed: 0,
  });
  
  recordMetric('extract', 45, {
    signalId: 'signal-003',
    success: true,
  });
  
  recordMetric('total', 163, {
    signalId: 'signal-003',
    source: 'email',
    success: true,
    tokensUsed: 0,
  });
  
  console.log('✅ Recorded cache-optimized metrics for signal-003');
}

// ============================================================================
// Example 4: Batch Processing Metrics
// ============================================================================

async function example4_BatchProcessingMetrics() {
  console.log('\n=== Example 4: Batch Processing Metrics ===\n');
  
  // Batch of 5 signals processed together
  recordMetric('preprocess', 280, {
    signalId: 'batch-001',
    success: true,
    batchSize: 5,
  });
  
  recordMetric('classify', 1200, {
    signalId: 'batch-001',
    success: true,
    tokensUsed: 1800,
    batchSize: 5,
  });
  
  recordMetric('decide', 950, {
    signalId: 'batch-001',
    success: true,
    tokensUsed: 1400,
    batchSize: 5,
  });
  
  recordMetric('total', 2430, {
    signalId: 'batch-001',
    success: true,
    tokensUsed: 3200,
    batchSize: 5,
  });
  
  console.log('✅ Recorded batch processing metrics (5 signals)');
  console.log('Average per signal: ~486ms, ~640 tokens');
}

// ============================================================================
// Example 5: Getting Performance Report
// ============================================================================

async function example5_PerformanceReport() {
  console.log('\n=== Example 5: Getting Performance Report ===\n');
  
  const report: PerformanceReport = getPerformanceReport(60); // Last 60 minutes
  
  console.log('📊 Performance Report (Last 60 minutes):');
  console.log('─────────────────────────────────────────');
  console.log(`Average Total Time: ${report.averageTotalTime.toFixed(2)}ms`);
  console.log(`Throughput: ${report.throughput.toFixed(2)} signals/min`);
  console.log(`Error Rate: ${(report.errorRate * 100).toFixed(2)}%`);
  console.log(`Cache Efficiency: ${(report.cacheEfficiency * 100).toFixed(2)}%`);
  console.log('\n💰 Token Usage:');
  console.log(`  Total: ${report.tokenUsage.total.toLocaleString()} tokens`);
  console.log(`  Cost: $${report.tokenUsage.cost.toFixed(4)}`);
  console.log(`  Avg per Signal: ${report.tokenUsage.avgPerSignal.toFixed(0)} tokens`);
  
  console.log('\n⏱️  Stage Breakdown:');
  if (report.stageBreakdown.preprocess) {
    console.log(`  Preprocess: ${report.stageBreakdown.preprocess.toFixed(2)}ms`);
  }
  if (report.stageBreakdown.classify) {
    console.log(`  Classify: ${report.stageBreakdown.classify.toFixed(2)}ms`);
  }
  if (report.stageBreakdown.decide) {
    console.log(`  Decide: ${report.stageBreakdown.decide.toFixed(2)}ms`);
  }
  if (report.stageBreakdown.extract) {
    console.log(`  Extract: ${report.stageBreakdown.extract.toFixed(2)}ms`);
  }
  
  console.log('\n📈 Detailed Stage Statistics:');
  Object.entries(report.detailedStats).forEach(([stage, stats]) => {
    if (stats.count > 0) {
      console.log(`\n  ${stage}:`);
      console.log(`    Count: ${stats.count}`);
      console.log(`    Avg: ${stats.avgDuration.toFixed(2)}ms`);
      console.log(`    Min: ${stats.minDuration.toFixed(2)}ms`);
      console.log(`    Max: ${stats.maxDuration.toFixed(2)}ms`);
      console.log(`    P50: ${stats.p50.toFixed(2)}ms`);
      console.log(`    P95: ${stats.p95.toFixed(2)}ms`);
      console.log(`    P99: ${stats.p99.toFixed(2)}ms`);
      console.log(`    Error Rate: ${(stats.errorRate * 100).toFixed(2)}%`);
    }
  });
  
  console.log('\n📅 Report Period:');
  console.log(`  Start: ${new Date(report.period.startTime).toLocaleString()}`);
  console.log(`  End: ${new Date(report.period.endTime).toLocaleString()}`);
  console.log(`  Duration: ${report.period.durationMinutes} minutes`);
}

// ============================================================================
// Example 6: Detecting Performance Issues
// ============================================================================

async function example6_DetectingIssues() {
  console.log('\n=== Example 6: Detecting Performance Issues ===\n');
  
  // Simulate slow processing
  for (let i = 0; i < 5; i++) {
    recordMetric('total', 6500, {
      signalId: `slow-signal-${i}`,
      source: 'email',
      success: true,
      tokensUsed: 500,
    });
  }
  
  // Simulate high error rate
  for (let i = 0; i < 10; i++) {
    recordMetric('total', 1200, {
      signalId: `error-signal-${i}`,
      source: 'slack',
      success: false,
      error: 'API rate limit exceeded',
    });
  }
  
  // Detect issues
  const issues: PerformanceIssue[] = detectPerformanceIssues();
  
  console.log(`🚨 Detected ${issues.length} performance issues:\n`);
  
  issues.forEach((issue, index) => {
    console.log(`Issue ${index + 1}:`);
    console.log(`  Type: ${issue.type}`);
    console.log(`  Severity: ${issue.severity}`);
    console.log(`  Description: ${issue.description}`);
    console.log(`  Current Value: ${issue.currentValue.toFixed(2)}`);
    console.log(`  Threshold: ${issue.threshold.toFixed(2)}`);
    console.log(`  Recommendation: ${issue.recommendation}`);
    console.log(`  Detected At: ${new Date(issue.detectedAt).toLocaleString()}`);
    console.log('');
  });
}

// ============================================================================
// Example 7: Dashboard Metrics
// ============================================================================

async function example7_DashboardMetrics() {
  console.log('\n=== Example 7: Dashboard Metrics ===\n');
  
  // Update active signals
  setActiveSignals(12);
  
  // Record queue depth
  recordQueueDepth(45, 8.5);
  
  const dashboard: DashboardMetrics = getDashboardMetrics();
  
  console.log('📊 Real-Time Dashboard:');
  console.log('─────────────────────────────────────────');
  console.log(`⚡ Current Throughput: ${dashboard.currentThroughput} signals/min`);
  console.log(`⏱️  Avg Processing Time: ${dashboard.avgProcessingTime.toFixed(2)}ms`);
  console.log(`❌ Error Rate: ${(dashboard.errorRate * 100).toFixed(2)}%`);
  console.log(`💾 Cache Hit Rate: ${(dashboard.cacheHitRate * 100).toFixed(2)}%`);
  console.log(`🔄 Active Signals: ${dashboard.activeSignals}`);
  console.log(`📋 Queue Depth: ${dashboard.queueDepth}`);
  console.log(`🪙 Tokens Used Today: ${dashboard.tokenUsageToday.toLocaleString()}`);
  
  console.log('\n⏱️  Stage Latencies:');
  Object.entries(dashboard.stageLatencies).forEach(([stage, latency]) => {
    console.log(`  ${stage}: ${latency.toFixed(2)}ms`);
  });
  
  if (dashboard.recentIssues.length > 0) {
    console.log(`\n⚠️  Recent Issues (${dashboard.recentIssues.length}):`);
    dashboard.recentIssues.forEach(issue => {
      console.log(`  - [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.description}`);
    });
  } else {
    console.log('\n✅ No recent issues');
  }
  
  console.log(`\n🕐 Last Updated: ${new Date(dashboard.lastUpdated).toLocaleString()}`);
}

// ============================================================================
// Example 8: Queue Depth Tracking
// ============================================================================

async function example8_QueueDepthTracking() {
  console.log('\n=== Example 8: Queue Depth Tracking ===\n');
  
  // Simulate queue depth changes over time
  const timestamps = [
    { depth: 20, rate: 10.5 },
    { depth: 35, rate: 9.2 },
    { depth: 52, rate: 8.1 },
    { depth: 68, rate: 7.5 },
    { depth: 85, rate: 6.8 },
    { depth: 95, rate: 6.2 },
    { depth: 110, rate: 5.5 }, // Queue backup
  ];
  
  timestamps.forEach(({ depth, rate }) => {
    recordQueueDepth(depth, rate);
  });
  
  const history = getQueueHistory(60);
  
  console.log(`📊 Queue Depth History (${history.length} snapshots):\n`);
  
  history.forEach((snapshot, index) => {
    const indicator = snapshot.depth > 100 ? '🔴' : snapshot.depth > 50 ? '🟡' : '🟢';
    console.log(`${indicator} Snapshot ${index + 1}:`);
    console.log(`  Time: ${new Date(snapshot.timestamp).toLocaleTimeString()}`);
    console.log(`  Depth: ${snapshot.depth} signals`);
    console.log(`  Processing Rate: ${snapshot.processingRate.toFixed(1)} signals/min`);
    console.log('');
  });
  
  // Analyze trend
  if (history.length >= 2) {
    const first = history[0];
    const last = history[history.length - 1];
    const depthChange = last.depth - first.depth;
    const rateChange = last.processingRate - first.processingRate;
    
    console.log('📈 Trend Analysis:');
    console.log(`  Queue Depth: ${depthChange > 0 ? '+' : ''}${depthChange} signals`);
    console.log(`  Processing Rate: ${rateChange > 0 ? '+' : ''}${rateChange.toFixed(1)} signals/min`);
    
    if (depthChange > 20) {
      console.log('  ⚠️  WARNING: Queue is growing - consider scaling up');
    } else if (depthChange < -20) {
      console.log('  ✅ Queue is being processed efficiently');
    }
  }
}

// ============================================================================
// Example 9: Custom Configuration
// ============================================================================

async function example9_CustomConfiguration() {
  console.log('\n=== Example 9: Custom Configuration ===\n');
  
  const monitor = getPerformanceMonitor({
    highLatencyThreshold: 3000, // More strict - 3 seconds
    highErrorRateThreshold: 0.03, // More strict - 3%
    lowCacheHitThreshold: 0.50, // More strict - 50%
    dailyTokenLimit: 500000, // Lower limit
    tokenWarningThreshold: 0.70, // Earlier warning at 70%
    loggingInterval: 5 * 60 * 1000, // 5 minutes
    queueDepthThreshold: 50, // Lower threshold
    costPer1KTokens: 0.003, // Higher cost model
  });
  
  console.log('✅ Performance monitor configured with custom thresholds:');
  console.log('  - Latency threshold: 3000ms');
  console.log('  - Error rate threshold: 3%');
  console.log('  - Cache hit threshold: 50%');
  console.log('  - Daily token limit: 500,000');
  console.log('  - Token warning at: 70%');
  console.log('  - Logging interval: 5 minutes');
  console.log('  - Queue depth threshold: 50');
  console.log('  - Cost per 1K tokens: $0.003');
  
  // Record some metrics
  recordMetric('total', 3500, {
    signalId: 'test-001',
    success: true,
    tokensUsed: 400,
  });
  
  // Check for issues with new thresholds
  const issues = detectPerformanceIssues();
  
  if (issues.length > 0) {
    console.log('\n🚨 Issues detected with stricter thresholds:');
    issues.forEach(issue => {
      console.log(`  - ${issue.type}: ${issue.description}`);
    });
  }
}

// ============================================================================
// Example 10: Performance Monitoring Lifecycle
// ============================================================================

async function example10_MonitoringLifecycle() {
  console.log('\n=== Example 10: Performance Monitoring Lifecycle ===\n');
  
  const monitor = getPerformanceMonitor();
  
  // Set up event listeners
  monitor.on('metric-recorded', (metric) => {
    console.log(`📊 Metric recorded: ${metric.stage} - ${metric.duration}ms`);
  });
  
  monitor.on('performance-issue', (issue) => {
    console.log(`🚨 Performance issue: ${issue.type} (${issue.severity})`);
  });
  
  console.log('✅ Event listeners registered\n');
  
  // Simulate a complete signal processing
  console.log('Processing signal-lifecycle-001...');
  
  setActiveSignals(1);
  
  recordMetric('preprocess', 120, {
    signalId: 'signal-lifecycle-001',
    source: 'email',
    success: true,
  });
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  recordMetric('cache_lookup', 8, {
    signalId: 'signal-lifecycle-001',
    success: true,
    cacheHit: false,
  });
  
  recordMetric('classify', 890, {
    signalId: 'signal-lifecycle-001',
    success: true,
    tokensUsed: 470,
  });
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  recordMetric('decide', 340, {
    signalId: 'signal-lifecycle-001',
    success: true,
    tokensUsed: 290,
  });
  
  recordMetric('extract', 78, {
    signalId: 'signal-lifecycle-001',
    success: true,
  });
  
  recordMetric('total', 1436, {
    signalId: 'signal-lifecycle-001',
    source: 'email',
    success: true,
    tokensUsed: 760,
  });
  
  setActiveSignals(0);
  recordQueueDepth(15, 12.5);
  
  console.log('\n✅ Signal processing complete');
  
  // Get final dashboard view
  const dashboard = getDashboardMetrics();
  console.log('\n📊 Final Dashboard State:');
  console.log(`  Active Signals: ${dashboard.activeSignals}`);
  console.log(`  Queue Depth: ${dashboard.queueDepth}`);
  console.log(`  Tokens Used: ${dashboard.tokenUsageToday}`);
}

// ============================================================================
// Example 11: Real-World Integration
// ============================================================================

async function example11_RealWorldIntegration() {
  console.log('\n=== Example 11: Real-World Integration ===\n');
  
  console.log('Simulating real-world signal processing...\n');
  
  // Process 20 signals with realistic patterns
  for (let i = 1; i <= 20; i++) {
    const signalId = `signal-${String(i).padStart(3, '0')}`;
    const source = ['email', 'slack', 'notion'][i % 3];
    
    // Some signals are cached
    const isCached = i % 4 === 0;
    
    // Some signals fail
    const hasFailed = i % 7 === 0;
    
    setActiveSignals(i % 3 + 1); // 1-3 active signals
    recordQueueDepth(25 - i, 10 + i * 0.5);
    
    // Preprocess
    recordMetric('preprocess', 80 + Math.random() * 100, {
      signalId,
      source,
      success: true,
    });
    
    if (isCached) {
      // Cached path - fast
      recordMetric('cache_lookup', 3 + Math.random() * 5, {
        signalId,
        success: true,
        cacheHit: true,
      });
      
      recordMetric('classify', 8 + Math.random() * 10, {
        signalId,
        success: true,
        cacheHit: true,
        tokensUsed: 0,
      });
      
      recordMetric('decide', 6 + Math.random() * 8, {
        signalId,
        success: true,
        cacheHit: true,
        tokensUsed: 0,
      });
      
      recordMetric('extract', 40 + Math.random() * 30, {
        signalId,
        success: true,
      });
      
      recordMetric('total', 150 + Math.random() * 50, {
        signalId,
        source,
        success: true,
        tokensUsed: 0,
      });
    } else if (hasFailed) {
      // Failed processing
      recordMetric('classify', 600 + Math.random() * 400, {
        signalId,
        success: false,
        error: 'LLM API timeout',
        tokensUsed: 200,
      });
      
      recordMetric('total', 1200 + Math.random() * 500, {
        signalId,
        source,
        success: false,
        error: 'Classification failed',
        tokensUsed: 200,
      });
    } else {
      // Normal processing
      recordMetric('cache_lookup', 4 + Math.random() * 6, {
        signalId,
        success: true,
        cacheHit: false,
      });
      
      recordMetric('classify', 700 + Math.random() * 400, {
        signalId,
        success: true,
        tokensUsed: 400 + Math.floor(Math.random() * 200),
      });
      
      recordMetric('decide', 300 + Math.random() * 200, {
        signalId,
        success: true,
        tokensUsed: 250 + Math.floor(Math.random() * 150),
      });
      
      recordMetric('extract', 70 + Math.random() * 60, {
        signalId,
        success: true,
      });
      
      recordMetric('total', 1200 + Math.random() * 600, {
        signalId,
        source,
        success: true,
        tokensUsed: 650 + Math.floor(Math.random() * 350),
      });
    }
    
    // Brief pause between signals
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  console.log('✅ Processed 20 signals\n');
  
  // Generate comprehensive report
  const report = getPerformanceReport(60);
  
  console.log('📊 Processing Summary:');
  console.log('─────────────────────────────────────────');
  console.log(`Total Signals: 20`);
  console.log(`Avg Time: ${report.averageTotalTime.toFixed(2)}ms`);
  console.log(`Throughput: ${report.throughput.toFixed(2)} signals/min`);
  console.log(`Success Rate: ${((1 - report.errorRate) * 100).toFixed(2)}%`);
  console.log(`Cache Hit Rate: ${(report.cacheEfficiency * 100).toFixed(2)}%`);
  console.log(`Total Tokens: ${report.tokenUsage.total.toLocaleString()}`);
  console.log(`Total Cost: $${report.tokenUsage.cost.toFixed(4)}`);
  
  // Check for issues
  const issues = detectPerformanceIssues();
  if (issues.length > 0) {
    console.log(`\n⚠️  ${issues.length} issue(s) detected - review recommended`);
  } else {
    console.log('\n✅ No performance issues detected');
  }
  
  // Dashboard snapshot
  const dashboard = getDashboardMetrics();
  console.log('\n📊 Dashboard Snapshot:');
  console.log(`  Current Throughput: ${dashboard.currentThroughput} signals/min`);
  console.log(`  Active Signals: ${dashboard.activeSignals}`);
  console.log(`  Queue Depth: ${dashboard.queueDepth}`);
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     Performance Monitor - Comprehensive Usage Examples        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  try {
    await example1_BasicMetricRecording();
    await example2_RecordingWithErrors();
    await example3_CacheHitRecording();
    await example4_BatchProcessingMetrics();
    await example5_PerformanceReport();
    await example6_DetectingIssues();
    await example7_DashboardMetrics();
    await example8_QueueDepthTracking();
    await example9_CustomConfiguration();
    await example10_MonitoringLifecycle();
    await example11_RealWorldIntegration();
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║           ✅ All Examples Completed Successfully              ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('❌ Error running examples:', error);
    throw error;
  } finally {
    // Cleanup
    const monitor = getPerformanceMonitor();
    monitor.stop();
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main };
