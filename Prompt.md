# Prompt.md
Timestamp (UTC): 2025-11-01T03:52:00Z
Revision: 1.61

## Last Repo Changes (since previous Prompt.md revision)
- Delivered `src/services/cache/facade.ts` with namespace/shard-aware LRU + disk persistence and validated it via `tests/services/cache.facade.spec.ts`.
- Exported shared cache constants for reuse, added services to `tsconfig.build.json`, and updated module declarations to cover both `.js` import paths.
- Documented the runtime cache path in AGENTS.md and retargeted NEXT to META.DB.CONNECTION_GUARD_CI_TRACK while Actions UI (guard-db-docs) remains 404 without auth.
- Hardened `scripts/dev_prod_auto_sync.ts` so migrate/seed inherit env-specific credentials, migrations force direct URLs, hung commands time out, and Optimize SpeciesSheet preflight logs missing grants.
- Logged the guard_db_docs baseline in Tasklist.md (✅ `node scripts/guard_db_docs.mjs`) and documented remediation steps while queueing META.DB.CONNECTION_GUARD_CI_TRACK for the first CI run.

## Purpose & Scope
- Canonical brief for automation: captures current mission, guardrails, and truth sources so every run starts aligned.
- Complements Patch.md (process contract) and Tasklist.md (work graph); never diverge from those authorities.

## Activation Checklist & Fallback
1. Ensure Patch.md, Tasklist.md, Prompt.md, ops/NEXT.yaml, and ops/TOUCHMAP.yaml open cleanly; halt if any are missing or unreadable.
2. Read ops/NEXT.yaml and confirm the READY queue in Tasklist.md matches; if READY is empty, apply the guard policy to promote/inject tasks before continuing.
3. Review the PATCHSET echo in Patch.md and the latest entries in ops/change-ledger.md for context on outstanding risks.
4. If router manifests (ops/ROUTER.yaml, ops/ROUTER_INDEX.yaml, masterroutetable.md) diverge from working intent, regenerate via scripts/update_router_index.sh and scripts/refresh_vision.sh before editing.
5. When Git remote validation or CI guards fail locally, stop and request human assistance rather than proceeding.

- **NEXT Pointer:** META.DB.CONNECTION_GUARD_CI_TRACK — record the first passing guard-db-docs CI run once Actions history is visible.
- **READY / In-flight:** META.DB.CONNECTION_GUARD_CI_TRACK READY; guard Actions page currently returns 404 without authentication so we still need the first success details.
- **Recent Finish:** T13.DEX.AUTO_SYNC_TRIGGER wired the PokéAPI fetch trigger into the automation loop so dex consolidations fire when fresh cache data lands and log the trigger metadata for audits.

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
Change: Landed the typed runtime cache facade with tests/docs and retargeted NEXT to the guard-db-docs CI tracker (Actions still 404 unauthenticated).
TasklistDiff: true
Tests: npx vitest run tests/services/cache.facade.spec.ts
Contracts: ON
NEXT: META.DB.CONNECTION_GUARD_CI_TRACK - awaiting the first guard-db-docs success (Actions UI currently 404 without login).
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
