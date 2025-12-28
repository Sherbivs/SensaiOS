# SENSAI — Final Architecture Specification
**Version:** 1.1.0  
**Date:** December 28, 2025  
**Status:** APPROVED — Incorporates v1.1 Addendum Feedback  
**Authors:** 10-Specialist Panel Review + Architecture Team

> **v1.1 CHANGELOG:** Added monotonic export sequencing (seq), control-plane watcher for hot enable/disable, explicit concurrency model (advisory/row/optimistic locks), Discord I/O policy tiers, host registry, worker run tracking, retention policies, DLQ support, and degraded mode playbook. See [Appendix D](#appendix-d-v11-changelog) for complete changes.

---

## 📋 TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Core Principles](#2-core-principles)
3. [The Golden Invariant](#3-the-golden-invariant)
4. [Layered Architecture](#4-layered-architecture)
5. [Kernel Primitives](#5-kernel-primitives)
6. [Component Model](#6-component-model)
7. [Host Model](#7-host-model)
8. [Data Ownership](#8-data-ownership)
9. [Control Plane Schema](#9-control-plane-schema)
10. [Component Lifecycle](#10-component-lifecycle)
11. [TypeScript Contracts](#11-typescript-contracts)
12. [Worked Examples](#12-worked-examples)
13. [Migration Roadmap](#13-migration-roadmap)
14. [Non-Negotiables](#14-non-negotiables)
15. [Success Criteria](#15-success-criteria)

---

## 1) EXECUTIVE SUMMARY

### What is Sensai?

**Sensai is NOT "Linux, but SQL."**

Sensai is a **runtime + contracts** that make your database behave like an operating system substrate:

| Traditional OS | Sensai |
|----------------|--------|
| Syscalls | Database transactions |
| Processes | Workers (ingest/project/deliver/gc) |
| Filesystem | DB-backed object store |
| Packages | Installable/removable components |
| IPC | Exports + Jobs + Outbox |

### Why Build This?

You already have "modules" (security service, outbox worker, cache worker, data pipeline, cron, main bot). What you need is a **formal component system** so that:

- ✅ New features can be added **without touching everything**
- ✅ Components can be enabled/disabled **per host** (service) and **per tenant** (guild)
- ✅ Cross-cutting concerns (logging, metrics, audit, RBAC) plug in **the same way everywhere**
- ✅ "DB as substrate" is an **enforceable contract**, not a vibe

### The Two Concerns

| Concern | Description |
|---------|-------------|
| **Sensai Kernel** | Shared runtime + contracts + primitives |
| **Components** | Plugins/modules that bind to kernel hook points and own their data |

---

## 2) CORE PRINCIPLES

### Principle 1: Database as Substrate
> No traditional file I/O. Only database transactions. `/Store` contains only SQLite database files.

### Principle 2: Append-Only Facts
> All external inputs become immutable export records. Events are ingested once, then projected into read models.

### Principle 3: Workers as Kernel Services
> Schedulers, importers, indexers, exporters, and garbage collectors are all workers with standardized contracts.

### Principle 4: Transactional System Calls
> Every operation is an atomic transaction. Partial states don't exist.

### Principle 5: Explicit Data Ownership
> Each table has exactly ONE owner component. That component is the only writer. Others read via projections.

### Principle 6: Safe Removability
> Disabling a component stops its behavior without corrupting canonical state. Facts remain; side effects stop.

---

## 3) THE GOLDEN INVARIANT

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

This is the **one rule** that makes the entire architecture work. Memorize it.

---

## 4) LAYERED ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4: SYSTEM SERVICES (Control Plane)                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │  RBAC   │ │  Audit  │ │ Quotas  │ │Schedule │ │  Config │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: WORKER RUNTIME (Kernel Services)                       │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐          │
│  │    INGEST     │ │    PROJECT    │ │    DELIVER    │          │
│  │  - Validate   │ │  - Transform  │ │  - Outbox     │          │
│  │  - Normalize  │ │  - Aggregate  │ │  - Webhook    │          │
│  │  - Dedupe     │ │  - Index      │ │  - Discord    │          │
│  └───────────────┘ └───────────────┘ └───────────────┘          │
│  ┌───────────────┐                                               │
│  │      GC       │  (Garbage collection, pruning, retention)    │
│  └───────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: EXPORT LOG (Ingestion Front Door)                      │
│  - Append-only event log                                         │
│  - Idempotent ingestion (dedupe by source + idempotencyKey)      │
│  - Optional HMAC signatures for tamper resistance                │
│  - Schema: exports(id, source, type, payload, occurred_at)       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: OBJECT STORE (Big Bytes)                               │
│  - Blobs stored in DB (or references to external store)          │
│  - Schema: blobs(id, hash, size, codec, data)                    │
│  - Schema: objects(id, owner, type, blob_id, metadata)           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 0: STORAGE (The Only Place That Writes)                   │
│  - PostgreSQL with WAL (write-ahead log)                         │
│  - MVCC for consistent reads                                     │
│  - Atomic transactions                                           │
│  - SQLite buffer for high-frequency writes (engine-write.db)     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5) KERNEL PRIMITIVES

The Sensai Kernel provides these **mandatory primitives** to all components:

### 5.1) Database Access (`db`)
```typescript
interface DbPrimitive {
  prisma: PrismaClient;
  transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}
```

### 5.2) Export Log (`exports`)
```typescript
interface ExportsPrimitive {
  append(envelope: ExportEnvelope): Promise<AppendResult>;  // Returns export ID + seq
  query(filter: ExportFilter): Promise<ExportEnvelope[]>;
  
  // v1.1: Seq-based offset tracking (monotonic ordering)
  getOffset(projection: string): Promise<number>;  // Returns last processed seq
  setOffset(projection: string, seq: number): Promise<void>;
  
  // v1.1: Efficient projection consumption
  consumeFrom(seq: number, types: string[], limit?: number): Promise<ExportEnvelope[]>;
}

interface AppendResult {
  id: string;
  seq: number;  // v1.1: Monotonic sequence for ordering
}

interface ExportEnvelope {
  id?: string;                    // Generated if not provided
  seq?: number;                   // v1.1: Assigned on append (BIGSERIAL)
  source: string;                 // 'discord' | 'worker' | 'admin' | component name
  type: string;                   // 'player.action.walk' | 'battle.completed'
  schemaVersion?: number;         // v1.1: Schema evolution (default: 1)
  idempotencyKey: string;         // Prevents duplicate ingestion
  payload: Record<string, unknown>;
  occurredAt: Date;
  correlationId: string;
  parentCorrelationId?: string;
  signature?: string;             // Optional HMAC
}

interface ExportFilter {
  types?: string[];
  source?: string;
  fromSeq?: number;               // v1.1: More efficient than fromId
  toSeq?: number;
  limit?: number;
}
```

### 5.3) Job Queue (`jobs`)
```typescript
interface JobsPrimitive {
  enqueue(envelope: JobEnvelope): Promise<string>;
  lease(kinds: string[], limit?: number): Promise<LeasedJob[]>;
  complete(jobId: string, result: JobResult): Promise<void>;
  fail(jobId: string, error: Error, retryAfter?: Date): Promise<void>;
}

interface JobEnvelope {
  kind: string;                   // 'PROJECT_DASHBOARD' | 'DELIVER_MESSAGE'
  payload: Record<string, unknown>;
  runAfter?: Date;                // Delayed execution
  maxAttempts?: number;           // Default: 3
  priority?: number;              // Higher = sooner (default: 0)
  idempotencyKey?: string;        // Optional dedupe
}

interface LeasedJob {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  leasedUntil: Date;
}
```

### 5.4) Outbox (`outbox`)
```typescript
interface OutboxPrimitive {
  send(envelope: OutboxEnvelope): Promise<string>;
  markDelivered(id: string): Promise<void>;
  markFailed(id: string, error: Error): Promise<void>;
}

interface OutboxEnvelope {
  destination: 'discord' | 'webhook' | 'email' | 'slack';
  topic: string;                  // Channel ID, webhook URL, etc.
  key?: string;                   // Idempotency key for destination
  payload: Record<string, unknown>;
  correlationId: string;
}
```

### 5.5) Configuration (`config`)
```typescript
interface ConfigPrimitive {
  get<T>(key: string, scope?: ConfigScope): Promise<T | undefined>;
  set<T>(key: string, value: T, scope?: ConfigScope): Promise<void>;
  getComponentConfig<T>(component: string): Promise<T>;
  getFeatureFlag(flag: string, scope?: ConfigScope): Promise<boolean>;
}

type ConfigScope = 
  | { type: 'global' }
  | { type: 'host'; hostId: string }
  | { type: 'guild'; guildId: string };
```

### 5.6) RBAC (`rbac`)
```typescript
interface RbacPrimitive {
  assert(capability: Capability, scope: Scope): Promise<void>;  // Throws if denied
  check(capability: Capability, scope: Scope): Promise<boolean>;
  audit(event: AuditEvent): Promise<void>;
}

type Capability = 
  | 'db.read' | 'db.write' | 'db.migrate'
  | 'discord.read' | 'discord.send' | 'discord.moderate'
  | 'network.http-egress'
  | 'admin.config' | 'admin.components';

interface AuditEvent {
  actor: { type: 'user' | 'system'; id: string };
  action: string;
  resource: string;
  outcome: 'success' | 'denied' | 'error';
  metadata?: Record<string, unknown>;
}
```

### 5.7) Observability (`obs`)
```typescript
interface ObsPrimitive {
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
```

### 5.8) Deterministic RNG (`rng`)
```typescript
interface RngPrimitive {
  derive(seedParts: string[]): DeterministicRng;
}

interface DeterministicRng {
  random(): number;           // [0, 1)
  int(min: number, max: number): number;
  pick<T>(array: T[]): T;
  shuffle<T>(array: T[]): T[];
  seed: string;               // For audit/replay
}
```

### 5.9) Object Store (`storage`)
```typescript
interface StoragePrimitive {
  putBlob(data: Buffer, metadata?: BlobMetadata): Promise<string>;  // Returns blob ID
  getBlob(id: string): Promise<Buffer | null>;
  deleteBlob(id: string): Promise<void>;
  putObject(obj: StorageObject): Promise<string>;
  getObject(id: string): Promise<StorageObject | null>;
}

interface StorageObject {
  id?: string;
  owner: string;              // Component name
  type: string;               // 'heap-snapshot' | 'battle-replay'
  blobId: string;
  metadata: Record<string, unknown>;
}
```

---

## 6) COMPONENT MODEL

### 6.1) What is a Component?

A component is **NOT** just "some code." It's a formal unit with:

| Element | Description |
|---------|-------------|
| **Manifest** | Name, version, hosts, dependencies, capabilities |
| **Owned Tables** | Canonical or projection tables (exactly one owner per table) |
| **Handlers** | Exports, jobs, Discord, HTTP, CLI bindings |
| **Config Schema** | Validated JSON configuration |
| **Capability Declaration** | What permissions it needs |

### 6.2) Component Manifest Interface

```typescript
export type HostKind = 'bot' | 'worker' | 'cron' | 'cli';

export interface SensaiComponent {
  // === Identity ===
  name: string;                          // 'security.guard'
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
  resources?: {
    maxCacheMb?: number;                 // LRU cache limit
    maxQueueSize?: number;               // In-memory queue limit
    maxConcurrency?: number;             // Parallel handlers
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

// Handler type signatures
type DiscordHandler = (interaction: DiscordInteraction, ctx: ComponentContext) => Promise<void>;
type ExportHandler = (envelope: ExportEnvelope, ctx: ComponentContext) => Promise<void>;
type JobHandler = (job: LeasedJob, ctx: ComponentContext) => Promise<JobResult>;
type HttpHandler = (req: HttpRequest, ctx: ComponentContext) => Promise<HttpResponse>;
type CliHandler = (args: string[], ctx: ComponentContext) => Promise<number>;
```

### 6.3) Component Context (Injected by Kernel)

```typescript
export interface ComponentContext {
  // === Host Info ===
  host: {
    id: string;
    kind: HostKind;
    startedAt: Date;
  };

  // === Component Info ===
  component: {
    name: string;
    version: string;
    config: Record<string, unknown>;
  };

  // === Kernel Primitives ===
  db: DbPrimitive;
  exports: ExportsPrimitive;
  jobs: JobsPrimitive;
  outbox: OutboxPrimitive;
  config: ConfigPrimitive;
  rbac: RbacPrimitive;
  obs: ObsPrimitive;
  rng: RngPrimitive;
  storage: StoragePrimitive;

  // === Bounded Cache (Provided by Kernel) ===
  cache: {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T, ttlMs?: number): void;
    delete(key: string): void;
    clear(): void;
    stats(): { hits: number; misses: number; size: number };
  };
}
```

### 6.4) The One Rule That Prevents Chaos

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

## 7) HOST MODEL

### 7.1) What is a Host?

Each Render service is a **Sensai Host**:
- It runs the Sensai kernel
- It loads only components appropriate for that host type
- It reads enablement state from DB on startup

### 7.2) Host Types

| Host Type | Purpose | Components Loaded |
|-----------|---------|-------------------|
| `bot` | Discord interactions, gameplay | discord-core, game-core, homestead, battles, encounters |
| `worker` | Background processing | outbox-deliverer, cache-maintainer, data-pipeline |
| `cron` | Scheduled jobs | scheduler, cleanup, reporting |
| `cli` | Operator tooling | ops-tools, db-cli, observe |

### 7.3) Mapping to Current Render Services

```
CURRENT SERVICE              → SENSAI HOST + COMPONENTS
─────────────────────────────────────────────────────────────────
infinity-gauntlet-bot        → bot host
                               ├─ discord.core
                               ├─ observability
                               └─ health.http

Infinity-Gauntlet            → bot host (primary)
                               ├─ game.core
                               ├─ game.homestead
                               ├─ game.encounters
                               ├─ game.battles
                               ├─ game.pokedex
                               └─ observability

infinity-gauntlet-outbox     → worker host
                               ├─ outbox.deliverer
                               └─ observability

infinity-gauntlet-cache      → worker host
                               ├─ cache.maintainer
                               ├─ reference.refresh
                               └─ observability

infinity-gauntlet-security   → worker host
                               ├─ security.guard
                               ├─ security.audit
                               ├─ security.rate-limit
                               └─ observability

infinity-gauntlet-data-pipeline → worker host
                               ├─ pokedex.sync
                               ├─ data.ingestion
                               └─ observability

pokedex-cache-worker         → worker host
                               ├─ pokedex.cache
                               └─ observability

pokedex-cache-failsafe       → cron host
                               ├─ scheduler.core
                               └─ pokedex.fallback
```

### 7.4) Host Boot Sequence

```
1. KERNEL INIT
   ├─ Connect to PostgreSQL
   ├─ Initialize kernel primitives (exports, jobs, outbox, etc.)
   └─ Read host configuration

2. COMPONENT DISCOVERY
   ├─ Query component_installations WHERE enabled = true
   ├─ Filter by host type compatibility
   └─ Sort by dependency order

3. COMPONENT LOAD
   FOR each component:
   ├─ Validate manifest
   ├─ Check capabilities against host permissions
   ├─ Allocate bounded cache
   ├─ Call component.onLoad(ctx)
   └─ Register handlers

4. COMPONENT ENABLE
   FOR each loaded component:
   ├─ Call component.onEnable(ctx)
   └─ Enqueue bootstrap jobs if needed

5. READY
   ├─ Start accepting requests (Discord, HTTP, jobs)
   └─ Begin health check heartbeats
```

---

## 8) DATA OWNERSHIP

### 8.1) The Cardinal Rule

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│   EACH TABLE HAS EXACTLY ONE OWNER COMPONENT.                    │
│   THAT COMPONENT IS THE ONLY WRITER.                             │
│   OTHER COMPONENTS READ VIA PROJECTIONS OR QUERIES.              │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2) Data Classification

| Category | Owner | Mutability | Rebuild Strategy |
|----------|-------|------------|------------------|
| **Canonical** | Single component | Authoritative writes | N/A (source of truth) |
| **Projection** | Projection worker | Derived from exports | Rebuild from export log |
| **Cache** | Cache component | Ephemeral | Regenerate from canonical |
| **Audit** | Kernel | Append-only | Never modified |

### 8.3) Table Ownership Registry

```typescript
// Example ownership declarations
const TABLE_OWNERS: Record<string, string> = {
  // Kernel-owned (nobody else writes)
  'exports': 'kernel',
  'jobs': 'kernel',
  'outbox_messages': 'kernel',
  'audit_events': 'kernel',
  'component_installations': 'kernel',

  // Game core owns canonical gameplay state
  'User': 'game.core',
  'Trainer': 'game.core',
  'Monster': 'game.core',
  'Party': 'game.core',
  'Battle': 'game.core',
  'Encounter': 'game.core',

  // Security owns its state
  'security_baselines': 'security.guard',
  'security_alerts': 'security.guard',

  // Projections (rebuildable)
  'player_dashboard': 'projection.dashboard',
  'leaderboard': 'projection.leaderboard',
  'encounter_cache': 'projection.encounters',
};
```

### 8.4) Cross-Component Data Access

**ALLOWED:**
```typescript
// Component A reads Component B's data via query
const trainers = await ctx.db.prisma.trainer.findMany({
  where: { region: 'kanto' }
});
```

**FORBIDDEN:**
```typescript
// Component A writes to Component B's table
await ctx.db.prisma.trainer.update({  // ❌ VIOLATION
  where: { id: trainerId },
  data: { money: 1000 }
});
```

**CORRECT PATTERN:**
```typescript
// Component A requests change via export
await ctx.exports.append({
  source: 'component-a',
  type: 'trainer.money.request',
  idempotencyKey: `${trainerId}-${Date.now()}`,
  payload: { trainerId, amount: 1000, reason: 'reward' },
  occurredAt: new Date(),
  correlationId: ctx.obs.correlationId,
});

// game.core component handles the export and does the write
```

---

## 9) CONTROL PLANE SCHEMA

### 9.1) Component Registry Tables

```sql
-- Component installations (what's installed, where, enabled?)
CREATE TABLE component_installations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  
  -- Scope control
  scope_type TEXT NOT NULL DEFAULT 'global',  -- 'global' | 'host' | 'guild'
  scope_id TEXT,                               -- host ID or guild ID
  
  -- Configuration
  config JSONB DEFAULT '{}',
  
  -- Metadata
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  installed_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(name, version, scope_type, scope_id)
);

CREATE INDEX idx_component_installations_enabled 
  ON component_installations(name, enabled);
CREATE INDEX idx_component_installations_scope 
  ON component_installations(scope_type, scope_id);

-- Component health tracking
CREATE TABLE component_health (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  component_name TEXT NOT NULL,
  host_id TEXT NOT NULL,
  
  -- Health status
  status TEXT NOT NULL DEFAULT 'unknown',  -- 'healthy' | 'degraded' | 'unhealthy'
  last_heartbeat TIMESTAMPTZ,
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  
  -- Metrics
  jobs_processed INTEGER DEFAULT 0,
  jobs_failed INTEGER DEFAULT 0,
  avg_processing_ms REAL,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(component_name, host_id)
);
```

### 9.2) Kernel Primitive Tables

```sql
-- Export log (append-only facts)
-- v1.1: Added seq BIGSERIAL for monotonic ordering (critical for projections)
CREATE TABLE exports (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seq BIGSERIAL UNIQUE NOT NULL,  -- ⚠️ CRITICAL: Monotonic ingest sequence for projections
  source TEXT NOT NULL,
  type TEXT NOT NULL,
  schema_version INT NOT NULL DEFAULT 1,  -- v1.1: Schema evolution support
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  correlation_id TEXT NOT NULL,
  parent_correlation_id TEXT,
  signature TEXT,
  
  UNIQUE(source, idempotency_key)
);

CREATE INDEX idx_exports_seq ON exports(seq);  -- Primary projection cursor
CREATE INDEX idx_exports_type_occurred ON exports(type, occurred_at DESC);
CREATE INDEX idx_exports_correlation ON exports(correlation_id);
CREATE INDEX idx_exports_ingested ON exports(ingested_at DESC);

-- Export type registry (schema evolution without breaking old events)
-- v1.1: Added for safe payload evolution
CREATE TABLE export_type_registry (
  type TEXT PRIMARY KEY,
  current_version INT NOT NULL DEFAULT 1,
  json_schema JSONB,                    -- Optional JSON Schema for validation
  deprecated BOOLEAN NOT NULL DEFAULT FALSE,
  owner_component TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_export_type_owner ON export_type_registry(owner_component);

-- Job queue (leased work)
-- v1.1: Added next_attempt_at, dead_lettered_at, partition_key for DLQ + scheduling
CREATE TABLE jobs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  
  -- Scheduling
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- v1.1: Explicit retry scheduling
  priority INTEGER NOT NULL DEFAULT 0,
  partition_key TEXT,  -- v1.1: Optional serialization key (per entity)
  
  -- Retry logic
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  
  -- Leasing
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'leased' | 'completed' | 'failed' | 'dead'
  leased_by TEXT,
  leased_until TIMESTAMPTZ,
  
  -- Dead Letter Queue (v1.1)
  dead_lettered_at TIMESTAMPTZ,  -- When moved to DLQ
  dead_letter_reason TEXT,       -- Why it was dead-lettered
  
  -- Results
  result JSONB,
  error TEXT,
  
  -- Metadata
  idempotency_key TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  UNIQUE(idempotency_key) WHERE idempotency_key IS NOT NULL
);

-- v1.1: Updated index for next_attempt_at scheduling
CREATE INDEX idx_jobs_pending ON jobs(status, next_attempt_at, priority DESC) 
  WHERE status = 'pending';
CREATE INDEX idx_jobs_leased ON jobs(status, leased_until) 
  WHERE status = 'leased';
CREATE INDEX idx_jobs_kind ON jobs(kind, status);
CREATE INDEX idx_jobs_dead ON jobs(dead_lettered_at DESC) 
  WHERE status = 'dead';  -- v1.1: DLQ index
CREATE INDEX idx_jobs_partition ON jobs(partition_key, status, next_attempt_at)
  WHERE partition_key IS NOT NULL;  -- v1.1: Per-entity serialization

-- Outbox messages (reliable delivery)
-- v1.1: Added next_attempt_at, sending state, leasing for proper retry
CREATE TABLE outbox_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  destination TEXT NOT NULL,
  topic TEXT NOT NULL,
  key TEXT,
  payload JSONB NOT NULL,
  
  -- Delivery status (v1.1: added 'sending' state)
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'sending' | 'delivered' | 'failed'
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- v1.1: Retry scheduling
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  
  -- Leasing (v1.1: prevents duplicate sends)
  leased_by TEXT,
  leased_until TIMESTAMPTZ,
  
  -- Tracking
  correlation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  error TEXT,
  
  UNIQUE(destination, topic, key) WHERE key IS NOT NULL
);

CREATE INDEX idx_outbox_pending ON outbox_messages(status, next_attempt_at) 
  WHERE status = 'pending';
CREATE INDEX idx_outbox_sending ON outbox_messages(status, leased_until)
  WHERE status = 'sending';  -- v1.1: Track in-flight sends

-- Audit events (append-only, tamper-evident)
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  
  -- Actor
  actor_type TEXT NOT NULL,  -- 'user' | 'system' | 'component'
  actor_id TEXT NOT NULL,
  
  -- Action
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  outcome TEXT NOT NULL,  -- 'success' | 'denied' | 'error'
  
  -- Context
  metadata JSONB DEFAULT '{}',
  correlation_id TEXT,
  
  -- Immutability
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signature TEXT  -- HMAC for tamper detection
);

CREATE INDEX idx_audit_actor ON audit_events(actor_type, actor_id, occurred_at DESC);
CREATE INDEX idx_audit_action ON audit_events(action, occurred_at DESC);
CREATE INDEX idx_audit_resource ON audit_events(resource, occurred_at DESC);
```

### 9.3) Projection Tracking

```sql
-- Track where each projection has processed up to
-- v1.1: Changed to use seq (monotonic) instead of export_id (UUID)
CREATE TABLE projection_offsets (
  projection_name TEXT PRIMARY KEY,
  export_type TEXT NOT NULL,
  last_seq BIGINT NOT NULL DEFAULT 0,  -- ⚠️ CRITICAL: Use seq, not UUID
  last_processed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 9.4) Host Registry (v1.1)

```sql
-- Host registry (service discovery + scheduling)
-- v1.1: Enables "what is running where" and smart job routing
CREATE TABLE hosts (
  host_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,  -- 'bot' | 'worker' | 'cron' | 'cli'
  version TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  labels JSONB NOT NULL DEFAULT '{}',  -- { "region": "virginia", "has_discord_token": true }
  capabilities JSONB NOT NULL DEFAULT '[]',  -- ["discord", "jobs", "exports"]
  status TEXT NOT NULL DEFAULT 'starting'  -- 'starting' | 'ready' | 'draining' | 'stopped'
);

CREATE INDEX idx_hosts_kind ON hosts(kind, status);
CREATE INDEX idx_hosts_heartbeat ON hosts(last_heartbeat DESC);
```

### 9.5) Worker Run Tracking (v1.1)

```sql
-- Worker run tracking (replay + audits + dispute resolution)
-- v1.1: Enables "what code processed this battle?" questions
CREATE TABLE worker_runs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  worker_kind TEXT NOT NULL,
  host_id TEXT NOT NULL REFERENCES hosts(host_id),
  
  -- Input/Output references
  input_refs JSONB NOT NULL DEFAULT '[]',   -- [{ "type": "export", "id": "..." }, ...]
  output_refs JSONB NOT NULL DEFAULT '[]',  -- [{ "type": "job", "id": "..." }, ...]
  
  -- Code version (for replay/audit)
  code_version TEXT NOT NULL,
  component_name TEXT NOT NULL,
  component_version TEXT NOT NULL,
  
  -- Execution
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'running',  -- 'running' | 'success' | 'failed' | 'timeout'
  error TEXT,
  
  -- Determinism
  rng_seed TEXT,  -- For replay verification
  
  CONSTRAINT worker_runs_host_fk FOREIGN KEY (host_id) REFERENCES hosts(host_id)
);

CREATE INDEX idx_worker_runs_kind ON worker_runs(worker_kind, started_at DESC);
CREATE INDEX idx_worker_runs_component ON worker_runs(component_name, started_at DESC);
CREATE INDEX idx_worker_runs_status ON worker_runs(status, started_at DESC);
```

### 9.6) Retention Policies (v1.1)

```sql
-- Retention policy configuration
-- v1.1: Explicit retention rules to prevent unbounded growth
CREATE TABLE retention_policies (
  table_name TEXT PRIMARY KEY,
  retention_days INTEGER NOT NULL,
  archive_strategy TEXT NOT NULL DEFAULT 'delete',  -- 'delete' | 'archive' | 'keep'
  archive_destination TEXT,  -- S3 bucket, etc. (if archive_strategy = 'archive')
  last_pruned_at TIMESTAMPTZ,
  next_prune_at TIMESTAMPTZ,
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

-- Default retention policies (apply via INSERT ON CONFLICT DO NOTHING)
-- jobs: 7 days after completion
-- outbox_messages: 7 days after delivery
-- exports: 90 days (configurable per export type)
-- audit_events: 365 days (regulatory compliance)
-- worker_runs: 30 days
```

---

## 10) COMPONENT LIFECYCLE

### 10.1) State Machine

```
                    ┌─────────────┐
                    │  UNINSTALLED │
                    └──────┬──────┘
                           │ install()
                           ▼
                    ┌─────────────┐
          ┌─────────│  INSTALLED  │─────────┐
          │         │  (disabled) │         │
          │         └──────┬──────┘         │
          │                │ enable()       │ uninstall()
          │                ▼                │
          │         ┌─────────────┐         │
          │         │   ENABLED   │         │
          │         │  (active)   │         │
          │         └──────┬──────┘         │
          │                │ disable()      │
          │                ▼                │
          │         ┌─────────────┐         │
          └─────────│  DISABLED   │─────────┘
                    │  (draining) │
                    └─────────────┘
```

### 10.2) Lifecycle Operations

#### INSTALL
```typescript
async function installComponent(
  name: string,
  version: string,
  config: Record<string, unknown>,
  scope: ConfigScope
): Promise<void> {
  // 1. Validate manifest exists (compiled into image)
  const manifest = getComponentManifest(name, version);
  if (!manifest) throw new Error(`Component ${name}@${version} not found`);

  // 2. Validate config against schema
  validateConfig(manifest, config);

  // 3. Register in database
  await prisma.componentInstallation.create({
    data: {
      name,
      version,
      enabled: false,
      scopeType: scope.type,
      scopeId: scope.type === 'global' ? null : scope.id,
      config,
      installedBy: getCurrentOperator(),
    },
  });

  // 4. Note: Schema migrations applied at deploy time, NOT here
}
```

#### ENABLE
```typescript
async function enableComponent(
  installationId: string
): Promise<void> {
  const installation = await prisma.componentInstallation.findUnique({
    where: { id: installationId },
  });

  // 1. Load component
  const manifest = getComponentManifest(installation.name, installation.version);
  const ctx = createComponentContext(manifest, installation.config);

  // 2. Call onLoad hook
  if (manifest.onLoad) {
    await manifest.onLoad(ctx);
  }

  // 3. Register handlers
  registerHandlers(manifest, ctx);

  // 4. Call onEnable hook
  if (manifest.onEnable) {
    await manifest.onEnable(ctx);
  }

  // 5. Mark enabled in DB
  await prisma.componentInstallation.update({
    where: { id: installationId },
    data: { enabled: true, updatedAt: new Date() },
  });

  // 6. Emit audit event
  await ctx.rbac.audit({
    actor: { type: 'system', id: getCurrentOperator() },
    action: 'component.enable',
    resource: `component:${installation.name}`,
    outcome: 'success',
    metadata: { version: installation.version },
  });
}
```

#### DISABLE
```typescript
async function disableComponent(
  installationId: string,
  options?: { drain?: boolean; timeoutMs?: number }
): Promise<void> {
  const installation = await prisma.componentInstallation.findUnique({
    where: { id: installationId },
  });

  const manifest = getComponentManifest(installation.name, installation.version);
  const ctx = getComponentContext(installation.name);

  // 1. Stop accepting new work
  unregisterHandlers(manifest);

  // 2. Drain in-flight work (optional)
  if (options?.drain) {
    await drainInFlightJobs(installation.name, options.timeoutMs ?? 30000);
  }

  // 3. Call onDisable hook
  if (manifest.onDisable) {
    await manifest.onDisable(ctx);
  }

  // 4. Mark disabled in DB
  await prisma.componentInstallation.update({
    where: { id: installationId },
    data: { enabled: false, updatedAt: new Date() },
  });

  // 5. Emit audit event
  await ctx.rbac.audit({
    actor: { type: 'system', id: getCurrentOperator() },
    action: 'component.disable',
    resource: `component:${installation.name}`,
    outcome: 'success',
  });
}
```

#### UNINSTALL
```typescript
async function uninstallComponent(
  installationId: string
): Promise<void> {
  // 1. Ensure disabled first
  await disableComponent(installationId, { drain: true });

  // 2. Remove from registry (but DO NOT drop tables)
  await prisma.componentInstallation.delete({
    where: { id: installationId },
  });

  // NOTE: Tables are NEVER dropped automatically in production.
  // Data is cheap; data loss is expensive.
  // Use explicit migration for table removal after careful review.
}
```

### 10.3) Control Plane Watcher (v1.1)

> **CRITICAL:** Enable/disable without restart requires the host to **watch** the control plane.

```typescript
// sensai/kernel/control-plane-watcher.ts
// v1.1: Makes "no-restart" enable/disable possible

interface ControlPlaneWatcher {
  start(): Promise<void>;
  stop(): Promise<void>;
  onComponentChange(callback: ComponentChangeCallback): void;
}

type ComponentChangeCallback = (change: ComponentChange) => Promise<void>;

interface ComponentChange {
  installationId: string;
  componentName: string;
  previousState: 'enabled' | 'disabled' | null;
  newState: 'enabled' | 'disabled';
  changedAt: Date;
}

// Implementation: Poll-based (recommended for Render/Prisma constraints)
class PollingControlPlaneWatcher implements ControlPlaneWatcher {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs: number;
  private readonly hostId: string;
  private callbacks: ComponentChangeCallback[] = [];
  private lastKnownState: Map<string, boolean> = new Map();

  constructor(options: { pollIntervalMs?: number; hostId: string }) {
    this.pollIntervalMs = options.pollIntervalMs ?? 5000; // 5 second default
    this.hostId = options.hostId;
  }

  async start(): Promise<void> {
    // Initialize known state
    await this.loadInitialState();
    
    // Start polling
    this.intervalId = setInterval(() => this.checkForChanges(), this.pollIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  onComponentChange(callback: ComponentChangeCallback): void {
    this.callbacks.push(callback);
  }

  private async loadInitialState(): Promise<void> {
    const installations = await prisma.componentInstallation.findMany({
      where: { enabled: true },
      select: { id: true, name: true, enabled: true },
    });
    
    for (const inst of installations) {
      this.lastKnownState.set(inst.id, inst.enabled);
    }
  }

  private async checkForChanges(): Promise<void> {
    const installations = await prisma.componentInstallation.findMany({
      select: { id: true, name: true, enabled: true, updatedAt: true },
    });

    for (const inst of installations) {
      const wasEnabled = this.lastKnownState.get(inst.id);
      
      // Detect state change
      if (wasEnabled !== undefined && wasEnabled !== inst.enabled) {
        const change: ComponentChange = {
          installationId: inst.id,
          componentName: inst.name,
          previousState: wasEnabled ? 'enabled' : 'disabled',
          newState: inst.enabled ? 'enabled' : 'disabled',
          changedAt: inst.updatedAt,
        };

        // Notify callbacks
        for (const cb of this.callbacks) {
          try {
            await cb(change);
          } catch (err) {
            console.error(`Control plane watcher callback failed:`, err);
          }
        }
      }
      
      this.lastKnownState.set(inst.id, inst.enabled);
    }
  }
}

// Alternative: LISTEN/NOTIFY (PostgreSQL native, lower latency)
// Note: Requires direct PostgreSQL connection (not via PgBouncer)
// Consider for Phase 3 if polling latency becomes an issue
```

#### Kernel Supervisor Integration

```typescript
// sensai/kernel/supervisor.ts
// v1.1: Hot enable/disable without restart

class ComponentSupervisor {
  private readonly watcher: ControlPlaneWatcher;
  private readonly registry: ComponentRegistry;
  
  async start(): Promise<void> {
    // Register change handler
    this.watcher.onComponentChange(async (change) => {
      if (change.newState === 'enabled') {
        await this.hotEnableComponent(change.componentName);
      } else {
        await this.hotDisableComponent(change.componentName);
      }
    });
    
    await this.watcher.start();
  }

  private async hotEnableComponent(name: string): Promise<void> {
    const installation = await this.registry.getByName(name);
    if (!installation) return;

    const manifest = getComponentManifest(name, installation.version);
    const ctx = createComponentContext(manifest, installation.config);

    // Load and register without full restart
    if (manifest.onLoad) await manifest.onLoad(ctx);
    registerHandlers(manifest, ctx);
    if (manifest.onEnable) await manifest.onEnable(ctx);

    console.log(`[Supervisor] Hot-enabled component: ${name}`);
  }

  private async hotDisableComponent(name: string): Promise<void> {
    const installation = await this.registry.getByName(name);
    if (!installation) return;

    const manifest = getComponentManifest(name, installation.version);
    const ctx = getComponentContext(name);

    // Unregister and drain
    unregisterHandlers(manifest);
    if (manifest.onDisable) await manifest.onDisable(ctx);

    console.log(`[Supervisor] Hot-disabled component: ${name}`);
  }
}
```

### 10.4) Concurrency Model (v1.1)

> **CRITICAL:** Define the concurrency mechanism for battles/encounters/inventory to prevent rare race bugs.

```typescript
// sensai/kernel/concurrency.ts
// v1.1: Explicit concurrency rules for critical gameplay state

/**
 * CONCURRENCY MODEL SELECTION
 * 
 * Three options, choose per domain:
 * 
 * 1. ROW LOCKS (SELECT ... FOR UPDATE)
 *    - Best for: Single-row updates, short transactions
 *    - Use: Inventory changes, trainer profile updates
 * 
 * 2. ADVISORY LOCKS (pg_advisory_xact_lock)
 *    - Best for: Entity-level serialization, longer transactions
 *    - Use: Battles, encounters (entire flow locked per entity)
 * 
 * 3. OPTIMISTIC CONCURRENCY (version column + CAS)
 *    - Best for: Low-contention reads, rare conflicts
 *    - Use: Cache updates, configuration changes
 */

// ========== ADVISORY LOCKS (Recommended for Battles/Encounters) ==========

type LockScope = 'battle' | 'encounter' | 'trainer' | 'guild';

function lockKeyForScope(scope: LockScope, entityId: string): number {
  // Generate consistent 32-bit hash for advisory lock
  const combined = `${scope}:${entityId}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}

// Usage in handlers:
async function withEntityLock<T>(
  scope: LockScope,
  entityId: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = lockKeyForScope(scope, entityId);
  
  return await prisma.$transaction(async (tx) => {
    // Acquire advisory lock (blocks if another tx holds it)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
    
    // Execute critical section
    return await fn();
    
    // Lock automatically released at transaction end
  });
}

// Example: Battle turn resolution
async function resolveBattleTurn(battleId: string, action: BattleAction): Promise<TurnResult> {
  return await withEntityLock('battle', battleId, async () => {
    const battle = await prisma.battle.findUnique({ where: { id: battleId } });
    if (!battle) throw new Error('Battle not found');
    
    const result = battleEngine.resolveTurn(battle, action);
    
    await prisma.battle.update({
      where: { id: battleId },
      data: { state: result.newState },
    });
    
    return result;
  });
}

// ========== ROW LOCKS (For simple CRUD) ==========

async function updateTrainerMoney(
  trainerId: string, 
  delta: number
): Promise<number> {
  return await prisma.$transaction(async (tx) => {
    // Lock the row
    const trainer = await tx.trainer.findUnique({
      where: { id: trainerId },
      select: { money: true },
    });
    
    // Prisma doesn't have FOR UPDATE, use raw query:
    await tx.$executeRaw`
      SELECT * FROM "Trainer" 
      WHERE id = ${trainerId} 
      FOR UPDATE
    `;
    
    const newMoney = trainer.money + delta;
    if (newMoney < 0) throw new Error('Insufficient funds');
    
    await tx.trainer.update({
      where: { id: trainerId },
      data: { money: newMoney },
    });
    
    return newMoney;
  });
}

// ========== OPTIMISTIC CONCURRENCY (For caches/config) ==========

interface VersionedEntity {
  id: string;
  version: number;
  // ... other fields
}

async function updateWithOptimisticLock<T extends VersionedEntity>(
  table: string,
  id: string,
  expectedVersion: number,
  updates: Partial<T>
): Promise<T> {
  const result = await prisma.$executeRaw`
    UPDATE ${table}
    SET version = version + 1,
        ${Object.entries(updates).map(([k, v]) => `${k} = ${v}`).join(', ')}
    WHERE id = ${id}
      AND version = ${expectedVersion}
    RETURNING *
  `;
  
  if (result.count === 0) {
    throw new Error('Optimistic lock failed - entity was modified');
  }
  
  return result[0] as T;
}
```

#### Concurrency Rules by Domain

| Domain | Lock Type | Key | Reason |
|--------|-----------|-----|--------|
| **Battles** | Advisory | `battle:{battleId}` | Long transactions, multiple state changes |
| **Encounters** | Advisory | `encounter:{encounterId}` | Catch flow is multi-step |
| **Trainer Inventory** | Row lock | N/A (per row) | Simple CRUD, short transactions |
| **Trainer Money** | Row lock | N/A (per row) | Atomic increment/decrement |
| **Guild Config** | Optimistic | `version` column | Rare updates, read-heavy |
| **Component Config** | Optimistic | `version` column | Admin-only updates |

### 10.5) Discord I/O Policy (v1.1)

> **CRITICAL:** Clarify when direct Discord calls are allowed vs. when outbox is required.

```typescript
// sensai/kernel/discord-policy.ts
// v1.1: Discord interaction patterns

/**
 * DISCORD I/O RULES
 * 
 * Discord interactions require quick acknowledgement (3 second limit).
 * This creates tension with "all effects go through outbox" principle.
 * 
 * SOLUTION: Tiered response policy
 */

type DiscordResponseTier = 'immediate' | 'deferred' | 'outbox';

/**
 * IMMEDIATE (Direct call allowed)
 * - deferReply() / deferUpdate()
 * - Pure error messages (validation failures)
 * - "Thinking..." acknowledgements
 */
const IMMEDIATE_ALLOWED = [
  'deferReply',
  'deferUpdate', 
  'reply_error',  // Pure validation errors
] as const;

/**
 * DEFERRED (Direct call allowed after deferReply)
 * - Read-only queries (show party, show inventory)
 * - Simple acknowledgements ("Action received!")
 */
const DEFERRED_ALLOWED = [
  'editReply',  // After deferReply
  'followUp',   // Additional messages
] as const;

/**
 * OUTBOX (Required for all other effects)
 * - Battle results (need audit trail)
 * - Economy changes (need consistency)
 * - Cross-channel notifications
 * - DMs to users
 */

// Implementation: DiscordDriver with policy enforcement
class DiscordDriver {
  constructor(
    private readonly outbox: OutboxPrimitive,
    private readonly obs: ObsPrimitive,
    private readonly interaction: Interaction
  ) {}

  // IMMEDIATE tier - allowed directly
  async deferReply(): Promise<void> {
    await this.interaction.deferReply();
  }

  async replyError(message: string): Promise<void> {
    await this.interaction.reply({
      content: `❌ ${message}`,
      ephemeral: true,
    });
  }

  // DEFERRED tier - allowed after defer
  async editReply(content: string): Promise<void> {
    await this.interaction.editReply({ content });
  }

  // OUTBOX tier - ALWAYS goes through outbox
  async sendBattleResult(channelId: string, result: BattleResult): Promise<void> {
    await this.outbox.send({
      destination: 'discord',
      topic: 'battle_result',
      key: result.battleId,
      payload: {
        channelId,
        embeds: [formatBattleResult(result)],
      },
      correlationId: this.obs.correlationId,
    });
  }

  async sendDM(userId: string, content: string): Promise<void> {
    await this.outbox.send({
      destination: 'discord',
      topic: 'dm',
      key: `dm:${userId}:${Date.now()}`,
      payload: { userId, content },
      correlationId: this.obs.correlationId,
    });
  }

  async notifyChannel(channelId: string, content: string): Promise<void> {
    await this.outbox.send({
      destination: 'discord',
      topic: 'channel_message',
      key: `channel:${channelId}:${Date.now()}`,
      payload: { channelId, content },
      correlationId: this.obs.correlationId,
    });
  }
}
```

### 11.1) Complete Component Interface

```typescript
// sensai/types/component.ts

export type HostKind = 'bot' | 'worker' | 'cron' | 'cli';

export type Capability =
  | 'db.read' | 'db.write' | 'db.migrate'
  | 'discord.read' | 'discord.send' | 'discord.moderate'
  | 'network.http-egress'
  | 'admin.config' | 'admin.components';

export interface SensaiComponent {
  // Identity
  readonly name: string;
  readonly version: string;
  readonly description?: string;

  // Deployment
  readonly hosts: readonly HostKind[];
  readonly dependencies?: readonly string[];

  // Security
  readonly capabilities: {
    readonly db: readonly ('read' | 'write' | 'migrate')[];
    readonly discord?: readonly ('read' | 'send' | 'moderate')[];
    readonly network?: readonly ('http-egress')[];
  };

  // Data ownership
  readonly owns?: {
    readonly canonical?: readonly string[];
    readonly projections?: readonly string[];
  };

  // Resources
  readonly resources?: {
    readonly maxCacheMb?: number;
    readonly maxQueueSize?: number;
    readonly maxConcurrency?: number;
  };

  // Lifecycle
  onLoad?(ctx: ComponentContext): Promise<void>;
  onEnable?(ctx: ComponentContext): Promise<void>;
  onDisable?(ctx: ComponentContext): Promise<void>;
  onUnload?(ctx: ComponentContext): Promise<void>;

  // Handlers
  readonly handlers?: ComponentHandlers;
}

export interface ComponentHandlers {
  readonly discord?: Readonly<Record<string, DiscordHandler>>;
  readonly exports?: Readonly<Record<string, ExportHandler>>;
  readonly jobs?: Readonly<Record<string, JobHandler>>;
  readonly http?: Readonly<Record<string, HttpHandler>>;
  readonly cli?: Readonly<Record<string, CliHandler>>;
}
```

### 11.2) Handler Type Signatures

```typescript
// sensai/types/handlers.ts

import type { Interaction } from 'discord.js';

export type DiscordHandler = (
  interaction: Interaction,
  ctx: ComponentContext
) => Promise<void>;

export type ExportHandler = (
  envelope: ExportEnvelope,
  ctx: ComponentContext
) => Promise<void>;

export type JobHandler = (
  job: LeasedJob,
  ctx: ComponentContext
) => Promise<JobResult>;

export interface JobResult {
  status: 'success' | 'retry' | 'failed';
  output?: unknown;
  error?: Error;
  retryAfter?: Date;
}

export type HttpHandler = (
  req: HttpRequest,
  ctx: ComponentContext
) => Promise<HttpResponse>;

export interface HttpRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: unknown;
}

export interface HttpResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export type CliHandler = (
  args: string[],
  ctx: ComponentContext
) => Promise<number>;  // Exit code
```

### 11.3) Kernel Service Interfaces

```typescript
// sensai/types/kernel.ts

export interface SensaiKernel {
  // Core primitives
  readonly db: DbPrimitive;
  readonly exports: ExportsPrimitive;
  readonly jobs: JobsPrimitive;
  readonly outbox: OutboxPrimitive;
  readonly config: ConfigPrimitive;
  readonly rbac: RbacPrimitive;
  readonly obs: ObsPrimitive;
  readonly rng: RngPrimitive;
  readonly storage: StoragePrimitive;

  // Component management
  registerComponent(component: SensaiComponent): void;
  getComponent(name: string): SensaiComponent | undefined;
  listComponents(): SensaiComponent[];

  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  isReady(): boolean;
}

export interface ComponentRegistry {
  install(name: string, version: string, config: unknown, scope: ConfigScope): Promise<string>;
  enable(installationId: string): Promise<void>;
  disable(installationId: string, options?: DisableOptions): Promise<void>;
  uninstall(installationId: string): Promise<void>;
  list(filter?: InstallationFilter): Promise<ComponentInstallation[]>;
  get(installationId: string): Promise<ComponentInstallation | null>;
}
```

---

## 12) WORKED EXAMPLES

### 12.1) Security Guard Component

```typescript
// components/security/guard.ts

import type { SensaiComponent, ComponentContext, ExportEnvelope } from 'sensai/types';

export const SecurityGuardComponent: SensaiComponent = {
  name: 'security.guard',
  version: '1.0.0',
  description: 'Permission guardrails, rate limiting, and moderation',
  
  hosts: ['worker', 'bot'],
  dependencies: ['observability'],
  
  capabilities: {
    db: ['read', 'write'],
    discord: ['read', 'moderate'],
  },
  
  owns: {
    canonical: ['security_baselines', 'security_alerts'],
    projections: ['rate_limit_counters'],
  },
  
  resources: {
    maxCacheMb: 5,
    maxConcurrency: 10,
  },
  
  async onEnable(ctx) {
    ctx.obs.log.info({ component: 'security.guard' }, 'Security guard enabled');
    
    // Enqueue baseline scan job
    await ctx.jobs.enqueue({
      kind: 'SECURITY_BASELINE_SCAN',
      payload: { fullScan: true },
    });
  },
  
  handlers: {
    // Consume Discord interactions for rate limiting
    exports: {
      'discord.interaction.received': async (envelope, ctx) => {
        const { userId, guildId, commandName } = envelope.payload as {
          userId: string;
          guildId: string;
          commandName: string;
        };
        
        // Check rate limits
        const key = `rate:${userId}:${commandName}`;
        const count = ctx.cache.get<number>(key) ?? 0;
        
        if (count > 10) {
          // Emit rate limit violation
          await ctx.exports.append({
            source: 'security.guard',
            type: 'security.rate-limit.exceeded',
            idempotencyKey: `${userId}-${Date.now()}`,
            payload: { userId, guildId, commandName, count },
            occurredAt: new Date(),
            correlationId: ctx.obs.correlationId,
          });
          return;
        }
        
        ctx.cache.set(key, count + 1, 60000); // 1 minute TTL
      },
    },
    
    // Process security jobs
    jobs: {
      'SECURITY_BASELINE_SCAN': async (job, ctx) => {
        ctx.obs.log.info({ jobId: job.id }, 'Running baseline scan');
        
        // ... scan logic ...
        
        return { status: 'success', output: { scanned: 100, violations: 0 } };
      },
      
      'SECURITY_ALERT_DISPATCH': async (job, ctx) => {
        const { alertType, message, severity } = job.payload as {
          alertType: string;
          message: string;
          severity: 'low' | 'medium' | 'high' | 'critical';
        };
        
        // Send via outbox
        await ctx.outbox.send({
          destination: 'discord',
          topic: process.env.ALERT_CHANNEL_ID!,
          payload: { content: `🚨 [${severity.toUpperCase()}] ${alertType}: ${message}` },
          correlationId: ctx.obs.correlationId,
        });
        
        return { status: 'success' };
      },
    },
  },
};
```

### 12.2) CLI Tools Component

```typescript
// components/ops/cli-tools.ts

import type { SensaiComponent, ComponentContext } from 'sensai/types';

export const CliToolsComponent: SensaiComponent = {
  name: 'ops.cli-tools',
  version: '1.0.0',
  description: 'Operator CLI commands for database and system inspection',
  
  hosts: ['cli'],
  
  capabilities: {
    db: ['read'],  // Read-only!
  },
  
  handlers: {
    cli: {
      'db:counts': async (args, ctx) => {
        const tables = ['User', 'Trainer', 'Monster', 'Battle', 'Encounter'];
        
        console.log('=== Table Counts ===');
        for (const table of tables) {
          const count = await ctx.db.prisma[table.toLowerCase()].count();
          console.log(`${table}: ${count}`);
        }
        
        return 0;  // Exit code
      },
      
      'db:status': async (args, ctx) => {
        const result = await ctx.db.query<{ now: Date }[]>(
          'SELECT NOW() as now'
        );
        
        console.log('=== Database Status ===');
        console.log(`Connected: Yes`);
        console.log(`Server Time: ${result[0].now}`);
        
        return 0;
      },
      
      'ops:health': async (args, ctx) => {
        const health = await ctx.db.prisma.componentHealth.findMany({
          orderBy: { updatedAt: 'desc' },
          take: 10,
        });
        
        console.log('=== Component Health ===');
        for (const h of health) {
          console.log(`${h.componentName} @ ${h.hostId}: ${h.status}`);
        }
        
        return 0;
      },
    },
  },
};
```

### 12.3) Game Core Component (Partial)

```typescript
// components/game/core.ts

import type { SensaiComponent, ComponentContext } from 'sensai/types';

export const GameCoreComponent: SensaiComponent = {
  name: 'game.core',
  version: '1.0.0',
  description: 'Core gameplay state: trainers, monsters, battles, encounters',
  
  hosts: ['bot'],
  dependencies: ['observability'],
  
  capabilities: {
    db: ['read', 'write'],
    discord: ['read', 'send'],
  },
  
  owns: {
    canonical: ['User', 'Trainer', 'Monster', 'Party', 'Battle', 'Encounter'],
  },
  
  resources: {
    maxCacheMb: 20,  // L1 cache for Pokemon data
    maxConcurrency: 50,
  },
  
  async onLoad(ctx) {
    // Warm up L1 cache with Pokemon reference data
    const pokemon = await ctx.db.prisma.species.findMany();
    for (const p of pokemon) {
      ctx.cache.set(`pokemon:${p.id}`, p);
      ctx.cache.set(`pokemon:name:${p.name.toLowerCase()}`, p);
    }
    ctx.obs.log.info({ cached: pokemon.length }, 'L1 cache warmed');
  },
  
  handlers: {
    discord: {
      '/walk': async (interaction, ctx) => {
        const userId = interaction.user.id;
        
        // Get deterministic RNG for this user
        const rng = ctx.rng.derive([userId, new Date().toISOString().slice(0, 10)]);
        
        // Check for encounter
        const encounterChance = 0.3;
        if (rng.random() < encounterChance) {
          const pokemon = rng.pick(await getPokemonPool(ctx, 'grass'));
          
          // Create encounter in DB
          const encounter = await ctx.db.prisma.encounter.create({
            data: {
              userId,
              speciesId: pokemon.id,
              level: rng.int(5, 15),
              expiresAt: new Date(Date.now() + 300000),  // 5 minutes
            },
          });
          
          // Emit export for analytics
          await ctx.exports.append({
            source: 'game.core',
            type: 'encounter.spawned',
            idempotencyKey: encounter.id,
            payload: { encounterId: encounter.id, userId, speciesId: pokemon.id },
            occurredAt: new Date(),
            correlationId: ctx.obs.correlationId,
          });
          
          await interaction.reply(`A wild ${pokemon.name} appeared!`);
        } else {
          await interaction.reply('You walked around but found nothing...');
        }
      },
    },
    
    // Process game-related exports
    exports: {
      'trainer.money.request': async (envelope, ctx) => {
        const { trainerId, amount, reason } = envelope.payload as {
          trainerId: string;
          amount: number;
          reason: string;
        };
        
        // Only game.core can write to Trainer table
        await ctx.db.prisma.trainer.update({
          where: { id: trainerId },
          data: { money: { increment: amount } },
        });
        
        ctx.obs.log.info({ trainerId, amount, reason }, 'Money updated');
      },
    },
  },
};

async function getPokemonPool(ctx: ComponentContext, terrain: string) {
  // Use cached Pokemon data
  // Implementation details...
  return [];
}
```

### 12.4) Observability Component

```typescript
// components/observability/core.ts

import type { SensaiComponent, ComponentContext, LeasedJob } from 'sensai/types';

export const ObservabilityComponent: SensaiComponent = {
  name: 'observability',
  version: '1.0.0',
  description: 'Structured logging, metrics, health checks, correlation',
  
  hosts: ['bot', 'worker', 'cron', 'cli'],  // Runs everywhere
  
  capabilities: {
    db: ['read', 'write'],
  },
  
  owns: {
    canonical: ['runtime_metrics'],
    projections: ['alert_queue'],
  },
  
  async onLoad(ctx) {
    // Wrap all handlers with correlation and error handling
    wrapAllHandlers(ctx);
  },
  
  handlers: {
    http: {
      '/healthz': async (req, ctx) => {
        return { status: 200, body: { status: 'ok' } };
      },
      
      '/readyz': async (req, ctx) => {
        try {
          await ctx.db.query('SELECT 1');
          return { status: 200, body: { status: 'ready', db: 'ok' } };
        } catch (e) {
          return { status: 503, body: { status: 'not ready', db: 'error' } };
        }
      },
      
      '/metrics': async (req, ctx) => {
        const metrics = await gatherMetrics(ctx);
        return {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
          body: formatPrometheus(metrics),
        };
      },
    },
    
    jobs: {
      'METRICS_HEARTBEAT': async (job, ctx) => {
        await ctx.db.prisma.componentHealth.upsert({
          where: {
            componentName_hostId: {
              componentName: ctx.component.name,
              hostId: ctx.host.id,
            },
          },
          update: {
            status: 'healthy',
            lastHeartbeat: new Date(),
          },
          create: {
            componentName: ctx.component.name,
            hostId: ctx.host.id,
            status: 'healthy',
            lastHeartbeat: new Date(),
          },
        });
        
        return { status: 'success' };
      },
    },
  },
};

function wrapAllHandlers(ctx: ComponentContext) {
  // Implementation: wrap every handler with try/catch + correlation
}

async function gatherMetrics(ctx: ComponentContext) {
  // Implementation: collect metrics from all sources
  return {};
}

function formatPrometheus(metrics: Record<string, unknown>): string {
  // Implementation: format as Prometheus exposition format
  return '';
}
```

---

## 13) MIGRATION ROADMAP

### Phase 1: Foundation (COMPLETE ✅)
```
Week 1-2:
├─ ✅ DB-only policy enforcement
├─ ✅ Heap snapshots → SQLite
├─ ✅ Security state → PostgreSQL
├─ ✅ /Store cleanup (456 KB remaining)
└─ ✅ Migration tables (runtime_metrics, alert_queue, etc.)
```

### Phase 2: Kernel Primitives (Next)
```
Week 3-4:
├─ [ ] Create exports table with seq BIGSERIAL (v1.1 critical)
├─ [ ] Create export_type_registry for schema evolution (v1.1)
├─ [ ] Create jobs table with next_attempt_at + DLQ (v1.1)
├─ [ ] Create outbox_messages with sending state + leasing (v1.1)
├─ [ ] Create audit_events table + audit API
├─ [ ] Create projection_offsets table (seq-based, v1.1)
├─ [ ] Create hosts registry table (v1.1)
├─ [ ] Create worker_runs tracking table (v1.1)
├─ [ ] Create retention_policies configuration (v1.1)
└─ [ ] Implement kernel primitive interfaces
```

### Phase 2.5: Critical Hardening (v1.1)
```
Week 4-5:
├─ [ ] Implement control-plane watcher (polling)
├─ [ ] Implement component supervisor (hot enable/disable)
├─ [ ] Define concurrency model per domain:
│     ├─ Advisory locks for battles/encounters
│     ├─ Row locks for trainer inventory/money
│     └─ Optimistic concurrency for config
├─ [ ] Implement Discord I/O policy (immediate/deferred/outbox tiers)
├─ [ ] Implement single-writer enforcement (kernel-level)
└─ [ ] Define retention policies (7d jobs, 90d exports, 365d audit)
```

### Phase 3: Component Registry
```
Week 5-6:
├─ [ ] Create component_installations table
├─ [ ] Create component_health table
├─ [ ] Implement install/enable/disable/uninstall
├─ [ ] Host boot sequence (read DB, load components)
├─ [ ] Component upgrade strategy (v1.1: single active per scope)
└─ [ ] Feature flag integration
```

### Phase 4: First Component Migration
```
Week 7-8:
├─ [ ] Convert security bot to security.guard component
├─ [ ] Manifest + handlers + lifecycle hooks
├─ [ ] Test enable/disable without service restart
├─ [ ] Validate data ownership boundaries
└─ [ ] Document patterns for other teams
```

### Phase 5: Observability + Replay (v1.1)
```
Week 9-10:
├─ [ ] Extract logging/metrics to observability component
├─ [ ] Implement handler wrapping (correlation, errors)
├─ [ ] Add /healthz, /readyz, /metrics endpoints
├─ [ ] Heartbeat job for component health tracking
├─ [ ] Build replay harness using worker_runs (v1.1)
├─ [ ] Implement projection rebuild tooling (v1.1)
└─ [ ] Dashboard integration (Grafana)
```

### Phase 6: Game Components
```
Week 11-14:
├─ [ ] Split game logic into components:
│     ├─ game.core (canonical state)
│     ├─ game.homestead (UI flows)
│     ├─ game.encounters (wild spawns)
│     ├─ game.battles (combat engine)
│     └─ game.pokedex (reference data)
├─ [ ] Define data ownership per component
├─ [ ] Migrate existing code to component handlers
└─ [ ] Full integration testing
```

### Phase 7: Production Hardening + Retention (v1.1)
```
Week 15-16:
├─ [ ] Load testing (1000 events/sec)
├─ [ ] Failure injection (component crashes, DB slow)
├─ [ ] Implement degraded mode playbook (v1.1)
├─ [ ] Rollback procedures (disable → fallback)
├─ [ ] Enable retention workers (prune jobs, outbox, exports) (v1.1)
├─ [ ] Implement DLQ tooling (ops:dlq list/replay) (v1.1)
├─ [ ] Runbook updates
└─ [ ] Performance optimization (<1μs cache, <50μs writes)
```

---

## 14) NON-NEGOTIABLES

### 14.1) From Database Architect
- ❌ **No table can have multiple writers** — One owner component per table
- ❌ **No uninstall drops tables** — In production, tables stay; data is sacred
- ✅ **Schema migrations at deploy time** — Never runtime schema changes
- ✅ **Exports use seq for ordering (v1.1)** — UUIDs don't define clean order
- ✅ **Retention policies defined upfront (v1.1)** — Jobs 7d, exports 90d, audit 365d

### 14.2) From Distributed Systems Engineer
- ❌ **No handler direct calls** — Components communicate via exports/jobs/outbox
- ✅ **All handlers must be idempotent** — Safe to retry
- ✅ **Discord I/O tiered (v1.1)** — Immediate (ack), deferred (read-only), outbox (effects)
- ✅ **Control-plane watcher required (v1.1)** — Enable/disable must work without restart
- ✅ **Concurrency model explicit (v1.1)** — Advisory locks for battles, row locks for inventory

### 14.3) From TypeScript Specialist
- ❌ **No `Math.random()` in gameplay** — Use kernel RNG service
- ❌ **No `fs.writeFile`** — Use storage primitive or SQLite buffer
- ✅ **All caches must be bounded** — LRU with hard caps
- ✅ **Export schema versions tracked (v1.1)** — Safe payload evolution

### 14.4) From Security Engineer
- ✅ **Every privileged action → audit event** — Append-only audit log
- ✅ **Capabilities declared in manifest** — No implicit permissions
- ❌ **No hardcoded admin checks** — Use RBAC primitive
- ✅ **Single-writer enforcement (v1.1)** — Kernel checks or DB roles

### 14.5) From Game Designer
- ✅ **Critical state = strong consistency** — Battles, captures, inventory
- ✅ **Telemetry = eventual/async** — Logs, metrics, analytics
- ✅ **All RNG seeds logged** — Audit/replay capability
- ✅ **Worker runs tracked (v1.1)** — "What code processed this battle?"

### 14.6) From DevOps Engineer
- ✅ **Enable/disable via DB flags** — No restart required
- ✅ **Connection pooling awareness** — Prisma pools per process add up
- ❌ **No restart without permission** — No-restart policy enforced
- ✅ **Host registry maintained (v1.1)** — "What is running where?"
- ✅ **DLQ tooling available (v1.1)** — ops:dlq list/replay commands

### 14.7) From Performance Engineer
- ✅ **Components declare resource budgets** — Max cache MB, queue size, concurrency
- ❌ **No unbounded structures** — No raw Map/Array without limits
- ⚠️ **<50μs for DB writes is aspirational** — Reserve μs targets for in-memory
- ✅ **Degraded mode defined (v1.1)** — What happens when DB slow, Discord rate-limited

### 14.8) From Systems Architect (v1.1)
- ✅ **Component upgrades: single active version per scope** — Not multiple installed
- ✅ **Projection rebuilds documented** — Can rebuild from exports for 30-day window
- ✅ **Disaster recovery drilled** — Restore from snapshot, verify determinism

---

## 15) SUCCESS CRITERIA

### 15.1) Component Enablement
- [ ] Can enable/disable security bot logic **without redeploy** (when code is present)
- [ ] Can add a new worker component **without touching game component**
- [ ] A broken component can be disabled **without corrupting canonical state**

### 15.2) Data Integrity
- [ ] Can rebuild projections from exports/checkpoints
- [ ] Audit log captures all privileged actions
- [ ] No data loss on component disable/uninstall

### 15.3) Operational Visibility
- [ ] Operators can query "what is running" from DB
- [ ] Component health visible in dashboard
- [ ] Correlation IDs trace across all components

### 15.4) Performance
- [ ] <1μs L1 cache reads (Pokemon data, type chart)
- [ ] <100ms user-facing command response
- [ ] >95% cache hit rate
- [ ] Job queue processes 1000+ jobs/minute

### 15.5) Reliability
- [ ] Zero data loss during component lifecycle operations
- [ ] Graceful degradation when dependencies fail
- [ ] No cascading failures between components

---

## APPENDIX A: TIER 1 vs TIER 2 IMPLEMENTATION

### Tier 1: Compiled Components + DB Enablement (DO THIS NOW)
- New component ships in container image (normal deploy)
- "Install" means: register in DB + enable via config
- This already feels like an OS package manager operationally
- **Recommended for production with active users**

### Tier 2: Runtime Install via Sandbox (FUTURE)
- Store plugin bundles (WASM) in DB object store
- Load in sandbox with narrow syscall API
- Real "install at runtime" without redeploy
- **Much more engineering and security work**

Given you're in production with active users, **Tier 1 is the right first move**.

---

## APPENDIX B: DEGRADED MODE PLAYBOOK (v1.1)

### When Postgres is Slow/Unreachable
```
1. Admission control: reject new exports beyond queue threshold
2. Enable read-only mode for /home commands
3. Auto-disable non-critical components (pokedex.sync, observability)
4. Maintain core gameplay via SQLite buffer
5. Alert operators + auto-retry connection
```

### When Discord Rate Limits Spike
```
1. Outbox deliverer backs off exponentially
2. Queue depth monitored; warn at 75%, reject at 95%
3. User-facing interactions remain responsive (immediate tier)
4. Non-critical DMs queued for later delivery
```

### When Worker Queue Explodes
```
1. Backpressure activated at 75% queue capacity
2. New jobs rejected at 95%
3. Priority jobs still accepted (battles, captures)
4. Alert operators + scale assessment
5. Consider temporary component disable
```

---

## APPENDIX C: DOCUMENT CROSS-REFERENCES

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE-OVERHAUL-HANDOVER.md](./ARCHITECTURE-OVERHAUL-HANDOVER.md) | Team handover + context |
| [SENSAI-COMPONENT-OS-BLUEPRINT.md](./SENSAI-COMPONENT-OS-BLUEPRINT.md) | Original blueprint |
| [SENSAI-ARCHITECTURE-ADDENDUM.md](./SENSAI-ARCHITECTURE-ADDENDUM.md) | v1.1 deltas + feedback (NEW) |
| [OS-Design-Theory.md](./Sensai-Project-Bible/Operating-System-Design/OS-Design-Theory.md) | Database-substrate theory |
| [STORE-WRITE-ELIMINATION.md](./STORE-WRITE-ELIMINATION.md) | DB-only policy |
| [prisma-7-bible.md](../prisma-7-bible.md) | Prisma migration guide |

---

## APPENDIX D: v1.1 CHANGELOG

### Schema Changes
- **exports.seq**: Added BIGSERIAL for monotonic ordering
- **exports.schema_version**: Added INT for payload evolution
- **export_type_registry**: New table for schema management
- **jobs.next_attempt_at**: Added explicit retry scheduling
- **jobs.dead_lettered_at**: Added DLQ support
- **jobs.partition_key**: Added per-entity serialization
- **outbox_messages.next_attempt_at**: Added retry scheduling
- **outbox_messages.leased_by/leased_until**: Added lease tracking
- **projection_offsets.last_seq**: Changed from UUID to seq-based
- **hosts**: New table for service registry
- **worker_runs**: New table for replay/audit
- **retention_policies**: New table for data lifecycle

### Contract Changes
- **ExportsPrimitive.append()**: Now returns `{ id, seq }`
- **ExportsPrimitive.consumeFrom()**: New seq-based consumption
- **ExportFilter.fromSeq/toSeq**: New seq-based filtering

### New Sections
- **§10.3 Control Plane Watcher**: Hot enable/disable mechanism
- **§10.4 Concurrency Model**: Advisory locks, row locks, optimistic
- **§10.5 Discord I/O Policy**: Immediate/deferred/outbox tiers
- **§13 Phase 2.5**: Critical hardening phase added
- **Appendix B**: Degraded mode playbook

### Non-Negotiables Added
- Export seq ordering
- Control-plane watcher required
- Concurrency model explicit
- Discord I/O tiered
- Single-writer enforcement
- Host registry maintained
- DLQ tooling available
- Degraded mode defined
- Component upgrade strategy

---

**Document Version:** 1.1.0  
**Status:** APPROVED — Incorporates Feedback Addendum  
**Previous Version:** 1.0.0 (December 28, 2025)  
**Next Review:** After Phase 2.5 completion  
**Authors:** 10-Specialist Panel + Architecture Team  
**Last Updated:** December 28, 2025
