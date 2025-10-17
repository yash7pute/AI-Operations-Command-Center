import dotenv from 'dotenv';
import logger from './utils/logger';
import { config } from './config';
import { initializeRouter } from './workflows/action-router';
// import { initializeComposio, startMonitoring } from './integrations/composio-client'; // Disabled - Composio CLI not working
import './api-server'; // Start API server

dotenv.config();

async function main() {
  logger.info('Starting AI-Operations-Command-Center');
  logger.debug('Loaded config', { env: process.env.NODE_ENV, logLevel: process.env.LOG_LEVEL });
  logger.info('Config loaded', { env: process.env.NODE_ENV, notionConfigured: !!config.NOTION_API_KEY && !!config.NOTION_DATABASE_ID });

  // Initialize workflows
  initializeRouter();

  // Real integrations disabled due to Composio CLI issues (HTTP 410 error)
  // To enable: Fix Composio CLI or use native SDK integrations directly
  logger.warn('⚠️  Real integrations disabled - using mock data mode');
  logger.warn('   To enable real integrations:');
  logger.warn('   1. Fix Composio CLI (npm install -g composio-core@latest)');
  logger.warn('   2. OR use native SDK integrations (Gmail/Slack/Notion SDKs)');
  logger.warn('   3. See COMPOSIO-WORKAROUND.md for details');
  
  logger.info('All systems initialized');
  logger.info('Frontend: http://localhost:5173');
  logger.info('Backend API: http://localhost:3001');
  logger.info('� Dashboard will display mock data');
}

main().catch((err) => {
  logger.error('Application error', err instanceof Error ? err.message : String(err));
  process.exit(1);
});