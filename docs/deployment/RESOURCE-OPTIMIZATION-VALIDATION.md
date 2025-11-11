# Resource Optimization Deployment Validation

**Created**: 2025-11-11  
**Purpose**: Validate resource optimization changes across all Render services  
**Applies To**: Main bot + 6 workers + 1 database (8 services total)

---

## Overview

This checklist validates that resource optimization changes are working correctly and safely across the entire Render infrastructure. Use this after deploying any changes from the `RENDER-RESOURCE-OPTIMIZATION-PLAN.md`.

---

## Pre-Deployment Checklist

### Code Changes

- [ ] **Resource Monitor** updated (`src/services/resource-monitor.ts`)
  - [ ] New thresholds implemented (150/250 for resource counts)
  - [ ] Memory utilization tracking added
  - [ ] CPU monitoring integrated (if applicable)
  - [ ] Alert messages updated with emoji and plan context

- [ ] **Cache Configurations** updated (if applicable)
  - [ ] Engine L1 Cache size increased (20 MB → 60 MB)
  - [ ] Runtime Cache size increased (16 MB → 50 MB)
  - [ ] Write Buffer size increased (10K → 25K entries)

- [ ] **Pre-loading Logic** added (if applicable)
  - [ ] Species data pre-loaded at startup
  - [ ] Move data pre-loaded at startup
  - [ ] Type chart fully loaded

### Documentation

- [ ] **Optimization Plan** reviewed and understood
- [ ] **Standards Guide** reviewed for threshold values
- [ ] **Rollback Plan** documented and understood
- [ ] **Success Metrics** defined and baseline recorded

### Testing

- [ ] **Local Testing** completed
  - [ ] Service starts successfully
  - [ ] Resource monitor logs show new thresholds
  - [ ] Memory tracking displays correctly
  - [ ] No build errors or warnings

- [ ] **Lint & Type Check** passing
  - [ ] `npm run lint` passes with 0 errors
  - [ ] `npm run build` completes successfully

---

## Deployment Steps

### Phase 1: Deploy to Staging (If Available)

- [ ] **Deploy** to staging environment
- [ ] **Wait** for deploy to complete (green "Live" status)
- [ ] **Check** startup logs for errors
- [ ] **Monitor** for 1 hour minimum

### Phase 2: Deploy to Production (Service by Service)

For each service, follow this sequence:

#### Service: Main Bot (infinity-gauntlet-bots)

- [ ] **Deploy** via Render dashboard or `npm run task:render:deploy`
- [ ] **Wait** for "Live" status (typically 2-3 minutes)
- [ ] **Check** startup logs:
  ```
  Expected logs:
  ✅ "Resource Manager initialized"
  ✅ "Resource monitor started"
  ✅ "Memory utilization optimal: XXX MB (XX% of 512 MB)"
  ❌ NO "Memory exhaustion" or "Critical" alerts
  ```
- [ ] **Monitor** for 30 minutes before next service

#### Service: Database (infinity-gauntlet-db)

- [ ] **Check** current storage usage:
  ```sql
  SELECT pg_size_pretty(pg_database_size('infinity_gauntlet'));
  ```
- [ ] **Upgrade** plan if near limit (>80% full)
- [ ] **Verify** no connection errors in dependent services

#### Other Workers (Repeat for each)

- [ ] Outbox Worker (infinity-gauntlet-outbox)
- [ ] Cache Worker (infinity-gauntlet-cache)
- [ ] Data Pipeline Worker (infinity-gauntlet-data-pipeline)
- [ ] Security Bot (infinity-gauntlet-security)
- [ ] Pokédex Cache Worker (pokedex-cache-worker)

**Per worker:**
- [ ] Deploy
- [ ] Check startup logs
- [ ] Verify no errors
- [ ] Wait 15 minutes before next

---

## Post-Deployment Validation

### Immediate Checks (0-1 Hour)

#### 1. Service Health

For each service:

- [ ] **Status**: Green "Live" in Render dashboard
- [ ] **Logs**: No critical errors or warnings
- [ ] **Uptime**: Service running for 15+ minutes without crashes
- [ ] **Memory**: Within expected range (see service-specific targets below)

#### 2. Memory Utilization

**Main Bot** (srv-d3snk2ndiees73cn709g):
- [ ] **Current**: 154-243 MB (30-47% for Phase 2 changes)
- [ ] **Target** (Phase 3): 303 MB (59% after pre-loading)
- [ ] **Alert**: No emergency or critical alerts
- [ ] **Trend**: Flat line (no climbing slope)

**Other Workers**:
- [ ] **Current**: 150-200 MB (30-40%)
- [ ] **Alert**: No critical alerts
- [ ] **Trend**: Stable memory usage

#### 3. Resource Monitor Output

Check logs for resource monitor health checks:

```bash
# Expected output pattern
[INFO] 🛡️ Resource Monitor Started - Next check in 12 hours
[SYSTEM] Resource Health Check - Status: OK
[SYSTEM] Memory utilization optimal: 243 MB (47% of 512 MB, target: 60-75%)
[SYSTEM] Total resources: 25
[SYSTEM] Leak suspects: 0
```

- [ ] **Memory zone**: Shows "optimal" or "safe" (not "critical" or "emergency")
- [ ] **Resource counts**: Within new limits (150 warning, 250 critical)
- [ ] **Leak suspects**: 0 or very low (<5)
- [ ] **Execution time**: <1ms (negligible overhead)

#### 4. Cache Performance (If Applicable)

Check cache hit rates via `/ops engine` or `/ops cache`:

- [ ] **Engine L1 Cache**: 85-90% hit rate (up from 70%)
- [ ] **Runtime Cache**: 80-90% hit rate
- [ ] **Write Buffer**: Flush frequency 30-60s (down from 30s)

---

### Short-Term Monitoring (1-24 Hours)

#### Memory Graphs (Render Dashboard)

For each service, check the "Metrics" tab:

- [ ] **Memory graph**: Flat line or gentle sawtooth (NOT climbing)
- [ ] **CPU graph**: Normal levels (<30% average)
- [ ] **Restart count**: 0 (no crashes)

#### Alert Review

- [ ] **No emergency alerts**: 🚨 alerts should not fire
- [ ] **No critical alerts**: 🔴 alerts should not fire  
- [ ] **Warning alerts**: ⚠️ alerts acceptable if investigating
- [ ] **Info alerts**: ℹ️ alerts expected (underutilization, optimal range, etc.)

#### Gameplay Testing

- [ ] **Discord commands**: All commands respond normally
- [ ] **Battles**: Complete without errors
- [ ] **Encounters**: Spawn correctly
- [ ] **DM flows**: Starter selection works
- [ ] **Cache**: Fast lookups (<10ms for species/moves)

---

### Medium-Term Validation (24 Hours - 7 Days)

#### Stability Metrics

- [ ] **Uptime**: All services >24 hours without crashes
- [ ] **Memory**: Stable within target ranges (no leaks)
- [ ] **CPU**: Average <30%, peaks <50%
- [ ] **Disk**: No unexpected growth trends

#### Performance Improvements

- [ ] **Cache Hit Rate**: Sustained 85-90%
- [ ] **Query Latency**: Average <20ms (down from 50ms)
- [ ] **Database Queries**: Reduced by 30-60%
- [ ] **Response Time**: Discord commands faster

#### Resource Utilization

- [ ] **Main Bot**: 50-60% memory utilization (optimal zone)
- [ ] **Workers**: 30-40% memory utilization (safe zone)
- [ ] **Database**: <70% storage used

---

## Success Criteria

### Memory Utilization ✅

| Service | Baseline | Target | Current | Status |
|---------|----------|--------|---------|--------|
| **Main Bot** | 154 MB (30%) | 307 MB (60%) | ___ MB (___%) | ⏳ Pending |
| **Outbox** | 80 MB (16%) | 200 MB (40%) | ___ MB (___%) | ⏳ Pending |
| **Cache** | 100 MB (20%) | 200 MB (40%) | ___ MB (___%) | ⏳ Pending |
| **Data Pipeline** | 90 MB (18%) | 200 MB (40%) | ___ MB (___%) | ⏳ Pending |
| **Security** | 70 MB (14%) | 180 MB (35%) | ___ MB (___%) | ⏳ Pending |
| **Pokédex** | 85 MB (17%) | 200 MB (40%) | ___ MB (___%) | ⏳ Pending |

### Performance Improvements ✅

| Metric | Baseline | Target | Current | Status |
|--------|----------|--------|---------|--------|
| **Cache Hit Rate** | 70% | 90% | ___% | ⏳ Pending |
| **Query Latency** | 50ms | 10ms | ___ms | ⏳ Pending |
| **DB Queries/Min** | 1000 | 400 | ___ | ⏳ Pending |
| **Uptime** | 7 hours | 7+ days | ___ days | ⏳ Pending |

### Alert Health ✅

- [ ] **Zero** emergency alerts (🚨) in 7 days
- [ ] **Zero** critical alerts (🔴) in 7 days
- [ ] **<5** warning alerts (⚠️) per day
- [ ] **Expected** info alerts (ℹ️) for normal operations

---

## Rollback Triggers

### Immediate Rollback (Critical Issues)

Rollback immediately if ANY of these occur:

- [ ] 🚨 **Emergency alert**: Memory >90% (460+ MB)
- [ ] 🔴 **Service crash**: OOM error or repeated restarts
- [ ] 💥 **Functionality broken**: Commands fail, battles error out
- [ ] 📉 **Performance regression**: Response times >2x slower

### Rollback Procedure

```bash
# Option 1: Git revert
git revert <optimization-commit-hash>
git push origin main
# Render auto-deploys the rollback

# Option 2: Render dashboard rollback
# 1. Go to: https://dashboard.render.com/services/<service-id>
# 2. Click "Deploys" tab
# 3. Find previous deploy (before optimization)
# 4. Click "Redeploy" button

# Option 3: Configuration-only rollback (faster)
# Revert specific config changes in:
# - src/config/engine-db-config.ts
# - src/services/cache/facade.ts
# - src/services/engine-write-buffer.ts
# Then restart service
```

### Partial Rollback (Specific Optimizations)

If only certain optimizations cause issues, revert selectively:

**Revert Cache Increases**:
```typescript
// src/config/engine-db-config.ts
export const L1_CACHE_SIZE_LIMIT_BYTES = 20 * 1024 * 1024; // Back to 20 MB

// src/services/cache/facade.ts
const DEFAULT_MAX_MEMORY_BYTES = 16 * 1024 * 1024; // Back to 16 MB
const DEFAULT_MAX_MEMORY_ITEMS = 512; // Back to 512
```

**Revert Buffer Increases**:
```typescript
// src/services/engine-write-buffer.ts
const MAX_QUEUE_SIZE = 10000; // Back to 10K
```

**Revert Threshold Changes**:
```typescript
// src/services/resource-monitor.ts
const MONITOR_CONFIG = {
  thresholds: {
    totalResourcesWarning: 50,     // Back to 50
    totalResourcesCritical: 100,   // Back to 100
    // Remove memory/CPU thresholds if causing alert fatigue
  },
};
```

---

## Monitoring Commands

### SSH into Service

```bash
# Connect to main bot
npm run task:render:ssh-connect

# OR use service ID directly
ssh <service-id>@ssh.virginia.render.com
```

### Check Memory Usage

```bash
# Node process memory (RSS)
ps aux | grep node | grep -v grep | awk '{print "RSS:", $6/1024 "MB"}'

# Memory limit (should be 512 MB)
cat /sys/fs/cgroup/memory/memory.limit_in_bytes | awk '{print $1/1024/1024 "MB"}'

# Current usage
cat /sys/fs/cgroup/memory/memory.usage_in_bytes | awk '{print $1/1024/1024 "MB"}'

# Utilization percentage
echo "scale=2; $(cat /sys/fs/cgroup/memory/memory.usage_in_bytes) / $(cat /sys/fs/cgroup/memory/memory.limit_in_bytes) * 100" | bc
```

### Check Resource Stats

```bash
# View intelligent logger output (auto-refreshes every 15s)
# Look for "Memory" and "Resource Manager" sections

# OR query resource manager API (if /ops endpoint available)
curl http://localhost:3000/ops/resources | jq '{
  memory_mb: (.memory.rss / 1024 / 1024),
  utilization_pct: ((.memory.rss / (512 * 1024 * 1024)) * 100),
  resources: {
    total: .total,
    byType: .byType,
    leakSuspects: (.leakSuspects | length)
  }
}'
```

### Check Cache Performance

```bash
# Engine cache stats
curl http://localhost:3000/ops/engine | jq '.cache'

# Runtime cache stats
curl http://localhost:3000/ops/cache | jq
```

### Check Logs (Render Dashboard)

```bash
# Via Render CLI (if installed)
render logs --service <service-id> --tail

# OR use PowerShell script
npm run task:render:logs
```

---

## Troubleshooting

### Memory Above 75% (Warning Zone)

**Symptoms**: Memory 384-435 MB, ⚠️ warning alerts

**Actions**:
1. Check cache hit rates - low hits = wasted memory
2. Review buffer flush frequency - verify 30-60s
3. Check resource counts - verify <150 total
4. Consider reducing cache sizes by 10-20%

**Monitor for**: 1 hour - if stays <85%, acceptable

### Memory Above 85% (Critical Zone)

**Symptoms**: Memory 435-460 MB, 🔴 critical alerts

**Actions**:
1. **Immediate**: Check for memory leaks (resource growth >50%)
2. **Reduce caches**: Cut L1 Cache to 40 MB, Runtime to 30 MB
3. **Flush buffers**: Reduce Write Buffer to 15K entries
4. **Monitor closely**: Every 5 minutes

**Escalation**: If >460 MB (90%), initiate rollback

### Memory Above 90% (Emergency)

**Symptoms**: Memory >460 MB, 🚨 emergency alerts

**Actions**:
1. **IMMEDIATE ROLLBACK**: Execute rollback procedure
2. **Alternative**: Upgrade to Standard plan (2 GB) temporarily
3. **Post-mortem**: Analyze what caused spike

### Underutilization (<50%)

**Symptoms**: Memory <256 MB, ℹ️ underutilization alerts

**Actions**:
1. This is informational, not a problem
2. Consider Phase 3 optimizations (pre-loading data)
3. Increase caches gradually (10-20 MB at a time)
4. Re-validate after each change

### High CPU Usage (>50%)

**Symptoms**: CPU consistently above 50%

**Actions**:
1. Check for infinite loops in battle engine
2. Profile hot paths with `node --prof`
3. Review Discord event handlers
4. Consider moving CPU work to dedicated worker

---

## Sign-Off

### Deployment Completed By

- **Name**: ___________________
- **Date**: ___________________
- **Commit Hash**: ___________________

### 24-Hour Validation

- **Status**: ⏳ Pending / ✅ Passed / ❌ Failed
- **Validated By**: ___________________
- **Date**: ___________________
- **Notes**: ___________________

### 7-Day Validation

- **Status**: ⏳ Pending / ✅ Passed / ❌ Failed
- **Validated By**: ___________________
- **Date**: ___________________
- **Notes**: ___________________
- **Final Memory Utilization**: ___________________
- **Uptime Achieved**: ___ days
- **Performance Improvement**: ___% faster

---

## References

- **Optimization Plan**: `docs/deployment/RENDER-RESOURCE-OPTIMIZATION-PLAN.md`
- **Standards Guide**: `docs/deployment/RESOURCE-MONITOR-STANDARDS.md`
- **Current Usage**: `docs/deployment/production-resource-usage-2025-11-11.md`
- **Render Dashboard**: https://dashboard.render.com
- **Main Bot Service**: https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g

---

**Status**: 📋 Checklist Ready  
**Created**: 2025-11-11  
**Owner**: DevOps / Site Reliability Engineering
