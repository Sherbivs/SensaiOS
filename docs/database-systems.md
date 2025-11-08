# Database Systems Guide

_Last updated: 2025-11-07T20:00:00Z (UTC) — Rev: 2.1_

This guide captures everything engineers need to understand, operate, and extend Infinity Gauntlet's 2-node direct PostgreSQL cluster. Pair it with `DATA-SCHEMA.md` for entity specifics and `ops/DB_BOOTSTRAP.md` for runbook-grade procedures.

## 1. Topology & Environments

| Environment | Provider | Primary URL Source | Purpose |
| --- | --- | --- | --- |
| **DEV (Master)** | Render PostgreSQL | `DEV_DATABASE_URL` (internal), `RENDER_DB_EXTERNAL_URL` (workstation) | Source of truth for migrations and schema changes. Master database for 2-node cluster. |
| **PROD (Replica)** | Game Engine PostgreSQL | `PROD_DATABASE_URL` | Production database on Game Engine's persistent disk. Mirrors DEV with <50ms latency. Runs integrity checks to detect updates. |
| **LOCAL (Optional)** | Your workstation | `DATABASE_LOCAL_URL` | Optional offline mirror on your personal computer for development when network unavailable. |

**Terminology Clarification:**
- **Game Engine**: Render cloud service hosting Discord bots, battle workers, and database code. Has local PostgreSQL on persistent disk (`/opt/render/project/src/Store/db/`).
- **Your Workstation**: Personal computer with VS Code where YOU edit code and run migrations against DEV DB.
- **DEV DB**: Render PostgreSQL master - all data is processed here first, then replicated to PROD.
- **PROD DB**: PostgreSQL instance on Game Engine's local disk - mirrors DEV and serves live gameplay queries.

The shared config loader (`src/shared/config.ts`) normalizes these URLs, records the chosen source (see `databaseUrlSource`/`databaseConnectionMode`), and persists successful selections to `%USERPROFILE%\.infinity-gauntlet\db-connection.json`. The 2-node cluster architecture uses direct PostgreSQL connections exclusively - no proxy or connection pooling layers.

## 2. Connection Modes & Environment Variables

| Variable | Description | Used By | Notes |
| --- | --- | --- | --- |
| `DEV_DATABASE_URL` | DEV database (master) | Game Engine (internal network) | Source of truth for migrations. Equals `RENDER_DB_INTERNAL_URL` for Game Engine. |
| `RENDER_DB_EXTERNAL_URL` | DEV database (master) | Your workstation (internet) | External access to DEV DB from your personal computer for migrations and development. |
| `PROD_DATABASE_URL` | PROD database (replica) | Game Engine (localhost) | PostgreSQL on Game Engine's persistent disk. Connection string: `postgresql://localhost:5432/infinity_gauntlet_db` |
| `DATABASE_LOCAL_URL` | Optional local mirror | Your workstation (localhost) | Optional PostgreSQL on your personal computer for offline development. |
| `BACKUP_STORAGE_*` | Durable sink configuration | Game Engine | Documented under "Operational Tooling". |

**Connection Patterns:**
- **Game Engine** uses `DEV_DATABASE_URL` (internal Render network) + `PROD_DATABASE_URL` (localhost on persistent disk)
- **Your Workstation** uses `RENDER_DB_EXTERNAL_URL` (internet access to DEV) + optional `DATABASE_LOCAL_URL` (local mirror)
- Legacy variable `RENDER_DB_INTERNAL_URL` exists for backwards compatibility but `DEV_DATABASE_URL` is preferred

When none of the managed URLs connect successfully, the loader falls back to `DATABASE_URL`. Production builds reject `localhost` endpoints unless explicitly configured. Bootstrap logs (see `Prompt.md` Last Repo Changes) surface the selected source for auditing.

### Storage Quotas & Capacity Monitoring
- **Render quotas:** Production Postgres caps out at **0.5 GB** of storage; the DEV database carries a **1.0 GB** ceiling. Treat 60% usage as the early-warning trigger and 80% as the escalation threshold.
- **Day-of checks:**
  1. Render Dashboard → Databases → `<env>` → Metrics → *Storage Utilization*. Capture the displayed percentage plus the raw bytes in Tasklist notes before each flag ladder step.
  2. `npm run db:cli -- query "SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size, pg_database_size(current_database()) AS bytes;"` — record the output alongside the Render metric so auditors can reconcile the numbers post-window.
- **Alerting:** Open an operations thread when usage crosses 60% in either environment. Above 80%, halt new migrations/seeds and coordinate either table pruning or a Render plan resize before proceeding.
- **CLI telemetry:** The `database` panel in `src/utils/cliStatus.js` renders any `storageUsed` / `storageFree` metrics reported by supervisors. When you add new telemetry, surface it there so Render logs stay readable in quiet mode.

### Direct PostgreSQL Client Setup (2-Node Cluster)

- Keep Prisma packages current: `npm install prisma @prisma/client@latest`.
- Generate the direct PostgreSQL client: `npx prisma generate` (already wired into `npm run generate`).
- Instantiate Prisma with direct datasources configuration:

  ```ts
  import { PrismaClient } from "@prisma/client";

  const prisma = new PrismaClient({
    datasources: {
      db: { url: process.env.DEV_DATABASE_URL || process.env.PROD_DATABASE_URL }
    }
  });

  const users = await prisma.user.findMany({
    where: { email: { contains: "alice@example.com" } }
  });
  ```

- Set `PRISMA_CLIENT_ENGINE_TYPE=library` for direct PostgreSQL connections (default behavior).

### Triple Database Architecture (DEV + PROD + LOCAL Simultaneous)

As of 2025-11-07, the runtime maintains **three separate Prisma clients connected simultaneously**:

- **`devPrisma`** (DEV/MASTER) — Connected to `DEV_DATABASE_URL` (Game Engine) or `RENDER_DB_EXTERNAL_URL` (your workstation); master database and source of truth for migrations. Used for schema changes and observability. May be `null` if no URL configured.
- **`prisma`** (PROD) — Connected to `PROD_DATABASE_URL`; PostgreSQL on Game Engine's persistent disk providing <50ms latency. PRIMARY client for live gameplay operations (battles, encounters, trainer CRUD). Mirrors DEV database.
- **`localPrisma`** (LOCAL) — Connected to `DATABASE_LOCAL_URL`; optional offline PostgreSQL mirror on your personal workstation for development when network unavailable. May be `null` if not configured.

**Connection Initialization:**

All three clients initialize on startup via `src/shared/prisma.ts`:

```ts
import { prisma, devPrisma, localPrisma, getDatabaseStats } from "../shared/prisma.js";

// LIVE GAMEPLAY (battles, encounters, trainer CRUD) - use PROD for <50ms latency
const gameClient = prisma; // PROD on Game Engine's local disk (primary gameplay database)
const users = await gameClient.user.findMany();

// DEV operations (migrations, schema changes, master database)
if (devPrisma) {
  const devUsers = await devPrisma.user.findMany();
}

// LOCAL operations (optional offline mirror)
if (localPrisma) {
  const localUsers = await localPrisma.user.findMany();
}

// Get stats for all three databases
const stats = getDatabaseStats();
console.log(`DEV: ${stats.dev.status} | PROD: ${stats.prod.status} | LOCAL: ${stats.local.status}`);
```

**Stats & Observability:**

`getDatabaseStats()` returns a `TripleDatabaseStats` object containing telemetry for all three connections:

```ts
{
  dev: {
    source: "external",    // "external", "internal", "direct"
    transport: "direct",   // always "direct" (no proxy layer)
    latency: 125.8,        // milliseconds (null if no heartbeat yet)
    status: "healthy"      // "healthy", "degraded", "reconnecting", "error", "offline", "unknown"
  },
  prod: {
    source: "local",       // PROD_DATABASE_URL (local workstation)
    transport: "direct",   // always "direct" (library engine)
    latency: 12.4,         // <50ms typical for localhost
    status: "healthy"
  },
  local: {
    source: "local",       // from DATABASE_LOCAL_URL or Store/db/local-url.txt
    transport: "direct",   // always direct PostgreSQL
    latency: 8.1,          // <10ms typical for Store-backed mirror
    status: "offline"      // "offline" if DATABASE_LOCAL_URL not configured
  }
}
```

The logger (`src/utils/logger.js`) auto-refreshes these stats every 15 seconds and displays them in console output. Restart DM messages also include the stats block so operators see runtime state immediately.

**When to Use Each Client:**

| Use Case | Client | Reason |
| --- | --- | --- |
| **Live gameplay (battles, encounters, trainer ops)** | **`prisma`** (PROD) | **<50ms latency, Game Engine's local PostgreSQL** |
| Schema changes & migrations | `devPrisma` | DEV master database, source of truth |
| Development debugging & testing | `devPrisma` (from workstation) or `localPrisma` (offline) | Direct access to master or local mirror |
| Migrations (`prisma migrate deploy`) | DEV connection (via `DEV_DATABASE_URL` on Game Engine, or `RENDER_DB_EXTERNAL_URL` from your workstation) | Direct PostgreSQL required for DDL operations |
| Stats/observability | All three (via `getDatabaseStats()`) | Simultaneous visibility |

**Environment Variables:**

- **`DEV_DATABASE_URL`** → DEV client (`devPrisma`) - Used by Game Engine (internal Render network)
- **`RENDER_DB_EXTERNAL_URL`** → DEV client (`devPrisma`) - Used by your workstation (internet access)
- **`PROD_DATABASE_URL`** → PROD client (`prisma`) - **PRIMARY for live gameplay on Game Engine**
- **`DATABASE_LOCAL_URL`** → LOCAL client (`localPrisma`) - Optional mirror on your personal computer

Production services (Game Engine) use `DEV_DATABASE_URL` + `PROD_DATABASE_URL`. Your workstation uses `RENDER_DB_EXTERNAL_URL` + optional `DATABASE_LOCAL_URL`.

If DEV URLs are unset, the DEV client remains `null`. If `DATABASE_LOCAL_URL` is unset, the LOCAL client remains `null`. All three clients support independent heartbeat monitoring tracked via separate state (`lastDevHeartbeatEvent`, `lastProdHeartbeatEvent`, `lastLocalHeartbeatEvent`).

**Exports:**

```ts
// src/shared/prisma.ts
export let prisma: PrismaClient;              // PROD client (Game Engine's local PostgreSQL - PRIMARY for gameplay)
export let devPrisma: PrismaClient | null;    // DEV client (Render PostgreSQL master - source of truth)
export let localPrisma: PrismaClient | null;  // LOCAL client (your workstation's optional offline mirror)
export function getDatabaseStats(): TripleDatabaseStats;
export async function ensurePrisma(): Promise<PrismaClient>; // Returns PROD client after connection
```

See `src/models/index.ts` for additional helpers that re-export all three clients for downstream consumption.

**Optional Local Mirror Setup (Your Workstation):**

To enable offline development with a local PostgreSQL mirror on your personal computer:

1. Add `DATABASE_LOCAL_URL=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db` to `secrets/Infinity-Gauntlet.env` on your workstation
2. Run `npm run ops:auto-bootstrap-local-db` to install PostgreSQL (if needed) and mirror data from DEV
3. Verify with `npm run db:health` showing LOCAL healthy <50ms

See `docs/WORKSTATION-GAMEPLAY-SETUP.md` for comprehensive setup guide including replication schedule, performance comparison, troubleshooting, and maintenance procedures.

## 3. Schema Overview

The canonical Prisma schema lives in `prisma/schema.prisma`. Key aggregates:

- **Core gameplay tables:** `Trainer`, `PokemonInstance`, `Encounter`, `Battle`, `Cooldown`.
- **Dex spine:** `Species`, `Move`, `Ability`, `Type`, junction tables, plus the `SpeciesSheet` materialized view.
- **Operations:** `OutboxMessage`, `WorkerHeartbeat`, `DailyQuest`, recent battle views.
- **Baseline migration:** `202511021024_db_v0_bootstrap` installs tenants, trainer linkage, dex pack registry, per-trainer inventory guards, and audit logging with paired rollback (`rollback.sql`). Evidence from the 2025-11-04 rehearsal lives under `ops/ARCHIVE/db-bootstrap/`.

Refer to `DATA-SCHEMA.md` for detailed entity notes, index strategy (`202510280500_scaling_indexes`), and dex migration metadata. The new dex spine migration (`202510290930_dex_reference_spine`) installs trigram/unaccent extensions and enforces canonical species references.

## 4. Roles, Grants & Helper Functions

Render dev/prod expose a tiered role model (see `ops/DB_BOOTSTRAP.md`):

- `prisma_application` — Default DML rights for runtime services.
- `prisma_worker` — Includes execution privilege on the `public.refresh_species_sheet()` helper.
- `prisma_readonly` — SELECT-only for analytics.

Always refresh the materialized view via:

```sql
SELECT public.refresh_species_sheet();
```

Dex scripts detect `42501` refresh errors and automatically call the helper.

### Grant Script Snippet

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO prisma_application, prisma_worker;
GRANT EXECUTE ON FUNCTION public.refresh_species_sheet() TO prisma_application, prisma_worker;
```

Document any manual grant changes in Tasklist notes and keep credentials out of source control (`secrets/*.env`).

## 5. Migration & Bootstrap Strategy

1. **Standard Flow:** `npx prisma migrate deploy` using direct PostgreSQL URLs:
   - **From Game Engine:** Use `DEV_DATABASE_URL` (internal Render network) to migrate DEV master
   - **From your workstation:** Use `RENDER_DB_EXTERNAL_URL` (internet access) to migrate DEV master
   - **PROD database:** Automatically mirrors DEV via integrity checks - no manual migrations needed
   
   The db_v0 baseline migration applies first and adds the tenant/dex scaffolding required by downstream tasks (`DB.V0.PACK_REGISTRY`, `DB.V0.SEED_SMOKE`).

2. **Fallback:** `npx prisma db push` only when historical migrations are unavailable—followed by a baseline migration (see `ops/DB_BOOTSTRAP.md`).
3. **Post-Migration Checks:**
   - `/ops stats` command
   - DM Home battle history
   - `npm run db:seed:dex` (or `--dry-run` for rehearsal) with results captured in Tasklist/Prompt.

When touching staging/prod, consult the runbook's "Smoke tests" and connection sanity matrix. Always capture command transcripts in Tasklist notes.

## 6. Dex Maintenance & Materialized Views

Dex upkeep now routes through the consolidated seeding + control suite:

| Command | Purpose | Notes |
| --- | --- | --- |
| `npm run db:seed:dex` | Fetches live PokeAPI data and repopulates `Species`, `SpeciesType`, `SpeciesAbility`, `SpeciesLearnset`, `Move`, `Ability`, and `TypeChart`. Automatically refreshes `SpeciesSheet`. | Respects `IG_ENV_FILE`; throttle via `POKEAPI_SEED_CONCURRENCY` (default 4). Pass `--dry-run` to inspect counts without writing. |
| `npm run db:auto-sync` | Runs the DEV → PROD sync cadence on startup, then polls every 5 minutes to reconcile if drift is detected. | Options: `--once`, `--dry-run`, `--interval <ms>`, `--dev-env`, `--prod-env`, `--skip-startup`, `--ci`, `--alert-webhook <url>`, `--no-alerts`, `--simulate-alert`. Emits JSON logs (`sync.consolidate.*`, `integrity.*`, `integrity.alert`) and skips writes when `--dry-run` is present. When alerts are enabled the loop posts a Discord webhook using `ALERT_WEBHOOK_URL` (or the CLI override); `--simulate-alert` fires the webhook without touching databases so operators can test routing. |
| `npm run db:mirror:check` | Executes direct PostgreSQL parity checks for both environments and cross-env comparisons. | Reads the default `Key/Dev` and `Key/Prod` env files; override with `--dev-env`/`--prod-env`. Fails the run if mismatches are detected. |
| `npm run db:cli -- status` | Verifies active connection metadata and prints sample counts (`Species`, `User`) after a seed. | Captured in Tasklist/Prompt echoes for auditing. |
| `npm run db:cli -- counts` | Spot-checks common table volumes (species, encounters, bus messages). | Extend `scripts/db_admin.ts` as new tables come online. |

`scripts/seed_dex.ts` loads environment overrides the same way as the control suite (`IG_ENV_FILE` → `DOTENV_CONFIG_PATH` → repo `.env` when allowed). Results print per-table row counts so we can confirm >1,000 species before shipping. Re-runs are now idempotent: deduplicated learnset rows are skipped automatically, so a second pass after a partial failure is safe.

### Dev Reset & Hydration Quickstart (2025-11-07)

This sequence mirrors the successful Dev database refresh performed from WSL + Windows. Use it whenever you need to reformat the schema and hydrate the Pokédex.

1. **Provision WSL toolchain (first run only).**
  ```bash
  wsl -e bash -lc 'cd /mnt/c/Users/sherb/OneDrive/Documents/GitHub/Infinity-Gauntlet && npm ci'
  ```
  Node 18 emits `EBADENGINE` warnings for packages that prefer Node ≥20, but the install completes and rebuilds Linux-native binaries (esbuild, Prisma engines).
2. **Reset schema from WSL with the direct URL.**
  ```bash
  wsl -e bash -lc 'set -euo pipefail \
    && source <(sed "s/\r$//" /mnt/c/Users/sherb/OneDrive/Documents/secrets/Infinity-Gauntlet.env) \
    && export DEV_DATABASE_URL \
    && export DATABASE_URL="$DEV_DATABASE_URL" \
    && cd /mnt/c/Users/sherb/OneDrive/Documents/GitHub/Infinity-Gauntlet \
    && npx prisma db push --force-reset'
  ```
  `sed` strips Windows carriage returns before sourcing. Keep `DATABASE_URL` pointed at the DEV direct Postgres endpoint any time you run destructive Prisma commands.
3. **Hydrate the dex spine via direct PostgreSQL.**
  ```bash
  wsl -e bash -lc 'set -euo pipefail \
    && source <(sed "s/\r$//" /mnt/c/Users/sherb/OneDrive/Documents/secrets/Infinity-Gauntlet.env) \
    && export DEV_DATABASE_URL \
    && export DATABASE_URL="$DEV_DATABASE_URL" \
    && export IG_ENV_FILE=/mnt/c/Users/sherb/OneDrive/Documents/secrets/Infinity-Gauntlet.env \
    && cd /mnt/c/Users/sherb/OneDrive/Documents/GitHub/Infinity-Gauntlet \
    && npm run db:seed:dex'
  ```
  The seeder auto-refreshes `SpeciesSheet`, falling back to `public.refresh_species_sheet()` when direct ownership is unavailable.
4. **Rebuild Windows-side binaries for tooling parity.**
  ```powershell
  npm ci
  ```
  Run from the repo root so PowerShell sessions keep Windows-native Prisma/tsx binaries aligned with the repo lockfile.
5. **Mirror checks.**
  ```powershell
  # Direct PostgreSQL parity checks only
  npm run db:mirror:check
  ```

Capture counts (`npm run db:cli -- status`) and command transcripts in `Tasklist.md` after the run so the audit trail reflects >1,000 species and a refreshed learnset tally.

Run every dex maintenance action in the DEV → PROD rhythm: execute the command against DEV first, switch `IG_ENV_FILE` to the PROD secrets and repeat, then point back to DEV env and run `npx prisma generate` so local tooling reconnects to the master database.

`scripts/dev_prod_auto_sync.ts` powers the automation loop (`npm run db:auto-sync`). On deployment it runs the consolidation once, then performs integrity checks every five minutes. If counts drift (or either database changes between checks), the service replays the migrate + seed cadence and records the result via `sync.consolidate.*` + `integrity.*` events. When drift remains after a consolidation pass the loop emits `integrity.alert` with the Dev/Prod env paths and the row deltas, dispatches a webhook payload to `ALERT_WEBHOOK_URL`, and deduplicates repeat alerts until counts change. The loop also watches `data/cache/dex-sync-trigger.json` (written by `scripts/fetch_pokemon.mjs`) and logs `dex_trigger` consolidations whenever a new checksum/timestamp lands. Use `npm run guard:auto-sync` (`--ci --dry-run`) to validate env files and trigger availability before promoting changes; the guard fails fast when secrets or trigger metadata are missing.

Materialized view refresh flows through the helper; direct `REFRESH MATERIALIZED VIEW` still requires ownership. The seeding script falls back to the helper when permissions restrict direct refresh.

## 7. Operational Tooling & Telemetry

- **Outbox sink:** `src/worker/outbox.ts` now writes each processed message to the configured backup sink (`BACKUP_STORAGE_PROVIDER = s3|local|none`). Success logs include provider & location; health metrics report `backupProvider`.
- **Telemetry:** `worker.metrics.snapshot` feeds queue depth, cache size, and failure counters. Alert thresholds documented in `OPERATIONS.md`.
- **Guards:** `scripts/guard_meta.sh`, `scripts/check_db_redundancy.ts`, `scripts/db_smoke.ts`, and `scripts/guards/guard_auto_sync.sh` verify metadata, parity, and auto-sync prerequisites.
- **Dexpack Guard:** `npm run guard:dexpack` regenerates `assets/dexpack.v1.json(.gz)` and `assets/dexpack.gen.mjs` in verification mode to ensure the committed pack (including typed-array vectors and perfect-hash tables) matches the builder output; run after updating bootstrap data, loader logic, or module consumers.
- **Auto-sync monitoring:** Review `integrity.alert` logs after each deployment and on the five-minute cadence; investigate non-zero deltas immediately. Run `npm run guard:auto-sync` before releases to confirm secrets + `dex-sync-trigger.json` exist, and capture remediation steps in Tasklist notes when the guard fails.
- **Auto-sync alerts:** Webhook embeds (`ALERT_WEBHOOK_URL`) fire whenever `integrity.alert` appears after consolidation. Each alert summarizes deltas, links the env files, and calls out the investigation checklist; duplicates are suppressed until counts change or new drift is detected. Startup logs (`integrity.alert.config_ready|config_missing|config`) record whether alerts will dispatch, so confirm Render shows `integrity.alert.config_ready` after deploys. Override destinations with `--alert-webhook`, temporarily disable with `--no-alerts`, or run `--simulate-alert` to validate routing without touching databases.
- **Control Suite:** `scripts/db_admin.ts` (run via `npm run db:cli`) consolidates counts, status checks, and raw queries while respecting secure env loading.
- **Local fallback bootstrapper:** `npm run ops:auto-bootstrap-local-db` ensures a complete PostgreSQL toolchain is installed (silent winget install when required), then mirrors the DEV database into `Store/db`, maintains timestamped snapshots, writes `Store/db/local-url.txt`, and logs the active port so Prisma can use the offline cluster as a final fallback when Render is unreachable. Use `npm run ops:bootstrap-local-db` when the toolchain already exists. Record the command, timestamp, and URL in Tasklist notes whenever you refresh the mirror.

### Backup & PITR Readiness
- **Health checks:** Run `npm run db:cli -- status` to confirm the active host and row counts. Inspect `wal_level` and `archive_mode`
  (`npm run db:cli -- query "SHOW wal_level;"` / `npm run db:cli -- query "SHOW archive_mode;"`). Render keeps `archive_mode=off` while supplying managed PITR snapshots; log the result in Tasklist notes.
- **Manual dump:** `npm run ops:dex-v2-backup -- --env-file C:/Users/sherb/OneDrive/Documents/Key/Dev/.env --label <env> --output-dir backups --pg-dump-path tools/pgsql17/pgsql/bin/pg_dump.exe`.
  The 2025-11-05 rehearsal finished in 14.79 s and produced `backups/archive/2025-11-05/dev-dex-2025-11-06T00-49-16.472Z.dump` (SHA256 `BDC5F48B5414AF99DBBCF0F69D074CE4FABEA27BF7078D5E586442FD0A76C7FD`).
- **Restore rehearsal:** `tools/pgsql17/pgsql/bin/pg_restore.exe --format=custom --schema-only --no-owner --file %TEMP%/dev-dex-YYYY-MM-DD-schema.sql <dump>` unpacked the schema in 0.09 s (43 KB) during the latest run; record timings in `ops/ARCHIVE/db-bootstrap/<date>-backup-dr-evidence.md`.
- **Retention:** Keep dumps in the ignored `backups/` directory until verified, then move them into `backups/archive/<YYYY-MM-DD>/` and delete temporary schema extracts from `%TEMP%`.

### Runtime Cache Observability

- `/ops cache` (Discord) reports in-memory and on-disk usage, namespace hit/miss counters, and maintenance history. Add the `cleanup: true` flag to run a maintenance sweep before sampling.
- The cache facade schedules maintenance every 10 minutes; each run emits `cache.maintenance` and `cache.metrics` logs with duration, run reason, and per-namespace stats. Use `runCacheMaintenanceNow("manual")` (or `cleanup: true`) when a manual sweep is needed between cycles.
- Tests `tests/services/cache.facade.spec.ts` and `tests/ops.spec.ts` cover the metrics snapshot and command output; run `pnpm test -- tests/services/cache.facade.spec.ts tests/ops.spec.ts` after touching cache instrumentation.

## 8. Testing & Local Verification

- **Unit Tests:** Run `npm test -- shared/backup-sink` to exercise local sink behaviour.
- **DB Smoke Script:** `npm run db:smoke` loads IG_ENV_FILE secrets and defaults to direct PostgreSQL connections for smoke tests.
- **Vitest Suites:** `tests/ops.spec.ts`, `tests/dm_home.spec.ts`, `tests/daily/*.spec.ts` ensure persistence flows stay intact.

For local experiments, set `BACKUP_STORAGE_PROVIDER=local` to inspect JSON backups under `%TEMP%/infinity-gauntlet/outbox-backups`.

### Auto-Sync Drift Response Runbook

1. **Acknowledge the alert:** The Discord webhook payload (or Render log) includes the `integrity.alert` delta snapshot, env paths, and a timestamp. Confirm the operations channel (or Render alert feed) received the embed; investigate `integrity.alert.config_missing` if no external notification appears. Record the alert in Tasklist notes if a follow-up is already in progress.
2. **Verify counts:** Run `npm run db:cli -- counts` against DEV and PROD (via `IG_ENV_FILE`) to confirm the delta and capture the output.
3. **Inspect recent changes:** Review the latest migrations/seeds (`npm run db:auto-sync -- --once`) and Render deploy logs for failed steps or partial seeds.
4. **Re-run consolidation:** After remediation, execute `npm run db:auto-sync -- --once` to replay the loop; confirm the webhook no longer fires and counts realign.
5. **Document outcome:** Update Tasklist/Prompt notes with the alert timestamp, remediation steps, and verification commands executed.

### PROD-as-Master Enforcement Architecture (⚠️ CRITICAL)

**As of 2025-11-06**, the auto-sync system implements **one-way replication enforcement** where PROD is the **single source of truth** for all database changes. DEV and LOCAL must match PROD exactly.

#### Architecture Overview

```
PROD (Master) → DEV (Replica) → LOCAL (Replica)
     ↓              ↓                ↓
  Migrations    Force Sync      Force Sync
  Seeds         Integrity       Integrity
               Checks (1hr)    Checks (1hr)
```

**Key Principles:**

1. **PROD is master** — Production database is the authoritative source; all replicas must match
2. **DEV/LOCAL are replicas** — Must match PROD exactly; unauthorized changes trigger critical alerts
3. **Hourly integrity checks** — Reverse verification detects drift in DEV/LOCAL
4. **Auto-enforcement** — When drift detected, DEV/LOCAL are force-synced on next cycle
5. **Bidirectional sync removed** — Old Dev ↔ Prod bidirectional flow replaced with one-way enforcement

#### Enforcement Workflow

**Startup/Consolidation:**
1. Run migrations + seeds on **PROD first** (production is the source of truth)
2. If `enforceProdMaster=true` (default), force DEV to match PROD via `enforceProdMaster("dev")`
3. If `includeLocal=true`, force LOCAL to match PROD via `enforceProdMaster("local")`
4. Capture counts from all three databases
5. Compare DEV/LOCAL against PROD; alert if drift persists

**Hourly Reverse Integrity Check:**
1. Every hour (configurable via `--reverse-check-interval`), compare DEV counts against PROD
2. If DEV diverged, send **critical alert** with enforcement warning
3. If LOCAL diverged, send **critical alert** with enforcement warning
4. On next consolidation cycle, force-sync DEV/LOCAL to match PROD

**Alert Escalation:**
- **Drift alerts** (orange) — Normal sync detected differences after consolidation
- **Reverse integrity violations** (red) — CRITICAL: Unauthorized changes detected in DEV/LOCAL

#### Configuration Flags

| Flag | Default | Description |
| --- | --- | --- |
| `--no-enforce` | `false` | Disable PROD-as-master enforcement. When set, system reverts to drift detection only. |
| `--include-local` | `false` | Include LOCAL database in enforcement and reverse integrity checks. |
| `--local-env <path>` | — | Path to env file containing `DATABASE_LOCAL_URL` for LOCAL database connection. |
| `--reverse-check-interval <ms>` | `3600000` (1hr) | How often to run reverse integrity checks (milliseconds). |

**Examples:**

```bash
# Standard enforcement (PROD → DEV only)
npm run db:auto-sync

# Include LOCAL database enforcement
npm run db:auto-sync -- --include-local --local-env "C:/Users/sherb/OneDrive/Documents/Key/Dev/.env"

# Disable enforcement (detection only, legacy behavior)
npm run db:auto-sync -- --no-enforce

# Custom reverse check interval (every 30 minutes)
npm run db:auto-sync -- --reverse-check-interval 1800000
```

#### ⚠️ Safety Warnings

**DESTRUCTIVE OPERATIONS:**
- When `enforceProdMaster=true` (default), DEV/LOCAL databases are **forcefully synced** to match PROD
- This means running `prisma migrate deploy` and `npm run db:seed:dex` on DEV/LOCAL
- **Any local-only data in DEV/LOCAL will be overwritten** if schema/reference data diverges
- Player data in PROD is protected (only replicas are enforced)
- **Before enabling enforcement**, verify PROD contains the authoritative production data

**CRITICAL: Migration Safety:**
- **Always run migrations on PROD first** (production is the master)
- Verify PROD migrations succeed before they propagate to DEV/LOCAL
- If PROD migration fails, DEV/LOCAL enforcement will not trigger
- Use `--no-enforce` during migration testing to prevent auto-sync from forcing incomplete schemas

**Recovery from Enforcement Failures:**
1. If DEV/LOCAL enforcement fails, check logs for `enforce.prod_master.complete` errors
2. Manually verify DEV/LOCAL can connect and accept DDL operations
3. **PROD data is protected** — enforcement only affects replicas (DEV/LOCAL)
4. Document incident in Tasklist with timestamp, affected environment, and recovery steps
5. Consider disabling enforcement (`--no-enforce`) until root cause resolved

**When NOT to Use Enforcement:**
- During active migration development on DEV (use `--no-enforce`)
- When testing schema changes that might fail (use `--dry-run`)
- When DEV/LOCAL contain local-only test data you need to preserve
- During incident response when you need to inspect divergent state before fixing

#### Monitoring & Observability

**Log Events:**
- `enforce.dev_master.start` — Enforcement triggered for target environment
- `enforce.dev_master.complete` — Enforcement completed successfully
- `reverse.integrity.check.start` — Hourly reverse check initiated
- `reverse.integrity.violation` — **CRITICAL**: Unauthorized changes detected
- `reverse.integrity.check.pass` — Target environment matches DEV
- `reverse.integrity.violation.enforcement` — Force sync scheduled on next cycle

**Discord Webhook Alerts:**
- **Drift alerts** (orange embed) — Include `enforcementMode: enabled/disabled` in footer
- **Reverse integrity violations** (red embed) — Critical header, enforcement warning, remediation steps
- All alerts include: delta counts, DEV/PROD counts, affected environment, enforcement status

**Alert Payload Structure:**
```ts
{
  reason: "reverse_integrity_violation",
  delta: { species: 5, moves: 0, abilities: 0, learnsets: 12 },
  devCounts: { species: 1025, moves: 919, ... },
  prodCounts: { species: 1020, moves: 919, ... },
  enforcementMode: "enabled",
  violationType: "reverse_integrity",
  affectedEnvironment: "prod"
}
```

#### Recovery Procedures

**If unauthorized PROD/LOCAL changes detected:**
1. Acknowledge critical alert in operations channel
2. Verify DEV database is healthy and current (`npm run db:cli -- status`)
3. Identify source of unauthorized changes (failed deploy? manual intervention? migration drift?)
4. If changes were intentional, apply them to DEV first, then re-sync
5. If changes were accidental, allow auto-enforcement to restore PROD/LOCAL on next cycle
6. Document investigation in Tasklist with root cause and prevention steps

**If enforcement fails repeatedly:**
1. Check `enforce.dev_master.complete` errors in logs
2. Verify PROD/LOCAL connection URLs are valid and accessible
3. Verify Prisma migration state (`npx prisma migrate status` on each environment)
4. Consider temporary `--no-enforce` while debugging
5. Escalate to database admin if schema corruption suspected
6. Update recovery runbook (`ops/RECOVERY.yaml`) with new failure mode

**If enforcement corrupts data:**
1. **IMMEDIATELY** disable auto-sync service on Render
2. Restore PROD/LOCAL from most recent Render snapshot
3. Verify data integrity with `/ops stats` and manual spot checks
4. Investigate schema migration incompatibility (DEV vs PROD schema version)
5. Document incident with full timeline, affected records, and schema diff
6. Re-enable enforcement only after root cause fixed and verified on staging

#### Implementation Details

**Core Functions:**
- `enforceDevMaster(targetEnv, targetEnvPath, targetVars, devVars, dryRun)` — Force target to match DEV
- `reverseIntegrityCheck(targetEnv, targetVars, devVars, devCounts, dispatchAlert)` — Hourly validation
- `runConsolidation(config, reason, devVars, prodVars, localVars, dispatchAlert)` — Main sync orchestrator

**Type Definitions:**
```ts
type EnvironmentName = "dev" | "prod" | "local";
type SyncConfig = {
  enforceDevMaster: boolean;        // Enable one-way enforcement
  includeLocal: boolean;            // Include LOCAL in enforcement
  localEnvPath: string | null;      // Path to LOCAL env file
  reverseCheckIntervalMs: number;   // Hourly reverse check interval
  // ... other config fields
};
```

**Source:** `scripts/dev_prod_auto_sync.ts` (lines 1-1241)

**See also:**
- `docs/database-systems.md` § 7 Auto-Sync Drift Response Runbook — Standard drift handling
- `ops/DB_BOOTSTRAP.md` — Migration safety procedures
- `OPERATIONS.md` — Service monitoring thresholds

## 9. Incident Response & Recovery

- **Refresh Vision:** `npm run refresh:vision` regenerates router metadata and records recovery hints in `ops/RECOVERY.yaml`.
- **Playbooks:** Use `playbooks/escalate.md` for PagerDuty/Slack escalation if migrations or helpers fail in production.
- **Snapshots:** Before high-risk migrations, capture Render snapshots or Postgres dumps; note them in Tasklist outcome entries.

## 10. Quick Reference Checklist

- [ ] Confirm pool/direct URLs before `migrate deploy`.
- [ ] Ensure helper function exists and roles can `EXECUTE` it.
- [ ] Run dex maintenance scripts post-migration and archive logs.
- [ ] Verify outbox backups (`worker.outbox.sink` logs) after deploying storage changes.
- [ ] Update Tasklist.md and Prompt.md with every DB operation outcome.

---

**See also:**
- `DATA-SCHEMA.md` — Detailed entity and index annotations.
- `ops/DB_BOOTSTRAP.md` — Step-by-step bootstrap & troubleshooting runbook.
- `OPERATIONS.md` — Service matrix, observability thresholds, and env knobs.
- `docs/perfect-system-roadmap.md` — Roadmap pillars guiding future DB reliability work.
