import fs from 'fs';
import path from 'path';
import { google, Auth } from 'googleapis';
import logger from '../../utils/logger';

const TOKENS_DIR = path.resolve(process.cwd(), 'tokens');
const TOKEN_PATH = path.join(TOKENS_DIR, 'gmail-token.json');

function ensureTokensDir() {
  if (!fs.existsSync(TOKENS_DIR)) fs.mkdirSync(TOKENS_DIR, { recursive: true });
}

function saveTokens(tokens: Auth.Credentials) {
  try {
    ensureTokensDir();
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { encoding: 'utf8' });
    logger.info('Gmail tokens saved to', { path: TOKEN_PATH });
  } catch (err) {
    logger.error('Failed to save Gmail tokens', err instanceof Error ? err.message : String(err));
  }
}

function loadTokens(): Auth.Credentials | null {
  try {
    if (!fs.existsSync(TOKEN_PATH)) return null;
    const raw = fs.readFileSync(TOKEN_PATH, { encoding: 'utf8' });
    return JSON.parse(raw) as Auth.Credentials;
  } catch (err) {
    logger.error('Failed to load Gmail tokens', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Build OAuth2 client from environment variables.
 * Throws a helpful error if credentials are missing.
 */
function buildOAuth2Client(): Auth.OAuth2Client {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    const missing = [
      !clientId ? 'GMAIL_CLIENT_ID' : null,
      !clientSecret ? 'GMAIL_CLIENT_SECRET' : null,
      !redirectUri ? 'GMAIL_REDIRECT_URI' : null,
    ].filter(Boolean) as string[];
    throw new Error(`Missing Gmail OAuth credentials: ${missing.join(', ')}. Please set them in your environment or .env file.`);
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate a URL the user can visit to authorize the app.
 *
 * OAuth flow (high level):
 * 1. Call generateAuthUrl() and open the URL in a browser.
 * 2. Google will redirect to your GMAIL_REDIRECT_URI with a code query param.
 * 3. Call setTokenFromCode(code) to exchange the code for tokens and persist them.
 * 4. getAuthenticatedClient() will load persisted tokens and return an authenticated OAuth2 client.
 */
export function generateAuthUrl(): string {
  try {
    const oauth2Client = buildOAuth2Client();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.modify'],
      prompt: 'consent',
    });
    return authUrl;
  } catch (err) {
    logger.error('Failed to generate Gmail auth URL', err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/**
 * Exchange an authorization code for tokens and persist them to disk.
 * @param code Authorization code returned by Google's OAuth2 redirect
 */
export async function setTokenFromCode(code: string): Promise<void> {
  try {
    const oauth2Client = buildOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens) throw new Error('No tokens returned from Google');
    saveTokens(tokens);
    logger.info('Gmail OAuth tokens obtained and saved');
  } catch (err) {
    logger.error('Failed to exchange code for Gmail tokens', err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/**
 * Returns an authenticated OAuth2 client ready for use with googleapis Gmail.
 * If no tokens are present, throws an error that includes an authorization URL the user can visit.
 */
export async function getAuthenticatedClient(): Promise<Auth.OAuth2Client> {
  try {
    const oauth2Client = buildOAuth2Client();

    // Attach token event to persist refresh tokens when they are refreshed
    oauth2Client.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        // store the refresh_token in case it's provided
        saveTokens({ ...loadTokens(), refresh_token: tokens.refresh_token } as Auth.Credentials);
      }
      if (tokens.access_token) {
        const prev = loadTokens() || {};
        saveTokens({ ...prev, access_token: tokens.access_token, expiry_date: tokens.expiry_date } as Auth.Credentials);
      }
    });

    const tokens = loadTokens();
    if (!tokens) {
      const url = generateAuthUrl();
      const msg = `No Gmail tokens found. Visit the following URL to authorize the application and then call setTokenFromCode(code) with the returned code:\n${url}`;
      logger.warn(msg);
      throw new Error(msg);
    }

    oauth2Client.setCredentials(tokens);

    // Try to refresh to ensure validity; google client will auto-refresh on requests, but do an explicit refresh now
    try {
      await oauth2Client.getAccessToken();
    } catch (refreshErr) {
      logger.warn('Failed to refresh Gmail access token silently', refreshErr instanceof Error ? refreshErr.message : String(refreshErr));
    }

    return oauth2Client;
  } catch (err) {
    logger.error('Failed to get authenticated Gmail client', err instanceof Error ? err.message : String(err));
    throw err;
  }
}
