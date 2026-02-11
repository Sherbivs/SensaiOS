# Phase 3 — Gameplay Depth & Content Expansion

**Priority:** 🟢 MEDIUM (feature expansion — after core wiring is solid)  
**Effort:** 3–4 weeks  
**Depends On:** Phase 0 (correctness), Phase 1 (slash commands), Phase 2 (GameServer API)  
**Unlocks:** Phase 5 (launch readiness)  

---

## Objective

Expand the gameplay systems from a functional prototype into a content-rich Pokémon experience. This phase transforms "you can catch and battle" into "there's always something meaningful to do." Every feature here builds on the existing engine, services, and database schema — no architectural rewrites needed.

---

## 3.1 — Evolution System

### Current State

**Not implemented.** The `PokemonInstance` model exists, `Species` model has fields for evolution chains, but no evolution trigger logic exists. This is the **#1 most requested missing feature** for a Pokémon game.

### Investigation Steps

1. **Read `prisma/schema.prisma`** — Check Species model for evolution-related fields:
   - `evolvesFromSpeciesId`? `evolutionChain`? `evolutionTrigger`?
2. **Read `data/pokemon.json`** — Does PokéAPI bootstrap data include evolution chains?
3. **Read `src/services/leveling.ts`** — Where would evolution check trigger after level-up?
4. **Read `assets/dexpack.v2.json`** — Evolution data availability
5. **Check SpeciesEvolution Prisma model** — Does it exist?

### Design

```
Evolution Triggers:
├── Level-Up Evolution (most common)
│   └── At battle end: check if level >= evolveLevel
├── Item Evolution (future)
│   └── Use evolutionary stone from bag
├── Trade Evolution (future)
│   └── Trigger after trade completes
└── Happiness Evolution (future)
    └── Trigger when friendship threshold met
```

### Implementation Plan

```
1. Create: src/core/evolution/evolution-engine.ts
   - canEvolve(pokemonInstance, trigger): boolean
   - getEvolutionTarget(speciesId, trigger): Species | null
   - evolve(pokemonInstance): EvolvedPokemon

2. Create: src/core/evolution/evolution-check.ts
   - checkLevelUpEvolution(pokemon, newLevel): EvolutionResult | null
   - Called after battle XP award in conclude.ts
   - Called after rare candy use in item-effects.ts

3. Create: src/bot/homestead/evolve-prompt.ts
   - Show "Your Bulbasaur is evolving!" embed
   - "Allow Evolution" / "Cancel" buttons
   - Animated countdown feel (edit message sequence)

4. Database: Check if SpeciesEvolution model needs migration
   - Fields: speciesId, targetSpeciesId, trigger, level, item, etc.

5. Integration points:
   - src/bot/battle/conclude.ts → after XP: checkLevelUpEvolution()
   - src/services/leveling.ts → after levelUp(): checkLevelUpEvolution()
   - src/services/item-effects.ts → after evolutionary stone: checkItemEvolution()
```

### Data Requirements

| Data | Source | Status |
|------|--------|--------|
| Evolution chains | PokéAPI bootstrap | Investigate |
| Evolve levels | PokéAPI `pokemon-species` | Investigate |
| Evolution items | PokéAPI `evolution-chain` | Investigate |
| Sprites (pre/post) | Dexpack or external | Investigate |

### Acceptance Criteria

- [ ] Pokémon evolve when reaching the correct level
- [ ] Player gets prompted before evolution (can cancel)
- [ ] Stats recalculate after evolution (new base stats)
- [ ] Pokédex updates with evolution (counts as "caught" for new species)
- [ ] Evolution history logged (for audit/replay)
- [ ] Notification embed shows old → new species with art

---

## 3.2 — Weather & Time System

### Current State

`src/core/encounter/spawn.ts` has rarity tiers but **no time/weather modifiers**. The roadmap notes mention time/weather affecting encounters, but it's not implemented.

### Investigation Steps

1. **Read `src/core/encounter/spawn.ts`** — Where would time/weather modify the encounter table?
2. **Check for existing time utilities** — Does the project already detect real-world time?
3. **Design decision**: Real-world time, or in-game time cycle?

### Design

```
Time Periods (Real-World UTC):
├── Dawn     (05:00–08:00) → Bug-type boost, early birds
├── Day      (08:00–17:00) → Normal distribution
├── Dusk     (17:00–20:00) → Ghost-type unlock, transitional species
└── Night    (20:00–05:00) → Dark-type boost, nocturnal species

Weather System:
├── Clear    (default)     → Normal distribution
├── Rain     (random)      → Water +30%, Electric +20%
├── Sunny    (random)      → Fire +30%, Grass +20%
├── Snow     (seasonal)    → Ice +40%
├── Fog      (rare)        → Ghost +30%, Psychic +20%
└── Storm    (event)       → Electric +50%, Dragon unlock
```

### Implementation Plan

```
1. Create: src/core/environment/time-period.ts
   - getCurrentTimePeriod(): 'dawn' | 'day' | 'dusk' | 'night'
   - Based on UTC hour (adjust for guild timezone later)

2. Create: src/core/environment/weather.ts
   - getCurrentWeather(guildId): WeatherCondition
   - Weather changes every 4 hours (seeded by date + guildId)
   - Deterministic: same guild sees same weather

3. Update: src/core/encounter/spawn.ts
   - Add time/weather modifiers to rarity tables
   - Modifier = type affinity bonus (e.g., Water +30% in Rain)

4. Create: src/bot/homestead/weather-display.ts
   - Show current time/weather in explore embed
   - "🌧️ It's raining! Water Pokémon are more active..."

5. Guild-level weather dashboard:
   - /weather command shows current conditions
   - Forecast for next 12 hours
```

### Acceptance Criteria

- [ ] Time period affects encounter species pool
- [ ] Weather affects encounter type distribution
- [ ] Weather changes every 4 hours (deterministic per guild)
- [ ] Current weather displayed in explore UI
- [ ] Weather is deterministic (same guild + time = same weather)

---

## 3.3 — Abilities in Battle

### Current State

The battle engine (`src/engine/`) resolves turns with damage, type effectiveness, STAB, crits, and status effects. **Abilities are not implemented.**

### Investigation Steps

1. **Read `src/engine/effects.ts`** (348 lines) — What hooks exist for ability triggers?
2. **Read `src/engine/turn.ts`** (150 lines) — Where would abilities modify turn flow?
3. **Read `src/engine/calc.ts`** (226 lines) — Where would abilities modify damage?
4. **Check `PokemonInstance` model** — Is there an `abilityId` field?
5. **Check dexpack** — Does it include ability data per species?

### Priority Abilities (V1 — Launch Set)

| Ability | Effect | Complexity |
|---------|--------|-----------|
| **Overgrow** | Grass moves +50% when HP ≤ 33% | Low — damage modifier |
| **Blaze** | Fire moves +50% when HP ≤ 33% | Low — damage modifier |
| **Torrent** | Water moves +50% when HP ≤ 33% | Low — damage modifier |
| **Intimidate** | Lower opponent's Atk on switch-in | Medium — on-entry trigger |
| **Levitate** | Immune to Ground moves | Low — type immunity |
| **Static** | 30% chance to paralyze on contact | Medium — on-hit trigger |
| **Sturdy** | Survive one-hit KO with 1 HP | Medium — damage cap |
| **Swift Swim** | Double Speed in rain | Low — stat modifier |

### Implementation Plan

```
1. Create: src/engine/abilities.ts
   - AbilityEffect interface
   - Hooks: onEntry, onDamageCalc, onHit, onStatusApply
   - Registry of ability implementations

2. Update: src/engine/calc.ts
   - Check attacker ability for damage modifiers (Blaze, etc.)
   - Check defender ability for immunities (Levitate, etc.)

3. Update: src/engine/turn.ts
   - Trigger onEntry abilities when switching
   - Trigger onHit abilities after damage resolution

4. Data: Ensure ability data in dexpack
   - Each species has 1-3 possible abilities
   - Each PokemonInstance has one selected ability
```

### Acceptance Criteria

- [ ] At least 8 abilities functional in battle
- [ ] Abilities display in party view
- [ ] Abilities trigger at correct battle moments
- [ ] Ability effects logged in battle log
- [ ] Deterministic: same seed + same abilities = same result

---

## 3.4 — Held Items in Battle

### Current State

The inventory system exists (`src/services/inventory.ts`, `src/bot/homestead/bag.ts`) and item effects exist (`src/services/item-effects.ts`). But items can only be used **outside** battle from the bag.

### Investigation Steps

1. **Read `src/services/item-effects.ts`** (542 lines) — What items exist?
2. **Check `Item` Prisma model** — Is there a `holdable` field?
3. **Check `PokemonInstance`** — Is there a `heldItemId` field?

### Priority Held Items (V1)

| Item | Effect | Complexity |
|------|--------|-----------|
| **Leftovers** | Restore 1/16 HP each turn | Low |
| **Choice Band** | +50% Atk, locked to first move | Medium |
| **Focus Sash** | Survive one hit at 1 HP (one-time) | Medium |
| **Life Orb** | +30% damage, lose 10% HP | Low |
| **Sitrus Berry** | Restore 25% HP when below 50% | Low |
| **Lum Berry** | Cure status condition (one-time) | Low |

### Implementation Plan

```
1. Add heldItemId to PokemonInstance model (migration)
2. Create: src/engine/held-items.ts
   - HeldItemEffect interface
   - Hooks: onTurnStart, onDamageDealt, onDamageReceived, onHpThreshold
3. Update engine to check held items at appropriate moments
4. Add "Hold Item" option to party management UI
5. Berries consumed after use (remove from PokemonInstance)
```

### Acceptance Criteria

- [ ] Pokémon can hold one item
- [ ] Held items trigger in battle at correct moments
- [ ] Berry items consumed after use
- [ ] Hold item shown in party view
- [ ] Item equip/unequip from bag UI

---

## 3.5 — Multi-Generation Species Expansion

### Current State

The dexpack contains **151 species** (Generation 1 Kanto). The Pokédex and encounter tables are Gen 1 only.

### Investigation Steps

1. **Read `assets/dexpack.v2.json`** — Confirm Gen 1 only
2. **Read `scripts/fetch_pokemon.mjs`** — How is PokéAPI data fetched?
3. **Read `src/data_pipeline/`** — Data ingestion pipeline
4. **Check `Species` count in database** — Confirm actual count

### Expansion Plan

| Phase | Generation | Species | Content |
|-------|-----------|---------|---------|
| Launch (current) | Gen 1 | #1–151 | Kanto starters, legendaries |
| Post-Launch 1 | Gen 2 | #152–251 | Johto, breeding prep |
| Post-Launch 2 | Gen 3 | #252–386 | Hoenn, abilities required |
| Post-Launch 3 | Gen 4 | #387–493 | Sinnoh, physical/special split |

### Implementation Plan

```
1. Update scripts/fetch_pokemon.mjs to accept generation range
2. Run data pipeline for Gen 2 (species, moves, learnsets, evolution chains)
3. Build updated dexpack with Gen 2 species
4. Create Gen 2 encounter zones (new areas in Public Field Channels)
5. Add Gen 2 starter options
6. Update Pokédex to show per-generation progress
```

### Acceptance Criteria

- [ ] Gen 2 species data in dexpack (100 new species)
- [ ] Gen 2 Pokémon appear in encounters
- [ ] Gen 2 starters available as alternates
- [ ] Pokédex tracks per-generation completion
- [ ] Data pipeline can be re-run for new generations

---

## 3.6 — Enhanced Daily Rewards System

### Current State

`src/bot/homestead/daily.ts` (385 lines) has a daily reward system. `src/services/achievements.ts` (584 lines) tracks achievements.

### Investigation Steps

1. **Read daily.ts** — What rewards are given? How are streaks tracked?
2. **Read achievements.ts** — What achievements exist?
3. **Check for login streak logic** — Does it track consecutive days?

### Expansion Plan

```
Daily Rewards Enhancement:
├── Login Streaks (7-day cycle with escalating rewards)
│   ├── Day 1: 100 PokéDollars
│   ├── Day 2: 200 PokéDollars
│   ├── Day 3: Potion × 3
│   ├── Day 4: 500 PokéDollars
│   ├── Day 5: Great Ball × 2
│   ├── Day 6: Rare Candy × 1
│   └── Day 7: Mystery Box (random rare item)
│
├── Weekly Challenges
│   ├── "Catch 5 Water-type Pokémon"
│   ├── "Win 3 battles"
│   └── "Explore 10 times"
│
└── Monthly Milestones
    ├── "Complete Gen 1 Pokédex" → Master Ball
    └── "Reach Trainer Level 20" → Exclusive avatar
```

### Acceptance Criteria

- [ ] 7-day login streak with escalating rewards
- [ ] Streak counter visible in daily claim embed
- [ ] Streak resets after 1 missed day (grace period: 48h?)
- [ ] Weekly challenges with progress tracking
- [ ] Achievements awarded for streak milestones

---

## 3.7 — Tournament System

### Current State

Battles work 1v1 between two trainers. No bracket/tournament system exists.

### Design

```
Tournament Types:
├── Single Elimination (4, 8, 16 players)
├── Round Robin (4–6 players)
└── Swiss (8+ players, 3-5 rounds)

Tournament Flow:
1. Admin creates tournament (/ops tournament create)
2. Players register (button in homestead)
3. Registration closes at set time
4. Bracket auto-generated (seeded by Trainer Level)
5. Match pairs announced
6. Players battle (normal battle flow)
7. Results auto-advance bracket
8. Finals → Winner announced guild-wide
```

### Implementation Plan

```
1. Create: Tournament Prisma model
   - id, name, type, status, maxPlayers, bracket (JSON)
   - TournamentEntry: tournamentId, trainerId, seed, eliminated

2. Create: src/core/tournament/
   - bracket-generator.ts — Single elim, round robin, swiss
   - tournament-manager.ts — Registration, advancement, finals
   
3. Create: src/bot/homestead/tournament.ts
   - Registration UI, bracket display, match results

4. Hook into: src/bot/battle/conclude.ts
   - If battle is part of tournament, advance bracket
```

### Acceptance Criteria

- [ ] Single elimination tournament (8 players)
- [ ] Auto-generated bracket
- [ ] Results auto-advance winners
- [ ] Tournament standings visible
- [ ] Winner announced with fanfare embed

---

## 3.8 — Fishing System Enhancement

### Current State

`src/bot/homestead/fish.ts` (650 lines) and `src/services/fishing.ts` (546 lines) exist and are **fully functional**.

### Enhancement Investigation

1. **Read fish.ts** — What's the current fishing experience?
2. **Read fishing.ts** — What service logic exists?
3. **Enhancement ideas**:
   - Rod upgrades (Old Rod → Good Rod → Super Rod)
   - Fishing-exclusive species
   - Fishing competitions
   - Rare fishing encounters (legendary fish)

---

## Phase 3 Checklist

| # | Feature | Effort | Risk | Priority |
|---|---------|--------|------|----------|
| 3.1 | Evolution system | 1 week | Medium | HIGH |
| 3.2 | Weather & time | 3–4 days | Low | HIGH |
| 3.3 | Abilities (8 core) | 4–5 days | Medium | HIGH |
| 3.4 | Held items (6 core) | 3–4 days | Medium | MEDIUM |
| 3.5 | Gen 2 expansion | 3–4 days | Low | MEDIUM |
| 3.6 | Daily rewards expansion | 2–3 days | Low | MEDIUM |
| 3.7 | Tournament system | 1 week | High | LOW |
| 3.8 | Fishing enhancement | 2–3 days | Low | LOW |

**Total Phase 3 effort:** 3–4 weeks (features can be staggered for incremental releases)

**Key Insight:** Evolution is the highest-impact feature. A Pokémon game without evolution feels incomplete. Prioritize 3.1 above all others.

---

*Parent: [ROADMAP-INDEX.md](ROADMAP-INDEX.md) | Prev: [Phase 2 — GameServer API](PHASE-2-GAMESERVER-API.md) | Next: [Phase 4 — SensaiOS Completion](PHASE-4-SENSAIOS-COMPLETION.md)*
