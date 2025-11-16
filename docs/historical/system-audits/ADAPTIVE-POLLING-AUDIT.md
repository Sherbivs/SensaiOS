# Adaptive Polling & Change Detection Audit

**Date:** 2025-11-13  
**Purpose:** System-wide audit for unlimited polling/writing operations  
**Status:** 🔍 Analysis Complete → Implementation Pending

## Executive Summary

Audited all `setInterval` operations across the codebase to identify services that need adaptive polling and change detection controls. Found **8 periodic workers** that could benefit from smart controls.

**Key Findings:**
- ✅ **1 service already has controls:** Engine Cache (just implemented)
- ⚠️ **2 services CRITICAL for controls:** Write Buffer Flusher, Write-DB Validator
- ℹ️ **5 services LOW priority:** Cache refresh delegated, error learning (hourly), logger flush (5s), resource monitor (integrated), misc
- ❌ **0 services with uncontrolled unlimited operations**

## Detailed Analysis

### 1. Engine Cache Refresh (✅ IMPLEMENTED)

**Location:** `src/services/engine-cache.ts`  
**Interval:** 1 hour → 2 hours → 4 hours (adaptive)  
**Status:** ✅ **COMPLETE** (2025-11-13)

**Controls Implemented:**
- Change detection via checksum comparison
- Adaptive polling (doubles interval when stable)
- Tracks consecutive no-change refreshes
- Resets to base interval on data change
- Max interval cap at 4 hours

**Why It Needed Controls:**
- Pokemon data is mostly static (rarely changes)
- Hourly refresh was wasting CPU on identical data
- No way to detect if refresh was actually necessary

**Outcome:**
- Reduced CPU usage during stable periods
- Smart polling adapts to data volatility
- Maintains quick response when data changes

---

### 2. Write Buffer Flusher (⚠️ CRITICAL)

**Location:** `src/workers/engine-workers.ts` (WriteBufferFlusher)  
**Current Interval:** 10 seconds (fixed)  
**Status:** ⚠️ **NEEDS ADAPTIVE CONTROLS**

**Current Behavior:**
```typescript
// Flushes every 10 seconds UNCONDITIONALLY
this.interval = setInterval(async () => {
  await this.execute();
}, EngineDbConfig.writeBufferFlushIntervalMs); // 10,000ms
```

**Why It Needs Controls:**
1. **Flushes even when queues empty** → Wasted I/O operations
2. **No detection if anything to flush** → Unnecessary Write-DB writes
3. **Static interval regardless of activity** → Doesn't adapt to game load
4. **Potential disk wear** → Empty flushes still trigger SQLite operations

**Recommended Implementation:**

```typescript
// Add tracking
private consecutiveEmptyFlushes: number = 0;
private currentFlushIntervalMs: number = baseInterval;

// In execute()
const bufferStats = engineWriteBuffer.getStats();
if (bufferStats.totalQueueSize === 0) {
  this.consecutiveEmptyFlushes++;
  
  // After 5 empty flushes, double interval (up to 60s max)
  if (this.consecutiveEmptyFlushes >= 5) {
    this.adjustFlushInterval('increase');
  }
} else {
  // Data present, reset to base interval
  if (this.currentFlushIntervalMs !== baseInterval) {
    this.adjustFlushInterval('reset');
  }
  this.consecutiveEmptyFlushes = 0;
  
  // Perform flush
  await engineWriteBuffer.flush();
}
```

**Benefits:**
- Skip unnecessary disk writes when no battles active
- Reduce I/O during low-activity periods
- Maintain fast flush during high-activity (battles)
- Extend disk lifespan (fewer write cycles)

**Adaptive Strategy:**
- **Base interval:** 10 seconds (when data present)
- **Empty flush threshold:** 5 consecutive empty checks
- **Interval doubling:** 10s → 20s → 40s → 60s (max)
- **Reset trigger:** Any data in queues resets to 10s

**Priority:** 🔴 **HIGH** (affects disk I/O and resource usage)

---

### 3. Write-DB Validator (⚠️ CRITICAL)

**Location:** `src/workers/engine-workers.ts` (WriteDbValidatorWorker)  
**Current Interval:** 10 minutes (fixed)  
**Status:** ⚠️ **NEEDS ADAPTIVE CONTROLS**

**Current Behavior:**
```typescript
// Validates and uploads every 10 minutes UNCONDITIONALLY
this.interval = setInterval(async () => {
  await this.execute();
}, EngineDbConfig.writeDbValidatorIntervalMs); // 600,000ms
```

**Why It Needs Controls:**
1. **Validates even if Write-DB unchanged** → Wasted validation cycles
2. **Uploads even if no new data** → Unnecessary PROD writes
3. **Static interval regardless of activity** → Doesn't adapt to battle frequency
4. **Potential PROD pollution** → Empty uploads waste PROD resources

**Recommended Implementation:**

```typescript
// Add tracking
private lastWriteDbChecksum: string | null = null;
private consecutiveNoChangeValidations: number = 0;
private currentValidationIntervalMs: number = baseInterval;

// In execute()
const writeDb = await import('../services/engine-write-db.js');
const writeDbStats = await writeDb.getStats();

// Calculate checksum based on row counts + timestamps
const currentChecksum = this.calculateWriteDbChecksum(writeDbStats);

// Detect change
const dataChanged = currentChecksum !== this.lastWriteDbChecksum;

if (!dataChanged) {
  this.consecutiveNoChangeValidations++;
  
  // After 3 no-change cycles, double interval (up to 60 minutes max)
  if (this.consecutiveNoChangeValidations >= 3) {
    this.adjustValidationInterval('increase');
  }
  
  log('info', 'Write-DB Validator: NO DATA CHANGE, skipping validation', {
    checksum: currentChecksum?.substring(0, 8),
    consecutiveNoChanges: this.consecutiveNoChangeValidations,
  });
  
  return; // Skip validation + upload
}

// Data changed, perform validation + upload
this.consecutiveNoChangeValidations = 0;
this.lastWriteDbChecksum = currentChecksum;

if (this.currentValidationIntervalMs !== baseInterval) {
  this.adjustValidationInterval('reset');
}

// ... existing validation logic ...
```

**Benefits:**
- Skip validation when Write-DB unchanged
- Reduce PROD uploads (only when new data)
- Adapt to battle frequency (more battles = more frequent validation)
- Save database query costs (validation queries PROD)

**Adaptive Strategy:**
- **Base interval:** 10 minutes (when data present)
- **No-change threshold:** 3 consecutive no-change cycles
- **Interval doubling:** 10m → 20m → 40m → 60m (max)
- **Reset trigger:** Any new data resets to 10m
- **Checksum:** Hash of (battleLogCount + moveUsageCount + anomalyCount + lastModified timestamp)

**Priority:** 🔴 **HIGH** (affects PROD writes and validation costs)

---

### 4. Cache Refresh Worker (ℹ️ LOW PRIORITY)

**Location:** `src/workers/engine-workers.ts` (CacheRefreshWorker)  
**Current Interval:** 1 hour (fixed)  
**Status:** ✅ **ALREADY HANDLED** (delegates to Engine Cache)

**Current Behavior:**
```typescript
// Delegates to engineCache.refresh()
this.interval = setInterval(async () => {
  await engineCache['refresh'](); // Calls engine-cache.ts refresh()
}, EngineDbConfig.l1CacheRefreshIntervalMs);
```

**Why No Additional Controls Needed:**
- Worker just calls `engineCache.refresh()`
- Engine Cache already has adaptive polling (just implemented)
- Change detection happens inside Engine Cache
- Worker is just a scheduler wrapper

**Recommendation:** ✅ **NO ACTION NEEDED** (already covered by Engine Cache controls)

---

### 5. Error Learning Worker (ℹ️ LOW PRIORITY)

**Location:** `src/workers/error-learning-worker.ts`  
**Current Interval:** 1 hour (fixed)  
**Status:** ℹ️ **LOW PRIORITY** (acceptable without controls)

**Current Behavior:**
```typescript
// Analyzes error patterns hourly
this.interval = setInterval(async () => {
  await this.execute(); // Calls errorLearning.updateKnowledgeBase()
}, 60 * 60 * 1000);
```

**Why Low Priority:**
1. **Already infrequent** (1 hour interval)
2. **Learning is always valuable** (even if no new errors, patterns may emerge)
3. **Lightweight operation** (just database queries, no heavy I/O)
4. **Knowledge base degrades if not updated** (older data becomes stale)

**Possible Enhancement (Low Priority):**
- Track if new errors appeared since last run
- Skip analysis if error count unchanged
- Adaptive interval: 1h → 2h → 4h when error rate low

**Recommendation:** ⏸️ **DEFER** (acceptable as-is, enhance if needed)

---

### 6. Intelligent Logger Flush (ℹ️ LOW PRIORITY)

**Location:** `src/utils/intelligent-logger.ts`  
**Current Interval:** 5 seconds (fixed)  
**Status:** ℹ️ **LOW PRIORITY** (acceptable without controls)

**Current Behavior:**
```typescript
// Flushes log write queue every 5 seconds
this.writeInterval = setInterval(() => {
  this.flushToDisk().catch(err => {
    console.error('[intelligent-logger] Failed to flush to disk:', err);
  });
}, 5000);
```

**Why Low Priority:**
1. **Already has backpressure** (maxWriteQueueSize: 10k entries)
2. **Very short interval** (5s, minimal overhead)
3. **Critical for log durability** (don't want to lose logs)
4. **Flush is cheap** (just file append)

**Existing Controls:**
```typescript
// Backpressure already implemented
if (this.writeQueue.length < this.maxWriteQueueSize) {
  this.writeQueue.push(entry);
} else {
  // Drop oldest entries if queue full
}
```

**Recommendation:** ✅ **NO ACTION NEEDED** (already has sufficient controls)

---

### 7. Resource Monitor (✅ ALREADY INTEGRATED)

**Location:** `src/services/resource-monitor.ts`  
**Current Intervals:** 
- Health checks: 12 hours (fixed, acceptable)
- Memory guardian: 30 seconds (fixed, necessary)
**Status:** ✅ **ACCEPTABLE** (memory protection requires frequent polling)

**Current Behavior:**
```typescript
// Health checks every 12 hours (rare, acceptable)
this.monitorTimer = setInterval(() => {
  this.runHealthCheck('scheduled');
}, MONITOR_CONFIG.intervalMs); // 12 hours

// Memory guardian polls every 30 seconds (necessary for protection)
this.memoryGuardianTimer = setInterval(() => {
  this.checkMemoryAndAct();
}, MONITOR_CONFIG.memoryGuardianIntervalMs); // 30 seconds
```

**Why No Controls Needed:**
1. **Health checks already infrequent** (12 hours, minimal overhead)
2. **Memory guardian REQUIRES frequent polling** (30s for OOM protection)
3. **Memory pressure is active protection** (not data-change based)
4. **Adaptive interval would defeat purpose** (need real-time memory monitoring)

**Recommendation:** ✅ **NO ACTION NEEDED** (acceptable as-is)

---

### 8. Miscellaneous Timers (✅ ACCEPTABLE)

**Locations:** Various (bot stats, telemetry, auto-sync)  
**Status:** ✅ **ACCEPTABLE** (either necessary or already controlled)

**Examples:**

**A. Bot Operational Stats (acceptable):**
```typescript
// Reports stats periodically (necessary for monitoring)
setInterval(() => reportOperationalStats('periodic'), opsMs);
```

**B. Telemetry Updates (acceptable):**
```typescript
// Updates telemetry dashboard (lightweight, visual feedback)
const telemetryInterval = setInterval(() => { ... }, refreshInterval);
```

**C. Auto-Sync Restart (acceptable):**
```typescript
// Restart delay after process exits (one-time, not periodic)
restartTimer = setTimeout(spawnChild, RESTART_DELAY_MS);
```

**Recommendation:** ✅ **NO ACTION NEEDED** (all acceptable or necessary)

---

## Implementation Priority

### 🔴 **HIGH PRIORITY** (Implement Soon)

1. **Write Buffer Flusher Adaptive Controls**
   - **Impact:** High (reduces disk I/O, extends disk life)
   - **Complexity:** Low (simple empty-queue detection)
   - **Effort:** ~2 hours
   - **ROI:** High (saves resources during low-activity)

2. **Write-DB Validator Adaptive Controls**
   - **Impact:** High (reduces PROD writes, saves costs)
   - **Complexity:** Medium (needs checksum calculation)
   - **Effort:** ~3 hours
   - **ROI:** High (prevents unnecessary PROD uploads)

### 🟡 **MEDIUM PRIORITY** (Consider Later)

3. **Error Learning Worker Enhancement**
   - **Impact:** Low (already hourly, lightweight)
   - **Complexity:** Low (track error count changes)
   - **Effort:** ~1 hour
   - **ROI:** Low (minor optimization)

### ✅ **NO ACTION NEEDED**

- Engine Cache (✅ implemented)
- Cache Refresh Worker (✅ delegates to Engine Cache)
- Intelligent Logger (✅ has backpressure)
- Resource Monitor (✅ necessary frequent polling)
- Miscellaneous timers (✅ acceptable as-is)

---

## Recommended Implementation Plan

### Phase 1: Write Buffer Flusher (Week 1)

**Goal:** Skip empty flushes, adapt to battle activity

**Implementation:**
```typescript
// src/workers/engine-workers.ts (WriteBufferFlusher class)

private consecutiveEmptyFlushes: number = 0;
private currentFlushIntervalMs: number = EngineDbConfig.writeBufferFlushIntervalMs;
private lastDataSeen: Date | null = null;

private async execute(): Promise<void> {
  const bufferStats = engineWriteBuffer.getStats();
  
  // Check if data present
  if (bufferStats.totalQueueSize === 0) {
    this.consecutiveEmptyFlushes++;
    
    log('debug', 'WriteBufferFlusher: Empty queues, skipping flush', {
      consecutiveEmpty: this.consecutiveEmptyFlushes,
      currentInterval: `${this.currentFlushIntervalMs / 1000}s`,
    });
    
    // Adaptive interval adjustment
    if (this.consecutiveEmptyFlushes >= 5) {
      this.adjustFlushInterval('increase');
    }
    
    return; // Skip flush
  }
  
  // Data present, perform flush
  this.consecutiveEmptyFlushes = 0;
  this.lastDataSeen = new Date();
  
  // Reset interval if needed
  if (this.currentFlushIntervalMs !== EngineDbConfig.writeBufferFlushIntervalMs) {
    this.adjustFlushInterval('reset');
  }
  
  // ... existing flush logic ...
}

private adjustFlushInterval(action: 'increase' | 'reset'): void {
  const baseInterval = EngineDbConfig.writeBufferFlushIntervalMs;
  const maxInterval = 60 * 1000; // 60 seconds max
  
  if (action === 'increase') {
    const newInterval = Math.min(this.currentFlushIntervalMs * 2, maxInterval);
    if (newInterval !== this.currentFlushIntervalMs) {
      this.currentFlushIntervalMs = newInterval;
      this.restartTimer();
      
      log('info', 'WriteBufferFlusher: Increasing flush interval (low activity)', {
        from: `${this.currentFlushIntervalMs / 2000}s`,
        to: `${newInterval / 1000}s`,
      });
    }
  } else {
    if (this.currentFlushIntervalMs !== baseInterval) {
      this.currentFlushIntervalMs = baseInterval;
      this.restartTimer();
      
      log('info', 'WriteBufferFlusher: Resetting flush interval (data present)', {
        interval: `${baseInterval / 1000}s`,
      });
    }
  }
}

private restartTimer(): void {
  if (this.interval) {
    clearInterval(this.interval);
  }
  
  this.interval = setInterval(async () => {
    await this.execute();
  }, this.currentFlushIntervalMs);
}
```

**Testing:**
- Low activity: Verify interval increases to 60s after 5 empty cycles
- High activity: Verify interval resets to 10s when data present
- Monitor logs for "Empty queues, skipping flush" messages

---

### Phase 2: Write-DB Validator (Week 2)

**Goal:** Skip validation when Write-DB unchanged, reduce PROD writes

**Implementation:**
```typescript
// src/workers/engine-workers.ts (WriteDbValidatorWorker class)

private lastWriteDbChecksum: string | null = null;
private consecutiveNoChangeValidations: number = 0;
private currentValidationIntervalMs: number = EngineDbConfig.writeDbValidatorIntervalMs;

private async execute(): Promise<void> {
  const writeDb = await import('../services/engine-write-db.js');
  const writeDbStats = await writeDb.getStats();
  
  // Calculate checksum
  const currentChecksum = this.calculateWriteDbChecksum(writeDbStats);
  
  // Detect change
  const dataChanged = currentChecksum !== this.lastWriteDbChecksum;
  
  if (!dataChanged && this.lastWriteDbChecksum !== null) {
    this.consecutiveNoChangeValidations++;
    
    log('info', 'WriteDbValidator: NO DATA CHANGE, skipping validation', {
      checksum: currentChecksum?.substring(0, 8),
      consecutiveNoChanges: this.consecutiveNoChangeValidations,
    });
    
    // Adaptive interval adjustment
    if (this.consecutiveNoChangeValidations >= 3) {
      this.adjustValidationInterval('increase');
    }
    
    return; // Skip validation + upload
  }
  
  // Data changed, perform validation
  this.consecutiveNoChangeValidations = 0;
  this.lastWriteDbChecksum = currentChecksum;
  
  if (this.currentValidationIntervalMs !== EngineDbConfig.writeDbValidatorIntervalMs) {
    this.adjustValidationInterval('reset');
  }
  
  // ... existing validation + upload logic ...
}

private calculateWriteDbChecksum(stats: any): string {
  // Simple checksum based on row counts + last modified
  const fingerprint = `B:${stats.battleLogCount}|M:${stats.moveUsageCount}|A:${stats.anomalyCount}|T:${stats.oldestEntryAge}`;
  
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return hash.toString(16);
}

private adjustValidationInterval(action: 'increase' | 'reset'): void {
  const baseInterval = EngineDbConfig.writeDbValidatorIntervalMs;
  const maxInterval = 60 * 60 * 1000; // 60 minutes max
  
  if (action === 'increase') {
    const newInterval = Math.min(this.currentValidationIntervalMs * 2, maxInterval);
    if (newInterval !== this.currentValidationIntervalMs) {
      this.currentValidationIntervalMs = newInterval;
      this.restartTimer();
      
      log('info', 'WriteDbValidator: Increasing validation interval (no new data)', {
        from: `${this.currentValidationIntervalMs / 60000}m`,
        to: `${newInterval / 60000}m`,
      });
    }
  } else {
    if (this.currentValidationIntervalMs !== baseInterval) {
      this.currentValidationIntervalMs = baseInterval;
      this.restartTimer();
      
      log('info', 'WriteDbValidator: Resetting validation interval (new data)', {
        interval: `${baseInterval / 60000}m`,
      });
    }
  }
}

private restartTimer(): void {
  if (this.interval) {
    clearInterval(this.interval);
  }
  
  this.interval = setInterval(async () => {
    await this.execute();
  }, this.currentValidationIntervalMs);
}
```

**Testing:**
- No battles: Verify interval increases to 60m after 3 no-change cycles
- New battles: Verify interval resets to 10m when data present
- Monitor PROD uploads (should decrease during low activity)

---

## Expected Benefits

### Write Buffer Flusher Optimization

**Before:**
- Flushes every 10 seconds unconditionally
- ~8,640 flush attempts per day
- Many empty flushes during low activity (e.g., 2am-6am)

**After (with adaptive controls):**
- Flushes every 10s when battles active
- Flushes every 60s when idle (6x less frequent)
- Skip empty flushes entirely
- Estimated reduction: 50-70% fewer disk writes

**Savings:**
- Reduced disk I/O by ~50-70%
- Extended disk lifespan (fewer write cycles)
- Lower CPU usage (skip unnecessary operations)

---

### Write-DB Validator Optimization

**Before:**
- Validates every 10 minutes unconditionally
- ~144 validation attempts per day
- Many no-op uploads during low activity

**After (with adaptive controls):**
- Validates every 10m when battles active
- Validates every 60m when idle (6x less frequent)
- Skip validation if Write-DB unchanged
- Estimated reduction: 60-80% fewer PROD uploads

**Savings:**
- Reduced PROD writes by ~60-80%
- Lower database query costs (validation queries PROD)
- Reduced network traffic (fewer uploads)

---

## Monitoring & Observability

**Metrics to Track:**

1. **Write Buffer Flusher:**
   - Current flush interval (seconds)
   - Consecutive empty flush count
   - Total flushes skipped (counter)
   - Flush success rate (%)

2. **Write-DB Validator:**
   - Current validation interval (minutes)
   - Consecutive no-change count
   - Total validations skipped (counter)
   - Upload frequency (uploads/hour)

3. **Overall System:**
   - Total disk writes per hour (trend)
   - PROD upload frequency (trend)
   - Resource savings (% reduction)

**Dashboard Display (` engine`):**
```
Write Buffer Flusher:
  Interval: 60s (adaptive, 6x base)
  Empty Flushes: 12 consecutive
  Total Skipped: 432 (50% reduction)
  
Write-DB Validator:
  Interval: 40m (adaptive, 4x base)
  No-Change Cycles: 2 consecutive
  Total Skipped: 89 (62% reduction)
```

---

## Conclusion

**Summary:**
- ✅ **Engine Cache:** Adaptive polling implemented (checksum-based change detection)
- ⚠️ **Write Buffer Flusher:** Needs controls to skip empty flushes (HIGH priority)
- ⚠️ **Write-DB Validator:** Needs controls to skip no-change validations (HIGH priority)
- ✅ **Other Services:** Acceptable as-is (already controlled or necessary)

**Next Steps:**
1. Implement Write Buffer Flusher adaptive controls (Week 1)
2. Implement Write-DB Validator adaptive controls (Week 2)
3. Monitor savings and adjust thresholds as needed

**Expected Outcome:**
- 50-70% reduction in disk writes (Write Buffer)
- 60-80% reduction in PROD uploads (Write-DB Validator)
- Extended disk lifespan and lower resource costs
- Maintained performance during high-activity periods

---

**Authored By:** AI Assistant  
**Review Status:** Ready for implementation  
**Priority:** HIGH (Week 1-2 implementation recommended)
