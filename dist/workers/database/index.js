/**
 * Database Worker Module
 *
 * Centralized database access layer with intelligent caching,
 * write buffering, and comprehensive monitoring.
 *
 * @module workers/database
 */
// Strategy implementations
export { LRUCacheStrategy, HybridWriteBufferStrategy, CircuitBreakerStrategy, } from './strategies.js';
// Base worker class
export { BaseDatabaseWorker } from './base-worker.js';
// Concrete worker implementations
export { ProdPostgresWorker, createProdPostgresWorker } from './prod-postgres-worker.js';
export { TimescaleDBWorker, createTimescaleDBWorker } from './timescaledb-worker.js';
export { MATERIALIZED_VIEWS } from './timescaledb-worker.js';
export { EngineReadWorker, createEngineReadWorker } from './engine-read-worker.js';
export { EngineWriteWorker, createEngineWriteWorker } from './engine-write-worker.js';
import { createProdPostgresWorker } from './prod-postgres-worker.js';
import { createTimescaleDBWorker } from './timescaledb-worker.js';
import { createEngineReadWorker } from './engine-read-worker.js';
import { createEngineWriteWorker } from './engine-write-worker.js';
let prodPostgresWorkerInstance = null;
let timescaleDBWorkerInstance = null;
let engineReadWorkerInstance = null;
let engineWriteWorkerInstance = null;
/**
 * Get or create PROD PostgreSQL worker instance.
 * Uses singleton pattern to ensure single connection pool.
 */
export function getProdPostgresWorker() {
    if (!prodPostgresWorkerInstance) {
        prodPostgresWorkerInstance = createProdPostgresWorker();
    }
    return prodPostgresWorkerInstance;
}
/**
 * Get or create TimescaleDB worker instance.
 * Uses singleton pattern to ensure single connection pool.
 */
export function getTimescaleDBWorker() {
    if (!timescaleDBWorkerInstance) {
        timescaleDBWorkerInstance = createTimescaleDBWorker();
    }
    return timescaleDBWorkerInstance;
}
/**
 * Get or create Engine Read-DB worker instance.
 * Uses singleton pattern to ensure single SQLite connection.
 */
export function getEngineReadWorker() {
    if (!engineReadWorkerInstance) {
        engineReadWorkerInstance = createEngineReadWorker();
    }
    return engineReadWorkerInstance;
}
/**
 * Get or create Engine Write-DB worker instance.
 * Uses singleton pattern to ensure single SQLite connection.
 */
export function getEngineWriteWorker() {
    if (!engineWriteWorkerInstance) {
        engineWriteWorkerInstance = createEngineWriteWorker();
    }
    return engineWriteWorkerInstance;
}
/**
 * Reset worker instances (useful for testing).
 */
export function resetWorkerInstances() {
    prodPostgresWorkerInstance = null;
    timescaleDBWorkerInstance = null;
    engineReadWorkerInstance = null;
    engineWriteWorkerInstance = null;
}
