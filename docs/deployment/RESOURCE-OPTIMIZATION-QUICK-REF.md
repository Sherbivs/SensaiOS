# Resource Optimization - Quick Reference

**Purpose**: Quick lookup for Render resource optimization thresholds and targets  
**For detailed information**: See `RENDER-RESOURCE-OPTIMIZATION-PLAN.md`

---

## 🎯 Target Memory Utilization

**Current**: 154 MB (30%) - **UNDERUTILIZED**  
**Target**: 307 MB (60%) - **OPTIMAL**  
**Plan Limit**: 512 MB (100%)

```
┌────────────────────────────────────────────────────────────┐
│ 512 MB Render Starter Plan                                 │
├────────────────────────────────────────────────────────────┤
│ 🚨 90-100%  EMERGENCY  (460-512 MB) ░░░░░░░░░░░░░░░░░░░░░│
│ 🔴 85-90%   CRITICAL   (435-460 MB) ░░░░░░░░░░░░░░░░░░░░░│
│ ⚠️  75-85%   WARNING    (384-435 MB) ░░░░░░░░░░░░░░░░░░░░░│
│ ✅ 60-75%   OPTIMAL    (307-384 MB) ██████████████████████│ ← TARGET
│ ℹ️  50-60%   SAFE       (256-307 MB) ████████████████████ │
│ ⚠️  <50%     UNDERUTIL  (<256 MB)    ████                  │ ← CURRENT (30%)
└────────────────────────────────────────────────────────────┘
```

---

## 📊 Quick Stats

### Current State

| Metric | Value | Status |
|--------|-------|--------|
| **Memory** | 154 MB / 512 MB | 30% ⚠️ Underutilized |
| **CPU** | 1.7% / 50% | 3% ✅ Normal |
| **Disk** | 3.5 MB / 1 GB | 0.4% ✅ Excellent |
| **Uptime** | 3.5 min | ⏳ Fresh deploy |

### After Optimization (Target)

| Metric | Value | Change |
|--------|-------|--------|
| **Memory** | 307 MB / 512 MB | +100% (+153 MB) |
| **Cache Hit Rate** | 90% | +20% |
| **Query Latency** | 10ms | -80% |
| **DB Queries/Min** | 400 | -60% |

---

## 🔧 Configuration Changes

### Phase 2: Cache Increases

```typescript
// src/config/engine-db-config.ts
export const L1_CACHE_SIZE_LIMIT_BYTES = 60 * 1024 * 1024; // +40 MB (was 20 MB)

// src/services/cache/facade.ts
const DEFAULT_MAX_MEMORY_BYTES = 50 * 1024 * 1024; // +34 MB (was 16 MB)
const DEFAULT_MAX_MEMORY_ITEMS = 2000; // +1488 (was 512)

// src/services/engine-write-buffer.ts
const MAX_QUEUE_SIZE = 25000; // +15K (was 10K)
```

**Expected Memory**: 154 → 243 MB (47%)

### Phase 3: Pre-loading

```typescript
// Startup sequence: Pre-load all species + moves
// +30 MB species data
// +20 MB move data
// +10 MB type chart
```

**Expected Memory**: 243 → 303 MB (59%) ✅ **TARGET REACHED**

---

## 🚨 Alert Thresholds

### Memory (512 MB Plan)

| Zone | Range | Alert | Action |
|------|-------|-------|--------|
| Emergency | 460-512 MB (90-100%) | 🚨 | **Immediate rollback** |
| Critical | 435-460 MB (85-90%) | 🔴 | Scale or optimize |
| Warning | 384-435 MB (75-85%) | ⚠️ | Monitor closely |
| **Optimal** | **307-384 MB (60-75%)** | ✅ | **Target range** |
| Safe | 256-307 MB (50-60%) | ✅ | Acceptable |
| Underutilized | <256 MB (<50%) | ℹ️ | Consider optimization |

### CPU (0.5 vCPU Plan)

| Zone | Range | Alert | Action |
|------|-------|-------|--------|
| Emergency | 90-100% | 🚨 | Immediate action |
| Critical | 70-90% | 🔴 | Optimize hot paths |
| Warning | 50-70% | ⚠️ | Monitor trends |
| Normal | 30-50% | ✅ | Good |
| Idle | 0-30% | ℹ️ | Light load |

---

## 📝 Deployment Checklist

### Pre-Deployment

- [ ] Resource monitor updated (`src/services/resource-monitor.ts`)
- [ ] Cache configs updated (Engine, Runtime, Write Buffer)
- [ ] Local testing complete (no build errors)
- [ ] Documentation reviewed

### Post-Deployment (Per Service)

- [ ] Deploy completes successfully (green "Live" status)
- [ ] Startup logs show no errors
- [ ] Memory increases to target range (50-60%)
- [ ] No critical alerts triggered
- [ ] Monitor for 30 minutes before next service

### 7-Day Validation

- [ ] Memory stable within optimal zone (60-75%)
- [ ] No emergency or critical alerts
- [ ] Cache hit rate sustained >85%
- [ ] Uptime >7 days without crashes
- [ ] Performance improvements validated

---

## 🔄 Rollback Commands

### Full Rollback (Git)

```bash
git revert <optimization-commit>
git push origin main
# Render auto-deploys
```

### Full Rollback (Render Dashboard)

1. Go to: https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
2. Click "Deploys" tab
3. Find previous deploy (before optimization)
4. Click "Redeploy" button

### Partial Rollback (Config Only)

```typescript
// src/config/engine-db-config.ts
export const L1_CACHE_SIZE_LIMIT_BYTES = 20 * 1024 * 1024; // Back to 20 MB

// src/services/cache/facade.ts
const DEFAULT_MAX_MEMORY_BYTES = 16 * 1024 * 1024; // Back to 16 MB
const DEFAULT_MAX_MEMORY_ITEMS = 512; // Back to 512

// src/services/engine-write-buffer.ts
const MAX_QUEUE_SIZE = 10000; // Back to 10K
```

Then restart service (faster than full redeploy).

---

## 🔍 Monitoring Commands

### SSH into Service

```bash
npm run task:render:ssh-connect
# OR
ssh srv-d3snk2ndiees73cn709g@ssh.virginia.render.com
```

### Check Memory

```bash
# RSS (Resident Set Size)
ps aux | grep node | grep -v grep | awk '{print "RSS:", $6/1024 "MB"}'

# Plan limit (should be 512 MB)
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

# OR query API
curl http://localhost:3000/ops/resources | jq
curl http://localhost:3000/ops/engine | jq '.cache'
curl http://localhost:3000/ops/cache | jq
```

---

## 🎯 Success Criteria

### Memory Utilization

- ✅ Main Bot: 307 MB (60%) - Current: 154 MB (30%)
- ✅ Workers: 200 MB (40%) - Current: 70-100 MB (14-20%)

### Performance

- ✅ Cache Hit Rate: 90% (from 70%)
- ✅ Query Latency: 10ms (from 50ms)
- ✅ DB Queries: 400/min (from 1000/min)

### Stability

- ✅ Uptime: 7+ days (no crashes)
- ✅ Memory: Flat line (no leaks)
- ✅ Alerts: Zero critical/emergency

---

## 📚 Documentation

### Comprehensive Guides

1. **RENDER-RESOURCE-OPTIMIZATION-PLAN.md** (725 lines)
   - Current state analysis
   - Optimization opportunities
   - 6-phase implementation roadmap

2. **RESOURCE-MONITOR-STANDARDS.md** (580 lines)
   - Standardized thresholds
   - Alert severity levels
   - Health check patterns

3. **RESOURCE-OPTIMIZATION-VALIDATION.md** (450 lines)
   - Deployment checklist
   - Validation gates
   - Troubleshooting guides

4. **RESOURCE-OPTIMIZATION-SUMMARY.md**
   - Project overview
   - Key findings
   - Implementation status

### Quick Access

- **Render Dashboard**: https://dashboard.render.com
- **Main Bot**: https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
- **All Docs**: `docs/deployment/RESOURCE-*.md`

---

## 📞 Escalation

### Rollback Triggers

- 🚨 Memory >90% (460+ MB) → **IMMEDIATE ROLLBACK**
- 🔴 Service crashes (OOM) → **ROLLBACK**
- 💥 Commands fail → **ROLLBACK**
- 📉 2x slower → **ROLLBACK**

### Contact

- **Primary**: DevOps / Site Reliability Engineering
- **Dashboard**: Render dashboard for metrics
- **Logs**: `npm run task:render:logs`

---

**Created**: 2025-11-11  
**Status**: ✅ Ready for Use  
**Next Step**: Phase 2 - Cache Optimization Deployment

