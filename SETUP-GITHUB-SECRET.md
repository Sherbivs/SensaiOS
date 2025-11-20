# ⚠️ CRITICAL NEXT STEP - Add GitHub Secret

## What was just deployed:

✅ **Scheduled 12-hour restart workflow** (`.github/workflows/scheduled-restart.yml`)
- Automatically restarts Render service every 12 hours
- Next scheduled run: 00:00 UTC (midnight)
- Service ID: `srv-d3snk2ndiees73cn709g`

## ⚠️ ACTION REQUIRED - Add GitHub Secret

The workflow **will fail** until you add the Render API key as a GitHub secret.

### Steps to complete setup:

1. **Go to GitHub repository secrets page:**
   https://github.com/Sherbivs/Infinity-Gauntlet/settings/secrets/actions

2. **Click "New repository secret"**

3. **Add secret:**
   - Name: `RENDER_API_KEY`
   - Value: `rnd_c5ddKBupx4Z0HGWvPIU92NICsZkp`

4. **Click "Add secret"**

5. **Test the workflow (optional but recommended):**
   - Go to https://github.com/Sherbivs/Infinity-Gauntlet/actions/workflows/scheduled-restart.yml
   - Click "Run workflow"
   - Select branch: `main`
   - Click "Run workflow"
   - Should complete successfully in ~2-3 minutes

## What happens when it runs:

1. **Trigger:** GitHub Actions calls Render API to restart service
2. **Graceful shutdown:** 
   - Discord webhook: Orange embed with shutdown notification
   - Health endpoint returns 503
   - Critical data saved (Engine Write Buffer, security bot state, cooldowns)
3. **Restart:**
   - Discord webhook: Green embed with boot notification
   - Health endpoint returns 200 when ready
4. **Verification:** GitHub Actions confirms service is running

## Current restart safety layers:

✅ **Layer 1:** HTTP health endpoint (`/health` on port 3000)
✅ **Layer 2:** Discord webhooks (boot/shutdown/crash notifications)
✅ **Layer 3:** Scheduled 12-hour restarts (GitHub Actions → Render API)
🔄 **Layer 4:** Render's auto-restart policy (exit code 0 → immediate restart)
⏳ **Layer 5 (Planned):** Health check watchdog (auto-restart on failures)

## Observability:

- **GitHub Actions runs:** https://github.com/Sherbivs/Infinity-Gauntlet/actions
- **Render dashboard:** https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
- **Discord webhooks:** Configure via `LIFECYCLE_WEBHOOK_URL` env var
- **Health endpoint:** Available at service internal network (port 3000)

---

**Status:** ⏳ Waiting for GitHub secret to be added
**Priority:** Medium (workflow won't run until secret is added)
**Impact:** Scheduled restarts will fail silently until secret is configured
