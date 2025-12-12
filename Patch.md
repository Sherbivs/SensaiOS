# AI PROJECT MANAGER CONTRACT
Last Updated (UTC): 2025-11-17T09:15:00Z
Revision: 1.74

This repository uses **Patch.md** as the working agreement between humans and automation.
Read this file completely before beginning any task. Follow it literally. Before editing, confirm the READY queue, NEXT pointer, and meta docs (Patch/Prompt/Tasklist) are readable and synchronized.

**Cross-References**:
- See `Prompt.md` for current timestamp, recent changes, PATCHSET echo template
- See `Tasklist.md` for backlog (READY queue, dependencies, acceptance criteria)
- See `ops/NEXT.yaml` for task pointer discipline (must point to READY task)
- See `ops/TOUCHMAP.yaml` for file scope boundaries per task
**Cross-References**:
- See `Prompt.md` for operational context (current timestamp, revision, recent changes, PATCHSET echo)
- See `operations-bible/02-database-operations.md` for CRITICAL database URL selection logic (Absolute requirement)

**Referenced By**: AGENTS.md (Orientation Flow), Prompt.md (Contract Mode status), ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md (validation requirements)

## Marker Switch

## Absolutes (apply in every mode)
- Never rename or delete canonical meta/routing files (`Patch.md`, `Tasklist.md`, `Prompt.md`, `ops/PATCH_POLICY_BACKUP.md`, `ops/ROUTER.yaml`, `ops/ROUTER_INDEX.yaml`, `masterroutetable.md`, and any `ROUTER.md`).
- Never delete or rename router manifests (`ROUTER.md`, `ROUTER.yaml`).
- Ensure `.gitignore` preserves meta documentation for AI navigation (ROUTER.md, README.md in all directories) while excluding sensitive files (secrets/*.env, Store/db/, tools/pgsql*/ binaries).
- **All database operations must use environment-aware URL selection** (see `operations-bible/02-database-operations.md`): All environments use `PROD_DATABASE_URL` (Render managed PostgreSQL); Migrations use `PROD_DATABASE_URL` or `RENDER_DB_EXTERNAL_URL` (direct PostgreSQL); Local development falls back to `DATABASE_ONPREMISE_DEV_PRIMARY` (workstation offline mode). Non-compliance causes production failures.
- **Database naming MUST use canonical terms:** CLOUD-PROD-MASTER (`PROD_DATABASE_URL`), ONPREMISE-DEV-PRIMARY (`DATABASE_ONPREMISE_DEV_PRIMARY`), ONPREMISE-DEV-EXPERIMENT (`DATABASE_ONPREMISE_DEV_EXPERIMENT`). NEVER use ambiguous terms: local, LOCAL, PRIMARY LOCAL, EXPERIMENTAL, experiment, DEV_DATABASE_URL (deprecated). Prisma clients: `prisma`, `onPremiseDevPrisma`, `onPremiseExperimentPrisma`. CLI targets: `cloud-prod`, `onpremise-dev`, `onpremise-experiment`. See `operations-bible/02-database-operations.md` for complete specification.
- **Meta-System Quality Discipline (Anti-Stuck Rules):**
  - Code changes MUST update routers when adding/moving/changing file purposes (failure accumulates technical debt)
  - Architectural knowledge MUST flow into Bible system (architecture-bible/, operations-bible/, development-bible/) not scattered .md files
  - Transient notes belong in Tasklist.md or Prompt.md, NOT as standalone documents in ops/ or root
  - Router manifests MUST stay synchronized: run `npm run docs:update-routers` after structural changes
  - TOUCHMAP.yaml MUST reflect actual file ownership (stale entries cause scope confusion)
1. Read `ops/NEXT.yaml` (respect Marker Switch guidance) to learn the queued task and `files_hint`.
2. Read `Tasklist.md` and execute **only** tasks marked `status: READY` with dependencies satisfied.
3. Read `ops/TOUCHMAP.yaml` to scope edits to the listed paths.
4. Keep every change reversible and minimal.

## Preflight
- If Tasklist.md has no READY tasks (ignoring `META.UNBLOCK.READY_SEED`), promote the oldest eligible PROPOSED whose dependencies are DONE. If none exist, add `META.UNBLOCK.READY_SEED` as READY.
- Ensure `ops/NEXT.yaml:main_tasks` contains up to 3 active READY tasks and `quick_task` slot is available for hot work.
- Verify `files_hint` for each task only lists files you expect to touch.
- Confirm `Patch.md`, `Prompt.md`, and `Tasklist.md` are readable. If any are missing or corrupt, stop and request refreshed copies.
- Clear or overwrite any prior clipboard or NEXT context when beginning a new task; every run starts with a fresh plan so stale patchsets or pointers cannot stall progress.

## Operating Loop (Contract Mode)
1. **Plan & Execute**
   - Select up to 3 main tasks from READY queue (respect dependency order) for parallel work. Honor `ops/TOUCHMAP.yaml`.
   - Quick/hot tasks (bug fixes, docs, hotfixes < 30min) can be added as a 4th concurrent task.
   - Implement changes using PATCHSET from the clipboard (see "Legacy Layout Bridge").
   - Run targeted tests whenever tooling is available; if not, state why in the echo and commit message.
2. **Update State**
   - Mark completed tasks `DONE` in `Tasklist.md` with concise outcome notes. Promote newly unblocked tasks to `READY`.
   - Update `ops/NEXT.yaml` main_tasks queue (add/remove/reorder) and quick_task slot with updated timestamp and rationale.
   - Extend `ops/TOUCHMAP.yaml` if you touched new paths.
   - Refresh `Prompt.md` (Timestamp, Revision, "Last Repo Changes", PATCHSET Echo, and any relevant tables).
3. **Meta-System Maintenance (Mandatory Quality Gates)**
   - **Router Sync:** If code changes touched new directories or modified file purposes → Update parent/child `ROUTER.md` + run `npm run docs:update-routers`
   - **Bible Integration:** If architectural decisions, operational procedures, or development patterns established → Document in appropriate Bible section (architecture-bible/, operations-bible/, development-bible/)
   - **Tasklist Cleanup:** If task completed with outcome notes → Consider archiving if >20 DONE tasks accumulate
   - **Prompt Compression:** If Prompt.md grows >500 lines → Archive historical logs, keep only recent 10 commits + current PATCHSET
   - **TOUCHMAP Accuracy:** If files edited outside existing entries → Extend `ops/TOUCHMAP.yaml` with new paths and ownership
   - Skipping meta-maintenance triggers Postflight anti-stuck enforcement (forces META.* tasks into queue)

## Postflight
- Refuse to exit if Tasklist.md lists no READY tasks besides the seed; auto-promote as needed.
- Refuse to exit if `ops/NEXT.yaml:main_tasks` is empty and `quick_task` is null; populate at least one task before finishing.
- Record the final active tasks (main + quick) and contract state (Contracts ON/OFF) inside the PATCHSET Echo.
- **Meta-System Health Check (Anti-Stuck Enforcement):**
  - If 5+ consecutive runs modified code WITHOUT updating routers → FORCE `META.ROUTER.SYNC` task into quick_task slot
  - If Bible system not updated in 10+ code changes → FORCE `META.BIBLE.CONSOLIDATE` task into quick_task slot
  - If Tasklist.md has 20+ DONE tasks → FORCE `META.TASKLIST.ARCHIVE` task into quick_task slot
  - If Prompt.md >500 lines → FORCE `META.PROMPT.COMPRESS` task into quick_task slot
  - These checks prevent technical debt accumulation and ensure high-quality meta-system maintenance

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
- Hotfixes can use the `quick_task` slot in `ops/NEXT.yaml` or run independently.
- Restrict edits to `ops/HOTFIX_PLAN.yaml`, `ops/NEXT.yaml`, `Tasklist.md`, and files listed in the hotfix request.
- Restore `ops/NEXT.yaml` main_tasks queue before exiting; leave a note documenting the state.

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

<<<PATCHSET END>>>

<<<PROPOSED PATCHSET START>>>

<<<PROPOSED PATCHSET END>>>
