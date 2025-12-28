/**
 * Sensai Kernel - TypeScript Type Definitions
 * 
 * Core interfaces for the Sensai component system.
 * These types define the contracts between components and the kernel.
 * 
 * @module kernel/types
 */

// ═══════════════════════════════════════════════════════════════════════════
// Host & Component Model
// ═══════════════════════════════════════════════════════════════════════════

export type HostKind = 'bot' | 'worker' | 'cron' | 'cli';

export type ComponentScopeType = 'global' | 'host' | 'guild';

export type ComponentStatus = 'installed' | 'enabled' | 'disabled' | 'failed';

export interface ComponentManifest {
  // === Identity ===
  name: string;                          // 'security.guard', 'system.cache-refresh'
  version: string;                       // Semver: '1.2.3'
  description?: string;

  // === Deployment ===
  hosts: HostKind[];                     // Where can this run?
  dependencies?: string[];               // Other components required

  // === Capabilities (Security) ===
  capabilities: {
    db: Array<'read' | 'write' | 'migrate'>;
    discord?: Array<'read' | 'send' | 'moderate'>;
    network?: Array<'http-egress'>;
  };

  // === Data Ownership ===
  owns?: {
    canonical?: string[];                // Tables this component writes
    projections?: string[];              // Read models it maintains
  };

  // === What It Provides ===
  provides?: {
    exports?: string[];                  // Export types it emits
    jobs?: string[];                     // Job kinds it processes
    commands?: string[];                 // Discord slash commands
    routes?: string[];                   // HTTP endpoints
    cliCommands?: string[];              // CLI commands
  };

  // === Resource Budgets ===
  budget?: {
    maxCacheMb?: number;                 // Memory cache limit
    maxConcurrency?: number;             // Concurrent operations limit
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Export Log (Layer 2) - Append-Only Event Log
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Export envelope - the standard format for all events entering the system.
 * 
 * The Golden Invariant:
 * - Clients append exports
 * - Workers transform exports
 * - Postgres is the truth
 * - Everything else is a view
 */
export interface ExportEnvelope {
  id?: string;                    // Generated if not provided
  seq?: number;                   // Assigned on append (BIGSERIAL)
  source: string;                 // 'discord' | 'worker' | 'admin' | component name
  type: string;                   // 'player.action.walk' | 'battle.completed'
  schemaVersion?: number;         // Schema evolution (default: 1)
  idempotencyKey: string;         // Prevents duplicate ingestion
  payload: Record<string, unknown>;
  occurredAt: Date;
  correlationId: string;
  parentCorrelationId?: string;
  signature?: string;             // Optional HMAC
}

export interface AppendResult {
  id: string;
  seq: number;  // Monotonic sequence for ordering
}

export interface ExportFilter {
  types?: string[];
  source?: string;
  fromSeq?: number;               // More efficient than fromId
  toSeq?: number;
  limit?: number;
}

/**
 * Exports Primitive - Core interface for the Export Log
 * 
 * Provides append-only event ingestion with:
 * - Idempotent ingestion (dedupe by source + type + idempotencyKey)
 * - Monotonic sequencing for stable ordering
 * - Worker checkpoint tracking via offsets
 * - Efficient projection consumption
 */
export interface ExportsPrimitive {
  /**
   * Append a new export to the log.
   * Idempotent - returns existing export if duplicate.
   */
  append(envelope: ExportEnvelope): Promise<AppendResult>;

  /**
   * Query exports by filter.
   * Use fromSeq/toSeq for efficient range queries.
   */
  query(filter: ExportFilter): Promise<ExportEnvelope[]>;

  /**
   * Get last processed seq for a projection.
   * Returns 0 if projection never ran.
   */
  getOffset(projection: string): Promise<number>;

  /**
   * Set last processed seq for a projection.
   * Used for checkpoint/resume semantics.
   */
  setOffset(projection: string, seq: number): Promise<void>;

  /**
   * Consume exports from a seq onwards.
   * Efficient for projection workers - single query with types filter.
   * 
   * @param seq - Start from this sequence (inclusive)
   * @param types - Filter by export types
   * @param limit - Max results (default: 100)
   */
  consumeFrom(seq: number, types: string[], limit?: number): Promise<ExportEnvelope[]>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Job Queue (Layer 3) - Asynchronous Work Queue
// ═══════════════════════════════════════════════════════════════════════════

export interface JobEnvelope {
  kind: string;                   // 'PROJECT_DASHBOARD' | 'DELIVER_MESSAGE'
  payload: Record<string, unknown>;
  runAfter?: Date;                // Delayed execution
  maxAttempts?: number;           // Default: 3
  priority?: number;              // Higher = sooner (default: 0)
  idempotencyKey?: string;        // Optional dedupe
  partitionKey?: string;          // Entity-level serialization
}

export interface LeasedJob {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  leasedUntil: Date;
}

export interface JobResult {
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Jobs Primitive - Work queue for background processing
 */
export interface JobsPrimitive {
  enqueue(envelope: JobEnvelope): Promise<string>;
  lease(kinds: string[], limit?: number): Promise<LeasedJob[]>;
  complete(jobId: string, result: JobResult): Promise<void>;
  fail(jobId: string, error: Error, retryAfter?: Date): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Outbox (Layer 4) - External Delivery Queue
// ═══════════════════════════════════════════════════════════════════════════

export interface OutboxEnvelope {
  destination: 'discord' | 'webhook' | 'email' | 'slack';
  topic: string;                  // Channel ID, webhook URL, etc.
  key?: string;                   // Idempotency key for destination
  payload: Record<string, unknown>;
  correlationId: string;
}

/**
 * Outbox Primitive - External message delivery
 */
export interface OutboxPrimitive {
  send(envelope: OutboxEnvelope): Promise<string>;
  markDelivered(id: string): Promise<void>;
  markFailed(id: string, error: Error): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Configuration (Layer 5) - Scoped Configuration Management
// ═══════════════════════════════════════════════════════════════════════════

export type ConfigScope = 
  | { type: 'global' }
  | { type: 'host'; hostId: string }
  | { type: 'guild'; guildId: string };

/**
 * Config Primitive - Hierarchical configuration
 */
export interface ConfigPrimitive {
  get<T>(key: string, scope?: ConfigScope): Promise<T | undefined>;
  set<T>(key: string, value: T, scope?: ConfigScope): Promise<void>;
  getComponentConfig<T>(component: string): Promise<T>;
  getFeatureFlag(flag: string, scope?: ConfigScope): Promise<boolean>;
}

// ═══════════════════════════════════════════════════════════════════════════
// RBAC (Layer 6) - Role-Based Access Control
// ═══════════════════════════════════════════════════════════════════════════

export type Capability = 
  | 'db.read' | 'db.write' | 'db.migrate'
  | 'discord.read' | 'discord.send' | 'discord.moderate'
  | 'network.http-egress'
  | 'admin.config' | 'admin.components';

export interface Scope {
  type: 'global' | 'host' | 'guild';
  id?: string;
}

export interface AuditEvent {
  actor: { type: 'user' | 'system'; id: string };
  action: string;
  resource: string;
  outcome: 'success' | 'denied' | 'error';
  metadata?: Record<string, unknown>;
}

/**
 * RBAC Primitive - Permission checking and auditing
 */
export interface RbacPrimitive {
  assert(capability: Capability, scope: Scope): Promise<void>;  // Throws if denied
  check(capability: Capability, scope: Scope): Promise<boolean>;
  audit(event: AuditEvent): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Observability (Layer 7) - Structured Logging & Metrics
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Obs Primitive - Structured logging with correlation
 */
export interface ObsPrimitive {
  log: {
    debug(data: Record<string, unknown>, msg?: string): void;
    info(data: Record<string, unknown>, msg?: string): void;
    warn(data: Record<string, unknown>, msg?: string): void;
    error(data: Record<string, unknown>, msg?: string): void;
  };
  metrics: {
    inc(name: string, labels?: Record<string, string>): void;
    gauge(name: string, value: number, labels?: Record<string, string>): void;
    timing(name: string, ms: number, labels?: Record<string, string>): void;
  };
  correlationId: string;
  withCorrelation(id: string): ObsPrimitive;
}

// ═══════════════════════════════════════════════════════════════════════════
// Deterministic RNG (Layer 8) - Reproducible Randomness
// ═══════════════════════════════════════════════════════════════════════════

export interface DeterministicRng {
  random(): number;           // [0, 1)
  int(min: number, max: number): number;
  pick<T>(array: T[]): T;
  shuffle<T>(array: T[]): T[];
  seed: string;               // For audit/replay
}

/**
 * RNG Primitive - Deterministic random number generation
 */
export interface RngPrimitive {
  derive(seedParts: string[]): DeterministicRng;
}

// ═══════════════════════════════════════════════════════════════════════════
// Object Store (Layer 9) - Blob Storage
// ═══════════════════════════════════════════════════════════════════════════

export interface BlobMetadata {
  contentType?: string;
  encoding?: string;
  tags?: Record<string, string>;
}

export interface StorageObject {
  id?: string;
  owner: string;              // Component name
  type: string;               // 'heap-snapshot' | 'battle-replay'
  blobId: string;
  metadata: Record<string, unknown>;
}

/**
 * Storage Primitive - Blob and object management
 */
export interface StoragePrimitive {
  putBlob(data: Buffer, metadata?: BlobMetadata): Promise<string>;  // Returns blob ID
  getBlob(id: string): Promise<Buffer | null>;
  deleteBlob(id: string): Promise<void>;
  putObject(obj: StorageObject): Promise<string>;
  getObject(id: string): Promise<StorageObject | null>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Kernel Context - All Primitives Available to Components
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Kernel Context - The full set of primitives available to components.
 * 
 * This is the "syscall" interface - components ONLY interact with the kernel
 * through these primitives. No direct database access, no direct Discord API calls.
 */
export interface KernelContext {
  exports: ExportsPrimitive;
  jobs: JobsPrimitive;
  outbox: OutboxPrimitive;
  config: ConfigPrimitive;
  rbac: RbacPrimitive;
  obs: ObsPrimitive;
  rng: RngPrimitive;
  storage: StoragePrimitive;
}
