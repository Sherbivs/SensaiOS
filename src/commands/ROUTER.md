# ROUTER
Title: Legacy Slash Command Handlers
Purpose: Command implementations consumed by the Discord bot prior to the TypeScript port.
Owned Globs: src/commands/**
Last Updated (UTC): 2025-11-02T00:10:00Z

Notes:
- These CommonJS handlers remain for backward compatibility while the TypeScript `/bot/commands` surface is finalized.
- New features should target the TypeScript command set; keep these files stable until deprecation.
- `dm-home-loader.js` bridges legacy commands to the TypeScript DM Home renderer so `/party`, `/box`, and `/profile` mirror the DM flows.

Representative Commands:
- ops.js - Administrative `/ops` command logic.
- battle.js / battle-turn.js - Turn-based battle flows and command entrypoints.
- home.js / starter.js / daily.js / heal.js - Player onboarding and maintenance commands.
- dex.js / move.js / weak.js / calc.js - Pokedex lookups and matchup utilities.
- box.js / party.js / profile.js - Trainer collection and roster management.
- ping.js / version.js / walk.js - Utility commands (latency check, build version, encounter entry).
