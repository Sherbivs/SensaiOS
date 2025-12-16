# ROUTER
Title: Configuration Modules
Purpose: Environment config and centralized settings for services.
Owned Globs: src/config/**
Last Updated (UTC): 2025-12-16T00:00:00Z

Notes:
- **Phase 3 (Architecture Perfection):** Introduced Zod-validated configuration system.
- Still referenced by CommonJS surfaces that have not migrated to `src/shared/config.ts`.
- Keep typings (`env.d.ts`) aligned with the real config loader to avoid drift.
- **Engine DB Config (Phase 17-22)** provides centralized configuration for all Engine DB services with environment-aware defaults and validation.

Key Files:
- **index.ts** — Main barrel export for configuration module (NEW - Phase 3).
- **schema.ts** — Zod validation schemas for all configuration domains (NEW - Phase 3).
- **loader.ts** — Type-safe configuration loader with caching (NEW - Phase 3).
- env.js — Legacy environment bootstrap for CommonJS modules.
- env.d.ts — Ambient type definitions consumed by remaining TypeScript callers.
- database-pool-config.ts — Service-specific database pool configurations.
- engine-db-config.ts — Engine DB runtime configuration.

**Configuration Domains (Phase 3):**
- **EnvironmentConfig** — Node environment, Render detection, store path.
- **DatabaseConfig** — Database URLs, connection mode, heartbeat settings.
- **DiscordConfig** — Bot tokens, alert channels, admin user IDs.
- **WorkerConfig** — Worker intervals, concurrency, feature flags.
- **MonitoringConfig** — Logging, health checks, resource monitoring.
- **HomesteadConfig** — Private channel settings, cleanup thresholds.
- **SecurityConfig** — HMAC secrets, DoS protection thresholds.
- **FeatureFlags** — Feature toggles (dexV2, roleAudit, etc.).
- **NotificationConfig** — Alert recipients, schedules, webhooks.

**Usage:**
```typescript
import { loadAppConfig, getDatabaseConfig, isProduction } from '../config/index.js';

// Load all config at startup
const config = loadAppConfig();

// Or access specific domains
const dbConfig = getDatabaseConfig();
if (isProduction()) { /* production logic */ }
```

**Engine DB Config (Phase 17-22):**
- **engine-db-config.ts (558 lines)** — Centralized configuration for Engine DB runtime:
  
  **Environment Detection:**
  - IS_PRODUCTION — Detects production environment (NODE_ENV === 'production')
  - IS_TEST — Detects test environment (NODE_ENV === 'test' or VITEST === 'true')
  
  **Storage Paths:**
  - STORAGE_BASE_DIR — /Store/ (production), Store/ (local), Store/test/ (test)
  - READ_DB_PATH — ${STORAGE_BASE_DIR}engine-read.db
  - WRITE_DB_PATH — ${STORAGE_BASE_DIR}engine-write.db
  
  **L1 Cache Config:**
  - L1_CACHE_MAX_SIZE_MB — 20 MB memory limit
  - L1_CACHE_REFRESH_INTERVAL_MS — 3600000 (1 hour)
  - L1_CACHE_INIT_TIMEOUT_MS — 30000 (30 seconds)
  
  **Write Buffer Config:**
  - WRITE_BUFFER_MAX_QUEUE_SIZE — 10000 entries per queue
  - WRITE_BUFFER_FLUSH_INTERVAL_MS — 30000 (30 seconds)
  - WRITE_BUFFER_BACKPRESSURE_WARN_THRESHOLD — 0.75 (75%)
  - WRITE_BUFFER_BACKPRESSURE_REJECT_THRESHOLD — 0.95 (95%)
  
  **Worker Config:**
  - WORKER_STARTUP_STAGGER_MS — 5000 (5 seconds between workers)
  - WORKER_CACHE_REFRESH_INTERVAL_MS — 3600000 (1 hour)
  - WORKER_BUFFER_FLUSH_INTERVAL_MS — 30000 (30 seconds)
  - WORKER_READ_DB_SYNC_INTERVAL_MS — 86400000 (24 hours, Render cron)
  - WORKER_VALIDATION_INTERVAL_MS — 600000 (10 minutes)
  
  **Validation Config:**
  - VALIDATION_MIN_QUALITY_SCORE — 0.95 (95% pass rate required)
  - VALIDATION_SAMPLING_RATE — 0.1 (10% of rows validated)
  - VALIDATION_BATCH_SIZE — 1000 (rows per batch)
  
  **Write-DB Config:**
  - WRITE_DB_AUTO_SAVE_INTERVAL_MS — 30000 (30 seconds)
  - WRITE_DB_RETENTION_HOURS — 24 (prune after upload + 24h)
  
  **Feature Flags:**
  - FEATURE_L1_CACHE_ENABLED — Enable L1 cache (default: true)
  - FEATURE_WRITE_BUFFER_ENABLED — Enable write buffer (default: true)
  - FEATURE_WORKERS_ENABLED — Enable background workers (default: true)
  - FEATURE_VALIDATION_ENABLED — Enable data validation (default: true)
  
  **Validation Function:**
  - validateEngineDbConfig() — Ensures storage directories exist, creates if missing
  
  **Export:**
  - EngineDbConfig object — Read-only config with all settings
  - validateEngineDbConfig() function — Environment setup helper

Linked Routers:
- src/services/ROUTER.md — Engine DB services consuming this config.
- src/workers/ROUTER.md — Engine DB workers using intervals and thresholds from this config.
