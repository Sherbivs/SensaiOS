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
<<<PATCHSET START>>>
# [T0.BOOTPACK]: Establish fast-path roadmap, AI brain docs, knowledge map, and meta-update policy

# FILE: Patch.md
```full
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

````

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
To minimize planning overhead, follow this **fast-path order** before the normal loop:
1. **Read `ops/NEXT.yaml`** to get the `next_task_id` and `files_hint`. Validate against `Tasklist.md`.
2. **Open `Tasklist.md`** to confirm status and dependencies. Only execute tasks that are `READY`.
3. **Consult `ops/TOUCHMAP.yaml`** for the primary files/paths for the task you are executing.
4. **Skim `Prompt.md`** for the environment overview and feedback loop; incorporate deltas if it informs the task.
5. **Optionally consult `ops/KNOWLEDGE.yaml`** for domain truth sources and paths.
6. Execute the normal **OPERATING LOOP** using PATCH BLOCKS.

**On completion of any task:**
- Update `ops/NEXT.yaml` to the next READY task and keep `files_hint` minimal but sufficient.
- Extend `ops/TOUCHMAP.yaml` if you touched relevant files not yet mapped.
- If the task changes system behavior or architecture, update `Prompt.md` (Revision History + impacted sections) and verify `ops/KNOWLEDGE.yaml` remains accurate.

**Do not** bloat these files. Keep them deterministic and concise.

---

## MODIFICATION POLICY: Patch.md & Tasklist.md

These files are the **contract** and the **task graph**. Update them deliberately and traceably.

### When it’s OK to update `Patch.md`
- Contract evolution that improves automation (e.g., new PATCHSET rules, safety rails, or fast-path steps).
- Fixing ambiguous or conflicting instructions that block work.
- Adding/removing sections that improve clarity or determinism (e.g., new meta policies).
- Clipboard maintenance (the PATCH CLIPBOARD footer is the **only** place for live PATCHSET staging).

**How to update `Patch.md`**
1. Prefer doing it under a dedicated **META task** (id prefix `META:` or `T0.*`) with clear acceptance criteria.
2. Use a **surgical diff** in the PATCHSET; avoid rewriting the entire file unless necessary.
3. Include a `# TASKLIST UPDATE` that:
   - Marks the META task `DONE`.
   - Adds any follow-up tasks (e.g., updating `ops/CRITICAL.md`, `ops/NEXT.yaml`, or `ops/TOUCHMAP.yaml`).
4. Never store secrets; never remove the PATCH CLIPBOARD footer.

### When it’s OK to update `Tasklist.md`
- Normal lifecycle transitions: `READY → IN_PROGRESS → DONE`, adding brief outcome notes.
- Unblocking newly-eligible tasks by flipping to `READY`.
- Adding discovered subtasks:
  - Use concise `id` (e.g., `T4.1a`) and clear `acceptance_criteria`.
  - Set initial `status: PROPOSED` or `READY` if immediately actionable.
- Marking tasks `BLOCKED` with a short reason and creating a `FIX:` task.

**How to update `Tasklist.md`**
1. Always via the `# TASKLIST UPDATE` unified diff within the current PATCHSET.
2. Keep the history lightweight: outcome notes belong on each task; deeper context goes to `Prompt.md` (Revision History) if architectural.
3. Avoid mass reformatting; preserve existing order and phases unless a META task explicitly reorganizes them.

### Meta-Update Workflow (quick checklist)
1. Create/choose a META task (or the current task if its acceptance criteria require contract changes).
2. Edit `Patch.md`/`Tasklist.md` with minimal diffs; reflect any crossfile implications (`ops/NEXT.yaml`, `ops/CRITICAL.md`, `ops/TOUCHMAP.yaml`).
3. Update `Tasklist.md` (status changes, new tasks).
4. Commit with a message that states **why** the meta-change was necessary.

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

# <<<PATCHSET END>>>

```
```

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
5) `Prompt.md` — environment understanding prompt (systems overview & feedback loop).
6) `ops/KNOWLEDGE.yaml` — knowledge map linking domains to truth sources.
7) Relevant code paths from `ops/TOUCHMAP.yaml`.

## Hot Paths (by concern)
- **Discord bot (commands/UI):** `/src/bot/**`
- **Battle engine:** `/src/core/battle/**`
- **Encounters/catching:** `/src/core/encounter/**`
- **Shared tooling:** `/src/shared/**`
- **Data pipeline:** `/src/data_pipeline/**`
- **Tests:** `/tests/**`
- **Docs:** `/*.md`, `/ops/**`
  - Prioritize: `Prompt.md`, `Patch.md`, `Tasklist.md`, `ops/**`

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
```

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
  - "Prompt.md"
  - "ops/KNOWLEDGE.yaml"

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

# Meta/contract maintenance
T0.PATCHPOLICY:
  - "Patch.md"
  - "Tasklist.md"
  - "ops/CRITICAL.md"
```

# FILE: Prompt.md

````full
# Prompt.md

## Purpose
Create an always-up-to-date, single source of truth the AI can use to **understand, explain, and reason about our entire environment** (systems, workflows, data, dependencies, risks). The AI should be able to (1) paint an accurate picture from what’s provided, (2) identify gaps, and (3) request or incorporate missing details via a structured feedback loop.

## Role & Mode
- **AI Role:** Senior Staff Systems Architect & Technical Writer.
- **Output Mode:** Precise, system-level documentation with diagrams-as-text, tables, and clear assumptions labeled as such.
- **Audience:** Engineers, DevOps, Security, Product, and Leadership.

## Objectives
1. Produce a comprehensive overview of the environment (infra, app architecture, data, CI/CD, security, observability, operations).
2. Highlight **unknowns, risks, and decisions** with recommended next steps.
3. Maintain a **feedback loop** to refine accuracy and depth over time.

---

## Ground Truth Sources (authoritative inputs)
Use these in order unless a section specifies otherwise:
1. `ops/NEXT.yaml` — current next task & file hints.
2. `Tasklist.md` — authoritative task graph and statuses.
3. `ops/TOUCHMAP.yaml` — file paths likely to be touched for a task.
4. `ops/KNOWLEDGE.yaml` — knowledge map (where truth for each domain lives).
5. Source code under the mapped paths (read, don’t assume).
6. Prior `Prompt.md` revisions (for deltas and change tracking).
7. Any explicitly provided artifacts (docs, tickets, pasted snippets).

> If sources conflict, record the conflict in **Section 10: Risks, Gaps, Open Questions**, cite both sources in the Evidence Matrix, and propose a resolution.

---

## Deliverables
- **Environment Overview:** High-level narrative + inventory tables.
- **System Map (text diagrams):** Services, data flows, ingress/egress, trust boundaries.
- **Runbooks & Lifecycles:** Build → deploy → operate; incident flow; change mgmt.
- **Data Topology:** Schemas, ownership, lifecycle, retention, PII/PHI flags.
- **Security Posture:** RBAC, authN/authZ, secrets, threat model, anti-abuse controls.
- **SLOs & Observability:** Metrics, alerts, dashboards, logs, traces.
- **Risk & Gaps Register:** Ranked issues with impact/likelihood and mitigation.
- **Open Questions:** Clear asks for missing or ambiguous info.
- **Revision History:** Date, summary, deltas, rationale.

---

## Constraints & Style
- **Truth over gloss:** Call out assumptions; never invent facts without labeling.
- **Deterministic structure:** Use the headings below; keep sections consistent.
- **Actionable detail:** Prefer concrete values, interfaces, owners, and SLAs.
- **Security-first:** Do not echo secrets; mark redactions and storage locations.

---

## Discovery Questionnaire (fill or ask iteratively)
1. **Mission & Scope**: goals; non-goals.
2. **Users & Interfaces**: personas; entry points (DMs, channels, Discord slash commands); external integrations.
3. **Architecture**: services/packages/containers; data stores (type, version, region, backups, retention); messaging/cron; third-party deps & SLAs.
4. **Environments**: dev/staging/prod; networking; edge; quotas/limits.
5. **Build & Release**: CI steps; CD strategy; migrations & rollback.
6. **Security**: identity, RBAC, secrets mgmt, compliance, anti-abuse.
7. **Observability**: logs/metrics/traces; alert routing; incident response.
8. **Data**: schemas, lineage, contracts, PII classification, RTO/RPO.
9. **Operations**: runbooks, maintenance windows, DR; cost controls.
10. **Risks & Decisions**: known issues, deadlines, tech debt.

---

## Output Structure (generate or update these sections)

### 1) Executive Summary
- One page: current state, key risks, top 3 recommendations.

### 2) System Inventory (table)
| Domain | Component | Purpose | Owner | RTO/RPO | SLO | Notes |
| ------ | --------- | ------- | ----- | ------- | --- | ----- |

### 3) Architecture Map (text diagram)
- Present services, data stores, and flows (Mermaid or ASCII).
- Mark **trust boundaries** and **external dependencies**.
- **Diagram conventions**:
  - Services: `[svc]`
  - Data stores: `(db)`
  - External: `{ext}`
  - Trust boundary: `=== boundary ===`
  - Example (Mermaid):
    ```
    flowchart LR
      user[[Discord User]] -->|slash command| bot[Discord Bot]
      bot --> core[Core Battle Engine]
      bot --> wilds[Encounter Engine]
      core --> db[(Postgres)]
      wilds --> db
      bot -->{Discord API}
    ```

### 4) Data Topology
- ERD summary, key entities (Users, Monsters, Moves, Parties, Encounters, Battles, Items, Events, Logs), retention, PII flags.
- Backups, restores, migration process.

### 5) Security & Compliance
- AuthN/AuthZ model, RBAC matrix (roles → permissions).
- Secrets inventory (locations only, not values), rotation policy.
- Threat model: assets, actors, surfaces, mitigations.

### 6) CI/CD & Release Management
- Pipelines, gates, artifact storage, promotion rules.
- Deployment strategies and rollback procedures.

### 7) Observability & Reliability
- SLIs/SLOs, alerts, dashboards; on-call runbook references.
- Error budgets and policy.

### 8) Operations & Runbooks
- Routine tasks, incident flow (detect → triage → mitigate → learn).
- DR/BCP plan: scenarios, RTO/RPO tests.

### 9) Cost & Capacity
- Major cost drivers, autoscaling, caching strategy, budgets.

### 10) Risks, Gaps, Open Questions
- Ranked risks with impact×likelihood, owner, due date.
- Explicit **Open Questions** to request missing facts.

### 11) Revision History
| Date | Version | Changes | Author | Notes |
| ---- | ------- | ------- | ------ | ----- |

---

## Evidence Matrix (traceability)
Record where each claim came from. Keep it short and link to files/lines when possible.

| Section | Claim | Source (file:path#lines) | Confidence | Notes |
| ------- | ----- | ------------------------ | ---------- | ----- |
| Arch    | Bot runs on Render Web Service | ops/KNOWLEDGE.yaml:infra | High | Confirmed in Render config once present |

> Update this table when you add or change facts. If multiple sources disagree, list them all and mark the conflict.

---

## Assumptions & TBD Register
Track assumptions separately from facts. Replace assumptions with facts as we learn them.

| ID | Area | Assumption/TBD | Rationale | Replacement Plan | Status |
| -- | ---- | -------------- | --------- | ---------------- | ------ |
| A-001 | Infra | Using Render Postgres | MVP simplicity | Confirm Render DB provisioned | OPEN |

---

## Validation Checklist (run each revision)
- [ ] No unlabeled assumptions remain in core sections (1–7).
- [ ] Secrets are not echoed; locations/redactions noted.
- [ ] All diagrams reflect current service boundaries and stores.
- [ ] SLOs/RTO-RPO specified or listed as TBD with owners.
- [ ] Evidence Matrix updated for new/changed claims.
- [ ] Revision History updated with date/version and deltas.
- [ ] `ops/NEXT.yaml` pointer still aligned with Tasklist.

---

## Feedback Loop (how to improve this document)
- When facts are missing: list them in **Section 10** with justification.
- When conflicting info appears: present both, mark conflict, propose resolution.
- On each revision: produce a changelog and “What changed & why” list in **Revision History**.
- Validation pass: run the checklist above.

---

## Example Prompts (use with your data)
- “Using the details below, generate sections 1–4. Any missing facts go to Open Questions.”
- “Update only sections 6 and 7 based on the new CI config; produce a diff and changelog.”
- “Generate a risk register from the following incidents and TODOs; rank by impact×likelihood.”

---

## Acceptance Criteria
- No unlabeled assumptions.
- Every component has owner, environment, and lifecycle notes.
- Security, observability, and DR are first-class (not afterthoughts).
- Risks are ranked with next actions and owners.

---

### Optional: Project-Specific Hints
- **Tech stack:** Node.js + TypeScript; Prisma ORM; Postgres; Docker; Render.
- **Domains:** Discord bot, DM flows as “home”, channel commands as “field.”
- **Determinism:** Seeded RNG per user; server-authoritative state; anti-cheat.
- **Data model anchors:** Users, Monsters, Moves, Parties, Encounters, Battles, Items, Events, Logs.
- **Non-functional:** RBAC, input validation, permissions, structured logs, metrics, audits, IaC, env-based config, hot-read caching.
````

# FILE: ops/KNOWLEDGE.yaml

```full
# Knowledge Map — where the truth lives for each domain.
# Extend as the system grows. Keep paths minimal and stable.

version: 1

ownership:
  product_owner: "TBD"
  tech_lead: "TBD"
  security_contact: "TBD"
  oncall_rotation: "TBD"

domains:
  infra:
    truth_sources:
      - "Render dashboard (out of repo)"
      - "ops/NEXT.yaml"
      - "ops/CRITICAL.md"
      - "Prompt.md"
    repo_paths:
      - "src/shared/config.ts"
      - "Dockerfile"
      - "render.yaml"
    notes: "Render Postgres + Web Service + Background Worker (planned)."

  discord_bot:
    truth_sources:
      - "src/bot/**"
      - "Tasklist.md"
      - "ops/TOUCHMAP.yaml"
    repo_paths:
      - "src/bot/**"
    notes: "Slash commands, DM flows, arena/wilds thread lifecycles."

  battle_engine:
    truth_sources:
      - "src/core/battle/**"
      - "RULESET.md"
    repo_paths:
      - "src/core/battle/**"
    notes: "Deterministic RNG, type chart, statuses, damage."

  encounters:
    truth_sources:
      - "src/core/encounter/**"
      - "DATA-SCHEMA.md"
    repo_paths:
      - "src/core/encounter/**"
    notes: "Spawn tables, catch mechanics, encounter state."

  data_pipeline:
    truth_sources:
      - "src/data_pipeline/**"
      - "DATA-SCHEMA.md"
    repo_paths:
      - "src/data_pipeline/**"
      - "data/**"
    notes: "Reference data ingestion, normalization, sharding."

  persistence:
    truth_sources:
      - "prisma/schema.prisma"
      - "src/models/**"
      - "migrations/**"
    repo_paths:
      - "src/models/**"
      - "prisma/**"
      - "migrations/**"
    notes: "Users, pokemon_instances, parties, encounters, battles."

  security:
    truth_sources:
      - "Prompt.md"
      - "RULESET.md"
      - "src/shared/**"
    repo_paths:
      - "src/shared/**"
    notes: "RBAC, permissions, rate limits, anti-abuse."

  observability:
    truth_sources:
      - "Prompt.md"
      - "OPERATIONS.md"
    repo_paths:
      - "src/shared/log.ts"
      - "src/shared/metrics.ts"
    notes: "Structured logs, metrics, alert hooks (future)."
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
+
+- id: T0.DOCPROMPT
+  title: Add Prompt.md and integrate it into fast-path docs
+  status: DONE
+  depends_on: [T0.FP]
+  acceptance_criteria:
+    - Prompt.md created at repo root with purpose, objectives, deliverables, constraints, questionnaire, and output structure
+    - ops/CRITICAL.md updated to include Prompt.md in boot order
+    - Patch.md updated to reference Prompt.md in the fast-path and completion rules
+    - ops/TOUCHMAP.yaml includes Prompt.md under relevant tasks
+  notes: Outcome — Prompt.md added and wired into fast-path; AI can use it to understand and document system state.
+
+- id: T0.DOCPROMPT.V2
+  title: Evolve Prompt.md to AI brain grade and add ops/KNOWLEDGE.yaml
+  status: DONE
+  depends_on: [T0.DOCPROMPT]
+  acceptance_criteria:
+    - Prompt.md includes Evidence Matrix, Assumptions/TBD Register, Validation Checklist, Diagram Conventions
+    - ops/KNOWLEDGE.yaml added mapping domains to truth sources and paths
+    - ops/CRITICAL.md and Patch.md reference the knowledge map and update rules
+    - TOUCHMAP includes the new file
+  notes: Outcome — Prompt.md upgraded; knowledge map added; fast-path enriched for maximal AI leverage.
+
+- id: T0.PATCHPOLICY
+  title: Add explicit policy for updating Patch.md and Tasklist.md
+  status: DONE
+  depends_on: [T0.DOCPROMPT.V2]
+  acceptance_criteria:
+    - Patch.md includes a "Modification Policy" section covering when/how to edit Patch.md and Tasklist.md
+    - ops/CRITICAL.md documents the contract & task graph update policy
+    - ops/TOUCHMAP.yaml maps T0.PATCHPOLICY to Patch.md, Tasklist.md, and ops/CRITICAL.md
+  notes: Outcome — Clear, enforceable instructions exist for meta updates; future AIs can evolve the contract and task graph safely.
@@
 - id: T0.2
   title: Create repo structure and docs
   status: READY
   depends_on: [T0.1]
   acceptance_criteria:
     - Folders: /src/bot, /src/core/{battle,encounter}, /src/shared, /src/data_pipeline, /tests
     - Docs: RULESET.md, DATA-SCHEMA.md, OPERATIONS.md created with stubs
   notes: Empty index files are fine as placeholders.
```

<<<PATCHSET END>>>

```
```
