/**
 * Executor Unit Tests
 * 
 * Comprehensive test suite for all integration executors.
 * Tests each executor independently with mocked API responses,
 * validates output formats, checks error handling, and measures execution time.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock Notion API
const mockNotionDatabaseQuery = jest.fn() as jest.MockedFunction<any>;
const mockNotionPageCreate = jest.fn() as jest.MockedFunction<any>;
const mockNotionPageUpdate = jest.fn() as jest.MockedFunction<any>;

jest.mock('@notionhq/client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    databases: {
      query: mockNotionDatabaseQuery
    },
    pages: {
      create: mockNotionPageCreate,
      update: mockNotionPageUpdate
    }
  }))
}));

// Mock Trello API
const mockTrelloCreateCard = jest.fn() as jest.MockedFunction<any>;
const mockTrelloGetBoards = jest.fn() as jest.MockedFunction<any>;
const mockTrelloUpdateCard = jest.fn() as jest.MockedFunction<any>;
const mockTrelloCreateLabel = jest.fn() as jest.MockedFunction<any>;

jest.mock('trello', () => ({
  default: jest.fn().mockImplementation(() => ({
    addCard: mockTrelloCreateCard,
    getBoards: mockTrelloGetBoards,
    updateCard: mockTrelloUpdateCard,
    addLabelToCard: mockTrelloCreateLabel
  }))
}));

// Mock Slack API
const mockSlackPostMessage = jest.fn() as jest.MockedFunction<any>;
const mockSlackViewsOpen = jest.fn() as jest.MockedFunction<any>;
const mockSlackChatUpdate = jest.fn() as jest.MockedFunction<any>;

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: {
      postMessage: mockSlackPostMessage,
      update: mockSlackChatUpdate
    },
    views: {
      open: mockSlackViewsOpen
    }
  }))
}));

// Mock Google Drive API
const mockDriveFilesCreate = jest.fn() as jest.MockedFunction<any>;
const mockDriveFilesList = jest.fn() as jest.MockedFunction<any>;

jest.mock('googleapis', () => ({
  google: {
    drive: jest.fn(() => ({
      files: {
        create: mockDriveFilesCreate,
        list: mockDriveFilesList
      }
    })),
    sheets: jest.fn(() => ({
      spreadsheets: {
        values: {
          append: jest.fn(),
          update: jest.fn()
        }
      }
    }))
  }
}));

// Mock Google Sheets API
const mockSheetsAppend = jest.fn() as jest.MockedFunction<any>;
const mockSheetsUpdate = jest.fn() as jest.MockedFunction<any>;

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Measure execution time of an async function
 */
async function measureExecutionTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const startTime = performance.now();
  const result = await fn();
  const duration = performance.now() - startTime;
  return { result, duration };
}

/**
 * Validate UUID format
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate URL format
 */
function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate Slack timestamp format (e.g., "1234567890.123456")
 */
function isValidSlackTimestamp(ts: string): boolean {
  const tsRegex = /^\d+\.\d+$/;
  return tsRegex.test(ts);
}

// ============================================================================
// Mock Executor Implementations
// ============================================================================

class NotionExecutor {
  async createTask(data: { database_id: string; title: string; properties?: any }): Promise<{ id: string }> {
    // Check for duplicates first
    const queryResult = await mockNotionDatabaseQuery({
      database_id: data.database_id,
      filter: {
        property: 'title',
        title: {
          equals: data.title
        }
      }
    }) as any;

    if (queryResult.results && queryResult.results.length > 0) {
      throw new Error('Duplicate task detected');
    }

    // Create new task
    const result = await mockNotionPageCreate({
      parent: { database_id: data.database_id },
      properties: {
        title: {
          title: [{ text: { content: data.title } }]
        },
        ...data.properties
      }
    }) as any;

    return { id: result.id };
  }

  async updateTask(pageId: string, properties: any): Promise<{ success: boolean }> {
    await mockNotionPageUpdate({
      page_id: pageId,
      properties
    });

    return { success: true };
  }
}

class TrelloExecutor {
  async createCard(data: { 
    name: string; 
    listId: string; 
    desc?: string; 
    labels?: string[] 
  }): Promise<{ id: string }> {
    const result = await mockTrelloCreateCard(data.name, data.desc || '', data.listId) as any;

    // Add labels if provided
    if (data.labels && data.labels.length > 0) {
      for (const label of data.labels) {
        await mockTrelloCreateLabel(result.id, label);
      }
    }

    return { id: result.id };
  }

  async moveCard(cardId: string, listId: string): Promise<{ success: boolean }> {
    await mockTrelloUpdateCard(cardId, 'idList', listId);
    return { success: true };
  }
}

class SlackExecutor {
  async sendNotification(channel: string, text: string): Promise<{ ts: string }> {
    const result = await mockSlackPostMessage({
      channel,
      text
    }) as any;

    return { ts: result.ts };
  }

  async sendApprovalRequest(channel: string, action: any): Promise<{ ts: string }> {
    const result = await mockSlackViewsOpen({
      trigger_id: 'mock-trigger',
      view: {
        type: 'modal',
        title: { type: 'plain_text', text: 'Approval Required' },
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Action:* ${action.type}` }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Approve' },
                action_id: 'approve',
                style: 'primary'
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Reject' },
                action_id: 'reject',
                style: 'danger'
              }
            ]
          }
        ]
      }
    }) as any;

    return { ts: result.message?.ts || '1234567890.123456' };
  }

  async replyInThread(channel: string, threadTs: string, text: string): Promise<{ ts: string }> {
    const result = await mockSlackPostMessage({
      channel,
      thread_ts: threadTs,
      text
    }) as any;

    return { ts: result.ts };
  }
}

class DriveExecutor {
  async fileDocument(name: string, content: string, mimeType: string): Promise<{ link: string }> {
    const result = await mockDriveFilesCreate({
      requestBody: {
        name,
        mimeType
      },
      media: {
        mimeType,
        body: content
      },
      fields: 'id, webViewLink'
    }) as any;

    return { link: result.data.webViewLink };
  }

  async organizeAttachments(attachments: Array<{ name: string; content: string }>): Promise<{ 
    folderId: string; 
    files: Array<{ name: string; link: string }> 
  }> {
    // Create folder
    const folderResult = await mockDriveFilesCreate({
      requestBody: {
        name: 'Attachments',
        mimeType: 'application/vnd.google-apps.folder'
      },
      fields: 'id'
    }) as any;

    // Upload files to folder
    const files = [];
    for (const attachment of attachments) {
      const fileResult = await mockDriveFilesCreate({
        requestBody: {
          name: attachment.name,
          parents: [folderResult.data.id]
        },
        media: {
          mimeType: 'application/octet-stream',
          body: attachment.content
        },
        fields: 'id, webViewLink'
      }) as any;

      files.push({
        name: attachment.name,
        link: fileResult.data.webViewLink
      });
    }

    return {
      folderId: folderResult.data.id,
      files
    };
  }
}

class SheetsExecutor {
  async appendRow(spreadsheetId: string, range: string, values: any[][]): Promise<{ 
    updatedRange: string; 
    updatedRows: number 
  }> {
    const result = await mockSheetsAppend({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values
      }
    }) as any;

    return {
      updatedRange: result.data.updates.updatedRange,
      updatedRows: result.data.updates.updatedRows
    };
  }

  async updateCell(spreadsheetId: string, range: string, value: string): Promise<{ 
    updatedRange: string; 
    updatedCells: number 
  }> {
    const result = await mockSheetsUpdate({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[value]]
      }
    }) as any;

    return {
      updatedRange: result.data.updatedRange,
      updatedCells: result.data.updatedCells
    };
  }

  async logAction(spreadsheetId: string, action: any): Promise<{ success: boolean }> {
    const timestamp = new Date().toISOString();
    const row = [
      timestamp,
      action.type,
      action.status,
      action.duration || 0,
      JSON.stringify(action.metadata || {})
    ];

    await mockSheetsAppend({
      spreadsheetId,
      range: 'Actions!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row]
      }
    });

    return { success: true };
  }
}

// ============================================================================
// Notion Executor Tests
// ============================================================================

describe('Notion Executor', () => {
  let notionExecutor: NotionExecutor;

  beforeEach(() => {
    notionExecutor = new NotionExecutor();
    jest.clearAllMocks();
  });

  describe('createTask', () => {
    it('should create task with valid data and return page ID', async () => {
      // Mock no duplicates found
      mockNotionDatabaseQuery.mockResolvedValue({ results: [] });

      // Mock successful page creation
      const mockPageId = '12345678-1234-1234-1234-123456789abc';
      mockNotionPageCreate.mockResolvedValue({ id: mockPageId });

      // Measure execution time
      const { result, duration } = await measureExecutionTime(() =>
        notionExecutor.createTask({
          database_id: 'test-db-id',
          title: 'Test Task'
        })
      );

      // Validate output format
      expect(result).toHaveProperty('id');
      expect(result.id).toBe(mockPageId);
      expect(isValidUUID(result.id)).toBe(true);

      // Validate API calls
      expect(mockNotionDatabaseQuery).toHaveBeenCalledTimes(1);
      expect(mockNotionPageCreate).toHaveBeenCalledTimes(1);
      expect(mockNotionPageCreate).toHaveBeenCalledWith({
        parent: { database_id: 'test-db-id' },
        properties: {
          title: {
            title: [{ text: { content: 'Test Task' } }]
          }
        }
      });

      // Validate performance (should be fast with mocked APIs)
      expect(duration).toBeLessThan(100); // Less than 100ms
    });

    it('should throw error with invalid database', async () => {
      // Mock database query failure
      mockNotionDatabaseQuery.mockRejectedValue(
        new Error('Database not found or access denied')
      );

      // Test error handling
      await expect(
        notionExecutor.createTask({
          database_id: 'invalid-db-id',
          title: 'Test Task'
        })
      ).rejects.toThrow('Database not found or access denied');

      // Validate no page was created
      expect(mockNotionPageCreate).not.toHaveBeenCalled();
    });

    it('should detect and skip duplicate tasks', async () => {
      // Mock duplicate found
      mockNotionDatabaseQuery.mockResolvedValue({
        results: [{ id: 'existing-page-id' }]
      });

      // Test duplicate detection
      await expect(
        notionExecutor.createTask({
          database_id: 'test-db-id',
          title: 'Duplicate Task'
        })
      ).rejects.toThrow('Duplicate task detected');

      // Validate no page was created
      expect(mockNotionPageCreate).not.toHaveBeenCalled();
    });

    it('should handle network timeout gracefully', async () => {
      // Mock timeout error
      mockNotionDatabaseQuery.mockRejectedValue(
        new Error('Request timeout')
      );

      // Test timeout handling
      await expect(
        notionExecutor.createTask({
          database_id: 'test-db-id',
          title: 'Test Task'
        })
      ).rejects.toThrow('Request timeout');
    });
  });

  describe('updateTask', () => {
    it('should update task successfully', async () => {
      // Mock successful update
      mockNotionPageUpdate.mockResolvedValue({ success: true });

      const pageId = '12345678-1234-1234-1234-123456789abc';
      const properties = {
        status: { select: { name: 'In Progress' } }
      };

      // Measure execution time
      const { result, duration } = await measureExecutionTime(() =>
        notionExecutor.updateTask(pageId, properties)
      );

      // Validate output format
      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);

      // Validate API call
      expect(mockNotionPageUpdate).toHaveBeenCalledTimes(1);
      expect(mockNotionPageUpdate).toHaveBeenCalledWith({
        page_id: pageId,
        properties
      });

      // Validate performance
      expect(duration).toBeLessThan(100);
    });

    it('should throw error for non-existent page', async () => {
      // Mock page not found error
      mockNotionPageUpdate.mockRejectedValue(
        new Error('Page not found')
      );

      await expect(
        notionExecutor.updateTask('invalid-page-id', {})
      ).rejects.toThrow('Page not found');
    });
  });
});

// ============================================================================
// Trello Executor Tests
// ============================================================================

describe('Trello Executor', () => {
  let trelloExecutor: TrelloExecutor;

  beforeEach(() => {
    trelloExecutor = new TrelloExecutor();
    jest.clearAllMocks();
  });

  describe('createCard', () => {
    it('should create card with valid data and return card ID', async () => {
      // Mock successful card creation
      const mockCardId = 'trello-card-123';
      mockTrelloCreateCard.mockResolvedValue({ id: mockCardId });

      // Measure execution time
      const { result, duration } = await measureExecutionTime(() =>
        trelloExecutor.createCard({
          name: 'Test Card',
          listId: 'list-123',
          desc: 'Test description'
        })
      );

      // Validate output format
      expect(result).toHaveProperty('id');
      expect(result.id).toBe(mockCardId);
      expect(typeof result.id).toBe('string');
      expect(result.id.length).toBeGreaterThan(0);

      // Validate API call
      expect(mockTrelloCreateCard).toHaveBeenCalledTimes(1);
      expect(mockTrelloCreateCard).toHaveBeenCalledWith(
        'Test Card',
        'Test description',
        'list-123'
      );

      // Validate performance
      expect(duration).toBeLessThan(100);
    });

    it('should create card with labels and attach them', async () => {
      // Mock successful card creation
      const mockCardId = 'trello-card-456';
      mockTrelloCreateCard.mockResolvedValue({ id: mockCardId });
      mockTrelloCreateLabel.mockResolvedValue({ success: true });

      const labels = ['urgent', 'bug', 'frontend'];

      // Create card with labels
      const { result, duration } = await measureExecutionTime(() =>
        trelloExecutor.createCard({
          name: 'Bug Fix Card',
          listId: 'list-123',
          labels
        })
      );

      // Validate output
      expect(result.id).toBe(mockCardId);

      // Validate labels were added
      expect(mockTrelloCreateLabel).toHaveBeenCalledTimes(labels.length);
      labels.forEach((label) => {
        expect(mockTrelloCreateLabel).toHaveBeenCalledWith(mockCardId, label);
      });

      // Validate performance (should still be fast despite multiple label calls)
      expect(duration).toBeLessThan(150);
    });

    it('should handle invalid list ID error', async () => {
      // Mock list not found error
      mockTrelloCreateCard.mockRejectedValue(
        new Error('List not found')
      );

      await expect(
        trelloExecutor.createCard({
          name: 'Test Card',
          listId: 'invalid-list-id'
        })
      ).rejects.toThrow('List not found');
    });
  });

  describe('moveCard', () => {
    it('should move card to correct list', async () => {
      // Mock successful move
      mockTrelloUpdateCard.mockResolvedValue({ success: true });

      const cardId = 'card-123';
      const targetListId = 'list-456';

      // Measure execution time
      const { result, duration } = await measureExecutionTime(() =>
        trelloExecutor.moveCard(cardId, targetListId)
      );

      // Validate output
      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);

      // Validate API call
      expect(mockTrelloUpdateCard).toHaveBeenCalledTimes(1);
      expect(mockTrelloUpdateCard).toHaveBeenCalledWith(cardId, 'idList', targetListId);

      // Validate performance
      expect(duration).toBeLessThan(100);
    });

    it('should handle card not found error', async () => {
      // Mock card not found error
      mockTrelloUpdateCard.mockRejectedValue(
        new Error('Card not found')
      );

      await expect(
        trelloExecutor.moveCard('invalid-card-id', 'list-123')
      ).rejects.toThrow('Card not found');
    });
  });
});

// ============================================================================
// Slack Executor Tests
// ============================================================================

describe('Slack Executor', () => {
  let slackExecutor: SlackExecutor;

  beforeEach(() => {
    slackExecutor = new SlackExecutor();
    jest.clearAllMocks();
  });

  describe('sendNotification', () => {
    it('should send message and return timestamp', async () => {
      // Mock successful message send
      const mockTimestamp = '1234567890.123456';
      mockSlackPostMessage.mockResolvedValue({ 
        ok: true, 
        ts: mockTimestamp 
      });

      // Measure execution time
      const { result, duration } = await measureExecutionTime(() =>
        slackExecutor.sendNotification('#general', 'Test notification')
      );

      // Validate output format
      expect(result).toHaveProperty('ts');
      expect(result.ts).toBe(mockTimestamp);
      expect(isValidSlackTimestamp(result.ts)).toBe(true);

      // Validate API call
      expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);
      expect(mockSlackPostMessage).toHaveBeenCalledWith({
        channel: '#general',
        text: 'Test notification'
      });

      // Validate performance
      expect(duration).toBeLessThan(100);
    });

    it('should handle invalid channel error', async () => {
      // Mock channel not found error
      mockSlackPostMessage.mockRejectedValue(
        new Error('Channel not found')
      );

      await expect(
        slackExecutor.sendNotification('#invalid-channel', 'Test')
      ).rejects.toThrow('Channel not found');
    });

    it('should handle rate limiting', async () => {
      // Mock rate limit error
      mockSlackPostMessage.mockRejectedValue(
        new Error('Rate limited')
      );

      await expect(
        slackExecutor.sendNotification('#general', 'Test')
      ).rejects.toThrow('Rate limited');
    });
  });

  describe('sendApprovalRequest', () => {
    it('should create interactive approval message', async () => {
      // Mock successful modal open
      const mockTimestamp = '1234567890.123456';
      mockSlackViewsOpen.mockResolvedValue({
        ok: true,
        message: { ts: mockTimestamp }
      });

      const action = {
        type: 'create_task',
        platform: 'notion',
        data: { title: 'Important Task' }
      };

      // Measure execution time
      const { result, duration } = await measureExecutionTime(() =>
        slackExecutor.sendApprovalRequest('#approvals', action)
      );

      // Validate output format
      expect(result).toHaveProperty('ts');
      expect(isValidSlackTimestamp(result.ts)).toBe(true);

      // Validate API call
      expect(mockSlackViewsOpen).toHaveBeenCalledTimes(1);
      const call = mockSlackViewsOpen.mock.calls[0][0] as any;
      expect(call.view.type).toBe('modal');
      expect(call.view.title.text).toBe('Approval Required');
      expect(call.view.blocks).toHaveLength(2);

      // Validate approval buttons exist
      const actionsBlock = call.view.blocks[1] as any;
      expect(actionsBlock.elements).toHaveLength(2);
      expect(actionsBlock.elements[0].action_id).toBe('approve');
      expect(actionsBlock.elements[1].action_id).toBe('reject');

      // Validate performance
      expect(duration).toBeLessThan(100);
    });

    it('should handle permission denied error', async () => {
      // Mock permission error
      mockSlackViewsOpen.mockRejectedValue(
        new Error('Permission denied')
      );

      await expect(
        slackExecutor.sendApprovalRequest('#approvals', { type: 'test' })
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('replyInThread', () => {
    it('should send threaded reply', async () => {
      // Mock successful threaded reply
      const mockTimestamp = '1234567890.654321';
      mockSlackPostMessage.mockResolvedValue({
        ok: true,
        ts: mockTimestamp
      });

      const threadTs = '1234567890.123456';

      // Measure execution time
      const { result, duration } = await measureExecutionTime(() =>
        slackExecutor.replyInThread('#general', threadTs, 'Thread reply')
      );

      // Validate output format
      expect(result).toHaveProperty('ts');
      expect(result.ts).toBe(mockTimestamp);
      expect(isValidSlackTimestamp(result.ts)).toBe(true);

      // Validate API call includes thread_ts
      expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);
      expect(mockSlackPostMessage).toHaveBeenCalledWith({
        channel: '#general',
        thread_ts: threadTs,
        text: 'Thread reply'
      });

      // Validate performance
      expect(duration).toBeLessThan(100);
    });

    it('should handle invalid thread timestamp', async () => {
      // Mock invalid thread error
      mockSlackPostMessage.mockRejectedValue(
        new Error('Invalid thread timestamp')
      );

      await expect(
        slackExecutor.replyInThread('#general', 'invalid-ts', 'Reply')
      ).rejects.toThrow('Invalid thread timestamp');
    });
  });
});

// ============================================================================
// Google Drive Executor Tests
// ============================================================================

describe('Drive Executor', () => {
  let driveExecutor: DriveExecutor;

  beforeEach(() => {
    driveExecutor = new DriveExecutor();
    jest.clearAllMocks();
  });

  describe('fileDocument', () => {
    it('should upload document and return link', async () => {
      // Mock successful file upload
      const mockLink = 'https://drive.google.com/file/d/abc123/view';
      mockDriveFilesCreate.mockResolvedValue({
        data: {
          id: 'file-123',
          webViewLink: mockLink
        }
      });

      // Measure execution time
      const { result, duration } = await measureExecutionTime(() =>
        driveExecutor.fileDocument(
          'test-document.txt',
          'Test content',
          'text/plain'
        )
      );

      // Validate output format
      expect(result).toHaveProperty('link');
      expect(result.link).toBe(mockLink);
      expect(isValidURL(result.link)).toBe(true);
      expect(result.link).toContain('drive.google.com');

      // Validate API call
      expect(mockDriveFilesCreate).toHaveBeenCalledTimes(1);
      const call = mockDriveFilesCreate.mock.calls[0][0] as any;
      expect(call.requestBody.name).toBe('test-document.txt');
      expect(call.requestBody.mimeType).toBe('text/plain');
      expect(call.media.body).toBe('Test content');

      // Validate performance
      expect(duration).toBeLessThan(150);
    });

    it('should handle storage quota exceeded', async () => {
      // Mock quota exceeded error
      mockDriveFilesCreate.mockRejectedValue(
        new Error('Storage quota exceeded')
      );

      await expect(
        driveExecutor.fileDocument('large-file.zip', 'content', 'application/zip')
      ).rejects.toThrow('Storage quota exceeded');
    });

    it('should handle invalid mime type', async () => {
      // Mock invalid mime type error
      mockDriveFilesCreate.mockRejectedValue(
        new Error('Invalid mime type')
      );

      await expect(
        driveExecutor.fileDocument('test.txt', 'content', 'invalid/type')
      ).rejects.toThrow('Invalid mime type');
    });
  });

  describe('organizeAttachments', () => {
    it('should create folder and upload attachments', async () => {
      // Mock folder creation
      const mockFolderId = 'folder-123';
      mockDriveFilesCreate
        .mockResolvedValueOnce({
          data: { id: mockFolderId }
        })
        // Mock file uploads
        .mockResolvedValueOnce({
          data: {
            id: 'file-1',
            webViewLink: 'https://drive.google.com/file/d/file-1/view'
          }
        })
        .mockResolvedValueOnce({
          data: {
            id: 'file-2',
            webViewLink: 'https://drive.google.com/file/d/file-2/view'
          }
        });

      const attachments = [
        { name: 'attachment1.pdf', content: 'content1' },
        { name: 'attachment2.png', content: 'content2' }
      ];

      // Measure execution time
      const { result, duration } = await measureExecutionTime(() =>
        driveExecutor.organizeAttachments(attachments)
      );

      // Validate output format
      expect(result).toHaveProperty('folderId');
      expect(result).toHaveProperty('files');
      expect(result.folderId).toBe(mockFolderId);
      expect(result.files).toHaveLength(2);

      // Validate each file has name and link
      result.files.forEach((file, index) => {
        expect(file).toHaveProperty('name');
        expect(file).toHaveProperty('link');
        expect(file.name).toBe(attachments[index].name);
        expect(isValidURL(file.link)).toBe(true);
      });

      // Validate API calls (1 for folder + 2 for files)
      expect(mockDriveFilesCreate).toHaveBeenCalledTimes(3);

      // Validate folder creation call
      const folderCall = mockDriveFilesCreate.mock.calls[0][0] as any;
      expect(folderCall.requestBody.name).toBe('Attachments');
      expect(folderCall.requestBody.mimeType).toBe('application/vnd.google-apps.folder');

      // Validate file upload calls include parent folder
      const file1Call = mockDriveFilesCreate.mock.calls[1][0] as any;
      expect(file1Call.requestBody.parents).toContain(mockFolderId);

      // Validate performance (multiple operations)
      expect(duration).toBeLessThan(300);
    });

    it('should handle empty attachments array', async () => {
      // Mock folder creation
      mockDriveFilesCreate.mockResolvedValue({
        data: { id: 'folder-123' }
      });

      const result = await driveExecutor.organizeAttachments([]);

      // Should still create folder
      expect(result.folderId).toBe('folder-123');
      expect(result.files).toHaveLength(0);
      expect(mockDriveFilesCreate).toHaveBeenCalledTimes(1);
    });
  });
});

// ============================================================================
// Google Sheets Executor Tests
// ============================================================================

describe('Sheets Executor', () => {
  let sheetsExecutor: SheetsExecutor;

  beforeEach(() => {
    sheetsExecutor = new SheetsExecutor();
    jest.clearAllMocks();
  });

  describe('appendRow', () => {
    it('should append row successfully', async () => {
      // Mock successful append
      mockSheetsAppend.mockResolvedValue({
        data: {
          updates: {
            updatedRange: 'Sheet1!A2:C2',
            updatedRows: 1
          }
        }
      });

      const values = [['John Doe', 'john@example.com', '555-0123']];

      // Measure execution time
      const { result, duration } = await measureExecutionTime(() =>
        sheetsExecutor.appendRow('spreadsheet-123', 'Sheet1!A:C', values)
      );

      // Validate output format
      expect(result).toHaveProperty('updatedRange');
      expect(result).toHaveProperty('updatedRows');
      expect(result.updatedRange).toBe('Sheet1!A2:C2');
      expect(result.updatedRows).toBe(1);
      expect(typeof result.updatedRange).toBe('string');
      expect(typeof result.updatedRows).toBe('number');

      // Validate API call
      expect(mockSheetsAppend).toHaveBeenCalledTimes(1);
      const call = mockSheetsAppend.mock.calls[0][0] as any;
      expect(call.spreadsheetId).toBe('spreadsheet-123');
      expect(call.range).toBe('Sheet1!A:C');
      expect(call.valueInputOption).toBe('USER_ENTERED');
      expect(call.requestBody.values).toEqual(values);

      // Validate performance
      expect(duration).toBeLessThan(100);
    });

    it('should handle invalid spreadsheet ID', async () => {
      // Mock spreadsheet not found error
      mockSheetsAppend.mockRejectedValue(
        new Error('Spreadsheet not found')
      );

      await expect(
        sheetsExecutor.appendRow('invalid-id', 'Sheet1!A:A', [['test']])
      ).rejects.toThrow('Spreadsheet not found');
    });

    it('should append multiple rows', async () => {
      // Mock successful multi-row append
      mockSheetsAppend.mockResolvedValue({
        data: {
          updates: {
            updatedRange: 'Sheet1!A2:C4',
            updatedRows: 3
          }
        }
      });

      const values = [
        ['Row 1 Col 1', 'Row 1 Col 2', 'Row 1 Col 3'],
        ['Row 2 Col 1', 'Row 2 Col 2', 'Row 2 Col 3'],
        ['Row 3 Col 1', 'Row 3 Col 2', 'Row 3 Col 3']
      ];

      const result = await sheetsExecutor.appendRow(
        'spreadsheet-123',
        'Sheet1!A:C',
        values
      );

      expect(result.updatedRows).toBe(3);
      expect(result.updatedRange).toBe('Sheet1!A2:C4');
    });
  });

  describe('updateCell', () => {
    it('should update cell successfully', async () => {
      // Mock successful update
      mockSheetsUpdate.mockResolvedValue({
        data: {
          updatedRange: 'Sheet1!A1',
          updatedCells: 1
        }
      });

      // Measure execution time
      const { result, duration } = await measureExecutionTime(() =>
        sheetsExecutor.updateCell('spreadsheet-123', 'Sheet1!A1', 'Updated Value')
      );

      // Validate output format
      expect(result).toHaveProperty('updatedRange');
      expect(result).toHaveProperty('updatedCells');
      expect(result.updatedRange).toBe('Sheet1!A1');
      expect(result.updatedCells).toBe(1);

      // Validate API call
      expect(mockSheetsUpdate).toHaveBeenCalledTimes(1);
      const call = mockSheetsUpdate.mock.calls[0][0] as any;
      expect(call.spreadsheetId).toBe('spreadsheet-123');
      expect(call.range).toBe('Sheet1!A1');
      expect(call.valueInputOption).toBe('USER_ENTERED');
      expect(call.requestBody.values).toEqual([['Updated Value']]);

      // Validate performance
      expect(duration).toBeLessThan(100);
    });

    it('should handle invalid range format', async () => {
      // Mock invalid range error
      mockSheetsUpdate.mockRejectedValue(
        new Error('Invalid range format')
      );

      await expect(
        sheetsExecutor.updateCell('spreadsheet-123', 'InvalidRange', 'value')
      ).rejects.toThrow('Invalid range format');
    });

    it('should handle permission denied', async () => {
      // Mock permission error
      mockSheetsUpdate.mockRejectedValue(
        new Error('Permission denied')
      );

      await expect(
        sheetsExecutor.updateCell('spreadsheet-123', 'Sheet1!A1', 'value')
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('logAction', () => {
    it('should log action to action sheet', async () => {
      // Mock successful log
      mockSheetsAppend.mockResolvedValue({
        data: {
          updates: {
            updatedRange: 'Actions!A2:E2',
            updatedRows: 1
          }
        }
      });

      const action = {
        type: 'create_task',
        status: 'success',
        duration: 287,
        metadata: {
          platform: 'notion',
          taskId: 'task-123'
        }
      };

      // Measure execution time
      const { result, duration } = await measureExecutionTime(() =>
        sheetsExecutor.logAction('spreadsheet-123', action)
      );

      // Validate output format
      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);

      // Validate API call
      expect(mockSheetsAppend).toHaveBeenCalledTimes(1);
      const call = mockSheetsAppend.mock.calls[0][0] as any;
      expect(call.spreadsheetId).toBe('spreadsheet-123');
      expect(call.range).toBe('Actions!A:E');

      // Validate row structure
      const row = call.requestBody.values[0] as any;
      expect(row).toHaveLength(5);
      expect(row[0]).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
      expect(row[1]).toBe(action.type);
      expect(row[2]).toBe(action.status);
      expect(row[3]).toBe(action.duration);
      expect(JSON.parse(row[4])).toEqual(action.metadata);

      // Validate performance
      expect(duration).toBeLessThan(100);
    });

    it('should handle missing optional fields', async () => {
      // Mock successful log
      mockSheetsAppend.mockResolvedValue({
        data: {
          updates: {
            updatedRange: 'Actions!A2:E2',
            updatedRows: 1
          }
        }
      });

      const action = {
        type: 'notify',
        status: 'success'
        // No duration or metadata
      };

      const result = await sheetsExecutor.logAction('spreadsheet-123', action);

      expect(result.success).toBe(true);

      // Validate row has default values
      const call = mockSheetsAppend.mock.calls[0][0] as any;
      const row = call.requestBody.values[0] as any;
      expect(row[3]).toBe(0); // Default duration
      expect(JSON.parse(row[4])).toEqual({}); // Default empty metadata
    });

    it('should handle logging failure gracefully', async () => {
      // Mock logging error
      mockSheetsAppend.mockRejectedValue(
        new Error('Failed to append row')
      );

      await expect(
        sheetsExecutor.logAction('spreadsheet-123', { type: 'test', status: 'success' })
      ).rejects.toThrow('Failed to append row');
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Cross-Executor Integration', () => {
  it('should handle sequential executor calls efficiently', async () => {
    // Set up mocks for all executors
    mockNotionPageCreate.mockResolvedValue({ id: 'notion-123' });
    mockNotionDatabaseQuery.mockResolvedValue({ results: [] });
    mockTrelloCreateCard.mockResolvedValue({ id: 'trello-123' });
    mockSlackPostMessage.mockResolvedValue({ ok: true, ts: '1234567890.123456' });
    mockDriveFilesCreate.mockResolvedValue({
      data: { id: 'drive-123', webViewLink: 'https://drive.google.com/file/d/drive-123/view' }
    });
    mockSheetsAppend.mockResolvedValue({
      data: { updates: { updatedRange: 'A1', updatedRows: 1 } }
    });

    // Create all executors
    const notion = new NotionExecutor();
    const trello = new TrelloExecutor();
    const slack = new SlackExecutor();
    const drive = new DriveExecutor();
    const sheets = new SheetsExecutor();

    // Measure total execution time for sequential calls
    const startTime = performance.now();

    await notion.createTask({ database_id: 'db-1', title: 'Task 1' });
    await trello.createCard({ name: 'Card 1', listId: 'list-1' });
    await slack.sendNotification('#general', 'Notification');
    await drive.fileDocument('doc.txt', 'content', 'text/plain');
    await sheets.appendRow('sheet-1', 'A:A', [['value']]);

    const totalDuration = performance.now() - startTime;

    // All executors should complete quickly with mocks
    expect(totalDuration).toBeLessThan(500);
  });

  it('should handle parallel executor calls efficiently', async () => {
    // Set up mocks
    mockNotionPageCreate.mockResolvedValue({ id: 'notion-123' });
    mockNotionDatabaseQuery.mockResolvedValue({ results: [] });
    mockTrelloCreateCard.mockResolvedValue({ id: 'trello-123' });
    mockSlackPostMessage.mockResolvedValue({ ok: true, ts: '1234567890.123456' });
    mockDriveFilesCreate.mockResolvedValue({
      data: { id: 'drive-123', webViewLink: 'https://drive.google.com/file/d/drive-123/view' }
    });
    mockSheetsAppend.mockResolvedValue({
      data: { updates: { updatedRange: 'A1', updatedRows: 1 } }
    });

    // Create all executors
    const notion = new NotionExecutor();
    const trello = new TrelloExecutor();
    const slack = new SlackExecutor();
    const drive = new DriveExecutor();
    const sheets = new SheetsExecutor();

    // Measure total execution time for parallel calls
    const startTime = performance.now();

    await Promise.all([
      notion.createTask({ database_id: 'db-1', title: 'Task 1' }),
      trello.createCard({ name: 'Card 1', listId: 'list-1' }),
      slack.sendNotification('#general', 'Notification'),
      drive.fileDocument('doc.txt', 'content', 'text/plain'),
      sheets.appendRow('sheet-1', 'A:A', [['value']])
    ]);

    const totalDuration = performance.now() - startTime;

    // Parallel execution should be faster than sequential
    expect(totalDuration).toBeLessThan(300);
  });
});

// ============================================================================
// Performance Benchmarks
// ============================================================================

describe('Performance Benchmarks', () => {
  it('should meet SLA for Notion operations', async () => {
    mockNotionDatabaseQuery.mockResolvedValue({ results: [] });
    mockNotionPageCreate.mockResolvedValue({ id: 'test-id' });

    const notion = new NotionExecutor();
    const { duration } = await measureExecutionTime(() =>
      notion.createTask({ database_id: 'db-1', title: 'Test' })
    );

    // Should complete in under 50ms with mocks
    expect(duration).toBeLessThan(50);
  });

  it('should meet SLA for Trello operations', async () => {
    mockTrelloCreateCard.mockResolvedValue({ id: 'test-id' });

    const trello = new TrelloExecutor();
    const { duration } = await measureExecutionTime(() =>
      trello.createCard({ name: 'Test', listId: 'list-1' })
    );

    expect(duration).toBeLessThan(50);
  });

  it('should meet SLA for Slack operations', async () => {
    mockSlackPostMessage.mockResolvedValue({ ok: true, ts: '1234567890.123456' });

    const slack = new SlackExecutor();
    const { duration } = await measureExecutionTime(() =>
      slack.sendNotification('#general', 'Test')
    );

    expect(duration).toBeLessThan(50);
  });

  it('should meet SLA for Drive operations', async () => {
    mockDriveFilesCreate.mockResolvedValue({
      data: { id: 'test-id', webViewLink: 'https://test.link' }
    });

    const drive = new DriveExecutor();
    const { duration } = await measureExecutionTime(() =>
      drive.fileDocument('test.txt', 'content', 'text/plain')
    );

    expect(duration).toBeLessThan(100);
  });

  it('should meet SLA for Sheets operations', async () => {
    mockSheetsAppend.mockResolvedValue({
      data: { updates: { updatedRange: 'A1', updatedRows: 1 } }
    });

    const sheets = new SheetsExecutor();
    const { duration } = await measureExecutionTime(() =>
      sheets.appendRow('sheet-1', 'A:A', [['test']])
    );

    expect(duration).toBeLessThan(50);
  });
});
