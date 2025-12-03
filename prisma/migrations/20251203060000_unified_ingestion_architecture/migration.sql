-- Unified Ingestion Architecture Migration
-- 2025-12-03: Add worker_metrics, console_outputs, and enhance log_entries
-- 
-- This migration supports the unified log/metrics/output ingestion system
-- that routes all application data through database workers for querying and analytics.

-- ============================================================================
-- 1. Enhance log_entries with component column
-- ============================================================================

-- Add component column for better categorization (e.g., 'bot', 'battle', 'worker')
ALTER TABLE log_entries ADD COLUMN IF NOT EXISTS component TEXT;

-- Index for component-based queries
CREATE INDEX IF NOT EXISTS idx_log_entries_component_time 
  ON log_entries(component, timestamp DESC) 
  WHERE component IS NOT NULL;

-- Composite index for level + component filtering
CREATE INDEX IF NOT EXISTS idx_log_entries_level_component 
  ON log_entries(level, component, timestamp DESC);

-- Add operation column for structured operation tracking
ALTER TABLE log_entries ADD COLUMN IF NOT EXISTS operation TEXT;

-- Index for operation queries
CREATE INDEX IF NOT EXISTS idx_log_entries_operation_time 
  ON log_entries(operation, timestamp DESC) 
  WHERE operation IS NOT NULL;

-- Add duration tracking for performance metrics
ALTER TABLE log_entries ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

-- ============================================================================
-- 2. Create worker_metrics table (TimescaleDB hypertable)
-- ============================================================================

-- Worker performance metrics for monitoring and analytics
CREATE TABLE IF NOT EXISTS worker_metrics (
  id BIGSERIAL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Worker identification
  worker_id TEXT NOT NULL,       -- 'timescaledb', 'prod-postgres', 'engine-read', 'engine-write'
  worker_name TEXT NOT NULL,     -- Human-readable name
  
  -- Performance metrics
  operation_count BIGINT DEFAULT 0,
  success_count BIGINT DEFAULT 0,
  failure_count BIGINT DEFAULT 0,
  avg_latency_ms DOUBLE PRECISION,
  peak_latency_ms DOUBLE PRECISION,
  throughput DOUBLE PRECISION,   -- ops/sec
  
  -- Buffer metrics (for buffered workers)
  buffer_size INTEGER,
  buffer_utilization_pct DOUBLE PRECISION,
  flush_count INTEGER,
  backpressure_events INTEGER,
  
  -- Resource metrics
  memory_used_bytes BIGINT,
  cpu_percent DOUBLE PRECISION,
  
  -- Health status
  health_status TEXT CHECK (health_status IN ('healthy', 'degraded', 'unhealthy')),
  last_error TEXT,
  
  PRIMARY KEY (id, timestamp)
);

-- Convert to TimescaleDB hypertable (if TimescaleDB is available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('worker_metrics', 'timestamp', 
      chunk_time_interval => INTERVAL '1 day',
      if_not_exists => TRUE
    );
    RAISE NOTICE 'worker_metrics converted to TimescaleDB hypertable';
  ELSE
    RAISE NOTICE 'TimescaleDB not available, using regular table for worker_metrics';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not convert worker_metrics to hypertable: %', SQLERRM;
END $$;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_worker_metrics_worker_time 
  ON worker_metrics(worker_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_worker_metrics_health 
  ON worker_metrics(health_status, timestamp DESC)
  WHERE health_status != 'healthy';

-- ============================================================================
-- 3. Create console_outputs table (for capturing console.* calls)
-- ============================================================================

-- Structured storage for console output parsing
CREATE TABLE IF NOT EXISTS console_outputs (
  id BIGSERIAL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Output identification
  service_name TEXT NOT NULL,    -- 'infinity-gauntlet', 'security-bot', etc.
  output_type TEXT NOT NULL,     -- 'telemetry', 'stats', 'section', 'banner', 'log', 'warn', 'error'
  output_level TEXT NOT NULL DEFAULT 'info', -- 'debug', 'info', 'warn', 'error'
  
  -- Content
  raw_output TEXT NOT NULL,      -- Original console output string
  parsed_data JSONB,             -- Structured extraction from output
  
  -- Metadata
  correlation_id UUID,
  session_id TEXT,               -- Render session/deploy ID
  
  PRIMARY KEY (id, timestamp)
);

-- Convert to TimescaleDB hypertable (if available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('console_outputs', 'timestamp',
      chunk_time_interval => INTERVAL '1 day',
      if_not_exists => TRUE
    );
    RAISE NOTICE 'console_outputs converted to TimescaleDB hypertable';
  ELSE
    RAISE NOTICE 'TimescaleDB not available, using regular table for console_outputs';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not convert console_outputs to hypertable: %', SQLERRM;
END $$;

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_console_outputs_service 
  ON console_outputs(service_name, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_console_outputs_type 
  ON console_outputs(output_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_console_outputs_level 
  ON console_outputs(output_level, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_console_outputs_parsed 
  ON console_outputs USING GIN (parsed_data);

-- ============================================================================
-- 4. Create query functions for analytics
-- ============================================================================

-- Function: Get recent logs with filtering
CREATE OR REPLACE FUNCTION get_recent_logs(
  p_level TEXT DEFAULT NULL,
  p_component TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  log_timestamp TIMESTAMPTZ,
  log_level TEXT,
  log_component TEXT,
  log_operation TEXT,
  log_message TEXT,
  log_correlation_id UUID,
  log_duration_ms INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    le.timestamp,
    le.level,
    COALESCE(le.component, le.category) AS component,
    le.operation,
    le.message,
    le.correlation_id::UUID,
    le.duration_ms
  FROM log_entries le
  WHERE 
    (p_level IS NULL OR le.level = p_level)
    AND (p_component IS NULL OR le.component = p_component OR le.category = p_component)
    AND le.timestamp > NOW() - INTERVAL '24 hours'
  ORDER BY le.timestamp DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: Get worker metrics history
CREATE OR REPLACE FUNCTION get_worker_metrics_history(
  p_worker_id TEXT,
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  time_bucket TIMESTAMPTZ,
  avg_latency DOUBLE PRECISION,
  total_operations BIGINT,
  error_rate DOUBLE PRECISION,
  avg_buffer_util DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    date_trunc('hour', wm.timestamp) AS time_bucket,
    AVG(wm.avg_latency_ms) AS avg_latency,
    SUM(wm.operation_count) AS total_operations,
    (SUM(wm.failure_count)::FLOAT / NULLIF(SUM(wm.operation_count), 0)) AS error_rate,
    AVG(wm.buffer_utilization_pct) AS avg_buffer_util
  FROM worker_metrics wm
  WHERE 
    wm.worker_id = p_worker_id
    AND wm.timestamp > NOW() - (p_hours || ' hours')::INTERVAL
  GROUP BY date_trunc('hour', wm.timestamp)
  ORDER BY time_bucket DESC;
END;
$$ LANGUAGE plpgsql;

-- Function: Get errors by severity
CREATE OR REPLACE FUNCTION get_errors_by_severity(
  p_severity TEXT DEFAULT 'error',
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  error_fingerprint TEXT,
  error_category TEXT,
  error_name TEXT,
  error_message TEXT,
  occurrence_count INTEGER,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    el.fingerprint,
    el.category,
    el."errorName",
    el."errorMessage",
    el."occurrenceCount",
    el."firstSeen",
    el."lastSeen"
  FROM "ErrorLog" el
  WHERE 
    el.severity = p_severity
    AND el."lastSeen" > NOW() - (p_hours || ' hours')::INTERVAL
  ORDER BY el."occurrenceCount" DESC, el."lastSeen" DESC;
END;
$$ LANGUAGE plpgsql;

-- Function: Get worker health summary
CREATE OR REPLACE FUNCTION get_worker_health_summary()
RETURNS TABLE (
  worker_id TEXT,
  worker_name TEXT,
  health_status TEXT,
  avg_latency_ms DOUBLE PRECISION,
  success_rate NUMERIC,
  buffer_utilization DOUBLE PRECISION,
  last_report TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (wm.worker_id)
    wm.worker_id,
    wm.worker_name,
    wm.health_status,
    wm.avg_latency_ms,
    CASE 
      WHEN wm.operation_count > 0 
      THEN (wm.success_count::NUMERIC / wm.operation_count * 100)::NUMERIC(5,2)
      ELSE 100.00
    END AS success_rate,
    wm.buffer_utilization_pct,
    wm.timestamp AS last_report
  FROM worker_metrics wm
  ORDER BY wm.worker_id, wm.timestamp DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. Create views for easy querying
-- ============================================================================

-- View: Recent logs (last 24 hours)
CREATE OR REPLACE VIEW v_recent_logs AS
SELECT 
  timestamp,
  level,
  COALESCE(component, category) AS component,
  operation,
  message,
  user_id,
  correlation_id,
  duration_ms
FROM log_entries
WHERE timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- View: Worker health summary
CREATE OR REPLACE VIEW v_worker_health AS
SELECT DISTINCT ON (worker_id)
  worker_id,
  worker_name,
  health_status,
  avg_latency_ms,
  CASE 
    WHEN operation_count > 0 
    THEN (success_count::FLOAT / operation_count * 100)::NUMERIC(5,2)
    ELSE 100.00
  END AS success_rate,
  buffer_utilization_pct,
  timestamp AS last_report
FROM worker_metrics
ORDER BY worker_id, timestamp DESC;

-- View: Error summary
CREATE OR REPLACE VIEW v_error_summary AS
SELECT 
  category,
  severity,
  "errorName",
  "errorMessage",
  "occurrenceCount",
  "firstSeen",
  "lastSeen",
  CASE 
    WHEN "lastSeen" > NOW() - INTERVAL '1 hour' THEN 'active'
    WHEN "lastSeen" > NOW() - INTERVAL '24 hours' THEN 'recent'
    ELSE 'historical'
  END AS status
FROM "ErrorLog"
ORDER BY "lastSeen" DESC;

-- View: Console outputs by type
CREATE OR REPLACE VIEW v_console_outputs AS
SELECT 
  timestamp,
  service_name,
  output_type,
  output_level,
  raw_output,
  parsed_data,
  correlation_id
FROM console_outputs
WHERE timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- ============================================================================
-- 6. Add comments for documentation
-- ============================================================================

COMMENT ON TABLE worker_metrics IS 'TimescaleDB hypertable for worker performance metrics. Collected every 15 seconds by metrics-collector.ts';
COMMENT ON TABLE console_outputs IS 'TimescaleDB hypertable for parsed console.* outputs. Captured by console-interceptor.ts';
COMMENT ON COLUMN log_entries.component IS 'High-level component: bot, battle, encounter, database, cache, worker';
COMMENT ON COLUMN log_entries.operation IS 'Specific operation: initialize, start, stop, query, insert, flush';
COMMENT ON COLUMN log_entries.duration_ms IS 'Operation duration in milliseconds for performance tracking';

COMMENT ON FUNCTION get_recent_logs IS 'Query recent logs with optional level and component filtering';
COMMENT ON FUNCTION get_worker_metrics_history IS 'Get hourly aggregated metrics for a worker over specified time range';
COMMENT ON FUNCTION get_errors_by_severity IS 'Query error logs by severity with time filtering';
COMMENT ON FUNCTION get_worker_health_summary IS 'Get current health status of all workers';

COMMENT ON VIEW v_recent_logs IS 'Recent logs from last 24 hours with unified component column';
COMMENT ON VIEW v_worker_health IS 'Current health status of all database workers';
COMMENT ON VIEW v_error_summary IS 'Error logs with activity status classification';
COMMENT ON VIEW v_console_outputs IS 'Recent console outputs from last 24 hours';
