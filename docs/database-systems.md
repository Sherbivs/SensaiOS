# Database Systems Guide

_Last updated: 2025-11-02T08:05:00Z (UTC) — Rev: 1.9_

This guide captures everything engineers need to understand, operate, and extend Infinity Gauntlet’s PostgreSQL footprint across Render, Prisma Accelerate, and local development. Pair it with `DATA-SCHEMA.md` for entity specifics and `ops/DB_BOOTSTRAP.md` for runbook-grade procedures.

## 1. Topology & Environments

| Environment | Provider | Primary URL Source | Purpose |
| --- | --- | --- | --- |
| **Render Dev/Prod** | Render managed Postgres | `DATABASE_POOL_URL` (runtime), `DATABASE_DIRECT_URL` (migrations) | Player-facing runtime, workers, and operational tooling. |
| **Prisma Accelerate** | Prisma Data Platform | `DATABASE_ACCELERATE_URL` | High-availability read/write tier used for dex rollouts and helper testing. |
| **Local** | Developer machine or Docker | `.env` (fallback), optional `DATABASE_EXTERNAL_URL` | Experimentation, feature development, smoke tests. |

The shared config loader (`src/shared/config.ts`) normalizes these URLs, records the chosen source (see `databaseUrlSource`/`databaseConnectionMode`), and persists successful selections to `%USERPROFILE%\.infinity-gauntlet\db-connection.json`. When no Accelerate (`prisma+`) endpoint is available, it now falls back to the best direct PostgreSQL URL (`DATABASE_DIRECT_URL`, `DATABASE_POOL_URL`, `DATABASE_URL`, etc.) instead of erroring, so local development and migration hosts can run without proxy credentials.

## 2. Connection Modes & Environment Variables

| Variable | Description | Notes |
| --- | --- | --- |
| `DATABASE_CONNECTION_MODE` | `auto` (default), `external`, `internal` | `auto` prefers pooled/internal in prod, external in dev. |
| `DATABASE_POOL_URL` | Render pooled connection string | Used by runtime services and PgBouncer-friendly clients. |
| `DATABASE_DIRECT_URL` | Render direct connection string | Use for Prisma migrations and heavy maintenance. |
| `DATABASE_ACCELERATE_URL` | Prisma Accelerate endpoint | Enables query caching and data proxy usage. |
| `DATABASE_EXTERNAL_URL` | Optional external connection | Preferred in local `external` mode for faster failover. |
| `BACKUP_STORAGE_*` | Durable sink configuration | Documented under “Operational Tooling”. |

When none of the managed URLs connect successfully, the loader falls back to `DATABASE_URL`. Production builds reject `localhost` endpoints; overrides must use managed hosts. Bootstrap logs (see `Prompt.md` Last Repo Changes) surface the selected source for auditing.

### Accelerate Client Setup (Serverless)

- Keep Prisma packages current: `npm install prisma @prisma/client@latest @prisma/extension-accelerate`.
- Generate the data proxy-ready client: `npx prisma generate --no-engine` (already wired into `npm run generate`).
- Instantiate Prisma with Accelerate in serverless contexts using the client extension:

  ```ts
  import { PrismaClient } from "@prisma/client";
  import { withAccelerate } from "@prisma/extension-accelerate";

  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })
    .$extends(withAccelerate());

  const users = await prisma.user.findMany({
    where: { email: { contains: "alice@prisma.io" } },
    cacheStrategy: { ttl: 60 },
  });
  ```

- Export `PRISMA_ACCELERATE_RUNTIME=serverless` in Render/CI so Accelerate URLs opt into the serverless runtime (covered in `render.yaml`).
- Provide `OPTIMIZE_API_KEY` (Render secrets + local `.env` overrides) when you want Prisma Optimize telemetry; Render services expose the key via `sync: false` env vars so the dashboard secret can be attached per service.
- Optional: override the Optimize endpoint with `OPTIMIZE_API_URL`, but keep it `https://`—non-HTTPS overrides are ignored to avoid leaking telemetry over insecure transport.
- Accelerate queries support `cacheStrategy` for response caching; tune TTLs per workload and monitor usage in the Prisma “Insights” dashboard. Set `PRISMA_CLIENT_ENGINE_TYPE=dataproxy` when running scripts directly.

## 3. Schema Overview

The canonical Prisma schema lives in `prisma/schema.prisma`. Key aggregates:

- **Core gameplay tables:** `Trainer`, `PokemonInstance`, `Encounter`, `Battle`, `Cooldown`.
- **Dex spine:** `Species`, `Move`, `Ability`, `Type`, junction tables, plus the `SpeciesSheet` materialized view.
- **Operations:** `OutboxMessage`, `WorkerHeartbeat`, `DailyQuest`, recent battle views.

Refer to `DATA-SCHEMA.md` for detailed entity notes, index strategy (`202510280500_scaling_indexes`), and dex migration metadata. The new dex spine migration (`202510290930_dex_reference_spine`) installs trigram/unaccent extensions and enforces canonical species references.

## 4. Roles, Grants & Helper Functions

Render dev/prod expose a tiered role model (see `ops/DB_BOOTSTRAP.md`):

- `prisma_application` — Default DML rights for runtime services.
- `prisma_worker` — Includes execution privilege on the `public.refresh_species_sheet()` helper.
- `prisma_readonly` — SELECT-only for analytics.

Prisma Accelerate limits custom roles but supports the same SECURITY DEFINER helper. Always refresh the materialized view via:

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

1. **Standard Flow:** `npx prisma migrate deploy` using a direct PostgreSQL URL for every target (`DATABASE_DIRECT_URL` for Render and the Prisma Postgres tunnel-direct string for Accelerate).
2. **Fallback:** `npx prisma db push` only when historical migrations are unavailable—followed by a baseline migration (see `ops/DB_BOOTSTRAP.md`).
3. **Post-Migration Checks:**
   - `/ops stats` command.
   - DM Home battle history.
   - `npm run db:seed:dex` (or `--dry-run` for rehearsal) with results captured in Tasklist/Prompt.

When touching staging/prod, consult the runbook’s “Smoke tests” and connection sanity matrix. Always capture command transcripts in Tasklist notes.

## 6. Dex Maintenance & Materialized Views

Dex upkeep now routes through the consolidated seeding + control suite:

| Command | Purpose | Notes |
| --- | --- | --- |
| `npm run db:seed:dex` | Fetches live PokeAPI data and repopulates `Species`, `SpeciesType`, `SpeciesAbility`, `SpeciesLearnset`, `Move`, `Ability`, and `TypeChart`. Automatically refreshes `SpeciesSheet`. | Respects `IG_ENV_FILE`; throttle via `POKEAPI_SEED_CONCURRENCY` (default 4). Pass `--dry-run` to inspect counts without writing. |
| `npm run db:auto-sync` | Runs the Dev → Prod → Dev migrate/seed cadence on startup, then polls every 5 minutes to reconcile if drift is detected. | Options: `--once`, `--dry-run`, `--interval <ms>`, `--dev-env`, `--prod-env`, `--skip-startup`, `--ci`, `--alert-webhook <url>`, `--no-alerts`, `--simulate-alert`. Emits JSON logs (`sync.consolidate.*`, `integrity.*`, `integrity.alert`) and skips writes when `--dry-run` is present. When alerts are enabled the loop posts a Discord webhook using `ALERT_WEBHOOK_URL` (or the CLI override); `--simulate-alert` fires the webhook without touching databases so operators can test routing. |
| `npm run db:mirror:check` | Executes accelerate ↔ direct parity checks for both environments and cross-env comparisons. | Reads the default `Key/Dev` and `Key/Prod` env files; override with `--dev-env`/`--prod-env`. Fails the run if mismatches are detected. |
| `npm run db:cli -- status` | Verifies active connection metadata and prints sample counts (`Species`, `User`) after a seed. | Captured in Tasklist/Prompt echoes for auditing. |
| `npm run db:cli -- counts` | Spot-checks common table volumes (species, encounters, bus messages). | Extend `scripts/db_admin.ts` as new tables come online. |

`scripts/seed_dex.ts` loads environment overrides the same way as the control suite (`IG_ENV_FILE` → `DOTENV_CONFIG_PATH` → repo `.env` when allowed). Results print per-table row counts so we can confirm >1,000 species before shipping.

Run every dex maintenance action in the Dev → Prod → Dev rhythm: execute the command against DEV first, switch `IG_ENV_FILE` to the Accelerate/Prod secrets and repeat (or invoke `scripts/ops/run_dex_migrations.ps1`, which now enforces direct URLs, when migrations need the same sequence), then point back to `Key/Dev/.env` and run `npx prisma generate` so local tooling reconnects to the direct driver.

`scripts/dev_prod_auto_sync.ts` powers the automation loop (`npm run db:auto-sync`). On deployment it runs the consolidation once, then performs integrity checks every five minutes. If counts drift (or either database changes between checks), the service replays the migrate + seed cadence and records the result via `sync.consolidate.*` + `integrity.*` events. When drift remains after a consolidation pass the loop emits `integrity.alert` with the Dev/Prod env paths and the row deltas, dispatches a webhook payload to `ALERT_WEBHOOK_URL`, and deduplicates repeat alerts until counts change. The loop also watches `data/cache/dex-sync-trigger.json` (written by `scripts/fetch_pokemon.mjs`) and logs `dex_trigger` consolidations whenever a new checksum/timestamp lands. Use `npm run guard:auto-sync` (`--ci --dry-run`) to validate env files and trigger availability before promoting changes; the guard fails fast when secrets or trigger metadata are missing.

Materialized view refresh flows through the helper; direct `REFRESH MATERIALIZED VIEW` still requires ownership. The seeding script falls back to the helper when permissions restrict direct refresh.

## 7. Operational Tooling & Telemetry

- **Outbox sink:** `src/worker/outbox.ts` now writes each processed message to the configured backup sink (`BACKUP_STORAGE_PROVIDER = s3|local|none`). Success logs include provider & location; health metrics report `backupProvider`.
- **Telemetry:** `worker.metrics.snapshot` feeds queue depth, cache size, and failure counters. Alert thresholds documented in `OPERATIONS.md`.
- **Guards:** `scripts/guard_meta.sh`, `scripts/check_db_redundancy.ts`, `scripts/db_smoke.ts`, and `scripts/guards/guard_auto_sync.sh` verify metadata, parity, and auto-sync prerequisites.
- **Dexpack Guard:** `npm run guard:dexpack` regenerates `assets/dexpack.v1.json(.gz)` in verification mode to ensure the committed pack matches the builder output; run after updating bootstrap data or loader logic.
- **Auto-sync monitoring:** Review `integrity.alert` logs after each deployment and on the five-minute cadence; investigate non-zero deltas immediately. Run `npm run guard:auto-sync` before releases to confirm secrets + `dex-sync-trigger.json` exist, and capture remediation steps in Tasklist notes when the guard fails.
- **Auto-sync alerts:** Webhook embeds (`ALERT_WEBHOOK_URL`) fire whenever `integrity.alert` appears after consolidation. Each alert summarizes deltas, links the env files, and calls out the investigation checklist; duplicates are suppressed until counts change or new drift is detected. Override destinations with `--alert-webhook`, temporarily disable with `--no-alerts`, or run `--simulate-alert` to validate routing without touching databases.
- **Control Suite:** `scripts/db_admin.ts` (run via `npm run db:cli`) consolidates counts, status checks, and raw queries while respecting secure env loading.

### Runtime Cache Observability

- `/ops cache` (Discord) reports in-memory and on-disk usage, namespace hit/miss counters, and maintenance history. Add the `cleanup: true` flag to run a maintenance sweep before sampling.
- The cache facade schedules maintenance every 10 minutes; each run emits `cache.maintenance` and `cache.metrics` logs with duration, run reason, and per-namespace stats. Use `runCacheMaintenanceNow("manual")` (or `cleanup: true`) when a manual sweep is needed between cycles.
- Tests `tests/services/cache.facade.spec.ts` and `tests/ops.spec.ts` cover the metrics snapshot and command output; run `pnpm test -- tests/services/cache.facade.spec.ts tests/ops.spec.ts` after touching cache instrumentation.

## 8. Testing & Local Verification

- **Unit Tests:** Run `npm test -- shared/backup-sink` to exercise local sink behaviour.
- **DB Smoke Script:** `npx tsx scripts/db_smoke.ts` checks role permissions and helper reachability.
- **Vitest Suites:** `tests/ops.spec.ts`, `tests/dm_home.spec.ts`, `tests/daily/*.spec.ts` ensure persistence flows stay intact.

For local experiments, set `BACKUP_STORAGE_PROVIDER=local` to inspect JSON backups under `%TEMP%/infinity-gauntlet/outbox-backups`.

### Auto-Sync Drift Response Runbook

1. **Acknowledge the alert:** The Discord webhook payload (or Render log) includes the `integrity.alert` delta snapshot, env paths, and a timestamp. Record the alert in Tasklist notes if a follow-up is already in progress.
2. **Verify counts:** Run `npm run db:cli -- counts` against DEV and PROD (via `IG_ENV_FILE`) to confirm the delta and capture the output.
3. **Inspect recent changes:** Review the latest migrations/seeds (`npm run db:auto-sync -- --once`) and Render deploy logs for failed steps or partial seeds.
4. **Re-run consolidation:** After remediation, execute `npm run db:auto-sync -- --once` to replay the loop; confirm the webhook no longer fires and counts realign.
5. **Document outcome:** Update Tasklist/Prompt notes with the alert timestamp, remediation steps, and verification commands executed.

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
