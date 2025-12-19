/**
 * PROD PostgreSQL Worker
 * 
 * Centralized worker for PROD database operations with intelligent caching,
 * write buffering, and comprehensive health monitoring.
 * 
 * Features:
 * - Query cache (TTL 5min, LRU eviction, 10 MB max memory)
 * - Write buffer (5s OR 100 entries flush trigger)
 * - Transaction support with automatic rollback
 * - Health monitoring (latency, connection count, error rate)
 * - Automatic reconnection with exponential backoff
 * 
 * @module workers/database/prod-postgres-worker
 */

import type { PrismaClient } from '../../generated/prisma/client.js';
import type {
  QueryableWorker,
  WritableWorker,
  TransactionalWorker,
  TransactionContext,
  CacheStats,
  BufferStats,
  WorkerConfig,
  WorkerEventEmitter,
} from './types.js';
import { BaseDatabaseWorker } from './base-worker.js';
import { LRUCacheStrategy, HybridWriteBufferStrategy } from './strategies.js';
import type { BufferedWrite } from './strategies.js';
import { createHash } from 'crypto';

// ============================================================================
// PROD PostgreSQL Worker Implementation
// ============================================================================

/**
 * Production PostgreSQL worker with query caching and write buffering.
 * Implements full query/write/transaction support.
 */
export class ProdPostgresWorker
  extends BaseDatabaseWorker
  implements QueryableWorker, WritableWorker, TransactionalWorker
{
  private prisma!: PrismaClient;
  private cache: LRUCacheStrategy<string, unknown[]>;
  private writeBuffer: HybridWriteBufferStrategy;
  private flushTimer?: NodeJS.Timeout;
  
  constructor(config: WorkerConfig, eventEmitter?: WorkerEventEmitter) {
    super(config, eventEmitter);
    
    // Initialize cache strategy with complete default config
    const cacheConfig: import('./types.js').CacheConfig = config.cache || {
      enabled: true,
      evictionPolicy: 'lru',
      maxEntries: 1000,
      maxSizeBytes: 10 * 1024 * 1024, // 10 MB default
      ttlMs: 300000, // 5 minutes default
      prefetch: false,
    };
    this.cache = new LRUCacheStrategy();
    this.cache.initialize(cacheConfig);
    
    // Initialize write buffer strategy with complete default config
    const bufferConfig: import('./types.js').WriteBufferConfig = config.writeBuffer || {
      enabled: true,
      flushTrigger: 'hybrid',
      flushThresholdEntries: 100,
      flushIntervalMs: 5000, // 5 seconds default
      maxBufferSize: 1000,
      backpressureWarnPercent: 75,
      backpressureCriticalPercent: 95,
    };
    this.writeBuffer = new HybridWriteBufferStrategy();
    this.writeBuffer.initialize(bufferConfig, eventEmitter);
  }
  
  // ============================================================================
  // Worker Identity
  // ============================================================================
  
  get id(): string {
    return 'prod-postgres';
  }
  
  get name(): string {
    return 'PROD PostgreSQL Worker';
  }
  
  get type(): 'postgres' {
    return 'postgres';
  }
  
  // ============================================================================
  // Lifecycle Implementation
  // ============================================================================
  
  protected async doInitialize(): Promise<void> {
    // Dynamic import to avoid circular dependencies
    const { prisma } = await import('../../shared/prisma.js');
    this.prisma = prisma;
    
    // Test connection
    await this.executeOperation('connection-test', async () => {
      await this.prisma.$connect();
    });
    
    this.log('PROD PostgreSQL connection established', 'info');
  }
  
  protected async doStart(): Promise<void> {
    // Start background flush timer
    this.writeBuffer.start();
    
    // Subscribe to flush events
    this.eventEmitter?.on((event) => {
      if (event.type === 'buffer-flush' && event.workerId === 'write-buffer') {
        void this.handleBufferFlush();
      }
    });
    
    this.log('Background flush worker started', 'info');
  }
  
  protected async doStop(): Promise<void> {
    // Stop flush timer
    this.writeBuffer.stop();
    
    // Final flush before shutdown
    if (this.writeBuffer.getStats().entryCount > 0) {
      this.log('Performing final flush before shutdown...', 'info');
      await this.flush();
    }
    
    // Disconnect Prisma client
    await this.prisma.$disconnect();
    
    this.log('PROD PostgreSQL worker stopped', 'info');
  }
  
  protected async doHealthCheck(): Promise<Record<string, unknown>> {
    // Test connection with simple query
    await this.prisma.$queryRaw`SELECT 1`;
    
    // Get cache and buffer stats
    const cacheStats = this.getCacheStats();
    const bufferStats = this.getBufferStats();
    
    return {
      cacheHitRate: cacheStats?.hitRate ?? 0,
      cacheUtilization: cacheStats?.utilizationPercent ?? 0,
      bufferUtilization: bufferStats.utilizationPercent,
      backpressureActive: bufferStats.isBackpressureActive,
    };
  }
  
  // ============================================================================
  // Query Operations (QueryableWorker Interface)
  // ============================================================================
  
  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    // Check cache first
    const cacheKey = this.buildCacheKey(sql, params);
    const cached = this.cache.get(cacheKey);
    
    if (cached !== undefined) {
      this.emitEvent({
        type: 'cache-hit',
        workerId: this.id,
        key: cacheKey,
        timestamp: new Date(),
      });
      return cached as T[];
    }
    
    // Cache miss - execute query
    this.emitEvent({
      type: 'cache-miss',
      workerId: this.id,
      key: cacheKey,
      timestamp: new Date(),
    });
    
    const result = await this.executeOperation('query', async () => {
      // Use Prisma raw query with parameters
      const query = this.buildParameterizedQuery(sql, params);
      return await this.prisma.$queryRawUnsafe<T[]>(query, ...params);
    });
    
    // Cache result
    this.cache.set(cacheKey, result);
    
    return result;
  }
  
  async queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }
  
  getCacheStats(): CacheStats | null {
    if (!this.config.cache?.enabled) return null;
    return this.cache.getStats();
  }
  
  clearCache(): void {
    this.cache.clear();
    this.log('Query cache cleared', 'info');
  }
  
  // ============================================================================
  // Write Operations (WritableWorker Interface)
  // ============================================================================
  
  async insert(table: string, data: Record<string, unknown>): Promise<void> {
    const write: BufferedWrite = {
      operation: 'insert',
      table,
      data,
      timestamp: new Date(),
    };
    
    await this.executeOperation('buffer-insert', async () => {
      this.writeBuffer.add(write);
    });
    
    // Trigger flush if threshold reached
    if (this.writeBuffer.shouldFlush()) {
      // Non-blocking flush (happens in background)
      void this.flush();
    }
  }
  
  async update(
    table: string,
    data: Record<string, unknown>,
    where: Record<string, unknown>
  ): Promise<void> {
    const write: BufferedWrite = {
      operation: 'update',
      table,
      data,
      where,
      timestamp: new Date(),
    };
    
    await this.executeOperation('buffer-update', async () => {
      this.writeBuffer.add(write);
    });
    
    // Trigger flush if threshold reached
    if (this.writeBuffer.shouldFlush()) {
      void this.flush();
    }
  }
  
  async delete(table: string, where: Record<string, unknown>): Promise<void> {
    const write: BufferedWrite = {
      operation: 'delete',
      table,
      data: {},
      where,
      timestamp: new Date(),
    };
    
    await this.executeOperation('buffer-delete', async () => {
      this.writeBuffer.add(write);
    });
    
    // Trigger flush if threshold reached
    if (this.writeBuffer.shouldFlush()) {
      void this.flush();
    }
  }
  
  async flush(): Promise<number> {
    const startTime = Date.now();
    const writes = this.writeBuffer.getAll();
    
    if (writes.length === 0) return 0;
    
    this.log(`Flushing ${writes.length} buffered writes...`, 'info');
    
    await this.executeOperation('buffer-flush', async () => {
      // Execute all writes in single transaction
      await this.prisma.$transaction(async (tx) => {
        for (const write of writes) {
          await this.executeWrite(tx as PrismaClient, write);
        }
      });
    });
    
    // Clear buffer after successful flush
    this.writeBuffer.clear();
    
    // Record flush duration
    const duration = Date.now() - startTime;
    this.writeBuffer.recordFlushDuration(duration);
    
    // Emit flush event
    this.emitEvent({
      type: 'buffer-flush',
      workerId: this.id,
      entriesWritten: writes.length,
      durationMs: duration,
      timestamp: new Date(),
    });
    
    this.log(`Flushed ${writes.length} writes in ${duration}ms`, 'info');
    
    return writes.length;
  }
  
  getBufferStats(): BufferStats {
    return this.writeBuffer.getStats();
  }
  
  // ============================================================================
  // Transaction Support (TransactionalWorker Interface)
  // ============================================================================
  
  async transaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return await this.executeOperation('transaction', async () => {
      return await this.prisma.$transaction(async (prismaClient) => {
        // Create transaction context
        const ctx = this.createTransactionContext(prismaClient as PrismaClient);
        
        // Execute user function
        return await fn(ctx);
      });
    });
  }
  
  // ============================================================================
  // Private Helper Methods
  // ============================================================================
  
  /**
   * Build cache key from SQL query and parameters.
   */
  private buildCacheKey(sql: string, params: unknown[]): string {
    const paramsString = JSON.stringify(params);
    const combined = `${sql}:${paramsString}`;
    return createHash('sha256').update(combined).digest('hex');
  }
  
  /**
   * Build parameterized query (replace ? with $1, $2, etc.).
   */
  private buildParameterizedQuery(sql: string, _params: unknown[]): string {
    // If already using PostgreSQL-style parameters ($1, $2), return as-is
    if (sql.includes('$1')) return sql;
    
    // Replace ? placeholders with $1, $2, etc.
    let paramIndex = 1;
    return sql.replace(/\?/g, () => `$${paramIndex++}`);
  }
  
  /**
   * Execute single buffered write operation.
   */
  private async executeWrite(
    client: PrismaClient,
    write: BufferedWrite
  ): Promise<void> {
    // Get table accessor (e.g., client.user, client.battle)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableAccessor = (client as Record<string, any>)[write.table];
    
    if (!tableAccessor) {
      throw new Error(`Table not found: ${write.table}`);
    }
    
    switch (write.operation) {
      case 'insert':
        await tableAccessor.create({ data: write.data });
        break;
        
      case 'update':
        await tableAccessor.updateMany({
          where: write.where,
          data: write.data,
        });
        break;
        
      case 'delete':
        await tableAccessor.deleteMany({ where: write.where });
        break;
        
      default:
        throw new Error(`Unknown operation: ${write.operation}`);
    }
  }
  
  /**
   * Create transaction context for user functions.
   */
  private createTransactionContext(client: PrismaClient): TransactionContext {
    return {
      query: async <T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> => {
        const query = this.buildParameterizedQuery(sql, params);
        return await client.$queryRawUnsafe<T[]>(query, ...params);
      },
      
      queryOne: async <T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> => {
        const results = await this.query<T>(sql, params);
        return results.length > 0 ? results[0] : null;
      },
      
      insert: async (table: string, data: Record<string, unknown>): Promise<void> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tableAccessor = (client as Record<string, any>)[table];
        if (!tableAccessor) {
          throw new Error(`Table not found: ${table}`);
        }
        await tableAccessor.create({ data });
      },
      
      update: async (
        table: string,
        data: Record<string, unknown>,
        where: Record<string, unknown>
      ): Promise<void> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tableAccessor = (client as Record<string, any>)[table];
        if (!tableAccessor) {
          throw new Error(`Table not found: ${table}`);
        }
        await tableAccessor.updateMany({ where, data });
      },
      
      delete: async (table: string, where: Record<string, unknown>): Promise<void> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tableAccessor = (client as Record<string, any>)[table];
        if (!tableAccessor) {
          throw new Error(`Table not found: ${table}`);
        }
        await tableAccessor.deleteMany({ where });
      },
    };
  }
  
  /**
   * Handle buffer flush event from background worker.
   */
  private async handleBufferFlush(): Promise<void> {
    try {
      await this.flush();
    } catch (error) {
      this.log(`Buffer flush failed: ${(error as Error).message}`, 'error');
    }
  }
}

// ============================================================================
// Worker Factory
// ============================================================================

/**
 * Create PROD PostgreSQL worker with default configuration.
 */
export function createProdPostgresWorker(
  eventEmitter?: WorkerEventEmitter
): ProdPostgresWorker {
  const config: WorkerConfig = {
    id: 'prod-postgres',
    name: 'PROD PostgreSQL Worker',
    enabled: true,
    
    // Query cache: 5min TTL, 10MB memory, LRU eviction
    cache: {
      enabled: true,
      evictionPolicy: 'lru',
      ttlMs: 5 * 60 * 1000, // 5 minutes
      maxSizeBytes: 10 * 1024 * 1024, // 10 MB
      maxEntries: 10000,
      prefetch: false,
    },
    
    // Write buffer: 5s OR 100 entries flush trigger
    writeBuffer: {
      enabled: true,
      flushTrigger: 'hybrid',
      flushIntervalMs: 5000, // 5 seconds
      flushThresholdEntries: 100,
      maxBufferSize: 10000,
      backpressureWarnPercent: 75,
      backpressureCriticalPercent: 95,
    },
    
    // Error recovery: Circuit breaker with exponential backoff
    errorRecovery: {
      policy: 'circuit-breaker',
      maxRetries: 3,
      initialRetryDelayMs: 1000, // 1 second
      maxRetryDelayMs: 30000, // 30 seconds
      backoffMultiplier: 2,
      circuitBreakerThreshold: 5,
      circuitBreakerResetMs: 30000, // 30 seconds
    },
    
    // Health monitoring
    healthCheckIntervalMs: 15000, // 15 seconds
    metricsIntervalMs: 5000, // 5 seconds
  };
  
  return new ProdPostgresWorker(config, eventEmitter);
}
