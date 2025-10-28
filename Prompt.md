# Prompt.md
Timestamp (UTC): 2025-10-28T08:40:00Z
Revision: 1.05

## Last Repo Changes (since previous Prompt.md revision)
- Rebuilt Prompt.md to remove stale patchset artifacts and restore all contract-mandated sections.
- Updated worker guidance, PATCHSET echo, and ledger stub to reflect completed DB bootstrap and upcoming T10.SCALE.WORKERS focus.

## Purpose & Scope
- Canonical brief for automation: captures current mission, guardrails, and truth sources so every run starts in sync.
- Complements Patch.md (process contract) and Tasklist.md (work graph); never diverge from those authorities.

## Activation Checklist & Fallback
- Confirm readability of Patch.md, Tasklist.md, Prompt.md, ops/NEXT.yaml before planning; halt if any are unavailable.
- Review ops/NEXT.yaml and Tasklist.md to ensure the READY queue matches the stated next task; auto-promote if policy requires.
- Optional shell access: run scripts/refresh_vision.sh to regenerate routing indices; when unavailable, note the limitation in the PATCHSET echo.
- If remote context (GitHub origin) cannot be validated, record the failure reason and request human assistance.

## Active Mission Snapshot
- **NEXT Pointer:** T10.SCALE.WORKERS — separate background workers so pooled DB connections remain fast under load.
- **READY Queue Highlights:** T10.SCALE.WORKERS (primary), META.RUNTIME.BACKUP_SINK (follow-up once worker split is stable), T8.4 (daily claim button) remains PROPOSED pending DM UI wiring.
- **Recent Finish:** T10.SCALE.DB_BOOTSTRAP is DONE; pooled vs. direct URL strategy, retryable Prisma connect, and documentation now aligned.

## System Highlights
- **Database:** Runtime prefers DATABASE_POOL_URL with fallback to DATABASE_DIRECT_URL; Prisma directUrl is reserved for migrations; tests set PRISMA_SKIP_INITIAL_CONNECT.
- **Workers & Scaling:** Current deployment still runs a unified worker; separation work must update render.yaml, src/worker/**, and relevant routers.
- **Observability:** Structured logs exist; advanced metrics/alerts remain a future task (T10.SCALE.OBS PROPOSED).
- **Testing Posture:** Vitest suites for ops, DM Home, and daily flows cover DB bootstrap behaviour; rerun targeted suites when touching related code.

## Evidence Matrix
- infra — ops/NEXT.yaml, ops/CRITICAL.md, render.yaml, src/shared/config.ts.
- discord_bot — Tasklist.md, ops/TOUCHMAP.yaml, src/bot/**.
- battle_engine — src/core/battle/**, RULESET.md.
- encounters — src/core/encounter/**, DATA-SCHEMA.md.
- data_pipeline — src/data_pipeline/**, data/**, scripts/build-data.js.
- persistence — prisma/schema.prisma, src/models/**, migrations/**.
- security — Prompt.md, RULESET.md, src/shared/**.
- observability — Prompt.md, OPERATIONS.md, src/shared/log.ts.

## Assumptions / TBD Register
- Worker separation will reuse existing Prisma client logic; no new ORM package expected.
- Render environment allows defining dedicated services for workers with independent scaling controls.
- Observability improvements remain deferred until after workers split; ensure no regression to current logging guarantees.

## Validation Checklist
- Touched directories must update their ROUTER.md entries and regenerate ops/ROUTER_INDEX.yaml via scripts/update_router_index.sh.
- Any change impacting readiness requires Prompt.md timestamp/revision bump plus Tasklist/NEXT synchronization.
- Run npx prisma migrate deploy before production deploys; ensure DATABASE_DIRECT_URL present in env when running migrations.
- Execute relevant Vitest suites (ops, dm_home, daily, affected modules) or document why tests were skipped.

## Diagram Conventions
- Use ASCII block diagrams with [] for systems and --> for directional relationships.
- Label data stores explicitly (e.g., [Render Postgres]) to avoid ambiguity.
- Include legend when introducing new notation; keep diagrams under 80 characters wide for readability.

## Embedded PATCHSET Echo
<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local
Change: Reconstructed Prompt.md to restore contract sections, clear stale clipboard remnants, and refocus guidance on T10.SCALE.WORKERS after DB bootstrap.
TasklistDiff: false
Tests: not run (docs-only update)
Contracts: ON (clipboard marker retained in Patch.md)
NEXT: T10.SCALE.WORKERS — split sweep/cache workers so pooled connections stay responsive.
<!-- PATCHSET:ECHO END -->

## Recent Change Ledger (last 200 commits)
<!-- LEDGER:BEGIN -->
**Generated:** 2025-10-28T08:40:00Z  |  **Branch:** unknown (manual update)
- Ledger placeholder — run scripts/update_change_ledger.sh after the next commit to refresh with real history.
<!-- LEDGER:END -->

## AI Worker Prompt (copy/paste for Copilot/GPT)
You are GitHub Copilot operating under the Infinity Gauntlet contract.

1. Read ops/NEXT.yaml, Tasklist.md, ops/TOUCHMAP.yaml, Patch.md, then this Prompt.md before editing.
2. Work only on READY tasks whose dependencies are DONE; do not self-assign PROPOSED items.
3. Keep edits minimal and reversible; update Tasklist.md, ops/NEXT.yaml, Prompt.md, and relevant routers in the same PATCHSET.
4. Run targeted tests (Vitest suites, Prisma migrate deploy) when touching runtime code; record results in the PATCHSET echo and commit message.
5. Ensure the Embedded PATCHSET Echo, Last Repo Changes, and ledger markers remain populated; restore clipboard markers in Patch.md if removed by accident.
6. Finish every run with a READY pointer in ops/NEXT.yaml and clear rationale in the PATCHSET echo.# Prompt.md
<<<<<<< Updated upstream
Timestamp (UTC): 2025-10-28T06:52:00Z
=======
Timestamp (UTC): 2025-10-28T09:25:00Z
>>>>>>> Stashed changes
Revision: 1.04

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
<<<<<<< Updated upstream
<<<PATCHSET START>>>
[Task META.ROUTER.20251028] Refresh router metadata for AI-first navigation

FILE: ops/ROUTER.yaml
Change: Bumped the router timestamp, listed the new bootstrap helper script under ops_scripts, and ensured infra docs cover ops/DB_BOOTSTRAP.md.

FILE: ops/ROUTER_INDEX.yaml
Change: Regenerated metadata to capture the new timestamps/descriptions, highlighting the bootstrap helper in the scripts router.

FILE: masterroutetable.md
Change: Updated the table timestamp, converted indentation to spaces, and documented the runbook/script under Ops & Governance and Tooling sections.

FILE: ops/ROUTER.md
Change: Recorded the 2025-10-28 router refresh that added the bootstrap runbook to the index.

FILE: scripts/ROUTER.md
Change: Refreshed the timestamp and notes to include the staging bootstrap helper script.

FILE: ops/TOUCHMAP.yaml
Change: Added entries for T10.SCALE.DB_BOOTSTRAP, META.ROUTER.20251028, and META.AI_DOC_ENABLE with their owned paths.

[Task META.AI_DOC_ENABLE] Sync agent handbook and README for AI onboarding

FILE: tasklist.md
Change: Bumped headers, restored T8.4 stub, created Phase 11 meta tasks, and marked the new META tasks DONE with outcome notes.

FILE: agent.md
Change: Integrated staging bootstrap guidance (runbook + PowerShell helper) into the handbook across control documents, routing tips, and tooling.

FILE: README.md
Change: Updated status bullets, deployment/operational guidance, and Render blueprint notes to surface the bootstrap workflow.

FILE: ops/NEXT.yaml
Change: Retargeted NEXT at T10.SCALE.DB_BOOTSTRAP with refreshed rationale, hints, and timestamp.

FILE: Prompt.md
Change: Synced metadata/echo for the meta refresh and cleared legacy patchset snippets.

TASKLIST UPDATE
Change: Added Phase 11 meta tasks, marked them DONE, and kept T10.SCALE.DB_BOOTSTRAP READY for execution.
=======
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `Tasklist.md` - Marked `T10.SCALE.DB_BOOTSTRAP` DONE after staging migrate deploy and index verification.
> - `Prompt.md` - Recorded the staging migration verification run and test outputs.

<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local
Summary: Ran staging migrate deploy for 202510280500_scaling_indexes and confirmed /ops stats, DM Home, and daily cooldown queries use the new indexes.
TasklistDiff: true
Tests: npm test -- --run tests/ops.spec.ts (pass); npm test -- --run tests/dm_home.spec.ts (pass); npm test -- --run tests/daily.spec.ts (pass)
Contracts: ON (marker present; Contract Mode enforced).
NEXT: T8.4 remains READY; DM home daily button wiring stays queued next.
<!-- PATCHSET:ECHO END -->

<<<PATCHSET START>>>
[Task T10.SCALE.DB_BOOTSTRAP] Baseline staging DB and verify scaling index migration

FILE: Tasklist.md
Change: Marked T10.SCALE.DB_BOOTSTRAP as DONE after the staging migrate deploy and index verification run.
Insert/Replace/Remove: Refreshed headers and outcome notes to capture the successful staging rollout.

FILE: Prompt.md
Change: Logged the staging migrate deploy execution, verification evidence, and updated READY pointer context.
Insert/Replace/Remove: Bumped timestamp/revision and rewrote Last Repo Changes plus PATCHSET Echo.

# TASKLIST UPDATE
Change: Marked T10.SCALE.DB_BOOTSTRAP DONE.
>>>>>>> Stashed changes
<<<PATCHSET END>>>

            FILE: scripts/guard_meta.sh
            Change: Detected the clipboard marker, relaxed contract checks in Markerless Mode, and enforced Absolutes (canonical files, routers, NEXT pointer).

            FILE: ops/RECOVERY.yaml
            Change: Logged last_run_contracts and last_run_reason guidance for reconciliation.

            # TASKLIST UPDATE
            Change: Added META.CONTRACTS.SWITCH outcome notes while leaving META.READY_QUEUE.NEXT_TASK READY.

            <<<PATCHSET END>>>
# FILE: NEXT.yaml



```diff
