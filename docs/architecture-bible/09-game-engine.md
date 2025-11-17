# Section 9: Game Engine

[← Back to INDEX](INDEX.md) | [← Previous: Router System](08-router-system.md) | [Next: Discord Bot →](10-discord-bot.md)

---

**Philosophy**: "Deterministic, auditable, and testable. The game engine is the referee—consistent, fair, and verifiable."

**Purpose**: Core Pokémon battle and encounter systems with PBSL (Pokémon Battle Snapshot Language) for deterministic testing.

## 9.1 PBSL Manifesto

**Pokémon Battle Snapshot Language** — Deterministic, auditable battle system framework.

**Core Principles**:
1. **Determinism** — Same inputs always produce same outputs (no random variance in tests)
2. **Auditability** — Complete battle history captured in minimal snapshots
3. **Testability** — Oracle-based testing with golden snapshots
4. **Reproducibility** — Any battle can be replayed from snapshot

**PBSL Snapshot Format**:

```yaml
# tests/pbsl/fixtures/battle-001.yaml
title: "Pikachu vs Bulbasaur - Thunderbolt OHKO"
initial:
  active:
    - name: "Pikachu"
      species: "Pikachu"
      level: 50
      hp: 100
      maxHp: 100
      stats: { atk: 55, def: 40, spa: 50, spd: 50, spe: 90 }
      moves: ["Thunderbolt", "Quick Attack", "Iron Tail", "Thunder Wave"]
    - name: "Bulbasaur"
      species: "Bulbasaur"
      level: 50
      hp: 100
      maxHp: 100
      stats: { atk: 49, def: 49, spa: 65, spd: 65, spe: 45 }
      moves: ["Vine Whip", "Tackle", "Growl", "Leech Seed"]

actions:
  - turn: 1
    user: 0
    move: "Thunderbolt"
    target: 1

expected:
  winner: 0
  turns: 1
  final_hp:
    - 100
    - 0
  damage_breakdown:
    - turn: 1
      attacker: 0
      defender: 1
      move: "Thunderbolt"
      damage: 100
      critical: false
      effective: "super-effective"
```

**Oracle Testing**:

```typescript
// tests/pbsl/oracle.spec.ts
import { runPBSLBattle } from "../src/core/pbsl/runner.js";
import { loadFixture } from "../src/core/pbsl/loader.js";

describe("PBSL Oracle", () => {
  it("should match expected outcome for battle-001", async () => {
    const fixture = await loadFixture("battle-001.yaml");
    const result = await runPBSLBattle(fixture.initial, fixture.actions);
    
    expect(result.winner).toBe(fixture.expected.winner);
    expect(result.turns).toBe(fixture.expected.turns);
    expect(result.finalHp).toEqual(fixture.expected.final_hp);
    expect(result.damageBreakdown).toEqual(fixture.expected.damage_breakdown);
  });
});
```

**Benefits**:
- ✅ Deterministic battle outcomes (no flaky tests)
- ✅ Regression detection (changes break oracle tests immediately)
- ✅ Battle replays (reproduce bugs from snapshots)
- ✅ AI debugging (agents can analyze battle snapshots)

**Coverage**: 293/294 tests passing (PBSL suite included).

## 9.2 Battle DM Flow

**Battle System Integration** — DM-based battle interface with move/switch/forfeit interactions.

**Battle State Diagram**:

```
Idle → Battle Start → [Turn Prompt | Move Selection | Damage Resolution] → Battle End → Idle
```

**Turn Prompt**:

```
⚔️ Battle Turn 3

Your Pokémon: Pikachu (HP: 45/100)
Opponent: Bulbasaur (HP: 60/100)

What will Pikachu do?

[Thunderbolt] [Quick Attack] [Iron Tail] [Thunder Wave]
[Switch] [Forfeit]
```

**Move Selection** (Button Interaction):

```typescript
// src/bot/battle/move-handler.ts
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  
  const [action, battleId, moveIndex] = interaction.customId.split(":");
  
  if (action === "move") {
    const battle = await prisma.battle.findUnique({ where: { id: battleId } });
    const result = await executeBattleMove(battle, moveIndex);
    
    await interaction.update({
      content: formatBattleResult(result),
      components: nextTurnButtons(result)
    });
  }
});
```

**Damage Resolution**:

```
⚡ Pikachu used Thunderbolt!

It's super effective!
Bulbasaur took 45 damage! (60 → 15 HP)

💚 Bulbasaur used Vine Whip!

Pikachu took 20 damage! (45 → 25 HP)

---

⚔️ Battle Turn 4

Your Pokémon: Pikachu (HP: 25/100)
Opponent: Bulbasaur (HP: 15/100)

What will Pikachu do?
```

**Battle End**:

```
🏆 Victory!

Pikachu defeated Bulbasaur!

Rewards:
• XP: +150
• Money: $500
• Item: Potion x2

[Return to Home] [Find Another Battle]
```

**Error Handling**:
- Battle not found: "This battle has ended or expired."
- Invalid move: "Pikachu can't use that move right now."
- Turn timeout: "You took too long! Pikachu used Struggle."

## 9.3 Cache Safety

**Comprehensive Safety Mechanisms** — Preventing data loss and corruption in cached data structures.

**Safety Layers**:

1. **Write Buffer Validation** — Verify data integrity before writing
2. **Readonly Guards** — Prevent accidental mutations of read-only views
3. **Null Safety** — Handle missing/corrupted cache entries gracefully
4. **Rollback on Error** — Revert partial writes if operation fails
5. **Cache Versioning** — Detect schema mismatches between cache and database

**Example**:

```typescript
// src/services/cache-manager.ts
export class CacheManager {
  async set(key: string, value: any): Promise<void> {
    // 1. Validate data structure
    if (!this.isValid(value)) {
      throw new Error(`Invalid cache value for key: ${key}`);
    }
    
    // 2. Create backup
    const backup = await this.get(key);
    
    try {
      // 3. Write to cache
      await this.cache.set(key, value);
      
      // 4. Verify write
      const written = await this.cache.get(key);
      if (!deepEqual(written, value)) {
        throw new Error("Cache write verification failed");
      }
    } catch (error) {
      // 5. Rollback on error
      if (backup) {
        await this.cache.set(key, backup);
      }
      throw error;
    }
  }
}
```

## 9.4 DB Replication

**Three-Tier Caching** — In-memory (L1) → On-disk (L2) → PostgreSQL (source of truth).

**Architecture**:

```
Application → [L1 Cache (Map) | L2 Cache (sqlite) | PostgreSQL]
```

**Read Flow**:

```
1. Check L1 (in-memory) → Hit? Return
2. Check L2 (disk) → Hit? Update L1, Return
3. Query PostgreSQL → Update L2, Update L1, Return
```

**Write Flow**:

```
1. Write to Write Buffer (in-memory queue)
2. Batch writes every 5 seconds → PostgreSQL
3. On success → Update L2 → Update L1
```

**Cache Invalidation**:
- TTL-based: L1 entries expire after 5 minutes
- Event-based: Database writes invalidate affected L1/L2 entries
- Manual: Admin commands can force cache refresh

**Write Buffer**:

```typescript
// src/services/write-buffer.ts
export class WriteBuffer {
  private queue: WriteOperation[] = [];
  private maxSize = 10_000; // 10k entries max
  
  add(op: WriteOperation) {
    if (this.queue.length >= this.maxSize) {
      log.warn("Write buffer full, flushing immediately");
      this.flush();
    }
    this.queue.push(op);
  }
  
  async flush() {
    const batch = this.queue.splice(0);
    await prisma.$transaction(batch.map(op => op.query));
  }
}

setInterval(() => writeBuffer.flush(), 5000);
```

**Memory Budget**:
- L1 Cache: 20 MB (lazy loading + feature flags)
- L2 Cache: 50 MB (sqlite database)
- Write Buffer: 5 MB (queue size limits)
- **Total**: ~75 MB

## 9.5 DB Persistence Roadmap

**Migration from sql.js to better-sqlite3** — Improved performance and native bindings.

**Current State** (Phase 9):
- Using `sql.js` (WASM-based SQLite)
- L2 cache in-memory (lost on restart)
- Write buffer flushes to PostgreSQL only

**Target State** (Phase 10):
- Using `better-sqlite3` (native SQLite)
- L2 cache persisted to `/Store/cache.db`
- Write buffer persists across restarts

**Migration Plan**:
1. Install `better-sqlite3` dependency
2. Implement persistence layer (`src/services/l2-cache-persistence.ts`)
3. Migrate existing L2 data (one-time migration script)
4. Update cache manager to use persisted L2
5. Add cache warming on startup
6. Remove `sql.js` dependency

**Benefits**:
- ✅ Faster cache operations (native bindings vs WASM)
- ✅ Persistent L2 cache (survives restarts)
- ✅ Reduced database load (more cache hits)
- ✅ Lower memory usage (disk-backed instead of in-memory)

## 9.6 Event Tracking

**Complete Event Schema** — Unified event tracking across battle, encounter, and user actions.

**Event Types**:
- `battle.started` — New battle initiated
- `battle.turn` — Turn completed (move executed, damage dealt)
- `battle.ended` — Battle concluded (winner determined)
- `encounter.spawned` — Wild Pokémon appeared
- `encounter.caught` — Pokémon captured
- `encounter.fled` — Pokémon escaped
- `user.command` — Slash command executed
- `user.action` — Button/modal interaction
- `user.error` — User-facing error occurred

**Event Schema**:

```typescript
interface GameEvent {
  id: string;                     // UUID
  type: string;                   // Event type
  timestamp: Date;
  correlationId: string;          // Links related events
  
  user: {
    id: string;
    username: string;
  };
  
  guild?: {
    id: string;
    name: string;
  };
  
  data: Record<string, any>;      // Event-specific data
  
  metadata: {
    source: string;               // "battle-engine" | "encounter-system" | ...
    version: string;              // Event schema version
  };
}
```

**Usage**:

```typescript
import { trackEvent } from "./services/event-tracker.js";

trackEvent({
  type: "battle.turn",
  correlationId: battleId,
  user: { id: userId, username },
  data: {
    turn: 3,
    attacker: "Pikachu",
    defender: "Bulbasaur",
    move: "Thunderbolt",
    damage: 45,
    critical: false
  },
  metadata: {
    source: "battle-engine",
    version: "1.0.0"
  }
});
```

**Event Storage**:

```
/Store/events/
├── current.ndjson               # Active event log
└── archive/
    └── *.ndjson.gz              # Compressed archives
```

**Query Interface**:

```bash
# Recent events
node src/cli/event-query.js recent --limit 100

# By type
node src/cli/event-query.js query --type battle.turn --since 1h

# By correlation ID
node src/cli/event-query.js query --correlationId abc123

# Statistics
node src/cli/event-query.js stats --since 24h
```

## 9.7 Dex V2

**High-Availability Pokédex Model** — Generation 1-4 complete dataset with offline fallback.

**Data Pipeline**:

```
PokéAPI → scripts/fetch_pokemon.mjs → data/*.json → assets/dexpack.v2.json
```

**Dexpack V2 Schema**:

```typescript
interface DexpackV2 {
  version: string;
  generatedAt: string;
  species: Record<string, SpeciesEntry>;
  moves: Record<string, MoveEntry>;
  types: Record<string, TypeEntry>;
  abilities: Record<string, AbilityEntry>;
}

interface SpeciesEntry {
  id: number;
  name: string;
  types: string[];
  baseStats: { hp, atk, def, spa, spd, spe };
  abilities: string[];
  moves: Array<{ name, level?, method }>;
  evolutionChain?: EvolutionChain;
  sprites: { front, back, shiny };
}
```

**Offline Fallback**:

```typescript
// src/services/dex-service.ts
import dexpackV2 from "../../assets/dexpack.v2.json";

export class DexService {
  async getSpecies(name: string): Promise<SpeciesEntry> {
    // 1. Try L1 cache
    if (this.cache.has(name)) return this.cache.get(name);
    
    // 2. Try database
    const dbEntry = await prisma.species.findUnique({ where: { name } });
    if (dbEntry) return dbEntry;
    
    // 3. Fallback to dexpack
    const dexEntry = dexpackV2.species[name];
    if (dexEntry) return dexEntry;
    
    throw new Error(`Species not found: ${name}`);
  }
}
```

**Generation Coverage**:
- Gen 1: 151 species (Bulbasaur → Mew)
- Gen 2: 100 species (Chikorita → Celebi)
- Gen 3: 135 species (Treecko → Deoxys)
- Gen 4: 107 species (Turtwig → Arceus)
- **Total**: 493 species

**Build Command**:

```bash
npm run data:dexpack
# Generates assets/dexpack.v1.json (compact) + assets/dexpack.v2.json (complete)
```

**Performance**:
- Dexpack load: <50ms (single JSON parse)
- Species lookup: <0.1ms (hash table)
- Memory overhead: ~15 MB (full dexpack in memory)

---

## 9.10 Game Rules & Mechanics (MVP)

**Ruleset Version:** 0.1 (tied to code releases)  
**Philosophy:** Classic core mechanics, no Z/Max/Tera initially

### Scope

**Included in MVP:**
- Type effectiveness system with STAB (Same Type Attack Bonus)
- Critical hits with 6.25% base rate
- Accuracy calculations
- Stat stage modifiers (-6 to +6 per stat)
- Major status conditions (Burn, Paralyze, Freeze, Sleep, Poison)
- Turn order resolution
- Minimal moveset for early tests

**Excluded from MVP:**
- Z-Moves, Dynamax, Gigantamax
- Terastallization
- Weather effects (Sunny Day, Rain Dance, etc.)
- Terrain effects (Electric Terrain, Grassy Terrain, etc.)
- Complex abilities beyond basic passive effects

### Status & Turn Order

**Turn Priority Resolution:**
1. **Move priority** — Highest priority moves resolve first (Quick Attack = +1, Protect = +4)
2. **Effective Speed** — After status and stage modifiers applied
3. **Deterministic tiebreaker** — Alphabetical by combatant name when speed ties

**Status Effects:**

**Paralysis:**
- Halves effective Speed stat
- No "fully paralyzed" turn skip in MVP (future enhancement)

**Burn:**
- Halves physical Attack stat
- Deals 1/16 max HP damage per turn

**Poison:**
- Deals 1/8 max HP damage per turn (regular poison)
- Badly Poisoned increases damage each turn

**Sleep:**
- Tracked on status field but does not inhibit acting yet (MVP limitation)
- Full sleep mechanics in later revisions

**Freeze:**
- Tracked on status field but does not inhibit acting yet (MVP limitation)
- Full freeze mechanics in later revisions

**Flinch:**
- Applied after damage is dealt
- Consumed at start of next turn (before order calculation)
- Flinched Pokémon forfeits that action entirely

### Early Battle Item Pool

**Offensive Held Items (Enabled):**

**Choice Band:**
- Effect: +50% Attack stat
- Restriction: Locks into first move used (not enforced in MVP)

**Choice Specs:**
- Effect: +50% Special Attack stat
- Restriction: Locks into first move used (not enforced in MVP)

**Life Orb:**
- Effect: +30% damage on all damaging moves
- Cost: 10% max HP recoil after successful hit

**Disabled Items:**
- All other held items ignored by engine in MVP
- Defensive items (Leftovers, Sitrus Berry, etc.) planned for later phases
- Status items (Flame Orb, Toxic Orb, etc.) planned for later phases

### Versioning Policy

**Breaking Changes:**
- Require migration notes
- Must update test suite
- Document in ops/change-ledger.md

**Ruleset Updates:**
- Tied to code releases (semantic versioning)
- Major version bump for mechanics changes
- Minor version bump for item/move additions
- Patch version for bug fixes

**See Also:**
- § 9.1 (PBSL Manifesto) — Deterministic testing framework
- § 9.2 (Battle Flow) — Combat resolution sequence
- § 9.5 (Engine DB) — Battle state persistence
- `tests/pbsl/fixtures/` — Oracle test fixtures

---

[← Back to INDEX](INDEX.md) | [← Previous: Router System](08-router-system.md) | [Next: Discord Bot →](10-discord-bot.md)