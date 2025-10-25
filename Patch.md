# AI PROJECT MANAGER CONTRACT
Last Updated (UTC): 2025-10-25T01:50:00Z
Revision: 1.2

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
<<<PATCHSET START>>>
# [T0.META.ENFORCE]: Enforce Prompt/Tasklist/Patch updates on every PATCHSET (with CI guard)

# FILE: Patch.md
```diff
@@
-Last Updated (UTC): 2025-10-25T01:40:00Z
-Revision: 1.1
+Last Updated (UTC): 2025-10-25T01:50:00Z
+Revision: 1.2
@@
 ## OPERATING LOOP
@@
 4) **Commit**
    - Generate a commit message using the template below.
    - Prefer multiple small commits over one giant diff.
 
 5) **Repeat**
    - Return to step 1 until no `READY` tasks remain.
+
+---
+
+## META UPDATE REQUIREMENT (MANDATORY)
+- **Every PATCHSET must, at minimum, update `Prompt.md`** (Timestamp + Revision + “Last Repo Changes”).  
+- **If `Tasklist.md` or `Patch.md` are edited, both must have their header timestamps/revisions bumped** in the same PATCHSET.
+- **If unsure what to change:** update **Prompt.md** with a brief note under “Last Repo Changes” and bump its header; then stop or add a tiny precursor task.
````

# FILE: ops/CRITICAL.md

```diff
@@
  - **Timestamps/Revisions:** Update top-of-file timestamps and revisions in `Patch.md`, `Tasklist.md`, and `Prompt.md`. For `Prompt.md`, also update the “Last Repo Changes” block summarizing this PATCHSET.
+ - **META Update Requirement:** On *every* PATCHSET, `Prompt.md` must be updated (timestamp, revision, change bullets). If either `Patch.md` or `Tasklist.md` is edited, **both** must have header bumps in the same commit.
```

# FILE: .github/workflows/guard-meta.yml

```full
name: Guard meta updates (Prompt/Tasklist/Patch)

on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]

jobs:
  guard:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout (need prior commit)
        uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - name: Run meta guard
        run: bash scripts/guard_meta.sh
```

# FILE: scripts/guard_meta.sh

```full
#!/usr/bin/env bash
set -euo pipefail

echo "🔎 Guarding meta update policy…"

# Get changed files against previous commit
BASE="$(git rev-parse HEAD~1 2>/dev/null || echo '')"
if [[ -z "$BASE" ]]; then
  echo "First commit or shallow history; skipping guard."
  exit 0
fi

CHANGED=$(git diff --name-only "$BASE"...HEAD | tr -d '\r')
echo "Changed files:"
echo "$CHANGED" | sed 's/^/ - /'

# Normalize match helpers
has_changed() { echo "$CHANGED" | grep -qE "^$1$"; }
any_changed()  { echo "$CHANGED" | grep -qE "$1"; }

# Which files changed?
PROMPT_CHANGED=false
PATCH_CHANGED=false
TASKLIST_CHANGED=false

has_changed "Prompt.md" && PROMPT_CHANGED=true
has_changed "Patch.md" && PATCH_CHANGED=true
has_changed "Tasklist.md" && TASKLIST_CHANGED=true

# Non-doc changes? (anything outside markdown at root/ops or these three)
NON_DOC_CHANGED=false
if echo "$CHANGED" | grep -vqE '^(Prompt\.md|Patch\.md|Tasklist\.md|ops/[^/]+\.md)$'; then
  NON_DOC_CHANGED=true
fi

fail() { echo "❌ $*"; exit 1; }

# Rule 1: If non-doc files changed, Prompt.md must be in the commit.
if $NON_DOC_CHANGED && ! $PROMPT_CHANGED; then
  fail "Non-doc files changed but Prompt.md was not updated (Timestamp/Revision + Last Repo Changes required)."
fi

# Rule 2: If Patch.md changed, Tasklist.md must change too (and vice versa).
if $PATCH_CHANGED && ! $TASKLIST_CHANGED; then
  fail "Patch.md changed but Tasklist.md did not. Both must be updated together (headers bumped)."
fi
if $TASKLIST_CHANGED && ! $PATCH_CHANGED; then
  fail "Tasklist.md changed but Patch.md did not. Both must be updated together (headers bumped)."
fi

# Rule 3: If a meta file changed, its header lines must be modified in the diff.
check_header_bumped () {
  local file="$1"
  if git diff "$BASE"...HEAD -- "$file" | grep -qE '^\+.*(Timestamp \(UTC\)|Last Updated \(UTC\)|Revision:)'; then
    return 0
  else
    fail "$file changed but header Timestamp/Revision not updated."
  fi
}

$PROMPT_CHANGED && check_header_bumped "Prompt.md"
$PATCH_CHANGED && check_header_bumped "Patch.md"
$TASKLIST_CHANGED && check_header_bumped "Tasklist.md"

echo "✅ Meta update policy satisfied."
```

# FILE: Prompt.md

```diff
@@
-Timestamp (UTC): 2025-10-25T01:45:00Z
-Revision: 0.11
+Timestamp (UTC): 2025-10-25T01:50:00Z
+Revision: 0.12
@@
 > - `.github/workflows/guard-docs.yml` — CI job that fails if canonical doc filenames are renamed or lowercased.
 > - `scripts/guard_doc_names.sh` — script used by CI to enforce exact-case names.
 > - `Patch.md` / `ops/CRITICAL.md` — documented “Canonical Filenames (DO NOT RENAME)” policy.
 > - `ops/PATCH_POLICY_BACKUP.md` — added canonical backup sentinel for CI guard.
+> - `.github/workflows/guard-meta.yml` / `scripts/guard_meta.sh` — enforce that Prompt.md is updated on every real change, and Patch/Tasklist are updated together with header bumps.
```

# FILE: Tasklist.md

```diff
@@
-Last Updated (UTC): 2025-10-25T01:45:00Z
-Revision: 1.2
+Last Updated (UTC): 2025-10-25T01:50:00Z
+Revision: 1.3
@@
 ## Phase 0 — Repo & Tooling
@@
+- id: T0.META.ENFORCE
+  title: Enforce Prompt/Tasklist/Patch updates on every PATCHSET
+  status: DONE
+  depends_on: [T0.GUARD_FILENAMES]
+  acceptance_criteria:
+    - Patch.md documents mandatory Prompt.md update and coupled Patch/Tasklist header bumps
+    - CI guard fails when non-doc changes omit Prompt.md or when Patch/Tasklist are edited alone
+    - CI guard verifies header lines were bumped
+  notes: Outcome — The “update meta or fail” rule is encoded in docs and enforced in CI.
```

# FILE: ops/NEXT.yaml

```diff
@@
-timestamp_utc: 2025-10-25T01:40:00Z
-note: "Filename guards added (policy + CI). Proceed with T2.2 (pipeline output with manifest)."
+timestamp_utc: 2025-10-25T01:50:00Z
+note: "Meta update guard added (policy + CI). Proceed with T2.2 (pipeline output with manifest)."
```

<<<PATCHSET END>>>

```

**Commit Message**
```

[Task T0.META.ENFORCE] Require Prompt/Tasklist/Patch updates per PATCHSET and enforce via CI

Why:
We want zero ambiguity: every meaningful change must at least bump Prompt.md, and Patch/Tasklist must be updated together with header bumps.

Changes:

* Patch.md / ops/CRITICAL.md: documented the mandatory meta-update rule.
* CI: added guard-meta.yml + scripts/guard_meta.sh to fail when rule is violated; checks header bumps too.
* Stamped Prompt.md/Tasklist.md; updated NEXT note.

Acceptance:
CI blocks merges/pushes that skip Prompt.md on real changes or split Patch/Tasklist updates; headers must change each time.

```

Once merged, the worker AI will always keep Prompt/Tasklist/Patch in sync—and if it wobbles, CI will bonk it on the nose.
```
