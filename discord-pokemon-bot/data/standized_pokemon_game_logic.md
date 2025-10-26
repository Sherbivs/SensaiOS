# Standardized Pokémon Game Logic (Buddy System Edition)

> Purpose: A conservative, implementation-ready reference for building a Pokémon-style “Buddy System” that is deterministic, testable, and compatible with common community engines. This document avoids novel mechanics and focuses on baselines that have been stable for multiple generations.

---

## 0. Scope
- **In-scope**: Status-neutral following mechanics, lightweight battle calculations, encounter odds, friendship/affection, experience/leveling, tasks/quests, items, type effectiveness, RNG strategy, and data contracts for API/DB.
- **Out-of-scope**: Full competitive clauses, complex doubles mechanics, generation-specific edge cases unless noted, animation and VFX, online multiplayer protocols.

**Design Goals**
1) Deterministic, seedable sims.
2) Test-first with fixtures.
3) Clear separation between **data** (Dex) and **logic** (Engine).
4) Backwards-compatible units (floats avoided where possible; integer math with floor/ceil rules).

---

## 1. Core Vocabulary
- **Species**: Template describing base stats, types, abilities, learnset.
- **Buddy**: A user-owned instance of a Pokémon-like creature with IVs, EVs, level, nature, and friendship.
- **Move**: Action a Buddy can perform; has category (Physical/Special/Status), base power, accuracy, priority, and flags.
- **Trainer**: The player/controller; holds party, items, and progression flags.
- **Encounter**: A roll that yields a species (and possibly form) under location/time/weather constraints.
- **Session Seed**: A PRNG seed that drives all stochastic outcomes for audit.

---

## 2. Data Model (Canonical, Minimal)

### 2.1 Species
```json
{
  "id": "bulbasaur",
  "dex": 1,
  "types": ["GRASS", "POISON"],
  "baseStats": {"hp":45, "atk":49, "def":49, "spa":65, "spd":65, "spe":45},
  "abilities": ["OVERGROW"],
  "hiddenAbility": "CHLOROPHYLL",
  "expYield": 64,
  "captureRate": 45,
  "eggGroups": ["MONSTER", "GRASS"],
  "learnset": [{"move":"TACKLE", "level":1}]
}
```

### 2.2 Buddy (Instance)
```json
{
  "uid": "buddy_123",
  "speciesId": "bulbasaur",
  "level": 5,
  "exp": 135,
  "nature": "MODEST",
  "iv": {"hp":31, "atk":12, "def":20, "spa":31, "spd":18, "spe":14},
  "ev": {"hp":0, "atk":0, "def":0, "spa":0, "spd":0, "spe":0},
  "friendship": 70,
  "moves": ["TACKLE", "GROWL"],
  "heldItem": null,
  "status": null
}
```

### 2.3 Move
```json
{
  "id": "TACKLE",
  "category": "PHYSICAL",
  "type": "NORMAL",
  "power": 40,
  "accuracy": 100,
  "priority": 0,
  "flags": {"contact": true}
}
```

### 2.4 Trainer
```json
{
  "id": "user_abc",
  "party": ["buddy_123"],
  "bag": {"POKE_BALL": 10, "POTION": 2},
  "badges": 0,
  "flags": {"tutorialComplete": true}
}
```

---

## 3. Stats & Derived Values

### 3.1 Derived Stat Formulas (Gen-agnostic baseline)
- **HP**: `HP = floor(((2 * Base + IV + floor(EV/4)) * Level) / 100) + Level + 10`
- **Other**: `Stat = floor((floor(((2 * Base + IV + floor(EV/4)) * Level) / 100) + 5) * NatureMod)`
- **NatureMod** ∈ {0.9, 1.0, 1.1}

### 3.2 Friendship (Buddy System)
- Range: 0–255; default 70.
- Modifiers (examples):
  - Walk step: +1 per N steps (throttled, daily cap).
  - Battle participation: +1 per victory (no faint).
  - Level up: +1.
  - Faint: −1.
  - Certain items: ±X (e.g., luxury-like effect).

---

## 4. Type System

### 4.1 Type Chart (12.5% summary)
- Effectiveness multipliers: 0×, 0.5×, 1×, 2×.
- **STAB (Same-Type Attack Bonus)**: 1.5× if move type matches Buddy type; 2.0× if an ability explicitly states.

### 4.2 Resolution
`DamageMultiplier = STAB * TypeEffectiveness(product across defender’s types) * OtherModifiers`

---

## 5. Accuracy & Criticals

- **Hit Check**: `hit = (rand() < (Accuracy * A/E))`, where A/E are user/evasion stage multipliers.
- **Crit**: independent roll, baseline ~1/24 (configurable). Criticals ignore negative attack stage and positive defense stage and apply a crit multiplier (commonly 1.5×).

---

## 6. Damage (Simplified, Integer Safe)

### 6.1 Base Formula
```
// Using a well-known conservative structure
Damage = floor(
  floor(
    floor(( ( (2 * L / 5 + 2) * P * A / D ) / 50) + 2)
    * Mod1 // weather, abilities, items that apply here
  )
  * Mod2 // STAB, type effectiveness
)
* Random // uniform in [0.85, 1.00] as 16-step integer table
```
- Apply rounding floors at each stage.
- Random is drawn from a fixed 16-value table for reproducibility.

### 6.2 Residuals Order (Single-turn Skeleton)
1) Start-of-turn effects (weather/terrain duration decrement if applicable).
2) Action queue (priority → speed → ties broken by PRNG).
3) Apply move effects.
4) End-of-turn residuals: weather, poison/burn, leech-like effects, leftovers-like.

---

## 7. Status Conditions (Primary Set)
- **Burn**: Periodic damage = floor(MaxHP / 16); Physical attack modifier 0.5× unless ability/item says otherwise.
- **Poison**: Periodic damage = floor(MaxHP / 8) (or /16 for regular poison; /8 for toxic-like ramping handled via counter).
- **Paralysis**: Speed modifier 0.5× (configurable per gen); chance to be fully paralyzed each action.
- **Sleep**: Counter-based, decremented at turn end.
- **Freeze**: Thaw chance each action; fire-type moves thaw.

---

## 8. Encounters & Capture

### 8.1 Encounter Odds
- Each location defines a **weighted table** of species.
- Optional modifiers: time-of-day, weather, event flags.
- **Determinism**: Encounter RNG advanced by `(timestampBucket ⊕ userId ⊕ stepCount)`.

### 8.2 Capture (Conservative Proxy)
- Use species **captureRate** to compute a ball-dependent success chance following a standard curve.
- Pseudocode:
```pseudo
X = f(captureRate, ballMod, statusMod, hpRatio)
success = rand() < clamp01(X)
```
- Keep the function monotonic and validated against reference curves.

---

## 9. Experience & Leveling
- **Exp Gain**: `gain = floor(baseYield * trainerMod * participationShare)`
- **Level Curve**: Choose one of the canonical curves (Fast/Medium Slow/Slow). Store as a lookup table `level -> totalExp`.
- **Level Up**: On crossing threshold, increment level, recalc stats, check learnset.

---

## 10. Tasks/Quests (Buddy-Centric)
- **Daily Walk**: Hit N step milestones for small friendship/exp.
- **Training Drill**: Select a stat focus → small EV gain with cap.
- **Fetch Quest**: Chance to return with a common item; scaled by friendship.
- **Photo/Showcase**: Cosmetic, awards a title/badge.

Each task is a finite state machine with: `IDLE → ACTIVE → RESOLVE → COOLDOWN`.

---

## 11. Items (Baseline)
- **Healing**: Restores HP; fails if full.
- **Status Cure**: Clears one status.
- **Stat Booster (temporary)**: Stage changes until switch/turn end.
- **Held Items**: Light-touch effects only for this spec (e.g., simple leftovers-like tick; simple choice-like boost).

---

## 12. Stages & Multipliers

### 12.1 Stat Stages (−6 … +6)
Use a rational table:
- Stage ≥ 0: `(2 + stage) / 2`
- Stage < 0: `2 / (2 − stage)`

### 12.2 Speed Ties
- Shuffle equally fast actors using PRNG once per turn.

---

## 13. PRNG & Auditability
- **Algorithm**: PCG32 or SplitMix64.
- **Seeding**: `seed = HMAC(serverSecret, userId)`; session stream advanced by contextual counter (location, step, turn).
- **Proof**: For any outcome, log `{seedHash8, context, stepIndex, rollValue}`.
- **Replay**: Outcomes are reproducible given seed and context.

---

## 14. Engine APIs

### 14.1 Battle-Lite
```ts
interface BattleInput {
  attacker: Buddy; defender: Buddy; move: Move; weather?: Weather; terrain?: Terrain;
}
interface BattleResult { damage: number; isCrit: boolean; hit: boolean; effectiveness: number; logs: string[]; }
```

### 14.2 Encounter
```ts
interface EncounterCtx { userId: string; location: string; timeOfDay?: 'day'|'night'; weather?: string; step: number; }
interface EncounterResult { speciesId: string; level: number; proof: { seedHash: string; step: number; signature: string }; }
```

### 14.3 Friendship
```ts
function applyFriendshipEvent(buddy: Buddy, event: 'walk'|'levelup'|'faint'|'useItem'): Buddy
```

---

## 15. Validation & Tests
- **Golden Oracles**: Verify damage, accuracy, crits, and residuals against a trusted engine snapshot.
- **Fixtures**: JSON cases for common scenarios; include seed and expected outputs.
- **Property Tests**: Monotonicity (e.g., higher attack ⇒ non-decreasing damage median), boundedness, and reproducibility.

---

## 16. Persistence & Migrations
- **IDs**: Use stable string IDs for cross-version consistency.
- **Versioning**: `engineVersion` and `dexVersion` stored on each Buddy for future migrations.
- **Migrations**: Provide scripts to rebuild derived stats on ruleset changes.

---

## 17. Security & Anti-Cheat
- Server authoritative on RNG and outcomes.
- All client requests are intentions; server computes results.
- Sign proofs for rare outcomes; rate-limit sensitive endpoints.

---

## 18. Telemetry
- Emit structured logs: `{mechanic, speciesId, moveId, seedHash8, durationMs}`.
- Track error rates per mechanic to detect regressions.

---

## 19. Configuration Matrix (Simple Switches)
- `RULESET.gen`: numeric tag for rounding/crit behavior.
- `RULESET.damageRandomTable`: 16 integers in [85..100].
- `FRIENDSHIP.walkStepInterval`: integer.
- `ENCOUNTER.timeOfDayWeights`: map.

---

## 20. Glossary
- **STAB**: Same-Type Attack Bonus.
- **EV/IV**: Effort/Individual Values.
- **RNG**: Random Number Generator.
- **Seed**: Initial state of the RNG from which outcomes are derived.

---

## 21. Change Policy
- Changes require: rationale, test plan, and migration notes.
- Pin external references by commit and store in config.

---

### Appendix A: Integer Random Table (Default)
```
// 16-step table representing [0.85, 1.00]
[85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100]
```

### Appendix B: Example Turn Resolution Log
```
TURN 5
Queue: [Bulbasaur uses TACKLE, Pidgey uses GUST]
Speed tie → shuffled: [Pidgey, Bulbasaur]
Roll(Hit): true | Roll(Crit): false | Random: 0.92
Damage: 7 | Residuals: none
```

### Appendix C: Minimal Type Multipliers (Excerpt)
```
NORMAL→ROCK=0.5, NORMAL→GHOST=0.0, FIRE→GRASS=2.0, WATER→FIRE=2.0
```

---

**End of File**


---

## 22. Using PokeAPI as Your Data Source (Adapter Notes)
**Intent:** Keep engine logic from this spec while sourcing authoritative Dex content from PokeAPI. PokeAPI = data; this spec = rules.

### 22.1 Version Pinning
- Choose a `version_group` (e.g., `red-blue`, `sword-shield`, `scarlet-violet`).
- Store it in config: `DEX_SOURCE.versionGroup = "scarlet-violet"`.
- All imports MUST filter by this group to avoid cross-gen drift (e.g., move power changes).

### 22.2 Import Workflow (Snapshot, not Live)
1) Fetch from PokeAPI → normalize → **write a versioned JSON snapshot** (`dex_snapshot_<versionGroup>_<hash>.json`).
2) Engine loads only from the snapshot (no network in battle/encounter paths).
3) CI compares new snapshots to detect data diffs before shipping.

### 22.3 Minimal Adapter Contracts
```ts
// Engine-facing shapes (already defined in §2). Below is a PokeAPI→Engine adapter surface.
interface PokeApiAdapter {
  loadSpecies(versionGroup: string): EngineSpecies[];
  loadMoves(versionGroup: string): EngineMove[];
  loadLearnsets(versionGroup: string): { [speciesId: string]: LearnsetEntry[] };
  loadAbilities(versionGroup: string): EngineAbility[]; // optional for v1
  loadGrowthCurves(): { [growthId: string]: number[] }; // level -> totalExp
}
```

**Mapping Notes**
- `pokemon` (stats) → `baseStats` (HP/ATK/DEF/SPA/SPD/SPE)
- `pokemon.types` → `types` (order irrelevant)
- `pokemon.abilities` → `abilities` + `hiddenAbility`
- `move` (filtered by `version_group`) → `Move` (power, accuracy, priority, damage_class → category)
- `pokemon.moves` (method=`level-up`, filtered by `version_group`) → `learnset`
- `species.capture_rate` → `captureRate`
- `species.base_happiness` → default `friendship`
- `species.growth_rate` → level curve key (map to engine curve table)
- Forms/variants: treat each PokeAPI `pokemon` with unique stats/typing as either a distinct `speciesId` or as `speciesId + form` (pick one model and be consistent).

### 22.4 Engine-Owned Constants (Do NOT fetch from PokeAPI)
- Type effectiveness matrix (embed a static chart).
- RNG tables, crit rate, accuracy/evasion stage multipliers.
- Status math, end-of-turn order, friendship deltas, encounter PRNG.

### 22.5 Normalization Rules
- **IDs**: UPPER_SNAKE for moves/types/abilities; kebab or snake for species (e.g., `bulbasaur`).
- **Numbers**: Coerce `power`, `accuracy`, `priority`, `baseStats` to integers.
- **Nulls**: Missing `power`/`accuracy` for status moves → `power: 0`, `accuracy: 0` with `category: STATUS`.
- **Text**: Keep PokeAPI names as `displayName`; engine uses `id`.

### 22.6 Contract Tests (Sample)
```json
{
  "versionGroup": "scarlet-violet",
  "assertions": [
    {"moveId":"TACKLE", "power":40, "accuracy":100, "category":"PHYSICAL"},
    {"speciesId":"bulbasaur", "types":["GRASS","POISON"], "baseStats":{"hp":45,"atk":49,"def":49,"spa":65,"spd":65,"spe":45}},
    {"speciesId":"pikachu", "captureRate":190},
    {"speciesId":"eevee", "friendshipDefault":70}
  ]
}
```

### 22.7 Snapshot Format (Excerpt)
```json
{
  "meta": {"versionGroup": "scarlet-violet", "source": "pokeapi", "createdAt": "2025-10-26T00:00:00Z", "hash": "abc123"},
  "species": [ {"id":"bulbasaur", "dex":1, "types":["GRASS","POISON"], "baseStats":{"hp":45,"atk":49,"def":49,"spa":65,"spd":65,"spe":45}, "abilities":["OVERGROW"], "hiddenAbility":"CHLOROPHYLL", "expYield":64, "captureRate":45, "friendship":70, "learnset":[{"move":"TACKLE","level":1}] } ],
  "moves": [ {"id":"TACKLE", "type":"NORMAL", "category":"PHYSICAL", "power":40, "accuracy":100, "priority":0, "flags":{"contact":true}} ]
}
```

### 22.8 Pitfalls & Policies
- **Cross-gen drift**: The same move can change values across gens—pin and test.
- **Tutor/TM noise**: Import only what your game mode supports; ignore the rest to keep the ruleset minimal.
- **Network determinism**: Never roll RNG while waiting for network; import offline then simulate.
- **Forms**: Regional/mega/gmax—decide early whether they are separate `speciesId`s; document your choice in the snapshot `meta`.

### 22.9 Checklist for Integration
- [ ] Choose and pin `version_group`.
- [ ] Write adapter and snapshot exporter.
- [ ] Embed static type chart in engine.
- [ ] Add contract tests for 10+ common species/moves.
- [ ] Enable CI diff on snapshots; block release on unexpected diffs.
- [ ] Load-only-from-snapshot in prod.

**Result:** You get authoritative data from PokeAPI while preserving the deterministic, testable battle/encounter logic in this spec.

