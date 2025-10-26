# AI PROJECT MANAGER CONTRACT
Last Updated (UTC): 2025-10-26T13:45:00Z
Revision: 1.30

This repository uses **Patch.md** as the working agreement between humans and automation.
Read this file completely before beginning any task. Follow it literally.

## Prime Directive
1. Read `ops/NEXT.yaml` to learn the queued task and files_hint.
2. Read `Tasklist.md` and execute **only** tasks marked `status: READY` with dependencies satisfied.
3. Read `ops/TOUCHMAP.yaml` to scope edits to the listed paths.
4. Keep every change reversible and minimal.

## Operating Loop (with mandatory readiness checks)
1. **Preflight**
   - If Tasklist.md has no READY tasks (ignoring `META.UNBLOCK.READY_SEED`), promote the oldest eligible PROPOSED whose dependencies are DONE. If none exist, add `META.UNBLOCK.READY_SEED` as READY.
   - Ensure `ops/NEXT.yaml:next_task_id` points to a READY task and `files_hint` only lists files you expect to touch.
   - Confirm `Patch.md`, `Prompt.md`, and `Tasklist.md` are readable. If any are missing or corrupt, stop and request refreshed copies.
2. **Plan & Execute**
   - Select the first READY task (respect dependency order) and plan tightly scoped edits. Honor `ops/TOUCHMAP.yaml`.
   - Implement the change using a single PATCHSET (see “Patchset Format”).
   - Run targeted tests whenever tooling is available; if not, state why in the echo and commit message.
3. **Update State**
   - Mark the task `DONE` in `Tasklist.md` with a concise outcome note. Promote newly unblocked tasks to `READY`.
   - Update `ops/NEXT.yaml` to point to the next READY task with an updated timestamp, rationale, and trimmed `files_hint`.
   - Extend `ops/TOUCHMAP.yaml` if you touched new paths.
   - Refresh `Prompt.md` (Timestamp, Revision, “Last Repo Changes”, PATCHSET Echo, and any relevant tables).
4. **Postflight**
   - Verify Tasklist.md lists at least one READY task besides the seed.
   - Confirm `ops/NEXT.yaml` targets a READY task with minimal `files_hint`.
   - Document the READY pointer and rationale inside the PATCHSET Echo before exiting.
5. **Repeat**

## Patchset Format
Every submission must contain exactly one fenced PATCHSET block followed by one fenced Commit Message block.
- **New files**: include full file contents.
- **Modified files**: use unified diffs (` ```diff`).
- **Binary/large assets**: avoid committing unless explicitly required.
- Keep diffs small, deterministic, and free from stray whitespace.

## Tasklist Discipline
- Update headers (`Last Updated`, `Revision`) whenever Tasklist.md changes.
- Add acceptance criteria for new tasks; include outcome notes when marking DONE.
- Never delete tasks with active dependencies. Archive long DONE history via `npm run tasks:archive` if needed.

## Prompt.md Requirements
- Bump Timestamp and Revision on every change.
- “Last Repo Changes” must summarize the effective modifications in plain text bullets.
- Maintain a populated PATCHSET Echo between the markers. Use sentences only (no code fences, JSON, or embedded files). Mention the HEAD (or pending-local) revision, summarize the work, state `TasklistDiff true|false`, describe tests, and identify which READY task `ops/NEXT.yaml` targets and why.
- Preserve the section titled **“AI Worker Prompt (copy/paste for Copilot/GPT)”** exactly.

## Tests & Evidence
- Run available tests relevant to the touched code. Capture command outputs for the final report.
- If tests cannot run (tooling unavailable, dependency missing), explain the limitation in both the PATCHSET Echo and Commit Message.

## Commit Message Guidelines
- Use the format `[Task <ID>] Concise summary` when closing a Tasklist item.
- Include a short “Why / Changes / Testing” body when additional context helps reviewers.
- Even for meta-only changes, state why the work matters.

## Hotfix Loop (no PATCHSET)
- Trigger with `ACTIVATE: HOTFIX ENGINE`.
- Restrict edits to `ops/HOTFIX_PLAN.yaml`, `ops/NEXT.yaml`, `Tasklist.md`, and files listed in the hotfix request.
- Restore `ops/NEXT.yaml` to a READY task before exiting; leave a note documenting the state.

Stay disciplined. The repository must always exit a run with a READY pointer, a clean PATCHSET echo, and accurate history.
