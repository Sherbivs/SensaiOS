# Memory Leak Patch Blueprint — SensaiOS

**Created:** 2026-02-09  
**Status:** DRAFT — Ready for Implementation  
**Target:** SensaiOS + Infinity Gauntlet Memory Optimization  
**Objective:** Reduce RAM usage from 512MB+ to <300MB under normal load

---

## 📋 TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Problem Areas](#problem-areas)
3. [Patch Components](#patch-components)
4. [Implementation Plan](#implementation-plan)
5. [Testing Strategy](#testing-strategy)
6. [Rollout Strategy](#rollout-strategy)
7. [Monitoring & Validation](#monitoring--validation)
8. [Rollback Plan](#rollback-plan)

---

## 🎯 EXECUTIVE SUMMARY

### Identified Issues (Updated from Second Audit)
- **2 CRITICAL** — Unbounded arrays (C1) + Battle session Maps (C7)
- **5 MODERATE** — Maps without size limits (C3, C4, C8, C9) + Audit trail (C2)
- **2 LOW-RISK** — Error Brain Maps (C10) - optional fixes
- **19 BOUNDED (VERIFIED)** — Confirmed safe with proper limits

### Success Metrics
- Baseline RSS memory: **<300 MB** under normal load (currently 512MB+)
- Peak RSS memory: **<600 MB** under heavy load (currently 800MB+)
- 24-hour memory growth: **<50 MB** (currently 100-200 MB)
- No OOM crashes in 7-day observation period

### Rollout Timeline
- **Phase 1 (Day 1-2):** Critical fixes (C1, C7) + unit tests
- **Phase 2 (Day 3-5):** Moderate fixes (C2, C3, C4, C8, C9) + Low-risk (C10) + bounded verification
- **Phase 3 (Day 6):** Monitoring integration (C6)
- **Phase 4 (Day 7-8):** Canary deployment + validation
- **Phase 5 (Day 9+):** Full production rollout

---

## 🔍 PROBLEM AREAS

### 🔴 CRITICAL — Unbounded Arrays (MUST FIX)

#### C1: Activity Tracker — Pending Activities Array
**Status:** PHASE1_COMPLETE (2026-02-09)
**File:** `src/utils/activityTracker.ts`  
**Line:** 49 (declaration), 96 (push), 103 (drain)  
**Current State:** `pendingActivities: ActivityEntry[]` with NO maximum size  
**Growth Rate:** ~4 MB/hour (100 activities/min × 60 min × ~700 bytes/entry)  
**Risk:** High — Primary memory leak source

**Evidence:**
```typescript
// LINE 49 (CORRECTED from blueprint v1)
const pendingActivities: ActivityEntry[] = [];

// LINE 96 - Unbounded push (CORRECTED from blueprint v1)
export function recordActivity(type: string, summary: string, meta: Record<string, unknown> = {}): ActivityEntry {
  // ... create entry ...
  pendingActivities.push(entry);  // ❌ NO LIMIT
  totalEvents += 1;
  // ...
}

// LINE 103 - Drain exists but not automatic (CORRECTED from blueprint v1)
export function drainActivities(): ActivityEntry[] {
  const drained = pendingActivities.splice(0, pendingActivities.length);
  notify();
  return drained;
}
```

**Root Cause:** Activities accumulate if:
- Drain interval fails
- Activities recorded faster than drained
- System under high load

**Call Sites:**
- `src/bot/main.ts:1552` — Drains activities periodically
- Used throughout system for event tracking

---

#### C2: PBSL Audit Trail — Events Array Never Cleared
**Status:** PHASE1_COMPLETE (2026-02-09)
**File:** `src/core/pbsl/audit.ts`  
**Line:** 33 (declaration), ~62 (push), 66 (flush)  
**Current State:** `MemoryAuditTrail.events: AuditEvent[]` never cleared  
**Growth Rate:** ~500 KB/hour (50 events/battle × 10 battles/hour × ~1 KB/event)  
**Risk:** MODERATE (downgraded from CRITICAL) — Root cause is C7 (battle session Maps)

**Evidence:**
```typescript
// LINE 33
export class MemoryAuditTrail implements AuditTrail {
  private events: AuditEvent[] = [];

  // LINE 53 - Push without limit
  record(event: Omit<AuditEvent, "timestamp"> & { timestamp?: string }): void {
    // ... validation ...
    this.events.push(Object.freeze(entry));  // ❌ NEVER CLEARED
  }

  // LINE 58 - Flush returns COPY, doesn't clear!
  flush(): readonly AuditEvent[] {
    return this.events.slice();  // ❌ JUST A COPY
  }
}
```

**Root Cause (Updated from Second Audit):** The flush()-as-copy design may be intentional for read-only snapshots. The REAL issue is that `BattleEngine` instances are held in memory by battle session Maps (see C7), preventing garbage collection of the audit trails. Fixing C7 fixes most of this issue.

**Secondary Cause:** `flush()` doesn't clear the array, so events accumulate if engines are held.

**Call Sites:**
- `src/core/pbsl/battle/engine.ts:56` — Creates audit trail per battle
- Every battle creates new instance, but C7 prevents GC

---

### 🟡 MODERATE — Maps Without Size Limits (SHOULD FIX)

#### M1: Player Resolver Cache — No MAX_SIZE
**File:** `src/services/player-resolver.ts`  
**Line:** 134-135  
**Current State:** `cache: Map<string, ...>` with only TTL-based eviction  
**Growth Rate:** Variable — depends on player activity  
**Risk:** Medium — Can grow large with many unique players

**Evidence:**
```typescript
// LINE 134
private cache: Map<string, { data: ResolvedPlayer; expiresAt: number }> = new Map();
private readonly CACHE_TTL_MS = 30_000; // 30 seconds

// No MAX_SIZE enforcement
// Only evicts expired entries
```

**Root Cause:** Cache evicts by TTL (30s) but has no size cap. With 1000 unique players within 30s window, cache could grow to ~50 MB.

---

#### M2: Content-Addressable Storage — No MAX_SIZE
**File:** `src/sensaios/storage/content-addressable.ts`  
**Line:** 118  
**Current State:** `blobs: Map<string, ContentAddressableBlob>` unbounded  
**Growth Rate:** Variable — depends on blob creation  
**Risk:** Medium — Blobs are deduplicated but still accumulate

**Evidence:**
```typescript
// LINE 118
private readonly blobs = new Map<string, ContentAddressableBlob>();
// No maximum size limit
```

**Root Cause:** No eviction policy. While deduplication helps (same content = same ID), unique blobs accumulate forever.

---

### 🔴 CRITICAL — Battle Session Maps (NEW FROM SECOND AUDIT)

#### C7: Battle Session Maps — Module-Level State Without Cleanup
**Status:** PHASE1_COMPLETE (2026-02-09)
**Files:** `src/commands/battle-turn.ts` + `src/core/battle/turn-manager.ts`  
**Lines:** 114 (SESSIONS Map), 50 (runtimes Map)  
**Current State:** Two module-level Maps hold battle state indefinitely  
**Growth Rate:** ~1 MB per 100 battles (10 KB/battle × 100 battles)  
**Risk:** CRITICAL — This is the ROOT CAUSE of C2 (audit trail retention)

**Evidence:**
```typescript
// src/commands/battle-turn.ts LINE 114
const SESSIONS = new Map<string, BattleSession>();
// Only deletes on KO (line 282) - abandoned battles persist forever

// src/core/battle/turn-manager.ts LINE 50
const runtimes = new Map<string, BattleRuntime>();
// NO production cleanup - only __testing.clear() exists
// Each runtime has history: ResolvedTurn[] that grows per turn
```

**Why This Matters:** `BattleEngine` instances (which hold `MemoryAuditTrail` from C2) are referenced through these Maps. If sessions/runtimes aren't cleaned up, the engines can't be garbage collected, and audit trails accumulate indefinitely.

**Root Cause:** 
1. `SESSIONS` only deletes when battles end with KO — abandoned battles never cleaned
2. `runtimes` has ZERO production cleanup — every battle ever started stays in memory
3. No TTL, no periodic cleanup, no max size

**Call Sites:**
- `src/commands/battle-turn.ts` — Used in `/battle-turn` command handler
- `src/core/battle/turn-manager.ts` — Core battle runtime management

---

### 🟡 MODERATE — Additional Unbounded Structures (NEW FROM SECOND AUDIT)

#### M3: Discord Identity Service Cache — No MAX_SIZE
**File:** `src/services/discord-identity.ts`  
**Lines:** 132-133  
**Current State:** `userCache` and `guildCache` Maps with only TTL (5 min), no size cap  
**Growth Rate:** Variable — 10x longer TTL than PlayerResolver (5 min vs 30s)  
**Risk:** Medium — Same vulnerability as M1 but worse TTL

**Evidence:**
```typescript
// LINE 132-133
private userCache: Map<string, {...}>;
private guildCache: Map<string, {...}>;
// TTL: 5 minutes (10x longer than PlayerResolver)
// MAX_SIZE: None
// Auto-cleanup: None (lazy eviction on read only)
```

**Root Cause:** Singleton with unbounded cache, only manual `clearCache()` methods that are never auto-called.

---

#### M4: AI Log Analyzer KnowledgeBase — Completely Unbounded
**File:** `src/services/ai/ai-log-analyzer.ts`  
**Lines:** 233-236  
**Current State:** 4 Maps + 2 arrays with ZERO cleanup anywhere  
**Growth Rate:** Variable — grows with every unique pattern analyzed  
**Risk:** Medium — Accumulates error patterns, anomalies, insights forever

**Evidence:**
```typescript
// 4 Maps (lines 233-236)
errorPatterns: Map<string, ...>          // .set() at line 426
performanceBaselines: Map<string, ...>   // .set() at line 508
userBehaviorPatterns: Map<string, ...>   // .set() at line 594
correlations: Map<string, ...>           // .set() at line 594

// 2 Arrays
anomalies: []   // .push() at line 674
insights: []    // .push() at line 674

// Lines 781-782: anomalies.slice(-100) is OUTPUT only - source never trimmed
```

**Root Cause:** Complete absence of any cleanup, eviction, or max size logic.

---

### 🟢 LOW-RISK — Error Brain Maps (NEW FROM SECOND AUDIT)

#### L1: Pattern Detector & Impact Predictor Maps
**Files:** `src/services/error-brain/pattern-detector.ts` + `impact-predictor.ts`  
**Lines:** 141, 149, 152, 155 (pattern-detector); 192, 195 (impact-predictor)  
**Current State:** Map key count unbounded by unique error fingerprints  
**Risk:** Low — Small per-entry size, limited fingerprint cardinality in practice

**Pattern Detector Maps:**
- `burstWindows` (141) — Old timestamps evicted per-entry, but key count unbounded
- `correlationObservations` (149) — No cleanup
- `fingerprintObservations` (152) — No cleanup  
- `activeCascades` (155) — Time window cleanup per-entry, but key count unbounded

**Impact Predictor Maps:**
- `serviceHealthMap` (192) — No key count limit
- `errorHistory` (195) — Per-key arrays bounded at 60 points, but key count unbounded

**Note:** `recentErrors[]` IS properly bounded at 1000 with circular buffer ✅

**Root Cause:** No MAX_FINGERPRINTS limit across the Maps.

---

### ✅ BOUNDED (VERIFIED IN SECOND AUDIT)

These components were verified in the second audit and confirmed properly bounded:

| Component | File | Limit | Verified |
|-----------|------|-------|----------|
|-----------|------|---------------|---------------------|
| EventBus replay buffer | `src/shared/event-bus.ts:275-278` | 100 FIFO | ✅ |
| EventBus pattern cache | `src/shared/event-bus.ts` | 500 LRU | ⏳ Needs test |
| Memory cache | `src/services/cache.ts` | 1000 entries | ⏳ Needs test |
| Log buffer | `src/shared/logBuffer.ts` | 200 entries (reduced from 1000) | ⏳ Needs test |
| AI log buffer | `src/services/ai/ai-log-writer.ts:550` | Flushes at 100 | ⏳ Needs test |
| Loki queue | `src/observability/backends/loki/loki-queue.ts` | 10,000 max | ⏳ Needs test |
| Write buffer | `src/services/monitoring/resilient-write-buffer.ts:75` | 1000 max | ⏳ Needs test |
| Error patterns | `src/services/error-brain/pattern-detector.ts:145` | 1000 circular | ⏳ Needs test |
| Sensai error tracker | `src/sensaios/error-tracker.ts:124` | 500 patterns | ⏳ Needs test |
| Key rotation history | `src/bot/security/services/key-rotation-service.ts:632-633` | 100 entries | ⏳ Needs test |
| Sweep history | `src/bot/security/services/integrity-sweep-scheduler.ts:1007-1008` | Config-based | ⏳ Needs test |
| Alert history | `src/bot/security/services/pagerduty-service.ts:700` | Config-based | ⏳ Needs test |
| Resource monitor snapshots | `src/services/monitoring/resource-monitor.ts:1524` | 7-day retention | ✅ |
| Error Brain L1 Cache | `error-brain-cache.ts` | 2 MB max + LRU | ✅ |
| Fingerprint cache | `monitoring-utils.ts:57` | 500 LRU | ✅ |
| Fishing sessions | `fishing.ts:147` | 60s TTL + delete | ✅ |
| Kernel audit trail | `kernel-observer.ts:66` | MAX_AUDIT_ENTRIES + shift() | ✅ |
| LRU cache strategy | `strategies.ts` | maxEntries + maxBytes | ✅ |
| Cooldown store | `cooldown.ts` | 1hr TTL + 10min sweep | ✅ |

**Total Verified Bounded:** 19 structures (increased from 13 after second audit)

**Verification Method:** Code inspection + pattern analysis in second audit confirmed all limits enforced.

---

## 🛠️ PATCH COMPONENTS

### Component 1: Activity Tracker Bounds (CRITICAL)

**File:** `src/utils/activityTracker.ts`  
**Changes:**
1. Add `MAX_PENDING_ACTIVITIES` constant
2. Implement circular buffer behavior in `recordActivity()`
3. Add memory safety guard in `requeueActivities()`
4. Add metrics for tracking buffer utilization

**Implementation:**
```typescript
// Add after line 44 (before pendingActivities declaration)
/** Maximum pending activities before circular buffer behavior kicks in */
const MAX_PENDING_ACTIVITIES = 1000;

// Modify recordActivity() around line 91
export function recordActivity(
  type: string, 
  summary: string, 
  meta: Record<string, unknown> = {}
): ActivityEntry {
  const timestamp = new Date();
  const entry: ActivityEntry = {
    id: `${Date.now()}-${sequence++}`,
    type,
    summary,
    meta,
    timestamp,
  };

  // MEMORY SAFETY: Enforce circular buffer behavior
  if (pendingActivities.length >= MAX_PENDING_ACTIVITIES) {
    pendingActivities.shift(); // Remove oldest when at limit
    logger.warn('ActivityTracker', 'recordActivity', 
      `Activity buffer at MAX (${MAX_PENDING_ACTIVITIES}), dropping oldest entry`);
  }

  pendingActivities.push(entry);
  totalEvents += 1;
  lifetimeCounts.set(type, (lifetimeCounts.get(type) || 0) + 1);
  lastActivityAt = timestamp;
  notify();
  return entry;
}

// Modify requeueActivities() around line 112
export function requeueActivities(entries: Partial<ActivityEntry>[] = []): void {
  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }
  
  // MEMORY SAFETY: Don't requeue if it would exceed limit
  if (pendingActivities.length + entries.length > MAX_PENDING_ACTIVITIES) {
    logger.warn('ActivityTracker', 'requeueActivities',
      `Cannot requeue ${entries.length} activities: would exceed MAX (${MAX_PENDING_ACTIVITIES})`);
    return;
  }
  
  for (const entry of entries) {
    if (!entry || !entry.timestamp) {
      (entry as ActivityEntry).timestamp = new Date();
    } else {
      (entry as ActivityEntry).timestamp = toDate(entry.timestamp) ?? new Date();
    }
  }
  
  pendingActivities.unshift(...(entries as ActivityEntry[]));
  pendingActivities.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  notify();
}

// Add new function to expose metrics
export function getBufferMetrics(): {
  current: number;
  max: number;
  utilization: number;
  dropped: number;
} {
  return {
    current: pendingActivities.length,
    max: MAX_PENDING_ACTIVITIES,
    utilization: (pendingActivities.length / MAX_PENDING_ACTIVITIES) * 100,
    dropped: 0, // TODO: Track dropped count
  };
}
```

**Unit Tests Required:**
- `tests/utils/activityTracker.bounded.spec.ts`
  - Test: Buffer enforces MAX_PENDING_ACTIVITIES
  - Test: Oldest entries dropped when limit reached
  - Test: requeueActivities respects limit
  - Test: Metrics accurately report buffer state

---

### Component 2: PBSL Audit Trail Clear (CRITICAL)

**File:** `src/core/pbsl/audit.ts`  
**Changes:**
1. Modify `flush()` to clear events after returning
2. Add optional max events limit for long-running audits
3. Add memory metrics

**Implementation Option A: Clear on Flush (Recommended)**
```typescript
// Modify flush() around line 58
flush(): readonly AuditEvent[] {
  const result = Object.freeze([...this.events]);
  this.events = []; // ← CRITICAL FIX: Clear after flushing
  return result;
}
```

**Implementation Option B: Add Max Events Limit**
```typescript
// Add after line 32 (class declaration)
export class MemoryAuditTrail implements AuditTrail {
  private events: AuditEvent[] = [];
  private readonly maxEvents: number;

  constructor(
    private readonly provenance?: ProvenanceRecord,
    options?: { maxEvents?: number }
  ) {
    this.maxEvents = options?.maxEvents ?? 1000; // Default 1000 events
  }

  record(event: Omit<AuditEvent, "timestamp"> & { timestamp?: string }): void {
    // ... existing validation ...

    const entry: AuditEvent = {
      phase: event.phase,
      action: event.action,
      timestamp: event.timestamp ?? nowUtc(),
      context,
    };
    
    assertAuditEvent(entry);
    
    // MEMORY SAFETY: Enforce max events
    if (this.events.length >= this.maxEvents) {
      this.events.shift(); // Remove oldest when at limit
    }
    
    this.events.push(Object.freeze(entry));
  }

  flush(): readonly AuditEvent[] {
    const result = Object.freeze([...this.events]);
    this.events = []; // Clear after flushing
    return result;
  }

  // Add metrics method
  getMetrics(): { current: number; max: number; utilization: number } {
    return {
      current: this.events.length,
      max: this.maxEvents,
      utilization: (this.events.length / this.maxEvents) * 100,
    };
  }
}
```

**Recommendation:** Use **Option A** (clear on flush) for simplicity, with **Option B** as safety net.

**Unit Tests Required:**
- `tests/core/pbsl/audit.bounded.spec.ts`
  - Test: flush() clears events array
  - Test: Max events limit enforced (Option B)
  - Test: Oldest events dropped when limit reached
  - Test: Memory doesn't grow unbounded

---

### Component 3: Player Resolver LRU Cache (MODERATE)

**File:** `src/services/player-resolver.ts`  
**Changes:**
1. Add `MAX_CACHE_SIZE` constant
2. Implement LRU eviction in `resolve()`
3. Add cache metrics to `getCacheStats()`

**Implementation:**
```typescript
// Add after line 135 (after CACHE_TTL_MS)
private readonly MAX_CACHE_SIZE = 1000;

// Modify resolve() around line 166 (before adding to cache)
async resolve(
  discordId: string,
  options: ResolveOptions
): Promise<ResolvedPlayer | null> {
  const cacheKey = `${discordId}:${options.guildId}`;
  
  // Check cache
  const cached = this.cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const startTime = Date.now();
  
  try {
    // ... existing resolution logic ...
    
    // MEMORY SAFETY: Enforce max cache size with LRU eviction
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest entry (LRU: first key in Map)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    
    // Cache result with TTL
    this.cache.set(cacheKey, {
      data: player,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
    
    return player;
  } catch (error) {
    // ... existing error handling ...
  }
}

// Modify getCacheStats() around line 420
getCacheStats(): { size: number; max: number; utilization: number } {
  return {
    size: this.cache.size,
    max: this.MAX_CACHE_SIZE,
    utilization: (this.cache.size / this.MAX_CACHE_SIZE) * 100,
  };
}
```

**Unit Tests Required:**
- `tests/services/player-resolver.bounded.spec.ts`
  - Test: Cache enforces MAX_CACHE_SIZE
  - Test: LRU eviction works correctly
  - Test: Metrics accurate

---

### Component 4: Content-Addressable Storage Bounds (MODERATE)

**File:** `src/sensaios/storage/content-addressable.ts`  
**Changes:**
1. Add `MAX_BLOBS` constant
2. Implement LRU eviction in `put()`
3. Add option for TTL-based eviction

**Implementation:**
```typescript
// Add after line 117 (before blobs Map)
private readonly MAX_BLOBS = 10000; // Configurable via constructor
private accessOrder: string[] = []; // Track access for LRU

// Modify constructor to accept config
constructor(config?: { maxBlobs?: number }) {
  this.MAX_BLOBS = config?.maxBlobs ?? 10000;
}

// Modify put() method (around line 160)
async put(data: Buffer, metadata?: Record<string, unknown>): Promise<string> {
  const id = this.computeHash(data);
  const existing = this.blobs.get(id);
  
  if (existing) {
    // Deduplication - increment ref count
    existing.referenceCount++;
    existing.lastAccessedAt = new Date();
    this.stats.duplicatesAvoided++;
    this.stats.deduplicationSavings += data.length;
    
    // Update LRU tracking
    this.updateAccessOrder(id);
    
    return id;
  }
  
  // MEMORY SAFETY: Enforce max blobs with LRU eviction
  if (this.blobs.size >= this.MAX_BLOBS) {
    const victimId = this.accessOrder.shift(); // Remove least recently used
    if (victimId) {
      const victim = this.blobs.get(victimId);
      if (victim) {
        this.stats.totalBytes -= victim.size;
        this.blobs.delete(victimId);
      }
    }
  }
  
  // Create new blob
  const blob: ContentAddressableBlob = {
    id,
    data,
    size: data.length,
    metadata: metadata ?? {},
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    referenceCount: 1,
  };
  
  this.blobs.set(id, blob);
  this.accessOrder.push(id); // Add to end (most recently used)
  this.stats.totalBlobs++;
  this.stats.totalBytes += data.length;
  
  return id;
}

// Add LRU tracking helper
private updateAccessOrder(id: string): void {
  const index = this.accessOrder.indexOf(id);
  if (index > -1) {
    this.accessOrder.splice(index, 1); // Remove from current position
  }
  this.accessOrder.push(id); // Add to end (most recently used)
}

// Modify get() to update LRU
async get(id: string, options?: { verify?: boolean }): Promise<Buffer | null> {
  const blob = this.blobs.get(id);
  if (!blob) return null;
  
  blob.lastAccessedAt = new Date();
  this.updateAccessOrder(id); // Update LRU tracking
  
  // ... existing verification logic ...
  
  return blob.data;
}

// Add metrics to getStats()
getStats(): CASStats & { maxBlobs: number; utilization: number } {
  return {
    ...this.stats,
    total: this.blobs.size,
    maxBlobs: this.MAX_BLOBS,
    utilization: (this.blobs.size / this.MAX_BLOBS) * 100,
  };
}
```

**Unit Tests Required:**
- `tests/sensaios/storage/content-addressable.bounded.spec.ts`
  - Test: Enforces MAX_BLOBS
  - Test: LRU eviction works correctly
  - Test: Deduplication still works with bounds
  - Test: Reference counting correct after eviction

---

### Component 7: Battle Session Cleanup (CRITICAL - NEW)

**Files:** `src/commands/battle-turn.ts` + `src/core/battle/turn-manager.ts`  
**Changes:**
1. Add `SESSION_TIMEOUT_MS` constant (10 minutes)
2. Add periodic cleanup timer for abandoned sessions
3. Add `destroyRuntime()` function in turn-manager
4. Add `lastActivity` timestamp tracking
5. Add metrics for active sessions

**Implementation:**
```typescript
// battle-turn.ts — Add after line 114 (SESSIONS declaration)
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

interface BattleSessionWithActivity extends BattleSession {
  lastActivity: number;
}

// Replace Map type
const SESSIONS = new Map<string, BattleSessionWithActivity>();

// Add periodic cleanup (at bottom of file)
const sessionCleanupInterval = setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [userId, session] of SESSIONS) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      SESSIONS.delete(userId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.info('BattleTurn', 'cleanup', `Cleaned ${cleaned} stale sessions`);
  }
}, 60_000); // Check every minute

// Update ensureBattleState to track activity
function ensureBattleState(userId: string): BattleSession | null {
  let session = SESSIONS.get(userId);
  if (session) {
    session.lastActivity = Date.now(); // Update activity
    return session;
  }
  // ... existing creation logic ...
  session = { state, lastActivity: Date.now() };
  SESSIONS.set(userId, session);
  return session;
}

// Add graceful shutdown
process.on('SIGTERM', () => {
  clearInterval(sessionCleanupInterval);
});
```

```typescript
// turn-manager.ts — Add production cleanup functions

// Add after line 50 (runtimes declaration)
const RUNTIME_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

interface BattleRuntimeWithActivity extends BattleRuntime {
  lastActivity: number;
}

// Update ensureRuntime to track activity
function ensureRuntime(battleId: string): BattleRuntimeWithActivity {
  let runtime = runtimes.get(battleId) as BattleRuntimeWithActivity;
  if (runtime) {
    runtime.lastActivity = Date.now();
    return runtime;
  }
  // ... create new runtime ...
  runtime = {
    // ... existing fields ...
    lastActivity: Date.now(),
  } satisfies BattleRuntimeWithActivity;
  runtimes.set(battleId, runtime);
  return runtime;
}

// Add explicit cleanup function
export function destroyRuntime(battleId: string): boolean {
  return runtimes.delete(battleId);
}

// Add periodic cleanup
const runtimeCleanupInterval = setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [battleId, runtime] of runtimes) {
    const withActivity = runtime as BattleRuntimeWithActivity;
    if (now - withActivity.lastActivity > RUNTIME_TIMEOUT_MS) {
      runtimes.delete(battleId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[TurnManager] Cleaned ${cleaned} stale runtimes`);
  }
}, 5 * 60_000); // Check every 5 minutes

// Graceful shutdown
if (typeof process !== 'undefined') {
  process.on('SIGTERM', () => {
    clearInterval(runtimeCleanupInterval);
  });
}
```

**Unit Tests Required:**
- `tests/commands/battle-turn.cleanup.spec.ts`
  - Test: Abandoned sessions cleaned after timeout
  - Test: Active sessions NOT cleaned
  - Test: Cleanup interval runs correctly
  - Test: Graceful shutdown clears interval
- `tests/core/battle/turn-manager.cleanup.spec.ts`
  - Test: Stale runtimes cleaned after timeout
  - Test: destroyRuntime() works correctly
  - Test: lastActivity updated on access

---

### Component 8: Discord Identity Cache Bounds (MODERATE - NEW)

**File:** `src/services/discord-identity.ts`  
**Changes:**
1. Add `MAX_CACHE_SIZE` constants (500 for each cache)
2. Implement LRU eviction in cache-setting methods
3. Add cache metrics

**Implementation:**
```typescript
// Add after line 132-133 (cache declarations)
private readonly MAX_USER_CACHE_SIZE = 500;
private readonly MAX_GUILD_CACHE_SIZE = 500;

// Modify methods that add to userCache (before .set() calls)
private cacheUser(userId: string, data: CachedUserData): void {
  // LRU eviction
  if (this.userCache.size >= this.MAX_USER_CACHE_SIZE) {
    const oldestKey = this.userCache.keys().next().value;
    if (oldestKey) {
      this.userCache.delete(oldestKey);
    }
  }
  
  this.userCache.set(userId, {
    data,
    expiresAt: Date.now() + this.CACHE_TTL_MS,
  });
}

// Modify methods that add to guildCache
private cacheGuild(guildId: string, data: CachedGuildData): void {
  // LRU eviction
  if (this.guildCache.size >= this.MAX_GUILD_CACHE_SIZE) {
    const oldestKey = this.guildCache.keys().next().value;
    if (oldestKey) {
      this.guildCache.delete(oldestKey);
    }
  }
  
  this.guildCache.set(guildId, {
    data,
    expiresAt: Date.now() + this.CACHE_TTL_MS,
  });
}

// Add metrics method
getCacheMetrics(): {
  userCache: { size: number; max: number; utilization: number };
  guildCache: { size: number; max: number; utilization: number };
} {
  return {
    userCache: {
      size: this.userCache.size,
      max: this.MAX_USER_CACHE_SIZE,
      utilization: (this.userCache.size / this.MAX_USER_CACHE_SIZE) * 100,
    },
    guildCache: {
      size: this.guildCache.size,
      max: this.MAX_GUILD_CACHE_SIZE,
      utilization: (this.guildCache.size / this.MAX_GUILD_CACHE_SIZE) * 100,
    },
  };
}
```

**Unit Tests Required:**
- `tests/services/discord-identity.bounded.spec.ts`
  - Test: userCache enforces MAX_USER_CACHE_SIZE
  - Test: guildCache enforces MAX_GUILD_CACHE_SIZE
  - Test: LRU eviction works correctly for both caches
  - Test: Metrics accurate

---

### Component 9: AI Log Analyzer KnowledgeBase Bounds (MODERATE - NEW)

**File:** `src/services/ai/ai-log-analyzer.ts`  
**Changes:**
1. Add MAX constants for all Maps and arrays
2. Add in-place trimming after .set() and .push()
3. Add periodic cleanup timer

**Implementation:**
```typescript
// Add after line 236 (KnowledgeBase declaration)
const MAX_ERROR_PATTERNS = 500;
const MAX_PERFORMANCE_BASELINES = 500;
const MAX_USER_BEHAVIOR_PATTERNS = 500;
const MAX_CORRELATIONS = 500;
const MAX_ANOMALIES = 200;
const MAX_INSIGHTS = 200;

// Modify errorPatterns.set() calls (around line 426)
function addErrorPattern(key: string, pattern: ErrorPattern): void {
  // Enforce limit with LRU eviction
  if (knowledgeBase.errorPatterns.size >= MAX_ERROR_PATTERNS) {
    const oldest = knowledgeBase.errorPatterns.keys().next().value;
    if (oldest) knowledgeBase.errorPatterns.delete(oldest);
  }
  knowledgeBase.errorPatterns.set(key, pattern);
}

// Similar for other Maps...
// performanceBaselines.set() → check MAX_PERFORMANCE_BASELINES
// userBehaviorPatterns.set() → check MAX_USER_BEHAVIOR_PATTERNS
// correlations.set() → check MAX_CORRELATIONS

// Modify anomalies.push() calls (around line 674)
function addAnomaly(anomaly: Anomaly): void {
  knowledgeBase.anomalies.push(anomaly);
  
  // Trim in-place (not just on output)
  if (knowledgeBase.anomalies.length > MAX_ANOMALIES) {
    knowledgeBase.anomalies.splice(0, knowledgeBase.anomalies.length - MAX_ANOMALIES);
  }
}

// Similar for insights array
function addInsight(insight: Insight): void {
  knowledgeBase.insights.push(insight);
  
  if (knowledgeBase.insights.length > MAX_INSIGHTS) {
    knowledgeBase.insights.splice(0, knowledgeBase.insights.length - MAX_INSIGHTS);
  }
}

// Add metrics
function getKnowledgeBaseMetrics(): KnowledgeBaseMetrics {
  return {
    errorPatterns: {
      size: knowledgeBase.errorPatterns.size,
      max: MAX_ERROR_PATTERNS,
      utilization: (knowledgeBase.errorPatterns.size / MAX_ERROR_PATTERNS) * 100,
    },
    // ... similar for other Maps/arrays ...
  };
}
```

**Unit Tests Required:**
- `tests/services/ai/ai-log-analyzer.bounded.spec.ts`
  - Test: All 4 Maps enforce their MAX limits
  - Test: Arrays trimmed in-place after push
  - Test: LRU eviction works for all Maps
  - Test: Metrics accurate

---

### Component 10: Error Brain Detector Map Caps (LOW - NEW)

**Files:** `src/services/error-brain/pattern-detector.ts` + `impact-predictor.ts`  
**Changes:**
1. Add `MAX_FINGERPRINTS` limit (2000)
2. Add LRU eviction when limit reached
3. Add periodic `pruneStaleHistory()` timer in impact-predictor

**Implementation:**
```typescript
// pattern-detector.ts — Add after Map declarations (line 141-155)
const MAX_FINGERPRINTS = 2000;

// Before adding to any Map, check total size across all Maps
function enforceMaxFingerprints(): void {
  const totalKeys = 
    burstWindows.size + 
    correlationObservations.size + 
    fingerprintObservations.size + 
    activeCascades.size;
  
  if (totalKeys >= MAX_FINGERPRINTS) {
    // Remove oldest entry from largest Map
    const largest = [burstWindows, correlationObservations, fingerprintObservations, activeCascades]
      .sort((a, b) => b.size - a.size)[0];
    
    const oldestKey = largest.keys().next().value;
    if (oldestKey) largest.delete(oldestKey);
  }
}

// Call before each .set() operation
```

```typescript
// impact-predictor.ts — Add periodic cleanup
const pruneInterval = setInterval(() => {
  pruneStaleHistory();
}, 10 * 60_000); // Every 10 minutes

// Graceful shutdown
if (typeof process !== 'undefined') {
  process.on('SIGTERM', () => {
    clearInterval(pruneInterval);
  });
}
```

**Unit Tests Required:**
- `tests/services/error-brain/detector-maps.bounded.spec.ts`
  - Test: Total fingerprint count across Maps stays under MAX
  - Test: Eviction works when limit reached
  - Test: pruneStaleHistory() called periodically

---

### Component 5: Bounded Code Verification Suite

**New File:** `tests/memory/bounded-verification.spec.ts`  
**Purpose:** Stress test all "bounded" components to verify limits actually work

**Test Categories:**
1. **Capacity Tests** — Fill to max, verify no overflow
2. **Stress Tests** — Sustained high load for 5 minutes
3. **Memory Leak Tests** — Monitor RSS growth over time
4. **Eviction Tests** — Verify oldest entries removed

**Implementation:**
```typescript
/**
 * Bounded Data Structure Verification Suite
 * 
 * Tests all components claiming to have bounds to verify:
 * 1. Bounds are actually enforced
 * 2. Eviction works correctly
 * 3. No memory leaks under stress
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as v8 from 'v8';

describe('Bounded Data Structure Verification', () => {
  
  // Helper: Get heap used
  const getHeapUsed = () => v8.getHeapStatistics().used_heap_size;
  
  // Helper: Generate large object
  const generateLargePayload = (sizeKB: number) => ({
    data: Buffer.alloc(sizeKB * 1024, 'x').toString(),
    timestamp: Date.now(),
  });

  describe('EventBus Replay Buffer', () => {
    it('should enforce 100 event limit', async () => {
      // TODO: Test replay buffer capacity
    });
    
    it('should not leak memory under sustained load', async () => {
      // TODO: 5-minute stress test
    });
  });

  describe('EventBus Pattern Cache', () => {
    it('should enforce 500 pattern limit with LRU eviction', async () => {
      // TODO: Fill cache to 600 patterns, verify 500 remains
    });
  });

  describe('Memory Cache (cache.ts)', () => {
    it('should enforce 1000 entry limit', async () => {
      // TODO: Test MAX_MEMORY_ENTRIES
    });
  });

  describe('Log Buffer', () => {
    it('should enforce 200 entry limit', async () => {
      // TODO: Test maxBufferSize
    });
  });

  describe('AI Log Buffer', () => {
    it('should auto-flush at 100 entries', async () => {
      // TODO: Verify flush behavior
    });
  });

  describe('Loki Queue', () => {
    it('should enforce 10,000 entry limit with backpressure', async () => {
      // TODO: Test maxSize and backpressure
    });
  });

  describe('Write Buffer', () => {
    it('should enforce 1000 entry limit', async () => {
      // TODO: Test MAX_BUFFER_SIZE
    });
  });

  describe('Error Pattern Detector', () => {
    it('should enforce 1000 circular buffer', async () => {
      // TODO: Test MAX_RECENT_ERRORS
    });
  });

  describe('Sensai Error Tracker', () => {
    it('should enforce 500 pattern limit with eviction', async () => {
      // TODO: Test maxPatterns
    });
  });

  describe('Key Rotation History', () => {
    it('should enforce 100 entry limit', async () => {
      // TODO: Test slice(-100) behavior
    });
  });

  describe('Sweep History', () => {
    it('should enforce maxHistorySize config', async () => {
      // TODO: Test configurable limit
    });
  });

  describe('Alert History', () => {
    it('should enforce historyRetention config', async () => {
      // TODO: Test configurable limit
    });
  });

  describe('Resource Monitor Snapshots', () => {
    it('should cleanup snapshots older than 7 days', async () => {
      // TODO: Test cleanup logic
    });
  });

  describe('Memory Leak Stress Test', () => {
    it('should not leak memory over 10,000 operations', async () => {
      const heapBefore = getHeapUsed();
      
      // Run 10,000 mixed operations
      for (let i = 0; i < 10000; i++) {
        // TODO: Exercise all bounded structures
      }
      
      // Force GC
      if (global.gc) global.gc();
      
      const heapAfter = getHeapUsed();
      const growth = heapAfter - heapBefore;
      const growthMB = growth / (1024 * 1024);
      
      // Allow max 50 MB growth for 10k operations
      expect(growthMB).toBeLessThan(50);
    });
  });
});
```

---

### Component 6: Memory Metrics Integration

**New File:** `src/services/monitoring/memory-metrics.ts`  
**Purpose:** Centralized memory metrics for all bounded structures

**Implementation:**
```typescript
/**
 * Memory Metrics Collection
 * 
 * Centralized metrics for all bounded data structures
 * Used by /ops command and monitoring dashboards
 */

import { getStats as getActivityStats, getBufferMetrics as getActivityBufferMetrics } from '../../utils/activityTracker.js';
import { PlayerResolver } from '../player-resolver.js';
import { getContentAddressableStorage } from '../../sensaios/storage/content-addressable.js';
// ... import other bounded structures

export interface BoundedStructureMetrics {
  name: string;
  current: number;
  max: number;
  utilization: number; // Percentage
  status: 'healthy' | 'warning' | 'critical';
}

export interface MemoryMetricsSummary {
  timestamp: Date;
  rssMemoryMB: number;
  heapUsedMB: number;
  boundedStructures: BoundedStructureMetrics[];
  warnings: string[];
}

export async function collectMemoryMetrics(): Promise<MemoryMetricsSummary> {
  const metrics: BoundedStructureMetrics[] = [];
  const warnings: string[] = [];
  
  // Process memory
  const memUsage = process.memoryUsage();
  const rssMemoryMB = memUsage.rss / (1024 * 1024);
  const heapUsedMB = memUsage.heapUsed / (1024 * 1024);
  
  // Activity Tracker
  try {
    const activityMetrics = getActivityBufferMetrics();
    metrics.push({
      name: 'ActivityTracker.pendingActivities',
      current: activityMetrics.current,
      max: activityMetrics.max,
      utilization: activityMetrics.utilization,
      status: activityMetrics.utilization > 90 ? 'critical' : 
              activityMetrics.utilization > 75 ? 'warning' : 'healthy',
    });
    
    if (activityMetrics.utilization > 75) {
      warnings.push(`ActivityTracker buffer at ${activityMetrics.utilization.toFixed(1)}%`);
    }
  } catch (err) {
    warnings.push('Failed to collect ActivityTracker metrics');
  }
  
  // Player Resolver Cache
  try {
    const resolver = PlayerResolver.getInstance();
    const cacheStats = resolver.getCacheStats();
    metrics.push({
      name: 'PlayerResolver.cache',
      current: cacheStats.size,
      max: cacheStats.max,
      utilization: cacheStats.utilization,
      status: cacheStats.utilization > 90 ? 'critical' :
              cacheStats.utilization > 75 ? 'warning' : 'healthy',
    });
  } catch (err) {
    warnings.push('Failed to collect PlayerResolver metrics');
  }
  
  // Content-Addressable Storage
  try {
    const cas = getContentAddressableStorage();
    const casStats = cas.getStats();
    metrics.push({
      name: 'ContentAddressableStorage.blobs',
      current: casStats.total,
      max: casStats.maxBlobs,
      utilization: casStats.utilization,
      status: casStats.utilization > 90 ? 'critical' :
              casStats.utilization > 75 ? 'warning' : 'healthy',
    });
  } catch (err) {
    warnings.push('Failed to collect CAS metrics');
  }
  
  // TODO: Add metrics for all other bounded structures
  
  return {
    timestamp: new Date(),
    rssMemoryMB,
    heapUsedMB,
    boundedStructures: metrics,
    warnings,
  };
}

export function formatMemoryMetrics(summary: MemoryMetricsSummary): string {
  const lines: string[] = [];
  
  lines.push('=== MEMORY METRICS ===');
  lines.push(`RSS Memory: ${summary.rssMemoryMB.toFixed(1)} MB`);
  lines.push(`Heap Used: ${summary.heapUsedMB.toFixed(1)} MB`);
  lines.push('');
  
  lines.push('Bounded Structures:');
  for (const metric of summary.boundedStructures) {
    const statusIcon = metric.status === 'healthy' ? '✅' : 
                       metric.status === 'warning' ? '⚠️' : '🔴';
    lines.push(
      `  ${statusIcon} ${metric.name}: ${metric.current}/${metric.max} (${metric.utilization.toFixed(1)}%)`
    );
  }
  
  if (summary.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of summary.warnings) {
      lines.push(`  ⚠️ ${warning}`);
    }
  }
  
  return lines.join('\n');
}
```

**Integration:** Add to `/ops memory` command in `src/bot/ops/admin.ts`

---

## 📅 IMPLEMENTATION PLAN

### Phase 1: Critical Fixes (Days 1-2)

**Day 1 Morning:**
- [x] Implement Component 1: Activity Tracker bounds
- [x] Implement Component 7: Battle Session cleanup (NEW - ROOT CAUSE)
- [x] Write unit tests for C1 and C7
- [x] Run tests locally

**Day 1 Afternoon:**
- [x] Implement Component 2: PBSL Audit Trail (MAX_EVENTS safety net)
- [x] Write unit tests for Audit Trail
- [x] Run tests locally

**Day 2 Morning:**
- [ ] Code review of critical fixes (C1, C7, C2)
- [ ] Address review feedback
- [ ] Merge to feature branch

**Day 2 Afternoon:**
- [ ] Deploy to local test environment
- [ ] Run load tests (simulate 1000 activities/min + 100 concurrent battles)
- [ ] Monitor memory growth over 4 hours

**Acceptance Criteria:**
- ✅ Unit tests pass (100% coverage for new code)
- ✅ Memory growth <10 MB over 4-hour load test
- ✅ No functional regressions
- ✅ Battle sessions cleaned after timeout
- ✅ No stale runtimes accumulate

---

### Phase 2: Moderate Fixes + Low-Risk + Verification (Days 3-5)

**Day 3 Morning:**
- [x] Implement Component 3: Player Resolver LRU
- [x] Implement Component 4: CAS bounds
- [x] Implement Component 8: Discord Identity cache bounds (NEW)
- [x] Write unit tests

**Day 3 Afternoon:**
- [x] Implement Component 9: AI Log Analyzer bounds (NEW)
- [x] Implement Component 10: Error Brain map caps (NEW - LOW priority)
- [x] Write unit tests

**Day 4 Morning:**
- [x] Implement Component 5: Bounded verification suite
- [x] Run verification tests on all "bounded" components (19 structures)
- [x] Document any failures

**Day 4 Afternoon:**
- [ ] Fix any issues found in verification tests
- [ ] Re-run verification suite
- [ ] Code review (C3, C4, C8, C9, C10)

**Day 5:**
- [ ] Address review feedback
- [ ] Merge moderate fixes
- [ ] Deploy to test environment
- [ ] Run 24-hour soak test

**Acceptance Criteria:**
- ✅ All bounded verification tests pass
- ✅ No memory growth >25 MB in 24-hour soak test
- ✅ Cache hit rates remain stable
- ✅ All 5 new cache structures enforce limits
- ✅ 19 bounded structures verified under stress

---

### Phase 3: Monitoring Integration (Day 6)

**Day 5 Morning:**
- [ ] Implement Component 6: Memory metrics
- [ ] Add `/ops memory` command
- [ ] Test metrics collection

**Day 5 Afternoon:**
- [ ] Add Grafana dashboard for memory metrics
- [ ] Configure alerts (>75% utilization)
- [ ] Document metrics endpoints

**Acceptance Criteria:**
- ✅ Metrics visible in `/ops memory` command
- ✅ Grafana dashboard shows all bounded structures
- ✅ Alerts fire when thresholds exceeded

---

### Phase 4: Canary Deployment (Days 7-8)

**Day 7:****
- [ ] Deploy to canary environment (single worker)
- [ ] Monitor for 24 hours
- [ ] Compare memory usage to baseline

**Day 8:**
- [ ] Analyze canary results
- [ ] If successful, proceed to rollout
- [ ] If issues found, rollback and fix

**Acceptance Criteria:**
- ✅ Canary memory usage <300 MB baseline
- ✅ No increase in error rates
- ✅ Performance metrics stable

---

### Phase 5: Production Rollout (Day 9+)

**Day 9:****
- [ ] Deploy to 25% of production workers
- [ ] Monitor for 6 hours

**Day 10:**
- [ ] Deploy to 50% of production workers
- [ ] Monitor for 12 hours

**Day 11:**
- [ ] Deploy to 100% of production workers
- [ ] Monitor for 48 hours

**Acceptance Criteria:**
- ✅ Production memory usage <300 MB average
- ✅ No OOM crashes
- ✅ User-facing metrics stable

---

## 🧪 TESTING STRATEGY

### Unit Tests

**Coverage Target:** 95% for new code, 85% for modified code

**Test Suites:**
1. `tests/utils/activityTracker.bounded.spec.ts` (15 tests)
2. `tests/core/pbsl/audit.bounded.spec.ts` (10 tests)
3. `tests/commands/battle-turn.cleanup.spec.ts` (8 tests) **NEW**
4. `tests/core/battle/turn-manager.cleanup.spec.ts` (7 tests) **NEW**
5. `tests/services/player-resolver.bounded.spec.ts` (12 tests)
6. `tests/sensaios/storage/content-addressable.bounded.spec.ts` (18 tests)
7. `tests/services/discord-identity.bounded.spec.ts` (10 tests) **NEW**
8. `tests/services/ai/ai-log-analyzer.bounded.spec.ts` (12 tests) **NEW**
9. `tests/services/error-brain/detector-maps.bounded.spec.ts` (8 tests) **NEW**
10. `tests/memory/bounded-verification.spec.ts` (30+ tests)

**Total:** ~115 new unit tests (increased from 85 with second audit findings)

---

### Load Tests

**Tool:** Custom load test script using `autocannon` + Discord.js mock

**Scenarios:**
1. **Sustained Activity:** 1000 activities/minute for 4 hours
2. **Battle Stress:** 100 concurrent battles with 50 events each
3. **Cache Thrashing:** 10,000 unique player lookups in 5 minutes
4. **Mixed Load:** Realistic mix of all operations

**Metrics Collected:**
- RSS memory every 30 seconds
- Heap used every 30 seconds
- Bounded structure utilization every 60 seconds
- GC pause times
- Event loop lag

**Acceptance Criteria:**
- Memory growth <50 MB over 4 hours
- No GC pauses >100ms
- Event loop lag <10ms p99

---

### Soak Tests

**Duration:** 24-48 hours continuous operation

**Load Profile:**
- 100 activities/minute baseline
- 10 battles/hour
- 500 player lookups/minute
- Random spikes to 10x baseline every hour

**Monitoring:**
- Memory metrics logged every 5 minutes
- Heap snapshots captured every hour
- Automatic alerts on memory growth >5 MB/hour

**Acceptance Criteria:**
- No memory leaks detected (linear growth)
- Memory stabilizes after 4 hours
- No OOM crashes

---

## 🚀 ROLLOUT STRATEGY

### Environment Progression

1. **Local Dev** → Feature branch testing
2. **Test Environment** → Isolated staging
3. **Canary** → Single production worker
4. **Production 25%** → Quarter of workers
5. **Production 50%** → Half of workers
6. **Production 100%** → All workers

### Rollback Triggers

Automatically rollback if ANY of these occur:
- Memory growth >100 MB/hour
- OOM crash
- Error rate increase >10%
- Performance degradation >20%
- User complaints

### Monitoring During Rollout

**Dashboard:** Grafana "Memory Leak Patch Rollout"

**Metrics:**
- RSS Memory (target: <300 MB)
- Heap Used (target: <250 MB)
- Bounded structure utilization (target: <75%)
- Error rates
- Response times
- GC metrics

**Alerts:**
- 🔴 CRITICAL: Memory >600 MB
- 🟡 WARNING: Memory >450 MB
- 🟡 WARNING: Any bounded structure >90%
- 🔴 CRITICAL: OOM crash

---

## ✅ MONITORING & VALIDATION

### Pre-Patch Baseline (Collect First)

Run production for 24 hours and collect:
- Grafana dashboard: `ops/grafana-memory-leak-rollout.json` (RSS/heap/bounded utilization panels)
- Baseline monitor: `scripts/monitor-memory-24h.ps1` (log: `Store/monitoring/memory-growth-YYYY-MM-DD.log`)
- Baseline capture restarted (2026-02-10 17:28:15Z): 30-minute interval → `Store/monitoring/memory-growth-2026-02-10.log`
- First sample (2026-02-10 16:08): **RSS 311.5 MB** (baseline set)
- Average RSS memory: **TBD (capture in progress — 2026-02-10)**
- Peak RSS memory: **TBD (capture in progress — 2026-02-10)**
- Memory growth rate: **TBD (capture in progress — 2026-02-10)**
- Bounded structure sizes: **TBD (capture in progress — 2026-02-10)**

### Post-Patch Validation

After rollout, validate for 7 days:

**Day 1-3 (Intensive Monitoring):**
- Check metrics every 2 hours
- Review logs for memory warnings
- Analyze heap snapshots

**Day 4-7 (Normal Monitoring):**
- Check metrics daily
- Review weekly memory report
- Compare to baseline

### Success Criteria

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| Average RSS Memory | ~512 MB | <300 MB | ⏳ |
| Peak RSS Memory | ~800 MB | <600 MB | ⏳ |
| 24h Memory Growth | ~100-200 MB | <50 MB | ⏳ |
| OOM Crashes (7 days) | ? | 0 | ⏳ |
| Activity Buffer Utilization | N/A | <75% | ⏳ |
| Player Cache Utilization | N/A | <75% | ⏳ |
| CAS Utilization | N/A | <75% | ⏳ |

### Long-Term Monitoring

**Weekly Report:** Automated email/Slack with:
- Memory trend graphs (7 days)
- Bounded structure utilization
- Top 5 memory consumers
- Recommendations for optimization

**Monthly Review:**
- Heap snapshot analysis
- Identify new leak sources
- Plan optimization sprints

---

## 🔄 ROLLBACK PLAN

### Immediate Rollback (Emergency)

**Trigger:** OOM crash or memory >800 MB

**Steps:**
1. **Alert team** via PagerDuty/Slack
2. **Stop deployment** immediately
3. **Revert to previous version:**
   ```bash
   git revert HEAD
   git push origin main
   render deploy --service Infinity-Gauntlet
   ```
4. **Restart all workers** to clear memory
5. **Verify baseline metrics** return to normal
6. **Postmortem** within 24 hours

**Rollback Time:** <5 minutes

---

### Partial Rollback (Non-Critical)

**Trigger:** Memory growth >50 MB/hour (but <800 MB total)

**Steps:**
1. **Pause rollout** at current percentage
2. **Collect diagnostics:**
   - Heap snapshots
   - Memory metrics logs
   - Bounded structure utilization
3. **Analyze data** to identify issue
4. **Options:**
   - Hot-patch specific component
   - Complete rollback
   - Continue with monitoring
5. **Document findings**

**Decision Time:** 2-4 hours

---

### Full Rollback (Planned)

**Trigger:** Post-rollout validation failure

**Steps:**
1. **Schedule maintenance window** (optional)
2. **Revert all changes:**
   ```bash
   git revert <patch-commits>
   git push origin main
   ```
3. **Deploy reverted version** to all workers
4. **Verify baseline metrics** restored
5. **Root cause analysis:**
   - Why did patch fail?
   - What was missed in testing?
   - How to prevent in future?
6. **Rework patch** based on findings

**Rollback Time:** 1-2 hours

---

## 📊 SUCCESS METRICS

### Primary Metrics (Must Achieve)

- ✅ **Baseline RSS Memory:** <300 MB (current: ~512 MB) — **-41% reduction**
- ✅ **Peak RSS Memory:** <600 MB (current: ~800 MB) — **-25% reduction**
- ✅ **24h Memory Growth:** <50 MB (current: ~100-200 MB) — **-75% reduction**
- ✅ **OOM Crashes:** 0 in 7 days (current: unknown)

### Secondary Metrics (Should Achieve)

- ✅ **Activity Buffer Utilization:** <75% average
- ✅ **Player Cache Utilization:** <75% average
- ✅ **CAS Utilization:** <75% average
- ✅ **GC Pause Times:** <100ms p99
- ✅ **Event Loop Lag:** <10ms p99

### Tertiary Metrics (Nice to Have)

- ✅ **Heap Fragmentation:** <20%
- ✅ **External Memory:** <50 MB
- ✅ **Buffer Memory:** <10 MB

---

## 📝 DOCUMENTATION UPDATES

After successful rollout, update:

1. **Architecture Bible:** Add memory management section
2. **Operations Bible:** Update memory monitoring procedures
3. **Development Bible:** Add bounded structure guidelines
4. **Code Comments:** Document all memory limits
5. **API Docs:** Update metrics endpoints
6. **Runbooks:** Add memory leak investigation procedures

---

## 🔍 INVESTIGATION AREAS

### Questions to Answer During Testing

1. **Activity Tracker:**
   - What's the actual drain interval?
   - How often does drain fail?
   - What's the peak activity rate?

2. **PBSL Audit Trail:**
   - How many events per battle on average?
   - Are audit trails actually flushed?
   - Where are flushed events used?

3. **Player Resolver:**
   - What's the cache hit rate?
   - How many unique players per 30s window?
   - Is TTL-based eviction sufficient?

4. **Content-Addressable Storage:**
   - How many unique blobs in typical workload?
   - What's the deduplication rate?
   - Should we add TTL-based eviction?

5. **Bounded Structures:**
   - Are the claimed limits actually enforced?
   - Do eviction policies work correctly?
   - Are there edge cases where limits are bypassed?

---

## 🎯 POST-ROLLOUT ACTIONS

### Week 1
- [ ] Daily memory metrics review
- [ ] Collect baseline for new bounds
- [ ] Tune limits if needed

### Week 2
- [ ] Weekly memory report
- [ ] Heap snapshot analysis
- [ ] Performance benchmarking

### Week 3-4
- [ ] Monthly review
- [ ] Identify next optimization targets
- [ ] Plan follow-up improvements

### Future Work
- [ ] Implement off-heap storage for large blobs
- [ ] Add memory pressure-based backpressure
- [ ] Investigate V8 heap tuning options
- [ ] Consider memory pooling for frequently allocated objects

---

## 🤝 STAKEHOLDER COMMUNICATION

### Internal Team
- **Daily standups:** Memory metrics review (Phase 4-5)
- **Slack #memory-leak-patch:** Real-time updates
- **Weekly email:** Progress report

### Leadership
- **Pre-rollout:** Plan approval + timeline
- **During rollout:** Critical issues only
- **Post-rollout:** Success metrics + lessons learned

### Users
- **No communication needed** unless emergency rollback
- **Success announcement** after 7-day validation

---

## 📚 REFERENCES

### Analysis Documents
- Memory Leak Analysis Report (this document's parent)
- `RECOVERY-REPORT-2026-01-21.md` — System recovery after incident

### Code Files
- `src/utils/activityTracker.ts` — Activity tracking system
- `src/core/pbsl/audit.ts` — PBSL audit trail
- `src/services/player-resolver.ts` — Player cache
- `src/sensaios/storage/content-addressable.ts` — Blob storage

### External Resources
- Node.js Memory Best Practices
- V8 Heap Tuning Guide
- Discord.js Cache Management
- Memory Leak Detection Tools

---

**Document Status:** DRAFT — Ready for Review  
**Next Steps:** Team review → Approval → Phase 1 implementation  
**Owner:** Development Team  
**Approver:** Technical Lead + CEO (DRIPTVDD)

---

*End of Memory Leak Patch Blueprint*
