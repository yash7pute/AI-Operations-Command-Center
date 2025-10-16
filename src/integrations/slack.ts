import { App, LogLevel } from '@slack/bolt';
import logger from '../utils/logger';

export class SlackIntegration {
    private app: App | null = null;

    constructor(private signingSecret: string, private botToken: string) {}

    async initialize() {
        try {
            this.app = new App({
                signingSecret: this.signingSecret,
                token: this.botToken,
                logLevel: LogLevel.INFO,
            });
            logger.info('SlackIntegration initialized');
        } catch (err) {
            logger.error('Failed to initialize SlackIntegration', err instanceof Error ? err.message : String(err));
            throw err;
        }
    }

    async sendMessage(channel: string, text: string): Promise<void> {
        if (!this.app) throw new Error('SlackIntegration not initialized');
        await this.app.client.chat.postMessage({ channel, text });
    }

    async start(port: number): Promise<void> {
        if (!this.app) throw new Error('SlackIntegration not initialized');
        await this.app.start(port);
        logger.info(`Slack app is running on port ${port}`);
    }
}