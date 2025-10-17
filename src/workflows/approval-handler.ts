/**
 * Approval Queue Handler
 * 
 * Human-in-the-loop integration for action approval:
 * - Listens to approval request events
 * - Slack notifications with approve/reject buttons
 * - Auto-expiry based on risk level
 * - Learning feedback system
 * - Approval queue dashboard
 */

import { EventEmitter } from 'events';
import logger from '../utils/logger';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Approval priority levels
 */
export enum ApprovalPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Approval status
 */
export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/**
 * Risk level
 */
export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Approval decision
 */
export enum ApprovalDecision {
  APPROVE = 'approve',
  REJECT = 'reject',
  MODIFY = 'modify'
}

/**
 * Reasoning result (from Member 2)
 */
export interface ReasoningResult {
  /**
   * Action to execute
   */
  action: string;

  /**
   * Action parameters
   */
  parameters: any;

  /**
   * Reasoning explanation
   */
  reasoning: string;

  /**
   * Confidence score (0-1)
   */
  confidence: number;

  /**
   * Risk assessment
   */
  riskLevel: RiskLevel;

  /**
   * Priority
   */
  priority: ApprovalPriority;

  /**
   * Alternative actions considered
   */
  alternatives?: string[];

  /**
   * Context information
   */
  context?: any;
}

/**
 * Approval request
 */
export interface ApprovalRequest {
  /**
   * Unique approval ID
   */
  id: string;

  /**
   * Reasoning result
   */
  reasoningResult: ReasoningResult;

  /**
   * Reason for requiring approval
   */
  reason: string;

  /**
   * Current status
   */
  status: ApprovalStatus;

  /**
   * Priority level
   */
  priority: ApprovalPriority;

  /**
   * Risk level
   */
  riskLevel: RiskLevel;

  /**
   * Timestamp when created
   */
  createdAt: Date;

  /**
   * Timestamp when expires
   */
  expiresAt: Date;

  /**
   * Timeout duration (ms)
   */
  timeout: number;

  /**
   * Slack message timestamp
   */
  slackMessageTs?: string;

  /**
   * Approval decision
   */
  decision?: ApprovalDecision;

  /**
   * Decision maker
   */
  decidedBy?: string;

  /**
   * Decision timestamp
   */
  decidedAt?: Date;

  /**
   * Modifications to action
   */
  modifications?: any;

  /**
   * Execution result
   */
  executionResult?: any;

  /**
   * Rejection reason
   */
  rejectionReason?: string;

  /**
   * Metadata
   */
  metadata: {
    /**
     * Source of request
     */
    source: string;

    /**
     * Related workflow
     */
    workflowId?: string;

    /**
     * Related task
     */
    taskId?: string;

    /**
     * Estimated impact
     */
    estimatedImpact?: string;

    /**
     * Additional context
     */
    [key: string]: any;
  };
}

/**
 * Approval feedback (for learning system)
 */
export interface ApprovalFeedback {
  /**
   * Approval ID
   */
  approvalId: string;

  /**
   * Decision made
   */
  decision: ApprovalDecision;

  /**
   * Was decision correct?
   */
  wasCorrect?: boolean;

  /**
   * Execution success
   */
  executionSuccess: boolean;

  /**
   * Time to decision (ms)
   */
  timeToDecision: number;

  /**
   * Modifications made
   */
  hadModifications: boolean;

  /**
   * Original confidence
   */
  originalConfidence: number;

  /**
   * Risk level
   */
  riskLevel: RiskLevel;

  /**
   * Learning notes
   */
  notes?: string;
}

/**
 * Approval configuration
 */
export interface ApprovalConfig {
  /**
   * Enable approval queue
   */
  enabled: boolean;

  /**
   * Slack configuration
   */
  slack: {
    /**
     * Enable Slack notifications
     */
    enabled: boolean;

    /**
     * Slack channel for approvals
     */
    channel: string;

    /**
     * Mention users for critical approvals
     */
    mentionOnCritical: boolean;

    /**
     * User IDs to mention
     */
    mentionUsers?: string[];
  };

  /**
   * Timeout configuration (ms)
   */
  timeouts: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };

  /**
   * Auto-expiry behavior
   */
  autoExpiry: {
    /**
     * Enable auto-expiry
     */
    enabled: boolean;

    /**
     * Auto-approve low risk
     */
    autoApproveLowRisk: boolean;

    /**
     * Auto-reject high risk
     */
    autoRejectHighRisk: boolean;
  };

  /**
   * Learning feedback
   */
  learningFeedback: {
    /**
     * Enable learning feedback
     */
    enabled: boolean;

    /**
     * Feedback callback
     */
    callback?: (feedback: ApprovalFeedback) => void;
  };
}

/**
 * Approval statistics
 */
export interface ApprovalStats {
  /**
   * Total approvals requested
   */
  totalRequests: number;

  /**
   * Approved count
   */
  approved: number;

  /**
   * Rejected count
   */
  rejected: number;

  /**
   * Expired count
   */
  expired: number;

  /**
   * Auto-approved count
   */
  autoApproved: number;

  /**
   * Auto-rejected count
   */
  autoRejected: number;

  /**
   * Average decision time (ms)
   */
  avgDecisionTime: number;

  /**
   * Approval rate by risk level
   */
  approvalRateByRisk: Map<RiskLevel, number>;

  /**
   * Pending approvals
   */
  pendingCount: number;
}

/**
 * Approval events
 */
export interface ApprovalEvents {
  'action:requires_approval': (request: ApprovalRequest) => void;
  'approval:queued': (request: ApprovalRequest) => void;
  'approval:decided': (request: ApprovalRequest) => void;
  'approval:expired': (request: ApprovalRequest) => void;
  'approval:executing': (request: ApprovalRequest) => void;
  'approval:completed': (request: ApprovalRequest, result: any) => void;
  'approval:failed': (request: ApprovalRequest, error: Error) => void;
}

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ApprovalConfig = {
  enabled: process.env.ENABLE_APPROVALS !== 'false',
  slack: {
    enabled: process.env.SLACK_APPROVALS_ENABLED === 'true',
    channel: process.env.SLACK_APPROVALS_CHANNEL || '#approvals',
    mentionOnCritical: true,
    mentionUsers: process.env.SLACK_APPROVAL_USERS?.split(',')
  },
  timeouts: {
    low: 60 * 60 * 1000,        // 1 hour
    medium: 30 * 60 * 1000,     // 30 minutes
    high: 15 * 60 * 1000,       // 15 minutes
    critical: 0                  // Immediate (no auto-expire)
  },
  autoExpiry: {
    enabled: true,
    autoApproveLowRisk: true,
    autoRejectHighRisk: true
  },
  learningFeedback: {
    enabled: true
  }
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

/**
 * Event emitter
 */
export const eventEmitter = new EventEmitter();

/**
 * Current configuration
 */
let currentConfig: ApprovalConfig = { ...DEFAULT_CONFIG };

/**
 * Approval queue
 */
const approvalQueue = new Map<string, ApprovalRequest>();

/**
 * Expiry timers
 */
const expiryTimers = new Map<string, NodeJS.Timeout>();

/**
 * Statistics
 */
const stats: ApprovalStats = {
  totalRequests: 0,
  approved: 0,
  rejected: 0,
  expired: 0,
  autoApproved: 0,
  autoRejected: 0,
  avgDecisionTime: 0,
  approvalRateByRisk: new Map(),
  pendingCount: 0
};

/**
 * Decision times (for calculating average)
 */
const decisionTimes: number[] = [];

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Generate unique approval ID
 */
function generateApprovalId(): string {
  return `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get timeout for priority
 */
function getTimeout(priority: ApprovalPriority): number {
  return currentConfig.timeouts[priority];
}

/**
 * Queue approval request
 */
export async function queueApproval(
  reasoningResult: ReasoningResult,
  reason: string,
  metadata?: any
): Promise<string> {
  if (!currentConfig.enabled) {
    logger.warn('Approval queue disabled, auto-approving');
    return 'auto-approved';
  }

  const approvalId = generateApprovalId();
  const timeout = getTimeout(reasoningResult.priority);
  const expiresAt = timeout > 0 
    ? new Date(Date.now() + timeout)
    : new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours for critical

  const request: ApprovalRequest = {
    id: approvalId,
    reasoningResult,
    reason,
    status: ApprovalStatus.PENDING,
    priority: reasoningResult.priority,
    riskLevel: reasoningResult.riskLevel,
    createdAt: new Date(),
    expiresAt,
    timeout,
    metadata: {
      source: 'member-2',
      ...metadata
    }
  };

  // Add to queue
  approvalQueue.set(approvalId, request);
  stats.totalRequests++;
  stats.pendingCount++;

  logger.info('Approval queued', {
    approvalId,
    action: reasoningResult.action,
    priority: reasoningResult.priority,
    riskLevel: reasoningResult.riskLevel,
    expiresAt: expiresAt.toISOString()
  });

  // Emit events
  eventEmitter.emit('action:requires_approval', request);
  eventEmitter.emit('approval:queued', request);

  // Send Slack notification
  if (currentConfig.slack.enabled) {
    await sendSlackNotification(request);
  }

  // Set expiry timer (if not critical)
  if (timeout > 0) {
    const timer = setTimeout(() => {
      autoExpire(approvalId);
    }, timeout);
    expiryTimers.set(approvalId, timer);
  }

  return approvalId;
}

/**
 * Process approval decision
 */
export async function processApproval(
  approvalId: string,
  decision: ApprovalDecision,
  decidedBy: string,
  modifications?: any,
  rejectionReason?: string
): Promise<void> {
  const request = approvalQueue.get(approvalId);

  if (!request) {
    throw new Error(`Approval request not found: ${approvalId}`);
  }

  if (request.status !== ApprovalStatus.PENDING) {
    throw new Error(`Approval already processed: ${approvalId} (${request.status})`);
  }

  // Clear expiry timer
  const timer = expiryTimers.get(approvalId);
  if (timer) {
    clearTimeout(timer);
    expiryTimers.delete(approvalId);
  }

  // Calculate decision time
  const decisionTime = Date.now() - request.createdAt.getTime();
  decisionTimes.push(decisionTime);
  if (decisionTimes.length > 100) {
    decisionTimes.shift();
  }
  stats.avgDecisionTime = 
    decisionTimes.reduce((sum, time) => sum + time, 0) / decisionTimes.length;

  // Update request
  request.decision = decision;
  request.decidedBy = decidedBy;
  request.decidedAt = new Date();
  request.modifications = modifications;
  request.rejectionReason = rejectionReason;

  logger.info('Approval decision made', {
    approvalId,
    decision,
    decidedBy,
    decisionTime: `${Math.round(decisionTime / 1000)}s`
  });

  if (decision === ApprovalDecision.APPROVE || decision === ApprovalDecision.MODIFY) {
    // Approved - execute action
    request.status = ApprovalStatus.APPROVED;
    stats.approved++;
    stats.pendingCount--;

    // Update approval rate by risk
    const riskApprovals = stats.approvalRateByRisk.get(request.riskLevel) || 0;
    stats.approvalRateByRisk.set(request.riskLevel, riskApprovals + 1);

    // Execute action
    await executeApprovedAction(request);

  } else {
    // Rejected
    request.status = ApprovalStatus.REJECTED;
    stats.rejected++;
    stats.pendingCount--;

    logger.warn('Approval rejected', {
      approvalId,
      reason: rejectionReason,
      action: request.reasoningResult.action
    });

    // Provide feedback to learning system
    await provideLearningFeedback(request, false);

    // Update Slack message
    if (currentConfig.slack.enabled && request.slackMessageTs) {
      await updateSlackMessage(request, '❌ Rejected');
    }
  }

  eventEmitter.emit('approval:decided', request);
}

/**
 * Execute approved action
 */
async function executeApprovedAction(request: ApprovalRequest): Promise<void> {
  request.status = ApprovalStatus.EXECUTING;
  eventEmitter.emit('approval:executing', request);

  logger.info('Executing approved action', {
    approvalId: request.id,
    action: request.reasoningResult.action
  });

  try {
    // Merge modifications if any
    const parameters = request.modifications 
      ? { ...request.reasoningResult.parameters, ...request.modifications }
      : request.reasoningResult.parameters;

    // Execute action (simulated - would call actual execution)
    const result = await simulateActionExecution(
      request.reasoningResult.action,
      parameters
    );

    request.executionResult = result;
    request.status = ApprovalStatus.COMPLETED;

    logger.info('Approved action completed', {
      approvalId: request.id,
      result
    });

    // Provide feedback to learning system
    await provideLearningFeedback(request, true);

    // Update Slack message
    if (currentConfig.slack.enabled && request.slackMessageTs) {
      await updateSlackMessage(request, '✅ Approved & Completed');
    }

    eventEmitter.emit('approval:completed', request, result);

  } catch (error: any) {
    request.status = ApprovalStatus.FAILED;

    logger.error('Approved action failed', {
      approvalId: request.id,
      error: error.message
    });

    // Provide feedback to learning system
    await provideLearningFeedback(request, false);

    // Update Slack message
    if (currentConfig.slack.enabled && request.slackMessageTs) {
      await updateSlackMessage(request, `❌ Failed: ${error.message}`);
    }

    eventEmitter.emit('approval:failed', request, error);
  }
}

/**
 * Auto-expire approval
 */
export async function autoExpire(approvalId: string): Promise<void> {
  const request = approvalQueue.get(approvalId);

  if (!request) {
    logger.warn('Approval not found for auto-expire', { approvalId });
    return;
  }

  if (request.status !== ApprovalStatus.PENDING) {
    logger.debug('Approval already processed, skipping auto-expire', { 
      approvalId,
      status: request.status 
    });
    return;
  }

  logger.info('Auto-expiring approval', {
    approvalId,
    riskLevel: request.riskLevel,
    action: request.reasoningResult.action
  });

  request.status = ApprovalStatus.EXPIRED;
  stats.expired++;
  stats.pendingCount--;

  // Determine auto-approval/rejection based on risk
  if (currentConfig.autoExpiry.enabled) {
    if (
      request.riskLevel === RiskLevel.LOW && 
      currentConfig.autoExpiry.autoApproveLowRisk
    ) {
      // Auto-approve low risk
      logger.info('Auto-approving low risk action', { approvalId });
      
      request.status = ApprovalStatus.APPROVED;
      request.decision = ApprovalDecision.APPROVE;
      request.decidedBy = 'system-auto-approve';
      request.decidedAt = new Date();
      stats.autoApproved++;

      await executeApprovedAction(request);

    } else if (
      (request.riskLevel === RiskLevel.HIGH || request.riskLevel === RiskLevel.CRITICAL) &&
      currentConfig.autoExpiry.autoRejectHighRisk
    ) {
      // Auto-reject high risk
      logger.warn('Auto-rejecting high risk action', { approvalId });
      
      request.status = ApprovalStatus.REJECTED;
      request.decision = ApprovalDecision.REJECT;
      request.decidedBy = 'system-auto-reject';
      request.decidedAt = new Date();
      request.rejectionReason = 'Auto-rejected due to timeout and high risk';
      stats.autoRejected++;

      await provideLearningFeedback(request, false);

      // Notify about auto-rejection
      if (currentConfig.slack.enabled && request.slackMessageTs) {
        await updateSlackMessage(request, '⚠️ Auto-Rejected (High Risk)');
      }

    } else {
      // Just mark as expired (manual review needed)
      logger.warn('Approval expired, requires manual review', { approvalId });
      
      if (currentConfig.slack.enabled && request.slackMessageTs) {
        await updateSlackMessage(request, '⏱️ Expired - Manual Review Needed');
      }
    }
  }

  eventEmitter.emit('approval:expired', request);
}

/**
 * Provide feedback to learning system
 */
async function provideLearningFeedback(
  request: ApprovalRequest,
  executionSuccess: boolean
): Promise<void> {
  if (!currentConfig.learningFeedback.enabled) {
    return;
  }

  const decisionTime = request.decidedAt 
    ? request.decidedAt.getTime() - request.createdAt.getTime()
    : 0;

  const feedback: ApprovalFeedback = {
    approvalId: request.id,
    decision: request.decision || ApprovalDecision.REJECT,
    executionSuccess,
    timeToDecision: decisionTime,
    hadModifications: !!request.modifications,
    originalConfidence: request.reasoningResult.confidence,
    riskLevel: request.riskLevel,
    wasCorrect: executionSuccess && request.decision === ApprovalDecision.APPROVE,
    notes: request.rejectionReason
  };

  logger.info('Providing learning feedback', {
    approvalId: request.id,
    feedback
  });

  // Call feedback callback if provided
  if (currentConfig.learningFeedback.callback) {
    try {
      await currentConfig.learningFeedback.callback(feedback);
    } catch (error: any) {
      logger.error('Learning feedback callback failed', {
        error: error.message
      });
    }
  }

  // Emit event for Member 2's learning system
  eventEmitter.emit('learning:feedback', feedback);
}

// ============================================================================
// SLACK INTEGRATION
// ============================================================================

/**
 * Send Slack notification
 */
async function sendSlackNotification(request: ApprovalRequest): Promise<void> {
  logger.info('Sending Slack notification', {
    approvalId: request.id,
    channel: currentConfig.slack.channel
  });

  // Format message
  const message = formatSlackMessage(request);

  // Simulated Slack API call - would use actual Slack client
  logger.info('Slack notification sent (simulated)', {
    channel: currentConfig.slack.channel,
    message
  });

  // Store message timestamp (for updates)
  request.slackMessageTs = `${Date.now()}`;
}

/**
 * Format Slack message
 */
function formatSlackMessage(request: ApprovalRequest): any {
  const priorityEmoji = {
    [ApprovalPriority.LOW]: '🟢',
    [ApprovalPriority.MEDIUM]: '🟡',
    [ApprovalPriority.HIGH]: '🟠',
    [ApprovalPriority.CRITICAL]: '🔴'
  };

  const riskEmoji = {
    [RiskLevel.LOW]: '✅',
    [RiskLevel.MEDIUM]: '⚠️',
    [RiskLevel.HIGH]: '🚨',
    [RiskLevel.CRITICAL]: '🆘'
  };

  const mentions = 
    request.priority === ApprovalPriority.CRITICAL && 
    currentConfig.slack.mentionOnCritical &&
    currentConfig.slack.mentionUsers
      ? currentConfig.slack.mentionUsers.map(u => `<@${u}>`).join(' ')
      : '';

  return {
    channel: currentConfig.slack.channel,
    text: `${mentions} Action Approval Required`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${priorityEmoji[request.priority]} Action Approval Required`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Action:*\n${request.reasoningResult.action}`
          },
          {
            type: 'mrkdwn',
            text: `*Priority:*\n${request.priority.toUpperCase()}`
          },
          {
            type: 'mrkdwn',
            text: `*Risk Level:*\n${riskEmoji[request.riskLevel]} ${request.riskLevel.toUpperCase()}`
          },
          {
            type: 'mrkdwn',
            text: `*Confidence:*\n${(request.reasoningResult.confidence * 100).toFixed(0)}%`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Reasoning:*\n${request.reasoningResult.reasoning}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Why Approval Needed:*\n${request.reason}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Parameters:*\n\`\`\`${JSON.stringify(request.reasoningResult.parameters, null, 2)}\`\`\``
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Expires:*\n${request.expiresAt.toISOString()} (${Math.round(request.timeout / 60000)} minutes)`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✅ Approve'
            },
            style: 'primary',
            action_id: `approve_${request.id}`,
            value: request.id
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✏️ Modify'
            },
            action_id: `modify_${request.id}`,
            value: request.id
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '❌ Reject'
            },
            style: 'danger',
            action_id: `reject_${request.id}`,
            value: request.id
          }
        ]
      }
    ]
  };
}

/**
 * Update Slack message
 */
async function updateSlackMessage(
  request: ApprovalRequest,
  statusText: string
): Promise<void> {
  logger.info('Updating Slack message', {
    approvalId: request.id,
    status: statusText
  });

  // Simulated Slack update - would use actual Slack client
  logger.info('Slack message updated (simulated)', {
    messageTs: request.slackMessageTs,
    status: statusText
  });
}

/**
 * Simulate action execution
 */
async function simulateActionExecution(action: string, parameters: any): Promise<any> {
  logger.info('Simulating action execution', { action, parameters });
  
  // Simulate execution time
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return {
    success: true,
    action,
    parameters,
    timestamp: new Date().toISOString(),
    result: 'Action executed successfully (simulated)'
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configure approval handler
 */
export function configure(config: Partial<ApprovalConfig>): void {
  currentConfig = {
    ...currentConfig,
    ...config,
    slack: {
      ...currentConfig.slack,
      ...config.slack
    },
    timeouts: {
      ...currentConfig.timeouts,
      ...config.timeouts
    },
    autoExpiry: {
      ...currentConfig.autoExpiry,
      ...config.autoExpiry
    },
    learningFeedback: {
      ...currentConfig.learningFeedback,
      ...config.learningFeedback
    }
  };

  logger.info('Approval handler configured', { config: currentConfig });
}

/**
 * Get current configuration
 */
export function getConfig(): ApprovalConfig {
  return { ...currentConfig };
}

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

/**
 * Get approval queue
 */
export function getApprovalQueue(): ApprovalRequest[] {
  return Array.from(approvalQueue.values());
}

/**
 * Get pending approvals
 */
export function getPendingApprovals(): ApprovalRequest[] {
  return Array.from(approvalQueue.values()).filter(
    req => req.status === ApprovalStatus.PENDING
  );
}

/**
 * Get approval by ID
 */
export function getApproval(approvalId: string): ApprovalRequest | undefined {
  return approvalQueue.get(approvalId);
}

/**
 * Clear completed approvals
 */
export function clearCompleted(): number {
  const completed = Array.from(approvalQueue.values()).filter(
    req => req.status === ApprovalStatus.COMPLETED || 
           req.status === ApprovalStatus.REJECTED ||
           req.status === ApprovalStatus.FAILED
  );

  completed.forEach(req => approvalQueue.delete(req.id));

  logger.info('Cleared completed approvals', { count: completed.length });

  return completed.length;
}

/**
 * Get statistics
 */
export function getStats(): ApprovalStats {
  return {
    ...stats,
    approvalRateByRisk: new Map(stats.approvalRateByRisk)
  };
}

/**
 * Reset statistics
 */
export function resetStats(): void {
  stats.totalRequests = 0;
  stats.approved = 0;
  stats.rejected = 0;
  stats.expired = 0;
  stats.autoApproved = 0;
  stats.autoRejected = 0;
  stats.avgDecisionTime = 0;
  stats.approvalRateByRisk.clear();
  stats.pendingCount = getPendingApprovals().length;

  logger.info('Statistics reset');
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

/**
 * Listen to approval request events
 */
export function on<E extends keyof ApprovalEvents>(
  event: E,
  listener: ApprovalEvents[E]
): void {
  eventEmitter.on(event, listener);
}

/**
 * Remove event listener
 */
export function off<E extends keyof ApprovalEvents>(
  event: E,
  listener: ApprovalEvents[E]
): void {
  eventEmitter.off(event, listener);
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Format statistics for display
 */
export function formatStats(statsData: ApprovalStats): string {
  const approvalRate = statsData.totalRequests > 0
    ? ((statsData.approved / statsData.totalRequests) * 100).toFixed(1)
    : '0.0';

  const autoApprovalRate = statsData.totalRequests > 0
    ? ((statsData.autoApproved / statsData.totalRequests) * 100).toFixed(1)
    : '0.0';

  let output = '\n========================================\n';
  output += '      APPROVAL QUEUE STATISTICS\n';
  output += '========================================\n\n';

  output += `Total Requests: ${statsData.totalRequests}\n`;
  output += `Approved: ${statsData.approved} (${approvalRate}%)\n`;
  output += `Rejected: ${statsData.rejected}\n`;
  output += `Expired: ${statsData.expired}\n`;
  output += `Auto-Approved: ${statsData.autoApproved} (${autoApprovalRate}%)\n`;
  output += `Auto-Rejected: ${statsData.autoRejected}\n`;
  output += `Pending: ${statsData.pendingCount}\n`;

  if (statsData.avgDecisionTime > 0) {
    const avgMinutes = Math.round(statsData.avgDecisionTime / 60000);
    output += `\nAverage Decision Time: ${avgMinutes} minutes\n`;
  }

  if (statsData.approvalRateByRisk.size > 0) {
    output += '\nApproval Rate by Risk Level:\n';
    statsData.approvalRateByRisk.forEach((count, risk) => {
      output += `  ${risk.toUpperCase()}: ${count} approvals\n`;
    });
  }

  output += '\n========================================\n';

  return output;
}

/**
 * Get dashboard summary
 */
export function getDashboardSummary(): any {
  const pending = getPendingApprovals();
  
  return {
    stats: getStats(),
    pending: pending.map(req => ({
      id: req.id,
      action: req.reasoningResult.action,
      priority: req.priority,
      riskLevel: req.riskLevel,
      createdAt: req.createdAt,
      expiresAt: req.expiresAt,
      timeRemaining: Math.max(0, req.expiresAt.getTime() - Date.now())
    })),
    recentDecisions: Array.from(approvalQueue.values())
      .filter(req => req.decidedAt)
      .sort((a, b) => 
        (b.decidedAt?.getTime() || 0) - (a.decidedAt?.getTime() || 0)
      )
      .slice(0, 10)
      .map(req => ({
        id: req.id,
        action: req.reasoningResult.action,
        decision: req.decision,
        decidedBy: req.decidedBy,
        decidedAt: req.decidedAt,
        status: req.status
      }))
  };
}

/**
 * Enable approval queue
 */
export function enable(): void {
  currentConfig.enabled = true;
  logger.info('Approval queue enabled');
}

/**
 * Disable approval queue
 */
export function disable(): void {
  currentConfig.enabled = false;
  logger.info('Approval queue disabled');
}

/**
 * Check if enabled
 */
export function isEnabled(): boolean {
  return currentConfig.enabled;
}

/**
 * Clean up
 */
export function destroy(): void {
  // Clear all timers
  expiryTimers.forEach(timer => clearTimeout(timer));
  expiryTimers.clear();

  // Clear queue
  approvalQueue.clear();

  // Remove listeners
  eventEmitter.removeAllListeners();

  logger.info('Approval handler destroyed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Core functions
  queueApproval,
  processApproval,
  autoExpire,

  // Configuration
  configure,
  getConfig,

  // Queue management
  getApprovalQueue,
  getPendingApprovals,
  getApproval,
  clearCompleted,

  // Statistics
  getStats,
  resetStats,
  formatStats,
  getDashboardSummary,

  // Events
  on,
  off,
  eventEmitter,

  // Utilities
  enable,
  disable,
  isEnabled,
  destroy,

  // Enums
  ApprovalPriority,
  ApprovalStatus,
  RiskLevel,
  ApprovalDecision
};
