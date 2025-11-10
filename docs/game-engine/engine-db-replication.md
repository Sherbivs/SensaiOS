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

**Runtime Principle:** Game engine operates on **fast in-memory cache** (L1 cache layer). Read-DB/Write-DB synchronization happens **asynchronously** in background workers. Battles never block on disk I/O or replication.

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

## Runtime Architecture — Concurrent Operations with Cache Layer

### Overview: Three-Tier Cache Architecture

The game engine uses a **three-tier cache hierarchy** to achieve maximum performance while maintaining data consistency:

```
┌─────────────────────────────────────────────────────────────────┐
│                      GAME ENGINE LAYER                          │
│                   (Battle Calculations)                         │
│  Operations: calculateDamage, typeEffectiveness, moveValidation│
│  Latency: <1μs per lookup                                       │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ Synchronous reads (no await)
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                  L1 CACHE (In-Memory Map)                       │
│                   ENGINE_CACHE (Global)                         │
│  Storage: Map<number, PokemonData>                              │
│           Map<number, MoveData>                                 │
│           Map<string, number> (TypeChart)                       │
│  Size: ~10-20 MB                                                │
│  Lifetime: Process lifetime                                     │
│  Refresh: On startup + hourly background sync                   │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ Async refresh (background worker)
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│              L2 CACHE (Read-DB - SQLite on disk)                │
│                   /Store/engine-read.db                         │
│  Storage: SQLite tables (pokemon, moves, types, etc.)          │
│  Size: ~50-100 MB                                               │
│  Lifetime: Persistent across restarts                           │
│  Refresh: Daily sync from PROD (background)                     │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ Daily replication (cron job)
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                L3 CACHE (PROD PostgreSQL)                       │
│              Single Source of Truth                             │
│  Storage: PROD database (Species, Move, TypeChart)             │
│  Size: ~500 MB                                                  │
│  Lifetime: Permanent                                            │
│  Refresh: Never (source of truth)                               │
└─────────────────────────────────────────────────────────────────┘


                WRITE PATH (Async, Non-Blocking)

┌─────────────────────────────────────────────────────────────────┐
│                      GAME ENGINE LAYER                          │
│            logBattleOutcome(), logMoveUsage()                   │
│  Operations: Append battle logs to write buffer                 │
│  Latency: <10μs (in-memory queue push)                          │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ Async write (non-blocking)
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│              WRITE BUFFER (In-Memory Queue)                     │
│                   BATTLE_LOG_QUEUE                              │
│  Storage: Array<BattleLogEntry>                                 │
│  Size: ~1-5 MB (buffer 1000 battles)                            │
│  Lifetime: Flushed every 30 seconds                             │
│  Overflow: Block new battles if >10,000 queued                  │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ Periodic flush (30s interval)
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│          WRITE-DB WORKER (Background Process)                   │
│              Drains queue → SQLite inserts                      │
│  Operations: Batch INSERT into Write-DB                         │
│  Latency: 30s buffering + <100ms write                          │
│  Failure: Retry 3x, then persist to WAL                         │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ Hourly validation + upload
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│         INTEGRITY SCANNER + PROD UPLOADER                       │
│              Validates → Uploads verified data                  │
│  Operations: Validate rows → INSERT into PROD                   │
│  Latency: <60s per batch (1000s of rows)                        │
│  Failure: Quarantine invalid rows, continue                     │
└─────────────────────────────────────────────────────────────────┘
```

---

### L1 Cache Implementation (In-Memory Map)

**Purpose:** Provide **synchronous, microsecond-latency** access to Pokemon/Move/TypeChart data during battles.

**Design Principles:**
1. **No async/await** — Battle engine remains synchronous
2. **Process-scoped** — Shared across all battles in same process
3. **Read-only** — Never mutated after initialization
4. **Background refresh** — Updated hourly without blocking battles

**Implementation:**

```typescript
// src/services/engine-cache.ts

interface PokemonCacheEntry {
  id: number;
  name: string;
  types: number[];  // Type IDs, not slugs (faster lookup)
  abilities: Array<{ id: number; name: string; isHidden: boolean }>;
  baseStats: {
    hp: number;
    attack: number;
    defense: number;
    specialAttack: number;
    specialDefense: number;
    speed: number;
  };
  sprites: {
    default: string | null;
    shiny: string | null;
  };
}

interface MoveCacheEntry {
  id: number;
  name: string;
  typeId: number;
  typeName: string;
  power: number | null;
  accuracy: number | null;
  pp: number;
  priority: number;
  category: 'physical' | 'special' | 'status';
  meta: Record<string, unknown> | null;
}

interface TypeChartKey {
  atkTypeId: number;
  defTypeId: number;
}

class EngineCache {
  private pokemon: Map<number, PokemonCacheEntry> = new Map();
  private moves: Map<number, MoveCacheEntry> = new Map();
  private typeChart: Map<string, number> = new Map();  // Key: "atkTypeId:defTypeId"
  private lastRefreshAt: number = 0;
  private isInitialized: boolean = false;
  private refreshInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize cache from Read-DB (called once at startup).
   * BLOCKS until cache loaded - acceptable during startup.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    log.info('engine-cache: Initializing L1 cache from Read-DB...');
    const startTime = Date.now();

    try {
      // Load all data from Read-DB in parallel
      const [pokemonData, moveData, typeChartData] = await Promise.all([
        engineReadDb.getAllPokemon(),
        engineReadDb.getAllMoves(),
        engineReadDb.getAllTypeEffectiveness()
      ]);

      // Populate pokemon cache
      for (const p of pokemonData) {
        this.pokemon.set(p.id, {
          id: p.id,
          name: p.name,
          types: p.types.map(t => this.getTypeIdFromSlug(t)),
          abilities: p.abilities,
          baseStats: p.base_stats,
          sprites: p.sprites
        });
      }

      // Populate move cache
      for (const m of moveData) {
        this.moves.set(m.id, {
          id: m.id,
          name: m.name,
          typeId: m.type_id,
          typeName: m.type_name,
          power: m.power,
          accuracy: m.accuracy,
          pp: m.pp,
          priority: m.priority,
          category: m.category as 'physical' | 'special' | 'status',
          meta: m.meta
        });
      }

      // Populate type chart cache
      for (const tc of typeChartData) {
        const key = `${tc.atk_type_id}:${tc.def_type_id}`;
        this.typeChart.set(key, tc.multiplier);
      }

      this.lastRefreshAt = Date.now();
      this.isInitialized = true;

      const duration = Date.now() - startTime;
      log.info('engine-cache: L1 cache initialized', {
        duration,
        pokemonCount: this.pokemon.size,
        moveCount: this.moves.size,
        typeChartCount: this.typeChart.size,
        sizeBytes: this.estimateMemoryUsage()
      });

      // Start background refresh (hourly)
      this.startBackgroundRefresh();

    } catch (error) {
      log.error('engine-cache: Failed to initialize L1 cache', error);
      throw error;
    }
  }

  /**
   * Get Pokemon by ID (synchronous, <1μs).
   */
  getPokemon(id: number): PokemonCacheEntry | null {
    return this.pokemon.get(id) ?? null;
  }

  /**
   * Get Move by ID (synchronous, <1μs).
   */
  getMove(id: number): MoveCacheEntry | null {
    return this.moves.get(id) ?? null;
  }

  /**
   * Get type effectiveness multiplier (synchronous, <1μs).
   * Returns 1.0 if no entry found (neutral effectiveness).
   */
  getTypeEffectiveness(atkTypeId: number, defTypeId: number): number {
    const key = `${atkTypeId}:${defTypeId}`;
    return this.typeChart.get(key) ?? 1.0;
  }

  /**
   * Calculate total type effectiveness for multi-type defender.
   * Example: Electric (25) vs Water/Ground (11/5) = 2.0 * 0.0 = 0.0
   */
  calculateTypeEffectiveness(atkTypeId: number, defTypeIds: number[]): number {
    let multiplier = 1.0;
    for (const defTypeId of defTypeIds) {
      multiplier *= this.getTypeEffectiveness(atkTypeId, defTypeId);
    }
    return multiplier;
  }

  /**
   * Background refresh (non-blocking, runs every hour).
   */
  private startBackgroundRefresh(): void {
    const REFRESH_INTERVAL_MS = 60 * 60 * 1000;  // 1 hour

    this.refreshInterval = setInterval(async () => {
      try {
        log.info('engine-cache: Starting background refresh...');
        await this.refresh();
      } catch (error) {
        log.error('engine-cache: Background refresh failed', error);
        // Don't crash - keep using stale cache
      }
    }, REFRESH_INTERVAL_MS);
  }

  /**
   * Refresh cache from Read-DB (non-blocking for ongoing battles).
   * Uses double-buffering: build new cache, then swap atomically.
   */
  private async refresh(): Promise<void> {
    const startTime = Date.now();

    // Build new cache (don't modify existing yet)
    const newPokemon = new Map<number, PokemonCacheEntry>();
    const newMoves = new Map<number, MoveCacheEntry>();
    const newTypeChart = new Map<string, number>();

    try {
      const [pokemonData, moveData, typeChartData] = await Promise.all([
        engineReadDb.getAllPokemon(),
        engineReadDb.getAllMoves(),
        engineReadDb.getAllTypeEffectiveness()
      ]);

      // Populate new caches
      for (const p of pokemonData) {
        newPokemon.set(p.id, { /* ... */ });
      }
      for (const m of moveData) {
        newMoves.set(m.id, { /* ... */ });
      }
      for (const tc of typeChartData) {
        newTypeChart.set(`${tc.atk_type_id}:${tc.def_type_id}`, tc.multiplier);
      }

      // Atomic swap (ongoing battles see old cache until swap completes)
      this.pokemon = newPokemon;
      this.moves = newMoves;
      this.typeChart = newTypeChart;
      this.lastRefreshAt = Date.now();

      const duration = Date.now() - startTime;
      log.info('engine-cache: Background refresh complete', {
        duration,
        pokemonCount: this.pokemon.size,
        moveCount: this.moves.size,
        typeChartCount: this.typeChart.size
      });

    } catch (error) {
      log.error('engine-cache: Refresh failed, keeping stale cache', error);
      // Old cache still valid, battles continue
    }
  }

  /**
   * Estimate memory usage (for monitoring).
   */
  private estimateMemoryUsage(): number {
    // Rough estimate: each Pokemon ~1KB, Move ~500B, TypeChart ~20B
    const pokemonBytes = this.pokemon.size * 1024;
    const moveBytes = this.moves.size * 512;
    const typeChartBytes = this.typeChart.size * 20;
    return pokemonBytes + moveBytes + typeChartBytes;
  }

  /**
   * Graceful shutdown (called on SIGTERM/SIGINT).
   */
  shutdown(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    log.info('engine-cache: Shutdown complete');
  }

  // Helper: Type slug → ID mapping (cached separately)
  private typeSlugToId: Map<string, number> = new Map();
  
  private getTypeIdFromSlug(slug: string): number {
    // Lazy-load mapping from Read-DB
    if (!this.typeSlugToId.has(slug)) {
      const type = engineReadDb.getTypeBySlug(slug);
      if (type) {
        this.typeSlugToId.set(slug, type.id);
      }
    }
    return this.typeSlugToId.get(slug) ?? 0;
  }
}

// Global singleton
export const engineCache = new EngineCache();
```

---

### Write Buffer Implementation (In-Memory Queue)

**Purpose:** **Non-blocking battle logging**. Queue writes in memory, flush to disk in background.

**Design Principles:**
1. **Non-blocking** — `logBattle()` returns immediately (<10μs)
2. **Bounded queue** — Prevent memory exhaustion with size limits
3. **Durability** — Flush to disk every 30 seconds
4. **Backpressure** — Block new battles if queue overflows

**Implementation:**

```typescript
// src/services/engine-write-buffer.ts

interface BattleLogEntry {
  battle_id: string;
  trainer1_id: string;
  trainer2_id: string;
  winner: string;
  duration_ms: number;
  moves_used: number;
  turn_count: number;
  created_at: number;
}

interface MoveUsageEntry {
  battle_id: string;
  turn: number;
  pokemon_id: number;
  move_id: number;
  damage: number;
  effectiveness: number;
  critical: boolean;
  missed: boolean;
  created_at: number;
}

interface AnomalyEntry {
  battle_id: string;
  type: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  context: Record<string, unknown> | null;
  created_at: number;
}

class EngineWriteBuffer {
  private battleLogQueue: BattleLogEntry[] = [];
  private moveUsageQueue: MoveUsageEntry[] = [];
  private anomalyQueue: AnomalyEntry[] = [];

  private readonly MAX_QUEUE_SIZE = 10000;  // Block new battles if exceeded
  private readonly FLUSH_INTERVAL_MS = 30000;  // 30 seconds

  private flushInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  /**
   * Start periodic flushing (called once at startup).
   */
  start(): void {
    this.flushInterval = setInterval(async () => {
      await this.flush();
    }, this.FLUSH_INTERVAL_MS);

    log.info('engine-write-buffer: Started with 30s flush interval');
  }

  /**
   * Log battle outcome (non-blocking, <10μs).
   */
  logBattle(entry: BattleLogEntry): void {
    if (this.isShuttingDown) {
      throw new Error('Write buffer is shutting down, rejecting new writes');
    }

    if (this.battleLogQueue.length >= this.MAX_QUEUE_SIZE) {
      throw new Error(`Battle log queue full (${this.MAX_QUEUE_SIZE} entries)`);
    }

    this.battleLogQueue.push(entry);
  }

  /**
   * Log move usage (non-blocking, <10μs).
   */
  logMoveUsage(entry: MoveUsageEntry): void {
    if (this.isShuttingDown) {
      throw new Error('Write buffer is shutting down, rejecting new writes');
    }

    if (this.moveUsageQueue.length >= this.MAX_QUEUE_SIZE) {
      throw new Error(`Move usage queue full (${this.MAX_QUEUE_SIZE} entries)`);
    }

    this.moveUsageQueue.push(entry);
  }

  /**
   * Log anomaly (non-blocking, <10μs).
   */
  logAnomaly(entry: AnomalyEntry): void {
    if (this.isShuttingDown) {
      throw new Error('Write buffer is shutting down, rejecting new writes');
    }

    if (this.anomalyQueue.length >= this.MAX_QUEUE_SIZE) {
      throw new Error(`Anomaly queue full (${this.MAX_QUEUE_SIZE} entries)`);
    }

    this.anomalyQueue.push(entry);
  }

  /**
   * Flush queues to Write-DB (async, runs in background).
   */
  private async flush(): Promise<void> {
    // Snapshot queue sizes (atomic read)
    const battleLogCount = this.battleLogQueue.length;
    const moveUsageCount = this.moveUsageQueue.length;
    const anomalyCount = this.anomalyQueue.length;

    if (battleLogCount === 0 && moveUsageCount === 0 && anomalyCount === 0) {
      return;  // Nothing to flush
    }

    log.info('engine-write-buffer: Flushing queues...', {
      battleLogCount,
      moveUsageCount,
      anomalyCount
    });

    const startTime = Date.now();

    try {
      // Drain queues (move to local variables)
      const battleLogsToFlush = this.battleLogQueue.splice(0);
      const moveUsageToFlush = this.moveUsageQueue.splice(0);
      const anomaliesToFlush = this.anomalyQueue.splice(0);

      // Write to Write-DB in parallel
      await Promise.all([
        engineWriteDb.batchInsertBattleLogs(battleLogsToFlush),
        engineWriteDb.batchInsertMoveUsage(moveUsageToFlush),
        engineWriteDb.batchInsertAnomalies(anomaliesToFlush)
      ]);

      const duration = Date.now() - startTime;
      log.info('engine-write-buffer: Flush complete', {
        duration,
        battleLogsFlushed: battleLogsToFlush.length,
        moveUsageFlushed: moveUsageToFlush.length,
        anomaliesFlushed: anomaliesToFlush.length
      });

    } catch (error) {
      log.error('engine-write-buffer: Flush failed', error);
      // Data lost - should we restore to queue? (risk: memory exhaustion)
      // Decision: Log error, discard batch (WAL will recover)
    }
  }

  /**
   * Get current queue sizes (for monitoring).
   */
  getStats(): {
    battleLogQueueSize: number;
    moveUsageQueueSize: number;
    anomalyQueueSize: number;
    maxQueueSize: number;
    utilizationPercent: number;
  } {
    const totalQueued = this.battleLogQueue.length + this.moveUsageQueue.length + this.anomalyQueue.length;
    const maxTotal = this.MAX_QUEUE_SIZE * 3;
    
    return {
      battleLogQueueSize: this.battleLogQueue.length,
      moveUsageQueueSize: this.moveUsageQueue.length,
      anomalyQueueSize: this.anomalyQueue.length,
      maxQueueSize: this.MAX_QUEUE_SIZE,
      utilizationPercent: (totalQueued / maxTotal) * 100
    };
  }

  /**
   * Graceful shutdown (called on SIGTERM/SIGINT).
   */
  async shutdown(): Promise<void> {
    log.info('engine-write-buffer: Shutting down, flushing pending writes...');
    
    this.isShuttingDown = true;

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Final flush before exit
    await this.flush();

    log.info('engine-write-buffer: Shutdown complete');
  }
}

// Global singleton
export const engineWriteBuffer = new EngineWriteBuffer();
```

---

### Battle Engine Integration (Synchronous with Async Logging)

**Battle flow:** Read from L1 cache (sync) → Calculate damage (sync) → Log to buffer (sync) → Return result (sync)

**No blocking** — Battle execution never awaits disk I/O or database writes.

```typescript
// src/core/battle/engine-integration.ts

import { engineCache } from '../../services/engine-cache.js';
import { engineWriteBuffer } from '../../services/engine-write-buffer.js';

/**
 * Calculate damage using L1 cache (synchronous, <1μs).
 */
export function calculateDamage(
  attackerId: number,
  defenderId: number,
  moveId: number,
  context: BattleContext
): DamageResult {
  // L1 cache lookups (synchronous)
  const attacker = engineCache.getPokemon(attackerId);
  const defender = engineCache.getPokemon(defenderId);
  const move = engineCache.getMove(moveId);

  if (!attacker || !defender || !move) {
    throw new Error(`Cache miss: attacker=${attackerId}, defender=${defenderId}, move=${moveId}`);
  }

  // Type effectiveness (synchronous)
  const effectiveness = engineCache.calculateTypeEffectiveness(
    move.typeId,
    defender.types
  );

  // STAB bonus
  const stab = attacker.types.includes(move.typeId) ? 1.5 : 1.0;

  // Base damage calculation (simplified)
  const baseDamage = move.power
    ? Math.floor(
        ((2 * attacker.baseStats.attack * move.power) / defender.baseStats.defense / 50) + 2
      )
    : 0;

  const finalDamage = Math.floor(baseDamage * effectiveness * stab);

  // Determine if critical hit
  const isCritical = Math.random() < 0.0625;  // 1/16 chance
  const damageWithCrit = isCritical ? Math.floor(finalDamage * 1.5) : finalDamage;

  // Determine if missed
  const hitChance = move.accuracy ?? 100;
  const missed = Math.random() * 100 > hitChance;

  const actualDamage = missed ? 0 : damageWithCrit;

  // Log to write buffer (synchronous push, <10μs)
  engineWriteBuffer.logMoveUsage({
    battle_id: context.battleId,
    turn: context.currentTurn,
    pokemon_id: attackerId,
    move_id: moveId,
    damage: actualDamage,
    effectiveness,
    critical: isCritical,
    missed,
    created_at: Date.now()
  });

  // Detect anomalies
  if (actualDamage < 0) {
    engineWriteBuffer.logAnomaly({
      battle_id: context.battleId,
      type: 'NEGATIVE_DAMAGE',
      description: `Damage calculation resulted in ${actualDamage}`,
      severity: 'HIGH',
      context: { attackerId, defenderId, moveId, baseDamage, effectiveness, stab },
      created_at: Date.now()
    });
  }

  return {
    damage: actualDamage,
    effectiveness,
    stab,
    isCritical,
    missed
  };
}

/**
 * Complete battle and log outcome.
 */
export function completeBattle(battle: Battle): void {
  engineWriteBuffer.logBattle({
    battle_id: battle.id,
    trainer1_id: battle.trainer1.id,
    trainer2_id: battle.trainer2.id,
    winner: battle.winner.id,
    duration_ms: Date.now() - battle.startedAt,
    moves_used: battle.moveHistory.length,
    turn_count: battle.currentTurn,
    created_at: Date.now()
  });
}
```

---

### Worker Architecture — Concurrent Background Tasks

The system runs **4 independent background workers** that operate concurrently:

```typescript
// src/workers/engine-workers.ts

/**
 * Worker 1: L1 Cache Refresher
 * Frequency: Every 1 hour
 * Purpose: Keep in-memory cache up-to-date with Read-DB
 * Blocks: Never (double-buffering)
 */
class CacheRefreshWorker {
  private interval: NodeJS.Timeout | null = null;

  start(): void {
    this.interval = setInterval(async () => {
      try {
        await engineCache.refresh();
      } catch (error) {
        log.error('cache-refresh-worker: Failed', error);
      }
    }, 60 * 60 * 1000);  // 1 hour
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
  }
}

/**
 * Worker 2: Write Buffer Flusher
 * Frequency: Every 30 seconds
 * Purpose: Drain in-memory queues to Write-DB
 * Blocks: Never (async flush)
 */
class WriteBufferFlusher {
  private interval: NodeJS.Timeout | null = null;

  start(): void {
    this.interval = setInterval(async () => {
      try {
        await engineWriteBuffer.flush();
      } catch (error) {
        log.error('write-buffer-flusher: Failed', error);
      }
    }, 30 * 1000);  // 30 seconds
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
  }
}

/**
 * Worker 3: Read-DB Sync (from PROD)
 * Frequency: Every 24 hours (daily at 3 AM)
 * Purpose: Sync static data from PROD → Read-DB
 * Blocks: Never (separate process/cron)
 */
class ReadDbSyncWorker {
  async run(): Promise<void> {
    try {
      await syncProdToReadDb();
      // After sync, refresh L1 cache
      await engineCache.refresh();
    } catch (error) {
      log.error('read-db-sync-worker: Failed', error);
    }
  }
}

/**
 * Worker 4: Write-DB Validator + Uploader
 * Frequency: Every 10 minutes
 * Purpose: Validate Write-DB rows → Upload to PROD
 * Blocks: Never (separate process/worker)
 */
class WriteDbValidatorWorker {
  private interval: NodeJS.Timeout | null = null;

  start(): void {
    this.interval = setInterval(async () => {
      try {
        // Step 1: Validate new rows
        const validationReport = await validateWriteDb();
        
        // Step 2: Upload verified rows to PROD
        if (validationReport.qualityScore >= 0.95) {
          await syncWriteDbToProd();
        } else {
          log.warn('write-db-validator: Quality too low, skipping upload', {
            qualityScore: validationReport.qualityScore
          });
        }
      } catch (error) {
        log.error('write-db-validator-worker: Failed', error);
      }
    }, 10 * 60 * 1000);  // 10 minutes
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
  }
}

// Orchestrator: Start all workers
export function startEngineWorkers(): void {
  const cacheRefreshWorker = new CacheRefreshWorker();
  const writeBufferFlusher = new WriteBufferFlusher();
  const writeDbValidatorWorker = new WriteDbValidatorWorker();

  cacheRefreshWorker.start();
  writeBufferFlusher.start();
  writeDbValidatorWorker.start();

  log.info('engine-workers: All workers started');

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    log.info('engine-workers: Shutting down...');
    
    cacheRefreshWorker.stop();
    writeBufferFlusher.stop();
    writeDbValidatorWorker.stop();

    await engineWriteBuffer.shutdown();
    engineCache.shutdown();

    process.exit(0);
  });
}
```

---

### Concurrency Guarantees

| Component | Thread Safety | Blocking | Max Latency |
|-----------|---------------|----------|-------------|
| **L1 Cache (Read)** | ✅ Read-only after init | ❌ Never blocks | <1μs |
| **L1 Cache (Refresh)** | ✅ Double-buffering | ❌ Non-blocking | N/A (background) |
| **Write Buffer (Push)** | ✅ Synchronous push | ❌ Never blocks | <10μs |
| **Write Buffer (Flush)** | ✅ Atomic splice | ❌ Non-blocking | N/A (background) |
| **Read-DB Sync** | ⚠️ Exclusive lock during write | ❌ Separate process | N/A (cron) |
| **Write-DB Insert** | ⚠️ SQLite SERIALIZED mode | ⚠️ Blocks flush worker | <100ms |
| **Integrity Scanner** | ⚠️ Reads Write-DB | ❌ Separate worker | N/A (10-minute intervals) |
| **PROD Upload** | ✅ PostgreSQL handles concurrency | ❌ Separate worker | N/A (10-minute intervals) |

**Critical Insight:** Battle execution operates entirely on **L1 cache + write buffer**, both of which are **lock-free and non-blocking**. All disk I/O happens in **separate background workers** that never interfere with gameplay.

---

### Memory Management

**Total Memory Usage:**

| Component | Size | Lifetime | Growth Rate |
|-----------|------|----------|-------------|
| L1 Cache (Pokemon) | ~10 MB | Process | Static (1,328 Pokemon) |
| L1 Cache (Moves) | ~5 MB | Process | Static (~800 moves) |
| L1 Cache (TypeChart) | ~10 KB | Process | Static (18×18 = 324 entries) |
| Write Buffer (Battle Logs) | ~1-5 MB | 30s | 100 battles/min = ~1 MB/30s |
| Write Buffer (Move Usage) | ~5-10 MB | 30s | ~5 KB/battle × 100/min = ~8 MB/30s |
| Write Buffer (Anomalies) | <1 MB | 30s | Rare events |
| **TOTAL** | **~20-30 MB** | - | **~10 MB/30s** (flushed) |

**Backpressure Mechanism:**

If write buffer grows to 10,000 entries, **new battles are rejected**:

```typescript
if (engineWriteBuffer.getStats().utilizationPercent > 95) {
  throw new Error('System overloaded: write buffer full. Try again later.');
}
```

**Alert Thresholds:**
- ⚠️ **75% utilization** → Log warning, monitor closely
- 🚨 **90% utilization** → Alert operators, consider scaling
- 🛑 **95% utilization** → Reject new battles, flush emergency

---

### Startup Sequence (Blocking Initialization)

The system follows a **strict startup order** to ensure cache consistency before accepting battles:

```typescript
// src/index.ts (main entry point)

async function startGameEngine() {
  log.info('game-engine: Starting initialization sequence...');
  
  try {
    // STEP 1: Initialize Read-DB (ensure file exists, create if needed)
    log.info('game-engine: [1/5] Initializing Read-DB...');
    await engineReadDb.initialize();
    
    // STEP 2: Load L1 cache from Read-DB (BLOCKS until complete)
    log.info('game-engine: [2/5] Loading L1 cache...');
    await engineCache.initialize();  // ~100-200ms
    
    // STEP 3: Initialize Write-DB (ensure file + WAL exist)
    log.info('game-engine: [3/5] Initializing Write-DB...');
    await engineWriteDb.initialize();
    
    // STEP 4: Replay WAL if process crashed last time
    log.info('game-engine: [4/5] Replaying Write-Ahead Log...');
    await engineWriteDb.replayWAL();
    
    // STEP 5: Start background workers (non-blocking)
    log.info('game-engine: [5/5] Starting background workers...');
    engineWriteBuffer.start();
    startEngineWorkers();
    
    log.info('game-engine: Initialization complete, ready to accept battles');
    
    // Mark ready for traffic (health check endpoint returns 200)
    global.engineReady = true;
    
  } catch (error) {
    log.error('game-engine: Initialization failed', error);
    process.exit(1);  // Hard fail - cannot operate without cache
  }
}

// Health check endpoint (for Render health checks)
app.get('/health', (req, res) => {
  if (!global.engineReady) {
    return res.status(503).json({ status: 'initializing' });
  }
  
  const cacheStats = engineCache.getStats();
  const bufferStats = engineWriteBuffer.getStats();
  
  // Fail health check if system overloaded
  if (bufferStats.utilizationPercent > 95) {
    return res.status(503).json({ 
      status: 'overloaded', 
      reason: 'Write buffer full',
      utilizationPercent: bufferStats.utilizationPercent
    });
  }
  
  res.status(200).json({ 
    status: 'healthy',
    cache: cacheStats,
    buffer: bufferStats
  });
});
```

**Startup Time:** ~200-300ms total
- Read-DB open: <10ms
- L1 cache load: ~100-200ms (depends on 1,328 Pokemon)
- Write-DB open + WAL replay: <50ms
- Worker startup: <10ms

**Critical:** Battles **cannot start** until L1 cache fully loaded. Render health checks fail until `engineReady = true`.

---

### Shutdown Sequence (Graceful Termination)

The system ensures **zero data loss** during graceful shutdown:

```typescript
// Graceful shutdown handler
process.on('SIGTERM', async () => {
  log.info('game-engine: SIGTERM received, starting graceful shutdown...');
  
  // STEP 1: Stop accepting new battles
  global.engineReady = false;
  log.info('game-engine: [1/6] Stopped accepting new battles');
  
  // STEP 2: Stop background workers (prevent new work)
  stopEngineWorkers();
  log.info('game-engine: [2/6] Stopped background workers');
  
  // STEP 3: Flush write buffer (drain queues)
  await engineWriteBuffer.shutdown();
  log.info('game-engine: [3/6] Flushed write buffer');
  
  // STEP 4: Save Write-DB to disk
  await engineWriteDb.saveToFile();
  log.info('game-engine: [4/6] Saved Write-DB');
  
  // STEP 5: Close database connections
  await engineReadDb.close();
  await engineWriteDb.close();
  log.info('game-engine: [5/6] Closed database connections');
  
  // STEP 6: Shutdown cache (cleanup interval timers)
  engineCache.shutdown();
  log.info('game-engine: [6/6] Shutdown complete');
  
  process.exit(0);
});

// Emergency shutdown (uncaught exception)
process.on('uncaughtException', async (error) => {
  log.error('game-engine: Uncaught exception, emergency shutdown', error);
  
  try {
    // Best-effort save (may fail if system corrupted)
    await engineWriteBuffer.flush();
    await engineWriteDb.saveToFile();
    log.info('game-engine: Emergency save succeeded');
  } catch (saveError) {
    log.error('game-engine: Emergency save failed', saveError);
    // WAL will recover on next startup
  }
  
  process.exit(1);
});
```

**Shutdown Time:** ~500-1000ms total
- Stop accepting battles: <1ms
- Stop workers: <10ms
- Flush write buffer: ~100-500ms (depends on queue size)
- Save Write-DB: ~100-200ms (depends on size)
- Close connections: <10ms

**Data Loss Guarantee:** 
- **Graceful shutdown (SIGTERM):** 0 data loss
- **Crash (SIGKILL):** <30 seconds data loss (last auto-save to WAL)
- **OOM/Panic:** WAL replay recovers last 30 seconds

---

### Concurrency Model: Event Loop + Worker Threads

The system uses **Node.js event loop** for main process + **Worker Threads** for heavy background tasks:

```typescript
// src/workers/engine-workers.ts

import { Worker } from 'node:worker_threads';

/**
 * Heavy validation work runs in separate thread to avoid blocking event loop.
 */
class WriteDbValidatorWorker {
  private worker: Worker | null = null;

  start(): void {
    this.worker = new Worker('./dist/workers/validator-thread.js');
    
    this.worker.on('message', (result) => {
      if (result.type === 'VALIDATION_COMPLETE') {
        log.info('validator-thread: Validation complete', result.stats);
      }
    });
    
    this.worker.on('error', (error) => {
      log.error('validator-thread: Worker error', error);
      // Restart worker
      this.stop();
      this.start();
    });
    
    // Send validation request every 10 minutes
    setInterval(() => {
      this.worker?.postMessage({ type: 'START_VALIDATION' });
    }, 10 * 60 * 1000);
  }

  stop(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

// dist/workers/validator-thread.js
import { parentPort } from 'node:worker_threads';

parentPort?.on('message', async (message) => {
  if (message.type === 'START_VALIDATION') {
    try {
      const report = await validateWriteDb();
      
      parentPort?.postMessage({
        type: 'VALIDATION_COMPLETE',
        stats: {
          totalRows: report.totalRows,
          passedRows: report.passedRows,
          qualityScore: report.qualityScore
        }
      });
      
    } catch (error) {
      parentPort?.postMessage({
        type: 'VALIDATION_ERROR',
        error: error.message
      });
    }
  }
});
```

**Concurrency Strategy:**

| Task | Execution Model | Why |
|------|----------------|-----|
| **Battle calculations** | Main event loop | Synchronous (cache lookups), <1ms per battle |
| **Write buffer flush** | Main event loop (async) | I/O-bound, doesn't block battles |
| **Read-DB sync** | Separate process (cron) | Runs daily, long-running (1-2 minutes) |
| **Write-DB validation** | Worker Thread | CPU-bound (1000s of validations), blocks event loop |
| **PROD upload** | Main event loop (async) | I/O-bound (network), PostgreSQL handles concurrency |

**Key Insight:** Battle execution uses **zero async/await** (synchronous cache access). Only logging and background sync use async operations, which never block battles.

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

## Critical Issues Analysis & Mitigation

### Issue 1: sql.js File Path Conflicts with Read/Write Split

**Problem:** Current `engine-db.ts` uses hardcoded path `/Store/engine.db` which conflicts with proposed `/Store/engine-read.db` and `/Store/engine-write.db` split.

**Impact:** HIGH - Existing code will fail when Read/Write split implemented.

**Root Cause:**
```typescript
// Current (engine-db.ts line 34)
const ENGINE_DB_PATH = process.env.RENDER 
  ? '/Store/engine.db'
  : path.join(process.cwd(), 'Store', 'engine.db');
```

**Solution:**
1. **Phase 17 Implementation:** Rename `engine-db.ts` to `engine-db-read.ts`, update path to `/Store/engine-read.db`
2. **Deprecation Strategy:** Keep `engine-db.ts` as compatibility wrapper redirecting to `engine-db-read.ts` until Phase 21 integration complete
3. **Migration Path:**
   ```typescript
   // engine-db-read.ts (new)
   const ENGINE_READ_DB_PATH = process.env.RENDER 
     ? '/Store/engine-read.db'
     : path.join(process.cwd(), 'Store', 'engine-read.db');
   
   // engine-db.ts (deprecated wrapper)
   export * from './engine-db-read.js';
   export { initialize as initializeEngineDb } from './engine-db-read.js';
   ```

**Validation:** Run `npm run build` after refactor, verify no import errors.

---

### Issue 2: sql.js In-Memory Operation Creates Data Loss Risk

**Problem:** sql.js operates entirely in-memory. If `saveToFile()` fails or process crashes before save, **all Write-DB data lost**.

**Impact:** CRITICAL - Battle logs, anomalies, metrics permanently lost during crashes.

**Scenarios:**
1. **OOM crash** during heavy battle load → Write-DB not persisted → data loss
2. **SIGKILL** (immediate termination) → no graceful shutdown → data loss
3. **Disk full** during `saveToFile()` → write fails silently → data loss

**Current Mitigation (Insufficient):**
```typescript
// Only saves on explicit calls, not automatic
await saveToFile();
```

**Enhanced Solution:**

**A. Auto-Save Interval (Write-DB only)**
```typescript
let autoSaveInterval: NodeJS.Timeout | null = null;

function startAutoSave(intervalMs: number = 30000) {
  autoSaveInterval = setInterval(async () => {
    try {
      await saveToFile();
      log.info('engine-write-db: Auto-save completed', { 
        timestamp: Date.now(),
        sizeBytes: db.export().byteLength 
      });
    } catch (error) {
      log.error('engine-write-db: Auto-save failed', error);
      // Continue running - don't crash on save failure
    }
  }, intervalMs);
}

function stopAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
}
```

**B. Write-Ahead Logging (WAL) Simulation**
```typescript
// Append-only log file for write operations
const WAL_PATH = process.env.RENDER 
  ? '/Store/engine-write.wal'
  : path.join(process.cwd(), 'Store', 'engine-write.wal');

async function appendToWAL(operation: string, data: unknown) {
  const entry = {
    timestamp: Date.now(),
    operation,
    data,
    checksum: crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex')
  };
  
  await fsPromises.appendFile(WAL_PATH, JSON.stringify(entry) + '\n');
}

async function replayWAL() {
  try {
    const walContent = await fsPromises.readFile(WAL_PATH, 'utf-8');
    const entries = walContent.trim().split('\n').map(line => JSON.parse(line));
    
    for (const entry of entries) {
      // Verify checksum
      const actualChecksum = crypto.createHash('sha256')
        .update(JSON.stringify(entry.data))
        .digest('hex');
      
      if (actualChecksum !== entry.checksum) {
        log.warn('engine-write-db: WAL entry checksum mismatch, skipping', { entry });
        continue;
      }
      
      // Replay operation
      switch (entry.operation) {
        case 'INSERT_BATTLE_LOG':
          await insertBattleLog(entry.data);
          break;
        case 'INSERT_MOVE_USAGE':
          await insertMoveUsage(entry.data);
          break;
        // ... other operations
      }
    }
    
    // Clear WAL after successful replay
    await fsPromises.unlink(WAL_PATH);
    
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log.error('engine-write-db: WAL replay failed', error);
    }
  }
}
```

**C. Graceful Shutdown Handlers**
```typescript
process.on('SIGTERM', async () => {
  log.info('engine-write-db: SIGTERM received, saving database...');
  stopAutoSave();
  await saveToFile();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log.info('engine-write-db: SIGINT received, saving database...');
  stopAutoSave();
  await saveToFile();
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  log.error('engine-write-db: Uncaught exception, attempting emergency save', error);
  try {
    await saveToFile();
  } catch (saveError) {
    log.error('engine-write-db: Emergency save failed', saveError);
  }
  process.exit(1);
});
```

**Recommendation:** Implement all three (Auto-Save + WAL + Graceful Shutdown) for Write-DB. Read-DB can skip WAL since it's synced from PROD.

---

### Issue 3: Type Effectiveness Lookups Require TypeChart Migration

**Problem:** Design assumes `type_effectiveness` table in Read-DB, but current battle engine uses `matchups` JSON field on Pokemon objects.

**Impact:** HIGH - Battle engine integration (Phase 21) blocked until type lookups unified.

**Current Implementation:**
```javascript
// src/engine/calc.js line 55
function typeEffectiveness(defender, move) {
  const m = defender.matchups?.[move.type];
  return m === 0 || m === 0.25 || m === 0.5 || m === 1 || m === 2 || m === 4 ? m : 1;
}
```

**Prisma Schema:**
```prisma
model TypeChart {
  atkTypeId Int @db.SmallInt
  defTypeId Int @db.SmallInt
  mult      Int @db.SmallInt  // Stored as integer (0, 25, 50, 100, 200, 400)
  
  atkType Type @relation("AtkType", fields: [atkTypeId], references: [id])
  defType Type @relation("DefType", fields: [defTypeId], references: [id])
  
  @@id([atkTypeId, defTypeId])
  @@index([defTypeId])
}
```

**Solution:**

**Phase 17 Extension:** Add TypeChart sync to Read-DB
```typescript
async function syncTypeChartToReadDb() {
  const typeChartData = await prisma.typeChart.findMany({
    include: { atkType: true, defType: true }
  });
  
  for (const entry of typeChartData) {
    db.run(`
      INSERT OR REPLACE INTO type_effectiveness 
        (atk_type_id, def_type_id, multiplier, indexed_at)
      VALUES (?, ?, ?, ?)
    `, [
      entry.atkTypeId,
      entry.defTypeId,
      entry.mult / 100.0,  // Convert 100 → 1.0, 200 → 2.0, etc.
      Date.now()
    ]);
  }
}
```

**Phase 21 Refactor:** Update battle engine to query Read-DB
```typescript
// NEW: src/core/battle/type-lookup.ts
import { engineReadDb } from '../../services/engine-db-read.js';

export async function getTypeEffectiveness(
  atkTypeId: number, 
  defTypeIds: number[]
): Promise<number> {
  let multiplier = 1.0;
  
  for (const defTypeId of defTypeIds) {
    const result = await engineReadDb.getTypeEffectiveness(atkTypeId, defTypeId);
    multiplier *= result;
  }
  
  return multiplier;
}

// UPDATE: src/engine/calc.js
async function typeEffectiveness(defender, move) {
  // NEW: Use Read-DB lookup
  const defenderTypeIds = defender.types.map(t => getTypeId(t));
  const moveTypeId = getTypeId(move.type);
  
  return await getTypeEffectiveness(moveTypeId, defenderTypeIds);
}
```

**Compatibility Layer (Transitional):**
```typescript
// Keep matchups field populated during migration
function buildMatchupsCache(pokemon: Pokemon): Record<string, number> {
  const matchups: Record<string, number> = {};
  
  for (const atkType of ALL_TYPES) {
    const multiplier = await getTypeEffectiveness(atkType.id, pokemon.types);
    matchups[atkType.slug] = multiplier;
  }
  
  return matchups;
}
```

---

### Issue 4: Battle Engine Async Conversion Required

**Problem:** Current battle engine is **synchronous** (`calc.js`), but Read-DB lookups are **async** (sql.js API).

**Impact:** CRITICAL - Phase 21 requires converting entire battle engine to async/await, massive refactor.

**Current Signature:**
```javascript
// src/engine/calc.js
function typeEffectiveness(defender, move) {
  const m = defender.matchups?.[move.type];
  return m;
}

// Synchronous battle flow
const damage = baseDamage(attacker, defender, move);
const effectiveness = typeEffectiveness(defender, move);
const finalDamage = damage * effectiveness * stab(attacker, move);
```

**Required Signature:**
```typescript
// NEW: async battle engine
async function typeEffectiveness(defender, move) {
  const m = await engineReadDb.getTypeEffectiveness(move.typeId, defender.types);
  return m;
}

// Async battle flow
const damage = await baseDamage(attacker, defender, move);
const effectiveness = await typeEffectiveness(defender, move);
const finalDamage = damage * effectiveness * await stab(attacker, move);
```

**Solution:**

**Option A: Pre-Load All Data (Recommended)**
```typescript
// Load entire Read-DB into memory cache at startup
const ENGINE_CACHE = {
  pokemon: new Map<number, PokemonData>(),
  moves: new Map<number, MoveData>(),
  typeChart: new Map<string, number>() // Key: "atkTypeId:defTypeId"
};

async function preloadEngineCache() {
  const allPokemon = await engineReadDb.getAllPokemon();
  const allMoves = await engineReadDb.getAllMoves();
  const allTypeChart = await engineReadDb.getAllTypeEffectiveness();
  
  for (const p of allPokemon) ENGINE_CACHE.pokemon.set(p.id, p);
  for (const m of allMoves) ENGINE_CACHE.moves.set(m.id, m);
  for (const t of allTypeChart) ENGINE_CACHE.typeChart.set(`${t.atkTypeId}:${t.defTypeId}`, t.multiplier);
}

// Battle engine remains synchronous
function typeEffectiveness(defender, move) {
  let mult = 1.0;
  for (const defTypeId of defender.types) {
    const key = `${move.typeId}:${defTypeId}`;
    mult *= ENGINE_CACHE.typeChart.get(key) ?? 1.0;
  }
  return mult;
}
```

**Option B: Async Conversion (Fallback)**
```typescript
// Convert battle engine to async - LARGE REFACTOR
export async function executeTurn(battle: Battle, action: Action): Promise<TurnResult> {
  const attacker = action.pokemon;
  const defender = action.target;
  const move = await engineReadDb.getMoveById(action.moveId);
  
  const damage = await calculateDamage(attacker, defender, move);
  const effectiveness = await typeEffectiveness(defender, move);
  
  // ... rest of turn logic
}

// All callers must await
const result = await executeTurn(battle, action);
```

**Recommendation:** **Option A (Pre-Load)** for Phase 17-20. Keep battle engine synchronous, load entire Read-DB into memory at startup. Only ~10MB for 1,328 Pokemon + moves + type chart. Revisit async conversion in Phase 23+ if memory becomes issue.

---

### Issue 5: Integrity Scanner Performance Bottleneck

**Problem:** Design requires validating **every row** in Write-DB every 10 minutes. With 1000s of battles/hour, validation becomes CPU-bound.

**Impact:** MEDIUM - Validation worker may fall behind during peak load.

**Worst Case Scenario:**
- 100 battles/minute = 6000 battles/hour
- Each battle = 1 battle_log + ~50 move_usage + ~5 anomalies = 56 rows
- 6000 * 56 = 336,000 rows/hour
- Validation at 10-minute intervals = 56,000 rows per run
- Assuming 10ms per validation = 560 seconds = **9.3 minutes**

**Current Design:**
```typescript
// Validates ALL unvalidated rows sequentially
for (const log of battleLogs) {
  const validationResults = await Promise.all(
    VALIDATION_RULES.map(rule => rule.check(log))
  );
  // ...
}
```

**Solutions:**

**A. Incremental Validation (Recommended)**
```typescript
// Only validate rows created since last run
const lastValidatedAt = await getLastValidationTimestamp();

const newBattleLogs = await engineWriteDb.query(`
  SELECT * FROM battle_logs 
  WHERE created_at > ? AND validation_status = 'PENDING'
`, [lastValidatedAt]);

// Validation workload = rows created in last 10 minutes, not all pending rows
```

**B. Parallel Validation Workers**
```typescript
// Split validation across multiple workers
const VALIDATION_WORKERS = 4;
const rowsPerWorker = Math.ceil(newBattleLogs.length / VALIDATION_WORKERS);

const validationPromises = [];
for (let i = 0; i < VALIDATION_WORKERS; i++) {
  const batch = newBattleLogs.slice(i * rowsPerWorker, (i + 1) * rowsPerWorker);
  validationPromises.push(validateBatch(batch));
}

await Promise.all(validationPromises);
```

**C. Sampling for Expensive Checks**
```typescript
// Skip expensive logic validation for 90% of rows
{
  name: 'move_usage_effectiveness_matches',
  check: async (row) => {
    // Only validate 10% of rows (random sampling)
    if (Math.random() > 0.1) {
      return { passed: true, message: 'SKIPPED (sampling)' };
    }
    
    // Expensive FK lookups + calculation
    const move = await engineReadDb.getMoveById(row.move_id);
    const expected = await engineReadDb.getTypeEffectiveness(move.typeId, pokemon.types);
    // ...
  }
}
```

**D. Batch Database Queries**
```typescript
// Instead of: N queries for N rows
for (const row of rows) {
  const pokemon = await engineReadDb.getPokemonById(row.pokemon_id);
}

// Do: 1 query for all unique pokemon_ids
const uniquePokemonIds = [...new Set(rows.map(r => r.pokemon_id))];
const pokemonMap = await engineReadDb.getPokemonByIds(uniquePokemonIds);

for (const row of rows) {
  const pokemon = pokemonMap.get(row.pokemon_id);
}
```

**Recommendation:** Implement **all four optimizations**. Incremental + Parallel + Sampling + Batch queries should keep validation under 60 seconds even at 100 battles/minute.

---

### Issue 6: Write-DB Size Growth Without Pruning

**Problem:** Design mentions "7-day retention" but doesn't specify **automated pruning** schedule or disk space monitoring.

**Impact:** HIGH - Write-DB grows unbounded, eventually fills 2GB disk, crashes service.

**Calculation:**
- 100 battles/minute * 60 minutes * 24 hours = 144,000 battles/day
- 144,000 * 56 rows = 8,064,000 rows/day
- Assuming 200 bytes/row = 1.6 GB/day
- **2GB disk fills in ~30 hours without pruning**

**Current Design (Incomplete):**
```typescript
// Stage 6: Prune uploaded rows (retention: 7 days)
result.stage = 'PRUNE';
const pruneDate = Date.now() - (7 * 24 * 60 * 60 * 1000);
await engineWriteDb.pruneUploadedRows(pruneDate);
```

**Enhanced Solution:**

**A. Automated Pruning Cron**
```yaml
# render.yaml
- type: cron
  name: engine-write-db-pruner
  schedule: "0 */6 * * *"  # Every 6 hours
  startCommand: npm run engine:prune-write-db
```

**B. Disk Space Monitoring**
```typescript
async function checkDiskSpace(): Promise<DiskSpaceStats> {
  const stats = await fsPromises.stat(ENGINE_WRITE_DB_PATH);
  const totalSpace = 2 * 1024 * 1024 * 1024; // 2GB
  const usedSpace = stats.size;
  const freeSpace = totalSpace - usedSpace;
  
  const usagePercent = (usedSpace / totalSpace) * 100;
  
  if (usagePercent > 90) {
    log.error('engine-write-db: Disk space critical', { usagePercent, usedSpace, freeSpace });
    // Emergency prune: Delete oldest 50% of uploaded rows
    await emergencyPrune(0.5);
  } else if (usagePercent > 75) {
    log.warn('engine-write-db: Disk space high', { usagePercent, usedSpace, freeSpace });
  }
  
  return { totalSpace, usedSpace, freeSpace, usagePercent };
}
```

**C. Aggressive Pruning Policy**
```typescript
// Prune uploaded rows after 24 hours instead of 7 days
const PRUNE_AFTER_MS = 24 * 60 * 60 * 1000;

async function pruneUploadedRows() {
  const cutoffTime = Date.now() - PRUNE_AFTER_MS;
  
  // Prune battle_logs
  const deletedBattleLogs = db.run(`
    DELETE FROM battle_logs 
    WHERE validation_status = 'UPLOADED' 
      AND uploaded_at < ?
  `, [cutoffTime]);
  
  // Prune move_usage
  const deletedMoveUsage = db.run(`
    DELETE FROM move_usage 
    WHERE validation_status = 'UPLOADED' 
      AND uploaded_at < ?
  `, [cutoffTime]);
  
  // VACUUM to reclaim disk space
  db.run('VACUUM');
  
  await saveToFile();
  
  log.info('engine-write-db: Pruning complete', {
    deletedBattleLogs: deletedBattleLogs.changes,
    deletedMoveUsage: deletedMoveUsage.changes,
    diskSpaceReclaimed: await checkDiskSpace()
  });
}
```

**D. Quarantine Size Limit**
```typescript
// Prevent quarantine table from growing unbounded
const MAX_QUARANTINE_ROWS = 1000;

async function pruneQuarantineIfNeeded() {
  const count = db.exec('SELECT COUNT(*) as count FROM battle_logs WHERE validation_status = "FAIL"')[0].values[0][0];
  
  if (count > MAX_QUARANTINE_ROWS) {
    // Delete oldest quarantined rows, keep newest 1000
    db.run(`
      DELETE FROM battle_logs 
      WHERE validation_status = 'FAIL' 
        AND id NOT IN (
          SELECT id FROM battle_logs 
          WHERE validation_status = 'FAIL' 
          ORDER BY created_at DESC 
          LIMIT ?
        )
    `, [MAX_QUARANTINE_ROWS]);
    
    log.warn('engine-write-db: Quarantine pruned to limit', { limit: MAX_QUARANTINE_ROWS });
  }
}
```

**Recommendation:** Reduce retention to **24 hours**, add **6-hour pruning cron**, implement **disk space monitoring** with emergency pruning at 90%.

---

### Issue 7: PROD Schema Migration Coordination

**Problem:** Phase 20 adds new tables (`BattleLog`, `MoveUsageStats`, `EngineAnomaly`, `EngineMetrics`) to PROD. Must coordinate with existing Phase 16 migration workflow.

**Impact:** HIGH - Schema divergence between environments breaks replication.

**Current Migration Status:**
- Last migration: `20251108183000_northstar_phase2_consolidation`
- Phase 16 tables: `db_version`, `db_sync_state` (already in PROD)

**Solution:**

**A. Create Consolidated Migration**
```bash
# Phase 20 migration
npx prisma migrate dev --name engine_tables_phase20

# Generated migration file:
prisma/migrations/20251109000000_engine_tables_phase20/migration.sql
```

**B. Migration Content**
```sql
-- Phase 20: Engine Database Tables
-- Purpose: Capture verified gameplay data from Write-DB

CREATE TABLE IF NOT EXISTS "BattleLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "battleId" TEXT NOT NULL UNIQUE,
  "trainer1Id" TEXT NOT NULL,
  "trainer2Id" TEXT NOT NULL,
  "winner" TEXT NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "movesUsed" INTEGER NOT NULL,
  "turnCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "BattleLog_battleId_idx" ON "BattleLog"("battleId");
CREATE INDEX "BattleLog_createdAt_idx" ON "BattleLog"("createdAt");

CREATE TABLE IF NOT EXISTS "MoveUsageStats" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "moveId" SMALLINT NOT NULL,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "avgDamage" DOUBLE PRECISION,
  "criticalRate" DOUBLE PRECISION,
  "missRate" DOUBLE PRECISION,
  "aggregatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("moveId") REFERENCES "Move"("id") ON DELETE RESTRICT
);

CREATE INDEX "MoveUsageStats_moveId_idx" ON "MoveUsageStats"("moveId");
CREATE INDEX "MoveUsageStats_aggregatedAt_idx" ON "MoveUsageStats"("aggregatedAt");

CREATE TABLE IF NOT EXISTS "EngineAnomaly" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "battleId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "context" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "EngineAnomaly_battleId_idx" ON "EngineAnomaly"("battleId");
CREATE INDEX "EngineAnomaly_severity_idx" ON "EngineAnomaly"("severity");
CREATE INDEX "EngineAnomaly_type_idx" ON "EngineAnomaly"("type");

CREATE TABLE IF NOT EXISTS "EngineMetrics" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "battleId" TEXT NOT NULL,
  "totalQueries" INTEGER NOT NULL,
  "avgQueryTimeMs" DOUBLE PRECISION NOT NULL,
  "peakMemoryMb" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "EngineMetrics_battleId_idx" ON "EngineMetrics"("battleId");
```

**C. Deployment Coordination**
```yaml
# Phase 20 Deployment Checklist

1. ✅ Create migration locally: `npx prisma migrate dev --name engine_tables_phase20`
2. ✅ Test migration on ONPREMISE-DEV-EXPERIMENT (offline)
3. ✅ Validate on ONPREMISE-DEV-PRIMARY (offline)
4. ✅ Push migration to PROD: `npx prisma migrate deploy`
5. ✅ Wait for Phase 16 replication to mirror to DEV/Local (if applicable)
6. ✅ Deploy Write-DB sync worker (Phase 20 code)
7. ✅ Verify first batch upload succeeds
8. ✅ Monitor for FK constraint violations (moveId references)
```

**D. Rollback Plan**
```sql
-- rollback.sql
DROP TABLE IF EXISTS "EngineMetrics";
DROP TABLE IF EXISTS "EngineAnomaly";
DROP TABLE IF EXISTS "MoveUsageStats";
DROP TABLE IF EXISTS "BattleLog";
```

---

### Issue 8: Foreign Key Integrity Between Databases

**Problem:** Write-DB references Pokemon/Move IDs that must exist in PROD. If PROD deletes a Species/Move, Write-DB has dangling references.

**Impact:** MEDIUM - Validation fails for legitimate battles after PROD schema changes.

**Scenario:**
1. Battle uses Move ID 123 (Thunderbolt)
2. Write-DB logs `move_usage` with `move_id: 123`
3. Admin deletes Move 123 from PROD (e.g., balancing change)
4. Integrity scanner queries Read-DB for Move 123 → NOT FOUND
5. Row marked as FAILED, quarantined
6. Legitimate battle data lost

**Solution:**

**A. Soft Deletes in PROD**
```prisma
model Move {
  id         Int      @id @db.SmallInt
  slug       String   @unique
  name       String
  deletedAt  DateTime?  // NULL = active, non-NULL = soft-deleted
  // ... rest of fields
}
```

**B. Version Tracking in Write-DB**
```sql
CREATE TABLE IF NOT EXISTS move_usage (
  -- ... existing fields
  read_db_version TEXT NOT NULL,  -- Version of Read-DB when battle occurred
  move_snapshot TEXT,              -- JSON snapshot of move data
  -- ...
);
```

**C. Graceful FK Validation**
```typescript
{
  name: 'move_usage_move_exists',
  check: async (row) => {
    const move = await engineReadDb.getMoveById(row.move_id);
    
    if (!move) {
      // Check if row has snapshot (legacy data)
      if (row.move_snapshot) {
        return {
          passed: true,  // Allow with warning
          message: `Move ${row.move_id} deleted from PROD, using snapshot`,
          metadata: { hasSnapshot: true }
        };
      }
      
      return {
        passed: false,
        message: `Move ${row.move_id} not found and no snapshot available`,
        metadata: { move_id: row.move_id }
      };
    }
    
    return { passed: true, message: 'OK' };
  },
  severity: 'WARNING'  // Downgrade from ERROR
}
```

**D. Upload with Best-Effort**
```typescript
// Don't block entire batch if some rows have FK issues
async function uploadBatchWithFallback(validatedRows: Row[]) {
  const results = { succeeded: 0, failed: 0, errors: [] };
  
  for (const row of validatedRows) {
    try {
      await prisma.battleLog.create({ data: transformRow(row) });
      results.succeeded++;
    } catch (error) {
      if (error.code === 'P2003') {  // FK constraint violation
        log.warn('engine-replication: FK constraint violation, skipping row', { row, error });
        results.failed++;
        results.errors.push({ row, error: error.message });
      } else {
        throw error;  // Re-throw unexpected errors
      }
    }
  }
  
  return results;
}
```

**Recommendation:** Implement **soft deletes** in PROD schema (Phase 20 migration), add **version tracking + snapshots** to Write-DB, downgrade FK validation to **WARNING** instead of ERROR.

---

## Revised Implementation Roadmap

### Phase 17: Engine Read-DB Foundation (REVISED)
**Dependencies:** Current `engine-db.ts`, Phase 16 version tracking

**Tasks:**
1. ✅ Rename `engine-db.ts` → `engine-db-read.ts`, update path to `/Store/engine-read.db`
2. ✅ Add TypeChart sync (`syncTypeChartToReadDb()`)
3. ✅ Implement memory pre-loading (`preloadEngineCache()`)
4. ✅ Add Read-DB version tracking (reuse Phase 16 `db_version` pattern)
5. ✅ Create CLI: `npm run engine:sync-read-db`, `npm run engine:status`
6. ✅ **NEW:** Add compatibility wrapper `engine-db.ts` → `engine-db-read.ts`

**Acceptance Criteria:**
- Read-DB contains 1,328 Pokemon + moves + type chart
- `ENGINE_CACHE` pre-loaded at startup (<100ms)
- Battle engine queries cache (synchronous, <1μs)
- Version fingerprint matches PROD

---

### Phase 18: Engine Write-DB Foundation (REVISED)
**Dependencies:** Phase 17 complete

**Tasks:**
1. ✅ Create Write-DB schema with version tracking + snapshots
2. ✅ Implement write operations (`logBattle`, `logMoveUsage`, `logAnomaly`)
3. ✅ **NEW:** Add auto-save interval (30 seconds)
4. ✅ **NEW:** Implement WAL for crash recovery
5. ✅ **NEW:** Add graceful shutdown handlers (SIGTERM/SIGINT/uncaughtException)
6. ✅ Add validation status tracking (PENDING → PASS/WARN/FAIL → UPLOADED)
7. ✅ **NEW:** Add disk space monitoring with emergency pruning

**Acceptance Criteria:**
- Write-DB persists data every 30 seconds
- WAL replays after crash (data loss <30 seconds)
- Graceful shutdown saves all pending data
- Disk space alerts at 75% usage, emergency prune at 90%

---

### Phase 19: Integrity Scanner (REVISED)
**Dependencies:** Phase 18 complete

**Tasks:**
1. ✅ Implement 6 validation rules (schema, range, FK, logic, anomaly, duplicate)
2. ✅ **NEW:** Add incremental validation (only new rows since last run)
3. ✅ **NEW:** Implement parallel validation workers (4 workers)
4. ✅ **NEW:** Add sampling for expensive checks (10% sample)
5. ✅ **NEW:** Batch database queries (reduce N+1 queries)
6. ✅ **NEW:** Downgrade FK validation from ERROR to WARNING
7. ✅ Build validation orchestrator with metrics
8. ✅ Create quarantine mechanism with size limit (1000 rows)

**Acceptance Criteria:**
- Validation completes in <60 seconds at 100 battles/minute
- Data quality score calculation accurate
- Quarantine limited to 1000 rows max
- FK violations logged but don't block upload

---

### Phase 20: Write-DB → PROD Sync (REVISED)
**Dependencies:** Phase 19 complete

**Tasks:**
1. ✅ **NEW:** Create PROD migration with soft deletes (`deletedAt` fields)
2. ✅ Add PROD schema (BattleLog, MoveUsageStats, EngineAnomaly, EngineMetrics)
3. ✅ Build aggregation logic (move usage stats)
4. ✅ **NEW:** Implement best-effort upload with FK fallback
5. ✅ **NEW:** Add 24-hour retention with 6-hour pruning cron
6. ✅ Add VACUUM after pruning to reclaim disk space

**Acceptance Criteria:**
- Migration deploys without breaking existing functionality
- Soft deletes prevent FK constraint violations
- Upload succeeds even with some FK violations (logged)
- Pruning keeps Write-DB <500 MB
- VACUUM reclaims disk space successfully

---

### Phase 21: Battle Engine Integration (REVISED)
**Dependencies:** Phase 20 complete

**Tasks:**
1. ✅ **SKIP async conversion** — Use pre-loaded cache (synchronous)
2. ✅ Update battle engine to query `ENGINE_CACHE` instead of JSON
3. ✅ Add Write-DB logging to damage calculations
4. ✅ Implement anomaly detection (negative HP, impossible damage)
5. ✅ Add performance metrics tracking
6. ✅ **NEW:** Store move/pokemon snapshots in Write-DB for FK resilience

**Acceptance Criteria:**
- Battle calculations use cache lookups (<1μs)
- Write-DB logs all battles without blocking gameplay
- Anomalies detected and logged during battles
- Snapshots prevent FK validation failures

---

### Phase 22: Monitoring & Automation (REVISED)
**Dependencies:** Phase 21 complete

**Tasks:**
1. ✅ Build `/ops engine` command with comprehensive stats
2. ✅ **NEW:** Add disk space metrics to dashboard
3. ✅ **NEW:** Add validation performance metrics (rows/sec)
4. ✅ Create Render cron jobs (daily Read sync, 6-hour pruning)
5. ✅ Add Render worker for continuous validation (10-minute intervals)
6. ✅ **NEW:** Add alerting: disk >90%, validation lag >30min, quality <95%

**Acceptance Criteria:**
- `/ops engine` shows Read-DB, Write-DB, validation, disk space stats
- Alerts fire correctly for critical thresholds
- Pruning cron runs successfully every 6 hours
- Validation worker keeps up with battle load (no lag)

---

## Next Steps

1. **Review revised analysis** — Validate all 8 issues identified and solutions proposed
2. **Prioritize mitigations** — Determine which issues block implementation
3. **Update Tasklist.md** — Create Phase 17-22 entries with revised acceptance criteria
4. **Update Prompt.md** — Log critical issues discovered and mitigation strategies
5. **Implement Phase 17** — Start with Read-DB foundation including all safety enhancements

---

**Document Owner:** Game Engine Systems  
**Status:** DESIGN PHASE → Critical Issues Analyzed → Ready for implementation  
**Next Action:** Review issue analysis, prioritize mitigations, update Tasklist
