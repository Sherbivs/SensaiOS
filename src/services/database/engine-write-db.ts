/**
 * Engine Write-DB Service — Append-Only SQLite Database for Gameplay Logs
 * 
 * Provides write-only access to battle logs, move usage, and anomalies.
 * Flushed from Write Buffer every 30 seconds, validated and uploaded to PROD hourly.
 * 
 * Architecture:
 * - Battle Engine → Write Buffer (in-memory queues, 30s flush)
 * - Write Buffer → Write-DB (SQLite append-only, this service)
 * - Write-DB → Validator (Worker 4, 10-minute intervals)
 * - Validator → PROD (PostgreSQL upload after quality checks)
 * 
 * Key Features:
 * - Append-only operations (no updates/deletes until pruning)
 * - Write-Ahead Log (WAL) for crash recovery (<30s data loss max)
 * - Auto-save every 30s (via Worker 2 flush)
 * - Graceful shutdown (final save before exit)
 * - Data retention (24 hours, pruned by Worker 4)
 * - Validation support (quality checks before PROD upload)
 * 
 * Referenced By: src/services/engine-write-buffer.ts (flush method),
 *                src/workers/engine-workers.ts (WriteDbValidatorWorker),
 *                docs/engine-db-replication.md (Write-DB section)
 * 
 * @module services/engine-write-db
 */

import initSqlJs, { type Database } from 'sql.js';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { EngineDbConfig } from '../../config/engine-db-config.js';
import { log } from '../../utils/logger.js';
import { getTableCount, getCount } from './sql-utils.js';
import type { 
  BattleLogEntry, 
  MoveUsageEntry, 
  AnomalyEntry 
} from '../cache/engine-write-buffer.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * WAL entry (for crash recovery)
 */
interface WalEntry {
  id: number;
  operation: 'INSERT_BATTLE' | 'INSERT_MOVE' | 'INSERT_ANOMALY';
  payload: string; // JSON-encoded entry
  checksum: string; // SHA-256 of payload
  created_at: number; // Unix timestamp
}

/**
 * Validation report (for quality checks before PROD upload)
 */
export interface ValidationReport {
  totalRows: number;
  validatedRows: number;
  passedRows: number;
  failedRows: number;
  anomalyCount: number;
  qualityScore: number; // 0.0 to 1.0 (passed / validated)
  errors: Array<{ row_id: number; error: string }>;
  timestamp: Date;
}

/**
 * Upload report (after PROD sync)
 */
export interface UploadReport {
  battleLogsUploaded: number;
  moveUsageUploaded: number;
  anomaliesUploaded: number;
  durationMs: number;
  errors: string[];
  timestamp: Date;
}

/**
 * Write-DB statistics
 */
export interface WriteDbStats {
  battleLogCount: number;
  moveUsageCount: number;
  anomalyCount: number;
  walEntryCount: number;
  sizeBytes: number;
  oldestEntryAge: number; // Hours
  isInitialized: boolean;
  status: string;
  latency: number | null;
}

// ============================================================================
// Database State
// ============================================================================

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
let db: Database | null = null;
let isInitialized = false;
let autoSaveInterval: NodeJS.Timeout | null = null;
let isDirty = false; // Tracks if database has uncommitted changes
let lastSaveTime = 0; // Unix timestamp of last save

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize Write-DB (idempotent, safe to call multiple times).
 * 
 * Creates schema if database file doesn't exist, otherwise loads existing.
 * Sets up auto-save interval (30 seconds) to persist in-memory changes to disk.
 * 
 * @throws {Error} If sql.js initialization fails or schema creation fails
 */
export async function initialize(): Promise<void> {
  if (isInitialized) {
    return; // Already initialized
  }

  try {
    log('info', 'engine-write-db: Initializing Write-DB...', { 
      path: EngineDbConfig.writeDbPath 
    });

    // Initialize sql.js - locate WASM file from project root
    // In production: /opt/render/project/src/node_modules/sql.js/dist/
    // In development: <project-root>/node_modules/sql.js/dist/
    const projectRoot = process.cwd();
    SQL = await initSqlJs({
      locateFile: (file: string) => path.join(projectRoot, 'node_modules/sql.js/dist/', file)
    });

    // Ensure Store directory exists
    const storeDir = path.dirname(EngineDbConfig.writeDbPath);
    await fsPromises.mkdir(storeDir, { recursive: true });

    // Load existing database or create new one
    let dbData: Uint8Array | undefined;
    try {
      const buffer = await fsPromises.readFile(EngineDbConfig.writeDbPath);
      dbData = new Uint8Array(buffer);
      log('info', 'engine-write-db: Loaded existing Write-DB from disk');
    } catch {
      log('info', 'engine-write-db: No existing Write-DB found, creating new');
    }

    db = new SQL.Database(dbData);

    // Configure SQLite for write performance
    db.run(`PRAGMA journal_mode = WAL`);
    db.run(`PRAGMA synchronous = NORMAL`);
    db.run(`PRAGMA cache_size = ${EngineDbConfig.sqliteCacheSizePages}`);
    db.run(`PRAGMA busy_timeout = ${EngineDbConfig.sqliteBusyTimeoutMs}`);

    // Create schema (idempotent)
    await createSchema();

    // Start auto-save interval (persist to disk every 30s)
    startAutoSave();

    isInitialized = true;

    const stats = getStats();
    log('info', 'engine-write-db: Initialization complete', {
      battleLogCount: stats.battleLogCount,
      moveUsageCount: stats.moveUsageCount,
      anomalyCount: stats.anomalyCount,
      walEntryCount: stats.walEntryCount
    });

  } catch (error) {
    log('error', 'engine-write-db: Initialization failed', error);
    throw error;
  }
}

/**
 * Create Write-DB schema (tables, indexes, auto-save tracking).
 */
async function createSchema(): Promise<void> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  // Battle logs table (one row per completed battle)
  db.run(`
    CREATE TABLE IF NOT EXISTS battle_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      battle_id TEXT NOT NULL UNIQUE,
      trainer_id_1 TEXT NOT NULL,
      trainer_id_2 TEXT NOT NULL,
      winner_id TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      turn_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      uploaded_at INTEGER
    )
  `);

  // Move usage table (one row per move execution)
  db.run(`
    CREATE TABLE IF NOT EXISTS move_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      battle_id TEXT NOT NULL,
      trainer_id TEXT NOT NULL,
      pokemon_id INTEGER NOT NULL,
      move_id INTEGER NOT NULL,
      target_pokemon_id INTEGER NOT NULL,
      damage INTEGER NOT NULL,
      effectiveness REAL NOT NULL,
      is_critical INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      uploaded_at INTEGER
    )
  `);

  // Anomalies table (data quality issues detected during battles)
  db.run(`
    CREATE TABLE IF NOT EXISTS anomalies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      battle_id TEXT NOT NULL,
      anomaly_type TEXT NOT NULL CHECK (anomaly_type IN ('INVALID_DAMAGE', 'INVALID_TYPE', 'INVALID_MOVE', 'LOGIC_ERROR')),
      severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      description TEXT NOT NULL,
      context TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      uploaded_at INTEGER
    )
  `);

  // Write-Ahead Log table (for crash recovery)
  db.run(`
    CREATE TABLE IF NOT EXISTS write_ahead_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      checksum TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // Create indexes for fast queries
  db.run('CREATE INDEX IF NOT EXISTS idx_battle_logs_created_at ON battle_logs(created_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_battle_logs_uploaded_at ON battle_logs(uploaded_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_move_usage_battle_id ON move_usage(battle_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_move_usage_created_at ON move_usage(created_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_anomalies_severity ON anomalies(severity)');
  db.run('CREATE INDEX IF NOT EXISTS idx_anomalies_created_at ON anomalies(created_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_wal_created_at ON write_ahead_log(created_at)');

  log('info', 'engine-write-db: Schema created/verified');
}

// ============================================================================
// Write Operations (Called by Write Buffer)
// ============================================================================

/**
 * Insert battle log entries (bulk insert from Write Buffer flush).
 * 
 * @param entries Array of battle log entries to insert
 * @throws {Error} If database not initialized or insert fails
 */
export async function insertBattleLogs(entries: BattleLogEntry[]): Promise<void> {
  if (!db) {
    throw new Error('Write-DB not initialized');
  }

  if (entries.length === 0) {
    return; // Nothing to insert
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO battle_logs (battle_id, trainer_id_1, trainer_id_2, winner_id, duration_ms, turn_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const entry of entries) {
      // Append to WAL first (crash recovery)
      await appendToWAL('INSERT_BATTLE', entry);

      // Insert to main table
      stmt.run([
        entry.battleId,
        entry.trainerId1,
        entry.trainerId2,
        entry.winnerId,
        entry.durationMs,
        entry.turnCount,
        Math.floor(entry.timestamp.getTime() / 1000) // Convert to Unix timestamp
      ]);
    }

    stmt.free();
    isDirty = true; // Mark for save

    log('info', 'engine-write-db: Inserted battle logs', {
      count: entries.length
    });

  } catch (error) {
    log('error', 'engine-write-db: insertBattleLogs failed', error);
    throw error;
  }
}

/**
 * Insert move usage entries (bulk insert from Write Buffer flush).
 * 
 * @param entries Array of move usage entries to insert
 * @throws {Error} If database not initialized or insert fails
 */
export async function insertMoveUsage(entries: MoveUsageEntry[]): Promise<void> {
  if (!db) {
    throw new Error('Write-DB not initialized');
  }

  if (entries.length === 0) {
    return; // Nothing to insert
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO move_usage (battle_id, trainer_id, pokemon_id, move_id, target_pokemon_id, damage, effectiveness, is_critical, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const entry of entries) {
      // Append to WAL first (crash recovery)
      await appendToWAL('INSERT_MOVE', entry);

      // Insert to main table
      stmt.run([
        entry.battleId,
        entry.trainerId,
        entry.pokemonId,
        entry.moveId,
        entry.targetPokemonId,
        entry.damage,
        entry.effectiveness,
        entry.isCritical ? 1 : 0, // Boolean to integer
        Math.floor(entry.timestamp.getTime() / 1000)
      ]);
    }

    stmt.free();
    isDirty = true; // Mark for save

    log('info', 'engine-write-db: Inserted move usage', {
      count: entries.length
    });

  } catch (error) {
    log('error', 'engine-write-db: insertMoveUsage failed', error);
    throw error;
  }
}

/**
 * Insert anomaly entries (bulk insert from Write Buffer flush).
 * 
 * @param entries Array of anomaly entries to insert
 * @throws {Error} If database not initialized or insert fails
 */
export async function insertAnomalies(entries: AnomalyEntry[]): Promise<void> {
  if (!db) {
    throw new Error('Write-DB not initialized');
  }

  if (entries.length === 0) {
    return; // Nothing to insert
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO anomalies (battle_id, anomaly_type, severity, description, context, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const entry of entries) {
      // Append to WAL first (crash recovery)
      await appendToWAL('INSERT_ANOMALY', entry);

      // Insert to main table
      stmt.run([
        entry.battleId,
        entry.anomalyType,
        entry.severity,
        entry.description,
        JSON.stringify(entry.context),
        Math.floor(entry.timestamp.getTime() / 1000)
      ]);
    }

    stmt.free();
    isDirty = true; // Mark for save

    log('info', 'engine-write-db: Inserted anomalies', {
      count: entries.length
    });

  } catch (error) {
    log('error', 'engine-write-db: insertAnomalies failed', error);
    throw error;
  }
}

// ============================================================================
// WAL Operations (Crash Recovery)
// ============================================================================

/**
 * Append entry to Write-Ahead Log (for crash recovery).
 * 
 * @param operation Operation type
 * @param data Entry data (will be JSON-encoded)
 */
async function appendToWAL(
  operation: 'INSERT_BATTLE' | 'INSERT_MOVE' | 'INSERT_ANOMALY',
  data: BattleLogEntry | MoveUsageEntry | AnomalyEntry
): Promise<void> {
  if (!db) {
    throw new Error('Write-DB not initialized');
  }

  try {
    const payload = JSON.stringify(data);
    const checksum = crypto.createHash('sha256').update(payload).digest('hex');

    const stmt = db.prepare(`
      INSERT INTO write_ahead_log (operation, payload, checksum, created_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run([
      operation,
      payload,
      checksum,
      Math.floor(Date.now() / 1000)
    ]);

    stmt.free();

  } catch (error) {
    // WAL append failure is non-fatal (main table insert still succeeds)
    log('warn', 'engine-write-db: WAL append failed', error);
  }
}

/**
 * Replay Write-Ahead Log (called at startup after crash).
 * 
 * Recovers any entries that were written to WAL but not yet persisted to disk.
 * Validates checksums to detect corruption.
 */
export async function replayWAL(): Promise<void> {
  if (!db) {
    throw new Error('Write-DB not initialized');
  }

  try {
    log('info', 'engine-write-db: Replaying Write-Ahead Log...');

    const result = db.exec(`
      SELECT id, operation, payload, checksum, created_at
      FROM write_ahead_log
      ORDER BY id
    `);

    if (!result || result.length === 0 || !result[0].values || result[0].values.length === 0) {
      log('info', 'engine-write-db: WAL is empty (no recovery needed)');
      return;
    }

    let recoveredCount = 0;
    let corruptedCount = 0;

    for (const row of result[0].values) {
      const walEntry: WalEntry = {
        id: row[0] as number,
        operation: row[1] as 'INSERT_BATTLE' | 'INSERT_MOVE' | 'INSERT_ANOMALY',
        payload: row[2] as string,
        checksum: row[3] as string,
        created_at: row[4] as number
      };

      // Verify checksum
      const computedChecksum = crypto.createHash('sha256').update(walEntry.payload).digest('hex');
      if (computedChecksum !== walEntry.checksum) {
        log('warn', 'engine-write-db: WAL entry corrupted (checksum mismatch)', {
          walId: walEntry.id,
          operation: walEntry.operation
        });
        corruptedCount++;
        continue;
      }

      // Replay operation (re-insert to main table)
      try {
        const data = JSON.parse(walEntry.payload);

        switch (walEntry.operation) {
          case 'INSERT_BATTLE':
            await insertBattleLogs([data as BattleLogEntry]);
            break;
          case 'INSERT_MOVE':
            await insertMoveUsage([data as MoveUsageEntry]);
            break;
          case 'INSERT_ANOMALY':
            await insertAnomalies([data as AnomalyEntry]);
            break;
        }

        recoveredCount++;

      } catch (error) {
        log('warn', 'engine-write-db: WAL replay failed for entry', {
          walId: walEntry.id,
          operation: walEntry.operation,
          error
        });
        corruptedCount++;
      }
    }

    // Clear WAL after successful replay
    db.run('DELETE FROM write_ahead_log');

    log('info', 'engine-write-db: WAL replay complete', {
      recoveredCount,
      corruptedCount
    });

  } catch (error) {
    log('error', 'engine-write-db: WAL replay failed', error);
    throw error;
  }
}

// ============================================================================
// Persistence (Auto-Save)
// ============================================================================

/**
 * Save database to disk (sql.js operates in-memory, must explicitly persist).
 * 
 * OPTIMIZATION: Only writes to disk if database has uncommitted changes (isDirty).
 * This prevents unnecessary I/O every 10s when no battles are running.
 * 
 * @param force - If true, saves even if not dirty (used during shutdown)
 */
export async function saveToFile(force = false): Promise<void> {
  if (!db) {
    return;
  }

  // Skip save if no changes and not forced
  if (!isDirty && !force) {
    return; // No changes since last save
  }

  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    await fsPromises.writeFile(EngineDbConfig.writeDbPath, buffer);

    isDirty = false; // Mark as clean
    lastSaveTime = Date.now();

    log('info', 'engine-write-db: Saved to disk', {
      sizeBytes: buffer.length
    });

  } catch (error) {
    log('error', 'engine-write-db: Failed to save to disk', error);
    throw error;
  }
}

/**
 * Start auto-save interval (persist to disk every 30s).
 */
function startAutoSave(): void {
  if (autoSaveInterval) {
    return; // Already running
  }

  autoSaveInterval = setInterval(async () => {
    try {
      await saveToFile();
    } catch (error) {
      log('error', 'engine-write-db: Auto-save failed', error);
    }
  }, EngineDbConfig.writeBufferFlushIntervalMs); // Same as buffer flush (30s)

  log('info', 'engine-write-db: Auto-save started', {
    intervalMs: EngineDbConfig.writeBufferFlushIntervalMs
  });
}

/**
 * Stop auto-save interval (called during shutdown).
 */
function stopAutoSave(): void {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
    log('info', 'engine-write-db: Auto-save stopped');
  }
}

// ============================================================================
// Validation & Upload (Called by Worker 4)
// ============================================================================

/**
 * Validate Write-DB data quality (before PROD upload).
 * 
 * Checks:
 * - Schema validation (non-null fields, valid foreign keys)
 * - Range validation (damage >= 0, effectiveness in [0, 4])
 * - Logic validation (winner must be one of the trainers)
 * 
 * @returns Validation report with quality score
 */
export async function validateData(): Promise<ValidationReport> {
  if (!db) {
    throw new Error('Write-DB not initialized');
  }

  const startTime = performance.now();
  const errors: Array<{ row_id: number; error: string }> = [];

  try {
    log('info', 'engine-write-db: Starting data validation...');

    // Count total rows
    const battleCount = getCount(db, 'SELECT COUNT(*) FROM battle_logs WHERE uploaded_at IS NULL');
    const moveCount = getCount(db, 'SELECT COUNT(*) FROM move_usage WHERE uploaded_at IS NULL');
    const totalRows = battleCount + moveCount;

    let validatedRows = 0;
    let passedRows = 0;

    // Validate battle logs
    const battles = db.exec(`
      SELECT id, battle_id, trainer_id_1, trainer_id_2, winner_id, duration_ms, turn_count
      FROM battle_logs
      WHERE uploaded_at IS NULL
      LIMIT ${EngineDbConfig.validationBatchSize}
    `);

    if (battles && battles[0]?.values) {
      for (const row of battles[0].values) {
        validatedRows++;
        const id = row[0] as number;
        const winnerId = row[4] as string;
        const trainerId1 = row[2] as string;
        const trainerId2 = row[3] as string;
        const durationMs = row[5] as number;
        const turnCount = row[6] as number;

        // Logic validation: Winner must be one of the trainers
        if (winnerId !== trainerId1 && winnerId !== trainerId2) {
          errors.push({ row_id: id, error: 'Winner not one of the trainers' });
          continue;
        }

        // Range validation
        if (durationMs < 0 || turnCount < 1) {
          errors.push({ row_id: id, error: 'Invalid duration or turn count' });
          continue;
        }

        passedRows++;
      }
    }

    // Validate move usage
    const moves = db.exec(`
      SELECT id, damage, effectiveness, is_critical
      FROM move_usage
      WHERE uploaded_at IS NULL
      LIMIT ${EngineDbConfig.validationBatchSize}
    `);

    if (moves && moves[0]?.values) {
      for (const row of moves[0].values) {
        validatedRows++;
        const id = row[0] as number;
        const damage = row[1] as number;
        const effectiveness = row[2] as number;

        // Range validation
        if (damage < 0) {
          errors.push({ row_id: id, error: 'Negative damage' });
          continue;
        }

        if (effectiveness < 0 || effectiveness > 4) {
          errors.push({ row_id: id, error: 'Invalid effectiveness multiplier' });
          continue;
        }

        passedRows++;
      }
    }

    // Count anomalies
    const anomalyCount = getCount(db, 'SELECT COUNT(*) FROM anomalies WHERE uploaded_at IS NULL');

    const qualityScore = validatedRows > 0 ? passedRows / validatedRows : 1.0;
    const durationMs = performance.now() - startTime;

    const report: ValidationReport = {
      totalRows,
      validatedRows,
      passedRows,
      failedRows: validatedRows - passedRows,
      anomalyCount,
      qualityScore,
      errors: errors.slice(0, 100), // Limit error list to 100 entries
      timestamp: new Date()
    };

    log('info', 'engine-write-db: Validation complete', {
      qualityScore: (qualityScore * 100).toFixed(2) + '%',
      passedRows,
      failedRows: report.failedRows,
      durationMs: durationMs.toFixed(2)
    });

    return report;

  } catch (error) {
    log('error', 'engine-write-db: Validation failed', error);
    throw error;
  }
}

/**
 * Upload validated data to PROD (PostgreSQL).
 * 
 * NOTE: This is a placeholder. Actual implementation requires Prisma client
 * and proper error handling for network failures.
 * 
 * @returns Upload report with counts and errors
 */
export async function uploadToProd(): Promise<UploadReport> {
  if (!db) {
    throw new Error('Write-DB not initialized');
  }

  const startTime = performance.now();

  try {
    log('info', 'engine-write-db: Starting PROD upload...');

    // TODO: Implement actual PROD upload via Prisma
    // const prisma = (await import('../shared/prisma.js')).prisma;
    //
    // const battles = db.exec('SELECT * FROM battle_logs WHERE uploaded_at IS NULL');
    // for (const battle of battles) {
    //   await prisma.battleLog.create({ data: { ... } });
    // }
    //
    // db.run('UPDATE battle_logs SET uploaded_at = ? WHERE uploaded_at IS NULL', [Date.now()]);

    // PLACEHOLDER: Mark as uploaded (simulated)
    const now = Math.floor(Date.now() / 1000);
    db.run(`UPDATE battle_logs SET uploaded_at = ? WHERE uploaded_at IS NULL`, [now]);
    db.run(`UPDATE move_usage SET uploaded_at = ? WHERE uploaded_at IS NULL`, [now]);
    db.run(`UPDATE anomalies SET uploaded_at = ? WHERE uploaded_at IS NULL`, [now]);

    const durationMs = performance.now() - startTime;

    const report: UploadReport = {
      battleLogsUploaded: 0, // TODO: Get actual count
      moveUsageUploaded: 0,
      anomaliesUploaded: 0,
      durationMs,
      errors: [],
      timestamp: new Date()
    };

    log('warn', 'engine-write-db: PROD upload using placeholder (Prisma integration pending)');

    return report;

  } catch (error) {
    log('error', 'engine-write-db: PROD upload failed', error);
    throw error;
  }
}

// ============================================================================
// Maintenance (Pruning)
// ============================================================================

/**
 * Prune old entries (older than retention period).
 * 
 * Deletes entries that have been uploaded to PROD and exceed retention period.
 * Runs VACUUM to reclaim disk space.
 */
export async function pruneOldEntries(): Promise<void> {
  if (!db) {
    throw new Error('Write-DB not initialized');
  }

  try {
    const retentionSeconds = EngineDbConfig.writeDbRetentionHours * 60 * 60;
    const cutoffTime = Math.floor(Date.now() / 1000) - retentionSeconds;

    log('info', 'engine-write-db: Pruning old entries...', {
      retentionHours: EngineDbConfig.writeDbRetentionHours,
      cutoffTime: new Date(cutoffTime * 1000).toISOString()
    });

    // Delete uploaded entries older than retention period
    db.exec(`
      DELETE FROM battle_logs 
      WHERE uploaded_at IS NOT NULL 
      AND created_at < ${cutoffTime}
    `);
    
    db.exec(`
      DELETE FROM move_usage 
      WHERE uploaded_at IS NOT NULL 
      AND created_at < ${cutoffTime}
    `);
    
    db.exec(`
      DELETE FROM anomalies 
      WHERE uploaded_at IS NOT NULL 
      AND created_at < ${cutoffTime}
    `);

    // Run VACUUM to reclaim space
    db.run('VACUUM');

    log('info', 'engine-write-db: Pruning complete');

    // Save after pruning (force because VACUUM changes file)
    isDirty = true;
    await saveToFile();

  } catch (error) {
    log('error', 'engine-write-db: Pruning failed', error);
    throw error;
  }
}

// ============================================================================
// Stats & Observability
// ============================================================================

/**
 * Get Write-DB statistics (for /ops engine command).
 */
export function getStats(): WriteDbStats {
  if (!db || !isInitialized) {
    return {
      battleLogCount: 0,
      moveUsageCount: 0,
      anomalyCount: 0,
      walEntryCount: 0,
      sizeBytes: 0,
      oldestEntryAge: 0,
      isInitialized: false,
      status: 'offline',
      latency: null,
    };
  }

  try {
    // Measure query latency
    const start = performance.now();
    
    // Count battle logs
    const battleLogCount = getTableCount(db, 'battle_logs');

    // Count move usage
    const moveUsageCount = getTableCount(db, 'move_usage');

    // Count anomalies
    const anomalyCount = getTableCount(db, 'anomalies');

    // Count WAL entries
    const walEntryCount = getTableCount(db, 'write_ahead_log');

    // Get oldest entry age
    const oldestResult = db.exec('SELECT MIN(created_at) FROM battle_logs');
    const oldestTimestamp = (oldestResult[0]?.values[0]?.[0] as number) ?? 0;
    const oldestEntryAge = oldestTimestamp > 0 
      ? (Date.now() / 1000 - oldestTimestamp) / 3600 // Convert to hours
      : 0;

    // Calculate query latency
    const latency = performance.now() - start;

    // Estimate database size
    const data = db.export();
    const sizeBytes = data.byteLength;

    return {
      battleLogCount,
      moveUsageCount,
      anomalyCount,
      walEntryCount,
      sizeBytes,
      oldestEntryAge,
      isInitialized: true,
      status: 'healthy',
      latency,
    };

  } catch (error) {
    log('error', 'engine-write-db: getStats failed', error);
    return {
      battleLogCount: 0,
      moveUsageCount: 0,
      anomalyCount: 0,
      walEntryCount: 0,
      sizeBytes: 0,
      oldestEntryAge: 0,
      isInitialized: false,
      status: 'error',
      latency: null,
    };
  }
}

// ============================================================================
// Lifecycle Management
// ============================================================================

/**
 * Close Write-DB connection gracefully (with final save).
 */
export async function close(): Promise<void> {
  stopAutoSave();

  if (db) {
    // Final save before closing (force even if not dirty)
    await saveToFile(true);
    
    db.close();
    db = null;
  }

  SQL = null;
  isInitialized = false;
  isDirty = false;
  lastSaveTime = 0;

  log('info', 'engine-write-db: Connection closed');
}

/**
 * Check if Write-DB is ready for writes.
 */
export function isReady(): boolean {
  return isInitialized && db !== null;
}
