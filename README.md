# Infinity Gauntlet Pokémon Suite

Infinity Gauntlet is a Discord-first Pokémon adventure for Dripcord. Players live in
DMs, explore the Wilds together, battle in public arenas, and progress through a
live-service economy powered by workers and data pipelines.

**Cross-References**:
- See `AGENTS.md` for comprehensive operations guide, database setup, worker architecture
- See `OPERATIONS.md` for service matrix, deployment procedures, monitoring
- See `docs/workers.md` for worker architecture, scaling roadmap (Phase 10+), cost optimization
- See `ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md` for deployment readiness validation
- See `ops/META-DOC-INDEX.md` for complete meta documentation navigation

## Current Status & Goals

**Phase 9 Complete** (2025-11-08): Repository is production-ready, centralized, standardized, and scalable. All quality metrics optimized:
- ✅ **Zero linter warnings** across TypeScript codebase
- ✅ **Zero npm vulnerabilities**, all dependencies current
- ✅ **Fast tests**: 293/294 passing (6.82s execution)
- ✅ **Clean documentation**: 25 current docs + 6 archived
- ✅ **Unified Render PostgreSQL**: Single managed database for all services (scalable to multi-DB when needed)
- ✅ **Worker architecture**: Comprehensive scaling roadmap (see `docs/workers.md`)
- ✅ **Deployment ready**: Full production checklist (see `ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md`)
- ✅ **Memory safety**: Comprehensive audit complete (12/12 structures bounded, ~300-350 MB peak RAM)
- ✅ **7-day state persistence**: Security bot maintains hourly metrics with full restart continuity

**See `ops/REPO-OPTIMIZATION-REPORT.md` for comprehensive Phase 9 achievements.**

**Recent Enhancements (November 2025)**:
- ✅ **Phase 2.4.3 Complete**: IntelligentLogger Event Bus migration (unified pub-sub, correlation tracking)
- ✅ **Memory Safety Audit**: Fixed 3 critical unbounded growth bugs (writeQueue, Discord.js caches, ops error queue)
- ✅ **State Persistence**: 7-day hourly metrics history for security bot (168 hours of trend data)
- ✅ **Cache Sweeping**: Discord.js automatic cache management (prevents 100+ MB memory leaks)

**Short-term focus**:
- Database replication architecture (Phase 16: Unified→Multi-DB expansion when infrastructure allows)
- Worker scaling & cost optimization (Phase 10+: battle pool, encounter generator)
- Operational hardening (monitoring, alerting via `/ops stats` + `/ops cache`)

**Near horizon**: Structured guild playtests, advanced battle mechanics (weather/terrain/abilities), trainer progression systems.

## Architecture Snapshot

- **Discord Bot Layer:** `src/bot/**` manages slash commands, DM experiences, arena threads, ops tooling, and router-driven routing metadata. Security bot (`security-bot.js`) monitors guild permissions with 7-day state persistence and automatic reversion.
- **Core Engine:** `src/core/**` executes deterministic battle and encounter logic, keeping shared math and status systems separate from the Discord layer.
- **Data & Persistence:** Prisma schema (`prisma/schema.prisma`) persists trainers, parties, encounters, and battles; unified Render-managed PostgreSQL (infinity-gauntlet-db) provides reliable cloud database with automatic migrations; worker scripts refresh cached reference data under `/data`. Security bot state persists to `Store/security-bot-state/` with hourly metrics, cumulative totals, and 7-day trend data.
- **Memory Management:** Comprehensive memory safety with bounded data structures (Discord.js cache sweeping, write queue caps, auto-pruning). Peak RAM: ~300-350 MB per service (58-68% of 512 MB limit).
- **Event Bus:** Unified pub-sub system (`src/shared/event-bus.ts`) for cross-service communication with correlation tracking, pattern matching, and backpressure protection (Phase 2.4.3 complete).
- **Automation & Guardrails:** `Patch.md`, `Tasklist.md`, and `Prompt.md` define the contract; scripts in `/ops` and `/scripts` enforce Refresh Vision, router indexes, and contract version gates.

## PBSL (Pokémon Buddy System Logics)

The project now ships a PBSL scaffold under `src/core/pbsl/**` that implements seeded RNG helpers, audit trails, battle phase ordering, and deterministic encounter generators. The official manifesto, provenance policy, and compliance checklist live in [`docs/PBSL.md`](docs/PBSL.md). PBSL modules are re-exported via `src/core/pbsl/index.ts` and covered by focused tests in `tests/pbsl/**`, with a dedicated GitHub Action (`.github/workflows/pbsl-oracle.yml`) running lint and `npm run test:pbsl` on every change.

## Key Capabilities

- **DM-as-Home:** `/home`, heal, starter selection, party/box management, player profile, and drip alerts all originate in `src/bot/dm/**` with shared UI helpers.
- **Wild Encounters:** `/walk` spawns public `#wilds` threads while DM controls handle throws, swaps, and escapes via `src/bot/wilds/**` plus `src/core/encounter/**` mechanics.
- **Arena Battles:** `/battle challenge` coordinates arena threads, DM menus, and announcer summaries; Discord orchestration lives in `src/bot/battle/**`, while resolution flows through `src/core/battle/**`.
- **Admin Operations:** `/ops` exposes cooldown reset tools, `/ops stats` filtering (limit/after/participant), and `/ops cache` for hit/miss metrics plus optional cleanup so staff validate health without direct DB access.
- **Persistence & Data:** Prisma schema (`prisma/schema.prisma`) keeps trainer state; cached PokéAPI reference data is refreshed through `scripts/fetch_pokemon.mjs` and `scripts/build-data.js`.
- **Automation:** Render workers and guard scripts enforce Refresh Vision, router hygiene, contract version gates, and Tasklist coupling to keep the repo deterministic.

## Repository Layout

```
├─ src/                    # TypeScript source (bot, core engines, data pipeline)
│  ├─ bot/                 # Discord interactions (DM, wilds, arena, ops, alerts)
│  │  └─ state/            # State persistence (security bot, hourly metrics)
│  ├─ core/                # Deterministic battle + encounter logic
│  ├─ data_pipeline/       # Fetch + normalize PokéAPI payloads
│  ├─ shared/              # Config, logging, Prisma helpers, shared utils
│  │  ├─ cache/            # Centralized cache facade (in-memory LRU + disk)
│  │  └─ event-bus.ts      # Unified pub-sub system (correlation tracking)
│  └─ index.ts             # Boot entry (Discord + Prisma wiring)
├─ scripts/                # Automation (refresh vision, data jobs, guards, workers)
├─ tests/                  # Vitest suites for core engines, pipeline, ops, UI
├─ prisma/schema.prisma    # Database schema for persistent state
├─ ops/                    # Meta governance: Tasklist, routers, NEXT, hotfix plan
├─ docs/                   # Architecture, operations, runbooks, knowledge guides
│  ├─ architecture/        # System design, Event Bus phases, migration reports
│  ├─ database/            # Schema docs, replication, query optimization
│  ├─ deployment/          # Production checklists, Render configuration
│  ├─ game-engine/         # Battle mechanics, encounter logic, Engine DB
│  └─ workers.md           # Worker architecture, scaling roadmap (Phase 10+)
├─ data/                   # Cached reference data shards checked in by workers
├─ Store/                  # On-disk cache namespaces maintained by runtime services
│  ├─ security-bot-state/  # Security bot state (7-day hourly metrics, cumulative totals)
│  ├─ runtime-cache/       # Runtime cache persistence (encounters, battles)
│  └─ discord-cache/       # Discord entity cache (roles, guilds)
└─ README.md               # This guide
```

Legacy JavaScript code paths (`src/bot/main.js`, `security-bot.js`) remain for
backward compatibility but are considered historical. The former
`discord-pokemon-bot/` prototype has been retired; new work should target the
TypeScript app in `src/`.

## Requirements

- Node.js 20+
- npm 9+ (or pnpm/yarn if you wire equivalent scripts)
- Postgres 14+ reachable via direct PostgreSQL connection
- Render-managed deployments should set `DEV_DATABASE_URL` (DEV master) and `PROD_DATABASE_URL` (PROD local node) for the 2-node cluster, or `RENDER_DB_INTERNAL_URL` (Render internal network) / `RENDER_DB_EXTERNAL_URL` (external access) for direct PostgreSQL connections
- Discord bot token with **applications.commands** and **guilds** intents

Optional services:

- Render Jobs API token (for automated data refresh)
- GitHub token with `contents:write` if you mirror data snapshots to another repo

## Getting Started (Development)

1. Install dependencies:
   ```powershell
   npm install
   ```
2. Configure environment variables:
   ```powershell
   $env:IG_ENV_FILE="secrets/Infinity-Gauntlet.env"
   ```
   Use `secrets/Infinity-Gauntlet.env` as the **single consolidated environment file** for all local development and testing. This file contains all required keys: BOT_TOKEN, DEV_DATABASE_URL (DEV master), PROD_DATABASE_URL (PROD local node), RENDER_DB_EXTERNAL_URL (direct PostgreSQL external), RENDER_DB_INTERNAL_URL (direct PostgreSQL internal), DATABASE_LOCAL_URL (local workstation), and POKEMON_BOT_TOKEN. **No other key files are needed.**
   
   Run `pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist` to register the value for future shells (see `docs/ai-env-setup.md` and `docs/db-control-suite.md`). 
   
   The runtime checks `IG_ENV_FILE` (and `DOTENV_CONFIG_PATH`) before falling back to `.env` in the repository root; keep the repo copy empty so local secrets always come from the external file.
   On production (`NODE_ENV=production`), the fallback is disabled unless `IG_ALLOW_REPO_ENV=1` is set.
   Optional: supply `POKE_RENDER_SERVICE_ID`, `POKE_REFRESH_CRON`, or other automation flags as needed.
3. Apply Prisma migrations and generate the client:
   ```powershell
   npx prisma migrate deploy
   npm run build:ci  # or npm run build
   ```
4. Run the bot in watch mode:
   ```powershell
   npm run dev
   ```

`src/index.ts` verifies database connectivity before logging in to Discord. All
interactions are slash-based, so the Message Content intent is not required.

### Common Dev Commands

- Test suites: `npm test`
- Linting: `npm run lint`
- Production build: `npm run build`
- Refresh cached Pokémon data: `npm run data:build`
- Refresh Vision (routers + recovery metadata): `npm run refresh:vision`
- Archive older Tasklist DONE entries: `npm run tasks:archive`
- Database control suite: `npm run db:cli -- status`
- Performance monitoring: `npm run db:cli -- index_usage`, `table_bloat`, `slow_queries`, `cache_stats`

### Local Test Instance Checklist

Follow this quick checklist when you just need to spin up a playable build for
QA or design reviews:

1. **Verify prerequisites.** Confirm `node -v` reports 20.x or later, `npm -v`
   is 9+, your Postgres 14+ instance is reachable, and you have a Discord bot
   token with the intents called out in [`AGENTS.md`](AGENTS.md).
2. **Install dependencies.** Run `npm install` from the repository root so the
   Prisma client and local tooling are available.
3. **Load environment variables.** Export `DATABASE_URL` and
   `DISCORD_BOT_TOKEN`, or point `IG_ENV_FILE` at the populated secrets file you
   maintain outside the repo (see [`docs/ai-env-setup.md`](docs/ai-env-setup.md)
   for the secure loading order).
4. **Prepare the database and build artifacts.** Execute
   `npx prisma migrate deploy` and `npm run build:ci` (or `npm run build`) to
   apply schema migrations and regenerate the Prisma client before launching the
   bot.
5. **Launch the development instance.** Start the watcher with `npm run dev`;
   the entry point verifies database connectivity before logging in to Discord
   so you can exercise encounter and battle flows locally.

## Datetime & Timezone Handling

All user-facing timestamps display in **Eastern Time (America/New_York)**, automatically handling EST/EDT transitions. The application uses centralized datetime utilities (`src/shared/datetime.js`) for consistent formatting.

**Key Functions:**
- `toEasternString(date)` - Full date/time (e.g., "11/12/2025, 8:21:32 PM")
- `toEasternTime(date)` - Time only (e.g., "8:21:32 PM")
- `toEasternDate(date)` - Date only (e.g., "11/12/2025")
- `nowEastern()` - Current timestamp in Eastern Time

See development-bible/07-utilities.md § 7.1-7.2 for comprehensive DateTime utilities usage guide, migration patterns, and timezone standardization.

**Important:** Internal state files and Event Bus metadata continue to use ISO timestamps (UTC) for consistency and portability. Only user-facing displays (Discord messages, restart notifications, summaries) use Eastern Time formatting.

## Data Pipeline & Workers

Reference data is mirrored into `/data` via scripted jobs:

- `scripts/fetch_pokemon.mjs` pulls fresh PokéAPI payloads.
- `scripts/build-data.js` normalizes and shards JSON for the bot runtime.
- `scripts/worker.mjs` coordinates refresh jobs when running inside Render.
- `/ops cache` reports live cache metrics (hit/miss counters, disk usage, sweep cadence) and can trigger a one-off cleanup.
- `scripts/render_job_client.mjs` and `worker_trigger_job.mjs` dispatch/monitor Render Job executions.

`render.yaml` wires build and run commands for Render services. On boot the worker queues a refresh job and respects `POKE_REFRESH_CRON` / `POKE_REFRESH_TZ` for scheduled updates.

## Deployment Notes

1. Build commands:
   ```bash
   npm ci
   npm run build
   npm run data:build
   ```
2. Required environment variables:
   - `PROD_DATABASE_URL` (PROD local node - PRIMARY for gameplay). The app falls back to `DEV_DATABASE_URL`, `RENDER_DB_INTERNAL_URL`, `RENDER_DB_EXTERNAL_URL`, or `DATABASE_LOCAL_URL` for direct PostgreSQL connections.
   - `DISCORD_BOT_TOKEN` (or legacy `POKEMON_BOT_TOKEN` fallback)
   - Optional Render job variables (`POKE_RENDER_SERVICE_ID`, `POKE_REFRESH_CRON`, etc.)
3. Optional connection tuning: set `PRISMA_CONNECT_MAX_RETRIES`, `PRISMA_CONNECT_RETRY_DELAY_MS`, and `PRISMA_CONNECT_MAX_DELAY_MS` to adjust connection retry behaviour. `PRISMA_SKIP_INITIAL_CONNECT=true` keeps tests fast and local dev resilient when the DB is offline.
4. Additional feature flags in `src/config/env.js` tune rate limits, alerts, and remediation behaviors.
5. If staging is missing baseline tables, follow `ops/DB_BOOTSTRAP.md` and run `scripts/bootstrap_staging_db.ps1` (PowerShell) before forward-only migrations.

## Deploying on Render (Web + Background Worker)

- Provision the bot runner as a **Background Worker** service so Prisma connects over Render’s private network without HTTP timeouts.
- In `render.yaml` (or the Render dashboard), attach your managed Postgres and map `envVars.DATABASE_URL` via `fromDatabase.connectionString` for every web and worker service.
- Re-deploy after updating environment variables; no extra code changes are required because `src/env/ensure-db-url.ts` preloads Prisma with the internal connection string at boot.
- Troubleshooting: look for the single structured log line containing `"db.url.source"` during boot to confirm which environment variable supplied `DATABASE_URL`.

## Render Runtime & Database Blueprint

1. Copy the `render.yaml` worker named `infinity-gauntlet-app-worker` into your Render account. It builds with `pnpm install --frozen-lockfile && pnpm prisma generate && pnpm build` and starts the compiled worker via `node dist/worker/backup.js`.
2. Ensure each service (web + workers) declares `envVars` for the 2-node cluster: `PROD_DATABASE_URL` (primary), `DEV_DATABASE_URL` (DEV master), `RENDER_DB_INTERNAL_URL` (Render internal), `RENDER_DB_EXTERNAL_URL` (Render external). The runtime config loader selects the appropriate connection based on `DATABASE_CONNECTION_MODE` (auto/internal/external).
3. Optional cache tuning: set `CACHE_TTL_MS` or `REDIS_URL` in Render to change the shared cache backend; the default TTL is 60s and currently backed by the in-process memory cache in `src/shared/cache/memory.ts`.
4. `/ops stats` now prints runtime, database, cache, and outbox diagnostics; `/ops cache` adds dedicated cache hit/miss counters, maintenance schedules, and optional cleanup triggers so you can confirm workers stay healthy before promoting changes.
5. When schema drift appears in staging, run `scripts/bootstrap_staging_db.ps1` (after loading `.env`) for an interactive `prisma migrate deploy`; the script points back to `ops/DB_BOOTSTRAP.md` if relations are missing or pooled vs. direct URLs need adjustments.

## Operational Guardrails & Meta Workflow

- `scripts/refresh_vision.sh` regenerates router indexes, stamps recovery metadata, and refreshes Prompt.md's change ledger.
- `scripts/guard_meta.sh` enforces Prompt/Tasklist coupling and checks router hygiene during CI.
- `ops/RECOVERY.yaml` and `ops/NEXT.yaml` coordinate the next actionable task, ensuring deterministic resumes across workers.
- `ops/HOTFIX_PLAN.yaml` defines the hotfix queue and bootstrap template for emergency work outside the PATCH loop.
- `ops/DB_BOOTSTRAP.md` + `scripts/bootstrap_staging_db.ps1` describe the pooled vs. direct connection strategy and bootstrap flow that keeps Prisma migrations responsive.
- `ops/DB_BOOTSTRAP.md` pairs with `scripts/bootstrap_staging_db.ps1` to describe safe staging bootstrap flows ahead of index migrations.

### Router & Meta Index

The contract-driven routing system keeps every meta document discoverable:

- `masterroutetable.md` acts as the router-of-routers index, listing each `ROUTER.md` and the domains it maps.
- `ops/ROUTER.yaml` and `ops/ROUTER_INDEX.yaml` mirror those routes in machine-readable form; run `scripts/update_router_index.sh` after touching router files.
- `ops/TOUCHMAP.yaml` links Tasklist IDs to the paths they are allowed to modify so the patch engine scopes edits correctly.
- `Patch.md`, `Prompt.md`, and `Tasklist.md` stay in lockstep; guard scripts verify PATCHSET echoes, header bumps, and READY queue pointers on every change.
- Hotfix metadata (`ops/HOTFIX_PLAN.yaml`, `ops/RECOVERY.yaml`) records the last emergency edit so humans can resume safely even when contracts are bypassed.

## Legacy Bots (Reference Only)

- `security-bot.js` / `src/bot/main.js` retain the original security role-healing logic.
- Legacy message-based prototype was migrated to TypeScript and the original
   `discord-pokemon-bot/` folder has been removed.
   reactions.

They are not part of the TypeScript production path but remain for historical context
and potential future migrations.

## Roadmap Highlights

- **Phase 7 Persistence:** Delivered battle-result storage, admin reporting filters, and DM battle history; future analytics wait on new design direction.
- **Dual Routing Layers:** Planned next step once new backlog lands—split prod/dev router maps and document the shared index.
- **Operational Hardening:** Render deployment guardrails and Refresh Vision telemetry are in place; additional automation will follow when new operational risks surface.
- **Community Playtests:** Ready to plan structured guild sessions after fresh backlog is prioritized.
