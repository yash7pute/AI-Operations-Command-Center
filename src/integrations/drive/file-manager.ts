import fs from 'fs';
import path from 'path';
import { google, drive_v3, Auth } from 'googleapis';
import logger from '../../utils/logger';
import { getAuthenticatedClient } from '../gmail/auth';

export type UploadSource = string | Buffer | NodeJS.ReadableStream;

export class DriveFileManager {
  private auth?: Auth.OAuth2Client;
  private drive?: drive_v3.Drive;

  private async init() {
    if (this.drive) return;
    this.auth = await getAuthenticatedClient();
    this.drive = google.drive({ version: 'v3', auth: this.auth });
  }

  /**
   * Upload a file. `file` can be a path, Buffer, or ReadableStream.
   * Optional onProgress callback receives (bytesUploaded, totalBytes?)
   */
  async uploadFile(
    file: UploadSource,
    folderId?: string,
    metadata: Partial<drive_v3.Schema$File> = {},
    onProgress?: (uploadedBytes: number, totalBytes?: number) => void
  ): Promise<drive_v3.Schema$File> {
    await this.init();
    if (!this.drive) throw new Error('Drive client not initialized');

    let stream: NodeJS.ReadableStream;
    let totalBytes: number | undefined;

    if (typeof file === 'string') {
      const p = path.resolve(process.cwd(), file);
      if (!fs.existsSync(p)) throw new Error(`File not found: ${p}`);
      stream = fs.createReadStream(p);
      const stat = fs.statSync(p);
      totalBytes = stat.size;
      if (!metadata.name) metadata.name = path.basename(p);
    } else if (Buffer.isBuffer(file)) {
      const { Readable } = require('stream');
      stream = Readable.from(file);
      totalBytes = file.length;
    } else {
      stream = file as NodeJS.ReadableStream;
    }

    const fileMetadata: Partial<drive_v3.Schema$File> = { ...metadata };
    if (folderId) fileMetadata.parents = [folderId];

    const params: any = {
      requestBody: fileMetadata,
      media: { body: stream },
      fields: '*',
      supportsAllDrives: true,
    };

    // Use resumable upload for large files
    const op = async () => {
      const options: any = {
        onUploadProgress: (evt: any) => {
          try {
            const uploaded = evt?.bytesRead ?? evt?.loaded ?? 0;
            if (onProgress) onProgress(uploaded, totalBytes);
          } catch (e) {
            // ignore
          }
        },
      };

      const res = await this.drive!.files.create(params, options as any);
      return (res && (res as any).data) as drive_v3.Schema$File;
    };

    logger.info('Uploading file to Drive', { name: metadata.name, folderId, ts: new Date().toISOString() });
    try {
      const fileRes = await retryWithBackoff(op);
      logger.info('File uploaded', { id: fileRes.id, name: fileRes.name });
      return fileRes;
    } catch (err: any) {
      logger.error('Failed to upload file', { error: err?.message || String(err) });
      throw err;
    }
  }

  async createFolder(name: string, parentId?: string): Promise<drive_v3.Schema$File> {
    await this.init();
    if (!this.drive) throw new Error('Drive client not initialized');
    const metadata: Partial<drive_v3.Schema$File> = { name, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) metadata.parents = [parentId];
    try {
      const res = await this.drive.files.create({ requestBody: metadata, fields: '*' });
      logger.info('Created folder', { id: res.data.id, name });
      return res.data as drive_v3.Schema$File;
    } catch (err: any) {
      logger.error('Failed to create folder', { name, error: err?.message || String(err) });
      throw err;
    }
  }

  async moveFile(fileId: string, newFolderId: string): Promise<drive_v3.Schema$File> {
    await this.init();
    if (!this.drive) throw new Error('Drive client not initialized');
    try {
      // get current parents
      const meta = await this.drive.files.get({ fileId, fields: 'parents' });
      const previousParents = (meta.data.parents || []).join(',');
      const res = await this.drive.files.update({ fileId, addParents: newFolderId, removeParents: previousParents, fields: '*' });
      logger.info('Moved file', { fileId, newFolderId });
      return res.data as drive_v3.Schema$File;
    } catch (err: any) {
      logger.error('Failed to move file', { fileId, newFolderId, error: err?.message || String(err) });
      throw err;
    }
  }

  async listFiles(folderId?: string, query?: string): Promise<drive_v3.Schema$File[]> {
    await this.init();
    if (!this.drive) throw new Error('Drive client not initialized');
    try {
      let q = '';
      if (folderId) q += `'${folderId}' in parents`;
      if (query) q += (q ? ' and ' : '') + `(${query})`;
      const res = await this.drive.files.list({ q: q || undefined, fields: 'files(id,name,mimeType,parents,owners,size,createdTime)', supportsAllDrives: true, includeItemsFromAllDrives: true });
      logger.info('Listed files', { folderId, count: res.data.files?.length ?? 0 });
      return (res.data.files || []) as drive_v3.Schema$File[];
    } catch (err: any) {
      logger.error('Failed to list files', { folderId, error: err?.message || String(err) });
      throw err;
    }
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    await this.init();
    if (!this.drive) throw new Error('Drive client not initialized');
    try {
      const res = await this.drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' as any });
      const stream = res.data as NodeJS.ReadableStream;
      return await streamToBuffer(stream);
    } catch (err: any) {
      logger.error('Failed to download file', { fileId, error: err?.message || String(err) });
      throw err;
    }
  }

  async setFilePermission(fileId: string, role: 'reader' | 'writer' | 'owner' = 'reader', type: 'user' | 'group' | 'domain' | 'anyone' = 'user', emailAddress?: string) {
    await this.init();
    if (!this.drive) throw new Error('Drive client not initialized');
    try {
      const body: any = { role, type };
      if (emailAddress) body.emailAddress = emailAddress;
      const res = await this.drive.permissions.create({ fileId, requestBody: body, fields: '*' });
      logger.info('Set file permission', { fileId, role, type, emailAddress });
      return res.data;
    } catch (err: any) {
      logger.error('Failed to set file permission', { fileId, error: err?.message || String(err) });
      throw err;
    }
  }

  async shareFilePublic(fileId: string) {
    return this.setFilePermission(fileId, 'reader', 'anyone');
  }
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', (err) => reject(err));
  });
}

async function retryWithBackoff<T>(fn: () => Promise<T>, attempts = 5, baseMs = 1000): Promise<T> {
  let attempt = 0;
  let lastErr: any;
  while (attempt < attempts) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      attempt += 1;
      const msg = err?.message || '';
      if (/quota|rateLimitExceeded|userRateLimitExceeded|429/i.test(msg) && attempt < attempts) {
        const wait = baseMs * Math.pow(2, attempt - 1);
        logger.warn(`Drive API quota/rate limit hit, retrying in ${wait}ms (attempt ${attempt})`, { error: msg });
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export default new DriveFileManager();
