import dotenv from 'dotenv';
import logger from './utils/logger';
import { config } from './config';
import { initializeRouter } from './workflows/action-router';

dotenv.config();

async function main() {
  logger.info('Starting AI-Operations-Command-Center');
  logger.debug('Loaded config', { env: process.env.NODE_ENV, logLevel: process.env.LOG_LEVEL });
  logger.info('Config loaded', { env: process.env.NODE_ENV, notionConfigured: !!config.NOTION_API_KEY && !!config.NOTION_DATABASE_ID });

  // Initialize workflows
  initializeRouter();
}

main().catch((err) => {
  logger.error('Application error', err instanceof Error ? err.message : String(err));
  process.exit(1);
});