import logger from '../../utils/logger';
import { getSlackApp } from './connection';

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export class SlackActions {
  private app = getSlackApp();
  private lastSentTs = 0;
  private minIntervalMs = 1000; // max 1 message per second

  private async rateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastSentTs;
    if (elapsed < this.minIntervalMs) {
      await sleep(this.minIntervalMs - elapsed);
    }
    this.lastSentTs = Date.now();
  }

  /**
   * Send a message to a channel. Optionally include Block Kit blocks.
   */
  async sendMessage(channel: string, text: string, blocks?: any) {
    await this.rateLimit();
    try {
      const res = await this.app.client.chat.postMessage({ channel, text, blocks });
      logger.info('Slack message sent', { channel, ts: res.ts, text });
      return res;
    } catch (err: any) {
      const msg = err?.data?.error || err?.message || String(err);
      logger.error('Failed to send Slack message', { channel, error: msg });
      if (msg === 'channel_not_found') throw new Error(`Channel not found: ${channel}`);
      if (msg === 'is_archived') throw new Error(`Channel is archived: ${channel}`);
      if (msg === 'not_in_channel') throw new Error(`Bot not in channel: ${channel}`);
      if (msg === 'missing_scope') throw new Error(`Missing permission to post in channel: ${channel}`);
      throw err;
    }
  }

  /**
   * Send a direct message to a user by opening a conversation and posting.
   */
  async sendDirectMessage(userId: string, text: string) {
    await this.rateLimit();
    try {
      const open = await this.app.client.conversations.open({ users: userId });
      const channel = open.channel?.id;
      if (!channel) throw new Error('Failed to open direct message channel');
      const res = await this.app.client.chat.postMessage({ channel, text });
      logger.info('Slack direct message sent', { userId, channel, ts: res.ts });
      return res;
    } catch (err: any) {
      const msg = err?.data?.error || err?.message || String(err);
      logger.error('Failed to send Slack direct message', { userId, error: msg });
      if (msg === 'user_not_found') throw new Error(`User not found: ${userId}`);
      if (msg === 'missing_scope') throw new Error('Missing permission to send direct messages');
      throw err;
    }
  }

  /**
   * Add a reaction (emoji) to a message identified by channel and timestamp.
   */
  async addReaction(channel: string, timestamp: string, emoji: string) {
    await this.rateLimit();
    try {
      const res = await this.app.client.reactions.add({ channel, timestamp, name: emoji });
      logger.info('Added reaction', { channel, timestamp, emoji });
      return res;
    } catch (err: any) {
      const msg = err?.data?.error || err?.message || String(err);
      logger.error('Failed to add reaction', { channel, timestamp, emoji, error: msg });
      if (msg === 'message_not_found') throw new Error('Message not found');
      if (msg === 'missing_scope') throw new Error('Missing permission to add reaction');
      throw err;
    }
  }

  /**
   * Update an existing message's text (requires the original ts and channel).
   */
  async updateMessage(channel: string, timestamp: string, newText: string) {
    await this.rateLimit();
    try {
      const res = await this.app.client.chat.update({ channel, ts: timestamp, text: newText });
      logger.info('Updated Slack message', { channel, ts: timestamp, newText });
      return res;
    } catch (err: any) {
      const msg = err?.data?.error || err?.message || String(err);
      logger.error('Failed to update Slack message', { channel, timestamp, error: msg });
      if (msg === 'message_not_found') throw new Error('Message not found');
      if (msg === 'cant_edit_message') throw new Error('Cannot edit message (permissions)');
      throw err;
    }
  }
}

const slackActions = new SlackActions();

export const sendMessage = (channel: string, text: string, blocks?: any) => slackActions.sendMessage(channel, text, blocks);
export const sendDirectMessage = (userId: string, text: string) => slackActions.sendDirectMessage(userId, text);
export const addReaction = (channel: string, timestamp: string, emoji: string) => slackActions.addReaction(channel, timestamp, emoji);
export const updateMessage = (channel: string, timestamp: string, newText: string) => slackActions.updateMessage(channel, timestamp, newText);

export default slackActions;
