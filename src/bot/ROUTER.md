# ROUTER
Title: Discord Bot Layer
Purpose: Client login, intents, command/interaction routing, DM “home” flows.
Owned Globs: src/bot/**
Last Updated (UTC): 2025-11-05T20:10:00Z

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
- Security bot auto-reverts unauthorized role and permission changes, DMing DRIP alerts with audit attribution plus `revertStatus` / `revertErrors` metadata while continuing to log authorized assignments.
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
- state/* — Operational state persistence (cumulative stats, timeline, context restoration); see notes below
- main.js — security bot bootstrap (role sweeps, drip alerts)
- dripAlerts.js — DM alert digest pipeline (DripTVDD security alerts); **Phase 2.3 Event Bus Integration (2025-11-08):** Migrated from in-memory queue to Event Bus for all alert queuing, delivery, and retry. Subscribes to `alert.critical|alert.security` (immediate delivery, priority 20) and `alert.warning|alert.notice` (digest delivery, priority 10). Uses Event Bus replay buffer for digest assembly. Re-emits failed deliveries to `alert.warning` with parentCorrelationId for retry tracking. Tested via Phase 2.3.1-2.3.4 validation (17 unit tests + 6 integration tests passing). See docs/architecture/phase2.3-dripalertmanager-migration-plan.md for migration details.
- **bot-error-handler.ts (289 lines)** — Domain-specific error handler for Discord bot operations. Recognizes Discord API errors (DiscordAPIError), rate limits (429), interaction timeouts, command errors, member fetch failures. Enriches errors with bot-specific context (userId, guildId, commandName, interactionType). Classifies severity (CRITICAL for bot crashes, HIGH for command failures, MEDIUM for rate limits, LOW for validation). Suggests recovery actions (reconnect, retry with backoff, increase timeout). Integrates with ErrorTracker for persistence and recovery. Exposes handleBotError(error, context) API called from all bot command/interaction handlers. See docs/error-detection-system.md for integration patterns.

State Persistence (Added 2025-11-06):
- state/persistence.js — Core state save/load/shutdown lifecycle; JSON snapshots in Store/security-bot-state/
- state/stats.js — Cumulative statistics tracking (sweeps, alerts, permission changes, uptime)
- state/timeline.js — Rolling activity timeline (last 100 events) with formatting utilities
- state/context.js — Guild monitoring context restoration (last sweep times, recovery recommendations)
- Integration: main.js initializes state on startup, records events during sweeps/alerts, saves on shutdown (SIGTERM/SIGINT)
- Admin Interface: `/ops state` command in ops/admin.ts displays cumulative stats, timeline, guild status
- Documentation: docs/security-bot-state.md covers architecture, schema, integration points
