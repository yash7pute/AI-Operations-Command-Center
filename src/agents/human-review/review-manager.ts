/**
 * Human-in-the-Loop Review Manager
 * 
 * Manages signals and decisions that require human approval before execution.
 * Handles review queue, approval/rejection workflow, auto-expiration, and statistics.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import type { ReasoningResult } from '../reasoning-pipeline';
import type { ActionDecision } from '../decision-agent';
import logger from '../../utils/logger';

/**
 * Review status enumeration
 */
export type ReviewStatus = 
  | 'pending'      // Awaiting human review
  | 'approved'     // Approved by human
  | 'rejected'     // Rejected by human
  | 'auto_approved' // Auto-approved after timeout
  | 'auto_rejected' // Auto-rejected (time-sensitive expired)
  | 'expired';      // Expired without action

/**
 * Reason for requiring human review
 */
export type ReviewReason =
  | 'low_confidence'        // Decision confidence < 0.7
  | 'requires_approval'     // Explicitly marked for approval
  | 'high_impact'           // Financial or external actions
  | 'conflicting_classification' // Ambiguous or conflicting data
  | 'manual_escalation'     // Manually escalated by user
  | 'policy_violation'      // Potential policy violation
  | 'unknown_sender'        // Unknown or suspicious sender
  | 'large_scope';          // Action affects many resources

/**
 * Risk level for auto-expiration
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Review item in the queue
 */
export interface ReviewItem {
  // Identification
  reviewId: string;
  signalId: string;
  
  // Review metadata
  status: ReviewStatus;
  reason: ReviewReason[];
  riskLevel: RiskLevel;
  
  // Original data
  reasoningResult: ReasoningResult;
  originalDecision: ActionDecision;
  
  // Timing
  queuedAt: string;
  reviewedAt?: string;
  expiresAt?: string;
  
  // Review outcome
  approver?: string;
  reviewer?: string;
  modifications?: Partial<ActionDecision>;
  rejectionReason?: string;
  
  // Slack notification
  notificationSent: boolean;
  slackMessageId?: string;
  reviewUrl?: string;
}

/**
 * Review queue statistics
 */
export interface ReviewStats {
  // Queue metrics
  queueDepth: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  autoApprovedCount: number;
  autoRejectedCount: number;
  
  // Timing metrics
  averageWaitTime: number; // milliseconds
  medianWaitTime: number;
  longestWaitTime: number;
  
  // Approval metrics
  approvalRate: number; // percentage
  rejectionRate: number;
  autoApprovalRate: number;
  
  // Risk distribution
  riskDistribution: Record<RiskLevel, number>;
  
  // Reason distribution
  reasonDistribution: Record<ReviewReason, number>;
  
  // Time window
  since: string;
  lastUpdated: string;
}

/**
 * Review manager configuration
 */
export interface ReviewManagerConfig {
  // Persistence
  queueFilePath?: string;
  persistToDisk?: boolean;
  
  // Auto-expiration
  enableAutoExpiration?: boolean;
  lowRiskExpirationMs?: number;    // Default: 1 hour
  mediumRiskExpirationMs?: number; // Default: 4 hours
  highRiskExpirationMs?: number;   // Default: 24 hours
  criticalRiskExpirationMs?: never; // Never auto-expire
  
  // Notifications
  enableSlackNotifications?: boolean;
  slackChannel?: string;
  slackWebhookUrl?: string;
  dashboardBaseUrl?: string;
  
  // Queue management
  maxQueueSize?: number;
  cleanupInterval?: number; // milliseconds
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<Omit<ReviewManagerConfig, 'criticalRiskExpirationMs'>> = {
  queueFilePath: path.join(process.cwd(), 'data', 'review-queue.json'),
  persistToDisk: true,
  enableAutoExpiration: true,
  lowRiskExpirationMs: 60 * 60 * 1000, // 1 hour
  mediumRiskExpirationMs: 4 * 60 * 60 * 1000, // 4 hours
  highRiskExpirationMs: 24 * 60 * 60 * 1000, // 24 hours
  enableSlackNotifications: true,
  slackChannel: '#human-review',
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',
  dashboardBaseUrl: process.env.DASHBOARD_BASE_URL || 'http://localhost:3000',
  maxQueueSize: 1000,
  cleanupInterval: 5 * 60 * 1000, // 5 minutes
};

/**
 * Review Manager - Manages human-in-the-loop review workflow
 */
export class ReviewManager {
  private static instance: ReviewManager;
  private config: Required<Omit<ReviewManagerConfig, 'criticalRiskExpirationMs'>>;
  private reviewQueue: Map<string, ReviewItem>;
  private reviewIdCounter: number;
  private cleanupTimer?: NodeJS.Timeout;
  
  // Statistics tracking
  private statsStartTime: string;
  private totalReviewed: number;
  private totalWaitTime: number;
  
  private constructor(config?: ReviewManagerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reviewQueue = new Map();
    this.reviewIdCounter = 1;
    this.statsStartTime = new Date().toISOString();
    this.totalReviewed = 0;
    this.totalWaitTime = 0;
    
    // Load queue from disk
    this.loadQueueFromDisk().catch((error) => {
      logger.error('[ReviewManager] Failed to load queue from disk', { error: error.message });
    });
    
    // Start cleanup timer if auto-expiration enabled
    if (this.config.enableAutoExpiration) {
      this.startCleanupTimer();
    }
    
    logger.info('[ReviewManager] Initialized', {
      persistToDisk: this.config.persistToDisk,
      enableAutoExpiration: this.config.enableAutoExpiration,
      slackNotifications: this.config.enableSlackNotifications,
    });
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(config?: ReviewManagerConfig): ReviewManager {
    if (!ReviewManager.instance) {
      ReviewManager.instance = new ReviewManager(config);
    }
    return ReviewManager.instance;
  }
  
  /**
   * Queue a reasoning result for human review
   */
  public async queueForReview(
    reasoningResult: ReasoningResult,
    reasons: ReviewReason[],
    riskLevel?: RiskLevel
  ): Promise<ReviewItem> {
    const reviewId = this.generateReviewId();
    const now = new Date().toISOString();
    
    // Determine risk level if not provided
    const determinedRiskLevel = riskLevel || this.determineRiskLevel(reasoningResult, reasons);
    
    // Calculate expiration time
    const expiresAt = this.calculateExpirationTime(determinedRiskLevel);
    
    // Create review item
    const reviewItem: ReviewItem = {
      reviewId,
      signalId: reasoningResult.signal.id,
      status: 'pending',
      reason: reasons,
      riskLevel: determinedRiskLevel,
      reasoningResult,
      originalDecision: reasoningResult.decision.decision, // Access the decision from DecisionResult
      queuedAt: now,
      expiresAt,
      notificationSent: false,
    };
    
    // Add to queue
    this.reviewQueue.set(reviewId, reviewItem);
    
    logger.info('[ReviewManager] Item queued for review', {
      reviewId,
      signalId: reasoningResult.signal.id,
      reasons,
      riskLevel: determinedRiskLevel,
      expiresAt,
      queueSize: this.reviewQueue.size,
    });
    
    // Persist to disk
    if (this.config.persistToDisk) {
      await this.saveQueueToDisk();
    }
    
    // Send Slack notification
    if (this.config.enableSlackNotifications && this.config.slackWebhookUrl) {
      await this.sendSlackNotification(reviewItem);
    }
    
    // Generate review URL
    reviewItem.reviewUrl = this.generateReviewUrl(reviewId);
    
    return reviewItem;
  }
  
  /**
   * Get review queue sorted by urgency
   */
  public getReviewQueue(filters?: {
    status?: ReviewStatus;
    riskLevel?: RiskLevel;
    reason?: ReviewReason;
  }): ReviewItem[] {
    let items = Array.from(this.reviewQueue.values());
    
    // Apply filters
    if (filters) {
      if (filters.status) {
        items = items.filter(item => item.status === filters.status);
      }
      if (filters.riskLevel) {
        items = items.filter(item => item.riskLevel === filters.riskLevel);
      }
      if (filters.reason) {
        items = items.filter(item => item.reason.includes(filters.reason!));
      }
    }
    
    // Sort by urgency: critical > high > medium > low, then by queued time
    return items.sort((a, b) => {
      // First by risk level
      const riskOrder: Record<RiskLevel, number> = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1,
      };
      
      const riskDiff = riskOrder[b.riskLevel] - riskOrder[a.riskLevel];
      if (riskDiff !== 0) return riskDiff;
      
      // Then by queued time (older first)
      return new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime();
    });
  }
  
  /**
   * Approve an action with optional modifications
   */
  public async approveAction(
    reviewId: string,
    approver: string,
    modifications?: Partial<ActionDecision>
  ): Promise<ReviewItem> {
    const reviewItem = this.reviewQueue.get(reviewId);
    
    if (!reviewItem) {
      throw new Error(`Review item not found: ${reviewId}`);
    }
    
    if (reviewItem.status !== 'pending') {
      throw new Error(`Review item already ${reviewItem.status}: ${reviewId}`);
    }
    
    const now = new Date().toISOString();
    const waitTime = new Date(now).getTime() - new Date(reviewItem.queuedAt).getTime();
    
    // Update review item
    reviewItem.status = 'approved';
    reviewItem.approver = approver;
    reviewItem.reviewer = approver;
    reviewItem.reviewedAt = now;
    reviewItem.modifications = modifications;
    
    // Update statistics
    this.totalReviewed++;
    this.totalWaitTime += waitTime;
    
    logger.info('[ReviewManager] Action approved', {
      reviewId,
      signalId: reviewItem.signalId,
      approver,
      waitTime,
      hasModifications: !!modifications,
      modifications,
    });
    
    // Persist to disk
    if (this.config.persistToDisk) {
      await this.saveQueueToDisk();
    }
    
    // TODO: Trigger action execution (integration with action executor)
    // This would call the appropriate integration to execute the approved action
    // await this.executeApprovedAction(reviewItem);
    
    return reviewItem;
  }
  
  /**
   * Reject an action with reason
   */
  public async rejectAction(
    reviewId: string,
    reviewer: string,
    reason: string
  ): Promise<ReviewItem> {
    const reviewItem = this.reviewQueue.get(reviewId);
    
    if (!reviewItem) {
      throw new Error(`Review item not found: ${reviewId}`);
    }
    
    if (reviewItem.status !== 'pending') {
      throw new Error(`Review item already ${reviewItem.status}: ${reviewId}`);
    }
    
    const now = new Date().toISOString();
    const waitTime = new Date(now).getTime() - new Date(reviewItem.queuedAt).getTime();
    
    // Update review item
    reviewItem.status = 'rejected';
    reviewItem.reviewer = reviewer;
    reviewItem.reviewedAt = now;
    reviewItem.rejectionReason = reason;
    
    // Update statistics
    this.totalReviewed++;
    this.totalWaitTime += waitTime;
    
    logger.info('[ReviewManager] Action rejected', {
      reviewId,
      signalId: reviewItem.signalId,
      reviewer,
      reason,
      waitTime,
    });
    
    // Persist to disk
    if (this.config.persistToDisk) {
      await this.saveQueueToDisk();
    }
    
    return reviewItem;
  }
  
  /**
   * Auto-expire pending reviews based on risk level and timing
   */
  public async autoExpire(): Promise<{
    autoApproved: ReviewItem[];
    autoRejected: ReviewItem[];
  }> {
    if (!this.config.enableAutoExpiration) {
      return { autoApproved: [], autoRejected: [] };
    }
    
    const now = new Date();
    const autoApproved: ReviewItem[] = [];
    const autoRejected: ReviewItem[] = [];
    
    for (const reviewItem of this.reviewQueue.values()) {
      if (reviewItem.status !== 'pending') {
        continue;
      }
      
      // Check if expired
      if (reviewItem.expiresAt) {
        const expiresAt = new Date(reviewItem.expiresAt);
        
        if (now >= expiresAt) {
          // Auto-approve low and medium risk items
          if (reviewItem.riskLevel === 'low' || reviewItem.riskLevel === 'medium') {
            reviewItem.status = 'auto_approved';
            reviewItem.reviewedAt = now.toISOString();
            reviewItem.approver = 'system';
            
            autoApproved.push(reviewItem);
            
            logger.info('[ReviewManager] Auto-approved expired item', {
              reviewId: reviewItem.reviewId,
              signalId: reviewItem.signalId,
              riskLevel: reviewItem.riskLevel,
              queuedAt: reviewItem.queuedAt,
              expiresAt: reviewItem.expiresAt,
            });
            
            // Update statistics
            this.totalReviewed++;
            this.totalWaitTime += now.getTime() - new Date(reviewItem.queuedAt).getTime();
          }
          // Auto-reject time-sensitive items (check if deadline passed)
          else if (this.isTimeSensitive(reviewItem)) {
            reviewItem.status = 'auto_rejected';
            reviewItem.reviewedAt = now.toISOString();
            reviewItem.reviewer = 'system';
            reviewItem.rejectionReason = 'Time-sensitive action deadline passed';
            
            autoRejected.push(reviewItem);
            
            logger.info('[ReviewManager] Auto-rejected time-sensitive item', {
              reviewId: reviewItem.reviewId,
              signalId: reviewItem.signalId,
              riskLevel: reviewItem.riskLevel,
              reason: 'Deadline passed',
            });
            
            // Update statistics
            this.totalReviewed++;
            this.totalWaitTime += now.getTime() - new Date(reviewItem.queuedAt).getTime();
          }
        }
      }
    }
    
    // Persist changes
    if ((autoApproved.length > 0 || autoRejected.length > 0) && this.config.persistToDisk) {
      await this.saveQueueToDisk();
    }
    
    if (autoApproved.length > 0 || autoRejected.length > 0) {
      logger.info('[ReviewManager] Auto-expiration completed', {
        autoApproved: autoApproved.length,
        autoRejected: autoRejected.length,
      });
    }
    
    return { autoApproved, autoRejected };
  }
  
  /**
   * Get review queue statistics
   */
  public getReviewStats(): ReviewStats {
    const items = Array.from(this.reviewQueue.values());
    const pending = items.filter(item => item.status === 'pending');
    const approved = items.filter(item => item.status === 'approved');
    const rejected = items.filter(item => item.status === 'rejected');
    const autoApproved = items.filter(item => item.status === 'auto_approved');
    const autoRejected = items.filter(item => item.status === 'auto_rejected');
    
    // Calculate wait times
    const waitTimes = items
      .filter(item => item.reviewedAt)
      .map(item => {
        const queued = new Date(item.queuedAt).getTime();
        const reviewed = new Date(item.reviewedAt!).getTime();
        return reviewed - queued;
      });
    
    const averageWaitTime = waitTimes.length > 0
      ? waitTimes.reduce((sum, time) => sum + time, 0) / waitTimes.length
      : 0;
    
    const sortedWaitTimes = [...waitTimes].sort((a, b) => a - b);
    const medianWaitTime = sortedWaitTimes.length > 0
      ? sortedWaitTimes[Math.floor(sortedWaitTimes.length / 2)]
      : 0;
    
    const longestWaitTime = waitTimes.length > 0
      ? Math.max(...waitTimes)
      : 0;
    
    // Calculate approval rates
    const totalReviewed = approved.length + rejected.length + autoApproved.length + autoRejected.length;
    const approvalRate = totalReviewed > 0
      ? ((approved.length + autoApproved.length) / totalReviewed) * 100
      : 0;
    const rejectionRate = totalReviewed > 0
      ? ((rejected.length + autoRejected.length) / totalReviewed) * 100
      : 0;
    const autoApprovalRate = totalReviewed > 0
      ? (autoApproved.length / totalReviewed) * 100
      : 0;
    
    // Risk distribution
    const riskDistribution: Record<RiskLevel, number> = {
      low: items.filter(item => item.riskLevel === 'low').length,
      medium: items.filter(item => item.riskLevel === 'medium').length,
      high: items.filter(item => item.riskLevel === 'high').length,
      critical: items.filter(item => item.riskLevel === 'critical').length,
    };
    
    // Reason distribution
    const reasonDistribution: Record<ReviewReason, number> = {
      low_confidence: 0,
      requires_approval: 0,
      high_impact: 0,
      conflicting_classification: 0,
      manual_escalation: 0,
      policy_violation: 0,
      unknown_sender: 0,
      large_scope: 0,
    };
    
    items.forEach(item => {
      item.reason.forEach(reason => {
        reasonDistribution[reason]++;
      });
    });
    
    return {
      queueDepth: this.reviewQueue.size,
      pendingCount: pending.length,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      autoApprovedCount: autoApproved.length,
      autoRejectedCount: autoRejected.length,
      averageWaitTime,
      medianWaitTime,
      longestWaitTime,
      approvalRate,
      rejectionRate,
      autoApprovalRate,
      riskDistribution,
      reasonDistribution,
      since: this.statsStartTime,
      lastUpdated: new Date().toISOString(),
    };
  }
  
  /**
   * Get a specific review item
   */
  public getReviewItem(reviewId: string): ReviewItem | undefined {
    return this.reviewQueue.get(reviewId);
  }
  
  /**
   * Clear all completed reviews (approved, rejected, auto-approved, auto-rejected)
   */
  public async clearCompletedReviews(): Promise<number> {
    const initialSize = this.reviewQueue.size;
    
    for (const [reviewId, item] of this.reviewQueue.entries()) {
      if (item.status !== 'pending') {
        this.reviewQueue.delete(reviewId);
      }
    }
    
    const clearedCount = initialSize - this.reviewQueue.size;
    
    if (clearedCount > 0) {
      logger.info('[ReviewManager] Cleared completed reviews', {
        clearedCount,
        remainingCount: this.reviewQueue.size,
      });
      
      if (this.config.persistToDisk) {
        await this.saveQueueToDisk();
      }
    }
    
    return clearedCount;
  }
  
  /**
   * Reset statistics (for testing)
   */
  public resetStats(): void {
    this.statsStartTime = new Date().toISOString();
    this.totalReviewed = 0;
    this.totalWaitTime = 0;
    
    logger.info('[ReviewManager] Statistics reset');
  }
  
  /**
   * Shutdown - cleanup timers and save queue
   */
  public async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    if (this.config.persistToDisk) {
      await this.saveQueueToDisk();
    }
    
    logger.info('[ReviewManager] Shutdown complete');
  }
  
  // ==================== Private Helper Methods ====================
  
  /**
   * Generate unique review ID
   */
  private generateReviewId(): string {
    const timestamp = Date.now();
    const counter = this.reviewIdCounter++;
    return `review-${timestamp}-${counter}`;
  }
  
  /**
   * Determine risk level based on reasoning result and reasons
   */
  private determineRiskLevel(
    reasoningResult: ReasoningResult,
    reasons: ReviewReason[]
  ): RiskLevel {
    const decision = reasoningResult.decision.decision;
    
    // Critical risk indicators
    if (
      reasons.includes('high_impact') ||
      reasons.includes('policy_violation')
    ) {
      return 'critical';
    }
    
    // High risk indicators
    if (
      reasons.includes('conflicting_classification') ||
      reasons.includes('large_scope') ||
      decision.confidence < 0.5
    ) {
      return 'high';
    }
    
    // Medium risk indicators
    if (
      reasons.includes('low_confidence') ||
      reasons.includes('unknown_sender') ||
      decision.confidence < 0.7
    ) {
      return 'medium';
    }
    
    // Default to low risk
    return 'low';
  }
  
  /**
   * Calculate expiration time based on risk level
   */
  private calculateExpirationTime(riskLevel: RiskLevel): string | undefined {
    if (!this.config.enableAutoExpiration) {
      return undefined;
    }
    
    let expirationMs: number;
    
    switch (riskLevel) {
      case 'low':
        expirationMs = this.config.lowRiskExpirationMs;
        break;
      case 'medium':
        expirationMs = this.config.mediumRiskExpirationMs;
        break;
      case 'high':
        expirationMs = this.config.highRiskExpirationMs;
        break;
      case 'critical':
        return undefined; // Never auto-expire critical items
      default:
        expirationMs = this.config.mediumRiskExpirationMs;
    }
    
    return new Date(Date.now() + expirationMs).toISOString();
  }
  
  /**
   * Check if item is time-sensitive
   */
  private isTimeSensitive(reviewItem: ReviewItem): boolean {
    // Check if signal has urgent classification
    const classification = reviewItem.reasoningResult.classification.classification;
    if (classification.urgency === 'critical' || classification.requiresImmediate) {
      return true;
    }
    
    // Check if action has time constraints
    const decision = reviewItem.originalDecision;
    if (decision.action === 'send_notification' || decision.action === 'escalate') {
      return true;
    }
    
    // Check if deadline is mentioned in signal
    const signal = reviewItem.reasoningResult.signal;
    const deadlineKeywords = ['asap', 'urgent', 'immediate', 'deadline', 'time-sensitive'];
    const hasDeadline = deadlineKeywords.some(keyword => 
      signal.subject?.toLowerCase().includes(keyword) ||
      signal.body?.toLowerCase().includes(keyword)
    );
    
    return hasDeadline;
  }
  
  /**
   * Generate review URL for dashboard
   */
  private generateReviewUrl(reviewId: string): string {
    return `${this.config.dashboardBaseUrl}/review/${reviewId}`;
  }
  
  /**
   * Send Slack notification for new review item
   */
  private async sendSlackNotification(reviewItem: ReviewItem): Promise<void> {
    if (!this.config.slackWebhookUrl) {
      logger.warn('[ReviewManager] Slack webhook URL not configured');
      return;
    }
    
    try {
      const signal = reviewItem.reasoningResult.signal;
      const decision = reviewItem.originalDecision;
      
      const message = {
        channel: this.config.slackChannel,
        username: 'Review Manager',
        icon_emoji: ':warning:',
        text: `New item requires human review`,
        attachments: [
          {
            color: this.getRiskColor(reviewItem.riskLevel),
            title: `Review Required: ${signal.subject || 'No Subject'}`,
            title_link: reviewItem.reviewUrl,
            fields: [
              {
                title: 'Review ID',
                value: reviewItem.reviewId,
                short: true,
              },
              {
                title: 'Risk Level',
                value: reviewItem.riskLevel.toUpperCase(),
                short: true,
              },
              {
                title: 'Reasons',
                value: reviewItem.reason.join(', '),
                short: false,
              },
              {
                title: 'Proposed Action',
                value: decision.action,
                short: true,
              },
              {
                title: 'Confidence',
                value: `${(decision.confidence * 100).toFixed(1)}%`,
                short: true,
              },
              {
                title: 'Sender',
                value: signal.sender || 'Unknown',
                short: true,
              },
              {
                title: 'Expires',
                value: reviewItem.expiresAt 
                  ? new Date(reviewItem.expiresAt).toLocaleString()
                  : 'Never',
                short: true,
              },
            ],
            footer: 'AI Operations Command Center',
            ts: Math.floor(new Date(reviewItem.queuedAt).getTime() / 1000),
          },
        ],
      };
      
      const response = await fetch(this.config.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      
      if (response.ok) {
        reviewItem.notificationSent = true;
        logger.info('[ReviewManager] Slack notification sent', {
          reviewId: reviewItem.reviewId,
          channel: this.config.slackChannel,
        });
      } else {
        const errorText = await response.text();
        logger.error('[ReviewManager] Failed to send Slack notification', {
          reviewId: reviewItem.reviewId,
          status: response.status,
          error: errorText,
        });
      }
    } catch (error) {
      logger.error('[ReviewManager] Error sending Slack notification', {
        reviewId: reviewItem.reviewId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  /**
   * Get Slack color for risk level
   */
  private getRiskColor(riskLevel: RiskLevel): string {
    switch (riskLevel) {
      case 'critical':
        return 'danger';
      case 'high':
        return 'warning';
      case 'medium':
        return '#FFA500'; // Orange
      case 'low':
        return 'good';
      default:
        return '#808080'; // Gray
    }
  }
  
  /**
   * Save queue to disk
   */
  private async saveQueueToDisk(): Promise<void> {
    try {
      const queueData = {
        items: Array.from(this.reviewQueue.entries()),
        lastSaved: new Date().toISOString(),
        reviewIdCounter: this.reviewIdCounter,
        statsStartTime: this.statsStartTime,
        totalReviewed: this.totalReviewed,
        totalWaitTime: this.totalWaitTime,
      };
      
      // Ensure directory exists
      const dir = path.dirname(this.config.queueFilePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Write to file
      await fs.writeFile(
        this.config.queueFilePath,
        JSON.stringify(queueData, null, 2),
        'utf-8'
      );
      
      logger.debug('[ReviewManager] Queue saved to disk', {
        queueSize: this.reviewQueue.size,
        filePath: this.config.queueFilePath,
      });
    } catch (error) {
      logger.error('[ReviewManager] Failed to save queue to disk', {
        error: error instanceof Error ? error.message : String(error),
        filePath: this.config.queueFilePath,
      });
    }
  }
  
  /**
   * Load queue from disk
   */
  private async loadQueueFromDisk(): Promise<void> {
    try {
      const fileContent = await fs.readFile(this.config.queueFilePath, 'utf-8');
      const queueData = JSON.parse(fileContent);
      
      // Restore queue
      this.reviewQueue = new Map(queueData.items);
      this.reviewIdCounter = queueData.reviewIdCounter || 1;
      this.statsStartTime = queueData.statsStartTime || new Date().toISOString();
      this.totalReviewed = queueData.totalReviewed || 0;
      this.totalWaitTime = queueData.totalWaitTime || 0;
      
      logger.info('[ReviewManager] Queue loaded from disk', {
        queueSize: this.reviewQueue.size,
        filePath: this.config.queueFilePath,
        lastSaved: queueData.lastSaved,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('[ReviewManager] No existing queue file found, starting fresh');
      } else {
        logger.error('[ReviewManager] Failed to load queue from disk', {
          error: error instanceof Error ? error.message : String(error),
          filePath: this.config.queueFilePath,
        });
      }
    }
  }
  
  /**
   * Start cleanup timer for auto-expiration
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.autoExpire();
      } catch (error) {
        logger.error('[ReviewManager] Error during auto-expiration', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.config.cleanupInterval);
    
    logger.info('[ReviewManager] Cleanup timer started', {
      interval: this.config.cleanupInterval,
    });
  }
}

// ==================== Convenience Functions ====================

/**
 * Get review manager singleton instance
 */
export function getReviewManager(config?: ReviewManagerConfig): ReviewManager {
  return ReviewManager.getInstance(config);
}

/**
 * Queue a reasoning result for review
 */
export async function queueForReview(
  reasoningResult: ReasoningResult,
  reasons: ReviewReason[],
  riskLevel?: RiskLevel
): Promise<ReviewItem> {
  const manager = getReviewManager();
  return manager.queueForReview(reasoningResult, reasons, riskLevel);
}

/**
 * Get review queue
 */
export function getReviewQueue(filters?: {
  status?: ReviewStatus;
  riskLevel?: RiskLevel;
  reason?: ReviewReason;
}): ReviewItem[] {
  const manager = getReviewManager();
  return manager.getReviewQueue(filters);
}

/**
 * Approve action
 */
export async function approveAction(
  reviewId: string,
  approver: string,
  modifications?: Partial<ActionDecision>
): Promise<ReviewItem> {
  const manager = getReviewManager();
  return manager.approveAction(reviewId, approver, modifications);
}

/**
 * Reject action
 */
export async function rejectAction(
  reviewId: string,
  reviewer: string,
  reason: string
): Promise<ReviewItem> {
  const manager = getReviewManager();
  return manager.rejectAction(reviewId, reviewer, reason);
}

/**
 * Get review statistics
 */
export function getReviewStats(): ReviewStats {
  const manager = getReviewManager();
  return manager.getReviewStats();
}
