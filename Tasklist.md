# Tasklist
Last Updated (UTC): 2025-12-02T19:15:00Z
Revision: 2.112
<!-- # TASKLIST UPDATE -->

**Recent Activity (2025-12-02T19:15Z):**
- 🧹 **Tasklist Cleanup** — Archived entries older than 48 hours, keeping only recent activity and active tasks
  - Archived: Phase 0-16 DONE tasks (October-November 2025)
  - Preserved: Recent activity summaries, READY/IN_PROGRESS/PROPOSED tasks, Phase 17-18 active work
  - See `ops/ARCHIVE/tasks-archived-2025-12-02.md` for historical reference

**Recent Activity (2025-12-01T00:50Z):**
- ✅ **Security Archive Intelligence Test Suite — Structure Alignment Complete (Task 3.1)** — 13/19 tests passing
  - Root cause: Tests expected nested baseline structure but implementation uses flat structure
  - Fix: 8 targeted edits across test file
  - Test Results: 13/19 passing (was 0/19), 6 remaining failures are implementation issues NOT test structure
  - Status: Critical blocker removed, test suite validated, ready for implementation fixes

Status legend: `PROPOSED` → `READY` → `IN_PROGRESS` → `DONE` → `BLOCKED`

Each task has:
- `id`: unique string
- `title`: terse description
- `status`: current state
- `depends_on`: array of task ids
- `acceptance_criteria`: bullet list
- `notes`: optional context

---

## Archived Phases (See ops/ARCHIVE/tasks-archived-2025-12-02.md)

The following phases have been archived (all tasks DONE):
- Phase 0 — Repo & Tooling (META.* tasks)
- Phase 1-6 — Core Features (T1-T6.* tasks)
- Phase 7 — Meta & Router Hardening (T7.* + HF.* tasks)
- Phase 8-9 — Player Progression & PBSL (T8-T9.* tasks)
- Phase 10-11 — Scalability & AI Enablement (T10.* + META.* tasks)
- Phase 12-13 — Roadmap & Dex Data (T13.* tasks)
- Phase 14 — Live Game Cache (T14.* tasks)
- Phase 15 — DB Bootstrap & HA (DB.V0.* tasks)
- Phase 16 — Database Replication (DB.REPLICATION.* tasks)

---

## Phase 17 — Northstar Schema Implementation

- id: DB.NORTHSTAR.ANALYTICS
  title: Create analytics event tables and Event Bus integration
  status: READY
  depends_on: []
  acceptance_criteria:
    - Create `GameEvent` model in schema.prisma with fields (id, eventType, userId, sessionId, payload JSONB, createdAt, indexed on eventType+createdAt)
    - Create `AnalyticsJob` model for scheduled aggregation jobs (id, jobType, lastRunAt, nextRunAt, status, config JSONB)
    - Generate Prisma migration: `npx prisma migrate dev --name add_analytics_tables`
    - Test migration on ONPREMISE-DEV-PRIMARY database
    - Create EventBusAnalyticsAdapter service to bridge Event Bus → GameEvent table
    - Write unit tests for event capture, job scheduling, adapter integration
    - Verify TypeScript build passes (0 errors)
  notes: |
    **Architecture Reference:** Analytics events capture gameplay telemetry (battles, catches, trades, economy)
    **Event Types:** battle_started, battle_ended, pokemon_caught, pokemon_evolved, trade_completed, item_purchased
    **Job Types:** daily_summary, weekly_rollup, player_milestones

- id: DB.NORTHSTAR.SERVICES
  title: Build EventTracker and ProfileService with caching integration
  status: IN_PROGRESS
  depends_on: []
  acceptance_criteria:
    - Create EventTracker service with batch processing (max 100 events, 5s delay), PII handling (SHA-256 IP hashing), retention policies by category/severity.
    - Create ProfileService with cache integration (30min in-memory, 24hr disk), profile/stats/achievements queries, leaderboard pagination (4 types: battles/catches/streaks/winrate).
    - Add metrics/observability hooks (event processing stats, cache hit rates, query times).
    - Write unit tests for event batching, PII hashing, cache invalidation, leaderboard pagination.
  notes: |
    **Status:** IN_PROGRESS (2025-11-08T12:15:00Z)
    **Implementation Complete:** EventTracker (340 lines), ProfileService (490 lines), comprehensive types
    **Test Results:** 25 tests, 19 passing (76% pass rate)
    **Remaining:** Fix test failures (mock data alignment), integrate with logger/metrics systems
    **Commits:** 4a6c862, 5ab4e61, dc0ca5a

---

## Phase 18 — Private Channel Architecture (Homestead Channels)

- id: ARCHITECTURE.HOMESTEAD_CHANNELS.FOUNDATION
  title: Create HomesteadChannelManager service and database schema
  status: READY
  depends_on: []
  acceptance_criteria:
    - Create `src/services/homestead-channel-manager.ts` with core methods (getOrCreateChannel, createChannel, getChannelByUserId, getUserByChannelId, deleteChannel)
    - Add `HomesteadChannel` model to `prisma/schema.prisma` with fields (id, userId unique, guildId, channelId unique, createdAt, lastAccessedAt, indexes on userId/channelId/guildId)
    - Generate Prisma migration: `npx prisma migrate dev --name add_homestead_channel`
    - Test migration on ONPREMISE-DEV-PRIMARY database
    - Implement channel permission structure (deny @everyone, allow user + bot with ViewChannel/SendMessages/ReadMessageHistory/UseApplicationCommands)
    - Write unit tests for channel creation, permission setup, database mapping, lookup operations
    - Verify TypeScript build passes (0 errors)
  notes: |
    **Architecture Reference:** docs/architecture-bible/14-private-channel-architecture.md (900+ lines complete specification)
    **Migration Strategy:** Hard cutover (deploy all changes at once, deprecate DM modules immediately)
    **Channel Naming:** homestead-{username} (lowercase, sanitized)
    **Category:** "Homesteads" category with deny @everyone default
    **Database:** HomesteadChannel table with userId/channelId unique indexes

- id: ARCHITECTURE.HOMESTEAD_CHANNELS.DM_MIGRATION
  title: Migrate DM modules (home, heal, starters) to channel-based architecture
  status: PROPOSED
  depends_on: [ARCHITECTURE.HOMESTEAD_CHANNELS.FOUNDATION]
  acceptance_criteria:
    - Migrate `src/bot/dm/home.ts` → `src/bot/homestead/home.ts` (replace all createDM() calls with getOrCreateChannel(), line 306)
    - Migrate `src/bot/dm/heal.ts` → `src/bot/homestead/heal.ts` (update interaction context)
    - Migrate `src/bot/dm/starters.ts` → `src/bot/homestead/starters.ts` (replace createDM() at line 51)
    - Update imports in `src/bot/index.ts` (remove dm/ imports, add homestead/ imports)
    - Ensure all view rendering works in channel context (embeds, components, pagination)
    - Test home view navigation (party/box/profile buttons, box pagination)
    - Test healing flow (confirmation, party updates)
    - Test starter selection (buttons, party assignment)
    - Verify TypeScript build passes
  notes: |
    **Files Modified:** 4 modules (home.ts, heal.ts, starters.ts, index.ts)
    **DM Removal:** src/bot/dm/ directory marked deprecated, removed after validation
    **Testing Focus:** Button interactions, embed rendering, pagination state management

- id: ARCHITECTURE.HOMESTEAD_CHANNELS.FEATURE_INTEGRATION
  title: Update battle/wild encounter features to use homestead channels
  status: PROPOSED
  depends_on: [ARCHITECTURE.HOMESTEAD_CHANNELS.DM_MIGRATION]
  acceptance_criteria:
    - Update `src/bot/battle/challenge.ts` lines 97, 154 (replace createDM() with getOrCreateChannel())
    - Update `src/bot/battle/actions.ts` lines 59, 66 (replace dm1/dm2 = createDM() with channel lookups)
    - Update `src/bot/battle/conclude.ts` line 18 (replace createDM() with getOrCreateChannel())
    - Update `src/bot/wilds/controls.ts` line 88 (replace createDM() with getOrCreateChannel())
    - Update `src/commands/home.js` line 559 (replace createDM() with getOrCreateChannel())
    - Update `src/commands/profile.js` line 71 (replace createDM() with getOrCreateChannel())
    - Test battle challenges (notifications delivered to both homestead channels)
    - Test battle actions (move selections, turn results sent to homestead)
    - Test battle conclusions (outcome messages in homestead)
    - Test wild encounters (Pokemon spawns in homestead with catch/flee buttons)
    - Test home/profile commands (views render in homestead)
    - Verify TypeScript build passes
  notes: |
    **Files Modified:** 6 files (challenge.ts, actions.ts, conclude.ts, controls.ts, home.js, profile.js)
    **Call Sites:** 10 createDM() replacements total
    **Testing Focus:** Cross-feature integration (battles spanning multiple channels, wild encounters maintaining state)

- id: ARCHITECTURE.HOMESTEAD_CHANNELS.LIFECYCLE
  title: Implement channel lifecycle management (cleanup, event handlers)
  status: PROPOSED
  depends_on: [ARCHITECTURE.HOMESTEAD_CHANNELS.FEATURE_INTEGRATION]
  acceptance_criteria:
    - Add Discord event handler for `channelDelete` (detect homestead deletion, remove database mapping)
    - Add Discord event handler for `guildMemberRemove` (cleanup orphaned homestead when user leaves guild)
    - Create cleanup script `scripts/cleanup_homestead_channels.ts` (delete inactive channels >30 days)
    - Create sync script `scripts/sync_homestead_channels.ts` (reconcile Discord channels with database mappings, detect orphans/missing)
    - Optional: Create backfill script `scripts/backfill_homestead_channels.ts` (pre-create channels for existing users)
    - Implement `cleanupInactiveChannels(guildId, daysInactive)` method in HomesteadChannelManager
    - Implement `syncMissingChannels(guildId)` method to detect/fix inconsistencies
    - Test channel deletion recovery (manual delete → next interaction recreates)
    - Test user leave cleanup (user leaves guild → channel deleted within 24h)
    - Test sync script (detects orphaned channels, missing mappings)
    - Document cleanup automation in operations guide
  notes: |
    **Event Handlers:** channelDelete, guildMemberRemove
    **Cleanup Policy:** 30 days inactive (configurable via HOMESTEAD_CLEANUP_DAYS_INACTIVE env var)
    **Sync Strategy:** Daily cron job or manual admin trigger
    **Backfill:** Optional, recommend lazy creation instead

- id: ARCHITECTURE.HOMESTEAD_CHANNELS.TESTING
  title: Comprehensive testing and documentation updates
  status: PROPOSED
  depends_on: [ARCHITECTURE.HOMESTEAD_CHANNELS.LIFECYCLE]
  acceptance_criteria:
    - Write unit tests for HomesteadChannelManager (80%+ coverage target)
    - Write integration tests for homestead features (home/heal/starters/battles/wilds)
    - Execute manual E2E testing checklist (14 scenarios from architecture doc)
    - Update `src/bot/homestead/ROUTER.md` (new router for homestead modules)
    - Update `src/services/ROUTER.md` (add HomesteadChannelManager)
    - Update `docs/architecture-bible/02-discord-bot-layer.md` (architecture change documentation)
    - Update `docs/architecture-bible/complete-system-architecture.md` § 2 (Service Topology) — new homestead channel architecture
    - Update `README.md` (mention private channel architecture)
    - Create user announcement: `docs/announcements/homestead-channel-migration.md`
    - Mark `src/bot/dm/ROUTER.md` as deprecated
    - Archive DM modules after validation period (7 days)
  notes: |
    **Test Coverage:** Unit (services), Integration (features), E2E (manual checklist)
    **Documentation:** 7 files updated + 1 new announcement
    **DM Deprecation:** Mark deprecated immediately, remove after 7-day validation

- id: ARCHITECTURE.HOMESTEAD_CHANNELS.DEPLOYMENT
  title: Production deployment and monitoring
  status: PROPOSED
  depends_on: [ARCHITECTURE.HOMESTEAD_CHANNELS.TESTING]
  acceptance_criteria:
    - Deploy database migration to PROD: `npx prisma migrate deploy`
    - Deploy code changes to Render (Infinity-Gauntlet service)
    - Announce migration to users (48 hours advance notice)
    - Monitor error rate for 48 hours post-deployment (target <0.1% error rate)
    - Monitor channel creation rate (expect gradual increase as users interact)
    - Verify no DM delivery failures (old error category should drop to zero)
    - Add `/ops homestead` command showing guild stats (total channels, active users, orphaned channels)
    - Document rollback procedure in case of critical bugs
    - Validate cleanup automation (inactive channel deletion after 30 days)
    - Remove deprecated DM modules after stability confirmed (7 days)
  notes: |
    **Deployment Strategy:** Hard cutover (all features at once)
    **Monitoring Period:** 48 hours intensive, 7 days validation
    **Rollback Plan:** Revert code to previous release, database schema remains (no data loss)
    **Success Metrics:** 0% DM failures, <0.1% error rate, gradual channel adoption
