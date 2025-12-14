/* eslint-disable no-console */
/**
 * Worker Manager — Orchestration Layer for Database Workers
 *
 * Purpose:
 * - Coordinate lifecycle of all database workers (init, start, stop)
 * - Manage dependencies between workers (initialization order)
 * - Handle graceful shutdown with proper cleanup sequencing
 *
 * Architecture:
 * - 4 Workers: PROD PostgreSQL, TimescaleDB, Engine Read-DB, Engine Write-DB
 * - Initialization Order: PROD → TimescaleDB → Engine Read → Engine Write
 * - Shutdown Order: Reverse of initialization (Write → Read → TimescaleDB → PROD)
 *
 * Integration:
 * - Used by: src/index.ts (application startup)
 * - Simplicity: Focused on lifecycle only, no complex event/metrics aggregation
 *
 * Performance Targets:
 * - Initialization: <5s (sequential worker startup)
 * - Graceful shutdown: <10s (flush buffers, close connections)
 *
 * @module workers/worker-manager
 */
import { getProdPostgresWorker, getTimescaleDBWorker, getEngineReadWorker, getEngineWriteWorker, } from './database/index.js';
/**
 * Worker Manager — Orchestrates all database workers.
 */
export class WorkerManager {
    prodPostgresWorker = null;
    timescaleDBWorker = null;
    engineReadWorker = null;
    engineWriteWorker = null;
    initialized = false;
    started = false;
    /**
     * Initialize all workers in dependency order.
     * Order: PROD → TimescaleDB → Engine Read → Engine Write
     */
    async initializeAll() {
        if (this.initialized) {
            console.warn('[WorkerManager] Already initialized');
            return;
        }
        console.log('[WorkerManager] Starting initialization...');
        const startTime = Date.now();
        try {
            // Step 1: Initialize PROD PostgreSQL (foundation for all queries)
            console.log('[WorkerManager] [1/4] Initializing PROD PostgreSQL Worker...');
            this.prodPostgresWorker = getProdPostgresWorker();
            await this.prodPostgresWorker.initialize();
            // Step 2: Initialize TimescaleDB (log ingestion, error tracking)
            console.log('[WorkerManager] [2/4] Initializing TimescaleDB Worker...');
            this.timescaleDBWorker = getTimescaleDBWorker();
            await this.timescaleDBWorker.initialize();
            // Step 3: Initialize Engine Read-DB (Pokémon data cache)
            console.log('[WorkerManager] [3/4] Initializing Engine Read-DB Worker...');
            this.engineReadWorker = getEngineReadWorker();
            await this.engineReadWorker.initialize();
            // Step 4: Initialize Engine Write-DB (battle log tracking)
            console.log('[WorkerManager] [4/4] Initializing Engine Write-DB Worker...');
            this.engineWriteWorker = getEngineWriteWorker();
            await this.engineWriteWorker.initialize();
            this.initialized = true;
            const duration = Date.now() - startTime;
            console.log(`[WorkerManager] ✅ All workers initialized in ${duration}ms`);
        }
        catch (error) {
            console.error('[WorkerManager] ❌ Initialization failed:', error);
            throw error;
        }
    }
    /**
     * Start all workers (background tasks, timers, subscriptions).
     */
    async startAll() {
        if (!this.initialized) {
            throw new Error('Workers not initialized. Call initializeAll() first.');
        }
        if (this.started) {
            console.warn('[WorkerManager] Already started');
            return;
        }
        console.log('[WorkerManager] Starting all workers...');
        try {
            // Start all workers (parallel execution)
            await Promise.all([
                this.prodPostgresWorker.start(),
                this.timescaleDBWorker.start(),
                this.engineReadWorker.start(),
                this.engineWriteWorker.start(),
            ]);
            this.started = true;
            console.log('[WorkerManager] ✅ All workers started');
        }
        catch (error) {
            console.error('[WorkerManager] ❌ Start failed:', error);
            throw error;
        }
    }
    /**
     * Stop all workers (graceful shutdown with proper sequencing).
     * Order: Write → Read → TimescaleDB → PROD (reverse of initialization)
     */
    async stopAll() {
        if (!this.started) {
            console.warn('[WorkerManager] Not started, nothing to stop');
            return;
        }
        console.log('[WorkerManager] Stopping all workers...');
        try {
            // Stop workers in reverse order (sequential for proper cleanup)
            if (this.engineWriteWorker) {
                console.log('[WorkerManager] [1/4] Stopping Engine Write-DB Worker...');
                await this.engineWriteWorker.stop();
            }
            if (this.engineReadWorker) {
                console.log('[WorkerManager] [2/4] Stopping Engine Read-DB Worker...');
                await this.engineReadWorker.stop();
            }
            if (this.timescaleDBWorker) {
                console.log('[WorkerManager] [3/4] Stopping TimescaleDB Worker...');
                await this.timescaleDBWorker.stop();
            }
            if (this.prodPostgresWorker) {
                console.log('[WorkerManager] [4/4] Stopping PROD PostgreSQL Worker...');
                await this.prodPostgresWorker.stop();
            }
            this.started = false;
            console.log('[WorkerManager] ✅ All workers stopped');
        }
        catch (error) {
            console.error('[WorkerManager] ❌ Stop failed:', error);
            throw error;
        }
    }
    /**
     * Get current initialization status.
     */
    isInitialized() {
        return this.initialized;
    }
    /**
     * Get current running status.
     */
    isStarted() {
        return this.started;
    }
    /**
     * Get individual worker instances (for direct access if needed).
     */
    getWorkers() {
        return {
            prodPostgres: this.prodPostgresWorker,
            timescaleDB: this.timescaleDBWorker,
            engineRead: this.engineReadWorker,
            engineWrite: this.engineWriteWorker,
        };
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════
let workerManagerInstance = null;
/**
 * Get or create Worker Manager instance (singleton pattern).
 */
export function getWorkerManager() {
    if (!workerManagerInstance) {
        workerManagerInstance = new WorkerManager();
    }
    return workerManagerInstance;
}
/**
 * Reset Worker Manager instance (useful for testing).
 */
export function resetWorkerManager() {
    workerManagerInstance = null;
}
