# Hotfix Engine (No-PATCHSET Mode)
Last Updated (UTC): 2025-10-26T02:05:00Z
Revision: 1.0

Purpose
- A rapid, targeted "surgical" edit system that follows the same discipline as the Patch Engine but **does not** use PATCHSET blocks.
- Trigger phrase (case-sensitive): `ACTIVATE: HOTFIX ENGINE`

Scope
- For urgent, well-scoped changes that must land quickly (prod or dev), where PATCHSET ceremony would slow resolution.
- Hotfixes may touch only:
  - Files listed in `ops/HOTFIX_PLAN.yaml: files_hint`
  - The minimal meta set: `Prompt.md`, `Tasklist.md`, `ops/RECOVERY.yaml`, `ops/HOTFIX_PLAN.yaml`
  - Any directory-local `ROUTER.md` corresponding to changed files (timestamp + short note)
- Hotfixes MUST NOT edit `Patch.md` unless it is explicitly the subject of the fix or cited as a relevant source of instructions.

Operating Loop (Hotfix)
0) **Refresh Vision**
   - Try to run `scripts/refresh_vision.sh`. If the runtime cannot shell out, the AI notes:
     `Refresh Vision: I couldn't run refresh_vision.sh in this environment; please execute it locally when possible.`
   - Confirm access to the remote repo (Sherbivs/Infinity-Gauntlet) when possible; otherwise record inability in `ops/RECOVERY.yaml`.
1) **Read Order**
   - `ops/ROUTER_INDEX.yaml` -> discover routed areas
   - `ops/INBOX/notes.md` -> if newer than `ops/RECOVERY.yaml:last_notes_read_utc`, ingest & stamp
   - `ops/HOTFIX_PLAN.yaml` -> get `hotfix_task_id`, `reason`, `files_hint`
   - `Tasklist.md` -> validate the task exists; auto-create if missing (prefixed `HF.`) with status `READY`. When the graph has **no READY entries at all**, seed a fresh hotfix task using the bootstrap template in `ops/HOTFIX_PLAN.yaml` before touching runtime files.
   - `ops/TOUCHMAP.yaml` -> ensure edits stay within allowed globs (hotfix may temporarily extend)
2) **Execute**
   - Apply **direct, minimal edits** to the files in `files_hint` (no PATCHSET block).
   - Update affected directory `ROUTER.md` entries (timestamp + one-line note).
   - Keep changes reversible & deterministic.
3) **Meta Updates**
   - `Tasklist.md` -> mark the hotfix task `DONE` with a concise outcome.
   - `Prompt.md` -> bump timestamp/revision and update "Last Repo Changes".
   - `ops/RECOVERY.yaml` -> stamp `last_hotfix_id`, `last_hotfix_timestamp_utc`, and environment notes.
   - `masterroutetable.md` freshness: if possible, run `npm run router:update`. If not, add a note to Prompt.
4) **Commit**
   - Commit message MUST start with `[Hotfix <ID>]`.
   - Include Why / Changes / Acceptance, similar to standard commit template.
5) **Exit**
   - If further work is needed, add a normal task to `Tasklist.md` and set `ops/NEXT.yaml` accordingly.

## Hotfix Bootstrap Template
- Copy `bootstrap_template` from `ops/HOTFIX_PLAN.yaml` whenever `Tasklist.md` lacks a READY hotfix entry.
- Replace `<short_slug>` with a terse summary (e.g., `db-lock`, `discord-rate-limit`).
- Stamp the new task directly under the relevant phase with:
  1. `status: READY`
  2. Minimal acceptance criteria describing the urgent fix
  3. A short note referencing the triggering incident
- Update `ops/NEXT.yaml` so the hotfix task becomes the active pointer and proceed with the Hotfix Loop above.

Guards & Coupling
- Hotfix commits **must** update `Prompt.md` and `Tasklist.md`. Omission fails CI (`guard-meta`).
- `Patch.md` is optional in Hotfix and **must not** be modified unless explicitly directed.
- `scripts/guard_meta.sh` recognizes Hotfix mode and relaxes PATCHSET echo requirements.

Audit
- The change is still tracked in git history.
- `Prompt.md` captures the summary in "Last Repo Changes" and in the Revision History table.
