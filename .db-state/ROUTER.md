# ROUTER
Title: Local Database State Cache
Purpose: Persists developer-facing DB connection hints between runs.
Owned Globs: .db-state/**
Last Updated (UTC): 2025-10-30T00:46:00Z

Notes:
- Automation reads this folder to track which database source (Accelerate vs direct) was used most recently.
- Files are generated locally; do not commit secrets—only high-level state such as the last connection source is stored.

Key Files:
- db-connection.json - JSON payload capturing the last database source and update timestamp.
