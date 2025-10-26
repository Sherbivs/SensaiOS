# Prompt.md
Timestamp (UTC): 2025-10-26T06:25:00Z
Revision: 0.62

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**  
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `Patch.md` — PATCHSET echo guidance now specifies plain text sentences (no Markdown bullets) to prevent embedding issues.
> - `Prompt.md` — Echo block converted to plain text and metadata bumped.
> - `tasklist.md`, `ops/HOTFIX_PLAN.yaml`, `ops/RECOVERY.yaml` — Logged hotfix HF.20251026.PLAIN_ECHO_TEXT completion and refreshed timestamps.
> - `ops/ROUTER.md`, `ops/ROUTER_INDEX.yaml` — Updated ops router notes after the meta tweak.
> - Tests: Not run (npm unavailable in this environment).

<!-- PATCHSET:ECHO BEGIN -->
NO-ECHO-REASON: Unable to capture git diff/commit text in this VFS environment; summarizing instead.
TasklistDiff: true
HF.20251026.PLAIN_ECHO_TEXT updated Patch.md to prefer plain text in the echo and adjusted Prompt/Tasklist/Recovery metadata accordingly.
NEXT pointer remains NONE; promote the next READY feature/meta task before resuming.
<!-- PATCHSET:ECHO END -->

## Activation Trigger for AI Workers
Paste this to initialize from Router + INBOX and run the Patch loop:

```
ACTIVATE: PATCH ENGINE
```

### Hotfix Trigger for AI Workers (No-PATCHSET Mode)
Paste this to run a hotfix without PATCHSET blocks:
```
ACTIVATE: HOTFIX ENGINE
```
Workflow mirrors the Patch Engine but restricts edits to `ops/HOTFIX_PLAN.yaml` `files_hint`, required meta files, and routed notes. Patch.md stays untouched unless explicitly part of the fix.

### Activation Internals (what happens on trigger)
1) Refresh Vision (`scripts/refresh_vision.sh`) → verifies remote GitHub access for `Sherbivs/Infinity-Gauntlet`, regenerates `ops/ROUTER_INDEX.yaml`, optionally updates the Prompt ledger, and stamps `ops/RECOVERY.yaml` with remote/local metadata.
  - If running in a restricted IDE/VFS without shell access, inform the human by saying: `Refresh Vision: I couldn't run refresh_vision.sh in this environment—please execute it locally when possible.`
2) Read `ops/RECOVERY.yaml`; if `last_attempted_task_id` is present, prefer resuming that task unless superseded in `ops/NEXT.yaml`.
3) Proceed with the operating loop and emit exactly one PATCHSET + Commit Message.
```

## Revision History

| Date (UTC) | Change | Impact |
| --- | --- | --- |
| 2025-10-26 | HF.20251026.PLAIN_ECHO_TEXT required plain text formatting in PATCHSET echo. | Patch.md now directs workers to avoid Markdown bullets in the echo; Prompt/Tasklist/Recovery updated via hotfix. |
| 2025-10-26 | HF.20251026.AUTO_HOTFIX_DEFAULT defaulted triggerless requests to Hotfix Engine. | Contract instructs workers to run hotfix loop when humans omit activation phrases; meta files updated accordingly. |
| 2025-10-26 | HF.20251026.PATCH_ECHO_MD enforced Markdown formatting in PATCHSET echo. | Patch.md now requires list markers and Prompt.md implements the guidance for quick audits. |
| 2025-10-26 | HF.BROKEN.TASKFLOW documented hotfix bootstrap template. | Hotfix engine can seed READY tasks via ops/HOTFIX_PLAN.yaml; NEXT/RECOVERY reflect the new guidance. |
| 2025-10-26 | T7.6 added filters to admin battle summaries. | `/ops stats` now supports limit/after filters, reports total finished battles, and validates inputs with expanded Vitest coverage. |
| 2025-10-26 | T7.5 surfaced recent battle results to admins. | `/ops stats` now reports counts and the latest finished battles (winner/loser, rewards) using persisted results with Vitest coverage. |
| 2025-10-26 | HOTFIX.ROUTER.DOC referenced the Standardized game-logic doc in router metadata. | Hotfix added router stub + master router table for readiness; meta files stamped for traceability. |
| 2025-10-26 | T7.4 persisted standard battle victories via BattleRepo. | Added concludeBattleWithVictory, new Vitest coverage, and advanced NEXT to the admin reporting follow-up. |
| 2025-10-26 | META.HOTFIX.SYSTEM introduced the no-PATCHSET Hotfix Engine and guard updates. | Hotfix contract documented (`ops/HOTFIX.md`), pointer staged, guard/meta/scripts updated, and Tasklist recorded follow-up hotfix bootstrap task. |
| 2025-10-26 | META.BACKLOG.T7.NEXT queued victory persistence + reporting follow-ups. | Tasklist now includes T7.4 (READY) and T7.5 (PROPOSED); NEXT/Touchmap/NEXT pointer aimed at victory persistence. |
| 2025-10-26 | T7.3 persisted battle outcomes with shared announcer + tests. | BattleRepo writes rewards, DM/thread summaries reuse stored results, and Vitest covers persistence/forfeit flow. |
| 2025-10-25 | META.BACKLOG.T7.3 promoted battle persistence follow-up. | Tasklist + NEXT point at T7.3 (battle results persistence) with router timestamps updated for ops guidance. |
| 2025-10-25 | Deployment wiring: Render database provisioning + env fallbacks. | render.yaml provisions managed Postgres, config reads Render env aliases, README documents the setup. |
| 2025-10-25 | META.ROUTER.NAME_GUARD added canonical-name guard & CI. | Canonical manifest and router-case guard script prevent spelling drift; CI blocks mismatched router/index paths. |
| 2025-10-25 | T7.2 persisted wild encounter captures and surfaced stored IDs. | Encounter success now creates Pokémon via Prisma, stamps encounter metadata, echoes IDs in DM/thread messaging, and adds tests covering the flow. |
| 2025-10-25 | T7.1 wired DM Home to Prisma persistence and added tests. | `/home` surfaces real trainer coins/party data, bootstraps missing records, and ships unit coverage for persisted Pokémon embeds. |
| 2025-10-25 | META.NEXT.SEED staged Phase 7 persistence backlog and set NEXT to T7.1. | Persistence tasks queued (DM Home wiring READY; capture/battle follow-ups PROPOSED) so work can resume with clear priorities. |
| 2025-10-25 | META.README.REFRESH modernized the README to match the Infinity Gauntlet architecture. | README now reflects DM/Wilds/Arena flows, scripts, and deployment guidance. |
| 2025-10-25 | META.TASK.HOUSEKEEP introduced Tasklist archival script/policy and cleared READY queue. | `npm run tasks:archive` keeps only the latest 100 DONE tasks; NEXT now NONE until new work is staged. |
| 2025-10-25 | META.RECOVERY.REPLAY captured resume metadata and advanced NEXT to META.TASK.HOUSEKEEP. | Refresh Vision now persists last_attempted tasks so workers resume safely before selecting new work. |
| 2025-10-25 | META.NEXT.BOOTSTRAP added bootstrap guidance for NONE pointers and advanced NEXT to META.RECOVERY.REPLAY. | NEXT.yaml documents recovery steps and guards point to the first READY task when the pointer is empty. |
| 2025-10-25 | META.TASKLIST.COUPLING_FIX hardened guard-meta coupling and documented Tasklist requirements. | CI now fails when code patches omit Tasklist updates; NEXT/Tasklist prepared for follow-up META tasks. |


