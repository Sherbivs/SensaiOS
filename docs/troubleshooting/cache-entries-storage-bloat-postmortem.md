# Post-Mortem: CacheEntry Storage Bloat & Missing Garbage Collection

**Date:** 2026-04-05  
**Severity:** High — Unbounded database growth approaching Render Starter plan limit  
**Duration:** ~3 months (2026-01-08 → 2026-04-05)  
**Impact:** `cache_entries` table grew to 341 MB (88% of 385 MB total DB) with no pruning. Potential cause of weekly memory-related crashes.  
**Resolution:** GC scheduler added to `kernel-persistence.ts` — runs every 4 hours with DB size monitoring

---

## The Numbers

| Metric | Value | Context |
|--------|-------|---------|
| **Render DB Plan** | Legacy Starter | **1 GB storage limit** |
| **Total DB Size** | 385 MB | 38.5% of limit |
| **cache_entries** | 341 MB (88% of DB) | TOAST data dominates |
| **runtime_metrics** | 14 MB | Also unbounded |
| **kernel-logs entries** | 25,114 | Should be ~2,016 with 7-day retention |
| **kernel-snapshots entries** | 1,102 | From Jan 11-15 burst, never cleaned |
| **Growth rate** | ~115 MB/month | **DB full in ~5 months at this rate** |

### Storage Breakdown by Namespace

| Namespace | Entries | Age Range | Status |
|-----------|---------|-----------|--------|
| `kernel-logs` | 25,114 | Jan 8 – Apr 5 (3 months) | **Never pruned** |
| `kernel-snapshots` | 1,102 | Jan 11 – Jan 15 (4 days) | **Never pruned** |
| `resilient-write-buffer` | 566 | Jan 11 – Jan 15 | **Never pruned** |
| `ai-logs` | 105 | Jan 9 – Jan 16 | **Never pruned** |
| `security-bot-state` | 21 | Jan 7 – Apr 5 | Active, small |
| `bot-config` | 1 | Apr 5 | Active, trivial |
| `cooldowns` | 1 | Apr 5 | Active, trivial |

---

## Root Cause

### Write Path (Working)

`initializePersistence()` starts a snapshot scheduler that runs every **5 minutes**:
- Creates 1 `cache_entries` row per snapshot in `kernel-logs` namespace
- Creates 1 `runtime_metrics` row per snapshot
- Each entry includes `expiresAt` set to 7 days in the future
- Correct behavior: 288 snapshots/day × 7 days = ~2,016 entries max

### Cleanup Path (Broken)

`cleanupOldFiles()` existed in `kernel-persistence.ts` and correctly deletes entries older than `retentionDays`. **BUT:**

1. **`cleanupOldFiles()` was never called on any schedule** — no `setInterval`, no cron, no worker
2. **`expiresAt` field was set but never checked** — PostgreSQL doesn't auto-expire rows; application must enforce
3. **No DB size monitoring** — no alerts, no thresholds, no awareness of the 1 GB limit

The cleanup function was dead code since the database-first migration on 2025-12-27. Every snapshot accumulated forever.

### Connection to Weekly Crashes

When the bot processes large queries against the bloated `cache_entries` table:
- TOAST decompression for 341 MB of JSON data causes RAM spikes
- PostgreSQL shared buffers fill → eviction → increased I/O
- Application-side: loading kernel state exports (which include log history) creates large in-memory objects
- Combined with other memory leaks (Activity Tracker, PBSL Audit Trail), this pushes past the 512 MB Starter plan RAM limit → OOM kill → crash → recovery

---

## Render Infrastructure Limits

### Database (Legacy Starter Plan — $7/month)

| Resource | Limit | Current Usage | % Used |
|----------|-------|---------------|--------|
| **Storage** | 1 GB | 385 MB | 38.5% |
| **RAM** | 256 MB | — | Shared |
| **CPU** | 0.1 vCPU | — | Shared |
| **Connections** | 97 | 5 active | 5.2% |

### Worker Services (Starter Plan — $7/month each)

| Resource | Limit | Typical Usage |
|----------|-------|---------------|
| **RAM** | 512 MB | 300-350 MB (58-68%) |
| **CPU** | 0.5 vCPU | Variable |
| **Disk** | 2 GB (/Store) | Minimal (DB-first architecture) |

### Critical Thresholds

- **750 MB** (75% of 1 GB): Warning — reduce retention to 3 days
- **900 MB** (90% of 1 GB): Emergency — reduce retention to 1 day
- **1 GB**: Hard limit — writes fail, service crashes

---

## Fix Implemented

### GC Scheduler in `kernel-persistence.ts`

Added a garbage collection scheduler alongside the existing snapshot scheduler:

```
Startup → 30s delay → Immediate catch-up GC
         ↓
Every 4 hours → runGarbageCollection()
         ↓
Phase 1: Delete expired entries (expiresAt < now) — ALL namespaces
Phase 2: Delete old kernel entries (createdAt < retentionDays cutoff)
Phase 3: Delete old RuntimeMetric records (kernel-snapshot, kernel-crash)
Phase 4: Check DB size → aggressive prune if over thresholds
```

### DB Size Monitoring

The GC phase 4 queries `pg_database_size()` every 4 hours:
- **Under 750 MB**: Normal — 7-day retention enforced
- **750-899 MB**: Warning — automatically reduces retention to 3 days
- **900+ MB**: Emergency — automatically reduces retention to 1 day

### Resilience

- Consecutive failure backoff (3 failures → 1 min pause → restart)
- Each GC phase is independent (one phase failure doesn't block others)
- Stats exposed via `getPersistenceStats().gc` for `/ops` monitoring

### Configuration

```typescript
interface PersistenceConfig {
  gcIntervalMs: number;       // Default: 4 hours
  dbSizeWarnMb: number;       // Default: 750 MB (75%)
  dbSizeEmergencyMb: number;  // Default: 900 MB (90%)
  retentionDays: number;      // Default: 7 days
}
```

---

## Expected Impact After First GC Run

| Metric | Before | After (expected) |
|--------|--------|-------------------|
| kernel-logs entries | 25,114 | ~2,016 (7 days) |
| kernel-snapshots entries | 1,102 | 0 (all older than 7 days) |
| resilient-write-buffer | 566 | 0 (all older than 7 days) |
| ai-logs | 105 | 0 (all older than 7 days) |
| runtime_metrics | 25,117 | ~2,016 (7 days) |
| **cache_entries size** | **341 MB** | **~30-50 MB** |
| **runtime_metrics size** | **14 MB** | **~1-2 MB** |
| **Total DB size** | **385 MB** | **~70-100 MB** |

---

## Prevention Rules

### Rule 1: Every scheduled writer MUST have a paired cleanup
If a `setInterval` creates data, a `setInterval` must delete it. The two must be in the same module.

### Rule 2: Database size must be monitored
All applications using managed databases must check `pg_database_size()` periodically and alert before reaching limits.

### Rule 3: TTL fields must be enforced
Setting `expiresAt` on a record is meaningless without a process that checks and deletes expired records. PostgreSQL does NOT auto-expire rows.

### Rule 4: Retention budgets must be documented
Every namespace writing to `cache_entries` must document:
- Write frequency
- Expected entry size
- Retention period
- Expected steady-state count and disk usage

---

**Prepared by:** Infrastructure & Database Specialist Team  
**Classification:** Internal — Operations  
**Related:** [security-events-schema-drift-postmortem.md](security-events-schema-drift-postmortem.md)
