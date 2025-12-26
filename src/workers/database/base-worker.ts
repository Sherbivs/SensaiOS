/**
 * Base database worker implementation.
 * 
 * Provides common functionality for all database workers:
 * - Health monitoring
 * - Metrics collection
 * - Lifecycle management
 * - Error handling
 * - Kernel integration (reports lifecycle/query events UP to kernel observer layer)
 * 
 * @module workers/database/base-worker
 */

// KERNEL FIRST — Must be first import to monitor other system initialization
import type { DatabaseHook } from '../../kernel/kernel-hooks.js';
import { createDatabaseHook } from '../../kernel/kernel-hooks.js';

import type {
  DatabaseWorker,
  WorkerHealth,
  WorkerMetrics,
  WorkerConfig,
  WorkerEventEmitter,
  WorkerEvent,
} from './types.js';
import type { ErrorRecoveryStrategy } from './strategies.js';
import { CircuitBreakerStrategy } from './strategies.js';

// ============================================================================
// KERNEL INTEGRATION (Lazy Hook Pattern)
// ============================================================================
// Workers report lifecycle and query events UP to kernel for unified observation

// Lazy initialization to avoid boot-time circular dependencies
let kernelHook: DatabaseHook | null = null;

/**
 * Get or create the kernel hook (lazy singleton pattern).
 * Returns null if kernel hook creation fails (kernel continues observing via other paths).
 */
function getKernelHook(workerName: string): DatabaseHook | null {
  if (!kernelHook) {
    try {
      kernelHook = createDatabaseHook(`db-worker-${workerName}`);
    } catch {
      // Kernel hook creation failed - worker continues without kernel reporting
      // This is non-fatal; kernel can still observe via other integrated systems
    }
  }
  return kernelHook;
}

// ============================================================================
// Base Worker Implementation
// ============================================================================

/**
 * Abstract base class for database workers.
 * Concrete workers extend this and implement database-specific logic.
 */
export abstract class BaseDatabaseWorker implements DatabaseWorker {
  protected config: WorkerConfig;
  protected eventEmitter?: WorkerEventEmitter;
  protected errorRecovery: ErrorRecoveryStrategy;
  protected isInitialized = false;
  protected isStarted = false;
  
  // Health tracking
  private lastOperationAt: Date | null = null;
  private startTime: Date | null = null;
  private recentLatencies: number[] = [];
  private errorCount = 0;
  private lastError: string | null = null;
  
  // Metrics tracking
  private metrics: WorkerMetrics = {
    operationCount: 0,
    successCount: 0,
    failureCount: 0,
    avgLatencyMs: 0,
    peakLatencyMs: 0,
    throughput: 0,
    errorRate: 0,
    lastUpdatedAt: new Date(),
  };
  
  // Health check interval
  private healthCheckTimer?: NodeJS.Timeout;
  
  constructor(config: WorkerConfig, eventEmitter?: WorkerEventEmitter) {
    this.config = config;
    this.eventEmitter = eventEmitter;
    
    // Initialize error recovery strategy
    this.errorRecovery = new CircuitBreakerStrategy();
    this.errorRecovery.initialize(config.errorRecovery, this.log.bind(this));
  }
  
  // ============================================================================
  // Abstract Methods (Implemented by Concrete Workers)
  // ============================================================================
  
  /**
   * Worker identifier (e.g., 'prod-postgres', 'timescaledb').
   */
  abstract get id(): string;
  
  /**
   * Human-readable worker name.
   */
  abstract get name(): string;
  
  /**
   * Worker type for categorization.
   */
  abstract get type(): 'postgres' | 'timescaledb' | 'sqlite-read' | 'sqlite-write';
  
  /**
   * Initialize worker-specific resources (connections, caches, etc.).
   * Called once during application startup.
   */
  protected abstract doInitialize(): Promise<void>;
  
  /**
   * Start worker-specific background tasks.
   * Called after initialization completes.
   */
  protected abstract doStart(): Promise<void>;
  
  /**
   * Stop worker-specific background tasks and close connections.
   * Called during graceful shutdown.
   */
  protected abstract doStop(): Promise<void>;
  
  /**
   * Perform worker-specific health checks (connection test, latency check, etc.).
   * Returns worker-specific details for the health report.
   */
  protected abstract doHealthCheck(): Promise<Record<string, unknown>>;
  
  // ============================================================================
  // Lifecycle Management (Final Implementation)
  // ============================================================================
  
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error(`Worker ${this.id} already initialized`);
    }
    
    if (!this.config.enabled) {
      this.log(`Worker ${this.id} disabled in configuration. Skipping initialization.`, 'info');
      return;
    }
    
    const startTime = Date.now();
    try {
      this.log(`Initializing worker ${this.id}...`, 'info');
      await this.doInitialize();
      this.isInitialized = true;
      this.emitEvent({ type: 'initialized', workerId: this.id, timestamp: new Date() });
      this.log(`Worker ${this.id} initialized successfully`, 'info');
      
      // Report to kernel: worker connected successfully
      const durationMs = Date.now() - startTime;
      getKernelHook(this.id)?.connection('CONNECTED', { 
        workerId: this.id, 
        workerType: this.type,
        durationMs,
      });
    } catch (error) {
      this.log(`Failed to initialize worker ${this.id}: ${(error as Error).message}`, 'error');
      this.emitEvent({ type: 'error', workerId: this.id, error: error as Error, timestamp: new Date() });
      
      // Report to kernel: worker connection error
      getKernelHook(this.id)?.connection('ERROR', { 
        workerId: this.id,
        error: (error as Error).message,
      });
      throw error;
    }
  }
  
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error(`Worker ${this.id} not initialized. Call initialize() first.`);
    }
    
    if (this.isStarted) {
      throw new Error(`Worker ${this.id} already started`);
    }
    
    if (!this.config.enabled) {
      this.log(`Worker ${this.id} disabled in configuration. Skipping start.`, 'info');
      return;
    }
    
    try {
      this.log(`Starting worker ${this.id}...`, 'info');
      await this.doStart();
      this.isStarted = true;
      this.startTime = new Date();
      this.startHealthCheckTimer();
      this.emitEvent({ type: 'started', workerId: this.id, timestamp: new Date() });
      this.log(`Worker ${this.id} started successfully`, 'info');
    } catch (error) {
      this.log(`Failed to start worker ${this.id}: ${(error as Error).message}`, 'error');
      this.emitEvent({ type: 'error', workerId: this.id, error: error as Error, timestamp: new Date() });
      throw error;
    }
  }
  
  async stop(timeoutMs = 30000): Promise<boolean> {
    if (!this.isStarted) {
      this.log(`Worker ${this.id} not started. Nothing to stop.`, 'info');
      return true;
    }
    
    this.log(`Stopping worker ${this.id} (timeout: ${timeoutMs}ms)...`, 'info');
    
    // Stop health check timer
    this.stopHealthCheckTimer();
    
    // Race between shutdown and timeout
    const stopPromise = this.doStop();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Stop timeout')), timeoutMs)
    );
    
    try {
      await Promise.race([stopPromise, timeoutPromise]);
      this.isStarted = false;
      this.emitEvent({ type: 'stopped', workerId: this.id, reason: 'graceful', timestamp: new Date() });
      this.log(`Worker ${this.id} stopped successfully`, 'info');
      
      // Report to kernel: worker disconnected gracefully
      getKernelHook(this.id)?.connection('DISCONNECTED', { 
        workerId: this.id,
        reason: 'graceful',
      });
      return true;
    } catch (error) {
      if ((error as Error).message === 'Stop timeout') {
        this.log(`Worker ${this.id} stop timed out after ${timeoutMs}ms`, 'error');
        this.emitEvent({ type: 'stopped', workerId: this.id, reason: 'timeout', timestamp: new Date() });
        
        // Report to kernel: worker disconnect timeout
        getKernelHook(this.id)?.connection('DISCONNECTED', { 
          workerId: this.id,
          reason: 'timeout',
          timeoutMs,
        });
        return false;
      }
      
      this.log(`Error stopping worker ${this.id}: ${(error as Error).message}`, 'error');
      this.emitEvent({ type: 'error', workerId: this.id, error: error as Error, timestamp: new Date() });
      
      // Report to kernel: worker disconnect error
      getKernelHook(this.id)?.connection('ERROR', { 
        workerId: this.id,
        error: (error as Error).message,
      });
      throw error;
    }
  }
  
  async healthCheck(): Promise<WorkerHealth> {
    const startTime = Date.now();
    
    try {
      // Perform worker-specific health check
      const details = await this.doHealthCheck();
      
      // Calculate latency
      const latencyMs = Date.now() - startTime;
      this.recordLatency(latencyMs);
      
      // Determine status
      const status = this.determineHealthStatus(latencyMs);
      
      // Build health report
      const health: WorkerHealth = {
        status,
        latencyMs: this.calculateAverageLatency(),
        errorCount: this.errorCount,
        lastError: this.lastError,
        uptimeMs: this.startTime ? Date.now() - this.startTime.getTime() : 0,
        lastOperationAt: this.lastOperationAt,
        details,
      };
      
      this.emitEvent({ type: 'health-check', workerId: this.id, health, timestamp: new Date() });
      
      return health;
    } catch (error) {
      this.errorCount++;
      this.lastError = (error as Error).message;
      this.emitEvent({ type: 'error', workerId: this.id, error: error as Error, timestamp: new Date() });
      
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - startTime,
        errorCount: this.errorCount,
        lastError: this.lastError,
        uptimeMs: this.startTime ? Date.now() - this.startTime.getTime() : 0,
        lastOperationAt: this.lastOperationAt,
        details: { error: (error as Error).message },
      };
    }
  }
  
  getMetrics(): WorkerMetrics {
    // Update throughput (operations per second)
    const uptimeSeconds = this.startTime ? (Date.now() - this.startTime.getTime()) / 1000 : 1;
    this.metrics.throughput = this.metrics.operationCount / uptimeSeconds;
    
    // Update error rate
    this.metrics.errorRate = this.metrics.operationCount > 0
      ? this.metrics.failureCount / this.metrics.operationCount
      : 0;
    
    this.metrics.lastUpdatedAt = new Date();
    
    return { ...this.metrics };
  }
  
  resetMetrics(): void {
    this.metrics = {
      operationCount: 0,
      successCount: 0,
      failureCount: 0,
      avgLatencyMs: 0,
      peakLatencyMs: 0,
      throughput: 0,
      errorRate: 0,
      lastUpdatedAt: new Date(),
    };
    this.recentLatencies = [];
    this.errorCount = 0;
    this.lastError = null;
    this.log(`Worker ${this.id} metrics reset`, 'info');
  }
  
  // ============================================================================
  // Protected Helper Methods
  // ============================================================================
  
  /**
   * Execute operation with metrics tracking and error recovery.
   * Concrete workers should use this for all operations.
   * Reports query timing to kernel for unified observation.
   */
  protected async executeOperation<T>(
    name: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    this.metrics.operationCount++;
    
    try {
      const result = await this.errorRecovery.execute(operation);
      
      // Record success metrics
      const latencyMs = Date.now() - startTime;
      this.recordLatency(latencyMs);
      this.metrics.successCount++;
      this.lastOperationAt = new Date();
      this.errorRecovery.recordSuccess();
      
      // Report to kernel: successful query
      getKernelHook(this.id)?.query(name, latencyMs, true, {
        workerId: this.id,
        workerType: this.type,
      });
      
      return result;
    } catch (error) {
      // Record failure metrics
      const latencyMs = Date.now() - startTime;
      this.recordLatency(latencyMs);
      this.metrics.failureCount++;
      this.errorCount++;
      this.lastError = (error as Error).message;
      this.errorRecovery.recordFailure(error as Error);
      this.emitEvent({ type: 'error', workerId: this.id, error: error as Error, timestamp: new Date() });
      
      // Report to kernel: failed query
      getKernelHook(this.id)?.query(name, latencyMs, false, {
        workerId: this.id,
        workerType: this.type,
        error: (error as Error).message,
      });
      
      throw error;
    }
  }
  
  /**
   * Log message with worker context.
   */
  protected log(message: string, level: 'info' | 'error'): void {
    if (level === 'error') {
      // Use event emitter for errors (integrates with monitoring)
      this.eventEmitter?.emit({
        type: 'error',
        workerId: this.id,
        error: new Error(message),
        timestamp: new Date(),
      });
    }
    // Note: Direct console logging not allowed per ESLint rules
    // All logging goes through event emitter or external logger
  }
  
  /**
   * Emit worker event to monitoring system.
   */
  protected emitEvent(event: WorkerEvent): void {
    this.eventEmitter?.emit(event);
  }
  
  /**
   * Record operation latency for metrics.
   */
  private recordLatency(latencyMs: number): void {
    this.recentLatencies.push(latencyMs);
    
    // Keep last 100 latencies
    if (this.recentLatencies.length > 100) {
      this.recentLatencies.shift();
    }
    
    // Update peak latency
    if (latencyMs > this.metrics.peakLatencyMs) {
      this.metrics.peakLatencyMs = latencyMs;
    }
  }
  
  /**
   * Calculate average latency from recent operations.
   */
  private calculateAverageLatency(): number {
    if (this.recentLatencies.length === 0) return 0;
    const sum = this.recentLatencies.reduce((a, b) => a + b, 0);
    return sum / this.recentLatencies.length;
  }
  
  /**
   * Determine health status based on latency and error rate.
   */
  private determineHealthStatus(latencyMs: number): 'healthy' | 'degraded' | 'unhealthy' {
    // Check circuit breaker state
    const recoveryStats = this.errorRecovery.getStats();
    if (recoveryStats.circuitBreakerState === 'open') {
      return 'unhealthy';
    }
    
    // Check error rate
    const errorRate = this.metrics.operationCount > 0
      ? this.errorCount / this.metrics.operationCount
      : 0;
    
    if (errorRate > 0.1) {
      return 'unhealthy';
    }
    
    if (errorRate > 0.05 || latencyMs > 1000) {
      return 'degraded';
    }
    
    return 'healthy';
  }
  
  /**
   * Start periodic health check timer.
   */
  private startHealthCheckTimer(): void {
    if (this.healthCheckTimer) return;
    
    this.healthCheckTimer = setInterval(
      () => void this.healthCheck(),
      this.config.healthCheckIntervalMs
    );
  }
  
  /**
   * Stop health check timer.
   */
  private stopHealthCheckTimer(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }
}
