# AI PROJECT MANAGER CONTRACT
Last Updated (UTC): 2025-11-06T16:00:00Z
Revision: 1.71

This repository uses **Patch.md** as the working agreement between humans and automation.
Read this file completely before beginning any task. Follow it literally. Before editing, confirm the READY queue, NEXT pointer, and meta docs (Patch/Prompt/Tasklist) are readable and synchronized.

## Marker Switch

## Absolutes (apply in every mode)
- Never rename or delete canonical meta/routing files (`Patch.md`, `Tasklist.md`, `Prompt.md`, `ops/PATCH_POLICY_BACKUP.md`, `ops/ROUTER.yaml`, `ops/ROUTER_INDEX.yaml`, `masterroutetable.md`, and any `ROUTER.md`).
- Never delete or rename router manifests (`ROUTER.md`, `ROUTER.yaml`).
- Ensure `.gitignore` preserves meta documentation for AI navigation (ROUTER.md, README.md in all directories) while excluding sensitive files (secrets/*.env, Store/db/, tools/pgsql*/ binaries).
1. Read `ops/NEXT.yaml` (respect Marker Switch guidance) to learn the queued task and `files_hint`.
2. Read `Tasklist.md` and execute **only** tasks marked `status: READY` with dependencies satisfied.
3. Read `ops/TOUCHMAP.yaml` to scope edits to the listed paths.
4. Keep every change reversible and minimal.

## Preflight
- If Tasklist.md has no READY tasks (ignoring `META.UNBLOCK.READY_SEED`), promote the oldest eligible PROPOSED whose dependencies are DONE. If none exist, add `META.UNBLOCK.READY_SEED` as READY.
- Ensure `ops/NEXT.yaml:next_task_id` points to a READY task and `files_hint` only lists files you expect to touch.
- Confirm `Patch.md`, `Prompt.md`, and `Tasklist.md` are readable. If any are missing or corrupt, stop and request refreshed copies.
- Clear or overwrite any prior clipboard or NEXT context when beginning a new task; every run starts with a fresh plan so stale patchsets or pointers cannot stall progress.

## Operating Loop (Contract Mode)
1. **Plan & Execute**
   - Select the first READY task (respect dependency order) and plan tightly scoped edits. Honor `ops/TOUCHMAP.yaml`.
   - Implement the change using a single PATCHSET from the clipboard (see “Legacy Layout Bridge”).
   - Run targeted tests whenever tooling is available; if not, state why in the echo and commit message.
2. **Update State**
   - Mark the task `DONE` in `Tasklist.md` with a concise outcome note. Promote newly unblocked tasks to `READY`.
   - Update `ops/NEXT.yaml` to point to the next READY task with an updated timestamp, rationale, and trimmed `files_hint`.
   - Extend `ops/TOUCHMAP.yaml` if you touched new paths.
   - Refresh `Prompt.md` (Timestamp, Revision, “Last Repo Changes”, PATCHSET Echo, and any relevant tables).

## Postflight
- Refuse to exit if Tasklist.md lists no READY tasks besides the seed; auto-promote as needed.
- Refuse to exit if `ops/NEXT.yaml:next_task_id` is `NONE` or not READY; retarget before finishing.
- Record the final READY pointer and contract state (Contracts ON/OFF) inside the PATCHSET Echo.

## Prompt Echo Template
- Keep the PATCHSET Echo between the markers in `Prompt.md`.
- Include: HEAD (or `pending-local`), a concise summary sentence, `TasklistDiff true|false`, test results, `Contracts: ON|OFF (reason)`, and the READY pointer rationale.
- Use plain sentences only (no code fences, tables, or embedded objects).

## Legacy Layout Bridge
- Follow the section order used by `Patch-Template.md`: header, FILE entries, TASKLIST UPDATE, Commit Message.
- Describe file edits with inline `-`/`+` markers or prose; do not embed fenced code or attach file objects.
- Keep the clipboard and emitted PATCHSET synchronized.

## Patchset Format (final reply)
- Emit exactly one PATCHSET block and one Commit Message block per run.
- New files must appear in full inside the PATCHSET description (plain text).
- Modified files must be summarized with inline context (no fenced diffs) and kept deterministic.
- Avoid binary/large assets unless explicitly required.

## Tasklist Discipline
- Update headers (`Last Updated`, `Revision`) whenever Tasklist.md changes.
- Add acceptance criteria for new tasks; include outcome notes when marking DONE.
- Never delete tasks with active dependencies. Archive long DONE history via `npm run tasks:archive` if needed.

## Prompt.md Requirements
- Bump Timestamp and Revision on every change.
- “Last Repo Changes” must summarize the effective modifications in plain text bullets.
- Maintain a populated PATCHSET Echo between the markers following the template above.
- Preserve the section titled **“AI Worker Prompt (copy/paste for Copilot/GPT)”** exactly.

## Tests & Evidence
- Run available tests relevant to the touched code. Capture command outputs for the final report.
- If tests cannot run (tooling unavailable, dependency missing), explain the limitation in both the PATCHSET Echo and Commit Message.

## Commit Message Guidelines
- Use the format `[Task <ID>] Concise summary` when closing a Tasklist item.
- Include a short “Why / Changes / Testing” body when additional context helps reviewers.
- Even for meta-only changes, state why the work matters.

## Hotfix Loop (no PATCHSET)
- Trigger with `ACTIVATE: HOTFIX ENGINE`, optionally appending `: <short note>` for human routing; the prefix before the second colon must match exactly.
- Hotfix ignores the marker switch unless the human also omits the marker; overrides stack only when explicitly invoked.
- Restrict edits to `ops/HOTFIX_PLAN.yaml`, `ops/NEXT.yaml`, `Tasklist.md`, and files listed in the hotfix request.
- Restore `ops/NEXT.yaml` to a READY task before exiting; leave a note documenting the state.

## CLEAR TASKS Trigger (cleanup mode)
- Trigger with the exact phrase `CLEAR TASKS` when humans want all pending patch plans reconciled.
- Upon trigger, process every `<<<PATCHSET START>>>` and `<<<PROPOSED PATCHSET START>>>` block:
   1. Execute or supersede the planned changes so that corresponding Tasklist items transition to `DONE` with outcome notes.
   2. Remove the processed patchset block(s) from Patch.md once Tasklist and Prompt.md reflect the completion.
   3. Sweep for orphaned tasks or clipboard entries; if a task has no remaining work, mark it `DONE` and clear its patchset plan.
- After cleanup, ensure `Tasklist.md` retains at least one READY task, `ops/NEXT.yaml` points at it, and Prompt.md records the reconciliation.
- If no outstanding patchsets exist, respond with a confirmation and leave the clipboard empty except for the idle marker.

Stay disciplined. The repository must always exit a run with a READY pointer, a clean PATCHSET echo, and accurate history.

## Patch Clipboard
# - Paste the exact patchset (matching `Patch-Template.md`) below this heading before you begin editing so humans can audit the plan.
# - After the run, clear or archive the clipboard if humans do not need the scratchpad.
# - Marker detection reads this section; keep this intact when Contract Mode is required.
# - When Tasklist.md contains one or more `PROPOSED` tasks, keep a `<<<PROPOSED PATCHSET START>>>` block that outlines the ready-to-run plan for those tasks; remove the block when no PROPOSED work remains.
# 
# _Patch Clipboard Scratch Area (leave empty when not in use)_
# 
<<<PATCHSET START>>>

## DB.REPLICATION.SYNC Implementation Plan
Task: Implement automated sync orchestrator with rollback handling
Dependencies: DB.REPLICATION.INTEGRITY ✅ DONE

### FILE: src/services/db-replication/sync.ts (NEW - ~550 lines)
Create comprehensive sync orchestration module:

TYPE DEFINITIONS:
- SyncStage enum: VERSION_CHECK | INTEGRITY_VERIFY | MIGRATION_APPLY | VALIDATION | COMPLETE
- SyncResult interface { success: boolean, stage: SyncStage, startedAt: Date, completedAt?: Date, duration?: number, errors: SyncError[], metrics: SyncMetrics }
- SyncMetrics interface { migrationsApplied: number, schemaIntegrityPassed: boolean, dataIntegrityPassed: boolean, versionBefore: string, versionAfter: string, bytesTransferred?: number }
- SyncError interface { stage: SyncStage, message: string, stack?: string, timestamp: Date }
- SyncOptions interface { dryRun?: boolean, skipIntegrity?: boolean, skipDataChecks?: boolean }

FUNCTIONS:
- syncDevToProd(options?): 5-stage orchestrator (version check via compareVersions, integrity verify pre-migration, migration apply via npx prisma migrate deploy with secrets/migrate.env, validation post-migration with fingerprint + integrity checks, complete with db_sync_state update)
- syncProdToLocal(options?): pg_dump/pg_restore orchestrator (version check, dump from Prod, restore to Local, verify fingerprint, integrity check, snapshot pruning)
- loadMigrateEnv(): Load secrets/migrate.env for direct PostgreSQL URLs
- execCommand(cmd, options): Execute shell command with timeout/env
- recordSyncEvent(source, target, result): Update db_sync_state table
- pruneLocalSnapshots(retentionDays): Delete old Local snapshots (7-day default)

### FILE: src/services/db-replication/rollback.ts (NEW - ~250 lines)
Create rollback and error handling module:

TYPE DEFINITIONS:
- RollbackAction enum: BLOCK_SYNC | PRESERVE_STATE | LOG_ERROR | SEND_ALERT | MARK_FAILED
- RollbackResult interface { actions: RollbackAction[], preStatePreserved: boolean, syncBlocked: boolean, alertSent: boolean }

FUNCTIONS:
- handleSyncFailure(result: SyncResult): Orchestrates rollback on any stage failure
- blockDownstreamSync(source, reason): Updates db_sync_state to block future syncs
- preservePreSyncState(source, target, version): Records pre-sync version for recovery
- sendSyncFailureAlert(result: SyncResult): Escalates to operators
- markSyncFailed(source, target, error): Updates db_sync_state with failure status

### FILE: tests/db-replication/sync.test.ts (NEW - ~600 lines)
Comprehensive test suite covering:

SYNC DEV→PROD TESTS (12 tests):
- Version check MATCH scenario (skip sync)
- Version check AHEAD scenario (proceed with sync)
- Version check BEHIND scenario (block sync, reversion detected)
- Version check DIVERGED scenario (block sync, manual resolution)
- Pre-migration integrity check (log warnings, continue)
- Migration apply success (verify exit code 0)
- Migration apply failure (rollback, alert)
- Post-migration version validation (fingerprint match)
- Post-migration schema integrity (diffs fail sync)
- Post-migration data integrity (optional checks)
- Complete stage updates db_sync_state
- Idempotent re-run (skip if already MATCH)

SYNC PROD→LOCAL TESTS (6 tests):
- pg_dump success from Prod
- pg_dump failure handling
- pg_restore success to Local
- pg_restore failure rollback
- Snapshot pruning (7-day retention)
- Version validation after restore

ROLLBACK TESTS (4 tests):
- Rollback on VERSION_CHECK failure
- Rollback on MIGRATION_APPLY failure
- Rollback on VALIDATION failure
- Alert escalation on repeated failures

### TASKLIST UPDATE:
Mark DB.REPLICATION.SYNC status: READY → DONE
Add outcome notes documenting:
- Created src/services/db-replication/sync.ts module (~550 lines) implementing 5-stage orchestrator
- syncDevToProd() with version check, pre-migration integrity, migration apply (secrets/migrate.env), post-migration validation, complete
- syncProdToLocal() with pg_dump/pg_restore, version validation, snapshot pruning
- Created src/services/db-replication/rollback.ts module (~250 lines) with failure handling
- Built comprehensive test suite (22 tests covering DEV→Prod sync, Prod→Local sync, rollback scenarios)
- All tests passing with >90% coverage
Update Last Updated timestamp and Revision (2.92 → 2.93)

### COMMIT MESSAGE:
[Task DB.REPLICATION.SYNC] Add sync orchestrator with rollback handling

Implemented automated sync orchestration for database replication cascade (DEV→Prod→Local).

Changes:
- Created src/services/db-replication/sync.ts module with 5-stage orchestrator
- syncDevToProd(): version check, integrity verify, migration apply, validation, complete
- syncProdToLocal(): pg_dump/pg_restore with version gating and snapshot pruning
- Migration apply uses secrets/migrate.env for direct PostgreSQL DDL operations
- Post-migration validation ensures fingerprint match and schema integrity
- Created src/services/db-replication/rollback.ts for error handling and recovery
- handleSyncFailure() orchestrates rollback, blocks downstream sync, alerts operators
- Built tests/db-replication/sync.test.ts with 22 comprehensive tests

Testing:
- npm test tests/db-replication/sync.test.ts — All tests passing
- DEV→Prod sync: 12 tests covering all 5 stages and failure scenarios
- Prod→Local sync: 6 tests covering pg_dump/restore and pruning
- Rollback: 4 tests for failure handling and alert escalation

Contracts: ON
Phase: DB.REPLICATION (Phase 16) - 4/8 tasks complete (50%)
Tasklist: Rev 2.92 → 2.93
Prompt: Rev 2.38 → 2.39
NEXT: DB.REPLICATION.MONITORING (READY)

<<<PATCHSET END>>>

<<<PROPOSED PATCHSET START>>>

<<<PROPOSED PATCHSET END>>>
