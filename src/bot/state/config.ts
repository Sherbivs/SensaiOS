/**
 * Security Bot State Configuration
 * Centralized configuration for state persistence module
 * @module bot/state/config
 */

import { getLogger } from '../../shared/logging/index.js';

const logger = getLogger();

// ─────────────────────────────────────────────────────────────────────────────
// Environment Detection
// ─────────────────────────────────────────────────────────────────────────────

export const IS_PRODUCTION = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
export const IS_TEST = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

// ─────────────────────────────────────────────────────────────────────────────
// Storage Paths
// ─────────────────────────────────────────────────────────────────────────────

/** Base storage directory (Render uses /Store, local uses ./Store) */
export const STORE_BASE = process.env.RENDER ? '/Store' : './Store';

/** Security bot state directory */
export const STATE_DIR = `${STORE_BASE}/security-bot-state`;

/** Role archive directory */
export const ARCHIVE_DIR = `${STATE_DIR}/role-archive`;

// ─────────────────────────────────────────────────────────────────────────────
// Security Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEV_FALLBACK_SECRET = 'default-dev-secret-DO-NOT-USE-IN-PRODUCTION';

/**
 * Get the HMAC secret for role archive integrity verification.
 * 
 * **PRODUCTION:** Requires ARCHIVE_HMAC_SECRET env var (fail-fast if missing)
 * **DEVELOPMENT:** Uses fallback secret with warning
 * **TEST:** Uses fallback secret silently
 * 
 * @throws Error if ARCHIVE_HMAC_SECRET not set in production
 */
export function getHmacSecret(): string {
  const envSecret = process.env.ARCHIVE_HMAC_SECRET;
  
  if (envSecret) {
    return envSecret;
  }
  
  if (IS_PRODUCTION) {
    // FAIL-FAST in production - do not allow hardcoded secrets
    const error = new Error(
      '[RoleArchive] FATAL: ARCHIVE_HMAC_SECRET environment variable is required in production. ' +
      'Role archive integrity verification cannot proceed without a secure HMAC key.'
    );
    logger.error('security-state', 'init', error.message);
    throw error;
  }
  
  if (!IS_TEST) {
    // Warn in development (but allow)
    logger.warn('security-state', 'warning', '[RoleArchive] ⚠️ Using development fallback HMAC secret. Set ARCHIVE_HMAC_SECRET for production.');
  }
  
  return DEV_FALLBACK_SECRET;
}

/** HMAC algorithm for integrity verification */
export const HMAC_ALGORITHM = 'sha256';

// ─────────────────────────────────────────────────────────────────────────────
// Archive Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum number of role change events to keep in archive */
export const MAX_ARCHIVE_SIZE = 500;

/** Archive file path */
export const ARCHIVE_FILE = `${ARCHIVE_DIR}/role-changes.json`;

/** Backup file path */
export const BACKUP_FILE = `${ARCHIVE_DIR}/role-changes.backup.json`;

// ─────────────────────────────────────────────────────────────────────────────
// State Persistence Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Auto-save interval in milliseconds (5 minutes) */
export const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000;

/** Snapshot retention period in days */
export const SNAPSHOT_RETENTION_DAYS = 7;

/** Maximum timeline events to keep */
export const MAX_TIMELINE_EVENTS = 100;

// ─────────────────────────────────────────────────────────────────────────────
// Export Summary
// ─────────────────────────────────────────────────────────────────────────────

export const stateConfig = {
  isProduction: IS_PRODUCTION,
  isTest: IS_TEST,
  storeBase: STORE_BASE,
  stateDir: STATE_DIR,
  archiveDir: ARCHIVE_DIR,
  archiveFile: ARCHIVE_FILE,
  backupFile: BACKUP_FILE,
  maxArchiveSize: MAX_ARCHIVE_SIZE,
  hmacAlgorithm: HMAC_ALGORITHM,
  autoSaveIntervalMs: AUTO_SAVE_INTERVAL_MS,
  snapshotRetentionDays: SNAPSHOT_RETENTION_DAYS,
  maxTimelineEvents: MAX_TIMELINE_EVENTS,
} as const;

export default stateConfig;
