import { EventEmitter } from 'events';
import logger from '../../utils/logger';
import { getSlackApp } from './connection';

export interface SlackMessage {
  id: string;
  user?: string;
  channel: string;
  text?: string;
  timestamp: string;
  thread_ts?: string;
  attachments?: any[];
  isMention?: boolean;
}

export class SlackListener {
  private app = getSlackApp();
  private emitter = new EventEmitter();
  private monitoredChannels: Set<string>;

  constructor() {
    const channels = process.env.SLACK_MONITORED_CHANNELS || '';
    this.monitoredChannels = new Set(channels.split(',').map((c) => c.trim()).filter(Boolean));
    this.setupListeners();
  }

  private isMonitored(channel: string) {
    if (this.monitoredChannels.size === 0) return true; // monitor all if none configured
    return this.monitoredChannels.has(channel);
  }

  private setupListeners() {
    // Use message events
    this.app.event('message', async ({ event, client, say, context }: any) => {
      try {
        // skip messages from bots (including this bot)
        if (event.subtype === 'bot_message' || event.bot_id) return;

        const channel = event.channel as string;
        if (!this.isMonitored(channel)) return;

        const msg: SlackMessage = {
          id: event.client_msg_id || event.ts,
          user: event.user,
          channel,
          text: event.text,
          timestamp: event.ts,
          thread_ts: event.thread_ts,
          attachments: event.attachments || [],
          isMention: false,
        };

        // detect mentions
        const botUser = context?.botUserId || process.env.SLACK_BOT_USER_ID;
        if (botUser && msg.text && msg.text.includes(`<@${botUser}>`)) {
          msg.isMention = true;
        }

        // If threaded, fetch parent context optionally
        if (msg.thread_ts && msg.thread_ts !== msg.timestamp) {
          try {
            const threadRes = await client.conversations.replies({ channel, ts: msg.thread_ts });
            // include some context on the thread
            (msg as any).thread = threadRes.messages || [];
          } catch (err) {
            logger.warn('Failed to fetch thread replies', err instanceof Error ? err.message : String(err));
          }
        }

        logger.info('Slack message received', { user: msg.user, channel: msg.channel, ts: msg.timestamp });
        this.emitter.emit('message', msg);
      } catch (err) {
        logger.error('Error handling Slack message event', err instanceof Error ? err.message : String(err));
        this.emitter.emit('error', err);
      }
    });
  }

  on(event: 'message' | 'error', listener: (...args: any[]) => void) {
    this.emitter.on(event, listener);
  }

  off(event: 'message' | 'error', listener: (...args: any[]) => void) {
    this.emitter.off(event, listener);
  }

  async getUserInfo(userId: string) {
    try {
      const res = await this.app.client.users.info({ user: userId });
      const profile = res.user?.profile;
      return {
        id: userId,
        name: profile?.display_name || profile?.real_name || res.user?.name,
      };
    } catch (err) {
      logger.warn('Failed to fetch Slack user info', err instanceof Error ? err.message : String(err));
      return { id: userId, name: userId };
    }
  }
}

export default SlackListener;
