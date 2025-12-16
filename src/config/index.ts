/**
 * Configuration Module — Centralized, validated application configuration
 *
 * This module provides:
 * - Type-safe configuration loading from environment variables
 * - Zod-based validation with clear error messages
 * - Domain-specific configuration getters
 * - Cached configuration for performance
 *
 * Usage:
 * ```typescript
 * import {
 *   loadAppConfig,
 *   getConfig,
 *   getDatabaseConfig,
 *   getDiscordConfig,
 *   isProduction,
 *   isRender,
 * } from '../config/index.js';
 *
 * // Load all configuration at startup
 * const config = loadAppConfig();
 *
 * // Or access specific domains
 * const dbConfig = getDatabaseConfig();
 * const discordConfig = getDiscordConfig();
 *
 * // Environment checks
 * if (isProduction()) {
 *   // Production-specific logic
 * }
 * ```
 *
 * @module config
 */

// ============================================================================
// Main Configuration Loader
// ============================================================================

export {
  clearConfigCache,
  getConfig,
  getDatabaseConfig,
  getDiscordConfig,
  getEnvironmentConfig,
  getFeatureFlags,
  getHmacSecret,
  getHomesteadConfig,
  getMonitoringConfig,
  getNotificationConfig,
  getSecurityConfig,
  getServiceName,
  getWorkerConfig,
  isConfigLoaded,
  isProduction,
  isRender,
  isTest,
  loadAppConfig,
} from './loader.js';

// ============================================================================
// Configuration Types
// ============================================================================

export type {
  AppConfig,
  ConfigValidationError,
  DatabaseConfig,
  DiscordConfig,
  EnvironmentConfig,
  FeatureFlags,
  HomesteadConfig,
  MonitoringConfig,
  NotificationConfig,
  SecurityConfig,
  WorkerConfig,
} from './loader.js';

// ============================================================================
// Validation Schemas (for advanced use cases)
// ============================================================================

export {
  AppConfigSchema,
  DatabaseConfigSchema,
  DiscordConfigSchema,
  EnvironmentConfigSchema,
  FeatureFlagsSchema,
  HomesteadConfigSchema,
  MonitoringConfigSchema,
  NotificationConfigSchema,
  SecurityConfigSchema,
  WorkerConfigSchema,
  zodErrorToValidationErrors,
} from './schema.js';

// ============================================================================
// Domain-Specific Configs (Re-exports for convenience)
// ============================================================================

// Database pool configuration
export { getCurrentServiceName, POOL_CONFIGS } from './database-pool-config.js';
export type { PoolConfig } from './database-pool-config.js';

// Engine DB configuration
export {
  BUFFER_FLUSH_WORKER_INTERVAL_MS,
  CACHE_REFRESH_WORKER_INTERVAL_MS,
  ENGINE_READ_DB_PATH,
  ENGINE_WRITE_DB_PATH,
  IS_PRODUCTION,
  IS_TEST,
  L1_CACHE_INIT_TIMEOUT_MS,
  L1_CACHE_MAX_SIZE_MB,
  L1_CACHE_REFRESH_INTERVAL_MS,
  STORAGE_BASE_DIR,
  VALIDATION_BATCH_SIZE,
  VALIDATION_MIN_QUALITY_SCORE,
  VALIDATION_SAMPLING_RATE,
  WORKER_STARTUP_STAGGER_MS,
  WRITE_BUFFER_FLUSH_INTERVAL_MS,
  WRITE_BUFFER_MAX_QUEUE_SIZE,
  WRITE_BUFFER_REJECT_THRESHOLD,
  WRITE_BUFFER_WARN_THRESHOLD,
  WRITE_DB_VALIDATOR_INTERVAL_MS,
} from './engine-db-config.js';
