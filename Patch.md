# AI PROJECT MANAGER CONTRACT
Last Updated (UTC): 2025-10-25T02:32:00Z
Revision: 1.3

This repository uses **Patch.md** as the single source of truth for automated, AI-driven development flow.
The AI reading this file must follow the loop and rules exactly.

## PRIME DIRECTIVE
Always read and parse `Tasklist.md` first. Work only on tasks whose `status: READY`.
After completing a task, update `Tasklist.md` *convulsively* (immediately) to reflect:
- `status: DONE` for the completed task (with a brief outcome note)
- Any newly-unblocked tasks moved to `status: READY`
- Any newly-discovered subtasks appended (with unique IDs) and appropriate status

## OPERATING LOOP
1. **Load Task Graph**
   - Read `Tasklist.md`.
   - Build an ordered plan from tasks where:
     - `status: READY`
     - All `depends_on` are `DONE`.
   - Never start tasks not marked `READY`.

2. **Execute**
   - For the first READY task in dependency order:
     - Apply code changes using **PATCH BLOCKS** format (below).
     - Keep changes minimal, reversible, and scoped to the task.
     - Run/adjust tests if present.

3. **Update Tasklist**
   - Mark the executed task `DONE`.
   - For any tasks now unblocked, change `status` to `READY`.
   - If you discover missing steps, create new tasks with unique `id` and clear `acceptance_criteria`.

4. **Commit**
   - Generate a commit message using the template below.
   - Multiple small commits are preferred over one giant diff.

5. **Repeat**
   - Return to step 1 until no `READY` tasks remain.

---

## META UPDATE REQUIREMENT (MANDATORY)
- Every PATCHSET must, at minimum, update `Prompt.md` (Timestamp + Revision + “Last Repo Changes”).
- If `Tasklist.md` or `Patch.md` are edited, both must have their header timestamps/revisions bumped in the same PATCHSET.
- If unsure what to change: update `Prompt.md` with a brief note under “Last Repo Changes” and bump its header; then stop or add a tiny precursor task.

### Worker Prompt Requirement
- `Prompt.md` MUST contain the section titled exactly “AI Worker Prompt (copy/paste for Copilot/GPT)”.
- When material workflows change (NEXT/TOUCHMAP/policies), refresh that section accordingly.

## PATCH BLOCKS (MANDATORY FORMAT)
Use the following structure for every change. Provide full-file content for creates/overwrites; use unified diffs for surgical edits when safer.

```

<<<PATCHSET START>>>

# [Task ID]: <short task title>

# FILE: <path/to/file.ext>

```full
<entire new file content here>
```

# FILE: <path/to/another.file>

```diff
@@
- old line
+ new line
```

# TASKLIST UPDATE

```diff
<unified diff patch against Tasklist.md that updates statuses, adds tasks, etc.>
```

<<<PATCHSET END>>>

```

Rules:
- Each PATCHSET handles exactly **one** Task ID.
- If a task requires multiple files, include multiple `# FILE:` sections in the same PATCHSET.
- Always include a `# TASKLIST UPDATE` diff at the end of the PATCHSET.

## COMMIT MESSAGE TEMPLATE
```

[Task <ID>] <Concise summary>

Why: <one or two sentences of the rationale>

Changes:

* <bullet of main change>
* <bullet of tests/docs if any>

Acceptance: <state how acceptance_criteria are met>

```

## SAFETY RAILS
- Do **not** edit secrets or CI/CD tokens.
- Stay within allowed paths unless a task explicitly expands scope.
- Prefer interaction-based Discord features (no message content intent required).
- Keep patches deterministic and idempotent (re-running yields same state).

## FILE PRIORITIES
- Code: `/src/**`
- Data pipeline: `/src/data_pipeline/**`
- Bot commands & DM UI: `/src/bot/**`
- Core mechanics: `/src/core/**`
- Tests: `/tests/**`
- Docs: root markdown files (`*.md`)

## READY DEFINITION
A task is `READY` if:
- It has clear `acceptance_criteria`
- All `depends_on` are `DONE`
- Scope is confined to allowed paths

If a task is ambiguous, create a small precursor task (`status: PROPOSED`) with a clarifying patch to reduce ambiguity, then mark it `READY`.

## DONE DEFINITION
A task is `DONE` if:
- The change compiles (if applicable) and basic lints pass
- Acceptance criteria are demonstrably met
- `Tasklist.md` records the outcome under that task

## FAILURE & ROLLBACK
If a PATCHSET introduces breakage:
- Emit a new PATCHSET to revert the specific files to their previous state.
- Mark the task `BLOCKED` with a short reason and create a `FIX:` task that is `READY`.

## WORKING GOAL
This project’s near-term goal is an **operable Pokémon Discord fan server bot** with:
- DM-as-Home (heal, party/box, starter flow, profile)
- Public `#wilds` channel encounter threads; controls from DM
- Public Arena threads for battles; players command in DM; spectators see summaries
- Persistent state in Postgres; reference data cached to repo by worker

---

## CRITICAL FILES & FAST-PATH LOOKUP
To minimize planning overhead, follow this fast-path order before the normal loop:
1. Read `ops/NEXT.yaml` to get the `next_task_id` and `files_hint`. Validate against `Tasklist.md`.
2. Open `Tasklist.md` to confirm status and dependencies. Only execute tasks that are `READY`.
3. Consult `ops/TOUCHMAP.yaml` for the primary files/paths for the task you are executing.
4. Skim `Prompt.md` for the environment overview and feedback loop; incorporate deltas if it informs the task.
5. Optionally consult `ops/KNOWLEDGE.yaml` for domain truth sources and paths.
6. Execute the normal OPERATING LOOP using PATCH BLOCKS.

On completion of any task:
- Update `ops/NEXT.yaml` to the next READY task and keep `files_hint` minimal but sufficient.
- Extend `ops/TOUCHMAP.yaml` if you touched relevant files not yet mapped.
- If the task changes system behavior or architecture, update `Prompt.md` (Revision History + impacted sections) and verify `ops/KNOWLEDGE.yaml` remains accurate.

Do not bloat these files. Keep them deterministic and concise.

---

## MODIFICATION POLICY: Patch.md & Tasklist.md

These files are the contract and the task graph. Update them deliberately and traceably.

When it’s OK to update `Patch.md`
- Contract evolution that improves automation (e.g., new PATCHSET rules, safety rails, or fast-path steps).
- Fixing ambiguous or conflicting instructions that block work.
- Adding/removing sections that improve clarity or determinism (e.g., new meta policies).
- Clipboard maintenance (the PATCH CLIPBOARD footer is the only place for live PATCHSET staging).

How to update `Patch.md`
1. Prefer doing it under a dedicated META task (id prefix `META:` or `T0.*`) with clear acceptance criteria.
2. Use a surgical diff in the PATCHSET; avoid rewriting the entire file unless necessary.
3. Include a `# TASKLIST UPDATE` that:
   - Marks the META task DONE.
   - Adds any follow-up tasks (e.g., updating `ops/CRITICAL.md`, `ops/NEXT.yaml`, or `ops/TOUCHMAP.yaml`).
4. Never store secrets; never remove the PATCH CLIPBOARD footer.

### Canonical Filenames (DO NOT RENAME)
These filenames are contractual and referenced by Render Build Filters. Never change their spelling or case.
- `Patch.md`
- `Tasklist.md`
- `Prompt.md`
- `ops/PATCH_POLICY_BACKUP.md`

If any of these are renamed, CI will fail (see `.github/workflows/guard-docs.yml`), and the AI must restore their exact names before proceeding.

When it’s OK to update `Tasklist.md`
- Normal lifecycle transitions: READY → IN_PROGRESS → DONE, adding brief outcome notes.
- Unblocking newly-eligible tasks by flipping to READY.
- Adding discovered subtasks:
  - Use concise `id` (e.g., `T4.1a`) and clear `acceptance_criteria`.
  - Set initial `status: PROPOSED` or `READY` if immediately actionable.
- Marking tasks BLOCKED with a short reason and creating a `FIX:` task.

How to update `Tasklist.md`
1. Always via the `# TASKLIST UPDATE` unified diff within the current PATCHSET.
2. Keep the history lightweight: outcome notes belong on each task; deeper context goes to `Prompt.md` (Revision History) if architectural.
3. Avoid mass reformatting; preserve existing order and phases unless a META task explicitly reorganizes them.

Meta-Update Workflow (quick checklist)
1. Create/choose a META task (or the current task if its acceptance criteria require contract changes).
2. Edit `Patch.md`/`Tasklist.md` with minimal diffs; reflect any crossfile implications (`ops/NEXT.yaml`, `ops/CRITICAL.md`, `ops/TOUCHMAP.yaml`).
3. Update `Tasklist.md` (status changes, new tasks).
4. Commit with a message that states why the meta-change was necessary.

---

## PATCH CLIPBOARD (FOOTER)

This is a **staging area** where the AI can paste the next PATCHSET before applying it.  
It is intentionally placed at the bottom of `Patch.md` for quick access.  
This section may be overwritten frequently.

> **Rules for the Clipboard**
> - Only one PATCHSET may live here at a time.
> - After committing, either clear the clipboard or replace it with the next PATCHSET.
> - Do not store secrets here.

```

==============================================================
PATCH CLIPBOARD — STAGING AREA (AI-Editable)
Paste your next PATCHSET below.

````
````
You’ve got that old **T0.FIX.BUILD_DIST** PATCHSET embedded inside `Prompt.md` again (right after the AI Worker Prompt). That’ll confuse your worker and can trip the CI guards. Here’s a single, tidy PATCHSET that:

* removes the stale embedded PATCHSET/commit blob from `Prompt.md`
* bumps timestamps/revisions in all meta files (per policy)
* logs the cleanup as a DONE meta task in `Tasklist.md`
* updates `ops/NEXT.yaml` pointer note

Paste this in your Patch.md clipboard and run it.

````
<<<PATCHSET START>>>
# [T0.CLEAN.PROMPT.C]: Remove stale embedded PATCHSET from Prompt.md; bump meta stamps

# FILE: Prompt.md
```diff
@@
-Timestamp (UTC): 2025-10-25T02:32:00Z
-Revision: 0.17
+Timestamp (UTC): 2025-10-25T02:35:00Z
+Revision: 0.18
@@
 OUTPUT:
 - Only emit the PATCHSET block (and then the Commit Message block). No extra prose unless the task explicitly asks.
````

*

## -You’re right — Render is still running `npm install` as the build step (not your `render.yaml`), so `dist/index.js` never gets produced. We’ll fix this in a belt-and-suspenders way:

-1. Add a `postinstall` script that compiles TypeScript during the build step even if Render only runs `npm install`.
-2. Ensure the compiler and Prisma codegen are available at build time by invoking them directly (no global tsc assumptions).
-3. Log the change in Prompt.md and bump timestamps/revisions.
--------------------------------------------------------------

## -Paste this PATCHSET into your Patch.md clipboard and run it.

-````
-<<<PATCHSET START>>>
-# [T0.FIX.BUILD_DIST]: Ensure dist/index.js exists on Render when build step only runs `npm install`
-----------------------------------------------------------------------------------------------------

-# FILE: package.json
-```diff
-@@

* "scripts": {
  --    "prebuild": "prisma generate",
  --    "build": "tsc -p tsconfig.json",
  -+    "prebuild": "prisma generate",
  -+    "build": "tsc -p tsconfig.json",
  -+    "build:ci": "node ./node_modules/prisma/build/index.js generate && node ./node_modules/typescript/bin/tsc -p tsconfig.json",
  -+    "postinstall": "npm run build:ci",
* ```
  "dev": "tsx watch src/index.ts",
  ```
* ```
  "start": "node dist/index.js",
  ```
* ```
  "lint": "eslint . --ext .ts,.tsx",
  ```
* ```
  "format": "prettier --write .",
  ```
* ```
  "test": "vitest run",
  ```
* ```
  "test:watch": "vitest"
  ```
* },
  --  "devDependencies": {
  -+  "devDependencies": {
  -@@
  --    "vitest": "^2.0.5",
  --    "prisma": "^5.19.2"
  -+    "vitest": "^2.0.5",
  -+    "prisma": "^5.19.2"
* },
* "dependencies": {
  --    "@prisma/client": "^5.19.2"
  -+    "@prisma/client": "^5.19.2",
  -+    "typescript": "^5.6.3"
* }
* }
  -````
*

## -# FILE: Prompt.md

-```diff
-@@
--Timestamp (UTC): 2025-10-25T01:00:00Z
--Revision: 0.3
-+Timestamp (UTC): 2025-10-25T01:07:00Z
-+Revision: 0.4
-@@
--> Changes in this revision:
-+> Changes in this revision:

* > * `render.yaml` — added explicit `buildCommand` (npm ci && npm run build) and `startCommand` (node dist/index.js) to fix Render “Missing script: start”.
* > * `src/bot/`, `src/core/battle/`, `src/core/encounter/`, `src/shared/`, `src/data_pipeline/`, `tests/` — created scaffold entries to establish project layout.
* > * `RULESET.md`, `DATA-SCHEMA.md`, `OPERATIONS.md` — added stub docs with UTC placeholders.
* > * `ops/NEXT.yaml` — advanced `next_task_id` to `T1.1` (DB schema) and updated `files_hint`.
* > * `Tasklist.md` — marked `T0.2` DONE; added fix task for Render start.
  >   -+> - `package.json` — added `postinstall` hook that runs `build:ci` so `dist/index.js` is created even when Render only runs `npm install`; ensured local bin invocations for Prisma + TypeScript.
  >   -+> - **Impact:** Start command `node dist/index.js` now succeeds consistently on Render.
  >   -@@
* | 2025-10-25 | 0.3 | Added structured logger; updated boot logs; NEXT -> T2.1 | AI | Prep for data schema work |
  -+| 2025-10-25 | 0.4 | Build fix for Render: postinstall compiles TS to dist; stable start | AI | Avoids MODULE_NOT_FOUND for dist/index.js |
  -```
*

## -# FILE: Patch.md

-`diff
-@@ --Last Updated (UTC): 2025-10-25T01:00:00Z --Revision: 0.4
-+Last Updated (UTC): 2025-10-25T01:07:00Z
-+Revision: 0.5
-`
--

## -# FILE: Tasklist.md

-```diff
-@@
--Last Updated (UTC): 2025-10-25T01:00:00Z
--Revision: 0.4
-+Last Updated (UTC): 2025-10-25T01:07:00Z
-+Revision: 0.5
-@@

* ## Phase 0 — Repo & Tooling

-@@
--+ id: T0.FIX.BUILD_DIST
-+  title: Ensure dist is built during Render "npm install" build step
-+  status: DONE
-+  depends_on: [T1.1, T1.2]
-+  acceptance_criteria:
-+    - `package.json` contains a `postinstall` that compiles TypeScript to `dist/`
-+    - Build does not rely on global `tsc`; uses local binaries
-+    - Render start (`node dist/index.js`) works without needing render.yaml
-+  notes: Outcome — `dist/index.js` created during `npm install`; eliminates MODULE_NOT_FOUND at runtime.
-```
----

## -# FILE: ops/NEXT.yaml

-```diff
---- a/ops/NEXT.yaml
-+++ b/ops/NEXT.yaml
-@@

* timestamp_utc: 2025-10-25T01:00:00Z
* -note: "Logging in place; next define reference data schemas and tests."
* +note: "Logging in place; added postinstall build to produce dist under Render; next define reference data schemas and tests."
  -```
*

## -<<<PATCHSET END>>>

## -```

-**Commit Message**
-```
----

## -[Task T0.FIX.BUILD_DIST] Build dist during Render’s `npm install` to avoid MODULE_NOT_FOUND

-Why:
-Render’s current service is ignoring render.yaml and only running `npm install`, so `dist/index.js` wasn’t generated and the app crashed at start.
---------------------------------------------------------------------------------------------------------------------------------------------------

## -Changes:

-* package.json: added `postinstall` that runs `build:ci`; `build:ci` invokes local Prisma and TypeScript binaries to compile into `dist/`.
-* Prompt.md: logged the change and bumped timestamp/revision.
-* Patch.md/Tasklist.md: stamped timestamps/revisions; recorded fix task as DONE.
-* ops/NEXT.yaml: noted the fix in the pointer note.
----------------------------------------------------

-Acceptance:
-Deploy pipeline that only runs `npm install` now emits `dist/index.js`. Start command `node dist/index.js` succeeds on Render.
-------------------------------------------------------------------------------------------------------------------------------

## -```

-If you later switch the service to a Render “Blueprint” using `render.yaml`, you can drop the `postinstall` hook, but this keeps you resilient right now.
-```
+> Note: Removed an embedded historical PATCHSET/commit blob to keep this file deterministic and single-sourced.

````

# FILE: Patch.md
```diff
@@
-Last Updated (UTC): 2025-10-25T02:28:00Z
-Revision: 1.6
+Last Updated (UTC): 2025-10-25T02:35:00Z
+Revision: 1.7
````

# FILE: Tasklist.md

```diff
@@
-Last Updated (UTC): 2025-10-25T02:28:00Z
-Revision: 1.8
+Last Updated (UTC): 2025-10-25T02:35:00Z
+Revision: 1.9
@@
 ## Phase 0 — Repo & Tooling
@@
+- id: T0.CLEAN.PROMPT.C
+  title: Remove stale embedded PATCHSET from Prompt.md
+  status: DONE
+  depends_on: []
+  acceptance_criteria:
+    - Prompt.md contains only curated sections and the AI Worker Prompt
+    - No embedded PATCHSET/commit blobs remain
+  notes: Outcome — Keeps Prompt.md deterministic; avoids reapplying old fixes.
```

# FILE: ops/NEXT.yaml

```diff
@@
-timestamp_utc: 2025-10-25T02:28:00Z
-note: "Activation trigger added and enforced; proceed with T2.2 (pipeline manifest)."
+timestamp_utc: 2025-10-25T02:35:00Z
+note: "Prompt cleaned (removed historical blob). Proceed with T2.2."
```

<<<PATCHSET END>>>

```

**Commit Message**
```

[Task T0.CLEAN.PROMPT.C] Remove stale embedded PATCHSET from Prompt.md; bump meta stamps

Why:
An old PATCHSET/commit message was pasted into Prompt.md under the AI Worker Prompt, which would mislead the worker and break determinism.

Changes:

* Prompt.md: deleted the embedded PATCHSET and added a note; bumped Timestamp/Revision.
* Patch.md / Tasklist.md: header stamps bumped; logged a DONE meta task.
* NEXT: updated note/timestamp.

Acceptance:
Prompt.md is once again a clean, single source of truth; CI meta guards pass; the worker won’t attempt to reapply historical patches.

```

When you’re ready to kick off an AI run, you can paste the trigger anywhere:

```

ACTIVATE: PATCH ENGINE

```

That snaps any worker into the repo’s Patch protocol instantly.
```
