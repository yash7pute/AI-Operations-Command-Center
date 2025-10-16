import { EventEmitter } from 'events';
import logger from '../../utils/logger';
import { BaseIntegration } from '../base-integration';
import { GmailFetcher, ParsedMessage } from './fetcher';
import { getAuthenticatedClient } from './auth';
import { gmail_v1, Auth } from 'googleapis';


/**
 * GmailListener
 * - Polls Gmail every intervalMs (default 60s) for new messages
 * - Optionally registers a Gmail watch to a Pub/Sub topic (if PUBSUB_TOPIC env var present)
 * - Emits `message` events with ParsedMessage when new messages are discovered
 * - Tracks processed message IDs in a Set to avoid duplicates
 */
export class GmailListener extends BaseIntegration<Auth.OAuth2Client> {
  private emitter = new EventEmitter();
  private fetcher: GmailFetcher;
  private intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private processed = new Set<string>();
  private lastCheckTs: number | null = null;
  private gmail?: gmail_v1.Gmail;
  private pubsubSubscription: any = null;

  constructor(intervalMs = 60_000, minIntervalMs = 0) {
    super(minIntervalMs);
    this.intervalMs = intervalMs;
    this.fetcher = new GmailFetcher(minIntervalMs);
  }

  on(event: 'message' | 'error', listener: (...args: any[]) => void) {
    this.emitter.on(event, listener);
  }

  off(event: 'message' | 'error', listener: (...args: any[]) => void) {
    this.emitter.off(event, listener);
  }

  async connect(): Promise<Auth.OAuth2Client> {
    try {
      this.client = await getAuthenticatedClient();
      const { google } = require('googleapis');
      this.gmail = google.gmail({ version: 'v1', auth: this.client });
      this.status = 'connected';
      logger.info('GmailListener connected');
      return this.client;
    } catch (err) {
      this.status = 'error';
      logger.error('GmailListener connect failed', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.stop();
    this.client = null;
    this.gmail = undefined;
    this.status = 'disconnected';
  }

  getStatus() {
    return {
      status: this.status,
      running: !!this.timer,
      lastCheckTs: this.lastCheckTs,
      processedCount: this.processed.size,
    };
  }

  private async registerWatchIfConfigured() {
    const topicName = process.env.GMAIL_PUBSUB_TOPIC;
    if (!topicName || !this.gmail) return false;
    try {
      // request Gmail to send push notifications
      await this.gmail.users.watch({ userId: 'me', requestBody: { topicName } });
      logger.info('Registered Gmail watch for Pub/Sub topic', { topic: topicName });
      return true;
    } catch (err) {
      logger.warn('Failed to register Gmail watch (will fallback to polling)', err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  private async pollOnce() {
    const checkTs = Date.now();
    try {
      // Fetch unread from last interval
      const minutes = Math.max(1, Math.ceil(this.intervalMs / 60000));
      const msgs = await this.fetcher.fetchUnreadMessages(minutes);
      const newMsgs: ParsedMessage[] = [];
      for (const m of msgs) {
        if (!this.processed.has(m.id)) {
          this.processed.add(m.id);
          newMsgs.push(m);
        }
      }
      this.lastCheckTs = checkTs;
      logger.info('GmailListener check', { timestamp: new Date(checkTs).toISOString(), newCount: newMsgs.length });
      for (const nm of newMsgs) this.emitter.emit('message', nm);
    } catch (err) {
      this.status = 'error';
      logger.error('Error during GmailListener poll', err instanceof Error ? err.message : String(err));
      this.emitter.emit('error', err);
      // keep running; next interval will retry
    }
  }

  /**
   * Start the listener: try to register Pub/Sub watch, then start polling interval as fallback.
   */
  async start() {
    if (this.timer) return; // already running
    await this.connect();
    const watchRegistered = await this.registerWatchIfConfigured();

    // If Pub/Sub topic set and watch registered, try to create subscription client to receive messages.
    if (watchRegistered && process.env.GMAIL_PUBSUB_SUBSCRIPTION) {
      try {
        // Try to use @google-cloud/pubsub if available
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PubSub } = require('@google-cloud/pubsub');
        const pubsub = new PubSub();
        const subscriptionName = process.env.GMAIL_PUBSUB_SUBSCRIPTION as string;
        const subscription = pubsub.subscription(subscriptionName);
        this.pubsubSubscription = subscription;
        subscription.on('message', async (message: any) => {
          try {
            const data = message.data ? JSON.parse(Buffer.from(message.data).toString('utf8')) : null;
            // Gmail push notifications usually contain historyId and other info; when received, fetch recent messages
            await this.pollOnce();
            message.ack();
          } catch (err) {
            logger.warn('Failed to handle Pub/Sub message', err instanceof Error ? err.message : String(err));
          }
        });
        subscription.on('error', (err: any) => {
          logger.error('Pub/Sub subscription error', err instanceof Error ? err.message : String(err));
        });
        logger.info('Listening to Pub/Sub subscription for Gmail push notifications');
      } catch (err) {
        logger.warn('Pub/Sub client not available or subscription failed; falling back to polling', err instanceof Error ? err.message : String(err));
      }
    }

    // Always start polling as a reliable fallback
    this.timer = setInterval(() => void this.pollOnce(), this.intervalMs);
    // run immediately once
    void this.pollOnce();
    this.status = 'connected';
    logger.info('GmailListener started', { intervalMs: this.intervalMs });
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.pubsubSubscription && typeof this.pubsubSubscription.close === 'function') {
      try {
        this.pubsubSubscription.close();
      } catch (err) {
        logger.warn('Failed to close Pub/Sub subscription', err instanceof Error ? err.message : String(err));
      }
      this.pubsubSubscription = null;
    }
    this.status = 'disconnected';
    logger.info('GmailListener stopped');
  }
}
