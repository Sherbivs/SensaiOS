---
applyTo: '**'
---

# Sensai OS Instructions — Pokémon Infinity Gauntlet

**Version:** 1.1.0  
**Status:** ACTIVE — Standard Operating System  
**Authority:** Project Leadership (DRIPTVDD)

> **v1.1.2 Addendum:** See `docs/projects/SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md` for:
> - Multi-tenant scope (tenantId + guildId) as mandatory envelope field
> - Observability-first boot sequence (logging before DB connect)
> - Guarded execution (`runGuarded()`) for all handlers
> - Typed error taxonomy (`SensaiError`)

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
7. **Multi-Tenant by Default** — Every envelope carries `scope: { tenantId, guildId }` (v1.1.2)
8. **Observability-First** — Boot logger starts before DB; all handlers wrapped via `runGuarded()` (v1.1.2)

---

## 🏗️ LAYERED ARCHITECTURE

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

### 2. Export Log (`ctx.exports`)
```typescript
interface ExportsPrimitive {
  append(envelope: ExportEnvelope): Promise<AppendResult>;
  query(filter: ExportFilter): Promise<ExportEnvelope[]>;
  getOffset(projection: string): Promise<number>;
  setOffset(projection: string, seq: number): Promise<void>;
  consumeFrom(seq: number, types: string[], limit?: number): Promise<ExportEnvelope[]>;
}
```

### 3. Job Queue (`ctx.jobs`)
```typescript
interface JobsPrimitive {
  enqueue(envelope: JobEnvelope): Promise<string>;
  lease(kinds: string[], limit?: number): Promise<LeasedJob[]>;
  complete(jobId: string, result: JobResult): Promise<void>;
  fail(jobId: string, error: Error, retryAfter?: Date): Promise<void>;
}
```

### 4. Outbox (`ctx.outbox`)
```typescript
interface OutboxPrimitive {
  send(envelope: OutboxEnvelope): Promise<string>;
  markDelivered(id: string): Promise<void>;
  markFailed(id: string, error: Error): Promise<void>;
}
```

### 5. Configuration (`ctx.config`)
```typescript
interface ConfigPrimitive {
  get<T>(key: string, scope?: ConfigScope): Promise<T | undefined>;
  set<T>(key: string, value: T, scope?: ConfigScope): Promise<void>;
  getComponentConfig<T>(component: string): Promise<T>;
  getFeatureFlag(flag: string, scope?: ConfigScope): Promise<boolean>;
}
```

### 6. RBAC (`ctx.rbac`)
```typescript
interface RbacPrimitive {
  assert(capability: Capability, scope: Scope): Promise<void>;
  check(capability: Capability, scope: Scope): Promise<boolean>;
  audit(event: AuditEvent): Promise<void>;
}
```

### 7. Observability (`ctx.obs`)
```typescript
interface ObsPrimitive {
  log: { debug, info, warn, error };
  metrics: { inc, gauge, timing };
  correlationId: string;
  withCorrelation(id: string): ObsPrimitive;
}
```

### 8. Deterministic RNG (`ctx.rng`)
```typescript
interface RngPrimitive {
  derive(seedParts: string[]): DeterministicRng;
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

### Primary Sources
- **Final Architecture Spec:** `docs/projects/SENSAI-FINAL-ARCHITECTURE.md`
- **Multi-Tenant + Obs-First Addendum (v1.1.2):** `docs/projects/SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md`
- **Architecture Overhaul Handover:** `docs/projects/ARCHITECTURE-OVERHAUL-HANDOVER.md`
- **Component OS Blueprint:** `docs/projects/SENSAI-COMPONENT-OS-BLUEPRINT.md`
- **OS Design Theory:** `docs/projects/Sensai-Project-Bible/Operating-System-Design/OS-Design-Theory.md`

### Implementation Guides
- **Store Write Elimination:** `docs/projects/STORE-WRITE-ELIMINATION.md`
- **Prisma 7 Bible:** `docs/prisma-7-bible.md`
- **Database Operations:** `docs/operations-bible/database-operations-runbook-comprehensive.md`

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

---

**Document Version:** 1.1.0  
**Created:** December 28, 2025  
**Updated:** December 28, 2025 — Added v1.1.2 multi-tenant + obs-first references  
**Purpose:** AI Agent guidance for Sensai OS development  
**Authority:** Supersedes all previous architecture instructions
