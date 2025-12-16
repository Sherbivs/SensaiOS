/**
 * Configuration Loader — Type-safe environment configuration
 *
 * Provides centralized, validated configuration loading from environment variables.
 * Uses Zod schemas for validation and type inference.
 *
 * Usage:
 * ```typescript
 * import { loadAppConfig, getConfig } from '../config/loader.js';
 *
 * // Load and validate all config at startup
 * const config = loadAppConfig();
 *
 * // Or access cached config (after initial load)
 * const { database, discord, monitoring } = getConfig();
 * ```
 *
 * @module config/loader
 */

import { getErrorMessage } from '../shared/utils/error-utils.js';
import {
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
  type AppConfig,
  type ConfigValidationError,
  type DatabaseConfig,
  type DiscordConfig,
  type EnvironmentConfig,
  type FeatureFlags,
  type HomesteadConfig,
  type MonitoringConfig,
  type NotificationConfig,
  type SecurityConfig,
  type WorkerConfig,
} from './schema.js';

// ============================================================================
// Cached Configuration
// ============================================================================

let cachedConfig: AppConfig | null = null;

// ============================================================================
// Environment Variable Mapping
// ============================================================================

/**
 * Build environment configuration from process.env
 */
function buildEnvironmentConfig(): Record<string, unknown> {
  const env = process.env;
  return {
    nodeEnv: env.NODE_ENV?.toLowerCase() || 'development',
    isRender: Boolean(env.RENDER),
    renderServiceName: env.RENDER_SERVICE_NAME,
    renderServiceType: env.RENDER_SERVICE_TYPE,
    renderRegion: env.RENDER_REGION,
    storePath: env.STORE_PATH,
  };
}

/**
 * Build database configuration from process.env
 */
function buildDatabaseConfig(): Record<string, unknown> {
  const env = process.env;
  return {
    prodUrl: env.PROD_DATABASE_URL?.trim(),
    renderExternalUrl: env.RENDER_DB_EXTERNAL_URL?.trim(),
    renderInternalUrl: env.RENDER_DB_INTERNAL_URL?.trim(),
    onPremiseDevUrl: env.DATABASE_ONPREMISE_DEV_PRIMARY?.trim(),
    onPremiseExperimentUrl: env.DATABASE_ONPREMISE_DEV_EXPERIMENT?.trim(),
    connectionMode: env.DATABASE_CONNECTION_MODE?.toLowerCase(),
    heartbeatIntervalMs: env.PRISMA_HEARTBEAT_INTERVAL_MS,
    skipInitialConnect: env.PRISMA_SKIP_INITIAL_CONNECT,
  };
}

/**
 * Build Discord configuration from process.env
 */
function buildDiscordConfig(): Record<string, unknown> {
  const env = process.env;
  return {
    securityBotToken: env.SECURITY_BOT_TOKEN?.trim() || env.BOT_TOKEN?.trim(),
    pokemonBotToken: env.POKEMON_BOT_TOKEN?.trim() || env.POKEMON_TOKEN?.trim(),
    botToken: env.BOT_TOKEN?.trim(),
    enableSecurityBot: env.ENABLE_SECURITY_BOT,
    enablePokemonBot: env.ENABLE_POKEMON_BOT,
    alertWebhookUrl: env.ALERT_WEBHOOK_URL?.trim(),
    alertChannelId: env.ALERT_CHANNEL_ID?.trim(),
    alertUserId: env.ALERT_USER_ID?.trim(),
    adminUserIds: env.ADMIN_USER_IDS,
  };
}

/**
 * Build worker configuration from process.env
 */
function buildWorkerConfig(): Record<string, unknown> {
  const env = process.env;
  return {
    enableContinuousSweep: env.ENABLE_CONTINUOUS_SWEEP,
    enableDbAutoSync: env.ENABLE_DB_AUTO_SYNC,
    cacheWorkerIntervalMs: env.CACHE_WORKER_INTERVAL_MS,
    cacheWorkerJitterMs: env.CACHE_WORKER_INTERVAL_JITTER_MS,
    dataPipelineIntervalMs: env.DATA_PIPELINE_INTERVAL_MS,
    dataPipelineJitterMs: env.DATA_PIPELINE_INTERVAL_JITTER_MS,
    dataPipelineRunOnBoot: env.DATA_PIPELINE_RUN_ON_BOOT,
    backfillConcurrency: env.BACKFILL_CONCURRENCY,
    backfillDelayMs: env.BACKFILL_DELAY_MS,
    cacheTtlHours: env.CACHE_TTL_HOURS,
  };
}

/**
 * Build monitoring configuration from process.env
 */
function buildMonitoringConfig(): Record<string, unknown> {
  const env = process.env;
  return {
    logLevel: env.LOG_LEVEL?.toLowerCase(),
    logFormat: env.LOG_FORMAT?.toLowerCase(),
    serviceName: env.SERVICE_NAME?.trim() || env.RENDER_SERVICE_NAME?.trim(),
    healthCheckPort: env.HEALTH_CHECK_PORT,
    healthCheckHost: env.HEALTH_CHECK_HOST?.trim(),
    healthCheckTimeoutMs: env.HEALTH_CHECK_TIMEOUT_MS,
    resourceMonitorIntervalMs: env.RESOURCE_MONITOR_INTERVAL_MS,
    opsReportIntervalSeconds: env.OPS_REPORT_INTERVAL_SECONDS,
  };
}

/**
 * Build homestead configuration from process.env
 */
function buildHomesteadConfig(): Record<string, unknown> {
  const env = process.env;
  return {
    categoryName: env.HOMESTEAD_CATEGORY_NAME?.trim(),
    cleanupDays: env.HOMESTEAD_CLEANUP_DAYS,
    checkIntervalMs: env.HOMESTEAD_CHECK_INTERVAL_MS,
    minRecheckMs: env.HOMESTEAD_MIN_RECHECK_MS,
    hmacKey: env.HOMESTEAD_HMAC_KEY?.trim(),
  };
}

/**
 * Build security configuration from process.env
 */
function buildSecurityConfig(): Record<string, unknown> {
  const env = process.env;
  return {
    archiveHmacSecret: env.ARCHIVE_HMAC_SECRET?.trim(),
    auditHmacSecret: env.AUDIT_HMAC_SECRET?.trim(),
    retentionHmacSecret: env.RETENTION_HMAC_SECRET?.trim(),
    securityHmacSecret: env.SECURITY_HMAC_SECRET?.trim(),
    hmacSecret: env.HMAC_SECRET?.trim(),
    maxSweepCandidates: env.MAX_SWEEP_CANDIDATES,
    sweepAnomalyThreshold: env.SWEEP_ANOMALY_THRESHOLD,
    sweepAnomalyCritical: env.SWEEP_ANOMALY_CRITICAL,
    retentionDefaultDays: env.RETENTION_DEFAULT_DAYS,
    retentionMaxBatchSize: env.RETENTION_MAX_BATCH_SIZE,
    retentionBatchDelayMs: env.RETENTION_BATCH_DELAY_MS,
  };
}

/**
 * Build feature flags from process.env
 */
function buildFeatureFlags(): Record<string, unknown> {
  const env = process.env;
  const argv = Array.isArray(process.argv) ? process.argv : [];
  return {
    dexV2Enabled: env.DEX_V2_ENABLED,
    standardEnforceAll: env.STANDARD_ENFORCE_ALL,
    rolePermissionsAudit: true, // Forced on
    rolePermissionsRemediate: true, // Forced on
    cliDebugMode: env.CLI_DEBUG_MODE || argv.includes('--debug-cli') || argv.includes('--cli-debug'),
  };
}

/**
 * Build notification configuration from process.env
 */
function buildNotificationConfig(): Record<string, unknown> {
  const env = process.env;
  return {
    restartDmRecipient: env.RESTART_DM_RECIPIENT?.trim(),
    summaryReportRecipient: env.SUMMARY_REPORT_RECIPIENT?.trim(),
    summaryReportHour: env.SUMMARY_REPORT_HOUR,
    summaryReportMinute: env.SUMMARY_REPORT_MINUTE,
    dripAlertRecipient: env.DRIP_ALERT_RECIPIENT?.trim(),
    dripAlertHour: env.DRIP_ALERT_HOUR,
    dripAlertMinute: env.DRIP_ALERT_MINUTE,
    dripAlertTimezone: env.DRIP_ALERT_TIMEZONE?.trim(),
    lifecycleWebhookUrl: env.LIFECYCLE_WEBHOOK_URL?.trim(),
  };
}

// ============================================================================
// Configuration Loading Functions
// ============================================================================

import type { z } from 'zod/v4';

/**
 * Load a specific config domain with validation
 */
function loadDomainConfig<T>(
  schema: z.ZodType<T>,
  data: Record<string, unknown>,
  domainName: string
): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  const errors = result.error?.issues || [];
  const errorMessages = errors.map(
    (e) => `${domainName}.${String(e.path.join('.'))}: ${e.message}`
  );
  throw new Error(`Configuration validation failed:\n${errorMessages.join('\n')}`);
}

/**
 * Load and validate the complete application configuration
 *
 * @param options.force - Force reload even if cached
 * @param options.throwOnError - Throw on validation errors (default: true in production)
 * @returns Validated application configuration
 */
export function loadAppConfig(options?: {
  force?: boolean;
  throwOnError?: boolean;
}): AppConfig {
  const { force = false, throwOnError = process.env.NODE_ENV === 'production' } = options ?? {};

  if (cachedConfig && !force) {
    return cachedConfig;
  }

  const rawConfig = {
    environment: buildEnvironmentConfig(),
    database: buildDatabaseConfig(),
    discord: buildDiscordConfig(),
    worker: buildWorkerConfig(),
    monitoring: buildMonitoringConfig(),
    homestead: buildHomesteadConfig(),
    security: buildSecurityConfig(),
    features: buildFeatureFlags(),
    notification: buildNotificationConfig(),
  };

  const result = AppConfigSchema.safeParse(rawConfig);

  if (result.success && result.data) {
    cachedConfig = result.data;
    return cachedConfig;
  }

  const errors = zodErrorToValidationErrors(result.error!);
  const errorMessage = formatValidationErrors(errors);

  if (throwOnError) {
    throw new Error(`Configuration validation failed:\n${errorMessage}`);
  }

  // In non-production, log warnings but return partial config with defaults
  console.warn(`[config] Validation warnings:\n${errorMessage}`);

  // Fall back to individual domain parsing with defaults
  cachedConfig = {
    environment: loadDomainConfig(EnvironmentConfigSchema, rawConfig.environment, 'environment'),
    database: loadDomainConfig(DatabaseConfigSchema, rawConfig.database, 'database'),
    discord: loadDomainConfig(DiscordConfigSchema, rawConfig.discord, 'discord'),
    worker: loadDomainConfig(WorkerConfigSchema, rawConfig.worker, 'worker'),
    monitoring: loadDomainConfig(MonitoringConfigSchema, rawConfig.monitoring, 'monitoring'),
    homestead: loadDomainConfig(HomesteadConfigSchema, rawConfig.homestead, 'homestead'),
    security: loadDomainConfig(SecurityConfigSchema, rawConfig.security, 'security'),
    features: loadDomainConfig(FeatureFlagsSchema, rawConfig.features, 'features'),
    notification: loadDomainConfig(NotificationConfigSchema, rawConfig.notification, 'notification'),
  };

  return cachedConfig;
}

/**
 * Get the cached configuration (must call loadAppConfig first)
 *
 * @throws Error if configuration has not been loaded
 */
export function getConfig(): AppConfig {
  if (!cachedConfig) {
    return loadAppConfig();
  }
  return cachedConfig;
}

/**
 * Clear the cached configuration (useful for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Check if configuration has been loaded
 */
export function isConfigLoaded(): boolean {
  return cachedConfig !== null;
}

// ============================================================================
// Individual Domain Getters (Convenience)
// ============================================================================

/**
 * Get environment configuration
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  return getConfig().environment;
}

/**
 * Get database configuration
 */
export function getDatabaseConfig(): DatabaseConfig {
  return getConfig().database;
}

/**
 * Get Discord configuration
 */
export function getDiscordConfig(): DiscordConfig {
  return getConfig().discord;
}

/**
 * Get worker configuration
 */
export function getWorkerConfig(): WorkerConfig {
  return getConfig().worker;
}

/**
 * Get monitoring configuration
 */
export function getMonitoringConfig(): MonitoringConfig {
  return getConfig().monitoring;
}

/**
 * Get homestead configuration
 */
export function getHomesteadConfig(): HomesteadConfig {
  return getConfig().homestead;
}

/**
 * Get security configuration
 */
export function getSecurityConfig(): SecurityConfig {
  return getConfig().security;
}

/**
 * Get feature flags
 */
export function getFeatureFlags(): FeatureFlags {
  return getConfig().features;
}

/**
 * Get notification configuration
 */
export function getNotificationConfig(): NotificationConfig {
  return getConfig().notification;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format validation errors for logging
 */
function formatValidationErrors(errors: ConfigValidationError[]): string {
  return errors
    .map((e) => `  - ${e.path}: ${e.message} (received: ${JSON.stringify(e.received)})`)
    .join('\n');
}

/**
 * Check if running in production environment
 */
export function isProduction(): boolean {
  return getEnvironmentConfig().nodeEnv === 'production';
}

/**
 * Check if running in test environment
 */
export function isTest(): boolean {
  return getEnvironmentConfig().nodeEnv === 'test';
}

/**
 * Check if running on Render
 */
export function isRender(): boolean {
  return getEnvironmentConfig().isRender;
}

/**
 * Get the effective service name
 */
export function getServiceName(): string {
  const config = getConfig();
  return config.monitoring.serviceName || config.environment.renderServiceName || 'infinity-gauntlet';
}

/**
 * Get HMAC secret with fallback chain
 * Priority: domain-specific → generic → error
 */
export function getHmacSecret(domain: 'archive' | 'audit' | 'retention' | 'security' | 'generic'): string {
  const security = getSecurityConfig();
  switch (domain) {
    case 'archive':
      return security.archiveHmacSecret;
    case 'audit':
      return security.auditHmacSecret;
    case 'retention':
      return security.retentionHmacSecret;
    case 'security':
      return security.securityHmacSecret ?? security.hmacSecret ?? security.archiveHmacSecret;
    case 'generic':
      return security.hmacSecret ?? security.archiveHmacSecret;
    default:
      throw new Error(`Unknown HMAC domain: ${domain}`);
  }
}

// ============================================================================
// Type Re-exports
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
};
