# INFINITY GAUNTLET — ARCHITECTURE OVERHAUL HANDOVER

**Project:** Database-First Architecture Transformation  
**Client:** Infinity Gauntlet Development Team  
**Prepared For:** Specialist Architecture Team  
**Date:** December 28, 2025  
**Status:** Production System — Active Users

---

## 🎯 EXECUTIVE SUMMARY

Infinity Gauntlet is a **Discord-first Pokemon adventure game** serving active users on the Dripcord server. The system currently operates with a **hybrid file/database architecture** that we're transforming into a **pure database-substrate operating system** where:

- **All state lives in databases** (PostgreSQL + SQLite)
- **Workers are the kernel services** (schedulers, importers, indexers)
- **Events are immutable facts** (append-only export log)
- **No filesystem writes** (except database files themselves)

### Current Scale
- **8 Render Services** (1 web + 6 workers + 1 cron)
- **5.5 GB RAM** total allocation
- **2 GB PostgreSQL** (Render-managed)
- **~300-600 MB** peak RAM per service
- **456 KB** SQLite database (Engine Write-DB)
- **Active gameplay:** Private guild channels, real-time battles, wild encounters

### Migration Status
- ✅ **Heap snapshots** → SQLite (Phase complete, 2025-12-28)
- ✅ **Security bot state** → PostgreSQL (Phase complete, 2025-12-27)
- ✅ **Database tables created** (runtime_metrics, alert_queue, guild_config, cache_entries)
- ✅ **/Store cleanup** → 456 KB (from 84.3 MB)
- 🔄 **Code deployed, awaiting next restart** for full activation

---

## 📋 SPECIALIST TEAM COMPOSITION

Your team should include these roles:

### 1. **Database Architect** (Lead Role)
**Responsibilities:**
- Design transactional substrate layer
- Schema evolution strategy (Prisma migrations)
- Query optimization & indexing strategy
- Replication topology (master-mirror-staging)

**Key Deliverables:**
- Unified database schema (PostgreSQL + SQLite coordination)
- Migration roadmap (file → DB consolidation)
- Performance benchmarks (<1μs cache, <50μs writes)

### 2. **Distributed Systems Engineer**
**Responsibilities:**
- Worker orchestration patterns
- Job queue design (leasing, idempotency)
- Event sourcing architecture
- Crash recovery & determinism

**Key Deliverables:**
- Worker contract specification
- Outbox pattern implementation
- Export log schema & projection pipeline

### 3. **TypeScript/Node.js Specialist**
**Responsibilities:**
- Type-safe database interfaces
- Prisma ORM optimization
- Memory management (bounded structures)
- Hot path performance tuning

**Key Deliverables:**
- Repository pattern refactoring
- Transaction boundary definitions
- Zero-copy data flows where possible

### 4. **DevOps/Infrastructure Engineer**
**Responsibilities:**
- Render deployment automation
- Database migration workflows
- Monitoring & observability (Loki/Grafana/Prometheus)
- Rollback procedures

**Key Deliverables:**
- Blue/green deployment strategy
- Database backup/restore automation
- Incident response playbooks

### 5. **Game Systems Designer** (Domain Expert)
**Responsibilities:**
- Preserve gameplay semantics during refactoring
- Define consistency requirements (eventual vs strong)
- Identify cacheable vs authoritative data
- Player-facing impact assessment

**Key Deliverables:**
- Data model validation
- Test scenarios for critical paths
- Rollback criteria (what breaks the game?)

---

## 🏗️ CURRENT ARCHITECTURE SNAPSHOT

### Technology Stack
```yaml
Runtime: Node.js 22.12.0
Language: TypeScript (ESM modules)
Database ORM: Prisma 7.1.0
  Engine Type: library (direct PostgreSQL)
  Connection: Direct (no pooler for MVP)
Database:
  Production: PostgreSQL 14+ (Render-managed, infinity-gauntlet-db)
  Local Dev: PostgreSQL (onpremise-dev-primary, workstation mirror)
  Caching: SQLite (engine-write.db, 456 KB)
Discord: discord.js 14.16.3
Testing: Vitest (293 passing, 4.22s execution)
Linting: ESLint (zero warnings)
```

### Service Topology
```
┌─────────────────────────────────────────────────────────────┐
│  RENDER PRODUCTION (Virginia Region)                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │ infinity-       │  │ Infinity-Gauntlet (Main Bot)    │  │
│  │ gauntlet-bot    │  │ - Discord bot + auto-sync       │  │
│  │ (Web Service)   │  │ - Health checks via HTTP        │  │
│  │ - Health checks │  │ - 2 GB RAM (Standard plan)      │  │
│  │ - 2 GB RAM      │  └──────────────────────────────────┘  │
│  └─────────────────┘                                         │
│                                                               │
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │ infinity-       │  │ infinity-gauntlet-cache          │  │
│  │ gauntlet-outbox │  │ - Runtime cache maintenance      │  │
│  │ - Event delivery│  │ - 512 MB RAM (Starter)          │  │
│  │ - 512 MB RAM    │  └──────────────────────────────────┘  │
│  └─────────────────┘                                         │
│                                                               │
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │ infinity-       │  │ infinity-gauntlet-security       │  │
│  │ gauntlet-data-  │  │ - Permission guardrails          │  │
│  │ pipeline        │  │ - DB-backed state persistence    │  │
│  │ - Reference data│  │ - 512 MB RAM (Starter)          │  │
│  │ - 512 MB RAM    │  └──────────────────────────────────┘  │
│  └─────────────────┘                                         │
│                                                               │
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │ pokedex-cache-  │  │ pokedex-cache-failsafe (Cron)   │  │
│  │ worker          │  │ - Weekly fallback refresh        │  │
│  │ - External sync │  │ - 512 MB RAM (Starter)          │  │
│  │ - 512 MB RAM    │  └──────────────────────────────────┘  │
│  └─────────────────┘                                         │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ SHARED POSTGRESQL DATABASE (infinity-gauntlet-db)      │ │
│  │ - 2 GB storage (Starter plan)                           │ │
│  │ - Direct connections (no pooler)                        │ │
│  │ - All services use PROD_DATABASE_URL                    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ PERSISTENT DISK (/Store)                                │ │
│  │ - 2 GB capacity (1-2 GB per service)                    │ │
│  │ - CURRENT: 456 KB (engine-write.db only)                │ │
│  │ - DB-ONLY POLICY: No file writes except SQLite DBs      │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

External Observability:
┌──────────────────────────────────────────────────────────────┐
│  WORKSTATION (Operator Machine)                               │
├──────────────────────────────────────────────────────────────┤
│  Loki (localhost:3100) ← ngrok tunnel ← Render logs          │
│  Grafana (localhost:3000) → Loki datasource                   │
│  Prometheus → Service metrics (planned)                        │
└──────────────────────────────────────────────────────────────┘
```

### Database Schema (Prisma 7)
**Core Entities:**
```prisma
// User Management
model User { id, discordId, username, discriminator, globalName }
model Trainer { userId (1:1), money, region, badges }
model TrainerProfile { trainerId (1:1), stats, achievements }

// Pokemon Data
model Monster { id, speciesId, trainerId, nickname, level, moves, stats }
model Party { trainerId (1:1), slot1-6 → Monster }

// Gameplay State
model Encounter { id, userId, location, pokemon, status, expiresAt }
model Battle { id, challengerId, defenderId, status, turnData }
model Cooldown { userId, action, expiresAt }

// DB-First Migration Tables (2025-12-27)
model RuntimeMetric { id, metricType, timestamp, trigger, uptimeMs, errorMessage }
model AlertQueue { id, alertType, severity, message, dispatchedAt }
model GuildConfig { guildId, configKey, configValue }
model CacheEntry { cacheKey, namespace, value, expiresAt }
```

**SQLite (Engine Write-DB):**
```sql
-- Battle logging for analytics
CREATE TABLE battle_logs (
  id INTEGER PRIMARY KEY,
  battle_id TEXT NOT NULL,
  trainer1_id TEXT NOT NULL,
  trainer2_id TEXT NOT NULL,
  winner_id TEXT,
  turn_count INTEGER,
  completed_at INTEGER,
  metadata TEXT
);

-- Heap snapshots (DB-only policy)
CREATE TABLE heap_snapshots (
  id INTEGER PRIMARY KEY,
  captured_at INTEGER NOT NULL,
  trigger TEXT NOT NULL, -- 'startup', 'manual', 'oom-warning'
  rss_bytes INTEGER NOT NULL,
  heap_total_bytes INTEGER NOT NULL,
  heap_used_bytes INTEGER NOT NULL,
  v8_heap_limit_bytes INTEGER NOT NULL,
  heap_utilization_percent REAL NOT NULL
);
```

### Data Flow Architecture
```
┌─────────────────────────────────────────────────────────────┐
│  PLAYER INTERACTION                                          │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  DISCORD COMMAND LAYER (src/bot/**)                          │
│  - Homestead channels (private guild channels)               │
│  - Slash commands: /walk, /catch, /battle, /home            │
│  - Button/select menu interactions                           │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  GAME ENGINE LAYER (src/core/**)                             │
│  - Battle resolution (deterministic damage calculation)      │
│  - Encounter generation (seeded RNG)                         │
│  - PBSL (Pokemon Battle Snapshot Language) for testing      │
└─────────────────────────────────────────────────────────────┘
           │
           ├──────────────────────┬──────────────────────────┐
           ▼                      ▼                          ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  POSTGRESQL      │  │  ENGINE CACHE    │  │  ENGINE WRITE-DB │
│  (Authoritative) │  │  (L1 In-Memory)  │  │  (SQLite)        │
│                  │  │                  │  │                  │
│  - User state    │  │  - Pokemon data  │  │  - Battle logs   │
│  - Battles       │  │  - Type chart    │  │  - Heap snapshots│
│  - Encounters    │  │  - <1μs lookup   │  │  - Metrics       │
│  - Runtime logs  │  │  - 20 MB max     │  │  - 456 KB total  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
           │                      │                          │
           └──────────────────────┴──────────────────────────┘
                                   │
                                   ▼
                    ┌────────────────────────────┐
                    │  EVENT BUS                 │
                    │  - Pub/sub system          │
                    │  - Correlation tracking    │
                    │  - Pattern matching        │
                    └────────────────────────────┘
                                   │
                                   ▼
                    ┌────────────────────────────┐
                    │  WORKER POOL               │
                    │  - Outbox delivery         │
                    │  - Cache refresh (hourly)  │
                    │  - Buffer flush (30s)      │
                    │  - Heap pruner (cleanup)   │
                    └────────────────────────────┘
```

---

## 🎨 TARGET ARCHITECTURE VISION

Based on the **OS-Design-Theory.md** (attached), we're building toward:

### Core Principles
1. **Database as Substrate** — No traditional file I/O, only database transactions
2. **Append-Only Export Log** — All external inputs → immutable event records
3. **Workers as Kernel Services** — Schedulers, importers, indexers, exporters, GC
4. **Transactional System Calls** — Every operation is an atomic transaction
5. **Immutable Facts** — Events ingested once, then projected into read models

### Layered Architecture
```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 4: System Services (OS-ish features)                  │
│  - Identity/sessions (users, tokens)                         │
│  - Permissions (RBAC, capabilities, ACL)                     │
│  - Scheduling (jobs, leases, cron)                           │
│  - IPC (channels, messages, DB queues)                       │
│  - Observability (logs, metrics, audit)                      │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3: Worker Runtime (kernel services)                   │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ Ingest/Normalize │  │ Project/         │                 │
│  │ - Validate       │  │ Materialize      │                 │
│  │ - Decompress     │  │ - Build indexes  │                 │
│  │ - Parse          │  │ - Update counters│                 │
│  └──────────────────┘  └──────────────────┘                 │
│  ┌──────────────────────────────────────┐                   │
│  │ Export/Deliver (outbox pattern)     │                   │
│  │ - Reliable delivery                  │                   │
│  │ - Idempotency                        │                   │
│  └──────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 2: Export Log (ingestion front door)                  │
│  - Append-only event log                                     │
│  - Idempotent ingestion (dedupe by key)                      │
│  - Signed exports (tamper resistance)                        │
│  - Schema: exports(id, source, type, payload, occurred_at)  │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: Object Store (big bytes storage)                   │
│  - Blobs in DB (or DB references to external store)          │
│  - Schema: blobs(id, hash, size, codec, data)               │
│  - Schema: objects(id, owner, type, blob_id, metadata)       │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 0: Storage Layer (the only place that writes)         │
│  - Transactional KV store (PostgreSQL / Foundation)          │
│  - WAL (write-ahead log) for crash recovery                  │
│  - Atomic transactions                                        │
│  - MVCC snapshots / consistent reads                          │
└─────────────────────────────────────────────────────────────┘
```

### Migration Roadmap
```
PHASE 1: Foundation (COMPLETE ✅)
├─ Database-first policy enforcement
├─ Heap snapshots → SQLite
├─ Security state → PostgreSQL
├─ File writes eliminated (456 KB remaining)
└─ Migration tables created (runtime_metrics, alert_queue, etc.)

PHASE 2: Export Log & Worker Contracts (NEXT)
├─ Design export log schema
├─ Define worker interfaces (TypeScript contracts)
├─ Implement idempotent ingestion pattern
├─ Job queue with leasing mechanism
└─ Outbox pattern for reliable delivery

PHASE 3: Projection Pipeline
├─ Separate canonical data from read models
├─ Build projection workers
├─ Implement rebuild-from-exports capability
├─ Add materialized view maintenance
└─ Performance optimization (<1μs cache goal)

PHASE 4: System Services
├─ RBAC with capability-based security
├─ Audit log (append-only events)
├─ Rate limiting & quotas per tenant
├─ Scheduling system (cron-like jobs)
└─ IPC via database queues

PHASE 5: Determinism & Replay
├─ Worker run tracking (inputs/outputs/versions)
├─ Controlled nondeterminism (RNG, time, external calls)
├─ Time-travel debugging capability
└─ Audit replay for compliance
```

---

## 📊 PERFORMANCE REQUIREMENTS

### Latency Targets
| Operation | Current | Target | Notes |
|-----------|---------|--------|-------|
| **L1 Cache Read** | <1μs | <1μs | Pokemon data, type chart |
| **Database Write** | ~50ms | <50μs | Non-blocking, buffered writes |
| **Battle Turn** | ~100ms | <200ms | Deterministic calculation + DB update |
| **Wild Encounter** | ~150ms | <300ms | Spawn + display in Discord |
| **Discord Command** | ~250ms | <500ms | User-facing interaction response |

### Memory Constraints
| Service | Limit | Current | Headroom |
|---------|-------|---------|----------|
| **Main Bot** | 2 GB | 300-600 MB | 65-75% |
| **Workers** | 512 MB | 200-300 MB | 40-60% |
| **L1 Cache** | 20 MB | 15-18 MB | 10-25% |
| **Write Buffer** | 5 MB | 2-3 MB | 40-60% |

### Throughput Targets
- **Events/sec:** 100-500 (current: ~50)
- **Battles/hour:** 20-100 (current: ~10)
- **Encounters/hour:** 50-200 (current: ~30)
- **Cache hit rate:** >95% (current: 92-94%)

---

## 🔍 CRITICAL SYSTEMS TO PRESERVE

### 1. Homestead Channels (Core Gameplay)
**Location:** `src/bot/homestead/**` (16 files)

**DO NOT BREAK:**
- `/home` command (player dashboard)
- Heal functionality (restore Pokemon HP/PP)
- Starter selection flow (new player onboarding)
- Party management (swap Pokemon in/out of active team)
- Storage box access (PC system)

**Testing Protocol:**
- End-to-end test suite: `tests/homestead/**`
- Manual verification: Join test server, run `/home`, verify all buttons work
- Rollback criteria: Any homestead command fails → immediate rollback

### 2. Battle Engine (Deterministic Core)
**Location:** `src/core/battle/**`

**DO NOT BREAK:**
- Damage calculation (must be deterministic, same inputs → same outputs)
- Type effectiveness (type chart lookups, STAB bonuses)
- Status effects (paralysis, burn, poison, sleep, freeze, confusion)
- Critical hit system (1/16 base chance, modified by moves/abilities)
- Turn order (speed stats, priority moves)

**Testing Protocol:**
- PBSL oracle tests: `tests/pbsl/**` (golden snapshots)
- Unit tests: `tests/battle/**`
- Regression suite: Any damage calc changes must pass ALL oracle tests

### 3. Wild Encounters (Spawn System)
**Location:** `src/core/encounter/**`

**DO NOT BREAK:**
- Seeded RNG (deterministic per-user, reproducible encounters)
- Rarity tables (common/uncommon/rare/ultra-rare balance)
- Time/weather modifiers (dynamic encounter rates)
- Catch mini-flow (throw ball, shake calculation, success/failure)

**Testing Protocol:**
- Unit tests: `tests/encounter/**`
- Integration tests: `/walk` → encounter → `/catch` → success

### 4. Event Bus (Pub-Sub Backbone)
**Location:** `src/shared/event-bus.ts`

**DO NOT BREAK:**
- Correlation tracking (parentCorrelationId chains)
- Pattern matching (`alert.critical|alert.security`)
- Backpressure (75% warn, 95% reject)
- Message delivery guarantees (at-least-once via outbox)

**Testing Protocol:**
- Unit tests: `tests/event-bus.spec.ts`
- Load tests: 1000 events/sec without drops

---

## 🚨 KNOWN PAIN POINTS & CONSTRAINTS

### 1. Memory Pressure (2 GB RAM Limit)
**Problem:** Main bot worker occasionally approaches 1.5 GB RAM usage (~75% of limit).

**Current Mitigation:**
- Discord.js cache sweeping (configured limits + intervals)
- Bounded data structures (10k queues, 200 error buffers)
- Lazy loading (L1 cache feature flags)

**Architecture Constraint:**
- Workers MUST use bounded structures
- NO unbounded arrays/maps/sets
- NO caching Discord objects long-term (use IDs, refetch)

### 2. Render Path Structure (Nested Deployment)
**Problem:** Render clones repo to `/opt/render/project/src/`, creating nested structure.

**Impact:**
- Code expects `/opt/render/project/src/src/` for imports
- Build output: `/opt/render/project/src/dist/`
- This is EXPECTED Render behavior, not a bug

**Architecture Constraint:**
- All scripts must handle both local (`./src/`) and Render paths
- Use dynamic path resolution, not hardcoded paths

### 3. Prisma 7 Migration Gotchas
**Problem:** Prisma 6 → 7 broke several production deployments.

**Breaking Changes:**
- `engineType = "library"` REQUIRED in schema.prisma
- `datasources` option REMOVED from PrismaClient constructor
- Database URL MUST be in `prisma.config.ts`, NOT schema.prisma

**Architecture Constraint:**
- Follow Prisma 7 Bible exactly: `docs/prisma-7-bible.md` (1000+ lines)
- Test migrations on `ONPREMISE-DEV-EXPERIMENT` before production

### 4. No-Restart Policy (Absolute Rule)
**Problem:** Operator needs manual verification before ANY service disruption.

**Enforcement:**
- AI assistants MUST ask before restart/stop/redeploy
- Wait for explicit operator confirmation
- Violations treated as critical incidents

**Architecture Constraint:**
- Design for zero-downtime deploys (blue/green)
- State persistence across restarts (database-backed)
- Graceful shutdown handlers (save state, flush buffers)

### 5. Deterministic RNG Requirement
**Problem:** Game fairness requires reproducible encounters per user.

**Implementation:**
- Per-user seed stored in database
- Deterministic PRNG (seedrandom library)
- Auditable: same seed + same timestamp → same encounter

**Architecture Constraint:**
- NEVER use `Math.random()` for gameplay
- All RNG MUST be seeded and logged
- Replay capability required for dispute resolution

---

## 📚 DOCUMENTATION RESOURCES

### Must-Read Documents (Priority Order)
1. **[Agents.md](../../Agents.md)** — Operations guide, database setup, worker architecture
2. **[Architecture Bible](../architecture-bible/INDEX.md)** — 27 sections, complete system design
3. **[Operations Bible](../operations-bible/INDEX.md)** — 13 sections + 9 guides, deployment procedures
4. **[Prisma 7 Bible](../prisma-7-bible.md)** — 1000+ lines, AI agent playbook, migration guide
5. **[OS Design Theory](./Sensai-Project-Bible/Operating-System-Design/OS-Design-Theory.md)** — Target architecture vision

### Quick Reference
| Document | Purpose | Lines | Priority |
|----------|---------|-------|----------|
| README.md | Getting started, project overview | 230 | High |
| OPERATIONS.md | Service matrix, rollout checklist | 400+ | High |
| package.json | Scripts, dependencies, commands | 172 | Medium |
| render.yaml | Deployment configuration | 362 | High |
| STORE-WRITE-ELIMINATION.md | DB-only policy, migration status | 296 | Critical |

### Comprehensive Guides (AUTHORITATIVE)
- **Worker Troubleshooting:** [worker-troubleshooting-comprehensive.md](../operations-bible/worker-troubleshooting-comprehensive.md) — 22 pages
- **Database Operations:** [database-operations-runbook-comprehensive.md](../operations-bible/database-operations-runbook-comprehensive.md) — 25 pages
- **/ops Commands:** [ops-commands-reference-comprehensive.md](../operations-bible/ops-commands-reference-comprehensive.md) — 28 pages
- **Complete System Architecture:** [complete-system-architecture.md](../architecture-bible/complete-system-architecture.md) — 30 pages

---

## 🔧 DEVELOPMENT ENVIRONMENT SETUP

### Prerequisites
```powershell
# Node.js 22.12.0+
node --version

# PostgreSQL 14+ (local development)
psql --version

# Git with LFS (for large test fixtures)
git lfs version
```

### Clone & Setup
```powershell
# Clone repository
git clone https://github.com/sherbivs/infinity-gauntlet.git
cd infinity-gauntlet

# Install dependencies
npm install

# Configure environment
$env:IG_ENV_FILE="secrets/Infinity-Gauntlet.env"
pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist

# Apply Prisma migrations
npx prisma migrate deploy

# Build project
npm run build

# Run tests
npm test

# Start development server
npm run dev
```

### Database CLI (Essential Tool)
```powershell
# Check connection status
npm run db:cli -- status

# Get table counts
npm run db:cli -- counts

# Run custom query
npm run db:cli -- query "SELECT COUNT(*) FROM \"User\";"

# Bootstrap local database (mirrors production)
npm run ops:bootstrap-onpremise-dev
```

### Testing Protocol
```powershell
# Full test suite (293 tests, 4.22s)
npm test

# PBSL oracle tests (deterministic battle snapshots)
npm run test:pbsl

# Integration tests (Discord button flows)
npm test tests/battle/actions.interaction.spec.ts

# Benchmarks (dexpack lookup performance)
npm run bench:dex
```

---

## 🎯 KEY DESIGN QUESTIONS FOR YOUR TEAM

### 1. Export Log Schema Design
**Question:** What should the export log schema look like?

**Current State:**
- No unified export log
- Events scattered across multiple tables
- No idempotency guarantees

**Proposed Schema:**
```sql
CREATE TABLE exports (
  id UUID PRIMARY KEY,
  source TEXT NOT NULL, -- 'discord', 'worker', 'admin'
  type TEXT NOT NULL, -- 'player.action', 'battle.complete', 'encounter.spawn'
  idempotency_key TEXT UNIQUE NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signature TEXT, -- HMAC for tamper resistance
  status TEXT NOT NULL DEFAULT 'pending' -- 'pending', 'processed', 'failed'
);

CREATE INDEX idx_exports_type_occurred ON exports(type, occurred_at DESC);
CREATE INDEX idx_exports_idempotency ON exports(idempotency_key);
CREATE INDEX idx_exports_status ON exports(status) WHERE status != 'processed';
```

**Your Task:** Validate or revise this schema. Consider:
- Payload size limits (Discord messages can be large)
- Partitioning strategy (time-based? type-based?)
- Retention policy (how long to keep processed exports?)
- Query patterns (what filters will workers use?)

### 2. Worker Contract Specification
**Question:** What should the TypeScript interface for workers look like?

**Current State:**
- Workers are ad-hoc scripts
- No standardized lifecycle
- No leasing mechanism

**Proposed Contract:**
```typescript
interface Worker {
  name: string;
  kind: 'ingest' | 'project' | 'deliver' | 'gc';
  
  // Lifecycle hooks
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  healthCheck(): Promise<WorkerHealth>;
  
  // Work processing
  processJob(job: Job): Promise<JobResult>;
  
  // Configuration
  config: {
    leaseTimeout: number; // milliseconds
    maxRetries: number;
    batchSize: number;
    pollInterval: number;
  };
}

interface Job {
  id: string;
  kind: string;
  payload: unknown;
  runAfter: Date;
  attempts: number;
  maxAttempts: number;
  leasedUntil: Date | null;
  leasedBy: string | null;
}

interface JobResult {
  status: 'success' | 'retry' | 'failed';
  output?: unknown;
  error?: Error;
  retryAfter?: Date;
}

interface WorkerHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  metrics: {
    jobsProcessed: number;
    jobsFailed: number;
    averageProcessingTime: number;
    queueDepth: number;
  };
}
```

**Your Task:** Refine this contract. Consider:
- Error isolation (one bad job shouldn't crash worker)
- Observability (how to track worker state?)
- Scaling (how to add more workers?)
- Graceful degradation (what happens when DB is slow?)

### 3. Projection Pipeline Design
**Question:** How should we separate canonical data from read models?

**Current State:**
- Monolithic schema (no separation)
- Queries directly hit canonical tables
- No rebuild capability

**Proposed Separation:**
```
CANONICAL TABLES (source of truth, slow-changing):
├─ users (raw Discord user data)
├─ trainers (game state, authoritative)
├─ monsters (Pokemon instances, authoritative)
└─ exports (event log, immutable)

READ MODELS (denormalized, query-optimized, rebuildable):
├─ player_dashboard (homestead UI data)
├─ battle_history (leaderboards, statistics)
├─ encounter_cache (current active encounters)
└─ pokemon_index (search, filters, sorting)
```

**Your Task:** Design the projection pipeline. Consider:
- Rebuild strategy (how to regenerate read models from exports?)
- Consistency guarantees (eventual vs strong?)
- Cache invalidation (when to refresh read models?)
- Performance (can we hit <1μs for hot queries?)

### 4. Security & Access Control
**Question:** How should RBAC and capabilities work?

**Current State:**
- Hardcoded admin IDs
- No fine-grained permissions
- No audit trail

**Proposed Model:**
```typescript
interface User {
  id: string;
  roles: string[]; // ['player', 'admin', 'moderator']
}

interface Role {
  name: string;
  capabilities: Capability[];
}

interface Capability {
  resource: string; // 'battle', 'encounter', 'admin'
  action: string; // 'read', 'write', 'delete'
  scope: 'self' | 'guild' | 'global';
}

// Example capability check
async function canPerformAction(
  user: User,
  resource: string,
  action: string,
  scope: string
): Promise<boolean> {
  const roles = await getRoles(user.roles);
  return roles.some(role =>
    role.capabilities.some(cap =>
      cap.resource === resource &&
      cap.action === action &&
      isScopeSufficient(cap.scope, scope)
    )
  );
}
```

**Your Task:** Design the security model. Consider:
- Row-level security (players can only see their own data)
- Audit logging (who did what, when?)
- Rate limiting (prevent abuse)
- Multi-tenancy (Discord guilds as tenants?)

### 5. Rollback & Disaster Recovery
**Question:** How do we roll back bad deployments?

**Current State:**
- Git revert + manual cleanup
- No automated rollback
- State may be corrupted

**Proposed Strategy:**
```
ROLLBACK TRIGGERS:
├─ Build fails (automated: block deployment)
├─ Tests fail (automated: block deployment)
├─ Error rate spike >5% (manual: operator decision)
├─ Performance degradation >2x (manual: operator decision)
└─ Critical gameplay broken (manual: immediate rollback)

ROLLBACK PROCEDURE:
1. Stop traffic to new version (blue/green swap)
2. Verify old version still running (no data loss)
3. Database migration rollback (if schema changed)
4. Event replay (if state diverged)
5. Smoke tests (verify gameplay works)
6. Resume traffic (gradual ramp-up)

RECOVERY TOOLS:
├─ Database snapshots (hourly, 7-day retention)
├─ Export log replay (regenerate state from events)
├─ Blue/green deployments (instant switchback)
└─ Canary releases (1% traffic before full rollout)
```

**Your Task:** Formalize the rollback strategy. Consider:
- Automated vs manual triggers (what can we trust?)
- State reconciliation (how to fix data after rollback?)
- Testing rollbacks (how often do we practice?)
- Communication (how to notify users during incidents?)

---

## 📊 SUCCESS CRITERIA

### Phase 2 (Export Log & Workers) — 6 Weeks
- [ ] Export log schema deployed to production
- [ ] Worker contract interface finalized (TypeScript)
- [ ] Job queue with leasing implemented (tested at 1000 jobs/min)
- [ ] Outbox pattern for reliable delivery (99.9% success rate)
- [ ] All existing workers migrated to new contract (6 workers)
- [ ] Performance benchmarks met (<1μs cache, <50μs writes)
- [ ] Zero production incidents during migration

### Phase 3 (Projection Pipeline) — 8 Weeks
- [ ] Canonical vs read model separation complete
- [ ] Projection workers operational (ingest, project, deliver)
- [ ] Rebuild-from-exports capability (tested on 30-day history)
- [ ] Materialized view maintenance (auto-refresh on changes)
- [ ] Query performance improved (>95% cache hit rate)
- [ ] Monitoring dashboards updated (Grafana + Loki)

### Phase 4 (System Services) — 6 Weeks
- [ ] RBAC with capabilities (replace hardcoded admin checks)
- [ ] Audit log (append-only, tamper-resistant)
- [ ] Rate limiting (per-user, per-guild quotas)
- [ ] Scheduling system (cron-like, reliable)
- [ ] IPC via database queues (replace in-memory EventBus)

### Phase 5 (Determinism & Replay) — 4 Weeks
- [ ] Worker run tracking (inputs/outputs/code versions)
- [ ] Controlled nondeterminism (RNG, time, external calls)
- [ ] Time-travel debugging (replay events from any point)
- [ ] Audit replay for compliance (prove fairness)

---

## 🤝 COLLABORATION & COMMUNICATION

### Weekly Sync Meetings
- **Architecture Review:** Fridays 2:00 PM ET (1 hour)
- **Code Review:** Tuesdays/Thursdays 10:00 AM ET (30 minutes)
- **Incident Retro:** As needed (within 24 hours of incident)

### Slack Channels
- `#infinity-gauntlet-arch` — Architecture decisions, design discussions
- `#infinity-gauntlet-dev` — Code reviews, PRs, CI/CD
- `#infinity-gauntlet-ops` — Production incidents, monitoring alerts

### GitHub Workflow
- **Branch:** `architecture-overhaul` (long-lived, merge to `main` per phase)
- **PRs:** Require 2 approvals (1 from Database Architect, 1 from Domain Expert)
- **CI:** All tests must pass + zero linter warnings + no regressions

### Documentation Updates
- **Every PR:** Update relevant Bible sections in same commit
- **Every phase:** Comprehensive handover doc + runbook
- **Every incident:** Post-mortem doc within 48 hours

---

## 🎁 WHAT WE PROVIDE YOU

### Access Credentials
- **GitHub Repository:** https://github.com/sherbivs/infinity-gauntlet
- **Render Dashboard:** https://dashboard.render.com (credentials provided separately)
- **Production DB:** Connection string in `secrets/Infinity-Gauntlet.env`
- **Loki/Grafana:** Localhost access (tunneled via ngrok)

### Development Environment
- **VS Code Workspace:** Pre-configured with extensions + tasks
- **Database Mirror:** `npm run ops:bootstrap-onpremise-dev` (clone production)
- **Test Suite:** 293 passing tests, 4.22s execution
- **Documentation:** 105+ pages across 3 Bibles

### Subject Matter Experts
- **Database Architecture:** Contact via Slack `@database-team`
- **Game Systems:** Contact via Slack `@game-design`
- **Discord Bot:** Contact via Slack `@discord-specialists`
- **Infrastructure:** Contact via Slack `@devops-team`

### Existing Tools
- **Database CLI:** `npm run db:cli -- <command>`
- **Log Query:** `npm run observe -- <query>`
- **Render Deploy:** `npm run render deploy Infinity-Gauntlet`
- **Memory Monitor:** `npm run monitor:memory`

---

## 🚀 GETTING STARTED CHECKLIST

### Week 1: Orientation
- [ ] Clone repository, run local dev environment
- [ ] Read: Agents.md, Architecture Bible INDEX, Operations Bible INDEX
- [ ] Review: Current database schema (Prisma Studio)
- [ ] Explore: `/ops stats`, `/ops cache`, `/ops engine` commands
- [ ] Meet: Kick-off call with full team (2 hours)

### Week 2: Deep Dive
- [ ] Read: OS Design Theory, Prisma 7 Bible, STORE-WRITE-ELIMINATION
- [ ] Review: Worker architecture (6 workers + 1 cron)
- [ ] Explore: Event Bus implementation, correlation tracking
- [ ] Test: Run full test suite, verify PBSL oracles pass
- [ ] Document: Initial questions + design proposals

### Week 3: Design Proposals
- [ ] Draft: Export log schema (SQL + TypeScript types)
- [ ] Draft: Worker contract interface (TypeScript)
- [ ] Draft: Projection pipeline design (canonical vs read models)
- [ ] Draft: Security model (RBAC + capabilities)
- [ ] Present: Design review meeting (2 hours)

### Week 4: Prototype
- [ ] Implement: Export log table + insertion API
- [ ] Implement: Simple worker (ingest pattern)
- [ ] Implement: Job queue with leasing
- [ ] Test: 1000 events/min load test
- [ ] Deploy: Staging environment (non-production)

---

## 💡 FINAL THOUGHTS

This is a **production system with active users**. Every change must be:
- **Tested exhaustively** (unit + integration + load tests)
- **Rolled out gradually** (canary → blue/green → full traffic)
- **Monitored continuously** (Loki/Grafana/Prometheus)
- **Reversible instantly** (rollback procedures documented)

We're building an **operating system where the database is the substrate**. This is a real, proven design pattern, but it requires discipline:
- **No shortcuts on transactions** (ACID or bust)
- **No unbounded structures** (memory is finite)
- **No magic state** (everything explicit in DB)
- **No cowboy commits** (review + test everything)

Your work will **directly impact player experience**. Bugs mean players lose progress, battles fail, encounters break. We trust you because you're specialists, but we verify because we care about our users.

Welcome to the Infinity Gauntlet architecture team. Let's build something legendary. 🎮

---

**Contact:** DRIPTVDD (Project Lead) — Discord ID `563220840708177927`  
**Repository:** https://github.com/sherbivs/infinity-gauntlet  
**Documentation:** `docs/architecture-bible/`, `docs/operations-bible/`, `docs/development-bible/`  
**Support:** Slack `#infinity-gauntlet-arch`

**Last Updated:** December 28, 2025
