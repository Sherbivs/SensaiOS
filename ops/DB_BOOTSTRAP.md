# Staging DB Bootstrap Runbook

This runbook describes safe steps to bring a staging PostgreSQL database up to the baseline schema expected by the codebase and Prisma migrations. Use this when `npx prisma migrate deploy` fails due to missing baseline tables or missing migration history on the target DB. For Prisma Postgres (Accelerate) import instructions see `ops/DB_IMPORT_PRISMA_POSTGRES.md`, and consult `docs/database-systems.md` for the overarching architecture, role catalog, and helper inventory.

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

Checklist and decisions
- Confirm you are running commands from the canonical working directory: the GitHub Desktop clone at C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet (per ops policy).
- Verify `DATABASE_URL` points to the staging database and is the only staging instance being touched.
- Prefer managed poolers: set `DATABASE_POOL_URL` (Render connectionString) for runtime services, and ensure `DATABASE_DIRECT_URL` (Render directConnectionString) is populated so Prisma migrations bypass PGBouncer/SSL pools.
- Snapshot (optional): If you need a backup, take a production-to-staging snapshot or export the staging DB first.

Procedure A — Apply historical migrations (recommended)
1. Ensure the repo contains the full migrations history under `prisma/migrations`.
2. From the repo root (the working copy used for ops), confirm `IG_ENV_FILE` is pointing at `C:/Users/sherb/OneDrive/Documents/Key/Dev/.env` (or the staging-specific override) and that file defines `DATABASE_POOL_URL`/`DATABASE_URL` (pooled) *and* `DATABASE_DIRECT_URL` (direct `postgresql://`). On Windows PowerShell you can verify with `echo $Env:IG_ENV_FILE` and `Get-Content $Env:IG_ENV_FILE | Select-String DATABASE_` or rely on `scripts/setup_ai_env.ps1` to register the path.
  - If you previously ran Accelerate workflows with `Key/Prod/.env`, regenerate the Prisma client (`npx prisma generate`) before connecting so the CLI uses the direct Node engine again.
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
- If migration commands fail with connection errors (`P1001`/timeouts), double-check that `DATABASE_DIRECT_URL` is set to Render's direct connection string and that the security group allows connections from your workstation.

Smoke tests after schema alignment
- Run a small set of tests or ad-hoc queries from the app environment to validate the following paths work:
  - `/ops stats` admin command (returns recent battles)
  - DM Home recent-battle retrieval
  - Cooldown upsert/unique flows (ownerId + kind unique)

- Baseline connectivity commands (documented individually in `docs/db-accelerate-workflow.md`) help confirm parity between direct and Accelerate datasources:
  - `npm run db:cli -- status`
  - `npm run db:cli -- counts`
  - `npm run db:cli -- query "SELECT 1 as ok;"`
  - `npm run db:smoke` (defaults to direct) and `npm run db:smoke -- --mode=accelerate`
- Capture sanitized output for each target in `ops/ARCHIVE/db-bootstrap/<ISO8601>-tooling-evidence.md` so the audit trail travels with the runbook history.

### Rehearsal workflow (sandbox)

Use this sequence whenever you dry-run the bootstrap migration on a disposable database (DEV or a scratch clone). Each step should be recorded in the evidence archive together with timestamps and sanitized command output.

1. **Load secrets** — run `pwsh -File scripts/setup_ai_env.ps1 -EnvFile "C:/Users/sherb/OneDrive/Documents/Key/Dev/.env"` (or the appropriate scratch file) so `IG_ENV_FILE` points at the target database. Export the same variables for the current shell session if you are invoking commands manually.
2. **Apply migrations** — execute `npx prisma migrate deploy`. Expect "No pending migrations" on a re-run; the first execution should apply `202511021024_db_v0_bootstrap` and any later folders.
3. **Smoke the direct connection** — run `npm run db:smoke` and confirm the direct datasource reports `[ { ok: 1 } ]`.
4. **Smoke Accelerate** (if available) — run `npm run db:smoke -- --mode=accelerate` to verify the proxy path succeeds with the same query.
5. **Snapshot counts** — capture `npm run db:cli -- status` and `npm run db:cli -- counts` output, noting row totals for the bootstrap tables (Tenants, Trainers, DexPack, etc.).
6. **Log evidence** — append sanitized summaries to `ops/ARCHIVE/db-bootstrap/<ISO8601>-tooling-evidence.md`, including datasource masks and command outcomes.

### Rollback rehearsal (sandbox)

Only run these steps on an isolated database that can be destroyed or restored from snapshot. The goal is to prove that `rollback.sql` reverses the bootstrap and that the forward migration can be re-applied cleanly afterward.

1. **Snapshot first** — take a managed snapshot or export the database (`pg_dump`/Render backup) so you can revert if required.
2. **Execute the rollback script** — connect as a privileged role and run `psql -f prisma/migrations/202511021024_db_v0_bootstrap/rollback.sql`. Confirm the Tenant/Trainer/DexPack tables and the new columns disappear (`\dt`, `\d` checks).
3. **Reapply migrations** — rerun `npx prisma migrate deploy` to recreate the schema; ensure Prisma replays `db_v0_bootstrap` without error.
4. **Smoke direct/Accelerate** — repeat the connectivity checks (`npm run db:smoke` with and without `--mode=accelerate`).
5. **Verify counts** — run `npm run db:cli -- counts` to ensure expected tables exist (counts can be zero on a clean rollback rehearsal).
6. **Archive results** — document the rollback command, the subsequent migrate deploy, and both smoke runs in the evidence log along with the snapshot identifier used for safety.

Dex reference rollout follow-up
- After the migrations land, repopulate the canonical dex tables and verify counts:

  ```powershell
  npm run db:seed:dex
  npm run db:cli -- status
  ```

  - Pass `--dry-run` to preview counts without writing. Capture the status output in Tasklist notes so the audit trail shows >1,000 species after seeding. The workflow is documented end-to-end in `docs/database-systems.md` §6.
  - When running from WSL, follow the "Dev Reset & Hydration Quickstart" in `docs/database-systems.md` to source the Windows secrets, reset the schema (`prisma db push --force-reset`), and reseed via Accelerate without tripping duplicate learnset constraints. Finish by re-running `npm ci` in PowerShell so Windows-native binaries align with the updated lockfile.
  - Keep the Dev → Prod → Dev cadence: execute these commands on DEV first, switch `IG_ENV_FILE` to the Accelerate/Prod secrets and rerun them (or rely on `scripts/ops/run_dex_migrations.ps1`, which enforces direct URLs, for a bundled migrate+refresh), then restore `IG_ENV_FILE` to `Key/Dev/.env` and run `npx prisma generate` before resuming local development.
  - For continuous coverage, run `npm run db:auto-sync` so migrations + seeding loop on deployment and every five minutes when drift is detected. Use `--dry-run`, `--once`, or `--skip-startup` during rehearsals and monitor the JSON logs (`sync.consolidate.*`, `integrity.*`) for drift alerts.
  - `warm_cache.ts` refreshes the materialized view and then primes the Pokémon cache. If the GitHub replication helper is unavailable (missing `octokit`), the script falls back to regenerating `data/cache/pokemon.json` locally and logs the skip.

  Capture the output of these commands in the deployment log so any follow-up database tasks can move to READY/DONE with confidence.

Connection sanity matrix — 2025-10-29T20:45Z
- Accelerate (primary)
  - Load credentials: `Get-Content C:/Users/sherb/OneDrive/Documents/Key/Prod/.env | ForEach-Object { ... }`
  - Validated commands (PASS):
    - `npx prisma migrate status`
    - `npx prisma migrate deploy`
    - `npm run db:seed:dex`
    - `SELECT public.refresh_species_sheet()` (via Prisma client)
  - `npm run db:smoke -- --mode=accelerate`
- Observed blocker: the consolidated seeder warns when `REFRESH MATERIALIZED VIEW` lacks permission and automatically retries via `SELECT public.refresh_species_sheet()`. Investigate only if both attempts fail or the helper raises an error.

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

Security hygiene: rotate any exposed `OPTIMIZE_API_KEY` tokens in the Prisma Data Platform, update the active `IG_ENV_FILE` secrets file (e.g., `Key/Dev/.env`), and restart services that load it.

Keep the mixed-case name quoted (`"SpeciesSheet"`) in every statement. Add a unique index before using `REFRESH MATERIALIZED VIEW CONCURRENTLY` if one is missing.
- Render dev standby
  - Load credentials: `Set-Item Env:DATABASE_URL 'postgresql://infinity_gauntlet_db_user:<render-password>@dpg-d3vd8h7diees73et3i3g-a.oregon-postgres.render.com:5432/infinity_gauntlet_db?sslmode=require'` (same value for `DATABASE_DIRECT_URL`; copy from Render's connectionString/directConnectionString secrets)
  - Validated commands (PASS): `npx prisma migrate status`; `SELECT public.refresh_species_sheet()` (owner context); `SET ROLE prisma_application; SELECT public.refresh_species_sheet()`
  - Pending follow-up: mirror the same role grants on Prisma Accelerate, then rerun the dex seeding/backfill scripts to confirm both environments refresh `SpeciesSheet` without 42501 errors.

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

- Repeat the role creation/grant script on Accelerate once a privileged session is available. Until then, Prisma Accelerate calls to `npm run db:seed:dex` will warn about helper fallback until the role can refresh `SpeciesSheet` directly.
- When introducing new login roles, grant them membership in one or more `prisma_*` groups instead of duplicating privileges. Example: `GRANT prisma_readonly TO analytics_reader;`.
- If another schema is introduced, mirror the `ALTER DEFAULT PRIVILEGES` statements for that schema or transfer ownership to the same owner role and re-run the grants.
- Keep credentials (if any) out of source control; Render should manage per-role passwords.

### Prisma Accelerate constraints (primary — 2025-10-29T22:20Z)

- Accelerate exposes `prisma_application` and `prisma_migration` as login roles only. Restricted superuser mode blocks `CREATE ROLE` and `GRANT` statements, so the Render `prisma_worker`/`prisma_readonly` groups cannot be recreated here.
- The SECURITY DEFINER helper still applies. Create or replace it with:

  ```sql
  CREATE OR REPLACE FUNCTION public.refresh_species_sheet()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY "SpeciesSheet";
  END;
  $$;
  ```

  The default function ACL allows `prisma_application` to execute it without additional grants. Confirm by running `SELECT public.refresh_species_sheet();` via a Prisma script (for example: `npx tsx --eval 'import { PrismaClient } from "@prisma/client"; const prisma = new PrismaClient(); prisma.$executeRawUnsafe("SELECT public.refresh_species_sheet();").then(() => { console.log("helper ok"); }).finally(async () => { await prisma.$disconnect(); });'`).
- Dex scripts fall back to the helper automatically when direct refresh raises 42501, but the manual command remains handy for ad-hoc refreshes or when scripting outside the repository tools. Document helper usage in Tasklist/Prompt when run manually.

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

Contact
- If unsure, @devops or the repository author listed in `Patch.md` should be pinged before applying destructive fixes.
