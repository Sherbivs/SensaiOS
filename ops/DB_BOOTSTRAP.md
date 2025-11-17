# Staging DB Bootstrap Runbook

This runbook describes safe steps to bring a staging PostgreSQL database up to the baseline schema expected by the codebase and Prisma migrations. Use this when `npx prisma migrate deploy` fails due to missing baseline tables or missing migration history on the target DB. See `operations-bible/02-database-operations.md` for the current architecture, role catalog, and helper inventory.

**Current Architecture (2025-11-07):** The system uses direct PostgreSQL connections for all operations. See HISTORICAL CONTEXT section below for information about the removed Prisma Accelerate layer.

Read this file fully before running any commands on staging. Mistakes here can affect staging data.

Quick summary
- Preferred: run the repository's historical migrations against the staging DB using `npx prisma migrate deploy` from the repository working copy (keeps migration_history consistent).
- Fallback: if applying historical migrations is impossible for any reason, use `npx prisma db push` to create the schema, then create and commit a baseline migration locally if needed.

Blueprint assets
- Day-one schema resides in `prisma/migrations/202511021024_db_v0_bootstrap/`. `migration.sql` introduces tenants, trainers, dex pack registry, per-trainer inventory, audit log plumbing, and tenant-aware columns on existing gameplay tables.
  - Trainer settings default to an empty JSON payload so reenrollments never fail when prefs are omitted.
  - Inventory quantities carry a non-negative check constraint to guard against accidental decrements below zero.
- Emergency rollback is captured in the paired `rollback.sql`. Execute it *only* after coordinating with ops and capturing a fresh snapshot; the script removes the foreign keys, columns, and tables introduced by the bootstrap migration.
- Operator notes and sanitized command output live in `ops/ARCHIVE/db-bootstrap/2025-11-04-tooling-evidence.md`. Add new evidence files here when rehearsals run so auditors can diff outcomes by timestamp.
- Router metadata (`ops/ROUTER_INDEX.yaml`, `masterroutetable.md`, `prisma/ROUTER.md`, `prisma/migrations/ROUTER.md`) must be regenerated (`npm run docs:update-routers`) whenever the bootstrap surface changes.

## HISTORICAL CONTEXT: Prisma Accelerate DDL Limitation (Removed 2025-11-06)

**NOTE: Prisma Accelerate/Optimize has been completely removed from this project as of 2025-11-07. This section is preserved for historical understanding only.**

**Historical Issue:** Prisma Accelerate did NOT support DDL operations (CREATE TABLE, ALTER TABLE, DROP TABLE, CREATE INDEX, etc.). Accelerate was a read-optimized query cache and connection pooler that silently ignored DDL statements.

**Historical Symptom:** `npx prisma migrate deploy` reported "All migrations have been successfully applied" but no schema changes occurred when using `prisma+postgres://accelerate.prisma-data.net/...` URLs.

**Historical Root Cause:** Accelerate silently dropped DDL statements because it was designed for query caching, not schema management.

**Historical Solution (No Longer Applicable):**
```env
# OLD PATTERN (Removed) - Used separate env files for migrations vs runtime
# secrets/migrate.env - For running migrations only
DATABASE_URL=postgresql://user:pass@host/dbname                   # DIRECT PostgreSQL

# secrets/runtime.env - For application runtime (REMOVED)
DATABASE_URL=prisma+postgres://accelerate.prisma-data.net/...     # Accelerate (REMOVED)
```

**Current Solution (2025-11-07):**
All operations now use direct PostgreSQL connections. Accelerate/Optimize references have been eliminated. Use:
- **Game Engine (Render):** `DEV_DATABASE_URL` (internal Render network) + `PROD_DATABASE_URL` (localhost PostgreSQL on persistent disk)
- **Your Workstation:** `RENDER_DB_EXTERNAL_URL` (DEV master via internet) + optional `DATABASE_ONPREMISE_DEV_PRIMARY` (on-premise PostgreSQL mirror)

No separate migration/runtime env files needed. All URLs point directly to PostgreSQL (`postgresql://...`).

Checklist and decisions
- Confirm you are running commands from the canonical working directory: the GitHub Desktop clone at C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet (per ops policy).
- Verify database URL points to the correct staging database.
- **Current System:** All operations use direct PostgreSQL connections (`postgresql://...`). No Accelerate layer.
- **From your workstation:** Use `RENDER_DB_EXTERNAL_URL` (DEV master via internet) for migrations
- **From Game Engine (Render):** Use `DEV_DATABASE_URL` (internal Render network) for migrations
- Snapshot (optional): If you need a backup, take a production-to-staging snapshot or export the staging DB first.

Procedure A — Apply historical migrations (recommended)
1. Ensure the repo contains the full migrations history under `prisma/migrations`.
2. From the repo root (the working copy used for ops), confirm `IG_ENV_FILE` is pointing at `secrets/Infinity-Gauntlet.env` (or the staging-specific override) and that file defines the appropriate database URL:
   - **From your workstation:** Use `RENDER_DB_EXTERNAL_URL` (DEV master via internet)
   - **From Game Engine:** Use `DEV_DATABASE_URL` (internal Render network)
   
   On Windows PowerShell you can verify with `echo $Env:IG_ENV_FILE` and `Get-Content $Env:IG_ENV_FILE | Select-String DATABASE_` or rely on `scripts/setup_ai_env.ps1` to register the path.

3. Run:

   npx prisma migrate deploy

   - This will apply all unapplied migrations in order and leave the migration history table updated.
   - This run creates the bootstrap schema (`db_v0_bootstrap`) and the follow-up trainer profile migration when both folders exist locally.
   - If it succeeds, inspect indexes with `
     SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public';
     `, then proceed to smoke-tests.

Procedure B — Safe fallback with `db push` (use only if A is not possible)
1. Understand the tradeoff: `prisma db push` creates/updates the database schema to match Prisma models but does not create migration history entries. That makes later `migrate deploy` usage more complicated unless you create a baseline migration locally and mark it as applied.
2. From repo root run:

  npx prisma db push --preview-feature

   - If your Prisma CLI version doesn’t require `--preview-feature`, omit it.
   - Inspect the DB after the push and confirm the tables exist.

3. Create a baseline migration locally so future `migrate deploy` runs can proceed against this DB without re-applying the same DDL:

   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/2025_baseline/metadata.sql

   - Review the generated SQL and adjust as needed.
   - Commit the folder `prisma/migrations/2025_baseline` with a clear message.

4. Use `npx prisma migrate resolve` to mark the baseline migration as applied on the DB if necessary.

Guidance when `202510280500_scaling_indexes` (or other forward-only migrations) fails
- If the forward-only index migration fails because tables don't exist, do not attempt to modify the forward-only migration to create missing base tables — instead, bring the base schema to the DB via Procedure A or B, then re-run `npx prisma migrate deploy` to run the index migration.
- If migration commands fail with connection errors (`P1001`/timeouts), double-check that `RENDER_DB_EXTERNAL_URL` or `RENDER_DB_INTERNAL_URL` is set to Render's direct connection string and that the security group allows connections from your workstation.

Smoke tests after schema alignment
- Run a small set of tests or ad-hoc queries from the app environment to validate the following paths work:
  - `/ops stats` admin command (returns recent battles)
  - DM Home recent-battle retrieval
  - Cooldown upsert/unique flows (ownerId + kind unique)

- Baseline connectivity commands help confirm database status:
  - `npm run db:cli -- status`
  - `npm run db:cli -- counts`
  - `npm run db:cli -- query "SELECT 1 as ok;"`
  - `npm run db:smoke` (test direct PostgreSQL connection)
- Capture sanitized output for each target in `ops/ARCHIVE/db-bootstrap/<ISO8601>-tooling-evidence.md` so the audit trail travels with the runbook history.

### Rehearsal workflow (sandbox)

Use this sequence whenever you dry-run the bootstrap migration on a disposable database (DEV or a scratch clone). Each step should be recorded in the evidence archive together with timestamps and sanitized command output.

1. **Load secrets** — run `pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env"` (or the appropriate staging file) so `IG_ENV_FILE` points at the target database. Export the same variables for the current shell session if you are invoking commands manually.
2. **Apply migrations** — execute `npx prisma migrate deploy`. Expect "No pending migrations" on a re-run; the first execution should apply `202511021024_db_v0_bootstrap` and any later folders.
3. **Smoke the connection** — run `npm run db:smoke` and confirm the datasource reports `[ { ok: 1 } ]`.
4. **Snapshot counts** — capture `npm run db:cli -- status` and `npm run db:cli -- counts` output, noting row totals for the bootstrap tables (Tenants, Trainers, DexPack, etc.).
5. **Log evidence** — append sanitized summaries to `ops/ARCHIVE/db-bootstrap/<ISO8601>-tooling-evidence.md`, including datasource masks and command outcomes.

### Rollback rehearsal (sandbox)

Only run these steps on an isolated database that can be destroyed or restored from snapshot. The goal is to prove that `rollback.sql` reverses the bootstrap and that the forward migration can be re-applied cleanly afterward.

1. **Snapshot first** — take a managed snapshot or export the database (`pg_dump`/Render backup) so you can revert if required.
2. **Execute the rollback script** — connect as a privileged role and run `psql -f prisma/migrations/202511021024_db_v0_bootstrap/rollback.sql`. Confirm the Tenant/Trainer/DexPack tables and the new columns disappear (`\dt`, `\d` checks).
3. **Reapply migrations** — rerun `npx prisma migrate deploy` to recreate the schema; ensure Prisma replays `db_v0_bootstrap` without error.
4. **Smoke connection** — repeat the connectivity check (`npm run db:smoke`).
5. **Verify counts** — run `npm run db:cli -- counts` to ensure expected tables exist (counts can be zero on a clean rollback rehearsal).
6. **Archive results** — document the rollback command, the subsequent migrate deploy, and the smoke run in the evidence log along with the snapshot identifier used for safety.

Dex reference rollout follow-up
- After the migrations land, repopulate the canonical dex tables and verify counts:

  ```powershell
  npm run db:seed:dex
  npm run db:cli -- status
  ```

  - Pass `--dry-run` to preview counts without writing. Capture the status output in Tasklist notes so the audit trail shows >1,000 species after seeding. The workflow is documented end-to-end in `operations-bible/02-database-operations.md` §6.
  - When running from WSL, follow the "Dev Reset & Hydration Quickstart" in `operations-bible/02-database-operations.md` to source the Windows secrets and reset the schema (`prisma db push --force-reset`). Finish by re-running `npm ci` in PowerShell so Windows-native binaries align with the updated lockfile.
  - Keep the Dev → Prod → Dev cadence: execute these commands on DEV first (from your workstation using `RENDER_DB_EXTERNAL_URL`), then update Game Engine (Render) environment variables if needed, then return to local development.
  - For continuous coverage, run `npm run db:auto-sync` so migrations + seeding loop on deployment and every five minutes when drift is detected. Use `--dry-run`, `--once`, or `--skip-startup` during rehearsals and monitor the JSON logs (`sync.consolidate.*`, `integrity.*`) for drift alerts.
  - `warm_cache.ts` refreshes the materialized view and then primes the Pokémon cache. If the GitHub replication helper is unavailable (missing `octokit`), the script falls back to regenerating `data/cache/pokemon.json` locally and logs the skip.

  Capture the output of these commands in the deployment log so any follow-up database tasks can move to READY/DONE with confidence.

Connection sanity matrix — 2025-11-07 (Updated)
- Direct PostgreSQL (current system)
  - Load credentials: `Get-Content secrets/Infinity-Gauntlet.env | ForEach-Object { ... }`
  - Validated commands (PASS):
    - `npx prisma migrate status`
    - `npx prisma migrate deploy`
    - `npm run db:seed:dex`
    - `SELECT public.refresh_species_sheet()` (via Prisma client)
  - `npm run db:smoke` (test PostgreSQL connection)
- **Historical Note (2025-10-29):** Previous system used Prisma Accelerate. All Accelerate references have been removed as of 2025-11-07.

### Clear the `SpeciesSheet` privilege error (Postgres 42501)

The Prisma role in `DATABASE_URL` is missing privileges on the materialized view. Run these steps from a superuser or the object owner (swap names to match your environment):

1. **Confirm identity and ownership**

   ```sql
   SELECT current_user;
   SELECT schemaname, matviewname, pg_get_userbyid(c.relowner) AS owner
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'm' AND n.nspname = 'public' AND c.relname = 'SpeciesSheet';
   ```

2. **Grant read access on the matview**

   ```sql
   GRANT CONNECT ON DATABASE mydb TO prisma_user;
   GRANT USAGE  ON SCHEMA public TO prisma_user;
   GRANT SELECT ON MATERIALIZED VIEW public."SpeciesSheet" TO prisma_user;
   ```

3. **Allow refreshes** — pick one option:

   - Change ownership (simpler when the app controls the schema):

     ```sql
     ALTER MATERIALIZED VIEW public."SpeciesSheet" OWNER TO prisma_user;
     ```

   - Or create a SECURITY DEFINER wrapper so the app can refresh without changing owners:

     ```sql
     CREATE OR REPLACE FUNCTION public.refresh_species_sheet() RETURNS void
     LANGUAGE sql
     SECURITY DEFINER
     SET search_path = public
     AS $$ REFRESH MATERIALIZED VIEW CONCURRENTLY public."SpeciesSheet"; $$;

     GRANT EXECUTE ON FUNCTION public.refresh_species_sheet() TO prisma_user;
     ```

4. **Future-proof grants** (optional but recommended when new objects are created by the same owner):

   ```sql
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT SELECT ON TABLES TO prisma_user;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT USAGE, SELECT ON SEQUENCES TO prisma_user;
   ```

5. **Verify and test**

   ```sql
   SELECT has_schema_privilege('prisma_user','public','USAGE') AS schema_ok,
          has_table_privilege('prisma_user','public."SpeciesSheet"','SELECT') AS matview_ok;
   ```

   ```ts
   await prisma.$queryRawUnsafe('SELECT 1 FROM "SpeciesSheet" LIMIT 1');
   ```

Security hygiene: rotate any exposed database credentials, update the active `IG_ENV_FILE` secrets file (e.g., `secrets/Infinity-Gauntlet.env`), and restart services that load it.

Keep the mixed-case name quoted (`"SpeciesSheet"`) in every statement. Add a unique index before using `REFRESH MATERIALIZED VIEW CONCURRENTLY` if one is missing.
- Render dev standby
  - Load credentials: `Set-Item Env:RENDER_DB_EXTERNAL_URL 'postgresql://infinity_gauntlet_db_user:<render-password>@dpg-d3vd8h7diees73et3i3g-a.oregon-postgres.render.com:5432/infinity_gauntlet_db?sslmode=require'` (copy from Render's connectionString/directConnectionString secrets)
  - Validated commands (PASS): `npx prisma migrate status`; `SELECT public.refresh_species_sheet()` (owner context); `SET ROLE prisma_application; SELECT public.refresh_species_sheet()`

## Prisma permission schema (Render dev baseline — 2025-10-29T22:05Z)

The Render dev database now exposes three group roles that future login roles can inherit:

| Role | Purpose | Current members |
| --- | --- | --- |
| `prisma_application` | Default read/write permissions for Prisma services and CLI flows. Grants DML on all tables, USAGE/UPDATE on sequences, and CONNECT to the database. New tables/sequences automatically inherit the same privileges via default ACLs. | `infinity_gauntlet_db_user` |
| `prisma_worker` | Same table/sequence rights as `prisma_application` plus permission to execute `public.refresh_species_sheet()` (SECURITY DEFINER helper). Use for background jobs that refresh materialized views or run maintenance scripts. | `infinity_gauntlet_db_user` |
| `prisma_readonly` | SELECT + USAGE on tables/sequences for analytics/read replicas. No members yet. | _(none)_ |

Creation script (idempotent):

```sql
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prisma_application') THEN CREATE ROLE prisma_application NOLOGIN; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prisma_worker') THEN CREATE ROLE prisma_worker NOLOGIN; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prisma_readonly') THEN CREATE ROLE prisma_readonly NOLOGIN; END IF; END $$;

GRANT CONNECT ON DATABASE infinity_gauntlet_db TO prisma_application, prisma_worker, prisma_readonly;
GRANT USAGE ON SCHEMA public TO prisma_application, prisma_worker, prisma_readonly;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO prisma_application, prisma_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO prisma_readonly;

GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO prisma_application, prisma_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO prisma_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO prisma_application, prisma_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO prisma_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO prisma_application, prisma_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO prisma_readonly;

GRANT prisma_application, prisma_worker TO infinity_gauntlet_db_user;
```

### SpeciesSheet refresh helper

Because Render roles are non-owner by default, refreshing `"SpeciesSheet"` now flows through a SECURITY DEFINER function owned by the database owner:

```sql
CREATE OR REPLACE FUNCTION public.refresh_species_sheet()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW "SpeciesSheet";
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_species_sheet() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_species_sheet() TO prisma_application, prisma_worker;
```

Usage example (inside Prisma script or psql):

```sql
SET ROLE prisma_application;
SELECT public.refresh_species_sheet();
```

- Quick verification: run the statement above immediately after applying the grants; expect the helper to finish without raising `42501`. Reset the role (`RESET ROLE;`) so subsequent migrations run under the default context.

### Rolling the schema to other environments

- When introducing new login roles, grant them membership in one or more `prisma_*` groups instead of duplicating privileges. Example: `GRANT prisma_readonly TO analytics_reader;`.
- If another schema is introduced, mirror the `ALTER DEFAULT PRIVILEGES` statements for that schema or transfer ownership to the same owner role and re-run the grants.
- Keep credentials (if any) out of source control; Render should manage per-role passwords.

### HISTORICAL NOTE: Prisma Accelerate Constraints (Removed 2025-11-07)

**This section is preserved for historical context only. Prisma Accelerate has been removed from the project.**

Historical constraints (2025-10-29):
- Accelerate exposed `prisma_application` and `prisma_migration` as login roles only. Restricted superuser mode blocked `CREATE ROLE` and `GRANT` statements, so the Render `prisma_worker`/`prisma_readonly` groups could not be recreated there.
- The SECURITY DEFINER helper was required for Accelerate to execute materialized view refreshes without elevated privileges.

Current system (2025-11-07):
- All databases use direct PostgreSQL connections with standard role management
- The `refresh_species_sheet()` helper function remains useful for privilege isolation
- Dex scripts can refresh materialized views directly or via the helper function

Rollback and safety
- `prisma/migrations/202511021024_db_v0_bootstrap/rollback.sql` drops the tenant/trainer/dex pack objects and columns created by the bootstrap migration. Run it via psql after taking a fresh snapshot and coordinate with ops before execution; rerun `npm run docs:update-routers` afterward to keep metadata timestamps aligned.
- If anything goes wrong, do not apply more migrations. Revert to a DB snapshot if you took one and open an ops incident.

References and helpful commands
- Check applied migrations:

  SELECT * FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 20;

- Inspect DB tables:

  \dt

- Confirm runtime pool vs direct values:

  SELECT current_user, inet_client_addr();

---

## Database Replication Architecture (Phase 16 - 2025-11-06)

### Overview

The system implements a **master-replica cascade architecture** for database version control and synchronization across DEV (Render PostgreSQL master), PROD (Game Engine's localhost PostgreSQL), and Local (your workstation) environments.

```
DEV (master) → Game Engine PROD → Local (workstation)
```

**Key Principles:**
- **DEV is the single source of truth** for all schema changes (Render PostgreSQL master)
- **Version control via SHA-256 fingerprints** of migration checksums
- **Integrity verification** (schema + data) before every sync completion
- **Reversion detection** blocks downstream sync automatically
- **No silent errors** - all failures logged and alerted

### Version Tracking

**Tables:**
- `db_version` — Tracks version fingerprints, migration counts, last migration metadata
- `db_sync_state` — Records sync operations, status, errors, integrity check results

**Version Fingerprint:**
```
SHA-256(migration_1:checksum|migration_2:checksum|...)
```

Calculated from `_prisma_migrations` table ensures tamper-proof version identity.

**Comparison States:**
- `MATCH` — Identical fingerprints, databases in sync
- `AHEAD` — Source has more migrations with valid prefix, safe to sync
- `BEHIND` — Source rolled back (reversion detected), blocks sync until master catches up
- `DIVERGED` — Different migration histories, requires manual reconciliation

### Sync Orchestration

**DEV → Prod (5-stage process):**
1. **VERSION_CHECK** — Compare fingerprints via `compareVersions()`
2. **INTEGRITY_VERIFY** — Pre-migration schema check via `verifySchemaIntegrity()`
3. **MIGRATION_APPLY** — Execute `npx prisma migrate deploy` using direct PostgreSQL URL (DEV_DATABASE_URL on Game Engine)
4. **VALIDATION** — Post-migration fingerprint must match DEV exactly, schema integrity must pass
5. **COMPLETE** — Record metrics and sync event

**Prod → Local:**
- Version check and idempotency (pg_dump/restore implementation deferred)
- Only sync if Prod version >= Local version
- Used for offline work readiness

**Automated Schedule:**
- DEV → Prod: Every 6 hours
- Prod → Local: Daily at 2 AM

### CLI Operations

```bash
# Check replication status
npm run db:replication status

# View metrics and alerts
npm run db:replication metrics

# Manual sync
npm run db:replication sync dev-to-prod
npm run db:replication sync prod-to-local
npm run db:replication sync full-cascade

# Verify integrity
npm run db:replication integrity all

# Compare versions
npm run db:replication compare

# Schema differences
npm run db:replication diff dev prod

# Emergency controls
npm run db:replication block-prod    # Block downstream sync
npm run db:replication unblock-prod  # Resume sync
npm run db:replication reset-local   # Rebuild Local from Prod
```

### Alert Thresholds

| Severity | Condition | Response Time |
|----------|-----------|---------------|
| **WARNING** | Lag >5 migrations, sync >10min, blocked status | <1 hour |
| **ERROR** | Lag >10 migrations, sync failure, integrity failure | <30 min |
| **CRITICAL** | Diverged fingerprints, reversion detected | <15 min |

### Emergency Procedures

**Rollback DEV:**
1. Block downstream: `npm run db:replication block-prod`
2. Roll back migrations: `npx prisma migrate resolve --rolled-back <name>`
3. Verify schema: `npm run db:replication integrity dev-prod`
4. Unblock when stable: `npm run db:replication unblock-prod`

**Version Conflict:**
1. Capture state: `npm run db:replication compare`
2. Analyze differences: `npm run db:replication diff dev prod`
3. Decide strategy (reset DEV from Prod, or force sync DEV to Prod)
4. Execute resolution with confirmation flags
5. Verify convergence: `npm run db:replication compare`

### Documentation

- **Architecture:** `docs/db-replication-architecture.md` — Comprehensive design document
- **Runbook:** `docs/db-replication-runbook.md` — Operational procedures and troubleshooting
- **Implementation:**
  - `src/services/db-replication/version.ts` — Version tracking (373 lines)
  - `src/services/db-replication/integrity.ts` — Schema/data verification (761 lines)
  - `src/services/db-replication/sync.ts` — Sync orchestrator (530 lines)
  - `src/services/db-replication/monitoring.ts` — Metrics and alerting (468 lines)
  - `scripts/db_replication.ts` — CLI commands (750 lines)

### Integration with Bootstrap Workflow

When running migrations via `scripts/bootstrap_staging_db.ps1` or manual `npx prisma migrate deploy`:

1. **Use direct PostgreSQL URLs** (current system - all operations direct)
   - From your workstation: `RENDER_DB_EXTERNAL_URL` (DEV master via internet)
   - From Game Engine: `DEV_DATABASE_URL` (internal Render network)
2. **Verify version after migration:**
   ```bash
   npm run db:replication version dev
   npm run db:replication version prod
   ```
3. **Check for divergence:**
   ```bash
   npm run db:replication compare
   ```
4. **If DEV ahead of Prod, sync:**
   ```bash
   npm run db:replication sync dev-to-prod
   ```
5. **Verify integrity:**
   ```bash
   npm run db:replication integrity dev-prod
   ```

This ensures migrations propagate correctly across the cascade and no silent errors occur.

---

Contact
- If unsure, @devops or the repository author listed in `Patch.md` should be pinged before applying destructive fixes.
