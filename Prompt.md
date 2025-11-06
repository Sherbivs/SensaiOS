# Prompt.md
Timestamp (UTC): 2025-11-06T04:50:45Z
Revision: 2.19

## Last Repo Changes (since previous Prompt.md revision)
- Synced scripts/Store/ops router manifests plus master routing tables so the new `npm run ops:auto-bootstrap-local-db` path and PowerShell helpers are discoverable with refreshed 2025-11-06T04:45Z timestamps.
- Extended `ops/TOUCHMAP.yaml` to cover AGENTS.md and masterroutetable.md for T13.DEX.V2_PROD_CUTOVER, updating Tasklist notes and rerunning the routing guard for evidence.
- `scripts/guard_routing.sh` now passes with the expanded coverage; continue running it after router/doc changes to keep metadata aligned.

## Purpose & Scope
- Canonical brief for automation: captures current mission, guardrails, and truth sources so every run starts aligned.
- Complements Patch.md (process contract) and Tasklist.md (work graph); never diverge from those authorities.

## Activation Checklist & Fallback
1. Ensure Patch.md, Tasklist.md, Prompt.md, ops/NEXT.yaml, and ops/TOUCHMAP.yaml open cleanly; halt if any are missing or unreadable.
2. Read ops/NEXT.yaml and confirm the READY queue in Tasklist.md matches; if READY is empty, apply the guard policy to promote/inject tasks before continuing.
3. Review the PATCHSET echo in Patch.md and the latest entries in ops/change-ledger.md for context on outstanding risks.
4. If router manifests (ops/ROUTER.yaml, ops/ROUTER_INDEX.yaml, masterroutetable.md) diverge from working intent, regenerate via scripts/update_router_index.sh and scripts/refresh_vision.sh before editing.
5. When Git remote validation or CI guards fail locally, stop and request human assistance rather than proceeding.

- **NEXT Pointer:** T13.DEX.V2_PROD_CUTOVER — execute the Nov 5 canary ladder now that backups and recovery rehearsal are complete.
- **READY / In-flight:** T13.DEX.V2_PROD_CUTOVER is READY for the window; follow-up tasks will re-open once the cutover begins.
- **Recent Finish:** DB.V0.BACKUP_DR closed with fresh backup hashes, schema extract rehearsal, and documentation updates.

## System Highlights
- **Database:** Runtime uses `DATABASE_CONNECTION_MODE` with logged `DATABASE_CONNECTION_SOURCE`; dry run validated the external endpoint in auto mode.
- **Workers & Scaling:** Dedicated outbox/cache/data-pipeline/security workers run under pooled env wiring; ENABLE_SECURITY_BOT + ENABLE_CONTINUOUS_SWEEP gate sweeps so only the security worker loops in production.
- **Observability:** Worker telemetry now auto-logs via `worker.metrics.snapshot`; queue depth warns ≥50, cache stale alerts >30m, pipeline stale alerts >8h, and `worker.alert.*` escalations flag repeated failures ahead of the scheduled load test.
- **Ledger:** Prompt now carries a curated 10-commit summary; run npm run docs:update-ledger to refresh both this summary and ops/change-ledger.md.
- **Testing Posture:** Vitest suites (ops, dm_home, daily, battle) and Prisma smoke tests cover current bootstrap guarantees—rerun targeted suites when touching those areas (ops stats suite now requires the helper mocks).

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
Change: Touchmap now includes AGENTS/master router entries, Tasklist logs the coverage, and `scripts/guard_routing.sh` succeeded after the update.
TasklistDiff: true
Tests: "C:/Program Files/Git/bin/bash.exe" scripts/guard_routing.sh (pass).
Contracts: ON
NEXT: T13.DEX.V2_PROD_CUTOVER - ladder stays READY with automation tooling and routing guard coverage confirmed.
<!-- PATCHSET:ECHO END -->

## Recent Change Ledger (last 10 commits)
<!-- LEDGER:BEGIN -->

**Generated:** 2025-11-01T21:12:55Z  |  **Branch:** main
**Note:** Full 200-entry ledger lives in ops/change-ledger.md

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

<!-- LEDGER:END -->

## AI Worker Prompt (copy/paste for Copilot/GPT)
You are GitHub Copilot operating under the Infinity Gauntlet contract.

1. Read ops/NEXT.yaml, Tasklist.md, ops/TOUCHMAP.yaml, Patch.md, then this Prompt.md before editing.
2. Work only on READY tasks whose dependencies are DONE; do not self-assign PROPOSED items.
3. Keep edits minimal and reversible; update Tasklist.md, ops/NEXT.yaml, Prompt.md, and relevant routers in the same PATCHSET.
4. Run targeted tests (Vitest suites, Prisma migrate deploy) when touching runtime code; record results in the PATCHSET echo and commit message.
5. Ensure the embedded PATCHSET Echo, Last Repo Changes, and LEDGER markers stay populated; restore clipboard markers in Patch.md if accidentally removed.
6. Finish every run with a READY pointer in ops/NEXT.yaml and clear rationale in the PATCHSET echo.
