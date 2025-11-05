# ROUTER
Title: Ops Archive
Purpose: Snapshots of retired Tasklist history and supporting meta doc exports.
Owned Globs: ops/ARCHIVE/**
Last Updated (UTC): 2025-11-04T17:42:30Z

Notes:
- README.md documents how `scripts/archive_task_history.mjs` moves aged DONE tasks into dated archives without disturbing active work.
- Treat archived files as immutable records; add new entries via the archival script rather than manual edits to preserve provenance.
- `db-bootstrap/2025-11-04-tooling-evidence.md` holds sanitized command output for DB.V0 bootstrap tooling parity.

Linked Routers:
- ops/ROUTER.md — Parent ops index and governance context.
- scripts/ops/ROUTER.md — Automation that writes into the archive.
