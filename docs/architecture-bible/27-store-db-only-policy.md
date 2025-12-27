# Section 27: /Store DB-Only Policy

**Last Updated**: 2025-12-27 | **Status**: Policy Defined

**Owner:** DRIPTVDD

---

## 1. Policy Statement

**ABSOLUTE RULE:** The `/Store` persistent disk directory SHALL contain ONLY:
1. **SQLite database files** (`.db`)
2. **Database backups** (`.db.bak`, `.db.backup`)

**ALL other data** (JSON files, logs, heap snapshots, state files) MUST be:
- Parsed and stored in appropriate database tables
- Or migrated to PostgreSQL (cloud) for cross-service access

---

## 2. Current Violation Audit (2025-12-27)

| File Type | Count | Size | Migration Target |
|-----------|-------|------|------------------|
| `.heapsnapshot` | 6 | 163 MB | Parse → `heap_snapshots` table |
| `.json` (state) | 71 | 4.2 MB | → `security_bot_state` table |
| `.log` | 3 | 44 KB | → `kernel_logs` table |
| `cooldowns.json` | 1 | <1 KB | → `cooldowns` table |
| `restart-metrics.json` | 1 | 4 KB | → `restart_metrics` table |
| `guild-member-timeout-config.json` | 1 | 2 KB | → `guild_config` table |
| **Total violations** | **83 files** | **~168 MB** | |

### Compliant Files
| File | Status |
|------|--------|
| `engine-write.db` | ✅ COMPLIANT |

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

## 6. Enforcement

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

## 7. Benefits

1. **Disk efficiency:** 165 MB → 1 MB (99% reduction)
2. **Query-ability:** All data accessible via SQL
3. **Backup simplicity:** Single DB file to backup
4. **Atomic operations:** SQLite transactions vs file system race conditions
5. **Retention policies:** Easy `DELETE WHERE captured_at < ?` vs file globbing

---

## 8. References

- [Engine Write-DB Schema](../architecture-bible/03-worker-architecture.md)
- [Security Bot State](../Agents.md#state-persistence-security-bot)
- [Kernel Logging Initiative](../projects/KERNEL-FIRST-LOGGING-INITIATIVE.md)

---

**Document Status:** POLICY ACTIVE  
**Next Action:** Create STORE.HEAP_MIGRATION task and begin Phase 1
