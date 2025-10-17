/**
 * Prompt Optimizer
 * 
 * Analyzes feedback data to continuously improve LLM prompts over time.
 * Implements A/B testing, version management, and automatic rollback on degradation.
 * 
 * Features:
 * - Identifies successful low-confidence cases to add as examples
 * - Identifies failed high-confidence cases to adjust criteria
 * - Tracks example effectiveness in prompts
 * - A/B testing with gradual rollout
 * - Automatic performance monitoring and rollback
 * - Version history with metrics
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from '../../utils/logger';
import { getFeedbackTracker, FeedbackRecord, FeedbackStats } from './feedback-tracker';
import type { Signal } from '../reasoning/decision-validator';
import type { SignalClassification } from '../classifier-agent';
import type { ActionDecision } from '../decision-agent';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Prompt type being optimized
 */
export type PromptType = 'classification' | 'decision';

/**
 * Example used in a prompt
 */
export interface PromptExample {
  /** Example ID */
  id: string;
  
  /** Input signal data */
  input: {
    subject: string;
    body: string;
    sender: string;
    context?: string;
  };
  
  /** Expected output */
  output: SignalClassification | ActionDecision;
  
  /** How effective this example has been */
  effectiveness?: {
    /** Times used in prompt */
    timesUsed: number;
    
    /** Successful outcomes when this example was in prompt */
    successCount: number;
    
    /** Failed outcomes when this example was in prompt */
    failureCount: number;
    
    /** Success rate */
    successRate: number;
    
    /** Average confidence of decisions made with this example */
    avgConfidence: number;
  };
  
  /** When this example was added */
  addedAt: string;
  
  /** Source of this example */
  source: 'manual' | 'feedback' | 'synthetic';
}

/**
 * Prompt template with examples
 */
export interface PromptTemplate {
  /** Template ID */
  id: string;
  
  /** Version number */
  version: number;
  
  /** Prompt type */
  type: PromptType;
  
  /** System instruction */
  systemPrompt: string;
  
  /** Examples to include */
  examples: PromptExample[];
  
  /** Maximum examples to include */
  maxExamples: number;
  
  /** Template for formatting examples */
  exampleFormat: string;
  
  /** Created timestamp */
  createdAt: string;
  
  /** Performance metrics */
  metrics?: PromptMetrics;
}

/**
 * Performance metrics for a prompt version
 */
export interface PromptMetrics {
  /** Total signals processed */
  totalProcessed: number;
  
  /** Successful outcomes */
  successCount: number;
  
  /** Failed outcomes */
  failureCount: number;
  
  /** Modified outcomes */
  modifiedCount: number;
  
  /** Rejected outcomes */
  rejectedCount: number;
  
  /** Success rate */
  successRate: number;
  
  /** Average confidence */
  avgConfidence: number;
  
  /** Average processing time (ms) */
  avgProcessingTime: number;
  
  /** Last updated */
  lastUpdated: string;
}

/**
 * Optimization attempt record
 */
export interface OptimizationAttempt {
  /** Attempt ID */
  id: string;
  
  /** Prompt type being optimized */
  type: PromptType;
  
  /** Previous version */
  previousVersion: number;
  
  /** New version created */
  newVersion: number;
  
  /** Changes made */
  changes: {
    /** Examples added */
    examplesAdded: PromptExample[];
    
    /** Examples removed */
    examplesRemoved: PromptExample[];
    
    /** Examples modified */
    examplesModified: Array<{ before: PromptExample; after: PromptExample }>;
    
    /** System prompt changed */
    systemPromptChanged: boolean;
  };
  
  /** Reason for optimization */
  reason: string;
  
  /** Analysis that led to optimization */
  analysis: {
    /** Feedback records analyzed */
    feedbackAnalyzed: number;
    
    /** Low-confidence successes found */
    lowConfidenceSuccesses: number;
    
    /** High-confidence failures found */
    highConfidenceFailures: number;
    
    /** Poor performing examples */
    poorExamples: string[];
  };
  
  /** Validation results */
  validation?: {
    /** Signals in validation set */
    validationSetSize: number;
    
    /** Previous version performance */
    previousPerformance: number;
    
    /** New version performance */
    newPerformance: number;
    
    /** Performance delta */
    performanceDelta: number;
    
    /** Whether new version passed validation */
    passed: boolean;
  };
  
  /** Whether optimization was applied */
  applied: boolean;
  
  /** Whether it was rolled back */
  rolledBack: boolean;
  
  /** Rollback reason if applicable */
  rollbackReason?: string;
  
  /** Timestamp */
  timestamp: string;
}

/**
 * A/B test configuration
 */
export interface ABTestConfig {
  /** Test ID */
  id: string;
  
  /** Prompt type */
  type: PromptType;
  
  /** Control version */
  controlVersion: number;
  
  /** Treatment version */
  treatmentVersion: number;
  
  /** Percentage of traffic to treatment (0-100) */
  treatmentPercentage: number;
  
  /** Start time */
  startedAt: string;
  
  /** End time */
  endedAt?: string;
  
  /** Test status */
  status: 'running' | 'completed' | 'cancelled';
  
  /** Results */
  results?: {
    /** Control metrics */
    control: PromptMetrics;
    
    /** Treatment metrics */
    treatment: PromptMetrics;
    
    /** Statistical significance */
    significant: boolean;
    
    /** Winner */
    winner: 'control' | 'treatment' | 'tie';
  };
}

/**
 * Prompt optimizer configuration
 */
export interface PromptOptimizerConfig {
  /** Directory for storing prompt versions */
  promptsDir: string;
  
  /** Directory for storing optimization logs */
  optimizationLogsDir: string;
  
  /** Minimum feedback entries to analyze */
  minFeedbackForOptimization: number;
  
  /** Low confidence threshold */
  lowConfidenceThreshold: number;
  
  /** High confidence threshold */
  highConfidenceThreshold: number;
  
  /** Minimum validation set size */
  minValidationSetSize: number;
  
  /** Minimum performance improvement required */
  minPerformanceImprovement: number;
  
  /** Initial A/B test percentage */
  initialABTestPercentage: number;
  
  /** Days to keep optimization history */
  historyRetentionDays: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: PromptOptimizerConfig = {
  promptsDir: path.join(process.cwd(), 'data', 'prompts'),
  optimizationLogsDir: path.join(process.cwd(), 'logs', 'optimization'),
  minFeedbackForOptimization: 100,
  lowConfidenceThreshold: 0.6,
  highConfidenceThreshold: 0.85,
  minValidationSetSize: 20,
  minPerformanceImprovement: 0.02, // 2% improvement required
  initialABTestPercentage: 10,
  historyRetentionDays: 90,
};

// ============================================================================
// Prompt Optimizer Class
// ============================================================================

/**
 * Manages prompt optimization and A/B testing
 */
export class PromptOptimizer {
  private config: PromptOptimizerConfig;
  private feedbackTracker = getFeedbackTracker();
  
  // Current prompt versions
  private currentPrompts: Map<PromptType, PromptTemplate> = new Map();
  
  // Active A/B tests
  private activeTests: Map<PromptType, ABTestConfig> = new Map();
  
  // Optimization history
  private optimizationHistory: OptimizationAttempt[] = [];
  
  constructor(config?: Partial<PromptOptimizerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureDirectories();
    this.loadState();
  }
  
  // ==========================================================================
  // Initialization
  // ==========================================================================
  
  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    [this.config.promptsDir, this.config.optimizationLogsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  /**
   * Load state from disk
   */
  private loadState(): void {
    // Load current prompts
    ['classification', 'decision'].forEach(type => {
      const promptPath = path.join(
        this.config.promptsDir,
        `${type}-current.json`
      );
      
      if (fs.existsSync(promptPath)) {
        const data = fs.readFileSync(promptPath, 'utf-8');
        const prompt = JSON.parse(data) as PromptTemplate;
        this.currentPrompts.set(type as PromptType, prompt);
        logger.info(`Loaded ${type} prompt version ${prompt.version}`);
      } else {
        // Initialize default prompt
        const defaultPrompt = this.createDefaultPrompt(type as PromptType);
        this.currentPrompts.set(type as PromptType, defaultPrompt);
        this.savePrompt(defaultPrompt);
      }
    });
    
    // Load active A/B tests
    const testsPath = path.join(this.config.promptsDir, 'ab-tests.json');
    if (fs.existsSync(testsPath)) {
      const data = fs.readFileSync(testsPath, 'utf-8');
      const tests = JSON.parse(data) as ABTestConfig[];
      
      tests.forEach(test => {
        if (test.status === 'running') {
          this.activeTests.set(test.type, test);
        }
      });
      
      logger.info(`Loaded ${this.activeTests.size} active A/B tests`);
    }
    
    // Load optimization history
    const historyPath = path.join(
      this.config.optimizationLogsDir,
      'optimization-history.jsonl'
    );
    
    if (fs.existsSync(historyPath)) {
      const lines = fs.readFileSync(historyPath, 'utf-8')
        .split('\n')
        .filter(line => line.trim());
      
      this.optimizationHistory = lines.map(line => JSON.parse(line));
      logger.info(`Loaded ${this.optimizationHistory.length} optimization attempts`);
    }
  }
  
  /**
   * Create default prompt template
   */
  private createDefaultPrompt(type: PromptType): PromptTemplate {
    if (type === 'classification') {
      return {
        id: `classification-v1`,
        version: 1,
        type: 'classification',
        systemPrompt: `You are an email classification assistant. Analyze emails and classify them into categories.
Categories: incident, request, issue, question, information, discussion, spam
Consider urgency, sender, content, and context when classifying.`,
        examples: [],
        maxExamples: 10,
        exampleFormat: 'Input: {subject}\nFrom: {sender}\nBody: {body}\nCategory: {category}\nUrgency: {urgency}\n',
        createdAt: new Date().toISOString(),
      };
    } else {
      return {
        id: `decision-v1`,
        version: 1,
        type: 'decision',
        systemPrompt: `You are a task automation assistant. Decide what action to take for each signal.
Actions: create_task, send_notification, update_document, schedule_meeting, ignore, escalate, clarify
Consider priority, context, and potential impact when deciding.`,
        examples: [],
        maxExamples: 10,
        exampleFormat: 'Signal: {subject}\nClassification: {category}\nAction: {action}\nReason: {reason}\n',
        createdAt: new Date().toISOString(),
      };
    }
  }
  
  /**
   * Save prompt to disk
   */
  private savePrompt(prompt: PromptTemplate): void {
    // Save as current
    const currentPath = path.join(
      this.config.promptsDir,
      `${prompt.type}-current.json`
    );
    fs.writeFileSync(currentPath, JSON.stringify(prompt, null, 2));
    
    // Save versioned copy
    const versionPath = path.join(
      this.config.promptsDir,
      `${prompt.type}-v${prompt.version}.json`
    );
    fs.writeFileSync(versionPath, JSON.stringify(prompt, null, 2));
    
    logger.info(`Saved ${prompt.type} prompt version ${prompt.version}`);
  }
  
  // ==========================================================================
  // Classification Prompt Optimization
  // ==========================================================================
  
  /**
   * Optimize classification prompt based on feedback
   */
  async optimizeClassificationPrompt(): Promise<OptimizationAttempt> {
    logger.info('Starting classification prompt optimization...');
    
    const type: PromptType = 'classification';
    const currentPrompt = this.currentPrompts.get(type)!;
    
    // Analyze recent feedback (get all, then slice)
    const feedbackRecords = this.feedbackTracker.getAllFeedback().slice(-100);
    
    if (feedbackRecords.length < this.config.minFeedbackForOptimization) {
      throw new Error(
        `Insufficient feedback for optimization: ${feedbackRecords.length} < ${this.config.minFeedbackForOptimization}`
      );
    }
    
    // Analyze feedback patterns
    const analysis = this.analyzeFeedbackForClassification(feedbackRecords);
    
    logger.info('Feedback analysis:', {
      lowConfidenceSuccesses: analysis.lowConfidenceSuccesses.length,
      highConfidenceFailures: analysis.highConfidenceFailures.length,
      poorExamples: analysis.poorExamples.length,
    });
    
    // Create new prompt version
    const newPrompt = this.createOptimizedClassificationPrompt(
      currentPrompt,
      analysis
    );
    
    // Validate new prompt
    const validation = await this.validatePrompt(currentPrompt, newPrompt);
    
    // Create optimization attempt record
    const attempt: OptimizationAttempt = {
      id: `opt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      previousVersion: currentPrompt.version,
      newVersion: newPrompt.version,
      changes: this.calculateChanges(currentPrompt, newPrompt),
      reason: 'Periodic optimization based on feedback analysis',
      analysis: {
        feedbackAnalyzed: feedbackRecords.length,
        lowConfidenceSuccesses: analysis.lowConfidenceSuccesses.length,
        highConfidenceFailures: analysis.highConfidenceFailures.length,
        poorExamples: analysis.poorExamples.map(e => e.id),
      },
      validation,
      applied: false,
      rolledBack: false,
      timestamp: new Date().toISOString(),
    };
    
    // Decide whether to apply
    if (validation.passed && validation.performanceDelta >= this.config.minPerformanceImprovement) {
      logger.info(`New prompt shows ${(validation.performanceDelta * 100).toFixed(1)}% improvement - starting A/B test`);
      
      // Save new prompt
      this.savePrompt(newPrompt);
      
      // Start A/B test
      await this.startABTest(type, currentPrompt.version, newPrompt.version);
      
      attempt.applied = true;
    } else {
      logger.warn('New prompt did not meet improvement threshold - not applying', {
        passed: validation.passed,
        delta: validation.performanceDelta,
        required: this.config.minPerformanceImprovement,
      });
    }
    
    // Record attempt
    this.recordOptimizationAttempt(attempt);
    
    return attempt;
  }
  
  /**
   * Analyze feedback for classification optimization
   */
  private analyzeFeedbackForClassification(records: FeedbackRecord[]): {
    lowConfidenceSuccesses: FeedbackRecord[];
    highConfidenceFailures: FeedbackRecord[];
    poorExamples: PromptExample[];
  } {
    const lowConfidenceSuccesses: FeedbackRecord[] = [];
    const highConfidenceFailures: FeedbackRecord[] = [];
    
    records.forEach(record => {
      // Low confidence but successful - good learning examples
      if (
        record.confidenceScore < this.config.lowConfidenceThreshold &&
        record.outcome === 'success'
      ) {
        lowConfidenceSuccesses.push(record);
      }
      
      // High confidence but failed - prompt needs adjustment
      if (
        record.confidenceScore > this.config.highConfidenceThreshold &&
        (record.outcome === 'failure' || record.outcome === 'modified')
      ) {
        highConfidenceFailures.push(record);
      }
    });
    
    // Identify poor performing examples
    const currentPrompt = this.currentPrompts.get('classification')!;
    const poorExamples = currentPrompt.examples.filter(example => {
      if (!example.effectiveness) return false;
      return example.effectiveness.successRate < 0.5 && example.effectiveness.timesUsed > 10;
    });
    
    return { lowConfidenceSuccesses, highConfidenceFailures, poorExamples };
  }
  
  /**
   * Create optimized classification prompt
   */
  private createOptimizedClassificationPrompt(
    current: PromptTemplate,
    analysis: {
      lowConfidenceSuccesses: FeedbackRecord[];
      highConfidenceFailures: FeedbackRecord[];
      poorExamples: PromptExample[];
    }
  ): PromptTemplate {
    const newExamples = [...current.examples];
    
    // Remove poor performing examples
    analysis.poorExamples.forEach(poor => {
      const index = newExamples.findIndex(e => e.id === poor.id);
      if (index !== -1) {
        newExamples.splice(index, 1);
        logger.info(`Removed poor performing example: ${poor.id}`);
      }
    });
    
    // Add best low-confidence successes as examples
    const newExamplesFromFeedback = analysis.lowConfidenceSuccesses
      .slice(0, 3) // Top 3
      .map(record => this.createExampleFromFeedback(record));
    
    newExamples.push(...newExamplesFromFeedback);
    
    // Keep only max examples (prioritize by effectiveness)
    const sortedExamples = newExamples
      .sort((a, b) => {
        const aEff = a.effectiveness?.successRate || 0;
        const bEff = b.effectiveness?.successRate || 0;
        return bEff - aEff;
      })
      .slice(0, current.maxExamples);
    
    // Adjust system prompt based on high-confidence failures
    let systemPrompt = current.systemPrompt;
    if (analysis.highConfidenceFailures.length > 3) {
      systemPrompt += '\n\nNote: Be more conservative with confidence scores. Consider edge cases and ambiguity.';
    }
    
    return {
      ...current,
      id: `${current.type}-v${current.version + 1}`,
      version: current.version + 1,
      systemPrompt,
      examples: sortedExamples,
      createdAt: new Date().toISOString(),
    };
  }
  
  // ==========================================================================
  // Decision Prompt Optimization
  // ==========================================================================
  
  /**
   * Optimize decision prompt based on feedback
   */
  async optimizeDecisionPrompt(): Promise<OptimizationAttempt> {
    logger.info('Starting decision prompt optimization...');
    
    const type: PromptType = 'decision';
    const currentPrompt = this.currentPrompts.get(type)!;
    
    // Analyze recent feedback (get all, then slice)
    const feedbackRecords = this.feedbackTracker.getAllFeedback().slice(-100);
    
    if (feedbackRecords.length < this.config.minFeedbackForOptimization) {
      throw new Error(
        `Insufficient feedback for optimization: ${feedbackRecords.length} < ${this.config.minFeedbackForOptimization}`
      );
    }
    
    // Analyze feedback patterns
    const analysis = this.analyzeFeedbackForDecision(feedbackRecords);
    
    logger.info('Feedback analysis:', {
      lowConfidenceSuccesses: analysis.lowConfidenceSuccesses.length,
      highConfidenceFailures: analysis.highConfidenceFailures.length,
      poorExamples: analysis.poorExamples.length,
    });
    
    // Create new prompt version
    const newPrompt = this.createOptimizedDecisionPrompt(
      currentPrompt,
      analysis
    );
    
    // Validate new prompt
    const validation = await this.validatePrompt(currentPrompt, newPrompt);
    
    // Create optimization attempt record
    const attempt: OptimizationAttempt = {
      id: `opt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      previousVersion: currentPrompt.version,
      newVersion: newPrompt.version,
      changes: this.calculateChanges(currentPrompt, newPrompt),
      reason: 'Periodic optimization based on feedback analysis',
      analysis: {
        feedbackAnalyzed: feedbackRecords.length,
        lowConfidenceSuccesses: analysis.lowConfidenceSuccesses.length,
        highConfidenceFailures: analysis.highConfidenceFailures.length,
        poorExamples: analysis.poorExamples.map(e => e.id),
      },
      validation,
      applied: false,
      rolledBack: false,
      timestamp: new Date().toISOString(),
    };
    
    // Decide whether to apply
    if (validation.passed && validation.performanceDelta >= this.config.minPerformanceImprovement) {
      logger.info(`New prompt shows ${(validation.performanceDelta * 100).toFixed(1)}% improvement - starting A/B test`);
      
      // Save new prompt
      this.savePrompt(newPrompt);
      
      // Start A/B test
      await this.startABTest(type, currentPrompt.version, newPrompt.version);
      
      attempt.applied = true;
    } else {
      logger.warn('New prompt did not meet improvement threshold - not applying', {
        passed: validation.passed,
        delta: validation.performanceDelta,
        required: this.config.minPerformanceImprovement,
      });
    }
    
    // Record attempt
    this.recordOptimizationAttempt(attempt);
    
    return attempt;
  }
  
  /**
   * Analyze feedback for decision optimization
   */
  private analyzeFeedbackForDecision(records: FeedbackRecord[]): {
    lowConfidenceSuccesses: FeedbackRecord[];
    highConfidenceFailures: FeedbackRecord[];
    poorExamples: PromptExample[];
  } {
    const lowConfidenceSuccesses: FeedbackRecord[] = [];
    const highConfidenceFailures: FeedbackRecord[] = [];
    
    records.forEach(record => {
      // Low confidence but successful - good learning examples
      if (
        record.confidenceScore < this.config.lowConfidenceThreshold &&
        record.outcome === 'success'
      ) {
        lowConfidenceSuccesses.push(record);
      }
      
      // High confidence but failed - prompt needs adjustment
      if (
        record.confidenceScore > this.config.highConfidenceThreshold &&
        (record.outcome === 'failure' || record.outcome === 'modified')
      ) {
        highConfidenceFailures.push(record);
      }
    });
    
    // Identify poor performing examples
    const currentPrompt = this.currentPrompts.get('decision')!;
    const poorExamples = currentPrompt.examples.filter(example => {
      if (!example.effectiveness) return false;
      return example.effectiveness.successRate < 0.5 && example.effectiveness.timesUsed > 10;
    });
    
    return { lowConfidenceSuccesses, highConfidenceFailures, poorExamples };
  }
  
  /**
   * Create optimized decision prompt
   */
  private createOptimizedDecisionPrompt(
    current: PromptTemplate,
    analysis: {
      lowConfidenceSuccesses: FeedbackRecord[];
      highConfidenceFailures: FeedbackRecord[];
      poorExamples: PromptExample[];
    }
  ): PromptTemplate {
    const newExamples = [...current.examples];
    
    // Remove poor performing examples
    analysis.poorExamples.forEach(poor => {
      const index = newExamples.findIndex(e => e.id === poor.id);
      if (index !== -1) {
        newExamples.splice(index, 1);
        logger.info(`Removed poor performing example: ${poor.id}`);
      }
    });
    
    // Add best low-confidence successes as examples
    const newExamplesFromFeedback = analysis.lowConfidenceSuccesses
      .slice(0, 3) // Top 3
      .map(record => this.createExampleFromFeedback(record));
    
    newExamples.push(...newExamplesFromFeedback);
    
    // Keep only max examples (prioritize by effectiveness)
    const sortedExamples = newExamples
      .sort((a, b) => {
        const aEff = a.effectiveness?.successRate || 0;
        const bEff = b.effectiveness?.successRate || 0;
        return bEff - aEff;
      })
      .slice(0, current.maxExamples);
    
    // Adjust system prompt based on high-confidence failures
    let systemPrompt = current.systemPrompt;
    if (analysis.highConfidenceFailures.length > 3) {
      systemPrompt += '\n\nNote: Be more cautious with high-impact decisions. Consider potential risks and alternatives.';
    }
    
    return {
      ...current,
      id: `${current.type}-v${current.version + 1}`,
      version: current.version + 1,
      systemPrompt,
      examples: sortedExamples,
      createdAt: new Date().toISOString(),
    };
  }
  
  // ==========================================================================
  // Helper Methods
  // ==========================================================================
  
  /**
   * Create prompt example from feedback record
   */
  private createExampleFromFeedback(record: FeedbackRecord): PromptExample {
    return {
      id: `example-${record.feedbackId}`,
      input: {
        subject: record.signalSubject || '',
        body: '', // Body not stored in FeedbackRecord
        sender: record.signalSender || '',
      },
      output: record.classification || record.decision,
      addedAt: new Date().toISOString(),
      source: 'feedback',
    };
  }
  
  /**
   * Calculate changes between prompts
   */
  private calculateChanges(
    oldPrompt: PromptTemplate,
    newPrompt: PromptTemplate
  ): OptimizationAttempt['changes'] {
    const oldExampleIds = new Set(oldPrompt.examples.map(e => e.id));
    const newExampleIds = new Set(newPrompt.examples.map(e => e.id));
    
    const examplesAdded = newPrompt.examples.filter(e => !oldExampleIds.has(e.id));
    const examplesRemoved = oldPrompt.examples.filter(e => !newExampleIds.has(e.id));
    
    return {
      examplesAdded,
      examplesRemoved,
      examplesModified: [],
      systemPromptChanged: oldPrompt.systemPrompt !== newPrompt.systemPrompt,
    };
  }
  
  /**
   * Validate new prompt against validation set
   */
  private async validatePrompt(
    oldPrompt: PromptTemplate,
    newPrompt: PromptTemplate
  ): Promise<NonNullable<OptimizationAttempt['validation']>> {
    // Get validation set (recent successful feedback)
    const validationSet = this.feedbackTracker
      .getAllFeedback({ outcome: 'success' })
      .slice(0, this.config.minValidationSetSize);
    
    if (validationSet.length < this.config.minValidationSetSize) {
      logger.warn(`Small validation set: ${validationSet.length} < ${this.config.minValidationSetSize}`);
    }
    
    // Simulate performance (in production, would actually run LLM)
    const previousPerformance = this.calculatePromptScore(oldPrompt);
    const newPerformance = this.calculatePromptScore(newPrompt);
    const performanceDelta = newPerformance - previousPerformance;
    
    return {
      validationSetSize: validationSet.length,
      previousPerformance,
      newPerformance,
      performanceDelta,
      passed: performanceDelta >= 0,
    };
  }
  
  /**
   * Calculate prompt score based on examples
   */
  private calculatePromptScore(prompt: PromptTemplate): number {
    if (prompt.examples.length === 0) return 0.5;
    
    const avgEffectiveness = prompt.examples.reduce((sum, example) => {
      return sum + (example.effectiveness?.successRate || 0.5);
    }, 0) / prompt.examples.length;
    
    return avgEffectiveness;
  }
  
  /**
   * Record optimization attempt
   */
  private recordOptimizationAttempt(attempt: OptimizationAttempt): void {
    this.optimizationHistory.push(attempt);
    
    // Append to JSONL file
    const logPath = path.join(
      this.config.optimizationLogsDir,
      'optimization-history.jsonl'
    );
    
    fs.appendFileSync(logPath, JSON.stringify(attempt) + '\n');
    
    logger.info('Recorded optimization attempt', {
      id: attempt.id,
      type: attempt.type,
      applied: attempt.applied,
    });
  }
  
  // ==========================================================================
  // A/B Testing
  // ==========================================================================
  
  /**
   * Start A/B test for new prompt version
   */
  async startABTest(
    type: PromptType,
    controlVersion: number,
    treatmentVersion: number
  ): Promise<ABTestConfig> {
    const test: ABTestConfig = {
      id: `abtest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      controlVersion,
      treatmentVersion,
      treatmentPercentage: this.config.initialABTestPercentage,
      startedAt: new Date().toISOString(),
      status: 'running',
    };
    
    this.activeTests.set(type, test);
    this.saveABTests();
    
    logger.info('Started A/B test', {
      id: test.id,
      type,
      control: controlVersion,
      treatment: treatmentVersion,
      percentage: test.treatmentPercentage,
    });
    
    return test;
  }
  
  /**
   * Determine which prompt version to use for a signal
   */
  selectPromptForSignal(type: PromptType): PromptTemplate {
    const activeTest = this.activeTests.get(type);
    
    if (!activeTest) {
      // No active test - use current
      return this.currentPrompts.get(type)!;
    }
    
    // A/B test active - randomly assign
    const random = Math.random() * 100;
    
    if (random < activeTest.treatmentPercentage) {
      // Use treatment version
      const treatmentPath = path.join(
        this.config.promptsDir,
        `${type}-v${activeTest.treatmentVersion}.json`
      );
      
      if (fs.existsSync(treatmentPath)) {
        const data = fs.readFileSync(treatmentPath, 'utf-8');
        return JSON.parse(data) as PromptTemplate;
      }
    }
    
    // Use control version (current)
    return this.currentPrompts.get(type)!;
  }
  
  /**
   * Evaluate A/B test results
   */
  async evaluateABTest(type: PromptType): Promise<void> {
    const test = this.activeTests.get(type);
    
    if (!test) {
      throw new Error(`No active A/B test for ${type}`);
    }
    
    logger.info('Evaluating A/B test', { id: test.id, type });
    
    // Get feedback for each version
    const allFeedback = this.feedbackTracker.getAllFeedback();
    
    // Note: promptVersion would need to be added to FeedbackRecord to track which prompt was used
    // For now, we'll use timestamp-based filtering
    const controlFeedback = allFeedback.filter(
      f => f.timestamp >= test.startedAt
    ).slice(0, Math.floor(allFeedback.length * (100 - test.treatmentPercentage) / 100));
    
    const treatmentFeedback = allFeedback.filter(
      f => f.timestamp >= test.startedAt
    ).slice(-Math.floor(allFeedback.length * test.treatmentPercentage / 100));
    
    if (controlFeedback.length < 50 || treatmentFeedback.length < 50) {
      logger.warn('Insufficient data for A/B test evaluation', {
        control: controlFeedback.length,
        treatment: treatmentFeedback.length,
      });
      return;
    }
    
    // Calculate metrics
    const controlMetrics = this.calculateMetrics(controlFeedback);
    const treatmentMetrics = this.calculateMetrics(treatmentFeedback);
    
    // Determine winner
    const winner = treatmentMetrics.successRate > controlMetrics.successRate + 0.02
      ? 'treatment'
      : controlMetrics.successRate > treatmentMetrics.successRate + 0.02
      ? 'control'
      : 'tie';
    
    test.results = {
      control: controlMetrics,
      treatment: treatmentMetrics,
      significant: Math.abs(controlMetrics.successRate - treatmentMetrics.successRate) > 0.02,
      winner,
    };
    
    test.status = 'completed';
    test.endedAt = new Date().toISOString();
    
    logger.info('A/B test completed', {
      id: test.id,
      winner,
      controlRate: controlMetrics.successRate,
      treatmentRate: treatmentMetrics.successRate,
    });
    
    // Apply winner
    if (winner === 'treatment') {
      await this.promotePromptVersion(type, test.treatmentVersion);
    } else if (winner === 'control') {
      await this.rollbackPromptVersion(type, test.treatmentVersion, 'A/B test showed no improvement');
    }
    
    this.activeTests.delete(type);
    this.saveABTests();
  }
  
  /**
   * Calculate metrics from feedback records
   */
  private calculateMetrics(records: FeedbackRecord[]): PromptMetrics {
    const total = records.length;
    const successCount = records.filter(r => r.outcome === 'success').length;
    const failureCount = records.filter(r => r.outcome === 'failure').length;
    const modifiedCount = records.filter(r => r.outcome === 'modified').length;
    const rejectedCount = records.filter(r => r.outcome === 'rejected').length;
    
    const avgConfidence = records.reduce((sum, r) => sum + r.confidenceScore, 0) / total;
    
    return {
      totalProcessed: total,
      successCount,
      failureCount,
      modifiedCount,
      rejectedCount,
      successRate: successCount / total,
      avgConfidence,
      avgProcessingTime: 0, // Would track in production
      lastUpdated: new Date().toISOString(),
    };
  }
  
  /**
   * Promote treatment version to current
   */
  private async promotePromptVersion(type: PromptType, version: number): Promise<void> {
    const versionPath = path.join(
      this.config.promptsDir,
      `${type}-v${version}.json`
    );
    
    if (!fs.existsSync(versionPath)) {
      throw new Error(`Prompt version ${version} not found`);
    }
    
    const data = fs.readFileSync(versionPath, 'utf-8');
    const prompt = JSON.parse(data) as PromptTemplate;
    
    this.currentPrompts.set(type, prompt);
    this.savePrompt(prompt);
    
    logger.info(`Promoted ${type} prompt version ${version} to current`);
  }
  
  /**
   * Rollback prompt version
   */
  private async rollbackPromptVersion(
    type: PromptType,
    version: number,
    reason: string
  ): Promise<void> {
    logger.warn(`Rolling back ${type} prompt version ${version}`, { reason });
    
    // Find corresponding optimization attempt
    const attempt = this.optimizationHistory.find(
      a => a.type === type && a.newVersion === version
    );
    
    if (attempt) {
      attempt.rolledBack = true;
      attempt.rollbackReason = reason;
      
      // Re-save updated attempt
      const logPath = path.join(
        this.config.optimizationLogsDir,
        'optimization-history.jsonl'
      );
      
      const allLines = this.optimizationHistory.map(a => JSON.stringify(a));
      fs.writeFileSync(logPath, allLines.join('\n') + '\n');
    }
  }
  
  /**
   * Save A/B tests to disk
   */
  private saveABTests(): void {
    const tests = Array.from(this.activeTests.values());
    const testsPath = path.join(this.config.promptsDir, 'ab-tests.json');
    fs.writeFileSync(testsPath, JSON.stringify(tests, null, 2));
  }
  
  // ==========================================================================
  // Public API
  // ==========================================================================
  
  /**
   * Get current prompt version for a type
   */
  getCurrentPromptVersion(type: PromptType): PromptTemplate {
    const prompt = this.currentPrompts.get(type);
    if (!prompt) {
      throw new Error(`No prompt found for type: ${type}`);
    }
    return prompt;
  }
  
  /**
   * Get optimization history
   */
  getOptimizationHistory(type?: PromptType): OptimizationAttempt[] {
    if (type) {
      return this.optimizationHistory.filter(a => a.type === type);
    }
    return this.optimizationHistory;
  }
  
  /**
   * Get active A/B tests
   */
  getActiveABTests(): ABTestConfig[] {
    return Array.from(this.activeTests.values());
  }
  
  /**
   * Get prompt performance summary
   */
  getPromptPerformanceSummary(type: PromptType): {
    currentVersion: number;
    totalOptimizations: number;
    successfulOptimizations: number;
    activeABTest: boolean;
    metrics?: PromptMetrics;
  } {
    const currentPrompt = this.currentPrompts.get(type)!;
    const history = this.getOptimizationHistory(type);
    
    return {
      currentVersion: currentPrompt.version,
      totalOptimizations: history.length,
      successfulOptimizations: history.filter(h => h.applied && !h.rolledBack).length,
      activeABTest: this.activeTests.has(type),
      metrics: currentPrompt.metrics,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let optimizerInstance: PromptOptimizer | null = null;

/**
 * Get singleton prompt optimizer instance
 */
export function getPromptOptimizer(config?: Partial<PromptOptimizerConfig>): PromptOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new PromptOptimizer(config);
  }
  return optimizerInstance;
}

/**
 * Get current prompt version (convenience function)
 */
export function getCurrentPromptVersion(type: PromptType): PromptTemplate {
  return getPromptOptimizer().getCurrentPromptVersion(type);
}

/**
 * Optimize classification prompt (convenience function)
 */
export async function optimizeClassificationPrompt(): Promise<OptimizationAttempt> {
  return getPromptOptimizer().optimizeClassificationPrompt();
}

/**
 * Optimize decision prompt (convenience function)
 */
export async function optimizeDecisionPrompt(): Promise<OptimizationAttempt> {
  return getPromptOptimizer().optimizeDecisionPrompt();
}
