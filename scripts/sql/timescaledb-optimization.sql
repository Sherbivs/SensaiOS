-- TimescaleDB Optimization Script
-- Generated: 2025-12-03 by Database Optimization Specialist Team
--
-- Prerequisites: TimescaleDB extension enabled (verified ✅)
-- Hypertables: log_entries (2 chunks), event_history, security_events, battle_analytics (0 chunks each)
--
-- IMPORTANT: Run these commands one at a time and verify each step.
-- Some commands may take time on large datasets.

-- ============================================================================
-- Step 1: Enable Compression on log_entries (Only Active Hypertable)
-- ============================================================================

-- Enable compression with segmentby for efficient querying
ALTER TABLE log_entries SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'level,category'
);

-- Verify compression settings
SELECT * FROM timescaledb_information.compression_settings 
WHERE hypertable_name = 'log_entries';

-- ============================================================================
-- Step 2: Add Compression Policy (Compress Chunks Older Than 7 Days)
-- ============================================================================

-- Add automatic compression policy
SELECT add_compression_policy('log_entries', INTERVAL '7 days');

-- Verify policy was added
SELECT * FROM timescaledb_information.jobs 
WHERE hypertable_name = 'log_entries';

-- ============================================================================
-- Step 3: Add Retention Policy (Delete Data Older Than 90 Days)
-- ============================================================================

-- Add automatic data retention policy
SELECT add_retention_policy('log_entries', INTERVAL '90 days');

-- Verify retention policy
SELECT * FROM timescaledb_information.jobs 
WHERE hypertable_name = 'log_entries';

-- ============================================================================
-- Step 4: Manual Compression of Existing Chunks (One-Time)
-- ============================================================================

-- Compress existing chunks older than 7 days
SELECT compress_chunk(chunk_name) 
FROM timescaledb_information.chunks 
WHERE hypertable_name = 'log_entries' 
  AND range_end < NOW() - INTERVAL '7 days'
  AND NOT is_compressed;

-- Verify compression status
SELECT chunk_name, is_compressed, 
       pg_size_pretty(compressed_chunk_size) as compressed_size,
       pg_size_pretty(uncompressed_chunk_size) as uncompressed_size
FROM timescaledb_information.chunks 
WHERE hypertable_name = 'log_entries';

-- ============================================================================
-- Step 5: Maintenance - Run Periodically
-- ============================================================================

-- Reindex to reclaim space (optional, may lock tables)
-- REINDEX TABLE log_entries;

-- Update statistics for query planner
ANALYZE log_entries;
ANALYZE "ErrorLog";
ANALYZE "BusMessage";
ANALYZE "Species";
ANALYZE "SpeciesLearnset";

-- ============================================================================
-- Step 6: Monitoring Queries
-- ============================================================================

-- Check compression ratio
SELECT hypertable_name,
       pg_size_pretty(before_compression_total_bytes) as before,
       pg_size_pretty(after_compression_total_bytes) as after,
       round((1 - after_compression_total_bytes::numeric / 
              NULLIF(before_compression_total_bytes, 0)) * 100, 2) as compression_ratio
FROM timescaledb_information.hypertable_compression_stats
WHERE hypertable_name = 'log_entries';

-- Check chunk status
SELECT hypertable_name, chunk_name, is_compressed, 
       range_start, range_end
FROM timescaledb_information.chunks
ORDER BY hypertable_name, range_start;

-- Check all job status
SELECT job_id, application_name, schedule_interval, 
       next_start, total_runs, total_successes, total_failures
FROM timescaledb_information.job_stats
JOIN timescaledb_information.jobs USING (job_id);
