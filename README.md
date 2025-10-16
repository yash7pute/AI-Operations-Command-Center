# my-node-ts-app

Starter Node.js + TypeScript project scaffold with integrations and placeholders.

To get started:

1. Copy `.env.example` to `.env` and fill in secrets.
2. npm install
3. npm run dev
# My Node.js TypeScript App

This project is a Node.js application built with TypeScript that integrates with various APIs, including Slack, Google, and Notion. It is structured to facilitate the development of workflows and agents that interact with these integrations.

## Project Structure

```
my-node-ts-app
├── src
│   ├── index.ts              # Entry point of the application
│   ├── integrations          # Contains API integration logic
│   │   ├── slack.ts          # Slack API integration
│   │   ├── google.ts         # Google API integration
│   │   └── notion.ts         # Notion API integration
│   ├── agents                # Contains agent logic
│   │   └── index.ts          # Placeholder for agent behavior
│   ├── workflows             # Contains workflow orchestration logic
│   │   └── index.ts          # Placeholder for workflows
│   ├── utils                 # Utility functions
│   │   └── logger.ts         # Logging utilities
│   └── types                 # Type definitions
│       └── index.ts          # Shared TypeScript types
├── package.json              # Project dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── .gitignore                # Files and directories to ignore in Git
└── README.md                 # Project documentation
# AI Operations Command Center

## 1. Project Overview
AI Operations Command Center is an integration platform that ingests events from Gmail, Slack, and Google Workspace (Sheets/Drive), routes them through an internal EventHub, optionally enriches or classifies them with an LLM, and executes actions (create/update Notion pages, Trello cards, Drive attachments, Slack messages). It provides resilient delivery with retry queues and circuit-breakers to handle rate limits and transient failures.

## 2. Architecture Diagram (ASCII)

Gmail  Slack  Sheets/Drive
   |      |         |
   v      v         v
 +---------------------+
 |      EventHub       |  <-- central event router (pub/sub)
 +---------------------+
                  |
                  v
             +------+     +----------------+
             | LLM  | --> | Action Workers |
             +------+     +----------------+
                  |                  |
                  v                  v
   +----------------+    +------------------+
   | Transformations|    | Integrations     |
   +----------------+    | Notion/Trello/   |
                  |            | Drive/Slack/...  |
                  v            +------------------+
            (Retries / Circuit-breakers / Logs)

Data flow: Gmail/Slack/Sheets -> EventHub -> LLM/Transforms -> Action Workers -> Notion/Trello/Drive/Slack

## 3. Prerequisites
- Node.js 18 or newer
- npm (Node package manager)
- Environment variables / API keys for the following services:
   - Gmail API credentials (OAuth client ID & secret)
   - Slack Bot Token and App credentials
   - Google Cloud credentials for Sheets & Drive (service account or OAuth)
   - Composio API credentials (if using Composio integrations)
   - Any other API keys for third-party connectors used in your workflows

## 4. Installation Steps
1. Clone the repository

```bash
git clone https://github.com/yash7pute/AI-Operations-Command-Center.git
cd AI-Operations-Command-Center/my-node-ts-app
```

2. Install dependencies

```bash
npm install
```

3. Copy configuration example

```bash
copy .env.example .env
```

(If you're on macOS/Linux use `cp .env.example .env`.)

4. Fill in API credentials in `.env`
- Gmail: OAuth client ID & secret (see Authentication Setup below)
- Slack: Bot token, signing secret, app credentials
- Google Sheets/Drive: service account JSON path or OAuth credentials
- Composio: API keys or app credentials

Links to get keys:
- Google Cloud / Gmail / Sheets / Drive: https://console.cloud.google.com/
- Slack App & tokens: https://api.slack.com/apps
- Composio: https://www.composio.example.com (replace with actual provider docs)

## 5. Authentication Setup
This section shows the most common steps. Copy any command outputs/screenshots into your project notes when following these.

### Gmail OAuth setup (high level)
1. Go to Google Cloud Console: https://console.cloud.google.com/
2. Create a new project (or use an existing one).
3. Enable the Gmail API and Google Drive / Sheets APIs.
4. Under "APIs & Services" -> "OAuth consent screen" configure your app name and authorized domains.
5. Create OAuth 2.0 Client IDs under "Credentials" -> "Create Credentials" -> "OAuth client ID".
6. Choose "Web application", add authorized redirect URIs (e.g., http://localhost:3000/auth/callback), and save.
7. Copy the Client ID and Client Secret into your `.env` (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET). 

(Screenshots: open Google Cloud Console -> APIs & Services -> Credentials -> Create Credentials -> OAuth client ID)

### Slack app creation and token generation
1. Visit https://api.slack.com/apps and create a new app.
2. Add appropriate scopes for your bot (e.g., chat:write, channels:read, users:read).
3. Install the app to your workspace and copy the Bot User OAuth token (xoxb-...).
4. Add the token and signing secret to `.env` (SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET).

### Google Sheets & Drive API enabling
1. Enable the Google Sheets API and Google Drive API in the Cloud Console.
2. Create a service account (or use OAuth) and download the JSON key. Set the path to that key in `.env` (GOOGLE_APPLICATION_CREDENTIALS).

### Composio account setup
1. Register for a Composio account (or your orchestration provider).
2. Create an app/integration and obtain API credentials.
3. Add COMPOSIO_API_KEY (and any other required keys) to `.env`.

## 6. Running the Application
- Development (watch/reload):

```bash
npm run dev
```

- Production:

```bash
npm start
```

- Run tests (unit & integration):

```bash
npm test
```

Notes:
- `npm run dev` should start the app with ts-node or a compiled output depending on your scripts in `package.json`.

## 7. Project Structure
Top-level layout (brief explanation):

- `src/`
   - `index.ts` - application entrypoint
   - `agents/` - worker agents that process events and coordinate tasks
   - `config/` - application configuration loader
   - `integrations/` - adapters for external services (Gmail, Slack, Notion, Trello, Drive, Sheets)
      - `composio/` - composio-specific helpers (auth-manager, notion-tools, trello-tools, executor)
      - `gmail/`, `slack/`, `sheets/`, `drive/` - service specific integrations
   - `workflows/` - orchestrated workflows built on top of integrations
   - `utils/` - helpers: retry-queue, circuit-breaker, logger, health-check
- `tests/`
   - `integrations/` - integration unit tests for adapters
   - `e2e/` - end-to-end tests that exercise the pipeline
- `data/` - local persistence for retry queues and test fixtures
- `logs/` - runtime logs
- `__mocks__/` - manual jest mocks used by tests

## 8. Troubleshooting
Common problems and solutions:

- "Cannot find module 'composio-sdk'" during tests:
   - Ensure `__mocks__/composio-sdk.js` exists (the repo includes a manual mock for tests).

- OAuth errors when authorizing Gmail/Google APIs:
   - Verify redirect URI matches exactly the one configured in Google Cloud Console.
   - For local development, you can use "http://localhost:3000/auth/callback" and add it to authorized redirect URIs.

- Slack events not delivered:
   - Check the Events Subscription URL and ensure your dev server is publicly reachable (use ngrok for local dev).
   - Verify the Slack signing secret is correct in `.env`.

- Tests failing due to singleton module imports and mocks:
   - Tests use `jest.isolateModules` and `jest.doMock` to inject mocks before requiring modules. If a test reports the real client being used, add `jest.resetModules()` before mocking in the test.

- Retry queue items not processed:
   - Confirm `data/retry-queue.json` file permissions and that the process can write to `data/`.
   - Unit tests stop the retry-queue background timer before manipulating the queue file.

## 9. Contributing guidelines
Thanks for contributing! Please follow these guidelines:

1. Fork the repository and create feature branches.
2. Follow the existing TypeScript linting and formatting conventions.
3. Add tests for new features or bug fixes. Unit tests live in `tests/`, integration tests in `tests/integrations/`, and end-to-end tests in `tests/e2e/`.
4. Use `jest.isolateModules` and `jest.doMock` in tests that need to mock singletons or modules imported at load time.
5. Open a pull request with a clear description of changes and include screenshots or logs for UI or integration changes.
6. Maintain backward compatibility for public integration helpers unless the change is explicitly breaking (document in the PR).

---

If you want, I can also add an e2e test scaffold under `tests/e2e/full-pipeline.test.ts` that simulates Gmail → EventHub → worker flow, mocks external APIs, measures latency, and logs a trace. Would you like me to create that test now? 