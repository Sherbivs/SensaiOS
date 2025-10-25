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
<<<PATCHSET START>>>
# [T0.PROMPT.KEY]: Add `prompt` trigger key for workers and enforce via CI

# FILE: ops/NEXT.yaml
```diff
@@
-timestamp_utc: 2025-10-25T02:20:00Z
-note: "Prompt cleaned (removed historical blob). Proceed with T2.2."
+timestamp_utc: 2025-10-25T02:24:00Z
+note: "Added NEXT.yaml prompt key for worker boot; proceed with T2.2."
+prompt: |
+  ROLE: Repo Worker AI for Infinity-Gauntlet (Discord Pokémon buddy system).
+  FOLLOW: Patch.md contract exactly. Use the AI Worker Prompt in Prompt.md for details.
+  READ ORDER: ops/NEXT.yaml → Tasklist.md → ops/TOUCHMAP.yaml → Prompt.md.
+  LOOP: Execute the first READY task with deps DONE → emit ONE PATCHSET (contract format) → update Tasklist.md statuses/subtasks → bump timestamps/revisions (Prompt.md always; Patch/Tasklist together when either changes) → Commit Message → repeat.
+  OUTPUT: Only the PATCHSET block and then the Commit Message block (no extra prose).
+  SAFETY: Do not rename Patch.md, Tasklist.md, Prompt.md, ops/PATCH_POLICY_BACKUP.md; keep diffs minimal and reversible; no secrets; constrain to files_hint.
````

# FILE: Patch.md

```diff
@@
-Last Updated (UTC): 2025-10-25T02:20:00Z
-Revision: 1.5
+Last Updated (UTC): 2025-10-25T02:24:00Z
+Revision: 1.6
@@
 ### Worker Prompt Requirement
 - `Prompt.md` MUST contain the section titled exactly **“AI Worker Prompt (copy/paste for Copilot/GPT)”**.
 - When material workflows change (NEXT/TOUCHMAP/policies), refresh that section accordingly
+
+### Trigger Prompt Key (NEXT.yaml)
+- `ops/NEXT.yaml` MUST include a top-level **`prompt:`** key with a concise, copy/pasteable instruction block telling workers to follow the Patch.md contract and the AI Worker Prompt in Prompt.md.
+- The `prompt:` content can be reused verbatim in chat inputs; workers must treat it as authoritative boot instructions and start the OPERATING LOOP immediately.
```

# FILE: ops/CRITICAL.md

```diff
@@
  - **META Update Requirement:** On *every* PATCHSET, `Prompt.md` must be updated (timestamp, revision, change bullets). If either `Patch.md` or `Tasklist.md` is edited, **both** must have header bumps in the same commit.
+ - **NEXT Prompt Key:** `ops/NEXT.yaml` must always include a top-level `prompt:` block to enable quick worker boot from repo state or pasted text.
```

# FILE: ops/TOUCHMAP.yaml

```diff
@@
 T0.GUARD_FILENAMES:
   - "Patch.md"
   - ".github/workflows/guard-docs.yml"
   - "scripts/guard_doc_names.sh"
   - "ops/CRITICAL.md"
+
+T0.PROMPT.KEY:
+  - "ops/NEXT.yaml"
+  - "Patch.md"
+  - "ops/CRITICAL.md"
```

# FILE: scripts/guard_meta.sh

```diff
@@
 echo "✅ Meta update policy satisfied."
+
+# Additional invariant: NEXT.yaml must carry a top-level 'prompt:' key for worker boot.
+if ! grep -qE '^prompt:\s*\|' ops/NEXT.yaml; then
+  echo "❌ ops/NEXT.yaml is missing required 'prompt:' key (multiline block)."
+  exit 1
+fi
+echo "✅ NEXT prompt key present."
```

# FILE: Prompt.md

```diff
@@
-Timestamp (UTC): 2025-10-25T02:20:00Z
-Revision: 0.17
+Timestamp (UTC): 2025-10-25T02:24:00Z
+Revision: 0.18
@@
 > - `.github/workflows/guard-meta.yml` / `scripts/guard_meta.sh` — added checks for Worker Prompt presence and deeper evidence/revision requirements when code changes.
 > - `Prompt.md` — added “AI Worker Prompt (copy/paste for Copilot/GPT)” section for fast bootstrapping.
+> - `ops/NEXT.yaml` — added top-level `prompt:` key so workers can start immediately from repo state or pasted text.
```

# FILE: Tasklist.md

```diff
@@
-Last Updated (UTC): 2025-10-25T02:20:00Z
-Revision: 1.7
+Last Updated (UTC): 2025-10-25T02:24:00Z
+Revision: 1.8
@@
 ## Phase 0 — Repo & Tooling
@@
+- id: T0.PROMPT.KEY
+  title: Add NEXT.yaml prompt trigger and enforce via CI
+  status: DONE
+  depends_on: [T0.META.ENFORCE, T0.META.HARDEN]
+  acceptance_criteria:
+    - ops/NEXT.yaml contains a top-level `prompt:` block with concise worker instructions
+    - Patch.md and CRITICAL.md document the requirement
+    - CI fails if `prompt:` is missing in ops/NEXT.yaml
+  notes: Outcome — Copy/pasteable trigger exists; workers always obey the Patch contract.
```

<<<PATCHSET END>>>

```

**Commit Message**
```

[Task T0.PROMPT.KEY] Add NEXT.yaml `prompt` trigger and enforce it; document in Patch/CRITICAL; stamp Prompt/Tasklist

Why:
You want a copy/pasteable key that forces workers to follow the Patch contract every time—no ambiguity.

Changes:

* ops/NEXT.yaml: added top-level `prompt:` block with concise boot instructions.
* Patch.md / ops/CRITICAL.md: documented trigger prompt requirement.
* guard_meta.sh: now asserts NEXT has a `prompt:` block.
* Prompt.md / Tasklist.md: stamped and logged; TOUCHMAP updated.

Acceptance:
Repo contains a canonical, enforced worker trigger (`prompt:`) that AIs can paste or read to start executing the Patch loop immediately.

```

After applying this, you can paste the **`prompt:`** block anywhere (or just point workers at `ops/NEXT.yaml`) and they’ll snap to the contract: read order, operating loop, output format, and guardrails—no guessing.
```
