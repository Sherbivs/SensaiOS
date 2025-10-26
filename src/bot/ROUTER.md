# ROUTER
Title: Discord Bot Layer
Purpose: Client login, intents, command/interaction routing, DM “home” flows.
Owned Globs: src/bot/**
Last Updated (UTC): 2025-10-26T06:45:00Z

Notes:
- Battle victories persist via `concludeBattleWithVictory`, sharing the announcer flow with forfeits.
- Wilds controls surface caught Pokémon IDs in DM and thread messaging.
- Admin `/ops stats` now surfaces recent finished battles (winner/loser, rewards) from persisted results.
- Admin `/ops stats` accepts optional limit + after filters so staff can audit deeper history without direct DB access.
- Admin `/ops stats` adds a participant filter (Discord ID or mention) to isolate specific competitor history.

Areas:
- index.ts — client bootstrap and interaction switchboard
- dm/* — DM flows (starters, heal, etc.)
- commands/* — slash command handlers
