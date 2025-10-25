# Prompt.md
Timestamp (UTC): 2025-10-25T11:10:00Z
Revision: 0.48

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**  
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `src/core/encounter/catch.ts` — Stores the persisted Pokémon ID in encounter metadata when a capture succeeds.
> - `src/bot/wilds/controls.ts` — DM and thread success messages now include the stored Pokémon ID.
> - `src/models/index.ts` — `UserRepo.upsertByDiscordId` accepts an injected Prisma client for testability.
> - `tests/catch.spec.ts` — Added a Prisma stub test ensuring captures persist Pokémon, fill party slots, and update encounter data.
> - `src/ROUTER.md`, `src/core/ROUTER.md`, `src/bot/ROUTER.md`, `tests/ROUTER.md`, `ops/ROUTER_INDEX.yaml` — Router timestamps refreshed after catch persistence updates.

<!-- PATCHSET:ECHO BEGIN -->
NO-ECHO-REASON: Manual patchset execution; summarizing scope for audit.
TasklistDiff: true
- Catch persistence writes Pokémon IDs to encounters, updates DM/thread messaging, and lands Prisma-backed tests. NEXT remains NONE pending T7.3 promotion.
<!-- PATCHSET:ECHO END -->

## Activation Trigger for AI Workers
Paste this to initialize from Router + INBOX and run the Patch loop:

```
ACTIVATE: PATCH ENGINE
```

### Activation Internals (what happens on trigger)
1) Refresh Vision (`scripts/refresh_vision.sh`) → verifies remote GitHub access for `Sherbivs/Infinity-Gauntlet`, regenerates `ops/ROUTER_INDEX.yaml`, optionally updates the Prompt ledger, and stamps `ops/RECOVERY.yaml` with remote/local metadata.
  - If running in a restricted IDE/VFS without shell access, inform the human by saying: `Refresh Vision: I couldn't run refresh_vision.sh in this environment—please execute it locally when possible.`
2) Read `ops/RECOVERY.yaml`; if `last_attempted_task_id` is present, prefer resuming that task unless superseded in `ops/NEXT.yaml`.
3) Proceed with the operating loop and emit exactly one PATCHSET + Commit Message.
```

## Revision History

| Date (UTC) | Change | Impact |
| --- | --- | --- |
| 2025-10-25 | T7.2 persisted wild encounter captures and surfaced stored IDs. | Encounter success now creates Pokémon via Prisma, stamps encounter metadata, echoes IDs in DM/thread messaging, and adds tests covering the flow. |
| 2025-10-25 | T7.1 wired DM Home to Prisma persistence and added tests. | `/home` surfaces real trainer coins/party data, bootstraps missing records, and ships unit coverage for persisted Pokémon embeds. |
| 2025-10-25 | META.NEXT.SEED staged Phase 7 persistence backlog and set NEXT to T7.1. | Persistence tasks queued (DM Home wiring READY; capture/battle follow-ups PROPOSED) so work can resume with clear priorities. |
| 2025-10-25 | META.README.REFRESH modernized the README to match the Infinity Gauntlet architecture. | README now reflects DM/Wilds/Arena flows, scripts, and deployment guidance. |
| 2025-10-25 | META.TASK.HOUSEKEEP introduced Tasklist archival script/policy and cleared READY queue. | `npm run tasks:archive` keeps only the latest 100 DONE tasks; NEXT now NONE until new work is staged. |
| 2025-10-25 | META.RECOVERY.REPLAY captured resume metadata and advanced NEXT to META.TASK.HOUSEKEEP. | Refresh Vision now persists last_attempted tasks so workers resume safely before selecting new work. |
| 2025-10-25 | META.NEXT.BOOTSTRAP added bootstrap guidance for NONE pointers and advanced NEXT to META.RECOVERY.REPLAY. | NEXT.yaml documents recovery steps and guards point to the first READY task when the pointer is empty. |
| 2025-10-25 | META.TASKLIST.COUPLING_FIX hardened guard-meta coupling and documented Tasklist requirements. | CI now fails when code patches omit Tasklist updates; NEXT/Tasklist prepared for follow-up META tasks. |


