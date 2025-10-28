# Prompt.md
Timestamp (UTC): 2025-10-28T20:55:00Z
Revision: 1.10
## Last Repo Changes (since previous Prompt.md revision)
Rebuilt Prompt.md to restore the canonical contract structure after the ledger refactor and revalidated guard expectations.
Confirmed the 10-entry ledger summary now points to `ops/change-ledger.md` for the full 200-commit history; `npm run docs:update-ledger` remains the source of truth.
Captured the worker-split parking lot in the Mission Snapshot and refreshed evidence links to match the current staging state.
- Captured the worker-split parking lot in the Mission Snapshot and refreshed evidence links to match the current staging state.

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
**NEXT Pointer:** `T10.SCALE.WORKERS` — separate background workers so pooled DB connections remain fast under load.
**READY / IN-FLIGHT:** `T10.SCALE.WORKERS` is executing; `META.RUNTIME.BACKUP_SINK` stays queued behind it and `T8.4` (daily button) remains PROPOSED pending DM UI wiring.
**Recent Finish:** `T10.SCALE.DB_BOOTSTRAP` is DONE; pooled vs. direct URL strategy, retryable Prisma connect, and documentation now aligned.

## System Highlights
**Database:** Runtime prefers `DATABASE_POOL_URL` with fallback to `DATABASE_DIRECT_URL`; Prisma directUrl is reserved for migrations; tests set `PRISMA_SKIP_INITIAL_CONNECT`.
**Workers & Scaling:** Current deployment still runs a unified worker; separation work must update `render.yaml`, `src/worker/**`, and relevant routers.
**Observability:** Structured logs exist; advanced metrics/alerts remain a future task (T10.SCALE.OBS PROPOSED).
**Testing Posture:** Vitest suites for ops, DM Home, and daily flows cover DB bootstrap behaviour; rerun targeted suites when touching related code.

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

## Validation Checklist

## Diagram Conventions

## Embedded PATCHSET Echo
<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local
Change: Cleansed Prompt.md of duplicate sections, restored canonical markers, and refreshed metadata after the regression.
TasklistDiff: false
Tests: not run (documentation cleanup)
Contracts: ON
NEXT: T10.SCALE.WORKERS — continue the worker split by updating render config, worker services, and routers.
<!-- PATCHSET:ECHO END -->

## Recent Change Ledger (last 10 commits)
<!-- LEDGER:BEGIN -->
**Generated:** 2025-10-28T20:55:00Z  |  **Branch:** main

- **40f83ce** — 2025-10-28 — Hardened runtime DB configuration and completed the T10.SCALE.DB_BOOTSTRAP sweep (worker runtime, scripts, docs, tests).
- **a069bbe** — 2025-10-28 — Scripted Prompt ledger refresh via Node helper and cleared stale conflict remnants ahead of automation.
- **de2c729** — 2025-10-28 — Added Unix wrapper for the updated ledger script to keep cross-platform CI aligned.
- **94d527e** — 2025-10-28 — Advanced T10.SCALE.WORKERS with admin routing tweaks and ops test updates.
- **546ce2e** — 2025-10-28 — Synced meta docs (README, agent brief, DB bootstrap guide, staging bootstrap script).
- **4a2eb06** — 2025-10-28 — Updated NEXT pointer, router manifest, and tasklist to reflect worker split sequencing.
- **5a9fab8** — 2025-10-28 — Merged main to capture upstream changes before continuing scale work.
- **07826c7** — 2025-10-28 — Refined database URL handling and worker runtime bindings across env/config modules.
- **e22e2c5** — 2025-10-28 — Coordinated Prompt/NEXT/tasklist alignment for the current scaling effort.
- **0d5d2c3** — 2025-10-28 — Merged main after alignment updates to keep history linear.

Full 200-entry history: ops/change-ledger.md
<!-- LEDGER:END -->

## AI Worker Prompt (copy/paste for Copilot/GPT)
You are GitHub Copilot operating under the Infinity Gauntlet contract.

1. Read ops/NEXT.yaml, Tasklist.md, ops/TOUCHMAP.yaml, Patch.md, then this Prompt.md before editing.
2. Work only on READY tasks whose dependencies are DONE; do not self-assign PROPOSED items.
3. Keep edits minimal and reversible; update Tasklist.md, ops/NEXT.yaml, Prompt.md, and relevant routers in the same PATCHSET.
4. Run targeted tests (Vitest suites, Prisma migrate deploy) when touching runtime code; record results in the PATCHSET echo and commit message.
5. Ensure the embedded PATCHSET Echo, Last Repo Changes, and LEDGER markers stay populated; restore clipboard markers in Patch.md if accidentally removed.
6. Finish every run with a READY pointer in ops/NEXT.yaml and clear rationale in the PATCHSET echo.
