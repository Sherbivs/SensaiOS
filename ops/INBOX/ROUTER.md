# ROUTER
Title: Ops Inbox
Purpose: Fast-notes staging area for operators to flag priorities before they reach Tasklist.
Owned Globs: ops/INBOX/**
Last Updated (UTC): 2025-11-01T16:20:00Z

Notes:
- `notes.md` is the single source for inbox items; guard scripts watch its timestamp against ops/NEXT.yaml.last_notes_read_utc.
- Clear notes into Tasklist-backed work or archive them under ops/ARCHIVE when resolved to keep the inbox focused.
