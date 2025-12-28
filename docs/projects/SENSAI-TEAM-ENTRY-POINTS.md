# SENSAI — Team Entry Points for 10 Specialists

**Date:** 2025-12-28  
**Purpose:** Strategic task allocation for parallel implementation by specialist team  
**Reference:** SENSAI-FINAL-ARCHITECTURE.md v1.1.0

---

## 🎯 EXECUTIVE SUMMARY

For a team of 10 specialists to efficiently implement Sensai, we allocate tasks across 5 parallel workstreams with clear boundaries and minimal cross-dependencies.

**Critical First Decisions** (Team consensus required before coding):
1. Export schema versioning strategy
2. Component upgrade model (single active vs multi-version)
3. Concurrency model choice (advisory locks, row locks, optimistic)
4. Retention policy duration (exports, jobs, outbox, audit)

---

## 📋 WORKSTREAM ALLOCATION

### Workstream 1: SCHEMA FOUNDATION (2 specialists)

**Owner:** Database Architect + Migration Specialist

**Mission:** Lay the database substrate for the entire Sensai system.

**Tasks:**
1. **Create `exports` table** (HIGH PRIORITY)
   - `seq BIGSERIAL UNIQUE NOT NULL` — Monotonic ordering
   - `schema_version INT NOT NULL DEFAULT 1` — Evolution support
   - `source TEXT, type TEXT, payload JSONB`
   - `idempotency_key TEXT, occurred_at TIMESTAMPTZ`
   - `correlation_id UUID, parent_correlation_id UUID`
   - Indexes: `(seq)`, `(type, seq)`, `(idempotency_key)`

2. **Create `export_type_registry`**
   - Track schema versions per export type
   - JSON Schema validation per type
   - Deprecation flags

3. **Create `projection_offsets`**
   - `projection_name TEXT PRIMARY KEY`
   - `last_seq BIGINT NOT NULL DEFAULT 0`
   - Worker checkpoint tracking

4. **Evolve `BusMessage` table**
   - Add `seq BIGSERIAL UNIQUE NOT NULL`
   - Add `schema_version INT DEFAULT 1`
   - Add `next_attempt_at TIMESTAMPTZ`
   - Add `dead_lettered_at TIMESTAMPTZ`
   - Add `partition_key TEXT`

5. **Create Control Plane tables**
   - `component_installations` — What's installed where
   - `component_config` — Per-scope configuration
   - `hosts` — Service registry
   - `worker_runs` — Execution tracking
   - `capability_grants` — RBAC permissions

**Deliverables:**
- Migration files in `prisma/migrations/`
- Schema.prisma updates
- Rollback scripts (if needed)
- Validation queries for data integrity

**Timeline:** 3-5 days

**Dependencies:** NONE (can start immediately)

---

### Workstream 2: KERNEL PRIMITIVES (3 specialists)

**Owner:** Backend Engineers (TypeScript)

**Mission:** Implement the 8 core kernel primitives that components depend on.

**Division:**

#### Specialist 2A: Exports + Jobs
- `ExportsPrimitive` (`src/kernel/primitives/exports.ts`)
  - `append(envelope): Promise<AppendResult>`
  - `query(filter): Promise<ExportEnvelope[]>`
  - `getOffset(projection): Promise<number>`
  - `setOffset(projection, seq): Promise<void>`
  - `consumeFrom(seq, types, limit): Promise<ExportEnvelope[]>`
- `JobsPrimitive` (`src/kernel/primitives/jobs.ts`)
  - `enqueue(envelope): Promise<string>`
  - `lease(kinds, limit): Promise<LeasedJob[]>`
  - `complete(jobId, result): Promise<void>`
  - `fail(jobId, error, retryAfter): Promise<void>`

#### Specialist 2B: Outbox + Config + RBAC
- `OutboxPrimitive` (`src/kernel/primitives/outbox.ts`)
  - `send(envelope): Promise<string>`
  - `markDelivered(id): Promise<void>`
  - `markFailed(id, error): Promise<void>`
- `ConfigPrimitive` (`src/kernel/primitives/config.ts`)
  - `get<T>(key, scope): Promise<T | undefined>`
  - `set<T>(key, value, scope): Promise<void>`
  - `getComponentConfig<T>(component): Promise<T>`
  - `getFeatureFlag(flag, scope): Promise<boolean>`
- `RbacPrimitive` (`src/kernel/primitives/rbac.ts`)
  - `assert(capability, scope): Promise<void>`
  - `check(capability, scope): Promise<boolean>`
  - `audit(event): Promise<void>`

#### Specialist 2C: Storage + RNG + Obs
- `StoragePrimitive` (`src/kernel/primitives/storage.ts`)
  - `putBlob(data, metadata): Promise<string>`
  - `getBlob(id): Promise<Buffer | null>`
  - `putObject(obj): Promise<string>`
  - `getObject(id): Promise<StorageObject | null>`
- `RngPrimitive` (`src/kernel/primitives/rng.ts`)
  - `derive(seedParts): DeterministicRng`
  - Deterministic battle replay support
- `ObsPrimitive` (`src/kernel/primitives/obs.ts`)
  - Structured logging with correlation IDs
  - Metrics integration
  - Tracing context propagation

**Deliverables:**
- 8 primitive implementations
- Unit tests (80%+ coverage)
- Integration tests with database
- TypeScript interfaces in `src/kernel/types.ts`

**Timeline:** 5-7 days

**Dependencies:** Schema migration (Workstream 1)

---

### Workstream 3: COMPONENT SYSTEM (2 specialists)

**Owner:** Systems Architect + DevOps Engineer

**Mission:** Build the component lifecycle management system.

**Tasks:**

#### Specialist 3A: Component Model
1. **Component Manifest Parser** (`src/kernel/component/manifest.ts`)
   - Parse and validate SensaiComponent interfaces
   - Dependency resolution
   - Capability validation

2. **Component Registry** (`src/kernel/component/registry.ts`)
   - Load components from manifest
   - Track installation state (global, host, guild)
   - Version management (single active model recommended)

3. **Component Installer** (`src/kernel/component/installer.ts`)
   - Install/uninstall components
   - Validate prerequisites
   - Database migrations per component

#### Specialist 3B: Runtime & Supervisor
1. **Component Loader** (`src/kernel/component/loader.ts`)
   - Dynamic loading of component code
   - Sandboxing (resource budgets)
   - Error isolation

2. **Component Supervisor** (`src/kernel/component/supervisor.ts`)
   - Hot enable/disable (without restart)
   - Control-plane watcher (poll or LISTEN/NOTIFY)
   - Health monitoring per component

3. **Resource Budget Enforcement**
   - Max cache MB, max concurrency
   - Semaphore-based concurrency caps
   - LRU cache with strict eviction

**Deliverables:**
- Component lifecycle management system
- CLI tools for component operations (`/ops component install|enable|disable`)
- Documentation for component developers
- Example component (simple "hello-world")

**Timeline:** 6-8 days

**Dependencies:** Kernel primitives (Workstream 2)

---

### Workstream 4: LISTEN/NOTIFY + REAL-TIME (2 specialists)

**Owner:** Database + Network Engineers

**Mission:** PostgreSQL LISTEN/NOTIFY with SSL for real-time event streaming.

**Tasks:**

#### Specialist 4A: PostgreSQL Integration
1. **LISTEN/NOTIFY Infrastructure** (`src/kernel/pg-notify/`)
   - Connection pool management
   - SSL/TLS configuration
   - Channel subscription management
   - Reconnection logic (exponential backoff)

2. **Export Streaming**
   - NOTIFY on `exports` INSERT
   - Payload: `{seq, type, source, correlationId}`
   - Rate limiting (max 1000/sec)

3. **Control Plane Events**
   - NOTIFY on `component_installations` changes
   - Hot enable/disable signaling

#### Specialist 4B: Event Router
1. **Real-Time Event Router** (`src/kernel/event-router/`)
   - Subscribe to PostgreSQL NOTIFY
   - Filter by export type patterns
   - Dispatch to registered handlers

2. **Backpressure Management**
   - Per-subscriber queue limits
   - Drop or reject on overflow
   - Monitoring/alerting

3. **Integration with Existing Event Bus**
   - Bridge LISTEN/NOTIFY → event-bus
   - Phased migration from in-memory → Postgres-backed

**Deliverables:**
- LISTEN/NOTIFY library
- SSL connection configuration
- Real-time export streaming
- Performance benchmarks (latency, throughput)

**Timeline:** 5-7 days

**Dependencies:** Schema migration (exports table)

---

### Workstream 5: WORKER MIGRATION (1 specialist + flex support)

**Owner:** Full-Stack Engineer + Support from others

**Mission:** Migrate 1 worker to Sensai component model as proof-of-concept.

**Recommended First Worker:** `cache-worker` (simplest, no Discord dependency)

**Tasks:**
1. **Create Component Manifest** (`src/components/cache-worker/manifest.ts`)
   - Name: `system.cache-refresh`
   - Hosts: `['worker']`
   - Capabilities: `{ db: ['read', 'write'] }`
   - Provides: `{ jobs: ['REFRESH_CACHE'] }`
   - Budget: `{ maxCacheMb: 50, maxConcurrency: 1 }`

2. **Refactor Worker to Component** (`src/components/cache-worker/index.ts`)
   - Use kernel primitives (no direct Prisma)
   - Emit exports on cache refresh
   - Accept jobs for on-demand refresh
   - Use structured logging (ObsPrimitive)

3. **Add Worker Run Tracking**
   - Log start/finish to `worker_runs`
   - Capture input/output references
   - Error tracking with retry logic

4. **Integration Tests**
   - Component install/enable/disable
   - Job processing
   - Export emission
   - Resource budget enforcement

**Deliverables:**
- Migrated cache-worker as Sensai component
- Migration guide document
- Lessons learned for future migrations

**Timeline:** 4-6 days

**Dependencies:** Component system (Workstream 3), Kernel primitives (Workstream 2)

---

## 🚀 RECOMMENDED START SEQUENCE

### Week 1: Foundation
**Day 1-2:** Workstream 1 (Schema) starts immediately  
**Day 3:** Team consensus on critical decisions (see below)  
**Day 4-5:** Workstreams 2, 4 can start (parallel to schema completion)

### Week 2: Core Implementation
**Day 6-8:** Workstream 3 starts (depends on primitives)  
**Day 9-10:** Workstream 5 starts (proof-of-concept)

### Week 3: Integration & Testing
**Day 11-13:** Cross-workstream integration  
**Day 14-15:** End-to-end testing, documentation

---

## 🔒 CRITICAL DECISIONS (MUST RESOLVE BEFORE CODING)

### Decision 1: Export Schema Versioning
**Options:**
- A) Simple version INT in exports table + manual migration
- B) Full JSON Schema validation + automatic upgrade
- C) Protobuf/Avro with schema registry

**Recommendation:** Start with (A), plan for (B)

### Decision 2: Component Upgrade Model
**Options:**
- A) Single active version per scope (simpler) — RECOMMENDED
- B) Multi-version with explicit enabled flag (complex)

**Recommendation:** (A) — Upgrade in place, simpler operations

### Decision 3: Concurrency Model
**Options:**
- Advisory locks for battles/encounters (serialize by entity ID)
- Row locks for inventory/money (SELECT ... FOR UPDATE)
- Optimistic concurrency for config (version field + CAS)

**Recommendation:** Use all three, per use case

### Decision 4: Retention Policies
**Options:**
- Exports: Keep forever, 90 days, 30 days + snapshots?
- Jobs/Outbox: Keep 7 days after completion?
- Audit: Keep forever (partition by month)?

**Recommendation:** Document policy in `docs/sensai/retention-policy.md`

---

## 🎯 SUCCESS CRITERIA

### Phase 1 Complete (Week 1)
- [ ] All schema migrations applied
- [ ] Kernel primitives implemented (80%+ test coverage)
- [ ] LISTEN/NOTIFY working with SSL
- [ ] Component system can install/load/enable components

### Phase 2 Complete (Week 2)
- [ ] At least 1 worker migrated to Sensai component
- [ ] Worker run tracking operational
- [ ] Real-time export streaming demonstrated
- [ ] Performance benchmarks documented

### Phase 3 Complete (Week 3)
- [ ] All workstreams integrated
- [ ] End-to-end tests passing
- [ ] Documentation updated (Architecture Bible)
- [ ] Migration guide for remaining workers

---

## 📚 REFERENCE DOCUMENTS

- **Architecture:** `SENSAI-FINAL-ARCHITECTURE.md` v1.1.0
- **Addendum:** `SENSAI-ARCHITECTURE-ADDENDUM.md` (fully integrated)
- **Schema:** `prisma/schema.prisma` (BusMessage current state)
- **Event Bus:** `src/shared/event-bus.ts` (existing in-memory system)
- **Workers:** `src/workers/**` (current implementations)

---

## 🚨 RISKS & MITIGATIONS

| Risk | Mitigation |
|------|-----------|
| Schema migrations cause downtime | Use non-blocking migrations (ADD COLUMN, CREATE INDEX CONCURRENTLY) |
| Component system too complex | Start with simplest component (cache-worker), iterate |
| LISTEN/NOTIFY unreliable | Add fallback polling mode, document reconnection strategy |
| Performance regression | Benchmark before/after, add metrics, set SLAs |
| Team coordination overhead | Daily standups, clear ownership, async documentation |

---

## 💡 QUICK WINS FOR MOMENTUM

If team wants immediate visible progress:

1. **Add `seq` to BusMessage** (2h) — Non-breaking, shows schema evolution
2. **Create `exports` table** (3h) — Foundation, can test inserts immediately
3. **Implement ExportsPrimitive** (4h) — First kernel primitive working
4. **Add hosts registry** (2h) — Immediate visibility into running services

These 4 quick wins (1-2 days) prove the architecture viability without blocking other work.

---

**Last Updated:** 2025-12-28  
**Approved By:** 10-Specialist Panel + Architecture Team
