import { gmail_v1, google, Auth } from 'googleapis';
import { BaseIntegration } from '../base-integration';
import { getAuthenticatedClient } from './auth';
import logger from '../../utils/logger';

export interface ParsedAttachment {
  filename: string;
  mimeType: string;
  size?: number;
  data?: string; // base64
}

export interface ParsedMessage {
  id: string;
  threadId?: string;
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  date?: string;
  labels?: string[];
  attachments: ParsedAttachment[];
}

/**
 * GmailFetcher: fetches and parses Gmail messages.
 * Extends BaseIntegration to inherit retry/backoff and rate limiting.
 */
export class GmailFetcher extends BaseIntegration<Auth.OAuth2Client> {
  private gmail?: gmail_v1.Gmail;

  constructor(minIntervalMs = 0) {
    super(minIntervalMs);
  }

  async connect(): Promise<Auth.OAuth2Client> {
    try {
      this.client = await getAuthenticatedClient();
      // set up gmail client
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { google } = require('googleapis');
      this.gmail = google.gmail({ version: 'v1', auth: this.client });
      this.status = 'connected';
      logger.info('GmailFetcher connected');
      return this.client;
    } catch (err) {
      this.status = 'error';
      logger.error('GmailFetcher connect failed', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.gmail = undefined;
    this.status = 'disconnected';
  }

  /**
   * Fetch unread messages from the last `minutes` minutes (default 5 minutes).
   * Handles pagination and returns parsed messages array.
   */
  async fetchUnreadMessages(minutes = 5): Promise<ParsedMessage[]> {
    if (!this.client) await this.connect();
    if (!this.gmail) throw new Error('Gmail client not initialized');

    const afterSeconds = Math.floor((Date.now() - minutes * 60 * 1000) / 1000);
    const q = `is:unread after:${afterSeconds}`;
    const results: ParsedMessage[] = [];

    let pageToken: string | undefined = undefined;
    try {
      do {
        await this.rateLimit();
        const res = (await this.retry(() =>
          this.gmail!.users.messages.list({ userId: 'me', q, pageToken, maxResults: 100 })
        )) as gmail_v1.Schema$ListMessagesResponse;

        const messages = res.messages || [];
        for (const m of messages) {
          try {
            const parsed = await this.fetchMessageById(m.id!);
            // Filter out spam/promotions by labels
            const labels = parsed.labels || [];
            const lower = labels.map((l) => l.toLowerCase());
            if (lower.includes('spam') || lower.includes('category_promotions') || lower.includes('promotions')) {
              logger.info(`Skipping message ${parsed.id} due to spam/promotions label`);
              continue;
            }
            results.push(parsed);
          } catch (innerErr) {
            logger.warn(`Failed to fetch/parse message ${m.id}`, innerErr instanceof Error ? innerErr.message : String(innerErr));
          }
        }

  pageToken = res.nextPageToken || undefined;
      } while (pageToken);
    } catch (err) {
      logger.error('Failed to list Gmail messages', err instanceof Error ? err.message : String(err));
      throw err;
    }

    return results;
  }

  /**
   * Fetch and parse a single message by ID.
   */
  async fetchMessageById(messageId: string): Promise<ParsedMessage> {
    if (!this.client) await this.connect();
    if (!this.gmail) throw new Error('Gmail client not initialized');

    try {
      await this.rateLimit();
  const res = (await this.retry(() => this.gmail!.users.messages.get({ userId: 'me', id: messageId, format: 'full' }))) as gmail_v1.Schema$Message;
  const msg = res as gmail_v1.Schema$Message;

  const headers = (msg.payload && msg.payload.headers) || [];
  const findHeader = (name: string) => (headers as { name?: string; value?: string }[]).find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value;

      const parsed: ParsedMessage = {
        id: msg.id || messageId,
    threadId: (msg.threadId as string) || undefined,
        from: findHeader('From') || undefined,
        to: findHeader('To') || undefined,
        subject: findHeader('Subject') || undefined,
        date: findHeader('Date') || undefined,
        labels: msg.labelIds || [],
        body: undefined,
        attachments: [],
      };

      // parse payload for body and attachments
      const parts = msg.payload?.parts || [];
      // helper to recursively extract
      const extractParts = async (pParts: any[]) => {
        for (const part of pParts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            const text = Buffer.from(part.body.data, 'base64').toString('utf8');
            parsed.body = (parsed.body ? parsed.body + '\n' : '') + text;
          } else if (part.mimeType === 'text/html' && part.body?.data && !parsed.body) {
            // fallback: strip tags
            const html = Buffer.from(part.body.data, 'base64').toString('utf8');
            parsed.body = html.replace(/<[^>]+>/g, '');
          } else if (part.parts) {
            await extractParts(part.parts);
          }

          // attachments
          if (part.filename && part.body && part.body.attachmentId) {
            try {
              await this.rateLimit();
              const attachGaxios = (await this.retry(() =>
                this.gmail!.users.messages.attachments.get({ userId: 'me', messageId: msg.id!, id: part.body.attachmentId })
              ));
              const attachResData = (attachGaxios && (attachGaxios as any).data) as gmail_v1.Schema$MessagePartBody | undefined;
              const data = (attachResData && (attachResData.data || '')) || '';
              const attachment: ParsedAttachment = {
                filename: part.filename,
                mimeType: part.mimeType,
                size: part.body.size,
                data: data, // base64
              };
              parsed.attachments.push(attachment);
            } catch (attachErr) {
              logger.warn('Failed to fetch attachment', attachErr instanceof Error ? attachErr.message : String(attachErr));
            }
          }
        }
      };

      // If no parts, check body.data
      if (!parts.length && msg.payload?.body?.data) {
        parsed.body = Buffer.from(msg.payload.body.data, 'base64').toString('utf8');
      } else if (parts.length) {
        await extractParts(parts);
      }

      // if still no body, set empty string
      parsed.body = parsed.body || '';

      return parsed;
    } catch (err) {
      logger.error(`Failed to fetch message ${messageId}`, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /**
   * Mark a message as read by removing the UNREAD label
   */
  async markAsRead(messageId: string): Promise<void> {
    if (!this.client) await this.connect();
    if (!this.gmail) throw new Error('Gmail client not initialized');

    try {
      await this.rateLimit();
      await this.retry(() =>
        this.gmail!.users.messages.modify({ userId: 'me', id: messageId, requestBody: { removeLabelIds: ['UNREAD'] } })
      );
      logger.info(`Marked message ${messageId} as read`);
    } catch (err) {
      logger.error(`Failed to mark message ${messageId} as read`, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }
}
