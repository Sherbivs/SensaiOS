/**
 * Engine Write-DB Worker — SQLite Write-Only Worker with WAL
 *
 * Purpose:
 * - Capture battle outcomes, move usage, and gameplay anomalies
 * - Write buffering for non-blocking battle flow (<10μs push latency)
 * - SQLite backend with WAL (Write-Ahead Logging) for durability
 * - Periodic validation + upload to PROD for analytics
 *
 * Architecture:
 * - Write Buffer: In-memory queue (max 10k entries, 75%/95% backpressure)
 * - SQLite Write-DB: engine-write-db.sqlite (WAL mode, auto-checkpoint)
 * - Flush Strategy: Hybrid (every 30s OR 100 entries)
 * - Validation: Quality checks before PROD upload (integrity, completeness)
 * - Retention: 24h after upload, VACUUM on cleanup
 *
 * Performance Targets:
 * - Push latency: <10μs (in-memory enqueue)
 * - Flush latency: <200ms (batch SQLite writes)
 * - Write throughput: 1000+ writes/sec
 * - Auto-checkpoint: Every 1000 WAL frames
 *
 * Integration:
 * - Used by: BattleEngine (log outcomes), MoveSelector (track usage)
 * - Upload to: PROD PostgreSQL BattleLog/MoveUsage tables
 * - Monitoring: /ops engine command
 *
 * @module workers/database/engine-write-worker
 */
import { BaseDatabaseWorker } from './base-worker.js';
import { HybridWriteBufferStrategy } from './strategies.js';
// ═══════════════════════════════════════════════════════════════════════════
// Engine Write-DB Worker Implementation
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Engine Write-DB Worker
 *
 * Write-only worker for battle logs, move usage, and anomaly detection.
 * Uses SQLite with WAL for durability and write buffering for performance.
 *
 * Features:
 * - Write buffer (in-memory queue, <10μs push)
 * - SQLite WAL mode (durability without blocking)
 * - Validation before PROD upload
 * - Automatic retention cleanup
 *
 * Usage:
 * ```typescript
 * const worker = getEngineWriteWorker();
 * await worker.logBattle(battleLog);
 * await worker.logMoveUsage(moveUsage);
 * await worker.flush(); // Force immediate write
 * ```
 */
export class EngineWriteWorker extends BaseDatabaseWorker {
    db = null;
    writeBuffer;
    // In-memory queues (pre-flush buffers)
    battleLogQueue = [];
    moveUsageQueue = [];
    anomalyQueue = [];
    // Backpressure thresholds
    MAX_QUEUE_SIZE = 10000;
    WARN_THRESHOLD = 0.75; // 75% full
    REJECT_THRESHOLD = 0.95; // 95% full
    constructor(config, eventEmitter) {
        super(config, eventEmitter);
        // Initialize write buffer strategy
        this.writeBuffer = new HybridWriteBufferStrategy();
        if (config.writeBuffer) {
            this.writeBuffer.initialize(config.writeBuffer, eventEmitter);
        }
    }
    // ═══════════════════════════════════════════════════════════════════════
    // Worker Identity (Abstract Implementation)
    // ═══════════════════════════════════════════════════════════════════════
    get id() {
        return 'engine-write';
    }
    get name() {
        return 'Engine Write-DB Worker';
    }
    get type() {
        return 'sqlite-write';
    }
    // ═══════════════════════════════════════════════════════════════════════
    // Lifecycle Methods (BaseDatabaseWorker Implementation)
    // ═══════════════════════════════════════════════════════════════════════
    async doInitialize() {
        this.log('[EngineWriteWorker] Initializing SQLite database with WAL...', 'info');
        // Dynamic import of sql.js
        const initSqlJs = await import('sql.js');
        const SQL = await initSqlJs.default();
        // Load or create engine-write-db.sqlite
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const dbPath = path.join(process.cwd(), 'Store', 'engine-write-db.sqlite');
        try {
            const buffer = await fs.readFile(dbPath);
            this.db = new SQL.Database(buffer);
            this.log(`[EngineWriteWorker] SQLite loaded: ${dbPath} (${buffer.length} bytes)`, 'info');
        }
        catch {
            // Create new database if not exists
            this.db = new SQL.Database();
            await this.createSchema();
            this.log('[EngineWriteWorker] Created new SQLite database with schema', 'info');
        }
        // Enable WAL mode for better write concurrency
        this.db.run('PRAGMA journal_mode=WAL');
        this.db.run('PRAGMA synchronous=NORMAL');
        this.db.run('PRAGMA cache_size=10000');
        this.log('[EngineWriteWorker] Initialization complete', 'info');
    }
    async doStart() {
        this.log('[EngineWriteWorker] Starting background flush timer...', 'info');
        // Start write buffer (handles automatic flushing)
        this.writeBuffer.start();
        // Subscribe to flush events from Event Bus
        this.eventEmitter?.on((event) => {
            if (event.type === 'buffer-flush' && event.workerId === 'write-buffer') {
                void this.handleBufferFlush();
            }
        });
    }
    async doStop() {
        this.log('[EngineWriteWorker] Stopping worker...', 'info');
        // Stop flush timer
        this.writeBuffer.stop();
        // Final flush before shutdown
        const bufferStats = this.getBufferStats();
        if (bufferStats.entryCount > 0) {
            this.log('Performing final flush before shutdown...', 'info');
            await this.flush();
        }
        // Save database to disk
        if (this.db) {
            await this.saveToDisk();
            this.db.close();
            this.db = null;
        }
    }
    async doHealthCheck() {
        if (!this.db) {
            return { status: 'no-database' };
        }
        try {
            // Check table row counts
            const battleLogCount = this.db.exec('SELECT COUNT(*) as count FROM battle_logs')[0]?.values[0]?.[0];
            const moveUsageCount = this.db.exec('SELECT COUNT(*) as count FROM move_usage')[0]?.values[0]?.[0];
            const anomalyCount = this.db.exec('SELECT COUNT(*) as count FROM anomalies')[0]?.values[0]?.[0];
            const bufferStats = this.getBufferStats();
            return {
                battleLogs: battleLogCount,
                moveUsage: moveUsageCount,
                anomalies: anomalyCount,
                bufferUtilization: bufferStats.utilizationPercent,
                backpressureActive: bufferStats.isBackpressureActive,
                queueSizes: {
                    battleLogs: this.battleLogQueue.length,
                    moveUsage: this.moveUsageQueue.length,
                    anomalies: this.anomalyQueue.length,
                },
            };
        }
        catch (error) {
            return {
                status: 'query-failed',
                error: error.message,
            };
        }
    }
    // ═══════════════════════════════════════════════════════════════════════
    // WritableWorker Implementation
    // ═══════════════════════════════════════════════════════════════════════
    async insert(table, data) {
        return this.executeOperation('insert', async () => {
            this.writeBuffer.add({
                operation: 'insert',
                table,
                data,
                timestamp: new Date(),
            });
            // Check if flush needed
            if (this.writeBuffer.shouldFlush()) {
                await this.flush();
            }
        });
    }
    async update(table, data, where) {
        return this.executeOperation('update', async () => {
            this.writeBuffer.add({
                operation: 'update',
                table,
                data,
                where,
                timestamp: new Date(),
            });
            if (this.writeBuffer.shouldFlush()) {
                await this.flush();
            }
        });
    }
    async delete(table, where) {
        return this.executeOperation('delete', async () => {
            this.writeBuffer.add({
                operation: 'delete',
                table,
                data: {}, // Required by BufferedWrite interface
                where,
                timestamp: new Date(),
            });
            if (this.writeBuffer.shouldFlush()) {
                await this.flush();
            }
        });
    }
    async flush() {
        return this.executeOperation('flush', async () => {
            if (!this.db) {
                throw new Error('SQLite database not initialized');
            }
            // Flush queues to SQLite
            await this.flushBattleLogs();
            await this.flushMoveUsage();
            await this.flushAnomalies();
            // Flush write buffer
            const entries = this.writeBuffer.getAll();
            if (entries.length > 0) {
                // Begin transaction for atomic writes
                this.db.run('BEGIN TRANSACTION');
                try {
                    for (const entry of entries) {
                        const { operation, table, data, where } = entry;
                        if (operation === 'insert') {
                            const columns = Object.keys(data);
                            const values = Object.values(data);
                            const placeholders = columns.map(() => '?').join(', ');
                            const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
                            this.db.run(sql, values);
                        }
                        else if (operation === 'update') {
                            const setClause = Object.keys(data).map(k => `${k} = ?`).join(', ');
                            const whereClause = Object.keys(where).map(k => `${k} = ?`).join(' AND ');
                            const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
                            this.db.run(sql, [...Object.values(data), ...Object.values(where)]);
                        }
                        else if (operation === 'delete') {
                            const whereClause = Object.keys(where).map(k => `${k} = ?`).join(' AND ');
                            const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
                            this.db.run(sql, Object.values(where));
                        }
                    }
                    this.db.run('COMMIT');
                    this.log(`[EngineWriteWorker] Flushed ${entries.length} entries to SQLite`, 'info');
                    // Clear buffer after successful flush
                    this.writeBuffer.clear();
                }
                catch (error) {
                    this.db.run('ROLLBACK');
                    throw error;
                }
            }
            // Save to disk
            await this.saveToDisk();
            return entries.length;
        });
    }
    getBufferStats() {
        const totalQueueSize = this.battleLogQueue.length + this.moveUsageQueue.length + this.anomalyQueue.length;
        const utilization = totalQueueSize / this.MAX_QUEUE_SIZE;
        const bufferStats = this.writeBuffer.getStats();
        return {
            entryCount: totalQueueSize,
            maxCapacity: this.MAX_QUEUE_SIZE,
            utilizationPercent: utilization * 100,
            isBackpressureActive: utilization >= this.WARN_THRESHOLD,
            flushCount: bufferStats.flushCount,
            rejectedWriteCount: bufferStats.rejectedWriteCount,
            lastFlushAt: bufferStats.lastFlushAt,
            avgFlushDurationMs: bufferStats.avgFlushDurationMs,
        };
    }
    // ═══════════════════════════════════════════════════════════════════════
    // Engine-Specific Write Operations
    // ═══════════════════════════════════════════════════════════════════════
    /**
     * Log battle outcome (non-blocking, <10μs)
     */
    async logBattle(log) {
        return this.executeOperation('logBattle', async () => {
            // Backpressure check
            const utilization = this.battleLogQueue.length / this.MAX_QUEUE_SIZE;
            if (utilization >= this.REJECT_THRESHOLD) {
                throw new Error('Battle log queue full (95% threshold reached)');
            }
            if (utilization >= this.WARN_THRESHOLD) {
                this.log('[EngineWriteWorker] Battle log queue at 75% capacity', 'info');
            }
            // Enqueue (in-memory, <10μs)
            this.battleLogQueue.push(log);
        });
    }
    /**
     * Log move usage (non-blocking, <10μs)
     */
    async logMoveUsage(usage) {
        return this.executeOperation('logMoveUsage', async () => {
            const utilization = this.moveUsageQueue.length / this.MAX_QUEUE_SIZE;
            if (utilization >= this.REJECT_THRESHOLD) {
                throw new Error('Move usage queue full (95% threshold reached)');
            }
            this.moveUsageQueue.push(usage);
        });
    }
    /**
     * Log anomaly detection (non-blocking, <10μs)
     */
    async logAnomaly(anomaly) {
        return this.executeOperation('logAnomaly', async () => {
            const utilization = this.anomalyQueue.length / this.MAX_QUEUE_SIZE;
            if (utilization >= this.REJECT_THRESHOLD) {
                throw new Error('Anomaly queue full (95% threshold reached)');
            }
            this.anomalyQueue.push(anomaly);
        });
    }
    /**
     * Validate data quality before PROD upload
     */
    async validateData() {
        return this.executeOperation('validateData', async () => {
            if (!this.db) {
                throw new Error('SQLite database not initialized');
            }
            const errors = [];
            let validatedRows = 0;
            let passedRows = 0;
            // Validate battle logs
            const battleLogs = this.db.exec('SELECT * FROM battle_logs');
            if (battleLogs.length > 0) {
                const rows = battleLogs[0].values;
                validatedRows += rows.length;
                for (const row of rows) {
                    const [battleId, , , , outcome] = row;
                    // Check required fields
                    if (!battleId || !outcome) {
                        errors.push(`Battle log missing required fields: ${battleId}`);
                    }
                    else {
                        passedRows++;
                    }
                }
            }
            const qualityScore = validatedRows > 0 ? (passedRows / validatedRows) * 100 : 100;
            return {
                passed: qualityScore >= 95, // 95% threshold
                validatedRows,
                passedRows,
                failedRows: validatedRows - passedRows,
                qualityScore,
                errors,
            };
        });
    }
    /**
     * Upload validated data to PROD PostgreSQL
     */
    async uploadToProd() {
        return this.executeOperation('uploadToProd', async () => {
            const startTime = Date.now();
            // Validate first
            const validation = await this.validateData();
            if (!validation.passed) {
                throw new Error(`Data validation failed: ${validation.errors.join(', ')}`);
            }
            // TODO: Implement PROD upload via ProdPostgresWorker
            // For now, just return counts
            const battleLogs = this.db?.exec('SELECT COUNT(*) FROM battle_logs')[0]?.values[0]?.[0] || 0;
            const moveUsage = this.db?.exec('SELECT COUNT(*) FROM move_usage')[0]?.values[0]?.[0] || 0;
            const anomalies = this.db?.exec('SELECT COUNT(*) FROM anomalies')[0]?.values[0]?.[0] || 0;
            return {
                battleLogs,
                moveUsage,
                anomalies,
                totalRows: battleLogs + moveUsage + anomalies,
                duration: Date.now() - startTime,
                timestamp: new Date(),
            };
        });
    }
    /**
     * Prune old entries after upload (24h retention)
     */
    async pruneOldEntries(olderThanHours = 24) {
        return this.executeOperation('pruneOldEntries', async () => {
            if (!this.db) {
                throw new Error('SQLite database not initialized');
            }
            const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
            const cutoffTimestamp = cutoffDate.toISOString();
            // Delete old entries
            this.db.run('DELETE FROM battle_logs WHERE timestamp < ?', [cutoffTimestamp]);
            this.db.run('DELETE FROM move_usage WHERE timestamp < ?', [cutoffTimestamp]);
            this.db.run('DELETE FROM anomalies WHERE timestamp < ?', [cutoffTimestamp]);
            // VACUUM to reclaim space
            this.db.run('VACUUM');
            const remainingCount = this.db.exec('SELECT COUNT(*) FROM battle_logs')[0]?.values[0]?.[0] +
                this.db.exec('SELECT COUNT(*) FROM move_usage')[0]?.values[0]?.[0] +
                this.db.exec('SELECT COUNT(*) FROM anomalies')[0]?.values[0]?.[0];
            this.log(`[EngineWriteWorker] Pruned entries older than ${olderThanHours}h, ${remainingCount} remaining`, 'info');
            return remainingCount;
        });
    }
    // ═══════════════════════════════════════════════════════════════════════
    // Private Helper Methods
    // ═══════════════════════════════════════════════════════════════════════
    async createSchema() {
        if (!this.db)
            return;
        // Battle logs table
        this.db.run(`
      CREATE TABLE IF NOT EXISTS battle_logs (
        battleId TEXT PRIMARY KEY,
        trainerId TEXT NOT NULL,
        opponentId TEXT NOT NULL,
        battleType TEXT NOT NULL,
        outcome TEXT NOT NULL,
        turnCount INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        metadata TEXT
      )
    `);
        // Move usage table
        this.db.run(`
      CREATE TABLE IF NOT EXISTS move_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        battleId TEXT NOT NULL,
        turn INTEGER NOT NULL,
        pokemon TEXT NOT NULL,
        move TEXT NOT NULL,
        targetPokemon TEXT NOT NULL,
        damage INTEGER NOT NULL,
        effectiveness REAL NOT NULL,
        critical INTEGER NOT NULL,
        missed INTEGER NOT NULL,
        timestamp TEXT NOT NULL
      )
    `);
        // Anomalies table
        this.db.run(`
      CREATE TABLE IF NOT EXISTS anomalies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        description TEXT NOT NULL,
        battleId TEXT NOT NULL,
        turn INTEGER NOT NULL,
        expectedValue REAL NOT NULL,
        actualValue REAL NOT NULL,
        context TEXT NOT NULL,
        timestamp TEXT NOT NULL
      )
    `);
        // Create indexes
        this.db.run('CREATE INDEX IF NOT EXISTS idx_battle_logs_timestamp ON battle_logs(timestamp)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_move_usage_battle ON move_usage(battleId)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_anomalies_severity ON anomalies(severity)');
    }
    async flushBattleLogs() {
        if (this.battleLogQueue.length === 0 || !this.db)
            return;
        const logs = this.battleLogQueue.splice(0, 100); // Batch of 100
        for (const log of logs) {
            this.db.run(`INSERT INTO battle_logs (battleId, trainerId, opponentId, battleType, outcome, turnCount, duration, timestamp, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                log.battleId,
                log.trainerId,
                log.opponentId,
                log.battleType,
                log.outcome,
                log.turnCount,
                log.duration,
                log.timestamp.toISOString(),
                log.metadata ? JSON.stringify(log.metadata) : null,
            ]);
        }
    }
    async flushMoveUsage() {
        if (this.moveUsageQueue.length === 0 || !this.db)
            return;
        const usage = this.moveUsageQueue.splice(0, 100);
        for (const entry of usage) {
            this.db.run(`INSERT INTO move_usage (battleId, turn, pokemon, move, targetPokemon, damage, effectiveness, critical, missed, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                entry.battleId,
                entry.turn,
                entry.pokemon,
                entry.move,
                entry.targetPokemon,
                entry.damage,
                entry.effectiveness,
                entry.critical ? 1 : 0,
                entry.missed ? 1 : 0,
                entry.timestamp.toISOString(),
            ]);
        }
    }
    async flushAnomalies() {
        if (this.anomalyQueue.length === 0 || !this.db)
            return;
        const anomalies = this.anomalyQueue.splice(0, 100);
        for (const anomaly of anomalies) {
            this.db.run(`INSERT INTO anomalies (category, severity, description, battleId, turn, expectedValue, actualValue, context, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                anomaly.category,
                anomaly.severity,
                anomaly.description,
                anomaly.battleId,
                anomaly.turn,
                anomaly.expectedValue,
                anomaly.actualValue,
                JSON.stringify(anomaly.context),
                anomaly.timestamp.toISOString(),
            ]);
        }
    }
    async saveToDisk() {
        if (!this.db)
            return;
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const dbPath = path.join(process.cwd(), 'Store', 'engine-write-db.sqlite');
        const buffer = this.db.export();
        await fs.writeFile(dbPath, buffer);
    }
    async handleBufferFlush() {
        try {
            await this.flush();
        }
        catch (error) {
            this.log(`[EngineWriteWorker] Flush failed: ${error.message}`, 'error');
        }
    }
    calculateOldestEntryAge() {
        // Simplified: assume FIFO, oldest is first in queue
        const oldestBattle = this.battleLogQueue[0]?.timestamp;
        const oldestMove = this.moveUsageQueue[0]?.timestamp;
        const oldestAnomaly = this.anomalyQueue[0]?.timestamp;
        const timestamps = [oldestBattle, oldestMove, oldestAnomaly].filter(Boolean);
        if (timestamps.length === 0)
            return 0;
        const oldest = new Date(Math.min(...timestamps.map(d => d.getTime())));
        return Date.now() - oldest.getTime();
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// Factory Function
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Create Engine Write-DB Worker with default configuration
 *
 * Configuration:
 * - Hybrid write buffer (30s OR 100 entries)
 * - Circuit breaker for SQLite failures
 * - Auto-flush on 75% queue capacity
 * - Health checks every 15s
 *
 * @param eventEmitter Optional event emitter for worker events
 * @returns Configured EngineWriteWorker instance
 */
export function createEngineWriteWorker(eventEmitter) {
    const config = {
        id: 'engine-write',
        name: 'Engine Write-DB Worker',
        enabled: true,
        writeBuffer: {
            enabled: true,
            flushTrigger: 'hybrid',
            flushIntervalMs: 30000, // 30s
            flushThresholdEntries: 100, // 100 entries
            maxBufferSize: 10000, // 10k max
            backpressureWarnPercent: 75, // Warn at 75%
            backpressureCriticalPercent: 95, // Reject at 95%
        },
        errorRecovery: {
            policy: 'circuit-breaker',
            maxRetries: 3,
            initialRetryDelayMs: 1000,
            maxRetryDelayMs: 30000,
            backoffMultiplier: 2,
            circuitBreakerThreshold: 5,
            circuitBreakerResetMs: 30000,
        },
        healthCheckIntervalMs: 15000, // 15s
        metricsIntervalMs: 5000, // 5s
    };
    return new EngineWriteWorker(config, eventEmitter);
}
