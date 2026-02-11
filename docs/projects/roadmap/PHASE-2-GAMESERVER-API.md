# Phase 2 — GameServer API Completion

**Priority:** 🟡 HIGH (architecture modernization)  
**Effort:** 1–2 weeks  
**Depends On:** Phase 0 (correctness fixes)  
**Unlocks:** Phase 4 (SensaiOS completion), Phase 5 (launch readiness)  

---

## Objective

Complete the 15 TODO stubs in `src/sensaios/gameserver/api.ts` (2,752 lines) by bridging the top-level capability-gated methods to the **already-functional** internal implementations (`*Internal()` methods). This establishes the SensaiOS-proper game API that all future features will use.

### Architecture Context

The GameServerAPI has two layers:

```
┌─────────────────────────────────────────┐
│ TOP LEVEL (Public API)                   │
│ Capability-gated, tenant-scoped          │
│ 15 methods with TODO stubs               │
├─────────────────────────────────────────┤
│ INTERNAL LEVEL (*Internal methods)       │
│ Direct DB operations, business logic     │
│ Mostly functional with real code         │
└─────────────────────────────────────────┘
```

The `*Internal()` methods at ~line 1280+ have real database operations. The public API methods at lines 682-864 have TODO markers because the capability checking + tenant scoping + error wrapping hasn't been wired yet.

---

## 2.1 — Battle API Stubs (8 HIGH Priority)

### 2.1.1 — `createBattle()`

**Location:** `src/sensaios/gameserver/api.ts` ~line 682

**Current:**
```typescript
async createBattle(challengerId: string, defenderId: string): Promise<BattleRecord> {
  // TODO: Create battle via GameServerAPI
  throw new SensaiError({ code: 6001, message: 'Not implemented' });
}
```

**Investigation:**
1. Read `createBattleInternal()` (~line 1280+) — does it exist? What does it do?
2. Read `src/bot/battle/challenge.ts` — how does the direct path create battles?
3. Read `src/shared/models/battle-queries-pg.ts` — raw DB operations for battles
4. Read the `Battle` Prisma model in `schema.prisma` — understand the data shape

**Implementation Plan:**
```typescript
async createBattle(
  challengerId: string,
  defenderId: string,
  scope: TenantScope
): Promise<BattleRecord> {
  // 1. Assert capability: 'game.battle.create'
  await this.ctx.rbac.assert('game.battle.create', scope);
  
  // 2. Validate: both users exist, neither in active battle
  // 3. Create battle record via DB
  // 4. Emit export: 'battle.created'
  // 5. Return battle record
}
```

**Acceptance Criteria:**
- [ ] Creates a battle between two trainers
- [ ] Validates both trainers exist and are available
- [ ] Emits `battle.created` export with TenantScope
- [ ] Returns full BattleRecord

---

### 2.1.2 — `getBattle()`

**Location:** ~line 707

**Implementation Plan:**
```typescript
async getBattle(battleId: string, scope: TenantScope): Promise<BattleRecord | null> {
  // 1. Assert capability: 'game.battle.read'
  // 2. Query battle by ID
  // 3. Include related data (participants, current state)
  // 4. Return battle record or null
}
```

---

### 2.1.3 — `submitBattleMove()`

**Location:** ~line 735

**This is the most complex battle stub.** It needs to:
1. Validate the move is legal (correct turn, valid move, has PP)
2. Execute the turn resolution via `src/engine/turn.ts`
3. Apply damage, status effects, stat changes
4. Check for KO / battle end
5. Update battle state in DB
6. Emit appropriate exports

**Investigation:**
1. Read `src/bot/battle/actions.ts` — how does the direct path handle moves?
2. Read `src/engine/turn.ts` — turn resolution logic
3. Read `src/core/battle/turn-manager.ts` — turn state management
4. Read `src/engine/calc.ts` — damage calculation

**Implementation Plan:**
```typescript
async submitBattleMove(
  battleId: string,
  trainerId: string,
  moveId: number,
  scope: TenantScope
): Promise<TurnResult> {
  // 1. Assert capability: 'game.battle.act'
  // 2. Acquire advisory lock: battle:{battleId}
  // 3. Validate: correct turn, valid move, has PP
  // 4. Resolve turn via engine
  // 5. Apply results to DB state
  // 6. Emit export: 'battle.turn.resolved'
  // 7. If KO: emit 'battle.completed', award XP/rewards
  // 8. Release lock
  // 9. Return turn result
}
```

---

### 2.1.4 — `forfeitBattle()`

**Location:** ~line 762

**Implementation Plan:**
```typescript
async forfeitBattle(
  battleId: string,
  forfeiterId: string,
  scope: TenantScope
): Promise<BattleResult> {
  // 1. Assert capability: 'game.battle.act'
  // 2. Validate: forfeiter is a participant
  // 3. Set battle state to FORFEITED
  // 4. Award win to opponent
  // 5. Emit export: 'battle.forfeited'
  // 6. Return result
}
```

---

### 2.1.5–2.1.8 — Encounter API Stubs

**Locations:** Lines 792, 816, 840, 864

| Method | Line | Purpose |
|--------|------|---------|
| `spawnEncounter()` | ~792 | Trigger wild encounter for a trainer |
| `getEncounter()` | ~816 | Retrieve active encounter state |
| `attemptCatch()` | ~840 | Try to catch the wild Pokémon |
| `fleeEncounter()` | ~864 | Run from wild encounter |

**Investigation:**
1. Read `spawnEncounterInternal()` (~line 1368+) — what exists?
2. Read `src/core/encounter/spawn.ts` — full spawn logic
3. Read `src/core/encounter/catch.ts` — catch formula
4. Read `src/shared/models/encounter-queries-pg.ts` — DB operations

**Implementation Pattern (same for all 4):**
```typescript
async spawnEncounter(
  trainerId: string,
  area: string,
  scope: TenantScope
): Promise<EncounterRecord> {
  // 1. Assert capability: 'game.encounter.spawn'
  // 2. Check cooldown
  // 3. Call spawnEncounterInternal() or core/encounter/spawn.ts
  // 4. Store encounter in DB
  // 5. Emit export: 'encounter.spawned'
  // 6. Return encounter record
}
```

**Acceptance Criteria for all 8 battle/encounter stubs:**
- [ ] Each method validates capabilities via RBAC
- [ ] Each method carries TenantScope
- [ ] Each method emits appropriate exports
- [ ] Each method uses advisory locks for concurrent safety
- [ ] Each method has error handling with SensaiError codes (6xxx)
- [ ] Battle flow: create → submitMove (repeat) → conclude
- [ ] Encounter flow: spawn → (catch | flee)

---

## 2.2 — Internal Method Completion (7 MEDIUM Priority)

These stubs are inside the `*Internal()` methods — they need business logic completion.

### 2.2.1 — Battle Phase Parsing

**Location:** ~line 1384

**Problem:** The internal battle method needs to determine the current battle phase (WAITING_FOR_MOVES, RESOLVING_TURN, COMPLETED) from the DB state.

**Investigation:**
1. Check `Battle` model — what phase/state fields exist?
2. Check `src/core/battle/turn-manager.ts` — how does it track turns?
3. Determine: Is phase stored as an enum, or computed from turn count + submitted moves?

---

### 2.2.2 — Pokédex Completion Calculation

**Location:** ~line 1749

**Problem:** `getPokedexCompletion()` needs to calculate how many species a trainer has caught vs total available.

**Implementation Plan:**
```typescript
async getPokedexCompletionInternal(trainerId: string): Promise<{
  caught: number;
  seen: number;
  total: number;
  percentage: number;
}> {
  // 1. Count distinct speciesId in trainer's PokemonInstance records
  // 2. Count total available species from Species table
  // 3. Calculate percentage
  // 4. Optional: count "seen" from Encounter records
}
```

---

### 2.2.3 — Party Moves Loading

**Location:** ~line 1855

**Problem:** When loading a trainer's party, each Pokémon's moves need to be included. Currently returns party without move details.

**Investigation:**
1. Check `PokemonInstance` model — are moves stored as JSON or related records?
2. Check `src/shared/models/party-queries-pg.ts` — does it include moves?
3. Check `src/bot/homestead/party.ts` — how does the direct path load party moves?

---

### 2.2.4 — Item Effect Application

**Location:** ~line 2123

**Problem:** `useItemInternal()` needs to apply item effects (heal HP, cure status, boost stats).

**Investigation:**
1. Read `src/services/item-effects.ts` (542 lines) — full item effect system
2. Read `data/effects.json` — effect definitions
3. Determine: Can we just call the existing item-effects service?

**Implementation Plan:**
```typescript
async useItemInternal(
  trainerId: string,
  itemId: number,
  targetPokemonId?: string
): Promise<ItemUseResult> {
  // 1. Verify trainer owns item
  // 2. Look up item effect from item-effects service
  // 3. Apply effect (heal, cure status, etc.)
  // 4. Deduct item from inventory
  // 5. Return result with description of what happened
}
```

---

### 2.2.5 — Party Move Validation (Battle Context)

**Problem:** When submitting a battle move, need to validate:
- The move exists in the Pokémon's moveset
- The move has PP remaining
- The Pokémon is not fainted

**Investigation:**
1. How does `src/bot/battle/actions.ts` validate moves currently?
2. What PP tracking mechanism is used?

---

### 2.2.6 — Battle Reward Calculation

**Problem:** After a battle concludes, calculate:
- XP gained (based on opponent level, rarity)
- Money earned
- Whether any Pokémon should level up

**Investigation:**
1. Read `src/services/leveling.ts` (640 lines) — XP and leveling logic
2. Check `src/bot/battle/conclude.ts` — what rewards does it give now?

---

### 2.2.7 — Encounter Rarity Display

**Problem:** When displaying encounter information, need to show the rarity tier and any special attributes (shiny, etc.) in a user-friendly format.

**Investigation:**
1. Read `src/core/encounter/spawn.ts` — how is rarity determined?
2. Check encounter embed builders — how is rarity shown currently?

---

## 2.3 — Integration Testing Strategy

After completing the stubs, verify the full API works end-to-end:

### Test Matrix

| Flow | API Methods | Expected Outcome |
|------|-------------|-----------------|
| Full battle | create → submitMove × N → conclude | Battle resolves, rewards given |
| Forfeit | create → forfeit | Immediate conclusion, forfeit recorded |
| Wild encounter | spawn → catch | Pokémon added to party/storage |
| Flee encounter | spawn → flee | Encounter cleared, no penalty |
| Failed catch | spawn → catch (miss) → catch (hit) | Pokémon caught on second attempt |
| Item use | getInventory → useItem | Item consumed, effect applied |
| Pokédex | spawnMultiple → catch → getCompletion | Percentage increases |

### Test File Structure

```
tests/sensaios/gameserver/
├── api-battles.spec.ts     — Battle flow integration
├── api-encounters.spec.ts  — Encounter flow integration
├── api-inventory.spec.ts   — Item use integration
├── api-pokedex.spec.ts     — Pokédex completion
└── api-party.spec.ts       — Party management
```

---

## 2.4 — Error Code Registry

All GameServerAPI errors use the 6xxx SensaiError code range:

| Code | Name | When |
|------|------|------|
| 6001 | BATTLE_INVALID_STATE | Wrong battle phase for action |
| 6002 | BATTLE_NOT_FOUND | Battle ID doesn't exist |
| 6003 | BATTLE_NOT_PARTICIPANT | User isn't in this battle |
| 6004 | BATTLE_ALREADY_ACTIVE | User already in a battle |
| 6010 | ENCOUNTER_NOT_FOUND | Encounter expired or doesn't exist |
| 6011 | ENCOUNTER_COOLDOWN | Too soon since last encounter |
| 6012 | ENCOUNTER_ALREADY_ACTIVE | User has an active encounter |
| 6020 | MOVE_INVALID | Move not in Pokémon's moveset |
| 6021 | MOVE_NO_PP | Move has 0 PP remaining |
| 6022 | POKEMON_FAINTED | Can't act with fainted Pokémon |
| 6030 | ITEM_NOT_OWNED | Trainer doesn't have this item |
| 6031 | ITEM_NOT_USABLE | Item can't be used in current context |
| 6040 | PARTY_FULL | 6 Pokémon already in party |
| 6041 | PARTY_EMPTY | Can't remove last Pokémon |

---

## Phase 2 Checklist

| # | Task | Effort | Risk | Priority |
|---|------|--------|------|----------|
| 2.1.1 | createBattle() | 3–4 hours | Medium | HIGH |
| 2.1.2 | getBattle() | 1–2 hours | Low | HIGH |
| 2.1.3 | submitBattleMove() | 6–8 hours | High | HIGH |
| 2.1.4 | forfeitBattle() | 2–3 hours | Low | HIGH |
| 2.1.5 | spawnEncounter() | 3–4 hours | Medium | HIGH |
| 2.1.6 | getEncounter() | 1–2 hours | Low | HIGH |
| 2.1.7 | attemptCatch() | 3–4 hours | Medium | HIGH |
| 2.1.8 | fleeEncounter() | 1–2 hours | Low | HIGH |
| 2.2.1 | Battle phase parsing | 2–3 hours | Medium | MEDIUM |
| 2.2.2 | Pokédex completion | 2–3 hours | Low | MEDIUM |
| 2.2.3 | Party moves loading | 2–3 hours | Low | MEDIUM |
| 2.2.4 | Item effect application | 3–4 hours | Medium | MEDIUM |
| 2.2.5 | Move validation | 2–3 hours | Medium | MEDIUM |
| 2.2.6 | Battle rewards | 3–4 hours | Medium | MEDIUM |
| 2.2.7 | Rarity display | 1–2 hours | Low | LOW |
| 2.3 | Integration tests | 4–6 hours | Low | HIGH |
| 2.4 | Error code registry | 1–2 hours | Low | MEDIUM |

**Total Phase 2 effort:** 1–2 weeks

**Key Insight:** Most of the battle and encounter logic already exists in the core/ and engine/ layers. The GameServerAPI methods primarily need to: (1) validate capabilities, (2) call existing logic, (3) emit exports for observability. The hardest stub is `submitBattleMove()` because it orchestrates the full turn resolution pipeline.

---

*Parent: [ROADMAP-INDEX.md](ROADMAP-INDEX.md) | Prev: [Phase 1 — Slash Commands](PHASE-1-SLASH-COMMANDS.md) | Next: [Phase 3 — Gameplay Depth](PHASE-3-GAMEPLAY-DEPTH.md)*
