# AI Environment Setup
Last Updated (UTC): 2025-11-02T08:05:00Z

Purpose: ensure automated agents and local operators load secrets from a secure location without copying sensitive data into the repository.

## Overview
- `src/config/env.js` now checks `IG_ENV_FILE` and `DOTENV_CONFIG_PATH` before reading `.env` from the repo root.
- `scripts/setup_ai_env.ps1` sets or persists `IG_ENV_FILE` so headless runs (hotfix agents, nightly automation) access the correct secret store.
- Use `secrets/Infinity-Gauntlet.env` as the **single consolidated environment file** for all local development and testing. This file contains all required keys: BOT_TOKEN, DATABASE_URL (Prisma Accelerate), RENDER_DB_EXTERNAL_URL (direct PostgreSQL external), RENDER_DB_INTERNAL_URL (direct PostgreSQL internal), DATABASE_LOCAL_URL (local workstation), OPTIMIZE_API_KEY, and POKEMON_BOT_TOKEN. **No other key files are needed.**
- When `NODE_ENV=production`, the repo `.env` fallback is skipped unless `IG_ALLOW_REPO_ENV=1` is set.

## Environment key reference
Render services and local operators rely on the same variable names. Use the tables below to double-check spelling before adding secrets to Render dashboards or external `.env` files. Keys marked "Render" apply to every service unless otherwise noted.

### Database & Prisma
| Key | Where to set | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Local `.env`, Render | Prisma Accelerate proxy for production queries. |
| `RENDER_DB_INTERNAL_URL` | Local `.env`, Render | Direct Postgres (Render internal network) for migrations. |
| `RENDER_DB_EXTERNAL_URL` | Local `.env` | Direct Postgres (external access from laptop) for development. |
| `DATABASE_LOCAL_URL` | Local `.env` | Local workstation PostgreSQL for low-latency gameplay. |
| `PRISMA_ACCELERATE_RUNTIME` | Render | Set to `serverless` when a service talks to Accelerate. |
| `PRISMA_CLIENT_ENGINE_TYPE` | Local `.env` (optional) | Leave blank for direct drivers; set to `dataproxy` only when forcing Accelerate locally. |
| `OPTIMIZE_API_KEY` | Local `.env`, Render | Prisma Accelerate API key (do not commit the value). |
| `IG_ENV_FILE` | Local machines only | Absolute path to the secure env file that should be loaded. |
| `IG_ALLOW_REPO_ENV` | Local `.env` (rare) | Opt-in override allowing the repo `.env` in production contexts. |

### Discord & security secrets
| Key | Where to set | Notes |
| --- | --- | --- |
| `POKEMON_BOT_TOKEN` | Local `.env`, Render (`infinity-gauntlet-bots`) | Primary Discord bot token. |
| `SECURITY_BOT_TOKEN` | Local `.env`, Render (security + bots workers) | Legacy security bot token. |
| `BOT_TOKEN` | Local `.env` (fallback) | Compatibility fallback for legacy tooling. |
| `DISCORD_CLIENT_ID` | Local `.env` | Required for slash command registration. |
| `DISCORD_GUILD_ID` | Local `.env` (optional) | Limits slash command sync to a single guild. |
| `ROLE_ID` | Local `.env`, Render (security worker) | Explicit role target when known. |
| `ROLE_NAME` | Local `.env`, Render (security worker) | Human-readable role fallback. |
| `ALERT_WEBHOOK_URL` | Local `.env`, Render (security worker) | Webhook endpoint for security alerts. |
| `ALERT_CHANNEL_ID` | Local `.env`, Render (security worker) | Discord channel to receive alerts. |
| `ALERT_USER_ID` | Local `.env`, Render (security worker) | Direct mention target for escalations. |

### Permission policy toggles
| Key | Where to set | Notes |
| --- | --- | --- |
| `ROLE_PERMISSION_POLICY` | Local `.env` | Sets the security bot enforcement mode (`standard` or `snapshot`). |
| `ROLE_PERMISSION_SNAPSHOT_UPDATE` | Local `.env` | Allows the bot to refresh stored snapshots. |
| `ROLE_PERMISSIONS_AUDIT` | Local `.env` | Enables periodic permission audits. |
| `ROLE_PERMISSIONS_REMEDIATE` | Local `.env` | Allows the bot to remediate drift automatically. |

### Runtime feature toggles
| Key | Where to set | Notes |
| --- | --- | --- |
| `ENABLE_POKEMON_BOT` | Local `.env`, Render (`infinity-gauntlet-bots`) | Enables the Pokémon bot in the unified worker. |
| `ENABLE_SECURITY_BOT` | Local `.env`, Render (security + bots workers) | Toggles the security bot worker paths. |
| `ENABLE_CONTINUOUS_SWEEP` | Render (security worker) | Keeps continuous sweep logic active. |
| `DISABLE_SNAPSHOT_PRECHECK` | Render (bots + security) | Bypasses snapshot preflight checks when set. |
| `BATTLE_CHANNEL_NAME` | Render (`infinity-gauntlet-bots`) | Public battle arena channel name. |
| `CLI_DEBUG_MODE` | Local `.env` | Expands CLI logging for local diagnostics. |
| `NODE_ENV` | Render | Always `production` in hosted services. |
| `SERVICE_NAME` | Render | Service identifier used in structured logs. |
| `LOG_FORMAT` | Local `.env`, Render | Controls CLI vs JSON logging. |

### Operations cadence & cooldowns
| Key | Where to set | Notes |
| --- | --- | --- |
| `BACKFILL_CONCURRENCY` | Local `.env` | Max parallel remediation tasks. |
| `BACKFILL_DELAY_MS` | Local `.env` | Delay between remediation batches. |
| `BACKFILL_INTERVAL_SECONDS` | Local `.env` | Interval for remediation loop. |
| `ROLE_REMEDIATION_INTERVAL_SECONDS` | Local `.env` | Security bot remediation cadence. |
| `CACHE_TTL_HOURS` | Local `.env` | Cache expiry for DM home helpers. |
| `OPS_REPORT_INTERVAL_SECONDS` | Local `.env` | Frequency of ops status reports. |
| `OUTBOX_MIN_DELAY_MS` | Render (`infinity-gauntlet-outbox`) | Shortest delay between outbox polls. |
| `OUTBOX_MAX_DELAY_MS` | Render (`infinity-gauntlet-outbox`) | Longest delay between outbox polls. |
| `OUTBOX_HEALTH_INTERVAL` | Render (`infinity-gauntlet-outbox`) | Interval for outbox health logging. |
| `OUTBOX_BATCH_SIZE` | Render (`infinity-gauntlet-outbox`) | Max records processed per poll. |
| `DATA_PIPELINE_INTERVAL_MS` | Render (`infinity-gauntlet-data-pipeline`) | Base interval between data pipeline runs. |
| `DATA_PIPELINE_INTERVAL_JITTER_MS` | Render (`infinity-gauntlet-data-pipeline`) | Jitter added to pipeline cadence. |
| `DATA_PIPELINE_RUN_ON_BOOT` | Render (`infinity-gauntlet-data-pipeline`) | Whether the pipeline fires immediately on start. |
| `CACHE_WORKER_INTERVAL_MS` | Render (`infinity-gauntlet-cache`) | Cache refresh base interval. |
| `CACHE_WORKER_INTERVAL_JITTER_MS` | Render (`infinity-gauntlet-cache`) | Cache refresh jitter. |
| `POKE_REFRESH_CRON` | Local `.env`, Render (cache worker + cron) | Cron schedule for Pokédex refresh jobs. |
| `POKE_REFRESH_TZ` | Local `.env`, Render (cache worker) | Timezone for cron parsing. |
| `POKE_RUN_JOB_ON_BOOT` | Render (`pokedex-cache-worker`) | Triggers immediate cache refresh at startup. |
| `POKE_REFRESH_JOB_COMMAND` | Render (`pokedex-cache-worker`) | Command executed by the scheduled job. |

### Discord reporting & DM schedules
| Key | Where to set | Notes |
| --- | --- | --- |
| `STANDARD_ENFORCE_ALL` | Local `.env` | Forces standard permissions policy. |
| `UNLISTED_PERMISSIONS` | Local `.env` | Whitelisted permissions outside the standard set. |
| `STANDARD_EXEMPT_ROLES` | Local `.env` | Roles exempt from automatic enforcement. |
| `STANDARD_ALL_PERMS_ROLES` | Local `.env` | Roles that retain full permissions. |
| `RESTART_DM_RECIPIENT` | Local `.env` | DM target for restart notifications. |
| `SUMMARY_REPORT_RECIPIENT` | Local `.env` | Daily summary DM target. |
| `SUMMARY_REPORT_HOUR` | Local `.env` | Hour (0-23) for summary DM. |
| `SUMMARY_REPORT_MINUTE` | Local `.env` | Minute (0-59) for summary DM. |
| `DRIP_ALERT_RECIPIENT` | Local `.env` | DM target for drip alerts. |
| `DRIP_ALERT_HOUR` | Local `.env` | Hour (0-23) for drip alerts. |
| `DRIP_ALERT_MINUTE` | Local `.env` | Minute (0-59) for drip alerts. |
| `DRIP_ALERT_TIMEZONE` | Local `.env` | Timezone for drip alert scheduling. |

### GitHub, Render API, and cache jobs
| Key | Where to set | Notes |
| --- | --- | --- |
| `POKE_RENDER_SERVICE_ID` | Local `.env` | Optional Render service reference for cache jobs. |
| `GITHUB_REPO` | Render (`pokedex-cache-worker`, cron) | Repository URL that cache workers sync from. |
| `GITHUB_BRANCH` | Render (`pokedex-cache-worker`, cron) | Feature branch with cache artifacts. |
| `GITHUB_BASE_BRANCH` | Render (`pokedex-cache-worker`, cron) | Base branch to diff against. |
| `GITHUB_RAW_URL` | Render (`pokedex-cache-worker`) | Raw content base for cache fetches. |
| `GITHUB_TOKEN` | Local `.env`, Render (cache worker + cron) | Token for GitHub API access. |
| `CACHE_DIR` | Render (`pokedex-cache-worker`, cron) | Filesystem location for cached data. |
| `POKE_CONCURRENCY` | Render (`pokedex-cache-worker`) | Concurrent HTTP requests during refresh. |
| `POKE_TIMEOUT_MS` | Render (`pokedex-cache-worker`) | HTTP timeout for refresh jobs. |
| `RENDER_API_KEY` | Local `.env`, Render (`pokedex-cache-worker`) | Render API token used for cache invalidation. |

Review `secrets/Infinity-Gauntlet.env` and `render.yaml` whenever new services or workflows launch; update the consolidated env file with any new required keys.

## Quick Start
1. Ensure `secrets/Infinity-Gauntlet.env` exists with all required keys populated (BOT_TOKEN, DATABASE_URL, RENDER_DB_EXTERNAL_URL, RENDER_DB_INTERNAL_URL, DATABASE_LOCAL_URL, OPTIMIZE_API_KEY, POKEMON_BOT_TOKEN). This is the **single consolidated environment file** for all local development.
2. Open a PowerShell session and set `IG_ENV_FILE`:
   ```powershell
   pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist
   ```
   - Omit `-Persist` to scope the setting to the current shell only.
3. Restart terminals or VS Code so new sessions inherit `IG_ENV_FILE`.
4. Confirm the override is active and reachable:
   ```powershell
   dotenv info
   echo $Env:IG_ENV_FILE
   Get-Content secrets/Infinity-Gauntlet.env | Select-Object -First 5
   ```
5. Run database checks via the control suite once secrets load:
   ```powershell
   npm run db:cli -- status
   ```
6. When switching between Accelerate and direct PostgreSQL URLs, run `npx prisma generate` to regenerate the client with the correct driver configuration.

### Using WSL for database maintenance

- Keep the repo cloned at the Windows path (`C:/Users/sherb/OneDrive/Documents/GitHub/Infinity-Gauntlet`) and invoke commands through WSL with the mirrored `/mnt/c` path.
- Source Windows secrets inside Bash by stripping carriage returns: `source <(sed "s/\r$//" /mnt/c/Users/sherb/OneDrive/Documents/GitHub/Infinity-Gauntlet/secrets/Infinity-Gauntlet.env)`.
- Export direct and Accelerate URLs explicitly before running Prisma commands:
   ```bash
   export DATABASE_URL                        # Accelerate runtime
   export RENDER_DB_EXTERNAL_URL              # Direct PostgreSQL external
   export RENDER_DB_INTERNAL_URL              # Direct PostgreSQL internal (Render)
   export DATABASE_LOCAL_URL                  # Local workstation
   ```
- Run `npm ci` once per platform. After cloning or updating lockfiles, execute `npm ci` in WSL (rebuilds Linux-native binaries such as Prisma engines) and again in PowerShell so Windows tooling stays in sync.
- When switching back to PowerShell, re-confirm `IG_ENV_FILE` via `echo $Env:IG_ENV_FILE` and regenerate the Prisma client if you swapped between Accelerate and direct connections.

## Agent Run Checklist
- Before invoking planner/implementer agents, verify `IG_ENV_FILE` resolves to `secrets/Infinity-Gauntlet.env`.
- For CI or automation workers, set the variable in the job configuration rather than persisting on the host.
- Never commit `secrets/Infinity-Gauntlet.env` or copy its contents into tracked files.
- When swapping between Accelerate and direct PostgreSQL, run `npx prisma generate` once to rebuild the client with the correct driver.
- Before promoting dex changes, run `npm run guard:auto-sync` to verify the env file and `data/cache/dex-sync-trigger.json` are reachable; rerun `node scripts/fetch_pokemon.mjs` if the guard reports a missing trigger.
- Confirm `ALERT_WEBHOOK_URL` (and overrides passed via CLI) before enabling auto-sync so integrity alerts reach the operations channel; use `--alert-webhook <url>` for rehearsals that need alternate destinations.
- For database inspections, prefer the structured interface in `npm run db:cli` (documented in `docs/db-control-suite.md`).

## Troubleshooting
- **`Environment file was not found`**: pass the correct path via `-EnvFile` or create the file at the expected location.
- **Secrets not loading**: run `Get-ChildItem Env: | Where-Object { $_.Name -eq 'IG_ENV_FILE' }` to confirm the variable is present, then restart the process that consumes it.
- **Persisted value not used**: `setx` updates registry-backed environment variables; sign out/in or restart shell hosts to pick up the change.
- **`Error validating datasource 'db': the URL must start with the protocol prisma://`**: the local Prisma client was generated while pointing at Accelerate. Run `npx prisma generate` after switching `IG_ENV_FILE` back to the Dev secrets file, then retry the command.
