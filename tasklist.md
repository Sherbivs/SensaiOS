# Tasklist

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

- id: T0.3
  title: Add Prompt.md environment scaffold
  status: DONE
  depends_on: []
  acceptance_criteria:
    - Create root-level Prompt.md capturing purpose, objectives, deliverables, constraints, and discovery questionnaire
    - Include output structure, feedback loop, example prompts, and acceptance criteria
    - Optional project hints tailored to this repo (Node.js + TS, Postgres, Render, Discord bot)
  notes: Prompt.md added and referenced in ops/CRITICAL.md as a contextual doc.

## Phase 1 — Render & DB

- id: T1.1
  title: Add DB schema with Prisma/Drizzle
  status: READY
  depends_on: [T0.2]
  acceptance_criteria:
    - Models: users, pokemon_instances, parties, party_slots, encounters, battles, cooldowns
    - Migration file generated
    - Basic repo methods scaffolded (create/read)

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

