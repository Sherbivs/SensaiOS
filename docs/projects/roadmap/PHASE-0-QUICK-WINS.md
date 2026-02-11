# Phase 0 — Correctness & Quick Wins

**Priority:** 🔴 CRITICAL (prerequisite for all other phases)  
**Effort:** 1–2 days  
**Depends On:** Nothing  
**Unlocks:** All subsequent phases  

---

## Objective

Fix known correctness issues, clear low-hanging technical debt, and establish a clean baseline before gameplay expansion work begins. Every item here is independently deployable and low-risk.

---

## 0.1 — Fix Placeholder HP Formula (3 files)

### Problem

Three files use a hardcoded placeholder formula for Pokémon HP instead of the canonical engine calculation:

```typescript
// CURRENT (placeholder):
const maxHp = 20 + level * 3;

// SHOULD USE (engine canonical):
import { derivedStats } from '../../engine/stats.js';
const stats = derivedStats(baseStats, level, ivs, evs);
const maxHp = stats.hp;
```

### Files to Fix

| File | Line | Context |
|------|------|---------|
| `src/bot/homestead/starters.ts` | ~97 | Starter Pokémon creation — new player's first Pokémon gets placeholder HP |
| `src/core/encounter/catch.ts` | ~32 | `computeInitialStats()` — every caught wild Pokémon gets placeholder HP |
| `src/sensaios/gameserver/api.ts` | (internal) | Party display — uses the stored DB values (correct if source is fixed) |

### Investigation Steps

1. **Read `src/engine/stats.ts`** — Confirm `derivedStats()` function signature, inputs, and output shape
2. **Read `data/pokemon.json` or dexpack** — Confirm base stat availability per species
3. **Check if base stats are available at catch time** — The `Encounter` record has `speciesId` but may not carry base stats. May need a dexpack lookup during catch
4. **Check IV generation** — Currently `catch.ts` hardcodes all IVs to 31. Determine if IVs should be randomized (using deterministic RNG from encounter seed)

### Implementation Plan

```
1. Create a shared utility: src/shared/pokemon/compute-stats.ts
   - Import engine derivedStats
   - Accept speciesId, level, ivs, evs
   - Look up base stats from dexpack
   - Return { hp, maxHp, atk, def, spa, spd, spe }

2. Update src/core/encounter/catch.ts
   - Replace computeInitialStats() with shared utility
   - Consider randomizing IVs: ctx.rng.int(0, 31) per stat

3. Update src/bot/homestead/starters.ts  
   - Use shared utility for starter Pokémon HP
   - Starters should have decent IVs (floor of 20?)

4. Verify party-queries-pg stores the computed stats correctly
```

### Acceptance Criteria

- [ ] All new Pokémon (caught or starter) use engine-canonical HP formula
- [ ] No more `20 + level * 3` anywhere in non-test code
- [ ] Existing tests still pass
- [ ] Build clean (0 TS errors)

---

## 0.2 — Fix Failing Tests (2 tests)

### Problem

2 tests fail in `tests/services/monitoring/memory-metrics.spec.ts` at lines 146 and 157:

```
❯ tests/services/monitoring/memory-metrics.spec.ts:146:31
  expected 'healthy' to be 'critical'

❯ tests/services/monitoring/memory-metrics.spec.ts:157:101
  expected false to be true
```

These are memory-leak-patch related — the bounded structure thresholds changed but tests weren't updated.

### Investigation Steps

1. **Read the test file** — Understand what thresholds the tests expect
2. **Read `src/services/monitoring/memory-metrics.ts`** — Check current threshold logic
3. **Compare** — The C4 (Content-Addressable Storage) component may have different boundary conditions after the memory leak patch refactoring

### Implementation Plan

```
1. Read both files to understand the mismatch
2. Either:
   a) Update test expectations to match new threshold logic, OR
   b) Fix the memory-metrics service if the logic is wrong

3. Run: npm test -- tests/services/monitoring/memory-metrics.spec.ts
4. Verify: 0 failures
```

### Acceptance Criteria

- [ ] `memory-metrics.spec.ts` — all tests pass
- [ ] Full suite: `npm test` → 0 failures (currently 2)
- [ ] No regressions introduced

---

## 0.3 — Clear ESLint Warnings (48 warnings)

### Problem

`npx eslint src/ --max-warnings 0` reports 48 warnings (0 errors). Categories:

| Category | Count | Examples |
|----------|-------|---------|
| `@typescript-eslint/no-unused-vars` | ~44 | Unused imports, unused function params |
| Unused eslint-disable directives | ~4 | Stale `// eslint-disable` comments |

### Investigation Steps

1. **Run `npx eslint src/ --max-warnings 0`** to get full list
2. **Categorize** — Identify which unused vars are safe to prefix with `_` vs which indicate dead code
3. **Check for dead code signals** — An unused import might indicate a function that was supposed to be wired but wasn't

### Implementation Plan

```
1. Auto-fix what ESLint can: npx eslint src/ --fix
2. Manually prefix truly unused params with _: (err) → (_err)
3. Remove stale eslint-disable comments
4. For unused imports that suggest dead code:
   - Document in dead code analysis
   - Remove import if function is clearly unused
   - Keep and note if it's a planned future integration
5. Target: 0 warnings
```

### Acceptance Criteria

- [ ] `npx eslint src/ --max-warnings 0` exits with code 0
- [ ] No meaningful code removed (only cosmetic changes)
- [ ] Build clean, tests pass

---

## 0.4 — Complete Memory Leak Patch (In Progress)

### Current State

The memory leak patch is in **Phase 4.1** (baseline capture). A 24-hour monitoring script is running.

### Remaining Steps

| Sub-Phase | Status | Description |
|-----------|--------|-------------|
| PHASE4.1 | 🟡 IN PROGRESS | 24h baseline capture + Grafana dashboard |
| PHASE4.2 | ⬜ PROPOSED | Canary deployment + 24h soak test |
| PHASE5.1 | ⬜ PROPOSED | Staged production rollout (25% → 50% → 100%) |
| PHASE5.2 | ⬜ PROPOSED | Final validation + documentation |

### Investigation Steps

1. **After 24h**: Read `Store/monitoring/memory-growth-2026-02-10.log`
2. **Record baseline**: avg RSS, peak RSS, growth rate
3. **Compare to thresholds**: RSS <300MB baseline, growth <50MB/24h
4. **If passing**: Proceed to canary deployment
5. **If failing**: Investigate which bounded structures are growing

### Acceptance Criteria

- [ ] Baseline captured and documented in blueprint
- [ ] Canary deployment completes 24h soak without regression
- [ ] Staged rollout to 100% with no memory anomalies
- [ ] MEMLEAK.PHASE5.2 marked DONE

### Reference

- Blueprint: `ops/MEMORY-LEAK-PATCH-BLUEPRINT.md`
- Dashboard: `ops/grafana-memory-leak-rollout.json`
- Monitor script: `scripts/monitor-memory-24h.ps1`

---

## 0.5 — Commit Gateway Rate Limit Hotfix

### Current State

The `DISCORD.MEMBER_FETCH.RATE_LIMIT` hotfix code is applied locally but **NOT committed**. Files modified:

- `src/bot/main.ts` — Gateway member fetch cooldown
- `src/shared/constants.ts` — Cooldown constants

### Investigation Steps

1. **Review the diff** — `git diff src/bot/main.ts src/shared/constants.ts`
2. **Verify the change** — Ensure cooldown values are reasonable
3. **Test** — Run relevant tests
4. **Commit** — With proper task ID reference

### Implementation Plan

```
1. git add src/bot/main.ts src/shared/constants.ts
2. git commit -m "[Task DISCORD.MEMBER_FETCH.RATE_LIMIT] Add gateway member fetch cooldown"
3. git push origin main
4. Mark quick_task as DONE in NEXT.yaml
```

### Acceptance Criteria

- [ ] Hotfix committed and pushed
- [ ] Build passes on remote
- [ ] NEXT.yaml quick_task slot cleared

---

## 0.6 — Fix Starter Pokémon Move IDs

### Problem

In `src/bot/homestead/starters.ts` (line ~126), starter Pokémon are created with placeholder move IDs:

```typescript
// Current: hardcoded move data
const moves = [{ id: 33, name: "Tackle", pp: 35, maxPP: 35 }];
```

Each starter should have species-appropriate moves loaded from the dexpack learnset data.

### Investigation Steps

1. **Check dexpack for starter learnsets** — What moves do Bulbasaur/Charmander/Squirtle learn at level 5?
2. **Check `SpeciesLearnset` Prisma model** — Is learnset data populated?
3. **Check `src/core/encounter/catch.ts`** — Same issue: caught Pokémon all get Tackle
4. **Design**: Should moves be a JSON array on PokemonInstance, or separate related records?

### Implementation Plan

```
1. Create utility: src/shared/pokemon/initial-moves.ts
   - Given speciesId and level, query SpeciesLearnset for moves learned by that level
   - Return up to 4 moves (highest-level ones, like the real games)
   
2. Update starters.ts — Use learnset lookup for starter moves
3. Update catch.ts — Use learnset lookup for wild Pokémon moves
4. Ensure moves are stored as JSON array on PokemonInstance.movesJson
```

### Acceptance Criteria

- [ ] Starters get species-appropriate moves (not just Tackle)
- [ ] Wild caught Pokémon get level-appropriate moves
- [ ] Learnset data is queried from SpeciesLearnset or dexpack

---

## 0.7 — IV Randomization for Wild Pokémon

### Problem

`src/core/encounter/catch.ts` hardcodes all IVs to 31 (perfect):

```typescript
const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
```

Wild Pokémon should have random IVs (0–31 per stat) to create collection depth and encourage trading.

### Investigation Steps

1. **Check if deterministic RNG is available at catch time** — The `attemptCatch` function receives an optional `roll` parameter. Need a full RNG context.
2. **Check encounter spawn** — Does the encounter carry a seed for deterministic IV generation?
3. **Design decision**: Should IVs be rolled at spawn time (stored in `Encounter.dataJson`) or at catch time?

### Implementation Plan

```
1. Roll IVs at encounter spawn time using SeededRNG
   - Store in Encounter.dataJson: { rarity, isShiny, ivs: { hp, atk, ... } }
   - This makes IVs deterministic and auditable

2. At catch time, read IVs from encounter data
   - If missing (legacy encounters), fall back to random

3. Starters: Use floor of 20 for each IV (good but not perfect)
```

### Acceptance Criteria

- [ ] Wild Pokémon have random IVs (0–31 per stat)
- [ ] IVs are deterministically seeded from encounter RNG
- [ ] Starters have guaranteed good IVs (floor 20)
- [ ] IV values stored in PokemonInstance and visible in party view

---

## Phase 0 Checklist

| # | Task | Effort | Risk | Depends On |
|---|------|--------|------|------------|
| 0.1 | Fix placeholder HP formula | 2–3 hours | Low | Engine stats.ts |
| 0.2 | Fix failing tests | 30 min | Low | None |
| 0.3 | Clear ESLint warnings | 1–2 hours | Low | None |
| 0.4 | Complete memory leak patch | ~3 days (waiting) | Medium | 24h baseline |
| 0.5 | Commit rate limit hotfix | 15 min | None | None |
| 0.6 | Fix starter move IDs | 2–3 hours | Low | Dexpack learnsets |
| 0.7 | IV randomization | 2–3 hours | Low | SeededRNG at spawn |

**Total Phase 0 effort:** 1–2 days of active work + 3 days of monitoring wait

---

*Parent: [ROADMAP-INDEX.md](ROADMAP-INDEX.md) | Next: [Phase 1 — Slash Command Wiring](PHASE-1-SLASH-COMMANDS.md)*
