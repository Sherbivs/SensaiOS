# Prompt.md
<<<<<<< Updated upstream
Timestamp (UTC): 2025-10-28T06:52:00Z
=======
Timestamp (UTC): 2025-10-28T09:25:00Z
>>>>>>> Stashed changes
Revision: 1.04

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
<<<<<<< Updated upstream
<<<PATCHSET START>>>
[Task META.ROUTER.20251028] Refresh router metadata for AI-first navigation

FILE: ops/ROUTER.yaml
Change: Bumped the router timestamp, listed the new bootstrap helper script under ops_scripts, and ensured infra docs cover ops/DB_BOOTSTRAP.md.

FILE: ops/ROUTER_INDEX.yaml
Change: Regenerated metadata to capture the new timestamps/descriptions, highlighting the bootstrap helper in the scripts router.

FILE: masterroutetable.md
Change: Updated the table timestamp, converted indentation to spaces, and documented the runbook/script under Ops & Governance and Tooling sections.

FILE: ops/ROUTER.md
Change: Recorded the 2025-10-28 router refresh that added the bootstrap runbook to the index.

FILE: scripts/ROUTER.md
Change: Refreshed the timestamp and notes to include the staging bootstrap helper script.

FILE: ops/TOUCHMAP.yaml
Change: Added entries for T10.SCALE.DB_BOOTSTRAP, META.ROUTER.20251028, and META.AI_DOC_ENABLE with their owned paths.

[Task META.AI_DOC_ENABLE] Sync agent handbook and README for AI onboarding

FILE: tasklist.md
Change: Bumped headers, restored T8.4 stub, created Phase 11 meta tasks, and marked the new META tasks DONE with outcome notes.

FILE: agent.md
Change: Integrated staging bootstrap guidance (runbook + PowerShell helper) into the handbook across control documents, routing tips, and tooling.

FILE: README.md
Change: Updated status bullets, deployment/operational guidance, and Render blueprint notes to surface the bootstrap workflow.

FILE: ops/NEXT.yaml
Change: Retargeted NEXT at T10.SCALE.DB_BOOTSTRAP with refreshed rationale, hints, and timestamp.

FILE: Prompt.md
Change: Synced metadata/echo for the meta refresh and cleared legacy patchset snippets.

TASKLIST UPDATE
Change: Added Phase 11 meta tasks, marked them DONE, and kept T10.SCALE.DB_BOOTSTRAP READY for execution.
=======
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `Tasklist.md` - Marked `T10.SCALE.DB_BOOTSTRAP` DONE after staging migrate deploy and index verification.
> - `Prompt.md` - Recorded the staging migration verification run and test outputs.

<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local
Summary: Ran staging migrate deploy for 202510280500_scaling_indexes and confirmed /ops stats, DM Home, and daily cooldown queries use the new indexes.
TasklistDiff: true
Tests: npm test -- --run tests/ops.spec.ts (pass); npm test -- --run tests/dm_home.spec.ts (pass); npm test -- --run tests/daily.spec.ts (pass)
Contracts: ON (marker present; Contract Mode enforced).
NEXT: T8.4 remains READY; DM home daily button wiring stays queued next.
<!-- PATCHSET:ECHO END -->

<<<PATCHSET START>>>
[Task T10.SCALE.DB_BOOTSTRAP] Baseline staging DB and verify scaling index migration

FILE: Tasklist.md
Change: Marked T10.SCALE.DB_BOOTSTRAP as DONE after the staging migrate deploy and index verification run.
Insert/Replace/Remove: Refreshed headers and outcome notes to capture the successful staging rollout.

FILE: Prompt.md
Change: Logged the staging migrate deploy execution, verification evidence, and updated READY pointer context.
Insert/Replace/Remove: Bumped timestamp/revision and rewrote Last Repo Changes plus PATCHSET Echo.

# TASKLIST UPDATE
Change: Marked T10.SCALE.DB_BOOTSTRAP DONE.
>>>>>>> Stashed changes
<<<PATCHSET END>>>

            FILE: scripts/guard_meta.sh
            Change: Detected the clipboard marker, relaxed contract checks in Markerless Mode, and enforced Absolutes (canonical files, routers, NEXT pointer).

            FILE: ops/RECOVERY.yaml
            Change: Logged last_run_contracts and last_run_reason guidance for reconciliation.

            # TASKLIST UPDATE
            Change: Added META.CONTRACTS.SWITCH outcome notes while leaving META.READY_QUEUE.NEXT_TASK READY.

            <<<PATCHSET END>>>
# FILE: NEXT.yaml



```diff
