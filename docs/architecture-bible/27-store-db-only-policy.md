# Section 27: /Store DB-Only Policy

**Last Updated**: 2025-12-27 | **Status**: Database-First Architecture (ACTIVE)

**Owner:** DRIPTVDD

---

## 1. Policy Statement

**ABSOLUTE RULE:** The `/Store` persistent disk directory SHALL contain ONLY database files:
1. **SQLite database files** (`.db`)
2. **Database backups** (`.db.bak`, `.db.backup`)

**ALL other data writes are PROHIBITED:**
- ❌ JSON files
- ❌ Log files  
- ❌ Heap snapshots (raw)
- ❌ State files
- ❌ Cache files
- ❌ Config files

**Database-First Architecture**: Every data write MUST go to a database table (PostgreSQL or SQLite).

**Rationale**: 
- Eliminates file system complexity and race conditions
- Enables SQL queries, retention policies, and backups
- Prevents disk space fragmentation
- Ensures atomic operations via transactions
- Simplifies monitoring and observability

---

## 2. Migration Status (2025-12-27)

### Phase 1: Emergency Cleanup (COMPLETE)
**Result**: 219 MB → 57 MB (-162 MB, -74%)
- ✅ Heap snapshot retention enforced (8 → 2 files)
- ✅ Kernel log retention enforced (5 → 2 files)
- ✅ Security snapshot pruning (59 → 39 files)
- ✅ Empty directory removal (4 dirs)

### Phase 2: Database-First Architecture (IN PROGRESS)
**Target**: 57 MB → ~1 MB (-56 MB, -98% vs baseline)
- 🔄 All file writes redirected to database tables
- 🔄 Prisma migration created (`store_write_elimination`)
- 🔄 Service code updates in progress

### Database Tables Created

#### PostgreSQL Tables
1. **`runtime_metrics`** - Replaces `/Store/restart-metrics.json`
2. **`alert_queue`** - Replaces `/Store/alerts/`
3. **`guild_config`** - Replaces `/Store/guild-member-timeout-config.json`
4. **`cooldowns`** - Replaces `/Store/cooldowns/`
5. **`cache_entries`** - Replaces `/Store/runtime-cache/`, `/Store/discord-cache/`, `/Store/pokemon-cache/`

#### SQLite Tables (engine-write.db)
1. **`heap_snapshots`** - Parses `/Store/*.heapsnapshot`, stores summaries only

**Complete schema**: See `prisma/schema.prisma` § "/Store Write Elimination"

---

## 3. Migration Plan

### Phase 1: Heap Snapshot Migration (HIGH PRIORITY)
**Problem:** 6 heap snapshots consuming 163 MB (17% of disk)

**Solution:**
```sql
-- New table in engine-write.db (SQLite)
CREATE TABLE heap_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at TEXT NOT NULL,           -- ISO timestamp
  trigger TEXT NOT NULL,               -- 'startup', 'manual', 'oom-warning'
  heap_size_bytes INTEGER NOT NULL,
  external_size_bytes INTEGER,
  array_buffer_size_bytes INTEGER,
  summary_json TEXT,                   -- Parsed summary (top allocators, etc.)
  raw_path TEXT,                       -- Temporary path if raw needed
  pruned_at TEXT,                      -- When raw was deleted
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_heap_snapshots_captured ON heap_snapshots(captured_at);
```

**Migration steps:**
1. On startup, parse existing `.heapsnapshot` files
2. Extract key metrics (heap size, top allocators)
3. Insert summary into `heap_snapshots` table
4. Delete raw `.heapsnapshot` file
5. New snapshots: parse immediately, never write raw file

### Phase 2: Security Bot State Migration
**Problem:** 71+ JSON files in `security-bot-state/`

**Solution:**
```sql
-- New table in engine-write.db (SQLite)
CREATE TABLE security_bot_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  state_type TEXT NOT NULL,            -- 'current', 'backup', 'snapshot'
  version INTEGER NOT NULL,
  schema_version TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  cumulative_json TEXT NOT NULL,
  timeline_json TEXT,
  guilds_json TEXT,
  checksum TEXT,
  captured_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_security_state_type ON security_bot_state(state_type, captured_at);
```

### Phase 3: Kernel Logs Migration
**Problem:** Log files in `kernel-logs/`

**Solution:** Already have `log_entries` table in PostgreSQL - redirect kernel logs there.

### Phase 4: Config/Metrics Migration
**Problem:** Scattered JSON config files

**Solution:**
```sql
-- New table in engine-write.db (SQLite)
CREATE TABLE runtime_config (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Migrate:
-- cooldowns.json → runtime_config['cooldowns']
-- restart-metrics.json → runtime_config['restart_metrics']
-- guild-member-timeout-config.json → runtime_config['guild_timeout_config']
```

---

## 4. Target State

After migration, `/Store` should contain ONLY:
```
/Store/
├── engine-write.db           # Primary local SQLite (battle logs, metrics, heap summaries, state)
├── engine-write.db.bak       # Daily backup
└── engine-read.db            # (Future) Read-only reference data cache
```

**Expected disk savings:** ~165 MB (from 166 MB to ~1 MB)

---

## 5. Implementation Tasks

| Task ID | Description | Status | Effort |
|---------|-------------|--------|--------|
| STORE.HEAP_MIGRATION | Parse heapsnapshots → DB | PROPOSED | 3h |
| STORE.SECURITY_STATE | Security bot state → DB | PROPOSED | 2h |
| STORE.KERNEL_LOGS | Kernel logs → PostgreSQL | PROPOSED | 1h |
| STORE.CONFIG_CONSOLIDATE | JSON configs → DB | PROPOSED | 1h |
| STORE.CLEANUP_SCRIPT | Remove migrated files | PROPOSED | 30m |

---

## 6. Target State (Post-Migration)

```
/Store/
├── engine-write.db      (~500 KB - SQLite for battle logs, heap summaries)
├── engine-read.db       (~100 KB - SQLite for reference data cache)
└── (no other files - all writes go to databases)
```

**Expected size**: ~600 KB (databases only)  
**Write frequency**: Database updates only (no new files created)  
**Maintenance required**: NONE (databases handle retention via SQL)

---

## 7. Enforcement

### Build-time Check
```typescript
// scripts/guard_store_policy.ts
const ALLOWED_EXTENSIONS = ['.db', '.db.bak', '.db.backup'];
const files = fs.readdirSync('/Store', { recursive: true });
const violations = files.filter(f => !ALLOWED_EXTENSIONS.some(ext => f.endsWith(ext)));
if (violations.length > 0) {
  console.error('POLICY VIOLATION: Non-DB files in /Store:', violations);
  process.exit(1);
}
```

### Runtime Warning
```typescript
// On startup, warn if non-DB files exist
const nonDbFiles = glob.sync('/Store/**/*').filter(f => !f.endsWith('.db'));
if (nonDbFiles.length > 0) {
  logger.warn('[STORE_POLICY] Non-compliant files detected', { count: nonDbFiles.length });
}
```

---

## 8. Benefits

### Achieved (Phase 1)
1. **Disk efficiency:** 219 MB → 57 MB (74% reduction, -162 MB freed)
2. **Automated retention:** Scripts maintain heap/log/snapshot limits
3. **Sustainable growth:** Daily maintenance prevents accumulation
4. **Zero-downtime cleanup:** No service restarts required

### Target (Full Migration)
1. **Ultimate efficiency:** 57 MB → ~1 MB (98% reduction vs baseline)
2. **Query-ability:** All data accessible via SQL
3. **Backup simplicity:** Single DB file to backup
4. **Atomic operations:** SQLite transactions vs file system race conditions
5. **Retention policies:** Easy `DELETE WHERE captured_at < ?` vs file globbing

---

## 9. References

- [Engine Write-DB Schema](../architecture-bible/03-worker-architecture.md)
- [Security Bot State](../Agents.md#state-persistence-security-bot)
- [Kernel Logging Initiative](../projects/KERNEL-FIRST-LOGGING-INITIATIVE.md)
- **Maintenance Scripts:**
  - `scripts/store-maintenance.sh` - Daily automated cleanup
  - `scripts/cleanup-store-heaps.sh` - Heap snapshot retention
  - `scripts/verify-store-policy.sh` - Compliance verification

---

**Document Status:** POLICY ACTIVE  
**Next Action:** Create STORE.HEAP_MIGRATION task and begin Phase 1
