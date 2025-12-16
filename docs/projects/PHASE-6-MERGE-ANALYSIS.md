# Phase 6: Architecture Cleanup — Legacy Elimination & Consolidation

**Created:** 2025-12-16  
**Revised:** 2025-12-16 (Corrected mindset: Legacy JS = technical debt to eliminate)  
**Status:** 🔄 IN PROGRESS

---

## 🚨 CRITICAL MINDSET (Enforced)

**Legacy JavaScript files are NOT "production code to preserve".**  
**Legacy JavaScript files ARE "technical debt to eliminate".**

The codebase has **67 legacy JS files** (~20% of src/) that should be:
- **DELETED** if a TypeScript replacement exists
- **MIGRATED** to TypeScript if still needed
- **NEVER** used as excuse to preserve technical debt

---

## ⚠️ DEPENDENCY DEPTH DISCOVERY

**Deep scanning revealed cascading dependencies:**

The legacy `utils/logger.js` (1152 lines) is imported by **20+ files** including:
- TypeScript files (`*.ts`) that should use `shared/logger.ts`
- Other legacy JS files creating dependency chains

**This means we cannot delete legacy files piecemeal.**

**Strategy:** Bottom-up migration — fix imports first, then delete legacy files.

---

## Execution Progress

| Phase | Action | Status | Commit |
|-------|--------|--------|--------|
| 6.1 | Console cluster → `src/shared/console/` (organize) | ✅ COMPLETE | `9aa9e84b` |
| 6.2a | **Logger TS migration** (30 TS files → shared/logger.ts) | ✅ COMPLETE | `ec2c80a0` |
| 6.2b | Metrics elimination (DELETE prometheus-metrics.js) | ⏳ IN PROGRESS | — |
| 6.3 | Legacy Alerts elimination (DELETE JS, use TS) | ⏳ PENDING | — |
| 6.4 | Database cluster consolidation | ⏳ PENDING | — |
| 6.5 | Logging legacy elimination (DELETE JS, use TS) | ⏳ PENDING | — |
| 6.6 | Engine JS → TS migration | ⏳ PENDING | — |
| 6.7 | Bot JS → TS migration | ⏳ PENDING | — |
| 6.8 | Remaining JS cleanup | ⏳ PENDING | — |

---

## ✅ PHASE 6.2a: Logger TypeScript Migration (COMPLETE)

**Problem:** 31 TypeScript files imported `log` from legacy `utils/logger.js`
**Solution:** Added legacy-compatible `log()` API to `shared/logger.ts`, migrated all imports

### Changes Made:
- Added `log`, `log.info`, `log.warn`, `log.error`, `log.success`, `log.detail` exports to `shared/logger.ts`
- Migrated 30 TypeScript files to import from `shared/logger.js` instead of `utils/logger.js`
- Fixed relative import paths for nested directories (bot/daily, services/cache, etc.)

### Remaining Dependency:
- `index.ts` still imports `startAutoRefresh` from `utils/logger.js` (stats dashboard feature)
- 20+ legacy JS files still depend on `utils/logger.js` (blocked by JS→TS conversion)

### Migrated Files (30):
```
bot/daily/claim.ts
bot/error-handler.ts
bot/homestead/home.ts, open-starter-selection.ts, starters.ts
services/batch-processor.ts, connection-health-monitor.ts, database-metrics.ts
services/discord-identity.ts, health-server.ts, homestead-manager.ts
services/homestead-player-monitor.ts, lifecycle-notifier.ts, player-checkpoint.ts
services/player-resolver.ts, query-cache.ts, query-profiler.ts
services/restart-metrics.ts, write-coalescer.ts
services/cache/engine-cache.ts, engine-write-buffer.ts
services/database/engine-read-db.ts, engine-write-db.ts
services/monitoring/error-alerting-service.ts, error-tracker.ts
services/monitoring/os-error-interceptor.ts, resource-manager.ts
shared/service-registry.ts
workers/engine-workers.ts, error-learning-worker.ts
```

---

## 📊 Technical Debt Inventory

### Current State: 67 Legacy JS Files

```
src/
├── bot/           → 12 JS files (main.js, dripAlerts.js, state/*.js, etc.)
├── commands/      → 7 JS files (walk.js, profile.js, starter.js, etc.)
├── config/        → 1 JS file (env.js)
├── engine/        → 8 JS files (calc.js, types.js, turn.js, etc.)
├── services/      → 7 JS files (prometheus-metrics.js, role-assignment.js, etc.)
├── utils/         → 6 JS files (logger.js, opsNotifier.js, etc.)
├── lib/           → 3 JS files (dex-api.js, cooldown.js, assets.js)
├── dex/           → 3 JS files (metrics.js, v2/*.js)
├── data/          → 1 JS file (dexpack.js)
├── cli/           → 1 JS file (ai-log-query.js)
├── workers/       → ~10 JS files
└── other/         → ~8 JS files
```

### Target State: 0 Legacy JS Files

**All 67 JS files will be either:**
1. **DELETED** — TypeScript replacement exists
2. **MIGRATED** — Converted to TypeScript
3. **ARCHIVED** — Moved to `src/_deprecated/` with deletion date

---

## 🔴 PHASE 6.2: Metrics Legacy Elimination

### Files to DELETE (TypeScript replacements exist):

| Legacy JS | Lines | TS Replacement | Action |
|-----------|-------|----------------|--------|
| `services/prometheus-metrics.js` | 439 | `bot/security/services/prometheus-metrics-service.ts` (823L) | **DELETE** |
| `services/statistics-window.js` | 384 | Inline into TS service or delete | **DELETE** |
| `services/metrics-server.js` | 204 | TS service has HTTP endpoint | **DELETE** |

### Files to MIGRATE (still needed, no TS version):

| Legacy JS | Lines | Action |
|-----------|-------|--------|
| `services/role-assignment.js` | 309 | **MIGRATE** → `role-assignment.ts` |

### Consumer Updates Required:

```
role-assignment.js imports from prometheus-metrics.js
  → Update to import from prometheus-metrics-service.ts
```

---

## 🔴 PHASE 6.3: Legacy Alerts Elimination

### Files to DELETE:

| Legacy JS | Lines | TS Replacement | Action |
|-----------|-------|----------------|--------|
| `utils/opsNotifier.js` | 231 | `services/alert-throttle.ts` (635L) | **DELETE** |

### Files to ORGANIZE (already TS, just scattered):

| File | Current Location | Target Location |
|------|------------------|-----------------|
| `alert-throttle.ts` | `services/` | `services/alerts/` |
| `lifecycle-notifier.ts` | `services/` | `services/alerts/` |

---

## 🔴 PHASE 6.4: Database Consolidation

### Current State (all TypeScript, needs consolidation):

```
prisma.ts (749L)         ← ORM clients
pg-connection.ts (362L)  ← Raw pg pools  
pg-query.ts (285L)       ← Query builders
pg-transaction.ts (87L)  ← Transaction helper
```

### Target: Single `database.ts` with clear modules

---

## 🔴 PHASE 6.5: Logging Legacy Elimination

### Files to DELETE:

| Legacy JS | Lines | TS Replacement | Action |
|-----------|-------|----------------|--------|
| `utils/logger.js` | 1152 | `shared/logger.ts` (527L) | **DELETE** |

### Files to CONSOLIDATE (all TS):

```
log.ts (249L)              → unified-logger.ts
logger.ts (527L)           → unified-logger.ts
logBuffer.ts (292L)        → unified-logger.ts
logBufferInit.ts (60L)     → unified-logger.ts
intelligent-logger.ts (986L) → unified-logger.ts
```

---

## 🔴 PHASE 6.6: Engine JS → TS Migration

### Files to MIGRATE:

| Legacy JS | Lines | Action |
|-----------|-------|--------|
| `engine/calc.js` | ~200 | **MIGRATE** → TypeScript |
| `engine/effects.js` | ~150 | **MIGRATE** → TypeScript |
| `engine/index.js` | ~50 | **MIGRATE** → TypeScript |
| `engine/rng.js` | ~100 | **MIGRATE** → TypeScript |
| `engine/stats.js` | ~150 | **MIGRATE** → TypeScript |
| `engine/tables.js` | ~200 | **MIGRATE** → TypeScript |
| `engine/turn.js` | ~300 | **MIGRATE** → TypeScript |
| `engine/types.js` | ~100 | **MIGRATE** → TypeScript |

---

## 🔴 PHASE 6.7: Bot JS → TS Migration

### Files to MIGRATE:

| Legacy JS | Lines | Action |
|-----------|-------|--------|
| `bot/main.js` | ~500 | **MIGRATE** → TypeScript |
| `bot/dripAlerts.js` | ~200 | **MIGRATE** → TypeScript |
| `bot/alert-dispatcher.js` | ~150 | **MIGRATE** → TypeScript |
| `bot/eventbus-integration.js` | ~100 | **MIGRATE** → TypeScript |
| `bot/security-db-subscriber.js` | ~100 | **MIGRATE** → TypeScript |
| `bot/state/*.js` | ~800 | **MIGRATE** → TypeScript |

---

## 🔴 PHASE 6.8: Remaining JS Cleanup

### Services:

| Legacy JS | Action |
|-----------|--------|
| `services/cache.js` | **MIGRATE** or DELETE if TS exists |
| `services/distributed-lock.js` | **MIGRATE** |
| `services/pokemonService.js` | **MIGRATE** |
| `services/ai/*.js` | **MIGRATE** |

### Utils:

| Legacy JS | Action |
|-----------|--------|
| `utils/fatalErrorGuard.js` | **MIGRATE** |
| `utils/cliStatus.js` | **MIGRATE** |
| `utils/activityTracker.js` | **MIGRATE** |

### Commands:

| Legacy JS | Action |
|-----------|--------|
| `commands/walk.js` | **MIGRATE** |
| `commands/profile.js` | **MIGRATE** |
| `commands/starter.js` | **MIGRATE** |
| `commands/weak.js` | **MIGRATE** |
| `commands/version.js` | **MIGRATE** |
| `commands/battle-turn.js` | **MIGRATE** |

### Other:

| Legacy JS | Action |
|-----------|--------|
| `config/env.js` | **MIGRATE** |
| `data/dexpack.js` | **MIGRATE** |
| `lib/*.js` | **MIGRATE** |
| `dex/*.js` | **MIGRATE** |
| `cli/*.js` | **MIGRATE** |
| `command-loader.js` | **MIGRATE** |

---

## 📈 Impact Summary

### Before Phase 6:
- 67 legacy JS files
- 259 TypeScript files
- ~20% technical debt

### After Phase 6:
- 0 legacy JS files
- ~300 TypeScript files
- 0% technical debt
- Consolidated architecture

### Key Metrics:
| Metric | Before | After | Change |
|--------|--------|-------|--------|
| JS Files | 67 | 0 | **-67** |
| TS Files | 259 | ~300 | +41 (consolidation) |
| Total Files | 326 | ~300 | **-26** (merges) |
| Tech Debt | 20% | 0% | **-20%** |

---

## 🚦 Execution Order (Risk-Based)

### Low Risk (Do First):
1. ✅ Console cluster organization (DONE)
2. ⏳ Metrics legacy deletion (TS replacement exists)
3. ⏳ Alerts legacy deletion (TS replacement exists)
4. ⏳ Logging legacy deletion (TS replacement exists)

### Medium Risk (Do Second):
5. Database consolidation (all TS, just reorganize)
6. Services JS → TS migration
7. Utils JS → TS migration

### Higher Risk (Do Last):
8. Engine JS → TS migration (core game logic)
9. Bot JS → TS migration (Discord integration)
10. Commands JS → TS migration

---

## ✅ Completed

### Phase 6.1: Console Cluster (Commit `9aa9e84b`)
- Moved `console-interceptor.ts` to `src/shared/console/`
- Moved `console-renderer.ts` to `src/shared/console/`
- Created barrel export `index.ts`
- Created `ROUTER.md`
- Updated imports in `observability.ts`

---

**Next Action:** Phase 6.2 — Delete legacy metrics JS files, update consumers to use TypeScript service.
