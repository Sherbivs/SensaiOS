# ROUTER
Title: Discord Bot Layer
Purpose: Client login, intents, command/interaction routing, DM “home” flows.
Owned Globs: src/bot/**
Last Updated (UTC): 2025-10-26T00:45:00Z

Notes:
- Battle forfeits now persist results and reuse a shared announcer for DM/thread updates.
- Wilds controls surface caught Pokémon IDs in DM and thread messaging.

Areas:
- index.ts — client bootstrap and interaction switchboard
- dm/* — DM flows (starters, heal, etc.)
- commands/* — slash command handlers
