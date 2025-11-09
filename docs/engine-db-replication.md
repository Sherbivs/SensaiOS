# Engine Database Replication Architecture — Read/Write Split with Integrity Validation

**Last Updated (UTC):** 2025-11-09T00:00:00Z  
**Status:** DESIGN PHASE  
**Owner:** Game Engine Systems  
**Dependencies:** Phase 16 DB Replication (version control, integrity verification)

---

## Executive Summary

This document defines a **bidirectional Engine DB replication system** that:

1. **Separates reads from writes** — Game engine reads from static reference data, writes gameplay outcomes to separate database
2. **Validates data quality** — Integrity scanner catches bugs, anomalies, and invalid states before pushing to PROD
3. **Maintains single source of truth** — PROD PostgreSQL remains authoritative for Pokemon data
4. **Enables offline gameplay** — Engine can run battles even when PROD is unreachable
5. **Provides auditability** — Every battle decision traceable through write-db logs

**Core Principle:** PROD feeds static data to Engine Read-DB. Engine generates new insights in Write-DB. Integrity scanner validates and mirrors verified data back to PROD, completing the cycle.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                    PROD POSTGRESQL (MASTER)                        │
│         Render Managed - Single Source of Truth                    │
│  Tables: Species, Move, Type, Ability, TypeChart, etc.            │
│                                                                     │
│  Operations:                                                        │
│  - Receives schema migrations (via Prisma)                         │
│  - Stores canonical Pokemon data (PokeAPI source)                  │
│  - Accepts verified gameplay data from Write-DB                    │
│  - Serves trainer profiles, inventories, encounters                │
└──────────────────┬─────────────────────────────────────────────────┘
                   │
                   │ REPLICATION (One-way: PROD → Engine Read-DB)
                   │ Sync Strategy: PULL on schedule (hourly/daily)
                   │ Data: Species, Move, Type, Ability, TypeChart
                   │ Method: SQL queries → JSON → SQLite INSERT
                   │
                   ▼
┌────────────────────────────────────────────────────────────────────┐
│              ENGINE READ-DB (SQLite - Read-Only)                   │
│                   /Store/engine-read.db                            │
│                                                                     │
│  Purpose: Fast local lookups for game engine                       │
│  Tables: pokemon, moves, types, abilities, type_effectiveness     │
│  Access Pattern: Read-heavy (1000s of queries per battle)          │
│  Indexes: By ID, by name, by type combinations                     │
│                                                                     │
│  Operations:                                                        │
│  - getPokemonById(25) → Pikachu stats in <1ms                      │
│  - getMoveEffectiveness(typeId, targetTypeId) → multiplier        │
│  - getAbilityEffect(abilityId) → JSON description                 │
│  - searchPokemonByType(['electric']) → all Electric types         │
│                                                                     │
│  Sync Metadata:                                                     │
│  - Last sync timestamp                                              │
│  - Version fingerprint (from PROD _prisma_migrations)             │
│  - Row counts per table                                             │
│  - Data freshness indicator (hours since sync)                     │
└──────────────────┬─────────────────────────────────────────────────┘
                   │
                   │ GAME ENGINE OPERATIONS
                   │ • Battle calculations (damage, effectiveness)
                   │ • Encounter spawn logic
                   │ • Move validation (PP, accuracy, type matchups)
                   │ • Ability effects resolution
                   │ • Evolution checks
                   │
                   │ Engine reads from Read-DB, writes to Write-DB
                   │
                   ▼
┌────────────────────────────────────────────────────────────────────┐
│             ENGINE WRITE-DB (SQLite - Write-Only)                  │
│                  /Store/engine-write.db                            │
│                                                                     │
│  Purpose: Capture gameplay outcomes for analysis                   │
│  Tables: battle_logs, encounter_logs, move_usage, anomalies       │
│  Access Pattern: Write-heavy (append-only during battles)          │
│  Indexes: By timestamp, by trainer_id, by battle_id               │
│                                                                     │
│  Data Captured:                                                     │
│  - Battle outcomes (winner, duration, moves used)                  │
│  - Damage calculations (expected vs actual)                        │
│  - Critical hits, misses, status effects                           │
│  - Anomalies (impossible damage, invalid states)                   │
│  - Performance metrics (query times, engine latency)               │
│                                                                     │
│  Schema:                                                            │
│  battle_logs: battle_id, trainer1_id, trainer2_id, winner,        │
│               duration_ms, moves_used, turn_count, created_at      │
│  move_usage: battle_id, turn, pokemon_id, move_id, damage,        │
│              effectiveness, critical, missed, created_at           │
│  anomalies: battle_id, type, description, severity, created_at    │
└──────────────────┬─────────────────────────────────────────────────┘
                   │
                   │ INTEGRITY SCAN (Scheduled - Every 10 minutes)
                   │ • Schema validation (correct columns/types)
                   │ • Range checks (HP > 0, damage < 999)
                   │ • Referential integrity (Pokemon IDs exist)
                   │ • Anomaly detection (impossible stats)
                   │ • Deduplication (same battle logged twice)
                   │
                   ▼
┌────────────────────────────────────────────────────────────────────┐
│                    INTEGRITY SCANNER                               │
│              Validates Write-DB before mirroring                   │
│                                                                     │
│  Validation Rules:                                                  │
│  1. Schema Check: All required columns present, correct types      │
│  2. Range Check: Stats within valid bounds (HP: 1-714, etc.)      │
│  3. FK Check: All pokemon_id/move_id/trainer_id exist in PROD     │
│  4. Logic Check: Damage calculation matches type effectiveness    │
│  5. Anomaly Check: Flag impossible values (HP < 0, PP > max)      │
│  6. Duplicate Check: Same battle_id not logged multiple times     │
│                                                                     │
│  Validation Outcomes:                                               │
│  - PASS: Row eligible for PROD upload                              │
│  - WARN: Suspicious but valid (e.g., 6 crits in a row)            │
│  - FAIL: Invalid data, quarantine for investigation               │
│  - ANOMALY: Potential bug, escalate to developers                 │
│                                                                     │
│  Metrics:                                                           │
│  - Validation rate: rows/second                                     │
│  - Pass/Warn/Fail/Anomaly counts                                   │
│  - Top failure reasons                                              │
│  - Data quality score (% passing)                                  │
└──────────────────┬─────────────────────────────────────────────────┘
                   │
                   │ MIRROR BACK (Write-DB → PROD)
                   │ Sync Strategy: PUSH validated batches (hourly)
                   │ Data: Verified battle_logs, move_usage, anomalies
                   │ Method: SQLite SELECT → INSERT INTO PROD tables
                   │
                   ▼
┌────────────────────────────────────────────────────────────────────┐
│                    PROD POSTGRESQL (MASTER)                        │
│                        ← CYCLE COMPLETE ←                          │
│                                                                     │
│  New Tables (for Engine data):                                      │
│  - BattleLog: Receives verified battle outcomes                    │
│  - MoveUsageStats: Aggregated move effectiveness data              │
│  - EngineAnomaly: Bug reports from integrity scanner               │
│  - EngineMetrics: Performance data from gameplay                   │
└────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Details

### 1. PROD → Engine Read-DB Sync (Static Data)

**What Replicates:**
- `Species` table → `pokemon` (SQLite)
- `Move` table → `moves` (SQLite)
- `Type` table → `types` (SQLite)
- `Ability` table → `abilities` (SQLite)
- `TypeChart` table → `type_effectiveness` (SQLite)

**Sync Schedule:**
- **Hourly** for development (frequent data changes)
- **Daily** for production (data rarely changes after launch)
- **On-demand** via CLI (`npm run engine:sync read`)

**Sync Process:**

```typescript
async function syncProdToReadDb(): Promise<SyncResult> {
  const result: SyncResult = { success: false, stage: 'VERSION_CHECK', errors: [] };
  
  try {
    // STAGE 1: Version Check
    const prodVersion = await getVersion(prisma);  // From db_version table
    const readDbVersion = await getEngineReadDbVersion();
    
    if (prodVersion.fingerprint === readDbVersion.fingerprint) {
      log.info('engine-replication: Read-DB already in sync with PROD');
      result.success = true;
      return result;
    }
    
    // STAGE 2: Extract data from PROD
    result.stage = 'EXTRACT';
    const pokemonData = await prisma.species.findMany({
      include: {
        types: { include: { type: true } },
        abilities: { include: { ability: true } },
        baseStats: true
      }
    });
    
    const moveData = await prisma.move.findMany({
      include: { type: true }
    });
    
    const typeChartData = await prisma.typeChart.findMany({
      include: { atkType: true, defType: true }
    });
    
    // STAGE 3: Transform to SQLite schema
    result.stage = 'TRANSFORM';
    const sqliteRecords = transformToSQLiteSchema(pokemonData, moveData, typeChartData);
    
    // STAGE 4: Load into Read-DB
    result.stage = 'LOAD';
    await loadIntoEngineReadDb(sqliteRecords);
    
    // STAGE 5: Update version metadata
    result.stage = 'VERSION_UPDATE';
    await updateEngineReadDbVersion(prodVersion);
    
    // STAGE 6: Verify integrity
    result.stage = 'VERIFY';
    const integrityCheck = await verifyReadDbIntegrity();
    
    if (!integrityCheck.passed) {
      throw new Error(`Read-DB integrity check failed: ${JSON.stringify(integrityCheck.diffs)}`);
    }
    
    result.success = true;
    result.stage = 'COMPLETE';
    
    log.info('engine-replication: PROD → Read-DB sync complete', {
      pokemonCount: pokemonData.length,
      moveCount: moveData.length,
      typeChartCount: typeChartData.length,
      version: prodVersion.fingerprint.slice(0, 8)
    });
    
    return result;
    
  } catch (error) {
    result.errors.push({ stage: result.stage, message: error.message });
    log.error('engine-replication: PROD → Read-DB sync failed', { stage: result.stage, error });
    throw error;
  }
}
```

---

### 2. Engine Operations (Read-DB ← Game Engine → Write-DB)

**Read Operations (from Read-DB):**

```typescript
import { engineReadDb } from '../services/engine-db-read.js';

async function calculateDamage(attacker: Pokemon, defender: Pokemon, move: Move): Promise<DamageResult> {
  // STEP 1: Lookup move data from Read-DB
  const moveData = await engineReadDb.getMoveById(move.id);
  
  // STEP 2: Lookup type effectiveness from Read-DB
  const effectiveness = await engineReadDb.getTypeEffectiveness(
    moveData.typeId,
    defender.types
  );
  
  // STEP 3: Lookup ability effects from Read-DB
  const attackerAbility = await engineReadDb.getAbilityById(attacker.abilityId);
  const defenderAbility = await engineReadDb.getAbilityById(defender.abilityId);
  
  // STEP 4: Calculate damage using data from Read-DB
  const baseDamage = calculateBaseDamage(
    attacker.stats.attack,
    defender.stats.defense,
    moveData.power,
    attacker.level
  );
  
  const finalDamage = Math.floor(
    baseDamage * effectiveness * applyAbilityModifiers(attackerAbility, defenderAbility)
  );
  
  // STEP 5: Write outcome to Write-DB (async, non-blocking)
  await engineWriteDb.logMoveUsage({
    battle_id: battle.id,
    turn: battle.currentTurn,
    pokemon_id: attacker.id,
    move_id: move.id,
    damage: finalDamage,
    effectiveness,
    critical: isCritical,
    missed: false,
    created_at: Date.now()
  });
  
  return { damage: finalDamage, effectiveness, isCritical };
}
```

**Write Operations (to Write-DB):**

```typescript
import { engineWriteDb } from '../services/engine-db-write.js';

async function completeBattle(battle: Battle): Promise<void> {
  // Log battle outcome to Write-DB
  await engineWriteDb.logBattle({
    battle_id: battle.id,
    trainer1_id: battle.trainer1.id,
    trainer2_id: battle.trainer2.id,
    winner: battle.winner.id,
    duration_ms: battle.durationMs,
    moves_used: battle.movesUsed.length,
    turn_count: battle.currentTurn,
    created_at: Date.now()
  });
  
  // Log any anomalies detected during battle
  for (const anomaly of battle.detectedAnomalies) {
    await engineWriteDb.logAnomaly({
      battle_id: battle.id,
      type: anomaly.type,  // 'NEGATIVE_HP' | 'IMPOSSIBLE_DAMAGE' | 'INVALID_MOVE'
      description: anomaly.description,
      severity: anomaly.severity,  // 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
      created_at: Date.now()
    });
  }
  
  // Performance metrics
  await engineWriteDb.logMetrics({
    battle_id: battle.id,
    total_queries: battle.queryCount,
    avg_query_time_ms: battle.avgQueryTimeMs,
    peak_memory_mb: battle.peakMemoryMb,
    created_at: Date.now()
  });
}
```

---

### 3. Integrity Scanner (Write-DB Validation)

**Validation Rules:**

```typescript
interface ValidationRule {
  name: string;
  check: (row: any) => ValidationResult;
  severity: 'ERROR' | 'WARNING' | 'INFO';
}

const VALIDATION_RULES: ValidationRule[] = [
  // 1. Schema Validation
  {
    name: 'battle_log_schema',
    check: (row) => {
      const required = ['battle_id', 'trainer1_id', 'trainer2_id', 'winner', 'duration_ms'];
      const missing = required.filter(col => row[col] === undefined);
      
      return {
        passed: missing.length === 0,
        message: missing.length ? `Missing columns: ${missing.join(', ')}` : 'OK',
        metadata: { missingColumns: missing }
      };
    },
    severity: 'ERROR'
  },
  
  // 2. Range Validation
  {
    name: 'move_usage_damage_range',
    check: (row) => {
      const damage = row.damage;
      const isValid = damage >= 0 && damage <= 999;  // Max possible damage
      
      return {
        passed: isValid,
        message: isValid ? 'OK' : `Damage out of range: ${damage}`,
        metadata: { damage, min: 0, max: 999 }
      };
    },
    severity: 'ERROR'
  },
  
  // 3. Referential Integrity
  {
    name: 'move_usage_pokemon_exists',
    check: async (row) => {
      const pokemonExists = await engineReadDb.getPokemonById(row.pokemon_id);
      
      return {
        passed: pokemonExists !== null,
        message: pokemonExists ? 'OK' : `Pokemon ID ${row.pokemon_id} not found in Read-DB`,
        metadata: { pokemon_id: row.pokemon_id }
      };
    },
    severity: 'ERROR'
  },
  
  // 4. Logic Validation
  {
    name: 'move_usage_effectiveness_matches',
    check: async (row) => {
      // Verify effectiveness multiplier matches type chart
      const move = await engineReadDb.getMoveById(row.move_id);
      const pokemon = await engineReadDb.getPokemonById(row.pokemon_id);
      const expectedEffectiveness = await engineReadDb.getTypeEffectiveness(
        move.typeId,
        pokemon.types
      );
      
      const matches = Math.abs(row.effectiveness - expectedEffectiveness) < 0.01;
      
      return {
        passed: matches,
        message: matches 
          ? 'OK' 
          : `Effectiveness mismatch: expected ${expectedEffectiveness}, got ${row.effectiveness}`,
        metadata: { expected: expectedEffectiveness, actual: row.effectiveness }
      };
    },
    severity: 'WARNING'  // Could be rounding error or ability modifier
  },
  
  // 5. Anomaly Detection
  {
    name: 'battle_log_duration_realistic',
    check: (row) => {
      const duration = row.duration_ms;
      const isRealistic = duration >= 1000 && duration <= 600000;  // 1s - 10min
      
      return {
        passed: isRealistic,
        message: isRealistic ? 'OK' : `Unrealistic battle duration: ${duration}ms`,
        metadata: { duration, min: 1000, max: 600000 }
      };
    },
    severity: 'WARNING'
  },
  
  // 6. Duplicate Detection
  {
    name: 'battle_log_unique',
    check: async (row) => {
      const existing = await engineWriteDb.findBattleLog(row.battle_id);
      
      return {
        passed: !existing,
        message: existing ? `Duplicate battle_id: ${row.battle_id}` : 'OK',
        metadata: { battle_id: row.battle_id }
      };
    },
    severity: 'ERROR'
  }
];

async function validateWriteDb(): Promise<ValidationReport> {
  const report: ValidationReport = {
    totalRows: 0,
    passedRows: 0,
    warnedRows: 0,
    failedRows: 0,
    anomalyRows: 0,
    failures: [],
    warnings: [],
    anomalies: []
  };
  
  // Validate battle_logs table
  const battleLogs = await engineWriteDb.getUnvalidatedBattleLogs();
  report.totalRows += battleLogs.length;
  
  for (const log of battleLogs) {
    const validationResults = await Promise.all(
      VALIDATION_RULES
        .filter(rule => rule.name.startsWith('battle_log_'))
        .map(rule => rule.check(log))
    );
    
    const errors = validationResults.filter(r => !r.passed && r.severity === 'ERROR');
    const warnings = validationResults.filter(r => !r.passed && r.severity === 'WARNING');
    
    if (errors.length > 0) {
      report.failedRows++;
      report.failures.push({
        table: 'battle_logs',
        row_id: log.battle_id,
        errors: errors.map(e => e.message)
      });
      
      // Quarantine failed row (mark for manual review)
      await engineWriteDb.quarantineBattleLog(log.battle_id, errors);
      
    } else if (warnings.length > 0) {
      report.warnedRows++;
      report.warnings.push({
        table: 'battle_logs',
        row_id: log.battle_id,
        warnings: warnings.map(w => w.message)
      });
      
      // Mark as validated with warnings (still eligible for upload)
      await engineWriteDb.markBattleLogValidated(log.battle_id, 'WARN');
      
    } else {
      report.passedRows++;
      
      // Mark as validated (eligible for upload to PROD)
      await engineWriteDb.markBattleLogValidated(log.battle_id, 'PASS');
    }
  }
  
  // Validate move_usage table (same pattern)
  // Validate anomalies table (same pattern)
  
  // Calculate data quality score
  report.qualityScore = report.totalRows > 0
    ? (report.passedRows + report.warnedRows) / report.totalRows
    : 1.0;
  
  log.info('engine-replication: Write-DB validation complete', {
    totalRows: report.totalRows,
    passed: report.passedRows,
    warned: report.warnedRows,
    failed: report.failedRows,
    qualityScore: (report.qualityScore * 100).toFixed(2) + '%'
  });
  
  return report;
}
```

---

### 4. Write-DB → PROD Mirror (Verified Data Upload)

**Sync Process:**

```typescript
async function syncWriteDbToProd(): Promise<SyncResult> {
  const result: SyncResult = { success: false, stage: 'VALIDATION', errors: [] };
  
  try {
    // STAGE 1: Run integrity validation
    result.stage = 'VALIDATION';
    const validationReport = await validateWriteDb();
    
    if (validationReport.qualityScore < 0.95) {
      throw new Error(`Data quality too low: ${validationReport.qualityScore}. Threshold: 0.95`);
    }
    
    // STAGE 2: Extract validated rows
    result.stage = 'EXTRACT';
    const validatedBattleLogs = await engineWriteDb.getValidatedBattleLogs();
    const validatedMoveUsage = await engineWriteDb.getValidatedMoveUsage();
    const validatedAnomalies = await engineWriteDb.getValidatedAnomalies();
    
    log.info('engine-replication: Extracted validated rows', {
      battleLogs: validatedBattleLogs.length,
      moveUsage: validatedMoveUsage.length,
      anomalies: validatedAnomalies.length
    });
    
    // STAGE 3: Transform to PROD schema
    result.stage = 'TRANSFORM';
    const prodBattleLogs = transformToProdBattleLogSchema(validatedBattleLogs);
    const prodMoveUsageStats = aggregateMoveUsageStats(validatedMoveUsage);
    const prodAnomalies = transformToProdAnomalySchema(validatedAnomalies);
    
    // STAGE 4: Upload to PROD
    result.stage = 'UPLOAD';
    
    // Use transaction for atomicity
    await prisma.$transaction(async (tx) => {
      // Insert battle logs
      await tx.battleLog.createMany({
        data: prodBattleLogs,
        skipDuplicates: true  // Idempotent
      });
      
      // Insert aggregated move usage stats
      await tx.moveUsageStats.createMany({
        data: prodMoveUsageStats,
        skipDuplicates: true
      });
      
      // Insert anomalies (for developer investigation)
      await tx.engineAnomaly.createMany({
        data: prodAnomalies,
        skipDuplicates: true
      });
    });
    
    // STAGE 5: Mark rows as uploaded in Write-DB
    result.stage = 'MARK_UPLOADED';
    await engineWriteDb.markBattleLogsUploaded(validatedBattleLogs.map(l => l.battle_id));
    await engineWriteDb.markMoveUsageUploaded(validatedMoveUsage.map(m => m.id));
    await engineWriteDb.markAnomaliesUploaded(validatedAnomalies.map(a => a.id));
    
    // STAGE 6: Prune uploaded rows (retention: 7 days)
    result.stage = 'PRUNE';
    const pruneDate = Date.now() - (7 * 24 * 60 * 60 * 1000);
    await engineWriteDb.pruneUploadedRows(pruneDate);
    
    result.success = true;
    result.stage = 'COMPLETE';
    
    log.info('engine-replication: Write-DB → PROD sync complete', {
      battleLogsUploaded: validatedBattleLogs.length,
      moveUsageUploaded: validatedMoveUsage.length,
      anomaliesUploaded: validatedAnomalies.length,
      qualityScore: (validationReport.qualityScore * 100).toFixed(2) + '%'
    });
    
    return result;
    
  } catch (error) {
    result.errors.push({ stage: result.stage, message: error.message });
    log.error('engine-replication: Write-DB → PROD sync failed', { stage: result.stage, error });
    throw error;
  }
}
```

---

## Schema Definitions

### Engine Read-DB Schema (SQLite)

```sql
-- Version tracking (matches PROD _prisma_migrations)
CREATE TABLE IF NOT EXISTS engine_read_version (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_fingerprint TEXT NOT NULL,
  migration_count INTEGER NOT NULL,
  synced_from TEXT NOT NULL,  -- 'PROD'
  synced_at INTEGER NOT NULL,  -- Unix timestamp
  pokemon_count INTEGER NOT NULL,
  move_count INTEGER NOT NULL,
  type_count INTEGER NOT NULL
);

-- Pokemon (from PROD Species table)
CREATE TABLE IF NOT EXISTS pokemon (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  types TEXT NOT NULL,  -- JSON array: ["electric"]
  abilities TEXT NOT NULL,  -- JSON array: [{"name": "static", "is_hidden": false}]
  base_stats TEXT NOT NULL,  -- JSON: {"hp": 35, "attack": 55, ...}
  sprites TEXT NOT NULL,  -- JSON: {"default": "url", ...}
  indexed_at INTEGER NOT NULL
);

CREATE INDEX idx_pokemon_name ON pokemon(name);

-- Moves (from PROD Move table)
CREATE TABLE IF NOT EXISTS moves (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type_id INTEGER NOT NULL,
  type_name TEXT NOT NULL,
  power INTEGER,
  accuracy INTEGER,
  pp INTEGER NOT NULL,
  priority INTEGER DEFAULT 0,
  category TEXT NOT NULL,  -- 'physical' | 'special' | 'status'
  meta TEXT,  -- JSON
  indexed_at INTEGER NOT NULL
);

CREATE INDEX idx_moves_type ON moves(type_id);
CREATE INDEX idx_moves_category ON moves(category);

-- Types (from PROD Type table)
CREATE TABLE IF NOT EXISTS types (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  indexed_at INTEGER NOT NULL
);

-- Type Effectiveness Chart (from PROD TypeChart table)
CREATE TABLE IF NOT EXISTS type_effectiveness (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atk_type_id INTEGER NOT NULL,
  def_type_id INTEGER NOT NULL,
  multiplier REAL NOT NULL,
  indexed_at INTEGER NOT NULL,
  UNIQUE(atk_type_id, def_type_id)
);

CREATE INDEX idx_type_effectiveness_lookup ON type_effectiveness(atk_type_id, def_type_id);

-- Abilities (from PROD Ability table)
CREATE TABLE IF NOT EXISTS abilities (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  indexed_at INTEGER NOT NULL
);
```

### Engine Write-DB Schema (SQLite)

```sql
-- Version tracking
CREATE TABLE IF NOT EXISTS engine_write_version (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schema_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Battle logs (gameplay outcomes)
CREATE TABLE IF NOT EXISTS battle_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  battle_id TEXT UNIQUE NOT NULL,
  trainer1_id TEXT NOT NULL,
  trainer2_id TEXT NOT NULL,
  winner TEXT NOT NULL,  -- trainer_id of winner
  duration_ms INTEGER NOT NULL,
  moves_used INTEGER NOT NULL,
  turn_count INTEGER NOT NULL,
  validation_status TEXT DEFAULT 'PENDING',  -- 'PENDING' | 'PASS' | 'WARN' | 'FAIL' | 'UPLOADED'
  validation_errors TEXT,  -- JSON array of error messages
  created_at INTEGER NOT NULL,
  validated_at INTEGER,
  uploaded_at INTEGER
);

CREATE INDEX idx_battle_logs_validation ON battle_logs(validation_status);
CREATE INDEX idx_battle_logs_created ON battle_logs(created_at);
CREATE INDEX idx_battle_logs_battle_id ON battle_logs(battle_id);

-- Move usage (detailed move logs per turn)
CREATE TABLE IF NOT EXISTS move_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  battle_id TEXT NOT NULL,
  turn INTEGER NOT NULL,
  pokemon_id INTEGER NOT NULL,
  move_id INTEGER NOT NULL,
  damage INTEGER NOT NULL,
  effectiveness REAL NOT NULL,
  critical INTEGER NOT NULL,  -- 0 or 1 (boolean)
  missed INTEGER NOT NULL,  -- 0 or 1
  validation_status TEXT DEFAULT 'PENDING',
  validation_errors TEXT,
  created_at INTEGER NOT NULL,
  validated_at INTEGER,
  uploaded_at INTEGER
);

CREATE INDEX idx_move_usage_validation ON move_usage(validation_status);
CREATE INDEX idx_move_usage_battle ON move_usage(battle_id);
CREATE INDEX idx_move_usage_move ON move_usage(move_id);

-- Anomalies (bug reports, impossible states)
CREATE TABLE IF NOT EXISTS anomalies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  battle_id TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'NEGATIVE_HP' | 'IMPOSSIBLE_DAMAGE' | 'INVALID_MOVE' | ...
  description TEXT NOT NULL,
  severity TEXT NOT NULL,  -- 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  context TEXT,  -- JSON with relevant state
  validation_status TEXT DEFAULT 'PASS',  -- Anomalies always PASS (they're reports, not errors)
  created_at INTEGER NOT NULL,
  uploaded_at INTEGER
);

CREATE INDEX idx_anomalies_type ON anomalies(type);
CREATE INDEX idx_anomalies_severity ON anomalies(severity);
CREATE INDEX idx_anomalies_battle ON anomalies(battle_id);

-- Performance metrics
CREATE TABLE IF NOT EXISTS engine_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  battle_id TEXT NOT NULL,
  total_queries INTEGER NOT NULL,
  avg_query_time_ms REAL NOT NULL,
  peak_memory_mb REAL NOT NULL,
  validation_status TEXT DEFAULT 'PASS',
  created_at INTEGER NOT NULL,
  uploaded_at INTEGER
);

CREATE INDEX idx_engine_metrics_battle ON engine_metrics(battle_id);
```

### PROD PostgreSQL Schema (New Tables)

```prisma
// Add to prisma/schema.prisma

/// ---- Engine Data Collection ----

model BattleLog {
  id          String   @id @default(cuid())
  battleId    String   @unique  // From engine Write-DB
  trainer1Id  String
  trainer2Id  String
  winner      String
  durationMs  Int
  movesUsed   Int
  turnCount   Int
  createdAt   DateTime
  uploadedAt  DateTime @default(now())

  @@index([battleId])
  @@index([createdAt])
}

model MoveUsageStats {
  id             String   @id @default(cuid())
  moveId         Int      @db.SmallInt
  usageCount     Int      @default(0)
  avgDamage      Float?
  criticalRate   Float?
  missRate       Float?
  aggregatedAt   DateTime @default(now())

  move Move @relation(fields: [moveId], references: [id])

  @@index([moveId])
  @@index([aggregatedAt])
}

model EngineAnomaly {
  id          String   @id @default(cuid())
  battleId    String
  type        String
  description String
  severity    String
  context     Json?
  createdAt   DateTime
  uploadedAt  DateTime @default(now())

  @@index([battleId])
  @@index([severity])
  @@index([type])
}

model EngineMetrics {
  id              String   @id @default(cuid())
  battleId        String
  totalQueries    Int
  avgQueryTimeMs  Float
  peakMemoryMb    Float
  createdAt       DateTime
  uploadedAt      DateTime @default(now())

  @@index([battleId])
}
```

---

## Operational Workflows

### 1. Daily Sync Schedule

```yaml
# render.yaml - Add new cron jobs
services:
  # Existing services...
  
  # Engine Read-DB sync (daily at 3 AM UTC)
  - type: cron
    name: engine-read-db-sync
    env: docker
    schedule: "0 3 * * *"
    buildCommand: npm ci
    startCommand: npm run engine:sync-read-db
    envVars:
      - key: PROD_DATABASE_URL
        fromDatabase:
          name: infinity-gauntlet-db
          property: connectionString
    disk:
      name: engine-db-cache
      mountPath: /Store
      sizeGB: 2  # Read-DB + Write-DB combined
  
  # Engine Write-DB validation (every 10 minutes)
  - type: worker
    name: engine-write-db-validator
    env: docker
    buildCommand: npm ci
    startCommand: npm run engine:validate-write-db
    disk:
      name: engine-db-cache
      mountPath: /Store
      sizeGB: 2
  
  # Engine Write-DB → PROD sync (hourly)
  - type: cron
    name: engine-write-db-sync
    env: docker
    schedule: "0 * * * *"  # Every hour
    buildCommand: npm ci
    startCommand: npm run engine:sync-write-db-to-prod
    envVars:
      - key: PROD_DATABASE_URL
        fromDatabase:
          name: infinity-gauntlet-db
          property: connectionString
    disk:
      name: engine-db-cache
      mountPath: /Store
      sizeGB: 2
```

### 2. CLI Commands

```bash
# Manual sync operations
npm run engine:sync-read-db         # Force PROD → Read-DB sync
npm run engine:sync-write-db        # Force Write-DB → PROD sync
npm run engine:sync-full            # Full cycle: Read + Write sync

# Status and monitoring
npm run engine:status               # Show Read-DB + Write-DB status
npm run engine:metrics              # Validation metrics, data quality
npm run engine:diff                 # Compare Read-DB vs PROD

# Validation operations
npm run engine:validate             # Run integrity scanner
npm run engine:validate --fix       # Auto-fix minor issues
npm run engine:quarantine-report    # Show quarantined rows

# Maintenance
npm run engine:prune-write-db       # Clean uploaded rows (7+ days old)
npm run engine:rebuild-read-db      # Drop + rebuild Read-DB from PROD
npm run engine:export-anomalies     # Export anomalies to JSON for analysis

# Emergency operations
npm run engine:block-upload         # Temporarily block Write-DB → PROD
npm run engine:unblock-upload       # Resume Write-DB → PROD
npm run engine:rollback-read-db     # Restore Read-DB from backup
```

### 3. Monitoring Dashboard

```typescript
// /ops engine command output
interface EngineStats {
  readDb: {
    version: string;
    lastSyncAt: Date;
    syncLagHours: number;
    pokemonCount: number;
    moveCount: number;
    typeCount: number;
    sizeBytes: number;
  };
  writeDb: {
    version: number;
    pendingValidation: number;
    validatedRows: number;
    quarantinedRows: number;
    lastUploadAt: Date;
    uploadLagHours: number;
    dataQualityScore: number;
    sizeBytes: number;
  };
  validation: {
    totalValidated: number;
    passedRows: number;
    warnedRows: number;
    failedRows: number;
    topFailures: Array<{ reason: string; count: number }>;
  };
  replication: {
    prodToReadStatus: 'IN_SYNC' | 'LAGGING' | 'ERROR';
    writeToProdStatus: 'IN_SYNC' | 'LAGGING' | 'BLOCKED' | 'ERROR';
    cycleCompleteCount: number;  // Full PROD → Read → Write → PROD cycles
  };
}

async function getEngineStats(): Promise<EngineStats> {
  const readDbVersion = await getEngineReadDbVersion();
  const writeDbStats = await getEngineWriteDbStats();
  const validationReport = await getLastValidationReport();
  
  return {
    readDb: {
      version: readDbVersion.fingerprint.slice(0, 16),
      lastSyncAt: new Date(readDbVersion.syncedAt * 1000),
      syncLagHours: (Date.now() - readDbVersion.syncedAt * 1000) / (1000 * 60 * 60),
      pokemonCount: readDbVersion.pokemonCount,
      moveCount: readDbVersion.moveCount,
      typeCount: readDbVersion.typeCount,
      sizeBytes: await getDbFileSize('/Store/engine-read.db')
    },
    writeDb: {
      version: writeDbStats.schemaVersion,
      pendingValidation: writeDbStats.pendingValidation,
      validatedRows: writeDbStats.validatedRows,
      quarantinedRows: writeDbStats.quarantinedRows,
      lastUploadAt: new Date(writeDbStats.lastUploadAt * 1000),
      uploadLagHours: (Date.now() - writeDbStats.lastUploadAt * 1000) / (1000 * 60 * 60),
      dataQualityScore: writeDbStats.qualityScore,
      sizeBytes: await getDbFileSize('/Store/engine-write.db')
    },
    validation: {
      totalValidated: validationReport.totalRows,
      passedRows: validationReport.passedRows,
      warnedRows: validationReport.warnedRows,
      failedRows: validationReport.failedRows,
      topFailures: validationReport.topFailures
    },
    replication: {
      prodToReadStatus: calculateSyncStatus(readDbVersion.syncLagHours),
      writeToProdStatus: calculateUploadStatus(writeDbStats.uploadLagHours, writeDbStats.qualityScore),
      cycleCompleteCount: writeDbStats.uploadedBatches
    }
  };
}
```

---

## Benefits & Trade-offs

### Benefits

1. **Performance** — SQLite local reads 10-100x faster than remote PostgreSQL
2. **Offline Capability** — Game engine works even when PROD unreachable
3. **Data Quality** — Integrity scanner catches bugs before polluting PROD
4. **Auditability** — Every battle decision logged and traceable
5. **Scalability** — Read-DB can be distributed to multiple workers
6. **Cost Reduction** — Fewer PROD database connections needed
7. **Observability** — Anomaly detection surfaces engine bugs early

### Trade-offs

1. **Storage Overhead** — 2 SQLite databases (~500 MB combined) + PROD tables
2. **Sync Latency** — Read-DB may be hours behind PROD (acceptable for static data)
3. **Complexity** — 3 databases instead of 1, more moving parts
4. **Maintenance** — Validation rules need updates when schema changes
5. **Disk I/O** — Write-DB appends constantly during battles

---

## Implementation Phases

### Phase 17: Engine Read-DB Foundation (READY)
- **Tasks:**
  - Extend `src/services/engine-db.ts` to support read-only mode
  - Implement PROD → Read-DB sync logic
  - Add version tracking (reuse Phase 16 `db_version` pattern)
  - Create CLI commands (`engine:sync-read-db`, `engine:status`)
  - Test with 1,328 Pokemon from data/pokemon.json
- **Deliverables:**
  - `src/services/engine-db-read.ts` — Read-DB module
  - `src/services/engine-replication/sync-read.ts` — PROD → Read sync
  - Tests: sync success, version tracking, data integrity

### Phase 18: Engine Write-DB Foundation (READY after Phase 17)
- **Tasks:**
  - Create Write-DB schema (battle_logs, move_usage, anomalies, metrics)
  - Implement write operations (logBattle, logMoveUsage, logAnomaly)
  - Add validation status tracking (PENDING → PASS/WARN/FAIL → UPLOADED)
  - Create quarantine mechanism for failed rows
  - Test with mock battle data
- **Deliverables:**
  - `src/services/engine-db-write.ts` — Write-DB module
  - Tests: write operations, validation status, quarantine

### Phase 19: Integrity Scanner (READY after Phase 18)
- **Tasks:**
  - Implement validation rules (schema, range, FK, logic, anomaly, duplicate)
  - Build validation orchestrator (`validateWriteDb()`)
  - Add quarantine and reporting
  - Create data quality metrics
  - Test with various failure scenarios
- **Deliverables:**
  - `src/services/engine-replication/integrity.ts` — Validation module
  - `src/services/engine-replication/rules.ts` — Validation rule definitions
  - Tests: each validation rule, edge cases, performance

### Phase 20: Write-DB → PROD Sync (READY after Phase 19)
- **Tasks:**
  - Implement Write-DB → PROD upload logic
  - Add PROD schema (BattleLog, MoveUsageStats, EngineAnomaly, EngineMetrics)
  - Build aggregation logic (move usage stats)
  - Implement idempotent uploads (skipDuplicates)
  - Add pruning for uploaded rows (7-day retention)
- **Deliverables:**
  - `src/services/engine-replication/sync-write.ts` — Write sync module
  - Migration: `create_engine_tables.sql` for PROD
  - Tests: upload success, deduplication, pruning

### Phase 21: Integration with Battle Engine (READY after Phase 20)
- **Tasks:**
  - Update `src/core/battle/engine.ts` to use Read-DB for lookups
  - Add Write-DB logging to battle calculations
  - Implement anomaly detection in engine
  - Add performance metrics tracking
  - Test with real battles
- **Deliverables:**
  - Updated `src/core/battle/engine.ts` with Read/Write-DB integration
  - Tests: battle with Read-DB lookups, Write-DB logging

### Phase 22: Monitoring & Automation (READY after Phase 21)
- **Tasks:**
  - Build `/ops engine` command for stats dashboard
  - Add alerting thresholds (sync lag, data quality)
  - Create Render cron jobs (daily Read sync, hourly Write sync)
  - Add Render worker for continuous validation
  - Create operational runbooks
- **Deliverables:**
  - `src/bot/ops/engine.ts` — Engine stats command
  - Updated `render.yaml` with new services
  - `docs/engine-db-operations.md` — Runbook

---

## Success Criteria

- ✅ Read-DB syncs from PROD daily, <5 minutes per sync
- ✅ Write-DB logs all battles, <1ms write latency per log
- ✅ Integrity scanner validates rows within 10 minutes
- ✅ Data quality score > 95% before PROD upload
- ✅ Write-DB → PROD sync hourly, <10 minutes per batch
- ✅ Battle engine reads from Read-DB <1ms per lookup
- ✅ Anomalies detected and reported to developers
- ✅ Full replication cycle (PROD → Read → Write → PROD) completes within 24 hours
- ✅ Storage overhead < 2GB total (Read-DB + Write-DB)
- ✅ Zero data corruption incidents
- ✅ Operators have visibility via `/ops engine` command

---

## Next Steps

1. **Review this design** — Validate architecture with stakeholders
2. **Update Tasklist.md** — Create Phase 17-22 entries with acceptance criteria
3. **Update Prompt.md & NEXT.yaml** — Queue Phase 17 as READY
4. **Implement Phase 17** — Engine Read-DB foundation
5. **Test thoroughly** — PROD → Read-DB sync with 1,328 Pokemon
6. **Proceed sequentially** — Phase 18 → 19 → 20 → 21 → 22

---

**Document Owner:** Game Engine Systems  
**Status:** DESIGN PHASE → Ready for implementation planning  
**Next Action:** Review design, create Tasklist entries for Phase 17-22
