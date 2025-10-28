# Tasklist
Last Updated (UTC): 2025-10-28T23:20:00Z
Revision: 1.81
<!-- # TASKLIST UPDATE -->

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

- id: META.UNBLOCK.READY_SEED
  title: Seed an immediate READY task after meta-only or all-busy states
  status: DONE
  depends_on: []
  acceptance_criteria:
    - When NEXT is NONE or all tasks are IN_PROGRESS/DONE, a minimal READY task exists to re-prime the engine.
    - guard-meta emits guidance in CI logs when no READY tasks are present.
    - Prompt.md “Last Repo Changes” records the seed action when triggered.
  notes: Outcome — Guard script now surfaces an error when no READY tasks are present; NEXT retargeted so the safety-net follow-up is ready.

- id: META.NO_READY.SAFETY_NET
  title: Add CI/guard to prevent "no READY tasks" states
  status: DONE
  depends_on: [META.UNBLOCK.READY_SEED]
  acceptance_criteria:
    - .github/workflows/guard-meta.yml fails when Tasklist.md has 0 READY tasks (excluding META.UNBLOCK.READY_SEED).
    - scripts/guard_meta.sh suggests the oldest eligible PROPOSED task to flip to READY.
    - ops/NEXT.yaml is suggested (in logs) to point at that READY task.
    - Patch.md documents this invariant and quick remediation steps.
  notes: Outcome — guard_meta now fails when only the seed task remains READY, surfaces the oldest eligible PROPOSED task, and nudges NEXT to track the promoted work.

- id: META.READY.ABSOLUTE
  title: Harden readiness with preflight/postflight and auto-promotion
  status: DONE
  depends_on: [META.NO_READY.SAFETY_NET]
  acceptance_criteria:
    - Preflight promotes an eligible PROPOSED or injects a seed when READY is empty.
    - Postflight refuses to exit with NEXT at NONE; guard fails the run.
    - Prompt.md echo documents the readiness policy change in plain text.
  notes: Outcome — “no READY task” states are self-healing at runtime and impossible to merge in CI.
- id: META.CONTRACTS.SWITCH
  title: Add human override switch and legacy layout bridge
  status: DONE
  depends_on: [META.READY.ABSOLUTE]
  acceptance_criteria:
    - Patch.md defines the Patch Clipboard, Marker Switch, Absolutes, and updated pre/postflight guardrails.
    - Patch-Template.md mirrors the legacy layout with plain-text instructions and a marker reminder.
    - CRITICAL/HOTFIX/Prompt document the override; guard_meta respects the marker while enforcing Absolutes.
    - NEXT, TOUCHMAP, masterroutetable, and RECOVERY capture Markerless Mode expectations.
  notes: Outcome — Marker switch landed with guard updates; Prompt, NEXT, and recovery metadata now record Contracts ON/OFF while guard_meta enforces Absolutes even in Markerless runs.
- id: META.CONTRACTS.CLIPBOARD_BOTTOM
  title: Move Patch Clipboard guidance to contract footer
  status: DONE
  depends_on: [META.CONTRACTS.SWITCH]
  acceptance_criteria:
    - Patch.md relocates the Patch Clipboard section to the final section without losing marker guidance.
    - Prompt.md Last Repo Changes and PATCHSET Echo record the relocation for auditors.
    - ops/TOUCHMAP.yaml maps the task to Patch.md so future editors know where to touch.
  notes: Outcome — Clipboard instructions now live at the bottom of Patch.md; meta docs updated and NEXT retargeted to queue maintenance.
- id: META.HOTFIX.TRIGGER_SUFFIX
  title: Support hotfix trigger notes after the colon
  status: DONE
  depends_on: [META.CONTRACTS.CLIPBOARD_BOTTOM]
  acceptance_criteria:
    - Patch.md and ops/HOTFIX.md document that `ACTIVATE: HOTFIX ENGINE` may carry a trailing `: <note>` while preserving the exact prefix.
    - Prompt.md and ops/TOUCHMAP.yaml record the update so future workers follow the revised trigger guidance.
    - ops/NEXT.yaml timestamp/note refreshed to capture the documentation change.
  notes: Outcome — Hotfix trigger now accepts an optional human-context note without breaking the deterministic prefix; meta routing docs updated accordingly.
- id: META.REPO.RESTORE_STRUCTURE
  title: Clean stale meta docs and restore guard workflows
  status: DONE
  depends_on: [META.READY.ABSOLUTE]
  acceptance_criteria:
    - Remove outdated duplicate meta files and move canonical docs back under ops/.
    - Reinstate documentation/data/router guard workflows under .github/workflows/.
    - Refresh Patch.md, Patch-Template.md, and Prompt.md so the operating loop and PATCHSET template are readable.
  notes: Outcome — Repository meta surface is orderly again; workers follow the restored contract and CI guards protect critical docs.


- id: META.REFRESH.RETIRE
  title: Retire Refresh Vision requirement and reinforce meta doc visibility check
  status: DONE
  depends_on: [META.NO_READY.SAFETY_NET]
  acceptance_criteria:
    - Patch.md no longer mandates running scripts/refresh_vision.sh and instead requires verifying access to Patch.md, Tasklist.md, and Prompt.md before planning.
    - Prompt.md Activation Internals and Last Repo Changes mirror the new workflow and fallback guidance.
    - ops/CRITICAL.md replaces the Refresh Vision phase with the meta visibility reminder.
  notes: Outcome — Contract now focuses on ensuring key meta docs are readable instead of running Refresh Vision; Prompt/CRITICAL updated accordingly.

- id: META.PROMPT.PATCHSET_TEMPLATE
  title: Enforce plain-text PATCHSET template in Prompt echo
  status: DONE
  depends_on: [META.REFRESH.RETIRE]
  acceptance_criteria:
    - Patch.md documents the exact plain-text PATCHSET template the AI must copy into Prompt.md.
    - Guidance explicitly forbids embedding objects/JSON and requires spacing/headings to stay fixed.
    - Prompt.md Revision History captures the policy change.
  notes: Outcome — Contract now mandates copying the plain-text template verbatim when drafting or echoing PATCHSETs inside Prompt.

- id: META.READY_QUEUE.NEXT_TASK
  title: Promote a substantive work item and retarget NEXT
  status: DONE
  depends_on: []
  acceptance_criteria:
    - Select the first eligible PROPOSED task whose dependencies are DONE and flip it to READY.
    - Update `ops/NEXT.yaml` `next_task_id` to the selected task and keep `files_hint` minimal.
    - Update `Prompt.md` echo with a one-paragraph summary of the promotion rationale.
  notes: Outcome — Promoted META.RENDER.DB_URL_FIX into the queue and retargeted NEXT to T8.4 once the database hardening work landed.

- id: META.TASKLIST.COUPLING_FIX
  title: Enforce Tasklist updates from every PATCHSET and rewire guards
  status: DONE
  depends_on: [T0.META.ENFORCE]
  acceptance_criteria:
    - Patch.md OPERATING LOOP step "Update Tasklist" is explicitly referenced by guard checks.
    - CI workflow `.github/workflows/guard-meta.yml` verifies that any non-doc change includes a `# TASKLIST UPDATE` diff.
    - `scripts/guard_meta.sh` exits nonzero when a PATCHSET lacks a Tasklist diff while touching `src/**` or `tests/**`.
    - Prompt.md Embedded PATCHSET Echo includes a boolean note indicating whether a Tasklist diff was present.
  notes: Outcome — Guard workflow/script enforce Tasklist diffs on code patches; Patch/Prompt/NEXT updated for continued flow.

- id: META.NEXT.BOOTSTRAP
  title: Auto-bootstrap NEXT when NONE by queueing first READY meta task
  status: DONE
  depends_on: [META.TASKLIST.COUPLING_FIX]
  acceptance_criteria:
    - `ops/NEXT.yaml` gains guidance/comments for bootstrapping when `next_task_id: NONE`.
    - Optional key `auto_requeue_if_none: true` supported by guard scripts (advisory).
    - If NONE and at least one READY task exists, guard suggests (but does not auto-commit) setting `next_task_id` to the first READY task.
  notes: Outcome — NEXT.yaml now documents how to recover from NONE, guard_meta.sh surfaces the first READY task, and auto_requeue hints stay active.

- id: META.RECOVERY.REPLAY
  title: Recovery résumé: remember last attempted task and resume safely
  status: DONE
  depends_on: [META.TASKLIST.COUPLING_FIX]
  acceptance_criteria:
    - `ops/RECOVERY.yaml` stores `last_attempted_task_id` and `last_attempted_ts` on trigger.
    - On trigger, engine prefers RECOVERY task if compatible with NEXT pointer.
    - Documented in Patch.md “Refresh Vision”/Activation section with guidance for using recovery hints.
  notes: Outcome — Refresh Vision now writes last_attempted metadata and the contract directs workers to resume via ops/RECOVERY.yaml before selecting new tasks.

- id: META.TASK.HOUSEKEEP
  title: Trim historical DONE tasks to last 100 (archive elsewhere)
  status: DONE
  depends_on: [META.RECOVERY.REPLAY, META.TASKLIST.COUPLING_FIX]
  acceptance_criteria:
    - Tasklist.md retains only the most recent 100 DONE entries; older entries moved to `ops/ARCHIVE/tasks-YYYYMMDD.md` by a script.
    - Patch.md notes this policy; CI allows presence/absence of archive file.
  notes: Outcome — Added `scripts/archive_task_history.mjs`, documented the 100-DONE limit, and wired `npm run tasks:archive`. No entries exceeded the threshold yet, so Tasklist currently retains all DONE tasks.

- id: META.README.REFRESH
  title: Refresh README to match the Infinity Gauntlet architecture
  status: DONE
  depends_on: [META.TASKLIST.COUPLING_FIX]
  acceptance_criteria:
    - README.md explains the TypeScript Pokémon suite (DM home, Wilds, Arena, workers, data pipeline).
    - Setup instructions cover prerequisites, environment variables, scripts, and deployment basics.
    - Legacy JavaScript bots are clearly marked as historical context.
  notes: Outcome — README now describes the current Infinity Gauntlet stack, scripts, and operational workflow; legacy security bot text removed.

- id: META.README.REFRESH2
  title: Refresh README with current status and roadmap
  status: DONE
  depends_on: [META.README.REFRESH]
  acceptance_criteria:
    - README documents the live project status, architecture snapshot, and roadmap milestones.
    - Development, deployment, and operational guardrail guidance is up to date.
    - Tasklist.md and Prompt.md metadata reflect the refresh.
  notes: Outcome — README now captures status/goals, architecture snapshot, dev workflow, ops guardrails, and roadmap highlights.

- id: META.REFRESH_VISION.REMOTE
  title: Add remote reachability & recovery stamps to Refresh Vision
  status: DONE
  depends_on: [META.RECOVERY.REPLAY]
  acceptance_criteria:
    - scripts/refresh_vision.sh verifies GitHub remote visibility (sherbivs/Infinity-Gauntlet) and captures remote HEAD (best effort).
    - ops/RECOVERY.yaml records last_refresh_utc, remote/local HEAD data, remote URL, and preserves last_attempted task metadata.
    - Prompt.md Activation Internals mention the remote check and the fallback message when shell execution is unavailable.
  notes: Outcome — Refresh Vision now validates the GitHub remote, stamps recovery metadata, and documents the VFS fallback guidance.

- id: META.PROMPT.FALLBACK
  title: Clarify Refresh Vision fallback without embedding conversation
  status: DONE
  depends_on: [META.REFRESH_VISION.REMOTE]
  acceptance_criteria:
    - Prompt.md Activation Internals describes the restricted-environment fallback in directive form without embedding chat transcript formatting.
    - Prompt.md Last Repo Changes note the adjustment.
  notes: Outcome — Activation guidance now instructs workers how to report Refresh Vision limitations without reproducing conversational markup.

- id: META.NEXT.SEED
  title: Seed persistence-integration backlog and repoint NEXT
  status: DONE
  depends_on: [META.PROMPT.FALLBACK]
  acceptance_criteria:
    - Tasklist.md adds Phase 7 persistence tasks with at least one READY item and supporting PROPOSED follow-ups.
    - ops/NEXT.yaml points to the new READY task with trimmed files_hint and rationale.
    - Prompt.md documents the backlog seeding under Last Repo Changes and Revision History.
  notes: Outcome — Persistence-focused tasks are staged with NEXT targeting the first READY item so the loop can resume without manual triage.

- id: META.RUNTIME.BLUEPRINT_APPLY
  title: Apply unified runtime/config + cache + Render DB wiring
  status: DONE
  depends_on: []
  acceptance_criteria:
    - `src/shared/config.ts` promotes Render’s internal database URL, forbids localhost hosts in production, and exposes cache/runtime fields.
    - Prisma client is centralized (`src/shared/prisma.ts`) with early `$connect()` and shared logging; legacy model helpers reuse it.
    - Render worker (`src/worker/backup.ts`) drains `OutboxMessage` rows with jittered polling, structured health logs, and a TTL cache fallback.
    - `/ops stats` surfaces runtime, database, cache, and outbox diagnostics; Vitest covers config, outbox helpers, and the command output.
    - CI guard + workflow block localhost DATABASE_URL usage in production and assert the Render worker sources its connection string from the managed Postgres.
  notes: Outcome — Runtime blueprint landed with shared config, Prisma bootstrap, Render worker, and guard/test coverage; docs and routers updated accordingly.

- id: META.RUNTIME.BACKUP_SINK
  title: Replace console backup sink with persistent storage
  status: PROPOSED
  depends_on: [META.RUNTIME.BLUEPRINT_APPLY]
  acceptance_criteria:
    - Outbox worker writes processed payloads to durable storage (e.g., S3, Cloudflare R2) instead of logging placeholders.
    - Secrets/configuration for the chosen storage provider are documented and guarded in Render.
    - `/ops stats` and worker health logs surface the new sink status and last successful upload timestamp.
  notes: Proposed — follow-up to swap the placeholder console sink with real backup storage once the runtime blueprint stabilizes.

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

- id: META.ROUTER_FMT
  title: Normalize router docs encoding and regenerate router index
  status: DONE
  depends_on: [META.HARD_ROUTE]
  acceptance_criteria:
    - All ROUTER.md files use LF endings without mojibake characters
    - Router metadata timestamps updated to reflect the cleanup
    - ops/ROUTER_INDEX.yaml regenerated from cleaned router docs
  notes: Outcome — Router docs render cleanly and the generated index has canonical quoting.

- id: META.ROUTER.NAME_GUARD
  title: Enforce exact-name/case across routers & references
  status: DONE
  depends_on: [META.HARD_ROUTE, T0.GUARD_FILENAMES]
  acceptance_criteria:
    - ops/CANONICAL_NAMES.yaml lists canonical spellings/case.
    - scripts/verify_router_links.sh fails when ROUTER_INDEX.yaml or canonical names point to missing/mis-cased paths and hints the nearest match.
    - .github/workflows/guard-router.yml runs the guard on push/PR.
    - Patch.md documents the mandatory Name/Case rule.
  notes: Outcome — Canonical manifest + CI guard keep router/index references case-accurate; Prompt/Tasklist capture the change.

- id: META.ROUTER.REFRESH_20251027
  title: Refresh router docs after PBSL oracle and DRIP alerts
  status: DONE
  depends_on: [META.ROUTER.NAME_GUARD]
  acceptance_criteria:
    - ops/ROUTER.yaml updated_utc and categories capture newly added PBSL documentation.
    - ops/ROUTER_INDEX.yaml and masterroutetable.md reflect the refreshed timestamps and router summaries.
    - Router markdowns (ops, src/bot, src/core, tests) mention PBSL oracle fixtures and DRIP role alerts.
  notes: Outcome — Router map, index, and master table now note PBSL oracle fixtures plus DRIP role assignment alerts with synchronized timestamps across metadata.
- id: META.ROUTER.AUDIT_20251027
  title: Audit meta routers after PBSL oracle refresh
  status: DONE
  depends_on: [META.ROUTER.REFRESH_20251027]
  acceptance_criteria:
    - Confirm router indexes and tables regenerate with PBSL oracle fixture and DRIP alert context.
    - Ensure scripts/ROUTER.md and tests/ROUTER.md document supporting guard scripts and oracle diff coverage.
    - Record the audit outcome in Prompt.md and keep NEXT targeting T8.4 once complete.
  notes: Outcome — Router index, master table, and downstream routers now record PBSL oracle fixture coverage plus DRIP role alerts; audit logged in Prompt with NEXT retargeted to T8.4.

- id: T8.3
  title: Add daily quest claim flow and rewards
  status: DONE
  depends_on: [T8.2]
  acceptance_criteria:
    - Provide a DM control or slash command that claims the daily quest, increments the streak via `recordDailyQuestCompletion`, and awards configured coins.
    - Claiming enforces the daily cooldown, reusing the existing cooldown table and messaging the next availability.
    - Tests cover successful claim, cooldown-blocked attempts, and streak increment wiring.
  notes: Outcome — `/daily claim` registers via slash, routes to `handleDailyClaim`, grants coins, bumps streaks, and enforces a 24h cooldown with coverage for success + cooldown blocks.

- id: T8.4
  title: Add DM Home button to claim daily quest
  status: READY
  depends_on: [T8.3]
  acceptance_criteria:
    - DM Home embed includes a “Claim Daily” button that calls the new handler without leaving DMs.
    - Button reflects cooldown state (disabled or messaging) after pressing, surfacing streak/cooldown feedback inline.
    - Tests cover button wiring, cooldown-block messaging, and streak display updates.
  notes: Extends the progression loop so trainers can claim the daily reward from Home without slash commands, piggybacking on the new handler.

## Phase 9 — PBSL Alignment

- id: PBSL.SKELETON
  title: Scaffold PBSL RNG, audit, battle, and encounter primitives
  status: DONE
  depends_on: []
  acceptance_criteria:
    - Introduce `src/core/pbsl/**` with seeded RNG, audit trail, battle phase ordering, and encounter generator exports.
    - Add `docs/PBSL.md` documenting the official statement, truth hierarchy, and compliance checklist.
    - Provide Vitest coverage under `tests/pbsl/**` and run them via a dedicated `npm run test:pbsl` script.
    - Wire a PBSL GitHub Action that runs linting and the focused test suite.
  notes: Outcome — PBSL scaffolding now lives under `src/core/pbsl/**` with deterministic RNG, audit events, encounter helpers, provenance metadata, and CI coverage.

- id: PBSL.ORACLE_DIFF
  title: Add oracle comparison tests for PBSL core loops
  status: DONE
  depends_on: [PBSL.SKELETON]
  acceptance_criteria:
    - Fetch curated battle fixtures from upstream (e.g., `pkmn/engine`) and store them under `tests/pbsl/fixtures/` with provenance metadata.
    - Run comparison tests that diff PBSL outcomes against upstream engines in CI.
    - Update `docs/PBSL.md` checklist and `Prompt.md` Last Repo Changes to reflect oracle coverage.
  notes: Outcome — Added curated fixtures with provenance, layered an oracle diff Vitest suite plus JSON report, marked the docs checklist complete, and taught the workflow to publish the report when regressions surface.

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
    - Prompt.md created at repo root with purpose, objectives, deliverables, constraints, and discovery questionnaire
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
- id: T6.3
  title: Send DRIP alerts when member roles change
  status: DONE
  depends_on: [T6.2]
  acceptance_criteria:
    - Security bot emits a DRIP alert whenever a member gains new roles, capturing the role names and member identity.
    - Alert metadata includes previous roles and the assigning user when audit logs are accessible, falling back gracefully when unavailable.
    - Activity tracker/CLI telemetry update without breaking the automatic Trainer reassignment flow.
  notes: Outcome — Security bot now diffs member roles, looks up audit logs for the assigner, and sends immediate DRIP security alerts with structured metadata while keeping Trainer auto-heal behaviour intact.

## Phase 7 — Meta & Router Hardening

- id: META.HOTFIX.SYSTEM
  title: Introduce no-PATCHSET Hotfix Engine and guards
  status: DONE
  depends_on: [META.ROUTER.NAME_GUARD]
  acceptance_criteria:
    - ops/HOTFIX.md documents trigger, loop, and guardrails
    - ops/HOTFIX_PLAN.yaml exists with hotfix_task_id and files_hint
    - guard_meta recognizes Hotfix mode (PATCHSET Echo optional)
    - Prompt/Tasklist updates are still mandatory in Hotfix commits
  notes: Outcome — Fast, disciplined hotfix path without PATCHSET ceremony.

- id: HF.BROKEN.TASKFLOW
  title: Fix “no READY tasks” bootstrap by ensuring a hotfix pointer can create/ready tasks
  status: DONE
  depends_on: [META.HOTFIX.SYSTEM]
  acceptance_criteria:
    - Hotfix flow can add a minimal READY task when Tasklist is empty/all DONE
    - Prompt “Last Repo Changes” reflects the hotfix outcome
    - RECOVERY stamped with last_hotfix_id & timestamp
  notes: Outcome — ops/HOTFIX.md and ops/HOTFIX_PLAN.yaml now document a bootstrap template so the hotfix engine can seed a READY HF.* task when the graph was empty; NEXT/RECOVERY reset accordingly.

- id: HF.20251026.PATCH_ECHO_MD
  title: Clarify PATCHSET Echo markdown formatting
  status: DONE
  depends_on: [META.HOTFIX.SYSTEM]
  acceptance_criteria:
    - Patch.md explicitly states the Embedded PATCHSET Echo must use Markdown list markers.
    - Prompt.md echo block for the latest change uses Markdown bullet formatting.
  notes: Outcome — Hotfix updated Patch.md guidance and Prompt.md implementation so audit echoes stay consistently formatted.

- id: HF.20251026.AUTO_HOTFIX_DEFAULT
  title: Default to Hotfix Engine when no trigger specified
  status: DONE
  depends_on: [META.HOTFIX.SYSTEM]
  acceptance_criteria:
    - Patch.md states that absent an explicit activation trigger, requests are treated as hotfix operations.
    - Prompt.md revision documents the contract change.
    - Hotfix metadata (ops/HOTFIX_PLAN.yaml, ops/RECOVERY.yaml) logs completion.
  notes: Outcome — Contract now instructs future AIs to assume Hotfix Engine for triggerless human requests, ensuring minimal-scope edits by default.

- id: HF.20251026.PLAIN_ECHO_TEXT
  title: Require plain text formatting inside PATCHSET echo
  status: DONE
  depends_on: [META.HOTFIX.SYSTEM]
  acceptance_criteria:
    - Patch.md specifies that the echo should avoid Markdown list markers and remain plain text.
    - Prompt.md echo block reflects the plain text format.
    - Hotfix metadata files record completion of this change.
  notes: Outcome — Echo guidance now prevents markdown embedding issues by requiring simple sentences without bullet markers.

- id: HF.20251026.ECHO_DIALOG_PLAIN
  title: Expand PATCHSET echo narration while keeping plain-text format
  status: DONE
  depends_on: [HF.20251026.PLAIN_ECHO_TEXT]
  acceptance_criteria:
    - Prompt.md echo block uses sentence-form change summaries that mirror patchset structure without embedding file objects.
    - Tasklist.md and ops/RECOVERY.yaml capture the hotfix completion details.
    - Hotfix plan pointer references the new hotfix and touched files only.
  notes: Outcome — Prompt echo now reads as a multi-sentence patchset recap without embedding file objects; Tasklist, Hotfix plan, and Recovery ledger log the update.

- id: META.RENDER.DB_URL_FIX
  title: Make Prisma use Render’s internal DB URL and harden worker boot
  status: DONE
  depends_on: []
  acceptance_criteria:
    - render.yaml sets DATABASE_URL fromDatabase.connectionString for all services (web + worker).
    - Prisma always receives a nonempty DATABASE_URL at boot; $connect() succeeds when the DB is reachable.
    - No use of $queryRawUnsafe for liveness checks.
    - CI guard fails when DATABASE_URL mapping is missing or when Prisma is imported before env/ensure-db-url.
  notes: Outcome — Added env preloader, Prisma init guard, Render YAML mapping, README guidance, and CI scripts/workflows so Render deployments keep DATABASE_URL aligned with the internal connection string.

- id: HF.20251026.DB_URL_HOST_OVERRIDE
  title: Override localhost DATABASE_URL with managed connection string
  status: DONE
  depends_on: [META.RENDER.DB_URL_FIX]
  acceptance_criteria:
    - env preloader detects localhost candidates and prefers non-local fallbacks (internal connection string) even when DATABASE_URL is already set.
    - Structured logging reports overrides and warns when production services still resolve to localhost.
    - Render production logs confirm DATABASE_URL source resolves to the managed connection string instead of localhost.
  notes: Outcome — Hotfix teaches ensure-db-url.ts to replace localhost values with Render’s connection string and emit guidance when production services still fall back to localhost.

- id: HF.20251026.MASTER_ROUTE_TABLE
  title: Expand master route reference with full replication hierarchy
  status: DONE
  depends_on: [HF.20251026.ECHO_DIALOG_PLAIN]
  acceptance_criteria:
    - masterroutetable.md lists every router-of-routers entry and its downstream routers.
    - Each router entry includes referenced ROUTER.md files and primary paths covered.
    - Tasklist.md and Prompt.md metadata reflect the hotfix completion.
  notes: Outcome — Master Router Table now details router-of-routers mappings plus router-owned files/areas so hotfix navigation works without automation.

- id: HOTFIX:SETUP.ROUTER_TABLE
  title: Scaffold master router table stub for hotfix readiness
  status: DONE
  depends_on: []
  acceptance_criteria:
    - masterroutetable.md exists with a minimal list of active router files.
    - Tasklist captures the stub so future workers know it was created during a hotfix.
  notes: Outcome — Created masterroutetable.md with current router list and guidance to regenerate via docs:update-routers.

- id: HOTFIX.ROUTER.DOC
  title: Map Standardized Pokemon Game Logic doc into router metadata
  status: DONE
  depends_on: [HOTFIX:SETUP.ROUTER_TABLE]
  acceptance_criteria:
    - ops/ROUTER.yaml references discord-pokemon-bot/data/standized_pokemon_game_logic.md under infra docs.
    - Prompt Last Repo Changes log the hotfix and router update.
    - RECOVERY hotfix fields stamped for traceability.
  notes: Outcome — Router now tracks the Standardized game-logic reference doc; Prompt/Recovery updated during the hotfix.

## Phase 7 — Persistence Integration

- id: T7.1
  title: Wire DM Home to Prisma persistence
  status: DONE
  depends_on: [T3.2, T3.3, T1.1]
  acceptance_criteria:
    - DM `/home` resolves trainer profile, coins, and party slots from Prisma rather than placeholder stubs.
    - Empty-trainer bootstrap path creates a starter-friendly baseline (coins, party slots) without crashing; log guidance for operators when data is missing.
    - Unit tests or integration tests cover at least one trainer with stored Pokémon to ensure embeds render correctly with DB data.
  notes: Outcome — `/home` now loads trainers from Prisma, bootstraps missing rows with starter coins + empty parties, logs guidance when no Pokémon exist, and ships tests exercising persisted party rendering.

- id: T7.2
  title: Persist wild encounter capture results
  status: DONE
  depends_on: [T4.2, T1.1]
  acceptance_criteria:
    - Choosing "Throw Ball" during an encounter writes the new Pokémon instance to Prisma with ownership metadata.
    - Encounter threads and DM summaries reflect the captured Pokémon ID from storage.
    - Tests confirm captured Pokémon persist and survive subsequent Refresh Vision cycles.
  notes: Outcome — Persistence now stores caught Pokémon IDs on the encounter, DM/thread messages show the stored ID, and a Vitest stub validates Prisma writes + encounter metadata updates.

- id: T7.3
  title: Store battle outcomes and rewards
  status: DONE
  depends_on: [T5.3, T1.1]
  acceptance_criteria:
    - Battle conclusion writes winner/loser, turn count, and rewards to Prisma tables.
    - DM summaries reference stored results; arena thread posts include reward overview.
    - Tests validate at least one stored battle record and reward distribution.
  notes: Outcome — BattleRepo now persists results + coin rewards, shared announcer DM/thread updates run off stored data, and Vitest covers reward increments + forfeit handler wiring.

- id: META.BACKLOG.T7.NEXT
  title: Plan post-T7.3 persistence backlog and repoint NEXT
  status: DONE
  depends_on: [T7.3]
  acceptance_criteria:
    - Document follow-up battle persistence tasks (victory flow, reporting) in Tasklist.
    - At least one newly-added task is set to READY with clear files and dependencies.
    - ops/NEXT.yaml updated to target the READY task with rationale and files_hint.
  notes: Outcome — Added T7.4 (victory persistence) and T7.5 (results reporting); NEXT now points at T7.4.

- id: T7.4
  title: Persist standard battle victories via BattleRepo
  status: DONE
  depends_on: [T7.3]
  acceptance_criteria:
    - Non-forfeit battle conclusions call BattleRepo.concludeBattle with real turn counts and full logs.
    - Arena thread and DM announcements reuse the stored result payload for victory cases.
    - Tests cover a scripted victory path persisting rewards and messaging.
  notes: Outcome — `concludeBattleWithVictory` loads active battles, persists via BattleRepo with turn logs, and reuses the stored result for DM/Arena announcements; Vitest covers the flow.

- id: T7.5
  title: Surface recent battle results to admins
  status: DONE
  depends_on: [T7.4]
  acceptance_criteria:
    - `/ops stats` (or a sibling subcommand) lists at least the five most recent finished battles with winner/loser + rewards.
    - Query handles empty history gracefully and reuses stored resultJson.
    - Tests exercise admin reporting with mocked Prisma data.
  notes: Outcome — `/ops stats` now surfaces recent battles (winner/loser, rewards, turn count) using persisted results with Prisma-backed helpers; Vitest mocks Prisma for coverage.

- id: T7.6
  title: Add filtering controls to admin battle summaries
  status: DONE
  depends_on: [T7.5]
  acceptance_criteria:
    - `/ops stats` accepts an optional limit (1-20) and after-date filter to refine history.
    - Report header includes total finished battle count and selected window.
    - Tests cover filtered results and empty-window cases with mocked Prisma data.
  notes: Outcome — Admin stats now validate limit/after filters, show total finished battles, and Vitest covers filtered + empty-window + no-DB paths.

- id: T7.7
  title: Add participant filter to admin battle summaries
  status: DONE
  depends_on: [T7.6]
  acceptance_criteria:
    - `/ops stats` accepts an optional participant (Discord ID or mention) to show only battles involving that trainer.
    - Report header clarifies the participant scope and handles no-match messaging.
    - Tests cover filtering when the specified trainer wins, loses, or has no results.
  notes: Outcome — `/ops stats` now validates participant mentions/IDs, scopes headers + empty messaging, updates command registration, and Vitest covers mention filtering, invalid input, and no-result cases.

## Phase 8 — Player Progression

- id: T8.1
  title: Surface recent battle history on DM Home using persisted data
  status: DONE
  depends_on: [T7.5, T7.7]
  acceptance_criteria:
    - DM `/home` embed includes a battle history section listing the last three finished battles for the trainer with win/loss outcome and rewards.
    - If a trainer has no finished battles, the embed displays a friendly placeholder message instead of the history section.
    - Tests cover DM Home rendering with populated battle history and the empty-state branch using persisted results.
  notes: Outcome — DM Home now renders the last three finished battles with win/loss badges, coin rewards, and turn counts; placeholder messaging covers trainers without history and Vitest asserts both branches.

- id: T8.2
  title: Track trainer daily quest streaks and show them in DM Home
  status: DONE
  depends_on: [T7.1]
  acceptance_criteria:
    - Data model stores quest streak metadata for trainers with increment/reset logic.
    - DM `/home` embed exposes streak status and outlines how to regain the streak when it resets.
    - Tests cover streak increment, reset, and DM Home display updates.
  notes: Outcome — Prisma schema and model helpers manage streak increments/resets; DM Home now surfaces streak messaging with new tests covering active, reset, and display states.

- id: T8.4
  title: Add DM Home daily claim button tied to streak cooldowns
  status: PROPOSED
  depends_on: [T8.2]
  acceptance_criteria:
    - DM `/home` embed includes a button leading to the daily quest claim interaction when cooldown permits.
    - Button state reflects cooldown readiness and disables when the streak reset requires manual action.
    - Tests cover enabled/disabled button states and the link to the daily claim handler.
  notes: Proposed — Ready to wire once daily streak data stabilizes in production; meta pointer previously referenced this task.

## Phase 10 — Scalability Foundations

- id: T10.SCALE.DATA_INDEX
  title: Harden data model indexing for growth
  status: DONE
  depends_on: [T7.7, T8.2]
  acceptance_criteria:
    - Audit Prisma models and migrations for heavy-read/write tables, adding composite or partial indexes where query plans need them (trainers, battles, cooldowns, encounter logs).
    - Generate a forward-only migration that introduces the new indexes without dropping existing ones or blocking hot paths.
    - Document the index coverage and maintenance plan in `DATA-SCHEMA.md` (or sibling ops doc) with notes on expected row growth and vacuum strategy.
  notes: Outcome — Added Prisma indexes for encounters, battles, parties, Pokémon ownership, and promoted cooldowns to a compound unique key; shipped migration `202510280500_scaling_indexes` and documented maintenance guidance in DATA-SCHEMA.md.

- id: T10.SCALE.WORKERS
  title: Separate background workers for horizontal scaling
  status: DONE
  depends_on: [T10.SCALE.DATA_INDEX]
  acceptance_criteria:
    - Split continuous sweeps, cache refreshes, and data pipeline jobs into dedicated worker entry points with independent concurrency/env tuning.
    - Render (or equivalent) deployment config reflects the separation with per-worker scaling knobs and health telemetry.
    - Update ROUTER docs and ops playbooks to clarify which queues/tasks each worker owns and how to roll them independently.
  notes: Outcome — Worker runtime helpers power outbox/cache/data pipeline entries, render.yaml runs dedicated services, ENABLE_CONTINUOUS_SWEEP now gates security sweeps, and ops/router docs document the split.

- id: T10.SCALE.DB_BOOTSTRAP
  title: Bring staging DB to baseline before applying forward-only index migrations
  status: DONE
  depends_on: [T10.SCALE.DATA_INDEX]
  acceptance_criteria:
    - Staging database has baseline tables and `_prisma_migrations` entries so `npx prisma migrate deploy` can apply forward-only index migrations.
    - A safe runbook is available at `ops/DB_BOOTSTRAP.md` and a helper script `scripts/bootstrap_staging_db.ps1` exists for operators.
    - After applying the baseline, `npx prisma migrate deploy` succeeds and the index migration `202510280500_scaling_indexes` is applied.
  notes: Outcome — runtime now prefers pooled URLs with direct fallbacks, Prisma connect retries are tunable, README/agent/runbook document the bootstrap flow, and staging migrate deploy verified `202510280500_scaling_indexes` via `/ops stats`, DM Home battle history, and daily cooldown checks.

- id: T10.SCALE.OBS
  title: Expand observability and guardrails for scaling
  status: READY
  depends_on: [T10.SCALE.WORKERS]
  acceptance_criteria:
    - Extend structured logging/metrics to include storage, sweep cadence, and queue depth per worker, forwarding critical alerts to the security/ops channels.
    - Add automated health checks or dashboards (Grafana, Render metrics, etc.) with documented thresholds and escalation paths in `OPERATIONS.md`.
    - Update Prompt.md PATCHSET echo template or ops guides to require observability notes whenever scaling-affecting changes land.
  notes: |
    Priority focus — instrument `runWorker` and each dedicated worker entry to emit queue depth, sweep cadence, and failure counters, then wire alerts into security/ops channels. Document the thresholds in OPERATIONS.md and require Prompt echoes to flag observability work before traffic ramps.

- id: T10.SCALE.LOAD_TEST
  title: Schedule post-split load test / game-night dry run
  status: PROPOSED
  depends_on: [T10.SCALE.OBS]
  acceptance_criteria:
    - Coordinate a load test or “game-night” dry run after observability instrumentation lands, capturing responsible owners and timing in OPERATIONS.md.
    - Define success thresholds (queue depth, sweep cadence, response latency) aligned with the new telemetry and document rollback steps if metrics regress.
    - Record outcomes and follow-up actions in Prompt.md Last Repo Changes and Tasklist notes after execution.
  notes: Proposed follow-up to validate worker split efficiency once telemetry and alerting are live; align scheduling with ops coverage and Render availability.

## Phase 11 — Meta & AI Enablement

- id: META.ROUTER.20251028
  title: Refresh router metadata for AI-first navigation
  status: DONE
  depends_on: [META.CONTRACTS.SWITCH]
  acceptance_criteria:
    - ops/ROUTER.yaml, ops/ROUTER_INDEX.yaml, and masterroutetable.md record new docs (ops/DB_BOOTSTRAP.md) and scripts (scripts/bootstrap_staging_db.ps1) with updated timestamps.
    - ops/ROUTER.md and scripts/ROUTER.md capture the refresh in their notes with the 2025-10-28 context.
    - ops/TOUCHMAP.yaml maps T10.SCALE.DB_BOOTSTRAP and the new META task to their owned paths.
  notes: Outcome — Router docs now reference the staging bootstrap runbook/script, updated timestamps, and clarified AI navigation expectations across master and machine-readable maps.

- id: META.AI_DOC_ENABLE
  title: Sync agent handbook and README for AI onboarding
  status: DONE
  depends_on: [META.ROUTER.20251028]
  acceptance_criteria:
    - agent.md mentions the staging bootstrap runbook/script and reiterates contract essentials for autonomous agents.
    - README.md highlights the new bootstrap workflow, refreshed meta-router strategy, and AI enablement guidance in Current Status & Operational Guardrails sections.
    - Prompt.md and ops/NEXT.yaml reflect the updated meta-task completion and READY pointer state.
  notes: Outcome — Agent handbook and README now highlight meta-routing assets, bootstrap flow, and AI guardrails so future agents can reference the repository with minimal rediscovery.