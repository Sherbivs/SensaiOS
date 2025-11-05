# DB Tooling Evidence — 2025-11-04
Captured by: GitHub Copilot agent

## Accelerate / Prod Proxy (IG_ENV_FILE=`Key/Prod/.env`)

- `npm run db:cli -- status`
  - Resolved datasource: `accelerate postgres://***@accelerate.prisma-data.net`
  - Sample counts: `Species records: 1025`, `User records: 0`
- `npm run db:cli -- counts`
  - Species `1025`, Pokemon Instances `0`, Users `0`, Encounters `0`, Battles `0`
- `npm run db:cli -- query 'SELECT 1 as ok;'`
  - Result table: `[ { ok: 1 } ]`
- `npm run db:smoke -- --mode=accelerate`
  - Smoke result: `[ { ok: 1 } ]`

## Direct Render Postgres (IG_ENV_FILE=`Key/Dev/.env`)

- `npm run db:cli -- status`
  - Resolved datasource: `direct postgresql://***@dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com`
  - Sample counts: `Species records: 0`, `User records: 0`
- `npm run db:cli -- counts`
  - Species `0`, Pokemon Instances `0`, Users `0`, Encounters `0`, Battles `0`
- `npm run db:cli -- query 'SELECT 1 as ok;'`
  - Result table: `[ { ok: 1 } ]`
- `npm run db:smoke`
  - Smoke result: `[ { ok: 1 } ]`

> All outputs sanitized to mask credentials. Raw logs available in terminal history for the 2025-11-04 agent run.

## 2025-11-04T17:56Z — Bootstrap Guardrail Validation (Dev Sandbox)

- `npx prisma migrate deploy`
  - Outcome: `No pending migrations to apply.` (dev schema already aligned after prefs default + inventory check constraint).
- `npm run db:smoke`
  - Direct datasource: `postgresql://***@dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com`; result `[ { ok: 1 } ]`.
- `npm run db:smoke -- --mode=accelerate`
  - Accelerate datasource: `postgres://***@accelerate.prisma-data.net`; result `[ { ok: 1 } ]`.

> Sanitized summaries confirm the new constraint/default deploy cleanly across direct and Accelerate paths.
