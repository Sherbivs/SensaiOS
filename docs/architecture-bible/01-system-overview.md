# Section 1: System Overview

[← Back to Index](INDEX.md)

---

## Meta-Router

**Orchestration:** Planner → Researcher → Implementer → Reviewer loops

**Agents:** Pure functions mapping input Task → output StepResult; side effects isolated behind tools

**Observability:** JSONL event log + OpenTelemetry traces for router and tools

**State Management:** Working memory (ephemeral), Artifacts (files, PRs), Ledger (run.json)

---

## Service Matrix

**8 Render Services (Production):**

| Service | Type | Purpose | Details |
|---------|------|---------|---------|
| `infinity-gauntlet-bot` | web | HTTP health checks + webhooks | Frontend health endpoint |
| `Infinity-Gauntlet` | worker | **Main Discord bot + auto-sync** | **Deploy ID:** `srv-d3snk2ndiees73cn709g` |
| `infinity-gauntlet-outbox` | worker | Async message delivery | Event Bus → Discord |
| `infinity-gauntlet-cache` | worker | Runtime cache maintenance | Hourly refresh |
| `infinity-gauntlet-data-pipeline` | worker | Reference data updates | PokéAPI sync |
| `infinity-gauntlet-security` | worker | Permission guardrails | Persistent state (7-day history) |
| `pokedex-cache-worker` | worker | External data sync to GitHub | Automated dex updates |
| `pokedex-cache-failsafe` | cron | Weekly fallback refresh | Safety net |

---

## Database Architecture

### Production Database

**Provider:** Render-managed PostgreSQL  
**Database:** `infinity-gauntlet-db`  
**Connection:** All services connect via `PROD_DATABASE_URL`  
**Purpose:** Unified production database for all gameplay operations

### Development Databases (Workstation-Only, OFFLINE)

| Database | Port | Environment Variable | Purpose |
|----------|------|---------------------|---------|
| **ONPREMISE-DEV-PRIMARY** | 55433 | `DATABASE_ONPREMISE_DEV_PRIMARY` | Offline development mirror |
| **ONPREMISE-DEV-EXPERIMENT** | 55434 | `DATABASE_ONPREMISE_DEV_EXPERIMENT` | Migration testing sandbox |

**CRITICAL:** Workstation databases are **100% OFFLINE** — NOT visible to production nodes.

---

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 22.16.0 | Runtime |
| **TypeScript** | 5.7.3 | Type safety |
| **Discord.js** | v14 | Discord API |
| **Prisma** | Latest | Database ORM |
| **PostgreSQL** | Latest | Database |
| **Vitest** | Latest | Testing framework |
| **ESLint** | Latest | Linting |

---

## Quality Metrics

### Build Status
- **Errors:** ✅ 0
- **Warnings:** ✅ 0
- **Status:** GREEN

### Test Suite
- **Passing:** 293/294 tests
- **Coverage:** Core flows validated
- **Execution Time:** 6.82s
- **Status:** GREEN (1 known flaky test)

### Code Quality
- **Linter:** ✅ 0 warnings
- **Security:** ✅ 0 npm vulnerabilities
- **Dependencies:** ✅ 0 outdated packages
- **Status:** GREEN

---

## Design Principles

1. **Observable by Default** — JSONL logs + OpenTelemetry traces on all operations
2. **Fail Fast** — Explicit validation, detailed logging, no silent failures
3. **Pure Functions** — Agents are stateless transformers; side effects isolated
4. **Single Source of Truth** — DEV database is master; PROD replicates from DEV
5. **Offline-First Development** — Workstation mirrors support offline workflows
6. **Immutable Deployments** — Container-based deploys, no in-place updates
7. **Version Control Everything** — Migrations, configs, infrastructure as code

---

## Service Topology

```
┌─────────────────────────────────────────────────────────┐
│                     RENDER CLOUD                        │
│                                                           │
│  ┌─────────────────┐      ┌─────────────────┐          │
│  │  infinity-      │      │  Infinity-      │          │
│  │  gauntlet-bot   │◄────►│  Gauntlet       │          │
│  │  (web)          │      │  (main worker)  │          │
│  └─────────────────┘      └────────┬────────┘          │
│                                     │                    │
│                                     ▼                    │
│  ┌──────────────────────────────────────────┐          │
│  │         Event Bus (In-Memory)            │          │
│  └──┬───────┬───────┬───────┬──────┬───────┘          │
│     │       │       │       │      │                    │
│     ▼       ▼       ▼       ▼      ▼                    │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                   │
│  │Out │ │Cach│ │Data│ │Sec │ │Dex │                   │
│  │box │ │e   │ │Pipe│ │ure │ │Wkr │                   │
│  └────┘ └────┘ └────┘ └────┘ └────┘                   │
│                                                           │
│  ┌─────────────────────────────────────────┐            │
│  │  infinity-gauntlet-db (PostgreSQL)      │            │
│  │  PROD_DATABASE_URL                      │            │
│  └─────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────┘
                       │
                       │ HTTPS (Workstation Only)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  DEVELOPER WORKSTATION                   │
│                                                           │
│  ┌─────────────────┐      ┌─────────────────┐          │
│  │  ONPREMISE-     │      │  ONPREMISE-     │          │
│  │  DEV-PRIMARY    │      │  DEV-EXPERIMENT │          │
│  │  (Port 55433)   │      │  (Port 55434)   │          │
│  │  OFFLINE MIRROR │      │  TEST SANDBOX   │          │
│  └─────────────────┘      └─────────────────┘          │
│                                                           │
│  Store/db/                 Store/db-experiment/          │
└─────────────────────────────────────────────────────────┘
```

---

## Navigation

**Next:** [Section 2: Database Architecture →](02-database-architecture.md)

**Related Sections:**
- [Section 3: Worker Architecture](03-worker-architecture.md) — Worker topology details
- [Section 4: Event Bus](04-event-bus.md) — Pub-sub system connecting services
- [Section 11: Safety Guarantees](11-safety-guarantees.md) — Memory, error isolation, recovery

---

**Last Updated:** 2025-11-17  
**Status:** Production  
**Owner:** Core Infrastructure
