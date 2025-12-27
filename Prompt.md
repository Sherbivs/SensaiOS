# Prompt.md
Timestamp (UTC): 2025-12-27T01:00:00Z
Revision: 4.0

**Cross-References**:
- See `Patch.md` for contract rules (updated 2025-12-27T00:00:00Z Rev 1.75)
- See `Tasklist.md` for backlog and active tasks
- See `ops/NEXT.yaml` for current task pointer
- See `docs/architecture-bible/INDEX.md` for architecture documentation (27 sections)
- See `docs/operations-bible/INDEX.md` for operational procedures (13 sections + 9 guides)
- See `docs/development-bible/INDEX.md` for development workflows (10 sections)

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
  - **Main Tasks (3/3 READY):**
    1. KERNEL.LOGGING.OUTPUT_PLUGINS — Add output plugin system to Kernel.
    2. KERNEL.LOGGING.PII_SCRUBBING — Add PII scrubbing to Kernel output.
    3. KERNEL.LOGGING.CORRELATION_IDS — Add correlation ID tracking.
  - **Quick Task Slot:** Available for bug fixes, documentation updates, or hotfixes (<30 min work)
- **READY / In-flight:** Kernel logging Sprint 2 output plugin architecture (READY). Homestead migration COMPLETE — see `docs/architecture-bible/18-private-channel-architecture.md`.

## System Highlights
- **Database:** Production uses unified Render-managed PostgreSQL (`PROD_DATABASE_URL`) for all operations. Optional workstation development via `DATABASE_ONPREMISE_DEV_PRIMARY` (offline fallback). Migrations use direct PostgreSQL mode via `RENDER_DB_EXTERNAL_URL`. See `operations-bible/02-database-operations.md` for complete URL selection logic.
- **State Persistence (2025-12-27):** Security bot state migrated from /Store files to PostgreSQL `CacheEntry` table. Zero file writes for state persistence. Keys: `security-bot-state:current`, `security-bot-state:previous`, `security-bot-state:snapshot:{ts}`, `security-bot-state:backup-{n}`, `security-bot-state:role-archive`, `security-bot-state:baselines`.
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
HEAD: UNCOMMITTED (Envelope System Migration — Phase 5)
Change: CONSOLE.* MIGRATION TO ENVELOPE LOGGING SYSTEM — IN PROGRESS

## 📊 Envelope Migration Progress

**Session Date:** 2025-12-27
**Total Files Migrated:** 8 of ~82
**Console Calls Converted:** ~60 of ~1,083

### Envelope System Created (Phase 1-4):
- `src/observability/envelope/types.ts` — Universal envelope types (~616 lines)
- `src/observability/envelope/factory.ts` — Creation functions (~479 lines)
- `src/observability/envelope/serializer.ts` — 5 output formats (~420 lines)
- `src/observability/envelope/console.ts` — scopedLogger() bridge (~290 lines)
- `src/observability/envelope/query.ts` — Query DSL (~520 lines)
- `src/observability/envelope/migrate.ts` — Migration helpers (~320 lines)
- `scripts/logq.ts` — CLI query tool (~290 lines)
- `scripts/migrate-console.ts` — Migration scanner (~220 lines)
- `tests/observability/envelope.spec.ts` — 37/37 tests passing (~430 lines)

### Files Migrated (Phase 5):
1. ✅ `src/observability/hub/observability-hub.ts` — 20 calls
2. ✅ `src/shared/event-bus.ts` — 9 calls (circular dependency resolved!)
3. ✅ `src/observability/backends/loki/loki-backend.ts` — 4 calls
4. ✅ `src/observability/backends/loki/loki-flush-worker.ts` — 6 calls
5. ✅ `src/observability/backends/loki/loki-health-worker.ts` — 5 calls
6. ✅ `src/observability/index.ts` — 5 calls
7. ✅ `src/shared/logging/loki-transport.ts` — 8 calls
8. ✅ `src/shared/logging/log-sampler.ts` — 3 calls

### Next Priority Queue:
1. `src/utils/logger.ts` — 17 calls (CRITICAL: main logger)
2. `src/shared/logging/ai-log-*.ts` — AI log modules
3. `src/bot/**/*.ts` — Bot layer
4. `src/core/**/*.ts` — Game engines
5. `src/services/**/*.ts` — Services
6. `src/workers/**/*.ts` — Workers

### AI Agent Instructions:
📖 **READ FIRST:** `.github/instructions/envelope-migration.instructions.md`
- Complete step-by-step migration guide
- Pattern templates for all conversion types
- Verification protocols
- Failure recovery procedures

### Build Status: ✅ Passing
### Test Status: ✅ 37/37 envelope tests passing

TasklistDiff: ⏳ Envelope migration task (Quick Task slot)
Tests: npm run build ✅ | npm test -- envelope.spec.ts ✅
ContractMode: ON (Patch Engine active)
NextPointer: Main Tasks (3/3 READY) | Quick Task: Envelope Migration Active
RoutersIntact: ✅ No routing changes required
CanonicalDocs: ✅ envelope-migration.instructions.md created
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
