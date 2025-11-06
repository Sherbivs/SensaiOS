-- Northstar Phase 1: Additive Changes (Low Risk, Zero Downtime)
-- This migration adds new tables and columns for enhanced user profiles,
-- event tracking, achievements, and analytics WITHOUT removing anything.
-- All changes are backward compatible.

-- ============================================================================
-- PART 1: ENHANCED USER PROFILE COLUMNS
-- ============================================================================

-- Add new profile fields to User table (all nullable for backward compatibility)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nickname" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tagline" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;

-- Add economy fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "premiumCoins" INTEGER NOT NULL DEFAULT 0;

-- Add denormalized statistics (for fast leaderboard queries)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totalBattles" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totalWins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totalCatches" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totalEncounters" INTEGER NOT NULL DEFAULT 0;

-- Add favorite species reference
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "favoriteSpeciesId" SMALLINT;

-- Add activity tracking
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3);

-- Add privacy controls
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileVisibility" TEXT NOT NULL DEFAULT 'public';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showStats" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showAchievements" BOOLEAN NOT NULL DEFAULT true;

-- Add foreign key for favorite species (if Species table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Species') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'User_favoriteSpeciesId_fkey'
        ) THEN
            ALTER TABLE "User" ADD CONSTRAINT "User_favoriteSpeciesId_fkey" 
                FOREIGN KEY ("favoriteSpeciesId") REFERENCES "Species"("id") ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

-- ============================================================================
-- PART 2: USER PROFILE EXTENDED TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "UserProfile" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "timezone" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "favoriteColor" TEXT,
    "displayBadges" JSONB,
    "friendCode" TEXT,
    "discord" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Create unique index on friendCode
CREATE UNIQUE INDEX IF NOT EXISTS "UserProfile_friendCode_key" ON "UserProfile"("friendCode") WHERE "friendCode" IS NOT NULL;

-- Create index for lookups
CREATE INDEX IF NOT EXISTS "UserProfile_friendCode_idx" ON "UserProfile"("friendCode") WHERE "friendCode" IS NOT NULL;

-- ============================================================================
-- PART 3: EVENT TRACKING SYSTEM
-- ============================================================================

-- Create event category enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventCategory') THEN
        CREATE TYPE "EventCategory" AS ENUM ('gameplay', 'engagement', 'economy', 'social', 'system', 'admin');
    END IF;
END $$;

-- Create event severity enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventSeverity') THEN
        CREATE TYPE "EventSeverity" AS ENUM ('info', 'warning', 'error', 'critical');
    END IF;
END $$;

-- Create UserEvent table
CREATE TABLE IF NOT EXISTS "UserEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "category" "EventCategory" NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" "EventSeverity" NOT NULL DEFAULT 'info',
    
    -- Event payload
    "data" JSONB,
    
    -- Session context
    "sessionId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    
    -- Entity associations (polymorphic)
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    
    -- Timestamps
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    
    -- Privacy & retention
    "isPII" BOOLEAN NOT NULL DEFAULT false,
    "retainUntil" TIMESTAMP(3),
    
    CONSTRAINT "UserEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- ============================================================================
-- PART 4: ACHIEVEMENT SYSTEM
-- ============================================================================

-- Create Achievement table
CREATE TABLE IF NOT EXISTS "Achievement" (
    "id" SMALLINT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    
    -- Requirements (flexible JSON schema)
    "criteria" JSONB NOT NULL,
    
    -- Rewards
    "coinReward" INTEGER NOT NULL DEFAULT 0,
    "badgeIcon" TEXT,
    
    -- Metadata
    "rarity" TEXT NOT NULL DEFAULT 'common',
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- Create index on category and sort order
CREATE INDEX IF NOT EXISTS "Achievement_category_sortOrder_idx" ON "Achievement"("category", "sortOrder");

-- Create UserAchievement junction table
CREATE TABLE IF NOT EXISTS "UserAchievement" (
    "userId" TEXT NOT NULL,
    "achievementId" SMALLINT NOT NULL,
    
    -- Progress tracking
    "progress" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    
    -- Metadata
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY ("userId", "achievementId"),
    CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
    CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE
);

-- ============================================================================
-- PART 5: ANALYTICS & REPORTING TABLES
-- ============================================================================

-- Create DailyStats table
CREATE TABLE IF NOT EXISTS "DailyStats" (
    "date" DATE NOT NULL PRIMARY KEY,
    
    -- User metrics
    "activeUsers" INTEGER NOT NULL DEFAULT 0,
    "newUsers" INTEGER NOT NULL DEFAULT 0,
    
    -- Gameplay metrics
    "battlesTotal" INTEGER NOT NULL DEFAULT 0,
    "catchesTotal" INTEGER NOT NULL DEFAULT 0,
    "encountersTotal" INTEGER NOT NULL DEFAULT 0,
    
    -- Economy metrics
    "coinsEarned" INTEGER NOT NULL DEFAULT 0,
    "coinsSpent" INTEGER NOT NULL DEFAULT 0,
    
    -- Engagement
    "dailyQuestsCompleted" INTEGER NOT NULL DEFAULT 0,
    "achievementsUnlocked" INTEGER NOT NULL DEFAULT 0,
    
    -- Performance
    "avgLatencyMs" DOUBLE PRECISION,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    
    -- Metadata
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index for date range queries
CREATE INDEX IF NOT EXISTS "DailyStats_date_idx" ON "DailyStats"("date" DESC);

-- Create Leaderboard table
CREATE TABLE IF NOT EXISTS "Leaderboard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    
    -- Rankings (JSON array for fast reads)
    "rankings" JSONB NOT NULL,
    
    -- Metadata
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    
    CONSTRAINT "Leaderboard_category_period_key" UNIQUE ("category", "period")
);

-- Create indexes for leaderboard lookup
CREATE INDEX IF NOT EXISTS "Leaderboard_category_expiresAt_idx" ON "Leaderboard"("category", "expiresAt");
CREATE INDEX IF NOT EXISTS "Leaderboard_category_period_idx" ON "Leaderboard"("category", "period");

-- ============================================================================
-- PART 6: BACKFILL EXISTING DATA
-- ============================================================================

-- Backfill totalBattles from Battle table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Battle') THEN
        UPDATE "User" u
        SET "totalBattles" = COALESCE(
            (SELECT COUNT(*) FROM "Battle" b WHERE b."p1Id" = u.id OR b."p2Id" = u.id), 
            0
        )
        WHERE "totalBattles" = 0;
    END IF;
END $$;

-- Backfill totalCatches from PokemonInstance table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'PokemonInstance') THEN
        UPDATE "User" u
        SET "totalCatches" = COALESCE(
            (SELECT COUNT(*) FROM "PokemonInstance" p WHERE p."ownerId" = u.id), 
            0
        )
        WHERE "totalCatches" = 0;
    END IF;
END $$;

-- Backfill totalEncounters from Encounter table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Encounter') THEN
        UPDATE "User" u
        SET "totalEncounters" = COALESCE(
            (SELECT COUNT(*) FROM "Encounter" e WHERE e."ownerId" = u.id), 
            0
        )
        WHERE "totalEncounters" = 0;
    END IF;
END $$;

-- Backfill lastActivityAt from recent battles or encounters
DO $$
BEGIN
    UPDATE "User" u
    SET "lastActivityAt" = COALESCE(
        (
            SELECT MAX(greatest_date) FROM (
                SELECT GREATEST(
                    COALESCE((SELECT MAX("startedAt") FROM "Battle" WHERE "p1Id" = u.id OR "p2Id" = u.id), '1970-01-01'::timestamp),
                    COALESCE((SELECT MAX("startedAt") FROM "Encounter" WHERE "ownerId" = u.id), '1970-01-01'::timestamp)
                ) as greatest_date
            ) subq
        ),
        u."createdAt"
    )
    WHERE "lastActivityAt" IS NULL;
EXCEPTION
    WHEN OTHERS THEN
        -- If Battle or Encounter tables don't exist, just use createdAt
        UPDATE "User" SET "lastActivityAt" = "createdAt" WHERE "lastActivityAt" IS NULL;
END $$;

-- ============================================================================
-- EXECUTION SUMMARY
-- ============================================================================

-- Tables created: UserProfile, UserEvent, Achievement, UserAchievement, DailyStats, Leaderboard
-- Columns added to User: 19 new fields
-- Enums created: EventCategory, EventSeverity
-- Indexes created: Basic indexes on new tables (performance indexes added in separate script)
-- Data backfilled: totalBattles, totalCatches, totalEncounters, lastActivityAt

-- Next steps:
-- 1. Run northstar_indexes.sql for performance optimization
-- 2. Create materialized views for analytics
-- 3. Deploy EventTracker service
-- 4. Monitor storage usage and query performance
