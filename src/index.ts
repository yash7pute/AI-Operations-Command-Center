import dotenv from 'dotenv';
import logger from './utils/logger';
import { config, validateConfig } from './config';

dotenv.config();

async function main() {
  logger.info('Starting my-node-ts-app');
  try {
    validateConfig();
    logger.info('Config validated');
    // TODO: initialize integrations, agents, and workflows
  } catch (err) {
    logger.error('Startup validation failed', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error('Application error', err instanceof Error ? err.message : String(err));
  process.exit(1);
});