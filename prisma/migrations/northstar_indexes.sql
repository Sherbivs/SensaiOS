-- Northstar Performance Indexes & Materialized Views
-- This file contains all performance optimizations for the Northstar schema
-- Apply after Phase 1 migration completes
-- Estimated execution time: 5-10 minutes on production dataset
-- All indexes are created CONCURRENTLY to avoid blocking writes

-- ============================================================================
-- PART 1: USER PROFILE & LEADERBOARD INDEXES
-- ============================================================================

-- Leaderboard: Total battles won (most common query)
-- Composite index with DESC sort for O(log n) ranking queries
-- INCLUDE clause creates covering index to avoid table lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_leaderboard_battles
ON "User" (total_battles DESC, total_wins DESC, id)
INCLUDE (nickname, avatar_url, daily_quest_streak);

-- Leaderboard: Total Pokemon caught
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_leaderboard_catches
ON "User" (total_catches DESC, id)
INCLUDE (nickname, avatar_url);

-- Leaderboard: Daily quest streak
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_leaderboard_streak
ON "User" (daily_quest_streak DESC, id)
INCLUDE (nickname, avatar_url, total_battles);

-- Active users (for analytics and engagement tracking)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_last_activity
ON "User" (last_activity_at DESC NULLS LAST)
WHERE last_activity_at > NOW() - INTERVAL '30 days';

-- User lookup by Discord ID (already unique, but add covering index for profile queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_discord_profile
ON "User" (discord_id)
INCLUDE (nickname, tagline, bio, avatar_url, profile_visibility, show_stats);

-- ============================================================================
-- PART 2: EVENT TRACKING INDEXES
-- ============================================================================

-- User timeline: Most recent events (DESC order for reverse chronological)
-- Partial index to exclude old info-level events
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_events_timeline
ON "UserEvent" (user_id, occurred_at DESC)
WHERE severity != 'info' OR occurred_at > NOW() - INTERVAL '30 days';

-- Event type filtering (e.g., "show me all battle.won events")
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_events_by_type
ON "UserEvent" (category, event_type, occurred_at DESC);

-- Session tracking (aggregate events by session)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_events_session
ON "UserEvent" (session_id, occurred_at)
WHERE session_id IS NOT NULL;

-- Cleanup queries (retention policy enforcement)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_events_retention
ON "UserEvent" (retain_until)
WHERE retain_until IS NOT NULL;

-- User timeline by category (e.g., "show all gameplay events")
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_events_category_timeline
ON "UserEvent" (user_id, category, occurred_at DESC);

-- High-severity events (errors, critical issues)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_events_severity
ON "UserEvent" (severity, occurred_at DESC)
WHERE severity IN ('error', 'critical');

-- ============================================================================
-- PART 3: ACHIEVEMENT SYSTEM INDEXES
-- ============================================================================

-- User achievement progress (show incomplete achievements first)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_achievements_progress
ON "UserAchievement" (user_id, is_completed, progress DESC);

-- Achievement completion tracking (for analytics)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_achievements_completed
ON "UserAchievement" (achievement_id, completed_at DESC NULLS LAST)
WHERE is_completed = true;

-- Recently unlocked achievements (for activity feeds)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_achievements_recent
ON "UserAchievement" (completed_at DESC)
WHERE completed_at IS NOT NULL;

-- ============================================================================
-- PART 4: BATTLE & ENCOUNTER INDEXES
-- ============================================================================

-- Battle history for player 1 (with pagination support)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_battles_p1_history
ON "Battle" (p1_id, state, ended_at DESC NULLS LAST)
INCLUDE (p2_id, result_json, started_at);

-- Battle history for player 2
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_battles_p2_history
ON "Battle" (p2_id, state, ended_at DESC NULLS LAST)
INCLUDE (p1_id, result_json, started_at);

-- Recent battles (for global activity feed)
-- Partial index for last 7 days only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_battles_recent
ON "Battle" (ended_at DESC)
WHERE ended_at > NOW() - INTERVAL '7 days' AND state = 'Finished';

-- Active battles (in-progress matches)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_battles_active
ON "Battle" (state, started_at DESC)
WHERE state IN ('Pending', 'Active');

-- Encounter history (user's recent spawns)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_encounters_user_history
ON "Encounter" (owner_id, started_at DESC)
INCLUDE (species_id, state, level);

-- Active encounters only (hot path for spawn checks)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_encounters_active
ON "Encounter" (owner_id, state, started_at DESC)
WHERE state IN ('Spawned', 'Idle');

-- Expiring encounters (cleanup job)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_encounters_expiring
ON "Encounter" (expires_at)
WHERE expires_at IS NOT NULL AND state NOT IN ('Caught', 'Fled', 'Fainted', 'Expired');

-- ============================================================================
-- PART 5: POKEMON & PARTY INDEXES
-- ============================================================================

-- Species popularity tracking (most caught Pokemon)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pokemon_species_popularity
ON "PokemonInstance" (species_id, created_at DESC);

-- User's Pokemon collection (with filtering by shiny/level)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pokemon_user_collection
ON "PokemonInstance" (owner_id, species_id, is_shiny, level DESC);

-- Box organization (find Pokemon not in party)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pokemon_boxed
ON "PokemonInstance" (owner_id, box_slot)
WHERE box_slot IS NOT NULL;

-- ============================================================================
-- PART 6: ANALYTICS & REPORTING INDEXES
-- ============================================================================

-- Daily stats date range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_stats_date_range
ON "DailyStats" (date DESC);

-- Leaderboard expiration (cleanup job)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leaderboard_expiration
ON "Leaderboard" (expires_at)
WHERE expires_at < NOW() + INTERVAL '1 day';

-- Leaderboard lookup by category and period
-- Already covered by unique constraint, but adding covering index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leaderboard_lookup
ON "Leaderboard" (category, period)
INCLUDE (rankings, generated_at);

-- ============================================================================
-- PART 7: MATERIALIZED VIEWS
-- ============================================================================

-- User Statistics Materialized View
-- Pre-aggregates common profile queries to avoid expensive JOINs
DROP MATERIALIZED VIEW IF EXISTS user_stats_mv CASCADE;
CREATE MATERIALIZED VIEW user_stats_mv AS
SELECT 
  u.id,
  u.discord_id,
  u.nickname,
  u.avatar_url,
  u.total_battles,
  u.total_wins,
  u.total_catches,
  u.total_encounters,
  u.daily_quest_streak,
  u.coins,
  u.premium_coins,
  u.last_login_at,
  u.last_activity_at,
  u.created_at,
  
  -- Derived stats
  CASE 
    WHEN u.total_battles > 0 THEN ROUND((u.total_wins::numeric / u.total_battles::numeric) * 100, 2)
    ELSE 0
  END as win_rate_percent,
  
  -- Pokemon collection stats
  COUNT(DISTINCT p.id) as pokemon_count,
  COUNT(DISTINCT p.species_id) as unique_species_count,
  COUNT(DISTINCT p.id) FILTER (WHERE p.is_shiny = true) as shiny_count,
  
  -- Achievement stats
  COUNT(DISTINCT ua.achievement_id) FILTER (WHERE ua.is_completed = true) as achievements_unlocked,
  COUNT(DISTINCT ua.achievement_id) as achievements_in_progress,
  
  -- Recent activity
  MAX(p.created_at) as last_catch_at,
  MAX(b1.ended_at) as last_battle_at,
  
  -- Rank calculations (NULL for now, updated by refresh job)
  NULL::integer as rank_battles,
  NULL::integer as rank_catches,
  NULL::integer as rank_streak

FROM "User" u
LEFT JOIN "PokemonInstance" p ON p.owner_id = u.id
LEFT JOIN "UserAchievement" ua ON ua.user_id = u.id
LEFT JOIN "Battle" b1 ON b1.p1_id = u.id OR b1.p2_id = u.id
GROUP BY u.id, u.discord_id, u.nickname, u.avatar_url, u.total_battles, u.total_wins, 
         u.total_catches, u.total_encounters, u.daily_quest_streak, u.coins, u.premium_coins,
         u.last_login_at, u.last_activity_at, u.created_at;

-- Unique index for efficient lookups
CREATE UNIQUE INDEX ON user_stats_mv (id);
CREATE INDEX ON user_stats_mv (total_battles DESC, total_wins DESC);
CREATE INDEX ON user_stats_mv (total_catches DESC);
CREATE INDEX ON user_stats_mv (daily_quest_streak DESC);
CREATE INDEX ON user_stats_mv (last_activity_at DESC NULLS LAST);

-- Species Popularity Materialized View
-- Tracks most caught/battled species for recommendations
DROP MATERIALIZED VIEW IF EXISTS species_popularity_mv CASCADE;
CREATE MATERIALIZED VIEW species_popularity_mv AS
SELECT 
  s.id as species_id,
  s.slug,
  s.name,
  
  -- Catch stats
  COUNT(DISTINCT p.id) as total_caught,
  COUNT(DISTINCT p.owner_id) as unique_trainers,
  COUNT(DISTINCT p.id) FILTER (WHERE p.is_shiny = true) as shiny_caught,
  
  -- Battle usage (approximate via pokemon instances)
  COUNT(DISTINCT p.id) FILTER (WHERE p.level >= 50) as high_level_count,
  
  -- Temporal stats
  COUNT(DISTINCT p.id) FILTER (WHERE p.created_at > NOW() - INTERVAL '7 days') as caught_last_7d,
  COUNT(DISTINCT p.id) FILTER (WHERE p.created_at > NOW() - INTERVAL '30 days') as caught_last_30d,
  
  -- Favorites
  COUNT(DISTINCT u.id) FILTER (WHERE u.favorite_species_id = s.id) as favorited_by_count,
  
  -- First/last catches
  MIN(p.created_at) as first_caught_at,
  MAX(p.created_at) as last_caught_at

FROM "Species" s
LEFT JOIN "PokemonInstance" p ON p.species_id = s.id
LEFT JOIN "User" u ON u.favorite_species_id = s.id
GROUP BY s.id, s.slug, s.name;

CREATE UNIQUE INDEX ON species_popularity_mv (species_id);
CREATE INDEX ON species_popularity_mv (total_caught DESC);
CREATE INDEX ON species_popularity_mv (caught_last_7d DESC);
CREATE INDEX ON species_popularity_mv (favorited_by_count DESC);

-- Achievement Progress Leaderboard View
-- Shows users closest to unlocking specific achievements
DROP MATERIALIZED VIEW IF EXISTS achievement_leaders_mv CASCADE;
CREATE MATERIALIZED VIEW achievement_leaders_mv AS
SELECT 
  a.id as achievement_id,
  a.slug as achievement_slug,
  a.name as achievement_name,
  a.category,
  
  -- Top 10 users closest to completion
  json_agg(
    json_build_object(
      'userId', ua.user_id,
      'nickname', u.nickname,
      'progress', ua.progress,
      'isCompleted', ua.is_completed,
      'completedAt', ua.completed_at
    ) ORDER BY ua.progress DESC, ua.first_seen_at ASC
  ) FILTER (WHERE rn <= 10) as top_users,
  
  -- Overall stats
  COUNT(DISTINCT ua.user_id) as total_in_progress,
  COUNT(DISTINCT ua.user_id) FILTER (WHERE ua.is_completed = true) as total_completed,
  MAX(ua.completed_at) as most_recent_completion

FROM "Achievement" a
LEFT JOIN LATERAL (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY achievement_id ORDER BY progress DESC, first_seen_at ASC) as rn
  FROM "UserAchievement"
  WHERE achievement_id = a.id
) ua ON true
LEFT JOIN "User" u ON u.id = ua.user_id
GROUP BY a.id, a.slug, a.name, a.category;

CREATE UNIQUE INDEX ON achievement_leaders_mv (achievement_id);
CREATE INDEX ON achievement_leaders_mv (category);

-- ============================================================================
-- PART 8: REFRESH FUNCTIONS
-- ============================================================================

-- Function to refresh user stats materialized view
-- Call this after bulk updates to user statistics
CREATE OR REPLACE FUNCTION refresh_user_stats_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats_mv;
  
  -- Update ranks after refresh
  WITH ranked_battles AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY total_battles DESC, total_wins DESC) as rank
    FROM user_stats_mv
  ),
  ranked_catches AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY total_catches DESC) as rank
    FROM user_stats_mv
  ),
  ranked_streak AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY daily_quest_streak DESC) as rank
    FROM user_stats_mv
  )
  UPDATE user_stats_mv u
  SET 
    rank_battles = rb.rank,
    rank_catches = rc.rank,
    rank_streak = rs.rank
  FROM ranked_battles rb, ranked_catches rc, ranked_streak rs
  WHERE u.id = rb.id AND u.id = rc.id AND u.id = rs.id;
END;
$$;

-- Function to refresh species popularity view
CREATE OR REPLACE FUNCTION refresh_species_popularity_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY species_popularity_mv;
END;
$$;

-- Function to refresh achievement leaders view
CREATE OR REPLACE FUNCTION refresh_achievement_leaders_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY achievement_leaders_mv;
END;
$$;

-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_all_analytics_views()
RETURNS TABLE(view_name text, duration_ms numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  start_time timestamptz;
  end_time timestamptz;
BEGIN
  -- User stats
  start_time := clock_timestamp();
  PERFORM refresh_user_stats_mv();
  end_time := clock_timestamp();
  view_name := 'user_stats_mv';
  duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  RETURN NEXT;
  
  -- Species popularity
  start_time := clock_timestamp();
  PERFORM refresh_species_popularity_mv();
  end_time := clock_timestamp();
  view_name := 'species_popularity_mv';
  duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  RETURN NEXT;
  
  -- Achievement leaders
  start_time := clock_timestamp();
  PERFORM refresh_achievement_leaders_mv();
  end_time := clock_timestamp();
  view_name := 'achievement_leaders_mv';
  duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  RETURN NEXT;
END;
$$;

-- Grant execute permissions to application roles
GRANT EXECUTE ON FUNCTION refresh_user_stats_mv() TO prisma_application, prisma_worker;
GRANT EXECUTE ON FUNCTION refresh_species_popularity_mv() TO prisma_application, prisma_worker;
GRANT EXECUTE ON FUNCTION refresh_achievement_leaders_mv() TO prisma_application, prisma_worker;
GRANT EXECUTE ON FUNCTION refresh_all_analytics_views() TO prisma_application, prisma_worker;

-- ============================================================================
-- PART 9: PERFORMANCE VERIFICATION QUERIES
-- ============================================================================

-- Run these queries after index creation to verify performance improvements

-- EXPLAIN ANALYZE SELECT id, nickname, total_battles, total_wins
-- FROM "User"
-- ORDER BY total_battles DESC, total_wins DESC
-- LIMIT 100;
-- Expected: Index Scan using idx_users_leaderboard_battles

-- EXPLAIN ANALYZE SELECT * FROM user_stats_mv
-- WHERE total_battles > 0
-- ORDER BY total_battles DESC
-- LIMIT 100;
-- Expected: Index Scan using user_stats_mv_total_battles_total_wins_idx

-- EXPLAIN ANALYZE SELECT * FROM "UserEvent"
-- WHERE user_id = 'some-user-id'
-- ORDER BY occurred_at DESC
-- LIMIT 50;
-- Expected: Index Scan using idx_user_events_timeline

-- EXPLAIN ANALYZE SELECT * FROM "Battle"
-- WHERE p1_id = 'some-user-id' AND state = 'Finished'
-- ORDER BY ended_at DESC
-- LIMIT 20;
-- Expected: Index Scan using idx_battles_p1_history

-- ============================================================================
-- PART 10: INDEX MONITORING QUERIES
-- ============================================================================

-- Check index usage statistics
-- Run this query periodically to identify unused indexes
CREATE OR REPLACE VIEW index_usage_stats AS
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) as size,
  CASE 
    WHEN idx_scan = 0 THEN 'UNUSED'
    WHEN idx_scan < 100 THEN 'LOW_USAGE'
    ELSE 'ACTIVE'
  END as status
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;

-- Check table bloat (requires pg_stat_statements extension)
CREATE OR REPLACE VIEW table_bloat_stats AS
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  CASE 
    WHEN n_live_tup > 0 THEN ROUND((n_dead_tup::numeric / n_live_tup::numeric) * 100, 2)
    ELSE 0
  END as dead_row_percent,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC;

-- ============================================================================
-- EXECUTION SUMMARY
-- ============================================================================

-- Total indexes created: ~30
-- Materialized views created: 3 (user_stats_mv, species_popularity_mv, achievement_leaders_mv)
-- Helper functions created: 4
-- Monitoring views created: 2

-- Estimated execution time: 5-10 minutes
-- Estimated storage overhead: 50-100 MB for indexes + 10-20 MB for materialized views

-- IMPORTANT: Run ANALYZE after index creation to update query planner statistics
-- ANALYZE VERBOSE;
