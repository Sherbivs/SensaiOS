/**
 * PostgreSQL Connection Manager
 *
 * UNIFIED ARCHITECTURE: Single production database (Render-managed PostgreSQL)
 * Maintains PROD (production database) and LOCAL (optional workstation) connection pools.
 *
 * Key Features:
 * - <50ms latency for PROD node gameplay operations
 * - Heartbeat monitoring and telemetry
 * - Graceful shutdown with connection draining
 * - Automatic reconnection on failure
 *
 * Architecture:
 * - PROD Pool: Connected to PROD_DATABASE_URL (PRIMARY for all operations - Render managed database)
 * - LOCAL Pool: Connected to DATABASE_ONPREMISE_DEV_PRIMARY (optional workstation mirror)
 */
import pg from 'pg';
import { log } from './log.js';
import { getErrorMessage } from './utils/error-utils.js';
const { Pool } = pg;
// ============================================================================
// Connection Manager Class
// ============================================================================
export class PostgresConnection {
    prodPool = null;
    localPool = null;
    heartbeatInterval = null;
    stats = {
        prod: this.createEmptyStats(),
        local: this.createEmptyStats(),
    };
    /**
     * Initialize connection pools from configuration.
     *
     * @param config - Database URLs for each environment
     * @throws Error if no valid database URLs provided
     */
    async initialize(config) {
        const { prod, local } = config;
        // PROD is PRIMARY for all operations - must exist
        if (!prod) {
            throw new Error('PROD_DATABASE_URL is required for all database operations. ' +
                'Ensure render.yaml sets this to the Render-managed PostgreSQL connection string.');
        }
        // Create PROD pool (PRIMARY)
        this.prodPool = this.createPool(prod, 'PROD');
        await this.testConnection(this.prodPool, 'prod');
        // Create LOCAL pool (optional workstation mirror)
        if (local) {
            this.localPool = this.createPool(local, 'LOCAL');
            await this.testConnection(this.localPool, 'local');
        }
        // Start heartbeat monitoring (every 15 seconds)
        this.startHeartbeat();
        log.info('');
        log.info('[PostgreSQL] Connection pools initialized');
        log.info(`  PROD:  ${this.prodPool ? 'enabled' : 'disabled'}`);
        log.info(`  LOCAL: ${this.localPool ? 'enabled' : 'disabled'}`);
        log.info('');
    }
    /**
     * Get PROD database pool (PRIMARY for all operations).
     *
     * This is the Render-managed PostgreSQL providing database access for battles, encounters, etc.
     *
     * @returns pg.Pool instance
     * @throws Error if PROD pool not initialized
     */
    getProdClient() {
        if (!this.prodPool) {
            throw new Error('PROD database pool not initialized. This should never happen.');
        }
        return this.prodPool;
    }
    /**
     * Get LOCAL database pool (optional workstation mirror).
     *
     * @returns pg.Pool instance
     * @throws Error if LOCAL pool not initialized
     */
    getLocalClient() {
        if (!this.localPool) {
            throw new Error('LOCAL database pool not initialized. Check DATABASE_ONPREMISE_DEV_PRIMARY configuration.');
        }
        return this.localPool;
    }
    /**
     * Get current statistics for all database connections.
     *
     * @returns DualDbStats with status, latency, connections for each pool
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * Perform health check on a specific pool.
     *
     * @param pool - pg.Pool to check
     * @returns true if healthy, false otherwise
     */
    async healthCheck(pool) {
        try {
            const start = Date.now();
            const result = await pool.query('SELECT 1 AS health');
            const latency = Date.now() - start;
            return result.rows[0].health === 1 && latency < 5000; // 5s timeout
        }
        catch (error) {
            log.error('[pg-connection] Health check failed:', error);
            return false;
        }
    }
    /**
     * Gracefully shut down all connection pools.
     *
     * Drains active connections, stops heartbeat monitoring, and closes pools.
     */
    async shutdown() {
        log.info('');
        log.info('[PostgreSQL] Shutting down connection pools...');
        // Stop heartbeat
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        // Close pools
        const closePromises = [];
        if (this.prodPool) {
            closePromises.push(this.prodPool.end());
        }
        if (this.localPool) {
            closePromises.push(this.localPool.end());
        }
        await Promise.all(closePromises);
        log.info('[PostgreSQL] Shutdown complete');
        log.info('');
    }
    // ==========================================================================
    // Private Methods
    // ==========================================================================
    createPool(connectionString, label) {
        // Detect if this is an external connection requiring SSL
        const isExternal = connectionString.includes('.render.com') ||
            connectionString.includes('postgres://') && !connectionString.includes('127.0.0.1') && !connectionString.includes('localhost');
        return new Pool({
            connectionString,
            max: 20, // Max connections per pool
            idleTimeoutMillis: 30000, // Close idle connections after 30s
            connectionTimeoutMillis: 2000, // Timeout for new connections
            keepAlive: true, // Enable TCP keepalive
            keepAliveInitialDelayMillis: 10000, // Wait 10s before first keepalive
            application_name: `infinity-gauntlet-${label.toLowerCase()}`,
            // SSL/TLS configuration for external databases (Render managed PostgreSQL)
            ssl: isExternal ? {
                rejectUnauthorized: false, // Accept self-signed certificates from Render
            } : false,
        });
    }
    async testConnection(pool, type) {
        try {
            const start = Date.now();
            const result = await pool.query('SELECT NOW() as timestamp, current_database() as db');
            const latency = Date.now() - start;
            this.stats[type] = {
                status: 'online',
                latency,
                connections: pool.totalCount,
                source: result.rows[0].db,
                lastError: null,
                lastCheck: new Date(),
            };
            log.info(`[PostgreSQL] ${type.toUpperCase()} → Connected to "${result.rows[0].db}" (${latency}ms)`);
        }
        catch (error) {
            this.stats[type] = {
                status: 'error',
                latency: null,
                connections: null,
                source: null,
                lastError: getErrorMessage(error),
                lastCheck: new Date(),
            };
            log.error(`[pg-connection] ${type.toUpperCase()} connection failed:`, error);
            throw error;
        }
    }
    startHeartbeat() {
        this.heartbeatInterval = setInterval(async () => {
            await this.updateStats();
        }, 15000); // Every 15 seconds
    }
    async updateStats() {
        const checks = [];
        if (this.prodPool) {
            checks.push(this.updatePoolStats(this.prodPool, 'prod'));
        }
        if (this.localPool) {
            checks.push(this.updatePoolStats(this.localPool, 'local'));
        }
        await Promise.allSettled(checks);
    }
    async updatePoolStats(pool, type) {
        try {
            const start = Date.now();
            await pool.query('SELECT 1');
            const latency = Date.now() - start;
            this.stats[type] = {
                status: 'online',
                latency,
                connections: pool.totalCount,
                source: this.stats[type].source,
                lastError: null,
                lastCheck: new Date(),
            };
        }
        catch (error) {
            this.stats[type] = {
                ...this.stats[type],
                status: 'error',
                lastError: getErrorMessage(error),
                lastCheck: new Date(),
            };
            log.error(`[pg-connection] Heartbeat failed for ${type.toUpperCase()}:`, error);
        }
    }
    createEmptyStats() {
        return {
            status: 'offline',
            latency: null,
            connections: null,
            source: null,
            lastError: null,
            lastCheck: null,
        };
    }
}
// ============================================================================
// Singleton Instance
// ============================================================================
let connection = null;
/**
 * Initialize the global PostgreSQL connection.
 *
 * Reads configuration from environment variables and creates connection pools.
 *
 * @returns Promise<void>
 */
export async function initializeConnection() {
    if (connection) {
        log.warn('[pg-connection] Already initialized, skipping...');
        return;
    }
    const dbConfig = {
        prod: process.env.PROD_DATABASE_URL || process.env.RENDER_DB_EXTERNAL_URL,
        local: process.env.DATABASE_ONPREMISE_DEV_PRIMARY,
    };
    connection = new PostgresConnection();
    await connection.initialize(dbConfig);
    // Register shutdown handlers
    process.on('SIGTERM', async () => {
        log.info('');
        log.info('[SIGNAL] SIGTERM received');
        await connection?.shutdown();
        process.exit(0);
    });
    process.on('SIGINT', async () => {
        log.info('');
        log.info('[SIGNAL] SIGINT received');
        await connection?.shutdown();
        process.exit(0);
    });
}
/**
 * Get the global PostgreSQL connection instance.
 *
 * @returns PostgresConnection instance
 * @throws Error if connection not initialized
 */
export function getConnection() {
    if (!connection) {
        throw new Error('PostgreSQL connection not initialized. Call initializeConnection() first.');
    }
    return connection;
}
/**
 * Convenience export: Get PROD client directly (PRIMARY for all operations).
 */
export function getProdDb() {
    return getConnection().getProdClient();
}
/**
 * Convenience export: Get current database statistics.
 * Returns error state if connection not initialized yet.
 */
export function getDatabaseStats() {
    if (!connection) {
        return { error: true };
    }
    return connection.getStats();
}
