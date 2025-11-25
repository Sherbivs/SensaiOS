# Seamless Restart Architecture — 65 Day Implementation Plan

**Goal**: Enable the entire application to continue seamlessly after 12-hour auto-restarts with ZERO user disruption and ZERO data loss.

**Timeline**: 65 days (9+ weeks)
**Status**: Planning Phase
**Created**: 2025-11-19
**Target Completion**: 2026-01-23

---

## Executive Summary

The application currently restarts every 12 hours for memory management. While Phase 1 (implemented 2025-11-19) eliminates data loss on graceful shutdown, **user experience is still disrupted**:

- Active battles are interrupted (users must restart)
- Wild encounters are lost (users must re-encounter)
- In-progress actions are cancelled (button interactions fail)
- Session state is lost (cooldowns, preferences, UI state)

This plan implements **seamless continuity** where restarts are invisible to users.

---

## Current State Analysis

### ✅ Already Persistent (Survives Restarts)
1. **Database Records** (PostgreSQL)
   - User accounts, trainer profiles
   - Pokémon ownership, party composition
   - Battle history, encounter records
   - Cooldowns (via `cooldown.js` disk persistence)
   - Security bot state (via `persistence.js` 7-day snapshots)

2. **File-Based Caches** (`/Store/`)
   - Pokemon reference data
   - Engine read database (SQLite)
   - Engine write buffer (WAL-protected)
   - AI logs (intelligent logger with flush)

### ❌ NOT Persistent (Lost on Restart)
1. **Active Battle Sessions** (`SESSIONS` Map in `battle-turn.js`)
   - In-memory battle state
   - Turn-by-turn history
   - Pending actions (move/switch queues)
   - **Impact**: ~10-50 active battles lost per restart

2. **Wild Encounter State** (`runtimes` Map in `turn-manager.ts`)
   - Active wild Pokemon encounters
   - Catch attempt progress
   - Escape countdown state
   - **Impact**: ~20-100 active encounters lost per restart

3. **Discord Interaction State**
   - Button interaction handlers (battle actions, catch/throw)
   - Message component collectors
   - Modal submissions in-flight
   - **Impact**: All button clicks fail after restart

4. **Runtime Caches** (Various Maps/Sets)
   - `pendingOpsErrorQueue` (security bot errors)
   - `deliveredOpsErrorIds` (error deduplication)
   - `memberRoleReversionsInProgress` (security rollback tracking)
   - `rolePermissionReversionsInProgress` (permission rollback tracking)
   - Activity tracker subscribers
   - **Impact**: Lost security context, duplicate errors, race conditions

---

## Architecture Design

### Phase 2: Centralized State Persistence Service (Weeks 1-2)

**File**: `src/services/state-persistence.ts`

**Purpose**: Single source of truth for all runtime state persistence. Replaces ad-hoc save mechanisms.

**Features**:
1. **Unified State Manager**
   - Single API for save/load/invalidate
   - Automatic versioning and migration
   - Conflict detection (dual-process safety)
   - Corruption recovery (checksum validation)

2. **State Namespaces**
   ```typescript
   namespace StateNamespace {
     BATTLE_SESSIONS = "battle-sessions"
     ENCOUNTER_RUNTIME = "encounter-runtime"
     INTERACTION_CONTEXT = "interaction-context"
     SECURITY_CONTEXT = "security-context"
     ACTIVITY_TRACKER = "activity-tracker"
     COOLDOWN_CACHE = "cooldown-cache"
     ERROR_DEDUP = "error-deduplication"
   }
   ```

3. **Storage Backend** (Two-Tier)
   - **Hot Store**: In-memory cache (immediate access)
   - **Cold Store**: Disk persistence (`/Store/runtime-state/`)
   
4. **Auto-Save Strategies**
   - **Write-through**: Critical data (battles, encounters) saved immediately
   - **Write-back**: Non-critical data (UI state) batched every 10s
   - **Emergency flush**: All namespaces flushed on SIGTERM

**API Design**:
```typescript
interface StatePersistenceService {
  // Core operations
  save<T>(namespace: string, key: string, value: T): Promise<void>;
  load<T>(namespace: string, key: string): Promise<T | null>;
  delete(namespace: string, key: string): Promise<void>;
  
  // Batch operations
  saveAll<T>(namespace: string, entries: Map<string, T>): Promise<void>;
  loadAll<T>(namespace: string): Promise<Map<string, T>>;
  
  // Lifecycle
  flush(namespace?: string): Promise<void>; // Force disk sync
  clear(namespace: string): Promise<void>; // Wipe namespace
  
  // Monitoring
  getStats(namespace: string): StateStats;
  health(): HealthStatus;
}
```

---

### Phase 3: Battle Session Persistence (Weeks 3-4)

**Goal**: Active battles survive restarts without interruption.

**Implementation**:

1. **Migrate `SESSIONS` Map** (`src/commands/battle-turn.js`)
   ```javascript
   // BEFORE:
   const SESSIONS = new Map(); // Lost on restart
   
   // AFTER:
   import { statePersistence } from '../services/state-persistence.js';
   
   async function ensureBattleState(userId) {
     // Load from persistence first
     let session = await statePersistence.load('battle-sessions', userId);
     if (session) return session;
     
     // ... create new session logic ...
     
     // Save immediately (write-through)
     await statePersistence.save('battle-sessions', userId, session);
     return session;
   }
   ```

2. **Battle State Schema**
   ```typescript
   interface PersistedBattleSession {
     userId: string;
     battleId: string | null; // Link to DB Battle record
     state: BattleState; // Engine state
     turnHistory: TurnRecord[];
     createdAt: number;
     lastAccessedAt: number;
     ttl: number; // Auto-expire after 1 hour idle
   }
   ```

3. **Startup Recovery**
   ```typescript
   // On bot startup:
   async function recoverBattleSessions() {
     const sessions = await statePersistence.loadAll<PersistedBattleSession>('battle-sessions');
     
     for (const [userId, session] of sessions) {
       // Check TTL
       if (Date.now() - session.lastAccessedAt > session.ttl) {
         await statePersistence.delete('battle-sessions', userId);
         continue;
       }
       
       // Restore to memory
       SESSIONS.set(userId, session);
       
       // Notify user (optional)
       await notifyBattleResumed(userId, session.battleId);
     }
   }
   ```

4. **Phase 1 Integration** (Shutdown Hook)
   ```typescript
   // In gracefulShutdown() Phase 1:
   try {
     log.info("PRIORITY: Flushing battle sessions");
     await statePersistence.flush('battle-sessions');
     log.info("Battle sessions flushed successfully");
   } catch (error) {
     log.error("CRITICAL: Battle session flush failed", error);
   }
   ```

---

### Phase 4: Encounter Runtime Persistence (Weeks 5-6)

**Goal**: Wild encounters survive restarts without re-spawning.

**Implementation**:

1. **Migrate `runtimes` Map** (`src/core/battle/turn-manager.ts`)
   ```typescript
   // BEFORE:
   const runtimes = new Map<string, BattleRuntime>(); // Lost on restart
   
   // AFTER:
   import { statePersistence } from '../../services/state-persistence.js';
   
   async function ensureRuntime(battleId: string): Promise<BattleRuntime> {
     // Load from persistence first
     let runtime = await statePersistence.load<BattleRuntime>('encounter-runtime', battleId);
     if (runtime) return runtime;
     
     // ... create new runtime logic ...
     
     // Save immediately (write-through)
     await statePersistence.save('encounter-runtime', battleId, runtime);
     return runtime;
   }
   ```

2. **Encounter State Schema**
   ```typescript
   interface PersistedEncounterRuntime {
     encounterId: string; // Link to DB Encounter record
     userId: string;
     speciesId: number;
     level: number;
     hp: number;
     maxHp: number;
     status: string | null;
     catchAttempts: number;
     escapeChance: number;
     turnCount: number;
     createdAt: number;
     lastAccessedAt: number;
     ttl: number; // Auto-expire after 10 minutes idle
   }
   ```

3. **Startup Recovery**
   ```typescript
   async function recoverEncounterRuntimes() {
     const runtimes = await statePersistence.loadAll<PersistedEncounterRuntime>('encounter-runtime');
     
     for (const [encounterId, runtime] of runtimes) {
       // Check TTL (10min for encounters)
       if (Date.now() - runtime.lastAccessedAt > runtime.ttl) {
         await statePersistence.delete('encounter-runtime', encounterId);
         // Mark encounter as expired in DB
         await markEncounterExpired(encounterId);
         continue;
       }
       
       // Restore to memory
       runtimes.set(encounterId, runtime);
       
       // Notify user (optional)
       await notifyEncounterResumed(runtime.userId, encounterId);
     }
   }
   ```

---

### Phase 5: Discord Interaction Context (Weeks 7-8)

**Goal**: Button interactions work across restarts.

**Challenge**: Discord interaction tokens expire after 15 minutes. Cannot replay old interactions.

**Solution**: Stateless interaction design

1. **Embed State in Custom IDs**
   ```typescript
   // BEFORE:
   button.setCustomId('battle-move-tackle'); // Needs in-memory context
   
   // AFTER:
   const payload = {
     action: 'battle-move',
     moveId: 'tackle',
     battleId: 'uuid-...',
     userId: '123456789',
     timestamp: Date.now()
   };
   const encoded = encodeInteractionPayload(payload);
   button.setCustomId(encoded); // Self-contained, no memory needed
   ```

2. **Interaction Payload Encoding**
   ```typescript
   function encodeInteractionPayload(payload: object): string {
     const json = JSON.stringify(payload);
     const compressed = zlib.deflateSync(Buffer.from(json));
     const base64 = compressed.toString('base64url');
     
     // Discord custom_id max length: 100 chars
     if (base64.length > 95) {
       throw new Error('Payload too large for custom_id');
     }
     
     return base64;
   }
   
   function decodeInteractionPayload(customId: string): object {
     const compressed = Buffer.from(customId, 'base64url');
     const json = zlib.inflateSync(compressed).toString('utf8');
     return JSON.parse(json);
   }
   ```

3. **Stateless Button Handlers**
   ```typescript
   // Universal button handler
   client.on('interactionCreate', async (interaction) => {
     if (!interaction.isButton()) return;
     
     // Decode self-contained payload
     const payload = decodeInteractionPayload(interaction.customId);
     
     switch (payload.action) {
       case 'battle-move':
         await handleBattleMove(interaction, payload);
         break;
       case 'encounter-catch':
         await handleEncounterCatch(interaction, payload);
         break;
       // ... more handlers
     }
   });
   ```

4. **Graceful Degradation**
   ```typescript
   async function handleBattleMove(interaction, payload) {
     // Verify battle still exists
     const battle = await loadBattleState(payload.battleId);
     if (!battle) {
       return interaction.reply({
         content: 'This battle has ended. Use `/battle-challenge` to start a new one.',
         ephemeral: true
       });
     }
     
     // Verify user is participant
     if (payload.userId !== interaction.user.id) {
       return interaction.reply({
         content: 'This action belongs to another user.',
         ephemeral: true
       });
     }
     
     // Verify action is still valid (e.g., move has PP)
     if (!isMoveStillAvailable(battle, payload.moveId)) {
       return interaction.reply({
         content: 'This move is no longer available. Please use `/battle-turn` to see updated options.',
         ephemeral: true
       });
     }
     
     // Execute action
     await executeBattleMove(battle, payload.moveId);
     await interaction.reply({ content: 'Move executed!' });
   }
   ```

---

### Phase 6: Security Context Persistence (Week 9)

**Goal**: Security bot context survives restarts.

**Implementation**:

1. **Migrate Security Bot Queues**
   ```javascript
   // BEFORE (src/bot/main.js):
   const pendingOpsErrorQueue = []; // Lost on restart
   const deliveredOpsErrorIds = new Set(); // Lost on restart
   const memberRoleReversionsInProgress = new Set(); // Lost on restart
   const rolePermissionReversionsInProgress = new Set(); // Lost on restart
   
   // AFTER:
   import { statePersistence } from '../services/state-persistence.js';
   
   async function initSecurityContext() {
     // Load persisted queues
     const errorQueue = await statePersistence.load('security-context', 'errorQueue') || [];
     const deliveredIds = await statePersistence.load('security-context', 'deliveredIds') || new Set();
     const roleReversions = await statePersistence.load('security-context', 'roleReversions') || new Set();
     const permReversions = await statePersistence.load('security-context', 'permReversions') || new Set();
     
     // Restore to memory
     pendingOpsErrorQueue.push(...errorQueue);
     deliveredOpsErrorIds = deliveredIds;
     memberRoleReversionsInProgress = roleReversions;
     rolePermissionReversionsInProgress = permReversions;
   }
   ```

2. **Auto-Save on Mutation**
   ```javascript
   async function addPendingError(error) {
     pendingOpsErrorQueue.push(error);
     
     // Save immediately (critical security data)
     await statePersistence.save('security-context', 'errorQueue', pendingOpsErrorQueue);
   }
   
   async function markErrorDelivered(errorId) {
     deliveredOpsErrorIds.add(errorId);
     
     // Save immediately
     await statePersistence.save('security-context', 'deliveredIds', deliveredOpsErrorIds);
   }
   ```

---

### Phase 7: Activity Tracker Persistence (Week 10)

**Goal**: Activity metrics and lifetime counts survive restarts.

**Implementation**:

1. **Migrate Activity Tracker** (`src/utils/activityTracker.js`)
   ```javascript
   // BEFORE:
   const lifetimeCounts = new Map(); // Lost on restart
   
   // AFTER:
   async function initActivityTracker() {
     const persisted = await statePersistence.load('activity-tracker', 'lifetimeCounts') || new Map();
     lifetimeCounts = persisted;
   }
   
   async function recordActivity(type, data) {
     const count = lifetimeCounts.get(type) || 0;
     lifetimeCounts.set(type, count + 1);
     
     // Batch save (write-back with 10s interval)
     await statePersistence.save('activity-tracker', 'lifetimeCounts', lifetimeCounts);
   }
   ```

---

## Testing Strategy

### Week 11: Integration Testing

1. **Test Restart Scenarios**
   ```bash
   # Scenario 1: Active battle during restart
   - User A starts battle with User B
   - Bot restarts mid-battle
   - User A continues battle without disruption
   - Expected: Battle state restored, turn continues
   
   # Scenario 2: Wild encounter during restart
   - User catches wild Pokemon
   - Bot restarts during catch animation
   - User sees catch result after restart
   - Expected: Encounter state restored, catch completes
   
   # Scenario 3: Button interaction during restart
   - User clicks "Use Move" button
   - Bot restarts before handling click
   - User clicks button again after restart
   - Expected: Button still works, move executes
   ```

2. **Load Testing**
   ```bash
   # Simulate production load
   - 100 concurrent battles
   - 200 concurrent encounters
   - 50 button interactions/sec
   - Restart every 5 minutes for 1 hour
   - Expected: Zero dropped battles/encounters
   ```

3. **Corruption Testing**
   ```bash
   # Test persistence failure scenarios
   - Disk full during save
   - Corrupted state file on load
   - Concurrent process writes
   - Expected: Graceful fallback, no crashes
   ```

---

## Monitoring & Observability

### Metrics Dashboard

**Add to `/ops state` command**:

```
=== STATE PERSISTENCE HEALTH ===

Namespace: battle-sessions
├─ Total Keys: 42
├─ Memory Size: 1.2 MB
├─ Disk Size: 1.1 MB
├─ Save Ops (1h): 1,240 (20.7/min)
├─ Load Ops (1h): 1,180 (19.7/min)
├─ Flush Ops (1h): 6 (on restart)
└─ Errors (1h): 0

Namespace: encounter-runtime
├─ Total Keys: 87
├─ Memory Size: 523 KB
├─ Disk Size: 498 KB
├─ Save Ops (1h): 2,610 (43.5/min)
├─ Load Ops (1h): 2,580 (43.0/min)
├─ Flush Ops (1h): 6 (on restart)
└─ Errors (1h): 0

Last Restart: 2025-01-23T14:30:00Z (2.5h ago)
Recovery Stats:
├─ Battles Restored: 38/42 (4 expired)
├─ Encounters Restored: 81/87 (6 expired)
└─ Recovery Time: 1.2s
```

---

## Performance Impact

### Storage Requirements

| Namespace | Per-Entry Size | Max Entries | Total Size |
|-----------|---------------|-------------|------------|
| battle-sessions | ~30 KB | 100 | 3 MB |
| encounter-runtime | ~6 KB | 200 | 1.2 MB |
| interaction-context | ~500 B | 1000 | 500 KB |
| security-context | ~50 KB | 1 | 50 KB |
| activity-tracker | ~10 KB | 1 | 10 KB |
| **TOTAL** | - | - | **~5 MB** |

**Render Disk**: 1 GB available → 0.5% usage ✅

### Memory Overhead

- **Hot Store Cache**: ~5 MB (persistent in RAM)
- **Write Buffer**: ~1 MB (pending flushes)
- **Total Overhead**: ~6 MB (~0.3% of 2 GB limit) ✅

### CPU Impact

- **Save Operation**: ~0.1-0.5 ms (JSON serialize + disk write)
- **Load Operation**: ~0.1-0.5 ms (disk read + JSON parse)
- **Flush Operation**: ~10-50 ms (bulk write)
- **Impact**: Negligible (<1% CPU increase) ✅

---

## Rollout Plan

### Week 1-2: Foundation
- [ ] Implement `StatePersistenceService` base class
- [ ] Add storage backend (memory + disk)
- [ ] Implement versioning and migration system
- [ ] Add checksum validation
- [ ] Write unit tests (80%+ coverage)

### Week 3-4: Battle Sessions
- [ ] Migrate `SESSIONS` Map
- [ ] Add startup recovery logic
- [ ] Integrate with Phase 1 shutdown
- [ ] Add `/ops state` monitoring
- [ ] Test with 10 concurrent battles

### Week 5-6: Encounter Runtime
- [ ] Migrate `runtimes` Map
- [ ] Add startup recovery logic
- [ ] Integrate with Phase 1 shutdown
- [ ] Test with 20 concurrent encounters

### Week 7-8: Interaction Context
- [ ] Implement stateless interaction design
- [ ] Migrate button handlers
- [ ] Add graceful degradation
- [ ] Test expired interaction handling

### Week 9: Security Context
- [ ] Migrate security bot queues
- [ ] Add auto-save on mutation
- [ ] Test reversion tracking

### Week 10: Activity Tracker
- [ ] Migrate activity tracker
- [ ] Add batch save optimization

### Week 11: Integration Testing
- [ ] End-to-end restart scenarios
- [ ] Load testing (100 battles, 200 encounters)
- [ ] Corruption testing

### Week 12: Production Rollout
- [ ] Deploy to staging (1 week monitoring)
- [ ] Deploy to production
- [ ] Monitor for 48 hours
- [ ] Declare production-ready

---

## Success Criteria

### User Experience
- ✅ Active battles continue seamlessly after restart
- ✅ Wild encounters persist across restart
- ✅ Button interactions work after restart
- ✅ Zero user-facing errors during restart
- ✅ Restart notification is informational only (not disruptive)

### Technical Metrics
- ✅ <1s recovery time on startup
- ✅ <5 MB disk usage for state persistence
- ✅ <10 MB memory overhead
- ✅ <1% CPU impact
- ✅ 99.9%+ save/load success rate
- ✅ Zero state corruption incidents

### Operational
- ✅ `/ops state` command shows health
- ✅ Graceful fallback on persistence failure
- ✅ Automatic cleanup of expired sessions
- ✅ Clear logging for debugging
- ✅ Documentation for maintenance

---

## Risks & Mitigation

### Risk 1: Disk I/O Bottleneck
**Mitigation**: Batch writes every 10s, use write-back strategy for non-critical data

### Risk 2: State Corruption
**Mitigation**: Checksum validation, versioned schema, graceful fallback to empty state

### Risk 3: Memory Growth
**Mitigation**: TTL-based expiration, bounded hot store cache (max 10 MB)

### Risk 4: Concurrent Access
**Mitigation**: File locking, atomic writes, conflict detection

### Risk 5: Discord API Changes
**Mitigation**: Custom ID encoding supports schema evolution, version field in payload

---

## Future Enhancements (Beyond 65 Days)

### Phase 8: Distributed State (Multi-Region)
- Redis backend for shared state across regions
- Point-to-point recovery (user connects to different region)

### Phase 9: Point-in-Time Recovery
- Snapshots every hour
- Rollback to any previous state
- Audit trail for compliance

### Phase 10: Predictive Pre-Loading
- ML-based prediction of next user action
- Pre-load battle/encounter state before interaction
- <100ms response time for button clicks

---

## Conclusion

This 65-day plan transforms the application from **restart-tolerant** (Phase 1) to **restart-invisible** (Phase 2-7). Users will never know restarts happen, battles and encounters continue seamlessly, and operational metrics remain stable.

**Next Action**: Approve plan and begin Week 1 implementation (Foundation).
