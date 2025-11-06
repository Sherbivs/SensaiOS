# Recent Change Ledger (200 commits)

## 2025-11-05 — Local Postgres Fallback Mirror
- Added `scripts/ops/bootstrap_local_fallback.ts` (`npm run ops:bootstrap-local-db`) to hydrate a Store-backed Postgres mirror, rotate timestamped snapshots, and publish `Store/db/local-url.txt` + metadata for offline failover.
- Extended `src/shared/config.ts` and `scripts/db_admin.ts` so Prisma and operator CLI flows detect `Store/db/local-url.txt` when managed hosts fail, ensuring local tooling can reconnect without manual rewiring.
- Updated AGENTS.md, docs/operations.md, and docs/database-systems.md with fallback requirements, including Tasklist logging before the Nov 5 ladder and go/no-go checks that verify the mirror timestamp and URL.
- Refreshed Prompt.md, Tasklist.md, and ops/NEXT.yaml so T13.DEX.V2_PROD_CUTOVER remains READY with offline recovery coverage captured for auditors.

## 2025-11-05 — Render Storage Quota Guardrails
- Documented Render Postgres storage ceilings (0.5 GB prod / 1.0 GB dev) in `docs/database-systems.md`, including the Render metrics workflow, SQL size check, and escalation thresholds (60% warn, 80% halt).
- Added a storage guardrail bullet to `docs/operations.md` so the Nov 5 ladder requires capturing utilization before each cohort change and pausing if either environment breaches 80%.
- Updated `AGENTS.md` to brief operators on the storage quotas and remind them to log Render metrics + SQL output in Tasklist notes before cutovers.
- Noted in the ledger that the CLI `database` panel already surfaces `storageUsed` telemetry when supervisors provide it, keeping quiet-mode Render logs aligned with the documentation.

## 2025-11-05 — Security Bot Guardrail Hardening
- Added explicit `revertStatus` / `revertErrors` telemetry to the security bot rollback helpers so unauthorized role and permission edits record success/failure in DRIP alerts and the CLI dashboard.
- Updated AGENTS.md, docs/operations.md, and docs/dex-v2-design.md to require owner/administrator authorization checks during the Nov 5 DEX v2 window and to reference the new telemetry fields in go/no-go reviews.
- Staged a pre-window rehearsal checklist item instructing ops to simulate an unauthorized role change in staging and capture the resulting `revertStatus: success` evidence before the canary ladder starts.
- Ops/NEXT.yaml, Prompt.md, and Tasklist.md stamps refreshed so T13.DEX.V2_PROD_CUTOVER stays READY with the guardrail context logged for auditors.

## 2025-11-03 — DEX v2 Pack & Flag Sign-Off
- Pack hash: `f840e427f83b819e2c251ad267d714797d23a34b88b0c2f1c61eafe03aef5b00` (manifest `assets/dexpack.v2.json`, signed 2025-11-02T06:54:25.787Z).
- Feature flag ladder approved for 2025-11-05 window with stored plans:
  - `ops/flag-plans/dex_v2_enabled-1-2025-11-03T04-54-49.941Z.json` (1% @ 07:00Z)
  - `ops/flag-plans/dex_v2_enabled-25-2025-11-03T04-54-27.414Z.json` (25% @ 07:15Z)
  - `ops/flag-plans/dex_v2_enabled-50-2025-11-03T04-54-33.100Z.json` (50% @ 07:30Z)
  - `ops/flag-plans/dex_v2_enabled-100-2025-11-03T04-54-42.965Z.json` (100% @ 07:50Z)
- Approvals captured from Engineering, Operations, and Security on 2025-11-03T05:05Z; ready for config service apply.
- Dry-run apply rehearsal logged 2025-11-03T05:16Z via `npm run ops:simulate-flag -- … --dry-run --announce --apply`, with payload previews stored in terminal logs and no outbound calls; prod/dev dumps archived under `backups/archive/2025-11-03/` for ≥14-day retention.
- Release communications template captured in docs/dex-v2-design.md (T-30 step) and mirrored in docs/operations.md alongside monitoring/rollback guidance so the live window has pre-approved messaging and dashboards.
- Final pre-approved #ops-release message and 100% follow-up text added to docs/dex-v2-design.md; on-call can copy/paste directly, with instructions in docs/operations.md to log actual wording after execution.
- Built a minute-by-minute timeline, role roster, go/no-go checks, and evidence capture template in docs/operations.md; cross-linked from docs/dex-v2-design.md so on-call has a single operations view for the Nov 5 window.
- 2025-11-03T06:18Z: Revalidated the four 2025-11-05 flag plans (1/25/50/100 ladder) under `ops/flag-plans/`, confirming window dates/effective times and archiving the 2025-11-03 rehearsal JSON to `ops/flag-plans/archive/` so only the PROD ladder remains queued for console upload.
- 2025-11-03T06:23Z: Added cutover evidence scaffolding in this ledger (see `## 2025-11-05 DEX v2 Cutover`) with per-cohort placeholders for timestamps, console responses, Grafana captures, and `/ops cache` outputs.
- 2025-11-03T06:24Z: Rehearsed `npm run ops:simulate-flag -- --flag DEX_V2_ENABLED --percent 1 --dry-run --announce --apply`; script repeated manual console instructions with no config URL required and logged webhook preview copy for Ops review.
- 2025-11-03T06:26Z: Copied the T-30 #ops-release message from docs/dex-v2-design.md, confirmed Eng/Ops/Sec re-approval plan, and queued the text in the comms doc for day-of paste.
- 2025-11-03T06:28Z: Noted monitoring prework (temporary Grafana rule, `DEX_V2_CANARY_TAG`, alert webhook verification) ready to execute at T-60/T-45; checklist aligned with docs/operations.md.

## 2025-11-05 DEX v2 Cutover
### 1% — Prod Canary (02:00 ET / 07:00Z)
- Timestamp:
- Command / plan filename:
- Console response / upload confirmation:
- Grafana snapshot (lookup p95/p99, alias miss, fallback):
- `/ops cache` output (prod canary guild):
- Alerts or anomalies:

### 25% — Prod Ramp (02:15 ET / 07:15Z)
- Timestamp:
- Command / plan filename:
- Console response / upload confirmation:
- Grafana snapshot (lookup p95/p99, alias miss, fallback):
- `/ops cache` output (prod canary guild):
- Alerts or anomalies:

### 50% — Prod Ramp (02:30 ET / 07:30Z)
- Timestamp:
- Command / plan filename:
- Console response / upload confirmation:
- Grafana snapshot (lookup p95/p99, alias miss, fallback):
- `/ops cache` output (prod canary guild):
- Alerts or anomalies:

### 100% — Prod Global (02:50 ET / 07:50Z)
- Timestamp:
- Command / plan filename:
- Console response / upload confirmation:
- Grafana snapshot (lookup p95/p99, alias miss, fallback):
- `/ops cache` output (prod canary guild):
- Alerts or anomalies:

### Post-Cutover Verification (T+60 / T+75)
- Timestamp:
- Commands run:
- Auto-sync / verifier logs:
- Grafana snapshot:
- `/ops cache` output:
- Alerts or anomalies:


**Generated:** 2025-11-01T21:12:55Z  |  **Branch:** main

- **750b7f6** — 2025-11-01 — Sherbivs — _logic intent:_ chore: Update documentation across various modules
  Files: `Patch.md`, `Tasklist.md`, `masterroutetable.md`, `ops/NEXT.yaml`, `ops/ROUTER.yaml`, +32 more
- **ebb0996** — 2025-11-01 — Sherbivs — _logic intent:_ feat: Refactor command loading and enhance battle interaction handling
  Files: `AGENTS.md`, `Prompt.md`, `ops/NEXT.yaml`, `src/bot/arena/thread.ts`, `src/bot/battle/actions.ts`, +6 more
- **7445fc8** — 2025-11-01 — Sherbivs — _logic intent:_ Merge pull request #77 from Sherbivs/codex/update-swap-branch-for-party-member-selection
  Files: (no file changes detected)
- **070868f** — 2025-11-01 — Sherbivs — _logic intent:_ Merge branch 'main' into codex/update-swap-branch-for-party-member-selection
  Files: (no file changes detected)
- **780d999** — 2025-11-01 — Sherbivs — _logic intent:_ Refine encounter swap workflow
  Files: `ops/ROUTER_INDEX.yaml`, `src/bot/ROUTER.md`, `src/bot/wilds/controls.ts`
- **01a6973** — 2025-11-01 — Sherbivs — _logic intent:_ Merge pull request #78 from Sherbivs/codex/update-ruleset.md-and-verify-implementations
  Files: (no file changes detected)
- **633e45f** — 2025-11-01 — Sherbivs — _logic intent:_ Merge branch 'main' into codex/update-ruleset.md-and-verify-implementations
  Files: `masterroutetable.md`, `tests/ROUTER.md`
- **a50aafb** — 2025-11-01 — Sherbivs — _logic intent:_ Sync battle docs with router metadata
  Files: `RULESET.md`, `masterroutetable.md`, `tests/ROUTER.md`
- **9531b75** — 2025-11-01 — Sherbivs — _logic intent:_ Merge pull request #79 from Sherbivs/codex/implement-dm-home-views-and-commands
  Files: (no file changes detected)
- **438c617** — 2025-11-01 — Sherbivs — _logic intent:_ Improve DM Home response handling and sync routers
  Files: `masterroutetable.md`, `ops/ROUTER_INDEX.yaml`, `src/bot/ROUTER.md`, `src/bot/dm/home.tsx`, `src/commands/ROUTER.md`, +3 more
- **852ebec** — 2025-11-01 — Sherbivs — _logic intent:_ Implement DM home views and commands
  Files: `src/bot/dm/home.tsx`, `src/bot/index.ts`, `src/commands/box.js`, `src/commands/dm-home-loader.js`, `src/commands/party.js`, +4 more
- **153f2ec** — 2025-11-01 — Sherbivs — _logic intent:_ Document battle rules and expand coverage
  Files: `RULESET.md`, `tests/battle_engine.spec.ts`
- **771763d** — 2025-11-01 — Sherbivs — _logic intent:_ Implement encounter party swap controls
  Files: `src/bot/wilds/controls.ts`
- **09fbc87** — 2025-11-01 — Sherbivs — _logic intent:_ Merge pull request #76 from Sherbivs/codex/extend-handlebattleactionbutton-for-moves-and-switches
  Files: (no file changes detected)
- **7b33da9** — 2025-11-01 — Sherbivs — _logic intent:_ feat: add battle action selections
  Files: `docs/battle-dm-flow.md`, `src/bot/battle/actions.ts`, `src/core/battle/turn-manager.ts`, `tests/battle/actions.interaction.spec.ts`, `tests/setup-env.ts`
- **a88ddb5** — 2025-11-01 — Sherbivs — _logic intent:_ docs: Update AGENTS.md and README.md for improved orientation flow and project status clarity
  Files: `AGENTS.md`, `README.md`
- **3a5653d** — 2025-11-01 — Sherbivs — _logic intent:_ chore: Update last updated timestamps and enhance linked router documentation across multiple modules
  Files: `data/ROUTER.md`, `data/bootstrap/ROUTER.md`, `data/cache/ROUTER.md`, `ops/ARCHIVE/ROUTER.md`, `ops/INBOX/ROUTER.md`, +16 more
- **2f85213** — 2025-11-01 — Sherbivs — _logic intent:_ feat: Enhance documentation and structure across multiple modules
  Files: `.github/workflows/ROUTER.md`, `Patch.md`, `Prompt.md`, `Tasklist.md`, `data/bootstrap/ROUTER.md`, +41 more
- **fbe9b19** — 2025-11-01 — Sherbivs — _logic intent:_ Add probe script for Prisma optimization and update database candidate handling
  Files: `package.json`, `scripts/ROUTER.md`, `scripts/probe_prisma_optimize.ts`, `src/shared/config.ts`
- **6631bea** — 2025-11-01 — Sherbivs — _logic intent:_ Update database candidate handling and logging for fallback candidates
  Files: `pbsl-oracle-report.json`, `src/shared/config.ts`, `src/shared/prisma.ts`
- **b70071d** — 2025-11-01 — Sherbivs — _logic intent:_ Refactor tests for consistency and update TypeScript configuration to include .d.mts files
  Files: `tests/battle_engine.spec.ts`, `tsconfig.json`
- **23e2911** — 2025-11-01 — Sherbivs — _logic intent:_ Refactor and enhance various modules
  Files: `README.md`, `docs/database-systems.md`, `eslint.config.js`, `package-lock.json`, `package.json`, +67 more
- **070939d** — 2025-11-01 — Sherbivs — _logic intent:_ Merge pull request #75 from Sherbivs/update-dependencies-to-latest
  Files: (no file changes detected)
- **189ecbf** — 2025-11-01 — openhands — _logic intent:_ Update all dependencies to latest versions
  Files: `package-lock.json`, `package.json`, `pbsl-oracle-report.json`
- **5ec90e5** — 2025-11-01 — Sherbivs — _logic intent:_ Document /ops cache diagnostics and cache facade metrics
  Files: `AGENTS.md`, `README.md`, `ops/ROUTER.md`, `ops/ROUTER_INDEX.yaml`, `src/bot/ROUTER.md`, +2 more
- **fc8f590** — 2025-11-01 — Sherbivs — _logic intent:_ Add cache metrics, maintenance, and /ops cache command
  Files: `AGENTS.md`, `Patch.md`, `Prompt.md`, `Tasklist.md`, `docs/database-systems.md`, +6 more
- **fda5bc2** — 2025-11-01 — Sherbivs — _logic intent:_ fix: Cast legacyCache to ensure proper typing for MAX_CACHE_PERCENT and MAX_CACHE_FILE_AGE_MS
  Files: `src/services/cache/facade.ts`
- **2d56fc2** — 2025-11-01 — Sherbivs — _logic intent:_ Implement runtime cache facade with LRU and disk persistence, enhance battle and encounter handling, and add daily quest reward system with caching. Update tes…
  Files: `Patch.md`, `Prompt.md`, `Tasklist.md`, `src/bot/battle/actions.ts`, `src/bot/battle/challenge.ts`, +6 more
- **727c617** — 2025-11-01 — Sherbivs — _logic intent:_ Add typed runtime cache facade with LRU and disk persistence
  Files: `AGENTS.md`, `Patch.md`, `Prompt.md`, `Tasklist.md`, `ops/NEXT.yaml`, +6 more
- **b59bbe0** — 2025-10-31 — Sherbivs — _logic intent:_ Add OPTIMIZE_API_KEY to Render services and docs
  Files: `docs/database-systems.md`, `render.yaml`
- **ff925db** — 2025-10-31 — Sherbivs — _logic intent:_ feat: Update meta.json timestamp, add dotenv dependency, enhance seed_dex.ts error handling, and create dex-sync-trigger.json
  Files: `data/cache/dex-sync-trigger.json`, `data/cache/meta.json`, `package-lock.json`, `package.json`, `scripts/seed_dex.ts`
- **0817101** — 2025-10-31 — Sherbivs — _logic intent:_ Add Accelerate parity check script and update docs
  Files: `docs/database-systems.md`, `package-lock.json`, `package.json`, `render.yaml`, `scripts/check_db_redundancy.ts`, +4 more
- **a35b9de** — 2025-10-30 — Sherbivs — _logic intent:_ Merge pull request #74 from Sherbivs/update-dependencies-to-latest
  Files: (no file changes detected)
- **c25db48** — 2025-10-30 — Sherbivs — _logic intent:_ Merge branch 'main' into update-dependencies-to-latest
  Files: `package.json`
- **9a8ad1a** — 2025-10-30 — Sherbivs — _logic intent:_ fix: Update cache percentage and adjust TypeScript module settings
  Files: `src/index.d.ts`, `src/services/cache.js`, `tsconfig.json`
- **ee0b520** — 2025-10-30 — Sherbivs — _logic intent:_ Refactor metrics handling and add type declarations
  Files: `src/bot/main.js.d.ts`, `src/index.ts`, `src/services/cache.js.d.ts`, `src/shared/prisma.ts`, `src/types/js-module-declarations.d.ts`
- **d4b1a0d** — 2025-10-30 — Sherbivs — _logic intent:_ Add DB auto-sync supervisor and improve config handling
  Files: `src/bot/main.d.ts`, `src/config/env.d.ts`, `src/config/env.js`, `src/index.ts`, `src/runtime/autoSync.ts`, +4 more
- **4b86562** — 2025-10-30 — Sherbivs — _logic intent:_ Update config.ts
  Files: `src/shared/config.ts`
- **d6e1801** — 2025-10-30 — Sherbivs — _logic intent:_ Add environment variable aliasing for DB URLs
  Files: `src/config/env.js`
- **114bfb7** — 2025-10-30 — Sherbivs — _logic intent:_ feat: Integrate PokéAPI cache refresh trigger into auto-sync loop and enhance trigger file handling
  Files: `Prompt.md`, `Tasklist.md`, `docs/database-systems.md`, `masterroutetable.md`, `scripts/ROUTER.md`, +2 more
- **f3d218a** — 2025-10-30 — Sherbivs — _logic intent:_ Harden dev_prod_auto_sync with env handling and timeouts
  Files: `Prompt.md`, `Tasklist.md`, `masterroutetable.md`, `ops/TOUCHMAP.yaml`, `scripts/ROUTER.md`, +1 more
- **ad06f15** — 2025-10-30 — Sherbivs — _logic intent:_ feat: Implement continuous Dev ↔ Prod dex sync automation and update related documentation
  Files: `AGENTS.md`, `Patch.md`, `Prompt.md`, `Tasklist.md`, `docs/database-systems.md`, +8 more
- **bec50aa** — 2025-10-30 — Sherbivs — _logic intent:_ feat: Implement Pokédex seeding script and update related documentation
  Files: `Patch.md`, `Prompt.md`, `Tasklist.md`, `data/cache/meta.json`, `docs/database-systems.md`, +8 more
- **a806ac4** — 2025-10-30 — Sherbivs — _logic intent:_ feat: Log guard baseline output and track first passing CI run for guard-db-docs
  Files: `Prompt.md`, `Tasklist.md`, `ops/NEXT.yaml`, `ops/TOUCHMAP.yaml`
- **7d13ee0** — 2025-10-30 — Sherbivs — _logic intent:_ feat: Update environment configuration and documentation for DB connections
  Files: `.env.example`, `.github/workflows/guard-db-docs.yml`, `AGENTS.md`, `Prompt.md`, `README.md`, +15 more
- **eb42364** — 2025-10-30 — openhands — _logic intent:_ Update all dependencies to latest versions
  Files: `eslint.config.js`, `package-lock.json`, `package.json`, `pbsl-oracle-report.json`, `src/data_pipeline/schema/typechart.ts`
- **9c589ff** — 2025-10-30 — Sherbivs — _logic intent:_ chore: Update roadmap and tasklist, clear backlog, and document governance audit results
  Files: `Prompt.md`, `Tasklist.md`, `docs/perfect-system-roadmap.md`, `ops/DB_BOOTSTRAP.md`, `ops/NEXT.yaml`, +3 more
- **4e6708c** — 2025-10-30 — Sherbivs — _logic intent:_ Revise roadmap, rotate secrets, and update task flow
  Files: `Patch.md`, `Prompt.md`, `Tasklist.md`, `data/cache/meta.json`, `docs/perfect-system-roadmap.md`, +1 more
- **96e8c9f** — 2025-10-30 — Sherbivs — _logic intent:_ feat: Update environment setup and database control documentation
  Files: `AGENTS.md`, `Prompt.md`, `README.md`, `Tasklist.md`, `data/cache/meta.json`, +11 more
- **f903001** — 2025-10-29 — Sherbivs — _logic intent:_ Document local DB control suite and update router tables
  Files: `AGENTS.md`, `docs/db-control-suite.md`, `masterroutetable.md`, `ops/ROUTER_INDEX.yaml`
- **8c8ec56** — 2025-10-29 — Sherbivs — _logic intent:_ .
  Files: `.db-state/ROUTER.md`, `.github/ROUTER.md`, `Prompt.md`, `Tasklist.md`, `data/ROUTER.md`, +23 more
- **2b99253** — 2025-10-29 — Sherbivs — _logic intent:_ feat(db): add control suite and secure env workflow
  Files: `.env.example`, `.gitignore`, `AGENTS.md`, `README.md`, `docs/ai-env-setup.md`, +11 more
- **772012d** — 2025-10-29 — Sherbivs — _logic intent:_ Support external env file via IG_ENV_FILE variable
  Files: `AGENTS.md`, `README.md`, `masterroutetable.md`, `src/config/env.js`
- **1092b02** — 2025-10-29 — Sherbivs — _logic intent:_ Update outbox.ts
  Files: `src/worker/outbox.ts`
- **9879b3e** — 2025-10-29 — Sherbivs — _logic intent:_ Add Perfect System Roadmap document outlining governance, database operations, runtime quality, automation, and observability strategies
  Files: `masterroutetable.md`, `scripts/cleanup_repo.ps1`
- **8102a0e** — 2025-10-29 — Sherbivs — _logic intent:_ chore(cleanup): add repo sweeper
  Files: `scripts/cleanup_repo.ps1`
- **76f78b4** — 2025-10-29 — Sherbivs — _logic intent:_ Merge branch 'main' of https://github.com/Sherbivs/Infinity-Gauntlet
  Files: (no file changes detected)
- **f1b5546** — 2025-10-29 — Sherbivs — _logic intent:_ chore(cleanup): remove legacy js bot
  Files: `README.md`, `Tasklist.md`, `apply-pokemon-skeleton-patch.ps1`, `discord-pokemon-bot/.env.example`, `discord-pokemon-bot/.gitignore`, +24 more
- **1be6b08** — 2025-10-29 — Sherbivs — _logic intent:_ .
  Files: `discord-pokemon-bot/apply-pokemon-skeleton-patch.ps1`
- **faba235** — 2025-10-29 — Sherbivs — _logic intent:_ .
  Files: `discord-pokemon-bot/.gitignore`
- **31a6a9b** — 2025-10-29 — Sherbivs — _logic intent:_ .
  Files: `discord-pokemon-bot/.env.example`
- **b4352a3** — 2025-10-29 — Sherbivs — _logic intent:_ Delete discord-pokemon-bot/battles directory
  Files: `discord-pokemon-bot/battles/battle-channel.js`, `discord-pokemon-bot/battles/battle-manager.js`, `discord-pokemon-bot/battles/battleManager.js`
- **579e73f** — 2025-10-29 — Sherbivs — _logic intent:_ Delete
  Files: `.env`
- **10e3551** — 2025-10-29 — Sherbivs — _logic intent:_ chore(db): vendor postgres 17 clients
  Files: `Tasklist.md`, `scripts/check_db_redundancy.ts`, `tools/pgsql17/pgsql/bin/clusterdb.exe`, `tools/pgsql17/pgsql/bin/clusterdb.pdb`, `tools/pgsql17/pgsql/bin/createdb.exe`, +106 more
- **49ed7b8** — 2025-10-29 — Sherbivs — _logic intent:_ Add comprehensive database systems documentation
  Files: `DATA-SCHEMA.md`, `OPERATIONS.md`, `Patch.md`, `Tasklist.md`, `docs/database-systems.md`, +7 more
- **10fcbb9** — 2025-10-29 — Sherbivs — _logic intent:_ Merge pull request #73 from Sherbivs/codex/implement-event-engine-in-infinity-gauntlet
  Files: (no file changes detected)
- **8d36473** — 2025-10-29 — Sherbivs — _logic intent:_ [Task META.RUNTIME.EVENT_BUS] Introduce event bus engine
  Files: `OPERATIONS.md`, `masterroutetable.md`, `prisma/schema.prisma`, `src/ROUTER.md`, `src/bot/ops/admin.ts`, +9 more
- **ea97d38** — 2025-10-29 — Sherbivs — _logic intent:_ Implement durable outbox backup sink with S3/local support
  Files: `OPERATIONS.md`, `Patch.md`, `Prompt.md`, `Tasklist.md`, `ops/NEXT.yaml`, +5 more
- **2eeaff1** — 2025-10-29 — Sherbivs — _logic intent:_ Integrate perfect-system roadmap and update dex refresh fallback
  Files: `Patch.md`, `Prompt.md`, `Tasklist.md`, `docs/perfect-system-roadmap.md`, `ops/DB_BOOTSTRAP.md`, +3 more
- **97b9514** — 2025-10-29 — Sherbivs — _logic intent:_ Update documentation for staging DB bootstrap and migration processes
  Files: `Patch.md`
- **663faf1** — 2025-10-29 — Sherbivs — _logic intent:_ Merge pull request #72 from Sherbivs/codex/add-agents.md-to-repo-root
  Files: (no file changes detected)
- **2d08897** — 2025-10-29 — Sherbivs — _logic intent:_ Combine agent operations guidance
  Files: `.github/workflows/agent-health.yml`, `AGENTS.md`, `docs/architecture.md`, `docs/meta-router.md`, `docs/operations.md`, +3 more
- **d2a63e9** — 2025-10-29 — Sherbivs — _logic intent:_ Merge pull request #71 from Sherbivs/codex/fix-privileges-on-materialized-view
  Files: (no file changes detected)
- **faa85b6** — 2025-10-29 — Sherbivs — _logic intent:_ Document SpeciesSheet privilege remediation steps
  Files: `ops/DB_BOOTSTRAP.md`
- **ef84c9e** — 2025-10-29 — Sherbivs — _logic intent:_ Document Accelerate and Render DB connection checks
  Files: `.env`, `Patch.md`, `Prompt.md`, `Tasklist.md`, `ops/DB_BOOTSTRAP.md`
- **aab1aa6** — 2025-10-29 — Sherbivs — _logic intent:_ Update ROUTER_INDEX.yaml
  Files: `ops/ROUTER_INDEX.yaml`
- **70974de** — 2025-10-29 — Sherbivs — _logic intent:_ rout
  Files: `Tasklist.md`, `masterroutetable.md`, `ops/ROUTER.md`, `ops/ROUTER.yaml`, `ops/TOUCHMAP.yaml`, +1 more
- **aba7845** — 2025-10-29 — Sherbivs — _logic intent:_ .
  Files: `Agents.md`
- **e8bb3d0** — 2025-10-29 — Sherbivs — _logic intent:_ Update prisma.ts
  Files: `src/shared/prisma.ts`
- **fe0dc4e** — 2025-10-29 — Sherbivs — _logic intent:_ Add Prisma Optimize extension and related dependencies
  Files: `.env`, `package-lock.json`, `package.json`, `scripts/dex/warm_cache.ts`, `src/shared/prisma.ts`
- **d9f997a** — 2025-10-29 — Sherbivs — _logic intent:_ Added `scripts/dex/seed_reference.ts` (filterable, idempotent), `scripts/dex/warm_cache.ts` (refreshes SpeciesSheet + cache with fallback when octokit is missi…
  Files: `Tasklist.md`, `ops/DB_BOOTSTRAP.md`, `prisma/migrations/202510290930_dex_reference_spine/migration.sql`, `scripts/dex/backfill_species.ts`, `scripts/dex/warm_cache.ts`
- **d8f17bd** — 2025-10-29 — Sherbivs — _logic intent:_ prisma-accelerate
  Files: `.gitignore`, `Patch.md`, `Prompt.md`, `Tasklist.md`, `masterroutetable.md`, +8 more
- **4b1662e** — 2025-10-29 — Sherbivs — _logic intent:_ Add dex rollout tasks and update planning metadata
  Files: `Patch.md`, `Prompt.md`, `Tasklist.md`, `ops/TOUCHMAP.yaml`, `tmp.sql`
- **cd9e1a7** — 2025-10-29 — Sherbivs — _logic intent:_ Create tmp.sql
  Files: `tmp.sql`
- **3e2c94f** — 2025-10-29 — Sherbivs — _logic intent:_ Update migration.sql
  Files: `prisma/migrations/202510290930_dex_reference_spine/migration.sql`
- **23122c3** — 2025-10-29 — Sherbivs — _logic intent:_ db
  Files: `DATA-SCHEMA.md`, `package-lock.json`, `package.json`, `prisma/migrations/202510290930_dex_reference_spine/migration.sql`, `prisma/schema.prisma`, +1 more
- **2f1963a** — 2025-10-29 — Sherbivs — _logic intent:_ Create check_db_redundancy.ts
  Files: `scripts/check_db_redundancy.ts`
- **b17bbe4** — 2025-10-29 — Sherbivs — _logic intent:_ Merge pull request #69 from Sherbivs/codex/incorporate-performance-optimizations-and-constraints
  Files: (no file changes detected)
- **6288fa6** — 2025-10-29 — Sherbivs — _logic intent:_ Tighten schema constraints and improve outbox handling
  Files: `prisma/migrations/202511010900_schema_constraints/migration.sql`, `prisma/schema.prisma`, `src/bot/ops/admin.ts`, `src/services/home-bundle.ts`, `src/shared/cache/ttl-lru.ts`, +5 more
- **a9462a9** — 2025-10-28 — Sherbivs — _logic intent:_ Merge pull request #68 from Sherbivs/codex/add-replication-workflow-for-databases
  Files: (no file changes detected)
- **67da676** — 2025-10-28 — Sherbivs — _logic intent:_ Add Prisma standby sync automation and router guard
  Files: `.gitignore`, `ops/DB_IMPORT_PRISMA_POSTGRES.md`, `ops/ROUTER.md`, `ops/ROUTER.yaml`, `ops/ROUTER_INDEX.yaml`, +4 more
- **6bf5b1c** — 2025-10-28 — Sherbivs — _logic intent:_ Create package-lock.json
  Files: `discord-pokemon-bot/package-lock.json`
- **c155387** — 2025-10-28 — Sherbivs — _logic intent:_ Document dual-db runbook and fix doc guard
  Files: `Tasklist.md`, `ops/DB_IMPORT_PRISMA_POSTGRES.md`, `ops/ROUTER.md`, `ops/ROUTER_INDEX.yaml`, `prisma/migrations/202510280500_scaling_indexes/migration.sql`, +1 more
- **1cb63bf** — 2025-10-28 — Sherbivs — _logic intent:_ Create pokemon.json
  Files: `data/pokemon.json`
- **85ce8dd** — 2025-10-28 — Sherbivs — _logic intent:_ Update POKEMON_CACHE.md
  Files: `ops/POKEMON_CACHE.md`
- **229a268** — 2025-10-28 — Sherbivs — _logic intent:_ 1
  Files: `render.yaml`, `src/services/pokemonService.js`
- **c45bd5f** — 2025-10-28 — Sherbivs — _logic intent:_ k
  Files: `masterroutetable.md`, `ops/POKEMON_CACHE.md`, `ops/ROUTER.md`, `ops/ROUTER.yaml`, `ops/ROUTER_INDEX.yaml`, +6 more
- **ade3627** — 2025-10-28 — Sherbivs — _logic intent:_ Cleanup
  Files: `.db-state/db-connection.json`, `.env`, `ops/DB_BOOTSTRAP.md`, `ops/DB_IMPORT_PRISMA_POSTGRES.md`, `package-lock.json`, +8 more
- **f09346a** — 2025-10-28 — Sherbivs — _logic intent:_ DATABASE_CONNECTION_MODE` with logged `DATABASE_CONNECTION_SOURCE`; dry run validated the external endpoint in auto mode
  Files: `.db-state/db-connection.json`, `OPERATIONS.md`, `Patch.md`, `Prompt.md`, `ops/NEXT.yaml`, +11 more
- **501a7ec** — 2025-10-28 — Sherbivs — _logic intent:_ ,
  Files: `OPERATIONS.md`, `Patch.md`, `Prompt.md`, `ops/NEXT.yaml`, `src/shared/worker-runtime.ts`, +4 more
- **1d75845** — 2025-10-28 — Sherbivs — _logic intent:_ [Task T10.SCALE.OBS] Ship worker telemetry counters and schedule validation dry run
  Files: `OPERATIONS.md`, `Patch.md`, `Prompt.md`, `ops/NEXT.yaml`, `ops/TOUCHMAP.yaml`, +1 more
- **c1f3ffa** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `masterroutetable.md`
- **0dded04** — 2025-10-28 — Sherbivs — _logic intent:_ Update masterroutetable.md
  Files: `masterroutetable.md`
- **33c8a46** — 2025-10-28 — Sherbivs — _logic intent:_ Update masterroutetable.md
  Files: `masterroutetable.md`
- **fa56564** — 2025-10-28 — Sherbivs — _logic intent:_ Update ROUTER.md
  Files: `ops/ROUTER.md`
- **02f7919** — 2025-10-28 — Sherbivs — _logic intent:_ Update Prompt.md
  Files: `Prompt.md`
- **2d36dd4** — 2025-10-28 — Sherbivs — _logic intent:_ Update Prompt.md
  Files: `Prompt.md`
- **6ea5579** — 2025-10-28 — Sherbivs — _logic intent:_ Update Prompt.md
  Files: `Prompt.md`
- **6341200** — 2025-10-28 — Sherbivs — _logic intent:_ Update ROUTER_INDEX.yaml
  Files: `ops/ROUTER_INDEX.yaml`
- **64ebdc0** — 2025-10-28 — Sherbivs — _logic intent:_ Update ROUTER.md
  Files: `ops/ROUTER.md`
- **d099c6b** — 2025-10-28 — Sherbivs — _logic intent:_ Update ROUTER.yaml
  Files: `ops/ROUTER.yaml`
- **2e68ab1** — 2025-10-28 — Sherbivs — _logic intent:_ Update Patch.md
  Files: `Patch.md`
- **94652e9** — 2025-10-28 — Sherbivs — _logic intent:_ Update Prompt.md
  Files: `Prompt.md`
- **71295c2** — 2025-10-28 — Sherbivs — _logic intent:_ Update Prompt.md
  Files: `Prompt.md`
- **bc2cb56** — 2025-10-28 — Sherbivs — _logic intent:_ Update ROUTER_INDEX.yaml
  Files: `ops/ROUTER_INDEX.yaml`
- **fcbd128** — 2025-10-28 — Sherbivs — _logic intent:_ Update ROUTER.yaml
  Files: `ops/ROUTER.yaml`
- **ffff9f0** — 2025-10-28 — Sherbivs — _logic intent:_ z
  Files: `Patch.md`, `ops/ROUTER.md`
- **7e70beb** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `ops/ROUTER.yaml`
- **8f302b3** — 2025-10-28 — Sherbivs — _logic intent:_ z
  Files: `Patch.md`, `Prompt.md`, `masterroutetable.md`, `ops/ROUTER.md`, `ops/ROUTER.yaml`, +1 more
- **b1e6ff2** — 2025-10-28 — Sherbivs — _logic intent:_ Update Prompt.md
  Files: `Prompt.md`
- **1f41055** — 2025-10-28 — Sherbivs — _logic intent:_ Update Prompt.md
  Files: `Prompt.md`
- **1a23a4c** — 2025-10-28 — Sherbivs — _logic intent:_ Update Prompt.md
  Files: `Prompt.md`
- **e150729** — 2025-10-28 — Sherbivs — _logic intent:_ Update Prompt.md
  Files: `Prompt.md`
- **bfbf381** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `Prompt.md`, `ops/NEXT.yaml`
- **be1e10f** — 2025-10-28 — Sherbivs — _logic intent:_ Update tasklist.md
  Files: `tasklist.md`
- **252e65a** — 2025-10-28 — Sherbivs — _logic intent:_ Update tasklist.md
  Files: `tasklist.md`
- **2de996b** — 2025-10-28 — Sherbivs — _logic intent:_ Update tasklist.md
  Files: `tasklist.md`
- **9f1e4b8** — 2025-10-28 — Sherbivs — _logic intent:_ Update TOUCHMAP.yaml
  Files: `ops/TOUCHMAP.yaml`
- **606bc26** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `masterroutetable.md`, `ops/ROUTER_INDEX.yaml`
- **378ff5e** — 2025-10-28 — Sherbivs — _logic intent:_ Update masterroutetable.md
  Files: `masterroutetable.md`
- **d7c3e55** — 2025-10-28 — Sherbivs — _logic intent:_ Update ROUTER.md
  Files: `src/worker/ROUTER.md`
- **1dca2e6** — 2025-10-28 — Sherbivs — _logic intent:_ Update ROUTER.md
  Files: `src/bot/ROUTER.md`
- **d303f96** — 2025-10-28 — Sherbivs — _logic intent:_ Update ROUTER.md
  Files: `src/shared/ROUTER.md`
- **4c39efb** — 2025-10-28 — Sherbivs — _logic intent:_ Update ROUTER.md
  Files: `src/ROUTER.md`
- **13358d4** — 2025-10-28 — Sherbivs — _logic intent:_ Merge branch 'main' of https://github.com/Sherbivs/Infinity-Gauntlet
  Files: (no file changes detected)
- **5adf9aa** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `ops/ROUTER.md`
- **fe8a46b** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `OPERATIONS.md`
- **0262ee8** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `Patch.md`, `src/bot/main.js`
- **aa8803f** — 2025-10-28 — Sherbivs — _logic intent:_ Merge pull request #67 from Sherbivs/codex/fix-npm-run-prebuild-error-249
  Files: (no file changes detected)
- **0c17b0b** — 2025-10-28 — Sherbivs — _logic intent:_ Fix Render prebuild recursion and typing
  Files: `package.json`, `src/data_pipeline/index.ts`
- **03feb04** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `Prompt.md`
- **3bb5bed** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `Prompt.md`, `ops/NEXT.yaml`
- **916530d** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `ops/ROUTER.yaml`, `src/worker/ROUTER.md`
- **d2d04e0** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `ops/ROUTER.md`, `src/bot/main.js`
- **07983fb** — 2025-10-28 — Sherbivs — _logic intent:_ Merge branch 'main' of https://github.com/Sherbivs/Infinity-Gauntlet
  Files: (no file changes detected)
- **361fa3f** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `ops/ROUTER_INDEX.yaml`
- **73f716b** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `package.json`, `render.yaml`, `src/config/env.d.ts`, `src/config/env.js`, `src/index.ts`, +2 more
- **6d82d31** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `Prompt.md`, `ops/NEXT.yaml`, `ops/ROUTER.md`, `ops/ROUTER.yaml`, `package.json`, +2 more
- **bfed079** — 2025-10-28 — Sherbivs — _logic intent:_ ,
  Files: `ops/NEXT.yaml`
- **509af11** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `Prompt.md`, `ops/change-ledger.md`
- **8f1c003** — 2025-10-28 — Sherbivs — _logic intent:_ Create Prompt.md
  Files: `Prompt.md`
- **8106e8c** — 2025-10-28 — Sherbivs — _logic intent:_ Delete Prompt.md
  Files: `Prompt.md`
- **ab8367b** — 2025-10-28 — Sherbivs — _logic intent:_ Merge branch 'main' of https://github.com/Sherbivs/Infinity-Gauntlet
  Files: `Prompt.md`
- **404b530** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `Prompt.md`
- **4e6076a** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `Prompt.md`
- **48fced9** — 2025-10-28 — Sherbivs — _logic intent:_ ,
  Files: `Prompt.md`
- **59e1b44** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `Prompt.md`
- **3e5d18c** — 2025-10-28 — Sherbivs — _logic intent:_ Update Prompt.md
  Files: `Prompt.md`
- **f4dbe76** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `Prompt.md`, `masterroutetable.md`, `ops/NEXT.yaml`, `ops/ROUTER.md`, `ops/ROUTER.yaml`, +4 more
- **40f83ce** — 2025-10-28 — Sherbivs — _logic intent:_ [Task T10.SCALE.DB_BOOTSTRAP] Harden runtime DB configuration and close bootstrap loop
  Files: `Patch.md`, `Prompt.md`, `ops/NEXT.yaml`, `ops/ROUTER.md`, `ops/TOUCHMAP.yaml`, +13 more
- **a069bbe** — 2025-10-28 — Sherbivs — _logic intent:_ C:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet; $promptContent = @" # Prompt.md Timestamp (UTC): 2025-10-28T16:19:10Z Revision: 1.06  ## Last Repo …
  Files: `Prompt.md`, `scripts/update_change_ledger.mjs`
- **de2c729** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `scripts/update_change_ledger_unix.sh`
- **94d527e** — 2025-10-28 — Sherbivs — _logic intent:_ T10.SCALE.WORKERS
  Files: `Prompt.md`, `src/bot/ops/admin.ts`, `tests/ops.spec.ts`
- **546ce2e** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `README.md`, `agent.md`, `ops/DB_BOOTSTRAP.md`, `scripts/bootstrap_staging_db.ps1`
- **4a2eb06** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `ops/NEXT.yaml`, `tasklist.md`
- **5a9fab8** — 2025-10-28 — Sherbivs — _logic intent:_ Merge branch 'main' of https://github.com/Sherbivs/Infinity-Gauntlet
  Files: (no file changes detected)
- **07826c7** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `Patch.md`, `prisma/schema.prisma`, `src/env/ensure-db-url.ts`, `src/shared/config.ts`, `src/shared/prisma.ts`, +1 more
- **e22e2c5** — 2025-10-28 — Sherbivs — _logic intent:_ ,
  Files: `Prompt.md`, `ops/NEXT.yaml`, `tasklist.md`
- **0d5d2c3** — 2025-10-28 — Sherbivs — _logic intent:_ Merge branch 'main' of https://github.com/Sherbivs/Infinity-Gauntlet
  Files: (no file changes detected)
- **f71f6f4** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `Patch.md`, `Prompt.md`, `README.md`, `ops/NEXT.yaml`
- **61c3245** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `Patch.md`, `agent.md`, `masterroutetable.md`, `ops/ROUTER.md`, `ops/ROUTER.yaml`, +4 more
- **76b73b3** — 2025-10-28 — Sherbivs — _logic intent:_ Merge branch 'main' of https://github.com/Sherbivs/Infinity-Gauntlet
  Files: (no file changes detected)
- **d7be4ce** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `ops/DB_BOOTSTRAP.md`, `ops/ROUTER.yaml`, `scripts/bootstrap_staging_db.ps1`, `tasklist.md`
- **2e2f4e4** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `package-lock.json`, `package.json`, `pbsl-oracle-report.json`
- **14c4cc5** — 2025-10-28 — Sherbivs — _logic intent:_ Merge branch 'main' of https://github.com/Sherbivs/Infinity-Gauntlet
  Files: `prisma/migrations/migration_lock.toml`
- **d065fac** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `src/bot/ops/admin.ts`, `tests/ops.spec.ts`
- **e706ad2** — 2025-10-28 — Sherbivs — _logic intent:_ Update migration_lock.toml
  Files: `prisma/migrations/migration_lock.toml`
- **90b389e** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `prisma/migrations/migration_lock.toml`
- **8327ade** — 2025-10-28 — Sherbivs — _logic intent:_ .
  Files: `.env`, `DATA-SCHEMA.md`, `Patch.md`, `Prompt.md`, `ops/TOUCHMAP.yaml`, +5 more
- **ebe4b93** — 2025-10-27 — Sherbivs — _logic intent:_ [Task NONE] Refresh PBSL launch checklist
  Files: `Patch.md`, `Prompt.md`, `src/bot/dripAlerts.js`
- **bfc341d** — 2025-10-27 — Sherbivs — _logic intent:_ Change: None (hotfix scoped to existing task queue).
  Files: `Prompt.md`, `src/bot/dripAlerts.js`
- **ce15924** — 2025-10-27 — Sherbivs — _logic intent:_ [Task NONE] Refresh PBSL launch checklist
  Files: `Prompt.md`, `docs/PBSL.md`
- **d237eb3** — 2025-10-27 — Sherbivs — _logic intent:_ [Task NONE] Clear clipboard after CLEAR TASKS trigger
  Files: `Patch.md`, `Prompt.md`, `masterroutetable.md`, `ops/NEXT.yaml`, `ops/ROUTER_INDEX.yaml`, +4 more
- **2304461** — 2025-10-27 — Sherbivs — _logic intent:_ [Task META.ROUTER.REFRESH_20251027]
  Files: `Patch.md`, `ops/ROUTER.md`, `ops/ROUTER.yaml`, `ops/ROUTER_INDEX.yaml`, `src/bot/ROUTER.md`, +2 more
- **129dff6** — 2025-10-27 — Sherbivs — _logic intent:_ .
  Files: `Patch.md`, `Prompt.md`
- **46f3628** — 2025-10-27 — Sherbivs — _logic intent:_ [Task T6.3] Emit DRIP alerts for role assignments
  Files: `Patch.md`, `Prompt.md`, `ops/NEXT.yaml`, `ops/TOUCHMAP.yaml`, `src/bot/main.js`, +1 more
- **05ed26e** — 2025-10-27 — Sherbivs — _logic intent:_ 1
  Files: `src/bot/main.js`
- **c8b3755** — 2025-10-27 — Sherbivs — _logic intent:_ [Task PBSL.ORACLE_DIFF] Wire PBSL oracle fixtures, tests, and CI reporting
  Files: `.github/workflows/pbsl-oracle.yml`, `Patch.md`, `Prompt.md`, `docs/PBSL.md`, `ops/NEXT.yaml`, +4 more
- **1c0480c** — 2025-10-27 — Sherbivs — _logic intent:_ [Task PBSL.SKELETON] Scaffold PBSL deterministic core and governanc
  Files: `.github/workflows/pbsl-oracle.yml`, `Patch.md`, `Prompt.md`, `README.md`, `docs/PBSL.md`, +16 more
- **9da9a7d** — 2025-10-27 — Sherbivs — _logic intent:_ Merge pull request #65 from Sherbivs/codex/add-prisma-heartbeat-monitor-task
  Files: (no file changes detected)
- **d03fa15** — 2025-10-27 — Sherbivs — _logic intent:_ Enhance CLI monitoring telemetry
  Files: `src/bot/main.js`, `src/index.ts`, `src/services/cache.js`, `src/shared/prisma.ts`, `src/utils/cliStatus.js`
- **ca08cf7** — 2025-10-27 — Sherbivs — _logic intent:_ Converted the security bot sweeps to a continuous loop and moved ready handlers to `Events.ClientReady`.
  Files: `Prompt.md`, `src/index.ts`
- **ccdbb01** — 2025-10-27 — Sherbivs — _logic intent:_ .
  Files: `Patch.md`, `Prompt.md`, `src/bot/main.js`
- **fb343ed** — 2025-10-27 — Sherbivs — _logic intent:_ [Task NONE] Restore prisma export for DM flows
  Files: `Patch.md`, `Prompt.md`, `src/models/index.ts`
- **a699a9b** — 2025-10-27 — Sherbivs — _logic intent:_ Merge pull request #64 from Sherbivs/codex/fix-background-worker-import-error
  Files: (no file changes detected)
- **8038cca** — 2025-10-27 — Sherbivs — _logic intent:_ Fix starters prisma import
  Files: `src/bot/dm/starters.ts`
- **5498db9** — 2025-10-27 — Sherbivs — _logic intent:_ Merge pull request #63 from Sherbivs/codex/apply-unified-runtime-and-ci-guards-4rdu6j
  Files: (no file changes detected)
- **978e0fc** — 2025-10-27 — Sherbivs — _logic intent:_ Merge branch 'main' into codex/apply-unified-runtime-and-ci-guards-4rdu6j
  Files: `src/models/index.ts`
- **1cf66f7** — 2025-10-27 — Sherbivs — _logic intent:_ Fix prisma export in models index
  Files: `.github/workflows/runtime.yml`, `Patch.md`, `Prompt.md`, `README.md`, `masterroutetable.md`, +24 more
- **89a00cf** — 2025-10-27 — Sherbivs — _logic intent:_ Merge pull request #62 from Sherbivs/codex/apply-unified-runtime-and-ci-guards
  Files: (no file changes detected)
