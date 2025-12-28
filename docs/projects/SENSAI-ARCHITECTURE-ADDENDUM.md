# SENSAI — Architecture Addendum (Future‑Proofing + Missing Placeholders)
**Applies to:** SENSAI Final Architecture Specification v1.0.0  
**Date:** 2025-12-28  
**Purpose:** Concrete deltas to make the v1 plan easier to implement, safer to operate, and less brittle when you add future components.
**Status:** INTEGRATED — All recommendations incorporated into v1.1.0

---

> **NOTE:** This addendum has been fully integrated into [SENSAI-FINAL-ARCHITECTURE.md](./SENSAI-FINAL-ARCHITECTURE.md) v1.1.0. This file is preserved for historical reference and attribution.

---

## 1) Decisions to lock in NOW (because they change schema + contracts)

### 1.1 Export ordering and offsets ✅ INTEGRATED
**Problem:** UUID primary keys don't provide a stable ingestion order for projections.  
**Add:** `exports.seq BIGSERIAL` (monotonic ingest sequence) and store offsets by `seq`.

**Why:** Projection workers can consume with `WHERE seq > last_seq ORDER BY seq LIMIT N` without scanning by timestamps.

**Schema delta:**
- `exports(seq BIGSERIAL UNIQUE NOT NULL)`
- `projection_offsets(last_seq BIGINT NOT NULL DEFAULT 0)`

### 1.2 Export schema versioning (evolution without pain) ✅ INTEGRATED
**Add:** `exports.schema_version INT NOT NULL DEFAULT 1`  
**Add:** `export_type_registry(type TEXT PRIMARY KEY, current_version INT, json_schema JSONB, deprecated BOOLEAN)`

**Why:** Lets you validate and upgrade event payloads over time safely.

### 1.3 Component upgrades (you need a first‑class story) ✅ INTEGRATED
Your current `component_installations` allows multiple versions per scope.
Decide one of these models:

**Model A (recommended): single active version per scope** ← CHOSEN
- Unique on `(name, scope_type, scope_id)`
- `version` is mutable (upgraded in place)

**Model B: multiple installed versions, one enabled**
- Keep current unique
- Add `enabled BOOLEAN` but enforce at most one enabled per `(name, scope*)`
- Add `channel` or `active_version`

### 1.4 "Enable/Disable without restart" needs a watcher ✅ INTEGRATED
If hosts must react live to DB toggles, add:
- `kernel.controlplane_watcher` that polls or LISTEN/NOTIFYs
- A "component supervisor" that can hot‑enable/hot‑disable safely

**Minimum:** poll `component_installations.updated_at` every few seconds.

### 1.5 Concurrency model for critical gameplay state ✅ INTEGRATED
Define *one* of:
- **Advisory locks**: `pg_advisory_xact_lock(hashtext(entity_id))` ← CHOSEN for battles/encounters
- **Row locks**: `SELECT ... FOR UPDATE` ← CHOSEN for inventory/money
- **Optimistic concurrency**: `version INT` + compare-and-swap updates ← CHOSEN for config

Do this early for Battles/Encounters/Inventory to prevent race bugs.

### 1.6 Discord I/O vs Outbox (clarify the rule) ✅ INTEGRATED
Synchronous Discord interactions often require an immediate ACK.  
Standardize:
- Allowed direct: `deferReply()` / "ack"
- Everything else: write message intent to outbox and deliver

Optional: `ui` primitive that internally uses outbox but can "fast-path" delivery locally.

### 1.7 Retention policy (exports/jobs/outbox/audit will grow forever) ✅ INTEGRATED
Add a written policy:
- exports: keep forever OR keep 30/90 days + archive snapshots
- audit: keep forever (or long), partition by month
- jobs/outbox: keep N days after completion, then prune

If you can: time‑partition `exports` and `audit_events`.

---

## 2) Schema deltas (minimal + high value)

### 2.1 Jobs table: add scheduling + DLQ ✅ INTEGRATED
Add:
- `next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `dead_lettered_at TIMESTAMPTZ`
- `partition_key TEXT` (optional: serialize per entity)
- Index on `(status, next_attempt_at, priority DESC)`

### 2.2 Outbox: add "next attempt" and a "sending" state ✅ INTEGRATED
Add:
- `status: pending|sending|delivered|failed`
- `next_attempt_at`
- `leased_until`, `leased_by` (or reuse jobs table for outbox)

### 2.3 Host registry (control plane visibility + routing) ✅ INTEGRATED
Add:
- `hosts(host_id TEXT PRIMARY KEY, kind TEXT, version TEXT, started_at, last_heartbeat, labels JSONB)`
- Enables "what is running?" and smarter job routing later.

### 2.4 Worker run tracking (replay + audits) ✅ INTEGRATED
Add:
- `worker_runs(id, worker_kind, input_refs, output_refs, code_version, started_at, finished_at, status, error)`
- Optional now; critical for Phase 5 replay.

---

## 3) Kernel enforcement (turn rules into guardrails)

### 3.1 Single-writer enforcement options ✅ INTEGRATED
**Best (DB-enforced):**
- Separate DB roles per component; GRANT writes only to owned tables.

**Good (app-enforced):**
- Central repositories for canonical writes (no direct Prisma writes outside owner)
- CI checks + tests that fail on cross-table writes

**Also good:** record "writer component" in every mutation audit event.

### 3.2 Budget enforcement ✅ INTEGRATED
You already declare `maxCacheMb/maxConcurrency`. Add enforcement:
- Kernel wraps handlers with semaphores (per-component concurrency caps)
- Kernel cache uses strict size accounting + eviction (no raw Maps)

---

## 4) Operational hardening placeholders (OS-like "maintenance mode")

### 4.1 "Degraded mode" behavior ✅ INTEGRATED
Define what happens when:
- Postgres is slow/unreachable
- Discord API rate limits spike
- Worker queue depth explodes

Include:
- Admission control (reject new exports beyond quota)
- Read-only fallback for `/home`
- Automatic "disable noncritical components" playbook

### 4.2 Disaster recovery drills ✅ INTEGRATED
Document + automate:
- restore from snapshot
- rebuild projections from exports for a 30-day window
- verify determinism by replaying sampled battles

---

## 5) Future Tier 2 sandbox (runtime install) — keep as a placeholder only
When you eventually do runtime installs:
- Store WASM bundles in object store
- Require signed bundles + capability whitelists
- Expose only narrow syscalls: exports/jobs/outbox/storage/rng/time

Don't build this until Tier 1 is boring.

---

## 6) A clean implementation sequence (safe in production) ✅ INTEGRATED

1) Add `exports.seq` + projection offsets by seq
2) Implement jobs leasing using `FOR UPDATE SKIP LOCKED`
3) Implement outbox leasing/delivery + retries
4) Add control-plane watcher for enable/disable
5) Migrate one component end-to-end (security.guard is ideal)
6) Add retention + pruning workers
7) Add worker_runs tracking + replay harness

---

## 7) "If you only add 3 things…" ✅ ALL INTEGRATED

1) Export `seq` offsets ✅
2) Control-plane watcher for live enable/disable ✅
3) Concurrency model for battles/encounters (locks or optimistic concurrency) ✅

These three reduce 80% of the future pain.

---

**Integration Status:** COMPLETE  
**Integrated Into:** SENSAI-FINAL-ARCHITECTURE.md v1.1.0  
**Integration Date:** December 28, 2025
