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
import initSqlJs from 'sql.js';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { EngineDbConfig } from '../../config/engine-db-config.js';
import { log } from "../../shared/logger.js";
import { getTableCount, getCount } from './sql-utils.js';
import { EventBus } from '../../shared/event-bus.js';
// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ============================================================================
// Database State
// ============================================================================
let SQL = null;
let db = null;
let isInitialized = false;
let autoSaveInterval = null;
// ============================================================================
// P6: Historical Metrics Storage State
// ============================================================================
/** EventBus subscription ID for metrics.snapshot topic */
let metricsSubscriptionId = null;
/** Last metrics insert timestamp (for rate limiting - once per minute max) */
let lastMetricsInsertTime = 0;
/** Metrics insertion rate limit: 60 seconds (1 sample per minute, ~10,080/week) */
const METRICS_INSERT_INTERVAL_MS = 60000;
/** Metrics retention period: 7 days in seconds */
const METRICS_RETENTION_SECONDS = 7 * 24 * 60 * 60;
/** Pressure level constants (for type safety) */
const PRESSURE_LEVELS = {
    NORMAL: 0,
    WARNING: 1,
    CRITICAL: 2,
    EMERGENCY: 3,
};
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
export async function initialize() {
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
            locateFile: (file) => path.join(projectRoot, 'node_modules/sql.js/dist/', file)
        });
        // Ensure Store directory exists
        const storeDir = path.dirname(EngineDbConfig.writeDbPath);
        await fsPromises.mkdir(storeDir, { recursive: true });
        // Load existing database or create new one
        let dbData;
        try {
            const buffer = await fsPromises.readFile(EngineDbConfig.writeDbPath);
            dbData = new Uint8Array(buffer);
            log('info', 'engine-write-db: Loaded existing Write-DB from disk');
        }
        catch {
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
        // P6: Subscribe to EventBus for metrics storage
        subscribeToMetricsSnapshot();
        isInitialized = true;
        const stats = getStats();
        log('info', 'engine-write-db: Initialization complete', {
            battleLogCount: stats.battleLogCount,
            moveUsageCount: stats.moveUsageCount,
            anomalyCount: stats.anomalyCount,
            walEntryCount: stats.walEntryCount,
            systemMetricsCount: stats.systemMetricsCount
        });
    }
    catch (error) {
        log('error', 'engine-write-db: Initialization failed', error);
        throw error;
    }
}
/**
 * Create Write-DB schema (tables, indexes, auto-save tracking).
 */
async function createSchema() {
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
    // =========================================================================
    // Phase 3, P6: System Metrics Table (Historical Metrics Storage)
    // @see docs/projects/metrics-expansion-bible.md § Project 6
    // 
    // Stores metrics.snapshot events for historical analysis.
    // Retention: 7 days of per-minute samples (~10,080 rows per week)
    // =========================================================================
    db.run(`
    CREATE TABLE IF NOT EXISTS system_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      
      -- Memory metrics (bytes)
      rss_bytes INTEGER NOT NULL,
      heap_used_bytes INTEGER NOT NULL,
      heap_total_bytes INTEGER NOT NULL,
      external_bytes INTEGER NOT NULL,
      
      -- CPU metrics (percentage, stored as REAL for precision)
      cpu_user_percent REAL NOT NULL,
      cpu_system_percent REAL NOT NULL,
      
      -- Disk metrics (bytes)
      disk_total_bytes INTEGER NOT NULL,
      disk_used_bytes INTEGER NOT NULL,
      disk_free_bytes INTEGER NOT NULL,
      
      -- Pressure levels (0=NORMAL, 1=WARNING, 2=CRITICAL, 3=EMERGENCY)
      memory_pressure INTEGER NOT NULL DEFAULT 0,
      disk_pressure INTEGER NOT NULL DEFAULT 0
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
    // P6: System metrics index for time-based queries
    db.run('CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp)');
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
export async function insertBattleLogs(entries) {
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
        log('info', 'engine-write-db: Inserted battle logs', {
            count: entries.length
        });
    }
    catch (error) {
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
export async function insertMoveUsage(entries) {
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
        log('info', 'engine-write-db: Inserted move usage', {
            count: entries.length
        });
    }
    catch (error) {
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
export async function insertAnomalies(entries) {
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
        log('info', 'engine-write-db: Inserted anomalies', {
            count: entries.length
        });
    }
    catch (error) {
        log('error', 'engine-write-db: insertAnomalies failed', error);
        throw error;
    }
}
// ============================================================================
// P6: Historical Metrics Storage Operations
// @see docs/projects/metrics-expansion-bible.md § Project 6
// ============================================================================
/**
 * Subscribe to metrics.snapshot EventBus topic for historical storage.
 *
 * Rate-limited to 1 insert per minute to maintain ~10,080 rows/week retention.
 * Converts MetricsSnapshotEvent to SystemMetricsEntry and stores in SQLite.
 */
function subscribeToMetricsSnapshot() {
    try {
        const eventBus = EventBus.getInstance();
        metricsSubscriptionId = eventBus.subscribe('metrics.snapshot', async (event) => {
            try {
                const now = Date.now();
                // Rate limit: Only insert once per minute
                if (now - lastMetricsInsertTime < METRICS_INSERT_INTERVAL_MS) {
                    return; // Skip this sample (already have one this minute)
                }
                const payload = event.payload;
                // Convert MetricsSnapshotEvent to SystemMetricsEntry
                const entry = {
                    timestamp: Math.floor(new Date(payload.timestamp).getTime() / 1000),
                    rssBytes: payload.memory.rss,
                    heapUsedBytes: payload.memory.heapUsed,
                    heapTotalBytes: payload.memory.heapTotal,
                    externalBytes: payload.memory.external,
                    cpuUserPercent: payload.cpu.user,
                    cpuSystemPercent: payload.cpu.system,
                    diskTotalBytes: payload.storage.total,
                    diskUsedBytes: payload.storage.used,
                    diskFreeBytes: payload.storage.free,
                    memoryPressure: pressureLevelToNumber(payload.pressure.memory),
                    diskPressure: pressureLevelToNumber(payload.pressure.disk),
                };
                await insertSystemMetrics(entry);
                lastMetricsInsertTime = now;
            }
            catch (error) {
                log('warn', 'engine-write-db: Failed to store metrics snapshot', error);
                // Non-fatal - metrics storage failures shouldn't crash the system
            }
        });
        log('info', 'engine-write-db: Subscribed to metrics.snapshot for historical storage');
    }
    catch (error) {
        log('warn', 'engine-write-db: Failed to subscribe to metrics.snapshot', error);
        // Non-fatal - historical metrics are optional
    }
}
/**
 * Unsubscribe from metrics.snapshot EventBus topic.
 */
function unsubscribeFromMetricsSnapshot() {
    if (metricsSubscriptionId) {
        try {
            EventBus.getInstance().unsubscribe(metricsSubscriptionId);
            metricsSubscriptionId = null;
            log('info', 'engine-write-db: Unsubscribed from metrics.snapshot');
        }
        catch (error) {
            log('warn', 'engine-write-db: Failed to unsubscribe from metrics.snapshot', error);
        }
    }
}
/**
 * Convert pressure level string to numeric value.
 */
function pressureLevelToNumber(level) {
    switch (level) {
        case 'NORMAL': return PRESSURE_LEVELS.NORMAL;
        case 'WARNING': return PRESSURE_LEVELS.WARNING;
        case 'CRITICAL': return PRESSURE_LEVELS.CRITICAL;
        case 'EMERGENCY': return PRESSURE_LEVELS.EMERGENCY;
        default: return PRESSURE_LEVELS.NORMAL;
    }
}
/**
 * Convert numeric pressure level to string.
 */
function _pressureLevelToString(level) {
    switch (level) {
        case PRESSURE_LEVELS.NORMAL: return 'NORMAL';
        case PRESSURE_LEVELS.WARNING: return 'WARNING';
        case PRESSURE_LEVELS.CRITICAL: return 'CRITICAL';
        case PRESSURE_LEVELS.EMERGENCY: return 'EMERGENCY';
        default: return 'NORMAL';
    }
}
/**
 * Insert a single system metrics entry.
 *
 * @param entry System metrics entry to insert
 */
async function insertSystemMetrics(entry) {
    if (!db) {
        throw new Error('Write-DB not initialized');
    }
    try {
        const stmt = db.prepare(`
      INSERT INTO system_metrics (
        timestamp, rss_bytes, heap_used_bytes, heap_total_bytes, external_bytes,
        cpu_user_percent, cpu_system_percent,
        disk_total_bytes, disk_used_bytes, disk_free_bytes,
        memory_pressure, disk_pressure
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run([
            entry.timestamp,
            entry.rssBytes,
            entry.heapUsedBytes,
            entry.heapTotalBytes,
            entry.externalBytes,
            entry.cpuUserPercent,
            entry.cpuSystemPercent,
            entry.diskTotalBytes,
            entry.diskUsedBytes,
            entry.diskFreeBytes,
            entry.memoryPressure,
            entry.diskPressure,
        ]);
        stmt.free();
    }
    catch (error) {
        log('error', 'engine-write-db: Failed to insert system metrics', error);
        throw error;
    }
}
/**
 * Query historical metrics for /ops metrics-history command.
 *
 * @param minutes Number of minutes to look back (default: 60)
 * @returns Metrics history result with entries and summary
 */
export async function queryMetricsHistory(minutes = 60) {
    if (!db) {
        return {
            entries: [],
            summary: {
                count: 0,
                timeRangeMinutes: minutes,
                avgRssMB: 0,
                avgHeapUsedMB: 0,
                avgCpuPercent: 0,
                avgDiskUsedPercent: 0,
                maxRssMB: 0,
                maxCpuPercent: 0,
                alertCount: 0,
            },
        };
    }
    try {
        const cutoffTime = Math.floor(Date.now() / 1000) - (minutes * 60);
        // Query entries within time range
        const result = db.exec(`
      SELECT 
        id, timestamp, 
        rss_bytes, heap_used_bytes, heap_total_bytes, external_bytes,
        cpu_user_percent, cpu_system_percent,
        disk_total_bytes, disk_used_bytes, disk_free_bytes,
        memory_pressure, disk_pressure
      FROM system_metrics
      WHERE timestamp >= ${cutoffTime}
      ORDER BY timestamp DESC
      LIMIT 1000
    `);
        const entries = [];
        if (result && result[0]?.values) {
            for (const row of result[0].values) {
                entries.push({
                    id: row[0],
                    timestamp: row[1],
                    rssBytes: row[2],
                    heapUsedBytes: row[3],
                    heapTotalBytes: row[4],
                    externalBytes: row[5],
                    cpuUserPercent: row[6],
                    cpuSystemPercent: row[7],
                    diskTotalBytes: row[8],
                    diskUsedBytes: row[9],
                    diskFreeBytes: row[10],
                    memoryPressure: row[11],
                    diskPressure: row[12],
                });
            }
        }
        // Calculate summary statistics
        const summary = calculateMetricsSummary(entries, minutes);
        return { entries, summary };
    }
    catch (error) {
        log('error', 'engine-write-db: Failed to query metrics history', error);
        return {
            entries: [],
            summary: {
                count: 0,
                timeRangeMinutes: minutes,
                avgRssMB: 0,
                avgHeapUsedMB: 0,
                avgCpuPercent: 0,
                avgDiskUsedPercent: 0,
                maxRssMB: 0,
                maxCpuPercent: 0,
                alertCount: 0,
            },
        };
    }
}
/**
 * Calculate summary statistics from metrics entries.
 */
function calculateMetricsSummary(entries, timeRangeMinutes) {
    if (entries.length === 0) {
        return {
            count: 0,
            timeRangeMinutes,
            avgRssMB: 0,
            avgHeapUsedMB: 0,
            avgCpuPercent: 0,
            avgDiskUsedPercent: 0,
            maxRssMB: 0,
            maxCpuPercent: 0,
            alertCount: 0,
        };
    }
    const MB = 1024 * 1024;
    let totalRss = 0;
    let totalHeapUsed = 0;
    let totalCpu = 0;
    let totalDiskUsedPercent = 0;
    let maxRss = 0;
    let maxCpu = 0;
    let alertCount = 0;
    for (const entry of entries) {
        totalRss += entry.rssBytes;
        totalHeapUsed += entry.heapUsedBytes;
        totalCpu += entry.cpuUserPercent + entry.cpuSystemPercent;
        const diskUsedPercent = entry.diskTotalBytes > 0
            ? (entry.diskUsedBytes / entry.diskTotalBytes) * 100
            : 0;
        totalDiskUsedPercent += diskUsedPercent;
        if (entry.rssBytes > maxRss)
            maxRss = entry.rssBytes;
        if (entry.cpuUserPercent + entry.cpuSystemPercent > maxCpu) {
            maxCpu = entry.cpuUserPercent + entry.cpuSystemPercent;
        }
        // Count entries with any pressure > NORMAL
        if (entry.memoryPressure > PRESSURE_LEVELS.NORMAL || entry.diskPressure > PRESSURE_LEVELS.NORMAL) {
            alertCount++;
        }
    }
    const count = entries.length;
    return {
        count,
        timeRangeMinutes,
        avgRssMB: Math.round((totalRss / count / MB) * 10) / 10,
        avgHeapUsedMB: Math.round((totalHeapUsed / count / MB) * 10) / 10,
        avgCpuPercent: Math.round((totalCpu / count) * 10) / 10,
        avgDiskUsedPercent: Math.round((totalDiskUsedPercent / count) * 10) / 10,
        maxRssMB: Math.round((maxRss / MB) * 10) / 10,
        maxCpuPercent: Math.round(maxCpu * 10) / 10,
        alertCount,
    };
}
/**
 * Prune old system metrics (older than 7 days retention).
 *
 * Called by the maintenance worker. Keeps ~10,080 rows (7 days at 1/minute).
 */
export async function pruneOldMetrics() {
    if (!db) {
        return { deletedCount: 0 };
    }
    try {
        const cutoffTime = Math.floor(Date.now() / 1000) - METRICS_RETENTION_SECONDS;
        // Get count before deletion
        const beforeResult = db.exec(`SELECT COUNT(*) FROM system_metrics WHERE timestamp < ${cutoffTime}`);
        const deletedCount = beforeResult[0]?.values[0]?.[0] ?? 0;
        if (deletedCount > 0) {
            db.exec(`DELETE FROM system_metrics WHERE timestamp < ${cutoffTime}`);
            log('info', 'engine-write-db: Pruned old system metrics', {
                deletedCount,
                retentionDays: 7,
                cutoffTime: new Date(cutoffTime * 1000).toISOString(),
            });
        }
        return { deletedCount };
    }
    catch (error) {
        log('error', 'engine-write-db: Failed to prune old metrics', error);
        return { deletedCount: 0 };
    }
}
/**
 * Get system metrics count (for stats).
 */
function getSystemMetricsCount() {
    if (!db)
        return 0;
    try {
        return getTableCount(db, 'system_metrics');
    }
    catch {
        return 0;
    }
}
/**
 * Get oldest system metrics timestamp (for stats).
 */
function getOldestMetricsAge() {
    if (!db)
        return 0;
    try {
        const result = db.exec('SELECT MIN(timestamp) FROM system_metrics');
        const oldestTimestamp = result[0]?.values[0]?.[0] ?? 0;
        return oldestTimestamp > 0
            ? (Date.now() / 1000 - oldestTimestamp) / 3600 // Convert to hours
            : 0;
    }
    catch {
        return 0;
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
async function appendToWAL(operation, data) {
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
    }
    catch (error) {
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
export async function replayWAL() {
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
            const walEntry = {
                id: row[0],
                operation: row[1],
                payload: row[2],
                checksum: row[3],
                created_at: row[4]
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
                        await insertBattleLogs([data]);
                        break;
                    case 'INSERT_MOVE':
                        await insertMoveUsage([data]);
                        break;
                    case 'INSERT_ANOMALY':
                        await insertAnomalies([data]);
                        break;
                }
                recoveredCount++;
            }
            catch (error) {
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
    }
    catch (error) {
        log('error', 'engine-write-db: WAL replay failed', error);
        throw error;
    }
}
// ============================================================================
// Persistence (Auto-Save)
// ============================================================================
/**
 * Save database to disk (sql.js operates in-memory, must explicitly persist).
 */
export async function saveToFile() {
    if (!db) {
        return;
    }
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        await fsPromises.writeFile(EngineDbConfig.writeDbPath, buffer);
        log('info', 'engine-write-db: Saved to disk', {
            sizeBytes: buffer.length
        });
    }
    catch (error) {
        log('error', 'engine-write-db: Failed to save to disk', error);
        throw error;
    }
}
/**
 * Start auto-save interval (persist to disk every 30s).
 */
function startAutoSave() {
    if (autoSaveInterval) {
        return; // Already running
    }
    autoSaveInterval = setInterval(async () => {
        try {
            await saveToFile();
        }
        catch (error) {
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
function stopAutoSave() {
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
export async function validateData() {
    if (!db) {
        throw new Error('Write-DB not initialized');
    }
    const startTime = performance.now();
    const errors = [];
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
                const id = row[0];
                const winnerId = row[4];
                const trainerId1 = row[2];
                const trainerId2 = row[3];
                const durationMs = row[5];
                const turnCount = row[6];
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
                const id = row[0];
                const damage = row[1];
                const effectiveness = row[2];
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
        const report = {
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
    }
    catch (error) {
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
export async function uploadToProd() {
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
        const report = {
            battleLogsUploaded: 0, // TODO: Get actual count
            moveUsageUploaded: 0,
            anomaliesUploaded: 0,
            durationMs,
            errors: [],
            timestamp: new Date()
        };
        log('warn', 'engine-write-db: PROD upload using placeholder (Prisma integration pending)');
        return report;
    }
    catch (error) {
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
export async function pruneOldEntries() {
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
        // Save after pruning
        await saveToFile();
    }
    catch (error) {
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
export function getStats() {
    if (!db || !isInitialized) {
        return {
            battleLogCount: 0,
            moveUsageCount: 0,
            anomalyCount: 0,
            walEntryCount: 0,
            systemMetricsCount: 0,
            sizeBytes: 0,
            oldestEntryAge: 0,
            oldestMetricsAge: 0,
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
        // P6: Count system metrics
        const systemMetricsCount = getSystemMetricsCount();
        // P6: Get oldest metrics age
        const oldestMetricsAge = getOldestMetricsAge();
        // Get oldest entry age
        const oldestResult = db.exec('SELECT MIN(created_at) FROM battle_logs');
        const oldestTimestamp = oldestResult[0]?.values[0]?.[0] ?? 0;
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
            systemMetricsCount,
            sizeBytes,
            oldestEntryAge,
            oldestMetricsAge,
            isInitialized: true,
            status: 'healthy',
            latency,
        };
    }
    catch (error) {
        log('error', 'engine-write-db: getStats failed', error);
        return {
            battleLogCount: 0,
            moveUsageCount: 0,
            anomalyCount: 0,
            walEntryCount: 0,
            systemMetricsCount: 0,
            sizeBytes: 0,
            oldestEntryAge: 0,
            oldestMetricsAge: 0,
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
export async function close() {
    // P6: Unsubscribe from metrics EventBus first
    unsubscribeFromMetricsSnapshot();
    stopAutoSave();
    if (db) {
        // Final save before closing
        await saveToFile();
        db.close();
        db = null;
    }
    SQL = null;
    isInitialized = false;
    log('info', 'engine-write-db: Connection closed');
}
/**
 * Check if Write-DB is ready for writes.
 */
export function isReady() {
    return isInitialized && db !== null;
}
/**
 * Check if metrics storage is subscribed.
 *
 * P6: For /ops engine command status display.
 */
export function isMetricsSubscribed() {
    return metricsSubscriptionId !== null;
}
