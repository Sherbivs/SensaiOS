# Resource Monitor Production Validation Guide

**Date:** 2025-11-10  
**Service ID:** srv-d3snk2ndiees73cn709g  
**Status:** Deployed (commit cb93352), awaiting manual log verification

---

## Quick Validation Steps

### Step 1: Open Render Dashboard
1. Go to https://dashboard.render.com
2. Navigate to "Services"
3. Click on "Infinity-Gauntlet-bots" (or search for service ID: srv-d3snk2ndiees73cn709g)

### Step 2: View Logs
1. Click the "Logs" tab
2. Set filter to "Last 1 hour" or "Last 24 hours"
3. Search for these keywords (use Ctrl+F):

### Step 3: Verify Resource Manager Initialization
**Search for:** `Resource Manager initialized`

**Expected Log:**
```
[INFO] Error learning worker started
[INFO] Resource Manager initialized       ← Should see this
[INFO] Resource monitor started
```

**What to Check:**
- ✅ Log appears WITHOUT errors
- ✅ Appears after "Error learning worker started"
- ✅ Appears before "Resource monitor started"

**If Missing:**
- ❌ Resource Manager failed to initialize
- Check for error logs containing "ResourceManager"
- Deployment may have failed or rolled back

### Step 4: Verify Resource Monitor Started
**Search for:** `Resource monitor started`

**Expected Log:**
```
[INFO] Resource Manager initialized
[INFO] Resource monitor started           ← Should see this
[SYSTEM] ResourceMonitor Started - Next check in 12 hours
```

**What to Check:**
- ✅ Log appears WITHOUT errors
- ✅ Appears after "Resource Manager initialized"
- ✅ Followed by "ResourceMonitor Started" message

**If Missing:**
- ❌ Resource Monitor failed to start
- Check for error logs containing "ResourceMonitor" or "startResourceMonitoring"
- May indicate initialization order bug

### Step 5: Verify First Health Check
**Search for:** `Resource Health Check`

**Expected Log:**
```
[SYSTEM] Resource Health Check - Status: OK | Resources: 12 | Leaks: 0 | Exec: 0.8ms
```

**What to Check:**
- ✅ Status is "OK" (not "WARNING" or "CRITICAL")
- ✅ Resources count is reasonable (expect 5-30 for baseline)
- ✅ Leaks count is 0 (fresh startup should have no leak suspects)
- ✅ Execution time is <1ms (lightweight requirement)

**If Status is WARNING/CRITICAL:**
- ⚠️ May indicate baseline resource count is higher than expected
- Check threshold values in log message
- May need to tune thresholds in resource-monitor.ts

**If Missing:**
- ❌ Health check didn't execute
- Check for error logs containing "Health Check" or "runHealthCheck"
- May indicate Resource Manager not initialized

---

## What to Look For

### ✅ SUCCESS INDICATORS

**Startup Sequence:**
```
[timestamp] [INFO] Stopping error learning worker
[timestamp] [INFO] Resource Manager initialized
[timestamp] [INFO] Resource monitor started
[timestamp] [SYSTEM] ResourceMonitor Started - Next check in 12 hours
[timestamp] [SYSTEM] Resource Health Check - Status: OK | Resources: 12 | Leaks: 0 | Exec: 0.8ms
```

**Key Success Signals:**
1. All three initialization logs appear in order
2. No error logs between them
3. First health check executes successfully
4. Status is "OK" with reasonable resource count
5. Execution time <1ms

### ❌ FAILURE INDICATORS

**Initialization Errors:**
```
[ERROR] Cannot read property 'initialize' of undefined
[ERROR] resourceManager is not defined
[ERROR] Cannot read property 'getStats' of undefined
```

**Startup Errors:**
```
[ERROR] Resource Manager initialization failed
[ERROR] Failed to start resource monitoring
[ERROR] startResourceMonitoring is not a function
```

**Health Check Errors:**
```
[ERROR] Resource Monitor Health Check Failed
[ERROR] Cannot read property 'getStats' of undefined
[ALERT] CRITICAL Resource Health - Total resources: 105 (threshold: 100)
```

---

## Troubleshooting Guide

### Issue 1: "Resource Manager initialized" Not Found

**Possible Causes:**
1. Deployment failed or rolled back
2. Code didn't deploy (check deployment status)
3. Application crashed before initialization

**How to Fix:**
1. Check deployment status in Render Dashboard
2. Verify commit cb93352 is deployed
3. Look for crash/error logs before Resource Manager initialization
4. Re-deploy if necessary: `pwsh -File scripts/render_deploy.ps1 -Service infinity-gauntlet-bots`

### Issue 2: "Resource monitor started" Not Found

**Possible Causes:**
1. Resource Manager initialization failed
2. Import statement missing or incorrect
3. startResourceMonitoring() call missing

**How to Fix:**
1. Verify "Resource Manager initialized" appears first
2. Check for errors between Manager and Monitor initialization
3. Verify src/index.ts has correct import and call
4. Re-deploy if code issue found

### Issue 3: "Resource Health Check" Not Found

**Possible Causes:**
1. Resource Monitor didn't start successfully
2. First health check failed silently
3. getStats() call failed

**How to Fix:**
1. Search for "[ERROR]" logs around Resource Monitor startup
2. Check if "ResourceMonitor Started" log appears
3. Look for "Health Check" errors in logs
4. May need to add more error logging to resource-monitor.ts

### Issue 4: Status is "WARNING" or "CRITICAL"

**Possible Causes:**
1. Baseline resource count is higher than threshold (50/100)
2. Old resources from previous runs not cleaned up
3. Thresholds set too low for production environment

**How to Fix:**
1. Note the actual resource count in log message
2. If count is reasonable (<50), ignore warning
3. If count is high (>50), investigate resource types:
   - Search logs for "byType" to see resource breakdown
   - Check if timers/listeners are being cleaned up properly
4. If persistent, tune thresholds in resource-monitor.ts:
   ```typescript
   totalResourcesWarning: 100,      // Increase from 50
   totalResourcesCritical: 200,     // Increase from 100
   ```

### Issue 5: Execution Time >1ms

**Possible Causes:**
1. Large number of resources being tracked
2. Slow getStats() call
3. Logger is blocking

**How to Fix:**
1. Check resource count in log message
2. If resources >100, performance impact expected
3. If <100, investigate getStats() performance
4. May need to optimize resource-manager.ts getStats()

---

## Expected Timeline

### Immediate (Within 1 minute of deployment)
- ✅ "Resource Manager initialized" log
- ✅ "Resource monitor started" log
- ✅ "ResourceMonitor Started" log
- ✅ First "Resource Health Check" log

### 12 Hours After Deployment
- ✅ Second "Resource Health Check" log
- ✅ Resource count similar to first check (growth rate <50%)
- ✅ Leak suspects remain low (<5)

### 7 Days After Deployment
- ✅ Self-cleaning removes old snapshots
- ✅ Snapshot count stays at ~14 (2 per day × 7 days)
- ✅ No memory growth from snapshot accumulation

---

## Manual Validation Checklist

Use this checklist when reviewing Render Dashboard logs:

### Startup Validation
- [ ] "Resource Manager initialized" log found
- [ ] No errors between Manager and Monitor initialization
- [ ] "Resource monitor started" log found
- [ ] "ResourceMonitor Started - Next check in 12 hours" log found
- [ ] First health check executed within 1 second of startup

### Health Check Validation
- [ ] "Resource Health Check" log found
- [ ] Status is "OK" (not WARNING/CRITICAL)
- [ ] Resource count is <50 (baseline)
- [ ] Leak suspects is 0 (fresh startup)
- [ ] Execution time is <1ms

### Performance Validation
- [ ] No startup errors related to Resource Manager/Monitor
- [ ] Application started successfully after integration
- [ ] No memory/CPU spikes after deployment
- [ ] Bot commands still work normally

### Long-term Validation (After 12+ hours)
- [ ] Second health check executed on schedule
- [ ] Resource count growth <50% since first check
- [ ] Leak suspects remain low (<5)
- [ ] No false-positive alerts
- [ ] Snapshot count increasing linearly (2 per day)

---

## Next Steps After Validation

### If All Checks Pass ✅
1. Monitor for 24 hours to confirm stability
2. Wait for second health check (12 hours)
3. Mark validation complete in deployment checklist
4. Update docs/resource-manager-deployment-validation.md with results

### If Any Checks Fail ❌
1. Document the failure in logs (screenshot recommended)
2. Check troubleshooting guide above for solutions
3. Create GitHub issue with:
   - Service ID: srv-d3snk2ndiees73cn709g
   - Commit: cb93352
   - Error logs (full text)
   - Expected vs actual behavior
4. Rollback if application is broken:
   ```bash
   # Via Render Dashboard: Deployments → Select previous deployment → Redeploy
   ```

---

## API Access (Alternative Method)

If you have RENDER_API_KEY configured and SSH fails:

```powershell
# Load API key
$env:RENDER_API_KEY = "rnd_uLeIvSqACqBNQAjN0uD8foTXPAcw"

# Query logs (if API endpoint works)
$headers = @{ "Authorization" = "Bearer $($env:RENDER_API_KEY)" }
Invoke-RestMethod -Uri "https://api.render.com/v1/services/srv-d3snk2ndiees73cn709g/logs" -Headers $headers
```

**Note:** Render API endpoints may vary. If this fails, use Dashboard web UI.

---

## Contact & Support

**Issues/Questions:**
- Check docs/resource-manager-deployment-validation.md
- Check docs/resource-monitor-integration-summary.md
- Create GitHub Issue with logs and error details

**Quick Links:**
- Render Dashboard: https://dashboard.render.com
- Service Direct Link: https://dashboard.render.com/web/srv-d3snk2ndiees73cn709g
- Logs Direct Link: https://dashboard.render.com/web/srv-d3snk2ndiees73cn709g/logs

---

**Last Updated:** 2025-11-10  
**Validation Status:** Awaiting manual verification via Render Dashboard  
**Next Review:** 2025-11-11 (check for second health check after 12 hours)
