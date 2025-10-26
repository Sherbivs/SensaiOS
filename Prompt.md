# Prompt.md
Timestamp (UTC): 2025-10-26T12:50:00Z
Revision: 0.76

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**  
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `scripts/guard_meta.sh` — Preflight promotes the oldest eligible PROPOSED or injects a seed; Postflight enforces READY pointer and non-NONE NEXT.
> - `.github/workflows/guard-meta.yml` — Runs preflight and postflight, making “no READY task” states impossible to merge.
> - `ops/NEXT.yaml` — Adds auto_promote_if_empty: true, clarifies guidance_when_none, and refreshes note/timestamps.
> - `Patch.md`, `Patch-Template.md`, `CRITICAL.md` — Contract now mandates preflight/postflight readiness and plain-text echoes.



<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local
Made “no READY task” states unmergeable and auto-fixed at runtime. guard_meta preflight now promotes or seeds READY automatically; postflight asserts NEXT points at READY and is never NONE. NEXT.yaml gains auto_promote_if_empty and stays on META.READY_QUEUE.NEXT_TASK until promotion hands off to substantive work. Patch/Template/Critical spell out preflight/postflight and plain-text echo rules.
TasklistDiff: true
Tests: Meta logic changes; no runtime tests executed here.
<!-- PATCHSET:ECHO END -->
@@
-| 2025-10-26 | META.PROMPT.PATCHSET_TEMPLATE enforced the plain-text PATCHSET echo template. | Patch.md now carries the verbatim template, Tasklist logs the policy, and Prompt highlights the no-objects rule for PATCHSET echoes. |
+| 2025-10-26 | T8.3 shipped the daily quest claim command. | `/daily claim` now awards coins, bumps streaks, enforces cooldowns, and Tasklist/NEXT/Touchmap target the DM Home button follow-up. |
+| 2025-10-26 | META.PROMPT.PATCHSET_TEMPLATE enforced the plain-text PATCHSET echo template. | Patch.md now carries the verbatim template, Tasklist logs the policy, and Prompt highlights the no-objects rule for PATCHSET echoes. |
```

# TASKLIST UPDATE

```diff
@@
-Last Updated (UTC): 2025-10-26T11:30:00Z
-Revision: 1.58
+Last Updated (UTC): 2025-10-26T12:20:00Z
+Revision: 1.59
@@
-- id: T8.3
-  title: Add daily quest claim flow and rewards
-  status: READY
+- id: T8.3
+  title: Add daily quest claim flow and rewards
+  status: DONE
@@
-  notes: Extends the progression loop by letting trainers claim their daily quest reward while leveraging the new streak infrastructure.
+  notes: Outcome — `/daily claim` registers via slash, routes to `handleDailyClaim`, grants coins, bumps streaks, and enforces a 24h cooldown with coverage for success + cooldown blocks.
+
+- id: T8.4
+  title: Add DM Home button to claim daily quest
+  status: READY
+  depends_on: [T8.3]
+  acceptance_criteria:
+    - DM Home embed includes a “Claim Daily” button that calls the new handler without leaving DMs.
+    - Button reflects cooldown state (disabled or messaging) after pressing, surfacing streak/cooldown feedback inline.
+    - Tests cover button wiring, cooldown-block messaging, and streak display updates.
+  notes: Extends the progression loop so trainers can claim the daily reward from Home without slash commands, piggybacking on the new handler.
```

<<<PATCHSET END>>>

Tests: Not run (Vitest unavailable in this environment).

Next steps:
1. Run `npx vitest run tests/daily.spec.ts` (or full suite) to validate the new handler logic.
2. Re-run `node scripts/register-commands.js` in the deployment environment so Discord picks up the `/daily` command.

Made changes.
<!-- PATCHSET:ECHO END -->

## Revision History

| Date (UTC) | Change | Impact |
| --- | --- | --- |
| 2025-10-26 | T8.3 shipped the daily quest claim command. | `/daily claim` now awards coins, bumps streaks, enforces cooldowns, and Tasklist/NEXT/Touchmap target the DM Home button follow-up. |
| 2025-10-26 | META.PROMPT.PATCHSET_TEMPLATE enforced the plain-text PATCHSET echo template. | Patch.md now carries the verbatim template, Tasklist logs the policy, and Prompt highlights the no-objects rule for PATCHSET echoes. |
| 2025-10-26 | META.REFRESH.RETIRE replaced the Refresh Vision requirement with a meta visibility check. | Patch/Prompt/CRITICAL now prioritize verifying Patch/Tasklist/Prompt readability before planning while leaving Refresh Vision as an optional human-run script. |
| 2025-10-26 | META.READY_QUEUE.NEXT_TASK promoted battle history work to READY. | T8.1 now READY with NEXT/Touchmap hints, T8.2 remains PROPOSED to extend progression, and guard guidance keeps the queue healthy. |
| 2025-10-26 | META.NO_READY.SAFETY_NET hardened the ≥1 READY invariant. | guard_meta.sh fails when only the seed is READY, suggests the oldest eligible PROPOSED, Tasklist adds READY/PROPOSED follow-ups, and NEXT targets the promotion task. |
| 2025-10-26 | META.UNBLOCK.READY_SEED seeded a READY task and added guard guidance for empty queues. | guard_meta.sh now flags zero READY tasks, Tasklist logs the completion, and NEXT targets the safety-net follow-up. |
| 2025-10-26 | HF.20251026.MASTER_ROUTE_TABLE expanded the master router reference. | masterroutetable.md now maps router-of-routers and router-owned files so hotfix navigation works without automation. |
| 2025-10-26 | META.README.REFRESH2 refreshed README status, workflow, and roadmap. | README now reflects current status/goals, architecture snapshot, updated dev/deploy guidance, and roadmap priorities. |
| 2025-10-26 | HF.20251026.ECHO_DIALOG_PLAIN expanded the PATCHSET echo narration. | Prompt echo now delivers detailed plain-text sentences while avoiding embedded file objects; Tasklist and hotfix metadata track the update. |
| 2025-10-26 | T7.7 added participant filtering to admin battle summaries. | `/ops stats` now accepts optional participant mentions/IDs, updates report headers, and tests cover mention filtering + no-result messaging. |
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


