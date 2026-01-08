---
applyTo: '**'
---

# Sensai OS Instructions — Pokémon Infinity Gauntlet

**Version:** 1.2.0  
**Status:** ACTIVE — Standard Operating System  
**Authority:** Project Leadership (DRIPTVDD)

> **v1.1.2 Patterns (MANDATORY):** All development MUST implement:
> - **TenantScope** — `{ tenantId, guildId }` in every envelope
> - **runGuarded()** — All handlers wrapped for observability + error capture
> - **SensaiError** — Typed error taxonomy (codes 1xxx-6xxx)
> - **Boot Logger** — Observability starts BEFORE database connection
>
> **Full Specification:** `docs/projects/SensaiOS/SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md`

---

## 🎯 CRITICAL: What is Sensai?

**Sensai is the standard operating system for Pokémon Infinity Gauntlet.** It is NOT "Linux, but SQL" — it is a **runtime + contracts** that make the database behave like an operating system substrate.

### The Golden Invariant (MEMORIZE THIS)

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

This is the **ONE RULE** that makes the entire architecture work.

---

## 📋 SENSAI QUICK REFERENCE

### Sensai vs Traditional OS Mapping

| Traditional OS | Sensai Equivalent |
|----------------|-------------------|
| Syscalls | Database transactions |
| Processes | Workers (ingest/project/deliver/gc) |
| Filesystem | DB-backed object store |
| Packages | Installable/removable components |
| IPC | Exports + Jobs + Outbox |

### Core Principles (NON-NEGOTIABLE)

1. **Database as Substrate** — No traditional file I/O. Only database transactions. `/Store` contains only SQLite files.
2. **Append-Only Facts** — All external inputs become immutable export records.
3. **Workers as Kernel Services** — Schedulers, importers, indexers, exporters = workers with standardized contracts.
4. **Transactional System Calls** — Every operation is an atomic transaction.
5. **Explicit Data Ownership** — Each table has ONE owner component (only writer).
6. **Safe Removability** — Disabling a component stops behavior without corrupting state.
7. **Multi-Tenant by Default** — Every envelope carries TenantScope (v1.1.2)
8. **Observability-First** — Boot logger starts before DB; all handlers wrapped via `runGuarded()` (v1.1.2)

---

## 🆕 v1.1.2 PATTERNS (MANDATORY FOR ALL NEW CODE)

### TenantScope — Multi-Tenant Context

Every envelope, log entry, and metric MUST include tenant scope:

```typescript
/** TenantScope is MANDATORY in all envelopes (v1.1.2 Enhanced) */
interface TenantScope {
  /**
   * Tenant identifier
   * - For Discord: guild ID (multi-tenant per guild)
   * - For System: "system" or service name
   * - For User: "user:{userId}" (homestead context)
   */
  tenant: string;

  /** Deployment environment */
  environment: 'production' | 'staging' | 'development';

  /** Service name (e.g., "infinity-gauntlet") */
  service: string;

  /** Component within the service (e.g., "battle-engine", "homestead") */
  component: string;

  /** Optional: Instance identifier (for worker processes) */
  instance?: string;

  /** Optional: Region/zone (for distributed deployments) */
  region?: string;
}

/** Example envelope with scope */
interface ExportEnvelope {
  source: string;
  type: string;
  scope: TenantScope;           // ← MANDATORY
  idempotencyKey: string;
  payload: unknown;
  occurredAt: Date;
  correlationId: string;
}

// Usage in handlers — use factory functions
import { scopeFromInteraction, scopeFromGuild, systemScope } from '../sensaios/tenant-scope.js';

await ctx.exports.append({
  source: 'game.battles',
  type: 'battle.completed',
  scope: scopeFromInteraction(interaction),  // Auto-extracts tenant, env, service
  idempotencyKey: `battle-${battleId}`,
  payload: { battleId, winnerId, loserId },
  occurredAt: new Date(),
  correlationId: ctx.obs.correlationId,
});
```

### runGuarded() — Handler Wrapper

ALL handlers MUST be wrapped with `runGuarded()` for:
- Automatic correlation ID propagation
- Structured error capture with SensaiError
- Timing metrics emission
- Graceful error responses

```typescript
import { runGuarded } from '../kernel/guarded.js';

// ❌ WRONG - Unguarded handler
export async function handleBattleCommand(interaction: CommandInteraction) {
  // No error boundary, no correlation, no metrics
}

// ✅ CORRECT - Guarded handler
export const handleBattleCommand = runGuarded(
  'discord.battle.command',
  async (ctx: ComponentContext, interaction: CommandInteraction) => {
    // Automatic correlation ID in ctx.obs.correlationId
    // Automatic error capture if this throws
    // Automatic timing metrics emitted
    
    const battle = await ctx.db.transaction(async (tx) => {
      return createBattle(tx, interaction.user.id, challengedUserId);
    });
    
    ctx.obs.log.info('Battle created', { battleId: battle.id });
  }
);
```

### SensaiError — Typed Error Taxonomy

All errors MUST use SensaiError with appropriate codes:

```typescript
import { SensaiError } from '../kernel/errors.js';

/** Error code ranges */
// 1xxx = KERNEL errors (boot, shutdown, primitives)
// 2xxx = DATABASE errors (connection, transaction, query)
// 3xxx = COMPONENT errors (lifecycle, handlers, manifest)
// 4xxx = VALIDATION errors (input, schema, business rules)
// 5xxx = EXTERNAL errors (Discord API, HTTP, third-party)
// 6xxx = GAME errors (battle, encounter, inventory)

/** Throwing typed errors */
throw new SensaiError({
  code: 6001,
  message: 'Invalid battle state transition',
  context: { battleId, currentState, attemptedState },
  cause: originalError,  // Optional wrapped error
});

/** Error handling in runGuarded */
// runGuarded automatically:
// 1. Catches any thrown error
// 2. Wraps non-SensaiError in SensaiError (code 3999)
// 3. Logs with full context and correlation
// 4. Returns graceful error response to Discord
```

### Boot Logger — Observability-First Startup

The boot sequence MUST initialize logging BEFORE database:

```typescript
/** CORRECT boot sequence */
async function bootKernel(): Promise<void> {
  // PHASE 1: Boot logger (FIRST - no dependencies)
  const bootLog = createBootLogger('kernel');
  bootLog.info('Kernel boot started');
  
  // PHASE 2: Load configuration (env vars, feature flags)
  const config = loadConfig();
  bootLog.info('Config loaded', { environment: config.env });
  
  // PHASE 3: Connect database (NOW we have logging if it fails)
  try {
    await connectDatabase(config.databaseUrl);
    bootLog.info('Database connected');
  } catch (error) {
    bootLog.fatal('Database connection failed', { error });
    throw error;  // Boot logger captured the failure
  }
  
  // PHASE 4: Initialize kernel primitives
  const kernel = await initializeKernel(config);
  bootLog.info('Kernel primitives ready');
  
  // PHASE 5: Load and enable components
  await kernel.supervisor.loadAll();
  bootLog.info('Components loaded');
}
```

---

## 🏗️ LAYERED ARCHITECTURE (v1.2.0)

```
LAYER 5: v1.2.0 ADVANCED SUBSYSTEMS
└── Storage (CAS), Concurrency (Locks), Visualization, Delegation

LAYER 4: SYSTEM SERVICES (Control Plane)
└── RBAC, Audit, Quotas, Schedule, Config

LAYER 3: WORKER RUNTIME (Kernel Services)  
└── INGEST → PROJECT → DELIVER → GC

LAYER 2: EXPORT LOG (Ingestion Front Door)
└── Append-only event log with monotonic seq

LAYER 1: OBJECT STORE (Big Bytes)
└── Blobs stored in DB (SHA-256 content-addressable)

LAYER 0: STORAGE (The Only Place That Writes)
└── PostgreSQL with WAL + SQLite buffer
```

---

## 🆕 v1.2.0 ADVANCED SUBSYSTEMS

### Content-Addressable Storage
```typescript
// SHA-256 blob storage with deduplication
interface ContentAddressableStorage {
  put(data: Buffer): Promise<string>;  // Returns SHA-256 hash ID
  get(id: string): Promise<Buffer | null>;
  exists(id: string): Promise<boolean>;
  delete(id: string): Promise<void>;
  getStats(): Promise<StorageStats>;
}
// Implementation: src/sensaios/storage/content-addressable.ts (340 lines)
```

### Lock Manager (Deadlock Prevention)
```typescript
// Advisory locks with domains and automatic cleanup
interface LockManager {
  acquire(domain: LockDomain, key: string, scope: TenantScope): Promise<LockHandle>;
  release(handle: LockHandle): Promise<void>;
  isHeld(domain: LockDomain, key: string): Promise<boolean>;
  getStats(): Promise<LockStats>;
}
// Domains: 'battle', 'encounter', 'trainer', 'guild', 'component'
// Implementation: src/sensaios/concurrency/lock-manager.ts (410 lines)
```

### Dependency Graph Visualization
```typescript
// Multi-format output (ASCII, Mermaid, JSON)
interface DependencyGraphVisualizer {
  toAscii(data: GraphData): string;
  toMermaid(data: GraphData): string;
  toJson(data: GraphData): ComponentGraph;
  calculateMaxDepth(data: GraphData): number;
}
// Implementation: src/sensaios/visualization/dependency-graph.ts (370 lines)
```

### Capability Delegation
```typescript
// Time-bounded grants with chain limits
interface CapabilityDelegationManager {
  delegate(req: DelegationRequest): Promise<DelegationToken>;
  validate(tokenId: string, delegatee: string, scope: TenantScope): Promise<boolean>;
  revoke(tokenId: string): Promise<void>;
  getStats(): Promise<DelegationStats>;
}
// Max TTL: 3600s (1 hour) | Max chain depth: 3 | Cleanup interval: 5 min
// Implementation: src/sensaios/capabilities/delegation.ts (490 lines)
```

---

## 📦 KERNEL PRIMITIVES

Every component gets access to these mandatory primitives via `ComponentContext`:

### 1. Database Access (`ctx.db`)
```typescript
interface DbPrimitive {
  prisma: PrismaClient;
  transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}
```

### 2. Export Log (`ctx.exports`) — v1.1.2 Enhanced
```typescript
interface ExportsPrimitive {
  /** Append export with mandatory TenantScope */
  append(envelope: ExportEnvelope): Promise<AppendResult>;
  
  /** Query exports with scope filtering */
  query(filter: ExportFilter): Promise<ExportEnvelope[]>;
  
  /** Get projection offset for replay */
  getOffset(projection: string): Promise<number>;
  
  /** Set projection offset after processing */
  setOffset(projection: string, seq: number): Promise<void>;
  
  /** Consume exports from sequence with type filtering */
  consumeFrom(seq: number, types: string[], limit?: number): Promise<ExportEnvelope[]>;
}

/** ExportEnvelope MUST include scope (v1.1.2) */
interface ExportEnvelope {
  source: string;              // Component name
  type: string;                // Export type (e.g., 'battle.completed')
  scope: TenantScope;          // ← MANDATORY v1.1.2
  idempotencyKey: string;      // Dedup key
  payload: unknown;            // Type-specific data
  occurredAt: Date;            // Event timestamp
  correlationId: string;       // Request trace ID
}
```

### 3. Job Queue (`ctx.jobs`) — v1.1.2 Enhanced
```typescript
interface JobsPrimitive {
  /** Enqueue job with mandatory TenantScope */
  enqueue(envelope: JobEnvelope): Promise<string>;
  
  /** Lease available jobs (respects scope isolation) */
  lease(kinds: string[], limit?: number): Promise<LeasedJob[]>;
  
  /** Mark job completed */
  complete(jobId: string, result: JobResult): Promise<void>;
  
  /** Mark job failed with retry scheduling */
  fail(jobId: string, error: SensaiError, retryAfter?: Date): Promise<void>;
}

/** JobEnvelope MUST include scope (v1.1.2) */
interface JobEnvelope {
  kind: string;                // Job type
  scope: TenantScope;          // ← MANDATORY v1.1.2
  payload: unknown;            // Job-specific data
  scheduledFor?: Date;         // Delayed execution
  correlationId: string;       // Request trace ID
}
```

### 4. Outbox (`ctx.outbox`) — v1.1.2 Enhanced
```typescript
interface OutboxPrimitive {
  /** Send message with mandatory TenantScope */
  send(envelope: OutboxEnvelope): Promise<string>;
  
  /** Mark message delivered */
  markDelivered(id: string): Promise<void>;
  
  /** Mark message failed */
  markFailed(id: string, error: SensaiError): Promise<void>;
}

/** OutboxEnvelope MUST include scope (v1.1.2) */
interface OutboxEnvelope {
  destination: string;         // Target system ('discord', 'webhook', etc.)
  topic: string;               // Message topic
  key: string;                 // Ordering key
  scope: TenantScope;          // ← MANDATORY v1.1.2
  payload: unknown;            // Message payload
  correlationId: string;       // Request trace ID
}
```

### 5. Configuration (`ctx.config`)
```typescript
interface ConfigPrimitive {
  get<T>(key: string, scope?: ConfigScope): Promise<T | undefined>;
  set<T>(key: string, value: T, scope?: ConfigScope): Promise<void>;
  getComponentConfig<T>(component: string): Promise<T>;
  getFeatureFlag(flag: string, scope?: TenantScope): Promise<boolean>;
}
```

### 6. RBAC (`ctx.rbac`)
```typescript
interface RbacPrimitive {
  /** Assert capability with SensaiError on failure (v1.1.2) */
  assert(capability: Capability, scope: TenantScope): Promise<void>;
  
  /** Check capability without throwing */
  check(capability: Capability, scope: TenantScope): Promise<boolean>;
  
  /** Audit privileged actions */
  audit(event: AuditEvent): Promise<void>;
}
```

### 7. Observability (`ctx.obs`) — v1.1.2 Enhanced
```typescript
interface ObsPrimitive {
  /** Structured logging with automatic context */
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
  
  /** Current correlation ID (auto-propagated by runGuarded) */
  correlationId: string;
  
  /** Create child context with new correlation */
  withCorrelation(id: string): ObsPrimitive;
  
  /** Current tenant scope (v1.1.2) */
  scope: TenantScope;
}
```

### 8. Deterministic RNG (`ctx.rng`)
```typescript
interface RngPrimitive {
  derive(seedParts: string[]): DeterministicRng;
}

interface DeterministicRng {
  /** Random float [0, 1) */
  random(): number;
  
  /** Random integer [min, max] */
  int(min: number, max: number): number;
  
  /** Weighted random selection */
  weighted<T>(items: Array<{ weight: number; value: T }>): T;
  
  /** Shuffle array deterministically */
  shuffle<T>(array: T[]): T[];
}
```

### 9. Object Store (`ctx.storage`)
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

## 🧩 COMPONENT MODEL

### Component Manifest (REQUIRED STRUCTURE)

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

### Host Types

| Host Type | Purpose | Example Components |
|-----------|---------|-------------------|
| `bot` | Discord interactions | game.core, game.homestead, discord.core |
| `worker` | Background processing | outbox.deliverer, cache.maintainer |
| `cron` | Scheduled jobs | scheduler.core, pokedex.fallback |
| `cli` | Operator tooling | ops.cli-tools, db.cli |

### THE ONE RULE THAT PREVENTS CHAOS

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

## 📊 DATA OWNERSHIP RULES

### Cardinal Rule

```
EACH TABLE HAS EXACTLY ONE OWNER COMPONENT.
THAT COMPONENT IS THE ONLY WRITER.
OTHER COMPONENTS READ VIA PROJECTIONS OR QUERIES.
```

### Data Classification

| Category | Owner | Mutability | Rebuild Strategy |
|----------|-------|------------|------------------|
| **Canonical** | Single component | Authoritative writes | N/A (source of truth) |
| **Projection** | Projection worker | Derived from exports | Rebuild from export log |
| **Cache** | Cache component | Ephemeral | Regenerate from canonical |
| **Audit** | Kernel | Append-only | Never modified |

### Cross-Component Data Access

**✅ ALLOWED:** Read another component's data
```typescript
const trainers = await ctx.db.prisma.trainer.findMany({
  where: { region: 'kanto' }
});
```

**❌ FORBIDDEN:** Write to another component's table
```typescript
await ctx.db.prisma.trainer.update({  // ❌ VIOLATION
  where: { id: trainerId },
  data: { money: 1000 }
});
```

**✅ CORRECT PATTERN:** Request change via export
```typescript
await ctx.exports.append({
  source: 'component-a',
  type: 'trainer.money.request',
  idempotencyKey: `${trainerId}-${Date.now()}`,
  payload: { trainerId, amount: 1000, reason: 'reward' },
  occurredAt: new Date(),
  correlationId: ctx.obs.correlationId,
});
// game.core handles the export and does the write
```

---

## 🔒 CONCURRENCY MODEL

### Lock Types by Domain

| Domain | Lock Type | Key | Reason |
|--------|-----------|-----|--------|
| **Battles** | Advisory | `battle:{battleId}` | Long transactions, multiple state changes |
| **Encounters** | Advisory | `encounter:{encounterId}` | Catch flow is multi-step |
| **Trainer Inventory** | Row lock | N/A (per row) | Simple CRUD, short transactions |
| **Trainer Money** | Row lock | N/A (per row) | Atomic increment/decrement |
| **Guild Config** | Optimistic | `version` column | Rare updates, read-heavy |
| **Component Config** | Optimistic | `version` column | Admin-only updates |

### Advisory Lock Pattern (Battles/Encounters)
```typescript
async function withEntityLock<T>(
  scope: LockScope,
  entityId: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = lockKeyForScope(scope, entityId);
  
  return await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
    return await fn();
  });
}
```

---

## 📱 DISCORD I/O POLICY

### Response Tiers

| Tier | When | Discord Methods Allowed |
|------|------|------------------------|
| **IMMEDIATE** | Initial acknowledgement | `deferReply()`, `deferUpdate()`, error messages |
| **DEFERRED** | After defer, read-only | `editReply()`, `followUp()` |
| **OUTBOX** | All state-changing effects | Battle results, DMs, notifications |

### Examples

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
    await this.outbox.send({
      destination: 'discord',
      topic: 'battle_result',
      key: result.battleId,
      payload: { channelId, embeds: [formatBattleResult(result)] },
      correlationId: this.obs.correlationId,
    });
  }
}
```

---

## 🚨 NON-NEGOTIABLES (ENFORCEMENT REQUIRED)

### From Database Architect
- ❌ **No table can have multiple writers** — One owner component per table
- ❌ **No uninstall drops tables** — In production, tables stay; data is sacred
- ✅ **Schema migrations at deploy time** — Never runtime schema changes
- ✅ **Exports use seq for ordering** — UUIDs don't define clean order

### From Distributed Systems Engineer
- ❌ **No handler direct calls** — Components communicate via exports/jobs/outbox
- ✅ **All handlers must be idempotent** — Safe to retry
- ✅ **Discord I/O tiered** — Immediate/deferred/outbox pattern

### From TypeScript Specialist
- ❌ **No `Math.random()` in gameplay** — Use kernel RNG service
- ❌ **No `fs.writeFile`** — Use storage primitive or SQLite buffer
- ✅ **All caches must be bounded** — LRU with hard caps

### From Security Engineer
- ✅ **Every privileged action → audit event** — Append-only audit log
- ✅ **Capabilities declared in manifest** — No implicit permissions
- ❌ **No hardcoded admin checks** — Use RBAC primitive

### From Game Designer
- ✅ **Critical state = strong consistency** — Battles, captures, inventory
- ✅ **Telemetry = eventual/async** — Logs, metrics, analytics
- ✅ **All RNG seeds logged** — Audit/replay capability

---

## 📁 COMPONENT FILE STRUCTURE

```
src/sensai/
├── kernel/
│   ├── index.ts              # Kernel bootstrap
│   ├── primitives/           # db, exports, jobs, outbox, etc.
│   ├── supervisor.ts         # Component lifecycle manager
│   ├── control-plane.ts      # Watcher for enable/disable
│   └── concurrency.ts        # Lock management
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
└── types/
    ├── component.ts          # SensaiComponent interface
    ├── handlers.ts           # Handler type signatures
    └── kernel.ts             # Kernel service interfaces
```

---

## 🔄 COMPONENT LIFECYCLE

### State Machine

```
UNINSTALLED → [install] → INSTALLED (disabled) → [enable] → ENABLED (active)
                                ↑                              ↓
                                └────── [disable] ────────────┘
                                              ↓
                              [uninstall] → UNINSTALLED
```

### Lifecycle Operations

1. **INSTALL**: Register in DB, validate config (enabled=false)
2. **ENABLE**: Load manifest, register handlers, call `onEnable()`
3. **DISABLE**: Unregister handlers, drain work, call `onDisable()`
4. **UNINSTALL**: Ensure disabled first, remove from registry (NEVER drop tables)

---

## 📚 REFERENCE DOCUMENTATION

### Primary Sources (SENSAI Architecture)
- **Final Architecture Spec:** `docs/projects/SensaiOS/SENSAI-FINAL-ARCHITECTURE.md` — Master canonical specification
- **OS Security Model:** `docs/projects/SensaiOS/architecture/06-os-security-model.md` — Ring security model, capability system, ESLint enforcement
- **Component OS Blueprint:** `docs/projects/SensaiOS/SENSAI-COMPONENT-OS-BLUEPRINT.md` — Component model design
- **Architecture Addendum (v1.1):** `docs/projects/SensaiOS/SENSAI-ARCHITECTURE-ADDENDUM.md` — Scalability patterns
- **Multi-Tenant + Obs-First (v1.1.2):** `docs/projects/SensaiOS/SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md` — TenantScope, runGuarded, SensaiError
- **Quick Reference Card:** `docs/projects/SensaiOS/SENSAI-QUICK-REFERENCE.md` — Cheat sheet for key patterns

### Implementation Guides
- **Store Write Elimination:** `docs/projects/STORE-WRITE-ELIMINATION.md`
- **Prisma 7 Bible:** `docs/prisma-7-bible.md`
- **Database Operations:** `docs/operations-bible/database-operations-runbook-comprehensive.md`
- **Architecture Bible:** `docs/architecture-bible/INDEX.md` — 27 sections covering complete system design
- **Operations Bible:** `docs/operations-bible/INDEX.md` — 13 sections + 9 guides

---

## 🛡️ RING SECURITY MODEL (v1.1.2)

### ESLint Enforcement (Compile-Time Boundary Checks)

**Ring boundary violations are caught at compile-time via ESLint `import/no-restricted-paths` rules.**

#### Ring Definitions

| Ring Level | Code Paths | Purpose |
|------------|------------|---------|
| **Ring 0 (Kernel)** | `src/kernel/**` | Core primitives (db, exports, jobs, outbox, rng, storage) |
| **Ring 1 (SensaiOS)** | `src/sensaios/**` | OS layer (component runtime, supervisor, capabilities) |
| **Ring 3 (Apps)** | `src/bot/**`, `src/core/**`, `src/services/**` | User-space applications |

#### Import Rules (ESLint Configuration)

```javascript
// eslint.config.js enforces these rules:

// Ring 0 (Kernel): CANNOT import from any upper rings
// - ❌ Ring 0 → Ring 1 (SensaiOS)
// - ❌ Ring 0 → Ring 3 (Apps)

// Ring 1 (SensaiOS): CANNOT import from Ring 3 (Apps)
// - ✅ Ring 1 → Ring 0 (Kernel) — allowed
// - ❌ Ring 1 → Ring 3 (Apps)

// Ring 3 (Apps): CANNOT import from Ring 0 or Ring 1 directly
// - ❌ Ring 3 → Ring 0 (Kernel) — use ComponentContext instead
// - ❌ Ring 3 → Ring 1 (SensaiOS) — use ComponentContext interface
// - ✅ Ring 3 → Ring 3 (Apps) — allowed
```

#### Violation Examples

```typescript
// ❌ BLOCKED: App importing Kernel
import { DbPrimitive } from '../../kernel/primitives/db';
// ESLint: 🚫 Ring 3 must use ComponentContext, not Ring 0 directly

// ✅ CORRECT: Use ComponentContext
export const handler = runGuarded('app.handler', async (ctx: ComponentContext) => {
  await ctx.db.transaction(async (tx) => { /* ... */ });
});

// ❌ BLOCKED: SensaiOS importing Apps
import { BattleEngine } from '../../bot/game/engine';
// ESLint: 🚫 Ring 1 cannot import Ring 3 (SensaiOS is OS layer)

// ✅ CORRECT: Apps register handlers via manifest
export class Supervisor {
  async loadComponent(manifest: AppManifest) {
    const component = await import(manifest.entryPoint);
    await component.onLoad(ctx);
  }
}
```

**Verification:** Run `npm run lint` to check for ring boundary violations.

**Documentation:** See `docs/projects/SensaiOS/architecture/06-os-security-model.md` § 3 Visibility & Access Control.

---

## ✅ IMPLEMENTATION CHECKLIST

When implementing ANY Sensai component:

- [ ] Component manifest has all required fields (name, version, hosts, capabilities)
- [ ] Data ownership declared (canonical tables, projections)
- [ ] Resource budgets specified (maxCacheMb, maxQueueSize)
- [ ] All handlers are idempotent
- [ ] No direct handler-to-handler calls
- [ ] Cross-component communication via exports/jobs/outbox only
- [ ] RNG uses `ctx.rng.derive()`, not `Math.random()`
- [ ] File I/O uses `ctx.storage`, not `fs`
- [ ] Caches are bounded with hard limits
- [ ] Discord responses follow tier rules (immediate/deferred/outbox)
- [ ] Privileged actions emit audit events
- [ ] Correlation IDs propagated through all operations
- [ ] **Tenant scope attached to all envelopes** (v1.1.2)
- [ ] **Handlers registered via `runGuarded()` wrapper** (v1.1.2)
- [ ] **Errors use `SensaiError` taxonomy** (v1.1.2)
- [ ] **Ring boundaries respected** — No Ring 3 → Ring 0/1 imports (ESLint enforced)
- [ ] **Content-addressable storage for blobs** (v1.2.0)
- [ ] **Advisory locks for critical sections** (v1.2.0)
- [ ] **Delegation tokens time-bounded** — Max 1h TTL (v1.2.0)

---

**Document Version:** 1.4.0  
**Created:** December 28, 2025  
**Updated:** January 8, 2026 — Added v1.2.0 Advanced Subsystems (CAS, Locks, Visualization, Delegation)  
**Purpose:** AI Agent guidance for Sensai OS development  
**Authority:** Supersedes all previous architecture instructions

