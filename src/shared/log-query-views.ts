/**
 * Log/Metrics/Console Query Views — Pre-built Queries for Analytics
 * 
 * Purpose:
 * - Provide pre-built SQL queries for common reporting needs
 * - Power /ops commands with structured data access
 * - Enable dashboard data aggregation
 * 
 * Architecture:
 * - View functions return raw SQL that can be executed via Prisma.$queryRawUnsafe
 * - All views include time-bounded queries to prevent full table scans
 * - Aggregations designed for TimescaleDB optimized time-series queries
 * 
 * Usage:
 *   import { getLogViews } from './log-query-views.js';
 *   import { prisma } from '../shared/prisma.js';
 *   
 *   const views = getLogViews();
 *   const errors = await prisma.$queryRawUnsafe(views.recentErrors(24));
 * 
 * @module shared/log-query-views
 */

// ============================================================================
// Types
// ============================================================================

export interface LogQueryResult {
  timestamp: Date;
  level: string;
  category: string;
  message: string | null;
  component: string | null;
  serviceName: string | null;
  correlationId: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ErrorSummaryResult {
  fingerprint: string;
  category: string;
  severity: string;
  errorName: string;
  errorMessage: string;
  occurrenceCount: number;
  firstSeen: Date;
  lastSeen: Date;
}

export interface WorkerHealthResult {
  workerId: string;
  workerName: string;
  healthStatus: string;
  avgLatencyMs: number | null;
  peakLatencyMs: number | null;
  operationCount: bigint;
  failureCount: bigint;
  successRate: number;
  lastUpdate: Date;
}

export interface ConsoleOutputSummary {
  serviceName: string;
  outputType: string;
  count: bigint;
  lastSeen: Date;
}

// ============================================================================
// Log Entry Views
// ============================================================================

/**
 * Get recent log entries with filtering
 */
export function getRecentLogs(options: {
  hoursBack?: number;
  level?: string;
  category?: string;
  component?: string;
  limit?: number;
}): string {
  const { hoursBack = 24, level, category, component, limit = 100 } = options;
  
  const conditions: string[] = [
    `timestamp > NOW() - INTERVAL '${hoursBack} hours'`,
  ];
  
  if (level) {
    conditions.push(`level = '${level}'`);
  }
  if (category) {
    conditions.push(`category = '${category}'`);
  }
  if (component) {
    conditions.push(`component = '${component}'`);
  }
  
  return `
    SELECT 
      timestamp,
      level,
      category,
      message,
      component,
      service_name AS "serviceName",
      correlation_id AS "correlationId",
      metadata
    FROM log_entries
    WHERE ${conditions.join(' AND ')}
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `;
}

/**
 * Get log counts by level (for dashboard)
 */
export function getLogCountsByLevel(hoursBack = 24): string {
  return `
    SELECT 
      level,
      COUNT(*) as count
    FROM log_entries
    WHERE timestamp > NOW() - INTERVAL '${hoursBack} hours'
    GROUP BY level
    ORDER BY count DESC
  `;
}

/**
 * Get log counts by category (for dashboard)
 */
export function getLogCountsByCategory(hoursBack = 24): string {
  return `
    SELECT 
      category,
      COUNT(*) as count
    FROM log_entries
    WHERE timestamp > NOW() - INTERVAL '${hoursBack} hours'
    GROUP BY category
    ORDER BY count DESC
  `;
}

/**
 * Get log counts by component (for dashboard)
 */
export function getLogCountsByComponent(hoursBack = 24): string {
  return `
    SELECT 
      component,
      COUNT(*) as count
    FROM log_entries
    WHERE timestamp > NOW() - INTERVAL '${hoursBack} hours'
      AND component IS NOT NULL
    GROUP BY component
    ORDER BY count DESC
  `;
}

/**
 * Get logs with correlation ID (for tracing)
 */
export function getLogsForCorrelation(correlationId: string): string {
  return `
    SELECT 
      timestamp,
      level,
      category,
      message,
      component,
      service_name AS "serviceName",
      operation,
      metadata
    FROM log_entries
    WHERE correlation_id = '${correlationId}'
    ORDER BY timestamp ASC
  `;
}

/**
 * Get error rate over time (for trends)
 */
export function getErrorRateByHour(hoursBack = 24): string {
  return `
    SELECT 
      time_bucket('1 hour', timestamp) AS hour,
      COUNT(*) FILTER (WHERE level = 'error') AS error_count,
      COUNT(*) FILTER (WHERE level = 'warn') AS warn_count,
      COUNT(*) AS total_count
    FROM log_entries
    WHERE timestamp > NOW() - INTERVAL '${hoursBack} hours'
    GROUP BY hour
    ORDER BY hour DESC
  `;
}

// ============================================================================
// Error Log Views
// ============================================================================

/**
 * Get recent errors aggregated by fingerprint
 */
export function getRecentErrors(hoursBack = 24, limit = 50): string {
  return `
    SELECT 
      fingerprint,
      category,
      severity,
      error_name AS "errorName",
      error_message AS "errorMessage",
      occurrence_count AS "occurrenceCount",
      first_seen AS "firstSeen",
      last_seen AS "lastSeen",
      stack_trace AS "stackTrace"
    FROM "ErrorLog"
    WHERE last_seen > NOW() - INTERVAL '${hoursBack} hours'
    ORDER BY last_seen DESC
    LIMIT ${limit}
  `;
}

/**
 * Get error counts by category
 */
export function getErrorCountsByCategory(hoursBack = 24): string {
  return `
    SELECT 
      category,
      SUM(occurrence_count) AS total_occurrences,
      COUNT(*) AS unique_errors
    FROM "ErrorLog"
    WHERE last_seen > NOW() - INTERVAL '${hoursBack} hours'
    GROUP BY category
    ORDER BY total_occurrences DESC
  `;
}

/**
 * Get error counts by severity
 */
export function getErrorCountsBySeverity(hoursBack = 24): string {
  return `
    SELECT 
      severity,
      SUM(occurrence_count) AS total_occurrences,
      COUNT(*) AS unique_errors
    FROM "ErrorLog"
    WHERE last_seen > NOW() - INTERVAL '${hoursBack} hours'
    GROUP BY severity
    ORDER BY 
      CASE severity 
        WHEN 'CRITICAL' THEN 1 
        WHEN 'ERROR' THEN 2 
        WHEN 'WARNING' THEN 3 
        ELSE 4 
      END
  `;
}

/**
 * Get most frequent errors
 */
export function getMostFrequentErrors(hoursBack = 24, limit = 10): string {
  return `
    SELECT 
      fingerprint,
      category,
      error_name AS "errorName",
      error_message AS "errorMessage",
      occurrence_count AS "occurrenceCount",
      last_seen AS "lastSeen"
    FROM "ErrorLog"
    WHERE last_seen > NOW() - INTERVAL '${hoursBack} hours'
    ORDER BY occurrence_count DESC
    LIMIT ${limit}
  `;
}

// ============================================================================
// Worker Metrics Views
// ============================================================================

/**
 * Get current worker health summary
 */
export function getWorkerHealthSummary(): string {
  return `
    SELECT DISTINCT ON (worker_id)
      worker_id AS "workerId",
      worker_name AS "workerName",
      health_status AS "healthStatus",
      avg_latency_ms AS "avgLatencyMs",
      peak_latency_ms AS "peakLatencyMs",
      operation_count AS "operationCount",
      failure_count AS "failureCount",
      success_count AS "successCount",
      CASE 
        WHEN operation_count > 0 
        THEN ROUND((success_count::FLOAT / operation_count::FLOAT) * 100, 2)
        ELSE 100 
      END AS "successRate",
      timestamp AS "lastUpdate"
    FROM worker_metrics
    WHERE timestamp > NOW() - INTERVAL '5 minutes'
    ORDER BY worker_id, timestamp DESC
  `;
}

/**
 * Get worker metrics over time (for graphs)
 */
export function getWorkerMetricsTimeline(workerId: string, hoursBack = 24): string {
  return `
    SELECT 
      time_bucket('5 minutes', timestamp) AS bucket,
      AVG(avg_latency_ms) AS avg_latency,
      MAX(peak_latency_ms) AS peak_latency,
      SUM(operation_count) AS total_operations,
      SUM(failure_count) AS total_failures,
      AVG(buffer_utilization_pct) AS avg_buffer_utilization
    FROM worker_metrics
    WHERE worker_id = '${workerId}'
      AND timestamp > NOW() - INTERVAL '${hoursBack} hours'
    GROUP BY bucket
    ORDER BY bucket DESC
  `;
}

/**
 * Get worker buffer utilization summary
 */
export function getWorkerBufferUtilization(): string {
  return `
    SELECT DISTINCT ON (worker_id)
      worker_id AS "workerId",
      worker_name AS "workerName",
      buffer_size AS "bufferSize",
      buffer_utilization_pct AS "bufferUtilization",
      flush_count AS "flushCount",
      backpressure_events AS "backpressureEvents",
      timestamp AS "lastUpdate"
    FROM worker_metrics
    WHERE timestamp > NOW() - INTERVAL '5 minutes'
      AND buffer_size IS NOT NULL
    ORDER BY worker_id, timestamp DESC
  `;
}

/**
 * Get workers with degraded or unhealthy status
 */
export function getUnhealthyWorkers(): string {
  return `
    SELECT DISTINCT ON (worker_id)
      worker_id AS "workerId",
      worker_name AS "workerName",
      health_status AS "healthStatus",
      last_error AS "lastError",
      failure_count AS "failureCount",
      timestamp AS "lastUpdate"
    FROM worker_metrics
    WHERE timestamp > NOW() - INTERVAL '5 minutes'
      AND health_status IN ('degraded', 'unhealthy')
    ORDER BY worker_id, timestamp DESC
  `;
}

// ============================================================================
// Console Output Views
// ============================================================================

/**
 * Get recent console outputs with filtering
 */
export function getRecentConsoleOutputs(options: {
  hoursBack?: number;
  serviceName?: string;
  outputType?: string;
  outputLevel?: string;
  limit?: number;
}): string {
  const { hoursBack = 24, serviceName, outputType, outputLevel, limit = 100 } = options;
  
  const conditions: string[] = [
    `timestamp > NOW() - INTERVAL '${hoursBack} hours'`,
  ];
  
  if (serviceName) {
    conditions.push(`service_name = '${serviceName}'`);
  }
  if (outputType) {
    conditions.push(`output_type = '${outputType}'`);
  }
  if (outputLevel) {
    conditions.push(`output_level = '${outputLevel}'`);
  }
  
  return `
    SELECT 
      timestamp,
      service_name AS "serviceName",
      output_type AS "outputType",
      output_level AS "outputLevel",
      raw_output AS "rawOutput",
      parsed_data AS "parsedData",
      correlation_id AS "correlationId",
      session_id AS "sessionId"
    FROM console_outputs
    WHERE ${conditions.join(' AND ')}
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `;
}

/**
 * Get console output summary by type
 */
export function getConsoleOutputSummaryByType(hoursBack = 24): string {
  return `
    SELECT 
      service_name AS "serviceName",
      output_type AS "outputType",
      COUNT(*) AS count,
      MAX(timestamp) AS "lastSeen"
    FROM console_outputs
    WHERE timestamp > NOW() - INTERVAL '${hoursBack} hours'
    GROUP BY service_name, output_type
    ORDER BY count DESC
  `;
}

/**
 * Get telemetry outputs (for dashboard metrics)
 */
export function getTelemetryOutputs(hoursBack = 1): string {
  return `
    SELECT 
      timestamp,
      service_name AS "serviceName",
      raw_output AS "rawOutput",
      parsed_data AS "parsedData"
    FROM console_outputs
    WHERE timestamp > NOW() - INTERVAL '${hoursBack} hours'
      AND output_type = 'telemetry'
    ORDER BY timestamp DESC
  `;
}

// ============================================================================
// Combined Dashboard Views
// ============================================================================

/**
 * Get system health overview (for main dashboard)
 */
export function getSystemHealthOverview(): string {
  return `
    WITH 
    recent_logs AS (
      SELECT 
        COUNT(*) FILTER (WHERE level = 'error') AS error_count,
        COUNT(*) FILTER (WHERE level = 'warn') AS warn_count,
        COUNT(*) AS total_logs
      FROM log_entries
      WHERE timestamp > NOW() - INTERVAL '1 hour'
    ),
    recent_errors AS (
      SELECT 
        COUNT(*) AS unique_errors,
        SUM(occurrence_count) AS total_occurrences
      FROM "ErrorLog"
      WHERE last_seen > NOW() - INTERVAL '1 hour'
    ),
    worker_health AS (
      SELECT 
        COUNT(*) FILTER (WHERE health_status = 'healthy') AS healthy_workers,
        COUNT(*) FILTER (WHERE health_status = 'degraded') AS degraded_workers,
        COUNT(*) FILTER (WHERE health_status = 'unhealthy') AS unhealthy_workers
      FROM (
        SELECT DISTINCT ON (worker_id) worker_id, health_status
        FROM worker_metrics
        WHERE timestamp > NOW() - INTERVAL '5 minutes'
        ORDER BY worker_id, timestamp DESC
      ) latest
    )
    SELECT 
      l.error_count AS "logErrors",
      l.warn_count AS "logWarnings",
      l.total_logs AS "totalLogs",
      e.unique_errors AS "uniqueErrors",
      e.total_occurrences AS "errorOccurrences",
      w.healthy_workers AS "healthyWorkers",
      w.degraded_workers AS "degradedWorkers",
      w.unhealthy_workers AS "unhealthyWorkers"
    FROM recent_logs l, recent_errors e, worker_health w
  `;
}

/**
 * Get recent activity timeline (for activity feed)
 */
export function getRecentActivityTimeline(limit = 50): string {
  return `
    SELECT * FROM (
      SELECT 
        timestamp,
        'log' AS source,
        level AS type,
        category || ': ' || COALESCE(message, '(no message)') AS description
      FROM log_entries
      WHERE timestamp > NOW() - INTERVAL '1 hour'
        AND level IN ('error', 'warn')
      
      UNION ALL
      
      SELECT 
        last_seen AS timestamp,
        'error' AS source,
        severity AS type,
        category || ': ' || error_message AS description
      FROM "ErrorLog"
      WHERE last_seen > NOW() - INTERVAL '1 hour'
      
      UNION ALL
      
      SELECT 
        timestamp,
        'worker' AS source,
        health_status AS type,
        worker_name || ' - ' || COALESCE(last_error, 'Status change') AS description
      FROM (
        SELECT DISTINCT ON (worker_id) *
        FROM worker_metrics
        WHERE timestamp > NOW() - INTERVAL '1 hour'
          AND health_status != 'healthy'
        ORDER BY worker_id, timestamp DESC
      ) w
    ) combined
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get all view functions in a convenient object
 */
export function getLogViews() {
  return {
    // Log entries
    recentLogs: getRecentLogs,
    logCountsByLevel: getLogCountsByLevel,
    logCountsByCategory: getLogCountsByCategory,
    logCountsByComponent: getLogCountsByComponent,
    logsForCorrelation: getLogsForCorrelation,
    errorRateByHour: getErrorRateByHour,
    
    // Error logs
    recentErrors: getRecentErrors,
    errorCountsByCategory: getErrorCountsByCategory,
    errorCountsBySeverity: getErrorCountsBySeverity,
    mostFrequentErrors: getMostFrequentErrors,
    
    // Worker metrics
    workerHealthSummary: getWorkerHealthSummary,
    workerMetricsTimeline: getWorkerMetricsTimeline,
    workerBufferUtilization: getWorkerBufferUtilization,
    unhealthyWorkers: getUnhealthyWorkers,
    
    // Console outputs
    recentConsoleOutputs: getRecentConsoleOutputs,
    consoleOutputSummaryByType: getConsoleOutputSummaryByType,
    telemetryOutputs: getTelemetryOutputs,
    
    // Dashboard
    systemHealthOverview: getSystemHealthOverview,
    recentActivityTimeline: getRecentActivityTimeline,
  };
}
