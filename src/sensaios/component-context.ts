/**
 * SensaiOS Component Context — Kernel Primitives Access
 * 
 * Every Sensai component receives a ComponentContext providing access to
 * kernel primitives: database, exports, jobs, outbox, observability, etc.
 * 
 * This is the "syscall" interface for Sensai components.
 * 
 * @module sensaios/component-context
 * @since 2025-12-29
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { TenantScope } from './tenant-scope.js';
import type { CanonicalError } from './canonical-error.js';

// ============================================================================
// DATABASE PRIMITIVE
// ============================================================================

/**
 * Database access primitive
 * 
 * Provides Prisma access and transaction helpers.
 */
export interface DbPrimitive {
  /**
   * The Prisma client instance
   */
  readonly prisma: PrismaClient;

  /**
   * Execute a function within a transaction
   * 
   * @param fn - The function to execute
   * @returns The result of the function
   * 
   * @example
   * ```ts
   * const result = await ctx.db.transaction(async (tx) => {
   *   await tx.trainer.update({ where: { id }, data: { money: 100 } });
   *   await tx.inventory.create({ data: { trainerId: id, itemId: 1 } });
   *   return { success: true };
   * });
   * ```
   */
  transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;

  /**
   * Execute a raw SQL query
   * 
   * @param sql - The SQL query
   * @param params - Query parameters
   * @returns The query results
   */
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

// ============================================================================
// EXPORT LOG PRIMITIVE
// ============================================================================

/**
 * Export envelope for the append-only event log
 */
export interface ExportEnvelopeData {
  /** Source component name */
  source: string;

  /** Event type (e.g., "battle.completed") */
  type: string;

  /** Tenant scope (REQUIRED) */
  scope: TenantScope;

  /** Idempotency key for deduplication */
  idempotencyKey: string;

  /** Event payload */
  payload: unknown;

  /** When the event occurred */
  occurredAt: Date;

  /** Correlation ID for tracing */
  correlationId: string;
}

/**
 * Result of appending to the export log
 */
export interface AppendResult {
  /** The sequence number assigned */
  seq: number;

  /** Whether this was a duplicate (idempotent append) */
  duplicate: boolean;
}

/**
 * Filter for querying exports
 */
export interface ExportFilter {
  /** Filter by event types */
  types?: string[];

  /** Filter by source component */
  source?: string;

  /** Filter by tenant */
  tenant?: string;

  /** Starting sequence (inclusive) */
  fromSeq?: number;

  /** Ending sequence (inclusive) */
  toSeq?: number;

  /** Starting time (inclusive) */
  fromTime?: Date;

  /** Ending time (inclusive) */
  toTime?: Date;

  /** Maximum results to return */
  limit?: number;
}

/**
 * Export log primitive
 * 
 * Append-only event log for component communication.
 * This is how components share facts without direct coupling.
 */
export interface ExportsPrimitive {
  /**
   * Append an event to the export log
   * 
   * @param envelope - The event envelope with mandatory scope
   * @returns Result with sequence number and duplicate flag
   * 
   * @example
   * ```ts
   * await ctx.exports.append({
   *   source: 'game.battles',
   *   type: 'battle.completed',
   *   scope: ctx.scope,
   *   idempotencyKey: `battle-${battleId}`,
   *   payload: { battleId, winnerId, loserId },
   *   occurredAt: new Date(),
   *   correlationId: ctx.obs.correlationId,
   * });
   * ```
   */
  append(envelope: ExportEnvelopeData): Promise<AppendResult>;

  /**
   * Query exports matching a filter
   * 
   * @param filter - Query filter criteria
   * @returns Matching export envelopes
   */
  query(filter: ExportFilter): Promise<ExportEnvelopeData[]>;

  /**
   * Get the current offset for a projection
   * 
   * @param projection - Projection name
   * @returns The last processed sequence number
   */
  getOffset(projection: string): Promise<number>;

  /**
   * Set the offset for a projection after processing
   * 
   * @param projection - Projection name
   * @param seq - The sequence number processed up to
   */
  setOffset(projection: string, seq: number): Promise<void>;

  /**
   * Consume exports from a sequence for specified types
   * 
   * Used by projection workers to process events.
   * 
   * @param seq - Starting sequence (exclusive)
   * @param types - Event types to consume
   * @param limit - Maximum events to return (default: 100)
   * @returns Events to process
   */
  consumeFrom(seq: number, types: string[], limit?: number): Promise<ExportEnvelopeData[]>;
}

// ============================================================================
// JOB QUEUE PRIMITIVE
// ============================================================================

/**
 * Job envelope for background work
 */
export interface JobEnvelope {
  /** Job type/kind */
  kind: string;

  /** Tenant scope (REQUIRED) */
  scope: TenantScope;

  /** Job payload */
  payload: unknown;

  /** Schedule for later (optional) */
  scheduledFor?: Date;

  /** Correlation ID for tracing */
  correlationId: string;

  /** Maximum attempts (default: 3) */
  maxAttempts?: number;

  /** Priority (higher = sooner) */
  priority?: number;
}

/**
 * A leased job ready for processing
 */
export interface LeasedJob {
  /** Job ID */
  id: string;

  /** Job kind */
  kind: string;

  /** Tenant scope */
  scope: TenantScope;

  /** Job payload */
  payload: unknown;

  /** Correlation ID */
  correlationId: string;

  /** Current attempt number */
  attempt: number;

  /** When the lease expires */
  leaseExpiresAt: Date;
}

/**
 * Result of completing a job
 */
export interface JobResult {
  /** Result data */
  data?: unknown;

  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Job queue primitive
 * 
 * Background job queue with retry semantics.
 */
export interface JobsPrimitive {
  /**
   * Enqueue a job for background processing
   * 
   * @param envelope - Job details with mandatory scope
   * @returns The job ID
   * 
   * @example
   * ```ts
   * await ctx.jobs.enqueue({
   *   kind: 'battle.cleanup',
   *   scope: ctx.scope,
   *   payload: { battleId },
   *   correlationId: ctx.obs.correlationId,
   * });
   * ```
   */
  enqueue(envelope: JobEnvelope): Promise<string>;

  /**
   * Lease available jobs for processing
   * 
   * @param kinds - Job kinds to lease
   * @param limit - Maximum jobs to lease (default: 10)
   * @returns Leased jobs
   */
  lease(kinds: string[], limit?: number): Promise<LeasedJob[]>;

  /**
   * Mark a job as completed
   * 
   * @param jobId - The job ID
   * @param result - Result data
   */
  complete(jobId: string, result: JobResult): Promise<void>;

  /**
   * Mark a job as failed (may retry)
   * 
   * @param jobId - The job ID
   * @param error - The error that occurred
   * @param retryAfter - When to retry (optional)
   */
  fail(jobId: string, error: CanonicalError, retryAfter?: Date): Promise<void>;
}

// ============================================================================
// OUTBOX PRIMITIVE
// ============================================================================

/**
 * Outbox envelope for external messages
 */
export interface OutboxEnvelope {
  /** Target destination system */
  destination: 'discord' | 'webhook' | 'email';

  /** Message topic/type */
  topic: string;

  /** Ordering key (messages with same key delivered in order) */
  key: string;

  /** Tenant scope (REQUIRED) */
  scope: TenantScope;

  /** Message payload */
  payload: unknown;

  /** Correlation ID for tracing */
  correlationId: string;
}

/**
 * Outbox primitive
 * 
 * External message delivery with exactly-once semantics.
 */
export interface OutboxPrimitive {
  /**
   * Send a message via the outbox
   * 
   * Messages are persisted and delivered asynchronously by the outbox worker.
   * This ensures Discord/webhook messages survive crashes.
   * 
   * @param envelope - Message with mandatory scope
   * @returns The message ID
   * 
   * @example
   * ```ts
   * await ctx.outbox.send({
   *   destination: 'discord',
   *   topic: 'battle.result',
   *   key: `channel-${channelId}`,
   *   scope: ctx.scope,
   *   payload: { channelId, embeds: [battleResultEmbed] },
   *   correlationId: ctx.obs.correlationId,
   * });
   * ```
   */
  send(envelope: OutboxEnvelope): Promise<string>;

  /**
   * Mark a message as delivered
   * 
   * @param id - Message ID
   */
  markDelivered(id: string): Promise<void>;

  /**
   * Mark a message as failed
   * 
   * @param id - Message ID
   * @param error - Delivery error
   */
  markFailed(id: string, error: CanonicalError): Promise<void>;
}

// ============================================================================
// CONFIGURATION PRIMITIVE
// ============================================================================

/**
 * Configuration scope levels
 */
export type ConfigScope = 
  | { level: 'global' }
  | { level: 'tenant'; tenant: string }
  | { level: 'component'; component: string }
  | { level: 'feature'; flag: string; tenant?: string };

/**
 * Configuration primitive
 * 
 * Typed configuration and feature flags.
 */
export interface ConfigPrimitive {
  /**
   * Get a configuration value
   * 
   * @param key - Configuration key
   * @param scope - Optional scope filter
   * @returns The value or undefined
   */
  get<T>(key: string, scope?: ConfigScope): Promise<T | undefined>;

  /**
   * Set a configuration value
   * 
   * @param key - Configuration key
   * @param value - Value to set
   * @param scope - Optional scope
   */
  set<T>(key: string, value: T, scope?: ConfigScope): Promise<void>;

  /**
   * Get component-specific configuration
   * 
   * @param component - Component name
   * @returns The component's config
   */
  getComponentConfig<T>(component: string): Promise<T>;

  /**
   * Check a feature flag
   * 
   * @param flag - Flag name
   * @param scope - Optional scope for tenant-specific flags
   * @returns Whether the flag is enabled
   */
  getFeatureFlag(flag: string, scope?: ConfigScope): Promise<boolean>;
}

// ============================================================================
// RBAC PRIMITIVE
// ============================================================================

/**
 * Capability required for an operation
 */
export interface Capability {
  /** Resource type */
  resource: string;

  /** Action on the resource */
  action: string;

  /** Optional resource ID */
  resourceId?: string;
}

/**
 * Audit event for privileged actions
 */
export interface AuditEvent {
  /** Action performed */
  action: string;

  /** Who performed it */
  actor: {
    type: 'user' | 'system' | 'component';
    id: string;
  };

  /** Target of the action */
  target?: {
    type: string;
    id: string;
  };

  /** Additional context */
  context?: Record<string, unknown>;

  /** Result of the action */
  result: 'success' | 'denied' | 'error';
}

/**
 * RBAC primitive
 * 
 * Role-based access control with audit logging.
 */
export interface RbacPrimitive {
  /**
   * Assert a capability (throws if denied)
   * 
   * @param capability - Required capability
   * @param scope - Context scope
   * @throws CanonicalError if denied
   */
  assert(capability: Capability, scope: TenantScope): Promise<void>;

  /**
   * Check a capability (returns boolean)
   * 
   * @param capability - Required capability
   * @param scope - Context scope
   * @returns Whether the capability is granted
   */
  check(capability: Capability, scope: TenantScope): Promise<boolean>;

  /**
   * Audit a privileged action
   * 
   * @param event - Audit event details
   */
  audit(event: AuditEvent): Promise<void>;
}

// ============================================================================
// OBSERVABILITY PRIMITIVE
// ============================================================================

/**
 * Scoped logger interface
 */
export interface ScopedLogger {
  debug(op: string, msg: string, data?: Record<string, unknown>): void;
  info(op: string, msg: string, data?: Record<string, unknown>): void;
  warn(op: string, msg: string, data?: Record<string, unknown>): void;
  error(op: string, msg: string, data?: Record<string, unknown>): void;
}

/**
 * Metrics client interface
 */
export interface MetricsClient {
  /** Increment a counter */
  inc(name: string, labels?: Record<string, string>): void;

  /** Set a gauge value */
  gauge(name: string, value: number, labels?: Record<string, string>): void;

  /** Record a timing */
  timing(name: string, ms: number, labels?: Record<string, string>): void;

  /** Record a histogram value */
  histogram(name: string, value: number, labels?: Record<string, string>): void;
}

/**
 * Observability primitive
 * 
 * Logging and metrics with correlation tracking.
 */
export interface ObsPrimitive {
  /** Scoped logger */
  readonly log: ScopedLogger;

  /** Metrics client */
  readonly metrics: MetricsClient;

  /** Current correlation ID */
  readonly correlationId: string;

  /** Current tenant scope */
  readonly scope: TenantScope;

  /**
   * Create child context with different correlation
   * 
   * @param id - New correlation ID
   * @returns New obs primitive
   */
  withCorrelation(id: string): ObsPrimitive;
}

// ============================================================================
// RNG PRIMITIVE
// ============================================================================

/**
 * Deterministic RNG for game logic
 */
export interface DeterministicRng {
  /** Get next random float [0, 1) */
  random(): number;

  /** Get random integer [min, max] */
  int(min: number, max: number): number;

  /** Weighted random selection */
  weighted<T>(items: Array<{ weight: number; value: T }>): T;

  /** Shuffle array deterministically */
  shuffle<T>(array: T[]): T[];
}

/**
 * RNG primitive
 * 
 * Deterministic random number generation for game mechanics.
 * Seeds are logged for replay capability.
 */
export interface RngPrimitive {
  /**
   * Derive an RNG from seed parts
   * 
   * @param seedParts - Parts to combine into seed
   * @returns Deterministic RNG
   * 
   * @example
   * ```ts
   * const rng = ctx.rng.derive(['battle', battleId, `turn-${turn}`]);
   * const criticalHit = rng.random() < 0.0625; // 1/16 chance
   * ```
   */
  derive(seedParts: string[]): DeterministicRng;
}

// ============================================================================
// STORAGE PRIMITIVE
// ============================================================================

/**
 * Blob metadata
 */
export interface BlobMetadata {
  /** Content type */
  contentType?: string;

  /** Filename hint */
  filename?: string;

  /** Custom metadata */
  custom?: Record<string, string>;
}

/**
 * Storage object with metadata
 */
export interface StorageObject {
  /** Object ID */
  id?: string;

  /** Object namespace */
  namespace: string;

  /** Object key within namespace */
  key: string;

  /** Object data */
  data: unknown;

  /** Object metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Storage primitive
 * 
 * Database-backed object/blob store.
 */
export interface StoragePrimitive {
  /**
   * Store a binary blob
   * 
   * @param data - Blob data
   * @param metadata - Optional metadata
   * @returns Blob ID
   */
  putBlob(data: Buffer, metadata?: BlobMetadata): Promise<string>;

  /**
   * Retrieve a blob
   * 
   * @param id - Blob ID
   * @returns Blob data or null
   */
  getBlob(id: string): Promise<Buffer | null>;

  /**
   * Delete a blob
   * 
   * @param id - Blob ID
   */
  deleteBlob(id: string): Promise<void>;

  /**
   * Store a structured object
   * 
   * @param obj - Object with namespace and key
   * @returns Object ID
   */
  putObject(obj: StorageObject): Promise<string>;

  /**
   * Retrieve an object
   * 
   * @param id - Object ID
   * @returns Object or null
   */
  getObject(id: string): Promise<StorageObject | null>;

  /**
   * Get object by namespace/key
   * 
   * @param namespace - Object namespace
   * @param key - Object key
   * @returns Object or null
   */
  getByKey(namespace: string, key: string): Promise<StorageObject | null>;

  /**
   * Delete an object
   * 
   * @param id - Object ID
   */
  deleteObject(id: string): Promise<void>;
}

// ============================================================================// CAPABILITIES PRIMITIVE (Ring Security)
// ============================================================================

/**
 * Capability grant result
 */
export interface CapabilityCheck {
  /** Whether the capability is granted */
  granted: boolean;

  /** Reason for denial (if not granted) */
  reason?: string;

  /** Expiration time (if granted and temporary) */
  expiresAt?: Date;
}

/**
 * Capabilities primitive — Ring 0-3 security model
 * 
 * Components must assert required capabilities before privileged operations.
 * Kernel enforces capability checks at runtime.
 */
export interface CapabilitiesPrimitive {
  /**
   * Check if component has a capability
   * 
   * @param type - Capability type (e.g., "db.write", "discord.send")
   * @param scope - Tenant scope for the operation
   * @returns Capability check result
   * 
   * @example
   * ```ts
   * const check = await ctx.capabilities.check('db.write', ctx.scope);
   * if (!check.granted) {
   *   throw new Error(`Missing capability: ${check.reason}`);
   * }
   * ```
   */
  check(type: string, scope: TenantScope): Promise<CapabilityCheck>;

  /**
   * Assert a capability (throws if denied)
   * 
   * @param type - Capability type
   * @param scope - Tenant scope
   * @throws If capability is not granted
   */
  assert(type: string, scope: TenantScope): Promise<void>;

  /**
   * List all capabilities for current component
   * 
   * @param scope - Tenant scope
   * @returns Array of capability types
   */
  list(scope: TenantScope): Promise<string[]>;
}

// ============================================================================// COMPONENT CONTEXT
// ============================================================================

/**
 * ComponentContext — The kernel interface for Sensai components
 * 
 * Every handler receives a ComponentContext providing access to all
 * kernel primitives. This is the "syscall" interface.
 * 
 * @example
 * ```ts
 * export const handleBattleStart = runGuarded(
 *   'battle.start',
 *   async (ctx: ComponentContext, interaction: CommandInteraction) => {
 *     // Access database
 *     const trainer = await ctx.db.prisma.trainer.findUnique({
 *       where: { discordId: interaction.user.id }
 *     });
 *     
 *     // Emit export (fact)
 *     await ctx.exports.append({
 *       source: 'game.battles',
 *       type: 'battle.started',
 *       scope: ctx.scope,
 *       payload: { battleId, trainerId: trainer.id },
 *       idempotencyKey: `battle-start-${battleId}`,
 *       occurredAt: new Date(),
 *       correlationId: ctx.obs.correlationId,
 *     });
 *     
 *     // Enqueue background work
 *     await ctx.jobs.enqueue({
 *       kind: 'battle.ai-turn',
 *       scope: ctx.scope,
 *       payload: { battleId },
 *       correlationId: ctx.obs.correlationId,
 *     });
 *     
 *     // Send Discord message via outbox (survives crashes)
 *     await ctx.outbox.send({
 *       destination: 'discord',
 *       topic: 'battle.notification',
 *       key: `channel-${interaction.channelId}`,
 *       scope: ctx.scope,
 *       payload: { channelId: interaction.channelId, content: 'Battle started!' },
 *       correlationId: ctx.obs.correlationId,
 *     });
 *     
 *     // Logging
 *     ctx.obs.log.info('battle-start', 'Battle initiated', { battleId });
 *   }
 * );
 * ```
 */
export interface ComponentContext {
  // === Identity ===

  /**
   * Current tenant scope
   */
  readonly scope: TenantScope;

  /**
   * Component name
   */
  readonly component: string;

  // === Core Primitives ===

  /**
   * Database access
   */
  readonly db: DbPrimitive;

  /**
   * Append-only export log
   */
  readonly exports: ExportsPrimitive;

  /**
   * Background job queue
   */
  readonly jobs: JobsPrimitive;

  /**
   * External message outbox
   */
  readonly outbox: OutboxPrimitive;

  // === System Services ===

  /**
   * Observability (logging + metrics)
   */
  readonly obs: ObsPrimitive;

  /**
   * Deterministic RNG
   */
  readonly rng: RngPrimitive;

  /**
   * Role-based access control
   */
  readonly rbac: RbacPrimitive;

  /**
   * Configuration and feature flags
   */
  readonly config: ConfigPrimitive;

  /**
   * Database-backed object storage
   */
  readonly storage: StoragePrimitive;

  /**
   * Capability checks (Ring 0-3 security model)
   */
  readonly capabilities: CapabilitiesPrimitive;
}

// ============================================================================
// COMPONENT MANIFEST
// ============================================================================

/**
 * Host types where a component can run
 */
export type HostKind = 'bot' | 'worker' | 'cron' | 'cli';

/**
 * Discord handler signature
 */
export type DiscordHandler = (ctx: ComponentContext, ...args: unknown[]) => Promise<void>;

/**
 * Export handler signature
 */
export type ExportHandler = (ctx: ComponentContext, exports: ExportEnvelopeData[]) => Promise<void>;

/**
 * Job handler signature
 */
export type JobHandler = (ctx: ComponentContext, job: LeasedJob) => Promise<JobResult>;

/**
 * HTTP handler signature
 */
export type HttpHandler = (ctx: ComponentContext, req: unknown, res: unknown) => Promise<void>;

/**
 * CLI handler signature
 */
export type CliHandler = (ctx: ComponentContext, args: string[]) => Promise<number>;

/**
 * SensaiComponent — Component manifest definition
 * 
 * Every Sensai component declares its identity, requirements, and handlers.
 * This enables the supervisor to manage component lifecycle.
 */
export interface SensaiComponent {
  // === Identity ===

  /** Component name (e.g., "game.battles") */
  name: string;

  /** Semantic version */
  version: string;

  /** Human-readable description */
  description?: string;

  /** Ring security level: 0=kernel, 1=sensaios, 3=apps (Ring 2 reserved) */
  ringLevel: 0 | 1 | 3;

  // === Deployment ===

  /** Where this component can run */
  hosts: HostKind[];

  /** Other components this depends on */
  dependencies?: string[];

  // === Capabilities (Security) ===

  /** Required capabilities */
  capabilities: {
    /** Database access level */
    db: Array<'read' | 'write' | 'migrate'>;

    /** Discord permissions */
    discord?: Array<'read' | 'send' | 'moderate'>;

    /** Network access */
    network?: Array<'http-egress'>;
  };

  // === Data Ownership ===

  /** Tables/data this component owns */
  owns?: {
    /** Canonical tables (this component is the sole writer) */
    canonical?: string[];

    /** Projection tables (derived read models) */
    projections?: string[];
  };

  // === Resource Budgets ===

  /** Resource limits */
  resources?: {
    /** Maximum cache memory in MB */
    maxCacheMb?: number;

    /** Maximum queue size */
    maxQueueSize?: number;

    /** Maximum concurrent operations */
    maxConcurrency?: number;
  };

  // === Lifecycle Hooks ===

  /** Called when component is loaded */
  onLoad?(ctx: ComponentContext): Promise<void>;

  /** Called when component is enabled */
  onEnable?(ctx: ComponentContext): Promise<void>;

  /** Called when component is disabled */
  onDisable?(ctx: ComponentContext): Promise<void>;

  /** Called when component is unloaded */
  onUnload?(ctx: ComponentContext): Promise<void>;

  // === Handler Bindings ===

  /** Handler registrations */
  handlers?: {
    /** Discord interaction handlers */
    discord?: Record<string, DiscordHandler>;

    /** Export event handlers */
    exports?: Record<string, ExportHandler>;

    /** Job handlers */
    jobs?: Record<string, JobHandler>;

    /** HTTP handlers */
    http?: Record<string, HttpHandler>;

    /** CLI command handlers */
    cli?: Record<string, CliHandler>;
  };
}
