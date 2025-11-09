/**
 * PostgreSQL Connection Manager
 * 
 * Replaces src/shared/prisma.ts dual PrismaClient architecture with pg.Pool connections.
 * Maintains DEV (master), PROD (local node), and LOCAL (workstation) connection pools.
 * 
 * Key Features:
 * - <50ms latency for PROD node gameplay operations
 * - Heartbeat monitoring and telemetry
 * - Graceful shutdown with connection draining
 * - Automatic reconnection on failure
 * 
 * Architecture:
 * - DEV Pool: Connected to DEV_DATABASE_URL or RENDER_DB_EXTERNAL_URL (master database)
 * - PROD Pool: Connected to PROD_DATABASE_URL (PRIMARY for gameplay, local node)
 * - LOCAL Pool: Connected to DATABASE_LOCAL_URL (optional workstation mirror)
 */

import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

// ============================================================================
// Types
// ============================================================================

export interface DbConfig {
  dev?: string;    // DEV_DATABASE_URL or RENDER_DB_EXTERNAL_URL
  prod?: string;   // PROD_DATABASE_URL (PRIMARY for gameplay)
  local?: string;  // DATABASE_LOCAL_URL (optional)
}

export interface DbStats {
  status: 'online' | 'offline' | 'error' | 'connecting';
  latency: number | null;      // milliseconds
  connections: number | null;  // active connections
  source: string | null;       // connection string (sanitized)
  lastError: string | null;
  lastCheck: Date | null;
}

export interface TripleDbStats {
  dev: DbStats;
  prod: DbStats;
  local: DbStats;
}

// ============================================================================
// Connection Manager Class
// ============================================================================

export class PostgresConnection {
  private devPool: pg.Pool | null = null;
  private prodPool: pg.Pool | null = null;
  private localPool: pg.Pool | null = null;

  private heartbeatInterval: NodeJS.Timeout | null = null;
  private stats: TripleDbStats = {
    dev: this.createEmptyStats(),
    prod: this.createEmptyStats(),
    local: this.createEmptyStats(),
  };

  /**
   * Initialize connection pools from configuration.
   * 
   * @param config - Database URLs for each environment
   * @throws Error if no valid database URLs provided
   */
  async initialize(config: DbConfig): Promise<void> {
    const { dev, prod, local } = config;

    // PROD is PRIMARY for gameplay - must exist
    if (!prod) {
      throw new Error(
        'PROD_DATABASE_URL is required for gameplay operations. ' +
        'Ensure render.yaml sets this to the local PostgreSQL node connection string.'
      );
    }

    // Create pools
    if (dev) {
      this.devPool = this.createPool(dev, 'DEV');
      await this.testConnection(this.devPool, 'dev');
    }

    this.prodPool = this.createPool(prod, 'PROD');
    await this.testConnection(this.prodPool, 'prod');

    if (local) {
      this.localPool = this.createPool(local, 'LOCAL');
      await this.testConnection(this.localPool, 'local');
    }

    // Start heartbeat monitoring (every 15 seconds)
    this.startHeartbeat();

    console.log('');
    console.log('[PostgreSQL] Connection pools initialized');
    console.log(`  DEV:   ${this.devPool ? 'enabled' : 'disabled'}`);
    console.log(`  PROD:  ${this.prodPool ? 'enabled' : 'disabled'}`);
    console.log(`  LOCAL: ${this.localPool ? 'enabled' : 'disabled'}`);
    console.log('');
  }

  /**
   * Get DEV database pool (master database, source of truth for migrations).
   * 
   * @returns pg.Pool instance
   * @throws Error if DEV pool not initialized
   */
  getDevClient(): pg.Pool {
    if (!this.devPool) {
      throw new Error('DEV database pool not initialized. Check DEV_DATABASE_URL configuration.');
    }
    return this.devPool;
  }

  /**
   * Get PROD database pool (PRIMARY for gameplay operations).
   * 
   * This is the local PostgreSQL node providing <50ms latency for battles, encounters, etc.
   * 
   * @returns pg.Pool instance
   * @throws Error if PROD pool not initialized
   */
  getProdClient(): pg.Pool {
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
  getLocalClient(): pg.Pool {
    if (!this.localPool) {
      throw new Error('LOCAL database pool not initialized. Check DATABASE_LOCAL_URL configuration.');
    }
    return this.localPool;
  }

  /**
   * Get current statistics for all database connections.
   * 
   * @returns TripleDbStats with status, latency, connections for each pool
   */
  getStats(): TripleDbStats {
    return { ...this.stats };
  }

  /**
   * Perform health check on a specific pool.
   * 
   * @param pool - pg.Pool to check
   * @returns true if healthy, false otherwise
   */
  async healthCheck(pool: pg.Pool): Promise<boolean> {
    try {
      const start = Date.now();
      const result = await pool.query('SELECT 1 AS health');
      const latency = Date.now() - start;

      return result.rows[0].health === 1 && latency < 5000; // 5s timeout
    } catch (error) {
      console.error('[pg-connection] Health check failed:', error);
      return false;
    }
  }

  /**
   * Gracefully shut down all connection pools.
   * 
   * Drains active connections, stops heartbeat monitoring, and closes pools.
   */
  async shutdown(): Promise<void> {
    console.log('');
    console.log('[PostgreSQL] Shutting down connection pools...');

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close pools
    const closePromises: Promise<void>[] = [];

    if (this.devPool) {
      closePromises.push(this.devPool.end());
    }
    if (this.prodPool) {
      closePromises.push(this.prodPool.end());
    }
    if (this.localPool) {
      closePromises.push(this.localPool.end());
    }

    await Promise.all(closePromises);

    console.log('[PostgreSQL] Shutdown complete');
    console.log('');
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private createPool(connectionString: string, label: string): pg.Pool {
    // Detect if this is an external connection requiring SSL
    const isExternal = connectionString.includes('.render.com') || 
                       connectionString.includes('postgres://') && !connectionString.includes('127.0.0.1') && !connectionString.includes('localhost');
    
    return new Pool({
      connectionString,
      max: 20,                          // Max connections per pool
      idleTimeoutMillis: 30000,         // Close idle connections after 30s
      connectionTimeoutMillis: 2000,    // Timeout for new connections
      keepAlive: true,                  // Enable TCP keepalive
      keepAliveInitialDelayMillis: 10000, // Wait 10s before first keepalive
      application_name: `infinity-gauntlet-${label.toLowerCase()}`,
      // SSL/TLS configuration for external databases (Render managed PostgreSQL)
      ssl: isExternal ? {
        rejectUnauthorized: false,      // Accept self-signed certificates from Render
      } : false,
    });
  }

  private async testConnection(pool: pg.Pool, type: 'dev' | 'prod' | 'local'): Promise<void> {
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

      console.log(`[PostgreSQL] ${type.toUpperCase()} → Connected to "${result.rows[0].db}" (${latency}ms)`);
    } catch (error) {
      this.stats[type] = {
        status: 'error',
        latency: null,
        connections: null,
        source: null,
        lastError: error instanceof Error ? error.message : String(error),
        lastCheck: new Date(),
      };

      console.error(`[pg-connection] ${type.toUpperCase()} connection failed:`, error);
      throw error;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      await this.updateStats();
    }, 15000); // Every 15 seconds
  }

  private async updateStats(): Promise<void> {
    const checks: Array<Promise<void>> = [];

    if (this.devPool) {
      checks.push(this.updatePoolStats(this.devPool, 'dev'));
    }
    if (this.prodPool) {
      checks.push(this.updatePoolStats(this.prodPool, 'prod'));
    }
    if (this.localPool) {
      checks.push(this.updatePoolStats(this.localPool, 'local'));
    }

    await Promise.allSettled(checks);
  }

  private async updatePoolStats(pool: pg.Pool, type: 'dev' | 'prod' | 'local'): Promise<void> {
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
    } catch (error) {
      this.stats[type] = {
        ...this.stats[type],
        status: 'error',
        lastError: error instanceof Error ? error.message : String(error),
        lastCheck: new Date(),
      };

      console.error(`[pg-connection] Heartbeat failed for ${type.toUpperCase()}:`, error);
    }
  }

  private createEmptyStats(): DbStats {
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

let connection: PostgresConnection | null = null;

/**
 * Initialize the global PostgreSQL connection.
 * 
 * Reads configuration from environment variables and creates connection pools.
 * 
 * @returns Promise<void>
 */
export async function initializeConnection(): Promise<void> {
  if (connection) {
    console.warn('[pg-connection] Already initialized, skipping...');
    return;
  }

  const dbConfig: DbConfig = {
    dev: process.env.DEV_DATABASE_URL || process.env.RENDER_DB_EXTERNAL_URL,
    prod: process.env.PROD_DATABASE_URL,
    local: process.env.DATABASE_LOCAL_URL,
  };

  connection = new PostgresConnection();
  await connection.initialize(dbConfig);

  // Register shutdown handlers
  process.on('SIGTERM', async () => {
    console.log('');
    console.log('[SIGNAL] SIGTERM received');
    await connection?.shutdown();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('');
    console.log('[SIGNAL] SIGINT received');
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
export function getConnection(): PostgresConnection {
  if (!connection) {
    throw new Error(
      'PostgreSQL connection not initialized. Call initializeConnection() first.'
    );
  }
  return connection;
}

/**
 * Convenience export: Get PROD client directly (PRIMARY for gameplay).
 */
export function getProdDb(): pg.Pool {
  return getConnection().getProdClient();
}

/**
 * Convenience export: Get DEV client directly (master database).
 */
export function getDevDb(): pg.Pool {
  return getConnection().getDevClient();
}

/**
 * Convenience export: Get LOCAL client directly (workstation mirror).
 */
export function getLocalDb(): pg.Pool {
  return getConnection().getLocalClient();
}

/**
 * Convenience export: Get current database statistics.
 */
export function getDatabaseStats(): TripleDbStats {
  return getConnection().getStats();
}
