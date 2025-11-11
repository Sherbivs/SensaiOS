# Resource Monitor Standardization Guide

**Created**: 2025-11-11  
**Status**: 📋 Standards Document  
**Applies To**: All Render services (8 workers + 1 database)  
**Goal**: Uniform monitoring, alerting, and optimization patterns across infrastructure

---

## Overview

This document establishes **standardized resource monitoring thresholds** aligned with Render plan specifications. All services should implement these standards for consistent observability, predictable alerting, and optimal resource utilization.

**Key Principles:**
1. **Plan-Aligned**: Thresholds match Render plan limits (512 MB, 0.5 vCPU, 1-2 GB disk)
2. **Utilization-Focused**: Target 60-70% memory usage for optimal performance
3. **Consistent Alerts**: Same severity levels across all services
4. **Actionable**: Clear escalation paths for each alert level

---

## Standard Resource Thresholds

### Memory (512 MB Starter Plan)

#### Utilization Zones

```
┌────────────────────────────────────────────────────────────────┐
│ 512 MB Plan Limit                                              │
├────────────────────────────────────────────────────────────────┤
│ 🚨 EMERGENCY (460-512 MB) ░░░░░░░░░░░░░░░░░░░░ 90-100%        │
│ 🔴 CRITICAL (435-460 MB)  ░░░░░░░░░░░░░░░░░░░░ 85-90%         │
│ ⚠️  WARNING (384-435 MB)  ░░░░░░░░░░░░░░░░░░░░ 75-85%         │
│ ✅ OPTIMAL (307-384 MB)   ████████████████████ 60-75%          │
│ ℹ️  SAFE (256-307 MB)     ████████████████████ 50-60%          │
│ ⚠️  UNDERUTILIZED (<256)  ░░░░░░░░░░░░░░░░░░░░ <50%           │
└────────────────────────────────────────────────────────────────┘
```

#### Thresholds Table

| Zone | Range (MB) | Range (%) | Alert Level | Action |
|------|-----------|-----------|-------------|---------|
| **Emergency** | 460-512 | 90-100% | 🚨 Alert | Immediate intervention required |
| **Critical** | 435-460 | 85-90% | 🔴 Error | Optimize or scale plan |
| **Warning** | 384-435 | 75-85% | ⚠️ Warn | Monitor closely, review optimizations |
| **Optimal** | 307-384 | 60-75% | ✅ Info | Target range - peak performance |
| **Safe** | 256-307 | 50-60% | ✅ Info | Acceptable - room for growth |
| **Underutilized** | <256 | <50% | ℹ️ Info | Consider increasing cache sizes |

#### Configuration

```typescript
// Standard memory thresholds for 512 MB plans
export const MEMORY_THRESHOLDS = {
  planLimitMB: 512,
  
  // Alert thresholds (ascending severity)
  emergencyMB: 460,      // 90% - Immediate action
  criticalMB: 435,       // 85% - Scale or optimize
  warningMB: 384,        // 75% - Monitor closely
  
  // Target ranges (optimal performance)
  optimalMinMB: 307,     // 60% - Target minimum
  optimalMaxMB: 384,     // 75% - Target maximum
  
  // Underutilization alert
  underutilizedMB: 256,  // 50% - Consider optimization
};
```

---

### CPU (0.5 vCPU Starter Plan)

#### Utilization Zones

```
┌────────────────────────────────────────────────────────────────┐
│ 0.5 vCPU (50% of 1 core)                                       │
├────────────────────────────────────────────────────────────────┤
│ 🚨 EMERGENCY (90-100%)  ░░░░░░░░░░░░░░░░░░░░░░ Maxed out      │
│ 🔴 CRITICAL (70-90%)    ░░░░░░░░░░░░░░░░░░░░░░ High load      │
│ ⚠️  WARNING (50-70%)    ░░░░░░░░░░░░░░░░░░░░░░ Elevated      │
│ ✅ NORMAL (30-50%)      ████████████████████████ Good         │
│ ℹ️  IDLE (0-30%)        ████████████████████████ Light load  │
└────────────────────────────────────────────────────────────────┘
```

#### Thresholds Table

| Zone | Range (%) | Alert Level | Action |
|------|----------|-------------|---------|
| **Emergency** | 90-100% | 🚨 Alert | Immediate optimization or scale |
| **Critical** | 70-90% | 🔴 Error | Optimize hot paths, check for loops |
| **Warning** | 50-70% | ⚠️ Warn | Monitor trends, identify bottlenecks |
| **Normal** | 30-50% | ✅ Info | Acceptable load |
| **Idle** | 0-30% | ℹ️ Info | Light load - normal for event-driven apps |

#### Configuration

```typescript
// Standard CPU thresholds for 0.5 vCPU plans
export const CPU_THRESHOLDS = {
  planVCPU: 0.5,
  
  // Alert thresholds (ascending severity)
  emergencyPercent: 90,   // 90-100% - Maxed out
  criticalPercent: 70,    // 70-90% - High load
  warningPercent: 50,     // 50-70% - Elevated
  
  // Normal range
  normalMinPercent: 30,   // 30-50% - Acceptable
  idleMaxPercent: 30,     // 0-30% - Light load
};
```

---

### Disk (1-2 GB Persistent Storage)

#### Utilization Zones

```
┌────────────────────────────────────────────────────────────────┐
│ 1 GB Disk (Adjustable to 2 GB)                                 │
├────────────────────────────────────────────────────────────────┤
│ 🚨 EMERGENCY (900 MB-1 GB)  ░░░░░░░░░░░░░░░░ 90-100%          │
│ 🔴 CRITICAL (750-900 MB)    ░░░░░░░░░░░░░░░░ 75-90%           │
│ ⚠️  WARNING (600-750 MB)    ░░░░░░░░░░░░░░░░ 60-75%           │
│ ✅ NORMAL (0-600 MB)        ████████████████ 0-60%             │
└────────────────────────────────────────────────────────────────┘
```

#### Thresholds Table

| Zone | Range (MB) | Range (%) | Alert Level | Action |
|------|-----------|-----------|-------------|---------|
| **Emergency** | 900-1000 | 90-100% | 🚨 Alert | Immediate cleanup or scale disk |
| **Critical** | 750-900 | 75-90% | 🔴 Error | Review retention, cleanup old logs |
| **Warning** | 600-750 | 60-75% | ⚠️ Warn | Plan cleanup, check growth trends |
| **Normal** | 0-600 | 0-60% | ✅ Info | Healthy state |

#### Configuration

```typescript
// Standard disk thresholds for 1-2 GB plans
export const DISK_THRESHOLDS = {
  planSizeGB: 1,         // Adjustable: 1 or 2 GB
  
  // Alert thresholds (ascending severity)
  emergencyPercent: 90,  // 90-100% - Immediate cleanup
  criticalPercent: 75,   // 75-90% - Review retention
  warningPercent: 60,    // 60-75% - Plan cleanup
  
  // Healthy range
  normalMaxPercent: 60,  // 0-60% - Normal operation
};
```

---

## Resource Manager Configuration Standards

### Configuration Template

```typescript
// src/services/resource-monitor.ts
// STANDARD CONFIGURATION for 512 MB Starter plans

import { MEMORY_THRESHOLDS, CPU_THRESHOLDS, DISK_THRESHOLDS } from './resource-thresholds.js';

const MONITOR_CONFIG = {
  // Monitoring frequency
  intervalMs: 5 * 60 * 1000,           // 5 minutes during optimization
  // intervalMs: 12 * 60 * 60 * 1000,  // 12 hours in stable production
  
  // History retention
  historyRetentionMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  
  // Resource count thresholds (aligned with 512 MB capacity)
  thresholds: {
    // Resource tracking limits
    totalResourcesWarning: 150,        // Up from 50 (3x increase for 512 MB)
    totalResourcesCritical: 250,       // Up from 100 (2.5x increase)
    
    // Leak detection (strict - keep as-is)
    leakSuspectsWarning: 5,            // 5+ suspects = warning
    leakSuspectsCritical: 10,          // 10+ suspects = critical
    resourceGrowthRate: 1.5,           // 50% growth threshold
    
    // Memory thresholds (NEW - aligned with plan specs)
    memoryWarningMB: MEMORY_THRESHOLDS.warningMB,       // 384 MB (75%)
    memoryCriticalMB: MEMORY_THRESHOLDS.criticalMB,     // 435 MB (85%)
    memoryEmergencyMB: MEMORY_THRESHOLDS.emergencyMB,   // 460 MB (90%)
    memoryOptimalMinMB: MEMORY_THRESHOLDS.optimalMinMB, // 307 MB (60%)
    memoryOptimalMaxMB: MEMORY_THRESHOLDS.optimalMaxMB, // 384 MB (75%)
    memoryUnderutilizedMB: MEMORY_THRESHOLDS.underutilizedMB, // 256 MB (50%)
    
    // CPU thresholds (NEW)
    cpuWarningPercent: CPU_THRESHOLDS.warningPercent,       // 50%
    cpuCriticalPercent: CPU_THRESHOLDS.criticalPercent,     // 70%
    cpuEmergencyPercent: CPU_THRESHOLDS.emergencyPercent,   // 90%
    
    // Disk thresholds (NEW)
    diskWarningPercent: DISK_THRESHOLDS.warningPercent,     // 60%
    diskCriticalPercent: DISK_THRESHOLDS.criticalPercent,   // 75%
    diskEmergencyPercent: DISK_THRESHOLDS.emergencyPercent, // 90%
  },
};
```

---

## Alert Severity Levels

### Severity Matrix

| Level | Symbol | Name | Meaning | Response Time | Escalation |
|-------|--------|------|---------|---------------|------------|
| **0** | ℹ️ | Info | Normal operation | N/A | None |
| **1** | ✅ | Success | Optimal state | N/A | None |
| **2** | ⚠️ | Warning | Attention needed | 24 hours | Log review |
| **3** | 🔴 | Error | Action required | 4 hours | On-call notification |
| **4** | 🚨 | Alert | Critical issue | Immediate | PagerDuty / SMS |

---

## Service-Specific Configurations

### Main Bot Worker (infinity-gauntlet-bots)

**Plan**: Starter (512 MB, 0.5 vCPU, 1 GB disk)

```typescript
export const MAIN_BOT_CONFIG = {
  serviceName: 'infinity-gauntlet-bots',
  plan: 'starter',
  
  // Memory targets
  memoryPlanMB: 512,
  memoryTargetMB: 307,      // 60% utilization target
  memoryCurrentMB: 154,     // Current actual usage
  memoryOptimizationMB: 153, // +153 MB to reach target
  
  // Optimization opportunities
  cacheIncreaseMB: 89,      // Engine + Runtime + Write Buffer
  preloadDataMB: 60,        // Species + Moves
  totalBudgetMB: 149,       // Available for optimization
  
  // Monitoring
  intervalMs: 5 * 60 * 1000, // 5 minutes during optimization
  alertWebhook: process.env.ALERT_WEBHOOK_URL,
};
```

### Database Service (infinity-gauntlet-db)

**Plan**: Starter (0.5 GB storage) → **Recommend upgrade to 1 GB**

```typescript
export const DATABASE_CONFIG = {
  serviceName: 'infinity-gauntlet-db',
  plan: 'starter',
  
  // Storage targets
  storagePlanGB: 0.5,       // Current (90% full - CRITICAL)
  storageTargetGB: 1.0,     // Recommended upgrade
  storageCurrentGB: 0.45,   // 450 MB used
  
  // Retention policies
  battleRetentionDays: 90,   // Archive after 90 days
  logRetentionDays: 30,      // Compress after 30 days
  snapshotRetentionDays: 7,  // Keep 7 daily snapshots
  
  // Monitoring
  diskCheckIntervalMs: 60 * 60 * 1000, // 1 hour
  alertThresholdPercent: 85, // Alert at 85% full
};
```

### Generic Worker Configuration

**Applies To**: Outbox, Cache, Data Pipeline, Security, Pokédex workers

```typescript
export const GENERIC_WORKER_CONFIG = {
  plan: 'starter',
  
  // Memory targets (more conservative than main bot)
  memoryPlanMB: 512,
  memoryTargetMB: 205,      // 40% utilization target
  memorySafeMinMB: 150,     // Never drop below 30%
  memorySafeMaxMB: 307,     // Never exceed 60%
  
  // Standard cache sizes
  logBufferMB: 10,
  runtimeCacheMB: 20,
  connectionPoolMB: 10,
  
  // Monitoring
  intervalMs: 15 * 60 * 1000, // 15 minutes (less frequent)
};
```

---

## Monitoring Implementation

### Health Check Function

```typescript
// src/services/resource-monitor.ts

interface HealthCheckResult {
  timestamp: Date;
  status: 'optimal' | 'safe' | 'warning' | 'critical' | 'emergency';
  metrics: {
    memory: {
      rssMB: number;
      heapUsedMB: number;
      heapTotalMB: number;
      utilizationPercent: number;
      zone: string;
    };
    cpu: {
      usagePercent: number;
      zone: string;
    };
    disk: {
      usedMB: number;
      totalMB: number;
      utilizationPercent: number;
      zone: string;
    };
    resources: {
      total: number;
      byType: Record<string, number>;
      leakSuspects: number;
    };
  };
  alerts: Alert[];
}

async function performHealthCheck(): Promise<HealthCheckResult> {
  // Collect metrics
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const diskUsage = await getDiskUsage();
  const resourceStats = resourceManager.getStats();
  
  // Analyze memory zone
  const memoryRssMB = memoryUsage.rss / (1024 * 1024);
  const memoryZone = getMemoryZone(memoryRssMB);
  
  // Analyze CPU zone
  const cpuPercent = calculateCpuPercent(cpuUsage);
  const cpuZone = getCpuZone(cpuPercent);
  
  // Analyze disk zone
  const diskPercent = (diskUsage.used / diskUsage.total) * 100;
  const diskZone = getDiskZone(diskPercent);
  
  // Generate alerts
  const alerts = generateAlerts({
    memory: { rssMB: memoryRssMB, zone: memoryZone },
    cpu: { percent: cpuPercent, zone: cpuZone },
    disk: { percent: diskPercent, zone: diskZone },
    resources: resourceStats,
  });
  
  // Determine overall status
  const status = determineOverallStatus(alerts);
  
  return {
    timestamp: new Date(),
    status,
    metrics: {
      memory: {
        rssMB: memoryRssMB,
        heapUsedMB: memoryUsage.heapUsed / (1024 * 1024),
        heapTotalMB: memoryUsage.heapTotal / (1024 * 1024),
        utilizationPercent: (memoryRssMB / MEMORY_THRESHOLDS.planLimitMB) * 100,
        zone: memoryZone,
      },
      cpu: {
        usagePercent: cpuPercent,
        zone: cpuZone,
      },
      disk: {
        usedMB: diskUsage.used / (1024 * 1024),
        totalMB: diskUsage.total / (1024 * 1024),
        utilizationPercent: diskPercent,
        zone: diskZone,
      },
      resources: {
        total: resourceStats.total,
        byType: resourceStats.byType,
        leakSuspects: resourceStats.leakSuspects.length,
      },
    },
    alerts,
  };
}
```

### Zone Classification Functions

```typescript
function getMemoryZone(rssMB: number): string {
  const { emergencyMB, criticalMB, warningMB, optimalMaxMB, optimalMinMB, underutilizedMB } = MEMORY_THRESHOLDS;
  
  if (rssMB >= emergencyMB) return 'emergency';
  if (rssMB >= criticalMB) return 'critical';
  if (rssMB >= warningMB) return 'warning';
  if (rssMB >= optimalMinMB && rssMB <= optimalMaxMB) return 'optimal';
  if (rssMB >= underutilizedMB) return 'safe';
  return 'underutilized';
}

function getCpuZone(percent: number): string {
  const { emergencyPercent, criticalPercent, warningPercent, normalMinPercent } = CPU_THRESHOLDS;
  
  if (percent >= emergencyPercent) return 'emergency';
  if (percent >= criticalPercent) return 'critical';
  if (percent >= warningPercent) return 'warning';
  if (percent >= normalMinPercent) return 'normal';
  return 'idle';
}

function getDiskZone(percent: number): string {
  const { emergencyPercent, criticalPercent, warningPercent } = DISK_THRESHOLDS;
  
  if (percent >= emergencyPercent) return 'emergency';
  if (percent >= criticalPercent) return 'critical';
  if (percent >= warningPercent) return 'warning';
  return 'normal';
}
```

---

## Alert Templates

### Memory Alerts

```typescript
// UNDERUTILIZED (<50%)
{
  level: 'info',
  message: `Memory underutilized: ${rssMB} MB (${percent}% of 512 MB). Consider increasing cache sizes.`,
  metric: 'memory_utilization',
  value: rssMB,
  threshold: MEMORY_THRESHOLDS.underutilizedMB,
  recommendation: 'Increase Engine L1 Cache, Runtime Cache, or Write Buffer sizes.',
}

// WARNING (75-85%)
{
  level: 'warn',
  message: `Memory usage high: ${rssMB} MB (${percent}% of 512 MB). Monitor closely.`,
  metric: 'memory_utilization',
  value: rssMB,
  threshold: MEMORY_THRESHOLDS.warningMB,
  recommendation: 'Review cache eviction policies. Consider reducing buffer sizes.',
}

// CRITICAL (85-90%)
{
  level: 'error',
  message: `Memory usage critical: ${rssMB} MB (${percent}% of 512 MB). Optimize or scale plan.`,
  metric: 'memory_utilization',
  value: rssMB,
  threshold: MEMORY_THRESHOLDS.criticalMB,
  recommendation: 'Reduce cache sizes immediately or upgrade to Standard plan (2 GB).',
}

// EMERGENCY (90-100%)
{
  level: 'alert',
  message: `Memory exhaustion imminent: ${rssMB} MB (${percent}% of 512 MB). IMMEDIATE ACTION REQUIRED.`,
  metric: 'memory_utilization',
  value: rssMB,
  threshold: MEMORY_THRESHOLDS.emergencyMB,
  recommendation: 'Emergency: Restart service and upgrade plan immediately.',
}
```

### CPU Alerts

```typescript
// WARNING (50-70%)
{
  level: 'warn',
  message: `CPU usage elevated: ${percent}% of 0.5 vCPU. Monitor trends.`,
  metric: 'cpu_utilization',
  value: percent,
  threshold: CPU_THRESHOLDS.warningPercent,
  recommendation: 'Review hot paths and identify bottlenecks.',
}

// CRITICAL (70-90%)
{
  level: 'error',
  message: `CPU usage critical: ${percent}% of 0.5 vCPU. Optimize or scale.`,
  metric: 'cpu_utilization',
  value: percent,
  threshold: CPU_THRESHOLDS.criticalPercent,
  recommendation: 'Check for infinite loops, optimize algorithms, or scale plan.',
}
```

---

## Dashboard Integration

### Console Output Format

```typescript
function formatResourceStatus(result: HealthCheckResult): string {
  const { memory, cpu, disk, resources } = result.metrics;
  
  return `
┌─────────────────────────────────────────────────────────────────┐
│ Resource Status - ${result.status.toUpperCase()}                 │
├─────────────────────────────────────────────────────────────────┤
│ Memory: ${memory.rssMB.toFixed(1)} MB / ${MEMORY_THRESHOLDS.planLimitMB} MB (${memory.utilizationPercent.toFixed(1)}%)
│ Zone: ${memory.zone.toUpperCase()}
│ Target: ${MEMORY_THRESHOLDS.optimalMinMB}-${MEMORY_THRESHOLDS.optimalMaxMB} MB (60-75%)
│
│ CPU: ${cpu.usagePercent.toFixed(1)}% of 0.5 vCPU
│ Zone: ${cpu.zone.toUpperCase()}
│
│ Disk: ${disk.usedMB.toFixed(1)} MB / ${disk.totalMB.toFixed(1)} MB (${disk.utilizationPercent.toFixed(1)}%)
│ Zone: ${disk.zone.toUpperCase()}
│
│ Resources: ${resources.total} total (Leaks: ${resources.leakSuspects})
│ - Timers: ${resources.byType.timer || 0}
│ - Listeners: ${resources.byType.listener || 0}
│ - Connections: ${resources.byType.connection || 0}
│
│ Alerts: ${result.alerts.length}
${result.alerts.map(a => `│ [${a.level}] ${a.message}`).join('\n')}
└─────────────────────────────────────────────────────────────────┘
  `.trim();
}
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] Review and update `MONITOR_CONFIG` thresholds
- [ ] Verify memory/CPU/disk targets align with service requirements
- [ ] Test health check function locally
- [ ] Validate alert templates
- [ ] Document expected utilization ranges

### Post-Deployment

- [ ] Monitor health checks for first 24 hours
- [ ] Verify alerts fire at correct thresholds
- [ ] Check memory stabilizes in target range (50-70%)
- [ ] Validate CPU usage normal (<30% average)
- [ ] Confirm disk usage healthy (<60%)

### 7-Day Validation

- [ ] No emergency alerts triggered
- [ ] Memory stays within optimal zone (60-75%)
- [ ] CPU spikes under 50% (except during deployments)
- [ ] Disk usage trend stable or declining
- [ ] Resource counts stable (no leaks detected)

---

## Troubleshooting

### High Memory Alerts

**Symptom**: Memory consistently above 75% (warning zone)

**Actions**:
1. Check cache hit rates - low hits = wasted memory
2. Review buffer flush frequency - too slow = accumulation
3. Audit resource counts - check for leaks
4. Consider reducing cache sizes temporarily

### Underutilization Alerts

**Symptom**: Memory consistently below 50% (underutilized)

**Actions**:
1. Increase Engine L1 Cache size
2. Increase Runtime Cache size
3. Increase Write Buffer size
4. Pre-load more reference data at startup

### CPU Spikes

**Symptom**: CPU consistently above 50%

**Actions**:
1. Check for infinite loops in battle engine
2. Review Discord event handlers for blocking operations
3. Profile hot paths with Node.js profiler
4. Consider moving CPU-intensive work to workers

---

## References

- **Optimization Plan**: `docs/deployment/RENDER-RESOURCE-OPTIMIZATION-PLAN.md`
- **Current Usage**: `docs/deployment/production-resource-usage-2025-11-11.md`
- **Resource Monitor**: `src/services/resource-monitor.ts`
- **Render Plans**: https://render.com/pricing

---

**Status**: 📋 Standards Established  
**Next Step**: Implement in `resource-monitor.ts`  
**Owner**: Site Reliability Engineering

