# Scheduled Service Restart - Setup Instructions

## Overview
GitHub Actions workflow that restarts the Render service every 12 hours via Render API.

**Purpose:** Force periodic restarts for memory hygiene without redeploying code.

**Schedule:** Every 12 hours at 00:00 UTC and 12:00 UTC (~60 runs/month)

**Service:** `Infinity-Gauntlet` (ID: `srv-d3snk2ndiees73cn709g`)

**Operational Necessity:** This workflow is part of production monitoring infrastructure. The 60 runs/month (plus health check watchdog 1,230 runs/month + agent health 720 runs/month) provide automated crash detection and recovery within 4,000 GitHub Actions minutes/month budget.

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

**Budget-Optimized Production Monitoring** — Detects crashes and triggers automatic recovery within 4,000 min/month budget.

**Workflow:** `.github/workflows/health-check-watchdog.yml`

**Schedule:** Every 35 minutes (41 runs/day, ~1,230 runs/month, ~3,075 minutes/month)

**Budget Trade-off:** Reduced from 5-minute intervals (8,640 runs/month, 17,280-25,920 minutes) to 35-minute intervals to fit 4,000 minute/month budget while allowing agent health to run hourly. Crash detection time increased from 15 min → 105 min max (acceptable for stable Render services).

**Behavior:**
- Runs every 35 minutes (budget-optimized from 5 minutes)
- Pings health endpoint at `http://localhost:3000/health` (via Render Shell API)
- Records failures in temporary markers
- Triggers automatic restart after 3 consecutive failures (105 minutes of downtime max)
- Clears failure markers when service becomes healthy

**Failure threshold:**
- 1st failure: Warning recorded
- 2nd failure: Warning recorded
- 3rd failure: **Automatic restart triggered** (prevents extended downtime)

**Recovery verification:**
- Polls service status every 10 seconds (max 5 minutes)
- Confirms service state is `running` or `available`
- Clears failure markers after successful recovery

**Why 35 Minutes (Not 5 or 30)?**
- Budget constraint: 4,000 GitHub Actions minutes/month maximum
- 5-minute intervals: ~17,280-25,920 minutes/month (way over budget)
- 30-minute intervals: ~3,600 minutes/month (leaves only 220 min for agent health at 2-hour intervals)
- 35-minute intervals: ~3,075 minutes/month (allows agent health to run hourly at 720 min/month)
- Trade-off: 105-minute max downtime acceptable for stable services

**Manual Triggering:**
For urgent health checks between scheduled runs, manually trigger via:
```bash
# GitHub Actions UI
https://github.com/Sherbivs/Infinity-Gauntlet/actions/workflows/health-check-watchdog.yml

# Or use /ops commands in Discord for immediate status
/ops stats
```

## Combined Restart Strategy

The system uses multiple restart layers for reliability within budget constraints:

1. **Scheduled restarts:** Every 12 hours for memory hygiene (~180 minutes/month)
2. **Health watchdog:** Auto-restart on 3 consecutive health check failures every 35 min (~3,075 minutes/month)
3. **Render auto-restart:** Exit code 0 → immediate, others → 30s delay
4. **Discord webhooks:** Immediate visibility on all lifecycle events
5. **Health endpoint:** External monitors can detect downtime

**Total Monitoring Budget:** ~3,975 minutes/month (2,010 workflow runs/month, within 4,000 min limit)

**Budget Breakdown:**
- Health watchdog: 1,230 runs × ~2.5 min = ~3,075 minutes (77%)
- Agent health: 720 runs × ~1 min = ~720 minutes (18%)
- Scheduled restart: 60 runs × ~3 min = ~180 minutes (5%)

**Trade-offs for Budget Compliance:**
- Crash detection: 15 min → 105 min max (reduced monitoring frequency)
- Agent health: 15 min → 1 hour (improved from 2-hour intervals)
- Manual `/ops` commands available for immediate debugging when needed

## Notes

- Restart does NOT redeploy code (keeps current deployed version)
- Restart triggers graceful shutdown (data persistence guaranteed)
- Application tracks boot count and uptime in lifecycle notifications
- Health endpoint allows external monitors to detect downtime during restart
- Multiple restart layers ensure high availability within GitHub Actions budget constraints
- **Workflow frequencies optimized for 4,000 min/month budget** — balances cost vs monitoring coverage
