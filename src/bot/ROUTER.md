# ROUTER
Title: Discord Bot Layer
Purpose: Client login, intents, command/interaction routing, DM “home” flows.
Owned Globs: src/bot/**
Last Updated (UTC): 2025-10-26T04:10:00Z

Notes:
- Battle victories persist via `concludeBattleWithVictory`, sharing the announcer flow with forfeits.
- Wilds controls surface caught Pokémon IDs in DM and thread messaging.
- Admin `/ops stats` now surfaces recent finished battles (winner/loser, rewards) from persisted results.

Areas:
- index.ts — client bootstrap and interaction switchboard
- dm/* — DM flows (starters, heal, etc.)
- commands/* — slash command handlers
