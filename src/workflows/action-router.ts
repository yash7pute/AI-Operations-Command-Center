/**
 * Action Router (Member 3: Orchestration Layer)
 * Routes actions from Member 2 (Reasoning Engine) to appropriate executors
 * Handles validation, health checks, and execution routing
 */

import { EventEmitter } from 'events';
import logger from '../utils/logger';
import {
    ReasoningResult,
    ExecutionResult,
    ValidationResult,
    HealthCheckResult
} from '../types';
import * as NotionExecutor from './executors/notion-executor';
import * as TrelloExecutor from './executors/trello-executor';
import * as SlackExecutor from './executors/slack-executor';
import * as DriveExecutor from './executors/drive-executor';
import * as SheetsExecutor from './executors/sheets-executor';
import * as SheetsTemplateManager from './executors/sheets-template-manager';

// Event emitter for action events
const eventBus = new EventEmitter();

/**
 * Validates that action is complete and executable
 * @param reasoningResult - The reasoning result from Member 2
 * @returns Validation result with errors if any
 */
function validateAction(reasoningResult: ReasoningResult): ValidationResult {
    const errors: string[] = [];

    // Check action field exists and is non-empty
    if (!reasoningResult.action || reasoningResult.action.trim() === '') {
        errors.push('Action field is required and cannot be empty');
    }

    // Check target platform is specified
    if (!reasoningResult.target || reasoningResult.target.trim() === '') {
        errors.push('Target platform is required and cannot be empty');
    }

    // Check required params are present
    if (!reasoningResult.params || typeof reasoningResult.params !== 'object') {
        errors.push('Params object is required');
    }

    // Check correlationId exists for tracking
    if (!reasoningResult.correlationId || reasoningResult.correlationId.trim() === '') {
        errors.push('CorrelationId is required for tracking');
    }

    // Validate action type is supported
    const validActions = ['create_task', 'send_notification', 'file_document', 'update_sheet'];
    if (reasoningResult.action && !validActions.includes(reasoningResult.action)) {
        errors.push(`Unsupported action type: ${reasoningResult.action}. Valid actions: ${validActions.join(', ')}`);
    }

    // Validate target platform is supported
    const validTargets = ['notion', 'trello', 'slack', 'drive', 'sheets'];
    if (reasoningResult.target && !validTargets.includes(reasoningResult.target)) {
        errors.push(`Unsupported target platform: ${reasoningResult.target}. Valid targets: ${validTargets.join(', ')}`);
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Checks if target platform is available (health check)
 * @param platform - The target platform to check
 * @returns Health check result
 */
async function checkPlatformHealth(platform: string): Promise<HealthCheckResult> {
    // Placeholder implementation - will integrate with real health checker later
    logger.debug(`Health check for platform: ${platform}`);
    
    // For now, assume all platforms are healthy
    // In future prompts, this will check actual platform availability
    return {
        platform,
        isHealthy: true,
        latency: 0
    };
}

/**
 * Action-to-Executor mapping
 * Maps action+target combinations to executor methods
 */
interface ExecutorMapping {
    [key: string]: (params: any) => Promise<ExecutionResult>;
}

const actionExecutorMap: ExecutorMapping = {
    // Create task actions
    'create_task:notion': (params: any) => NotionExecutor.createTask(params),
    'create_task:trello': (params: any) => TrelloExecutor.createCard(params),
    
    // Notification actions
    'send_notification:slack': (params: any) => SlackExecutor.sendNotification(params.message || 'Notification', params),
    
    // File management actions
    'file_document:drive': (params: any) => {
        // Extract file metadata from params
        const metadata: DriveExecutor.FileMetadata = {
            name: params.fileName || params.name || 'document.pdf',
            type: params.type || DriveExecutor.DocumentType.DOCUMENT,
            mimeType: params.mimeType || 'application/pdf',
            description: params.description,
            date: params.date ? new Date(params.date) : new Date(),
            assignee: params.assignee,
            tags: params.tags,
            source: params.source || 'api'
        };
        
        // File content should be in params.content as Buffer or base64 string
        const fileContent = params.content || Buffer.from('');
        
        return DriveExecutor.fileDocument(fileContent, metadata);
    },
    
    // Organize email attachments
    'organize_attachments:drive': (params: any) => {
        const attachments: DriveExecutor.Attachment[] = params.attachments || [];
        const emailContext: DriveExecutor.EmailContext = {
            from: params.from || params.emailFrom || '',
            to: params.to || params.emailTo || '',
            subject: params.subject || params.emailSubject || '',
            date: params.date ? new Date(params.date) : new Date(),
            messageId: params.messageId
        };
        
        return DriveExecutor.organizeEmailAttachments(attachments, emailContext);
    },
    
    // Move file to different folder
    'move_file:drive': (params: any) => {
        return DriveExecutor.moveFile(
            params.fileId,
            params.folderId || params.newFolderId,
            params.removePreviousParents !== false // default true
        );
    },
    
    // Spreadsheet actions - update sheet with data
    'update_sheet:sheets': (params: any) => {
        const sheetData: SheetsExecutor.SheetData = {
            values: params.values || params.data || [[]],
            range: params.range,
            sheetName: params.sheetName || params.sheet,
            startRow: params.startRow,
            startColumn: params.startColumn
        };

        const operation = params.operation || SheetsExecutor.SheetOperation.APPEND_ROW;
        const formatting = params.formatting;
        const validate = params.validate !== false; // default true

        return SheetsExecutor.updateSheet(
            params.spreadsheetId,
            sheetData,
            operation,
            formatting,
            validate
        );
    },

    // Log action to audit trail
    'log_action:sheets': (params: any) => {
        const actionLog: SheetsExecutor.ActionLog = {
            timestamp: params.timestamp ? new Date(params.timestamp) : new Date(),
            action: params.action || 'unknown',
            target: params.target || '',
            status: params.status || 'success',
            details: params.details
        };

        return SheetsExecutor.logAction(params.spreadsheetId, actionLog);
    },

    // Update metrics dashboard
    'update_metrics:sheets': (params: any) => {
        const metrics: SheetsExecutor.MetricsData = {
            signalsProcessed: params.signalsProcessed,
            tasksCreated: params.tasksCreated,
            successRate: params.successRate,
            errors: params.errors,
            averageResponseTime: params.averageResponseTime,
            period: params.period || 'daily',
            date: params.date ? new Date(params.date) : new Date()
        };

        return SheetsExecutor.updateMetrics(params.spreadsheetId, metrics);
    },

    // Create Action Log sheet template
    'create_action_log:sheets': async (params: any) => {
        const result = await SheetsTemplateManager.createActionLogSheet(params.spreadsheetId);
        return {
            success: result.success,
            data: result,
            error: result.error
        };
    },

    // Create Metrics Dashboard template
    'create_dashboard:sheets': async (params: any) => {
        const result = await SheetsTemplateManager.createMetricsDashboard(params.spreadsheetId);
        return {
            success: result.success,
            data: result,
            error: result.error
        };
    },

    // Initialize complete monitoring spreadsheet
    'initialize_monitoring:sheets': async (params: any) => {
        const result = await SheetsTemplateManager.initializeMonitoringSpreadsheet(params.spreadsheetId);
        const success = result.actionLog.success && result.dashboard.success;
        return {
            success,
            data: result,
            error: !success ? 'Failed to initialize monitoring spreadsheet' : undefined
        };
    }
};

/**
 * Routes action to correct executor based on decision.action and decision.target
 * @param reasoningResult - The reasoning result from Member 2
 * @returns Execution result with success status, data, and any errors
 */
export async function routeAction(reasoningResult: ReasoningResult): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { correlationId, action, target, params } = reasoningResult;

    try {
        // Log routing start
        logger.info('Action routing started', {
            correlationId,
            action,
            target,
            timestamp: new Date().toISOString()
        });

        // Step 1: Validate action is complete and executable
        const validation = validateAction(reasoningResult);
        if (!validation.isValid) {
            logger.warn('Action validation failed', {
                correlationId,
                errors: validation.errors
            });
            
            return {
                success: false,
                error: `Validation failed: ${validation.errors.join(', ')}`,
                executionTime: Date.now() - startTime
            };
        }

        logger.debug('Action validation passed', { correlationId });

        // Step 2: Check target platform is available (health check)
        const healthCheck = await checkPlatformHealth(target);
        if (!healthCheck.isHealthy) {
            logger.error('Platform health check failed', {
                correlationId,
                platform: target,
                error: healthCheck.error
            });
            
            return {
                success: false,
                error: `Platform ${target} is not available: ${healthCheck.error || 'Unknown error'}`,
                executionTime: Date.now() - startTime
            };
        }

        logger.debug('Platform health check passed', {
            correlationId,
            platform: target,
            latency: healthCheck.latency
        });

        // Step 3: Look up executor mapping
        const executorKey = `${action}:${target}`;
        const executorFunction = actionExecutorMap[executorKey];

        if (!executorFunction) {
            logger.error('No executor found for action-target combination', {
                correlationId,
                action,
                target,
                executorKey,
                availableMappings: Object.keys(actionExecutorMap)
            });
            
            return {
                success: false,
                error: `No executor found for action '${action}' on target '${target}'`,
                executionTime: Date.now() - startTime
            };
        }

        logger.info('Executor selected', {
            correlationId,
            executorKey,
            action,
            target
        });

        // Step 4: Execute action via executor
        const executionResult = await executorFunction(params);
        const executionTime = Date.now() - startTime;

        // Add execution time to result
        executionResult.executionTime = executionTime;

        // Log execution result
        if (executionResult.success) {
            logger.info('Action executed successfully', {
                correlationId,
                action,
                target,
                executionTime,
                data: executionResult.data
            });
        } else {
            logger.error('Action execution failed', {
                correlationId,
                action,
                target,
                executionTime,
                error: executionResult.error
            });
        }

        return executionResult;

    } catch (error) {
        // Handle unexpected errors gracefully
        const executionTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        logger.error('Unexpected error during action routing', {
            correlationId,
            action,
            target,
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            executionTime
        });

        return {
            success: false,
            error: `Routing error: ${errorMessage}`,
            executionTime
        };
    }
}

/**
 * Handles action:ready events from Member 2
 * @param reasoningResult - The reasoning result from Member 2
 */
async function handleAction(reasoningResult: ReasoningResult): Promise<void> {
    logger.info('Received action:ready event', {
        correlationId: reasoningResult.correlationId,
        action: reasoningResult.action,
        target: reasoningResult.target
    });

    try {
        const result = await routeAction(reasoningResult);
        
        // Emit result back for Member 2's feedback system
        if (result.success) {
            eventBus.emit('action:completed', {
                correlationId: reasoningResult.correlationId,
                result: result.data,
                executionTime: result.executionTime
            });
        } else {
            eventBus.emit('action:failed', {
                correlationId: reasoningResult.correlationId,
                error: result.error,
                retriable: false // Will implement retry logic in later prompts
            });
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error in handleAction', {
            correlationId: reasoningResult.correlationId,
            error: errorMessage
        });

        eventBus.emit('action:failed', {
            correlationId: reasoningResult.correlationId,
            error: errorMessage,
            retriable: false
        });
    }
}

/**
 * Initializes the action router
 * Sets up event subscriptions to Member 2's reasoning results
 */
export function initializeRouter(): void {
    logger.info('Initializing Action Router');

    // Subscribe to Member 2's reasoning results
    eventBus.on('action:ready', handleAction);

    logger.info('Action Router initialized successfully');
}

// Export event bus for other modules to use
export { eventBus };
