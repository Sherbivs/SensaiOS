# Northstar Database Optimization — Methodology & Standards

**Created:** 2025-11-08  
**Status:** Living Document  
**Purpose:** Define comprehensive methodology, coding standards, testing protocols, and quality gates for all Northstar optimization phases

**Cross-References:**
- See `docs/northstar-qa-checklist.md` for standardized QA validation checklists
- See `docs/northstar-schema-state.md` for current vs. planned schema comparison
- See `docs/northstar-solidification-summary.md` for session executive summary
- See `docs/schema-northstar-optimization.md` for overall optimization plan
- See `docs/dual-onpremise-database-guide.md` for testing environment setup
- See `Tasklist.md` Phase 15 for task tracking
- See `AGENTS.md` Database Replication Architecture for version control

**Referenced By:** northstar-qa-checklist.md, northstar-schema-state.md, Tasklist.md (Phase 15)

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Migration Methodology](#migration-methodology)
3. [Coding Standards](#coding-standards)
4. [Testing Protocol](#testing-protocol)
5. [Quality Gates](#quality-gates)
6. [Documentation Requirements](#documentation-requirements)
7. [Rollback Strategy](#rollback-strategy)
8. [Performance Validation](#performance-validation)
9. [Security & Privacy](#security--privacy)
10. [Operational Readiness](#operational-readiness)

---

## Core Principles

### 1. Safety First
- **Zero data loss tolerance** — All migrations must be fully reversible
- **Offline testing required** — Test on EXPERIMENTAL → PRIMARY LOCAL → DEV before PROD
- **Snapshot before execution** — Take full database dumps before any schema changes
- **Graceful degradation** — Services must handle missing columns during rollout

### 2. Incremental Progress
- **Small, atomic changes** — Each phase addresses one concern (additive → data migration → cleanup)
- **Phased rollout** — Break complex changes into 3 phases: Phase 1 (additive), Phase 2 (consolidation), Phase 3 (cleanup)
- **Dependency tracking** — Use Tasklist.md `depends_on` to enforce prerequisite completion
- **Validation checkpoints** — Verify each phase before proceeding to next

### 3. Performance Excellence
- **Benchmarking required** — Capture baseline metrics before migration
- **Monitoring integration** — Use db:cli performance commands (index_usage, table_bloat, slow_queries, cache_stats)
- **Threshold compliance** — Meet or exceed performance targets (query latency <500ms, cache hit rate >80%, table bloat <20%)
- **Continuous optimization** — Re-evaluate indexes and query plans after each phase

### 4. Documentation Discipline
- **Comprehensive READMEs** — Every migration includes purpose, data flow, safety measures, testing workflow, rollback procedure
- **Code comments** — Explain non-obvious business logic, edge cases, performance considerations
- **Architecture diagrams** — Visual data flow for complex migrations (use Mermaid or ASCII art)
- **Runbook updates** — Update ops/DB_BOOTSTRAP.md with new procedures

### 5. Test Coverage
- **Unit tests** — Cover all business logic in services (EventTracker, ProfileService)
- **Integration tests** — Validate end-to-end flows (event → storage → retrieval)
- **Migration tests** — Dry-run on EXPERIMENTAL with validation queries
- **Rollback tests** — Verify full restore capability before deploying

---

## Migration Methodology

### Phase Structure (3-Phase Pattern)

All complex schema changes follow the 3-phase migration pattern:

#### **Phase 1: Additive Changes (Low Risk)**
- **Purpose:** Add new columns, tables, indexes without modifying existing data
- **Risk Level:** Low (read-only operations, no data manipulation)
- **Rollback:** Simple DROP statements (columns/tables/indexes added)
- **Example:** Add User.tagline, User.bio, User.favoriteSpeciesId columns

**Checklist:**
- [ ] Add new columns with NULL defaults (backward compatible)
- [ ] Create new tables with foreign keys
- [ ] Add new indexes for query optimization
- [ ] Update Prisma schema with new fields
- [ ] Verify schema changes via information_schema queries
- [ ] Document column purposes and constraints

#### **Phase 2: Data Migration & Consolidation (Medium Risk)**
- **Purpose:** Migrate data from old schema to new schema, consolidate redundant tables
- **Risk Level:** Medium (data manipulation, table drops)
- **Rollback:** Restore from snapshot or recreate tables with original data
- **Example:** Migrate TrainerProfile → User columns, drop TrainerProfile table

**Checklist:**
- [ ] Create pre-migration snapshot (pg_dump)
- [ ] Verify source/target column mappings
- [ ] Execute data migration (UPDATE with validation)
- [ ] Verify row counts match expectations
- [ ] Drop redundant tables/columns
- [ ] Update application code to use new schema
- [ ] Test rollback procedure on EXPERIMENTAL
- [ ] Monitor performance metrics for regressions

#### **Phase 3: Schema Cleanup (Higher Risk)**
- **Purpose:** Add NOT NULL constraints, finalize schema, remove legacy code
- **Risk Level:** Higher (schema constraints, breaking changes)
- **Rollback:** Requires schema recreation and data restore
- **Example:** Add NOT NULL to User.tagline after backfill complete

**Checklist:**
- [ ] Verify all data backfilled (no NULL violations)
- [ ] Add NOT NULL constraints
- [ ] Remove deprecated columns
- [ ] Update indexes for new query patterns
- [ ] Remove legacy service code
- [ ] Run full test suite
- [ ] Validate performance improvements

### Testing Workflow (4-Tier Validation)

Every migration must pass all 4 tiers before production deployment:

#### **Tier 1: EXPERIMENTAL Database (100% OFFLINE)**
- **Purpose:** Destructive testing in complete isolation
- **Database:** Port 55434 (localhost-only, no cloud connection)
- **Process:**
  1. Sync from PRIMARY LOCAL: `npm run ops:sync-experiment-db -- --from local`
  2. Apply migration.sql
  3. Run validation queries (row counts, data integrity)
  4. Test application queries against EXPERIMENTAL
  5. Apply rollback.sql
  6. Verify full restore capability

#### **Tier 2: PRIMARY LOCAL (100% OFFLINE)**
- **Purpose:** Final validation with production-like data
- **Database:** Port 55433 (localhost-only, synced from Render DEV)
- **Process:**
  1. Bootstrap from Render DEV: `npm run ops:bootstrap-onpremise-dev`
  2. Apply migration.sql
  3. Run full test suite against PRIMARY LOCAL
  4. Capture performance metrics
  5. If successful, proceed to Tier 3

#### **Tier 3: DEV Master (CLOUD OPERATION)**
- **Purpose:** Staging validation with live services
- **Database:** Render managed PostgreSQL (DEV)
- **Process:**
  1. Schedule maintenance window
  2. Create snapshot: `pg_dump $DEV_DATABASE_URL > snapshot.sql`
  3. Apply migration: `psql $DEV_DATABASE_URL -f migration.sql`
  4. Deploy updated services to DEV environment
  5. Run integration tests
  6. Monitor for 24-48 hours
  7. Validate performance improvements

#### **Tier 4: PROD Deployment (PRODUCTION)**
- **Purpose:** Production rollout with monitoring
- **Database:** Render managed PostgreSQL (PROD)
- **Process:**
  1. Schedule low-traffic maintenance window
  2. Create full backup: `pg_dump $PROD_DATABASE_URL > prod_backup.sql`
  3. Apply migration: `psql $PROD_DATABASE_URL -f migration.sql`
  4. Deploy updated services
  5. Monitor error rates, latency, resource usage
  6. Keep rollback script ready for 72 hours
  7. Validate success criteria met

---

## Coding Standards

### SQL Style Guide

```sql
-- ✅ GOOD: Explicit, readable, validated
-- Step 1: Verify pre-migration state
DO $$
DECLARE
  v_trainer_count INT;
  v_user_count INT;
BEGIN
  SELECT COUNT(*) INTO v_trainer_count FROM "TrainerProfile";
  SELECT COUNT(*) INTO v_user_count FROM "User" WHERE "tagline" IS NOT NULL;
  
  RAISE NOTICE 'Pre-migration: TrainerProfile=%, User.tagline=%, Timestamp=%',
    v_trainer_count, v_user_count, CURRENT_TIMESTAMP;
END $$;

-- Step 2: Migrate data with validation
UPDATE "User" u
SET 
  "tagline" = tp."tagline",
  "bio" = tp."bio",
  "favoriteSpeciesId" = tp."favoriteSpeciesId"
FROM "TrainerProfile" tp
WHERE u."id" = tp."userId";

-- Step 3: Verify migration success
DO $$
DECLARE
  v_migrated_count INT;
  v_expected_count INT;
BEGIN
  SELECT COUNT(*) INTO v_expected_count FROM "TrainerProfile";
  SELECT COUNT(*) INTO v_migrated_count 
  FROM "User" 
  WHERE "tagline" IS NOT NULL OR "bio" IS NOT NULL OR "favoriteSpeciesId" IS NOT NULL;
  
  IF v_migrated_count != v_expected_count THEN
    RAISE EXCEPTION 'Migration validation failed: expected %, got %',
      v_expected_count, v_migrated_count;
  END IF;
  
  RAISE NOTICE 'Migration successful: % rows migrated', v_migrated_count;
END $$;
```

```sql
-- ❌ BAD: Silent failures, no validation
UPDATE "User" u SET "tagline" = tp."tagline" FROM "TrainerProfile" tp WHERE u."id" = tp."userId";
DROP TABLE "TrainerProfile";
```

### TypeScript Standards

#### Service Layer (src/services/)

```typescript
// ✅ GOOD: Typed, documented, error handling, logging

import { prisma } from '../../shared/prisma.js';
import type { Prisma } from '@prisma/client';
import { logger } from '../../utils/logger.js';

/**
 * ProfileService — User profile operations with caching and leaderboards
 * 
 * @module ProfileService
 * @category Services
 */

export interface ProfileUpdateInput {
  tagline?: string;
  bio?: string;
  favoriteSpeciesId?: number | null;
}

export interface ProfileStats {
  totalBattles: number;
  totalWins: number;
  totalCatches: number;
  winRate: number;
}

/**
 * Get user profile with statistics
 * 
 * @param userId - Discord user ID
 * @returns User profile with stats or null if not found
 * @throws {Error} Database connection error
 */
export async function getProfile(userId: string): Promise<{
  user: Prisma.UserGetPayload<{ include: { favoriteSpecies: true } }>;
  stats: ProfileStats;
} | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { discordId: userId },
      include: { favoriteSpecies: true },
    });
    
    if (!user) {
      logger.warn(`Profile not found for user ${userId}`);
      return null;
    }
    
    const stats = calculateStats(user);
    
    logger.debug(`Retrieved profile for ${userId}: ${stats.totalBattles} battles`);
    return { user, stats };
  } catch (error) {
    logger.error('Failed to get profile', { userId, error });
    throw error;
  }
}

function calculateStats(user: { 
  battles: number; 
  wins: number; 
  catches: number; 
}): ProfileStats {
  return {
    totalBattles: user.battles,
    totalWins: user.wins,
    totalCatches: user.catches,
    winRate: user.battles > 0 ? (user.wins / user.battles) * 100 : 0,
  };
}
```

```typescript
// ❌ BAD: No types, no error handling, no logging

export async function getProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { discordId: userId },
  });
  return user;
}
```

#### Query Builders (src/shared/models/)

```typescript
// ✅ GOOD: Parameterized, validated, type-safe

import { Pool, PoolClient, QueryResult } from 'pg';
import { getProdDb } from '../pg-connection.js';

export interface UserProfileRow {
  id: string;
  discordId: string;
  tagline: string | null;
  bio: string | null;
  favoriteSpeciesId: number | null;
}

/**
 * Bulk update user profile fields
 * 
 * @param updates - Array of profile updates with userId
 * @param pool - Optional database pool (defaults to PROD)
 * @returns Number of rows updated
 */
export async function bulkUpdateProfiles(
  updates: Array<{ userId: string; tagline?: string; bio?: string }>,
  pool?: Pool | PoolClient
): Promise<number> {
  if (updates.length === 0) return 0;
  
  const db = pool ?? getProdDb();
  
  // Build CASE statements for conditional updates
  const taglineCases = updates
    .filter(u => u.tagline !== undefined)
    .map((u, i) => `WHEN id = $${i * 2 + 1} THEN $${i * 2 + 2}`)
    .join(' ');
    
  const bioCases = updates
    .filter(u => u.bio !== undefined)
    .map((u, i) => `WHEN id = $${i * 2 + 1} THEN $${i * 2 + 2}`)
    .join(' ');
  
  const userIds = updates.map(u => u.userId);
  const values = updates.flatMap(u => [u.userId, u.tagline ?? u.bio ?? '']);
  
  const query = `
    UPDATE "User"
    SET
      "tagline" = CASE ${taglineCases} ELSE "tagline" END,
      "bio" = CASE ${bioCases} ELSE "bio" END,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ANY($${values.length + 1})
    RETURNING id
  `;
  
  const result: QueryResult = await db.query(query, [...values, userIds]);
  return result.rowCount ?? 0;
}
```

---

## Testing Protocol

### Unit Tests (Vitest)

**Location:** `tests/services/`, `tests/shared/models/`  
**Coverage Target:** >80% for critical paths

```typescript
// tests/services/profile-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getProfile, updateProfile } from '../../src/services/profiles/index.js';
import { prisma } from '../../src/shared/prisma.js';

describe('ProfileService', () => {
  beforeEach(async () => {
    // Setup: Create test user
    await prisma.user.create({
      data: {
        id: 'test-user-123',
        discordId: '123456789',
        tagline: 'Test Tagline',
        bio: 'Test Bio',
        favoriteSpeciesId: 25, // Pikachu
      },
    });
  });
  
  afterEach(async () => {
    // Cleanup: Remove test user
    await prisma.user.delete({ where: { id: 'test-user-123' } });
  });
  
  it('should retrieve profile with stats', async () => {
    const profile = await getProfile('123456789');
    
    expect(profile).not.toBeNull();
    expect(profile?.user.tagline).toBe('Test Tagline');
    expect(profile?.user.favoriteSpecies?.id).toBe(25);
    expect(profile?.stats.winRate).toBeGreaterThanOrEqual(0);
  });
  
  it('should handle missing user gracefully', async () => {
    const profile = await getProfile('nonexistent');
    
    expect(profile).toBeNull();
  });
  
  it('should update profile fields', async () => {
    await updateProfile('123456789', {
      tagline: 'Updated Tagline',
      bio: 'Updated Bio',
    });
    
    const profile = await getProfile('123456789');
    expect(profile?.user.tagline).toBe('Updated Tagline');
    expect(profile?.user.bio).toBe('Updated Bio');
  });
});
```

### Integration Tests

```bash
# Run against PRIMARY LOCAL database (port 55433)
export PROD_DATABASE_URL="postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db"
npm test -- tests/integration/
```

### Migration Tests (SQL Validation)

```bash
# Tier 1: EXPERIMENTAL database
npm run ops:sync-experiment-db -- --from local
psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql

# Validate migration
npm run db:cli -- count User --target experiment
npm run db:cli -- query "SELECT COUNT(*) FROM \"User\" WHERE \"tagline\" IS NOT NULL;" --target experiment

# Test rollback
psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/rollback.sql
```

---

## Quality Gates

Every phase must pass all quality gates before promotion to next tier:

### Gate 1: Code Review
- [ ] SQL reviewed for correctness (no syntax errors, proper quoting)
- [ ] TypeScript compiles without errors (`npm run build`)
- [ ] No ESLint warnings (`npm run lint`)
- [ ] Prisma schema valid (`npx prisma validate`)

### Gate 2: Documentation
- [ ] Migration README.md complete (purpose, data flow, safety, testing, rollback)
- [ ] Code comments explain business logic
- [ ] Tasklist.md updated with progress notes
- [ ] ops/NEXT.yaml points to correct next task

### Gate 3: Testing
- [ ] Unit tests pass (`npm test`)
- [ ] Migration tested on EXPERIMENTAL (Tier 1)
- [ ] Migration tested on PRIMARY LOCAL (Tier 2)
- [ ] Rollback tested and verified
- [ ] No database errors in logs

### Gate 4: Performance
- [ ] Baseline metrics captured (query latency, table bloat, cache hit rate)
- [ ] Post-migration metrics meet targets:
  - Query latency: <500ms for profile queries
  - Cache hit rate: >80% for hot tables
  - Table bloat: <20% for User table
  - Index usage: All new indexes show >10 scans/day
- [ ] No slow queries added (>2s execution time)

### Gate 5: Deployment Readiness
- [ ] Snapshot created before execution
- [ ] Rollback script ready and tested
- [ ] Maintenance window scheduled (for PROD)
- [ ] Monitoring dashboards configured
- [ ] On-call engineer notified

---

## Documentation Requirements

### Migration README Template

Every migration must include a comprehensive README.md:

```markdown
# Northstar Phase X: [Migration Title]

**Migration ID:** `YYYYMMDDHHMMSS_migration_name`  
**Created:** YYYY-MM-DDTHH:MM:SSZ  
**Risk Level:** Low|Medium|High  
**Estimated Downtime:** ~X seconds|minutes

## Purpose
[Why this migration is needed, what problem it solves]

## Prerequisites
- [ ] Phase X-1 completed
- [ ] Service Y deployed
- [ ] Monitoring Z configured

## Migration Overview
[High-level steps, 3-5 bullet points]

## Data Flow
[ASCII or Mermaid diagram showing source → target]

## Safety Measures
- Snapshot before execution
- Validation queries at each step
- Rollback script tested

## Testing Workflow
### Tier 1: EXPERIMENTAL Database
[Commands to test on port 55434]

### Tier 2: PRIMARY LOCAL
[Commands to test on port 55433]

### Tier 3: DEV Master
[Commands to deploy to Render DEV]

## Rollback Procedure
[Step-by-step instructions to undo migration]

## Post-Migration Application Updates
[Code changes required in services]

## Performance Impact
[Expected improvements in metrics]

## Troubleshooting
[Common issues and resolutions]

## References
- Phase X-1 Migration: `prisma/migrations/...`
- Related Docs: `docs/...`

## Success Criteria
- [ ] All data migrated correctly
- [ ] No data loss
- [ ] Performance targets met
- [ ] Services updated and deployed
```

### Code Comment Standards

```typescript
/**
 * Brief description (one line)
 * 
 * Detailed explanation (multiple lines if needed):
 * - Key behavior 1
 * - Key behavior 2
 * - Edge case handling
 * 
 * @param paramName - Parameter description
 * @returns Return value description
 * @throws {ErrorType} When error occurs
 * 
 * @example
 * ```typescript
 * const result = await myFunction('input');
 * ```
 */
```

---

## Rollback Strategy

### Pre-Execution Backup

```bash
# Full database snapshot
pg_dump $PROD_DATABASE_URL \
  --format=custom \
  --file=backup_$(date +%Y%m%d_%H%M%S).dump

# Table-specific snapshot
pg_dump $PROD_DATABASE_URL \
  --table="TrainerProfile" \
  --format=plain \
  --file=trainerprofile_backup.sql
```

### Rollback SQL Template

```sql
-- rollback.sql
-- Northstar Phase 2 Rollback: Restore TrainerProfile table

-- Step 1: Recreate TrainerProfile table
CREATE TABLE IF NOT EXISTS "TrainerProfile" (
  "userId" TEXT PRIMARY KEY,
  "tagline" TEXT,
  "bio" TEXT,
  "favoriteSpeciesId" SMALLINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  FOREIGN KEY ("favoriteSpeciesId") REFERENCES "Species"("id") ON DELETE SET NULL
);

-- Step 2: Restore data from User table
INSERT INTO "TrainerProfile" ("userId", "tagline", "bio", "favoriteSpeciesId", "createdAt", "updatedAt")
SELECT 
  "id",
  "tagline",
  "bio",
  "favoriteSpeciesId",
  "createdAt",
  "updatedAt"
FROM "User"
WHERE "tagline" IS NOT NULL OR "bio" IS NOT NULL OR "favoriteSpeciesId" IS NOT NULL;

-- Step 3: Verify restore
DO $$
DECLARE
  v_restored_count INT;
BEGIN
  SELECT COUNT(*) INTO v_restored_count FROM "TrainerProfile";
  RAISE NOTICE 'Restored % TrainerProfile records', v_restored_count;
END $$;

-- Step 4: Optionally clear User profile columns (if reverting to pre-Phase1)
-- UPDATE "User" SET "tagline" = NULL, "bio" = NULL, "favoriteSpeciesId" = NULL;
```

### Rollback Testing

Always test rollback on EXPERIMENTAL before deploying to higher tiers:

```bash
# Apply migration to EXPERIMENTAL
psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
  -f migration.sql

# Test rollback immediately
psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
  -f rollback.sql

# Verify data restored
npm run db:cli -- count TrainerProfile --target experiment
npm run db:cli -- query "SELECT COUNT(*) FROM \"TrainerProfile\";" --target experiment
```

---

## Performance Validation

### Baseline Capture (Before Migration)

```bash
# Capture all performance metrics
npm run db:cli -- index_usage > baseline_index_usage.txt
npm run db:cli -- table_bloat > baseline_table_bloat.txt
npm run db:cli -- slow_queries > baseline_slow_queries.txt
npm run db:cli -- cache_stats > baseline_cache_stats.txt

# Capture specific query plans
npm run db:cli -- query "EXPLAIN ANALYZE SELECT * FROM \"User\" WHERE \"discordId\" = '123456789';" > baseline_profile_query.txt
```

### Post-Migration Validation

```bash
# Compare metrics after migration
npm run db:cli -- index_usage > postmigration_index_usage.txt
npm run db:cli -- table_bloat > postmigration_table_bloat.txt
npm run db:cli -- slow_queries > postmigration_slow_queries.txt
npm run db:cli -- cache_stats > postmigration_cache_stats.txt

# Verify improvements
diff baseline_slow_queries.txt postmigration_slow_queries.txt
```

### Performance Targets

| Metric | Target | Warning | Critical |
| --- | --- | --- | --- |
| **Query Latency** | <500ms | >500ms | >2s |
| **Cache Hit Rate** | >80% | <80% | <60% |
| **Table Bloat** | <20% | >20% | >50% |
| **Index Usage** | >10 scans/day | <10 scans | 0 scans (unused) |
| **Disk Usage** | <70% quota | >70% | >90% |

---

## Security & Privacy

### PII Handling

```typescript
// ✅ GOOD: Sanitize PII in logs
logger.info('User profile updated', {
  userId: user.id,
  discordId: maskDiscordId(user.discordId), // Only show last 4 digits
  hasTagline: !!user.tagline,
  hasBio: !!user.bio,
});

function maskDiscordId(discordId: string): string {
  return `****${discordId.slice(-4)}`;
}
```

```typescript
// ❌ BAD: Expose PII in logs
logger.info('User profile updated', { user }); // Logs entire user object with bio/tagline
```

### Event Retention

```sql
-- Auto-cleanup for old events (7-day retention for routine events)
UPDATE "UserEvent"
SET "retainUntil" = "occurredAt" + INTERVAL '7 days'
WHERE "category" = 'encounter' OR "category" = 'battle';

-- Extended retention for important events (90 days)
UPDATE "UserEvent"
SET "retainUntil" = "occurredAt" + INTERVAL '90 days'
WHERE "category" = 'achievement' OR "severity" = 'critical';
```

### SQL Injection Prevention

```typescript
// ✅ GOOD: Parameterized queries
const result = await db.query(
  'SELECT * FROM "User" WHERE "discordId" = $1',
  [discordId]
);

// ❌ BAD: String concatenation (vulnerable to SQL injection)
const result = await db.query(
  `SELECT * FROM "User" WHERE "discordId" = '${discordId}'`
);
```

---

## Operational Readiness

### Pre-Deployment Checklist

- [ ] **Code Quality**
  - All tests passing (`npm test`)
  - No ESLint errors (`npm run lint`)
  - TypeScript compiles (`npm run build`)
  - Prisma schema valid (`npx prisma validate`)

- [ ] **Documentation**
  - Migration README complete
  - Tasklist.md updated
  - ops/NEXT.yaml points to next task
  - Code comments explain business logic

- [ ] **Testing**
  - EXPERIMENTAL testing complete (Tier 1)
  - PRIMARY LOCAL testing complete (Tier 2)
  - Rollback tested and verified
  - Performance validation passed

- [ ] **Deployment**
  - Maintenance window scheduled
  - Snapshot created
  - Rollback script ready
  - Monitoring dashboards configured
  - On-call engineer notified

- [ ] **Monitoring**
  - Error tracking configured (Sentry/CloudWatch)
  - Performance dashboards updated (db:cli commands)
  - Alert thresholds set (latency, bloat, cache)
  - Runbook updated (ops/DB_BOOTSTRAP.md)

### Post-Deployment Monitoring

```bash
# Monitor for 24-48 hours after deployment
watch -n 300 'npm run db:cli -- slow_queries'      # Every 5 minutes
watch -n 3600 'npm run db:cli -- table_bloat'      # Every hour
watch -n 3600 'npm run db:cli -- cache_stats'      # Every hour

# Check application logs for errors
render logs --tail --service infinity-gauntlet-bots
```

### Rollback Decision Matrix

| Issue | Severity | Action |
| --- | --- | --- |
| **Data loss detected** | CRITICAL | IMMEDIATE ROLLBACK |
| **Query latency >5s** | CRITICAL | IMMEDIATE ROLLBACK |
| **Cache hit rate <40%** | CRITICAL | IMMEDIATE ROLLBACK |
| **Migration validation failed** | HIGH | ROLLBACK + investigate |
| **Query latency >2s** | HIGH | ROLLBACK + optimize |
| **Table bloat >50%** | MEDIUM | VACUUM + monitor |
| **Slow query >1s (rare)** | LOW | Optimize index |

---

## Revision History

- **2025-11-08T21:00:00Z** — Initial methodology document (Rev 1.0)

---

## Related Documents

- `docs/schema-northstar-optimization.md` — Overall Northstar plan
- `docs/northstar-phase1-contract-verification.md` — Phase 1 validation
- `docs/northstar-phase2-consolidation.md` — Phase 2 plan
- `docs/query-optimization-guide.md` — Performance monitoring
- `docs/event-tracking-schema.md` — Event system design
- `ops/DB_BOOTSTRAP.md` — Migration runbook
- `Tasklist.md` — Phase 15 (Database Northstar Optimization)

