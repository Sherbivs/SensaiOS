# Sensai OS Quick Reference Card

**Version:** 1.1.0 | **Status:** Standard Operating System | **Date:** 2025-12-28

> **See v1.1.2 Addendum** (`SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md`) for:
> - Multi-tenant scope, Guarded execution, Typed errors, Early boot logging

---

## 🎯 THE GOLDEN INVARIANT

```
CLIENTS APPEND EXPORTS.
WORKERS TRANSFORM EXPORTS.
POSTGRES IS THE TRUTH.
EVERYTHING ELSE IS A VIEW.
```

---

## 📋 SENSAI vs TRADITIONAL OS

| Traditional OS | Sensai |
|----------------|--------|
| Syscalls | Database transactions |
| Processes | Workers |
| Filesystem | DB-backed object store |
| Packages | Components |
| IPC | Exports + Jobs + Outbox |

---

## 🏗️ LAYERED ARCHITECTURE

```
L4: CONTROL PLANE      → RBAC, Audit, Quotas, Config
L3: WORKER RUNTIME     → Ingest, Project, Deliver, GC
L2: EXPORT LOG         → Append-only facts (seq-ordered)
L1: OBJECT STORE       → Blobs, objects tables
L0: STORAGE            → PostgreSQL + SQLite buffer
```

---

## 📦 KERNEL PRIMITIVES (ComponentContext)

| Primitive | Purpose | Key Methods |
|-----------|---------|-------------|
| `ctx.db` | Database access | `prisma`, `transaction()`, `query()` |
| `ctx.exports` | Event log | `append()`, `consumeFrom()`, `getOffset()` |
| `ctx.jobs` | Work queue | `enqueue()`, `lease()`, `complete()`, `fail()` |
| `ctx.outbox` | Side effects | `send()`, `markDelivered()`, `markFailed()` |
| `ctx.config` | Configuration | `get()`, `set()`, `getFeatureFlag()` |
| `ctx.rbac` | Permissions | `assert()`, `check()`, `audit()` |
| `ctx.obs` | Observability | `log`, `metrics`, `correlationId` |
| `ctx.rng` | Deterministic RNG | `derive()` → `random()`, `int()`, `pick()` |
| `ctx.storage` | Object store | `putBlob()`, `getBlob()`, `putObject()` |
| `ctx.cache` | Bounded cache | `get()`, `set()`, `delete()`, `stats()` |

---

## 🧩 COMPONENT MANIFEST

```typescript
{
  name: 'domain.feature',        // 'security.guard'
  version: '1.0.0',              // Semver
  hosts: ['bot', 'worker'],      // Where it runs
  dependencies: ['observability'], // Required components
  capabilities: {
    db: ['read', 'write'],       // Database permissions
    discord: ['send'],           // Discord permissions
  },
  owns: {
    canonical: ['MyTable'],      // Tables this writes
    projections: ['MyView'],     // Read models
  },
  resources: {
    maxCacheMb: 20,
    maxQueueSize: 10000,
  },
  handlers: {
    exports: { ... },
    jobs: { ... },
    discord: { ... },
  },
}
```

---

## 🔐 DATA OWNERSHIP RULES

```
╔════════════════════════════════════════════════════════════╗
║  EACH TABLE HAS EXACTLY ONE OWNER COMPONENT.               ║
║  THAT COMPONENT IS THE ONLY WRITER.                        ║
║  OTHER COMPONENTS READ VIA QUERIES.                        ║
║  CROSS-COMPONENT WRITES GO THROUGH EXPORTS.                ║
╚════════════════════════════════════════════════════════════╝
```

### Data Categories

| Category | Owner | Rebuild? | Example |
|----------|-------|----------|---------|
| Canonical | Single component | N/A | `User`, `Battle` |
| Projection | Worker | From exports | `leaderboard` |
| Cache | Cache component | From canonical | `pokemon_cache` |
| Audit | Kernel | Never modified | `audit_events` |

---

## 🔒 CONCURRENCY MODEL

| Domain | Lock Type | Reason |
|--------|-----------|--------|
| Battles | Advisory | Long transactions |
| Encounters | Advisory | Multi-step catch flow |
| Inventory | Row lock | Simple CRUD |
| Money | Row lock | Atomic operations |
| Config | Optimistic | Rare updates |

---

## 📱 DISCORD I/O POLICY

| Tier | When | Allowed |
|------|------|---------|
| **IMMEDIATE** | <3s limit | `deferReply()`, error messages |
| **DEFERRED** | After defer | `editReply()`, `followUp()` |
| **OUTBOX** | State changes | Battle results, DMs, notifications |

---

## 🚨 NON-NEGOTIABLES

### ❌ NEVER DO
- `Math.random()` in gameplay → Use `ctx.rng.derive()`
- `fs.writeFile()` → Use `ctx.storage`
- Direct handler calls → Use exports/jobs/outbox
- Multiple writers to one table → One owner only
- Drop tables on uninstall → Data is sacred

### ✅ ALWAYS DO
- Handlers must be idempotent
- Caches must be bounded
- RNG seeds must be logged
- Privileged actions → audit events
- Capabilities declared in manifest

---

## 🔄 COMPONENT LIFECYCLE

```
UNINSTALLED
     │ install()
     ▼
INSTALLED (disabled)
     │ enable()
     ▼
ENABLED (active)
     │ disable()
     ▼
DISABLED (draining)
     │ uninstall()
     ▼
UNINSTALLED (tables preserved!)
```

---

## 📊 HOST TYPES

| Host | Purpose | Renders As |
|------|---------|------------|
| `bot` | Discord interactions | `Infinity-Gauntlet` |
| `worker` | Background processing | `*-outbox`, `*-cache`, `*-security` |
| `cron` | Scheduled jobs | `pokedex-cache-failsafe` |
| `cli` | Operator tooling | Local only |

---

## 📚 DOCUMENTATION

| Document | Lines | Purpose |
|----------|-------|---------|
| SENSAI-FINAL-ARCHITECTURE.md | 2,390 | Master specification || SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md | 500+ | **v1.1.2** Multi-tenant + obs-first || sensai.instructions.md | 500+ | AI agent guidance |
| SENSAI-COMPONENT-OS-BLUEPRINT.md | 800+ | Original design |
| SENSAI-ARCHITECTURE-ADDENDUM.md | 400+ | v1.1 feedback |

---

## ✅ IMPLEMENTATION CHECKLIST

- [ ] Component manifest complete
- [ ] Data ownership declared
- [ ] Resource budgets set
- [ ] Handlers are idempotent
- [ ] No direct handler calls
- [ ] RNG via `ctx.rng.derive()`
- [ ] Storage via `ctx.storage`
- [ ] Caches bounded
- [ ] Discord follows tier rules
- [ ] Audit events for privileged actions
- [ ] Correlation IDs propagated

---

**Quick Links:**
- Spec: `docs/projects/SENSAI-FINAL-ARCHITECTURE.md`
- Instructions: `.github/instructions/sensai.instructions.md`
- Blueprint: `docs/projects/SENSAI-COMPONENT-OS-BLUEPRINT.md`

---

*Last Updated: 2025-12-28 | Standard Operating System for Pokémon Infinity Gauntlet*
