# SensaiOS — SensaiOS Components Architecture

**Document Type:** Architecture Diagram  
**Status:** Current  
**Version:** 1.0.0  
**Last Updated:** 2025-12-30  
**Related:** [SENSAIOS-SYSTEM-OVERVIEW.md](./SENSAIOS-SYSTEM-OVERVIEW.md), [SENSAIOS-KERNEL-DETAIL.md](./SENSAIOS-KERNEL-DETAIL.md), [SENSAIOS-OBSERVABILITY-LAYER.md](./SENSAIOS-OBSERVABILITY-LAYER.md)

---

## Overview

The **SensaiOS Layer** provides the "operating system abstractions" for building components — the runtime that makes PostgreSQL behave like a substrate for distributed applications. This is where Sensai stops being just a library and starts being an **operating system**.

**Architectural Position:**
- **Layer 2** (Operating System) — Sits directly above Kernel (Layer 1)
- NO intermediate layers between SensaiOS and Kernel (direct access to substrate)
- Loads BEFORE Application/Observability (user-space systems depend on OS being ready)
- Provides context injection with 9 kernel primitives to user-space

**Key Principles:**
- **Component Model**: Install/enable/disable/uninstall with proper lifecycle
- **Context Injection**: Every component gets kernel primitives via `ComponentContext`
- **Guarded Execution**: All handlers wrapped with observability + error capture
- **Multi-Tenant Isolation**: Every operation tagged with `TenantScope`
- **Typed Errors**: Structured error taxonomy (1xxx-6xxx) for all failures

---

## Architecture Diagram

**Position in 3-Layer Model:** Layer 2 (Operating System) — Sits directly above Kernel

```
                    ┌──────────────────────────────────┐
                    │   LAYER 3: User Space            │
                    │   Application & Observability    │
                    │   (Load POST-OS)                 │
                    └────────────┬─────────────────────┘
                                 │ Use SensaiOS primitives
                                 ↓
┌──────────────────────────────────────────────────────────────┐
│              LAYER 2: SENSAIOS (Operating System)            │
│    OS Abstractions — Components, Context, Lifecycle          │
│    Sits directly above Kernel with NO intermediate layers    │
└────────────────────┬─────────────────────────────────────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
    ▼                ▼                ▼
┌────────┐    ┌────────────┐    ┌──────────┐
│Registry│    │ Supervisor │    │ Context  │
│        │    │            │    │ Factory  │
└───┬────┘    └─────┬──────┘    └────┬─────┘
    │               │                │
    │ State Machine │ Orchestration  │ Injection
    │               │                │
    ▼               ▼                ▼
┌─────────────────────────────────────────────────┐
│           COMPONENT LIFECYCLE                   │
│                                                 │
│  UNINSTALLED → [install] → INSTALLED (disabled)│
│                               ↓                │
│                          [enable]             │
│                               ↓                │
│                            ENABLED             │
│                               ↓                │
│                          [disable]            │
│                               ↓                │
│                          INSTALLED            │
│                               ↓                │
│                         [uninstall]           │
│                               ↓                │
│                          UNINSTALLED           │
└─────────────────────────────────────────────────┘
                     │
                     │ Direct access to substrate
                     ↓
┌──────────────────────────────────────────────────────────────┐
│         LAYER 1: KERNEL (Mainframe Substrate)                │
│    Metrics, DB control flow, cross-layer parsing → DB        │
│    • 9 primitives: db, exports, jobs, outbox, obs, rng,      │
│      rbac, config, storage                                   │
└──────────────────────────────────────────────────────────────┘

COMPONENT CONTEXT (Kernel Primitives Access)
┌──────────────────────────────────────────┐
│  ComponentContext (syscall interface)    │
│  ┌────────────────────────────────────┐  │
│  │ • db (database + transactions)     │  │
│  │ • exports (append-only event log)  │  │
│  │ • jobs (background work queue)     │  │
│  │ • outbox (external messages)       │  │
│  │ • obs (observability)              │  │
│  │ • rng (deterministic RNG)          │  │
│  │ • rbac (permissions)               │  │
│  │ • config (feature flags)           │  │
│  │ • storage (db-backed files)        │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Injected into every component           │
└──────────────────────────────────────────┘

GUARDED EXECUTION (runGuarded Wrapper)
┌───────────────────────────────────────────┐
│  runGuarded(handler, context)            │
│  ┌─────────────────────────────────────┐ │
│  │ Automatic Injection:                │ │
│  │ • Correlation ID (auto-generated)   │ │
│  │ • Tenant scope (propagated)         │ │
│  │ • Timing metrics (start/end)        │ │
│  │ • Error capture (CanonicalError)    │ │
│  │ • Logging (start/complete/error)    │ │
│  │ • Timeout enforcement (30s default) │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  Used by ALL handler types:              │
│  • Discord handlers                      │
│  • Export handlers                       │
│  • Job handlers                          │
│  • HTTP handlers                         │
│  • CLI handlers                          │
└───────────────────────────────────────────┘

TENANT SCOPE (Multi-Tenant Context)
┌───────────────────────────────────────┐
│  TenantScope (MANDATORY for all ops) │
│  ┌─────────────────────────────────┐ │
│  │ • tenant (guild ID / user ID)   │ │
│  │ • environment (prod/dev/test)   │ │
│  │ • service (service name)        │ │
│  │ • component (subsystem)         │ │
│  │ • instance (worker ID)          │ │
│  └─────────────────────────────────┘ │
│                                       │
│  Propagated via AsyncLocalStorage     │
│  (same pattern as correlation)        │
└───────────────────────────────────────┘

SENSAI ERROR (Typed Error Taxonomy)
┌────────────────────────────────────────┐
│  SensaiError (Canonical Error Type)   │
│  ┌──────────────────────────────────┐ │
│  │ Code Ranges:                     │ │
│  │ • 1xxx: Kernel errors            │ │
│  │ • 2xxx: Database errors          │ │
│  │ • 3xxx: Component errors         │ │
│  │ • 4xxx: Validation errors        │ │
│  │ • 5xxx: External errors          │ │
│  │ • 6xxx: Game errors              │ │
│  └──────────────────────────────────┘ │
│                                        │
│  Structured with context, cause chain │
└────────────────────────────────────────┘
```

---

## Components

### 1. Component Context (`component-context.ts`)

**Purpose**: The "syscall" interface for Sensai components — provides access to all kernel primitives.

**ComponentContext Structure:**
```typescript
interface ComponentContext {
  /** Database access */
  db: DbPrimitive;
  
  /** Append-only event log */
  exports: ExportsPrimitive;
  
  /** Background job queue */
  jobs: JobsPrimitive;
  
  /** External message delivery */
  outbox: OutboxPrimitive;
  
  /** Observability (logs, metrics) */
  obs: ObsPrimitive;
  
  /** Deterministic RNG */
  rng: RngPrimitive;
  
  /** Role-based access control */
  rbac: RbacPrimitive;
  
  /** Configuration + feature flags */
  config: ConfigPrimitive;
  
  /** Database-backed object store */
  storage: StoragePrimitive;
}
```

---

#### 1.1 Database Primitive

**Purpose**: Prisma access + transaction helpers.

```typescript
interface DbPrimitive {
  /** Prisma client instance */
  readonly prisma: PrismaClient;
  
  /** Execute in transaction */
  transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
  
  /** Execute raw SQL */
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}
```

**Usage:**
```typescript
// Query
const trainers = await ctx.db.prisma.trainer.findMany();

// Transaction
await ctx.db.transaction(async (tx) => {
  await tx.trainer.update({ where: { id }, data: { money: 100 } });
  await tx.inventory.create({ data: { trainerId: id, itemId: 1 } });
});

// Raw SQL
const results = await ctx.db.query('SELECT COUNT(*) FROM "Trainer"');
```

---

#### 1.2 Exports Primitive

**Purpose**: Append-only event log for component communication (no direct coupling).

```typescript
interface ExportsPrimitive {
  /** Append event with mandatory scope */
  append(envelope: ExportEnvelopeData): Promise<AppendResult>;
  
  /** Query exports with filters */
  query(filter: ExportFilter): Promise<ExportEnvelope[]>;
  
  /** Get projection offset */
  getOffset(projection: string): Promise<number>;
  
  /** Set projection offset after processing */
  setOffset(projection: string, seq: number): Promise<void>;
  
  /** Consume exports from sequence */
  consumeFrom(
    seq: number,
    types: string[],
    limit?: number
  ): Promise<ExportEnvelope[]>;
}
```

**Export Envelope:**
```typescript
interface ExportEnvelopeData {
  source: string;              // Component name
  type: string;                // Event type
  scope: TenantScope;          // MANDATORY
  idempotencyKey: string;      // Dedup key
  payload: unknown;            // Event data
  occurredAt: Date;            // Event timestamp
  correlationId: string;       // Trace ID
}
```

**Usage:**
```typescript
// Append event
await ctx.exports.append({
  source: 'game.battles',
  type: 'battle.completed',
  scope: ctx.scope,
  idempotencyKey: `battle-${battleId}`,
  payload: { battleId, winnerId, loserId },
  occurredAt: new Date(),
  correlationId: ctx.obs.correlationId,
});

// Query exports
const battleEvents = await ctx.exports.query({
  types: ['battle.completed'],
  fromTime: new Date(Date.now() - 3600000), // Last hour
  limit: 100,
});
```

---

#### 1.3 Jobs Primitive

**Purpose**: Background work queue with retry semantics.

```typescript
interface JobsPrimitive {
  /** Enqueue job with mandatory scope */
  enqueue(envelope: JobEnvelope): Promise<string>;
  
  /** Lease available jobs (respects scope isolation) */
  lease(kinds: string[], limit?: number): Promise<LeasedJob[]>;
  
  /** Mark job completed */
  complete(jobId: string, result: JobResult): Promise<void>;
  
  /** Mark job failed with retry */
  fail(jobId: string, error: SensaiError, retryAfter?: Date): Promise<void>;
}
```

**Usage:**
```typescript
// Enqueue job
const jobId = await ctx.jobs.enqueue({
  kind: 'cache.refresh',
  scope: ctx.scope,
  payload: { cacheKey: 'pokemon:bulbasaur' },
  scheduledFor: new Date(Date.now() + 60000), // 1 minute delay
  correlationId: ctx.obs.correlationId,
});

// Worker: lease jobs
const jobs = await ctx.jobs.lease(['cache.refresh'], 10);
for (const job of jobs) {
  try {
    await processJob(job);
    await ctx.jobs.complete(job.id, { success: true });
  } catch (error) {
    await ctx.jobs.fail(job.id, toCanonicalError(error));
  }
}
```

---

#### 1.4 Outbox Primitive

**Purpose**: External message delivery (Discord, webhooks, etc.) with guaranteed delivery.

```typescript
interface OutboxPrimitive {
  /** Send message with mandatory scope */
  send(envelope: OutboxEnvelope): Promise<string>;
  
  /** Mark message delivered */
  markDelivered(id: string): Promise<void>;
  
  /** Mark message failed */
  markFailed(id: string, error: SensaiError): Promise<void>;
}
```

**Usage:**
```typescript
// Send Discord message
await ctx.outbox.send({
  destination: 'discord',
  topic: 'battle.result',
  key: battleId,
  scope: ctx.scope,
  payload: {
    channelId: '123',
    embed: formatBattleResult(battle),
  },
  correlationId: ctx.obs.correlationId,
});
```

---

#### 1.5 Observability Primitive

**Purpose**: Structured logging + metrics with automatic correlation.

```typescript
interface ObsPrimitive {
  /** Structured logging */
  log: {
    debug(message: string, data?: Record<string, unknown>): void;
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
    error(message: string, data?: Record<string, unknown>): void;
  };
  
  /** Metrics emission */
  metrics: {
    inc(name: string, labels?: Record<string, string>): void;
    gauge(name: string, value: number, labels?: Record<string, string>): void;
    timing(name: string, ms: number, labels?: Record<string, string>): void;
  };
  
  /** Current correlation ID (auto-propagated) */
  correlationId: string;
  
  /** Create child context with new correlation */
  withCorrelation(id: string): ObsPrimitive;
  
  /** Current tenant scope */
  scope: TenantScope;
}
```

**Usage:**
```typescript
// Logging
ctx.obs.log.info('Battle started', { battleId, players: 2 });

// Metrics
ctx.obs.metrics.timing('battle.duration', durationMs);
ctx.obs.metrics.inc('battle.completed', { outcome: 'victory' });

// Child context
const childObs = ctx.obs.withCorrelation('child-123');
childObs.log.info('Sub-operation started');
```

---

### 2. Component Registry (`component-registry.ts`)

**Purpose**: State machine for component lifecycle (install/enable/disable/uninstall).

**Component States:**
```
UNINSTALLED
    ↓ [install]
INSTALLED (disabled)
    ↓ [enable]
ENABLED (active)
    ↓ [disable]
INSTALLED (disabled)
    ↓ [uninstall]
UNINSTALLED
```

**Registry Operations:**
```typescript
class ComponentRegistry {
  /** Install component (validate + register) */
  install(manifest: SensaiComponent): void;
  
  /** Enable component (state: installed → enabled) */
  enable(name: string): void;
  
  /** Disable component (state: enabled → installed) */
  disable(name: string): void;
  
  /** Uninstall component (state: installed → uninstalled) */
  uninstall(name: string): void;
  
  /** Query */
  get(name: string): RegisteredComponent | undefined;
  getEnabled(): RegisteredComponent[];
  getByHost(host: HostKind): RegisteredComponent[];
  getStats(): RegistryStats;
}
```

**Component Manifest:**
```typescript
interface SensaiComponent {
  // Identity
  name: string;                // 'game.battles'
  version: string;             // Semver
  description?: string;
  
  // Deployment
  hosts: HostKind[];           // 'bot' | 'worker' | 'cron' | 'cli'
  dependencies?: string[];     // Other components required
  
  // Capabilities (security)
  capabilities: {
    db: Array<'read' | 'write' | 'migrate'>;
    discord?: Array<'read' | 'send' | 'moderate'>;
    network?: Array<'http-egress'>;
  };
  
  // Data ownership
  owns?: {
    canonical?: string[];      // Tables this component WRITES
    projections?: string[];    // Read models it maintains
  };
  
  // Resource budgets
  resources?: {
    maxCacheMb?: number;
    maxQueueSize?: number;
    maxConcurrency?: number;
  };
  
  // Lifecycle hooks
  onLoad?(ctx: ComponentContext): Promise<void>;
  onEnable?(ctx: ComponentContext): Promise<void>;
  onDisable?(ctx: ComponentContext): Promise<void>;
  onUnload?(ctx: ComponentContext): Promise<void>;
  
  // Handler bindings
  handlers?: {
    discord?: Record<string, DiscordHandler>;
    exports?: Record<string, ExportHandler>;
    jobs?: Record<string, JobHandler>;
    http?: Record<string, HttpHandler>;
    cli?: Record<string, CliHandler>;
  };
}
```

**Usage:**
```typescript
const registry = new ComponentRegistry();

// Register component
registry.install(battleComponent);

// Enable it
registry.enable('game.battles');

// Query
const enabled = registry.getEnabled();
const stats = registry.getStats();
// { total: 5, byState: { enabled: 3, installed: 2 }, byHost: { bot: 4, worker: 1 } }
```

---

### 3. Component Supervisor (`component-supervisor.ts`)

**Purpose**: Orchestrates component lifecycle, handler registration, and boot/shutdown.

**Supervisor Responsibilities:**
- Load and enable components in dependency order
- Register handlers (Discord, exports, jobs, HTTP, CLI)
- Provide handler lookups for runtime dispatch
- Graceful shutdown with proper ordering

**Supervisor Operations:**
```typescript
class ComponentSupervisor {
  /** Register component for loading */
  register(component: SensaiComponent): void;
  
  /** Boot all components (load + enable in order) */
  async boot(): Promise<void>;
  
  /** Graceful shutdown (disable + unload in reverse order) */
  async shutdown(): Promise<void>;
  
  /** Handler lookups */
  getDiscordHandler(name: string): HandlerLookup<DiscordHandler> | undefined;
  getExportHandler(type: string): HandlerLookup<ExportHandler> | undefined;
  getJobHandler(kind: string): HandlerLookup<JobHandler> | undefined;
  getHttpHandler(path: string): HandlerLookup<HttpHandler> | undefined;
  getCliHandler(command: string): HandlerLookup<CliHandler> | undefined;
  
  /** Status */
  getStats(): SupervisorStats;
  isBooted(): boolean;
}
```

**Boot Sequence:**
```typescript
const supervisor = new ComponentSupervisor();

// Register components
supervisor.register(gameCore);
supervisor.register(gameBattles);
supervisor.register(gameEncounters);

// Boot (dependency order: gameCore → gameBattles → gameEncounters)
await supervisor.boot();
// 1. Call onLoad() for each component
// 2. Register handlers for each component
// 3. Call onEnable() for each component
// 4. Mark supervisor as 'ready'

// Runtime: dispatch handlers
const handler = supervisor.getDiscordHandler('battle:attack');
if (handler) {
  await handler.handler(interaction, ctx);
}

// Shutdown (reverse order)
await supervisor.shutdown();
// 1. Mark supervisor as 'shutting-down'
// 2. Call onDisable() for each component (reverse order)
// 3. Unregister handlers
// 4. Call onUnload() for each component
// 5. Mark supervisor as 'shutdown'
```

---

### 4. Context Factory (`context-factory.ts`)

**Purpose**: Create `ComponentContext` instances with kernel primitive bindings.

**Factory Operations:**
```typescript
/** Create context for component */
function createComponentContext(
  component: string,
  scope: TenantScope
): ComponentContext;

/** Get system context (for kernel operations) */
function getSystemContext(): ComponentContext;

/** Configure factory defaults */
function configureContextFactory(config: ContextFactoryConfig): void;
```

**Usage:**
```typescript
// Create context for component
const ctx = createComponentContext('game.battles', {
  tenant: guildId,
  environment: 'production',
  service: 'infinity-gauntlet',
  component: 'battles',
});

// Use primitives
await ctx.db.prisma.battle.create({ data: { ... } });
await ctx.exports.append({ ... });
ctx.obs.log.info('Battle started', { battleId });

// System context (for kernel operations)
const systemCtx = getSystemContext();
```

---

### 5. runGuarded() (`run-guarded.ts`)

**Purpose**: Universal wrapper for all handler invocations with automatic observability.

**What runGuarded() Does:**
- **Correlation ID injection** — Auto-generated or provided
- **Tenant scope propagation** — Via AsyncLocalStorage
- **Timing metrics** — Start/end timestamps
- **Error capture** — All errors → CanonicalError
- **Logging** — Start/complete/error events
- **Timeout enforcement** — 30s default

**Function Signature:**
```typescript
async function runGuarded<T>(
  handler: () => Promise<T>,
  context: RunGuardedContext
): Promise<T>;

interface RunGuardedContext {
  /** Handler name (for logging) */
  name: string;
  
  /** Tenant scope (REQUIRED) */
  scope: TenantScope;
  
  /** Correlation ID (auto-generated if omitted) */
  correlationId?: string;
  
  /** Parent correlation ID (for tracing) */
  parentCorrelationId?: string;
  
  /** Metadata (logged with start/end) */
  metadata?: Record<string, unknown>;
  
  /** Timeout (default 30s) */
  timeoutMs?: number;
  
  /** Whether to rethrow errors (default true) */
  rethrow?: boolean;
  
  /** Custom error handler */
  onError?: (error: CanonicalError) => void | Promise<void>;
}
```

**Usage:**
```typescript
// Wrap any async function
const result = await runGuarded(
  () => battleEngine.startBattle(trainerId, opponentId),
  {
    name: 'battle.start',
    scope: scopeFromInteraction(interaction),
    metadata: { trainerId, opponentId },
  }
);

// With correlation
await runGuarded(
  () => processBattleTurn(battleId, move),
  {
    name: 'battle.turn',
    scope,
    correlationId: parentCorrelationId,
    parentCorrelationId: 'battle-123',
    timeoutMs: 10000, // 10s timeout
  }
);

// Custom error handling
await runGuarded(
  () => sendDiscordMessage(channelId, message),
  {
    name: 'discord.send',
    scope,
    onError: async (error) => {
      await notifyAdmin(error);
    },
  }
);
```

**Correlation ID Access:**
```typescript
// Get current correlation ID from context
const correlationId = getCorrelationId();

// Require correlation ID (throws if outside runGuarded)
const correlationId = requireCorrelationId();
```

---

### 6. Tenant Scope (`tenant-scope.ts`)

**Purpose**: Multi-tenant context that MUST accompany every operation.

**TenantScope Structure:**
```typescript
interface TenantScope {
  /** Tenant identifier (guild ID, user ID, "system") */
  tenant: string;
  
  /** Deployment environment (prod/dev/test) */
  environment: 'production' | 'development' | 'test';
  
  /** Service name */
  service: string;
  
  /** Component within service */
  component: string;
  
  /** Instance identifier (optional) */
  instance?: string;
}
```

**Scope Management:**
```typescript
/** Get current scope from AsyncLocalStorage */
function getCurrentScope(): TenantScope | undefined;

/** Require scope (throws if outside context) */
function requireScope(): TenantScope;

/** Run function with scope */
async function withScopeAsync<T>(
  scope: TenantScope,
  fn: () => Promise<T>
): Promise<T>;

/** System scope (for kernel operations) */
const systemScope: TenantScope;
```

**Usage:**
```typescript
// Create scope from Discord interaction
import { scopeFromInteraction } from '../../app/discord-adapter.js';
const scope = scopeFromInteraction(interaction);

// Use in runGuarded
await runGuarded(
  () => startBattle(trainerId, opponentId),
  { name: 'battle.start', scope }
);

// Manual scope propagation
await withScopeAsync(scope, async () => {
  const currentScope = requireScope();
  console.log('Tenant:', currentScope.tenant);
});

// System operations
await runGuarded(
  () => refreshCache(),
  { name: 'cache.refresh', scope: systemScope }
);
```

---

### 7. SensaiError (`sensai-error.ts`)

**Purpose**: Typed error taxonomy for all Sensai OS errors.

**Error Code Ranges:**
- **1xxx**: Kernel errors (boot, shutdown, primitives)
- **2xxx**: Database errors (connection, transaction, query)
- **3xxx**: Component errors (lifecycle, registry, supervisor)
- **4xxx**: Validation errors (input, schema, business rules)
- **5xxx**: External errors (Discord API, HTTP, third-party)
- **6xxx**: Game errors (battle, encounter, inventory)

**SensaiError Structure:**
```typescript
interface SensaiError extends Error {
  /** Error code (1xxx-6xxx) */
  code: number;
  
  /** Error message */
  message: string;
  
  /** Additional context */
  context?: Record<string, unknown>;
  
  /** Wrapped error (if any) */
  cause?: Error;
  
  /** Tenant scope (if available) */
  scope?: TenantScope;
  
  /** Correlation ID (if available) */
  correlationId?: string;
}
```

**Factory Functions:**
```typescript
/** Create kernel error (1xxx) */
function kernelError(
  code: number,
  message: string,
  context?: Record<string, unknown>,
  cause?: Error
): SensaiError;

/** Create database error (2xxx) */
function databaseError(...): SensaiError;

/** Create component error (3xxx) */
function componentError(...): SensaiError;

/** Create validation error (4xxx) */
function validationError(...): SensaiError;

/** Create external error (5xxx) */
function externalError(...): SensaiError;

/** Create game error (6xxx) */
function gameError(...): SensaiError;
```

**Error Codes:**
```typescript
// Kernel errors (1xxx)
const KERNEL_ERRORS = {
  BOOT_FAILED: 1001,
  BOOT_TIMEOUT: 1002,
  BOOT_ALREADY_INITIALIZED: 1003,
  BOOT_NOT_INITIALIZED: 1004,
  SHUTDOWN_TIMEOUT: 1101,
  CORRELATION_MISSING: 1201,
  SCOPE_MISSING: 1202,
  // ...
};

// Database errors (2xxx)
const DATABASE_ERRORS = {
  CONNECTION_FAILED: 2001,
  CONNECTION_TIMEOUT: 2002,
  TRANSACTION_FAILED: 2101,
  QUERY_FAILED: 2201,
  MIGRATION_FAILED: 2301,
  // ...
};

// Component errors (3xxx)
const COMPONENT_ERRORS = {
  NOT_FOUND: 3001,
  ALREADY_REGISTERED: 3002,
  INVALID_STATE: 3003,
  ENABLE_FAILED: 3101,
  HANDLER_TIMEOUT: 3301,
  // ...
};
```

**Usage:**
```typescript
// Throw kernel error
throw kernelError(
  KERNEL_ERRORS.BOOT_FAILED,
  'Kernel boot failed: database unavailable',
  { reason: 'Connection timeout' }
);

// Wrap existing error
try {
  await db.query('SELECT ...');
} catch (error) {
  throw databaseError(
    DATABASE_ERRORS.QUERY_FAILED,
    'Query failed',
    { sql: 'SELECT ...' },
    error
  );
}

// Convert any error to SensaiError
import { toCanonicalError, isCanonicalError } from './canonical-error.js';

try {
  await riskyOperation();
} catch (error) {
  const canonicalError = toCanonicalError(error);
  if (canonicalError.code >= 2000 && canonicalError.code < 3000) {
    // Database error
    await retryDatabaseOperation();
  }
}
```

---

## Component Model Example

### Complete Component Definition

```typescript
import type { SensaiComponent, ComponentContext } from './component-context.js';

export const battleComponent: SensaiComponent = {
  // Identity
  name: 'game.battles',
  version: '1.0.0',
  description: 'Pokemon battle engine',
  
  // Deployment
  hosts: ['bot', 'worker'],
  dependencies: ['game.core'],
  
  // Capabilities
  capabilities: {
    db: ['read', 'write'],
    discord: ['send'],
  },
  
  // Data ownership
  owns: {
    canonical: ['Battle', 'BattleTurn'],
    projections: ['BattleStats'],
  },
  
  // Resource budgets
  resources: {
    maxCacheMb: 50,
    maxQueueSize: 1000,
    maxConcurrency: 10,
  },
  
  // Lifecycle hooks
  async onLoad(ctx: ComponentContext): Promise<void> {
    ctx.obs.log.info('Loading battle component');
    // Initialize caches, load config
  },
  
  async onEnable(ctx: ComponentContext): Promise<void> {
    ctx.obs.log.info('Enabling battle component');
    // Start workers, subscribe to exports
  },
  
  async onDisable(ctx: ComponentContext): Promise<void> {
    ctx.obs.log.info('Disabling battle component');
    // Stop workers, unsubscribe from exports
  },
  
  async onUnload(ctx: ComponentContext): Promise<void> {
    ctx.obs.log.info('Unloading battle component');
    // Cleanup caches, close connections
  },
  
  // Handler bindings
  handlers: {
    discord: {
      'battle:attack': async (interaction, ctx) => {
        await runGuarded(
          () => handleAttack(interaction, ctx),
          { name: 'battle.attack', scope: scopeFromInteraction(interaction) }
        );
      },
      'battle:switch': async (interaction, ctx) => {
        await runGuarded(
          () => handleSwitch(interaction, ctx),
          { name: 'battle.switch', scope: scopeFromInteraction(interaction) }
        );
      },
    },
    exports: {
      'battle.started': async (envelope, ctx) => {
        await runGuarded(
          () => handleBattleStarted(envelope, ctx),
          { name: 'export.battle.started', scope: envelope.scope }
        );
      },
    },
    jobs: {
      'battle.cleanup': async (job, ctx) => {
        await runGuarded(
          () => cleanupExpiredBattles(job, ctx),
          { name: 'job.battle.cleanup', scope: job.scope }
        );
      },
    },
  },
};
```

---

### Component Registration & Boot

```typescript
import { ComponentSupervisor } from './component-supervisor.js';
import { gameCore, gameBattles, gameEncounters } from './components/index.js';

// Create supervisor
const supervisor = new ComponentSupervisor();

// Register components
supervisor.register(gameCore);
supervisor.register(gameBattles);
supervisor.register(gameEncounters);

// Boot (loads in dependency order)
await supervisor.boot();
// 1. gameCore.onLoad()
// 2. gameBattles.onLoad()
// 3. gameEncounters.onLoad()
// 4. Register all handlers
// 5. gameCore.onEnable()
// 6. gameBattles.onEnable()
// 7. gameEncounters.onEnable()

// Supervisor is now ready
console.log('Supervisor ready:', supervisor.isBooted());

// Runtime: dispatch handler
const handler = supervisor.getDiscordHandler('battle:attack');
if (handler) {
  await handler.handler(interaction, ctx);
}

// Graceful shutdown
await supervisor.shutdown();
// 1. gameEncounters.onDisable()
// 2. gameBattles.onDisable()
// 3. gameCore.onDisable()
// 4. Unregister all handlers
// 5. gameEncounters.onUnload()
// 6. gameBattles.onUnload()
// 7. gameCore.onUnload()
```

---

## Design Principles

### 1. Component Isolation
- Components communicate via exports/jobs/outbox (no direct calls)
- Disabling a component stops behavior without corrupting state
- Each component owns specific database tables (no shared writers)

### 2. Context Injection
- Every component receives `ComponentContext` with kernel primitives
- No global state or singletons (testable, mockable)
- Context propagates via AsyncLocalStorage (no manual threading)

### 3. Guarded Execution
- ALL handlers wrapped with `runGuarded()`
- Automatic correlation, timing, error capture
- Consistent logging across all components

### 4. Multi-Tenant by Default
- Every operation tagged with `TenantScope`
- Scope propagates automatically via AsyncLocalStorage
- Enables per-tenant filtering, isolation, and aggregation

### 5. Typed Errors
- All errors use `SensaiError` with structured codes
- Error code ranges define responsibility boundaries
- Context + cause chain preserved for debugging

### 6. Lifecycle Management
- Clear state machine (uninstalled → installed → enabled)
- Hooks for initialization, startup, shutdown, cleanup
- Dependency order enforced during boot

---

## Extension Points

### Adding a New Component

```typescript
import type { SensaiComponent, ComponentContext } from './component-context.js';

export const myComponent: SensaiComponent = {
  name: 'my-domain.my-component',
  version: '1.0.0',
  hosts: ['bot'],
  capabilities: { db: ['read', 'write'] },
  
  async onEnable(ctx: ComponentContext): Promise<void> {
    ctx.obs.log.info('My component enabled');
  },
  
  handlers: {
    discord: {
      'my:command': async (interaction, ctx) => {
        await runGuarded(
          () => handleMyCommand(interaction, ctx),
          { name: 'my.command', scope: scopeFromInteraction(interaction) }
        );
      },
    },
  },
};

// Register with supervisor
supervisor.register(myComponent);
await supervisor.boot();
```

---

### Adding a New Primitive

```typescript
// 1. Define primitive interface
interface MyPrimitive {
  doSomething(arg: string): Promise<void>;
}

// 2. Extend ComponentContext
interface ComponentContext {
  // ... existing primitives
  myPrimitive: MyPrimitive;
}

// 3. Implement primitive
class MyPrimitiveImpl implements MyPrimitive {
  async doSomething(arg: string): Promise<void> {
    // Implementation
  }
}

// 4. Update context factory
function createComponentContext(...): ComponentContext {
  return {
    // ... existing primitives
    myPrimitive: new MyPrimitiveImpl(),
  };
}
```

---

## Performance Characteristics

### Component Registry
- **Memory**: ~1 KB per component
- **Lookup**: O(1) hash map access
- **State Transitions**: <100μs

### Component Supervisor
- **Boot Time**: ~100ms for 10 components
- **Handler Lookup**: O(1) hash map access (<1μs)
- **Shutdown Time**: ~200ms for 10 components

### runGuarded()
- **Overhead**: ~50μs per invocation
- **Logging**: Async, non-blocking
- **Error Capture**: <10μs
- **Correlation Propagation**: AsyncLocalStorage (zero copy)

### Tenant Scope
- **Memory**: ~100 bytes per scope
- **Propagation**: AsyncLocalStorage (zero copy)
- **Lookup**: O(1) (<1μs)

### SensaiError
- **Creation**: ~10μs
- **Memory**: ~500 bytes (with context)
- **Serialization**: ~20μs

---

## Related Documentation

- **System Overview**: [SENSAIOS-SYSTEM-OVERVIEW.md](./SENSAIOS-SYSTEM-OVERVIEW.md)
- **Kernel Layer**: [SENSAIOS-KERNEL-DETAIL.md](./SENSAIOS-KERNEL-DETAIL.md)
- **Application Layer**: [SENSAIOS-APPLICATION-LAYER.md](./SENSAIOS-APPLICATION-LAYER.md)
- **Observability Layer**: [SENSAIOS-OBSERVABILITY-LAYER.md](./SENSAIOS-OBSERVABILITY-LAYER.md)
- **Implementation**: 
  - `src/sensaios/` — All SensaiOS components
  - `src/sensaios/component-context.ts` — Primitive interfaces
  - `src/sensaios/component-registry.ts` — State machine
  - `src/sensaios/component-supervisor.ts` — Orchestration
  - `src/sensaios/run-guarded.ts` — Handler wrapper
  - `src/sensaios/tenant-scope.ts` — Multi-tenant context
  - `src/sensaios/sensai-error.ts` — Error taxonomy

---

**END OF DOCUMENT**
