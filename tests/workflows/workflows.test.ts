/**
 * Workflow Integration Tests
 * 
 * End-to-end tests for multi-step workflows with:
 * - Complete workflow execution validation
 * - Rollback on failure
 * - Idempotency testing (run twice, execute once)
 * - Partial execution recovery
 * - Transaction consistency verification
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock Google Drive API
const mockDriveFilesCreate = jest.fn() as jest.MockedFunction<any>;
const mockDriveFilesDelete = jest.fn() as jest.MockedFunction<any>;
const mockDriveFilesList = jest.fn() as jest.MockedFunction<any>;

jest.mock('googleapis', () => ({
  google: {
    drive: jest.fn(() => ({
      files: {
        create: mockDriveFilesCreate,
        delete: mockDriveFilesDelete,
        list: mockDriveFilesList
      }
    })),
    sheets: jest.fn(() => ({
      spreadsheets: {
        values: {
          append: jest.fn(),
          update: jest.fn(),
          get: jest.fn()
        }
      }
    }))
  }
}));

// Mock Google Sheets API
const mockSheetsAppend = jest.fn() as jest.MockedFunction<any>;
const mockSheetsUpdate = jest.fn() as jest.MockedFunction<any>;
const mockSheetsGet = jest.fn() as jest.MockedFunction<any>;

// Mock Slack API
const mockSlackPostMessage = jest.fn() as jest.MockedFunction<any>;
const mockSlackChatUpdate = jest.fn() as jest.MockedFunction<any>;
const mockSlackChatDelete = jest.fn() as jest.MockedFunction<any>;

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: {
      postMessage: mockSlackPostMessage,
      update: mockSlackChatUpdate,
      delete: mockSlackChatDelete
    }
  }))
}));

// Mock Trello API
const mockTrelloCreateCard = jest.fn() as jest.MockedFunction<any>;
const mockTrelloUpdateCard = jest.fn() as jest.MockedFunction<any>;
const mockTrelloDeleteCard = jest.fn() as jest.MockedFunction<any>;
const mockTrelloAddLabelToCard = jest.fn() as jest.MockedFunction<any>;

jest.mock('trello', () => ({
  default: jest.fn().mockImplementation(() => ({
    addCard: mockTrelloCreateCard,
    updateCard: mockTrelloUpdateCard,
    deleteCard: mockTrelloDeleteCard,
    addLabelToCard: mockTrelloAddLabelToCard
  }))
}));

// Mock Notion API
const mockNotionPageCreate = jest.fn() as jest.MockedFunction<any>;
const mockNotionPageUpdate = jest.fn() as jest.MockedFunction<any>;
const mockNotionPageArchive = jest.fn() as jest.MockedFunction<any>;
const mockNotionDatabaseQuery = jest.fn() as jest.MockedFunction<any>;

jest.mock('@notionhq/client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    pages: {
      create: mockNotionPageCreate,
      update: mockNotionPageUpdate
    },
    databases: {
      query: mockNotionDatabaseQuery
    }
  }))
}));

// ============================================================================
// Workflow State Management
// ============================================================================

interface WorkflowState {
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';
  steps: StepState[];
  executedSteps: string[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface StepState {
  stepId: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';
  result?: any;
  error?: Error;
  startTime?: Date;
  endTime?: Date;
  rollbackData?: any;
}

class WorkflowStateManager {
  private states: Map<string, WorkflowState> = new Map();

  createWorkflow(workflowId: string, steps: string[]): WorkflowState {
    const state: WorkflowState = {
      workflowId,
      status: 'pending',
      steps: steps.map(name => ({
        stepId: `${workflowId}-${name}`,
        name,
        status: 'pending'
      })),
      executedSteps: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.states.set(workflowId, state);
    return state;
  }

  getWorkflow(workflowId: string): WorkflowState | undefined {
    return this.states.get(workflowId);
  }

  updateStepStatus(
    workflowId: string,
    stepName: string,
    status: StepState['status'],
    result?: any,
    error?: Error
  ): void {
    const state = this.states.get(workflowId);
    if (!state) return;

    const step = state.steps.find(s => s.name === stepName);
    if (!step) return;

    step.status = status;
    step.result = result;
    step.error = error;

    if (status === 'running') {
      step.startTime = new Date();
    } else if (status === 'completed' || status === 'failed') {
      step.endTime = new Date();
    }

    // Update workflow status
    if (status === 'completed' && !state.executedSteps.includes(stepName)) {
      state.executedSteps.push(stepName);
    }

    if (state.steps.every(s => s.status === 'completed')) {
      state.status = 'completed';
    } else if (state.steps.some(s => s.status === 'failed')) {
      state.status = 'failed';
    } else if (state.steps.some(s => s.status === 'running')) {
      state.status = 'running';
    }

    state.updatedAt = new Date();
  }

  isStepExecuted(workflowId: string, stepName: string): boolean {
    const state = this.states.get(workflowId);
    return state?.executedSteps.includes(stepName) || false;
  }

  storeRollbackData(workflowId: string, stepName: string, data: any): void {
    const state = this.states.get(workflowId);
    if (!state) return;

    const step = state.steps.find(s => s.name === stepName);
    if (step) {
      step.rollbackData = data;
    }
  }

  getRollbackData(workflowId: string, stepName: string): any {
    const state = this.states.get(workflowId);
    const step = state?.steps.find(s => s.name === stepName);
    return step?.rollbackData;
  }

  clear(): void {
    this.states.clear();
  }
}

// ============================================================================
// Workflow Executors
// ============================================================================

class InvoiceProcessingWorkflow {
  constructor(private stateManager: WorkflowStateManager) {}

  async execute(workflowId: string, invoice: {
    fileName: string;
    content: string;
    amount: number;
    vendor: string;
  }): Promise<{ success: boolean; results: any[] }> {
    const steps = ['file_attachment', 'update_sheet', 'notify_finance'];
    this.stateManager.createWorkflow(workflowId, steps);

    const results: any[] = [];

    try {
      // Step 1: File attachment in Drive
      const fileResult = await this.fileAttachment(workflowId, invoice);
      results.push(fileResult);

      // Step 2: Update accounting sheet
      const sheetResult = await this.updateAccountingSheet(workflowId, invoice, fileResult.fileId);
      results.push(sheetResult);

      // Step 3: Notify finance channel
      const notifyResult = await this.notifyFinanceChannel(workflowId, invoice, fileResult.link);
      results.push(notifyResult);

      return { success: true, results };
    } catch (error) {
      // Rollback on failure
      await this.rollback(workflowId, results);
      throw error;
    }
  }

  private async fileAttachment(workflowId: string, invoice: any): Promise<any> {
    const stepName = 'file_attachment';

    // Check idempotency
    if (this.stateManager.isStepExecuted(workflowId, stepName)) {
      const rollbackData = this.stateManager.getRollbackData(workflowId, stepName);
      return rollbackData;
    }

    this.stateManager.updateStepStatus(workflowId, stepName, 'running');

    try {
      const result = await mockDriveFilesCreate({
        requestBody: {
          name: invoice.fileName,
          mimeType: 'application/pdf'
        },
        media: {
          mimeType: 'application/pdf',
          body: invoice.content
        },
        fields: 'id, webViewLink'
      }) as any;

      const fileData = {
        fileId: result.data.id,
        link: result.data.webViewLink
      };

      this.stateManager.storeRollbackData(workflowId, stepName, fileData);
      this.stateManager.updateStepStatus(workflowId, stepName, 'completed', fileData);

      return fileData;
    } catch (error) {
      this.stateManager.updateStepStatus(workflowId, stepName, 'failed', undefined, error as Error);
      throw error;
    }
  }

  private async updateAccountingSheet(workflowId: string, invoice: any, fileId: string): Promise<any> {
    const stepName = 'update_sheet';

    // Check idempotency
    if (this.stateManager.isStepExecuted(workflowId, stepName)) {
      const rollbackData = this.stateManager.getRollbackData(workflowId, stepName);
      return rollbackData;
    }

    this.stateManager.updateStepStatus(workflowId, stepName, 'running');

    try {
      const timestamp = new Date().toISOString();
      const row = [timestamp, invoice.vendor, invoice.amount, fileId];

      const result = await mockSheetsAppend({
        spreadsheetId: 'accounting-sheet-123',
        range: 'Invoices!A:D',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [row]
        }
      }) as any;

      const sheetData = {
        range: result.data.updates.updatedRange,
        rowNumber: parseInt(result.data.updates.updatedRange.match(/\d+$/)?.[0] || '0')
      };

      this.stateManager.storeRollbackData(workflowId, stepName, sheetData);
      this.stateManager.updateStepStatus(workflowId, stepName, 'completed', sheetData);

      return sheetData;
    } catch (error) {
      this.stateManager.updateStepStatus(workflowId, stepName, 'failed', undefined, error as Error);
      throw error;
    }
  }

  private async notifyFinanceChannel(workflowId: string, invoice: any, fileLink: string): Promise<any> {
    const stepName = 'notify_finance';

    // Check idempotency
    if (this.stateManager.isStepExecuted(workflowId, stepName)) {
      const rollbackData = this.stateManager.getRollbackData(workflowId, stepName);
      return rollbackData;
    }

    this.stateManager.updateStepStatus(workflowId, stepName, 'running');

    try {
      const message = `New invoice received:\n*Vendor:* ${invoice.vendor}\n*Amount:* $${invoice.amount}\n*File:* ${fileLink}`;

      const result = await mockSlackPostMessage({
        channel: '#finance',
        text: message
      }) as any;

      const notifyData = {
        messageTs: result.ts,
        channel: '#finance'
      };

      this.stateManager.storeRollbackData(workflowId, stepName, notifyData);
      this.stateManager.updateStepStatus(workflowId, stepName, 'completed', notifyData);

      return notifyData;
    } catch (error) {
      this.stateManager.updateStepStatus(workflowId, stepName, 'failed', undefined, error as Error);
      throw error;
    }
  }

  private async rollback(workflowId: string, completedSteps: any[]): Promise<void> {
    const state = this.stateManager.getWorkflow(workflowId);
    if (!state) return;

    // Rollback in reverse order
    const completedStepNames = state.executedSteps.slice().reverse();

    for (const stepName of completedStepNames) {
      try {
        if (stepName === 'notify_finance') {
          const data = this.stateManager.getRollbackData(workflowId, stepName);
          if (data) {
            await mockSlackChatDelete({
              channel: data.channel,
              ts: data.messageTs
            });
          }
        } else if (stepName === 'update_sheet') {
          const data = this.stateManager.getRollbackData(workflowId, stepName);
          if (data) {
            // Clear the row
            await mockSheetsUpdate({
              spreadsheetId: 'accounting-sheet-123',
              range: data.range,
              valueInputOption: 'USER_ENTERED',
              requestBody: {
                values: [['', '', '', '']]
              }
            });
          }
        } else if (stepName === 'file_attachment') {
          const data = this.stateManager.getRollbackData(workflowId, stepName);
          if (data) {
            await mockDriveFilesDelete({
              fileId: data.fileId
            });
          }
        }

        this.stateManager.updateStepStatus(workflowId, stepName, 'rolled_back');
      } catch (error) {
        console.error(`Failed to rollback step ${stepName}:`, error);
      }
    }

    state.status = 'rolled_back';
  }

  async resume(workflowId: string, invoice: any): Promise<{ success: boolean; results: any[] }> {
    const state = this.stateManager.getWorkflow(workflowId);
    if (!state) {
      throw new Error('Workflow not found');
    }

    const results: any[] = [];

    try {
      // Resume from where we left off
      const fileResult = await this.fileAttachment(workflowId, invoice);
      results.push(fileResult);

      const sheetResult = await this.updateAccountingSheet(workflowId, invoice, fileResult.fileId);
      results.push(sheetResult);

      const notifyResult = await this.notifyFinanceChannel(workflowId, invoice, fileResult.link);
      results.push(notifyResult);

      return { success: true, results };
    } catch (error) {
      await this.rollback(workflowId, results);
      throw error;
    }
  }
}

class BugReportWorkflow {
  constructor(private stateManager: WorkflowStateManager) {}

  async execute(workflowId: string, bug: {
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    reporter: string;
  }): Promise<{ success: boolean; results: any[] }> {
    const steps = ['create_trello_card', 'notify_dev_team', 'update_tracking_sheet'];
    this.stateManager.createWorkflow(workflowId, steps);

    const results: any[] = [];

    try {
      // Step 1: Create Trello card
      const cardResult = await this.createTrelloCard(workflowId, bug);
      results.push(cardResult);

      // Step 2: Notify dev team
      const notifyResult = await this.notifyDevTeam(workflowId, bug, cardResult.cardUrl);
      results.push(notifyResult);

      // Step 3: Update bug tracking sheet
      const sheetResult = await this.updateTrackingSheet(workflowId, bug, cardResult.cardId);
      results.push(sheetResult);

      return { success: true, results };
    } catch (error) {
      await this.rollback(workflowId);
      throw error;
    }
  }

  private async createTrelloCard(workflowId: string, bug: any): Promise<any> {
    const stepName = 'create_trello_card';

    if (this.stateManager.isStepExecuted(workflowId, stepName)) {
      return this.stateManager.getRollbackData(workflowId, stepName);
    }

    this.stateManager.updateStepStatus(workflowId, stepName, 'running');

    try {
      const result = await mockTrelloCreateCard(
        bug.title,
        bug.description,
        'bugs-list-123'
      ) as any;

      // Add priority label
      const labelMap: Record<string, string> = {
        low: 'green',
        medium: 'yellow',
        high: 'orange',
        critical: 'red'
      };

      await mockTrelloAddLabelToCard(result.id, labelMap[bug.priority] as any);

      const cardData = {
        cardId: result.id,
        cardUrl: result.url || `https://trello.com/c/${result.id}`
      };

      this.stateManager.storeRollbackData(workflowId, stepName, cardData);
      this.stateManager.updateStepStatus(workflowId, stepName, 'completed', cardData);

      return cardData;
    } catch (error) {
      this.stateManager.updateStepStatus(workflowId, stepName, 'failed', undefined, error as Error);
      throw error;
    }
  }

  private async notifyDevTeam(workflowId: string, bug: any, cardUrl: string): Promise<any> {
    const stepName = 'notify_dev_team';

    if (this.stateManager.isStepExecuted(workflowId, stepName)) {
      return this.stateManager.getRollbackData(workflowId, stepName);
    }

    this.stateManager.updateStepStatus(workflowId, stepName, 'running');

    try {
      const priorityEmoji: Record<string, string> = {
        low: '🟢',
        medium: '🟡',
        high: '🟠',
        critical: '🔴'
      };

      const message = `${priorityEmoji[bug.priority] as any} *New Bug Report*\n*Title:* ${bug.title}\n*Priority:* ${bug.priority.toUpperCase()}\n*Reporter:* ${bug.reporter}\n*Card:* ${cardUrl}`;

      const result = await mockSlackPostMessage({
        channel: '#dev-team',
        text: message
      }) as any;

      const notifyData = {
        messageTs: result.ts,
        channel: '#dev-team'
      };

      this.stateManager.storeRollbackData(workflowId, stepName, notifyData);
      this.stateManager.updateStepStatus(workflowId, stepName, 'completed', notifyData);

      return notifyData;
    } catch (error) {
      this.stateManager.updateStepStatus(workflowId, stepName, 'failed', undefined, error as Error);
      throw error;
    }
  }

  private async updateTrackingSheet(workflowId: string, bug: any, cardId: string): Promise<any> {
    const stepName = 'update_tracking_sheet';

    if (this.stateManager.isStepExecuted(workflowId, stepName)) {
      return this.stateManager.getRollbackData(workflowId, stepName);
    }

    this.stateManager.updateStepStatus(workflowId, stepName, 'running');

    try {
      const timestamp = new Date().toISOString();
      const row = [timestamp, bug.title, bug.priority, bug.reporter, cardId, 'open'];

      const result = await mockSheetsAppend({
        spreadsheetId: 'bug-tracking-sheet-123',
        range: 'Bugs!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [row]
        }
      }) as any;

      const sheetData = {
        range: result.data.updates.updatedRange,
        rowNumber: parseInt(result.data.updates.updatedRange.match(/\d+$/)?.[0] || '0')
      };

      this.stateManager.storeRollbackData(workflowId, stepName, sheetData);
      this.stateManager.updateStepStatus(workflowId, stepName, 'completed', sheetData);

      return sheetData;
    } catch (error) {
      this.stateManager.updateStepStatus(workflowId, stepName, 'failed', undefined, error as Error);
      throw error;
    }
  }

  private async rollback(workflowId: string): Promise<void> {
    const state = this.stateManager.getWorkflow(workflowId);
    if (!state) return;

    const completedSteps = state.executedSteps.slice().reverse();

    for (const stepName of completedSteps) {
      try {
        if (stepName === 'update_tracking_sheet') {
          const data = this.stateManager.getRollbackData(workflowId, stepName);
          if (data) {
            await mockSheetsUpdate({
              spreadsheetId: 'bug-tracking-sheet-123',
              range: data.range,
              valueInputOption: 'USER_ENTERED',
              requestBody: {
                values: [['', '', '', '', '', '']]
              }
            });
          }
        } else if (stepName === 'notify_dev_team') {
          const data = this.stateManager.getRollbackData(workflowId, stepName);
          if (data) {
            await mockSlackChatDelete({
              channel: data.channel,
              ts: data.messageTs
            });
          }
        } else if (stepName === 'create_trello_card') {
          const data = this.stateManager.getRollbackData(workflowId, stepName);
          if (data) {
            await mockTrelloDeleteCard(data.cardId);
          }
        }

        this.stateManager.updateStepStatus(workflowId, stepName, 'rolled_back');
      } catch (error) {
        console.error(`Failed to rollback step ${stepName}:`, error);
      }
    }

    state.status = 'rolled_back';
  }
}

class MeetingRequestWorkflow {
  constructor(private stateManager: WorkflowStateManager) {}

  async execute(workflowId: string, meeting: {
    title: string;
    agenda: string;
    attendees: string[];
    date: string;
    time: string;
  }): Promise<{ success: boolean; results: any[] }> {
    const steps = ['create_notion_task', 'send_slack_notification'];
    this.stateManager.createWorkflow(workflowId, steps);

    const results: any[] = [];

    try {
      // Step 1: Create Notion task
      const taskResult = await this.createNotionTask(workflowId, meeting);
      results.push(taskResult);

      // Step 2: Send Slack notification with agenda
      const notifyResults = await this.sendSlackNotifications(workflowId, meeting, taskResult.taskUrl);
      results.push(...notifyResults);

      return { success: true, results };
    } catch (error) {
      await this.rollback(workflowId);
      throw error;
    }
  }

  private async createNotionTask(workflowId: string, meeting: any): Promise<any> {
    const stepName = 'create_notion_task';

    if (this.stateManager.isStepExecuted(workflowId, stepName)) {
      return this.stateManager.getRollbackData(workflowId, stepName);
    }

    this.stateManager.updateStepStatus(workflowId, stepName, 'running');

    try {
      // Check for duplicates
      const existing = await mockNotionDatabaseQuery({
        database_id: 'meetings-db-123',
        filter: {
          property: 'title',
          title: {
            equals: meeting.title
          }
        }
      }) as any;

      if (existing.results && existing.results.length > 0) {
        throw new Error('Duplicate meeting found');
      }

      const result = await mockNotionPageCreate({
        parent: { database_id: 'meetings-db-123' },
        properties: {
          title: {
            title: [{ text: { content: meeting.title } }]
          },
          date: {
            date: { start: `${meeting.date}T${meeting.time}` }
          },
          agenda: {
            rich_text: [{ text: { content: meeting.agenda } }]
          },
          attendees: {
            multi_select: meeting.attendees.map((a: any) => ({ name: a }))
          }
        }
      }) as any;

      const taskData = {
        taskId: result.id,
        taskUrl: result.url || `https://notion.so/${result.id}`
      };

      this.stateManager.storeRollbackData(workflowId, stepName, taskData);
      this.stateManager.updateStepStatus(workflowId, stepName, 'completed', taskData);

      return taskData;
    } catch (error) {
      this.stateManager.updateStepStatus(workflowId, stepName, 'failed', undefined, error as Error);
      throw error;
    }
  }

  private async sendSlackNotifications(workflowId: string, meeting: any, taskUrl: string): Promise<any[]> {
    const stepName = 'send_slack_notification';

    if (this.stateManager.isStepExecuted(workflowId, stepName)) {
      return this.stateManager.getRollbackData(workflowId, stepName);
    }

    this.stateManager.updateStepStatus(workflowId, stepName, 'running');

    try {
      const message = `📅 *Meeting Request*\n*Title:* ${meeting.title}\n*Date:* ${meeting.date} at ${meeting.time}\n*Agenda:*\n${meeting.agenda}\n*Details:* ${taskUrl}`;

      const notifications = [];

      // Notify all attendees
      for (const attendee of meeting.attendees) {
        const result = await mockSlackPostMessage({
          channel: attendee,
          text: message
        }) as any;

        notifications.push({
          attendee,
          messageTs: result.ts
        });
      }

      this.stateManager.storeRollbackData(workflowId, stepName, notifications);
      this.stateManager.updateStepStatus(workflowId, stepName, 'completed', notifications);

      return notifications;
    } catch (error) {
      this.stateManager.updateStepStatus(workflowId, stepName, 'failed', undefined, error as Error);
      throw error;
    }
  }

  private async rollback(workflowId: string): Promise<void> {
    const state = this.stateManager.getWorkflow(workflowId);
    if (!state) return;

    const completedSteps = state.executedSteps.slice().reverse();

    for (const stepName of completedSteps) {
      try {
        if (stepName === 'send_slack_notification') {
          const notifications = this.stateManager.getRollbackData(workflowId, stepName);
          if (notifications) {
            for (const notif of notifications) {
              await mockSlackChatDelete({
                channel: notif.attendee,
                ts: notif.messageTs
              });
            }
          }
        } else if (stepName === 'create_notion_task') {
          const data = this.stateManager.getRollbackData(workflowId, stepName);
          if (data) {
            await mockNotionPageUpdate({
              page_id: data.taskId,
              archived: true
            });
          }
        }

        this.stateManager.updateStepStatus(workflowId, stepName, 'rolled_back');
      } catch (error) {
        console.error(`Failed to rollback step ${stepName}:`, error);
      }
    }

    state.status = 'rolled_back';
  }
}

// ============================================================================
// Invoice Processing Workflow Tests
// ============================================================================

describe('Invoice Processing Workflow', () => {
  let workflow: InvoiceProcessingWorkflow;
  let stateManager: WorkflowStateManager;

  beforeEach(() => {
    stateManager = new WorkflowStateManager();
    workflow = new InvoiceProcessingWorkflow(stateManager);
    jest.clearAllMocks();
  });

  afterEach(() => {
    stateManager.clear();
  });

  it('should complete full workflow successfully', async () => {
    // Mock successful responses
    mockDriveFilesCreate.mockResolvedValue({
      data: {
        id: 'invoice-file-123',
        webViewLink: 'https://drive.google.com/file/d/invoice-file-123/view'
      }
    });

    mockSheetsAppend.mockResolvedValue({
      data: {
        updates: {
          updatedRange: 'Invoices!A5:D5',
          updatedRows: 1
        }
      }
    });

    mockSlackPostMessage.mockResolvedValue({
      ok: true,
      ts: '1234567890.123456'
    });

    const invoice = {
      fileName: 'invoice-001.pdf',
      content: 'Invoice content...',
      amount: 1500.00,
      vendor: 'Acme Corp'
    };

    const result = await workflow.execute('invoice-wf-001', invoice);

    // Verify all steps completed
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(3);

    // Verify step 1: File attachment
    expect(mockDriveFilesCreate).toHaveBeenCalledTimes(1);
    expect(result.results[0]).toHaveProperty('fileId', 'invoice-file-123');
    expect(result.results[0]).toHaveProperty('link');

    // Verify step 2: Sheet update
    expect(mockSheetsAppend).toHaveBeenCalledTimes(1);
    const sheetCall = mockSheetsAppend.mock.calls[0][0] as any;
    expect(sheetCall.spreadsheetId).toBe('accounting-sheet-123');
    expect(sheetCall.requestBody.values[0]).toContain('Acme Corp');
    expect(sheetCall.requestBody.values[0]).toContain(1500.00);
    expect(result.results[1]).toHaveProperty('range', 'Invoices!A5:D5');

    // Verify step 3: Notification
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);
    const slackCall = mockSlackPostMessage.mock.calls[0][0] as any;
    expect(slackCall.channel).toBe('#finance');
    expect(slackCall.text).toContain('Acme Corp');
    expect(slackCall.text).toContain('$1500');
    expect(result.results[2]).toHaveProperty('messageTs');

    // Verify workflow state
    const state = stateManager.getWorkflow('invoice-wf-001');
    expect(state?.status).toBe('completed');
    expect(state?.executedSteps).toHaveLength(3);
  });

  it('should rollback if step 2 fails', async () => {
    // Mock step 1 success
    mockDriveFilesCreate.mockResolvedValue({
      data: {
        id: 'invoice-file-456',
        webViewLink: 'https://drive.google.com/file/d/invoice-file-456/view'
      }
    });

    // Mock step 2 failure
    mockSheetsAppend.mockRejectedValue(new Error('Permission denied'));

    const invoice = {
      fileName: 'invoice-002.pdf',
      content: 'Invoice content...',
      amount: 2000.00,
      vendor: 'Widget Inc'
    };

    // Execute workflow and expect failure
    await expect(
      workflow.execute('invoice-wf-002', invoice)
    ).rejects.toThrow('Permission denied');

    // Verify rollback occurred
    expect(mockDriveFilesDelete).toHaveBeenCalledTimes(1);
    expect(mockDriveFilesDelete).toHaveBeenCalledWith({
      fileId: 'invoice-file-456'
    });

    // Verify step 3 was never called
    expect(mockSlackPostMessage).not.toHaveBeenCalled();

    // Verify workflow state
    const state = stateManager.getWorkflow('invoice-wf-002');
    expect(state?.status).toBe('rolled_back');
    expect(state?.steps[1].status).toBe('failed');
    expect(state?.steps[0].status).toBe('rolled_back');
  });

  it('should be idempotent - running twice executes once', async () => {
    // Mock successful responses
    mockDriveFilesCreate.mockResolvedValue({
      data: {
        id: 'invoice-file-789',
        webViewLink: 'https://drive.google.com/file/d/invoice-file-789/view'
      }
    });

    mockSheetsAppend.mockResolvedValue({
      data: {
        updates: {
          updatedRange: 'Invoices!A10:D10',
          updatedRows: 1
        }
      }
    });

    mockSlackPostMessage.mockResolvedValue({
      ok: true,
      ts: '1234567890.654321'
    });

    const invoice = {
      fileName: 'invoice-003.pdf',
      content: 'Invoice content...',
      amount: 3000.00,
      vendor: 'Tech Solutions'
    };

    // Execute workflow first time
    const result1 = await workflow.execute('invoice-wf-003', invoice);
    expect(result1.success).toBe(true);

    // Reset mocks to verify no additional calls
    jest.clearAllMocks();

    // Execute workflow second time with same ID
    const result2 = await workflow.execute('invoice-wf-003', invoice);
    expect(result2.success).toBe(true);

    // Verify no API calls were made on second execution (idempotent)
    expect(mockDriveFilesCreate).not.toHaveBeenCalled();
    expect(mockSheetsAppend).not.toHaveBeenCalled();
    expect(mockSlackPostMessage).not.toHaveBeenCalled();

    // Verify same results returned
    expect(result2.results[0].fileId).toBe(result1.results[0].fileId);
    expect(result2.results[1].range).toBe(result1.results[1].range);
    expect(result2.results[2].messageTs).toBe(result1.results[2].messageTs);
  });

  it('should support partial execution recovery', async () => {
    // Initial execution: step 1 succeeds, step 2 fails
    mockDriveFilesCreate.mockResolvedValue({
      data: {
        id: 'invoice-file-999',
        webViewLink: 'https://drive.google.com/file/d/invoice-file-999/view'
      }
    });

    mockSheetsAppend.mockRejectedValueOnce(new Error('Network timeout'));

    const invoice = {
      fileName: 'invoice-004.pdf',
      content: 'Invoice content...',
      amount: 4000.00,
      vendor: 'Enterprise Co'
    };

    // First attempt fails at step 2
    await expect(
      workflow.execute('invoice-wf-004', invoice)
    ).rejects.toThrow('Network timeout');

    // Verify step 1 was rolled back
    expect(mockDriveFilesDelete).toHaveBeenCalledTimes(1);

    // Clear mocks for recovery attempt
    jest.clearAllMocks();

    // Recovery: Now step 2 succeeds
    mockDriveFilesCreate.mockResolvedValue({
      data: {
        id: 'invoice-file-999-recovered',
        webViewLink: 'https://drive.google.com/file/d/invoice-file-999-recovered/view'
      }
    });

    mockSheetsAppend.mockResolvedValue({
      data: {
        updates: {
          updatedRange: 'Invoices!A15:D15',
          updatedRows: 1
        }
      }
    });

    mockSlackPostMessage.mockResolvedValue({
      ok: true,
      ts: '1234567890.999999'
    });

    // Resume workflow
    const result = await workflow.resume('invoice-wf-004', invoice);

    // Verify recovery succeeded
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(3);

    // Verify all steps executed
    expect(mockDriveFilesCreate).toHaveBeenCalledTimes(1);
    expect(mockSheetsAppend).toHaveBeenCalledTimes(1);
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);
  });

  it('should maintain transaction consistency across rollback', async () => {
    // All steps succeed initially
    mockDriveFilesCreate.mockResolvedValue({
      data: { id: 'file-tx-1', webViewLink: 'https://drive.google.com/file/d/file-tx-1/view' }
    });

    mockSheetsAppend.mockResolvedValue({
      data: { updates: { updatedRange: 'Invoices!A20:D20', updatedRows: 1 } }
    });

    mockSlackPostMessage.mockResolvedValue({
      ok: true,
      ts: '1234567890.111111'
    });

    const invoice = {
      fileName: 'invoice-tx-1.pdf',
      content: 'Content',
      amount: 5000.00,
      vendor: 'Consistent Corp'
    };

    await workflow.execute('invoice-wf-tx-1', invoice);

    // Verify state before rollback
    let state = stateManager.getWorkflow('invoice-wf-tx-1');
    expect(state?.executedSteps).toHaveLength(3);
    expect(state?.status).toBe('completed');

    // Trigger manual rollback
    jest.clearAllMocks();
    await (workflow as any).rollback('invoice-wf-tx-1', []);

    // Verify all rollback operations called
    expect(mockSlackChatDelete).toHaveBeenCalledTimes(1);
    expect(mockSheetsUpdate).toHaveBeenCalledTimes(1);
    expect(mockDriveFilesDelete).toHaveBeenCalledTimes(1);

    // Verify state after rollback
    state = stateManager.getWorkflow('invoice-wf-tx-1');
    expect(state?.status).toBe('rolled_back');
    expect(state?.steps.every(s => s.status === 'rolled_back')).toBe(true);
  });
});

// ============================================================================
// Bug Report Workflow Tests
// ============================================================================

describe('Bug Report Workflow', () => {
  let workflow: BugReportWorkflow;
  let stateManager: WorkflowStateManager;

  beforeEach(() => {
    stateManager = new WorkflowStateManager();
    workflow = new BugReportWorkflow(stateManager);
    jest.clearAllMocks();
  });

  afterEach(() => {
    stateManager.clear();
  });

  it('should create bug report with correct priority', async () => {
    // Mock successful responses
    mockTrelloCreateCard.mockResolvedValue({
      id: 'bug-card-123',
      url: 'https://trello.com/c/bug-card-123'
    });

    mockTrelloAddLabelToCard.mockResolvedValue({ success: true });

    mockSlackPostMessage.mockResolvedValue({
      ok: true,
      ts: '1234567890.222222'
    });

    mockSheetsAppend.mockResolvedValue({
      data: {
        updates: {
          updatedRange: 'Bugs!A2:F2',
          updatedRows: 1
        }
      }
    });

    const bug = {
      title: 'Login button not working',
      description: 'Users cannot click the login button on mobile',
      priority: 'critical' as const,
      reporter: 'user@example.com'
    };

    const result = await workflow.execute('bug-wf-001', bug);

    // Verify workflow completed
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(3);

    // Verify Trello card created with correct priority label
    expect(mockTrelloCreateCard).toHaveBeenCalledTimes(1);
    expect(mockTrelloCreateCard).toHaveBeenCalledWith(
      'Login button not working',
      'Users cannot click the login button on mobile',
      'bugs-list-123'
    );

    expect(mockTrelloAddLabelToCard).toHaveBeenCalledTimes(1);
    expect(mockTrelloAddLabelToCard).toHaveBeenCalledWith('bug-card-123', 'red'); // critical = red

    // Verify dev team notified
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);
    const slackCall = mockSlackPostMessage.mock.calls[0][0] as any;
    expect(slackCall.channel).toBe('#dev-team');
    expect(slackCall.text).toContain('🔴'); // critical emoji
    expect(slackCall.text).toContain('CRITICAL');
    expect(slackCall.text).toContain('Login button not working');

    // Verify tracking sheet updated
    expect(mockSheetsAppend).toHaveBeenCalledTimes(1);
    const sheetCall = mockSheetsAppend.mock.calls[0][0] as any;
    expect(sheetCall.spreadsheetId).toBe('bug-tracking-sheet-123');
    expect(sheetCall.requestBody.values[0]).toContain('Login button not working');
    expect(sheetCall.requestBody.values[0]).toContain('critical');
    expect(sheetCall.requestBody.values[0]).toContain('user@example.com');
    expect(sheetCall.requestBody.values[0]).toContain('bug-card-123');
    expect(sheetCall.requestBody.values[0]).toContain('open');
  });

  it('should test different priority levels', async () => {
    const priorities: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical'];
    const expectedLabels = ['green', 'yellow', 'orange', 'red'];
    const expectedEmojis = ['🟢', '🟡', '🟠', '🔴'];

    for (let i = 0; i < priorities.length; i++) {
      jest.clearAllMocks();

      mockTrelloCreateCard.mockResolvedValue({
        id: `bug-card-${i}`,
        url: `https://trello.com/c/bug-card-${i}`
      });

      mockTrelloAddLabelToCard.mockResolvedValue({ success: true });

      mockSlackPostMessage.mockResolvedValue({
        ok: true,
        ts: `1234567890.${i}`
      });

      mockSheetsAppend.mockResolvedValue({
        data: {
          updates: {
            updatedRange: `Bugs!A${i + 2}:F${i + 2}`,
            updatedRows: 1
          }
        }
      });

      const bug = {
        title: `Bug ${i}`,
        description: `Description ${i}`,
        priority: priorities[i],
        reporter: 'tester@example.com'
      };

      await workflow.execute(`bug-wf-priority-${i}`, bug);

      // Verify correct label applied
      expect(mockTrelloAddLabelToCard).toHaveBeenCalledWith(`bug-card-${i}`, expectedLabels[i]);

      // Verify correct emoji in Slack message
      const slackCall = mockSlackPostMessage.mock.calls[0][0] as any;
      expect(slackCall.text).toContain(expectedEmojis[i]);
    }
  });

  it('should rollback on tracking sheet failure', async () => {
    // Steps 1 and 2 succeed
    mockTrelloCreateCard.mockResolvedValue({
      id: 'bug-card-rollback',
      url: 'https://trello.com/c/bug-card-rollback'
    });

    mockTrelloAddLabelToCard.mockResolvedValue({ success: true });

    mockSlackPostMessage.mockResolvedValue({
      ok: true,
      ts: '1234567890.333333'
    });

    // Step 3 fails
    mockSheetsAppend.mockRejectedValue(new Error('Sheet write error'));

    const bug = {
      title: 'Rollback test bug',
      description: 'This should rollback',
      priority: 'high' as const,
      reporter: 'test@example.com'
    };

    await expect(
      workflow.execute('bug-wf-rollback', bug)
    ).rejects.toThrow('Sheet write error');

    // Verify rollback operations
    expect(mockSlackChatDelete).toHaveBeenCalledTimes(1);
    expect(mockSlackChatDelete).toHaveBeenCalledWith({
      channel: '#dev-team',
      ts: '1234567890.333333'
    });

    expect(mockTrelloDeleteCard).toHaveBeenCalledTimes(1);
    expect(mockTrelloDeleteCard).toHaveBeenCalledWith('bug-card-rollback');

    // Verify workflow state
    const state = stateManager.getWorkflow('bug-wf-rollback');
    expect(state?.status).toBe('rolled_back');
  });

  it('should be idempotent for bug creation', async () => {
    mockTrelloCreateCard.mockResolvedValue({
      id: 'bug-card-idem',
      url: 'https://trello.com/c/bug-card-idem'
    });

    mockTrelloAddLabelToCard.mockResolvedValue({ success: true });

    mockSlackPostMessage.mockResolvedValue({
      ok: true,
      ts: '1234567890.444444'
    });

    mockSheetsAppend.mockResolvedValue({
      data: {
        updates: {
          updatedRange: 'Bugs!A50:F50',
          updatedRows: 1
        }
      }
    });

    const bug = {
      title: 'Idempotent bug',
      description: 'Test idempotency',
      priority: 'medium' as const,
      reporter: 'idem@example.com'
    };

    // First execution
    await workflow.execute('bug-wf-idem', bug);

    jest.clearAllMocks();

    // Second execution with same ID
    await workflow.execute('bug-wf-idem', bug);

    // Verify no API calls on second execution
    expect(mockTrelloCreateCard).not.toHaveBeenCalled();
    expect(mockTrelloAddLabelToCard).not.toHaveBeenCalled();
    expect(mockSlackPostMessage).not.toHaveBeenCalled();
    expect(mockSheetsAppend).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Meeting Request Workflow Tests
// ============================================================================

describe('Meeting Request Workflow', () => {
  let workflow: MeetingRequestWorkflow;
  let stateManager: WorkflowStateManager;

  beforeEach(() => {
    stateManager = new WorkflowStateManager();
    workflow = new MeetingRequestWorkflow(stateManager);
    jest.clearAllMocks();
  });

  afterEach(() => {
    stateManager.clear();
  });

  it('should create meeting and notify all attendees', async () => {
    // Mock Notion task creation
    mockNotionDatabaseQuery.mockResolvedValue({ results: [] }); // No duplicates

    mockNotionPageCreate.mockResolvedValue({
      id: 'meeting-page-123',
      url: 'https://notion.so/meeting-page-123'
    });

    // Mock Slack notifications
    mockSlackPostMessage.mockResolvedValue({
      ok: true,
      ts: '1234567890.555555'
    });

    const meeting = {
      title: 'Q4 Planning Meeting',
      agenda: '1. Review Q3 results\n2. Set Q4 goals\n3. Budget allocation',
      attendees: ['@alice', '@bob', '@charlie'],
      date: '2025-10-25',
      time: '14:00'
    };

    const result = await workflow.execute('meeting-wf-001', meeting);

    // Verify workflow completed
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(4); // 1 task + 3 notifications

    // Verify Notion task created
    expect(mockNotionDatabaseQuery).toHaveBeenCalledTimes(1);
    expect(mockNotionPageCreate).toHaveBeenCalledTimes(1);

    const notionCall = mockNotionPageCreate.mock.calls[0][0] as any;
    expect(notionCall.parent.database_id).toBe('meetings-db-123');
    expect(notionCall.properties.title.title[0].text.content).toBe('Q4 Planning Meeting');
    expect(notionCall.properties.date.date.start).toBe('2025-10-25T14:00');
    expect(notionCall.properties.agenda.rich_text[0].text.content).toContain('Review Q3 results');
    expect(notionCall.properties.attendees.multi_select).toHaveLength(3);

    // Verify all attendees notified
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(3);

    const slackCalls = mockSlackPostMessage.mock.calls;
    expect(slackCalls[0][0].channel).toBe('@alice');
    expect(slackCalls[1][0].channel).toBe('@bob');
    expect(slackCalls[2][0].channel).toBe('@charlie');

    // Verify message content
    slackCalls.forEach((call: any) => {
      expect(call[0].text).toContain('Q4 Planning Meeting');
      expect(call[0].text).toContain('2025-10-25 at 14:00');
      expect(call[0].text).toContain('Review Q3 results');
      expect(call[0].text).toContain('https://notion.so/meeting-page-123');
    });

    // Verify workflow state
    const state = stateManager.getWorkflow('meeting-wf-001');
    expect(state?.status).toBe('completed');
    expect(state?.executedSteps).toHaveLength(2);
  });

  it('should prevent duplicate meetings', async () => {
    // Mock duplicate found
    mockNotionDatabaseQuery.mockResolvedValue({
      results: [{ id: 'existing-meeting-123' }]
    });

    const meeting = {
      title: 'Duplicate Meeting',
      agenda: 'Should not be created',
      attendees: ['@user1'],
      date: '2025-10-26',
      time: '15:00'
    };

    await expect(
      workflow.execute('meeting-wf-duplicate', meeting)
    ).rejects.toThrow('Duplicate meeting found');

    // Verify no task created
    expect(mockNotionPageCreate).not.toHaveBeenCalled();

    // Verify no notifications sent
    expect(mockSlackPostMessage).not.toHaveBeenCalled();
  });

  it('should rollback on notification failure', async () => {
    // Task creation succeeds
    mockNotionDatabaseQuery.mockResolvedValue({ results: [] });

    mockNotionPageCreate.mockResolvedValue({
      id: 'meeting-page-rollback',
      url: 'https://notion.so/meeting-page-rollback'
    });

    // First notification succeeds, second fails
    mockSlackPostMessage
      .mockResolvedValueOnce({ ok: true, ts: '1234567890.666666' })
      .mockRejectedValueOnce(new Error('User not found'));

    const meeting = {
      title: 'Rollback Meeting',
      agenda: 'Test rollback',
      attendees: ['@user1', '@invalid-user'],
      date: '2025-10-27',
      time: '16:00'
    };

    await expect(
      workflow.execute('meeting-wf-rollback', meeting)
    ).rejects.toThrow('User not found');

    // Verify rollback operations
    expect(mockSlackChatDelete).toHaveBeenCalledTimes(1);
    expect(mockSlackChatDelete).toHaveBeenCalledWith({
      channel: '@user1',
      ts: '1234567890.666666'
    });

    expect(mockNotionPageUpdate).toHaveBeenCalledTimes(1);
    expect(mockNotionPageUpdate).toHaveBeenCalledWith({
      page_id: 'meeting-page-rollback',
      archived: true
    });

    // Verify workflow state
    const state = stateManager.getWorkflow('meeting-wf-rollback');
    expect(state?.status).toBe('rolled_back');
  });

  it('should be idempotent for meeting creation', async () => {
    mockNotionDatabaseQuery.mockResolvedValue({ results: [] });

    mockNotionPageCreate.mockResolvedValue({
      id: 'meeting-page-idem',
      url: 'https://notion.so/meeting-page-idem'
    });

    mockSlackPostMessage.mockResolvedValue({
      ok: true,
      ts: '1234567890.777777'
    });

    const meeting = {
      title: 'Idempotent Meeting',
      agenda: 'Test idempotency',
      attendees: ['@user1', '@user2'],
      date: '2025-10-28',
      time: '17:00'
    };

    // First execution
    await workflow.execute('meeting-wf-idem', meeting);

    jest.clearAllMocks();

    // Second execution with same ID
    await workflow.execute('meeting-wf-idem', meeting);

    // Verify no API calls on second execution
    expect(mockNotionDatabaseQuery).not.toHaveBeenCalled();
    expect(mockNotionPageCreate).not.toHaveBeenCalled();
    expect(mockSlackPostMessage).not.toHaveBeenCalled();
  });

  it('should handle large attendee list efficiently', async () => {
    mockNotionDatabaseQuery.mockResolvedValue({ results: [] });

    mockNotionPageCreate.mockResolvedValue({
      id: 'meeting-page-large',
      url: 'https://notion.so/meeting-page-large'
    });

    mockSlackPostMessage.mockResolvedValue({
      ok: true,
      ts: '1234567890.888888'
    });

    // Create meeting with 10 attendees
    const attendees = Array.from({ length: 10 }, (_, i) => `@user${i + 1}`);

    const meeting = {
      title: 'All-Hands Meeting',
      agenda: 'Company updates',
      attendees,
      date: '2025-10-29',
      time: '18:00'
    };

    const startTime = performance.now();
    const result = await workflow.execute('meeting-wf-large', meeting);
    const duration = performance.now() - startTime;

    // Verify all notifications sent
    expect(result.success).toBe(true);
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(10);

    // Verify reasonable performance (should be fast with mocks)
    expect(duration).toBeLessThan(500);

    // Verify all attendees in results
    const notifications = result.results.slice(1); // Skip task result
    expect(notifications).toHaveLength(10);
    notifications.forEach((notif: any, i: number) => {
      expect(notif.attendee).toBe(`@user${i + 1}`);
      expect(notif.messageTs).toBe('1234567890.888888');
    });
  });
});

// ============================================================================
// Cross-Workflow Tests
// ============================================================================

describe('Cross-Workflow Integration', () => {
  it('should maintain transaction consistency across multiple workflows', async () => {
    const stateManager = new WorkflowStateManager();
    const invoiceWorkflow = new InvoiceProcessingWorkflow(stateManager);
    const bugWorkflow = new BugReportWorkflow(stateManager);

    // Set up mocks for both workflows
    mockDriveFilesCreate.mockResolvedValue({
      data: { id: 'file-1', webViewLink: 'https://drive.google.com/file/d/file-1/view' }
    });

    mockSheetsAppend.mockResolvedValue({
      data: { updates: { updatedRange: 'A1:D1', updatedRows: 1 } }
    });

    mockSlackPostMessage.mockResolvedValue({
      ok: true,
      ts: '1234567890.999999'
    });

    mockTrelloCreateCard.mockResolvedValue({
      id: 'card-1',
      url: 'https://trello.com/c/card-1'
    });

    mockTrelloAddLabelToCard.mockResolvedValue({ success: true });

    // Execute both workflows in parallel
    const [invoiceResult, bugResult] = await Promise.all([
      invoiceWorkflow.execute('multi-wf-invoice', {
        fileName: 'invoice.pdf',
        content: 'content',
        amount: 1000,
        vendor: 'Vendor A'
      }),
      bugWorkflow.execute('multi-wf-bug', {
        title: 'Bug title',
        description: 'Bug description',
        priority: 'high',
        reporter: 'user@example.com'
      })
    ]);

    // Verify both workflows completed successfully
    expect(invoiceResult.success).toBe(true);
    expect(bugResult.success).toBe(true);

    // Verify states are independent
    const invoiceState = stateManager.getWorkflow('multi-wf-invoice');
    const bugState = stateManager.getWorkflow('multi-wf-bug');

    expect(invoiceState?.status).toBe('completed');
    expect(bugState?.status).toBe('completed');
    expect(invoiceState?.executedSteps).not.toEqual(bugState?.executedSteps);
  });
});
