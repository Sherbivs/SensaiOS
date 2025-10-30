# Database Control Suite
Last Updated (UTC): 2025-10-29T22:15:00Z

Purpose: provide a single entry point for routine database inspections, counts, and ad-hoc queries while honoring secure environment loading (`IG_ENV_FILE`).

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
