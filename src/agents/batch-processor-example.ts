/**
 * Batch Processor - Example Usage
 * 
 * Demonstrates how to use the BatchProcessor for efficient signal processing
 */

import {
  getBatchProcessor,
  addSignalToQueue,
  processBatchSignals,
  getBatchStats,
  getBatchHistory,
  processQueueNow,
} from './index';
import { Signal } from './reasoning/context-builder';

// ============================================================================
// Example 1: Basic Batch Processing
// ============================================================================

async function basicBatchProcessing() {
  console.log('\n=== Example 1: Basic Batch Processing ===\n');
  
  // Create sample signals
  const signals: Signal[] = [
    {
      id: 'sig-1',
      source: 'email',
      subject: 'URGENT: Production server down',
      body: 'Our main production server is down. Need immediate attention.',
      sender: 'alerts@company.com',
      timestamp: new Date().toISOString(),
    },
    {
      id: 'sig-2',
      source: 'email',
      subject: 'Re: Meeting next week',
      body: 'Confirming attendance for the meeting.',
      sender: 'john@company.com',
      timestamp: new Date().toISOString(),
    },
    {
      id: 'sig-3',
      source: 'slack',
      subject: 'Critical: Database backup failed',
      body: 'Last night\'s database backup job failed. Please check.',
      sender: 'alerts@company.com',
      timestamp: new Date().toISOString(),
    },
    {
      id: 'sig-4',
      source: 'email',
      subject: 'Re: Meeting next week',
      body: 'I will join remotely.',
      sender: 'sarah@company.com',
      timestamp: new Date().toISOString(),
    },
    {
      id: 'sig-5',
      source: 'email',
      subject: 'FYI: Server maintenance scheduled',
      body: 'Maintenance window scheduled for Saturday 2-4 AM.',
      sender: 'ops@company.com',
      timestamp: new Date().toISOString(),
    },
  ];
  
  // Process batch
  const results = await processBatchSignals(signals, 10);
  
  console.log('Batch Processing Results:');
  console.log(`- Total batches: ${results.length}`);
  console.log(`- Total signals processed: ${results.reduce((sum, r) => sum + r.signalsProcessed, 0)}`);
  console.log(`- Total LLM calls: ${results.reduce((sum, r) => sum + r.llmCallsMade, 0)}`);
  console.log(`- Total tokens saved: ${results.reduce((sum, r) => sum + r.tokensSaved, 0)}`);
  console.log(`- Processing time: ${results.reduce((sum, r) => sum + r.processingTime, 0)}ms`);
  
  // Show individual classifications
  results.forEach((result, idx) => {
    console.log(`\nBatch ${idx + 1} Classifications:`);
    result.results.forEach((classification, signalId) => {
      console.log(`  Signal ${signalId}:`);
      console.log(`    - Urgency: ${classification.urgency}`);
      console.log(`    - Category: ${classification.category}`);
      console.log(`    - Confidence: ${classification.confidence}`);
      console.log(`    - Actions: ${classification.suggestedActions.join(', ')}`);
    });
  });
}

// ============================================================================
// Example 2: Adaptive Queue Processing
// ============================================================================

async function adaptiveQueueProcessing() {
  console.log('\n=== Example 2: Adaptive Queue Processing ===\n');
  
  const processor = getBatchProcessor({
    maxBatchSize: 5,
    batchWaitTime: 30000, // 30 seconds
    enableAdaptiveBatching: true,
    processImmediatelyWhenEmpty: true,
  });
  
  // Add non-urgent signals (will wait for batch)
  console.log('Adding non-urgent signals to queue...');
  await addSignalToQueue({
    id: 'sig-6',
    source: 'email',
    subject: 'Weekly status update',
    body: 'Here is this week\'s progress report.',
    sender: 'manager@company.com',
    timestamp: new Date().toISOString(),
  });
  
  await addSignalToQueue({
    id: 'sig-7',
    source: 'slack',
    subject: 'Team lunch tomorrow?',
    body: 'Anyone interested in team lunch tomorrow?',
    sender: 'john@company.com',
    timestamp: new Date().toISOString(),
  });
  
  console.log('Signals queued, waiting for batch timer...');
  console.log(`Queue size: ${processor.getQueueSize()}`);
  
  // Add urgent signal (should trigger immediate processing)
  console.log('\nAdding URGENT signal...');
  await addSignalToQueue({
    id: 'sig-8',
    source: 'email',
    subject: 'CRITICAL: Security breach detected',
    body: 'Unauthorized access attempt detected. Immediate action required.',
    sender: 'security@company.com',
    timestamp: new Date().toISOString(),
  });
  
  // Give it a moment to process
  await new Promise(resolve => setTimeout(resolve, 200));
  
  console.log(`Queue size after urgent signal: ${processor.getQueueSize()}`);
}

// ============================================================================
// Example 3: Signal Grouping by Similarity
// ============================================================================

async function signalGroupingDemo() {
  console.log('\n=== Example 3: Signal Grouping by Similarity ===\n');
  
  // Create signals that should be grouped together
  const emailThread: Signal[] = [
    {
      id: 'sig-10',
      source: 'email',
      subject: 'Project Alpha - Initial proposal',
      body: 'Here is the initial proposal for Project Alpha.',
      sender: 'alice@company.com',
      timestamp: new Date().toISOString(),
    },
    {
      id: 'sig-11',
      source: 'email',
      subject: 'Re: Project Alpha - Initial proposal',
      body: 'Thanks for the proposal. I have some feedback.',
      sender: 'bob@company.com',
      timestamp: new Date(Date.now() + 1000).toISOString(),
    },
    {
      id: 'sig-12',
      source: 'email',
      subject: 'Re: Project Alpha - Initial proposal',
      body: 'Great work! Let\'s schedule a meeting to discuss.',
      sender: 'charlie@company.com',
      timestamp: new Date(Date.now() + 2000).toISOString(),
    },
  ];
  
  const alertSignals: Signal[] = [
    {
      id: 'sig-13',
      source: 'email',
      subject: 'Server Alert: High CPU usage',
      body: 'Server web-01 CPU at 95%',
      sender: 'alerts@company.com',
      timestamp: new Date().toISOString(),
    },
    {
      id: 'sig-14',
      source: 'email',
      subject: 'Server Alert: High memory usage',
      body: 'Server web-01 memory at 90%',
      sender: 'alerts@company.com',
      timestamp: new Date(Date.now() + 500).toISOString(),
    },
  ];
  
  const allSignals = [...emailThread, ...alertSignals];
  
  console.log('Processing signals with automatic grouping...');
  const results = await processBatchSignals(allSignals);
  
  console.log(`\nGrouping Results:`);
  console.log(`- Total signals: ${allSignals.length}`);
  console.log(`- LLM calls made: ${results.reduce((sum, r) => sum + r.llmCallsMade, 0)}`);
  console.log(`- Efficiency: ${(allSignals.length / results.reduce((sum, r) => sum + r.llmCallsMade, 0)).toFixed(2)} signals per LLM call`);
}

// ============================================================================
// Example 4: Batch Statistics and Monitoring
// ============================================================================

async function batchStatisticsDemo() {
  console.log('\n=== Example 4: Batch Statistics and Monitoring ===\n');
  
  // Process some batches
  const signals: Signal[] = Array.from({ length: 25 }, (_, i) => ({
    id: `sig-${20 + i}`,
    source: 'email' as const,
    subject: `Signal ${i + 1}`,
    body: `This is test signal number ${i + 1}`,
    sender: `user${i % 3}@company.com`,
    timestamp: new Date().toISOString(),
  }));
  
  await processBatchSignals(signals, 10);
  
  // Get statistics
  const stats = getBatchStats();
  
  console.log('Batch Processing Statistics:');
  console.log(`- Total batches processed: ${stats.totalBatches}`);
  console.log(`- Total signals processed: ${stats.totalSignalsProcessed}`);
  console.log(`- Average signals per batch: ${stats.avgSignalsPerBatch.toFixed(2)}`);
  console.log(`- Total LLM calls: ${stats.totalLlmCalls}`);
  console.log(`- Average LLM calls per batch: ${stats.avgLlmCallsPerBatch.toFixed(2)}`);
  console.log(`- Efficiency rate: ${stats.efficiencyRate.toFixed(2)} signals per LLM call`);
  console.log(`- Total tokens saved: ${stats.totalTokensSaved}`);
  console.log(`- Total time saved: ${stats.totalTimeSaved}ms`);
  console.log(`- Average processing time: ${stats.avgProcessingTime.toFixed(2)}ms per batch`);
  console.log(`- Average time per signal: ${stats.avgTimePerSignal.toFixed(2)}ms`);
  console.log(`- Current queue size: ${stats.currentQueueSize}`);
  
  // Get recent batch history
  const history = getBatchHistory(3);
  
  console.log('\nRecent Batch History:');
  history.forEach((batch, idx) => {
    console.log(`\nBatch ${idx + 1}:`);
    console.log(`  - ID: ${batch.batchId}`);
    console.log(`  - Signals processed: ${batch.signalsProcessed}`);
    console.log(`  - LLM calls: ${batch.llmCallsMade}`);
    console.log(`  - Tokens saved: ${batch.tokensSaved}`);
    console.log(`  - Processing time: ${batch.processingTime}ms`);
    console.log(`  - Errors: ${batch.errors.length}`);
  });
}

// ============================================================================
// Example 5: Manual Queue Control
// ============================================================================

async function manualQueueControl() {
  console.log('\n=== Example 5: Manual Queue Control ===\n');
  
  const processor = getBatchProcessor();
  
  // Add signals to queue
  console.log('Adding signals to queue...');
  for (let i = 0; i < 8; i++) {
    await addSignalToQueue({
      id: `sig-${50 + i}`,
      source: 'slack',
      subject: `Message ${i + 1}`,
      body: `This is message number ${i + 1}`,
      sender: 'user@company.com',
      timestamp: new Date().toISOString(),
    });
  }
  
  console.log(`Queue size: ${processor.getQueueSize()}`);
  
  // Process queue immediately
  console.log('\nProcessing queue now...');
  const result = await processQueueNow();
  
  if (result) {
    console.log('Batch processed:');
    console.log(`  - Signals: ${result.signalsProcessed}`);
    console.log(`  - LLM calls: ${result.llmCallsMade}`);
    console.log(`  - Time: ${result.processingTime}ms`);
  }
  
  console.log(`Queue size after processing: ${processor.getQueueSize()}`);
}

// ============================================================================
// Example 6: Token Savings Calculation
// ============================================================================

async function tokenSavingsDemo() {
  console.log('\n=== Example 6: Token Savings Calculation ===\n');
  
  // Create 10 similar signals from same sender
  const signals: Signal[] = Array.from({ length: 10 }, (_, i) => ({
    id: `sig-${60 + i}`,
    source: 'email' as const,
    subject: `Daily Report - Day ${i + 1}`,
    body: `Daily metrics report for day ${i + 1}. All systems normal.`,
    sender: 'reports@company.com',
    timestamp: new Date().toISOString(),
  }));
  
  console.log('Scenario: 10 similar signals from same sender');
  console.log('\nWithout batching:');
  console.log('  - Individual calls: 10');
  console.log('  - Estimated tokens: 10 × 500 = 5,000 tokens');
  console.log('  - Estimated time: 10 × 2s = 20s');
  
  const results = await processBatchSignals(signals);
  const totalTokensSaved = results.reduce((sum, r) => sum + r.tokensSaved, 0);
  const totalTimeSaved = results.reduce((sum, r) => sum + r.processingTime, 0);
  const totalLlmCalls = results.reduce((sum, r) => sum + r.llmCallsMade, 0);
  
  console.log('\nWith batching:');
  console.log(`  - Batch calls: ${totalLlmCalls}`);
  console.log(`  - Actual tokens: ~${5000 - totalTokensSaved} tokens`);
  console.log(`  - Actual time: ${totalTimeSaved}ms`);
  console.log(`  - Tokens saved: ${totalTokensSaved} (~${((totalTokensSaved / 5000) * 100).toFixed(1)}%)`);
  console.log(`  - Time saved: ~${20000 - totalTimeSaved}ms (~${(((20000 - totalTimeSaved) / 20000) * 100).toFixed(1)}%)`);
  console.log(`  - Efficiency: ${(signals.length / totalLlmCalls).toFixed(2)} signals per LLM call`);
}

// ============================================================================
// Run All Examples
// ============================================================================

async function runAllExamples() {
  try {
    await basicBatchProcessing();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await adaptiveQueueProcessing();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await signalGroupingDemo();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await batchStatisticsDemo();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await manualQueueControl();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await tokenSavingsDemo();
    
    console.log('\n\n✅ All examples completed successfully!\n');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  runAllExamples();
}

export {
  basicBatchProcessing,
  adaptiveQueueProcessing,
  signalGroupingDemo,
  batchStatisticsDemo,
  manualQueueControl,
  tokenSavingsDemo,
};
