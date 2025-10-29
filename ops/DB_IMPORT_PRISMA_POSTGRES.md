# Prisma Postgres Import Runbook

Use this runbook when migrating data between the Render PostgreSQL cluster and Prisma Postgres (Accelerate-backed) for dev/test parity. The flow captures the current production/staging schema, pushes it through Prisma's TCP tunnel, and verifies the new target. It also documents how to keep the Render database in lockstep as a hot standby for queries.

## Primary vs standby layout
- **Primary:** Prisma Accelerate service (0.5 GB) fronting Prisma Postgres. All game writes/read traffic flows through this endpoint.
- **Standby:** Render-hosted Postgres (1 GB). Treat this instance as read-only except during refresh jobs. Point long-running analytics or replica queries here.
- Prisma migrations must run against **both** databases. After publishing a migration, execute `npx prisma migrate deploy` with `DATABASE_URL` set to Accelerate and again with `DATABASE_URL` set to the Render URL (or run `DATABASE_DIRECT_URL` via `prisma migrate deploy --schema`).
- Backups rely on `pg_dump`/`pg_restore` transfers; there is no automatic replication between services unless you configure logical replication separately.

## Prerequisites
- Run commands from the canonical checkout: `C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet`.
- Ensure `node_modules` is installed (for `npx`).
- Install PostgreSQL 17 client binaries under `tools/pgsql17/pgsql/bin` (see `tools/postgresql17.zip`).
- Export credentials safely. Do **not** commit `.env` changes with live secrets.

## 1. Export source database (generic flow)
1. Point `DATABASE_URL` at the source Render instance (pooled/direct both work for dumps):

   ```powershell
   Set-Item Env:DATABASE_URL "postgresql://user:password@host:5432/database?sslmode=require"
   ```

2. Verify the binary path exists:

   ```powershell
   Test-Path .\tools\pgsql17\pgsql\bin\pg_dump.exe
   ```

3. Run the export (writes `db_dump.bak` to repo root):

   ```powershell
   .\tools\pgsql17\pgsql\bin\pg_dump.exe `
     -Fc `
     -v `
     -d "$Env:DATABASE_URL" `
     -n public `
     -f db_dump.bak
   ```

   - If you see version mismatch errors, re-download the matching PostgreSQL binaries (the script already assumes 17.x).

## 2. Set Prisma Postgres connection
1. Set `DATABASE_URL` to the Prisma Accelerate connection string:

   ```powershell
   Set-Item Env:DATABASE_URL "prisma+postgres://accelerate.prisma-data.net/?api_key=..."
   ```

2. Keep the API key secret. Do not commit or copy it outside secure notes.

## 3. Restore through Prisma tunnel
1. Run the helper script (handles tunnel startup, SSL disable, cleanup):

   ```powershell
   npx tsx scripts/db_smoke.ts  # optional sanity check before import
   pwsh .\scripts\restore_prisma_postgres.ps1 -BackupPath .\db_dump.bak
   ```

   - The script spins up `npx --yes @prisma/ppg-tunnel --host 127.0.0.1 --port 5433`, waits for the port to listen, then runs `pg_restore --clean --if-exists --no-owner --no-privileges --no-acl ...`.
   - Override parameters if needed: `-TunnelHost`, `-Port`, `-Database`, `-PgRestorePath`.
   - On completion you should see `Restore complete.` and the tunnel output.

## 4. Verify data
1. Run the smoke query to ensure Prisma client can read via Accelerate:

   ```powershell
   npx tsx scripts/db_smoke.ts
   ```

2. Optionally inspect data with Prisma Studio:

   ```powershell
   npx prisma studio
   ```

3. Confirm critical tables (`Battle`, `User`, `_prisma_migrations`, etc.) exist and row counts match expectations.

## 5. Clean up
- Unset sensitive environment variables when finished:

  ```powershell
  Remove-Item Env:DATABASE_URL
  Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
  ```

- Archive or delete `db_dump.bak` if it should not remain on disk.

## 6. Sync Prisma Accelerate (primary) to Render (standby)
Use this sequence whenever you want the Render database to mirror the latest primary data snapshot.

1. **Open a Prisma tunnel and capture Accelerate credentials.**
    ```powershell
    Set-Item Env:DATABASE_URL "prisma+postgres://accelerate.prisma-data.net/?api_key=..."
    npx --yes @prisma/ppg-tunnel --host 127.0.0.1 --port 5433
    ```
    Leave the tunnel running in its own terminal. It prints a `postgresql://...` connection string once the tunnel is ready—copy it for the next step.

2. **Dump the primary through the tunnel.** In a new shell:
    ```powershell
    Set-Item Env:PGSSLMODE disable
    .\tools\pgsql17\pgsql\bin\pg_dump.exe `
       -Fc `
       -v `
       --dbname "postgresql://<tunnel-credentials>@127.0.0.1:5433/<database>" `
       -n public `
       -f db_primary_snapshot.bak
    ```
    Replace `<tunnel-credentials>` with the username/password pair emitted by the tunnel output. The dump runs locally; expect the same runtime as a normal `pg_dump`.

3. **Restore into the Render standby.**
    ```powershell
    Set-Item Env:DATABASE_URL "postgresql://infinity_gauntlet_db_user:...@dpg-...oregon-postgres.render.com:5432/infinity_gauntlet_db?sslmode=require"
    .\tools\pgsql17\pgsql\bin\pg_restore.exe `
       --clean --if-exists --no-owner --no-privileges --no-acl `
       --dbname "$Env:DATABASE_URL" `
       -v db_primary_snapshot.bak
    ```
    Render now holds the latest data snapshot. Remove `PGSSLMODE` afterwards if you set it manually.

4. **Record the refresh.** Log the run in `Tasklist.md` (include dump timestamp + operator). If the job fails, capture the error and retry before any schema drift accumulates.

## 7. Failover playbook
- Keep a copy of both connection strings in Render secrets. Switching the runtime from Accelerate to Render is a matter of updating `DATABASE_URL`/`DATABASE_DIRECT_URL` for each service and redeploying.
- Document the change in `ops/RECOVERY.yaml` when you fail over—include who approved the flip, what data snapshot was last applied, and the target rollback command.
- Once Accelerate recovers, repeat Section 6 to repopulate the standby, then flip services back to the primary endpoint.

## Incident notes
- If the tunnel refuses connections, re-run `pwsh .\scripts\restore_prisma_postgres.ps1` after verifying no other process holds port 5433.
- The script emits warnings if `DATABASE_URL` is missing or not Prisma formatted—treat them as blockers.
- For large datasets, consider raising the script timeout (`-Port` + bump inside script) or running from a more stable network.
