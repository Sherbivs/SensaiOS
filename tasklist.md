# Tasklist
Last Updated (UTC): 2025-10-25T01:07:00Z
Revision: 0.5

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
  status: READY
  depends_on: [T0.2]
  acceptance_criteria:
    - `src/shared/config.ts` reads env vars with safe defaults
    - `src/shared/log.ts` provides pino-like logger

## Phase 2 — Reference Data Pipeline

- id: T2.1
  title: Define JSON schemas for species/moves/abilities/typechart/manifest
  status: READY
  depends_on: [T0.2]
  acceptance_criteria:
    - Zod or JSON Schema files present under `src/data_pipeline/schema`
    - Unit tests validate at least 3 sample entries

- id: T2.2
  title: Implement data fetch/normalize/shard to /data
  status: READY
  depends_on: [T2.1]
  acceptance_criteria:
    - `src/data_pipeline/index.ts` outputs /data/{pokemon,moves,abilities}/... and manifest.json
    - Deterministic output with content hash
    - Dry-run mode flag

## Phase 3 — Discord Foundations & DM Home

- id: T3.1
  title: Discord bot bootstrap and slash registration
  status: READY
  depends_on: [T0.1]
  acceptance_criteria:
    - Bot logs in with DISCORD_BOT_TOKEN
    - Registers `/home`, `/heal`, `/starter`, `/party`, `/box`, `/profile`
    - Works without Message Content intent (interactions only)

- id: T3.2
  title: Implement DM Home embed + buttons
  status: READY
  depends_on: [T3.1, T1.1]
  acceptance_criteria:
    - `/home` shows party (sprites + HP), coins, next daily
    - Buttons: Heal, Party, Box, Profile, Starters (conditional)
    - Button interactions work in DM

- id: T3.3
  title: Starter choose + Heal
  status: READY
  depends_on: [T3.2]
  acceptance_criteria:
    - One-time starter flow persists a level 5 mon
    - `/heal` fully restores party and clears status

## Phase 4 — Catching Loop

- id: T4.1
  title: `/walk` encounter flow with thread spawn
  status: READY
  depends_on: [T3.3, T2.2]
  acceptance_criteria:
    - Running `/walk` in #wilds spawns a thread and DMs controls
    - Cooldowns enforced per user
    - Encounter TTL auto-closes stale threads

- id: T4.2
  title: Catch mechanics + DM controls
  status: READY
  depends_on: [T4.1]
  acceptance_criteria:
    - DM buttons: Throw Ball, Swap Lead, Run
    - Catch formula v1 implemented
    - Results mirrored to the thread

## Phase 5 — Battles (Public Broadcast)

- id: T5.1
  title: `/battle challenge` DM flow with Arena thread
  status: READY
  depends_on: [T3.3]
  acceptance_criteria:
    - DM challenge → opponent DM accept/decline
    - On accept, create Arena thread with both players listed

- id: T5.2
  title: Battle core v1 (turn order, damage, statuses)
  status: READY
  depends_on: [T5.1, T2.2]
  acceptance_criteria:
    - Deterministic RNG per-battle stored
    - Type chart, STAB, crits, accuracy checks
    - Minimal moveset: Tackle, Quick Attack, Growl, Ember, Water Gun, Vine Whip

- id: T5.3
  title: DM action menus + Arena summaries
  status: READY
  depends_on: [T5.2]
  acceptance_criteria:
    - DM: Move/Switch/Forfeit
    - Arena shows compact turn summaries
    - DM shows detailed rolls/PP

## Phase 6 — Safety & Admin

- id: T6.1
  title: Rate limits and permissions
  status: READY
  depends_on: [T4.2, T5.3]
  acceptance_criteria:
    - One active encounter per user
    - One active battle per user
    - Spectators read-only in Arena

- id: T6.2
  title: Admin ops and basic stats
  status: READY
  depends_on: [T6.1]
  acceptance_criteria:
    - `/ops cooldown reset @user`, `/ops stats`
    - Basic usage counters visible to admin

