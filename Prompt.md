# Prompt.md
Timestamp (UTC): 2025-10-28T22:55:00Z
Revision: 1.14

## Last Repo Changes (since previous Prompt.md revision)
- Gated security sweeps behind ENABLE_CONTINUOUS_SWEEP so only the dedicated Render worker runs continuous loops; CLI now logs when sweeps are disabled.
- Replaced OPERATIONS.md stub with a worker matrix, rollout checklist, recovery toggles, and quick commands for operators.
- Refreshed ops/router metadata (ops/ROUTER.md, src/**/ROUTER.md, masterroutetable.md, ops/ROUTER_INDEX.yaml) to document the worker runtime helper and updated ownership map.

## Purpose & Scope
- Canonical brief for automation: captures current mission, guardrails, and truth sources so every run starts aligned.
- Complements Patch.md (process contract) and Tasklist.md (work graph); never diverge from those authorities.

## Activation Checklist & Fallback
1. Ensure Patch.md, Tasklist.md, Prompt.md, ops/NEXT.yaml, and ops/TOUCHMAP.yaml open cleanly; halt if any are missing or unreadable.
2. Read ops/NEXT.yaml and confirm the READY queue in Tasklist.md matches; if READY is empty, apply the guard policy to promote/inject tasks before continuing.
3. Review the PATCHSET echo in Patch.md and the latest entries in ops/change-ledger.md for context on outstanding risks.
4. If router manifests (ops/ROUTER.yaml, ops/ROUTER_INDEX.yaml, masterroutetable.md) diverge from working intent, regenerate via scripts/update_router_index.sh and scripts/refresh_vision.sh before editing.
5. When Git remote validation or CI guards fail locally, stop and request human assistance rather than proceeding.

## Active Mission Snapshot
- **NEXT Pointer:** T10.SCALE.WORKERS — split sweep/cache workers so pooled Prisma connections stay responsive under load.
- **READY / In-flight:** Worker split remains primary; META.RUNTIME.BACKUP_SINK is queued next; T8.4 daily claim button stays PROPOSED pending DM UI adjustments.
- **Recent Finish:** T10.SCALE.DB_BOOTSTRAP delivered pooled vs direct DB strategy, retryable Prisma connects, and aligned docs/tests.

## System Highlights
- **Database:** Runtime prefers DATABASE_POOL_URL with DATABASE_DIRECT_URL fallback; Prisma migrate retains directUrl; tests set PRISMA_SKIP_INITIAL_CONNECT.
- **Workers & Scaling:** Render now deploys dedicated outbox/cache/data-pipeline/security workers with pooled env wiring and ENABLE_SECURITY_BOT gating; shared runtime bypasses the sweep when the flag is false.
- **Observability:** Structured logs, worker health telemetry, and CLI monitor are online; additional metrics/alerts tracked under T10.SCALE.OBS (PROPOSED).
- **Ledger:** Prompt now carries a curated 10-commit summary; run npm run docs:update-ledger to refresh both this summary and ops/change-ledger.md.
- **Testing Posture:** Vitest suites (ops, dm_home, daily, battle) and Prisma smoke tests cover current bootstrap guarantees—rerun targeted suites when touching those areas.

## Evidence Matrix
| Domain | Primary Sources | Notes |
| --- | --- | --- |
| infra | ops/NEXT.yaml, ops/CRITICAL.md, render.yaml, src/shared/config.ts | Worker split guidance + runtime config |
| discord_bot | Tasklist.md, ops/TOUCHMAP.yaml, src/bot/** | Queue & routing for Discord surfaces |
| battle_engine | src/core/battle/**, RULESET.md, tests/battle_engine.spec.ts | Engine, announcer, persistence |
| encounters | src/core/encounter/**, DATA-SCHEMA.md | Spawn/catch logic and schema |
| data_pipeline | src/core/data_pipeline/**, data/**, scripts/build-data.js | Pipeline + cached assets |
| persistence | prisma/schema.prisma, src/models/**, migrations/** | Prisma schema + models |
| security | Prompt.md, RULESET.md, src/shared/** | Guards, logging, access policies |
| observability | Prompt.md, OPERATIONS.md, src/shared/log.ts | Logging + monitoring controls |
| ledger | Prompt.md (summary), ops/change-ledger.md (full 200) | Generated via docs:update-ledger |

## Assumptions / TBD Register
- Render environment supports dedicated worker services with independent scaling and shared env configuration.
- Worker separation will reuse current Prisma client patterns; no alternate ORM intended.
- Observability expansion (metrics/alerts) is deferred until the worker split stabilizes; ensure no regression to structured logging baseline.
- Security worker remains gated via ENABLE_SECURITY_BOT; keep fallback sweep path documented until the flag is confidently enabled in all environments.

## Validation Checklist
- Touching a directory requires updating its ROUTER.md entry and running scripts/update_router_index.sh; commit the regenerated ops/ROUTER_INDEX.yaml.
- Bump Prompt/Tasklist/Patch timestamps and revisions whenever readiness or scope changes.
- Run npx prisma migrate deploy before production deploys; ensure DATABASE_DIRECT_URL is present.
- Execute relevant Vitest suites (ops, dm_home, daily, affected modules) or document skips in the PATCHSET echo.

## Diagram Conventions
- Use ASCII: systems in [brackets], arrows as -->, label data stores explicitly (e.g., [Render Postgres]).
- Keep diagrams <= 80 characters wide and include a legend when introducing new notation.

## Embedded PATCHSET Echo
<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local
Change: Introduced dedicated security worker with ENABLE_SECURITY_BOT gating, added worker health telemetry, and refreshed router docs/scripts for the split deployment.
TasklistDiff: false
Tests: not run (documentation cleanup)
Contracts: ON
NEXT: T10.SCALE.WORKERS — validate ENABLE_SECURITY_BOT rollout, document fallback path, and retire legacy sweep code once production telemetry is stable.
<!-- PATCHSET:ECHO END -->

## Recent Change Ledger (last 10 commits)
<!-- LEDGER:BEGIN -->

**Generated:** 2025-10-28T19:09:49Z  |  **Branch:** main
**Note:** Full 200-entry ledger lives in ops/change-ledger.md

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

<!-- LEDGER:END -->

## AI Worker Prompt (copy/paste for Copilot/GPT)
You are GitHub Copilot operating under the Infinity Gauntlet contract.

1. Read ops/NEXT.yaml, Tasklist.md, ops/TOUCHMAP.yaml, Patch.md, then this Prompt.md before editing.
2. Work only on READY tasks whose dependencies are DONE; do not self-assign PROPOSED items.
3. Keep edits minimal and reversible; update Tasklist.md, ops/NEXT.yaml, Prompt.md, and relevant routers in the same PATCHSET.
4. Run targeted tests (Vitest suites, Prisma migrate deploy) when touching runtime code; record results in the PATCHSET echo and commit message.
5. Ensure the embedded PATCHSET Echo, Last Repo Changes, and LEDGER markers stay populated; restore clipboard markers in Patch.md if accidentally removed.
6. Finish every run with a READY pointer in ops/NEXT.yaml and clear rationale in the PATCHSET echo.
