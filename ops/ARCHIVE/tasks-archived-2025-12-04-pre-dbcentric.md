# Archived Tasks — Pre-Database-Centric Development Plan

> **Archive Date:** 2025-12-04T00:00:00Z  
> **Reason:** Cleared to commence Database-Centric Development Plan  
> **Source:** `tasklist.md` (Revision 2.112)  
> **Replacement:** New sprint structure per `docs/projects/COMMENCEMENT-PLAN.md`

---

## Context

The following tasks were archived as part of the transition to the Database-Centric Development Plan. These represent Phase 17-18 work that was in progress or proposed before the strategic pivot to database infrastructure.

**Decision:** All existing READY/IN_PROGRESS/PROPOSED tasks superseded by new P0-P4 priority structure.

---

## Phase 17 — Northstar Schema Implementation (ARCHIVED)

### DB.NORTHSTAR.ANALYTICS (READY → ARCHIVED)
**Title:** Create analytics event tables and Event Bus integration  
**Previous Status:** READY

**Acceptance Criteria (Not Completed):**
- Create `GameEvent` model in schema.prisma with fields (id, eventType, userId, sessionId, payload JSONB, createdAt, indexed on eventType+createdAt)
- Create `AnalyticsJob` model for scheduled aggregation jobs (id, jobType, lastRunAt, nextRunAt, status, config JSONB)
- Generate Prisma migration: `npx prisma migrate dev --name add_analytics_tables`
- Test migration on ONPREMISE-DEV-PRIMARY database
- Create EventBusAnalyticsAdapter service to bridge Event Bus → GameEvent table
- Write unit tests for event capture, job scheduling, adapter integration
- Verify TypeScript build passes (0 errors)

**Notes:**
- Architecture Reference: Analytics events capture gameplay telemetry (battles, catches, trades, economy)
- Event Types: battle_started, battle_ended, pokemon_caught, pokemon_evolved, trade_completed, item_purchased
- Job Types: daily_summary, weekly_rollup, player_milestones

**Superseded By:** P1-009 (Missing Tables Migration) includes analytics tables with revised schema

---

### DB.NORTHSTAR.SERVICES (IN_PROGRESS → ARCHIVED)
**Title:** Build EventTracker and ProfileService with caching integration  
**Previous Status:** IN_PROGRESS (started 2025-11-08)

**Progress Made:**
- Implementation Complete: EventTracker (340 lines), ProfileService (490 lines), comprehensive types
- Test Results: 25 tests, 19 passing (76% pass rate)
- Commits: 4a6c862, 5ab4e61, dc0ca5a

**Remaining Work:**
- Fix test failures (mock data alignment)
- Integrate with logger/metrics systems

**Superseded By:** P0-003 (L1 Cache Enhancement), P0-004 (Query Logging), P2-005 (Query Profiling Integration)

---

## Phase 18 — Private Channel Architecture (ARCHIVED)

### ARCHITECTURE.HOMESTEAD_CHANNELS.FOUNDATION (READY → ARCHIVED)
**Title:** Create HomesteadChannelManager service and database schema  
**Previous Status:** READY

**Acceptance Criteria (Not Completed):**
- Create `src/services/homestead-channel-manager.ts` with core methods
- Add `HomesteadChannel` model to `prisma/schema.prisma`
- Generate Prisma migration
- Implement channel permission structure
- Write unit tests

**Architecture Reference:** docs/architecture-bible/14-private-channel-architecture.md (900+ lines complete specification)

**Superseded By:** Deferred to post-database infrastructure completion. Homestead channels depend on solid database foundation.

---

### ARCHITECTURE.HOMESTEAD_CHANNELS.DM_MIGRATION (PROPOSED → ARCHIVED)
**Title:** Migrate DM modules (home, heal, starters) to channel-based architecture  
**Previous Status:** PROPOSED (depended on FOUNDATION)

**Superseded By:** Deferred to Phase 3+ of Database-Centric plan

---

### ARCHITECTURE.HOMESTEAD_CHANNELS.FEATURE_INTEGRATION (PROPOSED → ARCHIVED)
**Title:** Update battle/wild encounter features to use homestead channels  
**Previous Status:** PROPOSED

**Superseded By:** Deferred to Phase 3+ of Database-Centric plan

---

### ARCHITECTURE.HOMESTEAD_CHANNELS.LIFECYCLE (PROPOSED → ARCHIVED)
**Title:** Implement channel lifecycle management (cleanup, event handlers)  
**Previous Status:** PROPOSED

**Superseded By:** Deferred to Phase 3+ of Database-Centric plan

---

### ARCHITECTURE.HOMESTEAD_CHANNELS.TESTING (PROPOSED → ARCHIVED)
**Title:** Comprehensive testing and documentation updates  
**Previous Status:** PROPOSED

**Superseded By:** Deferred to Phase 3+ of Database-Centric plan

---

### ARCHITECTURE.HOMESTEAD_CHANNELS.DEPLOYMENT (PROPOSED → ARCHIVED)
**Title:** Production deployment and monitoring  
**Previous Status:** PROPOSED

**Superseded By:** Deferred to Phase 3+ of Database-Centric plan

---

## Historical Archive References

Previous archives (all DONE tasks from October-November 2025):
- `ops/ARCHIVE/tasks-archived-2025-12-02.md` — Phases 0-16 completed work

---

## Recovery Instructions

If any archived work needs to be resumed:

1. Review the original acceptance criteria above
2. Check for partial implementations in codebase:
   - EventTracker: `src/services/event-tracker.ts` (may exist)
   - ProfileService: `src/services/profile-service.ts` (may exist)
   - HomesteadChannelManager: Not started
3. Create new task in `Tasklist.md` with updated acceptance criteria
4. Update `ops/NEXT.yaml` to include the task

---

**Archive maintained for historical reference and potential future restoration.**
