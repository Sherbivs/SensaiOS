# SensaiOS

A **database-first operating system** that makes PostgreSQL behave as the system substrate. Build applications where the database is the single source of truth, workers transform state, and everything else is just a view.

[![Build](https://img.shields.io/badge/build-passing-brightgreen)]()
[![Version](https://img.shields.io/badge/version-1.2.0-orange)]()
[![Node](https://img.shields.io/badge/node-22%2B-blue)]()
[![Prisma](https://img.shields.io/badge/prisma-7.2.0-blueviolet)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

---

## 🧠 What Is SensaiOS?

SensaiOS is an **operating system architecture** for building reliable, observable, multi-tenant applications. It treats PostgreSQL as the kernel's memory — all state lives in the database, workers are kernel services, and applications run in user-space with strict capability boundaries.

### The Golden Invariant

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENTS APPEND EXPORTS.  WORKERS TRANSFORM EXPORTS.        │
│  POSTGRES IS THE TRUTH.   EVERYTHING ELSE IS A VIEW.        │
└─────────────────────────────────────────────────────────────┘
```

This single rule eliminates entire categories of bugs: race conditions, stale caches, distributed state inconsistencies, and audit gaps.

### Why SensaiOS?

| Problem | SensaiOS Solution |
|---------|-------------------|
| **Distributed state chaos** | Single source of truth in PostgreSQL |
| **Hard to debug production** | Append-only export log with full audit trail |
| **Component coupling** | Handlers communicate only via exports/jobs/outbox |
| **Multi-tenant complexity** | TenantScope in every envelope by design |
| **Observability gaps** | `runGuarded()` wrapper captures all handler metrics |
| **Capability creep** | Ring-based security model with ESLint enforcement |

---

## 🏗️ Architecture

### Layered Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ LAYER 5: ADVANCED SUBSYSTEMS                                                 │
│ └── Content-Addressable Storage, Lock Manager, Capability Delegation        │
├─────────────────────────────────────────────────────────────────────────────┤
│ LAYER 4: SYSTEM SERVICES (Control Plane)                                     │
│ └── RBAC, Audit, Quotas, Schedule, Config                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ LAYER 3: WORKER RUNTIME (Kernel Services)                                    │
│ └── INGEST → PROJECT → DELIVER → GC                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ LAYER 2: EXPORT LOG (Append-Only Events)                                     │
│ └── Immutable fact log with monotonic sequence                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ LAYER 1: OBJECT STORE (Big Bytes)                                            │
│ └── SHA-256 content-addressable blobs                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ LAYER 0: STORAGE (The Only Writer)                                           │
│ └── PostgreSQL with WAL + SQLite buffer                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Ring Security Model

SensaiOS enforces strict boundaries between kernel and user-space code:

| Ring | Code Path | Access |
|------|-----------|--------|
| **Ring 0 (Kernel)** | `src/kernel/**` | Database primitives, exports, jobs, outbox |
| **Ring 1 (OS)** | `src/sensaios/**` | Component runtime, supervisor, capabilities |
| **Ring 3 (Apps)** | `src/bot/**`, `src/core/**` | User-space via `ComponentContext` only |

**Enforcement:** ESLint `import/no-restricted-paths` rules catch violations at compile-time.

### v1.2.0 Advanced Subsystems

| Subsystem | Purpose | Implementation |
|-----------|---------|----------------|
| **Content-Addressable Storage** | SHA-256 blob storage with deduplication | 340 lines |
| **Lock Manager** | Advisory locks with deadlock prevention | 410 lines |
| **Dependency Visualization** | Multi-format graph output (ASCII, Mermaid, JSON) | 370 lines |
| **Capability Delegation** | Time-bounded grants with chain limits | 490 lines |

---

## 🔧 Core Patterns

### TenantScope — Multi-Tenant by Design

Every envelope carries tenant context, enabling safe multi-tenant operation:

```typescript
interface TenantScope {
  tenant: string;       // Guild ID, user ID, or "system"
  environment: 'production' | 'staging' | 'development';
  service: string;      // e.g., "my-app"
  component: string;    // e.g., "payment-processor"
  instance?: string;    // Worker instance ID
  region?: string;      // Deployment region
}
```

### runGuarded() — Observability-First Handlers

All handlers are wrapped for automatic correlation tracking, error capture, and metrics:

```typescript
import { runGuarded } from '../kernel/guarded.js';

export const handlePayment = runGuarded(
  'payments.process',
  async (ctx: ComponentContext, request: PaymentRequest) => {
    // Automatic correlation ID in ctx.obs.correlationId
    // Automatic error capture if this throws
    // Automatic timing metrics emitted
    
    const result = await ctx.db.transaction(async (tx) => {
      return processPayment(tx, request);
    });
    
    ctx.obs.log.info('Payment processed', { 
      amount: result.amount,
      transactionId: result.id 
    });
    
    return result;
  }
);
```

### SensaiError — Typed Error Taxonomy

Errors are categorized by code ranges for structured handling:

```typescript
import { SensaiError } from '../kernel/errors.js';

// Error code ranges:
// 1xxx = KERNEL errors (boot, shutdown, primitives)
// 2xxx = DATABASE errors (connection, transaction, query)
// 3xxx = COMPONENT errors (lifecycle, handlers, manifest)
// 4xxx = VALIDATION errors (input, schema, business rules)
// 5xxx = EXTERNAL errors (APIs, HTTP, third-party)
// 6xxx = APPLICATION errors (domain-specific)

throw new SensaiError({
  code: 4001,
  message: 'Invalid payment amount',
  context: { amount, currency, userId },
  cause: originalError,
});
```

### Component Communication

Components **never** call handlers directly. They communicate through:

```typescript
// EXPORTS — Immutable facts (append-only event log)
await ctx.exports.append({
  source: 'payments',
  type: 'payment.completed',
  scope: tenantScope,
  idempotencyKey: `payment-${paymentId}`,
  payload: { paymentId, amount, status: 'completed' },
  occurredAt: new Date(),
  correlationId: ctx.obs.correlationId,
});

// JOBS — Background work with retry semantics
await ctx.jobs.enqueue({
  kind: 'send-receipt',
  scope: tenantScope,
  payload: { paymentId, email },
  scheduledFor: new Date(Date.now() + 5000), // 5s delay
  correlationId: ctx.obs.correlationId,
});

// OUTBOX — External side effects
await ctx.outbox.send({
  destination: 'email',
  topic: 'receipts',
  key: paymentId,
  scope: tenantScope,
  payload: { to: email, template: 'receipt', data: receiptData },
  correlationId: ctx.obs.correlationId,
});
```

---

## 🎮 Reference Implementation: Pokémon Infinity Gauntlet

SensaiOS was developed alongside **Pokémon Infinity Gauntlet**, a Discord-based Pokémon game that serves as the reference implementation. This real-world application validates every architectural decision.

### Infinity Gauntlet Features

| Feature | SensaiOS Pattern Used |
|---------|----------------------|
| **Homestead Channels** | TenantScope per guild/user |
| **Wild Encounters** | Deterministic RNG via `ctx.rng` |
| **Arena Battles** | Advisory locks, export log for audit |
| **PBSL Engine** | Content-addressable storage for snapshots |
| **Role Management** | RBAC + capability delegation |

### Game-Specific Code

```
src/bot/         # Discord bot (Ring 3 user-space)
src/core/        # Game engines (battle, encounter, PBSL)
assets/          # Pokémon data (dexpack.v1.json, dexpack.v2.json)
```

---

## 📁 Repository Structure

```
├── src/
│   ├── kernel/              # Ring 0: Core primitives
│   │   ├── primitives/      # db, exports, jobs, outbox, rng, storage
│   │   ├── guarded.ts       # runGuarded() wrapper
│   │   └── errors.ts        # SensaiError taxonomy
│   ├── sensaios/            # Ring 1: OS layer
│   │   ├── supervisor.ts    # Component lifecycle manager
│   │   ├── control-plane.ts # Enable/disable watcher
│   │   ├── storage/         # Content-addressable storage
│   │   ├── concurrency/     # Lock manager
│   │   ├── capabilities/    # Delegation system
│   │   └── visualization/   # Dependency graphs
│   ├── bot/                 # Ring 3: Discord application
│   ├── core/                # Ring 3: Game engines
│   ├── workers/             # Background processors
│   └── observability/       # Envelope logging system
├── prisma/                  # Database schema (Prisma 7.2.0)
├── docs/
│   ├── projects/SensaiOS/   # OS specification (v1.2.0)
│   ├── architecture-bible/  # 28 sections
│   ├── operations-bible/    # 14 sections + 9 guides
│   └── development-bible/   # 10 sections
├── ops/                     # Governance (tasks, routers)
├── scripts/                 # Automation & guards
└── tests/                   # Vitest suites
```

---

## 📚 Documentation

### SensaiOS Specification

| Document | Purpose |
|----------|---------|
| [**SENSAI-FINAL-ARCHITECTURE.md**](docs/projects/SensaiOS/SENSAI-FINAL-ARCHITECTURE.md) | Complete v1.2.0 specification |
| [**SENSAI-QUICK-REFERENCE.md**](docs/projects/SensaiOS/SENSAI-QUICK-REFERENCE.md) | Pattern cheat sheet |
| [**SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md**](docs/projects/SensaiOS/SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md) | v1.1.2 patterns (TenantScope, runGuarded, SensaiError) |
| [**sensai.instructions.md**](.github/instructions/sensai.instructions.md) | AI agent guidance |

### Reference Implementation Docs

| Bible | Sections | Purpose |
|-------|----------|---------|
| [**Architecture Bible**](docs/architecture-bible/INDEX.md) | 28 | System design, database, workers, game engine |
| [**Operations Bible**](docs/operations-bible/INDEX.md) | 14 + 9 guides | Deployment, monitoring, recovery |
| [**Development Bible**](docs/development-bible/INDEX.md) | 10 | Local setup, testing, debugging |
| [**Prisma 7 Bible**](docs/prisma-7-bible.md) | — | Database configuration playbook |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 22+**
- **PostgreSQL 14+**

### Installation

```bash
# Clone the repository
git clone https://github.com/Sherbivs/SensaiOS.git
cd SensaiOS

# Install dependencies
npm install

# Configure environment
cp secrets/example.env secrets/SensaiOS.env
# Edit secrets/SensaiOS.env with your database URL

# Apply migrations & generate Prisma client
npx prisma migrate deploy
npm run build

# Start development server
npm run dev
```

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `PROD_DATABASE_URL` | ✅ | PostgreSQL connection string |
| `DATABASE_ONPREMISE_DEV_PRIMARY` | ❌ | Local development fallback |
| `DATABASE_ONPREMISE_DEV_EXPERIMENT` | ❌ | Migration testing |

---

## 🔧 Development Commands

```bash
# Development
npm run dev              # Watch mode with hot reload
npm test                 # Vitest suite
npm run lint             # ESLint check
npm run build            # Production build

# Database
npm run db:cli -- status  # Connection info + counts
npm run db:cli -- query "SELECT COUNT(*) FROM \"User\";"

# Documentation
npm run docs:update-routers  # Rebuild router indexes
npm run refresh:vision       # Full metadata refresh
```

---

## 🏗️ Production Deployment (Infinity Gauntlet)

The reference implementation runs on Render with 7 services:

| Service | Type | Purpose |
|---------|------|---------|
| `Infinity-Gauntlet` | Worker | Main Discord bot |
| `infinity-gauntlet-security` | Worker | Role sweeps, alerts |
| `infinity-gauntlet-outbox` | Worker | Async message delivery |
| `infinity-gauntlet-cache` | Worker | Cache maintenance |
| `infinity-gauntlet-data-pipeline` | Worker | Reference data updates |
| `pokedex-cache-worker` | Worker | External data sync |
| `pokedex-cache-failsafe` | Cron | Weekly fallback |

See [Operations Bible](docs/operations-bible/INDEX.md) for deployment details.

---

## 🎯 Version History

| Version | Date | Highlights |
|---------|------|------------|
| **v1.2.0** | 2026-01-08 | Advanced Subsystems: CAS, Lock Manager, Visualization, Delegation |
| **v1.1.2** | 2025-12-28 | Mandatory patterns: TenantScope, runGuarded(), SensaiError |
| **v1.1.0** | 2025-12-20 | Multi-tenant architecture, observability-first boot |
| **v1.0.0** | 2025-11-07 | Initial release with kernel primitives |

---

## 🤝 Contributing

1. **Read [Patch.md](Patch.md)** — Understand workflow contract and Absolutes
2. **Check [Tasklist.md](Tasklist.md)** — Review backlog and dependencies
3. **Follow router discipline** — Update ROUTER.md files with structural changes
4. **Run guards** — `npm run lint && npm test` before committing

### Router Navigation

Every directory has a `ROUTER.md` documenting purpose and ownership:
- **[masterroutetable.md](masterroutetable.md)** — Router-of-routers index
- **[ops/ROUTER.yaml](ops/ROUTER.yaml)** — Machine-readable routes

---

## 📜 License

See [LICENSE](LICENSE) for details.

---

## 👤 Project Leadership

**Creator & CEO:** DRIPTVDD  
**Discord ID:** `563220840708177927` (immutable identifier)

---

<p align="center">
  <strong>SensaiOS</strong> — Database-first. Append-only. Observable by default.
</p>

**Last Updated:** 2026-01-08 | **Version:** 1.2.0 | **Node:** 22+ | **Prisma:** 7.2.0
