# Phase 6: Comprehensive Directory Reorganization

**Created:** 2025-12-16
**Status:** Planning
**Owner:** AI Architect + DRIPTVDD
**Priority:** High — Establishes application standards for maintainability

---

## Executive Summary

This document details the comprehensive reorganization of the Infinity Gauntlet codebase directory structure. The goal is to transform a flat, sprawling directory structure into a well-organized, domain-driven architecture that:

- **Improves discoverability** — Developers can find files logically
- **Enables barrel exports** — Clean, single-line imports
- **Reduces cognitive load** — Related files grouped together
- **Supports scalability** — Easy to add new features without clutter
- **Maintains backward compatibility** — Via re-exports during transition

---

## Current State Analysis

### src/shared/ (30+ files at root — CRITICAL)

**Problem:** Files dumped at root level with no logical grouping

| Cluster | Files | Purpose |
|---------|-------|---------|
| **Logging** | `log.ts`, `logger.ts`, `logBuffer.ts`, `logBufferInit.ts`, `log-aggregator.ts`, `log-query-views.ts` | 6 files handling logging concerns |
| **Database** | `prisma.ts`, `pg-connection.ts`, `pg-query.ts`, `pg-transaction.ts` | 4 files for database access |
| **Events** | `event-bus.ts`, `event-types.ts` | 2 files for event system |
| **Console** | `console-interceptor.ts`, `console-renderer.ts` | 2 files for console output |
| **Monitoring** | `observability.ts`, `metrics-collector.ts`, `system-health-monitor.ts` | 3 files for observability |
| **Services** | `service-registry.ts`, `service-factories.ts`, `rate-limiter.ts` | 3 files for service management |
| **Config** | `config.ts`, `constants.ts`, `feature-flags.ts` | 3 files for configuration |
| **Misc** | `json-types.ts`, `datetime.js`, `legacy-stubs.ts`, `outbox.ts`, `worker-runtime.ts` | 5 misc files |

**Already Organized:**
- `utils/` — 12 well-organized utility files with barrel export ✅
- `crypto/` — Cryptographic utilities ✅
- `cache/` — Cache backends ✅
- `storage/` — Storage adapters ✅
- `models/` — PostgreSQL query models ✅

### src/services/ (40+ files — HIGH)

**Problem:** Mix of organized subdirectories and scattered root files

| Category | Files | Notes |
|----------|-------|-------|
| **Repositories** | `base-repository.ts`, `battle-repository.ts`, `homestead-repository.ts`, `pokemon-repository.ts`, `trainer-repository.ts` | 5 repos scattered at root |
| **Homestead** | `homestead-manager.ts`, `homestead-permissions.ts`, `homestead-player-monitor.ts`, `homestead-verification.ts` | 4 related services at root |
| **Query** | `query-cache.ts`, `query-profiler.ts` | 2 query services |
| **Health** | `connection-health-monitor.ts`, `health-server.ts`, `lifecycle-notifier.ts` | 3 health services |
| **Write** | `write-coalescer.ts`, `batch-processor.ts` | 2 write optimization |
| **Misc Root** | `alert-throttle.ts`, `audit-service.ts`, `discord-identity.ts`, `player-checkpoint.ts`, `player-resolver.ts`, `restart-metrics.ts`, `rls-context.ts`, `statistics-window.js` | 8 misc services |
| **Legacy JS** | `cache.js`, `distributed-lock.js`, `metrics-server.js`, `pokemonService.js`, `prometheus-metrics.js`, `role-assignment.js` | 6 legacy JavaScript |

**Already Organized:**
- `cache/` — Cache services with barrel export ✅
- `database/` — Engine DB services ✅
- `monitoring/` — Error tracking services ✅
- `ai/` — AI logging services ✅
- `data-pool/` — Data pooling service ✅

### src/utils/ (12 files — MEDIUM)

**Problem:** Overlaps with `src/shared/utils/` — confusing separation

| File | Purpose | Should Be |
|------|---------|-----------|
| `intelligent-logger.ts` | Enhanced logging | → `src/shared/logging/` |
| `logger.js` + `.d.ts` | Legacy logger | → `src/shared/logging/` |
| `output-formatter.ts` | Console formatting | → `src/shared/console/` |
| `cliStatus.js` + `.d.ts` | CLI status display | → `src/shared/console/` |
| `activityTracker.js` | Activity tracking | → `src/services/monitoring/` |
| `fatalErrorGuard.js` | Fatal error handling | → `src/errors/` |
| `memory-measurement.ts` | Memory utilities | → `src/services/monitoring/` |
| `opsNotifier.js` | Ops notifications | → `src/services/` |
| `stack-trace-parser.ts` | Stack parsing | → `src/errors/` |

### src/types/ (5 files — LOW)

**Current State:** Good baseline, but underutilized

| File | Purpose |
|------|---------|
| `database-rows.ts` | PostgreSQL row types |
| `db-models.ts` | Database model types |
| `index.ts` | Barrel export |
| `js-module-declarations.d.ts` | JavaScript module declarations |

### Other Directories (Analysis)

| Directory | Files | Status |
|-----------|-------|--------|
| `src/bot/` | 20+ items | Well organized with subdirectories ✅ |
| `src/core/` | 5 items | Well organized (`battle/`, `encounter/`, `pbsl/`) ✅ |
| `src/config/` | 8 files | Well organized with barrel export ✅ |
| `src/errors/` | 7 files | Well organized (Phase 2 complete) ✅ |
| `src/workers/` | 8 items | Adequately organized ✅ |
| `src/engine/` | 9 files | Legacy JS, could use barrel export |
| `src/lib/` | 4 files | Small, legacy utilities |
| `src/commands/` | 20 files | Flat but acceptable for command handlers |
| `src/cli/` | 1 file | Single file |
| `src/data/` | 3 files | Small, specialized |
| `src/dex/` | 3 items | Small with subdirectory |
| `src/models/` | 2 files | Minimal |
| `src/runtime/` | 3 files | Small, specialized |

---

## Proposed Architecture

### Phase 6.1: src/shared/ Reorganization

```
src/shared/
├── index.ts                       # Master barrel export (backward compat)
├── ROUTER.md                      # Updated documentation
│
├── logging/                       # NEW DIRECTORY
│   ├── index.ts                   # Barrel export
│   ├── ROUTER.md                  # Directory documentation
│   ├── log.ts                     # [MOVED] Structured logger
│   ├── logger.ts                  # [MOVED] Logger implementation
│   ├── intelligent-logger.ts      # [MOVED from src/utils/]
│   ├── log-buffer.ts              # [MOVED + RENAMED] logBuffer.ts
│   ├── log-buffer-init.ts         # [MOVED + RENAMED] logBufferInit.ts
│   ├── log-aggregator.ts          # [MOVED]
│   └── log-query-views.ts         # [MOVED]
│
├── database/                      # NEW DIRECTORY
│   ├── index.ts                   # Barrel export
│   ├── ROUTER.md                  # Directory documentation
│   ├── prisma.ts                  # [MOVED] Dual Prisma client
│   ├── pg-connection.ts           # [MOVED] PostgreSQL connection
│   ├── pg-query.ts                # [MOVED] PostgreSQL queries
│   └── pg-transaction.ts          # [MOVED] PostgreSQL transactions
│
├── events/                        # NEW DIRECTORY
│   ├── index.ts                   # Barrel export
│   ├── ROUTER.md                  # Directory documentation
│   ├── event-bus.ts               # [MOVED] Event bus singleton
│   ├── event-types.ts             # [MOVED] Typed event payloads
│   └── outbox.ts                  # [MOVED] Legacy outbox compat
│
├── console/                       # NEW DIRECTORY
│   ├── index.ts                   # Barrel export
│   ├── ROUTER.md                  # Directory documentation
│   ├── console-interceptor.ts     # [MOVED]
│   ├── console-renderer.ts        # [MOVED]
│   ├── output-formatter.ts        # [MOVED from src/utils/]
│   └── cli-status.ts              # [MOVED from src/utils/ + RENAMED]
│
├── monitoring/                    # NEW DIRECTORY
│   ├── index.ts                   # Barrel export
│   ├── ROUTER.md                  # Directory documentation
│   ├── observability.ts           # [MOVED]
│   ├── metrics-collector.ts       # [MOVED]
│   ├── system-health-monitor.ts   # [MOVED]
│   └── memory-measurement.ts      # [MOVED from src/utils/]
│
├── services/                      # NEW DIRECTORY (service coordination)
│   ├── index.ts                   # Barrel export
│   ├── ROUTER.md                  # Directory documentation
│   ├── service-registry.ts        # [MOVED]
│   ├── service-factories.ts       # [MOVED]
│   └── rate-limiter.ts            # [MOVED]
│
├── config/                        # NEW DIRECTORY (shared config)
│   ├── index.ts                   # Barrel export
│   ├── ROUTER.md                  # Directory documentation
│   ├── config.ts                  # [MOVED] Runtime config loader
│   ├── constants.ts               # [MOVED] Centralized constants
│   └── feature-flags.ts           # [MOVED] Feature flag system
│
├── types/                         # NEW DIRECTORY
│   ├── index.ts                   # Barrel export
│   └── json-types.ts              # [MOVED]
│
├── datetime.js                    # [KEEP] Small utility, 1 file
├── legacy-stubs.ts                # [KEEP] Deprecation period
├── worker-runtime.ts              # [KEEP] Worker utilities
│
├── cache/                         # [KEEP] Already organized
├── crypto/                        # [KEEP] Already organized
├── models/                        # [KEEP] Already organized
├── storage/                       # [KEEP] Already organized
└── utils/                         # [KEEP] Already organized
```

**Files Remaining at Root:** 3 (datetime.js, legacy-stubs.ts, worker-runtime.ts)
**New Directories:** 7 (logging, database, events, console, monitoring, services, config, types)
**Files Moved:** 24

### Phase 6.2: src/services/ Reorganization

```
src/services/
├── index.ts                       # Master barrel export
├── ROUTER.md                      # Updated documentation
│
├── repositories/                  # NEW DIRECTORY
│   ├── index.ts                   # Barrel export
│   ├── ROUTER.md                  # Directory documentation
│   ├── base-repository.ts         # [MOVED]
│   ├── battle-repository.ts       # [MOVED]
│   ├── homestead-repository.ts    # [MOVED]
│   ├── pokemon-repository.ts      # [MOVED]
│   └── trainer-repository.ts      # [MOVED]
│
├── homestead/                     # NEW DIRECTORY
│   ├── index.ts                   # Barrel export
│   ├── ROUTER.md                  # Directory documentation
│   ├── homestead-manager.ts       # [MOVED]
│   ├── homestead-permissions.ts   # [MOVED]
│   ├── homestead-player-monitor.ts # [MOVED]
│   └── homestead-verification.ts  # [MOVED]
│
├── query/                         # NEW DIRECTORY
│   ├── index.ts                   # Barrel export
│   ├── ROUTER.md                  # Directory documentation
│   ├── query-cache.ts             # [MOVED]
│   └── query-profiler.ts          # [MOVED]
│
├── health/                        # NEW DIRECTORY
│   ├── index.ts                   # Barrel export
│   ├── ROUTER.md                  # Directory documentation
│   ├── connection-health-monitor.ts # [MOVED]
│   ├── health-server.ts           # [MOVED]
│   └── lifecycle-notifier.ts      # [MOVED]
│
├── write/                         # NEW DIRECTORY
│   ├── index.ts                   # Barrel export
│   ├── ROUTER.md                  # Directory documentation
│   ├── write-coalescer.ts         # [MOVED]
│   └── batch-processor.ts         # [MOVED]
│
├── player/                        # NEW DIRECTORY
│   ├── index.ts                   # Barrel export
│   ├── ROUTER.md                  # Directory documentation
│   ├── player-checkpoint.ts       # [MOVED]
│   ├── player-resolver.ts         # [MOVED]
│   └── discord-identity.ts        # [MOVED]
│
├── legacy/                        # NEW DIRECTORY (JavaScript legacy)
│   ├── index.ts                   # Barrel export
│   ├── ROUTER.md                  # Directory documentation
│   ├── cache.js                   # [MOVED] Security bot cache
│   ├── distributed-lock.js        # [MOVED]
│   ├── metrics-server.js          # [MOVED]
│   ├── pokemonService.js          # [MOVED]
│   ├── pokemonService.d.ts        # [MOVED]
│   ├── prometheus-metrics.js      # [MOVED]
│   ├── role-assignment.js         # [MOVED]
│   └── statistics-window.js       # [MOVED]
│
├── alert-throttle.ts              # [KEEP] Standalone utility
├── audit-service.ts               # [KEEP] Standalone service
├── home-bundle-pg.ts              # [KEEP] Cooldown queries
├── restart-metrics.ts             # [KEEP] Metrics collection
├── rls-context.ts                 # [KEEP] RLS context
├── resource-request.ts            # [KEEP] Resource gateway (documented)
├── resource-manager.ts            # [KEEP] Resource lifecycle (documented)
├── resource-monitor.ts            # [KEEP] Resource monitoring (documented)
│
├── ai/                            # [KEEP] Already organized
├── cache/                         # [KEEP] Already organized
├── data-pool/                     # [KEEP] Already organized
├── database/                      # [KEEP] Already organized
└── monitoring/                    # [KEEP] Already organized
```

**Files Remaining at Root:** 8 (well-documented standalone services)
**New Directories:** 7 (repositories, homestead, query, health, write, player, legacy)
**Files Moved:** 26

### Phase 6.3: src/utils/ Migration

**Consolidate into existing directories:**

| File | Destination | Rationale |
|------|-------------|-----------|
| `intelligent-logger.ts` | `src/shared/logging/` | Logging concern |
| `logger.js` + `.d.ts` | `src/shared/logging/` | Logging concern |
| `output-formatter.ts` | `src/shared/console/` | Console output |
| `cliStatus.js` + `.d.ts` | `src/shared/console/` | Console output |
| `activityTracker.js` | `src/services/monitoring/` | Monitoring concern |
| `fatalErrorGuard.js` | `src/errors/` | Error handling |
| `memory-measurement.ts` | `src/shared/monitoring/` | Monitoring concern |
| `opsNotifier.js` | `src/services/monitoring/` | Ops notifications |
| `stack-trace-parser.ts` | `src/errors/` | Error handling |

**After Migration:**
- `src/utils/` directory **DELETED**
- All files absorbed into proper domain directories
- `src/utils/ROUTER.md` archived to `docs/archive/`

### Phase 6.4: Barrel Export Standardization

Every directory gets a standardized `index.ts`:

```typescript
/**
 * Barrel Export — {Directory Name}
 * 
 * Centralized export point for all {domain} functionality.
 * Enables clean single-import: `import { ... } from '../shared/{dir}'`
 * 
 * @module shared/{dir}
 */

// Primary exports
export {
  // Named exports...
} from './file1.js';

export {
  // More named exports...
} from './file2.js';

// Type re-exports
export type {
  // Type exports...
} from './types.js';
```

**Pattern Rules:**
1. Use `.js` extensions (Node ESM resolution)
2. Named exports only (no default exports)
3. Group by category with comments
4. Include JSDoc module documentation
5. Export types separately with `export type`

---

## Migration Strategy

### Phase 6.1: src/shared/ (3-4 hours)

**Order of Operations:**
1. Create all new directories with empty `index.ts` and `ROUTER.md`
2. Move `logging/` files first (most independent)
3. Move `database/` files (foundation layer)
4. Move `events/` files (depends on types)
5. Move `console/` files
6. Move `monitoring/` files
7. Move `services/` files
8. Move `config/` files (most dependencies)
9. Move `types/` files
10. Create master barrel export at `src/shared/index.ts`
11. Update imports across codebase (IDE refactoring)
12. Verify build: `npx tsc --noEmit`
13. Run tests: `npm test`
14. Update all affected ROUTER.md files

**Backward Compatibility:**
- Master `src/shared/index.ts` re-exports everything
- Consumers can still do `import { prisma } from '../shared/prisma.js'`
- After 1 sprint, update imports to subdirectory paths
- After 2 sprints, remove backward compat re-exports

### Phase 6.2: src/services/ (3-4 hours)

**Order of Operations:**
1. Create new directories with scaffolding
2. Move `repositories/` files (domain-critical)
3. Move `homestead/` files (domain-specific)
4. Move `query/` files
5. Move `health/` files
6. Move `write/` files
7. Move `player/` files
8. Move `legacy/` JavaScript files last
9. Update service barrel export
10. Update imports
11. Build verification
12. Test verification
13. ROUTER.md updates

### Phase 6.3: src/utils/ (1-2 hours)

**Order of Operations:**
1. Move logging files to `src/shared/logging/`
2. Move console files to `src/shared/console/`
3. Move monitoring files to destinations
4. Move error files to `src/errors/`
5. Update all imports
6. Delete `src/utils/` directory
7. Archive `src/utils/ROUTER.md`
8. Build verification
9. Test verification

### Phase 6.4: Barrel Export Audit (1-2 hours)

**Directories to audit:**
1. `src/shared/logging/` — Create barrel
2. `src/shared/database/` — Create barrel
3. `src/shared/events/` — Create barrel
4. `src/shared/console/` — Create barrel
5. `src/shared/monitoring/` — Create barrel
6. `src/shared/services/` — Create barrel
7. `src/shared/config/` — Create barrel
8. `src/services/repositories/` — Create barrel
9. `src/services/homestead/` — Create barrel
10. `src/services/query/` — Create barrel
11. `src/services/health/` — Create barrel
12. `src/services/write/` — Create barrel
13. `src/services/player/` — Create barrel
14. `src/services/legacy/` — Create barrel
15. `src/engine/` — Add barrel (missing)

---

## Import Path Changes Reference

### Before → After (src/shared/)

```typescript
// BEFORE (flat imports)
import { prisma } from '../shared/prisma.js';
import { eventBus } from '../shared/event-bus.js';
import { log } from '../shared/log.js';
import { config } from '../shared/config.js';

// AFTER (domain imports)
import { prisma } from '../shared/database/index.js';
import { eventBus } from '../shared/events/index.js';
import { log } from '../shared/logging/index.js';
import { config } from '../shared/config/index.js';

// OR (barrel import for convenience)
import { prisma, eventBus, log, config } from '../shared/index.js';
```

### Before → After (src/services/)

```typescript
// BEFORE (scattered root)
import { BattleRepository } from '../services/battle-repository.js';
import { HomesteadManager } from '../services/homestead-manager.js';
import { queryCache } from '../services/query-cache.js';

// AFTER (domain imports)
import { BattleRepository } from '../services/repositories/index.js';
import { HomesteadManager } from '../services/homestead/index.js';
import { queryCache } from '../services/query/index.js';
```

---

## Risk Assessment

### High Risk: Breaking Import Paths

**Mitigation:**
- Use IDE refactoring (VS Code "Move to" with import update)
- Maintain backward compat re-exports for 2 sprints
- Build verification after every directory move
- Git commits after each successful migration step

### Medium Risk: Circular Dependencies

**Mitigation:**
- Move foundation layers first (database, logging)
- Test imports with `npx tsc --noEmit` frequently
- Use dependency injection patterns where needed
- Break cycles by introducing interface files

### Low Risk: Test Failures

**Mitigation:**
- Run `npm test` after each phase
- Mock paths may need updates
- Test file imports auto-update with refactoring

---

## Validation Gates

### Per-Phase Gates

- [ ] All files moved to correct locations
- [ ] All barrel exports created with proper patterns
- [ ] All ROUTER.md files updated
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] Git commit created with descriptive message

### Final Gates

- [ ] No files at root of `src/shared/` except documented exceptions
- [ ] No files at root of `src/services/` except documented exceptions
- [ ] `src/utils/` directory deleted
- [ ] All new directories have ROUTER.md
- [ ] Master ROUTER.md files updated
- [ ] Import paths use domain subdirectories
- [ ] Backward compat re-exports in place

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| Files at `src/shared/` root | 24 | 3 |
| Files at `src/services/` root | 26 | 8 |
| `src/utils/` files | 12 | 0 (deleted) |
| Directories with barrel exports | ~8 | ~22 |
| New ROUTER.md files | 0 | 14 |
| Import clarity (subjective) | Low | High |

---

## Appendix: File Movement Checklist

### src/shared/ Movements

- [ ] `log.ts` → `logging/`
- [ ] `logger.ts` → `logging/`
- [ ] `logBuffer.ts` → `logging/log-buffer.ts`
- [ ] `logBufferInit.ts` → `logging/log-buffer-init.ts`
- [ ] `log-aggregator.ts` → `logging/`
- [ ] `log-query-views.ts` → `logging/`
- [ ] `prisma.ts` → `database/`
- [ ] `pg-connection.ts` → `database/`
- [ ] `pg-query.ts` → `database/`
- [ ] `pg-transaction.ts` → `database/`
- [ ] `event-bus.ts` → `events/`
- [ ] `event-types.ts` → `events/`
- [ ] `outbox.ts` → `events/`
- [ ] `console-interceptor.ts` → `console/`
- [ ] `console-renderer.ts` → `console/`
- [ ] `observability.ts` → `monitoring/`
- [ ] `metrics-collector.ts` → `monitoring/`
- [ ] `system-health-monitor.ts` → `monitoring/`
- [ ] `service-registry.ts` → `services/`
- [ ] `service-factories.ts` → `services/`
- [ ] `rate-limiter.ts` → `services/`
- [ ] `config.ts` → `config/`
- [ ] `constants.ts` → `config/`
- [ ] `feature-flags.ts` → `config/`
- [ ] `json-types.ts` → `types/`

### src/services/ Movements

- [ ] `base-repository.ts` → `repositories/`
- [ ] `battle-repository.ts` → `repositories/`
- [ ] `homestead-repository.ts` → `repositories/`
- [ ] `pokemon-repository.ts` → `repositories/`
- [ ] `trainer-repository.ts` → `repositories/`
- [ ] `homestead-manager.ts` → `homestead/`
- [ ] `homestead-permissions.ts` → `homestead/`
- [ ] `homestead-player-monitor.ts` → `homestead/`
- [ ] `homestead-verification.ts` → `homestead/`
- [ ] `query-cache.ts` → `query/`
- [ ] `query-profiler.ts` → `query/`
- [ ] `connection-health-monitor.ts` → `health/`
- [ ] `health-server.ts` → `health/`
- [ ] `lifecycle-notifier.ts` → `health/`
- [ ] `write-coalescer.ts` → `write/`
- [ ] `batch-processor.ts` → `write/`
- [ ] `player-checkpoint.ts` → `player/`
- [ ] `player-resolver.ts` → `player/`
- [ ] `discord-identity.ts` → `player/`
- [ ] `cache.js` → `legacy/`
- [ ] `distributed-lock.js` → `legacy/`
- [ ] `metrics-server.js` → `legacy/`
- [ ] `pokemonService.js` → `legacy/`
- [ ] `pokemonService.d.ts` → `legacy/`
- [ ] `prometheus-metrics.js` → `legacy/`
- [ ] `role-assignment.js` → `legacy/`
- [ ] `statistics-window.js` → `legacy/`

### src/utils/ Migrations

- [ ] `intelligent-logger.ts` → `src/shared/logging/`
- [ ] `logger.js` → `src/shared/logging/`
- [ ] `logger.d.ts` → `src/shared/logging/`
- [ ] `output-formatter.ts` → `src/shared/console/`
- [ ] `cliStatus.js` → `src/shared/console/cli-status.js`
- [ ] `cliStatus.d.ts` → `src/shared/console/cli-status.d.ts`
- [ ] `activityTracker.js` → `src/services/monitoring/`
- [ ] `memory-measurement.ts` → `src/shared/monitoring/`
- [ ] `fatalErrorGuard.js` → `src/errors/`
- [ ] `opsNotifier.js` → `src/services/monitoring/`
- [ ] `stack-trace-parser.ts` → `src/errors/`

---

**Document Version:** 1.0
**Last Updated:** 2025-12-16
**Estimated Total Effort:** 10-14 hours across 4 sub-phases

