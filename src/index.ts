import dotenv from 'dotenv';
import logger from './utils/logger';
import { config } from './config';

dotenv.config();

async function main() {
  logger.info('Starting my-node-ts-app');
  logger.debug('Loaded config', { env: process.env.NODE_ENV, logLevel: process.env.LOG_LEVEL });
  // Access typed config
  logger.info('Config loaded', { slackConfigured: !!config.SLACK_BOT_TOKEN });
  // TODO: initialize integrations, agents, and workflows
}

main().catch((err) => {
  logger.error('Application error', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
import { SlackIntegration } from './integrations/slack';
import { GoogleIntegration } from './integrations/google';
import { NotionIntegration } from './integrations/notion';
import { logger } from './utils/logger';

// Initialize integrations
const slackIntegration = new SlackIntegration();
const googleIntegration = new GoogleIntegration();
const notionIntegration = new NotionIntegration();

// Example setup or initialization logic
async function initializeApp() {
    try {
        await slackIntegration.initialize();
        await googleIntegration.authenticate();
        await notionIntegration.initialize();
        logger.info('All integrations initialized successfully.');
    } catch (error) {
        logger.error('Error initializing integrations:', error);
    }
}

// Start the application
initializeApp();