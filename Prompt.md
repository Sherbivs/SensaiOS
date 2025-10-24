````
<<<PATCHSET START>>>
# [T0.TIMESTAMPS]: Add timestamp & revision headers and “Last Repo Changes” policy

# FILE: Patch.md
```diff
@@
-# AI PROJECT MANAGER CONTRACT
+# AI PROJECT MANAGER CONTRACT
+Last Updated (UTC): {{TO_BE_SET_BY_AI}}
+Revision: {{PATCHMD_REV}}
@@
 ## MODIFICATION POLICY: Patch.md & Tasklist.md
@@
 ### Meta-Update Workflow (quick checklist)
 1. Create/choose a META task (or the current task if its acceptance criteria require contract changes).
 2. Edit `Patch.md`/`Tasklist.md` with minimal diffs; reflect any crossfile implications (`ops/NEXT.yaml`, `ops/CRITICAL.md`, `ops/TOUCHMAP.yaml`).
 3. Update `Tasklist.md` (status changes, new tasks).
 4. Commit with a message that states **why** the meta-change was necessary.
+
+### Timestamp & Revision Policy (MANDATORY)
+- **On every PATCHSET that edits `Patch.md` or `Tasklist.md`,** update the top-of-file line:
+  - `Last Updated (UTC): <ISO 8601>` (e.g., `2025-10-24T12:34:56Z`)
+  - `Revision: <semver or monotonically increasing number>`
+- **For `Prompt.md`,** always update both the header timestamp/revision **and** the “Last Repo Changes” section (see `Prompt.md` header block) summarizing file/directory changes performed by the current PATCHSET (paths + brief purpose).
````

# FILE: Tasklist.md

```diff
@@
-# Tasklist
+# Tasklist
+Last Updated (UTC): {{TO_BE_SET_BY_AI}}
+Revision: {{TASKLIST_REV}}
@@
 Status legend: `PROPOSED` → `READY` → `IN_PROGRESS` → `DONE` → `BLOCKED`
```

# FILE: Prompt.md

```diff
@@
-# Prompt.md
+# Prompt.md
+Timestamp (UTC): {{TO_BE_SET_BY_AI}}
+Revision: {{PROMPTMD_REV}}
+
+## Last Repo Changes (since previous Prompt.md revision)
+> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**  
+> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
+> - Files/dirs added/modified/removed (paths relative to repo root)
+> - Purpose of each change (one line)
+> - Any schema/contract impacts to consumers (brief)
+>
+> Example format:
+> - `ops/NEXT.yaml` — set `next_task_id` to `T0.2`; narrowed `files_hint`.
+> - `Patch.md` — added timestamp policy; updated fast-path.
+> - `Prompt.md` — bumped revision; appended Evidence Matrix line for infra.
@@
 ## Ground Truth Sources (authoritative inputs)
@@
 > If sources conflict, record the conflict in **Section 10: Risks, Gaps, Open Questions**, cite both sources in the Evidence Matrix, and propose a resolution.
+
+### Timestamp & Change Log Requirements
+- **Header fields (mandatory):** `Timestamp (UTC)` and `Revision`.
+- **Change log block (mandatory):** Update **Last Repo Changes** above with a concise bullet list of all changes performed by this PATCHSET. Keep it under ~12 bullets; link to paths.
@@
 ## Revision History
 | Date | Version | Changes | Author | Notes |
 | ---- | ------- | ------- | ------ | ----- |
```

# FILE: ops/CRITICAL.md

```diff
@@
 ## Update Rules
 - After *every* completed task: update `ops/NEXT.yaml` to the next `READY` task and narrow `files_hint`.
 - If a task touches new paths not listed, extend `ops/TOUCHMAP.yaml`.
 - If the task changed system behavior/architecture, update `Prompt.md` (Revision History + affected sections) and ensure `ops/KNOWLEDGE.yaml` still points to the right sources.
 - Keep these files **small and deterministic**. Re-run yields the same state.
 
 ### Contract & Task Graph Updates (Policy)
 - Contract edits (`Patch.md`) should be done under a dedicated **META** task using surgical diffs.
 - Task graph edits (`Tasklist.md`) happen in the **# TASKLIST UPDATE** section of a PATCHSET and must include:
   - Status transitions with a brief outcome note.
   - New subtasks (with acceptance criteria) or `BLOCKED` markers with a `FIX:` task.
   - Any newly unblocked tasks flipped to `READY`.
+ - **Timestamps/Revisions:** Update top-of-file timestamps and revisions in `Patch.md`, `Tasklist.md`, and `Prompt.md`. For `Prompt.md`, also update the “Last Repo Changes” block summarizing this PATCHSET.
```

# FILE: ops/TOUCHMAP.yaml

```diff
@@
 T0.PATCHPOLICY:
   - "Patch.md"
   - "Tasklist.md"
   - "ops/CRITICAL.md"
+
+T0.TIMESTAMPS:
+  - "Patch.md"
+  - "Tasklist.md"
+  - "Prompt.md"
+  - "ops/CRITICAL.md"
```

# TASKLIST UPDATE

```diff
--- a/Tasklist.md
+++ b/Tasklist.md
@@
 ## Phase 0 — Repo & Tooling
@@
 - id: T0.PATCHPOLICY
   title: Add explicit policy for updating Patch.md and Tasklist.md
   status: DONE
   depends_on: [T0.DOCPROMPT.V2]
   acceptance_criteria:
     - Patch.md includes a "Modification Policy" section covering when/how to edit Patch.md and Tasklist.md
     - ops/CRITICAL.md documents the contract & task graph update policy
     - ops/TOUCHMAP.yaml maps T0.PATCHPOLICY to Patch.md, Tasklist.md, and ops/CRITICAL.md
   notes: Outcome — Clear, enforceable instructions exist for meta updates; future AIs can evolve the contract and task graph safely.
+
+- id: T0.TIMESTAMPS
+  title: Add timestamp & revision headers and enforce “Last Repo Changes” block
+  status: DONE
+  depends_on: [T0.PATCHPOLICY]
+  acceptance_criteria:
+    - `Patch.md` and `Tasklist.md` contain top-of-file `Last Updated (UTC)` and `Revision` placeholders
+    - `Prompt.md` contains top-of-file `Timestamp (UTC)` and `Revision`, plus a mandatory **Last Repo Changes** section with instructions
+    - `ops/CRITICAL.md` references the timestamp/revision policy
+    - `ops/TOUCHMAP.yaml` maps T0.TIMESTAMPS to the edited files
+  notes: Outcome — Time/version metadata and change-log discipline enforced for core docs; AIs can track and narrate deltas deterministically.
```

<<<PATCHSET END>>>

```

**Commit Message**
```

[Task T0.TIMESTAMPS] Add timestamp/revision headers and “Last Repo Changes” discipline

Why:
AIs need deterministic temporal context and a concise delta summary to reason about repo state and iterate safely.

Changes:

* Patch.md/Tasklist.md: added top-of-file Last Updated (UTC) and Revision placeholders; documented timestamp policy.
* Prompt.md: added Timestamp/Revision header and mandatory “Last Repo Changes” block; noted policy in Ground Truth section.
* ops/CRITICAL.md: reinforced timestamp/change-log requirements.
* ops/TOUCHMAP.yaml: mapped new maintenance task.

Acceptance:
Headers present; policies documented; touch map and task list updated with T0.TIMESTAMPS = DONE.

```
```
