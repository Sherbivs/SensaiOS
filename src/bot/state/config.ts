/**
 * Security Bot State Configuration
 * Centralized configuration for state persistence module
 * @module bot/state/config
 * 
 * DATABASE-FIRST ARCHITECTURE (2025-12-27):
 * File path constants removed. All persistence uses PostgreSQL via Prisma.
 * See individual modules for database key constants.
 */

import { getLogger } from '../../shared/logging/index.js';

const logger = getLogger();

// ─────────────────────────────────────────────────────────────────────────────
// Environment Detection
// ─────────────────────────────────────────────────────────────────────────────

export const IS_PRODUCTION = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
export const IS_TEST = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

// ─────────────────────────────────────────────────────────────────────────────
// Storage Paths (DEPRECATED - Database-First Architecture)
// These are kept for backwards compatibility but NO LONGER USED for persistence.
// All state now stored in PostgreSQL via CacheEntry table.
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Use database keys instead - see persistence.ts */
export const STORE_BASE = process.env.RENDER ? '/Store' : './Store';

/** @deprecated Use CURRENT_STATE_KEY in persistence.ts */
export const STATE_DIR = `${STORE_BASE}/security-bot-state`;

/** @deprecated Use ARCHIVE_KEY in roleArchive.ts */
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

/** @deprecated Use ARCHIVE_KEY in roleArchive.ts */
export const ARCHIVE_FILE = `${ARCHIVE_DIR}/role-changes.json`;

/** @deprecated Use BACKUP_KEY in roleArchive.ts */
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
// Export Summary (DEPRECATED paths kept for backwards compatibility)
// ─────────────────────────────────────────────────────────────────────────────

export const stateConfig = {
  isProduction: IS_PRODUCTION,
  isTest: IS_TEST,
  /** @deprecated */ storeBase: STORE_BASE,
  /** @deprecated */ stateDir: STATE_DIR,
  /** @deprecated */ archiveDir: ARCHIVE_DIR,
  /** @deprecated */ archiveFile: ARCHIVE_FILE,
  /** @deprecated */ backupFile: BACKUP_FILE,
  maxArchiveSize: MAX_ARCHIVE_SIZE,
  hmacAlgorithm: HMAC_ALGORITHM,
  autoSaveIntervalMs: AUTO_SAVE_INTERVAL_MS,
  snapshotRetentionDays: SNAPSHOT_RETENTION_DAYS,
  maxTimelineEvents: MAX_TIMELINE_EVENTS,
} as const;

export default stateConfig;
