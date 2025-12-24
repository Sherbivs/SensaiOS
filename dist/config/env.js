/**
 * Environment Configuration
 *
 * Centralizes all environment variable parsing and configuration.
 * Load order: .env file → environment variables → defaults
 *
 * @module config/env
 */
import * as dotenv from "dotenv";
import { existsSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
// ============================================================================
// Dotenv Loading
// ============================================================================
const envPath = process.env.IG_ENV_FILE ?? ".env";
// Only load from external file if specified and exists
// Production skips repo .env unless IG_ALLOW_REPO_ENV=1
const skipRepoEnv = !process.env.IG_ALLOW_REPO_ENV && !process.env.IG_ENV_FILE;
if (!skipRepoEnv && existsSync(envPath)) {
    dotenv.config({ path: pathResolve(envPath) });
}
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Alias environment variables for compatibility.
 * Maps new canonical names to legacy names if the new name isn't set.
 */
function aliasEnv(newName, oldName) {
    if (!process.env[newName] && process.env[oldName]) {
        process.env[newName] = process.env[oldName];
    }
}
// Apply aliases for database URLs
aliasEnv("PROD_DATABASE_URL", "DATABASE_URL");
aliasEnv("DATABASE_URL", "PROD_DATABASE_URL");
/**
 * Check if an environment variable is "truthy" (present and non-empty)
 */
export function envTruthy(key) {
    const val = process.env[key];
    return val !== undefined && val !== "" && val !== "0" && val.toLowerCase() !== "false";
}
/**
 * Convert environment variable to boolean
 */
export function toBool(val, defaultValue = false) {
    if (val === undefined || val === "")
        return defaultValue;
    return val === "1" || val.toLowerCase() === "true" || val.toLowerCase() === "yes";
}
/**
 * Convert environment variable to number
 */
export function toNumber(val, defaultValue) {
    if (val === undefined || val === "")
        return defaultValue;
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : defaultValue;
}
/**
 * Convert comma-separated string to array
 */
export function toList(val) {
    if (!val)
        return [];
    return val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}
/**
 * Parse interval string (e.g., "30s", "5m", "1h") to seconds
 */
export function resolveIntervalSeconds(val, defaultSeconds) {
    if (!val)
        return defaultSeconds;
    const match = val.match(/^(\d+(?:\.\d+)?)\s*(s|m|h)?$/i);
    if (!match)
        return defaultSeconds;
    const num = parseFloat(match[1]);
    const unit = (match[2] ?? "s").toLowerCase();
    switch (unit) {
        case "h":
            return num * 3600;
        case "m":
            return num * 60;
        default:
            return num;
    }
}
// ============================================================================
// Feature Flags
// ============================================================================
export const CLI_DEBUG_MODE = toBool(process.env.CLI_DEBUG_MODE);
export const DEX_V2_ENABLED = toBool(process.env.DEX_V2_ENABLED, true);
export const DEX_V2_FALLBACK_V1 = toBool(process.env.DEX_V2_FALLBACK_V1, true);
export const ENABLE_METRIC_LOGGING = toBool(process.env.ENABLE_METRIC_LOGGING, false);
export const ENABLE_DM_CACHE_LOGGING = toBool(process.env.ENABLE_DM_CACHE_LOGGING, false);
export const ENABLE_SECURITY_BOT = toBool(process.env.ENABLE_SECURITY_BOT, true);
export const ENABLE_HEARTBEAT = toBool(process.env.ENABLE_HEARTBEAT, true);
export const ENABLE_DB_CLI_TIMESTAMPS = toBool(process.env.ENABLE_DB_CLI_TIMESTAMPS, true);
// ============================================================================
// Alert Configuration
// ============================================================================
export const ALERT_ROLE_ID = process.env.ALERT_ROLE_ID ?? "";
export const ALERT_CHANNEL_ID = process.env.ALERT_CHANNEL_ID ?? "";
export const DRIP_ALERT_CHANNEL_ID = process.env.DRIP_ALERT_CHANNEL_ID ?? ALERT_CHANNEL_ID;
export const DRIP_USER_ID = process.env.DRIP_USER_ID ?? "563220840708177927";
export const ADMIN_USER_IDS = toList(process.env.ADMIN_USER_IDS);
export const OPS_ALLOWED_USER_IDS = toList(process.env.OPS_ALLOWED_USER_IDS);
// ============================================================================
// Role Governance Configuration
// ============================================================================
export const ROLE_PERMISSIONS_ADMIN = toList(process.env.ROLE_PERMISSIONS_ADMIN);
export const ROLE_PERMISSIONS_MODERATOR = toList(process.env.ROLE_PERMISSIONS_MODERATOR);
export const ROLE_PERMISSIONS_MEMBER = toList(process.env.ROLE_PERMISSIONS_MEMBER);
export const ROLE_PERMISSIONS_BOT = toList(process.env.ROLE_PERMISSIONS_BOT);
// ============================================================================
// Timing/Interval Configuration
// ============================================================================
export const CACHE_MAINTENANCE_INTERVAL_MS = toNumber(process.env.CACHE_MAINTENANCE_INTERVAL_MS, 10 * 60 * 1000);
export const LOG_BUFFER_INTERVAL_MS = toNumber(process.env.LOG_BUFFER_INTERVAL_MS, 10 * 1000);
export const LOG_BUFFER_ENABLED = toBool(process.env.LOG_BUFFER_ENABLED, true);
export const LOG_BUFFER_BYPASS_CRITICAL = toBool(process.env.LOG_BUFFER_BYPASS_CRITICAL, true);
// ============================================================================
// Heap Snapshot Pruner Configuration (Phase 1, Project 1)
// @see docs/projects/metrics-expansion-bible.md § Project 1
// ============================================================================
/** Enable/disable heap snapshot pruner worker (default: true) */
export const HEAP_SNAPSHOT_ENABLED = toBool(process.env.HEAP_SNAPSHOT_ENABLED, true);
/** Maximum number of heap snapshots to keep (default: 3) */
export const HEAP_SNAPSHOT_MAX_COUNT = toNumber(process.env.HEAP_SNAPSHOT_MAX_COUNT, 3);
/** Maximum age of heap snapshots in days before deletion (default: 7) */
export const HEAP_SNAPSHOT_MAX_AGE_DAYS = toNumber(process.env.HEAP_SNAPSHOT_MAX_AGE_DAYS, 7);
/** Interval between prune operations in milliseconds (default: 24 hours) */
export const HEAP_SNAPSHOT_PRUNE_INTERVAL_MS = toNumber(process.env.HEAP_SNAPSHOT_PRUNE_INTERVAL_MS, 24 * 60 * 60 * 1000);
/** Run prune immediately on startup (default: true) */
export const HEAP_SNAPSHOT_RUN_ON_STARTUP = toBool(process.env.HEAP_SNAPSHOT_RUN_ON_STARTUP, true);
// ============================================================================
// Alert Dispatcher Configuration (Phase 1, Project 2)
// @see docs/projects/metrics-expansion-bible.md § Project 2
// ============================================================================
/** Enable/disable alert dispatcher (default: true) */
export const ALERT_DISPATCHER_ENABLED = toBool(process.env.ALERT_DISPATCHER_ENABLED, true);
/** Route alerts to test channel instead of production (default: false) */
export const ALERT_TEST_MODE = toBool(process.env.ALERT_TEST_MODE, false);
/** Discord channel ID for test alerts */
export const ALERT_TEST_CHANNEL_ID = process.env.ALERT_TEST_CHANNEL_ID ?? "";
/** Cooldown between same-level alerts in milliseconds (default: 1 hour) */
export const ALERT_COOLDOWN_MS = toNumber(process.env.ALERT_COOLDOWN_MS, 60 * 60 * 1000);
/** Admin user ID for DM alerts (default: DRIPTVDD) */
export const ALERT_ADMIN_USER_ID = process.env.ALERT_ADMIN_USER_ID ?? DRIP_USER_ID;
/** Directory for persisting critical alerts (default: /Store/alerts) */
export const ALERT_PERSIST_DIR = process.env.ALERT_PERSIST_DIR ??
    (process.env.RENDER ? '/Store/alerts' : './Store/alerts');
/** Startup grace period before alerts fire (prevents deploy false positives) */
export const STARTUP_GRACE_PERIOD_MS = toNumber(process.env.STARTUP_GRACE_PERIOD_MS, 60 * 1000);
// ============================================================================
// Disk Alerting Configuration (Phase 1, Project 3)
// @see docs/projects/metrics-expansion-bible.md § Project 3
// ============================================================================
/** Disk usage threshold for WARNING alerts (default: 75%) */
export const DISK_WARNING_THRESHOLD = parseFloat(process.env.DISK_WARNING_THRESHOLD ?? '0.75');
/** Disk usage threshold for CRITICAL alerts (default: 85%) */
export const DISK_CRITICAL_THRESHOLD = parseFloat(process.env.DISK_CRITICAL_THRESHOLD ?? '0.85');
/** Disk usage threshold for EMERGENCY alerts + auto-remediation (default: 95%) */
export const DISK_EMERGENCY_THRESHOLD = parseFloat(process.env.DISK_EMERGENCY_THRESHOLD ?? '0.95');
// NOTE: Auto-sync disabled by default - the script was deprecated/deleted in unified architecture
export const ENABLE_DB_AUTO_SYNC = toBool(process.env.ENABLE_DB_AUTO_SYNC, false);
export const ENABLE_CONTINUOUS_SWEEP = toBool(process.env.ENABLE_CONTINUOUS_SWEEP, true);
export const ENABLE_POKEMON_BOT = toBool(process.env.ENABLE_POKEMON_BOT, false);
export const POKEMON_BOT_AUTO_DISABLED = !process.env.ENABLE_POKEMON_BOT && !ENABLE_POKEMON_BOT;
export const PRISMA_HEARTBEAT_INTERVAL_MS = toNumber(process.env.PRISMA_HEARTBEAT_INTERVAL_MS, 30 * 1000);
export const PRISMA_CONNECT_MAX_RETRIES = toNumber(process.env.PRISMA_CONNECT_MAX_RETRIES, 5);
export const PRISMA_CONNECT_RETRY_DELAY_MS = toNumber(process.env.PRISMA_CONNECT_RETRY_DELAY_MS, 1000);
export const PRISMA_CONNECT_MAX_DELAY_MS = toNumber(process.env.PRISMA_CONNECT_MAX_DELAY_MS, 30000);
export const SECURITY_BOT_SWEEP_INTERVAL_SECONDS = resolveIntervalSeconds(process.env.SECURITY_BOT_SWEEP_INTERVAL, 300);
export const SECURITY_BOT_AUTO_SAVE_INTERVAL_SECONDS = resolveIntervalSeconds(process.env.SECURITY_BOT_AUTO_SAVE_INTERVAL, 300);
export const EVENT_BUS_BATCH_INTERVAL_MS = toNumber(process.env.EVENT_BUS_BATCH_INTERVAL_MS, 100);
export const EVENT_BUS_BATCH_SIZE = toNumber(process.env.EVENT_BUS_BATCH_SIZE, 50);
// ============================================================================
// Database URLs
// ============================================================================
export const PROD_DATABASE_URL = process.env.PROD_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
export const DATABASE_URL = process.env.DATABASE_URL ?? process.env.PROD_DATABASE_URL ?? "";
export const RENDER_DB_EXTERNAL_URL = process.env.RENDER_DB_EXTERNAL_URL ?? "";
export const RENDER_DB_INTERNAL_URL = process.env.RENDER_DB_INTERNAL_URL ?? "";
export const DATABASE_ONPREMISE_DEV_PRIMARY = process.env.DATABASE_ONPREMISE_DEV_PRIMARY ?? "";
export const DATABASE_ONPREMISE_DEV_EXPERIMENT = process.env.DATABASE_ONPREMISE_DEV_EXPERIMENT ?? "";
// ============================================================================
// API Keys and Tokens
// ============================================================================
export const BOT_TOKEN = process.env.BOT_TOKEN ?? process.env.DISCORD_BOT_TOKEN ?? "";
export const DISCORD_BOT_TOKEN = BOT_TOKEN;
export const POKEMON_BOT_TOKEN = process.env.POKEMON_BOT_TOKEN ?? "";
export const RENDER_API_KEY = process.env.RENDER_API_KEY ?? "";
export const REDIS_URL = process.env.REDIS_URL ?? "";
// ============================================================================
// Discord Configuration
// ============================================================================
export const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? "";
export const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID ?? "";
export const TEST_GUILD_ID = process.env.TEST_GUILD_ID ?? DISCORD_GUILD_ID;
// ============================================================================
// Render Configuration
// ============================================================================
export const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID ?? "";
export const RENDER_DEPLOY_HOOK = process.env.RENDER_DEPLOY_HOOK ?? "";
export const IS_RENDER = envTruthy("RENDER");
export const RENDER = IS_RENDER;
// ============================================================================
// Node Environment
// ============================================================================
export const NODE_ENV = process.env.NODE_ENV ?? "development";
export const IS_PRODUCTION = NODE_ENV === "production";
export const IS_DEVELOPMENT = NODE_ENV === "development";
export const IS_TEST = NODE_ENV === "test";
// ============================================================================
// Logging Configuration
// ============================================================================
export const LOG_LEVEL = process.env.LOG_LEVEL ?? (IS_PRODUCTION ? "info" : "debug");
export const LOG_FORMAT = process.env.LOG_FORMAT ?? "pretty";
export const SERVICE_NAME = process.env.SERVICE_NAME ?? process.env.RENDER_SERVICE_NAME ?? "infinity-gauntlet";
// ============================================================================
// Health Check Configuration
// ============================================================================
export const HEALTH_CHECK_PORT = toNumber(process.env.HEALTH_CHECK_PORT, 3000);
export const HEALTH_CHECK_HOST = process.env.HEALTH_CHECK_HOST ?? "0.0.0.0";
export const HEALTH_CHECK_TIMEOUT_MS = toNumber(process.env.HEALTH_CHECK_TIMEOUT_MS, 5000);
// ============================================================================
// Resource Monitoring Configuration
// ============================================================================
export const RESOURCE_MONITOR_INTERVAL_MS = toNumber(process.env.RESOURCE_MONITOR_INTERVAL_MS, 12 * 60 * 60 * 1000); // 12 hours
// ============================================================================
// Homestead Configuration
// ============================================================================
export const HOMESTEAD_CATEGORY_NAME = process.env.HOMESTEAD_CATEGORY_NAME ?? "Homesteads";
export const HOMESTEAD_CLEANUP_DAYS = toNumber(process.env.HOMESTEAD_CLEANUP_DAYS, 90);
export const HOMESTEAD_CHECK_INTERVAL_MS = toNumber(process.env.HOMESTEAD_CHECK_INTERVAL_MS, 1000);
export const HOMESTEAD_MIN_RECHECK_MS = toNumber(process.env.HOMESTEAD_MIN_RECHECK_MS, 60 * 60 * 1000); // 1 hour
export const HOMESTEAD_HMAC_KEY = process.env.HOMESTEAD_HMAC_KEY ?? "dev-hmac-key-change-in-production";
// ============================================================================
// Cache Configuration
// ============================================================================
export const CACHE_TTL_SECONDS = toNumber(process.env.CACHE_TTL_SECONDS, 3600);
export const CACHE_MAX_SIZE = toNumber(process.env.CACHE_MAX_SIZE, 1000);
// ============================================================================
// Game Configuration
// ============================================================================
export const MAX_PARTY_SIZE = toNumber(process.env.MAX_PARTY_SIZE, 6);
export const MAX_PC_BOXES = toNumber(process.env.MAX_PC_BOXES, 30);
export const MAX_POKEMON_PER_BOX = toNumber(process.env.MAX_POKEMON_PER_BOX, 30);
// ============================================================================
// Role Governance Configuration (extended)
// ============================================================================
export const ROLE_PERMISSIONS_AUDIT = true;
export const ROLE_PERMISSIONS_REMEDIATE = true;
export const ROLE_PERMISSION_POLICY = (process.env.ROLE_PERMISSION_POLICY ?? "standard").toLowerCase();
export const ROLE_PERMISSION_SNAPSHOT_UPDATE = toBool(process.env.ROLE_PERMISSION_SNAPSHOT_UPDATE, true);
export const DEFAULT_ROLE_NAME = "Trainer";
export const ROLE_NAME = process.env.ROLE_NAME ?? DEFAULT_ROLE_NAME;
export const ROLE_ID = process.env.ROLE_ID ?? "";
// ============================================================================
// Alert/Reporting Configuration (extended)
// ============================================================================
export const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL ?? "";
export const ALERT_USER_ID = process.env.ALERT_USER_ID ?? "";
export const SECURITY_BOT_TOKEN = process.env.SECURITY_BOT_TOKEN ?? process.env.BOT_TOKEN ?? "";
export const RESTART_DM_RECIPIENT = process.env.RESTART_DM_RECIPIENT ?? "DripTVDD";
export const SUMMARY_REPORT_RECIPIENT = process.env.SUMMARY_REPORT_RECIPIENT ?? RESTART_DM_RECIPIENT;
export const SUMMARY_REPORT_HOUR = Math.max(0, Math.min(23, toNumber(process.env.SUMMARY_REPORT_HOUR, 3)));
export const SUMMARY_REPORT_MINUTE = Math.max(0, Math.min(59, toNumber(process.env.SUMMARY_REPORT_MINUTE, 0)));
export const DRIP_ALERT_RECIPIENT = process.env.DRIP_ALERT_RECIPIENT ?? "DripTVDD";
export const DRIP_ALERT_HOUR = Math.max(0, Math.min(23, toNumber(process.env.DRIP_ALERT_HOUR, 2)));
export const DRIP_ALERT_MINUTE = Math.max(0, Math.min(59, toNumber(process.env.DRIP_ALERT_MINUTE, 0)));
export const DRIP_ALERT_TIMEZONE = process.env.DRIP_ALERT_TIMEZONE ?? "America/New_York";
// ============================================================================
// Backfill/Automation Configuration
// ============================================================================
export const BACKFILL_CONCURRENCY = Math.max(1, toNumber(process.env.BACKFILL_CONCURRENCY, 8));
export const BACKFILL_DELAY_MS = Math.max(0, toNumber(process.env.BACKFILL_DELAY_MS, 20));
export const BACKFILL_INTERVAL_SECONDS = resolveIntervalSeconds(process.env.BACKFILL_INTERVAL_SECONDS, 62);
export const BACKFILL_INTERVAL_MIN = BACKFILL_INTERVAL_SECONDS / 60;
export const ROLE_REMEDIATION_INTERVAL_SECONDS = resolveIntervalSeconds(process.env.ROLE_REMEDIATION_INTERVAL_SECONDS, 50);
export const ROLE_REMEDIATION_INTERVAL_MIN = ROLE_REMEDIATION_INTERVAL_SECONDS / 60;
export const CACHE_TTL_HOURS = Math.max(1, toNumber(process.env.CACHE_TTL_HOURS, 24));
export const OPS_REPORT_INTERVAL_SECONDS = resolveIntervalSeconds(process.env.OPS_REPORT_INTERVAL_SECONDS, 55);
export const OPS_REPORT_INTERVAL_MIN = OPS_REPORT_INTERVAL_SECONDS / 60;
export const CACHE_WORKER_INTERVAL_MS = Math.max(0, toNumber(process.env.CACHE_WORKER_INTERVAL_MS, 0));
export const CACHE_WORKER_INTERVAL_JITTER_MS = Math.max(0, toNumber(process.env.CACHE_WORKER_INTERVAL_JITTER_MS, 30000));
export const DATA_PIPELINE_INTERVAL_MS = Math.max(0, toNumber(process.env.DATA_PIPELINE_INTERVAL_MS, 0));
export const DATA_PIPELINE_INTERVAL_JITTER_MS = Math.max(0, toNumber(process.env.DATA_PIPELINE_INTERVAL_JITTER_MS, 60000));
export const DATA_PIPELINE_RUN_ON_BOOT = toBool(process.env.DATA_PIPELINE_RUN_ON_BOOT, true);
// ============================================================================
// Standards Enforcement
// ============================================================================
export const STANDARD_ENFORCE_ALL = toBool(process.env.STANDARD_ENFORCE_ALL);
export const UNLISTED_PERMISSIONS = toList(process.env.UNLISTED_PERMISSIONS).length > 0
    ? toList(process.env.UNLISTED_PERMISSIONS)
    : ["ViewChannel", "SendMessages", "ReadMessageHistory", "AddReactions", "UseExternalEmojis", "EmbedLinks", "AttachFiles"];
export const STANDARD_EXEMPT_ROLES = new Set(toList(process.env.STANDARD_EXEMPT_ROLES));
export const STANDARD_ALL_PERMS_ROLES = new Set(toList(process.env.STANDARD_ALL_PERMS_ROLES));
// ============================================================================
// DoS Protection Configuration
// ============================================================================
export const MAX_SWEEP_CANDIDATES = toNumber(process.env.MAX_SWEEP_CANDIDATES, 100);
export const SWEEP_ANOMALY_THRESHOLD = toNumber(process.env.SWEEP_ANOMALY_THRESHOLD, 500);
export const SWEEP_ANOMALY_CRITICAL = toNumber(process.env.SWEEP_ANOMALY_CRITICAL, 1000);
// ============================================================================
// Default Export
// ============================================================================
const config = {
    // Feature flags
    CLI_DEBUG_MODE,
    DEX_V2_ENABLED,
    DEX_V2_FALLBACK_V1,
    ENABLE_METRIC_LOGGING,
    ENABLE_DM_CACHE_LOGGING,
    ENABLE_SECURITY_BOT,
    ENABLE_HEARTBEAT,
    ENABLE_DB_CLI_TIMESTAMPS,
    // Alert configuration
    ALERT_ROLE_ID,
    ALERT_CHANNEL_ID,
    DRIP_ALERT_CHANNEL_ID,
    DRIP_USER_ID,
    ADMIN_USER_IDS,
    OPS_ALLOWED_USER_IDS,
    // Role governance
    ROLE_PERMISSIONS_ADMIN,
    ROLE_PERMISSIONS_MODERATOR,
    ROLE_PERMISSIONS_MEMBER,
    ROLE_PERMISSIONS_BOT,
    // Timing
    CACHE_MAINTENANCE_INTERVAL_MS,
    LOG_BUFFER_INTERVAL_MS,
    LOG_BUFFER_ENABLED,
    LOG_BUFFER_BYPASS_CRITICAL,
    PRISMA_HEARTBEAT_INTERVAL_MS,
    PRISMA_CONNECT_MAX_RETRIES,
    PRISMA_CONNECT_RETRY_DELAY_MS,
    PRISMA_CONNECT_MAX_DELAY_MS,
    SECURITY_BOT_SWEEP_INTERVAL_SECONDS,
    SECURITY_BOT_AUTO_SAVE_INTERVAL_SECONDS,
    EVENT_BUS_BATCH_INTERVAL_MS,
    EVENT_BUS_BATCH_SIZE,
    // Database
    PROD_DATABASE_URL,
    DATABASE_URL,
    RENDER_DB_EXTERNAL_URL,
    RENDER_DB_INTERNAL_URL,
    DATABASE_ONPREMISE_DEV_PRIMARY,
    DATABASE_ONPREMISE_DEV_EXPERIMENT,
    // API keys
    BOT_TOKEN,
    DISCORD_BOT_TOKEN,
    POKEMON_BOT_TOKEN,
    RENDER_API_KEY,
    REDIS_URL,
    // Discord
    DISCORD_CLIENT_ID,
    DISCORD_GUILD_ID,
    TEST_GUILD_ID,
    // Render
    RENDER_SERVICE_ID,
    RENDER_DEPLOY_HOOK,
    IS_RENDER,
    RENDER,
    // Node
    NODE_ENV,
    IS_PRODUCTION,
    IS_DEVELOPMENT,
    IS_TEST,
    // Logging
    LOG_LEVEL,
    LOG_FORMAT,
    // Cache
    CACHE_TTL_SECONDS,
    CACHE_MAX_SIZE,
    // Game
    MAX_PARTY_SIZE,
    MAX_PC_BOXES,
    MAX_POKEMON_PER_BOX,
};
export default config;
