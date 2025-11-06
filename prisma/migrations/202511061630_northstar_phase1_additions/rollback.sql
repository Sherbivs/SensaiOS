-- Northstar Phase 1 Rollback Script
-- Use this script to roll back the Phase 1 migration if needed.
-- WARNING: This will delete all event tracking data, achievements, and analytics.
-- Run this ONLY if you need to completely revert the migration.

-- ============================================================================
-- PART 1: DROP NEW TABLES (in reverse dependency order)
-- ============================================================================

-- Drop Leaderboard table
DROP TABLE IF EXISTS "Leaderboard" CASCADE;

-- Drop DailyStats table
DROP TABLE IF EXISTS "DailyStats" CASCADE;

-- Drop UserAchievement junction table
DROP TABLE IF EXISTS "UserAchievement" CASCADE;

-- Drop Achievement table
DROP TABLE IF EXISTS "Achievement" CASCADE;

-- Drop UserEvent table
DROP TABLE IF EXISTS "UserEvent" CASCADE;

-- Drop UserProfile table
DROP TABLE IF EXISTS "UserProfile" CASCADE;

-- ============================================================================
-- PART 2: DROP NEW ENUMS
-- ============================================================================

DROP TYPE IF EXISTS "EventSeverity" CASCADE;
DROP TYPE IF EXISTS "EventCategory" CASCADE;

-- ============================================================================
-- PART 3: REMOVE NEW COLUMNS FROM USER TABLE
-- ============================================================================

-- Remove privacy controls
ALTER TABLE "User" DROP COLUMN IF EXISTS "showAchievements";
ALTER TABLE "User" DROP COLUMN IF EXISTS "showStats";
ALTER TABLE "User" DROP COLUMN IF EXISTS "profileVisibility";

-- Remove activity tracking
ALTER TABLE "User" DROP COLUMN IF EXISTS "lastActivityAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "lastLoginAt";

-- Remove favorite species reference
ALTER TABLE "User" DROP COLUMN IF EXISTS "favoriteSpeciesId";

-- Remove denormalized statistics
ALTER TABLE "User" DROP COLUMN IF EXISTS "totalEncounters";
ALTER TABLE "User" DROP COLUMN IF EXISTS "totalCatches";
ALTER TABLE "User" DROP COLUMN IF EXISTS "totalWins";
ALTER TABLE "User" DROP COLUMN IF EXISTS "totalBattles";

-- Remove economy fields
ALTER TABLE "User" DROP COLUMN IF EXISTS "premiumCoins";

-- Remove profile fields
ALTER TABLE "User" DROP COLUMN IF EXISTS "avatarUrl";
ALTER TABLE "User" DROP COLUMN IF EXISTS "bio";
ALTER TABLE "User" DROP COLUMN IF EXISTS "tagline";
ALTER TABLE "User" DROP COLUMN IF EXISTS "nickname";

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify tables are dropped
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'UserEvent') THEN
        RAISE WARNING 'UserEvent table still exists!';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Achievement') THEN
        RAISE WARNING 'Achievement table still exists!';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'UserAchievement') THEN
        RAISE WARNING 'UserAchievement table still exists!';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'DailyStats') THEN
        RAISE WARNING 'DailyStats table still exists!';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Leaderboard') THEN
        RAISE WARNING 'Leaderboard table still exists!';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'UserProfile') THEN
        RAISE WARNING 'UserProfile table still exists!';
    END IF;
    
    RAISE NOTICE 'Rollback completed successfully. All Northstar Phase 1 changes have been reverted.';
END $$;

-- ============================================================================
-- POST-ROLLBACK STEPS
-- ============================================================================

-- After running this rollback:
-- 1. Run VACUUM ANALYZE on "User" table to reclaim space
-- 2. Verify application still functions correctly
-- 3. Remove any EventTracker service code if deployed
-- 4. Clear application caches
-- 5. Monitor for any errors in application logs

-- VACUUM ANALYZE "User";
