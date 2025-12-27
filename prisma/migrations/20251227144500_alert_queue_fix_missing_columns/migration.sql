-- Fix: Add missing columns to alert_queue table
-- The original migration created a simpler schema than Prisma expects

-- Rename severity to level (Prisma schema uses 'level')
ALTER TABLE "alert_queue" RENAME COLUMN "severity" TO "level";

-- Add alert_id column (required, NOT NULL)
ALTER TABLE "alert_queue" ADD COLUMN IF NOT EXISTS "alert_id" TEXT NOT NULL DEFAULT '';

-- Add source column (optional)
ALTER TABLE "alert_queue" ADD COLUMN IF NOT EXISTS "source" TEXT;

-- Add correlation_id column (optional)
ALTER TABLE "alert_queue" ADD COLUMN IF NOT EXISTS "correlation_id" TEXT;

-- Rename metadata to payload (Prisma schema uses 'payload')
ALTER TABLE "alert_queue" RENAME COLUMN "metadata" TO "payload";

-- Add routed_channel column (boolean flag)
ALTER TABLE "alert_queue" ADD COLUMN IF NOT EXISTS "routed_channel" BOOLEAN NOT NULL DEFAULT false;

-- Add routed_dm column (boolean flag)
ALTER TABLE "alert_queue" ADD COLUMN IF NOT EXISTS "routed_dm" BOOLEAN NOT NULL DEFAULT false;

-- Add processed column (boolean flag)
ALTER TABLE "alert_queue" ADD COLUMN IF NOT EXISTS "processed" BOOLEAN NOT NULL DEFAULT false;

-- Add processed_at column (timestamp)
ALTER TABLE "alert_queue" ADD COLUMN IF NOT EXISTS "processed_at" TIMESTAMP(3);

-- Update dispatched_at to processed_at if it exists (migrate data)
UPDATE "alert_queue" SET "processed_at" = "dispatched_at" WHERE "dispatched_at" IS NOT NULL;

-- Drop old dispatched_at column
ALTER TABLE "alert_queue" DROP COLUMN IF EXISTS "dispatched_at";

-- Update idx_alert_pending index to use new columns
DROP INDEX IF EXISTS "idx_alert_pending";
CREATE INDEX "idx_alert_pending" ON "alert_queue"("processed", "created_at");
