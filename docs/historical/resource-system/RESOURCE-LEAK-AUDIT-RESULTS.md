# Resource Leak Audit - Initial Results & Action Plan

**Date:** 2025-11-10  
**Audit Run:** First automated scan complete  
**Status:** 🔴 2 CRITICAL + 🟡 1 HIGH issues found

---

## 🚨 Critical Findings

### 🔴 CRITICAL #1: EventEmitter Listeners (9 files without cleanup)

**Impact:** Unbounded memory growth, same pattern as fixed leak (d63f9ad)  
**Risk:** High - Can cause OOM crashes  
**Priority:** P0 - Fix immediately

**Files to Audit:**
- 1 EventEmitter created: `src/services/error-tracker.ts` ✅ ALREADY FIXED
- 9 files with `.on()` listeners without `.off()` cleanup

**Action Required:**
1. Identify which 9 files have `.on()` without `.off()`
2. Add listener reference storage (instance properties)
3. Add cleanup in shutdown handlers
4. Set maxListeners on all EventEmitters
5. Test shutdown cleanup works

**Target:** Complete within 24 hours

---

### 🔴 CRITICAL #2: Timers (25 created, only 20 cleared)

**Impact:** 5 timers never cleared, accumulate over time  
**Risk:** High - Memory leak, performance degradation  
**Priority:** P0 - Fix immediately

**Files with Timers (25 total):**
```
src/bot/state/persistence.js
src/bot/dripAlerts.js
src/bot/Main.js
src/cache/pokemonCache.js
src/runtime/autoSync.ts
src/runtime/databaseRecovery.ts
src/services/cache/facade.ts
src/services/events/EventTracker.ts
src/services/engine-cache.ts
src/services/engine-write-buffer.ts
src/services/engine-write-db.ts
src/services/error-alerting.ts
src/services/error-recovery.ts
src/shared/utils/async-utils.ts
src/shared/logBuffer.ts
src/shared/pg-connection.ts
src/shared/pg-transaction.ts
src/shared/prisma.ts
src/shared/worker-runtime.ts
src/utils/cliStatus.js
src/utils/intelligent-logger.ts ✅ ALREADY FIXED (writeInterval cleared)
src/utils/logger.js
src/workers/engine-workers.ts ✅ ALREADY FIXED (4 worker intervals cleared)
src/workers/error-learning-worker.ts
src/index.ts
```

**Action Required:**
1. Audit each file for `setInterval()` / `setTimeout()`
2. Verify `clearInterval()` / `clearTimeout()` called in shutdown
3. Store timer IDs as instance properties
4. Add cleanup to shutdown handlers
5. Test all timers cleared on process exit

**Target:** Complete within 48 hours

---

### 🟡 HIGH #1: HTTP/WebSocket Connections (13 clients, only 10 with timeouts)

**Impact:** 3 HTTP clients without timeout, can hang indefinitely  
**Risk:** Medium - Connection exhaustion, hangs  
**Priority:** P1 - Fix within week

**Files with HTTP/WS (13 total):**
```
src/bot/battle/actions.ts
src/bot/battle/challenge.ts
src/bot/battle/conclude.ts
src/bot/wilds/controls.ts
src/bot/Main.js (Discord.js WebSocket)
src/cache/gitStore.js
src/cache/pokemonCache.js
src/services/error-alerting.ts
src/services/pokemonService.js
src/index.ts
scripts/ops/dex_v2_alert_dry_run.ts
scripts/ops/simulate_flag_rollout.ts
scripts/seed_dex.ts
```

**Action Required:**
1. Identify 3 files missing timeout configuration
2. Add AbortController + setTimeout for all fetch() calls
3. Set reasonable timeout (5-30 seconds depending on API)
4. Test timeout enforcement works
5. Add retry logic with exponential backoff

**Target:** Complete within 7 days

---

## ✅ Categories Passing (5 total)

### 2️⃣ Map/Set Collections: ✅ OK
- 28 Maps/Sets created
- 6 private Maps/Sets
- 11 with size limits
- **Status:** More collections have limits than private maps, low risk

### 4️⃣ Database Connections: ✅ OK
- 7 Prisma clients created
- 8 $disconnect() calls
- **Status:** More disconnects than clients (scripts call disconnect multiple times)

### 5️⃣ File Operations: ✅ OK
- 0 streams created (using fs.promises)
- 11 .close() calls
- **Status:** No descriptor leaks detected

### 6️⃣ Child Processes: ✅ OK
- 11 processes spawned
- 38 kill handlers
- **Status:** Sufficient cleanup handlers

### 8️⃣ Cache Implementations: ✅ OK
- 21 cache implementations
- 65 TTL references
- **Status:** Most caches have TTL, low risk

---

## 📋 Immediate Action Plan (Next 7 Days)

### Day 1 (Today): EventEmitter Audit

**Tasks:**
1. [ ] Identify 9 files with `.on()` listeners
2. [ ] For each file:
   - [ ] Store listener reference as instance property
   - [ ] Add cleanup in shutdown handler
   - [ ] Test listener removed on shutdown
3. [ ] Run audit again, confirm count drops to 0
4. [ ] Commit fixes with test coverage

**Success Criteria:** EventEmitter risk changes from 🔴 CRITICAL to ✅ OK

---

### Day 2: Timer Cleanup Audit

**Tasks:**
1. [ ] Audit 25 timer files individually
2. [ ] Identify 5 files missing `clearInterval/clearTimeout`
3. [ ] Add timer ID storage (instance properties)
4. [ ] Add cleanup in shutdown handlers
5. [ ] Test all timers cleared on SIGTERM/SIGINT
6. [ ] Run audit again, confirm 25 created = 25 cleared

**Success Criteria:** Timer risk changes from 🔴 CRITICAL to ✅ OK

---

### Days 3-5: HTTP Timeout Enforcement

**Tasks:**
1. [ ] Audit 13 HTTP/WS files
2. [ ] Identify 3 files missing timeout
3. [ ] Add AbortController + timeout for all fetch() calls
4. [ ] Test timeout enforcement (mock slow API)
5. [ ] Add retry logic with exponential backoff
6. [ ] Run audit again, confirm 13 clients = 13 timeouts

**Success Criteria:** HTTP risk changes from 🟡 HIGH to ✅ OK

---

### Days 6-7: Verification & Documentation

**Tasks:**
1. [ ] Run full audit: `pwsh -File scripts/audit-resource-leaks.ps1 -Detailed -Export`
2. [ ] Verify all categories show ✅ OK
3. [ ] Update `docs/RESOURCE-LEAK-AUDIT.md` with results
4. [ ] Create best practices guide
5. [ ] Add ESLint rules for common patterns
6. [ ] Document lessons learned

**Success Criteria:** All 8 categories pass audit

---

## 🔍 Detailed Investigation Commands

### Find EventEmitter Listeners Without Cleanup

```bash
# Find all .on() calls
grep -rn "\.on\(" src/ --include="*.ts" --include="*.js" | grep -v "\.off\("

# Cross-reference with shutdown/cleanup methods
grep -rn "shutdown\|cleanup\|stop\|destroy" src/ --include="*.ts" --include="*.js"
```

### Find Timers Without Cleanup

```bash
# Find setInterval/setTimeout
grep -rn "setInterval\|setTimeout" src/ --include="*.ts" --include="*.js"

# Find clearInterval/clearTimeout
grep -rn "clearInterval\|clearTimeout" src/ --include="*.ts" --include="*.js"

# Find shutdown handlers
grep -rn "SIGTERM\|SIGINT\|beforeExit" src/ --include="*.ts" --include="*.js"
```

### Find HTTP Clients Without Timeout

```bash
# Find fetch/axios calls
grep -rn "fetch\(|axios\." src/ --include="*.ts" --include="*.js"

# Find timeout configuration
grep -rn "timeout:|AbortController|signal:" src/ --include="*.ts" --include="*.js"
```

---

## 📊 Success Metrics

### Before Fixes (Current State)

| Category | Status | Risk | Files Affected |
|----------|--------|------|----------------|
| **EventEmitters** | 🔴 CRITICAL | 9 listeners no cleanup | 9 files |
| **Timers** | 🔴 CRITICAL | 5 timers uncleaned | 25 files |
| **HTTP** | 🟡 HIGH | 3 clients no timeout | 13 files |
| Maps/Sets | ✅ OK | Low | 28 files |
| Database | ✅ OK | Low | 7 files |
| Files | ✅ OK | Low | 0 files |
| Processes | ✅ OK | Low | 11 files |
| Caches | ✅ OK | Low | 21 files |

### After Fixes (Target - Day 7)

| Category | Status | Risk | Files Fixed |
|----------|--------|------|-------------|
| **EventEmitters** | ✅ OK | 0 leaks | 9 files |
| **Timers** | ✅ OK | 0 uncleaned | 5 files |
| **HTTP** | ✅ OK | 0 no timeout | 3 files |
| Maps/Sets | ✅ OK | Low | - |
| Database | ✅ OK | Low | - |
| Files | ✅ OK | Low | - |
| Processes | ✅ OK | Low | - |
| Caches | ✅ OK | Low | - |

**Total Files to Fix:** 17 files across 3 categories

---

## 🎯 Expected Outcomes

### Memory Stability
- **Before:** Memory leaks from EventEmitters + timers
- **After:** No unbounded growth, stable memory usage

### Uptime
- **Before:** OOM crashes every 7 hours (EventEmitter leak)
- **After:** 7+ days stable operation

### Production Reliability
- **Before:** Manual restarts required
- **After:** Zero resource-related crashes

### Developer Experience
- **Before:** No leak detection, reactive fixes
- **After:** Automated audit, proactive prevention

---

## 🔄 Next Audit Run

**Schedule:** Run audit daily during fixes, then weekly after completion

```bash
# Daily during fixes
pwsh -File scripts/audit-resource-leaks.ps1 -Detailed -Export

# Weekly maintenance
pwsh -File scripts/audit-resource-leaks.ps1 -Export
```

**Monitoring:** Export JSON results to track progress over time

---

## 📚 References

- **Audit Documentation:** `docs/RESOURCE-LEAK-AUDIT.md`
- **Audit Script:** `scripts/audit-resource-leaks.ps1`
- **Memory Leak Fix:** `docs/MEMORY-LEAK-ANALYSIS.md` (EventEmitter example)
- **Validation Guide:** `docs/MEMORY-LEAK-DEPLOYMENT-VALIDATION.md`

**Status:** Initial audit complete, action plan ready ✅  
**Next:** Start Day 1 EventEmitter audit immediately 🚀
