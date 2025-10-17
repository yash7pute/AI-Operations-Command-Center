/**
 * Google Drive Executor
 * 
 * Manages file uploads, organization, and folder structure in Google Drive.
 * Implements smart folder routing based on document types and metadata.
 * 
 * Key Features:
 * - Smart folder routing by document type and date
 * - Email attachment organization
 * - File movement and reorganization
 * - Permission management (team view, assignee edit)
 * - Folder hierarchy creation
 * 
 * Folder Structure:
 * - Invoices/YYYY-MM/
 * - Reports/QX-YYYY/
 * - Contracts/Active|Archive/
 * - Documents/YYYY-MM/
 * - Email Attachments/YYYY-MM/From-{Sender}/
 */

import { google } from 'googleapis';
import { ExecutionResult } from '../../types';
import { config } from '../../config';
import { logExecutionStart, logExecutionSuccess, logExecutionFailure } from '../execution-logger';

const drive = google.drive({
  version: 'v3',
  auth: config.GOOGLE_DRIVE_API_KEY
});

/**
 * Document type categories for smart folder routing
 */
export enum DocumentType {
  INVOICE = 'invoice',
  REPORT = 'report',
  CONTRACT = 'contract',
  EMAIL_ATTACHMENT = 'email_attachment',
  DOCUMENT = 'document',
  OTHER = 'other'
}

/**
 * File metadata for upload and organization
 */
export interface FileMetadata {
  name: string;
  type: DocumentType;
  mimeType: string;
  description?: string;
  date?: Date;
  assignee?: string;
  tags?: string[];
  source?: string;
  project?: string;        // Project name for project-based organization
  sender?: string;         // Important client/sender for special handling
  autoInfer?: boolean;     // Auto-infer category from filename/content (default: false)
}

/**
 * Email context for organizing attachments
 */
export interface EmailContext {
  from: string;
  to: string;
  subject: string;
  date: Date;
  messageId?: string;
}

/**
 * Attachment information
 */
export interface Attachment {
  filename: string;
  content: Buffer | string;
  mimeType: string;
  size: number;
}

/**
 * Permission level for file sharing
 */
export enum PermissionLevel {
  VIEW = 'reader',
  COMMENT = 'commenter',
  EDIT = 'writer'
}

/**
 * Folder cache to avoid repeated lookups
 */
const folderCache = new Map<string, string>();

/**
 * Helper to get current quarter
 */
function getCurrentQuarter(date: Date = new Date()): string {
  const quarter = Math.ceil((date.getMonth() + 1) / 3);
  return `Q${quarter}-${date.getFullYear()}`;
}

/**
 * Helper to format date as YYYY-MM
 */
function formatYearMonth(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Helper to sanitize folder names
 */
function sanitizeFolderName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_');
}

/**
 * Get or create a folder by path
 */
async function getOrCreateFolder(folderPath: string, rootFolderId?: string): Promise<string> {
  const cacheKey = `${rootFolderId || 'root'}:${folderPath}`;
  
  if (folderCache.has(cacheKey)) {
    return folderCache.get(cacheKey)!;
  }

  const pathParts = folderPath.split('/').filter(p => p.length > 0);
  let currentParentId = rootFolderId || config.GOOGLE_DRIVE_ROOT_FOLDER_ID || 'root';

  for (const folderName of pathParts) {
    const sanitizedName = sanitizeFolderName(folderName);
    
    const query = `name='${sanitizedName}' and '${currentParentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    if (response.data.files && response.data.files.length > 0) {
      currentParentId = response.data.files[0].id!;
    } else {
      const folderMetadata = {
        name: sanitizedName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [currentParentId]
      };

      const folder = await drive.files.create({
        requestBody: folderMetadata,
        fields: 'id'
      });

      currentParentId = folder.data.id!;
    }
  }

  folderCache.set(cacheKey, currentParentId);
  return currentParentId;
}

/**
 * Infer document category from filename, content, and context using heuristics
 * 
 * @param fileName - File name
 * @param content - Optional file content (Buffer or string)
 * @param context - Optional context (description, tags, etc.)
 * @returns Inferred DocumentType
 */
export function inferCategory(
  fileName: string,
  content?: Buffer | string,
  context?: { description?: string; tags?: string[]; source?: string }
): DocumentType {
  const lowerFileName = fileName.toLowerCase();
  const contextText = [
    lowerFileName,
    context?.description?.toLowerCase() || '',
    ...(context?.tags?.map(t => t.toLowerCase()) || []),
    context?.source?.toLowerCase() || ''
  ].join(' ');

  // Extract text from content if available (simple heuristic)
  let contentText = '';
  if (content) {
    try {
      if (Buffer.isBuffer(content)) {
        // Try to extract text from first 1KB (basic text extraction)
        contentText = content.slice(0, 1024).toString('utf-8', 0, Math.min(1024, content.length)).toLowerCase();
      } else {
        contentText = content.slice(0, 1024).toLowerCase();
      }
    } catch (e) {
      // Ignore encoding errors
    }
  }

  const combinedText = `${contextText} ${contentText}`;

  // Invoice detection - highest priority
  const invoiceKeywords = ['invoice', 'bill', 'receipt', 'payment', 'due', 'amount due', 'invoice no', 'invoice number', 'billing'];
  if (invoiceKeywords.some(keyword => combinedText.includes(keyword))) {
    return DocumentType.INVOICE;
  }

  // Contract detection
  const contractKeywords = ['contract', 'agreement', 'nda', 'non-disclosure', 'terms and conditions', 'mou', 'memorandum', 'sow', 'statement of work'];
  if (contractKeywords.some(keyword => combinedText.includes(keyword))) {
    return DocumentType.CONTRACT;
  }

  // Report detection
  const reportKeywords = ['report', 'summary', 'analysis', 'quarterly', 'monthly', 'annual', 'executive summary', 'findings', 'metrics'];
  if (reportKeywords.some(keyword => combinedText.includes(keyword))) {
    return DocumentType.REPORT;
  }

  // Media detection (by extension)
  const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.mp4', '.avi', '.mov', '.mp3', '.wav', '.webm'];
  if (mediaExtensions.some(ext => lowerFileName.endsWith(ext))) {
    return DocumentType.OTHER; // Could add DocumentType.MEDIA if needed
  }

  // Data detection (by extension)
  const dataExtensions = ['.csv', '.xls', '.xlsx', '.json', '.xml', '.sql', '.db'];
  if (dataExtensions.some(ext => lowerFileName.endsWith(ext))) {
    return DocumentType.OTHER; // Could add DocumentType.DATA if needed
  }

  // Default to DOCUMENT
  return DocumentType.DOCUMENT;
}

/**
 * Determine folder path based on document type and metadata
 * 
 * Supports multiple organization strategies:
 * - By project: If metadata.project is set
 * - By sender: If metadata.sender is set (for important clients)
 * - By date: YYYY-MM or QX-YYYY format
 * - By category: Invoices, Reports, Contracts, etc.
 */
function determineFolderPath(metadata: FileMetadata): string {
  const date = metadata.date || new Date();
  
  // Project-based organization (highest priority)
  if (metadata.project) {
    const projectName = sanitizeFolderName(metadata.project);
    
    // Project folders include category subfolders
    switch (metadata.type) {
      case DocumentType.INVOICE:
        return `Projects/${projectName}/Invoices/${formatYearMonth(date)}`;
      
      case DocumentType.REPORT:
        return `Projects/${projectName}/Reports/${getCurrentQuarter(date)}`;
      
      case DocumentType.CONTRACT:
        return `Projects/${projectName}/Contracts`;
      
      default:
        return `Projects/${projectName}/Documents/${formatYearMonth(date)}`;
    }
  }
  
  // Sender-based organization for important clients
  if (metadata.sender) {
    const senderName = sanitizeFolderName(metadata.sender);
    
    switch (metadata.type) {
      case DocumentType.INVOICE:
        return `Clients/${senderName}/Invoices/${formatYearMonth(date)}`;
      
      case DocumentType.CONTRACT:
        return `Clients/${senderName}/Contracts`;
      
      default:
        return `Clients/${senderName}/Documents/${formatYearMonth(date)}`;
    }
  }

  // Standard category-based organization
  switch (metadata.type) {
    case DocumentType.INVOICE:
      return `Invoices/${formatYearMonth(date)}`;
    
    case DocumentType.REPORT:
      return `Reports/${getCurrentQuarter(date)}`;
    
    case DocumentType.CONTRACT:
      const isArchived = (new Date().getTime() - date.getTime()) > (365 * 24 * 60 * 60 * 1000);
      return `Contracts/${isArchived ? 'Archive' : 'Active'}`;
    
    case DocumentType.EMAIL_ATTACHMENT:
      return `Email Attachments/${formatYearMonth(date)}`;
    
    case DocumentType.DOCUMENT:
      return `Documents/${formatYearMonth(date)}`;
    
    default:
      return `Documents/${formatYearMonth(date)}`;
  }
}

/**
 * Upload a file to Google Drive with smart folder routing
 * 
 * Features:
 * - Auto-infer category from filename/content if autoInfer is true
 * - Project-based organization
 * - Sender-based organization
 * - Date-based folder structure
 * - Permission management
 * - Metadata tagging
 */
export async function fileDocument(
  fileContent: Buffer | string,
  metadata: FileMetadata
): Promise<ExecutionResult> {
  const actionId = `drive-file-${Date.now()}`;
  const startTime = Date.now();
  
  try {
    // Auto-infer category if requested and type is OTHER or not specified
    if (metadata.autoInfer && (metadata.type === DocumentType.OTHER || !metadata.type)) {
      metadata.type = inferCategory(
        metadata.name,
        fileContent,
        {
          description: metadata.description,
          tags: metadata.tags,
          source: metadata.source
        }
      );
    }

    await logExecutionStart(
      actionId,
      actionId,
      'file_document',
      'drive',
      { filename: metadata.name, type: metadata.type, project: metadata.project, sender: metadata.sender }
    );

    const folderPath = determineFolderPath(metadata);
    const folderId = await getOrCreateFolder(folderPath);

    const fileMetadata: any = {
      name: metadata.name,
      parents: [folderId]
    };

    if (metadata.description) {
      fileMetadata.description = metadata.description;
    }

    const media = {
      mimeType: metadata.mimeType,
      body: Buffer.isBuffer(fileContent) 
        ? fileContent 
        : Buffer.from(fileContent, 'base64')
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink, parents'
    });

    const fileId = response.data.id!;
    const webViewLink = response.data.webViewLink!;

    if (metadata.assignee) {
      await setFilePermissions(fileId, metadata.assignee, PermissionLevel.EDIT);
    }

    if (metadata.tags && metadata.tags.length > 0) {
      const properties: { [key: string]: string } = {};
      metadata.tags.forEach((tag, index) => {
        properties[`tag_${index}`] = tag;
      });

      await drive.files.update({
        fileId: fileId,
        requestBody: {
          appProperties: properties
        }
      });
    }

    const executionTime = Date.now() - startTime;
    const resultData = {
      fileId,
      fileName: metadata.name,
      folderPath,
      webViewLink,
      uploadedAt: new Date().toISOString()
    };

    await logExecutionSuccess(
      actionId,
      actionId,
      'file_document',
      'drive',
      { filename: metadata.name, type: metadata.type },
      resultData,
      executionTime
    );

    return {
      success: true,
      data: resultData,
      executionTime,
      executorUsed: 'drive'
    };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    
    await logExecutionFailure(
      actionId,
      actionId,
      'file_document',
      'drive',
      { filename: metadata.name, type: metadata.type },
      error.message || 'Failed to upload file to Drive',
      executionTime
    );

    return {
      success: false,
      error: error.message || 'Failed to upload file to Drive',
      executionTime,
      executorUsed: 'drive'
    };
  }
}

/**
 * Organize email attachments into Drive
 */
export async function organizeEmailAttachments(
  attachments: Attachment[],
  emailContext: EmailContext
): Promise<ExecutionResult> {
  const actionId = `drive-email-attachments-${Date.now()}`;
  const startTime = Date.now();
  
  try {
    await logExecutionStart(
      actionId,
      actionId,
      'organize_email_attachments',
      'drive',
      { count: attachments.length, from: emailContext.from }
    );

    const senderName = sanitizeFolderName(
      emailContext.from.split('@')[0] || emailContext.from
    );
    const folderPath = `Email Attachments/${formatYearMonth(emailContext.date)}/From-${senderName}`;
    const folderId = await getOrCreateFolder(folderPath);

    const uploadedFiles = [];
    
    for (const attachment of attachments) {
      try {
        const fileMetadata: any = {
          name: attachment.filename,
          parents: [folderId],
          description: `From: ${emailContext.from}\nSubject: ${emailContext.subject}\nDate: ${emailContext.date.toISOString()}`
        };

        const media = {
          mimeType: attachment.mimeType,
          body: Buffer.isBuffer(attachment.content)
            ? attachment.content
            : Buffer.from(attachment.content, 'base64')
        };

        const response = await drive.files.create({
          requestBody: fileMetadata,
          media: media,
          fields: 'id, name, webViewLink, size'
        });

        uploadedFiles.push({
          fileId: response.data.id!,
          fileName: response.data.name!,
          webViewLink: response.data.webViewLink!,
          size: response.data.size || attachment.size
        });

        await drive.files.update({
          fileId: response.data.id!,
          requestBody: {
            appProperties: {
              email_from: emailContext.from,
              email_subject: emailContext.subject,
              email_date: emailContext.date.toISOString(),
              email_message_id: emailContext.messageId || ''
            }
          }
        });
      } catch (error: any) {
        uploadedFiles.push({
          fileName: attachment.filename,
          error: error.message
        });
      }
    }

    const executionTime = Date.now() - startTime;
    const resultData = {
      folderPath,
      folderId,
      uploadedCount: uploadedFiles.filter(f => !('error' in f)).length,
      failedCount: uploadedFiles.filter(f => 'error' in f).length,
      files: uploadedFiles,
      emailContext: {
        from: emailContext.from,
        subject: emailContext.subject,
        date: emailContext.date.toISOString()
      }
    };

    await logExecutionSuccess(
      actionId,
      actionId,
      'organize_email_attachments',
      'drive',
      { count: attachments.length, from: emailContext.from },
      resultData,
      executionTime
    );

    return {
      success: true,
      data: resultData,
      executionTime,
      executorUsed: 'drive'
    };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    
    await logExecutionFailure(
      actionId,
      actionId,
      'organize_email_attachments',
      'drive',
      { count: attachments.length, from: emailContext.from },
      error.message || 'Failed to organize email attachments',
      executionTime
    );

    return {
      success: false,
      error: error.message || 'Failed to organize email attachments',
      executionTime,
      executorUsed: 'drive'
    };
  }
}

/**
 * Move a file to a different folder
 */
export async function moveFile(
  fileId: string,
  newFolderId: string,
  removePreviousParents: boolean = true
): Promise<ExecutionResult> {
  const actionId = `drive-move-${Date.now()}`;
  const startTime = Date.now();
  
  try {
    await logExecutionStart(
      actionId,
      actionId,
      'move_file',
      'drive',
      { fileId, newFolderId, removePreviousParents }
    );

    const file = await drive.files.get({
      fileId: fileId,
      fields: 'id, name, parents'
    });

    const fileName = file.data.name!;
    const previousParents = file.data.parents || [];

    const updateParams: any = {
      fileId: fileId,
      addParents: newFolderId,
      fields: 'id, name, parents, webViewLink'
    };

    if (removePreviousParents && previousParents.length > 0) {
      updateParams.removeParents = previousParents.join(',');
    }

    const response = await drive.files.update(updateParams);

    const executionTime = Date.now() - startTime;
    const resultData = {
      fileId: response.data.id!,
      fileName: response.data.name!,
      previousParents,
      newParents: response.data.parents || [],
      webViewLink: response.data.webViewLink,
      movedAt: new Date().toISOString()
    };

    await logExecutionSuccess(
      actionId,
      actionId,
      'move_file',
      'drive',
      { fileId, newFolderId },
      resultData,
      executionTime
    );

    return {
      success: true,
      data: resultData,
      executionTime,
      executorUsed: 'drive'
    };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    
    await logExecutionFailure(
      actionId,
      actionId,
      'move_file',
      'drive',
      { fileId, newFolderId },
      error.message || 'Failed to move file',
      executionTime
    );

    return {
      success: false,
      error: error.message || 'Failed to move file',
      executionTime,
      executorUsed: 'drive'
    };
  }
}

/**
 * Set file permissions for sharing
 */
export async function setFilePermissions(
  fileId: string,
  emailOrDomain: string,
  role: PermissionLevel = PermissionLevel.VIEW,
  type: 'user' | 'group' | 'domain' | 'anyone' = 'user'
): Promise<ExecutionResult> {
  const actionId = `drive-permission-${Date.now()}`;
  const startTime = Date.now();
  
  try {
    await logExecutionStart(
      actionId,
      actionId,
      'set_file_permissions',
      'drive',
      { fileId, emailOrDomain, role, type }
    );

    const permission: any = {
      type: type,
      role: role
    };

    if (type === 'user' || type === 'group') {
      permission.emailAddress = emailOrDomain;
    } else if (type === 'domain') {
      permission.domain = emailOrDomain;
    }

    const response = await drive.permissions.create({
      fileId: fileId,
      requestBody: permission,
      sendNotificationEmail: true,
      emailMessage: 'A file has been shared with you via AI Operations Command Center'
    });

    const executionTime = Date.now() - startTime;
    const resultData = {
      permissionId: response.data.id!,
      fileId,
      emailOrDomain,
      role,
      type,
      createdAt: new Date().toISOString()
    };

    await logExecutionSuccess(
      actionId,
      actionId,
      'set_file_permissions',
      'drive',
      { fileId, emailOrDomain, role },
      resultData,
      executionTime
    );

    return {
      success: true,
      data: resultData,
      executionTime,
      executorUsed: 'drive'
    };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    
    await logExecutionFailure(
      actionId,
      actionId,
      'set_file_permissions',
      'drive',
      { fileId, emailOrDomain, role },
      error.message || 'Failed to set file permissions',
      executionTime
    );

    return {
      success: false,
      error: error.message || 'Failed to set file permissions',
      executionTime,
      executorUsed: 'drive'
    };
  }
}

/**
 * Share file with team (view access) and assignee (edit access)
 */
export async function shareFileWithTeam(
  fileId: string,
  teamEmail: string,
  assigneeEmail?: string
): Promise<ExecutionResult> {
  const actionId = `drive-share-team-${Date.now()}`;
  const startTime = Date.now();
  
  try {
    await logExecutionStart(
      actionId,
      actionId,
      'share_file_with_team',
      'drive',
      { fileId, teamEmail, assigneeEmail }
    );

    const permissions = [];

    const teamPermission = await setFilePermissions(
      fileId,
      teamEmail,
      PermissionLevel.VIEW,
      'group'
    );
    
    if (teamPermission.success && teamPermission.data) {
      permissions.push({ email: teamEmail, role: 'view', ...teamPermission.data });
    }

    if (assigneeEmail) {
      const assigneePermission = await setFilePermissions(
        fileId,
        assigneeEmail,
        PermissionLevel.EDIT,
        'user'
      );
      
      if (assigneePermission.success && assigneePermission.data) {
        permissions.push({ email: assigneeEmail, role: 'edit', ...assigneePermission.data });
      }
    }

    const executionTime = Date.now() - startTime;
    const resultData = {
      fileId,
      permissions,
      sharedAt: new Date().toISOString()
    };

    await logExecutionSuccess(
      actionId,
      actionId,
      'share_file_with_team',
      'drive',
      { fileId, teamEmail, assigneeEmail },
      resultData,
      executionTime
    );

    return {
      success: true,
      data: resultData,
      executionTime,
      executorUsed: 'drive'
    };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    
    await logExecutionFailure(
      actionId,
      actionId,
      'share_file_with_team',
      'drive',
      { fileId, teamEmail, assigneeEmail },
      error.message || 'Failed to share file with team',
      executionTime
    );

    return {
      success: false,
      error: error.message || 'Failed to share file with team',
      executionTime,
      executorUsed: 'drive'
    };
  }
}

/**
 * Get file metadata by ID
 */
export async function getFileMetadata(fileId: string): Promise<ExecutionResult> {
  try {
    const response = await drive.files.get({
      fileId: fileId,
      fields: 'id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, webContentLink, owners, permissions, appProperties'
    });

    return {
      success: true,
      data: {
        fileId: response.data.id!,
        name: response.data.name!,
        mimeType: response.data.mimeType!,
        size: response.data.size,
        createdTime: response.data.createdTime,
        modifiedTime: response.data.modifiedTime,
        parents: response.data.parents,
        webViewLink: response.data.webViewLink,
        webContentLink: response.data.webContentLink,
        owners: response.data.owners,
        permissions: response.data.permissions,
        appProperties: response.data.appProperties
      },
      executorUsed: 'drive'
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to get file metadata',
      executorUsed: 'drive'
    };
  }
}

/**
 * Search files by query
 */
export async function searchFiles(query: string, maxResults: number = 100): Promise<ExecutionResult> {
  try {
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, parents)',
      pageSize: maxResults,
      orderBy: 'modifiedTime desc'
    });

    return {
      success: true,
      data: {
        query,
        count: response.data.files?.length || 0,
        files: response.data.files || []
      },
      executorUsed: 'drive'
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to search files',
      executorUsed: 'drive'
    };
  }
}

/**
 * Clear folder cache
 */
export function clearFolderCache(): void {
  folderCache.clear();
}

/**
 * Get folder cache for debugging
 */
export function getFolderCache(): Map<string, string> {
  return new Map(folderCache);
}

export default {
  fileDocument,
  organizeEmailAttachments,
  moveFile,
  setFilePermissions,
  shareFileWithTeam,
  getFileMetadata,
  searchFiles,
  inferCategory,
  clearFolderCache,
  getFolderCache,
  DocumentType,
  PermissionLevel
};
