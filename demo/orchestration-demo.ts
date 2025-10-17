/**
 * Orchestration Demo Script
 * 
 * Demonstrates all orchestration layer capabilities:
 * - Action routing to appropriate executors
 * - Priority queue management
 * - Multi-step workflow execution
 * - Error handling with retry
 * - Rollback on failure
 * - Approval flow for high-impact actions
 * - Real-time metrics dashboard
 * 
 * Usage: npm run demo:orchestration
 */

import { performance } from 'perf_hooks';

// ==================== Types ====================

interface Action {
  id: string;
  type: string;
  platform: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  data: Record<string, any>;
  requiresApproval?: boolean;
}

interface ActionResult {
  actionId: string;
  status: 'success' | 'failed' | 'pending_approval';
  executionTime: number;
  error?: string;
  result?: any;
}

interface WorkflowStep {
  name: string;
  action: Action;
  dependsOn?: string[];
}

interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
}

interface CircuitBreakerState {
  platform: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
}

interface DemoMetrics {
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  pendingApproval: number;
  avgExecutionTime: number;
  totalExecutionTime: number;
  actionsByPlatform: Record<string, number>;
  actionsByPriority: Record<string, number>;
  retryCount: number;
  rollbackCount: number;
}

// ==================== Console Colors ====================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

// ==================== Logging Utilities ====================

class DemoLogger {
  private indent = 0;

  header(text: string): void {
    console.log('\n' + '='.repeat(80));
    console.log(colors.bright + colors.cyan + text + colors.reset);
    console.log('='.repeat(80) + '\n');
  }

  section(text: string): void {
    console.log('\n' + colors.bright + colors.blue + '▶ ' + text + colors.reset);
    console.log(colors.dim + '-'.repeat(80) + colors.reset);
  }

  success(text: string): void {
    const indentation = '  '.repeat(this.indent);
    console.log(indentation + colors.green + '✓ ' + text + colors.reset);
  }

  error(text: string): void {
    const indentation = '  '.repeat(this.indent);
    console.log(indentation + colors.red + '✗ ' + text + colors.reset);
  }

  warning(text: string): void {
    const indentation = '  '.repeat(this.indent);
    console.log(indentation + colors.yellow + '⚠ ' + text + colors.reset);
  }

  info(text: string): void {
    const indentation = '  '.repeat(this.indent);
    console.log(indentation + colors.cyan + 'ℹ ' + text + colors.reset);
  }

  step(text: string): void {
    const indentation = '  '.repeat(this.indent);
    console.log(indentation + colors.magenta + '→ ' + text + colors.reset);
  }

  data(label: string, value: any): void {
    const indentation = '  '.repeat(this.indent);
    console.log(indentation + colors.dim + label + ': ' + colors.reset + JSON.stringify(value));
  }

  increaseIndent(): void {
    this.indent++;
  }

  decreaseIndent(): void {
    if (this.indent > 0) this.indent--;
  }

  table(data: Record<string, any>): void {
    console.log('');
    Object.entries(data).forEach(([key, value]) => {
      const formattedKey = key.padEnd(25, ' ');
      console.log(`  ${colors.cyan}${formattedKey}${colors.reset}: ${colors.bright}${value}${colors.reset}`);
    });
  }
}

const logger = new DemoLogger();

// ==================== Demo Metrics ====================

class MetricsCollector {
  private metrics: DemoMetrics = {
    totalActions: 0,
    successfulActions: 0,
    failedActions: 0,
    pendingApproval: 0,
    avgExecutionTime: 0,
    totalExecutionTime: 0,
    actionsByPlatform: {},
    actionsByPriority: {},
    retryCount: 0,
    rollbackCount: 0,
  };

  recordAction(action: Action, result: ActionResult): void {
    this.metrics.totalActions++;
    this.metrics.totalExecutionTime += result.executionTime;

    if (result.status === 'success') {
      this.metrics.successfulActions++;
    } else if (result.status === 'failed') {
      this.metrics.failedActions++;
    } else if (result.status === 'pending_approval') {
      this.metrics.pendingApproval++;
    }

    // Track by platform
    this.metrics.actionsByPlatform[action.platform] = 
      (this.metrics.actionsByPlatform[action.platform] || 0) + 1;

    // Track by priority
    this.metrics.actionsByPriority[action.priority] = 
      (this.metrics.actionsByPriority[action.priority] || 0) + 1;
  }

  recordRetry(): void {
    this.metrics.retryCount++;
  }

  recordRollback(): void {
    this.metrics.rollbackCount++;
  }

  getMetrics(): DemoMetrics {
    return {
      ...this.metrics,
      avgExecutionTime: this.metrics.totalActions > 0 
        ? this.metrics.totalExecutionTime / this.metrics.totalActions 
        : 0,
    };
  }

  printSummary(): void {
    const metrics = this.getMetrics();

    logger.header('📊 DEMO SUMMARY');

    logger.section('Execution Statistics');
    logger.table({
      'Total Actions': metrics.totalActions,
      'Successful': `${metrics.successfulActions} (${((metrics.successfulActions / metrics.totalActions) * 100).toFixed(1)}%)`,
      'Failed': `${metrics.failedActions} (${((metrics.failedActions / metrics.totalActions) * 100).toFixed(1)}%)`,
      'Pending Approval': metrics.pendingApproval,
      'Retry Attempts': metrics.retryCount,
      'Rollback Operations': metrics.rollbackCount,
    });

    logger.section('Performance Metrics');
    logger.table({
      'Average Execution Time': `${metrics.avgExecutionTime.toFixed(2)}ms`,
      'Total Execution Time': `${metrics.totalExecutionTime.toFixed(2)}ms`,
      'Throughput': `${(metrics.totalActions / (metrics.totalExecutionTime / 1000)).toFixed(2)} actions/sec`,
    });

    logger.section('Actions by Platform');
    logger.table(metrics.actionsByPlatform);

    logger.section('Actions by Priority');
    logger.table(metrics.actionsByPriority);
  }
}

const metricsCollector = new MetricsCollector();

// ==================== Mock Executors ====================

class MockExecutor {
  async execute(action: Action): Promise<any> {
    // Simulate network delay
    await this.delay(50 + Math.random() * 150);

    switch (action.platform) {
      case 'notion':
        return this.executeNotion(action);
      case 'trello':
        return this.executeTrello(action);
      case 'slack':
        return this.executeSlack(action);
      case 'drive':
        return this.executeDrive(action);
      case 'sheets':
        return this.executeSheets(action);
      default:
        throw new Error(`Unknown platform: ${action.platform}`);
    }
  }

  private async executeNotion(action: Action): Promise<any> {
    switch (action.type) {
      case 'create_task':
        return {
          pageId: `notion-${Date.now()}`,
          url: `https://notion.so/${Date.now()}`,
          title: action.data.title,
        };
      case 'update_task':
        return {
          pageId: action.data.pageId,
          updated: true,
        };
      default:
        throw new Error(`Unknown Notion action: ${action.type}`);
    }
  }

  private async executeTrello(action: Action): Promise<any> {
    switch (action.type) {
      case 'create_card':
        return {
          cardId: `trello-${Date.now()}`,
          url: `https://trello.com/c/${Date.now()}`,
          name: action.data.name,
        };
      case 'add_label':
        return {
          cardId: action.data.cardId,
          labelId: `label-${Date.now()}`,
        };
      default:
        throw new Error(`Unknown Trello action: ${action.type}`);
    }
  }

  private async executeSlack(action: Action): Promise<any> {
    switch (action.type) {
      case 'send_message':
        return {
          messageId: `msg-${Date.now()}`,
          channel: action.data.channel,
          ts: `${Date.now() / 1000}`,
        };
      case 'request_approval':
        return {
          messageId: `msg-${Date.now()}`,
          channel: action.data.channel,
          pending: true,
        };
      default:
        throw new Error(`Unknown Slack action: ${action.type}`);
    }
  }

  private async executeDrive(action: Action): Promise<any> {
    switch (action.type) {
      case 'create_file':
        return {
          fileId: `file-${Date.now()}`,
          url: `https://drive.google.com/file/d/${Date.now()}`,
          name: action.data.name,
        };
      case 'delete_file':
        return {
          fileId: action.data.fileId,
          deleted: true,
        };
      default:
        throw new Error(`Unknown Drive action: ${action.type}`);
    }
  }

  private async executeSheets(action: Action): Promise<any> {
    switch (action.type) {
      case 'append_row':
        return {
          spreadsheetId: action.data.spreadsheetId,
          row: Math.floor(Math.random() * 100) + 1,
          values: action.data.values,
        };
      case 'delete_row':
        return {
          spreadsheetId: action.data.spreadsheetId,
          row: action.data.row,
          deleted: true,
        };
      default:
        throw new Error(`Unknown Sheets action: ${action.type}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const mockExecutor = new MockExecutor();

// ==================== Action Router ====================

class ActionRouter {
  route(action: Action): string {
    // Simple routing based on platform
    return `${action.platform}-executor`;
  }

  validateAction(action: Action): boolean {
    // Validate required fields
    if (!action.id || !action.type || !action.platform || !action.priority) {
      return false;
    }

    // Validate priority
    if (!['critical', 'high', 'normal', 'low'].includes(action.priority)) {
      return false;
    }

    return true;
  }
}

const actionRouter = new ActionRouter();

// ==================== Priority Queue ====================

class PriorityQueue {
  private queues: {
    critical: Action[];
    high: Action[];
    normal: Action[];
    low: Action[];
  } = {
    critical: [],
    high: [],
    normal: [],
    low: [],
  };

  enqueue(action: Action): void {
    this.queues[action.priority].push(action);
  }

  dequeue(): Action | undefined {
    // Check priorities in order
    for (const priority of ['critical', 'high', 'normal', 'low'] as const) {
      if (this.queues[priority].length > 0) {
        return this.queues[priority].shift();
      }
    }
    return undefined;
  }

  size(): number {
    return Object.values(this.queues).reduce((sum, queue) => sum + queue.length, 0);
  }

  getStatus(): Record<string, number> {
    return {
      critical: this.queues.critical.length,
      high: this.queues.high.length,
      normal: this.queues.normal.length,
      low: this.queues.low.length,
      total: this.size(),
    };
  }
}

const priorityQueue = new PriorityQueue();

// ==================== Retry Manager ====================

class RetryManager {
  private maxRetries = 3;
  private initialDelay = 100; // ms
  private backoffMultiplier = 2;

  async executeWithRetry(action: Action, attempt = 1): Promise<any> {
    try {
      return await mockExecutor.execute(action);
    } catch (error) {
      if (attempt < this.maxRetries) {
        const delay = this.initialDelay * Math.pow(this.backoffMultiplier, attempt - 1);
        logger.warning(`Retry ${attempt}/${this.maxRetries} after ${delay}ms: ${action.type}`);
        metricsCollector.recordRetry();
        
        await this.delay(delay);
        return this.executeWithRetry(action, attempt + 1);
      }
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const retryManager = new RetryManager();

// ==================== Circuit Breaker ====================

class CircuitBreaker {
  private states: Map<string, CircuitBreakerState> = new Map();
  private failureThreshold = 3;
  private resetTimeout = 5000; // ms

  getState(platform: string): CircuitBreakerState {
    if (!this.states.has(platform)) {
      this.states.set(platform, {
        platform,
        state: 'CLOSED',
        failureCount: 0,
      });
    }
    return this.states.get(platform)!;
  }

  recordSuccess(platform: string): void {
    const state = this.getState(platform);
    state.failureCount = 0;
    state.state = 'CLOSED';
  }

  recordFailure(platform: string): void {
    const state = this.getState(platform);
    state.failureCount++;

    if (state.failureCount >= this.failureThreshold) {
      state.state = 'OPEN';
      logger.warning(`Circuit breaker OPEN for ${platform}`);

      // Auto-reset after timeout
      setTimeout(() => {
        state.state = 'HALF_OPEN';
        logger.info(`Circuit breaker HALF_OPEN for ${platform}`);
      }, this.resetTimeout);
    }
  }

  canExecute(platform: string): boolean {
    const state = this.getState(platform);
    return state.state !== 'OPEN';
  }

  getAllStates(): CircuitBreakerState[] {
    return Array.from(this.states.values());
  }
}

const circuitBreaker = new CircuitBreaker();

// ==================== Rollback Coordinator ====================

class RollbackCoordinator {
  private operations: Map<string, Array<{ name: string; rollback: () => Promise<void> }>> = new Map();

  register(workflowId: string, operation: { name: string; rollback: () => Promise<void> }): void {
    if (!this.operations.has(workflowId)) {
      this.operations.set(workflowId, []);
    }
    this.operations.get(workflowId)!.push(operation);
  }

  async rollback(workflowId: string): Promise<void> {
    const ops = this.operations.get(workflowId);
    if (!ops || ops.length === 0) {
      logger.warning(`No operations to rollback for workflow ${workflowId}`);
      return;
    }

    logger.section(`Rolling back ${ops.length} operations (LIFO order)`);
    logger.increaseIndent();

    // Rollback in reverse order (LIFO)
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      try {
        logger.step(`Rolling back: ${op.name}`);
        await op.rollback();
        logger.success(`Rolled back: ${op.name}`);
        metricsCollector.recordRollback();
      } catch (error) {
        logger.error(`Failed to rollback ${op.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    logger.decreaseIndent();
    this.operations.delete(workflowId);
  }

  clear(workflowId: string): void {
    this.operations.delete(workflowId);
  }
}

const rollbackCoordinator = new RollbackCoordinator();

// ==================== Approval Handler ====================

class ApprovalHandler {
  private pendingApprovals: Map<string, Action> = new Map();

  async requestApproval(action: Action): Promise<boolean> {
    this.pendingApprovals.set(action.id, action);

    logger.warning(`Approval required for action: ${action.type}`);
    logger.increaseIndent();
    logger.data('Action ID', action.id);
    logger.data('Platform', action.platform);
    logger.data('Impact', 'High');
    logger.decreaseIndent();

    // In demo mode, auto-approve after delay
    await this.delay(200);
    
    const approved = Math.random() > 0.2; // 80% approval rate
    
    if (approved) {
      logger.success('✓ Approval granted by user');
      this.pendingApprovals.delete(action.id);
      return true;
    } else {
      logger.error('✗ Approval denied by user');
      this.pendingApprovals.delete(action.id);
      return false;
    }
  }

  getPendingCount(): number {
    return this.pendingApprovals.size;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const approvalHandler = new ApprovalHandler();

// ==================== Orchestrator ====================

class Orchestrator {
  async executeAction(action: Action): Promise<ActionResult> {
    const startTime = performance.now();

    try {
      // Validate action
      if (!actionRouter.validateAction(action)) {
        throw new Error('Invalid action');
      }

      // Route action
      const executor = actionRouter.route(action);
      logger.info(`Routed to: ${executor}`);

      // Check circuit breaker
      if (!circuitBreaker.canExecute(action.platform)) {
        throw new Error(`Circuit breaker OPEN for ${action.platform}`);
      }

      // Check if approval required
      if (action.requiresApproval) {
        const approved = await approvalHandler.requestApproval(action);
        if (!approved) {
          const executionTime = performance.now() - startTime;
          const result: ActionResult = {
            actionId: action.id,
            status: 'pending_approval',
            executionTime,
            error: 'Approval denied',
          };
          metricsCollector.recordAction(action, result);
          return result;
        }
      }

      // Execute with retry
      const actionResult = await retryManager.executeWithRetry(action);

      // Record success
      circuitBreaker.recordSuccess(action.platform);

      const executionTime = performance.now() - startTime;
      const result: ActionResult = {
        actionId: action.id,
        status: 'success',
        executionTime,
        result: actionResult,
      };

      metricsCollector.recordAction(action, result);
      return result;

    } catch (error) {
      // Record failure
      circuitBreaker.recordFailure(action.platform);

      const executionTime = performance.now() - startTime;
      const result: ActionResult = {
        actionId: action.id,
        status: 'failed',
        executionTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      metricsCollector.recordAction(action, result);
      return result;
    }
  }

  async executeWorkflow(workflow: Workflow): Promise<void> {
    logger.section(`Executing Workflow: ${workflow.name}`);
    logger.increaseIndent();

    const completedSteps = new Set<string>();
    let workflowFailed = false;

    try {
      for (const step of workflow.steps) {
        // Check dependencies
        if (step.dependsOn && step.dependsOn.length > 0) {
          const allDependenciesMet = step.dependsOn.every(dep => completedSteps.has(dep));
          if (!allDependenciesMet) {
            throw new Error(`Dependencies not met for step: ${step.name}`);
          }
        }

        logger.step(`Step: ${step.name}`);
        logger.increaseIndent();

        const result = await this.executeAction(step.action);

        if (result.status === 'success') {
          logger.success(`${step.action.type} completed in ${result.executionTime.toFixed(2)}ms`);
          
          // Register rollback operation
          rollbackCoordinator.register(workflow.id, {
            name: step.name,
            rollback: async () => {
              // Mock rollback operation
              await this.delay(50);
            },
          });

          completedSteps.add(step.name);
        } else {
          logger.error(`${step.action.type} failed: ${result.error}`);
          workflowFailed = true;
          break;
        }

        logger.decreaseIndent();
      }

      if (workflowFailed) {
        logger.warning('Workflow failed, initiating rollback...');
        await rollbackCoordinator.rollback(workflow.id);
      } else {
        logger.success(`Workflow "${workflow.name}" completed successfully`);
        rollbackCoordinator.clear(workflow.id);
      }

    } catch (error) {
      logger.error(`Workflow error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await rollbackCoordinator.rollback(workflow.id);
    }

    logger.decreaseIndent();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const orchestrator = new Orchestrator();

// ==================== Demo Scenarios ====================

async function demo1_ActionRouting(): Promise<void> {
  logger.header('📋 DEMO 1: ACTION ROUTING');
  logger.info('Demonstrating how different action types are routed to appropriate executors\n');

  const actions: Action[] = [
    {
      id: 'action-1',
      type: 'create_task',
      platform: 'notion',
      priority: 'normal',
      data: { title: 'Review Q4 roadmap' },
    },
    {
      id: 'action-2',
      type: 'create_card',
      platform: 'trello',
      priority: 'normal',
      data: { name: 'Bug: Login timeout', list: 'Backlog' },
    },
    {
      id: 'action-3',
      type: 'send_message',
      platform: 'slack',
      priority: 'normal',
      data: { channel: '#engineering', text: 'Deploy complete!' },
    },
    {
      id: 'action-4',
      type: 'create_file',
      platform: 'drive',
      priority: 'normal',
      data: { name: 'Invoice-2025-10.pdf', content: 'Invoice data...' },
    },
    {
      id: 'action-5',
      type: 'append_row',
      platform: 'sheets',
      priority: 'normal',
      data: { spreadsheetId: 'sheet-123', values: ['2025-10-17', 'Demo', '$100'] },
    },
  ];

  for (const action of actions) {
    logger.section(`Action: ${action.type} (${action.platform})`);
    logger.increaseIndent();

    const result = await orchestrator.executeAction(action);

    if (result.status === 'success') {
      logger.success(`Completed in ${result.executionTime.toFixed(2)}ms`);
      logger.data('Result', result.result);
    } else {
      logger.error(`Failed: ${result.error}`);
    }

    logger.decreaseIndent();
    await delay(300);
  }
}

async function demo2_PriorityQueue(): Promise<void> {
  logger.header('⚡ DEMO 2: PRIORITY QUEUE');
  logger.info('Demonstrating how urgent actions jump ahead in the queue\n');

  const actions: Action[] = [
    {
      id: 'action-6',
      type: 'create_task',
      platform: 'notion',
      priority: 'low',
      data: { title: 'Update documentation' },
    },
    {
      id: 'action-7',
      type: 'create_task',
      platform: 'notion',
      priority: 'normal',
      data: { title: 'Review PR #123' },
    },
    {
      id: 'action-8',
      type: 'send_message',
      platform: 'slack',
      priority: 'critical',
      data: { channel: '#incidents', text: 'Production issue detected!' },
    },
    {
      id: 'action-9',
      type: 'create_task',
      platform: 'notion',
      priority: 'high',
      data: { title: 'Fix critical bug' },
    },
  ];

  logger.section('Enqueuing actions with different priorities');
  logger.increaseIndent();

  for (const action of actions) {
    priorityQueue.enqueue(action);
    logger.info(`Enqueued: ${action.type} [${action.priority.toUpperCase()}]`);
  }

  logger.decreaseIndent();

  logger.section('Queue Status');
  logger.table(priorityQueue.getStatus());

  logger.section('Processing queue (notice order)');
  logger.increaseIndent();

  let action: Action | undefined;
  while ((action = priorityQueue.dequeue()) !== undefined) {
    logger.step(`Processing: ${action.type} [${action.priority.toUpperCase()}]`);
    const result = await orchestrator.executeAction(action);
    
    if (result.status === 'success') {
      logger.success(`Completed in ${result.executionTime.toFixed(2)}ms`);
    }
    
    await delay(200);
  }

  logger.decreaseIndent();
}

async function demo3_MultiStepWorkflow(): Promise<void> {
  logger.header('🔄 DEMO 3: MULTI-STEP WORKFLOW');
  logger.info('Demonstrating invoice processing workflow with multiple platforms\n');

  const workflow: Workflow = {
    id: 'workflow-invoice-001',
    name: 'Invoice Processing',
    steps: [
      {
        name: 'create_invoice_file',
        action: {
          id: 'action-10',
          type: 'create_file',
          platform: 'drive',
          priority: 'high',
          data: {
            name: 'Invoice-2025-10-17.pdf',
            content: 'Invoice data...',
            folder: 'Invoices',
          },
        },
      },
      {
        name: 'log_to_spreadsheet',
        action: {
          id: 'action-11',
          type: 'append_row',
          platform: 'sheets',
          priority: 'high',
          data: {
            spreadsheetId: 'finance-log',
            values: ['2025-10-17', 'Invoice-2025-10-17.pdf', '$1,250.00', 'Created'],
          },
        },
        dependsOn: ['create_invoice_file'],
      },
      {
        name: 'notify_finance_team',
        action: {
          id: 'action-12',
          type: 'send_message',
          platform: 'slack',
          priority: 'high',
          data: {
            channel: '#finance',
            text: 'New invoice created: Invoice-2025-10-17.pdf ($1,250.00)',
          },
        },
        dependsOn: ['log_to_spreadsheet'],
      },
      {
        name: 'create_followup_task',
        action: {
          id: 'action-13',
          type: 'create_task',
          platform: 'notion',
          priority: 'high',
          data: {
            title: 'Follow up on Invoice-2025-10-17',
            database: 'finance-tasks',
            properties: {
              status: 'Todo',
              priority: 'High',
              due: '2025-10-24',
            },
          },
        },
        dependsOn: ['notify_finance_team'],
      },
    ],
  };

  await orchestrator.executeWorkflow(workflow);
}

async function demo4_ErrorHandlingRetry(): Promise<void> {
  logger.header('🔧 DEMO 4: ERROR HANDLING & RETRY');
  logger.info('Demonstrating automatic retry on transient failures\n');

  // Mock an action that fails twice then succeeds
  let attemptCount = 0;
  const originalExecute = mockExecutor.execute.bind(mockExecutor);
  
  mockExecutor.execute = async function(action: Action): Promise<any> {
    if (action.id === 'action-14') {
      attemptCount++;
      if (attemptCount <= 2) {
        logger.warning(`Simulated transient failure (attempt ${attemptCount})`);
        throw new Error('Network timeout');
      }
    }
    return originalExecute(action);
  };

  const action: Action = {
    id: 'action-14',
    type: 'create_task',
    platform: 'notion',
    priority: 'normal',
    data: { title: 'Flaky network test' },
  };

  logger.section('Executing action with simulated failures');
  logger.increaseIndent();

  const result = await orchestrator.executeAction(action);

  if (result.status === 'success') {
    logger.success(`Action succeeded after ${attemptCount} attempts`);
    logger.data('Total time', `${result.executionTime.toFixed(2)}ms`);
  }

  logger.decreaseIndent();

  // Restore original executor
  mockExecutor.execute = originalExecute;
}

async function demo5_RollbackOnFailure(): Promise<void> {
  logger.header('⏮️  DEMO 5: ROLLBACK ON FAILURE');
  logger.info('Demonstrating automatic rollback when workflow fails mid-execution\n');

  // Mock an action that always fails
  const originalExecute = mockExecutor.execute.bind(mockExecutor);
  
  mockExecutor.execute = async function(action: Action): Promise<any> {
    if (action.id === 'action-17') {
      logger.error('Simulated permanent failure: Payment processing failed');
      throw new Error('Payment gateway unavailable');
    }
    return originalExecute(action);
  };

  const workflow: Workflow = {
    id: 'workflow-order-001',
    name: 'Order Processing (with failure)',
    steps: [
      {
        name: 'create_order_record',
        action: {
          id: 'action-15',
          type: 'append_row',
          platform: 'sheets',
          priority: 'high',
          data: {
            spreadsheetId: 'orders',
            values: ['ORD-001', '2025-10-17', '$500', 'Pending'],
          },
        },
      },
      {
        name: 'reserve_inventory',
        action: {
          id: 'action-16',
          type: 'create_task',
          platform: 'notion',
          priority: 'high',
          data: {
            title: 'Reserve: Widget x 5',
            database: 'inventory',
          },
        },
        dependsOn: ['create_order_record'],
      },
      {
        name: 'process_payment',
        action: {
          id: 'action-17',
          type: 'send_message',
          platform: 'slack',
          priority: 'critical',
          data: {
            channel: '#payments',
            text: 'Processing payment for ORD-001',
          },
        },
        dependsOn: ['reserve_inventory'],
      },
      {
        name: 'send_confirmation',
        action: {
          id: 'action-18',
          type: 'send_message',
          platform: 'slack',
          priority: 'high',
          data: {
            channel: '#orders',
            text: 'Order confirmed: ORD-001',
          },
        },
        dependsOn: ['process_payment'],
      },
    ],
  };

  await orchestrator.executeWorkflow(workflow);

  // Restore original executor
  mockExecutor.execute = originalExecute;
}

async function demo6_ApprovalFlow(): Promise<void> {
  logger.header('👤 DEMO 6: APPROVAL FLOW');
  logger.info('Demonstrating human-in-the-loop approval for high-impact actions\n');

  const actions: Action[] = [
    {
      id: 'action-19',
      type: 'create_task',
      platform: 'notion',
      priority: 'high',
      data: {
        title: 'Delete production database',
        database: 'admin-tasks',
      },
      requiresApproval: true,
    },
    {
      id: 'action-20',
      type: 'send_message',
      platform: 'slack',
      priority: 'critical',
      data: {
        channel: '#everyone',
        text: '@channel Company-wide announcement',
      },
      requiresApproval: true,
    },
  ];

  for (const action of actions) {
    logger.section(`High-impact action: ${action.type}`);
    logger.increaseIndent();

    const result = await orchestrator.executeAction(action);

    if (result.status === 'success') {
      logger.success(`Action approved and executed in ${result.executionTime.toFixed(2)}ms`);
    } else if (result.status === 'pending_approval') {
      logger.warning('Action blocked: Approval denied');
    }

    logger.decreaseIndent();
    await delay(300);
  }
}

async function demo7_MetricsDashboard(): Promise<void> {
  logger.header('📊 DEMO 7: METRICS DASHBOARD');
  logger.info('Demonstrating real-time metrics collection\n');

  logger.section('Circuit Breaker Status');
  logger.increaseIndent();
  
  const circuitStates = circuitBreaker.getAllStates();
  if (circuitStates.length === 0) {
    logger.info('All circuit breakers: CLOSED (healthy)');
  } else {
    circuitStates.forEach(state => {
      const emoji = state.state === 'CLOSED' ? '✓' : '⚠';
      logger.info(`${emoji} ${state.platform}: ${state.state} (failures: ${state.failureCount})`);
    });
  }
  
  logger.decreaseIndent();

  logger.section('Current Metrics');
  const currentMetrics = metricsCollector.getMetrics();
  logger.table({
    'Actions Executed': currentMetrics.totalActions,
    'Success Rate': `${((currentMetrics.successfulActions / currentMetrics.totalActions) * 100).toFixed(1)}%`,
    'Avg Execution Time': `${currentMetrics.avgExecutionTime.toFixed(2)}ms`,
    'Pending Approvals': approvalHandler.getPendingCount(),
  });
}

// ==================== Main Demo Runner ====================

async function runAllDemos(): Promise<void> {
  console.clear();
  
  logger.header('🚀 AI OPERATIONS COMMAND CENTER - ORCHESTRATION DEMO');
  logger.info('This demo showcases all orchestration layer capabilities');
  logger.info('Demo mode: No real API calls are made\n');

  await delay(1000);

  try {
    await demo1_ActionRouting();
    await delay(1000);

    await demo2_PriorityQueue();
    await delay(1000);

    await demo3_MultiStepWorkflow();
    await delay(1000);

    await demo4_ErrorHandlingRetry();
    await delay(1000);

    await demo5_RollbackOnFailure();
    await delay(1000);

    await demo6_ApprovalFlow();
    await delay(1000);

    await demo7_MetricsDashboard();
    await delay(1000);

    metricsCollector.printSummary();

    logger.header('✨ DEMO COMPLETE');
    logger.success('All orchestration capabilities demonstrated successfully!');
    logger.info('\nKey Takeaways:');
    logger.increaseIndent();
    logger.step('Actions are intelligently routed to appropriate executors');
    logger.step('Priority queue ensures urgent actions are processed first');
    logger.step('Multi-step workflows coordinate actions across platforms');
    logger.step('Automatic retry with exponential backoff handles transient failures');
    logger.step('Rollback mechanisms ensure consistency on workflow failure');
    logger.step('Human-in-the-loop approval protects high-impact actions');
    logger.step('Real-time metrics provide operational visibility');
    logger.decreaseIndent();

    logger.info('\nNext Steps:');
    logger.increaseIndent();
    logger.step('Review documentation: docs/ORCHESTRATION.md');
    logger.step('Explore API reference: docs/ORCHESTRATION_API.md');
    logger.step('Check operational runbook: docs/ORCHESTRATION_RUNBOOK.md');
    logger.step('Run tests: npm test');
    logger.decreaseIndent();

    // Export demo data
    exportDemoData();

  } catch (error) {
    logger.error('Demo failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
}

// ==================== Demo Data Export ====================

function exportDemoData(): void {
  const metrics = metricsCollector.getMetrics();
  
  const demoData = {
    timestamp: new Date().toISOString(),
    summary: {
      totalActions: metrics.totalActions,
      successfulActions: metrics.successfulActions,
      failedActions: metrics.failedActions,
      pendingApproval: metrics.pendingApproval,
      successRate: `${((metrics.successfulActions / metrics.totalActions) * 100).toFixed(1)}%`,
      avgExecutionTime: `${metrics.avgExecutionTime.toFixed(2)}ms`,
    },
    breakdown: {
      byPlatform: metrics.actionsByPlatform,
      byPriority: metrics.actionsByPriority,
    },
    errorHandling: {
      retryAttempts: metrics.retryCount,
      rollbackOperations: metrics.rollbackCount,
    },
    circuitBreakers: circuitBreaker.getAllStates(),
  };

  // In a real scenario, this would write to a file
  logger.info('\n' + colors.dim + 'Demo data available for export:' + colors.reset);
  logger.data('Export data', demoData);
}

// ==================== Utility ====================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== Run Demo ====================

if (require.main === module) {
  runAllDemos().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export {
  Orchestrator,
  ActionRouter,
  PriorityQueue,
  RetryManager,
  CircuitBreaker,
  RollbackCoordinator,
  ApprovalHandler,
  MetricsCollector,
  DemoLogger,
};
