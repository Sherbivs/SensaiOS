# Prompt.md
Timestamp (UTC): 2026-02-10T17:25:00Z
Revision: 6.8

**Cross-References**:
- See `Patch.md` for contract rules (updated 2026-02-09T00:00:00Z Rev 1.76)
- See `Tasklist.md` for active backlog and current tasks (Rev 2.169 — 17 granular MEMLEAK sub-tasks)
- See `docs/archive/tasks/` for completed task history (~115+ tasks archived by project/phase)
- See `ops/NEXT.yaml` for current task pointer (MEMLEAK.PHASE4.1 — IN_PROGRESS)
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
- **🚧 MEMLEAK.PHASE4.1 IN PROGRESS (2026-02-10T17:15Z):**
  - Grafana rollout dashboard added for RSS/heap/bounded utilization
  - Baseline capture underway (24h RSS + heap trends)
  - Baseline monitor started: scripts/monitor-memory-24h.ps1
  - First sample: RSS 311.5 MB (2026-02-10 16:08)

- **✅ META.TASKLIST.ARCHIVE COMPLETE (2026-02-10T17:25Z):**
  - SensaiOS Ring Security archived to docs/archive/tasks/sensaios-ring-security.md
  - Tasklist cleaned to archive pointer only

- **🧭 TASKLIST RESTORE (2026-02-10T17:15Z):**
  - MEMLEAK 17-task roadmap reinserted (Phase 1–5 chain)
  - Tasklist header updated to Rev 2.169

- **✅ MEMLEAK.PHASE3.2 COMPLETE (2026-02-10T16:20Z):**
  - Added centralized memory metrics service for bounded structures
  - `/ops memory` now reports bounded structure utilization
  - Phase 4.1 promoted to READY (baseline capture + Grafana dashboard)
  - Router headers normalized; router index regenerated

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

- **Prior Completed Milestones (2025-12 through 2026-01):**
  - ✅ SensaiOS Ring Security Model — ALL 4 PHASES COMPLETE (16 tasks, ~10,000 lines, 202 tests)
  - ✅ META.ALIGNMENT.SCAN — 486 files verified (412 code + 74 docs)
  - ✅ Kernel-First Logging Sprint 1 — Boot logger, preboot queue, scoped logger
  - ✅ HOMESTEAD MIGRATION — Private guild channels (homestead-{username})

- **NEXT Pointer:** MEMLEAK.PHASE4.1 (P2-MEDIUM — IN_PROGRESS)
  - **Main Tasks:** PHASE4.1 (baseline capture + Grafana dashboard)
  - **Quick Task:** META.TASKLIST.ARCHIVE (archive + Tasklist cleanup in progress)

## System Highlights
- **Database:** Production uses unified Render-managed PostgreSQL (`PROD_DATABASE_URL`). Optional workstation development via `DATABASE_ONPREMISE_DEV_PRIMARY`. See `operations-bible/02-database-operations.md`.
- **State Persistence:** Security bot state in PostgreSQL `CacheEntry` table. Zero file writes.
- **Workers:** 8 Render services (web + 6 workers + 1 cron). Peak RAM ~300-600 MB per service.
- **Testing:** Vitest suites (293/294 passing). SensaiOS security tests (202/202 passing).

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
HEAD: pending-local (MEMLEAK.PHASE4.1 — baseline capture + dashboard)
Change: Added baseline first sample to blueprint and confirmed monitor running; Ring Security archive cleanup complete.
TasklistDiff: true (archive cleaned; Tasklist Rev 2.170).
Tests: not run (docs/tasklist updates only).
Build: not run (docs/tasklist updates only).
Docs: not run.
Contracts: ON (Patch Engine active).
NextPointer: MEMLEAK.PHASE4.1 (in progress).
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
