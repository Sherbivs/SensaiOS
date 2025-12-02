# Prompt.md
Timestamp (UTC): 2025-12-02T18:45:00Z
Revision: 3.3

**Cross-References**:
- See `Patch.md` for contract rules (updated 2025-11-07T22:00:00Z Rev 1.72)
- See `Tasklist.md` for backlog and active tasks
- See `ops/NEXT.yaml` for current task pointer
- **📚 TASK 12 COMPREHENSIVE GUIDES (AUTHORITATIVE — READ BEFORE IMPLEMENTING):**
  * `docs/operations-bible/worker-troubleshooting-comprehensive.md` (22 pages) → ALL worker failure scenarios, recovery procedures, health check diagnostics
  * `docs/operations-bible/database-operations-runbook-comprehensive.md` (25 pages) → Complete database ops, live game architecture, master-mirror-staging pipeline
  * `docs/operations-bible/ops-commands-reference-comprehensive.md` (28 pages) → ALL /ops commands documented with examples
  * `docs/architecture-bible/complete-system-architecture.md` (30 pages) → Service topology, dependency graphs, data flows, performance SLA
- See `docs/architecture-bible/INDEX.md` for architecture documentation
- See `docs/operations-bible/INDEX.md` for operational procedures
- See `docs/development-bible/INDEX.md` for development workflows

**🔥 CRITICAL:** Update Bible sections in SAME commit when changing architecture/operations. Documentation drift causes production failures.

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
- **Database:** Production uses unified Render-managed PostgreSQL (`PROD_DATABASE_URL`) for all operations. Optional workstation development via `DATABASE_ONPREMISE_DEV_PRIMARY` (offline fallback). Migrations use direct PostgreSQL mode via `RENDER_DB_EXTERNAL_URL`. See `docs/operations-bible/database-operations-runbook-comprehensive.md` (25 pages) § 2.1 (Database URL Selection) for complete URL selection logic.
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
| persistence | docs/operations-bible/database-operations-runbook-comprehensive.md, prisma/schema.prisma | Schema + migrations |
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

## Embedded PATCHSET Echo (Enhanced with Specialist Tracking)
<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local (specialist system integration)
Change: ✅ AI SPECIALIST TEAM SYSTEM INTEGRATION COMPLETE (Phase 2) — Integrated team-based AI workflow into Patch.md, ops/NEXT.yaml, and Prompt.md. Enhanced Patch.md with "Specialist Team Coordination" section (8 specialists defined, automatic detection rules, 5-phase workflow protocol, quality gates). Updated ops/NEXT.yaml task structure with specialists_required and specialist_signoffs fields. Enhanced PATCHSET echo format with Specialists Involved, Coordination Notes, and Quality Gates Passed fields. Applied specialist metadata to existing tasks: DB.NORTHSTAR.ANALYTICS (4 specialists: AI Coding lead, Database, Architecture, Performance), ARCHITECTURE.HOMESTEAD_CHANNELS.FOUNDATION (5 specialists: AI Coding lead, Architecture, Database, Documentation, Testing). Updated Patch.md Rev 1.74→1.75, ops/NEXT.yaml timestamp 2025-12-02T18:45:00Z, Prompt.md Rev 3.2→3.3.
TasklistDiff: ✅ False (meta-system enhancement, no task changes)

Specialists Involved: AI Coding Specialist (Lead), Documentation Specialist, Architecture Specialist
Coordination Notes: Team analyzed specialist system design document (docs/projects/development/AI-SPECIALIST-TEAM-SYSTEM.md). Determined Phase 2 integration points: Patch.md (specialist section, workflow updates), ops/NEXT.yaml (task metadata), Prompt.md (PATCHSET echo format). Agreed on quality gates: Documentation Specialist verifies naming/formatting, Architecture Specialist validates integration approach, AI Coding ensures technical correctness.
Quality Gates Passed: ✅ Documentation Specialist (file organization, naming conventions verified), ✅ Architecture Specialist (Patch system integration design validated), ✅ AI Coding Specialist (final approval after domain signoffs)

Tests: N/A (meta-system enhancement, no runtime code changes)
ContractMode: ON (Anti-stuck enforcement active with specialist escalation)
NextPointer: Main Tasks (2/3): DB.NORTHSTAR.ANALYTICS (READY, 4 specialists assigned) + ARCHITECTURE.HOMESTEAD_CHANNELS.FOUNDATION (READY, 5 specialists assigned) | Quick Task Slot: Available for forced META.* tasks
RoutersIntact: ✅ All routing manifests preserved
CanonicalDocs: ✅ Patch.md Rev 1.74→1.75, Prompt.md Rev 3.2→3.3, ops/NEXT.yaml updated with specialist fields
<!-- PATCHSET:ECHO END -->

## AI Worker Prompt (copy/paste for Copilot/GPT)
You are GitHub Copilot operating under the Infinity Gauntlet contract with AI Specialist Team coordination.

1. **Specialist Team Assembly:** Analyze prompt → Apply detection rules → Identify required specialists → Brief team (see Patch.md § "Specialist Team Coordination")
2. Read ops/NEXT.yaml (check specialists_required and specialist_signoffs), Tasklist.md, and this Prompt.md before editing.
3. Work only on READY tasks whose dependencies are DONE; do not self-assign PROPOSED items.
4. **Team Coordination:** Each specialist reviews from domain perspective → Coordinate approach → Execute with real-time feedback → Multi-perspective verification
5. Keep edits minimal and reversible; update Tasklist.md, ops/NEXT.yaml (including specialist signoffs), Prompt.md (with Specialists Involved, Coordination Notes, Quality Gates Passed), and relevant routers in the same PATCHSET.
6. Run targeted tests (Vitest suites, Prisma migrate deploy) when touching runtime code; record results in the PATCHSET echo and commit message.
7. **Quality Gates:** Ensure all required specialists have signed off (approved or concerns documented) before completing work. AI Coding Specialist cannot exit until domain specialists complete reviews.
8. Finish every run with a READY pointer in ops/NEXT.yaml, clear rationale in the PATCHSET echo, and specialist signoffs documented.
9. For architecture questions, consult the Bible system (docs/architecture-bible/, docs/operations-bible/, docs/development-bible/).
