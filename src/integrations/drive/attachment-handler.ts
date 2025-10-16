import path from 'path';
import logger from '../../utils/logger';
import fileManager from './file-manager';
import { ParsedAttachment } from '../gmail/fetcher';

export type DuplicatePolicy = 'append' | 'skip';

export interface AttachmentResult {
  attachment: ParsedAttachment;
  driveFile?: any;
  link?: string; // webViewLink or constructed link
  shared?: boolean;
  scan?: { clean: boolean; details?: string };
  skipped?: boolean;
}

export interface AttachmentHandlerOptions {
  baseFolderId?: string; // Drive folder id where date folders will be created (defaults to root)
  duplicatePolicy?: DuplicatePolicy;
  sharePublic?: boolean; // if true, set permission to anyone with link (reader)
  /**
   * Optional virus scanner function. Receives file buffer + filename + mimeType and should return {clean, details}
   * If not provided the handler will perform no-op scan and assume clean (but will log a warning).
   */
  scanner?: (buf: Buffer, filename: string, mimeType?: string) => Promise<{ clean: boolean; details?: string }>;
}

const DEFAULT_OPTIONS: Partial<AttachmentHandlerOptions> = {
  duplicatePolicy: 'append',
  sharePublic: false,
};

function sanitizeName(name = '') {
  return name.replace(/[:\\/*?|<>"']/g, '_');
}

function getTypeFolder(mimeType?: string, filename?: string) {
  if (!mimeType && filename) {
    const ext = path.extname(filename).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(ext)) return 'images';
    if (['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv'].includes(ext)) return 'documents';
  }
  if (!mimeType) return 'attachments';
  if (mimeType.includes('invoice') || filename?.toLowerCase().includes('invoice')) return 'invoices';
  if (mimeType.includes('spreadsheet') || mimeType.includes('csv')) return 'reports';
  if (mimeType.startsWith('image/')) return 'images';
  if (mimeType === 'application/pdf') return 'documents';
  return 'attachments';
}

async function ensureFolderPath(baseFolderId: string | undefined, dateFolder: string, typeFolder: string) {
  // ensure date folder (e.g., 2025-10) exists under baseFolderId, then ensure typeFolder under dateFolder
  const parentId = baseFolderId || undefined;

  // find / create date folder
  const dateName = sanitizeName(dateFolder);
  let dateFolderId: string | undefined;
  try {
    const found = await fileManager.listFiles(parentId, `name='${dateName}' and mimeType='application/vnd.google-apps.folder'`);
    if (found.length) {
      dateFolderId = found[0].id as string;
    } else {
      const created = await fileManager.createFolder(dateName, parentId);
      dateFolderId = created.id as string | undefined;
    }
  } catch (err) {
    logger.warn('ensureFolderPath: could not find/create date folder, attempting create directly', { dateName, error: (err as Error).message });
    const created = await fileManager.createFolder(dateName, parentId);
    dateFolderId = created.id as string | undefined;
  }

  // ensure type folder under dateFolder
  const typeName = sanitizeName(typeFolder);
  let typeFolderId: string | undefined;
  try {
    const foundType = await fileManager.listFiles(dateFolderId, `name='${typeName}' and mimeType='application/vnd.google-apps.folder'`);
    if (foundType.length) {
      typeFolderId = foundType[0].id as string;
    } else {
      const created = await fileManager.createFolder(typeName, dateFolderId);
      typeFolderId = created.id as string | undefined;
    }
  } catch (err) {
    logger.warn('ensureFolderPath: could not find/create type folder, attempting create directly', { typeName, error: (err as Error).message });
    const created = await fileManager.createFolder(typeName, dateFolderId);
    typeFolderId = created.id as string | undefined;
  }

  return typeFolderId;
}

function escapeQueryValue(v: string) {
  return v.replace(/'/g, "\\'");
}

async function defaultScanner(buf: Buffer, filename: string) {
  logger.warn('No virus scanner configured for Drive attachment-handler: defaulting to no-op (assume clean)', { filename, size: buf.length });
  return { clean: true, details: 'no-scanner-configured' };
}

/**
 * Handle a single attachment: scan, create folders, handle duplicates, upload, optionally share.
 */
export async function handleAttachment(attachment: ParsedAttachment, opts: AttachmentHandlerOptions = {}) : Promise<AttachmentResult> {
  const options: AttachmentHandlerOptions = { ...DEFAULT_OPTIONS, ...opts } as AttachmentHandlerOptions;
  const result: AttachmentResult = { attachment };

  const filename = sanitizeName(attachment.filename || `attachment_${Date.now()}`);
  const mimeType = attachment.mimeType;
  const size = attachment.size;
  const buffer = attachment.data ? Buffer.from(attachment.data, 'base64') : Buffer.alloc(0);

  // extract metadata
  const metadata = { filename, mimeType, size };

  // run virus scan BEFORE uploading (if scanner provided)
  const scanner = options.scanner || defaultScanner;
  try {
    const scanRes = await scanner(buffer, filename, mimeType);
    result.scan = scanRes;
    if (!scanRes.clean) {
      logger.error('Virus scan failed - attachment will not be uploaded', { filename, details: scanRes.details });
      result.skipped = true;
      return result;
    }
  } catch (err: any) {
    logger.error('Error running virus scanner, aborting upload for safety', { filename, error: err?.message || String(err) });
    result.skipped = true;
    return result;
  }

  // determine folders: YYYY-MM / typeFolder
  const now = new Date();
  const dateFolder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const typeFolder = getTypeFolder(mimeType, filename);

  // ensure folder path exists
  const targetFolderId = await ensureFolderPath(options.baseFolderId, dateFolder, typeFolder);
  if (!targetFolderId) {
    logger.error('Could not determine or create target folder for attachment', { filename });
    throw new Error('target folder unavailable');
  }

  // handle duplicates
  try {
    const escaped = escapeQueryValue(filename);
    const existing = await fileManager.listFiles(targetFolderId, `name='${escaped}'`);
    if (existing.length) {
      if (options.duplicatePolicy === 'skip') {
        logger.info('Skipping upload because file already exists and duplicatePolicy=skip', { filename, folderId: targetFolderId });
        result.skipped = true;
        result.driveFile = existing[0];
        result.link = (existing[0].webViewLink as string) || `https://drive.google.com/file/d/${existing[0].id}/view`;
        return result;
      }

      // append counter if append policy
      let newName = filename;
      let counter = 1;
      const ext = path.extname(filename);
      const base = filename.slice(0, filename.length - ext.length);
      while ((await fileManager.listFiles(targetFolderId, `name='${escapeQueryValue(newName)}'`)).length) {
        newName = `${base} (${counter})${ext}`;
        counter += 1;
        if (counter > 1000) break; // safety
      }
      // set final filename
      logger.info('Duplicate detected, will upload with new name', { original: filename, newName });

      const fileRes = await fileManager.uploadFile(buffer, targetFolderId, { name: newName, mimeType }, (uploaded) => {
        logger.debug('Attachment upload progress', { filename: newName, uploaded, total: size });
      });

      result.driveFile = fileRes;
      result.link = (fileRes.webViewLink as string) || `https://drive.google.com/file/d/${fileRes.id}/view`;

      if (options.sharePublic) {
        await fileManager.setFilePermission(fileRes.id as string, 'reader', 'anyone');
        result.shared = true;
      }

      logger.info('Attachment uploaded to Drive', { filename: newName, id: fileRes.id, folderId: targetFolderId });
      return result;
    }
  } catch (err: any) {
    logger.warn('Error checking duplicates, proceeding to upload', { filename, error: err?.message || String(err) });
  }

  // final upload (no duplicate)
  try {
    const fileRes = await fileManager.uploadFile(buffer, targetFolderId, { name: filename, mimeType }, (uploaded) => {
      logger.debug('Attachment upload progress', { filename, uploaded, total: size });
    });

    result.driveFile = fileRes;
    result.link = (fileRes.webViewLink as string) || `https://drive.google.com/file/d/${fileRes.id}/view`;

    if (options.sharePublic) {
      await fileManager.setFilePermission(fileRes.id as string, 'reader', 'anyone');
      result.shared = true;
    }

    logger.info('Attachment uploaded to Drive', { filename, id: fileRes.id, folderId: targetFolderId });
    return result;
  } catch (err: any) {
    logger.error('Failed to upload attachment to Drive', { filename, error: err?.message || String(err) });
    throw err;
  }
}

/**
 * Convenience: handle array of attachments
 */
export async function handleAttachments(attachments: ParsedAttachment[], opts: AttachmentHandlerOptions = {}) : Promise<AttachmentResult[]> {
  const results: AttachmentResult[] = [];
  for (const att of attachments) {
    try {
      const r = await handleAttachment(att, opts);
      results.push(r);
    } catch (err: any) {
      logger.error('Attachment handler error', { filename: att.filename, error: err?.message || String(err) });
      results.push({ attachment: att, skipped: true });
    }
  }
  return results;
}

export default { handleAttachment, handleAttachments };
