# Database Systems Guide

_Last updated: 2025-10-29T23:56:00Z (UTC) — Rev: 1.0_

This guide captures everything engineers need to understand, operate, and extend Infinity Gauntlet’s PostgreSQL footprint across Render, Prisma Accelerate, and local development. Pair it with `DATA-SCHEMA.md` for entity specifics and `ops/DB_BOOTSTRAP.md` for runbook-grade procedures.

## 1. Topology & Environments

| Environment | Provider | Primary URL Source | Purpose |
| --- | --- | --- | --- |
| **Render Dev/Prod** | Render managed Postgres | `DATABASE_POOL_URL` (runtime), `DATABASE_DIRECT_URL` (migrations) | Player-facing runtime, workers, and operational tooling. |
| **Prisma Accelerate** | Prisma Data Platform | `DATABASE_ACCELERATE_URL` | High-availability read/write tier used for dex rollouts and helper testing. |
| **Local** | Developer machine or Docker | `.env` (fallback), optional `DATABASE_EXTERNAL_URL` | Experimentation, feature development, smoke tests. |

The shared config loader (`src/shared/config.ts`) normalizes these URLs, records the chosen source (see `databaseUrlSource`/`databaseConnectionMode`), and persists successful selections to `%USERPROFILE%\.infinity-gauntlet\db-connection.json`.

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

1. **Standard Flow:** `npx prisma migrate deploy` using `DATABASE_DIRECT_URL` (Render) or `DATABASE_ACCELERATE_URL` (Accelerate).
2. **Fallback:** `npx prisma db push` only when historical migrations are unavailable—followed by a baseline migration (see `ops/DB_BOOTSTRAP.md`).
3. **Post-Migration Checks:**
   - `/ops stats` command.
   - DM Home battle history.
   - Dex scripts (`seed_reference`, `backfill_species`, `warm_cache`).

When touching staging/prod, consult the runbook’s “Smoke tests” and connection sanity matrix. Always capture command transcripts in Tasklist notes.

## 6. Dex Maintenance & Materialized Views

Scripts under `scripts/dex/` provide deterministic upkeep:

| Script | Purpose | Notes |
| --- | --- | --- |
| `seed_reference.ts` | Upserts dex JSON into canonical tables | Idempotent; accepts filters for species/moves subsets. |
| `backfill_species.ts` | Ensures `PokemonInstance`/`Encounter` rows reference canonical `speciesId` | Falls back to the helper when direct refresh fails. |
| `warm_cache.ts` | Refreshes `SpeciesSheet` and warms Pokémon cache | Skips GitHub replication if Octokit config missing. |

Materialized view refresh flows through the helper; direct `REFRESH MATERIALIZED VIEW` requires ownership. The helper logs via `Scripts` and outbox runs; inspect `worker.outbox.sink` entries to confirm durable storage uploads.

## 7. Operational Tooling & Telemetry

- **Outbox sink:** `src/worker/outbox.ts` now writes each processed message to the configured backup sink (`BACKUP_STORAGE_PROVIDER = s3|local|none`). Success logs include provider & location; health metrics report `backupProvider`.
- **Telemetry:** `worker.metrics.snapshot` feeds queue depth, cache size, and failure counters. Alert thresholds documented in `OPERATIONS.md`.
- **Guards:** `scripts/guard_meta.sh`, `scripts/check_db_redundancy.ts`, and `scripts/db_smoke.ts` verify data parity and schema readiness.
- **Control Suite:** `scripts/db_admin.ts` (run via `npm run db:cli`) consolidates counts, status checks, and raw queries while respecting secure env loading.

## 8. Testing & Local Verification

- **Unit Tests:** Run `npm test -- shared/backup-sink` to exercise local sink behaviour.
- **DB Smoke Script:** `npx tsx scripts/db_smoke.ts` checks role permissions and helper reachability.
- **Vitest Suites:** `tests/ops.spec.ts`, `tests/dm_home.spec.ts`, `tests/daily/*.spec.ts` ensure persistence flows stay intact.

For local experiments, set `BACKUP_STORAGE_PROVIDER=local` to inspect JSON backups under `%TEMP%/infinity-gauntlet/outbox-backups`.

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
