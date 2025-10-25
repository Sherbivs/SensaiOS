# AI PROJECT MANAGER CONTRACT
Last Updated (UTC): 2025-10-25T04:05:00Z
Revision: 1.9

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

### History Discipline (MANDATORY)
- Maintain a “Recent Change Ledger (last 200)” section in `Prompt.md` between `<!-- LEDGER:BEGIN -->` and `<!-- LEDGER:END -->`.
- Regenerate using `npm run docs:update-ledger` (scripted) to include changed files and approximate line ranges.
- CI verifies the ledger includes the HEAD commit; keep the ledger machine-generated and unedited.

### Embedded PATCHSET Echo (MANDATORY)
- After every applied PATCHSET, update `Prompt.md` section “Embedded PATCHSET Echo (for quick audit)” between markers:
  - `<!-- PATCHSET:ECHO BEGIN -->` … `<!-- PATCHSET:ECHO END -->`
- The echo must contain either:
  1) The exact PATCHSET and Commit Message just applied (verbatim), including the HEAD short SHA, or
  2) A one-line justification starting with `NO-ECHO-REASON:` explaining why the echo is omitted (e.g., secrets, large binaries), followed by a brief summary.
- If the echo cannot be produced, stop and add a PROPOSED meta task to fix echo generation.

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
Got it. To harden what you’ve got, here’s a tiny follow-up PATCHSET that (a) enforces the **Embedded PATCHSET Echo** has real PATCHSET markers, the commit message, and the HEAD short SHA, and (b) caps the echo size so it can’t blow up Prompt.md. It bumps timestamps/revisions and wires a CI check.

Paste this straight into your Patch.md clipboard and run it.

````
<<<PATCHSET START>>>
# [META.PATCHSET_ECHO.GUARD] Enforce PATCHSET Echo markers + HEAD SHA + size cap; wire CI

# FILE: scripts/validate_patchset_echo.sh
```full
#!/usr/bin/env bash
set -euo pipefail

FILE="Prompt.md"
BEGIN="<!-- PATCHSET:ECHO BEGIN -->"
END="<!-- PATCHSET:ECHO END -->"
MAX_BYTES=$((350 * 1024)) # ~350KB cap for echo block

# Extract echo block
content=$(awk "/$BEGIN/{flag=1;next}/$END/{flag=0}flag" "$FILE")

if [[ -z "$content" ]]; then
  echo "::error::PATCHSET Echo block is empty."
  exit 1
fi

# Must contain PATCHSET and Commit Message markers OR a NO-ECHO-REASON
if ! echo "$content" | grep -q '<<<PATCHSET START>>>' ; then
  if ! echo "$content" | grep -q '^NO-ECHO-REASON:' ; then
    echo "::error::PATCHSET Echo must include a PATCHSET or a NO-ECHO-REASON line."
    exit 1
  fi
fi

# If it has a PATCHSET, require a Commit Message section too
if echo "$content" | grep -q '<<<PATCHSET START>>>' ; then
  if ! echo "$content" | grep -q '^\*\*Commit Message\*\*' ; then
    echo "::error::PATCHSET Echo includes a PATCHSET but no Commit Message block."
    exit 1
  fi
fi

# Require HEAD short SHA presence unless NO-ECHO-REASON is given
head_sha=$(git rev-parse --short HEAD)
if ! echo "$content" | grep -q "$head_sha" ; then
  if ! echo "$content" | grep -q '^NO-ECHO-REASON:' ; then
    echo "::error::PATCHSET Echo missing HEAD short SHA (${head_sha}) and no NO-ECHO-REASON provided."
    exit 1
  fi
fi

# Size cap
bytes=$(printf "%s" "$content" | wc -c | tr -d ' ')
if (( bytes > MAX_BYTES )); then
  echo "::error::PATCHSET Echo exceeds ${MAX_BYTES} bytes (${bytes}). Summarize or use NO-ECHO-REASON."
  exit 1
fi

echo "✅ PATCHSET Echo looks sane (markers, HEAD SHA/NO-ECHO-REASON, size=${bytes}B)."
````

# FILE: .github/workflows/guard-meta.yml

```diff
@@
       - name: Ensure Embedded PATCHSET Echo present for HEAD or justified
-        run: |
-          head_sha="$(git rev-parse --short HEAD)"
-          # Extract the ECHO block
-          awk '/<!-- PATCHSET:ECHO BEGIN -->/{flag=1;next}/<!-- PATCHSET:ECHO END -->/{flag=0}flag' Prompt.md > /tmp/echo.txt
-          if ! grep -q "$head_sha" /tmp/echo.txt; then
-            if ! grep -q '^NO-ECHO-REASON:' /tmp/echo.txt; then
-              echo "::error::Embedded PATCHSET Echo missing HEAD ${head_sha} and no NO-ECHO-REASON provided."
-              echo "Update Prompt.md echo block between markers or add a NO-ECHO-REASON line."
-              exit 1
-            fi
-          fi
+        run: bash scripts/validate_patchset_echo.sh
```

# FILE: package.json

```diff
@@
   "scripts": {
@@
-    "docs:update-ledger": "bash scripts/update_change_ledger.sh",
+    "docs:update-ledger": "bash scripts/update_change_ledger.sh",
+    "docs:validate-echo": "bash scripts/validate_patchset_echo.sh",
@@
   }
```

# FILE: Patch.md

```diff
@@
-Last Updated (UTC): 2025-10-25T04:20:00Z
-Revision: 2.0
+Last Updated (UTC): 2025-10-25T04:25:00Z
+Revision: 2.1
@@
 ### Embedded PATCHSET Echo (MANDATORY)
@@
 - If the echo cannot be produced, STOP and add a `PROPOSED` meta task to fix echo generation. Do **not** proceed with unrelated work.
+ - **CI & Size:** `scripts/validate_patchset_echo.sh` enforces markers, HEAD short SHA or `NO-ECHO-REASON`, Commit Message presence (when PATCHSET present), and a ~350KB size cap to keep Prompt.md manageable.
```

# FILE: ops/TOUCHMAP.yaml

```diff
@@
 META.PATCHSET_ECHO:
   - "Prompt.md"
   - ".github/workflows/guard-meta.yml"
   - "scripts/guard_meta.sh"
+  - "scripts/validate_patchset_echo.sh"
+  - "package.json"
```

# FILE: Tasklist.md

```diff
@@
-Last Updated (UTC): 2025-10-25T04:05:00Z
-Revision: 1.14
+Last Updated (UTC): 2025-10-25T04:25:00Z
+Revision: 1.15
@@
+- id: META.PATCHSET_ECHO.GUARD
+  title: Add validator script and CI wiring for PATCHSET Echo markers/SHA/size
+  status: DONE
+  depends_on: [META.PATCHSET_ECHO]
+  acceptance_criteria:
+    - CI runs `scripts/validate_patchset_echo.sh` and fails on missing markers, HEAD SHA (unless NO-ECHO-REASON), missing Commit Message (when a PATCHSET is echoed), or oversize block
+    - `npm run docs:validate-echo` works locally
+  notes: Outcome — Echo stays accurate, auditable, and bounded.
```

# FILE: ops/NEXT.yaml

```diff
@@
-timestamp_utc: 2025-10-25T04:05:00Z
-note: "T3.3 DONE — Starter pick + Heal. Next: T4.1 encounter walk flow."
+timestamp_utc: 2025-10-25T04:25:00Z
+note: "PATCHSET Echo validator added. Proceed with T4.1 encounter walk flow."
```

<<<PATCHSET END>>>

```

**Commit Message**
```

[META.PATCHSET_ECHO.GUARD] Validate PATCHSET Echo (markers, HEAD SHA / NO-ECHO-REASON, Commit Message, size cap)

Why:
We want Prompt.md’s Embedded PATCHSET Echo to be consistently usable and not balloon in size.

Changes:

* scripts/validate_patchset_echo.sh: checks markers, HEAD short SHA or NO-ECHO-REASON, Commit Message presence when PATCHSET echoed, and a ~350KB size cap.
* CI: guard-meta now calls the validator.
* package.json: added docs:validate-echo script.
* Patch/Tasklist/NEXT: stamps and notes.

Acceptance:
CI fails if the echo is missing, stale, malformed, or too large; local `npm run docs:validate-echo` passes on a healthy Prompt.md.

```

Once this is in, your AI workers have a crystal-clear, enforced ritual: every patch updates the Echo, or they must write a `NO-ECHO-REASON:`.
```
