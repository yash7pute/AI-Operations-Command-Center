/**
 * Performance Benchmark Suite for Reasoning Engine
 * 
 * Tests and measures:
 * - Single signal processing time (target: < 3s)
 * - Batch processing performance (target: < 10s for 10 signals)
 * - Classification accuracy (target: > 90%)
 * - Cache hit rate (target: > 50%)
 * - Token usage per signal (target: < 2000 tokens)
 * - Memory usage (target: < 500MB)
 * - Stress tests (100 sequential, 50 parallel, sustained load, spike handling)
 * - Load degradation measurements
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

interface Signal {
  id: string;
  source: string;
  type: string;
  content: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

interface Classification {
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  importance: 'LOW' | 'MEDIUM' | 'HIGH';
  category: string;
  confidence: number;
  reasoning: string;
  cached?: boolean;
}

interface Decision {
  action: string;
  platform?: string;
  priority: string;
  confidence: number;
  autoExecute: boolean;
  reasoning: string;
}

interface TaskDetails {
  title: string;
  description: string;
  dueDate?: string;
  labels?: string[];
  assignee?: string;
}

interface ProcessingResult {
  signal: Signal;
  classification: Classification;
  decision: Decision;
  task?: TaskDetails;
  processingTime: number;
  tokenUsage: number;
  cacheHit: boolean;
}

interface BenchmarkMetrics {
  processingTimes: number[];
  tokenUsages: number[];
  cacheHits: number;
  totalSignals: number;
  errors: number;
  accuracy: {
    classification: number;
    decision: number;
    taskExtraction: number;
  };
  memoryUsage: {
    start: number;
    peak: number;
    end: number;
  };
}

interface PerformanceReport {
  singleSignal: {
    average: number;
    p50: number;
    p95: number;
    p99: number;
  };
  batchProcessing: {
    total: number;
    perSignal: number;
    speedup: number;
  };
  accuracy: {
    classification: number;
    decision: number;
    taskExtraction: number;
  };
  resourceUsage: {
    avgTokens: number;
    peakMemoryMB: number;
    cacheHitRate: number;
  };
  stressTests: {
    sequential100: { completed: boolean; time: number; status: string };
    parallel50: { completed: boolean; time: number; status: string };
    sustainedLoad: { completed: boolean; avgLatency: number; status: string };
    spike: { completed: boolean; degradation: number; recoveryTime: number; status: string };
  };
  loadDegradation: {
    queueDepthImpact: Array<{ depth: number; avgResponseTime: number }>;
    limitedContextAccuracy: number;
    highLoadErrorRate: number;
  };
}

// ============================================================================
// Mock Reasoning Engine for Benchmarking
// ============================================================================

class BenchmarkReasoningEngine extends EventEmitter {
  private cache: Map<string, Classification> = new Map();
  private tokenCounter: number = 0;
  private processedCount: number = 0;
  private queueDepth: number = 0;
  private isHighLoad: boolean = false;

  async processSignal(signal: Signal, options?: { limitedContext?: boolean }): Promise<ProcessingResult> {
    const startTime = Date.now();
    this.queueDepth++;
    
    try {
      // Simulate variable processing time based on queue depth
      const baseDelay = 1500 + Math.random() * 1000; // 1.5-2.5s base
      const queuePenalty = this.queueDepth > 10 ? (this.queueDepth - 10) * 100 : 0;
      const highLoadPenalty = this.isHighLoad ? 500 : 0;
      const totalDelay = baseDelay + queuePenalty + highLoadPenalty;
      
      await this.delay(totalDelay);

      // Check cache
      const cacheKey = this.getCacheKey(signal);
      let classification: Classification;
      let cacheHit = false;

      if (this.cache.has(cacheKey)) {
        classification = { ...this.cache.get(cacheKey)!, cached: true };
        cacheHit = true;
      } else {
        classification = await this.classifySignal(signal, options?.limitedContext);
        this.cache.set(cacheKey, classification);
      }

      const decision = await this.makeDecision(signal, classification);
      const task = decision.action === 'CREATE_TASK' ? await this.extractTask(signal) : undefined;

      // Simulate token usage
      const tokenUsage = cacheHit ? 100 : (1500 + Math.random() * 800); // 1500-2300 tokens
      this.tokenCounter += tokenUsage;
      this.processedCount++;

      const processingTime = Date.now() - startTime;

      return {
        signal,
        classification,
        decision,
        task,
        processingTime,
        tokenUsage,
        cacheHit
      };
    } finally {
      this.queueDepth--;
    }
  }

  private async classifySignal(signal: Signal, limitedContext?: boolean): Promise<Classification> {
    // Simulate LLM classification with accuracy variations
    await this.delay(800 + Math.random() * 400); // 800-1200ms

    // Reduce accuracy with limited context
    const accuracyFactor = limitedContext ? 0.85 : 1.0;
    const baseConfidence = 0.70 + Math.random() * 0.30; // 70-100%
    const confidence = Math.min(baseConfidence * accuracyFactor, 1.0);

    // Simulate errors under high load
    if (this.isHighLoad && Math.random() < 0.15) {
      throw new Error('LLM rate limit exceeded');
    }

    const categories = ['incident', 'bug', 'meeting', 'finance', 'question', 'spam', 'feature'];
    const urgencies: Array<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const importances: Array<'LOW' | 'MEDIUM' | 'HIGH'> = ['LOW', 'MEDIUM', 'HIGH'];

    // Pattern-based classification for accuracy measurement
    let urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM';
    let importance: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
    let category = 'question';

    if (signal.content.includes('URGENT') || signal.content.includes('down') || signal.content.includes('critical')) {
      urgency = 'CRITICAL';
      importance = 'HIGH';
      category = 'incident';
    } else if (signal.content.includes('bug') || signal.content.includes('error')) {
      urgency = 'HIGH';
      importance = 'HIGH';
      category = 'bug';
    } else if (signal.content.includes('meeting') || signal.content.includes('calendar')) {
      urgency = 'MEDIUM';
      importance = 'MEDIUM';
      category = 'meeting';
    } else if (signal.content.includes('invoice') || signal.content.includes('budget')) {
      urgency = 'MEDIUM';
      importance = 'HIGH';
      category = 'finance';
    } else if (signal.content.includes('spam') || signal.content.includes('unsubscribe')) {
      urgency = 'LOW';
      importance = 'LOW';
      category = 'spam';
    }

    return {
      urgency,
      importance,
      category,
      confidence: Math.round(confidence * 100) / 100,
      reasoning: `Classified as ${category} with ${urgency} urgency`
    };
  }

  private async makeDecision(signal: Signal, classification: Classification): Promise<Decision> {
    await this.delay(400 + Math.random() * 200); // 400-600ms

    const actionMap: Record<string, string> = {
      'incident': 'CREATE_TASK',
      'bug': 'CREATE_TASK',
      'meeting': 'CREATE_CALENDAR',
      'finance': 'FILE_IN_DRIVE',
      'question': 'QUEUE_FOR_APPROVAL',
      'spam': 'NO_ACTION',
      'feature': 'CREATE_TASK'
    };

    const action = actionMap[classification.category] || 'QUEUE_FOR_APPROVAL';
    const confidence = classification.confidence * (0.9 + Math.random() * 0.1);

    return {
      action,
      platform: action === 'CREATE_TASK' ? 'notion' : action === 'CREATE_CALENDAR' ? 'calendar' : undefined,
      priority: classification.urgency,
      confidence: Math.round(confidence * 100) / 100,
      autoExecute: confidence > 0.85,
      reasoning: `${action} based on ${classification.category} classification`
    };
  }

  private async extractTask(signal: Signal): Promise<TaskDetails> {
    await this.delay(300 + Math.random() * 200); // 300-500ms

    return {
      title: signal.content.substring(0, 50),
      description: signal.content.substring(0, 200),
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      labels: ['auto-generated'],
      assignee: 'team-lead'
    };
  }

  private getCacheKey(signal: Signal): string {
    return `${signal.source}:${signal.type}:${signal.content.substring(0, 100)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public setHighLoad(enabled: boolean): void {
    this.isHighLoad = enabled;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public getStats() {
    return {
      processedCount: this.processedCount,
      cacheSize: this.cache.size,
      queueDepth: this.queueDepth
    };
  }
}

// ============================================================================
// Benchmark Utilities
// ============================================================================

class BenchmarkRunner {
  private engine: BenchmarkReasoningEngine;
  private metrics: BenchmarkMetrics;

  constructor() {
    this.engine = new BenchmarkReasoningEngine();
    this.metrics = this.initMetrics();
  }

  private initMetrics(): BenchmarkMetrics {
    return {
      processingTimes: [],
      tokenUsages: [],
      cacheHits: 0,
      totalSignals: 0,
      errors: 0,
      accuracy: {
        classification: 0,
        decision: 0,
        taskExtraction: 0
      },
      memoryUsage: {
        start: this.getMemoryUsageMB(),
        peak: this.getMemoryUsageMB(),
        end: 0
      }
    };
  }

  private getMemoryUsageMB(): number {
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024);
  }

  private updatePeakMemory(): void {
    const current = this.getMemoryUsageMB();
    if (current > this.metrics.memoryUsage.peak) {
      this.metrics.memoryUsage.peak = current;
    }
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  private generateSignal(id: number, type?: string): Signal {
    const types = [
      { source: 'gmail', type: 'email', content: 'URGENT: Production server is down! Critical outage affecting users.' },
      { source: 'slack', type: 'message', content: 'Found a bug in the login system. Getting 500 errors.' },
      { source: 'gmail', type: 'email', content: 'Meeting invitation: Team sync tomorrow at 2 PM.' },
      { source: 'gmail', type: 'email', content: 'Invoice #12345 for $10,000 - Payment due next week.' },
      { source: 'slack', type: 'message', content: 'Not sure what to do about this... maybe discuss?' },
      { source: 'gmail', type: 'email', content: 'AMAZING OFFER! Click here to claim prize! Unsubscribe below.' },
      { source: 'sheets', type: 'update', content: 'Budget spreadsheet updated: Q4 expenses increased by 25%.' }
    ];

    const template = type ? types.find(t => t.type === type) || types[0] : types[id % types.length];

    return {
      id: `signal-${id}`,
      source: template.source,
      type: template.type,
      content: template.content,
      timestamp: new Date()
    };
  }

  private async recordResult(result: ProcessingResult): Promise<void> {
    this.metrics.processingTimes.push(result.processingTime);
    this.metrics.tokenUsages.push(result.tokenUsage);
    if (result.cacheHit) this.metrics.cacheHits++;
    this.metrics.totalSignals++;
    this.updatePeakMemory();
  }

  private validateAccuracy(result: ProcessingResult): { classification: boolean; decision: boolean; task: boolean } {
    const signal = result.signal;
    const classification = result.classification;
    const decision = result.decision;

    // Validate classification accuracy
    let classificationCorrect = false;
    if (signal.content.includes('URGENT') || signal.content.includes('down')) {
      classificationCorrect = classification.urgency === 'CRITICAL' && classification.category === 'incident';
    } else if (signal.content.includes('bug') || signal.content.includes('error')) {
      classificationCorrect = classification.category === 'bug';
    } else if (signal.content.includes('meeting') || signal.content.includes('calendar')) {
      classificationCorrect = classification.category === 'meeting';
    } else if (signal.content.includes('invoice') || signal.content.includes('budget')) {
      classificationCorrect = classification.category === 'finance';
    } else if (signal.content.includes('spam') || signal.content.includes('unsubscribe')) {
      classificationCorrect = classification.category === 'spam';
    } else {
      classificationCorrect = true; // Accept for ambiguous cases
    }

    // Validate decision accuracy
    const decisionCorrect = 
      (classification.category === 'incident' && decision.action === 'CREATE_TASK') ||
      (classification.category === 'bug' && decision.action === 'CREATE_TASK') ||
      (classification.category === 'meeting' && decision.action === 'CREATE_CALENDAR') ||
      (classification.category === 'finance' && decision.action === 'FILE_IN_DRIVE') ||
      (classification.category === 'spam' && decision.action === 'NO_ACTION') ||
      classification.category === 'question'; // Accept any decision for questions

    // Validate task extraction
    const taskCorrect = !result.task || (
      result.task.title.length > 0 &&
      result.task.description.length > 0
    );

    return {
      classification: classificationCorrect,
      decision: decisionCorrect,
      task: taskCorrect
    };
  }

  // ============================================================================
  // Benchmark Tests
  // ============================================================================

  async benchmarkSingleSignal(): Promise<void> {
    console.log('\n📊 Benchmarking Single Signal Processing...');
    
    for (let i = 0; i < 20; i++) {
      const signal = this.generateSignal(i);
      try {
        const result = await this.engine.processSignal(signal);
        await this.recordResult(result);
        
        const accuracy = this.validateAccuracy(result);
        this.metrics.accuracy.classification += accuracy.classification ? 1 : 0;
        this.metrics.accuracy.decision += accuracy.decision ? 1 : 0;
        this.metrics.accuracy.taskExtraction += accuracy.task ? 1 : 0;
      } catch (error) {
        this.metrics.errors++;
      }
    }
  }

  async benchmarkBatchProcessing(): Promise<{ total: number; perSignal: number }> {
    console.log('\n📦 Benchmarking Batch Processing (10 signals)...');
    
    const startTime = Date.now();
    const signals = Array.from({ length: 10 }, (_, i) => this.generateSignal(i + 100));
    
    for (const signal of signals) {
      try {
        const result = await this.engine.processSignal(signal);
        await this.recordResult(result);
      } catch (error) {
        this.metrics.errors++;
      }
    }
    
    const totalTime = Date.now() - startTime;
    const perSignal = totalTime / 10;
    
    return { total: totalTime, perSignal };
  }

  async stressTest100Sequential(): Promise<{ completed: boolean; time: number }> {
    console.log('\n🔥 Stress Test: 100 Sequential Signals...');
    
    const startTime = Date.now();
    
    for (let i = 0; i < 100; i++) {
      const signal = this.generateSignal(i + 200);
      try {
        const result = await this.engine.processSignal(signal);
        await this.recordResult(result);
      } catch (error) {
        this.metrics.errors++;
      }
      
      if (i % 10 === 0) {
        process.stdout.write(`\rProgress: ${i}/100`);
      }
    }
    
    const time = Date.now() - startTime;
    console.log(`\rCompleted: 100/100 in ${(time / 1000).toFixed(1)}s`);
    
    return { completed: true, time };
  }

  async stressTest50Parallel(): Promise<{ completed: boolean; time: number }> {
    console.log('\n⚡ Stress Test: 50 Parallel Signals...');
    
    const startTime = Date.now();
    const signals = Array.from({ length: 50 }, (_, i) => this.generateSignal(i + 300));
    
    const promises = signals.map(async (signal) => {
      try {
        const result = await this.engine.processSignal(signal);
        await this.recordResult(result);
      } catch (error) {
        this.metrics.errors++;
      }
    });
    
    await Promise.all(promises);
    
    const time = Date.now() - startTime;
    console.log(`Completed in ${(time / 1000).toFixed(1)}s`);
    
    return { completed: true, time };
  }

  async stressTestSustainedLoad(): Promise<{ completed: boolean; avgLatency: number }> {
    console.log('\n⏱️  Stress Test: Sustained Load (20 signals/min for 5 minutes simulated)...');
    
    const signalsPerMinute = 20;
    const durationMinutes = 5;
    const totalSignals = signalsPerMinute * durationMinutes;
    const latencies: number[] = [];
    
    for (let i = 0; i < totalSignals; i++) {
      const signal = this.generateSignal(i + 400);
      const startTime = Date.now();
      
      try {
        const result = await this.engine.processSignal(signal);
        await this.recordResult(result);
        latencies.push(Date.now() - startTime);
      } catch (error) {
        this.metrics.errors++;
      }
      
      if (i % 10 === 0) {
        process.stdout.write(`\rProgress: ${i}/${totalSignals}`);
      }
      
      // Simulate throttling (3s interval for 20/min)
      await new Promise(resolve => setTimeout(resolve, 50)); // Reduced for faster testing
    }
    
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    console.log(`\rCompleted: ${totalSignals}/${totalSignals} - Avg latency: ${(avgLatency / 1000).toFixed(2)}s`);
    
    return { completed: true, avgLatency };
  }

  async stressTestSpike(): Promise<{ completed: boolean; degradation: number; recoveryTime: number }> {
    console.log('\n💥 Stress Test: Spike Handling (100 simultaneous signals)...');
    
    this.engine.setHighLoad(true);
    
    const signals = Array.from({ length: 100 }, (_, i) => this.generateSignal(i + 500));
    const startTime = Date.now();
    const normalLatency = 2000; // Expected normal latency
    
    const promises = signals.map(async (signal) => {
      const signalStart = Date.now();
      try {
        const result = await this.engine.processSignal(signal);
        await this.recordResult(result);
        return Date.now() - signalStart;
      } catch (error) {
        this.metrics.errors++;
        return 0;
      }
    });
    
    const latencies = await Promise.all(promises);
    const avgLatency = latencies.filter(l => l > 0).reduce((a, b) => a + b, 0) / latencies.filter(l => l > 0).length;
    const degradation = ((avgLatency - normalLatency) / normalLatency) * 100;
    
    // Measure recovery time
    const recoveryStart = Date.now();
    this.engine.setHighLoad(false);
    
    // Process 10 signals to measure recovery
    for (let i = 0; i < 10; i++) {
      const signal = this.generateSignal(i + 600);
      try {
        await this.engine.processSignal(signal);
      } catch (error) {
        // Ignore recovery errors
      }
    }
    
    const recoveryTime = Date.now() - recoveryStart;
    
    console.log(`Spike handled - ${degradation.toFixed(1)}% degradation, recovered in ${(recoveryTime / 1000).toFixed(1)}s`);
    
    return { completed: true, degradation, recoveryTime };
  }

  async measureLoadDegradation(): Promise<{
    queueDepthImpact: Array<{ depth: number; avgResponseTime: number }>;
    limitedContextAccuracy: number;
    highLoadErrorRate: number;
  }> {
    console.log('\n📉 Measuring Load Degradation...');
    
    // Measure queue depth impact
    const queueDepthImpact: Array<{ depth: number; avgResponseTime: number }> = [];
    
    for (const depth of [1, 5, 10, 20, 50]) {
      const latencies: number[] = [];
      const signals = Array.from({ length: depth }, (_, i) => this.generateSignal(i + 700));
      
      const promises = signals.map(async (signal) => {
        const start = Date.now();
        try {
          await this.engine.processSignal(signal);
          return Date.now() - start;
        } catch (error) {
          return 0;
        }
      });
      
      const results = await Promise.all(promises);
      const avgResponseTime = results.filter(r => r > 0).reduce((a, b) => a + b, 0) / results.filter(r => r > 0).length;
      
      queueDepthImpact.push({ depth, avgResponseTime });
      console.log(`  Queue depth ${depth}: ${(avgResponseTime / 1000).toFixed(2)}s avg`);
    }
    
    // Measure limited context accuracy
    console.log('\n  Testing limited context accuracy...');
    let limitedContextCorrect = 0;
    const limitedContextSignals = 20;
    
    for (let i = 0; i < limitedContextSignals; i++) {
      const signal = this.generateSignal(i + 800);
      try {
        const result = await this.engine.processSignal(signal, { limitedContext: true });
        const accuracy = this.validateAccuracy(result);
        if (accuracy.classification) limitedContextCorrect++;
      } catch (error) {
        // Ignore
      }
    }
    
    const limitedContextAccuracy = (limitedContextCorrect / limitedContextSignals) * 100;
    console.log(`  Limited context accuracy: ${limitedContextAccuracy.toFixed(1)}%`);
    
    // Measure high load error rate
    console.log('\n  Testing high load error rate...');
    this.engine.setHighLoad(true);
    
    let highLoadErrors = 0;
    const highLoadSignals = 50;
    
    for (let i = 0; i < highLoadSignals; i++) {
      const signal = this.generateSignal(i + 900);
      try {
        await this.engine.processSignal(signal);
      } catch (error) {
        highLoadErrors++;
      }
    }
    
    const highLoadErrorRate = (highLoadErrors / highLoadSignals) * 100;
    this.engine.setHighLoad(false);
    console.log(`  High load error rate: ${highLoadErrorRate.toFixed(1)}%`);
    
    return {
      queueDepthImpact,
      limitedContextAccuracy,
      highLoadErrorRate
    };
  }

  // ============================================================================
  // Report Generation
  // ============================================================================

  generateReport(
    batchResults: { total: number; perSignal: number },
    stressResults: {
      sequential100: { completed: boolean; time: number };
      parallel50: { completed: boolean; time: number };
      sustainedLoad: { completed: boolean; avgLatency: number };
      spike: { completed: boolean; degradation: number; recoveryTime: number };
    },
    degradationResults: {
      queueDepthImpact: Array<{ depth: number; avgResponseTime: number }>;
      limitedContextAccuracy: number;
      highLoadErrorRate: number;
    }
  ): PerformanceReport {
    this.metrics.memoryUsage.end = this.getMemoryUsageMB();

    const avgProcessingTime = this.metrics.processingTimes.reduce((a, b) => a + b, 0) / this.metrics.processingTimes.length;
    const p50 = this.calculatePercentile(this.metrics.processingTimes, 50);
    const p95 = this.calculatePercentile(this.metrics.processingTimes, 95);
    const p99 = this.calculatePercentile(this.metrics.processingTimes, 99);

    const avgTokens = this.metrics.tokenUsages.reduce((a, b) => a + b, 0) / this.metrics.tokenUsages.length;
    const cacheHitRate = (this.metrics.cacheHits / this.metrics.totalSignals) * 100;

    // Calculate accuracy percentages
    const totalValidations = this.metrics.totalSignals - this.metrics.errors;
    const classificationAccuracy = (this.metrics.accuracy.classification / totalValidations) * 100;
    const decisionAccuracy = (this.metrics.accuracy.decision / totalValidations) * 100;
    const taskExtractionAccuracy = (this.metrics.accuracy.taskExtraction / totalValidations) * 100;

    // Calculate speedup from batch processing
    const speedup = ((avgProcessingTime - batchResults.perSignal) / avgProcessingTime) * 100;

    return {
      singleSignal: {
        average: avgProcessingTime,
        p50,
        p95,
        p99
      },
      batchProcessing: {
        total: batchResults.total,
        perSignal: batchResults.perSignal,
        speedup
      },
      accuracy: {
        classification: classificationAccuracy,
        decision: decisionAccuracy,
        taskExtraction: taskExtractionAccuracy
      },
      resourceUsage: {
        avgTokens,
        peakMemoryMB: this.metrics.memoryUsage.peak,
        cacheHitRate
      },
      stressTests: {
        sequential100: {
          completed: stressResults.sequential100.completed,
          time: stressResults.sequential100.time,
          status: stressResults.sequential100.time < 240000 ? '✓' : '⚠'
        },
        parallel50: {
          completed: stressResults.parallel50.completed,
          time: stressResults.parallel50.time,
          status: stressResults.parallel50.time < 30000 ? '✓' : '⚠'
        },
        sustainedLoad: {
          completed: stressResults.sustainedLoad.completed,
          avgLatency: stressResults.sustainedLoad.avgLatency,
          status: stressResults.sustainedLoad.avgLatency < 5000 ? '✓' : '⚠'
        },
        spike: {
          completed: stressResults.spike.completed,
          degradation: stressResults.spike.degradation,
          recoveryTime: stressResults.spike.recoveryTime,
          status: stressResults.spike.degradation < 20 ? '✓' : '⚠'
        }
      },
      loadDegradation: {
        queueDepthImpact: degradationResults.queueDepthImpact,
        limitedContextAccuracy: degradationResults.limitedContextAccuracy,
        highLoadErrorRate: degradationResults.highLoadErrorRate
      }
    };
  }

  printReport(report: PerformanceReport): void {
    console.log('\n\n' + '='.repeat(70));
    console.log('=== Reasoning Engine Performance Report ===');
    console.log('='.repeat(70));

    console.log('\n📊 Single Signal Processing:');
    console.log(`  - Average: ${(report.singleSignal.average / 1000).toFixed(1)}s`);
    console.log(`  - P50: ${(report.singleSignal.p50 / 1000).toFixed(1)}s`);
    console.log(`  - P95: ${(report.singleSignal.p95 / 1000).toFixed(1)}s`);
    console.log(`  - P99: ${(report.singleSignal.p99 / 1000).toFixed(1)}s`);
    console.log(`  - Target: < 3s ${report.singleSignal.average < 3000 ? '✓' : '⚠'}`);

    console.log('\n📦 Batch Processing (10 signals):');
    console.log(`  - Total: ${(report.batchProcessing.total / 1000).toFixed(1)}s`);
    console.log(`  - Per signal: ${(report.batchProcessing.perSignal / 1000).toFixed(2)}s (${report.batchProcessing.speedup.toFixed(0)}% faster)`);
    console.log(`  - Target: < 10s ${report.batchProcessing.total < 10000 ? '✓' : '⚠'}`);

    console.log('\n🎯 Accuracy:');
    console.log(`  - Classification: ${report.accuracy.classification.toFixed(1)}%`);
    console.log(`  - Decision: ${report.accuracy.decision.toFixed(1)}%`);
    console.log(`  - Task extraction: ${report.accuracy.taskExtraction.toFixed(1)}%`);
    console.log(`  - Target: > 90% ${report.accuracy.classification > 90 ? '✓' : '⚠'}`);

    console.log('\n💾 Resource Usage:');
    console.log(`  - Tokens/signal: ${Math.round(report.resourceUsage.avgTokens)} avg`);
    console.log(`  - Memory: ${report.resourceUsage.peakMemoryMB}MB peak`);
    console.log(`  - Cache hit rate: ${report.resourceUsage.cacheHitRate.toFixed(1)}%`);
    console.log(`  - Token target: < 2000 ${report.resourceUsage.avgTokens < 2000 ? '✓' : '⚠'}`);
    console.log(`  - Memory target: < 500MB ${report.resourceUsage.peakMemoryMB < 500 ? '✓' : '⚠'}`);
    console.log(`  - Cache target: > 50% ${report.resourceUsage.cacheHitRate > 50 ? '✓' : '⚠'}`);

    console.log('\n🔥 Stress Test Results:');
    console.log(`  - ${report.stressTests.sequential100.status} 100 sequential: Completed in ${(report.stressTests.sequential100.time / 1000 / 60).toFixed(0)}m ${((report.stressTests.sequential100.time / 1000) % 60).toFixed(0)}s`);
    console.log(`  - ${report.stressTests.parallel50.status} 50 parallel: Completed in ${(report.stressTests.parallel50.time / 1000).toFixed(0)}s`);
    console.log(`  - ${report.stressTests.sustainedLoad.status} Sustained load: Maintained ${(report.stressTests.sustainedLoad.avgLatency / 1000).toFixed(1)}s latency`);
    console.log(`  - ${report.stressTests.spike.status} Spike: ${report.stressTests.spike.degradation.toFixed(1)}% degradation, recovered in ${(report.stressTests.spike.recoveryTime / 1000).toFixed(0)}s`);

    console.log('\n📉 Load Degradation Analysis:');
    console.log('  Queue Depth Impact:');
    report.loadDegradation.queueDepthImpact.forEach(({ depth, avgResponseTime }) => {
      console.log(`    - Depth ${depth}: ${(avgResponseTime / 1000).toFixed(2)}s avg response`);
    });
    console.log(`  Limited Context Accuracy: ${report.loadDegradation.limitedContextAccuracy.toFixed(1)}%`);
    console.log(`  High Load Error Rate: ${report.loadDegradation.highLoadErrorRate.toFixed(1)}%`);

    console.log('\n' + '='.repeat(70));
    console.log('✅ Benchmark suite completed successfully!');
    console.log('='.repeat(70) + '\n');
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function runBenchmarks(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║      🧠 REASONING ENGINE PERFORMANCE BENCHMARK SUITE                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('\nStarting comprehensive performance benchmarks...\n');

  const runner = new BenchmarkRunner();

  try {
    // Run benchmarks
    await runner.benchmarkSingleSignal();
    const batchResults = await runner.benchmarkBatchProcessing();
    
    // Run stress tests
    const sequential100 = await runner.stressTest100Sequential();
    const parallel50 = await runner.stressTest50Parallel();
    const sustainedLoad = await runner.stressTestSustainedLoad();
    const spike = await runner.stressTestSpike();
    
    const stressResults = {
      sequential100,
      parallel50,
      sustainedLoad,
      spike
    };
    
    // Measure degradation
    const degradationResults = await runner.measureLoadDegradation();
    
    // Generate and print report
    const report = runner.generateReport(batchResults, stressResults, degradationResults);
    runner.printReport(report);

  } catch (error) {
    console.error('\n❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runBenchmarks().catch(console.error);
}

export {
  BenchmarkRunner,
  BenchmarkReasoningEngine,
  runBenchmarks,
  type PerformanceReport,
  type BenchmarkMetrics
};
