/**
 * Event Types - Typed Event Payloads for Event Bus
 * ===============================================
 *
 * Provides type-safe event payload definitions for all event topics.
 * Integrates with the error hierarchy for error events.
 *
 * @module shared/event-types
 * @since 2025-12-16
 *
 * Topics follow dot-notation hierarchy:
 * - error.{severity} — Error events (critical, high, medium, low)
 * - threat.detected — Security threat events
 * - homestead.{action} — Homestead channel events
 * - battle.{action} — Battle system events
 * - cache.{action} — Cache operation events
 * - worker.{action} — Worker lifecycle events
 * - system.{action} — System-level events
 */

// ============================================================================
// Error Types (inline - previously from errors/base.ts)
// ============================================================================

/**
 * Error domain categories.
 */
export type ErrorDomain =
  | "APP"
  | "DATABASE"
  | "GAME"
  | "DISCORD"
  | "VALIDATION"
  | "CONFIG"
  | "WORKER"
  | "EXTERNAL"
  | "CACHE";

/**
 * Error severity levels.
 */
export type ErrorSeverity = "low" | "medium" | "high" | "critical";

/**
 * Whether the error is operational (expected) or programming (bug).
 */
export type ErrorType = "operational" | "programming";

/**
 * Base error context for all errors.
 */
export interface ErrorContext {
  errorId?: string;
  correlationId?: string;
  userId?: string;
  operation?: string;
  [key: string]: unknown;
}

/**
 * Serialized error format for transport/logging.
 */
export interface SerializedError {
  name: string;
  message: string;
  code: string;
  domain: ErrorDomain;
  severity: ErrorSeverity;
  type: ErrorType;
  context: ErrorContext;
  stack?: string;
  cause?: SerializedError;
  timestamp: string;
}

// ============================================================================
// Base Event Payload
// ============================================================================

/**
 * Base payload structure for all events.
 */
export interface BaseEventPayload {
  /** ISO timestamp of when the event occurred */
  timestamp: string;
  /** Optional source service/module */
  source?: string;
}

// ============================================================================
// Error Events (error.*)
// ============================================================================

/**
 * Error event payload — emitted when errors occur.
 * Topic: error.{severity} (error.critical, error.high, error.medium, error.low)
 */
export interface ErrorEventPayload extends BaseEventPayload {
  /** Serialized error information */
  error: SerializedError;
  /** Error domain for filtering */
  domain: ErrorDomain;
  /** Error severity */
  severity: ErrorSeverity;
  /** Error code for categorization */
  code: string;
  /** Error message */
  message: string;
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** User ID if applicable */
  userId?: string;
  /** Additional context from error */
  context?: Record<string, unknown>;
}

// ============================================================================
// Threat Events (threat.*)
// ============================================================================

/** Threat severity levels */
export type ThreatSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** MITRE ATT&CK technique identifiers */
export type MitreAttackId = 
  | "T1098"   // Account Manipulation
  | "T1110"   // Brute Force
  | "T1531"   // Account Access Removal
  | "T1562"   // Impair Defenses
  | "T1078"   // Valid Accounts
  | string;   // Allow other IDs

/**
 * Threat detection event payload.
 * Topic: threat.detected
 */
export interface ThreatDetectedPayload extends BaseEventPayload {
  /** Type of threat detected */
  type: string;
  /** Threat severity */
  severity: ThreatSeverity;
  /** Discord guild ID */
  guildId: string;
  /** Discord guild name */
  guildName: string;
  /** User ID involved */
  userId: string;
  /** Discord ID */
  discordId: string;
  /** Count of suspicious actions */
  count?: number;
  /** Threshold that was exceeded */
  threshold?: number;
  /** Time window for rate limiting */
  timeWindow?: string;
  /** MITRE ATT&CK technique ID */
  mitreAttack?: MitreAttackId;
  /** MITRE technique description */
  mitreDescription?: string;
  /** Recommended action to take */
  recommendedAction?: string;
  /** Additional context */
  context?: {
    recentCreationTimestamps?: string;
    affectedGuild?: string;
    potentialImpact?: string;
    [key: string]: unknown;
  };
}

// ============================================================================
// Homestead Events (homestead.*)
// ============================================================================

/**
 * Homestead creation event payload.
 * Topic: homestead.created
 */
export interface HomesteadCreatedPayload extends BaseEventPayload {
  /** User ID in database */
  userId: string;
  /** Discord user ID */
  discordId: string;
  /** Homestead database record ID */
  homesteadId: string;
  /** Discord channel ID */
  channelId: string;
  /** Channel name */
  channelName: string;
  /** Guild ID */
  guildId: string;
  /** Guild name */
  guildName: string;
}

/**
 * Homestead deletion event payload.
 * Topic: homestead.deleted
 */
export interface HomesteadDeletedPayload extends BaseEventPayload {
  /** Homestead database record ID */
  homesteadId: string;
  /** User ID */
  userId: string;
  /** Channel ID that was deleted */
  channelId: string;
  /** Guild ID */
  guildId: string;
  /** Reason for deletion */
  reason?: string;
}

// ============================================================================
// Battle Events (battle.*)
// ============================================================================

/** Battle participant info */
export interface BattleParticipant {
  /** User ID */
  id: string;
  /** Display name */
  name: string;
  /** Participant type */
  type: "player" | "npc" | "wild";
}

/**
 * Battle started event payload.
 * Topic: battle.started
 */
export interface BattleStartedPayload extends BaseEventPayload {
  /** Battle ID */
  battleId: string;
  /** Battle type */
  battleType: "wild" | "pvp" | "npc";
  /** Participants */
  participants: BattleParticipant[];
  /** Arena thread ID (if any) */
  arenaThreadId?: string;
  /** Guild ID */
  guildId?: string;
}

/**
 * Battle ended event payload.
 * Topic: battle.ended
 */
export interface BattleEndedPayload extends BaseEventPayload {
  /** Battle ID */
  battleId: string;
  /** Winner info */
  winner: BattleParticipant;
  /** Loser info */
  loser: BattleParticipant;
  /** How the battle ended */
  outcome: "knockout" | "forfeit" | "timeout" | "error";
  /** Battle duration in seconds */
  durationSeconds: number;
  /** Total turns taken */
  turnCount: number;
}

/**
 * Battle turn event payload.
 * Topic: battle.turn
 */
export interface BattleTurnPayload extends BaseEventPayload {
  /** Battle ID */
  battleId: string;
  /** Turn number */
  turnNumber: number;
  /** Active player this turn */
  activePlayer: string;
  /** Action taken */
  action: "move" | "switch" | "item" | "flee";
  /** Move used (if action is move) */
  moveName?: string;
  /** Target of action */
  target?: string;
  /** Damage dealt (if any) */
  damage?: number;
  /** Whether it was a critical hit */
  critical?: boolean;
  /** Type effectiveness */
  effectiveness?: "super" | "normal" | "not_very" | "immune";
}

// ============================================================================
// Cache Events (cache.*)
// ============================================================================

/**
 * Cache maintenance event payload.
 * Topic: cache.maintenance
 */
export interface CacheMaintenancePayload extends BaseEventPayload {
  /** Namespace cleaned */
  namespace: string;
  /** Entries evicted */
  entriesEvicted: number;
  /** Space reclaimed in bytes */
  bytesReclaimed: number;
  /** Duration of maintenance in ms */
  durationMs: number;
  /** Trigger for maintenance */
  trigger: "scheduled" | "manual" | "pressure";
}

/**
 * Cache hit/miss event payload.
 * Topic: cache.hit, cache.miss
 */
export interface CacheAccessPayload extends BaseEventPayload {
  /** Cache namespace */
  namespace: string;
  /** Cache key */
  key: string;
  /** Size of cached value (if hit) */
  sizeBytes?: number;
  /** Time to retrieve in ms */
  retrievalMs: number;
}

// ============================================================================
// Worker Events (worker.*)
// ============================================================================

/** Worker types in the system */
export type WorkerType = 
  | "cache-refresh"
  | "buffer-flush"
  | "read-db-sync"
  | "write-db-validator"
  | "outbox"
  | "security"
  | "data-pipeline";

/**
 * Worker started event payload.
 * Topic: worker.started
 */
export interface WorkerStartedPayload extends BaseEventPayload {
  /** Worker type */
  workerType: WorkerType;
  /** Worker instance ID */
  instanceId: string;
  /** Configuration used */
  config?: Record<string, unknown>;
}

/**
 * Worker stopped event payload.
 * Topic: worker.stopped
 */
export interface WorkerStoppedPayload extends BaseEventPayload {
  /** Worker type */
  workerType: WorkerType;
  /** Worker instance ID */
  instanceId: string;
  /** Stop reason */
  reason: "shutdown" | "error" | "restart" | "timeout";
  /** Uptime in seconds */
  uptimeSeconds: number;
  /** Tasks completed */
  tasksCompleted: number;
}

/**
 * Worker error event payload.
 * Topic: worker.error
 */
export interface WorkerErrorPayload extends BaseEventPayload {
  /** Worker type */
  workerType: WorkerType;
  /** Worker instance ID */
  instanceId: string;
  /** Error message */
  error: string;
  /** Error code if available */
  errorCode?: string;
  /** Task that failed */
  failedTask?: string;
  /** Whether worker will retry */
  willRetry: boolean;
}

// ============================================================================
// System Events (system.*)
// ============================================================================

/**
 * System startup event payload.
 * Topic: system.startup
 */
export interface SystemStartupPayload extends BaseEventPayload {
  /** Service name */
  serviceName: string;
  /** Version */
  version: string;
  /** Environment */
  environment: "production" | "development" | "test";
  /** Startup duration in ms */
  startupDurationMs: number;
  /** Subsystems initialized */
  subsystems: string[];
}

/**
 * System shutdown event payload.
 * Topic: system.shutdown
 */
export interface SystemShutdownPayload extends BaseEventPayload {
  /** Service name */
  serviceName: string;
  /** Shutdown reason */
  reason: "signal" | "error" | "manual" | "restart";
  /** Signal received (if signal) */
  signal?: "SIGTERM" | "SIGINT" | "SIGHUP";
  /** Uptime in seconds */
  uptimeSeconds: number;
  /** Whether shutdown was graceful */
  graceful: boolean;
}

/**
 * Health check event payload.
 * Topic: system.health
 */
export interface SystemHealthPayload extends BaseEventPayload {
  /** Overall status */
  status: "healthy" | "degraded" | "unhealthy";
  /** Component statuses */
  components: Record<string, {
    status: "up" | "down" | "degraded";
    latencyMs?: number;
    error?: string;
  }>;
  /** Memory usage in MB */
  memoryUsageMb: number;
  /** CPU usage percentage */
  cpuUsagePercent?: number;
}

// ============================================================================
// Alert Events (alert.*)
// ============================================================================

/**
 * Alert event payload.
 * Topic: alert.critical, alert.security, alert.operational
 */
export interface AlertPayload extends BaseEventPayload {
  /** Alert title */
  title: string;
  /** Alert message */
  message: string;
  /** Alert severity */
  severity: "critical" | "high" | "medium" | "low";
  /** Alert category */
  category: "security" | "error" | "performance" | "operational";
  /** Should DM be sent to admin */
  dmAdmin?: boolean;
  /** Additional fields for Discord embed */
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

// ============================================================================
// Event Topic Map
// ============================================================================

/**
 * Maps event topics to their payload types.
 * Enables type-safe event emission and subscription.
 */
export interface EventTopicMap {
  // Error events
  "error.critical": ErrorEventPayload;
  "error.high": ErrorEventPayload;
  "error.medium": ErrorEventPayload;
  "error.low": ErrorEventPayload;
  
  // Threat events
  "threat.detected": ThreatDetectedPayload;
  
  // Homestead events
  "homestead.created": HomesteadCreatedPayload;
  "homestead.deleted": HomesteadDeletedPayload;
  
  // Battle events
  "battle.started": BattleStartedPayload;
  "battle.ended": BattleEndedPayload;
  "battle.turn": BattleTurnPayload;
  
  // Cache events
  "cache.maintenance": CacheMaintenancePayload;
  "cache.hit": CacheAccessPayload;
  "cache.miss": CacheAccessPayload;
  
  // Worker events
  "worker.started": WorkerStartedPayload;
  "worker.stopped": WorkerStoppedPayload;
  "worker.error": WorkerErrorPayload;
  
  // System events
  "system.startup": SystemStartupPayload;
  "system.shutdown": SystemShutdownPayload;
  "system.health": SystemHealthPayload;
  
  // Alert events
  "alert.critical": AlertPayload;
  "alert.security": AlertPayload;
  "alert.operational": AlertPayload;
}

/**
 * All known event topics.
 */
export type EventTopic = keyof EventTopicMap;

/**
 * Get payload type for a topic.
 */
export type EventPayload<T extends EventTopic> = EventTopicMap[T];

/**
 * Union of all possible payloads.
 */
export type AnyEventPayload = EventTopicMap[EventTopic];
