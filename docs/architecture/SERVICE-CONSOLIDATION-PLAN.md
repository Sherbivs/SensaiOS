# Service Layer Consolidation & Organization Plan

**Date**: 2025-11-16  
**Status**: PROPOSED  
**Scope**: Complete server/code/systems consolidation  
**Phase**: 4-8 (Building on Phases 1-3 Complete)

---

## Executive Summary

**Goal**: Consolidate, centralize, organize, and prune the service layer architecture to eliminate duplication, improve discoverability, and establish clear boundaries between `src/services/`, `src/shared/`, and `src/runtime/`.

**Current State Analysis:**
- ✅ **Service Registry (Phase 1)**: Foundation complete with 4 services migrated
- ✅ **Query Patterns (Phase 2-3)**: Centralized in `src/shared/models/` with N+1 fixes
- ⚠️ **Service Fragmentation**: 18 service files scattered across 3 directories
- ⚠️ **Duplicate Patterns**: 80+ mock creations, 12 worker boilerplate instances
- ⚠️ **Import Complexity**: 150+ `../services/` and `../shared/` cross-imports
- ⚠️ **Unclear Boundaries**: Overlap between services, shared utilities, and runtime

**Projected Impact:**
- 🎯 **40% Code Reduction**: Eliminate 2,000+ lines of duplicate code
- 🎯 **Service Discovery**: Single entry point for all service access
- 🎯 **Test Velocity**: 30% faster tests via centralized mocks
- 🎯 **Maintainability**: Clear service boundaries and ownership

---

## Current Architecture Analysis

### Service Distribution

```
src/services/          (18 files, ~8,500 lines)
├── ai-log-analyzer.js       (Legacy AI analysis)
├── ai-log-integrations.js   (Resource integration)
├── ai-log-writer.js         (Log persistence)
├── cache.js                 (Legacy cache wrapper)
├── pokemonService.js/.d.ts  (Pokemon data facade)
├── home-bundle-pg.ts        (DM home data bundler)
├── resource-manager.ts      (✅ Registry-ready: 741 lines)
├── resource-monitor.ts      (Resource health checks: 469 lines)
├── error-tracker.ts         (✅ Registry-ready: 717 lines)
├── error-learning.ts        (Pattern detection: 741 lines)
├── engine-cache.ts          (✅ Registry-ready: 661 lines)
├── engine-read-db.ts        (SQLite read layer: 470 lines)
├── engine-write-buffer.ts   (✅ Registry-ready: 476 lines)
├── engine-write-db.ts       (SQLite write layer: 697 lines)
└── cache/                   (Cache recipes + facade)
    ├── facade.ts            (Centralized cache API)
    └── recipes.ts           (Namespace-specific patterns)

src/shared/            (Core infrastructure)
├── service-registry.ts      (✅ Complete: 680 lines)
├── service-factories.ts     (✅ 4 services registered: 396 lines)
├── config.ts                (Runtime configuration)
├── prisma.ts                (Triple database clients)
├── log.ts                   (Structured logging)
├── event-bus.ts             (Pub-sub messaging)
├── models/                  (Query pattern library - Phase 2-3)
├── cache/                   (Memory backend)
├── utils/                   (Centralized utilities - Phase 2B)
└── storage/                 (Durable backends)

src/runtime/           (Bootstrap & lifecycle)
├── databaseRecovery.ts      (Connection retry logic)
└── autoSync.ts              (Dev→Prod sync worker)
```

### Import Complexity Heat Map

**High Coupling Areas** (50+ imports each):
1. `src/bot/ops/admin.ts` — 35 imports (services, shared, models, utils)
2. `src/utils/logger.js` — 20 imports (resource monitor, formatting, Event Bus)
3. `src/services/error-tracker.ts` — 15 imports (Prisma, Event Bus, datetime)
4. `src/workers/engine-workers.ts` — 12 imports (engine services, utils)

**Service Dependency Graph:**
```
ErrorTracker (Priority 1)
├─→ Prisma (shared)
├─→ EventBus (shared)
└─→ datetime (shared)

ResourceManager (Priority 2)
├─→ ErrorTracker (circular risk!)
└─→ error-utils (shared)

EngineCache (Priority 3)
└─→ (no dependencies - ideal)

EngineWriteBuffer (Priority 4)
└─→ error-utils (shared)

ErrorLearning (Priority 5)
├─→ ErrorTracker
├─→ Prisma
└─→ log (shared)
```

---

## Consolidation Strategy

### Phase 4: Service Registry Expansion (Priority: HIGH)

**Goal**: Migrate remaining services to registry pattern

**Services to Migrate** (12 remaining):
1. **error-learning.ts** (741 lines) — Depends on ErrorTracker
2. **resource-monitor.ts** (469 lines) — Standalone health checks
3. **engine-read-db.ts** (470 lines) — SQLite read layer
4. **engine-write-db.ts** (697 lines) — SQLite write layer
5. **cache/facade.ts** (cache facade) — Depends on memory backend
6. **pokemonService.js** (legacy data facade) — Deprecation candidate
7. **ai-log-analyzer.js** (legacy AI analysis) — Deprecation candidate
8. **ai-log-integrations.js** (resource integration) — Merge into ResourceManager
9. **ai-log-writer.js** (log persistence) — Merge into logging infrastructure
10. **cache.js** (legacy cache wrapper) — Deprecation candidate
11. **home-bundle-pg.ts** (DM data bundler) — Move to `src/bot/dm/`
12. **resource-request.ts** (request gateway) — Depends on ResourceManager

**Migration Template**:
```typescript
// Example: error-learning.ts migration

// 1. Create factory function in service-factories.ts
export function createErrorLearning(): unknown {
  return errorLearning; // Return singleton instance
}

// 2. Health check function
export function errorLearningHealthCheck(instance: unknown): boolean {
  const service = instance as typeof errorLearning;
  // Check pattern detection queue size, last update timestamp
  return service.isHealthy();
}

// 3. Shutdown handler
export async function errorLearningShutdown(instance: unknown): Promise<void> {
  await (instance as any).shutdown();
  // Flush pattern cache, cancel pending analysis
}

// 4. Service configuration
export const errorLearningConfig: ServiceConfig = {
  name: 'error-learning',
  factory: createErrorLearning,
  dependencies: ['error-tracker'], // Enforced startup order
  healthCheck: errorLearningHealthCheck,
  shutdown: errorLearningShutdown,
  startupOrder: 15,
};
```

**Success Criteria**:
- ✅ All 12 services registered in `service-factories.ts`
- ✅ `src/index.ts` uses `registry.registerAll()` + `initializeAll()`
- ✅ All services accessible via `registry.get<T>('service-name')`
- ✅ Health monitoring active for all services (periodic checks)
- ✅ Graceful shutdown in reverse dependency order
- ✅ Build passes with 0 TypeScript errors
- ✅ Tests updated: 294/294 passing (no regressions)

---

### Phase 5: Service Boundary Clarification (Priority: HIGH)

**Goal**: Establish clear rules for service placement

**Proposed Directory Roles:**

| Directory | Purpose | Examples | Rules |
|-----------|---------|----------|-------|
| **src/services/** | **Stateful business logic services** | ErrorTracker, ResourceManager, EngineCache | - Must be registry-managed<br>- Singleton instances<br>- Health checks required<br>- Graceful shutdown |
| **src/shared/** | **Stateless infrastructure utilities** | config, prisma, log, event-bus, models, utils | - Pure functions or thin wrappers<br>- No lifecycle management<br>- No business logic<br>- Reusable across layers |
| **src/runtime/** | **Application bootstrap & lifecycle** | databaseRecovery, autoSync | - Startup coordination<br>- Connection management<br>- Service initialization |

**Service Movement Plan**:

**Move TO `src/services/`**:
- ✅ Already correct: resource-manager.ts, error-tracker.ts, engine-*.ts

**Move TO `src/shared/models/`**:
- ✅ Already moved (Phase 2-3): party-queries.ts, user-queries.ts, encounter-queries-pg.ts, etc.

**Move TO `src/bot/dm/`** (business logic belongs with feature):
- `src/services/home-bundle-pg.ts` → `src/bot/dm/home-bundle.ts`

**DEPRECATE & DELETE** (legacy patterns replaced):
- `src/services/cache.js` → Replaced by `src/services/cache/facade.ts`
- `src/services/pokemonService.js` → Replaced by `src/data/dexpack.js` + engine-cache
- `src/services/ai-log-*.js` (3 files) → Functionality merged into IntelligentLogger (Phase 2.4)

**Consolidation Opportunities**:
- Merge `ai-log-integrations.js` resource tracking into `resource-manager.ts`
- Merge `ai-log-writer.js` persistence logic into `src/shared/log.ts`
- Merge `ai-log-analyzer.js` analytics into IntelligentLogger

**Success Criteria**:
- ✅ Service placement follows documented rules (above table)
- ✅ Legacy services deleted (3-5 files removed)
- ✅ ROUTER.md files updated with new boundaries
- ✅ No circular dependencies between directories
- ✅ Build passes, tests passing (294/294)

---

### Phase 6: Import Path Optimization (Priority: MEDIUM)

**Goal**: Reduce import complexity via re-export barrels

**Current Problem**:
```typescript
// src/bot/ops/admin.ts (35 imports!)
import { toEasternString } from "../../shared/datetime.js";
import { formatBytes, formatBytesShort } from "../../shared/utils/format-utils.js";
import { getErrorMessage } from "../../shared/utils/error-utils.js";
import { cache } from "../../shared/cache/memory.js";
import { config } from "../../shared/config.js";
import { log } from "../../shared/log.js";
import { EventBus } from "../../shared/event-bus.js";
import { engineCache } from "../../services/engine-cache.js";
import { errorTracker } from "../../services/error-tracker.js";
// ... 26 more imports
```

**Solution: Service Registry + Barrel Exports**:

**1. Create `src/services/index.ts` (Service Barrel)**:
```typescript
/**
 * Centralized service access via Service Registry
 * 
 * Usage:
 *   import { getService } from '../../services';
 *   const errorTracker = getService<ErrorTracker>('error-tracker');
 */

import { ServiceRegistry } from '../shared/service-registry.js';

// Re-export registry access
export const registry = ServiceRegistry.getInstance();

// Helper function for type-safe service access
export function getService<T = any>(serviceName: string): T {
  return registry.get<T>(serviceName);
}

// Re-export service types for type checking
export type { ErrorTracker } from './error-tracker.js';
export type { ResourceManager } from './resource-manager.js';
export type { EngineCache } from './engine-cache.js';
export type { EngineWriteBuffer } from './engine-write-buffer.js';
// ... other service types
```

**2. Create `src/shared/index.ts` (Infrastructure Barrel)**:
```typescript
/**
 * Centralized shared infrastructure exports
 */

// Configuration & Runtime
export { config, type RuntimeConfig } from './config.js';
export { prisma, onPremiseDevPrisma, onPremiseExperimentPrisma } from './prisma.js';
export { log } from './log.js';
export { EventBus, type BusEvent } from './event-bus.js';

// Utilities
export * from './utils/index.js'; // Already a barrel (Phase 2B)
export * from './models/index.js'; // Already a barrel (Phase 2-3)
export * from './datetime.js';

// Cache
export { cache } from './cache/memory.js';
export { CacheFacade } from '../services/cache/facade.js';
```

**3. Simplified Imports**:
```typescript
// AFTER: src/bot/ops/admin.ts (7 imports - 80% reduction!)
import { getService } from "../../services/index.js";
import { config, log, EventBus, prisma } from "../../shared/index.js";
import { toEasternString, formatBytes, getErrorMessage } from "../../shared/index.js";
import { getUserBasic, countUsers } from "../../shared/models/index.js";

// Access services via registry
const errorTracker = getService<ErrorTracker>('error-tracker');
const engineCache = getService<EngineCache>('engine-cache');
```

**Success Criteria**:
- ✅ Barrel exports created: `src/services/index.ts`, `src/shared/index.ts`
- ✅ 50% reduction in import statements across codebase (target: 150 → 75 imports)
- ✅ All services accessed via `getService<T>()` helper
- ✅ Build passes with 0 errors, all tests passing

---

### Phase 7: Test Infrastructure Consolidation (Priority: HIGH)

**Goal**: Eliminate 80+ duplicate mock creations

**Current Problem** (from CODE-OPTIMIZATION-AUDIT.md):
```typescript
// DUPLICATE MOCK PATTERNS (80+ instances):

// tests/db-replication/version.test.ts (30+ times)
function createMockPrismaClient(sampleMigrations) { /* ... */ }

// tests/db-replication/integrity.test.ts (40+ times)
function createMockPrismaClient(mockData) { /* ... */ }

// tests/db-replication/sync.test.ts (15+ times)
function createMockPrismaClient(_name: string) { /* ... */ }
```

**Solution: Centralized Test Utilities**:

**1. Create `tests/shared/prisma-mocks.ts`**:
```typescript
/**
 * Centralized Prisma mock utilities
 * 
 * Eliminates 80+ duplicate mock client creations across test files
 */

import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

export interface MockMigration {
  id: string;
  checksum: string;
  started_at: Date;
  applied_steps_count: number;
}

export interface MockPrismaOptions {
  migrations?: MockMigration[];
  userData?: any[];
  partyData?: any[];
  encounterData?: any[];
}

/**
 * Create standard mock Prisma client with configurable data
 */
export function createMockPrismaClient(options: MockPrismaOptions = {}): PrismaClient {
  const migrations = options.migrations ?? [];
  const users = options.userData ?? [];
  const parties = options.partyData ?? [];
  const encounters = options.encounterData ?? [];

  return {
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    user: {
      findMany: vi.fn().mockResolvedValue(users),
      findUnique: vi.fn((args) => users.find(u => u.id === args.where.id)),
      create: vi.fn((args) => Promise.resolve(args.data)),
      update: vi.fn((args) => Promise.resolve({ ...args.where, ...args.data })),
    },
    party: {
      findFirst: vi.fn().mockResolvedValue(parties[0]),
      findMany: vi.fn().mockResolvedValue(parties),
    },
    encounter: {
      findMany: vi.fn().mockResolvedValue(encounters),
      findUnique: vi.fn((args) => encounters.find(e => e.id === args.where.id)),
    },
    _prisma_migrations: {
      findMany: vi.fn().mockResolvedValue(migrations),
    },
  } as unknown as PrismaClient;
}

/**
 * Create mock migration data
 */
export function createMockMigrations(count: number): MockMigration[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `migration_${i + 1}`,
    checksum: `checksum_${i + 1}`,
    started_at: new Date(Date.now() - (count - i) * 86400000),
    applied_steps_count: 1,
  }));
}

/**
 * Create mock for Service Registry tests
 */
export function createMockService(name: string, overrides = {}) {
  return {
    name,
    isHealthy: vi.fn().mockReturnValue(true),
    shutdown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
```

**2. Update Test Files**:
```typescript
// BEFORE: tests/db-replication/version.test.ts
function createMockPrismaClient(sampleMigrations) {
  // 40 lines of duplicate mock setup
}

// AFTER: tests/db-replication/version.test.ts
import { createMockPrismaClient, createMockMigrations } from '../shared/prisma-mocks.js';

describe('Version Tracking', () => {
  it('should calculate version fingerprint', async () => {
    const migrations = createMockMigrations(5);
    const mockPrisma = createMockPrismaClient({ migrations });
    
    const version = await getVersion(mockPrisma, 'PROD');
    expect(version.fingerprint).toBeDefined();
  });
});
```

**Success Criteria**:
- ✅ `tests/shared/prisma-mocks.ts` created with standard mock patterns
- ✅ 20+ test files updated to use centralized mocks
- ✅ 400+ lines duplicate test code removed
- ✅ Test execution time reduced by 20-30% (less setup overhead)
- ✅ All tests passing: 294/294

---

### Phase 8: Documentation & ROUTER Updates (Priority: MEDIUM)

**Goal**: Update all routing documentation to reflect new architecture

**Updates Required**:

1. **`src/services/ROUTER.md`**:
   - Document registry-managed services vs legacy deprecations
   - Add service access patterns via `getService<T>()`
   - Update service dependency graph
   - Document health check expectations

2. **`src/shared/ROUTER.md`**:
   - Clarify stateless infrastructure role
   - Document barrel export pattern (`src/shared/index.ts`)
   - Add import path guidelines

3. **`tests/ROUTER.md`**:
   - Document centralized test utilities location (`tests/shared/`)
   - Add mock usage examples
   - Update test infrastructure patterns

4. **`docs/architecture/centralized-architecture-analysis.md`**:
   - Mark Phase 4-8 as COMPLETE
   - Update service count (18 → 16 after deprecations)
   - Add service registry coverage metrics

5. **`.github/copilot-instructions.md`**:
   - Add service access patterns section
   - Document barrel export usage
   - Add test utility guidelines

**Success Criteria**:
- ✅ All ROUTER.md files updated with new patterns
- ✅ Copilot instructions include service registry guidance
- ✅ Architecture docs reflect current state
- ✅ `npm run docs:update-routers` passes
- ✅ `scripts/guard_routing.sh` passes

---

## Implementation Timeline

| Phase | Effort | Dependencies | Deliverables |
|-------|--------|--------------|--------------|
| **Phase 4: Registry Expansion** | 3-4 days | Phases 1-3 | 12 services migrated to registry |
| **Phase 5: Service Boundaries** | 2-3 days | Phase 4 | 3-5 legacy files deleted, clear placement rules |
| **Phase 6: Import Optimization** | 2 days | Phase 5 | Barrel exports, 50% fewer imports |
| **Phase 7: Test Consolidation** | 2 days | None (parallel) | Centralized mocks, 400+ lines removed |
| **Phase 8: Documentation** | 1 day | Phases 4-7 | All ROUTER.md files updated |
| **TOTAL** | **10-12 days** | | **Complete consolidation** |

---

## Success Metrics

### Code Quality
- ✅ **2,000+ lines removed**: Duplicate patterns eliminated
- ✅ **16 registry-managed services**: All services under lifecycle control
- ✅ **50% import reduction**: Barrel exports simplify dependencies
- ✅ **0 legacy services**: All deprecations completed

### Test Quality
- ✅ **294/294 tests passing**: Zero regressions
- ✅ **20-30% faster tests**: Centralized mocks reduce setup overhead
- ✅ **80+ duplicates removed**: Single source of truth for mocks

### Maintainability
- ✅ **Clear service boundaries**: Documented rules for placement
- ✅ **Single service entry**: `registry.get<T>()` for all access
- ✅ **Health monitoring**: All services tracked with periodic checks
- ✅ **Graceful shutdown**: Reverse dependency order enforced

### Documentation
- ✅ **5+ ROUTER.md updated**: Architecture clearly documented
- ✅ **Copilot instructions**: Service patterns explained
- ✅ **Guard scripts passing**: No routing violations

---

## Rollout Strategy

### Week 1: Core Services (Phase 4)
**Days 1-2**: Migrate high-priority services
- error-learning.ts (depends on error-tracker)
- resource-monitor.ts (standalone)
- engine-read-db.ts, engine-write-db.ts (Engine DB pair)

**Days 3-4**: Migrate remaining services
- cache/facade.ts
- resource-request.ts
- Update `src/index.ts` with full registry init

### Week 2: Cleanup & Optimization (Phases 5-7)
**Days 5-6**: Service boundary enforcement
- Move home-bundle-pg.ts → src/bot/dm/
- Delete 3-5 legacy service files
- Update all ROUTER.md files

**Days 7-8**: Import optimization + test consolidation
- Create barrel exports (services/index.ts, shared/index.ts)
- Create tests/shared/prisma-mocks.ts
- Update 20+ test files

### Week 3: Documentation & Validation (Phase 8)
**Day 9**: Documentation updates
- Update all ROUTER.md files
- Update Copilot instructions
- Update architecture docs

**Day 10**: Final validation
- Run full test suite (294/294 target)
- Run guard scripts (routing, meta, dexpack)
- Performance benchmarks (test execution time)
- Memory profiling (ensure no regressions)

---

## Risk Mitigation

### High Risk: Breaking Service Dependencies
**Risk**: Migrating services in wrong order breaks circular dependencies  
**Mitigation**:
- Follow dependency graph (ErrorTracker → ResourceManager → others)
- Test after each service migration
- Use `dependencies` array in ServiceConfig to enforce order

### Medium Risk: Import Path Updates
**Risk**: 150+ import statements need updating across codebase  
**Mitigation**:
- Use barrel exports to minimize churn
- Update in batches (bot layer, workers, utils)
- Run TypeScript compiler after each batch

### Low Risk: Test Regressions
**Risk**: Centralized mocks break existing tests  
**Mitigation**:
- Create mocks first, validate against existing tests
- Run test suite after each mock replacement
- Keep backward-compatible mock signatures

---

## Next Steps

1. **Review & Approve**: Team review of consolidation plan
2. **Task Creation**: Break down Phases 4-8 into Tasklist entries
3. **Phase 4 Kickoff**: Start with high-priority service migrations
4. **Continuous Validation**: Run tests + guard scripts after each phase

---

**Document Owner**: AI Consolidation Team  
**Last Updated**: 2025-11-16  
**Status**: Awaiting approval for Phase 4 kickoff
