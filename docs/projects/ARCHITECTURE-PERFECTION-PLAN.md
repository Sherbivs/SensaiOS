# Architecture Perfection Master Plan

**Created:** 2025-12-15
**Status:** Active
**Owner:** AI Architect + DRIPTVDD

---

## Executive Summary

A systematic, phased approach to perfecting the Infinity Gauntlet architecture. This plan respects:
- Prisma as the central ORM (don't break generated types)
- Production stability (incremental changes with validation gates)
- Test coverage requirements (maintain 90%+ on critical paths)
- Documentation standards (ROUTER.md updates for all changes)

---

## Phase 0: Audit & Baseline (Current Phase)

### Metrics Collected

| Metric | Count | Notes |
|--------|-------|-------|
| **`any` type usages** | ~56 | Excluding generated Prisma code |
| **TODO comments** | 19 | In production code |
| **DEPRECATED markers** | 6 | Legacy code to remove |
| **Files in src/shared/** | 30+ | Candidate for reorganization |
| **Files in src/services/** | 40+ | Some overlap identified |

### Files with Most `any` Types (Priority Order)

| File | Count | Category |
|------|-------|----------|
| `src/bot/ops/admin.ts` | 11 | Bot Layer |
| `src/shared/pg-query.ts` | 4 | Database Layer |
| `src/shared/models/party-queries-pg.ts` | 4 | Database Layer |
| `src/shared/models/encounter-queries-pg.ts` | 4 | Database Layer |
| `src/bot/battle/actions.ts` | 4 | Game Engine |
| `src/shared/event-bus.ts` | 3 | Core Infrastructure |
| `src/shared/models/battle-queries-pg.ts` | 3 | Database Layer |
| `src/shared/service-registry.ts` | 3 | Core Infrastructure |

### TODO Debt Inventory

| Priority | TODO | File | Line |
|----------|------|------|------|
| 🔴 CRITICAL | PROD upload implementation | `engine-write-db.ts` | 753 |
| 🔴 CRITICAL | PROD upload via worker | `engine-write-worker.ts` | 526 |
| 🟡 HIGH | Batch optimization | `player-resolver.ts` | 322 |
| 🟡 HIGH | Load from Read-DB | `engine-cache.ts` | 1107 |
| 🟡 MEDIUM | Memory tracking per worker | `metrics-collector.ts` | 144 |
| 🟡 MEDIUM | CPU tracking | `metrics-collector.ts` | 145 |
| 🟡 MEDIUM | Cache size query | `resource-monitor.ts` | 1000 |
| 🟢 LOW | Uptime from last error | `system-health-monitor.ts` | 321 |
| 🟢 LOW | Cold storage archival | `retention-policy-service.ts` | 717 |
| 🟢 LOW | DripAlerts integration | `homestead-integrity.ts` | 102 |
| 🟢 LOW | Re-queue failed entries | `engine-write-buffer.ts` | 353 |
| 🟢 LOW | Prisma migration status | `homestead-manager.ts` | 108, 490 |
| 🟢 LOW | User impact estimation | `error-tracker.ts` | 563 |

### Deprecated Code Inventory

| Item | Location | Action |
|------|----------|--------|
| `loadFromReadDb()` | `engine-cache.ts:503` | Remove - tiered loading replaced |
| `DEFAULT_STARTER_COINS` | `constants.ts:200` | Remove - use GAME_CONSTANTS |
| `DEFAULT_TIME_ZONE` | `constants.ts:203` | Remove - use TIME_CONSTANTS |
| `MAX_RECENT_ERRORS` | `constants.ts:206` | Remove - use MONITORING_CONSTANTS |
| Legacy observability | `legacy-stubs.ts:503-509` | Migrate consumers, delete file |

---

## Phase 1: Type Safety Foundation

### Objective
Replace `any` types with proper TypeScript types across the codebase.

### Approach
1. **Create base type definitions** in `src/types/`
2. **Database row types** derived from Prisma schema
3. **Event payload types** for event-bus
4. **Service interface contracts** for registry

### Sprint 1.1: Database Row Types (Est. 2 hours)

Create `src/types/database-rows.ts`:
```typescript
// Derived from Prisma schema - typed row results from raw queries
export interface BattleRow {
  id: bigint;
  status: string;
  trainerId: bigint;
  opponentId: bigint;
  // ... full type definition
}

export interface PartyRow {
  id: bigint;
  userId: bigint;
  isActive: boolean;
  // ... full type definition
}
```

**Files to migrate:**
- [ ] `src/shared/models/battle-queries-pg.ts` (3 any)
- [ ] `src/shared/models/party-queries-pg.ts` (4 any)
- [ ] `src/shared/models/encounter-queries-pg.ts` (4 any)
- [ ] `src/shared/models/bus-queries-pg.ts` (1 any)
- [ ] `src/services/home-bundle-pg.ts` (2 any)

### Sprint 1.2: Event Bus Generics (Est. 1 hour)

Transform event-bus to use generics:
```typescript
// Before
emit(topic: string, payload: any): CorrelationId

// After
emit<T extends EventPayload>(topic: string, payload: T): CorrelationId

// With typed payloads
interface EventPayloadMap {
  'battle.started': BattleStartedPayload;
  'battle.ended': BattleEndedPayload;
  'encounter.spawned': EncounterSpawnedPayload;
  // ... etc
}
```

**Files to migrate:**
- [ ] `src/shared/event-bus.ts` (3 any)

### Sprint 1.3: Service Registry Types (Est. 1 hour)

Create service interface contracts:
```typescript
// src/types/service-contracts.ts
export interface ServiceInstance {
  getStats?(): ServiceStats;
  shutdown?(): Promise<void>;
  healthCheck?(): Promise<boolean>;
}

export interface ServiceStats {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  metrics: Record<string, number>;
}
```

**Files to migrate:**
- [ ] `src/shared/service-registry.ts` (3 any)
- [ ] `src/shared/service-factories.ts` (8 any)

### Sprint 1.4: Bot Layer Types (Est. 1.5 hours)

**Files to migrate:**
- [ ] `src/bot/ops/admin.ts` (11 any) - Highest count
- [ ] `src/bot/battle/actions.ts` (4 any)
- [ ] `src/bot/battle/conclude.ts` (2 any)

### Sprint 1.5: Monitoring Types (Est. 1 hour)

**Files to migrate:**
- [ ] `src/services/monitoring/error-tracker.ts` (1 any)
- [ ] `src/services/monitoring/error-learning.ts` (1 any)
- [ ] `src/services/monitoring/resource-manager.ts` (2 any)

### Validation Gate
- [ ] `npm run lint` passes with 0 errors
- [ ] `npm test` passes (maintain coverage)
- [ ] No runtime type errors in logs

---

## Phase 2: Error Hierarchy

### Objective
Create a centralized error class hierarchy for consistent error handling.

### Structure
```
src/errors/
├── index.ts                    # Barrel export
├── base-error.ts               # InfinityGauntletError base class
├── database-errors.ts          # DB-specific errors
├── discord-errors.ts           # Discord API errors
├── game-errors.ts              # Game engine errors
├── validation-errors.ts        # Input validation errors
└── worker-errors.ts            # Worker-specific errors
```

### Base Error Class
```typescript
// src/errors/base-error.ts
export class InfinityGauntletError extends Error {
  public readonly code: string;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly timestamp: Date;
  public readonly context?: Record<string, unknown>;
  
  constructor(
    message: string,
    code: string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.category = category;
    this.severity = severity;
    this.timestamp = new Date();
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
  
  toJSON(): ErrorJSON {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      severity: this.severity,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
    };
  }
}
```

### Domain Errors
```typescript
// src/errors/database-errors.ts
export class DatabaseConnectionError extends InfinityGauntletError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'DB_CONNECTION_FAILED', 'database', 'critical', context);
  }
}

export class QueryTimeoutError extends InfinityGauntletError {
  constructor(query: string, timeoutMs: number) {
    super(
      `Query timed out after ${timeoutMs}ms`,
      'DB_QUERY_TIMEOUT',
      'database',
      'high',
      { query: query.slice(0, 100), timeoutMs }
    );
  }
}
```

### Validation Gate
- [ ] All custom errors extend InfinityGauntletError
- [ ] Error taxonomy integration updated
- [ ] Error tracker recognizes new error types
- [ ] ROUTER.md created for src/errors/

---

## Phase 3: Config Centralization

### Objective
Move scattered configuration to a centralized, validated config system.

### Structure
```
src/config/
├── index.ts                    # Main config export
├── schema.ts                   # Zod validation schemas
├── database.config.ts          # Database configs
├── discord.config.ts           # Bot configs
├── workers.config.ts           # Worker configs
├── monitoring.config.ts        # Observability configs
├── game.config.ts              # Game constants
└── ROUTER.md                   # Documentation
```

### Config with Validation
```typescript
// src/config/schema.ts
import { z } from 'zod';

export const DatabaseConfigSchema = z.object({
  prodUrl: z.string().url(),
  onPremiseDevUrl: z.string().url().optional(),
  onPremiseExperimentUrl: z.string().url().optional(),
  heartbeatIntervalMs: z.number().min(1000).default(30000),
  maxRetries: z.number().min(0).max(10).default(3),
  connectionTimeoutMs: z.number().min(1000).default(10000),
});

export const DiscordConfigSchema = z.object({
  token: z.string().min(50),
  clientId: z.string().regex(/^\d+$/),
  guildId: z.string().regex(/^\d+$/).optional(),
  ownerId: z.string().regex(/^\d+$/),
});
```

### Migration Plan
1. Create config schemas with Zod
2. Create config loader with validation
3. Migrate existing configs one-by-one
4. Update consumers to use centralized config
5. Remove old scattered config constants

### Validation Gate
- [ ] All configs validated at startup
- [ ] Invalid config throws clear error
- [ ] Environment variables documented
- [ ] ROUTER.md complete

---

## Phase 4: TODO Debt Resolution

### Objective
Implement critical TODOs that affect production functionality.

### Priority 1: PROD Upload (Est. 4 hours)

**Files:**
- `src/services/database/engine-write-db.ts`
- `src/workers/database/engine-write-worker.ts`

**Implementation:**
1. Create Prisma models for battle logs, move usage, anomalies
2. Implement `uploadToProd()` with batch upsert
3. Add retry logic with exponential backoff
4. Integrate with Write-DB validation
5. Add metrics for upload success/failure

### Priority 2: Batch Optimization (Est. 2 hours)

**File:** `src/services/player-resolver.ts`

**Implementation:**
1. Replace sequential queries with parallel `Promise.all`
2. Use DataLoader pattern for N+1 prevention
3. Add query profiling metrics

### Priority 3: Memory/CPU Tracking (Est. 2 hours)

**Files:**
- `src/shared/metrics-collector.ts`
- `src/services/monitoring/resource-monitor.ts`

**Implementation:**
1. Integrate with `process.memoryUsage()` per worker
2. Use `process.cpuUsage()` for CPU tracking
3. Add per-worker metrics to dashboard

### Validation Gate
- [ ] PROD upload functional with test coverage
- [ ] Batch queries show measurable improvement
- [ ] Memory/CPU metrics visible in /ops

---

## Phase 5: Directory Reorganization

### Objective
Restructure directories for better organization without breaking imports.

### src/shared/ Cleanup

**Before:**
```
src/shared/
├── [30+ files at root level]
├── cache/
├── crypto/
├── models/
├── storage/
└── utils/
```

**After:**
```
src/shared/
├── index.ts                    # Re-exports for backward compat
├── config/                     # Move config.ts, constants.ts
│   └── index.ts
├── database/                   # Move prisma.ts, pg-*.ts
│   └── index.ts
├── events/                     # Move event-bus.ts
│   └── index.ts
├── logging/                    # Move log*.ts, console-*.ts
│   └── index.ts
├── models/                     # Keep as-is (already organized)
├── types/                      # Move json-types.ts
│   └── index.ts
├── cache/                      # Keep as-is
├── crypto/                     # Keep as-is
├── storage/                    # Keep as-is
└── utils/                      # Keep as-is (well organized)
```

### Migration Strategy
1. Create new directories with barrel exports
2. Move files one category at a time
3. Update imports using IDE refactoring
4. Keep backward-compat re-exports temporarily
5. Remove re-exports after validation period

### Validation Gate
- [ ] All imports resolve correctly
- [ ] Build succeeds with 0 errors
- [ ] Tests pass
- [ ] ROUTER.md files created for new directories

---

## Phase 6: Deprecated Code Removal

### Objective
Remove deprecated code after confirming no active consumers.

### Process
1. Search for usages of each deprecated item
2. Migrate consumers to new APIs
3. Add deprecation warnings (if not already)
4. Remove after 1 sprint validation period

### Items to Remove

| Item | Consumers Found | Migration Path |
|------|-----------------|----------------|
| `loadFromReadDb()` | 0 | Direct removal |
| Legacy constants | TBD | Update to GAME_CONSTANTS |
| `legacy-stubs.ts` | TBD | Migrate to observability |

### Validation Gate
- [ ] No runtime errors after removal
- [ ] All deprecation warnings addressed
- [ ] Documentation updated

---

## Execution Timeline

```
Week 1 (Dec 15-21):
├── Day 1-2: Phase 0 Complete (Audit) ✅
├── Day 3-4: Phase 1 Sprint 1.1-1.2 (DB types, Event Bus)
└── Day 5-7: Phase 1 Sprint 1.3-1.5 (Registry, Bot, Monitoring)

Week 2 (Dec 22-28):
├── Day 1-2: Phase 2 (Error Hierarchy)
├── Day 3-4: Phase 3 (Config Centralization)
└── Day 5-7: Phase 4 Priority 1 (PROD Upload)

Week 3 (Dec 29 - Jan 4):
├── Day 1-2: Phase 4 Priority 2-3 (Batch, Metrics)
├── Day 3-4: Phase 5 (Directory Reorg)
└── Day 5-7: Phase 6 (Deprecated Removal)

Week 4 (Jan 5-11):
├── Validation & Bug Fixes
├── Documentation Updates
└── Final Review
```

---

## Risk Mitigation

### High Risk: Breaking Prisma Types
**Mitigation:** Never modify `src/generated/` - create wrapper types

### Medium Risk: Import Path Changes
**Mitigation:** Use barrel exports for backward compatibility

### Medium Risk: Runtime Type Errors
**Mitigation:** Add runtime validation at boundaries

### Low Risk: Test Coverage Drop
**Mitigation:** Add tests for all new type definitions

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| `any` type count | 56 | <10 |
| TODO count | 19 | <5 |
| Deprecated items | 6 | 0 |
| Test coverage | TBD | 90%+ |
| Build time | TBD | <30s |
| Lint warnings | 0 | 0 |

---

## Appendix: Commands Reference

```bash
# Type checking
npm run lint
npx tsc --noEmit

# Run tests
npm test
npm run test:coverage

# Find any types
git grep ": any" -- "src/**/*.ts" ":!src/generated/**"

# Find TODOs
git grep "TODO" -- "src/**/*.ts"

# Find deprecated
git grep "@deprecated\|DEPRECATED" -- "src/**/*.ts"
```

---

**Document Version:** 1.0
**Last Updated:** 2025-12-15
**Next Review:** After Phase 1 completion
