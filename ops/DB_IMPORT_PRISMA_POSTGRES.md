# Prisma Postgres Import Runbook

Use this runbook when migrating data from the Render PostgreSQL cluster into Prisma Postgres (Accelerate-backed) for dev/test parity. The flow captures the current production/staging schema, pushes it through Prisma's TCP tunnel, and verifies the new target.

## Prerequisites
- Run commands from the canonical checkout: `C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet`.
- Ensure `node_modules` is installed (for `npx`).
- Install PostgreSQL 17 client binaries under `tools/pgsql17/pgsql/bin` (see `tools/postgresql17.zip`).
- Export credentials safely. Do **not** commit `.env` changes with live secrets.

## 1. Export source database
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

## Incident notes
- If the tunnel refuses connections, re-run `pwsh .\scripts\restore_prisma_postgres.ps1` after verifying no other process holds port 5433.
- The script emits warnings if `DATABASE_URL` is missing or not Prisma formatted—treat them as blockers.
- For large datasets, consider raising the script timeout (`-Port` + bump inside script) or running from a more stable network.
