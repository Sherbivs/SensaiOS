# Database Control Suite *(Muted — Local Only)*
Last Updated (UTC): 2025-10-30T03:50:00Z

Purpose: provide a single entry point for routine database inspections, counts, and ad-hoc queries while honoring secure environment loading (`IG_ENV_FILE`). Intended for local operators only; do not run in CI or production.

## Prerequisites
- Ensure secrets live outside the repo. This workstation keeps `prisma-dev.env` (Render/DEV direct URLs) and `prisma-accelerate.env` (Accelerate proxy) under `C:/Users/sherb/OneDrive/Documents/Key/`.
- Point `IG_ENV_FILE` at the file you need (usually `prisma-dev.env` for dev DB access) via `pwsh -File scripts/setup_ai_env.ps1 -EnvFile "C:/Users/sherb/OneDrive/Documents/Key/prisma-dev.env" -Persist` before running any commands.
- Swap to Accelerate when required by re-running the helper with `prisma-accelerate.env`. Keep only one target active at a time.
- Verify the override with `echo $Env:IG_ENV_FILE`; the suite refuses to fall back to the repo `.env` in production contexts.
- Apply schema migrations before querying: `npx prisma migrate deploy` (or `npm run prisma:migrate` if you keep a script) against your dev database so tables such as `BusMessage`, `PokemonInstance`, and `Species` exist. The suite assumes the full Prisma schema is present.

## Entry Point

Use the npm script wrapper to run the suite:

```powershell
npm run db:cli -- <command> [options]
```

The runner loads environment variables in the following order:
1. `IG_ENV_FILE`
2. `DOTENV_CONFIG_PATH`
3. Repository `.env` (only when `NODE_ENV` is not `production`, or `IG_ALLOW_REPO_ENV=1`).

## Commands

| Command | Description | Example |
| --- | --- | --- |
| `status` | Prints active connection metadata and sample counts (Species, User). | `npm run db:cli -- status` |
| `counts` | Displays counts for common tables (Species, PokemonInstance, User, Encounter, BusMessage, Battle). | `npm run db:cli -- counts` |
| `count <Model>` | Returns a count for the specified Prisma model (case-sensitive). | `npm run db:cli -- count Species` |
| `query <SQL>` | Executes a raw SQL statement. Prefer read-only queries. | `npm run db:cli -- query "SELECT NOW();"` |
| `help` | Shows usage instructions. | `npm run db:cli -- help` |

### Options

| Option | Applies To | Description |
| --- | --- | --- |
| `--json` | `query` | Return JSON output instead of tables. |
| `--table=<Model>` | `count` | Alternate argument style, e.g., `--table=User`. |
| `--sql="..."` | `query` | Supply SQL without quoting positional args. |

## Safety Notes

- Production environments skip the repository `.env` by default; persist `IG_ENV_FILE` to a secure path (see `docs/ai-env-setup.md`).
- The `query` command uses `prisma.$queryRawUnsafe`; restrict writes to trusted operators and prefer read-only analytics.
- Results include BigInt counts; they are converted to strings before printing to avoid serialization issues.
- If `counts` or `status` complain about missing tables (e.g., `BusMessage`), run `npx prisma migrate deploy` and then rerun the data loaders below to hydrate reference data.

## Hydrating Reference Data
- `node scripts/refresh_cache.mjs` (or `npm run data:build`) rebuilds cached dex manifests locally.
- `node scripts/fetch_pokemon.mjs` pulls the upstream Pokédex JSON used by the loaders.
- `npm run db:cli -- status` after running the loaders should show hundreds of species, moves, and abilities instead of the 21-row stub that ships in blank databases.
- For a one-shot bootstrap, follow the `ops/DB_BOOTSTRAP.md` runbook: migrations → `scripts/dex/seed_reference.ts` → `scripts/dex/backfill_species.ts` → `scripts/dex/warm_cache.ts`.

## Examples

```powershell
# Show connection metadata and sample counts
npm run db:cli -- status

# Check how many encounters exist
npm run db:cli -- count Encounter

# Run a custom query with JSON output
npm run db:cli -- query --sql="SELECT topic, COUNT(*) FROM \"BusMessage\" GROUP BY topic" --json
```

Document any production queries (command, timestamp, purpose) in `Tasklist.md` after execution.
