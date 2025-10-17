import { App, LogLevel, ExpressReceiver } from '@slack/bolt';
import logger from '../utils/logger';

export class SlackIntegration {
    private app: App;

    constructor(signingSecret: string, botToken: string) {
        this.app = new App({
            signingSecret: signingSecret,
            token: botToken,
            logLevel: LogLevel.DEBUG,
        });
    }

    async sendMessage(channel: string, text: string): Promise<void> {
        await this.app.client.chat.postMessage({
            channel: channel,
            text: text,
        });
    }

    async handleEvent(eventType: string, callback: (event: any) => Promise<void>): Promise<void> {
        this.app.event(eventType, callback);
    }

    async start(port: number): Promise<void> {
        await this.app.start(port);
        logger.info(`Slack app is running on port ${port}`);
    }

    static createAppFromEnv() {
        const app = new App({
            token: process.env.SLACK_BOT_TOKEN,
            signingSecret: process.env.SLACK_SIGNING_SECRET,
            socketMode: !!process.env.SLACK_APP_TOKEN,
            appToken: process.env.SLACK_APP_TOKEN,
        });
        logger.info('Slack app placeholder created');
        return app;
    }
}