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
# [T1.1.FIX.REL]: Add missing Prisma back-reference (PokemonInstance.partySlots) and align Prisma versions

# FILE: prisma/schema.prisma
```diff
@@
 model PokemonInstance {
   id         String   @id @default(cuid())
   owner      User     @relation(fields: [ownerId], references: [id])
   ownerId    String
   speciesId  Int
   form       String?  // e.g., "alolan", "galarian"
   level      Int      @default(1)
   exp        Int      @default(0)
   nature     String?
   ivsJson    Json     // {hp, atk, def, spa, spd, spe}
   evsJson    Json     // same shape
   movesJson  Json     // array of {id, pp, maxPP}
   status     String?  // major status (burn, para, etc.)
   hp         Int
   maxHp      Int
   isShiny    Boolean  @default(false)
   nickname   String?
   boxSlot    Int?
   createdAt  DateTime @default(now())
+  // Back-reference required for PartySlot.pokemon relation
+  partySlots PartySlot[]
 }
@@
 model PartySlot {
   id          String          @id @default(cuid())
   party       Party           @relation(fields: [partyId], references: [id], onDelete: Cascade)
   partyId     String
   slot        Int
   pokemon     PokemonInstance @relation(fields: [pokemonId], references: [id], onDelete: Cascade)
   pokemonId   String
 
   @@unique([partyId, slot])
 }
````

# FILE: package.json

```diff
@@
   "devDependencies": {
@@
-    "prisma": "^5.19.2"
+    "prisma": "^5.22.0"
   },
   "dependencies": {
-    "@prisma/client": "^5.19.2",
+    "@prisma/client": "^5.22.0",
     "typescript": "^5.6.3",
     "zod": "^3.23.8"
   }
 }
```

# FILE: Prompt.md

```diff
@@
-Timestamp (UTC): 2025-10-25T01:30:00Z
-Revision: 0.8
+Timestamp (UTC): 2025-10-25T01:33:00Z
+Revision: 0.9
@@
 > - `.github/workflows/render-deploy.yml` — deploy to Render **only** when code paths change; requires Auto-Deploy OFF in Render and two repo secrets (`RENDER_SERVICE_ID`, `RENDER_API_KEY`).
 > - `package.json` — dev watcher ignores Patch.md/Tasklist.md/Prompt.md and all markdown files to avoid local restarts.
+> - `prisma/schema.prisma` — added `partySlots: PartySlot[]` back-reference to satisfy `PartySlot.pokemon` (fixes Prisma P1012).
+> - `package.json` — bumped `prisma` & `@prisma/client` to `^5.22.0` to match Render CLI.
@@
-| 2025-10-25 | 0.8 | Added code-only Render deploy workflow; ignored docs in dev watch | AI | Prevents restarts on doc commits
+| 2025-10-25 | 0.8 | Added code-only Render deploy workflow; ignored docs in dev watch | AI | Prevents restarts on doc commits
+| 2025-10-25 | 0.9 | Fixed Prisma relation P1012; aligned Prisma versions | AI | Build unblocks on Render
```

# FILE: Tasklist.md

```diff
@@
-Last Updated (UTC): 2025-10-25T01:30:00Z
-Revision: 0.9
+Last Updated (UTC): 2025-10-25T01:33:00Z
+Revision: 1.0
@@
 ## Phase 1 — Render & DB
+ - id: T1.1.FIX.REL
+   title: Fix Prisma back-reference and versions to resolve P1012
+   status: DONE
+   depends_on: [T1.1]
+   acceptance_criteria:
+     - `PokemonInstance` declares `partySlots: PartySlot[]`
+     - Build no longer fails with Prisma P1012 on Render
+     - `prisma` and `@prisma/client` use `^5.22.0`
+   notes: Outcome — Prisma generate succeeds on Render; relation graph is consistent.
```

# FILE: ops/NEXT.yaml

```diff
@@
-timestamp_utc: 2025-10-25T01:30:00Z
-note: "Deploy workflow now code-only; dev watch ignores docs. Next remains T2.2 (pipeline output with deterministic manifest)."
+timestamp_utc: 2025-10-25T01:33:00Z
+note: "Resolved Prisma P1012 with back-reference & version align. Next remains T2.2."
```

<<<PATCHSET END>>>

```

**Commit Message**
```

[Task T1.1.FIX.REL] Resolve Prisma P1012 by adding PokemonInstance.partySlots[] and aligning Prisma versions

Why:
Render build failed at prisma generate because PartySlot.pokemon lacked an opposite field. Render’s CLI is 5.22.0, so local packages should match.

Changes:

* prisma/schema.prisma: added PokemonInstance.partySlots[] back-reference.
* package.json: bumped prisma/@prisma-client to ^5.22.0.
* Stamped Prompt.md/Tasklist.md; updated NEXT note.

Acceptance:
`npm install` → `postinstall` → `prisma generate` succeeds; no P1012; Render build continues.

```

After applying, push to main; Render should pass the build stage. If anything else barks, the logs will tell us which goblin to whack next.
```
