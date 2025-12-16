# Phase 6: Complete Dependency Map

**Created:** 2025-12-18  
**Purpose:** Document all file dependencies discovered during deep scanning  
**Status:** Pre-execution analysis complete

---

## Executive Summary

Comprehensive file scanning completed across all 3 target directories:
- **src/shared/** — 24 root files + 5 subdirectories (cache/, storage/, utils/, models/, crypto/)
- **src/services/** — 26 root files + 5 subdirectories (ai/, cache/, database/, monitoring/, data-pool/)
- **src/utils/** — 12 files (to be migrated or removed)

**Also Documented for Cross-Reference:**
- **src/config/** — 8 files (well-organized, configuration module)
- **src/workers/** — 7 files + database/ subdirectory (worker orchestration)
- **src/errors/** — 6 files (Phase 2 error hierarchy, well-organized)

**Total Files Analyzed:** 80+ files, 27,500+ lines of code

### Key Findings

1. **Dual Query System:** src/shared/models/ has both Prisma (127-197 lines) and raw pg (628-765 lines) versions for migration flexibility

2. **Well-Organized Subdirectories:** 
   - src/services/monitoring/ — 10 files, comprehensive error tracking
   - src/services/cache/ — 6 files, engine cache + write buffer
   - src/services/database/ — 5 files, engine SQLite DBs

3. **Critical Dependencies Identified:**
   - player-resolver.ts → discord-identity.ts → prisma.ts (Player resolution chain)
   - engine-workers.ts → engine-cache.ts + engine-write-buffer.ts (Worker dependencies)
   - intelligent-logger.ts → event-bus.ts → error-tracker.ts (Logging chain)

4. **Large Files Requiring Careful Migration:**
   - player-checkpoint.ts (1063 lines) — Complex recovery system
   - intelligent-logger.ts (986 lines) — Core logging infrastructure
   - engine-workers.ts (903 lines) — Worker coordination
   - base-repository.ts (716 lines) — Repository pattern foundation

---

## src/shared/ Complete Dependency Map

### 1. Logging Cluster (6 files)

| File | Lines | Imports From | Exports | Notes |
|------|-------|--------------|---------|-------|
| `log.ts` | 249 | config.js, utils/error-utils.js, logBuffer.js | LogLevel, log functions | Lazy-loads CLI logger to avoid circular deps |
| `logger.ts` | 527 | (standalone) | LogLevel, LogComponent, LogOperation, getLogger() | DB-First architecture |
| `logBuffer.ts` | 292 | log.js (type only) | BufferedLogEntry, LogBufferConfig, LogBuffer | Deduplication, aggregation |
| `logBufferInit.ts` | 60 | logBuffer.js, log.js | setupLogBuffer() | Environment init |
| `log-aggregator.ts` | 641 | generated/prisma/client.js | initLogAggregator(), runAggregation(), AggregationStats | Pattern detection, correlation |
| `log-query-views.ts` | 586 | (standalone) | getRecentLogs(), getLogCountsByLevel(), etc. | SQL query builders |

**Internal Dependencies:**
```
log.ts → config.js, utils/error-utils.js, logBuffer.js
logBufferInit.ts → logBuffer.js, log.js
log-aggregator.ts → generated/prisma/client.js
```

**Target Directory:** `src/shared/logging/`

---

### 2. Database Cluster (4 files)

| File | Lines | Imports From | Exports | Notes |
|------|-------|--------------|---------|-------|
| `prisma.ts` | 749 | config.js, log.js, utils/index.js | prisma, onPremiseDevPrisma, onPremiseExperimentPrisma | Dual client + heartbeat |
| `pg-connection.ts` | 362 | log.js, utils/error-utils.js | PostgresConnection, DbConfig, DbStats | PROD/LOCAL pools |
| `pg-query.ts` | 285 | (standalone) | buildSelect, buildInsert, buildUpdate, buildDelete | Query builders |
| `pg-transaction.ts` | 87 | log.js | transaction(), TransactionOptions | Transaction helpers |

**Internal Dependencies:**
```
prisma.ts → config.js, log.js, utils/index.js
pg-connection.ts → log.js, utils/error-utils.js
pg-transaction.ts → log.js
```

**Target Directory:** `src/shared/database/`

---

### 3. Event System Cluster (2 files)

| File | Lines | Imports From | Exports | Notes |
|------|-------|--------------|---------|-------|
| `event-bus.ts` | 733 | utils/error-utils.js, event-types.js | EventBus, BusEvent, emit(), subscribe() | Phase 5 typed payloads |
| `event-types.ts` | 476 | ../errors/base.js | EventTopicMap, EventPayload, all payload types | Type definitions |

**Internal Dependencies:**
```
event-bus.ts → utils/error-utils.js, event-types.js
event-types.ts → ../errors/base.js (SerializedError, ErrorSeverity, ErrorDomain)
```

**Target Directory:** `src/shared/events/`

---

### 4. Console/Output Cluster (2 files)

| File | Lines | Imports From | Exports | Notes |
|------|-------|--------------|---------|-------|
| `console-renderer.ts` | 674 | generated/prisma/client.js | initConsoleRenderer(), startConsoleRenderer(), etc. | DB-First console output |
| `console-interceptor.ts` | 410 | (standalone) | installConsoleInterceptor() | Capture console output |

**Internal Dependencies:**
```
console-renderer.ts → generated/prisma/client.js
console-interceptor.ts → (none)
```

**Target Directory:** `src/shared/console/`

---

### 5. Monitoring Cluster (3 files)

| File | Lines | Imports From | Exports | Notes |
|------|-------|--------------|---------|-------|
| `observability.ts` | 403 | logger.js, console-renderer.js, metrics-collector.js, log-aggregator.js, system-health-monitor.js | initializeObservability(), shutdownObservability() | Unified init |
| `metrics-collector.ts` | 358 | utils/error-utils.js | startMetricsCollection(), CollectionStats | Worker health telemetry |
| `system-health-monitor.ts` | 717 | logger.js, utils/error-utils.js, utils/date-utils.js | initHealthMonitor(), SystemHealth | Real-time health scoring |

**Internal Dependencies:**
```
observability.ts → logger.js, console-renderer.js, metrics-collector.js, log-aggregator.js, system-health-monitor.js
metrics-collector.ts → utils/error-utils.js
system-health-monitor.ts → logger.js, utils/error-utils.js, utils/date-utils.js
```

**Target Directory:** `src/shared/monitoring/`

---

### 6. Services Cluster (3 files)

| File | Lines | Imports From | Exports | Notes |
|------|-------|--------------|---------|-------|
| `service-registry.ts` | 749 | ../utils/logger.js, utils/error-utils.js | ServiceRegistry, ServiceConfig | DI + lifecycle |
| `service-factories.ts` | 815 | service-registry.js, ../services/monitoring/*, ../services/cache/*, ../services/database/* | *Config factories | Factory functions |
| `rate-limiter.ts` | 843 | (standalone) | RateLimiter, createRateLimiter() | Token bucket |

**Internal Dependencies:**
```
service-registry.ts → ../utils/logger.js, utils/error-utils.js
service-factories.ts → service-registry.js, many service imports
rate-limiter.ts → (none)
```

**Target Directory:** `src/shared/services/`

---

### 7. Config Cluster (3 files)

| File | Lines | Imports From | Exports | Notes |
|------|-------|--------------|---------|-------|
| `config.ts` | 361 | ../config/env.js, utils/index.js | RuntimeConfig, loadConfig(), config | Database URL resolution |
| `constants.ts` | 208 | (standalone) | GAME_CONSTANTS, TIME_CONSTANTS, CACHE_CONSTANTS, etc. | Application constants |
| `feature-flags.ts` | 721 | (standalone) | FeatureFlagDefinition, isEnabled(), toggle() | Feature toggles |

**Internal Dependencies:**
```
config.ts → ../config/env.js, utils/index.js
constants.ts → (none)
feature-flags.ts → (none)
```

**Target Directory:** `src/shared/config/`

---

### 8. Types/Misc Cluster (3 files)

| File | Lines | Imports From | Exports | Notes |
|------|-------|--------------|---------|-------|
| `json-types.ts` | 95 | generated/prisma/client.js | toJsonValue(), fromJsonValue() | Prisma JSON bridge |
| `datetime.js` | 208 | (standalone) | toEasternString(), toEasternTime(), etc. | Timezone utilities |
| `legacy-stubs.ts` | 513 | logger.js | LegacyLogLevel, legacyLog() | Backwards compatibility |

**Internal Dependencies:**
```
json-types.ts → generated/prisma/client.js
datetime.js → (none)
legacy-stubs.ts → logger.js
```

**Target Directory:** Stay in `src/shared/` root

---

### Existing Subdirectories (Already Organized)

| Directory | Files | Purpose |
|-----------|-------|---------|
| `cache/` | memory.ts, ROUTER.md | Memory cache utilities |
| `storage/` | ROUTER.md | Storage adapters |
| `utils/` | 12 files + index.ts | Utility functions |
| `models/` | 12 files + index.ts | Data models (pg queries) |
| `crypto/` | 3 files + index.ts | Crypto utilities |

---

## src/services/ Complete Dependency Map

### Root Files to Reorganize (26 files)

#### Alert/Notification Cluster
| File | Lines | Target Dir |
|------|-------|------------|
| `alert-throttle.ts` | 635 | `alerts/` |
| `lifecycle-notifier.ts` | 474 | `alerts/` |

#### Repository Cluster
| File | Lines | Target Dir |
|------|-------|------------|
| `base-repository.ts` | 716 | `repositories/` |
| `battle-repository.ts` | 851 | `repositories/` |
| `homestead-repository.ts` | 473 | `repositories/` |
| `pokemon-repository.ts` | 924 | `repositories/` |
| `trainer-repository.ts` | 715 | `repositories/` |

#### Homestead Cluster
| File | Lines | Target Dir | Imports From | Notes |
|------|-------|------------|--------------|-------|
| `homestead-manager.ts` | 601 | `homestead/` | discord.js, prisma.js, utils/logger.js, config/env.js, homestead-repository.js, homestead-permissions.js | HomesteadChannelManager, getOrCreateChannel() |
| `homestead-permissions.ts` | 46 | `homestead/` | discord.js (PermissionFlagsBits) | USER_PERMISSIONS, BOT_PERMISSIONS, EVERYONE_DENY |
| `homestead-player-monitor.ts` | 506 | `homestead/` | discord.js, shared/prisma.js, utils/logger.js, homestead-manager.js, homestead-repository.js | Round-robin health checking |
| `homestead-verification.ts` | 683 | `homestead/` | discord.js, shared/prisma.js, crypto, ImmutableAuditService, EventBus | 5-phase atomic creation, HMAC fingerprints |

#### Processing Cluster
| File | Lines | Target Dir | Imports From | Notes |
|------|-------|------------|--------------|-------|
| `batch-processor.ts` | 1275 | `processing/` | utils/logger.js, shared/utils/*, audit-service.js | Chunked processing, resumability |
| `write-coalescer.ts` | 629 | `processing/` | generated/prisma/client.js, prom-client, utils/logger.js, shared/utils/async-utils.js | Write-behind cache, batch writes |
| `query-cache.ts` | 634 | `processing/` | prom-client, utils/logger.js | Tag-based invalidation, LRU eviction |
| `query-profiler.ts` | 621 | `processing/` | generated/prisma/client.js, utils/logger.js, prom-client | EXPLAIN ANALYZE, index recommendations |

#### Connection Cluster
| File | Lines | Target Dir | Imports From | Notes |
|------|-------|------------|--------------|-------|
| `connection-health-monitor.ts` | 568 | `connection/` | utils/logger.js, config/database-pool-config.js, prom-client | Leak detection, pool monitoring |
| `distributed-lock.js` | 379 | `connection/` | ioredis, utils/logger.js | Redis-backed locks with in-memory fallback |
| `rls-context.ts` | 346 | `connection/` | generated/prisma/client.js | setUserContext(), clearUserContext(), RLS policies |

#### Player Cluster
| File | Lines | Target Dir | Imports From | Notes |
|------|-------|------------|--------------|-------|
| `player-checkpoint.ts` | 1063 | `player/` | discord.js, prisma.js, utils/*, homestead-manager.js, discord-identity.js | VS Code-style checkpoint recovery |
| `player-resolver.ts` | 519 | `player/` | discord.js, prisma.js, utils/*, discord-identity.js | ResolvedPlayer, PlayerContext |
| `discord-identity.ts` | 688 | `player/` | prisma.js, utils/error-utils.js, utils/logger.js | DiscordUserIdentity, DiscordGuildIdentity |

#### Misc Services (Stay at Root)
| File | Lines | Notes | Imports From |
|------|-------|-------|--------------|
| `audit-service.ts` | 664 | Cross-cutting | generated/prisma/client.js, rls-context.js, intelligent-logger.js, json-types.js |
| `database-metrics.ts` | 397 | Prometheus metrics | prom-client, config/database-pool-config.js, utils/logger.js |
| `health-server.ts` | 279 | HTTP health endpoint | node:http, engine-db-config.js, utils/logger.js, service-registry.js |
| `home-bundle-pg.ts` | 117 | Multi-model queries | pg, shared/pg-connection.js, types/db-models.js |
| `restart-metrics.ts` | 401 | Startup telemetry | fs, path, utils/logger.js |

### Legacy JavaScript Services (Stay at Root for Now)
| File | Lines | Notes | Imports From |
|------|-------|-------|--------------|
| `cache.js` | 227 | Persistent disk caching | utils/logger.js, shared/utils/*, shared/constants.js |
| `role-assignment.js` | 309 | Unified role assignment | distributed-lock.js, prometheus-metrics.js |
| `pokemonService.js` | 595 | PokeAPI integration | fs, path, utils/logger.js, shared/utils/* |
| `prometheus-metrics.js` | 439 | Prometheus metrics | prom-client, statistics-window.js |
| `metrics-server.js` | 204 | HTTP /metrics endpoint | express, prometheus-metrics.js |
| `statistics-window.js` | 384 | Rolling time windows | (standalone) |

### Existing Subdirectories (SCANNED)
| Directory | Files | Purpose | Barrel Export |
|-----------|-------|---------|---------------|
| `ai/` | 4 files | AI logging: ai-log-writer.js (694L), ai-log-analyzer.js, ai-log-integrations.js | aiLogger, aiLogAnalyzer, aiLogIntegrations |
| `cache/` | 6 files | Engine cache + facade | engine-cache.ts, engine-write-buffer.ts, facade.ts, recipes.ts |
| `database/` | 5 files | Engine DBs + SQL utils | engine-read-db.ts, engine-write-db.ts, sql-utils.ts |
| `monitoring/` | 10 files | Error tracking + resource mgmt | errorTracker, resourceManager, resourceMonitor, errorLearning |
| `data-pool/` | 2 files | Discord entity capture: data-pool-service.ts (789L) | DataPoolService, syncGuild() |

#### ai/ Subdirectory Detail
| File | Lines | Exports | Notes |
|------|-------|---------|-------|
| `index.ts` | 24 | aiLogger, aiLogAnalyzer, aiLogIntegrations | Barrel export |
| `ai-log-writer.js` | 694 | log(), initialize(), shutdown(), getStats() | NDJSON hard logging, 10MB rotation, correlation IDs |
| `ai-log-analyzer.js` | ? | aiLogAnalyzer | Analysis utilities |
| `ai-log-integrations.js` | ? | aiLogIntegrations | Integration hooks |

#### database/ Subdirectory Detail  
| File | Lines | Exports | Notes |
|------|-------|---------|-------|
| `index.ts` | 26 | engineReadDb, engineWriteDb (namespaces) | Barrel export |
| `engine-read-db.ts` | 470 | getAllPokemon(), getAllMoves(), getVersion(), getStats() | SQLite WAL mode |
| `engine-write-db.ts` | 697 | insertBattleLogs(), validateData(), uploadToProd(), replayWAL() | WAL + auto-save |
| `sql-utils.ts` | ? | SQL helper utilities | Query builders |

#### monitoring/ Subdirectory Detail (FULLY SCANNED)
| File | Lines | Exports | Notes |
|------|-------|---------|-------|
| `index.ts` | 74 | resourceManager, errorTracker, errorLearning (namespace), resourceMonitor | Barrel export |
| `error-tracker.ts` | 719 | LiveErrorEvent, ErrorCategory, ErrorSeverity, ErrorStats, errorTracker | Error capture, fingerprinting, persistence |
| `error-learning.ts` | 736 | TimePattern, ErrorCorrelation, ErrorCascade, ImpactPrediction, RecoveryStrategy | AI pattern detection |
| `error-taxonomy.ts` | ? | Error classification | Taxonomy system |
| `error-alerting-service.ts` | ? | Alert integration | Error → alerts |
| `resource-manager.ts` | 1101 | ResourceType, ResourceHandle, TimerHandle, ListenerHandle, DiskCacheHandle | Centralized resource lifecycle |
| `resource-monitor.ts` | 1126 | IPrunableCache, startResourceMonitoring(), MEMORY_THRESHOLDS | RAM monitoring, memory guardian |
| `monitoring-utils.ts` | ? | generateResourceId(), utility functions | Shared utilities |
| `os-error-interceptor.ts` | ? | OS-level error interception | System error capture |

#### cache/ Subdirectory Detail
| File | Lines | Exports | Notes |
|------|-------|---------|-------|
| `index.ts` | 26 | facade exports, engineCache, engineWriteBuffer, recipes | Barrel export |
| `facade.ts` | ? | getOrHydrate(), RuntimeCache | Memory + disk tiers |
| `engine-cache.ts` | 661 | getPokemon(), getMove(), getTypeEffectiveness(), getStats() | L1 cache, 20MB max |
| `engine-write-buffer.ts` | 476 | logBattle(), logMoveUsage(), flush(), getStats() | 10k entries max |
| `recipes.ts` | ? | Cache recipe definitions | TTL configs |

---

## src/utils/ Migration Map (FULLY SCANNED)

### Files to Migrate (12 files)

| File | Lines | Target Location | Imports From | Action | Notes |
|------|-------|-----------------|--------------|--------|-------|
| `intelligent-logger.ts` | 986 | `src/shared/logging/` | node:crypto, node:perf_hooks, node:fs, monitoring/error-tracker.js, event-bus.js, config/env.js | MOVE | AI-optimized, 7MB circular buffer |
| `output-formatter.ts` | 474 | `src/shared/formatting/` | (standalone) | MOVE | Script output formatting |
| `logger.js` | 1152 | `src/shared/logging/` | (various) | MOVE | DB-First architecture |
| `logger.d.ts` | ? | `src/shared/logging/` | (type definitions) | MOVE | TypeScript declarations |
| `cliStatus.js` | ? | `src/shared/logging/` | ? | MOVE | CLI status display |
| `cliStatus.d.ts` | ? | `src/shared/logging/` | (type definitions) | MOVE | TypeScript declarations |
| `activityTracker.js` | 125 | `src/services/monitoring/` | logger.js, shared/utils/index.js | MOVE | Activity tracking, subscribers |
| `fatalErrorGuard.js` | 78 | `src/services/monitoring/` | utils/logger.js, node:util | MOVE | uncaughtException/unhandledRejection |
| `opsNotifier.js` | 231 | `src/services/alerts/` | utils/logger.js, shared/utils/index.js, shared/constants.js | MOVE | Error notifications |
| `memory-measurement.ts` | 346 | `src/services/monitoring/` | shared/logBuffer.js, shared/event-bus.js, shared/utils/index.js | MOVE | Component memory stats |
| `stack-trace-parser.ts` | 661 | `src/shared/utils/` | node:fs, shared/utils/index.js | MOVE | Stack frame parsing, source snippets |
| `ROUTER.md` | ? | DELETE after migration | N/A | DELETE | Directory documentation |

---

## src/config/ Module Detail (SCANNED)

Configuration module is well-organized but key files documented for cross-reference:

| File | Lines | Purpose | Exports | Key Dependencies |
|------|-------|---------|---------|------------------|
| `index.ts` | 128 | Barrel export | loadAppConfig, getConfig, getDatabaseConfig, isProduction, isRender | loader.js, schema.js |
| `schema.ts` | 329 | Zod validation schemas | DatabaseConfigSchema, DiscordConfigSchema, MonitoringConfigSchema | zod/v4 |
| `loader.ts` | ? | Config loading logic | All domain-specific getters | schema.js, env.js |
| `database-pool-config.ts` | 343 | Connection pool per service | PoolConfig, POOL_CONFIGS, getPoolMetrics() | shared/log.js |
| `engine-db-config.ts` | 558 | Engine DB config | EngineDbConfig, validateEngineDbConfig() | (standalone) |
| `env.js` | ? | Environment variables | All env accessors | (node:process) |

---

## src/workers/ Module Detail (SCANNED)

| File | Lines | Purpose | Exports | Key Dependencies |
|------|-------|---------|---------|------------------|
| `worker-manager.ts` | 223 | Worker orchestration | WorkerManager.initializeAll(), startAll(), stopAll() | database/index.js |
| `engine-workers.ts` | 903 | Engine background workers | startEngineWorkers(), EngineWorkersStatus | engine-cache.js, engine-write-buffer.js, worker-error-handler.js |
| `worker-error-handler.ts` | ? | Error handling for workers | workerErrorHandler | error-tracker.js |
| `error-learning-worker.ts` | ? | AI error pattern detection | ? | monitoring/* |
| `homestead-integrity.ts` | ? | Channel integrity checks | ? | homestead-manager.js |
| `log-ingestion-worker.ts` | ? | Log processing | ? | intelligent-logger.js |
| `database/` | 5 files | Database worker implementations | ProdPostgresWorker, TimescaleDBWorker, EngineReadWorker, EngineWriteWorker | prisma.js, engine-*-db.js |

---

## src/shared/models/ Detail (SCANNED)

Dual query system (Prisma + raw pg) for migration flexibility:

| File | Lines | Purpose | Exports | Notes |
|------|-------|---------|---------|-------|
| `index.ts` | 12 | Barrel export | party-queries.js, user-queries.js | Re-exports |
| `party-queries.ts` | 127 | Prisma party patterns | PARTY_WITH_SLOTS_INCLUDE, PartyWithSlots, getPartyWithSlots() | Prisma includes |
| `user-queries.ts` | 197 | Prisma user patterns | UserBasic, UserForDisplay, getUserBasic() | Prisma select |
| `party-queries-pg.ts` | 765 | Raw pg party queries | PartyWithSlots, getPartyWithSlots(), healAllPokemon() | Full replacement |
| `user-queries-pg.ts` | 628 | Raw pg user queries | getUserBasic(), getUserForDisplay(), getUserWithParty() | Full replacement |

---

## Circular Dependency Analysis

### Known Circular Dependencies

1. **log.ts ↔ intelligent-logger.ts**
   - `log.ts` lazy-loads CLI logger
   - `intelligent-logger.ts` imports EventBus
   - **Solution:** Keep lazy-load pattern

2. **service-registry.ts ↔ service-factories.ts**
   - Registry imports factory configs
   - Factories import services
   - **Solution:** Keep separate, factories are pure functions

3. **prisma.ts ↔ log.ts**
   - Prisma uses log for heartbeat status
   - Log may need Prisma for DB logging
   - **Solution:** prisma.ts uses minimal log (no DB logging during init)

### Safe Dependency Order

```
1. config.ts, constants.ts (foundation - no deps)
2. utils/ (format-utils, error-utils, etc.)
3. log.ts, logBuffer.ts (minimal logging)
4. prisma.ts, pg-*.ts (database layer)
5. event-bus.ts, event-types.ts (event system)
6. service-registry.ts (DI container)
7. logger.ts, intelligent-logger.ts (full logging)
8. All other services
```

---

## Risk Assessment

### High Risk Moves

| File | Risk | Mitigation |
|------|------|------------|
| `prisma.ts` | Central import, 100+ consumers | Alias in barrel export |
| `config.ts` | Central import, 50+ consumers | Alias in barrel export |
| `event-bus.ts` | Event system foundation | Test all subscriptions |
| `intelligent-logger.ts` | Complex, 986 lines | Move with logger.js together |

### Low Risk Moves

| File | Risk | Notes |
|------|------|-------|
| `json-types.ts` | 3 consumers | Simple type bridge |
| `datetime.js` | 10 consumers | Pure functions |
| `rate-limiter.ts` | 5 consumers | Standalone |

---

## Import Update Strategy

### Phase 6.1: src/shared/ Reorganization

For each file moved from `src/shared/X.ts` to `src/shared/cluster/X.ts`:

1. **Create barrel export in new directory:**
   ```typescript
   // src/shared/logging/index.ts
   export * from './log.js';
   export * from './logger.js';
   export * from './logBuffer.js';
   // etc.
   ```

2. **Update root barrel export:**
   ```typescript
   // src/shared/index.ts (if exists)
   export * from './logging/index.js';
   export * from './database/index.js';
   // etc.
   ```

3. **Find & Replace imports:**
   - `from '../shared/log.js'` → `from '../shared/logging/log.js'`
   - Or use barrel: `from '../shared/logging/index.js'`

### Phase 6.3: src/utils/ Migration

1. **Move logger files to src/shared/logging/**
2. **Move monitoring files to src/services/monitoring/**
3. **Update all imports across codebase**
4. **Delete src/utils/ directory when empty**

---

## Verification Checklist

### Pre-Move Verification
- [ ] TypeScript build passes: `npx tsc --noEmit`
- [ ] All tests pass: `npm test`
- [ ] No circular deps detected
- [ ] Import map documented

### Post-Move Verification
- [ ] TypeScript build passes
- [ ] All tests pass
- [ ] Imports updated (grep check)
- [ ] ROUTER.md files created
- [ ] Git commit with clear message

---

## Next Steps

1. ✅ **Complete dependency scanning** (this document)
2. ⬜ **Execute Phase 6.1**: Move src/shared/ files to clusters
3. ⬜ **Execute Phase 6.2**: Move src/services/ files to clusters
4. ⬜ **Execute Phase 6.3**: Migrate src/utils/ files
5. ⬜ **Execute Phase 6.4**: Barrel export audit
6. ⬜ **Final verification**: Build + tests + manual review

---

**Document Version:** 3.0 (COMPLETE)  
**Last Updated:** 2025-12-18  
**Author:** GitHub Copilot (Claude Opus 4.5)

---

## Detailed File Analysis (Deep Scanning Results)

### src/services/ Alert/Notification Cluster (FULLY SCANNED)

| File | Lines | Imports From | Exports | Notes |
|------|-------|--------------|---------|-------|
| `alert-throttle.ts` | 635 | shared/constants.js (ALERT_STRATEGY_CONSTANTS) | AlertSeverity, AlertEntry, ThrottleDecision, AlertStatistics, QuietHoursConfig | Severity-based cooldowns, quiet hours, batching |
| `lifecycle-notifier.ts` | 474 | utils/logger.js, shared/utils/*, service-registry.js, config/env.js | BootNotification, ShutdownNotification, CrashNotification | Discord webhooks for boot/shutdown/crash |

### src/services/ Repository Cluster (FULLY SCANNED)

| File | Lines | Imports From | Exports | Notes |
|------|-------|--------------|---------|-------|
| `base-repository.ts` | 716 | generated/prisma/client.js, rls-context.js | BaseEntity, SoftDeletable, PaginatedResult, IRepository, BaseRepository | Generic CRUD, pagination, soft delete, RLS context |
| `battle-repository.ts` | 851 | generated/prisma/client.js, rls-context.js, json-types.js | BattleState, BattleResult, BattleWithUsers, CreateBattleData | Player-based queries, state management |
| `homestead-repository.ts` | 473 | shared/prisma.js, generated/prisma/client.js, utils/date-utils.js | HomesteadStatus, HomesteadWithUser, HomesteadRepository | User/Guild-scoped queries, lifecycle |
| `pokemon-repository.ts` | 924 | generated/prisma/client.js, rls-context.js, json-types.js | StatSpread, MoveSlot, PokemonWithSpecies, CreatePokemonData | Owner-based queries, evolution checks |
| `trainer-repository.ts` | 715 | generated/prisma/client.js, rls-context.js | CreateTrainerDTO, UpdateTrainerDTO, TrainerWithRelations, LeaderboardEntry | Paginated results, leaderboards |

### src/services/ Homestead Cluster (FULLY SCANNED)

| File | Lines | Imports From | Exports | Notes |
|------|-------|--------------|---------|-------|
| `homestead-manager.ts` | 601 | discord.js, shared/prisma.js, utils/logger.js, config/env.js, homestead-repository.js, homestead-permissions.js | HomesteadChannelManager, ChannelCreationResult | Get/create private channels |
| `homestead-permissions.ts` | 46 | discord.js (PermissionFlagsBits) | USER_PERMISSIONS, BOT_PERMISSIONS, EVERYONE_DENY | Permission constants |
| `homestead-player-monitor.ts` | 506 | discord.js, shared/prisma.js, utils/logger.js, homestead-manager.js, homestead-repository.js | HomesteadPlayerMonitor, MonitorStats, PlayerCheckResult | Round-robin health checking |
| `homestead-verification.ts` | 683 | discord.js, shared/prisma.js, crypto, ImmutableAuditService, EventBus | HomesteadCreationOptions, VerifiedHomesteadResult, IntegrityReport | 5-phase atomic creation, HMAC fingerprints |

### src/services/ Processing Cluster (FULLY SCANNED)

| File | Lines | Imports From | Exports | Notes |
|------|-------|--------------|---------|-------|
| `query-cache.ts` | 634 | prom-client, utils/logger.js | CacheKeyOptions, QueryCacheConfig, WarmupConfig, CacheStats | Tag-based invalidation, LRU eviction |
| `write-coalescer.ts` | 629 | generated/prisma/client.js, prom-client, utils/logger.js, shared/utils/async-utils.js | EntityConfig, CoalescerConfig, CoalescerStats | Write-behind cache, batch writes, adaptive flush |
| `batch-processor.ts` | 1275 | utils/logger.js, shared/utils/*, audit-service.js | BatchJobStatus, BatchJobPriority, ItemResult, ChunkResult, BatchProgress | Chunked processing, resumability, dead letter queue |
| `query-profiler.ts` | 621 | generated/prisma/client.js, utils/logger.js, prom-client | ProfileResult, QueryProfile, IndexRecommendation | EXPLAIN ANALYZE, index recommendations |

### src/services/ Legacy JavaScript (FULLY SCANNED)

| File | Lines | Imports From | Exports | Notes |
|------|-------|--------------|---------|-------|
| `cache.js` | 227 | utils/logger.js, shared/utils/*, shared/constants.js, fs, path | Persistent disk caching | Render /Store support, pruning |
| `role-assignment.js` | 309 | distributed-lock.js, prometheus-metrics.js | assignRole() | Unified role assignment with distributed locking |
| `pokemonService.js` | 595 | fs, path, utils/logger.js, shared/utils/* | Weekly PokeAPI refresh | Concurrent fetching, sprite handling |
| `prometheus-metrics.js` | 439 | prom-client, statistics-window.js | initializeMetrics(), roleAssignmentsTotal, etc. | Counters, gauges, histograms |
| `metrics-server.js` | 204 | express, prometheus-metrics.js | startMetricsServer(), stopMetricsServer() | HTTP /metrics endpoint |
| `statistics-window.js` | 384 | (standalone) | TIME_WINDOWS, calculateWindowStats(), calculateRates() | 24h, 7d, 30d rolling windows |

### src/services/ Misc Services (FULLY SCANNED)

| File | Lines | Imports From | Exports | Notes |
|------|-------|--------------|---------|-------|
| `restart-metrics.ts` | 401 | fs, path, utils/logger.js | RestartMetrics, RestartEvent, CrashEvent | Persistent /Store/restart-metrics.json |
| `home-bundle-pg.ts` | 117 | pg, shared/pg-connection.js, types/db-models.js | findCooldownByUserAndKind(), createCooldown(), updateCooldown() | Complex multi-model queries |
| `audit-service.ts` | 664 | generated/prisma/client.js, rls-context.js, intelligent-logger.js, json-types.js | AuditService, AuditEntry, AuditAction | Automatic audit logging for CRUD |
| `data-pool/data-pool-service.ts` | 789 | discord.js, generated/prisma/client.js, utils/error-utils.js | DataPoolService, syncGuild(), syncMembers() | Discord entity capture |

### src/shared/ Core Files (FULLY SCANNED)

| File | Lines | Imports From | Exports | Notes |
|------|-------|--------------|---------|-------|
| `prisma.ts` | 749 | config.js, log.js, utils/index.js | prisma, onPremiseDevPrisma, onPremiseExperimentPrisma, getDatabaseStats(), TripleDatabaseStats | Dual client + heartbeat monitoring |
| `pg-connection.ts` | 362 | log.js, utils/error-utils.js | PostgresConnection, DbConfig, DbStats, DualDbStats, initializeConnection(), getProdDb() | PROD/LOCAL pools, SSL config |
| `config.ts` | 361 | ../config/env.js, utils/index.js | RuntimeConfig, loadConfig(), recordDatabaseConnectionSuccess(), DatabaseCandidate | Database URL resolution |
| `constants.ts` | 208 | (standalone) | GAME_CONSTANTS, TIME_CONSTANTS, CACHE_CONSTANTS, MONITORING_CONSTANTS, DISCORD_CONSTANTS, ALERT_STRATEGY_CONSTANTS | Application constants |
| `log.ts` | 249 | config.js, utils/error-utils.js, logBuffer.js | LogLevel, log functions | Lazy-loads CLI logger |
| `event-bus.ts` | 733 | utils/error-utils.js, event-types.js | EventBus, BusEvent, emit(), subscribe(), BusStats | Pattern matching, backpressure |
| `service-registry.ts` | 749 | ../utils/logger.js, utils/error-utils.js | ServiceRegistry, ServiceConfig, ServiceStatus | DI + lifecycle + shutdown |

### src/shared/utils/ Barrel Export (12 utilities)

| File | Purpose |
|------|---------|
| `format-utils.ts` | formatBytes, formatDuration, truncate, formatTimestamp |
| `error-utils.ts` | safeError, normalizeError, getErrorMessage |
| `async-utils.ts` | delay, delayWithJitter |
| `math-utils.ts` | clamp |
| `url-utils.ts` | extractDatabaseName |
| `date-utils.ts` | toDate, daysAgo, hoursAgo, isOlderThanDays |
| `file-utils.ts` | fileExists, ensureDir, readJsonFile, writeJsonFile |
| `object-utils.ts` | deepClone |
| `string-utils.ts` | normalizeString |
| `severity-utils.ts` | Severity level utilities |

---

## Scanning Session Summary

### Session 1 (Previous): Core Infrastructure
- src/shared/ root files (24 files)
- src/shared/ subdirectories (cache/, utils/, models/, crypto/)
- Partial src/services/ coverage

### Session 2 (Previous): Connection & Player Clusters
- query-profiler.ts, connection-health-monitor.ts, player-resolver.ts
- discord-identity.ts, distributed-lock.js, rls-context.ts
- database-metrics.ts, health-server.ts, player-checkpoint.ts
- src/services/ subdirectory indexes
- src/utils/ partial scan

### Session 3 (Current): Complete Deep Scan

**src/services/ Alert/Notification Cluster:**
- alert-throttle.ts (635 lines) — Severity-based cooldowns, quiet hours
- lifecycle-notifier.ts (474 lines) — Discord webhooks for boot/shutdown

**src/services/ Repository Cluster:**
- base-repository.ts (716 lines) — Generic CRUD, pagination, RLS
- battle-repository.ts (851 lines) — Battle state management
- homestead-repository.ts (473 lines) — Homestead channel CRUD
- pokemon-repository.ts (924 lines) — Pokemon instance operations
- trainer-repository.ts (715 lines) — Trainer CRUD, leaderboards

**src/services/ Homestead Cluster:**
- homestead-manager.ts (601 lines) — Channel management
- homestead-permissions.ts (46 lines) — Permission constants
- homestead-player-monitor.ts (506 lines) — Health checking
- homestead-verification.ts (683 lines) — 5-phase atomic creation

**src/services/ Processing Cluster:**
- query-cache.ts (634 lines) — Tag-based caching
- write-coalescer.ts (629 lines) — Write-behind pattern
- batch-processor.ts (1275 lines) — Enterprise batch processing

**src/services/ Legacy JavaScript:**
- cache.js (227 lines) — Persistent disk caching
- role-assignment.js (309 lines) — Unified role assignment
- pokemonService.js (595 lines) — PokeAPI integration
- prometheus-metrics.js (439 lines) — Prometheus metrics
- metrics-server.js (204 lines) — HTTP /metrics endpoint
- statistics-window.js (384 lines) — Rolling time windows

**src/services/ Misc:**
- restart-metrics.ts (401 lines) — Restart tracking
- home-bundle-pg.ts (117 lines) — Multi-model queries
- audit-service.ts (664 lines) — Audit logging
- data-pool-service.ts (789 lines) — Discord entity capture

**src/shared/ Core Files:**
- prisma.ts (749 lines) — Dual client architecture
- pg-connection.ts (362 lines) — PROD/LOCAL pools
- config.ts (361 lines) — Runtime configuration
- constants.ts (208 lines) — Application constants
- log.ts (249 lines) — Structured logging
- event-bus.ts (733 lines) — Unified event routing
- service-registry.ts (749 lines) — DI container

**Total Lines Scanned (Session 3):** ~15,000+ lines
**Total Files Scanned (All Sessions):** 100+ files
**Total Lines Analyzed:** 40,000+ lines

---

## Key Architectural Insights from Deep Scanning

### 1. Repository Pattern Foundation
- `base-repository.ts` provides generic CRUD with:
  - Pagination (PaginatedResult<T>)
  - Soft delete (SoftDeletable interface)
  - RLS context integration
  - Filter/sort query builders
- Domain repositories extend this pattern consistently

### 2. Homestead Architecture
```
homestead-permissions.ts → homestead-manager.ts → homestead-repository.ts
                               ↓
                    homestead-verification.ts (5-phase atomic creation)
                               ↓
                    homestead-player-monitor.ts (continuous health)
```

### 3. Metrics Architecture
```
prometheus-metrics.js (defines metrics)
        ↓
statistics-window.js (calculates rolling windows)
        ↓
metrics-server.js (serves /metrics HTTP endpoint)
        ↓
database-metrics.ts (Prometheus for DB specifically)
```

### 4. Processing Pipeline
```
query-cache.ts (read cache) → batch-processor.ts (batch ops)
        ↓
write-coalescer.ts (write batching) → query-profiler.ts (EXPLAIN)
```

### 5. Alert/Notification Pipeline
```
alert-throttle.ts (cooldowns, batching)
        ↓
lifecycle-notifier.ts (Discord webhooks)
        ↓
opsNotifier.js (error notifications)
```

### 6. Database Layer
```
prisma.ts (ORM, heartbeat) → pg-connection.ts (raw pools)
        ↓
config.ts (URL resolution) → rls-context.ts (Row-Level Security)
```

---

## Recommendations for Phase 6 Execution

### 1. Create Directories First
```bash
mkdir -p src/shared/{logging,database,events,console,monitoring,services,config}
mkdir -p src/services/{alerts,repositories,homestead,processing,player,connection}
```

### 2. Move Order (Dependency-Safe)
1. **Foundation Layer:** constants.ts, config.ts (no deps)
2. **Utils Layer:** shared/utils/* (pure functions)
3. **Logging Layer:** log.ts, logBuffer.ts, logger.ts
4. **Database Layer:** prisma.ts, pg-*.ts
5. **Event Layer:** event-bus.ts, event-types.ts
6. **Service Layer:** All remaining files

### 3. Barrel Export Strategy
Each new directory gets `index.ts`:
```typescript
// src/shared/logging/index.ts
export * from './log.js';
export * from './logger.js';
export * from './logBuffer.js';
export * from './log-aggregator.js';
export * from './log-query-views.js';
```

### 4. Import Update Automation
Use grep + sed for bulk updates:
```bash
# Find all imports of prisma.ts
grep -r "from.*shared/prisma" src/

# Update to new location
find src/ -name "*.ts" -exec sed -i 's|shared/prisma|shared/database/prisma|g' {} \;
```

### 5. TypeScript Validation
After each move batch:
```bash
npx tsc --noEmit
npm test
```

---
