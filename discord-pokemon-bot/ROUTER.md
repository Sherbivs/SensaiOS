# ROUTER
Title: Legacy Discord Bot Package
Purpose: Snapshot of the pre-rewrite Discord bot implementation kept for reference during migrations.
Owned Globs: discord-pokemon-bot/**
Last Updated (UTC): 2025-11-01T15:45:00Z

Notes:
- Folder remains frozen; new work should target `src/bot/**` unless explicitly reviving this package.
- Subpackages are mostly stubs retained for historical context; document any future experiments inline and cross-link to the modern TypeScript surfaces.

Subdirectories:
- battles/ — legacy battle command scaffolding (empty snapshot); see `discord-pokemon-bot/battles/ROUTER.md`.
- data/ — static data placeholders; see `discord-pokemon-bot/data/ROUTER.md`.
- scripts/ — build/utility scripts from the legacy stack; see `discord-pokemon-bot/scripts/ROUTER.md`.
- utils/ — legacy helper modules; see `discord-pokemon-bot/utils/ROUTER.md`.
