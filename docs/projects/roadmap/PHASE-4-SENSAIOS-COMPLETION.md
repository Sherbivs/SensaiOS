# Phase 4 — SensaiOS Architecture Completion

**Priority:** 🟡 HIGH (infrastructure modernization)  
**Effort:** 2–3 weeks  
**Depends On:** Phase 0 (correctness), Phase 2 (GameServer API)  
**Unlocks:** Phase 5 (launch readiness)  
**Parallel With:** Phase 1 (slash commands), Phase 3 (gameplay depth)  

---

## Objective

Complete the SensaiOS operating system layer so the game runs through the formal kernel → component → handler pipeline instead of the ad-hoc direct path. This is the "proper architecture" track that enables:

- **Component hot-swap** — Disable/enable features without restart
- **Observability** — Structured logs, metrics, correlation IDs on every operation
- **Multi-tenancy** — Per-guild isolation via TenantScope
- **Security** — RBAC capability checks on all game operations
- **Auditability** — Every action recorded in the export log

### Current State

SensaiOS exists as code but is **not wired into the main boot sequence**:

```
src/index.ts → boots Discord client directly (no kernel)
src/sensaios/kernel-boot.ts → exists but NOT imported by index.ts
src/sensaios/gameserver/api.ts → exists with 15 TODO stubs
src/sensaios/component-context.ts → fully defined (1,034 lines)
src/sensaios/run-guarded.ts → fully implemented (455 lines)
```

The bot works today through the **direct path** (homestead buttons → services → DB). The goal is to add the SensaiOS path as an optional, progressively-adopted layer.

---

## 4.1 — Kernel Boot Integration

### Problem

`src/index.ts` boots the Discord client directly without initializing the SensaiOS kernel. The kernel boot sequence in `src/sensaios/kernel-boot.ts` is never called.

### Investigation Steps

1. **Read `src/index.ts`** (full file) — Understand the current boot sequence:
   - What initializes first? (logger, Prisma, Discord client?)
   - Where would kernel boot fit?
   - What globals are set? (`global.engineReady`, etc.)
2. **Read `src/sensaios/kernel-boot.ts`** — Full kernel boot sequence:
   - What does it initialize? (primitives, supervisor, control plane?)
   - What does it depend on? (database, config?)
   - What does it return? (KernelContext?)
3. **Read `src/sensaios/supervisor.ts`** (if exists) — Component lifecycle manager
4. **Read `src/kernel/` directory** — Core kernel primitives

### Design: Progressive Integration

```
CURRENT BOOT SEQUENCE:
  1. Load env → 2. Init Prisma → 3. Init Discord client → 4. Register handlers → 5. Login

PROPOSED BOOT SEQUENCE:
  1. Load env
  2. Init Boot Logger (observability-first, per v1.1.2)
  3. Init Prisma
  4. Boot SensaiOS Kernel (NEW)
     ├── Initialize kernel primitives (db, exports, jobs, outbox)
     ├── Load component manifests
     ├── Enable components (sets up handler registry)
     └── Set global.kernelReady = true
  5. Init Discord client
  6. Register handlers (from kernel component registry)
  7. Login

FALLBACK: If kernel boot fails, fall back to direct path
  - Log warning: "SensaiOS kernel boot failed, using direct path"
  - Set global.kernelReady = false
  - Continue with current boot sequence
```

### Implementation Plan

```
1. Create: src/sensaios/kernel-integration.ts
   - Export: initializeKernel(config): Promise<KernelContext | null>
   - Try/catch: return null on failure (graceful degradation)
   
2. Update: src/index.ts
   - Import kernel integration
   - Call after Prisma init, before Discord client
   - Store result in global.kernelContext
   - If null: log warning, continue with direct path
   
3. Create: src/sensaios/kernel-feature-flag.ts
   - SENSAIOS_KERNEL_ENABLED env var (default: false)
   - When false: skip kernel boot entirely
   - When true: attempt kernel boot with fallback
   
4. Test: 
   - Boot with SENSAIOS_KERNEL_ENABLED=false → direct path works
   - Boot with SENSAIOS_KERNEL_ENABLED=true → kernel boots, direct path still works
```

### Acceptance Criteria

- [ ] Kernel boot sequence callable from src/index.ts
- [ ] Feature flag controls kernel boot (off by default)
- [ ] Graceful fallback if kernel boot fails
- [ ] Boot logger outputs before database connection
- [ ] No regression: existing direct path works identically

---

## 4.2 — Component Manifest Registration

### Problem

The `manifests/` directory contains 3 component manifests (battle-engine, discord-bot, encounter-system) but they're not loaded by the kernel supervisor.

### Investigation Steps

1. **Read `manifests/battle-engine.manifest.json`** — Structure, capabilities declared
2. **Read `manifests/discord-bot.manifest.json`** — Discord component manifest
3. **Read `manifests/encounter-system.manifest.json`** — Encounter component manifest
4. **Read `src/sensaios/supervisor.ts`** (if exists) — Does it load manifests?
5. **Read `src/sensaios/component-context.ts`** — ComponentContext interface, what it provides

### Implementation Plan

```
1. Create: src/sensaios/manifest-loader.ts
   - loadManifests(dir: string): ComponentManifest[]
   - Validate manifest schema
   - Resolve dependencies between components
   
2. Create: src/sensaios/component-registry.ts
   - register(manifest): void
   - enable(componentName): void
   - disable(componentName): void
   - getComponent(name): ComponentInstance
   
3. Update supervisor:
   - Load all manifests from manifests/ directory
   - Validate capability declarations
   - Enable components in dependency order
   
4. Verify: Components can be enabled/disabled without restart
```

### Acceptance Criteria

- [ ] All 3 manifests loaded on kernel boot
- [ ] Components registered with correct capabilities
- [ ] Dependency order resolved (discord-bot before battle-engine)
- [ ] `/ops components` command shows loaded components (future)
- [ ] Disabling a component stops its handlers without crash

---

## 4.3 — Envelope Migration (79 console.* calls remaining)

### Current State

The envelope logging system exists at `src/observability/envelope/` and works. 8 files have been migrated. ~79 raw `console.*` calls remain in non-test, non-generated source code.

### Reference

**Full migration guide:** `.github/instructions/envelope-migration.instructions.md`

### Remaining Work by Tier

| Tier | Files | Estimated Calls | Priority |
|------|-------|----------------|----------|
| Tier 1: Core Logging | `src/utils/logger.ts` (17 calls) + 2 AI log files | ~25 | HIGH |
| Tier 2: Bot Layer | `src/bot/main.js`, `src/bot/index.ts`, homestead/*.ts | ~20 | HIGH |
| Tier 3: Core Engines | `src/core/battle/*.ts`, `src/core/encounter/*.ts` | ~10 | MEDIUM |
| Tier 4: Services | `src/services/**/*.ts` | ~10 | MEDIUM |
| Tier 5: Workers | `src/workers/**/*.ts` | ~10 | LOW |
| Tier 6: Scripts | `scripts/**/*.ts` | ~4 | LOW |

### Migration Pattern (Quick Reference)

```typescript
// BEFORE:
console.log('[Battle] Turn resolved:', turnResult);

// AFTER:
import { scopedLogger } from '../../observability/envelope/console.js';
const log = scopedLogger('battle-engine');
log.info('turn-resolved', 'Turn resolved', { turnResult });
```

### Implementation Plan

```
1. Start with Tier 1 (logger.ts) — highest impact, single file
2. Progress through tiers in order
3. After each file: npm run build (verify no errors)
4. After every 5 files: npm test (verify no regressions)
5. Remove eslint-disable no-console comments as files are migrated
```

### Acceptance Criteria

- [ ] Zero raw `console.*` calls in src/ (except intentional CLI output)
- [ ] Zero `eslint-disable no-console` comments
- [ ] All logs structured as JSON (Loki-ready)
- [ ] Build passes with 0 errors
- [ ] Tests pass (0 regressions)

---

## 4.4 — Ring Boundary Enforcement

### Current State

The Ring security model is documented (`docs/projects/SensaiOS/architecture/06-os-security-model.md`) and ESLint rules are configured, but enforcement may be incomplete.

### Investigation Steps

1. **Read `eslint.config.js`** — Are `import/no-restricted-paths` rules configured?
2. **Run `npx eslint src/ --rule '{import/no-restricted-paths: error}'`** — Any violations?
3. **Grep for cross-ring imports:**
   ```
   # Ring 3 → Ring 0 (FORBIDDEN)
   grep -r "from.*kernel/" src/bot/ src/core/ src/services/
   
   # Ring 3 → Ring 1 (FORBIDDEN)
   grep -r "from.*sensaios/" src/bot/ src/core/ src/services/
   ```

### Ring Definitions

| Ring | Paths | Can Import From |
|------|-------|----------------|
| Ring 0 (Kernel) | `src/kernel/**` | Nothing above |
| Ring 1 (SensaiOS) | `src/sensaios/**` | Ring 0 only |
| Ring 3 (Apps) | `src/bot/**`, `src/core/**`, `src/services/**` | Ring 3 only (use ComponentContext) |

### Known Violations to Investigate

The previous audit found 32 imports from `sensaios/` in bot/homestead files — specifically importing `gameserver/singleton`. This may be an acceptable bridge pattern during migration, but needs assessment.

### Implementation Plan

```
1. Audit all cross-ring imports
2. Categorize: 
   - VIOLATION (fix immediately)
   - BRIDGE (acceptable during migration, track for future fix)
   - CORRECT (proper use via ComponentContext)
3. Fix violations where possible
4. Document bridge patterns with migration plan
5. Ensure ESLint rules catch new violations
```

### Acceptance Criteria

- [ ] All Ring 0 → Ring 1/3 imports blocked
- [ ] All Ring 1 → Ring 3 imports blocked
- [ ] Bridge patterns documented and tracked
- [ ] ESLint config enforces ring boundaries
- [ ] New code can't introduce ring violations

---

## 4.5 — Export Log (Append-Only Event Log)

### Current State

The `ctx.exports` primitive is defined in `ComponentContext` but the actual export log table/infrastructure needs investigation.

### Investigation Steps

1. **Check Prisma schema** — Is there an `Export` or `EventLog` table?
2. **Read `src/sensaios/component-context.ts`** — How is `ctx.exports` implemented?
3. **Check for monotonic sequence** — Does the export log have a sequence column?

### Implementation Plan

```
1. If Export table doesn't exist:
   - Create Prisma migration: AddExportLog
   - Fields: id, seq (auto-increment), source, type, scope (JSON), 
             idempotencyKey, payload (JSON), occurredAt, correlationId

2. Implement ExportsPrimitive:
   - append(envelope): insert row with next seq
   - query(filter): select with WHERE clauses
   - consumeFrom(seq, types): ordered query for projections

3. Wire into ComponentContext:
   - ctx.exports.append() available to all components
```

### Acceptance Criteria

- [ ] Export log table exists with monotonic sequence
- [ ] Components can append exports
- [ ] Exports are queryable by type, source, time range
- [ ] Idempotency key prevents duplicate inserts
- [ ] Export log is append-only (no updates or deletes)

---

## 4.6 — Job Queue Infrastructure

### Current State

The `ctx.jobs` primitive is defined but needs investigation for actual implementation.

### Investigation Steps

1. **Check Prisma schema** — Is there a `Job` or `BackgroundJob` table?
2. **Read existing worker infrastructure** — `src/workers/` directory
3. **Check for existing queue patterns** — Event Bus, BusMessage table?

### Implementation Plan

```
1. If Job table doesn't exist:
   - Create migration: AddJobQueue
   - Fields: id, kind, scope (JSON), payload (JSON), status, 
             scheduledFor, leasedUntil, leasedBy, attempts, 
             completedAt, failedAt, error, correlationId

2. Implement JobsPrimitive:
   - enqueue(envelope): insert with status=PENDING
   - lease(kinds, limit): SELECT FOR UPDATE SKIP LOCKED
   - complete(jobId, result): update status=COMPLETED
   - fail(jobId, error, retryAfter): update status=FAILED, schedule retry

3. Create job worker loop:
   - Poll for leasable jobs
   - Execute job handlers
   - Retry failed jobs with backoff
```

### Acceptance Criteria

- [ ] Job table exists with proper locking support
- [ ] Jobs can be enqueued with TenantScope
- [ ] Workers lease and process jobs reliably
- [ ] Failed jobs retry with exponential backoff
- [ ] Job throughput meets game requirements

---

## 4.7 — Dead Code Cleanup

### Current State

The dead code analysis methodology exists (`docs/development-bible/10-dead-code-analysis.md`) and a cleanup plan exists (`ops/CLEANUP-PLAN-MEETING-1.md`).

### Investigation Steps

1. **Read cleanup plan** — What was identified in Meeting #1?
2. **Run dead code detection:**
   ```
   # Zero imports check
   grep -rL "import" src/**/*.ts | head -20
   
   # Unused exports
   # (need tool like ts-prune or knip)
   ```
3. **Check for stub files** — Files with `throw new Error("Not implemented")`

### Implementation Plan

```
1. Install knip (dead code detector): npx knip
2. Review results — categorize by evidence tier
3. Delete Tier A (provably dead) immediately
4. Investigate Tier B (strong evidence) 
5. Document Tier C (heuristic) for future meetings
6. NEVER delete Tier D (speculative only)
```

### Acceptance Criteria

- [ ] Tier A dead code removed (zero-import files, unreachable code)
- [ ] Tier B dead code investigated and resolved
- [ ] Dead code analysis report updated
- [ ] Build passes, tests pass after cleanup

---

## Phase 4 Dependency Graph

```
                    ┌─────────────────┐
                    │   4.1 Kernel    │
                    │   Boot Integ    │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───────┐  ┌──▼────────┐  ┌──▼────────┐
     │ 4.2 Component  │  │ 4.5 Export │  │ 4.6 Job   │
     │ Registration   │  │ Log       │  │ Queue     │
     └────────┬───────┘  └───────────┘  └───────────┘
              │
     ┌────────▼───────┐
     │ 4.4 Ring       │
     │ Boundaries     │
     └────────────────┘

  (Independent, any order)
     ┌────────────────┐  ┌────────────────┐
     │ 4.3 Envelope   │  │ 4.7 Dead Code  │
     │ Migration      │  │ Cleanup        │
     └────────────────┘  └────────────────┘
```

---

## Phase 4 Checklist

| # | Task | Effort | Risk | Priority |
|---|------|--------|------|----------|
| 4.1 | Kernel boot integration | 3–4 days | High | HIGH |
| 4.2 | Component manifest registration | 2–3 days | Medium | HIGH |
| 4.3 | Envelope migration (79 calls) | 2–3 days | Low | MEDIUM |
| 4.4 | Ring boundary enforcement | 1–2 days | Low | MEDIUM |
| 4.5 | Export log infrastructure | 2–3 days | Medium | HIGH |
| 4.6 | Job queue infrastructure | 2–3 days | Medium | MEDIUM |
| 4.7 | Dead code cleanup | 1–2 days | Low | LOW |

**Total Phase 4 effort:** 2–3 weeks

**Key Insight:** Task 4.1 (kernel boot) is the lynchpin. Once the kernel boots, everything else in this phase becomes incremental. The feature flag approach means this can be done safely — the direct path continues to work while the kernel path is built out.

---

*Parent: [ROADMAP-INDEX.md](ROADMAP-INDEX.md) | Prev: [Phase 3 — Gameplay Depth](PHASE-3-GAMEPLAY-DEPTH.md) | Next: [Phase 5 — Launch Readiness](PHASE-5-LAUNCH-READINESS.md)*
