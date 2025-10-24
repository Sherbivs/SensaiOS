# Critical Files Index (Fast-Path)

This file is the **road map** for automation. It lists the *minimum set* of files an AI should read first to know
what to do next, where to change it, and how to update state.

## Boot Order (Fast-Path)
1) `ops/NEXT.yaml` — single source of *what to do next*.
2) `Tasklist.md` — authoritative task graph and statuses.
3) `ops/TOUCHMAP.yaml` — mapping from task IDs/globs to file paths that will be touched.
4) `Patch.md` — contract (how to emit patches and update the task graph).
5) Relevant code paths from `ops/TOUCHMAP.yaml`.

## Hot Paths (by concern)
- **Discord bot (commands/UI):** `/src/bot/**`
- **Battle engine:** `/src/core/battle/**`
- **Encounters/catching:** `/src/core/encounter/**`
- **Shared tooling:** `/src/shared/**`
- **Data pipeline:** `/src/data_pipeline/**`
- **Tests:** `/tests/**`
- **Docs:** `/*.md`, `/ops/**`

## Update Rules
- After *every* completed task: update `ops/NEXT.yaml` to the next `READY` task and narrow `files_hint`.
- If a task touches new paths not listed, extend `ops/TOUCHMAP.yaml`.
- Keep these files **small and deterministic**. Re-run yields the same state.
