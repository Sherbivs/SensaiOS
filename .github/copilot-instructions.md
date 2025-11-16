# Copilot Instructions — Infinity Gauntlet

## Project Overview
Infinity Gauntlet is a Discord-first Pokémon adventure with DM-as-home gameplay, public arena battles, and live-service data pipelines. Production runs on Render with 6 workers + 1 cron job orchestrating encounters, battles, cache refresh, and security monitoring.

## Critical: Start Here Before Any Work

### Orientation Flow (Required Reading)
1. **`Patch.md`** — AI Project Manager Contract. Defines marker modes, Absolutes (never-violate rules), clipboard discipline, and hotfix workflows
2. **`Prompt.md`** — Current timestamp, recent changes, PATCHSET echo template
3. **`Tasklist.md`** — Active backlog with READY queue, dependencies, acceptance criteria
4. **`ops/NEXT.yaml`** — Current task pointer (must point to READY task)
5. **`Agents.md`** — Comprehensive operations guide covering database setup, worker architecture, deployment procedures

### Router Navigation System
- **`ops/ROUTER.yaml`** — Router-of-routers manifest. Start here to locate any subsystem
- **`masterroutetable.md`** — Human-readable router index with ownership and last-updated timestamps
- **Every directory has `ROUTER.md`** documenting purpose, owned files, key integration points
- When touching code: update parent + child routers in same commit

### Core Control Documents (Never Rename/Delete)
- `Patch.md`, `Tasklist.md`, `Prompt.md` — Meta workflow coordination
- `ops/ROUTER.yaml`, `ops/ROUTER_INDEX.yaml`, `masterroutetable.md` — Routing manifests
- Any `ROUTER.md` file — Subsystem documentation
- Violating these triggers CI failures and blocks merges

## Architecture Essentials

### Database Architecture (CRITICAL)
```typescript
// THREE Prisma clients initialized on startup:
import { prisma, onPremiseDevPrisma, onPremiseExperimentPrisma } from "./shared/prisma.js";

// PRIMARY: Unified Render-managed PostgreSQL (all production operations)
const prodUsers = await prisma.user.findMany(); // PROD_DATABASE_URL

// OPTIONAL: Workstation development (offline fallback)
if (onPremiseDevPrisma) {
  const localUsers = await onPremiseDevPrisma.user.findMany(); // DATABASE_ONPREMISE_DEV_PRIMARY
}

// OPTIONAL: Migration testing (isolated experiments)
if (onPremiseExperimentPrisma) {
  const experimentUsers = await onPremiseExperimentPrisma.user.findMany(); // DATABASE_ONPREMISE_DEV_EXPERIMENT
}
```

**Environment Variable Priority:**
1. `PROD_DATABASE_URL` → PRIMARY production database (Render managed)
2. `RENDER_DB_EXTERNAL_URL` → Direct PostgreSQL access (external)
3. `DATABASE_ONPREMISE_DEV_PRIMARY` → Workstation mirror (offline mode)
4. `DATABASE_ONPREMISE_DEV_EXPERIMENT` → Migration testing cluster

**See `docs/database-url-selection.md` for complete URL selection logic.**

### State Persistence (Security Bot)
Security bot maintains 7-day state history in `Store/security-bot-state/`:
- `current.json` — Active runtime state
- `previous.json` — Backup from last restart
- `snapshots/*.json` — Hourly backups (7-day retention)

Cumulative statistics (sweeps, alerts, permission changes) survive restarts. Auto-saves every 5 minutes + final save on SIGTERM/SIGINT.

### Event Bus (Phase 2.4.3 Complete)
Unified pub-sub system at `src/shared/event-bus.ts`:
- Correlation tracking via `correlationId` + `parentCorrelationId`
- Pattern matching: `alert.critical|alert.security` → immediate delivery
- Backpressure: 75% warn, 95% reject
- IntelligentLogger migrated to Event Bus exclusively (no legacy queue)

### Memory Management (Bounded Data Structures)
All runtime structures bounded per 2025-11-06 audit:
- **Discord.js cache sweeping** — Prevents 100+ MB leaks
- **Write queues** — 10k entry cap, 75% backpressure
- **Ops error queue** — 200 entry rolling buffer
- **L1 Cache** — 20 MB max via lazy loading + feature flags
- Peak RAM: ~300-350 MB per service (58-68% of 512 MB limit)

## Development Workflows

### Environment Setup
```powershell
# Use SINGLE consolidated environment file for all development
$env:IG_ENV_FILE="secrets/Infinity-Gauntlet.env"

# Register for future shells (creates persistent pointer)
pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist

# Verify loading
echo $Env:IG_ENV_FILE
```

**Production safety:** Repo `.env` stays EMPTY. Local secrets always from external file. Production ignores repo `.env` unless `IG_ALLOW_REPO_ENV=1`.

### Common Commands
```powershell
# Development
npm install                  # Install dependencies
npm run dev                  # Watch mode with hot reload
npm test                     # Vitest suite (293/294 passing)
npm run lint                 # ESLint TypeScript codebase
npm run build                # Production build

# Database Operations
npm run db:cli -- status     # Connection info + sample counts
npm run db:cli -- counts     # Table counts (Species, BusMessage, etc.)
npm run db:cli -- query "SELECT COUNT(*) FROM \"Species\";"

# Data Pipeline
npm run data:build           # Refresh Pokémon reference data
npm run data:dexpack         # Rebuild dexpack v1 + v2 assets

# Meta Operations
npm run refresh:vision       # Regenerate routers + recovery metadata
npm run tasks:archive        # Archive DONE tasks to ops/ARCHIVE/
npm run docs:update-routers  # Rebuild router indexes
```

### Testing Patterns
- **Unit tests:** `tests/*.spec.ts` (battle engine, DM flows, ops commands)
- **PBSL oracle:** `tests/pbsl/**` (deterministic battle snapshots)
- **Integration:** `tests/battle/actions.interaction.spec.ts` (Discord button flows)
- **Run subset:** `npm run test:pbsl` (PBSL-specific suite)
- **Benchmarks:** `npm run bench:dex` (dexpack lookup performance)

## Project-Specific Conventions

### File Naming & Organization
- **TypeScript source:** `src/**/*.ts` (application code)
- **Tests:** `tests/**/*.spec.ts` or `*.test.ts`
- **Scripts:** `scripts/**/*.{ts,js,mjs,ps1}` (automation)
- **Docs:** `docs/**/*.md` (architecture, operations, runbooks)
- **Ops:** `ops/**/*.{md,yaml}` (governance, tasklists, routers)

### Router Discipline
Every code change MUST update routers in same commit:
1. Update parent `ROUTER.md` (e.g., `src/bot/ROUTER.md`)
2. Update child `ROUTER.md` if creating new subdirectory
3. Run `npm run docs:update-routers` to regenerate indexes
4. Verify `scripts/guard_routing.sh` passes before commit

### Database Naming (Absolute - Canonical Terms)
- **CLOUD-PROD-MASTER** (`PROD_DATABASE_URL`) — Production database
- **ONPREMISE-DEV-PRIMARY** (`DATABASE_ONPREMISE_DEV_PRIMARY`) — Workstation development
- **ONPREMISE-DEV-EXPERIMENT** (`DATABASE_ONPREMISE_DEV_EXPERIMENT`) — Migration testing

**NEVER use:** "local", "LOCAL", "PRIMARY LOCAL", "EXPERIMENTAL", "DEV_DATABASE_URL" (deprecated)

### Commit Message Format
```
[Task T10.5] Brief summary of change

Why: Explain the business/technical reason
Changes: List major modifications
Testing: Command outputs or test results
```

Meta-only changes still need clear "Why" statements.

### Tasklist Discipline
- **Status flow:** `PROPOSED` → `READY` → `IN_PROGRESS` → `DONE` → `BLOCKED`
- Update headers (`Last Updated`, `Revision`) on every change
- Add acceptance criteria for new tasks
- Include outcome notes when marking `DONE`
- Never delete tasks with active dependencies

## Integration Points

### Discord Bot Layer (`src/bot/**`)
- **Entry:** `src/bot/index.ts` (client bootstrap + command routing)
- **DM flows:** `src/bot/dm/**` (home, heal, starters, profile with pagination)
- **Battles:** `src/bot/battle/**` (move/switch/forfeit handlers)
- **Wilds:** `src/bot/wilds/**` (walk, catch, throw, escape)
- **Admin:** `src/bot/ops/admin.ts` (`/ops` commands with filters)

### Core Engines (`src/core/**`)
- **Battle:** `src/core/battle/engine.ts` (deterministic damage, status effects)
- **Encounter:** `src/core/encounter/spawn.ts` (wild Pokémon spawning)
- **PBSL:** `src/core/pbsl/**` (deterministic fixture generators)

### Data Pipeline (`src/data_pipeline/**`)
- Fetches PokéAPI data via `scripts/fetch_pokemon.mjs`
- Normalizes to `data/**` JSON shards
- Builds dexpack assets in `assets/` (committed for runtime)

### Workers (`src/worker/**`)
Run as separate Render services:
- **Outbox:** Drains Event Bus messages
- **Cache:** Refreshes Pokémon cache hourly
- **Data Pipeline:** Rebuilds reference data
- **Security:** Role sweeps with 7-day state persistence

## Production & Render

### Render Service Matrix
- `infinity-gauntlet-bot` (web) — HTTP health checks
- `Infinity-Gauntlet` (worker) — Main Discord bot + auto-sync [Deploy: `Infinity-Gauntlet` | ID: `srv-d3snk2ndiees73cn709g`]
- `infinity-gauntlet-outbox` (worker) — Async message delivery
- `infinity-gauntlet-cache` (worker) — Runtime cache maintenance
- `infinity-gauntlet-data-pipeline` (worker) — Reference data updates
- `infinity-gauntlet-security` (worker) — Permission guardrails
- `pokedex-cache-worker` (worker) — External data sync
- `pokedex-cache-failsafe` (cron) — Weekly fallback refresh

### Deployment Command
```powershell
# Deploy main bot to production
pwsh -File "scripts/render_deploy.ps1" -Service "Infinity-Gauntlet"

# Or use VS Code task: "Render: Deploy Main Bot"
```

**Service Details:**
- Name: `Infinity-Gauntlet`
- ID: `srv-d3snk2ndiees73cn709g`
- Region: Virginia
- Dashboard: https://dashboard.render.com/services/srv-d3snk2ndiees73cn709g

### Monitoring Commands
```powershell
npm run render:status        # Service status matrix
npm run render:deploys       # Deployment history
npm run render:restart       # Restart service
```

### Render Path Structure (CRITICAL)
Repository clones to `/opt/render/project/src/` (NOT `/opt/render/project/`):
- Creates nested structure: `src/` appears at `/opt/render/project/src/src/`
- Working directory: `/opt/render/project/src/` for all commands
- Compiled output: `/opt/render/project/src/dist/`
- **This is expected Render platform behavior**

See `docs/deployment/RENDER-PATH-MAPPING-2025-11-14.md` for complete details.

## Safety & Recovery

### Error Handling
Domain-specific handlers in every layer:
- `src/bot/bot-error-handler.ts` — Discord API errors, rate limits, timeouts
- `src/core/engine-error-handler.ts` — Battle/encounter engine errors
- `src/workers/worker-error-handler.ts` — Background job failures
- All handlers integrate with ErrorTracker (`src/services/error-tracker.ts`)

### Stuckness Detection
Agent considered stuck if:
- No artifact/state change in 3 consecutive steps
- Same error string seen ≥2 times in 10 minutes
- Budget exceeded (time > 15m or tokens > threshold)

**Recovery:** Shrink scope → Swap strategy → Reset context → Escalate via `playbooks/escalate.md`

### Hotfix Workflow
```
1. Trigger: "ACTIVATE: HOTFIX ENGINE: <note>"
2. Restrict edits: ops/HOTFIX_PLAN.yaml + listed files only
3. Skip clipboard/markers (emergency bypass)
4. Restore ops/NEXT.yaml to READY task before exit
5. Document in ops/HOTFIX.md
```

## Performance Considerations

### Startup Optimization
- Logger auto-refresh delayed until after Service Registry init
- Prevents temporary "degraded" warnings during first 10-20s
- See `src/index.ts` lines 1045-1054 for initialization order

### Memory Footprint
- **Target:** <512 MB per service
- **Actual:** ~300-350 MB (58-68% of limit)
- **L1 Cache:** 20 MB max (lazy loading + feature flags)
- **Write Buffer:** 5 MB (queue size limits)
- **Logger Buffer:** 1 MB (200 entry cap)

### Database Performance
- **Workstation latency:** <50ms (via DATABASE_ONPREMISE_DEV_PRIMARY)
- **Render latency:** 50-100ms (via PROD_DATABASE_URL)
- **Connection pooling:** Disabled (direct PostgreSQL mode)
- **Heartbeat interval:** 30s (configurable via PRISMA_HEARTBEAT_INTERVAL_MS)

## Documentation Standards

### Console Output (Standardized 2025-11-09)
All scripts use centralized `output-formatter.ts`:
```typescript
import { printSection, printKeyValue, printSuccess } from "../src/utils/output-formatter.js";

printSection("Database Migration");
printKeyValue("Status", "Complete");
printSuccess("Migration applied successfully");
```

**Benefits:**
- Consistent formatting across 11+ scripts
- ESLint enforcement via `scripts-prefer-output-formatter` rule
- 61 comprehensive tests
- ASCII-safe (no Unicode box drawing in Windows terminals)

### Router Documentation
Every `ROUTER.md` must include:
```markdown
# ROUTER
Title: [Subsystem Name]
Purpose: [Brief description]
Owned Globs: [directory]/**
Last Updated (UTC): 2025-XX-XXT00:00:00Z

Notes:
- [Key integration points]
- [Recent changes]

Areas:
- [File/directory] — [Purpose]
```

## Common Pitfalls

1. **Database URLs:** Always use canonical environment variables. Don't hardcode connection strings.
2. **Router Updates:** Forgetting to update routers breaks CI guards and blocks merges.
3. **Tasklist Sync:** NEXT.yaml must point to READY task. Guard scripts enforce this.
4. **Test Isolation:** Prisma clients mock properly via `vi.mock("../shared/prisma.js")`.
5. **Memory Leaks:** All intervals/timers must be cleared in shutdown handlers.
6. **Render Paths:** Code expects nested `/opt/render/project/src/src/` structure.
7. **Logger Timing:** Never call logger functions before Service Registry initializes.

## Quick Reference Links

- **Architecture:** `README.md` → comprehensive system overview
- **Operations:** `OPERATIONS.md` → service matrix + deployment procedures
- **Database Guide:** `docs/database-url-selection.md` → URL selection logic
- **Worker Scaling:** `docs/workers.md` → Phase 10+ roadmap
- **Memory Audit:** `docs/MEMORY-LEAK-INVESTIGATION-2025-11-13.md` → leak investigation
- **PBSL Manifesto:** `docs/PBSL.md` → deterministic battle system
- **Error System:** `docs/error-detection-system.md` → comprehensive error handling

## Getting Help

1. Check `ops/NEXT.yaml` for current task context
2. Review `Tasklist.md` for related work and dependencies
3. Search `docs/` for relevant architecture documentation
4. Use `ops/ROUTER.yaml` to locate subsystem documentation
5. Escalate via `playbooks/escalate.md` if blocked

---

**Last Updated:** 2025-11-16 | **Revision:** 1.0
