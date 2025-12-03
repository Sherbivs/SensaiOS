-- Migration: Phase 2A Index Optimization
-- Generated: 2025-12-03 by Database Optimization Specialist Team
--
-- Summary:
-- - Drop 3 redundant/unused indexes (-736 KB storage)
-- - Add 1 critical FK index for Encounter.speciesId (+8 KB)
--
-- Net Impact: -728 KB storage, improved FK query performance

-- ============================================================================
-- Part 1: Drop Redundant Indexes (0 scans, confirmed unused)
-- ============================================================================

-- Drop SpeciesLearnset_method_level_idx (704 KB)
-- Reason: Composite index on method+level columns that are never queried directly.
-- The primary key (speciesId, moveId, method, level) already covers method lookups.
DROP INDEX IF EXISTS "SpeciesLearnset_method_level_idx";

-- Drop ErrorLog_severity_idx (16 KB)
-- Reason: Table only has 7 rows. Sequential scan is faster than index lookup.
-- Index maintenance overhead is not justified for such a small table.
DROP INDEX IF EXISTS "ErrorLog_severity_idx";

-- Drop ErrorLog_occurrenceCount_idx (16 KB)
-- Reason: Table only has 7 rows. Sequential scan is faster than index lookup.
-- This column is rarely queried and autovacuum stats show 0 index scans.
DROP INDEX IF EXISTS "ErrorLog_occurrenceCount_idx";

-- ============================================================================
-- Part 2: Add Missing FK Index (Critical for Performance)
-- ============================================================================

-- Add Encounter_speciesId_idx
-- Reason: Foreign key to Species table lacks an index.
-- Without this index, DELETE/UPDATE on Species would require full Encounter table scan.
-- Risk: High - Encounter table will grow with gameplay activity.
CREATE INDEX IF NOT EXISTS "Encounter_speciesId_idx" ON "Encounter"("speciesId");

-- ============================================================================
-- Verification Queries (run after migration)
-- ============================================================================

-- Verify dropped indexes no longer exist:
-- SELECT indexrelname FROM pg_stat_user_indexes 
-- WHERE indexrelname IN ('SpeciesLearnset_method_level_idx', 'ErrorLog_severity_idx', 'ErrorLog_occurrenceCount_idx');
-- Expected: 0 rows

-- Verify new index exists:
-- SELECT indexrelname FROM pg_stat_user_indexes WHERE indexrelname = 'Encounter_speciesId_idx';
-- Expected: 1 row
