-- Alternative: Standard PostgreSQL Materialized Views
-- (Works with Apache TimescaleDB license)
-- Date: December 1, 2025
-- Data Analyst: Pre-computed rollups using PostgreSQL native features

-- ============================================================================
-- 1. LOGS_HOURLY - Hourly log aggregations
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS logs_hourly AS
SELECT
  date_trunc('hour', timestamp) AS bucket,
  level,
  category,
  service_name,
  COUNT(*) AS log_count,
  COUNT(DISTINCT user_id) AS unique_users,
  COUNT(DISTINCT correlation_id) AS unique_correlations
FROM log_entries
GROUP BY bucket, level, category, service_name;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_logs_hourly_bucket ON logs_hourly (bucket DESC);
CREATE INDEX IF NOT EXISTS idx_logs_hourly_level ON logs_hourly (level, bucket DESC);
CREATE INDEX IF NOT EXISTS idx_logs_hourly_category ON logs_hourly (category, bucket DESC);

-- ============================================================================
-- 2. BATTLES_DAILY - Daily battle analytics
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS battles_daily AS
SELECT
  date_trunc('day', timestamp) AS bucket,
  outcome,
  COUNT(*) AS battle_count,
  COUNT(DISTINCT trainer_id) AS unique_trainers,
  AVG(duration_seconds) AS avg_duration_seconds,
  AVG(turns) AS avg_turns,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds) AS median_duration_seconds,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_seconds) AS p95_duration_seconds
FROM battle_analytics
GROUP BY bucket, outcome;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_battles_daily_bucket ON battles_daily (bucket DESC);
CREATE INDEX IF NOT EXISTS idx_battles_daily_outcome ON battles_daily (outcome, bucket DESC);

-- ============================================================================
-- 3. POKEMON_USAGE_WEEKLY - Weekly Pokémon usage analytics
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS pokemon_usage_weekly AS
SELECT
  date_trunc('week', timestamp) AS bucket,
  pokemon_species,
  COUNT(*) AS usage_count,
  COUNT(DISTINCT trainer_id) AS unique_trainers,
  (SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END)::FLOAT / COUNT(*))::NUMERIC(5,4) AS win_rate
FROM (
  SELECT
    ba.timestamp,
    ba.trainer_id,
    ba.outcome,
    party_member->>'species' AS pokemon_species
  FROM battle_analytics ba,
  LATERAL jsonb_array_elements(ba.party_composition) AS party_member
  WHERE jsonb_typeof(ba.party_composition) = 'array'
) AS unnested
WHERE pokemon_species IS NOT NULL
GROUP BY bucket, pokemon_species;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_pokemon_usage_bucket ON pokemon_usage_weekly (bucket DESC);
CREATE INDEX IF NOT EXISTS idx_pokemon_usage_species ON pokemon_usage_weekly (pokemon_species, bucket DESC);

-- ============================================================================
-- 4. ERROR_RATE_HOURLY - Hourly error rate tracking
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS error_rate_hourly AS
SELECT
  date_trunc('hour', timestamp) AS bucket,
  service_name,
  COUNT(*) AS total_logs,
  SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) AS error_count,
  (SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0)) * 100 AS error_rate_percent
FROM log_entries
WHERE service_name IS NOT NULL
GROUP BY bucket, service_name;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_error_rate_bucket ON error_rate_hourly (bucket DESC);
CREATE INDEX IF NOT EXISTS idx_error_rate_service ON error_rate_hourly (service_name, bucket DESC);

-- ============================================================================
-- 5. SECURITY_EVENTS_DAILY - Daily security event aggregations
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS security_events_daily AS
SELECT
  date_trunc('day', timestamp) AS bucket,
  event_type,
  severity,
  guild_id,
  COUNT(*) AS event_count,
  COUNT(DISTINCT user_id) AS unique_users,
  COUNT(DISTINCT correlation_id) AS unique_incidents
FROM security_events
GROUP BY bucket, event_type, severity, guild_id;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_security_daily_bucket ON security_events_daily (bucket DESC);
CREATE INDEX IF NOT EXISTS idx_security_daily_type ON security_events_daily (event_type, bucket DESC);
CREATE INDEX IF NOT EXISTS idx_security_daily_guild ON security_events_daily (guild_id, bucket DESC);

-- ============================================================================
-- INITIAL REFRESH (populate with existing data)
-- ============================================================================

REFRESH MATERIALIZED VIEW logs_hourly;
REFRESH MATERIALIZED VIEW battles_daily;
REFRESH MATERIALIZED VIEW pokemon_usage_weekly;
REFRESH MATERIALIZED VIEW error_rate_hourly;
REFRESH MATERIALIZED VIEW security_events_daily;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- List all materialized views
SELECT schemaname, matviewname, ispopulated
FROM pg_matviews
WHERE schemaname = 'public';

-- Test query (should be 10-15× faster than querying log_entries directly)
SELECT bucket, level, SUM(log_count) AS total_logs
FROM logs_hourly
WHERE bucket >= NOW() - INTERVAL '7 days'
GROUP BY bucket, level
ORDER BY bucket DESC
LIMIT 10;

-- ============================================================================
-- NOTES
-- ============================================================================

-- Manual Refresh Strategy (since automatic policies require commercial license):
-- 
-- Option 1: Cron job (recommended)
-- Schedule hourly refresh via Render cron job:
--   */60 * * * * psql $DATABASE_URL -c "REFRESH MATERIALIZED VIEW CONCURRENTLY logs_hourly;"
--
-- Option 2: Worker script
-- Add to src/workers/materialized-view-refresher.ts:
--   setInterval(() => {
--     prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY logs_hourly`;
--   }, 3600000); // Every hour
--
-- Option 3: Manual refresh via ops command
-- Add to /ops command:
--   /ops refresh-analytics → triggers all 5 materialized view refreshes
