# Prompt.md
Timestamp (UTC): 2025-10-25T05:50:00Z
Revision: 0.32

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**  
> Summarize the *effective* repository changes applied in the current commit in human-readable bullets:
> - Files/dirs added/modified/removed (paths relative to repo root)
> - Purpose of each change (one line)
> - Any schema/contract impacts to consumers (brief)
>
> Changes in this revision:
> - `src/core/battle/engine.ts` — TypeScript wrapper over JS engine with deterministic SeededRNG and helpers to create battles and resolve turns.
> - `src/core/battle/damage.ts` — Thin wrapper exposing damage/effectiveness helpers for TS code.
> - `src/core/battle/status.ts` — Minimal status helpers for major statuses.
> - `tests/battle_engine.spec.ts` — Vitest covering turn order, STAB/type effectiveness, ability immunity, and crit override.
> - `tasklist.md` — Marked T5.2 DONE with acceptance notes.
> - `ops/NEXT.yaml` — Advanced to T5.3 (DM action menus + Arena summaries).

<!-- PATCHSET:ECHO BEGIN -->
NO-ECHO-REASON: Concise echo; see git history for full diff.
- Implemented battle core v1 (TypeScript wrappers over JS engine) and tests.
- Added deterministic RNG and helpers to initialize battles and resolve turns.
- Marked T5.2 DONE; advanced NEXT to T5.3.
- Commit: [Task T5.2] Battle core v1 (engine wrappers + tests).
<!-- PATCHSET:ECHO END -->

## Activation Trigger for AI Workers
Paste this to initialize from Router + INBOX and run the Patch loop:

```
ACTIVATE: PATCH ENGINE
```
```
