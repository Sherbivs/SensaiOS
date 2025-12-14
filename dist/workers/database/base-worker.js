/**
 * Base database worker implementation.
 *
 * Provides common functionality for all database workers:
 * - Health monitoring
 * - Metrics collection
 * - Lifecycle management
 * - Error handling
 *
 * @module workers/database/base-worker
 */
import { CircuitBreakerStrategy } from './strategies.js';
// ============================================================================
// Base Worker Implementation
// ============================================================================
/**
 * Abstract base class for database workers.
 * Concrete workers extend this and implement database-specific logic.
 */
export class BaseDatabaseWorker {
    config;
    eventEmitter;
    errorRecovery;
    isInitialized = false;
    isStarted = false;
    // Health tracking
    lastOperationAt = null;
    startTime = null;
    recentLatencies = [];
    errorCount = 0;
    lastError = null;
    // Metrics tracking
    metrics = {
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
    healthCheckTimer;
    constructor(config, eventEmitter) {
        this.config = config;
        this.eventEmitter = eventEmitter;
        // Initialize error recovery strategy
        this.errorRecovery = new CircuitBreakerStrategy();
        this.errorRecovery.initialize(config.errorRecovery, this.log.bind(this));
    }
    // ============================================================================
    // Lifecycle Management (Final Implementation)
    // ============================================================================
    async initialize() {
        if (this.isInitialized) {
            throw new Error(`Worker ${this.id} already initialized`);
        }
        if (!this.config.enabled) {
            this.log(`Worker ${this.id} disabled in configuration. Skipping initialization.`, 'info');
            return;
        }
        try {
            this.log(`Initializing worker ${this.id}...`, 'info');
            await this.doInitialize();
            this.isInitialized = true;
            this.emitEvent({ type: 'initialized', workerId: this.id, timestamp: new Date() });
            this.log(`Worker ${this.id} initialized successfully`, 'info');
        }
        catch (error) {
            this.log(`Failed to initialize worker ${this.id}: ${error.message}`, 'error');
            this.emitEvent({ type: 'error', workerId: this.id, error: error, timestamp: new Date() });
            throw error;
        }
    }
    async start() {
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
        }
        catch (error) {
            this.log(`Failed to start worker ${this.id}: ${error.message}`, 'error');
            this.emitEvent({ type: 'error', workerId: this.id, error: error, timestamp: new Date() });
            throw error;
        }
    }
    async stop(timeoutMs = 30000) {
        if (!this.isStarted) {
            this.log(`Worker ${this.id} not started. Nothing to stop.`, 'info');
            return true;
        }
        this.log(`Stopping worker ${this.id} (timeout: ${timeoutMs}ms)...`, 'info');
        // Stop health check timer
        this.stopHealthCheckTimer();
        // Race between shutdown and timeout
        const stopPromise = this.doStop();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Stop timeout')), timeoutMs));
        try {
            await Promise.race([stopPromise, timeoutPromise]);
            this.isStarted = false;
            this.emitEvent({ type: 'stopped', workerId: this.id, reason: 'graceful', timestamp: new Date() });
            this.log(`Worker ${this.id} stopped successfully`, 'info');
            return true;
        }
        catch (error) {
            if (error.message === 'Stop timeout') {
                this.log(`Worker ${this.id} stop timed out after ${timeoutMs}ms`, 'error');
                this.emitEvent({ type: 'stopped', workerId: this.id, reason: 'timeout', timestamp: new Date() });
                return false;
            }
            this.log(`Error stopping worker ${this.id}: ${error.message}`, 'error');
            this.emitEvent({ type: 'error', workerId: this.id, error: error, timestamp: new Date() });
            throw error;
        }
    }
    async healthCheck() {
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
            const health = {
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
        }
        catch (error) {
            this.errorCount++;
            this.lastError = error.message;
            this.emitEvent({ type: 'error', workerId: this.id, error: error, timestamp: new Date() });
            return {
                status: 'unhealthy',
                latencyMs: Date.now() - startTime,
                errorCount: this.errorCount,
                lastError: this.lastError,
                uptimeMs: this.startTime ? Date.now() - this.startTime.getTime() : 0,
                lastOperationAt: this.lastOperationAt,
                details: { error: error.message },
            };
        }
    }
    getMetrics() {
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
    resetMetrics() {
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
     */
    async executeOperation(name, operation) {
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
            return result;
        }
        catch (error) {
            // Record failure metrics
            const latencyMs = Date.now() - startTime;
            this.recordLatency(latencyMs);
            this.metrics.failureCount++;
            this.errorCount++;
            this.lastError = error.message;
            this.errorRecovery.recordFailure(error);
            this.emitEvent({ type: 'error', workerId: this.id, error: error, timestamp: new Date() });
            throw error;
        }
    }
    /**
     * Log message with worker context.
     */
    log(message, level) {
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
    emitEvent(event) {
        this.eventEmitter?.emit(event);
    }
    /**
     * Record operation latency for metrics.
     */
    recordLatency(latencyMs) {
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
    calculateAverageLatency() {
        if (this.recentLatencies.length === 0)
            return 0;
        const sum = this.recentLatencies.reduce((a, b) => a + b, 0);
        return sum / this.recentLatencies.length;
    }
    /**
     * Determine health status based on latency and error rate.
     */
    determineHealthStatus(latencyMs) {
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
    startHealthCheckTimer() {
        if (this.healthCheckTimer)
            return;
        this.healthCheckTimer = setInterval(() => void this.healthCheck(), this.config.healthCheckIntervalMs);
    }
    /**
     * Stop health check timer.
     */
    stopHealthCheckTimer() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = undefined;
        }
    }
}
