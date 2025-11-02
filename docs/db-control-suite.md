# Database Control Suite *(Muted — Local Only)*
Last Updated (UTC): 2025-11-02T08:05:00Z

Purpose: provide a single entry point for routine database inspections, counts, and ad-hoc queries while honoring secure environment loading (`IG_ENV_FILE`). Intended for local operators only; do not run in CI or production.

## Prerequisites
- Ensure secrets live outside the repo. This workstation keeps the direct credentials in `C:/Users/sherb/OneDrive/Documents/Key/Dev/.env` and the Accelerate proxy credentials in `C:/Users/sherb/OneDrive/Documents/Key/Prod/.env`.
- Point `IG_ENV_FILE` at the file you need (usually `Key/Dev/.env` for dev DB access) via `pwsh -File scripts/setup_ai_env.ps1 -EnvFile "C:/Users/sherb/OneDrive/Documents/Key/Dev/.env" -Persist` before running any commands.
- Swap to Accelerate when required by re-running the helper with `Key/Prod/.env`. Keep only one target active at a time, and after returning from Prod run `npx prisma generate` once so Prisma stops expecting the Accelerate data proxy.
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
- `npm run db:seed:dex` is the canonical bootstrap. It fetches live PokeAPI data, repopulates species/moves/abilities/learnsets, rebuilds the type chart, and refreshes `SpeciesSheet`. Use `POKEAPI_SEED_CONCURRENCY` to throttle (default 4). Add `--dry-run` to preview counts without writing.
- `npm run db:auto-sync` runs the full Dev → Prod → Dev migrate + seed cadence when the service boots, then every 5 minutes if drift is detected. Use `--once` for a single pass, `--dry-run` to log the plan, `--interval <ms>` to tune cadence, `--skip-startup` to bypass the initial consolidation, `--ci` for guard runs, `--alert-webhook <url>` to override `ALERT_WEBHOOK_URL`, `--no-alerts` to disable notifications during rehearsals, and `--simulate-alert` to send a sample webhook without touching databases. Logs appear as JSON (`sync.consolidate.*`, `integrity.*`, `integrity.alert`); webhook embeds fire when drift persists after consolidation.
- `npm run guard:auto-sync` performs a `--ci --dry-run` check that verifies both env files and `data/cache/dex-sync-trigger.json` exist. The guard fails fast when secrets are missing or the trigger metadata is absent—fix the path or rerun `node scripts/fetch_pokemon.mjs` before proceeding.
- `node scripts/fetch_pokemon.mjs` still refreshes the local JSON cache if you need offline data snapshots; the seeder can read cached responses automatically on subsequent runs.
- `npm run db:cli -- status` after a seed should show >1,000 species with non-empty learnsets; capture the output in Tasklist or Prompt notes for auditing.
- When bootstrapping from scratch follow `ops/DB_BOOTSTRAP.md`: migrations → set `IG_ENV_FILE` → `npm run db:seed:dex` → `npm run db:cli -- status`.
- Maintain the Dev → Prod → Dev loop: run each command with `Key/Dev/.env`, swap to `Key/Prod/.env` to repeat it (or use `scripts/ops/run_dex_migrations.ps1`, which now validates direct URLs, for migrations), then switch back to `Key/Dev/.env` and run `npx prisma generate` before continuing local work.

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
