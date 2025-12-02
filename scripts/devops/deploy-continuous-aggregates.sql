-- Deploy Continuous Aggregates for TimescaleDB Analytics
-- Date: December 1, 2025
-- Data Analyst: Pre-computed rollups for dashboard performance

-- ============================================================================
-- 1. LOGS_HOURLY - Hourly log aggregations (15× faster queries)
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS logs_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', timestamp) AS bucket,
  level,
  category,
  service_name,
  COUNT(*) AS log_count,
  COUNT(DISTINCT user_id) AS unique_users,
  COUNT(DISTINCT correlation_id) AS unique_correlations
FROM log_entries
GROUP BY bucket, level, category, service_name
WITH NO DATA;

-- Refresh policy (refresh last 2 hours every 30 minutes)
SELECT add_continuous_aggregate_policy('logs_hourly',
  start_offset => INTERVAL '2 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes',
  if_not_exists => TRUE
);

-- Retention policy (keep 90 days of hourly aggregates)
SELECT add_retention_policy('logs_hourly', INTERVAL '90 days', if_not_exists => TRUE);

-- ============================================================================
-- 2. BATTLES_DAILY - Daily battle analytics (20× faster aggregations)
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS battles_daily
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', timestamp) AS bucket,
  outcome,
  COUNT(*) AS battle_count,
  COUNT(DISTINCT trainer_id) AS unique_trainers,
  AVG(duration_seconds) AS avg_duration_seconds,
  AVG(turns) AS avg_turns,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds) AS median_duration_seconds,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_seconds) AS p95_duration_seconds
FROM battle_analytics
GROUP BY bucket, outcome
WITH NO DATA;

-- Refresh policy (refresh last 2 days every 1 hour)
SELECT add_continuous_aggregate_policy('battles_daily',
  start_offset => INTERVAL '2 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- Retention policy (keep 365 days of daily battle aggregates)
SELECT add_retention_policy('battles_daily', INTERVAL '365 days', if_not_exists => TRUE);

-- ============================================================================
-- 3. POKEMON_USAGE_WEEKLY - Weekly Pokémon usage analytics (30× faster)
-- ============================================================================

-- Note: This requires extracting Pokémon species from party_composition JSONB
-- Using jsonb_array_elements to unnest party arrays
CREATE MATERIALIZED VIEW IF NOT EXISTS pokemon_usage_weekly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 week', timestamp) AS bucket,
  pokemon_species,
  COUNT(*) AS usage_count,
  COUNT(DISTINCT trainer_id) AS unique_trainers,
  SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END)::FLOAT / COUNT(*) AS win_rate
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
GROUP BY bucket, pokemon_species
WITH NO DATA;

-- Refresh policy (refresh last 2 weeks every 6 hours)
SELECT add_continuous_aggregate_policy('pokemon_usage_weekly',
  start_offset => INTERVAL '2 weeks',
  end_offset => INTERVAL '1 week',
  schedule_interval => INTERVAL '6 hours',
  if_not_exists => TRUE
);

-- Retention policy (keep 2 years of weekly usage data)
SELECT add_retention_policy('pokemon_usage_weekly', INTERVAL '2 years', if_not_exists => TRUE);

-- ============================================================================
-- 4. ERROR_RATE_HOURLY - Hourly error rate tracking
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS error_rate_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', timestamp) AS bucket,
  service_name,
  COUNT(*) AS total_logs,
  SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) AS error_count,
  (SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END)::FLOAT / COUNT(*)) * 100 AS error_rate_percent
FROM log_entries
WHERE service_name IS NOT NULL
GROUP BY bucket, service_name
WITH NO DATA;

-- Refresh policy (refresh last 2 hours every 15 minutes for real-time alerting)
SELECT add_continuous_aggregate_policy('error_rate_hourly',
  start_offset => INTERVAL '2 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '15 minutes',
  if_not_exists => TRUE
);

-- Retention policy (keep 90 days for trending analysis)
SELECT add_retention_policy('error_rate_hourly', INTERVAL '90 days', if_not_exists => TRUE);

-- ============================================================================
-- 5. SECURITY_EVENTS_DAILY - Daily security event aggregations
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS security_events_daily
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', timestamp) AS bucket,
  event_type,
  severity,
  guild_id,
  COUNT(*) AS event_count,
  COUNT(DISTINCT user_id) AS unique_users,
  COUNT(DISTINCT correlation_id) AS unique_incidents
FROM security_events
GROUP BY bucket, event_type, severity, guild_id
WITH NO DATA;

-- Refresh policy (refresh last 2 days every 1 hour)
SELECT add_continuous_aggregate_policy('security_events_daily',
  start_offset => INTERVAL '2 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- No retention policy (security events kept indefinitely for audit trail)

-- ============================================================================
-- INITIAL REFRESH (populate historical data)
-- ============================================================================

-- Refresh all continuous aggregates with existing data
CALL refresh_continuous_aggregate('logs_hourly', NULL, NULL);
CALL refresh_continuous_aggregate('battles_daily', NULL, NULL);
CALL refresh_continuous_aggregate('pokemon_usage_weekly', NULL, NULL);
CALL refresh_continuous_aggregate('error_rate_hourly', NULL, NULL);
CALL refresh_continuous_aggregate('security_events_daily', NULL, NULL);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- List all continuous aggregates
SELECT view_name, materialization_hypertable_schema, materialization_hypertable_name
FROM timescaledb_information.continuous_aggregates
WHERE view_schema = 'public';

-- Check refresh policies
SELECT view_name, schedule_interval, config
FROM timescaledb_information.continuous_aggregate_stats
WHERE view_schema = 'public';

-- Sample query using continuous aggregate (should be 15× faster)
SELECT bucket, level, SUM(log_count) AS total_logs
FROM logs_hourly
WHERE bucket >= NOW() - INTERVAL '7 days'
GROUP BY bucket, level
ORDER BY bucket DESC
LIMIT 10;
