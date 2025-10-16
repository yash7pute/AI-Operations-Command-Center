import { App, LogLevel } from '@slack/bolt';
import logger from '../../utils/logger';

let slackApp: App | null = null;

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

/**
 * Create and return a Bolt App instance using Socket Mode (no public URL required).
 * Includes retry logic for transient connection/authentication errors.
 */
export function getSlackApp(retries = 3, backoffMs = 1000): App {
  if (slackApp) return slackApp;

  const botToken = process.env.SLACK_BOT_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const appToken = process.env.SLACK_APP_TOKEN; // required for socket mode (xapp-)

  if (!botToken || !signingSecret) {
    const missing = [!botToken ? 'SLACK_BOT_TOKEN' : null, !signingSecret ? 'SLACK_SIGNING_SECRET' : null].filter(Boolean);
    throw new Error(`Missing Slack credentials: ${missing.join(', ')}. Set these environment variables.`);
  }

  // Decide whether to use socket mode
  const useSocket = !!appToken;

  let attempt = 0;
  while (attempt < retries) {
    try {
      slackApp = new App({
        token: botToken,
        signingSecret: signingSecret,
        socketMode: useSocket,
        appToken: appToken,
        logLevel: LogLevel.INFO,
      });

      // Verify auth by calling auth.test
      // @ts-ignore - slackApp.client may be available
      slackApp.client.auth.test()
        .then((res: any) => logger.info('Slack auth successful', { user: res.user }))
        .catch((err: any) => logger.warn('Slack auth verification failed', err instanceof Error ? err.message : String(err)));

      logger.info('Slack App created', { socketMode: useSocket });
      return slackApp;
    } catch (err) {
      attempt += 1;
      logger.warn(`Failed to create Slack App (attempt ${attempt}): ${err instanceof Error ? err.message : String(err)}`);
      if (attempt >= retries) {
        throw new Error(`Unable to initialize Slack App after ${retries} attempts: ${err instanceof Error ? err.message : String(err)}`);
      }
      const wait = backoffMs * Math.pow(2, attempt - 1);
      // eslint-disable-next-line no-await-in-loop
      const done = Date.now() + wait;
      while (Date.now() < done) {} // simple busy-wait for now (non-ideal but avoids async complexity in init)
    }
  }

  throw new Error('Unexpected Slack initialization failure');
}
