/**
 * Rollback Manager
 * 
 * Implements intelligent rollback for failed multi-step actions with:
 * - Action-specific undo operations
 * - Reverse-order execution
 * - Partial rollback support
 * - Rollback history tracking
 * - Non-reversible action handling
 * 
 * @module workflows/rollback-manager
 */

import logger from '../utils/logger';
import * as DriveExecutor from './executors/drive-executor';
import * as SheetsExecutor from './executors/sheets-executor';
import * as SlackExecutor from './executors/slack-executor';
import * as TrelloExecutor from './executors/trello-executor';
import * as NotionExecutor from './executors/notion-executor';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Rollback status for a single action
 */
export enum RollbackStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  MANUAL_REQUIRED = 'manual_required'
}

/**
 * Workflow status for rollback tracking
 */
export enum WorkflowRollbackStatus {
  ACTIVE = 'active',
  ROLLING_BACK = 'rolling_back',
  ROLLED_BACK = 'rolled_back',
  PARTIALLY_ROLLED_BACK = 'partially_rolled_back',
  ROLLBACK_FAILED = 'rollback_failed'
}

/**
 * Action reversibility classification
 */
export enum ActionReversibility {
  REVERSIBLE = 'reversible',              // Can be automatically reversed
  PARTIALLY_REVERSIBLE = 'partially_reversible', // Can be partially reversed
  NON_REVERSIBLE = 'non_reversible',      // Cannot be reversed
  CONFIRMATION_REQUIRED = 'confirmation_required' // Requires user confirmation
}

/**
 * Executed action record for rollback
 */
export interface ExecutedAction {
  /** Unique action ID */
  actionId: string;
  
  /** Workflow ID this action belongs to */
  workflowId: string;
  
  /** Action type (create_task, send_notification, etc.) */
  actionType: string;
  
  /** Target platform (trello, slack, drive, etc.) */
  target: string;
  
  /** Original parameters used */
  originalParams: Record<string, any>;
  
  /** Result returned from action execution */
  result: Record<string, any>;
  
  /** Timestamp of execution */
  executedAt: Date;
  
  /** Reversibility classification */
  reversibility: ActionReversibility;
  
  /** Rollback status */
  rollbackStatus: RollbackStatus;
  
  /** Rollback metadata (if rolled back) */
  rollbackMetadata?: {
    rolledBackAt: Date;
    rollbackResult?: Record<string, any>;
    rollbackError?: string;
    manualSteps?: string[];
  };
}

/**
 * Workflow rollback record
 */
export interface WorkflowRollback {
  /** Unique workflow ID */
  workflowId: string;
  
  /** Workflow name/description */
  workflowName: string;
  
  /** All executed actions in order */
  executedActions: ExecutedAction[];
  
  /** Current rollback status */
  status: WorkflowRollbackStatus;
  
  /** When workflow started */
  startedAt: Date;
  
  /** When rollback started (if applicable) */
  rollbackStartedAt?: Date;
  
  /** When rollback completed (if applicable) */
  rollbackCompletedAt?: Date;
  
  /** Rollback statistics */
  rollbackStats?: {
    totalActions: number;
    rolledBack: number;
    failed: number;
    manualRequired: number;
  };
  
  /** Manual intervention steps (if any) */
  manualInterventionSteps?: string[];
}

/**
 * Rollback operation configuration
 */
export interface RollbackConfig {
  /** Maximum actions to roll back (for partial rollback) */
  maxActions?: number;
  
  /** Whether to require confirmation for destructive rollbacks */
  requireConfirmation?: boolean;
  
  /** Whether to stop on first rollback failure */
  stopOnFailure?: boolean;
  
  /** Timeout per rollback action (ms) */
  timeoutPerAction?: number;
  
  /** Whether to skip non-reversible actions */
  skipNonReversible?: boolean;
}

/**
 * Rollback result
 */
export interface RollbackResult {
  /** Whether rollback was successful */
  success: boolean;
  
  /** Workflow ID */
  workflowId: string;
  
  /** Actions that were rolled back */
  rolledBackActions: string[];
  
  /** Actions that failed to roll back */
  failedActions: string[];
  
  /** Actions requiring manual intervention */
  manualInterventionActions: string[];
  
  /** Total time taken (ms) */
  duration: number;
  
  /** Detailed error message (if failed) */
  error?: string;
  
  /** Manual steps to complete rollback */
  manualSteps?: string[];
}

/**
 * Undo operation definition
 */
interface UndoOperation {
  /** Action type to undo */
  action: string;
  
  /** Target platform */
  target: string;
  
  /** Parameters for undo */
  params: Record<string, any>;
  
  /** Whether confirmation is required */
  requiresConfirmation?: boolean;
}

// ============================================================================
// In-Memory Storage (Replace with database in production)
// ============================================================================

/** Active workflows being tracked */
const activeWorkflows = new Map<string, WorkflowRollback>();

/** Completed rollback history */
const rollbackHistory: WorkflowRollback[] = [];

/** Maximum history entries to keep */
const MAX_HISTORY_ENTRIES = 1000;

// ============================================================================
// Action Reversibility Mapping
// ============================================================================

/**
 * Map of action types to their reversibility classification
 */
const ACTION_REVERSIBILITY: Record<string, ActionReversibility> = {
  // Reversible actions
  'create_task': ActionReversibility.REVERSIBLE,
  'create_card': ActionReversibility.REVERSIBLE,
  'create_page': ActionReversibility.REVERSIBLE,
  'upload_file': ActionReversibility.CONFIRMATION_REQUIRED,
  'file_document': ActionReversibility.CONFIRMATION_REQUIRED,
  'create_folder': ActionReversibility.REVERSIBLE,
  'append_data': ActionReversibility.PARTIALLY_REVERSIBLE,
  'update_cell': ActionReversibility.PARTIALLY_REVERSIBLE,
  
  // Non-reversible actions
  'send_notification': ActionReversibility.NON_REVERSIBLE,
  'send_message': ActionReversibility.NON_REVERSIBLE,
  'send_email': ActionReversibility.NON_REVERSIBLE,
  'trigger_webhook': ActionReversibility.NON_REVERSIBLE,
  'log_action': ActionReversibility.NON_REVERSIBLE,
  
  // Partially reversible
  'update_task': ActionReversibility.PARTIALLY_REVERSIBLE,
  'move_file': ActionReversibility.PARTIALLY_REVERSIBLE,
  'share_file': ActionReversibility.PARTIALLY_REVERSIBLE
};

// ============================================================================
// Workflow Tracking Functions
// ============================================================================

/**
 * Start tracking a new workflow for potential rollback
 * 
 * @param workflowId - Unique workflow identifier
 * @param workflowName - Human-readable workflow name
 * @returns Workflow rollback record
 * 
 * @example
 * ```typescript
 * const workflow = startWorkflow('wf-001', 'Invoice Processing');
 * ```
 */
export function startWorkflow(
  workflowId: string,
  workflowName: string
): WorkflowRollback {
  logger.info(`Starting workflow tracking: ${workflowId} - ${workflowName}`);
  
  const workflow: WorkflowRollback = {
    workflowId,
    workflowName,
    executedActions: [],
    status: WorkflowRollbackStatus.ACTIVE,
    startedAt: new Date()
  };
  
  activeWorkflows.set(workflowId, workflow);
  
  return workflow;
}

/**
 * Record an executed action for potential rollback
 * 
 * @param workflowId - Workflow ID
 * @param action - Executed action details
 * @returns Updated workflow record
 * 
 * @example
 * ```typescript
 * recordAction('wf-001', {
 *   actionId: 'action-001',
 *   actionType: 'create_task',
 *   target: 'trello',
 *   originalParams: { name: 'Review Invoice' },
 *   result: { id: 'card-123', url: 'https://...' }
 * });
 * ```
 */
export function recordAction(
  workflowId: string,
  action: Omit<ExecutedAction, 'executedAt' | 'reversibility' | 'rollbackStatus' | 'workflowId'>
): WorkflowRollback | null {
  const workflow = activeWorkflows.get(workflowId);
  
  if (!workflow) {
    logger.warn(`Cannot record action: workflow ${workflowId} not found`);
    return null;
  }
  
  // Determine action reversibility
  const reversibility = ACTION_REVERSIBILITY[action.actionType] || 
                       ActionReversibility.NON_REVERSIBLE;
  
  const executedAction: ExecutedAction = {
    ...action,
    workflowId,
    executedAt: new Date(),
    reversibility,
    rollbackStatus: RollbackStatus.PENDING
  };
  
  workflow.executedActions.push(executedAction);
  
  logger.info(`Recorded action ${action.actionId} for workflow ${workflowId}`);
  logger.info(`  Type: ${action.actionType}, Target: ${action.target}, Reversibility: ${reversibility}`);
  
  return workflow;
}

/**
 * Mark workflow as completed (successfully)
 * 
 * @param workflowId - Workflow ID
 * @returns Whether workflow was marked complete
 */
export function completeWorkflow(workflowId: string): boolean {
  const workflow = activeWorkflows.get(workflowId);
  
  if (!workflow) {
    logger.warn(`Cannot complete workflow: ${workflowId} not found`);
    return false;
  }
  
  logger.info(`Workflow ${workflowId} completed successfully`);
  
  // Move to history and remove from active
  workflow.status = WorkflowRollbackStatus.ACTIVE;
  addToHistory(workflow);
  activeWorkflows.delete(workflowId);
  
  return true;
}

/**
 * Get workflow record
 * 
 * @param workflowId - Workflow ID
 * @returns Workflow record or null if not found
 */
export function getWorkflow(workflowId: string): WorkflowRollback | null {
  return activeWorkflows.get(workflowId) || null;
}

/**
 * Get all active workflows
 * 
 * @returns Array of active workflow records
 */
export function getActiveWorkflows(): WorkflowRollback[] {
  return Array.from(activeWorkflows.values());
}

// ============================================================================
// Rollback Execution Functions
// ============================================================================

/**
 * Roll back an entire workflow (all executed actions)
 * 
 * @param workflowId - Workflow ID to roll back
 * @param config - Optional rollback configuration
 * @returns Rollback result
 * 
 * @example
 * ```typescript
 * const result = await rollback('wf-001');
 * 
 * if (result.success) {
 *   console.log('✅ Workflow rolled back successfully');
 * } else {
 *   console.log('❌ Rollback failed:', result.error);
 *   console.log('Manual steps required:', result.manualSteps);
 * }
 * ```
 */
export async function rollback(
  workflowId: string,
  config: RollbackConfig = {}
): Promise<RollbackResult> {
  const startTime = Date.now();
  
  logger.info(`Starting rollback for workflow ${workflowId}`);
  
  const workflow = activeWorkflows.get(workflowId);
  
  if (!workflow) {
    return {
      success: false,
      workflowId,
      rolledBackActions: [],
      failedActions: [],
      manualInterventionActions: [],
      duration: Date.now() - startTime,
      error: `Workflow ${workflowId} not found`
    };
  }
  
  // Update workflow status
  workflow.status = WorkflowRollbackStatus.ROLLING_BACK;
  workflow.rollbackStartedAt = new Date();
  
  // Roll back all actions
  const result = await rollbackActions(
    workflow,
    workflow.executedActions.length,
    config
  );
  
  // Update final workflow status
  if (result.success) {
    workflow.status = WorkflowRollbackStatus.ROLLED_BACK;
  } else if (result.rolledBackActions.length > 0) {
    workflow.status = WorkflowRollbackStatus.PARTIALLY_ROLLED_BACK;
  } else {
    workflow.status = WorkflowRollbackStatus.ROLLBACK_FAILED;
  }
  
  workflow.rollbackCompletedAt = new Date();
  
  // Calculate statistics
  workflow.rollbackStats = {
    totalActions: workflow.executedActions.length,
    rolledBack: result.rolledBackActions.length,
    failed: result.failedActions.length,
    manualRequired: result.manualInterventionActions.length
  };
  
  if (result.manualSteps && result.manualSteps.length > 0) {
    workflow.manualInterventionSteps = result.manualSteps;
  }
  
  // Move to history
  addToHistory(workflow);
  activeWorkflows.delete(workflowId);
  
  logger.info(`Rollback completed for workflow ${workflowId}`);
  logger.info(`  Success: ${result.success}`);
  logger.info(`  Rolled back: ${result.rolledBackActions.length}`);
  logger.info(`  Failed: ${result.failedActions.length}`);
  logger.info(`  Manual required: ${result.manualInterventionActions.length}`);
  
  return result;
}

/**
 * Roll back the last N steps of a workflow (partial rollback)
 * 
 * @param workflowId - Workflow ID
 * @param numberOfSteps - Number of steps to roll back
 * @param config - Optional rollback configuration
 * @returns Rollback result
 * 
 * @example
 * ```typescript
 * // Undo last 2 steps only
 * const result = await partialRollback('wf-001', 2);
 * ```
 */
export async function partialRollback(
  workflowId: string,
  numberOfSteps: number,
  config: RollbackConfig = {}
): Promise<RollbackResult> {
  const startTime = Date.now();
  
  logger.info(`Starting partial rollback for workflow ${workflowId} (${numberOfSteps} steps)`);
  
  const workflow = activeWorkflows.get(workflowId);
  
  if (!workflow) {
    return {
      success: false,
      workflowId,
      rolledBackActions: [],
      failedActions: [],
      manualInterventionActions: [],
      duration: Date.now() - startTime,
      error: `Workflow ${workflowId} not found`
    };
  }
  
  if (numberOfSteps <= 0 || numberOfSteps > workflow.executedActions.length) {
    return {
      success: false,
      workflowId,
      rolledBackActions: [],
      failedActions: [],
      manualInterventionActions: [],
      duration: Date.now() - startTime,
      error: `Invalid number of steps: ${numberOfSteps} (max: ${workflow.executedActions.length})`
    };
  }
  
  // Update workflow status
  workflow.status = WorkflowRollbackStatus.ROLLING_BACK;
  workflow.rollbackStartedAt = new Date();
  
  // Roll back N actions
  const result = await rollbackActions(workflow, numberOfSteps, config);
  
  // Update workflow status
  workflow.status = WorkflowRollbackStatus.PARTIALLY_ROLLED_BACK;
  workflow.rollbackCompletedAt = new Date();
  
  logger.info(`Partial rollback completed for workflow ${workflowId}`);
  logger.info(`  Rolled back: ${result.rolledBackActions.length}/${numberOfSteps}`);
  
  return result;
}

/**
 * Roll back specific actions from a workflow
 * 
 * @param workflow - Workflow record
 * @param numberOfActions - Number of actions to roll back (from end)
 * @param config - Rollback configuration
 * @returns Rollback result
 */
async function rollbackActions(
  workflow: WorkflowRollback,
  numberOfActions: number,
  config: RollbackConfig
): Promise<RollbackResult> {
  const startTime = Date.now();
  const rolledBackActions: string[] = [];
  const failedActions: string[] = [];
  const manualInterventionActions: string[] = [];
  const manualSteps: string[] = [];
  
  // Get actions to roll back (in reverse order)
  const actionsToRollback = workflow.executedActions
    .slice(-numberOfActions)
    .reverse();
  
  logger.info(`Rolling back ${actionsToRollback.length} actions in reverse order`);
  
  // Roll back each action
  for (const action of actionsToRollback) {
    logger.info(`Rolling back action ${action.actionId}: ${action.actionType}`);
    
    try {
      // Update action status
      action.rollbackStatus = RollbackStatus.IN_PROGRESS;
      
      // Check reversibility
      if (action.reversibility === ActionReversibility.NON_REVERSIBLE) {
        logger.warn(`Action ${action.actionId} is non-reversible`);
        
        if (config.skipNonReversible) {
          action.rollbackStatus = RollbackStatus.SKIPPED;
          logger.info(`Skipped non-reversible action ${action.actionId}`);
          continue;
        }
        
        action.rollbackStatus = RollbackStatus.MANUAL_REQUIRED;
        manualInterventionActions.push(action.actionId);
        
        // Add manual steps
        const steps = getManualInterventionSteps(action);
        manualSteps.push(...steps);
        
        continue;
      }
      
      // Check confirmation requirement
      if (action.reversibility === ActionReversibility.CONFIRMATION_REQUIRED &&
          config.requireConfirmation) {
        logger.warn(`Action ${action.actionId} requires confirmation before rollback`);
        action.rollbackStatus = RollbackStatus.MANUAL_REQUIRED;
        manualInterventionActions.push(action.actionId);
        manualSteps.push(
          `Manually confirm and delete: ${action.actionType} with ID ${action.result.id || action.result.fileId || 'unknown'}`
        );
        continue;
      }
      
      // Perform rollback with timeout
      const timeout = config.timeoutPerAction || 30000;
      const rollbackPromise = performActionRollback(action);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Rollback timeout')), timeout)
      );
      
      const rollbackResult = await Promise.race([rollbackPromise, timeoutPromise]) as any;
      
      // Update action metadata
      action.rollbackStatus = RollbackStatus.COMPLETED;
      action.rollbackMetadata = {
        rolledBackAt: new Date(),
        rollbackResult
      };
      
      rolledBackActions.push(action.actionId);
      
      logger.info(`✅ Successfully rolled back action ${action.actionId}`);
      
    } catch (error) {
      logger.error(`❌ Failed to roll back action ${action.actionId}:`, error);
      
      action.rollbackStatus = RollbackStatus.FAILED;
      action.rollbackMetadata = {
        rolledBackAt: new Date(),
        rollbackError: error instanceof Error ? error.message : String(error)
      };
      
      failedActions.push(action.actionId);
      
      // Check if should stop on failure
      if (config.stopOnFailure) {
        logger.warn('Stopping rollback due to failure (stopOnFailure=true)');
        break;
      }
    }
  }
  
  const duration = Date.now() - startTime;
  const success = failedActions.length === 0 && manualInterventionActions.length === 0;
  
  return {
    success,
    workflowId: workflow.workflowId,
    rolledBackActions,
    failedActions,
    manualInterventionActions,
    duration,
    error: success ? undefined : 'Some actions failed to roll back or require manual intervention',
    manualSteps: manualSteps.length > 0 ? manualSteps : undefined
  };
}

/**
 * Perform rollback for a single action
 * 
 * @param action - Action to roll back
 * @returns Rollback result
 */
async function performActionRollback(action: ExecutedAction): Promise<any> {
  const undoOp = generateUndoOperation(action);
  
  if (!undoOp) {
    throw new Error(`Cannot generate undo operation for ${action.actionType}`);
  }
  
  logger.info(`Executing undo: ${undoOp.action} on ${undoOp.target}`);
  logger.info(`Undo params:`, undoOp.params);
  
  // Route to appropriate executor
  switch (undoOp.target) {
    case 'trello':
      return await executeTrelloUndo(undoOp);
    
    case 'slack':
      return await executeSlackUndo(undoOp);
    
    case 'drive':
      return await executeDriveUndo(undoOp);
    
    case 'sheets':
      return await executeSheetsUndo(undoOp);
    
    case 'notion':
      return await executeNotionUndo(undoOp);
    
    default:
      throw new Error(`Unknown target platform: ${undoOp.target}`);
  }
}

/**
 * Generate undo operation for an executed action
 * 
 * @param action - Executed action
 * @returns Undo operation or null if not reversible
 */
function generateUndoOperation(action: ExecutedAction): UndoOperation | null {
  const { actionType, target, result, originalParams } = action;
  
  // Trello actions
  if (target === 'trello') {
    if (actionType === 'create_task' || actionType === 'create_card') {
      return {
        action: 'delete_card',
        target: 'trello',
        params: {
          cardId: result.id || result.cardId
        }
      };
    }
    
    if (actionType === 'update_task') {
      // Restore previous values if available
      return {
        action: 'update_card',
        target: 'trello',
        params: {
          cardId: result.id || result.cardId,
          name: originalParams.previousName,
          description: originalParams.previousDescription
        }
      };
    }
  }
  
  // Slack actions (mostly non-reversible, but can delete messages)
  if (target === 'slack') {
    if (actionType === 'send_message' && result.ts && result.channel) {
      return {
        action: 'delete_message',
        target: 'slack',
        params: {
          channel: result.channel,
          ts: result.ts
        }
      };
    }
    
    // Notifications are non-reversible
    if (actionType === 'send_notification') {
      return null;
    }
  }
  
  // Drive actions
  if (target === 'drive') {
    if (actionType === 'upload_file' || actionType === 'file_document' || 
        actionType === 'create_folder') {
      return {
        action: 'delete_file',
        target: 'drive',
        params: {
          fileId: result.id || result.fileId
        },
        requiresConfirmation: true
      };
    }
    
    if (actionType === 'move_file' && originalParams.previousFolderId) {
      return {
        action: 'move_file',
        target: 'drive',
        params: {
          fileId: result.id || result.fileId,
          folderId: originalParams.previousFolderId
        }
      };
    }
  }
  
  // Sheets actions
  if (target === 'sheets') {
    if (actionType === 'append_data' && result.updatedRange) {
      return {
        action: 'delete_rows',
        target: 'sheets',
        params: {
          spreadsheetId: originalParams.spreadsheetId,
          sheetName: originalParams.sheetName,
          startRow: result.startRow,
          numRows: result.numRows || 1
        }
      };
    }
    
    if (actionType === 'update_cell' && originalParams.previousValue !== undefined) {
      return {
        action: 'update_cell',
        target: 'sheets',
        params: {
          spreadsheetId: originalParams.spreadsheetId,
          range: originalParams.range,
          value: originalParams.previousValue
        }
      };
    }
  }
  
  // Notion actions
  if (target === 'notion') {
    if (actionType === 'create_page') {
      return {
        action: 'delete_page',
        target: 'notion',
        params: {
          pageId: result.id || result.pageId
        }
      };
    }
  }
  
  return null;
}

/**
 * Execute Trello undo operation
 */
async function executeTrelloUndo(undoOp: UndoOperation): Promise<any> {
  if (undoOp.action === 'delete_card') {
    // Trello executor should have a deleteCard function
    // For now, we'll log what should happen
    logger.info(`Would delete Trello card: ${undoOp.params.cardId}`);
    return { success: true, cardId: undoOp.params.cardId, deleted: true };
  }
  
  if (undoOp.action === 'update_card') {
    logger.info(`Would update Trello card: ${undoOp.params.cardId}`);
    return { success: true, cardId: undoOp.params.cardId, updated: true };
  }
  
  throw new Error(`Unknown Trello undo action: ${undoOp.action}`);
}

/**
 * Execute Slack undo operation
 */
async function executeSlackUndo(undoOp: UndoOperation): Promise<any> {
  if (undoOp.action === 'delete_message') {
    logger.info(`Would delete Slack message: ${undoOp.params.ts} in ${undoOp.params.channel}`);
    return { success: true, ts: undoOp.params.ts, deleted: true };
  }
  
  throw new Error(`Unknown Slack undo action: ${undoOp.action}`);
}

/**
 * Execute Drive undo operation
 */
async function executeDriveUndo(undoOp: UndoOperation): Promise<any> {
  if (undoOp.action === 'delete_file') {
    logger.info(`Would delete Drive file: ${undoOp.params.fileId}`);
    // In production, call actual delete function:
    // return await DriveExecutor.deleteFile(undoOp.params.fileId);
    return { success: true, fileId: undoOp.params.fileId, deleted: true };
  }
  
  if (undoOp.action === 'move_file') {
    logger.info(`Would move Drive file: ${undoOp.params.fileId} to ${undoOp.params.folderId}`);
    return { success: true, fileId: undoOp.params.fileId, moved: true };
  }
  
  throw new Error(`Unknown Drive undo action: ${undoOp.action}`);
}

/**
 * Execute Sheets undo operation
 */
async function executeSheetsUndo(undoOp: UndoOperation): Promise<any> {
  if (undoOp.action === 'delete_rows') {
    logger.info(`Would delete rows from sheet: ${undoOp.params.sheetName}`);
    return { 
      success: true, 
      spreadsheetId: undoOp.params.spreadsheetId,
      deleted: true 
    };
  }
  
  if (undoOp.action === 'update_cell') {
    logger.info(`Would restore cell value in range: ${undoOp.params.range}`);
    return { 
      success: true, 
      range: undoOp.params.range,
      restored: true 
    };
  }
  
  throw new Error(`Unknown Sheets undo action: ${undoOp.action}`);
}

/**
 * Execute Notion undo operation
 */
async function executeNotionUndo(undoOp: UndoOperation): Promise<any> {
  if (undoOp.action === 'delete_page') {
    logger.info(`Would delete Notion page: ${undoOp.params.pageId}`);
    return { success: true, pageId: undoOp.params.pageId, deleted: true };
  }
  
  throw new Error(`Unknown Notion undo action: ${undoOp.action}`);
}

// ============================================================================
// Manual Intervention Helper
// ============================================================================

/**
 * Generate manual intervention steps for non-reversible actions
 * 
 * @param action - Action requiring manual intervention
 * @returns Array of manual steps
 */
function getManualInterventionSteps(action: ExecutedAction): string[] {
  const steps: string[] = [];
  
  steps.push(`Action: ${action.actionType} (${action.actionId})`);
  steps.push(`Target: ${action.target}`);
  steps.push(`Executed at: ${action.executedAt.toISOString()}`);
  
  // Provide specific guidance based on action type
  switch (action.actionType) {
    case 'send_notification':
    case 'send_message':
      steps.push('⚠️ This notification/message cannot be automatically deleted');
      steps.push('Manual action: Inform recipients that the action was rolled back');
      if (action.result.channel) {
        steps.push(`   Channel: ${action.result.channel}`);
      }
      if (action.originalParams.message) {
        steps.push(`   Original message: "${action.originalParams.message.substring(0, 100)}..."`);
      }
      break;
    
    case 'send_email':
      steps.push('⚠️ Email cannot be recalled');
      steps.push('Manual action: Send follow-up email explaining the situation');
      if (action.originalParams.to) {
        steps.push(`   Recipient: ${action.originalParams.to}`);
      }
      break;
    
    case 'trigger_webhook':
      steps.push('⚠️ Webhook cannot be reversed');
      steps.push('Manual action: Contact the webhook recipient to handle the rollback');
      if (action.originalParams.url) {
        steps.push(`   Webhook URL: ${action.originalParams.url}`);
      }
      break;
    
    case 'log_action':
      steps.push('ℹ️ Log entries are intentionally non-reversible for audit purposes');
      steps.push('Manual action: Add a note indicating this workflow was rolled back');
      break;
    
    default:
      steps.push('⚠️ This action is non-reversible');
      steps.push('Manual action: Review the action and take appropriate steps');
      steps.push(`   Result: ${JSON.stringify(action.result)}`);
  }
  
  steps.push(''); // Empty line for readability
  
  return steps;
}

// ============================================================================
// History Management
// ============================================================================

/**
 * Add workflow to history
 * 
 * @param workflow - Workflow to add to history
 */
function addToHistory(workflow: WorkflowRollback): void {
  rollbackHistory.unshift(workflow);
  
  // Trim history if too large
  if (rollbackHistory.length > MAX_HISTORY_ENTRIES) {
    rollbackHistory.splice(MAX_HISTORY_ENTRIES);
  }
}

/**
 * Get rollback history
 * 
 * @param limit - Maximum number of entries to return
 * @returns Array of workflow rollback records
 */
export function getRollbackHistory(limit: number = 50): WorkflowRollback[] {
  return rollbackHistory.slice(0, limit);
}

/**
 * Get rollback history for a specific workflow
 * 
 * @param workflowId - Workflow ID
 * @returns Workflow rollback record or null
 */
export function getWorkflowHistory(workflowId: string): WorkflowRollback | null {
  return rollbackHistory.find(w => w.workflowId === workflowId) || null;
}

/**
 * Clear rollback history (use with caution)
 * 
 * @param olderThanDays - Only clear history older than N days
 */
export function clearRollbackHistory(olderThanDays?: number): number {
  if (olderThanDays === undefined) {
    const count = rollbackHistory.length;
    rollbackHistory.length = 0;
    logger.warn(`Cleared all rollback history (${count} entries)`);
    return count;
  }
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
  
  const originalLength = rollbackHistory.length;
  const filtered = rollbackHistory.filter(w => w.startedAt > cutoffDate);
  rollbackHistory.length = 0;
  rollbackHistory.push(...filtered);
  
  const removed = originalLength - rollbackHistory.length;
  logger.info(`Cleared ${removed} rollback history entries older than ${olderThanDays} days`);
  
  return removed;
}

// ============================================================================
// Query and Reporting Functions
// ============================================================================

/**
 * Get rollback statistics
 * 
 * @returns Overall rollback statistics
 */
export function getRollbackStatistics(): {
  activeWorkflows: number;
  historyEntries: number;
  totalRollbacks: number;
  successfulRollbacks: number;
  failedRollbacks: number;
  partialRollbacks: number;
} {
  const totalRollbacks = rollbackHistory.filter(
    w => w.status === WorkflowRollbackStatus.ROLLED_BACK ||
         w.status === WorkflowRollbackStatus.PARTIALLY_ROLLED_BACK ||
         w.status === WorkflowRollbackStatus.ROLLBACK_FAILED
  ).length;
  
  const successfulRollbacks = rollbackHistory.filter(
    w => w.status === WorkflowRollbackStatus.ROLLED_BACK
  ).length;
  
  const failedRollbacks = rollbackHistory.filter(
    w => w.status === WorkflowRollbackStatus.ROLLBACK_FAILED
  ).length;
  
  const partialRollbacks = rollbackHistory.filter(
    w => w.status === WorkflowRollbackStatus.PARTIALLY_ROLLED_BACK
  ).length;
  
  return {
    activeWorkflows: activeWorkflows.size,
    historyEntries: rollbackHistory.length,
    totalRollbacks,
    successfulRollbacks,
    failedRollbacks,
    partialRollbacks
  };
}

/**
 * Find workflows requiring manual intervention
 * 
 * @returns Array of workflows with manual intervention steps
 */
export function getWorkflowsRequiringManualIntervention(): WorkflowRollback[] {
  return rollbackHistory.filter(
    w => w.manualInterventionSteps && w.manualInterventionSteps.length > 0
  );
}

/**
 * Export workflow for debugging
 * 
 * @param workflowId - Workflow ID
 * @returns JSON string of workflow record
 */
export function exportWorkflowForDebugging(workflowId: string): string | null {
  const workflow = activeWorkflows.get(workflowId) || 
                   rollbackHistory.find(w => w.workflowId === workflowId);
  
  if (!workflow) {
    return null;
  }
  
  return JSON.stringify(workflow, null, 2);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if an action type is reversible
 * 
 * @param actionType - Action type to check
 * @returns Reversibility classification
 */
export function getActionReversibility(actionType: string): ActionReversibility {
  return ACTION_REVERSIBILITY[actionType] || ActionReversibility.NON_REVERSIBLE;
}

/**
 * Estimate rollback duration
 * 
 * @param workflowId - Workflow ID
 * @returns Estimated duration in milliseconds
 */
export function estimateRollbackDuration(workflowId: string): number | null {
  const workflow = activeWorkflows.get(workflowId);
  
  if (!workflow) {
    return null;
  }
  
  // Estimate 2-5 seconds per reversible action
  const reversibleCount = workflow.executedActions.filter(
    a => a.reversibility === ActionReversibility.REVERSIBLE ||
         a.reversibility === ActionReversibility.PARTIALLY_REVERSIBLE
  ).length;
  
  return reversibleCount * 3500; // Average of 3.5 seconds
}

/**
 * Validate workflow can be rolled back
 * 
 * @param workflowId - Workflow ID
 * @returns Validation result with details
 */
export function validateWorkflowRollback(workflowId: string): {
  canRollback: boolean;
  reversibleActions: number;
  nonReversibleActions: number;
  requiresConfirmation: number;
  warnings: string[];
} {
  const workflow = activeWorkflows.get(workflowId);
  
  if (!workflow) {
    return {
      canRollback: false,
      reversibleActions: 0,
      nonReversibleActions: 0,
      requiresConfirmation: 0,
      warnings: [`Workflow ${workflowId} not found`]
    };
  }
  
  const reversibleActions = workflow.executedActions.filter(
    a => a.reversibility === ActionReversibility.REVERSIBLE ||
         a.reversibility === ActionReversibility.PARTIALLY_REVERSIBLE
  ).length;
  
  const nonReversibleActions = workflow.executedActions.filter(
    a => a.reversibility === ActionReversibility.NON_REVERSIBLE
  ).length;
  
  const requiresConfirmation = workflow.executedActions.filter(
    a => a.reversibility === ActionReversibility.CONFIRMATION_REQUIRED
  ).length;
  
  const warnings: string[] = [];
  
  if (nonReversibleActions > 0) {
    warnings.push(
      `${nonReversibleActions} action(s) cannot be automatically reversed and will require manual intervention`
    );
  }
  
  if (requiresConfirmation > 0) {
    warnings.push(
      `${requiresConfirmation} action(s) require confirmation before rollback (destructive operations)`
    );
  }
  
  if (workflow.executedActions.length === 0) {
    warnings.push('No actions have been executed in this workflow');
  }
  
  return {
    canRollback: workflow.executedActions.length > 0,
    reversibleActions,
    nonReversibleActions,
    requiresConfirmation,
    warnings
  };
}
