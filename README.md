# Sensai OS

**Sensai OS** is a multi-tenant, database-native runtime platform that treats PostgreSQL as the operating system substrate. Applications run as installable **components** with explicit contracts, atomic operations, tenant isolation, and safe removability.

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

## Platform Vision

Sensai OS is designed to **host multiple customers and projects** with complete tenant isolation. Each customer (Discord guild, pipeline source, or external client) operates in their own namespace while sharing the same infrastructure and component library.

### Multi-Tenant Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SENSAI OS KERNEL                          │
├─────────────────────────────────────────────────────────────────┤
│  TENANT: dripcord          │  TENANT: guild-xyz    │  TENANT: n │
│  ├── game.core             │  ├── game.core        │            │
│  ├── game.homestead        │  ├── security.guard   │    ...     │
│  ├── security.guard        │  └── observability    │            │
│  └── observability         │                       │            │
├─────────────────────────────────────────────────────────────────┤
│                     SHARED KERNEL PRIMITIVES                     │
│         db | exports | jobs | outbox | config | rbac             │
├─────────────────────────────────────────────────────────────────┤
│                    POSTGRESQL (SINGLE SOURCE OF TRUTH)           │
└─────────────────────────────────────────────────────────────────┘
```

### Tenant Isolation

| Boundary | Implementation |
|----------|----------------|
| **Data** | Tenant ID column on all tables, enforced at query layer |
| **Exports** | Scoped by `tenant_id` in export log |
| **Jobs** | Tenant-aware job queue with fair scheduling |
| **Config** | Per-tenant configuration overrides |
| **RBAC** | Tenant-scoped roles and permissions |
| **Observability** | Tenant label on all logs and metrics |

### Input Sources

Sensai OS accepts data from multiple pipeline inputs:

| Source Type | Examples | Integration |
|-------------|----------|-------------|
| **Discord Guilds** | Dripcord, partner servers | Discord.js events → exports |
| **HTTP Webhooks** | External services, CI/CD | REST API → exports |
| **Message Queues** | RabbitMQ, Redis Streams | Queue consumer → exports |
| **Scheduled Jobs** | Cron, external triggers | Job queue → exports |

---

## Installed Services

### 🎮 Pokémon Infinity Gauntlet
*Customer: Dripcord Guild*

A Discord-first Pokémon adventure running as the flagship Sensai service. Features private guild channels (homestead-{username}), wild encounters, arena battles, and live-service economy.

| Component | Purpose | Host | Multi-Guild |
|-----------|---------|------|-------------|
| `game.core` | Trainer CRUD, party management | bot | ✅ Tenant-scoped |
| `game.homestead` | Private channel gameplay | bot | ✅ Tenant-scoped |
| `game.battles` | Arena battle orchestration | bot, worker | ✅ Tenant-scoped |
| `game.encounters` | Wild Pokémon spawning | bot, worker | ✅ Tenant-scoped |
| `discord.core` | Discord interaction handling | bot | ✅ Multi-guild |
| `observability.core` | Logging, metrics, alerting | worker | ✅ Tenant-labeled |

### 🔒 Security Guard
*Available to: All Tenants*

Role-healing, permission monitoring, and audit trail generation. Runs as a Sensai component with database-first state persistence. Designed to protect multiple guilds simultaneously.

| Capability | Multi-Tenant Support |
|------------|---------------------|
| Role monitoring | Per-guild baselines |
| Permission healing | Guild-scoped rollback |
| Audit logging | Tenant-labeled events |
| Alert routing | Per-tenant channels |

---

## Architecture Overview

### Layered Architecture

```
LAYER 5: TENANT LAYER (Customer Isolation)
└── Tenant Registry, Namespace Scoping, Fair Scheduling

LAYER 4: SYSTEM SERVICES (Control Plane)
└── RBAC, Audit, Quotas, Schedule, Config

LAYER 3: WORKER RUNTIME (Kernel Services)  
└── INGEST → PROJECT → DELIVER → GC

LAYER 2: EXPORT LOG (Ingestion Front Door)
└── Append-only event log with monotonic seq + tenant_id

LAYER 1: OBJECT STORE (Big Bytes)
└── Blobs stored in DB (blobs, objects tables)

LAYER 0: STORAGE (The Only Place That Writes)
└── PostgreSQL with WAL + SQLite buffer
```

### Core Principles

| Principle | Description |
|-----------|-------------|
| **Database as Substrate** | No traditional file I/O. PostgreSQL is the filesystem. |
| **Append-Only Facts** | External inputs become immutable export records |
| **Workers as Kernel Services** | Standardized contracts: ingest, project, deliver, gc |
| **Transactional System Calls** | Every operation is an atomic transaction |
| **Explicit Data Ownership** | Each table has ONE owner component |
| **Safe Removability** | Disable components without corrupting state |

### Kernel Primitives

Every component receives a `ComponentContext` with these primitives:

| Primitive | Purpose | Multi-Tenant |
|-----------|---------|--------------|
| `ctx.db` | Database access (Prisma + raw SQL) | Auto-scoped by tenant |
| `ctx.exports` | Append-only event log | Tenant-partitioned |
| `ctx.jobs` | Background job queue | Fair-scheduled |
| `ctx.outbox` | External side effects (Discord, HTTP) | Tenant-routed |
| `ctx.config` | Configuration store | Per-tenant overrides |
| `ctx.rbac` | Role-based access control | Tenant-scoped |
| `ctx.obs` | Logging, metrics, correlation | Tenant-labeled |
| `ctx.rng` | Deterministic RNG with seed logging | Tenant-seeded |
| `ctx.storage` | Blob/object storage | Namespace-isolated |
| `ctx.tenant` | Current tenant context | Identity + quota |

### Component Model

```typescript
export const MyComponent: SensaiComponent = {
  name: 'domain.feature',
  version: '1.0.0',
  hosts: ['bot', 'worker'],
  
  // Multi-tenant configuration
  tenancy: {
    mode: 'multi',              // 'single' | 'multi' | 'shared'
    isolation: 'strict',        // 'strict' | 'soft' | 'none'
    quotas: { maxRequests: 1000, maxStorage: '100MB' },
  },
  
  capabilities: { db: ['read', 'write'], discord: ['send'] },
  owns: { canonical: ['MyTable'], projections: ['MyView'] },
  resources: { maxCacheMb: 20, maxQueueSize: 10000 },
  handlers: {
    exports: { 'my.event': async (envelope, ctx) => { /* ... */ } },
    jobs: { 'MY_JOB': async (job, ctx) => ({ status: 'success' }) },
  },
};
```

**The One Rule:** Handlers communicate via **EXPORTS** (facts), **JOBS** (work), **OUTBOX** (side effects) — never direct calls.

---

## Production Topology

### Render Service Matrix

| Service | Type | Purpose |
|---------|------|---------|
| `Infinity-Gauntlet` | worker | Main Discord bot + game components |
| `infinity-gauntlet-outbox` | worker | Async message delivery |
| `infinity-gauntlet-cache` | worker | Runtime cache maintenance |
| `infinity-gauntlet-data-pipeline` | worker | Reference data updates |
| `infinity-gauntlet-security` | worker | Permission guardrails |
| `pokedex-cache-worker` | worker | External data sync |
| `pokedex-cache-failsafe` | cron | Weekly fallback refresh |

### Database Architecture

```
CLOUD-PROD-MASTER (PROD_DATABASE_URL)
└── Render-managed PostgreSQL (infinity-gauntlet-db)
    └── All production operations: gameplay, migrations, exports, jobs

ONPREMISE-DEV-PRIMARY (DATABASE_ONPREMISE_DEV_PRIMARY) — Optional
└── Workstation development (offline fallback)

ONPREMISE-DEV-EXPERIMENT (DATABASE_ONPREMISE_DEV_EXPERIMENT) — Optional  
└── Migration testing (isolated experiments)
```

---

## Getting Started

### Requirements

- Node.js 22+
- PostgreSQL 14+ (direct connection required)
- Discord bot token with `applications.commands` and `guilds` intents

### Installation

```powershell
# 1. Install dependencies
npm install

# 2. Configure environment
$env:IG_ENV_FILE="secrets/Infinity-Gauntlet.env"

# 3. Apply migrations and build
npx prisma migrate deploy
npm run build

# 4. Start in development mode
npm run dev
```

### Environment Configuration

Use `secrets/Infinity-Gauntlet.env` as the single consolidated environment file:

```bash
# Required
PROD_DATABASE_URL=postgresql://...     # Render-managed PostgreSQL
DISCORD_BOT_TOKEN=...                  # Discord bot credentials

# Optional (local development)
DATABASE_ONPREMISE_DEV_PRIMARY=...     # Workstation mirror
DATABASE_ONPREMISE_DEV_EXPERIMENT=...  # Migration testing
```

### Common Commands

```powershell
npm run dev              # Watch mode with hot reload
npm test                 # Vitest test suite
npm run lint             # ESLint TypeScript codebase
npm run build            # Production build
npm run db:cli -- status # Database connection info
npm run refresh:vision   # Rebuild router indexes
```

---

## Repository Structure

```
├── src/                      # Sensai runtime + components
│   ├── sensai/              # Kernel: primitives, supervisor, control-plane
│   │   ├── kernel/          # Core primitives (db, exports, jobs, outbox)
│   │   ├── components/      # Installed service components
│   │   └── types/           # Type definitions
│   ├── bot/                 # Discord interaction layer
│   │   ├── homestead/       # Private channel gameplay (16 files)
│   │   ├── battle/          # Arena battle handlers
│   │   ├── wilds/           # Wild encounter handlers
│   │   └── ops/             # Admin operations
│   ├── core/                # Game engines (battle, encounter, PBSL)
│   ├── workers/             # Background workers (17 files)
│   ├── services/            # Runtime services (cache, monitoring)
│   └── shared/              # Config, logging, Prisma helpers
├── prisma/                  # Database schema (Prisma 7)
├── scripts/                 # Automation and guards
├── tests/                   # Vitest test suites
├── ops/                     # Meta governance (routers, tasks)
├── docs/                    # Bible documentation system
│   ├── architecture-bible/  # 27 sections
│   ├── operations-bible/    # 13 sections + 9 guides
│   ├── development-bible/   # 10 sections
│   └── projects/            # Sensai specifications
└── data/                    # Cached reference data
```

---

## Documentation

### Sensai OS Specifications

| Document | Purpose | Lines |
|----------|---------|-------|
| [SENSAI-FINAL-ARCHITECTURE.md](docs/projects/SENSAI-FINAL-ARCHITECTURE.md) | **Canonical specification** | 2,390 |
| [SENSAI-QUICK-REFERENCE.md](docs/projects/SENSAI-QUICK-REFERENCE.md) | Quick reference card | ~150 |
| [SENSAI-COMPONENT-OS-BLUEPRINT.md](docs/projects/SENSAI-COMPONENT-OS-BLUEPRINT.md) | Component OS blueprint | ~500 |
| [sensai.instructions.md](.github/instructions/sensai.instructions.md) | AI agent instructions | ~500 |

### Bible System

```
docs/
├── architecture-bible/    # 27 sections (system design, database, workers, game engine)
│   └── INDEX.md          # Navigation hub
├── operations-bible/      # 13 sections + 9 guides (deployment, monitoring)
│   └── INDEX.md          # Navigation hub
└── development-bible/     # 10 sections (setup, testing, debugging)
    └── INDEX.md          # Navigation hub
```

### AI Agent Guides

| Document | Purpose |
|----------|---------|
| [Agents.md](Agents.md) | Comprehensive operations guide |
| [Patch.md](Patch.md) | AI project manager contract |
| [copilot-instructions.md](.github/copilot-instructions.md) | Copilot guidance |

---

## Operational Policies

### 🚨 NO-RESTART POLICY (ABSOLUTE)

**NEVER restart, stop, redeploy, or take any service offline without EXPLICIT operator permission.**

- Always ask first and wait for manual verification
- The operator needs time to check service state before anything goes offline
- Applies to: Render services, Docker containers, database connections, workers, cron jobs

### Production Observability (Loki)

```powershell
# Query production logs
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() * 1000000
$start = ([DateTimeOffset]::UtcNow.AddHours(-3)).ToUnixTimeMilliseconds() * 1000000
$r = Invoke-RestMethod "http://localhost:3100/loki/api/v1/query_range?query=%7Bservice%3D%22stats-logger%22%7D&limit=50&start=$start&end=$now"
```

**Grafana UI:** http://localhost:3000/explore → Query: `{service="stats-logger"}`

### Contract Guardrails

- `scripts/refresh_vision.sh` — Regenerates router indexes and recovery metadata
- `scripts/guard_meta.sh` — Enforces Prompt/Tasklist coupling and router hygiene
- `ops/NEXT.yaml` — Coordinates the next actionable task
- `ops/HOTFIX_PLAN.yaml` — Emergency work outside the PATCH loop

---

## Non-Negotiables

These rules are enforced across all Sensai components:

| Rule | Enforcement |
|------|-------------|
| ❌ No `Math.random()` in gameplay | Use `ctx.rng.derive()` |
| ❌ No `fs.writeFile` | Use `ctx.storage` primitive |
| ❌ No direct handler calls | Use exports/jobs/outbox |
| ❌ No table with multiple writers | One owner per table |
| ❌ No cross-tenant data access | Kernel enforces isolation |
| ✅ All handlers idempotent | Safe to retry |
| ✅ All caches bounded | LRU with hard caps |
| ✅ All RNG seeds logged | Audit/replay capability |
| ✅ All queries tenant-scoped | Auto-filtered by kernel |

---

## Current Status

**Sensai OS v1.0** (2025-12-28): Foundation complete, ready for multi-tenant deployment.

- ✅ **Architecture Specification**: 2,390 lines of canonical documentation
- ✅ **Multi-Tenant Design**: Tenant isolation at kernel primitive level
- ✅ **AI Agent Instructions**: Comprehensive guidance for all development
- ✅ **Prisma 7.1.0**: Direct PostgreSQL with `engineType = "library"`
- ✅ **Homestead Architecture**: Private guild channels (migration complete)
- ✅ **Bible System**: 27 architecture + 13 operations + 10 development sections

**Current Tenants:**
| Tenant | Type | Services | Status |
|--------|------|----------|--------|
| `dripcord` | Discord Guild | Pokemon, Security | 🟢 Production |

**Roadmap:**
- Multi-guild onboarding pipeline
- Tenant self-service portal
- Usage-based billing hooks
- External pipeline integrations (webhooks, message queues)

---

## Onboarding New Customers

### Discord Guild Onboarding

```typescript
// Register new tenant
await ctx.tenant.register({
  id: 'guild-xyz',
  type: 'discord',
  discordGuildId: '123456789',
  config: {
    enabledComponents: ['game.core', 'security.guard'],
    quotas: { maxTrainers: 1000, maxBattlesPerDay: 500 },
  },
});

// Tenant data is automatically isolated
const trainers = await ctx.db.trainer.findMany(); // Only returns guild-xyz trainers
```

### Pipeline Input Onboarding

```typescript
// Register webhook source
await ctx.tenant.registerSource({
  tenantId: 'partner-corp',
  type: 'webhook',
  endpoint: '/api/v1/ingest/partner-corp',
  auth: { type: 'hmac', secret: '...' },
  schema: 'partner-events-v1',
});
```

---

## Project Leadership

**Creator & CEO:** DRIPTVDD  
**Discord ID:** `563220840708177927` (immutable, use for authentication)  
**Authority:** Founder and leader of the Infinity Gauntlet development squad

---

**Last Updated:** 2025-12-28 | **Sensai:** v1.0 | **Prisma:** 7.1.0 | **Node:** 22+
