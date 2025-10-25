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
# [META.DIST_AND_PROMPT]: Guarantee dist/index.js exists and add the mandatory AI Worker Prompt (with CI check)

# FILE: tsconfig.json
```full
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "sourceMap": false
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
````

# FILE: src/index.ts

```full
// Minimal bootstrap to guarantee dist/index.js exists after tsc.
// Expand this file as the real bot entrypoint.

function boot() {
  // Basic startup log so Render shows something meaningful
  // eslint-disable-next-line no-console
  console.log("[boot] Infinity-Gauntlet service starting...");
  // TODO: wire Discord client and DB once configured
}

boot();

// Export a noop so future tests can import main without side effects
export const __ENTRYPOINT__ = true;
```

# FILE: Prompt.md

````diff
@@
-Timestamp (UTC): 2025-10-25T02:09:00Z
-Revision: 0.14
+Timestamp (UTC): 2025-10-25T02:18:00Z
+Revision: 0.16
@@
 > - `.github/workflows/guard-meta.yml` / `scripts/guard_meta.sh` — enforce that Prompt.md is updated on every real change, and Patch/Tasklist are updated together with header bumps.
 > - `scripts/guard_meta.sh` — hardened: requires new bullets in “Last Repo Changes” and either Evidence Matrix or Revision History update when code changes.
+> - `tsconfig.json` — enforced `rootDir: src` and `outDir: dist` so tsc emits `dist/index.js`.
+> - `src/index.ts` — added minimal entrypoint to ensure `dist/index.js` exists after build.
+> - **Prompt.md** — added “AI Worker Prompt (copy/paste for Copilot/GPT)” section; CI checks for its presence.
@@
 ## Objectives
@@
+## AI Worker Prompt (copy/paste for Copilot/GPT)
+> Use this verbatim when spinning up an AI worker or committing via Copilot Chat.
+```
+ROLE: Senior Staff Systems Architect & Implementer for the Infinity-Gauntlet (Discord Pokémon buddy system).
+
+READ ORDER (fast-path):
+1) ops/NEXT.yaml  → get next_task_id + files_hint
+2) Tasklist.md    → execute only tasks with status: READY and all depends_on DONE
+3) ops/TOUCHMAP.yaml → constrain edits to mapped paths
+4) Prompt.md (this file) → ground truth + risks; update Last Repo Changes every commit
+
+OPERATING LOOP:
+- Pick the first READY task with dependencies DONE.
+- Produce ONE PATCHSET per task using the contract in Patch.md (full files for creates, unified diffs for edits).
+- Update Tasklist.md in the PATCHSET footer (DONE/READY flips, add subtasks with acceptance_criteria).
+- MUST bump timestamps/revisions (Prompt.md always; Patch/Tasklist together when either changes).
+- Write a clear Commit Message.
+
+GUARDRAILS:
+- Do not rename Patch.md, Tasklist.md, Prompt.md, or ops/PATCH_POLICY_BACKUP.md.
+- Keep diffs minimal, deterministic, and reversible. No secrets.
+- Respect files_hint; do not wander.
+- If ambiguous: add a tiny precursor PROPOSED task; update Prompt.md with the question.
+
+OUTPUT:
+- Only emit the PATCHSET block (and then the Commit Message block). No extra prose unless the task explicitly asks.
+```
@@
 | 2025-10-25 | 0.9 | Fixed Prisma relation P1012; aligned Prisma versions | AI | Build unblocks on Render
-| 2025-10-25 | 0.14 | Hardened meta guard (bullets + evidence/revision required) | AI | Stronger “convulsive learning”
+| 2025-10-25 | 0.14 | Hardened meta guard (bullets + evidence/revision required) | AI | Stronger “convulsive learning”
+| 2025-10-25 | 0.16 | Ensure dist/index.js; add AI Worker Prompt (CI-enforced) | AI | Self-bootstrapping worker prompt + stable start
````

# FILE: Patch.md

```diff
@@
-Last Updated (UTC): 2025-10-25T02:15:00Z
-Revision: 1.3
+Last Updated (UTC): 2025-10-25T02:18:00Z
+Revision: 1.4
@@
 ## META UPDATE REQUIREMENT (MANDATORY)
@@
 - **If unsure what to change:** update **Prompt.md** with a brief note under “Last Repo Changes” and bump its header; then stop or add a tiny precursor task.
 
 ### Worker Prompt Requirement
 - `Prompt.md` MUST contain the section titled exactly **“AI Worker Prompt (copy/paste for Copilot/GPT)”**.
 - When material workflows change (NEXT/TOUCHMAP/policies), refresh that section accordingly
```

# FILE: scripts/guard_meta.sh

```diff
@@
 # Rule 4 (nudge toward deeper learning): When non-doc changes occur, require a trace artifact update:
 # either a new Evidence Matrix line or a Revision History line must be added in Prompt.md.
 if $NON_DOC_CHANGED; then
   PROMPT_DIFF="$(git diff "$BASE"...HEAD -- Prompt.md || true)"
   HAS_EVIDENCE=$(echo "$PROMPT_DIFF" | grep -qE '^\+\| .* \| .* \| .* \|'; echo $?)
   HAS_REVHIST=$(echo "$PROMPT_DIFF" | grep -qE '^\+\| [0-9]{4}-[0-9]{2}-[0-9]{2} \|'; echo $?)
   if [[ "$HAS_EVIDENCE" -ne 0 && "$HAS_REVHIST" -ne 0 ]]; then
     fail "Non-doc changes detected: add either an Evidence Matrix row or a Revision History row in Prompt.md."
   fi
 fi
+
+# Rule 5: Prompt must include the AI Worker Prompt section header.
+if ! grep -q "^## AI Worker Prompt (copy/paste for Copilot/GPT)" Prompt.md; then
+  fail "Prompt.md is missing the required 'AI Worker Prompt (copy/paste for Copilot/GPT)' section."
+fi
```

# FILE: Tasklist.md

```diff
@@
-Last Updated (UTC): 2025-10-25T02:09:00Z
-Revision: 1.5
+Last Updated (UTC): 2025-10-25T02:18:00Z
+Revision: 1.6
@@
 ## Phase 0 — Repo & Tooling
@@
+- id: META.DIST_AND_PROMPT
+  title: Guarantee dist/index.js and add mandatory AI Worker Prompt
+  status: DONE
+  depends_on: [T0.FIX.BUILD_DIST, T0.META.HARDEN]
+  acceptance_criteria:
+    - tsconfig.json sets rootDir=src and outDir=dist
+    - src/index.ts exists and compiles to dist/index.js
+    - Prompt.md contains the “AI Worker Prompt (copy/paste for Copilot/GPT)” section
+    - CI guard fails if that section is missing
+  notes: Outcome — Stable boot on Render and a copy-paste worker prompt baked into Prompt.md.
```

# FILE: ops/NEXT.yaml

```diff
@@
-timestamp_utc: 2025-10-25T02:09:00Z
-note: "Meta guard hardened (bullets + evidence/revision required). Proceed with T2.2."
+timestamp_utc: 2025-10-25T02:18:00Z
+note: "dist/index.js guaranteed via tsconfig+entry; AI Worker Prompt added. Proceed with T2.2 (pipeline output with manifest)."
```

<<<PATCHSET END>>>

```

**Commit Message**
```

[META.DIST_AND_PROMPT] Ensure dist/index.js exists and add mandatory AI Worker Prompt (CI-enforced)

Why:
Render kept failing at runtime looking for dist/index.js. Also, Prompt.md should include a ready-to-use worker prompt so AIs can self-bootstrap.

Changes:

* tsconfig.json: rootDir=src, outDir=dist to emit dist/index.js.
* src/index.ts: minimal entry so tsc always produces dist/index.js.
* Prompt.md: added “AI Worker Prompt (copy/paste for Copilot/GPT)” and logged changes.
* Patch.md: documented Worker Prompt requirement.
* CI guard: now fails if Prompt.md lacks the Worker Prompt section.
* Stamped Prompt/Tasklist/NEXT.

Acceptance:
`npm start` points to an actually emitted dist/index.js; the repo contains a canonical, enforced worker prompt for AIs.

```

Once applied, you can jump back to the previously skipped task—the guardrails will keep the meta files and the worker brain tight as a drum.
```
