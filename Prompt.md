# Prompt.md
Timestamp (UTC): 2026-02-19T04:00:00Z
Revision: 7.6

**Cross-References**:
- See `Patch.md` for contract rules (updated 2026-02-09T00:00:00Z Rev 1.76)
- See `Tasklist.md` for active backlog and current tasks (Rev 2.176 — 16 DONE, 4 READY, 1 IN_PROGRESS, 2 PROPOSED)
- See `docs/archive/tasks/` for completed task history (~115+ tasks archived by project/phase)
- See `ops/NEXT.yaml` for current task pointer (KERNEL.LOGGING.CORRELATION_IDS — READY, P1-HIGH)
- See `ops/MEMORY-LEAK-PATCH-BLUEPRINT.md` for comprehensive memory leak fix plan (1776 lines)
- See `ops/CODEBASE-INVENTORY.md` for comprehensive file-by-file alignment checklist
- See `docs/architecture-bible/INDEX.md` for architecture documentation (28 sections)
- See `docs/operations-bible/INDEX.md` for operational procedures (14 sections + 9 guides)
- See `docs/development-bible/INDEX.md` for development workflows (11 sections)

## Purpose & Scope
- Canonical brief for automation: captures current mission, guardrails, and truth sources so every run starts aligned.
- Complements Patch.md (process contract) and Tasklist.md (work graph); never diverge from those authorities.

## Activation Checklist & Fallback
1. Ensure Patch.md, Tasklist.md, Prompt.md, and ops/NEXT.yaml open cleanly; halt if any are missing or unreadable.
2. Read ops/NEXT.yaml and confirm the READY queue in Tasklist.md matches; if READY is empty, apply the guard policy to promote/inject tasks before continuing.
3. Review the PATCHSET echo in Patch.md for context on outstanding risks.
4. If router manifests (ops/ROUTER.yaml, ops/ROUTER_INDEX.yaml, masterroutetable.md) diverge from working intent, regenerate via `npm run docs:update-routers` before editing.
5. When Git remote validation or CI guards fail locally, stop and request human assistance rather than proceeding.

## Last Repo Changes
- **✅ OOM CRASH FIX — UserManager cache cap + V8 hardening (2026-02-19T04:00Z, commit 1783c3e3):**
  - Root cause: `UserManager` (global Discord.js cache) completely absent from `cacheWithLimits` — accumulated every unique user forever
  - RSS grew from ~215 MB baseline (Feb 11) to >512 MB Render limit over 8 days → OOM kill at 3:56 AM Feb 19
  - Fix 1 (`src/bot/index.ts`): Added `UserManager: 500` + `GuildScheduledEventManager: 0` to cacheWithLimits
  - Fix 2 (`render.yaml`): Changed `startCommand` from `npm start` → `node --max-old-space-size=380 --max-semi-space-size=32 dist/index.js`
  - Also updated `NODE_OPTIONS` in render.yaml to match (child process fallback)
  - autoDeploy triggered; `infinity-gauntlet` (srv-d3snk2ndiees73cn709g) redeploying
  - MEMLEAK.PHASE4.2 → IN_PROGRESS; 24h soak window: 2026-02-19T04:00Z → 2026-02-20T04:00Z

- **✅ SENSAIOS PERFECTED VISION v1.0.2 (2026-02-17T18:00Z, commit 3d5f04f7):**
  - Created `docs/projects/SensaiOS/SENSAIOS-PERFECTED-VISION.md` (~712 lines)
  - Vision mapping: golden architecture, reality check, industry landscape, perfected end-state
  - Gap Map: 6 phases (Kernel Bridge → Wire Primitives → GameServerAPI → Ring Enforcement → Operator Experience → Observability → Launch Readiness)
  - Timeline: 10-12 weeks estimated from today to perfection
  - Deep audit: 10+ critical files read (7,000+ lines), all kernel/supervisor/context/schema/install code analyzed
  - 7-part implementation plan delivered: Kernel Bridge, Database Substrate (6 new tables), Detachable App Architecture, GameServerAPI stubs (13 TODOs), Ring Enforcement, Workers, Database Self-Management
  - 3 QA audits completed (v1.0.0 → v1.0.1 → v1.0.2, all clean)
  - Updated INDEX.md and ROUTER.md with new document entry
  - Test count verified: 3,183/3,183 passing

- **✅ KERNEL.LOGGING.PII_SCRUBBING COMPLETE (2026-02-17T12:30Z):**
  - Added `src/kernel/kernel-scrubber.ts` with `ScrubConfig`, `scrubEntry()`, and config API
  - Wired scrubbing into output dispatch path before every `plugin.write()` call
  - Default patterns active: tokens, webhooks, emails, passwords
  - Added `tests/kernel/kernel-scrubber.spec.ts` (15 tests) + plugin integration assertion
  - Coverage for scrubber logic: 100% statements / 100% branches / 100% functions / 100% lines
  - Installed `@vitest/coverage-v8` for deterministic file-level coverage verification

- **✅ KERNEL.LOGGING.OUTPUT_PLUGINS COMPLETE (2026-02-17T11:00Z, commit 6b2b8c1e):**
  - Plugin dispatch wired into kernel-logger processLogEntry() via setPluginDispatch() injection
  - ConsoleOutputPlugin (ANSI colors, JSON mode, TTY detection) in src/kernel/outputs/
  - FileOutputPlugin (no-op stub per Database-First Architecture)
  - 47 new tests, 3167/3167 total suite passing, 0 regressions
  - Downstream tasks unblocked: PII_SCRUBBING, CORRELATION_IDS, STRUCTURED_OUTPUT

- **✅ HOUSEKEEPING COMPLETE (2026-02-17T10:00Z):**
  - DISCORD.MEMBER_FETCH.RATE_LIMIT → DONE (code verified: constants.ts + bot/main.js)
  - MEMLEAK.PHASE4.1 → DONE (24h baseline captured, Grafana deployed, RSS ~215 MB)
  - MEMLEAK.PHASE4.2 promoted to READY (dependency PHASE4.1 cleared)
  - NEXT.yaml cleared quick_task, promoted KERNEL.LOGGING.OUTPUT_PLUGINS to main_tasks
  - ESLint 0 warnings (commit 48b55ca6: _KERNEL_ABSOLUTE_START prefix fix)

- **📊 FULL ROADMAP AUDIT (2026-02-17):**
  - Phase 0: 7/7 DONE (HP formula, tests, ESLint, memory baseline, rate limit, starter moves, IVs)
  - Phase 1: 79% compliant (9/14 homestead files, 37 interaction.reply() → .update() conversions needed)
  - Phase 2: 91% complete (20/22 GameServerAPI methods, 1 hard stub: submitBattleMoveInternal)
  - Phase 4: 65% built / 0% wired (19,845 lines SensaiOS, kernel-boot.ts not imported, runGuarded not adopted)
  - Build: tsc 0 errors, ESLint 0 warnings, Vitest 3120/3120 passed

- **✅ 5-STREAM LOG CLEANUP (2026-02-15, commit 6ac585aa):**
  - Removed duplicate/stale logs from adaptive tier system
  - Clean console output with standardized formatting

- **✅ ADAPTIVE TIER SYSTEM (2026-02-14, commits 2644ae7b → 975b846a):**
  - Resource tier auto-detection for Render plan (Starter/Standard/Pro)
  - TIER singleton in src/config/resource-tiers.ts
  - 4 progressive patches with comprehensive test coverage

- **✅ ROUTER HEADER FIXES (2026-02-10T16:50Z):**
  - Standardized Title/Purpose/Last Updated fields across missing ROUTER.md files
  - Router index regenerated (ops/ROUTER_INDEX.yaml)

- **✅ MEMLEAK.PHASE3.1 COMPLETE (2026-02-10T16:05Z):**
  - Bounded verification suite added (20/20 tests passing)
  - Heap growth check stayed under 50 MB in mixed operations
  - Phase 3.2 promoted to READY (memory metrics service + /ops memory command)

- **✅ MEMLEAK.PHASE2.6 COMPLETE (2026-02-10T15:10Z):**
  - Phase 2 integration gate cleared (tests/memory/phase2-integration.spec.ts)
  - Full npm test suite passing (3095 tests) and npm run build succeeded
  - Phase 3 promoted to READY (next: MEMLEAK.PHASE3.1)

- **✅ MEMLEAK.PHASE2.5 COMPLETE (2026-02-10T15:05Z):**
  - Error Brain fingerprint maps bounded with MAX_FINGERPRINTS total-key enforcement
  - Added prune interval + SIGTERM cleanup in impact predictor
  - Added bounded tests for fingerprint maps and interval registration
- **✅ MEMLEAK.PHASE2.4 COMPLETE (2026-02-10T14:50Z):**
  - AI log analyzer knowledge base bounded with helper limits and utilization metrics
  - Added bounded tests (12/12 passing) for maps, arrays, LRU refresh, and metrics
  - New test routers for AI service tests
- **✅ MEMLEAK.PHASE2.3 COMPLETE (2026-02-10T01:05Z):**
  - Discord identity caches bounded (MAX_USER_CACHE_SIZE/MAX_GUILD_CACHE_SIZE)
  - LRU refresh on cache hits + eviction on insert; getCacheStats adds utilization
  - Added bounded cache tests (4/4 passing)
- **✅ MEMLEAK.PHASE2.2 COMPLETE (2026-02-10T00:50Z):**
  - CAS bounded with MAX_BLOBS LRU eviction and utilization metrics
  - getStats now reports maxBlobs/utilization
  - Added CAS bounded cache tests (4/4 passing)
- **✅ MEMLEAK.PHASE1.5 COMPLETE (2026-02-10T00:15Z):**
  - Phase 1 integration test passing; memory delta <= 5 MB
  - Full npm test suite green (109 files; 3064 tests; 3 files/49 tests skipped)
  - Phase 2 promoted to READY (next: MEMLEAK.PHASE2.1)

- **✅ MEMLEAK.PHASE1.4 COMPLETE (2026-02-09T18:40Z):**
  - C2: PBSL Audit Trail bounds + flush clearing
  - Added maxEvents, shift-on-overflow, getMetrics()
  - 10/10 new tests passing; tsc --noEmit clean

- **✅ MEMLEAK.PHASE1.3 COMPLETE (2026-02-09T18:35Z):**
  - C7b: Battle Runtimes timeout cleanup (15 min) + destroyRuntime()
  - Added getRuntimeMetrics(), lastActivity tracking, cleanup interval
  - 7/7 new tests passing; tsc --noEmit clean

- **✅ MEMLEAK.PHASE1.2 COMPLETE (2026-02-09T18:30Z):**
  - C7a: Battle Sessions timeout cleanup (10 min) + SIGTERM shutdown
  - Added getSessionMetrics(), session activity tracking, cleanup interval
  - 8/8 new tests passing; tsc --noEmit clean

- **� MEMLEAK ROADMAP EXPANSION (2026-02-09T12:00Z):**
  - Expanded 5 high-level MEMLEAK phases into **17 granular sub-tasks** in Tasklist.md
  - Each sub-task has: precise file targets, test counts, effort estimates, acceptance criteria, dependency chain
  - Linear dependency chain: PHASE1.1 → 1.2 → 1.3 → 1.4 → 1.5 → PHASE2.1 → ... → PHASE5.2
  - Total scope: 10 source files, ~115 tests, ~48h effort, 11-day estimated duration
  - NEXT.yaml updated: first 3 sub-tasks loaded (PHASE1.1, PHASE1.2, PHASE1.3)
  - Fixed incorrect file paths in NEXT.yaml Phase 2 hints (verified against actual locations)
  - Tasklist.md Rev 2.154 → 2.155

- **🚨 MEMORY LEAK PATCH SYSTEM INITIALIZED (2026-02-09T00:00Z):**
  - Comprehensive Patch Engine QA and reset completed
  - All 5 meta-documents synchronized (Patch.md, NEXT.yaml, Tasklist.md, Prompt.md, TOUCHMAP.yaml)
  - Memory leak blueprint: `ops/MEMORY-LEAK-PATCH-BLUEPRINT.md` (1776 lines, 10 components)
  - Two audits completed: First audit (4 areas), Second QA audit (5 NEW areas including root cause)

- **Prior Completed Milestones (2025-12 through 2026-02):**
  - ✅ MEMLEAK Phases 1-4.1 — 14/17 tasks DONE (bounded structures, metrics, baseline captured)
  - ✅ SensaiOS Ring Security Model — ALL 4 PHASES COMPLETE (16 tasks, ~10,000 lines, 202 tests)
  - ✅ META.ALIGNMENT.SCAN — 486 files verified (412 code + 74 docs)
  - ✅ Kernel-First Logging Sprint 1 — Boot logger, preboot queue, scoped logger
  - ✅ HOMESTEAD MIGRATION — Private guild channels (homestead-{username})
  - ✅ Adaptive Tier System — Resource tier auto-detection (4 commits)

- **NEXT Pointer:** KERNEL.LOGGING.CORRELATION_IDS (P1-HIGH — READY)
  - **Main Tasks:** CORRELATION_IDS (trace context), SAMPLING (rate control), PHASE4.2 (canary deploy + soak test)
  - **Quick Task:** (empty — available for hot tasks)

## System Highlights
- **Database:** Production uses unified Render-managed PostgreSQL (`PROD_DATABASE_URL`). Optional workstation development via `DATABASE_ONPREMISE_DEV_PRIMARY`. See `operations-bible/02-database-operations.md`.
- **State Persistence:** Security bot state in PostgreSQL `CacheEntry` table. Zero file writes.
- **Workers:** 8 Render services (web + 6 workers + 1 cron). Peak RAM ~300-600 MB per service.
- **Testing:** Vitest suites (3,183/3,183 passing). SensaiOS security tests (202/202 passing).

## Evidence Matrix
| Domain | Primary Sources | Notes |
| --- | --- | --- |
| memory_leak | ops/MEMORY-LEAK-PATCH-BLUEPRINT.md, ops/MEMORY-LEAK-SECOND-AUDIT-QA.md | 10 components, 5-phase rollout |
| infra | ops/NEXT.yaml, render.yaml, operations-bible/ | Worker split + deployment |
| sensaios | src/sensaios/**, docs/projects/SensaiOS/ | Ring security, capabilities, installation |
| discord_bot | architecture-bible/10-discord-bot.md, src/bot/** | Discord surfaces + command routing |
| battle_engine | architecture-bible/09-game-engine.md, src/core/battle/** | Deterministic battle mechanics |
| persistence | operations-bible/02-database-operations.md, prisma/schema.prisma | Schema + migrations |

## Recent Change Ledger (last 10 commits)
<!-- LEDGER:BEGIN -->
**Generated:** 2026-02-09T00:00:00Z  |  **Branch:** main
- Pending local changes — Memory leak patch system initialization
- See git log for latest committed history
<!-- LEDGER:END -->

## Embedded PATCHSET Echo
<!-- PATCHSET:ECHO BEGIN -->
HEAD: 3d5f04f7
Change: SENSAIOS-PERFECTED-VISION.md v1.0.2 — Complete vision mapping document with gap analysis, industry comparison, adoption requirements, 6-phase implementation roadmap. Deep codebase audit of 10+ critical files (7,000+ lines). 7-part implementation plan delivered covering Kernel Bridge through Database Self-Management.
TasklistDiff: true (Rev 2.175 → 2.176, Vision Mapping session documented).
Tests: 3183/3183 passing. tsc 0 errors. ESLint 0 warnings.
Build: clean.
Docs: SENSAIOS-PERFECTED-VISION.md (712 lines), INDEX.md, ROUTER.md, Prompt.md, Tasklist.md updated.
Contracts: ON (Patch Engine active).
NextPointer: KERNEL.LOGGING.CORRELATION_IDS (P1-HIGH, READY).
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
8. For memory leak work, consult ops/MEMORY-LEAK-PATCH-BLUEPRINT.md for implementation details.
