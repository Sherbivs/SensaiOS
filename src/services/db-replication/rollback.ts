import { log } from '../../shared/log.js';
/**
 * Database Sync Rollback & Error Handling
 * 
 * Handles sync failures, preserves state, and alerts operators.
 */

import type { Pool } from 'pg';

import type { SyncResult } from './sync.js';
import { upsertDbSyncState } from '../../shared/models/db-version-queries-pg.js';

// Temporary logger until integration
const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => log.info(`[INFO] ${msg}`, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log.warn(`[WARN] ${msg}`, meta),
  error: (msg: string, err?: unknown, meta?: Record<string, unknown>) => log.error(`[ERROR] ${msg}`, err, meta),
};

/**
 * Handle sync failure by logging errors and blocking downstream syncs.
 * 
 * Actions:
 * 1. Log error details to logger
 * 2. Send alert to operators (severity: ERROR, escalate: true)
 * 3. Update db_sync_state with FAILED status
 * 4. Block downstream syncs until manual resolution
 */
export async function handleSyncFailure(
  pool: Pool,
  source: string,
  target: string,
  result: SyncResult
): Promise<void> {
  const errorSummary = result.errors.map(e => `[${e.stage}] ${e.message}`).join('\n');

  logger.error(`Sync FAILED: ${source} → ${target}`, {
    stage: result.stage,
    errors: result.errors.length,
    duration: result.duration,
  });

  logger.error(`Error details:\n${errorSummary}`);

  // Send alert (would integrate with alerting system)
  await sendAlert({
    severity: 'ERROR',
    escalate: true,
    title: `Database Sync Failed: ${source} → ${target}`,
    message: `Stage: ${result.stage}\nDuration: ${result.duration}ms\n\n${errorSummary}`,
    timestamp: new Date(),
  });

  // Update db_sync_state to block downstream syncs
  try {
    await upsertDbSyncState({
      source,
      target,
      status: 'FAILED',
      lastSyncAt: result.startedAt,
      lastError: JSON.stringify(result.errors),
    }, pool);
  } catch (error) {
    logger.error('Failed to update sync state:', error);
  }
}

/**
 * Send alert to operators.
 * 
 * Integrates with alerting system (Discord DM, PagerDuty, etc.)
 */
async function sendAlert(alert: {
  severity: 'WARNING' | 'ERROR' | 'CRITICAL';
  escalate: boolean;
  title: string;
  message: string;
  timestamp: Date;
}): Promise<void> {
  // Simplified - would integrate with alerting system
  logger.warn(`ALERT [${alert.severity}${alert.escalate ? ' ESCALATED' : ''}]: ${alert.title}`);
  logger.warn(`Message: ${alert.message}`);
}

/**
 * Preserve pre-sync state for rollback.
 * 
 * Captures version fingerprint and schema snapshot before sync begins.
 */
export async function preservePreSyncState(
  pool: Pool,
  source: string
): Promise<{ fingerprint: string; timestamp: Date }> {
  // Simplified - would capture version and schema
  logger.info(`Preserving pre-sync state for ${source}`);
  return {
    fingerprint: 'snapshot-placeholder',
    timestamp: new Date(),
  };
}

/**
 * Block downstream syncs until manual resolution.
 * 
 * Updates db_sync_state with WAITING_FOR_MASTER status.
 */
export async function blockDownstreamSync(
  pool: Pool,
  source: string,
  target: string,
  reason: string
): Promise<void> {
  logger.warn(`Blocking downstream sync: ${source} → ${target}`, { reason });

  // Simplified - would update db_sync_state
  logger.warn('Downstream sync blocking not yet implemented');
}
