# Prompt.md
Timestamp (UTC): 2025-10-28T06:52:00Z
Revision: 1.04

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
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
