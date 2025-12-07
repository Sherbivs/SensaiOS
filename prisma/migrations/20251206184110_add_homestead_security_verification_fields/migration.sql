-- Homestead Channel Security Verification Fields Migration
-- Task: Phase 1 - Database Schema Migration
-- Date: 2025-12-06
-- Specialist: Database (lead)
--
-- PURPOSE:
-- Add security verification and integrity tracking to homestead channels.
-- Enables verified channel creation, periodic health checks, security fingerprinting,
-- and lifecycle management (active, suspended, orphaned, deleted states).
--
-- NEW FIELDS:
-- - verifiedAt: Timestamp when Discord confirmed channel exists (NULL = unverified)
-- - createdBy: Audit trail - who triggered creation (user, admin, bot-auto-onboard)
-- - securityFingerprint: HMAC-SHA256 signature to detect tampering
-- - lastHealthCheck: Last periodic integrity verification timestamp
-- - status: Lifecycle state for automated cleanup (active, suspended, orphaned, deleted)

-- ============================================================================
-- 1. ADD NEW COLUMNS TO homestead_channels TABLE
-- ============================================================================

-- Add verifiedAt timestamp (NULL until Discord verification succeeds)
ALTER TABLE "homestead_channels" 
ADD COLUMN "verifiedAt" TIMESTAMP(3);

-- Add createdBy field (audit trail for creation source)
ALTER TABLE "homestead_channels" 
ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'user';

-- Add securityFingerprint (HMAC-SHA256 for tamper detection)
ALTER TABLE "homestead_channels" 
ADD COLUMN "securityFingerprint" TEXT;

-- Add lastHealthCheck timestamp (periodic verification)
ALTER TABLE "homestead_channels" 
ADD COLUMN "lastHealthCheck" TIMESTAMP(3);

-- Add status field (lifecycle management)
ALTER TABLE "homestead_channels" 
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

-- ============================================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for cleanup operations (find by status)
CREATE INDEX "homestead_channels_status_idx" ON "homestead_channels"("status");

-- Index for finding unverified channels
CREATE INDEX "homestead_channels_verifiedAt_idx" ON "homestead_channels"("verifiedAt");

-- ============================================================================
-- 3. ADD COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN "homestead_channels"."verifiedAt" IS 
  'Timestamp when Discord API confirmed channel exists. NULL = creation pending or failed.';

COMMENT ON COLUMN "homestead_channels"."createdBy" IS 
  'Source of channel creation: "user" (user command), "admin" (admin action), "bot-auto-onboard" (automatic).';

COMMENT ON COLUMN "homestead_channels"."securityFingerprint" IS 
  'HMAC-SHA256(userId|guildId|channelId|createdAt) for integrity verification and tamper detection.';

COMMENT ON COLUMN "homestead_channels"."lastHealthCheck" IS 
  'Last periodic integrity check timestamp. NULL = never checked. Updated by cron job.';

COMMENT ON COLUMN "homestead_channels"."status" IS 
  'Lifecycle state: "active" (in use), "suspended" (temporarily disabled), "orphaned" (Discord channel deleted), "deleted" (soft delete).';

-- ============================================================================
-- 4. UPDATE EXISTING RECORDS (BACKFILL)
-- ============================================================================

-- Set verifiedAt to createdAt for existing records (assume they're verified)
UPDATE "homestead_channels" 
SET "verifiedAt" = "createdAt"
WHERE "verifiedAt" IS NULL;

-- Set lastHealthCheck to now for existing records
UPDATE "homestead_channels" 
SET "lastHealthCheck" = NOW()
WHERE "lastHealthCheck" IS NULL;

-- Generate security fingerprints for existing records
-- Note: This is a placeholder - actual fingerprint generation will be done by application code
-- that has access to HMAC key. For now, mark as NULL to indicate needs fingerprint.
-- Application will backfill on first access.

-- ============================================================================
-- 5. ADD CHECK CONSTRAINTS FOR DATA INTEGRITY
-- ============================================================================

-- Ensure status is one of the allowed values
ALTER TABLE "homestead_channels"
ADD CONSTRAINT "homestead_channels_status_check" 
CHECK ("status" IN ('active', 'suspended', 'orphaned', 'deleted'));

-- Ensure createdBy is one of the allowed values
ALTER TABLE "homestead_channels"
ADD CONSTRAINT "homestead_channels_createdBy_check" 
CHECK ("createdBy" IN ('user', 'admin', 'bot-auto-onboard'));

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- 
-- VERIFICATION STEPS:
-- 1. Check columns exist: SELECT * FROM homestead_channels LIMIT 1;
-- 2. Check indexes created: SELECT indexname FROM pg_indexes WHERE tablename = 'homestead_channels';
-- 3. Check constraints: SELECT conname FROM pg_constraint WHERE conrelid = 'homestead_channels'::regclass;
-- 4. Check existing records backfilled: SELECT COUNT(*) FROM homestead_channels WHERE verifiedAt IS NOT NULL;
