# Sensai OS — Final Architecture Specification

**Version:** 1.1.2  
**Status:** CANONICAL — Authoritative System Design  
**Authority:** Project Leadership (DRIPTVDD)  
**Created:** December 28, 2025  
**Last Updated:** December 28, 2025

---

## Executive Summary

Sensai is the **standard operating system** for Pokémon Infinity Gauntlet. It is NOT "Linux, but SQL" — it is a **runtime + contracts** that make the database behave like an operating system substrate.

This document is the canonical, authoritative specification for all Sensai architecture decisions. It consolidates and supersedes all previous design documents.

---

## Table of Contents

1. [The Golden Invariant](#1-the-golden-invariant)
2. [Core Principles](#2-core-principles)
3. [Layered Architecture](#3-layered-architecture)
4. [Kernel Primitives](#4-kernel-primitives)
5. [Component Model](#5-component-model)
6. [Data Ownership](#6-data-ownership)
7. [Concurrency Model](#7-concurrency-model)
8. [Discord I/O Policy](#8-discord-io-policy)
9. [Multi-Tenant Architecture](#9-multi-tenant-architecture)
10. [Observability-First Boot](#10-observability-first-boot)
11. [Error Taxonomy](#11-error-taxonomy)
12. [Guarded Execution](#12-guarded-execution)
13. [Component Lifecycle](#13-component-lifecycle)
14. [File Structure](#14-file-structure)
15. [Non-Negotiables](#15-non-negotiables)
16. [Implementation Checklist](#16-implementation-checklist)
17. [Migration Guide](#17-migration-guide)
18. [Reference Documentation](#18-reference-documentation)

---

## 1. The Golden Invariant

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│   CLIENTS APPEND EXPORTS.                                        │
│   WORKERS TRANSFORM EXPORTS.                                     │
│   POSTGRES IS THE TRUTH.                                         │
│   EVERYTHING ELSE IS A VIEW.                                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

This is the **ONE RULE** that makes the entire architecture work. All design decisions flow from this invariant.

### What This Means

1. **Clients (Discord handlers, HTTP endpoints)** — Only APPEND facts to the export log
2. **Workers (background processors)** — Transform exports into derived state
3. **PostgreSQL** — The single source of truth for all state
4. **Caches, projections, views** — Derived from the truth, always rebuildable

---

## 2. Core Principles

### 2.1 Database as Substrate

**No traditional file I/O.** The database is the filesystem, the event bus, and the state store.

| Traditional OS | Sensai Equivalent |
|----------------|-------------------|
| Syscalls | Database transactions |
| Processes | Workers (ingest/project/deliver/gc) |
| Filesystem | DB-backed object store |
| Packages | Installable/removable components |
| IPC | Exports + Jobs + Outbox |

### 2.2 Append-Only Facts

All external inputs become **immutable export records**:
- Discord events → Export envelopes
- HTTP requests → Export envelopes
- Timer ticks → Export envelopes

Nothing is ever mutated; new facts supersede old facts.

### 2.3 Workers as Kernel Services

Workers are the kernel's background processors:
- **Ingest Workers** — Validate and normalize incoming exports
- **Projection Workers** — Build read models from exports
- **Delivery Workers** — Send outbound messages (Discord, email, etc.)
- **GC Workers** — Clean up old data, enforce retention

### 2.4 Transactional System Calls

Every operation is an **atomic database transaction**:
- Either completes fully or rolls back completely
- No partial state changes
- Advisory locks for long-running operations (battles, encounters)

### 2.5 Explicit Data Ownership

Each table has **ONE owner component**:
- Only the owner may WRITE to the table
- Other components may READ via queries or projections
- Cross-component writes happen via exports

### 2.6 Safe Removability

Disabling a component **stops its behavior without corrupting state**:
- Handlers are unregistered
- Work is drained
- Data remains intact for re-enable

### 2.7 Multi-Tenant by Default (v1.1.2)

Every envelope carries tenant scope:
```typescript
interface TenantScope {
  tenantId: string;   // Bot instance / installation
  guildId: string;    // Discord guild
}
```

### 2.8 Observability-First (v1.1.2)

Logging infrastructure boots **before** any other service:
- Boot logger starts immediately
- Database connections follow
- Full observability hub initializes last
- All handlers wrapped via `runGuarded()`

---

## 3. Layered Architecture

```
LAYER 4: SYSTEM SERVICES (Control Plane)
└── RBAC, Audit, Quotas, Schedule, Config

LAYER 3: WORKER RUNTIME (Kernel Services)  
└── INGEST → PROJECT → DELIVER → GC

LAYER 2: EXPORT LOG (Ingestion Front Door)
└── Append-only event log with monotonic seq

LAYER 1: OBJECT STORE (Big Bytes)
└── Blobs stored in DB (blobs, objects tables)

LAYER 0: STORAGE (The Only Place That Writes)
└── PostgreSQL with WAL + SQLite buffer
```

### Layer Details

**Layer 0 — Storage:**
- PostgreSQL as primary store
- SQLite for local caching (Engine Read-DB, Write-DB)
- Write-ahead logging for durability

**Layer 1 — Object Store:**
- Large binary objects stored in database
- Content-addressable storage (SHA-256 hashes)
- Metadata tables for organization

**Layer 2 — Export Log:**
- Append-only event stream
- Monotonically increasing sequence numbers
- Idempotency keys for deduplication

**Layer 3 — Worker Runtime:**
- Background processors for each concern
- Staggered startup to avoid thundering herd
- Graceful shutdown with work completion

**Layer 4 — System Services:**
- Role-based access control
- Audit logging
- Resource quotas
- Scheduled tasks
- Configuration management

---

## 4. Kernel Primitives

Every component receives a `ComponentContext` with access to these primitives:

### 4.1 Database Access (`ctx.db`)

```typescript
interface DbPrimitive {
  prisma: PrismaClient;
  transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}
```

### 4.2 Export Log (`ctx.exports`)

```typescript
interface ExportsPrimitive {
  append(envelope: ExportEnvelope): Promise<AppendResult>;
  query(filter: ExportFilter): Promise<ExportEnvelope[]>;
  getOffset(projection: string): Promise<number>;
  setOffset(projection: string, seq: number): Promise<void>;
  consumeFrom(seq: number, types: string[], limit?: number): Promise<ExportEnvelope[]>;
}
```

### 4.3 Job Queue (`ctx.jobs`)

```typescript
interface JobsPrimitive {
  enqueue(envelope: JobEnvelope): Promise<string>;
  lease(kinds: string[], limit?: number): Promise<LeasedJob[]>;
  complete(jobId: string, result: JobResult): Promise<void>;
  fail(jobId: string, error: Error, retryAfter?: Date): Promise<void>;
}
```

### 4.4 Outbox (`ctx.outbox`)

```typescript
interface OutboxPrimitive {
  send(envelope: OutboxEnvelope): Promise<string>;
  markDelivered(id: string): Promise<void>;
  markFailed(id: string, error: Error): Promise<void>;
}
```

### 4.5 Configuration (`ctx.config`)

```typescript
interface ConfigPrimitive {
  get<T>(key: string, scope?: ConfigScope): Promise<T | undefined>;
  set<T>(key: string, value: T, scope?: ConfigScope): Promise<void>;
  getComponentConfig<T>(component: string): Promise<T>;
  getFeatureFlag(flag: string, scope?: ConfigScope): Promise<boolean>;
}
```

### 4.6 RBAC (`ctx.rbac`)

```typescript
interface RbacPrimitive {
  assert(capability: Capability, scope: Scope): Promise<void>;
  check(capability: Capability, scope: Scope): Promise<boolean>;
  audit(event: AuditEvent): Promise<void>;
}
```

### 4.7 Observability (`ctx.obs`)

```typescript
interface ObsPrimitive {
  log: ScopedLogger;
  metrics: MetricsClient;
  correlationId: string;
  withCorrelation(id: string): ObsPrimitive;
}

interface ScopedLogger {
  debug(op: string, msg: string, data?: Record<string, unknown>): void;
  info(op: string, msg: string, data?: Record<string, unknown>): void;
  warn(op: string, msg: string, data?: Record<string, unknown>): void;
  error(op: string, msg: string, data?: Record<string, unknown>): void;
}
```

### 4.8 Deterministic RNG (`ctx.rng`)

```typescript
interface RngPrimitive {
  derive(seedParts: string[]): DeterministicRng;
}

interface DeterministicRng {
  next(): number;           // 0-1 float
  nextInt(max: number): number;
  nextBool(probability?: number): boolean;
  shuffle<T>(array: T[]): T[];
}
```

### 4.9 Object Store (`ctx.storage`)

```typescript
interface StoragePrimitive {
  putBlob(data: Buffer, metadata?: BlobMetadata): Promise<string>;
  getBlob(id: string): Promise<Buffer | null>;
  deleteBlob(id: string): Promise<void>;
  putObject(obj: StorageObject): Promise<string>;
  getObject(id: string): Promise<StorageObject | null>;
}
```

---

## 5. Component Model

### 5.1 Component Manifest

Every Sensai component declares its identity, requirements, and handlers:

```typescript
export interface SensaiComponent {
  // === Identity ===
  name: string;                          // 'security.guard'
  version: string;                       // Semver: '1.2.3'
  description?: string;

  // === Deployment ===
  hosts: HostKind[];                     // 'bot' | 'worker' | 'cron' | 'cli'
  dependencies?: string[];               // Other components required

  // === Capabilities (Security) ===
  capabilities: {
    db: Array<'read' | 'write' | 'migrate'>;
    discord?: Array<'read' | 'send' | 'moderate'>;
    network?: Array<'http-egress'>;
  };

  // === Data Ownership ===
  owns?: {
    canonical?: string[];                // Tables this component WRITES
    projections?: string[];              // Read models it maintains
  };

  // === Resource Budgets ===
  resources?: {
    maxCacheMb?: number;
    maxQueueSize?: number;
    maxConcurrency?: number;
  };

  // === Lifecycle Hooks ===
  onLoad?(ctx: ComponentContext): Promise<void>;
  onEnable?(ctx: ComponentContext): Promise<void>;
  onDisable?(ctx: ComponentContext): Promise<void>;
  onUnload?(ctx: ComponentContext): Promise<void>;

  // === Handler Bindings ===
  handlers?: {
    discord?: Record<string, DiscordHandler>;
    exports?: Record<string, ExportHandler>;
    jobs?: Record<string, JobHandler>;
    http?: Record<string, HttpHandler>;
    cli?: Record<string, CliHandler>;
  };
}
```

### 5.2 Host Types

| Host Type | Purpose | Example Components |
|-----------|---------|-------------------|
| `bot` | Discord interactions | game.core, game.homestead, discord.core |
| `worker` | Background processing | outbox.deliverer, cache.maintainer |
| `cron` | Scheduled jobs | scheduler.core, pokedex.fallback |
| `cli` | Operator tooling | ops.cli-tools, db.cli |

### 5.3 Component Communication

**THE ONE RULE THAT PREVENTS CHAOS:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│   HANDLERS DON'T CALL EACH OTHER DIRECTLY.                       │
│                                                                   │
│   They communicate through:                                       │
│     - EXPORTS (immutable facts)                                  │
│     - JOBS (background work)                                     │
│     - OUTBOX (external side effects)                             │
│                                                                   │
│   This is what makes disabling a component SAFE.                 │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Ownership

### 6.1 Cardinal Rule

```
EACH TABLE HAS EXACTLY ONE OWNER COMPONENT.
THAT COMPONENT IS THE ONLY WRITER.
OTHER COMPONENTS READ VIA PROJECTIONS OR QUERIES.
```

### 6.2 Data Classification

| Category | Owner | Mutability | Rebuild Strategy |
|----------|-------|------------|------------------|
| **Canonical** | Single component | Authoritative writes | N/A (source of truth) |
| **Projection** | Projection worker | Derived from exports | Rebuild from export log |
| **Cache** | Cache component | Ephemeral | Regenerate from canonical |
| **Audit** | Kernel | Append-only | Never modified |

### 6.3 Cross-Component Data Access

**✅ ALLOWED:** Read another component's data
```typescript
const trainers = await ctx.db.prisma.trainer.findMany({
  where: { region: 'kanto' }
});
```

**❌ FORBIDDEN:** Write to another component's table
```typescript
// VIOLATION - game.economy cannot write to game.core's table
await ctx.db.prisma.trainer.update({
  where: { id: trainerId },
  data: { money: 1000 }
});
```

**✅ CORRECT PATTERN:** Request change via export
```typescript
await ctx.exports.append({
  source: 'game.economy',
  type: 'trainer.money.request',
  idempotencyKey: `${trainerId}-${Date.now()}`,
  payload: { trainerId, amount: 1000, reason: 'reward' },
  occurredAt: new Date(),
  correlationId: ctx.obs.correlationId,
  scope: ctx.scope,  // TenantScope (v1.1.2)
});
// game.core handles the export and does the write
```

---

## 7. Concurrency Model

### 7.1 Lock Types by Domain

| Domain | Lock Type | Key | Reason |
|--------|-----------|-----|--------|
| **Battles** | Advisory | `battle:{battleId}` | Long transactions, multiple state changes |
| **Encounters** | Advisory | `encounter:{encounterId}` | Catch flow is multi-step |
| **Trainer Inventory** | Row lock | N/A (per row) | Simple CRUD, short transactions |
| **Trainer Money** | Row lock | N/A (per row) | Atomic increment/decrement |
| **Guild Config** | Optimistic | `version` column | Rare updates, read-heavy |
| **Component Config** | Optimistic | `version` column | Admin-only updates |

### 7.2 Advisory Lock Pattern

```typescript
async function withEntityLock<T>(
  ctx: ComponentContext,
  scope: LockScope,
  entityId: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = lockKeyForScope(scope, entityId);
  
  return await ctx.db.transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
    return await fn();
  });
}
```

### 7.3 Optimistic Locking Pattern

```typescript
async function updateWithVersion<T>(
  ctx: ComponentContext,
  table: string,
  id: string,
  expectedVersion: number,
  updates: Partial<T>
): Promise<T> {
  const result = await ctx.db.prisma[table].updateMany({
    where: { id, version: expectedVersion },
    data: { ...updates, version: expectedVersion + 1 }
  });
  
  if (result.count === 0) {
    throw new SensaiError('CONCURRENCY_CONFLICT', `Version mismatch on ${table}:${id}`);
  }
  
  return await ctx.db.prisma[table].findUnique({ where: { id } });
}
```

---

## 8. Discord I/O Policy

### 8.1 Response Tiers

| Tier | When | Discord Methods Allowed |
|------|------|------------------------|
| **IMMEDIATE** | Initial acknowledgement | `deferReply()`, `deferUpdate()`, error messages |
| **DEFERRED** | After defer, read-only | `editReply()`, `followUp()` |
| **OUTBOX** | All state-changing effects | Battle results, DMs, notifications |

### 8.2 Implementation Pattern

```typescript
class DiscordDriver {
  // IMMEDIATE tier - allowed directly
  async deferReply(): Promise<void> {
    await this.interaction.deferReply();
  }

  // DEFERRED tier - allowed after defer
  async editReply(content: string): Promise<void> {
    await this.interaction.editReply({ content });
  }

  // OUTBOX tier - ALWAYS goes through outbox
  async sendBattleResult(channelId: string, result: BattleResult): Promise<void> {
    await this.ctx.outbox.send({
      destination: 'discord',
      topic: 'battle_result',
      key: result.battleId,
      payload: { channelId, embeds: [formatBattleResult(result)] },
      correlationId: this.ctx.obs.correlationId,
      scope: this.ctx.scope,  // TenantScope (v1.1.2)
    });
  }
}
```

---

## 9. Multi-Tenant Architecture

### 9.1 Tenant Scope (v1.1.2)

Every operation carries tenant context:

```typescript
interface TenantScope {
  tenantId: string;   // Bot instance (e.g., "prod", "staging", "dev")
  guildId: string;    // Discord guild ID
}
```

### 9.2 Scope Propagation

```typescript
// All envelopes include scope
interface ExportEnvelope {
  id: string;
  source: string;
  type: string;
  payload: unknown;
  occurredAt: Date;
  correlationId: string;
  scope: TenantScope;        // MANDATORY (v1.1.2)
  idempotencyKey?: string;
}
```

### 9.3 Scope Extraction

```typescript
function extractScope(interaction: Interaction): TenantScope {
  return {
    tenantId: process.env.TENANT_ID ?? 'default',
    guildId: interaction.guildId ?? 'dm',
  };
}
```

### 9.4 Scope-Aware Queries

```typescript
// All queries should be scoped
const trainers = await ctx.db.prisma.trainer.findMany({
  where: { 
    guildId: ctx.scope.guildId,
    // Additional filters...
  }
});
```

---

## 10. Observability-First Boot

### 10.1 Boot Sequence (v1.1.2)

```typescript
// 1. IMMEDIATE: Boot logger (no dependencies)
const bootLog = createBootLogger();
bootLog.info('boot', 'Starting Sensai kernel...');

// 2. EARLY: Load configuration
const config = await loadConfig();
bootLog.info('boot', 'Configuration loaded', { env: config.env });

// 3. DATABASE: Connect to PostgreSQL
const db = await connectDatabase(config);
bootLog.info('boot', 'Database connected');

// 4. KERNEL: Initialize kernel primitives
const kernel = await initKernel(db, config);
bootLog.info('boot', 'Kernel initialized');

// 5. COMPONENTS: Load and enable components
await kernel.loadComponents();
bootLog.info('boot', 'Components loaded', { count: kernel.componentCount });

// 6. FULL: Switch to full observability hub
const obs = await initObservabilityHub(kernel);
obs.log.info('boot', 'Sensai kernel ready', { version: '1.1.2' });
```

### 10.2 Boot Logger

```typescript
function createBootLogger(): BootLogger {
  const startTime = Date.now();
  
  return {
    info(op: string, msg: string, data?: Record<string, unknown>) {
      const elapsed = Date.now() - startTime;
      console.log(JSON.stringify({
        level: 'info',
        timestamp: new Date().toISOString(),
        elapsed,
        op,
        msg,
        ...data
      }));
    },
    error(op: string, msg: string, data?: Record<string, unknown>) {
      const elapsed = Date.now() - startTime;
      console.error(JSON.stringify({
        level: 'error',
        timestamp: new Date().toISOString(),
        elapsed,
        op,
        msg,
        ...data
      }));
    }
  };
}
```

---

## 11. Error Taxonomy

### 11.1 SensaiError Base Class (v1.1.2)

```typescript
class SensaiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'SensaiError';
  }
  
  toJSON(): ErrorEnvelope {
    return {
      code: this.code,
      message: this.message,
      context: this.context,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }
}
```

### 11.2 Error Codes

```typescript
type ErrorCode =
  // Kernel errors (1xxx)
  | 'KERNEL_BOOT_FAILED'        // 1001
  | 'KERNEL_SHUTDOWN_TIMEOUT'   // 1002
  | 'PRIMITIVE_UNAVAILABLE'     // 1003
  
  // Component errors (2xxx)
  | 'COMPONENT_NOT_FOUND'       // 2001
  | 'COMPONENT_LOAD_FAILED'     // 2002
  | 'COMPONENT_DEPENDENCY'      // 2003
  | 'COMPONENT_DISABLED'        // 2004
  
  // Data errors (3xxx)
  | 'VALIDATION_FAILED'         // 3001
  | 'CONCURRENCY_CONFLICT'      // 3002
  | 'DATA_NOT_FOUND'            // 3003
  | 'DATA_OWNERSHIP_VIOLATION'  // 3004
  
  // Discord errors (4xxx)
  | 'DISCORD_API_ERROR'         // 4001
  | 'DISCORD_RATE_LIMITED'      // 4002
  | 'DISCORD_PERMISSION'        // 4003
  
  // Business logic errors (5xxx)
  | 'BATTLE_INVALID_MOVE'       // 5001
  | 'BATTLE_NOT_YOUR_TURN'      // 5002
  | 'ENCOUNTER_EXPIRED'         // 5003
  | 'INVENTORY_INSUFFICIENT'    // 5004;
```

### 11.3 Error Handling Pattern

```typescript
try {
  await performOperation();
} catch (err) {
  if (err instanceof SensaiError) {
    // Known error - handle based on code
    ctx.obs.log.warn('operation', 'Known error occurred', {
      code: err.code,
      context: err.context
    });
    return errorResponse(err);
  } else {
    // Unknown error - wrap and log
    const wrapped = new SensaiError(
      'KERNEL_UNKNOWN',
      'Unexpected error',
      { originalMessage: err.message },
      err
    );
    ctx.obs.log.error('operation', 'Unexpected error', wrapped.toJSON());
    throw wrapped;
  }
}
```

---

## 12. Guarded Execution

### 12.1 runGuarded Wrapper (v1.1.2)

All handlers MUST be wrapped with `runGuarded()`:

```typescript
function runGuarded<T>(
  ctx: ComponentContext,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  const correlationId = ctx.obs.correlationId;
  
  ctx.obs.log.debug(operation, 'Starting', { correlationId });
  
  return fn()
    .then((result) => {
      const duration = Date.now() - startTime;
      ctx.obs.log.debug(operation, 'Completed', { correlationId, duration });
      ctx.obs.metrics.timing(`${operation}.duration`, duration);
      return result;
    })
    .catch((err) => {
      const duration = Date.now() - startTime;
      
      if (err instanceof SensaiError) {
        ctx.obs.log.warn(operation, 'Failed with known error', {
          correlationId,
          duration,
          code: err.code,
          context: err.context
        });
        ctx.obs.metrics.inc(`${operation}.error.${err.code}`);
      } else {
        ctx.obs.log.error(operation, 'Failed with unknown error', {
          correlationId,
          duration,
          error: err.message,
          stack: err.stack
        });
        ctx.obs.metrics.inc(`${operation}.error.unknown`);
      }
      
      throw err;
    });
}
```

### 12.2 Handler Registration

```typescript
// All Discord handlers wrapped automatically
function registerDiscordHandler(
  component: SensaiComponent,
  eventName: string,
  handler: DiscordHandler
): void {
  const wrappedHandler = async (interaction: Interaction) => {
    const ctx = createContext(component, interaction);
    return runGuarded(ctx, `discord.${eventName}`, () => handler(ctx, interaction));
  };
  
  client.on(eventName, wrappedHandler);
}
```

---

## 13. Component Lifecycle

### 13.1 State Machine

```
UNINSTALLED → [install] → INSTALLED (disabled) → [enable] → ENABLED (active)
                                ↑                              ↓
                                └────── [disable] ────────────┘
                                              ↓
                              [uninstall] → UNINSTALLED
```

### 13.2 Lifecycle Operations

1. **INSTALL**: Register in DB, validate config (enabled=false)
2. **ENABLE**: Load manifest, register handlers, call `onEnable()`
3. **DISABLE**: Unregister handlers, drain work, call `onDisable()`
4. **UNINSTALL**: Ensure disabled first, remove from registry (NEVER drop tables)

### 13.3 Lifecycle Implementation

```typescript
class ComponentSupervisor {
  async install(manifest: SensaiComponent): Promise<void> {
    // Validate manifest
    validateManifest(manifest);
    
    // Check dependencies
    await this.checkDependencies(manifest.dependencies ?? []);
    
    // Register in database
    await this.db.prisma.component.create({
      data: {
        name: manifest.name,
        version: manifest.version,
        manifest: JSON.stringify(manifest),
        enabled: false,
        installedAt: new Date(),
      }
    });
    
    this.log.info('install', `Component ${manifest.name} installed`);
  }
  
  async enable(name: string): Promise<void> {
    const component = await this.loadComponent(name);
    
    // Call onLoad hook
    if (component.onLoad) {
      await component.onLoad(this.createContext(component));
    }
    
    // Register handlers
    this.registerHandlers(component);
    
    // Call onEnable hook
    if (component.onEnable) {
      await component.onEnable(this.createContext(component));
    }
    
    // Update database
    await this.db.prisma.component.update({
      where: { name },
      data: { enabled: true, enabledAt: new Date() }
    });
    
    this.log.info('enable', `Component ${name} enabled`);
  }
  
  async disable(name: string): Promise<void> {
    const component = this.enabledComponents.get(name);
    if (!component) return;
    
    // Unregister handlers
    this.unregisterHandlers(component);
    
    // Drain work
    await this.drainWork(component);
    
    // Call onDisable hook
    if (component.onDisable) {
      await component.onDisable(this.createContext(component));
    }
    
    // Update database
    await this.db.prisma.component.update({
      where: { name },
      data: { enabled: false, disabledAt: new Date() }
    });
    
    this.enabledComponents.delete(name);
    this.log.info('disable', `Component ${name} disabled`);
  }
}
```

---

## 14. File Structure

```
src/sensai/
├── kernel/
│   ├── index.ts              # Kernel bootstrap
│   ├── boot-logger.ts        # Pre-DB logging (v1.1.2)
│   ├── primitives/           # db, exports, jobs, outbox, etc.
│   │   ├── db.ts
│   │   ├── exports.ts
│   │   ├── jobs.ts
│   │   ├── outbox.ts
│   │   ├── config.ts
│   │   ├── rbac.ts
│   │   ├── obs.ts
│   │   ├── rng.ts
│   │   └── storage.ts
│   ├── supervisor.ts         # Component lifecycle manager
│   ├── control-plane.ts      # Watcher for enable/disable
│   ├── concurrency.ts        # Lock management
│   └── guarded.ts            # runGuarded() wrapper (v1.1.2)
├── components/
│   ├── game/
│   │   ├── core.ts           # game.core component
│   │   ├── homestead.ts      # game.homestead component
│   │   ├── battles.ts        # game.battles component
│   │   └── encounters.ts     # game.encounters component
│   ├── security/
│   │   ├── guard.ts          # security.guard component
│   │   └── audit.ts          # security.audit component
│   ├── observability/
│   │   └── core.ts           # observability component
│   └── ops/
│       └── cli-tools.ts      # ops.cli-tools component
├── errors/
│   ├── sensai-error.ts       # Base error class (v1.1.2)
│   ├── codes.ts              # Error code definitions
│   └── handlers.ts           # Error handling utilities
└── types/
    ├── component.ts          # SensaiComponent interface
    ├── handlers.ts           # Handler type signatures
    ├── kernel.ts             # Kernel service interfaces
    ├── scope.ts              # TenantScope (v1.1.2)
    └── envelopes.ts          # Envelope type definitions
```

---

## 15. Non-Negotiables

### 15.1 From Database Architect

- ❌ **No table can have multiple writers** — One owner component per table
- ❌ **No uninstall drops tables** — In production, tables stay; data is sacred
- ✅ **Schema migrations at deploy time** — Never runtime schema changes
- ✅ **Exports use seq for ordering** — UUIDs don't define clean order

### 15.2 From Distributed Systems Engineer

- ❌ **No handler direct calls** — Components communicate via exports/jobs/outbox
- ✅ **All handlers must be idempotent** — Safe to retry
- ✅ **Discord I/O tiered** — Immediate/deferred/outbox pattern

### 15.3 From TypeScript Specialist

- ❌ **No `Math.random()` in gameplay** — Use kernel RNG service
- ❌ **No `fs.writeFile`** — Use storage primitive or SQLite buffer
- ✅ **All caches must be bounded** — LRU with hard caps

### 15.4 From Security Engineer

- ✅ **Every privileged action → audit event** — Append-only audit log
- ✅ **Capabilities declared in manifest** — No implicit permissions
- ❌ **No hardcoded admin checks** — Use RBAC primitive

### 15.5 From Game Designer

- ✅ **Critical state = strong consistency** — Battles, captures, inventory
- ✅ **Telemetry = eventual/async** — Logs, metrics, analytics
- ✅ **All RNG seeds logged** — Audit/replay capability

### 15.6 From v1.1.2 Addendum

- ✅ **Every envelope has scope** — TenantScope mandatory
- ✅ **All handlers wrapped** — runGuarded() required
- ✅ **Errors use taxonomy** — SensaiError with codes
- ✅ **Boot logger first** — Observability before DB

---

## 16. Implementation Checklist

When implementing ANY Sensai component:

### Component Manifest
- [ ] Component manifest has all required fields (name, version, hosts, capabilities)
- [ ] Data ownership declared (canonical tables, projections)
- [ ] Resource budgets specified (maxCacheMb, maxQueueSize)

### Handler Design
- [ ] All handlers are idempotent
- [ ] No direct handler-to-handler calls
- [ ] Cross-component communication via exports/jobs/outbox only
- [ ] All handlers registered via `runGuarded()` wrapper (v1.1.2)

### Data & State
- [ ] RNG uses `ctx.rng.derive()`, not `Math.random()`
- [ ] File I/O uses `ctx.storage`, not `fs`
- [ ] Caches are bounded with hard limits

### Discord Integration
- [ ] Discord responses follow tier rules (immediate/deferred/outbox)
- [ ] Privileged actions emit audit events
- [ ] Correlation IDs propagated through all operations

### Multi-Tenant (v1.1.2)
- [ ] Tenant scope attached to all envelopes
- [ ] Queries filtered by scope where appropriate
- [ ] Scope extracted from interactions correctly

### Error Handling (v1.1.2)
- [ ] Errors use `SensaiError` taxonomy
- [ ] Error codes are appropriate
- [ ] Context attached to errors

### Observability (v1.1.2)
- [ ] Boot sequence uses boot logger before DB
- [ ] All operations logged with correlation IDs
- [ ] Metrics emitted for key operations

---

## 17. Migration Guide

### 17.1 Migrating Existing Code to Sensai

1. **Identify Component Boundaries**
   - Group related functionality
   - Define clear data ownership
   - List required capabilities

2. **Create Component Manifest**
   - Define name, version, hosts
   - Declare capabilities and ownership
   - Specify resource budgets

3. **Refactor Direct Calls to Exports**
   - Replace `serviceA.doThing()` with export appending
   - Create export handlers in owning component
   - Add idempotency keys

4. **Add Multi-Tenant Support (v1.1.2)**
   - Extract scope from interactions
   - Attach scope to all envelopes
   - Filter queries by scope

5. **Wrap Handlers with runGuarded (v1.1.2)**
   - Import `runGuarded` from kernel
   - Wrap all handler functions
   - Ensure correlation ID propagation

6. **Update Error Handling (v1.1.2)**
   - Replace custom errors with `SensaiError`
   - Use appropriate error codes
   - Attach context to errors

### 17.2 Example Migration

**Before (Direct Call):**
```typescript
// game/economy.ts
async function rewardPlayer(trainerId: string, amount: number) {
  await prisma.trainer.update({
    where: { id: trainerId },
    data: { money: { increment: amount } }
  });
}
```

**After (Sensai Pattern):**
```typescript
// components/game/economy.ts
const economyComponent: SensaiComponent = {
  name: 'game.economy',
  version: '1.0.0',
  hosts: ['bot', 'worker'],
  capabilities: { db: ['read'] },  // No write - goes via export
  
  handlers: {
    exports: {
      'player.reward': async (ctx, envelope) => {
        return runGuarded(ctx, 'player.reward', async () => {
          const { trainerId, amount, reason } = envelope.payload;
          
          // Request change via export to game.core (owner of trainer table)
          await ctx.exports.append({
            source: 'game.economy',
            type: 'trainer.money.increment',
            payload: { trainerId, amount, reason },
            idempotencyKey: envelope.idempotencyKey,
            correlationId: ctx.obs.correlationId,
            scope: envelope.scope,
            occurredAt: new Date(),
          });
        });
      }
    }
  }
};

// components/game/core.ts (owns trainer table)
const coreComponent: SensaiComponent = {
  name: 'game.core',
  version: '1.0.0',
  hosts: ['bot', 'worker'],
  capabilities: { db: ['read', 'write'] },
  owns: { canonical: ['trainer', 'pokemon'] },
  
  handlers: {
    exports: {
      'trainer.money.increment': async (ctx, envelope) => {
        return runGuarded(ctx, 'trainer.money.increment', async () => {
          const { trainerId, amount } = envelope.payload;
          
          await ctx.db.prisma.trainer.update({
            where: { id: trainerId },
            data: { money: { increment: amount } }
          });
        });
      }
    }
  }
};
```

---

## 18. Reference Documentation

### 18.1 Primary Sources

- **This Document:** `docs/projects/SENSAI-FINAL-ARCHITECTURE.md` — Canonical specification
- **Component OS Blueprint:** `docs/projects/SENSAI-COMPONENT-OS-BLUEPRINT.md` — Detailed component model
- **Architecture Addendum (v1.1):** `docs/projects/SENSAI-ARCHITECTURE-ADDENDUM.md` — Future-proofing considerations
- **Multi-Tenant + Obs-First (v1.1.2):** `docs/projects/SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md` — Multi-tenant scope and observability-first patterns
- **Quick Reference:** `docs/projects/SENSAI-QUICK-REFERENCE.md` — Cheat sheet

### 18.2 Implementation References

- **Store Write Elimination:** `docs/projects/STORE-WRITE-ELIMINATION.md` — Database-first file storage
- **Prisma 7 Bible:** `docs/prisma-7-bible.md` — Database configuration
- **Database Operations:** `docs/operations-bible/02-database-operations.md` — Operational procedures
- **Architecture Bible:** `docs/architecture-bible/INDEX.md` — System architecture

### 18.3 AI Agent Guidance

- **Sensai Instructions:** `.github/instructions/sensai.instructions.md` — AI agent guidelines
- **Copilot Instructions:** `.github/copilot-instructions.md` — General development guidelines
- **Agents.md:** `AGENTS.md` — Comprehensive operations guide

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-27 | Initial consolidated specification |
| 1.1.0 | 2025-12-27 | Added component lifecycle details |
| 1.1.1 | 2025-12-28 | Added migration guide |
| 1.1.2 | 2025-12-28 | Added multi-tenant scope, observability-first boot, SensaiError taxonomy, runGuarded wrapper |

---

**Document Authority:** This document is CANONICAL. All other Sensai documentation derives from this specification.

**Supersedes:** All previous architecture documents, design notes, and informal specifications.

**Enforcement:** Code reviews MUST validate against this specification. Non-compliant code will be rejected.
