/**
 * Configuration Validation Schemas — Zod-based configuration validation
 *
 * Central schema definitions for all application configuration.
 * Provides type-safe environment variable parsing with validation.
 *
 * @module config/schema
 */

import { z } from 'zod/v4';

// ============================================================================
// Helper Schemas
// ============================================================================

/**
 * Boolean coercion from environment strings
 * Accepts: "1", "true", "yes", "on" → true
 *          "0", "false", "no", "off" → false
 */
const envBooleanSchema = z.preprocess((val) => {
  if (typeof val === 'boolean') return val;
  if (typeof val !== 'string') return undefined;
  const normalized = val.toLowerCase().trim();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}, z.boolean());

/**
 * Number coercion from environment strings with bounds
 */
const envNumberSchema = (options?: { min?: number; max?: number; default?: number }) =>
  z.preprocess((val) => {
    if (typeof val === 'number') return val;
    if (typeof val !== 'string') return options?.default;
    const num = Number(val);
    return Number.isFinite(num) ? num : options?.default;
  }, z.number().min(options?.min ?? -Infinity).max(options?.max ?? Infinity));

/**
 * Comma-separated list coercion
 */
const envListSchema = z.preprocess((val) => {
  if (Array.isArray(val)) return val;
  if (typeof val !== 'string') return [];
  return val
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}, z.array(z.string()));

/**
 * URL validation with protocol check
 */
const postgresUrlSchema = z
  .string()
  .regex(/^postgres(?:ql)?:\/\/.+/, 'Must be a valid PostgreSQL connection URL');

// ============================================================================
// Domain Configuration Schemas
// ============================================================================

/**
 * Database configuration schema
 */
export const DatabaseConfigSchema = z.object({
  /** Primary production database URL (CLOUD-PROD-MASTER) */
  prodUrl: postgresUrlSchema.optional(),
  /** External Render database URL */
  renderExternalUrl: postgresUrlSchema.optional(),
  /** Internal Render database URL */
  renderInternalUrl: postgresUrlSchema.optional(),
  /** On-premise development database (ONPREMISE-DEV-PRIMARY) */
  onPremiseDevUrl: postgresUrlSchema.optional(),
  /** Experimental database (ONPREMISE-DEV-EXPERIMENT) */
  onPremiseExperimentUrl: postgresUrlSchema.optional(),
  /** Connection mode: auto, external, or internal */
  connectionMode: z.enum(['auto', 'external', 'internal']).default('auto'),
  /** Heartbeat interval in milliseconds */
  heartbeatIntervalMs: envNumberSchema({ min: 1000, default: 30000 }),
  /** Skip initial connection check */
  skipInitialConnect: envBooleanSchema.default(false),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

/**
 * Discord bot configuration schema
 */
export const DiscordConfigSchema = z.object({
  /** Security bot token */
  securityBotToken: z.string().min(50).optional(),
  /** Pokemon bot token */
  pokemonBotToken: z.string().min(50).optional(),
  /** Legacy bot token alias */
  botToken: z.string().min(50).optional(),
  /** Enable security bot */
  enableSecurityBot: envBooleanSchema.default(false),
  /** Enable pokemon bot */
  enablePokemonBot: envBooleanSchema.default(false),
  /** Alert webhook URL */
  alertWebhookUrl: z.string().url().optional().or(z.literal('')),
  /** Alert channel ID */
  alertChannelId: z.string().regex(/^\d+$/).optional().or(z.literal('')),
  /** Alert user ID */
  alertUserId: z.string().regex(/^\d+$/).optional().or(z.literal('')),
  /** Admin user IDs */
  adminUserIds: envListSchema.default([]),
});

export type DiscordConfig = z.infer<typeof DiscordConfigSchema>;

/**
 * Worker configuration schema
 */
export const WorkerConfigSchema = z.object({
  /** Enable continuous sweep */
  enableContinuousSweep: envBooleanSchema.default(true),
  /** Enable database auto-sync */
  enableDbAutoSync: envBooleanSchema.default(true),
  /** Cache worker interval in milliseconds */
  cacheWorkerIntervalMs: envNumberSchema({ min: 0, default: 0 }),
  /** Cache worker jitter in milliseconds */
  cacheWorkerJitterMs: envNumberSchema({ min: 0, default: 30000 }),
  /** Data pipeline interval in milliseconds */
  dataPipelineIntervalMs: envNumberSchema({ min: 0, default: 0 }),
  /** Data pipeline jitter in milliseconds */
  dataPipelineJitterMs: envNumberSchema({ min: 0, default: 60000 }),
  /** Run data pipeline on boot */
  dataPipelineRunOnBoot: envBooleanSchema.default(true),
  /** Backfill concurrency */
  backfillConcurrency: envNumberSchema({ min: 1, default: 8 }),
  /** Backfill delay in milliseconds */
  backfillDelayMs: envNumberSchema({ min: 0, default: 20 }),
  /** Cache TTL in hours */
  cacheTtlHours: envNumberSchema({ min: 1, default: 24 }),
});

export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;

/**
 * Monitoring configuration schema
 */
export const MonitoringConfigSchema = z.object({
  /** Log level */
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  /** Log format */
  logFormat: z.enum(['json', 'pretty', 'both']).default('both'),
  /** Service name */
  serviceName: z.string().min(1).default('infinity-gauntlet'),
  /** Health check port */
  healthCheckPort: envNumberSchema({ min: 1, max: 65535, default: 3000 }),
  /** Health check host */
  healthCheckHost: z.string().default('0.0.0.0'),
  /** Health check timeout in milliseconds */
  healthCheckTimeoutMs: envNumberSchema({ min: 1000, default: 5000 }),
  /** Resource monitor interval in milliseconds */
  resourceMonitorIntervalMs: envNumberSchema({ min: 60000, default: 43200000 }),
  /** OPS report interval in seconds */
  opsReportIntervalSeconds: envNumberSchema({ min: 0, default: 55 }),
});

export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;

/**
 * Homestead (private channel) configuration schema
 */
export const HomesteadConfigSchema = z.object({
  /** Category name for homestead channels */
  categoryName: z.string().min(1).default('Homesteads'),
  /** Cleanup threshold in days */
  cleanupDays: envNumberSchema({ min: 1, default: 90 }),
  /** Check interval in milliseconds */
  checkIntervalMs: envNumberSchema({ min: 100, default: 1000 }),
  /** Minimum recheck interval in milliseconds */
  minRecheckMs: envNumberSchema({ min: 60000, default: 3600000 }),
  /** HMAC key for verification */
  hmacKey: z.string().min(16).default('dev-hmac-key-change-in-production'),
});

export type HomesteadConfig = z.infer<typeof HomesteadConfigSchema>;

/**
 * Security configuration schema
 */
export const SecurityConfigSchema = z.object({
  /** Archive HMAC secret */
  archiveHmacSecret: z.string().min(16).default('default-dev-secret-CHANGE-IN-PRODUCTION'),
  /** Audit HMAC secret */
  auditHmacSecret: z.string().min(16).default('dev-audit-secret-change-in-production'),
  /** Retention HMAC secret */
  retentionHmacSecret: z.string().min(16).default('retention-policy-service-secret'),
  /** Security HMAC secret */
  securityHmacSecret: z.string().min(16).optional(),
  /** HMAC secret (generic fallback) */
  hmacSecret: z.string().min(16).optional(),
  /** DoS protection: max sweep candidates */
  maxSweepCandidates: envNumberSchema({ min: 1, default: 100 }),
  /** DoS protection: sweep anomaly threshold */
  sweepAnomalyThreshold: envNumberSchema({ min: 1, default: 500 }),
  /** DoS protection: sweep anomaly critical threshold */
  sweepAnomalyCritical: envNumberSchema({ min: 1, default: 1000 }),
  /** Retention default days */
  retentionDefaultDays: envNumberSchema({ min: 1, default: 90 }),
  /** Retention max batch size */
  retentionMaxBatchSize: envNumberSchema({ min: 1, default: 1000 }),
  /** Retention batch delay in milliseconds */
  retentionBatchDelayMs: envNumberSchema({ min: 0, default: 100 }),
});

export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

/**
 * Feature flags schema
 */
export const FeatureFlagsSchema = z.object({
  /** Enable Dex v2 */
  dexV2Enabled: envBooleanSchema.default(false),
  /** Enforce all standards */
  standardEnforceAll: envBooleanSchema.default(false),
  /** Role permission audit enabled */
  rolePermissionsAudit: envBooleanSchema.default(true),
  /** Role permission remediation enabled */
  rolePermissionsRemediate: envBooleanSchema.default(true),
  /** CLI debug mode */
  cliDebugMode: envBooleanSchema.default(false),
});

export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

/**
 * Notification configuration schema
 */
export const NotificationConfigSchema = z.object({
  /** Restart DM recipient */
  restartDmRecipient: z.string().default('DripTVDD'),
  /** Summary report recipient */
  summaryReportRecipient: z.string().default('DripTVDD'),
  /** Summary report hour (0-23) */
  summaryReportHour: envNumberSchema({ min: 0, max: 23, default: 3 }),
  /** Summary report minute (0-59) */
  summaryReportMinute: envNumberSchema({ min: 0, max: 59, default: 0 }),
  /** Drip alert recipient */
  dripAlertRecipient: z.string().default('DripTVDD'),
  /** Drip alert hour (0-23) */
  dripAlertHour: envNumberSchema({ min: 0, max: 23, default: 2 }),
  /** Drip alert minute (0-59) */
  dripAlertMinute: envNumberSchema({ min: 0, max: 59, default: 0 }),
  /** Drip alert timezone */
  dripAlertTimezone: z.string().default('America/New_York'),
  /** Lifecycle webhook URL */
  lifecycleWebhookUrl: z.string().url().optional().or(z.literal('')),
});

export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;

/**
 * Environment detection schema
 */
export const EnvironmentConfigSchema = z.object({
  /** Node environment */
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  /** Running on Render */
  isRender: envBooleanSchema.default(false),
  /** Render service name */
  renderServiceName: z.string().optional(),
  /** Render service type */
  renderServiceType: z.string().optional(),
  /** Render region */
  renderRegion: z.string().optional(),
  /** Store path override */
  storePath: z.string().optional(),
});

export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;

// ============================================================================
// Combined Application Configuration
// ============================================================================

/**
 * Complete application configuration schema
 */
export const AppConfigSchema = z.object({
  environment: EnvironmentConfigSchema,
  database: DatabaseConfigSchema,
  discord: DiscordConfigSchema,
  worker: WorkerConfigSchema,
  monitoring: MonitoringConfigSchema,
  homestead: HomesteadConfigSchema,
  security: SecurityConfigSchema,
  features: FeatureFlagsSchema,
  notification: NotificationConfigSchema,
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

// ============================================================================
// Validation Error Types
// ============================================================================

/**
 * Configuration validation error details
 */
export interface ConfigValidationError {
  path: string;
  message: string;
  received: unknown;
}

/**
 * Configuration validation result
 */
export type ConfigValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ConfigValidationError[] };

/**
 * Convert Zod error to validation errors
 */
export function zodErrorToValidationErrors(error: z.ZodError): ConfigValidationError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    received: 'input' in issue ? issue.input : undefined,
  }));
}
