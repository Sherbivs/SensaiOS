# Critical Files Index (Fast-Path)

This file is the **road map** for automation. It lists the *minimum set* of files an AI should read first to know
what to do next, where to change it, and how to update state.

## Boot Order (Fast-Path)
1) `ops/NEXT.yaml` — single source of *what to do next*.
2) `Tasklist.md` — authoritative task graph and statuses.
3) `ops/TOUCHMAP.yaml` — mapping from task IDs/globs to file paths that will be touched.
4) `Patch.md` — contract (how to emit patches and update the task graph).
5) `Prompt.md` — environment understanding prompt (systems overview & feedback loop).
6) `ops/KNOWLEDGE.yaml` — knowledge map linking domains to truth sources.
7) Relevant code paths from `ops/TOUCHMAP.yaml`.

## Hot Paths (by concern)
- **Discord bot (commands/UI):** `/src/bot/**`
- **Battle engine:** `/src/core/battle/**`
- **Encounters/catching:** `/src/core/encounter/**`
- **Shared tooling:** `/src/shared/**`
- **Data pipeline:** `/src/data_pipeline/**`
- **Tests:** `/tests/**`
- **Docs:** `/*.md`, `/ops/**`
	- Prioritize: `Prompt.md`, `Patch.md`, `Tasklist.md`, `ops/**`

## Update Rules
- After *every* completed task: update `ops/NEXT.yaml` to the next `READY` task and narrow `files_hint`.
- If a task touches new paths not listed, extend `ops/TOUCHMAP.yaml`.
- If the task changed system behavior/architecture, update `Prompt.md` (Revision History + affected sections) and ensure `ops/KNOWLEDGE.yaml` still points to the right sources.
- Keep these files **small and deterministic**. Re-run yields the same state.

## Refresh Vision Phase (MANDATORY)
- Before selecting a task, run the refresh workflow:
	1) Execute `scripts/refresh_vision.sh` to regenerate `ops/ROUTER_INDEX.yaml`, update the change ledger in `Prompt.md` (if available), and stamp `ops/RECOVERY.yaml`.
	2) Read `ops/ROUTER_INDEX.yaml` and relevant `ROUTER.md` files for context.
	3) Proceed to the task selection loop.

### Contract & Task Graph Updates (Policy)
- Contract edits (`Patch.md`) should be done under a dedicated **META** task using surgical diffs.
- Task graph edits (`Tasklist.md`) happen in the **# TASKLIST UPDATE** section of a PATCHSET and must include:
	- Status transitions with a brief outcome note.
	- New subtasks (with acceptance criteria) or `BLOCKED` markers with a `FIX:` task.
	- Any newly unblocked tasks flipped to `READY`.
	- **Canonical Filenames:** Do not rename `Patch.md`, `Tasklist.md`, `Prompt.md`, or `ops/PATCH_POLICY_BACKUP.md`. Render Build Filters depend on exact case; CI enforces via `guard-docs` workflow.
	- **META Update Requirement:** On every PATCHSET, update `Prompt.md` (timestamp, revision, change bullets). If either `Patch.md` or `Tasklist.md` is edited, both must have header bumps in the same commit.
	- **Routers:** If a changed file resides under a directory with a `ROUTER.md`, update its metadata (Last Updated; affected globs/notes). After any router change, re-run `scripts/update_router_index.sh`.
