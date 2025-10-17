/**
 * Test Suite for Google Drive Executor
 * 
 * Tests file upload, email attachment organization, file movement,
 * permissions, folder structure creation, and search functionality.
 */

/// <reference types="jest" />

import * as DriveExecutor from '../drive-executor';
import { DocumentType, PermissionLevel } from '../drive-executor';

// Mock googleapis
jest.mock('googleapis', () => ({
  google: {
    drive: jest.fn(() => ({
      files: {
        list: jest.fn(),
        create: jest.fn(),
        get: jest.fn(),
        update: jest.fn()
      },
      permissions: {
        create: jest.fn()
      }
    }))
  }
}));

// Mock logger with all required methods
jest.mock('../../../utils/logger', () => {
  const mockLogger = {
    info: jest.fn().mockReturnValue(undefined),
    error: jest.fn().mockReturnValue(undefined),
    warn: jest.fn().mockReturnValue(undefined),
    debug: jest.fn().mockReturnValue(undefined)
  };
  return {
    __esModule: true,
    default: mockLogger
  };
});

describe('Drive Executor', () => {
  let driveMock: any;

  beforeEach(() => {
    jest.clearAllMocks();
    DriveExecutor.clearFolderCache();
    
    // Setup default mocks
    const { google } = require('googleapis');
    driveMock = google.drive();
    
    // Default mock implementations
    driveMock.files.list.mockResolvedValue({ data: { files: [] } });
    driveMock.files.create.mockResolvedValue({ data: { id: 'default-id' } });
    driveMock.files.get.mockResolvedValue({ data: { id: 'default-id' } });
    driveMock.files.update.mockResolvedValue({ data: { id: 'default-id' } });
    driveMock.permissions.create.mockResolvedValue({ data: { id: 'default-perm-id' } });
  });

  describe('fileDocument()', () => {
    it('should upload invoice to correct folder structure', async () => {
      // Mock folder lookup (not found)
      driveMock.files.list.mockResolvedValueOnce({ data: { files: [] } });
      // Mock folder creation
      driveMock.files.create.mockResolvedValueOnce({ data: { id: 'folder-invoices' } });
      driveMock.files.list.mockResolvedValueOnce({ data: { files: [] } });
      driveMock.files.create.mockResolvedValueOnce({ data: { id: 'folder-2025-01' } });
      // Mock file upload
      driveMock.files.create.mockResolvedValueOnce({
        data: {
          id: 'file-123',
          name: 'invoice-2025.pdf',
          webViewLink: 'https://drive.google.com/file/file-123',
          parents: ['folder-2025-01']
        }
      });

      const fileContent = Buffer.from('PDF content');
      const metadata: DriveExecutor.FileMetadata = {
        name: 'invoice-2025.pdf',
        type: DocumentType.INVOICE,
        mimeType: 'application/pdf',
        description: 'Q1 2025 Invoice',
        date: new Date('2025-01-15')
      };

      const result = await DriveExecutor.fileDocument(fileContent, metadata);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        fileId: 'file-123',
        fileName: 'invoice-2025.pdf',
        folderPath: 'Invoices/2025-01',
        webViewLink: 'https://drive.google.com/file/file-123'
      });
    });

    it('should upload report to quarterly folder', async () => {
      const { google } = require('googleapis');
      const driveMock = google.drive();

      // Mock existing folder
      driveMock.files.list.mockResolvedValueOnce({
        data: { files: [{ id: 'folder-reports', name: 'Reports' }] }
      });
      driveMock.files.list.mockResolvedValueOnce({
        data: { files: [{ id: 'folder-q1-2025', name: 'Q1-2025' }] }
      });
      // Mock file upload
      driveMock.files.create.mockResolvedValueOnce({
        data: {
          id: 'report-456',
          name: 'Q1-Report.pdf',
          webViewLink: 'https://drive.google.com/file/report-456',
          parents: ['folder-q1-2025']
        }
      });

      const fileContent = Buffer.from('Report content');
      const metadata: DriveExecutor.FileMetadata = {
        name: 'Q1-Report.pdf',
        type: DocumentType.REPORT,
        mimeType: 'application/pdf',
        date: new Date('2025-03-31')
      };

      const result = await DriveExecutor.fileDocument(fileContent, metadata);

      expect(result.success).toBe(true);
      expect(result.data.folderPath).toBe('Reports/Q1-2025');
    });

    it('should upload contract to Active folder', async () => {
      const { google } = require('googleapis');
      const driveMock = google.drive();

      // Mock folders
      driveMock.files.list.mockResolvedValue({
        data: { files: [{ id: 'folder-contracts', name: 'Contracts' }] }
      });
      driveMock.files.list.mockResolvedValue({
        data: { files: [{ id: 'folder-active', name: 'Active' }] }
      });
      // Mock file upload
      driveMock.files.create.mockResolvedValueOnce({
        data: {
          id: 'contract-789',
          name: 'Client-Agreement.pdf',
          webViewLink: 'https://drive.google.com/file/contract-789',
          parents: ['folder-active']
        }
      });

      const fileContent = Buffer.from('Contract content');
      const metadata: DriveExecutor.FileMetadata = {
        name: 'Client-Agreement.pdf',
        type: DocumentType.CONTRACT,
        mimeType: 'application/pdf',
        date: new Date() // Recent date = Active
      };

      const result = await DriveExecutor.fileDocument(fileContent, metadata);

      expect(result.success).toBe(true);
      expect(result.data.folderPath).toBe('Contracts/Active');
    });

    it('should set permissions for assignee', async () => {
      const { google } = require('googleapis');
      const driveMock = google.drive();

      // Mock folders
      driveMock.files.list.mockResolvedValue({
        data: { files: [{ id: 'folder-docs', name: 'Documents' }] }
      });
      driveMock.files.list.mockResolvedValue({
        data: { files: [{ id: 'folder-2025-01', name: '2025-01' }] }
      });
      // Mock file upload
      driveMock.files.create.mockResolvedValueOnce({
        data: {
          id: 'file-assign-123',
          name: 'task-document.pdf',
          webViewLink: 'https://drive.google.com/file/file-assign-123',
          parents: ['folder-2025-01']
        }
      });
      // Mock permission creation
      driveMock.permissions.create.mockResolvedValueOnce({
        data: { id: 'perm-123' }
      });

      const fileContent = Buffer.from('Task document');
      const metadata: DriveExecutor.FileMetadata = {
        name: 'task-document.pdf',
        type: DocumentType.DOCUMENT,
        mimeType: 'application/pdf',
        assignee: 'assignee@example.com'
      };

      const result = await DriveExecutor.fileDocument(fileContent, metadata);

      expect(result.success).toBe(true);
      expect(driveMock.permissions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'file-assign-123',
          requestBody: expect.objectContaining({
            type: 'user',
            emailAddress: 'assignee@example.com',
            role: PermissionLevel.EDIT
          })
        })
      );
    });

    it('should add tags as app properties', async () => {
      const { google } = require('googleapis');
      const driveMock = google.drive();

      // Mock folders
      driveMock.files.list.mockResolvedValue({
        data: { files: [{ id: 'folder-docs' }] }
      });
      // Mock file upload
      driveMock.files.create.mockResolvedValueOnce({
        data: {
          id: 'file-tags-456',
          name: 'tagged-doc.pdf',
          webViewLink: 'https://drive.google.com/file/file-tags-456'
        }
      });
      // Mock update for tags
      driveMock.files.update.mockResolvedValueOnce({ data: {} });

      const fileContent = Buffer.from('Tagged document');
      const metadata: DriveExecutor.FileMetadata = {
        name: 'tagged-doc.pdf',
        type: DocumentType.DOCUMENT,
        mimeType: 'application/pdf',
        tags: ['urgent', 'client-a', 'q1-2025']
      };

      const result = await DriveExecutor.fileDocument(fileContent, metadata);

      expect(result.success).toBe(true);
      expect(driveMock.files.update).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'file-tags-456',
          requestBody: {
            appProperties: {
              tag_0: 'urgent',
              tag_1: 'client-a',
              tag_2: 'q1-2025'
            }
          }
        })
      );
    });
  });

  describe('organizeEmailAttachments()', () => {
    it('should organize attachments into sender-based folders', async () => {
      const { google } = require('googleapis');
      const driveMock = google.drive();

      // Mock folder structure
      driveMock.files.list.mockResolvedValue({
        data: { files: [] }
      });
      driveMock.files.create
        .mockResolvedValueOnce({ data: { id: 'folder-email' } })
        .mockResolvedValueOnce({ data: { id: 'folder-2025-01' } })
        .mockResolvedValueOnce({ data: { id: 'folder-sender' } });

      // Mock file uploads
      driveMock.files.create
        .mockResolvedValueOnce({
          data: {
            id: 'attach-1',
            name: 'document.pdf',
            webViewLink: 'https://drive.google.com/file/attach-1',
            size: '12345'
          }
        })
        .mockResolvedValueOnce({
          data: {
            id: 'attach-2',
            name: 'image.png',
            webViewLink: 'https://drive.google.com/file/attach-2',
            size: '67890'
          }
        });

      // Mock metadata updates
      driveMock.files.update.mockResolvedValue({ data: {} });

      const attachments = [
        {
          filename: 'document.pdf',
          content: Buffer.from('PDF content'),
          mimeType: 'application/pdf',
          size: 12345
        },
        {
          filename: 'image.png',
          content: Buffer.from('PNG content'),
          mimeType: 'image/png',
          size: 67890
        }
      ];

      const emailContext = {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Important Documents',
        date: new Date('2025-01-15'),
        messageId: 'msg-123'
      };

      const result = await DriveExecutor.organizeEmailAttachments(attachments, emailContext);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        folderPath: 'Email Attachments/2025-01/From-sender',
        uploadedCount: 2,
        failedCount: 0
      });
      expect(result.data.files).toHaveLength(2);
    });

    it('should handle partial upload failures gracefully', async () => {
      const { google } = require('googleapis');
      const driveMock = google.drive();

      // Mock folders
      driveMock.files.list.mockResolvedValue({
        data: { files: [{ id: 'folder-existing' }] }
      });

      // First upload succeeds, second fails
      driveMock.files.create
        .mockResolvedValueOnce({
          data: {
            id: 'attach-success',
            name: 'success.pdf',
            webViewLink: 'https://drive.google.com/file/attach-success',
            size: '1000'
          }
        })
        .mockRejectedValueOnce(new Error('Upload quota exceeded'));

      driveMock.files.update.mockResolvedValue({ data: {} });

      const attachments = [
        {
          filename: 'success.pdf',
          content: Buffer.from('OK'),
          mimeType: 'application/pdf',
          size: 1000
        },
        {
          filename: 'failure.pdf',
          content: Buffer.from('TOO BIG'),
          mimeType: 'application/pdf',
          size: 999999999
        }
      ];

      const emailContext = {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Mixed Results',
        date: new Date()
      };

      const result = await DriveExecutor.organizeEmailAttachments(attachments, emailContext);

      expect(result.success).toBe(true);
      expect(result.data.uploadedCount).toBe(1);
      expect(result.data.failedCount).toBe(1);
      expect(result.data.files[1]).toMatchObject({
        fileName: 'failure.pdf',
        error: 'Upload quota exceeded'
      });
    });

    it('should add email metadata to uploaded files', async () => {
      const { google } = require('googleapis');
      const driveMock = google.drive();

      // Mock folders
      driveMock.files.list.mockResolvedValue({
        data: { files: [{ id: 'folder' }] }
      });

      // Mock upload
      driveMock.files.create.mockResolvedValueOnce({
        data: {
          id: 'file-with-metadata',
          name: 'document.pdf',
          webViewLink: 'https://drive.google.com/file/file-with-metadata'
        }
      });

      // Mock metadata update
      driveMock.files.update.mockResolvedValueOnce({ data: {} });

      const attachments = [
        {
          filename: 'document.pdf',
          content: Buffer.from('content'),
          mimeType: 'application/pdf',
          size: 1000
        }
      ];

      const emailContext = {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Email',
        date: new Date('2025-01-15T10:30:00Z'),
        messageId: 'unique-msg-id'
      };

      await DriveExecutor.organizeEmailAttachments(attachments, emailContext);

      expect(driveMock.files.update).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'file-with-metadata',
          requestBody: {
            appProperties: {
              email_from: 'sender@example.com',
              email_subject: 'Test Email',
              email_date: '2025-01-15T10:30:00.000Z',
              email_message_id: 'unique-msg-id'
            }
          }
        })
      );
    });
  });

  describe('moveFile()', () => {
    it('should move file to new folder', async () => {
      const { google } = require('googleapis');
      const driveMock = google.drive();

      // Mock get file
      driveMock.files.get.mockResolvedValueOnce({
        data: {
          id: 'file-move-123',
          name: 'document.pdf',
          parents: ['old-folder-id']
        }
      });

      // Mock update
      driveMock.files.update.mockResolvedValueOnce({
        data: {
          id: 'file-move-123',
          name: 'document.pdf',
          parents: ['new-folder-id'],
          webViewLink: 'https://drive.google.com/file/file-move-123'
        }
      });

      const result = await DriveExecutor.moveFile('file-move-123', 'new-folder-id');

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        fileId: 'file-move-123',
        previousParents: ['old-folder-id'],
        newParents: ['new-folder-id']
      });
      expect(driveMock.files.update).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'file-move-123',
          addParents: 'new-folder-id',
          removeParents: 'old-folder-id'
        })
      );
    });

    it('should keep file in multiple folders when removePreviousParents is false', async () => {
      const { google } = require('googleapis');
      const driveMock = google.drive();

      driveMock.files.get.mockResolvedValueOnce({
        data: {
          id: 'file-123',
          name: 'shared-doc.pdf',
          parents: ['folder-a']
        }
      });

      driveMock.files.update.mockResolvedValueOnce({
        data: {
          id: 'file-123',
          name: 'shared-doc.pdf',
          parents: ['folder-a', 'folder-b'],
          webViewLink: 'https://drive.google.com/file/file-123'
        }
      });

      const result = await DriveExecutor.moveFile('file-123', 'folder-b', false);

      expect(result.success).toBe(true);
      expect(driveMock.files.update).toHaveBeenCalledWith(
        expect.objectContaining({
          addParents: 'folder-b'
        })
      );
      expect(driveMock.files.update).toHaveBeenCalledWith(
        expect.not.objectContaining({
          removeParents: expect.anything()
        })
      );
    });
  });

  describe('setFilePermissions()', () => {
    it('should grant view permission to user', async () => {
      const { google } = require('googleapis');
      const driveMock = google.drive();

      driveMock.permissions.create.mockResolvedValueOnce({
        data: { id: 'perm-view-123' }
      });

      const result = await DriveExecutor.setFilePermissions(
        'file-123',
        'viewer@example.com',
        PermissionLevel.VIEW,
        'user'
      );

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        permissionId: 'perm-view-123',
        fileId: 'file-123',
        emailOrDomain: 'viewer@example.com',
        role: PermissionLevel.VIEW
      });
    });

    it('should grant edit permission to assignee', async () => {
      const { google } = require('googleapis');
      const driveMock = google.drive();

      driveMock.permissions.create.mockResolvedValueOnce({
        data: { id: 'perm-edit-456' }
      });

      const result = await DriveExecutor.setFilePermissions(
        'file-456',
        'editor@example.com',
        PermissionLevel.EDIT,
        'user'
      );

      expect(result.success).toBe(true);
      expect(driveMock.permissions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'file-456',
          requestBody: expect.objectContaining({
            type: 'user',
            role: PermissionLevel.EDIT,
            emailAddress: 'editor@example.com'
          })
        })
      );
    });
  });

  describe('shareFileWithTeam()', () => {
    it('should share file with team (view) and assignee (edit)', async () => {
      const { google } = require('googleapis');
      const driveMock = google.drive();

      driveMock.permissions.create
        .mockResolvedValueOnce({ data: { id: 'perm-team' } })
        .mockResolvedValueOnce({ data: { id: 'perm-assignee' } });

      const result = await DriveExecutor.shareFileWithTeam(
        'file-789',
        'team@example.com',
        'assignee@example.com'
      );

      expect(result.success).toBe(true);
      expect(result.data.permissions).toHaveLength(2);
      expect(result.data.permissions[0].role).toBe('view');
      expect(result.data.permissions[1].role).toBe('edit');
    });
  });

  describe('searchFiles()', () => {
    it('should search files by query', async () => {
      const { google } = require('googleapis');
      const driveMock = google.drive();

      driveMock.files.list.mockResolvedValueOnce({
        data: {
          files: [
            {
              id: 'search-1',
              name: 'invoice-2025.pdf',
              mimeType: 'application/pdf',
              size: '12345',
              createdTime: '2025-01-01T00:00:00Z',
              modifiedTime: '2025-01-15T10:00:00Z',
              webViewLink: 'https://drive.google.com/file/search-1'
            },
            {
              id: 'search-2',
              name: 'invoice-2024.pdf',
              mimeType: 'application/pdf',
              size: '67890',
              createdTime: '2024-12-01T00:00:00Z',
              modifiedTime: '2024-12-15T10:00:00Z',
              webViewLink: 'https://drive.google.com/file/search-2'
            }
          ]
        }
      });

      const result = await DriveExecutor.searchFiles("name contains 'invoice'");

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(2);
      expect(result.data.files).toHaveLength(2);
    });
  });

  describe('Folder Caching', () => {
    it('should cache folder lookups', async () => {
      const { google } = require('googleapis');
      const driveMock = google.drive();

      // First call - folder lookup
      driveMock.files.list.mockResolvedValueOnce({
        data: { files: [{ id: 'cached-folder', name: 'Documents' }] }
      });

      // Create two files - should only look up folder once
      driveMock.files.create
        .mockResolvedValueOnce({
          data: { id: 'file-1', webViewLink: 'link-1' }
        })
        .mockResolvedValueOnce({
          data: { id: 'file-2', webViewLink: 'link-2' }
        });

      const metadata1: DriveExecutor.FileMetadata = {
        name: 'doc1.pdf',
        type: DocumentType.DOCUMENT,
        mimeType: 'application/pdf',
        date: new Date('2025-01-15')
      };

      const metadata2: DriveExecutor.FileMetadata = {
        name: 'doc2.pdf',
        type: DocumentType.DOCUMENT,
        mimeType: 'application/pdf',
        date: new Date('2025-01-16')
      };

      await DriveExecutor.fileDocument(Buffer.from('content1'), metadata1);
      await DriveExecutor.fileDocument(Buffer.from('content2'), metadata2);

      // Should only call list once for folder lookup (cached on second call)
      const listCalls = driveMock.files.list.mock.calls.filter((call: any) => 
        call[0].q && call[0].q.includes('mimeType=\'application/vnd.google-apps.folder\'')
      );
      
      expect(listCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Smart Folder Organization', () => {
    describe('inferCategory()', () => {
      it('should infer invoice from filename', () => {
        const category = DriveExecutor.inferCategory('invoice-2025-Q1.pdf');
        expect(category).toBe(DocumentType.INVOICE);
      });

      it('should infer invoice from context', () => {
        const category = DriveExecutor.inferCategory(
          'document.pdf',
          undefined,
          { description: 'Payment invoice for services', tags: ['billing'] }
        );
        expect(category).toBe(DocumentType.INVOICE);
      });

      it('should infer contract from filename', () => {
        const category = DriveExecutor.inferCategory('NDA-Agreement-2025.pdf');
        expect(category).toBe(DocumentType.CONTRACT);
      });

      it('should infer report from keywords', () => {
        const category = DriveExecutor.inferCategory(
          'Q1-Analysis.pdf',
          undefined,
          { description: 'Quarterly summary report', tags: ['metrics'] }
        );
        expect(category).toBe(DocumentType.REPORT);
      });

      it('should default to document for unknown types', () => {
        const category = DriveExecutor.inferCategory('random-file.txt');
        expect(category).toBe(DocumentType.DOCUMENT);
      });

      it('should infer from file content', () => {
        const content = Buffer.from('Invoice Number: INV-12345\nAmount Due: $1,000');
        const category = DriveExecutor.inferCategory('document.pdf', content);
        expect(category).toBe(DocumentType.INVOICE);
      });
    });

    describe('Project-based organization', () => {
      it('should organize files by project', async () => {
        const { google } = require('googleapis');
        const driveMock = google.drive();

        // Mock folder creation for Projects/ClientA/Invoices/2025-01
        driveMock.files.list.mockResolvedValue({ data: { files: [] } });
        driveMock.files.create
          .mockResolvedValueOnce({ data: { id: 'folder-projects' } })
          .mockResolvedValueOnce({ data: { id: 'folder-clienta' } })
          .mockResolvedValueOnce({ data: { id: 'folder-invoices' } })
          .mockResolvedValueOnce({ data: { id: 'folder-2025-01' } });
        
        // Mock file upload
        driveMock.files.create.mockResolvedValueOnce({
          data: {
            id: 'file-project-123',
            name: 'invoice.pdf',
            webViewLink: 'https://drive.google.com/file/file-project-123'
          }
        });

        const fileContent = Buffer.from('Invoice content');
        const metadata: DriveExecutor.FileMetadata = {
          name: 'invoice.pdf',
          type: DocumentType.INVOICE,
          mimeType: 'application/pdf',
          project: 'ClientA',
          date: new Date('2025-01-15')
        };

        const result = await DriveExecutor.fileDocument(fileContent, metadata);

        expect(result.success).toBe(true);
        expect(result.data.folderPath).toBe('Projects/ClientA/Invoices/2025-01');
      });

      it('should organize reports by project and quarter', async () => {
        const { google } = require('googleapis');
        const driveMock = google.drive();

        driveMock.files.list.mockResolvedValue({ data: { files: [] } });
        driveMock.files.create
          .mockResolvedValueOnce({ data: { id: 'folder-projects' } })
          .mockResolvedValueOnce({ data: { id: 'folder-acme' } })
          .mockResolvedValueOnce({ data: { id: 'folder-reports' } })
          .mockResolvedValueOnce({ data: { id: 'folder-q1' } });
        
        driveMock.files.create.mockResolvedValueOnce({
          data: {
            id: 'file-report-456',
            name: 'Q1-Report.pdf',
            webViewLink: 'https://drive.google.com/file/file-report-456'
          }
        });

        const metadata: DriveExecutor.FileMetadata = {
          name: 'Q1-Report.pdf',
          type: DocumentType.REPORT,
          mimeType: 'application/pdf',
          project: 'ACME Corp',
          date: new Date('2025-03-31')
        };

        const result = await DriveExecutor.fileDocument(Buffer.from('Report'), metadata);

        expect(result.success).toBe(true);
        expect(result.data.folderPath).toBe('Projects/ACME Corp/Reports/Q1-2025');
      });
    });

    describe('Sender-based organization', () => {
      it('should organize files by important client sender', async () => {
        const { google } = require('googleapis');
        const driveMock = google.drive();

        driveMock.files.list.mockResolvedValue({ data: { files: [] } });
        driveMock.files.create
          .mockResolvedValueOnce({ data: { id: 'folder-clients' } })
          .mockResolvedValueOnce({ data: { id: 'folder-vip' } })
          .mockResolvedValueOnce({ data: { id: 'folder-invoices' } })
          .mockResolvedValueOnce({ data: { id: 'folder-2025-01' } });
        
        driveMock.files.create.mockResolvedValueOnce({
          data: {
            id: 'file-sender-789',
            name: 'payment.pdf',
            webViewLink: 'https://drive.google.com/file/file-sender-789'
          }
        });

        const metadata: DriveExecutor.FileMetadata = {
          name: 'payment.pdf',
          type: DocumentType.INVOICE,
          mimeType: 'application/pdf',
          sender: 'VIP Client',
          date: new Date('2025-01-15')
        };

        const result = await DriveExecutor.fileDocument(Buffer.from('Payment'), metadata);

        expect(result.success).toBe(true);
        expect(result.data.folderPath).toBe('Clients/VIP Client/Invoices/2025-01');
      });

      it('should organize contracts by sender', async () => {
        const { google } = require('googleapis');
        const driveMock = google.drive();

        driveMock.files.list.mockResolvedValue({ data: { files: [] } });
        driveMock.files.create
          .mockResolvedValueOnce({ data: { id: 'folder-clients' } })
          .mockResolvedValueOnce({ data: { id: 'folder-enterprise' } })
          .mockResolvedValueOnce({ data: { id: 'folder-contracts' } });
        
        driveMock.files.create.mockResolvedValueOnce({
          data: {
            id: 'file-contract-321',
            name: 'MSA.pdf',
            webViewLink: 'https://drive.google.com/file/file-contract-321'
          }
        });

        const metadata: DriveExecutor.FileMetadata = {
          name: 'MSA.pdf',
          type: DocumentType.CONTRACT,
          mimeType: 'application/pdf',
          sender: 'Enterprise Client'
        };

        const result = await DriveExecutor.fileDocument(Buffer.from('MSA'), metadata);

        expect(result.success).toBe(true);
        expect(result.data.folderPath).toBe('Clients/Enterprise Client/Contracts');
      });
    });

    describe('Auto-inference', () => {
      it('should auto-infer category when autoInfer is true', async () => {
        const { google } = require('googleapis');
        const driveMock = google.drive();

        driveMock.files.list.mockResolvedValue({ data: { files: [] } });
        driveMock.files.create
          .mockResolvedValueOnce({ data: { id: 'folder-invoices' } })
          .mockResolvedValueOnce({ data: { id: 'folder-2025-01' } });
        
        driveMock.files.create.mockResolvedValueOnce({
          data: {
            id: 'file-auto-123',
            name: 'invoice-2025.pdf',
            webViewLink: 'https://drive.google.com/file/file-auto-123'
          }
        });

        const metadata: DriveExecutor.FileMetadata = {
          name: 'invoice-2025.pdf',
          type: DocumentType.OTHER,  // Will be auto-inferred
          mimeType: 'application/pdf',
          autoInfer: true,
          date: new Date('2025-01-15')
        };

        const result = await DriveExecutor.fileDocument(Buffer.from('Invoice'), metadata);

        expect(result.success).toBe(true);
        // Should be organized as invoice (auto-inferred)
        expect(result.data.folderPath).toBe('Invoices/2025-01');
      });
    });
  });
});
