-- TimescaleDB Retention and Compression Policies
-- 2025-12-04: P0-006 Database-Centric Development Plan
-- 
-- This migration adds retention and compression policies for TimescaleDB hypertables:
-- - log_entries: 30-day retention, 7-day compression
-- - worker_metrics: 30-day retention, 7-day compression
-- - console_outputs: 30-day retention, 7-day compression
--
-- Policies are idempotent (if_not_exists => TRUE) to handle re-runs.

-- ============================================================================
-- 1. LOG_ENTRIES POLICIES (30-day retention)
-- ============================================================================

-- Only apply if TimescaleDB extension is available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    -- Enable compression
    EXECUTE 'ALTER TABLE log_entries SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = ''level,category'',
      timescaledb.compress_orderby = ''timestamp DESC''
    )';
    
    -- Add retention policy (30 days)
    PERFORM add_retention_policy('log_entries', INTERVAL '30 days', if_not_exists => TRUE);
    
    -- Add compression policy (after 7 days)
    PERFORM add_compression_policy('log_entries', INTERVAL '7 days', if_not_exists => TRUE);
    
    RAISE NOTICE 'log_entries: retention=30d, compression=7d applied';
  ELSE
    RAISE NOTICE 'TimescaleDB not available, skipping log_entries policies';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail migration - policies may already exist with different config
  RAISE WARNING 'Could not apply log_entries policies: %', SQLERRM;
END $$;

-- ============================================================================
-- 2. WORKER_METRICS POLICIES (30-day retention)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    -- Enable compression
    EXECUTE 'ALTER TABLE worker_metrics SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = ''worker_id,health_status'',
      timescaledb.compress_orderby = ''timestamp DESC''
    )';
    
    -- Add retention policy (30 days)
    PERFORM add_retention_policy('worker_metrics', INTERVAL '30 days', if_not_exists => TRUE);
    
    -- Add compression policy (after 7 days)
    PERFORM add_compression_policy('worker_metrics', INTERVAL '7 days', if_not_exists => TRUE);
    
    RAISE NOTICE 'worker_metrics: retention=30d, compression=7d applied';
  ELSE
    RAISE NOTICE 'TimescaleDB not available, skipping worker_metrics policies';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not apply worker_metrics policies: %', SQLERRM;
END $$;

-- ============================================================================
-- 3. CONSOLE_OUTPUTS POLICIES (30-day retention)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    -- Enable compression
    EXECUTE 'ALTER TABLE console_outputs SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = ''service_name,output_type'',
      timescaledb.compress_orderby = ''timestamp DESC''
    )';
    
    -- Add retention policy (30 days)
    PERFORM add_retention_policy('console_outputs', INTERVAL '30 days', if_not_exists => TRUE);
    
    -- Add compression policy (after 7 days)
    PERFORM add_compression_policy('console_outputs', INTERVAL '7 days', if_not_exists => TRUE);
    
    RAISE NOTICE 'console_outputs: retention=30d, compression=7d applied';
  ELSE
    RAISE NOTICE 'TimescaleDB not available, skipping console_outputs policies';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not apply console_outputs policies: %', SQLERRM;
END $$;

-- ============================================================================
-- 4. VERIFICATION QUERIES
-- ============================================================================

-- List all retention policies
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    SELECT COUNT(*) INTO policy_count
    FROM timescaledb_information.jobs
    WHERE application_name LIKE '%Retention Policy%';
    
    RAISE NOTICE 'Active retention policies: %', policy_count;
    
    SELECT COUNT(*) INTO policy_count
    FROM timescaledb_information.jobs
    WHERE application_name LIKE '%Compression Policy%';
    
    RAISE NOTICE 'Active compression policies: %', policy_count;
  END IF;
END $$;

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON TABLE log_entries IS 
  'TimescaleDB hypertable for Event Bus logs. Retention: 30 days. Compression: after 7 days. Segment by: level,category.';

COMMENT ON TABLE worker_metrics IS 
  'TimescaleDB hypertable for worker metrics. Retention: 30 days. Compression: after 7 days. Segment by: worker_id,health_status.';

COMMENT ON TABLE console_outputs IS 
  'TimescaleDB hypertable for console outputs. Retention: 30 days. Compression: after 7 days. Segment by: service_name,output_type.';
