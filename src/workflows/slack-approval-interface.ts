/**
 * Slack Approval Interface
 * 
 * Interactive Slack integration for approval workflows:
 * - Rich interactive approval messages
 * - Action buttons (Approve, Modify, Reject)
 * - Modal dialogs for modifications
 * - Real-time message updates
 * - Learning feedback integration
 */

import logger from '../utils/logger';
import approvalHandler, { 
  ApprovalDecision, 
  ApprovalPriority,
  RiskLevel 
} from './approval-handler';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Signal information (from Member 1)
 */
export interface SignalInfo {
  /**
   * Signal source (slack, email, calendar, etc.)
   */
  source: string;

  /**
   * Subject or title
   */
  subject: string;

  /**
   * Content excerpt
   */
  content: string;

  /**
   * Full content (optional)
   */
  fullContent?: string;

  /**
   * Sender information
   */
  sender?: string;

  /**
   * Channel or location
   */
  channel?: string;

  /**
   * Timestamp
   */
  timestamp?: Date;

  /**
   * Priority
   */
  priority?: string;

  /**
   * Additional metadata
   */
  metadata?: any;
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
   * Signal information
   */
  signal?: SignalInfo;

  /**
   * Context information
   */
  context?: any;
}

/**
 * Slack button interaction
 */
export interface SlackButtonInteraction {
  /**
   * Interaction type
   */
  type: 'button_click' | 'view_submission' | 'view_closed';

  /**
   * Action ID (approve, modify, reject)
   */
  actionId: string;

  /**
   * Approval ID
   */
  approvalId: string;

  /**
   * User who clicked
   */
  userId: string;

  /**
   * User name
   */
  userName: string;

  /**
   * Channel ID
   */
  channelId: string;

  /**
   * Message timestamp
   */
  messageTs: string;

  /**
   * Response URL
   */
  responseUrl?: string;

  /**
   * Trigger ID (for modals)
   */
  triggerId?: string;

  /**
   * Additional data
   */
  data?: any;
}

/**
 * Slack modal submission
 */
export interface SlackModalSubmission {
  /**
   * Submission type
   */
  type: 'modification' | 'rejection';

  /**
   * Approval ID
   */
  approvalId: string;

  /**
   * User who submitted
   */
  userId: string;

  /**
   * User name
   */
  userName: string;

  /**
   * Submitted values
   */
  values: {
    /**
     * Modified title (for modifications)
     */
    title?: string;

    /**
     * Modified priority (for modifications)
     */
    priority?: string;

    /**
     * Modified assignee (for modifications)
     */
    assignee?: string;

    /**
     * Modified due date (for modifications)
     */
    dueDate?: string;

    /**
     * Additional parameters (for modifications)
     */
    additionalParams?: string;

    /**
     * Rejection reason (for rejections)
     */
    rejectionReason?: string;
  };

  /**
   * Original message timestamp
   */
  messageTs: string;

  /**
   * Channel ID
   */
  channelId: string;
}

/**
 * Slack message response
 */
export interface SlackMessageResponse {
  /**
   * Success status
   */
  success: boolean;

  /**
   * Channel ID
   */
  channel: string;

  /**
   * Message timestamp
   */
  ts: string;

  /**
   * Message permalink
   */
  permalink?: string;

  /**
   * Error message
   */
  error?: string;
}

/**
 * Configuration
 */
export interface SlackApprovalConfig {
  /**
   * Enable Slack integration
   */
  enabled: boolean;

  /**
   * Slack bot token
   */
  botToken?: string;

  /**
   * Default approval channel
   */
  defaultChannel: string;

  /**
   * Mention users for critical approvals
   */
  mentionOnCritical: boolean;

  /**
   * User IDs to mention
   */
  mentionUsers?: string[];

  /**
   * Include signal details
   */
  includeSignalDetails: boolean;

  /**
   * Include alternative actions
   */
  includeAlternatives: boolean;

  /**
   * Show confidence visualization
   */
  showConfidenceBar: boolean;

  /**
   * Enable emoji indicators
   */
  useEmojis: boolean;

  /**
   * Simulated mode (for testing)
   */
  simulatedMode: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default configuration
 */
const DEFAULT_CONFIG: SlackApprovalConfig = {
  enabled: process.env.SLACK_APPROVALS_ENABLED === 'true',
  botToken: process.env.SLACK_BOT_TOKEN,
  defaultChannel: process.env.SLACK_APPROVALS_CHANNEL || '#approvals',
  mentionOnCritical: true,
  mentionUsers: process.env.SLACK_APPROVAL_USERS?.split(','),
  includeSignalDetails: true,
  includeAlternatives: true,
  showConfidenceBar: true,
  useEmojis: true,
  simulatedMode: process.env.SLACK_SIMULATED_MODE !== 'false'
};

/**
 * Priority emojis
 */
const PRIORITY_EMOJIS: Record<string, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  critical: '🔴'
};

/**
 * Risk emojis
 */
const RISK_EMOJIS: Record<string, string> = {
  low: '✅',
  medium: '⚠️',
  high: '🚨',
  critical: '🆘'
};

/**
 * Action emojis
 */
const ACTION_EMOJIS: Record<string, string> = {
  'notion:createPage': '📝',
  'notion:updatePage': '✏️',
  'notion:query': '🔍',
  'trello:createCard': '🎴',
  'trello:updateCard': '📋',
  'trello:moveCard': '➡️',
  'slack:postMessage': '💬',
  'slack:updateMessage': '✉️',
  'drive:upload': '📤',
  'drive:createFolder': '📁',
  'sheets:update': '📊',
  'sheets:append': '➕',
  'gmail:send': '📧',
  'gmail:search': '🔎'
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

/**
 * Current configuration
 */
let currentConfig: SlackApprovalConfig = { ...DEFAULT_CONFIG };

/**
 * Message cache (approvalId -> messageTs)
 */
const messageCache = new Map<string, string>();

/**
 * Active modals (triggerId -> approvalId)
 */
const activeModals = new Map<string, string>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Send approval request to Slack
 */
export async function sendApprovalRequest(
  reasoningResult: ReasoningResult,
  approvalId: string,
  channel?: string
): Promise<SlackMessageResponse> {
  if (!currentConfig.enabled) {
    logger.warn('Slack integration disabled');
    return {
      success: false,
      channel: '',
      ts: '',
      error: 'Slack integration disabled'
    };
  }

  const targetChannel = channel || currentConfig.defaultChannel;

  logger.info('Sending Slack approval request', {
    approvalId,
    channel: targetChannel,
    action: reasoningResult.action,
    priority: reasoningResult.priority,
    confidence: reasoningResult.confidence
  });

  // Build Slack message
  const message = buildApprovalMessage(reasoningResult, approvalId);

  // Send message (simulated or real)
  const response = currentConfig.simulatedMode
    ? await simulateSendMessage(targetChannel, message)
    : await sendSlackMessage(targetChannel, message);

  if (response.success) {
    // Cache message timestamp
    messageCache.set(approvalId, response.ts);

    logger.info('Slack approval request sent', {
      approvalId,
      channel: targetChannel,
      messageTs: response.ts
    });
  } else {
    logger.error('Failed to send Slack approval request', {
      approvalId,
      error: response.error
    });
  }

  return response;
}

/**
 * Handle approval button click
 */
export async function handleApprovalButton(
  interaction: SlackButtonInteraction
): Promise<void> {
  logger.info('Handling approval button click', {
    approvalId: interaction.approvalId,
    actionId: interaction.actionId,
    userId: interaction.userId,
    userName: interaction.userName
  });

  try {
    if (interaction.actionId === 'approve') {
      // Approve immediately
      await handleApprove(interaction);

    } else if (interaction.actionId === 'modify') {
      // Open modification modal
      await openModificationModal(interaction);

    } else if (interaction.actionId === 'reject') {
      // Open rejection modal
      await openRejectionModal(interaction);

    } else {
      logger.warn('Unknown action ID', { actionId: interaction.actionId });
    }

  } catch (error: any) {
    logger.error('Error handling approval button', {
      approvalId: interaction.approvalId,
      error: error.message
    });

    // Send error message to user
    await sendEphemeralMessage(
      interaction.channelId,
      interaction.userId,
      `❌ Error: ${error.message}`
    );
  }
}

/**
 * Handle modification modal submission
 */
export async function handleModificationModal(
  submission: SlackModalSubmission
): Promise<void> {
  logger.info('Handling modification modal submission', {
    approvalId: submission.approvalId,
    userId: submission.userId,
    userName: submission.userName,
    values: submission.values
  });

  try {
    // Build modifications object
    const modifications: any = {};

    if (submission.values.title) {
      modifications.title = submission.values.title;
    }

    if (submission.values.priority) {
      modifications.priority = submission.values.priority;
    }

    if (submission.values.assignee) {
      modifications.assignee = submission.values.assignee;
    }

    if (submission.values.dueDate) {
      modifications.dueDate = submission.values.dueDate;
    }

    if (submission.values.additionalParams) {
      try {
        const additional = JSON.parse(submission.values.additionalParams);
        Object.assign(modifications, additional);
      } catch (error) {
        logger.warn('Failed to parse additional parameters', {
          params: submission.values.additionalParams
        });
      }
    }

    // Process approval with modifications
    await approvalHandler.processApproval(
      submission.approvalId,
      ApprovalDecision.MODIFY,
      submission.userName,
      modifications
    );

    // Update Slack message
    await updateMessageStatus(
      submission.approvalId,
      submission.channelId,
      submission.messageTs,
      '✅ Approved with Modifications',
      'success',
      modifications
    );

    // Send confirmation to user
    await sendEphemeralMessage(
      submission.channelId,
      submission.userId,
      '✅ Action approved with modifications and executed!'
    );

    logger.info('Modification processed successfully', {
      approvalId: submission.approvalId,
      modifications
    });

  } catch (error: any) {
    logger.error('Error handling modification modal', {
      approvalId: submission.approvalId,
      error: error.message
    });

    // Send error message to user
    await sendEphemeralMessage(
      submission.channelId,
      submission.userId,
      `❌ Error: ${error.message}`
    );
  }
}

/**
 * Handle rejection modal submission
 */
export async function handleRejectionModal(
  submission: SlackModalSubmission
): Promise<void> {
  logger.info('Handling rejection modal submission', {
    approvalId: submission.approvalId,
    userId: submission.userId,
    userName: submission.userName,
    reason: submission.values.rejectionReason
  });

  try {
    // Process approval rejection
    await approvalHandler.processApproval(
      submission.approvalId,
      ApprovalDecision.REJECT,
      submission.userName,
      undefined,
      submission.values.rejectionReason
    );

    // Update Slack message
    await updateMessageStatus(
      submission.approvalId,
      submission.channelId,
      submission.messageTs,
      '❌ Rejected',
      'danger',
      undefined,
      submission.values.rejectionReason
    );

    // Send confirmation to user
    await sendEphemeralMessage(
      submission.channelId,
      submission.userId,
      '✅ Action rejected successfully!'
    );

    logger.info('Rejection processed successfully', {
      approvalId: submission.approvalId,
      reason: submission.values.rejectionReason
    });

  } catch (error: any) {
    logger.error('Error handling rejection modal', {
      approvalId: submission.approvalId,
      error: error.message
    });

    // Send error message to user
    await sendEphemeralMessage(
      submission.channelId,
      submission.userId,
      `❌ Error: ${error.message}`
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Handle approve button
 */
async function handleApprove(interaction: SlackButtonInteraction): Promise<void> {
  // Process approval
  await approvalHandler.processApproval(
    interaction.approvalId,
    ApprovalDecision.APPROVE,
    interaction.userName
  );

  // Update Slack message
  await updateMessageStatus(
    interaction.approvalId,
    interaction.channelId,
    interaction.messageTs,
    '✅ Approved & Executing',
    'success'
  );

  // Send confirmation to user
  await sendEphemeralMessage(
    interaction.channelId,
    interaction.userId,
    '✅ Action approved and executing!'
  );

  logger.info('Approval processed successfully', {
    approvalId: interaction.approvalId,
    decidedBy: interaction.userName
  });
}

/**
 * Open modification modal
 */
async function openModificationModal(
  interaction: SlackButtonInteraction
): Promise<void> {
  if (!interaction.triggerId) {
    throw new Error('No trigger ID provided for modal');
  }

  // Get approval request
  const request = approvalHandler.getApproval(interaction.approvalId);
  if (!request) {
    throw new Error('Approval request not found');
  }

  // Build modal
  const modal = buildModificationModal(request.reasoningResult, interaction.approvalId);

  // Open modal (simulated or real)
  if (currentConfig.simulatedMode) {
    await simulateOpenModal(interaction.triggerId, modal);
  } else {
    await openSlackModal(interaction.triggerId, modal);
  }

  // Track active modal
  activeModals.set(interaction.triggerId, interaction.approvalId);

  logger.info('Modification modal opened', {
    approvalId: interaction.approvalId,
    triggerId: interaction.triggerId
  });
}

/**
 * Open rejection modal
 */
async function openRejectionModal(
  interaction: SlackButtonInteraction
): Promise<void> {
  if (!interaction.triggerId) {
    throw new Error('No trigger ID provided for modal');
  }

  // Build modal
  const modal = buildRejectionModal(interaction.approvalId);

  // Open modal (simulated or real)
  if (currentConfig.simulatedMode) {
    await simulateOpenModal(interaction.triggerId, modal);
  } else {
    await openSlackModal(interaction.triggerId, modal);
  }

  // Track active modal
  activeModals.set(interaction.triggerId, interaction.approvalId);

  logger.info('Rejection modal opened', {
    approvalId: interaction.approvalId,
    triggerId: interaction.triggerId
  });
}

/**
 * Update message status
 */
async function updateMessageStatus(
  approvalId: string,
  channelId: string,
  messageTs: string,
  statusText: string,
  statusType: 'success' | 'warning' | 'danger',
  modifications?: any,
  rejectionReason?: string
): Promise<void> {
  logger.info('Updating message status', {
    approvalId,
    status: statusText,
    statusType
  });

  // Build updated message
  const statusEmoji = {
    success: '✅',
    warning: '⚠️',
    danger: '❌'
  };

  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${statusEmoji[statusType]} ${statusText}`
      }
    }
  ];

  // Add modifications if present
  if (modifications && Object.keys(modifications).length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Modifications Applied:*\n${formatModifications(modifications)}`
      }
    });
  }

  // Add rejection reason if present
  if (rejectionReason) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Rejection Reason:*\n${rejectionReason}`
      }
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Approval ID: \`${approvalId}\` | Updated: <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>`
      }
    ]
  });

  // Update message (simulated or real)
  if (currentConfig.simulatedMode) {
    await simulateUpdateMessage(channelId, messageTs, blocks);
  } else {
    await updateSlackMessage(channelId, messageTs, blocks);
  }
}

// ============================================================================
// MESSAGE BUILDERS
// ============================================================================

/**
 * Build approval message
 */
function buildApprovalMessage(
  reasoningResult: ReasoningResult,
  approvalId: string
): any {
  const blocks: any[] = [];

  // Header
  const priorityEmoji = currentConfig.useEmojis 
    ? PRIORITY_EMOJIS[reasoningResult.priority] || '⚪'
    : '';
  
  const actionEmoji = currentConfig.useEmojis
    ? ACTION_EMOJIS[reasoningResult.action] || '🔔'
    : '';

  // Mentions for critical
  const mentions = 
    reasoningResult.priority === ApprovalPriority.CRITICAL && 
    currentConfig.mentionOnCritical &&
    currentConfig.mentionUsers
      ? currentConfig.mentionUsers.map(u => `<@${u}>`).join(' ') + ' '
      : '';

  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `${priorityEmoji} ${actionEmoji} Action Approval Required`,
      emoji: true
    }
  });

  // Add mention text if needed
  if (mentions) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${mentions}Critical approval needed!`
      }
    });
  }

  // Signal information (if available and enabled)
  if (currentConfig.includeSignalDetails && reasoningResult.signal) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: formatSignalInfo(reasoningResult.signal)
      }
    });
    blocks.push({ type: 'divider' });
  }

  // Reasoning
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Reasoning:*\n${reasoningResult.reasoning}`
    }
  });

  // Proposed action
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: formatProposedAction(reasoningResult)
    }
  });

  // Action details
  const riskEmoji = currentConfig.useEmojis
    ? RISK_EMOJIS[reasoningResult.riskLevel] || '⚪'
    : '';

  blocks.push({
    type: 'section',
    fields: [
      {
        type: 'mrkdwn',
        text: `*Action:*\n\`${reasoningResult.action}\``
      },
      {
        type: 'mrkdwn',
        text: `*Priority:*\n${reasoningResult.priority.toUpperCase()}`
      },
      {
        type: 'mrkdwn',
        text: `*Risk Level:*\n${riskEmoji} ${reasoningResult.riskLevel.toUpperCase()}`
      },
      {
        type: 'mrkdwn',
        text: `*Confidence:*\n${formatConfidence(reasoningResult.confidence)}`
      }
    ]
  });

  // Confidence visualization
  if (currentConfig.showConfidenceBar) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Confidence Score:*\n${buildConfidenceBar(reasoningResult.confidence)}`
      }
    });
  }

  // Parameters
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Parameters:*\n\`\`\`${JSON.stringify(reasoningResult.parameters, null, 2)}\`\`\``
    }
  });

  // Alternatives (if available and enabled)
  if (currentConfig.includeAlternatives && reasoningResult.alternatives && reasoningResult.alternatives.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Alternatives Considered:*\n${reasoningResult.alternatives.map(alt => `• ${alt}`).join('\n')}`
      }
    });
  }

  blocks.push({ type: 'divider' });

  // Action buttons
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '✅ Approve',
          emoji: true
        },
        style: 'primary',
        action_id: 'approve',
        value: approvalId
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '✏️ Approve with Changes',
          emoji: true
        },
        action_id: 'modify',
        value: approvalId
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '❌ Reject',
          emoji: true
        },
        style: 'danger',
        action_id: 'reject',
        value: approvalId
      }
    ]
  });

  // Footer
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Approval ID: \`${approvalId}\` | Created: <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>`
      }
    ]
  });

  return {
    channel: currentConfig.defaultChannel,
    blocks,
    text: `Action approval required: ${reasoningResult.action}`
  };
}

/**
 * Build modification modal
 */
function buildModificationModal(
  reasoningResult: ReasoningResult,
  approvalId: string
): any {
  return {
    type: 'modal',
    callback_id: `modification_${approvalId}`,
    title: {
      type: 'plain_text',
      text: 'Modify Action'
    },
    submit: {
      type: 'plain_text',
      text: 'Approve & Execute'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Modifying:* \`${reasoningResult.action}\``
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'input',
        block_id: 'title_block',
        optional: true,
        element: {
          type: 'plain_text_input',
          action_id: 'title_input',
          placeholder: {
            type: 'plain_text',
            text: 'Leave blank to keep original'
          },
          initial_value: reasoningResult.parameters.title || ''
        },
        label: {
          type: 'plain_text',
          text: 'Title'
        }
      },
      {
        type: 'input',
        block_id: 'priority_block',
        optional: true,
        element: {
          type: 'static_select',
          action_id: 'priority_select',
          placeholder: {
            type: 'plain_text',
            text: 'Select priority'
          },
          options: [
            { text: { type: 'plain_text', text: 'Low' }, value: 'low' },
            { text: { type: 'plain_text', text: 'Medium' }, value: 'medium' },
            { text: { type: 'plain_text', text: 'High' }, value: 'high' },
            { text: { type: 'plain_text', text: 'Critical' }, value: 'critical' }
          ],
          initial_option: reasoningResult.parameters.priority
            ? { text: { type: 'plain_text', text: reasoningResult.parameters.priority }, value: reasoningResult.parameters.priority }
            : undefined
        },
        label: {
          type: 'plain_text',
          text: 'Priority'
        }
      },
      {
        type: 'input',
        block_id: 'assignee_block',
        optional: true,
        element: {
          type: 'plain_text_input',
          action_id: 'assignee_input',
          placeholder: {
            type: 'plain_text',
            text: 'Email or username'
          },
          initial_value: reasoningResult.parameters.assignee || ''
        },
        label: {
          type: 'plain_text',
          text: 'Assignee'
        }
      },
      {
        type: 'input',
        block_id: 'due_date_block',
        optional: true,
        element: {
          type: 'plain_text_input',
          action_id: 'due_date_input',
          placeholder: {
            type: 'plain_text',
            text: 'YYYY-MM-DD'
          },
          initial_value: reasoningResult.parameters.dueDate || ''
        },
        label: {
          type: 'plain_text',
          text: 'Due Date'
        }
      },
      {
        type: 'input',
        block_id: 'additional_params_block',
        optional: true,
        element: {
          type: 'plain_text_input',
          action_id: 'additional_params_input',
          multiline: true,
          placeholder: {
            type: 'plain_text',
            text: 'JSON format: {"key": "value"}'
          }
        },
        label: {
          type: 'plain_text',
          text: 'Additional Parameters (JSON)'
        }
      }
    ]
  };
}

/**
 * Build rejection modal
 */
function buildRejectionModal(approvalId: string): any {
  return {
    type: 'modal',
    callback_id: `rejection_${approvalId}`,
    title: {
      type: 'plain_text',
      text: 'Reject Action'
    },
    submit: {
      type: 'plain_text',
      text: 'Reject'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '⚠️ *You are about to reject this action.*\n\nPlease provide a reason to help improve future decisions.'
        }
      },
      {
        type: 'input',
        block_id: 'rejection_reason_block',
        element: {
          type: 'plain_text_input',
          action_id: 'rejection_reason_input',
          multiline: true,
          placeholder: {
            type: 'plain_text',
            text: 'Why are you rejecting this action?'
          }
        },
        label: {
          type: 'plain_text',
          text: 'Rejection Reason'
        }
      }
    ]
  };
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format signal information
 */
function formatSignalInfo(signal: SignalInfo): string {
  let text = '*Signal Information:*\n';
  text += `• *Source:* ${signal.source}\n`;
  text += `• *Subject:* ${signal.subject}\n`;
  
  if (signal.sender) {
    text += `• *From:* ${signal.sender}\n`;
  }
  
  if (signal.channel) {
    text += `• *Channel:* ${signal.channel}\n`;
  }
  
  text += `• *Content:* ${signal.content}`;
  
  return text;
}

/**
 * Format proposed action
 */
function formatProposedAction(reasoningResult: ReasoningResult): string {
  const actionParts = reasoningResult.action.split(':');
  const service = actionParts[0] || 'Unknown';
  const operation = actionParts[1] || 'Unknown';

  let text = '*Proposed Action:*\n';
  text += `• *Service:* ${service.charAt(0).toUpperCase() + service.slice(1)}\n`;
  text += `• *Operation:* ${operation.charAt(0).toUpperCase() + operation.slice(1)}\n`;
  
  // Add key parameters
  if (reasoningResult.parameters.title) {
    text += `• *Title:* ${reasoningResult.parameters.title}\n`;
  }
  
  if (reasoningResult.parameters.database) {
    text += `• *Database:* ${reasoningResult.parameters.database}\n`;
  }
  
  if (reasoningResult.parameters.board) {
    text += `• *Board:* ${reasoningResult.parameters.board}\n`;
  }
  
  return text;
}

/**
 * Format confidence score
 */
function formatConfidence(confidence: number): string {
  const percentage = (confidence * 100).toFixed(0);
  
  if (confidence >= 0.9) {
    return `${percentage}% 🟢`;
  } else if (confidence >= 0.7) {
    return `${percentage}% 🟡`;
  } else if (confidence >= 0.5) {
    return `${percentage}% 🟠`;
  } else {
    return `${percentage}% 🔴`;
  }
}

/**
 * Build confidence bar visualization
 */
function buildConfidenceBar(confidence: number): string {
  const percentage = confidence * 100;
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;
  
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  
  let color = '';
  if (confidence >= 0.9) {
    color = '🟢';
  } else if (confidence >= 0.7) {
    color = '🟡';
  } else if (confidence >= 0.5) {
    color = '🟠';
  } else {
    color = '🔴';
  }
  
  return `${bar} ${percentage.toFixed(0)}% ${color}`;
}

/**
 * Format modifications
 */
function formatModifications(modifications: any): string {
  return Object.entries(modifications)
    .map(([key, value]) => `• *${key}:* ${value}`)
    .join('\n');
}

// ============================================================================
// SLACK API FUNCTIONS (SIMULATED)
// ============================================================================

/**
 * Simulate sending Slack message
 */
async function simulateSendMessage(
  channel: string,
  message: any
): Promise<SlackMessageResponse> {
  logger.info('Simulating Slack message send', { channel });
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const ts = `${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    success: true,
    channel,
    ts,
    permalink: `https://slack.com/archives/${channel}/p${ts.replace('.', '')}`
  };
}

/**
 * Simulate opening modal
 */
async function simulateOpenModal(triggerId: string, modal: any): Promise<void> {
  logger.info('Simulating modal open', { 
    triggerId,
    callbackId: modal.callback_id 
  });
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * Simulate updating message
 */
async function simulateUpdateMessage(
  channel: string,
  ts: string,
  blocks: any[]
): Promise<void> {
  logger.info('Simulating message update', { channel, ts });
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * Send ephemeral message (visible only to user)
 */
async function sendEphemeralMessage(
  channel: string,
  userId: string,
  text: string
): Promise<void> {
  logger.info('Sending ephemeral message', { channel, userId, text });
  
  if (currentConfig.simulatedMode) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 50));
  } else {
    // Would use real Slack API here
    // await slack.chat.postEphemeral({ channel, user: userId, text });
  }
}

/**
 * Send actual Slack message (placeholder for real implementation)
 */
async function sendSlackMessage(
  channel: string,
  message: any
): Promise<SlackMessageResponse> {
  // TODO: Implement real Slack API call
  // const response = await slack.chat.postMessage({
  //   channel,
  //   ...message
  // });
  
  throw new Error('Real Slack API not implemented. Use simulated mode.');
}

/**
 * Open actual Slack modal (placeholder for real implementation)
 */
async function openSlackModal(triggerId: string, modal: any): Promise<void> {
  // TODO: Implement real Slack API call
  // await slack.views.open({
  //   trigger_id: triggerId,
  //   view: modal
  // });
  
  throw new Error('Real Slack API not implemented. Use simulated mode.');
}

/**
 * Update actual Slack message (placeholder for real implementation)
 */
async function updateSlackMessage(
  channel: string,
  ts: string,
  blocks: any[]
): Promise<void> {
  // TODO: Implement real Slack API call
  // await slack.chat.update({
  //   channel,
  //   ts,
  //   blocks
  // });
  
  throw new Error('Real Slack API not implemented. Use simulated mode.');
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configure Slack approval interface
 */
export function configure(config: Partial<SlackApprovalConfig>): void {
  currentConfig = {
    ...currentConfig,
    ...config
  };

  logger.info('Slack approval interface configured', { config: currentConfig });
}

/**
 * Get current configuration
 */
export function getConfig(): SlackApprovalConfig {
  return { ...currentConfig };
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Enable Slack integration
 */
export function enable(): void {
  currentConfig.enabled = true;
  logger.info('Slack integration enabled');
}

/**
 * Disable Slack integration
 */
export function disable(): void {
  currentConfig.enabled = false;
  logger.info('Slack integration disabled');
}

/**
 * Check if enabled
 */
export function isEnabled(): boolean {
  return currentConfig.enabled;
}

/**
 * Set simulated mode
 */
export function setSimulatedMode(enabled: boolean): void {
  currentConfig.simulatedMode = enabled;
  logger.info(`Simulated mode ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Clear message cache
 */
export function clearMessageCache(): void {
  messageCache.clear();
  logger.info('Message cache cleared');
}

/**
 * Clear active modals
 */
export function clearActiveModals(): void {
  activeModals.clear();
  logger.info('Active modals cleared');
}

/**
 * Clean up
 */
export function destroy(): void {
  messageCache.clear();
  activeModals.clear();
  logger.info('Slack approval interface destroyed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Core functions
  sendApprovalRequest,
  handleApprovalButton,
  handleModificationModal,
  handleRejectionModal,

  // Configuration
  configure,
  getConfig,

  // Utilities
  enable,
  disable,
  isEnabled,
  setSimulatedMode,
  clearMessageCache,
  clearActiveModals,
  destroy
};
