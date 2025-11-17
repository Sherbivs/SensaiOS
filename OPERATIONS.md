# OPERATIONS

_Last updated: 2025-11-14T13:30:00Z (UTC) — Rev: 1.6_

**Purpose**: Service matrix, rollout checklist, observability, incident recovery for production deployment.

**Cross-References**:
- See `operations-bible/01-service-matrix.md` for comprehensive worker architecture, scaling roadmap (Phase 10+), monitoring, cost optimization
- See `operations-bible/02-database-operations.md` for schema, role, helper context
- See `architecture-bible/08-database-architecture.md` for query optimization, alerting thresholds, performance metrics
- See `docs/event-tracking-schema.md` for event tracking patterns
- See `AGENTS.md` for router navigation, database URL selection
- See `ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md` for deployment procedures
- See `render.yaml` for service definitions

**Referenced By**: README.md (operations reference), AGENTS.md (Production & Render Notes), ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md (service validation)

## Service Matrix
| Render Service | Purpose | Entry Command | Key Env Flags | Health Signals |
| --- | --- | --- | --- | --- |
| `infinity-gauntlet` (worker) | Main Discord bot (Pokémon battles, DM features, slash commands). Runs compiled TypeScript from dist/. | `npm start` (→ `node dist/index.js`) | `DATABASE_URL`, `ENABLE_SECURITY_BOT=false`, `ENABLE_POKEMON_BOT=true` | CLI dashboard (`discord` + `database` sections), structured logs tagged `runtime.*`. |
| `infinity-gauntlet-security` (worker) | Dedicated security bot (role sweeps, DRIP alerts). | `node security-bot.js` | `ENABLE_SECURITY_BOT=true`, `ENABLE_CONTINUOUS_SWEEP=true`, alert tokens. | CLI security section, `worker.outbox.*`, `security.*`, DRIP alert receipts. |
| `infinity-gauntlet-outbox` (worker) | Drains `BusMessage` events and uploads payloads to durable storage. | `node dist/worker/outbox.js` | `OUTBOX_MIN/MAX_DELAY_MS`, `OUTBOX_BATCH_SIZE`, `BACKUP_STORAGE_PROVIDER`, `BACKUP_STORAGE_S3_BUCKET`, `BACKUP_STORAGE_S3_REGION`. | `worker.outbox.health`, cache entries `outbox:last-*`, `backupProvider` field. |
| `infinity-gauntlet-cache` (worker) | Refreshes Pokédex cache on a fixed cadence. | `node dist/worker/cache-refresh.js` | `CACHE_WORKER_INTERVAL_MS`, `CACHE_WORKER_INTERVAL_JITTER_MS`. | `worker.cache.health`, cache metadata timestamps. |
| `infinity-gauntlet-data-pipeline` (worker) | Rebuilds reference data manifests and pushes to `/data`. | `node dist/worker/data-pipeline.js` | `DATA_PIPELINE_INTERVAL_MS`, `DATA_PIPELINE_RUN_ON_BOOT`. | `worker.pipeline.health`, manifest version logs. |
| `pokedex-cache-worker` (worker + disk) | Git-backed cache refresher with persistent disk. | `node scripts/worker.mjs` | Render disk mounts, Git credentials, schedule vars. | Render cron telemetry, job logs. |

**For comprehensive worker architecture, scaling roadmap, and Phase 10+ opportunities, see `docs/workers.md`.**

## Rollout Checklist
1. Confirm pooled and direct database URLs resolve in Render dashboard for every service (pooled for runtime, direct for Prisma migrate).
2. Deploy `infinity-gauntlet-security` first so ENABLE_CONTINUOUS_SWEEP traffic moves off the main bot worker.
3. Once security worker healthy, redeploy the main bot worker (`infinity-gauntlet`) with `ENABLE_SECURITY_BOT=false` to prevent duplicate sweeps.
4. Tail `worker.outbox.health` and `worker.cache.health` logs to ensure cadence and pending counts stabilize (<5 minutes to first signal).
5. Run `/ops stats`, DM Home history, and cooldown flows after redeploy to ensure query plans leverage the new indexes.

## Incident & Recovery Notes
- If security sweeps lag, toggle `ENABLE_CONTINUOUS_SWEEP` back on for the main bot worker as a temporary bridge; redeploy once dedicated worker recovers.
- Event bus worker failures enqueue `worker.crash` messages; `/ops stats` surfaces crash telemetry—investigate before re-enabling drains.
- Cache/data workers can be paused by setting the interval env vars to `0`; resumes require redeploy with the previous cadence.
- When migrations add new worker files, run `npm run docs:update-routers` so ops/ROUTER_INDEX.yaml and masterroutetable.md stay authoritative.

## Disk Monitoring & Maintenance
**Production Storage:** The security bot worker has a 1GB persistent disk mounted at `/Store` (defined in `render.yaml`), used primarily for security-bot-state persistence with 7-day snapshot retention.

**SSH Monitoring Commands:**
```bash
# Check disk usage summary
df -h /Store

# Breakdown by directory
du -sh /Store/*

# Security bot state inspection (most active directory)
du -sh /Store/security-bot-state/*
ls -lah /Store/security-bot-state/snapshots/ | wc -l  # Count snapshots (expect ~168 for 7 days hourly)

# Historical growth analysis (requires multiple samples)
date; du -sh /Store; sleep 3600; date; du -sh /Store  # 1-hour delta
```

**Thresholds & Alerts:**
- **>50% disk usage** (>500MB): Review snapshot retention, check for log file accumulation, verify cleanup automation
- **>100MB/day growth rate**: Indicates retention policy failure or unexpected file creation; investigate new files with `find /Store -type f -mtime -1 -ls`
- **Disk full (>95%)**: Emergency response required - manually prune old snapshots (`rm /Store/security-bot-state/snapshots/*.json` for files >7 days), check for abandoned temp files

**Expected Baseline (Nov 2025):**
- Total disk usage: 4.7MB of 974MB (0.5%)
- Security-bot-state: ~164 snapshot files for 7-day retention (hourly saves)
- Growth rate: ~20-30KB/hour (new snapshots), stable after retention pruning

**Maintenance Automation:**
- Security bot auto-prunes snapshots older than 7 days on startup and during state saves
- No manual intervention required for normal operations
- Document anomalies in Tasklist.md when investigating disk alerts

See `operations-bible/03-deployment-procedures.md` for comprehensive SSH setup, disk investigation procedures, and troubleshooting.

## Observability (Live)
- `worker.metrics.snapshot` logs now emit every 60s with gauges/counters; `worker.alert.*` entries fire on threshold breaches and consecutive failures (warn at 3, error at 5).
- **Event bus worker:** `queue.depth` gauge warns ≥50, alerts ≥200 pending messages. Investigate Render DB health and backlog before 100; alert requires paging ops + Sherbivs, consider scaling the worker or pausing enqueueing flows (`/ops stats` → queue section).
- **Cache refresh:** `cache.stale_seconds` warns when data is >10 minutes old, alerts past 30 minutes. Check network/API health, rerun `npm run worker:cache` locally, and confirm cache targets in `/ops stats`.
- **Data pipeline:** `pipeline.stale_seconds` warns after 4 hours with no success, alerts after 8 hours. Review `runWorker` logs, ensure buildData completes, and redeploy if failures persist.
- Telemetry counters (`refresh.failed`, `pipeline.failed`, `messages.failed`) surface in metrics payloads; triage repeated failures alongside the alert logs and record outcomes in Tasklist/Prompt when they trigger.
- **Memory safety:** All runtime structures now bounded (writeQueue 10K cap, Discord.js cache sweepers, ops error queue 100 cap). Peak RAM stable at ~300-350 MB (15-17% of 2 GB limit, Standard plan). Monitor for OOM alerts; unbounded growth fixed Nov 2025.
- **State persistence:** Security bot state persists to `/Store/security-bot-state/` with 7-day hourly metrics history, surviving restarts/deploys. Monitor `restartNumber` in logs; failures indicate disk mount issues.
- **Restart frequency:** Normal production activity generates 3-4 restarts/day during active development (deployments, config changes, health checks). The security bot tracks cumulative restart count in persistent state. SSH investigation (Nov 2025) found 164 restarts over 5 days = 33 restarts/day average, which included intensive development cycles. To monitor restart patterns, use SSH commands:
  ```bash
  # View security-bot-state snapshots to count restarts
  ls -lah /Store/security-bot-state/snapshots/ | wc -l
  
  # Check state persistence (current.json shows restart count)
  cat /Store/security-bot-state/current.json | grep restartNumber
  
  # Monitor restart rate (snapshots created on each restart)
  ls -lt /Store/security-bot-state/snapshots/ | head -20
  ```
  **Thresholds for investigation:** >10 restarts/hour sustained over 4+ hours (indicates crash loop), restart count regressing to 0 (state persistence failure, disk mount issue).
- For deeper schema, role, and helper context, see `operations-bible/02-database-operations.md`.

### Durable Event Bus Sink
- **Providers:** Set `BACKUP_STORAGE_PROVIDER` to `s3` (Render/production) or `local` (developer dry runs). Leaving it unset defaults to `none`, which logs a warning and skips uploads—use only for emergency disablement.
- **S3/R2:** Provide `BACKUP_STORAGE_S3_BUCKET`, `BACKUP_STORAGE_S3_REGION`, and optional `BACKUP_STORAGE_S3_ENDPOINT` / `BACKUP_STORAGE_S3_FORCE_PATH_STYLE=true` for Cloudflare R2-style APIs. Credentials flow through standard AWS environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, etc.).
- **Local fallback:** For local validation, set `BACKUP_STORAGE_PROVIDER=local` and optionally `BACKUP_STORAGE_LOCAL_DIR` (defaults to `%TEMP%/infinity-gauntlet/outbox-backups`). Files land under `<prefix>/<topic>/<timestamp>-<id>.json`.
- **Prefix & auditing:** `BACKUP_STORAGE_PREFIX` (default `outbox`) scopes where objects land. The event bus worker logs `worker.outbox.sink` entries with `provider` and `location` fields on success. Health logs now surface `backupProvider` for quick verification.
- **Verification:** After deploy, tail `worker.outbox.sink` for a `provider=s3` entry and confirm objects appear in the configured bucket. Record the first successful upload timestamp in Tasklist or ops logs during major rollouts.

## Database Connection Modes
- `DATABASE_CONNECTION_MODE` controls which Postgres endpoint the runtime chooses. Supported values: `auto` (default), `external`, and `internal`.
- Production services should stay on `auto`, which prefers `RENDER_DB_INTERNAL_URL` (Render internal network) and falls back to `DATABASE_URL` (direct PostgreSQL) when necessary.
- For local development, set `RENDER_DB_EXTERNAL_URL` to the external Render connection string and (optionally) export `DATABASE_CONNECTION_MODE=external` to force that endpoint. In `auto`, development builds already prefer the external URL when it is present.
- The helper also stamps `DATABASE_CONNECTION_SOURCE` in the process environment and Prisma connect logs include `databaseSource`/`connectionMode` so you can confirm which endpoint was selected at runtime.
- When dev mode finds an internal URL that successfully connects, that source is persisted to `%USERPROFILE%\.infinity-gauntlet\db-connection.json`; subsequent runs prefer the saved internal endpoint until another source succeeds.
- Runtime connection attempts alternate one try per source (external/internal) before looping, shortening the fallback path when a preferred endpoint is unavailable.
- This replaces the manual `DATABASE_URL=` exports during rehearsals—populate `RENDER_DB_EXTERNAL_URL` once and flip the mode instead of rewriting pooled/internal variables.

## Load Test / Game-Night Dry Run
| Date (UTC) | Window | Owners | Focus | Pass Criteria |
| --- | --- | --- | --- | --- |
| 2025-10-30 | 01:00–02:00 | Sherbivs, Ops duty (Alex) | Simulated game-night load across DM home, battles, event bus drain | Queue depth < 50, cache staleness < 600s, no `worker.alert.gauge_alert` or consecutive failure errors |
| Follow-up | +15 min debrief | Sherbivs | Capture outcomes in Prompt Last Repo Changes & Tasklist notes | Document regressions, rollback steps if thresholds breached |

Respond to threshold alerts by tailing Render logs (`worker.alert.*`) and, if needed, firing a DRIP critical alert via `/ops` so the security worker notifies the channel. Update this schedule when new dry runs are booked.

**2025-10-28 Dry Run:** Ran the rehearsal early to validate the new connection mode. Prisma logged `databaseSource=external` / `connectionMode=auto` as expected; DM home, battle flow, and event bus vitest suites passed; `/ops stats` scenarios initially failed with missing Prisma mocks but are now green after T10.SCALE.OPS_STATS_FIX (createPrismaStatsMock helper).

## Secret Handling
- Discord tokens (`POKEMON_BOT_TOKEN`, `SECURITY_BOT_TOKEN`) live in Render secrets; never commit `.env` snapshots.
- DRIP alert destinations require `ALERT_WEBHOOK_URL`, `ALERT_CHANNEL_ID`, and `ALERT_USER_ID`; security worker will warn loudly if unset.
- Persistent cache worker depends on `RENDER_API_KEY` + `GITHUB_TOKEN` for refresh jobs.
- **SSH Access:** Render SSH key stored in `secrets/Infinity-Gauntlet.env` as `RENDER_SSH_KEY`; automated setup via `npm run render:ssh-auto` configures SSH config, known_hosts, ssh-agent service, and environment variables. See `docs/deployment/render-ssh-automation.md` for complete automation guide.

## Quick Commands
- `npm run worker:outbox` / `worker:cache` / `worker:data-pipeline` for local parity with Render workers.
- `npm run docs:update-routers` to refresh router metadata after touching routed directories.
- `npm run docs:update-ledger` to sync Prompt.md and ops/change-ledger.md with recent commits.
- **SSH Access:** `npm run render:ssh-auto` (automated setup), `npm run render:ssh-connect` (interactive connection), `npm run render:ssh-disk` (check disk usage), `npm run render:ssh-store` (view /Store contents)

## Dexpack Build & Guard Workflow
- `npm run data:dexpack` regenerates the committed `assets/dexpack.v1.json`, `assets/dexpack.v1.json.gz`, and `assets/dexpack.gen.mjs` artifacts using `scripts/build_dexpack.ts`. The builder sources the existing bootstrap datasets, emits typed-array vectors plus perfect-hash tables, and only rewrites the artifacts when content changes.
- Run `npm run guard:dexpack` (or `node --no-warnings --loader tsx scripts/build_dexpack.ts --check`) before merging; the guard rebuilds in verification mode and fails when the JSON, gzip, or module outputs drift from the committed copies.
- `.github/workflows/guard-dexpack.yml` executes the same verification on push/PR. Fix failures by running the build command locally, committing the refreshed assets, and re-running the guard until it passes.
- Record rebuild intent and outcomes in Tasklist notes when regenerating the pack (include the species/move counts from the builder log) so operators can cross-check runtime behavior after deployment.
