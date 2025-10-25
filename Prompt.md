# Prompt.md
Timestamp (UTC): 2025-10-25T08:20:00Z
Revision: 0.39

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**  
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `ops/NEXT.yaml` — Added `guidance_when_none`, advanced NEXT to `META.RECOVERY.REPLAY`, and tightened file hints.
> - `scripts/guard_meta.sh` — Emits the first READY task suggestion when NEXT is NONE and references the `auto_requeue_if_none` flag.
> - `Patch.md`, `Tasklist.md`, `Prompt.md` — Closed META.NEXT.BOOTSTRAP, stamped meta headers, and documented the bootstrap guidance for future workers.

<!-- PATCHSET:ECHO BEGIN -->
NO-ECHO-REASON: Commit pending; staging META.NEXT.BOOTSTRAP completion prior to apply.
TasklistDiff: true
- Documented NONE bootstrap guidance in ops/NEXT.yaml and re-pointed NEXT to META.RECOVERY.REPLAY.
- guard_meta.sh now surfaces the first READY task suggestion and references auto_requeue hints.
- Patch/Tasklist/Prompt stamped to record META.NEXT.BOOTSTRAP closure.
<!-- PATCHSET:ECHO END -->

## Activation Trigger for AI Workers
Paste this to initialize from Router + INBOX and run the Patch loop:

```
ACTIVATE: PATCH ENGINE
```

### Activation Internals (what happens on trigger)
1) Refresh Vision (`scripts/refresh_vision.sh`) → updates `ops/ROUTER_INDEX.yaml`, `Prompt.md` ledger (if script exists), and `ops/RECOVERY.yaml`.
2) Read `ops/RECOVERY.yaml`; if `last_task_id` is present, prefer resuming that task unless superseded in `ops/NEXT.yaml`.
3) Proceed with the operating loop and emit exactly one PATCHSET + Commit Message.
```

## Revision History

| Date (UTC) | Change | Impact |
| --- | --- | --- |
| 2025-10-25 | META.NEXT.BOOTSTRAP added bootstrap guidance for NONE pointers and advanced NEXT to META.RECOVERY.REPLAY. | NEXT.yaml documents recovery steps and guards point to the first READY task when the pointer is empty. |
| 2025-10-25 | META.TASKLIST.COUPLING_FIX hardened guard-meta coupling and documented Tasklist requirements. | CI now fails when code patches omit Tasklist updates; NEXT/Tasklist prepared for follow-up META tasks. |
