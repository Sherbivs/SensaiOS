# ROUTER
Title: Discord Bot Layer
Purpose: Client login, intents, command/interaction routing, DM “home” flows.
Owned Globs: src/bot/**
Last Updated (UTC): 2025-11-03T07:45:00Z

Notes:
- Battle victories persist via `concludeBattleWithVictory`, sharing the announcer flow with forfeits.
- Wilds controls surface caught Pokémon IDs in DM and thread messaging.
- Admin `/ops stats` now surfaces recent finished battles (winner/loser, rewards) from persisted results.
- Admin `/ops stats` accepts optional limit + after filters so staff can audit deeper history without direct DB access.
- Admin `/ops stats` adds a participant filter (Discord ID or mention) to isolate specific competitor history.
- Admin `/ops cache` reports hit/miss counters, disk usage, maintenance cadence, and accepts an optional cleanup flag to trigger the cache sweep immediately.
- Daily quest claim handler awards coins, bumps streaks, and enforces cooldowns via `handleDailyClaim`.
- Discord bootstrap waits for `clientReady` with error guards so the CLI monitor reflects the bot's online status reliably.
- TypeScript entry `src/index.ts` now boots the legacy security worker (`main.js` + `dripAlerts.js`) so DripTVDD alert digests and ops DM notifications stay live until the port completes.
- Security bot now emits DRIP alerts whenever roles are assigned, including audit-log attribution and CLI telemetry updates.
- Security sweeps respect `ENABLE_CONTINUOUS_SWEEP`; when false the bot defers to the dedicated Render worker and logs the disabled state to the CLI dashboard.
- DM Home embeds (`dm/home.ts`) render party, box (with pagination), and trainer profile views with button navigation and DM fallbacks when direct messages are disabled.
- Trainer profile embeds now live under `profile/embed.ts`, shared by the `/profile` slash command to render Option C hybrid summaries.

Areas:
- index.ts — client bootstrap and interaction switchboard
- dm/* — DM flows (starters, heal, home views with pagination); see src/bot/dm/ROUTER.md
- arena/* — Arena thread helpers; see src/bot/arena/ROUTER.md
- battle/* — Battle interaction handlers; see src/bot/battle/ROUTER.md
- daily/* — Daily quest handlers; see src/bot/daily/ROUTER.md
- middleware/* — Shared guardrails for commands; see src/bot/middleware/ROUTER.md
- ops/* — `/ops` admin slash commands; see src/bot/ops/ROUTER.md
- wilds/* — Wild encounter slash/button flows; see src/bot/wilds/ROUTER.md
- commands/* — slash command handlers
- main.js — security bot bootstrap (role sweeps, drip alerts)
- dripAlerts.js — DM alert digest pipeline (DripTVDD security alerts)
