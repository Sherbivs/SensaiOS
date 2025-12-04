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

## Change Log

| Date | Change |
|------|--------|
| 2025-12-03 | Initial database-centric development plan created |
| 2025-12-03 | Added Agile Review Session #1 (flaws, improvements, sprint planning) |
| 2025-12-03 | Added Agile Review Session #2 Part 1-2 (Code Conventions, Self-Documentation) |
| 2025-12-03 | Added Agile Review Session #2 Part 3-4 (Templates, Base Classes) |
| 2025-12-03 | Added Agile Review Session #2 Part 5-6 (AI Navigation, Scalability) |
| 2025-12-03 | Added Agile Review Session #2 Part 7 (Implementation Roadmap, Priority Matrix) |
