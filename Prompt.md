# Prompt.md
Timestamp (UTC): 2025-12-15T00:00:00Z
Revision: 3.4

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

**Generated:** 2025-12-15T00:00:00Z  |  **Branch:** main

- **17b61d8** — 2025-12-15 — Sherbivs — docs: update DUPLICATION-REPORT with Phase 2.9 button-utils progress
- **1f7beebe** — 2025-12-15 — Sherbivs — feat(Phase 2.9): create button-utils and migrate 3 files
- **8ff24f81** — 2025-12-15 — Sherbivs — refactor(Phase 2.8): migrate remaining consumers to HomesteadRepository
- **1394d424** — 2025-12-15 — Sherbivs — docs: update DUPLICATION-REPORT with Phase 2.8 progress
- **bf0575a6** — 2025-12-15 — Sherbivs — refactor(Phase 2.8): migrate homestead-manager to use HomesteadRepository
- **fa07534c** — 2025-12-15 — Sherbivs — feat(Phase 2.8): create HomesteadRepository pattern
- **0385f07a** — 2025-12-15 — Sherbivs — docs: update DUPLICATION-REPORT with Phase 2.5A-C progress
- **b7f3ce96** — 2025-12-15 — Sherbivs — fix(tests): add DoS protection constants to env.js
- **eaf16a93** — 2025-12-15 — Sherbivs — refactor(Phase 2.5C): migrate LOG_LEVEL and SERVICE_NAME
- **88970f3d** — 2025-12-15 — Sherbivs — refactor(Phase 2.5C): migrate environment config to centralized env.js

<!-- LEDGER:END -->

## Embedded PATCHSET Echo
<!-- PATCHSET:ECHO BEGIN -->
HEAD: 17b61d8b (duplication consolidation session)
Change: CODE DUPLICATION CONSOLIDATION (2025-12-15). Major session eliminating 200+ duplication patterns identified in ops/DUPLICATION-REPORT.md. Completed Phases 2.5A-C, 2.6-2.9:
- **Phase 2.5A**: EMBED_COLORS migration (14 instances, 8 files)
- **Phase 2.5B**: Date utilities using daysAgo() (12 instances, 6 files)
- **Phase 2.5C**: Environment config centralization (16 exports, 8 files)
- **Phase 2.6**: Test fix for DoS protection constants
- **Phase 2.8**: HomesteadRepository creation (472 lines, 9 queries consolidated from 3 files)
- **Phase 2.9**: Button utilities (275 lines, 13 button patterns from 3 files)

New abstractions created:
- `src/services/homestead-repository.ts` (472 lines) — Centralized HomesteadChannel query layer
- `src/bot/shared/button-utils.ts` (275 lines) — Discord button builder factory functions

Total: ~185 patterns eliminated, ~455 lines reduced, 7/8 categories complete (87.5%)
Phase 3 (Query Layer ADR) deferred as low priority — Prisma designated canonical ORM per user decision.

TasklistDiff: ✅ False (duplication work tracked in DUPLICATION-REPORT.md, not Tasklist.md)

Tests: ✅ Build passes (tsc --noEmit), Lint clean (3 warnings in generated files only)
ContractMode: ON (Patch Engine active)
NextPointer: Main Tasks (2/3): DB.NORTHSTAR.ANALYTICS + ARCHITECTURE.HOMESTEAD_CHANNELS.FOUNDATION | Quick Task: Available
RoutersIntact: ✅ All routing manifests preserved
CanonicalDocs: ✅ Prompt.md Rev 3.3→3.4, DUPLICATION-REPORT.md updated through Phase 2.9
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
