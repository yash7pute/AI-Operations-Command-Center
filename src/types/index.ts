// Shared TypeScript types and interfaces
export interface AppConfig {
  gmailClientId?: string;
  gmailClientSecret?: string;
}
export interface SlackMessage {
    channel: string;
    text: string;
    attachments?: Array<{
        text: string;
        color?: string;
        fields?: Array<{ title: string; value: string; short?: boolean }>;
    }>;
}

export interface GoogleAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

export interface NotionDatabaseQuery {
    filter?: {
        property: string;
        text: {
            contains: string;
        };
    };
    sorts?: Array<{
        property: string;
        direction: 'ascending' | 'descending';
    }>;
}

export interface AppConfig {
    slackToken: string;
    googleAuth: GoogleAuthConfig;
    notionToken: string;
}

// Action Routing Types (Member 3: Orchestration)

/**
 * Reasoning result from Member 2 (Reasoning Engine)
 * Contains the decision about what action to take
 */
export interface ReasoningResult {
    correlationId: string;
    action: string; // e.g., "create_task", "send_notification", "file_document", "update_sheet"
    target: string; // e.g., "notion", "trello", "slack", "drive", "sheets"
    params: Record<string, any>; // Action-specific parameters
    confidence?: number;
    reasoning?: string; // Why this action was chosen
    metadata?: {
        signalId?: string;
        source?: string;
        priority?: number;
        timestamp?: string;
    };
}

/**
 * Result of action execution
 * Returned by executors and routing system
 */
export interface ExecutionResult {
    success: boolean;
    data?: any; // Execution result data (e.g., task ID, URL, etc.)
    error?: string; // Error message if failed
    executionTime?: number; // Time taken in milliseconds
    executorUsed?: string; // Which executor was used
}

/**
 * Action mapping configuration
 * Maps action+target combinations to executor methods
 */
export interface ActionMapping {
    action: string;
    target: string;
    executorMethod: string; // Method name to call on executor
}

/**
 * Validation result for actions
 */
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

/**
 * Health check result for platforms
 */
export interface HealthCheckResult {
    platform: string;
    isHealthy: boolean;
    latency?: number;
    error?: string;
}

// Executor Interfaces (Stubs for now, will be implemented in prompts 4-9)

/**
 * Notion Executor Interface
 * Handles Notion-specific actions
 */
export interface INotionExecutor {
    createTask(taskDetails: TaskDetails, params?: any): Promise<ExecutionResult>;
    updateTask?(pageId: string, updates: Partial<TaskDetails>): Promise<ExecutionResult>;
    addComment?(pageId: string, comment: string): Promise<ExecutionResult>;
}

/**
 * Trello Executor Interface
 * Handles Trello-specific actions
 */
export interface ITrelloExecutor {
    createCard(params: any): Promise<ExecutionResult>;
    moveCard?(cardId: string, listId: string): Promise<ExecutionResult>;
    addChecklist?(cardId: string, items: string[]): Promise<ExecutionResult>;
}

/**
 * Slack Executor Interface
 * Handles Slack-specific actions
 */
export interface ISlackExecutor {
    sendMessage(params: any): Promise<ExecutionResult>;
    sendNotification?(params: any): Promise<ExecutionResult>;
    replyInThread?(threadTs: string, message: string): Promise<ExecutionResult>;
}

/**
 * Google Drive Executor Interface
 * Handles Drive-specific actions
 */
export interface IDriveExecutor {
    uploadFile(params: any): Promise<ExecutionResult>;
    fileDocument?(params: any): Promise<ExecutionResult>;
    moveFile?(fileId: string, folderId: string): Promise<ExecutionResult>;
}

/**
 * Google Sheets Executor Interface
 * Handles Sheets-specific actions
 */
export interface ISheetsExecutor {
    updateRow(params: any): Promise<ExecutionResult>;
    appendRow?(params: any): Promise<ExecutionResult>;
    updateCell?(params: any): Promise<ExecutionResult>;
}

// Queue Manager Types (Member 3: Orchestration - Queue Management)

/**
 * Action status in the queue
 */
export type ActionStatus = 'pending' | 'executing' | 'completed' | 'failed';

/**
 * Queued action with metadata
 * Wraps a reasoning result with queue management information
 */
export interface QueuedAction {
    id: string; // Unique identifier
    reasoningResult: ReasoningResult; // The action to execute
    priority: number; // 1 = highest, 5 = lowest
    status: ActionStatus; // Current status
    attempts: number; // Number of execution attempts
    createdAt: string; // ISO timestamp when enqueued
    executedAt?: string; // ISO timestamp when executed (if completed/failed)
    lastAttemptAt?: string; // ISO timestamp of last execution attempt
    error?: string; // Error message if failed
}

/**
 * Queue statistics
 * Provides insights into queue health and performance
 */
export interface QueueStats {
    pending: number; // Number of pending actions
    executing: number; // Number of currently executing actions
    completed: number; // Number of completed actions
    failed: number; // Number of failed actions
    total: number; // Total actions in queue
    avgWaitTime: number; // Average wait time in milliseconds
    oldestPendingAge?: number; // Age of oldest pending action in ms
}

/**
 * Rate limit configuration per platform
 * Prevents overwhelming external APIs
 */
export interface RateLimitConfig {
    platform: string; // Platform name (notion, trello, slack, etc.)
    minDelayMs: number; // Minimum delay between actions in milliseconds
    lastExecutionTime: number; // Timestamp of last execution
}

/**
 * Queue persistence data structure
 * Used for saving/loading queue state to/from disk
 */
export interface QueuePersistenceData {
    actions: QueuedAction[];
    lastSaved: string; // ISO timestamp
    version: string; // Schema version for future compatibility
}

// Execution Logger Types (Member 3: Orchestration - Execution Logging)

/**
 * Execution status
 */
export type ExecutionStatus = 'started' | 'success' | 'failed';

/**
 * Complete execution log entry
 * Records every action execution with full context for audit trail
 */
export interface ExecutionLog {
    actionId: string; // Unique action identifier
    correlationId: string; // From reasoning result for tracing
    action: string; // Action type (e.g., "create_task")
    target: string; // Target platform (e.g., "notion")
    params: Record<string, any>; // Action parameters
    status: ExecutionStatus; // Execution status
    result?: any; // Execution result data (if success)
    error?: string; // Error message (if failed)
    executionTime: number; // Time taken in milliseconds
    timestamp: string; // ISO timestamp when logged
    retriedFrom?: string; // Original action ID if this is a retry
    attemptNumber?: number; // Which attempt (1, 2, 3)
    platform?: string; // Executor platform for grouping
}

/**
 * Filters for querying execution history
 */
export interface ExecutionFilters {
    actionId?: string; // Filter by specific action ID
    correlationId?: string; // Filter by correlation ID
    status?: ExecutionStatus; // Filter by status
    target?: string; // Filter by target platform
    action?: string; // Filter by action type
    startDate?: string; // Start of date range (ISO format)
    endDate?: string; // End of date range (ISO format)
    limit?: number; // Maximum number of results
    offset?: number; // Pagination offset
}

/**
 * Daily execution summary
 * Aggregated statistics for a specific day
 */
export interface DailySummary {
    date: string; // Date in YYYY-MM-DD format
    totalExecutions: number; // Total executions logged
    byStatus: {
        started: number;
        success: number;
        failed: number;
    };
    byTarget: {
        [platform: string]: {
            total: number;
            success: number;
            failed: number;
            avgExecutionTime: number;
        };
    };
    byAction: {
        [action: string]: {
            total: number;
            success: number;
            failed: number;
        };
    };
    avgExecutionTime: number; // Average across all executions
    slowestExecution?: ExecutionLog; // Slowest execution of the day
    fastestExecution?: ExecutionLog; // Fastest execution of the day
    successRate: number; // Percentage (0-100)
    generatedAt: string; // ISO timestamp when summary was created
}

/**
 * Real-time execution feed event
 */
export interface ExecutionFeedEvent {
    log: ExecutionLog;
    queueStats?: QueueStats; // Optional current queue stats
}

// Notion Executor Types (Member 3: Orchestration - Notion Integration)

/**
 * Task priority levels
 */
export type TaskPriority = 'High' | 'Medium' | 'Low';

/**
 * Task source (where the task originated from)
 */
export type TaskSource = 'Email' | 'Slack' | 'Sheet' | 'Manual';

/**
 * Task details for creating/updating tasks
 * Generic structure that can be mapped to any platform
 */
export interface TaskDetails {
    title: string; // Task title (required)
    description?: string; // Task description/content
    dueDate?: string; // Due date in ISO format
    priority?: TaskPriority; // Priority level
    labels?: string[]; // Tags/labels for categorization
    assignee?: string; // Assignee email or ID
    source?: TaskSource; // Where the task came from
    status?: string; // Task status (e.g., "To Do", "In Progress")
    project?: string; // Project name or ID
    metadata?: Record<string, any>; // Additional custom fields
}

/**
 * Notion page properties structure
 * Represents Notion-specific property format
 */
export interface NotionPageProperties {
    [key: string]: any; // Flexible property structure
}

/**
 * Result of Notion page creation
 */
export interface NotionCreateResult {
    pageId: string; // Notion page ID
    url: string; // Public URL to the page
    properties?: NotionPageProperties; // Created properties
}

/**
 * Result of Notion page update
 */
export interface NotionUpdateResult {
    pageId: string; // Notion page ID
    url: string; // Public URL to the page
    updatedProperties?: string[]; // List of updated property names
}

/**
 * Result of Notion comment creation
 */
export interface NotionCommentResult {
    commentId: string; // Comment ID
    pageId: string; // Page the comment was added to
    createdAt: string; // ISO timestamp
}

/**
 * Result of duplicate check operation
 */
export interface DuplicateCheckResult {
    isDuplicate: boolean; // Whether a duplicate was found
    existingPageId?: string; // Page ID of duplicate (if found)
    existingPageUrl?: string; // Public URL of duplicate (if found)
    similarity: number; // Similarity score (0-1)
    matchedTitle?: string; // Title of the matched duplicate
}