/**
 * SensaiOS Context Factory — ComponentContext Creation
 * 
 * Factory functions to create ComponentContext instances for different
 * execution contexts: Discord interactions, worker jobs, system operations.
 * 
 * @module sensaios/context-factory
 * @since 2025-12-29
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Interaction, Guild } from 'discord.js';
import type { TenantScope } from './tenant-scope.js';
import type {
  ComponentContext,
  DbPrimitive,
  ExportsPrimitive,
  JobsPrimitive,
  OutboxPrimitive,
  ConfigPrimitive,
  RbacPrimitive,
  ObsPrimitive,
  RngPrimitive,
  StoragePrimitive,
  CapabilitiesPrimitive,
  CapabilityCheck,
  ScopedLogger,
  MetricsClient,
  DeterministicRng,
  ExportEnvelopeData,
  AppendResult,
  ExportFilter,
  JobEnvelope,
  LeasedJob,
  JobResult,
  OutboxEnvelope,
  ConfigScope,
  Capability,
  AuditEvent,
  BlobMetadata,
  StorageObject,
} from './component-context.js';
import type { CanonicalError } from './canonical-error.js';
import { scopedLogger } from '../observability/envelope/console.js';
import { databaseError, DATABASE_ERRORS } from './sensai-error.js';

// ============================================================================
// DETERMINISTIC RNG IMPLEMENTATION
// ============================================================================

/**
 * Simple seeded PRNG (Mulberry32)
 * Used for deterministic game mechanics that can be replayed.
 */
function createSeededRng(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash string to seed number
 */
function hashSeed(parts: string[]): number {
  const str = parts.join(':');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Create deterministic RNG from seed parts
 */
function createDeterministicRng(seedParts: string[]): DeterministicRng {
  const nextRandom = createSeededRng(hashSeed(seedParts));

  return {
    random: nextRandom,

    int(min: number, max: number): number {
      return Math.floor(nextRandom() * (max - min + 1)) + min;
    },

    weighted<T>(items: Array<{ weight: number; value: T }>): T {
      const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
      let random = nextRandom() * totalWeight;

      for (const item of items) {
        random -= item.weight;
        if (random <= 0) {
          return item.value;
        }
      }

      return items[items.length - 1].value;
    },

    shuffle<T>(array: T[]): T[] {
      const result = [...array];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(nextRandom() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    },
  };
}

// ============================================================================
// STUB IMPLEMENTATIONS
// ============================================================================

const log = scopedLogger('sensaios-context');

/**
 * Create a stub database primitive
 * 
 * @param prisma - Prisma client instance
 */
export function createDbPrimitive(prisma: PrismaClient): DbPrimitive {
  return {
    prisma,

    async transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
      return prisma.$transaction(fn as Parameters<typeof prisma.$transaction>[0]) as Promise<T>;
    },

    async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
      return prisma.$queryRawUnsafe(sql, ...(params ?? [])) as Promise<T[]>;
    },
  };
}

/**
 * Create a stub exports primitive (logs operations, no persistence)
 */
export function createExportsPrimitiveStub(_scope: TenantScope, _correlationId: string): ExportsPrimitive {
  // In-memory sequence counter (stub)
  let seq = 0;
  const offsets = new Map<string, number>();

  return {
    async append(envelope: ExportEnvelopeData): Promise<AppendResult> {
      seq++;
      log.debug('exports.append', `[STUB] Export appended: ${envelope.type}`, {
        seq,
        source: envelope.source,
        type: envelope.type,
        idempotencyKey: envelope.idempotencyKey,
        correlationId: envelope.correlationId,
      });
      return { seq, duplicate: false };
    },

    async query(filter: ExportFilter): Promise<ExportEnvelopeData[]> {
      log.debug('exports.query', '[STUB] Export query (returning empty)', { filter });
      return [];
    },

    async getOffset(projection: string): Promise<number> {
      return offsets.get(projection) ?? 0;
    },

    async setOffset(projection: string, seqNum: number): Promise<void> {
      offsets.set(projection, seqNum);
      log.debug('exports.setOffset', `[STUB] Offset set for ${projection}`, { seq: seqNum });
    },

    async consumeFrom(fromSeq: number, types: string[], limit = 100): Promise<ExportEnvelopeData[]> {
      log.debug('exports.consumeFrom', '[STUB] Consume from (returning empty)', { fromSeq, types, limit });
      return [];
    },
  };
}

/**
 * Create a stub jobs primitive (logs operations, no queue)
 */
export function createJobsPrimitiveStub(_scope: TenantScope, _correlationId: string): JobsPrimitive {
  return {
    async enqueue(envelope: JobEnvelope): Promise<string> {
      const jobId = randomUUID();
      log.debug('jobs.enqueue', `[STUB] Job enqueued: ${envelope.kind}`, {
        jobId,
        kind: envelope.kind,
        correlationId: envelope.correlationId,
        scheduledFor: envelope.scheduledFor?.toISOString(),
      });
      return jobId;
    },

    async lease(kinds: string[], limit = 10): Promise<LeasedJob[]> {
      log.debug('jobs.lease', '[STUB] Jobs lease (returning empty)', { kinds, limit });
      return [];
    },

    async complete(jobId: string, result: JobResult): Promise<void> {
      log.debug('jobs.complete', `[STUB] Job completed: ${jobId}`, {
        jobId,
        durationMs: result.durationMs,
      });
    },

    async fail(jobId: string, error: CanonicalError, retryAfter?: Date): Promise<void> {
      log.debug('jobs.fail', `[STUB] Job failed: ${jobId}`, {
        jobId,
        errorCode: error.code,
        retryAfter: retryAfter?.toISOString(),
      });
    },
  };
}

/**
 * Create a stub outbox primitive (logs operations, no delivery)
 */
export function createOutboxPrimitiveStub(_scope: TenantScope, _correlationId: string): OutboxPrimitive {
  return {
    async send(envelope: OutboxEnvelope): Promise<string> {
      const messageId = randomUUID();
      log.debug('outbox.send', `[STUB] Outbox message: ${envelope.topic}`, {
        messageId,
        destination: envelope.destination,
        topic: envelope.topic,
        key: envelope.key,
        correlationId: envelope.correlationId,
      });
      return messageId;
    },

    async markDelivered(id: string): Promise<void> {
      log.debug('outbox.markDelivered', `[STUB] Message delivered: ${id}`);
    },

    async markFailed(id: string, error: CanonicalError): Promise<void> {
      log.debug('outbox.markFailed', `[STUB] Message failed: ${id}`, {
        errorCode: error.code,
      });
    },
  };
}

/**
 * Create a stub config primitive
 */
export function createConfigPrimitiveStub(): ConfigPrimitive {
  const store = new Map<string, unknown>();

  return {
    async get<T>(key: string, _scope?: ConfigScope): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },

    async set<T>(key: string, value: T, _scope?: ConfigScope): Promise<void> {
      store.set(key, value);
    },

    async getComponentConfig<T>(component: string): Promise<T> {
      return (store.get(`component:${component}`) ?? {}) as T;
    },

    async getFeatureFlag(flag: string, _scope?: ConfigScope): Promise<boolean> {
      return store.get(`flag:${flag}`) === true;
    },
  };
}

/**
 * Create a stub RBAC primitive (allows all operations)
 */
export function createRbacPrimitiveStub(scope: TenantScope, correlationId: string): RbacPrimitive {
  return {
    async assert(_capability: Capability, _scope: TenantScope): Promise<void> {
      // Stub: allow all
    },

    async check(_capability: Capability, _scope: TenantScope): Promise<boolean> {
      return true; // Stub: allow all
    },

    async audit(event: AuditEvent): Promise<void> {
      log.debug('rbac.audit', `[STUB] Audit: ${event.action}`, {
        actorType: event.actor.type,
        actorId: event.actor.id,
        result: event.result,
        correlationId,
      });
    },
  };
}

/**
 * Create a stub storage primitive (in-memory)
 */
export function createStoragePrimitiveStub(): StoragePrimitive {
  const blobs = new Map<string, { data: Buffer; metadata?: BlobMetadata }>();
  const objects = new Map<string, StorageObject>();
  const keyIndex = new Map<string, string>(); // namespace:key -> id

  return {
    async putBlob(data: Buffer, metadata?: BlobMetadata): Promise<string> {
      const id = randomUUID();
      blobs.set(id, { data, metadata });
      return id;
    },

    async getBlob(id: string): Promise<Buffer | null> {
      return blobs.get(id)?.data ?? null;
    },

    async deleteBlob(id: string): Promise<void> {
      blobs.delete(id);
    },

    async putObject(obj: StorageObject): Promise<string> {
      const id = obj.id ?? randomUUID();
      const stored = { ...obj, id };
      objects.set(id, stored);
      keyIndex.set(`${obj.namespace}:${obj.key}`, id);
      return id;
    },

    async getObject(id: string): Promise<StorageObject | null> {
      return objects.get(id) ?? null;
    },

    async getByKey(namespace: string, key: string): Promise<StorageObject | null> {
      const id = keyIndex.get(`${namespace}:${key}`);
      if (!id) return null;
      return objects.get(id) ?? null;
    },

    async deleteObject(id: string): Promise<void> {
      const obj = objects.get(id);
      if (obj) {
        keyIndex.delete(`${obj.namespace}:${obj.key}`);
        objects.delete(id);
      }
    },
  };
}

/**
 * Create an observability primitive
 */
export function createObsPrimitive(
  scope: TenantScope,
  correlationId: string,
  componentName: string
): ObsPrimitive {
  const componentLogger = scopedLogger(`sensaios-${componentName}`);

  const createLogger = (cid: string): ScopedLogger => ({
    debug(op, msg, data) {
      componentLogger.debug(op, msg, { ...data, correlationId: cid, tenant: scope.tenant });
    },
    info(op, msg, data) {
      componentLogger.info(op, msg, { ...data, correlationId: cid, tenant: scope.tenant });
    },
    warn(op, msg, data) {
      componentLogger.warn(op, msg, { ...data, correlationId: cid, tenant: scope.tenant });
    },
    error(op, msg, data) {
      componentLogger.error(op, msg, { ...data, correlationId: cid, tenant: scope.tenant });
    },
  });

  // Stub metrics client
  const metrics: MetricsClient = {
    inc(name, labels) {
      log.debug('metrics.inc', `[STUB] Counter: ${name}`, { labels });
    },
    gauge(name, value, labels) {
      log.debug('metrics.gauge', `[STUB] Gauge: ${name}=${value}`, { labels });
    },
    timing(name, ms, labels) {
      log.debug('metrics.timing', `[STUB] Timing: ${name}=${ms}ms`, { labels });
    },
    histogram(name, value, labels) {
      log.debug('metrics.histogram', `[STUB] Histogram: ${name}=${value}`, { labels });
    },
  };

  const createObs = (cid: string): ObsPrimitive => ({
    log: createLogger(cid),
    metrics,
    correlationId: cid,
    scope,
    withCorrelation(id: string) {
      return createObs(id);
    },
  });

  return createObs(correlationId);
}

/**
 * Create an RNG primitive
 */
export function createRngPrimitive(): RngPrimitive {
  return {
    derive(seedParts: string[]): DeterministicRng {
      return createDeterministicRng(seedParts);
    },
  };
}

/**
 * Create a capabilities primitive stub (for testing/development)
 */
export function createCapabilitiesPrimitiveStub(componentName: string): CapabilitiesPrimitive {
  // In-memory capability grants for stub
  const grants = new Map<string, { type: string; scope: TenantScope; expiresAt?: Date }>();

  return {
    async check(type: string, scope: TenantScope): Promise<CapabilityCheck> {
      const key = `${componentName}:${type}:${scope.tenant}`;
      const grant = grants.get(key);

      if (!grant) {
        return {
          granted: false,
          reason: `No capability grant for ${componentName} to perform ${type}`,
        };
      }

      if (grant.expiresAt && grant.expiresAt < new Date()) {
        return {
          granted: false,
          reason: `Capability ${type} expired at ${grant.expiresAt.toISOString()}`,
        };
      }

      return {
        granted: true,
        expiresAt: grant.expiresAt,
      };
    },

    async assert(type: string, scope: TenantScope): Promise<void> {
      const check = await this.check(type, scope);
      if (!check.granted) {
        throw new Error(`Capability denied: ${check.reason}`);
      }
    },

    async list(scope: TenantScope): Promise<string[]> {
      const result: string[] = [];
      for (const [key, grant] of grants.entries()) {
        if (key.startsWith(`${componentName}:`) && grant.scope.tenant === scope.tenant) {
          if (!grant.expiresAt || grant.expiresAt > new Date()) {
            result.push(grant.type);
          }
        }
      }
      return result;
    },
  };
}

// ============================================================================
// CONTEXT FACTORY OPTIONS
// ============================================================================

/**
 * Options for creating a ComponentContext
 */
export interface CreateContextOptions {
  /** Component name */
  component: string;

  /** Tenant scope */
  scope: TenantScope;

  /** Correlation ID (auto-generated if not provided) */
  correlationId?: string;

  /** Prisma client for database access */
  prisma?: PrismaClient;

  /** Override primitives (for testing) */
  overrides?: Partial<{
    db: DbPrimitive;
    exports: ExportsPrimitive;
    jobs: JobsPrimitive;
    outbox: OutboxPrimitive;
    config: ConfigPrimitive;
    rbac: RbacPrimitive;
    obs: ObsPrimitive;
    rng: RngPrimitive;
    storage: StoragePrimitive;
    capabilities: CapabilitiesPrimitive;
  }>;
}

// ============================================================================
// CONTEXT FACTORY
// ============================================================================

/**
 * Create a ComponentContext with all kernel primitives
 * 
 * This is the main factory for creating execution contexts.
 * Use the specialized helpers for common scenarios.
 * 
 * @param options - Context creation options
 * @returns ComponentContext instance
 * 
 * @example
 * ```ts
 * const ctx = createComponentContext({
 *   component: 'game.battles',
 *   scope: { tenant: 'guild-123', environment: 'production', service: 'bot', component: 'battles' },
 *   prisma: prismaClient,
 * });
 * ```
 */
export function createComponentContext(options: CreateContextOptions): ComponentContext {
  const correlationId = options.correlationId ?? randomUUID();
  const { scope, component, prisma, overrides = {} } = options;

  // Create default primitives (or use overrides)
  const db = overrides.db ?? (prisma ? createDbPrimitive(prisma) : createDbPrimitiveStub());
  const exports = overrides.exports ?? createExportsPrimitiveStub(scope, correlationId);
  const jobs = overrides.jobs ?? createJobsPrimitiveStub(scope, correlationId);
  const outbox = overrides.outbox ?? createOutboxPrimitiveStub(scope, correlationId);
  const config = overrides.config ?? createConfigPrimitiveStub();
  const rbac = overrides.rbac ?? createRbacPrimitiveStub(scope, correlationId);
  const obs = overrides.obs ?? createObsPrimitive(scope, correlationId, component);
  const rng = overrides.rng ?? createRngPrimitive();
  const storage = overrides.storage ?? createStoragePrimitiveStub();
  const capabilities = overrides.capabilities ?? createCapabilitiesPrimitiveStub(component);

  return {
    scope,
    component,
    db,
    exports,
    jobs,
    outbox,
    obs,
    rng,
    rbac,
    config,
    storage,
    capabilities,
  };
}

/**
 * Stub database primitive (for contexts without Prisma)
 */
function createDbPrimitiveStub(): DbPrimitive {
  return {
    get prisma(): PrismaClient {
      throw databaseError(
        DATABASE_ERRORS.NOT_AVAILABLE,
        'Database not available in this context. Provide prisma option to createComponentContext.'
      );
    },

    async transaction<T>(_fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
      throw databaseError(
        DATABASE_ERRORS.NOT_AVAILABLE,
        'Database transaction not available in this context.'
      );
    },

    async query<T>(_sql: string, _params?: unknown[]): Promise<T[]> {
      throw databaseError(
        DATABASE_ERRORS.NOT_AVAILABLE,
        'Database query not available in this context.'
      );
    },
  };
}

// ============================================================================
// SPECIALIZED CONTEXT HELPERS
// ============================================================================

/**
 * Detect environment from NODE_ENV
 */
function detectEnvironment(): 'production' | 'staging' | 'development' {
  const env = process.env.NODE_ENV?.toLowerCase();
  if (env === 'production') return 'production';
  if (env === 'staging') return 'staging';
  return 'development';
}

/**
 * Create context from a Discord interaction
 * 
 * @param interaction - Discord interaction
 * @param component - Component name
 * @param prisma - Optional Prisma client
 * @returns ComponentContext
 * 
 * @example
 * ```ts
 * const ctx = contextFromInteraction(interaction, 'game.battles', prisma);
 * ```
 */
export function contextFromInteraction(
  interaction: Interaction,
  component: string,
  prisma?: PrismaClient
): ComponentContext {
  const scope: TenantScope = {
    tenant: interaction.guildId ?? `user:${interaction.user.id}`,
    environment: detectEnvironment(),
    service: 'infinity-gauntlet',
    component,
  };

  return createComponentContext({
    component,
    scope,
    prisma,
  });
}

/**
 * Create context from a guild
 * 
 * @param guild - Discord guild
 * @param component - Component name
 * @param prisma - Optional Prisma client
 * @returns ComponentContext
 */
export function contextFromGuild(
  guild: Guild,
  component: string,
  prisma?: PrismaClient
): ComponentContext {
  const scope: TenantScope = {
    tenant: guild.id,
    environment: detectEnvironment(),
    service: 'infinity-gauntlet',
    component,
  };

  return createComponentContext({
    component,
    scope,
    prisma,
  });
}

/**
 * Create context for a worker job
 * 
 * @param workerName - Worker name
 * @param tenantId - Tenant ID (guild or system)
 * @param prisma - Optional Prisma client
 * @param correlationId - Optional correlation ID
 * @returns ComponentContext
 * 
 * @example
 * ```ts
 * const ctx = contextFromWorker('cache-worker', 'system', prisma);
 * ```
 */
export function contextFromWorker(
  workerName: string,
  tenantId: string,
  prisma?: PrismaClient,
  correlationId?: string
): ComponentContext {
  const scope: TenantScope = {
    tenant: tenantId,
    environment: detectEnvironment(),
    service: 'infinity-gauntlet',
    component: workerName,
    instance: process.env.RENDER_INSTANCE_ID,
  };

  return createComponentContext({
    component: workerName,
    scope,
    prisma,
    correlationId,
  });
}

/**
 * Create context for system operations
 * 
 * @param component - Component name
 * @param prisma - Optional Prisma client
 * @returns ComponentContext
 * 
 * @example
 * ```ts
 * const ctx = systemContext('scheduler', prisma);
 * ```
 */
export function systemContext(
  component: string,
  prisma?: PrismaClient
): ComponentContext {
  const scope: TenantScope = {
    tenant: 'system',
    environment: detectEnvironment(),
    service: 'infinity-gauntlet',
    component,
  };

  return createComponentContext({
    component,
    scope,
    prisma,
  });
}

/**
 * Create context for CLI operations
 * 
 * @param commandName - CLI command name
 * @param prisma - Optional Prisma client
 * @returns ComponentContext
 */
export function contextFromCli(
  commandName: string,
  prisma?: PrismaClient
): ComponentContext {
  const scope: TenantScope = {
    tenant: 'system',
    environment: detectEnvironment(),
    service: 'infinity-gauntlet-cli',
    component: commandName,
  };

  return createComponentContext({
    component: commandName,
    scope,
    prisma,
  });
}

/**
 * Create a test context with all stubs
 * 
 * @param component - Component name (default: 'test')
 * @param scopeOverrides - Override scope values
 * @returns ComponentContext with all stub implementations
 * 
 * @example
 * ```ts
 * const ctx = createTestContext('game.battles');
 * // All primitives are stubs that log operations
 * ```
 */
export function createTestContext(
  component = 'test',
  scopeOverrides?: Partial<TenantScope>
): ComponentContext {
  const scope: TenantScope = {
    tenant: 'test-guild-123',
    environment: 'development',
    service: 'test-service',
    component,
    ...scopeOverrides,
  };

  return createComponentContext({
    component,
    scope,
    // No prisma = stub db
  });
}
