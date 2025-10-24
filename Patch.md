Got it. Here’s a complete `Patch.md` you can paste over your current one. I added a persistent footer for a **PATCH CLIPBOARD** so AI can stage the next patchset at the bottom without hunting for a place to put it.

```md
# AI PROJECT MANAGER CONTRACT

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

Absolutely. Kicking off with the first actionable task from the task list: **T0.1 – Initialize TypeScript project & tooling**. Here’s a ready-to-paste PATCHSET you can drop into your `Patch.md` clipboard. It sets up TypeScript, ESLint, Prettier, Vitest, and a sample test.

````
Here’s a paste-ready PATCHSET that adds a **Critical Files Fast-Path system** so the AI can jump straight to the next relevant files without scanning the whole repo. It updates `Patch.md` to define the fast-path order and adds `ops/CRITICAL.md`, `ops/NEXT.yaml`, and `ops/TOUCHMAP.yaml`.

````
<<<PATCHSET START>>>
# [T0.FP]: Add Critical Files Fast-Path system (NEXT pointer + touch map + contract hooks)

# FILE: ops/CRITICAL.md
```full
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
````

# FILE: ops/NEXT.yaml

```full
# NEXT POINTER — Single-file pointer for the next actionable task and file hints.
# The AI should read this first, then confirm against Tasklist.md, then proceed.

next_task_id: T0.2
reason: >
  T0.1 (TypeScript/tooling) is DONE. The next READY task is T0.2 (Create repo structure and docs),
  which unblocks DB schema and Discord bootstrap. This pointer accelerates lookup.

files_hint:
  # High-signal targets for the next task
  - "src/bot/"
  - "src/core/battle/"
  - "src/core/encounter/"
  - "src/shared/"
  - "src/data_pipeline/"
  - "tests/"
  - "RULESET.md"
  - "DATA-SCHEMA.md"
  - "OPERATIONS.md"

# Required actions after completion:
# - Set next_task_id to the next READY task.
# - Trim files_hint to only the highest-signal paths/files for that task.
# - If the next task is blocked, update reason to explain why and who/what unblocks it.
```

# FILE: ops/TOUCHMAP.yaml

```full
# TOUCH MAP — Maps task IDs (or glob prefixes) to the primary files/paths they modify.
# This gives the AI a fast way to jump to relevant files for each task.

# Exact task IDs
T0.1:
  - "package.json"
  - "tsconfig.json"
  - ".eslintrc.cjs"
  - ".prettierrc"
  - "src/index.ts"
  - "tests/sample.spec.ts"

T0.2:
  - "src/bot/**"
  - "src/core/battle/**"
  - "src/core/encounter/**"
  - "src/shared/**"
  - "src/data_pipeline/**"
  - "tests/**"
  - "RULESET.md"
  - "DATA-SCHEMA.md"
  - "OPERATIONS.md"

T1.1:
  - "src/shared/config.ts"
  - "prisma/schema.prisma"
  - "src/models/**"
  - "migrations/**"

T1.2:
  - "src/shared/config.ts"
  - "src/shared/log.ts"

T2.1:
  - "src/data_pipeline/schema/**"
  - "tests/data_schema.spec.ts"

T2.2:
  - "src/data_pipeline/index.ts"
  - "data/**"
  - "tests/data_pipeline.spec.ts"

T3.1:
  - "src/bot/bootstrap.ts"
  - "src/bot/commands/register.ts"

T3.2:
  - "src/bot/dm/home.tsx"
  - "src/bot/dm/components/**"
  - "src/shared/assets/**"
  - "tests/dm_home.spec.ts"

T3.3:
  - "src/bot/dm/starters.ts"
  - "src/bot/dm/heal.ts"
  - "tests/starters_heal.spec.ts"

T4.1:
  - "src/core/encounter/spawn.ts"
  - "src/bot/wilds/walk.ts"
  - "tests/encounter_walk.spec.ts"

T4.2:
  - "src/core/encounter/catch.ts"
  - "src/bot/wilds/controls.ts"
  - "tests/catch.spec.ts"

T5.1:
  - "src/bot/battle/challenge.ts"
  - "src/bot/arena/thread.ts"
  - "tests/battle_flow.spec.ts"

T5.2:
  - "src/core/battle/engine.ts"
  - "src/core/battle/damage.ts"
  - "src/core/battle/status.ts"
  - "tests/battle_engine.spec.ts"

T5.3:
  - "src/bot/battle/actions.ts"
  - "src/bot/arena/summary.ts"
  - "tests/battle_ui.spec.ts"

T6.1:
  - "src/bot/middleware/limits.ts"
  - "tests/limits.spec.ts"

T6.2:
  - "src/bot/ops/admin.ts"
  - "tests/ops.spec.ts"

# Glob prefixes to catch future tasks in the same family
"Phase 0*":
  - "/ops/**"
  - "/**/*.md"
```

# FILE: Patch.md

```diff
@@
 ## WORKING GOAL
 This project’s near-term goal is an **operable Pokémon Discord fan server bot** with:
 - DM-as-Home (heal, party/box, starter flow, profile)
 - Public `#wilds` channel encounter threads; controls from DM
 - Public Arena threads for battles; players command in DM; spectators see summaries
 - Persistent state in Postgres; reference data cached to repo by worker
 
 ---
 
+## CRITICAL FILES & FAST-PATH LOOKUP
+To minimize planning overhead, follow this **fast-path order** before the normal loop:
+1. **Read `ops/NEXT.yaml`** to get the `next_task_id` and `files_hint`. Validate against `Tasklist.md`.
+2. **Open `Tasklist.md`** to confirm status and dependencies. Only execute tasks that are `READY`.
+3. **Consult `ops/TOUCHMAP.yaml`** for the primary files/paths for the task you are executing.
+4. Execute the normal **OPERATING LOOP** using PATCH BLOCKS.
+
+**On completion of any task:**
+- Update `ops/NEXT.yaml` to the next READY task and keep `files_hint` minimal but sufficient.
+- Extend `ops/TOUCHMAP.yaml` if you touched relevant files not yet mapped.
+
+**Do not** bloat these files. Keep them deterministic and concise.
+
 ## PATCH CLIPBOARD (FOOTER)
@@
 ==============================================================
 PATCH CLIPBOARD — STAGING AREA (AI-Editable)
 Paste your next PATCHSET below.
 
 <<<PATCHSET START>>>
 # [Task ID]: <short task title>
@@
 <<<PATCHSET END>>>
 ==============================================================
```

# TASKLIST UPDATE

```diff
--- a/Tasklist.md
+++ b/Tasklist.md
@@
 ## Phase 0 — Repo & Tooling
+ 
+- id: T0.FP
+  title: Add Critical Files Fast-Path system
+  status: DONE
+  depends_on: []
+  acceptance_criteria:
+    - Create ops/CRITICAL.md documenting fast-path boot order and hot paths
+    - Create ops/NEXT.yaml with the next_task_id and files_hint
+    - Create ops/TOUCHMAP.yaml mapping task IDs to primary files
+    - Update Patch.md to reference and enforce the fast-path rules
+  notes: Outcome — Fast-path created and initialized (next_task_id: T0.2).
@@
 - id: T0.2
   title: Create repo structure and docs
-  status: READY
+  status: READY
   depends_on: [T0.1]
   acceptance_criteria:
     - Folders: /src/bot, /src/core/{battle,encounter}, /src/shared, /src/data_pipeline, /tests
     - Docs: RULESET.md, DATA-SCHEMA.md, OPERATIONS.md created with stubs
   notes: Empty index files are fine as placeholders.
```

<<<PATCHSET END>>>

```
```
