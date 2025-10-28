# Prompt.md
Timestamp (UTC): 2025-10-28T16:19:10Z
Revision: 1.06

## Last Repo Changes (since previous Prompt.md revision)
- Added a Node-based ledger updater and pointed the shell/npm wrappers at it for cross-platform runs.
- Cleaned Prompt.md conflict remnants and refreshed the contract metadata ahead of a scripted ledger update.

## Purpose & Scope
- Canonical brief for automation: captures current mission, guardrails, and truth sources so every run starts in sync.
- Complements Patch.md (process contract) and Tasklist.md (work graph); never diverge from those authorities.

## Activation Checklist & Fallback
- Confirm readability of Patch.md, Tasklist.md, Prompt.md, ops/NEXT.yaml before planning; halt if any are unavailable.
- Review ops/NEXT.yaml and Tasklist.md to ensure the READY queue matches the stated next task; auto-promote if policy requires.
- Optional shell access: run scripts/refresh_vision.sh to regenerate routing indices; when unavailable, note the limitation in the PATCHSET echo.
- If remote context (GitHub origin) cannot be validated, record the failure reason and request human assistance.

## Active Mission Snapshot
- **NEXT Pointer:** T10.SCALE.WORKERS — separate background workers so pooled DB connections remain fast under load.
- **READY Queue Highlights:** T10.SCALE.WORKERS (primary), META.RUNTIME.BACKUP_SINK (follow-up once worker split is stable), T8.4 (daily claim button) remains PROPOSED pending DM UI wiring.
- **Recent Finish:** T10.SCALE.DB_BOOTSTRAP is DONE; pooled vs. direct URL strategy, retryable Prisma connect, and documentation now aligned.

## System Highlights
- **Database:** Runtime prefers DATABASE_POOL_URL with fallback to DATABASE_DIRECT_URL; Prisma directUrl is reserved for migrations; tests set PRISMA_SKIP_INITIAL_CONNECT.
- **Workers & Scaling:** Current deployment still runs a unified worker; separation work must update render.yaml, src/worker/**, and relevant routers.
- **Observability:** Structured logs exist; advanced metrics/alerts remain a future task (T10.SCALE.OBS PROPOSED).
- **Testing Posture:** Vitest suites for ops, DM Home, and daily flows cover DB bootstrap behaviour; rerun targeted suites when touching related code.

## Evidence Matrix
- infra — ops/NEXT.yaml, ops/CRITICAL.md, render.yaml, src/shared/config.ts.
- discord_bot — Tasklist.md, ops/TOUCHMAP.yaml, src/bot/**.
- battle_engine — src/core/battle/**, RULESET.md.
- encounters — src/core/encounter/**, DATA-SCHEMA.md.
- data_pipeline — src/core/data_pipeline/**, data/**, scripts/build-data.js.
- persistence — prisma/schema.prisma, src/models/**, migrations/**.
- security — Prompt.md, RULESET.md, src/shared/**.
- observability — Prompt.md, OPERATIONS.md, src/shared/log.ts.

## Assumptions / TBD Register
- Worker separation will reuse existing Prisma client logic; no new ORM package expected.
- Render environment allows defining dedicated services for workers with independent scaling controls.
- Observability improvements remain deferred until after workers split; ensure no regression to current logging guarantees.

## Validation Checklist
- Touched directories must update their ROUTER.md entries and regenerate ops/ROUTER_INDEX.yaml via scripts/update_router_index.sh.
- Any change impacting readiness requires Prompt.md timestamp/revision bump plus Tasklist/NEXT synchronization.
- Run npx prisma migrate deploy before production deploys; ensure DATABASE_DIRECT_URL present in env when running migrations.
- Execute relevant Vitest suites (ops, dm_home, daily, affected modules) or document why tests were skipped.

## Diagram Conventions
- Use ASCII block diagrams with [] for systems and --> for directional relationships.
- Label data stores explicitly (e.g., [Render Postgres]) to avoid ambiguity.
- Include legend when introducing new notation; keep diagrams under 80 characters wide for readability.

## Embedded PATCHSET Echo
<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local
Change: Wired the Prompt ledger refresh through the Node helper and cleared stale conflict artifacts; ledger now auto-generates from git history.
TasklistDiff: false
Tests: not run (automation update only)
Contracts: ON (clipboard marker retained in Patch.md)
NEXT: T10.SCALE.WORKERS — split sweep/cache workers so pooled connections stay responsive.
<!-- PATCHSET:ECHO END -->

## Recent Change Ledger (last 200 commits)
<!-- LEDGER:BEGIN -->
Ledger pending refresh via scripts/update_change_ledger.mjs.
<!-- LEDGER:END -->

## AI Worker Prompt (copy/paste for Copilot/GPT)
You are GitHub Copilot operating under the Infinity Gauntlet contract.

1. Read ops/NEXT.yaml, Tasklist.md, ops/TOUCHMAP.yaml, Patch.md, then this Prompt.md before editing.
2. Work only on READY tasks whose dependencies are DONE; do not self-assign PROPOSED items.
3. Keep edits minimal and reversible; update Tasklist.md, ops/NEXT.yaml, Prompt.md, and relevant routers in the same PATCHSET.
4. Run targeted tests (Vitest suites, Prisma migrate deploy) when touching runtime code; record results in the PATCHSET echo and commit message.
5. Ensure the Embedded PATCHSET Echo, Last Repo Changes, and ledger markers remain populated; restore clipboard markers in Patch.md if removed by accident.
6. Finish every run with a READY pointer in ops/NEXT.yaml and clear rationale in the PATCHSET echo.
# Prompt.md
Timestamp (UTC): 2025-10-28T16:19:10Z
Revision: 1.06

## Last Repo Changes (since previous Prompt.md revision)
- Added a Node-based ledger updater and pointed the shell/npm wrappers at it for cross-platform runs.
- Cleaned Prompt.md conflict remnants and refreshed the contract metadata ahead of a scripted ledger update.

## Purpose & Scope
- Canonical brief for automation: captures current mission, guardrails, and truth sources so every run starts in sync.
- Complements Patch.md (process contract) and Tasklist.md (work graph); never diverge from those authorities.

## Activation Checklist & Fallback
- Confirm readability of Patch.md, Tasklist.md, Prompt.md, ops/NEXT.yaml before planning; halt if any are unavailable.
- Review ops/NEXT.yaml and Tasklist.md to ensure the READY queue matches the stated next task; auto-promote if policy requires.
- Optional shell access: run scripts/refresh_vision.sh to regenerate routing indices; when unavailable, note the limitation in the PATCHSET echo.
- If remote context (GitHub origin) cannot be validated, record the failure reason and request human assistance.

## Active Mission Snapshot
- **NEXT Pointer:** T10.SCALE.WORKERS — separate background workers so pooled DB connections remain fast under load.
- **READY Queue Highlights:** T10.SCALE.WORKERS (primary), META.RUNTIME.BACKUP_SINK (follow-up once worker split is stable), T8.4 (daily claim button) remains PROPOSED pending DM UI wiring.
- **Recent Finish:** T10.SCALE.DB_BOOTSTRAP is DONE; pooled vs. direct URL strategy, retryable Prisma connect, and documentation now aligned.

## System Highlights
- **Database:** Runtime prefers DATABASE_POOL_URL with fallback to DATABASE_DIRECT_URL; Prisma directUrl is reserved for migrations; tests set PRISMA_SKIP_INITIAL_CONNECT.
- **Workers & Scaling:** Current deployment still runs a unified worker; separation work must update render.yaml, src/worker/**, and relevant routers.
- **Observability:** Structured logs exist; advanced metrics/alerts remain a future task (T10.SCALE.OBS PROPOSED).
- **Testing Posture:** Vitest suites for ops, DM Home, and daily flows cover DB bootstrap behaviour; rerun targeted suites when touching related code.

## Evidence Matrix
- infra — ops/NEXT.yaml, ops/CRITICAL.md, render.yaml, src/shared/config.ts.
- discord_bot — Tasklist.md, ops/TOUCHMAP.yaml, src/bot/**.
- battle_engine — src/core/battle/**, RULESET.md.
- encounters — src/core/encounter/**, DATA-SCHEMA.md.
- data_pipeline — src/core/data_pipeline/**, data/**, scripts/build-data.js.
- persistence — prisma/schema.prisma, src/models/**, migrations/**.
- security — Prompt.md, RULESET.md, src/shared/**.
- observability — Prompt.md, OPERATIONS.md, src/shared/log.ts.

## Assumptions / TBD Register
- Worker separation will reuse existing Prisma client logic; no new ORM package expected.
- Render environment allows defining dedicated services for workers with independent scaling controls.
- Observability improvements remain deferred until after workers split; ensure no regression to current logging guarantees.

## Validation Checklist
- Touched directories must update their ROUTER.md entries and regenerate ops/ROUTER_INDEX.yaml via scripts/update_router_index.sh.
- Any change impacting readiness requires Prompt.md timestamp/revision bump plus Tasklist/NEXT synchronization.
- Run npx prisma migrate deploy before production deploys; ensure DATABASE_DIRECT_URL present in env when running migrations.
- Execute relevant Vitest suites (ops, dm_home, daily, affected modules) or document why tests were skipped.

## Diagram Conventions
- Use ASCII block diagrams with [] for systems and --> for directional relationships.
- Label data stores explicitly (e.g., [Render Postgres]) to avoid ambiguity.
- Include legend when introducing new notation; keep diagrams under 80 characters wide for readability.

## Embedded PATCHSET Echo
<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local
Change: Wired the Prompt ledger refresh through the Node helper and cleared stale conflict artifacts; ledger now auto-generates from git history.
TasklistDiff: false
Tests: not run (automation update only)
Contracts: ON (clipboard marker retained in Patch.md)
NEXT: T10.SCALE.WORKERS — split sweep/cache workers so pooled connections stay responsive.
<!-- PATCHSET:ECHO END -->

## Recent Change Ledger (last 200 commits)
<!-- LEDGER:BEGIN -->
Ledger pending refresh via scripts/update_change_ledger.mjs.
<!-- LEDGER:END -->

## AI Worker Prompt (copy/paste for Copilot/GPT)
You are GitHub Copilot operating under the Infinity Gauntlet contract.

1. Read ops/NEXT.yaml, Tasklist.md, ops/TOUCHMAP.yaml, Patch.md, then this Prompt.md before editing.
2. Work only on READY tasks whose dependencies are DONE; do not self-assign PROPOSED items.
3. Keep edits minimal and reversible; update Tasklist.md, ops/NEXT.yaml, Prompt.md, and relevant routers in the same PATCHSET.
4. Run targeted tests (Vitest suites, Prisma migrate deploy) when touching runtime code; record results in the PATCHSET echo and commit message.
5. Ensure the Embedded PATCHSET Echo, Last Repo Changes, and ledger markers remain populated; restore clipboard markers in Patch.md if removed by accident.
6. Finish every run with a READY pointer in ops/NEXT.yaml and clear rationale in the PATCHSET echo.
