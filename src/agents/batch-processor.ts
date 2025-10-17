/**
 * Batch Processor for AI Operations Command Center
 * 
 * Efficiently processes multiple signals together by:
 * - Grouping similar signals (same sender, category, thread)
 * - Batching LLM calls (multiple classifications in one prompt)
 * - Parallelizing non-dependent operations
 * - Adaptive batching based on queue state and urgency
 * 
 * Features:
 * - Smart signal grouping by similarity
 * - Token savings through shared context
 * - Adaptive timing (immediate vs batched)
 * - Batch efficiency tracking
 * - Configurable batch sizes
 */

import { EventEmitter } from 'events';
import { Signal } from './reasoning/context-builder';
import { SignalClassification } from './classifier-agent';
import logger from '../utils/logger';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Configuration for batch processor
 */
export interface BatchProcessorConfig {
  /** Maximum signals per batch */
  maxBatchSize: number;
  
  /** Wait time to collect signals before processing (ms) */
  batchWaitTime: number;
  
  /** Process immediately if queue is empty */
  processImmediatelyWhenEmpty: boolean;
  
  /** Enable adaptive batching based on urgency */
  enableAdaptiveBatching: boolean;
  
  /** Similarity threshold for grouping (0-1) */
  similarityThreshold: number;
  
  /** Enable parallel processing of independent groups */
  enableParallelProcessing: boolean;
  
  /** Maximum concurrent batch processes */
  maxConcurrentBatches: number;
}

/**
 * Signal grouping criteria
 */
export interface SignalGroup {
  /** Unique group identifier */
  groupId: string;
  
  /** Signals in this group */
  signals: Signal[];
  
  /** Common sender (if any) */
  commonSender?: string;
  
  /** Common thread/subject prefix */
  commonThread?: string;
  
  /** Common category hint */
  commonCategory?: string;
  
  /** Similarity score (0-1) */
  similarityScore: number;
  
  /** Group timestamp */
  groupedAt: string;
  
  /** Highest urgency in group */
  maxUrgency?: string;
}

/**
 * Batch processing request
 */
export interface BatchRequest {
  /** Unique batch ID */
  batchId: string;
  
  /** Signal groups to process */
  groups: SignalGroup[];
  
  /** Total signals in batch */
  totalSignals: number;
  
  /** Batch created timestamp */
  createdAt: string;
  
  /** Processing started timestamp */
  startedAt?: string;
  
  /** Processing completed timestamp */
  completedAt?: string;
  
  /** Batch status */
  status: 'queued' | 'processing' | 'completed' | 'failed';
  
  /** Contains urgent signal */
  hasUrgentSignal: boolean;
}

/**
 * Batch processing result
 */
export interface BatchResult {
  /** Batch ID */
  batchId: string;
  
  /** Individual signal results */
  results: Map<string, SignalClassification>;
  
  /** Processing time (ms) */
  processingTime: number;
  
  /** Estimated tokens saved */
  tokensSaved: number;
  
  /** Number of LLM calls made */
  llmCallsMade: number;
  
  /** Number of signals processed */
  signalsProcessed: number;
  
  /** Errors encountered */
  errors: Array<{ signalId: string; error: string }>;
}

/**
 * Batch efficiency statistics
 */
export interface BatchStats {
  /** Total batches processed */
  totalBatches: number;
  
  /** Total signals processed */
  totalSignalsProcessed: number;
  
  /** Total LLM calls made */
  totalLlmCalls: number;
  
  /** Average signals per batch */
  avgSignalsPerBatch: number;
  
  /** Average LLM calls per batch */
  avgLlmCallsPerBatch: number;
  
  /** Total tokens saved (estimated) */
  totalTokensSaved: number;
  
  /** Total time saved (ms) */
  totalTimeSaved: number;
  
  /** Average processing time per batch (ms) */
  avgProcessingTime: number;
  
  /** Average processing time per signal (ms) */
  avgTimePerSignal: number;
  
  /** Batch efficiency rate (0-1) */
  efficiencyRate: number;
  
  /** Current queue size */
  currentQueueSize: number;
  
  /** Pending batches */
  pendingBatches: number;
  
  /** Last updated */
  lastUpdated: string;
}

/**
 * Signal similarity metrics
 */
interface SimilarityMetrics {
  sameSender: boolean;
  sameThreadPrefix: boolean;
  sameDomain: boolean;
  timeProximity: number; // 0-1
  subjectSimilarity: number; // 0-1
  overallScore: number; // 0-1
}

// ============================================================================
// Batch Processor Implementation
// ============================================================================

export class BatchProcessor extends EventEmitter {
  private static instance: BatchProcessor | null = null;
  private config: BatchProcessorConfig;
  
  // Queue management
  private signalQueue: Signal[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private currentBatch: BatchRequest | null = null;
  private activeBatches: Map<string, BatchRequest> = new Map();
  
  // Statistics tracking
  private stats: {
    totalBatches: number;
    totalSignalsProcessed: number;
    totalLlmCalls: number;
    totalTokensSaved: number;
    totalTimeSaved: number;
    totalProcessingTime: number;
    batchHistory: BatchResult[];
  } = {
    totalBatches: 0,
    totalSignalsProcessed: 0,
    totalLlmCalls: 0,
    totalTokensSaved: 0,
    totalTimeSaved: 0,
    totalProcessingTime: 0,
    batchHistory: [],
  };
  
  private constructor(config?: Partial<BatchProcessorConfig>) {
    super();
    
    this.config = {
      maxBatchSize: 10,
      batchWaitTime: 30000, // 30 seconds
      processImmediatelyWhenEmpty: true,
      enableAdaptiveBatching: true,
      similarityThreshold: 0.6,
      enableParallelProcessing: true,
      maxConcurrentBatches: 3,
      ...config,
    };
    
    logger.info('BatchProcessor initialized', { config: this.config });
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<BatchProcessorConfig>): BatchProcessor {
    if (!BatchProcessor.instance) {
      BatchProcessor.instance = new BatchProcessor(config);
    }
    return BatchProcessor.instance;
  }
  
  // ==========================================================================
  // Public API
  // ==========================================================================
  
  /**
   * Add signal to processing queue
   */
  public async addSignal(signal: Signal): Promise<void> {
    this.signalQueue.push(signal);
    logger.debug('Signal added to queue', {
      signalId: signal.id,
      queueSize: this.signalQueue.length,
    });
    
    // Check if we should process immediately
    if (this.shouldProcessImmediately(signal)) {
      logger.info('Processing signal immediately', {
        signalId: signal.id,
        reason: this.getImmediateProcessingReason(signal),
      });
      await this.processNow();
    } else {
      // Start batch timer if not already running
      this.startBatchTimer();
    }
  }
  
  /**
   * Process batch of signals
   */
  public async processBatch(
    signals: Signal[],
    maxBatchSize?: number
  ): Promise<BatchResult[]> {
    const batchSize = maxBatchSize || this.config.maxBatchSize;
    
    logger.info('Processing batch', {
      signalCount: signals.length,
      maxBatchSize: batchSize,
    });
    
    // Split into chunks if needed
    const chunks = this.chunkSignals(signals, batchSize);
    const results: BatchResult[] = [];
    
    // Process chunks
    if (this.config.enableParallelProcessing) {
      // Process in parallel with concurrency limit
      const concurrency = Math.min(
        chunks.length,
        this.config.maxConcurrentBatches
      );
      
      for (let i = 0; i < chunks.length; i += concurrency) {
        const chunkBatch = chunks.slice(i, i + concurrency);
        const chunkResults = await Promise.all(
          chunkBatch.map(chunk => this.processSingleBatch(chunk))
        );
        results.push(...chunkResults);
      }
    } else {
      // Process sequentially
      for (const chunk of chunks) {
        const result = await this.processSingleBatch(chunk);
        results.push(result);
      }
    }
    
    logger.info('Batch processing complete', {
      totalBatches: results.length,
      totalSignals: signals.length,
      totalTokensSaved: results.reduce((sum, r) => sum + r.tokensSaved, 0),
    });
    
    return results;
  }
  
  /**
   * Process queue immediately
   */
  public async processNow(): Promise<BatchResult | null> {
    if (this.signalQueue.length === 0) {
      logger.debug('Queue is empty, nothing to process');
      return null;
    }
    
    // Cancel pending timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Extract signals from queue
    const signals = this.signalQueue.splice(0, this.config.maxBatchSize);
    
    logger.info('Processing queue now', {
      signalCount: signals.length,
      remainingInQueue: this.signalQueue.length,
    });
    
    return await this.processSingleBatch(signals);
  }
  
  /**
   * Get batch statistics
   */
  public getBatchStats(): BatchStats {
    const avgSignalsPerBatch = this.stats.totalBatches > 0
      ? this.stats.totalSignalsProcessed / this.stats.totalBatches
      : 0;
    
    const avgLlmCallsPerBatch = this.stats.totalBatches > 0
      ? this.stats.totalLlmCalls / this.stats.totalBatches
      : 0;
    
    const avgProcessingTime = this.stats.totalBatches > 0
      ? this.stats.totalProcessingTime / this.stats.totalBatches
      : 0;
    
    const avgTimePerSignal = this.stats.totalSignalsProcessed > 0
      ? this.stats.totalProcessingTime / this.stats.totalSignalsProcessed
      : 0;
    
    // Efficiency: signals per LLM call (higher is better)
    const efficiencyRate = this.stats.totalLlmCalls > 0
      ? this.stats.totalSignalsProcessed / this.stats.totalLlmCalls
      : 0;
    
    return {
      totalBatches: this.stats.totalBatches,
      totalSignalsProcessed: this.stats.totalSignalsProcessed,
      totalLlmCalls: this.stats.totalLlmCalls,
      avgSignalsPerBatch,
      avgLlmCallsPerBatch,
      totalTokensSaved: this.stats.totalTokensSaved,
      totalTimeSaved: this.stats.totalTimeSaved,
      avgProcessingTime,
      avgTimePerSignal,
      efficiencyRate,
      currentQueueSize: this.signalQueue.length,
      pendingBatches: this.activeBatches.size,
      lastUpdated: new Date().toISOString(),
    };
  }
  
  /**
   * Get recent batch history
   */
  public getBatchHistory(limit: number = 10): BatchResult[] {
    return this.stats.batchHistory.slice(-limit);
  }
  
  /**
   * Clear queue
   */
  public clearQueue(): number {
    const count = this.signalQueue.length;
    this.signalQueue = [];
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    logger.info('Queue cleared', { signalsRemoved: count });
    return count;
  }
  
  /**
   * Get current queue size
   */
  public getQueueSize(): number {
    return this.signalQueue.length;
  }
  
  /**
   * Update configuration
   */
  public updateConfig(config: Partial<BatchProcessorConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Configuration updated', { config: this.config });
  }
  
  // ==========================================================================
  // Signal Grouping
  // ==========================================================================
  
  /**
   * Group signals by similarity
   */
  private groupSignals(signals: Signal[]): SignalGroup[] {
    if (signals.length === 0) return [];
    
    const groups: SignalGroup[] = [];
    const processed = new Set<string>();
    
    for (let i = 0; i < signals.length; i++) {
      if (processed.has(signals[i].id)) continue;
      
      const signal = signals[i];
      const group: SignalGroup = {
        groupId: `group-${Date.now()}-${i}`,
        signals: [signal],
        commonSender: signal.sender,
        similarityScore: 1.0,
        groupedAt: new Date().toISOString(),
      };
      
      processed.add(signal.id);
      
      // Find similar signals
      for (let j = i + 1; j < signals.length; j++) {
        if (processed.has(signals[j].id)) continue;
        
        const similarity = this.calculateSimilarity(signal, signals[j]);
        
        if (similarity.overallScore >= this.config.similarityThreshold) {
          group.signals.push(signals[j]);
          processed.add(signals[j].id);
          
          // Update group metadata
          if (signals[j].sender !== group.commonSender) {
            group.commonSender = undefined;
          }
        }
      }
      
      // Extract common thread
      group.commonThread = this.findCommonThread(group.signals);
      
      // Find max urgency
      group.maxUrgency = this.findMaxUrgency(group.signals);
      
      // Calculate average similarity
      group.similarityScore = this.calculateGroupSimilarity(group.signals);
      
      groups.push(group);
    }
    
    logger.debug('Signals grouped', {
      totalSignals: signals.length,
      groups: groups.length,
      avgGroupSize: signals.length / groups.length,
    });
    
    return groups;
  }
  
  /**
   * Calculate similarity between two signals
   */
  private calculateSimilarity(signal1: Signal, signal2: Signal): SimilarityMetrics {
    const metrics: SimilarityMetrics = {
      sameSender: signal1.sender === signal2.sender,
      sameThreadPrefix: this.hasSameThreadPrefix(signal1.subject || '', signal2.subject || ''),
      sameDomain: this.hasSameDomain(signal1.sender || '', signal2.sender || ''),
      timeProximity: this.calculateTimeProximity(signal1.timestamp, signal2.timestamp),
      subjectSimilarity: this.calculateSubjectSimilarity(signal1.subject || '', signal2.subject || ''),
      overallScore: 0,
    };
    
    // Calculate weighted overall score
    metrics.overallScore = (
      (metrics.sameSender ? 0.3 : 0) +
      (metrics.sameThreadPrefix ? 0.25 : 0) +
      (metrics.sameDomain ? 0.15 : 0) +
      (metrics.timeProximity * 0.15) +
      (metrics.subjectSimilarity * 0.15)
    );
    
    return metrics;
  }
  
  /**
   * Check if subjects have same thread prefix (Re:, Fwd:, etc.)
   */
  private hasSameThreadPrefix(subject1: string, subject2: string): boolean {
    const prefix1 = this.extractThreadPrefix(subject1);
    const prefix2 = this.extractThreadPrefix(subject2);
    
    return prefix1 !== null && prefix1 === prefix2;
  }
  
  /**
   * Extract thread prefix from subject
   */
  private extractThreadPrefix(subject: string): string | null {
    const match = subject.match(/^(Re:|Fwd:|RE:|FWD:)\s*(.+)$/i);
    if (match) {
      return match[2].trim().toLowerCase();
    }
    return null;
  }
  
  /**
   * Check if senders have same domain
   */
  private hasSameDomain(sender1: string, sender2: string): boolean {
    const domain1 = sender1.split('@')[1];
    const domain2 = sender2.split('@')[1];
    
    return domain1 === domain2;
  }
  
  /**
   * Calculate time proximity (0-1, higher is closer)
   */
  private calculateTimeProximity(time1: string, time2: string): number {
    const diff = Math.abs(new Date(time1).getTime() - new Date(time2).getTime());
    const hourInMs = 60 * 60 * 1000;
    
    // Signals within 1 hour = 1.0, 24 hours = 0.0
    return Math.max(0, 1 - (diff / (24 * hourInMs)));
  }
  
  /**
   * Calculate subject similarity (0-1)
   */
  private calculateSubjectSimilarity(subject1: string, subject2: string): number {
    const words1 = new Set(subject1.toLowerCase().split(/\s+/));
    const words2 = new Set(subject2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }
  
  /**
   * Find common thread in group
   */
  private findCommonThread(signals: Signal[]): string | undefined {
    if (signals.length === 0) return undefined;
    
    const firstSubject = signals[0].subject || '';
    const threadPrefix = this.extractThreadPrefix(firstSubject) || firstSubject;
    
    // Check if all signals share this thread
    const allMatch = signals.every(signal => {
      const subj = signal.subject || '';
      const prefix = this.extractThreadPrefix(subj) || subj;
      return prefix && threadPrefix && prefix.toLowerCase().includes(threadPrefix.toLowerCase().slice(0, 20));
    });
    
    return allMatch ? threadPrefix : undefined;
  }
  
  /**
   * Find maximum urgency in group
   */
  private findMaxUrgency(signals: Signal[]): string | undefined {
    // Look for urgency indicators in subjects/bodies
    const urgencyKeywords = ['urgent', 'asap', 'critical', 'emergency', 'immediate'];
    
    for (const signal of signals) {
      const text = `${signal.subject} ${signal.body}`.toLowerCase();
      for (const keyword of urgencyKeywords) {
        if (text.includes(keyword)) {
          return 'high';
        }
      }
    }
    
    return undefined;
  }
  
  /**
   * Calculate average similarity within group
   */
  private calculateGroupSimilarity(signals: Signal[]): number {
    if (signals.length <= 1) return 1.0;
    
    let totalSimilarity = 0;
    let comparisons = 0;
    
    for (let i = 0; i < signals.length - 1; i++) {
      for (let j = i + 1; j < signals.length; j++) {
        const similarity = this.calculateSimilarity(signals[i], signals[j]);
        totalSimilarity += similarity.overallScore;
        comparisons++;
      }
    }
    
    return comparisons > 0 ? totalSimilarity / comparisons : 1.0;
  }
  
  // ==========================================================================
  // Batch Processing
  // ==========================================================================
  
  /**
   * Process a single batch of signals
   */
  private async processSingleBatch(signals: Signal[]): Promise<BatchResult> {
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    logger.info('Processing batch', { batchId, signalCount: signals.length });
    
    // Group signals
    const groups = this.groupSignals(signals);
    
    // Create batch request
    const batchRequest: BatchRequest = {
      batchId,
      groups,
      totalSignals: signals.length,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      status: 'processing',
      hasUrgentSignal: signals.some(s => this.isUrgent(s)),
    };
    
    this.activeBatches.set(batchId, batchRequest);
    this.currentBatch = batchRequest;
    
    // Process each group
    const results = new Map<string, SignalClassification>();
    const errors: Array<{ signalId: string; error: string }> = [];
    let llmCallsMade = 0;
    
    for (const group of groups) {
      try {
        // Process group with single LLM call
        const groupResults = await this.processGroup(group);
        llmCallsMade++;
        
        // Distribute results
        for (const [signalId, classification] of groupResults) {
          results.set(signalId, classification);
        }
      } catch (error) {
        logger.error('Error processing group', {
          groupId: group.groupId,
          error: error instanceof Error ? error.message : String(error),
        });
        
        // Record errors for all signals in group
        for (const signal of group.signals) {
          errors.push({
            signalId: signal.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    
    const processingTime = Date.now() - startTime;
    
    // Calculate token savings
    // Estimate: individual calls would be ~500 tokens each
    // Batch call: ~300 base + 200 per signal
    const individualTokens = signals.length * 500;
    const batchTokens = 300 + (signals.length * 200);
    const tokensSaved = Math.max(0, individualTokens - batchTokens);
    
    // Estimate time saved
    // Individual: 2s per call
    // Batch: 3s total
    const individualTime = signals.length * 2000;
    const timeSaved = Math.max(0, individualTime - processingTime);
    
    // Create result
    const result: BatchResult = {
      batchId,
      results,
      processingTime,
      tokensSaved,
      llmCallsMade,
      signalsProcessed: signals.length,
      errors,
    };
    
    // Update batch request
    batchRequest.completedAt = new Date().toISOString();
    batchRequest.status = errors.length > 0 ? 'failed' : 'completed';
    
    // Update statistics
    this.updateStats(result, timeSaved);
    
    // Cleanup
    this.activeBatches.delete(batchId);
    if (this.currentBatch?.batchId === batchId) {
      this.currentBatch = null;
    }
    
    logger.info('Batch complete', {
      batchId,
      signalsProcessed: result.signalsProcessed,
      llmCalls: result.llmCallsMade,
      tokensSaved: result.tokensSaved,
      processingTime: result.processingTime,
      errors: errors.length,
    });
    
    this.emit('batch-complete', result);
    
    return result;
  }
  
  /**
   * Process a signal group with single LLM call
   */
  private async processGroup(group: SignalGroup): Promise<Map<string, SignalClassification>> {
    logger.debug('Processing group', {
      groupId: group.groupId,
      signalCount: group.signals.length,
      commonSender: group.commonSender,
      commonThread: group.commonThread,
    });
    
    // Build batch prompt with shared context
    const prompt = this.buildBatchPrompt(group);
    
    // Simulate LLM call (in real implementation, call actual LLM)
    const classifications = await this.simulateLlmBatchCall(prompt, group.signals);
    
    return classifications;
  }
  
  /**
   * Build batch prompt for group
   */
  private buildBatchPrompt(group: SignalGroup): string {
    let prompt = 'Classify the following signals:\n\n';
    
    // Add shared context
    if (group.commonSender) {
      prompt += `All signals are from: ${group.commonSender}\n`;
    }
    
    if (group.commonThread) {
      prompt += `All signals are part of thread: ${group.commonThread}\n`;
    }
    
    prompt += '\n---\n\n';
    
    // Add individual signals
    for (let i = 0; i < group.signals.length; i++) {
      const signal = group.signals[i];
      prompt += `Signal ${i + 1} (ID: ${signal.id}):\n`;
      prompt += `Subject: ${signal.subject || '(no subject)'}\n`;
      prompt += `Body: ${signal.body.substring(0, 200)}...\n`;
      prompt += `Timestamp: ${signal.timestamp}\n`;
      prompt += '\n';
    }
    
    prompt += '---\n\n';
    prompt += 'For each signal, provide urgency (low/medium/high/critical) and category (incident/request/information/discussion).';
    
    return prompt;
  }
  
  /**
   * Simulate LLM batch call
   * In real implementation, replace with actual LLM API call
   */
  private async simulateLlmBatchCall(
    prompt: string,
    signals: Signal[]
  ): Promise<Map<string, SignalClassification>> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const results = new Map<string, SignalClassification>();
    
    for (const signal of signals) {
      // Simple heuristic classification
      const urgency = this.classifyUrgency(signal);
      const category = this.classifyCategory(signal);
      
      const classification: SignalClassification = {
        urgency,
        category,
        importance: urgency === 'critical' || urgency === 'high' ? 'high' : 'medium',
        confidence: 0.85,
        reasoning: `Classified as part of batch. ${signals.length} related signals processed together.`,
        suggestedActions: this.suggestActions(category),
        requiresImmediate: urgency === 'critical',
      };
      
      results.set(signal.id, classification);
    }
    
    return results;
  }
  
  /**
   * Classify urgency (simple heuristic)
   */
  private classifyUrgency(signal: Signal): 'low' | 'medium' | 'high' | 'critical' {
    const text = `${signal.subject || ''} ${signal.body}`.toLowerCase();
    
    if (text.includes('critical') || text.includes('emergency')) return 'critical';
    if (text.includes('urgent') || text.includes('asap')) return 'high';
    if (text.includes('important') || text.includes('priority')) return 'medium';
    return 'low';
  }
  
  /**
   * Classify category (simple heuristic)
   */
  private classifyCategory(signal: Signal): 'incident' | 'request' | 'issue' | 'question' | 'information' | 'discussion' | 'spam' {
    const text = `${signal.subject || ''} ${signal.body}`.toLowerCase();
    
    if (text.includes('incident') || text.includes('error') || text.includes('down')) {
      return 'incident';
    }
    if (text.includes('request') || text.includes('need') || text.includes('help')) {
      return 'request';
    }
    if (text.includes('fyi') || text.includes('update') || text.includes('status')) {
      return 'information';
    }
    return 'discussion';
  }
  
  /**
   * Suggest actions based on category
   */
  private suggestActions(category: string): string[] {
    const actions: Record<string, string[]> = {
      incident: ['create_task', 'escalate', 'send_notification'],
      request: ['create_task', 'assign'],
      information: ['archive', 'tag'],
      discussion: ['reply', 'forward'],
    };
    
    return actions[category] || ['review'];
  }
  
  // ==========================================================================
  // Adaptive Batching
  // ==========================================================================
  
  /**
   * Check if signal should be processed immediately
   */
  private shouldProcessImmediately(signal: Signal): boolean {
    if (!this.config.enableAdaptiveBatching) {
      return false;
    }
    
    // Process immediately if queue was empty
    if (this.config.processImmediatelyWhenEmpty && this.signalQueue.length === 1) {
      return true;
    }
    
    // Process immediately if urgent
    if (this.isUrgent(signal)) {
      return true;
    }
    
    // Process immediately if batch is full
    if (this.signalQueue.length >= this.config.maxBatchSize) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Get reason for immediate processing
   */
  private getImmediateProcessingReason(signal: Signal): string {
    if (this.signalQueue.length === 1) return 'queue_empty';
    if (this.isUrgent(signal)) return 'urgent_signal';
    if (this.signalQueue.length >= this.config.maxBatchSize) return 'batch_full';
    return 'unknown';
  }
  
  /**
   * Check if signal is urgent
   */
  private isUrgent(signal: Signal): boolean {
    const text = `${signal.subject || ''} ${signal.body}`.toLowerCase();
    const urgentKeywords = ['urgent', 'critical', 'emergency', 'asap', 'immediate'];
    
    return urgentKeywords.some(keyword => text.includes(keyword));
  }
  
  /**
   * Start batch timer
   */
  private startBatchTimer(): void {
    if (this.batchTimer) return; // Timer already running
    
    this.batchTimer = setTimeout(() => {
      this.processNow();
    }, this.config.batchWaitTime);
    
    logger.debug('Batch timer started', {
      waitTime: this.config.batchWaitTime,
      queueSize: this.signalQueue.length,
    });
  }
  
  // ==========================================================================
  // Utilities
  // ==========================================================================
  
  /**
   * Split signals into chunks
   */
  private chunkSignals(signals: Signal[], chunkSize: number): Signal[][] {
    const chunks: Signal[][] = [];
    
    for (let i = 0; i < signals.length; i += chunkSize) {
      chunks.push(signals.slice(i, i + chunkSize));
    }
    
    return chunks;
  }
  
  /**
   * Update statistics
   */
  private updateStats(result: BatchResult, timeSaved: number): void {
    this.stats.totalBatches++;
    this.stats.totalSignalsProcessed += result.signalsProcessed;
    this.stats.totalLlmCalls += result.llmCallsMade;
    this.stats.totalTokensSaved += result.tokensSaved;
    this.stats.totalTimeSaved += timeSaved;
    this.stats.totalProcessingTime += result.processingTime;
    
    // Keep last 100 batches
    this.stats.batchHistory.push(result);
    if (this.stats.batchHistory.length > 100) {
      this.stats.batchHistory.shift();
    }
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

let processorInstance: BatchProcessor | null = null;

/**
 * Get batch processor instance
 */
export function getBatchProcessor(config?: Partial<BatchProcessorConfig>): BatchProcessor {
  if (!processorInstance) {
    processorInstance = BatchProcessor.getInstance(config);
  }
  return processorInstance;
}

/**
 * Add signal to queue
 */
export async function addSignalToQueue(signal: Signal): Promise<void> {
  const processor = getBatchProcessor();
  await processor.addSignal(signal);
}

/**
 * Process batch of signals
 */
export async function processBatch(
  signals: Signal[],
  maxBatchSize?: number
): Promise<BatchResult[]> {
  const processor = getBatchProcessor();
  return await processor.processBatch(signals, maxBatchSize);
}

/**
 * Process queue now
 */
export async function processQueueNow(): Promise<BatchResult | null> {
  const processor = getBatchProcessor();
  return await processor.processNow();
}

/**
 * Get batch statistics
 */
export function getBatchStats(): BatchStats {
  const processor = getBatchProcessor();
  return processor.getBatchStats();
}

/**
 * Get batch history
 */
export function getBatchHistory(limit?: number): BatchResult[] {
  const processor = getBatchProcessor();
  return processor.getBatchHistory(limit);
}

/**
 * Clear processing queue
 */
export function clearBatchQueue(): number {
  const processor = getBatchProcessor();
  return processor.clearQueue();
}

/**
 * Get current queue size
 */
export function getBatchQueueSize(): number {
  const processor = getBatchProcessor();
  return processor.getQueueSize();
}
