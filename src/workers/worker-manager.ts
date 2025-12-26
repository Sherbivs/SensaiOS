/**
 * Worker Manager — Orchestration Layer for Database Workers
 * 
 * Purpose:
 * - Coordinate lifecycle of all database workers (init, start, stop)
 * - Manage dependencies between workers (initialization order)
 * - Handle graceful shutdown with proper cleanup sequencing
 * - Report orchestration events to kernel for unified observation
 * 
 * Architecture:
 * - 4 Workers: PROD PostgreSQL, TimescaleDB, Engine Read-DB, Engine Write-DB
 * - Initialization Order: PROD → TimescaleDB → Engine Read → Engine Write
 * - Shutdown Order: Reverse of initialization (Write → Read → TimescaleDB → PROD)
 * 
 * Integration:
 * - Used by: src/index.ts (application startup)
 * - Simplicity: Focused on lifecycle only, no complex event/metrics aggregation
 * - Kernel: Reports orchestration events for unified observation
 * 
 * Performance Targets:
 * - Initialization: <5s (sequential worker startup)
 * - Graceful shutdown: <10s (flush buffers, close connections)
 * 
 * @module workers/worker-manager
 */

// KERNEL FIRST — Must be first import to monitor other system initialization
import type { WorkerHook } from '../kernel/kernel-hooks.js';
import { createWorkerHook } from '../kernel/kernel-hooks.js';

// LOGGER SECOND — Must be early import to capture initialization errors
import { getLogger, errorContext } from '../shared/logging/index.js';
const logger = getLogger();

import {
  getProdPostgresWorker,
  getTimescaleDBWorker,
  getEngineReadWorker,
  getEngineWriteWorker,
} from './database/index.js';
import type {
  ProdPostgresWorker,
  TimescaleDBWorker,
  EngineReadWorker,
  EngineWriteWorker,
} from './database/index.js';

// ============================================================================
// KERNEL INTEGRATION (Lazy Hook Pattern)
// ============================================================================
// WorkerManager reports orchestration lifecycle events UP to kernel

// Lazy initialization to avoid boot-time circular dependencies
let kernelHook: WorkerHook | null = null;

/**
 * Get or create the kernel hook (lazy singleton pattern).
 * Returns null if kernel hook creation fails (manager continues without kernel reporting).
 */
function getKernelHook(): WorkerHook | null {
  if (!kernelHook) {
    try {
      kernelHook = createWorkerHook('worker-manager');
    } catch {
      // Kernel hook creation failed - manager continues without kernel reporting
    }
  }
  return kernelHook;
}

/**
 * Worker Manager — Orchestrates all database workers.
 */
export class WorkerManager {
  private prodPostgresWorker: ProdPostgresWorker | null = null;
  private timescaleDBWorker: TimescaleDBWorker | null = null;
  private engineReadWorker: EngineReadWorker | null = null;
  private engineWriteWorker: EngineWriteWorker | null = null;
  
  private initialized = false;
  private started = false;
  
  /**
   * Initialize all workers in dependency order.
   * Order: PROD → TimescaleDB → Engine Read → Engine Write
   */
  async initializeAll(): Promise<void> {
    if (this.initialized) {
      logger.warn('WorkerManager', 'initializeAll', 'Already initialized');
      return;
    }
    
    logger.info('WorkerManager', 'initializeAll', 'Starting initialization...');
    const startTime = Date.now();
    
    // Report to kernel: orchestration starting
    getKernelHook()?.status('EXECUTING', { phase: 'initializeAll', workerCount: 4 });
    
    try {
      // Step 1: Initialize PROD PostgreSQL (foundation for all queries)
      logger.info('WorkerManager', 'initializeAll', '[1/4] Initializing PROD PostgreSQL Worker...');
      this.prodPostgresWorker = getProdPostgresWorker();
      await this.prodPostgresWorker.initialize();
      
      // Step 2: Initialize TimescaleDB (log ingestion, error tracking)
      logger.info('WorkerManager', 'initializeAll', '[2/4] Initializing TimescaleDB Worker...');
      this.timescaleDBWorker = getTimescaleDBWorker();
      await this.timescaleDBWorker.initialize();
      
      // Step 3: Initialize Engine Read-DB (Pokémon data cache)
      logger.info('WorkerManager', 'initializeAll', '[3/4] Initializing Engine Read-DB Worker...');
      this.engineReadWorker = getEngineReadWorker();
      await this.engineReadWorker.initialize();
      
      // Step 4: Initialize Engine Write-DB (battle log tracking)
      logger.info('WorkerManager', 'initializeAll', '[4/4] Initializing Engine Write-DB Worker...');
      this.engineWriteWorker = getEngineWriteWorker();
      await this.engineWriteWorker.initialize();
      
      this.initialized = true;
      
      const duration = Date.now() - startTime;
      logger.info('WorkerManager', 'initializeAll', `✅ All workers initialized in ${duration}ms`, { metadata: { durationMs: duration } });
      
      // Report to kernel: orchestration complete
      getKernelHook()?.execution('initializeAll', duration, true, { workerCount: 4 });
      getKernelHook()?.status('STARTED', { phase: 'initialized', workerCount: 4 });
    } catch (error) {
      logger.error('WorkerManager', 'initializeAll', '❌ Initialization failed', errorContext(error as Error));
      
      // Report to kernel: orchestration failed
      const duration = Date.now() - startTime;
      getKernelHook()?.execution('initializeAll', duration, false, { error: (error as Error).message });
      getKernelHook()?.status('ERROR', { phase: 'initializeAll', error: (error as Error).message });
      throw error;
    }
  }
  
  /**
   * Start all workers (background tasks, timers, subscriptions).
   */
  async startAll(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Workers not initialized. Call initializeAll() first.');
    }
    
    if (this.started) {
      logger.warn('WorkerManager', 'startAll', 'Already started');
      return;
    }
    
    logger.info('WorkerManager', 'startAll', 'Starting all workers...');
    const startTime = Date.now();
    
    // Report to kernel: start phase beginning
    getKernelHook()?.status('EXECUTING', { phase: 'startAll', workerCount: 4 });
    
    try {
      // Start all workers (parallel execution)
      await Promise.all([
        this.prodPostgresWorker!.start(),
        this.timescaleDBWorker!.start(),
        this.engineReadWorker!.start(),
        this.engineWriteWorker!.start(),
      ]);
      
      this.started = true;
      const duration = Date.now() - startTime;
      logger.info('WorkerManager', 'startAll', '✅ All workers started');
      
      // Report to kernel: start phase complete
      getKernelHook()?.execution('startAll', duration, true, { workerCount: 4 });
    } catch (error) {
      logger.error('WorkerManager', 'startAll', '❌ Start failed', errorContext(error as Error));
      
      // Report to kernel: start phase failed
      const duration = Date.now() - startTime;
      getKernelHook()?.execution('startAll', duration, false, { error: (error as Error).message });
      getKernelHook()?.status('ERROR', { phase: 'startAll', error: (error as Error).message });
      throw error;
    }
  }
  
  /**
   * Stop all workers (graceful shutdown with proper sequencing).
   * Order: Write → Read → TimescaleDB → PROD (reverse of initialization)
   */
  async stopAll(): Promise<void> {
    if (!this.started) {
      logger.warn('WorkerManager', 'stopAll', 'Not started, nothing to stop');
      return;
    }
    
    logger.info('WorkerManager', 'stopAll', 'Stopping all workers...');
    const startTime = Date.now();
    
    // Report to kernel: shutdown phase beginning
    getKernelHook()?.status('EXECUTING', { phase: 'stopAll', workerCount: 4 });
    
    try {
      // Stop workers in reverse order (sequential for proper cleanup)
      if (this.engineWriteWorker) {
        logger.info('WorkerManager', 'stopAll', '[1/4] Stopping Engine Write-DB Worker...');
        await this.engineWriteWorker.stop();
      }
      
      if (this.engineReadWorker) {
        logger.info('WorkerManager', 'stopAll', '[2/4] Stopping Engine Read-DB Worker...');
        await this.engineReadWorker.stop();
      }
      
      if (this.timescaleDBWorker) {
        logger.info('WorkerManager', 'stopAll', '[3/4] Stopping TimescaleDB Worker...');
        await this.timescaleDBWorker.stop();
      }
      
      if (this.prodPostgresWorker) {
        logger.info('WorkerManager', 'stopAll', '[4/4] Stopping PROD PostgreSQL Worker...');
        await this.prodPostgresWorker.stop();
      }
      
      this.started = false;
      const duration = Date.now() - startTime;
      logger.info('WorkerManager', 'stopAll', '✅ All workers stopped');
      
      // Report to kernel: shutdown phase complete
      getKernelHook()?.execution('stopAll', duration, true, { workerCount: 4 });
      getKernelHook()?.status('STOPPED', { phase: 'stopped', workerCount: 4 });
    } catch (error) {
      logger.error('WorkerManager', 'stopAll', '❌ Stop failed', errorContext(error as Error));
      
      // Report to kernel: shutdown phase failed
      const duration = Date.now() - startTime;
      getKernelHook()?.execution('stopAll', duration, false, { error: (error as Error).message });
      getKernelHook()?.status('ERROR', { phase: 'stopAll', error: (error as Error).message });
      throw error;
    }
  }
  
  /**
   * Get current initialization status.
   */
  isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * Get current running status.
   */
  isStarted(): boolean {
    return this.started;
  }
  
  /**
   * Get individual worker instances (for direct access if needed).
   */
  getWorkers(): {
    prodPostgres: ProdPostgresWorker | null;
    timescaleDB: TimescaleDBWorker | null;
    engineRead: EngineReadWorker | null;
    engineWrite: EngineWriteWorker | null;
  } {
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

let workerManagerInstance: WorkerManager | null = null;

/**
 * Get or create Worker Manager instance (singleton pattern).
 */
export function getWorkerManager(): WorkerManager {
  if (!workerManagerInstance) {
    workerManagerInstance = new WorkerManager();
  }
  return workerManagerInstance;
}

/**
 * Reset Worker Manager instance (useful for testing).
 */
export function resetWorkerManager(): void {
  workerManagerInstance = null;
}
