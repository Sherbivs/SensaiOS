# Database-Centric Development Plan

> **Created:** 2025-12-03  
> **Purpose:** Centralize databases at the heart of the application architecture  
> **Status:** Active development guide for all specialist teams  
> **Philosophy:** "The database is the source of truth — all systems orbit around it"

---

## Executive Vision

The Infinity Gauntlet application follows a **database-centric architecture** where:

1. **PostgreSQL is the single source of truth** for all game state and business logic
2. **All services are stateless** — they derive state from the database
3. **Caching layers accelerate** but never contradict the database
4. **File storage is supplementary** — for logs, artifacts, and fallbacks only
5. **The schema defines the domain** — application code implements schema semantics

```
                    ┌─────────────────────────────────────────────┐
                    │           APPLICATION LAYER                 │
                    │  Discord Bot │ Workers │ API │ Admin Tools  │
                    └─────────────────────┬───────────────────────┘
                                          │
                    ┌─────────────────────▼───────────────────────┐
                    │              CACHE LAYER                    │
                    │   L1 Memory │ Redis (future) │ CDN (future) │
                    └─────────────────────┬───────────────────────┘
                                          │
        ┌─────────────────────────────────▼─────────────────────────────────┐
        │                    ★ DATABASE LAYER ★                             │
        │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
        │  │ PostgreSQL  │  │ TimescaleDB │  │   SQLite    │               │
        │  │ Game State  │  │  Analytics  │  │ Write Buffer│               │
        │  │ Reference   │  │   Metrics   │  │ Local Dev   │               │
        │  │ Audit Trail │  │    Logs     │  │             │               │
        │  └─────────────┘  └─────────────┘  └─────────────┘               │
        └───────────────────────────────────────────────────────────────────┘
                                          │
                    ┌─────────────────────▼───────────────────────┐
                    │            FILE STORAGE LAYER               │
                    │   Logs Archive │ Security State │ Backups   │
                    └─────────────────────────────────────────────┘
```

---

## Phase 1: Database Consolidation (Current Sprint)

### 🗄️ Database Specialist Tasks

#### 1.1 Schema Integrity Verification
**Goal:** Ensure schema is complete, consistent, and optimized

```sql
-- Run schema health check
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as size,
  n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;
```

**Checklist:**
- [ ] All tables have primary keys
- [ ] Foreign keys have ON DELETE behavior defined
- [ ] Indexes exist for all frequently-queried columns
- [ ] No orphaned tables or deprecated columns
- [ ] All JSON fields have documented schemas

#### 1.2 TimescaleDB Hypertable Configuration
**Goal:** Optimize time-series tables for retention and performance

```sql
-- Verify hypertables are created
SELECT hypertable_name, num_chunks, compression_enabled
FROM timescaledb_information.hypertables;

-- Add retention policies (if missing)
SELECT add_retention_policy('log_entries', INTERVAL '30 days');
SELECT add_retention_policy('worker_metrics', INTERVAL '30 days');
SELECT add_retention_policy('console_outputs', INTERVAL '30 days');

-- Enable compression for older chunks
ALTER TABLE log_entries SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'service_name, level'
);
SELECT add_compression_policy('log_entries', INTERVAL '7 days');
```

#### 1.3 Connection Pool Optimization
**Goal:** Ensure efficient database connections across all services

| Service | Current Connections | Recommended | Notes |
|---------|---------------------|-------------|-------|
| Main Bot | 10 | 10 | Primary service |
| Outbox Worker | 5 | 3 | Reduce (low query rate) |
| Cache Worker | 5 | 2 | Reduce (read-only) |
| Security Worker | 5 | 3 | Reduce (periodic sweeps) |
| Data Pipeline | 5 | 5 | Keep (batch operations) |
| TimescaleDB Worker | 5 | 5 | Keep (high write volume) |
| **Total** | **35** | **28** | Save 7 connections |

```typescript
// prisma/schema.prisma - Connection pool configuration
datasource db {
  provider = "postgresql"
  url      = env("PROD_DATABASE_URL")
  // Add connection pool settings
  // connectionLimit = 10 (per service)
}
```

#### 1.4 Missing Table Creation
**Goal:** Add tables identified in the Data Storage Audit

```prisma
// prisma/schema.prisma additions

/// Battle outcome analytics
model BattleOutcome {
  id            String   @id @default(uuid())
  battleId      String   @unique
  winnerId      String?
  loserId       String?
  winnerTeam    Json     // Pokemon IDs and final HP
  loserTeam     Json
  turnCount     Int
  duration      Int      // Seconds
  battleType    String   // wild, trainer, gym
  timestamp     DateTime @default(now()) @db.Timestamptz
  
  @@index([winnerId])
  @@index([loserId])
  @@index([timestamp])
  @@map("battle_outcomes")
}

/// Catch attempt analytics
model CatchAttempt {
  id            String   @id @default(uuid())
  trainerId     String
  speciesId     Int
  ballType      String
  catchRate     Float    // Calculated catch probability
  successful    Boolean
  shakeCount    Int      // 0-3 shakes before catch/escape
  timestamp     DateTime @default(now()) @db.Timestamptz
  
  trainer       Trainer  @relation(fields: [trainerId], references: [id])
  
  @@index([trainerId])
  @@index([speciesId])
  @@index([timestamp])
  @@map("catch_attempts")
}

/// Command latency tracking
model CommandLatency {
  id            BigInt   @id @default(autoincrement())
  timestamp     DateTime @default(now()) @db.Timestamptz
  commandName   String
  userId        String?
  guildId       String?
  latencyMs     Int
  success       Boolean
  errorType     String?
  
  @@index([commandName])
  @@index([timestamp])
  @@map("command_latency")
}

/// Permission change audit (security)
model PermissionChange {
  id            String   @id @default(uuid())
  timestamp     DateTime @default(now())
  guildId       String
  targetId      String   // User or Role ID
  targetType    String   // user, role
  actorId       String   // Who made the change
  changeType    String   // add, remove, modify
  permissionsBefore Json
  permissionsAfter  Json
  automated     Boolean  @default(false) // Bot auto-revert vs manual
  reverted      Boolean  @default(false)
  
  @@index([guildId])
  @@index([timestamp])
  @@map("permission_changes")
}
```

---

### 🏗️ Architecture Specialist Tasks

#### 1.5 Data Flow Mapping
**Goal:** Document every data path to/from the database

```
┌────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW DIAGRAM                              │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  DISCORD EVENTS                    GAME ACTIONS                        │
│       │                                 │                              │
│       ▼                                 ▼                              │
│  ┌─────────┐                      ┌─────────────┐                     │
│  │ Command │                      │ Battle/Catch │                     │
│  │ Handler │                      │   Engine     │                     │
│  └────┬────┘                      └──────┬──────┘                     │
│       │                                  │                             │
│       ▼                                  ▼                             │
│  ┌─────────────────────────────────────────────────────┐              │
│  │                   SERVICE LAYER                      │              │
│  │  TrainerService │ BattleService │ EncounterService  │              │
│  └─────────────────────────┬───────────────────────────┘              │
│                            │                                           │
│            ┌───────────────┼───────────────┐                          │
│            ▼               ▼               ▼                          │
│     ┌──────────┐    ┌──────────┐    ┌──────────┐                     │
│     │ L1 Cache │    │  Prisma  │    │  Event   │                     │
│     │  (read)  │    │  Client  │    │   Bus    │                     │
│     └────┬─────┘    └────┬─────┘    └────┬─────┘                     │
│          │               │               │                            │
│          │               ▼               ▼                            │
│          │        ┌─────────────────────────────┐                     │
│          └───────►│      ★ PostgreSQL ★         │◄────────────────┐  │
│                   │  (Single Source of Truth)   │                 │  │
│                   └─────────────────────────────┘                 │  │
│                            │                                      │  │
│                            ▼                                      │  │
│                   ┌─────────────────┐                            │  │
│                   │   TimescaleDB   │                            │  │
│                   │   (Analytics)   │────────────────────────────┘  │
│                   └─────────────────┘                               │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### 1.6 Service Layer Standardization
**Goal:** All database access goes through service classes

```typescript
// src/services/core/base-service.ts
export abstract class BaseService {
  protected readonly prisma: PrismaClient;
  protected readonly cache: MemoryCache;
  protected readonly logger: Logger;
  
  constructor(deps: ServiceDependencies) {
    this.prisma = deps.prisma;
    this.cache = deps.cache;
    this.logger = deps.logger;
  }
  
  // All services inherit these patterns:
  // - Automatic cache invalidation on writes
  // - Automatic audit logging for mutations
  // - Automatic error tracking
  // - Automatic latency measurement
}

// Example: TrainerService
export class TrainerService extends BaseService {
  async getTrainer(userId: string): Promise<Trainer | null> {
    // 1. Check cache
    const cached = this.cache.get<Trainer>(`trainer:${userId}`);
    if (cached) return cached;
    
    // 2. Query database
    const trainer = await this.prisma.trainer.findUnique({
      where: { discordId: userId },
      include: { party: true, settings: true }
    });
    
    // 3. Populate cache
    if (trainer) {
      this.cache.set(`trainer:${userId}`, trainer, 5 * 60 * 1000); // 5 min TTL
    }
    
    return trainer;
  }
  
  async updateTrainer(userId: string, data: Partial<Trainer>): Promise<Trainer> {
    // 1. Update database
    const trainer = await this.prisma.trainer.update({
      where: { discordId: userId },
      data
    });
    
    // 2. Invalidate cache
    this.cache.delete(`trainer:${userId}`);
    
    // 3. Audit log
    await this.auditLog('update', 'trainer', userId, data);
    
    return trainer;
  }
}
```

#### 1.7 Repository Pattern Implementation
**Goal:** Separate query logic from business logic

```
src/
├── repositories/           # Pure database access
│   ├── trainer.repository.ts
│   ├── pokemon.repository.ts
│   ├── battle.repository.ts
│   └── encounter.repository.ts
├── services/              # Business logic + caching
│   ├── trainer.service.ts
│   ├── battle.service.ts
│   └── encounter.service.ts
└── handlers/              # Discord command handlers
    ├── commands/
    └── events/
```

---

### 📊 Performance Specialist Tasks

#### 1.8 Query Performance Baseline
**Goal:** Establish performance benchmarks for critical queries

| Query | Current | Target | Index Needed |
|-------|---------|--------|--------------|
| Get Trainer by Discord ID | ~5ms | <2ms | ✅ Exists |
| Get Party with Pokémon | ~15ms | <5ms | Composite needed |
| Active Encounters by Guild | ~20ms | <5ms | Guild + Status index |
| Recent Errors (24h) | ~50ms | <10ms | lastSeen index |
| Log Query (1h window) | ~200ms | <50ms | TimescaleDB chunk |

```sql
-- Add missing indexes
CREATE INDEX CONCURRENTLY idx_party_trainer_active 
ON "Party" (trainer_id) WHERE active = true;

CREATE INDEX CONCURRENTLY idx_encounter_guild_status 
ON "Encounter" (guild_id, status) WHERE status = 'active';

CREATE INDEX CONCURRENTLY idx_error_log_last_seen 
ON "ErrorLog" (last_seen DESC);

-- Analyze query performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM "Trainer" 
WHERE discord_id = '123456789' 
LIMIT 1;
```

#### 1.9 Cache Warming Strategy
**Goal:** Pre-populate caches on startup for instant reads

```typescript
// src/startup/cache-warmer.ts
export async function warmCaches(): Promise<void> {
  const startTime = Date.now();
  
  // 1. Reference data (always warm - never changes)
  await warmReferenceData();  // Species, Moves, Types, Abilities
  
  // 2. Active game state (warm on demand)
  await warmActiveTrainers(); // Last active in 24h
  await warmActiveEncounters(); // Current wild encounters
  
  // 3. Analytics aggregates (warm hourly views)
  await warmAnalyticsViews();
  
  log('info', `Cache warming complete in ${Date.now() - startTime}ms`);
}

async function warmReferenceData(): Promise<void> {
  // Load all species into L1 cache
  const species = await prisma.species.findMany({
    include: { types: true, abilities: true }
  });
  
  for (const s of species) {
    engineCache.setSpecies(s.id, s);
    engineCache.setSpeciesByName(s.name.toLowerCase(), s);
  }
  
  log('info', `Warmed ${species.length} species`);
}
```

#### 1.10 Write Optimization
**Goal:** Reduce database write load through intelligent batching

```typescript
// src/services/write-optimizer.ts
export class WriteOptimizer {
  private pendingWrites = new Map<string, PendingWrite[]>();
  private flushInterval: NodeJS.Timeout;
  
  constructor() {
    // Flush every 100ms for near-real-time with batching
    this.flushInterval = setInterval(() => this.flush(), 100);
  }
  
  // Coalesce multiple updates to same entity
  async queueUpdate(table: string, id: string, data: object): Promise<void> {
    const key = `${table}:${id}`;
    const existing = this.pendingWrites.get(key);
    
    if (existing) {
      // Merge with pending update
      existing[existing.length - 1].data = { 
        ...existing[existing.length - 1].data, 
        ...data 
      };
    } else {
      this.pendingWrites.set(key, [{ table, id, data, timestamp: Date.now() }]);
    }
  }
  
  private async flush(): Promise<void> {
    if (this.pendingWrites.size === 0) return;
    
    // Group by table for batch operations
    const byTable = new Map<string, PendingWrite[]>();
    
    for (const [_, writes] of this.pendingWrites) {
      for (const write of writes) {
        const tableWrites = byTable.get(write.table) || [];
        tableWrites.push(write);
        byTable.set(write.table, tableWrites);
      }
    }
    
    // Execute batch updates per table
    await prisma.$transaction(
      Array.from(byTable.entries()).map(([table, writes]) =>
        this.batchUpdate(table, writes)
      )
    );
    
    this.pendingWrites.clear();
  }
}
```

---

### 🔒 Security Specialist Tasks

#### 1.11 Database Access Control
**Goal:** Implement least-privilege access patterns

```sql
-- Create read-only role for analytics queries
CREATE ROLE analytics_reader;
GRANT SELECT ON log_entries, worker_metrics, console_outputs TO analytics_reader;
GRANT SELECT ON battle_outcomes, catch_attempts, command_latency TO analytics_reader;

-- Create write role for game operations
CREATE ROLE game_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON trainer, pokemon_instance, party TO game_writer;
GRANT SELECT ON species, move, type, ability TO game_writer;

-- Audit role for security operations
CREATE ROLE audit_writer;
GRANT SELECT, INSERT ON audit_log, permission_changes TO audit_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO audit_writer;
```

#### 1.12 Sensitive Data Protection
**Goal:** Ensure PII and sensitive data is properly handled

| Field | Table | Protection | Notes |
|-------|-------|------------|-------|
| `discordId` | User, Trainer | Pseudonymized | External ID, not PII |
| `email` | (none) | N/A | Not collected |
| `ipAddress` | AuditLog | Hash on store | For abuse detection |
| `contextData` | ErrorLog | Sanitize | Remove tokens/secrets |
| `payload` | BusMessage | Encrypt sensitive | Future: at-rest encryption |

```typescript
// src/utils/data-sanitizer.ts
export function sanitizeForStorage(data: Record<string, any>): Record<string, any> {
  const sanitized = { ...data };
  
  // Remove known sensitive patterns
  const sensitiveKeys = ['token', 'password', 'secret', 'key', 'auth'];
  
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    }
  }
  
  return sanitized;
}
```

#### 1.13 Query Injection Prevention
**Goal:** Ensure all queries are parameterized

```typescript
// ❌ NEVER: String interpolation
const bad = await prisma.$queryRawUnsafe(
  `SELECT * FROM "Trainer" WHERE discord_id = '${userId}'`
);

// ✅ ALWAYS: Parameterized queries
const good = await prisma.$queryRaw`
  SELECT * FROM "Trainer" WHERE discord_id = ${userId}
`;

// ✅ ALWAYS: Prisma type-safe queries
const best = await prisma.trainer.findUnique({
  where: { discordId: userId }
});
```

---

### 🧪 Testing Specialist Tasks

#### 1.14 Database Test Infrastructure
**Goal:** Isolated test database with fixtures

```typescript
// tests/setup/database.ts
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const TEST_DATABASE_URL = 'postgresql://test:test@localhost:5433/ig_test';

export async function setupTestDatabase(): Promise<PrismaClient> {
  // Create fresh test database
  execSync(`dropdb --if-exists ig_test`);
  execSync(`createdb ig_test`);
  
  // Run migrations
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  execSync(`npx prisma migrate deploy`);
  
  // Seed reference data
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  await seedReferenceData(prisma);
  
  return prisma;
}

export async function seedReferenceData(prisma: PrismaClient): Promise<void> {
  // Minimal reference data for tests
  await prisma.type.createMany({
    data: [
      { id: 1, name: 'Normal' },
      { id: 2, name: 'Fire' },
      { id: 3, name: 'Water' },
      // ... minimal set
    ]
  });
  
  await prisma.species.createMany({
    data: [
      { id: 1, name: 'Bulbasaur', baseHp: 45, baseAttack: 49 /* ... */ },
      { id: 4, name: 'Charmander', baseHp: 39, baseAttack: 52 /* ... */ },
      { id: 7, name: 'Squirtle', baseHp: 44, baseAttack: 48 /* ... */ },
    ]
  });
}
```

#### 1.15 Query Performance Tests
**Goal:** Prevent performance regressions

```typescript
// tests/performance/queries.perf.ts
import { describe, it, expect } from 'vitest';

describe('Query Performance', () => {
  it('should fetch trainer under 5ms', async () => {
    const start = performance.now();
    await prisma.trainer.findUnique({
      where: { discordId: testTrainerId },
      include: { party: true }
    });
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(5);
  });
  
  it('should batch insert 100 log entries under 50ms', async () => {
    const entries = Array.from({ length: 100 }, (_, i) => ({
      timestamp: new Date(),
      level: 'info',
      category: 'test',
      message: `Test message ${i}`
    }));
    
    const start = performance.now();
    await prisma.logEntry.createMany({ data: entries });
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(50);
  });
  
  it('should query 1 hour of logs under 100ms', async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const start = performance.now();
    await prisma.logEntry.findMany({
      where: { timestamp: { gte: oneHourAgo } },
      orderBy: { timestamp: 'desc' },
      take: 1000
    });
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(100);
  });
});
```

#### 1.16 Data Integrity Tests
**Goal:** Verify referential integrity and constraints

```typescript
// tests/integrity/constraints.test.ts
describe('Data Integrity', () => {
  it('should not allow orphaned PokemonInstance', async () => {
    await expect(
      prisma.pokemonInstance.create({
        data: {
          speciesId: 1,
          trainerId: 'non-existent-trainer',
          level: 5
        }
      })
    ).rejects.toThrow(/foreign key constraint/i);
  });
  
  it('should cascade delete party slots when party deleted', async () => {
    const party = await prisma.party.create({
      data: {
        trainerId: testTrainerId,
        slots: { create: [{ slot: 1, pokemonId: testPokemonId }] }
      }
    });
    
    await prisma.party.delete({ where: { id: party.id } });
    
    const orphanedSlots = await prisma.partySlot.findMany({
      where: { partyId: party.id }
    });
    
    expect(orphanedSlots).toHaveLength(0);
  });
  
  it('should enforce unique fingerprint on ErrorLog', async () => {
    const fingerprint = 'test-fingerprint-123';
    
    await prisma.errorLog.create({
      data: { fingerprint, category: 'TEST', severity: 'LOW', errorName: 'TestError', errorMessage: 'Test' }
    });
    
    await expect(
      prisma.errorLog.create({
        data: { fingerprint, category: 'TEST', severity: 'LOW', errorName: 'TestError', errorMessage: 'Test' }
      })
    ).rejects.toThrow(/unique constraint/i);
  });
});
```

---

### 🚀 DevOps Specialist Tasks

#### 1.17 Database Monitoring Dashboard
**Goal:** Real-time visibility into database health

```yaml
# ops/grafana-database-dashboard.json (key panels)
panels:
  - title: "Connection Pool Usage"
    query: |
      SELECT count(*) as connections, state 
      FROM pg_stat_activity 
      WHERE datname = 'infinity_gauntlet'
      GROUP BY state
    thresholds:
      warning: 25
      critical: 32
      
  - title: "Query Latency (p95)"
    query: |
      SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY total_time)
      FROM pg_stat_statements
      WHERE calls > 100
    thresholds:
      warning: 50  # ms
      critical: 100
      
  - title: "Table Sizes"
    query: |
      SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 10
      
  - title: "TimescaleDB Chunk Count"
    query: |
      SELECT hypertable_name, num_chunks
      FROM timescaledb_information.hypertables
```

#### 1.18 Automated Backup Verification
**Goal:** Ensure backups are valid and restorable

```powershell
# scripts/verify-backup.ps1
param(
  [string]$BackupFile,
  [switch]$RestoreTest
)

# 1. Check backup file exists and has reasonable size
$backup = Get-Item $BackupFile
if ($backup.Length -lt 1MB) {
  Write-Error "Backup file suspiciously small: $($backup.Length) bytes"
  exit 1
}

# 2. Verify backup integrity
pg_restore --list $BackupFile | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Error "Backup file is corrupted"
  exit 1
}

# 3. Optional: Test restore to temporary database
if ($RestoreTest) {
  $testDb = "backup_verify_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
  createdb $testDb
  pg_restore -d $testDb $BackupFile
  
  # Run basic integrity checks
  psql -d $testDb -c "SELECT COUNT(*) FROM \"Species\";"
  psql -d $testDb -c "SELECT COUNT(*) FROM \"Trainer\";"
  
  dropdb $testDb
}

Write-Host "✅ Backup verification passed"
```

#### 1.19 Database Migration Safety
**Goal:** Zero-downtime migrations with rollback capability

```typescript
// scripts/safe-migrate.ts
import { execSync } from 'child_process';

async function safeMigrate(): Promise<void> {
  // 1. Create pre-migration snapshot
  const snapshotName = `pre_migration_${Date.now()}`;
  await createSnapshot(snapshotName);
  
  // 2. Run migration in transaction
  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  } catch (error) {
    console.error('Migration failed, initiating rollback...');
    await restoreSnapshot(snapshotName);
    throw error;
  }
  
  // 3. Verify migration success
  const healthy = await verifyDatabaseHealth();
  if (!healthy) {
    console.error('Post-migration health check failed, rolling back...');
    await restoreSnapshot(snapshotName);
    throw new Error('Migration verification failed');
  }
  
  // 4. Cleanup old snapshot (keep for 24h)
  await scheduleSnapshotCleanup(snapshotName, 24 * 60 * 60 * 1000);
  
  console.log('✅ Migration completed successfully');
}
```

---

### 📝 Documentation Specialist Tasks

#### 1.20 Schema Documentation
**Goal:** Complete documentation for every table and field

```markdown
<!-- prisma/SCHEMA-DOCUMENTATION.md -->

# Database Schema Documentation

## Game State Tables

### Trainer
The core player profile, linked 1:1 with Discord User.

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| id | UUID | Primary key | Auto-generated |
| discordId | String | Discord user snowflake | Unique, indexed |
| name | String | Display name | Max 32 chars |
| createdAt | DateTime | Account creation | Auto-set |
| lastActive | DateTime | Last interaction | Updated on activity |

**Relationships:**
- `user` → User (1:1, required)
- `party` → Party (1:1, optional)
- `pokemon` → PokemonInstance[] (1:many)
- `settings` → TrainerSettings (1:1, optional)

**Indexes:**
- `discordId` (unique) — Primary lookup
- `lastActive` — For activity queries

**Business Rules:**
- Trainer cannot exist without User
- Default party created on first Pokémon catch
- Settings created lazily on first customization
```

#### 1.21 Query Cookbook
**Goal:** Documented patterns for common queries

```markdown
<!-- docs/development-bible/query-cookbook.md -->

# Query Cookbook

## Get Trainer with Full Party Details

```typescript
const trainer = await prisma.trainer.findUnique({
  where: { discordId: userId },
  include: {
    party: {
      include: {
        slots: {
          include: {
            pokemon: {
              include: {
                species: true,
                moves: { include: { move: true } }
              }
            }
          },
          orderBy: { slot: 'asc' }
        }
      }
    }
  }
});
```

**Performance:** ~15ms (with indexes)
**Use Case:** Party display, battle preparation

---

## Find Active Encounters in Guild

```typescript
const encounters = await prisma.encounter.findMany({
  where: {
    guildId,
    status: 'active',
    expiresAt: { gt: new Date() }
  },
  include: {
    species: { select: { name: true, sprite: true } }
  },
  orderBy: { createdAt: 'desc' },
  take: 10
});
```

**Performance:** ~5ms (with guild+status index)
**Use Case:** Wild Pokémon display in channel
```

---

---

## Agile Review & Refinement

> **Sprint Planning Session:** December 3, 2025  
> **Participants:** All Specialist Teams  
> **Format:** Each team reviews blueprint, identifies risks/flaws, proposes improvements

---

### 🗄️ Database Specialist Review

**Blueprint Assessment:** ✅ Solid foundation with some gaps

#### Identified Flaws & Risks

| ID | Flaw/Risk | Severity | Impact |
|----|-----------|----------|--------|
| DB-1 | Missing `VACUUM` automation | Medium | Table bloat over time |
| DB-2 | No deadlock detection strategy | High | Transaction failures under load |
| DB-3 | TimescaleDB compression not specified for all hypertables | Medium | Storage costs |
| DB-4 | Connection pool numbers are estimates, not measured | Medium | Over/under provisioning |
| DB-5 | No strategy for handling long-running queries | High | Connection exhaustion |

#### Proposed Improvements

```sql
-- DB-1 FIX: Add autovacuum tuning
ALTER TABLE log_entries SET (
  autovacuum_vacuum_scale_factor = 0.05,  -- Vacuum at 5% dead tuples (vs 20% default)
  autovacuum_analyze_scale_factor = 0.02
);

-- DB-5 FIX: Add statement timeout
ALTER DATABASE infinity_gauntlet SET statement_timeout = '30s';

-- Add query cancellation for runaway queries
CREATE OR REPLACE FUNCTION cancel_long_queries() RETURNS void AS $$
BEGIN
  PERFORM pg_cancel_backend(pid) 
  FROM pg_stat_activity 
  WHERE state = 'active' 
    AND query_start < NOW() - INTERVAL '30 seconds'
    AND query NOT LIKE '%pg_stat%';
END;
$$ LANGUAGE plpgsql;
```

#### Story Point Estimates

| Task | Points | Sprint | Dependencies |
|------|--------|--------|--------------|
| 1.1 Schema Integrity Verification | 2 | 1 | None |
| 1.2 TimescaleDB Configuration | 3 | 1 | None |
| 1.3 Connection Pool Optimization | 5 | 1 | Load testing |
| 1.4 New Tables Creation | 8 | 1-2 | Schema review |
| NEW: Autovacuum tuning | 2 | 1 | None |
| NEW: Deadlock monitoring | 3 | 2 | Alerting |
| **Total** | **23** | | |

#### Acceptance Criteria Refinements

```gherkin
# Original: "All tables have primary keys"
# Refined:
Given the database schema
When I query pg_constraint for primary keys
Then every table in public schema should have exactly one primary key
And no table should use composite primary keys > 3 columns
And all primary keys should be indexed

# NEW acceptance criteria:
Given a production workload
When connection pool is at 80% capacity
Then new connections should queue (not fail)
And queue depth should be monitored
And alert fires if queue exceeds 10 connections for 30s
```

---

### 🏗️ Architecture Specialist Review

**Blueprint Assessment:** ⚠️ Good patterns, missing failure modes

#### Identified Flaws & Risks

| ID | Flaw/Risk | Severity | Impact |
|----|-----------|----------|--------|
| ARCH-1 | Service layer has no circuit breaker for DB failures | Critical | Cascading failures |
| ARCH-2 | Cache invalidation is synchronous (blocks writes) | Medium | Write latency |
| ARCH-3 | Repository pattern adds complexity without clear benefit yet | Low | Overengineering |
| ARCH-4 | No retry strategy defined for transient DB errors | High | User-facing errors |
| ARCH-5 | Write optimizer lacks backpressure handling | Medium | Memory growth |

#### Proposed Improvements

```typescript
// ARCH-1 FIX: Add circuit breaker to service layer
import CircuitBreaker from 'opossum';

const dbCircuitBreaker = new CircuitBreaker(
  async (fn: () => Promise<any>) => fn(),
  {
    timeout: 5000,        // 5s timeout
    errorThresholdPercentage: 50,
    resetTimeout: 30000,  // 30s before retry
    volumeThreshold: 10   // Min requests before tripping
  }
);

// ARCH-2 FIX: Async cache invalidation
async updateTrainer(userId: string, data: Partial<Trainer>): Promise<Trainer> {
  const trainer = await this.prisma.trainer.update({ where: { discordId: userId }, data });
  
  // Fire-and-forget invalidation (don't block the response)
  setImmediate(() => {
    this.cache.delete(`trainer:${userId}`);
    this.eventBus.emit('cache.invalidated', { key: `trainer:${userId}` });
  });
  
  return trainer;
}

// ARCH-4 FIX: Retry strategy with exponential backoff
const retryConfig = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT', 
    'P1001',  // Prisma: Can't reach database
    'P1002',  // Prisma: Connection timed out
    '40001',  // PostgreSQL: Serialization failure (retry safe)
  ]
};
```

#### Revised Data Flow (with failure handling)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     RESILIENT DATA FLOW                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Request ──► Rate Limiter ──► Circuit Breaker ──► Service Layer        │
│                                      │                                  │
│                                      ▼                                  │
│                              ┌──────────────┐                          │
│                              │    Retry     │                          │
│                              │   Strategy   │                          │
│                              └──────┬───────┘                          │
│                                     │                                   │
│              ┌──────────────────────┼──────────────────────┐           │
│              ▼                      ▼                      ▼           │
│        ┌──────────┐          ┌──────────┐          ┌──────────┐       │
│        │ L1 Cache │◄────────►│ Database │◄────────►│  Fallback │       │
│        │  (read)  │          │ (source) │          │  (stale)  │       │
│        └──────────┘          └──────────┘          └──────────┘       │
│                                                                         │
│  On DB failure: Serve stale cache + emit degraded event + queue write  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Story Point Estimates

| Task | Points | Sprint | Dependencies |
|------|--------|--------|--------------|
| 1.5 Data Flow Mapping | 3 | 1 | None |
| 1.6 Service Layer Standardization | 8 | 1-2 | None |
| 1.7 Repository Pattern | 5 | 2 | 1.6 |
| NEW: Circuit breaker implementation | 5 | 1 | None |
| NEW: Retry strategy | 3 | 1 | None |
| NEW: Async cache invalidation | 2 | 1 | None |
| **Total** | **26** | | |

#### Acceptance Criteria Refinements

```gherkin
# NEW: Circuit breaker behavior
Given the database is unavailable
When a service method is called
Then the circuit breaker should trip after 5 failures
And subsequent calls should fail fast (< 10ms)
And the system should attempt reset after 30 seconds
And degraded mode should serve stale cache where available

# NEW: Retry behavior  
Given a transient database error (connection reset)
When a query fails
Then the system should retry up to 3 times
And use exponential backoff (100ms, 200ms, 400ms)
And log each retry attempt
And give up gracefully with user-friendly error
```

---

### 📊 Performance Specialist Review

**Blueprint Assessment:** ⚠️ Missing baseline measurements, optimistic targets

#### Identified Flaws & Risks

| ID | Flaw/Risk | Severity | Impact |
|----|-----------|----------|--------|
| PERF-1 | Query targets are aspirational, not measured | High | False confidence |
| PERF-2 | Cache warming blocks startup (could take 30s+) | Medium | Slow deploys |
| PERF-3 | Write optimizer 100ms flush is too aggressive for low-traffic | Low | Wasted cycles |
| PERF-4 | No mention of query plan caching | Medium | Repeated planning overhead |
| PERF-5 | Batch sizes are arbitrary (100 entries) | Medium | Suboptimal throughput |

#### Proposed Improvements

```typescript
// PERF-2 FIX: Non-blocking cache warm with progressive loading
async function warmCachesProgressive(): Promise<void> {
  // Critical path: Load immediately (blocks startup)
  await warmTypeChart();     // 324 entries, ~50ms
  
  // Defer non-critical to background
  setImmediate(async () => {
    await warmSpecies();     // 1025 entries, ~500ms
    await warmMoves();       // 919 entries, ~400ms
    await warmAbilities();   // 367 entries, ~200ms
    log('info', 'Background cache warming complete');
  });
  
  // Start accepting requests immediately
  log('info', 'Critical caches ready, background warming in progress');
}

// PERF-3 FIX: Adaptive flush interval based on queue depth
class AdaptiveWriteOptimizer {
  private getFlushInterval(): number {
    const queueSize = this.pendingWrites.size;
    
    if (queueSize > 500) return 50;    // High load: flush fast
    if (queueSize > 100) return 100;   // Medium load
    if (queueSize > 10) return 500;    // Low load
    return 2000;                        // Very low: conserve resources
  }
}

// PERF-5 FIX: Optimal batch size calculation
function calculateOptimalBatchSize(avgRowSize: number): number {
  const targetBatchBytes = 64 * 1024;  // 64KB per batch (PostgreSQL sweet spot)
  const maxBatchSize = 1000;
  const minBatchSize = 10;
  
  const calculated = Math.floor(targetBatchBytes / avgRowSize);
  return Math.max(minBatchSize, Math.min(maxBatchSize, calculated));
}
```

#### Revised Performance Targets (Measured Baseline Required)

| Query | Baseline (TBD) | Target | Stretch Goal |
|-------|----------------|--------|--------------|
| Get Trainer by Discord ID | ❓ Measure first | Baseline - 50% | <2ms |
| Get Party with Pokémon | ❓ Measure first | Baseline - 50% | <5ms |
| Active Encounters by Guild | ❓ Measure first | Baseline - 50% | <5ms |
| Recent Errors (24h) | ❓ Measure first | Baseline - 50% | <10ms |

**ACTION REQUIRED:** Run baseline measurements before setting targets

```sql
-- Performance baseline script
\timing on

-- Test 1: Trainer lookup
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM "Trainer" WHERE discord_id = '123456789012345678';

-- Test 2: Party with Pokemon
EXPLAIN (ANALYZE, BUFFERS)
SELECT t.*, p.*, ps.*, pi.*
FROM "Trainer" t
JOIN "Party" p ON p.trainer_id = t.id
JOIN "PartySlot" ps ON ps.party_id = p.id  
JOIN "PokemonInstance" pi ON pi.id = ps.pokemon_id
WHERE t.discord_id = '123456789012345678';

-- Test 3: Encounter lookup
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM "Encounter" 
WHERE guild_id = '987654321098765432' AND status = 'active';
```

#### Story Point Estimates

| Task | Points | Sprint | Dependencies |
|------|--------|--------|--------------|
| 1.8 Query Performance Baseline | 3 | 1 | Production data |
| 1.9 Cache Warming Strategy | 5 | 1 | None |
| 1.10 Write Optimization | 8 | 2 | 1.8 baseline |
| NEW: Run baseline measurements | 2 | 1 | Prod access |
| NEW: Adaptive flush intervals | 3 | 2 | 1.10 |
| NEW: Query plan analysis | 3 | 2 | 1.8 |
| **Total** | **24** | | |

---

### 🔒 Security Specialist Review

**Blueprint Assessment:** ⚠️ Good basics, missing threat model

#### Identified Flaws & Risks

| ID | Flaw/Risk | Severity | Impact |
|----|-----------|----------|--------|
| SEC-1 | No row-level security (RLS) mentioned | Medium | Data leakage between tenants |
| SEC-2 | AuditLog has no tamper protection | High | Audit trail integrity |
| SEC-3 | Sanitization happens at storage, not input | Medium | Delayed detection |
| SEC-4 | No mention of secrets rotation strategy | Medium | Credential compromise |
| SEC-5 | Database roles defined but not enforced in code | High | Privilege escalation |

#### Proposed Improvements

```sql
-- SEC-1 FIX: Row-level security for multi-tenant safety
ALTER TABLE "PokemonInstance" ENABLE ROW LEVEL SECURITY;

CREATE POLICY pokemon_owner_policy ON "PokemonInstance"
  FOR ALL
  USING (trainer_id = current_setting('app.current_trainer_id')::uuid);

-- SEC-2 FIX: Audit log tamper protection with hash chain
ALTER TABLE "AuditLog" ADD COLUMN prev_hash VARCHAR(64);
ALTER TABLE "AuditLog" ADD COLUMN row_hash VARCHAR(64);

CREATE OR REPLACE FUNCTION audit_hash_chain() RETURNS TRIGGER AS $$
DECLARE
  prev_record RECORD;
BEGIN
  SELECT row_hash INTO prev_record FROM "AuditLog" 
  ORDER BY timestamp DESC LIMIT 1;
  
  NEW.prev_hash := COALESCE(prev_record.row_hash, 'GENESIS');
  NEW.row_hash := encode(sha256(
    (NEW.id || NEW.timestamp || NEW.actor_id || NEW.action || NEW.prev_hash)::bytea
  ), 'hex');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_hash_chain_trigger
  BEFORE INSERT ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_hash_chain();
```

```typescript
// SEC-3 FIX: Input sanitization at entry point
import { z } from 'zod';

const TrainerInputSchema = z.object({
  name: z.string()
    .min(1).max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid characters')
    .transform(s => s.trim()),
  discordId: z.string()
    .regex(/^\d{17,19}$/, 'Invalid Discord ID'),
});

// Validate at command handler entry
export async function handleSetName(interaction: CommandInteraction) {
  const result = TrainerInputSchema.safeParse({
    name: interaction.options.getString('name'),
    discordId: interaction.user.id,
  });
  
  if (!result.success) {
    return interaction.reply({ content: 'Invalid input', ephemeral: true });
  }
  
  // Safe to proceed with result.data
}

// SEC-5 FIX: Enforce DB roles in connection selection
function getPrismaClient(context: RequestContext): PrismaClient {
  const role = determineRole(context);
  
  switch (role) {
    case 'analytics':
      return analyticsClient;  // Read-only role
    case 'game':
      return gameClient;       // Game write role
    case 'audit':
      return auditClient;      // Audit write role
    default:
      throw new Error('Unknown role');
  }
}
```

#### Story Point Estimates

| Task | Points | Sprint | Dependencies |
|------|--------|--------|--------------|
| 1.11 Database Access Control | 5 | 1 | None |
| 1.12 Sensitive Data Protection | 3 | 1 | None |
| 1.13 Query Injection Prevention | 2 | 1 | Code review |
| NEW: Row-level security | 8 | 2 | Schema review |
| NEW: Audit tamper protection | 5 | 2 | None |
| NEW: Input validation layer | 5 | 1 | None |
| **Total** | **28** | | |

---

### 🧪 Testing Specialist Review

**Blueprint Assessment:** ⚠️ Good test types, missing test data strategy

#### Identified Flaws & Risks

| ID | Flaw/Risk | Severity | Impact |
|----|-----------|----------|--------|
| TEST-1 | Test DB setup creates fresh DB every time (slow) | Medium | CI time |
| TEST-2 | No strategy for testing with realistic data volumes | High | Performance bugs escape |
| TEST-3 | Integrity tests don't cover all foreign keys | Medium | Missed constraints |
| TEST-4 | No chaos/fault injection testing planned | Medium | Unknown failure modes |
| TEST-5 | Performance tests have no baseline comparison | High | Regressions missed |

#### Proposed Improvements

```typescript
// TEST-1 FIX: Template database for fast test setup
// tests/setup/fast-database.ts
export async function setupTestDatabase(): Promise<PrismaClient> {
  const testId = process.env.VITEST_WORKER_ID || '1';
  const testDbName = `ig_test_${testId}`;
  
  // Use template database (pre-migrated, pre-seeded)
  await sql`CREATE DATABASE ${testDbName} TEMPLATE ig_test_template`;
  
  return new PrismaClient({
    datasources: { db: { url: `postgresql://test:test@localhost:5433/${testDbName}` } }
  });
}

// Cleanup after test file
afterAll(async () => {
  await prisma.$disconnect();
  await sql`DROP DATABASE IF EXISTS ${testDbName}`;
});

// TEST-2 FIX: Realistic data volume testing
describe('Realistic Volume Tests', () => {
  beforeAll(async () => {
    // Generate 10,000 trainers with realistic distribution
    await seedRealisticData({
      trainers: 10_000,
      pokemonPerTrainer: { min: 1, max: 50, median: 6 },
      battlesPerTrainer: { min: 0, max: 100, median: 10 },
    });
  });
  
  it('should handle trainer lookup at scale', async () => {
    const randomTrainerId = await getRandomTrainerId();
    
    const start = performance.now();
    await prisma.trainer.findUnique({
      where: { discordId: randomTrainerId },
      include: { party: true }
    });
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(10); // Still fast at scale
  });
});

// TEST-4 FIX: Chaos testing
describe('Chaos Tests', () => {
  it('should handle database disconnect gracefully', async () => {
    // Simulate connection drop
    await prisma.$disconnect();
    
    const result = await trainerService.getTrainer('123');
    
    // Should return cached data or graceful error
    expect(result).toBeDefined(); // Cached fallback
    // OR
    expect(result.error).toBe('SERVICE_DEGRADED');
  });
  
  it('should handle slow queries without timeout cascade', async () => {
    // Inject artificial latency
    await prisma.$executeRaw`SELECT pg_sleep(5)`;
    
    // Other queries should still work
    const trainer = await prisma.trainer.findFirst();
    expect(trainer).toBeDefined();
  });
});
```

#### Test Coverage Matrix

| Layer | Unit | Integration | E2E | Chaos | Performance |
|-------|:----:|:-----------:|:---:|:-----:|:-----------:|
| Repository | ✅ | ✅ | - | - | ✅ |
| Service | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cache | ✅ | ✅ | - | ✅ | ✅ |
| Database | - | ✅ | - | ✅ | ✅ |

#### Story Point Estimates

| Task | Points | Sprint | Dependencies |
|------|--------|--------|--------------|
| 1.14 Database Test Infrastructure | 5 | 1 | None |
| 1.15 Query Performance Tests | 3 | 1 | 1.14 |
| 1.16 Data Integrity Tests | 5 | 1 | 1.14 |
| NEW: Template database setup | 3 | 1 | None |
| NEW: Realistic volume tests | 5 | 2 | Seed scripts |
| NEW: Chaos testing suite | 8 | 2 | Circuit breaker |
| **Total** | **29** | | |

---

### 🚀 DevOps Specialist Review

**Blueprint Assessment:** ⚠️ Good monitoring, missing operational runbooks

#### Identified Flaws & Risks

| ID | Flaw/Risk | Severity | Impact |
|----|-----------|----------|--------|
| OPS-1 | No runbook for database failover | Critical | Extended downtime |
| OPS-2 | Backup verification is manual | Medium | Undetected failures |
| OPS-3 | Migration safety doesn't handle large tables | High | Locking issues |
| OPS-4 | No strategy for schema drift detection | Medium | Env inconsistency |
| OPS-5 | Alert thresholds are arbitrary | Medium | Alert fatigue |

#### Proposed Improvements

```yaml
# OPS-1 FIX: Database failover runbook
# ops/runbooks/database-failover.md

## Database Failover Procedure

### Detection
- Alert: `database_connection_failures > 5 in 1m`
- Verify: `pg_isready -h <host> -p 5432`

### Immediate Actions (< 5 min)
1. [ ] Confirm outage scope (single service or all?)
2. [ ] Check Render status page
3. [ ] Notify team in #incidents channel
4. [ ] Enable maintenance mode: `/ops maintenance on`

### Recovery (if Render-managed)
1. [ ] Monitor Render auto-recovery (usually < 5 min)
2. [ ] If > 10 min: Create Render support ticket
3. [ ] If > 30 min: Initiate manual failover to read replica

### Post-Incident
1. [ ] Verify all services reconnected
2. [ ] Check for data consistency
3. [ ] Review error logs for cascade failures
4. [ ] Create incident report
```

```typescript
// OPS-2 FIX: Automated backup verification
// scripts/verify-backups-automated.ts
import { CronJob } from 'cron';

const backupVerificationJob = new CronJob('0 6 * * *', async () => {
  // Run daily at 6 AM
  const latestBackup = await getLatestBackup();
  
  // 1. Check backup exists and is recent
  if (!latestBackup || latestBackup.age > 24 * 60 * 60 * 1000) {
    await alert('CRITICAL', 'Backup missing or stale');
    return;
  }
  
  // 2. Test restore to temporary database
  const testResult = await testRestore(latestBackup);
  
  if (!testResult.success) {
    await alert('CRITICAL', `Backup restore failed: ${testResult.error}`);
    return;
  }
  
  // 3. Verify data integrity
  const integrityResult = await verifyBackupIntegrity(testResult.database);
  
  if (integrityResult.issues.length > 0) {
    await alert('WARNING', `Backup integrity issues: ${integrityResult.issues}`);
  }
  
  // 4. Log success
  await prisma.auditLog.create({
    data: {
      actorId: 'system',
      actorType: 'system',
      action: 'backup_verified',
      resource: 'database',
      metadata: { backup: latestBackup.name, ...integrityResult }
    }
  });
});

// OPS-3 FIX: Large table migration strategy
async function safeLargeTableMigration(migration: () => Promise<void>): Promise<void> {
  // 1. Check table size
  const tableSize = await getTableSize('target_table');
  
  if (tableSize > 1_000_000) { // > 1M rows
    // Use pt-online-schema-change pattern
    await executeWithOnlineSchemaChange(migration);
  } else {
    // Standard migration is safe
    await migration();
  }
}
```

#### Refined Alert Thresholds (Evidence-Based)

| Metric | Current | Refined | Rationale |
|--------|---------|---------|-----------|
| Connection pool | 25/32 (78%) | 28/35 (80%) | Add headroom |
| Query latency p95 | 50ms | Dynamic (2x baseline) | Baseline-relative |
| Error rate | 50/hour | 5% of request rate | Percentage-based |
| Disk usage | 70% | 60% + growth trend | Predictive |

#### Story Point Estimates

| Task | Points | Sprint | Dependencies |
|------|--------|--------|--------------|
| 1.17 Database Monitoring Dashboard | 5 | 1 | None |
| 1.18 Automated Backup Verification | 5 | 1 | None |
| 1.19 Database Migration Safety | 8 | 2 | Testing |
| NEW: Failover runbook | 3 | 1 | None |
| NEW: Online schema change tooling | 8 | 2 | None |
| NEW: Evidence-based alerting | 5 | 2 | Baseline data |
| **Total** | **34** | | |

---

### 📝 Documentation Specialist Review

**Blueprint Assessment:** ✅ Well-structured, needs templates

#### Identified Flaws & Risks

| ID | Flaw/Risk | Severity | Impact |
|----|-----------|----------|--------|
| DOC-1 | No template for adding new tables | Low | Inconsistent docs |
| DOC-2 | Query cookbook examples don't show failure cases | Medium | Incomplete guidance |
| DOC-3 | No changelog automation | Low | Manual tracking |
| DOC-4 | Schema docs will drift from actual schema | Medium | Outdated docs |
| DOC-5 | No decision log for architectural choices | Medium | Lost context |

#### Proposed Improvements

```markdown
<!-- DOC-1 FIX: New table documentation template -->
<!-- prisma/templates/NEW-TABLE-TEMPLATE.md -->

# Table: [TableName]

## Purpose
[One sentence description of what this table stores and why]

## Schema
| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| id | UUID | Primary key | Auto-generated |
| ... | ... | ... | ... |

## Relationships
- `fieldName` → ParentTable (cardinality, required/optional)

## Indexes
- `fieldName` — [Query pattern this supports]

## Business Rules
- [Rule 1]
- [Rule 2]

## Example Queries
```sql
-- Common query 1
SELECT ...
```

## Lifecycle
- Created: [When/how records are created]
- Updated: [When/how records are updated]  
- Deleted: [Retention policy, cascade behavior]

## Migration History
- 2025-XX-XX: Created
- ...
```

```typescript
// DOC-4 FIX: Automated schema documentation sync
// scripts/sync-schema-docs.ts
import { getDMMF } from '@prisma/internals';

async function syncSchemaDocs(): Promise<void> {
  const dmmf = await getDMMF({ datamodelPath: 'prisma/schema.prisma' });
  
  for (const model of dmmf.datamodel.models) {
    const docPath = `prisma/docs/${model.name}.md`;
    const existingDoc = await readFile(docPath).catch(() => null);
    
    if (!existingDoc) {
      // Generate skeleton doc
      await generateSkeletonDoc(model, docPath);
      console.log(`Created: ${docPath}`);
    } else {
      // Verify schema matches doc
      const drift = detectDrift(model, existingDoc);
      if (drift.length > 0) {
        console.warn(`DRIFT DETECTED in ${docPath}:`, drift);
      }
    }
  }
}

// DOC-5 FIX: Architecture Decision Record template
// docs/decisions/TEMPLATE.md
/*
# ADR-XXX: [Title]

## Status
[Proposed | Accepted | Deprecated | Superseded]

## Context
[What is the issue that we're seeing that is motivating this decision?]

## Decision
[What is the change that we're proposing?]

## Consequences
[What becomes easier or harder as a result?]

## Alternatives Considered
[What other options were evaluated?]
*/
```

#### Story Point Estimates

| Task | Points | Sprint | Dependencies |
|------|--------|--------|--------------|
| 1.20 Schema Documentation | 5 | 1 | None |
| 1.21 Query Cookbook | 3 | 1 | None |
| NEW: Documentation templates | 2 | 1 | None |
| NEW: Schema drift detection | 3 | 2 | CI pipeline |
| NEW: ADR system setup | 2 | 1 | None |
| **Total** | **15** | | |

---

### 📊 Sprint Planning Summary

#### Total Story Points by Team

| Team | Sprint 1 | Sprint 2 | Total |
|------|----------|----------|-------|
| 🗄️ Database | 12 | 11 | 23 |
| 🏗️ Architecture | 18 | 8 | 26 |
| 📊 Performance | 10 | 14 | 24 |
| 🔒 Security | 10 | 18 | 28 |
| 🧪 Testing | 13 | 16 | 29 |
| 🚀 DevOps | 13 | 21 | 34 |
| 📝 Documentation | 10 | 5 | 15 |
| **Total** | **86** | **93** | **179** |

#### Sprint 1 Focus (Foundational)

**Theme:** Establish baselines and safety nets

| Priority | Tasks |
|----------|-------|
| P0 | Run performance baselines (PERF) |
| P0 | Circuit breaker implementation (ARCH) |
| P0 | Failover runbook (OPS) |
| P1 | Schema verification (DB) |
| P1 | Input validation layer (SEC) |
| P1 | Test infrastructure (TEST) |
| P1 | Schema documentation (DOC) |

#### Sprint 2 Focus (Enhancement)

**Theme:** Optimize and harden

| Priority | Tasks |
|----------|-------|
| P0 | New tables creation (DB) |
| P0 | Row-level security (SEC) |
| P1 | Write optimization (PERF) |
| P1 | Chaos testing (TEST) |
| P1 | Online schema change (OPS) |
| P2 | Repository pattern (ARCH) |

#### Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Baseline measurements delayed | Medium | High | Parallel track with estimates |
| Circuit breaker adds latency | Low | Medium | Benchmark before deploy |
| RLS breaks existing queries | Medium | High | Thorough testing, gradual rollout |
| Schema drift in prod | Medium | Medium | CI check before deploy |
| Backup restore fails | Low | Critical | Monthly restore drills |

#### Definition of Done (Refined)

```gherkin
Given a task is claimed
When the implementation is complete
Then:
  - [ ] Code is reviewed and approved
  - [ ] Unit tests pass (>80% coverage for new code)
  - [ ] Integration tests pass
  - [ ] Performance doesn't regress (vs baseline)
  - [ ] Security review completed (for data changes)
  - [ ] Documentation updated
  - [ ] Schema docs match implementation
  - [ ] ADR created (for architectural decisions)
  - [ ] Runbook updated (for operational changes)
  - [ ] Demo recorded or screenshot taken
```

---

## Phase 2: Database Enhancement (Next Sprint)

### Planned Improvements

| Enhancement | Specialist | Effort | Impact |
|-------------|------------|--------|--------|
| Read replicas for analytics | Database | 8h | High |
| Redis cache layer | Architecture | 16h | High |
| Full-text search (Pokémon names) | Database | 4h | Medium |
| Automated schema drift detection | DevOps | 4h | Medium |
| Query plan analysis automation | Performance | 8h | Medium |
| GraphQL API layer | Architecture | 24h | High |

### Long-term Roadmap

```
Q1 2026: Database Maturity
├── Read replicas for geographic distribution
├── Automated failover testing
├── Query performance regression CI
└── Schema versioning with changelog

Q2 2026: Scale Preparation
├── Horizontal sharding strategy
├── Multi-region replication
├── Connection pooler (PgBouncer)
└── Automated capacity planning

Q3 2026: Advanced Analytics
├── Real-time dashboards
├── Predictive scaling
├── Cost optimization automation
└── Data warehouse integration
```

---

## Appendix: Database Centralization Checklist

### Pre-Flight Verification

- [ ] All tables documented in schema documentation
- [ ] All queries use Prisma or parameterized raw SQL
- [ ] All services use repository/service pattern
- [ ] All writes go through audit logging
- [ ] All caches invalidate on database writes
- [ ] All migrations have rollback scripts
- [ ] All indexes verified for query patterns
- [ ] All retention policies active and tested
- [ ] All backups verified restorable
- [ ] All connection pools sized appropriately

### Weekly Database Health Check

```sql
-- Run weekly
SELECT 
  'Table Sizes' as check_type,
  relname as item,
  pg_size_pretty(pg_total_relation_size(relid)) as value
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 5

UNION ALL

SELECT 
  'Slow Queries' as check_type,
  LEFT(query, 50) as item,
  round(mean_time::numeric, 2)::text || 'ms' as value
FROM pg_stat_statements
WHERE calls > 100
ORDER BY mean_time DESC
LIMIT 5

UNION ALL

SELECT
  'Connection Usage' as check_type,
  state as item,
  count(*)::text as value
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state;
```

---

**Related Documents:**
- `docs/projects/DATA-STORAGE-AUDIT.md` — Storage tier analysis
- `docs/operations-bible/database-operations-runbook-comprehensive.md` — Operations guide
- `prisma/schema.prisma` — Schema source of truth
- `docs/architecture-bible/complete-system-architecture.md` — System topology

---

## Change Log

| Date | Change |
|------|--------|
| 2025-12-03 | Initial database-centric development plan created |
