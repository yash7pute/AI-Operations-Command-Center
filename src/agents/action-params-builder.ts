/**
 * Action Parameter Builder
 * 
 * Builds platform-specific parameters for different action types:
 * - Notion tasks with rich properties
 * - Trello cards with labels and positioning
 * - Slack notifications with blocks and threading
 * - Drive file organization with folder management
 * 
 * Features:
 * - Platform-specific parameter construction
 * - Field validation and required field checking
 * - Default value application
 * - Comprehensive logging
 */

import logger from '../utils/logger';
import type { Signal } from './reasoning/context-builder';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Action types supported by the system
 */
export type ActionType = 
    | 'create_task' 
    | 'send_notification' 
    | 'update_document' 
    | 'schedule_meeting' 
    | 'organize_file';

/**
 * Platform types for actions
 */
export type PlatformType = 'notion' | 'trello' | 'slack' | 'drive' | 'gmail' | 'sheets';

/**
 * Task details for parameter building
 */
export interface TaskDetails {
    /** Task title/name */
    title: string;
    
    /** Task description */
    description?: string;
    
    /** Assignee email or ID */
    assignee?: string;
    
    /** Due date (ISO string) */
    dueDate?: string;
    
    /** Priority level */
    priority?: 'High' | 'Medium' | 'Low';
    
    /** Task status */
    status?: string;
    
    /** Labels/tags */
    labels?: string[];
    
    /** Source platform */
    source?: 'Email' | 'Slack' | 'Sheet';
    
    /** Additional metadata */
    metadata?: Record<string, any>;
}

/**
 * Notion task properties
 */
export interface NotionTaskParams {
    /** Database ID where task will be created */
    databaseId: string;
    
    /** Notion-specific properties */
    properties: {
        Title: { title: [{ text: { content: string } }] };
        Status: { select: { name: string } };
        Priority: { select: { name: 'High' | 'Medium' | 'Low' } };
        'Due Date': { date: { start: string } };
        Description: { rich_text: [{ text: { content: string } }] };
        Source: { select: { name: 'Email' | 'Slack' | 'Sheet' } };
        Assignee?: { people: [{ id: string }] };
    };
}

/**
 * Trello card properties
 */
export interface TrelloCardParams {
    /** List ID where card will be created */
    listId: string;
    
    /** Card name/title */
    name: string;
    
    /** Card description */
    desc: string;
    
    /** Due date (ISO string) */
    due: string;
    
    /** Label IDs */
    idLabels: string[];
    
    /** Position in list */
    pos: 'top' | 'bottom';
    
    /** Source URL */
    urlSource: string;
}

/**
 * Slack notification properties
 */
export interface SlackNotificationParams {
    /** Channel ID or name */
    channel: string;
    
    /** Message blocks */
    blocks: Array<{
        type: 'section' | 'header' | 'divider' | 'context';
        text?: {
            type: 'mrkdwn' | 'plain_text';
            text: string;
        };
        fields?: Array<{
            type: 'mrkdwn';
            text: string;
        }>;
    }>;
    
    /** Thread timestamp for replies */
    thread_ts?: string;
    
    /** Additional text for notifications */
    text?: string;
}

/**
 * Drive file organization properties
 */
export interface DriveFileParams {
    /** File ID to organize */
    fileId: string;
    
    /** Target folder ID */
    folderId: string;
    
    /** File name */
    name: string;
    
    /** Optional description */
    description?: string;
}

/**
 * Generic action parameters
 */
export type ActionParams = 
    | NotionTaskParams 
    | TrelloCardParams 
    | SlackNotificationParams 
    | DriveFileParams;

/**
 * Parameter building result
 */
export interface ParamsBuildResult {
    /** Whether building was successful */
    success: boolean;
    
    /** Built parameters */
    params?: ActionParams;
    
    /** Error message if failed */
    error?: string;
    
    /** Missing required fields */
    missingFields?: string[];
    
    /** Validation warnings */
    warnings?: string[];
}

/**
 * Configuration for parameter building
 */
export interface ParamsBuilderConfig {
    /** Notion database ID */
    notionDatabaseId?: string;
    
    /** Trello default list ID */
    trelloDefaultListId?: string;
    
    /** Slack default channel */
    slackDefaultChannel?: string;
    
    /** Drive default folder ID */
    driveDefaultFolderId?: string;
    
    /** Label mappings for priority */
    priorityLabelMappings?: Record<string, string>;
}

// ============================================================================
// Action Parameter Builder Class
// ============================================================================

/**
 * Builds platform-specific parameters for actions
 */
export class ActionParamsBuilder {
    private static instance: ActionParamsBuilder;
    private config: ParamsBuilderConfig;

    private constructor(config: ParamsBuilderConfig = {}) {
        this.config = {
            notionDatabaseId: config.notionDatabaseId || process.env.NOTION_DATABASE_ID || '',
            trelloDefaultListId: config.trelloDefaultListId || process.env.TRELLO_DEFAULT_LIST_ID || '',
            slackDefaultChannel: config.slackDefaultChannel || process.env.SLACK_DEFAULT_CHANNEL || '#general',
            driveDefaultFolderId: config.driveDefaultFolderId || process.env.DRIVE_DEFAULT_FOLDER_ID || '',
            priorityLabelMappings: config.priorityLabelMappings || {
                'High': 'urgent',
                'Medium': 'normal',
                'Low': 'low-priority',
            },
        };

        logger.info('[ActionParamsBuilder] Initialized', {
            hasNotionDb: !!this.config.notionDatabaseId,
            hasTrelloList: !!this.config.trelloDefaultListId,
            slackChannel: this.config.slackDefaultChannel,
            hasDriveFolder: !!this.config.driveDefaultFolderId,
        });
    }

    /**
     * Get singleton instance
     */
    public static getInstance(config?: ParamsBuilderConfig): ActionParamsBuilder {
        if (!ActionParamsBuilder.instance) {
            ActionParamsBuilder.instance = new ActionParamsBuilder(config);
        }
        return ActionParamsBuilder.instance;
    }

    /**
     * Build parameters for an action
     */
    public buildParams(
        action: ActionType,
        platform: PlatformType,
        taskDetails: TaskDetails,
        signal: Signal
    ): ParamsBuildResult {
        logger.info('[ActionParamsBuilder] Building parameters', {
            action,
            platform,
            signalId: signal.id,
            hasTitle: !!taskDetails.title,
        });

        try {
            // Route to appropriate builder based on platform
            let result: ParamsBuildResult;

            switch (platform) {
                case 'notion':
                    result = this.buildNotionParams(taskDetails, signal);
                    break;
                case 'trello':
                    result = this.buildTrelloParams(taskDetails, signal);
                    break;
                case 'slack':
                    result = this.buildSlackParams(taskDetails, signal);
                    break;
                case 'drive':
                    result = this.buildDriveParams(taskDetails, signal);
                    break;
                default:
                    logger.warn('[ActionParamsBuilder] Unsupported platform', { platform });
                    return {
                        success: false,
                        error: `Unsupported platform: ${platform}`,
                    };
            }

            if (result.success) {
                logger.info('[ActionParamsBuilder] Parameters built successfully', {
                    action,
                    platform,
                    signalId: signal.id,
                    warnings: result.warnings?.length || 0,
                });
            } else {
                logger.error('[ActionParamsBuilder] Failed to build parameters', {
                    action,
                    platform,
                    signalId: signal.id,
                    error: result.error,
                    missingFields: result.missingFields,
                });
            }

            return result;
        } catch (error) {
            logger.error('[ActionParamsBuilder] Error building parameters', {
                action,
                platform,
                signalId: signal.id,
                error: error instanceof Error ? error.message : String(error),
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Build Notion task parameters
     */
    private buildNotionParams(taskDetails: TaskDetails, signal: Signal): ParamsBuildResult {
        const warnings: string[] = [];
        const missingFields: string[] = [];

        // Validate required fields
        if (!taskDetails.title) {
            missingFields.push('title');
        }

        if (!this.config.notionDatabaseId) {
            missingFields.push('notionDatabaseId (config)');
        }

        if (missingFields.length > 0) {
            return {
                success: false,
                error: 'Missing required fields for Notion task',
                missingFields,
            };
        }

        // Apply defaults
        const priority = taskDetails.priority || 'Medium';
        const status = taskDetails.status || 'Not Started';
        const description = taskDetails.description || signal.body || 'No description provided';
        const source = this.mapSignalSourceToNotion(signal.source);
        const dueDate = taskDetails.dueDate || this.getDefaultDueDate();

        if (!taskDetails.priority) {
            warnings.push('Priority not specified, using default: Medium');
        }

        if (!taskDetails.dueDate) {
            warnings.push('Due date not specified, using default: 7 days from now');
        }

        // Build Notion properties
        const params: NotionTaskParams = {
            databaseId: this.config.notionDatabaseId!,
            properties: {
                Title: {
                    title: [{ text: { content: taskDetails.title } }],
                },
                Status: {
                    select: { name: status },
                },
                Priority: {
                    select: { name: priority },
                },
                'Due Date': {
                    date: { start: dueDate },
                },
                Description: {
                    rich_text: [{ text: { content: description } }],
                },
                Source: {
                    select: { name: source },
                },
            },
        };

        // Add assignee if provided
        if (taskDetails.assignee) {
            params.properties.Assignee = {
                people: [{ id: taskDetails.assignee }],
            };
        } else {
            warnings.push('No assignee specified');
        }

        logger.debug('[ActionParamsBuilder] Built Notion parameters', {
            title: taskDetails.title,
            priority,
            status,
            dueDate,
            source,
            hasAssignee: !!taskDetails.assignee,
        });

        return {
            success: true,
            params,
            warnings: warnings.length > 0 ? warnings : undefined,
        };
    }

    /**
     * Build Trello card parameters
     */
    private buildTrelloParams(taskDetails: TaskDetails, signal: Signal): ParamsBuildResult {
        const warnings: string[] = [];
        const missingFields: string[] = [];

        // Validate required fields
        if (!taskDetails.title) {
            missingFields.push('title');
        }

        if (!this.config.trelloDefaultListId) {
            missingFields.push('trelloDefaultListId (config)');
        }

        if (missingFields.length > 0) {
            return {
                success: false,
                error: 'Missing required fields for Trello card',
                missingFields,
            };
        }

        // Apply defaults
        const description = taskDetails.description || signal.body || 'No description provided';
        const dueDate = taskDetails.dueDate || this.getDefaultDueDate();
        const priority = taskDetails.priority || 'Medium';
        const pos = taskDetails.priority === 'High' ? 'top' : 'bottom';

        // Map priority to label IDs
        const labelIds = this.mapPriorityToLabels(priority, taskDetails.labels);

        if (!taskDetails.dueDate) {
            warnings.push('Due date not specified, using default: 7 days from now');
        }

        // Build source URL from signal
        const urlSource = this.buildSourceUrl(signal);

        // Build Trello parameters
        const params: TrelloCardParams = {
            listId: this.config.trelloDefaultListId!,
            name: taskDetails.title,
            desc: description,
            due: dueDate,
            idLabels: labelIds,
            pos,
            urlSource,
        };

        logger.debug('[ActionParamsBuilder] Built Trello parameters', {
            name: taskDetails.title,
            priority,
            pos,
            labelCount: labelIds.length,
            dueDate,
        });

        return {
            success: true,
            params,
            warnings: warnings.length > 0 ? warnings : undefined,
        };
    }

    /**
     * Build Slack notification parameters
     */
    private buildSlackParams(taskDetails: TaskDetails, signal: Signal): ParamsBuildResult {
        const warnings: string[] = [];
        const missingFields: string[] = [];

        // Validate required fields
        if (!taskDetails.title && !taskDetails.description) {
            missingFields.push('title or description');
        }

        if (missingFields.length > 0) {
            return {
                success: false,
                error: 'Missing required fields for Slack notification',
                missingFields,
            };
        }

        // Apply defaults
        const channel = taskDetails.metadata?.channel || this.config.slackDefaultChannel || '#general';
        const title = taskDetails.title || 'Notification';
        const description = taskDetails.description || signal.body || 'No details provided';

        // Build message blocks
        const blocks: SlackNotificationParams['blocks'] = [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: title,
                },
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: description,
                },
            },
        ];

        // Add context fields if available
        const fields: Array<{ type: 'mrkdwn'; text: string }> = [];

        if (signal.sender) {
            fields.push({
                type: 'mrkdwn',
                text: `*From:*\n${signal.sender}`,
            });
        }

        if (signal.source) {
            fields.push({
                type: 'mrkdwn',
                text: `*Source:*\n${signal.source}`,
            });
        }

        if (taskDetails.priority) {
            const priorityEmoji = taskDetails.priority === 'High' ? '🔴' : 
                                 taskDetails.priority === 'Medium' ? '🟡' : '🟢';
            fields.push({
                type: 'mrkdwn',
                text: `*Priority:*\n${priorityEmoji} ${taskDetails.priority}`,
            });
        }

        if (taskDetails.dueDate) {
            fields.push({
                type: 'mrkdwn',
                text: `*Due:*\n${this.formatDate(taskDetails.dueDate)}`,
            });
        }

        if (fields.length > 0) {
            blocks.push({
                type: 'section',
                fields,
            });
        }

        // Add divider
        blocks.push({
            type: 'divider',
        });

        // Add footer context
        blocks.push({
            type: 'context',
            text: {
                type: 'mrkdwn',
                text: `Signal ID: ${signal.id} | ${new Date().toLocaleString()}`,
            },
        });

        // Build Slack parameters
        const params: SlackNotificationParams = {
            channel,
            blocks,
            text: title, // Fallback text for notifications
        };

        // Add thread_ts if this is a reply
        if (taskDetails.metadata?.thread_ts) {
            params.thread_ts = taskDetails.metadata.thread_ts;
        }

        logger.debug('[ActionParamsBuilder] Built Slack parameters', {
            channel,
            title,
            blockCount: blocks.length,
            isThread: !!params.thread_ts,
        });

        return {
            success: true,
            params,
            warnings: warnings.length > 0 ? warnings : undefined,
        };
    }

    /**
     * Build Drive file organization parameters
     */
    private buildDriveParams(taskDetails: TaskDetails, signal: Signal): ParamsBuildResult {
        const warnings: string[] = [];
        const missingFields: string[] = [];

        // Validate required fields
        if (!taskDetails.metadata?.fileId) {
            missingFields.push('fileId (in metadata)');
        }

        if (!this.config.driveDefaultFolderId && !taskDetails.metadata?.folderId) {
            missingFields.push('folderId (config or metadata)');
        }

        if (missingFields.length > 0) {
            return {
                success: false,
                error: 'Missing required fields for Drive file organization',
                missingFields,
            };
        }

        // Apply defaults
        const folderId = taskDetails.metadata?.folderId || this.config.driveDefaultFolderId!;
        const name = taskDetails.title || taskDetails.metadata?.fileName || 'Untitled File';
        const description = taskDetails.description;

        if (!taskDetails.title && !taskDetails.metadata?.fileName) {
            warnings.push('No file name specified, using default: Untitled File');
        }

        // Build Drive parameters
        const params: DriveFileParams = {
            fileId: taskDetails.metadata!.fileId,
            folderId,
            name,
            description,
        };

        logger.debug('[ActionParamsBuilder] Built Drive parameters', {
            fileId: params.fileId,
            folderId,
            name,
            hasDescription: !!description,
        });

        return {
            success: true,
            params,
            warnings: warnings.length > 0 ? warnings : undefined,
        };
    }

    // ========================================================================
    // Helper Methods
    // ========================================================================

    /**
     * Map signal source to Notion source format
     */
    private mapSignalSourceToNotion(source: Signal['source']): 'Email' | 'Slack' | 'Sheet' {
        const mapping: Record<Signal['source'], 'Email' | 'Slack' | 'Sheet'> = {
            email: 'Email',
            slack: 'Slack',
            sheets: 'Sheet',
        };
        return mapping[source] || 'Email';
    }

    /**
     * Get default due date (7 days from now)
     */
    private getDefaultDueDate(): string {
        const date = new Date();
        date.setDate(date.getDate() + 7);
        return date.toISOString();
    }

    /**
     * Map priority to Trello label IDs
     */
    private mapPriorityToLabels(priority: string, additionalLabels?: string[]): string[] {
        const labels: string[] = [];

        // Add priority label
        if (this.config.priorityLabelMappings?.[priority]) {
            labels.push(this.config.priorityLabelMappings[priority]);
        }

        // Add additional labels
        if (additionalLabels) {
            labels.push(...additionalLabels);
        }

        return labels;
    }

    /**
     * Build source URL from signal
     */
    private buildSourceUrl(signal: Signal): string {
        // Build a reference URL from signal
        return `signal://${signal.source}/${signal.id}`;
    }

    /**
     * Format date for display
     */
    private formatDate(isoDate: string): string {
        try {
            const date = new Date(isoDate);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            });
        } catch {
            return isoDate;
        }
    }

    /**
     * Update configuration
     */
    public updateConfig(config: Partial<ParamsBuilderConfig>): void {
        this.config = {
            ...this.config,
            ...config,
        };

        logger.info('[ActionParamsBuilder] Configuration updated', {
            hasNotionDb: !!this.config.notionDatabaseId,
            hasTrelloList: !!this.config.trelloDefaultListId,
            slackChannel: this.config.slackDefaultChannel,
            hasDriveFolder: !!this.config.driveDefaultFolderId,
        });
    }

    /**
     * Get current configuration
     */
    public getConfig(): Readonly<ParamsBuilderConfig> {
        return { ...this.config };
    }

    /**
     * Validate task details for a specific platform
     */
    public validateTaskDetails(
        platform: PlatformType,
        taskDetails: TaskDetails
    ): { valid: boolean; errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Common validations
        if (!taskDetails.title) {
            errors.push('Title is required');
        }

        if (taskDetails.title && taskDetails.title.length > 255) {
            warnings.push('Title is very long (>255 characters)');
        }

        // Platform-specific validations
        switch (platform) {
            case 'notion':
                if (!this.config.notionDatabaseId) {
                    errors.push('Notion database ID not configured');
                }
                if (taskDetails.priority && !['High', 'Medium', 'Low'].includes(taskDetails.priority)) {
                    errors.push('Invalid priority value for Notion');
                }
                break;

            case 'trello':
                if (!this.config.trelloDefaultListId) {
                    errors.push('Trello list ID not configured');
                }
                break;

            case 'slack':
                if (!this.config.slackDefaultChannel && !taskDetails.metadata?.channel) {
                    warnings.push('No Slack channel specified, will use default');
                }
                break;

            case 'drive':
                if (!taskDetails.metadata?.fileId) {
                    errors.push('File ID is required for Drive operations');
                }
                if (!this.config.driveDefaultFolderId && !taskDetails.metadata?.folderId) {
                    errors.push('Folder ID not configured and not provided');
                }
                break;
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Get singleton instance of ActionParamsBuilder
 */
export function getActionParamsBuilder(config?: ParamsBuilderConfig): ActionParamsBuilder {
    return ActionParamsBuilder.getInstance(config);
}

/**
 * Build parameters for an action (convenience function)
 */
export function buildActionParams(
    action: ActionType,
    platform: PlatformType,
    taskDetails: TaskDetails,
    signal: Signal,
    config?: ParamsBuilderConfig
): ParamsBuildResult {
    const builder = getActionParamsBuilder(config);
    return builder.buildParams(action, platform, taskDetails, signal);
}

/**
 * Validate task details for a platform (convenience function)
 */
export function validateTaskDetails(
    platform: PlatformType,
    taskDetails: TaskDetails,
    config?: ParamsBuilderConfig
): { valid: boolean; errors: string[]; warnings: string[] } {
    const builder = getActionParamsBuilder(config);
    return builder.validateTaskDetails(platform, taskDetails);
}
