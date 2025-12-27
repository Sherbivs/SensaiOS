# Prompt.md
Timestamp (UTC): 2025-12-27T20:55:59Z
Revision: 4.5

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

## Last Repo Changes
- Added envelope audit logging to Phase 2.4 scripts (seed-dex, dex seed/reference/backfill, register-commands, build-dexpack) while preserving CLI output.
- Completed Phase 2.4 evaluation docs and updated SCRIPTS-ENVELOPE-MIGRATION tracker plus Tasklist/NEXT/Prompt metadata.

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
HEAD: pending-local (Scripts Envelope Migration Phase 2.4)
Change: Added audit logging to selected scripts (seed/register/build) and documented Phase 2.4 migrate/skip decisions.
TasklistDiff: true.
Tests: Not run (scripts require local data/env; no targeted automated suite).
Contracts: ON (Patch Engine active).
NextPointer: Main tasks remain KERNEL.LOGGING.OUTPUT_PLUGINS/KERNEL.LOGGING.PII_SCRUBBING/KERNEL.LOGGING.CORRELATION_IDS because Sprint 2 work is still READY; quick task OBS.ENVELOPE.SCRIPTS.PHASE2_4 completed.
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
