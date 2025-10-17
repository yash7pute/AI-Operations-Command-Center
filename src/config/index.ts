import logger from '../utils/logger';

function required(name: string, example?: string): string {
  const val = process.env[name];
  if (!val) {
    const msg = `Missing required environment variable ${name}` + (example ? ` (e.g. ${example})` : '');
    logger.error(msg);
    throw new Error(msg);
  }
  return val;
}

export const config = {
  GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID || '',
  GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET || '',
  GMAIL_REDIRECT_URI: process.env.GMAIL_REDIRECT_URI || '',

  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN || '',
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET || '',
  SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN || '',
  SLACK_NOTIFICATIONS_CHANNEL: process.env.SLACK_NOTIFICATIONS_CHANNEL || '',

  GOOGLE_SHEETS_API_KEY: process.env.GOOGLE_SHEETS_API_KEY || '',
  GOOGLE_DRIVE_API_KEY: process.env.GOOGLE_DRIVE_API_KEY || '',
  GOOGLE_DRIVE_ROOT_FOLDER_ID: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '',
  SHEETS_LOG_SPREADSHEET_ID: process.env.SHEETS_LOG_SPREADSHEET_ID || '',

  NOTION_API_KEY: process.env.NOTION_API_KEY || '',
  NOTION_DATABASE_ID: process.env.NOTION_DATABASE_ID || '',

  TRELLO_API_KEY: process.env.TRELLO_API_KEY || '',
  TRELLO_TOKEN: process.env.TRELLO_TOKEN || '',
  TRELLO_DEFAULT_LIST_ID: process.env.TRELLO_DEFAULT_LIST_ID || '',
  TRELLO_BOARD_ID: process.env.TRELLO_BOARD_ID || '',
  
  // Trello workflow lists
  TRELLO_BACKLOG_LIST: process.env.TRELLO_BACKLOG_LIST || '',
  TRELLO_TODO_LIST: process.env.TRELLO_TODO_LIST || '',
  TRELLO_IN_PROGRESS_LIST: process.env.TRELLO_IN_PROGRESS_LIST || '',
  TRELLO_DONE_LIST: process.env.TRELLO_DONE_LIST || '',

  COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY || '',
  LLM_API_KEY: process.env.LLM_API_KEY || '',

  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
} as const;

// Validate critical keys at startup -- throw with message that explains which is missing.
export function validateConfig() {
  // Example: require at least one LLM API key and Slack creds if using Slack
  if (!config.LLM_API_KEY) required('LLM_API_KEY', 'your-groq-api-key');

  // If you plan to use Slack, ensure bot token and signing secret exist
  if (process.env.USE_SLACK === 'true') {
    required('SLACK_BOT_TOKEN', 'xoxb-...');
    required('SLACK_SIGNING_SECRET', '...');
  }

  // For Gmail/OAuth flows, ensure client ID/secret/redirect
  if (process.env.USE_GMAIL === 'true') {
    required('GMAIL_CLIENT_ID', '1234-abc.apps.googleusercontent.com');
    required('GMAIL_CLIENT_SECRET', 'your-client-secret');
    required('GMAIL_REDIRECT_URI', 'http://localhost:3000/oauth2callback');
  }

  logger.info('Environment configuration validated');
}

export function getConfig() {
  return config;
}
