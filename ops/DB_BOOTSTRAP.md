# Staging DB Bootstrap Runbook

This runbook describes safe steps to bring a staging PostgreSQL database up to the baseline schema expected by the codebase and Prisma migrations. Use this when `npx prisma migrate deploy` fails due to missing baseline tables or missing migration history on the target DB. For Prisma Postgres (Accelerate) import instructions see `ops/DB_IMPORT_PRISMA_POSTGRES.md`.

Read this file fully before running any commands on staging. Mistakes here can affect staging data.

Quick summary
- Preferred: run the repository's historical migrations against the staging DB using `npx prisma migrate deploy` from the repository working copy (keeps migration_history consistent).
- Fallback: if applying historical migrations is impossible for any reason, use `npx prisma db push` to create the schema, then create and commit a baseline migration locally if needed.

Checklist and decisions
- Confirm you are running commands from the canonical working directory: the GitHub Desktop clone at C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet (per ops policy).
- Verify `DATABASE_URL` points to the staging database and is the only staging instance being touched.
- Prefer managed poolers: set `DATABASE_POOL_URL` (Render connectionString) for runtime services, and ensure `DATABASE_DIRECT_URL` (Render directConnectionString) is populated so Prisma migrations bypass PGBouncer/SSL pools.
- Snapshot (optional): If you need a backup, take a production-to-staging snapshot or export the staging DB first.

Procedure A — Apply historical migrations (recommended)
1. Ensure the repo contains the full migrations history under `prisma/migrations`.
2. From the repo root (the working copy used for ops), confirm `.env` contains `DATABASE_POOL_URL`/`DATABASE_URL` (pooled) *and* `DATABASE_DIRECT_URL` (direct). On Windows PowerShell you can source `.env` via `Get-Content .env` or rely on the bootstrap script to import it.
3. Run:

   npx prisma migrate deploy

   - This will apply all unapplied migrations in order and leave the migration history table updated.
   - If it succeeds, inspect indexes with `
     SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public';
     ` and proceed to smoke-tests.

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

Dex reference rollout follow-up
- After the migrations land, seed the canonical dex tables and warm caches:

  ```powershell
  npx tsx scripts/dex/seed_reference.ts
  npx tsx scripts/dex/backfill_species.ts --seed-missing
  npx tsx scripts/dex/warm_cache.ts
  ```

  - `backfill_species.ts` exits early when no rows need remediation and refreshes the `SpeciesSheet` view for good measure. Use `--dry-run` to inspect missing IDs without writing changes, or `--seed-missing` (shown above) to import any referenced species that the bootstrap JSON already knows about.
  - `warm_cache.ts` refreshes the materialized view and then primes the Pokémon cache. If the GitHub replication helper is unavailable (missing `octokit`), the script falls back to regenerating `data/cache/pokemon.json` locally and logs the skip.

  Capture the output of these commands in the deployment log so the T10.DEX tasks can be advanced to READY/DONE with confidence.

Rollback and safety
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
