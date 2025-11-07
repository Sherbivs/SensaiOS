# ROUTER
Title: Discord Cache Namespace
Purpose: File-based cache persisted by the security bot for Discord audit data.
Owned Globs: Store/discord-cache/**
Last Updated (UTC): 2025-11-01T15:34:00Z

Notes:
- Populated at runtime by `src/bot/main.js`; prune via cache maintenance tooling rather than manual deletion.
- Do not commit environment-specific cache contents—only fixture entries used by tests may live here.
