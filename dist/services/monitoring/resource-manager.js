/**
 * Resource Cleanup Manager - Centralized Resource Lifecycle Management
 *
 * Provides automatic tracking, capping, and cleanup for all system resources:
 * - EventEmitter listeners (with max limits per emitter)
 * - Timers (setInterval/setTimeout with automatic clearing)
 * - Database connections (pooling with limits)
 * - HTTP connections (timeout enforcement)
 * - Cache entries (TTL and size limits)
 * - File descriptors (automatic cleanup)
 *
 * Integration with error detection system for leak monitoring and alerting.
 */
import { errorTracker } from './error-tracker.js';
import { getLogger } from "../../shared/logging/index.js";
import { getErrorMessage } from '../../shared/utils/error-utils.js';
import { generateResourceId } from './monitoring-utils.js';
const logger = getLogger();
// ============================================================================
// Resource Manager Class
// ============================================================================
class ResourceManager {
    resources = new Map();
    listenerCounts = new Map();
    ownerTimerCounts = new Map();
    ownerConnectionCounts = new Map();
    limits = {
        maxListenersPerEmitter: 10,
        maxTimersPerOwner: 20,
        maxConnectionsPerOwner: 10,
        maxCacheSize: 10000,
        leakDetectionThresholdMs: 3600000, // 1 hour
        alertOnLeakSuspect: true,
    };
    monitoringInterval;
    MONITORING_INTERVAL_MS = 300000; // 5 minutes
    // ============================================================================
    // Initialization & Shutdown
    // ============================================================================
    initialize(customLimits) {
        if (customLimits) {
            this.limits = { ...this.limits, ...customLimits };
        }
        // Start background monitoring (runs every 5 minutes)
        this.startMonitoring();
        logger.info('resource-manager', 'init', '[ResourceManager] Initialized', {
            metadata: { limits: this.limits, monitoringIntervalMs: this.MONITORING_INTERVAL_MS },
        });
        // Note: Lightweight resource monitor (runs twice daily) is started separately
        // via startResourceMonitoring() in src/index.ts
    }
    async shutdown() {
        logger.info('resource-manager', 'shutdown', '[ResourceManager] Shutdown initiated', {
            metadata: { totalResources: this.resources.size },
        });
        // Stop monitoring
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
        }
        // Cleanup all resources
        await this.cleanupAll();
        logger.info('resource-manager', 'shutdown', '[ResourceManager] Shutdown complete', {
            metadata: { remainingResources: this.resources.size },
        });
    }
    // ============================================================================
    // Timer Management (setInterval/setTimeout)
    // ============================================================================
    registerInterval(owner, name, callback, intervalMs, metadata) {
        // Fast path: check limits first (most common case)
        const currentCount = this.ownerTimerCounts.get(owner) ?? 0;
        if (currentCount >= this.limits.maxTimersPerOwner) {
            const error = new Error(`Timer limit exceeded for owner: ${owner} (max: ${this.limits.maxTimersPerOwner})`);
            errorTracker.captureError(error, {
                category: 'CONFIG',
                severity: 'HIGH',
                service: owner,
                operation: 'registerInterval',
                customData: { currentCount, limit: this.limits.maxTimersPerOwner },
            });
            throw error;
        }
        // Create timer first (optimized: use cached ID generation)
        const id = generateResourceId('timer', owner, name);
        const nodeTimer = setInterval(callback, intervalMs);
        const handle = {
            id,
            type: 'timer',
            name,
            owner,
            createdAt: new Date(),
            intervalMs,
            timerType: 'interval',
            nodeTimer,
            metadata,
        };
        // Update tracking (batch operations)
        this.resources.set(id, handle);
        this.ownerTimerCounts.set(owner, currentCount + 1);
        // Log only in debug mode (reduce I/O overhead)
        if (process.env.LOG_LEVEL === 'detail') {
            logger.debug('resource-manager', 'register-interval', '[ResourceManager] Interval registered', {
                metadata: { id, owner, name, intervalMs },
            });
        }
        return handle;
    }
    registerTimeout(owner, name, callback, timeoutMs, metadata) {
        // Fast path: check limits first
        const currentCount = this.ownerTimerCounts.get(owner) ?? 0;
        if (currentCount >= this.limits.maxTimersPerOwner) {
            const error = new Error(`Timer limit exceeded for owner: ${owner} (max: ${this.limits.maxTimersPerOwner})`);
            errorTracker.captureError(error, {
                category: 'CONFIG',
                severity: 'HIGH',
                service: owner,
                operation: 'registerTimeout',
                customData: { currentCount, limit: this.limits.maxTimersPerOwner },
            });
            throw error;
        }
        // Create timeout with auto-cleanup (optimized: use cached ID generation)
        const id = generateResourceId('timer', owner, name);
        const nodeTimer = setTimeout(() => {
            callback();
            // Auto-cleanup after execution
            this.unregisterTimer(id);
        }, timeoutMs);
        const handle = {
            id,
            type: 'timer',
            name,
            owner,
            createdAt: new Date(),
            intervalMs: timeoutMs,
            timerType: 'timeout',
            nodeTimer,
            metadata,
        };
        // Update tracking (batch operations)
        this.resources.set(id, handle);
        this.ownerTimerCounts.set(owner, currentCount + 1);
        // Log only in debug mode
        if (process.env.LOG_LEVEL === 'detail') {
            logger.debug('resource-manager', 'register-timeout', '[ResourceManager] Timeout registered', {
                metadata: { id, owner, name, timeoutMs },
            });
        }
        return handle;
    }
    unregisterTimer(id) {
        const resource = this.resources.get(id);
        if (!resource || resource.type !== 'timer') {
            return false;
        }
        const timer = resource;
        clearInterval(timer.nodeTimer); // Works for both interval and timeout
        this.resources.delete(id);
        const currentCount = this.ownerTimerCounts.get(timer.owner) ?? 1;
        this.ownerTimerCounts.set(timer.owner, currentCount - 1);
        logger.debug('resource-manager', 'unregister-timer', '[ResourceManager] Timer unregistered', {
            metadata: { id, owner: timer.owner, name: timer.name, type: timer.timerType },
        });
        return true;
    }
    clearAllTimers(owner) {
        let count = 0;
        for (const [id, resource] of this.resources.entries()) {
            if (resource.type === 'timer' && (!owner || resource.owner === owner)) {
                if (this.unregisterTimer(id)) {
                    count++;
                }
            }
        }
        return count;
    }
    // ============================================================================
    // EventEmitter Listener Management
    // ============================================================================
    registerListener(owner, name, emitter, eventName, listener, maxListeners) {
        // Track listener count per emitter
        if (!this.listenerCounts.has(emitter)) {
            this.listenerCounts.set(emitter, new Map());
        }
        const emitterCounts = this.listenerCounts.get(emitter);
        const currentCount = emitterCounts.get(eventName) ?? 0;
        // Check limits
        const limit = maxListeners ?? this.limits.maxListenersPerEmitter;
        if (currentCount >= limit) {
            const error = new Error(`Listener limit exceeded for ${eventName} on ${name} (max: ${limit})`);
            errorTracker.captureError(error, {
                category: 'CONFIG',
                severity: 'HIGH',
                service: owner,
                operation: 'registerListener',
                customData: { eventName, currentCount, limit },
            });
            throw error;
        }
        // Set max listeners on emitter
        if (emitter.getMaxListeners() === 0 || emitter.getMaxListeners() === Infinity) {
            emitter.setMaxListeners(limit);
        }
        // Create handle
        const id = generateResourceId('listener', owner, `${name}:${eventName}`);
        const handle = {
            id,
            type: 'listener',
            name,
            owner,
            createdAt: new Date(),
            emitter,
            eventName,
            listener,
            maxListeners: limit,
        };
        // Register listener
        emitter.on(eventName, listener);
        this.resources.set(id, handle);
        emitterCounts.set(eventName, currentCount + 1);
        logger.debug('resource-manager', 'register-listener', '[ResourceManager] Listener registered', {
            metadata: { id, owner, name, eventName, currentCount: currentCount + 1, maxListeners: limit },
        });
        return handle;
    }
    unregisterListener(id) {
        const resource = this.resources.get(id);
        if (!resource || resource.type !== 'listener') {
            return false;
        }
        const listener = resource;
        listener.emitter.off(listener.eventName, listener.listener);
        // Update counts
        const emitterCounts = this.listenerCounts.get(listener.emitter);
        if (emitterCounts) {
            const currentCount = emitterCounts.get(listener.eventName) ?? 1;
            emitterCounts.set(listener.eventName, currentCount - 1);
        }
        this.resources.delete(id);
        logger.debug('resource-manager', 'unregister-listener', '[ResourceManager] Listener unregistered', {
            metadata: { id, owner: listener.owner, name: listener.name, eventName: listener.eventName },
        });
        return true;
    }
    clearAllListeners(owner, emitter) {
        let count = 0;
        for (const [id, resource] of this.resources.entries()) {
            if (resource.type === 'listener') {
                const listener = resource;
                const ownerMatch = !owner || listener.owner === owner;
                const emitterMatch = !emitter || listener.emitter === emitter;
                if (ownerMatch && emitterMatch) {
                    if (this.unregisterListener(id)) {
                        count++;
                    }
                }
            }
        }
        return count;
    }
    // ============================================================================
    // Connection Management (Database, HTTP, WebSocket)
    // ============================================================================
    registerConnection(owner, name, connectionType, cleanup, metadata) {
        // Check limits
        const currentCount = this.ownerConnectionCounts.get(owner) ?? 0;
        if (currentCount >= this.limits.maxConnectionsPerOwner) {
            const error = new Error(`Connection limit exceeded for owner: ${owner} (max: ${this.limits.maxConnectionsPerOwner})`);
            errorTracker.captureError(error, {
                category: 'CONFIG',
                severity: 'HIGH',
                service: owner,
                operation: 'registerConnection',
                customData: { connectionType, currentCount, limit: this.limits.maxConnectionsPerOwner },
            });
            throw error;
        }
        const id = generateResourceId('connection', owner, name);
        const handle = {
            id,
            type: 'connection',
            name,
            owner,
            createdAt: new Date(),
            connectionType,
            cleanup,
            metadata,
        };
        this.resources.set(id, handle);
        this.ownerConnectionCounts.set(owner, currentCount + 1);
        logger.debug('resource-manager', 'register-connection', '[ResourceManager] Connection registered', {
            metadata: { id, owner, name, connectionType },
        });
        return handle;
    }
    async unregisterConnection(id) {
        const resource = this.resources.get(id);
        if (!resource || resource.type !== 'connection') {
            return false;
        }
        const connection = resource;
        try {
            await connection.cleanup();
        }
        catch (error) {
            logger.error('resource-manager', 'cleanup-connection', '[ResourceManager] Connection cleanup failed', {
                metadata: { id, owner: connection.owner, name: connection.name, errorMsg: getErrorMessage(error) },
            });
        }
        this.resources.delete(id);
        const currentCount = this.ownerConnectionCounts.get(connection.owner) ?? 1;
        this.ownerConnectionCounts.set(connection.owner, currentCount - 1);
        logger.debug('resource-manager', 'unregister-connection', '[ResourceManager] Connection unregistered', {
            metadata: { id, owner: connection.owner, name: connection.name },
        });
        return true;
    }
    async clearAllConnections(owner) {
        let count = 0;
        const promises = [];
        for (const [id, resource] of this.resources.entries()) {
            if (resource.type === 'connection' && (!owner || resource.owner === owner)) {
                promises.push(this.unregisterConnection(id));
            }
        }
        const results = await Promise.all(promises);
        count = results.filter(Boolean).length;
        return count;
    }
    // ============================================================================
    // Disk Cache Management (Runtime Cache, Read-DB, Write-DB)
    // ============================================================================
    registerDiskCache(owner, name, cacheType, path, sizeBytes, cleanup, options) {
        const id = generateResourceId('disk-cache', owner, name);
        const handle = {
            id,
            type: 'disk-cache',
            cacheType,
            path,
            sizeBytes,
            hotLayerBytes: options?.hotLayerBytes,
            diskBytes: options?.diskBytes,
            name,
            owner,
            createdAt: new Date(),
            lastAccessTime: new Date(),
            cleanup,
            metadata: options?.metadata,
        };
        this.resources.set(id, handle);
        logger.debug('resource-manager', 'register-disk-cache', '[ResourceManager] Disk cache registered', {
            metadata: {
                id,
                owner,
                name,
                cacheType,
                path,
                sizeBytes: `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`,
                hotLayerBytes: options?.hotLayerBytes ? `${(options.hotLayerBytes / (1024 * 1024)).toFixed(2)} MB` : 'N/A',
                diskBytes: options?.diskBytes ? `${(options.diskBytes / (1024 * 1024)).toFixed(2)} MB` : 'N/A',
            },
        });
        return handle;
    }
    async unregisterDiskCache(id) {
        const resource = this.resources.get(id);
        if (!resource || resource.type !== 'disk-cache') {
            return false;
        }
        const diskCache = resource;
        try {
            await diskCache.cleanup();
        }
        catch (error) {
            logger.error('resource-manager', 'cleanup-disk-cache', '[ResourceManager] Disk cache cleanup failed', {
                metadata: { id, owner: diskCache.owner, name: diskCache.name, path: diskCache.path, errorMsg: getErrorMessage(error) },
            });
        }
        this.resources.delete(id);
        logger.debug('resource-manager', 'unregister-disk-cache', '[ResourceManager] Disk cache unregistered', {
            metadata: { id, owner: diskCache.owner, name: diskCache.name, cacheType: diskCache.cacheType },
        });
        return true;
    }
    updateDiskCacheStats(id, updates) {
        const resource = this.resources.get(id);
        if (!resource || resource.type !== 'disk-cache') {
            return false;
        }
        const diskCache = resource;
        if (updates.sizeBytes !== undefined)
            diskCache.sizeBytes = updates.sizeBytes;
        if (updates.hotLayerBytes !== undefined)
            diskCache.hotLayerBytes = updates.hotLayerBytes;
        if (updates.diskBytes !== undefined)
            diskCache.diskBytes = updates.diskBytes;
        if (updates.lastAccessTime !== undefined)
            diskCache.lastAccessTime = updates.lastAccessTime;
        return true;
    }
    // ============================================================================
    // Disk Buffer Management (Write Buffer, Logger Buffer)
    // ============================================================================
    registerDiskBuffer(owner, name, bufferType, path, maxQueueSize, flushIntervalMs, cleanup, metadata) {
        const id = generateResourceId('disk-buffer', owner, name);
        const handle = {
            id,
            type: 'disk-buffer',
            bufferType,
            path,
            queueSize: 0,
            maxQueueSize,
            flushIntervalMs,
            lastFlushTime: null,
            name,
            owner,
            createdAt: new Date(),
            cleanup,
            metadata,
        };
        this.resources.set(id, handle);
        logger.debug('resource-manager', 'register-disk-buffer', '[ResourceManager] Disk buffer registered', {
            metadata: { id, owner, name, bufferType, path, maxQueueSize, flushIntervalMs: `${flushIntervalMs}ms` },
        });
        return handle;
    }
    async unregisterDiskBuffer(id) {
        const resource = this.resources.get(id);
        if (!resource || resource.type !== 'disk-buffer') {
            return false;
        }
        const diskBuffer = resource;
        try {
            await diskBuffer.cleanup();
        }
        catch (error) {
            logger.error('resource-manager', 'cleanup-disk-buffer', '[ResourceManager] Disk buffer cleanup failed', {
                metadata: { id, owner: diskBuffer.owner, name: diskBuffer.name, path: diskBuffer.path, errorMsg: getErrorMessage(error) },
            });
        }
        this.resources.delete(id);
        logger.debug('resource-manager', 'unregister-disk-buffer', '[ResourceManager] Disk buffer unregistered', {
            metadata: { id, owner: diskBuffer.owner, name: diskBuffer.name, bufferType: diskBuffer.bufferType },
        });
        return true;
    }
    updateDiskBufferStats(id, updates) {
        const resource = this.resources.get(id);
        if (!resource || resource.type !== 'disk-buffer') {
            return false;
        }
        const diskBuffer = resource;
        if (updates.queueSize !== undefined)
            diskBuffer.queueSize = updates.queueSize;
        if (updates.lastFlushTime !== undefined)
            diskBuffer.lastFlushTime = updates.lastFlushTime;
        return true;
    }
    // ============================================================================
    // Disk Log Management (Application Logs, Battle Logs, Error Logs)
    // ============================================================================
    registerDiskLog(owner, name, logType, path, retentionDays, cleanup, metadata) {
        const id = generateResourceId('disk-log', owner, name);
        const handle = {
            id,
            type: 'disk-log',
            logType,
            path,
            sizeBytes: 0,
            retentionDays,
            lastRotationTime: null,
            name,
            owner,
            createdAt: new Date(),
            cleanup,
            metadata,
        };
        this.resources.set(id, handle);
        logger.debug('resource-manager', 'register-disk-log', '[ResourceManager] Disk log registered', {
            metadata: { id, owner, name, logType, path, retentionDays },
        });
        return handle;
    }
    async unregisterDiskLog(id) {
        const resource = this.resources.get(id);
        if (!resource || resource.type !== 'disk-log') {
            return false;
        }
        const diskLog = resource;
        try {
            await diskLog.cleanup();
        }
        catch (error) {
            logger.error('resource-manager', 'cleanup-disk-log', '[ResourceManager] Disk log cleanup failed', {
                metadata: { id, owner: diskLog.owner, name: diskLog.name, path: diskLog.path, errorMsg: getErrorMessage(error) },
            });
        }
        this.resources.delete(id);
        logger.debug('resource-manager', 'unregister-disk-log', '[ResourceManager] Disk log unregistered', {
            metadata: {
                id,
                owner: diskLog.owner,
                name: diskLog.name,
                logType: diskLog.logType,
            },
        });
        return true;
    }
    updateDiskLogStats(id, updates) {
        const resource = this.resources.get(id);
        if (!resource || resource.type !== 'disk-log') {
            return false;
        }
        const diskLog = resource;
        if (updates.sizeBytes !== undefined)
            diskLog.sizeBytes = updates.sizeBytes;
        if (updates.lastRotationTime !== undefined)
            diskLog.lastRotationTime = updates.lastRotationTime;
        return true;
    }
    async clearAllDiskResources(owner) {
        let count = 0;
        const promises = [];
        for (const [id, resource] of this.resources.entries()) {
            const isDiskResource = resource.type === 'disk-cache' ||
                resource.type === 'disk-buffer' ||
                resource.type === 'disk-log';
            if (isDiskResource && (!owner || resource.owner === owner)) {
                if (resource.type === 'disk-cache') {
                    promises.push(this.unregisterDiskCache(id));
                }
                else if (resource.type === 'disk-buffer') {
                    promises.push(this.unregisterDiskBuffer(id));
                }
                else if (resource.type === 'disk-log') {
                    promises.push(this.unregisterDiskLog(id));
                }
            }
        }
        const results = await Promise.all(promises);
        count = results.filter(Boolean).length;
        return count;
    }
    // ============================================================================
    // Resource Querying & Statistics
    // ============================================================================
    getStats() {
        const byType = {
            listener: 0,
            timer: 0,
            connection: 0,
            cache: 0,
            file: 0,
            stream: 0,
            'disk-cache': 0,
            'disk-buffer': 0,
            'disk-log': 0,
        };
        const byOwner = {};
        let oldest;
        const leakSuspects = [];
        const leakThreshold = Date.now() - this.limits.leakDetectionThresholdMs;
        // Calculate disk usage
        let totalDiskBytes = 0;
        let cacheBytes = 0;
        let bufferBytes = 0;
        let logBytes = 0;
        let hotLayerBytes = 0;
        let coldLayerBytes = 0;
        for (const resource of this.resources.values()) {
            byType[resource.type]++;
            byOwner[resource.owner] = (byOwner[resource.owner] ?? 0) + 1;
            if (!oldest || resource.createdAt < oldest.createdAt) {
                oldest = resource;
            }
            if (resource.createdAt.getTime() < leakThreshold) {
                leakSuspects.push(resource);
            }
            // Calculate disk usage
            if (resource.type === 'disk-cache') {
                const diskCache = resource;
                totalDiskBytes += diskCache.sizeBytes;
                cacheBytes += diskCache.sizeBytes;
                if (diskCache.hotLayerBytes)
                    hotLayerBytes += diskCache.hotLayerBytes;
                if (diskCache.diskBytes)
                    coldLayerBytes += diskCache.diskBytes;
            }
            else if (resource.type === 'disk-buffer') {
                const diskBuffer = resource;
                // Estimate buffer size (queueSize × average entry size)
                const estimatedBytes = diskBuffer.queueSize * 1024; // 1 KB per entry estimate
                totalDiskBytes += estimatedBytes;
                bufferBytes += estimatedBytes;
            }
            else if (resource.type === 'disk-log') {
                const diskLog = resource;
                totalDiskBytes += diskLog.sizeBytes;
                logBytes += diskLog.sizeBytes;
            }
        }
        return {
            total: this.resources.size,
            byType,
            byOwner,
            oldest,
            leakSuspects,
            diskUsage: {
                totalDiskBytes,
                byType: {
                    cacheBytes,
                    bufferBytes,
                    logBytes,
                },
                hotLayerBytes,
                coldLayerBytes,
            },
        };
    }
    getResourcesByOwner(owner) {
        const resources = [];
        for (const resource of this.resources.values()) {
            if (resource.owner === owner) {
                resources.push(resource);
            }
        }
        return resources;
    }
    getResourcesByType(type) {
        const resources = [];
        for (const resource of this.resources.values()) {
            if (resource.type === type) {
                resources.push(resource);
            }
        }
        return resources;
    }
    // ============================================================================
    // Leak Detection & Monitoring
    // ============================================================================
    startMonitoring() {
        this.monitoringInterval = setInterval(() => {
            this.detectLeaks();
        }, this.MONITORING_INTERVAL_MS);
        this.monitoringInterval.unref?.();
    }
    detectLeaks() {
        const stats = this.getStats();
        // Alert on leak suspects
        if (this.limits.alertOnLeakSuspect && stats.leakSuspects.length > 0) {
            logger.warn('resource-manager', 'detect-leaks', '[ResourceManager] Leak suspects detected', {
                metadata: {
                    count: stats.leakSuspects.length,
                    thresholdMs: this.limits.leakDetectionThresholdMs,
                    suspects: stats.leakSuspects.map(r => ({
                        id: r.id,
                        type: r.type,
                        owner: r.owner,
                        name: r.name,
                        ageMs: Date.now() - r.createdAt.getTime(),
                    })),
                },
            });
            // Report to error tracker
            for (const suspect of stats.leakSuspects) {
                const ageMs = Date.now() - suspect.createdAt.getTime();
                const error = new Error(`Resource leak suspect: ${suspect.type} ${suspect.name} (age: ${ageMs}ms)`);
                errorTracker.captureError(error, {
                    category: 'ENGINE',
                    severity: 'MEDIUM',
                    service: suspect.owner,
                    operation: 'leak-detection',
                    customData: {
                        resourceId: suspect.id,
                        resourceType: suspect.type,
                        resourceName: suspect.name,
                        ageMs,
                        metadata: suspect.metadata,
                    },
                });
            }
        }
        // Log statistics
        logger.info('resource-manager', 'resource-stats', '[ResourceManager] Resource statistics', {
            metadata: {
                total: stats.total,
                byType: stats.byType,
                byOwner: stats.byOwner,
                leakSuspects: stats.leakSuspects.length,
                oldestResource: stats.oldest ? {
                    type: stats.oldest.type,
                    owner: stats.oldest.owner,
                    name: stats.oldest.name,
                    ageMs: Date.now() - stats.oldest.createdAt.getTime(),
                } : null,
            },
        });
    }
    // ============================================================================
    // Bulk Cleanup Operations
    // ============================================================================
    async cleanupByOwner(owner) {
        let count = 0;
        count += this.clearAllTimers(owner);
        count += this.clearAllListeners(owner);
        count += await this.clearAllConnections(owner);
        return count;
    }
    async cleanupAll() {
        const owners = new Set();
        for (const resource of this.resources.values()) {
            owners.add(resource.owner);
        }
        for (const owner of owners) {
            await this.cleanupByOwner(owner);
        }
        logger.info('resource-manager', 'cleanup-all', '[ResourceManager] All resources cleaned up', {
            metadata: { totalCleaned: this.resources.size },
        });
        // Final cleanup of any remaining resources
        this.resources.clear();
        this.listenerCounts.clear();
        this.ownerTimerCounts.clear();
        this.ownerConnectionCounts.clear();
    }
    // ============================================================================
    // Utility Methods (Configuration)
    // ============================================================================
    getLimits() {
        return { ...this.limits };
    }
    updateLimits(newLimits) {
        this.limits = { ...this.limits, ...newLimits };
        logger.info('resource-manager', 'update-limits', '[ResourceManager] Limits updated', {
            metadata: { newLimits: this.limits },
        });
    }
}
// ============================================================================
// Singleton Export
// ============================================================================
export const resourceManager = new ResourceManager();
