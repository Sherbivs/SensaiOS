# Infinity Gauntlet Pokémon Suite

Infinity Gauntlet is a Discord-first Pokémon adventure for Dripcord. Players use
**private guild channels (homestead-{username})**, explore the Wilds together, battle in public arenas, and progress through a
live-service economy powered by workers and data pipelines.

**HOMESTEAD MIGRATION COMPLETE (2025-06-15):** All gameplay migrated from Discord DMs to private guild channels. Each user gets a dedicated "homestead" channel within the guild. `src/bot/dm/` directory DELETED. See `docs/architecture-bible/18-private-channel-architecture.md` for complete specification.

**Cross-References**:
- See `AGENTS.md` for comprehensive operations guide, database setup, worker architecture
- See `OPERATIONS.md` for service matrix, deployment procedures, monitoring
- See `docs/architecture-bible/` for authoritative system design (22 sections)
- See `docs/operations-bible/` for deployment and operations (13 sections + 9 guides)
- See `docs/development-bible/` for development workflows (9 sections)
- See `ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md` for deployment readiness validation

## Current Status & Goals

**Phase 9+ Complete** (2025-12-18): Repository is production-ready, centralized, standardized, and scalable. All quality metrics optimized:
- ✅ **Zero linter warnings** across TypeScript codebase
- ✅ **Zero npm vulnerabilities**, all dependencies current
- ✅ **Prisma 7.1.0** with direct PostgreSQL connections (`engineType = "library"`)
- ✅ **Homestead Architecture**: Private guild channels replace DMs (migration complete)
- ✅ **Unified Render PostgreSQL**: Single managed database for all services
- ✅ **Worker architecture**: Comprehensive scaling roadmap (see `docs/architecture-bible/03-worker-architecture.md`)
- ✅ **Bible System**: 22 architecture + 22 operations + 9 development sections

**See `ops/REPO-OPTIMIZATION-REPORT.md` for comprehensive Phase 9 achievements.**

**Short-term focus**:
- Database replication architecture (Phase 16: Unified→Multi-DB expansion when infrastructure allows)
- Worker scaling & cost optimization (Phase 10+: battle pool, encounter generator)
- Operational hardening (monitoring, alerting via `/ops stats` + `/ops cache`)

**Near horizon**: Structured guild playtests, advanced battle mechanics (weather/terrain/abilities), trainer progression systems.

## Architecture Snapshot

- **Discord Bot Layer:** `src/bot/**` manages slash commands, **homestead channels** (private guild channels), arena threads, ops tooling, and router-driven routing metadata.
- **Core Engine:** `src/core/**` executes deterministic battle and encounter logic, keeping shared math and status systems separate from the Discord layer.
- **Data & Persistence:** Prisma 7 schema (`prisma/schema.prisma`) persists trainers, parties, encounters, and battles; unified Render-managed PostgreSQL (infinity-gauntlet-db) provides reliable cloud database with automatic migrations; worker scripts refresh cached reference data under `/data`.
- **Automation & Guardrails:** `Patch.md`, `Tasklist.md`, and `Prompt.md` define the contract; scripts in `/ops` and `/scripts` enforce Refresh Vision, router indexes, and contract version gates.

## PBSL (Pokémon Buddy System Logics)

The project ships a PBSL scaffold under `src/core/pbsl/**` that implements seeded RNG helpers, audit trails, battle phase ordering, and deterministic encounter generators. The official manifesto, provenance policy, and compliance checklist live in [`docs/architecture-bible/08-pbsl.md`](docs/architecture-bible/08-pbsl.md). PBSL modules are re-exported via `src/core/pbsl/index.ts` and covered by focused tests in `tests/pbsl/**`, with a dedicated GitHub Action (`.github/workflows/pbsl-oracle.yml`) running lint and `npm run test:pbsl` on every change.

## Key Capabilities

- **Homestead Channels:** `/home`, heal, starter selection, party/box management, player profile—all in private guild channels (`homestead-{username}`) via `src/bot/homestead/**`. Better moderation, audit trail, no DM delivery failures.
- **Wild Encounters:** `/walk` spawns public `#wilds` threads while homestead controls handle throws, swaps, and escapes via `src/bot/wilds/**` plus `src/core/encounter/**` mechanics.
- **Arena Battles:** `/battle challenge` coordinates arena threads, homestead menus, and announcer summaries; Discord orchestration lives in `src/bot/battle/**`, while resolution flows through `src/core/battle/**`.
- **Admin Operations:** `/ops` exposes cooldown reset tools, `/ops stats` filtering (limit/after/participant), and `/ops cache` for hit/miss metrics plus optional cleanup so staff validate health without direct DB access.
- **Persistence & Data:** Prisma 7 schema (`prisma/schema.prisma`) keeps trainer state; cached PokéAPI reference data is refreshed through `scripts/fetch_pokemon.mjs` and `scripts/build-data.ts`.
- **Automation:** Render workers and guard scripts enforce Refresh Vision, router hygiene, contract version gates, and Tasklist coupling to keep the repo deterministic.

## Documentation Bible System

```
docs/
├── architecture-bible/    # 22 sections (system design, database, workers, game engine, etc.)
│   └── INDEX.md          # Navigation hub
├── operations-bible/      # 13 sections + 9 comprehensive guides (deployment, monitoring, database)
│   └── INDEX.md          # Navigation hub
└── development-bible/     # 9 sections (local setup, testing, debugging, profiling, database onboarding)
    └── INDEX.md          # Navigation hub
```

**Quick Reference:**
- **[Architecture Bible](docs/architecture-bible/INDEX.md)** — 22 sections: system design, database architecture, workers, game engine
- **[Operations Bible](docs/operations-bible/INDEX.md)** — 13 sections + 9 guides: deployment, monitoring, database operations
- **[Development Bible](docs/development-bible/INDEX.md)** — 9 sections: local setup, testing, debugging, profiling, database onboarding

## Repository Layout

```
├─ src/                    # TypeScript source (bot, core engines, data pipeline)
│  ├─ bot/                 # Discord interactions (homestead, wilds, arena, ops, alerts)
│  │  └─ homestead/        # Private guild channel gameplay (ACTIVE)
│  ├─ core/                # Deterministic battle + encounter logic
│  ├─ data_pipeline/       # Fetch + normalize PokéAPI payloads
│  ├─ shared/              # Config, logging, Prisma helpers, shared utils
│  └─ index.ts             # Boot entry (Discord + Prisma wiring)
├─ scripts/                # Automation (refresh vision, data jobs, guards, workers)
├─ tests/                  # Vitest suites for core engines, pipeline, ops, UI
├─ prisma/schema.prisma    # Database schema for persistent state (Prisma 7)
├─ ops/                    # Meta governance: Tasklist, routers, NEXT, hotfix plan
├─ data/                   # Cached reference data shards checked in by workers
└─ README.md               # This guide
```

## Requirements

- Node.js 22+
- npm 9+ (or pnpm/yarn if you wire equivalent scripts)
- Postgres 14+ reachable via direct PostgreSQL connection
- Render-managed deployments should set `PROD_DATABASE_URL` (Render-managed PostgreSQL) as PRIMARY
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
   Use `secrets/Infinity-Gauntlet.env` as the **single consolidated environment file** for all local development and testing. This file contains all required keys: BOT_TOKEN, PROD_DATABASE_URL (Render-managed), DATABASE_ONPREMISE_DEV_PRIMARY (local workstation), and POKEMON_BOT_TOKEN. **No other key files are needed.**
   
   Run `pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist` to register the value for future shells (see `docs/ai-env-setup.md` and `docs/db-control-suite.md`). 
   
   The runtime checks `IG_ENV_FILE` (and `DOTENV_CONFIG_PATH`) before falling back to `.env` in the repository root; keep the repo copy empty so local secrets always come from the external file.
   On production (`NODE_ENV=production`), the fallback is disabled unless `IG_ALLOW_REPO_ENV=1` is set.
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

## Data Pipeline & Workers

Reference data is mirrored into `/data` via scripted jobs:

- `scripts/fetch_pokemon.mjs` pulls fresh PokéAPI payloads.
- `scripts/build-data.ts` normalizes and shards JSON for the bot runtime.
- `scripts/worker.mjs` coordinates refresh jobs when running inside Render.
- `/ops cache` reports live cache metrics (hit/miss counters, disk usage, sweep cadence) and can trigger a one-off cleanup.

`render.yaml` wires build and run commands for Render services. On boot the worker queues a refresh job and respects `POKE_REFRESH_CRON` / `POKE_REFRESH_TZ` for scheduled updates.

## Deployment Notes

1. Build commands:
   ```bash
   npm ci
   npm run build
   npm run data:build
   ```
2. Required environment variables:
   - `PROD_DATABASE_URL` — Render-managed PostgreSQL (PRIMARY for all operations)
   - `DISCORD_BOT_TOKEN` (or legacy `POKEMON_BOT_TOKEN` fallback)
3. Optional: `DATABASE_ONPREMISE_DEV_PRIMARY` for local workstation development
4. Additional feature flags in `src/config/env.js` tune rate limits, alerts, and remediation behaviors.

## Deploying on Render (Web + Background Worker)

- Provision the bot runner as a **Background Worker** service so Prisma connects over Render's private network without HTTP timeouts.
- In `render.yaml` (or the Render dashboard), attach your managed Postgres and map `envVars.PROD_DATABASE_URL` for every web and worker service.
- Re-deploy after updating environment variables; no extra code changes are required because `src/env/ensure-db-url.ts` preloads Prisma with the connection string at boot.

## Operational Guardrails & Meta Workflow

### 🚨 NO-RESTART POLICY (ABSOLUTE)
**NEVER restart, stop, redeploy, or take any service offline without EXPLICIT operator permission.**
- Always ask first and wait for manual verification
- The operator needs time to manually check service state before anything goes offline
- This applies to: Render services, Docker containers, database connections, workers, cron jobs

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

### Router & Contract Guardrails

- `scripts/refresh_vision.sh` regenerates router indexes, stamps recovery metadata, and refreshes Prompt.md's change ledger.
- `scripts/guard_meta.sh` enforces Prompt/Tasklist coupling and checks router hygiene during CI.
- `ops/RECOVERY.yaml` and `ops/NEXT.yaml` coordinate the next actionable task, ensuring deterministic resumes across workers.
- `ops/HOTFIX_PLAN.yaml` defines the hotfix queue and bootstrap template for emergency work outside the PATCH loop.

### Router & Meta Index

The contract-driven routing system keeps every meta document discoverable:

- `masterroutetable.md` acts as the router-of-routers index, listing each `ROUTER.md` and the domains it maps.
- `ops/ROUTER.yaml` and `ops/ROUTER_INDEX.yaml` mirror those routes in machine-readable form.
- `ops/TOUCHMAP.yaml` links Tasklist IDs to the paths they are allowed to modify so the patch engine scopes edits correctly.
- `Patch.md`, `Prompt.md`, and `Tasklist.md` stay in lockstep; guard scripts verify PATCHSET echoes, header bumps, and READY queue pointers on every change.

## Legacy Bots (Reference Only)

- `security-bot.ts` / `src/bot/main.js` retain the original security role-healing logic.
- Legacy message-based prototype was migrated to TypeScript.

They are not part of the TypeScript production path but remain for historical context.

## Roadmap Highlights

- **Homestead Architecture:** ✅ COMPLETE (2025-06-15) — All gameplay in private guild channels
- **Prisma 7:** ✅ COMPLETE (2025-12-18) — Direct PostgreSQL with `engineType = "library"`
- **Bible System:** ✅ COMPLETE — 22 architecture + 22 operations + 9 development sections
- **Community Playtests:** Ready to plan structured guild sessions after fresh backlog is prioritized

---

**Last Updated:** 2025-12-18 | **Prisma:** 7.1.0 | **Node:** 22+
