/**
 * Database Worker Module
 * 
 * Centralized database access layer with intelligent caching,
 * write buffering, and comprehensive monitoring.
 * 
 * @module workers/database
 */

// Core types and interfaces
export type {
  DatabaseWorker,
  QueryableWorker,
  WritableWorker,
  TransactionalWorker,
  TransactionContext,
  WorkerHealth,
  WorkerMetrics,
  WorkerConfig,
  WorkerEvent,
  WorkerEventListener,
  WorkerEventEmitter,
  WorkerHealthStatus,
  CacheConfig,
  CacheStats,
  CacheEvictionPolicy,
  WriteBufferConfig,
  BufferStats,
  BufferFlushTrigger,
  ErrorRecoveryConfig,
  ErrorRecoveryStats,
  ErrorRecoveryPolicy,
} from './types.js';

// Strategy implementations
export {
  LRUCacheStrategy,
  HybridWriteBufferStrategy,
  CircuitBreakerStrategy,
} from './strategies.js';
export type {
  CacheStrategy,
  CacheEntry,
  WriteBufferStrategy,
  BufferedWrite,
  ErrorRecoveryStrategy,
} from './strategies.js';

// Base worker class
export { BaseDatabaseWorker } from './base-worker.js';

// Concrete worker implementations
export { ProdPostgresWorker, createProdPostgresWorker } from './prod-postgres-worker.js';
export { TimescaleDBWorker, createTimescaleDBWorker } from './timescaledb-worker.js';
export type { LogEvent, ErrorReport, MaterializedViewName } from './timescaledb-worker.js';
export { MATERIALIZED_VIEWS } from './timescaledb-worker.js';
export { EngineReadWorker, createEngineReadWorker } from './engine-read-worker.js';
export type { Pokemon, Move, TypeEffectiveness } from './engine-read-worker.js';
export { EngineWriteWorker, createEngineWriteWorker } from './engine-write-worker.js';
export type {
  BattleLog,
  MoveUsage,
  Anomaly,
  ValidationResult,
  UploadSummary,
} from './engine-write-worker.js';

// Worker instances (singleton pattern)
import type { ProdPostgresWorker } from './prod-postgres-worker.js';
import { createProdPostgresWorker } from './prod-postgres-worker.js';
import type { TimescaleDBWorker } from './timescaledb-worker.js';
import { createTimescaleDBWorker } from './timescaledb-worker.js';
import type { EngineReadWorker } from './engine-read-worker.js';
import { createEngineReadWorker } from './engine-read-worker.js';
import type { EngineWriteWorker } from './engine-write-worker.js';
import { createEngineWriteWorker } from './engine-write-worker.js';

let prodPostgresWorkerInstance: ProdPostgresWorker | null = null;
let timescaleDBWorkerInstance: TimescaleDBWorker | null = null;
let engineReadWorkerInstance: EngineReadWorker | null = null;
let engineWriteWorkerInstance: EngineWriteWorker | null = null;

/**
 * Get or create PROD PostgreSQL worker instance.
 * Uses singleton pattern to ensure single connection pool.
 */
export function getProdPostgresWorker(): ProdPostgresWorker {
  if (!prodPostgresWorkerInstance) {
    prodPostgresWorkerInstance = createProdPostgresWorker();
  }
  return prodPostgresWorkerInstance;
}

/**
 * Get or create TimescaleDB worker instance.
 * Uses singleton pattern to ensure single connection pool.
 */
export function getTimescaleDBWorker(): TimescaleDBWorker {
  if (!timescaleDBWorkerInstance) {
    timescaleDBWorkerInstance = createTimescaleDBWorker();
  }
  return timescaleDBWorkerInstance;
}

/**
 * Get or create Engine Read-DB worker instance.
 * Uses singleton pattern to ensure single SQLite connection.
 */
export function getEngineReadWorker(): EngineReadWorker {
  if (!engineReadWorkerInstance) {
    engineReadWorkerInstance = createEngineReadWorker();
  }
  return engineReadWorkerInstance;
}

/**
 * Get or create Engine Write-DB worker instance.
 * Uses singleton pattern to ensure single SQLite connection.
 */
export function getEngineWriteWorker(): EngineWriteWorker {
  if (!engineWriteWorkerInstance) {
    engineWriteWorkerInstance = createEngineWriteWorker();
  }
  return engineWriteWorkerInstance;
}

/**
 * Reset worker instances (useful for testing).
 */
export function resetWorkerInstances(): void {
  prodPostgresWorkerInstance = null;
  timescaleDBWorkerInstance = null;
  engineReadWorkerInstance = null;
  engineWriteWorkerInstance = null;
}
