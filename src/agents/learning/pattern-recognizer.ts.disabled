/**
 * Pattern Recognizer
 * 
 * Identifies recurring patterns in signals to improve classification accuracy.
 * Learns from feedback history to recognize urgency keywords, sender patterns,
 * time-based patterns, and category-action associations.
 * 
 * Features:
 * - Urgency keyword detection with confidence scores
 * - Sender behavior patterns
 * - Time-based urgency patterns
 * - Category-action mappings
 * - Anomaly detection
 * - Daily pattern updates
 * - Pattern persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from '../../utils/logger';
import { getFeedbackTracker, FeedbackRecord } from './feedback-tracker';
import type { Signal } from '../reasoning/decision-validator';
import type { SignalClassification } from '../classifier-agent';
import type { ActionDecision } from '../decision-agent';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Urgency keyword with learned boost
 */
export interface UrgencyKeyword {
  keyword: string;
  urgencyBoost: number;        // -1.0 to 1.0 adjustment
  occurrences: number;
  successRate: number;
  lastSeen: string;
}

/**
 * Sender behavior pattern
 */
export interface SenderPattern {
  sender: string;
  totalSignals: number;
  avgUrgency: number;          // 0-4 (low to critical)
  commonCategory: string;
  categoryDistribution: Record<string, number>;
  actionPreference: string;
  successRate: number;
  lastActivity: string;
}

/**
 * Time-based pattern
 */
export interface TimePattern {
  patternId: string;
  day: string;                 // 'monday', 'friday', 'weekend'
  hourRange: { start: number; end: number };
  typicalUrgency: string;
  category?: string;
  sender?: string;
  occurrences: number;
  confidence: number;
}

/**
 * Category-action mapping
 */
export interface CategoryActionPattern {
  category: string;
  preferredAction: string;
  actionDistribution: Record<string, number>;
  successRate: number;
  totalOccurrences: number;
  platformPreference?: string;
}

/**
 * Subject line pattern
 */
export interface SubjectPattern {
  pattern: string;             // Regex pattern
  category: string;
  urgency: string;
  keywords: string[];
  occurrences: number;
  successRate: number;
}

/**
 * Recognized patterns collection
 */
export interface RecognizedPatterns {
  urgencyKeywords: Map<string, UrgencyKeyword>;
  senderPatterns: Map<string, SenderPattern>;
  timePatterns: Map<string, TimePattern>;
  categoryActions: Map<string, CategoryActionPattern>;
  subjectPatterns: SubjectPattern[];
  lastUpdated: string;
  totalSignalsAnalyzed: number;
}

/**
 * Pattern application result
 */
export interface PatternApplicationResult {
  originalClassification: SignalClassification;
  adjustedClassification?: SignalClassification;
  suggestedAction?: string;
  adjustments: {
    urgencyAdjusted: boolean;
    urgencyBoost?: number;
    categoryAdjusted: boolean;
    reasoningAdded: string[];
  };
  matchedPatterns: {
    urgencyKeywords: string[];
    senderPattern?: SenderPattern;
    timePattern?: TimePattern;
    categoryAction?: CategoryActionPattern;
  };
  anomalies: Array<{
    type: 'urgency' | 'category' | 'action' | 'timing';
    description: string;
    confidence: number;
  }>;
  confidence: number;
}

/**
 * Pattern recognizer configuration
 */
export interface PatternRecognizerConfig {
  patternsFilePath: string;
  minOccurrencesForPattern: number;
  minSuccessRateForPattern: number;
  urgencyBoostThreshold: number;
  anomalyThreshold: number;
  updateInterval: number;        // milliseconds
  enableAutoUpdate: boolean;
  maxPatternsPerType: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: PatternRecognizerConfig = {
  patternsFilePath: path.join(process.cwd(), 'cache', 'learned-patterns.json'),
  minOccurrencesForPattern: 5,
  minSuccessRateForPattern: 0.7,
  urgencyBoostThreshold: 0.3,
  anomalyThreshold: 0.7,
  updateInterval: 24 * 60 * 60 * 1000,  // 24 hours
  enableAutoUpdate: true,
  maxPatternsPerType: 100,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map urgency string to numeric value
 */
function urgencyToNumber(urgency: string): number {
  const map: Record<string, number> = {
    'low': 0,
    'medium': 1,
    'high': 2,
    'critical': 3,
  };
  return map[urgency.toLowerCase()] || 1;
}

/**
 * Map numeric urgency to string
 */
function numberToUrgency(num: number): string {
  if (num >= 2.5) return 'critical';
  if (num >= 1.5) return 'high';
  if (num >= 0.5) return 'medium';
  return 'low';
}

/**
 * Get day of week from date
 */
function getDayOfWeek(date: Date): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[date.getDay()];
}

/**
 * Check if weekend
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Extract keywords from text
 */
function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3);
  
  return Array.from(new Set(words));
}

/**
 * Calculate pattern confidence
 */
function calculateConfidence(occurrences: number, successRate: number): number {
  const occurrenceScore = Math.min(occurrences / 20, 1.0);
  return (occurrenceScore * 0.3 + successRate * 0.7);
}

// ============================================================================
// Pattern Recognizer Class
// ============================================================================

/**
 * Pattern Recognizer - Learns from feedback to improve classification
 */
export class PatternRecognizer {
  private static instance: PatternRecognizer;
  private config: PatternRecognizerConfig;
  private feedbackTracker = getFeedbackTracker();
  private patterns: RecognizedPatterns;
  private updateTimer?: NodeJS.Timeout;
  
  private constructor(config?: Partial<PatternRecognizerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Initialize patterns
    this.patterns = {
      urgencyKeywords: new Map(),
      senderPatterns: new Map(),
      timePatterns: new Map(),
      categoryActions: new Map(),
      subjectPatterns: [],
      lastUpdated: new Date().toISOString(),
      totalSignalsAnalyzed: 0,
    };
    
    // Load existing patterns
    this.loadPatterns();
    
    // Start auto-update timer
    if (this.config.enableAutoUpdate) {
      this.startAutoUpdate();
    }
    
    logger.info('[PatternRecognizer] Initialized', {
      patternsLoaded: this.getPatternsCount(),
      autoUpdate: this.config.enableAutoUpdate,
    });
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<PatternRecognizerConfig>): PatternRecognizer {
    if (!PatternRecognizer.instance) {
      PatternRecognizer.instance = new PatternRecognizer(config);
    }
    return PatternRecognizer.instance;
  }
  
  // ==========================================================================
  // Initialization
  // ==========================================================================
  
  /**
   * Load patterns from disk
   */
  private loadPatterns(): void {
    try {
      if (fs.existsSync(this.config.patternsFilePath)) {
        const data = fs.readFileSync(this.config.patternsFilePath, 'utf-8');
        const loaded = JSON.parse(data);
        
        // Convert maps from JSON
        this.patterns = {
          urgencyKeywords: new Map(Object.entries(loaded.urgencyKeywords || {})),
          senderPatterns: new Map(Object.entries(loaded.senderPatterns || {})),
          timePatterns: new Map(Object.entries(loaded.timePatterns || {})),
          categoryActions: new Map(Object.entries(loaded.categoryActions || {})),
          subjectPatterns: loaded.subjectPatterns || [],
          lastUpdated: loaded.lastUpdated || new Date().toISOString(),
          totalSignalsAnalyzed: loaded.totalSignalsAnalyzed || 0,
        };
        
        logger.info('[PatternRecognizer] Patterns loaded', {
          urgencyKeywords: this.patterns.urgencyKeywords.size,
          senderPatterns: this.patterns.senderPatterns.size,
          timePatterns: this.patterns.timePatterns.size,
          categoryActions: this.patterns.categoryActions.size,
          lastUpdated: this.patterns.lastUpdated,
        });
      }
    } catch (error: any) {
      logger.error('[PatternRecognizer] Failed to load patterns', {
        error: error.message,
      });
    }
  }
  
  /**
   * Save patterns to disk
   */
  private savePatterns(): void {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.config.patternsFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Convert maps to objects for JSON
      const toSave = {
        urgencyKeywords: Object.fromEntries(this.patterns.urgencyKeywords),
        senderPatterns: Object.fromEntries(this.patterns.senderPatterns),
        timePatterns: Object.fromEntries(this.patterns.timePatterns),
        categoryActions: Object.fromEntries(this.patterns.categoryActions),
        subjectPatterns: this.patterns.subjectPatterns,
        lastUpdated: this.patterns.lastUpdated,
        totalSignalsAnalyzed: this.patterns.totalSignalsAnalyzed,
      };
      
      fs.writeFileSync(
        this.config.patternsFilePath,
        JSON.stringify(toSave, null, 2)
      );
      
      logger.info('[PatternRecognizer] Patterns saved', {
        path: this.config.patternsFilePath,
      });
    } catch (error: any) {
      logger.error('[PatternRecognizer] Failed to save patterns', {
        error: error.message,
      });
    }
  }
  
  /**
   * Start auto-update timer
   */
  private startAutoUpdate(): void {
    this.updateTimer = setInterval(() => {
      logger.info('[PatternRecognizer] Auto-update triggered');
      this.updatePatterns().catch(error => {
        logger.error('[PatternRecognizer] Auto-update failed', {
          error: error.message,
        });
      });
    }, this.config.updateInterval);
  }
  
  /**
   * Stop auto-update timer
   */
  stopAutoUpdate(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
      logger.info('[PatternRecognizer] Auto-update stopped');
    }
  }
  
  // ==========================================================================
  // Pattern Recognition
  // ==========================================================================
  
  /**
   * Recognize patterns from feedback history
   */
  async recognizePatterns(feedbackHistory?: FeedbackRecord[]): Promise<RecognizedPatterns> {
    logger.info('[PatternRecognizer] Starting pattern recognition...');
    
    // Get feedback data
    const feedback = feedbackHistory || this.feedbackTracker.getAllFeedback();
    
    if (feedback.length === 0) {
      logger.warn('[PatternRecognizer] No feedback data available');
      return this.patterns;
    }
    
    // Only analyze successful feedback
    const successfulFeedback = feedback.filter(f => 
      f.outcome === 'success' || f.outcome === 'modified'
    );
    
    logger.info('[PatternRecognizer] Analyzing feedback', {
      total: feedback.length,
      successful: successfulFeedback.length,
    });
    
    // Recognize different pattern types
    await this.recognizeUrgencyKeywords(successfulFeedback);
    await this.recognizeSenderPatterns(successfulFeedback);
    await this.recognizeTimePatterns(successfulFeedback);
    await this.recognizeCategoryActions(successfulFeedback);
    await this.recognizeSubjectPatterns(successfulFeedback);
    
    // Update metadata
    this.patterns.lastUpdated = new Date().toISOString();
    this.patterns.totalSignalsAnalyzed = feedback.length;
    
    // Save to disk
    this.savePatterns();
    
    logger.info('[PatternRecognizer] Pattern recognition complete', {
      urgencyKeywords: this.patterns.urgencyKeywords.size,
      senderPatterns: this.patterns.senderPatterns.size,
      timePatterns: this.patterns.timePatterns.size,
      categoryActions: this.patterns.categoryActions.size,
      subjectPatterns: this.patterns.subjectPatterns.length,
    });
    
    return this.patterns;
  }
  
  /**
   * Recognize urgency keywords
   */
  private async recognizeUrgencyKeywords(feedback: FeedbackRecord[]): Promise<void> {
    const keywordStats = new Map<string, {
      urgencySum: number;
      count: number;
      successes: number;
      lastSeen: string;
    }>();
    
    feedback.forEach(record => {
      // Extract keywords from subject and classification
      const subject = record.signalSubject || '';
      const keywords = extractKeywords(subject);
      const urgencyValue = urgencyToNumber(record.classification.urgency);
      const isSuccess = record.outcome === 'success';
      
      keywords.forEach(keyword => {
        const existing = keywordStats.get(keyword) || {
          urgencySum: 0,
          count: 0,
          successes: 0,
          lastSeen: record.timestamp,
        };
        
        existing.urgencySum += urgencyValue;
        existing.count++;
        if (isSuccess) existing.successes++;
        existing.lastSeen = record.timestamp;
        
        keywordStats.set(keyword, existing);
      });
    });
    
    // Convert to urgency keywords with boost calculation
    const baselineUrgency = 1.0; // medium
    
    keywordStats.forEach((stats, keyword) => {
      if (stats.count >= this.config.minOccurrencesForPattern) {
        const avgUrgency = stats.urgencySum / stats.count;
        const urgencyBoost = avgUrgency - baselineUrgency;
        const successRate = stats.successes / stats.count;
        
        if (successRate >= this.config.minSuccessRateForPattern) {
          this.patterns.urgencyKeywords.set(keyword, {
            keyword,
            urgencyBoost,
            occurrences: stats.count,
            successRate,
            lastSeen: stats.lastSeen,
          });
        }
      }
    });
    
    // Keep only top keywords
    const sortedKeywords = Array.from(this.patterns.urgencyKeywords.values())
      .sort((a, b) => Math.abs(b.urgencyBoost) - Math.abs(a.urgencyBoost))
      .slice(0, this.config.maxPatternsPerType);
    
    this.patterns.urgencyKeywords = new Map(
      sortedKeywords.map(k => [k.keyword, k])
    );
    
    logger.info('[PatternRecognizer] Urgency keywords recognized', {
      total: this.patterns.urgencyKeywords.size,
    });
  }
  
  /**
   * Recognize sender patterns
   */
  private async recognizeSenderPatterns(feedback: FeedbackRecord[]): Promise<void> {
    const senderStats = new Map<string, {
      urgencySum: number;
      categories: Map<string, number>;
      actions: Map<string, number>;
      successes: number;
      total: number;
      lastActivity: string;
    }>();
    
    feedback.forEach(record => {
      const sender = record.signalSender || 'unknown';
      const urgencyValue = urgencyToNumber(record.classification.urgency);
      const category = record.classification.category;
      const action = record.decision.action;
      const isSuccess = record.outcome === 'success';
      
      const existing = senderStats.get(sender) || {
        urgencySum: 0,
        categories: new Map(),
        actions: new Map(),
        successes: 0,
        total: 0,
        lastActivity: record.timestamp,
      };
      
      existing.urgencySum += urgencyValue;
      existing.categories.set(category, (existing.categories.get(category) || 0) + 1);
      existing.actions.set(action, (existing.actions.get(action) || 0) + 1);
      if (isSuccess) existing.successes++;
      existing.total++;
      existing.lastActivity = record.timestamp;
      
      senderStats.set(sender, existing);
    });
    
    // Convert to sender patterns
    senderStats.forEach((stats, sender) => {
      if (stats.total >= this.config.minOccurrencesForPattern) {
        const avgUrgency = stats.urgencySum / stats.total;
        const successRate = stats.successes / stats.total;
        
        // Find most common category
        let commonCategory = 'information';
        let maxCount = 0;
        stats.categories.forEach((count, category) => {
          if (count > maxCount) {
            maxCount = count;
            commonCategory = category;
          }
        });
        
        // Find preferred action
        let preferredAction = 'ignore';
        maxCount = 0;
        stats.actions.forEach((count, action) => {
          if (count > maxCount) {
            maxCount = count;
            preferredAction = action;
          }
        });
        
        if (successRate >= this.config.minSuccessRateForPattern) {
          this.patterns.senderPatterns.set(sender, {
            sender,
            totalSignals: stats.total,
            avgUrgency,
            commonCategory,
            categoryDistribution: Object.fromEntries(stats.categories),
            actionPreference: preferredAction,
            successRate,
            lastActivity: stats.lastActivity,
          });
        }
      }
    });
    
    logger.info('[PatternRecognizer] Sender patterns recognized', {
      total: this.patterns.senderPatterns.size,
    });
  }
  
  /**
   * Recognize time patterns
   */
  private async recognizeTimePatterns(feedback: FeedbackRecord[]): Promise<void> {
    const timeStats = new Map<string, {
      urgencySum: number;
      categories: Map<string, number>;
      senders: Map<string, number>;
      count: number;
    }>();
    
    feedback.forEach(record => {
      const date = new Date(record.timestamp);
      const day = getDayOfWeek(date);
      const hour = date.getHours();
      const urgencyValue = urgencyToNumber(record.classification.urgency);
      const category = record.classification.category;
      const sender = record.signalSender || 'unknown';
      
      // Create pattern keys
      const patterns = [
        `${day}`,
        `${day}-${Math.floor(hour / 6) * 6}h`, // 0-5, 6-11, 12-17, 18-23
        isWeekend(date) ? 'weekend' : 'weekday',
      ];
      
      patterns.forEach(pattern => {
        const existing = timeStats.get(pattern) || {
          urgencySum: 0,
          categories: new Map(),
          senders: new Map(),
          count: 0,
        };
        
        existing.urgencySum += urgencyValue;
        existing.categories.set(category, (existing.categories.get(category) || 0) + 1);
        existing.senders.set(sender, (existing.senders.get(sender) || 0) + 1);
        existing.count++;
        
        timeStats.set(pattern, existing);
      });
    });
    
    // Convert to time patterns
    const patterns: TimePattern[] = [];
    
    timeStats.forEach((stats, patternKey) => {
      if (stats.count >= this.config.minOccurrencesForPattern) {
        const avgUrgency = stats.urgencySum / stats.count;
        const typicalUrgency = numberToUrgency(avgUrgency);
        
        // Find most common category
        let commonCategory: string | undefined;
        let maxCount = 0;
        stats.categories.forEach((count, category) => {
          if (count > maxCount && count / stats.count > 0.5) {
            maxCount = count;
            commonCategory = category;
          }
        });
        
        // Parse pattern key
        const parts = patternKey.split('-');
        const day = parts[0];
        const hourMatch = parts[1]?.match(/(\d+)h/);
        const hourStart = hourMatch ? parseInt(hourMatch[1]) : 0;
        
        const confidence = calculateConfidence(stats.count, 0.8);
        
        patterns.push({
          patternId: `time-${patternKey}`,
          day,
          hourRange: { start: hourStart, end: hourStart + 6 },
          typicalUrgency,
          category: commonCategory,
          occurrences: stats.count,
          confidence,
        });
      }
    });
    
    // Store top patterns
    this.patterns.timePatterns = new Map(
      patterns
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, this.config.maxPatternsPerType)
        .map(p => [p.patternId, p])
    );
    
    logger.info('[PatternRecognizer] Time patterns recognized', {
      total: this.patterns.timePatterns.size,
    });
  }
  
  /**
   * Recognize category-action mappings
   */
  private async recognizeCategoryActions(feedback: FeedbackRecord[]): Promise<void> {
    const categoryStats = new Map<string, {
      actions: Map<string, number>;
      platforms: Map<string, number>;
      successes: number;
      total: number;
    }>();
    
    feedback.forEach(record => {
      const category = record.classification.category;
      const action = record.decision.action;
      const platform = record.decision.actionParams?.platform || 'unknown';
      const isSuccess = record.outcome === 'success';
      
      const existing = categoryStats.get(category) || {
        actions: new Map(),
        platforms: new Map(),
        successes: 0,
        total: 0,
      };
      
      existing.actions.set(action, (existing.actions.get(action) || 0) + 1);
      existing.platforms.set(platform, (existing.platforms.get(platform) || 0) + 1);
      if (isSuccess) existing.successes++;
      existing.total++;
      
      categoryStats.set(category, existing);
    });
    
    // Convert to category-action patterns
    categoryStats.forEach((stats, category) => {
      if (stats.total >= this.config.minOccurrencesForPattern) {
        // Find preferred action
        let preferredAction = 'ignore';
        let maxCount = 0;
        stats.actions.forEach((count, action) => {
          if (count > maxCount) {
            maxCount = count;
            preferredAction = action;
          }
        });
        
        // Find preferred platform
        let preferredPlatform: string | undefined;
        maxCount = 0;
        stats.platforms.forEach((count, platform) => {
          if (count > maxCount && platform !== 'unknown') {
            maxCount = count;
            preferredPlatform = platform;
          }
        });
        
        const successRate = stats.successes / stats.total;
        
        if (successRate >= this.config.minSuccessRateForPattern) {
          this.patterns.categoryActions.set(category, {
            category,
            preferredAction,
            actionDistribution: Object.fromEntries(stats.actions),
            successRate,
            totalOccurrences: stats.total,
            platformPreference: preferredPlatform,
          });
        }
      }
    });
    
    logger.info('[PatternRecognizer] Category-action patterns recognized', {
      total: this.patterns.categoryActions.size,
    });
  }
  
  /**
   * Recognize subject line patterns
   */
  private async recognizeSubjectPatterns(feedback: FeedbackRecord[]): Promise<void> {
    const subjectStats = new Map<string, {
      categories: Map<string, number>;
      urgencies: Map<string, number>;
      successes: number;
      total: number;
      keywords: Set<string>;
    }>();
    
    feedback.forEach(record => {
      const subject = record.signalSubject?.toLowerCase() || '';
      if (!subject) return;
      
      const category = record.classification.category;
      const urgency = record.classification.urgency;
      const isSuccess = record.outcome === 'success';
      const keywords = extractKeywords(subject);
      
      // Create pattern from common prefixes
      const patterns = [
        subject.match(/^(re:|fwd?:|meeting:|task:)/i)?.[0] || '',
        subject.includes('urgent') ? 'urgent' : '',
        subject.includes('asap') ? 'asap' : '',
      ].filter(p => p);
      
      patterns.forEach(pattern => {
        const existing = subjectStats.get(pattern) || {
          categories: new Map(),
          urgencies: new Map(),
          successes: 0,
          total: 0,
          keywords: new Set(),
        };
        
        existing.categories.set(category, (existing.categories.get(category) || 0) + 1);
        existing.urgencies.set(urgency, (existing.urgencies.get(urgency) || 0) + 1);
        if (isSuccess) existing.successes++;
        existing.total++;
        keywords.forEach(k => existing.keywords.add(k));
        
        subjectStats.set(pattern, existing);
      });
    });
    
    // Convert to subject patterns
    const patterns: SubjectPattern[] = [];
    
    subjectStats.forEach((stats, pattern) => {
      if (stats.total >= this.config.minOccurrencesForPattern) {
        // Find most common category
        let commonCategory = 'information';
        let maxCount = 0;
        stats.categories.forEach((count, category) => {
          if (count > maxCount) {
            maxCount = count;
            commonCategory = category;
          }
        });
        
        // Find most common urgency
        let commonUrgency = 'medium';
        maxCount = 0;
        stats.urgencies.forEach((count, urgency) => {
          if (count > maxCount) {
            maxCount = count;
            commonUrgency = urgency;
          }
        });
        
        const successRate = stats.successes / stats.total;
        
        if (successRate >= this.config.minSuccessRateForPattern) {
          patterns.push({
            pattern,
            category: commonCategory,
            urgency: commonUrgency,
            keywords: Array.from(stats.keywords),
            occurrences: stats.total,
            successRate,
          });
        }
      }
    });
    
    this.patterns.subjectPatterns = patterns
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, this.config.maxPatternsPerType);
    
    logger.info('[PatternRecognizer] Subject patterns recognized', {
      total: this.patterns.subjectPatterns.length,
    });
  }
  
  // ==========================================================================
  // Pattern Application
  // ==========================================================================
  
  /**
   * Apply learned patterns to a signal
   */
  applyPatterns(
    signal: Signal,
    classification: SignalClassification,
    patterns?: RecognizedPatterns
  ): PatternApplicationResult {
    const patternsToUse = patterns || this.patterns;
    
    const result: PatternApplicationResult = {
      originalClassification: classification,
      adjustments: {
        urgencyAdjusted: false,
        categoryAdjusted: false,
        reasoningAdded: [],
      },
      matchedPatterns: {
        urgencyKeywords: [],
      },
      anomalies: [],
      confidence: classification.confidence,
    };
    
    let adjustedUrgency = urgencyToNumber(classification.urgency);
    let adjustedCategory = classification.category;
    
    // 1. Apply urgency keyword patterns
    const subject = signal.subject?.toLowerCase() || '';
    const keywords = extractKeywords(subject);
    
    keywords.forEach(keyword => {
      const pattern = patternsToUse.urgencyKeywords.get(keyword);
      if (pattern && Math.abs(pattern.urgencyBoost) > this.config.urgencyBoostThreshold) {
        adjustedUrgency += pattern.urgencyBoost;
        result.matchedPatterns.urgencyKeywords.push(keyword);
        result.adjustments.reasoningAdded.push(
          `Keyword "${keyword}" typically indicates ${pattern.urgencyBoost > 0 ? 'higher' : 'lower'} urgency`
        );
      }
    });
    
    if (result.matchedPatterns.urgencyKeywords.length > 0) {
      result.adjustments.urgencyAdjusted = true;
      result.adjustments.urgencyBoost = adjustedUrgency - urgencyToNumber(classification.urgency);
    }
    
    // 2. Apply sender patterns
    if (signal.sender) {
      const senderPattern = patternsToUse.senderPatterns.get(signal.sender);
      if (senderPattern) {
        result.matchedPatterns.senderPattern = senderPattern;
        
        // Check if current classification matches sender pattern
        const categoryMatch = senderPattern.commonCategory === classification.category;
        const urgencyDiff = Math.abs(senderPattern.avgUrgency - adjustedUrgency);
        
        if (!categoryMatch && senderPattern.totalSignals > 10) {
          result.anomalies.push({
            type: 'category',
            description: `Sender "${signal.sender}" typically sends "${senderPattern.commonCategory}" but this is "${classification.category}"`,
            confidence: senderPattern.successRate,
          });
        }
        
        if (urgencyDiff > 1.5) {
          result.anomalies.push({
            type: 'urgency',
            description: `Sender urgency pattern mismatch: expected ${numberToUrgency(senderPattern.avgUrgency)}, got ${classification.urgency}`,
            confidence: senderPattern.successRate,
          });
        }
        
        result.adjustments.reasoningAdded.push(
          `Sender typically sends ${senderPattern.commonCategory} messages`
        );
      }
    }
    
    // 3. Apply time patterns
    const signalDate = new Date(signal.timestamp);
    const day = getDayOfWeek(signalDate);
    const hour = signalDate.getHours();
    
    const timePatternKey = `time-${day}`;
    const timePattern = patternsToUse.timePatterns.get(timePatternKey);
    
    if (timePattern) {
      result.matchedPatterns.timePattern = timePattern;
      
      const expectedUrgency = urgencyToNumber(timePattern.typicalUrgency);
      const urgencyDiff = Math.abs(expectedUrgency - adjustedUrgency);
      
      if (urgencyDiff > 1.5 && timePattern.confidence > this.config.anomalyThreshold) {
        result.anomalies.push({
          type: 'timing',
          description: `Signals on ${day} typically have ${timePattern.typicalUrgency} urgency`,
          confidence: timePattern.confidence,
        });
      }
      
      result.adjustments.reasoningAdded.push(
        `Time pattern: ${day} signals typically ${timePattern.typicalUrgency} urgency`
      );
    }
    
    // 4. Apply category-action patterns
    const categoryAction = patternsToUse.categoryActions.get(classification.category);
    if (categoryAction) {
      result.matchedPatterns.categoryAction = categoryAction;
      result.suggestedAction = categoryAction.preferredAction;
      
      result.adjustments.reasoningAdded.push(
        `Category "${classification.category}" typically uses action "${categoryAction.preferredAction}"`
      );
    }
    
    // 5. Create adjusted classification if changes were made
    if (result.adjustments.urgencyAdjusted || result.adjustments.categoryAdjusted) {
      const newUrgency = numberToUrgency(Math.max(0, Math.min(3, adjustedUrgency)));
      
      result.adjustedClassification = {
        ...classification,
        urgency: newUrgency as any,
        category: adjustedCategory as any,
        reasoning: [
          classification.reasoning,
          ...result.adjustments.reasoningAdded,
        ].join('. '),
        confidence: classification.confidence * 1.1, // Slight confidence boost
      };
    }
    
    // 6. Calculate overall confidence
    const patternMatches = [
      result.matchedPatterns.urgencyKeywords.length > 0,
      !!result.matchedPatterns.senderPattern,
      !!result.matchedPatterns.timePattern,
      !!result.matchedPatterns.categoryAction,
    ].filter(Boolean).length;
    
    result.confidence = Math.min(1.0, classification.confidence + (patternMatches * 0.05));
    
    return result;
  }
  
  // ==========================================================================
  // Pattern Updates
  // ==========================================================================
  
  /**
   * Update patterns based on new feedback
   */
  async updatePatterns(): Promise<void> {
    logger.info('[PatternRecognizer] Updating patterns...');
    
    try {
      // Get all feedback
      const feedback = this.feedbackTracker.getAllFeedback();
      
      // Recognize patterns
      await this.recognizePatterns(feedback);
      
      logger.info('[PatternRecognizer] Patterns updated successfully');
    } catch (error: any) {
      logger.error('[PatternRecognizer] Pattern update failed', {
        error: error.message,
      });
      throw error;
    }
  }
  
  // ==========================================================================
  // Public API
  // ==========================================================================
  
  /**
   * Get current patterns
   */
  getPatterns(): RecognizedPatterns {
    return this.patterns;
  }
  
  /**
   * Get urgency keywords
   */
  getUrgencyKeywords(): Map<string, UrgencyKeyword> {
    return this.patterns.urgencyKeywords;
  }
  
  /**
   * Get sender patterns
   */
  getSenderPatterns(): Map<string, SenderPattern> {
    return this.patterns.senderPatterns;
  }
  
  /**
   * Get time patterns
   */
  getTimePatterns(): Map<string, TimePattern> {
    return this.patterns.timePatterns;
  }
  
  /**
   * Get category-action mappings
   */
  getCategoryActions(): Map<string, CategoryActionPattern> {
    return this.patterns.categoryActions;
  }
  
  /**
   * Get subject patterns
   */
  getSubjectPatterns(): SubjectPattern[] {
    return this.patterns.subjectPatterns;
  }
  
  /**
   * Get patterns count
   */
  getPatternsCount(): {
    urgencyKeywords: number;
    senderPatterns: number;
    timePatterns: number;
    categoryActions: number;
    subjectPatterns: number;
    total: number;
  } {
    const counts = {
      urgencyKeywords: this.patterns.urgencyKeywords.size,
      senderPatterns: this.patterns.senderPatterns.size,
      timePatterns: this.patterns.timePatterns.size,
      categoryActions: this.patterns.categoryActions.size,
      subjectPatterns: this.patterns.subjectPatterns.length,
      total: 0,
    };
    
    counts.total = counts.urgencyKeywords + counts.senderPatterns + 
                   counts.timePatterns + counts.categoryActions + 
                   counts.subjectPatterns;
    
    return counts;
  }
  
  /**
   * Get pattern statistics
   */
  getPatternStatistics(): {
    lastUpdated: string;
    totalSignalsAnalyzed: number;
    topUrgencyKeywords: UrgencyKeyword[];
    topSenders: SenderPattern[];
    mostReliableTimePatterns: TimePattern[];
  } {
    return {
      lastUpdated: this.patterns.lastUpdated,
      totalSignalsAnalyzed: this.patterns.totalSignalsAnalyzed,
      topUrgencyKeywords: Array.from(this.patterns.urgencyKeywords.values())
        .sort((a, b) => Math.abs(b.urgencyBoost) - Math.abs(a.urgencyBoost))
        .slice(0, 10),
      topSenders: Array.from(this.patterns.senderPatterns.values())
        .sort((a, b) => b.totalSignals - a.totalSignals)
        .slice(0, 10),
      mostReliableTimePatterns: Array.from(this.patterns.timePatterns.values())
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 10),
    };
  }
  
  /**
   * Clear all patterns
   */
  clearPatterns(): void {
    this.patterns = {
      urgencyKeywords: new Map(),
      senderPatterns: new Map(),
      timePatterns: new Map(),
      categoryActions: new Map(),
      subjectPatterns: [],
      lastUpdated: new Date().toISOString(),
      totalSignalsAnalyzed: 0,
    };
    
    this.savePatterns();
    logger.info('[PatternRecognizer] Patterns cleared');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let recognizerInstance: PatternRecognizer | null = null;

/**
 * Get singleton pattern recognizer instance
 */
export function getPatternRecognizer(config?: Partial<PatternRecognizerConfig>): PatternRecognizer {
  if (!recognizerInstance) {
    recognizerInstance = PatternRecognizer.getInstance(config);
  }
  return recognizerInstance;
}

/**
 * Recognize patterns (convenience function)
 */
export async function recognizePatterns(feedbackHistory?: FeedbackRecord[]): Promise<RecognizedPatterns> {
  return getPatternRecognizer().recognizePatterns(feedbackHistory);
}

/**
 * Apply patterns to signal (convenience function)
 */
export function applyPatterns(
  signal: Signal,
  classification: SignalClassification,
  patterns?: RecognizedPatterns
): PatternApplicationResult {
  return getPatternRecognizer().applyPatterns(signal, classification, patterns);
}

/**
 * Update patterns (convenience function)
 */
export async function updatePatterns(): Promise<void> {
  return getPatternRecognizer().updatePatterns();
}
