# Orchestration Runbook

**Version**: 1.0  
**Last Updated**: October 17, 2025  
**Audience**: Operations Team, SRE, DevOps

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Reference](#quick-reference)
3. [Common Issues](#common-issues)
4. [Emergency Procedures](#emergency-procedures)
5. [Maintenance Tasks](#maintenance-tasks)
6. [Monitoring & Alerts](#monitoring--alerts)
7. [Troubleshooting Tools](#troubleshooting-tools)
8. [Escalation Procedures](#escalation-procedures)

---

## Overview

This runbook provides step-by-step procedures for diagnosing and resolving common issues in the AI Operations Command Center orchestration layer. It covers operational tasks, emergency procedures, and maintenance activities.

### Key Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| Primary On-Call | ops-team@company.com | 24/7 |
| Engineering Lead | eng-lead@company.com | Business hours |
| Platform Admin | admin@company.com | Business hours |

### System Health Dashboard

- **URL**: `http://dashboard.company.com/orchestration`
- **Metrics**: Success rate, queue depth, circuit breaker status
- **Alerts**: Slack #ops-alerts, PagerDuty

---

## Quick Reference

### Health Check Commands

```bash
# Check overall system health
npm run check:health

# Check specific platform
npm run check:health notion
npm run check:health trello
npm run check:health slack
npm run check:health drive
npm run check:health sheets

# View queue status
npm run queue:status

# View circuit breaker status
npm run circuit:status

# View recent errors
npm run logs:errors --limit 20
```

### Emergency Commands

```bash
# Pause all processing
npm run pause:all

# Resume processing
npm run resume:all

# Clear stuck queue items
npm run clear:queue

# Reset circuit breaker
npm run reset:circuit <platform>

# Force rollback
npm run rollback:force <workflowId>
```

### Monitoring URLs

| Endpoint | Purpose |
|----------|---------|
| `/health` | Overall health status |
| `/metrics` | Performance metrics |
| `/queue` | Current queue state |
| `/circuit-breakers` | Circuit breaker states |
| `/recent-errors` | Recent error log |

---

## Common Issues

### Issue 1: Actions Stuck in Queue

**Severity**: 🟡 Medium  
**Impact**: Actions delayed, user experience degraded

#### Symptoms
- Queue depth continuously growing
- Actions waiting >5 minutes
- Worker utilization <50%
- Dashboard shows increasing wait times

#### Diagnosis

**Step 1: Check Queue Status**
```bash
npm run queue:status
```

**Expected Output**:
```json
{
  "totalQueued": 45,
  "byPriority": {
    "critical": 0,
    "high": 5,
    "normal": 25,
    "low": 15
  },
  "avgWaitTime": 15000,
  "workerUtilization": 0.4
}
```

**Step 2: Check Executor Health**
```bash
npm run check:health --verbose
```

**Look for**:
- Circuit breakers in OPEN state
- Rate limits being hit
- High error rates per platform

**Step 3: Check Logs**
```bash
npm run logs:workers --since 10m
```

**Look for**:
- Worker crashes
- Timeout errors
- Network issues

#### Solution

**Option 1: Rate Limit Issue**
```bash
# Check rate limit status
curl http://localhost:3000/api/rate-limits

# If rate limited, wait for window to reset
# Or increase rate limit in config
```

**Option 2: Circuit Breaker Open**
```bash
# Check which circuits are open
npm run circuit:status

# Wait for auto-recovery (30s default)
# Or manually reset if platform is healthy
npm run reset:circuit <platform>
```

**Option 3: Worker Issues**
```bash
# Restart workers
npm run restart:workers

# Or increase worker count
export QUEUE_WORKERS=10
npm run restart:all
```

**Option 4: Clear Stuck Items**
```bash
# View stuck items (>10 minutes in queue)
npm run queue:stuck

# Clear specific item
npm run queue:remove <actionId>

# Or clear all stuck items
npm run clear:queue --stuck-only
```

**Option 5: Resume Processing**
```bash
# Resume if paused
npm run resume:processing
```

#### Prevention

1. **Monitor queue depth** with alerts at 50/100/200 items
2. **Auto-scale workers** based on queue depth
3. **Set appropriate rate limits** in config
4. **Regular health checks** every 5 minutes

#### Related Issues
- [Circuit Breaker Open](#issue-2-circuit-breaker-open-for-platform)
- [Rate Limit Exceeded](#issue-5-rate-limit-exceeded)

---

### Issue 2: Circuit Breaker Open for Platform

**Severity**: 🔴 High  
**Impact**: All actions to specific platform failing immediately

#### Symptoms
- All actions to platform failing with "Circuit breaker is OPEN"
- Dashboard shows circuit breaker in OPEN state
- No actions being attempted to platform
- Failure count at or above threshold (default: 5)

#### Diagnosis

**Step 1: Check Circuit Breaker Status**
```bash
npm run circuit:status notion
```

**Expected Output**:
```json
{
  "platform": "notion",
  "state": "OPEN",
  "failureCount": 7,
  "lastFailure": "2025-10-17T10:30:45.123Z",
  "openedAt": "2025-10-17T10:30:45.123Z",
  "willResetAt": "2025-10-17T10:31:15.123Z"
}
```

**Step 2: Check Platform Status**
```bash
# Check Notion API status
curl https://status.notion.so/api/v2/status.json

# Or use our health check
npm run check:health notion --external
```

**Step 3: Check Authentication**
```bash
# Test authentication
npm run test:auth notion
```

**Step 4: Review Recent Errors**
```bash
npm run logs:errors --platform notion --limit 10
```

**Common Error Patterns**:
- `Authentication failed` → Invalid API key
- `Rate limited` → Too many requests
- `Service unavailable` → Notion API down
- `Network timeout` → Network issues

#### Solution

**Option 1: Wait for Auto-Recovery (Recommended)**
```bash
# Circuit breaker will auto-transition to HALF_OPEN after timeout (default: 30s)
# Monitor status:
watch -n 5 "npm run circuit:status notion"

# Once HALF_OPEN, circuit will attempt test request
# If successful, circuit closes automatically
```

**Option 2: Fix Authentication Issues**
```bash
# Verify API key in environment
echo $NOTION_API_KEY

# Update API key if expired
export NOTION_API_KEY=secret_new_key

# Test authentication
npm run test:auth notion

# Reset circuit after fixing auth
npm run reset:circuit notion
```

**Option 3: Platform Down**
```bash
# Enable fallback to Trello
export NOTION_FALLBACK_ENABLED=true
export NOTION_FALLBACK_PLATFORM=trello

# Actions will automatically use Trello
# Monitor fallback usage:
npm run logs:fallback --since 5m
```

**Option 4: Manual Circuit Reset (Use with Caution)**
```bash
# Only reset if you've confirmed platform is healthy
# and auth is working

# Reset circuit
npm run reset:circuit notion

# Verify circuit closed
npm run circuit:status notion
```

**Option 5: Emergency Bypass (Last Resort)**
```bash
# Disable circuit breaker for platform (NOT RECOMMENDED)
export NOTION_CIRCUIT_BREAKER_ENABLED=false

# Restart service
npm run restart:all

# Re-enable ASAP:
export NOTION_CIRCUIT_BREAKER_ENABLED=true
npm run restart:all
```

#### Prevention

1. **Monitor circuit breaker state** with alerts
2. **Set appropriate failure threshold** (default: 5)
3. **Configure fallback platforms** for critical workflows
4. **Test authentication** regularly
5. **Subscribe to platform status pages**

#### Post-Incident

```bash
# After circuit recovers, review what caused failures
npm run logs:errors --platform notion --since 1h

# Update runbook with new failure patterns
# Consider adjusting circuit breaker thresholds if too sensitive
```

#### Related Issues
- [Actions Stuck in Queue](#issue-1-actions-stuck-in-queue)
- [Authentication Failed](#issue-6-authentication-failed)

---

### Issue 3: Duplicate Tasks Created

**Severity**: 🟡 Medium  
**Impact**: Duplicate data, user confusion, wasted resources

#### Symptoms
- Same task appears multiple times in Notion/Trello
- Idempotency check logs show collisions
- Users report seeing duplicate notifications
- Sheet logs show duplicate entries

#### Diagnosis

**Step 1: Check Idempotency Status**
```bash
# Check if idempotency is enabled
npm run config:get ENABLE_IDEMPOTENCY

# Check workflow state
npm run workflow:state <workflowId>
```

**Step 2: Check Logs for Duplicates**
```bash
# Find duplicate executions
npm run logs:duplicates --since 24h

# Check specific workflow
npm run logs:workflow <workflowId>
```

**Step 3: Review Idempotency Keys**
```bash
# List recent idempotency keys
npm run idempotency:list --limit 50

# Check for collisions
npm run idempotency:check <key>
```

**Common Causes**:
- Idempotency disabled
- Duplicate action submissions
- Idempotency key collisions
- Workflow state not persisted
- Retry without idempotency check

#### Solution

**Option 1: Enable Idempotency**
```bash
# Enable in config
export ENABLE_IDEMPOTENCY=true

# Restart service
npm run restart:all

# Verify enabled
npm run config:get ENABLE_IDEMPOTENCY
```

**Option 2: Clear Duplicate Tasks**

**For Notion:**
```bash
# List duplicates
npm run notion:find-duplicates --database <dbId>

# Remove duplicates (keeps first)
npm run notion:remove-duplicates --database <dbId> --dry-run
npm run notion:remove-duplicates --database <dbId> --confirm
```

**For Trello:**
```bash
# List duplicates
npm run trello:find-duplicates --board <boardId>

# Archive duplicates
npm run trello:archive-duplicates --board <boardId> --confirm
```

**Option 3: Fix Root Cause**

**If duplicate submissions:**
```bash
# Check Member 2 (Reasoning Engine) logs
npm run logs:member2 --grep "action:ready"

# Add deduplication in Member 2
# Update reasoning engine to check recent actions before emitting
```

**If key collisions:**
```bash
# Review key generation logic
npm run logs:idempotency --collisions

# Update key generation to include timestamp
# Example: `invoice-${invoiceId}-${timestamp}`
```

**If state not persisted:**
```bash
# Check state manager
npm run workflow:check-state

# Verify state storage
npm run db:check

# Re-enable state persistence
export WORKFLOW_STATE_ENABLED=true
npm run restart:all
```

**Option 4: Manual Cleanup**
```bash
# Mark workflow as completed to prevent re-execution
npm run workflow:mark-completed <workflowId>

# Clear idempotency cache for specific key
npm run idempotency:clear <key>
```

#### Prevention

1. **Always enable idempotency** in production
2. **Use unique idempotency keys** (include timestamp, user ID)
3. **Validate idempotency** before action execution
4. **Monitor duplicate detection** logs
5. **Implement duplicate check** in Member 2
6. **Persist workflow state** reliably

#### Post-Incident

```bash
# Analyze duplicate patterns
npm run analytics:duplicates --since 7d

# Update idempotency key generation
# Add duplicate detection in reasoning engine
# Create alert for duplicate detection
```

#### Related Issues
- [Workflow State Lost](#issue-8-workflow-state-lost)
- [Actions Executed Multiple Times](#issue-9-actions-executed-multiple-times)

---

### Issue 4: Rollback Failed

**Severity**: 🔴 High  
**Impact**: Partial action executed, data inconsistent, manual cleanup needed

#### Symptoms
- Workflow failed mid-execution
- Rollback initiated but incomplete
- Some steps reversed, others not
- Dashboard shows "rollback failed" status
- Data inconsistent across platforms

#### Diagnosis

**Step 1: Check Rollback Status**
```bash
# View workflow status
npm run workflow:status <workflowId>

# Check rollback logs
npm run logs:rollback --workflow <workflowId>
```

**Expected Output**:
```json
{
  "workflowId": "invoice-001",
  "status": "rollback_failed",
  "completedSteps": ["create_file", "update_sheet"],
  "rolledBackSteps": ["update_sheet"],
  "failedRollbacks": ["create_file"],
  "error": "File deletion failed: permission denied"
}
```

**Step 2: Identify Non-Reversible Steps**
```bash
# Check which steps failed to rollback
npm run workflow:rollback-failures <workflowId>
```

**Step 3: Check Platform Status**
```bash
# Check if platform executors are down
npm run check:health --all
```

**Common Causes**:
- Platform executor down during rollback
- Non-reversible operations (e.g., email sent)
- Permission denied for deletion
- Resource already deleted
- Network timeout during rollback

#### Solution

**Option 1: Retry Rollback**
```bash
# Retry failed rollback steps
npm run rollback:retry <workflowId>

# Force rollback (use with caution)
npm run rollback:force <workflowId>
```

**Option 2: Manual Cleanup**

**Step-by-Step Manual Rollback**:

1. **Review what was executed**:
   ```bash
   npm run workflow:steps <workflowId>
   ```

2. **Undo Drive file creation**:
   ```bash
   # Get file ID from logs
   npm run logs:workflow <workflowId> --grep "create_file"
   
   # Delete file manually
   npm run drive:delete <fileId>
   ```

3. **Undo Sheet updates**:
   ```bash
   # Get row information
   npm run logs:workflow <workflowId> --grep "update_sheet"
   
   # Delete row manually
   npm run sheets:delete-row <spreadsheetId> <row>
   ```

4. **Undo Slack notifications**:
   ```bash
   # Cannot truly "undo" a notification
   # Send correction message:
   npm run slack:send --channel <channel> --text "Previous notification was in error, please disregard"
   ```

5. **Undo Notion tasks**:
   ```bash
   # Get page ID from logs
   npm run logs:workflow <workflowId> --grep "create_task"
   
   # Delete page
   npm run notion:delete <pageId>
   ```

6. **Undo Trello cards**:
   ```bash
   # Get card ID from logs
   npm run logs:workflow <workflowId> --grep "create_card"
   
   # Archive card
   npm run trello:archive <cardId>
   ```

**Option 3: Mark as Resolved**
```bash
# After manual cleanup, mark workflow as resolved
npm run workflow:mark-resolved <workflowId> --comment "Manual cleanup completed"

# Clear from failed rollbacks
npm run workflow:clear-failed <workflowId>
```

**Option 4: Compensating Transaction**
```bash
# Create compensating workflow to fix inconsistencies
npm run workflow:compensate <workflowId>

# Execute compensation
npm run workflow:execute <compensatingWorkflowId>
```

#### Prevention

1. **Design reversible operations** where possible
2. **Implement compensation** for non-reversible steps
3. **Test rollback paths** regularly
4. **Log rollback actions** thoroughly
5. **Set rollback timeouts** appropriately
6. **Use transactions** where platform supports
7. **Monitor rollback success rate**

#### Post-Incident

```bash
# Document non-reversible operations
npm run docs:generate --rollback-limitations

# Update workflow to avoid non-reversible operations
# Add compensation logic for email/notification steps
# Create runbook entry for this specific workflow
```

#### Related Issues
- [Workflow State Lost](#issue-8-workflow-state-lost)
- [Platform Executor Down](#issue-7-platform-executor-down)

---

### Issue 5: Rate Limit Exceeded

**Severity**: 🟡 Medium  
**Impact**: Actions delayed or failed, reduced throughput

#### Symptoms
- Actions failing with "rate_limited" error
- Dashboard shows rate limit percentage at 100%
- Circuit breaker may open due to repeated failures
- Specific platform returning 429 status codes

#### Diagnosis

**Step 1: Check Rate Limit Status**
```bash
# Check all platforms
npm run rate-limits:status

# Check specific platform
npm run rate-limits:status notion
```

**Expected Output**:
```json
{
  "platform": "notion",
  "current": 3,
  "limit": 3,
  "window": "1s",
  "percentage": 100,
  "resetAt": "2025-10-17T10:30:46.123Z"
}
```

**Step 2: Check Request Volume**
```bash
# Check requests per minute
npm run metrics:requests --platform notion --window 5m

# Check action types
npm run metrics:actions --platform notion --breakdown
```

**Step 3: Review Recent Actions**
```bash
# Check what's causing high volume
npm run logs:actions --platform notion --since 5m --limit 100
```

#### Solution

**Option 1: Wait for Rate Limit Reset**
```bash
# Check when rate limit resets
npm run rate-limits:status notion --reset-time

# Actions will automatically retry with backoff
# Monitor queue for backed-up actions
npm run queue:status
```

**Option 2: Increase Rate Limit (If Allowed by Platform)**

**For Notion:**
```bash
# Request rate limit increase from Notion
# Update config with new limit
export NOTION_RATE_LIMIT=10  # requests per second

# Restart service
npm run restart:all
```

**Option 3: Reduce Request Volume**

**Batch requests:**
```bash
# Enable batching for bulk operations
export ENABLE_BATCHING=true
export BATCH_SIZE=10
export BATCH_WINDOW=1000  # ms

npm run restart:all
```

**Optimize queries:**
```bash
# Check for inefficient queries
npm run analyze:queries --platform notion

# Enable caching
export ENABLE_CACHING=true
export CACHE_TTL=300  # 5 minutes

npm run restart:all
```

**Option 4: Implement Request Throttling**
```bash
# Add throttling per user/workflow
export THROTTLE_PER_USER=5  # requests per minute
export THROTTLE_PER_WORKFLOW=10

npm run restart:all
```

**Option 5: Use Fallback Platform**
```bash
# Temporarily use Trello instead of Notion
export NOTION_FALLBACK_ENABLED=true
export NOTION_FALLBACK_PLATFORM=trello

npm run restart:all
```

#### Prevention

1. **Monitor rate limit usage** with alerts at 80%
2. **Implement request batching** for bulk operations
3. **Enable caching** for read operations
4. **Set appropriate rate limits** in config
5. **Distribute load** across time periods
6. **Request higher limits** from platforms proactively

#### Post-Incident

```bash
# Analyze rate limit patterns
npm run analytics:rate-limits --since 7d

# Optimize request patterns
# Implement better caching strategy
# Request permanent rate limit increase if needed
```

#### Related Issues
- [Actions Stuck in Queue](#issue-1-actions-stuck-in-queue)
- [Circuit Breaker Open](#issue-2-circuit-breaker-open-for-platform)

---

### Issue 6: Authentication Failed

**Severity**: 🔴 High  
**Impact**: All actions to platform failing, complete service disruption

#### Symptoms
- All actions to platform failing with "authentication failed"
- 401 Unauthorized errors in logs
- Circuit breaker likely open
- Dashboard shows auth error status

#### Diagnosis

**Step 1: Test Authentication**
```bash
# Test specific platform auth
npm run test:auth notion

# Test all platforms
npm run test:auth --all
```

**Expected Output**:
```json
{
  "platform": "notion",
  "authenticated": false,
  "error": "Invalid API key",
  "lastSuccessfulAuth": "2025-10-17T08:30:45.123Z"
}
```

**Step 2: Check Environment Variables**
```bash
# Check if API key is set
echo $NOTION_API_KEY

# Check if key is correct format
npm run validate:env
```

**Step 3: Check API Key Status**
```bash
# Check key expiration (if applicable)
npm run check:key-expiration notion

# Check key permissions
npm run check:key-permissions notion
```

#### Solution

**Option 1: Update Expired API Key**

**For Notion:**
```bash
# Get new API key from Notion settings
# Update environment variable
export NOTION_API_KEY=secret_new_key_here

# Restart service
npm run restart:all

# Verify authentication
npm run test:auth notion
```

**For Slack:**
```bash
# Regenerate bot token in Slack app settings
export SLACK_BOT_TOKEN=xoxb-new-token

npm run restart:all
npm run test:auth slack
```

**For Google (Drive/Sheets):**
```bash
# Refresh OAuth token
npm run google:refresh-token

# Or update service account key
export GOOGLE_SERVICE_ACCOUNT_KEY=/path/to/new-key.json

npm run restart:all
npm run test:auth drive
npm run test:auth sheets
```

**Option 2: Fix Key Permissions**
```bash
# Check what permissions key has
npm run check:permissions notion

# Update key scopes in platform settings
# Ensure key has required permissions:
# - Read content
# - Update content
# - Insert content
```

**Option 3: Rotate All Keys (Security Incident)**
```bash
# Rotate all platform keys
npm run security:rotate-keys --all

# This will:
# 1. Generate new keys in all platforms
# 2. Update environment variables
# 3. Restart services
# 4. Verify all authentications
```

**Option 4: Use Backup Authentication**
```bash
# Switch to backup API key (if configured)
export USE_BACKUP_CREDENTIALS=true

npm run restart:all
```

#### Prevention

1. **Monitor key expiration** with alerts 7 days before
2. **Rotate keys regularly** (every 90 days)
3. **Store keys securely** (Vault, AWS Secrets Manager)
4. **Test authentication** in health checks
5. **Have backup keys** ready
6. **Document key rotation** procedure

#### Post-Incident

```bash
# Document what caused auth failure
# Update key rotation schedule
# Implement automated key rotation
# Create alerts for auth failures
```

#### Related Issues
- [Circuit Breaker Open](#issue-2-circuit-breaker-open-for-platform)
- [All Actions Failing](#issue-10-all-actions-failing-to-platform)

---

### Issue 7: Platform Executor Down

**Severity**: 🔴 Critical  
**Impact**: Complete failure for all actions to platform

#### Symptoms
- All actions to platform failing
- Health check failing for executor
- Worker logs show executor crashes
- Circuit breaker open

#### Diagnosis

**Step 1: Check Executor Status**
```bash
# Check specific executor
npm run executor:status notion

# Check all executors
npm run executor:status --all
```

**Step 2: Check Logs for Crashes**
```bash
# Check executor logs
npm run logs:executor notion --since 10m

# Look for stack traces
npm run logs:errors --executor notion
```

**Step 3: Check Dependencies**
```bash
# Check if platform SDK is working
npm run test:sdk notion

# Check network connectivity
npm run test:connectivity notion
```

#### Solution

**Option 1: Restart Executor**
```bash
# Restart specific executor
npm run executor:restart notion

# Verify status
npm run executor:status notion
```

**Option 2: Restart All Services**
```bash
# Full restart
npm run restart:all

# Check all executors
npm run check:health --all
```

**Option 3: Enable Fallback**
```bash
# Use fallback platform
export NOTION_FALLBACK_ENABLED=true
export NOTION_FALLBACK_PLATFORM=trello

npm run restart:all
```

**Option 4: Investigate and Fix**
```bash
# Get detailed error
npm run logs:executor notion --verbose

# Common fixes:
# - Update dependencies: npm install
# - Fix configuration: npm run config:validate
# - Clear cache: npm run cache:clear
```

#### Prevention

1. **Monitor executor health** continuously
2. **Auto-restart** on crashes
3. **Keep dependencies updated**
4. **Load test executors** regularly
5. **Have fallback executors** configured

---

### Issue 8: Workflow State Lost

**Severity**: 🟡 Medium  
**Impact**: Cannot resume workflows, potential duplicates

#### Symptoms
- Workflow status shows "unknown"
- Cannot query workflow state
- Workflow executed twice
- Idempotency checks failing

#### Diagnosis

**Step 1: Check State Storage**
```bash
# Check state storage health
npm run state:check

# Check specific workflow
npm run workflow:state <workflowId>
```

**Step 2: Check State Logs**
```bash
# Check state operations
npm run logs:state --since 1h

# Check for errors
npm run logs:errors --component state-manager
```

#### Solution

**Option 1: Restore from Backup**
```bash
# List available backups
npm run state:backups

# Restore state
npm run state:restore --backup <timestamp>
```

**Option 2: Rebuild State**
```bash
# Rebuild from execution logs
npm run state:rebuild <workflowId>
```

**Option 3: Enable Persistence**
```bash
# Enable state persistence
export WORKFLOW_STATE_ENABLED=true
export STATE_STORAGE=redis  # or 'database'

npm run restart:all
```

---

### Issue 9: Actions Executed Multiple Times

**Severity**: 🟡 Medium  
**Impact**: Duplicate data, wasted resources

#### Symptoms
- Same action executed 2+ times
- Logs show duplicate action IDs
- Idempotency not working

#### Diagnosis & Solution

See [Issue 3: Duplicate Tasks Created](#issue-3-duplicate-tasks-created)

---

### Issue 10: All Actions Failing to Platform

**Severity**: 🔴 Critical  
**Impact**: Complete platform unavailability

#### Symptoms
- 100% failure rate for platform
- All action types failing
- May affect multiple workflows

#### Diagnosis

**Step 1: Check Platform Status**
```bash
# Check external platform status
npm run check:platform-status notion
```

**Step 2: Check if Platform API is Down**
```bash
# Visit platform status page
# Notion: https://status.notion.so
# Slack: https://status.slack.com
# Google: https://status.cloud.google.com
```

**Step 3: Check Internal Issues**
```bash
# Test authentication
npm run test:auth notion

# Check circuit breaker
npm run circuit:status notion

# Check rate limits
npm run rate-limits:status notion
```

#### Solution

**If Platform Down**:
```bash
# Enable fallback
export NOTION_FALLBACK_ENABLED=true
export NOTION_FALLBACK_PLATFORM=trello

npm run restart:all

# Monitor platform status
npm run monitor:platform notion --interval 1m
```

**If Internal Issue**:
- See [Authentication Failed](#issue-6-authentication-failed)
- See [Circuit Breaker Open](#issue-2-circuit-breaker-open-for-platform)
- See [Rate Limit Exceeded](#issue-5-rate-limit-exceeded)

---

## Emergency Procedures

### Procedure 1: Complete System Outage

**When**: All platforms failing, system unresponsive

**Steps**:

1. **Assess Situation**
   ```bash
   npm run check:health --all
   npm run system:status
   ```

2. **Pause All Processing**
   ```bash
   npm run pause:all
   ```

3. **Check Critical Services**
   ```bash
   # Check database
   npm run db:check
   
   # Check event bus
   npm run eventbus:check
   
   # Check queue
   npm run queue:check
   ```

4. **Restart Services One by One**
   ```bash
   # Restart in order
   npm run restart:database
   npm run restart:eventbus
   npm run restart:queue
   npm run restart:executors
   npm run restart:workers
   ```

5. **Resume Processing**
   ```bash
   npm run resume:all
   ```

6. **Monitor Recovery**
   ```bash
   watch -n 5 "npm run check:health --all"
   ```

---

### Procedure 2: Data Corruption Detected

**When**: Inconsistent data across platforms

**Steps**:

1. **Stop All Processing**
   ```bash
   npm run pause:all
   ```

2. **Identify Scope**
   ```bash
   npm run analyze:corruption --since 24h
   ```

3. **Create Backup**
   ```bash
   npm run backup:create --full
   ```

4. **Restore Clean State**
   ```bash
   npm run restore:point --timestamp <clean-timestamp>
   ```

5. **Verify Integrity**
   ```bash
   npm run verify:integrity --all
   ```

6. **Resume Carefully**
   ```bash
   npm run resume:all --slow-start
   ```

---

### Procedure 3: Security Incident

**When**: Unauthorized access or key compromise detected

**Steps**:

1. **Immediate Lockdown**
   ```bash
   npm run security:lockdown
   ```

2. **Rotate All Keys**
   ```bash
   npm run security:rotate-keys --all --emergency
   ```

3. **Audit Access**
   ```bash
   npm run security:audit --since 7d
   ```

4. **Review Logs**
   ```bash
   npm run logs:security --suspicious
   ```

5. **Notify Team**
   ```bash
   npm run notify:security-team --incident <details>
   ```

6. **Restore After Verification**
   ```bash
   npm run security:restore --verified
   ```

---

## Maintenance Tasks

### Daily Tasks (10 minutes)

**Morning Check (9:00 AM)**:
```bash
# Run daily health check
npm run maintenance:daily

# This checks:
# - Overall system health
# - Success rate (target: >95%)
# - Queue depth (alert if >50)
# - Circuit breaker status
# - Recent errors (last 24h)
# - Disk space
# - Memory usage
```

**Expected Output**:
```
✅ System Health: HEALTHY
✅ Success Rate: 97.3% (target: >95%)
✅ Queue Depth: 23 (target: <50)
✅ Circuit Breakers: All CLOSED
✅ Error Rate: 2.7% (target: <5%)
⚠️  Disk Space: 82% (warning at >80%)
✅ Memory Usage: 65%
```

**Review Approval Queue**:
```bash
# Check pending approvals
npm run approvals:pending

# Alert if any >1 hour old
npm run approvals:overdue --threshold 1h
```

**Check Circuit Breaker Status**:
```bash
# Verify all circuits closed
npm run circuit:status --all

# Alert if any OPEN or HALF_OPEN
```

---

### Weekly Tasks (30 minutes)

**Monday Morning Maintenance**:

1. **Review Failed Actions**
   ```bash
   # Get last week's failures
   npm run analyze:failures --since 7d --group-by error
   
   # Look for patterns:
   # - Same error repeated
   # - Specific platform issues
   # - Time-based patterns
   ```

2. **Update Fallback Configurations**
   ```bash
   # Review fallback usage
   npm run analyze:fallbacks --since 7d
   
   # Update configs if fallback overused:
   npm run config:update-fallback
   ```

3. **Performance Review**
   ```bash
   # Check execution times
   npm run metrics:performance --since 7d
   
   # Alert if degradation:
   # - Avg execution time increase >20%
   # - P95 latency >5s
   # - Queue wait time >30s
   ```

4. **Update Monitoring Dashboards**
   ```bash
   # Refresh dashboard data
   npm run dashboard:refresh
   
   # Add new metrics if needed
   npm run dashboard:configure
   ```

5. **Test Disaster Recovery**
   ```bash
   # Run DR drill
   npm run dr:test --scenario database-failure
   
   # Verify:
   # - Backup restore works
   # - Failover successful
   # - Data integrity maintained
   ```

---

### Monthly Tasks (2 hours)

**First Monday of Month**:

1. **Analyze Performance Trends**
   ```bash
   # Generate monthly report
   npm run report:monthly --month last
   
   # Review:
   # - Success rate trends
   # - Latency trends
   # - Error patterns
   # - Platform reliability
   ```

2. **Optimize Retry Policies**
   ```bash
   # Analyze retry effectiveness
   npm run analyze:retries --since 30d
   
   # Update retry configs:
   # - Increase max retries if success on retry 4+
   # - Decrease if all retries fail
   # - Adjust backoff multiplier
   ```

3. **Update Runbook**
   ```bash
   # Review new issues from last month
   npm run issues:export --since 30d
   
   # Add to runbook:
   # - New error patterns
   # - New solutions discovered
   # - Updated procedures
   ```

4. **Security Review**
   ```bash
   # Check for security updates
   npm audit
   
   # Update dependencies
   npm update
   
   # Rotate API keys
   npm run security:rotate-keys --all
   ```

5. **Capacity Planning**
   ```bash
   # Analyze resource usage
   npm run analyze:capacity --since 30d
   
   # Check:
   # - Worker utilization
   # - Queue depth trends
   # - Rate limit usage
   # - Storage growth
   ```

6. **Backup Verification**
   ```bash
   # Test backup restore
   npm run backup:verify --last
   
   # Verify:
   # - Backup complete
   # - Restore successful
   # - Data integrity check passed
   ```

---

### Quarterly Tasks (4 hours)

**First Monday of Quarter**:

1. **Full System Audit**
2. **Load Testing**
3. **Security Penetration Test**
4. **Documentation Review**
5. **Team Training**

---

## Monitoring & Alerts

### Critical Alerts (Immediate Response)

| Alert | Threshold | Action |
|-------|-----------|--------|
| System Down | Health check fails 3 times | Follow [Emergency Procedure 1](#procedure-1-complete-system-outage) |
| All Platforms Failing | Success rate <50% for 5 min | Check external platform status, enable fallbacks |
| Database Down | Connection fails | Restart database, restore from backup if needed |
| Security Breach | Unauthorized access detected | Follow [Emergency Procedure 3](#procedure-3-security-incident) |

### High Priority Alerts (15 min Response)

| Alert | Threshold | Action |
|-------|-----------|--------|
| Success Rate Low | <90% for 15 min | Check circuit breakers, review errors |
| Queue Overload | >100 items for 10 min | Increase workers, check executor health |
| Circuit Breaker Open | Any platform for 5 min | Investigate platform health, consider fallback |
| Disk Space | >90% used | Clear logs, archive old data |

### Medium Priority Alerts (1 hour Response)

| Alert | Threshold | Action |
|-------|-----------|--------|
| High Latency | P95 >5s for 30 min | Optimize queries, check platform performance |
| Retry Rate High | >30% for 1 hour | Investigate platform issues, adjust retry policy |
| Fallback Usage High | >20% for 1 hour | Check primary platform, consider permanent fix |
| Memory High | >80% for 30 min | Restart services, investigate memory leaks |

---

## Troubleshooting Tools

### Built-in Commands

```bash
# Health & Status
npm run check:health [platform]     # Check system/platform health
npm run system:status                # Overall system status
npm run executor:status [platform]  # Executor status

# Queue Management
npm run queue:status                 # Current queue state
npm run queue:stuck                  # Find stuck items
npm run queue:clear                  # Clear queue
npm run queue:pause                  # Pause processing
npm run queue:resume                 # Resume processing

# Circuit Breakers
npm run circuit:status [platform]   # Circuit breaker state
npm run circuit:reset [platform]    # Reset circuit
npm run circuit:history             # Circuit state history

# Logs & Analysis
npm run logs:errors [--limit 50]    # Recent errors
npm run logs:workflow <id>          # Workflow execution log
npm run logs:platform <platform>    # Platform-specific logs
npm run analyze:failures            # Failure pattern analysis

# Workflow Management
npm run workflow:status <id>        # Workflow status
npm run workflow:rollback <id>      # Rollback workflow
npm run workflow:mark-resolved <id> # Mark as resolved
npm run workflow:state <id>         # View workflow state

# Authentication
npm run test:auth [platform]        # Test authentication
npm run validate:env                # Validate environment config

# Performance
npm run metrics:performance         # Performance metrics
npm run metrics:requests            # Request volume
npm run benchmark                   # Run benchmarks
```

### External Tools

**Monitoring**:
- **Grafana**: `http://grafana.company.com/orchestration`
- **Prometheus**: `http://prometheus.company.com`
- **ELK Stack**: `http://kibana.company.com`

**Alerting**:
- **PagerDuty**: https://company.pagerduty.com
- **Slack**: #ops-alerts

**Platform Status**:
- **Notion**: https://status.notion.so
- **Slack**: https://status.slack.com
- **Google**: https://status.cloud.google.com
- **Trello**: https://trello.status.atlassian.com

---

## Escalation Procedures

### Level 1: On-Call Engineer (24/7)
**Response Time**: 15 minutes  
**Handles**: All common issues in this runbook

**Contact**:
- PagerDuty: Auto-pages on critical alerts
- Slack: @oncall in #ops-alerts
- Email: oncall@company.com

### Level 2: Engineering Lead (Business Hours)
**Response Time**: 1 hour  
**Handles**: Complex issues, system architecture decisions

**Escalate When**:
- Issue not resolved in 1 hour
- Requires code changes
- Multiple platforms affected
- Data corruption suspected

**Contact**:
- Slack: @eng-lead
- Email: eng-lead@company.com
- Phone: +1-XXX-XXX-XXXX

### Level 3: CTO (Emergency Only)
**Response Time**: 30 minutes  
**Handles**: Business-critical outages, security incidents

**Escalate When**:
- Complete system down >2 hours
- Security breach confirmed
- Data loss >1 hour
- Regulatory impact

**Contact**:
- Phone: +1-XXX-XXX-XXXX (emergency only)
- Email: cto@company.com

### Escalation Decision Tree

```
Issue Detected
    │
    ├─ Can resolve with runbook?
    │   ├─ Yes → Follow runbook, document
    │   └─ No → Escalate to Level 2
    │
    ├─ Resolved in 1 hour?
    │   ├─ Yes → Close incident, post-mortem
    │   └─ No → Escalate to Level 2
    │
    ├─ Multiple platforms down?
    │   ├─ Yes → Escalate to Level 2 immediately
    │   └─ No → Continue with Level 1
    │
    ├─ Security incident?
    │   ├─ Yes → Escalate to Level 3 immediately
    │   └─ No → Follow normal escalation
    │
    └─ Business critical?
        ├─ Yes → Escalate to Level 3 if not resolved in 2 hours
        └─ No → Follow normal escalation
```

---

## Appendix

### A. Configuration Reference

**Environment Variables**:
```bash
# Core
NODE_ENV=production
LOG_LEVEL=info

# Queue
QUEUE_WORKERS=5
QUEUE_MAX_SIZE=1000

# Circuit Breaker
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT=30000

# Retry
MAX_RETRY_ATTEMPTS=3
RETRY_INITIAL_DELAY=1000
RETRY_BACKOFF_MULTIPLIER=2

# Idempotency
ENABLE_IDEMPOTENCY=true
IDEMPOTENCY_TTL=86400

# State
WORKFLOW_STATE_ENABLED=true
STATE_STORAGE=redis
```

### B. Log Locations

```
logs/
├── application.log          # Main application log
├── errors.log              # Error log
├── executors/
│   ├── notion.log
│   ├── trello.log
│   ├── slack.log
│   ├── drive.log
│   └── sheets.log
├── workflows/
│   └── executions.log
├── rollbacks.log           # Rollback operations
├── circuit-breakers.log    # Circuit breaker events
└── security.log            # Security events
```

### C. Useful Queries

**Find Actions by User**:
```bash
npm run logs:search --filter "userId:user-123" --since 24h
```

**Find Failed Workflows**:
```bash
npm run workflows:failed --since 7d --group-by reason
```

**Check Platform Downtime**:
```bash
npm run analyze:uptime --platform notion --since 30d
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-17 | Operations Team | Initial runbook creation |

---

**Last Updated**: October 17, 2025  
**Next Review**: November 17, 2025  
**Maintained by**: Operations Team

---

## Quick Links

- [Architecture Documentation](./ORCHESTRATION.md)
- [API Reference](./ORCHESTRATION_API.md)
- [Test Documentation](./PROMPT-24-EXECUTOR-TESTS.md)
- [Project Summary](./PROJECT-FINAL-SUMMARY.md)
- [Dashboard](http://dashboard.company.com/orchestration)
- [Monitoring](http://grafana.company.com/orchestration)
- [Status Page](http://status.company.com)
