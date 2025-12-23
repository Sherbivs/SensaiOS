# Metrics & Observability Expansion Bible

> **Project Status:** FINAL  
> **Created:** 2025-12-19  
> **Authors:** Engineering Team (Architecture Meetings #1-#4)  
> **Priority:** P0-P2 (Phased Implementation)

---

## Executive Summary

This bible documents the comprehensive plan to expand the Infinity Gauntlet metrics, logging, and observability systems. The project addresses critical gaps discovered during SSH verification of production metrics, where hardcoded values were found reporting incorrect disk statistics.

**Key Outcomes:**
- ✅ Accurate real-time disk metrics (COMPLETED - `fs.statfsSync()` fix)
- 🎯 Automated disk space management (heap snapshot pruning)
- 🎯 Proactive alerting before capacity issues
- 🎯 Historical metrics for trend analysis
- 🎯 Decoupled architecture via EventBus

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Architecture Overview](#2-architecture-overview)
3. [Project 1: Heap Snapshot Pruner](#3-project-1-heap-snapshot-pruner)
4. [Project 2: Alert Dispatcher](#4-project-2-alert-dispatcher)
5. [Project 3: Disk Pressure Alerting](#5-project-3-disk-pressure-alerting)
6. [Project 4: EventBus Metrics Integration](#6-project-4-eventbus-metrics-integration)
7. [Project 5: Prometheus Export](#7-project-5-prometheus-export)
8. [Project 6: Historical Metrics Storage](#8-project-6-historical-metrics-storage)
9. [Implementation Phases](#9-implementation-phases)
10. [Testing Strategy](#10-testing-strategy)
11. [Rollback Procedures](#11-rollback-procedures)
12. [Risk Assessment & Mitigations](#12-risk-assessment--mitigations)
13. [Graceful Degradation](#13-graceful-degradation)

---

## 1. Problem Statement

### 1.1 Current State Issues

| Issue | Impact | Severity |
|-------|--------|----------|
| Disk metrics were hardcoded to 10 GB | Operators couldn't trust dashboard | **FIXED** |
| 7 heap snapshots consuming 190+ MB | 22% of 974 MB disk used for debug | **CRITICAL** |
| No disk space alerts | Could hit 100% without warning | **HIGH** |
| Metrics only in logs | No time-series analysis possible | **MEDIUM** |
| Tight coupling to logger | Hard to add new metric consumers | **MEDIUM** |

### 1.2 Resource Constraints

```
Render Standard Plan Resources:
├── RAM:  2,048 MB (2 GB)
├── Disk:   974 MB (/Store persistent volume)
├── vCPU:     1.0
└── Current Usage:
    ├── RAM:  ~280 MB (14%)
    ├── Disk: ~211 MB (22%)
    │   ├── Heap snapshots: 190 MB (7 files)
    │   ├── State files:     15 MB
    │   ├── Cache:            5 MB
    │   └── Write-DB:        ~1 MB
    └── Free: ~763 MB (78%)
```

### 1.3 Risk Assessment

Without intervention:
- **7 days:** 14 heap snapshots = 380 MB (39% disk)
- **14 days:** 28 heap snapshots = 760 MB (78% disk) 
- **21 days:** Disk full, writes fail, service degraded

### 1.4 Heap Snapshot Origin

Heap snapshots are created in `src/index.ts` during startup via `v8.writeHeapSnapshot()`. The pattern is:
```
startup-heap-{ISO-timestamp}.heapsnapshot
```

One snapshot per restart. With 406+ restarts over the project lifetime, manual cleanup has kept this to ~7 files. The pruner automates this cleanup.

**Configuration:** Creation can be disabled via `HEAP_SNAPSHOT_ON_STARTUP=false` once memory is stable.

---

## 2. Architecture Overview

### 2.1 Current Logging Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CURRENT ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  process.memoryUsage() ──┐                                              │
│  process.cpuUsage()    ──┼──► resource-monitor.ts ──► logger.ts ──► stdout
│  fs.statfsSync()       ──┘         │                                    │
│                                    │                                    │
│                              getMetrics()                               │
│                           (sync, point-in-time)                         │
│                                                                         │
│  Problems:                                                              │
│  • Tightly coupled to logger                                            │
│  • No event emission                                                    │
│  • No alerting                                                          │
│  • No historical storage                                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TARGET ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    METRICS COLLECTION                            │   │
│  │                                                                   │   │
│  │  resource-monitor.ts                                             │   │
│  │  ├── getMetrics() ──────────────────────► logger.ts (unchanged) │   │
│  │  └── emitMetricsSnapshot() ─┐                                    │   │
│  │                              │                                    │   │
│  │  heap-pruner.ts ────────────┼──► EventBus                        │   │
│  │  (new worker)               │      │                              │   │
│  │                              │      │                              │   │
│  └──────────────────────────────┼──────┼────────────────────────────┘   │
│                                 │      │                                │
│                                 ▼      ▼                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      EVENT BUS                                   │   │
│  │                                                                   │   │
│  │  Events:                                                         │   │
│  │  • metrics.snapshot        (every 15s)                          │   │
│  │  • alert.disk.warning      (when >75% used)                     │   │
│  │  • alert.disk.critical     (when >85% used)                     │   │
│  │  • alert.disk.emergency    (when >95% used)                     │   │
│  │  • alert.memory.*          (existing thresholds)                │   │
│  │  • system.prune.heapsnapshot (on cleanup)                       │   │
│  │  • system.remediation.success (auto-fix worked)                 │   │
│  │  • system.remediation.failure (auto-fix failed)                 │   │
│  │                                                                   │   │
│  └──────────────────────────────┬───────────────────────────────────┘   │
│                                 │                                       │
│           ┌─────────────────────┼─────────────────────┐                │
│           │                     │                     │                │
│           ▼                     ▼                     ▼                │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐            │
│  │ Prometheus  │      │ Engine      │      │ Alert       │            │
│  │ Exporter    │      │ Write-DB    │      │ Dispatcher  │            │
│  │             │      │             │      │             │            │
│  │ subscribes: │      │ subscribes: │      │ subscribes: │            │
│  │ metrics.*   │      │ metrics.*   │      │ alert.*     │            │
│  └──────┬──────┘      └──────┬──────┘      └──────┬──────┘            │
│         │                    │                    │                    │
│         ▼                    ▼                    ▼                    │
│    Grafana             SQLite Query         Discord DM                │
│    Dashboard           Historical           to DRIPTVDD               │
│                        Analysis                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Project 1: Heap Snapshot Pruner

### 3.1 Overview

| Attribute | Value |
|-----------|-------|
| **Priority** | P0 (Critical) |
| **Complexity** | Low |
| **Dependencies** | None |
| **Files** | `src/workers/heap-pruner.ts` (new) |
| **ETA** | 2 hours |

### 3.2 Requirements

1. **FR-1:** Delete heap snapshots exceeding MAX_COUNT (default: 3)
2. **FR-2:** Delete heap snapshots older than MAX_AGE_DAYS (default: 7)
3. **FR-3:** Run on configurable schedule (default: daily at 00:00 UTC)
4. **FR-4:** Emit EventBus event on prune completion
5. **FR-5:** Log all deletions for audit trail

### 3.3 Configuration

```typescript
// Environment variables
HEAP_SNAPSHOT_ENABLED=true          // Enable/disable pruning
HEAP_SNAPSHOT_MAX_COUNT=3           // Keep N most recent
HEAP_SNAPSHOT_MAX_AGE_DAYS=7        // Delete older than N days
HEAP_SNAPSHOT_PRUNE_INTERVAL_MS=86400000  // 24 hours
```

### 3.4 Implementation

```typescript
// src/workers/heap-pruner.ts

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { EventBus } from '../shared/event-bus.js';
import logger from '../utils/intelligent-logger.js';

interface PruneResult {
  deleted: string[];
  bytesFreed: number;
  remaining: number;
  reason: 'too-many' | 'too-old' | 'both';
}

interface HeapSnapshotInfo {
  path: string;
  filename: string;
  timestamp: Date;
  size: number;
  mtime: number;
}

const CONFIG = {
  storeDir: process.env.RENDER ? '/Store' : './Store',
  maxCount: parseInt(process.env.HEAP_SNAPSHOT_MAX_COUNT ?? '3', 10),
  maxAgeDays: parseInt(process.env.HEAP_SNAPSHOT_MAX_AGE_DAYS ?? '7', 10),
  pattern: /^startup-heap-.*\.heapsnapshot$/,
};

/**
 * List all heap snapshot files with metadata
 */
async function listHeapSnapshots(): Promise<HeapSnapshotInfo[]> {
  const entries = await fs.readdir(CONFIG.storeDir, { withFileTypes: true });
  const snapshots: HeapSnapshotInfo[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!CONFIG.pattern.test(entry.name)) continue;

    const fullPath = path.join(CONFIG.storeDir, entry.name);
    try {
      const stat = await fs.stat(fullPath);
      
      // Extract timestamp from filename: startup-heap-2025-12-19T22-05-27-935Z.heapsnapshot
      const timestampMatch = entry.name.match(/startup-heap-(.+)\.heapsnapshot/);
      const timestamp = timestampMatch 
        ? new Date(timestampMatch[1].replace(/-/g, (m, i) => i > 9 ? ':' : m))
        : new Date(stat.mtime);

      snapshots.push({
        path: fullPath,
        filename: entry.name,
        timestamp,
        size: stat.size,
        mtime: stat.mtime.getTime(),
      });
    } catch {
      // Skip inaccessible files
    }
  }

  // Sort by mtime descending (newest first)
  return snapshots.sort((a, b) => b.mtime - a.mtime);
}

/**
 * Determine which snapshots to delete
 */
function selectForDeletion(snapshots: HeapSnapshotInfo[]): {
  toDelete: HeapSnapshotInfo[];
  reason: PruneResult['reason'];
} {
  const now = Date.now();
  const maxAgeMs = CONFIG.maxAgeDays * 24 * 60 * 60 * 1000;
  const toDelete: HeapSnapshotInfo[] = [];
  
  let hasTooMany = false;
  let hasTooOld = false;

  snapshots.forEach((snap, index) => {
    const isTooOld = (now - snap.mtime) > maxAgeMs;
    const isTooMany = index >= CONFIG.maxCount;

    if (isTooOld) {
      hasTooOld = true;
      toDelete.push(snap);
    } else if (isTooMany) {
      hasTooMany = true;
      toDelete.push(snap);
    }
  });

  const reason: PruneResult['reason'] = 
    hasTooMany && hasTooOld ? 'both' :
    hasTooOld ? 'too-old' : 'too-many';

  return { toDelete, reason };
}

/**
 * Execute heap snapshot pruning
 */
export async function pruneHeapSnapshots(): Promise<PruneResult> {
  const snapshots = await listHeapSnapshots();
  const { toDelete, reason } = selectForDeletion(snapshots);

  if (toDelete.length === 0) {
    logger.info('[HeapPruner] No snapshots to prune', {
      category: 'SYSTEM',
      data: { total: snapshots.length, maxCount: CONFIG.maxCount },
    });
    return { deleted: [], bytesFreed: 0, remaining: snapshots.length, reason };
  }

  let bytesFreed = 0;
  const deleted: string[] = [];

  for (const snap of toDelete) {
    try {
      await fs.unlink(snap.path);
      bytesFreed += snap.size;
      deleted.push(snap.filename);
      
      logger.info(`[HeapPruner] Deleted: ${snap.filename}`, {
        category: 'SYSTEM',
        data: { 
          size: snap.size, 
          age: Math.floor((Date.now() - snap.mtime) / 86400000) + ' days',
        },
      });
    } catch (error) {
      logger.warn(`[HeapPruner] Failed to delete: ${snap.filename}`, {
        category: 'SYSTEM',
        data: { error: String(error) },
      });
    }
  }

  const result: PruneResult = {
    deleted,
    bytesFreed,
    remaining: snapshots.length - deleted.length,
    reason,
  };

  // Emit event for audit trail
  await EventBus.emit('system.prune.heapsnapshot', {
    ...result,
    timestamp: new Date().toISOString(),
  });

  logger.info(`[HeapPruner] Pruning complete`, {
    category: 'SYSTEM',
    data: {
      deleted: deleted.length,
      bytesFreed: `${(bytesFreed / 1024 / 1024).toFixed(2)} MB`,
      remaining: result.remaining,
    },
  });

  return result;
}

/**
 * Start periodic heap snapshot pruning
 */
export function startHeapPruner(): NodeJS.Timeout | null {
  if (process.env.HEAP_SNAPSHOT_ENABLED === 'false') {
    logger.info('[HeapPruner] Disabled via HEAP_SNAPSHOT_ENABLED=false');
    return null;
  }

  const intervalMs = parseInt(
    process.env.HEAP_SNAPSHOT_PRUNE_INTERVAL_MS ?? '86400000', 
    10
  );

  // Run immediately on startup
  pruneHeapSnapshots().catch(err => {
    logger.error('[HeapPruner] Initial prune failed', {
      category: 'SYSTEM',
      data: { error: String(err) },
    });
  });

  // Schedule periodic runs
  const handle = setInterval(() => {
    pruneHeapSnapshots().catch(err => {
      logger.error('[HeapPruner] Scheduled prune failed', {
        category: 'SYSTEM',
        data: { error: String(err) },
      });
    });
  }, intervalMs);

  logger.info('[HeapPruner] Started', {
    category: 'SYSTEM',
    data: { 
      intervalMs, 
      maxCount: CONFIG.maxCount, 
      maxAgeDays: CONFIG.maxAgeDays,
    },
  });

  return handle;
}

/**
 * Stop periodic heap snapshot pruning
 */
export function stopHeapPruner(handle: NodeJS.Timeout | null): void {
  if (handle) {
    clearInterval(handle);
    logger.info('[HeapPruner] Stopped');
  }
}
```

### 3.5 Integration Points

```typescript
// src/index.ts - Add to boot sequence
import { startHeapPruner, stopHeapPruner } from './workers/heap-pruner.js';

let heapPrunerHandle: NodeJS.Timeout | null = null;

async function boot(): Promise<void> {
  // ... existing boot code ...
  
  // Start heap pruner (after Store directory is confirmed)
  heapPrunerHandle = startHeapPruner();
}

async function gracefulShutdown(): Promise<void> {
  // ... existing shutdown code ...
  
  stopHeapPruner(heapPrunerHandle);
}
```

### 3.6 Expected Results

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| Heap snapshot count | 7 | 3 | 4 files |
| Disk used by snapshots | 190 MB | ~80 MB | ~110 MB |
| Disk free | 763 MB | ~873 MB | +14% capacity |

---

## 4. Project 2: Alert Dispatcher

### 4.1 Overview

| Attribute | Value |
|-----------|-------|
| **Priority** | P0 (Critical) |
| **Complexity** | Medium |
| **Dependencies** | EventBus (exists), Discord.js client (exists) |
| **Files** | `src/services/alert-dispatcher.ts` (new) |
| **ETA** | 4 hours |

### 4.2 Requirements

1. **FR-1:** Subscribe to EventBus patterns (`alert.*`, `system.remediation.*`)
2. **FR-2:** Route alerts to Discord channels based on severity
3. **FR-3:** Route CRITICAL/EMERGENCY alerts to admin DMs
4. **FR-4:** Implement per-event-type cooldowns to prevent alert fatigue
5. **FR-5:** Persist CRITICAL/EMERGENCY alerts to `Store/alerts/` as JSON
6. **FR-6:** Escalate after N consecutive alerts of same type
7. **FR-7:** Support test mode for development

### 4.3 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      ALERT DISPATCHER                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  EventBus ──► AlertDispatcher                                   │
│                    │                                             │
│                    ├── Pattern Subscriptions:                   │
│                    │   • alert.disk.*                           │
│                    │   • alert.memory.*                         │
│                    │   • alert.database.*                       │
│                    │   • system.remediation.*                   │
│                    │                                             │
│                    ├── Routing Rules:                           │
│                    │   • WARNING → #ops-alerts channel          │
│                    │   • CRITICAL → #ops-alerts + DM to admin   │
│                    │   • EMERGENCY → #ops-alerts + DM + @here   │
│                    │                                             │
│                    ├── Cooldown Manager:                        │
│                    │   • Per-event-type cooldown tracking       │
│                    │   • Escalation after 5 consecutive         │
│                    │                                             │
│                    ├── Persistence:                             │
│                    │   • CRITICAL/EMERGENCY → Store/alerts/     │
│                    │   • 30-day retention                       │
│                    │                                             │
│                    └── Output Adapters:                         │
│                        • DiscordChannelAdapter                  │
│                        • DiscordDMAdapter                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 Implementation

```typescript
// src/services/alert-dispatcher.ts

import { EventBus } from '../shared/event-bus.js';
import { Client, TextChannel, User } from 'discord.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import logger from '../utils/intelligent-logger.js';

type AlertLevel = 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';

interface AlertPayload {
  type: string;
  level: AlertLevel;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

interface CooldownState {
  lastSent: number;
  consecutiveCount: number;
}

const CONFIG = {
  enabled: process.env.ALERT_DISPATCHER_ENABLED !== 'false',
  testMode: process.env.ALERT_TEST_MODE === 'true',
  channelId: process.env.ALERT_CHANNEL_ID ?? process.env.ALERT_TEST_CHANNEL_ID,
  adminUserId: process.env.ALERT_ADMIN_USER_ID ?? '563220840708177927', // DRIPTVDD
  cooldownMs: parseInt(process.env.ALERT_COOLDOWN_MS ?? '3600000', 10), // 1 hour
  escalationThreshold: 5, // Escalate after 5 consecutive
  persistDir: process.env.ALERT_PERSIST_DIR ?? (process.env.RENDER ? '/Store/alerts' : './Store/alerts'),
  retentionDays: 30,
  startupGracePeriodMs: 60000, // Don't alert for 60s after boot
};

class AlertDispatcher {
  private client: Client | null = null;
  private cooldowns = new Map<string, CooldownState>();
  private bootTime = Date.now();
  private degradedMode = false;

  async initialize(client: Client): Promise<void> {
    if (!CONFIG.enabled) {
      logger.info('[AlertDispatcher] Disabled via ALERT_DISPATCHER_ENABLED=false');
      return;
    }

    this.client = client;
    this.bootTime = Date.now();

    // Validate admin user ID
    try {
      await client.users.fetch(CONFIG.adminUserId);
    } catch {
      throw new Error(`[AlertDispatcher] Invalid ALERT_ADMIN_USER_ID: ${CONFIG.adminUserId}`);
    }

    // Ensure persist directory exists
    await fs.mkdir(CONFIG.persistDir, { recursive: true });

    // Subscribe to alert patterns
    EventBus.subscribe('alert.*', this.handleAlert.bind(this));
    EventBus.subscribe('system.remediation.*', this.handleRemediation.bind(this));

    logger.info('[AlertDispatcher] Initialized', {
      category: 'SYSTEM',
      data: { testMode: CONFIG.testMode, channelId: CONFIG.channelId },
    });
  }

  private async handleAlert(event: AlertPayload, pattern: string): Promise<void> {
    // Startup grace period
    if (Date.now() - this.bootTime < CONFIG.startupGracePeriodMs) {
      logger.debug(`[AlertDispatcher] Ignoring alert during grace period: ${pattern}`);
      return;
    }

    const cooldownKey = `${event.type}:${event.level}`;
    
    if (!this.shouldSendAlert(cooldownKey, event.level)) {
      return;
    }

    try {
      await this.routeAlert(event);
      await this.persistAlert(event);
    } catch (error) {
      logger.error('[AlertDispatcher] Failed to route alert', {
        category: 'SYSTEM',
        data: { error: String(error), event },
      });
    }
  }

  private shouldSendAlert(key: string, level: AlertLevel): boolean {
    if (level === 'INFO') return true; // No cooldown for INFO

    const now = Date.now();
    const state = this.cooldowns.get(key) ?? { lastSent: 0, consecutiveCount: 0 };

    if (now - state.lastSent < CONFIG.cooldownMs) {
      state.consecutiveCount++;
      this.cooldowns.set(key, state);

      // Escalate if too many consecutive
      if (state.consecutiveCount >= CONFIG.escalationThreshold && level === 'WARNING') {
        logger.warn(`[AlertDispatcher] Escalating ${key} to CRITICAL after ${state.consecutiveCount} consecutive alerts`);
        return true; // Allow escalation
      }
      return false;
    }

    // Reset consecutive count on successful send
    this.cooldowns.set(key, { lastSent: now, consecutiveCount: 0 });
    return true;
  }

  private async routeAlert(event: AlertPayload): Promise<void> {
    if (!this.client) return;

    const embed = this.buildEmbed(event);

    // Always send to channel
    if (CONFIG.channelId) {
      const channel = await this.client.channels.fetch(CONFIG.channelId) as TextChannel;
      if (channel) {
        const content = event.level === 'EMERGENCY' ? '@here' : undefined;
        await channel.send({ content, embeds: [embed] });
      }
    }

    // DM admin for CRITICAL/EMERGENCY
    if (event.level === 'CRITICAL' || event.level === 'EMERGENCY') {
      const admin = await this.client.users.fetch(CONFIG.adminUserId);
      if (admin) {
        await admin.send({ embeds: [embed] });
      }
    }
  }

  private buildEmbed(event: AlertPayload): object {
    const colors = {
      INFO: 0x3498db,
      WARNING: 0xf1c40f,
      CRITICAL: 0xe74c3c,
      EMERGENCY: 0x8b0000,
    };

    return {
      title: `${this.getLevelEmoji(event.level)} ${event.level}: ${event.type}`,
      description: event.message,
      color: colors[event.level],
      fields: event.data ? Object.entries(event.data).map(([k, v]) => ({
        name: k,
        value: String(v),
        inline: true,
      })) : [],
      timestamp: event.timestamp,
      footer: { text: CONFIG.testMode ? '⚠️ TEST MODE' : 'Infinity Gauntlet Alerts' },
    };
  }

  private getLevelEmoji(level: AlertLevel): string {
    const emojis = { INFO: 'ℹ️', WARNING: '⚠️', CRITICAL: '🚨', EMERGENCY: '🔥' };
    return emojis[level];
  }

  private async persistAlert(event: AlertPayload): Promise<void> {
    if (event.level !== 'CRITICAL' && event.level !== 'EMERGENCY') return;

    const filename = `${Date.now()}-${event.type.replace(/\./g, '-')}-${event.level}.json`;
    const filepath = path.join(CONFIG.persistDir, filename);
    await fs.writeFile(filepath, JSON.stringify(event, null, 2));
  }

  private async handleRemediation(event: unknown): Promise<void> {
    // Log remediation events for audit
    logger.info('[AlertDispatcher] Remediation event', {
      category: 'SYSTEM',
      data: event as Record<string, unknown>,
    });
  }

  // For /ops test-alert command
  async sendTestAlert(level: AlertLevel = 'WARNING'): Promise<void> {
    const testEvent: AlertPayload = {
      type: 'test.alert',
      level,
      message: 'This is a test alert from /ops test-alert command',
      data: { triggeredBy: 'manual', timestamp: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    };
    await this.routeAlert(testEvent);
  }

  isDegraded(): boolean {
    return this.degradedMode;
  }
}

export const alertDispatcher = new AlertDispatcher();
```

### 4.5 Integration

```typescript
// src/index.ts - Initialize after Discord client ready
import { alertDispatcher } from './services/alert-dispatcher.js';

client.on('ready', async () => {
  await alertDispatcher.initialize(client);
});
```

---

## 5. Project 3: Disk Pressure Alerting

### 5.1 Overview

| Attribute | Value |
|-----------|-------|
| **Priority** | P0 (Critical) |
| **Complexity** | Medium |
| **Dependencies** | Project 2 (Alert Dispatcher) |
| **Files** | `src/services/monitoring/resource-monitor.ts` |
| **ETA** | 4 hours |

### 5.2 Requirements

1. **FR-1:** Detect disk usage thresholds (75%, 85%, 95%)
2. **FR-2:** Emit EventBus alerts at each threshold breach
3. **FR-3:** Include cooldown to prevent alert fatigue (1 per hour per level)
4. **FR-4:** Emergency threshold triggers auto-remediation attempt
5. **FR-5:** Alerts include actionable information (usage %, free space, top consumers)
6. **FR-6:** 60-second startup grace period to avoid deploy false positives

### 5.3 Threshold Configuration

```typescript
// Add to src/services/monitoring/resource-monitor.ts

const DISK_THRESHOLDS = {
  WARNING: 0.75,    // 75% - First alert
  CRITICAL: 0.85,   // 85% - Urgent attention
  EMERGENCY: 0.95,  // 95% - Auto-remediation
} as const;

const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between same-level alerts

type DiskPressureLevel = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
```

### 4.4 Implementation

```typescript
// Add to ResourceMonitor class

private lastDiskAlerts: Record<DiskPressureLevel, number> = {
  NORMAL: 0,
  WARNING: 0,
  CRITICAL: 0,
  EMERGENCY: 0,
};

private calculateDiskPressure(diskTotal: number, diskFree: number): DiskPressureLevel {
  const usedPercent = (diskTotal - diskFree) / diskTotal;
  
  if (usedPercent >= DISK_THRESHOLDS.EMERGENCY) return 'EMERGENCY';
  if (usedPercent >= DISK_THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (usedPercent >= DISK_THRESHOLDS.WARNING) return 'WARNING';
  return 'NORMAL';
}

private shouldEmitDiskAlert(level: DiskPressureLevel): boolean {
  if (level === 'NORMAL') return false;
  
  const now = Date.now();
  const lastAlert = this.lastDiskAlerts[level];
  
  if (now - lastAlert < ALERT_COOLDOWN_MS) {
    return false; // Still in cooldown
  }
  
  this.lastDiskAlerts[level] = now;
  return true;
}

private async emitDiskAlert(
  level: DiskPressureLevel,
  metrics: ResourceMetrics
): Promise<void> {
  const diskUsed = metrics.diskTotal - metrics.diskFree;
  const usedPercent = (diskUsed / metrics.diskTotal) * 100;
  
  const payload = {
    level,
    diskTotal: metrics.diskTotal,
    diskFree: metrics.diskFree,
    diskUsed,
    usedPercent: usedPercent.toFixed(1),
    usedPercentRaw: usedPercent,
    threshold: DISK_THRESHOLDS[level] * 100,
    cacheDir: metrics.cacheDir,
    timestamp: new Date().toISOString(),
  };

  await EventBus.emit(`alert.disk.${level.toLowerCase()}`, payload);
  
  logger.warn(`[ResourceMonitor] Disk pressure: ${level}`, {
    category: 'SYSTEM',
    data: payload,
  });

  // Auto-remediation for EMERGENCY
  if (level === 'EMERGENCY') {
    await this.attemptDiskRemediation();
  }
}

private async attemptDiskRemediation(): Promise<void> {
  logger.warn('[ResourceMonitor] Attempting auto-remediation for disk pressure', {
    category: 'SYSTEM',
  });

  try {
    // Import dynamically to avoid circular dependency
    const { pruneHeapSnapshots } = await import('../../workers/heap-pruner.js');
    const result = await pruneHeapSnapshots();
    
    await EventBus.emit('system.remediation.disk', {
      action: 'prune-heap-snapshots',
      result,
      success: result.bytesFreed > 0,
    });
  } catch (error) {
    logger.error('[ResourceMonitor] Auto-remediation failed', {
      category: 'SYSTEM',
      data: { error: String(error) },
    });
  }
}

// Add to the monitoring loop
private async checkDiskPressure(): Promise<void> {
  const metrics = this.getMetrics();
  const level = this.calculateDiskPressure(metrics.diskTotal, metrics.diskFree);
  
  if (this.shouldEmitDiskAlert(level)) {
    await this.emitDiskAlert(level, metrics);
  }
}
```

### 5.5 Alert Routing

| Level | Channel | DM to Admin | Auto-Remediate |
|-------|---------|-------------|----------------|
| WARNING | #ops-alerts | No | No |
| CRITICAL | #ops-alerts | Yes | No |
| EMERGENCY | #ops-alerts | Yes | Yes (prune snapshots) |

---

## 6. Project 4: EventBus Metrics Integration

### 6.1 Overview

| Attribute | Value |
|-----------|-------|
| **Priority** | P1 (High) |
| **Complexity** | Medium |
| **Dependencies** | None |
| **Files** | `src/services/monitoring/resource-monitor.ts` |
| **ETA** | 3 hours |

### 6.2 Event Schema

```typescript
// metrics.snapshot event payload
interface MetricsSnapshotEvent {
  timestamp: string;
  node: {
    uptime: number;
    pid: number;
    version: string;
  };
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpu: {
    user: number;
    system: number;
  };
  storage: {
    total: number;
    used: number;
    free: number;
    usedPercent: number;
  };
  pressure: {
    memory: MemoryPressureLevel;
    disk: DiskPressureLevel;
  };
}
```

### 5.3 Implementation

```typescript
// Add to ResourceMonitor class

public async emitMetricsSnapshot(): Promise<void> {
  const metrics = this.getMetrics();
  
  const event: MetricsSnapshotEvent = {
    timestamp: new Date().toISOString(),
    node: {
      uptime: metrics.uptime,
      pid: metrics.pid,
      version: metrics.nodeVersion,
    },
    memory: {
      rss: metrics.rss,
      heapUsed: metrics.heapUsed,
      heapTotal: metrics.heapTotal,
      external: metrics.external,
    },
    cpu: {
      user: metrics.cpuUser,
      system: metrics.cpuSystem,
    },
    storage: {
      total: metrics.diskTotal,
      used: metrics.cacheSize,
      free: metrics.diskFree,
      usedPercent: ((metrics.diskTotal - metrics.diskFree) / metrics.diskTotal) * 100,
    },
    pressure: {
      memory: this.calculateMemoryPressure(metrics.rss),
      disk: this.calculateDiskPressure(metrics.diskTotal, metrics.diskFree),
    },
  };

  await EventBus.emit('metrics.snapshot', event);
}
```

---

## 7. Project 5: Prometheus Export

### 7.1 Overview

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 (Medium) |
| **Complexity** | Medium |
| **Dependencies** | Project 4 (EventBus metrics) |
| **Files** | `src/services/prometheus-metrics.ts` |
| **ETA** | 4 hours |

### 7.2 Metrics to Export

```typescript
// Gauge metrics (current value)
ig_memory_rss_bytes
ig_memory_heap_used_bytes
ig_memory_heap_total_bytes
ig_disk_total_bytes
ig_disk_used_bytes
ig_disk_free_bytes
ig_disk_used_percent
ig_cpu_user_percent
ig_cpu_system_percent
ig_uptime_seconds

// Counter metrics (cumulative)
ig_heap_snapshots_pruned_total
ig_disk_alerts_total{level="warning|critical|emergency"}
ig_auto_remediation_total{action="prune-heap-snapshots",success="true|false"}
```

### 6.3 Subscription Pattern

```typescript
// In prometheus-metrics.ts initialization

EventBus.subscribe('metrics.snapshot', (event: MetricsSnapshotEvent) => {
  // Update gauges
  memoryRssGauge.set(event.memory.rss);
  memoryHeapUsedGauge.set(event.memory.heapUsed);
  diskTotalGauge.set(event.storage.total);
  diskUsedGauge.set(event.storage.used);
  diskFreeGauge.set(event.storage.free);
  // ... etc
});

EventBus.subscribe('alert.disk.*', (event) => {
  diskAlertsCounter.inc({ level: event.level.toLowerCase() });
});

EventBus.subscribe('system.prune.heapsnapshot', (event) => {
  heapSnapshotsPrunedCounter.inc(event.deleted.length);
});
```

---

## 8. Project 6: Historical Metrics Storage

### 8.1 Overview

| Attribute | Value |
|-----------|-------|
| **Priority** | P2 (Medium) |
| **Complexity** | High |
| **Dependencies** | Project 4 (EventBus metrics) |
| **Files** | `src/services/database/engine-write-db.ts` |
| **ETA** | 6 hours |

### 8.2 Schema

```sql
-- Add to Engine Write-DB (SQLite)
CREATE TABLE IF NOT EXISTS system_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  
  -- Memory metrics
  rss_bytes INTEGER NOT NULL,
  heap_used_bytes INTEGER NOT NULL,
  heap_total_bytes INTEGER NOT NULL,
  external_bytes INTEGER NOT NULL,
  
  -- CPU metrics
  cpu_user_percent REAL NOT NULL,
  cpu_system_percent REAL NOT NULL,
  
  -- Disk metrics
  disk_total_bytes INTEGER NOT NULL,
  disk_used_bytes INTEGER NOT NULL,
  disk_free_bytes INTEGER NOT NULL,
  
  -- Pressure levels (0=NORMAL, 1=WARNING, 2=CRITICAL, 3=EMERGENCY)
  memory_pressure INTEGER NOT NULL DEFAULT 0,
  disk_pressure INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_system_metrics_timestamp ON system_metrics(timestamp);

-- Retention: Keep 7 days of per-minute samples, then hourly aggregates
-- ~10,080 rows per week of raw data
```

### 7.3 Query Examples

```sql
-- Average memory usage over last hour
SELECT 
  datetime(timestamp/1000, 'unixepoch') as time,
  AVG(rss_bytes) / 1024 / 1024 as avg_rss_mb
FROM system_metrics
WHERE timestamp > (strftime('%s', 'now') - 3600) * 1000
GROUP BY timestamp / 60000; -- Group by minute

-- Disk usage trend over last 24 hours
SELECT 
  datetime(timestamp/1000, 'unixepoch') as time,
  disk_used_bytes * 100.0 / disk_total_bytes as used_percent
FROM system_metrics
WHERE timestamp > (strftime('%s', 'now') - 86400) * 1000
ORDER BY timestamp;

-- Alert history
SELECT 
  datetime(timestamp/1000, 'unixepoch') as time,
  CASE disk_pressure 
    WHEN 1 THEN 'WARNING'
    WHEN 2 THEN 'CRITICAL'
    WHEN 3 THEN 'EMERGENCY'
  END as level
FROM system_metrics
WHERE disk_pressure > 0
ORDER BY timestamp DESC
LIMIT 100;
```

---

## 9. Implementation Phases

### 9.1 Dependency Graph

**Legend:**
- **Solid arrow (→)**: Functional dependency — code requires the other component
- **Dashed positioning**: Temporal dependency — scheduled after other component is proven stable

> P5 (Prometheus) and P6 (Historical) are in Phase 3 not because they functionally depend on P2/P4,
> but because we want the foundation stable before adding more consumers.

```
                    ┌──────────────────────────────────────────────────────────────┐
                    │                    IMPLEMENTATION ORDER                       │
                    └──────────────────────────────────────────────────────────────┘
                    
     PHASE 1 (Week 1)                PHASE 2 (Week 2)              PHASE 3 (Week 3-4)
    ┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
    │                 │           │                 │           │                 │
    │  P1: Heap       │           │  P4: EventBus   │           │  P5: Prometheus │
    │  Snapshot       │           │  Metrics        │──────────►│  Export         │
    │  Pruner         │           │  Integration    │           │                 │
    │                 │           │                 │           └─────────────────┘
    └────────┬────────┘           └────────┬────────┘                   │
             │                             │                            │
             │                             │                            ▼
             │                             │                   ┌─────────────────┐
             ▼                             │                   │                 │
    ┌─────────────────┐                    │                   │  P6: Historical │
    │                 │                    │                   │  Metrics        │
    │  P2: Alert      │                    │                   │  Storage        │
    │  Dispatcher     │                    │                   │                 │
    │                 │                    │                   └─────────────────┘
    └────────┬────────┘                    │
             │                             │
             │                             │
             ▼                             │
    ┌─────────────────┐                    │
    │                 │                    │
    │  P3: Disk       │◄───────────────────┘
    │  Pressure       │
    │  Alerting       │
    │                 │
    └─────────────────┘
```

### 9.2 Phase 1: Foundation (Week 1)

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: Foundation                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Day 1: Heap Snapshot Pruner (P1)                           │
│ ├── Create src/workers/heap-pruner.ts                      │
│ ├── Add to boot sequence in src/index.ts                   │
│ ├── Add HEAP_SNAPSHOT_* environment variables              │
│ └── Test: Verify pruning works locally                      │
│                                                             │
│ Day 2: Alert Dispatcher (P2)                               │
│ ├── Create src/services/alert-dispatcher.ts                │
│ ├── Implement EventBus subscriptions                        │
│ ├── Add Discord channel + DM routing                        │
│ ├── Add cooldown and escalation logic                       │
│ └── Test: /ops test-alert command                          │
│                                                             │
│ Day 3-4: Disk Pressure Alerting (P3)                       │
│ ├── Add DISK_THRESHOLDS to resource-monitor.ts             │
│ ├── Implement calculateDiskPressure()                       │
│ ├── Add startup grace period                                │
│ ├── Wire to Alert Dispatcher via EventBus                  │
│ └── Test: Mock disk usage, verify alerts                    │
│                                                             │
│ Day 5: Deploy & Validate                                   │
│ ├── Deploy to Render                                        │
│ ├── SSH verify heap pruner runs on startup                 │
│ ├── Trigger test alert via /ops test-alert                 │
│ └── Document: Update ROUTER.md files                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 Phase 2: EventBus Integration (Week 2)

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: EventBus Integration (P4)                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Day 1-2: Metrics Emission                                  │
│ ├── Add emitMetricsSnapshot() to resource-monitor.ts       │
│ ├── Add graceful degradation (degradedMode flag)           │
│ ├── Call from monitoring loop (every 15s)                  │
│ └── Test: Verify events emit, degradation on failure        │
│                                                             │
│ Day 3-4: Auto-Remediation                                  │
│ ├── Implement attemptDiskRemediation()                      │
│ ├── Wire to EMERGENCY threshold (95%)                       │
│ ├── Add system.remediation.* events                        │
│ └── Test: Simulate 95% disk, verify prune triggers          │
│                                                             │
│ Day 5: Integration & Documentation                         │
│ ├── Add degraded mode to /ops status                       │
│ ├── Update ROUTER.md files                                  │
│ ├── Add JSDoc comments                                      │
│ └── Update Operations Bible § monitoring                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.4 Phase 3: Advanced Features (Week 3-4)

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 3: Advanced Features (P5, P6)                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Week 3: Prometheus Integration (P5)                        │
│ ├── Add gauge/counter metrics                               │
│ ├── Subscribe to metrics.snapshot                           │
│ ├── Verify /metrics endpoint                                │
│ └── Create Grafana dashboard                                │
│                                                             │
│ Week 4: Historical Storage (P6)                            │
│ ├── Add system_metrics table to Engine Write-DB            │
│ ├── Subscribe to metrics.snapshot                           │
│ ├── Implement 7-day retention policy                        │
│ ├── Add query endpoints for /ops metrics-history           │
│ └── Test: Verify storage and retrieval                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.5 Summary Timeline

| Week | Day | Project | Deliverable |
|------|-----|---------|-------------|
| 1 | 1 | P1 | Heap Snapshot Pruner |
| 1 | 2 | P2 | Alert Dispatcher |
| 1 | 3-4 | P3 | Disk Pressure Alerting |
| 1 | 5 | — | Deploy & Validate Phase 1 |
| 2 | 1-2 | P4 | EventBus Metrics Emission |
| 2 | 3-4 | P4 | Auto-Remediation |
| 2 | 5 | — | Documentation: Update ROUTER.md (workers, services, monitoring), Add JSDoc to new functions, Update Operations Bible § monitoring, Add degraded mode to /ops status |
| 3 | 1-5 | P5 | Prometheus Export |
| 4 | 1-5 | P6 | Historical Metrics Storage |

---

## 10. Testing Strategy

### 10.1 Unit Tests

```typescript
// tests/workers/heap-pruner.spec.ts

describe('HeapPruner', () => {
  it('should keep only MAX_COUNT snapshots', async () => {
    // Setup: Create 5 mock snapshots
    // Execute: pruneHeapSnapshots()
    // Assert: Only 3 remain
  });

  it('should delete snapshots older than MAX_AGE_DAYS', async () => {
    // Setup: Create snapshots with old timestamps
    // Execute: pruneHeapSnapshots()
    // Assert: Old ones deleted
  });

  it('should emit EventBus event on prune', async () => {
    // Setup: Spy on EventBus.emit
    // Execute: pruneHeapSnapshots()
    // Assert: system.prune.heapsnapshot emitted
  });
  
  it('should NOT delete non-heapsnapshot files', async () => {
    // Setup: Create state.json and a heapsnapshot
    // Execute: pruneHeapSnapshots()
    // Assert: state.json still exists
  });
});

// tests/services/alert-dispatcher.spec.ts

describe('AlertDispatcher', () => {
  it('should route WARNING to channel only', async () => {
    // Mock: Discord client
    // Execute: handleAlert({ level: 'WARNING', ... })
    // Assert: Channel.send called, User.send NOT called
  });

  it('should route CRITICAL to channel AND DM', async () => {
    // Mock: Discord client
    // Execute: handleAlert({ level: 'CRITICAL', ... })
    // Assert: Channel.send called, User.send called
  });

  it('should respect cooldown', async () => {
    // Execute: Two WARNING alerts in 30 seconds
    // Assert: Only first alert sent
  });

  it('should escalate after 5 consecutive suppressed alerts', async () => {
    // Execute: 6 WARNING alerts within cooldown
    // Assert: 6th alert escalates to CRITICAL
  });

  it('should persist CRITICAL alerts to Store/alerts/', async () => {
    // Execute: handleAlert({ level: 'CRITICAL', ... })
    // Assert: JSON file created in Store/alerts/
  });
});

// tests/services/monitoring/resource-monitor.spec.ts

describe('DiskPressure', () => {
  it('should return NORMAL when under 75%', () => {
    const level = calculateDiskPressure(1000, 300); // 70% used
    expect(level).toBe('NORMAL');
  });

  it('should return WARNING when 75-85%', () => {
    const level = calculateDiskPressure(1000, 200); // 80% used
    expect(level).toBe('WARNING');
  });

  it('should return CRITICAL when 85-95%', () => {
    const level = calculateDiskPressure(1000, 100); // 90% used
    expect(level).toBe('CRITICAL');
  });

  it('should return EMERGENCY when over 95%', () => {
    const level = calculateDiskPressure(1000, 30); // 97% used
    expect(level).toBe('EMERGENCY');
  });

  it('should ignore alerts during startup grace period', async () => {
    // Setup: Set boot time to now
    // Execute: Immediately trigger 95% disk alert
    // Assert: No alert emitted
  });

  it('should enter degraded mode when EventBus fails', async () => {
    // Mock: EventBus.emit throws error
    // Execute: emitMetricsSnapshot()
    // Assert: degradedMode === true, logging continues
  });
});
```

### 10.2 Integration Tests

```typescript
// tests/integration/disk-alerts.spec.ts

describe('Disk Alert Pipeline', () => {
  it('should DM admin on CRITICAL alert', async () => {
    // Mock: fs.statfsSync returns 90% usage
    // Execute: resourceMonitor.checkDiskPressure()
    // Assert: DM sent to DRIPTVDD Discord ID
  });

  it('should trigger auto-remediation on EMERGENCY', async () => {
    // Mock: fs.statfsSync returns 96% usage
    // Execute: resourceMonitor.checkDiskPressure()
    // Assert: pruneHeapSnapshots() called
  });
});
```

### 9.3 SSH Verification Script

```bash
#!/bin/bash
# scripts/verify-metrics-accuracy.sh
# Run via: wsl ssh render-virginia 'bash -s' < scripts/verify-metrics-accuracy.sh

echo "=== Metrics Accuracy Verification ==="

# Get actual values
ACTUAL_TOTAL=$(df -B1 /Store | tail -1 | awk '{print $2}')
ACTUAL_FREE=$(df -B1 /Store | tail -1 | awk '{print $4}')
ACTUAL_USED=$(df -B1 /Store | tail -1 | awk '{print $3}')

echo "Actual disk stats:"
echo "  Total: $ACTUAL_TOTAL bytes"
echo "  Free:  $ACTUAL_FREE bytes"
echo "  Used:  $ACTUAL_USED bytes"

# Get logged values (from last log line containing "Disk Total")
# Compare and report discrepancies
```

---

## 10. Rollback Procedures

### 10.1 Heap Pruner Rollback

```bash
# Disable via environment variable (no redeploy needed)
render env set HEAP_SNAPSHOT_ENABLED=false

# Or revert code changes
git revert <commit-hash-of-heap-pruner>
git push origin main
# Trigger deploy
```

### 10.2 Disk Alerting Rollback

```bash
# Alerts are non-critical - they only notify, don't modify state
# To silence: Disable EventBus subscription in alert-dispatcher.ts

# Emergency: Set very high thresholds
render env set DISK_WARNING_THRESHOLD=0.99
render env set DISK_CRITICAL_THRESHOLD=0.999
```

### 11.3 EventBus Metrics Rollback

```bash
# Metrics emission is additive - existing logger.ts flow unchanged
# To disable: Comment out emitMetricsSnapshot() call in monitor loop
# No data loss - just stops new events
```

### 11.4 Historical Storage Rollback (P6)

```bash
# Stop writing: Disable subscription to metrics.snapshot in engine-write-db.ts
# Existing data doesn't harm anything - just uses disk space

# OPTIONAL: Purge historical data (only if disk space needed)
# Via SQLite CLI:
sqlite3 /Store/engine-write.db "DELETE FROM system_metrics;"
sqlite3 /Store/engine-write.db "VACUUM;"

# Or drop table entirely:
sqlite3 /Store/engine-write.db "DROP TABLE IF EXISTS system_metrics;"
```

---

## 12. Risk Assessment & Mitigations

### 12.1 Identified Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Alert fatigue** | Operators ignore warnings | Medium | 1-hour cooldown, escalation after 5 consecutive |
| **Deploy false positives** | Unnecessary alerts during restarts | High | 60-second startup grace period |
| **Pruner bugs** | Accidental deletion of important files | Low | Only target `startup-heap-*.heapsnapshot` pattern |
| **EventBus backpressure** | Metrics emission blocks main thread | Low | Async emission, fire-and-forget, no blocking |
| **Invalid admin user ID** | DMs fail silently | Medium | Validate on startup, fail fast with clear error |
| **Disk full before alert** | Service degraded before notification | Low | Auto-remediation at 95% threshold |

### 12.2 Startup Grace Period

To prevent false positives during deployments:

```typescript
const STARTUP_GRACE_PERIOD_MS = 60000; // 60 seconds
const bootTime = Date.now();

function shouldEmitAlert(): boolean {
  if (Date.now() - bootTime < STARTUP_GRACE_PERIOD_MS) {
    return false; // Still in grace period
  }
  // ... rest of logic
}
```

### 12.3 Pattern Safety

Heap pruner ONLY targets files matching:
```typescript
const SAFE_PATTERN = /^startup-heap-.*\.heapsnapshot$/;
```

This ensures:
- ✅ `startup-heap-2025-12-19T22-05-27-935Z.heapsnapshot` — deleted
- ❌ `state.json` — NOT touched
- ❌ `security-bot-state/current.json` — NOT touched
- ❌ `runtime-cache/dexpack.json` — NOT touched

---

## 13. Graceful Degradation

### 13.1 EventBus Failure Mode

If EventBus becomes unavailable, metrics and alerts should degrade gracefully:

```typescript
private degradedMode = false;
private degradedModeEnteredAt: number | null = null;

public async emitMetricsSnapshot(): Promise<void> {
  try {
    const metrics = this.getMetrics();
    await EventBus.emit('metrics.snapshot', event);
    
    // Successfully emitted - exit degraded mode
    if (this.degradedMode) {
      logger.info('[ResourceMonitor] Exiting degraded mode - EventBus recovered');
      this.degradedMode = false;
      this.degradedModeEnteredAt = null;
    }
  } catch (error) {
    // Enter degraded mode
    if (!this.degradedMode) {
      logger.warn('[ResourceMonitor] Entering degraded mode - EventBus unavailable', {
        category: 'SYSTEM',
        data: { error: String(error) },
      });
      this.degradedMode = true;
      this.degradedModeEnteredAt = Date.now();
    }
    // Logging continues even in degraded mode
  }
}

public isDegraded(): boolean {
  return this.degradedMode;
}

public getDegradedDuration(): number | null {
  return this.degradedModeEnteredAt 
    ? Date.now() - this.degradedModeEnteredAt 
    : null;
}
```

### 13.2 Health Check Integration

Degraded mode should be visible in `/ops status`:

```typescript
// In /ops status command handler
const resourceMonitor = getResourceMonitor();
const degraded = resourceMonitor.isDegraded();

embed.addField('EventBus', degraded 
  ? `⚠️ DEGRADED (${formatDuration(resourceMonitor.getDegradedDuration())})`
  : '✅ Healthy'
);
```

### 13.3 Degradation Summary

| Component | Failure | Impact | Recovery |
|-----------|---------|--------|----------|
| EventBus | Down | No metrics events, alerts only via logs | Auto-retry on next emit |
| Discord API | Down | No channel/DM alerts | Alerts persisted to Store/alerts/ |
| /Store disk | Full | No persistence | Auto-prune via emergency threshold |

---

## Appendix A: File Change Summary

| File | Changes | Risk |
|------|---------|------|
| `src/workers/heap-pruner.ts` | NEW FILE | Low |
| `src/services/alert-dispatcher.ts` | NEW FILE | Low |
| `src/services/monitoring/resource-monitor.ts` | Add disk thresholds, EventBus emission, graceful degradation | Medium |
| `src/index.ts` | Add heap pruner + alert dispatcher to boot sequence | Low |
| `src/services/prometheus-metrics.ts` | Add metric subscriptions | Low |
| `src/services/database/engine-write-db.ts` | Add system_metrics table | Medium |
| `src/bot/ops/admin.ts` | Add `/ops test-alert` command | Low |

---

## Appendix B: Environment Variables

> **Note:** `HEAP_SNAPSHOT_ON_STARTUP` controls **creation** of snapshots on boot.
> `HEAP_SNAPSHOT_ENABLED` controls the **pruner** worker that cleans up old snapshots.
> These are independent — you can disable creation but keep pruning for existing files.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ALERT_CHANNEL_ID` | **YES** | — | Discord channel for alerts (required for alerts to work) |
| All others | No | See below | Optional with sensible defaults |

```bash
# Heap Snapshot Creation
HEAP_SNAPSHOT_ON_STARTUP=true        # Create snapshot on boot (disable once memory stable)

# Heap Snapshot Pruner (independent from creation)
HEAP_SNAPSHOT_ENABLED=true           # Enable/disable pruning worker
HEAP_SNAPSHOT_MAX_COUNT=3            # Keep N most recent
HEAP_SNAPSHOT_MAX_AGE_DAYS=7         # Delete older than N days
HEAP_SNAPSHOT_PRUNE_INTERVAL_MS=86400000  # 24 hours

# Alert Dispatcher
ALERT_DISPATCHER_ENABLED=true        # Master switch for all alerts
ALERT_TEST_MODE=false                # Route to test channel instead of production
ALERT_CHANNEL_ID=                    # Discord channel for alerts
ALERT_TEST_CHANNEL_ID=               # Discord channel for test mode
ALERT_ADMIN_USER_ID=563220840708177927  # Who gets DMs (default: DRIPTVDD)
ALERT_COOLDOWN_MS=3600000            # 1 hour between same-level alerts
ALERT_PERSIST_DIR=/Store/alerts      # Where to write alert JSON files

# Disk Alerting
DISK_WARNING_THRESHOLD=0.75          # 75% triggers WARNING
DISK_CRITICAL_THRESHOLD=0.85         # 85% triggers CRITICAL
DISK_EMERGENCY_THRESHOLD=0.95        # 95% triggers EMERGENCY
STARTUP_GRACE_PERIOD_MS=60000        # Don't alert for 60s after boot

# Memory Alerting (Future)
MEMORY_WARNING_THRESHOLD=0.75        # 75% RAM triggers WARNING
MEMORY_CRITICAL_THRESHOLD=0.85       # 85% RAM triggers CRITICAL
MEMORY_EMERGENCY_THRESHOLD=0.95      # 95% RAM triggers EMERGENCY

# Metrics
METRICS_SNAPSHOT_ENABLED=true        # Enable EventBus metrics
METRICS_SNAPSHOT_INTERVAL_MS=15000   # Emit every 15 seconds
```

---

## Appendix C: Testing Utilities

### C.1 Mock Disk Usage

```typescript
// tests/helpers/mock-fs.ts
import { vi } from 'vitest';
import * as fs from 'node:fs';

export function mockDiskUsage(usedPercent: number): void {
  const total = 974 * 1024 * 1024; // 974 MB (Render /Store size)
  const used = Math.floor(total * usedPercent);
  const free = total - used;
  
  vi.spyOn(fs, 'statfsSync').mockReturnValue({
    type: 0,
    bsize: 4096,
    blocks: Math.floor(total / 4096),
    bfree: Math.floor(free / 4096),
    bavail: Math.floor(free / 4096),
    files: 0,
    ffree: 0,
  } as fs.StatsFs);
}

/**
 * Restore real fs.statfsSync implementation after tests
 * Call in afterEach() to prevent test pollution
 */
export function restoreDiskUsage(): void {
  vi.restoreAllMocks();
}

// Usage in tests:
// beforeEach(() => mockDiskUsage(0.90)); // 90% used
// afterEach(() => restoreDiskUsage());

// Usage in test
it('should emit EMERGENCY at 96% disk', async () => {
  mockDiskUsage(0.96);
  await resourceMonitor.checkDiskPressure();
  expect(EventBus.emit).toHaveBeenCalledWith(
    'alert.disk.emergency', 
    expect.objectContaining({ level: 'EMERGENCY' })
  );
});
```

### C.2 EventBus Spy

```typescript
// tests/helpers/eventbus-spy.ts
import { EventBus } from '../../src/shared/event-bus.js';
import { vi } from 'vitest';

export function spyOnEventBus() {
  const emitSpy = vi.spyOn(EventBus, 'emit');
  const subscribeSpy = vi.spyOn(EventBus, 'subscribe');
  
  return {
    emitSpy,
    subscribeSpy,
    getEmittedEvents: () => emitSpy.mock.calls.map(([pattern, payload]) => ({ pattern, payload })),
    reset: () => {
      emitSpy.mockClear();
      subscribeSpy.mockClear();
    },
  };
}
```

### C.3 Performance Assertions

```typescript
// tests/services/resource-monitor.perf.spec.ts
describe('ResourceMonitor Performance', () => {
  it('should emit metrics snapshot in <10ms', async () => {
    const start = performance.now();
    await resourceMonitor.emitMetricsSnapshot();
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(10);
  });
  
  it('should calculate disk pressure in <1ms', () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      resourceMonitor.calculateDiskPressure(974 * 1024 * 1024, 500 * 1024 * 1024);
    }
    const avgDuration = (performance.now() - start) / 1000;
    
    expect(avgDuration).toBeLessThan(1);
  });
});
```

---

## Appendix D: Related Documentation

- [operations-bible/02-database-operations.md](../operations-bible/02-database-operations.md) — Database architecture
- [architecture-bible/03-worker-architecture.md](../architecture-bible/03-worker-architecture.md) — Worker patterns
- [RESOURCE-LIMITS-RAM-VS-DISK.md](../RESOURCE-LIMITS-RAM-VS-DISK.md) — Resource constraints
- [src/services/monitoring/ROUTER.md](../../src/services/monitoring/ROUTER.md) — Monitoring subsystem
- [src/workers/ROUTER.md](../../src/workers/ROUTER.md) — Worker subsystem

---

## Appendix E: Documentation Updates Required

After implementation, update these documents:

| Document | Updates Required |
|----------|------------------|
| **Operations Bible** | Add disk alerting to monitoring section, document `/ops test-alert` |
| **Architecture Bible** | Update worker architecture with heap pruner, add alert dispatcher diagram |
| **README.md** | Add new environment variables to configuration section |
| **Agents.md** | Update observability section with new metrics pipeline |
| `src/workers/ROUTER.md` | Add heap-pruner.ts to worker list |
| `src/services/ROUTER.md` | Add alert-dispatcher.ts to services list |
| `src/services/monitoring/ROUTER.md` | Document disk pressure thresholds and graceful degradation |

---

**Document Status:** FINAL (Meeting #4 Closing Review)  
**Last Updated:** 2025-12-19  
**Review History:**
- Meeting #1: Initial proposal (6 projects)
- Meeting #2: Dependency analysis, EventBus integration
- Meeting #3: Gap analysis, risk mitigations, testing utilities
- Meeting #4: Closing review — 7 documentation clarifications applied

**Clarifications Applied (Meeting #4):**
1. Added remediation events to architecture event list
2. Clarified HEAP_SNAPSHOT_ON_STARTUP vs HEAP_SNAPSHOT_ENABLED
3. Added temporal vs functional dependency legend
4. Expanded Week 2 Day 5 deliverables
5. Added optional data purge to P6 rollback
6. Marked REQUIRED vs OPTIONAL env vars in Appendix B
7. Added restoreDiskUsage() cleanup to Appendix C

**Sign-Off:**
- ✅ Backend Lead
- ✅ Data Engineer
- ✅ Security Specialist
- ✅ Game Engine Dev
- ✅ DevOps Engineer
- ✅ QA Lead

**Next Review:** After Phase 1 completion
