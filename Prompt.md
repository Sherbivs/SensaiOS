# Prompt.md
Timestamp (UTC): 2025-10-25T07:10:00Z
Revision: 0.36

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**  
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `src/commands/ops.js` — Registered /ops with cooldown reset and stats (admin-only).
> - `src/bot/ops/admin.ts` — Implemented admin handler with permission checks; cooldown reset and basic stats with graceful DB fallback.
> - `src/bot/index.ts` — Routed /ops interactions to the admin handler.
> - `tests/ops.spec.ts` — Tests for admin gating logic.
> - Meta: `ops/ROUTER_INDEX.yaml` created; `ops/NEXT.yaml` advanced; `ops/RECOVERY.yaml` heartbeat stamped; `ops/TOUCHMAP.yaml` updated.

<!-- PATCHSET:ECHO BEGIN -->
NO-ECHO-REASON: Concise echo.
- Added /ops admin command (cooldown reset, stats) and routed to TS handler; admin gating via guild perm or ADMIN_USER_IDS.
- Implemented graceful Prisma fallback (no-DB mode) for cooldown reset and stats.
- Created ops test for admin gating; updated router index and recovery heartbeat; advanced NEXT pointer.
- Commit: [Task T6.2] Admin ops and basic stats.
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
