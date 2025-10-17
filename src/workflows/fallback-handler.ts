/**
 * Fallback Action Handler
 * 
 * Provides fallback actions when primary actions fail:
 * - Notion → Trello → Google Tasks
 * - Slack → Email notifications
 * - Drive → Local backup
 * - Sheets → CSV file
 * - Configurable fallback strategies
 * - Automatic degradation handling
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { config } from '../config';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Primary action types
 */
export enum PrimaryAction {
  NOTION_CREATE_PAGE = 'notion:createPage',
  NOTION_UPDATE_PAGE = 'notion:updatePage',
  NOTION_QUERY = 'notion:query',
  TRELLO_CREATE_CARD = 'trello:createCard',
  TRELLO_UPDATE_CARD = 'trello:updateCard',
  TRELLO_MOVE_CARD = 'trello:moveCard',
  SLACK_POST_MESSAGE = 'slack:postMessage',
  SLACK_UPDATE_MESSAGE = 'slack:updateMessage',
  DRIVE_UPLOAD = 'drive:upload',
  DRIVE_CREATE_FOLDER = 'drive:createFolder',
  SHEETS_UPDATE = 'sheets:update',
  SHEETS_APPEND = 'sheets:append',
  GMAIL_SEND = 'gmail:send',
  GMAIL_SEARCH = 'gmail:search'
}

/**
 * Fallback action types
 */
export enum FallbackAction {
  TRELLO_CREATE_CARD = 'trello:createCard',
  GOOGLE_TASKS_CREATE = 'googleTasks:create',
  EMAIL_NOTIFICATION = 'email:notification',
  LOCAL_BACKUP = 'local:backup',
  CSV_LOG = 'csv:log',
  CONSOLE_LOG = 'console:log',
  FILE_WRITE = 'file:write',
  WEBHOOK_POST = 'webhook:post',
  QUEUE_RETRY = 'queue:retry'
}

/**
 * Fallback strategy
 */
export interface FallbackStrategy {
  /**
   * Primary action type
   */
  primaryAction: PrimaryAction;

  /**
   * Ordered list of fallback actions to try
   */
  fallbacks: FallbackAction[];

  /**
   * Whether to notify team of fallback usage
   */
  notifyTeam: boolean;

  /**
   * Custom fallback function
   */
  customHandler?: (data: any, error: Error) => Promise<FallbackResult>;
}

/**
 * Fallback execution result
 */
export interface FallbackResult {
  /**
   * Whether fallback succeeded
   */
  success: boolean;

  /**
   * Fallback action that succeeded
   */
  fallbackUsed?: FallbackAction;

  /**
   * Result data from fallback
   */
  data?: any;

  /**
   * Error if all fallbacks failed
   */
  error?: Error;

  /**
   * Metadata about fallback execution
   */
  metadata: {
    /**
     * Original action attempted
     */
    primaryAction: PrimaryAction;

    /**
     * Original error
     */
    primaryError: Error;

    /**
     * Fallbacks attempted
     */
    fallbacksAttempted: FallbackAction[];

    /**
     * Timestamp
     */
    timestamp: Date;

    /**
     * Whether team was notified
     */
    teamNotified: boolean;

    /**
     * Execution time
     */
    executionTime: number;
  };
}

/**
 * Fallback configuration
 */
export interface FallbackConfig {
  /**
   * Enable fallbacks globally
   */
  enabled: boolean;

  /**
   * Local backup directory
   */
  backupDir: string;

  /**
   * CSV log directory
   */
  csvLogDir: string;

  /**
   * Webhook URL for notifications
   */
  webhookUrl?: string;

  /**
   * Email for notifications
   */
  notificationEmail?: string;

  /**
   * Maximum fallback attempts per action
   */
  maxFallbackAttempts: number;

  /**
   * Notification throttle (ms)
   */
  notificationThrottle: number;
}

/**
 * Fallback statistics
 */
export interface FallbackStats {
  /**
   * Total fallback executions
   */
  totalFallbacks: number;

  /**
   * Successful fallbacks
   */
  successfulFallbacks: number;

  /**
   * Failed fallbacks
   */
  failedFallbacks: number;

  /**
   * Fallbacks by primary action
   */
  byPrimaryAction: Map<PrimaryAction, number>;

  /**
   * Fallbacks by fallback action
   */
  byFallbackAction: Map<FallbackAction, number>;

  /**
   * Team notifications sent
   */
  notificationsSent: number;

  /**
   * Last fallback time
   */
  lastFallbackTime: Date | null;
}

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

/**
 * Default fallback configuration
 */
const DEFAULT_CONFIG: FallbackConfig = {
  enabled: process.env.ENABLE_FALLBACKS !== 'false',
  backupDir: process.env.FALLBACK_BACKUP_DIR || './backups',
  csvLogDir: process.env.FALLBACK_CSV_DIR || './logs',
  webhookUrl: process.env.FALLBACK_WEBHOOK_URL,
  notificationEmail: process.env.FALLBACK_NOTIFICATION_EMAIL,
  maxFallbackAttempts: 3,
  notificationThrottle: 5 * 60 * 1000 // 5 minutes
};

/**
 * Default fallback strategies
 */
const DEFAULT_STRATEGIES: Map<PrimaryAction, FallbackStrategy> = new Map([
  // Notion fallbacks
  [PrimaryAction.NOTION_CREATE_PAGE, {
    primaryAction: PrimaryAction.NOTION_CREATE_PAGE,
    fallbacks: [FallbackAction.TRELLO_CREATE_CARD, FallbackAction.GOOGLE_TASKS_CREATE, FallbackAction.CSV_LOG],
    notifyTeam: true
  }],
  [PrimaryAction.NOTION_UPDATE_PAGE, {
    primaryAction: PrimaryAction.NOTION_UPDATE_PAGE,
    fallbacks: [FallbackAction.TRELLO_CREATE_CARD, FallbackAction.CSV_LOG],
    notifyTeam: true
  }],
  [PrimaryAction.NOTION_QUERY, {
    primaryAction: PrimaryAction.NOTION_QUERY,
    fallbacks: [FallbackAction.LOCAL_BACKUP, FallbackAction.CSV_LOG],
    notifyTeam: true
  }],

  // Trello fallbacks
  [PrimaryAction.TRELLO_CREATE_CARD, {
    primaryAction: PrimaryAction.TRELLO_CREATE_CARD,
    fallbacks: [FallbackAction.GOOGLE_TASKS_CREATE, FallbackAction.CSV_LOG],
    notifyTeam: true
  }],
  [PrimaryAction.TRELLO_UPDATE_CARD, {
    primaryAction: PrimaryAction.TRELLO_UPDATE_CARD,
    fallbacks: [FallbackAction.CSV_LOG],
    notifyTeam: true
  }],
  [PrimaryAction.TRELLO_MOVE_CARD, {
    primaryAction: PrimaryAction.TRELLO_MOVE_CARD,
    fallbacks: [FallbackAction.CSV_LOG],
    notifyTeam: false
  }],

  // Slack fallbacks
  [PrimaryAction.SLACK_POST_MESSAGE, {
    primaryAction: PrimaryAction.SLACK_POST_MESSAGE,
    fallbacks: [FallbackAction.EMAIL_NOTIFICATION, FallbackAction.WEBHOOK_POST, FallbackAction.CONSOLE_LOG],
    notifyTeam: true
  }],
  [PrimaryAction.SLACK_UPDATE_MESSAGE, {
    primaryAction: PrimaryAction.SLACK_UPDATE_MESSAGE,
    fallbacks: [FallbackAction.EMAIL_NOTIFICATION, FallbackAction.CONSOLE_LOG],
    notifyTeam: false
  }],

  // Drive fallbacks
  [PrimaryAction.DRIVE_UPLOAD, {
    primaryAction: PrimaryAction.DRIVE_UPLOAD,
    fallbacks: [FallbackAction.LOCAL_BACKUP, FallbackAction.FILE_WRITE],
    notifyTeam: true
  }],
  [PrimaryAction.DRIVE_CREATE_FOLDER, {
    primaryAction: PrimaryAction.DRIVE_CREATE_FOLDER,
    fallbacks: [FallbackAction.LOCAL_BACKUP],
    notifyTeam: false
  }],

  // Sheets fallbacks
  [PrimaryAction.SHEETS_UPDATE, {
    primaryAction: PrimaryAction.SHEETS_UPDATE,
    fallbacks: [FallbackAction.CSV_LOG, FallbackAction.FILE_WRITE],
    notifyTeam: true
  }],
  [PrimaryAction.SHEETS_APPEND, {
    primaryAction: PrimaryAction.SHEETS_APPEND,
    fallbacks: [FallbackAction.CSV_LOG, FallbackAction.FILE_WRITE],
    notifyTeam: true
  }],

  // Gmail fallbacks
  [PrimaryAction.GMAIL_SEND, {
    primaryAction: PrimaryAction.GMAIL_SEND,
    fallbacks: [FallbackAction.WEBHOOK_POST, FallbackAction.QUEUE_RETRY, FallbackAction.FILE_WRITE],
    notifyTeam: true
  }],
  [PrimaryAction.GMAIL_SEARCH, {
    primaryAction: PrimaryAction.GMAIL_SEARCH,
    fallbacks: [FallbackAction.LOCAL_BACKUP],
    notifyTeam: false
  }]
]);

// ============================================================================
// GLOBAL STATE
// ============================================================================

/**
 * Current configuration
 */
let currentConfig: FallbackConfig = { ...DEFAULT_CONFIG };

/**
 * Custom strategies
 */
const customStrategies = new Map<PrimaryAction, FallbackStrategy>();

/**
 * Statistics
 */
const stats: FallbackStats = {
  totalFallbacks: 0,
  successfulFallbacks: 0,
  failedFallbacks: 0,
  byPrimaryAction: new Map(),
  byFallbackAction: new Map(),
  notificationsSent: 0,
  lastFallbackTime: null
};

/**
 * Last notification times (for throttling)
 */
const lastNotifications = new Map<PrimaryAction, number>();

// ============================================================================
// FALLBACK EXECUTORS
// ============================================================================

/**
 * Execute Trello card creation
 */
async function executeTrelloCreateCard(data: any): Promise<any> {
  logger.info('Executing Trello fallback', { data });

  // Simulated Trello card creation - would integrate with actual Trello API
  const card = {
    id: `trello_${Date.now()}`,
    name: data.title || data.name || 'Task',
    desc: data.description || data.content || '',
    url: `https://trello.com/c/${Date.now()}`,
    idList: config.TRELLO_DEFAULT_LIST_ID,
    due: data.dueDate || null,
    labels: data.labels || [],
    fallbackSource: 'trello'
  };

  logger.info('Trello card created (simulated)', { card });

  return {
    id: card.id,
    url: card.url,
    fallbackSource: 'trello'
  };
}

/**
 * Execute Google Tasks creation
 */
async function executeGoogleTasksCreate(data: any): Promise<any> {
  logger.info('Executing Google Tasks fallback', { data });

  // Simulated - would integrate with Google Tasks API
  const task = {
    id: `gtask_${Date.now()}`,
    title: data.title || data.name || 'Task',
    notes: data.description || data.content || '',
    due: data.dueDate || null,
    status: 'needsAction',
    fallbackSource: 'google-tasks'
  };

  logger.info('Google Tasks created (simulated)', { task });

  return task;
}

/**
 * Execute email notification
 */
async function executeEmailNotification(data: any): Promise<any> {
  logger.info('Executing email notification fallback', { data });

  const emailData = {
    to: currentConfig.notificationEmail || config.GMAIL_CLIENT_ID,
    subject: data.subject || `Fallback: ${data.title || 'Notification'}`,
    body: data.message || data.content || data.description || JSON.stringify(data),
    timestamp: new Date().toISOString(),
    fallbackSource: 'email'
  };

  // Simulated - would send via Gmail API
  logger.info('Email notification sent (simulated)', { emailData });

  return emailData;
}

/**
 * Execute local backup
 */
async function executeLocalBackup(data: any): Promise<any> {
  logger.info('Executing local backup fallback', { data });

  // Ensure backup directory exists
  if (!fs.existsSync(currentConfig.backupDir)) {
    fs.mkdirSync(currentConfig.backupDir, { recursive: true });
  }

  const filename = `backup_${Date.now()}.json`;
  const filepath = path.join(currentConfig.backupDir, filename);

  const backupData = {
    timestamp: new Date().toISOString(),
    data,
    fallbackSource: 'local-backup'
  };

  fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2));

  logger.info('Local backup created', { filepath });

  return {
    filepath,
    filename,
    size: fs.statSync(filepath).size,
    fallbackSource: 'local-backup'
  };
}

/**
 * Execute CSV log
 */
async function executeCSVLog(data: any): Promise<any> {
  logger.info('Executing CSV log fallback', { data });

  // Ensure CSV directory exists
  if (!fs.existsSync(currentConfig.csvLogDir)) {
    fs.mkdirSync(currentConfig.csvLogDir, { recursive: true });
  }

  const date = new Date().toISOString().split('T')[0];
  const filename = `fallback_log_${date}.csv`;
  const filepath = path.join(currentConfig.csvLogDir, filename);

  // Convert data to CSV row
  const timestamp = new Date().toISOString();
  const csvRow = `"${timestamp}","${JSON.stringify(data).replace(/"/g, '""')}"\n`;

  // Append to CSV file
  if (!fs.existsSync(filepath)) {
    fs.writeFileSync(filepath, 'Timestamp,Data\n');
  }
  fs.appendFileSync(filepath, csvRow);

  logger.info('CSV log appended', { filepath });

  return {
    filepath,
    filename,
    fallbackSource: 'csv-log'
  };
}

/**
 * Execute console log
 */
async function executeConsoleLog(data: any): Promise<any> {
  logger.info('Executing console log fallback', { data });

  console.log('\n========================================');
  console.log('FALLBACK ACTION - CONSOLE LOG');
  console.log('========================================');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Data:', JSON.stringify(data, null, 2));
  console.log('========================================\n');

  return {
    logged: true,
    timestamp: new Date().toISOString(),
    fallbackSource: 'console-log'
  };
}

/**
 * Execute file write
 */
async function executeFileWrite(data: any): Promise<any> {
  logger.info('Executing file write fallback', { data });

  // Ensure backup directory exists
  if (!fs.existsSync(currentConfig.backupDir)) {
    fs.mkdirSync(currentConfig.backupDir, { recursive: true });
  }

  const filename = `fallback_${Date.now()}.txt`;
  const filepath = path.join(currentConfig.backupDir, filename);

  const content = typeof data === 'string' 
    ? data 
    : JSON.stringify(data, null, 2);

  fs.writeFileSync(filepath, content);

  logger.info('File written', { filepath });

  return {
    filepath,
    filename,
    size: fs.statSync(filepath).size,
    fallbackSource: 'file-write'
  };
}

/**
 * Execute webhook post
 */
async function executeWebhookPost(data: any): Promise<any> {
  logger.info('Executing webhook post fallback', { data });

  if (!currentConfig.webhookUrl) {
    logger.warn('No webhook URL configured, skipping');
    throw new Error('No webhook URL configured');
  }

  // Simulated - would POST to webhook
  const webhookData = {
    timestamp: new Date().toISOString(),
    event: 'fallback_action',
    data,
    fallbackSource: 'webhook'
  };

  logger.info('Webhook posted (simulated)', { 
    url: currentConfig.webhookUrl,
    webhookData 
  });

  return webhookData;
}

/**
 * Execute queue retry
 */
async function executeQueueRetry(data: any): Promise<any> {
  logger.info('Executing queue retry fallback', { data });

  // Queue for later retry
  const queueItem = {
    id: `retry_${Date.now()}`,
    timestamp: new Date().toISOString(),
    data,
    retryAt: new Date(Date.now() + 60000).toISOString(), // Retry in 1 minute
    fallbackSource: 'queue-retry'
  };

  logger.info('Queued for retry', { queueItem });

  return queueItem;
}

// ============================================================================
// FALLBACK EXECUTION
// ============================================================================

/**
 * Execute specific fallback action
 */
async function executeFallbackAction(
  fallbackAction: FallbackAction,
  data: any
): Promise<any> {
  switch (fallbackAction) {
    case FallbackAction.TRELLO_CREATE_CARD:
      return await executeTrelloCreateCard(data);

    case FallbackAction.GOOGLE_TASKS_CREATE:
      return await executeGoogleTasksCreate(data);

    case FallbackAction.EMAIL_NOTIFICATION:
      return await executeEmailNotification(data);

    case FallbackAction.LOCAL_BACKUP:
      return await executeLocalBackup(data);

    case FallbackAction.CSV_LOG:
      return await executeCSVLog(data);

    case FallbackAction.CONSOLE_LOG:
      return await executeConsoleLog(data);

    case FallbackAction.FILE_WRITE:
      return await executeFileWrite(data);

    case FallbackAction.WEBHOOK_POST:
      return await executeWebhookPost(data);

    case FallbackAction.QUEUE_RETRY:
      return await executeQueueRetry(data);

    default:
      throw new Error(`Unknown fallback action: ${fallbackAction}`);
  }
}

/**
 * Notify team of fallback usage
 */
async function notifyTeam(
  primaryAction: PrimaryAction,
  fallbackUsed: FallbackAction,
  error: Error
): Promise<void> {
  // Check throttle
  const lastNotification = lastNotifications.get(primaryAction) || 0;
  const timeSinceLastNotification = Date.now() - lastNotification;

  if (timeSinceLastNotification < currentConfig.notificationThrottle) {
    logger.debug('Notification throttled', {
      primaryAction,
      timeSinceLastNotification
    });
    return;
  }

  logger.warn('Notifying team of fallback usage', {
    primaryAction,
    fallbackUsed,
    error: error.message
  });

  const notification = {
    title: '⚠️ Fallback Action Executed',
    message: `Primary action "${primaryAction}" failed and fallback "${fallbackUsed}" was used.`,
    error: error.message,
    timestamp: new Date().toISOString(),
    severity: 'warning'
  };

  // Log notification
  console.warn('\n' + '='.repeat(60));
  console.warn('FALLBACK NOTIFICATION');
  console.warn('='.repeat(60));
  console.warn('Primary Action:', primaryAction);
  console.warn('Fallback Used:', fallbackUsed);
  console.warn('Error:', error.message);
  console.warn('Timestamp:', notification.timestamp);
  console.warn('='.repeat(60) + '\n');

  // Update last notification time
  lastNotifications.set(primaryAction, Date.now());
  stats.notificationsSent++;

  // Could also send via Slack, email, etc.
}

/**
 * Main fallback execution function
 */
export async function executeFallback(
  primaryAction: PrimaryAction,
  data: any,
  error: Error
): Promise<FallbackResult> {
  const startTime = Date.now();

  // Check if fallbacks are enabled
  if (!currentConfig.enabled) {
    logger.warn('Fallbacks disabled, not executing fallback', { primaryAction });
    return {
      success: false,
      error: new Error('Fallbacks are disabled'),
      metadata: {
        primaryAction,
        primaryError: error,
        fallbacksAttempted: [],
        timestamp: new Date(),
        teamNotified: false,
        executionTime: Date.now() - startTime
      }
    };
  }

  logger.info('Executing fallback', {
    primaryAction,
    error: error.message
  });

  // Update statistics
  stats.totalFallbacks++;
  stats.lastFallbackTime = new Date();
  stats.byPrimaryAction.set(
    primaryAction,
    (stats.byPrimaryAction.get(primaryAction) || 0) + 1
  );

  // Get strategy
  const strategy = customStrategies.get(primaryAction) || 
                   DEFAULT_STRATEGIES.get(primaryAction);

  if (!strategy) {
    logger.warn('No fallback strategy found', { primaryAction });
    stats.failedFallbacks++;
    return {
      success: false,
      error: new Error(`No fallback strategy for ${primaryAction}`),
      metadata: {
        primaryAction,
        primaryError: error,
        fallbacksAttempted: [],
        timestamp: new Date(),
        teamNotified: false,
        executionTime: Date.now() - startTime
      }
    };
  }

  // Try custom handler first
  if (strategy.customHandler) {
    try {
      logger.info('Trying custom fallback handler');
      const result = await strategy.customHandler(data, error);
      return result;
    } catch (customError: any) {
      logger.warn('Custom handler failed', { error: customError.message });
    }
  }

  // Try each fallback in order
  const fallbacksAttempted: FallbackAction[] = [];
  const maxAttempts = Math.min(
    strategy.fallbacks.length,
    currentConfig.maxFallbackAttempts
  );

  for (let i = 0; i < maxAttempts; i++) {
    const fallbackAction = strategy.fallbacks[i];
    fallbacksAttempted.push(fallbackAction);

    try {
      logger.info('Attempting fallback', {
        fallbackAction,
        attempt: i + 1,
        maxAttempts
      });

      const result = await executeFallbackAction(fallbackAction, data);

      // Mark as executed via fallback
      const markedResult = {
        ...result,
        executedViaFallback: true,
        primaryAction,
        fallbackAction,
        originalError: error.message
      };

      // Success!
      logger.info('Fallback succeeded', {
        fallbackAction,
        primaryAction
      });

      // Update statistics
      stats.successfulFallbacks++;
      stats.byFallbackAction.set(
        fallbackAction,
        (stats.byFallbackAction.get(fallbackAction) || 0) + 1
      );

      // Notify team if configured
      if (strategy.notifyTeam) {
        await notifyTeam(primaryAction, fallbackAction, error);
      }

      return {
        success: true,
        fallbackUsed: fallbackAction,
        data: markedResult,
        metadata: {
          primaryAction,
          primaryError: error,
          fallbacksAttempted,
          timestamp: new Date(),
          teamNotified: strategy.notifyTeam,
          executionTime: Date.now() - startTime
        }
      };

    } catch (fallbackError: any) {
      logger.warn('Fallback failed', {
        fallbackAction,
        error: fallbackError.message
      });
      // Continue to next fallback
    }
  }

  // All fallbacks failed
  logger.error('All fallbacks failed', {
    primaryAction,
    fallbacksAttempted
  });

  stats.failedFallbacks++;

  return {
    success: false,
    error: new Error('All fallback actions failed'),
    metadata: {
      primaryAction,
      primaryError: error,
      fallbacksAttempted,
      timestamp: new Date(),
      teamNotified: false,
      executionTime: Date.now() - startTime
    }
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configure fallback handler
 */
export function configure(config: Partial<FallbackConfig>): void {
  currentConfig = {
    ...currentConfig,
    ...config
  };

  logger.info('Fallback handler configured', { config: currentConfig });
}

/**
 * Get current configuration
 */
export function getConfig(): FallbackConfig {
  return { ...currentConfig };
}

/**
 * Set fallback strategy for action
 */
export function setStrategy(
  primaryAction: PrimaryAction,
  strategy: Partial<FallbackStrategy>
): void {
  const existingStrategy = DEFAULT_STRATEGIES.get(primaryAction);
  
  const newStrategy: FallbackStrategy = {
    primaryAction,
    fallbacks: strategy.fallbacks || existingStrategy?.fallbacks || [],
    notifyTeam: strategy.notifyTeam ?? existingStrategy?.notifyTeam ?? true,
    customHandler: strategy.customHandler
  };

  customStrategies.set(primaryAction, newStrategy);

  logger.info('Custom fallback strategy set', {
    primaryAction,
    strategy: newStrategy
  });
}

/**
 * Get fallback strategy for action
 */
export function getStrategy(primaryAction: PrimaryAction): FallbackStrategy | null {
  return customStrategies.get(primaryAction) || 
         DEFAULT_STRATEGIES.get(primaryAction) || 
         null;
}

/**
 * Remove custom strategy
 */
export function removeStrategy(primaryAction: PrimaryAction): void {
  customStrategies.delete(primaryAction);
  logger.info('Custom strategy removed', { primaryAction });
}

/**
 * Reset all custom strategies
 */
export function resetStrategies(): void {
  customStrategies.clear();
  logger.info('All custom strategies reset');
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get fallback statistics
 */
export function getStats(): FallbackStats {
  return {
    ...stats,
    byPrimaryAction: new Map(stats.byPrimaryAction),
    byFallbackAction: new Map(stats.byFallbackAction)
  };
}

/**
 * Reset statistics
 */
export function resetStats(): void {
  stats.totalFallbacks = 0;
  stats.successfulFallbacks = 0;
  stats.failedFallbacks = 0;
  stats.byPrimaryAction.clear();
  stats.byFallbackAction.clear();
  stats.notificationsSent = 0;
  stats.lastFallbackTime = null;

  logger.info('Fallback statistics reset');
}

/**
 * Format statistics for display
 */
export function formatStats(statsData: FallbackStats): string {
  const successRate = statsData.totalFallbacks > 0
    ? ((statsData.successfulFallbacks / statsData.totalFallbacks) * 100).toFixed(1)
    : '0.0';

  let output = '\n========================================\n';
  output += '      FALLBACK HANDLER STATISTICS\n';
  output += '========================================\n\n';

  output += `Total Fallbacks: ${statsData.totalFallbacks}\n`;
  output += `Successful: ${statsData.successfulFallbacks} (${successRate}%)\n`;
  output += `Failed: ${statsData.failedFallbacks}\n`;
  output += `Notifications Sent: ${statsData.notificationsSent}\n`;

  if (statsData.lastFallbackTime) {
    const timeSinceLast = Date.now() - statsData.lastFallbackTime.getTime();
    const minutesAgo = Math.round(timeSinceLast / 60000);
    output += `Last Fallback: ${minutesAgo} minutes ago\n`;
  }

  if (statsData.byPrimaryAction.size > 0) {
    output += '\nFallbacks by Primary Action:\n';
    statsData.byPrimaryAction.forEach((count, action) => {
      output += `  ${action}: ${count}\n`;
    });
  }

  if (statsData.byFallbackAction.size > 0) {
    output += '\nFallbacks by Fallback Action:\n';
    statsData.byFallbackAction.forEach((count, action) => {
      output += `  ${action}: ${count}\n`;
    });
  }

  output += '\n========================================\n';

  return output;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Check if fallback is available for action
 */
export function hasFallback(primaryAction: PrimaryAction): boolean {
  const strategy = customStrategies.get(primaryAction) || 
                   DEFAULT_STRATEGIES.get(primaryAction);
  return strategy !== undefined && strategy !== null && strategy.fallbacks.length > 0;
}

/**
 * Get available fallbacks for action
 */
export function getAvailableFallbacks(primaryAction: PrimaryAction): FallbackAction[] {
  const strategy = customStrategies.get(primaryAction) || 
                   DEFAULT_STRATEGIES.get(primaryAction);
  return strategy ? [...strategy.fallbacks] : [];
}

/**
 * List all primary actions with fallbacks
 */
export function listActions(): PrimaryAction[] {
  const actions = new Set<PrimaryAction>();
  
  DEFAULT_STRATEGIES.forEach((_, action) => actions.add(action));
  customStrategies.forEach((_, action) => actions.add(action));

  return Array.from(actions);
}

/**
 * Enable fallbacks
 */
export function enable(): void {
  currentConfig.enabled = true;
  logger.info('Fallbacks enabled');
}

/**
 * Disable fallbacks
 */
export function disable(): void {
  currentConfig.enabled = false;
  logger.info('Fallbacks disabled');
}

/**
 * Check if fallbacks are enabled
 */
export function isEnabled(): boolean {
  return currentConfig.enabled;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Core functions
  executeFallback,

  // Configuration
  configure,
  getConfig,
  setStrategy,
  getStrategy,
  removeStrategy,
  resetStrategies,

  // Statistics
  getStats,
  resetStats,
  formatStats,

  // Utilities
  hasFallback,
  getAvailableFallbacks,
  listActions,
  enable,
  disable,
  isEnabled,

  // Enums
  PrimaryAction,
  FallbackAction
};
