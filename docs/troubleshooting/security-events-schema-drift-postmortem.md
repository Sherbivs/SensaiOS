# Post-Mortem: Security Events Schema Drift & Test Data Pollution

**Date:** 2026-04-05  
**Severity:** Medium — Silent data loss (security events not recording)  
**Duration:** ~3 months (2025-12-27 → 2026-04-05)  
**Impact:** All `securityEventService.recordEvent()` calls failing silently; `audit`/`changes` DM commands showing only test data  
**Resolution:** Migration `20260405180000_fix_security_events_schema_and_purge_test_data`

---

## Timeline

| Date | Event |
|------|-------|
| Pre-2025-12-27 | `security_events` table created via `prisma db push` with 8-column schema |
| 2025-12-27 | Migration `20251227041500_add_security_bot_tables` deployed — creates `role_change_audit`, `threat_detections`, `security_baselines`, `permission_snapshots` but does NOT alter `security_events` (already exists) |
| 2025-12-27 | SecurityEvent Prisma model redesigned to 17 columns (guild_name, member_id, member_tag, role_id, role_name, executor_id, executor_tag, origin, metadata, signature, checksum, previous_hash, created_at) |
| 2025-12-27 | Automated tests run, inserting 500 test rows into `role_change_audit` (origins: `test`, `concurrent-test`, `member-join`) |
| 2025-12-27 → 2026-04-05 | `securityEventService.recordEvent()` silently fails on every call — Prisma tries to write columns that don't exist. Errors swallowed by `.catch()` handlers |
| 2025-12-27 → 2026-04-05 | `roleAuditService.recordRoleChange()` works correctly but records nothing — no actual role changes detected in guild (1,402 sweeps with 0 detections) |
| 2026-04-05 | Issue reported: `audit` and `changes` DM commands show 2025-12-27 stale data |
| 2026-04-05 | Root cause identified, migration deployed, test data purged |

---

## Root Causes

### 1. Schema Drift — `security_events` (PRIMARY)

The `security_events` table was originally created via `prisma db push` (untracked) with an 8-column schema:

```
OLD: id, timestamp, event_type, severity, guild_id, user_id, details, correlation_id
```

The Prisma `SecurityEvent` model was later redesigned to 17 columns:

```
NEW: id, event_type, severity, guild_id, guild_name, member_id, member_tag, role_id,
     role_name, executor_id, executor_tag, origin, metadata, signature, checksum,
     previous_hash, created_at
```

**No migration was created to ALTER the existing table.** The `20251227041500_add_security_bot_tables` migration only created NEW tables (`role_change_audit`, etc.) — it didn't touch `security_events` because that table already existed.

Every `securityEventService.recordEvent()` call attempted to write `guild_name`, `member_id`, `member_tag`, etc. to columns that didn't exist. Prisma threw errors which were caught by fire-and-forget `.catch()` handlers:

```typescript
securityEventService.recordEvent({
  eventType: 'unauthorized-role-change',
  // ... 12 fields that don't exist in the old table
}).catch((err) =>
  report('SecurityEvent Write Error', err, 'error')
);
```

### 2. Test Data Pollution — `role_change_audit`

500 rows of test data were inserted by automated test runs on 2025-12-27:

| Origin | Count | User Tags |
|--------|-------|-----------|
| `concurrent-test` | 360 | User0#0000 through User4#0004 |
| `member-join` | 70 | TestUser#0001, NewUser#0002 |
| `test` | 70 | User1#0001, User2#0002 |

Tests were inserting into the PRODUCTION database (likely the test runner was using `PROD_DATABASE_URL`). This is a test isolation failure — tests should use a separate test database or mock the Prisma client.

### 3. No Real Discord Events

The bot has done 1,402 security sweeps with **0 permission changes detected**. This is expected — the guild hasn't had role changes. The `role_change_audit` table would have legitimate entries IF role changes occurred, but with only test data present, the `audit` command showed stale fake data.

---

## Contributing Factors

1. **`prisma db push` in production** — Creates untracked schema changes that don't generate migrations. Future model changes then miss the ALTER TABLE step.

2. **Fire-and-forget error handling** — All `securityEventService.recordEvent()` calls use `.catch()` that logs but doesn't surface to monitoring. 15 call sites throughout `src/bot/main.ts` were silently failing for 3 months.

3. **No schema drift detection** — No CI check compares the Prisma schema against the production database. The `prisma migrate diff` command could catch this.

4. **Test isolation failure** — Test data reached production. The test runner should use `DATABASE_ONPREMISE_DEV_EXPERIMENT` or mock the database layer entirely.

---

## Resolution

### Migration Applied: `20260405180000_fix_security_events_schema_and_purge_test_data`

1. **Dropped `security_events_daily` materialized view** (depended on old columns)
2. **Dropped old `security_events` table** (0 rows — no data loss)
3. **Created new `security_events` table** with correct 17-column schema
4. **Created 3 indexes** matching Prisma `@@index` declarations
5. **Purged all 500 test rows** from `role_change_audit`
6. **Reset ID sequence** to start from 1
7. **Recreated `security_events_daily` materialized view** with new column names

### Verification

```
security_events:      17 columns ✅ (was 8)
security_events:      0 rows     ✅ (clean start)
role_change_audit:    22 columns ✅ (unchanged)
role_change_audit:    0 rows     ✅ (test data purged)
security_events_daily: refreshes ✅
Build: 0 errors       ✅
```

---

## Prevention — Rules for Future Development

### Rule 1: NEVER use `prisma db push` against production
- Use `prisma migrate dev` locally to generate migration SQL
- Use `prisma migrate deploy` for production deployments
- `prisma db push` is ONLY for local throwaway databases

### Rule 2: Add schema drift detection to CI
```bash
# Add to CI pipeline:
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma \
  --to-url "$PROD_DATABASE_URL" --exit-code
# Exit code 2 = drift detected → fail the pipeline
```

### Rule 3: Observable error handling for fire-and-forget DB writes
```typescript
// BAD — silent failure
service.writeData(data).catch(err => report('error', err));

// GOOD — increment a visible metric
service.writeData(data).catch(err => {
  report('error', err);
  securityMetrics.writeFailures.inc({ table: 'security_events' });
  // Consider: emit to Drip alerts if failure rate > threshold
});
```

### Rule 4: Test isolation
- Tests MUST use `DATABASE_ONPREMISE_DEV_EXPERIMENT` or Prisma mocks
- The test runner should NEVER connect to `PROD_DATABASE_URL`
- Add a CI guard: `if (env === 'test' && url.includes('render.com')) throw`

### Rule 5: Materialized view tracking
- When altering a table, check for dependent materialized views:
  ```sql
  SELECT dependent_view.relname FROM pg_depend
  JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
  JOIN pg_class AS dependent_view ON pg_rewrite.ev_class = dependent_view.oid
  JOIN pg_class AS source_table ON pg_depend.refobjid = source_table.oid
  WHERE source_table.relname = 'YOUR_TABLE';
  ```
- Include DROP + RECREATE of dependent views in the same migration

---

## Database Health Summary (2026-04-05)

### Overall Health: GOOD

| Metric | Value | Status |
|--------|-------|--------|
| DB Size | 385 MB | ✅ Normal |
| Active Connections | 5 | ✅ Healthy |
| Commit/Rollback Ratio | 99.995% | ✅ Excellent |
| Deadlocks | 0 | ✅ Clean |
| Cache Hit Rate | 99.99% | ✅ Optimal |
| Tables | 57 | ✅ All present |
| Materialized Views | 6 | ✅ All refreshable |

### Table Activity (Active Tables)

| Table | Rows | Last Write | Status |
|-------|------|------------|--------|
| `runtime_metrics` | 25,114 | 2026-04-05 | ✅ Active |
| `cache_entries` | 22,360 | 2026-04-05 | ✅ Active (341 MB) |
| `discord_members` | 519 | 2026-04-05 | ✅ Active |
| `ErrorCodeContext` | 46 | Active | ✅ Active |
| `discord_roles` | 27 | 2026-04-05 | ✅ Active |
| `ErrorKnowledge` | 24 | Active | ✅ Active |
| `security_events` | 0 | — | ✅ Schema fixed, ready |
| `role_change_audit` | 0 | — | ✅ Purged, ready |

### Storage Breakdown (cache_entries)

| Namespace | Entries | Size |
|-----------|---------|------|
| `kernel-logs` | 25,112 | ~2.4 GB logical |
| `kernel-snapshots` | 1,102 | ~388 MB logical |
| `resilient-write-buffer` | 566 | ~2.4 MB |
| `ai-logs` | 105 | ~120 KB |
| `security-bot-state` | 21 | ~121 KB |

### Missing Tables (Future Features)

5 Prisma models exist without production tables — these are planned game features, not schema drift:
- `trade_logs` (TradeLog)
- `player_stats` (PlayerStats)
- `achievement_defs` (AchievementDef)
- `achievement_unlocks` (AchievementUnlock)
- `leaderboard_snapshots` (LeaderboardSnapshot)

---

**Prepared by:** Database & Coding Specialist Team  
**Reviewed:** 2026-04-05  
**Classification:** Internal — Development Operations
