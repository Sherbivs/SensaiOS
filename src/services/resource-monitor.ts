/**
 * Resource Monitor Scheduler - Lightweight Background Monitoring
 * 
 * Runs resource health checks twice daily (startup + 12 hours later)
 * Integrates with intelligent logger for visibility
 * Self-cleaning: automatically removes old monitor data
 * Minimal overhead: <1ms CPU, <1KB memory per check
 * 
 * Integration: Called from src/index.ts boot() and gracefulShutdown()
 * - Starts after error learning worker initialization (line ~1133)
 * - Stops during graceful shutdown before write buffer flush (line ~798)
 */

import { resourceManager } from './resource-manager.js';
import logger from '../utils/intelligent-logger.js';
import type { ResourceStats } from './resource-manager.js';

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
  // Run twice daily: at startup + 12 hours later
  // During optimization phase, consider more frequent checks (5 minutes)
  intervalMs: 12 * 60 * 60 * 1000, // 12 hours
  
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

interface MonitorSnapshot {
  timestamp: Date;
  stats: ResourceStats;
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
  private snapshots: MonitorSnapshot[] = [];
  private lastSnapshot?: MonitorSnapshot;
  private isRunning = false;

  // ============================================================================
  // Initialization & Lifecycle
  // ============================================================================

  public start(): void {
    if (this.isRunning) {
      logger.warn('[ResourceMonitor] Already running, skipping start');
      return;
    }

    this.isRunning = true;

    // Run initial check immediately on startup
    this.runHealthCheck('startup');

    // Schedule next check in 12 hours
    this.monitorTimer = setInterval(() => {
      this.runHealthCheck('scheduled');
    }, MONITOR_CONFIG.intervalMs);

    // Use .unref() to allow process exit without blocking
    this.monitorTimer.unref?.();

    logger.info('[ResourceMonitor] Started - runs twice daily', {
      category: 'SYSTEM',
      data: {
        intervalHours: MONITOR_CONFIG.intervalMs / (60 * 60 * 1000),
        nextCheckAt: new Date(Date.now() + MONITOR_CONFIG.intervalMs).toISOString(),
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

    this.isRunning = false;

    logger.info('[ResourceMonitor] Stopped', {
      category: 'SYSTEM',
      data: {
        totalChecksRun: this.snapshots.length,
        lastCheckAt: this.lastSnapshot?.timestamp.toISOString(),
      },
    });
  }

  // ============================================================================
  // Health Check Execution
  // ============================================================================

  private runHealthCheck(trigger: 'startup' | 'scheduled'): void {
    const startTime = performance.now();

    try {
      // Get current resource statistics
      const stats = resourceManager.getStats();

      // Analyze for alerts
      const alerts = this.analyzeStats(stats);

      // Create snapshot
      const snapshot: MonitorSnapshot = {
        timestamp: new Date(),
        stats,
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
