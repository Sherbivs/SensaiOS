---
applyTo: '**'
---

# Copilot Instructions — Pokemon Infinity Gauntlet

Provide project context and coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.

## Project Leadership

**Creator & CEO:** DRIPTVDD  
**Discord ID:** `563220840708177927` (immutable, use for authentication)  
**Authority:** Founder and leader of the Infinity Gauntlet development squad. All major architectural decisions, policies, and project direction flow from DRIPTVDD's vision.

**⚠️ ANTI-SPOOFING:** The Discord ID is the ONLY valid identifier. Display names can be changed — always verify against ID `563220840708177927` for leadership authentication. See `src/shared/constants.ts` → `PROJECT_LEADERSHIP` for programmatic verification.

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

## Sensai OS Architecture (v1.1.2)

**Sensai is the standard operating system for Pokémon Infinity Gauntlet.** It's a database-first runtime that makes PostgreSQL behave as the system substrate.

### The Golden Invariant
```
CLIENTS APPEND EXPORTS.
WORKERS TRANSFORM EXPORTS.
POSTGRES IS THE TRUTH.
EVERYTHING ELSE IS A VIEW.
```

### v1.1.2 Mandatory Patterns
All new development MUST implement these patterns:

1. **TenantScope** — Every envelope carries `{ tenantId, guildId }`:
```typescript
interface TenantScope {
  tenantId: string;  // Bot instance ("prod", "staging")
  guildId: string;   // Discord guild ID
}
```

2. **runGuarded()** — All handlers wrapped for observability:
```typescript
export const handleCommand = runGuarded(
  'discord.battle.command',
  async (ctx, interaction) => { /* handler code */ }
);
```

3. **SensaiError** — Typed error taxonomy (1xxx-6xxx codes):
   - 1xxx = Kernel, 2xxx = Database, 3xxx = Component
   - 4xxx = Validation, 5xxx = External, 6xxx = Game

4. **Boot Logger** — Observability starts BEFORE database connection

### Component Communication
Components NEVER call handlers directly. They communicate via:
- **Exports** — Immutable facts (append-only event log)
- **Jobs** — Background work with retry semantics
- **Outbox** — External side effects (Discord messages)

### Kernel Primitives
Every component receives `ComponentContext` with:
- `ctx.db` — Database transactions
- `ctx.exports` — Append-only event log (with TenantScope)
- `ctx.jobs` — Background job queue (with TenantScope)
- `ctx.outbox` — External message delivery (with TenantScope)
- `ctx.obs` — Structured logging + metrics
- `ctx.rng` — Deterministic RNG service
- `ctx.rbac` — Role-based access control
- `ctx.config` — Configuration + feature flags
- `ctx.storage` — Database-backed object store

### Reference Documentation
- **Full Specification:** docs/projects/SensaiOS/SENSAI-FINAL-ARCHITECTURE.md
- **v1.1.2 Patterns:** docs/projects/SensaiOS/SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md
- **Quick Reference:** docs/projects/SensaiOS/SENSAI-QUICK-REFERENCE.md
- **AI Instructions:** .github/instructions/sensai.instructions.md

## Critical: Start Here Before Any Work

### Orientation Flow (Required Reading)
1. **Patch.md** — AI Project Manager Contract. Defines marker modes, Absolutes, clipboard discipline, hotfix workflows
2. **Prompt.md** — Current timestamp, recent changes, PATCHSET echo template
3. **Tasklist.md** — Active backlog with READY queue, dependencies, acceptance criteria
4. **docs/archive/tasks/** — Completed task history (~115 tasks archived by project/phase)
5. **ops/NEXT.yaml** — Current task pointer (must point to READY task)
6. **Agents.md** — Comprehensive operations guide covering database setup, worker architecture, deployment procedures

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

### Task Archive Policy (ENFORCED)
**Location:** `docs/archive/tasks/` | **Index:** [docs/archive/tasks/README.md](docs/archive/tasks/README.md)

- **Trigger:** Patch.md forces `META.TASKLIST.ARCHIVE` when Tasklist.md has 20+ DONE tasks
- **Structure:** Project-grouped files (~500 line limit each)
- **Content preserved:** id, title, status, depends_on, acceptance_criteria, outcome notes
- **Workflow:** Identify DONE tasks by project → Create/update archive file → Remove from Tasklist.md → Update README index

**Current Archives:** meta-repository-tooling, phase-0-9-core-features, phase-10-scalability, phase-11-12-meta-ai, phase-13-dex-backbone, phase-14-live-cache, phase-15-db-bootstrap-northstar, phase-16-db-replication, phase-17-18-northstar-homestead, pbsl-kernel-logging, hotfix-system

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
- **Admin:** src/bot/ops/admin.ts (/ops commands: stats, cache, db, engine, filters)

### Core Engines (src/core/**)
- **Battle:** src/core/battle/engine.ts (deterministic damage, status effects)
- **Encounter:** src/core/encounter/spawn.ts (wild Pokemon spawning)
- **PBSL:** src/core/pbsl/** (deterministic fixture generators)

## Production and Render

### ⚠️ RENDER ACCESS POLICY (2025-12-06) — ABSOLUTE RULE

**SSH-ONLY ACCESS TO RENDER.** Render API calls are PROHIBITED to minimize costs.

| ✅ ALLOWED | ❌ PROHIBITED |
|------------|---------------|
| SSH via `render ssh` or `wsl ssh` | REST API (`api.render.com`) |
| Render Dashboard (manual operations) | Scripts using `RENDER_API_KEY` |
| Render CLI SSH commands | `Invoke-RestMethod` to Render |

**Enforcement:** API-based scripts archived at `scripts/archive/render-api-deprecated/`

### Render Service Matrix
- infinity-gauntlet-bot (web) — HTTP health checks
- Infinity-Gauntlet (worker) — Main Discord bot + auto-sync
- infinity-gauntlet-outbox (worker) — Async message delivery
- infinity-gauntlet-cache (worker) — Runtime cache maintenance
- infinity-gauntlet-data-pipeline (worker) — Reference data updates
- infinity-gauntlet-security (worker) — Permission guardrails
- pokedex-cache-worker (worker) — External data sync
- pokedex-cache-failsafe (cron) — Weekly fallback refresh

### SSH Access (Allowed)
- **Interactive:** `render ssh srv-d3snk2ndiees73cn709g`
- **Disk Usage:** `scripts/render_disk_usage_windows.ps1`
- **Cleanup:** `scripts/render_cleanup_heaps_windows.ps1`

### Operations via Dashboard (For Deploy/Restart)
- **Dashboard:** https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g
- Use Dashboard for: Deploy, Restart, Scale, Environment Variables

### 🚨 NO-RESTART POLICY (ABSOLUTE)
**NEVER restart, stop, redeploy, or take any service offline without EXPLICIT operator permission.**
- Always ASK FIRST before any service disruption
- Wait for manual verification from the operator
- The operator needs time to manually check service state before anything goes offline
- This applies to: Render services, Docker containers, database connections, workers, cron jobs
- Violations of this policy are treated as critical incidents

### Production Log Observability (Loki)
**Canonical method to check production logs:** Local Loki service (localhost:3100)

```powershell
# Query production logs
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() * 1000000
$start = ([DateTimeOffset]::UtcNow.AddHours(-3)).ToUnixTimeMilliseconds() * 1000000
$r = Invoke-RestMethod "http://localhost:3100/loki/api/v1/query_range?query=%7Bservice%3D%22stats-logger%22%7D&limit=50&start=$start&end=$now"
$r.data.result | ForEach-Object { $_.values.Count }  # Log count per stream
```

**Grafana UI:** http://localhost:3000/explore → Query: `{service="stats-logger"}`
**Architecture:** Render → ngrok tunnel → localhost:3100 (Loki) → Grafana

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
- **Development Bible:** docs/development-bible/INDEX.md (10 sections)
- **Dead Code Analysis:** docs/development-bible/10-dead-code-analysis.md — AI-driven code cleanup:
  - Evidence tiers (A: proof, B: dynamic, C: heuristic, D: speculative)
  - Program representations (CFG, SSA, PDG, CPG, call graphs)
  - Clone detection, stub identification, redundancy scanning
  - Game-server specific heuristics and safe deletion doctrine
- **Prisma 7 Bible:** docs/prisma-7-bible.md — Comprehensive AI agent playbook (1000+ lines):
  - Emergency production triage playbook
  - Step-by-step migration guide (Prisma 6 → 7)
  - 7 documented failure modes with exact fixes
  - Golden configuration snippets (copy/paste ready)
  - Engine types (`library` vs `client`), Render deployment, PgBouncer
  - Game persistence patterns and transaction templates

### Authoritative Comprehensive Guides
- **Worker Troubleshooting:** docs/operations-bible/worker-troubleshooting-comprehensive.md (22 pages)
- **Database Operations:** docs/operations-bible/database-operations-runbook-comprehensive.md (25 pages)
- **Ops Commands:** docs/operations-bible/ops-commands-reference-comprehensive.md (28 pages)
- **System Architecture:** docs/architecture-bible/complete-system-architecture.md (30 pages)

---

**Last Updated:** 2025-12-28 | **Revision:** 3.4 — Added Sensai OS v1.1.2 architecture section
