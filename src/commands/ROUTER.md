# ROUTER
Title: Slash Command Handlers
Purpose: Discord slash command implementations loaded by command-loader.ts
Owned Globs: src/commands/**
Last Updated (UTC): 2025-12-20T00:00:00Z

## ⚠️ ARCHIVED (2025-12-20)

**Deleted Files — Dead Code Cleanup Meeting #4:**
- `dm-home-loader.ts` (87 lines) — Deprecated DM-based loader, referenced deleted `bot/dm/` directory
- `box.ts` (48 lines) — Used dm-home-loader which always failed
- `party.ts` (47 lines) — Used dm-home-loader which always failed

**Reason:** These files depended on the deleted `src/bot/dm/` directory (homestead migration). The homestead module now provides box/party views directly via `src/bot/homestead/home.ts`.

---

Notes:
- Commands loaded by `src/command-loader.ts` from this directory
- New features should use homestead patterns, not legacy DM flows
- `/profile` manages trainer profiles backed by TrainerProfile table

Active Commands:
- battle.ts / battle-turn.ts — Turn-based battle flows
- home.ts / starter.ts / daily.ts / heal.ts — Player onboarding and maintenance
- dex.ts / move.ts / weak.ts / calc.ts — Pokedex lookups and matchup utilities
- profile.ts — Trainer profile management (view, edit, clear)
- ping.ts / version.ts / walk.ts — Utility commands (latency, build version, encounters)
- ops.ts — Administrative `/ops` command logic
- types.ts — Command type definitions
