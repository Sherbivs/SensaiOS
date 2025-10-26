# ROUTER
Title: Application Source
Purpose: Root app source tree; see sub-routers for domains.
Owned Globs: src/**
Last Updated (UTC): 2025-10-26T12:20:00Z

Notes:
- Battle persistence now centralizes result storage + arena/winner messaging.
- Updated shared config to fall back to Render-provided database env mappings.
- Daily quest claim flow adds handler, cooldown wiring, and tests under src/bot and src/commands.

Subdomains:
- src/bot — Discord client & interaction handlers
- src/core — game engines (battle, encounter, data)
