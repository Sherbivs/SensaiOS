-- Migration: Fix security_events schema drift & purge test data
-- Date: 2026-04-05
-- Issue: security_events table was created via `prisma db push` with an old
--        8-column schema that predates the SecurityEvent Prisma model redesign.
--        The current Prisma model expects 17 columns. All 15 calls to
--        securityEventService.recordEvent() have been silently failing since
--        the model was updated (caught by .catch() handlers).
--
-- Additionally, the role_change_audit table contains 500 rows of test data
-- (origins: 'test', 'concurrent-test', 'member-join' with fake user tags)
-- injected during automated test runs on 2025-12-27. Zero real Discord
-- events have ever been recorded. This test data pollutes the /audit and
-- /changes DM command output.
--
-- Actions:
--   1. DROP old security_events table (0 rows — no data loss)
--   2. CREATE security_events with correct 17-column schema
--   3. ADD all required indexes
--   4. PURGE test data from role_change_audit (500 fake rows)
--   5. RESET role_change_audit sequence to start fresh

-- =============================================================================
-- STEP 1: Drop the old security_events table (0 rows, schema mismatch)
-- =============================================================================
-- Old schema had: id, timestamp, event_type, severity, guild_id, user_id, details, correlation_id
-- New schema has:  id, event_type, severity, guild_id, guild_name, member_id, member_tag,
--                  role_id, role_name, executor_id, executor_tag, origin, metadata,
--                  signature, checksum, previous_hash, created_at

-- Drop the materialized view that depends on the old table first
DROP MATERIALIZED VIEW IF EXISTS "security_events_daily";

-- Drop indexes (they reference old columns)
DROP INDEX IF EXISTS "idx_security_events_guild_time";
DROP INDEX IF EXISTS "idx_security_events_type";
DROP INDEX IF EXISTS "idx_security_events_severity";

DROP TABLE IF EXISTS "security_events";

-- =============================================================================
-- STEP 2: Create security_events with correct schema matching Prisma model
-- =============================================================================
CREATE TABLE "security_events" (
    "id"            BIGSERIAL NOT NULL,
    "event_type"    TEXT NOT NULL,
    "severity"      TEXT NOT NULL,
    "guild_id"      TEXT NOT NULL,
    "guild_name"    TEXT NOT NULL,
    "member_id"     TEXT,
    "member_tag"    TEXT,
    "role_id"       TEXT,
    "role_name"     TEXT,
    "executor_id"   TEXT,
    "executor_tag"  TEXT,
    "origin"        TEXT NOT NULL,
    "metadata"      JSONB,
    "signature"     TEXT,
    "checksum"      TEXT NOT NULL,
    "previous_hash" TEXT,
    "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- STEP 3: Create indexes matching Prisma schema @@index declarations
-- =============================================================================
CREATE INDEX "idx_security_events_guild_time" ON "security_events"("guild_id", "created_at" DESC);
CREATE INDEX "idx_security_events_type" ON "security_events"("event_type");
CREATE INDEX "idx_security_events_severity" ON "security_events"("severity");

-- =============================================================================
-- STEP 4: Purge test data from role_change_audit
-- =============================================================================
-- All 500 rows are test artifacts:
--   - origin='concurrent-test' (360 rows): Automated concurrency test
--   - origin='member-join' (70 rows): Test member join simulation
--   - origin='test' (70 rows): Basic unit test data
-- All have fake user tags (User0#0000, TestUser#0001, etc.)
-- Zero real Discord events exist in this table.

DELETE FROM "role_change_audit"
WHERE "origin" IN ('test', 'concurrent-test')
   OR "member_tag" LIKE 'User%#%'
   OR "member_tag" LIKE 'TestUser%#%'
   OR "member_tag" LIKE 'NewUser%#%';

-- =============================================================================
-- STEP 5: Reset the role_change_audit sequence for clean IDs
-- =============================================================================
-- After purging all 500 test rows, reset the auto-increment so new real
-- entries start from 1.
SELECT setval(pg_get_serial_sequence('role_change_audit', 'id'), 1, false);

-- =============================================================================
-- STEP 6: Recreate the security_events_daily materialized view
-- =============================================================================
-- The old view referenced columns (timestamp, user_id, correlation_id) that
-- no longer exist. Recreate with the new schema column names.
CREATE MATERIALIZED VIEW "security_events_daily" AS
SELECT
    date_trunc('day', "created_at") AS bucket,
    "event_type",
    "severity",
    "guild_id",
    count(*) AS event_count,
    count(DISTINCT "member_id") AS unique_members,
    count(DISTINCT "origin") AS unique_origins
FROM "security_events"
GROUP BY date_trunc('day', "created_at"), "event_type", "severity", "guild_id";
