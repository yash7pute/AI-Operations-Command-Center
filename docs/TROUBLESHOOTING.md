# Troubleshooting Guide

This document collects common errors, debugging tips, an FAQ and emergency procedures for the AI Operations Command Center.

---

## Common Errors & Solutions

### "Gmail authentication failed"
Symptom: Integration logs show errors authenticating to Gmail or the app cannot fetch messages.

Possible causes and fixes:
- Credentials invalid or expired. Verify `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` in `.env`.
- Redirect URI mismatch. Ensure the redirect URI configured in Google Cloud Console exactly matches the one the app uses (including protocol, host, port and trailing slash).
- Tokens corrupted or missing. Re-run the OAuth flow (visit the app's auth route) to re-authorize.
- For service account flows: ensure the JSON key referenced by `GOOGLE_APPLICATION_CREDENTIALS` is valid and accessible.

Quick actions:
- Re-run OAuth from the app UI or restart the auth flow.
- Delete local stored session tokens and retry (see Emergency Procedures below).

---

### "Slack connection timeout"
Symptom: Bot cannot post messages or event subscriptions fail to reach your server.

Possible causes and fixes:
- Network connectivity issues. Verify the host has internet access and DNS resolution.
- Token invalid/rotated. Confirm `SLACK_BOT_TOKEN` is present and correct.
- App not installed in workspace / scopes missing. Reinstall app and grant required scopes.
- If using Event Subscriptions, make sure the Request URL is publicly reachable (use ngrok for local development).

Quick actions:
- Check `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` in `.env`.
- Reinstall app in Slack and copy new tokens into `.env`.

---

### "Rate limit exceeded"
Symptom: External API returns 429s and operations are failing or being retried.

What the system does:
- Integrations implement a simple rate limiter (`BaseIntegration.rateLimit`) and exponential backoff in `withRetry` (1s, 2s, 4s) for retry attempts.
- A global retry queue persists failed/rescheduled operations to `data/retry-queue.json` and attempts them later.

How to resolve:
- Inspect logs to find which integration is triggering 429s. The log contains `rate limit` or the API's error message.
- If the pressure is legitimate (high traffic), increase `minIntervalMs` configuration for that integration or add batching to reduce call volume.
- Tune retry policy or add additional delays in integration configuration.

Quick commands:
- Pause offending integrations via the Integration Manager UI or by stopping the process.

---

### "Integration health check failed"
Symptom: Health endpoint reports an integration as `disconnected` or `error`.

How to diagnose:
- Check integration-specific logs in `logs/` and the EventHub history for `service.started`/`service.stopped` events.
- Use `IntegrationManager.healthCheck()` (if exposed via an admin endpoint) or call the integration's `health` method.
- Ensure required credentials and network access are in place.

Fixes:
- Restart the integration (via manager or restart the app).
- Re-run the authentication for that integration.
- Inspect and fix any upstream dependencies (e.g., DNS, proxy settings).

---

## Debugging Tips

### Enable debug logging
- Use environment variables to set verbose logging. If the project respects `LOG_LEVEL`, set it to `debug`:

```cmd
set LOG_LEVEL=debug
npm run dev
```

or PowerShell:

```powershell
$env:LOG_LEVEL='debug'
npm run dev
```

- Some modules log more when `DEBUG` or module-specific flags are set; check the integration source for debug checks.

### Where to find logs
- Event log: `logs/events.log`
- General application logs: `logs/app.log` (or the location your logger is configured to use).
- Retry queue persistence: `data/retry-queue.json`

Search logs with `findstr` on Windows or `Select-String` in PowerShell for keywords like `ERROR`, `WARN`, `Event emitted`, or the integration name.

### How to test individual integrations
- Unit tests: `npm test` (runs Jest suites under `tests/` and `tests/integrations/`).
- For integration-level manual tests:
  - Start the app in dev mode.
  - Use the module's exported helpers (for example, call a NotionIntegration method in a small script) or use admin HTTP endpoints if available.
- For Gmail: use the provided Gmail listener's `pollOnce` method (or run the listener for one interval) to verify fetching behavior.
- For Trello/Notion: invoke the adapter methods with a sandbox account and verify results.

---

## FAQ

### How often does the system poll?
- GmailListener defaults to polling every 60 seconds (configurable when constructing the listener or via environment variables). Some integrations may support push (webhooks/PubSub) to reduce polling.

### How to add new channels to monitor?
- For Gmail: adjust the `GmailFetcher` filter or `GmailListener` to recognize additional labels or senders.
- For Slack: update the app to subscribe to additional events (configure in Slack App > Event Subscriptions) and add handlers inside `src/integrations/slack`.
- Add instrumentation and unit tests for the new channel.

### How to reset authentication?
- Remove stored tokens for the service (see Emergency Procedures). Then re-run the auth flow via the application UI or admin endpoint.

---

## Emergency Procedures

### How to stop all integrations
If the app exposes an admin endpoint to call `IntegrationManager.stopAll()`, use that. Otherwise:
- Stop the process gracefully (CTRL+C in the terminal running the app).
- On Windows, use Task Manager to end the process if needed.

Example (stop via process):

```cmd
# If running via npm in foreground, press Ctrl+C
# Or, if launched as a service, use your service manager to stop it
```

### How to clear retry queue
- Safely clear the persisted retry queue file:

```cmd
# Windows cmd
del data\retry-queue.json
# or overwrite with empty array
powershell -Command "Set-Content -Path 'data/retry-queue.json' -Value '[]'"
```

After clearing, restart the app to ensure it re-initializes the queue.

### How to reset to a fresh state
Steps to reset local dev state:
1. Stop the app.
2. Remove transient data files:
   - `del data\retry-queue.json`
   - `rmdir /s /q tokens` (removes stored tokens; will require re-auth)
   - `del logs\events.log`
3. Restart the app and perform authorization flows again.

Be careful: these operations delete persisted state. Ensure you have backups for production environments.

---

If you'd like, I can add safe helper scripts under `scripts/` to perform common diagnostics and safe reset/clear operations (for example, `scripts/clear-retry-queue.js`). Would you like me to add those? 
