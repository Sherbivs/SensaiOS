-- Northstar Phase 2: Rollback Script
-- This script restores the TrainerProfile table and reverses the data consolidation.
--
-- IMPORTANT: This rollback assumes you have a database snapshot from before Phase 2 migration.
-- If data was lost during migration, restore from: trainerprofile_backup.dump
--
-- Rollback steps:
--   1. Recreate TrainerProfile table with original schema
--   2. Migrate data back from User to TrainerProfile
--   3. Verify data integrity
--   4. Clear User profile columns (optional - depends on schema version)

-- ============================================================================
-- STEP 1: RECREATE TRAINERPROFILE TABLE
-- ============================================================================

-- Recreate TrainerProfile table with original schema
CREATE TABLE IF NOT EXISTS "TrainerProfile" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "tagline" TEXT,
    "bio" TEXT,
    "favoriteSpeciesId" SMALLINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraint to User
ALTER TABLE "TrainerProfile" 
    ADD CONSTRAINT "TrainerProfile_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- Add foreign key constraint to Species (if Species table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Species') THEN
        ALTER TABLE "TrainerProfile" 
            ADD CONSTRAINT "TrainerProfile_favoriteSpeciesId_fkey" 
            FOREIGN KEY ("favoriteSpeciesId") REFERENCES "Species"("id") ON DELETE SET NULL;
    END IF;
END $$;

-- Recreate index on favoriteSpeciesId
CREATE INDEX IF NOT EXISTS "TrainerProfile_favoriteSpeciesId_idx" 
    ON "TrainerProfile"("favoriteSpeciesId");

RAISE NOTICE 'TrainerProfile table recreated';

-- ============================================================================
-- STEP 2: MIGRATE DATA BACK FROM USER TO TRAINERPROFILE
-- ============================================================================

-- Insert data from User columns back into TrainerProfile
-- Only insert rows where at least one profile field is populated
INSERT INTO "TrainerProfile" ("userId", "tagline", "bio", "favoriteSpeciesId", "createdAt", "updatedAt")
SELECT 
    "id" as "userId",
    "tagline",
    "bio",
    "favoriteSpeciesId",
    COALESCE("createdAt", CURRENT_TIMESTAMP) as "createdAt",
    COALESCE("updatedAt", CURRENT_TIMESTAMP) as "updatedAt"
FROM "User"
WHERE "tagline" IS NOT NULL 
   OR "bio" IS NOT NULL 
   OR "favoriteSpeciesId" IS NOT NULL
ON CONFLICT ("userId") DO UPDATE SET
    "tagline" = EXCLUDED."tagline",
    "bio" = EXCLUDED."bio",
    "favoriteSpeciesId" = EXCLUDED."favoriteSpeciesId",
    "updatedAt" = CURRENT_TIMESTAMP;

-- Log rollback progress
DO $$
DECLARE
    restored_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO restored_count FROM "TrainerProfile";
    RAISE NOTICE 'Rollback: Restored % TrainerProfile rows', restored_count;
END $$;

-- ============================================================================
-- STEP 3: VERIFY DATA INTEGRITY
-- ============================================================================

DO $$
DECLARE
    user_profile_count INTEGER;
    trainer_profile_count INTEGER;
BEGIN
    -- Count User rows with profile data
    SELECT COUNT(*) INTO user_profile_count
    FROM "User"
    WHERE "tagline" IS NOT NULL 
       OR "bio" IS NOT NULL 
       OR "favoriteSpeciesId" IS NOT NULL;
    
    -- Count TrainerProfile rows
    SELECT COUNT(*) INTO trainer_profile_count FROM "TrainerProfile";
    
    IF user_profile_count != trainer_profile_count THEN
        RAISE WARNING 'Data mismatch: % User rows with profile data, % TrainerProfile rows', 
            user_profile_count, trainer_profile_count;
    ELSE
        RAISE NOTICE 'Data integrity check PASSED: % rows in both User and TrainerProfile', 
            user_profile_count;
    END IF;
END $$;

-- ============================================================================
-- STEP 4 (OPTIONAL): CLEAR USER PROFILE COLUMNS
-- ============================================================================

-- WARNING: This step will remove profile data from User table.
-- Only run this if you want to revert User table to pre-Phase1 state.
-- If you want to keep Phase 1 columns but restore TrainerProfile, skip this step.

-- Uncomment the following to clear User profile columns:
/*
UPDATE "User"
SET 
    "tagline" = NULL,
    "bio" = NULL,
    "favoriteSpeciesId" = NULL
WHERE "tagline" IS NOT NULL 
   OR "bio" IS NOT NULL 
   OR "favoriteSpeciesId" IS NOT NULL;

RAISE NOTICE 'User profile columns cleared';
*/

-- ============================================================================
-- ROLLBACK COMPLETE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '====================================';
    RAISE NOTICE 'Northstar Phase 2 Rollback Complete';
    RAISE NOTICE '====================================';
    RAISE NOTICE 'TrainerProfile table restored';
    RAISE NOTICE 'Data migrated back from User to TrainerProfile';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Restore Prisma schema to include TrainerProfile model';
    RAISE NOTICE '  2. Restore User.profile relation reference';
    RAISE NOTICE '  3. Update ProfileService queries to use TrainerProfile';
    RAISE NOTICE '  4. Run: npx prisma generate';
    RAISE NOTICE '  5. Verify application works correctly';
    RAISE NOTICE '====================================';
END $$;

-- ============================================================================
-- RESTORING FROM BACKUP (If needed)
-- ============================================================================

-- If data was lost during migration and you need to restore from backup dump:
-- pg_restore -h <host> -U <user> -d <database> -t "TrainerProfile" -c trainerprofile_backup.dump
--
-- This will:
--   1. Drop the TrainerProfile table (if exists)
--   2. Recreate it from backup
--   3. Restore all data from backup dump
