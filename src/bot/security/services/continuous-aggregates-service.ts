/**
 * @file continuous-aggregates-service.ts
 * @description TimescaleDB Continuous Aggregates Service for pre-computed security metrics
 * @module security/services
 *
 * This service manages TimescaleDB continuous aggregates for efficient real-time
 * dashboard queries. It provides:
 *
 * - Automatic refresh of materialized views
 * - Query optimization for time-series data
 * - Retention policy management
 * - Health monitoring and statistics
 *
 * @see ADR-001-timescaledb-selection.md for TimescaleDB architecture decision
 * @see ADR-002-event-sourcing.md for event sourcing integration
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Continuous aggregate refresh policy configuration
 */
export interface RefreshPolicy {
  /** Unique identifier for the policy */
  id: string;
  /** Name of the continuous aggregate */
  aggregateName: string;
  /** How often to refresh (e.g., '1 hour', '5 minutes') */
  refreshInterval: string;
  /** Start of refresh window (relative to now) */
  startOffset: string;
  /** End of refresh window (relative to now) */
  endOffset: string;
  /** Whether policy is enabled */
  enabled: boolean;
  /** When policy was created */
  createdAt: Date;
  /** When policy was last modified */
  modifiedAt?: Date;
}

/**
 * Continuous aggregate definition
 */
export interface ContinuousAggregateDefinition {
  /** Unique name for the aggregate */
  name: string;
  /** Source hypertable name */
  sourceTable: string;
  /** Time bucket interval (e.g., '1 hour', '1 day') */
  bucketInterval: string;
  /** Description of what this aggregate measures */
  description: string;
  /** SQL columns for GROUP BY (excluding time bucket) */
  groupByColumns: string[];
  /** SQL aggregate expressions */
  aggregateExpressions: AggregateExpression[];
  /** Optional WHERE clause filter */
  whereClause?: string;
  /** Refresh policy configuration */
  refreshPolicy?: Partial<RefreshPolicy>;
  /** Real-time aggregate setting */
  realTimeAggregation: boolean;
  /** Compression policy (hours after which to compress) */
  compressionAfter?: number;
  /** Retention policy (days after which to drop) */
  retentionDays?: number;
}

/**
 * Aggregate expression definition
 */
export interface AggregateExpression {
  /** Column alias in result */
  alias: string;
  /** SQL expression (e.g., 'COUNT(*)', 'AVG(response_time)') */
  expression: string;
  /** Data type of result */
  dataType: 'integer' | 'bigint' | 'numeric' | 'text' | 'timestamp';
}

/**
 * Aggregate refresh result
 */
export interface RefreshResult {
  /** Name of the aggregate */
  aggregateName: string;
  /** Whether refresh succeeded */
  success: boolean;
  /** Time range start of refresh */
  windowStart: Date;
  /** Time range end of refresh */
  windowEnd: Date;
  /** Duration of refresh in milliseconds */
  durationMs: number;
  /** Number of rows refreshed (if available) */
  rowsProcessed?: number;
  /** Error message if failed */
  error?: string;
  /** Timestamp of refresh */
  timestamp: Date;
}

/**
 * Aggregate statistics
 */
export interface AggregateStats {
  /** Aggregate name */
  name: string;
  /** Total number of rows */
  totalRows: number;
  /** Size on disk in bytes */
  sizeBytes: number;
  /** Human-readable size */
  sizeHuman: string;
  /** Oldest data timestamp */
  oldestData?: Date;
  /** Newest data timestamp */
  newestData?: Date;
  /** Last refresh timestamp */
  lastRefresh?: Date;
  /** Average query time in milliseconds */
  avgQueryTimeMs?: number;
  /** Whether real-time aggregation is enabled */
  isRealTime: boolean;
  /** Compression ratio (if compressed) */
  compressionRatio?: number;
}

/**
 * Query parameters for aggregate queries
 */
export interface AggregateQueryParams {
  /** Time range start */
  from: Date;
  /** Time range end */
  to: Date;
  /** Additional filters */
  filters?: Record<string, unknown>;
  /** Column to order by */
  orderBy?: string;
  /** Sort direction */
  orderDirection?: 'ASC' | 'DESC';
  /** Limit number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Service configuration
 */
export interface ContinuousAggregatesConfig {
  /** Schema name where aggregates are stored */
  schemaName: string;
  /** Default refresh interval for new aggregates */
  defaultRefreshInterval: string;
  /** Enable real-time aggregation by default */
  defaultRealTime: boolean;
  /** Default compression delay in hours */
  defaultCompressionHours: number;
  /** Default retention in days */
  defaultRetentionDays: number;
  /** Enable automatic policy management */
  autoManagePolicies: boolean;
  /** Logger instance */
  logger?: Logger;
  /** Notification callback */
  onNotification?: (notification: AggregateNotification) => void;
  /** Mock mode for testing */
  mockMode?: boolean;
}

/**
 * Notification for aggregate events
 */
export interface AggregateNotification {
  type: 'aggregate_created' | 'aggregate_dropped' | 'refresh_started' | 
        'refresh_completed' | 'refresh_failed' | 'policy_created' | 
        'policy_modified' | 'compression_enabled' | 'retention_applied';
  aggregateName: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  timestamp: Date;
  data?: Record<string, unknown>;
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base error for continuous aggregate operations
 */
export class AggregateError extends Error {
  readonly code: string;
  readonly aggregateName?: string;

  constructor(message: string, code: string, aggregateName?: string) {
    super(message);
    this.name = 'AggregateError';
    this.code = code;
    this.aggregateName = aggregateName;
  }
}

/**
 * Error when aggregate not found
 */
export class AggregateNotFoundError extends AggregateError {
  constructor(aggregateName: string) {
    super(`Continuous aggregate not found: ${aggregateName}`, 'NOT_FOUND', aggregateName);
    this.name = 'AggregateNotFoundError';
  }
}

/**
 * Error when aggregate already exists
 */
export class AggregateExistsError extends AggregateError {
  constructor(aggregateName: string) {
    super(`Continuous aggregate already exists: ${aggregateName}`, 'ALREADY_EXISTS', aggregateName);
    this.name = 'AggregateExistsError';
  }
}

/**
 * Error when refresh fails
 */
export class RefreshError extends AggregateError {
  readonly cause?: Error;

  constructor(aggregateName: string, message: string, cause?: Error) {
    super(message, 'REFRESH_FAILED', aggregateName);
    this.name = 'RefreshError';
    this.cause = cause;
  }
}

/**
 * Error when query fails
 */
export class QueryError extends AggregateError {
  readonly query?: string;

  constructor(message: string, query?: string) {
    super(message, 'QUERY_FAILED');
    this.name = 'QueryError';
    this.query = query;
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for AggregateError
 */
export function isAggregateError(error: unknown): error is AggregateError {
  return error instanceof AggregateError;
}

/**
 * Type guard for AggregateNotFoundError
 */
export function isAggregateNotFoundError(error: unknown): error is AggregateNotFoundError {
  return error instanceof AggregateNotFoundError;
}

/**
 * Type guard for RefreshError
 */
export function isRefreshError(error: unknown): error is RefreshError {
  return error instanceof RefreshError;
}

// ============================================================================
// Pre-defined Aggregate Templates
// ============================================================================

/**
 * Pre-defined aggregate templates for common security metrics
 */
export const SECURITY_AGGREGATE_TEMPLATES: Record<string, Omit<ContinuousAggregateDefinition, 'name'>> = {
  /**
   * Hourly security event counts by type
   */
  events_hourly: {
    sourceTable: 'security_events',
    bucketInterval: '1 hour',
    description: 'Hourly security event counts by type',
    groupByColumns: ['event_type', 'severity'],
    aggregateExpressions: [
      { alias: 'event_count', expression: 'COUNT(*)', dataType: 'bigint' },
      { alias: 'unique_users', expression: 'COUNT(DISTINCT user_id)', dataType: 'bigint' },
    ],
    realTimeAggregation: true,
    refreshPolicy: {
      refreshInterval: '1 hour',
      startOffset: '3 hours',
      endOffset: '1 hour',
    },
  },

  /**
   * Daily login metrics
   */
  login_metrics_daily: {
    sourceTable: 'security_events',
    bucketInterval: '1 day',
    description: 'Daily login success/failure metrics',
    groupByColumns: ['event_type'],
    aggregateExpressions: [
      { alias: 'total_attempts', expression: 'COUNT(*)', dataType: 'bigint' },
      { alias: 'unique_users', expression: 'COUNT(DISTINCT user_id)', dataType: 'bigint' },
      { alias: 'unique_ips', expression: 'COUNT(DISTINCT ip_address)', dataType: 'bigint' },
    ],
    whereClause: "event_type LIKE 'security.authentication.login.%'",
    realTimeAggregation: true,
    refreshPolicy: {
      refreshInterval: '1 day',
      startOffset: '2 days',
      endOffset: '1 day',
    },
    retentionDays: 365,
  },

  /**
   * Hourly alert metrics
   */
  alert_metrics_hourly: {
    sourceTable: 'security_alerts',
    bucketInterval: '1 hour',
    description: 'Hourly alert counts by severity',
    groupByColumns: ['severity', 'alert_type'],
    aggregateExpressions: [
      { alias: 'alert_count', expression: 'COUNT(*)', dataType: 'bigint' },
      { alias: 'acknowledged_count', expression: 'COUNT(*) FILTER (WHERE acknowledged_at IS NOT NULL)', dataType: 'bigint' },
      { alias: 'resolved_count', expression: 'COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)', dataType: 'bigint' },
      { alias: 'avg_resolution_time_ms', expression: 'AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) * 1000) FILTER (WHERE resolved_at IS NOT NULL)', dataType: 'numeric' },
    ],
    realTimeAggregation: true,
    compressionAfter: 168, // 7 days
    retentionDays: 90,
  },

  /**
   * Permission change audit trail
   */
  permission_changes_daily: {
    sourceTable: 'security_events',
    bucketInterval: '1 day',
    description: 'Daily permission change audit summary',
    groupByColumns: ['event_type', 'modified_by'],
    aggregateExpressions: [
      { alias: 'change_count', expression: 'COUNT(*)', dataType: 'bigint' },
      { alias: 'unique_users_affected', expression: 'COUNT(DISTINCT user_id)', dataType: 'bigint' },
    ],
    whereClause: "event_type LIKE 'security.authorization.permission.%'",
    realTimeAggregation: false, // Batch refresh is fine for audit
    refreshPolicy: {
      refreshInterval: '6 hours',
      startOffset: '2 days',
      endOffset: '6 hours',
    },
    retentionDays: 730, // 2 years for compliance
  },

  /**
   * Real-time threat detection metrics
   */
  threat_metrics_5min: {
    sourceTable: 'security_events',
    bucketInterval: '5 minutes',
    description: 'Near real-time threat detection metrics',
    groupByColumns: ['event_type', 'threat_level'],
    aggregateExpressions: [
      { alias: 'threat_count', expression: 'COUNT(*)', dataType: 'bigint' },
      { alias: 'blocked_count', expression: "COUNT(*) FILTER (WHERE status = 'blocked')", dataType: 'bigint' },
      { alias: 'unique_sources', expression: 'COUNT(DISTINCT source_ip)', dataType: 'bigint' },
    ],
    whereClause: "event_type LIKE 'security.incident.threat.%'",
    realTimeAggregation: true,
    refreshPolicy: {
      refreshInterval: '5 minutes',
      startOffset: '30 minutes',
      endOffset: '5 minutes',
    },
    compressionAfter: 24, // 1 day
    retentionDays: 30,
  },
};

// ============================================================================
// Main Service Class
// ============================================================================

/**
 * TimescaleDB Continuous Aggregates Service
 *
 * Manages continuous aggregates for efficient time-series queries on security data.
 *
 * @example
 * ```typescript
 * const service = createContinuousAggregatesService({
 *   schemaName: 'timescale_aggs',
 *   defaultRefreshInterval: '1 hour',
 *   defaultRealTime: true,
 * });
 *
 * // Create aggregate from template
 * await service.createFromTemplate('events_hourly', 'security_events_hourly');
 *
 * // Query aggregate
 * const results = await service.query('security_events_hourly', {
 *   from: new Date('2024-01-01'),
 *   to: new Date('2024-01-31'),
 * });
 *
 * // Get statistics
 * const stats = await service.getStats('security_events_hourly');
 * ```
 */
export class ContinuousAggregatesService {
  private readonly config: Required<ContinuousAggregatesConfig>;
  private readonly aggregates: Map<string, ContinuousAggregateDefinition>;
  private readonly policies: Map<string, RefreshPolicy>;
  private readonly refreshHistory: Map<string, RefreshResult[]>;
  private readonly queryMetrics: Map<string, number[]>;

  constructor(config: ContinuousAggregatesConfig) {
    this.config = {
      schemaName: config.schemaName,
      defaultRefreshInterval: config.defaultRefreshInterval ?? '1 hour',
      defaultRealTime: config.defaultRealTime ?? true,
      defaultCompressionHours: config.defaultCompressionHours ?? 168, // 7 days
      defaultRetentionDays: config.defaultRetentionDays ?? 90,
      autoManagePolicies: config.autoManagePolicies ?? true,
      logger: config.logger ?? console,
      onNotification: config.onNotification ?? (() => {}),
      mockMode: config.mockMode ?? false,
    };

    this.aggregates = new Map();
    this.policies = new Map();
    this.refreshHistory = new Map();
    this.queryMetrics = new Map();

    this.log('debug', `ContinuousAggregatesService initialized with schema: ${this.config.schemaName}`);
  }

  // ==========================================================================
  // Logging Helpers
  // ==========================================================================

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
    this.config.logger[level](`[ContinuousAggregates] ${message}`, ...args);
  }

  private notify(notification: AggregateNotification): void {
    this.config.onNotification(notification);
  }

  // ==========================================================================
  // Aggregate Management
  // ==========================================================================

  /**
   * Create a new continuous aggregate
   */
  async create(definition: ContinuousAggregateDefinition): Promise<void> {
    if (this.aggregates.has(definition.name)) {
      throw new AggregateExistsError(definition.name);
    }

    this.log('info', `Creating continuous aggregate: ${definition.name}`);

    // Build CREATE MATERIALIZED VIEW SQL
    const sql = this.buildCreateSQL(definition);
    this.log('debug', `Generated SQL: ${sql}`);

    // Execute (mock mode just stores definition)
    if (!this.config.mockMode) {
      // In real implementation: execute SQL via Prisma raw query
      await this.simulateExecution(100);
    }

    // Store definition
    this.aggregates.set(definition.name, definition);
    this.refreshHistory.set(definition.name, []);
    this.queryMetrics.set(definition.name, []);

    // Create refresh policy if configured
    if (this.config.autoManagePolicies && definition.refreshPolicy) {
      await this.createRefreshPolicy(definition.name, definition.refreshPolicy);
    }

    // Enable compression if configured
    if (definition.compressionAfter) {
      await this.enableCompression(definition.name, definition.compressionAfter);
    }

    // Set retention policy if configured
    if (definition.retentionDays) {
      await this.setRetentionPolicy(definition.name, definition.retentionDays);
    }

    this.notify({
      type: 'aggregate_created',
      aggregateName: definition.name,
      message: `Continuous aggregate created: ${definition.name}`,
      severity: 'info',
      timestamp: new Date(),
      data: { bucketInterval: definition.bucketInterval, realTime: definition.realTimeAggregation },
    });
  }

  /**
   * Create aggregate from pre-defined template
   */
  async createFromTemplate(
    templateName: keyof typeof SECURITY_AGGREGATE_TEMPLATES,
    aggregateName: string,
  ): Promise<void> {
    const template = SECURITY_AGGREGATE_TEMPLATES[templateName];
    if (!template) {
      throw new AggregateError(`Unknown template: ${templateName}`, 'INVALID_TEMPLATE');
    }

    const definition: ContinuousAggregateDefinition = {
      ...template,
      name: aggregateName,
    };

    await this.create(definition);
  }

  /**
   * Drop a continuous aggregate
   */
  async drop(aggregateName: string, cascade = false): Promise<void> {
    if (!this.aggregates.has(aggregateName)) {
      throw new AggregateNotFoundError(aggregateName);
    }

    this.log('info', `Dropping continuous aggregate: ${aggregateName}`);

    // Build DROP SQL
    const sql = `DROP MATERIALIZED VIEW IF EXISTS ${this.config.schemaName}.${aggregateName}${cascade ? ' CASCADE' : ''}`;
    this.log('debug', `Generated SQL: ${sql}`);

    if (!this.config.mockMode) {
      await this.simulateExecution(50);
    }

    // Clean up tracking
    this.aggregates.delete(aggregateName);
    this.policies.delete(aggregateName);
    this.refreshHistory.delete(aggregateName);
    this.queryMetrics.delete(aggregateName);

    this.notify({
      type: 'aggregate_dropped',
      aggregateName,
      message: `Continuous aggregate dropped: ${aggregateName}`,
      severity: 'info',
      timestamp: new Date(),
    });
  }

  /**
   * Get aggregate definition
   */
  getAggregate(aggregateName: string): ContinuousAggregateDefinition | undefined {
    return this.aggregates.get(aggregateName);
  }

  /**
   * List all aggregates
   */
  listAggregates(): ContinuousAggregateDefinition[] {
    return Array.from(this.aggregates.values());
  }

  /**
   * Check if aggregate exists
   */
  exists(aggregateName: string): boolean {
    return this.aggregates.has(aggregateName);
  }

  // ==========================================================================
  // SQL Generation
  // ==========================================================================

  /**
   * Build CREATE MATERIALIZED VIEW SQL
   */
  private buildCreateSQL(definition: ContinuousAggregateDefinition): string {
    const { name, sourceTable, bucketInterval, groupByColumns, aggregateExpressions, whereClause, realTimeAggregation } = definition;

    // Build SELECT columns
    const selectColumns = [
      `time_bucket('${bucketInterval}', timestamp) AS bucket`,
      ...groupByColumns,
      ...aggregateExpressions.map(e => `${e.expression} AS ${e.alias}`),
    ];

    // Build GROUP BY columns
    const groupBy = ['bucket', ...groupByColumns].join(', ');

    // Build WHERE clause
    const where = whereClause ? `WHERE ${whereClause}` : '';

    // Build full SQL
    const sql = `
CREATE MATERIALIZED VIEW ${this.config.schemaName}.${name}
WITH (timescaledb.continuous${realTimeAggregation ? '' : ', timescaledb.materialized_only = true'}) AS
SELECT 
  ${selectColumns.join(',\n  ')}
FROM ${sourceTable}
${where}
GROUP BY ${groupBy}
WITH NO DATA;
    `.trim();

    return sql;
  }

  // ==========================================================================
  // Refresh Operations
  // ==========================================================================

  /**
   * Manually refresh an aggregate
   */
  async refresh(
    aggregateName: string,
    windowStart?: Date,
    windowEnd?: Date,
  ): Promise<RefreshResult> {
    if (!this.aggregates.has(aggregateName)) {
      throw new AggregateNotFoundError(aggregateName);
    }

    const startTime = Date.now();
    const start = windowStart ?? new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24 hours
    const end = windowEnd ?? new Date();

    this.log('info', `Refreshing aggregate: ${aggregateName} [${start.toISOString()} - ${end.toISOString()}]`);

    this.notify({
      type: 'refresh_started',
      aggregateName,
      message: `Refresh started for ${aggregateName}`,
      severity: 'info',
      timestamp: new Date(),
      data: { windowStart: start, windowEnd: end },
    });

    try {
      // Build refresh SQL
      const sql = `CALL refresh_continuous_aggregate('${this.config.schemaName}.${aggregateName}', '${start.toISOString()}', '${end.toISOString()}')`;
      this.log('debug', `Refresh SQL: ${sql}`);

      if (!this.config.mockMode) {
        await this.simulateExecution(200);
      }

      const result: RefreshResult = {
        aggregateName,
        success: true,
        windowStart: start,
        windowEnd: end,
        durationMs: Date.now() - startTime,
        rowsProcessed: Math.floor(Math.random() * 10000), // Simulated
        timestamp: new Date(),
      };

      // Record history
      this.recordRefreshHistory(aggregateName, result);

      this.notify({
        type: 'refresh_completed',
        aggregateName,
        message: `Refresh completed for ${aggregateName} in ${result.durationMs}ms`,
        severity: 'info',
        timestamp: new Date(),
        data: { durationMs: result.durationMs, rowsProcessed: result.rowsProcessed },
      });

      return result;
    } catch (error) {
      const result: RefreshResult = {
        aggregateName,
        success: false,
        windowStart: start,
        windowEnd: end,
        durationMs: Date.now() - startTime,
        error: (error as Error).message,
        timestamp: new Date(),
      };

      this.recordRefreshHistory(aggregateName, result);

      this.notify({
        type: 'refresh_failed',
        aggregateName,
        message: `Refresh failed for ${aggregateName}: ${(error as Error).message}`,
        severity: 'error',
        timestamp: new Date(),
        data: { error: (error as Error).message },
      });

      throw new RefreshError(aggregateName, `Refresh failed: ${(error as Error).message}`, error as Error);
    }
  }

  /**
   * Refresh all aggregates
   */
  async refreshAll(): Promise<RefreshResult[]> {
    const results: RefreshResult[] = [];

    for (const [name] of this.aggregates) {
      try {
        const result = await this.refresh(name);
        results.push(result);
      } catch (error) {
        results.push({
          aggregateName: name,
          success: false,
          windowStart: new Date(),
          windowEnd: new Date(),
          durationMs: 0,
          error: (error as Error).message,
          timestamp: new Date(),
        });
      }
    }

    return results;
  }

  private recordRefreshHistory(aggregateName: string, result: RefreshResult): void {
    const history = this.refreshHistory.get(aggregateName) ?? [];
    history.push(result);
    
    // Keep last 100 entries
    if (history.length > 100) {
      history.shift();
    }
    
    this.refreshHistory.set(aggregateName, history);
  }

  /**
   * Get refresh history for an aggregate
   */
  getRefreshHistory(aggregateName: string): RefreshResult[] {
    return this.refreshHistory.get(aggregateName) ?? [];
  }

  // ==========================================================================
  // Policy Management
  // ==========================================================================

  /**
   * Create refresh policy for an aggregate
   */
  async createRefreshPolicy(
    aggregateName: string,
    config: Partial<RefreshPolicy>,
  ): Promise<RefreshPolicy> {
    if (!this.aggregates.has(aggregateName)) {
      throw new AggregateNotFoundError(aggregateName);
    }

    const policy: RefreshPolicy = {
      id: `policy-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      aggregateName,
      refreshInterval: config.refreshInterval ?? this.config.defaultRefreshInterval,
      startOffset: config.startOffset ?? '3 hours',
      endOffset: config.endOffset ?? '1 hour',
      enabled: config.enabled ?? true,
      createdAt: new Date(),
    };

    this.log('info', `Creating refresh policy for ${aggregateName}: interval=${policy.refreshInterval}`);

    // Build policy SQL
    const sql = `
SELECT add_continuous_aggregate_policy('${this.config.schemaName}.${aggregateName}',
  start_offset => INTERVAL '${policy.startOffset}',
  end_offset => INTERVAL '${policy.endOffset}',
  schedule_interval => INTERVAL '${policy.refreshInterval}');
    `.trim();

    this.log('debug', `Policy SQL: ${sql}`);

    if (!this.config.mockMode) {
      await this.simulateExecution(50);
    }

    this.policies.set(aggregateName, policy);

    this.notify({
      type: 'policy_created',
      aggregateName,
      message: `Refresh policy created for ${aggregateName}`,
      severity: 'info',
      timestamp: new Date(),
      data: { refreshInterval: policy.refreshInterval },
    });

    return policy;
  }

  /**
   * Remove refresh policy
   */
  async removeRefreshPolicy(aggregateName: string): Promise<void> {
    if (!this.policies.has(aggregateName)) {
      return; // No policy to remove
    }

    this.log('info', `Removing refresh policy for ${aggregateName}`);

    const sql = `SELECT remove_continuous_aggregate_policy('${this.config.schemaName}.${aggregateName}')`;
    this.log('debug', `Remove policy SQL: ${sql}`);

    if (!this.config.mockMode) {
      await this.simulateExecution(50);
    }

    this.policies.delete(aggregateName);
  }

  /**
   * Get refresh policy for an aggregate
   */
  getRefreshPolicy(aggregateName: string): RefreshPolicy | undefined {
    return this.policies.get(aggregateName);
  }

  // ==========================================================================
  // Compression Management
  // ==========================================================================

  /**
   * Enable compression for an aggregate
   */
  async enableCompression(aggregateName: string, afterHours: number): Promise<void> {
    if (!this.aggregates.has(aggregateName)) {
      throw new AggregateNotFoundError(aggregateName);
    }

    this.log('info', `Enabling compression for ${aggregateName}: after ${afterHours} hours`);

    const sql = `
ALTER MATERIALIZED VIEW ${this.config.schemaName}.${aggregateName} SET (timescaledb.compress = true);
SELECT add_compression_policy('${this.config.schemaName}.${aggregateName}', compress_after => INTERVAL '${afterHours} hours');
    `.trim();

    this.log('debug', `Compression SQL: ${sql}`);

    if (!this.config.mockMode) {
      await this.simulateExecution(100);
    }

    this.notify({
      type: 'compression_enabled',
      aggregateName,
      message: `Compression enabled for ${aggregateName}: after ${afterHours} hours`,
      severity: 'info',
      timestamp: new Date(),
      data: { afterHours },
    });
  }

  // ==========================================================================
  // Retention Management
  // ==========================================================================

  /**
   * Set retention policy for an aggregate
   */
  async setRetentionPolicy(aggregateName: string, retentionDays: number): Promise<void> {
    if (!this.aggregates.has(aggregateName)) {
      throw new AggregateNotFoundError(aggregateName);
    }

    this.log('info', `Setting retention policy for ${aggregateName}: ${retentionDays} days`);

    const sql = `SELECT add_retention_policy('${this.config.schemaName}.${aggregateName}', drop_after => INTERVAL '${retentionDays} days')`;
    this.log('debug', `Retention SQL: ${sql}`);

    if (!this.config.mockMode) {
      await this.simulateExecution(50);
    }

    // Update definition
    const aggregate = this.aggregates.get(aggregateName)!;
    aggregate.retentionDays = retentionDays;

    this.notify({
      type: 'retention_applied',
      aggregateName,
      message: `Retention policy set for ${aggregateName}: ${retentionDays} days`,
      severity: 'info',
      timestamp: new Date(),
      data: { retentionDays },
    });
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * Query an aggregate
   */
  async query<T extends Record<string, unknown>>(
    aggregateName: string,
    params: AggregateQueryParams,
  ): Promise<T[]> {
    if (!this.aggregates.has(aggregateName)) {
      throw new AggregateNotFoundError(aggregateName);
    }

    const startTime = Date.now();

    // Build query SQL
    const sql = this.buildQuerySQL(aggregateName, params);
    this.log('debug', `Query SQL: ${sql}`);

    if (!this.config.mockMode) {
      await this.simulateExecution(50);
    }

    const durationMs = Date.now() - startTime;
    this.recordQueryMetric(aggregateName, durationMs);

    // In mock mode, return simulated data
    if (this.config.mockMode) {
      return this.generateMockData<T>(aggregateName, params);
    }

    // In real implementation: execute SQL via Prisma raw query
    return [] as T[];
  }

  /**
   * Build query SQL
   */
  private buildQuerySQL(aggregateName: string, params: AggregateQueryParams): string {
    const { from, to, filters, orderBy, orderDirection, limit, offset } = params;

    let sql = `
SELECT * FROM ${this.config.schemaName}.${aggregateName}
WHERE bucket >= '${from.toISOString()}' AND bucket <= '${to.toISOString()}'
    `.trim();

    // Add filters
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (typeof value === 'string') {
          sql += `\n  AND ${key} = '${value}'`;
        } else if (typeof value === 'number') {
          sql += `\n  AND ${key} = ${value}`;
        } else if (Array.isArray(value)) {
          const escaped = value.map(v => typeof v === 'string' ? `'${v}'` : v).join(', ');
          sql += `\n  AND ${key} IN (${escaped})`;
        }
      }
    }

    // Add ordering
    if (orderBy) {
      sql += `\nORDER BY ${orderBy} ${orderDirection ?? 'ASC'}`;
    }

    // Add pagination
    if (limit) {
      sql += `\nLIMIT ${limit}`;
    }
    if (offset) {
      sql += `\nOFFSET ${offset}`;
    }

    return sql;
  }

  private recordQueryMetric(aggregateName: string, durationMs: number): void {
    const metrics = this.queryMetrics.get(aggregateName) ?? [];
    metrics.push(durationMs);
    
    // Keep last 1000 queries
    if (metrics.length > 1000) {
      metrics.shift();
    }
    
    this.queryMetrics.set(aggregateName, metrics);
  }

  private generateMockData<T>(_aggregateName: string, params: AggregateQueryParams): T[] {
    const results: T[] = [];
    const hours = Math.ceil((params.to.getTime() - params.from.getTime()) / (60 * 60 * 1000));
    const count = Math.min(hours, params.limit ?? 100);

    for (let i = 0; i < count; i++) {
      results.push({
        bucket: new Date(params.from.getTime() + i * 60 * 60 * 1000),
        event_count: Math.floor(Math.random() * 1000),
        unique_users: Math.floor(Math.random() * 100),
      } as unknown as T);
    }

    return results;
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get statistics for an aggregate
   */
  async getStats(aggregateName: string): Promise<AggregateStats> {
    if (!this.aggregates.has(aggregateName)) {
      throw new AggregateNotFoundError(aggregateName);
    }

    const aggregate = this.aggregates.get(aggregateName)!;
    const queryMetrics = this.queryMetrics.get(aggregateName) ?? [];
    const refreshHistory = this.refreshHistory.get(aggregateName) ?? [];

    // Calculate average query time
    const avgQueryTimeMs = queryMetrics.length > 0
      ? queryMetrics.reduce((a, b) => a + b, 0) / queryMetrics.length
      : undefined;

    // Find last refresh
    const lastRefresh = refreshHistory.length > 0
      ? refreshHistory[refreshHistory.length - 1].timestamp
      : undefined;

    // Simulated stats (in real implementation: query pg_catalog)
    const totalRows = Math.floor(Math.random() * 100000);
    const sizeBytes = totalRows * 100; // ~100 bytes per row
    const sizeHuman = this.formatBytes(sizeBytes);

    return {
      name: aggregateName,
      totalRows,
      sizeBytes,
      sizeHuman,
      oldestData: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      newestData: new Date(),
      lastRefresh,
      avgQueryTimeMs,
      isRealTime: aggregate.realTimeAggregation,
      compressionRatio: aggregate.compressionAfter ? 0.85 : undefined, // ~85% compression
    };
  }

  /**
   * Get all aggregate statistics
   */
  async getAllStats(): Promise<AggregateStats[]> {
    const stats: AggregateStats[] = [];

    for (const [name] of this.aggregates) {
      stats.push(await this.getStats(name));
    }

    return stats;
  }

  /**
   * Get service overview statistics
   */
  getOverview(): {
    totalAggregates: number;
    totalPolicies: number;
    totalRefreshes: number;
    successfulRefreshes: number;
    failedRefreshes: number;
  } {
    let totalRefreshes = 0;
    let successfulRefreshes = 0;
    let failedRefreshes = 0;

    for (const [, history] of this.refreshHistory) {
      totalRefreshes += history.length;
      successfulRefreshes += history.filter(r => r.success).length;
      failedRefreshes += history.filter(r => !r.success).length;
    }

    return {
      totalAggregates: this.aggregates.size,
      totalPolicies: this.policies.size,
      totalRefreshes,
      successfulRefreshes,
      failedRefreshes,
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let size = bytes;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  private async simulateExecution(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear all tracking data (for testing)
   */
  clear(): void {
    this.aggregates.clear();
    this.policies.clear();
    this.refreshHistory.clear();
    this.queryMetrics.clear();
    this.log('debug', 'All tracking data cleared');
  }

  /**
   * Dispose service resources
   */
  dispose(): void {
    this.clear();
    this.log('info', 'ContinuousAggregatesService disposed');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ContinuousAggregatesService instance
 */
export function createContinuousAggregatesService(
  config: ContinuousAggregatesConfig,
): ContinuousAggregatesService {
  return new ContinuousAggregatesService(config);
}

// ============================================================================
// Default Export
// ============================================================================

export default ContinuousAggregatesService;
