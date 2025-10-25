Absolutely—let’s supercharge the Trigger phase without touching runtime code. Below is a **single PATCHSET** that:

* Expands and formalizes the **Activation Trigger** workflow (fast, safe, deterministic).
* Introduces **FAST** and **DRY-RUN** trigger modes, plus a **concurrency lock** to prevent double-runs.
* Adds **association logic** (Router→INBOX→NEXT→Tasklist tying), **preflight safety checks**, and explicit **Echo/Ledger duties**.
* Documents everything in `Prompt.md`, `Patch.md`, and `ops/CRITICAL.md`.
* Adds a tiny **lock readme**, **Router bump**, and an optional **CI guard** to verify the trigger contract exists (safe for deploys).
* Records this as a `Tasklist.md` meta-task (`T0.TRIGGER.ENHANCED`) = DONE.

Paste this into your `Patch.md` clipboard and run it.

````
<<<PATCHSET START>>>
# [T0.TRIGGER.ENHANCED]: Expand Activation Trigger workflow, fast-path, safety lock, and Echo/Ledger duties

# FILE: Prompt.md
```diff
@@
-Timestamp (UTC): 2025-10-25T05:25:00Z
-Revision: 0.31
+Timestamp (UTC): 2025-10-25T05:36:00Z
+Revision: 0.33
@@
 > Changes in this revision:
-> - `Prompt.md` — Relocated embedded patchset content into the PATCHSET:ECHO block, removed stray section under Activation Trigger, and bumped timestamp/revision (no functional code changes).
+> - `Prompt.md` — Overhauled **Activation Trigger**: added FAST/DRY-RUN modes, preflight checks, association logic, and concurrency lock semantics; codified Echo/Ledger duties. Bumped timestamp/revision.
+> - `Patch.md` / `ops/CRITICAL.md` — Documented Trigger contract & safety lock.
+> - `ops/ROUTER.yaml` — Added lock & inbox entries; ensured canonical read order.
+> - `ops/LOCKS/README.md` — New: explains `patch_engine.lock`.
+> - `.github/workflows/guard-trigger.yml` / `scripts/guard_trigger.sh` — CI checks for Trigger section+markers.
@@
 ## AI Worker Prompt (copy/paste for Copilot/GPT)
@@
 OUTPUT:
 - Only emit the PATCHSET block (and then the Commit Message block). No extra prose unless the task explicitly asks.
 
+---
+
+## Activation Trigger (MANDATORY, enhanced)
+**Trigger phrase (case-sensitive):** `ACTIVATE: PATCH ENGINE`  
+**Optional modes:**  
+• **FAST:** `ACTIVATE: PATCH ENGINE FAST` (skip non-critical scans; use Router/Touchmap narrowing aggressively)  
+• **DRY-RUN:** append `DRY` → `ACTIVATE: PATCH ENGINE FAST DRY` (simulate; no file writes)
+
+### Execution Order (strict)
+1) **Router**: load `ops/ROUTER.yaml` (canonical paths & categories).  
+2) **INBOX**: if `ops/INBOX/notes.md` is newer than `NEXT.last_notes_read_utc`, ingest into working memory; set `last_notes_read_utc` upon commit.  
+3) **NEXT**: read `ops/NEXT.yaml` for `next_task_id`, `files_hint`, and routing notes.  
+4) **Tasklist**: select first task with `status: READY` and all `depends_on: DONE`. If mismatch with `next_task_id`, prefer **Tasklist** but append an Open Question in Prompt.md.  
+5) **TOUCHMAP**: restrict reads/writes to mapped files unless acceptance_criteria expands scope.  
+6) **Preflight checks** (fail safely if any fail):  
+   - **Lock** not held: `ops/LOCKS/patch_engine.lock` must be absent.  
+   - **Echo markers present**: `<!-- PATCHSET:ECHO BEGIN --> … END`.  
+   - **Ledger markers present**: `<!-- LEDGER:BEGIN --> … END`.  
+   - **Canonical filenames** present (`Patch.md`, `Tasklist.md`, `Prompt.md`, `ops/PATCH_POLICY_BACKUP.md`).  
+7) **Acquire lock**: create `ops/LOCKS/patch_engine.lock` with metadata `{utc, who, task_id}`.  
+8) **Execute** one task → emit exactly **ONE PATCHSET** (creates: full files; edits: unified diffs).  
+9) **Meta updates (mandatory)**:  
+   - Prompt.md: bump timestamp/revision; update **Last Repo Changes**.  
+   - **Echo**: paste exact PATCHSET + Commit Message between Echo markers **or** set `NO-ECHO-REASON:` with HEAD short SHA.  
+   - **Ledger**: if available locally, run `npm run docs:update-ledger`; otherwise leave head note.  
+   - Tasklist.md: mark executed task `DONE`, unblocked→`READY`, add subtasks if discovered (with acceptance_criteria).  
+   - Patch.md: bump stamps if it changed or if the contract evolved.  
+10) **Release lock**: remove `ops/LOCKS/patch_engine.lock`.
+
+### Safety & Association Logic
+- **Association priority**: `Tasklist.md` truth > `ops/NEXT.yaml` pointer. When diverging, task selection follows Tasklist; NEXT gets an explanatory note in this commit.  
+- **FAST mode** suppresses non-essential scans (e.g., dep graph) and narrows edits to `files_hint ∩ TOUCHMAP`.  
+- **DRY-RUN** mode performs all analysis & rendering but **does not** modify files. Provide Echo with `NO-ECHO-REASON: DRY-RUN` and include a diff summary.
+
+### Trigger Telemetry (write-only notes)
+Append a bullet in **Last Repo Changes**:  
+`- Trigger run: {mode: FAST|DEFAULT, dry: true|false, task: <id>, locked_ms: <~estimate>}`
+
+### Failure policy
+- If a preflight fails: produce a **PATCHSET** that only updates Prompt.md with a `NO-ECHO-REASON` detailing the failure, and add a tiny `PROPOSED` fix task to Tasklist.
+
@@
 ## Recent Change Ledger (last 200)
@@
 <!-- LEDGER:BEGIN -->
-Pending generation. Run `npm run docs:update-ledger` to populate.
+Pending generation. Run `npm run docs:update-ledger` to populate (must include HEAD).
 <!-- LEDGER:END -->
 
@@
 <!-- PATCHSET:ECHO BEGIN -->
-NO-ECHO-REASON: PATCHSET stored in git history for brevity; see summary below.
+NO-ECHO-REASON: Concise echo (git history holds full diff). HEAD: {{HEAD_SHORT_SHA}}
 - Battle challenge DM helpers + Arena thread creator implemented (T5.1).
 - Added tests validating DM handshake and arena thread creation.
 - Advanced task metadata (Tasklist/NEXT) and updated Prompt revision.
 - Commit: [Task T5.1] Battle challenge DM + Arena thread flow.
 <!-- PATCHSET:ECHO END -->
````

# FILE: Patch.md

```diff
@@
-Last Updated (UTC): {{TO_BE_SET_BY_AI}}
-Revision: {{PATCHMD_REV}}
+Last Updated (UTC): 2025-10-25T05:36:00Z
+Revision: 0.9
@@
 ## OPERATING LOOP
@@
 5. **Repeat**
    - Return to step 1 until no `READY` tasks remain.
+
+## ACTIVATION TRIGGER CONTRACT (MANDATORY)
+- Trigger phrases: `ACTIVATE: PATCH ENGINE` (default), `ACTIVATE: PATCH ENGINE FAST`, and with optional `DRY`.
+- On trigger, the AI must follow the **Activation Trigger (enhanced)** section in Prompt.md verbatim.
+- **Concurrency**: before emitting a PATCHSET, create `ops/LOCKS/patch_engine.lock`; remove it after commit. If present, abort with a Prompt-only PATCHSET carrying `NO-ECHO-REASON: LOCK-HELD`.
+- **Echo duty**: update Prompt.md’s `PATCHSET:ECHO` with exact PATCHSET + Commit Message or a `NO-ECHO-REASON` and HEAD short SHA.
+- **Ledger duty**: ensure `<!-- LEDGER:BEGIN/END -->` exist; if generator not available, leave a note that HEAD must be included later.
```

# FILE: ops/CRITICAL.md

```diff
@@
 ## Update Rules
@@
 - Keep these files **small and deterministic**. Re-run yields the same state.
 
+## Trigger Safety & Ordering
+- Always resolve **Router → INBOX → NEXT → Tasklist → TOUCHMAP** before execution.
+- Respect `Tasklist.md` when it conflicts with `NEXT.yaml`; annotate `NEXT.yaml` with a note explaining divergence.
+- Use `ops/LOCKS/patch_engine.lock` to serialize Trigger runs.
+- FAST mode narrows reads/writes to `files_hint ∩ TOUCHMAP`.
+- DRY-RUN mode never writes files; instead, update Prompt.md Echo with `NO-ECHO-REASON: DRY-RUN`.
+
 ### Contract & Task Graph Updates (Policy)
@@
  - **Timestamps/Revisions:** Update top-of-file timestamps and revisions in `Patch.md`, `Tasklist.md`, and `Prompt.md`. For `Prompt.md`, also update the “Last Repo Changes” block summarizing this PATCHSET.
```

# FILE: ops/ROUTER.yaml

```diff
@@
 router_version: 1
 categories:
   meta:
     - "Patch.md"
     - "Tasklist.md"
     - "Prompt.md"
     - "ops/CRITICAL.md"
     - "ops/TOUCHMAP.yaml"
     - "ops/NEXT.yaml"
     - "ops/KNOWLEDGE.yaml"
     - "ops/PATCH_POLICY_BACKUP.md"
+    - "ops/LOCKS/README.md"
   schemas:
     - "src/data_pipeline/schema/**"
   tests:
     - "tests/**"
   scripts:
     - "scripts/**"
 inbox:
   - "ops/INBOX/notes.md"
+locks:
+  patch_engine: "ops/LOCKS/patch_engine.lock"
```

# FILE: ops/LOCKS/README.md

```full
# Locks

`patch_engine.lock` is created at the start of an Activation Trigger run and deleted after commit.

Format (UTF-8 text):
```

task_id: <id>
utc: <ISO 8601>
who: <agent or user>
mode: DEFAULT|FAST
dry: true|false

```

If this file exists, **no new Trigger run may start**. Produce a Prompt-only PATCHSET with:
```

NO-ECHO-REASON: LOCK-HELD (task=<id>, utc=<iso>)

```
```

# FILE: .github/workflows/guard-trigger.yml

```full
name: guard-trigger
on:
  pull_request:
  push:
    branches: [ main ]
permissions: { contents: read }
jobs:
  guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Verify Activation Trigger contract present
        run: |
          set -e
          grep -q "## Activation Trigger (MANDATORY, enhanced)" Prompt.md
          grep -q "<!-- PATCHSET:ECHO BEGIN -->" Prompt.md
          grep -q "<!-- LEDGER:BEGIN -->" Prompt.md
          test -f ops/LOCKS/README.md
      - name: Shell guard script
        run: bash scripts/guard_trigger.sh
```

# FILE: scripts/guard_trigger.sh

```full
#!/usr/bin/env bash
set -euo pipefail

echo "[guard_trigger] Checking for lock path and router entries..."
grep -q "patch_engine.lock" ops/ROUTER.yaml

echo "[guard_trigger] Ensuring canonical files exist..."
test -f Patch.md
test -f Prompt.md
test -f Tasklist.md
test -f ops/PATCH_POLICY_BACKUP.md

echo "[guard_trigger] OK"
```

# FILE: Tasklist.md

```diff
@@
-Last Updated (UTC): 2025-10-25T05:25:00Z
-Revision: 1.22
+Last Updated (UTC): 2025-10-25T05:36:00Z
+Revision: 1.23
@@
 ## Phase 0 — Repo & Tooling
@@
+- id: T0.TRIGGER.ENHANCED
+  title: Enhance Activation Trigger (FAST/DRY, preflight, lock, Echo/Ledger duties)
+  status: DONE
+  depends_on: []
+  acceptance_criteria:
+    - Prompt.md contains enhanced Trigger section with FAST and DRY-RUN modes, preflight list, execution order, and failure policy
+    - ops/LOCKS/README.md added; Router references lock path
+    - Patch.md & ops/CRITICAL.md document lock and Trigger obligations
+    - CI guard verifies Trigger markers and lock docs
+  notes: Outcome — Trigger is faster, safer, and deterministic; prevents concurrent runs; improves auditability.
```

<<<PATCHSET END>>>

```

**Commit Message**
```

[T0.TRIGGER.ENHANCED] Faster & safer Activation Trigger (FAST/DRY modes, preflight checks, lock, Echo/Ledger duties)

Why:
We want a snappier, more reliable “Trigger phase” that an AI can treat like a workflow engine: start earlier, do precise association logic, avoid double-runs, and keep airtight audit trails.

Changes:

* Prompt.md: comprehensive Trigger spec (FAST/DRY, preflights, ordering, failure policy, telemetry) and Echo/Ledger duties.
* Patch.md / ops/CRITICAL.md: contract + safety lock rules.
* ops/ROUTER.yaml: added lock/inbox paths; confirmed canonical meta set.
* ops/LOCKS/README.md: new lock semantics.
* CI: guard-trigger workflow + script ensure markers/lock/docs exist.
* Tasklist.md: recorded T0.TRIGGER.ENHANCED as DONE.

Result:
Trigger becomes a deterministic workflow entrypoint with speed (FAST), safety (lock/preflights), and consistent meta updates (Echo/Ledger).

```

If you want me to also add a minimal `scripts/update_change_ledger.sh` and a `package.json` script to populate the **Recent Change Ledger**, say the word and I’ll fold it into a follow-up micro-patch without touching runtime paths.
```
