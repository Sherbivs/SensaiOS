# Scheduled Service Restart - Setup Instructions

## Overview
GitHub Actions workflow that restarts the Render service every 12 hours via Render API.

**Purpose:** Force periodic restarts for memory hygiene without redeploying code.

**Schedule:** Every 12 hours at 00:00 UTC and 12:00 UTC

**Service:** `Infinity-Gauntlet` (ID: `srv-d3snk2ndiees73cn709g`)

## Setup Steps

### 1. Add GitHub Secret

Navigate to GitHub repository settings:
1. Go to https://github.com/Sherbivs/Infinity-Gauntlet/settings/secrets/actions
2. Click "New repository secret"
3. Name: `RENDER_API_KEY`
4. Value: `rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp`
5. Click "Add secret"

### 2. Verify Workflow

After committing `.github/workflows/scheduled-restart.yml`:
1. Go to https://github.com/Sherbivs/Infinity-Gauntlet/actions
2. Find "Scheduled Service Restart" workflow
3. Click "Run workflow" to test manually
4. Verify restart succeeds (should take ~2-3 minutes)

### 3. Monitor Scheduled Runs

- **Next scheduled run:** Check GitHub Actions page
- **Run history:** https://github.com/Sherbivs/Infinity-Gauntlet/actions/workflows/scheduled-restart.yml
- **Service dashboard:** https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g

## Workflow Behavior

### What happens during restart:
1. **Trigger:** GitHub Actions sends POST request to Render API `/v1/services/{serviceId}/restart`
2. **Graceful shutdown:** Application receives SIGTERM signal
   - Phase 1: Critical data persistence (Engine Write Buffer, security bot state, cooldowns)
   - Phase 2: Service shutdown (ServiceRegistry reverse-dependency order)
   - Discord webhook sent with shutdown notification (orange embed)
   - Health server stops (returns 503)
3. **Boot:** Application restarts with clean memory
   - Health server starts (returns 503 during init)
   - ServiceRegistry initializes
   - Discord client connects
   - Discord webhook sent with boot notification (green embed)
   - Health server returns 200 when `engineReady = true`
4. **Verification:** GitHub Actions polls service status every 10 seconds (max 5 minutes)
5. **Completion:** Workflow succeeds when service state is `running` or `available`

### If restart fails:
- Workflow fails and logs error
- Manual intervention required
- Check Render dashboard for details

## Manual Restart

Trigger restart manually via GitHub Actions:
1. Go to https://github.com/Sherbivs/Infinity-Gauntlet/actions/workflows/scheduled-restart.yml
2. Click "Run workflow" button
3. Select branch: `main`
4. Click "Run workflow"

Or use Render dashboard:
1. Go to https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
2. Click "Manual Deploy" → "Restart Service"

## Observability

### Discord Webhooks (if configured)
- Boot notification: Green embed with uptime, memory, service health
- Shutdown notification: Orange embed with trigger (`scheduled-restart`), uptime

### Health Endpoint
- Available at service internal network (port 3000)
- Returns 200 OK when healthy
- Returns 503 during init/shutdown

### Render Logs
```bash
# View logs via Render CLI
render logs --service srv-d3snk2ndiees73cn709g --tail

# Or via dashboard
https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g/logs
```

## Troubleshooting

### Workflow fails with "401 Unauthorized"
- Check RENDER_API_KEY secret is set correctly
- Verify API key is valid (test via `curl -H "Authorization: Bearer $KEY" https://api.render.com/v1/services`)

### Service doesn't restart
- Check Render dashboard for service status
- Verify service ID is correct: `srv-d3snk2ndiees73cn709g`
- Check Render service logs for errors

### Restart succeeds but service crashes
- Check application logs in Render dashboard
- Review uncaughtException logs for crash details
- Discord webhook will show crash notification (red embed)

## Disabling Scheduled Restarts

To disable automatic restarts:
1. Go to https://github.com/Sherbivs/Infinity-Gauntlet/blob/main/.github/workflows/scheduled-restart.yml
2. Edit file and comment out `schedule:` block:
   ```yaml
   # schedule:
   #   - cron: '0 */12 * * *'
   ```
3. Commit change
4. Manual restarts via `workflow_dispatch` still available

## Health Check Watchdog

In addition to scheduled restarts, a health check watchdog monitors service health:

**Workflow:** `.github/workflows/health-check-watchdog.yml`

**Behavior:**
- Runs every 5 minutes
- Pings health endpoint at `http://localhost:3000/health` (via Render Shell API)
- Records failures in temporary markers
- Triggers automatic restart after 3 consecutive failures (15 minutes of downtime)
- Clears failure markers when service becomes healthy

**Failure threshold:**
- 1st failure: Warning recorded
- 2nd failure: Warning recorded
- 3rd failure: **Automatic restart triggered**

**Recovery verification:**
- Polls service status every 10 seconds (max 5 minutes)
- Confirms service state is `running` or `available`
- Clears failure markers after successful recovery

**Manual inspection:**
```bash
# Check workflow runs
https://github.com/Sherbivs/Infinity-Gauntlet/actions/workflows/health-check-watchdog.yml

# View failure history
# Failure markers stored in workflow artifacts (cleared on recovery)
```

## Combined Restart Strategy

The system uses multiple restart layers:

1. **Scheduled restarts:** Every 12 hours for memory hygiene
2. **Health watchdog:** Auto-restart on 3 consecutive health check failures
3. **Render auto-restart:** Exit code 0 → immediate, others → 30s delay
4. **Discord webhooks:** Immediate visibility on all lifecycle events
5. **Health endpoint:** External monitors can detect downtime

## Notes

- Restart does NOT redeploy code (keeps current deployed version)
- Restart triggers graceful shutdown (data persistence guaranteed)
- Application tracks boot count and uptime in lifecycle notifications
- Health endpoint allows external monitors to detect downtime during restart
- Multiple restart layers ensure high availability without manual intervention
