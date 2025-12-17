/**
 * Resource Monitor — Unified Resource & Memory Management
 *
 * ⚠️ IMPORTANT: This module monitors RAM (process memory) ONLY.
 * It does NOT monitor persistent disk (/Store directory).
 *
 * Combines resource tracking with active memory protection:
 * - Periodic health checks (startup + configurable intervals)
 * - Real-time memory guardian (30s polling with automatic pruning)
 * - Resource leak detection and alerting
 * - Integrated with intelligent logger for visibility
 *
 * Memory Protection Levels (Standard Plan: 2 GB RAM):
 * - NORMAL: <1536MB (75%) - Monitor only
 * - WARNING: 1536-1740MB (75-85%) - Preemptive pruning
 * - CRITICAL: 1741-1842MB (85-90%) - Aggressive pruning
 * - EMERGENCY: 1843-2047MB (90-99%) - Nuclear pruning
 *
 * Resource Types (Render Standard Plan):
 * - RAM: 2 GB (2048 MB) — Tracked by this module via process.memoryUsage().rss
 * - Disk: 1 GB (974 MB formatted) — NOT tracked here, see cache systems for disk checks
 *
 * For disk monitoring, see:
 * - src/services/cache/facade.ts — Uses fs.statfsSync() for disk checks
 * - src/config/engine-db-config.ts — Defines disk thresholds (75%, 90%)
 * - docs/RESOURCE-LIMITS-RAM-VS-DISK.md — Complete resource guide
 *
 * Integration: Called from src/index.ts boot() and gracefulShutdown()
 */
import { resourceManager } from './resource-manager.js';
import { getErrorMessage } from '../../shared/utils/error-utils.js';
import logger from '../../utils/intelligent-logger.js';
import { EventBus } from '../../shared/event-bus.js';
import { RESOURCE_MONITOR_INTERVAL_MS } from '../../config/env.js';
// ============================================================================
// Configuration
// ============================================================================
// ⚠️ CRITICAL: These thresholds are for RAM (process memory) ONLY.
// They do NOT apply to persistent disk (/Store directory).
//
// RAM Monitoring (2 GB Standard Plan):
// - Metric: process.memoryUsage().rss (Resident Set Size)
// - Limit: 2048 MB (2 GB)
// - Failure: 100% RAM → OUT OF MEMORY (OOM) → Process crash
//
// Disk Monitoring (1 GB /Store):
// - Metric: df -h /Store (filesystem stats)
// - Limit: 974 MB (formatted size, ~1 GB raw)
// - Failure: 100% Disk → DISK FULL → All writes fail
// - Monitoring: NOT implemented here, see cache systems
//
// See: docs/RESOURCE-LIMITS-RAM-VS-DISK.md for complete distinction
// Standard thresholds aligned with Render Standard plan (2 GB RAM, 1 vCPU)
// Upgraded from Starter (512 MB, 0.5 vCPU) on 2025-11-17
// See: docs/deployment/RESOURCE-MONITOR-STANDARDS.md for complete specification
const MEMORY_THRESHOLDS = {
    planLimitMB: 2048, // 2 GB RAM (Standard plan) — NOT disk space
    emergencyMB: 1843, // 90% - Immediate action required
    criticalMB: 1741, // 85% - Scale or optimize
    warningMB: 1536, // 75% - Monitor closely
    optimalMinMB: 1229, // 60% - Target minimum
    optimalMaxMB: 1536, // 75% - Target maximum
    underutilizedMB: 1024, // 50% - Consider optimization
};
const CPU_THRESHOLDS = {
    planVCPU: 1.0, // 1 full vCPU (Standard plan)
    emergencyPercent: 90,
    criticalPercent: 70,
    warningPercent: 50,
    normalMinPercent: 30,
};
const MONITOR_CONFIG = {
    // Health check interval: Can be configured via environment
    // Default: 12 hours (twice daily)
    // Optimization phase: 5 minutes (set RESOURCE_MONITOR_INTERVAL_MS=300000)
    intervalMs: RESOURCE_MONITOR_INTERVAL_MS,
    // Memory guardian polling: Active memory protection
    // Runs every 30 seconds to catch spikes before OOM
    memoryGuardianIntervalMs: 30000, // 30 seconds
    // GC and prune cooldowns (prevent spam)
    gcCooldownMs: 60000, // 1 minute between forced GC
    pruneCooldownMs: 120000, // 2 minutes between prunes
    // Cleanup monitor history after 7 days
    historyRetentionMs: 7 * 24 * 60 * 60 * 1000,
    // Alert thresholds (aligned with 2 GB Standard plan)
    thresholds: {
        // Resource count limits (scaled for 2 GB capacity)
        totalResourcesWarning: 300, // Increased from 150 (2x for Standard plan)
        totalResourcesCritical: 500, // Increased from 250 (2x for Standard plan)
        // Leak detection (strict - keep as-is)
        leakSuspectsWarning: 5, // Warn if >5 leak suspects
        leakSuspectsCritical: 10, // Critical if >10 leak suspects
        resourceGrowthRate: 1.5, // Warn if resources grow >50% between checks
        // Memory utilization thresholds (aligned with plan specs)
        memoryWarningMB: MEMORY_THRESHOLDS.warningMB, // 1536 MB (75%)
        memoryCriticalMB: MEMORY_THRESHOLDS.criticalMB, // 1741 MB (85%)
        memoryEmergencyMB: MEMORY_THRESHOLDS.emergencyMB, // 1843 MB (90%)
        memoryOptimalMinMB: MEMORY_THRESHOLDS.optimalMinMB, // 1229 MB (60%)
        memoryOptimalMaxMB: MEMORY_THRESHOLDS.optimalMaxMB, // 1536 MB (75%)
        memoryUnderutilizedMB: MEMORY_THRESHOLDS.underutilizedMB, // 256 MB (50%)
        // CPU utilization thresholds
        cpuWarningPercent: CPU_THRESHOLDS.warningPercent, // 50%
        cpuCriticalPercent: CPU_THRESHOLDS.criticalPercent, // 70%
        cpuEmergencyPercent: CPU_THRESHOLDS.emergencyPercent, // 90%
    },
};
// ============================================================================
// Resource Monitor Class
// ============================================================================
class ResourceMonitor {
    monitorTimer;
    memoryGuardianTimer;
    snapshots = [];
    lastSnapshot;
    isRunning = false;
    // Memory guardian state
    registeredCaches = new Map();
    currentPressureLevel = 'NORMAL';
    lastGcAt = 0;
    lastGcTime = 0;
    lastPruneAt = 0;
    lastPruneTime = 0;
    lastNormalLogAt = 0;
    consecutiveHighPressure = 0;
    // DM alert tracking (prevent spam)
    lastAlertSentAt = new Map();
    ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between alerts of same level
    // Memory guardian statistics
    totalPrunesTriggered = 0;
    totalBytesFreed = 0;
    totalGcTriggered = 0;
    // ============================================================================
    // Initialization & Lifecycle
    // ============================================================================
    start() {
        if (this.isRunning) {
            logger.warn('[ResourceMonitor] Already running, skipping start');
            return;
        }
        this.isRunning = true;
        // Run initial health check immediately on startup
        this.runHealthCheck('startup');
        // Start periodic health checks
        this.monitorTimer = setInterval(() => {
            this.runHealthCheck('scheduled');
        }, MONITOR_CONFIG.intervalMs);
        // Start memory guardian polling (30s intervals)
        this.memoryGuardianTimer = setInterval(() => {
            this.checkMemoryAndAct();
        }, MONITOR_CONFIG.memoryGuardianIntervalMs);
        // Take initial memory snapshot
        this.checkMemoryAndAct();
        // Use .unref() to allow process exit without blocking
        this.monitorTimer.unref?.();
        this.memoryGuardianTimer.unref?.();
        // Register with ResourceManager
        try {
            resourceManager.registerInterval('resource-monitor', 'memory-guardian-poll', () => this.checkMemoryAndAct(), MONITOR_CONFIG.memoryGuardianIntervalMs, { critical: true });
        }
        catch (error) {
            logger.warn('[ResourceMonitor] Failed to register with ResourceManager (non-critical)', {
                category: 'SYSTEM',
                data: { error: getErrorMessage(error) },
            });
        }
        logger.info('[ResourceMonitor] Started with integrated memory guardian', {
            category: 'SYSTEM',
            data: {
                healthCheckIntervalHours: MONITOR_CONFIG.intervalMs / (60 * 60 * 1000),
                memoryGuardianIntervalSeconds: MONITOR_CONFIG.memoryGuardianIntervalMs / 1000,
                nextHealthCheckAt: new Date(Date.now() + MONITOR_CONFIG.intervalMs).toISOString(),
                memoryLimits: {
                    normal: `<${MEMORY_THRESHOLDS.warningMB}MB`,
                    warning: `${MEMORY_THRESHOLDS.warningMB}-${MEMORY_THRESHOLDS.criticalMB}MB`,
                    critical: `${MEMORY_THRESHOLDS.criticalMB}-${MEMORY_THRESHOLDS.emergencyMB}MB`,
                    emergency: `${MEMORY_THRESHOLDS.emergencyMB}-${MEMORY_THRESHOLDS.planLimitMB}MB`,
                },
            },
        });
    }
    stop() {
        if (!this.isRunning) {
            return;
        }
        if (this.monitorTimer) {
            clearInterval(this.monitorTimer);
            this.monitorTimer = undefined;
        }
        if (this.memoryGuardianTimer) {
            clearInterval(this.memoryGuardianTimer);
            this.memoryGuardianTimer = undefined;
        }
        this.isRunning = false;
        logger.info('[ResourceMonitor] Stopped', {
            category: 'SYSTEM',
            data: {
                totalChecksRun: this.snapshots.length,
                lastCheckAt: this.lastSnapshot?.timestamp.toISOString(),
                memoryGuardianStats: {
                    totalPrunesTriggered: this.totalPrunesTriggered,
                    totalBytesFreedMB: (this.totalBytesFreed / 1024 / 1024).toFixed(2),
                    totalGcTriggered: this.totalGcTriggered,
                },
            },
        });
    }
    // ============================================================================
    // Cache Registration (Memory Guardian)
    // ============================================================================
    /**
     * Register a prunable cache for coordinated memory management
     */
    registerCache(cache) {
        if (this.registeredCaches.has(cache.name)) {
            logger.warn('[ResourceMonitor] Cache already registered', {
                category: 'SYSTEM',
                data: { cacheName: cache.name },
            });
            return;
        }
        this.registeredCaches.set(cache.name, cache);
        logger.info('[ResourceMonitor] Cache registered for memory management', {
            category: 'SYSTEM',
            data: {
                cacheName: cache.name,
                initialMemoryMB: (cache.getMemoryUsage() / 1024 / 1024).toFixed(2),
                totalCaches: this.registeredCaches.size,
            },
        });
    }
    /**
     * Unregister a cache
     */
    unregisterCache(cacheName) {
        this.registeredCaches.delete(cacheName);
        logger.info('[ResourceMonitor] Cache unregistered', {
            category: 'SYSTEM',
            data: {
                cacheName,
                remainingCaches: this.registeredCaches.size,
            },
        });
    }
    // ============================================================================
    // Memory Guardian Methods
    // ============================================================================
    /**
     * Capture current memory snapshot
     */
    captureMemorySnapshot() {
        const memUsage = process.memoryUsage();
        const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
        const rssMB = memUsage.rss / 1024 / 1024;
        const percentUsed = (rssMB / MEMORY_THRESHOLDS.planLimitMB) * 100;
        const pressureLevel = this.calculatePressureLevel(rssMB);
        return {
            heapUsed: heapUsedMB,
            rss: rssMB,
            percentUsed,
            pressureLevel,
            timestamp: new Date(),
        };
    }
    /**
     * Calculate memory pressure level based on RSS
     */
    calculatePressureLevel(rssMB) {
        if (rssMB >= MEMORY_THRESHOLDS.emergencyMB)
            return 'EMERGENCY';
        if (rssMB >= MEMORY_THRESHOLDS.criticalMB)
            return 'CRITICAL';
        if (rssMB >= MEMORY_THRESHOLDS.warningMB)
            return 'WARNING';
        return 'NORMAL';
    }
    /**
     * Check memory and take action based on pressure level (called every 30s)
     */
    async checkMemoryAndAct() {
        const snapshot = this.captureMemorySnapshot();
        const prevPressure = this.currentPressureLevel;
        this.currentPressureLevel = snapshot.pressureLevel;
        // Log if pressure level changed
        if (prevPressure !== snapshot.pressureLevel) {
            logger.info('[ResourceMonitor] Memory pressure level changed', {
                category: 'SYSTEM',
                data: {
                    from: prevPressure,
                    to: snapshot.pressureLevel,
                    rss: `${snapshot.rss.toFixed(0)}MB`,
                    percentUsed: `${snapshot.percentUsed.toFixed(1)}%`,
                },
            });
        }
        // Take action based on pressure level
        switch (snapshot.pressureLevel) {
            case 'EMERGENCY':
                await this.handleEmergencyPressure(snapshot);
                break;
            case 'CRITICAL':
                await this.handleCriticalPressure(snapshot);
                break;
            case 'WARNING':
                await this.handleWarningPressure(snapshot);
                break;
            case 'NORMAL':
                this.handleNormalPressure(snapshot);
                break;
        }
    }
    /**
     * Handle EMERGENCY pressure (1843-2048 MB) - Nuclear option
     */
    async handleEmergencyPressure(snapshot) {
        logger.error('[ResourceMonitor] EMERGENCY MEMORY PRESSURE - Immediate action required', {
            category: 'SYSTEM',
            data: {
                rss: `${snapshot.rss.toFixed(0)}MB`,
                limit: `${MEMORY_THRESHOLDS.planLimitMB}MB`,
                percentUsed: `${snapshot.percentUsed.toFixed(1)}%`,
                action: 'Emergency prune + Force GC',
            },
        });
        // Send critical DM alert
        this.sendMemoryAlert('EMERGENCY', snapshot);
        // Emergency prune ALL caches (no cooldown)
        for (const [cacheName, cache] of this.registeredCaches) {
            try {
                const before = cache.getMemoryUsage();
                const cleared = await cache.emergencyPrune();
                const after = cache.getMemoryUsage();
                const freed = before - after;
                this.totalPrunesTriggered++;
                this.totalBytesFreed += freed;
                logger.warn(`[ResourceMonitor] Emergency pruned cache: ${cacheName}`, {
                    category: 'SYSTEM',
                    data: {
                        cleared,
                        freedMB: (freed / 1024 / 1024).toFixed(2),
                        beforeMB: (before / 1024 / 1024).toFixed(2),
                        afterMB: (after / 1024 / 1024).toFixed(2),
                    },
                });
            }
            catch (error) {
                logger.error(`[ResourceMonitor] Emergency prune failed for cache: ${cacheName}`, {
                    category: 'SYSTEM',
                    data: { error: getErrorMessage(error) },
                });
            }
        }
        // Force GC (no cooldown in emergency)
        this.forceGarbageCollection();
    }
    /**
     * Handle CRITICAL pressure (435-459 MB) - Aggressive action
     */
    async handleCriticalPressure(snapshot) {
        logger.warn('[ResourceMonitor] CRITICAL MEMORY PRESSURE - Aggressive pruning', {
            category: 'SYSTEM',
            data: {
                rss: `${snapshot.rss.toFixed(0)}MB`,
                percentUsed: `${snapshot.percentUsed.toFixed(1)}%`,
            },
        });
        // Send critical DM alert
        this.sendMemoryAlert('CRITICAL', snapshot);
        // Respect prune cooldown (don't spam pruning)
        const timeSinceLastPrune = Date.now() - this.lastPruneAt;
        if (timeSinceLastPrune < MONITOR_CONFIG.pruneCooldownMs) {
            logger.debug('[ResourceMonitor] Prune on cooldown', {
                category: 'SYSTEM',
                data: {
                    cooldownRemainingSec: ((MONITOR_CONFIG.pruneCooldownMs - timeSinceLastPrune) / 1000).toFixed(0),
                },
            });
            return;
        }
        // Prune all caches normally (target 50% size reduction)
        for (const [cacheName, cache] of this.registeredCaches) {
            try {
                const before = cache.getMemoryUsage();
                const result = await cache.prune(50); // Prune to 50% of current size
                const after = cache.getMemoryUsage();
                const freed = before - after;
                this.totalPrunesTriggered++;
                this.totalBytesFreed += freed;
                logger.info(`[ResourceMonitor] Pruned cache: ${cacheName}`, {
                    category: 'SYSTEM',
                    data: {
                        itemsRemoved: result.itemsRemoved,
                        freedMB: (freed / 1024 / 1024).toFixed(2),
                    },
                });
            }
            catch (error) {
                logger.error(`[ResourceMonitor] Prune failed for cache: ${cacheName}`, {
                    category: 'SYSTEM',
                    data: { error: getErrorMessage(error) },
                });
            }
        }
        this.lastPruneAt = Date.now();
        // Force GC with cooldown
        this.forceGarbageCollection();
    }
    /**
     * Handle WARNING pressure (384-434 MB) - Gentle action
     */
    async handleWarningPressure(snapshot) {
        logger.info('[ResourceMonitor] WARNING MEMORY PRESSURE - Monitoring closely', {
            category: 'SYSTEM',
            data: {
                rss: `${snapshot.rss.toFixed(0)}MB`,
                percentUsed: `${snapshot.percentUsed.toFixed(1)}%`,
            },
        });
        // Just suggest GC (respect cooldown)
        const timeSinceLastGc = Date.now() - this.lastGcAt;
        if (timeSinceLastGc >= MONITOR_CONFIG.gcCooldownMs) {
            this.forceGarbageCollection();
        }
    }
    /**
     * Handle NORMAL pressure (<1536 MB) - All good
     */
    handleNormalPressure(snapshot) {
        // Only log periodically to avoid spam (every 10 minutes)
        const timeSinceLastLog = Date.now() - (this.lastNormalLogAt || 0);
        if (timeSinceLastLog >= 10 * 60 * 1000) {
            logger.debug('[ResourceMonitor] Memory pressure NORMAL', {
                category: 'SYSTEM',
                data: {
                    rss: `${snapshot.rss.toFixed(0)}MB`,
                    percentUsed: `${snapshot.percentUsed.toFixed(1)}%`,
                },
            });
            this.lastNormalLogAt = Date.now();
        }
    }
    /**
     * Force garbage collection with cooldown
     */
    forceGarbageCollection() {
        const timeSinceLastGc = Date.now() - this.lastGcAt;
        // Respect cooldown (except in emergency)
        if (this.currentPressureLevel !== 'EMERGENCY' && timeSinceLastGc < MONITOR_CONFIG.gcCooldownMs) {
            return;
        }
        if (global.gc) {
            global.gc();
            this.lastGcAt = Date.now();
            this.totalGcTriggered++;
            logger.debug('[ResourceMonitor] Forced garbage collection', {
                category: 'SYSTEM',
                data: {
                    pressure: this.currentPressureLevel,
                    totalGcTriggered: this.totalGcTriggered,
                },
            });
        }
        else {
            logger.warn('[ResourceMonitor] global.gc() not available - start with --expose-gc', {
                category: 'SYSTEM',
            });
        }
    }
    /**
     * Send DM alert for memory threshold breach
     * Uses Event Bus for delivery with debouncing to prevent spam
     */
    sendMemoryAlert(level, snapshot) {
        // Check cooldown to prevent alert spam
        const lastSent = this.lastAlertSentAt.get(level) || 0;
        const timeSinceLastAlert = Date.now() - lastSent;
        if (timeSinceLastAlert < this.ALERT_COOLDOWN_MS) {
            logger.debug(`[ResourceMonitor] Skipping ${level} alert (cooldown active)`, {
                category: 'SYSTEM',
                data: {
                    cooldownRemainingSec: ((this.ALERT_COOLDOWN_MS - timeSinceLastAlert) / 1000).toFixed(0),
                },
            });
            return;
        }
        // Update last sent timestamp
        this.lastAlertSentAt.set(level, Date.now());
        // Prepare alert message
        const severity = level === 'EMERGENCY' ? 'critical' : 'security';
        const title = level === 'EMERGENCY'
            ? '🚨 EMERGENCY: Memory Exhaustion Imminent'
            : '🔴 CRITICAL: High Memory Usage Detected';
        const meta = {
            memoryUsage: {
                rss: `${snapshot.rss.toFixed(1)} MB`,
                heapUsed: `${snapshot.heapUsed.toFixed(1)} MB`,
                percentUsed: `${snapshot.percentUsed.toFixed(1)}%`,
                limit: `${MEMORY_THRESHOLDS.planLimitMB} MB`,
            },
            threshold: {
                level,
                triggerPoint: level === 'EMERGENCY' ? '1843 MB (90%)' : '1741 MB (85%)',
            },
            action: {
                immediate: level === 'EMERGENCY' ? 'Emergency cache pruning + Force GC' : 'Aggressive cache pruning',
                recommendation: level === 'EMERGENCY'
                    ? 'Investigate immediately - Risk of OOM crash'
                    : 'Monitor closely - Consider scaling plan if sustained',
            },
            statistics: {
                totalPrunesTriggered: this.totalPrunesTriggered,
                totalGcTriggered: this.totalGcTriggered,
                totalBytesFreedMB: (this.totalBytesFreed / 1024 / 1024).toFixed(2),
            },
            timestamp: new Date().toISOString(),
        };
        try {
            const bus = EventBus.getInstance();
            bus.emit(`alert.${severity}`, {
                severity,
                title,
                meta: JSON.stringify(meta, null, 2),
                timestamp: new Date().toISOString(),
            }, {
                emitter: 'resource-monitor',
            });
            logger.info(`[ResourceMonitor] ${level} memory alert sent to Event Bus`, {
                category: 'SYSTEM',
                data: {
                    severity,
                    rss: `${snapshot.rss.toFixed(0)}MB`,
                    percentUsed: `${snapshot.percentUsed.toFixed(1)}%`,
                },
            });
        }
        catch (error) {
            logger.error('[ResourceMonitor] Failed to send memory alert', {
                category: 'SYSTEM',
                data: {
                    level,
                    error: getErrorMessage(error),
                },
            });
        }
    }
    // ============================================================================
    // Health Check Execution
    // ============================================================================
    runHealthCheck(trigger) {
        const startTime = performance.now();
        try {
            // Get current resource statistics
            const stats = resourceManager.getStats();
            // Capture current memory snapshot
            const memorySnapshot = this.captureMemorySnapshot();
            // Analyze for alerts
            const alerts = this.analyzeStats(stats);
            // Create snapshot
            const snapshot = {
                timestamp: new Date(),
                stats,
                memory: memorySnapshot,
                alerts,
            };
            // Store snapshot
            this.snapshots.push(snapshot);
            this.lastSnapshot = snapshot;
            // Self-cleaning: remove old snapshots
            this.cleanupOldSnapshots();
            // Calculate execution time
            const executionMs = (performance.now() - startTime).toFixed(2);
            // Log results based on severity
            this.logHealthCheckResults(trigger, snapshot, executionMs);
        }
        catch (error) {
            logger.error('[ResourceMonitor] Health check failed', error, {
                category: 'ERROR',
                data: { trigger },
            });
        }
    }
    // ============================================================================
    // Statistics Analysis & Alerting
    // ============================================================================
    analyzeStats(stats) {
        const alerts = [];
        // Get memory and CPU usage
        const memoryUsage = process.memoryUsage();
        const memoryRssMB = memoryUsage.rss / (1024 * 1024);
        const memoryPercent = (memoryRssMB / MEMORY_THRESHOLDS.planLimitMB) * 100;
        // Check 1: Memory utilization (aligned with 2 GB Standard plan)
        if (memoryRssMB >= MONITOR_CONFIG.thresholds.memoryEmergencyMB) {
            alerts.push({
                level: 'error',
                message: `🚨 Memory exhaustion imminent: ${memoryRssMB.toFixed(1)} MB (${memoryPercent.toFixed(1)}% of 2 GB). IMMEDIATE ACTION REQUIRED.`,
                metric: 'memory_emergency',
                value: memoryRssMB,
                threshold: MONITOR_CONFIG.thresholds.memoryEmergencyMB,
            });
        }
        else if (memoryRssMB >= MONITOR_CONFIG.thresholds.memoryCriticalMB) {
            alerts.push({
                level: 'error',
                message: `🔴 Memory usage critical: ${memoryRssMB.toFixed(1)} MB (${memoryPercent.toFixed(1)}% of 2 GB). Optimize or scale plan.`,
                metric: 'memory_critical',
                value: memoryRssMB,
                threshold: MONITOR_CONFIG.thresholds.memoryCriticalMB,
            });
        }
        else if (memoryRssMB >= MONITOR_CONFIG.thresholds.memoryWarningMB) {
            alerts.push({
                level: 'warn',
                message: `⚠️ Memory usage high: ${memoryRssMB.toFixed(1)} MB (${memoryPercent.toFixed(1)}% of 2 GB). Monitor closely.`,
                metric: 'memory_warning',
                value: memoryRssMB,
                threshold: MONITOR_CONFIG.thresholds.memoryWarningMB,
            });
        }
        else if (memoryRssMB < MONITOR_CONFIG.thresholds.memoryUnderutilizedMB) {
            alerts.push({
                level: 'info',
                message: `ℹ️ Memory underutilized: ${memoryRssMB.toFixed(1)} MB (${memoryPercent.toFixed(1)}% of 2 GB). Consider increasing cache sizes.`,
                metric: 'memory_underutilized',
                value: memoryRssMB,
                threshold: MONITOR_CONFIG.thresholds.memoryUnderutilizedMB,
            });
        }
        else if (memoryRssMB >= MONITOR_CONFIG.thresholds.memoryOptimalMinMB && memoryRssMB <= MONITOR_CONFIG.thresholds.memoryOptimalMaxMB) {
            // Optimal range - no alert, just log for visibility
            alerts.push({
                level: 'info',
                message: `✅ Memory utilization optimal: ${memoryRssMB.toFixed(1)} MB (${memoryPercent.toFixed(1)}% of 2 GB, target: 60-75%)`,
                metric: 'memory_optimal',
                value: memoryRssMB,
            });
        }
        // Check 2: Total resource count
        if (stats.total >= MONITOR_CONFIG.thresholds.totalResourcesCritical) {
            alerts.push({
                level: 'error',
                message: `Critical: ${stats.total} total resources (threshold: ${MONITOR_CONFIG.thresholds.totalResourcesCritical})`,
                metric: 'total_resources',
                value: stats.total,
                threshold: MONITOR_CONFIG.thresholds.totalResourcesCritical,
            });
        }
        else if (stats.total >= MONITOR_CONFIG.thresholds.totalResourcesWarning) {
            alerts.push({
                level: 'warn',
                message: `Warning: ${stats.total} total resources (threshold: ${MONITOR_CONFIG.thresholds.totalResourcesWarning})`,
                metric: 'total_resources',
                value: stats.total,
                threshold: MONITOR_CONFIG.thresholds.totalResourcesWarning,
            });
        }
        // Check 3: Leak suspects
        const leakCount = stats.leakSuspects.length;
        if (leakCount >= MONITOR_CONFIG.thresholds.leakSuspectsCritical) {
            alerts.push({
                level: 'error',
                message: `Critical: ${leakCount} leak suspects detected (threshold: ${MONITOR_CONFIG.thresholds.leakSuspectsCritical})`,
                metric: 'leak_suspects',
                value: leakCount,
                threshold: MONITOR_CONFIG.thresholds.leakSuspectsCritical,
            });
        }
        else if (leakCount >= MONITOR_CONFIG.thresholds.leakSuspectsWarning) {
            alerts.push({
                level: 'warn',
                message: `Warning: ${leakCount} leak suspects detected (threshold: ${MONITOR_CONFIG.thresholds.leakSuspectsWarning})`,
                metric: 'leak_suspects',
                value: leakCount,
                threshold: MONITOR_CONFIG.thresholds.leakSuspectsWarning,
            });
        }
        // Check 4: Resource growth rate (compare to last snapshot)
        if (this.lastSnapshot && stats.total > 0) {
            const growthRate = stats.total / this.lastSnapshot.stats.total;
            if (growthRate >= MONITOR_CONFIG.thresholds.resourceGrowthRate) {
                alerts.push({
                    level: 'warn',
                    message: `Resource growth detected: ${((growthRate - 1) * 100).toFixed(1)}% increase since last check`,
                    metric: 'resource_growth',
                    value: growthRate,
                    threshold: MONITOR_CONFIG.thresholds.resourceGrowthRate,
                });
            }
        }
        // Check 5: Individual resource type anomalies
        Object.entries(stats.byType).forEach(([type, count]) => {
            // Check for excessive listeners (>30 is unusual)
            if (type === 'listener' && count > 30) {
                alerts.push({
                    level: 'warn',
                    message: `High listener count: ${count} listeners active`,
                    metric: 'listener_count',
                    value: count,
                });
            }
            // Check for excessive timers (>20 is unusual)
            if (type === 'timer' && count > 20) {
                alerts.push({
                    level: 'warn',
                    message: `High timer count: ${count} timers active`,
                    metric: 'timer_count',
                    value: count,
                });
            }
        });
        return alerts;
    }
    // ============================================================================
    // Logging & Reporting
    // ============================================================================
    logHealthCheckResults(trigger, snapshot, executionMs) {
        const { stats, alerts } = snapshot;
        // Determine overall health status
        const hasCritical = alerts.some(a => a.level === 'error');
        const hasWarning = alerts.some(a => a.level === 'warn');
        // Base log data
        const logData = {
            trigger,
            executionMs,
            timestamp: snapshot.timestamp.toISOString(),
            summary: {
                totalResources: stats.total,
                byType: stats.byType,
                byOwner: stats.byOwner,
                leakSuspects: stats.leakSuspects.length,
            },
            alerts: alerts.map(a => ({
                level: a.level,
                metric: a.metric,
                message: a.message,
            })),
            performance: {
                executionTimeMs: executionMs,
                overhead: '<1ms CPU, <1KB memory',
            },
        };
        // Log with appropriate level
        if (hasCritical) {
            logger.error('🔴 [ResourceMonitor] CRITICAL: Resource health check failed', new Error('Resource health critical'), {
                category: 'ALERT',
                data: logData,
            });
        }
        else if (hasWarning) {
            logger.warn('🟡 [ResourceMonitor] WARNING: Resource health issues detected', {
                category: 'ALERT',
                data: logData,
            });
        }
        else {
            logger.info('✅ [ResourceMonitor] Resource health check passed', {
                category: 'SYSTEM',
                data: logData,
            });
        }
        // Log detailed leak suspect information if any exist
        if (stats.leakSuspects.length > 0) {
            logger.warn('[ResourceMonitor] Leak suspect details', {
                category: 'ALERT',
                data: {
                    count: stats.leakSuspects.length,
                    suspects: stats.leakSuspects.slice(0, 10).map(s => ({
                        type: s.type,
                        owner: s.owner,
                        name: s.name,
                        ageHours: (Date.now() - s.createdAt.getTime()) / (60 * 60 * 1000),
                    })),
                    note: stats.leakSuspects.length > 10 ? `... and ${stats.leakSuspects.length - 10} more` : undefined,
                },
            });
        }
        // Log oldest resource for context
        if (stats.oldest) {
            const ageHours = (Date.now() - stats.oldest.createdAt.getTime()) / (60 * 60 * 1000);
            logger.debug('[ResourceMonitor] Oldest resource', {
                category: 'SYSTEM',
                data: {
                    type: stats.oldest.type,
                    owner: stats.oldest.owner,
                    name: stats.oldest.name,
                    ageHours: ageHours.toFixed(1),
                },
            });
        }
    }
    // ============================================================================
    // Self-Cleaning: History Management
    // ============================================================================
    cleanupOldSnapshots() {
        const cutoffTime = Date.now() - MONITOR_CONFIG.historyRetentionMs;
        const beforeCount = this.snapshots.length;
        // Remove snapshots older than retention period
        this.snapshots = this.snapshots.filter(s => s.timestamp.getTime() >= cutoffTime);
        const removedCount = beforeCount - this.snapshots.length;
        if (removedCount > 0) {
            logger.debug('[ResourceMonitor] Cleaned up old snapshots', {
                category: 'SYSTEM',
                data: {
                    removed: removedCount,
                    remaining: this.snapshots.length,
                    retentionDays: MONITOR_CONFIG.historyRetentionMs / (24 * 60 * 60 * 1000),
                },
            });
        }
    }
    // ============================================================================
    // Query API (for debugging/observability)
    // ============================================================================
    getHistory() {
        return [...this.snapshots];
    }
    getLastSnapshot() {
        return this.lastSnapshot;
    }
    /**
     * Get current resource metrics (legacy API for logger.js compatibility)
     * @returns Current resource usage metrics including cache/disk stats
     */
    getMetrics() {
        const mem = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        // Cache/disk metrics (query actual cache size when possible)
        let cacheSize = 0;
        const cacheDir = process.env.RENDER ? '/Store' : process.cwd() + '/Store';
        try {
            // Use synchronous fs operations for this sync method
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const fs = require('node:fs');
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const path = require('node:path');
            // Check if Store directory exists
            if (fs.existsSync(cacheDir)) {
                // Get directory size by walking files (limited depth for performance)
                const getDirectorySize = (dir, depth = 0) => {
                    if (depth > 2)
                        return 0; // Limit recursion depth
                    let size = 0;
                    try {
                        const entries = fs.readdirSync(dir, { withFileTypes: true });
                        for (const entry of entries.slice(0, 100)) { // Limit entries per directory
                            const fullPath = path.join(dir, entry.name);
                            try {
                                if (entry.isFile()) {
                                    size += fs.statSync(fullPath).size;
                                }
                                else if (entry.isDirectory() && !entry.name.startsWith('.')) {
                                    size += getDirectorySize(fullPath, depth + 1);
                                }
                            }
                            catch {
                                // Skip inaccessible files
                            }
                        }
                    }
                    catch {
                        // Directory not readable
                    }
                    return size;
                };
                cacheSize = getDirectorySize(cacheDir);
            }
        }
        catch {
            // Filesystem access failed, use placeholder
            cacheSize = 0;
        }
        const cacheBudgetMax = 100 * 1024 * 1024; // 100 MB default budget
        const cacheBudgetPercent = cacheBudgetMax > 0 ? (cacheSize / cacheBudgetMax) * 100 : 0;
        const workspaceLimit = 1024 * 1024 * 1024; // 1 GB workspace limit (Render default)
        const diskTotal = 10 * 1024 * 1024 * 1024; // 10 GB disk total (Render persistent disk)
        const diskFree = diskTotal - cacheSize; // Approximate free space
        return {
            uptime: process.uptime(),
            rss: mem.rss,
            heapUsed: mem.heapUsed,
            heapTotal: mem.heapTotal,
            external: mem.external,
            cpuUser: cpuUsage.user / 1000000, // Convert microseconds to seconds
            cpuSystem: cpuUsage.system / 1000000,
            pid: process.pid,
            nodeVersion: process.version,
            cacheDir: '/Store', // Standard cache directory
            cacheSize,
            cacheBudgetMax,
            cacheBudgetPercent,
            workspaceLimit,
            approxFree: workspaceLimit - cacheSize,
            diskTotal,
            diskFree,
        };
    }
    getHealthSummary() {
        return {
            isRunning: this.isRunning,
            totalChecksRun: this.snapshots.length,
            lastCheckAt: this.lastSnapshot?.timestamp.toISOString(),
            nextCheckAt: this.monitorTimer
                ? new Date(Date.now() + MONITOR_CONFIG.intervalMs).toISOString()
                : undefined,
            currentAlerts: this.lastSnapshot?.alerts ?? [],
        };
    }
    updateThresholds(newThresholds) {
        Object.assign(MONITOR_CONFIG.thresholds, newThresholds);
        logger.info('[ResourceMonitor] Thresholds updated', {
            category: 'SYSTEM',
            data: {
                newThresholds: MONITOR_CONFIG.thresholds,
            },
        });
    }
}
// ============================================================================
// Singleton Export
// ============================================================================
export const resourceMonitor = new ResourceMonitor();
// ============================================================================
// Convenience Functions
// ============================================================================
/**
 * Start resource monitoring (call once at application startup)
 */
export function startResourceMonitoring() {
    resourceMonitor.start();
}
/**
 * Stop resource monitoring (call during shutdown)
 */
export function stopResourceMonitoring() {
    resourceMonitor.stop();
}
/**
 * Get current resource health summary
 */
export function getResourceHealth() {
    return resourceMonitor.getHealthSummary();
}
