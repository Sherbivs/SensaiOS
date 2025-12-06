/**
 * Security Plugin System — Type Definitions
 *
 * @module src/bot/security/plugins/types
 * @description Core types for the security plugin architecture
 *
 * Research Sources:
 * - Plugin Pattern: https://refactoring.guru/design-patterns/strategy
 * - Event-Driven Architecture: Martin Fowler, "Patterns of Enterprise Application Architecture"
 *
 * @since Sprint 0 - Foundation Enhancement
 * @version 1.0.0
 */

import type { Guild, GuildMember, Role, User } from "discord.js";

// ============================================================================
// Core Plugin Types
// ============================================================================

/**
 * Plugin lifecycle state
 */
export type PluginState =
  | "unloaded"
  | "initializing"
  | "ready"
  | "error"
  | "disabled";

/**
 * Plugin priority levels (lower = higher priority)
 */
export enum PluginPriority {
  CRITICAL = 0, // Security-critical checks (HMAC, integrity)
  HIGH = 10, // Important validations (permissions, rate limits)
  NORMAL = 50, // Standard operations (audit logging)
  LOW = 100, // Optional enhancements (analytics, metrics)
}

/**
 * Plugin metadata for registration and discovery
 */
export interface PluginMetadata {
  /** Unique plugin identifier (kebab-case) */
  readonly id: string;

  /** Human-readable plugin name */
  readonly name: string;

  /** Semantic version (e.g., "1.0.0") */
  readonly version: string;

  /** Plugin description */
  readonly description: string;

  /** Plugin author */
  readonly author: string;

  /** Execution priority (lower = earlier) */
  readonly priority: PluginPriority;

  /** Plugin tags for filtering/discovery */
  readonly tags: readonly string[];

  /** Required dependencies (plugin IDs) */
  readonly dependencies?: readonly string[];

  /** Optional dependencies (plugin IDs) */
  readonly optionalDependencies?: readonly string[];
}

// ============================================================================
// Security Context Types
// ============================================================================

/**
 * Immutable security context passed to plugins
 */
export interface SecurityContext {
  /** Current guild being processed */
  readonly guild: Guild;

  /** Timestamp of the security operation */
  readonly timestamp: Date;

  /** Correlation ID for distributed tracing */
  readonly correlationId: string;

  /** Parent correlation ID (if nested operation) */
  readonly parentCorrelationId?: string;

  /** Request origin (command, sweep, webhook, etc.) */
  readonly origin: SecurityOperationOrigin;

  /** Feature flags snapshot */
  readonly featureFlags: Readonly<Record<string, boolean>>;
}

/**
 * Origin of security operation for audit trail
 */
export type SecurityOperationOrigin =
  | "command" // Discord slash command
  | "sweep" // Scheduled security sweep
  | "webhook" // External webhook trigger
  | "event" // Discord event (role change, etc.)
  | "api" // Internal API call
  | "migration" // Data migration
  | "startup" // Bot startup
  | "shutdown"; // Bot shutdown

// ============================================================================
// Event Types
// ============================================================================

/**
 * Base event interface for all security events
 */
export interface SecurityEventBase {
  /** Event type identifier */
  readonly type: string;

  /** When the event occurred */
  readonly timestamp: Date;

  /** Guild where event occurred */
  readonly guildId: string;

  /** Correlation ID for tracing */
  readonly correlationId: string;
}

/**
 * Role change event data
 */
export interface RoleChangeEvent extends SecurityEventBase {
  readonly type: "role-change";

  /** Member whose role changed */
  readonly member: GuildMember;

  /** Role that was changed */
  readonly role: Role;

  /** Change action */
  readonly action: "add" | "remove";

  /** Who initiated the change */
  readonly executor?: User;

  /** Was this change authorized? */
  readonly authorized: boolean;

  /** Reason for change (if provided) */
  readonly reason?: string;
}

/**
 * Permission change event data
 */
export interface PermissionChangeEvent extends SecurityEventBase {
  readonly type: "permission-change";

  /** Role or channel that changed */
  readonly targetId: string;

  /** Target type */
  readonly targetType: "role" | "channel";

  /** Old permissions value */
  readonly oldPermissions: bigint;

  /** New permissions value */
  readonly newPermissions: bigint;

  /** Who initiated the change */
  readonly executor?: User;
}

/**
 * Threat detection event data
 */
export interface ThreatDetectedEvent extends SecurityEventBase {
  readonly type: "threat-detected";

  /** Type of threat detected */
  readonly threatType: ThreatType;

  /** Severity level */
  readonly severity: ThreatSeverity;

  /** Member involved (if applicable) */
  readonly memberId?: string;

  /** Evidence supporting detection */
  readonly evidence: readonly ThreatEvidence[];

  /** Recommended action */
  readonly recommendedAction: ThreatAction;
}

/**
 * Threat types detected by the security system
 */
export type ThreatType =
  | "mass-role-change" // Bulk role modifications
  | "permission-escalation" // Unauthorized permission increase
  | "rate-limit-violation" // Excessive API calls
  | "integrity-violation" // Data tampering detected
  | "unauthorized-access" // Access control bypass attempt
  | "suspicious-pattern"; // Anomalous behavior

/**
 * Threat severity levels
 */
export type ThreatSeverity = "low" | "medium" | "high" | "critical";

/**
 * Evidence supporting threat detection
 */
export interface ThreatEvidence {
  /** Evidence type */
  readonly type: string;

  /** Evidence description */
  readonly description: string;

  /** Raw data (redacted for logs) */
  readonly data?: unknown;

  /** When evidence was collected */
  readonly collectedAt: Date;
}

/**
 * Recommended actions for threats
 */
export type ThreatAction =
  | "log" // Log and monitor
  | "alert" // Send DRIP alert
  | "block" // Block the action
  | "revert" // Revert the change
  | "escalate"; // Escalate to super admin

/**
 * Union of all security event types
 */
export type SecurityEvent =
  | RoleChangeEvent
  | PermissionChangeEvent
  | ThreatDetectedEvent;

// ============================================================================
// Plugin Response Types
// ============================================================================

/**
 * Plugin response after processing an event
 */
export interface PluginResponse {
  /** Did plugin process successfully? */
  readonly success: boolean;

  /** Should processing continue to next plugin? */
  readonly continueChain: boolean;

  /** Optional action to take */
  readonly action?: PluginAction;

  /** Optional data to pass to next plugin */
  readonly data?: unknown;

  /** Error if success is false */
  readonly error?: PluginError;

  /** Execution time in milliseconds */
  readonly executionTimeMs: number;
}

/**
 * Actions a plugin can request
 */
export interface PluginAction {
  /** Action type */
  readonly type: PluginActionType;

  /** Action parameters */
  readonly params?: Record<string, unknown>;

  /** Priority of this action */
  readonly priority: number;
}

/**
 * Plugin action types
 */
export type PluginActionType =
  | "log" // Log event
  | "alert" // Send DRIP alert
  | "audit" // Create audit record
  | "block" // Block operation
  | "revert" // Revert change
  | "quarantine" // Isolate member/role
  | "notify" // Notify specific users
  | "metric"; // Record metric

/**
 * Plugin error information
 */
export interface PluginError {
  /** Error code */
  readonly code: string;

  /** Error message */
  readonly message: string;

  /** Stack trace (if available) */
  readonly stack?: string;

  /** Is this error recoverable? */
  readonly recoverable: boolean;
}

// ============================================================================
// Plugin Interface
// ============================================================================

/**
 * Main plugin interface that all security plugins must implement
 *
 * @example
 * ```typescript
 * export class RoleAuditPlugin implements SecurityPlugin {
 *   metadata = {
 *     id: 'role-audit',
 *     name: 'Role Audit Plugin',
 *     version: '1.0.0',
 *     description: 'Audits all role changes',
 *     author: 'Security Team',
 *     priority: PluginPriority.NORMAL,
 *     tags: ['audit', 'roles'],
 *   };
 *
 *   async initialize(context: SecurityContext): Promise<void> {
 *     // Setup database connections, caches, etc.
 *   }
 *
 *   async onRoleChange(event: RoleChangeEvent): Promise<PluginResponse> {
 *     // Process role change event
 *     return { success: true, continueChain: true, executionTimeMs: 5 };
 *   }
 * }
 * ```
 */
export interface SecurityPlugin {
  /** Plugin metadata for registration */
  readonly metadata: PluginMetadata;

  /** Current plugin state */
  readonly state: PluginState;

  // Lifecycle Methods
  // -------------------------------------------------------------------------

  /**
   * Initialize the plugin with security context
   * Called once when plugin is loaded
   */
  initialize(context: SecurityContext): Promise<void>;

  /**
   * Shutdown the plugin gracefully
   * Called when plugin is unloaded or bot shuts down
   */
  shutdown(): Promise<void>;

  /**
   * Health check for the plugin
   * Returns true if plugin is functioning correctly
   */
  healthCheck(): Promise<boolean>;

  // Event Handlers (all optional)
  // -------------------------------------------------------------------------

  /**
   * Handle role change events
   */
  onRoleChange?(event: RoleChangeEvent): Promise<PluginResponse>;

  /**
   * Handle permission change events
   */
  onPermissionChange?(event: PermissionChangeEvent): Promise<PluginResponse>;

  /**
   * Handle threat detection events
   */
  onThreatDetected?(event: ThreatDetectedEvent): Promise<PluginResponse>;

  /**
   * Generic event handler for custom events
   */
  onEvent?(event: SecurityEvent): Promise<PluginResponse>;
}

// ============================================================================
// Plugin Registry Types
// ============================================================================

/**
 * Plugin registration entry in the registry
 */
export interface PluginRegistration {
  /** The plugin instance */
  readonly plugin: SecurityPlugin;

  /** When plugin was registered */
  readonly registeredAt: Date;

  /** Plugin file path (for hot-reload) */
  readonly filePath?: string;

  /** Last reload timestamp */
  readonly lastReloadAt?: Date;

  /** Error count since last successful operation */
  errorCount: number;

  /** Last error (if any) */
  lastError?: PluginError;
}

/**
 * Plugin registry statistics
 */
export interface PluginRegistryStats {
  /** Total registered plugins */
  readonly totalPlugins: number;

  /** Plugins by state */
  readonly byState: Record<PluginState, number>;

  /** Total events processed */
  readonly eventsProcessed: number;

  /** Average processing time (ms) */
  readonly avgProcessingTimeMs: number;

  /** Error rate (0-1) */
  readonly errorRate: number;
}

/**
 * Plugin discovery result
 */
export interface PluginDiscoveryResult {
  /** Discovered plugin file paths */
  readonly pluginPaths: readonly string[];

  /** Errors during discovery */
  readonly errors: readonly PluginDiscoveryError[];

  /** Discovery timestamp */
  readonly discoveredAt: Date;
}

/**
 * Plugin discovery error
 */
export interface PluginDiscoveryError {
  /** File path that caused error */
  readonly filePath: string;

  /** Error message */
  readonly message: string;

  /** Error code */
  readonly code: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Plugin system configuration
 */
export interface PluginSystemConfig {
  /** Directory to scan for plugins */
  readonly pluginDirectory: string;

  /** Enable hot-reload in development */
  readonly hotReloadEnabled: boolean;

  /** Hot-reload debounce time (ms) */
  readonly hotReloadDebounceMs: number;

  /** Maximum plugins to load */
  readonly maxPlugins: number;

  /** Plugin execution timeout (ms) */
  readonly executionTimeoutMs: number;

  /** Enable plugin metrics collection */
  readonly metricsEnabled: boolean;

  /** Circuit breaker threshold (consecutive failures) */
  readonly circuitBreakerThreshold: number;

  /** Circuit breaker reset time (ms) */
  readonly circuitBreakerResetMs: number;
}

/**
 * Default plugin system configuration
 */
export const DEFAULT_PLUGIN_CONFIG: PluginSystemConfig = {
  pluginDirectory: "src/bot/security/plugins/implementations",
  hotReloadEnabled: process.env.NODE_ENV !== "production",
  hotReloadDebounceMs: 500,
  maxPlugins: 50,
  executionTimeoutMs: 5000,
  metricsEnabled: true,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 60000,
};
