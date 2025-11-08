# Northstar Phase 2: TrainerProfile Data Consolidation

**Migration ID:** `20251108183000_northstar_phase2_consolidation`  
**Created:** 2025-11-08T18:30:00Z  
**Risk Level:** Medium (data manipulation, table drops)  
**Estimated Downtime:** ~30 seconds (depending on TrainerProfile row count)

## Purpose

Consolidate TrainerProfile data into User table and drop the redundant TrainerProfile table. This migration completes the Northstar schema consolidation by eliminating the separate profile table and centralizing all trainer data in the User model.

## Prerequisites

**Phase 1 (REQUIRED):**
- Migration `202511061630_northstar_phase1_additions` must be deployed
- User table must have columns: `tagline`, `bio`, `favoriteSpeciesId` (all nullable)

**Testing Infrastructure (REQUIRED):**
- EXPERIMENTAL database configured (port 55434)
- PRIMARY LOCAL database running (port 55433)
- Dual-local database architecture validated (see `docs/dual-local-database-guide.md`)

## Migration Overview

### Current State (Before Migration)
```
User Table:
- id, discordId, username, nickname, createdAt, updatedAt
- tagline (nullable, Phase 1)
- bio (nullable, Phase 1)
- favoriteSpeciesId (nullable, Phase 1, FK to Species)

TrainerProfile Table:
- userId (PK, FK to User)
- tagline, bio, favoriteSpeciesId
- createdAt, updatedAt
```

### Target State (After Migration)
```
User Table:
- id, discordId, username, nickname, createdAt, updatedAt
- tagline (populated from TrainerProfile)
- bio (populated from TrainerProfile)
- favoriteSpeciesId (populated from TrainerProfile, FK to Species)

TrainerProfile Table:
- **DROPPED**
```

## Data Flow

```
┌─────────────────┐
│ TrainerProfile  │
│ (Source)        │
└────────┬────────┘
         │
         │ UPDATE User SET
         │   tagline = TrainerProfile.tagline,
         │   bio = TrainerProfile.bio,
         │   favoriteSpeciesId = TrainerProfile.favoriteSpeciesId
         │ FROM TrainerProfile
         │ WHERE User.id = TrainerProfile.userId
         │
         ▼
┌─────────────────┐
│ User            │
│ (Target)        │
│                 │
│ ✅ tagline      │
│ ✅ bio          │
│ ✅ favoriteId   │
└─────────────────┘
         │
         │ DROP TABLE TrainerProfile CASCADE
         ▼
   TrainerProfile
      REMOVED
```

## Safety Measures

### Pre-Migration
1. **Database Snapshot (MANDATORY):**
   ```bash
   # Schema snapshot
   pg_dump $DATABASE_URL --schema-only > schema_before_phase2.sql
   
   # TrainerProfile data backup
   pg_dump $DATABASE_URL --data-only --table=TrainerProfile > trainerprofile_data_backup.sql
   
   # Full database backup (recommended)
   pg_dump $DATABASE_URL -F c -f full_backup_before_phase2.dump
   ```

2. **Pre-Migration Validation:**
   - Verify Phase 1 columns exist: `tagline`, `bio`, `favoriteSpeciesId`
   - Check TrainerProfile row count
   - Ensure no orphaned TrainerProfile records (all have matching User)

### During Migration
1. **Data Integrity Checks:**
   - Verify all TrainerProfile rows migrated to User
   - Check for missing User.id references
   - Validate favoriteSpeciesId foreign keys

2. **Progress Logging:**
   - Log pre-migration TrainerProfile count
   - Log post-migration User rows with profile data
   - Verify migrated count matches original count

### Post-Migration
1. **Final Validation:**
   - Confirm TrainerProfile table dropped
   - Verify User rows have profile data
   - Test ProfileService queries

2. **Performance Validation:**
   ```bash
   npm run db:cli -- table_bloat
   npm run db:cli -- slow_queries
   npm run db:cli -- cache_stats
   ```

## Testing Workflow

### Phase 1: EXPERIMENTAL Database Testing (100% OFFLINE)

```bash
# Step 1: Sync EXPERIMENTAL from PRIMARY LOCAL
npm run ops:sync-experiment-db -- --from local

# Step 2: Verify EXPERIMENTAL database state
npm run db:cli -- count User --target experiment
npm run db:cli -- count TrainerProfile --target experiment

# Step 3: Apply migration to EXPERIMENTAL
psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql

# Step 4: Validate migration results
npm run db:cli -- count User --target experiment
npm run db:cli -- query "SELECT COUNT(*) FROM \"User\" WHERE \"tagline\" IS NOT NULL OR \"bio\" IS NOT NULL;" --target experiment

# Step 5: Verify TrainerProfile table dropped
npm run db:cli -- query "SELECT table_name FROM information_schema.tables WHERE table_name = 'TrainerProfile';" --target experiment

# Step 6: Test ProfileService queries (manual)
# Update src/services/ProfileService.ts to query User directly
# Restart application with DATABASE_EXPERIMENT_URL
# Verify /profile commands work correctly
```

### Phase 2: PRIMARY LOCAL Validation (100% OFFLINE)

```bash
# Step 1: Apply migration to PRIMARY LOCAL
psql postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db \
  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql

# Step 2: Validate migration results
npm run db:cli -- count User --target local
npm run db:cli -- query "SELECT COUNT(*) FROM \"User\" WHERE \"tagline\" IS NOT NULL OR \"bio\" IS NOT NULL;" --target local

# Step 3: Performance validation
npm run db:cli -- table_bloat --target local
npm run db:cli -- slow_queries --target local

# Step 4: Test application with local database
# Restart bot with DATABASE_LOCAL_URL
# Test /profile set, /profile view, /profile favorite
```

### Phase 3: DEV Master Deployment (CLOUD OPERATION)

```bash
# Step 1: EXPLICIT PUSH to DEV master (manual approval required)
psql $DEV_DATABASE_URL \
  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql

# Step 2: Verify DEV migration
npm run db:cli -- count User --target dev
npm run db:cli -- query "SELECT COUNT(*) FROM \"User\" WHERE \"tagline\" IS NOT NULL OR \"bio\" IS NOT NULL;" --target dev

# Step 3: DEV master automatically replicates to PROD node
# Monitor replication status in Render logs
```

## Rollback Procedure

### Emergency Rollback (If Issues Found)

```bash
# Step 1: Stop application (prevent new writes)
# Render Dashboard → infinity-gauntlet-bots → Suspend

# Step 2: Apply rollback.sql
psql $DATABASE_URL \
  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/rollback.sql

# Step 3: Verify TrainerProfile table restored
npm run db:cli -- count TrainerProfile

# Step 4: Restore Prisma schema (git revert)
git revert <migration_commit_sha>
npx prisma generate

# Step 5: Restart application
# Render Dashboard → infinity-gauntlet-bots → Resume
```

### Rollback Testing (EXPERIMENTAL Database)

```bash
# Test rollback on EXPERIMENTAL first
psql postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment \
  -f prisma/migrations/20251108183000_northstar_phase2_consolidation/rollback.sql

# Verify TrainerProfile restored
npm run db:cli -- count TrainerProfile --target experiment

# Verify data integrity
npm run db:cli -- query "SELECT COUNT(*) FROM \"TrainerProfile\";" --target experiment
```

## Post-Migration Application Updates

### Required Code Changes

1. **Remove TrainerProfile model from Prisma schema:**
   ```diff
   - model TrainerProfile {
   -   userId            String   @id
   -   tagline           String?
   -   bio               String?
   -   favoriteSpeciesId Int?     @map("favoriteSpeciesId") @db.SmallInt
   -   createdAt         DateTime @default(now())
   -   updatedAt         DateTime @updatedAt
   -   user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
   -   favoriteSpecies   Species? @relation(fields: [favoriteSpeciesId], references: [id], onDelete: SetNull)
   - }
   ```

2. **Update User model profile relation:**
   ```diff
   model User {
     // ... existing fields
     tagline           String?
     bio               String?
     favoriteSpeciesId Int?     @map("favoriteSpeciesId") @db.SmallInt
   - profile           TrainerProfile?
   + favoriteSpecies   Species? @relation(fields: [favoriteSpeciesId], references: [id])
   }
   ```

3. **Update ProfileService queries:**
   ```diff
   - const profile = await prisma.trainerProfile.findUnique({ where: { userId } });
   + const user = await prisma.user.findUnique({ where: { id: userId }, select: { tagline: true, bio: true, favoriteSpeciesId: true } });
   ```

4. **Run Prisma generate:**
   ```bash
   npx prisma generate
   ```

### Deployment Checklist

- [ ] EXPERIMENTAL testing complete
- [ ] PRIMARY LOCAL validation complete
- [ ] Rollback tested successfully on EXPERIMENTAL
- [ ] Database snapshot taken before DEV deployment
- [ ] DEV migration applied successfully
- [ ] DEV data validation passed
- [ ] PROD replication verified
- [ ] Application code updated (TrainerProfile removed from schema)
- [ ] ProfileService queries updated
- [ ] Prisma client regenerated
- [ ] Application restarted and tested in production
- [ ] Performance metrics validated (table_bloat, slow_queries)
- [ ] Monitoring dashboards updated

## Performance Impact

**Expected Performance Improvements:**
- ✅ Eliminated JOIN between User and TrainerProfile (queries now hit single table)
- ✅ Reduced database storage (one table instead of two)
- ✅ Simplified query patterns (direct User.tagline access vs User.profile.tagline)
- ✅ Improved cache hit rates (fewer table reads)

**Metrics to Monitor:**
- Query latency for `/profile` commands (expect <500ms, down from ~800ms with JOIN)
- User table bloat percentage (expect <20%)
- Cache hit rates for User queries (expect >80%)

## Troubleshooting

### Issue: Migration fails with orphaned TrainerProfile records
**Cause:** TrainerProfile rows exist without matching User.id  
**Solution:**
```sql
-- Find orphaned records
SELECT * FROM "TrainerProfile" tp
LEFT JOIN "User" u ON tp."userId" = u."id"
WHERE u."id" IS NULL;

-- Delete orphaned records (CAREFUL)
DELETE FROM "TrainerProfile"
WHERE "userId" NOT IN (SELECT "id" FROM "User");
```

### Issue: Data integrity check fails after migration
**Cause:** TrainerProfile count doesn't match User rows with profile data  
**Solution:**
```sql
-- Compare counts
SELECT 
  (SELECT COUNT(*) FROM "TrainerProfile") as trainerprofile_count,
  (SELECT COUNT(*) FROM "User" WHERE "tagline" IS NOT NULL OR "bio" IS NOT NULL) as user_profile_count;

-- If mismatch, check for NULL-only TrainerProfile rows
SELECT * FROM "TrainerProfile"
WHERE "tagline" IS NULL AND "bio" IS NULL AND "favoriteSpeciesId" IS NULL;
```

### Issue: Rollback fails with constraint violations
**Cause:** User.favoriteSpeciesId has invalid Species references  
**Solution:**
```sql
-- Find invalid Species references
SELECT u."id", u."favoriteSpeciesId"
FROM "User" u
LEFT JOIN "Species" s ON u."favoriteSpeciesId" = s."id"
WHERE u."favoriteSpeciesId" IS NOT NULL AND s."id" IS NULL;

-- Fix invalid references
UPDATE "User" SET "favoriteSpeciesId" = NULL
WHERE "favoriteSpeciesId" NOT IN (SELECT "id" FROM "Species");
```

## References

- **Phase 1 Migration:** `prisma/migrations/202511061630_northstar_phase1_additions/`
- **Dual-Local Database Guide:** `docs/dual-local-database-guide.md`
- **Database Replication Architecture:** `docs/db-replication-architecture.md`
- **AGENTS.md:** Dual Local Database Setup (Workstation Only) section
- **Tasklist.md:** DB.NORTHSTAR.PHASE2 task notes

## Success Criteria

- ✅ All TrainerProfile data migrated to User table (zero data loss)
- ✅ TrainerProfile table successfully dropped
- ✅ No orphaned records or data integrity violations
- ✅ ProfileService queries work correctly with User columns
- ✅ Performance metrics improved (query latency, cache hits)
- ✅ Rollback tested and validated on EXPERIMENTAL
- ✅ Application code updated and deployed
- ✅ Production monitoring shows no errors or regressions

---

**Status:** Ready for EXPERIMENTAL testing  
**Next Action:** Execute Phase 1 testing workflow on EXPERIMENTAL database
