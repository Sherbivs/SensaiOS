# AI PROJECT MANAGER CONTRACT
Last Updated (UTC): 2025-10-29T19:10:00Z
Revision: 1.48

This repository uses **Patch.md** as the working agreement between humans and automation.
Read this file completely before beginning any task. Follow it literally. Before editing, confirm the READY queue, NEXT pointer, and meta docs (Patch/Prompt/Tasklist) are readable and synchronized.

## Marker Switch

## Absolutes (apply in every mode)
- Never rename or delete canonical meta/routing files (`Patch.md`, `Tasklist.md`, `Prompt.md`, `ops/PATCH_POLICY_BACKUP.md`, `ops/ROUTER.yaml`, `ops/ROUTER_INDEX.yaml`, `masterroutetable.md`, and any `ROUTER.md`).
- Never delete or rename router manifests (`ROUTER.md`, `ROUTER.yaml`).
1. Read `ops/NEXT.yaml` (respect Marker Switch guidance) to learn the queued task and `files_hint`.
2. Read `Tasklist.md` and execute **only** tasks marked `status: READY` with dependencies satisfied.
3. Read `ops/TOUCHMAP.yaml` to scope edits to the listed paths.
4. Keep every change reversible and minimal.

## Preflight
- If Tasklist.md has no READY tasks (ignoring `META.UNBLOCK.READY_SEED`), promote the oldest eligible PROPOSED whose dependencies are DONE. If none exist, add `META.UNBLOCK.READY_SEED` as READY.
- Ensure `ops/NEXT.yaml:next_task_id` points to a READY task and `files_hint` only lists files you expect to touch.
- Confirm `Patch.md`, `Prompt.md`, and `Tasklist.md` are readable. If any are missing or corrupt, stop and request refreshed copies.

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
- Paste the exact patchset (matching `Patch-Template.md`) below this heading before you begin editing so humans can audit the plan.
- After the run, clear or archive the clipboard if humans do not need the scratchpad.
- Marker detection reads this section; keep `<<<PATCHSET START>>>` intact when Contract Mode is required.
- When Tasklist.md contains one or more `PROPOSED` tasks, keep a `<<<PROPOSED PATCHSET START>>>` block that outlines the ready-to-run plan for those tasks; remove the block when no PROPOSED work remains.

_Patch Clipboard Scratch Area (leave empty when not in use)_





<<<PATCHSET START>>>
[Task T10.DEX.MIGRATE_ACCELERATE] Complete dex spine rollout on Accelerate + refresh SpeciesSheet

FILE: secrets/prisma-accelerate.env
Change: Store the Prisma Accelerate direct connection string locally so migrate deploy can target the primary database.

FILE: scripts/ops/run_dex_migrations.ps1
Change: New helper script to export DATABASE_URL/DATABASE_DIRECT_URL from the secrets file, run `npx prisma migrate deploy`, and refresh `SpeciesSheet` on Accelerate and Render.

FILE: ops/DB_IMPORT_PRISMA_POSTGRES.md
Change: Document the new helper script usage and the requirement to refresh `SpeciesSheet` after migrations.

FILE: scripts/check_db_redundancy.ts
Change: Extend redundancy checks to confirm Species, Type, Move, and SpeciesSheet parity between Accelerate and Render after deploy.

FILE: Prompt.md
Change: Log the Accelerate deploy/refresh outcome and update the PATCHSET echo once migrations complete.

<<<PROPOSED PATCHSET START>>>
[Task T10.DEX.ROLLOUT_PLAN] Execute dex seeding, cache warm, and species backfill rollout

FILE: scripts/dex/seed_reference.ts
Change: Create a Prisma-based seeding script that upserts dex tables from `data/pokemon.json` and `data/effects.json` using `createMany({ skipDuplicates: true })` with chunking for large payloads.

FILE: scripts/dex/warm_species_cache.ts
Change: Add a bootstrap helper to refresh the cache or materialized view consumer after seeding (invokes existing cache refresh utilities).

FILE: scripts/dex/backfill_species_id.ts
Change: New script to populate `PokemonInstance.speciesId` and `Encounter.speciesId` via canonical dex lookups, emitting a dry-run option and summary report.

FILE: src/bot/cache/index.ts
Change: Export a reusable cache warm function so the bootstrap hook can be invoked from scripts and workers.

FILE: scripts/check_db_redundancy.ts
Change: Enhance parity checks to ensure seeded dex data and backfilled species IDs match across Accelerate and Render.

FILE: Tasklist.md
Change: Transition T10.DEX.SEED_CACHE_WARM and T10.DEX.SPECIES_BACKFILL to READY once scripts exist; capture outcome notes after execution.

# TASKLIST UPDATE
Change: Introduce T10.DEX.MIGRATE_ACCELERATE, T10.DEX.SEED_CACHE_WARM, and T10.DEX.SPECIES_BACKFILL as PROPOSED with acceptance criteria mirroring the outstanding rollout steps; keep NEXT on T8.4.

<<<PROPOSED PATCHSET END>>>
<<<PATCHSET END>>>










