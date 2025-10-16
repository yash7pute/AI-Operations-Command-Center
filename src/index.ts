import dotenv from 'dotenv';
import logger from './utils/logger';
import { config, validateConfig } from './config';

dotenv.config();

async function main() {
  logger.info('Starting my-node-ts-app');
  try {
    validateConfig();
    logger.info('Config validated');
    await initIntegrations();
    logger.info('Initialization complete — running');
  } catch (err) {
    logger.error('Startup validation failed', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function initIntegrations() {
  // Lazily import integration modules so startup doesn't hard-fail when credentials are missing.
  try {
    // Slack
    if (process.env.USE_SLACK === 'true') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getSlackApp } = require('./integrations/slack/connection');
        const app = getSlackApp();
        if (app && typeof app.start === 'function') {
          // start socket mode (non-blocking)
          app.start().then(() => logger.info('Slack App started (socket mode)')).catch((e: any) => logger.warn('Slack start error', e?.message || String(e)));
        }
        // initialize listener if available
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const SlackListener = require('./integrations/slack/listener').default;
        try {
          const listener = new SlackListener();
          listener.on && listener.on('message', (m: any) => logger.info('Slack message', m));
          logger.info('Slack listener initialized');
        } catch (e: any) {
          logger.warn('Slack listener init failed', e?.message || String(e));
        }
      } catch (e: any) {
        logger.warn('Slack integration failed to initialize', e?.message || String(e));
      }
    }

    // Gmail listener
    if (process.env.USE_GMAIL === 'true') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const GmailListener = require('./integrations/gmail/listener').GmailListener || require('./integrations/gmail/listener').default;
        const gl = new GmailListener();
        gl.on && gl.on('message', (m: any) => logger.info('Gmail message', { id: m.id, from: m.from }));
        await gl.connect();
        gl.start && gl.start();
        logger.info('Gmail listener started');
      } catch (e: any) {
        logger.warn('Gmail integration failed to initialize', e?.message || String(e));
      }
    }

    // Sheets watch (optional)
    if (process.env.USE_SHEETS === 'true') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const SheetsReader = require('./integrations/sheets/reader').default;
        const sr = new SheetsReader();
        if (process.env.SHEETS_WATCH_SPREADSHEET && process.env.SHEETS_WATCH_RANGE) {
          sr.watchSheet(process.env.SHEETS_WATCH_SPREADSHEET, process.env.SHEETS_WATCH_RANGE).then(() => logger.info('Sheets watch started')).catch((e: any) => logger.warn('Sheets watch failed', e?.message || String(e)));
        }
      } catch (e: any) {
        logger.warn('Sheets integration failed to initialize', e?.message || String(e));
      }
    }

    // Composio executor warm-up
    if (process.env.USE_COMPOSIO === 'true') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const executor = require('./integrations/composio/executor').default;
        logger.info('Composio executor loaded');
      } catch (e: any) {
        logger.warn('Composio executor failed to load', e?.message || String(e));
      }
    }
  } catch (err: any) {
    logger.error('Integration initialization error', err?.message || String(err));
  }
}

main().catch((err) => {
  logger.error('Application error', err instanceof Error ? err.message : String(err));
  process.exit(1);
});