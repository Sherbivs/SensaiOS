-- Northstar Phase 1: Partial Indexes for Hot Query Paths
-- Generated: 2025-12-21 by Database Specialist Team
-- Approved by: Performance Engineer
--
-- PURPOSE: Optimize the most frequent query patterns identified in codebase analysis
-- DEPLOYMENT: Run with CONCURRENTLY to avoid table locks in production
--
-- Related Files:
--   - prisma/schema.prisma (core schema)
--   - docs/projects/database/2025-12-21-database-specialist-team-report.md (analysis)
--   - src/shared/models/battle-queries-pg.ts (battle queries)
--   - src/shared/models/encounter-queries-pg.ts (encounter queries)

-- =============================================================================
-- SECTION 1: BATTLE HOT PATHS
-- =============================================================================

-- Active/Pending Battle Lookup
-- Query: Find active battles for a user (runs on EVERY /battle command)
-- Current: Full index scan on state + JOIN with User table
-- After: Partial index covers only Active/Pending rows (tiny subset)
-- Expected improvement: 10-50ms → <5ms
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_battles_active_pending 
ON "Battle" (state, "p1Id", "p2Id", "startedAt" DESC)
WHERE state IN ('Pending', 'Active');

-- Battle History by Trainer (for stats/leaderboards)
-- Query: Get recent battles for a trainer
-- Optimization: DESC sort in index avoids in-memory sort
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_battles_trainer_history
ON "Battle" ("p1Id", "endedAt" DESC)
WHERE state = 'Completed';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_battles_trainer_history_p2
ON "Battle" ("p2Id", "endedAt" DESC)
WHERE state = 'Completed';

-- =============================================================================
-- SECTION 2: ENCOUNTER HOT PATHS  
-- =============================================================================

-- Active Encounter Lookup
-- Query: Find active encounter for user (runs on /walk, /catch, /throw)
-- Current: Index on (ownerId, state) but missing DESC sort
-- After: Partial index with proper sort order
-- Expected improvement: Eliminates in-memory sort
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_encounters_owner_active
ON "Encounter" ("ownerId", "startedAt" DESC)
WHERE state = 'Spawned';

-- Expired Encounter Cleanup (worker job)
-- Query: Find expired encounters for batch deletion
-- Optimization: Partial index on expiration time
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_encounters_expired
ON "Encounter" ("expiresAt")
WHERE state = 'Spawned' AND "expiresAt" IS NOT NULL;

-- =============================================================================
-- SECTION 3: POKEMON INSTANCE HOT PATHS
-- =============================================================================

-- Shiny Pokemon Query
-- Query: Find all shiny Pokemon for a user
-- Current: Full table scan with app-level filter
-- After: Partial index on shiny flag
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pokemon_shiny
ON "PokemonInstance" ("ownerId", "createdAt" DESC)
WHERE "isShiny" = true;

-- Party-eligible Pokemon (not fainted, not already in party)
-- Query: Find Pokemon that can be added to party
-- Optimization: Cover common filter pattern
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pokemon_party_eligible
ON "PokemonInstance" ("ownerId", "level" DESC)
WHERE "currentHp" > 0 AND "partySlotId" IS NULL;

-- =============================================================================
-- SECTION 4: COOLDOWN HOT PATHS
-- =============================================================================

-- Active Cooldown Check
-- Query: Check if user has active cooldown (runs on EVERY action)
-- Current: Index on (ownerId, readyAt) but no partial
-- After: Only index non-expired cooldowns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cooldowns_active
ON "Cooldown" ("ownerId", "kind", "readyAt")
WHERE "readyAt" > NOW();

-- =============================================================================
-- SECTION 5: VERIFICATION QUERIES
-- =============================================================================

-- Run these after applying indexes to verify they're being used:
--
-- EXPLAIN (ANALYZE, BUFFERS) 
-- SELECT * FROM "Battle" WHERE state = 'Active' AND "p1Id" = 'test-id';
--
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT * FROM "Encounter" WHERE "ownerId" = 'test-id' AND state = 'Spawned'
-- ORDER BY "startedAt" DESC LIMIT 1;
--
-- Check index usage stats:
-- SELECT schemaname, tablename, indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE indexrelname LIKE 'idx_%_active%' OR indexrelname LIKE 'idx_%_shiny%'
-- ORDER BY idx_scan DESC;

-- =============================================================================
-- ROLLBACK (if needed)
-- =============================================================================
-- DROP INDEX CONCURRENTLY IF EXISTS idx_battles_active_pending;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_battles_trainer_history;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_battles_trainer_history_p2;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_encounters_owner_active;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_encounters_expired;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_pokemon_shiny;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_pokemon_party_eligible;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_cooldowns_active;
