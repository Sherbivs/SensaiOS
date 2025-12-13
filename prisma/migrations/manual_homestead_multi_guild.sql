-- Homestead Multi-Guild Enhancement Migration
-- Date: 2025-12-13
-- Purpose: Add multi-guild support and operational metadata to homestead_channels

-- Add status column (active | suspended | archived)
ALTER TABLE "homestead_channels" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';

-- Add createdBy column (system | admin | migration)
ALTER TABLE "homestead_channels" ADD COLUMN IF NOT EXISTS "createdBy" TEXT NOT NULL DEFAULT 'system';

-- Add securityFingerprint column (SHA-256 hash of creation context)
ALTER TABLE "homestead_channels" ADD COLUMN IF NOT EXISTS "securityFingerprint" TEXT;

-- Add lastHealthCheck column (for periodic verification)
ALTER TABLE "homestead_channels" ADD COLUMN IF NOT EXISTS "lastHealthCheck" TIMESTAMP(3);

-- Drop old unique constraint on userId (if exists) - this blocked multi-guild support
ALTER TABLE "homestead_channels" DROP CONSTRAINT IF EXISTS "homestead_channels_userId_key";

-- Add composite unique constraint for multi-guild support (one homestead per user per guild)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'homestead_channels_userId_guildId_key'
    ) THEN
        ALTER TABLE "homestead_channels" 
        ADD CONSTRAINT "homestead_channels_userId_guildId_key" 
        UNIQUE ("userId", "guildId");
    END IF;
END
$$;

-- Add indexes for new fields
CREATE INDEX IF NOT EXISTS "homestead_channels_status_idx" ON "homestead_channels"("status");
CREATE INDEX IF NOT EXISTS "homestead_channels_lastHealthCheck_idx" ON "homestead_channels"("lastHealthCheck");
