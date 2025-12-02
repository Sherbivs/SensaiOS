-- Deploy TimescaleDB Hypertables for POC
-- Date: December 1, 2025
-- Database Specialist: Hypertable creation and configuration

-- ============================================================================
-- 1. LOG_ENTRIES HYPERTABLE (30-day retention)
-- ============================================================================

CREATE TABLE IF NOT EXISTS log_entries (
  id BIGSERIAL NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  level TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT,
  metadata JSONB,
  correlation_id UUID,
  service_name TEXT,
  user_id TEXT,
  trace_context TEXT,
  PRIMARY KEY (id, timestamp)
);

-- Convert to hypertable
SELECT create_hypertable(
  'log_entries', 
  'timestamp',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_log_level_time ON log_entries (level, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_log_category_time ON log_entries (category, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_log_correlation ON log_entries (correlation_id);
CREATE INDEX IF NOT EXISTS idx_log_user_time ON log_entries (user_id, timestamp DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_log_service_time ON log_entries (service_name, timestamp DESC) WHERE service_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_log_metadata_gin ON log_entries USING GIN (metadata jsonb_path_ops);

-- Retention policy (30 days)
SELECT add_retention_policy('log_entries', INTERVAL '30 days', if_not_exists => TRUE);

-- Compression policy (after 7 days)
ALTER TABLE log_entries SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'level,category',
  timescaledb.compress_orderby = 'timestamp DESC'
);

SELECT add_compression_policy('log_entries', INTERVAL '7 days', if_not_exists => TRUE);

-- ============================================================================
-- 2. EVENT_HISTORY HYPERTABLE (90-day retention)
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_history (
  id BIGSERIAL NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  topic TEXT NOT NULL,
  payload JSONB NOT NULL,
  correlation_id UUID NOT NULL,
  parent_correlation_id UUID,
  emitter TEXT,
  PRIMARY KEY (id, timestamp)
);

-- Convert to hypertable
SELECT create_hypertable(
  'event_history',
  'timestamp',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_topic_time ON event_history (topic, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_event_correlation ON event_history (correlation_id);
CREATE INDEX IF NOT EXISTS idx_event_parent ON event_history (parent_correlation_id) WHERE parent_correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_emitter_time ON event_history (emitter, timestamp DESC) WHERE emitter IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_payload_gin ON event_history USING GIN (payload jsonb_path_ops);

-- Retention policy (90 days)
SELECT add_retention_policy('event_history', INTERVAL '90 days', if_not_exists => TRUE);

-- Compression policy (after 14 days)
ALTER TABLE event_history SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'topic,emitter',
  timescaledb.compress_orderby = 'timestamp DESC'
);

SELECT add_compression_policy('event_history', INTERVAL '14 days', if_not_exists => TRUE);

-- ============================================================================
-- 3. SECURITY_EVENTS HYPERTABLE (infinite retention)
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT,
  details JSONB,
  correlation_id UUID,
  PRIMARY KEY (id, timestamp)
);

-- Convert to hypertable
SELECT create_hypertable(
  'security_events',
  'timestamp',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_security_type_time ON security_events (event_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_severity_time ON security_events (severity, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_guild_time ON security_events (guild_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_user_time ON security_events (user_id, timestamp DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_correlation ON security_events (correlation_id);
CREATE INDEX IF NOT EXISTS idx_security_details_gin ON security_events USING GIN (details jsonb_path_ops);

-- NO retention policy (infinite audit trail)
-- Compression policy (after 30 days)
ALTER TABLE security_events SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'event_type,severity',
  timescaledb.compress_orderby = 'timestamp DESC'
);

SELECT add_compression_policy('security_events', INTERVAL '30 days', if_not_exists => TRUE);

-- ============================================================================
-- 4. BATTLE_ANALYTICS HYPERTABLE (180-day retention)
-- ============================================================================

CREATE TABLE IF NOT EXISTS battle_analytics (
  id BIGSERIAL NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  battle_id UUID NOT NULL,
  trainer_id TEXT NOT NULL,
  opponent_id TEXT,
  outcome TEXT NOT NULL,
  duration_seconds INTEGER,
  turns INTEGER,
  party_composition JSONB,
  move_usage JSONB,
  correlation_id UUID,
  PRIMARY KEY (id, timestamp)
);

-- Convert to hypertable
SELECT create_hypertable(
  'battle_analytics',
  'timestamp',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_battle_trainer_time ON battle_analytics (trainer_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_battle_outcome_time ON battle_analytics (outcome, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_battle_id ON battle_analytics (battle_id);
CREATE INDEX IF NOT EXISTS idx_battle_correlation ON battle_analytics (correlation_id);
CREATE INDEX IF NOT EXISTS idx_battle_composition_gin ON battle_analytics USING GIN (party_composition jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_battle_moves_gin ON battle_analytics USING GIN (move_usage jsonb_path_ops);

-- Retention policy (180 days)
SELECT add_retention_policy('battle_analytics', INTERVAL '180 days', if_not_exists => TRUE);

-- Compression policy (after 14 days)
ALTER TABLE battle_analytics SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'outcome',
  timescaledb.compress_orderby = 'timestamp DESC'
);

SELECT add_compression_policy('battle_analytics', INTERVAL '14 days', if_not_exists => TRUE);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- List all hypertables
SELECT hypertable_schema, hypertable_name, num_dimensions 
FROM timescaledb_information.hypertables
WHERE hypertable_schema = 'public';

-- List all compression policies
SELECT hypertable_name, older_than, compress_after
FROM timescaledb_information.compression_settings;

-- List all retention policies
SELECT hypertable_name, older_than
FROM timescaledb_information.retention_policies;
