# Prompt.md
Timestamp (UTC): 2025-10-25T08:58:00Z
Revision: 0.42

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**  
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `scripts/archive_task_history.mjs` + `package.json` — Added `npm run tasks:archive` so operators can cap Tasklist to 100 DONE entries and archive older ones safely.
> - `Patch.md`, `Tasklist.md`, `ops/NEXT.yaml`, `ops/RECOVERY.yaml`, `ops/CRITICAL.md`, `ops/TOUCHMAP.yaml` — Documented the archival policy, marked META.TASK.HOUSEKEEP DONE, updated recovery snapshot, and mapped the new workflow.
> - `ops/ARCHIVE/README.md`, `ops/ROUTER.md`, `scripts/ROUTER.md`, `ops/ROUTER_INDEX.yaml` — Recorded the archive directory and refreshed router metadata for discovery.

<!-- PATCHSET:ECHO BEGIN -->
NO-ECHO-REASON: Commit pending; Tasklist housekeeping staged for apply.
TasklistDiff: true
- Added archive_task_history script + npm hook (`npm run tasks:archive`) to enforce the 100 DONE policy.
- Patch/Tasklist/NEXT/RECOVERY/CRITICAL/TOUCHMAP updated for META.TASK.HOUSEKEEP completion; NEXT now NONE awaiting new work.
- ops/ARCHIVE README + router metadata refreshed so the archive workflow is discoverable.
<!-- PATCHSET:ECHO END -->

## Activation Trigger for AI Workers
Paste this to initialize from Router + INBOX and run the Patch loop:

```
ACTIVATE: PATCH ENGINE
```

### Activation Internals (what happens on trigger)
1) Refresh Vision (`scripts/refresh_vision.sh`) → updates `ops/ROUTER_INDEX.yaml`, `Prompt.md` ledger (if script exists), and `ops/RECOVERY.yaml`.
2) Read `ops/RECOVERY.yaml`; if `last_attempted_task_id` is present, prefer resuming that task unless superseded in `ops/NEXT.yaml`.
3) Proceed with the operating loop and emit exactly one PATCHSET + Commit Message.
```

## Revision History

| Date (UTC) | Change | Impact |
| --- | --- | --- |
| 2025-10-25 | META.TASK.HOUSEKEEP introduced Tasklist archival script/policy and cleared READY queue. | `npm run tasks:archive` keeps only the latest 100 DONE tasks; NEXT now NONE until new work is staged. |
| 2025-10-25 | META.RECOVERY.REPLAY captured resume metadata and advanced NEXT to META.TASK.HOUSEKEEP. | Refresh Vision now persists last_attempted tasks so workers resume safely before selecting new work. |
| 2025-10-25 | META.NEXT.BOOTSTRAP added bootstrap guidance for NONE pointers and advanced NEXT to META.RECOVERY.REPLAY. | NEXT.yaml documents recovery steps and guards point to the first READY task when the pointer is empty. |
| 2025-10-25 | META.TASKLIST.COUPLING_FIX hardened guard-meta coupling and documented Tasklist requirements. | CI now fails when code patches omit Tasklist updates; NEXT/Tasklist prepared for follow-up META tasks. |
