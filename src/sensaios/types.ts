/**
 * SensaiOS Types — Shared Type Definitions
 * 
 * Core types for the SensaiOS multi-tenant observability layer.
 * 
 * @module sensaios/types
 * @since 2025-12-28
 */

// ============================================================================
// ENVIRONMENT & DEPLOYMENT
// ============================================================================

/**
 * Deployment environment
 */
export type Environment = 'production' | 'staging' | 'development';

/**
 * Export serialization format
 */
export type ExportFormat = 'json' | 'jsonl' | 'pretty' | 'csv' | 'logfmt';

/**
 * Export destination types
 */
export type ExportDestination =
  | 'console'
  | 'file'
  | 'database'
  | 'loki'
  | 'discord'
  | 'webhook'
  | 'buffer';

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error categories for classification
 */
export type ErrorCategory =
  | 'validation'    // Input validation failures
  | 'database'      // Database errors (Prisma, connection)
  | 'network'       // Network/HTTP errors
  | 'auth'          // Authentication/authorization
  | 'game'          // Game logic errors
  | 'discord'       // Discord API errors
  | 'worker'        // Background job errors
  | 'system'        // System-level errors (memory, disk)
  | 'unknown';      // Uncategorized

/**
 * Error severity levels for routing
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Recovery suggestion for errors
 */
export interface RecoverySuggestion {
  /** What to try */
  action: string;

  /** Why this might help */
  rationale?: string;

  /** Is this automatic or manual? */
  automatic: boolean;

  /** Confidence level (0-1) */
  confidence: number;
}

// ============================================================================
// EXPORT METADATA
// ============================================================================

/**
 * Export metadata attached to envelopes
 */
export interface ExportMeta {
  /** Serialization format */
  format: ExportFormat;

  /** Target destination */
  destination: ExportDestination;

  /** When the envelope was prepared for export */
  exportedAt: string;

  /** Batch ID if part of a batch */
  batchId?: string;

  /** Sequence number within batch */
  sequence?: number;

  /** TTL in seconds (for retention) */
  ttlSeconds?: number;
}

// ============================================================================
// GUARDED EXECUTION
// ============================================================================

/**
 * Context for a guarded execution
 */
export interface GuardedContext {
  /**
   * Human-readable name for this handler
   * Used in logs and error messages.
   * 
   * @example "battle.start"
   * @example "homestead.create"
   * @example "cache.refresh"
   */
  name: string;

  /**
   * Correlation ID (auto-generated if not provided)
   */
  correlationId?: string;

  /**
   * Parent correlation ID (for nested calls)
   */
  parentCorrelationId?: string;

  /**
   * Additional metadata to include in logs
   */
  metadata?: Record<string, unknown>;

  /**
   * Timeout in milliseconds (default: 30000)
   */
  timeoutMs?: number;

  /**
   * Should errors be rethrown? (default: true)
   */
  rethrow?: boolean;
}

/**
 * Result of a guarded execution (for safe variant)
 */
export interface GuardedResult<T> {
  /** Was the execution successful? */
  success: boolean;

  /** The result (if successful) */
  result?: T;

  /** The error (if failed) - CanonicalError when from runGuarded */
  error?: unknown;

  /** Execution duration in milliseconds */
  durationMs: number;

  /** Correlation ID used */
  correlationId: string;

  /** Scope used (if available) */
  scope?: import('./tenant-scope.js').TenantScope;
}
