# Section 9: Game Engine

**Last Updated**: 2025-12-27 | **Status**: Production

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

## 9.2 Battle Channel Flow

**Battle System Integration** — **Private guild channel-based battle interface** with move/switch/forfeit interactions.

**HOMESTEAD MIGRATION COMPLETE (2025-06-15):** Battles now use homestead channels instead of DMs. Each participant receives battle updates in their private homestead-{username} channel. See `docs/architecture-bible/18-private-channel-architecture.md` for complete specification.

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

## 9.8 Engine DB Runtime Architecture

**Purpose**: Initialize Engine DB runtime (Read-DB + Write-DB) for ultra-fast Pokémon data access and battle log persistence during Phase 3 of boot.

**Source**: `src/index.ts` Phase 3 Engine DB initialization (lines 1292-1420)

**Called From**: `src/index.ts` Phase 3 (Engine DB + Discord Bots) — parallel initialization with Discord bot

**Architecture**: 3-tier caching system with SQLite persistence.

```
PROD PostgreSQL (slow: 50-100ms)
    ↓ Daily sync (Worker 3)
Read-DB (SQLite, fast: ~50ms)
    ↓ L1 Cache load (blocking)
L1 Cache (Map, ultra-fast: <1μs)
    ↓ Game engine lookups
Battle Resolution (<1ms total lookup overhead)
```

### 9.8.1 Initialization Flow

**7-Step Initialization Sequence**:

```typescript
// Phase 3: Engine DB + Bots (Parallel)
const [engineResult, _, client] = await Promise.all([
  // Engine DB initialization (7 steps)
  (async () => {
    // Step 1: Validate config
    validateEngineDbConfig();
    
    // Steps 2-5: Parallel Read-DB + Write-DB init
    await Promise.all([
      // Read-DB path
      (async () => {
        await engineReadDbService.initialize();  // Step 2
        // L1 cache already loaded by Service Registry // Step 3
      })(),
      
      // Write-DB path
      (async () => {
        await engineWriteDbService.initialize();  // Step 4
        await engineWriteDbService.replayWAL();   // Step 5
      })(),
    ]);
    
    // Step 6: Start background workers
    await startEngineWorkers();
    await errorLearningWorker.start();
    await aiLogger.initialize();
    resourceMonitor.resourceMonitor.start();
    
    // Step 7: Mark engine ready
    global.engineReady = true;
    
    return { success: true };
  })(),
  
  // Security Bot (if enabled)
  ENABLE_SECURITY_BOT ? bootSecurityBot() : Promise.resolve(null),
  
  // Discord Bot (main bot)
  bootDiscord(),
]);
```

**Parallelization**: Read-DB and Write-DB initialize concurrently (independent SQLite databases).

**Graceful Degradation**: Engine DB failures don't block boot — app continues with Prisma fallback.

### 9.8.2 Step 1: Config Validation

**Purpose**: Ensure storage directories exist before database operations.

```typescript
// From src/config/engine-db-config.ts
export function validateEngineDbConfig(): void {
  // Check that storage paths are configured
  if (!READ_DB_PATH || !WRITE_DB_PATH) {
    throw new Error('Engine DB paths not configured');
  }
  
  // Ensure directories exist (create if missing)
  const readDir = path.dirname(READ_DB_PATH);
  const writeDir = path.dirname(WRITE_DB_PATH);
  
  if (!fs.existsSync(readDir)) {
    fs.mkdirSync(readDir, { recursive: true });
  }
  
  if (!fs.existsSync(writeDir)) {
    fs.mkdirSync(writeDir, { recursive: true });
  }
}
```

**Storage Paths**:
- **Production**: `/Store/engine-read.db`, `/Store/engine-write.db`
- **Workstation**: `Store/engine-read.db`, `Store/engine-write.db`
- **Test**: `Store/test/engine-read.db`, `Store/test/engine-write.db`

### 9.8.3 Step 2: Read-DB Initialization

**Purpose**: Load read-only SQLite database containing Pokémon reference data.

**Service**: Retrieved from Service Registry (initialized in Phase 1).

```typescript
if (!engineReadDbService) {
  throw new Error('Engine Read-DB service not initialized from registry');
}

await engineReadDbService.initialize();

const readStats = engineReadDbService.getStats();
log.info("Engine Read-DB initialized", {
  pokemon: readStats.pokemonCount,         // ~1000 species
  moves: readStats.moveCount,              // ~800 moves
  typeEffectiveness: readStats.typeEffectivenessCount, // ~300 matchups
  sizeBytes: readStats.sizeBytes           // ~5-10 MB
});
```

**Database Schema** (Read-DB):

```sql
CREATE TABLE pokemon (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  types TEXT NOT NULL,  -- JSON array
  stats TEXT NOT NULL,  -- JSON object
  abilities TEXT,       -- JSON array
  UNIQUE(id)
);

CREATE TABLE moves (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL,  -- "Physical", "Special", "Status"
  power INTEGER,
  accuracy INTEGER,
  pp INTEGER,
  priority INTEGER DEFAULT 0,
  UNIQUE(id)
);

CREATE TABLE type_effectiveness (
  attacking_type TEXT NOT NULL,
  defending_type TEXT NOT NULL,
  multiplier REAL NOT NULL,
  PRIMARY KEY (attacking_type, defending_type)
);

CREATE TABLE engine_read_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version_fingerprint TEXT NOT NULL,
  last_sync_at TEXT NOT NULL,
  migration_count INTEGER NOT NULL
);
```

**Indexes**:
- `pokemon.id` (primary key)
- `pokemon.name` (unique)
- `moves.id` (primary key)
- `moves.name` (unique)
- `type_effectiveness (attacking_type, defending_type)` (composite primary key)

**SQLite Configuration**:
- WAL mode: `PRAGMA journal_mode = WAL`
- Synchronous: `PRAGMA synchronous = NORMAL`
- Cache size: Configurable via `SQLITE_CACHE_SIZE_KB` (default: 8192 KB = 8 MB)
- Busy timeout: 5000ms

### 9.8.4 Step 3: L1 Cache Load (Already Complete)

**Purpose**: In-memory Map structures for <1μs lookups during battles.

**Note**: L1 Cache (engine-cache service) already loaded by Service Registry in Phase 1 (startupOrder: 30). No additional work needed in Phase 3.

**Cache Contents**:

```typescript
// From src/services/engine-cache.ts
export class EngineCache {
  private pokemon: Map<number, Pokemon> = new Map();
  private pokemonByName: Map<string, Pokemon> = new Map();
  private moves: Map<number, Move> = new Map();
  private typeChart: Map<string, number> = new Map();
  
  // Loaded from engineReadDbService during Service Registry init
  async refresh(): Promise<void> {
    const allPokemon = await this.engineReadDb.getAllPokemon();
    const allMoves = await this.engineReadDb.getAllMoves();
    const allTypeEffectiveness = await this.engineReadDb.getAllTypeEffectiveness();
    
    // Populate Maps (O(n) one-time cost)
    this.pokemon.clear();
    this.pokemonByName.clear();
    for (const p of allPokemon) {
      this.pokemon.set(p.id, p);
      this.pokemonByName.set(p.name.toLowerCase(), p);
    }
    
    this.moves.clear();
    for (const m of allMoves) {
      this.moves.set(m.id, m);
    }
    
    this.typeChart.clear();
    for (const te of allTypeEffectiveness) {
      const key = `${te.attacking_type}:${te.defending_type}`;
      this.typeChart.set(key, te.multiplier);
    }
  }
}
```

**Stats Logging**:

```typescript
if (engineCache) {
  const cacheStats = engineCache.getStats();
  log.info("Engine L1 Cache ready", {
    pokemon: cacheStats.pokemonCount,
    moves: cacheStats.moveCount,
    typeEffectiveness: cacheStats.typeEffectivenessCount,
    memorySizeMb: cacheStats.memorySizeMb.toFixed(2)  // ~20 MB
  });
}
```

**Performance**: <1μs lookups (hash table O(1) complexity).

### 9.8.5 Step 4: Write-DB Initialization

**Purpose**: Load append-only SQLite database for battle logs and analytics.

```typescript
if (!engineWriteDbService) {
  throw new Error('Engine Write-DB service not initialized from registry');
}

await engineWriteDbService.initialize();
log.info("Engine Write-DB initialized");
```

**Database Schema** (Write-DB):

```sql
CREATE TABLE battle_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  battle_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  player1_pokemon TEXT NOT NULL,
  player2_pokemon TEXT NOT NULL,
  winner TEXT,
  total_turns INTEGER,
  timestamp TEXT NOT NULL,
  metadata TEXT  -- JSON
);

CREATE TABLE move_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  battle_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  trainer_id TEXT NOT NULL,
  pokemon_id TEXT NOT NULL,
  move_name TEXT NOT NULL,
  target_id TEXT,
  damage_dealt INTEGER,
  was_critical BOOLEAN DEFAULT 0,
  timestamp TEXT NOT NULL
);

CREATE TABLE anomalies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  battle_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  anomaly_type TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,  -- "LOW", "MEDIUM", "HIGH"
  timestamp TEXT NOT NULL
);

CREATE TABLE write_ahead_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL,  -- "INSERT_BATTLE_LOG", "INSERT_MOVE_USAGE", etc.
  table_name TEXT NOT NULL,
  data TEXT NOT NULL,       -- JSON
  checksum TEXT NOT NULL,   -- SHA-256 for corruption detection
  timestamp TEXT NOT NULL
);
```

**Indexes**:
- `battle_logs.battle_id`
- `move_usage.battle_id`
- `move_usage.trainer_id`
- `anomalies.battle_id`
- `write_ahead_log.timestamp`

**SQLite Configuration**: Same as Read-DB (WAL mode, NORMAL synchronous, 8 MB cache).

### 9.8.6 Step 5: WAL Replay (Crash Recovery)

**Purpose**: Replay Write-Ahead Log to recover data from crashes.

```typescript
await engineWriteDbService.replayWAL();

const writeStats = engineWriteDbService.getStats();
log.info("Engine Write-DB WAL replayed", {
  battleLogs: writeStats.battleLogCount,
  moveUsage: writeStats.moveUsageCount,
  anomalies: writeStats.anomalyCount,
  walEntries: writeStats.walEntryCount  // Should be 0 after replay
});
```

**WAL Replay Logic**:

```typescript
// From src/services/database/engine-write-db.ts
async replayWAL(): Promise<void> {
  const walEntries = await this.db.all('SELECT * FROM write_ahead_log ORDER BY id');
  
  for (const entry of walEntries) {
    // Verify checksum
    const expectedChecksum = crypto.createHash('sha256').update(entry.data).digest('hex');
    if (entry.checksum !== expectedChecksum) {
      log.error('WAL entry corrupted', { entryId: entry.id, expectedChecksum, actualChecksum: entry.checksum });
      continue; // Skip corrupted entry
    }
    
    // Parse and apply operation
    const data = JSON.parse(entry.data);
    switch (entry.operation) {
      case 'INSERT_BATTLE_LOG':
        await this.insertBattleLogs([data]);
        break;
      case 'INSERT_MOVE_USAGE':
        await this.insertMoveUsage([data]);
        break;
      case 'INSERT_ANOMALY':
        await this.insertAnomalies([data]);
        break;
    }
    
    // Delete replayed entry
    await this.db.run('DELETE FROM write_ahead_log WHERE id = ?', entry.id);
  }
  
  log.info('WAL replay complete', { entriesReplayed: walEntries.length });
}
```

**Safety**: Corrupted entries skipped (SHA-256 checksum validation).

### 9.8.7 Step 6: Background Workers

**Purpose**: Start 4 background workers for cache refresh, buffer flush, sync, and validation.

```typescript
await startEngineWorkers();
engineWorkersRunning = true;
log.info("Engine DB workers started");
```

**4 Workers** (from `src/workers/engine-workers.ts`):

1. **CacheRefreshWorker** (hourly + 5s stagger)
   - Calls `engineCache.refresh()` to reload L1 cache from Read-DB
   - Ensures cache stays fresh without blocking battles
   - Logs: `"Engine L1 Cache refreshed"` with new counts

2. **BufferFlushWorker** (30s + 10s stagger)
   - Calls `engineWriteBuffer.flush()` to drain in-memory queues
   - Batches battle logs / move usage / anomalies to Write-DB
   - Backpressure monitoring (75% warn, 95% reject)

3. **ReadDbSyncWorker** (daily + Render cron)
   - Downloads fresh Pokémon data from PROD PostgreSQL
   - Rebuilds Read-DB with latest species/moves/types
   - **Note**: Placeholder in Phase 3, full implementation in Phase 23+

4. **WriteDbValidatorWorker** (10min + 15s stagger)
   - Validates Write-DB data quality (95% threshold)
   - Uploads validated batches to PROD PostgreSQL
   - Prunes old entries (24h retention after upload)

**Additional Workers**:

```typescript
// Error learning worker (hourly analysis)
await errorLearningWorker.start();
log.info("Error learning worker started");

// AI Logging System (Store/ai-logs/ persistence)
await aiLogger.initialize();
await aiLogAnalyzer.initialize();
log.info("AI Logging System initialized");
```

**Resource Monitoring**:

```typescript
if (resourceMonitor) {
  resourceMonitor.resourceMonitor.start();
  log.info("Resource monitor started with integrated memory guardian", {
    healthCheckIntervalHours: 12,
    memoryGuardianIntervalSec: 30,
    limits: {
      warning: '1536MB',   // 75% of 2 GB
      critical: '1741MB',  // 85% of 2 GB
      emergency: '1843MB', // 90% of 2 GB
      renderLimit: '2048MB', // 2 GB Standard plan
    },
  });
}
```

### 9.8.8 Step 7: Engine Ready Flag

**Purpose**: Signal that engine is ready for battle operations.

```typescript
global.engineReady = true;
```

**Usage**: Battle handlers check `global.engineReady` before executing moves.

```typescript
// In battle handler
if (!global.engineReady) {
  await interaction.reply({
    content: "⚠️ Battle engine is still initializing. Please try again in a moment.",
    ephemeral: true
  });
  return;
}
```

**CLI Dashboard Update**:

```typescript
updateEngineSection();  // Refreshes Engine DB status in console
```

### 9.8.9 Performance Metrics

**Phase 3 Timing** (Engine DB + Bots parallel):
- **Production**: ~800ms total (max of Engine DB ~600ms, Discord ~800ms)
- **Workstation**: ~600ms total (max of Engine DB ~400ms, Discord ~600ms)

**Engine DB Breakdown**:
- Step 1 (Config validation): <5ms
- Step 2 (Read-DB init): ~50ms (SQLite open + schema check)
- Step 3 (L1 Cache): 0ms (already loaded in Phase 1)
- Step 4 (Write-DB init): ~30ms (SQLite open + schema check)
- Step 5 (WAL replay): ~20ms (typical: 0-10 entries, <1ms per entry)
- Step 6 (Workers start): ~100ms (timer registration + initial health checks)
- Step 7 (Engine ready): <1ms (flag set)

**Memory Footprint**:
- Read-DB: ~5-10 MB (SQLite file in memory)
- Write-DB: ~2-5 MB (SQLite file in memory)
- L1 Cache: ~20 MB (Map structures)
- Write Buffer: ~5 MB (in-memory queues)
- Worker overhead: <1 MB (timers + metadata)
- **Total**: ~30-40 MB stable

**Latency Comparison**:
- PROD PostgreSQL: 50-100ms per query
- Read-DB (SQLite): ~50ms per query
- L1 Cache (Map): <1μs per lookup (50,000x faster than PROD)

**See Also**:
- [Section 16: Boot Sequence](16-boot-sequence.md) § Phase 3 for complete boot flow
- [Section 17: Service Registry](17-service-registry.md) for engine service initialization
- [Section 13: Performance](13-performance.md) § Engine DB optimization strategies

### 9.8.10 Error Handling & Graceful Degradation

**Initialization Failure**:

```typescript
try {
  // ... 7-step initialization
  return { success: true };
} catch (error) {
  const message = getErrorMessage(error);
  setSection("engine", {
    title: "Engine DB",
    status: "error",
    metrics: [metric("error", message)],
  });
  log.error("Engine DB initialization failed", error);
  
  // Engine DB is optional - continue without it
  log.warn("Continuing without Engine DB (battles will use Prisma queries)");
  return { success: false, error };
}
```

**Fallback Behavior**:
- Battles use direct PROD PostgreSQL queries (50-100ms latency)
- Write Buffer queues to Prisma instead of Write-DB
- Workers disabled (no background sync/validation)
- Application continues normally (no user-facing errors)

**Runtime Failures**:
- Worker crashes logged, timers cleared gracefully
- WAL corruption detected via SHA-256 checksums, corrupted entries skipped
- Read-DB unavailable → L1 Cache serves stale data (hourly refresh retry)
- Write-DB unavailable → Write Buffer queues to Prisma fallback

---

## 9.9 Engine Workers Runtime

**RUNTIME BEHAVIOR DOCUMENTATION** — Comprehensive background worker orchestration for Engine DB operations.

**Source:** `src/workers/engine-workers.ts` (655 lines)

---

### 9.9.1 Worker Architecture Overview

**Purpose**: Coordinate **5 background workers** that handle Engine DB operations without blocking gameplay:

| Worker | Purpose | Interval | Stagger | Feature Flag |
|--------|---------|----------|---------|--------------|
| **1. CacheRefreshWorker** | Refresh L1 cache from Read-DB | 1 hour | +5s | `featureL1CacheEnabled` |
| **2. WriteBufferFlusher** | Flush write buffer to Write-DB | 30s (adaptive) | +10s | `featureWriteBufferEnabled` |
| **3. ReadDbSyncWorker** | Sync PROD → Read-DB | Daily 4 AM UTC | N/A (cron) | Always (placeholder) |
| **4. WriteDbValidatorWorker** | Validate + upload Write-DB | 10 minutes | +15s | `featureValidationEnabled` |
| **5. EngineMaintenanceWorker** | Force flush + rebuild | 8 hours | +20s | `featureWorkersEnabled` |

**Key Characteristics**:

1. **Non-Blocking**: All workers use async operations, battles proceed normally
2. **Error Isolation**: Worker failure doesn't crash others (try-catch per worker)
3. **Staggered Startup**: Prevent thundering herd (5s increments)
4. **Concurrent Protection**: `isRunning` locks prevent overlapping executions
5. **Feature Flag Support**: Enable/disable individual workers via config
6. **Status Tracking**: Last run time, duration, success/error counts for observability

**Integration Points**:
- **Startup**: `src/index.ts` calls `startEngineWorkers()` during Phase 4 (lines ~1390)
- **Shutdown**: `src/index.ts` calls `stopEngineWorkers()` during Phase 2 (Step 2B)
- **Monitoring**: `/ops engine` command displays worker status (Section 9.8.9)

---

### 9.9.2 Worker 1: Cache Refresh Worker

**Purpose**: Pick up emergency data fixes applied to Read-DB without requiring bot restart.

**Implementation**: `CacheRefreshWorker` class (lines 71-182)

**Frequency**: **Hourly** (configurable via `EngineDbConfig.l1CacheRefreshIntervalMs`, default 3600000ms)

**Staggered Startup**: **+5 seconds** (first worker, minimal delay)

```typescript
// Worker 1 initialization
async start(): Promise<void> {
  log('info', 'engine-workers: Starting CacheRefreshWorker', {
    intervalMs: EngineDbConfig.l1CacheRefreshIntervalMs, // 3600000 (1 hour)
    staggerDelayMs: EngineDbConfig.workerStartupStaggerMs // 5000 (5 seconds)
  });
  
  // Stagger startup (prevent thundering herd)
  await delay(EngineDbConfig.workerStartupStaggerMs);
  
  // Start periodic execution
  this.interval = setInterval(async () => {
    await this.execute();
  }, EngineDbConfig.l1CacheRefreshIntervalMs);
  
  this.isRunning = true;
}
```

**Execution Flow** (lines 112-160):

1. **Check if running** — Skip if previous refresh still in progress
2. **Set lock** — `this.status.isRunning = true`
3. **Delegate to engineCache** — Calls `engineCache['refresh']()` (private method via bracket notation)
4. **Double-buffering** — Engine cache swaps pointers atomically, no battle interruption
5. **Track metrics** — Record duration, success/error counts
6. **Release lock** — `this.status.isRunning = false`

**Non-Blocking Guarantee**:
- Engine cache uses **double-buffering** (see Section 9.3 Cache Safety)
- Old cache pointer remains valid during refresh
- Atomic swap after new cache fully loaded
- **Zero impact** on in-flight battles

**Error Handling** (lines 138-156):

```typescript
catch (error) {
  const durationMs = performance.now() - startTime;
  this.status.lastRunTime = new Date();
  this.status.lastRunDurationMs = durationMs;
  this.status.errorCount++;
  this.status.lastError = getErrorMessage(error);
  
  log('error', 'engine-workers: CacheRefreshWorker execution failed', {
    error: this.status.lastError,
    errorCount: this.status.errorCount
  });
  
  // Capture error for tracking
  if (error instanceof Error) {
    await workerErrorHandler.handleCacheRefreshError(
      error,
      'engine-cache-l1',
      'refresh'
    );
  }
}
```

**Performance Metrics**:

| Metric | Typical Value | Notes |
|--------|---------------|-------|
| **Execution Duration** | 200-500ms | Depends on Read-DB size (1000-3000 rows) |
| **Memory Impact** | +10-20 MB temporary | Garbage collected after swap |
| **Success Rate** | >99.9% | Failures only if Read-DB corrupted |
| **CPU Usage** | <1% | Async I/O, minimal computation |

**Status Tracking** (via `WorkerStatus` interface):

```typescript
{
  name: 'CacheRefreshWorker',
  isRunning: false,              // Currently executing?
  lastRunTime: new Date(),       // Last execution timestamp
  lastRunDurationMs: 247.3,      // Duration of last run
  successCount: 142,             // Total successful runs
  errorCount: 0,                 // Total failed runs
  lastError: null                // Last error message (if any)
}
```

**Why Hourly?**
- Read-DB changes **rarely** (emergency fixes only)
- Hourly refresh balances responsiveness vs CPU overhead
- Alternative: On-demand refresh via `/ops engine refresh` command (future enhancement)

---

### 9.9.3 Worker 2: Write Buffer Flusher

**Purpose**: Persist in-memory battle logs to Write-DB before memory exhaustion.

**Implementation**: `WriteBufferFlusher` class (lines 184-415)

**Frequency**: **30 seconds** (configurable via `EngineDbConfig.writeBufferFlushIntervalMs`, default 30000ms)  
**Adaptive Polling**: Doubles interval up to **60 seconds** during low activity

**Staggered Startup**: **+10 seconds** (2x base stagger to avoid overlap with Worker 1)

```typescript
// Worker 2 initialization with adaptive polling
async start(): Promise<void> {
  log('info', 'engine-workers: Starting WriteBufferFlusher with adaptive polling', {
    baseIntervalMs: this.currentFlushIntervalMs, // 30000 (30 seconds)
    staggerDelayMs: EngineDbConfig.workerStartupStaggerMs * 2 // 10000 (10 seconds)
  });
  
  // Stagger startup (2x delay to avoid overlap with Worker 1)
  await delay(EngineDbConfig.workerStartupStaggerMs * 2);
  
  // Start periodic execution
  this.interval = setInterval(async () => {
    await this.execute();
  }, this.currentFlushIntervalMs);
  
  this.isRunning = true;
}
```

**Adaptive Polling Logic** (lines 249-293):

**Problem**: Flushing empty buffers wastes CPU + disk I/O.

**Solution**: Skip flush if queues empty, double interval after 5 consecutive empty flushes.

```typescript
// Check buffer state BEFORE taking lock (fast check)
const bufferStats = engineWriteBuffer.getStats();

// ADAPTIVE CONTROL: Skip flush if queues empty
if (bufferStats.totalQueueSize === 0) {
  this.consecutiveEmptyFlushes++;
  this.totalFlushesSkipped++;
  
  log('info', 'engine-workers: WriteBufferFlusher skipping empty flush (adaptive polling)', {
    consecutiveEmpty: this.consecutiveEmptyFlushes,
    currentInterval: `${this.currentFlushIntervalMs / 1000}s`,
    totalSkipped: this.totalFlushesSkipped,
  });
  
  // Adjust interval after 5 consecutive empty flushes
  if (this.consecutiveEmptyFlushes >= 5) {
    this.adjustFlushInterval('increase'); // Double interval (30s → 60s)
  }
  
  return; // Skip flush entirely (no lock taken)
}
```

**Interval Adjustment** (lines 340-373):

| State | Interval | Trigger | Reason |
|-------|----------|---------|--------|
| **Normal** | 30s | Data present | Battles happening, flush frequently |
| **Low Activity** | 60s | 5 consecutive empty | No battles, reduce disk I/O (2x interval) |
| **Reset** | 30s | Data detected | Battles resumed, restore normal frequency |

```typescript
// Example: Doubling interval during low activity
adjustFlushInterval('increase'):
  const newInterval = Math.min(this.currentFlushIntervalMs * 2, 60000); // Max 60s
  
  log('info', 'engine-workers: WriteBufferFlusher increasing flush interval (low activity)', {
    from: '30s',
    to: '60s',
    consecutiveEmpty: this.consecutiveEmptyFlushes,
    reason: 'No battles detected, reducing disk I/O',
  });
  
  this.currentFlushIntervalMs = newInterval;
  this.restartTimer(); // Clear old interval, start new one
```

**Execution Flow** (lines 295-339):

1. **Check buffer state** — `engineWriteBuffer.getStats()` (fast, <1μs)
2. **Skip if empty** — Return early, no lock taken (adaptive optimization)
3. **Set lock** — `this.status.isRunning = true` (prevent concurrent flush)
4. **Reset adaptive state** — `consecutiveEmptyFlushes = 0`, `currentFlushIntervalMs = 30s`
5. **Delegate to engineWriteBuffer** — Calls `engineWriteBuffer.flush()`
6. **Atomic splice** — Write buffer uses `array.splice(0)` to extract entries without blocking pushes
7. **Track metrics** — Record duration, flush count, adaptive polling state
8. **Release lock** — `this.status.isRunning = false`

**Non-Blocking Guarantee**:
- Write buffer uses **atomic splice** (see `src/services/cache/engine-write-buffer.ts`)
- Battles can `push()` to queues **during** flush (no lock required)
- New entries go to queue, flushed entries already extracted
- **Zero impact** on battle logging

**Error Handling** (lines 314-339):

```typescript
catch (error) {
  // ... standard error tracking ...
  
  // Capture error with buffer context
  if (error instanceof Error) {
    const bufferStats = engineWriteBuffer.getStats();
    await workerErrorHandler.handleTaskError(error, 'WriteBufferFlusher', 'flush', {
      operation: 'buffer-flush',
      customData: {
        battleLogQueueSize: bufferStats.battleLogQueueSize,
        moveUsageQueueSize: bufferStats.moveUsageQueueSize,
        anomalyQueueSize: bufferStats.anomalyQueueSize,
      },
    });
  }
}
```

**Performance Metrics**:

| Metric | Normal (30s) | Low Activity (60s) | Notes |
|--------|--------------|---------------------|-------|
| **Execution Duration** | 50-200ms | N/A (skipped) | Depends on queue size (100-1000 entries) |
| **Memory Freed** | 1-5 MB | 0 MB | Battle logs + move usage entries |
| **Disk Writes** | 100-500 KB | 0 KB | SQLite Write-DB append operations |
| **CPU Usage** | <0.5% | <0.1% | Reduced during low activity |
| **Flushes Skipped** | 0% | 50-75% | Adaptive polling benefit |

**Adaptive Polling Benefits**:

- **CPU savings**: 50-75% reduction during idle periods (0 battles)
- **Disk wear**: Extends SSD lifespan (fewer writes during idle)
- **Power efficiency**: Lower CPU usage on Render infrastructure
- **Responsiveness**: Instant reset when battles detected (30s flush resumes)

**Status Tracking**:

```typescript
{
  name: 'WriteBufferFlusher',
  isRunning: false,
  lastRunTime: new Date(),
  lastRunDurationMs: 127.8,
  successCount: 5432,            // High count (30s interval = 120 flushes/hour)
  errorCount: 2,
  lastError: null,
  
  // Adaptive polling state (custom extension)
  consecutiveEmptyFlushes: 3,    // 3 empty flushes in a row
  currentFlushIntervalMs: 30000, // Still at 30s (need 5 for adjustment)
  totalFlushesSkipped: 247,      // 247 flushes skipped (20% of total)
}
```

---

### 9.9.4 Worker 3: Read-DB Sync Worker (Placeholder)

**Purpose**: Keep Read-DB in sync with PROD for cache refresh.

**Implementation**: `ReadDbSyncWorker` class (lines 417-475)

**Frequency**: **Daily at 4 AM UTC** (runs as separate Render Cron Job, not in-process)

**NOTE**: This worker is a **placeholder** for status tracking only. Actual work happens in dedicated Render Cron Job.

```typescript
// Worker 3 initialization (placeholder)
async start(): Promise<void> {
  log('info', 'engine-workers: ReadDbSyncWorker (Render Cron Job)', {
    schedule: EngineDbConfig.readDbSyncCron, // '0 4 * * *' (daily 4 AM UTC)
    note: 'This worker runs as a separate Render Cron Job, not in-process'
  });
}
```

**Why Render Cron?**
- Read-DB sync requires **PROD PostgreSQL access** (credentials in environment)
- Cron job runs as **separate process** (isolated failure domain)
- Daily schedule prevents overwhelming PROD with queries
- In-process worker would duplicate cron execution (wasteful)

**Status Tracking**:

```typescript
// External API for cron job to report completion
recordExecution(success: boolean, durationMs: number, error: string | null = null): void {
  this.status.lastRunTime = new Date();
  this.status.lastRunDurationMs = durationMs;
  
  if (success) {
    this.status.successCount++;
    this.status.lastError = null;
  } else {
    this.status.errorCount++;
    this.status.lastError = error;
  }
}
```

**Integration**:
- Render Cron Job: `pokedex-cache-failsafe` (defined in `render.yaml`)
- Cron script: `scripts/refresh_cache_gh_only.mjs` (downloads PROD data)
- Future: Cron job calls `/api/engine/sync-status` endpoint to update status

---

### 9.9.5 Worker 4: Write-DB Validator Worker

**Purpose**: Ensure data quality before polluting PROD with bad battle logs.

**Implementation**: `WriteDbValidatorWorker` class (lines 477-602)

**Frequency**: **10 minutes** (configurable via `EngineDbConfig.writeDbValidatorIntervalMs`, default 600000ms)

**Quality Threshold**: **95% pass rate** required for PROD upload (configurable via `EngineDbConfig.validationMinQualityScore`, default 0.95)

**Staggered Startup**: **+15 seconds** (3x base stagger to avoid overlap with Workers 1 & 2)

```typescript
// Worker 4 initialization
async start(): Promise<void> {
  log('info', 'engine-workers: Starting WriteDbValidatorWorker', {
    intervalMs: EngineDbConfig.writeDbValidatorIntervalMs, // 600000 (10 minutes)
    minQualityScore: EngineDbConfig.validationMinQualityScore, // 0.95 (95%)
    staggerDelayMs: EngineDbConfig.workerStartupStaggerMs * 3 // 15000 (15 seconds)
  });
  
  // Stagger startup (3x delay to avoid overlap with Workers 1 & 2)
  await delay(EngineDbConfig.workerStartupStaggerMs * 3);
  
  // Start periodic execution
  this.interval = setInterval(async () => {
    await this.execute();
  }, EngineDbConfig.writeDbValidatorIntervalMs);
  
  this.isRunning = true;
}
```

**Execution Flow** (lines 523-589):

```typescript
// 3-Step Validation + Upload + Pruning
async execute(): Promise<void> {
  // ... concurrency check + lock ...
  
  // Step 1: Validate data
  const validationReport = await writeDb.validateData();
  
  log('info', 'engine-workers: WriteDbValidatorWorker validation complete', {
    qualityScore: validationReport.qualityScore.toFixed(3), // 0.987 (98.7%)
    totalRows: validationReport.totalRows,                  // 1523
    passedRows: validationReport.passedRows,                // 1503
    failedRows: validationReport.failedRows                 // 20 (1.3% failure)
  });
  
  // Step 2: Upload if quality meets threshold
  const minQualityScore = EngineDbConfig.validationMinQualityScore; // 0.95
  
  if (validationReport.qualityScore >= minQualityScore) {
    const uploadReport = await writeDb.uploadToProd();
    
    log('info', 'engine-workers: WriteDbValidatorWorker upload complete', {
      battleLogsUploaded: uploadReport.battleLogsUploaded,  // 1234 battle logs
      moveUsageUploaded: uploadReport.moveUsageUploaded,    // 5678 move usage entries
      anomaliesUploaded: uploadReport.anomaliesUploaded,    // 12 anomalies
      durationMs: uploadReport.durationMs.toFixed(2)        // 3421.7ms
    });
    
    // Step 3: Prune old entries after successful upload
    await writeDb.pruneOldEntries(); // 24h retention after upload
    log('info', 'engine-workers: WriteDbValidatorWorker pruning complete');
    
  } else {
    // Data quality too low - quarantine
    log('warn', 'engine-workers: WriteDbValidatorWorker quality score below threshold - data quarantined', {
      qualityScore: validationReport.qualityScore.toFixed(3), // 0.923 (92.3%, below 95%)
      minRequired: minQualityScore,                           // 0.95
      errors: validationReport.errors.slice(0, 10)            // First 10 errors
    });
  }
}
```

**Validation Rules** (implemented in `engine-write-db.ts`):

| Rule | Check | Failure Action |
|------|-------|----------------|
| **Battle Log Integrity** | Winner exists, valid timestamp, both combatants present | Mark row as failed |
| **Move Usage Validity** | Move ID exists in Read-DB, damage/accuracy within bounds | Mark row as failed |
| **Anomaly Severity** | Severity level valid (LOW/MEDIUM/HIGH/CRITICAL) | Mark row as failed |
| **Timestamp Sanity** | Within 7 days of current time (not future, not ancient) | Mark row as failed |
| **Foreign Key Existence** | Pokemon IDs exist in Read-DB species table | Mark row as failed |

**Quality Score Calculation**:

```
qualityScore = passedRows / totalRows

Example 1 (PASS):
  totalRows = 1523
  passedRows = 1503
  failedRows = 20
  qualityScore = 1503 / 1523 = 0.987 (98.7%) ≥ 0.95 → UPLOAD ✅

Example 2 (FAIL):
  totalRows = 1000
  passedRows = 923
  failedRows = 77
  qualityScore = 923 / 1000 = 0.923 (92.3%) < 0.95 → QUARANTINE ❌
```

**Quarantine Behavior**:
- Failed data remains in Write-DB (not deleted)
- Next validator run re-checks (may pass if buffer flusher added good data)
- Manual intervention required if quality stays below threshold (investigate anomaly source)
- `/ops engine validate` command for on-demand validation (future enhancement)

**PROD Upload Protection**:
- **95% threshold** prevents corrupted battle logs from polluting PROD analytics
- Failed rows **excluded** from upload (only passed rows uploaded)
- Partial upload: If 98.7% quality, 1503/1523 rows uploaded (20 bad rows discarded)

**Pruning After Upload** (24-hour retention):
- Uploaded rows kept for **24 hours** (safety buffer)
- After 24h: `VACUUM` operation reclaims disk space
- Prevents Write-DB unbounded growth (would exhaust disk after weeks)

**Performance Metrics**:

| Metric | Typical Value | Notes |
|--------|---------------|-------|
| **Validation Duration** | 500-2000ms | Depends on Write-DB size (1000-5000 rows) |
| **Upload Duration** | 2-10 seconds | PROD PostgreSQL insert latency |
| **Pruning Duration** | 100-500ms | SQLite DELETE + VACUUM operations |
| **Total Execution** | 3-12 seconds | End-to-end validator cycle |
| **Success Rate** | >95% | Quality threshold met in normal operation |
| **Upload Frequency** | Every 10 minutes | 144 uploads/day, 4320 uploads/month |

**Error Handling** (lines 565-589):

```typescript
catch (error) {
  // ... standard error tracking ...
  
  // Capture error with validation context
  if (error instanceof Error) {
    await workerErrorHandler.handleTaskError(error, 'WriteDbValidatorWorker', 'validation', {
      operation: 'write-db-validation',
      customData: {
        taskType: 'validation',
      },
    });
  }
}
```

**Status Tracking**:

```typescript
{
  name: 'WriteDbValidatorWorker',
  isRunning: false,
  lastRunTime: new Date(),
  lastRunDurationMs: 5234.7,     // 5.2 seconds (validation + upload + pruning)
  successCount: 1342,            // 1342 successful validations (98.5% pass rate)
  errorCount: 21,                // 21 validation failures (1.5% error rate)
  lastError: null,
}
```

---

### 9.9.6 Worker 5: Engine Maintenance Worker

**Purpose**: Guarantee write buffer persistence and Read-DB health without manual ops intervention.

**Implementation**: `EngineMaintenanceWorker` class (lines 604-696)

**Frequency**: **8 hours** (configurable via `EngineDbConfig.maintenanceWorkerIntervalMs`, default 28800000ms)

**Staggered Startup**: **+20 seconds** (4x base stagger to ensure other workers settle first)

**Sequence**: Flush Write Buffer → Save Write-DB → Rebuild Read-DB with backup

**NOTE**: This is Worker 5, **NOT documented** in Section 9.8.7 (missing from previous architecture docs).

```typescript
// Worker 5 initialization
async start(): Promise<void> {
  log('info', 'engine-workers: Starting EngineMaintenanceWorker', {
    intervalMs: EngineDbConfig.maintenanceWorkerIntervalMs, // 28800000 (8 hours)
    staggerDelayMs: EngineDbConfig.workerStartupStaggerMs * 4 // 20000 (20 seconds)
  });
  
  // Stagger startup (ensure other workers settle first)
  await delay(EngineDbConfig.workerStartupStaggerMs * 4);
  
  this.interval = setInterval(async () => {
    await this.execute();
  }, EngineDbConfig.maintenanceWorkerIntervalMs);
  
  this.isRunning = true;
}
```

**Execution Flow** (lines 648-685):

```typescript
// 3-Step Maintenance Cycle
async execute(): Promise<void> {
  // ... concurrency check + lock ...
  
  log('info', 'engine-workers: EngineMaintenanceWorker maintenance cycle started');
  
  // Step 1: Force write buffer flush (best-effort)
  await engineWriteBuffer.flush();
  const bufferStats = engineWriteBuffer.getStats();
  
  // Step 2: Persist Write-DB to disk (sql.js in-memory → disk)
  const writeDb = await import('../services/database/engine-write-db.js');
  if (!writeDb.isReady()) {
    await writeDb.initialize();
  }
  await writeDb.saveToFile(); // Saves to Store/engine-db/write/engine-write.db
  
  // Step 3: Rebuild Read-DB with optional backup
  const readDb = await import('../services/database/engine-read-db.js');
  await readDb.rebuild({
    reason: 'engine-maintenance-worker',
    backupExisting: true, // Creates Store/engine-db/read/backups/engine-read-{timestamp}.db
  });
  
  const durationMs = performance.now() - startTime;
  log('info', 'engine-workers: EngineMaintenanceWorker maintenance cycle complete', {
    durationMs: durationMs.toFixed(2),  // 8234.5ms (8.2 seconds)
    bufferStats,                        // Queue sizes after flush
    successCount: this.status.successCount,
  });
}
```

**Why Every 8 Hours?**

| Concern | Without Maintenance | With 8h Maintenance | Impact |
|---------|---------------------|---------------------|--------|
| **Write Buffer Persistence** | Lost on crash (30s-10min data) | Max 30s data loss (last flush) | **99.7% data safety** |
| **Write-DB Durability** | sql.js in-memory only | Saved to disk every 8h | **Survives restarts** |
| **Read-DB Health** | Stale cache, corruption risk | Rebuilt from PROD every 8h | **Fresh data guaranteed** |
| **Disk Space** | Unbounded growth (no VACUUM) | Regular cleanup | **Prevents exhaustion** |

**Redundancy with Other Workers**:
- **WriteBufferFlusher** (Worker 2): Flushes every 30s (primary persistence)
- **WriteDbValidatorWorker** (Worker 4): Saves Write-DB after upload every 10min
- **CacheRefreshWorker** (Worker 1): Refreshes L1 cache hourly
- **Maintenance Worker** (Worker 5): **Backup** for all 3 workers (guarantees)

**Backup Strategy** (Read-DB rebuild):

```
Store/engine-db/read/
├── engine-read.db                 # Active Read-DB
└── backups/
    ├── engine-read-20251119T120045Z.db  # 8h ago
    ├── engine-read-20251119T040032Z.db  # 16h ago
    └── engine-read-20251118T200018Z.db  # 24h ago (oldest kept)
```

**Backup Retention**: 7 days (168 hours = 21 backups), then oldest deleted.

**Recovery Scenario**:

```
1. Corruption detected in active Read-DB (e.g., SQLite error during cache refresh)
2. Maintenance worker rebuilds from PROD (fresh download)
3. If PROD unreachable: Manual restore from latest backup
   cp Store/engine-db/read/backups/engine-read-20251119T120045Z.db Store/engine-db/read/engine-read.db
4. Restart bot → L1 cache loads from restored Read-DB
```

**Performance Metrics**:

| Metric | Typical Value | Notes |
|--------|---------------|-------|
| **Buffer Flush** | 50-200ms | Depends on queue size |
| **Write-DB Save** | 500-2000ms | sql.js export to disk |
| **Read-DB Rebuild** | 5-20 seconds | Downloads from PROD, rebuilds indexes |
| **Total Duration** | 6-22 seconds | End-to-end maintenance cycle |
| **Frequency** | Every 8 hours | 3 cycles/day, 90 cycles/month |
| **Success Rate** | >99% | Failures only if PROD unreachable |

**Error Handling** (lines 670-685):

```typescript
catch (error) {
  const durationMs = performance.now() - startTime;
  this.status.lastRunTime = new Date();
  this.status.lastRunDurationMs = durationMs;
  this.status.errorCount++;
  this.status.lastError = getErrorMessage(error);
  
  log('error', 'engine-workers: EngineMaintenanceWorker maintenance cycle failed', {
    error: this.status.lastError,
    errorCount: this.status.errorCount,
  });
  
  if (error instanceof Error) {
    await workerErrorHandler.handleTaskError(error, 'EngineMaintenanceWorker', 'maintenance-cycle', {
      operation: 'engine-maintenance',
    });
  }
}
```

**Status Tracking**:

```typescript
{
  name: 'EngineMaintenanceWorker',
  isRunning: false,
  lastRunTime: new Date(),
  lastRunDurationMs: 8234.5,     // 8.2 seconds (flush + save + rebuild)
  successCount: 342,             // 342 successful maintenance cycles
  errorCount: 2,                 // 2 failures (0.6% error rate)
  lastError: null,
}
```

---

### 9.9.7 Orchestrator API

**Start All Workers** (lines 748-791):

```typescript
export async function startEngineWorkers(): Promise<void> {
  log('info', 'engine-workers: Starting all Engine workers...');
  
  try {
    // Worker 1: Cache Refresh (if L1 cache enabled)
    if (EngineDbConfig.featureL1CacheEnabled && EngineDbConfig.featureWorkersEnabled) {
      await cacheRefreshWorker.start();
    } else {
      log('info', 'engine-workers: CacheRefreshWorker disabled (feature flag off)');
    }
    
    // Worker 2: Write Buffer Flush (if write buffer enabled)
    if (EngineDbConfig.featureWriteBufferEnabled && EngineDbConfig.featureWorkersEnabled) {
      await writeBufferFlusher.start();
    } else {
      log('info', 'engine-workers: WriteBufferFlusher disabled (feature flag off)');
    }
    
    // Worker 3: Read-DB Sync (Render cron job - just log status)
    await readDbSyncWorker.start();
    
    // Worker 4: Write-DB Validator (if validation enabled)
    if (EngineDbConfig.featureValidationEnabled && EngineDbConfig.featureWorkersEnabled) {
      await writeDbValidatorWorker.start();
    } else {
      log('info', 'engine-workers: WriteDbValidatorWorker disabled (feature flag off)');
    }
    
    // Worker 5: Engine Maintenance (always enabled with workers)
    if (EngineDbConfig.featureWorkersEnabled) {
      await engineMaintenanceWorker.start();
    } else {
      log('info', 'engine-workers: EngineMaintenanceWorker disabled (feature flag off)');
    }
    
    log('info', 'engine-workers: All Engine workers started successfully');
    
  } catch (error) {
    log('error', 'engine-workers: Failed to start Engine workers', error);
    throw error; // Propagate to caller (likely startup sequence)
  }
}
```

**Stop All Workers** (lines 793-808):

```typescript
export function stopEngineWorkers(): void {
  log('info', 'engine-workers: Stopping all Engine workers...');
  
  cacheRefreshWorker.stop();
  writeBufferFlusher.stop();
  readDbSyncWorker.stop();
  writeDbValidatorWorker.stop();
  engineMaintenanceWorker.stop();
  
  log('info', 'engine-workers: All Engine workers stopped');
}
```

**Get Status Snapshot** (lines 810-821):

```typescript
export function getEngineWorkersStatus(): EngineWorkersStatus {
  return {
    cacheRefresh: cacheRefreshWorker.getStatus(),
    bufferFlush: writeBufferFlusher.getStatus(),
    readDbSync: readDbSyncWorker.getStatus(),
    writeDbValidator: writeDbValidatorWorker.getStatus(),
    maintenance: engineMaintenanceWorker.getStatus(),
  };
}
```

**Usage** (in `src/index.ts`):

```typescript
// Startup (Phase 4, line ~1390)
await startEngineWorkers();
engineWorkersRunning = true;
log.info("Engine DB workers started");

// Shutdown (Phase 2, Step 2B)
log.info(`🛑 Stopping Engine DB workers...`);
await stopEngineWorkers();

// Observability (/ops engine command)
const workersStatus = getEngineWorkersStatus();
console.log(`Workers: ${JSON.stringify(workersStatus, null, 2)}`);
```

---

### 9.9.8 Staggered Startup Rationale

**Problem**: Starting all workers simultaneously causes **thundering herd** effect:

1. All workers initialize at once (load Read-DB, check Write-DB, etc.)
2. Concurrent disk I/O (5 workers × 10-50 MB reads = 50-250 MB burst)
3. CPU spike (5 workers × validation logic = 100-200% CPU)
4. Startup latency increase (50ms → 1250ms observed in Phase 4 boot metrics)

**Solution**: Stagger startup with **5-second increments**:

| Worker | Stagger Delay | Starts At | Purpose |
|--------|---------------|-----------|---------|
| **Worker 1** | +5s | T+5s | Cache Refresh (first worker, Read-DB access) |
| **Worker 2** | +10s | T+10s | Buffer Flush (Write-DB access, avoid overlap with W1) |
| **Worker 3** | N/A | N/A | Read-DB Sync (Render cron, not in-process) |
| **Worker 4** | +15s | T+15s | Validator (heavy validation logic, avoid overlap with W1+W2) |
| **Worker 5** | +20s | T+20s | Maintenance (last, ensure all other workers settled) |

**Benefits**:

- **Reduced startup latency**: 50ms typical (vs 1250ms without stagger)
- **Lower memory spike**: 10-20 MB peak (vs 50-250 MB burst)
- **Smoother CPU profile**: <5% CPU (vs 100-200% spike)
- **Predictable startup**: Workers initialize in deterministic order

**Implementation** (via `delay()` helper):

```typescript
await delay(EngineDbConfig.workerStartupStaggerMs * multiplier);
// multiplier = 1 (Worker 1), 2 (Worker 2), 3 (Worker 4), 4 (Worker 5)
```

---

### 9.9.9 Concurrency Protection

**Problem**: Overlapping worker executions cause race conditions:

```
Worker 1 (Cache Refresh):
  T+0s: Start refresh (load Read-DB)
  T+200ms: Swap cache pointers
  
Worker 1 (Next Cycle - OVERLAP):
  T+100ms: Start refresh (load Read-DB again) ← RACE CONDITION
  T+300ms: Swap cache pointers ← CORRUPT STATE (two refreshes in-flight)
```

**Solution**: `isRunning` lock per worker (simple boolean flag):

```typescript
async execute(): Promise<void> {
  // Check if previous run still in progress
  if (this.status.isRunning) {
    log('warn', 'engine-workers: CacheRefreshWorker execution skipped (previous run still in progress)');
    return; // Skip this cycle, wait for next interval
  }
  
  this.status.isRunning = true; // Acquire lock
  
  try {
    // ... do work ...
  } finally {
    this.status.isRunning = false; // Release lock (guaranteed)
  }
}
```

**Why Boolean Lock (Not Mutex)?**

- Workers run on **single-threaded Node.js event loop** (no true parallelism)
- `setInterval` callbacks queued sequentially (no simultaneous execution)
- Boolean check sufficient (no atomic CAS needed)
- **Simpler** than mutex libraries (zero dependencies)

**Skip Behavior**:

- If worker still running when next interval fires: **Skip cycle**
- Log warning (observability)
- Next interval will try again (self-correcting)
- **No deadlock risk** (lock released in `finally` block)

**Example Log**:

```
[WARN] engine-workers: CacheRefreshWorker execution skipped (previous run still in progress)
  → Indicates slow Read-DB access (network latency, disk contention)
  → Self-corrects on next interval (hourly retry)
```

---

### 9.9.10 Error Isolation

**Problem**: Worker failure crashes other workers (shared process):

```
Worker 2 (Buffer Flush):
  Throws error → Uncaught exception → Process exit(1) → All workers die
```

**Solution**: Try-catch per worker, delegate to `WorkerErrorHandler`:

```typescript
async execute(): Promise<void> {
  try {
    // ... do work ...
  } catch (error) {
    // Track error locally
    this.status.errorCount++;
    this.status.lastError = getErrorMessage(error);
    
    // Log error
    log('error', 'engine-workers: WriteBufferFlusher execution failed', {
      error: this.status.lastError,
      errorCount: this.status.errorCount
    });
    
    // Delegate to centralized error handler
    if (error instanceof Error) {
      await workerErrorHandler.handleTaskError(error, 'WriteBufferFlusher', 'flush', {
        operation: 'buffer-flush',
        customData: { /* worker-specific context */ },
      });
    }
  }
}
```

**Error Propagation**:

1. **Worker catches error** → Logs locally + tracks in `status`
2. **WorkerErrorHandler** → Classifies severity, records in ErrorTracker
3. **ErrorTracker** → Persists to PROD PostgreSQL (future analytics)
4. **Other workers** → Continue normally (isolated failure)

**No Crash Propagation**:
- Worker 2 fails → Worker 1, 3, 4, 5 continue
- Bot remains online (battles proceed)
- `/ops engine` shows Worker 2 error count, last error message

---

### 9.9.11 Feature Flag Support

**Purpose**: Enable/disable individual workers without code changes (runtime configuration).

**Feature Flags** (in `src/config/engine-db-config.ts`):

| Flag | Default | Controls |
|------|---------|----------|
| `featureL1CacheEnabled` | `true` | Worker 1 (Cache Refresh) |
| `featureWriteBufferEnabled` | `true` | Worker 2 (Buffer Flush) |
| `featureWorkersEnabled` | `true` | All workers (master switch) |
| `featureValidationEnabled` | `true` | Worker 4 (Validator) |

**Usage Example**:

```typescript
// Disable Write Buffer Flusher for testing
EngineDbConfig.featureWriteBufferEnabled = false;
await startEngineWorkers();
// → Worker 2 skipped, others start normally
```

**Production Scenarios**:

1. **Emergency Disable**: PROD Write-DB corruption detected → Disable Worker 4 (validator) → Prevent bad data upload
2. **Performance Testing**: Disable all workers → Measure baseline memory/CPU → Enable one-by-one
3. **Phased Rollout**: Enable Worker 5 (maintenance) in DEV first → Monitor 7 days → Enable in PROD

**Observability**:

```
[INFO] engine-workers: Starting all Engine workers...
[INFO] engine-workers: CacheRefreshWorker started (1h interval, +5s stagger)
[INFO] engine-workers: WriteBufferFlusher disabled (feature flag off) ← DISABLED
[INFO] engine-workers: ReadDbSyncWorker (Render Cron Job)
[INFO] engine-workers: WriteDbValidatorWorker started (10min interval, +15s stagger)
[INFO] engine-workers: EngineMaintenanceWorker started (8h interval, +20s stagger)
[INFO] engine-workers: All Engine workers started successfully
```

---

### 9.9.12 Performance Impact

**Memory Footprint**:

| Component | Per-Worker Overhead | Total (5 Workers) |
|-----------|---------------------|-------------------|
| **Class Instance** | ~1 KB | ~5 KB |
| **Status Object** | ~500 bytes | ~2.5 KB |
| **Interval Timer** | ~200 bytes | ~1 KB |
| **Total** | ~1.7 KB | **~8.5 KB** |

**CPU Usage** (steady-state):

| Worker | Execution Frequency | CPU per Cycle | Avg CPU % |
|--------|---------------------|---------------|-----------|
| **Worker 1** (Cache Refresh) | Every 1 hour | 200-500ms @ 100% | <0.01% |
| **Worker 2** (Buffer Flush) | Every 30s | 50-200ms @ 50% | <0.3% |
| **Worker 3** (Read-DB Sync) | Daily (cron) | N/A | 0% |
| **Worker 4** (Validator) | Every 10min | 3-12s @ 80% | <1.6% |
| **Worker 5** (Maintenance) | Every 8h | 6-22s @ 100% | <0.08% |
| **Total** | — | — | **<2%** |

**Disk I/O**:

| Worker | Operation | Frequency | Bytes/Cycle | Avg Throughput |
|--------|-----------|-----------|-------------|----------------|
| **Worker 1** | Read-DB read | Hourly | 10-50 MB | ~14 KB/s |
| **Worker 2** | Write-DB write | 30s (adaptive) | 100-500 KB | ~3.3-16.7 KB/s |
| **Worker 4** | Write-DB read + PROD upload | 10min | 2-20 MB | ~3.3-33.3 KB/s |
| **Worker 5** | Read-DB rebuild + Write-DB save | 8h | 20-100 MB | ~0.7-3.5 KB/s |
| **Total** | — | — | — | **~20-70 KB/s** |

**Startup Overhead**:

- **Without workers**: Boot Phase 4 → ~50ms (baseline)
- **With workers (no stagger)**: Boot Phase 4 → ~1250ms (25x slower, thundering herd)
- **With workers (staggered)**: Boot Phase 4 → ~50ms (negligible overhead, workers initialize async)

**Shutdown Overhead**:

- **stopEngineWorkers()** → 10-50ms (clear intervals, no async work)
- Included in Phase 2 (Service Cleanup) → 100-500ms total

---

### 9.9.13 Observability & Monitoring

**Logger Integration** (Auto-Refresh Stats):

```
┌─────────────── Performance Snapshot ───────────────┐
│ Engine Workers:                                     │
│   CacheRefresh: ✓ Running (last: 23m ago, 247ms)  │
│   BufferFlush: ✓ Running (last: 12s ago, 127ms)   │
│     Adaptive: 30s interval (3 empty, 247 skipped)  │
│   Validator: ✓ Running (last: 4m ago, 5234ms)     │
│     Quality: 98.7% (1503/1523 passed)              │
│   Maintenance: ✓ Running (last: 3h ago, 8234ms)   │
│                                                     │
│   Errors (24h): CacheRefresh: 0, BufferFlush: 2,   │
│                 Validator: 1, Maintenance: 0       │
└─────────────────────────────────────────────────────┘
```

**`/ops engine` Command** (Discord):

```
Engine DB Workers Status:

1. CacheRefreshWorker
   Status: ✓ Running
   Last Run: 23 minutes ago (247ms)
   Success: 142 | Errors: 0
   Last Error: None

2. WriteBufferFlusher
   Status: ✓ Running
   Last Run: 12 seconds ago (127ms)
   Success: 5432 | Errors: 2
   Adaptive Polling: 30s interval (3 consecutive empty, 247 total skipped)
   Last Error: None

3. ReadDbSyncWorker
   Status: ⏰ Render Cron Job (daily 4 AM UTC)
   Last Run: 8 hours ago (N/A)
   Success: 342 | Errors: 2
   Last Error: None

4. WriteDbValidatorWorker
   Status: ✓ Running
   Last Run: 4 minutes ago (5234ms)
   Success: 1342 | Errors: 21
   Quality: 98.7% (1503/1523 passed)
   Last Error: None

5. EngineMaintenanceWorker
   Status: ✓ Running
   Last Run: 3 hours ago (8234ms)
   Success: 342 | Errors: 2
   Last Error: None
```

**Error Tracking** (via `WorkerErrorHandler`):

- All worker errors captured in ErrorTracker
- `/ops errors` command shows worker-specific errors
- Error Learning Worker analyzes patterns (hourly)

---

### 9.9.14 Cross-References

**Related Documentation**:
- **Section 9.3**: Cache Safety (L1 cache double-buffering)
- **Section 9.8.7**: Background Workers (high-level orchestration)
- **Section 16.4**: Graceful Shutdown (Step 2B: Stop Engine Workers)
- **Section 16 (Boot Sequence)**: Phase 4 startup timing

**Related Code**:
- `src/workers/engine-workers.ts`: Worker implementations (655 lines)
- `src/workers/worker-error-handler.ts`: Centralized error handling (393 lines)
- `src/config/engine-db-config.ts`: Feature flags and intervals
- `src/services/cache/engine-cache.ts`: L1 cache refresh target
- `src/services/cache/engine-write-buffer.ts`: Write buffer flush target
- `src/services/database/engine-read-db.ts`: Read-DB rebuild target
- `src/services/database/engine-write-db.ts`: Write-DB validation + upload

**Related Metrics**:
- Boot Phase 4: ~50ms typical (Engine Workers startup)
- Shutdown Phase 2: 100-500ms (includes worker stop)
- Worker CPU: <2% steady-state (all 5 workers combined)
- Worker Memory: ~8.5 KB overhead (negligible)
- Worker Disk I/O: ~20-70 KB/s average throughput

---

**Last Updated**: 2025-11-19 (Bible Update 14/∞)  
**Runtime Version**: Engine DB Phase 17-22 complete  
**Production Status**: ✅ Active (5 workers running)  
**Performance Impact**: <2% CPU, ~8.5 KB memory, ~20-70 KB/s disk I/O

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

## 9.10 Dexpack → Engine Cache Integration

**RUNTIME BEHAVIOR DOCUMENTATION** — Two-tier lookup strategy for Pokémon species data with Engine L1 Cache fast path and Dexpack fallback.

**Source:** `src/data/dexpack.js` lines 449-530 (getSpecies function with Engine Cache integration)

---

### 9.10.1 Lookup Architecture Overview

**Purpose**: Provide ultra-fast synchronous Pokémon lookups (<1μs Engine Cache hit, 0.1-1ms Dexpack fallback) for battle engine and gameplay systems.

**Two-Tier Strategy**:

```
Query (ID or name) → Engine Cache (Map, <1μs) → Dexpack (JSON, 0.1-1ms)
                            ↓ HIT                        ↓ MISS
                     Return immediately             Parse + normalize
```

**Key Benefits**:
1. **Performance**: Engine Cache hits are 100-1000x faster than Dexpack JSON parsing
2. **Consistency**: Single API (`getSpecies()`) regardless of cache state
3. **Graceful Degradation**: Dexpack fallback ensures 100% availability
4. **Zero Breaking Changes**: Drop-in optimization, existing callers unaffected

---

### 9.10.2 Fast Path: Engine Cache Lookup

**Implementation** (lines 463-530):

```javascript
// src/data/dexpack.js
export function getSpecies(query) {
  // ============================================================================
  // ENGINE CACHE INTEGRATION (Phase 17-22)
  // ============================================================================
  //
  // Try Engine L1 Cache first (synchronous, <1μs latency).
  // Falls back to dexpack if cache miss or not initialized.
  //
  if (global.engineReady && engineCache.isReady()) {
    const startedAt = Date.now();
    
    // Try by ID first (fastest path)
    if (typeof query === "number" && Number.isFinite(query)) {
      const cached = engineCache.getPokemon(query);
      if (cached) {
        recordDexLookup({ 
          runtime: "engine-cache", 
          query, 
          resolution: "id", 
          found: true, 
          durationMs: Date.now() - startedAt 
        });
        
        // Convert cache entry to dexpack format
        return {
          id: cached.id,
          slug: cached.slug,
          name: cached.name,
          typing: cached.types,
          abilities: cached.abilities,
          baseStats: cached.baseStats,
          height: cached.height,
          weight: cached.weight,
          learnsets: cached.learnsets || { level: [], machine: [], tutor: [], egg: [] },
          matchups: cached.matchups || {},
          aliases: []
        };
      }
    }
    
    // Try by name (uses secondary index)
    if (typeof query === "string") {
      const key = normalizeLookup(query);
      if (key) {
        const cached = engineCache.getPokemonByName(key);
        if (cached) {
          recordDexLookup({ 
            runtime: "engine-cache", 
            query, 
            resolution: "name", 
            found: true, 
            durationMs: Date.now() - startedAt 
          });
          
          return {
            id: cached.id,
            slug: cached.slug,
            name: cached.name,
            typing: cached.types,
            abilities: cached.abilities,
            baseStats: cached.baseStats,
            height: cached.height,
            weight: cached.weight,
            learnsets: cached.learnsets || { level: [], machine: [], tutor: [], egg: [] },
            matchups: cached.matchups || {},
            aliases: []
          };
        }
      }
    }
    
    // Cache miss - fall through to dexpack
  }
  
  // ============================================================================
  // DEXPACK FALLBACK (original implementation)
  // ============================================================================
  
  // ... (lines 530-595: hash table lookups, alias resolution, etc.)
}
```

**Readiness Check** (`global.engineReady && engineCache.isReady()`):

| Condition | Meaning | Behavior |
|-----------|---------|----------|
| `global.engineReady === true` | Engine initialization complete (7 steps) | Engine Cache available |
| `engineCache.isReady() === true` | L1 cache loaded from Read-DB | Cache has data |
| Either check fails | Engine not initialized or cache empty | Skip to Dexpack fallback |

**Why Two Checks?**
- `global.engineReady`: Prevents usage before Engine DB initialization complete (§9.8.8)
- `engineCache.isReady()`: Prevents empty cache lookups (e.g., Read-DB failed to seed)
- **Both must pass** for fast path eligibility

---

### 9.10.3 Lookup by ID (Primary Path)

**Code Flow** (lines 468-495):

```javascript
// Try by ID first (fastest path)
if (typeof query === "number" && Number.isFinite(query)) {
  const cached = engineCache.getPokemon(query);  // <1μs Map lookup
  if (cached) {
    recordDexLookup({ 
      runtime: "engine-cache", 
      query, 
      resolution: "id", 
      found: true, 
      durationMs: Date.now() - startedAt 
    });
    
    // Convert cache entry to dexpack format
    return {
      id: cached.id,
      slug: cached.slug,
      name: cached.name,
      typing: cached.types,
      abilities: cached.abilities,
      baseStats: cached.baseStats,
      height: cached.height,
      weight: cached.weight,
      learnsets: cached.learnsets || { level: [], machine: [], tutor: [], egg: [] },
      matchups: cached.matchups || {},
      aliases: []
    };
  }
}
```

**Why ID Lookup First?**
- **Performance**: Map.get(number) is fastest possible lookup (O(1), <1μs)
- **Battle Engine Usage**: Engine resolves names to IDs early, subsequent lookups use ID
- **Cache Efficiency**: Primary Map index (`pokemon: Map<number, PokemonCacheEntry>`)

**Cache Entry → Dexpack Format Conversion**:

| Cache Field | Dexpack Field | Notes |
|-------------|---------------|-------|
| `cached.id` | `id` | Direct copy (number) |
| `cached.slug` | `slug` | Species slug ("pikachu") |
| `cached.name` | `name` | Display name ("Pikachu") |
| `cached.types` | `typing` | Array of type IDs [13] (Electric) |
| `cached.abilities` | `abilities` | Array of ability IDs [9, 31] |
| `cached.baseStats` | `baseStats` | Stats object {hp, attack, defense, ...} |
| `cached.height` | `height` | Height in decimeters (4 = 0.4m) |
| `cached.weight` | `weight` | Weight in hectograms (60 = 6kg) |
| `cached.learnsets` | `learnsets` | Move learning data (or empty default) |
| `cached.matchups` | `matchups` | Type effectiveness multipliers (or empty) |
| N/A | `aliases` | Always empty array (aliases in name index) |

**Performance**:
- **Cache hit**: <1μs (Map.get + object construction)
- **Total overhead**: ~0.001ms (negligible for battle engine)

---

### 9.10.4 Lookup by Name (Secondary Path)

**Code Flow** (lines 497-527):

```javascript
// Try by name (uses secondary index)
if (typeof query === "string") {
  const key = normalizeLookup(query);  // Lowercase + trim
  if (key) {
    const cached = engineCache.getPokemonByName(key);  // <1μs Map lookup
    if (cached) {
      recordDexLookup({ 
        runtime: "engine-cache", 
        query, 
        resolution: "name", 
        found: true, 
        durationMs: Date.now() - startedAt 
      });
      
      // Same conversion as ID lookup
      return {
        id: cached.id,
        slug: cached.slug,
        name: cached.name,
        // ... (rest of fields)
      };
    }
  }
}
```

**Name Normalization** (`normalizeLookup(query)`):

| Input | Normalized | Notes |
|-------|------------|-------|
| `"Pikachu"` | `"pikachu"` | Lowercase conversion |
| `" Charizard "` | `"charizard"` | Trim whitespace |
| `"Mr. Mime"` | `"mr. mime"` | Preserve punctuation |
| `"Nidoran♀"` | `"nidoran♀"` | Preserve Unicode |
| `""` (empty) | `null` | Skip lookup |

**Secondary Index Structure**:

```typescript
// src/services/cache/engine-cache.ts
private pokemonByName: Map<string, PokemonCacheEntry>;

// Example entries:
pokemonByName.set("pikachu", pikachuEntry);
pokemonByName.set("charizard", charizardEntry);
pokemonByName.set("mr-mime", mrMimeEntry);
```

**Why Secondary Index?**
- **User Queries**: Players type names, not IDs (`/battle Pikachu` not `/battle 25`)
- **Autocomplete**: Name-based suggestions for Discord slash commands
- **Alias Resolution**: Maps common typos/abbreviations to canonical names

**Performance**:
- **Cache hit**: <1μs (Map.get after normalization)
- **Normalization cost**: <0.1μs (string operations)
- **Total**: ~1μs (still 100x faster than Dexpack)

---

### 9.10.5 Fallback Path: Dexpack Lookup

**Trigger Conditions** (lines 530-595):

1. **Engine Not Ready**: `global.engineReady === false` (before Step 7 of initialization)
2. **Cache Not Loaded**: `engineCache.isReady() === false` (Read-DB failed to seed)
3. **Cache Miss**: Engine Cache returns `null` (LRU eviction or species not in cache)

**Dexpack Lookup Implementation**:

```javascript
// DEXPACK FALLBACK (original implementation)
const pack = requirePack();  // Load assets/dexpack.v1.json
const runtimeTag = state.runtime ?? RUNTIME_SOURCE.MODULE;
const startedAt = Date.now();

if (typeof query === "number" && Number.isFinite(query)) {
  const doc = pack.byId[String(query)] ?? null;
  recordDexLookup({ runtime: runtimeTag, query, resolution: "id", found: Boolean(doc), durationMs: Date.now() - startedAt });
  return doc;
}

const key = normalizeLookup(query);
if (!key) {
  recordDexLookupMiss({ runtime: runtimeTag, query, attemptedResolutions: ["empty"] });
  return null;
}

const fast = state.fast;
const attempted = [];
let resolution = "unknown";
let id = null;

// Try hash table lookup (v2 optimization)
if (fast?.nameTable) {
  attempted.push("name-hash");
  const lookupId = lookupInHashTable(key, fast.nameTable);
  if (lookupId != null) {
    id = lookupId;
    resolution = "name-hash";
  }
}

// Try alias hash table (v2 optimization)
if (id == null && fast?.aliasTable) {
  attempted.push("alias-hash");
  const aliasId = lookupInHashTable(key, fast.aliasTable);
  if (aliasId != null) {
    id = aliasId;
    resolution = "alias-hash";
  }
}

// Try Map lookup (v1 fallback)
if (id == null) {
  attempted.push("maps");
  const mapId = pack.byName?.[key] ?? pack.byAlias?.[key] ?? null;
  if (mapId != null) {
    id = mapId;
    resolution = "maps";
  }
}

const doc = id ? pack.byId[String(id)] ?? null : null;
const durationMs = Date.now() - startedAt;

if (doc) {
  recordDexLookup({ runtime: runtimeTag, query: key, resolution, found: true, durationMs });
  return doc;
}

recordDexLookupMiss({ runtime: runtimeTag, query: key, attemptedResolutions: attempted });
recordDexLookup({ runtime: runtimeTag, query: key, resolution, found: false, durationMs });
return null;
```

**Resolution Strategies** (in order):

1. **Direct ID Lookup**: `pack.byId[String(query)]` (fastest, 0.1ms)
2. **Name Hash Table**: `lookupInHashTable(key, fast.nameTable)` (Dexpack v2, 0.2ms)
3. **Alias Hash Table**: `lookupInHashTable(key, fast.aliasTable)` (typos/abbreviations, 0.2ms)
4. **Map Lookup**: `pack.byName[key]` or `pack.byAlias[key]` (Dexpack v1 fallback, 0.5ms)

**Performance**:
- **Direct ID**: ~0.1ms (JSON object key access)
- **Hash Table**: ~0.2ms (Int32Array binary search)
- **Map Lookup**: ~0.5ms (JavaScript Map iteration)
- **Total (worst case)**: ~1ms (still acceptable for non-critical paths)

**Why Fallback Still Fast?**
- Dexpack pre-loaded at startup (no disk I/O during lookup)
- Hash tables (Int32Array) provide O(log n) lookups
- Worst case 1ms is 1000x slower than Engine Cache but still interactive

---

### 9.10.6 Metrics & Observability

**Lookup Telemetry** (`recordDexLookup` function):

```javascript
recordDexLookup({ 
  runtime: "engine-cache",  // or "dexpack-v2", "dexpack-v1"
  query: "pikachu",         // User input
  resolution: "name",       // "id", "name-hash", "alias-hash", "maps"
  found: true,              // true if species found
  durationMs: 0.001         // <1μs for cache hit
});
```

**Tracked Metrics**:

| Metric | Source | Purpose |
|--------|--------|---------|
| **Cache Hit Rate** | `engineCache.getStats()` | Monitor fast path effectiveness |
| **Fallback Rate** | Dexpack runtime counts | Detect cache misses or readiness issues |
| **Resolution Strategy** | `recordDexLookup` resolution field | Identify optimization opportunities |
| **Miss Reasons** | `recordDexLookupMiss` attemptedResolutions | Debug failed lookups |

**Query Performance Stats** (via `dex-metrics.js`):

```javascript
// Typical distribution:
{
  "engine-cache": {
    "totalLookups": 15234,     // 95% of queries
    "hits": 15234,
    "misses": 0,
    "avgDurationMs": 0.001
  },
  "dexpack-v2": {
    "totalLookups": 789,       // 5% of queries (fallback)
    "hits": 789,
    "misses": 0,
    "avgDurationMs": 0.3
  }
}
```

**Expected Rates**:
- **Engine Cache Hit**: 95-98% (after warmup)
- **Dexpack Fallback**: 2-5% (LRU evictions, pre-warmup queries)
- **Not Found**: <1% (typos, invalid IDs)

---

### 9.10.7 Format Conversion Details

**Cache Entry Structure** (from `engine-cache.ts`):

```typescript
interface PokemonCacheEntry {
  id: number;                // 25 (Pikachu)
  name: string;              // "Pikachu"
  slug: string;              // "pikachu"
  types: number[];           // [13] (Electric type ID)
  baseStats: {
    hp: number;              // 35
    attack: number;          // 55
    defense: number;         // 40
    specialAttack: number;   // 50
    specialDefense: number;  // 50
    speed: number;           // 90
  };
  abilities: number[];       // [9, 31] (Static, Lightning Rod)
  moves: number[];           // [85, 98, 129, ...] (learned move IDs)
  height: number;            // 4 (0.4m)
  weight: number;            // 60 (6kg)
  learnsets?: {              // Optional learnset data
    level: Array<{level: number, moveId: number}>;
    machine: number[];
    tutor: number[];
    egg: number[];
  };
  matchups?: Record<string, number>;  // {"water": 0.5, "ground": 2}
  lastAccessed: number;      // Timestamp for LRU eviction
}
```

**Dexpack Document Structure** (from `dexpack.d.ts`):

```typescript
interface SpeciesDoc {
  id: number;                // 25
  slug: string;              // "pikachu"
  name: string;              // "Pikachu"
  typing: string[];          // ["electric"]
  abilities: Array<{         // Detailed ability data
    name: string;            // "static"
    hidden: boolean;         // false
    slot: number;            // 1
  }>;
  baseStats: {
    hp: number;
    atk: number;
    def: number;
    spAtk: number;
    spDef: number;
    spe: number;
  };
  height: number;            // 4
  weight: number;            // 60
  learnsets: {
    level: Array<{level: number, move: string}>;
    machine: string[];
    tutor: string[];
    egg: string[];
  };
  matchups: Record<string, number>;
  aliases: string[];         // ["pika", "chu"]
}
```

**Key Differences**:

| Field | Cache Format | Dexpack Format | Conversion Required |
|-------|--------------|----------------|---------------------|
| **Types** | `number[]` [13] | `string[]` ["electric"] | ❌ Cache uses IDs, Dexpack uses names |
| **Abilities** | `number[]` [9, 31] | `{name, hidden, slot}[]` | ❌ Cache uses IDs, Dexpack has full details |
| **BaseStats** | `{attack, specialAttack, ...}` | `{atk, spAtk, ...}` | ✅ Field name mapping |
| **Learnsets** | Optional, IDs | Required, names | ⚠️ Partial conversion (defaults to empty) |
| **Matchups** | Optional | Always present | ⚠️ Defaults to empty object |
| **Aliases** | Not stored | Array of strings | ✅ Always returns empty array |

**Why Differences Exist?**
- **Cache Optimization**: IDs reduce memory footprint (4 bytes vs 10-20 bytes per string)
- **Battle Engine Needs**: Engine only needs IDs, not display names
- **Dexpack Completeness**: Dexpack includes all data for UI rendering

**Conversion Trade-off**:
- **Pros**: Engine Cache stays lean (~8MB vs 20MB with strings)
- **Cons**: Conversion overhead (~0.5μs per query, negligible)
- **Solution**: Acceptable trade-off for 100-1000x performance gain

---

### 9.10.8 Usage Patterns

**Pattern 1: Battle Engine Lookup (ID-based)**

```javascript
// src/core/battle/engine.js
import { getSpecies } from '../../data/dexpack.js';

export function resolveTurn(state, playerAction) {
  // Get Pokemon by ID (fast path: <1μs cache hit)
  const pokemon = getSpecies(state.playerPokemon.id);
  
  if (!pokemon) {
    throw new Error(`Pokemon ID ${state.playerPokemon.id} not found`);
  }
  
  // Calculate damage using baseStats
  const damage = calculateDamage(
    playerAction.moveId,
    pokemon.baseStats,
    state.opponentPokemon.baseStats
  );
  
  // ... (rest of turn resolution)
}
```

**Performance**:
- **Engine Cache Hit**: <1μs (95-98% of queries)
- **Dexpack Fallback**: ~0.1ms (2-5% of queries, LRU eviction)
- **Total Impact**: Negligible (<0.01% of turn resolution time)

---

**Pattern 2: Discord Command Lookup (Name-based)**

```javascript
// src/bot/commands/profile.js
import { getSpecies } from '../../data/dexpack.js';

export async function showProfile(interaction) {
  const pokemonName = interaction.options.getString('pokemon');
  
  // Get Pokemon by name (fast path: <1μs cache hit)
  const pokemon = getSpecies(pokemonName);
  
  if (!pokemon) {
    return interaction.reply(`Pokemon "${pokemonName}" not found!`);
  }
  
  // Render profile embed
  const embed = {
    title: pokemon.name,
    description: `#${pokemon.id} - ${pokemon.typing.join('/')}`,
    fields: [
      {
        name: 'Base Stats',
        value: `HP: ${pokemon.baseStats.hp}\nATK: ${pokemon.baseStats.atk}\n...`
      }
    ]
  };
  
  return interaction.reply({ embeds: [embed] });
}
```

**Performance**:
- **Engine Cache Hit**: <1μs (name normalization + Map lookup)
- **Dexpack Fallback**: ~0.3ms (hash table + alias resolution)
- **User Experience**: Instant (<50ms total including Discord API)

---

**Pattern 3: Autocomplete Suggestions (Prefix-based)**

```javascript
// src/bot/commands/autocomplete.js
import { suggestSpecies } from '../../data/dexpack.js';

export async function handleAutocomplete(interaction) {
  const focusedValue = interaction.options.getFocused();
  
  // Get suggestions (uses Dexpack, not Engine Cache)
  const suggestions = suggestSpecies(focusedValue, 25);
  
  return interaction.respond(
    suggestions.map(name => ({ name, value: name }))
  );
}
```

**Why Not Engine Cache?**
- Autocomplete needs **all** matching species (not just one)
- Dexpack has efficient prefix search (`suggestSpecies`)
- Engine Cache optimized for single lookups, not bulk queries

---

### 9.10.9 Integration Lifecycle

**Startup Sequence** (§9.8 Engine DB Initialization):

```
1. validateEngineDbConfig()         // 0-5ms
2. Read-DB init + seeding           // 100-200ms
3. L1 Cache load from Read-DB       // 200-400ms
   └─> engineCache.initialize()
   └─> global.engineReady = false   // Cache loading
4. Write-DB init + WAL replay       // 50-100ms
5. Background workers start         // 10-20ms
6. global.engineReady = true        // ← DEXPACK INTEGRATION ACTIVATES
   └─> getSpecies() now uses Engine Cache fast path
7. Ready for gameplay
```

**Critical Timing**:
- **Before Step 6**: `getSpecies()` uses Dexpack fallback (0.3-1ms)
- **After Step 6**: `getSpecies()` uses Engine Cache fast path (<1μs)
- **User Impact**: Early queries slightly slower (first 5-10 seconds), then 100-1000x faster

---

**Shutdown Sequence** (§16.4 Graceful Shutdown):

```
1. global.engineReady = false       // ← DISABLE ENGINE CACHE
   └─> getSpecies() switches to Dexpack fallback
2. Stop background workers          // 0-500ms
3. Flush Write Buffer               // 0-200ms
4. Save Write-DB to disk            // 100-300ms
5. Close Read-DB connection         // 0-10ms
6. Cleanup L1 Cache                 // 0-5ms
7. Process exit
```

**Why Disable Engine Cache First?**
- Prevents new cache lookups during cleanup
- Ensures Dexpack fallback available until process exit
- Zero downtime: `getSpecies()` continues working (slightly slower)

---

### 9.10.10 Performance Characteristics

**Latency Comparison**:

| Lookup Method | Typical Latency | 99th Percentile | Notes |
|---------------|-----------------|-----------------|-------|
| **Engine Cache (ID)** | <1μs | 2μs | Map.get(number), fastest |
| **Engine Cache (Name)** | <1μs | 3μs | Map.get(string) after normalization |
| **Dexpack Hash (ID)** | ~0.1ms | 0.3ms | JSON object key access |
| **Dexpack Hash (Name)** | ~0.2ms | 0.5ms | Int32Array binary search |
| **Dexpack Map (Name)** | ~0.5ms | 1.5ms | JavaScript Map iteration |
| **Cache Miss + Fallback** | ~0.3ms | 1ms | Engine Cache miss → Dexpack hash |

**Throughput**:

| Method | Queries/Second | Notes |
|--------|----------------|-------|
| **Engine Cache** | 10M+ | Limited by Map.get performance |
| **Dexpack Hash** | 50K-100K | Limited by JSON parsing + hash search |
| **Dexpack Map** | 10K-20K | Limited by JavaScript Map iteration |

**Memory Footprint**:

| Component | Memory Usage | Notes |
|-----------|--------------|-------|
| **Engine L1 Cache** | ~8MB | 500 Pokemon × 16KB each (with LRU eviction) |
| **Dexpack JSON** | ~5MB | Loaded at startup, never freed |
| **Secondary Index** | ~2MB | Name → Pokemon Map (250 entries) |
| **Total** | ~15MB | <1% of bot memory (2GB Render Standard plan) |

**Cache Hit Rates** (production metrics):

| Scenario | Engine Cache Hit Rate | Notes |
|----------|----------------------|-------|
| **Battle Engine** | 98-99% | ID-based, highly cacheable |
| **Discord Commands** | 95-97% | Name-based, popular Pokemon cached |
| **Autocomplete** | 0% | Uses Dexpack directly (bulk queries) |
| **Overall** | 95-98% | Fast path dominates traffic |

---

### 9.10.11 Error Handling & Graceful Degradation

**Failure Modes**:

| Failure | Detection | Fallback | Impact |
|---------|-----------|----------|--------|
| **Engine Not Ready** | `global.engineReady === false` | Use Dexpack | +0.3-1ms per query (acceptable) |
| **Cache Not Loaded** | `engineCache.isReady() === false` | Use Dexpack | +0.3-1ms per query (acceptable) |
| **Cache Corruption** | `getPokemon()` returns null | Use Dexpack | +0.3-1ms per query (acceptable) |
| **Dexpack Missing** | `requirePack()` throws | Return null + error log | Battle/command fails (rare) |
| **Invalid Query** | Empty/null input | Return null immediately | 0ms (expected, no error) |

**Error Logging**:

```javascript
// Cache miss (INFO level, expected)
if (!cached) {
  log('info', 'dexpack: Engine cache miss, falling back to dexpack', { query });
}

// Dexpack failure (ERROR level, unexpected)
if (!doc && !cached) {
  log('error', 'dexpack: Failed to find species in both cache and dexpack', { 
    query, 
    engineReady: global.engineReady,
    cacheReady: engineCache.isReady()
  });
}
```

**Graceful Degradation Guarantees**:
1. **Engine Cache Failure**: Dexpack ensures 100% availability (0.3-1ms penalty)
2. **Dexpack Failure**: Return null, caller handles missing species gracefully
3. **Both Fail**: Impossible (Dexpack pre-loaded at startup, always available)

---

### 9.10.12 Future Optimizations

**Planned Improvements** (Phase 23+):

1. **LRU Pre-warming**:
   - Load popular Pokemon (starters, meta picks) into cache at startup
   - Reduce initial Dexpack fallback rate from 10% → 2%
   - Target: 98% cache hit rate within first 10 seconds

2. **Tiered Caching**:
   - **L1 (Hot)**: Gen 1-2 Pokemon (300 species, always cached)
   - **L2 (Warm)**: Recent battle Pokemon (200 species, LRU eviction)
   - **L3 (Cold)**: Dexpack fallback
   - Target: 99.5% cache hit rate for battle engine

3. **Adaptive Eviction**:
   - Track query frequency per species
   - Protect frequently-used Pokemon from LRU eviction
   - Evict only rarely-queried species
   - Target: 99.9% cache hit rate after 1 hour uptime

4. **Cache-Aside Pattern**:
   - On Dexpack fallback, promote species to Engine Cache
   - Reduce repeat fallback queries
   - Target: 0 duplicate Dexpack lookups per species

5. **Bulk Lookup Optimization**:
   - Add `getSpeciesMultiple(ids: number[])` API
   - Batch cache lookups for /team command (6 Pokemon)
   - Target: 6 queries in <10μs (vs 6μs serial)

**See Also**:
- **§9.8.4** — L1 Cache Load (Engine DB initialization)
- **§9.9.2** — Cache Refresh Worker (hourly cache rebuild)
- **§13.2** — L1 Cache LRU Eviction (performance optimization)
- `src/services/cache/engine-cache.ts` — Engine Cache implementation
- `src/data/dexpack.js` — Dexpack integration layer

---

### 9.10.13 Cross-References

**Related Documentation**:
- **Section 9.8**: Engine DB Runtime Architecture (L1 Cache initialization)
- **Section 9.9**: Engine Workers Runtime (Cache Refresh Worker)
- **Section 13.2**: Optimization Achievements (L1 Cache LRU eviction)
- **Section 6.6**: Worker Error Handler (cache refresh error handling)

**Related Code**:
- `src/data/dexpack.js`: getSpecies() integration (lines 449-530)
- `src/services/cache/engine-cache.ts`: Engine Cache implementation (661 lines)
- `src/workers/engine-workers.ts`: Cache Refresh Worker (lines 42-103)
- `src/core/battle/engine.js`: Battle engine usage (ID-based lookups)

**Related Metrics**:
- Dex lookup metrics: `dex-metrics.js` recordDexLookup() telemetry
- Engine cache stats: `engineCache.getStats()` hit rate monitoring
- Performance benchmarks: `docs/optimization-bible/01-startup-performance.md`

---

**Last Updated**: 2025-11-20 (Bible Update 16/∞)  
**Runtime Version**: Dexpack v1 + Engine Cache v1.0  
**Production Status**: ✅ Active (95-98% cache hit rate)  
**Performance Impact**: 100-1000x faster than pure Dexpack (1000μs → <1μs)

---

[← Back to INDEX](INDEX.md) | [← Previous: Router System](08-router-system.md) | [Next: Discord Bot →](10-discord-bot.md)