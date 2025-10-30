# ROUTER
Title: Shared Library Helpers
Purpose: Utility modules used by legacy command surfaces and cache builders.
Owned Globs: src/lib/**
Last Updated (UTC): 2025-10-30T00:47:00Z

Notes:
- Provides reusable logic (cooldowns, dex lookups, color tables) for CommonJS modules.
- New implementations should prefer TypeScript equivalents under `src/shared` where available.

Key Files:
- assets.js - Resolves asset locations for embeds and messaging.
- cooldown.js - Cooldown tracking helpers for command throttling.
- dex-api.js - Fetch helpers for PokeAPI endpoints.
- type-colors.js - Maps Pokemon types to embed color metadata.
