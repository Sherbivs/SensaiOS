# DB.V0 Backup & Restore Rehearsal — 2025-11-05

## Environment
- Timestamp (UTC): 2025-11-05T18:52:00Z
- IG_ENV_FILE: `C:/Users/sherb/OneDrive/Documents/Key/Dev/.env`
- Active host: `dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com`
- Datasource: Direct/Postgres (Prisma `DATABASE_DIRECT_URL`)

## Command Log
1. `npm run db:cli -- status`
   - Species: 1025
   - Users: 2
   - Confirms direct datasource with pool + direct URLs present.
2. `npm run db:cli -- query "SHOW wal_level;"`
   - Result: `replica` (suitable for PITR).
3. `npm run db:cli -- query "SHOW archive_mode;"`
   - Result: `off` — Render handles WAL archiving via managed snapshots; see notes.
4. `npm run ops:dex-v2-backup -- --env-file "C:/Users/sherb/OneDrive/Documents/Key/Dev/.env" --label dev --output-dir backups --pg-dump-path "tools/pgsql17/pgsql/bin/pg_dump.exe"`
   - Duration: 14.785 s (Measure-Command)
   - Output: `backups/archive/2025-11-05/dev-dex-2025-11-06T00-49-16.472Z.dump` (generated under `backups/` before archival move)
   - SHA256: `BDC5F48B5414AF99DBBCF0F69D074CE4FABEA27BF7078D5E586442FD0A76C7FD`
5. `pg_restore --format=custom --schema-only --no-owner --file %TEMP%/dev-dex-2025-11-06-schema.sql backups/dev-dex-2025-11-06T00-49-16.472Z.dump`
   - Duration: 0.091 s
   - Output SQL size: 43 KB (schema-only extract)

## RPO / RTO Snapshot
- **RPO:** < 15 seconds (fresh dump generated immediately before rehearsal).
- **RTO (schema load):** 0.09 s to unpack schema-only SQL from the `.dump` archive. Full data restore is expected to fit within minutes using the same toolchain; document actual timings during live restores.

## Follow-up Notes
- Render’s managed PITR is still required because `archive_mode` is `off` on the direct host. Document expectations in the operations runbook and recovery playbook.
- Store dumps outside the repository (backups directory is `.gitignore`d). Move dated dumps into `backups/archive/` after verification to keep the working folder tidy.
- Retain the `%TEMP%` schema extract only for validation; delete after review to avoid stale artifacts.
