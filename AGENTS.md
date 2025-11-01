# Infinity Gauntlet — Agent Operations Guide

## Mission
An agentic system that routes tasks to capable sub-agents, never gets stuck, and can self-heal after errors. The system prioritizes safety, observability, and progress over perfection.

## Repo Map
- `router/` — meta-router + capability registry
- `agents/` — specialist agents (planner, researcher, implementer, reviewer)
- `tools/` — tool clients (DB, HTTP, vector, filesystem, eval)
- `playbooks/` — recovery & escalation recipes
- `docs/` — architecture, safety, ops, runbooks

## Core Control Documents
- `Patch.md` — AI Project Manager Contract. Defines marker modes, clipboard expectations, hotfix loop, and Absolutes. Never edit outside the rules described here.
- `Prompt.md` — Operational prompt. Holds the current timestamp, revision, Last Repo Changes, PATCHSET echo, and NEXT pointer context.
- `Tasklist.md` — Task ledger. Tracks backlog, in-flight efforts, and outcomes. When tasks close, record status changes here.
- `masterroutetable.md` — Human-readable router index. Pairs with `ops/ROUTER.yaml` for canonical routing metadata.
- `README.md` (Router & Meta Index section) — Cross-links routers, contract files, and meta tooling for external automation.
- `ops/DB_BOOTSTRAP.md` — Staging Postgres bootstrap runbook covering migrate deploy vs. db push safety.
  - Expect both pooled (`DATABASE_POOL_URL`) and direct (`DATABASE_DIRECT_URL`) connection strings to be configured. Runtime services prefer the pooled URL; migrations use the direct URL.

## How to Run Locally
- **Start dev:** `pnpm dev` (or `npm run dev`)
- **Test:** `pnpm test`
- **Lints:** `pnpm lint:all`
- **Env needed (do not commit secrets):** use `.env.example` and `secrets/*.env.example` as reference, but copy real values into `C:/Users/sherb/OneDrive/Documents/Key/Dev/.env` (DEV direct URL) and `C:/Users/sherb/OneDrive/Documents/Key/Prod/.env` (Accelerate/production proxy). Load them with `IG_ENV_FILE`; keep the repo `.env` empty so local tooling always pulls from the external file.

## Local Database Access (Muted / Dev Only)
1. **Copy secrets outside the repo:** place `secrets/prisma-dev.env.example` → `C:/Users/sherb/OneDrive/Documents/Key/Dev/.env` and `secrets/prisma-accelerate.env.example` → `C:/Users/sherb/OneDrive/Documents/Key/Prod/.env`. Populate each with the real credentials (DEV direct URL vs. Accelerate proxy). Do **not** retain a combined `.env` in the repo.
2. **Select the target before DB work:** run `pwsh -File scripts/setup_ai_env.ps1 -EnvFile "C:/Users/sherb/OneDrive/Documents/Key/Dev/.env" -Persist` when you need the DEV Postgres connection. Swap to Accelerate by re-running with the `Key/Prod/.env` path. Production skips repo `.env` unless `IG_ALLOW_REPO_ENV=1`, so one of these overrides must be active.
  - **Verify access:** `echo $Env:IG_ENV_FILE` should print the chosen file; use `Get-Content C:/Users/sherb/OneDrive/Documents/Key/Dev/.env | Select-Object -First 5` to confirm it is reachable before running tooling.
  - **Reset Prisma after Accelerate:** whenever you come back from `Key/Prod/.env`, run `npx prisma generate` once so the local client switches from the Accelerate data proxy back to the direct engine before connecting to DEV.
  - **Dev → Prod → Dev loop:** run migrations or seeding against DEV first, switch to `Key/Prod/.env` and repeat the command (or use `scripts/ops/run_dex_migrations.ps1`), then return to `Key/Dev/.env` and regenerate Prisma so local work continues against DEV with the direct driver.
  - **Automation service:** `npm run db:auto-sync` runs the consolidation on deployment and then checks for drift every five minutes. Use `--dry-run`, `--once`, or `--skip-startup` when rehearsing new flows.
3. **Inspect databases:** use the muted control suite documented in `docs/db-control-suite.md`.
  ```powershell
  npm run db:cli -- status         # connection info + sample counts
  npm run db:cli -- counts         # common table counts (Species, BusMessage, ...)
  npm run db:cli -- count Species  # single-table helpers
  npm run db:cli -- query "SELECT COUNT(*) FROM \"Species\";"
  ```
4. **Document actions:** log purpose, command, and outcome in `Tasklist.md` under the active task when running anything outside status/counts.

Reference: `docs/db-control-suite.md` (muted) and `docs/ai-env-setup.md` describe the secure loading order and available commands. These tools run locally only; do not expose the secure env path in CI or production.

## Capabilities & Routing Hints
- **planner:** break down vague goals; produce measurable milestones and resource budgets.
- **researcher:** search, synthesize sources; attach citations & uncertainty notes.
- **implementer:** write/change code and config; run tests.
- **reviewer:** verify diffs, run safety/eval checklists; approve or request changes.

## Contract Workflow Quickstart
1. Open `Patch.md` and populate the clipboard (between `<<<PATCHSET START>>>` markers) with the planned file operations.
2. Execute edits exactly as described. Maintain ASCII output, respect existing formatting, and keep comments succinct.
3. Update `Prompt.md` Last Repo Changes and PATCHSET echo before finishing. Ensure `ops/NEXT.yaml` points to a READY task.
4. Clear or archive the clipboard after work. Leave the repository in a consistent state (router docs valid, tests noted, metadata synced).
5. For hotfixes, follow `ops/HOTFIX.md`, `ops/HOTFIX_PLAN.yaml`, and `HOTFIX.md` instructions. Restrict edits to the approved file list unless the plan expands it.

## Safety Invariants (Must Never Be Violated)
- Never exfiltrate secrets or raw credentials in outputs.
- Never run shell/DB/file operations without a dry-run or explicit confirmation step in CI.
- Always attach sources for claims from the web; flag low-confidence inferences.
- On error, **self-forgive**: reset working memory, keep the log, try a smaller step.

## Stuckness Detection & Recovery (Self-Healing)
- A run is **stuck** if any of these fire:
  - No new artifact or state change in N=3 consecutive steps.
  - Same error string seen ≥2 times in the last 10 minutes.
  - Budget exceeded (time > 15m or tokens > threshold) without milestone progress.
- Recovery steps (in order):
  1) **Shrink the step** (narrow the scope, reduce toolset).
  2) **Swap strategy** (change search terms, alternate tool, or prompt template).
  3) **Reset context** (clear ephemeral memory; keep breadcrumb log).
  4) **Escalate** using `playbooks/escalate.md` (open an Issue and summarize state).

## Observability
- Emit events to `logs/agent-events.jsonl` and console: `start|step|error|recovered|done`.
- Use OpenTelemetry traces for tool calls and router decisions.
- Persist final state in `runs/<ISO8601>/run.json`.

## Router Navigation
- Start with `ops/ROUTER.yaml` (router-of-routers) or `masterroutetable.md` for a textual overview.
- Key downstream routers:
  - `src/ROUTER.md` — Application source tree pivoting into domain routers.
  - `src/bot/ROUTER.md` — Discord bot layer, including security bot entry (`main.js`) and drip alert pipeline.
  - `scripts/ROUTER.md` — Guard scripts, router refresh tooling, change ledger automation.
  - `tests/ROUTER.md` — Vitest coverage map for major systems.
- When in doubt, consult `ops/TOUCHMAP.yaml` for file ownership and escalation paths.
- Pair the runbook (`ops/DB_BOOTSTRAP.md`) with `scripts/bootstrap_staging_db.ps1` before touching staging migrations; the script reads the active `IG_ENV_FILE` (defaulting to `C:/Users/sherb/OneDrive/Documents/Key/Dev/.env`), runs `prisma migrate deploy`, and points back to the runbook if baseline tables or connection strings (pooled vs. direct) are missing.

## Refresh Policy for Materialized Views
- Only the owner role or a `SECURITY DEFINER` function refreshes DB matviews.
- After DB errors, run `playbooks/db-recovery.md`.

## Operational Playbook
- **Guard Scripts**: `scripts/guard_meta.sh`, `scripts/guard_doc_names.sh`, and `scripts/guard_routing.sh` enforce invariants (READY pointer, canonical spellings, router consistency).
- **Bootstrap Helper**: `scripts/bootstrap_staging_db.ps1` attempts `npx prisma migrate deploy` against staging after loading the `IG_ENV_FILE` secrets (default `C:/Users/sherb/OneDrive/Documents/Key/Dev/.env`), warns when pooled/direct URLs are absent, and prints fallback guidance from the runbook when relations are missing.
- **Hotfix Loop**: Trigger naming, suffix rules, and recovery steps live in `ops/HOTFIX.md` and `ops/RECOVERY.yaml`. Update both when issuing or closing hotfixes.
- **Clipboard Discipline**: Contract Mode ON requires markers, clipboard, and Prompt updates. Markerless Mode (no markers) relaxes the flow but still enforces Absolutes (routers intact, NEXT READY, canonical docs preserved).
- **Logging**: `Prompt.md` PATCHSET echo should contain a concise summary, tasklist diff flag, test statement, contract mode, and NEXT pointer status.
- **DB Control Suite (Muted)**: All DB operations funnel through `npm run db:cli` (see `docs/db-control-suite.md`). Load `IG_ENV_FILE` first; production skips repo `.env` unless `IG_ALLOW_REPO_ENV=1`.

## Production & Render Notes
- `render.yaml` defines services:
  - `infinity-gauntlet-bot` (web) and `infinity-gauntlet` (worker) run the TypeScript entry (`npm start` -> `tsx src/index.ts`).
  - `infinity-gauntlet` worker now launches both the Discord bot (`src/bot/index.ts`) and the legacy security bot (`src/bot/main.js`) so DripTVDD DM alerts stay online.
  - `pokedex-cache-worker` handles reference data refresh with persistent disks.
- The environment expects managed database URLs. See `src/env/ensure-db-url.ts` and `README.md` for override logic.
- Security bot alert routing lives in `src/bot/main.js` and `src/bot/dripAlerts.js`. DM alert recipients/timezones resolve via `src/config/env.js`.

## Done Criteria (Per Task)
- Diff, tests, and reviewer checklist passed.
- Knowledge updated (`docs/` + this guide if behavior changed).
- Links to logs, PR, and run artifacts included.

## Testing & Tooling
- `npm test` — Vitest suite (battle engine, DM flows, ops commands, etc.).
- `npm run lint` — ESLint across `src` and `tests` (TypeScript only).
- `npm run docs:update-routers` — Rebuild router indexes after structural changes.
- `npm run docs:update-ledger` — Refresh Prompt change ledger.
- `npm run refresh:vision` — Runs the full metadata refresh pipeline (routers, recovery, NEXT validation).
- `scripts/bootstrap_staging_db.ps1` — PowerShell entry that wraps `prisma migrate deploy` with interactive confirmation.
  - Honors `DATABASE_POOL_URL`/`DATABASE_DIRECT_URL` and surfaces guidance when they’re missing or identical.
  - Works best with the connection retry envs (`PRISMA_CONNECT_MAX_RETRIES`, `PRISMA_CONNECT_RETRY_DELAY_MS`, `PRISMA_CONNECT_MAX_DELAY_MS`) tuned in the external `Key/Dev/.env` secrets file.

## Data & Cache Pipelines
- Pokémon data bootstrap lives under `scripts/build-data.js`, `scripts/fetch_pokemon.mjs`, and `data/bootstrap/*`.
- The security bot uses filesystem caching via `src/services/cache.js` (`/Store/discord-cache`).
- Live game flows share a typed facade in `src/services/cache/facade.ts` that fronts an in-memory LRU and persists slices under `/Store/runtime-cache/<namespace>`; adjust limits with `configureCacheFacade` for tests or workers.
- Render cron (`pokedex-cache-failsafe`) calls `scripts/refresh_cache_gh_only.mjs` for a GitHub-only fallback.

## Key Directories Snapshot
- `src/bot/` — Discord bot logic, DM flows, battles, security bot (legacy JS) integration.
- `src/core/` — Deterministic game engines (battle, encounter, math helpers).
- `src/data_pipeline/` — Data ingestion/validation logic.
- `src/shared/` — Logging, config, and utilities used across services.
- `scripts/` — Automation entrypoints (guards, refreshers, build tools).
- `ops/DB_BOOTSTRAP.md` & `scripts/bootstrap_staging_db.ps1` — Paired references for staging schema bootstrap; read the runbook before executing the script and confirm both pooled (`DATABASE_POOL_URL`) and direct (`DATABASE_DIRECT_URL`) URLs are set.
- `ops/` — Operational metadata, hotfix plans, NEXT pointers, recovery docs.
- `tests/` — Vitest specs across engines, data pipeline, DM flow, and ops surfaces.

## Checklist Before Exit
- Patch clipboard cleared, markers intact.
- `Prompt.md` updated with accurate summary, tests note, NEXT pointer status.
- `ops/NEXT.yaml` points at READY task (typically T8.x unless reprioritized).
- Routers synchronized if structural docs changed.
- Commit message (when applicable) references task ID and change summary.


Following this handbook ensures automation, human operators, and downstream agents see a consistent system snapshot and can continue work without rediscovery.
