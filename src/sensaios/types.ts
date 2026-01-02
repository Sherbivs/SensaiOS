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
// ============================================================================
// RING SECURITY & CAPABILITY SYSTEM
// Design: docs/projects/SensaiOS/architecture/06-os-security-model.md
// ============================================================================

/**
 * Security ring levels (x86-inspired)
 */
export type RingLevel = 0 | 1 | 2 | 3;

/**
 * Ring level semantic aliases
 */
export const RING: Record<string, RingLevel> = {
  /** Kernel — Unrestricted access to all resources */
  KERNEL: 0,
  
  /** SensaiOS — Component management and policy enforcement */
  SENSAIOS: 1,
  
  /** Reserved — Future use for trusted services */
  RESERVED: 2,
  
  /** Applications — Restricted to granted capabilities only */
  APPS: 3,
} as const;

/**
 * Capability types for fine-grained access control
 */
export type CapabilityType =
  // Database capabilities
  | 'db.read'
  | 'db.write'
  | 'db.migrate'
  
  // Discord capabilities
  | 'discord.read'
  | 'discord.send'
  | 'discord.moderate'
  
  // Network capabilities
  | 'network.http-egress'
  
  // Storage capabilities
  | 'storage.read'
  | 'storage.write'
  
  // Kernel observability
  | 'kernel.observe'
  | 'kernel.metrics'
  | 'kernel.error-route'
  
  // Export system
  | 'exports.append'
  | 'exports.query'
  
  // Job system
  | 'jobs.enqueue'
  | 'jobs.lease'
  
  // Outbox system
  | 'outbox.send';

/**
 * Capability scope restrictions
 */
export interface CapabilityScope {
  /** Tenant ID restriction */
  tenantId?: string;
  
  /** Guild ID restriction */
  guildId?: string;
  
  /** Database tables allowed (for db.* capabilities) */
  tables?: string[];
  
  /** Discord channels allowed (for discord.* capabilities) */
  channels?: string[];
  
  /** HTTP domains allowed (for network.http-egress) */
  domains?: string[];
  
  /** Arbitrary additional restrictions */
  [key: string]: unknown;
}

/**
 * Capability grant definition
 */
export interface Capability {
  /** Unique identifier */
  id?: string;
  
  /** Component requesting the capability */
  component: string;
  
  /** Capability type */
  type: CapabilityType;
  
  /** Optional scope restriction */
  scope?: CapabilityScope;
  
  /** Grant reason (auditable) */
  reason: string;
  
  /** When granted */
  grantedAt?: Date;
  
  /** Optional expiration */
  expiresAt?: Date | null;
  
  /** Revocation timestamp (null = active) */
  revokedAt?: Date | null;
  
  /** Who granted this capability */
  grantedBy?: string | null;
  
  /** Revocation reason */
  revokeReason?: string | null;
}

/**
 * Application manifest (for installed apps)
 */
export interface AppManifest {
  /** App identifier */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Semver version */
  version: string;
  
  /** Optional description */
  description?: string;
  
  /** Ring level (0=kernel, 1=sensaios, 3=apps) */
  ringLevel: RingLevel;
  
  /** Required capabilities */
  capabilities: CapabilityType[];
  
  /** Optional capability scopes */
  capabilityScopes?: Record<CapabilityType, CapabilityScope>;
  
  /** Dependencies on other apps */
  dependencies?: string[];
  
  /** App metadata */
  metadata?: Record<string, unknown>;
}