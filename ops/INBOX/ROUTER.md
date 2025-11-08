# ROUTER
Title: Ops Inbox
Purpose: Fast-notes staging area for operators to flag priorities before they reach Tasklist.
Owned Globs: ops/INBOX/**
Last Updated (UTC): 2025-11-01T17:30:00Z

Notes:
- `notes.md` is the single source for inbox items; guard scripts watch its timestamp against ops/NEXT.yaml.last_notes_read_utc.
- Clear notes into Tasklist-backed work when resolved to keep the inbox focused.

Linked Routers:
- ops/ROUTER.md — Parent governance index.
- scripts/guards/ROUTER.md — Guards that monitor inbox state.
