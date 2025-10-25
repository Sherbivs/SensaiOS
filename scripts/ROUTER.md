# ROUTER
Title: Dev & Docs Scripts
Purpose: Repo maintenance scripts (ledger, router index, refresh).
Owned Globs: scripts/**
Last Updated (UTC): 2025-10-25T11:25:00Z

Scripts:
- update_change_ledger.sh — populate Prompt ledger (last 200)
- update_router_index.sh — build ops/ROUTER_INDEX.yaml
- refresh_vision.sh — end-to-end refresh before task selection
- archive_task_history.mjs — trims Tasklist DONE entries and writes archives to ops/ARCHIVE/
- verify_router_links.sh — ensures canonical router paths & filenames stay case-accurate (CI guard)
