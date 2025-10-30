# Infinity Gauntlet Pokémon Suite

Infinity Gauntlet is a Discord-first Pokémon adventure for Dripcord. Players live in
DMs, explore the Wilds together, battle in public arenas, and progress through a
live-service economy powered by workers and data pipelines.

## Current Status & Goals

- **Current build:** The TypeScript bot stack (DM Home, Wilds, Arena, admin ops) runs on Prisma-backed Postgres with Render-ready workers and guarded automation.
- **Recent wins:** Admin `/ops stats` now filters by limit/after/participant; hotfix policies require plain-text echoes; pooled vs. direct database URLs are wired for migration safety with runbook + helper script.
- **Short-term focus:** Keep staging production-ready by maintaining pooled (`DATABASE_POOL_URL`) and direct (`DATABASE_DIRECT_URL`) connection strings, then advance the remaining Phase 10 scaling tasks.
- **Near horizon:** Split production vs. development routing tables, tighten deployment automation, and prepare structured guild playtests.

## Architecture Snapshot

- **Discord Bot Layer:** `src/bot/**` manages slash commands, DM experiences, arena threads, ops tooling, and router-driven routing metadata.
- **Core Engine:** `src/core/**` executes deterministic battle and encounter logic, keeping shared math and status systems separate from the Discord layer.
- **Data & Persistence:** Prisma schema (`prisma/schema.prisma`) persists trainers, parties, encounters, and battles; worker scripts refresh cached reference data under `/data`.
- **Automation & Guardrails:** `Patch.md`, `Tasklist.md`, and `Prompt.md` define the contract; scripts in `/ops` and `/scripts` enforce Refresh Vision, router indexes, and contract version gates.

## PBSL (Pokémon Buddy System Logics)

The project now ships a PBSL scaffold under `src/core/pbsl/**` that implements seeded RNG helpers, audit trails, battle phase ordering, and deterministic encounter generators. The official manifesto, provenance policy, and compliance checklist live in [`docs/PBSL.md`](docs/PBSL.md). PBSL modules are re-exported via `src/core/pbsl/index.ts` and covered by focused tests in `tests/pbsl/**`, with a dedicated GitHub Action (`.github/workflows/pbsl-oracle.yml`) running lint and `npm run test:pbsl` on every change.

## Key Capabilities

- **DM-as-Home:** `/home`, heal, starter selection, party/box management, player profile, and drip alerts all originate in `src/bot/dm/**` with shared UI helpers.
- **Wild Encounters:** `/walk` spawns public `#wilds` threads while DM controls handle throws, swaps, and escapes via `src/bot/wilds/**` plus `src/core/encounter/**` mechanics.
- **Arena Battles:** `/battle challenge` coordinates arena threads, DM menus, and announcer summaries; Discord orchestration lives in `src/bot/battle/**`, while resolution flows through `src/core/battle/**`.
- **Admin Operations:** `/ops` exposes cooldown reset tools and stats auditing (with limit/after/participant filters) so staff validate battle throughput without direct DB access.
- **Persistence & Data:** Prisma schema (`prisma/schema.prisma`) keeps trainer state; cached PokéAPI reference data is refreshed through `scripts/fetch_pokemon.mjs` and `scripts/build-data.js`.
- **Automation:** Render workers and guard scripts enforce Refresh Vision, router hygiene, contract version gates, and Tasklist coupling to keep the repo deterministic.

## Repository Layout

```
├─ src/                    # TypeScript source (bot, core engines, data pipeline)
│  ├─ bot/                 # Discord interactions (DM, wilds, arena, ops, alerts)
│  ├─ core/                # Deterministic battle + encounter logic
│  ├─ data_pipeline/       # Fetch + normalize PokéAPI payloads
│  ├─ shared/              # Config, logging, Prisma helpers, shared utils
│  └─ index.ts             # Boot entry (Discord + Prisma wiring)
├─ scripts/                # Automation (refresh vision, data jobs, guards, workers)
├─ tests/                  # Vitest suites for core engines, pipeline, ops, UI
├─ prisma/schema.prisma    # Database schema for persistent state
├─ ops/                    # Meta governance: Tasklist, routers, NEXT, hotfix plan
├─ data/                   # Cached reference data shards checked in by workers
└─ README.md               # This guide
```

Legacy JavaScript code paths (`src/bot/main.js`, `security-bot.js`) remain for
backward compatibility but are considered historical. The former
`discord-pokemon-bot/` prototype has been retired; new work should target the
TypeScript app in `src/`.

## Requirements

- Node.js 20+
- npm 9+ (or pnpm/yarn if you wire equivalent scripts)
- Postgres 14+ reachable via `DATABASE_URL`
- Render-managed deployments should set `DATABASE_POOL_URL` (connection string through the pooler) and `DATABASE_DIRECT_URL` (direct connection string) plus any `DATABASE_INTERNAL_URL` overrides for worker access.
- Discord bot token with **applications.commands** and **guilds** intents

Optional services:

- Render Jobs API token (for automated data refresh)
- GitHub token with `contents:write` if you mirror data snapshots to another repo

## Getting Started (Development)

1. Install dependencies:
   ```powershell
   npm install
   ```
2. Configure environment variables (or copy an `.env` template):
   ```powershell
   $env:DATABASE_URL="postgresql://user:pass@localhost:5432/gauntlet"
   $env:DISCORD_BOT_TOKEN="your_discord_token"
   ```
   To keep secrets outside the repo, point the loader at an external file:
   ```powershell
   $env:IG_ENV_FILE="C:/Users/<you>/OneDrive/Documents/Key/.env"
   ```
   Start from `.env.example` (and `secrets/*.env.example`) when creating a new secret file.
   Run `pwsh -File scripts/setup_ai_env.ps1 -Persist` to register the value for future shells (see `docs/ai-env-setup.md` and `docs/db-control-suite.md`).
   The runtime checks `IG_ENV_FILE` (and `DOTENV_CONFIG_PATH`) before falling back to `.env` in the repository root.
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

## Data Pipeline & Workers

Reference data is mirrored into `/data` via scripted jobs:

- `scripts/fetch_pokemon.mjs` pulls fresh PokéAPI payloads.
- `scripts/build-data.js` normalizes and shards JSON for the bot runtime.
- `scripts/worker.mjs` coordinates refresh jobs when running inside Render.
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
   - `DATABASE_POOL_URL` (Render connectionString) and `DATABASE_DIRECT_URL` (Render directConnectionString). The app falls back to `DATABASE_URL`, `DATABASE_INTERNAL_URL`, or `DATABASE_URL_INTERNAL` when the pool URL is missing.
   - `DATABASE_URL` (legacy compatibility; automatically populated from `DATABASE_POOL_URL` when present.)
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
2. Ensure each service (web + workers) declares `envVars.DATABASE_URL` using `fromDatabase.connectionString`; the runtime config loader promotes `DATABASE_INTERNAL_URL` to `DATABASE_URL` automatically for internal connections.
3. Optional cache tuning: set `CACHE_TTL_MS` or `REDIS_URL` in Render to change the shared cache backend; the default TTL is 60s and currently backed by the in-process memory cache in `src/shared/cache/memory.ts`.
4. `/ops stats` now prints runtime, database, cache, and outbox diagnostics so you can confirm the worker is draining messages and that Prisma is connected to Render’s Postgres before promoting changes.
5. When schema drift appears in staging, run `scripts/bootstrap_staging_db.ps1` (after loading `.env`) for an interactive `prisma migrate deploy`; the script points back to `ops/DB_BOOTSTRAP.md` if relations are missing or pooled vs. direct URLs need adjustments.

## Operational Guardrails & Meta Workflow

- `scripts/refresh_vision.sh` regenerates router indexes, stamps recovery metadata, and refreshes Prompt.md’s change ledger.
- `scripts/guard_meta.sh` enforces Prompt/Tasklist coupling and checks router hygiene during CI.
- `scripts/archive_task_history.mjs` trims Tasklist history to the latest 100 DONE entries by archiving to `ops/ARCHIVE/`.
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

- **Phase 7 Persistence:** Continue shipping battle-result analytics and participant audits with expanded Vitest coverage.
- **Dual Routing Layers:** Introduce separate prod vs. dev router networks with a shared `DNS.md` index for two-way navigation.
- **Operational Hardening:** Automate Render deployment guardrails and broaden Refresh Vision telemetry.
- **Community Playtests:** Stage structured Discord guild sessions once arena persistence and reporting meet admin requirements.
