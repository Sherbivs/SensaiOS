## Database workflow: Direct vs. Accelerate (short guide)

This document describes the minimal, safe steps to run the repository DB tooling in either
Direct Postgres mode (a direct DB URL) or Accelerate/pooled mode (the Prisma/Accelerate proxy).

Files referenced
- `scripts/db_admin.ts` — CLI: `status`, `counts`, `query`.
- `scripts/db_smoke.ts` — lightweight smoke test that uses pg for direct mode and Prisma for Accelerate.

Principles
- Do not commit secrets. Use an external secrets file and set `IG_ENV_FILE` to point to it (see repo README and `AGENTS.md`).
- The tooling auto-detects which datasource to use and picks the appropriate client (Prisma/Accelerate vs. pg/SSL).

Quick commands (PowerShell / pwsh)
1) Point tooling at the chosen secrets file (example paths used by this project):

```powershell
# For dev (direct):
$Env:IG_ENV_FILE = 'C:/Users/sherb/OneDrive/Documents/Key/Dev/.env'

# For accelerate/pooled (production-like):
$Env:IG_ENV_FILE = 'C:/Users/sherb/OneDrive/Documents/Key/Prod/.env'
```

2) Run the status check (shows resolved datasource and sample counts):

```powershell
npm run db:cli -- status
```

3) Run table counts (safe, read-only):

```powershell
npm run db:cli -- counts
```

4) Run a raw query (example):

```powershell
npm run db:cli -- query "SELECT 1 as ok;"
```

5) Run the smoke test (scripts/db_smoke.ts) — quick connectivity test that uses `pg` for direct:

```powershell
npm run db:smoke                      # auto-select direct vs. accelerate
npm run db:smoke -- --mode=direct     # force direct Postgres client
npm run db:smoke -- --mode=accelerate # force Prisma Accelerate
```

Expected outcomes
- `status` should print a small header naming the resolved datasource and show sample counts. Example output
  - "Resolved datasource: direct postgresql://***@host..."  or  "Resolved datasource: accelerate prisma://..."
- `counts` should print counts for the main tables (Species, Users, Battles, etc.).
- `query 'SELECT 1 as ok;'` should print a single row with `ok = 1`.
- `db:smoke` should return a small success JSON/printout such as `{ ok: 1 }` when connectivity is healthy.
- When both datasources exist, `db:smoke` defaults to direct; use `--mode=accelerate` (or `DB_SMOKE_MODE=accelerate`) to verify the pooled/Prisma path.

Troubleshooting
- If `status` or any command errors with "URL must start with prisma://" it means the codepath still tried Prisma against a direct URL. The repo tooling includes a fallback that uses `pg` for direct URLs. Make sure:
  - `IG_ENV_FILE` points to the secrets file that contains `DATABASE_DIRECT_URL` or `DATABASE_URL`.
  - You exported the env var correctly in the same shell where you run `npm`.
- TLS/SSL:
  - Direct Postgres connections (e.g., Render-hosted DB) typically require SSL. The scripts configure the `pg` client to use SSL by default for direct mode.

Notes on parity
- The repo intentionally uses two clients depending on mode:
  - Accelerate: Prisma client configured to talk to the pooled proxy.
  - Direct: `pg` client for raw SQL (status/counts/queries) with SSL configured.
- Results should be equivalent for read-only checks. If you see different counts, confirm you're pointing at the same database (direct vs pooled may map to different DBs/environments).

What to record for an audit/Tasklist entry
- The `IG_ENV_FILE` path used (do not paste the file contents).
- The exact commands run and their timestamped outputs (copy output into Tasklist.md or a run artifact file).

Next steps after parity
- If outputs match: update `Tasklist.md` to mark DB.V0.BOOTSTRAP progress and save command outputs.
- If outputs differ or errors persist: capture the failing command output, the `IG_ENV_FILE` path and contact a DBA or check the `Key/Prod/.env` values for mismatched host/DB names.

— end
