# POKEMON CACHE & PokeAPI INTEGRATION

_Last updated: 2025-10-29T05:45:00Z (UTC) - Rev: 1.1_

## Overview
The Infinity Gauntlet runtime keeps an evergreen Pokedex cache that mirrors the public PokeAPI. The cache powers encounter rolls, starter selection, battle lookup, and manifest generation without hammering the third-party service at runtime. This document captures how the integration works end-to-end, how to operate it, and where to look when incidents occur.

## Architecture
- **Runtime cache service (`src/services/pokemonService.js`)** loads a frozen snapshot from `data/pokemon.json`, eagerly refreshes it via PokeAPI on boot, and exposes typed helpers used across the bot, encounter, and worker flows.
- **Cache worker (`src/worker/cache-refresh.ts`)** runs continuously in production (`infinity-gauntlet-cache` Render worker). It schedules refreshes, updates health metrics, and warns if the cache stales beyond configured thresholds.
- **Fetch & replicate job (`scripts/fetch_pokemon.mjs` + `scripts/refresh_cache.mjs`)** pulls the full PokeAPI dataset, normalises it, writes cache artifacts (`data/cache/pokemon.json`, gzip, `meta.json`), and pushes updates to the `data-cache` GitHub branch for persistence.
- **Render job orchestrator (`scripts/worker.mjs`)** sits in the `pokedex-cache-worker` service with a 1 GB disk. It dispatches refresh jobs via Render's Job API on a weekly cron, or immediately on boot, and the job itself calls `scripts/refresh_cache.mjs` inside the repository.
- **Failsafe cron (`pokedex-cache-failsafe`)** can rebuild the GitHub cache without touching Render disks if the primary worker is offline.

## Data Layout
- `data/pokemon.json` - runtime cache consumed by `pokemonService` (includes metadata wrapper).
- `data/cache/pokemon.json` - raw list summarised by the Render job for GitHub publication.
- `data/cache/meta.json` - checksum, source, and timestamp for auditing; used by downstream automation to verify freshness.
- `data/bootstrap/*.json` - trimmed reference payloads (`dex.min.json`, `moves.min.json`) used by the TypeScript data pipeline to emit deterministic manifests under `data/{pokemon,moves,abilities}/`.

## Dependencies
- Runtime requires `axios@^1` for HTTP and `node-cron@^4` for scheduled refreshes. Both are declared in `package.json`; run `npm install` after cloning or when they bump.
- Node 20+ is assumed (Node 18+ with global `fetch` works for data jobs, but the project currently runs on Node 25 in development).

## Local Operations
1. **Install deps:** `npm install` (ensures `axios` + `node-cron`).
2. **Run cache worker:** `npm run worker:cache` (runs `src/worker/cache-refresh.ts` via `tsx`). Logs surface refresh attempts, gauge updates, and errors.
3. **Trigger a one-off fetch:** `node scripts/refresh_cache.mjs` (writes into `data/cache/` and mirrors meta files). Requires Git credentials if replication to GitHub is enabled locally.
4. **Inspect cache metadata:** `npx tsx -e "import { getCacheMetadata } from './src/services/pokemonService.js'; (async () => console.log(getCacheMetadata()))();"`
5. **Verify database readiness:** `npx tsx scripts/db_smoke.ts count-pokemon` counts stored Pokemon instances (user-owned). In a clean database this is expected to report `0` until encounters create them.

## Render Configuration
- `infinity-gauntlet-cache` worker keeps `CACHE_WORKER_INTERVAL_MS=0`, relying on the service cron (`0 0 * * 4` in `Etc/UTC`) to refresh every Thursday at 00:00 after the startup fetch.
- `pokedex-cache-worker` dispatch interval is set by `POKE_REFRESH_CRON` (default `0 0 * * 4`) and `POKE_REFRESH_TZ`. Set `POKE_RUN_JOB_ON_BOOT=false` to skip the boot refresh during maintenance.
- Provide `RENDER_API_KEY` + `GITHUB_TOKEN` secrets so replication jobs can update the data cache branch.

## Observability & Alerts
- `worker.cache.health` logs include `total`, `lastFetchedAt`, and `lastFetchAttemptAt`. The worker gauges `cache.stale_seconds` with warn/alert thresholds (defaults: warn at 600 s, alert at 1800 s).
- `refreshPokemonCache` increments counters `refresh.success` / `refresh.failed` and emits `pokemon.cache.count` alerts with the cached total. Repeated failures produce `worker.cache_refresh_failed` errors - triage via Render logs and record outcomes in Tasklist + Prompt.
- GitHub replication logs (`scripts/replicate_to_repo_api.mjs`) surface under Render Job output. Verify `meta.json` timestamps if pipeline consumers report stale data.

## Incident Playbook
1. **Cache stale alert:**
      - Check Render logs for `worker.cache_refresh_failed`. If PokeAPI is rate-limiting, reduce concurrency via `POKE_CONCURRENCY` and rerun `npm run worker:cache` locally to confirm behaviour.
   - Dispatch a manual job: `curl -X POST https://api.render.com/v1/services/<serviceId>/jobs` with the boot payload (see `scripts/render_job_client.mjs`). Document the job ID in Tasklist.
2. **Replication failure:**
   - Run `node scripts/refresh_cache_gh_only.mjs` to publish from GitHub fallback while Render access is restored.
   - Ensure `GITHUB_TOKEN` permissions remain valid.
3. **Runtime cache corruption:**
   - Delete `data/pokemon.json` locally or the `/store/cache` directory on Render to force a clean rebuild.
   - Restart `infinity-gauntlet-cache` worker; it will repopulate on boot.

## Meta
- Update this document whenever cache schedules, dependencies, or data paths change. Run `npm run docs:update-routers` afterwards so router metadata references the new revision.
- Log noteworthy incidents in `ops/change-ledger.md` and capture actions in `Tasklist.md` / `ops/NEXT.yaml` for follow-up.
