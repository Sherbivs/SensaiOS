# Prompt.md
Timestamp (UTC): 2025-11-21T12:30:00Z
Revision: 3.2

**Cross-References**:
- See `Patch.md` for contract rules (updated 2025-11-07T22:00:00Z Rev 1.72)
- See `Tasklist.md` for backlog and active tasks
- See `ops/NEXT.yaml` for current task pointer
- See `docs/architecture-bible/INDEX.md` for architecture documentation
- See `docs/operations-bible/INDEX.md` for operational procedures
- See `docs/development-bible/INDEX.md` for development workflows

## Purpose & Scope
- Canonical brief for automation: captures current mission, guardrails, and truth sources so every run starts aligned.
- Complements Patch.md (process contract) and Tasklist.md (work graph); never diverge from those authorities.

## Activation Checklist & Fallback
1. Ensure Patch.md, Tasklist.md, Prompt.md, and ops/NEXT.yaml open cleanly; halt if any are missing or unreadable.
2. Read ops/NEXT.yaml and confirm the READY queue in Tasklist.md matches; if READY is empty, apply the guard policy to promote/inject tasks before continuing.
3. Review the PATCHSET echo in Patch.md for context on outstanding risks.
4. If router manifests (ops/ROUTER.yaml, ops/ROUTER_INDEX.yaml, masterroutetable.md) diverge from working intent, regenerate via `npm run docs:update-routers` before editing.
5. When Git remote validation or CI guards fail locally, stop and request human assistance rather than proceeding.

- **NEXT Pointer:** Multi-task queue system (3 main + 1 quick/hot task allowed)
  - **Main Tasks (2/3 active):**
    1. DB.NORTHSTAR.ANALYTICS — Build analytics jobs (generate_daily_stats.ts, refresh_leaderboards.ts) with aggregation logic (daily active users, popular species, battle win rates, achievement completion rates), schedule via cron or worker, add export capabilities (CSV, JSON).
    2. ARCHITECTURE.HOMESTEAD_CHANNELS.FOUNDATION — **MAJOR ARCHITECTURE PIVOT**: Migrate from DM-based gameplay to private guild channels. Foundation phase: Create HomesteadChannelManager service, add HomesteadChannel database schema, implement channel creation/permissions/lookup logic, write unit tests.
  - **Quick Task Slot:** Available for bug fixes, documentation updates, or hotfixes (<30 min work)
- **READY / In-flight:** Two parallel streams: DB.NORTHSTAR.ANALYTICS (analytics layer) + ARCHITECTURE.HOMESTEAD_CHANNELS.FOUNDATION (gameplay architecture overhaul). Private channel migration is a 6-phase project affecting 10 DM call sites, 4 modules, 6 feature areas.

## System Highlights
- **Database:** Production uses unified Render-managed PostgreSQL (`PROD_DATABASE_URL`) for all operations. Optional workstation development via `DATABASE_ONPREMISE_DEV_PRIMARY` (offline fallback). Migrations use direct PostgreSQL mode via `RENDER_DB_EXTERNAL_URL`. See `operations-bible/02-database-operations.md` for complete URL selection logic.
- **Workers & Scaling:** Dedicated outbox/cache/data-pipeline/security workers run under pooled env wiring; ENABLE_SECURITY_BOT + ENABLE_CONTINUOUS_SWEEP gate sweeps so only the security worker loops in production.
- **Documentation:** Bible system is authoritative for all permanent documentation (architecture-bible/, operations-bible/, development-bible/). ops/ folder contains only routing infrastructure (NEXT.yaml, ROUTER files).
- **Testing Posture:** Vitest suites (293/294 passing) cover ops, dm_home, daily, battle flows. Prisma smoke tests validate database connectivity.

## Evidence Matrix
| Domain | Primary Sources | Notes |
| --- | --- | --- |
| infra | ops/NEXT.yaml, render.yaml, operations-bible/ | Worker split guidance + deployment |
| discord_bot | architecture-bible/10-discord-bot.md, src/bot/** | Discord surfaces + command routing |
| battle_engine | architecture-bible/09-game-engine.md, src/core/battle/** | Deterministic battle mechanics |
| encounters | architecture-bible/09-game-engine.md, src/core/encounter/** | Spawn/catch logic |
| data_pipeline | src/data_pipeline/**, data/**, scripts/fetch_pokemon.mjs | PokéAPI integration |
| persistence | operations-bible/02-database-operations.md, prisma/schema.prisma | Schema + migrations |
| observability | architecture-bible/12-observability.md, src/shared/log.ts | Logging + monitoring |

## Recent Change Ledger (last 10 commits)
<!-- LEDGER:BEGIN -->

**Generated:** 2025-11-17T08:50:00Z  |  **Branch:** main

- **a40218e** — 2025-11-17 — Sherbivs — Remove obsolete files and logs from ops/ directory
- **fec4aeb** — 2025-11-17 — Sherbivs — [Documentation Consolidation] Archive ops/ historical reports
- **90c292c** — 2025-11-17 — Sherbivs — [Phase 2 Cleanup] Remove phantom documentation references
- **4478f12** — 2025-11-17 — Sherbivs — [Phase 2 COMPLETE] Router System Audit: 21 files synchronized
- **b1008b5** — 2025-11-17 — Sherbivs — [Phase 2] Router System Audit - Part 2: Bible reference migration
- **c5bac4b** — 2025-11-17 — Sherbivs — [Phase 2] Router System Audit - Part 1: Core routing manifests
- **b1a480f** — 2025-11-17 — Sherbivs — [Phase 1 ULTIMATE] Documentation centralization: 454 → 30 files (93.4%)
- **2b4bc7a** — 2025-11-17 — Sherbivs — [Phase 1] Update docs/ROUTER.md - Bible-only structure
- **f507b19** — 2025-11-17 — Sherbivs — [Phase 1] Delete remaining operational subdirectories (35 files)
- **f940ed1** — 2025-11-17 — Sherbivs — [Phase 1 COMPLETE] Documentation reorganization: 454 → 66 files

<!-- LEDGER:END -->

## Embedded PATCHSET Echo
<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local (uncommitted architecture specification)
Change: MAJOR ARCHITECTURE PIVOT — User requested migration from DM-based gameplay to private guild channels. Created comprehensive 900-line architecture specification (docs/architecture-bible/14-private-channel-architecture.md) covering database schema (HomesteadChannel model), service design (HomesteadChannelManager), channel lifecycle (creation/permissions/cleanup), migration strategy (6-phase hard cutover), error handling, testing, monitoring, deployment. Identified 10 createDM() call sites across 4 DM modules (home, heal, starters) + 6 feature areas (battles, wilds, profiles). Added 6 tasks to Phase 18 (READY → DEPLOYMENT). Updated ops/NEXT.yaml with ARCHITECTURE.HOMESTEAD_CHANNELS.FOUNDATION as 2nd main task (parallel with DB.NORTHSTAR.ANALYTICS). Updated Tasklist.md Rev 2.109, Prompt.md Rev 3.2.
TasklistDiff: ✅ True (6 new tasks added to Phase 18, 1 task added to NEXT.yaml main_tasks queue)

Tests: N/A (meta-policy update, no runtime code changes)
ContractMode: ON (Anti-stuck enforcement active)
NextPointer: Main Tasks (1/3): DB.NORTHSTAR.ANALYTICS (READY) | Quick Task Slot: Available for forced META.* tasks
RoutersIntact: ✅ All routing manifests preserved
CanonicalDocs: ✅ Patch.md Rev 1.73→1.74, Prompt.md Rev 3.0→3.1, ops/NEXT.yaml anti-stuck rules added
<!-- PATCHSET:ECHO END -->

## AI Worker Prompt (copy/paste for Copilot/GPT)
You are GitHub Copilot operating under the Infinity Gauntlet contract.

1. Read ops/NEXT.yaml, Tasklist.md, and this Prompt.md before editing.
2. Work only on READY tasks whose dependencies are DONE; do not self-assign PROPOSED items.
3. Keep edits minimal and reversible; update Tasklist.md, ops/NEXT.yaml, Prompt.md, and relevant routers in the same PATCHSET.
4. Run targeted tests (Vitest suites, Prisma migrate deploy) when touching runtime code; record results in the PATCHSET echo and commit message.
5. Ensure the embedded PATCHSET Echo and LEDGER markers stay populated.
6. Finish every run with a READY pointer in ops/NEXT.yaml and clear rationale in the PATCHSET echo.
7. For architecture questions, consult the Bible system (docs/architecture-bible/, docs/operations-bible/, docs/development-bible/).
