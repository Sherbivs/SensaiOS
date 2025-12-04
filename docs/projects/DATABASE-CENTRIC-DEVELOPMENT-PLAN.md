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

## Agile Review Session #2: AI Expandability & Standardization

> **Session Date:** 2025-12-03  
> **Focus:** Future-proofing, AI-friendly code, uniform patterns, scalable expansion  
> **Philosophy:** "Write code so that both humans AND AI assistants can efficiently understand, navigate, and extend it"

### Session Goals

The goal of this second review pass is to ensure the codebase is:

1. **AI-Expandable:** Code can be extended by AI assistants without losing efficiency due to unfamiliar patterns
2. **Self-Documenting:** Code structure itself conveys intent without external explanation
3. **Uniformly Patterned:** Every module follows predictable conventions
4. **Template-Ready:** New features can be generated from standardized templates
5. **Discovery-Friendly:** Files, functions, and relationships are easily navigable

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AI-EXPANDABLE ARCHITECTURE                          │
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │  DISCOVERY  │───▶│  TEMPLATE   │───▶│  GENERATE   │                 │
│  │  ROUTER.md  │    │  Standards  │    │  New Code   │                 │
│  │  Barrel     │    │  Base Class │    │  Consistent │                 │
│  └─────────────┘    └─────────────┘    └─────────────┘                 │
│         │                  │                  │                         │
│         ▼                  ▼                  ▼                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    UNIFORM CODEBASE                              │   │
│  │  • Predictable paths: src/{domain}/{feature}.ts                  │   │
│  │  • Standard interfaces: IService, IRepository, ICommand          │   │
│  │  • Consistent exports: index.ts barrels in every folder          │   │
│  │  • JSDoc everything: @param, @returns, @example                  │   │
│  │  • Type-first design: Types define contracts                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 🔧 Part 1: Code Convention Standards Review

**Reviewer:** AI Coding Specialist + Documentation Specialist

#### Current State Analysis

| Area | Current Pattern | AI-Friendliness | Issue |
|------|-----------------|-----------------|-------|
| File Naming | Mixed (kebab-case, camelCase) | ⚠️ Medium | Inconsistent discovery |
| Directory Structure | Domain-organized | ✅ Good | Well-structured |
| Import Style | Mixed (relative, aliases) | ⚠️ Medium | Hard to trace |
| Export Style | Mixed (default, named) | ❌ Poor | Unpredictable |
| Type Location | Mixed (inline, separate) | ⚠️ Medium | Scattered definitions |

#### Proposed Conventions (Strict Enforcement)

##### File Naming Convention

```
✅ CORRECT:
src/services/battle-service.ts       # kebab-case for files
src/services/battle-service.test.ts  # test files match source
src/types/battle.types.ts            # .types.ts suffix for type files
src/repositories/user.repository.ts  # .repository.ts suffix
src/commands/catch.command.ts        # .command.ts suffix

❌ AVOID:
src/services/battleService.ts        # No camelCase files
src/services/BattleService.ts        # No PascalCase files  
src/battle.ts                        # No ambiguous names
```

##### Directory Structure Standard

```
src/
├── bot/                          # Discord bot layer
│   ├── commands/                 # User-facing commands
│   │   ├── index.ts             # Barrel export (REQUIRED)
│   │   ├── catch.command.ts     # Command implementation
│   │   └── catch.command.test.ts
│   ├── handlers/                 # Event handlers
│   └── index.ts                  # Domain barrel
│
├── core/                         # Business logic (framework-agnostic)
│   ├── battle/                   
│   │   ├── index.ts             # Barrel export
│   │   ├── battle.service.ts    # Service layer
│   │   ├── battle.repository.ts # Data access
│   │   ├── battle.types.ts      # Type definitions
│   │   └── battle.test.ts       # Tests
│   └── index.ts
│
├── shared/                       # Cross-cutting concerns
│   ├── types/                    # Global type definitions
│   │   └── index.ts             # Type barrel
│   ├── utils/                    # Pure utility functions
│   └── constants/                # Application constants
│
└── infrastructure/               # External service adapters
    ├── database/                 # Prisma, connections
    ├── cache/                    # Cache implementations
    └── discord/                  # Discord.js wrappers
```

##### Import Organization Standard

```typescript
// ===== FILE: src/core/battle/battle.service.ts =====

// 1. Node.js built-ins (if any)
import { randomUUID } from "node:crypto";

// 2. External packages (npm)
import { PrismaClient } from "@prisma/client";

// 3. Internal aliases (absolute paths via tsconfig)
import { logger } from "@shared/utils/logger.js";
import type { BattleState } from "@shared/types/index.js";

// 4. Relative imports (same domain only)
import { BattleRepository } from "./battle.repository.js";
import type { BattleConfig } from "./battle.types.js";

// 5. Type-only imports (always last)
import type { User, Pokemon } from "@prisma/client";
```

##### Export Pattern Standard

```typescript
// ===== FILE: src/core/battle/index.ts (BARREL) =====

// Named exports ONLY (no default exports except React components)
export { BattleService } from "./battle.service.js";
export { BattleRepository } from "./battle.repository.js";
export * from "./battle.types.js";  // Re-export all types

// ===== WHY NO DEFAULT EXPORTS? =====
// Default exports cause:
// 1. Inconsistent import names across files
// 2. Harder refactoring (no automatic rename)
// 3. AI confusion about canonical names
```

#### Flaws Identified

| ID | Flaw | AI Impact | Severity |
|----|------|-----------|----------|
| CC-1 | No tsconfig path aliases defined | AI can't trace imports | High |
| CC-2 | Mixed export styles | Unpredictable consumption | Medium |
| CC-3 | Missing barrel exports | Manual file discovery | High |
| CC-4 | No enforced file naming | Pattern matching fails | Medium |
| CC-5 | Types scattered across files | Type discovery difficult | Medium |

#### Mitigations

**CC-1: Add Path Aliases to tsconfig.json**

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": "./src",
    "paths": {
      "@shared/*": ["shared/*"],
      "@core/*": ["core/*"],
      "@bot/*": ["bot/*"],
      "@infrastructure/*": ["infrastructure/*"],
      "@types": ["shared/types/index.ts"]
    }
  }
}
```

**CC-2: ESLint Rule for Named Exports**

```javascript
// eslint.config.js addition
{
  rules: {
    // Disallow default exports (except React components)
    "import/no-default-export": "error",
    // Require named exports
    "import/prefer-default-export": "off"
  }
}
```

**CC-3: Barrel Export Template**

```typescript
// Template for every directory's index.ts
// Run: npm run generate:barrels

/**
 * @fileoverview Barrel export for {domain} module
 * @module @core/{domain}
 * 
 * This file re-exports all public APIs from this module.
 * Import from the barrel, not individual files:
 * 
 * @example
 * // ✅ Correct
 * import { BattleService, BattleRepository } from "@core/battle";
 * 
 * // ❌ Avoid
 * import { BattleService } from "@core/battle/battle.service";
 */

export { ServiceName } from "./service-name.service.js";
export { RepositoryName } from "./service-name.repository.js";
export * from "./service-name.types.js";
```

---

### 📝 Part 2: Self-Documenting Patterns Review

**Reviewer:** Documentation Specialist + Architecture Specialist

#### JSDoc Standards (Mandatory)

Every public function, class, and type MUST have JSDoc:

```typescript
/**
 * Resolves a battle turn by processing both trainer's moves.
 * 
 * @description
 * This function implements the core battle resolution logic:
 * 1. Determines turn order based on speed and priority
 * 2. Applies moves sequentially
 * 3. Calculates damage with type effectiveness
 * 4. Updates battle state
 * 
 * @param battleId - Unique identifier for the battle
 * @param moves - Object containing both trainers' selected moves
 * @param moves.challenger - Move selected by challenger
 * @param moves.defender - Move selected by defender
 * 
 * @returns Resolved turn result with damage dealt and status changes
 * 
 * @throws {BattleNotFoundError} If battle doesn't exist
 * @throws {InvalidMoveError} If selected move is not available
 * 
 * @example
 * const result = await battleService.resolveTurn("battle-123", {
 *   challenger: { moveId: "thunderbolt", target: "opponent" },
 *   defender: { moveId: "protect", target: "self" }
 * });
 * 
 * @see {@link calculateDamage} for damage formula
 * @see {@link applyStatusEffect} for status processing
 * 
 * @since 1.0.0
 * @category Battle Engine
 */
async resolveTurn(
  battleId: string,
  moves: TurnMoves
): Promise<TurnResult> {
  // Implementation
}
```

#### Type Self-Documentation

```typescript
// ===== FILE: src/shared/types/battle.types.ts =====

/**
 * Represents a complete battle state at any point in time.
 * 
 * @remarks
 * This is the central state object for the battle engine.
 * All battle operations read from and write to this structure.
 * 
 * @example
 * ```typescript
 * const battle: BattleState = {
 *   id: "battle-uuid",
 *   phase: "active",
 *   turn: 5,
 *   challenger: { ... },
 *   defender: { ... }
 * };
 * ```
 */
export interface BattleState {
  /** Unique identifier (UUID v4) */
  readonly id: string;
  
  /** 
   * Current phase of the battle
   * @see BattlePhase for valid values
   */
  phase: BattlePhase;
  
  /** 
   * Current turn number (1-indexed)
   * @minimum 1
   */
  turn: number;
  
  /** Challenger trainer state */
  challenger: TrainerBattleState;
  
  /** Defender trainer state */
  defender: TrainerBattleState;
  
  /**
   * Timestamp when battle started
   * @format ISO-8601
   */
  startedAt: string;
  
  /**
   * Battle log entries for replay
   * @maxItems 1000
   */
  log: BattleLogEntry[];
}

/**
 * Valid battle phases
 * 
 * @description
 * State machine transitions:
 * ```
 * pending → active → (completed | forfeited | timeout)
 * ```
 */
export type BattlePhase = 
  | "pending"    // Awaiting defender response
  | "active"     // Battle in progress
  | "completed"  // Normal completion (KO or surrender)
  | "forfeited"  // Manual forfeit
  | "timeout";   // Inactivity timeout
```

#### Inline Comments Strategy

```typescript
// BAD: Comment describes WHAT (redundant)
// Increment counter by 1
counter++;

// GOOD: Comment describes WHY (adds value)
// Rate limit bucket refills every second
counter++;

// BETTER: Comment explains non-obvious behavior
// Pokemon fainting triggers switch-in, which might fail if no party members remain.
// In that case, battle ends immediately - don't process remaining turn actions.
if (activePokemon.currentHp <= 0) {
  const switched = await this.handleFaint(battleId, trainerId);
  if (!switched) {
    return this.endBattle(battleId, getOpponentId(trainerId));
  }
}
```

#### Flaws Identified

| ID | Flaw | AI Impact | Severity |
|----|------|-----------|----------|
| SD-1 | Inconsistent JSDoc coverage | AI lacks context for functions | High |
| SD-2 | No @example in type definitions | Hard to understand usage | Medium |
| SD-3 | Missing @throws documentation | AI can't handle errors | High |
| SD-4 | No @see cross-references | Missing relationship context | Medium |
| SD-5 | WHY comments are rare | AI can't understand intent | High |

#### Mitigations

**SD-1: ESLint JSDoc Enforcement**

```javascript
// eslint.config.js addition
{
  plugins: ["jsdoc"],
  rules: {
    "jsdoc/require-jsdoc": ["error", {
      require: {
        FunctionDeclaration: true,
        MethodDefinition: true,
        ClassDeclaration: true,
        ArrowFunctionExpression: false,  // Only top-level
        FunctionExpression: false
      },
      contexts: [
        "ExportNamedDeclaration > FunctionDeclaration",
        "ExportNamedDeclaration > VariableDeclaration"
      ]
    }],
    "jsdoc/require-param": "error",
    "jsdoc/require-returns": "error",
    "jsdoc/require-throws": "error",
    "jsdoc/require-example": "warn"
  }
}
```

**SD-2: JSDoc Templates for Types**

```typescript
// Generate via: npm run generate:types-doc

/**
 * {TypeName}
 * 
 * @description
 * {Brief description of what this type represents}
 * 
 * @remarks
 * {When to use this type, constraints, relationships}
 * 
 * @example
 * ```typescript
 * const example: {TypeName} = {
 *   // ... concrete example
 * };
 * ```
 * 
 * @see {@link RelatedType} for {relationship}
 */
```

---

### 🏭 Part 3: Template-Based Development Review

**Reviewer:** AI Coding Specialist + Architecture Specialist

#### Core Principle: "Copy, Don't Invent"

New features should be generated from templates, not written from scratch. This ensures:
- Consistent patterns across the codebase
- Faster development (AI or human)
- Reduced cognitive load
- Automatic best practices

#### Template Categories

##### 1. Service Template

```typescript
// ===== TEMPLATE: src/.templates/service.template.ts =====
// Generate: npm run generate:service -- --name=Pokemon --domain=core

import { logger } from "@shared/utils/logger.js";
import { prisma } from "@infrastructure/database/prisma.js";
import type { Prisma } from "@prisma/client";

// Repository import (auto-generated with service)
import { {{PascalName}}Repository } from "./{{kebab-name}}.repository.js";
import type { 
  Create{{PascalName}}Input,
  Update{{PascalName}}Input,
  {{PascalName}}FilterOptions 
} from "./{{kebab-name}}.types.js";

/**
 * Service layer for {{PascalName}} domain operations.
 * 
 * @description
 * This service encapsulates all business logic for {{PascalName}}.
 * It coordinates between the repository layer and external consumers.
 * 
 * @example
 * const service = new {{PascalName}}Service();
 * const result = await service.findById("uuid");
 */
export class {{PascalName}}Service {
  private readonly repository: {{PascalName}}Repository;
  private readonly logger = logger.child({ service: "{{PascalName}}Service" });

  constructor(repository?: {{PascalName}}Repository) {
    this.repository = repository ?? new {{PascalName}}Repository();
  }

  /**
   * Creates a new {{PascalName}} entity.
   * 
   * @param input - Creation parameters
   * @returns Created entity with generated ID
   * @throws {ValidationError} If input fails validation
   */
  async create(input: Create{{PascalName}}Input): Promise<{{PascalName}}> {
    this.logger.debug({ input }, "Creating {{PascalName}}");
    
    // Validation hook (implement as needed)
    await this.validateCreate(input);
    
    const entity = await this.repository.create(input);
    
    this.logger.info({ id: entity.id }, "{{PascalName}} created");
    return entity;
  }

  /**
   * Retrieves a {{PascalName}} by ID.
   * 
   * @param id - Entity unique identifier
   * @returns Entity if found, null otherwise
   */
  async findById(id: string): Promise<{{PascalName}} | null> {
    return this.repository.findById(id);
  }

  /**
   * Lists {{PascalName}} entities with filtering.
   * 
   * @param options - Filter and pagination options
   * @returns Paginated list of entities
   */
  async findMany(options: {{PascalName}}FilterOptions = {}): Promise<{{PascalName}}[]> {
    return this.repository.findMany(options);
  }

  /**
   * Updates a {{PascalName}} entity.
   * 
   * @param id - Entity to update
   * @param input - Fields to update
   * @returns Updated entity
   * @throws {NotFoundError} If entity doesn't exist
   */
  async update(id: string, input: Update{{PascalName}}Input): Promise<{{PascalName}}> {
    this.logger.debug({ id, input }, "Updating {{PascalName}}");
    
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("{{PascalName}}", id);
    }
    
    await this.validateUpdate(existing, input);
    
    const updated = await this.repository.update(id, input);
    
    this.logger.info({ id }, "{{PascalName}} updated");
    return updated;
  }

  /**
   * Soft-deletes a {{PascalName}} entity.
   * 
   * @param id - Entity to delete
   * @throws {NotFoundError} If entity doesn't exist
   */
  async delete(id: string): Promise<void> {
    this.logger.debug({ id }, "Deleting {{PascalName}}");
    
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("{{PascalName}}", id);
    }
    
    await this.repository.softDelete(id);
    
    this.logger.info({ id }, "{{PascalName}} deleted");
  }

  // ===== VALIDATION HOOKS (override in subclass if needed) =====
  
  protected async validateCreate(input: Create{{PascalName}}Input): Promise<void> {
    // Default: no-op. Override for custom validation.
  }

  protected async validateUpdate(
    existing: {{PascalName}}, 
    input: Update{{PascalName}}Input
  ): Promise<void> {
    // Default: no-op. Override for custom validation.
  }
}
```

##### 2. Repository Template

```typescript
// ===== TEMPLATE: src/.templates/repository.template.ts =====
// Generated alongside service

import { prisma } from "@infrastructure/database/prisma.js";
import type { Prisma, {{PascalName}} } from "@prisma/client";
import type { 
  Create{{PascalName}}Input, 
  Update{{PascalName}}Input,
  {{PascalName}}FilterOptions 
} from "./{{kebab-name}}.types.js";

/**
 * Data access layer for {{PascalName}} entity.
 * 
 * @description
 * This repository handles all database operations for {{PascalName}}.
 * Business logic should NOT be placed here - use the service layer.
 * 
 * @example
 * const repo = new {{PascalName}}Repository();
 * const entity = await repo.findById("uuid");
 */
export class {{PascalName}}Repository {
  private readonly db = prisma;

  /**
   * Creates a new {{PascalName}} record.
   */
  async create(input: Create{{PascalName}}Input): Promise<{{PascalName}}> {
    return this.db.{{camelName}}.create({
      data: input,
    });
  }

  /**
   * Finds a {{PascalName}} by primary key.
   */
  async findById(id: string): Promise<{{PascalName}} | null> {
    return this.db.{{camelName}}.findUnique({
      where: { id },
    });
  }

  /**
   * Finds multiple {{PascalName}} records with filtering.
   */
  async findMany(options: {{PascalName}}FilterOptions = {}): Promise<{{PascalName}}[]> {
    const { limit = 50, offset = 0, orderBy = "createdAt", order = "desc" } = options;
    
    return this.db.{{camelName}}.findMany({
      where: this.buildWhereClause(options),
      take: limit,
      skip: offset,
      orderBy: { [orderBy]: order },
    });
  }

  /**
   * Updates a {{PascalName}} record.
   */
  async update(id: string, input: Update{{PascalName}}Input): Promise<{{PascalName}}> {
    return this.db.{{camelName}}.update({
      where: { id },
      data: {
        ...input,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Soft-deletes a {{PascalName}} record.
   */
  async softDelete(id: string): Promise<void> {
    await this.db.{{camelName}}.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Builds Prisma where clause from filter options.
   */
  private buildWhereClause(
    options: {{PascalName}}FilterOptions
  ): Prisma.{{PascalName}}WhereInput {
    const where: Prisma.{{PascalName}}WhereInput = {
      deletedAt: null,  // Exclude soft-deleted by default
    };
    
    // Add filter conditions based on options
    // (extend as needed for specific entity)
    
    return where;
  }
}
```

##### 3. Types Template

```typescript
// ===== TEMPLATE: src/.templates/types.template.ts =====
// Generated alongside service and repository

import type { {{PascalName}} } from "@prisma/client";

// ===== INPUT TYPES =====

/**
 * Input for creating a new {{PascalName}}.
 * Omits auto-generated fields.
 */
export type Create{{PascalName}}Input = Omit<
  {{PascalName}},
  "id" | "createdAt" | "updatedAt" | "deletedAt"
>;

/**
 * Input for updating a {{PascalName}}.
 * All fields optional except those that can't change.
 */
export type Update{{PascalName}}Input = Partial<
  Omit<{{PascalName}}, "id" | "createdAt">
>;

// ===== FILTER OPTIONS =====

/**
 * Options for querying {{PascalName}} records.
 */
export interface {{PascalName}}FilterOptions {
  /** Maximum records to return (default: 50) */
  limit?: number;
  
  /** Records to skip for pagination */
  offset?: number;
  
  /** Field to order by */
  orderBy?: keyof {{PascalName}};
  
  /** Sort direction */
  order?: "asc" | "desc";
  
  // Add entity-specific filters below
}

// ===== RESPONSE TYPES =====

/**
 * Paginated response for {{PascalName}} lists.
 */
export interface {{PascalName}}ListResponse {
  data: {{PascalName}}[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// ===== RE-EXPORT PRISMA TYPE =====
export type { {{PascalName}} } from "@prisma/client";
```

##### 4. Test Template

```typescript
// ===== TEMPLATE: src/.templates/service.test.template.ts =====

import { describe, it, expect, beforeEach, vi } from "vitest";
import { {{PascalName}}Service } from "./{{kebab-name}}.service.js";
import { {{PascalName}}Repository } from "./{{kebab-name}}.repository.js";
import { mock{{PascalName}}, mock{{PascalName}}Input } from "@tests/fixtures/{{kebab-name}}.fixtures.js";

// Mock repository
vi.mock("./{{kebab-name}}.repository.js");

describe("{{PascalName}}Service", () => {
  let service: {{PascalName}}Service;
  let mockRepository: vi.Mocked<{{PascalName}}Repository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = new {{PascalName}}Repository() as vi.Mocked<{{PascalName}}Repository>;
    service = new {{PascalName}}Service(mockRepository);
  });

  describe("create", () => {
    it("should create a new {{PascalName}}", async () => {
      const input = mock{{PascalName}}Input();
      const expected = mock{{PascalName}}(input);
      
      mockRepository.create.mockResolvedValue(expected);
      
      const result = await service.create(input);
      
      expect(result).toEqual(expected);
      expect(mockRepository.create).toHaveBeenCalledWith(input);
    });

    it("should throw ValidationError for invalid input", async () => {
      const invalidInput = { /* invalid data */ };
      
      await expect(service.create(invalidInput as any))
        .rejects.toThrow("ValidationError");
    });
  });

  describe("findById", () => {
    it("should return entity when found", async () => {
      const expected = mock{{PascalName}}();
      mockRepository.findById.mockResolvedValue(expected);
      
      const result = await service.findById(expected.id);
      
      expect(result).toEqual(expected);
    });

    it("should return null when not found", async () => {
      mockRepository.findById.mockResolvedValue(null);
      
      const result = await service.findById("non-existent");
      
      expect(result).toBeNull();
    });
  });

  describe("update", () => {
    it("should update existing entity", async () => {
      const existing = mock{{PascalName}}();
      const updates = { /* update fields */ };
      const updated = { ...existing, ...updates };
      
      mockRepository.findById.mockResolvedValue(existing);
      mockRepository.update.mockResolvedValue(updated);
      
      const result = await service.update(existing.id, updates);
      
      expect(result).toEqual(updated);
    });

    it("should throw NotFoundError when entity doesn't exist", async () => {
      mockRepository.findById.mockResolvedValue(null);
      
      await expect(service.update("non-existent", {}))
        .rejects.toThrow("NotFoundError");
    });
  });

  describe("delete", () => {
    it("should soft-delete existing entity", async () => {
      const existing = mock{{PascalName}}();
      mockRepository.findById.mockResolvedValue(existing);
      mockRepository.softDelete.mockResolvedValue(undefined);
      
      await service.delete(existing.id);
      
      expect(mockRepository.softDelete).toHaveBeenCalledWith(existing.id);
    });
  });
});
```

##### 5. Command Template (Discord)

```typescript
// ===== TEMPLATE: src/.templates/command.template.ts =====
// Generate: npm run generate:command -- --name=catch --category=gameplay

import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  PermissionFlagsBits 
} from "discord.js";
import { logger } from "@shared/utils/logger.js";
import type { Command } from "@bot/types/command.types.js";

/**
 * /{{kebab-name}} command implementation.
 * 
 * @description
 * {{description}}
 * 
 * @example
 * User: /{{kebab-name}} [options]
 * Bot: [response]
 */
export const {{camelName}}Command: Command = {
  data: new SlashCommandBuilder()
    .setName("{{kebab-name}}")
    .setDescription("{{description}}")
    // Add options as needed
    .addStringOption(option =>
      option
        .setName("target")
        .setDescription("Target of the command")
        .setRequired(true)
    )
    // Uncomment for admin-only commands
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ,

  /**
   * Executes the /{{kebab-name}} command.
   */
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const commandLogger = logger.child({ 
      command: "{{kebab-name}}",
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });

    try {
      // Defer reply if operation may take >3 seconds
      await interaction.deferReply({ ephemeral: false });

      // Get command options
      const target = interaction.options.getString("target", true);

      commandLogger.debug({ target }, "Executing {{kebab-name}} command");

      // Command logic here
      const result = await this.handle{{PascalName}}(interaction, target);

      // Reply with result
      await interaction.editReply({
        content: result.message,
        // embeds: [resultEmbed],
      });

      commandLogger.info({ target }, "{{kebab-name}} command completed");
    } catch (error) {
      commandLogger.error({ error }, "{{kebab-name}} command failed");
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : "An unexpected error occurred";

      if (interaction.deferred) {
        await interaction.editReply({ content: `❌ ${errorMessage}` });
      } else {
        await interaction.reply({ content: `❌ ${errorMessage}`, ephemeral: true });
      }
    }
  },

  /**
   * Handles the core command logic.
   * Separated for easier testing.
   */
  async handle{{PascalName}}(
    interaction: ChatInputCommandInteraction,
    target: string
  ): Promise<{ success: boolean; message: string }> {
    // Implementation here
    return { success: true, message: "Command executed successfully!" };
  },
};
```

#### Template Generator Script

```typescript
// ===== FILE: scripts/generators/generate-module.ts =====

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

interface GeneratorOptions {
  name: string;           // e.g., "pokemon"
  domain: string;         // e.g., "core", "bot"
  type: "service" | "command" | "worker";
  description?: string;
}

function toPascalCase(str: string): string {
  return str.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase());
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

export function generateModule(options: GeneratorOptions): void {
  const { name, domain, type } = options;
  
  const vars = {
    "{{PascalName}}": toPascalCase(name),
    "{{camelName}}": toCamelCase(name),
    "{{kebab-name}}": toKebabCase(name),
    "{{description}}": options.description ?? `${toPascalCase(name)} operations`,
  };

  const basePath = join("src", domain, toKebabCase(name));
  mkdirSync(basePath, { recursive: true });

  // Generate files based on type
  const templates = getTemplatesForType(type);
  
  for (const template of templates) {
    const content = loadTemplate(template.path)
      .replace(/\{\{PascalName\}\}/g, vars["{{PascalName}}"])
      .replace(/\{\{camelName\}\}/g, vars["{{camelName}}"])
      .replace(/\{\{kebab-name\}\}/g, vars["{{kebab-name}}"])
      .replace(/\{\{description\}\}/g, vars["{{description}}"]);

    const outputPath = join(basePath, template.output);
    writeFileSync(outputPath, content);
    console.log(`✅ Created: ${outputPath}`);
  }

  // Generate barrel export
  generateBarrel(basePath, templates);
  
  console.log(`\n🎉 Module generated at: ${basePath}`);
}
```

#### Flaws Identified

| ID | Flaw | AI Impact | Severity |
|----|------|-----------|----------|
| TG-1 | No code generators exist | Every new feature manual | High |
| TG-2 | No template directory | No reference for patterns | High |
| TG-3 | Inconsistent service patterns | Pattern recognition fails | Medium |
| TG-4 | No test fixture generators | Tests require manual setup | Medium |
| TG-5 | No command scaffolding | Discord commands inconsistent | Medium |

#### Mitigations

**TG-1 & TG-2: Create Template Infrastructure**

```bash
# Add to package.json scripts
{
  "scripts": {
    "generate:service": "tsx scripts/generators/generate-module.ts --type=service",
    "generate:command": "tsx scripts/generators/generate-module.ts --type=command",
    "generate:barrels": "tsx scripts/generators/generate-barrels.ts",
    "generate:types-doc": "tsx scripts/generators/add-jsdoc-to-types.ts"
  }
}
```

---

### 🏗️ Part 4: Base Class Architecture Review

**Reviewer:** Architecture Specialist + AI Coding Specialist

#### Core Principle: "Extend, Don't Duplicate"

Base classes provide:
- Shared functionality across similar components
- Enforced patterns through abstract methods
- Easy extension points for customization
- Reduced boilerplate in derived classes

#### Base Class Hierarchy

```
                    ┌─────────────────────┐
                    │     BaseEntity      │
                    │  (id, timestamps)   │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌───────────────┐    ┌─────────────────┐    ┌───────────────────┐
│ BaseService   │    │ BaseRepository  │    │   BaseCommand     │
│ - CRUD ops    │    │ - DB access     │    │   - Discord API   │
│ - Validation  │    │ - Query build   │    │   - Permissions   │
│ - Logging     │    │ - Caching       │    │   - Error handle  │
└───────┬───────┘    └────────┬────────┘    └─────────┬─────────┘
        │                     │                       │
        ▼                     ▼                       ▼
┌───────────────┐    ┌─────────────────┐    ┌───────────────────┐
│ BattleService │    │ BattleRepo      │    │  CatchCommand     │
│ PokemonServ   │    │ PokemonRepo     │    │  BattleCommand    │
│ UserService   │    │ UserRepo        │    │  WalkCommand      │
└───────────────┘    └─────────────────┘    └───────────────────┘
```

#### BaseService Implementation

```typescript
// ===== FILE: src/shared/base/base.service.ts =====

import { logger as rootLogger, type Logger } from "@shared/utils/logger.js";
import type { BaseRepository } from "./base.repository.js";

/**
 * Abstract base class for all service implementations.
 * 
 * @description
 * Provides common functionality for:
 * - Structured logging with service context
 * - Standard CRUD operation signatures
 * - Validation hook points
 * - Error handling patterns
 * 
 * @template TEntity - The Prisma entity type
 * @template TCreateInput - Input type for create operations
 * @template TUpdateInput - Input type for update operations
 * @template TFilterOptions - Options for find operations
 * 
 * @example
 * export class PokemonService extends BaseService<
 *   Pokemon,
 *   CreatePokemonInput,
 *   UpdatePokemonInput,
 *   PokemonFilterOptions
 * > {
 *   constructor() {
 *     super("PokemonService", new PokemonRepository());
 *   }
 * }
 */
export abstract class BaseService<
  TEntity extends { id: string },
  TCreateInput,
  TUpdateInput,
  TFilterOptions = Record<string, unknown>
> {
  protected readonly logger: Logger;
  protected readonly repository: BaseRepository<TEntity, TCreateInput, TUpdateInput, TFilterOptions>;

  constructor(
    serviceName: string,
    repository: BaseRepository<TEntity, TCreateInput, TUpdateInput, TFilterOptions>
  ) {
    this.logger = rootLogger.child({ service: serviceName });
    this.repository = repository;
  }

  // ===== STANDARD CRUD OPERATIONS =====

  /**
   * Creates a new entity.
   * Override validateCreate() for custom validation.
   */
  async create(input: TCreateInput): Promise<TEntity> {
    this.logger.debug({ input }, "Creating entity");
    
    await this.validateCreate(input);
    const entity = await this.repository.create(input);
    await this.afterCreate(entity);
    
    this.logger.info({ id: entity.id }, "Entity created");
    return entity;
  }

  /**
   * Retrieves an entity by ID.
   */
  async findById(id: string): Promise<TEntity | null> {
    return this.repository.findById(id);
  }

  /**
   * Retrieves an entity by ID, throwing if not found.
   */
  async findByIdOrThrow(id: string): Promise<TEntity> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      throw new NotFoundError(this.constructor.name.replace("Service", ""), id);
    }
    return entity;
  }

  /**
   * Lists entities with filtering and pagination.
   */
  async findMany(options?: TFilterOptions): Promise<TEntity[]> {
    return this.repository.findMany(options);
  }

  /**
   * Updates an existing entity.
   * Override validateUpdate() for custom validation.
   */
  async update(id: string, input: TUpdateInput): Promise<TEntity> {
    this.logger.debug({ id, input }, "Updating entity");
    
    const existing = await this.findByIdOrThrow(id);
    await this.validateUpdate(existing, input);
    const updated = await this.repository.update(id, input);
    await this.afterUpdate(existing, updated);
    
    this.logger.info({ id }, "Entity updated");
    return updated;
  }

  /**
   * Soft-deletes an entity.
   */
  async delete(id: string): Promise<void> {
    this.logger.debug({ id }, "Deleting entity");
    
    const existing = await this.findByIdOrThrow(id);
    await this.validateDelete(existing);
    await this.repository.softDelete(id);
    await this.afterDelete(existing);
    
    this.logger.info({ id }, "Entity deleted");
  }

  // ===== LIFECYCLE HOOKS (override in subclass) =====

  /** Validates input before create. Throw to prevent. */
  protected async validateCreate(input: TCreateInput): Promise<void> {
    // Default: no validation. Override in subclass.
  }

  /** Validates input before update. Throw to prevent. */
  protected async validateUpdate(existing: TEntity, input: TUpdateInput): Promise<void> {
    // Default: no validation. Override in subclass.
  }

  /** Validates before delete. Throw to prevent. */
  protected async validateDelete(existing: TEntity): Promise<void> {
    // Default: no validation. Override in subclass.
  }

  /** Hook called after successful create. */
  protected async afterCreate(entity: TEntity): Promise<void> {
    // Default: no-op. Override for side effects (cache invalidation, events, etc.)
  }

  /** Hook called after successful update. */
  protected async afterUpdate(previous: TEntity, current: TEntity): Promise<void> {
    // Default: no-op. Override for side effects.
  }

  /** Hook called after successful delete. */
  protected async afterDelete(entity: TEntity): Promise<void> {
    // Default: no-op. Override for side effects.
  }
}
```

#### BaseRepository Implementation

```typescript
// ===== FILE: src/shared/base/base.repository.ts =====

import { prisma as db } from "@infrastructure/database/prisma.js";
import type { PrismaClient } from "@prisma/client";

/**
 * Abstract base class for all repository implementations.
 * 
 * @description
 * Provides common data access patterns:
 * - Standard CRUD operations
 * - Soft-delete support
 * - Query building helpers
 * - Transaction support
 * 
 * @template TEntity - The Prisma entity type
 * @template TCreateInput - Input type for create operations
 * @template TUpdateInput - Input type for update operations
 * @template TFilterOptions - Options for find operations
 */
export abstract class BaseRepository<
  TEntity extends { id: string },
  TCreateInput,
  TUpdateInput,
  TFilterOptions = Record<string, unknown>
> {
  protected readonly db: PrismaClient;
  
  /** Prisma model name for this entity (e.g., "user", "pokemon") */
  protected abstract readonly modelName: string;

  constructor(database?: PrismaClient) {
    this.db = database ?? db;
  }

  // ===== STANDARD CRUD OPERATIONS =====

  /**
   * Creates a new record.
   */
  async create(input: TCreateInput): Promise<TEntity> {
    return (this.db[this.modelName] as any).create({
      data: input,
    });
  }

  /**
   * Finds a record by primary key.
   */
  async findById(id: string): Promise<TEntity | null> {
    return (this.db[this.modelName] as any).findUnique({
      where: { id },
    });
  }

  /**
   * Finds multiple records with filtering.
   */
  async findMany(options?: TFilterOptions): Promise<TEntity[]> {
    const { limit = 50, offset = 0, orderBy, order } = (options ?? {}) as any;
    
    return (this.db[this.modelName] as any).findMany({
      where: this.buildWhereClause(options),
      take: limit,
      skip: offset,
      orderBy: orderBy ? { [orderBy]: order ?? "desc" } : undefined,
    });
  }

  /**
   * Updates a record.
   */
  async update(id: string, input: TUpdateInput): Promise<TEntity> {
    return (this.db[this.modelName] as any).update({
      where: { id },
      data: {
        ...input,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Soft-deletes a record.
   */
  async softDelete(id: string): Promise<void> {
    await (this.db[this.modelName] as any).update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Hard-deletes a record. Use with caution.
   */
  async hardDelete(id: string): Promise<void> {
    await (this.db[this.modelName] as any).delete({
      where: { id },
    });
  }

  /**
   * Counts records matching filter.
   */
  async count(options?: TFilterOptions): Promise<number> {
    return (this.db[this.modelName] as any).count({
      where: this.buildWhereClause(options),
    });
  }

  /**
   * Executes operations in a transaction.
   */
  async transaction<T>(
    operations: (tx: PrismaClient) => Promise<T>
  ): Promise<T> {
    return this.db.$transaction(operations);
  }

  // ===== ABSTRACT METHODS (must implement in subclass) =====

  /**
   * Builds Prisma where clause from filter options.
   * Override to add entity-specific filters.
   */
  protected abstract buildWhereClause(
    options?: TFilterOptions
  ): Record<string, unknown>;
}
```

#### BaseCommand Implementation

```typescript
// ===== FILE: src/shared/base/base.command.ts =====

import { 
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  type SlashCommandOptionsOnlyBuilder
} from "discord.js";
import { logger as rootLogger, type Logger } from "@shared/utils/logger.js";

/**
 * Configuration options for command registration.
 */
export interface CommandConfig {
  /** Command name (lowercase, no spaces) */
  name: string;
  
  /** Short description shown in Discord UI */
  description: string;
  
  /** Category for help organization */
  category: "gameplay" | "social" | "admin" | "utility";
  
  /** Whether command is ephemeral by default */
  ephemeral?: boolean;
  
  /** Required permissions (admin commands) */
  requiredPermissions?: bigint[];
  
  /** Cooldown in seconds */
  cooldown?: number;
}

/**
 * Abstract base class for all Discord slash commands.
 * 
 * @description
 * Provides common functionality for:
 * - Structured logging with command context
 * - Permission checking
 * - Error handling and user feedback
 * - Cooldown management
 * - Deferred reply handling
 * 
 * @example
 * export class CatchCommand extends BaseCommand {
 *   constructor() {
 *     super({
 *       name: "catch",
 *       description: "Attempt to catch a wild Pokemon",
 *       category: "gameplay",
 *       cooldown: 5,
 *     });
 *   }
 *   
 *   protected buildOptions(builder: SlashCommandBuilder) {
 *     return builder.addStringOption(opt => 
 *       opt.setName("ball").setDescription("Pokeball to use")
 *     );
 *   }
 *   
 *   protected async handle(interaction: ChatInputCommandInteraction) {
 *     // Command implementation
 *   }
 * }
 */
export abstract class BaseCommand {
  readonly config: CommandConfig;
  readonly data: SlashCommandBuilder;
  protected readonly logger: Logger;
  
  private readonly cooldowns = new Map<string, number>();

  constructor(config: CommandConfig) {
    this.config = config;
    this.logger = rootLogger.child({ command: config.name });
    
    // Build command data
    let builder = new SlashCommandBuilder()
      .setName(config.name)
      .setDescription(config.description);
    
    // Add permissions if specified
    if (config.requiredPermissions?.length) {
      builder = builder.setDefaultMemberPermissions(
        config.requiredPermissions.reduce((acc, p) => acc | p, BigInt(0))
      );
    }
    
    // Allow subclass to add options
    this.data = this.buildOptions(builder);
  }

  /**
   * Entry point for command execution.
   * Handles logging, error handling, and cooldowns.
   */
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    
    // Check cooldown
    if (!this.checkCooldown(userId)) {
      const remaining = this.getRemainingCooldown(userId);
      await interaction.reply({
        content: `⏱️ Please wait ${remaining}s before using this command again.`,
        ephemeral: true,
      });
      return;
    }

    // Log execution start
    this.logger.debug({
      userId,
      guildId: interaction.guildId,
      options: this.extractOptions(interaction),
    }, "Command execution started");

    try {
      // Defer if handler might take long
      if (this.shouldDefer()) {
        await interaction.deferReply({ ephemeral: this.config.ephemeral });
      }

      // Execute the command
      await this.handle(interaction);
      
      // Set cooldown on success
      this.setCooldown(userId);

      this.logger.info({ userId }, "Command execution completed");
    } catch (error) {
      this.logger.error({ error, userId }, "Command execution failed");
      await this.handleError(interaction, error);
    }
  }

  // ===== ABSTRACT METHODS (must implement in subclass) =====

  /**
   * Builds command options using the SlashCommandBuilder.
   * Override to add command-specific options.
   */
  protected abstract buildOptions(
    builder: SlashCommandBuilder
  ): SlashCommandBuilder;

  /**
   * Handles the command execution.
   * This is where the command logic lives.
   */
  protected abstract handle(
    interaction: ChatInputCommandInteraction
  ): Promise<void>;

  // ===== LIFECYCLE HOOKS (override in subclass) =====

  /**
   * Whether to defer the reply.
   * Override if command involves slow operations.
   */
  protected shouldDefer(): boolean {
    return false;
  }

  /**
   * Extracts options for logging.
   * Override to customize logged data.
   */
  protected extractOptions(
    interaction: ChatInputCommandInteraction
  ): Record<string, unknown> {
    const options: Record<string, unknown> = {};
    interaction.options.data.forEach(opt => {
      options[opt.name] = opt.value;
    });
    return options;
  }

  // ===== ERROR HANDLING =====

  /**
   * Handles errors during command execution.
   * Override for custom error handling.
   */
  protected async handleError(
    interaction: ChatInputCommandInteraction,
    error: unknown
  ): Promise<void> {
    const message = error instanceof Error ? error.message : "An error occurred";
    
    const content = `❌ ${message}`;
    
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  }

  // ===== COOLDOWN MANAGEMENT =====

  private checkCooldown(userId: string): boolean {
    if (!this.config.cooldown) return true;
    
    const lastUse = this.cooldowns.get(userId) ?? 0;
    return Date.now() - lastUse >= this.config.cooldown * 1000;
  }

  private setCooldown(userId: string): void {
    if (this.config.cooldown) {
      this.cooldowns.set(userId, Date.now());
    }
  }

  private getRemainingCooldown(userId: string): number {
    if (!this.config.cooldown) return 0;
    
    const lastUse = this.cooldowns.get(userId) ?? 0;
    const elapsed = (Date.now() - lastUse) / 1000;
    return Math.ceil(this.config.cooldown - elapsed);
  }
}
```

#### Flaws Identified

| ID | Flaw | AI Impact | Severity |
|----|------|-----------|----------|
| BC-1 | No base classes exist currently | Every service reinvents patterns | High |
| BC-2 | Inconsistent error handling | Unpredictable exception types | High |
| BC-3 | No standardized logging context | Hard to trace through logs | Medium |
| BC-4 | No lifecycle hooks in services | Side effects scattered | Medium |
| BC-5 | No transaction support in repos | Data integrity risks | High |

#### Mitigations

**BC-1: Create Base Class Infrastructure**

```
src/shared/base/
├── index.ts                 # Barrel export
├── base.service.ts          # BaseService class
├── base.repository.ts       # BaseRepository class
├── base.command.ts          # BaseCommand class
├── base.worker.ts           # BaseWorker class
├── errors.ts                # Standard error classes
└── types.ts                 # Shared base types
```

**BC-2: Standardized Error Classes**

```typescript
// ===== FILE: src/shared/base/errors.ts =====

/**
 * Base error class for all application errors.
 * Provides structured error information for logging and API responses.
 */
export abstract class BaseError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  readonly timestamp = new Date().toISOString();
  readonly context?: Record<string, unknown>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        timestamp: this.timestamp,
        context: this.context,
      },
    };
  }
}

/** Entity not found in database */
export class NotFoundError extends BaseError {
  readonly code = "NOT_FOUND";
  readonly httpStatus = 404;

  constructor(entityType: string, id: string) {
    super(`${entityType} not found: ${id}`, { entityType, id });
  }
}

/** Input validation failed */
export class ValidationError extends BaseError {
  readonly code = "VALIDATION_ERROR";
  readonly httpStatus = 400;
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message, { field });
    this.field = field;
  }
}

/** User lacks permission */
export class ForbiddenError extends BaseError {
  readonly code = "FORBIDDEN";
  readonly httpStatus = 403;

  constructor(action: string, resource?: string) {
    super(`Permission denied: ${action}`, { action, resource });
  }
}

/** Business rule violation */
export class BusinessError extends BaseError {
  readonly code = "BUSINESS_ERROR";
  readonly httpStatus = 422;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}

/** External service failure */
export class ExternalServiceError extends BaseError {
  readonly code = "EXTERNAL_SERVICE_ERROR";
  readonly httpStatus = 502;
  readonly service: string;

  constructor(service: string, message: string) {
    super(`${service} error: ${message}`, { service });
    this.service = service;
  }
}
```

---

### 🧭 Part 5: AI Navigation & Discovery Review

**Reviewer:** Documentation Specialist + AI Coding Specialist

#### Core Principle: "Find Anything in 3 Clicks"

AI assistants (and humans) should be able to:
1. Start at a well-known entry point (ROUTER.md)
2. Navigate to any subsystem in ≤3 hops
3. Understand purpose without reading implementation

#### ROUTER.md Enhancement Strategy

##### Current ROUTER.md Structure (Good Start)

```markdown
# ROUTER
Title: [Subsystem Name]
Purpose: [Brief description]
Owned Globs: [directory]/**
Last Updated (UTC): 2025-XX-XXT00:00:00Z
```

##### Enhanced ROUTER.md Structure (AI-Optimized)

```markdown
# ROUTER — {Subsystem Name}

> **Purpose:** {One-sentence description}  
> **Domain:** {core | bot | infrastructure | shared}  
> **Dependencies:** {List of imported modules}  
> **Dependents:** {List of modules that import this}  
> **Last Updated:** 2025-XX-XX

## Quick Start

```typescript
// Most common usage
import { MainExport } from "@{domain}/{subsystem}";

const instance = new MainExport();
await instance.commonOperation();
```

## Module Map

| File | Purpose | Exports |
|------|---------|---------|
| `index.ts` | Barrel exports | `Service`, `Repository`, `Types` |
| `{name}.service.ts` | Business logic | `{Name}Service` |
| `{name}.repository.ts` | Data access | `{Name}Repository` |
| `{name}.types.ts` | Type definitions | `Create*`, `Update*`, `*Options` |
| `{name}.test.ts` | Unit tests | — |

## Public API

### `{Name}Service`

| Method | Description | Returns |
|--------|-------------|---------|
| `create(input)` | Creates new entity | `Promise<Entity>` |
| `findById(id)` | Retrieves by ID | `Promise<Entity \| null>` |
| `findMany(options)` | Lists with filters | `Promise<Entity[]>` |
| `update(id, input)` | Updates entity | `Promise<Entity>` |
| `delete(id)` | Soft-deletes | `Promise<void>` |

## Integration Points

- **Imports from:** `@shared/base`, `@infrastructure/database`
- **Imported by:** `@bot/commands/{related}`, `@core/{related}`
- **Events emitted:** `{entity}.created`, `{entity}.updated`, `{entity}.deleted`
- **Events consumed:** None

## Related Documentation

- Architecture: `docs/architecture-bible/{section}.md`
- API Reference: `docs/api/{entity}.md`
- Test Fixtures: `tests/fixtures/{entity}.fixtures.ts`

## Change History

| Date | Change | Author |
|------|--------|--------|
| 2025-XX-XX | Initial creation | AI |
```

#### Barrel Export Strategy

Every directory with more than one public file MUST have an `index.ts`:

```typescript
// ===== FILE: src/core/battle/index.ts =====

/**
 * @module @core/battle
 * @description Battle system domain module
 * 
 * This module handles all battle-related operations:
 * - Battle creation and matchmaking
 * - Turn resolution and damage calculation
 * - Status effects and ability triggers
 * - Battle completion and rewards
 * 
 * @example
 * import { BattleService, BattleRepository } from "@core/battle";
 * 
 * const service = new BattleService();
 * const battle = await service.create({ challengerId, defenderId });
 */

// Service layer
export { BattleService } from "./battle.service.js";

// Repository layer
export { BattleRepository } from "./battle.repository.js";

// Types (re-export all)
export * from "./battle.types.js";

// Sub-modules (if any)
export * from "./damage/index.js";
export * from "./status/index.js";
```

#### Predictable Path Conventions

```
AI Navigation Mental Model:

"I need the service for Pokemon"
→ @core/pokemon → PokemonService

"I need the Discord command for catching"
→ @bot/commands/catch → catchCommand

"I need the database repository for users"
→ @core/user → UserRepository

"I need the type definitions for battles"
→ @core/battle → BattleState, TurnResult, etc.

"I need the shared utilities"
→ @shared/utils → logger, errors, etc.

PATTERN:
  Services/Repos:  @core/{domain}/{domain}.service.ts
  Commands:        @bot/commands/{name}.command.ts
  Types:           @core/{domain}/{domain}.types.ts
  Shared:          @shared/{category}/{name}.ts
```

#### Discovery Aids

##### 1. Module Dependency Graph (Auto-Generated)

```
npm run docs:dependency-graph

Output: docs/meta/dependency-graph.md

┌──────────────────────────────────────────────────────────────┐
│                      MODULE DEPENDENCIES                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  @shared/base ◄─────┬──────────────┬──────────────┐         │
│       │             │              │              │         │
│       ▼             ▼              ▼              ▼         │
│  @core/battle   @core/pokemon  @core/user   @core/item      │
│       │             │              │              │         │
│       └─────────────┴──────────────┴──────────────┘         │
│                          │                                   │
│                          ▼                                   │
│                   @bot/commands                              │
│                          │                                   │
│                          ▼                                   │
│                    @bot/handlers                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

##### 2. Type Index (Auto-Generated)

```typescript
// ===== FILE: src/shared/types/index.ts =====
// Auto-generated via: npm run generate:type-index

/**
 * @fileoverview Central type index for the entire application.
 * 
 * This file re-exports all public types from domain modules.
 * Use this for type-only imports when you need types from multiple domains.
 * 
 * @example
 * import type { 
 *   BattleState, 
 *   Pokemon, 
 *   User 
 * } from "@shared/types";
 */

// Core domain types
export type * from "@core/battle/battle.types.js";
export type * from "@core/pokemon/pokemon.types.js";
export type * from "@core/user/user.types.js";
export type * from "@core/encounter/encounter.types.js";

// Bot types
export type * from "@bot/types/command.types.js";
export type * from "@bot/types/interaction.types.js";

// Shared types
export type * from "./common.types.js";
export type * from "./database.types.js";
```

##### 3. Command Registry (Auto-Generated)

```typescript
// ===== FILE: src/bot/commands/index.ts =====
// Auto-generated via: npm run generate:command-registry

/**
 * @fileoverview Command registry for Discord bot.
 * 
 * All commands are auto-discovered and registered here.
 * To add a new command:
 * 1. Run: npm run generate:command -- --name=mycommand
 * 2. Implement the command logic
 * 3. Run: npm run generate:command-registry
 * 
 * Commands are grouped by category for help display.
 */

import type { Command } from "@bot/types/command.types.js";

// Gameplay commands
import { catchCommand } from "./catch.command.js";
import { walkCommand } from "./walk.command.js";
import { battleCommand } from "./battle.command.js";

// Social commands
import { profileCommand } from "./profile.command.js";
import { tradeCommand } from "./trade.command.js";

// Utility commands
import { helpCommand } from "./help.command.js";
import { settingsCommand } from "./settings.command.js";

// Admin commands
import { opsCommand } from "./ops.command.js";

/**
 * All registered commands, keyed by name.
 */
export const commands: Map<string, Command> = new Map([
  ["catch", catchCommand],
  ["walk", walkCommand],
  ["battle", battleCommand],
  ["profile", profileCommand],
  ["trade", tradeCommand],
  ["help", helpCommand],
  ["settings", settingsCommand],
  ["ops", opsCommand],
]);

/**
 * Commands grouped by category for help display.
 */
export const commandsByCategory = {
  gameplay: [catchCommand, walkCommand, battleCommand],
  social: [profileCommand, tradeCommand],
  utility: [helpCommand, settingsCommand],
  admin: [opsCommand],
};
```

#### Flaws Identified

| ID | Flaw | AI Impact | Severity |
|----|------|-----------|----------|
| ND-1 | ROUTER.md files lack API summaries | Must read source to understand | High |
| ND-2 | No dependency graph visualization | Hard to trace relationships | Medium |
| ND-3 | No centralized type index | Type discovery scattered | Medium |
| ND-4 | Missing barrel exports in some dirs | Direct file imports required | High |
| ND-5 | No command registry file | Commands discovered manually | Medium |

#### Mitigations

**ND-1: ROUTER.md Enhancement Script**

```typescript
// scripts/generators/enhance-routers.ts
// Reads existing ROUTER.md files and adds:
// - API tables from JSDoc
// - Import/export analysis
// - Integration point detection

npm run docs:enhance-routers
```

**ND-2: Dependency Graph Generator**

```bash
# Add to package.json
{
  "scripts": {
    "docs:dependency-graph": "madge --image docs/meta/deps.svg src/",
    "docs:circular-deps": "madge --circular src/"
  }
}
```

---

### 🚀 Part 6: Scalability & Expansion Review

**Reviewer:** Architecture Specialist + Performance Specialist

#### Core Principle: "Design for 10x, Build for 1x"

The architecture should support:
- 10x current user load without redesign
- New features via extension, not modification
- Horizontal scaling when needed
- Feature isolation via flags

#### Plugin Architecture Pattern

```typescript
// ===== FILE: src/shared/plugins/plugin.interface.ts =====

/**
 * Interface for pluggable feature modules.
 * 
 * @description
 * Plugins allow extending the application without modifying core code.
 * Each plugin:
 * - Registers itself with the plugin manager
 * - Declares its dependencies
 * - Provides lifecycle hooks
 * - Can be enabled/disabled at runtime
 * 
 * @example
 * class TradingPlugin implements Plugin {
 *   name = "trading";
 *   dependencies = ["user", "pokemon"];
 *   
 *   async onLoad() {
 *     // Register commands, services, etc.
 *   }
 * }
 */
export interface Plugin {
  /** Unique plugin identifier */
  readonly name: string;
  
  /** Semantic version */
  readonly version: string;
  
  /** Plugin description */
  readonly description: string;
  
  /** Required plugins that must load first */
  readonly dependencies: string[];
  
  /** Feature flag to enable/disable */
  readonly featureFlag?: string;

  /**
   * Called when plugin loads.
   * Register services, commands, event handlers here.
   */
  onLoad(context: PluginContext): Promise<void>;

  /**
   * Called when plugin unloads.
   * Clean up resources, unregister handlers.
   */
  onUnload(): Promise<void>;

  /**
   * Called on each request/command (optional).
   * Use for request-scoped setup.
   */
  onRequest?(context: RequestContext): Promise<void>;
}

/**
 * Context provided to plugins during load.
 */
export interface PluginContext {
  /** Register a service instance */
  registerService<T>(name: string, service: T): void;
  
  /** Register a Discord command */
  registerCommand(command: Command): void;
  
  /** Register an event handler */
  registerEventHandler(event: string, handler: EventHandler): void;
  
  /** Access another plugin's exports */
  getPlugin<T>(name: string): T | undefined;
  
  /** Access configuration */
  getConfig<T>(key: string): T;
  
  /** Access the database */
  getDatabase(): PrismaClient;
}
```

#### Plugin Manager Implementation

```typescript
// ===== FILE: src/shared/plugins/plugin-manager.ts =====

import type { Plugin, PluginContext } from "./plugin.interface.js";
import { logger } from "@shared/utils/logger.js";

/**
 * Manages plugin lifecycle and dependency resolution.
 * 
 * @example
 * const manager = new PluginManager();
 * 
 * // Register plugins
 * manager.register(new BattlePlugin());
 * manager.register(new TradingPlugin());
 * 
 * // Load all plugins (respects dependencies)
 * await manager.loadAll();
 * 
 * // Runtime enable/disable
 * await manager.disable("trading");
 */
export class PluginManager {
  private readonly plugins = new Map<string, Plugin>();
  private readonly loadedPlugins = new Set<string>();
  private readonly services = new Map<string, unknown>();
  
  /**
   * Registers a plugin for loading.
   * Does not load the plugin - call loadAll() or load(name).
   */
  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin already registered: ${plugin.name}`);
    }
    this.plugins.set(plugin.name, plugin);
    logger.info({ plugin: plugin.name, version: plugin.version }, "Plugin registered");
  }

  /**
   * Loads all registered plugins in dependency order.
   */
  async loadAll(): Promise<void> {
    const loadOrder = this.resolveLoadOrder();
    
    for (const name of loadOrder) {
      await this.load(name);
    }
    
    logger.info({ count: this.loadedPlugins.size }, "All plugins loaded");
  }

  /**
   * Loads a specific plugin and its dependencies.
   */
  async load(name: string): Promise<void> {
    if (this.loadedPlugins.has(name)) return;
    
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin not registered: ${name}`);
    }

    // Check feature flag
    if (plugin.featureFlag && !this.isFeatureEnabled(plugin.featureFlag)) {
      logger.info({ plugin: name }, "Plugin disabled by feature flag");
      return;
    }

    // Load dependencies first
    for (const dep of plugin.dependencies) {
      await this.load(dep);
    }

    // Create context and load
    const context = this.createContext(plugin);
    await plugin.onLoad(context);
    
    this.loadedPlugins.add(name);
    logger.info({ plugin: name }, "Plugin loaded");
  }

  /**
   * Unloads a plugin and dependents.
   */
  async unload(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin || !this.loadedPlugins.has(name)) return;

    // Unload dependents first
    for (const [pName, p] of this.plugins) {
      if (p.dependencies.includes(name) && this.loadedPlugins.has(pName)) {
        await this.unload(pName);
      }
    }

    await plugin.onUnload();
    this.loadedPlugins.delete(name);
    logger.info({ plugin: name }, "Plugin unloaded");
  }

  /**
   * Resolves plugin load order via topological sort.
   */
  private resolveLoadOrder(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (name: string) => {
      if (visited.has(name)) return;
      visited.add(name);

      const plugin = this.plugins.get(name);
      if (plugin) {
        for (const dep of plugin.dependencies) {
          visit(dep);
        }
        result.push(name);
      }
    };

    for (const name of this.plugins.keys()) {
      visit(name);
    }

    return result;
  }

  private createContext(plugin: Plugin): PluginContext {
    return {
      registerService: (name, service) => this.services.set(name, service),
      registerCommand: (cmd) => { /* delegate to command manager */ },
      registerEventHandler: (event, handler) => { /* delegate to event bus */ },
      getPlugin: (name) => this.plugins.get(name) as any,
      getConfig: (key) => process.env[key] as any,
      getDatabase: () => prisma,
    };
  }

  private isFeatureEnabled(flag: string): boolean {
    return process.env[`FEATURE_${flag.toUpperCase()}`] === "true";
  }
}
```

#### Feature Flag System

```typescript
// ===== FILE: src/shared/features/feature-flags.ts =====

/**
 * Feature flag configuration and runtime checking.
 * 
 * @description
 * Feature flags allow:
 * - Gradual rollout of new features
 * - A/B testing
 * - Quick disable of problematic features
 * - Environment-specific behavior
 * 
 * @example
 * if (features.isEnabled("TRADING_V2")) {
 *   return new TradingV2Service();
 * } else {
 *   return new TradingService();
 * }
 */

export interface FeatureFlag {
  /** Flag identifier (SCREAMING_SNAKE_CASE) */
  name: string;
  
  /** Human-readable description */
  description: string;
  
  /** Default state if not configured */
  defaultEnabled: boolean;
  
  /** Environments where flag is always on */
  enabledEnvironments?: ("development" | "staging" | "production")[];
  
  /** Percentage of users to enable (0-100) */
  rolloutPercentage?: number;
  
  /** Specific user IDs to enable */
  enabledUserIds?: string[];
}

/**
 * Registry of all feature flags.
 */
export const FEATURE_FLAGS: Record<string, FeatureFlag> = {
  TRADING_V2: {
    name: "TRADING_V2",
    description: "New trading system with escrow",
    defaultEnabled: false,
    enabledEnvironments: ["development"],
  },
  BATTLE_REPLAY: {
    name: "BATTLE_REPLAY",
    description: "Battle replay and sharing",
    defaultEnabled: false,
    rolloutPercentage: 10,
  },
  HOMESTEAD_CHANNELS: {
    name: "HOMESTEAD_CHANNELS",
    description: "Private guild channels for gameplay",
    defaultEnabled: true,
  },
  ANALYTICS_V2: {
    name: "ANALYTICS_V2",
    description: "Enhanced analytics with TimescaleDB",
    defaultEnabled: true,
  },
};

/**
 * Feature flag checker with caching.
 */
class FeatureFlagService {
  private readonly cache = new Map<string, boolean>();
  
  /**
   * Checks if a feature is enabled.
   * 
   * @param flagName - Feature flag identifier
   * @param userId - Optional user ID for per-user flags
   */
  isEnabled(flagName: string, userId?: string): boolean {
    const cacheKey = userId ? `${flagName}:${userId}` : flagName;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    const flag = FEATURE_FLAGS[flagName];
    if (!flag) {
      logger.warn({ flagName }, "Unknown feature flag");
      return false;
    }
    
    const enabled = this.evaluateFlag(flag, userId);
    this.cache.set(cacheKey, enabled);
    
    return enabled;
  }
  
  /**
   * Clears the flag cache (call on config reload).
   */
  clearCache(): void {
    this.cache.clear();
  }
  
  private evaluateFlag(flag: FeatureFlag, userId?: string): boolean {
    // Check environment override
    const envValue = process.env[`FEATURE_${flag.name}`];
    if (envValue !== undefined) {
      return envValue === "true";
    }
    
    // Check environment whitelist
    const env = process.env.NODE_ENV as any;
    if (flag.enabledEnvironments?.includes(env)) {
      return true;
    }
    
    // Check user whitelist
    if (userId && flag.enabledUserIds?.includes(userId)) {
      return true;
    }
    
    // Check percentage rollout
    if (userId && flag.rolloutPercentage !== undefined) {
      const hash = this.hashUserId(userId);
      return hash < flag.rolloutPercentage;
    }
    
    return flag.defaultEnabled;
  }
  
  private hashUserId(userId: string): number {
    // Simple hash to 0-100 for percentage rollout
    let hash = 0;
    for (const char of userId) {
      hash = ((hash << 5) - hash) + char.charCodeAt(0);
      hash = hash & hash;
    }
    return Math.abs(hash) % 100;
  }
}

export const features = new FeatureFlagService();
```

#### Dependency Injection Container

```typescript
// ===== FILE: src/shared/di/container.ts =====

/**
 * Simple dependency injection container.
 * 
 * @description
 * Provides:
 * - Service registration and resolution
 * - Singleton and transient lifecycles
 * - Factory functions for lazy initialization
 * - Testing support via mock injection
 * 
 * @example
 * // Registration
 * container.register("userService", UserService);
 * container.registerSingleton("database", () => new PrismaClient());
 * 
 * // Resolution
 * const userService = container.resolve<UserService>("userService");
 */

type Factory<T> = () => T;
type Constructor<T> = new (...args: any[]) => T;

interface Registration<T> {
  factory: Factory<T>;
  singleton: boolean;
  instance?: T;
}

class Container {
  private readonly registrations = new Map<string, Registration<any>>();

  /**
   * Registers a class (transient - new instance each resolve).
   */
  register<T>(name: string, ctor: Constructor<T>): void {
    this.registrations.set(name, {
      factory: () => new ctor(),
      singleton: false,
    });
  }

  /**
   * Registers a singleton (same instance for all resolves).
   */
  registerSingleton<T>(name: string, factory: Factory<T>): void {
    this.registrations.set(name, {
      factory,
      singleton: true,
    });
  }

  /**
   * Registers a specific instance.
   */
  registerInstance<T>(name: string, instance: T): void {
    this.registrations.set(name, {
      factory: () => instance,
      singleton: true,
      instance,
    });
  }

  /**
   * Resolves a service by name.
   */
  resolve<T>(name: string): T {
    const registration = this.registrations.get(name);
    if (!registration) {
      throw new Error(`Service not registered: ${name}`);
    }

    if (registration.singleton) {
      if (!registration.instance) {
        registration.instance = registration.factory();
      }
      return registration.instance;
    }

    return registration.factory();
  }

  /**
   * Checks if a service is registered.
   */
  has(name: string): boolean {
    return this.registrations.has(name);
  }

  /**
   * Clears all registrations (for testing).
   */
  clear(): void {
    this.registrations.clear();
  }
}

export const container = new Container();

/**
 * Decorator for auto-registration (future enhancement).
 */
export function Injectable(name?: string) {
  return function <T extends Constructor<any>>(target: T) {
    container.register(name ?? target.name, target);
    return target;
  };
}
```

#### Horizontal Scaling Readiness Checklist

```typescript
// ===== FILE: docs/architecture-bible/scaling-checklist.md =====

/**
 * HORIZONTAL SCALING READINESS CHECKLIST
 * 
 * Before scaling to multiple instances, verify:
 */

// 1. STATELESS SERVICES ✅
// - [ ] No in-memory state between requests
// - [ ] Session data in database/cache
// - [ ] File uploads to object storage

// 2. DATABASE SCALING ⏳
// - [ ] Connection pooling configured (PgBouncer)
// - [ ] Read replicas for query distribution
// - [ ] Sharding strategy documented

// 3. CACHE COORDINATION ⏳
// - [ ] Distributed cache (Redis) vs local
// - [ ] Cache invalidation broadcast
// - [ ] Cache stampede protection

// 4. JOB DISTRIBUTION ⏳
// - [ ] Job queue (BullMQ/Temporal)
// - [ ] Exactly-once delivery
// - [ ] Dead letter handling

// 5. LOGGING & TRACING ✅
// - [ ] Structured logging with request IDs
// - [ ] Distributed tracing (OpenTelemetry)
// - [ ] Centralized log aggregation

// 6. HEALTH CHECKS ✅
// - [ ] Liveness probe (is process running?)
// - [ ] Readiness probe (can accept traffic?)
// - [ ] Dependency health checks

// 7. GRACEFUL SHUTDOWN ✅
// - [ ] Drain existing connections
// - [ ] Complete in-flight requests
// - [ ] Flush buffers and caches
```

#### Flaws Identified

| ID | Flaw | AI Impact | Severity |
|----|------|-----------|----------|
| SE-1 | No plugin system exists | Features tightly coupled | Medium |
| SE-2 | No feature flag system | Can't toggle features | High |
| SE-3 | No DI container | Hard to swap implementations | Medium |
| SE-4 | State in memory (some places) | Can't scale horizontally | High |
| SE-5 | No scaling documentation | Unknown scaling limits | Medium |

#### Mitigations

**SE-1 & SE-2 & SE-3: Create Expansion Infrastructure**

```
src/shared/
├── plugins/
│   ├── index.ts
│   ├── plugin.interface.ts
│   ├── plugin-manager.ts
│   └── README.md
├── features/
│   ├── index.ts
│   ├── feature-flags.ts
│   └── README.md
├── di/
│   ├── index.ts
│   ├── container.ts
│   └── decorators.ts
└── README.md
```

**SE-4: State Audit and Migration**

```typescript
// Audit script: npm run audit:state

// Finds:
// - Map/Set usage that persists between requests
// - Module-level variables
// - Singleton patterns with mutable state

// Migration path:
// 1. Identify stateful code
// 2. Move to Redis/database
// 3. Use DI for testability
```

---

### 📋 Part 7: Implementation Roadmap & Priority Matrix

**Reviewer:** All Teams (Consolidated Recommendations)

#### Consolidated Flaw Summary

| ID | Category | Flaw | Severity | Sprint |
|----|----------|------|----------|--------|
| CC-1 | Code Conventions | No tsconfig path aliases | High | 1 |
| CC-2 | Code Conventions | Mixed export styles | Medium | 1 |
| CC-3 | Code Conventions | Missing barrel exports | High | 1 |
| SD-1 | Self-Documentation | Inconsistent JSDoc coverage | High | 1 |
| SD-3 | Self-Documentation | Missing @throws documentation | High | 2 |
| TG-1 | Templates | No code generators | High | 2 |
| TG-2 | Templates | No template directory | High | 2 |
| BC-1 | Base Classes | No base classes exist | High | 2 |
| BC-2 | Base Classes | Inconsistent error handling | High | 2 |
| ND-1 | Navigation | ROUTER.md lacks API summaries | High | 3 |
| ND-4 | Navigation | Missing barrel exports in dirs | High | 1 |
| SE-2 | Scalability | No feature flag system | High | 3 |
| SE-4 | Scalability | State in memory | High | 3 |

#### Sprint Allocation

##### Sprint 1: Foundation (Immediate) — Week 1-2

**Focus:** Code conventions that enable all other work

| Task | Owner | Story Points | Dependencies |
|------|-------|--------------|--------------|
| Add tsconfig path aliases | AI Coding | 3 | None |
| Create barrel exports for all dirs | AI Coding | 5 | None |
| Add ESLint named export rule | AI Coding | 2 | None |
| Define file naming conventions in docs | Documentation | 2 | None |
| Create import organization ESLint rule | AI Coding | 3 | tsconfig aliases |
| **Sprint 1 Total** | | **15 points** | |

**Definition of Done (Sprint 1):**
- [ ] `@core/*`, `@shared/*`, `@bot/*`, `@infrastructure/*` aliases work
- [ ] Every directory with >1 file has `index.ts` barrel
- [ ] ESLint fails on default exports (except React)
- [ ] File naming guide in `docs/standards/file-naming.md`

##### Sprint 2: Standardization — Week 3-4

**Focus:** Templates and base classes for uniform expansion

| Task | Owner | Story Points | Dependencies |
|------|-------|--------------|--------------|
| Create `src/.templates/` directory | AI Coding | 2 | None |
| Implement service template | AI Coding | 5 | None |
| Implement repository template | AI Coding | 3 | Service template |
| Implement types template | AI Coding | 2 | None |
| Implement test template | Testing | 3 | Service template |
| Implement command template | AI Coding | 3 | None |
| Create template generator script | AI Coding | 5 | All templates |
| Implement BaseService class | Architecture | 5 | None |
| Implement BaseRepository class | Architecture | 3 | None |
| Implement BaseCommand class | Architecture | 3 | None |
| Create standardized error classes | Architecture | 3 | None |
| Add JSDoc ESLint enforcement | AI Coding | 2 | None |
| **Sprint 2 Total** | | **39 points** | |

**Definition of Done (Sprint 2):**
- [ ] `npm run generate:service -- --name=Example` creates full module
- [ ] BaseService provides CRUD + lifecycle hooks
- [ ] BaseRepository provides query building + transactions
- [ ] BaseCommand provides logging + cooldowns + error handling
- [ ] JSDoc required on public functions (ESLint error)

##### Sprint 3: Discovery & Expansion — Week 5-6

**Focus:** AI navigation aids and expansion infrastructure

| Task | Owner | Story Points | Dependencies |
|------|-------|--------------|--------------|
| Enhance all ROUTER.md files | Documentation | 8 | Sprint 2 complete |
| Create dependency graph generator | DevOps | 3 | None |
| Create type index generator | AI Coding | 3 | Barrel exports |
| Create command registry generator | AI Coding | 3 | Command template |
| Implement feature flag system | Architecture | 5 | None |
| Implement plugin interface | Architecture | 5 | None |
| Implement plugin manager | Architecture | 5 | Plugin interface |
| Implement DI container | Architecture | 3 | None |
| Audit in-memory state | Performance | 5 | None |
| Create scaling readiness doc | Documentation | 3 | State audit |
| **Sprint 3 Total** | | **43 points** | |

**Definition of Done (Sprint 3):**
- [ ] All ROUTER.md files have API tables and integration points
- [ ] `npm run docs:dependency-graph` generates visual
- [ ] Feature flags can enable/disable features at runtime
- [ ] Plugin system can load/unload modules dynamically
- [ ] DI container allows mock injection in tests
- [ ] All stateful code documented with migration plan

#### Priority Matrix

```
                    IMPACT
            Low          High
         ┌───────────┬───────────┐
    Low  │  SD-5     │  CC-2     │
         │  ND-5     │  ND-2     │
         │           │  SE-3     │
EFFORT   ├───────────┼───────────┤
         │  TG-4     │  CC-1 ⭐  │
    High │  TG-5     │  BC-1 ⭐  │
         │  SE-1     │  TG-1 ⭐  │
         │           │  SE-2 ⭐  │
         └───────────┴───────────┘
         
⭐ = Do First (High Impact, Worth Effort)
```

#### Success Metrics

| Metric | Current | Sprint 1 | Sprint 2 | Sprint 3 |
|--------|---------|----------|----------|----------|
| Files with barrel export | ~20% | 100% | 100% | 100% |
| Functions with JSDoc | ~30% | ~30% | 80% | 90% |
| Modules using BaseService | 0 | 0 | 50% | 80% |
| Commands using BaseCommand | 0 | 0 | 100% | 100% |
| ROUTER.md with API tables | 0 | 0 | 0 | 100% |
| Features behind flags | 0 | 0 | 0 | 5+ |

#### Team Signoffs

| Specialist | Review Complete | Concerns | Approved |
|------------|-----------------|----------|----------|
| AI Coding | ✅ | Path aliases critical | ✅ |
| Documentation | ✅ | JSDoc enforcement may slow velocity | ✅ |
| Architecture | ✅ | Base classes need careful design | ✅ |
| Database | ✅ | Repository pattern fits well | ✅ |
| Testing | ✅ | Test templates essential | ✅ |
| Performance | ✅ | State audit before scaling | ✅ |
| Security | ✅ | DI helps with testing auth | ✅ |
| DevOps | ✅ | Feature flags need env config | ✅ |

---

### Summary: AI-Expandable Architecture Principles

```
┌──────────────────────────────────────────────────────────────────────────┐
│                   AI-EXPANDABLE ARCHITECTURE                             │
│                                                                          │
│  1. DISCOVERY: Find any code in 3 clicks via ROUTER.md + barrels        │
│                                                                          │
│  2. UNDERSTAND: JSDoc + self-documenting types explain everything       │
│                                                                          │
│  3. GENERATE: Templates produce consistent new code                     │
│                                                                          │
│  4. EXTEND: Base classes provide hooks, not copy-paste                  │
│                                                                          │
│  5. TOGGLE: Feature flags enable safe experimentation                   │
│                                                                          │
│  6. SCALE: Stateless services + distributed state = horizontal scale    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

Key Outcomes:
✅ AI can navigate codebase efficiently (predictable paths)
✅ AI can understand code without context (self-documenting)
✅ AI can generate new features (templates + base classes)
✅ AI can toggle features safely (feature flags)
✅ Humans benefit equally from all of the above
```

---

## Agile Review Session #3: Final Optimization Pass (FINAL)

> **Session Date:** 2025-12-03  
> **Focus:** Final scrutiny — catch everything missed, ensure bulletproof future-proofing  
> **Philosophy:** "This is the last chance to get it right before implementation begins"  
> **Scrutiny Level:** 🔴 MAXIMUM — No stone unturned

### Final Pass Objectives

This third and final review applies **elevated scrutiny** to ensure:

1. **Nothing Missed:** Every edge case, failure mode, and growth scenario considered
2. **Zero Ambiguity:** Every pattern has one clear, documented way to implement
3. **Self-Healing:** System can recover from failures without human intervention
4. **Knowledge Immortal:** Documentation survives team changes and AI model updates
5. **Automation First:** Manual processes are temporary — automate everything

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    FINAL OPTIMIZATION PILLARS                                │
│                                                                              │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐          │
│  │ RESILIENCE │   │ VERSIONING │   │ AUTOMATION │   │ KNOWLEDGE  │          │
│  │            │   │            │   │            │   │            │          │
│  │ • Recovery │   │ • API vers │   │ • CI/CD    │   │ • Onboard  │          │
│  │ • Fallback │   │ • Schema   │   │ • Doc gen  │   │ • Decision │          │
│  │ • Circuit  │   │ • Backward │   │ • Quality  │   │ • Why docs │          │
│  │   breaker  │   │   compat   │   │   gates    │   │            │          │
│  └────────────┘   └────────────┘   └────────────┘   └────────────┘          │
│         │                │                │                │                 │
│         └────────────────┴────────────────┴────────────────┘                 │
│                                   │                                          │
│                                   ▼                                          │
│                    ┌────────────────────────────┐                            │
│                    │   BULLETPROOF CODEBASE     │                            │
│                    │   Ready for any future     │                            │
│                    └────────────────────────────┘                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### 🛡️ Part 1: Resilience & Recovery Patterns Review

**Reviewer:** Architecture Specialist + DevOps Specialist + Performance Specialist

#### What Previous Reviews Missed

| Gap | Why It Matters | Risk Level |
|-----|----------------|------------|
| No retry strategy defined | Transient failures become permanent | 🔴 Critical |
| No circuit breaker implementation | Cascading failures | 🔴 Critical |
| No graceful degradation paths | Full outage vs partial | 🟡 High |
| No health check contracts | Can't detect problems | 🟡 High |
| No timeout standards | Hanging requests | 🟡 High |

#### Retry Strategy Standard

```typescript
// ===== FILE: src/shared/resilience/retry.ts =====

/**
 * Standardized retry configuration for all external calls.
 * 
 * @description
 * Every external call (database, Discord API, external services)
 * MUST use this retry wrapper. No raw calls allowed.
 * 
 * Strategy: Exponential backoff with jitter
 * - Attempt 1: Immediate
 * - Attempt 2: 100ms + jitter
 * - Attempt 3: 400ms + jitter
 * - Attempt 4: 1600ms + jitter
 * - Attempt 5: 6400ms + jitter (max)
 */

export interface RetryConfig {
  /** Maximum retry attempts (default: 5) */
  maxAttempts: number;
  
  /** Base delay in ms (default: 100) */
  baseDelay: number;
  
  /** Maximum delay in ms (default: 10000) */
  maxDelay: number;
  
  /** Jitter factor 0-1 (default: 0.2) */
  jitter: number;
  
  /** Errors that should NOT trigger retry */
  nonRetryableErrors: string[];
  
  /** Called before each retry */
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 5,
  baseDelay: 100,
  maxDelay: 10000,
  jitter: 0.2,
  nonRetryableErrors: [
    "ValidationError",
    "NotFoundError",
    "ForbiddenError",
    "AuthenticationError",
  ],
};

/**
 * Executes an operation with retry logic.
 * 
 * @example
 * const user = await withRetry(
 *   () => prisma.user.findUnique({ where: { id } }),
 *   { maxAttempts: 3, onRetry: (n, e) => logger.warn({ attempt: n, error: e }) }
 * );
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry non-retryable errors
      if (cfg.nonRetryableErrors.includes(lastError.name)) {
        throw lastError;
      }
      
      // Don't retry on last attempt
      if (attempt === cfg.maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff + jitter
      const exponentialDelay = cfg.baseDelay * Math.pow(4, attempt - 1);
      const jitterAmount = exponentialDelay * cfg.jitter * Math.random();
      const delay = Math.min(exponentialDelay + jitterAmount, cfg.maxDelay);

      cfg.onRetry?.(attempt, lastError, delay);
      
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Decorator version for class methods.
 * 
 * @example
 * class UserService {
 *   @Retryable({ maxAttempts: 3 })
 *   async findById(id: string) { ... }
 * }
 */
export function Retryable(config: Partial<RetryConfig> = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      return withRetry(() => originalMethod.apply(this, args), config);
    };
    
    return descriptor;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

#### Circuit Breaker Standard

```typescript
// ===== FILE: src/shared/resilience/circuit-breaker.ts =====

import CircuitBreaker from "opossum";
import { logger } from "@shared/utils/logger.js";

/**
 * Circuit breaker configuration standards.
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failures exceeded threshold, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 * 
 * @example
 * const dbBreaker = createCircuitBreaker("database", async () => {
 *   return prisma.$queryRaw`SELECT 1`;
 * });
 * 
 * // Usage in service
 * const result = await dbBreaker.fire();
 */

export interface CircuitBreakerConfig {
  /** Time in ms before attempting reset (default: 30000) */
  resetTimeout: number;
  
  /** Error percentage to trip circuit (default: 50) */
  errorThresholdPercentage: number;
  
  /** Minimum requests before tripping (default: 10) */
  volumeThreshold: number;
  
  /** Request timeout in ms (default: 10000) */
  timeout: number;
  
  /** Fallback function when circuit is open */
  fallback?: () => Promise<any>;
}

const DEFAULT_BREAKER_CONFIG: CircuitBreakerConfig = {
  resetTimeout: 30000,
  errorThresholdPercentage: 50,
  volumeThreshold: 10,
  timeout: 10000,
};

/** Registry of all circuit breakers for monitoring */
const breakers = new Map<string, CircuitBreaker>();

/**
 * Creates a circuit breaker for an operation.
 */
export function createCircuitBreaker<T>(
  name: string,
  operation: () => Promise<T>,
  config: Partial<CircuitBreakerConfig> = {}
): CircuitBreaker {
  const cfg = { ...DEFAULT_BREAKER_CONFIG, ...config };
  
  const breaker = new CircuitBreaker(operation, {
    name,
    timeout: cfg.timeout,
    resetTimeout: cfg.resetTimeout,
    errorThresholdPercentage: cfg.errorThresholdPercentage,
    volumeThreshold: cfg.volumeThreshold,
  });

  // Event handlers for observability
  breaker.on("open", () => {
    logger.error({ breaker: name }, "Circuit breaker OPENED - failing fast");
  });
  
  breaker.on("halfOpen", () => {
    logger.info({ breaker: name }, "Circuit breaker HALF_OPEN - testing");
  });
  
  breaker.on("close", () => {
    logger.info({ breaker: name }, "Circuit breaker CLOSED - normal operation");
  });

  breaker.on("fallback", () => {
    logger.warn({ breaker: name }, "Circuit breaker using fallback");
  });

  // Optional fallback
  if (cfg.fallback) {
    breaker.fallback(cfg.fallback);
  }

  breakers.set(name, breaker);
  return breaker;
}

/**
 * Gets all circuit breaker stats for monitoring.
 */
export function getCircuitBreakerStats(): Record<string, {
  state: string;
  stats: CircuitBreaker.Stats;
}> {
  const stats: Record<string, any> = {};
  
  for (const [name, breaker] of breakers) {
    stats[name] = {
      state: breaker.opened ? "OPEN" : breaker.halfOpen ? "HALF_OPEN" : "CLOSED",
      stats: breaker.stats,
    };
  }
  
  return stats;
}

/**
 * Standard breakers for common services.
 */
export const standardBreakers = {
  database: () => createCircuitBreaker("database", 
    () => prisma.$queryRaw`SELECT 1`,
    { timeout: 5000 }
  ),
  
  discord: () => createCircuitBreaker("discord",
    () => client.user?.fetch(),
    { timeout: 10000, resetTimeout: 60000 }
  ),
  
  cache: () => createCircuitBreaker("cache",
    () => cacheClient.ping(),
    { timeout: 1000, volumeThreshold: 5 }
  ),
};
```

#### Graceful Degradation Standard

```typescript
// ===== FILE: src/shared/resilience/degradation.ts =====

/**
 * Graceful degradation levels and fallback strategies.
 * 
 * @description
 * When a service fails, the system should degrade gracefully:
 * 1. Try the primary service
 * 2. If failed, try cached data (stale is better than nothing)
 * 3. If no cache, return safe default
 * 4. Log degradation for alerting
 * 
 * @example
 * const pokemon = await withDegradation({
 *   primary: () => pokemonService.getById(id),
 *   cached: () => cache.get(`pokemon:${id}`),
 *   default: () => ({ id, name: "Unknown", available: false }),
 *   serviceName: "pokemon-lookup",
 * });
 */

export interface DegradationConfig<T> {
  /** Primary data source */
  primary: () => Promise<T>;
  
  /** Cached/stale data source */
  cached?: () => Promise<T | null>;
  
  /** Safe default when all else fails */
  default: () => T;
  
  /** Service name for logging */
  serviceName: string;
  
  /** Max age for cached data in ms (default: 5 minutes) */
  maxCacheAge?: number;
}

export interface DegradationResult<T> {
  data: T;
  source: "primary" | "cached" | "default";
  degraded: boolean;
  error?: Error;
}

/**
 * Executes with graceful degradation.
 */
export async function withDegradation<T>(
  config: DegradationConfig<T>
): Promise<DegradationResult<T>> {
  const { primary, cached, default: getDefault, serviceName } = config;

  // Try primary source
  try {
    const data = await primary();
    return { data, source: "primary", degraded: false };
  } catch (primaryError) {
    logger.warn(
      { service: serviceName, error: primaryError },
      "Primary source failed, attempting degradation"
    );

    // Try cached source
    if (cached) {
      try {
        const cachedData = await cached();
        if (cachedData !== null) {
          logger.info(
            { service: serviceName },
            "Using cached data (degraded mode)"
          );
          return { 
            data: cachedData, 
            source: "cached", 
            degraded: true,
            error: primaryError as Error,
          };
        }
      } catch (cacheError) {
        logger.warn(
          { service: serviceName, error: cacheError },
          "Cache lookup also failed"
        );
      }
    }

    // Use default
    logger.error(
      { service: serviceName },
      "All sources failed, using default (fully degraded)"
    );
    
    return {
      data: getDefault(),
      source: "default",
      degraded: true,
      error: primaryError as Error,
    };
  }
}

/**
 * Health check response standard.
 */
export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  checks: {
    name: string;
    status: "pass" | "warn" | "fail";
    latency?: number;
    message?: string;
  }[];
  timestamp: string;
}

/**
 * Standard health check implementation.
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const checks: HealthCheckResult["checks"] = [];
  
  // Database check
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({
      name: "database",
      status: "pass",
      latency: Date.now() - dbStart,
    });
  } catch (error) {
    checks.push({
      name: "database",
      status: "fail",
      message: (error as Error).message,
    });
  }

  // Cache check
  const cacheStart = Date.now();
  try {
    await cache.ping();
    checks.push({
      name: "cache",
      status: "pass",
      latency: Date.now() - cacheStart,
    });
  } catch {
    checks.push({
      name: "cache",
      status: "warn",
      message: "Cache unavailable, using memory fallback",
    });
  }

  // Determine overall status
  const hasFail = checks.some(c => c.status === "fail");
  const hasWarn = checks.some(c => c.status === "warn");
  
  return {
    status: hasFail ? "unhealthy" : hasWarn ? "degraded" : "healthy",
    checks,
    timestamp: new Date().toISOString(),
  };
}
```

#### Timeout Standards

```typescript
// ===== FILE: src/shared/resilience/timeouts.ts =====

/**
 * Standardized timeout values across the application.
 * 
 * @description
 * EVERY async operation must have a timeout. No exceptions.
 * These constants ensure consistent behavior and prevent hanging.
 */

export const TIMEOUTS = {
  // Database operations
  DB_QUERY: 5_000,          // 5s for simple queries
  DB_TRANSACTION: 10_000,   // 10s for transactions
  DB_MIGRATION: 60_000,     // 60s for migrations
  
  // Discord API
  DISCORD_REPLY: 3_000,     // 3s to send reply
  DISCORD_DEFER: 2_500,     // 2.5s to defer (must be < 3s)
  DISCORD_EDIT: 5_000,      // 5s to edit message
  DISCORD_FETCH: 10_000,    // 10s to fetch data
  
  // Cache operations
  CACHE_GET: 500,           // 500ms for cache read
  CACHE_SET: 1_000,         // 1s for cache write
  
  // External services
  EXTERNAL_API: 15_000,     // 15s for external APIs
  WEBHOOK: 5_000,           // 5s for webhook delivery
  
  // Workers
  WORKER_TASK: 30_000,      // 30s for worker tasks
  WORKER_SHUTDOWN: 10_000,  // 10s for graceful shutdown
  
  // Health checks
  HEALTH_CHECK: 3_000,      // 3s for health check
  LIVENESS: 1_000,          // 1s for liveness probe
  READINESS: 5_000,         // 5s for readiness probe
} as const;

/**
 * Wraps a promise with a timeout.
 * 
 * @example
 * const result = await withTimeout(
 *   prisma.user.findMany(),
 *   TIMEOUTS.DB_QUERY,
 *   "User query timed out"
 * );
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = "Operation timed out"
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(errorMessage, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

export class TimeoutError extends Error {
  readonly code = "TIMEOUT";
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}
```

#### Flaws Identified (Resilience)

| ID | Flaw | Impact | Severity |
|----|------|--------|----------|
| RS-1 | No retry wrapper exists | Transient failures crash operations | 🔴 Critical |
| RS-2 | No circuit breaker implementation | Cascading failures possible | 🔴 Critical |
| RS-3 | No graceful degradation pattern | All-or-nothing failures | 🟡 High |
| RS-4 | No timeout constants | Operations can hang forever | 🟡 High |
| RS-5 | No health check contract | Can't detect/report problems | 🟡 High |

---

### 📊 Part 2: Versioning & Migration Strategies

**Reviewer:** Database Specialist + Architecture Specialist

#### What Previous Reviews Missed

| Gap | Why It Matters | Risk Level |
|-----|----------------|------------|
| No API versioning strategy | Breaking changes break clients | 🔴 Critical |
| No schema evolution pattern | Migrations become risky | 🟡 High |
| No backward compatibility rules | Old clients fail | 🟡 High |
| No deprecation process | Features removed without warning | 🟡 High |

#### API Versioning Standard

```typescript
// ===== FILE: src/shared/versioning/api-version.ts =====

/**
 * API versioning strategy.
 * 
 * @description
 * All public APIs (Discord commands, HTTP endpoints) must be versioned.
 * 
 * Version Lifecycle:
 * 1. CURRENT: Active, fully supported
 * 2. DEPRECATED: Working, but warns users
 * 3. SUNSET: Date announced for removal
 * 4. REMOVED: No longer available
 * 
 * Versioning Rules:
 * - Major: Breaking changes (v1 → v2)
 * - Minor: New features, backward compatible (v1.0 → v1.1)
 * - Patch: Bug fixes (v1.0.0 → v1.0.1)
 */

export type VersionStatus = "current" | "deprecated" | "sunset" | "removed";

export interface ApiVersion {
  version: string;
  status: VersionStatus;
  releasedAt: string;
  deprecatedAt?: string;
  sunsetAt?: string;
  removedAt?: string;
  migrationGuide?: string;
}

/**
 * API version registry.
 */
export const API_VERSIONS: Record<string, ApiVersion> = {
  "v1": {
    version: "v1",
    status: "current",
    releasedAt: "2025-12-01",
  },
  // Future versions
  // "v2": {
  //   version: "v2",
  //   status: "current",
  //   releasedAt: "2026-01-01",
  // },
};

/**
 * Checks if a version is supported.
 */
export function isVersionSupported(version: string): boolean {
  const v = API_VERSIONS[version];
  return v?.status === "current" || v?.status === "deprecated";
}

/**
 * Gets deprecation warning if applicable.
 */
export function getDeprecationWarning(version: string): string | null {
  const v = API_VERSIONS[version];
  if (v?.status === "deprecated") {
    return `API version ${version} is deprecated. ` +
           `It will be removed on ${v.sunsetAt}. ` +
           `Please migrate to the latest version.`;
  }
  return null;
}

/**
 * Decorator for versioned endpoints.
 * 
 * @example
 * @ApiVersion("v1")
 * async handleCommand(interaction: ChatInputCommandInteraction) { }
 */
export function ApiVersion(version: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      if (!isVersionSupported(version)) {
        throw new Error(`API version ${version} is no longer supported`);
      }
      
      const warning = getDeprecationWarning(version);
      if (warning) {
        logger.warn({ version, method: propertyKey }, warning);
      }
      
      return originalMethod.apply(this, args);
    };
    
    return descriptor;
  };
}
```

#### Schema Evolution Standard

```typescript
// ===== FILE: src/shared/versioning/schema-evolution.ts =====

/**
 * Schema evolution rules for safe migrations.
 * 
 * @description
 * Database schema changes must follow these rules to prevent
 * data loss and ensure zero-downtime deployments.
 * 
 * SAFE Operations (can run in production):
 * - ADD COLUMN with DEFAULT or NULL
 * - ADD INDEX (CONCURRENTLY)
 * - ADD TABLE
 * - ADD CONSTRAINT (deferred validation)
 * 
 * UNSAFE Operations (require migration strategy):
 * - DROP COLUMN (requires deprecation period)
 * - DROP TABLE (requires data archive)
 * - RENAME COLUMN (requires dual-write period)
 * - CHANGE TYPE (requires data migration)
 * - ADD NOT NULL (requires backfill)
 */

export type MigrationSafety = "safe" | "requires_strategy" | "dangerous";

export interface MigrationRule {
  operation: string;
  safety: MigrationSafety;
  strategy?: string;
  example?: string;
}

export const MIGRATION_RULES: MigrationRule[] = [
  // SAFE operations
  {
    operation: "ADD COLUMN (nullable)",
    safety: "safe",
    example: "ALTER TABLE users ADD COLUMN nickname VARCHAR(50);",
  },
  {
    operation: "ADD COLUMN (with default)",
    safety: "safe",
    example: "ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active';",
  },
  {
    operation: "ADD INDEX",
    safety: "safe",
    example: "CREATE INDEX CONCURRENTLY idx_users_email ON users(email);",
  },
  {
    operation: "ADD TABLE",
    safety: "safe",
    example: "CREATE TABLE user_preferences (...);",
  },
  
  // REQUIRES STRATEGY
  {
    operation: "DROP COLUMN",
    safety: "requires_strategy",
    strategy: `
      1. Stop writing to column in code
      2. Deploy code change
      3. Wait for old instances to drain
      4. Run migration to drop column
      5. Deprecation period: 2 weeks minimum
    `,
  },
  {
    operation: "RENAME COLUMN",
    safety: "requires_strategy",
    strategy: `
      1. Add new column
      2. Dual-write to both columns
      3. Backfill new column
      4. Switch reads to new column
      5. Stop writes to old column
      6. Drop old column after deprecation period
    `,
  },
  {
    operation: "ADD NOT NULL",
    safety: "requires_strategy",
    strategy: `
      1. Add column as nullable with default
      2. Backfill existing rows
      3. Add NOT NULL constraint
      ALTER TABLE users 
        ALTER COLUMN status SET DEFAULT 'active',
        ALTER COLUMN status SET NOT NULL;
    `,
  },
  
  // DANGEROUS
  {
    operation: "DROP TABLE",
    safety: "dangerous",
    strategy: `
      1. Archive data to backup table/storage
      2. Rename table to _deprecated_tablename
      3. Wait for deprecation period (30 days)
      4. Verify no queries hit the table
      5. Drop deprecated table
    `,
  },
  {
    operation: "CHANGE COLUMN TYPE",
    safety: "dangerous",
    strategy: `
      Use expand/contract pattern:
      1. Add new column with new type
      2. Dual-write to both
      3. Backfill new column
      4. Switch reads
      5. Stop old writes
      6. Drop old column
    `,
  },
];

/**
 * Migration template for Prisma.
 */
export const MIGRATION_TEMPLATE = `
-- Migration: {name}
-- Created: {timestamp}
-- Author: {author}
-- Safety: {safety}
--
-- Description:
-- {description}
--
-- Rollback:
-- {rollback_sql}

-- Forward migration
{forward_sql}

-- Verify migration succeeded
{verification_sql}
`;

/**
 * Pre-migration checklist.
 */
export const PRE_MIGRATION_CHECKLIST = [
  "[ ] Migration tested on staging environment",
  "[ ] Rollback script tested and verified",
  "[ ] Backup taken before migration",
  "[ ] Team notified of migration window",
  "[ ] Monitoring dashboards open",
  "[ ] On-call engineer available",
  "[ ] Feature flags ready for quick disable",
];
```

#### Backward Compatibility Contract

```typescript
// ===== FILE: src/shared/versioning/compatibility.ts =====

/**
 * Backward compatibility rules and contracts.
 * 
 * @description
 * Changes that break existing clients are prohibited without:
 * 1. Version bump (v1 → v2)
 * 2. Deprecation notice (minimum 30 days)
 * 3. Migration guide published
 * 4. Sunset date announced
 * 
 * Breaking Changes Include:
 * - Removing a field from response
 * - Changing field type
 * - Removing an endpoint/command
 * - Changing required parameters
 * - Changing error codes
 * 
 * Non-Breaking Changes:
 * - Adding new optional fields
 * - Adding new endpoints/commands
 * - Adding new enum values (at end)
 * - Adding optional parameters
 * - Performance improvements
 */

export interface CompatibilityContract {
  /** API/Feature name */
  name: string;
  
  /** Current version */
  version: string;
  
  /** List of public fields/methods */
  publicInterface: string[];
  
  /** Guaranteed behaviors */
  guarantees: string[];
  
  /** Known limitations */
  limitations: string[];
}

/**
 * Example compatibility contract for Battle API.
 */
export const BATTLE_API_CONTRACT: CompatibilityContract = {
  name: "Battle API",
  version: "v1",
  publicInterface: [
    "BattleService.create(challengerId, defenderId): Battle",
    "BattleService.submitMove(battleId, trainerId, move): TurnResult",
    "BattleService.forfeit(battleId, trainerId): Battle",
    "BattleService.getState(battleId): BattleState",
  ],
  guarantees: [
    "Battle IDs are UUIDs and never change",
    "Turn order is deterministic (speed → priority → random)",
    "Damage calculation follows Pokemon formula",
    "Status effects persist across turns until cured",
  ],
  limitations: [
    "Maximum 6 Pokemon per party",
    "Maximum 4 moves per Pokemon",
    "Battles timeout after 5 minutes of inactivity",
  ],
};

/**
 * Documents a deprecation in code.
 * 
 * @example
 * @Deprecated({
 *   since: "v1.2.0",
 *   replacement: "useNewMethod()",
 *   removalVersion: "v2.0.0",
 * })
 * oldMethod() { }
 */
export function Deprecated(info: {
  since: string;
  replacement?: string;
  removalVersion?: string;
  reason?: string;
}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = function (...args: any[]) {
      logger.warn({
        method: propertyKey,
        deprecatedSince: info.since,
        replacement: info.replacement,
        removalVersion: info.removalVersion,
      }, `DEPRECATED: ${propertyKey} is deprecated since ${info.since}`);
      
      return originalMethod.apply(this, args);
    };
    
    return descriptor;
  };
}
```

#### Flaws Identified (Versioning)

| ID | Flaw | Impact | Severity |
|----|------|--------|----------|
| VS-1 | No API versioning strategy exists | Breaking changes break clients | 🔴 Critical |
| VS-2 | No schema migration safety rules | Risky migrations | 🟡 High |
| VS-3 | No deprecation process | Surprise removals | 🟡 High |
| VS-4 | No compatibility contracts | Unstable interfaces | 🟡 High |

---

### 🤖 Part 3: Automated Documentation Pipeline

**Reviewer:** Documentation Specialist + DevOps Specialist

#### What Previous Reviews Missed

| Gap | Why It Matters | Risk Level |
|-----|----------------|------------|
| No auto-doc generation | Docs drift from code | 🟡 High |
| No schema visualization | Hard to understand data model | 🟡 High |
| No API docs generation | Manual API docs out of date | 🟡 High |
| No changelog automation | Release notes manual | 🟢 Medium |

#### Documentation Generation Pipeline

```yaml
# ===== FILE: .github/workflows/docs-generate.yml =====

name: Generate Documentation

on:
  push:
    branches: [main]
    paths:
      - 'src/**/*.ts'
      - 'prisma/schema.prisma'
  workflow_dispatch:

jobs:
  generate-docs:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      # Generate API documentation from JSDoc
      - name: Generate API Docs
        run: npm run docs:api
        # Uses TypeDoc to generate docs/api/ from src/
      
      # Generate database schema diagram
      - name: Generate Schema Diagram
        run: npm run docs:schema
        # Uses prisma-erd-generator or dbdiagram.io
      
      # Generate dependency graph
      - name: Generate Dependency Graph
        run: npm run docs:deps
        # Uses madge to generate docs/meta/deps.svg
      
      # Generate type documentation
      - name: Generate Type Docs
        run: npm run docs:types
        # Extracts all exported types to docs/types/
      
      # Update ROUTER.md files with API summaries
      - name: Update ROUTER.md files
        run: npm run docs:routers
      
      # Commit generated docs
      - name: Commit documentation
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "docs: auto-generate documentation"
          file_pattern: "docs/**/*.md docs/**/*.svg docs/**/*.html"
```

#### Schema Visualization Config

```typescript
// ===== FILE: prisma/schema-diagram.config.ts =====

/**
 * Configuration for automatic schema diagram generation.
 * 
 * Generates:
 * 1. ERD diagram (entity relationships)
 * 2. Table documentation (columns, types, constraints)
 * 3. Migration history visualization
 */

export const schemaDiagramConfig = {
  // Output paths
  output: {
    erd: "docs/architecture-bible/diagrams/database-erd.svg",
    tables: "docs/architecture-bible/database-schema.md",
    migrations: "docs/architecture-bible/migration-history.md",
  },
  
  // ERD configuration
  erd: {
    // Which tables to include
    include: ["*"],
    // Which tables to exclude
    exclude: ["_prisma_migrations"],
    // Relationship display
    showRelationships: true,
    showIndexes: true,
    showEnums: true,
  },
  
  // Table documentation format
  tableDocFormat: `
## {tableName}

{description}

### Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
{columns}

### Indexes

| Name | Columns | Unique |
|------|---------|--------|
{indexes}

### Relationships

| Type | Target | Foreign Key |
|------|--------|-------------|
{relationships}
  `,
};

/**
 * npm script to generate schema docs:
 * 
 * "docs:schema": "prisma generate && tsx scripts/generate-schema-docs.ts"
 */
```

#### API Documentation Config

```typescript
// ===== FILE: typedoc.config.ts =====

import type { TypeDocOptions } from "typedoc";

/**
 * TypeDoc configuration for API documentation generation.
 * 
 * Generates browsable API docs at docs/api/
 */
const config: Partial<TypeDocOptions> = {
  // Entry points
  entryPoints: ["src/index.ts"],
  entryPointStrategy: "expand",
  
  // Output
  out: "docs/api",
  
  // Include/exclude
  exclude: [
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/node_modules/**",
  ],
  
  // Documentation options
  includeVersion: true,
  readme: "README.md",
  
  // Theme and formatting
  theme: "default",
  hideGenerator: true,
  
  // Navigation
  navigation: {
    includeCategories: true,
    includeGroups: true,
  },
  
  // Category organization
  categorizeByGroup: true,
  defaultCategory: "Other",
  categoryOrder: [
    "Services",
    "Repositories", 
    "Commands",
    "Types",
    "Utilities",
    "*",
  ],
  
  // Validation
  validation: {
    notExported: true,
    invalidLink: true,
    notDocumented: false, // Warn but don't fail
  },
};

export default config;
```

#### Changelog Automation

```typescript
// ===== FILE: .changeset/config.json =====

{
  "$schema": "https://unpkg.com/@changesets/config@2.3.1/schema.json",
  "changelog": [
    "@changesets/changelog-github",
    { "repo": "Sherbivs/Infinity-Gauntlet" }
  ],
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}

/**
 * Workflow:
 * 1. Developer runs: npx changeset
 * 2. Selects change type (major/minor/patch)
 * 3. Writes description
 * 4. Creates .changeset/*.md file
 * 5. On merge, CI updates CHANGELOG.md
 */
```

#### Flaws Identified (Documentation Automation)

| ID | Flaw | Impact | Severity |
|----|------|--------|----------|
| DA-1 | No auto-doc generation pipeline | Docs drift from code | 🟡 High |
| DA-2 | No schema diagram generation | Hard to visualize data model | 🟡 High |
| DA-3 | No TypeDoc configuration | API docs manual | 🟡 High |
| DA-4 | No changelog automation | Release notes manual | 🟢 Medium |

---

### 🔒 Part 4: Quality Enforcement Automation

**Reviewer:** Testing Specialist + DevOps Specialist + Security Specialist

#### What Previous Reviews Missed

| Gap | Why It Matters | Risk Level |
|-----|----------------|------------|
| No pre-commit hooks | Bad code enters repo | 🔴 Critical |
| No CI quality gates | Broken code merges | 🔴 Critical |
| No automated security scans | Vulnerabilities ship | 🔴 Critical |
| No code coverage enforcement | Tests degrade over time | 🟡 High |
| No dependency audit | Supply chain attacks | 🟡 High |

#### Pre-Commit Hook Configuration

```yaml
# ===== FILE: .husky/pre-commit =====

#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run lint-staged for incremental checks
npx lint-staged
```

```json
// ===== FILE: package.json (lint-staged config) =====

{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix --max-warnings=0",
      "prettier --write"
    ],
    "*.{json,md,yml,yaml}": [
      "prettier --write"
    ],
    "prisma/schema.prisma": [
      "prisma format",
      "prisma validate"
    ]
  }
}
```

```yaml
# ===== FILE: .husky/commit-msg =====

#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Enforce conventional commit format
npx --no -- commitlint --edit ${1}
```

```javascript
// ===== FILE: commitlint.config.js =====

/**
 * Commit message format enforcement.
 * 
 * Format: type(scope): description
 * 
 * Types:
 * - feat: New feature
 * - fix: Bug fix
 * - docs: Documentation
 * - style: Formatting
 * - refactor: Code restructuring
 * - test: Adding tests
 * - chore: Maintenance
 * - perf: Performance improvement
 * - ci: CI/CD changes
 * - revert: Revert previous commit
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "test",
        "chore",
        "perf",
        "ci",
        "revert",
      ],
    ],
    "scope-enum": [
      1, // Warning only
      "always",
      [
        "bot",
        "core",
        "db",
        "api",
        "auth",
        "cache",
        "worker",
        "docs",
        "deps",
        "config",
      ],
    ],
    "subject-case": [2, "always", "lower-case"],
    "subject-max-length": [2, "always", 72],
    "body-max-line-length": [2, "always", 100],
  },
};
```

#### CI Quality Gates

```yaml
# ===== FILE: .github/workflows/quality-gates.yml =====

name: Quality Gates

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  # ========== LINT CHECK ==========
  lint:
    name: Lint Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run ESLint
        run: npm run lint -- --max-warnings=0
      
      - name: Check Prettier
        run: npm run format:check

  # ========== TYPE CHECK ==========
  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run TypeScript Check
        run: npm run typecheck

  # ========== TEST + COVERAGE ==========
  test:
    name: Test & Coverage
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests with coverage
        run: npm run test:coverage
      
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          fail_ci_if_error: true
          files: ./coverage/lcov.info
          minimum_coverage: 70
      
      - name: Check coverage threshold
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          echo "Coverage: $COVERAGE%"
          if (( $(echo "$COVERAGE < 70" | bc -l) )); then
            echo "❌ Coverage below 70% threshold"
            exit 1
          fi

  # ========== SECURITY SCAN ==========
  security:
    name: Security Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      # Audit npm dependencies
      - name: NPM Audit
        run: npm audit --audit-level=high
      
      # Scan for secrets
      - name: Scan for secrets
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          extra_args: --only-verified
      
      # CodeQL analysis
      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: typescript
      
      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3

  # ========== DEPENDENCY CHECK ==========
  deps:
    name: Dependency Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      # Check for outdated dependencies
      - name: Check outdated
        run: npm outdated || true
      
      # Check for license issues
      - name: License check
        run: npx license-checker --onlyAllow 'MIT;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause'

  # ========== BUILD CHECK ==========
  build:
    name: Build Check
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Check bundle size
        run: |
          SIZE=$(du -sb dist/ | cut -f1)
          echo "Bundle size: $SIZE bytes"
          # Fail if bundle > 50MB
          if [ $SIZE -gt 52428800 ]; then
            echo "❌ Bundle size exceeds 50MB limit"
            exit 1
          fi

  # ========== PRISMA CHECK ==========
  prisma:
    name: Prisma Schema Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Validate Prisma schema
        run: npx prisma validate
      
      - name: Check for pending migrations
        run: |
          npx prisma migrate diff \
            --from-schema-datamodel prisma/schema.prisma \
            --to-schema-datasource prisma/schema.prisma \
            --exit-code || echo "⚠️ Schema changes detected - migration needed"
```

#### Security Scanning Configuration

```yaml
# ===== FILE: .github/workflows/security-scan.yml =====

name: Security Scan

on:
  schedule:
    # Run daily at 2 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch:

jobs:
  snyk:
    name: Snyk Vulnerability Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

  trivy:
    name: Trivy Container Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Build image
        run: docker build -t infinity-gauntlet:scan .
      
      - name: Run Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'infinity-gauntlet:scan'
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'
      
      - name: Upload Trivy scan results
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: 'trivy-results.sarif'
```

#### Flaws Identified (Quality Enforcement)

| ID | Flaw | Impact | Severity |
|----|------|--------|----------|
| QE-1 | No pre-commit hooks | Bad code enters repo | 🔴 Critical |
| QE-2 | No CI quality gates | Broken code merges | 🔴 Critical |
| QE-3 | No security scanning | Vulnerabilities ship | 🔴 Critical |
| QE-4 | No coverage enforcement | Test coverage degrades | 🟡 High |
| QE-5 | No commit message standard | History unreadable | 🟢 Medium |

---

### 📚 Part 5: Knowledge Transfer & Onboarding

**Reviewer:** Documentation Specialist + Architecture Specialist + All Team Leads

#### What Previous Reviews Missed

| Gap | Why It Matters | Risk Level |
|-----|----------------|------------|
| No onboarding checklist | New devs lost | 🟡 High |
| No decision log (ADRs) | Context lost over time | 🟡 High |
| No architecture overview doc | Big picture unclear | 🟡 High |
| No "why" documentation | Decisions questioned repeatedly | 🟡 High |
| No video walkthroughs | Learning curve steep | 🟢 Medium |

#### Developer Onboarding Checklist

```markdown
<!-- ===== FILE: docs/development-bible/ONBOARDING.md ===== -->

# Developer Onboarding Checklist

Welcome to Pokémon Infinity Gauntlet! This checklist will help you get productive quickly.

## Prerequisites

- [ ] Node.js 20+ installed
- [ ] PostgreSQL 15+ installed (or Docker)
- [ ] VS Code with recommended extensions
- [ ] Git configured with SSH key
- [ ] Discord developer account

## Day 1: Environment Setup

### Local Development
- [ ] Clone repository: `git clone git@github.com:Sherbivs/Infinity-Gauntlet.git`
- [ ] Install dependencies: `npm install`
- [ ] Copy environment file: `cp .env.example .env`
- [ ] Set up database: `npm run db:setup`
- [ ] Run migrations: `npm run db:migrate`
- [ ] Verify setup: `npm test`
- [ ] Start dev server: `npm run dev`

### VS Code Setup
- [ ] Install recommended extensions (prompt on open)
- [ ] Verify ESLint working (red squiggles on errors)
- [ ] Verify Prettier working (format on save)
- [ ] Verify TypeScript working (IntelliSense active)

### Discord Bot Setup
- [ ] Create Discord application at developer portal
- [ ] Copy bot token to `.env`
- [ ] Invite bot to test server
- [ ] Verify bot responds to commands

## Day 2-3: Codebase Orientation

### Architecture Understanding
- [ ] Read `README.md` (project overview)
- [ ] Read `docs/architecture-bible/INDEX.md` (architecture deep dive)
- [ ] Review `masterroutetable.md` (navigation guide)
- [ ] Explore `src/` directory structure

### Key Files to Review
- [ ] `src/bot/index.ts` — Bot entry point
- [ ] `src/core/battle/engine.ts` — Battle system
- [ ] `src/services/pokemon.service.ts` — Pokemon service
- [ ] `prisma/schema.prisma` — Database schema

### Concepts to Understand
- [ ] Homestead channel architecture (private channels for gameplay)
- [ ] PBSL (Pokémon Battle Snapshot Language) for testing
- [ ] Event bus for cross-service communication
- [ ] Service registry for dependency injection

## Week 1: First Contribution

### Starter Tasks (Pick One)
- [ ] Add JSDoc to an undocumented function
- [ ] Write a missing unit test
- [ ] Fix a "good first issue" bug
- [ ] Improve an error message

### Code Review Process
- [ ] Fork repository (or create branch)
- [ ] Make changes following code conventions
- [ ] Run tests: `npm test`
- [ ] Run lint: `npm run lint`
- [ ] Create pull request
- [ ] Address review feedback

### Getting Help
- [ ] Join Discord development channel
- [ ] Attend weekly dev sync (optional)
- [ ] Pair with mentor on first PR

## Week 2+: Full Productivity

### Deeper Concepts
- [ ] Review ADRs (Architecture Decision Records)
- [ ] Understand worker architecture
- [ ] Learn database operations runbook
- [ ] Study error handling patterns

### Self-Assessment
- [ ] Can explain homestead architecture
- [ ] Can run and debug tests
- [ ] Can make database migrations
- [ ] Can deploy to staging environment

---

## Quick Reference

### Common Commands
| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Run dev | `npm run dev` |
| Run tests | `npm test` |
| Run lint | `npm run lint` |
| Build | `npm run build` |
| DB migrate | `npm run db:migrate` |
| DB studio | `npm run db:studio` |

### Key Documentation
| Topic | Location |
|-------|----------|
| Architecture | `docs/architecture-bible/` |
| Operations | `docs/operations-bible/` |
| Development | `docs/development-bible/` |
| API Reference | `docs/api/` |

### Contacts
| Role | Person | Contact |
|------|--------|---------|
| Lead | @Sherbivs | Discord |
| Database | @Sherbivs | Discord |
| Bot | @Sherbivs | Discord |

---

**Last Updated:** 2025-12-03
**Estimated Onboarding Time:** 1-2 weeks
```

#### Architecture Decision Records (ADRs)

```markdown
<!-- ===== FILE: docs/architecture-bible/adr/ADR-000-template.md ===== -->

# ADR-{number}: {title}

## Status
{Proposed | Accepted | Deprecated | Superseded by ADR-XXX}

## Context
What is the issue that we're seeing that is motivating this decision or change?

## Decision
What is the change that we're proposing and/or doing?

## Consequences

### Positive
- What becomes easier?
- What problems does this solve?

### Negative
- What becomes harder?
- What new problems might this create?

### Neutral
- What stays the same?

## Alternatives Considered
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Option A | ... | ... | ... |
| Option B | ... | ... | ... |

## References
- Link to relevant docs
- Link to related issues
- Link to implementation PR

---
**Author:** {name}
**Date:** {YYYY-MM-DD}
**Reviewers:** {names}
```

```markdown
<!-- ===== FILE: docs/architecture-bible/adr/ADR-001-homestead-channels.md ===== -->

# ADR-001: Homestead Channels over Discord DMs

## Status
Accepted

## Context
The original architecture used Discord DMs for private player interactions. This had several problems:
- DM delivery failures are common
- No guild admin moderation capability
- No audit trail for Discord admins
- Difficult to debug player issues
- Rate limits hit during mass notifications

## Decision
Replace Discord DMs with private guild channels called "homestead channels."
Each player gets a private channel named `homestead-{username}` in the guild.

## Consequences

### Positive
- 99.9% delivery reliability (guild messages > DMs)
- Full audit trail for guild admins
- Moderation tools available
- Easier debugging (channel history visible)
- Consistent rate limits (guild > DM)
- Social features possible (typing indicators, etc.)

### Negative
- Channel management complexity
- Potential channel spam in guild
- Requires proper permission management
- More database records (channel IDs)

### Neutral
- Code structure similar (send to channel vs DM)
- User experience nearly identical

## Alternatives Considered
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Keep DMs | Simple, familiar | Delivery issues | Core problem unsolved |
| Web dashboard | Full control | Separate app | Too complex, not Discord-native |
| Threads | Built-in | Auto-archive, visibility | Not private enough |

## References
- `docs/architecture-bible/18-private-channel-architecture.md`
- Implementation PR: #TBD

---
**Author:** Sherbivs
**Date:** 2025-11-21
**Reviewers:** Architecture Team
```

#### Flaws Identified (Knowledge Transfer)

| ID | Flaw | Impact | Severity |
|----|------|--------|----------|
| KT-1 | No onboarding checklist | New devs lost | 🟡 High |
| KT-2 | No ADR system | Decisions lost | 🟡 High |
| KT-3 | No "why" documentation | Context lost | 🟡 High |
| KT-4 | No architecture overview | Big picture unclear | 🟡 High |

---

### ✅ Part 6: Master Implementation Checklist

**Reviewer:** All Specialists (Final Consolidation)

This checklist consolidates ALL flaws and improvements from all three review sessions into a single, prioritized implementation checklist.

#### Critical (P0) — Must Implement Before Production

| ID | Task | Source | Specialist | Est. Hours |
|----|------|--------|------------|------------|
| P0-01 | Implement retry wrapper (`withRetry`) | RS-1 | Architecture | 4 |
| P0-02 | Implement circuit breaker (Opossum) | RS-2 | Architecture | 6 |
| P0-03 | Add pre-commit hooks (Husky) | QE-1 | DevOps | 2 |
| P0-04 | Add CI quality gates workflow | QE-2 | DevOps | 4 |
| P0-05 | Add security scanning (Snyk/Trivy) | QE-3 | Security | 4 |
| P0-06 | Add VACUUM automation for TimescaleDB | R1-DB-1 | Database | 3 |
| P0-07 | Add RLS for tenant isolation | R1-SEC-1 | Security | 6 |
| P0-08 | Configure path aliases (@core/, etc.) | R2-C1 | Architecture | 2 |
| P0-09 | Create base classes (BaseService, etc.) | R2-C4 | Architecture | 8 |

**P0 Total: 39 hours (1 sprint)**

#### High Priority (P1) — Implement Within First Month

| ID | Task | Source | Specialist | Est. Hours |
|----|------|--------|------------|------------|
| P1-01 | Implement graceful degradation | RS-3 | Architecture | 4 |
| P1-02 | Add timeout standards | RS-4 | Architecture | 2 |
| P1-03 | Add health check contracts | RS-5 | Architecture | 3 |
| P1-04 | Implement API versioning | VS-1 | Architecture | 4 |
| P1-05 | Document schema migration rules | VS-2 | Database | 2 |
| P1-06 | Implement deprecation decorator | VS-3 | Architecture | 2 |
| P1-07 | Add code coverage enforcement | QE-4 | Testing | 2 |
| P1-08 | Create onboarding checklist | KT-1 | Documentation | 3 |
| P1-09 | Set up ADR system | KT-2 | Documentation | 2 |
| P1-10 | Create barrel exports | R2-C2 | Architecture | 3 |
| P1-11 | Add code templates | R2-C3 | Architecture | 4 |
| P1-12 | Configure feature flags | R2-C6 | Architecture | 6 |

**P1 Total: 37 hours (1 sprint)**

#### Medium Priority (P2) — Implement Within First Quarter

| ID | Task | Source | Specialist | Est. Hours |
|----|------|--------|------------|------------|
| P2-01 | Add auto-doc generation | DA-1 | Documentation | 4 |
| P2-02 | Generate schema diagrams | DA-2 | Documentation | 3 |
| P2-03 | Configure TypeDoc | DA-3 | Documentation | 3 |
| P2-04 | Set up changelog automation | DA-4 | DevOps | 2 |
| P2-05 | Add commit message standard | QE-5 | DevOps | 1 |
| P2-06 | Write "why" documentation | KT-3 | Documentation | 4 |
| P2-07 | Create architecture overview | KT-4 | Architecture | 4 |
| P2-08 | Add plugin architecture | R2-C5 | Architecture | 8 |
| P2-09 | Add DI container | R2-C5 | Architecture | 6 |
| P2-10 | Create integration tests | R1-TEST-1 | Testing | 8 |
| P2-11 | Add chaos testing | R1-TEST-2 | Testing | 6 |
| P2-12 | Set up connection pooling | R1-PERF-1 | Performance | 4 |

**P2 Total: 53 hours (1.5 sprints)**

#### Low Priority (P3) — Implement When Resources Allow

| ID | Task | Source | Specialist | Est. Hours |
|----|------|--------|------------|------------|
| P3-01 | Create video walkthroughs | KT-5 | Documentation | 8 |
| P3-02 | Add blue/green deployment | R1-DEV-1 | DevOps | 8 |
| P3-03 | Implement secret rotation | R1-SEC-2 | Security | 6 |
| P3-04 | Add query optimization CLI | R1-PERF-2 | Performance | 4 |
| P3-05 | Create migration testing env | R1-DB-2 | Database | 6 |

**P3 Total: 32 hours (1 sprint)**

---

#### Implementation Priority Matrix

```
                    HIGH VALUE
                        │
         P0-01 (Retry)  │  P0-02 (Circuit Breaker)
         P0-03 (Hooks)  │  P0-06 (VACUUM)
                        │  P0-07 (RLS)
    ────────────────────┼────────────────────────
                        │
    LOW EFFORT          │          HIGH EFFORT
                        │
         P2-04 (Chglog) │  P2-08 (Plugins)
         P2-05 (Commit) │  P2-11 (Chaos)
         P1-06 (Deprec) │
                        │
                    LOW VALUE
```

#### Sprint Planning Summary

| Sprint | Focus | Tasks | Hours | Velocity |
|--------|-------|-------|-------|----------|
| Sprint 1 | Critical P0 | P0-01 to P0-09 | 39h | Foundation |
| Sprint 2 | High Priority P1 | P1-01 to P1-12 | 37h | Stability |
| Sprint 3-4 | Medium Priority P2 | P2-01 to P2-12 | 53h | Completeness |
| Sprint 5+ | Low Priority P3 | P3-01 to P3-05 | 32h | Excellence |

**Total Estimated Hours: 161 hours (~4 sprints at 40h/sprint)**

---

### 📋 Review #3 Final Findings Summary

| Category | Flaws Found | Critical | High | Medium |
|----------|-------------|----------|------|--------|
| Resilience & Recovery | 5 | 2 | 3 | 0 |
| Versioning & Migration | 4 | 1 | 3 | 0 |
| Documentation Automation | 4 | 0 | 3 | 1 |
| Quality Enforcement | 5 | 3 | 1 | 1 |
| Knowledge Transfer | 4 | 0 | 4 | 0 |
| **TOTAL** | **22** | **6** | **14** | **2** |

#### Team Signoffs (Review #3)

| Specialist | Approved | Notes |
|------------|----------|-------|
| Architecture Specialist | ✅ | Resilience patterns complete |
| Database Specialist | ✅ | Migration strategies solid |
| Testing Specialist | ✅ | Quality gates comprehensive |
| Security Specialist | ✅ | Security scanning included |
| DevOps Specialist | ✅ | CI/CD pipelines defined |
| Documentation Specialist | ✅ | Auto-doc pipeline ready |
| Performance Specialist | ✅ | Timeout standards clear |
| AI Coding Specialist | ✅ | All patterns AI-friendly |

---

### 🏆 Summary: Three-Review Architecture Completeness

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    REVIEW COVERAGE ANALYSIS                                  │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │   REVIEW #1     │  │   REVIEW #2     │  │   REVIEW #3     │              │
│  │                 │  │                 │  │                 │              │
│  │ • Core flaws    │  │ • AI standards  │  │ • Resilience    │              │
│  │ • DB safety     │  │ • Code patterns │  │ • Versioning    │              │
│  │ • Security      │  │ • Templates     │  │ • Automation    │              │
│  │ • Testing       │  │ • Base classes  │  │ • Quality gates │              │
│  │ • DevOps        │  │ • Navigation    │  │ • Knowledge     │              │
│  │                 │  │ • Scalability   │  │                 │              │
│  │ 30 flaws        │  │ 13 flaws        │  │ 22 flaws        │              │
│  │ 179 story pts   │  │ 97 story pts    │  │ 161 hours       │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│           │                   │                   │                          │
│           └───────────────────┴───────────────────┘                          │
│                               │                                              │
│                               ▼                                              │
│                    ┌────────────────────────────┐                            │
│                    │   65 TOTAL FLAWS FOUND     │                            │
│                    │   437 HOURS ESTIMATED      │                            │
│                    │   ~11 SPRINTS TO COMPLETE  │                            │
│                    └────────────────────────────┘                            │
│                                                                              │
│  COVERAGE: ████████████████████████████████████████████ 100%                │
│                                                                              │
│  ✅ Database operations covered                                              │
│  ✅ Security patterns covered                                                │
│  ✅ Testing strategies covered                                               │
│  ✅ DevOps pipelines covered                                                 │
│  ✅ Documentation automation covered                                         │
│  ✅ AI expandability covered                                                 │
│  ✅ Resilience patterns covered                                              │
│  ✅ Versioning strategies covered                                            │
│  ✅ Quality enforcement covered                                              │
│  ✅ Knowledge transfer covered                                               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Final Architecture Principles Summary

After three comprehensive reviews, the architecture is designed for:

1. **Uniformity** — Every file follows predictable patterns and naming
2. **Standardization** — Base classes and templates ensure consistency
3. **Scalability** — Plugin system allows infinite extension
4. **Expandability** — Feature flags enable safe feature rollout
5. **Resilience** — Retry, circuit breaker, degradation patterns
6. **Versioning** — API and schema evolution strategies
7. **Automation** — CI/CD, docs, quality gates automated
8. **Knowledge** — ADRs, onboarding, documentation complete
9. **AI-Friendly** — Navigation, discovery, templates for AI agents
10. **Future-Proof** — Backward compatibility, deprecation processes

**This architecture is ready for implementation.**

---

## Specialist Deep Dive Series: Database at the Heart

> **Purpose:** Each specialist team dives deep into their domain to centralize databases at the heart of the application, enhance systems around them, and plan future optimizations.
> 
> **Series Format:** 7 parts, each focusing on one specialist's domain expertise

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    DATABASE-CENTRIC SPECIALIST SERIES                        │
│                                                                              │
│                         ┌─────────────────┐                                  │
│                         │   PostgreSQL    │                                  │
│                         │   TimescaleDB   │                                  │
│                         │   (THE HEART)   │                                  │
│                         └────────┬────────┘                                  │
│                                  │                                           │
│        ┌─────────────────────────┼─────────────────────────┐                 │
│        │                         │                         │                 │
│        ▼                         ▼                         ▼                 │
│  ┌──────────┐             ┌──────────┐             ┌──────────┐             │
│  │ Database │             │  Perf    │             │ Security │             │
│  │Specialist│             │Specialist│             │Specialist│             │
│  │  Part 1  │             │  Part 2  │             │  Part 3  │             │
│  └──────────┘             └──────────┘             └──────────┘             │
│        │                         │                         │                 │
│        ▼                         ▼                         ▼                 │
│  ┌──────────┐             ┌──────────┐             ┌──────────┐             │
│  │  Arch    │             │  DevOps  │             │ Testing  │             │
│  │Specialist│             │Specialist│             │Specialist│             │
│  │  Part 4  │             │  Part 5  │             │  Part 6  │             │
│  └──────────┘             └──────────┘             └──────────┘             │
│        │                         │                         │                 │
│        └─────────────────────────┼─────────────────────────┘                 │
│                                  ▼                                           │
│                         ┌─────────────────┐                                  │
│                         │  Future Roadmap │                                  │
│                         │     Part 7      │                                  │
│                         └─────────────────┘                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### 🗄️ Part 1: Database Specialist Deep Dive

**Specialist:** Database Specialist  
**Focus:** PostgreSQL optimization, TimescaleDB tuning, query performance, schema design excellence  
**Goal:** Make the database the most robust, performant, and maintainable component

#### 1.1 PostgreSQL Configuration Optimization

```sql
-- ===== FILE: prisma/postgres-tuning.sql =====
-- Production PostgreSQL tuning for Pokemon Infinity Gauntlet
-- Apply via: psql $DATABASE_URL -f prisma/postgres-tuning.sql

-- ============================================
-- MEMORY CONFIGURATION
-- ============================================

-- Shared buffers: 25% of RAM (Render Standard: 2GB RAM → 512MB)
ALTER SYSTEM SET shared_buffers = '512MB';

-- Effective cache size: 75% of RAM (helps query planner)
ALTER SYSTEM SET effective_cache_size = '1536MB';

-- Work mem: For complex sorts/joins (per operation)
-- Conservative: total connections * work_mem < RAM
ALTER SYSTEM SET work_mem = '16MB';

-- Maintenance work mem: For VACUUM, CREATE INDEX
ALTER SYSTEM SET maintenance_work_mem = '128MB';

-- ============================================
-- WRITE-AHEAD LOG (WAL)
-- ============================================

-- WAL level for replication readiness
ALTER SYSTEM SET wal_level = 'replica';

-- Checkpoint settings for consistent write performance
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET checkpoint_timeout = '10min';

-- WAL buffers: 3% of shared_buffers
ALTER SYSTEM SET wal_buffers = '16MB';

-- ============================================
-- QUERY PLANNER
-- ============================================

-- Random page cost: Lower for SSDs (Render uses SSDs)
ALTER SYSTEM SET random_page_cost = 1.1;

-- Effective IO concurrency: Higher for SSDs
ALTER SYSTEM SET effective_io_concurrency = 200;

-- Enable parallel query execution
ALTER SYSTEM SET max_parallel_workers_per_gather = 2;
ALTER SYSTEM SET max_parallel_workers = 4;

-- ============================================
-- CONNECTION MANAGEMENT
-- ============================================

-- Max connections (Render manages this, but document target)
-- Target: 100 connections with pgBouncer pooling
ALTER SYSTEM SET max_connections = 100;

-- Statement timeout: Prevent runaway queries
ALTER SYSTEM SET statement_timeout = '30s';

-- Lock timeout: Prevent deadlocks from holding too long
ALTER SYSTEM SET lock_timeout = '10s';

-- Idle transaction timeout: Close abandoned transactions
ALTER SYSTEM SET idle_in_transaction_session_timeout = '60s';

-- ============================================
-- LOGGING FOR DIAGNOSTICS
-- ============================================

-- Log slow queries (> 1 second)
ALTER SYSTEM SET log_min_duration_statement = 1000;

-- Log lock waits
ALTER SYSTEM SET log_lock_waits = on;

-- Log temp file usage (indicates need for more work_mem)
ALTER SYSTEM SET log_temp_files = 0;

-- ============================================
-- AUTOVACUUM TUNING
-- ============================================

-- More aggressive autovacuum for high-write tables
ALTER SYSTEM SET autovacuum_vacuum_scale_factor = 0.1;
ALTER SYSTEM SET autovacuum_analyze_scale_factor = 0.05;

-- More autovacuum workers for parallel cleanup
ALTER SYSTEM SET autovacuum_max_workers = 4;

-- Reduce autovacuum delay for faster cleanup
ALTER SYSTEM SET autovacuum_vacuum_cost_delay = '2ms';

-- Reload configuration
SELECT pg_reload_conf();
```

#### 1.2 TimescaleDB Hypertable Optimization

```sql
-- ===== FILE: prisma/timescale-optimization.sql =====
-- TimescaleDB optimization for time-series data
-- Focus: Battle logs, metrics, audit trails

-- ============================================
-- HYPERTABLE CONFIGURATION
-- ============================================

-- Battle logs hypertable with optimal chunk size
-- Chunk interval: 1 day (balances query perf vs chunk count)
SELECT create_hypertable(
  'BattleLog',
  'timestamp',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Metrics hypertable with shorter chunks for faster queries
SELECT create_hypertable(
  'SystemMetric', 
  'timestamp',
  chunk_time_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- Audit log hypertable
SELECT create_hypertable(
  'AuditLog',
  'timestamp', 
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- ============================================
-- COMPRESSION POLICIES
-- ============================================

-- Enable compression on battle logs after 7 days
-- Compression ratio: typically 90-95% space savings
ALTER TABLE "BattleLog" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'battle_id',
  timescaledb.compress_orderby = 'timestamp DESC'
);

SELECT add_compression_policy(
  'BattleLog',
  INTERVAL '7 days',
  if_not_exists => TRUE
);

-- Compress metrics after 1 day (high volume, query recent only)
ALTER TABLE "SystemMetric" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'metric_name',
  timescaledb.compress_orderby = 'timestamp DESC'
);

SELECT add_compression_policy(
  'SystemMetric',
  INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Compress audit logs after 30 days
ALTER TABLE "AuditLog" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'user_id',
  timescaledb.compress_orderby = 'timestamp DESC'
);

SELECT add_compression_policy(
  'AuditLog',
  INTERVAL '30 days',
  if_not_exists => TRUE
);

-- ============================================
-- RETENTION POLICIES
-- ============================================

-- Drop battle log chunks older than 90 days
SELECT add_retention_policy(
  'BattleLog',
  INTERVAL '90 days',
  if_not_exists => TRUE
);

-- Drop metrics older than 30 days
SELECT add_retention_policy(
  'SystemMetric',
  INTERVAL '30 days',
  if_not_exists => TRUE
);

-- Keep audit logs for 1 year (compliance)
SELECT add_retention_policy(
  'AuditLog',
  INTERVAL '365 days',
  if_not_exists => TRUE
);

-- ============================================
-- CONTINUOUS AGGREGATES
-- ============================================

-- Hourly battle statistics (pre-computed rollups)
CREATE MATERIALIZED VIEW battle_stats_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', timestamp) AS bucket,
  COUNT(*) AS total_battles,
  COUNT(DISTINCT winner_id) AS unique_winners,
  AVG(duration_seconds) AS avg_duration,
  COUNT(*) FILTER (WHERE forfeit = true) AS forfeits
FROM "BattleLog"
GROUP BY bucket
WITH NO DATA;

-- Refresh policy: Update hourly aggregates every 30 minutes
SELECT add_continuous_aggregate_policy(
  'battle_stats_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes',
  if_not_exists => TRUE
);

-- Daily player activity rollups
CREATE MATERIALIZED VIEW player_activity_daily
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', timestamp) AS bucket,
  user_id,
  COUNT(*) AS actions,
  COUNT(DISTINCT action_type) AS unique_actions
FROM "AuditLog"
GROUP BY bucket, user_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
  'player_activity_daily',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- ============================================
-- CHUNK MANAGEMENT UTILITIES
-- ============================================

-- View chunk information
CREATE OR REPLACE VIEW chunk_info AS
SELECT
  hypertable_name,
  chunk_name,
  range_start,
  range_end,
  is_compressed,
  pg_size_pretty(total_bytes) AS size
FROM timescaledb_information.chunks
ORDER BY hypertable_name, range_start DESC;

-- Manual compression for specific time range
CREATE OR REPLACE FUNCTION compress_chunks_in_range(
  p_table TEXT,
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
) RETURNS INTEGER AS $$
DECLARE
  chunk_count INTEGER := 0;
  chunk_record RECORD;
BEGIN
  FOR chunk_record IN
    SELECT chunk_name
    FROM timescaledb_information.chunks
    WHERE hypertable_name = p_table
      AND range_start >= p_start
      AND range_end <= p_end
      AND NOT is_compressed
  LOOP
    PERFORM compress_chunk(chunk_record.chunk_name);
    chunk_count := chunk_count + 1;
  END LOOP;
  
  RETURN chunk_count;
END;
$$ LANGUAGE plpgsql;
```

#### 1.3 Advanced Indexing Strategy

```sql
-- ===== FILE: prisma/indexes-optimization.sql =====
-- Advanced indexing for query performance
-- Strategy: Cover common queries, use partial indexes, maintain balance

-- ============================================
-- USER LOOKUP INDEXES
-- ============================================

-- Primary user lookup by Discord ID (most common)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_discord_id 
ON "User"(discord_id);

-- Active users only (partial index for smaller size)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_active 
ON "User"(discord_id) 
WHERE is_active = true;

-- User search by username (case-insensitive)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_username_lower 
ON "User"(LOWER(username));

-- ============================================
-- POKEMON/MONSTER INDEXES
-- ============================================

-- Pokemon by trainer (for party/storage queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pokemon_trainer 
ON "Pokemon"(trainer_id);

-- Pokemon by species (for Pokedex queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pokemon_species 
ON "Pokemon"(species_id);

-- Pokemon in party (partial index, small subset)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pokemon_in_party 
ON "Pokemon"(trainer_id, party_position) 
WHERE party_position IS NOT NULL;

-- Composite index for storage box queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pokemon_storage 
ON "Pokemon"(trainer_id, storage_box, storage_position) 
WHERE storage_box IS NOT NULL;

-- ============================================
-- BATTLE INDEXES
-- ============================================

-- Active battles (partial index)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_battle_active 
ON "Battle"(created_at DESC) 
WHERE status = 'ACTIVE';

-- Battles by participant
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_battle_challenger 
ON "Battle"(challenger_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_battle_defender 
ON "Battle"(defender_id, created_at DESC);

-- Composite for "my battles" query
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_battle_participant 
ON "Battle"(challenger_id, defender_id, status, created_at DESC);

-- ============================================
-- ENCOUNTER INDEXES
-- ============================================

-- Recent encounters by user
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_encounter_user_recent 
ON "Encounter"(user_id, created_at DESC);

-- Active encounters only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_encounter_active 
ON "Encounter"(user_id) 
WHERE status = 'ACTIVE';

-- Encounters by area (for spawn queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_encounter_area 
ON "Encounter"(area_id, created_at DESC);

-- ============================================
-- TIMESCALEDB-SPECIFIC INDEXES
-- ============================================

-- Battle log lookup by battle ID (across chunks)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_battlelog_battle 
ON "BattleLog"(battle_id, timestamp DESC);

-- Audit log by user (for user history)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auditlog_user 
ON "AuditLog"(user_id, timestamp DESC);

-- Metrics by name for dashboard queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metric_name 
ON "SystemMetric"(metric_name, timestamp DESC);

-- ============================================
-- COVERING INDEXES (Include columns)
-- ============================================

-- User lookup with commonly needed fields (index-only scan)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_lookup_covering 
ON "User"(discord_id) 
INCLUDE (username, is_active, created_at);

-- Pokemon list with display fields
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pokemon_list_covering 
ON "Pokemon"(trainer_id, party_position) 
INCLUDE (species_id, nickname, level, current_hp);

-- ============================================
-- INDEX MAINTENANCE
-- ============================================

-- View index usage statistics
CREATE OR REPLACE VIEW index_usage_stats AS
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS times_used,
  idx_tup_read AS rows_read,
  idx_tup_fetch AS rows_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Find unused indexes (candidates for removal)
CREATE OR REPLACE VIEW unused_indexes AS
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelname NOT LIKE 'pg_%'
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Find duplicate indexes
CREATE OR REPLACE VIEW duplicate_indexes AS
SELECT
  a.indexrelid::regclass AS index1,
  b.indexrelid::regclass AS index2,
  a.indrelid::regclass AS table_name
FROM pg_index a
JOIN pg_index b ON a.indrelid = b.indrelid
  AND a.indexrelid < b.indexrelid
  AND a.indkey = b.indkey;
```

#### 1.4 Query Optimization Patterns

```typescript
// ===== FILE: src/shared/database/query-patterns.ts =====

/**
 * Database query optimization patterns.
 * 
 * @description
 * Standardized query patterns that leverage indexes,
 * minimize round trips, and optimize for common use cases.
 */

import { Prisma } from "@prisma/client";

/**
 * Pagination cursor pattern (faster than offset).
 * 
 * @description
 * Cursor-based pagination is O(1) vs O(n) for offset.
 * Always use for lists that can grow large.
 * 
 * @example
 * const { items, nextCursor } = await paginateWithCursor(
 *   prisma.pokemon,
 *   { trainerId: "123" },
 *   { cursor: lastId, take: 20 }
 * );
 */
export interface CursorPaginationOptions {
  cursor?: string;
  take?: number;
  orderBy?: string;
  orderDirection?: "asc" | "desc";
}

export interface CursorPaginationResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export async function paginateWithCursor<T extends { id: string }>(
  model: any,
  where: Record<string, any>,
  options: CursorPaginationOptions = {}
): Promise<CursorPaginationResult<T>> {
  const { cursor, take = 20, orderBy = "id", orderDirection = "desc" } = options;
  
  const items = await model.findMany({
    where,
    take: take + 1, // Fetch one extra to check for more
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : 0, // Skip the cursor item
    orderBy: { [orderBy]: orderDirection },
  });

  const hasMore = items.length > take;
  if (hasMore) items.pop(); // Remove the extra item

  return {
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id : null,
    hasMore,
  };
}

/**
 * Batch loading pattern (N+1 prevention).
 * 
 * @description
 * Load related data in batches instead of per-item queries.
 * Uses DataLoader pattern internally.
 * 
 * @example
 * const pokemonWithMoves = await batchLoadRelated(
 *   pokemon,
 *   "moves",
 *   (ids) => prisma.move.findMany({ where: { pokemonId: { in: ids } } })
 * );
 */
export async function batchLoadRelated<T extends { id: string }, R>(
  items: T[],
  relationKey: string,
  loader: (ids: string[]) => Promise<R[]>,
  foreignKey: keyof R = "pokemonId" as keyof R
): Promise<(T & { [K in typeof relationKey]: R[] })[]> {
  const ids = items.map((item) => item.id);
  const related = await loader(ids);
  
  // Group related items by foreign key
  const grouped = new Map<string, R[]>();
  for (const item of related) {
    const key = String(item[foreignKey]);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }
  
  // Attach to original items
  return items.map((item) => ({
    ...item,
    [relationKey]: grouped.get(item.id) || [],
  })) as any;
}

/**
 * Selective field loading (reduce transfer size).
 * 
 * @description
 * Only select fields that will be used.
 * Reduces memory and network overhead.
 * 
 * @example
 * const users = await selectFields(prisma.user, {
 *   where: { isActive: true },
 *   fields: ["id", "username", "discordId"],
 * });
 */
export interface SelectiveQueryOptions<T> {
  where?: Record<string, any>;
  fields: (keyof T)[];
  take?: number;
  orderBy?: Record<string, "asc" | "desc">;
}

export function buildSelectiveQuery<T>(
  options: SelectiveQueryOptions<T>
): Prisma.UserFindManyArgs {
  const select: Record<string, boolean> = {};
  for (const field of options.fields) {
    select[field as string] = true;
  }
  
  return {
    where: options.where,
    select,
    take: options.take,
    orderBy: options.orderBy,
  };
}

/**
 * Upsert pattern for idempotent operations.
 * 
 * @description
 * Create or update in a single atomic operation.
 * Prevents race conditions and duplicate handling.
 * 
 * @example
 * const trainer = await upsertByUniqueKey(prisma.trainer, {
 *   where: { odiscordId: "123" },
 *   create: { discordId: "123", username: "Ash" },
 *   update: { username: "Ash" },
 * });
 */
export async function upsertByUniqueKey<T>(
  model: any,
  options: {
    where: Record<string, any>;
    create: Record<string, any>;
    update: Record<string, any>;
  }
): Promise<T> {
  return model.upsert(options);
}

/**
 * Transaction wrapper with retry.
 * 
 * @description
 * Wraps operations in a transaction with automatic retry
 * on serialization failures (common in high-concurrency).
 * 
 * @example
 * const result = await transactionWithRetry(prisma, async (tx) => {
 *   const user = await tx.user.update(...);
 *   const pokemon = await tx.pokemon.create(...);
 *   return { user, pokemon };
 * });
 */
export async function transactionWithRetry<T>(
  prisma: any,
  operation: (tx: any) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000,
      });
    } catch (error) {
      lastError = error as Error;
      
      // Retry on serialization failure
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        const delay = Math.pow(2, attempt) * 100; // Exponential backoff
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

/**
 * Bulk insert pattern (batch writes).
 * 
 * @description
 * Insert many records efficiently in batches.
 * Prevents memory issues with large datasets.
 * 
 * @example
 * await bulkInsert(prisma.battleLog, logs, { batchSize: 100 });
 */
export async function bulkInsert<T>(
  model: any,
  data: T[],
  options: { batchSize?: number; skipDuplicates?: boolean } = {}
): Promise<number> {
  const { batchSize = 100, skipDuplicates = false } = options;
  let inserted = 0;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const result = await model.createMany({
      data: batch,
      skipDuplicates,
    });
    inserted += result.count;
  }
  
  return inserted;
}

/**
 * Count with estimate for large tables.
 * 
 * @description
 * Exact COUNT(*) is slow on large tables.
 * Use estimate for UI display, exact for critical operations.
 * 
 * @example
 * const estimate = await estimateCount("Pokemon");
 * // Returns ~1000000 in milliseconds vs minutes for exact count
 */
export async function estimateCount(
  prisma: any,
  tableName: string
): Promise<number> {
  const result = await prisma.$queryRaw<[{ estimate: bigint }]>`
    SELECT reltuples::bigint AS estimate
    FROM pg_class
    WHERE relname = ${tableName}
  `;
  
  return Number(result[0]?.estimate || 0);
}
```

#### 1.5 Database Health Monitoring

```typescript
// ===== FILE: src/shared/database/health-monitor.ts =====

/**
 * Database health monitoring and diagnostics.
 * 
 * @description
 * Continuous monitoring of database health indicators:
 * - Connection pool status
 * - Query performance
 * - Lock contention
 * - Replication lag
 * - Storage usage
 */

import { prisma } from "@shared/prisma.js";
import { logger } from "@shared/utils/logger.js";

export interface DatabaseHealth {
  status: "healthy" | "degraded" | "critical";
  metrics: DatabaseMetrics;
  alerts: DatabaseAlert[];
  timestamp: string;
}

export interface DatabaseMetrics {
  connections: {
    active: number;
    idle: number;
    max: number;
    utilization: number;
  };
  performance: {
    avgQueryTime: number;
    slowQueries: number;
    cacheHitRatio: number;
  };
  storage: {
    totalSize: string;
    tablesSize: string;
    indexesSize: string;
    utilizationPercent: number;
  };
  locks: {
    waiting: number;
    blocking: number;
  };
  replication?: {
    lag: number;
    status: string;
  };
}

export interface DatabaseAlert {
  level: "warning" | "critical";
  message: string;
  metric: string;
  value: number;
  threshold: number;
}

// Thresholds for health checks
const THRESHOLDS = {
  connectionUtilization: { warning: 70, critical: 90 },
  cacheHitRatio: { warning: 90, critical: 80 },
  slowQueryCount: { warning: 10, critical: 50 },
  avgQueryTime: { warning: 100, critical: 500 }, // milliseconds
  lockWaiting: { warning: 5, critical: 20 },
  storageUtilization: { warning: 70, critical: 85 },
  replicationLag: { warning: 5000, critical: 30000 }, // milliseconds
};

/**
 * Performs comprehensive database health check.
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const metrics = await collectDatabaseMetrics();
  const alerts = evaluateThresholds(metrics);
  
  const status = alerts.some((a) => a.level === "critical")
    ? "critical"
    : alerts.some((a) => a.level === "warning")
    ? "degraded"
    : "healthy";

  const health: DatabaseHealth = {
    status,
    metrics,
    alerts,
    timestamp: new Date().toISOString(),
  };

  // Log critical alerts
  if (status === "critical") {
    logger.error({ health }, "Database health critical");
  } else if (status === "degraded") {
    logger.warn({ health }, "Database health degraded");
  }

  return health;
}

/**
 * Collects database metrics from pg_stat views.
 */
async function collectDatabaseMetrics(): Promise<DatabaseMetrics> {
  // Connection stats
  const connectionStats = await prisma.$queryRaw<[{
    active: bigint;
    idle: bigint;
    max: bigint;
  }]>`
    SELECT 
      COUNT(*) FILTER (WHERE state = 'active') AS active,
      COUNT(*) FILTER (WHERE state = 'idle') AS idle,
      (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max
    FROM pg_stat_activity
    WHERE datname = current_database()
  `;

  // Performance stats
  const perfStats = await prisma.$queryRaw<[{
    avg_time: number;
    slow_count: bigint;
    hit_ratio: number;
  }]>`
    SELECT 
      COALESCE(AVG(mean_exec_time), 0) AS avg_time,
      COUNT(*) FILTER (WHERE mean_exec_time > 1000) AS slow_count,
      COALESCE(
        (SELECT 
          CASE WHEN (blks_hit + blks_read) > 0 
          THEN blks_hit::float / (blks_hit + blks_read) * 100 
          ELSE 100 END
        FROM pg_stat_database WHERE datname = current_database()),
        100
      ) AS hit_ratio
    FROM pg_stat_statements
    WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  `;

  // Storage stats
  const storageStats = await prisma.$queryRaw<[{
    total_size: string;
    tables_size: string;
    indexes_size: string;
  }]>`
    SELECT 
      pg_size_pretty(pg_database_size(current_database())) AS total_size,
      pg_size_pretty(
        (SELECT SUM(pg_table_size(relid)) FROM pg_stat_user_tables)
      ) AS tables_size,
      pg_size_pretty(
        (SELECT SUM(pg_indexes_size(relid)) FROM pg_stat_user_tables)
      ) AS indexes_size
  `;

  // Lock stats
  const lockStats = await prisma.$queryRaw<[{
    waiting: bigint;
    blocking: bigint;
  }]>`
    SELECT 
      COUNT(*) FILTER (WHERE NOT granted) AS waiting,
      COUNT(DISTINCT pid) FILTER (WHERE granted AND pid IN (
        SELECT blocking_pid FROM pg_blocking_pids(pid) WHERE NOT granted
      )) AS blocking
    FROM pg_locks
    WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database())
  `;

  const conn = connectionStats[0];
  const perf = perfStats[0];
  const storage = storageStats[0];
  const locks = lockStats[0];

  return {
    connections: {
      active: Number(conn.active),
      idle: Number(conn.idle),
      max: Number(conn.max),
      utilization: (Number(conn.active) + Number(conn.idle)) / Number(conn.max) * 100,
    },
    performance: {
      avgQueryTime: perf.avg_time,
      slowQueries: Number(perf.slow_count),
      cacheHitRatio: perf.hit_ratio,
    },
    storage: {
      totalSize: storage.total_size,
      tablesSize: storage.tables_size,
      indexesSize: storage.indexes_size,
      utilizationPercent: 0, // Would need disk quota info
    },
    locks: {
      waiting: Number(locks.waiting),
      blocking: Number(locks.blocking),
    },
  };
}

/**
 * Evaluates metrics against thresholds.
 */
function evaluateThresholds(metrics: DatabaseMetrics): DatabaseAlert[] {
  const alerts: DatabaseAlert[] = [];

  // Connection utilization
  if (metrics.connections.utilization >= THRESHOLDS.connectionUtilization.critical) {
    alerts.push({
      level: "critical",
      message: "Connection pool nearly exhausted",
      metric: "connectionUtilization",
      value: metrics.connections.utilization,
      threshold: THRESHOLDS.connectionUtilization.critical,
    });
  } else if (metrics.connections.utilization >= THRESHOLDS.connectionUtilization.warning) {
    alerts.push({
      level: "warning",
      message: "Connection pool utilization high",
      metric: "connectionUtilization",
      value: metrics.connections.utilization,
      threshold: THRESHOLDS.connectionUtilization.warning,
    });
  }

  // Cache hit ratio (lower is worse)
  if (metrics.performance.cacheHitRatio <= THRESHOLDS.cacheHitRatio.critical) {
    alerts.push({
      level: "critical",
      message: "Cache hit ratio critically low",
      metric: "cacheHitRatio",
      value: metrics.performance.cacheHitRatio,
      threshold: THRESHOLDS.cacheHitRatio.critical,
    });
  } else if (metrics.performance.cacheHitRatio <= THRESHOLDS.cacheHitRatio.warning) {
    alerts.push({
      level: "warning",
      message: "Cache hit ratio below optimal",
      metric: "cacheHitRatio",
      value: metrics.performance.cacheHitRatio,
      threshold: THRESHOLDS.cacheHitRatio.warning,
    });
  }

  // Slow queries
  if (metrics.performance.slowQueries >= THRESHOLDS.slowQueryCount.critical) {
    alerts.push({
      level: "critical",
      message: "Many slow queries detected",
      metric: "slowQueries",
      value: metrics.performance.slowQueries,
      threshold: THRESHOLDS.slowQueryCount.critical,
    });
  }

  // Lock contention
  if (metrics.locks.waiting >= THRESHOLDS.lockWaiting.critical) {
    alerts.push({
      level: "critical",
      message: "High lock contention detected",
      metric: "lockWaiting",
      value: metrics.locks.waiting,
      threshold: THRESHOLDS.lockWaiting.critical,
    });
  }

  return alerts;
}

/**
 * Gets slow query log for analysis.
 */
export async function getSlowQueries(limit = 20): Promise<{
  query: string;
  calls: number;
  totalTime: number;
  avgTime: number;
  rows: number;
}[]> {
  return prisma.$queryRaw`
    SELECT 
      query,
      calls,
      total_exec_time AS "totalTime",
      mean_exec_time AS "avgTime",
      rows
    FROM pg_stat_statements
    WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND mean_exec_time > 100  -- > 100ms
    ORDER BY mean_exec_time DESC
    LIMIT ${limit}
  `;
}

/**
 * Gets table bloat information.
 */
export async function getTableBloat(): Promise<{
  tableName: string;
  deadTuples: number;
  liveTuples: number;
  bloatRatio: number;
}[]> {
  return prisma.$queryRaw`
    SELECT 
      relname AS "tableName",
      n_dead_tup AS "deadTuples",
      n_live_tup AS "liveTuples",
      CASE WHEN n_live_tup > 0 
        THEN (n_dead_tup::float / n_live_tup * 100)
        ELSE 0 
      END AS "bloatRatio"
    FROM pg_stat_user_tables
    WHERE n_dead_tup > 1000
    ORDER BY n_dead_tup DESC
    LIMIT 20
  `;
}
```

#### Database Specialist Recommendations

| Area | Recommendation | Priority | Impact |
|------|---------------|----------|--------|
| **Config** | Apply postgres-tuning.sql to production | P0 | 20-50% query improvement |
| **TimescaleDB** | Enable compression policies | P0 | 90% storage reduction |
| **Indexes** | Create covering indexes for hot queries | P1 | 10x faster lookups |
| **Queries** | Use cursor pagination everywhere | P1 | O(1) vs O(n) pagination |
| **Monitoring** | Deploy health monitor worker | P1 | Proactive issue detection |
| **Maintenance** | Schedule VACUUM ANALYZE weekly | P2 | Prevent bloat |

---

### ⚡ Part 2: Performance Specialist Analysis

**Specialist:** Performance Specialist  
**Focus:** Connection pooling, caching strategies, read replicas, query optimization, latency reduction  
**Goal:** Achieve <1μs cache lookups, <50μs database writes, zero blocking operations

#### 2.1 Connection Pooling Strategy

```typescript
// ===== FILE: src/shared/database/connection-pool.ts =====

/**
 * Connection pooling configuration and management.
 * 
 * @description
 * Connection pooling is CRITICAL for database performance:
 * - Without pooling: Each query opens/closes connection (~50ms overhead)
 * - With pooling: Connections reused (~0.1ms overhead)
 * 
 * Strategy:
 * 1. Primary pool: Prisma's built-in connection pool
 * 2. External pool: PgBouncer for transaction-level pooling (future)
 * 3. Read replicas: Separate pool for read-heavy operations (future)
 */

import { PrismaClient } from "@prisma/client";

/**
 * Pool configuration optimized for Render deployment.
 * 
 * Render Standard: 2GB RAM, 100 max connections
 * Workers: 8 services sharing pool
 * Target: ~12 connections per service
 */
export const POOL_CONFIG = {
  // Connection limits
  connectionLimit: 12,           // Per service
  poolTimeout: 10,              // Seconds to wait for connection
  idleTimeout: 300,             // Close idle connections after 5 min
  
  // Query timeouts
  queryTimeout: 30000,          // 30s max query time
  transactionTimeout: 60000,    // 60s max transaction time
  
  // Health check
  healthCheckInterval: 30000,   // Check every 30s
  healthCheckQuery: "SELECT 1",
} as const;

/**
 * Creates a Prisma client with optimal pooling configuration.
 */
export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    log: [
      { level: "query", emit: "event" },
      { level: "error", emit: "stdout" },
      { level: "warn", emit: "stdout" },
    ],
  });
}

/**
 * Connection pool metrics for monitoring.
 */
export interface PoolMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  avgAcquireTime: number;
}

/**
 * Pool health check result.
 */
export interface PoolHealthCheck {
  healthy: boolean;
  latency: number;
  message?: string;
}

/**
 * Performs pool health check.
 */
export async function checkPoolHealth(
  prisma: PrismaClient
): Promise<PoolHealthCheck> {
  const start = performance.now();
  
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = performance.now() - start;
    
    return {
      healthy: latency < 100, // < 100ms is healthy
      latency,
    };
  } catch (error) {
    return {
      healthy: false,
      latency: performance.now() - start,
      message: (error as Error).message,
    };
  }
}

/**
 * PgBouncer configuration for external pooling (future).
 * 
 * Benefits:
 * - Connection multiplexing
 * - Transaction-level pooling
 * - Supports more clients than max_connections
 * - Zero-downtime failover
 */
export const PGBOUNCER_CONFIG = `
; ===== FILE: pgbouncer.ini =====
[databases]
infinity_gauntlet = host=localhost port=5432 dbname=infinity_gauntlet

[pgbouncer]
; Pool mode: transaction (best for web apps)
pool_mode = transaction

; Connection limits
max_client_conn = 1000
default_pool_size = 20
min_pool_size = 5
reserve_pool_size = 5

; Timeouts
server_connect_timeout = 15
server_idle_timeout = 600
client_idle_timeout = 0

; Logging
log_connections = 0
log_disconnections = 0
log_pooler_errors = 1

; Admin
admin_users = postgres
stats_users = stats

; Listen
listen_addr = 127.0.0.1
listen_port = 6432
`;
```

#### 2.2 Multi-Layer Caching Strategy

```typescript
// ===== FILE: src/shared/cache/cache-strategy.ts =====

/**
 * Multi-layer caching strategy for maximum performance.
 * 
 * @description
 * Layer 1 (L1): In-memory Map - <1μs reads
 * Layer 2 (L2): Redis/SQLite - <1ms reads
 * Layer 3 (L3): PostgreSQL - <50ms reads
 * 
 * Cache-aside pattern with write-through for consistency.
 */

import { logger } from "@shared/utils/logger.js";

/**
 * Cache layer interface.
 */
export interface CacheLayer<T> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  stats(): CacheStats;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  memoryUsage: number;
}

/**
 * L1 Cache: In-memory with LRU eviction.
 * 
 * @description
 * Ultra-fast but volatile. Best for:
 * - Frequently accessed data
 * - Data that can be rebuilt from L2/L3
 * - Session-scoped data
 * 
 * Performance: <1μs read/write
 */
export class L1MemoryCache<T> implements CacheLayer<T> {
  private cache = new Map<string, { value: T; expires: number }>();
  private maxSize: number;
  private hits = 0;
  private misses = 0;

  constructor(options: { maxSize?: number } = {}) {
    this.maxSize = options.maxSize ?? 10000;
  }

  async get(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }

    if (entry.expires && entry.expires < Date.now()) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.value;
  }

  async set(key: string, value: T, ttlSeconds = 300): Promise<void> {
    // LRU eviction if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expires: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  private estimateMemoryUsage(): number {
    // Rough estimate: ~1KB per entry
    return this.cache.size * 1024;
  }
}

/**
 * L2 Cache: SQLite for persistence.
 * 
 * @description
 * Fast local persistence. Best for:
 * - Data that survives restarts
 * - Larger datasets
 * - Offline capability
 * 
 * Performance: <1ms read, <5ms write
 */
export class L2SqliteCache<T> implements CacheLayer<T> {
  private db: any; // better-sqlite3 instance
  private hits = 0;
  private misses = 0;

  constructor(dbPath: string) {
    // Initialize SQLite database
    // Implementation uses better-sqlite3 for sync operations
  }

  async get(key: string): Promise<T | null> {
    // SELECT value, expires FROM cache WHERE key = ?
    // Check expiration, return parsed JSON
    return null;
  }

  async set(key: string, value: T, ttlSeconds = 3600): Promise<void> {
    // INSERT OR REPLACE INTO cache (key, value, expires) VALUES (?, ?, ?)
  }

  async delete(key: string): Promise<void> {
    // DELETE FROM cache WHERE key = ?
  }

  async clear(): Promise<void> {
    // DELETE FROM cache
  }

  stats(): CacheStats {
    return { hits: this.hits, misses: this.misses, size: 0, memoryUsage: 0 };
  }
}

/**
 * Multi-layer cache orchestrator.
 * 
 * @description
 * Coordinates L1, L2, L3 caches with:
 * - Read-through: L1 miss → L2 miss → L3 → populate L1/L2
 * - Write-through: Write to all layers
 * - Invalidation: Clear from all layers
 */
export class MultiLayerCache<T> {
  constructor(
    private l1: CacheLayer<T>,
    private l2: CacheLayer<T>,
    private l3Loader: (key: string) => Promise<T | null>
  ) {}

  /**
   * Get with read-through.
   */
  async get(key: string): Promise<T | null> {
    // Try L1
    let value = await this.l1.get(key);
    if (value !== null) {
      return value;
    }

    // Try L2
    value = await this.l2.get(key);
    if (value !== null) {
      // Populate L1
      await this.l1.set(key, value, 300);
      return value;
    }

    // Load from L3 (database)
    value = await this.l3Loader(key);
    if (value !== null) {
      // Populate L1 and L2
      await Promise.all([
        this.l1.set(key, value, 300),
        this.l2.set(key, value, 3600),
      ]);
    }

    return value;
  }

  /**
   * Set with write-through.
   */
  async set(key: string, value: T): Promise<void> {
    await Promise.all([
      this.l1.set(key, value, 300),
      this.l2.set(key, value, 3600),
    ]);
  }

  /**
   * Invalidate across all layers.
   */
  async invalidate(key: string): Promise<void> {
    await Promise.all([
      this.l1.delete(key),
      this.l2.delete(key),
    ]);
  }

  /**
   * Get combined stats.
   */
  stats(): { l1: CacheStats; l2: CacheStats } {
    return {
      l1: this.l1.stats(),
      l2: this.l2.stats(),
    };
  }
}

/**
 * Cache key patterns for consistency.
 */
export const CACHE_KEYS = {
  // User data
  user: (id: string) => `user:${id}`,
  userByDiscord: (discordId: string) => `user:discord:${discordId}`,
  
  // Pokemon data
  pokemon: (id: string) => `pokemon:${id}`,
  pokemonByTrainer: (trainerId: string) => `pokemon:trainer:${trainerId}`,
  party: (trainerId: string) => `party:${trainerId}`,
  
  // Static data
  species: (id: number) => `species:${id}`,
  move: (id: number) => `move:${id}`,
  typeChart: () => "type:chart",
  
  // Battle data
  battle: (id: string) => `battle:${id}`,
  activeBattles: () => "battles:active",
  
  // Computed/aggregate
  leaderboard: (type: string) => `leaderboard:${type}`,
  dailyStats: (date: string) => `stats:daily:${date}`,
} as const;

/**
 * Cache TTL configuration by data type.
 */
export const CACHE_TTL = {
  // User data: Short TTL, frequent changes
  user: 60,           // 1 minute
  party: 30,          // 30 seconds
  
  // Pokemon data: Medium TTL
  pokemon: 300,       // 5 minutes
  
  // Static data: Long TTL
  species: 86400,     // 24 hours
  move: 86400,        // 24 hours
  typeChart: 86400,   // 24 hours
  
  // Battle data: Very short TTL
  battle: 10,         // 10 seconds
  activeBattles: 5,   // 5 seconds
  
  // Computed: Medium TTL
  leaderboard: 300,   // 5 minutes
  dailyStats: 3600,   // 1 hour
} as const;
```

#### 2.3 Read Replica Planning

```typescript
// ===== FILE: src/shared/database/read-replica.ts =====

/**
 * Read replica strategy for scaling read-heavy workloads.
 * 
 * @description
 * Current: Single primary database
 * Future: Primary + N read replicas for horizontal scaling
 * 
 * Read replicas handle:
 * - Leaderboard queries
 * - Search operations
 * - Analytics/reporting
 * - Pokedex lookups
 * 
 * Primary handles:
 * - All writes (battles, catches, trades)
 * - Transactional reads (battle state)
 */

import { PrismaClient } from "@prisma/client";

/**
 * Database routing configuration.
 */
export interface DatabaseRoutingConfig {
  primary: {
    url: string;
    maxConnections: number;
  };
  replicas: {
    url: string;
    maxConnections: number;
    weight: number; // For load balancing
  }[];
  routing: {
    readFromReplica: boolean;
    replicaLagThreshold: number; // Max acceptable lag in ms
  };
}

/**
 * Query router for primary/replica selection.
 */
export class QueryRouter {
  private primary: PrismaClient;
  private replicas: PrismaClient[] = [];
  private currentReplicaIndex = 0;

  constructor(config: DatabaseRoutingConfig) {
    this.primary = new PrismaClient({
      datasources: { db: { url: config.primary.url } },
    });

    for (const replica of config.replicas) {
      this.replicas.push(new PrismaClient({
        datasources: { db: { url: replica.url } },
      }));
    }
  }

  /**
   * Get client for write operations (always primary).
   */
  getWriteClient(): PrismaClient {
    return this.primary;
  }

  /**
   * Get client for read operations (primary or replica).
   */
  getReadClient(options: { requireFresh?: boolean } = {}): PrismaClient {
    // If fresh data required or no replicas, use primary
    if (options.requireFresh || this.replicas.length === 0) {
      return this.primary;
    }

    // Round-robin replica selection
    const replica = this.replicas[this.currentReplicaIndex];
    this.currentReplicaIndex = (this.currentReplicaIndex + 1) % this.replicas.length;
    return replica;
  }

  /**
   * Execute read query with automatic routing.
   */
  async read<T>(
    operation: (client: PrismaClient) => Promise<T>,
    options: { requireFresh?: boolean } = {}
  ): Promise<T> {
    const client = this.getReadClient(options);
    return operation(client);
  }

  /**
   * Execute write query (always on primary).
   */
  async write<T>(
    operation: (client: PrismaClient) => Promise<T>
  ): Promise<T> {
    return operation(this.primary);
  }

  /**
   * Execute transaction (always on primary).
   */
  async transaction<T>(
    operation: (tx: PrismaClient) => Promise<T>
  ): Promise<T> {
    return this.primary.$transaction(operation);
  }
}

/**
 * Decorator for read operations that can use replicas.
 * 
 * @example
 * class PokemonService {
 *   @ReadFromReplica()
 *   async getPokedex() { ... }
 *   
 *   @ReadFromReplica({ requireFresh: true })
 *   async getBattleState() { ... }
 * }
 */
export function ReadFromReplica(options: { requireFresh?: boolean } = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (this: any, ...args: any[]) {
      const router = this.queryRouter as QueryRouter;
      const client = router.getReadClient(options);
      
      // Inject client into method context
      return originalMethod.apply({ ...this, prisma: client }, args);
    };
    
    return descriptor;
  };
}

/**
 * Operations that should always use primary (fresh data required).
 */
export const FRESH_READ_OPERATIONS = [
  "getBattleState",
  "getActiveBattle",
  "getPartyForBattle",
  "getEncounterState",
  "getTradeState",
] as const;

/**
 * Operations safe for replica reads (can tolerate slight lag).
 */
export const REPLICA_SAFE_OPERATIONS = [
  "getPokedex",
  "getLeaderboard",
  "searchPokemon",
  "getPlayerStats",
  "getSpeciesInfo",
  "getMoveInfo",
  "getTypeChart",
] as const;
```

#### 2.4 Query Performance Optimization

```typescript
// ===== FILE: src/shared/database/query-optimizer.ts =====

/**
 * Query performance optimization utilities.
 * 
 * @description
 * Tools for identifying and fixing slow queries:
 * - Query analysis with EXPLAIN ANALYZE
 * - Index recommendations
 * - Query rewriting suggestions
 */

import { prisma } from "@shared/prisma.js";
import { logger } from "@shared/utils/logger.js";

/**
 * Query execution plan analysis.
 */
export interface QueryPlan {
  query: string;
  plan: any;
  executionTime: number;
  planningTime: number;
  recommendations: string[];
}

/**
 * Analyzes query execution plan.
 */
export async function analyzeQuery(query: string): Promise<QueryPlan> {
  const result = await prisma.$queryRawUnsafe<any[]>(
    `EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS, FORMAT JSON) ${query}`
  );

  const plan = result[0]["QUERY PLAN"][0];
  const recommendations: string[] = [];

  // Analyze plan for issues
  analyzeNodeRecursive(plan.Plan, recommendations);

  return {
    query,
    plan: plan.Plan,
    executionTime: plan["Execution Time"],
    planningTime: plan["Planning Time"],
    recommendations,
  };
}

/**
 * Recursively analyzes plan nodes for optimization opportunities.
 */
function analyzeNodeRecursive(node: any, recommendations: string[]): void {
  // Check for sequential scans on large tables
  if (node["Node Type"] === "Seq Scan" && node["Actual Rows"] > 1000) {
    recommendations.push(
      `Sequential scan on ${node["Relation Name"]} returned ${node["Actual Rows"]} rows. ` +
      `Consider adding index on filter columns.`
    );
  }

  // Check for nested loop with high row counts
  if (node["Node Type"] === "Nested Loop" && node["Actual Rows"] > 10000) {
    recommendations.push(
      `Nested loop join produced ${node["Actual Rows"]} rows. ` +
      `Consider hash join or adding indexes.`
    );
  }

  // Check for sorts without index
  if (node["Node Type"] === "Sort" && node["Sort Method"]?.includes("external")) {
    recommendations.push(
      `External sort detected (spilling to disk). ` +
      `Consider adding index to avoid sort or increasing work_mem.`
    );
  }

  // Check for hash aggregates with high memory
  if (node["Node Type"] === "HashAggregate" && node["Peak Memory Usage"] > 10000) {
    recommendations.push(
      `Hash aggregate using ${node["Peak Memory Usage"]}kB. ` +
      `Consider increasing work_mem or restructuring query.`
    );
  }

  // Recurse into child nodes
  if (node.Plans) {
    for (const child of node.Plans) {
      analyzeNodeRecursive(child, recommendations);
    }
  }
}

/**
 * Query rewriter for common optimizations.
 */
export const QUERY_REWRITES = {
  /**
   * Replace COUNT(*) with estimate for large tables.
   */
  useCountEstimate: (tableName: string) => `
    SELECT reltuples::bigint AS count
    FROM pg_class
    WHERE relname = '${tableName}'
  `,

  /**
   * Replace IN with EXISTS for better performance.
   */
  inToExists: (originalQuery: string) => {
    // Pattern: WHERE column IN (SELECT ...)
    // Rewrite: WHERE EXISTS (SELECT 1 FROM ... WHERE ...)
    return originalQuery; // Would need actual implementation
  },

  /**
   * Add covering columns to avoid table lookup.
   */
  suggestCoveringIndex: (columns: string[], includeColumns: string[]) => {
    return `CREATE INDEX idx_covering ON table(${columns.join(", ")}) ` +
           `INCLUDE (${includeColumns.join(", ")})`;
  },
};

/**
 * Performance profiler for tracking query times.
 */
export class QueryProfiler {
  private queries: Map<string, {
    count: number;
    totalTime: number;
    maxTime: number;
    avgTime: number;
  }> = new Map();

  /**
   * Records query execution time.
   */
  record(query: string, timeMs: number): void {
    const normalized = this.normalizeQuery(query);
    const existing = this.queries.get(normalized) || {
      count: 0,
      totalTime: 0,
      maxTime: 0,
      avgTime: 0,
    };

    existing.count++;
    existing.totalTime += timeMs;
    existing.maxTime = Math.max(existing.maxTime, timeMs);
    existing.avgTime = existing.totalTime / existing.count;

    this.queries.set(normalized, existing);
  }

  /**
   * Gets slowest queries.
   */
  getSlowest(limit = 10): Array<{
    query: string;
    count: number;
    avgTime: number;
    maxTime: number;
  }> {
    return Array.from(this.queries.entries())
      .map(([query, stats]) => ({ query, ...stats }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, limit);
  }

  /**
   * Normalizes query for grouping.
   */
  private normalizeQuery(query: string): string {
    return query
      .replace(/\s+/g, " ")
      .replace(/'[^']*'/g, "?")
      .replace(/\d+/g, "?")
      .trim()
      .substring(0, 200);
  }
}

/**
 * Prisma middleware for query profiling.
 */
export function createQueryProfilingMiddleware(profiler: QueryProfiler) {
  return async (params: any, next: any) => {
    const start = performance.now();
    const result = await next(params);
    const duration = performance.now() - start;

    const query = `${params.model}.${params.action}`;
    profiler.record(query, duration);

    if (duration > 100) {
      logger.warn(
        { query, duration, args: params.args },
        "Slow query detected"
      );
    }

    return result;
  };
}
```

#### 2.5 Latency Targets & SLOs

```typescript
// ===== FILE: src/shared/database/slo.ts =====

/**
 * Service Level Objectives for database operations.
 * 
 * @description
 * Defines latency targets and availability requirements.
 * All database operations must meet these SLOs.
 */

/**
 * Latency SLOs by operation type.
 */
export const LATENCY_SLOS = {
  // Cache operations (L1 in-memory)
  cacheRead: {
    p50: 0.001,    // 1μs
    p95: 0.01,     // 10μs
    p99: 0.1,      // 100μs
    max: 1,        // 1ms
  },
  
  // Cache write
  cacheWrite: {
    p50: 0.001,    // 1μs
    p95: 0.01,     // 10μs
    p99: 0.1,      // 100μs
    max: 1,        // 1ms
  },
  
  // Database read (with cache miss)
  dbRead: {
    p50: 5,        // 5ms
    p95: 20,       // 20ms
    p99: 50,       // 50ms
    max: 100,      // 100ms
  },
  
  // Database write
  dbWrite: {
    p50: 10,       // 10ms
    p95: 30,       // 30ms
    p99: 50,       // 50ms
    max: 100,      // 100ms
  },
  
  // Transaction (multi-statement)
  dbTransaction: {
    p50: 20,       // 20ms
    p95: 50,       // 50ms
    p99: 100,      // 100ms
    max: 500,      // 500ms
  },
  
  // Complex query (joins, aggregates)
  dbComplexQuery: {
    p50: 50,       // 50ms
    p95: 200,      // 200ms
    p99: 500,      // 500ms
    max: 1000,     // 1s
  },
} as const;

/**
 * Availability SLOs.
 */
export const AVAILABILITY_SLOS = {
  // Database must be available 99.9% of time
  database: 0.999,
  
  // Cache can have slightly lower availability
  cache: 0.99,
  
  // Read replicas can have lower availability
  replica: 0.99,
} as const;

/**
 * Throughput SLOs (requests per second).
 */
export const THROUGHPUT_SLOS = {
  // Read operations
  dbReads: 1000,      // 1000 reads/sec sustained
  cacheReads: 10000,  // 10000 cache reads/sec
  
  // Write operations
  dbWrites: 500,      // 500 writes/sec sustained
  cacheWrites: 5000,  // 5000 cache writes/sec
  
  // Peak handling
  peakMultiplier: 3,  // Handle 3x sustained for bursts
} as const;

/**
 * SLO monitoring and alerting.
 */
export class SLOMonitor {
  private measurements: Map<string, number[]> = new Map();

  /**
   * Records a measurement.
   */
  record(operation: keyof typeof LATENCY_SLOS, latencyMs: number): void {
    const key = operation;
    if (!this.measurements.has(key)) {
      this.measurements.set(key, []);
    }
    
    const measurements = this.measurements.get(key)!;
    measurements.push(latencyMs);
    
    // Keep last 1000 measurements
    if (measurements.length > 1000) {
      measurements.shift();
    }
  }

  /**
   * Calculates percentile from measurements.
   */
  getPercentile(operation: keyof typeof LATENCY_SLOS, percentile: number): number {
    const measurements = this.measurements.get(operation) || [];
    if (measurements.length === 0) return 0;
    
    const sorted = [...measurements].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Checks if operation is meeting SLOs.
   */
  checkSLO(operation: keyof typeof LATENCY_SLOS): {
    meeting: boolean;
    violations: string[];
  } {
    const slo = LATENCY_SLOS[operation];
    const violations: string[] = [];

    const p50 = this.getPercentile(operation, 50);
    const p95 = this.getPercentile(operation, 95);
    const p99 = this.getPercentile(operation, 99);

    if (p50 > slo.p50) violations.push(`p50: ${p50}ms > ${slo.p50}ms`);
    if (p95 > slo.p95) violations.push(`p95: ${p95}ms > ${slo.p95}ms`);
    if (p99 > slo.p99) violations.push(`p99: ${p99}ms > ${slo.p99}ms`);

    return {
      meeting: violations.length === 0,
      violations,
    };
  }

  /**
   * Gets full SLO report.
   */
  getReport(): Record<string, {
    p50: number;
    p95: number;
    p99: number;
    meeting: boolean;
  }> {
    const report: Record<string, any> = {};

    for (const operation of Object.keys(LATENCY_SLOS)) {
      const op = operation as keyof typeof LATENCY_SLOS;
      const check = this.checkSLO(op);
      
      report[operation] = {
        p50: this.getPercentile(op, 50),
        p95: this.getPercentile(op, 95),
        p99: this.getPercentile(op, 99),
        meeting: check.meeting,
      };
    }

    return report;
  }
}
```

#### Performance Specialist Recommendations

| Area | Recommendation | Priority | Impact |
|------|---------------|----------|--------|
| **Pooling** | Configure Prisma pool to 12 connections/service | P0 | Prevents connection exhaustion |
| **L1 Cache** | Deploy in-memory cache for hot data | P0 | <1μs reads for 80% of queries |
| **L2 Cache** | Add SQLite for persistence + larger capacity | P1 | Survives restarts |
| **Query Profiling** | Deploy profiling middleware | P1 | Identifies slow queries |
| **SLO Monitoring** | Track p50/p95/p99 latencies | P1 | Proactive performance management |
| **Read Replicas** | Plan for future horizontal scaling | P3 | 10x read capacity |

---

### 🔐 Part 3: Security Specialist Hardening

**Specialist:** Security Specialist  
**Focus:** Row-Level Security, encryption, audit logging, access control, vulnerability prevention  
**Goal:** Defense-in-depth security with zero-trust database access

#### 3.1 Row-Level Security (RLS) Policies

```sql
-- ===== FILE: prisma/rls-policies.sql =====
-- Row-Level Security policies for tenant isolation and access control
-- Ensures users can only access their own data

-- ============================================
-- ENABLE RLS ON TABLES
-- ============================================

-- User data: Users can only see themselves (admins see all)
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

-- Pokemon: Users can only see their own Pokemon
ALTER TABLE "Pokemon" ENABLE ROW LEVEL SECURITY;

-- Battles: Participants and spectators can see battles
ALTER TABLE "Battle" ENABLE ROW LEVEL SECURITY;

-- Party: Users can only see their own party
ALTER TABLE "Party" ENABLE ROW LEVEL SECURITY;

-- Inventory: Users can only see their own items
ALTER TABLE "Inventory" ENABLE ROW LEVEL SECURITY;

-- ============================================
-- APPLICATION ROLE SETUP
-- ============================================

-- Create application role for runtime queries
CREATE ROLE app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Create admin role for administrative operations
CREATE ROLE app_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_admin;

-- ============================================
-- USER TABLE POLICIES
-- ============================================

-- Users can read their own data
CREATE POLICY user_select_own ON "User"
  FOR SELECT
  TO app_user
  USING (
    id = current_setting('app.current_user_id', true)::text
    OR current_setting('app.is_admin', true)::boolean = true
  );

-- Users can update their own data
CREATE POLICY user_update_own ON "User"
  FOR UPDATE
  TO app_user
  USING (id = current_setting('app.current_user_id', true)::text)
  WITH CHECK (id = current_setting('app.current_user_id', true)::text);

-- Only system can create users
CREATE POLICY user_insert ON "User"
  FOR INSERT
  TO app_user
  WITH CHECK (current_setting('app.is_system', true)::boolean = true);

-- ============================================
-- POKEMON TABLE POLICIES
-- ============================================

-- Users can see their own Pokemon
CREATE POLICY pokemon_select_own ON "Pokemon"
  FOR SELECT
  TO app_user
  USING (
    trainer_id = current_setting('app.current_user_id', true)::text
    OR current_setting('app.is_admin', true)::boolean = true
  );

-- Users can update their own Pokemon
CREATE POLICY pokemon_update_own ON "Pokemon"
  FOR UPDATE
  TO app_user
  USING (trainer_id = current_setting('app.current_user_id', true)::text)
  WITH CHECK (trainer_id = current_setting('app.current_user_id', true)::text);

-- System can create Pokemon (catches, starters, trades)
CREATE POLICY pokemon_insert ON "Pokemon"
  FOR INSERT
  TO app_user
  WITH CHECK (
    current_setting('app.is_system', true)::boolean = true
    OR trainer_id = current_setting('app.current_user_id', true)::text
  );

-- ============================================
-- BATTLE TABLE POLICIES
-- ============================================

-- Participants can see their battles
CREATE POLICY battle_select_participant ON "Battle"
  FOR SELECT
  TO app_user
  USING (
    challenger_id = current_setting('app.current_user_id', true)::text
    OR defender_id = current_setting('app.current_user_id', true)::text
    OR status = 'COMPLETED'  -- Completed battles are public
    OR current_setting('app.is_admin', true)::boolean = true
  );

-- Only system can create/update battles
CREATE POLICY battle_modify ON "Battle"
  FOR ALL
  TO app_user
  USING (current_setting('app.is_system', true)::boolean = true)
  WITH CHECK (current_setting('app.is_system', true)::boolean = true);

-- ============================================
-- AUDIT LOG POLICIES (Read-only for users)
-- ============================================

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

-- Users can see their own audit logs
CREATE POLICY audit_select_own ON "AuditLog"
  FOR SELECT
  TO app_user
  USING (
    user_id = current_setting('app.current_user_id', true)::text
    OR current_setting('app.is_admin', true)::boolean = true
  );

-- Only system can write audit logs
CREATE POLICY audit_insert ON "AuditLog"
  FOR INSERT
  TO app_user
  WITH CHECK (current_setting('app.is_system', true)::boolean = true);

-- ============================================
-- HELPER FUNCTIONS FOR CONTEXT
-- ============================================

-- Set current user context for RLS
CREATE OR REPLACE FUNCTION set_user_context(
  p_user_id TEXT,
  p_is_admin BOOLEAN DEFAULT FALSE,
  p_is_system BOOLEAN DEFAULT FALSE
) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_user_id', p_user_id, true);
  PERFORM set_config('app.is_admin', p_is_admin::text, true);
  PERFORM set_config('app.is_system', p_is_system::text, true);
END;
$$ LANGUAGE plpgsql;

-- Clear user context
CREATE OR REPLACE FUNCTION clear_user_context() RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_user_id', '', true);
  PERFORM set_config('app.is_admin', 'false', true);
  PERFORM set_config('app.is_system', 'false', true);
END;
$$ LANGUAGE plpgsql;
```

#### 3.2 Encryption Strategy

```typescript
// ===== FILE: src/shared/security/encryption.ts =====

/**
 * Data encryption utilities for sensitive information.
 * 
 * @description
 * Encryption strategy:
 * - At-rest: PostgreSQL TDE (Transparent Data Encryption) via Render
 * - In-transit: TLS 1.3 for all connections
 * - Application-level: AES-256-GCM for sensitive fields
 * 
 * Sensitive fields encrypted:
 * - User email (if stored)
 * - OAuth tokens (if stored)
 * - Payment info (future)
 */

import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

/**
 * Encryption configuration.
 */
export interface EncryptionConfig {
  algorithm: "aes-256-gcm";
  keyLength: 32;
  ivLength: 16;
  authTagLength: 16;
  saltLength: 32;
}

const CONFIG: EncryptionConfig = {
  algorithm: "aes-256-gcm",
  keyLength: 32,
  ivLength: 16,
  authTagLength: 16,
  saltLength: 32,
};

/**
 * Encrypted data format.
 */
export interface EncryptedData {
  ciphertext: string;  // Base64 encoded
  iv: string;          // Base64 encoded
  authTag: string;     // Base64 encoded
  salt: string;        // Base64 encoded (for key derivation)
}

/**
 * Derives encryption key from master key using scrypt.
 */
async function deriveKey(masterKey: string, salt: Buffer): Promise<Buffer> {
  return (await scryptAsync(masterKey, salt, CONFIG.keyLength)) as Buffer;
}

/**
 * Encrypts sensitive data.
 * 
 * @example
 * const encrypted = await encrypt("sensitive-data", process.env.ENCRYPTION_KEY);
 * // Store encrypted in database
 */
export async function encrypt(
  plaintext: string,
  masterKey: string
): Promise<EncryptedData> {
  const salt = randomBytes(CONFIG.saltLength);
  const iv = randomBytes(CONFIG.ivLength);
  const key = await deriveKey(masterKey, salt);

  const cipher = createCipheriv(CONFIG.algorithm, key, iv, {
    authTagLength: CONFIG.authTagLength,
  });

  let ciphertext = cipher.update(plaintext, "utf8", "base64");
  ciphertext += cipher.final("base64");

  return {
    ciphertext,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    salt: salt.toString("base64"),
  };
}

/**
 * Decrypts encrypted data.
 * 
 * @example
 * const plaintext = await decrypt(encryptedData, process.env.ENCRYPTION_KEY);
 */
export async function decrypt(
  encrypted: EncryptedData,
  masterKey: string
): Promise<string> {
  const salt = Buffer.from(encrypted.salt, "base64");
  const iv = Buffer.from(encrypted.iv, "base64");
  const authTag = Buffer.from(encrypted.authTag, "base64");
  const key = await deriveKey(masterKey, salt);

  const decipher = createDecipheriv(CONFIG.algorithm, key, iv, {
    authTagLength: CONFIG.authTagLength,
  });
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(encrypted.ciphertext, "base64", "utf8");
  plaintext += decipher.final("utf8");

  return plaintext;
}

/**
 * Prisma middleware for automatic field encryption.
 */
export function createEncryptionMiddleware(
  encryptedFields: Map<string, string[]>, // model -> fields
  masterKey: string
) {
  return async (params: any, next: any) => {
    const fields = encryptedFields.get(params.model);
    
    if (fields && params.args?.data) {
      // Encrypt on create/update
      if (params.action === "create" || params.action === "update") {
        for (const field of fields) {
          if (params.args.data[field]) {
            params.args.data[field] = JSON.stringify(
              await encrypt(params.args.data[field], masterKey)
            );
          }
        }
      }
    }

    const result = await next(params);

    // Decrypt on read
    if (fields && result) {
      const decryptField = async (obj: any) => {
        for (const field of fields) {
          if (obj[field]) {
            try {
              const encrypted = JSON.parse(obj[field]) as EncryptedData;
              obj[field] = await decrypt(encrypted, masterKey);
            } catch {
              // Field not encrypted or invalid format
            }
          }
        }
      };

      if (Array.isArray(result)) {
        await Promise.all(result.map(decryptField));
      } else {
        await decryptField(result);
      }
    }

    return result;
  };
}

/**
 * Hash sensitive data for lookups (one-way).
 * 
 * @example
 * const hashedEmail = await hashForLookup(email, process.env.HASH_KEY);
 * // Can search by hash without decrypting
 */
export async function hashForLookup(
  value: string,
  key: string
): Promise<string> {
  const salt = Buffer.from(key, "utf8");
  const hash = (await scryptAsync(value.toLowerCase(), salt, 32)) as Buffer;
  return hash.toString("base64");
}
```

#### 3.3 Comprehensive Audit Logging

```typescript
// ===== FILE: src/shared/security/audit-logger.ts =====

/**
 * Comprehensive audit logging for security and compliance.
 * 
 * @description
 * Logs all security-relevant events to TimescaleDB hypertable.
 * Supports:
 * - User actions (login, logout, profile changes)
 * - Data access (reads of sensitive data)
 * - Data modifications (creates, updates, deletes)
 * - Administrative actions
 * - Security events (failed auth, permission denied)
 */

import { prisma } from "@shared/prisma.js";
import { logger } from "@shared/utils/logger.js";

/**
 * Audit event types.
 */
export type AuditEventType =
  // Authentication
  | "AUTH_LOGIN"
  | "AUTH_LOGOUT"
  | "AUTH_FAILED"
  | "AUTH_TOKEN_REFRESH"
  
  // User actions
  | "USER_CREATE"
  | "USER_UPDATE"
  | "USER_DELETE"
  | "USER_SETTINGS_CHANGE"
  
  // Pokemon actions
  | "POKEMON_CATCH"
  | "POKEMON_RELEASE"
  | "POKEMON_TRADE"
  | "POKEMON_EVOLVE"
  
  // Battle actions
  | "BATTLE_START"
  | "BATTLE_MOVE"
  | "BATTLE_END"
  | "BATTLE_FORFEIT"
  
  // Administrative
  | "ADMIN_USER_BAN"
  | "ADMIN_USER_UNBAN"
  | "ADMIN_ROLE_CHANGE"
  | "ADMIN_CONFIG_CHANGE"
  
  // Security events
  | "SECURITY_PERMISSION_DENIED"
  | "SECURITY_RATE_LIMIT"
  | "SECURITY_SUSPICIOUS_ACTIVITY"
  | "SECURITY_DATA_EXPORT";

/**
 * Audit severity levels.
 */
export type AuditSeverity = "INFO" | "WARNING" | "CRITICAL";

/**
 * Audit log entry.
 */
export interface AuditEntry {
  eventType: AuditEventType;
  severity: AuditSeverity;
  userId?: string;
  targetId?: string;
  targetType?: string;
  action: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  guildId?: string;
  channelId?: string;
}

/**
 * Creates audit log entry.
 */
export async function createAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        timestamp: new Date(),
        eventType: entry.eventType,
        severity: entry.severity,
        userId: entry.userId,
        targetId: entry.targetId,
        targetType: entry.targetType,
        action: entry.action,
        details: entry.details ? JSON.stringify(entry.details) : null,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        guildId: entry.guildId,
        channelId: entry.channelId,
      },
    });
  } catch (error) {
    // Audit logging should never fail silently in production
    logger.error({ error, entry }, "Failed to create audit log");
    
    // In production, consider sending to backup logging system
    if (process.env.NODE_ENV === "production") {
      // sendToBackupAuditSystem(entry);
    }
  }
}

/**
 * Audit logger with fluent API.
 * 
 * @example
 * await audit
 *   .user(userId)
 *   .action("POKEMON_CATCH")
 *   .target("pokemon", pokemonId)
 *   .details({ species: "Pikachu", level: 5 })
 *   .log();
 */
export class AuditLogger {
  private entry: Partial<AuditEntry> = {};

  user(userId: string): this {
    this.entry.userId = userId;
    return this;
  }

  action(eventType: AuditEventType): this {
    this.entry.eventType = eventType;
    return this;
  }

  target(type: string, id: string): this {
    this.entry.targetType = type;
    this.entry.targetId = id;
    return this;
  }

  details(data: Record<string, any>): this {
    this.entry.details = data;
    return this;
  }

  context(ctx: { guildId?: string; channelId?: string }): this {
    this.entry.guildId = ctx.guildId;
    this.entry.channelId = ctx.channelId;
    return this;
  }

  severity(level: AuditSeverity): this {
    this.entry.severity = level;
    return this;
  }

  async log(): Promise<void> {
    if (!this.entry.eventType) {
      throw new Error("Audit log requires eventType");
    }

    await createAuditLog({
      eventType: this.entry.eventType,
      severity: this.entry.severity ?? "INFO",
      action: this.entry.eventType,
      ...this.entry,
    } as AuditEntry);

    // Reset for reuse
    this.entry = {};
  }
}

/**
 * Factory function for creating audit logger.
 */
export function audit(): AuditLogger {
  return new AuditLogger();
}

/**
 * Prisma middleware for automatic data change auditing.
 */
export function createAuditMiddleware(
  auditedModels: string[] = ["User", "Pokemon", "Battle"]
) {
  return async (params: any, next: any) => {
    const shouldAudit = auditedModels.includes(params.model);
    
    if (!shouldAudit) {
      return next(params);
    }

    // Get before state for updates/deletes
    let beforeState: any;
    if (params.action === "update" || params.action === "delete") {
      beforeState = await params.model.findUnique({
        where: params.args.where,
      });
    }

    const result = await next(params);

    // Log the change
    const eventType = mapActionToEventType(params.model, params.action);
    if (eventType) {
      await createAuditLog({
        eventType,
        severity: "INFO",
        action: `${params.model}.${params.action}`,
        targetType: params.model,
        targetId: result?.id || params.args?.where?.id,
        userId: params.args?.data?.userId || beforeState?.userId,
        details: {
          action: params.action,
          before: beforeState,
          after: result,
          args: sanitizeArgs(params.args),
        },
      });
    }

    return result;
  };
}

/**
 * Maps Prisma action to audit event type.
 */
function mapActionToEventType(
  model: string,
  action: string
): AuditEventType | null {
  const mapping: Record<string, Record<string, AuditEventType>> = {
    User: {
      create: "USER_CREATE",
      update: "USER_UPDATE",
      delete: "USER_DELETE",
    },
    Pokemon: {
      create: "POKEMON_CATCH",
      delete: "POKEMON_RELEASE",
    },
    Battle: {
      create: "BATTLE_START",
      update: "BATTLE_MOVE",
    },
  };

  return mapping[model]?.[action] ?? null;
}

/**
 * Removes sensitive data from audit args.
 */
function sanitizeArgs(args: any): any {
  if (!args) return args;
  
  const sanitized = { ...args };
  const sensitiveFields = ["password", "token", "secret", "key"];
  
  for (const field of sensitiveFields) {
    if (sanitized.data?.[field]) {
      sanitized.data[field] = "[REDACTED]";
    }
  }
  
  return sanitized;
}

/**
 * Query audit logs with filtering.
 */
export async function queryAuditLogs(filters: {
  userId?: string;
  eventType?: AuditEventType;
  severity?: AuditSeverity;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<any[]> {
  return prisma.auditLog.findMany({
    where: {
      userId: filters.userId,
      eventType: filters.eventType,
      severity: filters.severity,
      timestamp: {
        gte: filters.startDate,
        lte: filters.endDate,
      },
    },
    orderBy: { timestamp: "desc" },
    take: filters.limit ?? 100,
  });
}
```

#### 3.4 SQL Injection Prevention

```typescript
// ===== FILE: src/shared/security/sql-safety.ts =====

/**
 * SQL injection prevention utilities.
 * 
 * @description
 * Defense layers:
 * 1. Prisma ORM (parameterized queries by default)
 * 2. Input validation before reaching database
 * 3. Allowlist patterns for dynamic queries
 * 4. Query analysis for suspicious patterns
 */

import { logger } from "@shared/utils/logger.js";

/**
 * SQL injection patterns to detect.
 */
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b)/gi,
  /(--|#|\/\*|\*\/)/g,
  /(\bOR\b\s+\d+\s*=\s*\d+)/gi,
  /(\bAND\b\s+\d+\s*=\s*\d+)/gi,
  /(;\s*(SELECT|INSERT|UPDATE|DELETE|DROP))/gi,
  /(\bEXEC\b|\bEXECUTE\b)/gi,
  /(\bxp_)/gi,
  /(CHAR\s*\()/gi,
  /(CONCAT\s*\()/gi,
  /(\bSLEEP\s*\()/gi,
  /(\bBENCHMARK\s*\()/gi,
  /(LOAD_FILE\s*\()/gi,
  /(INTO\s+(OUT|DUMP)FILE)/gi,
];

/**
 * Checks input for SQL injection patterns.
 */
export function containsSqlInjection(input: string): boolean {
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      return true;
    }
  }
  return false;
}

/**
 * Sanitizes user input for safe database use.
 * 
 * @description
 * This is a SECONDARY defense. Prisma's parameterized queries
 * are the PRIMARY defense. This catches edge cases.
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== "string") {
    return String(input);
  }

  // Remove null bytes
  let sanitized = input.replace(/\0/g, "");
  
  // Escape single quotes (for display, not queries)
  sanitized = sanitized.replace(/'/g, "''");
  
  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, "");
  
  return sanitized;
}

/**
 * Validates input against SQL injection and logs suspicious activity.
 */
export function validateInput(
  input: string,
  context: { userId?: string; field: string }
): { valid: boolean; sanitized: string } {
  if (containsSqlInjection(input)) {
    logger.warn(
      {
        userId: context.userId,
        field: context.field,
        input: input.substring(0, 100),
      },
      "SQL injection attempt detected"
    );
    
    return {
      valid: false,
      sanitized: sanitizeInput(input),
    };
  }

  return {
    valid: true,
    sanitized: sanitizeInput(input),
  };
}

/**
 * Safe dynamic column selection (allowlist approach).
 */
export class SafeColumnSelector {
  private allowedColumns: Set<string>;

  constructor(allowedColumns: string[]) {
    this.allowedColumns = new Set(allowedColumns);
  }

  /**
   * Validates column name against allowlist.
   */
  validate(column: string): boolean {
    return this.allowedColumns.has(column);
  }

  /**
   * Gets validated columns from user input.
   */
  getValidColumns(requestedColumns: string[]): string[] {
    return requestedColumns.filter((col) => this.validate(col));
  }

  /**
   * Builds safe ORDER BY clause.
   */
  buildOrderBy(
    column: string,
    direction: "asc" | "desc" = "asc"
  ): { [key: string]: "asc" | "desc" } | null {
    if (!this.validate(column)) {
      return null;
    }
    return { [column]: direction };
  }
}

/**
 * Pre-defined column selectors for common models.
 */
export const COLUMN_SELECTORS = {
  user: new SafeColumnSelector([
    "id",
    "username",
    "discordId",
    "createdAt",
    "updatedAt",
    "isActive",
  ]),
  
  pokemon: new SafeColumnSelector([
    "id",
    "nickname",
    "speciesId",
    "level",
    "currentHp",
    "trainerId",
    "createdAt",
  ]),
  
  battle: new SafeColumnSelector([
    "id",
    "status",
    "challengerId",
    "defenderId",
    "winnerId",
    "createdAt",
    "endedAt",
  ]),
};

/**
 * Prisma middleware for input validation.
 */
export function createInputValidationMiddleware() {
  return async (params: any, next: any) => {
    // Validate string inputs in where clauses
    if (params.args?.where) {
      validateWhereClause(params.args.where, params.model);
    }
    
    // Validate string inputs in data
    if (params.args?.data) {
      validateDataClause(params.args.data, params.model);
    }

    return next(params);
  };
}

function validateWhereClause(where: any, model: string): void {
  for (const [key, value] of Object.entries(where)) {
    if (typeof value === "string") {
      const result = validateInput(value, { field: `${model}.${key}` });
      if (!result.valid) {
        throw new Error(`Invalid input for ${model}.${key}`);
      }
    }
  }
}

function validateDataClause(data: any, model: string): void {
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      const result = validateInput(value, { field: `${model}.${key}` });
      if (!result.valid) {
        throw new Error(`Invalid input for ${model}.${key}`);
      }
    }
  }
}
```

#### 3.5 Access Control Matrix

```typescript
// ===== FILE: src/shared/security/access-control.ts =====

/**
 * Access control matrix for database operations.
 * 
 * @description
 * Defines who can do what to which data.
 * Enforced at application layer (RLS is backup).
 */

/**
 * User roles.
 */
export type UserRole = "USER" | "MODERATOR" | "ADMIN" | "SYSTEM";

/**
 * Resource types.
 */
export type ResourceType =
  | "USER"
  | "POKEMON"
  | "BATTLE"
  | "PARTY"
  | "INVENTORY"
  | "AUDIT_LOG"
  | "SYSTEM_CONFIG";

/**
 * Operation types.
 */
export type Operation = "CREATE" | "READ" | "UPDATE" | "DELETE" | "LIST";

/**
 * Access rule definition.
 */
export interface AccessRule {
  resource: ResourceType;
  operation: Operation;
  condition: "NONE" | "OWN" | "PARTICIPANT" | "ANY";
}

/**
 * Access control matrix.
 */
const ACCESS_MATRIX: Record<UserRole, AccessRule[]> = {
  USER: [
    // Users can CRUD their own data
    { resource: "USER", operation: "READ", condition: "OWN" },
    { resource: "USER", operation: "UPDATE", condition: "OWN" },
    
    // Users can CRUD their own Pokemon
    { resource: "POKEMON", operation: "CREATE", condition: "OWN" },
    { resource: "POKEMON", operation: "READ", condition: "OWN" },
    { resource: "POKEMON", operation: "UPDATE", condition: "OWN" },
    { resource: "POKEMON", operation: "DELETE", condition: "OWN" },
    { resource: "POKEMON", operation: "LIST", condition: "OWN" },
    
    // Users can participate in battles
    { resource: "BATTLE", operation: "CREATE", condition: "PARTICIPANT" },
    { resource: "BATTLE", operation: "READ", condition: "PARTICIPANT" },
    { resource: "BATTLE", operation: "UPDATE", condition: "PARTICIPANT" },
    
    // Users can manage their party and inventory
    { resource: "PARTY", operation: "READ", condition: "OWN" },
    { resource: "PARTY", operation: "UPDATE", condition: "OWN" },
    { resource: "INVENTORY", operation: "READ", condition: "OWN" },
    { resource: "INVENTORY", operation: "UPDATE", condition: "OWN" },
    
    // Users can read their own audit logs
    { resource: "AUDIT_LOG", operation: "READ", condition: "OWN" },
  ],

  MODERATOR: [
    // Moderators can read all user data
    { resource: "USER", operation: "READ", condition: "ANY" },
    { resource: "USER", operation: "LIST", condition: "ANY" },
    
    // Moderators can read all Pokemon
    { resource: "POKEMON", operation: "READ", condition: "ANY" },
    { resource: "POKEMON", operation: "LIST", condition: "ANY" },
    
    // Moderators can read and end battles
    { resource: "BATTLE", operation: "READ", condition: "ANY" },
    { resource: "BATTLE", operation: "UPDATE", condition: "ANY" },
    
    // Moderators can read audit logs
    { resource: "AUDIT_LOG", operation: "READ", condition: "ANY" },
    { resource: "AUDIT_LOG", operation: "LIST", condition: "ANY" },
  ],

  ADMIN: [
    // Admins can do anything except delete system config
    { resource: "USER", operation: "CREATE", condition: "ANY" },
    { resource: "USER", operation: "READ", condition: "ANY" },
    { resource: "USER", operation: "UPDATE", condition: "ANY" },
    { resource: "USER", operation: "DELETE", condition: "ANY" },
    { resource: "USER", operation: "LIST", condition: "ANY" },
    
    { resource: "POKEMON", operation: "CREATE", condition: "ANY" },
    { resource: "POKEMON", operation: "READ", condition: "ANY" },
    { resource: "POKEMON", operation: "UPDATE", condition: "ANY" },
    { resource: "POKEMON", operation: "DELETE", condition: "ANY" },
    { resource: "POKEMON", operation: "LIST", condition: "ANY" },
    
    { resource: "SYSTEM_CONFIG", operation: "READ", condition: "ANY" },
    { resource: "SYSTEM_CONFIG", operation: "UPDATE", condition: "ANY" },
  ],

  SYSTEM: [
    // System has full access to everything
    { resource: "USER", operation: "CREATE", condition: "ANY" },
    { resource: "USER", operation: "READ", condition: "ANY" },
    { resource: "USER", operation: "UPDATE", condition: "ANY" },
    { resource: "USER", operation: "DELETE", condition: "ANY" },
    { resource: "POKEMON", operation: "CREATE", condition: "ANY" },
    { resource: "POKEMON", operation: "READ", condition: "ANY" },
    { resource: "POKEMON", operation: "UPDATE", condition: "ANY" },
    { resource: "POKEMON", operation: "DELETE", condition: "ANY" },
    { resource: "BATTLE", operation: "CREATE", condition: "ANY" },
    { resource: "BATTLE", operation: "READ", condition: "ANY" },
    { resource: "BATTLE", operation: "UPDATE", condition: "ANY" },
    { resource: "BATTLE", operation: "DELETE", condition: "ANY" },
    { resource: "AUDIT_LOG", operation: "CREATE", condition: "ANY" },
    { resource: "SYSTEM_CONFIG", operation: "CREATE", condition: "ANY" },
    { resource: "SYSTEM_CONFIG", operation: "UPDATE", condition: "ANY" },
    { resource: "SYSTEM_CONFIG", operation: "DELETE", condition: "ANY" },
  ],
};

/**
 * Checks if user has permission for operation.
 */
export function hasPermission(
  role: UserRole,
  resource: ResourceType,
  operation: Operation,
  context: {
    userId: string;
    resourceOwnerId?: string;
    participantIds?: string[];
  }
): boolean {
  const rules = ACCESS_MATRIX[role];
  
  const matchingRule = rules.find(
    (rule) => rule.resource === resource && rule.operation === operation
  );

  if (!matchingRule) {
    return false;
  }

  switch (matchingRule.condition) {
    case "NONE":
      return false;
    case "ANY":
      return true;
    case "OWN":
      return context.userId === context.resourceOwnerId;
    case "PARTICIPANT":
      return context.participantIds?.includes(context.userId) ?? false;
    default:
      return false;
  }
}

/**
 * Permission check decorator.
 * 
 * @example
 * @RequirePermission("POKEMON", "UPDATE", "OWN")
 * async updatePokemon(userId: string, pokemonId: string, data: any) {
 *   // Only executes if user owns the Pokemon
 * }
 */
export function RequirePermission(
  resource: ResourceType,
  operation: Operation,
  condition: "OWN" | "PARTICIPANT" | "ANY"
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: any, ...args: any[]) {
      const context = this.securityContext;
      
      if (!context) {
        throw new Error("Security context required");
      }

      if (!hasPermission(context.role, resource, operation, context)) {
        throw new Error(
          `Permission denied: ${context.role} cannot ${operation} ${resource}`
        );
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
```

#### Security Specialist Recommendations

| Area | Recommendation | Priority | Impact |
|------|---------------|----------|--------|
| **RLS** | Enable RLS on all user-data tables | P0 | Defense-in-depth isolation |
| **Encryption** | Encrypt sensitive fields (emails, tokens) | P0 | Data breach protection |
| **Audit Logging** | Deploy comprehensive audit system | P1 | Compliance + forensics |
| **SQL Injection** | Add input validation middleware | P1 | Attack prevention |
| **Access Control** | Implement permission decorators | P1 | Consistent authorization |
| **Key Rotation** | Plan encryption key rotation | P2 | Long-term security |

---

### 🏗️ Part 4: Architecture Specialist Integration

**Specialist:** Architecture Specialist  
**Focus:** CQRS patterns, event sourcing, data flow optimization, domain-driven design  
**Goal:** Design data architecture that scales with game complexity

#### 4.1 CQRS Pattern Implementation

```typescript
// ===== FILE: src/shared/architecture/cqrs.ts =====

/**
 * Command Query Responsibility Segregation (CQRS) implementation.
 * 
 * @description
 * Separates read and write operations for:
 * - Optimized read models (denormalized, cached)
 * - Consistent write models (normalized, transactional)
 * - Independent scaling of reads vs writes
 * 
 * Pokemon Infinity Gauntlet Use Cases:
 * - Writes: Battle actions, catches, trades (low volume, high consistency)
 * - Reads: Pokedex, leaderboards, profiles (high volume, eventual consistency OK)
 */

import { EventEmitter } from "events";
import { prisma } from "@shared/prisma.js";
import { logger } from "@shared/utils/logger.js";

// ============================================
// COMMAND SIDE (Writes)
// ============================================

/**
 * Base command interface.
 */
export interface Command<TPayload = any> {
  type: string;
  payload: TPayload;
  metadata: CommandMetadata;
}

export interface CommandMetadata {
  commandId: string;
  userId: string;
  timestamp: Date;
  correlationId?: string;
}

/**
 * Command handler interface.
 */
export interface CommandHandler<TCommand extends Command, TResult = void> {
  readonly commandType: string;
  execute(command: TCommand): Promise<TResult>;
  validate?(command: TCommand): Promise<void>;
}

/**
 * Command bus for routing commands to handlers.
 */
export class CommandBus {
  private handlers = new Map<string, CommandHandler<any, any>>();
  private eventEmitter = new EventEmitter();

  /**
   * Registers a command handler.
   */
  register<TCommand extends Command>(
    handler: CommandHandler<TCommand, any>
  ): void {
    if (this.handlers.has(handler.commandType)) {
      throw new Error(`Handler for ${handler.commandType} already registered`);
    }
    this.handlers.set(handler.commandType, handler);
    logger.info({ commandType: handler.commandType }, "Command handler registered");
  }

  /**
   * Dispatches a command to its handler.
   */
  async dispatch<TResult>(command: Command): Promise<TResult> {
    const handler = this.handlers.get(command.type);
    
    if (!handler) {
      throw new Error(`No handler registered for command: ${command.type}`);
    }

    try {
      // Validate
      if (handler.validate) {
        await handler.validate(command);
      }

      // Execute
      const result = await handler.execute(command);

      // Emit success event
      this.eventEmitter.emit("command:executed", {
        command,
        result,
        success: true,
      });

      return result;
    } catch (error) {
      // Emit failure event
      this.eventEmitter.emit("command:failed", {
        command,
        error,
        success: false,
      });
      throw error;
    }
  }

  /**
   * Subscribes to command events.
   */
  on(event: "command:executed" | "command:failed", listener: Function): void {
    this.eventEmitter.on(event, listener as any);
  }
}

// ============================================
// QUERY SIDE (Reads)
// ============================================

/**
 * Base query interface.
 */
export interface Query<TParams = any> {
  type: string;
  params: TParams;
}

/**
 * Query handler interface.
 */
export interface QueryHandler<TQuery extends Query, TResult> {
  readonly queryType: string;
  execute(query: TQuery): Promise<TResult>;
}

/**
 * Query bus for routing queries to handlers.
 */
export class QueryBus {
  private handlers = new Map<string, QueryHandler<any, any>>();

  /**
   * Registers a query handler.
   */
  register<TQuery extends Query>(handler: QueryHandler<TQuery, any>): void {
    this.handlers.set(handler.queryType, handler);
    logger.info({ queryType: handler.queryType }, "Query handler registered");
  }

  /**
   * Dispatches a query to its handler.
   */
  async dispatch<TResult>(query: Query): Promise<TResult> {
    const handler = this.handlers.get(query.type);
    
    if (!handler) {
      throw new Error(`No handler registered for query: ${query.type}`);
    }

    return handler.execute(query);
  }
}

// ============================================
// POKEMON COMMANDS
// ============================================

/**
 * Catch Pokemon command.
 */
export interface CatchPokemonCommand extends Command<{
  speciesId: number;
  level: number;
  encounterId: string;
}> {
  type: "pokemon:catch";
}

/**
 * Catch Pokemon command handler.
 */
export class CatchPokemonHandler implements CommandHandler<CatchPokemonCommand, { pokemonId: string }> {
  readonly commandType = "pokemon:catch";

  async validate(command: CatchPokemonCommand): Promise<void> {
    // Validate encounter exists and is active
    const encounter = await prisma.encounter.findUnique({
      where: { id: command.payload.encounterId },
    });

    if (!encounter || encounter.status !== "ACTIVE") {
      throw new Error("Invalid encounter");
    }

    if (encounter.userId !== command.metadata.userId) {
      throw new Error("Encounter belongs to another user");
    }
  }

  async execute(command: CatchPokemonCommand): Promise<{ pokemonId: string }> {
    // Transaction: Create Pokemon + Update Encounter + Create Audit Log
    const result = await prisma.$transaction(async (tx) => {
      // Create the Pokemon
      const pokemon = await tx.pokemon.create({
        data: {
          speciesId: command.payload.speciesId,
          level: command.payload.level,
          trainerId: command.metadata.userId,
          encounterId: command.payload.encounterId,
        },
      });

      // Complete the encounter
      await tx.encounter.update({
        where: { id: command.payload.encounterId },
        data: { status: "CAUGHT", caughtPokemonId: pokemon.id },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          timestamp: new Date(),
          eventType: "POKEMON_CATCH",
          severity: "INFO",
          userId: command.metadata.userId,
          targetId: pokemon.id,
          targetType: "Pokemon",
          action: "catch",
          details: JSON.stringify(command.payload),
        },
      });

      return pokemon;
    });

    return { pokemonId: result.id };
  }
}

// ============================================
// POKEMON QUERIES
// ============================================

/**
 * Get party query.
 */
export interface GetPartyQuery extends Query<{ trainerId: string }> {
  type: "pokemon:getParty";
}

/**
 * Get party query handler (optimized read model).
 */
export class GetPartyHandler implements QueryHandler<GetPartyQuery, any[]> {
  readonly queryType = "pokemon:getParty";

  async execute(query: GetPartyQuery): Promise<any[]> {
    // Read from denormalized/cached party view
    return prisma.pokemon.findMany({
      where: {
        trainerId: query.params.trainerId,
        partyPosition: { not: null },
      },
      orderBy: { partyPosition: "asc" },
      select: {
        id: true,
        nickname: true,
        speciesId: true,
        level: true,
        currentHp: true,
        maxHp: true,
        partyPosition: true,
        // Include computed fields from denormalized view
      },
    });
  }
}

// ============================================
// FACTORY
// ============================================

/**
 * Creates configured CQRS buses.
 */
export function createCQRS() {
  const commandBus = new CommandBus();
  const queryBus = new QueryBus();

  // Register command handlers
  commandBus.register(new CatchPokemonHandler());
  // commandBus.register(new ReleasePokemonHandler());
  // commandBus.register(new TradePokemonHandler());
  // commandBus.register(new StartBattleHandler());
  // commandBus.register(new ExecuteMoveHandler());

  // Register query handlers
  queryBus.register(new GetPartyHandler());
  // queryBus.register(new GetPokedexHandler());
  // queryBus.register(new GetLeaderboardHandler());
  // queryBus.register(new GetBattleStateHandler());

  return { commandBus, queryBus };
}
```

#### 4.2 Event Sourcing Foundation

```typescript
// ===== FILE: src/shared/architecture/event-sourcing.ts =====

/**
 * Event sourcing foundation for audit trail and replay capability.
 * 
 * @description
 * Event sourcing stores all state changes as events:
 * - Complete audit trail (who did what, when)
 * - Replay capability (rebuild state from events)
 * - Temporal queries (what was state at time T?)
 * 
 * Used for:
 * - Battle logs (complete replay of battles)
 * - Trade history (dispute resolution)
 * - Security events (incident investigation)
 */

import { prisma } from "@shared/prisma.js";

/**
 * Domain event interface.
 */
export interface DomainEvent<TPayload = any> {
  eventId: string;
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  payload: TPayload;
  metadata: EventMetadata;
  version: number;
  timestamp: Date;
}

export interface EventMetadata {
  userId: string;
  correlationId: string;
  causationId?: string;
  guildId?: string;
  channelId?: string;
}

/**
 * Event store interface.
 */
export interface EventStore {
  append(event: DomainEvent): Promise<void>;
  getEvents(aggregateId: string, fromVersion?: number): Promise<DomainEvent[]>;
  getEventsByType(eventType: string, since?: Date): Promise<DomainEvent[]>;
}

/**
 * PostgreSQL-backed event store using TimescaleDB.
 */
export class PostgresEventStore implements EventStore {
  /**
   * Appends event to store.
   */
  async append(event: DomainEvent): Promise<void> {
    await prisma.domainEvent.create({
      data: {
        eventId: event.eventId,
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        payload: JSON.stringify(event.payload),
        metadata: JSON.stringify(event.metadata),
        version: event.version,
        timestamp: event.timestamp,
      },
    });
  }

  /**
   * Gets events for an aggregate.
   */
  async getEvents(
    aggregateId: string,
    fromVersion = 0
  ): Promise<DomainEvent[]> {
    const events = await prisma.domainEvent.findMany({
      where: {
        aggregateId,
        version: { gte: fromVersion },
      },
      orderBy: { version: "asc" },
    });

    return events.map((e) => ({
      eventId: e.eventId,
      eventType: e.eventType,
      aggregateId: e.aggregateId,
      aggregateType: e.aggregateType,
      payload: JSON.parse(e.payload as string),
      metadata: JSON.parse(e.metadata as string),
      version: e.version,
      timestamp: e.timestamp,
    }));
  }

  /**
   * Gets events by type (for projections).
   */
  async getEventsByType(
    eventType: string,
    since?: Date
  ): Promise<DomainEvent[]> {
    const events = await prisma.domainEvent.findMany({
      where: {
        eventType,
        timestamp: since ? { gte: since } : undefined,
      },
      orderBy: { timestamp: "asc" },
    });

    return events.map((e) => ({
      eventId: e.eventId,
      eventType: e.eventType,
      aggregateId: e.aggregateId,
      aggregateType: e.aggregateType,
      payload: JSON.parse(e.payload as string),
      metadata: JSON.parse(e.metadata as string),
      version: e.version,
      timestamp: e.timestamp,
    }));
  }
}

/**
 * Aggregate root base class.
 */
export abstract class AggregateRoot<TState> {
  protected state: TState;
  protected uncommittedEvents: DomainEvent[] = [];
  private version = 0;

  constructor(
    public readonly id: string,
    initialState: TState
  ) {
    this.state = initialState;
  }

  /**
   * Gets current version.
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * Gets uncommitted events.
   */
  getUncommittedEvents(): DomainEvent[] {
    return [...this.uncommittedEvents];
  }

  /**
   * Clears uncommitted events (after persisting).
   */
  clearUncommittedEvents(): void {
    this.uncommittedEvents = [];
  }

  /**
   * Applies an event (updates state).
   */
  protected apply(event: DomainEvent): void {
    this.state = this.evolve(this.state, event);
    this.version++;
    this.uncommittedEvents.push(event);
  }

  /**
   * Rebuilds state from events.
   */
  loadFromHistory(events: DomainEvent[]): void {
    for (const event of events) {
      this.state = this.evolve(this.state, event);
      this.version++;
    }
  }

  /**
   * State evolution function (implemented by subclass).
   */
  protected abstract evolve(state: TState, event: DomainEvent): TState;
}

// ============================================
// BATTLE AGGREGATE EXAMPLE
// ============================================

/**
 * Battle state.
 */
export interface BattleState {
  id: string;
  status: "PENDING" | "ACTIVE" | "COMPLETED";
  challengerId: string;
  defenderId: string;
  currentTurn: number;
  challengerPokemon: any[];
  defenderPokemon: any[];
  winnerId?: string;
  logs: any[];
}

/**
 * Battle events.
 */
export type BattleEvent =
  | { type: "BattleStarted"; challengerId: string; defenderId: string }
  | { type: "TurnExecuted"; turn: number; actions: any[] }
  | { type: "PokemonFainted"; pokemonId: string; trainerId: string }
  | { type: "BattleEnded"; winnerId: string; reason: string };

/**
 * Battle aggregate.
 */
export class BattleAggregate extends AggregateRoot<BattleState> {
  /**
   * Creates a new battle.
   */
  static create(
    id: string,
    challengerId: string,
    defenderId: string,
    metadata: EventMetadata
  ): BattleAggregate {
    const battle = new BattleAggregate(id, {
      id,
      status: "PENDING",
      challengerId,
      defenderId,
      currentTurn: 0,
      challengerPokemon: [],
      defenderPokemon: [],
      logs: [],
    });

    battle.apply({
      eventId: crypto.randomUUID(),
      eventType: "BattleStarted",
      aggregateId: id,
      aggregateType: "Battle",
      payload: { challengerId, defenderId },
      metadata,
      version: 1,
      timestamp: new Date(),
    });

    return battle;
  }

  /**
   * Executes a turn.
   */
  executeTurn(actions: any[], metadata: EventMetadata): void {
    if (this.state.status !== "ACTIVE") {
      throw new Error("Battle is not active");
    }

    this.apply({
      eventId: crypto.randomUUID(),
      eventType: "TurnExecuted",
      aggregateId: this.id,
      aggregateType: "Battle",
      payload: { turn: this.state.currentTurn + 1, actions },
      metadata,
      version: this.version + 1,
      timestamp: new Date(),
    });
  }

  /**
   * Ends the battle.
   */
  end(winnerId: string, reason: string, metadata: EventMetadata): void {
    this.apply({
      eventId: crypto.randomUUID(),
      eventType: "BattleEnded",
      aggregateId: this.id,
      aggregateType: "Battle",
      payload: { winnerId, reason },
      metadata,
      version: this.version + 1,
      timestamp: new Date(),
    });
  }

  /**
   * Evolves state based on event.
   */
  protected evolve(state: BattleState, event: DomainEvent): BattleState {
    switch (event.eventType) {
      case "BattleStarted":
        return {
          ...state,
          status: "ACTIVE",
          challengerId: event.payload.challengerId,
          defenderId: event.payload.defenderId,
        };

      case "TurnExecuted":
        return {
          ...state,
          currentTurn: event.payload.turn,
          logs: [...state.logs, event.payload],
        };

      case "BattleEnded":
        return {
          ...state,
          status: "COMPLETED",
          winnerId: event.payload.winnerId,
        };

      default:
        return state;
    }
  }
}
```

#### 4.3 Data Flow Optimization

```typescript
// ===== FILE: src/shared/architecture/data-flow.ts =====

/**
 * Optimized data flow patterns for game operations.
 * 
 * @description
 * Data flows optimized for:
 * - Battle operations: Real-time, consistent, isolated
 * - Exploration: High-throughput, eventual consistency OK
 * - Social: Read-heavy, cached aggressively
 */

import { prisma } from "@shared/prisma.js";

/**
 * Data flow types.
 */
export type DataFlowType =
  | "BATTLE"      // Real-time, transactional
  | "EXPLORATION" // High-throughput, idempotent
  | "SOCIAL"      // Read-heavy, cached
  | "ADMIN";      // Low-volume, audited

/**
 * Data flow configuration.
 */
export interface DataFlowConfig {
  type: DataFlowType;
  consistency: "STRONG" | "EVENTUAL";
  caching: "NONE" | "READ" | "WRITE_THROUGH";
  isolation: "READ_COMMITTED" | "REPEATABLE_READ" | "SERIALIZABLE";
  timeout: number;
}

/**
 * Flow configurations by type.
 */
export const FLOW_CONFIGS: Record<DataFlowType, DataFlowConfig> = {
  BATTLE: {
    type: "BATTLE",
    consistency: "STRONG",
    caching: "NONE",
    isolation: "SERIALIZABLE",
    timeout: 10000, // 10s max for battle operations
  },
  EXPLORATION: {
    type: "EXPLORATION",
    consistency: "EVENTUAL",
    caching: "WRITE_THROUGH",
    isolation: "READ_COMMITTED",
    timeout: 5000, // 5s for exploration
  },
  SOCIAL: {
    type: "SOCIAL",
    consistency: "EVENTUAL",
    caching: "READ",
    isolation: "READ_COMMITTED",
    timeout: 3000, // 3s for social reads
  },
  ADMIN: {
    type: "ADMIN",
    consistency: "STRONG",
    caching: "NONE",
    isolation: "SERIALIZABLE",
    timeout: 30000, // 30s for admin operations
  },
};

/**
 * Executes operation with appropriate data flow configuration.
 */
export async function executeWithFlow<T>(
  flowType: DataFlowType,
  operation: () => Promise<T>
): Promise<T> {
  const config = FLOW_CONFIGS[flowType];

  // Set transaction timeout
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Operation timeout")), config.timeout)
  );

  // Execute with configured isolation level
  if (config.consistency === "STRONG") {
    return Promise.race([
      prisma.$transaction(operation as any, {
        isolationLevel: config.isolation as any,
        timeout: config.timeout,
      }),
      timeoutPromise,
    ]);
  } else {
    return Promise.race([operation(), timeoutPromise]);
  }
}

/**
 * Battle-specific data flow (optimized for real-time PvP).
 */
export class BattleDataFlow {
  /**
   * Loads battle state with locking.
   */
  async loadBattleState(battleId: string): Promise<any> {
    return executeWithFlow("BATTLE", async () => {
      // Use SELECT FOR UPDATE to lock the battle row
      const battle = await prisma.$queryRaw`
        SELECT * FROM "Battle"
        WHERE id = ${battleId}
        FOR UPDATE NOWAIT
      `;
      return battle;
    });
  }

  /**
   * Applies battle action atomically.
   */
  async applyAction(battleId: string, action: any): Promise<void> {
    return executeWithFlow("BATTLE", async () => {
      await prisma.$transaction([
        // Update battle state
        prisma.battle.update({
          where: { id: battleId },
          data: { /* state changes */ },
        }),
        // Log the action
        prisma.battleLog.create({
          data: {
            battleId,
            timestamp: new Date(),
            action: JSON.stringify(action),
          },
        }),
      ]);
    });
  }
}

/**
 * Exploration data flow (optimized for high-throughput encounters).
 */
export class ExplorationDataFlow {
  /**
   * Generates encounter with idempotency.
   */
  async generateEncounter(
    userId: string,
    areaId: string,
    seed: string
  ): Promise<any> {
    return executeWithFlow("EXPLORATION", async () => {
      // Idempotent: Same seed always produces same result
      const existingEncounter = await prisma.encounter.findFirst({
        where: { seed },
      });

      if (existingEncounter) {
        return existingEncounter;
      }

      // Generate new encounter
      return prisma.encounter.create({
        data: {
          userId,
          areaId,
          seed,
          speciesId: this.calculateSpecies(seed, areaId),
          level: this.calculateLevel(seed, areaId),
          status: "ACTIVE",
        },
      });
    });
  }

  private calculateSpecies(seed: string, areaId: string): number {
    // Deterministic species calculation
    return 1; // Placeholder
  }

  private calculateLevel(seed: string, areaId: string): number {
    // Deterministic level calculation
    return 5; // Placeholder
  }
}

/**
 * Social data flow (optimized for read-heavy operations).
 */
export class SocialDataFlow {
  private cache = new Map<string, { data: any; expires: number }>();

  /**
   * Gets leaderboard with aggressive caching.
   */
  async getLeaderboard(type: string, limit = 100): Promise<any[]> {
    const cacheKey = `leaderboard:${type}:${limit}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    const data = await executeWithFlow("SOCIAL", () =>
      prisma.user.findMany({
        orderBy: { /* ranking field */ },
        take: limit,
        select: {
          id: true,
          username: true,
          // ranking fields
        },
      })
    );

    // Cache for 5 minutes
    this.cache.set(cacheKey, {
      data,
      expires: Date.now() + 5 * 60 * 1000,
    });

    return data;
  }

  /**
   * Gets player profile with caching.
   */
  async getProfile(userId: string): Promise<any> {
    const cacheKey = `profile:${userId}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    const data = await executeWithFlow("SOCIAL", () =>
      prisma.user.findUnique({
        where: { id: userId },
        include: {
          pokemon: { where: { partyPosition: { not: null } } },
          _count: { select: { pokemon: true, battles: true } },
        },
      })
    );

    // Cache for 1 minute
    this.cache.set(cacheKey, {
      data,
      expires: Date.now() + 60 * 1000,
    });

    return data;
  }
}
```

#### 4.4 Domain-Driven Design Models

```typescript
// ===== FILE: src/shared/architecture/domain-models.ts =====

/**
 * Domain-driven design models for Pokemon Infinity Gauntlet.
 * 
 * @description
 * Bounded contexts:
 * - Trainer Context: User identity, profile, progression
 * - Pokemon Context: Monsters, stats, moves, abilities
 * - Battle Context: Fights, turns, outcomes
 * - Exploration Context: Encounters, catches, areas
 * - Social Context: Trades, leaderboards, guilds
 */

// ============================================
// VALUE OBJECTS
// ============================================

/**
 * Pokemon Stats value object (immutable).
 */
export class PokemonStats {
  constructor(
    public readonly hp: number,
    public readonly attack: number,
    public readonly defense: number,
    public readonly specialAttack: number,
    public readonly specialDefense: number,
    public readonly speed: number
  ) {
    Object.freeze(this);
  }

  /**
   * Calculates total stats.
   */
  get total(): number {
    return (
      this.hp +
      this.attack +
      this.defense +
      this.specialAttack +
      this.specialDefense +
      this.speed
    );
  }

  /**
   * Creates stats with modifications.
   */
  withModifier(modifier: Partial<Record<keyof PokemonStats, number>>): PokemonStats {
    return new PokemonStats(
      this.hp + (modifier.hp ?? 0),
      this.attack + (modifier.attack ?? 0),
      this.defense + (modifier.defense ?? 0),
      this.specialAttack + (modifier.specialAttack ?? 0),
      this.specialDefense + (modifier.specialDefense ?? 0),
      this.speed + (modifier.speed ?? 0)
    );
  }
}

/**
 * Type effectiveness value object.
 */
export class TypeEffectiveness {
  private static chart: Map<string, Map<string, number>> = new Map();

  static getMultiplier(attackType: string, defenseTypes: string[]): number {
    let multiplier = 1;
    for (const defType of defenseTypes) {
      const typeRow = this.chart.get(attackType);
      multiplier *= typeRow?.get(defType) ?? 1;
    }
    return multiplier;
  }

  static isSuper(attackType: string, defenseTypes: string[]): boolean {
    return this.getMultiplier(attackType, defenseTypes) > 1;
  }

  static isNotVery(attackType: string, defenseTypes: string[]): boolean {
    const mult = this.getMultiplier(attackType, defenseTypes);
    return mult > 0 && mult < 1;
  }

  static isImmune(attackType: string, defenseTypes: string[]): boolean {
    return this.getMultiplier(attackType, defenseTypes) === 0;
  }
}

// ============================================
// ENTITIES
// ============================================

/**
 * Pokemon entity.
 */
export class Pokemon {
  constructor(
    public readonly id: string,
    public readonly speciesId: number,
    public readonly trainerId: string,
    private _nickname: string | null,
    private _level: number,
    private _currentHp: number,
    private _stats: PokemonStats,
    private _moves: string[],
    private _experience: number
  ) {}

  // Getters
  get nickname(): string | null { return this._nickname; }
  get level(): number { return this._level; }
  get currentHp(): number { return this._currentHp; }
  get stats(): PokemonStats { return this._stats; }
  get moves(): string[] { return [...this._moves]; }
  get experience(): number { return this._experience; }
  get isFainted(): boolean { return this._currentHp <= 0; }

  /**
   * Takes damage.
   */
  takeDamage(amount: number): void {
    this._currentHp = Math.max(0, this._currentHp - amount);
  }

  /**
   * Heals HP.
   */
  heal(amount: number): void {
    this._currentHp = Math.min(this._stats.hp, this._currentHp + amount);
  }

  /**
   * Fully heals.
   */
  fullHeal(): void {
    this._currentHp = this._stats.hp;
  }

  /**
   * Gains experience.
   */
  gainExperience(amount: number): { leveledUp: boolean; newLevel: number } {
    this._experience += amount;
    
    const levelThreshold = this.calculateLevelThreshold(this._level + 1);
    if (this._experience >= levelThreshold) {
      this._level++;
      this.recalculateStats();
      return { leveledUp: true, newLevel: this._level };
    }
    
    return { leveledUp: false, newLevel: this._level };
  }

  /**
   * Sets nickname.
   */
  setNickname(nickname: string | null): void {
    this._nickname = nickname;
  }

  private calculateLevelThreshold(level: number): number {
    // Standard Pokemon experience formula
    return Math.pow(level, 3);
  }

  private recalculateStats(): void {
    // Recalculate stats based on new level
    // (implementation depends on stat formula)
  }
}

// ============================================
// AGGREGATE ROOTS
// ============================================

/**
 * Trainer aggregate root.
 */
export class Trainer {
  private _party: Pokemon[] = [];
  private _storage: Map<string, Pokemon[]> = new Map();

  constructor(
    public readonly id: string,
    public readonly discordId: string,
    private _username: string
  ) {}

  get username(): string { return this._username; }
  get party(): readonly Pokemon[] { return this._party; }

  /**
   * Adds Pokemon to party.
   */
  addToParty(pokemon: Pokemon): { success: boolean; reason?: string } {
    if (this._party.length >= 6) {
      return { success: false, reason: "Party is full" };
    }

    if (pokemon.trainerId !== this.id) {
      return { success: false, reason: "Pokemon belongs to another trainer" };
    }

    this._party.push(pokemon);
    return { success: true };
  }

  /**
   * Removes Pokemon from party.
   */
  removeFromParty(pokemonId: string): Pokemon | null {
    const index = this._party.findIndex(p => p.id === pokemonId);
    if (index === -1) return null;

    const [pokemon] = this._party.splice(index, 1);
    return pokemon;
  }

  /**
   * Swaps party positions.
   */
  swapPartyPositions(index1: number, index2: number): void {
    if (index1 < 0 || index1 >= this._party.length) return;
    if (index2 < 0 || index2 >= this._party.length) return;

    [this._party[index1], this._party[index2]] = 
    [this._party[index2], this._party[index1]];
  }

  /**
   * Moves Pokemon to storage.
   */
  moveToStorage(pokemonId: string, boxId: string): boolean {
    const pokemon = this.removeFromParty(pokemonId);
    if (!pokemon) return false;

    if (!this._storage.has(boxId)) {
      this._storage.set(boxId, []);
    }

    const box = this._storage.get(boxId)!;
    if (box.length >= 30) {
      // Box full, return to party
      this._party.push(pokemon);
      return false;
    }

    box.push(pokemon);
    return true;
  }
}
```

#### Architecture Specialist Recommendations

| Area | Recommendation | Priority | Impact |
|------|---------------|----------|--------|
| **CQRS** | Implement command/query separation | P1 | Clear read/write boundaries |
| **Event Sourcing** | Apply to battle system | P1 | Complete audit trail + replay |
| **Data Flow** | Use flow types for all operations | P1 | Appropriate consistency per use case |
| **Domain Models** | Implement value objects | P2 | Immutable, testable domain logic |
| **Aggregates** | Define aggregate boundaries | P2 | Transactional consistency |
| **Read Models** | Create denormalized views | P3 | Faster reads |

---

## Change Log

| Date | Change |
|------|--------|
| 2025-12-03 | Initial database-centric development plan created |
| 2025-12-03 | Added Agile Review Session #1 (flaws, improvements, sprint planning) |
| 2025-12-03 | Added Agile Review Session #2 Part 1-2 (Code Conventions, Self-Documentation) |
| 2025-12-03 | Added Agile Review Session #2 Part 3-4 (Templates, Base Classes) |
| 2025-12-03 | Added Agile Review Session #2 Part 5-6 (AI Navigation, Scalability) |
| 2025-12-03 | Added Agile Review Session #2 Part 7 (Implementation Roadmap, Priority Matrix) |
| 2025-12-03 | Added Agile Review Session #3 Part 1-3 (Resilience, Versioning, Doc Automation) |
| 2025-12-03 | Added Agile Review Session #3 Part 4-6 (Quality Enforcement, Knowledge Transfer, Master Checklist) |
| 2025-12-03 | FINAL REVIEW COMPLETE — Architecture ready for implementation |
| 2025-12-03 | Added Specialist Deep Dive Part 1: Database Specialist (PostgreSQL tuning, TimescaleDB, indexes, query patterns, health monitoring) |
| 2025-12-03 | Added Specialist Deep Dive Part 2: Performance Specialist (connection pooling, multi-layer caching, read replicas, query optimization, SLOs) |
| 2025-12-03 | Added Specialist Deep Dive Part 3: Security Specialist (RLS policies, encryption, audit logging, SQL injection prevention, access control) |
| 2025-12-03 | Added Specialist Deep Dive Part 4: Architecture Specialist (CQRS, event sourcing, data flow optimization, domain-driven design) |
