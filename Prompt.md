# Prompt.md
Timestamp (UTC): 2025-10-26T13:45:00Z
Revision: 0.80

## Last Repo Changes (since previous Prompt.md revision)
> **AI MUST UPDATE THIS BLOCK ON EVERY PATCHSET**
> Summarize the effective repository changes applied in this commit.
>
> Changes in this revision:
> - `Patch.md`, `Patch-Template.md` — Rewritten for clarity with explicit preflight/postflight guidance and a clean submission template.
> - `Prompt.md` — Restored structured sections (AI Worker Prompt, Activation triggers, Revision history) and refreshed the PATCHSET echo block.
> - `ops/CRITICAL.md`, `ops/HOTFIX.md` — Moved meta guides back under `ops/` to match router expectations; deleted outdated duplicates.
> - `.github/workflows/*` — Reinstated documentation guards and data/route health checks that were removed.
> - `Tasklist.md` — Logged META.REPO.RESTORE_STRUCTURE as DONE to document the cleanup.

## AI Worker Prompt (copy/paste for Copilot/GPT)
Use this verbatim when spinning up an AI worker.
```
ROLE: Senior Staff Systems Architect & Implementer for the Infinity-Gauntlet Discord companion.

READ ORDER:
1. ops/NEXT.yaml   → current pointer (must always be READY) and files_hint
2. Tasklist.md     → execute only tasks with status: READY and deps DONE
3. ops/TOUCHMAP.yaml → limit edits to mapped paths; extend when necessary
4. Prompt.md       → environment state, PATCHSET echo rules, risks

OPERATING LOOP:
- Run Preflight: promote a PROPOSED task (or seed) if no READY items exist; ensure NEXT points at READY.
- Implement the selected READY task with one PATCHSET, touching only hinted files.
- Update Tasklist status/notes, NEXT pointer, TOUCHMAP, and this Prompt.
- Postflight: exit only after Tasklist has ≥1 READY task and NEXT is accurate.

GUARDRAILS:
- Preserve PATCHSET structure from Patch.md / Patch-Template.md.
- Keep diffs minimal and reversible. No speculative edits outside files_hint without updating it first.
- PATCHSET Echo must be plain text sentences including HEAD (or pending-local), summary, TasklistDiff, tests, and the READY pointer rationale.
- Never remove the “AI Worker Prompt (copy/paste for Copilot/GPT)” section.
```

## Activation Triggers
- **Standard work:** `ACTIVATE: PATCH ENGINE`
- **Hotfix lane:** `ACTIVATE: HOTFIX ENGINE` (edits restricted to the hotfix plan and required meta files; restore NEXT to READY before exit.)

## Revision History
| Date (UTC) | Change | Impact |
| --- | --- | --- |
| 2025-10-26 | META.REPO.RESTORE_STRUCTURE cleaned stale meta copies and restored doc/workflow guards. | Canonical docs live under `ops/`, workflows guard metadata, and Patch/Prompt templates are readable again. |
| 2025-10-26 | META.READY.ABSOLUTE hardened preflight/postflight readiness. | guard_meta auto-promotes READY work and blocks NONE pointers in CI. |
| 2025-10-26 | T8.3 shipped the daily quest claim flow. | `/daily claim` awards coins, enforces cooldowns, and Tasklist/NEXT target DM enhancements. |
| 2025-10-26 | T8.1 surfaced battle history on DM Home. | Trainers see their recent battles in DM `/home`; tests cover populated and empty states. |

<!-- PATCHSET:ECHO BEGIN -->
HEAD: pending-local
Cleaned repository meta state: restored ops/CRITICAL.md and ops/HOTFIX.md, deleted outdated duplicates, reinstated workflow guards, and rewrote Patch/Prompt templates so the operating loop is readable again. NEXT remains on META.READY_QUEUE.NEXT_TASK while the queue is rehydrated.
TasklistDiff: true
Tests: Meta-only documentation changes; automated tests not run.
<!-- PATCHSET:ECHO END -->
