-- Northstar Phase 2: TrainerProfile Data Consolidation (Medium Risk, Planned Downtime)
-- This migration consolidates TrainerProfile data into User table columns added in Phase 1,
-- then drops the TrainerProfile table to eliminate redundancy.
-- 
-- IMPORTANT: Take database snapshot before execution!
-- Command: pg_dump -h <host> -U <user> -d <database> -t "TrainerProfile" -F c -f trainerprofile_backup.dump
--
-- Phase 1 added these User columns (all nullable):
--   - tagline TEXT
--   - bio TEXT
--   - favoriteSpeciesId SMALLINT (with FK constraint to Species)
--
-- This migration will:
--   1. Migrate TrainerProfile data into User table
--   2. Verify data integrity
--   3. Drop TrainerProfile table
--   4. Update User.profile relation (removed from schema)

-- ============================================================================
-- STEP 1: VERIFY PRE-MIGRATION STATE
-- ============================================================================

-- Check TrainerProfile row count (for verification later)
DO $$
DECLARE
    profile_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO profile_count FROM "TrainerProfile";
    RAISE NOTICE 'Pre-migration: TrainerProfile has % rows', profile_count;
END $$;

-- Check User columns exist from Phase 1
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'User' AND column_name = 'tagline'
    ) THEN
        RAISE EXCEPTION 'User.tagline column missing - Phase 1 migration required';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'User' AND column_name = 'bio'
    ) THEN
        RAISE EXCEPTION 'User.bio column missing - Phase 1 migration required';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'User' AND column_name = 'favoriteSpeciesId'
    ) THEN
        RAISE EXCEPTION 'User.favoriteSpeciesId column missing - Phase 1 migration required';
    END IF;
    
    RAISE NOTICE 'Pre-migration: All required User columns exist';
END $$;

-- ============================================================================
-- STEP 2: MIGRATE TRAINERPROFILE DATA TO USER TABLE
-- ============================================================================

-- Migrate tagline, bio, and favoriteSpeciesId from TrainerProfile to User
-- This UPDATE will overwrite any existing values in User columns (expected to be NULL)
UPDATE "User"
SET 
    "tagline" = "TrainerProfile"."tagline",
    "bio" = "TrainerProfile"."bio",
    "favoriteSpeciesId" = "TrainerProfile"."favoriteSpeciesId"
FROM "TrainerProfile"
WHERE "User"."id" = "TrainerProfile"."userId";

-- Log migration progress
DO $$
DECLARE
    migrated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO migrated_count 
    FROM "User" 
    WHERE "tagline" IS NOT NULL 
       OR "bio" IS NOT NULL 
       OR "favoriteSpeciesId" IS NOT NULL;
    
    RAISE NOTICE 'Post-migration: % User rows have profile data', migrated_count;
END $$;

-- ============================================================================
-- STEP 3: VERIFY DATA INTEGRITY
-- ============================================================================

-- Ensure all TrainerProfile rows were migrated
DO $$
DECLARE
    profile_count INTEGER;
    migrated_count INTEGER;
    missing_count INTEGER;
BEGIN
    -- Count original TrainerProfile rows
    SELECT COUNT(*) INTO profile_count FROM "TrainerProfile";
    
    -- Count User rows that should have been migrated
    -- (Users with TrainerProfile should have at least one field populated)
    SELECT COUNT(*) INTO migrated_count
    FROM "User" u
    INNER JOIN "TrainerProfile" tp ON u."id" = tp."userId";
    
    -- Check for TrainerProfile rows without matching User
    SELECT COUNT(*) INTO missing_count
    FROM "TrainerProfile" tp
    LEFT JOIN "User" u ON tp."userId" = u."id"
    WHERE u."id" IS NULL;
    
    IF missing_count > 0 THEN
        RAISE EXCEPTION 'Data integrity check FAILED: % TrainerProfile rows have no matching User', missing_count;
    END IF;
    
    IF profile_count != migrated_count THEN
        RAISE WARNING 'Mismatch: % TrainerProfile rows but only % migrated User rows', profile_count, migrated_count;
    ELSE
        RAISE NOTICE 'Data integrity check PASSED: All % TrainerProfile rows migrated', profile_count;
    END IF;
END $$;

-- ============================================================================
-- STEP 4: DROP TRAINERPROFILE TABLE
-- ============================================================================

-- Drop foreign key constraint from TrainerProfile (if exists)
ALTER TABLE "TrainerProfile" DROP CONSTRAINT IF EXISTS "TrainerProfile_userId_fkey" CASCADE;
ALTER TABLE "TrainerProfile" DROP CONSTRAINT IF EXISTS "TrainerProfile_favoriteSpeciesId_fkey" CASCADE;

-- Drop indexes on TrainerProfile
DROP INDEX IF EXISTS "TrainerProfile_favoriteSpeciesId_idx";

-- Drop the TrainerProfile table
DROP TABLE IF EXISTS "TrainerProfile" CASCADE;

-- Log table drop
DO $$
BEGIN
    RAISE NOTICE 'TrainerProfile table dropped successfully';
END $$;

-- ============================================================================
-- STEP 5: POST-MIGRATION VERIFICATION
-- ============================================================================

-- Verify TrainerProfile table no longer exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'TrainerProfile'
    ) THEN
        RAISE EXCEPTION 'Post-migration check FAILED: TrainerProfile table still exists';
    ELSE
        RAISE NOTICE 'Post-migration check PASSED: TrainerProfile table removed';
    END IF;
END $$;

-- Count User rows with profile data
DO $$
DECLARE
    user_with_profile INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_with_profile
    FROM "User"
    WHERE "tagline" IS NOT NULL 
       OR "bio" IS NOT NULL 
       OR "favoriteSpeciesId" IS NOT NULL;
    
    RAISE NOTICE 'Final state: % User rows have profile data', user_with_profile;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary
DO $$
BEGIN
    RAISE NOTICE '====================================';
    RAISE NOTICE 'Northstar Phase 2 Migration Complete';
    RAISE NOTICE '====================================';
    RAISE NOTICE 'TrainerProfile data consolidated into User table';
    RAISE NOTICE 'TrainerProfile table dropped';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Update Prisma schema to remove TrainerProfile model';
    RAISE NOTICE '  2. Update User.profile relation reference';
    RAISE NOTICE '  3. Update ProfileService queries to use User columns directly';
    RAISE NOTICE '  4. Run performance validation: npm run db:cli -- table_bloat';
    RAISE NOTICE '====================================';
END $$;
