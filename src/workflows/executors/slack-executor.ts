/**
 * Slack Notification Sender
 * 
 * Sends formatted notifications to Slack using Block Kit for rich formatting.
 * Supports task notifications, approval requests, DMs, reactions, and rate limiting.
 * 
 * Features:
 * - Rich Block Kit formatting with priority indicators
 * - Task creation notifications
 * - Approval requests for human review
 * - Direct messages for mentions
 * - Reaction-based status updates
 * - Rate limiting (1 message/second)
 * - Comprehensive logging
 */

import { config } from '../../config';
import logger from '../../utils/logger';
import { TaskDetails, ExecutionResult } from '../../types';
import { logExecutionStart, logExecutionSuccess, logExecutionFailure } from '../execution-logger';

// ============================================================================
// Configuration
// ============================================================================

const SLACK_BOT_TOKEN = config.SLACK_BOT_TOKEN;
const SLACK_NOTIFICATIONS_CHANNEL = config.SLACK_NOTIFICATIONS_CHANNEL;
const SLACK_API_BASE = 'https://slack.com/api';

// Rate limiting: 1 message per second
const RATE_LIMIT_MS = 1000;
let lastMessageTime = 0;

// Priority indicators
const PRIORITY_INDICATORS: Record<string, string> = {
    'Critical': '🔴',
    'High': '🟡',
    'Medium': '🟢',
    'Low': '⚪',
};

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface SlackMessage {
    channel: string;
    text: string;
    blocks?: any[];
    thread_ts?: string;
    username?: string;
    icon_emoji?: string;
}

export interface SlackNotificationParams {
    channel?: string;
    priority?: string;
    source?: string;
    subject?: string;
    keyPoints?: string[];
    actionTaken?: string;
    taskUrl?: string;
    signalUrl?: string;
    mentions?: string[];
    threadTs?: string;
    correlationId?: string;
    actionId?: string;
}

export interface ApprovalRequest {
    reasoningResult: any;
    approvalMessage: string;
    context?: Record<string, any>;
}

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Wait to ensure rate limiting compliance (1 message/second)
 */
async function waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastMessage = now - lastMessageTime;
    
    if (timeSinceLastMessage < RATE_LIMIT_MS) {
        const waitTime = RATE_LIMIT_MS - timeSinceLastMessage;
        logger.debug('Rate limiting: waiting', { waitTime });
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastMessageTime = Date.now();
}

// ============================================================================
// Slack API Helper
// ============================================================================

/**
 * Make a request to the Slack API
 */
async function slackApiRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'POST',
    data?: any
): Promise<any> {
    if (!SLACK_BOT_TOKEN) {
        throw new Error('SLACK_BOT_TOKEN not configured');
    }

    const url = `${SLACK_API_BASE}/${endpoint}`;
    
    const options: RequestInit = {
        method,
        headers: {
            'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
            'Content-Type': 'application/json; charset=utf-8',
        },
    };

    if (data && method === 'POST') {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errorText = await response.text();
            logger.error('Slack API request failed', {
                endpoint,
                status: response.status,
                error: errorText,
            });
            throw new Error(`Slack API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        
        // Slack API returns ok: false for errors
        if (!result.ok) {
            logger.error('Slack API returned error', {
                endpoint,
                error: result.error,
                details: result,
            });
            throw new Error(`Slack API error: ${result.error}`);
        }

        return result;
    } catch (error) {
        logger.error('Slack API request error', { endpoint, error });
        throw error;
    }
}

// ============================================================================
// Block Kit Builders
// ============================================================================

/**
 * Build a header block with priority indicator
 */
function buildHeaderBlock(title: string, priority?: string): any {
    const indicator = priority ? PRIORITY_INDICATORS[priority] || '🔵' : '🔵';
    return {
        type: 'header',
        text: {
            type: 'plain_text',
            text: `${indicator} ${title}`,
            emoji: true
        }
    };
}

/**
 * Build a section block with text
 */
function buildSectionBlock(text: string, markdown: boolean = true): any {
    return {
        type: 'section',
        text: {
            type: markdown ? 'mrkdwn' : 'plain_text',
            text: text
        }
    };
}

/**
 * Build a context block (gray text)
 */
function buildContextBlock(elements: string[]): any {
    return {
        type: 'context',
        elements: elements.map(text => ({
            type: 'mrkdwn',
            text: text
        }))
    };
}

/**
 * Build a divider block
 */
function buildDividerBlock(): any {
    return { type: 'divider' };
}

/**
 * Build a button action block
 */
function buildButtonBlock(text: string, url: string, style?: 'primary' | 'danger'): any {
    return {
        type: 'actions',
        elements: [
            {
                type: 'button',
                text: {
                    type: 'plain_text',
                    text: text,
                    emoji: true
                },
                url: url,
                style: style
            }
        ]
    };
}

// ============================================================================
// Core Notification Functions
// ============================================================================

/**
 * Send a notification message with rich formatting
 * 
 * @param message - Plain text message (fallback)
 * @param params - Notification parameters
 * @returns Execution result with message timestamp
 * 
 * @example
 * await sendNotification('Task created', {
 *   priority: 'High',
 *   source: 'Email',
 *   subject: 'Bug report',
 *   actionTaken: 'Created Trello card',
 *   taskUrl: 'https://trello.com/c/abc123'
 * });
 */
export async function sendNotification(
    message: string,
    params: SlackNotificationParams = {}
): Promise<ExecutionResult> {
    const actionId = params.actionId || 'unknown';
    const startTime = Date.now();

    try {
        // Log execution start
        await logExecutionStart(
            actionId,
            params.correlationId || '',
            'send_notification',
            'slack',
            { message, ...params }
        );

        // Apply rate limiting
        await waitForRateLimit();

        // Determine channel
        const channel = params.channel || SLACK_NOTIFICATIONS_CHANNEL;
        if (!channel) {
            throw new Error('Slack channel not specified and SLACK_NOTIFICATIONS_CHANNEL not configured');
        }

        // Build blocks for rich formatting
        const blocks: any[] = [];

        // Header
        if (params.subject) {
            blocks.push(buildHeaderBlock(params.subject, params.priority));
        }

        // Signal summary section
        if (params.source || params.keyPoints) {
            const summaryParts: string[] = [];
            
            if (params.source) {
                summaryParts.push(`*Source:* ${params.source}`);
            }
            
            if (params.keyPoints && params.keyPoints.length > 0) {
                summaryParts.push('*Key Points:*');
                params.keyPoints.forEach(point => {
                    summaryParts.push(`• ${point}`);
                });
            }
            
            if (summaryParts.length > 0) {
                blocks.push(buildSectionBlock(summaryParts.join('\n')));
            }
        }

        // Action taken
        if (params.actionTaken) {
            blocks.push(buildSectionBlock(`*Action Taken:* ${params.actionTaken}`));
        }

        // Main message
        if (message && !params.subject) {
            blocks.push(buildSectionBlock(message));
        }

        // Divider before links
        if (params.taskUrl || params.signalUrl) {
            blocks.push(buildDividerBlock());
        }

        // Links section
        const links: string[] = [];
        if (params.taskUrl) {
            links.push(`<${params.taskUrl}|View Task>`);
        }
        if (params.signalUrl) {
            links.push(`<${params.signalUrl}|View Original Signal>`);
        }
        if (links.length > 0) {
            blocks.push(buildContextBlock(links));
        }

        // Send message
        logger.info('Sending Slack notification', {
            channel,
            blocksCount: blocks.length,
            hasThread: !!params.threadTs
        });

        const payload: SlackMessage = {
            channel,
            text: message, // Fallback text
            blocks
        };

        if (params.threadTs) {
            payload.thread_ts = params.threadTs;
        }

        const result = await slackApiRequest('chat.postMessage', 'POST', payload);

        // Handle mentions with DMs
        if (params.mentions && params.mentions.length > 0) {
            await handleMentions(params.mentions, message, params);
        }

        const executionTime = Date.now() - startTime;

        // Log success
        await logExecutionSuccess(
            actionId,
            params.correlationId || '',
            'send_notification',
            'slack',
            { message, ...params },
            {
                messageTs: result.ts,
                channel: result.channel,
            },
            executionTime
        );

        logger.info('Slack notification sent successfully', {
            channel,
            messageTs: result.ts,
            executionTime
        });

        return {
            success: true,
            data: {
                messageTs: result.ts,
                channel: result.channel,
                permalink: result.message?.permalink
            }
        };

    } catch (error) {
        const executionTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Log failure
        await logExecutionFailure(
            actionId,
            params.correlationId || '',
            'send_notification',
            'slack',
            { message, ...params },
            errorMessage,
            executionTime
        );

        logger.error('Failed to send Slack notification', {
            error: errorMessage,
            params
        });

        return {
            success: false,
            error: errorMessage
        };
    }
}

/**
 * Send a task created notification with formatted details
 * 
 * @param taskDetails - Task information
 * @param taskUrl - URL to the created task
 * @param params - Additional parameters
 * @returns Execution result with message timestamp
 * 
 * @example
 * await sendTaskCreated({
 *   title: 'Fix login bug',
 *   priority: 'High',
 *   source: 'Email',
 *   assignee: 'john@example.com'
 * }, 'https://trello.com/c/abc123');
 */
export async function sendTaskCreated(
    taskDetails: TaskDetails,
    taskUrl: string,
    params: any = {}
): Promise<ExecutionResult> {
    const actionId = params.actionId || params.id || 'unknown';
    const startTime = Date.now();

    try {
        // Log execution start
        await logExecutionStart(
            actionId,
            params.correlationId || '',
            'send_task_created',
            'slack',
            { taskDetails, taskUrl }
        );

        // Apply rate limiting
        await waitForRateLimit();

        // Determine channel
        const channel = params.channel || SLACK_NOTIFICATIONS_CHANNEL;
        if (!channel) {
            throw new Error('Slack channel not specified and SLACK_NOTIFICATIONS_CHANNEL not configured');
        }

        // Build blocks
        const blocks: any[] = [];

        // Header
        blocks.push(buildHeaderBlock('✅ Task Created', taskDetails.priority));

        // Task details
        const detailsParts: string[] = [
            `*Title:* ${taskDetails.title}`
        ];

        if (taskDetails.description) {
            detailsParts.push(`*Description:* ${taskDetails.description.substring(0, 200)}${taskDetails.description.length > 200 ? '...' : ''}`);
        }

        if (taskDetails.priority) {
            detailsParts.push(`*Priority:* ${taskDetails.priority}`);
        }

        if (taskDetails.source) {
            detailsParts.push(`*Source:* ${taskDetails.source}`);
        }

        if (taskDetails.assignee) {
            detailsParts.push(`*Assignee:* ${taskDetails.assignee}`);
        }

        if (taskDetails.dueDate) {
            detailsParts.push(`*Due Date:* ${taskDetails.dueDate}`);
        }

        if (taskDetails.labels && taskDetails.labels.length > 0) {
            detailsParts.push(`*Labels:* ${taskDetails.labels.join(', ')}`);
        }

        blocks.push(buildSectionBlock(detailsParts.join('\n')));

        // Link to task
        blocks.push(buildDividerBlock());
        blocks.push(buildButtonBlock('View Task', taskUrl, 'primary'));

        // Send message
        logger.info('Sending task created notification', { channel, taskTitle: taskDetails.title });

        const result = await slackApiRequest('chat.postMessage', 'POST', {
            channel,
            text: `Task created: ${taskDetails.title}`,
            blocks
        });

        const executionTime = Date.now() - startTime;

        // Log success
        await logExecutionSuccess(
            actionId,
            params.correlationId || '',
            'send_task_created',
            'slack',
            { taskDetails, taskUrl },
            {
                messageTs: result.ts,
                channel: result.channel,
            },
            executionTime
        );

        logger.info('Task created notification sent', {
            channel,
            messageTs: result.ts,
            taskTitle: taskDetails.title,
            executionTime
        });

        return {
            success: true,
            data: {
                messageTs: result.ts,
                channel: result.channel
            }
        };

    } catch (error) {
        const executionTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Log failure
        await logExecutionFailure(
            actionId,
            params.correlationId || '',
            'send_task_created',
            'slack',
            { taskDetails, taskUrl },
            errorMessage,
            executionTime
        );

        logger.error('Failed to send task created notification', {
            error: errorMessage,
            taskTitle: taskDetails.title
        });

        return {
            success: false,
            error: errorMessage
        };
    }
}

/**
 * Send an approval request for human review
 * 
 * @param reasoningResult - The reasoning result requiring approval
 * @param params - Additional parameters
 * @returns Execution result with message timestamp
 * 
 * @example
 * await sendApprovalRequest({
 *   correlationId: 'corr-123',
 *   action: 'create_task',
 *   confidence: 0.75,
 *   params: { title: 'Complex task' }
 * });
 */
export async function sendApprovalRequest(
    reasoningResult: any,
    params: any = {}
): Promise<ExecutionResult> {
    const actionId = params.actionId || 'unknown';
    const startTime = Date.now();

    try {
        // Log execution start
        await logExecutionStart(
            actionId,
            reasoningResult.correlationId || '',
            'send_approval_request',
            'slack',
            { reasoningResult }
        );

        // Apply rate limiting
        await waitForRateLimit();

        // Determine channel
        const channel = params.channel || SLACK_NOTIFICATIONS_CHANNEL;
        if (!channel) {
            throw new Error('Slack channel not specified and SLACK_NOTIFICATIONS_CHANNEL not configured');
        }

        // Build blocks
        const blocks: any[] = [];

        // Header
        blocks.push(buildHeaderBlock('⚠️ Approval Required', 'High'));

        // Reasoning summary
        const summaryParts: string[] = [
            `*Action:* ${reasoningResult.action || 'Unknown'}`,
            `*Target:* ${reasoningResult.target || 'N/A'}`,
        ];

        if (reasoningResult.confidence !== undefined) {
            summaryParts.push(`*Confidence:* ${(reasoningResult.confidence * 100).toFixed(0)}%`);
        }

        if (reasoningResult.reasoning) {
            summaryParts.push(`*Reasoning:* ${reasoningResult.reasoning}`);
        }

        blocks.push(buildSectionBlock(summaryParts.join('\n')));

        // Parameters
        if (reasoningResult.params) {
            blocks.push(buildSectionBlock(`\`\`\`${JSON.stringify(reasoningResult.params, null, 2)}\`\`\``));
        }

        // Context
        blocks.push(buildContextBlock([
            `Correlation ID: ${reasoningResult.correlationId}`,
            `Requested at: ${new Date().toISOString()}`
        ]));

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
                    value: `approve_${reasoningResult.correlationId}`,
                    action_id: 'approve_action'
                },
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: '❌ Reject',
                        emoji: true
                    },
                    style: 'danger',
                    value: `reject_${reasoningResult.correlationId}`,
                    action_id: 'reject_action'
                }
            ]
        });

        // Send message
        logger.info('Sending approval request', { channel, correlationId: reasoningResult.correlationId });

        const result = await slackApiRequest('chat.postMessage', 'POST', {
            channel,
            text: `Approval required for: ${reasoningResult.action}`,
            blocks
        });

        const executionTime = Date.now() - startTime;

        // Log success
        await logExecutionSuccess(
            actionId,
            reasoningResult.correlationId || '',
            'send_approval_request',
            'slack',
            { reasoningResult },
            {
                messageTs: result.ts,
                channel: result.channel,
            },
            executionTime
        );

        logger.info('Approval request sent', {
            channel,
            messageTs: result.ts,
            correlationId: reasoningResult.correlationId,
            executionTime
        });

        return {
            success: true,
            data: {
                messageTs: result.ts,
                channel: result.channel
            }
        };

    } catch (error) {
        const executionTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Log failure
        await logExecutionFailure(
            actionId,
            reasoningResult.correlationId || '',
            'send_approval_request',
            'slack',
            { reasoningResult },
            errorMessage,
            executionTime
        );

        logger.error('Failed to send approval request', {
            error: errorMessage,
            correlationId: reasoningResult.correlationId
        });

        return {
            success: false,
            error: errorMessage
        };
    }
}

/**
 * Add a reaction emoji to a message
 * 
 * @param channel - Channel ID
 * @param timestamp - Message timestamp
 * @param emoji - Emoji name (without colons)
 * @returns Execution result
 * 
 * @example
 * await addReaction('C123456', '1234567890.123456', 'white_check_mark');
 * await addReaction('C123456', '1234567890.123456', 'eyes'); // 👀
 */
export async function addReaction(
    channel: string,
    timestamp: string,
    emoji: string
): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
        // Apply rate limiting
        await waitForRateLimit();

        logger.info('Adding reaction to message', { channel, timestamp, emoji });

        const result = await slackApiRequest('reactions.add', 'POST', {
            channel,
            timestamp,
            name: emoji
        });

        logger.info('Reaction added successfully', {
            channel,
            timestamp,
            emoji
        });

        return {
            success: true,
            data: result
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.error('Failed to add reaction', {
            error: errorMessage,
            channel,
            timestamp,
            emoji
        });

        return {
            success: false,
            error: errorMessage
        };
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Handle @mentions by sending DMs with context
 */
async function handleMentions(
    mentions: string[],
    message: string,
    context: SlackNotificationParams
): Promise<void> {
    for (const userId of mentions) {
        try {
            // Apply rate limiting for each DM
            await waitForRateLimit();

            // Build DM blocks
            const blocks: any[] = [];

            blocks.push(buildHeaderBlock('📢 You were mentioned', 'Medium'));

            blocks.push(buildSectionBlock(`You were mentioned in a notification:\n\n${message}`));

            if (context.taskUrl) {
                blocks.push(buildButtonBlock('View Task', context.taskUrl, 'primary'));
            }

            // Send DM
            await slackApiRequest('chat.postMessage', 'POST', {
                channel: userId,
                text: `You were mentioned: ${message}`,
                blocks
            });

            logger.info('Sent mention DM', { userId });

        } catch (error) {
            logger.error('Failed to send mention DM', {
                userId,
                error: error instanceof Error ? error.message : String(error)
            });
            // Continue with other mentions even if one fails
        }
    }
}

/**
 * Get user ID from email
 * Useful for converting email addresses to Slack user IDs
 */
export async function getUserIdFromEmail(email: string): Promise<string | null> {
    try {
        const result = await slackApiRequest('users.lookupByEmail', 'GET', { email });
        return result.user?.id || null;
    } catch (error) {
        logger.error('Failed to lookup user by email', {
            email,
            error: error instanceof Error ? error.message : String(error)
        });
        return null;
    }
}

/**
 * Get channel info
 */
export async function getChannelInfo(channel: string): Promise<any> {
    try {
        const result = await slackApiRequest('conversations.info', 'GET', { channel });
        return result.channel;
    } catch (error) {
        logger.error('Failed to get channel info', {
            channel,
            error: error instanceof Error ? error.message : String(error)
        });
        return null;
    }
}

/**
 * Update an existing message
 */
export async function updateMessage(
    channel: string,
    timestamp: string,
    message: string,
    blocks?: any[]
): Promise<ExecutionResult> {
    try {
        await waitForRateLimit();

        const result = await slackApiRequest('chat.update', 'POST', {
            channel,
            ts: timestamp,
            text: message,
            blocks
        });

        logger.info('Message updated', { channel, timestamp });

        return {
            success: true,
            data: result
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to update message', { error: errorMessage });
        return {
            success: false,
            error: errorMessage
        };
    }
}

/**
 * Delete a message
 */
export async function deleteMessage(channel: string, timestamp: string): Promise<ExecutionResult> {
    try {
        await waitForRateLimit();

        const result = await slackApiRequest('chat.delete', 'POST', {
            channel,
            ts: timestamp
        });

        logger.info('Message deleted', { channel, timestamp });

        return {
            success: true,
            data: result
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to delete message', { error: errorMessage });
        return {
            success: false,
            error: errorMessage
        };
    }
}
