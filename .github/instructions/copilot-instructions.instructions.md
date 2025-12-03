---
applyTo: '**'
---

# Copilot Instructions — Pokemon Infinity Gauntlet

Provide project context and coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.

## Project Overview

Pokemon Infinity Gauntlet is a Discord-first Pokemon adventure with **private guild channel-based gameplay** (homestead channels), public arena battles, and live-service data pipelines. Production runs on Render with 6 workers + 1 cron job orchestrating encounters, battles, cache refresh, and security monitoring.

**HOMESTEAD MIGRATION COMPLETE (2025-06-15):** All gameplay uses private guild channels (homestead-{username}). DM modules removed. See docs/architecture-bible/18-private-channel-architecture.md.

## TERMINOLOGY ENFORCEMENT (2025-12-02)

**ALL code, documentation, comments, and logs MUST use standardized terminology.**
- **Full Schema:** Agents.md section STANDARDIZED TERMINOLOGY SCHEMA
- **Database Terms:** CLOUD-PROD-MASTER, ONPREMISE-DEV-PRIMARY, ONPREMISE-DEV-EXPERIMENT
- **Channel Terms:** Homestead Channel, Public Field Channel, Arena Thread
- **Engine Terms:** PBSL, Dexpack, Engine Read-DB, Engine Write-DB, L1 Cache
- **Enforcement:** Code review, AI assistants, documentation standards

## Critical: Start Here Before Any Work

### Orientation Flow (Required Reading)
1. **Patch.md** — AI Project Manager Contract. Defines marker modes, Absolutes, clipboard discipline, hotfix workflows
2. **Prompt.md** — Current timestamp, recent changes, PATCHSET echo template
3. **Tasklist.md** — Active backlog with READY queue, dependencies, acceptance criteria
4. **ops/NEXT.yaml** — Current task pointer (must point to READY task)
5. **Agents.md** — Comprehensive operations guide covering database setup, worker architecture, deployment procedures

### Router Navigation System
- **ops/ROUTER.yaml** — Router-of-routers manifest. Start here to locate any subsystem
- **masterroutetable.md** — Human-readable router index with ownership and last-updated timestamps
- **Every directory has ROUTER.md** documenting purpose, owned files, key integration points
- When touching code: update parent + child routers in same commit

### Core Control Documents (Never Rename/Delete)
- Patch.md, Tasklist.md, Prompt.md — Meta workflow coordination
- ops/ROUTER.yaml, ops/ROUTER_INDEX.yaml, masterroutetable.md — Routing manifests
- Any ROUTER.md file — Subsystem documentation
- Violating these triggers CI failures and blocks merges

## Architecture Essentials

### Database Architecture (CRITICAL)
- **CLOUD-PROD-MASTER** (PROD_DATABASE_URL) — Production database
- **ONPREMISE-DEV-PRIMARY** (DATABASE_ONPREMISE_DEV_PRIMARY) — Workstation development
- **ONPREMISE-DEV-EXPERIMENT** (DATABASE_ONPREMISE_DEV_EXPERIMENT) — Migration testing

**Prisma Clients:** prisma, onPremiseDevPrisma, onPremiseExperimentPrisma
**CLI Targets:** cloud-prod, onpremise-dev, onpremise-experiment

**NEVER use as database identifiers:** LOCAL, PRIMARY LOCAL, EXPERIMENTAL (standalone), DEV_DATABASE_URL

**VALID descriptive usage:** local development, local setup, local testing (adjective describing workstation context)

## Development Workflows

### Environment Setup
Use SINGLE consolidated environment file for all development: secrets/Infinity-Gauntlet.env

Production safety: Repo .env stays EMPTY. Local secrets always from external file.

### Common Commands
- npm install — Install dependencies
- npm run dev — Watch mode with hot reload
- npm test — Vitest suite
- npm run lint — ESLint TypeScript codebase
- npm run build — Production build
- npm run db:cli -- status — Connection info + sample counts
- npm run docs:update-routers — Rebuild router indexes

## Integration Points

### Discord Bot Layer (src/bot/**)
- **Entry:** src/bot/index.ts (client bootstrap + command routing)
- **Homestead Channels:** src/bot/homestead/** (private guild channel gameplay) — ACTIVE
- **Battles:** src/bot/battle/** (move/switch/forfeit handlers)
- **Wilds:** src/bot/wilds/** (walk, catch, throw, escape)
- **Admin:** src/bot/ops/admin.ts (/ops commands with filters)

### Core Engines (src/core/**)
- **Battle:** src/core/battle/engine.ts (deterministic damage, status effects)
- **Encounter:** src/core/encounter/spawn.ts (wild Pokemon spawning)
- **PBSL:** src/core/pbsl/** (deterministic fixture generators)

## Production and Render

### Render Service Matrix
- infinity-gauntlet-bot (web) — HTTP health checks
- Infinity-Gauntlet (worker) — Main Discord bot + auto-sync
- infinity-gauntlet-outbox (worker) — Async message delivery
- infinity-gauntlet-cache (worker) — Runtime cache maintenance
- infinity-gauntlet-data-pipeline (worker) — Reference data updates
- infinity-gauntlet-security (worker) — Permission guardrails
- pokedex-cache-worker (worker) — External data sync
- pokedex-cache-failsafe (cron) — Weekly fallback refresh

## Common Pitfalls

1. **Database URLs:** Always use canonical environment variables. Do not hardcode connection strings.
2. **Router Updates:** Forgetting to update routers breaks CI guards and blocks merges.
3. **Tasklist Sync:** NEXT.yaml must point to READY task. Guard scripts enforce this.
4. **Test Isolation:** Prisma clients mock properly via vi.mock.
5. **Memory Leaks:** All intervals/timers must be cleared in shutdown handlers.
6. **Render Paths:** Code expects nested /opt/render/project/src/src/ structure.
7. **Logger Timing:** Never call logger functions before Service Registry initializes.

## Quick Reference Links

### Core Documentation
- **Architecture Bible:** docs/architecture-bible/INDEX.md
- **Operations Bible:** docs/operations-bible/INDEX.md
- **Development Bible:** docs/development-bible/INDEX.md

### Authoritative Comprehensive Guides
- **Worker Troubleshooting:** docs/operations-bible/worker-troubleshooting-comprehensive.md (22 pages)
- **Database Operations:** docs/operations-bible/database-operations-runbook-comprehensive.md (25 pages)
- **Ops Commands:** docs/operations-bible/ops-commands-reference-comprehensive.md (28 pages)
- **System Architecture:** docs/architecture-bible/complete-system-architecture.md (30 pages)

---

**Last Updated:** 2025-06-15 | **Revision:** 3.0
