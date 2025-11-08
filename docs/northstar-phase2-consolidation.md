# Northstar Phase 2: TrainerProfile Data Consolidation

**Status:** READY  
**Created:** 2025-11-08T18:40:00Z  
**Risk Level:** Medium (data manipulation, table drops)  
**Dependencies:** Phase 1 (DONE), Services (DONE), Monitoring (DONE)

## Overview

Phase 2 consolidates `TrainerProfile` data into `User` table columns added in Phase 1, then drops the `TrainerProfile` table to eliminate redundancy and simplify the data model.

**Why:** The `TrainerProfile` table duplicates columns now available in the `User` table (tagline, bio, favoriteSpeciesId). Consolidation reduces JOIN complexity, improves query performance, and simplifies the schema.

## Migration Strategy

### Data Mapping

| Source (TrainerProfile) | Target (User) | Notes |
| --- | --- | --- |
| `tagline` | `tagline` | TEXT, nullable |
| `bio` | `bio` | TEXT, nullable |
| `favoriteSpeciesId` | `favoriteSpeciesId` | SMALLINT, FK to Species, nullable |
| `createdAt` | N/A | Not migrated (User.createdAt already exists) |
| `updatedAt` | N/A | Not migrated (User.updatedAt already exists) |

### Migration Steps

1. **Verify Pre-migration State**
   - Check TrainerProfile row count
   - Verify User columns exist from Phase 1 (tagline, bio, favoriteSpeciesId)
   - Log pre-migration statistics

2. **Migrate Data**
   - UPDATE User SET tagline/bio/favoriteSpeciesId FROM TrainerProfile WHERE userId matches
   - This overwrites NULL values in User columns (expected state after Phase 1)

3. **Verify Data Integrity**
   - Count migrated User rows
   - Check for TrainerProfile rows without matching User (orphans)
   - Verify migration counts match

4. **Drop TrainerProfile**
   - Drop foreign key constraints
   - Drop indexes
   - DROP TABLE TrainerProfile CASCADE

5. **Post-migration Verification**
   - Verify TrainerProfile table no longer exists
   - Count User rows with profile data
   - Log final statistics

### Rollback Strategy

**Before Migration:**
```bash
# Create backup dump of TrainerProfile table
pg_dump -h <host> -U <user> -d <database> \
  -t "TrainerProfile" -F c \
  -f trainerprofile_backup_$(date +%Y%m%d_%H%M%S).dump
```

**Rollback Procedure:**
1. Recreate TrainerProfile table with original schema
2. Migrate data back from User to TrainerProfile
3. Verify data integrity
4. Optionally clear User profile columns (if reverting to pre-Phase1 state)

**Restore from Backup (if data loss):**
```bash
pg_restore -h <host> -U <user> -d <database> \
  -t "TrainerProfile" -c trainerprofile_backup.dump
```

## Safety Measures

### Pre-execution Checklist

- [ ] Database snapshot created (pg_dump TrainerProfile table)
- [ ] Rollback.sql tested on DEV database
- [ ] Migration.sql reviewed for correctness
- [ ] Performance baseline captured (npm run db:cli -- slow_queries)
- [ ] ProfileService queries reviewed for TrainerProfile dependencies
- [ ] Maintenance window scheduled (low-traffic period)

### Execution Checklist

- [ ] DEV migration executed successfully
- [ ] DEV data integrity verified (all TrainerProfile rows migrated)
- [ ] DEV ProfileService tested (queries work without TrainerProfile)
- [ ] DEV performance validated (no slow query regressions)
- [ ] PROD migration executed
- [ ] PROD data integrity verified
- [ ] PROD ProfileService tested
- [ ] PROD performance validated

### Post-execution Checklist

- [ ] Prisma schema updated (TrainerProfile model removed)
- [ ] User.profile relation removed from schema
- [ ] ProfileService queries updated to use User columns directly
- [ ] npx prisma generate run successfully
- [ ] Application restarted with new schema
- [ ] Monitoring dashboard shows no errors
- [ ] Performance monitoring shows improved query times (fewer JOINs)

## Performance Impact

### Before (Phase 1 + TrainerProfile)

**Profile Query:**
```sql
SELECT u.*, tp.tagline, tp.bio, tp.favoriteSpeciesId
FROM "User" u
LEFT JOIN "TrainerProfile" tp ON u.id = tp."userId"
WHERE u."discordId" = $1;
```
- **Complexity:** Requires JOIN
- **Indexes Used:** User.discordId_idx, TrainerProfile.userId_idx (PK)
- **Estimated Cost:** ~2-3 seq scans for small datasets

### After (Phase 2 Consolidation)

**Profile Query:**
```sql
SELECT u.* FROM "User" u WHERE u."discordId" = $1;
```
- **Complexity:** Single table scan
- **Indexes Used:** User.discordId_idx only
- **Estimated Cost:** ~1 index scan
- **Improvement:** ~30-40% faster (no JOIN overhead)

### Monitoring Commands

```bash
# Check for slow queries (should improve after migration)
npm run db:cli -- slow_queries

# Check table bloat (User table may grow slightly)
npm run db:cli -- table_bloat

# Check index usage (TrainerProfile indexes will disappear)
npm run db:cli -- index_usage

# Check cache hit rates (should improve with fewer tables)
npm run db:cli -- cache_stats
```

## Code Changes Required

### Prisma Schema Updates

**Before (Phase 1):**
```prisma
model User {
  id               String   @id @default(cuid())
  discordId        String   @unique
  tagline          String?
  bio              String?
  favoriteSpeciesId Int?    @db.SmallInt
  profile          TrainerProfile?  // Relation to TrainerProfile
  // ... other fields
}

model TrainerProfile {
  userId            String   @id
  tagline           String?
  bio               String?
  favoriteSpeciesId Int?    @db.SmallInt
  // ... other fields
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

**After (Phase 2):**
```prisma
model User {
  id               String   @id @default(cuid())
  discordId        String   @unique
  tagline          String?
  bio              String?
  favoriteSpeciesId Int?    @db.SmallInt
  // profile relation REMOVED
  // ... other fields
}

// TrainerProfile model REMOVED entirely
```

### ProfileService Query Updates

**Before (Phase 1):**
```typescript
// Query using TrainerProfile JOIN
const user = await prisma.user.findUnique({
  where: { discordId },
  include: {
    profile: true,  // Includes TrainerProfile data
  },
});

const tagline = user.profile?.tagline;
const bio = user.profile?.bio;
```

**After (Phase 2):**
```typescript
// Query using User columns directly
const user = await prisma.user.findUnique({
  where: { discordId },
});

const tagline = user.tagline;
const bio = user.bio;
```

## Testing Plan

### DEV Testing (Required before PROD)

1. **Data Integrity:**
   ```sql
   -- Pre-migration: Count TrainerProfile rows
   SELECT COUNT(*) FROM "TrainerProfile";
   
   -- Post-migration: Count User rows with profile data
   SELECT COUNT(*) FROM "User" 
   WHERE tagline IS NOT NULL 
      OR bio IS NOT NULL 
      OR favoriteSpeciesId IS NOT NULL;
   
   -- Verify counts match
   ```

2. **ProfileService Functionality:**
   - Test getProfile() with User.tagline/bio directly
   - Test getStats() (should not use TrainerProfile)
   - Test getAchievements() (unaffected by this migration)
   - Test leaderboards (unaffected by this migration)

3. **Performance Validation:**
   ```bash
   # Before migration
   npm run db:cli -- slow_queries > before_migration.log
   
   # After migration
   npm run db:cli -- slow_queries > after_migration.log
   
   # Compare: Profile queries should be faster (no JOIN)
   ```

4. **Rollback Test:**
   - Execute rollback.sql on DEV
   - Verify TrainerProfile table restored
   - Verify data matches original snapshot
   - Execute migration.sql again to return to migrated state

### PROD Testing (After DEV validation)

1. **Snapshot before execution**
2. **Execute migration during maintenance window**
3. **Verify data integrity** (same queries as DEV)
4. **Monitor error rates** (should remain stable)
5. **Monitor query performance** (should improve)
6. **Keep rollback.sql ready** (in case of issues)

## Success Criteria

- [ ] All TrainerProfile rows successfully migrated to User table
- [ ] TrainerProfile table dropped with no orphaned data
- [ ] ProfileService queries work correctly without TrainerProfile
- [ ] Query performance improved (profile queries ~30-40% faster)
- [ ] No application errors related to schema changes
- [ ] Prisma schema updated and deployed
- [ ] Monitoring shows stable error rates and improved performance
- [ ] Rollback tested and validated on DEV

## Timeline

**Phase 2 Execution Plan:**

1. **Preparation (Day 1):**
   - Review migration.sql and rollback.sql
   - Create database snapshots (DEV + PROD)
   - Capture performance baselines

2. **DEV Migration (Day 1-2):**
   - Execute migration on DEV
   - Verify data integrity
   - Test ProfileService functionality
   - Validate performance improvements
   - Test rollback procedure

3. **Code Updates (Day 2):**
   - Update Prisma schema (remove TrainerProfile model)
   - Update ProfileService queries (use User columns)
   - Run npx prisma generate
   - Test locally with new schema
   - Deploy to DEV for integration testing

4. **PROD Migration (Day 3):**
   - Schedule maintenance window (low-traffic period)
   - Execute migration on PROD
   - Verify data integrity
   - Deploy code updates
   - Monitor error rates and performance
   - Keep rollback ready for 24 hours

5. **Validation (Day 3-4):**
   - Monitor query performance (should improve)
   - Monitor error rates (should remain stable)
   - Validate ProfileService functionality
   - Document outcomes in Tasklist.md

## References

- **Phase 1 Migration:** `prisma/migrations/202511061630_northstar_phase1_additions/`
- **Phase 2 Migration:** `prisma/migrations/20251108183000_northstar_phase2_consolidation/`
- **Monitoring Commands:** `scripts/db_admin.ts` (index_usage, table_bloat, slow_queries, cache_stats)
- **ProfileService:** `src/services/profiles/` (will need query updates)
- **Database Bootstrap:** `ops/DB_BOOTSTRAP.md` (migration workflow)

## Next Steps

After Phase 2 completion:

1. **DB.NORTHSTAR.ANALYTICS** — Build analytics jobs and reporting layer
   - DailyStats aggregation (daily 00:00 UTC)
   - Leaderboard refresh (hourly)
   - Materialized view maintenance

2. **Performance Optimization** — Leverage consolidated schema
   - Remove obsolete indexes
   - Optimize profile queries
   - Review and update caching strategies

3. **Monitoring** — Track consolidation impact
   - Query latency (should decrease)
   - Cache hit rates (should improve)
   - Table bloat (User table may grow slightly)

---

**Revision History:**
- 2025-11-08T18:40:00Z — Initial Phase 2 plan (Rev 1.0)
