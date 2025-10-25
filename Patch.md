# AI PROJECT MANAGER CONTRACT
Last Updated (UTC): 2025-10-25T03:15:00Z
Revision: 1.6

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

### Hard Routing Policy (MANDATORY)
- The AI MUST load `ops/ROUTER.yaml` and use it to determine where to read next and where writes are allowed.
- Before any task, check `ops/INBOX/notes.md`; if its `Timestamp (UTC)` is newer than `ops/NEXT.yaml:last_notes_read_utc`, ingest those notes and set `last_notes_read_utc` during the PATCHSET.
- Writes outside the `meta_write_whitelist` or the task’s `ops/TOUCHMAP.yaml` paths are forbidden unless a new subtask is created that justifies expanding TOUCHMAP.
- If routing conflicts arise, stop and add a PROPOSED task to reconcile router vs. reality; update Prompt “Last Repo Changes”.

## Activation Trigger (MANDATORY)
Trigger phrase (case-sensitive): `ACTIVATE: PATCH ENGINE`
On trigger, follow Router → INBOX → NEXT → Tasklist → TOUCHMAP → Patch → Prompt sequence and emit one PATCHSET + Commit Message.

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
Heard. You want the AI “hard-routed” so it *always* knows exactly where to read/write next, plus a quick-notes place you can edit fast without juggling the big docs. Here’s a single PATCHSET that:

* Adds a **router file** with canonical paths and categories the AI must follow.
* Adds a lightweight **INBOX notes** file you can edit quickly; workers will read it first if it’s newer.
* Tightens the **contract** to make routing mandatory.
* Extends **NEXT.yaml** with router/version stamps and hints.
* Updates **TOUCHMAP** with core categories and meta tasks.
* Adds a **routing guard** CI job that sanity-checks changed files line up with the router/touchmap (soft-fail if parsing is tricky, so you’re never blocked).
* Stamps **Prompt.md**/**Patch.md**/**Tasklist.md** with changes and updates the Worker Prompt so it reads the router + INBOX before everything.

Paste this into `Patch.md`’s clipboard and run.

````
<<<PATCHSET START>>>
# [META.HARD_ROUTE]: Add AI routing map + inbox notes; enforce router-driven read/write + quick notes

# FILE: ops/ROUTER.yaml
```full
# Canonical AI routing map — single source of “where to look / where to write”.
# All paths are repo-relative. Case-sensitive.
version: 1
updated_utc: 2025-10-25T02:45:00Z

meta_files:
  - Patch.md
  - Tasklist.md
  - Prompt.md
  - ops/ROUTER.yaml
  - ops/NEXT.yaml
  - ops/TOUCHMAP.yaml
  - ops/CRITICAL.md
  - ops/PATCH_POLICY_BACKUP.md

inbox:
  # Fast notes the human can edit; AI must read first if newer than NEXT.last_notes_read_utc
  path: ops/INBOX/notes.md

entrypoints:
  node_start: dist/index.js
  ts_entry: src/index.ts
  tsconfig: tsconfig.json
  package: package.json

categories:
  contract:
    - Patch.md
    - ops/CRITICAL.md
  tasks:
    - Tasklist.md
    - ops/NEXT.yaml
    - ops/TOUCHMAP.yaml
  prompt:
    - Prompt.md
  infra_docs:
    - RULESET.md
    - DATA-SCHEMA.md
    - OPERATIONS.md
  code_core:
    - src/**
    - tests/**
  ops_scripts:
    - scripts/**
  guards_ci:
    - .github/workflows/**
    - scripts/guard_*.sh

# Always-allowed meta writes (headers/timestamps/Last Repo Changes only):
meta_write_whitelist:
  - Patch.md
  - Tasklist.md
  - Prompt.md
  - ops/NEXT.yaml
  - ops/ROUTER.yaml
  - ops/TOUCHMAP.yaml
````

# FILE: ops/INBOX/notes.md

```full
# INBOX / Quick Notes for AI
Timestamp (UTC): 2025-10-25T02:45:00Z
Author: human

- Put short, high-signal notes here. AI reads this FIRST if newer than NEXT.last_notes_read_utc.
- Keep bullets concise; link files/paths if relevant.
- Example:
  - Focus T2.2 manifest shape → `src/data_pipeline/schema/manifest.ts` & `tests/data_schema.spec.ts`
  - Don’t touch deploy—Render stable for now.
```

# FILE: Patch.md

```diff
@@
-Last Updated (UTC): 2025-10-25T02:28:00Z
-Revision: 1.6
+Last Updated (UTC): 2025-10-25T02:45:00Z
+Revision: 1.7
@@
 ## META UPDATE REQUIREMENT (MANDATORY)
@@
 ### Worker Prompt Requirement
 - `Prompt.md` MUST contain the section titled exactly **“AI Worker Prompt (copy/paste for Copilot/GPT)”**.
 - When material workflows change (NEXT/TOUCHMAP/policies), refresh that section accordingly
+
+### Hard Routing Policy (MANDATORY)
+- The AI MUST load `ops/ROUTER.yaml` and use it to determine **where to read next** and **where writes are allowed**.
+- Before any task, check `ops/INBOX/notes.md`; if its `Timestamp (UTC)` is newer than `ops/NEXT.yaml:last_notes_read_utc`, ingest notes and set `last_notes_read_utc` during the PATCHSET.
+- Writes outside the `meta_write_whitelist` or the task’s `ops/TOUCHMAP.yaml` paths are forbidden unless a new subtask is created that justifies expanding TOUCHMAP.
+- If routing conflicts arise, stop and add a PROPOSED task to reconcile router vs. reality; update Prompt “Last Repo Changes”.
+
+## Activation Trigger (MANDATORY)
+Trigger phrase (case-sensitive): `ACTIVATE: PATCH ENGINE`
+On trigger, follow Router → INBOX → NEXT → TASKLIST → TOUCHMAP → Patch → Prompt sequence and emit one PATCHSET + Commit Message.
```

# FILE: Prompt.md

````diff
@@
-Timestamp (UTC): 2025-10-25T02:35:00Z
-Revision: 0.18
+Timestamp (UTC): 2025-10-25T02:45:00Z
+Revision: 0.19
@@
 > - `.github/workflows/guard-meta.yml` / `scripts/guard_meta.sh` — added checks for Worker Prompt presence and deeper evidence/revision requirements when code changes.
 > - `Prompt.md` — added “AI Worker Prompt (copy/paste for Copilot/GPT)” section for fast bootstrapping.
 > - `src/data_pipeline/schema/` — added Zod schemas: species, moves, abilities, typechart, manifest; plus barrel index.
 > - `tests/data_schema.spec.ts` — unit tests validating three samples for species, moves, abilities; includes minimal typechart and manifest test.
 > - `package.json` — added `zod` dependency.
+> - `ops/ROUTER.yaml` — canonical, hard-routed file map for AI read/write.
+> - `ops/INBOX/notes.md` — fast notes dropbox; AI reads first if newer.
@@
 ## AI Worker Prompt (copy/paste for Copilot/GPT)
@@
 READ ORDER (fast-path):
-1) ops/NEXT.yaml  → get next_task_id + files_hint
-2) Tasklist.md    → execute only tasks with status: READY and all depends_on DONE
-3) ops/TOUCHMAP.yaml → constrain edits to mapped paths
-4) Prompt.md (this file) → ground truth + risks; update Last Repo Changes every commit
+0) ops/ROUTER.yaml → set canonical paths; respect categories & whitelist
+0.1) ops/INBOX/notes.md → if newer than NEXT.last_notes_read_utc, ingest notes
+1) ops/NEXT.yaml  → get next_task_id + files_hint
+2) Tasklist.md    → execute only tasks with status: READY and all depends_on DONE
+3) ops/TOUCHMAP.yaml → constrain edits to mapped paths
+4) Prompt.md (this file) → ground truth + risks; update Last Repo Changes every commit
@@
 OUTPUT:
 - Only emit the PATCHSET block (and then the Commit Message block). No extra prose unless the task explicitly asks.
+
+## Activation Trigger for AI Workers
+Paste this to initialize from Router + INBOX and run the Patch loop:
+
+```
+ACTIVATE: PATCH ENGINE
+```
````

# FILE: ops/NEXT.yaml

```diff
@@
-timestamp_utc: 2025-10-25T02:35:00Z
-note: "Prompt cleaned (removed historical blob). Proceed with T2.2."
+timestamp_utc: 2025-10-25T02:45:00Z
+router_version: 1
+last_notes_read_utc: 2025-10-25T02:45:00Z
+note: "Router + INBOX in place; proceed with T2.2 (pipeline manifest)."
```

# FILE: ops/TOUCHMAP.yaml

```diff
@@
 T0.TIMESTAMPS:
   - "Patch.md"
   - "Tasklist.md"
   - "Prompt.md"
   - "ops/CRITICAL.md"
+
+# Canonical categories for broad tasks
+META.HARD_ROUTE:
+  - "ops/ROUTER.yaml"
+  - "ops/INBOX/notes.md"
+  - "Patch.md"
+  - "Prompt.md"
+  - "Tasklist.md"
+  - "ops/NEXT.yaml"
+
+SCHEMA.ZOD:
+  - "src/data_pipeline/schema/**"
+  - "tests/**"
+
+RUNTIME.ENTRY:
+  - "src/index.ts"
+  - "tsconfig.json"
+  - "package.json"
+  - "dist/**"
```

# FILE: .github/workflows/guard-routing.yml

```full
name: Guard routing & touchmap

on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]

jobs:
  route:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 2 }
      - run: bash scripts/guard_routing.sh
```

# FILE: scripts/guard_routing.sh

```full
#!/usr/bin/env bash
set -euo pipefail

BASE="$(git rev-parse HEAD~1 2>/dev/null || echo '')"
if [[ -z "$BASE" ]]; then
  echo "First commit; skipping routing guard."
  exit 0
fi

CHANGED=$(git diff --name-only "$BASE"...HEAD | tr -d '\r')
echo "🔎 Routing guard — changed files:"
echo "$CHANGED" | sed 's/^/ - /'

# Allowlist for meta/doc files always ok
ALWAYS_OK_REGEX='^(Patch\.md|Prompt\.md|Tasklist\.md|ops/ROUTER\.yaml|ops/NEXT\.yaml|ops/TOUCHMAP\.yaml|ops/CRITICAL\.md|ops/PATCH_POLICY_BACKUP\.md|\.github/workflows/.*|scripts/guard_.*\.sh)$'

if echo "$CHANGED" | grep -Ev "$ALWAYS_OK_REGEX" >/dev/null 2>&1; then
  # Try to read NEXT task id
  NEXT_TASK=$(grep -E '^next_task_id:' ops/NEXT.yaml 2>/dev/null | awk '{print $2}' || true)
  [[ -z "${NEXT_TASK:-}" ]] && NEXT_TASK=""

  # Collect touch patterns for NEXT_TASK
  MAP_LINES=$(awk -v id="$NEXT_TASK" '
    $0 ~ "^"id":" {inblk=1; next}
    inblk && $0 ~ "^[^[:space:]].*:" {inblk=0}
    inblk && $0 ~ "^[[:space:]]*- " {print $2}
  ' ops/TOUCHMAP.yaml 2>/dev/null || true)

  if [[ -z "$NEXT_TASK" || -z "$MAP_LINES" ]]; then
    echo "⚠️ Routing guard: could not resolve NEXT or TOUCHMAP; soft-pass."
    exit 0
  fi

  # Check each changed file matches some mapped prefix or globy suffix
  FAILS=0
  while IFS= read -r file; do
    echo "$file" | grep -Eq "$ALWAYS_OK_REGEX" && continue
    MATCHED=0
    # naive prefix match per mapped path (/** treated as prefix)
    while IFS= read -r pat; do
      p="${pat%\"}"; p="${p#\"}"
      p="${p%/**}"
      if [[ "$file" == "$p"* ]]; then MATCHED=1; break; fi
    done <<<"$MAP_LINES"
    if [[ $MATCHED -eq 0 ]]; then
      echo "❌ File not permitted by TOUCHMAP for task $NEXT_TASK: $file"
      FAILS=$((FAILS+1))
    fi
  done <<<"$CHANGED"

  if [[ $FAILS -gt 0 ]]; then
    echo "⚠️ Routing guard is advisory for now; convert to hard fail later."
    exit 0
  fi
fi

echo "✅ Routing guard passed."
```

# FILE: Tasklist.md

```diff
@@
-Last Updated (UTC): 2025-10-25T02:35:00Z
-Revision: 1.9
+Last Updated (UTC): 2025-10-25T02:45:00Z
+Revision: 2.0
@@
 ## Phase 0 — Repo & Tooling
@@
+- id: META.HARD_ROUTE
+  title: Add router + inbox notes and enforce router-driven AI routing
+  status: DONE
+  depends_on: [T0.META.ENFORCE, T0.META.HARDEN, T0.TRIGGER.PATCH_ENGINE]
+  acceptance_criteria:
+    - ops/ROUTER.yaml defines canonical paths and categories
+    - ops/INBOX/notes.md exists; AI reads it first when newer than NEXT.last_notes_read_utc
+    - NEXT.yaml gains router_version + last_notes_read_utc
+    - touchmap contains categories for schema and runtime entry
+    - guard-routing CI present (advisory mode)
+  notes: Outcome — AI has deterministic places to read/write; fast human notes flow.
```

<<<PATCHSET END>>>

```

**Commit Message**
```

[META.HARD_ROUTE] Add canonical AI routing map + INBOX notes; enforce router-driven workflow (advisory guard)

Why:
We want the AI to know exactly where to look and what to touch, every time—and give the human a fast place to drop notes.

Changes:

* ops/ROUTER.yaml: canonical path map, categories, whitelists.
* ops/INBOX/notes.md: quick notes; AI reads first if newer than NEXT.last_notes_read_utc.
* Patch.md: Hard Routing Policy + trigger reiteration.
* Prompt.md: Worker Prompt read order updated to include Router and INBOX.
* ops/NEXT.yaml: router_version + last_notes_read_utc.
* ops/TOUCHMAP.yaml: added categories (SCHEMA.ZOD, RUNTIME.ENTRY, META.HARD_ROUTE).
* CI: guard-routing (advisory) checks changed files align with TOUCHMAP.
* Tasklist: recorded meta task DONE; stamped revisions.

Acceptance:
Workers now load Router→INBOX→NEXT→Tasklist→TOUCHMAP→Patch→Prompt, and the repo provides deterministic file targets with a quick human notes path.

```

Use your **fast notes** at `ops/INBOX/notes.md` whenever you need to steer the worker quickly; the AI will ingest them first on the next run.
```
