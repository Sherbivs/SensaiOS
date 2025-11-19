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