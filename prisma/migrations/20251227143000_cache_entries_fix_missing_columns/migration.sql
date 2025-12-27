-- Fix: Add missing columns to cache_entries table
-- These columns were defined in Prisma schema but missing from original migration

-- Add size_bytes column (tracks serialized size of cached value)
ALTER TABLE "cache_entries" ADD COLUMN IF NOT EXISTS "size_bytes" INTEGER NOT NULL DEFAULT 0;

-- Add access_count column (tracks how many times entry was accessed)
ALTER TABLE "cache_entries" ADD COLUMN IF NOT EXISTS "access_count" INTEGER NOT NULL DEFAULT 0;

-- Add last_accessed_at column (tracks last access time for LRU eviction)
ALTER TABLE "cache_entries" ADD COLUMN IF NOT EXISTS "last_accessed_at" TIMESTAMP(3);

-- Add index for access tracking (LRU queries)
CREATE INDEX IF NOT EXISTS "idx_cache_access" ON "cache_entries"("last_accessed_at");
