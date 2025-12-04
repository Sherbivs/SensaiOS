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
