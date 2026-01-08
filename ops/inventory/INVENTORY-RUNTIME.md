# Runtime Data Inventory

**Created:** 2026-01-06T14:20:00Z  
**Purpose:** Inventory of runtime-generated files in `Store/`  
**Status:** ✅ COMPLETE — 2,162+ files (most via cluster declarations)  
**Cross-Reference:** [INVENTORY-INDEX.md](INVENTORY-INDEX.md)

---

## 📊 Summary

| Category | Files | Type | Status |
|----------|-------|------|--------|
| Root Files | 6 | Individual | Inventoried |
| PostgreSQL Cluster | 1,521 | **CLUSTER** | Volume |
| Error Reports | 420 | **CLUSTER** | Ephemeral |
| Emergency Logs | 174 | **CLUSTER** | Ephemeral |
| Kernel Logs | 30 | **CLUSTER** | Ephemeral |
| Security State | 7 | Individual | Inventoried |
| Discord Cache | 2 | Individual | Inventoried |
| Kernel State | 5 | Individual | Inventoried |
| **TOTAL** | **2,162+** | — | — |

---

## ⚠️ Cluster Declaration Policy

Per user directive, files meeting these criteria are declared as **CLUSTERS** rather than individually inventoried:

1. **Ephemeral** — Generated during runtime, subject to rotation/cleanup
2. **Timestamped** — Files with datetime in filename
3. **Retention-Controlled** — Subject to automatic pruning
4. **High Volume** — Count varies frequently (daily additions)
5. **PostgreSQL Data** — Binary database cluster files

**Cluster entries show:** Directory path, approximate count, file pattern, retention policy

---

## Root Files (`Store/`) — 6 files

| File | Size | Tag | Description |
|------|------|-----|-------------|
| `.gitignore` | — | #meta | Git ignore for Store |
| `ROUTER.md` | — | #doc | Store directory router |
| `engine-write-db.sqlite` | — | #db | Engine write database (SQLite) |
| `engine-write.db` | — | #db | Engine write DB (legacy) |
| `guild-member-timeout-config.json` | — | #config | Guild timeout configuration |
| `restart-metrics.json` | — | #obs | Service restart metrics |

---

## 🔷 CLUSTER: PostgreSQL Data (`Store/onpremise-dev-primary/`) — ~1,521 files

**Type:** Database Cluster  
**Pattern:** PostgreSQL data directory structure  
**Retention:** Persistent (until bootstrap refresh)  
**Purpose:** Local development PostgreSQL instance

### Structure (NOT individually inventoried)
```
onpremise-dev-primary/
├── base/                    # Table data files
├── global/                  # Cluster-wide tables
├── pg_commit_ts/            # Commit timestamps
├── pg_dynshmem/             # Dynamic shared memory
├── pg_logical/              # Logical replication
├── pg_multixact/            # Multi-transaction files
├── pg_notify/               # NOTIFY queue
├── pg_replslot/             # Replication slots
├── pg_serial/               # Serialized transactions
├── pg_snapshots/            # Exported snapshots
├── pg_stat/                 # Statistics files
├── pg_stat_tmp/             # Temp statistics
├── pg_subtrans/             # Subtransaction data
├── pg_tblspc/               # Tablespace links
├── pg_twophase/             # Two-phase commit
├── pg_wal/                  # Write-ahead log
├── pg_xact/                 # Transaction commit log
├── postgresql.auto.conf     # Auto-generated config
├── postgresql.conf          # Main configuration
├── pg_hba.conf              # Host authentication
├── pg_ident.conf            # Ident mapping
├── PG_VERSION               # Version marker
├── postmaster.opts          # Startup options
└── postmaster.pid           # Process ID (when running)
```

**Managed By:** `npm run ops:bootstrap-onpremise-dev`  
**Documentation:** `docs/WORKSTATION-GAMEPLAY-SETUP.md`

---

## 🔷 CLUSTER: Error Reports (`Store/error-reports/`) — ~420 files

**Type:** Ephemeral Logs  
**Pattern:** `error-report-{timestamp}.json`  
**Retention:** 7 days (automatic cleanup)  
**Purpose:** Detailed error reports for debugging

### Sample Files
```
error-report-2025-12-15T10-30-00.json
error-report-2025-12-15T14-45-22.json
error-report-2025-12-16T08-15-33.json
...
```

**Managed By:** Error tracking system  
**Cleanup:** `scripts/cleanup-error-reports.ts`

---

## 🔷 CLUSTER: Emergency Error Logs (`Store/emergency-error-logs/`) — ~174 files

**Type:** Ephemeral Logs  
**Pattern:** `emergency-{timestamp}.log`  
**Retention:** 14 days  
**Purpose:** Critical error logs when normal logging fails

### Sample Files
```
emergency-2025-12-10T22-00-00.log
emergency-2025-12-11T03-15-45.log
emergency-2025-12-12T16-30-00.log
...
```

**Managed By:** Emergency fallback logger  
**Cleanup:** Manual or automated pruning

---

## 🔷 CLUSTER: Kernel Logs (`Store/kernel-logs/`) — ~30 files

**Type:** Ephemeral Logs  
**Pattern:** `kernel-{date}.log` or `kernel-{component}-{date}.log`  
**Retention:** 30 days  
**Purpose:** SensaiOS kernel operation logs

### Sample Files
```
kernel-2025-12-01.log
kernel-boot-2025-12-05.log
kernel-supervisor-2025-12-10.log
...
```

**Managed By:** SensaiOS kernel logger  
**Cleanup:** Log rotation via `tools/log-rotation.ts`

---

## Security Bot State (`Store/security-bot-state/`) — 7 files

**Type:** Persistent State  
**Retention:** Permanent (with backup rotation)

| File | Tag | Description |
|------|-----|-------------|
| `current.json` | #state | Active runtime state |
| `previous.json` | #state | Previous state backup |
| `backup-0.json` | #state | Rotating backup 0 |
| `backup-1.json` | #state | Rotating backup 1 |
| `backup-2.json` | #state | Rotating backup 2 |
| `baselines.json` | #security | Security baselines |
| `role-archive.json` | #security | Role change archive |

**Managed By:** `src/bot/state/persistence.ts`  
**Migration Note:** As of 2025-12-27, state also persisted to PostgreSQL CacheEntry table

---

## Discord Cache (`Store/discord-cache/`) — 2 files

**Type:** Persistent Cache  
**Retention:** Permanent

| File | Tag | Description |
|------|-----|-------------|
| `guild-channels.json` | #cache | Cached guild channel data |
| `member-roles.json` | #cache | Cached member role mappings |

**Managed By:** `src/services/cache.js`

---

## Kernel State Directories — 5 files total

### AI Logs (`Store/ai-logs/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `ai-context.json` | #state | AI context state |

### Database (`Store/db/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `write-buffer.sqlite` | #db | Write buffer database |

### Kernel Crashes (`Store/kernel-crashes/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `last-crash.json` | #state | Last crash information |

### Kernel Exports (`Store/kernel-exports/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `export-log.json` | #state | Export operation log |

### Kernel Metrics (`Store/kernel-metrics/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `metrics.json` | #obs | Kernel performance metrics |

### Kernel Snapshots (`Store/kernel-snapshots/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `snapshot.json` | #state | Kernel state snapshot |

### Runtime Cache (`Store/runtime-cache/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `cache-state.json` | #cache | Runtime cache state |

### Monitoring (`Store/monitoring/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `health-state.json` | #obs | Health monitoring state |

### Test (`Store/test/`) — 1 file

| File | Tag | Description |
|------|-----|-------------|
| `test-data.json` | #test | Test fixture data |

---

## Empty Directories

These directories exist but contain no files (used at runtime):

| Directory | Purpose |
|-----------|---------|
| `Store/logs/` | General log output |
| `Store/loki-logs/` | Loki log aggregation |

---

## Cluster Summary Table

| Cluster | Location | Pattern | Count | Retention |
|---------|----------|---------|-------|-----------|
| PostgreSQL | `onpremise-dev-primary/` | Database cluster | ~1,521 | Persistent |
| Error Reports | `error-reports/` | `error-report-*.json` | ~420 | 7 days |
| Emergency Logs | `emergency-error-logs/` | `emergency-*.log` | ~174 | 14 days |
| Kernel Logs | `kernel-logs/` | `kernel-*.log` | ~30 | 30 days |

**Total Cluster Files:** ~2,145  
**Total Individual Files:** 17  
**Grand Total:** ~2,162 files

---

## Tag Reference

| Tag | Description | Count |
|-----|-------------|-------|
| `#db` | Database files | 3 |
| `#state` | State persistence | 9 |
| `#obs` | Observability/metrics | 3 |
| `#cache` | Cache data | 3 |
| `#security` | Security data | 2 |
| `#config` | Configuration | 1 |
| `#meta` | Meta files | 1 |
| `#doc` | Documentation | 1 |
| `#test` | Test data | 1 |

---

**Last Updated:** 2026-01-06T14:20:00Z
