import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import logger from '../../utils/logger';
import { config as Config } from '../../config';

// NOTE: `composio-sdk` is assumed to be an npm package that exposes an auth flow for 3rd-party apps.
// The real SDK may differ; adapt imports/calls to the actual SDK.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const composio = require('composio-sdk');

const SESSIONS_FILE = path.resolve(process.cwd(), 'tokens', 'composio-sessions.enc');
const ALGORITHM = 'aes-256-gcm';

type AppName = 'notion' | 'trello';

interface SessionRecord {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
  scope?: string;
}

interface SessionsMap {
  [app: string]: SessionRecord | undefined;
}

function ensureTokensDir() {
  const dir = path.resolve(process.cwd(), 'tokens');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getEncryptionKey(): Buffer {
  const key = process.env.COMPOSIO_SESSIONS_KEY || '';
  if (!key) throw new Error('COMPOSIO_SESSIONS_KEY is required to encrypt session tokens');
  if (!key) throw new Error('COMPOSIO_SESSIONS_KEY is required to encrypt session tokens');
  // ensure 32 bytes
  return crypto.createHash('sha256').update(String(key)).digest();
}

function encryptSessions(obj: SessionsMap) {
  ensureTokensDir();
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const serialized = Buffer.from(JSON.stringify(obj), 'utf8');
  const encrypted = Buffer.concat([cipher.update(serialized), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]);
  fs.writeFileSync(SESSIONS_FILE, payload);
}

function decryptSessions(): SessionsMap {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return {};
    const payload = fs.readFileSync(SESSIONS_FILE);
    const iv = payload.slice(0, 12);
    const tag = payload.slice(12, 28);
    const encrypted = payload.slice(28);
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as SessionsMap;
  } catch (err) {
    logger.error('Failed to decrypt composio sessions', err instanceof Error ? err.message : String(err));
    return {};
  }
}

const sessions = decryptSessions();

async function saveSession(app: AppName, record: SessionRecord) {
  sessions[app] = record;
  try {
    encryptSessions(sessions);
    logger.info('Saved Composio session for app', { app });
  } catch (err: any) {
    logger.error('Failed to persist Composio session', { app, error: err?.message || String(err) });
  }
}

async function authenticateApp(appName: AppName): Promise<any> {
  try {
    logger.info('Starting Composio auth flow', { app: appName });
    // Use composio SDK to start OAuth flow and return an authenticated client
    // The SDK is expected to provide `startAuthFlow` which returns {client, tokens}
    const { client, tokens } = await composio.startAuthFlow(appName, {
      callbackUrl: process.env.COMPOSIO_CALLBACK_URL || '',
    });

    const rec: SessionRecord = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    };
    await saveSession(appName, rec);
    logger.info('Composio auth completed', { app: appName });
    return client;
  } catch (err: any) {
    logger.error('Composio auth failed', { app: appName, error: err?.message || String(err) });
    throw new Error(`Authentication for ${appName} failed: ${err?.message || String(err)}`);
  }
}

async function refreshAuth(appName: AppName): Promise<any> {
  try {
    const record = sessions[appName];
    if (!record || !record.refreshToken) throw new Error('No refresh token available');
    logger.info('Refreshing Composio auth token', { app: appName });
    const refreshed = await composio.refreshToken(appName, { refreshToken: record.refreshToken });
    const newRec: SessionRecord = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || record.refreshToken,
      expiresAt: refreshed.expiresAt,
      scope: refreshed.scope || record.scope,
    };
    await saveSession(appName, newRec);
    logger.info('Refreshed Composio token', { app: appName });
    return newRec;
  } catch (err: any) {
    logger.error('Failed to refresh Composio token', { app: appName, error: err?.message || String(err) });
    throw new Error(`Failed to refresh auth for ${appName}: ${err?.message || String(err)}`);
  }
}

function isAuthenticated(appName: AppName): boolean {
  const rec = sessions[appName];
  if (!rec || !rec.accessToken) return false;
  if (!rec.expiresAt) return true;
  return Date.now() < rec.expiresAt - 60_000; // consider expired if within 60s
}

async function ensureAuthenticated(appName: AppName) {
  if (isAuthenticated(appName)) return true;
  try {
    await refreshAuth(appName);
    return true;
  } catch (err) {
    logger.warn('Authentication invalid and refresh failed', { app: appName });
    return false;
  }
}

// Export authenticated clients for Notion and Trello
async function getClient(appName: AppName): Promise<any> {
  if (!await ensureAuthenticated(appName)) {
    const msg = `Not authenticated for ${appName}. Call authenticateApp('${appName}') to authorize.`;
    logger.error(msg);
    throw new Error(msg);
  }
  const rec = sessions[appName]!;
  // composio SDK can build an authenticated client from tokens
  return composio.getClient(appName, { accessToken: rec.accessToken });
}

export default {
  authenticateApp,
  refreshAuth,
  isAuthenticated,
  getClient,
};
