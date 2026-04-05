# ROUTER
Title: Discord Bot Layer
Purpose: Client login, intents, command/interaction routing, homestead channel gameplay flows, security bot with DM command interface.
Owned Globs: src/bot/**
Last Updated (UTC): 2026-04-04T00:00:00Z

Notes:
- **Homestead Architecture (COMPLETE 2025-06-15):** All gameplay now occurs in private guild channels (homestead-{username}) instead of DMs. `src/bot/dm/` directory DELETED. Each user gets a dedicated channel with user-only permissions. Better moderation, audit trail, no DM delivery failures. See `docs/architecture-bible/18-private-channel-architecture.md`.
- Battle victories persist via `concludeBattleWithVictory`, sharing the announcer flow with forfeits.
- Wilds controls surface caught Pokémon IDs in homestead channels and thread messaging.
- Admin `/ops stats` now surfaces recent finished battles (winner/loser, rewards) from persisted results.
- Admin `/ops stats` accepts optional limit + after filters so staff can audit deeper history without direct DB access.
- Admin `/ops stats` adds a participant filter (Discord ID or mention) to isolate specific competitor history.
- Admin `/ops cache` reports hit/miss counters, disk usage, maintenance cadence, and accepts an optional cleanup flag to trigger the cache sweep immediately.
- Daily quest claim handler awards coins, bumps streaks, and enforces cooldowns via `handleDailyClaim`.
- Discord bootstrap waits for `clientReady` with error guards so the CLI monitor reflects the bot's online status reliably.
- TypeScript entry `src/index.ts` now boots the legacy security worker (`main.js` + `dripAlerts.js`) so DripTVDD alert digests and ops DM notifications stay live until the port completes.
- Security bot auto-reverts unauthorized role and permission changes, DMing DRIP alerts with audit attribution plus `revertStatus` / `revertErrors` metadata while continuing to log authorized assignments.
- Security sweeps respect `ENABLE_CONTINUOUS_SWEEP`; when false the bot defers to the dedicated Render worker and logs the disabled state to the CLI dashboard.
- Trainer profile embeds now live under `profile/embed.ts`, shared by the `/profile` slash command to render Option C hybrid summaries.
- **Startup Sync Blocking (2026-04-03):** `syncGuildSnapshot()`, `syncModeratorChannelRoles('boot')`, and `enforceDripRoleAllChannels('boot')` are now awaited at startup (blocking) instead of fire-and-forget. Failures are non-fatal (logged as warnings) but sync completes before periodic sweeps begin.
- **DM Command Suite (2026-04-02–04-04):** Security bot accepts 17 DM commands from authorized operators (`canUseDirectStatusCommand()` auth gate). Commands span 5 sections: Status, Data Browse, Sweep Control, Cache, and General. See DM Command Surface section below for full listing.
- **Drip Relationship Indicators (2026-04-03):** All data browse commands annotate entries with Drip role/bot relationship flags (🤖 DRIP ROLE, 🤖 Has Drip, ✅🤖/❌🤖 channel overwrite status, 🤖 THIS BOT).
- **Guild Snapshot Sync (2026-04-02):** Full guild state (members, roles, channels, bots) persisted to `discord_guilds`, `discord_members`, `discord_roles`, `discord_channels` on boot and before each sweep for production observability.
- **Gym Leader Channel-Role Sync (2026-04-02):** Robust role sync with 4 defensive layers — root cause fix for stale role assignments.
- **Channel Overwrite Enforcement (2026-04-02):** `enforceDripRoleAllChannels()` persists Drip role overwrites (ViewChannel + SendMessages) on all guild channels, logged per-channel.

Areas:
- index.ts — client bootstrap and interaction switchboard
- homestead/* — Private guild channel flows (starters, heal, home views with pagination); see src/bot/homestead/ROUTER.md
- arena/* — Arena thread helpers; see src/bot/arena/ROUTER.md
- battle/* — Battle interaction handlers; see src/bot/battle/ROUTER.md
- daily/* — Daily quest handlers; see src/bot/daily/ROUTER.md
- middleware/* — Shared guardrails for commands; see src/bot/middleware/ROUTER.md
- ops/* — `/ops` admin slash commands; see src/bot/ops/ROUTER.md
- wilds/* — Wild encounter slash/button flows; see src/bot/wilds/ROUTER.md
- commands/* — slash command handlers
- state/* — Operational state persistence (cumulative stats, timeline, context restoration); see notes below
- main.ts — security bot bootstrap (role sweeps, drip alerts, DM command handler, guild snapshot sync, startup sync blocking)
- dripAlerts.js — DM alert digest pipeline (DripTVDD security alerts); Event Bus Integration (2025-11-08): Migrated from in-memory queue to Event Bus for all alert queuing, delivery, and retry. Subscribes to `alert.critical|alert.security` (immediate delivery, priority 20) and `alert.warning|alert.notice` (digest delivery, priority 10). Uses Event Bus replay buffer for digest assembly. Re-emits failed deliveries to `alert.warning` with parentCorrelationId for retry tracking. Tested via Phase 2.3.1-2.3.4 validation (17 unit tests + 6 integration tests passing). See architecture-bible/05-event-bus.md for comprehensive Event Bus design and DripAlertManager integration patterns.
- **bot-error-handler.ts (289 lines)** — Domain-specific error handler for Discord bot operations. Recognizes Discord API errors (DiscordAPIError), rate limits (429), interaction timeouts, command errors, member fetch failures. Enriches errors with bot-specific context (userId, guildId, commandName, interactionType). Classifies severity (CRITICAL for bot crashes, HIGH for command failures, MEDIUM for rate limits, LOW for validation). Suggests recovery actions (reconnect, retry with backoff, increase timeout). Integrates with ErrorTracker for persistence and recovery. Exposes handleBotError(error, context) API called from all bot command/interaction handlers. See architecture-bible/06-error-system.md and development-bible/05-error-handling.md for comprehensive error system documentation.

## DM Command Surface (2026-04-02–04-04)

The security bot processes DM commands from authorized operators (guild owner + admin check via `canUseDirectStatusCommand()`). Commands are organized into 5 sections:

### Status Commands (4)
| Command | Description |
|---------|-------------|
| `stats` | Bot uptime, sweep count, alert count, permission changes, memory/CPU usage |
| `status` | Current sweep state, guild monitoring summary, database connectivity |
| `guilds` | All monitored guilds with member counts and last sweep times |
| `errors` | Recent error log with timestamps, severity, and stack context |

### Data Browse Commands (7)
| Command | Description |
|---------|-------------|
| `roles` | All guild roles from DB snapshot with position, color, member count. 🤖 DRIP ROLE flag on Drip's role. |
| `members` | All guild members from DB with join date, roles, bot flag. 🤖 Has Drip indicator. |
| `admins` | Administrators and moderators with permission breakdown. 🤖 Has Drip / 🤖 Dripbot / 🤖 DRIP ROLE flags. |
| `channels` | All channels with type, position, topic. ✅🤖/❌🤖 per-channel Drip overwrite status with legend. |
| `bots` | All bot users with status, roles, permissions. 🤖 THIS BOT tag on Dripbot. |
| `audit` | Last 20 entries from `role_change_audit` — role changes, timestamps, operators. |
| `changes` | Last 20 attempted changes from `role_change_audit` including failures, unauthorized flags, revert reasons, auth reasons, origin tracking. Multi-message chunking for Discord 2000-char limit. |

### Sweep Control Commands (4)
| Command | Description |
|---------|-------------|
| `force sweep` | Trigger immediate role permission sweep across all guilds |
| `pause sweep` | Pause periodic sweep scheduler |
| `resume sweep` | Resume periodic sweep scheduler |
| `restart sweep` | Full sweep system restart (disable → re-enable) |

### Cache Commands (2)
| Command | Description |
|---------|-------------|
| `clear cache` | Purge in-memory caches (role cache, permission cache) |
| `rebuild cache` | Clear then rebuild caches from database |

### General Commands (2)
| Command | Description |
|---------|-------------|
| `help` / `?` | Full command reference organized by section |

State Persistence — Database-First Architecture (Updated 2025-12-27):
- state/persistence.ts — Core state save/load/shutdown lifecycle; PostgreSQL CacheEntry storage
- state/roleArchive.ts — Role change tracking with HMAC signatures (database storage)
- state/securityBaselines.ts — Security baseline generation (database storage)
- state/stats.js — Cumulative statistics tracking (sweeps, alerts, permission changes, uptime)
- state/timeline.js — Rolling activity timeline (last 100 events) with formatting utilities
- state/context.js — Guild monitoring context restoration (last sweep times, recovery recommendations)
- Database Keys: security-bot-state:current, :previous, :snapshot:{ts}, :backup-{n}, :role-archive, :baselines
- Integration: main.js initializes state on startup, records events during sweeps/alerts, saves on shutdown (SIGTERM/SIGINT)
- Admin Interface: `/ops state` command in ops/admin.ts displays cumulative stats, timeline, guild status
- Migration Note (2025-12-27): Replaced /Store file writes with PostgreSQL persistence. Zero file writes for state.

## ⚠️ ARCHIVED (2025-12-20 — Dead Code Cleanup Meeting #4)

The following files were removed as part of dead code cleanup:

- ~~**security-db-subscriber.ts** (352 lines)~~ — EventBus subscriber for database persistence. Sprint 5.0 designed this to wire `security.**` events to `SecurityEventService`, but `initializeSecurityDbSubscriber()` was never called from `main.ts`. The underlying service exists but this integration layer was orphaned.

## ⚠️ ARCHIVED (2025-12-24 — Dead Code Cleanup Meeting #6)

- ~~**main.js.d.ts** (14 lines)~~ — Legacy JavaScript declaration file superseded by TypeScript source (`main.ts`). Zero imports found.

**Reason:** Dead integration layer — designed but never wired up.

**Restoration (if needed):**
```bash
git checkout HEAD~1 -- src/bot/security-db-subscriber.ts
```
