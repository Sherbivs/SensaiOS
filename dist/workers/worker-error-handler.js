/**
 * Worker-Specific Error Handler
 * Purpose: Recognize and enrich background worker errors (crashes, timeouts, scheduler issues)
 * Integrates with ErrorTracker for centralized error capture
 *
 * @module workers/worker-error-handler
 */
import { errorTracker } from '../services/monitoring/error-tracker.js';
/// ---- Worker Error Handler ----
export class WorkerErrorHandler {
    /**
     * Handle worker crash errors
     * Critical as workers are essential for background operations
     */
    async handleWorkerCrash(workerName, error, context = {}) {
        const errorContext = {
            ...context,
            category: 'WORKER',
            severity: this.classifyWorkerCrashSeverity(workerName, error),
            service: 'workers',
            operation: 'worker-execution',
            workerName,
            customData: {
                ...context.customData,
                workerType: this.detectWorkerType(workerName),
                crashStage: this.detectCrashStage(error),
                isRecoverable: this.isRecoverableError(error),
            },
        };
        return errorTracker.captureError(error, errorContext);
    }
    /**
     * Handle worker timeout errors
     * Occurs when worker execution exceeds expected duration
     */
    async handleWorkerTimeout(workerName, taskName, expectedDuration, actualDuration) {
        const timeoutError = new Error(`Worker timeout: ${workerName}.${taskName} exceeded ${expectedDuration}ms (took ${actualDuration}ms)`);
        timeoutError.name = 'WorkerTimeoutError';
        const context = {
            category: 'WORKER',
            severity: this.classifyTimeoutSeverity(workerName, actualDuration, expectedDuration),
            service: 'workers',
            operation: 'worker-timeout',
            workerName,
            taskName,
            customData: {
                expectedDuration,
                actualDuration,
                exceedPercentage: ((actualDuration - expectedDuration) / expectedDuration) * 100,
                workerType: this.detectWorkerType(workerName),
            },
        };
        return errorTracker.captureError(timeoutError, context);
    }
    /**
     * Handle scheduler errors
     * Issues with worker scheduling or interval management
     */
    async handleSchedulerError(error, jobName, scheduledInterval) {
        const context = {
            category: 'WORKER',
            severity: 'MEDIUM',
            service: 'worker-scheduler',
            operation: 'job-scheduling',
            taskName: jobName,
            scheduledInterval,
            customData: {
                jobName,
                scheduledInterval,
                errorType: error.name,
                isStartupError: error.message.includes('initialization') || error.message.includes('startup'),
            },
        };
        return errorTracker.captureError(error, context);
    }
    /**
     * Handle background task execution errors
     * Generic handler for any background task failure
     */
    async handleTaskError(error, workerName, taskName, context = {}) {
        const errorContext = {
            ...context,
            category: 'WORKER',
            severity: this.classifyTaskErrorSeverity(error, workerName),
            service: 'workers',
            operation: 'task-execution',
            workerName,
            taskName,
            customData: {
                ...context.customData,
                taskType: this.detectTaskType(taskName),
                executionCount: context.executionCount,
                averageExecutionTime: context.lastExecutionTime,
            },
        };
        return errorTracker.captureError(error, errorContext);
    }
    /**
     * Handle data pipeline errors
     * Specific to data refresh/update workers
     */
    async handleDataPipelineError(error, pipelineStage, recordsProcessed, recordsFailed) {
        const context = {
            category: 'WORKER',
            severity: this.classifyDataPipelineErrorSeverity(recordsProcessed, recordsFailed),
            service: 'data-pipeline',
            operation: pipelineStage,
            customData: {
                pipelineStage,
                recordsProcessed,
                recordsFailed,
                failureRate: recordsFailed / (recordsProcessed + recordsFailed),
                isPartialFailure: recordsProcessed > 0,
            },
        };
        return errorTracker.captureError(error, context);
    }
    /**
     * Handle cache refresh errors
     * Specific to cache maintenance workers
     */
    async handleCacheRefreshError(error, cacheName, operation) {
        const context = {
            category: 'CACHE',
            severity: operation === 'refresh' ? 'HIGH' : 'MEDIUM',
            service: 'cache-worker',
            operation: `cache-${operation}`,
            customData: {
                cacheName,
                cacheOperation: operation,
                errorType: error.name,
            },
        };
        return errorTracker.captureError(error, context);
    }
    /**
     * Handle database sync errors
     * Specific to DB replication workers
     */
    async handleDatabaseSyncError(error, source, target, recordsSynced) {
        const context = {
            category: 'DATABASE',
            severity: 'CRITICAL', // DB sync failures are critical
            service: 'db-sync-worker',
            operation: 'database-sync',
            customData: {
                source,
                target,
                recordsSynced,
                syncDirection: `${source} → ${target}`,
                errorType: error.name,
            },
        };
        return errorTracker.captureError(error, context);
    }
    /// ---- Private Helpers ----
    classifyWorkerCrashSeverity(workerName, error) {
        // Critical workers: database sync, cache refresh, security bot
        const criticalWorkers = ['db-sync', 'cache-refresh', 'security'];
        if (criticalWorkers.some(w => workerName.toLowerCase().includes(w))) {
            return 'CRITICAL';
        }
        // Database errors in workers are CRITICAL
        if (error.name.includes('Prisma') || error.message.includes('database')) {
            return 'CRITICAL';
        }
        // Memory errors are CRITICAL
        if (error.message.includes('memory') || error.message.includes('heap')) {
            return 'CRITICAL';
        }
        // High-frequency workers are HIGH severity
        const highFrequencyWorkers = ['buffer-flush', 'outbox', 'cache'];
        if (highFrequencyWorkers.some(w => workerName.toLowerCase().includes(w))) {
            return 'HIGH';
        }
        return 'MEDIUM';
    }
    classifyTimeoutSeverity(workerName, actualDuration, expectedDuration) {
        const exceedPercentage = ((actualDuration - expectedDuration) / expectedDuration) * 100;
        // Extreme timeout (>10x expected) is CRITICAL
        if (exceedPercentage > 1000) {
            return 'CRITICAL';
        }
        // Significant timeout (>5x expected) is HIGH
        if (exceedPercentage > 500) {
            return 'HIGH';
        }
        // Moderate timeout (>2x expected) is MEDIUM
        if (exceedPercentage > 200) {
            return 'MEDIUM';
        }
        return 'LOW';
    }
    classifyTaskErrorSeverity(error, _workerName) {
        // Database errors are CRITICAL
        if (error.name.includes('Prisma') || error.message.includes('database')) {
            return 'CRITICAL';
        }
        // Network errors are MEDIUM (retryable)
        if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
            return 'MEDIUM';
        }
        // Validation errors are LOW (expected)
        if (error.message.includes('validation') || error.message.includes('invalid')) {
            return 'LOW';
        }
        return 'MEDIUM';
    }
    classifyDataPipelineErrorSeverity(recordsProcessed, recordsFailed) {
        const failureRate = recordsFailed / (recordsProcessed + recordsFailed);
        // 100% failure rate is CRITICAL
        if (failureRate === 1) {
            return 'CRITICAL';
        }
        // >50% failure rate is HIGH
        if (failureRate > 0.5) {
            return 'HIGH';
        }
        // >10% failure rate is MEDIUM
        if (failureRate > 0.1) {
            return 'MEDIUM';
        }
        return 'LOW';
    }
    detectWorkerType(workerName) {
        const name = workerName.toLowerCase();
        if (name.includes('cache'))
            return 'cache-maintenance';
        if (name.includes('buffer'))
            return 'buffer-flush';
        if (name.includes('sync'))
            return 'database-sync';
        if (name.includes('outbox'))
            return 'message-delivery';
        if (name.includes('data') || name.includes('pipeline'))
            return 'data-refresh';
        if (name.includes('security'))
            return 'security-monitor';
        if (name.includes('engine'))
            return 'engine-maintenance';
        return 'unknown';
    }
    detectCrashStage(error) {
        const message = error.message.toLowerCase();
        if (message.includes('initialization') || message.includes('startup')) {
            return 'initialization';
        }
        if (message.includes('execution') || message.includes('run')) {
            return 'execution';
        }
        if (message.includes('cleanup') || message.includes('shutdown')) {
            return 'cleanup';
        }
        return 'unknown';
    }
    detectTaskType(taskName) {
        const name = taskName.toLowerCase();
        if (name.includes('refresh'))
            return 'refresh';
        if (name.includes('cleanup'))
            return 'cleanup';
        if (name.includes('sync'))
            return 'sync';
        if (name.includes('validate'))
            return 'validation';
        if (name.includes('process'))
            return 'processing';
        if (name.includes('flush'))
            return 'flush';
        return 'unknown';
    }
    isRecoverableError(error) {
        const message = error.message.toLowerCase();
        // Network errors are recoverable (retry)
        if (message.includes('network') || message.includes('timeout') || message.includes('econnrefused')) {
            return true;
        }
        // Temporary errors are recoverable
        if (message.includes('temporary') || message.includes('retry')) {
            return true;
        }
        // Memory errors are NOT recoverable
        if (message.includes('memory') || message.includes('heap')) {
            return false;
        }
        // Database errors are sometimes recoverable
        if (error.name.includes('Prisma')) {
            return message.includes('timeout') || message.includes('connection');
        }
        return true; // Default to recoverable
    }
}
// Singleton instance
export const workerErrorHandler = new WorkerErrorHandler();
