-- Migration: Drop Duplicate Indexes
-- Generated: 2025-12-03 by Database Optimization Specialist Team
--
-- Rationale:
-- These indexes duplicate functionality already provided by unique constraints.
-- When Prisma creates @unique, it automatically creates an index (xxx_key).
-- Adding @@index([same_column]) creates a redundant index (xxx_idx).
--
-- Verified Duplicates:
-- 1. Species_slug_idx (56 KB) → duplicates Species_slug_key (56 KB)
-- 2. Party_ownerId_idx (8 KB) → duplicates Party_ownerId_key (8 KB)
--
-- Estimated Savings: ~64 KB storage, improved write performance
-- Risk: None - unique constraint indexes provide identical functionality

-- Drop duplicate index on Species.slug (already covered by unique constraint)
DROP INDEX IF EXISTS "Species_slug_idx";

-- Drop duplicate index on Party.ownerId (already covered by unique constraint)
DROP INDEX IF EXISTS "Party_ownerId_idx";
