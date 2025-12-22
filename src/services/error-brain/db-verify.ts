import path from 'node:path';
import { ErrorBrainConfig } from '../../config/error-brain-config.js';
import {
  ENGINE_READ_DB_PATH,
  ENGINE_WRITE_DB_PATH,
  ENGINE_WAL_PATH,
} from '../../config/engine-db-config.js';
import { ALERT_PERSIST_DIR } from '../../config/env.js';
import { log } from '../../shared/logging/index.js';

/**
 * Normalize path for comparison (resolve + toLowerCase on Windows)
 */
function normalize(p: string): string {
  try {
    const resolved = path.resolve(p);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  } catch {
    return p;
  }
}

/**
 * Verify Error Brain DB path is distinct from other important DBs/paths.
 * Returns an array of conflict descriptions (empty when no conflicts).
 */
export function verifyDistinctDatabases(): string[] {
  const conflicts: string[] = [];

  const brain = normalize(ErrorBrainConfig.brainDbPath);
  const engineRead = normalize(ENGINE_READ_DB_PATH);
  const engineWrite = normalize(ENGINE_WRITE_DB_PATH);
  const engineWal = normalize(ENGINE_WAL_PATH);
  const alertDir = normalize(ALERT_PERSIST_DIR ?? path.join(process.cwd(), 'Store', 'alerts'));

  if (brain === engineRead) {
    conflicts.push(`Error Brain DB path collides with Engine Read-DB: ${ErrorBrainConfig.brainDbPath}`);
  }

  if (brain === engineWrite) {
    conflicts.push(`Error Brain DB path collides with Engine Write-DB: ${ErrorBrainConfig.brainDbPath}`);
  }

  if (brain === engineWal) {
    conflicts.push(`Error Brain DB path collides with Engine WAL path: ${ErrorBrainConfig.brainDbPath}`);
  }

  // Ensure Error Brain DB is not stored directly inside the alerts/security directory
  if (brain.startsWith(alertDir) || alertDir.startsWith(brain)) {
    conflicts.push(`Error Brain DB path appears to overlap security/alerts path: ${ErrorBrainConfig.brainDbPath} <-> ${ALERT_PERSIST_DIR}`);
  }

  // Additional heuristic: ensure filenames are not identical (avoids accidental copy)
  try {
    const brainBase = path.basename(brain);
    if (brainBase === path.basename(engineRead) || brainBase === path.basename(engineWrite)) {
      conflicts.push(`Error Brain DB filename matches an engine DB filename: ${brainBase}`);
    }
  } catch {
    // ignore filename comparison errors
  }

  return conflicts;
}

/**
 * Ensure distinct databases or throw an Error to prevent startup.
 */
export function ensureDistinctOrThrow(): void {
  const conflicts = verifyDistinctDatabases();
  if (conflicts.length === 0) return;

  // Log conflicts and throw to fail-fast
  conflicts.forEach((c) => log('error', 'error-brain: DB conflict detected: ' + c));
  throw new Error(`Error Brain DB path conflicts detected: ${conflicts.join('; ')}`);
}

export default { verifyDistinctDatabases, ensureDistinctOrThrow };
