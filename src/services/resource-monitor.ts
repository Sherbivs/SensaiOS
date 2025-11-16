/**
 * Resource Monitor — Unified Resource & Memory Management
 * 
 * Combines resource tracking with active memory protection:
 * - Periodic health checks (startup + configurable intervals)
 * - Real-time memory guardian (30s polling with automatic pruning)
 * - Resource leak detection and alerting
 * - Integrated with intelligent logger for visibility
 * 
 * Memory Protection Levels:
 * - NORMAL: <384MB (75%) - Monitor only
 * - WARNING: 384-434MB (75-85%) - Preemptive pruning
 * - CRITICAL: 435-459MB (85-90%) - Aggressive pruning
 * - EMERGENCY: 460-511MB (90-99%) - Nuclear pruning
 * 
 * Integration: Called from src/index.ts boot() and gracefulShutdown()
 */

import { resourceManager } from './resource-manager.js';
import { getErrorMessage } from '../shared/utils/error-utils.js';
import logger from '../utils/intelligent-logger.js';
import type { ResourceStats } from './resource-manager.js';

// ============================================================================
// Types
// ============================================================================

/** Prunable cache interface (all caches must implement this) */
export interface IPrunableCache {
  /** Cache identifier for logging */
  name: string;
  
  /** Current memory footprint estimate in bytes */
  getMemoryUsage(): number;
  
  /** Prune to target size (normal pressure response) */
  prune(targetSizePercent: number): Promise<{ itemsRemoved: number; bytesFreed: number }>;
  
  /** Emergency prune to minimum viable size */
  emergencyPrune(): Promise<{ itemsRemoved: number; bytesFreed: number }>;
}

// ============================================================================
// Configuration
// ============================================================================

// Standard thresholds aligned with Render Starter plan (512 MB, 0.5 vCPU)
// See: docs/deployment/RESOURCE-MONITOR-STANDARDS.md for complete specification
const MEMORY_THRESHOLDS = {
  planLimitMB: 512,
  emergencyMB: 460,      // 90% - Immediate action required
  criticalMB: 435,       // 85% - Scale or optimize
  warningMB: 384,        // 75% - Monitor closely
  optimalMinMB: 307,     // 60% - Target minimum
  optimalMaxMB: 384,     // 75% - Target maximum
  underutilizedMB: 256,  // 50% - Consider optimization
};

const CPU_THRESHOLDS = {
  planVCPU: 0.5,
  emergencyPercent: 90,
  criticalPercent: 70,
  warningPercent: 50,
  normalMinPercent: 30,
};

const MONITOR_CONFIG = {
  // Health check interval: Can be configured via environment
  // Default: 12 hours (twice daily)
  // Optimization phase: 5 minutes (set RESOURCE_MONITOR_INTERVAL_MS=300000)
  intervalMs: parseInt(process.env.RESOURCE_MONITOR_INTERVAL_MS || '43200000', 10), // 12 hours default
  
  // Memory guardian polling: Active memory protection
  // Runs every 30 seconds to catch spikes before OOM
  memoryGuardianIntervalMs: 30000, // 30 seconds
  
  // GC and prune cooldowns (prevent spam)
  gcCooldownMs: 60000,    // 1 minute between forced GC
  pruneCooldownMs: 120000, // 2 minutes between prunes
  
  // Cleanup monitor history after 7 days
  historyRetentionMs: 7 * 24 * 60 * 60 * 1000,
  
  // Alert thresholds (aligned with 512 MB Starter plan)
  thresholds: {
    // Resource count limits (increased for 512 MB capacity)
    totalResourcesWarning: 150,      // Increased from 50 (3x for 512 MB plan)
    totalResourcesCritical: 250,     // Increased from 100 (2.5x for 512 MB plan)
    
    // Leak detection (strict - keep as-is)
    leakSuspectsWarning: 5,          // Warn if >5 leak suspects
    leakSuspectsCritical: 10,        // Critical if >10 leak suspects
    resourceGrowthRate: 1.5,         // Warn if resources grow >50% between checks
    
    // Memory utilization thresholds (aligned with plan specs)
    memoryWarningMB: MEMORY_THRESHOLDS.warningMB,       // 384 MB (75%)
    memoryCriticalMB: MEMORY_THRESHOLDS.criticalMB,     // 435 MB (85%)
    memoryEmergencyMB: MEMORY_THRESHOLDS.emergencyMB,   // 460 MB (90%)
    memoryOptimalMinMB: MEMORY_THRESHOLDS.optimalMinMB, // 307 MB (60%)
    memoryOptimalMaxMB: MEMORY_THRESHOLDS.optimalMaxMB, // 384 MB (75%)
    memoryUnderutilizedMB: MEMORY_THRESHOLDS.underutilizedMB, // 256 MB (50%)
    
    // CPU utilization thresholds
    cpuWarningPercent: CPU_THRESHOLDS.warningPercent,       // 50%
    cpuCriticalPercent: CPU_THRESHOLDS.criticalPercent,     // 70%
    cpuEmergencyPercent: CPU_THRESHOLDS.emergencyPercent,   // 90%
  },
};

// ============================================================================
// Types
// ============================================================================

/** Memory pressure levels */
export type MemoryPressureLevel = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';

/** Memory snapshot with pressure level */
interface MemorySnapshot {
  timestamp: Date;
  heapUsed: number;  // MB
  rss: number;       // MB
  percentUsed: number;
  pressureLevel: MemoryPressureLevel;
}

interface MonitorSnapshot {
  timestamp: Date;
  stats: ResourceStats;
  memory: MemorySnapshot;
  alerts: MonitorAlert[];
}

interface MonitorAlert {
  level: 'info' | 'warn' | 'error';
  message: string;
  metric: string;
  value: number;
  threshold?: number;
}

// ============================================================================
// Resource Monitor Class
// ============================================================================

class ResourceMonitor {
  private monitorTimer?: ReturnType<typeof setInterval>;
  private memoryGuardianTimer?: ReturnType<typeof setInterval>;
  private snapshots: MonitorSnapshot[] = [];
  private lastSnapshot?: MonitorSnapshot;
  private isRunning = false;
  
  // Memory guardian state
  private registeredCaches = new Map<string, IPrunableCache>();
  private currentPressureLevel: MemoryPressureLevel = 'NORMAL';
  private lastGcAt = 0;
  private lastGcTime = 0;
  private lastPruneAt = 0;
  private lastPruneTime = 0;
  private lastNormalLogAt = 0;
  private consecutiveHighPressure = 0;
  
  // Memory guardian statistics
  private totalPrunesTriggered = 0;
  private totalBytesFreed = 0;
  private totalGcTriggered = 0;

  // ============================================================================
  // Initialization & Lifecycle
  // ============================================================================

  public start(): void {
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
      resourceManager.registerInterval(
        'resource-monitor',
        'memory-guardian-poll',
        () => this.checkMemoryAndAct(),
        MONITOR_CONFIG.memoryGuardianIntervalMs,
        { critical: true }
      );
    } catch (error) {
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

  public stop(): void {
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
  public registerCache(cache: IPrunableCache): void {
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
  public unregisterCache(cacheName: string): void {
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
  private captureMemorySnapshot(): MemorySnapshot {
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
  private calculatePressureLevel(rssMB: number): MemoryPressureLevel {
    if (rssMB >= MEMORY_THRESHOLDS.emergencyMB) return 'EMERGENCY';
    if (rssMB >= MEMORY_THRESHOLDS.criticalMB) return 'CRITICAL';
    if (rssMB >= MEMORY_THRESHOLDS.warningMB) return 'WARNING';
    return 'NORMAL';
  }
  
  /**
   * Check memory and take action based on pressure level (called every 30s)
   */
  private async checkMemoryAndAct(): Promise<void> {
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
   * Handle EMERGENCY pressure (460-512 MB) - Nuclear option
   */
  private async handleEmergencyPressure(snapshot: MemorySnapshot): Promise<void> {
    logger.error('[ResourceMonitor] EMERGENCY MEMORY PRESSURE - Immediate action required', {
      category: 'SYSTEM',
      data: {
        rss: `${snapshot.rss.toFixed(0)}MB`,
        limit: `${MEMORY_THRESHOLDS.planLimitMB}MB`,
        percentUsed: `${snapshot.percentUsed.toFixed(1)}%`,
        action: 'Emergency prune + Force GC',
      },
    });
    
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
      } catch (error) {
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
  private async handleCriticalPressure(snapshot: MemorySnapshot): Promise<void> {
    logger.warn('[ResourceMonitor] CRITICAL MEMORY PRESSURE - Aggressive pruning', {
      category: 'SYSTEM',
      data: {
        rss: `${snapshot.rss.toFixed(0)}MB`,
        percentUsed: `${snapshot.percentUsed.toFixed(1)}%`,
      },
    });
    
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
      } catch (error) {
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
  private async handleWarningPressure(snapshot: MemorySnapshot): Promise<void> {
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
   * Handle NORMAL pressure (<384 MB) - All good
   */
  private handleNormalPressure(snapshot: MemorySnapshot): void {
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
  private forceGarbageCollection(): void {
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
    } else {
      logger.warn('[ResourceMonitor] global.gc() not available - start with --expose-gc', {
        category: 'SYSTEM',
      });
    }
  }

  // ============================================================================
  // Health Check Execution
  // ============================================================================

  private runHealthCheck(trigger: 'startup' | 'scheduled'): void {
    const startTime = performance.now();

    try {
      // Get current resource statistics
      const stats = resourceManager.getStats();

      // Capture current memory snapshot
      const memorySnapshot = this.captureMemorySnapshot();

      // Analyze for alerts
      const alerts = this.analyzeStats(stats);

      // Create snapshot
      const snapshot: MonitorSnapshot = {
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

    } catch (error) {
      logger.error('[ResourceMonitor] Health check failed', error, {
        category: 'ERROR',
        data: { trigger },
      });
    }
  }

  // ============================================================================
  // Statistics Analysis & Alerting
  // ============================================================================

  private analyzeStats(stats: ResourceStats): MonitorAlert[] {
    const alerts: MonitorAlert[] = [];

    // Get memory and CPU usage
    const memoryUsage = process.memoryUsage();
    const memoryRssMB = memoryUsage.rss / (1024 * 1024);
    const memoryPercent = (memoryRssMB / MEMORY_THRESHOLDS.planLimitMB) * 100;

    // Check 1: Memory utilization (aligned with 512 MB plan specs)
    if (memoryRssMB >= MONITOR_CONFIG.thresholds.memoryEmergencyMB) {
      alerts.push({
        level: 'error',
        message: `🚨 Memory exhaustion imminent: ${memoryRssMB.toFixed(1)} MB (${memoryPercent.toFixed(1)}% of 512 MB). IMMEDIATE ACTION REQUIRED.`,
        metric: 'memory_emergency',
        value: memoryRssMB,
        threshold: MONITOR_CONFIG.thresholds.memoryEmergencyMB,
      });
    } else if (memoryRssMB >= MONITOR_CONFIG.thresholds.memoryCriticalMB) {
      alerts.push({
        level: 'error',
        message: `🔴 Memory usage critical: ${memoryRssMB.toFixed(1)} MB (${memoryPercent.toFixed(1)}% of 512 MB). Optimize or scale plan.`,
        metric: 'memory_critical',
        value: memoryRssMB,
        threshold: MONITOR_CONFIG.thresholds.memoryCriticalMB,
      });
    } else if (memoryRssMB >= MONITOR_CONFIG.thresholds.memoryWarningMB) {
      alerts.push({
        level: 'warn',
        message: `⚠️ Memory usage high: ${memoryRssMB.toFixed(1)} MB (${memoryPercent.toFixed(1)}% of 512 MB). Monitor closely.`,
        metric: 'memory_warning',
        value: memoryRssMB,
        threshold: MONITOR_CONFIG.thresholds.memoryWarningMB,
      });
    } else if (memoryRssMB < MONITOR_CONFIG.thresholds.memoryUnderutilizedMB) {
      alerts.push({
        level: 'info',
        message: `ℹ️ Memory underutilized: ${memoryRssMB.toFixed(1)} MB (${memoryPercent.toFixed(1)}% of 512 MB). Consider increasing cache sizes.`,
        metric: 'memory_underutilized',
        value: memoryRssMB,
        threshold: MONITOR_CONFIG.thresholds.memoryUnderutilizedMB,
      });
    } else if (memoryRssMB >= MONITOR_CONFIG.thresholds.memoryOptimalMinMB && memoryRssMB <= MONITOR_CONFIG.thresholds.memoryOptimalMaxMB) {
      // Optimal range - no alert, just log for visibility
      alerts.push({
        level: 'info',
        message: `✅ Memory utilization optimal: ${memoryRssMB.toFixed(1)} MB (${memoryPercent.toFixed(1)}% of 512 MB, target: 60-75%)`,
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
    } else if (stats.total >= MONITOR_CONFIG.thresholds.totalResourcesWarning) {
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
    } else if (leakCount >= MONITOR_CONFIG.thresholds.leakSuspectsWarning) {
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

  private logHealthCheckResults(
    trigger: string,
    snapshot: MonitorSnapshot,
    executionMs: string
  ): void {
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
    } else if (hasWarning) {
      logger.warn('🟡 [ResourceMonitor] WARNING: Resource health issues detected', {
        category: 'ALERT',
        data: logData,
      });
    } else {
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

  private cleanupOldSnapshots(): void {
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

  public getHistory(): MonitorSnapshot[] {
    return [...this.snapshots];
  }

  public getLastSnapshot(): MonitorSnapshot | undefined {
    return this.lastSnapshot;
  }

  public getHealthSummary(): {
    isRunning: boolean;
    totalChecksRun: number;
    lastCheckAt?: string;
    nextCheckAt?: string;
    currentAlerts: MonitorAlert[];
  } {
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

  public updateThresholds(newThresholds: Partial<typeof MONITOR_CONFIG.thresholds>): void {
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
export function startResourceMonitoring(): void {
  resourceMonitor.start();
}

/**
 * Stop resource monitoring (call during shutdown)
 */
export function stopResourceMonitoring(): void {
  resourceMonitor.stop();
}

/**
 * Get current resource health summary
 */
export function getResourceHealth() {
  return resourceMonitor.getHealthSummary();
}
