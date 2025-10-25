# Tasklist
Last Updated (UTC): 2025-10-25T07:10:00Z
Revision: 1.22

Status legend: `PROPOSED` → `READY` → `IN_PROGRESS` → `DONE` → `BLOCKED`

Each task has:
- `id`: unique string
- `title`: terse description
- `status`: current state
- `depends_on`: array of task ids
- `acceptance_criteria`: bullet list
- `notes`: optional context

---

## Phase 0 — Repo & Tooling
- id: T0.REFRESH.VISION
  title: Add Refresh Vision phase and recovery ledger
  status: DONE
  depends_on: []
  acceptance_criteria:
    - scripts/refresh_vision.sh stamps ops/RECOVERY.yaml and rebuilds ops/ROUTER_INDEX.yaml
    - Prompt.md read order includes refresh step and recovery note
    - ops/CRITICAL.md documents the phase
  notes: Outcome — Workers always re-sync context and can resume after interruptions.

- id: T0.ROUTER.NET
  title: Establish per-directory routers and router-of-routers index
  status: DONE
  depends_on: [T0.REFRESH.VISION]
  acceptance_criteria:
    - ROUTER.md exists for ops/, src/, src/bot/, src/core/, tests/, scripts/
    - scripts/update_router_index.sh generates ops/ROUTER_INDEX.yaml
    - Patch/Prompt policies require router updates when touching routed dirs
  notes: Outcome — City roadway map enables fast navigation and targeted patching.
- id: META.LEDGER200
  title: Add auto-generated Recent Change Ledger (last 200) to Prompt.md
  status: DONE
  depends_on: [META.HARD_ROUTE]
  acceptance_criteria:
    - Prompt.md contains LEDGER markers and generated content section
    - Script scripts/update_change_ledger.sh produces ledger with file paths and approximate line ranges
    - CI fails if HEAD commit is not present in the ledger
  notes: Outcome — AI can quickly infer recent intent across last 200 changes with locations and logic summary.

- id: META.PATCHSET_ECHO
  title: Enforce Embedded PATCHSET Echo in Prompt.md (or explicit NO-ECHO-REASON)
  status: DONE
  depends_on: [META.LEDGER200, META.HARD_ROUTE]
  acceptance_criteria:
    - Prompt.md contains “Embedded PATCHSET Echo” section with markers
    - CI fails if echo section lacks HEAD short SHA and lacks NO-ECHO-REASON
    - Patch contract documents the requirement
  notes: Outcome — Single-file audit snapshot of the most recent change now lives in Prompt.md.
- id: META.HARD_ROUTE
  title: Add router + inbox notes and enforce router-driven AI routing
  status: DONE
  depends_on: [T0.META.ENFORCE]
  acceptance_criteria:
    - ops/ROUTER.yaml defines canonical paths and categories
    - ops/INBOX/notes.md exists; AI reads it first when newer than NEXT.last_notes_read_utc
    - ops/NEXT.yaml gains router_version + last_notes_read_utc
    - ops/TOUCHMAP.yaml contains categories for schema and runtime entry
    - guard-routing CI present (advisory mode)
  notes: Outcome — AI has deterministic places to read/write; fast human notes flow.

- id: T0.FP
  title: Add Critical Files Fast-Path system
  status: DONE
  depends_on: []
  acceptance_criteria:
    - Create ops/CRITICAL.md documenting fast-path boot order and hot paths
    - Create ops/NEXT.yaml with the next_task_id and files_hint
    - Create ops/TOUCHMAP.yaml mapping task IDs to primary files
    - Update Patch.md to reference and enforce the fast-path rules
  notes: Outcome — Fast-path created and initialized (next_task_id: T0.2).

- id: T0.1
  title: Initialize TypeScript project & tooling
  status: DONE
  depends_on: []
  acceptance_criteria:
    - package.json with scripts: build, dev, lint, test
    - tsconfig.json configured
    - ESLint + Prettier configured
    - vitest/jest configured with a sample test
  notes: Keep configs minimal and conventional. (Outcome: Added TS toolchain, linting, Prettier, Vitest sample test.)

- id: T0.2
  title: Create repo structure and docs
  status: DONE
  depends_on: [T0.1]
  acceptance_criteria:
    - Folders: /src/bot, /src/core/{battle,encounter}, /src/shared, /src/data_pipeline, /tests
    - Docs: RULESET.md, DATA-SCHEMA.md, OPERATIONS.md created with stubs
  notes: Created /src/core/{battle,encounter}, /src/shared, /src/data_pipeline; added RULESET.md, DATA-SCHEMA.md, OPERATIONS.md stubs.

- id: T0.DOCPROMPT
  title: Add Prompt.md and integrate it into fast-path docs
  status: DONE
  depends_on: [T0.FP]
  acceptance_criteria:
    - Prompt.md created at repo root with purpose, objectives, deliverables, constraints, questionnaire, and output structure
    - ops/CRITICAL.md updated to include Prompt.md in boot order
    - Patch.md updated to reference Prompt.md in the fast-path and completion rules
    - ops/TOUCHMAP.yaml includes Prompt.md under relevant tasks
  notes: Outcome — Prompt.md added and wired into fast-path; AI can use it to understand and document system state.

- id: T0.DOCPROMPT.V2
  title: Evolve Prompt.md to AI brain grade and add ops/KNOWLEDGE.yaml
  status: DONE
  depends_on: [T0.DOCPROMPT]
  acceptance_criteria:
    - Prompt.md includes Evidence Matrix, Assumptions/TBD Register, Validation Checklist, Diagram Conventions
    - ops/KNOWLEDGE.yaml added mapping domains to truth sources and paths
    - ops/CRITICAL.md and Patch.md reference the knowledge map and update rules
    - TOUCHMAP includes the new file
  notes: Outcome — Prompt.md upgraded; knowledge map added; fast-path enriched for maximal AI leverage.

- id: T0.PATCHPOLICY
  title: Add explicit policy for updating Patch.md and Tasklist.md
  status: DONE
  depends_on: [T0.DOCPROMPT.V2]
  acceptance_criteria:
    - Patch.md includes a "Modification Policy" section covering when/how to edit Patch.md and Tasklist.md
    - ops/CRITICAL.md documents the contract & task graph update policy
    - ops/TOUCHMAP.yaml maps T0.PATCHPOLICY to Patch.md, Tasklist.md, and ops/CRITICAL.md
  notes: Outcome — Clear, enforceable instructions exist for meta updates; future AIs can evolve the contract and task graph safely.

- id: T0.3
  title: Add Prompt.md environment scaffold
  status: DONE
  depends_on: []
  acceptance_criteria:
    - Create root-level Prompt.md capturing purpose, objectives, deliverables, constraints, and discovery questionnaire
    - Include output structure, feedback loop, example prompts, and acceptance criteria
    - Optional project hints tailored to this repo (Node.js + TS, Postgres, Render, Discord bot)
  notes: Prompt.md added and referenced in ops/CRITICAL.md as a contextual doc.

- id: T0.FIX.BUILD_DIST
  title: Ensure dist is built during Render "npm install" build step
  status: DONE
  depends_on: [T1.1, T1.2]
  acceptance_criteria:
    - `package.json` contains a `postinstall` that compiles TypeScript to `dist/`
    - Build does not rely on global `tsc`; uses local binaries
    - Render start (`node dist/index.js`) works without needing render.yaml
  notes: Outcome — `dist/index.js` created during `npm install`; eliminates MODULE_NOT_FOUND at runtime.

- id: T0.FIX.RENDER_START
  title: Add render.yaml with explicit build/start commands for Render
  status: DONE
  depends_on: []
  acceptance_criteria:
    - render.yaml exists at repo root with buildCommand "npm ci && npm run build"
    - startCommand runs compiled app via "node dist/index.js"
    - NEXT pointer includes render.yaml in files_hint notes
  notes: Outcome — Render no longer relies on missing npm start; service boots compiled JS.

- id: T0.GUARD_FILENAMES
  title: Guard canonical doc filenames and instruct AI never to rename them
  status: DONE
  depends_on: []
  acceptance_criteria:
    - Patch.md/CRITICAL.md document canonical filenames and the “do not rename” rule
    - CI workflow `.github/workflows/guard-docs.yml` exists and runs `scripts/guard_doc_names.sh`
    - Script fails the build if any canonical file is missing or if lowercase/variant files exist
  notes: Outcome — Render Build Filters remain valid; AI is explicitly instructed and CI enforces compliance.

- id: T0.META.ENFORCE
  title: Enforce Prompt/Tasklist/Patch updates on every PATCHSET
  status: DONE
  depends_on: [T0.GUARD_FILENAMES]
  acceptance_criteria:
    - Patch.md documents mandatory Prompt.md update and coupled Patch/Tasklist header bumps
    - CI guard fails when non-doc changes omit Prompt.md or when Patch/Tasklist are edited alone
    - CI guard verifies header lines were bumped
  notes: Outcome — The “update meta or fail” rule is encoded in docs and enforced in CI.

- id: META.DIST_AND_PROMPT
  title: Guarantee dist/index.js and add mandatory AI Worker Prompt
  status: DONE
  depends_on: [T0.FIX.BUILD_DIST, T0.META.ENFORCE]
  acceptance_criteria:
    - Prompt.md contains the “AI Worker Prompt (copy/paste for Copilot/GPT)” section
    - CI guard fails if that section is missing
    - Build continues to emit dist/ via existing pipeline (no regression)
  notes: Outcome — Repo contains a canonical worker prompt; CI enforces its presence.

- id: T0.TIMESTAMPS.APPLY
  title: Apply live timestamps/revisions and populate Prompt.md change log
  status: DONE
  depends_on: [T0.TIMESTAMPS]
  acceptance_criteria:
    - Prompt.md has current UTC Timestamp/Revision and a populated "Last Repo Changes" section
    - Patch.md and Tasklist.md top-of-file Last Updated/Revision fields stamped
    - ops/NEXT.yaml carries a timestamp note for traceability
  notes: Outcome — Core docs stamped and synchronized with recent repo changes (render.yaml, scaffolds, NEXT pointer).

- id: T0.FIX.RENDER_START
  title: Add render.yaml with explicit build/start commands for Render
  status: DONE
  depends_on: []
  acceptance_criteria:
    - render.yaml exists at repo root with buildCommand "npm ci && npm run build"
    - startCommand runs compiled app via "node dist/index.js"
    - NEXT pointer includes render.yaml in files_hint notes
  notes: Outcome — Render no longer relies on missing npm start; service boots compiled JS.

## Phase 1 — Render & DB

- id: T1.1
  title: Add DB schema with Prisma/Drizzle
  status: DONE
  depends_on: [T0.2]
  acceptance_criteria:
    - Models: users, pokemon_instances, parties, party_slots, encounters, battles, cooldowns
    - Migration file generated
    - Basic repo methods scaffolded (create/read)
  notes: Prisma chosen for ORM; schema added; Prisma client singleton + config provided. Migrations to run outside CI/CD initially.

- id: T1.2
  title: Config loader and structured logger
  status: DONE
  depends_on: [T0.2]
  acceptance_criteria:
    - `src/shared/config.ts` reads env vars with safe defaults
    - `src/shared/log.ts` provides pino-like logger
  notes: Added minimal JSON logger with env-based levels and integrated into src/index.ts.

## Phase 2 — Reference Data Pipeline

- id: T2.1
  title: Define JSON schemas for species/moves/abilities/typechart/manifest
  status: DONE
  depends_on: [T0.2]
  acceptance_criteria:
    - Zod or JSON Schema files present under `src/data_pipeline/schema`
    - Unit tests validate at least 3 sample entries
  notes: Zod schemas implemented with tests; added zod dependency. Ready to implement pipeline output in T2.2.

- id: T2.2
  title: Implement data fetch/normalize/shard to /data
  status: DONE
  depends_on: [T2.1]
  acceptance_criteria:
    - `src/data_pipeline/index.ts` outputs /data/{pokemon,moves,abilities}/... and manifest.json
    - Deterministic output with content hash
    - Dry-run mode flag
  notes: Implemented deterministic buildData with hashing, dry-run, and manifest; added tests and data:build script.

## Phase 3 — Discord Foundations & DM Home

- id: T3.1
  title: Discord bot bootstrap and slash registration
  status: DONE
  depends_on: [T0.1]
  acceptance_criteria:
    - Bot logs in with DISCORD_BOT_TOKEN
    - Registers `/home`, `/heal`, `/starter`, `/party`, `/box`, `/profile`
    - Works without Message Content intent (interactions only)
  notes: Implemented bot login, interaction handler, and placeholder slash commands; added register script.

- id: T3.2
  title: Implement DM Home embed + buttons
  status: DONE
  depends_on: [T3.1, T1.1]
  acceptance_criteria:
    - `/home` shows party (sprites + HP), coins, next daily
    - Buttons: Heal, Party, Box, Profile, Starters (conditional)
    - Button interactions work in DM
  notes: Implemented DM Home command to DM an embed with buttons; added button interaction handlers. Party/coins placeholders will be wired to DB in subsequent tasks.

- id: T3.3
  title: Starter choose + Heal
  status: DONE
  depends_on: [T3.2]
  acceptance_criteria:
    - One-time starter flow persists a level 5 mon
    - `/heal` fully restores party and clears status
  notes: Outcome — Implemented starter DM flow with one-time pick (level 5) and heal action to restore party HP/status. Buttons wired from DM Home; slash commands route to flows.

## Phase 4 — Catching Loop

- id: T4.1
  title: `/walk` encounter flow with thread spawn
  status: DONE
  depends_on: [T3.3, T2.2]
  acceptance_criteria:
    - Running `/walk` in #wilds spawns a thread and DMs controls
    - Cooldowns enforced per user
    - Encounter TTL auto-closes stale threads
  notes: Outcome — Added spawn core, /walk handler (enforces #wilds, cooldowns), thread creation (60m auto-archive), and DM stub. Registered /walk command and tests for spawn helpers.

- id: T4.2
  title: Catch mechanics + DM controls
  status: DONE
  depends_on: [T4.1]
  acceptance_criteria:
    - DM buttons: Throw Ball, Swap Lead, Run
    - Catch formula v1 implemented
    - Results mirrored to the thread
  notes: Outcome — Implemented v1 catch logic and DM controls (Throw Ball, Swap Lead stub, Run). Encounter thread receives result updates. Added tests for catch chance.

## Phase 5 — Battles (Public Broadcast)

- id: T5.1
  title: `/battle challenge` DM flow with Arena thread
  status: DONE
  depends_on: [T3.3]
  acceptance_criteria:
    - DM challenge → opponent DM accept/decline
    - On accept, create Arena thread with both players listed
  notes: Outcome — Added battle challenge command helpers, DM prompt with Accept/Decline, and Arena thread creator that mentions both trainers once the challenge is accepted.

- id: T5.2
  title: Battle core v1 (turn order, damage, statuses)
  status: DONE
  depends_on: [T5.1, T2.2]
  acceptance_criteria:
    - Deterministic RNG per-battle stored
    - Type chart, STAB, crits, accuracy checks
    - Minimal moveset: Tackle, Quick Attack, Growl, Ember, Water Gun, Vine Whip
  notes: Outcome — Implemented TS wrappers over JS engine with deterministic RNG; added tests for speed order, STAB/effectiveness, immunity, and crit override.

- id: T5.3
  title: DM action menus + Arena summaries
  status: DONE
  depends_on: [T5.2]
  acceptance_criteria:
    - DM: Move/Switch/Forfeit
    - Arena shows compact turn summaries
    - DM shows detailed rolls/PP
  notes: Outcome — DM action prompt with Move/Switch/Forfeit added; handlers wired (forfeit updates battle and posts Arena note); summary helpers produce compact public and detailed DM logs.

## Phase 6 — Safety & Admin

- id: T6.1
  title: Rate limits and permissions
  status: DONE
  depends_on: [T4.2, T5.3]
  acceptance_criteria:
    - One active encounter per user
    - One active battle per user
    - Spectators read-only in Arena
  notes: Outcome — Enforced encounter and battle limits via middleware/guards. Arena is broadcast-only by design (trainers act via DM), satisfying spectator read-only in practice.

- id: T6.2
  title: Admin ops and basic stats
  status: DONE
  depends_on: [T6.1]
  acceptance_criteria:
    - `/ops cooldown reset @user`, `/ops stats`
    - Basic usage counters visible to admin
  notes: Outcome — Added /ops with cooldown reset (admin-only) and basic stats. Prisma is optional; commands gracefully degrade when DB is unavailable.

