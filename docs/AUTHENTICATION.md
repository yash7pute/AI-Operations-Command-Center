# Authentication Guides

This document walks through authentication setup for the services used by this project: Gmail (OAuth), Slack, Google Sheets & Drive, and Composio. It includes step-by-step instructions, scope explanations, sample screenshots placeholders, and common troubleshooting tips.

---

## Gmail OAuth (Step-by-step)

1. Create a Google Cloud Project
   - Open Google Cloud Console: https://console.cloud.google.com/
   - Click the project dropdown and choose "New Project".
   - Give the project a recognizable name and click Create.
   - Screenshot: (insert screenshot of new project dialog)

2. Enable the Gmail API
   - In the Cloud Console, go to "APIs & Services" → "Library".
   - Search for "Gmail API" and click it.
   - Click "Enable".
   - Screenshot: (insert Gmail API enable screen)

3. Configure OAuth consent screen
   - In "APIs & Services" → "OAuth consent screen" configure an External or Internal app.
   - Fill in App name, support email, and developer contact information.
   - Add any test users if using External and you're in testing mode.
   - Save and continue.
   - Screenshot: (insert OAuth consent screen config)

4. Create OAuth credentials
   - Go to "APIs & Services" → "Credentials" → "Create Credentials" → "OAuth client ID".
   - Select "Web application" (or Desktop app for local-only flows).
   - Add authorized redirect URIs, e.g. `http://localhost:3000/auth/callback`.
   - Create and save; copy the Client ID and Client Secret.
   - Screenshot: (insert OAuth client creation)

5. Add to `.env`
   - Set `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` in your `.env`.

6. Running the first-time auth flow (development)
   - Start the app: `npm run dev`.
   - Visit the app route that starts OAuth (e.g., `/auth/gmail` or an admin UI route).
   - Sign in with your Google account and accept scopes.
   - The app should receive the callback at `/auth/callback` and store tokens.
   - Troubleshooting: If redirect mismatch occurs, ensure the redirect URI in the console exactly matches the one the app uses (including trailing slashes and ports).

7. Scopes and what they mean
   - `https://www.googleapis.com/auth/gmail.readonly` — read-only access to Gmail messages.
   - `https://www.googleapis.com/auth/gmail.modify` — read and modify (mark read/unread, label) messages.
   - `https://www.googleapis.com/auth/drive.file` — read/write access to files created or opened by the app.
   - `https://www.googleapis.com/auth/spreadsheets` — full access to Google Sheets.

---

## Slack App (Step-by-step)

1. Create a Slack App
   - Go to https://api.slack.com/apps and click "Create New App".
   - Choose "From scratch" and enter a name and workspace to develop in.
   - Screenshot: (insert create app screen)

2. Configure OAuth & Permissions
   - In your app settings, go to "OAuth & Permissions".
   - Under "Scopes", add Bot Token Scopes such as:
     - `chat:write` — send messages as the app
     - `channels:read` — read public channel info
     - `channels:history` — read messages and history in channels
     - `users:read` — read user profile info
   - Save changes.
   - Screenshot: (insert scopes UI screenshot)

3. Install App to Workspace
   - Click "Install to Workspace" and follow the consent steps.
   - After install, copy the "Bot User OAuth Token" (starts with `xoxb-`) and the "Signing Secret" from "Basic Information".
   - Add `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` to `.env`.

4. Event Subscriptions (optional)
   - If your app listens to events (e.g., message.channels), configure the Request URL and subscribe to the events under "Event Subscriptions".
   - For local development, expose your local server with ngrok and set the Request URL to the ngrok URL + path your app listens on.

5. Scopes explained
   - `chat:write` — allows bot to post messages in channels and conversations.
   - `channels:read` — allows listing public channels and reading metadata.
   - `channels:history` — allows reading messages (useful for ingestion).
   - `users:read` — allows fetching user profiles (for mapping senders to users).

6. Troubleshooting
   - If signature verification fails, ensure `SLACK_SIGNING_SECRET` matches and that your server uses the same raw request body when verifying timestamp/signature.
   - For Event Subscriptions, use a public HTTPS URL (ngrok for local dev) and ensure the URL responds within the required timeout.

---

## Google Sheets & Drive API enabling

1. Enable APIs
   - In Google Cloud Console, enable "Google Drive API" and "Google Sheets API".

2. Create credentials
   - For server-to-server access, create a Service Account under IAM & Admin → Service accounts.
   - Create a key (JSON) and download it.
   - Set `GOOGLE_APPLICATION_CREDENTIALS` to the path of the JSON file, or copy the key values into `.env` as your app expects.

3. Scopes (Service Account)
   - `https://www.googleapis.com/auth/drive.file` — read/write for app-created files.
   - `https://www.googleapis.com/auth/spreadsheets` — full access to spreadsheets.

4. Troubleshooting
   - If access denied when reading a user's Drive, ensure the file or folder is shared with the service account email or use domain-wide delegation with proper scopes.

---

## Composio Authentication

> Replace Composio with your orchestration provider if different.

1. Create application credentials on Composio
   - Login to Composio portal and register a new app/integration.
   - Retrieve Client ID and Client Secret (or API key).
   - Add credentials to `.env` (e.g., `COMPOSIO_CLIENT_ID`, `COMPOSIO_CLIENT_SECRET`, or `COMPOSIO_API_KEY`).

2. OAuth flow
   - If Composio requires OAuth, add callback URIs similar to Gmail and run the auth flow in the app to obtain tokens.

3. Troubleshooting
   - If tokens fail to exchange, verify the client ID/secret and callback URI match exactly.

---

## Screenshots & Placeholders
Insert screenshots to help follow the steps in a real setup. For automation, store images under `docs/images` and reference them here as `![alt](images/google-oauth.png)`.

---

## Troubleshooting Summary
- Redirect URI mismatch: ensure exact match in console and `.env`.
- Invalid credentials: double check client ID/secret and paste without extra whitespace.
- Permission denied on Google Drive: share resource with service account or enable domain delegation.
- Slack signature errors: verify timestamp and signature check uses raw request body.

---

If you'd like, I can add ready-to-use screenshots and small CLI commands to help automate the creation of service account keys and local environment config. Marking this doc as completed.
