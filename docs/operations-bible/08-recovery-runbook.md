# Recovery Runbook — Infinity Gauntlet

**Last Updated:** 2025-11-17
**Purpose:** Manual recovery procedures for production incidents, service failures, and emergency situations.

---

## Table of Contents

1. [Emergency Contacts](#emergency-contacts)
2. [Quick Diagnosis](#quick-diagnosis)
3. [Restart Procedures](#restart-procedures)
4. [Rollback Procedures](#rollback-procedures)
5. [Common Failure Scenarios](#common-failure-scenarios)
6. [Monitoring Checklist](#monitoring-checklist)
7. [Escalation Paths](#escalation-paths)

---

## 1. Emergency Contacts

### Primary Owner
- **Name:** DripTVDD (Discord: @DripTVDD)
- **Role:** Project Owner, Primary Developer
- **When to Contact:** Production outages, data loss, security incidents

### Escalation Path
1. Check Discord webhooks for automatic notifications (boot/shutdown/crash)
2. Check GitHub Actions workflow runs for scheduled restart/watchdog failures
3. Contact DripTVDD via Discord DM if webhooks fail
4. Open GitHub issue for non-urgent incidents

---

## 2. Quick Diagnosis

### Step 1: Check Health Endpoint
```bash
# Via Render Shell API (preferred for worker services)
curl -X POST https://api.render.com/v1/services/srv-d3snk2ndiees73cn709g/shell \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command":"curl http://localhost:3000/health"}'

# Expected healthy response:
# {"status":"healthy","timestamp":"2025-11-17T10:00:00.000Z","uptime_ms":3600000,...}

# Expected unhealthy response:
# {"status":"initializing",...} OR {"status":"shutting_down",...}
```

### Step 2: Check Render Logs
```bash
# Via Render Dashboard
# https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g/logs

# Via CLI (if installed)
render logs infinity-gauntlet --tail 100

# Look for:
# - "Uncaught exception" (crash)
# - "Out of memory" (OOM kill)
# - "Database connection failed" (database issues)
# - "Discord API error" (rate limits, timeouts)
```

### Step 3: Check Discord Webhooks
Check DripTVDD DMs for lifecycle notifications:
- **Green embed:** Boot notification (service started successfully)
- **Orange embed:** Shutdown notification (graceful shutdown with trigger)
- **Red embed:** Crash notification (uncaught exception, stack trace included)

### Step 4: Check GitHub Actions
Check recent workflow runs:
- **Scheduled Restart:** https://github.com/Sherbivs/Infinity-Gauntlet/actions/workflows/scheduled-restart.yml
- **Health Check Watchdog:** https://github.com/Sherbivs/Infinity-Gauntlet/actions/workflows/health-check-watchdog.yml

Look for:
- ❌ Failed health checks (3 consecutive failures = restart triggered)
- ✅ Successful restarts (service recovered within 5 minutes)
- ⏱️ Timeout failures (service didn't recover after restart)

### Step 5: Check Restart Metrics
```bash
# Via /ops restarts command in Discord
/ops restarts

# Look for:
# - High crash rate (>5%)
# - Frequent restarts (>10 per day)
# - Short uptimes (<1 hour average)
```

---

## 3. Restart Procedures

### Method 1: Scheduled Restart (Automated - Every 12 Hours)
**When:** Routine memory hygiene, no immediate action needed.

GitHub Actions automatically restarts service every 12 hours (00:00 UTC and 12:00 UTC).

### Method 2: Health Check Watchdog (Automated - On Failure)
**When:** Service becomes unhealthy, auto-recovery triggered.

GitHub Actions monitors health endpoint every 5 minutes. After 3 consecutive failures (15 minutes downtime), automatically triggers restart via Render API.

### Method 3: Manual Restart via GitHub Actions
**When:** Immediate restart needed, use GitHub UI.

1. Navigate to: https://github.com/Sherbivs/Infinity-Gauntlet/actions/workflows/scheduled-restart.yml
2. Click "Run workflow" button (top right)
3. Select `main` branch
4. Click "Run workflow" (green button)
5. Monitor workflow run (should complete in ~2-5 minutes)
6. Verify service health via `/ops restarts` or health endpoint

### Method 4: Manual Restart via Render Dashboard
**When:** GitHub Actions unavailable, use Render UI.

1. Navigate to: https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
2. Click "Manual Deploy" dropdown → "Restart Service"
3. Wait for service to enter "running" state (~1-3 minutes)
4. Verify health via Discord bot commands or health endpoint

### Method 5: Manual Restart via Render API
**When:** Full automation needed, use CLI/script.

```bash
# Restart service via Render API
curl -X POST https://api.render.com/v1/services/srv-d3snk2ndiees73cn709g/restart \
  -H "Authorization: Bearer $RENDER_API_KEY"

# Poll service status (wait for "running" state)
while true; do
  status=$(curl -s https://api.render.com/v1/services/srv-d3snk2ndiees73cn709g \
    -H "Authorization: Bearer $RENDER_API_KEY" | jq -r '.state')
  echo "Service state: $status"
  [ "$status" = "running" ] && break
  sleep 10
done

# Verify health
curl -X POST https://api.render.com/v1/services/srv-d3snk2ndiees73cn709g/shell \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command":"curl http://localhost:3000/health"}'
```

### Method 6: Manual Restart via Discord Bot (If Available)
**When:** Bot is responsive but needs memory hygiene.

```
# /ops restarts - Check current uptime and restart history
# (No manual restart command implemented yet - future enhancement)
```

---

## 4. Rollback Procedures

### Scenario: Recent Deploy Caused Service Failure

#### Step 1: Identify Last Known Good Commit
```bash
# Check recent commits
git log --oneline -10

# Check Render deployment history
# https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g/deploys
```

#### Step 2: Revert to Previous Commit
```bash
# Option A: Revert specific commit (creates new commit)
git revert <bad-commit-hash>
git push origin main

# Option B: Hard reset to previous commit (destructive)
git reset --hard <good-commit-hash>
git push --force origin main
```

#### Step 3: Trigger Redeploy
Render will automatically redeploy when `main` branch changes. Monitor deployment:
- Dashboard: https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g/deploys
- Expected time: ~3-5 minutes
- Verify health after deploy completes

#### Step 4: Verify Rollback Success
1. Check health endpoint (should return 200 OK)
2. Check Discord webhooks (should receive green boot notification)
3. Check `/ops restarts` (should show successful boot)
4. Monitor logs for errors (should be clean)

---

## 5. Common Failure Scenarios

### Scenario 1: Out of Memory (OOM Kill)
**Symptoms:**
- Service exits unexpectedly (no graceful shutdown notification)
- Render logs show "Out of memory" or "Process killed"
- Frequent restarts with short uptimes (<30 minutes)

**Diagnosis:**
```bash
# Check memory usage via /ops memory command
/ops memory

# Look for:
# - RSS > 1.5 GB (approaching 2 GB limit)
# - Heap usage > 80%
# - Discord.js cache growth (50-200 MB)
```

**Recovery Steps:**
1. Trigger immediate restart (Method 3 or 4)
2. Monitor memory growth via `/ops memory` after restart
3. If problem persists, investigate memory leaks:
   - Check Discord.js cache size (should be <200 MB)
   - Check log buffer size (should be <1 MB)
   - Check Engine DB cache size (should be <20 MB)
4. Consider manual cache cleanup: `/ops cache --cleanup=true`

**Prevention:**
- Scheduled 12-hour restarts prevent memory accumulation
- Memory guardian triggers cleanup at 75% threshold (1.5 GB)
- Discord.js cache sweeping limits cache growth

### Scenario 2: Database Connection Failure
**Symptoms:**
- Service fails to boot (no Discord ready event)
- Logs show "database connection refused" or "timeout"
- Health endpoint returns 503 "initializing"

**Diagnosis:**
```bash
# Check database connectivity via Render Shell
curl -X POST https://api.render.com/v1/services/srv-d3snk2ndiees73cn709g/shell \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command":"psql $PROD_DATABASE_URL -c \"SELECT 1;\""}'

# Check Prisma heartbeat status via /ops stats
/ops stats
```

**Recovery Steps:**
1. Verify `PROD_DATABASE_URL` environment variable is set correctly
2. Check Render database service status (https://dashboard.render.com)
3. If database is down, wait for Render to recover (usually <5 minutes)
4. If database is healthy, trigger service restart (Method 3 or 4)
5. If problem persists, check Prisma connection pool settings

**Prevention:**
- Prisma heartbeat monitoring detects connection failures
- Database failover via `RENDER_DB_EXTERNAL_URL` fallback
- Retry logic with exponential backoff (5 retries, max 30s delay)

### Scenario 3: Discord API Rate Limiting
**Symptoms:**
- Bot stops responding to commands
- Logs show "429 Too Many Requests" errors
- Health endpoint returns 200 OK (service is healthy, Discord is throttled)

**Diagnosis:**
```bash
# Check recent Discord API errors via /ops errors
/ops errors --category DISCORD --since 1h

# Look for:
# - 429 status codes
# - "rate limit" error messages
# - Frequent request patterns
```

**Recovery Steps:**
1. Wait for rate limit to reset (typically 1-10 minutes)
2. Review code for unnecessary Discord API calls
3. Implement request batching/debouncing if needed
4. DO NOT restart service (won't fix rate limiting)

**Prevention:**
- Discord.js client handles rate limiting automatically
- Caching reduces redundant API calls
- Intentional delays between bulk operations

### Scenario 4: Uncaught Exception (Crash)
**Symptoms:**
- Red crash notification in Discord webhook
- Service restarts automatically (via Render auto-restart or health watchdog)
- Stack trace visible in logs

**Diagnosis:**
```bash
# Check crash details via Discord webhook (red embed)
# Check logs for full stack trace
render logs infinity-gauntlet --tail 200

# Check /ops errors for CRITICAL severity
/ops errors --severity CRITICAL --since 24h
```

**Recovery Steps:**
1. Service auto-restarts within 1-3 minutes (Render auto-restart + health watchdog)
2. Review crash notification for error details
3. If crash repeats, investigate root cause:
   - Check ErrorTracker dashboard via `/ops errors`
   - Review recent code changes via `git log`
   - Check for data corruption or invalid state
4. Apply hotfix or rollback if necessary

**Prevention:**
- Comprehensive error handling in all async functions
- Try-catch blocks around critical operations
- ErrorTracker captures errors before they become crashes
- Graceful degradation (non-critical failures don't crash service)

### Scenario 5: Scheduled Restart Failure
**Symptoms:**
- GitHub Actions workflow fails to complete
- Service doesn't restart at scheduled time (00:00 or 12:00 UTC)
- Workflow logs show API errors or timeouts

**Diagnosis:**
```bash
# Check workflow run logs
# https://github.com/Sherbivs/Infinity-Gauntlet/actions/workflows/scheduled-restart.yml

# Common failures:
# - RENDER_API_KEY secret missing/invalid
# - Service ID incorrect
# - Render API timeout (>5 minutes)
```

**Recovery Steps:**
1. Verify GitHub secret `RENDER_API_KEY` is set correctly:
   - Navigate to: https://github.com/Sherbivs/Infinity-Gauntlet/settings/secrets/actions
   - Confirm `RENDER_API_KEY` exists and value is: `rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp`
2. Manually trigger restart via Method 3 (GitHub Actions manual trigger)
3. If manual trigger also fails, use Method 4 (Render Dashboard)
4. Review workflow logs for specific error messages
5. Fix workflow configuration if needed, commit changes

**Prevention:**
- Regular testing of manual workflow triggers
- Monitoring of workflow run history
- Fallback to health check watchdog (automatic recovery)

### Scenario 6: Health Check Watchdog False Positive
**Symptoms:**
- Watchdog triggers restart despite service being healthy
- Logs show successful health checks, but workflow sees failures
- Service restarts unnecessarily

**Diagnosis:**
```bash
# Check health endpoint directly
curl http://localhost:3000/health  # (via Render Shell)

# Check workflow logs for false failure reasons
# https://github.com/Sherbivs/Infinity-Gauntlet/actions/workflows/health-check-watchdog.yml
```

**Recovery Steps:**
1. Review watchdog workflow logs (failure markers, health check responses)
2. Adjust failure threshold if needed (default: 3 failures in 15 minutes)
3. Verify health endpoint is returning 200 OK consistently
4. Consider increasing timeout values in workflow

**Prevention:**
- Health endpoint returns 503 during initialization (expected)
- Watchdog ignores single failures (requires 3 consecutive)
- Failure markers are time-windowed (15 minutes)

---

## 6. Monitoring Checklist

### Daily Monitoring (Automated)
- ✅ Scheduled restart (00:00 and 12:00 UTC) - GitHub Actions
- ✅ Health check watchdog (every 5 minutes) - GitHub Actions
- ✅ Discord webhooks (boot/shutdown/crash) - Lifecycle Notifier

### Weekly Monitoring (Manual)
- [ ] Review restart metrics: `/ops restarts`
  - Total restarts this week
  - Crash count (should be 0)
  - Average uptime (should be >6 hours)
- [ ] Review error dashboard: `/ops errors --since 7d`
  - Total unique errors (should be <10)
  - CRITICAL/HIGH severity errors (should be 0)
  - Error rate trend (should be stable or decreasing)
- [ ] Review memory usage: `/ops memory`
  - RSS usage (should be <1.5 GB)
  - Heap usage (should be <80%)
  - Growth patterns (should be stable)
- [ ] Review GitHub Actions workflow runs
  - Scheduled restart success rate (should be 100%)
  - Health check watchdog false positives (should be 0)

### Monthly Monitoring (Strategic)
- [ ] Review uptime percentage (should be >99%)
- [ ] Review crash rate (should be <1%)
- [ ] Review average uptime per session (should be >6 hours)
- [ ] Plan infrastructure upgrades if needed (memory, CPU, storage)

---

## 7. Escalation Paths

### Level 1: Self-Service (Immediate Response)
**Tools:** Discord bot commands, GitHub Actions, Render Dashboard
**Response Time:** <5 minutes
**Actions:**
- Restart service via GitHub Actions or Render Dashboard
- Check health endpoint via Discord commands
- Review recent logs via Render Dashboard

### Level 2: Developer Investigation (Within 1 Hour)
**Contact:** DripTVDD via Discord DM
**Response Time:** <1 hour (during active hours)
**Actions:**
- Review crash notifications and stack traces
- Analyze error patterns via `/ops errors`
- Apply hotfixes or rollback via git
- Monitor recovery via `/ops restarts`

### Level 3: Deep Debugging (Within 24 Hours)
**Contact:** DripTVDD + GitHub Issue
**Response Time:** <24 hours
**Actions:**
- Memory profiling via `/ops memory`
- Heap snapshot analysis
- Database query optimization
- Code refactoring for memory leaks
- Infrastructure scaling (upgrade Render plan)

### Level 4: Emergency Escalation (Critical Production Outage)
**Contact:** Immediate Discord DM + GitHub Issue + Email (if available)
**Response Time:** ASAP
**Criteria:**
- Service down >30 minutes
- Data loss or corruption
- Security breach
- Repeated automatic restarts (>10 per hour)
**Actions:**
- Full system rollback to last known good state
- Emergency deploy of hotfix branch
- Database restore from backup (if needed)
- Post-mortem analysis and prevention plan

---

## Quick Reference: Recovery Decision Tree

```
Service is DOWN
├─ Health endpoint returns 503 "initializing"
│  └─ WAIT: Service is booting (normal, <2 minutes)
├─ Health endpoint returns 503 "shutting_down"
│  └─ WAIT: Service is restarting (normal, <3 minutes)
├─ Health endpoint returns 500 or connection refused
│  ├─ Check Discord webhooks for crash notification (red embed)
│  │  └─ YES: Review stack trace, wait for auto-restart (1-3 min)
│  │  └─ NO: Trigger manual restart (Method 3 or 4)
│  └─ If service doesn't recover in 5 minutes, escalate to Level 2
└─ Health endpoint times out (no response)
   └─ Render service is down, check Dashboard, escalate to Level 2

Service is HEALTHY but misbehaving
├─ Bot not responding to commands
│  ├─ Check Discord API rate limiting (429 errors in logs)
│  │  └─ WAIT: Rate limit resets automatically (1-10 minutes)
│  └─ Check database connection (Prisma heartbeat via /ops stats)
│     └─ IF DOWN: Wait for database recovery, trigger restart if >5 minutes
├─ High memory usage (>1.5 GB)
│  └─ Trigger manual restart (Method 3 or 4), monitor growth after restart
└─ Frequent restarts (>5 per hour)
   └─ Investigate crash cause via /ops errors, apply hotfix or rollback
```

---

## Additional Resources

- **Render Dashboard:** https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
- **GitHub Actions:** https://github.com/Sherbivs/Infinity-Gauntlet/actions
- **Scheduled Restart Docs:** `docs/operations-bible/07-scheduled-restart.md`
- **Memory Optimization:** `docs/MEMORY-OPTIMIZATION-2025-11-17.md`
- **Discord Cache Management:** `docs/DISCORD-CACHE-MANAGEMENT.md`
- **Architecture Overview:** `README.md`

---

**End of Runbook** | **Version:** 1.0 | **Last Updated:** 2025-11-17
