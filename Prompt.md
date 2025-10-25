# Prompt.md
Timestamp (UTC): 2025-10-25T07:25:00Z
Revision: 0.37

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**  
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `ops/ROUTER.md`, `scripts/ROUTER.md`, `src/ROUTER.md`, `src/bot/ROUTER.md`, `src/core/ROUTER.md`, `tests/ROUTER.md` — Normalized encoding, refreshed timestamps, and clarified bullet formatting.
> - `ops/ROUTER_INDEX.yaml` — Regenerated from cleaned router docs to remove stray carriage returns and mojibake.
> - `tasklist.md`, `ops/NEXT.yaml`, `ops/RECOVERY.yaml`, `Prompt.md` — Recorded META.ROUTER_FMT completion, refreshed recovery heartbeat, and noted that the next milestone is pending human direction.

<!-- PATCHSET:ECHO BEGIN -->
NO-ECHO-REASON: Commit pending; summarizing META.ROUTER_FMT cleanup.
- Normalized all ROUTER.md files to LF encoding with clear em-dash bullets.
- Regenerated ops/ROUTER_INDEX.yaml and documented META.ROUTER_FMT in Tasklist and NEXT pointer.
- Commit message will capture router doc cleanup once generated.
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
