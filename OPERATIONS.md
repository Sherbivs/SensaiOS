# OPERATIONS

_Last updated: 2025-10-28T23:45:00Z (UTC) — Rev: 1.2_

## Service Matrix
| Render Service | Purpose | Entry Command | Key Env Flags | Health Signals |
| --- | --- | --- | --- | --- |
| `infinity-gauntlet-bot` (web) | Boots the TypeScript runtime (`tsx src/index.ts`) and Discord DM features. | `npm start` | `DATABASE_POOL_URL`, `DATABASE_DIRECT_URL`, `ENABLE_SECURITY_BOT=false` | CLI dashboard (`discord` + `database` sections), structured logs tagged `runtime.*`. |
| `infinity-gauntlet-bots` (worker) | Legacy JS fallback for slash command registration/testing. | `npm start` | Mirrors web service; keep `ENABLE_SECURITY_BOT=false`. | Same telemetry as web; used for horizontal scale without extra security sweeps. |
| `infinity-gauntlet-security` (worker) | Dedicated security bot (role sweeps, DRIP alerts). | `node security-bot.js` | `ENABLE_SECURITY_BOT=true`, `ENABLE_CONTINUOUS_SWEEP=true`, alert tokens. | CLI security section, `worker.outbox.*`, `security.*`, DRIP alert receipts. |
| `infinity-gauntlet-outbox` (worker) | Drains `OutboxMessage` events and primes durable sink hand-off. | `node dist/worker/outbox.js` | `OUTBOX_MIN/MAX_DELAY_MS`, `OUTBOX_BATCH_SIZE`. | `worker.outbox.health`, cache entries `outbox:last-*`. |
| `infinity-gauntlet-cache` (worker) | Refreshes Pokédex cache on a fixed cadence. | `node dist/worker/cache-refresh.js` | `CACHE_WORKER_INTERVAL_MS`, `CACHE_WORKER_INTERVAL_JITTER_MS`. | `worker.cache.health`, cache metadata timestamps. |
| `infinity-gauntlet-data-pipeline` (worker) | Rebuilds reference data manifests and pushes to `/data`. | `node dist/worker/data-pipeline.js` | `DATA_PIPELINE_INTERVAL_MS`, `DATA_PIPELINE_RUN_ON_BOOT`. | `worker.pipeline.health`, manifest version logs. |
| `pokedex-cache-worker` (worker + disk) | Git-backed cache refresher with persistent disk. | `node scripts/worker.mjs` | Render disk mounts, Git credentials, schedule vars. | Render cron telemetry, job logs. |

## Rollout Checklist
1. Confirm pooled and direct database URLs resolve in Render dashboard for every service (pooled for runtime, direct for Prisma migrate).
2. Deploy `infinity-gauntlet-security` first so ENABLE_CONTINUOUS_SWEEP traffic moves off the web worker.
3. Once security worker healthy, redeploy the web worker with `ENABLE_SECURITY_BOT=false` to prevent duplicate sweeps.
4. Tail `worker.outbox.health` and `worker.cache.health` logs to ensure cadence and pending counts stabilize (<5 minutes to first signal).
5. Run `/ops stats`, DM Home history, and cooldown flows after redeploy to ensure query plans leverage the new indexes.

## Incident & Recovery Notes
- If security sweeps lag, toggle `ENABLE_CONTINUOUS_SWEEP` back on for the web worker as a temporary bridge; redeploy once dedicated worker recovers.
- Outbox worker failures enqueue `worker.crash` messages; `/ops stats` surfaces crash telemetry—investigate before re-enabling drains.
- Cache/data workers can be paused by setting the interval env vars to `0`; resumes require redeploy with the previous cadence.
- When migrations add new worker files, run `npm run docs:update-routers` so ops/ROUTER_INDEX.yaml and masterroutetable.md stay authoritative.

## Observability (Live)
- `worker.metrics.snapshot` logs now emit every 60s with gauges/counters; `worker.alert.*` entries fire on threshold breaches and consecutive failures (warn at 3, error at 5).
- **Outbox worker:** `queue.depth` gauge warns ≥50, alerts ≥200 pending messages. Investigate Render DB health and backlog before 100; alert requires paging ops + Sherbivs, consider scaling the worker or pausing enqueueing flows (`/ops stats` → queue section).
- **Cache refresh:** `cache.stale_seconds` warns when data is >10 minutes old, alerts past 30 minutes. Check network/API health, rerun `npm run worker:cache` locally, and confirm cache targets in `/ops stats`.
- **Data pipeline:** `pipeline.stale_seconds` warns after 4 hours with no success, alerts after 8 hours. Review `runWorker` logs, ensure buildData completes, and redeploy if failures persist.
- Telemetry counters (`refresh.failed`, `pipeline.failed`, `messages.failed`) surface in metrics payloads; triage repeated failures alongside the alert logs and record outcomes in Tasklist/Prompt when they trigger.

## Load Test / Game-Night Dry Run
| Date (UTC) | Window | Owners | Focus | Pass Criteria |
| --- | --- | --- | --- | --- |
| 2025-10-30 | 01:00–02:00 | Sherbivs, Ops duty (Alex) | Simulated game-night load across DM home, battles, outbox drain | Queue depth < 50, cache staleness < 600s, no `worker.alert.gauge_alert` or consecutive failure errors |
| Follow-up | +15 min debrief | Sherbivs | Capture outcomes in Prompt Last Repo Changes & Tasklist notes | Document regressions, rollback steps if thresholds breached |

Respond to threshold alerts by tailing Render logs (`worker.alert.*`) and, if needed, firing a DRIP critical alert via `/ops` so the security worker notifies the channel. Update this schedule when new dry runs are booked.

## Secret Handling
- Discord tokens (`POKEMON_BOT_TOKEN`, `SECURITY_BOT_TOKEN`) live in Render secrets; never commit `.env` snapshots.
- DRIP alert destinations require `ALERT_WEBHOOK_URL`, `ALERT_CHANNEL_ID`, and `ALERT_USER_ID`; security worker will warn loudly if unset.
- Persistent cache worker depends on `RENDER_API_KEY` + `GITHUB_TOKEN` for refresh jobs.

## Quick Commands
- `npm run worker:outbox` / `worker:cache` / `worker:data-pipeline` for local parity with Render workers.
- `npm run docs:update-routers` to refresh router metadata after touching routed directories.
- `npm run docs:update-ledger` to sync Prompt.md and ops/change-ledger.md with recent commits.
