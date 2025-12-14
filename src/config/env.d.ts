export const ENABLE_CONTINUOUS_SWEEP: boolean;
export const ENABLE_SECURITY_BOT: boolean;
export const ENABLE_DB_AUTO_SYNC: boolean;
export const CACHE_WORKER_INTERVAL_MS: number;
export const CACHE_WORKER_INTERVAL_JITTER_MS: number;
export const DATA_PIPELINE_INTERVAL_MS: number;
export const DATA_PIPELINE_INTERVAL_JITTER_MS: number;
export const DATA_PIPELINE_RUN_ON_BOOT: boolean;

// Phase 2.5C: Centralized environment variables (added 2024-12)
export const LOG_LEVEL: string;
export const LOG_FORMAT: string;
export const SERVICE_NAME: string;
export const HEALTH_CHECK_PORT: number;
export const HEALTH_CHECK_HOST: string;
export const HEALTH_CHECK_TIMEOUT_MS: number;
export const RESOURCE_MONITOR_INTERVAL_MS: number;
export const HOMESTEAD_CATEGORY_NAME: string;
export const HOMESTEAD_CLEANUP_DAYS: number;
export const HOMESTEAD_CHECK_INTERVAL_MS: number;
export const HOMESTEAD_MIN_RECHECK_MS: number;
export const HOMESTEAD_HMAC_KEY: string;
export const ADMIN_USER_IDS: string[];
