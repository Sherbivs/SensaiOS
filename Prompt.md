# Prompt.md
Timestamp (UTC): 2025-12-18T15:30:00Z
Revision: 3.8

**Cross-References**:
- See `Patch.md` for contract rules (updated 2025-11-07T22:00:00Z Rev 1.72)
- See `Tasklist.md` for backlog and active tasks
- See `ops/NEXT.yaml` for current task pointer
- See `docs/architecture-bible/INDEX.md` for architecture documentation (22 sections)
- See `docs/operations-bible/INDEX.md` for operational procedures (13 sections + 9 guides)
- See `docs/development-bible/INDEX.md` for development workflows (9 sections)

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
  - **Main Tasks (1/3 active):**
    1. DB.NORTHSTAR.ANALYTICS — Build analytics jobs (generate_daily_stats.ts, refresh_leaderboards.ts) with aggregation logic (daily active users, popular species, battle win rates, achievement completion rates), schedule via cron or worker, add export capabilities (CSV, JSON).
  - **Completed (2025-06-15):** ARCHITECTURE.HOMESTEAD_CHANNELS — All 6 phases complete. src/bot/dm/ DELETED, homestead channels fully operational.
  - **Quick Task Slot:** Available for bug fixes, documentation updates, or hotfixes (<30 min work)
- **READY / In-flight:** DB.NORTHSTAR.ANALYTICS (analytics layer). Homestead migration COMPLETE — see `docs/architecture-bible/18-private-channel-architecture.md`.

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

**Generated:** 2025-12-18T14:30:00Z  |  **Branch:** main

- **c7e5d5a1** — 2025-12-18 — Sherbivs — [Meta] Update Prompt.md PATCHSET echo with final commit reference
- **bf6e5738** — 2025-12-18 — Sherbivs — [Meta] Comprehensive documentation remediation — Bible renumbering, stale DM removal
- **077075f9** — 2025-12-18 — Sherbivs — docs: comprehensive Prisma 7 documentation remediation
- **bc6251de** — 2025-12-18 — Sherbivs — fix: set engineType to "library" for direct PostgreSQL (Prisma 7)
- **f144ad2a** — 2025-12-18 — Sherbivs — fix: remove datasources option from PrismaClient (Prisma 7 breaking change)
- **68859489** — 2025-12-17 — Sherbivs — chore: clean up root directory - remove temp files, update gitignore
- **cdfa16b8** — 2025-12-17 — Sherbivs — chore: remove node_modules from git tracking
- **176f419a** — 2025-12-17 — Sherbivs — fix: restore prisma.config.ts (Prisma 7 requirement)
- **f8fac4c2** — 2025-12-17 — Sherbivs — fix: override fast-check to 3.22.0 (case-sensitivity bug)
- **5b8c1874** — 2025-12-17 — Sherbivs — fix: fix npm override syntax for effect 3.19.12

<!-- LEDGER:END -->

## Embedded PATCHSET Echo
<!-- PATCHSET:ECHO BEGIN -->
HEAD: UNCOMMITTED (Patch Engine Initialize — Deep Accuracy Audit)
Change: BIBLE SECTION COUNT ACCURACY AUDIT COMPLETE (2025-12-18)

**Session Summary**: Deep accuracy verification of all documentation systems

**Critical Discovery: README.md Corruption**
- README.md was overwritten with Render CLI content at commit f9aeaac2
- Restored from commit 76813777 and comprehensively updated for current state
- Now accurately documents: homestead architecture, Prisma 7, Bible system

**Development Bible Count Fix (7 → 9)**:
- docs/development-bible/INDEX.md: Added sections 08-09, updated counts
- 08-profiling.md (554 lines): Memory profiling, heap snapshots, /ops snapshot
- 09-database-onboarding.md (848 lines): Repository pattern, RLS, transactions

**Files Updated (10 files)**:
1. README.md — RECREATED with current architecture (homestead, Prisma 7, 22/13+9/9)
2. docs/ROUTER.md — Development Bible: 7 → 9 sections
3. docs/development-bible/INDEX.md — Added sections 8-9
4. docs/projects/README.md — Architecture: 15 → 22, Development: 7 → 9
5. docs/projects/ROUTER.md — Architecture: 17 → 22, Development: 7 → 9
6. .github/copilot-instructions.md — Development: 7 → 9
7. .github/copilot-instructions-Sensai.md — All Bible counts corrected
8. .github/instructions/documentation.instructions.md — Development: 7 → 9
9. .github/agents/research-gpt.agent.md — All Bible counts corrected
10. .github/prompts/IG.prompt.md — All Bible counts corrected

**Bible System (VERIFIED ACCURATE)**:
- Architecture Bible: 22 sections (01-22) ✅
- Operations Bible: 13 sections + 9 guides ✅
- Development Bible: 9 sections (01-09) ✅

TasklistDiff: ❌ False (documentation audit, no task status changes)
Tests: N/A (documentation only)
ContractMode: ON (Patch Engine active)
NextPointer: Main Tasks (2/3): DB.NORTHSTAR.ANALYTICS + ARCHITECTURE.HOMESTEAD_CHANNELS.FOUNDATION | Quick Task: Available
RoutersIntact: ✅ All routing manifests updated
CanonicalDocs: ✅ Prompt.md Rev 3.7→3.8, README.md restored and updated
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
