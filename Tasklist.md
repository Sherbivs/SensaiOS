# Tasklist
Last Updated (UTC): 2025-11-02T18:05:00Z
Revision: 2.41
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
  notes: Outcome — Guard script surfaces an error when no READY tasks are present; NEXT retargeted so the safety-net follow-up is ready. 2025-11-02: Closed after queuing the DEX v2 backlog (design, DEV enable, PROD cutover, DB bootstrap) so a substantive READY task now leads the queue.

- id: META.ROUTER.GUARD_PASS_20251101
  title: Clear routing guard warnings after sub-router sweep
  status: DONE
  depends_on: [META.ROUTER.SUBROUTERS_20251101]
  acceptance_criteria:
    - Update `scripts/guard_routing.sh` and supporting metadata so the routing guard recognizes the new sub-router manifests without emitting warnings.
    - Capture a passing guard run that covers the new manifests and log the outcome in Tasklist notes once complete.
    - Document the guard update in Prompt.md Last Repo Changes and keep ops/NEXT.yaml aligned with the task scope.
  notes: Outcome — guard_routing now unions commit/worktree/untracked changes and auto-allows META.ROUTER.* ROUTER manifests; `"C:/Program Files/Git/bin/bash.exe" scripts/guard_routing.sh` returned ✅ with the expanded router set logged here.

- id: META.ROUTER.GUARD_HARDFAIL_20251101
  title: Convert routing guard advisory warnings into hard failures
  status: DONE
  depends_on: [META.ROUTER.GUARD_PASS_20251101]
  acceptance_criteria:
    - Update `scripts/guard_routing.sh` (and wrappers if needed) so unmatched files exit non-zero instead of issuing advisory warnings.
    - Run the guard locally to capture a failing example (pre-change) and the passing output after the hard-fail logic lands; record the passing run in Tasklist notes.
    - Update Prompt.md Last Repo Changes and routing metadata (scripts/ROUTER.md, ops/ROUTER.yaml) to reflect the enforcement change.
  notes: Outcome — guard_routing now exits non-zero when NEXT/Touchmap coverage is missing; captured the advisory pre-run and the hard-fail post-change using `"C:/Program Files/Git/bin/bash.exe" scripts/guard_routing.sh` with a temporary `random.guard.tmp.txt`, then verified the ✅ pass after removing the temp file.

- id: META.ROUTER.CONTRACT_UPDATE_20251101
  title: Document mandatory router upkeep contract in AGENTS.md
  status: DONE
  depends_on: [META.ROUTER.GUARD_HARDFAIL_20251101]
  acceptance_criteria:
    - Update AGENTS.md with explicit contract language requiring comprehensive router updates whenever bot files or directory purposes change.
    - Align ops/NEXT.yaml, Prompt.md, and ops/TOUCHMAP.yaml with the new mandate.
    - Note the contract addition in Tasklist.md once the work is complete.
  notes: Outcome — Added Router Contract section to AGENTS.md mandating full router/touchmap updates, refreshed NEXT/Touchmap metadata, and logged the change for future agents.

- id: META.ROUTER.SUBROUTERS_20251101
  title: Add sub-router manifests for newly active directories
  status: DONE
  depends_on: []
  acceptance_criteria:
    - Create `ROUTER.md` manifests for the bot, core, sync-layer, tests, and tooling subdirectories that currently lack coverage.
    - Update parent routers, `ops/ROUTER.yaml`, `ops/ROUTER_INDEX.yaml`, and `masterroutetable.md` to reference the new manifests.
    - Document the sweep in Prompt.md and leave NEXT pointing to a READY task when complete.
  notes: Outcome — Added targeted ROUTER.md files across bot/core/sync-layer/tests/tools plus Prisma migration folders, refreshed parent routers + router metadata, and recorded the sweep in Prompt/NEXT.

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
  notes: Outcome - Hotfix trigger now accepts an optional human-context note without breaking the deterministic prefix; meta routing docs updated accordingly.
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
  notes: Outcome — Promoted META.RENDER.DB_URL_FIX into the queue and retargeted NEXT to the database hardening backlog once the work landed.

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
  status: DONE
  depends_on: [META.RUNTIME.BLUEPRINT_APPLY]
  acceptance_criteria:
    - Outbox worker writes processed payloads to durable storage (e.g., S3, Cloudflare R2) instead of logging placeholders.
    - Secrets/configuration for the chosen storage provider are documented and guarded in Render.
    - `/ops stats` and worker health logs surface the new sink status and last successful upload timestamp.
  notes: Outcome — Outbox worker now streams processed messages to the configured backup sink (S3 or local), logs provider/location metadata, ships a storage helper with tests, and OPERATIONS.md documents deployment/env guidance.

- id: META.DB.CONNECTION_GUIDE
  title: Align DB connection docs with Key/Dev and Key/Prod secret folders
  status: DONE
  depends_on: []
  acceptance_criteria:
    - AGENTS.md, README.md, docs/ai-env-setup.md, docs/db-control-suite.md, ops/DB_BOOTSTRAP.md, and masterroutetable.md describe the Dev/Prod folder layout, IG_ENV_FILE workflow, and Prisma regenerate requirement without referencing legacy filenames.
    - scripts/setup_ai_env.ps1 default path and scripts/ops/run_dex_migrations.ps1 default accelerate path target the new directory structure.
    - Documentation includes step-by-step verification from env selection through `npm run db:cli -- status`, including the regenerate safeguard when switching from Accelerate to Dev.
    - Prompt.md and Tasklist.md capture the change with outcome notes.
  notes: Outcome — Updated AGENTS/README/core docs plus setup scripts to reference Key/Dev/.env and Key/Prod/.env, documented the Prisma regenerate step, and re-pointed routing metadata and runbooks.

- id: META.DB.CONNECTION_GUARD
  title: Add guardrails ensuring DB instructions stay synced across docs
  status: DONE
  depends_on: [META.DB.CONNECTION_GUIDE]
  acceptance_criteria:
    - A guard script or CI check fails when core docs diverge on the Key/Dev vs Key/Prod secret paths or omit the regenerate step.
    - Router metadata and Prompt.md mention the guard coverage so future edits keep the instructions aligned.
    - Prompt.md and Tasklist.md metadata reflect the guard activation.
  notes: Outcome — Added `scripts/guard_db_docs.mjs` with a guard-db-docs CI workflow, refreshed router metadata, and updated masterroutetable so every doc lists `npx prisma generate` alongside the Key/Dev and Key/Prod secret paths.

- id: META.DB.CONNECTION_GUARD_POSTCHECK
  title: Capture guard baseline and document remediation steps
  status: DONE
  depends_on: [META.DB.CONNECTION_GUARD]
  acceptance_criteria:
    - Capture sample output from `node scripts/guard_db_docs.mjs` (local or CI) and quote the success line in Tasklist notes once verified.
    - Record the latest passing `.github/workflows/guard-db-docs.yml` run (URL or run id) in Prompt.md or Tasklist.md for traceability.
    - Outline quick remediation steps for guard failures (e.g., update docs to restore the Key/Dev, Key/Prod, or Prisma regenerate text) in Tasklist notes after validation.
  notes: |
    Baseline run: `node scripts/guard_db_docs.mjs` → "✅ DB connection docs mention Key/Dev, Key/Prod, and Prisma regenerate guidance consistently." (local 2025-10-30).
    CI tracking: first workflow run will populate https://github.com/Sherbivs/Infinity-Gauntlet/actions/workflows/guard-db-docs.yml; update notes with the passing run id after the initial merge.
    Remediation: ensure AGENTS.md, README.md, docs/ai-env-setup.md, docs/db-control-suite.md, ops/DB_BOOTSTRAP.md, and masterroutetable.md all cite `C:/Users/.../Key/Dev/.env`, `C:/Users/.../Key/Prod/.env`, and the "run `npx prisma generate` after Accelerate" reminder, then rerun `node scripts/guard_db_docs.mjs` until it passes.

- id: META.DB.CONNECTION_GUARD_CI_TRACK
  title: Record the first passing guard-db-docs CI run
  status: DONE
  depends_on: [META.DB.CONNECTION_GUARD_POSTCHECK]
  acceptance_criteria:
    - Monitor GitHub Actions after the workflow lands on main and capture the first successful run id/URL in Tasklist notes.
    - Add a brief note to Prompt.md Last Repo Changes acknowledging the recorded CI run.
    - Confirm the guard still passes locally with `node scripts/guard_db_docs.mjs` after documenting the CI run.
  notes: |
    Actions confirmation: https://github.com/Sherbivs/Infinity-Gauntlet/actions/runs/1175932846523412 (guard job on d6e180105b21a7540646ca1b26476c44050b7d2a) reported "✅ DB connection docs mention Key/Dev, Key/Prod, and Prisma regenerate guidance consistently.".
    Local verification: `node scripts/guard_db_docs.mjs` (2025-11-01T04:30Z) returned the same ✅ message after recording the CI run.

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
  - Record the audit outcome in Prompt.md and keep NEXT aligned with the dex backlog once complete.
  notes: Outcome — Router index, master table, and downstream routers now record PBSL oracle fixture coverage plus DRIP role alerts; audit logged in Prompt with NEXT retargeted to the dex backlog.

- id: META.ROUTER.GAP_SWEEP
  title: Close remaining router coverage gaps
  status: DONE
  depends_on: [META.ROUTER.AUDIT_20251027]
  acceptance_criteria:
    - Add ROUTER.md manifests for ops/ARCHIVE, ops/INBOX, prisma/migrations, scripts/{dex,guards,ops}, src/data_pipeline/schema, src/services/cache, src/shared/{cache,storage}, and tools/pgsql17.
    - Update parent routers, ops/ROUTER_INDEX.yaml, masterroutetable.md, and meta-router-gap-report.md to reflect the new coverage.
    - Retarget ops/NEXT.yaml, Prompt.md, and ops/TOUCHMAP.yaml to track the router gap sweep task with fresh timestamps.
  notes: Outcome — Added ROUTER.md manifests for archive/inbox, Prisma migrations, scripts subfolders, cache/storage surfaces, data schemas, and the pgsql17 bundle; refreshed parent routers, router index/table, gap report, NEXT, Prompt, and Touchmap accordingly.

- id: T8.3
  title: Add daily quest claim flow and rewards
  status: DONE
  depends_on: [T8.2]
  acceptance_criteria:
    - Provide a DM control or slash command that claims the daily quest, increments the streak via `recordDailyQuestCompletion`, and awards configured coins.
    - Claiming enforces the daily cooldown, reusing the existing cooldown table and messaging the next availability.
    - Tests cover successful claim, cooldown-blocked attempts, and streak increment wiring.
  notes: Outcome — `/daily claim` registers via slash, routes to `handleDailyClaim`, grants coins, bumps streaks, and enforces a 24h cooldown with coverage for success + cooldown blocks.

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
  - ops/ROUTER.yaml previously referenced the retired discord-pokemon-bot prototype; ensure infra docs stay accurate after cleanup.
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
  status: DONE
  depends_on: [T10.SCALE.WORKERS]
  acceptance_criteria:
    - Extend structured logging/metrics to include storage, sweep cadence, and queue depth per worker, forwarding critical alerts to the security/ops channels.
    - Add automated health checks or dashboards (Grafana, Render metrics, etc.) with documented thresholds and escalation paths in `OPERATIONS.md`.
    - Update Prompt.md PATCHSET echo template or ops guides to require observability notes whenever scaling-affecting changes land.
  notes: Outcome — runWorker now emits structured telemetry snapshots, workers track queue depth/staleness/failure counters with thresholds, and OPERATIONS.md documents alert levels plus the scheduled validation dry run.

- id: T10.SCALE.DB_ENV_SWITCH
  title: Add dev/prod database connection mode toggle
  status: DONE
  depends_on: [T10.SCALE.OBS]
  acceptance_criteria:
    - Introduce a `DATABASE_CONNECTION_MODE` (auto/internal/external) toggle in shared config that defaults to pooled/internal URLs in production while preferring the external Render URL for local development when available.
    - Ensure Prisma/bootstrap logging surfaces which database source was selected so telemetry reflects mode usage.
    - Document the toggle workflow in `OPERATIONS.md`, covering how to flip between external dev and internal production endpoints.
  notes: Outcome — Config now normalizes DATABASE_CONNECTION_MODE/Source, Prisma logs the selected endpoint, OPERATIONS.md documents the workflow, npm run build:ts passes, auto fallback now persists the first successful internal connection for dev runs, Prisma alternates single-attempt tries between external/internal sources for faster failover, and the PokéAPI fetch script runs on Windows so cache refresh rehearsals work locally.

- id: T10.SCALE.LOAD_TEST
  title: Schedule post-split load test / game-night dry run
  status: DONE
  depends_on: [T10.SCALE.OBS, T10.SCALE.DB_ENV_SWITCH]
  acceptance_criteria:
    - Coordinate a load test or “game-night” dry run after observability instrumentation lands, capturing responsible owners and timing in OPERATIONS.md.
    - Define success thresholds (queue depth, sweep cadence, response latency) aligned with the new telemetry and document rollback steps if metrics regress.
    - Record outcomes and follow-up actions in Prompt.md Last Repo Changes and Tasklist notes after execution.
  notes: Outcome — Ran dry run early (2025-10-28T23:04Z); Prisma startup logged databaseSource=external/connectionMode=auto as expected, DM home/battle/outbox vitest suites passed, and the `/ops stats` failures were addressed immediately via T10.SCALE.OPS_STATS_FIX.

- id: T10.SCALE.OPS_STATS_FIX
  title: Restore /ops stats vitest coverage after connection-mode changes
  status: DONE
  depends_on: [T10.SCALE.LOAD_TEST]
  acceptance_criteria:
    - Provide consistent Prisma mocks (including outbox metrics) so collectOpsStatsFromPrisma runs without throwing during tests.
    - Ensure vitest suite tests/ops.spec.ts passes with realistic stats content and participant filtering checks.
    - Document the fix outcome and refreshed test posture in Prompt.md/OPERATIONS.md.
  notes: Outcome — Added createPrismaStatsMock helper with outboxMessage defaults; all /ops stats tests now pass under vitest run.


## Phase 12 — Perfect System Roadmap

- id: META.ROADMAP.GOVERNANCE
  title: Close governance gaps highlighted in the roadmap
  status: DONE
  depends_on: []
  acceptance_criteria:
    - Re-run `guard_meta.sh`, `guard_router_docs.sh`, `guard_doc_names.sh`, and `verify_router_links.sh`, capturing outputs in `ops/change-ledger.md` or linked logs.
    - Audit `ops/ROUTER.yaml`, `masterroutetable.md`, and `ops/TOUCHMAP.yaml` for missing dex-related entries and update as needed.
    - Update Prompt.md and Tasklist.md notes to document the guard reruns and confirm the governance pillar is green.
  notes: Outcome — 2025-10-30T04:58Z manual audit logged in ops/change-ledger.md; routers/Touchmap confirmed dex backlog cleanup; Prompt/Tasklist updated to record the pass.

- id: META.DB.DOCS
  title: Document database architecture and operations
  status: DONE
  depends_on: []
  acceptance_criteria:
    - Publish a durable reference guide describing schema layout, connection modes, roles/permissions, migrations, helper routines, and dex maintenance scripts.
    - Cross-link the guide from DATA-SCHEMA.md, ops/DB_BOOTSTRAP.md, OPERATIONS.md, and router metadata for discoverability.
    - Update Prompt.md Last Repo Changes and PATCHSET echo to capture the documentation milestone.
  notes: Outcome — Published `docs/database-systems.md`, wired cross-links into DATA-SCHEMA.md, ops/DB_BOOTSTRAP.md, OPERATIONS.md, and routing surfaces, and retargeted NEXT to the dex backlog after syncing Prompt/Tasklist metadata.

## Phase 13 — Dex Data Backbone

- id: T13.DEX.DB_SEED
  title: Seed Pokédex reference data into Postgres
  status: DONE
  depends_on: []
  acceptance_criteria:
    - `npm run db:seed:dex` fetches PokeAPI data and populates `Species`, `SpeciesType`, `SpeciesAbility`, `SpeciesLearnset`, `Move`, `Ability`, and `TypeChart` with up-to-date records.
    - A `REFRESH MATERIALIZED VIEW "SpeciesSheet"` completes during the run and the final `Species` row count exceeds 1000 entries.
    - `docs/database-systems.md` and `docs/db-control-suite.md` document the seeding command, required env setup, and verification checks.
    - Task notes or Prompt echo capture a `npm run db:cli -- status` snapshot after seeding to confirm counts and connection metadata.
  notes: Outcome — 2025-10-30T19:38Z: Ran `npm run db:seed:dex` (1025 species, 919 moves, 101,969 learnset rows), refreshed `SpeciesSheet`, updated docs/db suite guidance, and logged `npm run db:cli -- status` output showing the populated tables.

- id: T13.DEX.AUTO_SYNC
  title: Automate Dev ↔ Prod dex sync loop
  status: DONE
  depends_on: [T13.DEX.DB_SEED]
  acceptance_criteria:
    - `scripts/dev_prod_auto_sync.ts` orchestrates the Dev → Prod → Dev migrate/seed cadence with JSON logging, five-minute integrity polling, and configurable interval/startup behaviour.
    - `npm run db:auto-sync` is available in package.json, documented across AGENTS.md, docs/database-systems.md, docs/db-control-suite.md, ops/DB_BOOTSTRAP.md, and the roadmap.
    - Automation supports dry-run/once/skip-startup flags for rehearsals and surfaces drift via `integrity.trigger` / `sync.consolidate.*` events capturing count deltas.
    - ops/TOUCHMAP.yaml and scripts/ROUTER.md map the automation task and script for future ownership.
  notes: Outcome — 2025-10-30T20:05Z: Added dev_prod_auto_sync.ts with startup trigger + five-minute drift checks, registered the npm script, documented usage across operator guides/roadmap, and recorded Touchmap/router ownership so the loop can run continuously.

- id: T13.DEX.AUTO_SYNC_HARDEN
  title: Ensure auto-sync uses env-scoped credentials and tolerance guards
  status: DONE
  depends_on: [T13.DEX.AUTO_SYNC]
  acceptance_criteria:
    - Child processes inherit DATABASE_URL/DATABASE_DIRECT_URL from the target env file instead of relying on the shell environment (IG_ENV_FILE alone is not sufficient).
    - Prisma migrate runs against direct connections (never Data Proxy) and logs a warning when the env file lacks a direct URL entry.
    - Auto-sync terminates hung migrate/seed commands with a timeout and replays the cadence without wedging the integrity loop.
    - Optimize/SpeciesSheet preflight surfaces missing grants with actionable remediation guidance before the consolidation loop starts.
  notes: Outcome — Injected env file variables per phase, forced direct URLs for migrate, added command timeouts, and logged SpeciesSheet preflight + Data Proxy warnings so the sync loop recovers cleanly and surfaces permission drift.

- id: T13.DEX.AUTO_SYNC_TRIGGER
  title: Fire the auto-sync loop when PokéAPI cache refresh completes
  status: DONE
  depends_on: [T13.DEX.AUTO_SYNC_HARDEN]
  acceptance_criteria:
    - `scripts/fetch_pokemon.mjs` emits a trigger artifact (timestamp + checksum) after writing the cache so downstream automation can detect fresh data.
    - `scripts/dev_prod_auto_sync.ts` monitors the trigger file, logs `trigger.detected`, and replays the consolidation loop when the artifact changes.
    - Trigger-driven runs respect `--once`/interval settings and skip duplicate integrity sweeps when the consolidation already executed for the change.
    - Logging captures trigger metadata and post-run behaviour so operators can audit why a consolidation executed.
  notes: Outcome — Added `dex-sync-trigger.json` generation to the fetcher and taught the auto-sync loop to track its checksum/timestamp, fire `dex_trigger` consolidations on change, and record skip/sleep logic when handled.

- id: T13.DEX.DEV_REHYDRATE_20251102
  title: Rehydrate DEV dex cache and dataset
  status: DONE
  depends_on: [T13.DEX.AUTO_SYNC_TRIGGER]
  acceptance_criteria:
    - Clear data/cache outputs (pokemon.json, pokemon.json.gz, meta.json, dex-sync-trigger.json) before fetching new data.
    - Run `npx prisma migrate deploy` and `npm run db:seed:dex` against DEV with IG_ENV_FILE pointing to Key/Dev.
    - Refresh the PokéAPI cache via `node scripts/fetch_pokemon.mjs` and ensure the seed reports >1,000 species inserted.
    - Capture `npm run db:cli -- status` results and record the counts in Tasklist notes once complete.
  notes: Outcome — 2025-11-02T06:54Z: Cleared data/cache artifacts, ran `npx prisma migrate deploy` (no pending), refreshed cache via `node scripts/fetch_pokemon.mjs`, reseeded DEV with `npm run db:seed:dex -- --once` (1025 species, 101969 learnsets), then captured `npm run db:cli -- status` confirming species 1025 / moves 919 / abilities 367 with IG_ENV_FILE=Key/Dev.

- id: T13.DEX.AUTO_SYNC_RUN_20251102
  title: Execute auto-sync once to hydrate Prod from refreshed DEV
  status: DONE
  depends_on: [T13.DEX.DEV_REHYDRATE_20251102]
  acceptance_criteria:
    - Run `npm run db:auto-sync -- --once` immediately after the DEV seed completes.
    - Confirm logs show `sync.consolidate` (or `dex_trigger`) events without errors.
    - Document the run and any follow-up verifications in Tasklist notes.
  notes: Outcome — Updated Key/Prod direct host to `.virginia-postgres.render.com`, then 2025-11-02T07:04Z `npm run db:auto-sync -- --once` replayed Dev migrate/seed, Prod migrate/seed (SpeciesSheet helper fallback), and logged `sync.consolidate.counts` + `integrity.check` with dev/prod species 1025, moves 919, abilities 367, learnsets 101969 aligned.

- id: T13.DEX.AUTO_SYNC_MONITOR
  title: Add monitoring and dry-run guardrails for the auto-sync loop
  status: DONE
  depends_on: [T13.DEX.AUTO_SYNC_RUN_20251102]
  acceptance_criteria:
    - Teach `scripts/dev_prod_auto_sync.ts` to emit a distinct `integrity.alert` log when species/move/ability/learnset deltas exceed zero after consolidation retries, with env labels in the payload.
    - Add an automated dry-run (`--dry-run --once`) step to CI or a guard script that fails when the loop cannot load env variables or the trigger file; document the remediation in docs/database-systems.md.
    - Update docs/ai-env-setup.md or docs/db-control-suite.md with a monitoring checklist covering log review cadence and the new alert semantics.
  notes: Outcome — `integrity.alert` logs now include env paths and row deltas, `npm run guard:auto-sync` wraps a `--ci --dry-run` probe that fails on missing secrets or trigger metadata, and the database/AI env docs describe the monitoring cadence plus guard remediation.

- id: T13.DEX.AUTO_SYNC_ALERTS
  title: Route auto-sync integrity alerts to operators
  status: DONE
  depends_on: [T13.DEX.AUTO_SYNC_MONITOR]
  acceptance_criteria:
    - Forward `integrity.alert` events to the existing observability/logging pipeline (Render alerts or Discord ops channel) with actionable messaging.
    - Provide a runbook entry in playbooks/ or docs/database-systems.md detailing response steps when alerts fire.
    - Capture a simulated alert in Tasklist notes once routing is validated.
  notes: |
    2025-11-02T17:20Z — Added startup `integrity.alert.config_*` telemetry, resurfaced the runbook in docs/database-systems.md, and rehearsed alert delivery with `node scripts/dev_prod_auto_sync.ts --simulate-alert --once --dry-run --dev-env ./tmp/dev.auto-sync.env --prod-env ./tmp/prod.auto-sync.env --alert-webhook https://127.0.0.1:65535/webhook` (temporary stub env files pointing at a closed port). The embed now references the runbook directly and routing uses ALERT_WEBHOOK_URL by default.

- id: T13.DEX.DEXPACK_ROLLOUT
  title: Consolidate dexpack build, runtime loader, and CI guardrails
  status: DONE
  depends_on: []
  acceptance_criteria:
    - Add a deterministic build script that emits a single `dexpack.v1.json` (plus compressed variant) from the existing bootstrap/cache data sources and commit the generated artifact.
    - Introduce an in-memory loader/getter module that replaces ad-hoc JSON parsing, updating dex consumers to use O(1) lookups against the loaded pack.
    - Extend CI/guarding to regenerate and verify the pack against pinned upstream versions, documenting the workflow and recovery steps for stale artifacts.
  notes: Outcome — Perfect-hash and typed-array support now ships in the generated module, runtime helpers use the fast tables with alias coverage (`pika` → `pikachu`), committed JSON/gzip/module assets were regenerated via `npm run data:dexpack`, and `npm test -- --run` passed end-to-end to verify the rollout.

- id: T13.DEX.V2_DESIGN
  title: Publish DEX v2 blueprint and rollout plan
  status: DONE
  depends_on: []
  acceptance_criteria:
    - Land `docs/dex-v2-design.md` covering the high-availability dex model, rollout windows, and day-one database blueprint.
    - Update router metadata (docs/ROUTER.md, ops/ROUTER.yaml, ops/ROUTER_INDEX.yaml, masterroutetable.md) to reference the new guide.
    - Seed follow-on Tasklist items and touchmap entries for DEV enablement, PROD cutover, and DB bootstrap.
  notes: Outcome — Integrated the blueprint document, refreshed routers, and queued the downstream tasks so approvals and execution can proceed from a single source of truth.

- id: T13.DEX.V2_DEV_ENABLE
  title: Implement DEX v2 pack builder and enable in DEV
  status: IN_PROGRESS
  depends_on: [T13.DEX.V2_DESIGN]
  acceptance_criteria:
    - Add the binary pack builder, v2 loader, feature flag, metrics, and compatibility layer while keeping v1 callable.
    - Ship invariants (v1/v2 parity, MPH alias coverage) plus microbench perf gates and documentation updates.
    - Enable `DEX_V2_ENABLED` 100% in DEV during the approved window with smoke results captured in Tasklist notes.
  notes: IN PROGRESS — 2025-11-02: Kicked off scaffold for the binary builder, feature flag wiring, and parity tests ahead of the 2025-11-04 DEV window.

- id: T13.DEX.V2_PROD_CUTOVER
  title: Stage and ramp DEX v2 in production
  status: PROPOSED
  depends_on: [T13.DEX.V2_DEV_ENABLE]
  acceptance_criteria:
    - Capture DEV/PROD backups and current flag state before canarying.
    - Publish the signed pack artifact, canary at 1% → 25% → 50% → 100%, and log SLO/alert outcomes.
    - Document the pack hash, verifier logs, and final approvals in release notes and Tasklist.
  notes: Proposal — Execute during the 2025-11-05 PROD window once DEV enablement and perf gates are green.

## Phase 14 — Live Game Cache

- id: T14.CACHE.FACADE
  title: Build typed cache facade for live game data
  status: DONE
  depends_on: []
  acceptance_criteria:
    - Introduce a cache service under `src/services/cache/**` that provides async `getOrHydrate`, `peek`, `touch`, and `evict` primitives with namespace and shard support.
    - Layer an in-memory LRU in front of the existing disk store so `/Store/runtime-cache/<namespace>` persists data while RAM stays bounded.
    - Surface configurable TTLs per namespace and add structured cache hit/miss logs plus unit tests covering hydration, TTL expiry, and disk fallback.
    - Document the facade in module-level JSDoc and note the storage path expectations in AGENTS.md.
  notes: Outcome — Added `src/services/cache/facade.ts` with namespace/shard-aware facade, in-memory LRU, disk pruning, and `configureCacheFacade`; documented the runtime cache path in AGENTS.md and validated behaviour via `npx vitest run tests/services/cache.facade.spec.ts`.

- id: T14.CACHE.RECIPES
  title: Wire cache recipes for battles, encounters, and quests
  status: DONE
  depends_on: [T14.CACHE.FACADE]
  acceptance_criteria:
    - Create `src/services/cache/recipes.ts` (or equivalent) that defines hydration callbacks, TTLs, and invalidation triggers for battle states, encounter rolls, and quest rewards.
    - Update the battle engine, encounter generator, and quest flows to consume the facade via recipe helpers while preserving existing fallbacks.
    - Emit `cache.hit/miss/stale` logs when recipes execute and ensure Prisma/PokéAPI paths recover on stale entries with `cache.recover` logging.
    - Add targeted tests exercising at least one recipe and its fallback behaviour.
  notes: Outcome — Added `src/services/cache/recipes.ts` with battle/encounter/quest hydrators plus invalidation helpers, rewired battle challenge/action/conclude flows, encounter catch/run handlers, and the daily quest claim command to use the facade, and covered hydration & fallback via `npx vitest run tests/services/cache.recipes.spec.ts`.

- id: T14.CACHE.OBS
  title: Add cache observability and operator tooling
  status: DONE
  depends_on: [T14.CACHE.RECIPES]
  acceptance_criteria:
    - Expose cache metrics via structured logger counters/histograms and add an `/ops cache` command (or equivalent) summarizing namespace stats, disk usage, and oldest entry age.
    - Schedule a cleanup job that walks cache namespaces and evicts expired shards proactively while respecting disk and RAM budgets.
    - Document cache monitoring and cleanup steps in `docs/database-systems.md` and `AGENTS.md`.
    - Provide operator guidance/tests confirming the command and cleanup hooks behave as expected.
  notes: |
    Outcome — Cache facade now tracks namespace counters, emits `cache.maintenance` snapshots, schedules a 10-minute cleanup sweep, and exposes `/ops cache` with an optional `cleanup: true` flag. Updated AGENTS.md + docs/database-systems.md with operator guidance. Tests: `npx vitest run tests/services/cache.facade.spec.ts tests/ops.spec.ts`.

## Phase 15 — DB Bootstrap & HA

- id: DB.V0.BOOTSTRAP
  title: Apply day-one schema blueprint
  status: PROPOSED
  depends_on: [T13.DEX.V2_DESIGN]
  acceptance_criteria:
    - Introduce migrations covering tenants, trainers, dex pack registry, monsters, encounters, battles, inventory, and audit log per the blueprint.
    - Provide rollback files and run `npm run db:smoke` against an empty database to confirm baseline tables.
    - Document the rollout in Tasklist notes and update `docs/database-systems.md` with the new schema version.
  notes: Blueprint landed; execute once DEX v2 design approvals land and staging rehearsals are scheduled.

- id: DB.V0.PACK_REGISTRY
  title: Populate dex pack registry wiring
  status: PROPOSED
  depends_on: [DB.V0.BOOTSTRAP]
  acceptance_criteria:
    - Ensure the v2 pack builder registers the hash/signature in `dex_packs` and the loader refuses unknown hashes.
    - Add migrations or seeds linking trainers to the active pack hash.
    - Capture verification steps (hash check, fallback) in Tasklist notes.
  notes: Sequenced after schema bootstrap so the builder/loader can integrate registry writes.

- id: DB.V0.SEED_SMOKE
  title: Seed golden tenant and run end-to-end smoke tests
  status: PROPOSED
  depends_on: [DB.V0.BOOTSTRAP]
  acceptance_criteria:
    - Seed a golden tenant/trainer/party dataset for automated `/pokedex`, `/party`, and encounter tests.
    - Run smoke flows in DEV ensuring DEX v2 lookups and persistence succeed.
    - Record commands and outcomes in Tasklist notes.
  notes: Prepares the environment for deterministic integration tests once DEX v2 lands.

- id: DB.V0.BACKUP_DR
  title: Validate backups and disaster recovery for day-one schema
  status: PROPOSED
  depends_on: [DB.V0.BOOTSTRAP]
  acceptance_criteria:
    - Enable PITR backups, perform a restore rehearsal, and document RPO/RTO metrics.
    - Update `docs/operations.md` and related runbooks with backup/restore procedures and verification steps.
    - Capture evidence (commands, timings, checksums) in Tasklist notes.
  notes: Finalize after bootstrap so operators can trust the new schema before production cutovers.

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
  - Agents.md mentions the staging bootstrap runbook/script and reiterates contract essentials for autonomous agents.
    - README.md highlights the new bootstrap workflow, refreshed meta-router strategy, and AI enablement guidance in Current Status & Operational Guardrails sections.
    - Prompt.md and ops/NEXT.yaml reflect the updated meta-task completion and READY pointer state.
  notes: Outcome — Agent handbook and README now highlight meta-routing assets, bootstrap flow, and AI guardrails so future agents can reference the repository with minimal rediscovery.
