/**
 * Database Replication Monitoring & Alerting
 * 
 * Provides observability into the DEV → Prod → Local replication cascade
 * with metrics tracking, alerting thresholds, and health checks.
 */

import type { PrismaClient } from '@prisma/client';
import { getVersion, compareVersions, type Version } from './version.js';

// Temporary logger until integration
const logger = {
  info: (msg: string, ...args: unknown[]) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[ERROR] ${msg}`, ...args),
};

// ============================================================================
// Type Definitions
// ============================================================================

export type SyncStatus = 'IN_SYNC' | 'LAGGING' | 'BLOCKED' | 'ERROR' | 'UNKNOWN';
export type IntegrityStatus = 'PASS' | 'FAIL' | 'UNKNOWN';
export type AlertSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface CascadeMetrics {
  /** When sync last completed */
  lastSyncAt: Date | null;
  /** Duration of last sync in milliseconds */
  lastSyncDuration: number | null;
  /** Number of migrations target is behind source */
  versionLag: number;
  /** Current sync status */
  syncStatus: SyncStatus;
  /** Last error message if any */
  lastError: string | null;
}

export interface ReplicationMetrics {
  /** DEV → Prod cascade metrics */
  devToProd: CascadeMetrics;
  /** Prod → Local cascade metrics */
  prodToLocal: CascadeMetrics;
  /** Version fingerprints for all environments */
  versionFingerprints: {
    dev: string;
    prod: string;
    local: string;
  };
  /** Schema integrity status */
  integrityStatus: {
    devProdSchema: IntegrityStatus;
    prodLocalSchema: IntegrityStatus;
    lastCheckedAt: Date | null;
  };
  /** When metrics were captured */
  capturedAt: Date;
}

export interface Alert {
  severity: AlertSeverity;
  title: string;
  message: string;
  source: 'DEV_TO_PROD' | 'PROD_TO_LOCAL';
  timestamp: Date;
  /** Whether to escalate immediately */
  escalate: boolean;
}

// ============================================================================
// Metrics Calculation
// ============================================================================

/**
 * Get comprehensive replication metrics for all cascades.
 * 
 * Queries version info from all three environments and db_sync_state
 * to calculate lag, sync status, and integrity status.
 */
export async function getReplicationMetrics(
  devPrisma: PrismaClient,
  prodPrisma: PrismaClient,
  localPrisma: PrismaClient | null = null
): Promise<ReplicationMetrics> {
  try {
    // Get versions from all environments
    const devVersion = await getVersion(devPrisma, 'DEV');
    const prodVersion = await getVersion(prodPrisma, 'PROD');
    const localVersion = localPrisma ? await getVersion(localPrisma, 'LOCAL') : null;

    // Get sync state from db_sync_state table
    const devToProdState = await getSyncState(prodPrisma, 'DEV', 'PROD');
    const prodToLocalState = localPrisma ? await getSyncState(localPrisma, 'PROD', 'LOCAL') : null;

    // Calculate DEV → Prod metrics
    const devToProdLag = devVersion.migrationCount - prodVersion.migrationCount;
    const devToProdStatus = calculateSyncStatus(devVersion, prodVersion, devToProdState);

    // Calculate Prod → Local metrics
    const prodToLocalLag = localVersion ? prodVersion.migrationCount - localVersion.migrationCount : 0;
    const prodToLocalStatus = localVersion
      ? calculateSyncStatus(prodVersion, localVersion, prodToLocalState)
      : 'UNKNOWN';

    return {
      devToProd: {
        lastSyncAt: devToProdState?.lastSyncAt || null,
        lastSyncDuration: devToProdState?.lastDuration || null,
        versionLag: devToProdLag,
        syncStatus: devToProdStatus,
        lastError: devToProdState?.lastError || null,
      },
      prodToLocal: {
        lastSyncAt: prodToLocalState?.lastSyncAt || null,
        lastSyncDuration: prodToLocalState?.lastDuration || null,
        versionLag: prodToLocalLag,
        syncStatus: prodToLocalStatus,
        lastError: prodToLocalState?.lastError || null,
      },
      versionFingerprints: {
        dev: devVersion.fingerprint.slice(0, 16),
        prod: prodVersion.fingerprint.slice(0, 16),
        local: localVersion?.fingerprint.slice(0, 16) || 'N/A',
      },
      integrityStatus: {
        devProdSchema: parseIntegrityStatus(devToProdState?.lastIntegrityCheck),
        prodLocalSchema: parseIntegrityStatus(prodToLocalState?.lastIntegrityCheck),
        lastCheckedAt: devToProdState?.updatedAt || null,
      },
      capturedAt: new Date(),
    };
  } catch (error) {
    logger.error('Failed to get replication metrics:', error);
    throw error;
  }
}

/**
 * Get sync state from db_sync_state table.
 * 
 * Returns null if no sync has occurred yet (commented out until schema migration).
 */
async function getSyncState(
  prismaClient: PrismaClient,
  source: string,
  target: string
): Promise<any | null> {
  try {
    // Note: Commented out until db_sync_state schema is migrated
    /*
    const syncState = await prismaClient.dbSyncState.findUnique({
      where: {
        source_target: { source, target },
      },
    });
    return syncState;
    */
    logger.warn(`getSyncState for ${source}→${target} skipped (schema not yet migrated)`);
    return null;
  } catch (error) {
    logger.error(`Failed to get sync state for ${source}→${target}:`, error);
    return null;
  }
}

/**
 * Calculate sync status based on version comparison and sync state.
 */
function calculateSyncStatus(
  sourceVersion: Version,
  targetVersion: Version,
  syncState: any | null
): SyncStatus {
  // Check for explicit error state
  if (syncState?.status === 'ERROR' || syncState?.status === 'FAILED') {
    return 'ERROR';
  }

  // Check for explicit blocked state
  if (syncState?.status === 'BLOCKED' || syncState?.status === 'WAITING_FOR_MASTER') {
    return 'BLOCKED';
  }

  // Calculate lag
  const lag = sourceVersion.migrationCount - targetVersion.migrationCount;

  // Exact match
  if (sourceVersion.fingerprint === targetVersion.fingerprint) {
    return 'IN_SYNC';
  }

  // Lagging but not critically (lag 1-5)
  if (lag > 0 && lag <= 5) {
    return 'LAGGING';
  }

  // Critically behind (lag >5)
  if (lag > 5) {
    return 'ERROR';
  }

  // Negative lag (target ahead) - should never happen
  if (lag < 0) {
    return 'ERROR';
  }

  // Fingerprints differ but migration count same - could be divergence
  // Return LAGGING if no explicit state, let alert system catch divergence
  return 'LAGGING';
}

/**
 * Parse integrity status from lastIntegrityCheck JSON field.
 */
function parseIntegrityStatus(lastIntegrityCheck: any): IntegrityStatus {
  if (!lastIntegrityCheck) {
    return 'UNKNOWN';
  }

  if (typeof lastIntegrityCheck === 'object' && lastIntegrityCheck.passed === true) {
    return 'PASS';
  }

  if (typeof lastIntegrityCheck === 'object' && lastIntegrityCheck.passed === false) {
    return 'FAIL';
  }

  return 'UNKNOWN';
}

// ============================================================================
// Alerting System
// ============================================================================

/**
 * Check metrics against thresholds and generate alerts.
 * 
 * Thresholds:
 * - WARNING: lag > 5 migrations, sync duration > 10min, reversion detected
 * - ERROR: lag > 10 migrations, sync failure, integrity failure
 * - CRITICAL: diverged fingerprints requiring manual resolution
 */
export async function checkAlertThresholds(metrics: ReplicationMetrics): Promise<Alert[]> {
  const alerts: Alert[] = [];

  // Check DEV → Prod cascade
  alerts.push(...checkCascadeAlerts(metrics.devToProd, 'DEV_TO_PROD', metrics.versionFingerprints));

  // Check Prod → Local cascade
  alerts.push(...checkCascadeAlerts(metrics.prodToLocal, 'PROD_TO_LOCAL', metrics.versionFingerprints));

  // Check integrity status
  if (metrics.integrityStatus.devProdSchema === 'FAIL') {
    alerts.push({
      severity: 'ERROR',
      title: 'Schema Integrity Failed: DEV → Prod',
      message: 'Schema differences detected between DEV and Prod. Check logs for details.',
      source: 'DEV_TO_PROD',
      timestamp: new Date(),
      escalate: true,
    });
  }

  if (metrics.integrityStatus.prodLocalSchema === 'FAIL') {
    alerts.push({
      severity: 'ERROR',
      title: 'Schema Integrity Failed: Prod → Local',
      message: 'Schema differences detected between Prod and Local. Check logs for details.',
      source: 'PROD_TO_LOCAL',
      timestamp: new Date(),
      escalate: true,
    });
  }

  return alerts;
}

/**
 * Check individual cascade for alert conditions.
 */
function checkCascadeAlerts(
  cascade: CascadeMetrics,
  source: 'DEV_TO_PROD' | 'PROD_TO_LOCAL',
  fingerprints: { dev: string; prod: string; local: string }
): Alert[] {
  const alerts: Alert[] = [];
  const envLabel = source === 'DEV_TO_PROD' ? 'DEV → Prod' : 'Prod → Local';

  // CRITICAL: Diverged fingerprints (different versions with same count)
  if (source === 'DEV_TO_PROD' && fingerprints.dev !== fingerprints.prod && cascade.versionLag === 0) {
    alerts.push({
      severity: 'CRITICAL',
      title: `Database Divergence: ${envLabel}`,
      message: `DEV and Prod have diverged! Manual resolution required.\nDEV: ${fingerprints.dev}\nProd: ${fingerprints.prod}`,
      source,
      timestamp: new Date(),
      escalate: true,
    });
  }

  // ERROR: Critical lag (>10 migrations)
  if (cascade.versionLag > 10) {
    alerts.push({
      severity: 'ERROR',
      title: `Critical Version Lag: ${envLabel}`,
      message: `Target is ${cascade.versionLag} migrations behind source. Manual sync required.`,
      source,
      timestamp: new Date(),
      escalate: true,
    });
  }

  // ERROR: Sync failure
  if (cascade.syncStatus === 'ERROR' && cascade.lastError) {
    alerts.push({
      severity: 'ERROR',
      title: `Sync Failed: ${envLabel}`,
      message: `Last sync failed: ${cascade.lastError}`,
      source,
      timestamp: new Date(),
      escalate: true,
    });
  }

  // WARNING: Moderate lag (5-10 migrations)
  if (cascade.versionLag > 5 && cascade.versionLag <= 10) {
    alerts.push({
      severity: 'WARNING',
      title: `Version Lag: ${envLabel}`,
      message: `Target is ${cascade.versionLag} migrations behind source.`,
      source,
      timestamp: new Date(),
      escalate: false,
    });
  }

  // WARNING: Sync blocked (reversion detected)
  if (cascade.syncStatus === 'BLOCKED') {
    alerts.push({
      severity: 'WARNING',
      title: `Sync Blocked: ${envLabel}`,
      message: 'Sync is blocked, likely due to reversion detection. Check sync state.',
      source,
      timestamp: new Date(),
      escalate: false,
    });
  }

  // WARNING: Slow sync (>10 minutes)
  if (cascade.lastSyncDuration && cascade.lastSyncDuration > 600000) {
    alerts.push({
      severity: 'WARNING',
      title: `Slow Sync: ${envLabel}`,
      message: `Last sync took ${Math.round(cascade.lastSyncDuration / 1000)}s. Investigate performance.`,
      source,
      timestamp: new Date(),
      escalate: false,
    });
  }

  return alerts;
}

/**
 * Send alert to operators.
 * 
 * Integrates with alerting system (Discord DM, PagerDuty, etc.)
 */
export async function sendAlert(alert: Alert): Promise<void> {
  const severityIcon = {
    INFO: 'ℹ️',
    WARNING: '⚠️',
    ERROR: '❌',
    CRITICAL: '🚨',
  };

  const icon = severityIcon[alert.severity];
  const escalateLabel = alert.escalate ? ' [ESCALATED]' : '';

  logger.warn(`ALERT ${icon} [${alert.severity}${escalateLabel}]: ${alert.title}`);
  logger.warn(`Source: ${alert.source}`);
  logger.warn(`Message: ${alert.message}`);

  // TODO: Integrate with Discord DM system (src/bot/dripAlerts.js)
  // TODO: Integrate with PagerDuty or other external alerting
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format metrics for console/Discord display.
 */
export function formatMetrics(metrics: ReplicationMetrics): string {
  const lines: string[] = [];

  lines.push('📊 Database Replication Metrics');
  lines.push('━'.repeat(50));
  lines.push('');

  // DEV → Prod cascade
  lines.push('🔄 DEV → Prod:');
  lines.push(`  Status: ${formatSyncStatus(metrics.devToProd.syncStatus)}`);
  lines.push(`  Lag: ${metrics.devToProd.versionLag} migrations`);
  lines.push(`  Last Sync: ${formatDate(metrics.devToProd.lastSyncAt)}`);
  if (metrics.devToProd.lastSyncDuration) {
    lines.push(`  Duration: ${Math.round(metrics.devToProd.lastSyncDuration / 1000)}s`);
  }
  if (metrics.devToProd.lastError) {
    lines.push(`  Error: ${metrics.devToProd.lastError.slice(0, 100)}`);
  }
  lines.push('');

  // Prod → Local cascade
  lines.push('🔄 Prod → Local:');
  lines.push(`  Status: ${formatSyncStatus(metrics.prodToLocal.syncStatus)}`);
  lines.push(`  Lag: ${metrics.prodToLocal.versionLag} migrations`);
  lines.push(`  Last Sync: ${formatDate(metrics.prodToLocal.lastSyncAt)}`);
  if (metrics.prodToLocal.lastSyncDuration) {
    lines.push(`  Duration: ${Math.round(metrics.prodToLocal.lastSyncDuration / 1000)}s`);
  }
  lines.push('');

  // Version fingerprints
  lines.push('🔑 Version Fingerprints:');
  lines.push(`  DEV:   ${metrics.versionFingerprints.dev}`);
  lines.push(`  Prod:  ${metrics.versionFingerprints.prod}`);
  lines.push(`  Local: ${metrics.versionFingerprints.local}`);
  lines.push('');

  // Integrity status
  lines.push('✅ Integrity Status:');
  lines.push(`  DEV → Prod: ${formatIntegrityStatus(metrics.integrityStatus.devProdSchema)}`);
  lines.push(`  Prod → Local: ${formatIntegrityStatus(metrics.integrityStatus.prodLocalSchema)}`);
  lines.push(`  Last Checked: ${formatDate(metrics.integrityStatus.lastCheckedAt)}`);
  lines.push('');

  lines.push(`📅 Captured: ${formatDate(metrics.capturedAt)}`);

  return lines.join('\n');
}

function formatSyncStatus(status: SyncStatus): string {
  const icons: Record<SyncStatus, string> = {
    IN_SYNC: '✅ IN SYNC',
    LAGGING: '⏳ LAGGING',
    BLOCKED: '🚫 BLOCKED',
    ERROR: '❌ ERROR',
    UNKNOWN: '❓ UNKNOWN',
  };
  return icons[status];
}

function formatIntegrityStatus(status: IntegrityStatus): string {
  const icons: Record<IntegrityStatus, string> = {
    PASS: '✅ PASS',
    FAIL: '❌ FAIL',
    UNKNOWN: '❓ UNKNOWN',
  };
  return icons[status];
}

function formatDate(date: Date | null): string {
  if (!date) return 'Never';
  return date.toISOString();
}
