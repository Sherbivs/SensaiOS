# Security Bot State Persistence - Specialist Review Report

**Date:** 2025-12-21
**Review Team:** Recovery, Memory Efficiency, Resilience, Operations Specialists
**Scope:** Live memory capability enhancement for minimal restart recovery time

---

## Executive Summary

The current state persistence system is **well-architected for basic needs** but has significant opportunities for "live memory" enhancement. Current estimated cold boot time is **50-100ms** for state load + **500ms-2s** for full Discord client ready. The main gaps are:

1. **No in-flight operation persistence** - Sweeps/operations in progress are lost
2. **No binary serialization** - JSON parsing overhead on large states
3. **No checksum validation** on main state file (unlike roleArchive which has HMAC)
4. **No operation queue persistence** - Event Bus messages lost on restart
5. **No lazy loading** - Full state loaded regardless of what's needed

---

## 🔴 RECOVERY SPECIALIST ANALYSIS

### Current Cold Boot Behavior

| Phase | Location | Time | Notes |
|-------|----------|------|-------|
| State Directory Check | [persistence.ts#L296-L310](src/bot/state/persistence.ts#L296-L310) | ~5ms | `fs.mkdir` recursive |
| Load current.json | [persistence.ts#L265-L282](src/bot/state/persistence.ts#L265-L282) | 10-30ms | JSON parse |
| Fallback to previous.json | [persistence.ts#L269-L271](src/bot/state/persistence.ts#L269-L271) | 10-30ms | If current missing |
| State Migration | [persistence.ts#L128-L137](src/bot/state/persistence.ts#L128-L137) | ~1ms | Version check only |
| Create Snapshot | [persistence.ts#L212-L223](src/bot/state/persistence.ts#L212-L223) | 20-50ms | JSON stringify + write |
| Prune Old Snapshots | [persistence.ts#L228-L254](src/bot/state/persistence.ts#L228-L254) | 10-50ms | Directory scan |
| **TOTAL STATE INIT** | | **~50-170ms** | |

### State Lost on Restart

From [main.ts#L2920-L2940](src/bot/main.ts#L2920-L2940), these are RESET on every restart:
```typescript
runtime: {
  currentUptime: 0,                    // ✓ Expected
  currentRestartTime: now,             // ✓ Expected
  databaseStatus: { dev: 'unknown', prod: 'unknown' },  // ⚠️ Could warm
  activeSweepIntervals: []             // ❌ LOST - sweeps must restart
}
```

### Enhancement Opportunities - Cold Boot Speed

#### A1. Binary State Serialization (MEDIUM PRIORITY)
**Location:** [persistence.ts#L167-L178](src/bot/state/persistence.ts#L167-L178)
**Current:** JSON.parse() on every load
**Enhancement:** MessagePack or Protocol Buffers

```typescript
// Current (persistence.ts L155-160)
const data = await fs.readFile(filePath, 'utf8');
const state = JSON.parse(data);

// Proposed - Binary with fallback
import msgpack from '@msgpack/msgpack';
const buffer = await fs.readFile(filePath);
const state = buffer[0] === 0x80 ? msgpack.decode(buffer) : JSON.parse(buffer.toString());
```

**Impact:** 2-3x faster parse for large states
**Complexity:** LOW - drop-in replacement with fallback
**Estimated Gain:** 10-20ms on typical state

#### A2. Pre-computed Indexes (LOW PRIORITY)
**Location:** [context.ts#L78-L90](src/bot/state/context.ts#L78-L90)
**Current:** Full object iteration in `getGuildsNeedingSweep()`

```typescript
// Current - O(n) scan
return Object.values(state.guilds)
  .filter((guild: GuildState) => guild.monitoring && isSweepOverdue(...))

// Proposed - Maintain sorted index on lastSweep
interface StateIndexes {
  guildsByLastSweep: string[];  // Pre-sorted guild IDs
  monitoredGuildIds: Set<string>;
}
```

**Impact:** Instant sweep priority on restart
**Complexity:** MEDIUM - must maintain on every update

#### A3. Warm Database Status on Boot (QUICK WIN ✅)
**Location:** [main.ts#L2925-L2927](src/bot/main.ts#L2925-L2927)
**Current:** Hardcoded `{ dev: 'unknown', prod: 'unknown' }`
**Fix:** Test connections in parallel during state init

```typescript
// Add to initializeState()
const [devStatus, prodStatus] = await Promise.all([
  prisma.$connect().then(() => 'connected').catch(() => 'disconnected'),
  prodPrisma.$connect().then(() => 'connected').catch(() => 'disconnected')
]);
state.runtime.databaseStatus = { dev: devStatus, prod: prodStatus };
```

**Impact:** Accurate status from first /ops command
**Complexity:** LOW

---

## 🟡 MEMORY EFFICIENCY SPECIALIST ANALYSIS

### Current Memory Footprint

| Structure | Location | Max Size | Typical Size |
|-----------|----------|----------|--------------|
| Timeline events | [persistence.ts#L39](src/bot/state/persistence.ts#L39) | 100 entries | ~50KB |
| Metrics history | [persistence.ts#L41](src/bot/state/persistence.ts#L41) | 168 hours (7 days) | ~20KB |
| Guild states | `state.guilds` | Unbounded | ~5KB/guild |
| Role archive | [roleArchive.ts#L48](src/bot/state/roleArchive.ts#L48) | 500 entries | ~75KB (from disk scan) |
| **Total State** | | | **~150-200KB typical** |

### Serialization Performance

From [persistence.ts#L174-L178](src/bot/state/persistence.ts#L174-L178):
```typescript
const json = JSON.stringify(state, null, 2);  // Pretty-printed!
await fs.writeFile(filePath, json, 'utf8');
```

**Issue:** Pretty-printing adds ~30% file size and parsing overhead

### Enhancement Opportunities - Memory

#### B1. Compact Serialization Mode (QUICK WIN ✅)
**Location:** [persistence.ts#L174](src/bot/state/persistence.ts#L174)
**Current:** `JSON.stringify(state, null, 2)` - pretty-printed
**Fix:** Compact for production, pretty for dev

```typescript
const json = process.env.RENDER 
  ? JSON.stringify(state)  // Compact in production
  : JSON.stringify(state, null, 2);  // Pretty for local dev
```

**Impact:** 20-30% smaller files, faster parse
**Complexity:** TRIVIAL

#### B2. Lazy Loading for Metrics History (MEDIUM PRIORITY)
**Location:** [persistence.ts#L480-L530](src/bot/state/persistence.ts#L480-L530)
**Current:** Full 7-day metrics loaded on every boot
**Enhancement:** Store separately, load on demand

```typescript
// Proposed structure
Store/security-bot-state/
├── current.json        // Core state (5-10KB)
├── metrics/
│   ├── current-hour.json
│   └── hourly/
│       ├── 2025-12-21T00.json
│       └── 2025-12-21T01.json
```

**Impact:** 80% reduction in initial load size
**Complexity:** MEDIUM - requires schema migration

#### B3. LRU Eviction for Guild States (LOW PRIORITY)
**Location:** [types.ts#L82-L92](src/bot/state/types.ts#L82-L92)
**Current:** All guild states kept forever
**Enhancement:** Evict guilds inactive >30 days

```typescript
// Add to pruneMetricsHistory() or new pruneGuilds()
const inactiveThreshold = 30 * 24 * 60 * 60 * 1000;
for (const [guildId, guild] of Object.entries(state.guilds)) {
  const lastActivity = new Date(guild.lastActivity).getTime();
  if (Date.now() - lastActivity > inactiveThreshold && !guild.monitoring) {
    delete state.guilds[guildId];
  }
}
```

**Impact:** Prevents unbounded guild state growth
**Complexity:** LOW

---

## 🔵 RESILIENCE SPECIALIST ANALYSIS

### Current Corruption Handling

| File | Integrity Check | Recovery Strategy |
|------|-----------------|-------------------|
| current.json | ❌ None | Falls back to previous.json |
| previous.json | ❌ None | Creates default state |
| role-changes.json | ✅ HMAC-SHA256 | Restores from backup |
| baselines.json | ✅ HMAC-SHA256 | Regenerates |
| snapshots/*.json | ❌ None | Not used in recovery |

**Critical Gap:** Main state file has NO checksum validation

### Corruption Scenarios

1. **Partial Write (Power Loss):** [persistence.ts#L174-L178](src/bot/state/persistence.ts#L174-L178)
   - Current: No atomic write
   - Risk: Truncated JSON = total state loss

2. **Invalid JSON:** [persistence.ts#L155-L160](src/bot/state/persistence.ts#L155-L160)
   - Current: Falls to previous.json
   - Risk: If both corrupt, lose all history

3. **Schema Mismatch:** [persistence.ts#L117-L137](src/bot/state/persistence.ts#L117-L137)
   - Current: Validates required fields exist
   - Good: Has migration infrastructure

### Enhancement Opportunities - Resilience

#### C1. Atomic Write with Checksum (HIGH PRIORITY ⚠️)
**Location:** [persistence.ts#L167-L178](src/bot/state/persistence.ts#L167-L178)
**Current:** Direct write (not atomic)

```typescript
// Current - NOT ATOMIC
async function saveStateFile(filePath: string, state: SecurityBotState): Promise<boolean> {
  const json = JSON.stringify(state, null, 2);
  await fs.writeFile(filePath, json, 'utf8');  // ❌ Can corrupt on interrupt
}

// Proposed - Atomic with checksum
async function saveStateFile(filePath: string, state: SecurityBotState): Promise<boolean> {
  const json = JSON.stringify(state);
  const checksum = crypto.createHash('sha256').update(json).digest('hex');
  const payload = JSON.stringify({ data: state, checksum, savedAt: Date.now() });
  
  const tempPath = `${filePath}.tmp.${process.pid}`;
  await fs.writeFile(tempPath, payload, 'utf8');
  await fs.rename(tempPath, filePath);  // Atomic on POSIX
}
```

**Impact:** Prevents corrupted state files
**Complexity:** MEDIUM

#### C2. Checksum Validation on Load (HIGH PRIORITY ⚠️)
**Location:** [persistence.ts#L151-L165](src/bot/state/persistence.ts#L151-L165)

```typescript
// Add after JSON.parse
if (parsed.checksum) {
  const dataJson = JSON.stringify(parsed.data);
  const expectedChecksum = crypto.createHash('sha256').update(dataJson).digest('hex');
  if (expectedChecksum !== parsed.checksum) {
    log('error', '[State] Checksum mismatch - file corrupted');
    return null;  // Triggers fallback chain
  }
  return migrateState(parsed.data);
}
```

**Impact:** Detects corruption before use
**Complexity:** LOW

#### C3. Snapshot-Based Recovery (MEDIUM PRIORITY)
**Location:** [persistence.ts#L212-L223](src/bot/state/persistence.ts#L212-L223)
**Current:** Snapshots created but never used for recovery

```typescript
// Add to loadState() fallback chain
async function loadFromLatestSnapshot(): Promise<SecurityBotState | null> {
  const files = await fs.readdir(SNAPSHOTS_DIR);
  const sorted = files.filter(f => f.endsWith('.json')).sort().reverse();
  for (const file of sorted.slice(0, 5)) {
    const state = await loadStateFile(path.join(SNAPSHOTS_DIR, file));
    if (state) {
      log('warn', '[State] Recovered from snapshot', { file });
      return state;
    }
  }
  return null;
}
```

**Impact:** Additional recovery layer
**Complexity:** LOW

---

## 🟢 OPERATIONS SPECIALIST ANALYSIS

### In-Flight Operations (Critical Gap)

**Current State:** NO in-flight operations are persisted

| Operation | Persistence | On Restart |
|-----------|-------------|------------|
| Active sweep | ❌ Lost | Restarts from beginning |
| Permission revert | ❌ Lost | User may be left with wrong perms |
| Pending alerts | ❌ Event Bus only | Lost entirely |
| Drip digest queue | ❌ In-memory | Lost - digest fails |

### Queue State Analysis

From [dripAlerts.ts#L160](src/bot/dripAlerts.ts#L160):
```typescript
// Phase 2.3.3: Removed in-memory queue, using Event Bus exclusively
```

**Issue:** Event Bus has no persistence - all pending events lost on restart.

### Enhancement Opportunities - Operations

#### D1. Sweep Checkpoint System (HIGH PRIORITY ⚠️)
**Location:** [main.ts](src/bot/main.ts) - sweep functions
**Current:** Sweeps track nothing between restarts

```typescript
// Proposed: Add to state/types.ts
interface SweepCheckpoint {
  sweepId: string;
  guildId: string;
  startedAt: string;
  lastProcessedMemberId: string;
  membersProcessed: number;
  totalMembers: number;
  changesFound: number;
}

interface RuntimeState {
  // ... existing fields
  activeSweepCheckpoint?: SweepCheckpoint;
}
```

```typescript
// In sweep loop, checkpoint every N members
if (processedCount % 100 === 0) {
  state.runtime.activeSweepCheckpoint = {
    sweepId,
    guildId,
    startedAt: startTime,
    lastProcessedMemberId: member.id,
    membersProcessed: processedCount,
    totalMembers,
    changesFound
  };
  await saveState(state);
}
```

**Impact:** Resume sweeps after restart instead of restart
**Complexity:** HIGH - requires sweep loop refactor

#### D2. Operation Journal (MEDIUM PRIORITY)
**Location:** New file needed
**Purpose:** Write-ahead log for critical operations

```typescript
// Proposed: src/bot/state/operationJournal.ts
interface JournalEntry {
  id: string;
  operation: 'permission_revert' | 'role_assignment' | 'alert_send';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  payload: unknown;
  startedAt: string;
  completedAt?: string;
  retryCount: number;
}

// On restart, replay incomplete entries
async function replayJournal(): Promise<void> {
  const entries = await loadJournal();
  for (const entry of entries.filter(e => e.status !== 'completed')) {
    await retryOperation(entry);
  }
}
```

**Impact:** No dropped permission reverts
**Complexity:** HIGH

#### D3. Drip Alert Queue Persistence (QUICK WIN ✅)
**Location:** [dripAlerts.ts](src/bot/dripAlerts.ts)
**Current:** In-memory queue via Event Bus

```typescript
// Add to dripAlerts.ts
const DIGEST_QUEUE_FILE = path.join(STATE_DIR, 'pending-digest.json');

async function persistDigestQueue(alerts: DigestAlert[]): Promise<void> {
  await fs.writeFile(DIGEST_QUEUE_FILE, JSON.stringify(alerts), 'utf8');
}

async function loadDigestQueue(): Promise<DigestAlert[]> {
  try {
    const data = await fs.readFile(DIGEST_QUEUE_FILE, 'utf8');
    return JSON.parse(data);
  } catch { return []; }
}
```

**Impact:** Digest alerts survive restart
**Complexity:** LOW

---

## Priority Matrix

### Quick Wins (Can implement immediately)

| Enhancement | Location | Effort | Impact |
|-------------|----------|--------|--------|
| B1. Compact JSON | [persistence.ts#L174](src/bot/state/persistence.ts#L174) | 1 line | 20% faster |
| A3. Warm DB Status | [main.ts#L2925](src/bot/main.ts#L2925) | 10 lines | Better UX |
| D3. Drip Queue Persist | [dripAlerts.ts](src/bot/dripAlerts.ts) | 30 lines | No lost digests |

### High Priority (Critical for live memory)

| Enhancement | Location | Effort | Impact |
|-------------|----------|--------|--------|
| C1. Atomic Write | [persistence.ts#L167](src/bot/state/persistence.ts#L167) | 20 lines | Prevent corruption |
| C2. Checksum Validation | [persistence.ts#L151](src/bot/state/persistence.ts#L151) | 15 lines | Detect corruption |
| D1. Sweep Checkpoints | [main.ts](src/bot/main.ts) | 100+ lines | Resume sweeps |

### Medium Priority (Good improvements)

| Enhancement | Location | Effort | Impact |
|-------------|----------|--------|--------|
| A1. Binary Serialization | [persistence.ts](src/bot/state/persistence.ts) | 50 lines | 2-3x parse speed |
| B2. Lazy Metrics | [persistence.ts#L480](src/bot/state/persistence.ts#L480) | Schema change | 80% smaller boot |
| C3. Snapshot Recovery | [persistence.ts#L265](src/bot/state/persistence.ts#L265) | 30 lines | Extra safety net |
| D2. Operation Journal | New file | 200+ lines | No dropped ops |

### Low Priority (Nice to have)

| Enhancement | Location | Effort | Impact |
|-------------|----------|--------|--------|
| A2. Pre-computed Indexes | [context.ts](src/bot/state/context.ts) | 80 lines | Faster lookups |
| B3. LRU Guild Eviction | [persistence.ts](src/bot/state/persistence.ts) | 20 lines | Bounded growth |

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
1. ✅ Quick wins (B1, A3, D3)
2. ⚠️ Checksum validation (C1, C2)
3. Test corruption recovery scenarios

### Phase 2: Resilience (Week 2)  
1. Snapshot-based recovery (C3)
2. Sweep checkpointing (D1)
3. Benchmark cold boot times

### Phase 3: Optimization (Week 3)
1. Binary serialization (A1)
2. Lazy metrics loading (B2)
3. Memory profiling

### Phase 4: Full Live Memory (Week 4)
1. Operation journal (D2)
2. Pre-computed indexes (A2)
3. Final integration testing

---

## Test Scenarios to Add

```typescript
// tests/state/persistence.spec.ts additions
describe('Corruption Recovery', () => {
  it('should detect corrupted current.json via checksum');
  it('should fallback to previous.json on corruption');
  it('should fallback to latest snapshot on double corruption');
  it('should initialize fresh state on total corruption');
});

describe('Cold Boot Performance', () => {
  it('should load state in under 100ms');
  it('should resume sweep checkpoint after restart');
  it('should restore pending digest alerts');
});

describe('Atomic Writes', () => {
  it('should not corrupt state on simulated power loss');
  it('should leave valid state after interrupted write');
});
```

---

## Conclusion

The current system has a **solid foundation** but lacks:
1. **Integrity validation** for the main state file (unlike roleArchive which has HMAC)
2. **Operation continuity** - no checkpointing or journaling
3. **Corruption recovery** - snapshots exist but aren't used

The quick wins (B1, A3, D3) can be implemented in under an hour and provide immediate benefit. The high-priority items (C1, C2, D1) are essential for true "live memory" capability and should be prioritized.

**Estimated effort for full live memory:** 2-3 weeks
**Estimated cold boot time after optimization:** <30ms state load, near-instant operation resume
