# Source Code Inventory

**Created:** 2026-01-06T14:00:00Z  
**Purpose:** Complete inventory of all source code files in `src/`, `scripts/`, `prisma/`, `assets/`, `data/`  
**Status:** ✅ COMPLETE — 412 code files verified  
**Cross-Reference:** [INVENTORY-INDEX.md](INVENTORY-INDEX.md)

---

## 📊 Summary

| Layer | Files | Lines (Est.) | Status |
|-------|-------|--------------|--------|
| SensaiOS Core | 18 | ~8,500 | ✅ |
| SensaiOS Capabilities | 1 | ~300 | ✅ |
| SensaiOS Install | 6 | ~1,700 | ✅ |
| SensaiOS GameServer | 6 | ~5,000 | ✅ |
| SensaiOS Security | 1 | ~400 | ✅ |
| SensaiOS Loader | 4 | ~800 | ✅ |
| Kernel | 14 | ~7,500 | ✅ |
| Discord Bot | 35 | ~12,000 | ✅ |
| Core Game Engines | 20 | ~1,500 | ✅ |
| Services | 52 | ~22,000 | ✅ |
| Observability | 26 | ~4,500 | ✅ |
| Shared | 50 | ~6,500 | ✅ |
| Workers | 17 | ~4,000 | ✅ |
| Commands | 20 | ~2,500 | ✅ |
| Engine | 9 | ~1,500 | ✅ |
| Data | 3 | ~850 | ✅ |
| Config | 5 | ~1,200 | ✅ |
| Utils | 11 | ~3,000 | ✅ |
| Scripts | 102 | ~15,000 | ✅ |
| Database (Prisma) | 5 | ~1,500 | ✅ |
| Root Files | 12 | ~3,000 | ✅ |
| **TOTAL** | **412** | **~100,000** | ✅ |

---

## 1. SensaiOS Ring Security (`src/sensaios/`) — 36 files

**Documentation:** Architecture Bible §28, Development Bible §11, Operations Bible §14

### Core (18 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `types.ts` | 321 | #core | Environment, ExportFormat, ErrorCategory, ErrorSeverity, GuardedContext |
| `tenant-scope.ts` | 450 | #core | TenantScope with factory functions (scopeFromInteraction, etc.) |
| `component-context.ts` | 1034 | #core | ComponentContext, DbPrimitive, ExportEnvelopeData, AppendResult |
| `context-factory.ts` | 840 | #core | createComponentContext(), DeterministicRng (Mulberry32) |
| `guarded-decorator.ts` | 376 | #core | @guarded decorator for class methods |
| `run-guarded.ts` | 455 | #core | runGuarded() with correlation, scope, timing, error capture |
| `sensai-error.ts` | 446 | #core | Error codes 1xxx-6xxx (KERNEL, DATABASE, COMPONENT, VALIDATION, EXTERNAL, GAME) |
| `index.ts` | 385 | #core | Barrel exports |
| `boot-logger.ts` | 360 | #core | Pre-DB logging per v1.1.2 spec |
| `canonical-error.ts` | 579 | #core | Error fingerprinting, detection, routing |
| `component-registry.ts` | 796 | #core | ComponentState, RegisteredComponent, state machine |
| `component-supervisor.ts` | 717 | #core | Component lifecycle, handler registration |
| `dispatchers.ts` | 752 | #core | Discord, export, job dispatchers |
| `error-routing.ts` | 384 | #core | ErrorRoute, DEFAULT_ERROR_ROUTES by severity |
| `error-tracker.ts` | 461 | #core | ErrorPattern, deduplication, trending |
| `export-envelope.ts` | 479 | #core | ExportEnvelope with mandatory TenantScope |
| `kernel-boot.ts` | 486 | #core | KernelConfig, SensaiKernel interface |
| `ROUTER.md` | — | #doc | Module routing documentation |

### Capabilities (1 file)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `capabilities/assert-capability.ts` | 302 | #security | checkCapability(), assertCapability() |

### Installation (6 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `install/app-manifest.ts` | 442 | #core | AppManifest, AppLifecycle, AppHandlers |
| `install/manifest-schema.ts` | 308 | #core | Zod validation schemas |
| `install/install-app.ts` | 332 | #core | 7-step install workflow |
| `install/uninstall-app.ts` | 272 | #core | 6-step uninstall workflow |
| `install/dependency-resolver.ts` | 311 | #core | Kahn's algorithm, cycle detection |
| `install/index.ts` | 31 | #core | Barrel exports |

### GameServer API (6 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `gameserver/api.ts` | 2745 | #api | GameServerAPI with security model |
| `gameserver/types.ts` | 1118 | #api | EncryptedToken, BattleTypes, rate limits |
| `gameserver/encryption.ts` | 492 | #security | AES-256-GCM, per-app keys |
| `gameserver/rate-limiter.ts` | 421 | #api | Sliding window rate limiter |
| `gameserver/singleton.ts` | 198 | #api | getGameServer() singleton |
| `gameserver/index.ts` | 15 | #core | Barrel exports |

### Security (1 file)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `security/secure-import.ts` | 397 | #security | secureImport(), assertImportAllowed() |

### Loader (4 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `loader/ring-resolver.ts` | 326 | #security | RING level detection, path normalization |
| `loader/module-hook.ts` | 428 | #security | ESM loader hook for ring enforcement |
| `loader/index.ts` | 25 | #core | Barrel exports |
| `loader/ROUTER.md` | — | #doc | Module documentation |

---

## 2. Kernel (`src/kernel/`) — 14 files

**Documentation:** Architecture Bible §16, §5

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `boot-kernel.ts` | 731 | #core | Root kernel bootstrap, KERNEL_ABSOLUTE_START |
| `correlation.ts` | 572 | #obs | CorrelationContext, AsyncLocalStorage propagation |
| `index.ts` | 107 | #core | Kernel barrel exports |
| `kernel-error-detector.ts` | 618 | #core | Error fingerprinting, crash detection |
| `kernel-hooks.ts` | 875 | #core | createLoggerHook, createErrorTrackerHook, etc. |
| `kernel-logger.ts` | 634 | #obs | Ring buffer, Database-First Architecture |
| `kernel-metrics.ts` | 1032 | #obs | KernelDashboard, metrics aggregation |
| `kernel-observer.ts` | 603 | #obs | Root observer, observation buffers |
| `kernel-output-plugins.ts` | 656 | #obs | Plugin architecture (console, file, Loki, Discord, DB) |
| `kernel-persistence.ts` | 725 | #db | Database-first persistence, CacheEntry table |
| `kernel-types.ts` | 348 | #core | LifecyclePhase, SystemType, SystemRegistration |
| `log-sampling.ts` | 717 | #obs | RATE_LIMIT, SAMPLE, FIRST_N, ADAPTIVE, DEDUP |
| `pii-scrubber.ts` | 594 | #security | PII scrubbing for Discord IDs, tokens, etc. |
| `ROUTER.md` | — | #doc | Module documentation |

---

## 3. Discord Bot (`src/bot/`) — 35 files

**Documentation:** Architecture Bible §10, §18, §7

### Core Bot (6 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `index.ts` | 503 | #core | Discord client bootstrap, command registration |
| `main.ts` | 3494 | #core | Security bot entry, role auditing |
| `error-handler.ts` | 323 | #core | BotErrorHandler, Discord API classification |
| `eventbus-integration.ts` | 555 | #core | Event bus Discord adapter |
| `dripAlerts.ts` | — | #ui | DripTVDD alert notifications |
| `ROUTER.md` | — | #doc | Module documentation |

### Homestead (17 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `homestead/home.ts` | 434 | #ui | Homestead home screen |
| `homestead/heal.ts` | 336 | #ui | Pokemon healing |
| `homestead/starters.ts` | 198 | #ui | Starter selection |
| `homestead/open-starter-selection.ts` | 339 | #ui | Open starter validation |
| `homestead/party.ts` | 513 | #ui | Party management |
| `homestead/bag.ts` | 816 | #ui | Inventory/bag |
| `homestead/pokedex.ts` | 413 | #ui | Pokedex regions |
| `homestead/storage.ts` | 622 | #ui | PC storage |
| `homestead/shop.ts` | 528 | #ui | Shop categories |
| `homestead/trade.ts` | 574 | #ui | P2P trading |
| `homestead/explore.ts` | 373 | #ui | Exploration |
| `homestead/fish.ts` | 651 | #ui | Fishing mini-game |
| `homestead/daily.ts` | 386 | #ui | Daily rewards |
| `homestead/achievements.ts` | 550 | #ui | Achievement hub |
| `homestead/leaderboards.ts` | 421 | #ui | Leaderboard viewing |
| `homestead/settings.ts` | 362 | #ui | User preferences |
| `homestead/ROUTER.md` | — | #doc | Module documentation |

### Battle (4 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `battle/actions.ts` | 481 | #ui | Battle action buttons |
| `battle/challenge.ts` | 263 | #ui | Battle challenge flow |
| `battle/conclude.ts` | 131 | #ui | Battle conclusion |
| `battle/ROUTER.md` | — | #doc | Module documentation |

### Wilds (3 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `wilds/walk.ts` | 90 | #ui | Walking/encounter triggers |
| `wilds/controls.ts` | 319 | #ui | Wild encounter controls |
| `wilds/ROUTER.md` | — | #doc | Module documentation |

### Ops (2 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `ops/admin.ts` | 2436 | #cli | /ops admin commands |
| `ops/ROUTER.md` | — | #doc | Module documentation |

### State (3 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `state/persistence.ts` | 1019 | #db | Database-first state save/load |
| `state/roleArchive.ts` | — | #security | Role change archive with HMAC |
| `state/securityBaselines.ts` | — | #security | Security baseline generation |

---

## 4. Core Game Engines (`src/core/`) — 20 files

**Documentation:** Architecture Bible §9

### Root (2 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `starter-validation.ts` | 351 | #core | Starter Pokemon validation |
| `ROUTER.md` | — | #doc | Core engines router |

### Battle (4 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `battle/engine.ts` | 116 | #core | Deterministic battle engine with SeededRNG |
| `battle/damage.ts` | 27 | #core | stab(), typeEffectiveness(), effectiveStat() |
| `battle/turn-manager.ts` | 172 | #core | Action queuing, turn resolution |
| `battle/ROUTER.md` | — | #doc | Module documentation |

### Encounter (3 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `encounter/spawn.ts` | 276 | #core | Rarity system (60/25/12/2.9% + 0.1% shiny) |
| `encounter/catch.ts` | 170 | #core | Catch chance, ball modifiers |
| `encounter/ROUTER.md` | — | #doc | Module documentation |

### PBSL (11 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `pbsl/rng.ts` | 93 | #core | Mulberry32 deterministic RNG |
| `pbsl/phases.ts` | 8 | #core | BattlePhase enum |
| `pbsl/audit.ts` | 64 | #core | MemoryAuditTrail |
| `pbsl/ROUTER.md` | — | #doc | Module documentation |
| `pbsl/battle/engine.ts` | 160 | #core | Full deterministic battle engine |
| `pbsl/battle/ROUTER.md` | — | #doc | Module documentation |
| `pbsl/data/provenance.ts` | 36 | #core | ProvenanceRecord |
| `pbsl/data/ROUTER.md` | — | #doc | Module documentation |
| `pbsl/encounter/ROUTER.md` | — | #doc | Module documentation |

---

## 5. Services (`src/services/`) — 52 files

**Documentation:** Architecture Bible §17, §12, §13

### Cache (6 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `cache/engine-cache.ts` | 1755 | #core | L1 in-memory cache (<1μs reads) |
| `cache/engine-write-buffer.ts` | 582 | #core | Non-blocking write buffer |
| `cache/facade.ts` | — | #core | Cache facade API |
| `cache/recipes.ts` | — | #core | Cache population recipes |
| `cache/index.ts` | — | #core | Barrel exports |
| `cache/ROUTER.md` | — | #doc | Module documentation |

### AI (5 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `ai/ai-log-analyzer.ts` | 931 | #obs | Pattern detection, correlation |
| `ai/ai-log-integrations.ts` | — | #obs | AI log integration |
| `ai/ai-log-writer.ts` | — | #obs | AI log output |
| `ai/index.ts` | — | #core | Barrel exports |
| `ai/ROUTER.md` | — | #doc | Module documentation |

### Database (5 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `database/engine-read-db.ts` | 693 | #db | sql.js SQLite for static data |
| `database/engine-write-db.ts` | 1839 | #db | Append-only SQLite with WAL |
| `database/sql-utils.ts` | — | #db | SQL utilities |
| `database/index.ts` | — | #core | Barrel exports |
| `database/ROUTER.md` | — | #doc | Module documentation |

### Monitoring (8 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `monitoring/error-tracker.ts` | 1599 | #obs | Crash resilience, kernel hooks |
| `monitoring/error-learning.ts` | 1614 | #obs | Pattern learning |
| `monitoring/resource-monitor.ts` | 1719 | #obs | Memory guardian (30s), disk pressure |
| `monitoring/resource-manager.ts` | 1080 | #core | Resource lifecycle |
| `monitoring/resilient-write-buffer.ts` | 550 | #db | Crash-resilient writes |
| `monitoring/monitoring-utils.ts` | 350 | #obs | Shared utilities |
| `monitoring/index.ts` | — | #core | Barrel exports |
| `monitoring/ROUTER.md` | — | #doc | Module documentation |

### Error-Brain (8 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `error-brain/error-brain-db.ts` | 1226 | #db | SQLite intelligence storage |
| `error-brain/error-brain-cache.ts` | 600 | #core | L1 cache (<1μs lookups) |
| `error-brain/pattern-detector.ts` | 905 | #core | O(1) time anomaly detection |
| `error-brain/impact-predictor.ts` | 691 | #core | ML-based impact prediction |
| `error-brain/error-brain-worker.ts` | — | #worker | Background learning |
| `error-brain/db-verify.ts` | — | #db | Database verification |
| `error-brain/index.ts` | 250 | #core | Barrel exports + facade |
| `error-brain/ROUTER.md` | — | #doc | Module documentation |

### Root Services (~20 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `prometheus-metrics.ts` | 1238 | #obs | Time-windowed metrics |
| `alert-dispatcher.ts` | 823 | #core | Severity-based routing |
| `health-server.ts` | 315 | #core | HTTP health endpoint |
| `homestead-manager.ts` | 604 | #core | Private channel lifecycle |
| `homestead-permissions.ts` | — | #security | Permission constants |
| `homestead-player-monitor.ts` | — | #core | Player activity monitoring |
| `homestead-repository.ts` | — | #db | Homestead data access |
| `homestead-verification.ts` | — | #core | Channel verification |
| `home-bundle-pg.ts` | — | #db | PostgreSQL queries |
| `achievements.ts` | — | #core | Achievement system |
| `cache.ts` | — | #core | Legacy cache service |
| `discord-identity.ts` | — | #core | Identity resolution |
| `distributed-lock.ts` | — | #db | Distributed locking |
| `fishing.ts` | — | #core | Fishing system |
| `inventory.ts` | — | #core | Inventory management |
| `item-effects.ts` | — | #core | Item effects |
| `leaderboards.ts` | — | #core | Leaderboard system |
| `leveling.ts` | — | #core | Level/XP system |
| `lifecycle-notifier.ts` | — | #core | Lifecycle notifications |
| `ROUTER.md` | — | #doc | Module documentation |

---

## 6. Observability (`src/observability/`) — 26 files

**Documentation:** Architecture Bible §12, §5

### Root (3 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `index.ts` | — | #obs | Suite lifecycle |
| `ROUTER.md` | — | #doc | Module documentation |
| `TELEMETRY_CONTRACT.md` | — | #doc | Telemetry contract |

### Layer (2 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `layer/index.ts` | — | #obs | Unified gateway |
| `layer/ROUTER.md` | — | #doc | Layer documentation |

### Envelope (8 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `envelope/types.ts` | 616 | #obs | ObservationKind, LogLevel, AlertSeverity |
| `envelope/factory.ts` | 479 | #obs | createLog, debug, info, warn, error, fatal |
| `envelope/serializer.ts` | 420 | #obs | 5 output formats |
| `envelope/console.ts` | 357 | #obs | scopedLogger(), environment-aware output |
| `envelope/query.ts` | 520 | #obs | Fluent query DSL |
| `envelope/migrate.ts` | 320 | #obs | Migration helpers |
| `envelope/index.ts` | 250 | #core | Barrel exports |
| `envelope/ROUTER.md` | — | #doc | Module documentation |

### Hub (4 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `hub/observability-hub.ts` | 437 | #obs | Central service manager |
| `hub/observability-config.ts` | 40 | #config | Hub configuration |
| `hub/observability-types.ts` | 120 | #obs | Types |
| `hub/index.ts` | — | #core | Barrel exports |

### Backends - Loki (9 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `backends/loki/loki-backend.ts` | 301 | #obs | IObservabilityBackend |
| `backends/loki/loki-queue.ts` | 176 | #obs | Bounded queue, 4-tier backpressure |
| `backends/loki/loki-circuit-breaker.ts` | 186 | #obs | Hystrix-style state machine |
| `backends/loki/loki-http-transport.ts` | 170 | #obs | HTTP client |
| `backends/loki/loki-flush-worker.ts` | 140 | #worker | Queue drain |
| `backends/loki/loki-health-worker.ts` | 100 | #worker | Endpoint probe |
| `backends/loki/loki-types.ts` | 80 | #obs | Types |
| `backends/loki/loki-config.ts` | 60 | #config | Configuration |
| `backends/loki/index.ts` | — | #core | Barrel exports |

---

## 7. Shared (`src/shared/`) — 50 files

**Documentation:** Architecture Bible §4, §2, §17, §5

### Core Shared (16 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `config.ts` | — | #config | Application configuration |
| `constants.ts` | — | #core | Global constants |
| `prisma.ts` | 801 | #db | Dual Prisma clients |
| `event-bus.ts` | 803 | #core | Typed pub-sub |
| `event-types.ts` | — | #core | Event type definitions |
| `service-registry.ts` | 878 | #core | DI pattern, health checks |
| `service-factories.ts` | — | #core | Service factory functions |
| `log.ts` | — | #obs | Simple log helper |
| `logger.ts` | — | #obs | Main logger facade |
| `logBuffer.ts` | — | #obs | Log buffering |
| `logBufferInit.ts` | — | #obs | Buffer initialization |
| `datetime.ts` | — | #core | Date/time utilities |
| `pg-connection.ts` | — | #db | PostgreSQL connection |
| `pg-query.ts` | — | #db | Query helpers |
| `pg-transaction.ts` | — | #db | Transaction handling |
| `ROUTER.md` | — | #doc | Module documentation |

### Logging (5 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `logging/console-renderer.ts` | 400 | #obs | Infinity Console |
| `logging/log-sampler.ts` | — | #obs | Log sampling |
| `logging/loki-transport.ts` | — | #obs | Loki transport |
| `logging/index.ts` | 130 | #core | Barrel exports |
| `logging/ROUTER.md` | — | #doc | Module documentation |

### Utils (15 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `utils/format-utils.ts` | 263 | #core | Formatting |
| `utils/error-utils.ts` | 134 | #core | Error utilities |
| `utils/async-utils.ts` | 32 | #core | Async utilities |
| `utils/math-utils.ts` | — | #core | Math utilities |
| `utils/url-utils.ts` | — | #core | URL utilities |
| `utils/string-utils.ts` | — | #core | String utilities |
| `utils/file-utils.ts` | — | #core | File utilities |
| `utils/object-utils.ts` | — | #core | Object utilities |
| `utils/date-utils.ts` | — | #core | Date utilities |
| `utils/deterministic-rng.ts` | — | #core | Deterministic RNG |
| `utils/error-classification.ts` | — | #core | Error classification |
| `utils/pii-scrubber.ts` | — | #security | PII scrubbing |
| `utils/severity-utils.ts` | — | #obs | Severity utilities |
| `utils/index.ts` | — | #core | Barrel exports |
| `utils/ROUTER.md` | — | #doc | Module documentation |

### Crypto (4 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `crypto/timing-safe.ts` | — | #security | CWE-208 prevention |
| `crypto/crypto-provider.ts` | — | #security | Crypto abstraction |
| `crypto/index.ts` | — | #core | Barrel exports |
| `crypto/ROUTER.md` | — | #doc | Module documentation |

### Models (8 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `models/battle-queries-pg.ts` | 458 | #db | Raw pg queries for battles |
| `models/encounter-queries-pg.ts` | 493 | #db | Raw pg queries for encounters |
| `models/party-queries-pg.ts` | 740 | #db | Raw pg queries for parties |
| `models/user-queries-pg.ts` | 628 | #db | Raw pg queries for users |
| `models/bus-queries-pg.ts` | — | #db | Raw pg queries for event bus |
| `models/cooldown-queries-pg.ts` | — | #db | Raw pg queries for cooldowns |
| `models/dex-queries-pg.ts` | — | #db | Raw pg queries for dex |
| `models/ROUTER.md` | — | #doc | Module documentation |

### Cache (2 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `cache/memory.ts` | — | #core | TTL cache, LRU |
| `cache/ROUTER.md` | — | #doc | Module documentation |

---

## 8. Workers (`src/workers/`) — 17 files

**Documentation:** Architecture Bible §3

### Root Workers (7 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `engine-workers.ts` | 1061 | #worker | 5 engine workers orchestrator |
| `worker-manager.ts` | 297 | #worker | Worker lifecycle orchestration |
| `worker-error-handler.ts` | 394 | #core | Worker-specific error handler |
| `error-learning-worker.ts` | 188 | #worker | Hourly error pattern analysis |
| `heap-pruner.ts` | 471 | #worker | ⚠️ DEPRECATED — Legacy cleanup only |
| `homestead-integrity.ts` | 329 | #worker | Hourly homestead verification |
| `ROUTER.md` | — | #doc | Module documentation |

### Database Workers (10 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `database/base-worker.ts` | 497 | #worker | Abstract base class |
| `database/types.ts` | 552 | #worker | Worker interfaces |
| `database/engine-read-worker.ts` | — | #worker | Read-optimized worker |
| `database/engine-write-worker.ts` | — | #worker | Write-buffered worker |
| `database/prod-postgres-worker.ts` | — | #worker | Production PostgreSQL |
| `database/timescaledb-worker.ts` | — | #worker | Time-series handling |
| `database/strategies.ts` | — | #worker | Cache eviction, write buffer |
| `database/protocols.md` | — | #doc | Worker protocols |
| `database/index.ts` | — | #core | Module exports |
| `database/ROUTER.md` | — | #doc | Module documentation |

---

## 9. Commands (`src/commands/`) — 20 files

**Documentation:** Operations Bible ops-commands-reference

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `battle.ts` | 61 | #cli | /battle command |
| `battle-turn.ts` | — | #cli | /battle-turn command |
| `calc.ts` | — | #cli | /calc command |
| `daily.ts` | — | #cli | /daily command |
| `dex.ts` | 115 | #cli | /dex command with autocomplete |
| `heal.ts` | — | #cli | /heal command |
| `help.ts` | — | #cli | /help command |
| `home.ts` | 727 | #cli | /home command — homestead hub |
| `move.ts` | — | #cli | /move command |
| `ops.ts` | 250 | #cli | /ops command — admin operations |
| `ping.ts` | — | #cli | /ping command |
| `profile.ts` | 201 | #cli | /profile command |
| `start.ts` | — | #cli | /start command |
| `starter.ts` | — | #cli | /starter command |
| `trade.ts` | — | #cli | /trade command |
| `types.ts` | 63 | #core | Command type definitions |
| `version.ts` | — | #cli | /version command |
| `walk.ts` | 34 | #cli | /walk command |
| `weak.ts` | — | #cli | /weak command |
| `ROUTER.md` | — | #doc | Module documentation |

---

## 10. Engine (`src/engine/`) — 9 files

**Documentation:** Architecture Bible §9

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `calc.ts` | 227 | #core | Battle damage calculations |
| `effects.ts` | 348 | #core | Status effects |
| `rng.ts` | 24 | #core | Deterministic RNG (Xorshift32) |
| `stats.ts` | 52 | #core | Stat calculations |
| `tables.ts` | 124 | #core | Ability/item configs |
| `turn.ts` | 150 | #core | Turn resolution |
| `types.ts` | 112 | #core | Engine types |
| `index.ts` | 406 | #core | Type chart, factory functions |
| `ROUTER.md` | — | #doc | Module documentation |

---

## 11. Data (`src/data/`) — 3 files

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `dexpack.ts` | 744 | #core | V2 runtime, hash table lookups |
| `dexpack.d.ts` | 96 | #core | Type declarations |
| `ROUTER.md` | — | #doc | Module documentation |

---

## 12. Config (`src/config/`) — 5 files

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `env.ts` | 589 | #config | Primary config, dotenv |
| `env.d.ts` | — | #config | Type declarations |
| `engine-db-config.ts` | 524 | #config | Engine DB config |
| `error-brain-config.ts` | — | #config | Error brain config |
| `ROUTER.md` | — | #doc | Module documentation |

---

## 13. Utils (`src/utils/`) — 11 files

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `logger.ts` | 1375 | #obs | Stats logger, Infinity Console |
| `output-formatter.ts` | 474 | #ui | CLI formatting |
| `visual-status.ts` | — | #ui | Visual status display |
| `cliStatus.ts` | — | #cli | CLI status helper |
| `cliStatus.d.ts` | — | #cli | Type declarations |
| `activityTracker.ts` | — | #obs | Activity tracking |
| `fatalErrorGuard.ts` | — | #core | Process-level error handling |
| `memory-measurement.ts` | — | #obs | Memory measurement |
| `opsNotifier.ts` | — | #core | Ops notifications |
| `stack-trace-parser.ts` | — | #obs | Stack trace parsing |
| `ROUTER.md` | — | #doc | Module documentation |

---

## 14. Scripts (`scripts/`) — 102 files

**Documentation:** scripts/ROUTER.md

### Domain CLIs (18 files across 9 domains)

| Domain | Files | Description |
|--------|-------|-------------|
| `lib/` | 12 | Foundation library (output, errors, exec, env, fs, ssh, cli) |
| `render/` | 2 | Render deployment |
| `observe/` | 2 | Loki log viewing |
| `db/` | 2 | Database ops |
| `diagnose/` | 2 | Emergency diagnostics |
| `guard/` | 2 | CI guards |
| `docker/` | 2 | Container management |
| `data/` | 2 | Data pipeline |
| `ops/` | 14 | Operations |

### Root-Level CLIs (4 files)

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `sensaios-cli.ts` | 1093 | #cli | SensaiOS CLI — 8 commands |
| `db-admin.ts` | 1001 | #cli | Database admin CLI |
| `logq.ts` | — | #cli | Log query CLI |
| `register-commands.ts` | — | #cli | Discord command registration |

### Data Pipeline (8 files)

| File | Tag | Description |
|------|-----|-------------|
| `build-data.ts` | #core | Data build pipeline |
| `build-dexpack.ts` | #core | Dexpack generation |
| `fetch-pokemon.mjs` | #core | Pokemon data fetching |
| `seed-dex.ts` | #db | Dex seeding |
| `dex/backfill-species.ts` | #db | Species backfill |
| `dex/seed-reference.ts` | #db | Reference seeding |
| `dex/warm-cache.ts` | #core | Cache warming |
| `dex/ROUTER.md` | #doc | Documentation |

### Security (4 files)

| File | Tag | Description |
|------|-----|-------------|
| `security/migrate-security-state.ts` | #security | State migration |
| `security/migrate-security-state-direct-pg.ts` | #security | Direct PG migration |
| `security/rollback-security-migration.ts` | #security | Migration rollback |
| `security/ROUTER.md` | #doc | Documentation |

### DevOps (7 files)

| File | Tag | Description |
|------|-----|-------------|
| `devops/backup-database.ps1` | #devops | Windows backup |
| `devops/backup-database.sh` | #devops | Unix backup |
| `devops/deploy-*.sql` | #devops | SQL deployment (3 files) |
| `devops/test-restore.*` | #devops | Restore testing (2 files) |

### Monitoring/Utility (~65 files)

**Cluster Declaration:** Remaining scripts follow patterns:
- `monitor-*.ps1` — Memory/disk monitoring
- `measure-*.mjs` — Performance measurement
- `check-*.ts` — Code quality checks
- `validate-*.ts` — Validation scripts
- `verify-*.sh` — CI verification

---

## 15. Database (`prisma/`) — 5 files + migrations

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `schema.prisma` | 1408 | #db | Database schema, Prisma 7 |
| `prisma.config.ts` | — | #db | Prisma 7 configuration |
| `schema-northstar.prisma.draft` | — | #db | Draft schema |
| `ROUTER.md` | — | #doc | Module documentation |
| `migrations/` | — | #db | Migration history (cluster) |

---

## 16. Root Files — 12 files

| File | Lines | Tag | Description |
|------|-------|-----|-------------|
| `src/index.ts` | 2012 | #core | Application entry |
| `security-bot.ts` | — | #core | Security bot entry |
| `render.yaml` | 362 | #config | Render service definitions |
| `package.json` | — | #config | Dependencies & scripts |
| `tsconfig.json` | — | #config | TypeScript configuration |
| `tsconfig.build.json` | — | #config | Build TS config |
| `eslint.config.js` | — | #config | ESLint rules |
| `vitest.config.ts` | — | #test | Test configuration |
| `vitest.database.config.ts` | — | #test | Database test config |
| `docker-compose.yml` | — | #config | Docker compose |
| `docker-compose.loki.yml` | — | #config | Loki stack compose |
| `Dockerfile` | — | #config | Container build |

---

## Tag Reference

| Tag | Description | Count |
|-----|-------------|-------|
| `#core` | Core application logic | ~180 |
| `#db` | Database operations | ~40 |
| `#obs` | Observability/monitoring | ~50 |
| `#ui` | User interface | ~25 |
| `#cli` | CLI commands | ~40 |
| `#security` | Security features | ~15 |
| `#config` | Configuration | ~20 |
| `#worker` | Background workers | ~15 |
| `#api` | API endpoints | ~10 |
| `#doc` | Documentation | ~45 |

---

**Last Updated:** 2026-01-06T14:00:00Z  
**Migrated From:** [../CODEBASE-INVENTORY.md](../CODEBASE-INVENTORY.md)
