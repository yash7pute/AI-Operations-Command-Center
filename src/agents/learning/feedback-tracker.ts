/**
 * Decision Feedback Tracker
 * 
 * Tracks outcomes of agent decisions for learning and continuous improvement.
 * Records success, failure, modifications, and rejections to identify patterns
 * and generate insights for improving classification and decision-making.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { ReasoningResult } from '../reasoning-pipeline';
import type { SignalClassification } from '../classifier-agent';
import type { ActionDecision } from '../decision-agent';
import logger from '../../utils/logger';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Feedback outcome types
 */
export type FeedbackOutcome = 
  | 'success'    // Action executed successfully
  | 'failure'    // Action failed to execute
  | 'modified'   // User modified the decision
  | 'rejected';  // User rejected the decision

/**
 * Feedback record stored for learning
 */
export interface FeedbackRecord {
  // Identification
  feedbackId: string;
  signalHash: string;
  signalId: string;
  
  // Original data
  signalSource: 'email' | 'slack' | 'sheets';
  signalSubject?: string;
  signalSender?: string;
  
  // Classification
  classification: SignalClassification;
  
  // Decision
  decision: ActionDecision;
  
  // Outcome
  outcome: FeedbackOutcome;
  modifications?: Partial<ActionDecision>;
  errorMessage?: string;
  
  // Feedback
  userFeedback?: string;
  reviewerId?: string;
  
  // Metadata
  timestamp: string;
  processingTime: number;
  confidenceScore: number;
}

/**
 * Feedback statistics
 */
export interface FeedbackStats {
  // Overall metrics
  totalFeedback: number;
  successCount: number;
  failureCount: number;
  modifiedCount: number;
  rejectedCount: number;
  
  // Rates
  successRate: number;        // percentage
  failureRate: number;        // percentage
  modificationRate: number;   // percentage
  rejectionRate: number;      // percentage
  
  // By category
  successByCategory: Record<string, {
    total: number;
    success: number;
    failure: number;
    modified: number;
    rejected: number;
    successRate: number;
  }>;
  
  // By action type
  successByAction: Record<string, {
    total: number;
    success: number;
    failure: number;
    modified: number;
    rejected: number;
    successRate: number;
  }>;
  
  // By urgency
  successByUrgency: Record<string, {
    total: number;
    success: number;
    successRate: number;
  }>;
  
  // By confidence
  confidenceDistribution: {
    high: { total: number; successRate: number };      // > 0.8
    medium: { total: number; successRate: number };    // 0.5-0.8
    low: { total: number; successRate: number };       // < 0.5
  };
  
  // Patterns
  commonFailureReasons: Array<{ reason: string; count: number }>;
  frequentlyModifiedActions: Array<{ action: string; count: number }>;
  problemSenders: Array<{ sender: string; failureRate: number; count: number }>;
  
  // Time range
  since: string;
  lastUpdated: string;
}

/**
 * Learning insight generated from feedback
 */
export interface LearningInsight {
  // Identification
  insightId: string;
  type: 'classification' | 'decision' | 'routing' | 'timing' | 'sender';
  priority: 'high' | 'medium' | 'low';
  
  // Insight
  title: string;
  description: string;
  recommendation: string;
  
  // Supporting data
  confidence: number;
  supportingEvidence: Array<{
    signalHash: string;
    example: string;
    outcome: FeedbackOutcome;
  }>;
  occurrenceCount: number;
  
  // Metadata
  generatedAt: string;
  appliedAt?: string;
  status: 'pending' | 'applied' | 'dismissed';
}

/**
 * Learning report
 */
export interface LearningReport {
  reportId: string;
  generatedAt: string;
  timeRange: {
    start: string;
    end: string;
  };
  
  // Summary
  summary: {
    totalFeedback: number;
    overallSuccessRate: number;
    improvementAreas: string[];
  };
  
  // Insights
  insights: LearningInsight[];
  
  // Key patterns
  patterns: {
    alwaysUrgentSenders: Array<{ sender: string; urgentRate: number; count: number }>;
    frequentlyModifiedCategories: Array<{ category: string; modificationRate: number; count: number }>;
    failureProneSources: Array<{ source: string; failureRate: number; count: number }>;
    highConfidenceLowSuccess: Array<{ action: string; confidence: number; successRate: number }>;
  };
  
  // Recommendations
  recommendations: Array<{
    area: string;
    action: string;
    impact: 'high' | 'medium' | 'low';
    implementation: string;
  }>;
}

/**
 * Feedback export format for retraining
 */
export interface FeedbackExport {
  exportId: string;
  exportedAt: string;
  recordCount: number;
  
  // Training data
  successfulExamples: Array<{
    signal: {
      subject?: string;
      body: string;
      sender?: string;
      source: string;
    };
    classification: SignalClassification;
    decision: ActionDecision;
  }>;
  
  failedExamples: Array<{
    signal: {
      subject?: string;
      body: string;
      sender?: string;
      source: string;
    };
    classification: SignalClassification;
    decision: ActionDecision;
    errorReason: string;
  }>;
  
  modifiedExamples: Array<{
    signal: {
      subject?: string;
      body: string;
      sender?: string;
      source: string;
    };
    originalClassification: SignalClassification;
    originalDecision: ActionDecision;
    modifications: Partial<ActionDecision>;
    userFeedback?: string;
  }>;
}

/**
 * Feedback tracker configuration
 */
export interface FeedbackTrackerConfig {
  feedbackFilePath?: string;
  enablePersistence?: boolean;
  maxFeedbackInMemory?: number;
  insightThreshold?: number;        // Min occurrences for insight
  confidenceThreshold?: number;     // Min confidence for insight
  autoGenerateInsights?: boolean;
  insightGenerationInterval?: number; // milliseconds
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<FeedbackTrackerConfig> = {
  feedbackFilePath: path.join(process.cwd(), 'logs', 'feedback-history.jsonl'),
  enablePersistence: true,
  maxFeedbackInMemory: 10000,
  insightThreshold: 5,              // Need 5+ occurrences
  confidenceThreshold: 0.75,        // 75% confidence
  autoGenerateInsights: true,
  insightGenerationInterval: 60 * 60 * 1000, // 1 hour
};

// ============================================================================
// Feedback Tracker Class
// ============================================================================

/**
 * Feedback Tracker - Tracks decision outcomes for learning
 */
export class FeedbackTracker {
  private static instance: FeedbackTracker;
  private config: Required<FeedbackTrackerConfig>;
  private feedbackRecords: Map<string, FeedbackRecord>;
  private insights: Map<string, LearningInsight>;
  private feedbackIdCounter: number;
  private insightIdCounter: number;
  private insightTimer?: NodeJS.Timeout;
  
  // Statistics cache
  private statsCache?: FeedbackStats;
  private statsCacheTime?: number;
  private readonly STATS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  private constructor(config?: FeedbackTrackerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.feedbackRecords = new Map();
    this.insights = new Map();
    this.feedbackIdCounter = 1;
    this.insightIdCounter = 1;
    
    // Load existing feedback from disk
    this.loadFeedbackFromDisk().catch((error) => {
      logger.error('[FeedbackTracker] Failed to load feedback from disk', { 
        error: error.message 
      });
    });
    
    // Start auto-insight generation if enabled
    if (this.config.autoGenerateInsights) {
      this.startInsightGeneration();
    }
    
    logger.info('[FeedbackTracker] Initialized', {
      persistence: this.config.enablePersistence,
      autoInsights: this.config.autoGenerateInsights,
      filePath: this.config.feedbackFilePath,
    });
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(config?: FeedbackTrackerConfig): FeedbackTracker {
    if (!FeedbackTracker.instance) {
      FeedbackTracker.instance = new FeedbackTracker(config);
    }
    return FeedbackTracker.instance;
  }
  
  /**
   * Record feedback for a decision
   */
  public async recordFeedback(
    reasoningResult: ReasoningResult,
    outcome: FeedbackOutcome,
    options?: {
      modifications?: Partial<ActionDecision>;
      errorMessage?: string;
      userFeedback?: string;
      reviewerId?: string;
    }
  ): Promise<FeedbackRecord> {
    const feedbackId = this.generateFeedbackId();
    const signalHash = this.computeSignalHash(reasoningResult.signal);
    
    const record: FeedbackRecord = {
      feedbackId,
      signalHash,
      signalId: reasoningResult.signal.id,
      signalSource: reasoningResult.signal.source,
      signalSubject: reasoningResult.signal.subject,
      signalSender: reasoningResult.signal.sender,
      classification: reasoningResult.classification.classification,
      decision: reasoningResult.decision.decision,
      outcome,
      modifications: options?.modifications,
      errorMessage: options?.errorMessage,
      userFeedback: options?.userFeedback,
      reviewerId: options?.reviewerId,
      timestamp: new Date().toISOString(),
      processingTime: reasoningResult.metadata.processingTime,
      confidenceScore: reasoningResult.metadata.confidence,
    };
    
    // Add to in-memory store
    this.feedbackRecords.set(feedbackId, record);
    
    // Enforce memory limit
    if (this.feedbackRecords.size > this.config.maxFeedbackInMemory) {
      const oldestKey = this.feedbackRecords.keys().next().value;
      if (oldestKey) {
        this.feedbackRecords.delete(oldestKey);
      }
    }
    
    // Invalidate stats cache
    this.statsCache = undefined;
    this.statsCacheTime = undefined;
    
    logger.info('[FeedbackTracker] Feedback recorded', {
      feedbackId,
      signalId: record.signalId,
      outcome,
      action: record.decision.action,
      confidence: record.confidenceScore,
    });
    
    // Persist to disk
    if (this.config.enablePersistence) {
      await this.appendFeedbackToDisk(record);
    }
    
    return record;
  }
  
  /**
   * Get feedback statistics
   */
  public getFeedbackStats(): FeedbackStats {
    // Return cached stats if fresh
    const now = Date.now();
    if (this.statsCache && this.statsCacheTime && (now - this.statsCacheTime) < this.STATS_CACHE_TTL) {
      return this.statsCache;
    }
    
    const records = Array.from(this.feedbackRecords.values());
    
    if (records.length === 0) {
      return this.getEmptyStats();
    }
    
    // Overall metrics
    const totalFeedback = records.length;
    const successCount = records.filter(r => r.outcome === 'success').length;
    const failureCount = records.filter(r => r.outcome === 'failure').length;
    const modifiedCount = records.filter(r => r.outcome === 'modified').length;
    const rejectedCount = records.filter(r => r.outcome === 'rejected').length;
    
    const successRate = (successCount / totalFeedback) * 100;
    const failureRate = (failureCount / totalFeedback) * 100;
    const modificationRate = (modifiedCount / totalFeedback) * 100;
    const rejectionRate = (rejectedCount / totalFeedback) * 100;
    
    // By category
    const successByCategory = this.calculateSuccessByDimension(
      records,
      r => r.classification.category
    );
    
    // By action type
    const successByAction = this.calculateSuccessByDimension(
      records,
      r => r.decision.action
    );
    
    // By urgency
    const successByUrgency = this.calculateSuccessByUrgency(records);
    
    // By confidence
    const confidenceDistribution = this.calculateConfidenceDistribution(records);
    
    // Patterns
    const commonFailureReasons = this.analyzeFailureReasons(records);
    const frequentlyModifiedActions = this.analyzeModifiedActions(records);
    const problemSenders = this.analyzeProblemSenders(records);
    
    const stats: FeedbackStats = {
      totalFeedback,
      successCount,
      failureCount,
      modifiedCount,
      rejectedCount,
      successRate,
      failureRate,
      modificationRate,
      rejectionRate,
      successByCategory,
      successByAction,
      successByUrgency,
      confidenceDistribution,
      commonFailureReasons,
      frequentlyModifiedActions,
      problemSenders,
      since: records[0]?.timestamp || new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    
    // Cache the stats
    this.statsCache = stats;
    this.statsCacheTime = now;
    
    return stats;
  }
  
  /**
   * Generate learning report with insights
   */
  public async generateLearningReport(): Promise<LearningReport> {
    const reportId = `report-${Date.now()}`;
    const records = Array.from(this.feedbackRecords.values());
    
    if (records.length === 0) {
      return this.getEmptyReport(reportId);
    }
    
    // Generate insights
    const insights = await this.generateInsights();
    
    // Analyze patterns
    const patterns = this.analyzePatterns(records);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(insights, patterns);
    
    // Calculate summary
    const stats = this.getFeedbackStats();
    const improvementAreas = this.identifyImprovementAreas(stats, patterns);
    
    const report: LearningReport = {
      reportId,
      generatedAt: new Date().toISOString(),
      timeRange: {
        start: records[0]?.timestamp || new Date().toISOString(),
        end: records[records.length - 1]?.timestamp || new Date().toISOString(),
      },
      summary: {
        totalFeedback: records.length,
        overallSuccessRate: stats.successRate,
        improvementAreas,
      },
      insights,
      patterns,
      recommendations,
    };
    
    logger.info('[FeedbackTracker] Learning report generated', {
      reportId,
      insightsCount: insights.length,
      recommendationsCount: recommendations.length,
      successRate: stats.successRate.toFixed(1),
    });
    
    return report;
  }
  
  /**
   * Generate learning insights from feedback
   */
  public async generateInsights(): Promise<LearningInsight[]> {
    const records = Array.from(this.feedbackRecords.values());
    const insights: LearningInsight[] = [];
    
    // Insight 1: Always urgent senders
    const urgentSenderInsights = this.generateUrgentSenderInsights(records);
    insights.push(...urgentSenderInsights);
    
    // Insight 2: Categories needing approval
    const approvalCategoryInsights = this.generateApprovalCategoryInsights(records);
    insights.push(...approvalCategoryInsights);
    
    // Insight 3: Frequently modified actions
    const modifiedActionInsights = this.generateModifiedActionInsights(records);
    insights.push(...modifiedActionInsights);
    
    // Insight 4: Low confidence but high success
    const confidenceInsights = this.generateConfidenceInsights(records);
    insights.push(...confidenceInsights);
    
    // Insight 5: Source-specific patterns
    const sourceInsights = this.generateSourceInsights(records);
    insights.push(...sourceInsights);
    
    // Store insights
    insights.forEach(insight => {
      this.insights.set(insight.insightId, insight);
    });
    
    logger.info('[FeedbackTracker] Insights generated', {
      count: insights.length,
      highPriority: insights.filter(i => i.priority === 'high').length,
    });
    
    return insights;
  }
  
  /**
   * Export feedback data for retraining
   */
  public async exportForRetraining(options?: {
    minConfidence?: number;
    maxRecords?: number;
    includeRejected?: boolean;
  }): Promise<FeedbackExport> {
    const records = Array.from(this.feedbackRecords.values());
    
    const minConfidence = options?.minConfidence || 0.5;
    const maxRecords = options?.maxRecords || 1000;
    const includeRejected = options?.includeRejected !== false;
    
    // Filter records
    let filteredRecords = records.filter(r => r.confidenceScore >= minConfidence);
    if (!includeRejected) {
      filteredRecords = filteredRecords.filter(r => r.outcome !== 'rejected');
    }
    
    // Limit records
    if (filteredRecords.length > maxRecords) {
      filteredRecords = filteredRecords.slice(-maxRecords);
    }
    
    // Separate by outcome
    const successfulExamples = filteredRecords
      .filter(r => r.outcome === 'success')
      .map(r => ({
        signal: {
          subject: r.signalSubject,
          body: '', // Not stored in feedback
          sender: r.signalSender,
          source: r.signalSource,
        },
        classification: r.classification,
        decision: r.decision,
      }));
    
    const failedExamples = filteredRecords
      .filter(r => r.outcome === 'failure')
      .map(r => ({
        signal: {
          subject: r.signalSubject,
          body: '',
          sender: r.signalSender,
          source: r.signalSource,
        },
        classification: r.classification,
        decision: r.decision,
        errorReason: r.errorMessage || 'Unknown error',
      }));
    
    const modifiedExamples = filteredRecords
      .filter(r => r.outcome === 'modified' && r.modifications)
      .map(r => ({
        signal: {
          subject: r.signalSubject,
          body: '',
          sender: r.signalSender,
          source: r.signalSource,
        },
        originalClassification: r.classification,
        originalDecision: r.decision,
        modifications: r.modifications!,
        userFeedback: r.userFeedback,
      }));
    
    const exportData: FeedbackExport = {
      exportId: `export-${Date.now()}`,
      exportedAt: new Date().toISOString(),
      recordCount: filteredRecords.length,
      successfulExamples,
      failedExamples,
      modifiedExamples,
    };
    
    logger.info('[FeedbackTracker] Feedback exported for retraining', {
      exportId: exportData.exportId,
      total: exportData.recordCount,
      successful: successfulExamples.length,
      failed: failedExamples.length,
      modified: modifiedExamples.length,
    });
    
    return exportData;
  }
  
  /**
   * Get all feedback records
   */
  public getAllFeedback(filters?: {
    outcome?: FeedbackOutcome;
    category?: string;
    action?: string;
    minConfidence?: number;
    since?: string;
  }): FeedbackRecord[] {
    let records = Array.from(this.feedbackRecords.values());
    
    if (filters) {
      if (filters.outcome) {
        records = records.filter(r => r.outcome === filters.outcome);
      }
      if (filters.category) {
        records = records.filter(r => r.classification.category === filters.category);
      }
      if (filters.action) {
        records = records.filter(r => r.decision.action === filters.action);
      }
      if (filters.minConfidence !== undefined) {
        records = records.filter(r => r.confidenceScore >= filters.minConfidence!);
      }
      if (filters.since) {
        const sinceDate = new Date(filters.since).getTime();
        records = records.filter(r => new Date(r.timestamp).getTime() >= sinceDate);
      }
    }
    
    return records;
  }
  
  /**
   * Clear all feedback (for testing)
   */
  public async clearAllFeedback(): Promise<void> {
    this.feedbackRecords.clear();
    this.insights.clear();
    this.statsCache = undefined;
    this.statsCacheTime = undefined;
    
    logger.info('[FeedbackTracker] All feedback cleared');
  }
  
  /**
   * Shutdown - cleanup and save
   */
  public async shutdown(): Promise<void> {
    if (this.insightTimer) {
      clearInterval(this.insightTimer);
    }
    
    logger.info('[FeedbackTracker] Shutdown complete');
  }
  
  // ==================== Private Helper Methods ====================
  
  /**
   * Generate unique feedback ID
   */
  private generateFeedbackId(): string {
    return `feedback-${Date.now()}-${this.feedbackIdCounter++}`;
  }
  
  /**
   * Generate unique insight ID
   */
  private generateInsightId(): string {
    return `insight-${Date.now()}-${this.insightIdCounter++}`;
  }
  
  /**
   * Compute hash for signal (for deduplication)
   */
  private computeSignalHash(signal: any): string {
    const content = `${signal.source}-${signal.sender}-${signal.subject}-${signal.body?.substring(0, 100)}`;
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }
  
  /**
   * Append feedback to JSONL file
   */
  private async appendFeedbackToDisk(record: FeedbackRecord): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.config.feedbackFilePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Append as JSON line
      const line = JSON.stringify(record) + '\n';
      await fs.appendFile(this.config.feedbackFilePath, line, 'utf-8');
      
      logger.debug('[FeedbackTracker] Feedback persisted to disk', {
        feedbackId: record.feedbackId,
        filePath: this.config.feedbackFilePath,
      });
    } catch (error) {
      logger.error('[FeedbackTracker] Failed to persist feedback', {
        feedbackId: record.feedbackId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  /**
   * Load feedback from JSONL file
   */
  private async loadFeedbackFromDisk(): Promise<void> {
    try {
      const fileContent = await fs.readFile(this.config.feedbackFilePath, 'utf-8');
      const lines = fileContent.trim().split('\n');
      
      let loadedCount = 0;
      for (const line of lines) {
        if (line.trim()) {
          try {
            const record: FeedbackRecord = JSON.parse(line);
            this.feedbackRecords.set(record.feedbackId, record);
            loadedCount++;
            
            // Enforce memory limit
            if (this.feedbackRecords.size > this.config.maxFeedbackInMemory) {
              const oldestKey = this.feedbackRecords.keys().next().value;
              if (oldestKey) {
                this.feedbackRecords.delete(oldestKey);
              }
            }
          } catch (parseError) {
            logger.warn('[FeedbackTracker] Failed to parse feedback line', { line });
          }
        }
      }
      
      logger.info('[FeedbackTracker] Feedback loaded from disk', {
        loadedCount,
        totalInMemory: this.feedbackRecords.size,
        filePath: this.config.feedbackFilePath,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('[FeedbackTracker] No existing feedback file found');
      } else {
        logger.error('[FeedbackTracker] Failed to load feedback from disk', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  
  /**
   * Calculate success metrics by dimension
   */
  private calculateSuccessByDimension(
    records: FeedbackRecord[],
    dimensionFn: (r: FeedbackRecord) => string
  ): Record<string, any> {
    const byDimension: Record<string, any> = {};
    
    records.forEach(record => {
      const dimension = dimensionFn(record);
      
      if (!byDimension[dimension]) {
        byDimension[dimension] = {
          total: 0,
          success: 0,
          failure: 0,
          modified: 0,
          rejected: 0,
          successRate: 0,
        };
      }
      
      byDimension[dimension].total++;
      
      if (record.outcome === 'success') byDimension[dimension].success++;
      else if (record.outcome === 'failure') byDimension[dimension].failure++;
      else if (record.outcome === 'modified') byDimension[dimension].modified++;
      else if (record.outcome === 'rejected') byDimension[dimension].rejected++;
    });
    
    // Calculate success rates
    Object.keys(byDimension).forEach(key => {
      const data = byDimension[key];
      data.successRate = (data.success / data.total) * 100;
    });
    
    return byDimension;
  }
  
  /**
   * Calculate success by urgency
   */
  private calculateSuccessByUrgency(records: FeedbackRecord[]): Record<string, any> {
    const byUrgency: Record<string, any> = {};
    
    records.forEach(record => {
      const urgency = record.classification.urgency;
      
      if (!byUrgency[urgency]) {
        byUrgency[urgency] = {
          total: 0,
          success: 0,
          successRate: 0,
        };
      }
      
      byUrgency[urgency].total++;
      if (record.outcome === 'success') {
        byUrgency[urgency].success++;
      }
    });
    
    // Calculate success rates
    Object.keys(byUrgency).forEach(key => {
      const data = byUrgency[key];
      data.successRate = (data.success / data.total) * 100;
    });
    
    return byUrgency;
  }
  
  /**
   * Calculate confidence distribution
   */
  private calculateConfidenceDistribution(records: FeedbackRecord[]): any {
    const distribution = {
      high: { total: 0, success: 0, successRate: 0 },
      medium: { total: 0, success: 0, successRate: 0 },
      low: { total: 0, success: 0, successRate: 0 },
    };
    
    records.forEach(record => {
      let bucket: 'high' | 'medium' | 'low';
      
      if (record.confidenceScore > 0.8) bucket = 'high';
      else if (record.confidenceScore >= 0.5) bucket = 'medium';
      else bucket = 'low';
      
      distribution[bucket].total++;
      if (record.outcome === 'success') {
        distribution[bucket].success++;
      }
    });
    
    // Calculate success rates
    (['high', 'medium', 'low'] as const).forEach(bucket => {
      const data = distribution[bucket];
      if (data.total > 0) {
        data.successRate = (data.success / data.total) * 100;
      }
    });
    
    return distribution;
  }
  
  /**
   * Analyze failure reasons
   */
  private analyzeFailureReasons(records: FeedbackRecord[]): Array<{ reason: string; count: number }> {
    const failureReasons = new Map<string, number>();
    
    records
      .filter(r => r.outcome === 'failure' && r.errorMessage)
      .forEach(r => {
        const reason = r.errorMessage!;
        failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
      });
    
    return Array.from(failureReasons.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }
  
  /**
   * Analyze frequently modified actions
   */
  private analyzeModifiedActions(records: FeedbackRecord[]): Array<{ action: string; count: number }> {
    const modifiedActions = new Map<string, number>();
    
    records
      .filter(r => r.outcome === 'modified')
      .forEach(r => {
        const action = r.decision.action;
        modifiedActions.set(action, (modifiedActions.get(action) || 0) + 1);
      });
    
    return Array.from(modifiedActions.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }
  
  /**
   * Analyze problem senders
   */
  private analyzeProblemSenders(records: FeedbackRecord[]): Array<{ sender: string; failureRate: number; count: number }> {
    const senderStats = new Map<string, { total: number; failures: number }>();
    
    records
      .filter(r => r.signalSender)
      .forEach(r => {
        const sender = r.signalSender!;
        const stats = senderStats.get(sender) || { total: 0, failures: 0 };
        
        stats.total++;
        if (r.outcome === 'failure' || r.outcome === 'rejected') {
          stats.failures++;
        }
        
        senderStats.set(sender, stats);
      });
    
    return Array.from(senderStats.entries())
      .filter(([_, stats]) => stats.total >= 3) // Min 3 signals
      .map(([sender, stats]) => ({
        sender,
        failureRate: (stats.failures / stats.total) * 100,
        count: stats.total,
      }))
      .filter(s => s.failureRate >= 30) // At least 30% failure rate
      .sort((a, b) => b.failureRate - a.failureRate)
      .slice(0, 10);
  }
  
  /**
   * Generate insights about urgent senders
   */
  private generateUrgentSenderInsights(records: FeedbackRecord[]): LearningInsight[] {
    const senderUrgency = new Map<string, { total: number; urgent: number }>();
    
    records
      .filter(r => r.signalSender)
      .forEach(r => {
        const sender = r.signalSender!;
        const stats = senderUrgency.get(sender) || { total: 0, urgent: 0 };
        
        stats.total++;
        if (r.classification.urgency === 'high' || r.classification.urgency === 'critical') {
          stats.urgent++;
        }
        
        senderUrgency.set(sender, stats);
      });
    
    const insights: LearningInsight[] = [];
    
    senderUrgency.forEach((stats, sender) => {
      if (stats.total >= this.config.insightThreshold) {
        const urgentRate = stats.urgent / stats.total;
        
        if (urgentRate >= this.config.confidenceThreshold) {
          insights.push({
            insightId: this.generateInsightId(),
            type: 'sender',
            priority: urgentRate > 0.9 ? 'high' : 'medium',
            title: `Emails from ${sender} are always urgent`,
            description: `${(urgentRate * 100).toFixed(0)}% of emails from ${sender} are classified as urgent (${stats.urgent}/${stats.total})`,
            recommendation: `Adjust classification rules to automatically mark emails from ${sender} as high priority`,
            confidence: urgentRate,
            supportingEvidence: records
              .filter(r => r.signalSender === sender)
              .slice(0, 3)
              .map(r => ({
                signalHash: r.signalHash,
                example: r.signalSubject || 'No subject',
                outcome: r.outcome,
              })),
            occurrenceCount: stats.urgent,
            generatedAt: new Date().toISOString(),
            status: 'pending',
          });
        }
      }
    });
    
    return insights;
  }
  
  /**
   * Generate insights about approval categories
   */
  private generateApprovalCategoryInsights(records: FeedbackRecord[]): LearningInsight[] {
    const categoryApproval = new Map<string, { total: number; needsApproval: number }>();
    
    records.forEach(r => {
      const category = r.classification.category;
      const stats = categoryApproval.get(category) || { total: 0, needsApproval: 0 };
      
      stats.total++;
      if (r.decision.requiresApproval || r.outcome === 'modified') {
        stats.needsApproval++;
      }
      
      categoryApproval.set(category, stats);
    });
    
    const insights: LearningInsight[] = [];
    
    categoryApproval.forEach((stats, category) => {
      if (stats.total >= this.config.insightThreshold) {
        const approvalRate = stats.needsApproval / stats.total;
        
        if (approvalRate >= this.config.confidenceThreshold) {
          insights.push({
            insightId: this.generateInsightId(),
            type: 'decision',
            priority: 'medium',
            title: `Tasks in category "${category}" usually need approval`,
            description: `${(approvalRate * 100).toFixed(0)}% of "${category}" tasks require approval or modification (${stats.needsApproval}/${stats.total})`,
            recommendation: `Update decision rules to automatically require approval for "${category}" category`,
            confidence: approvalRate,
            supportingEvidence: records
              .filter(r => r.classification.category === category)
              .slice(0, 3)
              .map(r => ({
                signalHash: r.signalHash,
                example: r.signalSubject || 'No subject',
                outcome: r.outcome,
              })),
            occurrenceCount: stats.needsApproval,
            generatedAt: new Date().toISOString(),
            status: 'pending',
          });
        }
      }
    });
    
    return insights;
  }
  
  /**
   * Generate insights about modified actions
   */
  private generateModifiedActionInsights(records: FeedbackRecord[]): LearningInsight[] {
    const actionModification = new Map<string, { total: number; modified: number; commonChange?: string }>();
    
    records.forEach(r => {
      const action = r.decision.action;
      const stats = actionModification.get(action) || { total: 0, modified: 0 };
      
      stats.total++;
      if (r.outcome === 'modified') {
        stats.modified++;
      }
      
      actionModification.set(action, stats);
    });
    
    const insights: LearningInsight[] = [];
    
    actionModification.forEach((stats, action) => {
      if (stats.total >= this.config.insightThreshold) {
        const modificationRate = stats.modified / stats.total;
        
        if (modificationRate >= 0.3) { // 30% modification rate
          insights.push({
            insightId: this.generateInsightId(),
            type: 'decision',
            priority: modificationRate > 0.5 ? 'high' : 'medium',
            title: `Action "${action}" is frequently modified`,
            description: `${(modificationRate * 100).toFixed(0)}% of "${action}" decisions are modified by users (${stats.modified}/${stats.total})`,
            recommendation: `Review and improve decision logic for "${action}" action to better match user expectations`,
            confidence: modificationRate,
            supportingEvidence: records
              .filter(r => r.decision.action === action && r.outcome === 'modified')
              .slice(0, 3)
              .map(r => ({
                signalHash: r.signalHash,
                example: r.signalSubject || 'No subject',
                outcome: r.outcome,
              })),
            occurrenceCount: stats.modified,
            generatedAt: new Date().toISOString(),
            status: 'pending',
          });
        }
      }
    });
    
    return insights;
  }
  
  /**
   * Generate confidence-related insights
   */
  private generateConfidenceInsights(records: FeedbackRecord[]): LearningInsight[] {
    const insights: LearningInsight[] = [];
    
    // Find high confidence but low success
    const highConfidenceLowSuccess = records.filter(r => 
      r.confidenceScore > 0.8 && (r.outcome === 'failure' || r.outcome === 'rejected')
    );
    
    if (highConfidenceLowSuccess.length >= this.config.insightThreshold) {
      insights.push({
        insightId: this.generateInsightId(),
        type: 'classification',
        priority: 'high',
        title: 'High confidence scores not matching actual success',
        description: `${highConfidenceLowSuccess.length} decisions with >80% confidence failed or were rejected`,
        recommendation: 'Recalibrate confidence scoring to better reflect actual decision quality',
        confidence: 0.8,
        supportingEvidence: highConfidenceLowSuccess.slice(0, 3).map(r => ({
          signalHash: r.signalHash,
          example: `${r.decision.action} (${(r.confidenceScore * 100).toFixed(0)}% conf)`,
          outcome: r.outcome,
        })),
        occurrenceCount: highConfidenceLowSuccess.length,
        generatedAt: new Date().toISOString(),
        status: 'pending',
      });
    }
    
    return insights;
  }
  
  /**
   * Generate source-specific insights
   */
  private generateSourceInsights(records: FeedbackRecord[]): LearningInsight[] {
    const sourceSuccess = new Map<string, { total: number; success: number }>();
    
    records.forEach(r => {
      const source = r.signalSource;
      const stats = sourceSuccess.get(source) || { total: 0, success: 0 };
      
      stats.total++;
      if (r.outcome === 'success') {
        stats.success++;
      }
      
      sourceSuccess.set(source, stats);
    });
    
    const insights: LearningInsight[] = [];
    
    sourceSuccess.forEach((stats, source) => {
      if (stats.total >= this.config.insightThreshold) {
        const successRate = stats.success / stats.total;
        
        if (successRate < 0.5) { // Less than 50% success
          insights.push({
            insightId: this.generateInsightId(),
            type: 'routing',
            priority: 'medium',
            title: `Low success rate for ${source} signals`,
            description: `Only ${(successRate * 100).toFixed(0)}% success rate for ${source} source (${stats.success}/${stats.total})`,
            recommendation: `Review and improve handling of ${source} signals, may need different classification approach`,
            confidence: 1 - successRate,
            supportingEvidence: records
              .filter(r => r.signalSource === source && r.outcome !== 'success')
              .slice(0, 3)
              .map(r => ({
                signalHash: r.signalHash,
                example: r.signalSubject || 'No subject',
                outcome: r.outcome,
              })),
            occurrenceCount: stats.total - stats.success,
            generatedAt: new Date().toISOString(),
            status: 'pending',
          });
        }
      }
    });
    
    return insights;
  }
  
  /**
   * Analyze patterns for report
   */
  private analyzePatterns(records: FeedbackRecord[]): LearningReport['patterns'] {
    // Always urgent senders
    const senderUrgency = new Map<string, { total: number; urgent: number }>();
    records.filter(r => r.signalSender).forEach(r => {
      const sender = r.signalSender!;
      const stats = senderUrgency.get(sender) || { total: 0, urgent: 0 };
      stats.total++;
      if (r.classification.urgency === 'high' || r.classification.urgency === 'critical') {
        stats.urgent++;
      }
      senderUrgency.set(sender, stats);
    });
    
    const alwaysUrgentSenders = Array.from(senderUrgency.entries())
      .filter(([_, stats]) => stats.total >= 3)
      .map(([sender, stats]) => ({
        sender,
        urgentRate: (stats.urgent / stats.total) * 100,
        count: stats.total,
      }))
      .filter(s => s.urgentRate >= 75)
      .sort((a, b) => b.urgentRate - a.urgentRate)
      .slice(0, 5);
    
    // Frequently modified categories
    const categoryModification = new Map<string, { total: number; modified: number }>();
    records.forEach(r => {
      const category = r.classification.category;
      const stats = categoryModification.get(category) || { total: 0, modified: 0 };
      stats.total++;
      if (r.outcome === 'modified') stats.modified++;
      categoryModification.set(category, stats);
    });
    
    const frequentlyModifiedCategories = Array.from(categoryModification.entries())
      .filter(([_, stats]) => stats.total >= 3)
      .map(([category, stats]) => ({
        category,
        modificationRate: (stats.modified / stats.total) * 100,
        count: stats.total,
      }))
      .filter(c => c.modificationRate >= 30)
      .sort((a, b) => b.modificationRate - a.modificationRate)
      .slice(0, 5);
    
    // Failure-prone sources
    const sourceFailure = new Map<string, { total: number; failures: number }>();
    records.forEach(r => {
      const source = r.signalSource;
      const stats = sourceFailure.get(source) || { total: 0, failures: 0 };
      stats.total++;
      if (r.outcome === 'failure' || r.outcome === 'rejected') stats.failures++;
      sourceFailure.set(source, stats);
    });
    
    const failureProneSources = Array.from(sourceFailure.entries())
      .map(([source, stats]) => ({
        source,
        failureRate: (stats.failures / stats.total) * 100,
        count: stats.total,
      }))
      .filter(s => s.failureRate >= 20)
      .sort((a, b) => b.failureRate - a.failureRate);
    
    // High confidence but low success
    const actionConfidence = new Map<string, { total: number; highConf: number; highConfSuccess: number }>();
    records.forEach(r => {
      const action = r.decision.action;
      const stats = actionConfidence.get(action) || { total: 0, highConf: 0, highConfSuccess: 0 };
      stats.total++;
      if (r.confidenceScore > 0.8) {
        stats.highConf++;
        if (r.outcome === 'success') stats.highConfSuccess++;
      }
      actionConfidence.set(action, stats);
    });
    
    const highConfidenceLowSuccess = Array.from(actionConfidence.entries())
      .filter(([_, stats]) => stats.highConf >= 3)
      .map(([action, stats]) => ({
        action,
        confidence: 0.85, // Average high confidence
        successRate: (stats.highConfSuccess / stats.highConf) * 100,
      }))
      .filter(a => a.successRate < 60)
      .sort((a, b) => a.successRate - b.successRate)
      .slice(0, 5);
    
    return {
      alwaysUrgentSenders,
      frequentlyModifiedCategories,
      failureProneSources,
      highConfidenceLowSuccess,
    };
  }
  
  /**
   * Generate recommendations
   */
  private generateRecommendations(
    insights: LearningInsight[],
    patterns: LearningReport['patterns']
  ): LearningReport['recommendations'] {
    const recommendations: LearningReport['recommendations'] = [];
    
    // High priority insights
    const highPriorityInsights = insights.filter(i => i.priority === 'high');
    if (highPriorityInsights.length > 0) {
      recommendations.push({
        area: 'Classification Rules',
        action: `Address ${highPriorityInsights.length} high-priority classification issues`,
        impact: 'high',
        implementation: 'Review and update classification prompts based on high-priority insights',
      });
    }
    
    // Always urgent senders
    if (patterns.alwaysUrgentSenders.length > 0) {
      recommendations.push({
        area: 'Sender Rules',
        action: `Create urgency rules for ${patterns.alwaysUrgentSenders.length} specific senders`,
        impact: 'medium',
        implementation: `Add sender-specific urgency mappings: ${patterns.alwaysUrgentSenders.map(s => s.sender).join(', ')}`,
      });
    }
    
    // Modified categories
    if (patterns.frequentlyModifiedCategories.length > 0) {
      recommendations.push({
        area: 'Decision Logic',
        action: `Improve decision logic for frequently modified categories`,
        impact: 'high',
        implementation: `Review decision patterns for: ${patterns.frequentlyModifiedCategories.map(c => c.category).join(', ')}`,
      });
    }
    
    // Failure-prone sources
    if (patterns.failureProneSources.length > 0) {
      recommendations.push({
        area: 'Source Handling',
        action: `Improve handling of failure-prone sources`,
        impact: 'medium',
        implementation: `Create source-specific classification and routing for: ${patterns.failureProneSources.map(s => s.source).join(', ')}`,
      });
    }
    
    return recommendations;
  }
  
  /**
   * Identify improvement areas
   */
  private identifyImprovementAreas(stats: FeedbackStats, patterns: LearningReport['patterns']): string[] {
    const areas: string[] = [];
    
    if (stats.successRate < 70) {
      areas.push('Overall success rate below 70%');
    }
    
    if (stats.modificationRate > 20) {
      areas.push('High modification rate indicates decision logic needs improvement');
    }
    
    if (stats.rejectionRate > 10) {
      areas.push('High rejection rate suggests classification or decision quality issues');
    }
    
    if (patterns.alwaysUrgentSenders.length > 0) {
      areas.push('Sender-specific urgency patterns not being captured');
    }
    
    if (patterns.frequentlyModifiedCategories.length > 0) {
      areas.push('Certain categories consistently need human modification');
    }
    
    return areas;
  }
  
  /**
   * Get empty stats (when no feedback)
   */
  private getEmptyStats(): FeedbackStats {
    return {
      totalFeedback: 0,
      successCount: 0,
      failureCount: 0,
      modifiedCount: 0,
      rejectedCount: 0,
      successRate: 0,
      failureRate: 0,
      modificationRate: 0,
      rejectionRate: 0,
      successByCategory: {},
      successByAction: {},
      successByUrgency: {},
      confidenceDistribution: {
        high: { total: 0, successRate: 0 },
        medium: { total: 0, successRate: 0 },
        low: { total: 0, successRate: 0 },
      },
      commonFailureReasons: [],
      frequentlyModifiedActions: [],
      problemSenders: [],
      since: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
  }
  
  /**
   * Get empty report (when no feedback)
   */
  private getEmptyReport(reportId: string): LearningReport {
    const now = new Date().toISOString();
    
    return {
      reportId,
      generatedAt: now,
      timeRange: { start: now, end: now },
      summary: {
        totalFeedback: 0,
        overallSuccessRate: 0,
        improvementAreas: ['No feedback data available yet'],
      },
      insights: [],
      patterns: {
        alwaysUrgentSenders: [],
        frequentlyModifiedCategories: [],
        failureProneSources: [],
        highConfidenceLowSuccess: [],
      },
      recommendations: [{
        area: 'Data Collection',
        action: 'Start collecting feedback data',
        impact: 'high',
        implementation: 'Record outcomes for all decisions to enable learning',
      }],
    };
  }
  
  /**
   * Start automatic insight generation
   */
  private startInsightGeneration(): void {
    this.insightTimer = setInterval(async () => {
      try {
        await this.generateInsights();
      } catch (error) {
        logger.error('[FeedbackTracker] Error generating insights', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.config.insightGenerationInterval);
    
    logger.info('[FeedbackTracker] Auto-insight generation started', {
      interval: this.config.insightGenerationInterval,
    });
  }
}

// ==================== Convenience Functions ====================

/**
 * Get feedback tracker singleton instance
 */
export function getFeedbackTracker(config?: FeedbackTrackerConfig): FeedbackTracker {
  return FeedbackTracker.getInstance(config);
}

/**
 * Record feedback
 */
export async function recordFeedback(
  reasoningResult: ReasoningResult,
  outcome: FeedbackOutcome,
  options?: {
    modifications?: Partial<ActionDecision>;
    errorMessage?: string;
    userFeedback?: string;
    reviewerId?: string;
  }
): Promise<FeedbackRecord> {
  const tracker = getFeedbackTracker();
  return tracker.recordFeedback(reasoningResult, outcome, options);
}

/**
 * Get feedback statistics
 */
export function getFeedbackStats(): FeedbackStats {
  const tracker = getFeedbackTracker();
  return tracker.getFeedbackStats();
}

/**
 * Generate learning report
 */
export async function generateLearningReport(): Promise<LearningReport> {
  const tracker = getFeedbackTracker();
  return tracker.generateLearningReport();
}

/**
 * Export feedback for retraining
 */
export async function exportForRetraining(options?: {
  minConfidence?: number;
  maxRecords?: number;
  includeRejected?: boolean;
}): Promise<FeedbackExport> {
  const tracker = getFeedbackTracker();
  return tracker.exportForRetraining(options);
}
