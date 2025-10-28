# Staging DB Bootstrap Runbook

This runbook describes safe steps to bring a staging PostgreSQL database up to the baseline schema expected by the codebase and Prisma migrations. Use this when `npx prisma migrate deploy` fails due to missing baseline tables or missing migration history on the target DB.

Read this file fully before running any commands on staging. Mistakes here can affect staging data.

Quick summary
- Preferred: run the repository's historical migrations against the staging DB using `npx prisma migrate deploy` from the repository working copy (keeps migration_history consistent).
- Fallback: if applying historical migrations is impossible for any reason, use `npx prisma db push` to create the schema, then create and commit a baseline migration locally if needed.

Checklist and decisions
- Confirm you are running commands from the canonical working directory: the GitHub Desktop clone at C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet (per ops policy).
- Verify `DATABASE_URL` points to the staging database and is the only staging instance being touched.
- Snapshot (optional): If you need a backup, take a production-to-staging snapshot or export the staging DB first.

Procedure A — Apply historical migrations (recommended)
1. Ensure the repo contains the full migrations history under `prisma/migrations`.
2. From the repo root (the working copy used for ops), confirm `DATABASE_URL` is set. On Windows PowerShell you can source `.env` via `Get-Content .env` or use your shell’s dotfile loader.
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

Smoke tests after schema alignment
- Run a small set of tests or ad-hoc queries from the app environment to validate the following paths work:
  - `/ops stats` admin command (returns recent battles)
  - DM Home recent-battle retrieval
  - Cooldown upsert/unique flows (ownerId + kind unique)

Rollback and safety
- If anything goes wrong, do not apply more migrations. Revert to a DB snapshot if you took one and open an ops incident.

References and helpful commands
- Check applied migrations:

  SELECT * FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 20;

- Inspect DB tables:

  \dt

Contact
- If unsure, @devops or the repository author listed in `Patch.md` should be pinged before applying destructive fixes.
