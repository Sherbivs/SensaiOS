# Observability Suite — Architecture Bible

> **Project Status:** IMPLEMENTED ✅  
> **Created:** 2025-12-20  
> **Last Updated:** 2025-12-20  
> **Implemented:** 2025-12-20  
> **Specialist Team:** Marcus (Architect), Sarah (Backend), Derek (DevOps), Priya (Observability), Raj (Reliability)  
> **Author:** Sherman Bivens

---

## Executive Summary

This document defines the architecture for an **isolated, parallel Observability Suite** that taps into the existing Event Bus to capture all system events for observability backends. The suite operates as a completely independent subsystem — the existing logging infrastructure remains **100% unchanged**.

### Operator's Vision

> "A separate async set of workers in a dedicated observability suite that ingest from the SAME sources as existing logging but ONLY for observability tools (Loki/Grafana, future Prometheus, etc.) and be as ISOLATED as possible. There should be a centralized buffer between the Event Bus and ANY observability tool."

### Key Objectives

1. **Zero coupling to existing loggers** — Event Bus subscription only, no forwardToLoki() changes
2. **Complete isolation** — Own queue, own workers, own error handling, own lifecycle
3. **Parallel pipeline** — Shadow copy of events, not a replacement
4. **Graceful degradation** — If any backend unreachable, existing logging unaffected
5. **Feature flag control** — Enable/disable via `OBSERVABILITY_HUB_ENABLED` environment variable
6. **Single Event Bus tap** — Centralized Hub subscribes once, fans out to all backends
7. **Direct Security Bot integration** — Security Bot sends DIRECTLY to Hub (bypasses Event Bus entirely)

### Estimated Scope

| Metric | Value |
|--------|-------|
| Total Lines | ~1,850 |
| Implementation Time | 14-20 hours |
| Phases | 7 |
| New Files | 15 |
| Modified Files | 2 (src/index.ts, src/bot/state/stats.ts → observabilityHub.ingest()) |

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Isolation Principles](#2-isolation-principles)
3. [Observability Hub](#3-observability-hub)
4. [Event Bus Integration](#4-event-bus-integration)
5. [Security Bot Integration](#5-security-bot-integration)
6. [Directory Structure](#6-directory-structure)
7. [Core Components](#7-core-components)
8. [Worker Architecture](#8-worker-architecture)
9. [Configuration System](#9-configuration-system)
10. [Reliability Patterns](#10-reliability-patterns)
11. [Implementation Phases](#11-implementation-phases)
12. [Testing Strategy](#12-testing-strategy)
13. [Future Considerations](#13-future-considerations)

---

## 1. Architecture Overview

### 1.1 The Parallel Pipeline with Centralized Hub

The Observability Suite operates as a **shadow pipeline** that taps into the Event Bus via a centralized **Observability Hub**. The Hub subscribes to the Event Bus ONCE and fans out events to all registered backends (Loki, future Prometheus, etc.). It does NOT replace or modify any existing logging — it's purely additive.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA SOURCES                                        │
│  • Battle events (battle.started, battle.ended, battle.turn)                │
│  • Encounter events (encounter.spawn, encounter.catch)                      │
│  • Error events (error.critical, error.high, error.medium)                  │
│  • Threat events (threat.detected)                                          │
│  • Homestead events (homestead.created, homestead.deleted)                  │
│  • Worker events (worker.started, worker.stopped)                           │
│  • Cache events (cache.hit, cache.miss, cache.evict)                        │
│  • Metrics snapshots (metrics.snapshot — periodic telemetry)                │
│  • Metrics snapshots (metrics.snapshot — periodic telemetry)                │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EVENT BUS                                          │
│              src/shared/event-bus.ts (731 lines)                            │
│                                                                             │
│   Features:                                                                 │
│   • Pattern-based subscriptions (*, **, exact)                              │
│   • Correlation IDs for tracing                                             │
│   • 100-event replay buffer                                                 │
│   • Typed payloads (EventTopicMap)                                          │
└───────────────────────────┬─────────────────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
            ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────────────────────┐
│  EXISTING SUBSCRIBERS   │     │  OBSERVABILITY HUB (NEW - CENTRALIZED)      │
│  (100% UNCHANGED)       │     │  src/observability/hub/                     │
│                         │     │                                             │
│  • DB Logger            │     │  ┌─────────────────────────────────────┐    │
│  • Console Logger       │     │  │  ObservabilityHub                   │    │
│  • Stats Logger         │     │  │  eventBus.subscribe('**')           │    │
│  • PrometheusMetrics    │     │  │  SINGLE TAP - subscribe once        │    │
│  • Engine Write-DB      │     │  └─────────────┬───────────────────────┘    │
│                         │     │                │                            │
└─────────────────────────┘     │                │ Fan-out to backends        │
                                │    ┌───────────┴───────────┐                │
            │                   │    │                       │                │
            │                   │    ▼                       ▼                │
            ▼                   │  ┌──────────────┐   ┌──────────────┐        │
    Render Console              │  │ Loki Backend │   │  (Future)    │        │
    + PostgreSQL DB             │  │ (Phase 1)    │   │  Prometheus  │        │
                                │  │              │   │  Datadog     │        │
                                │  │ Queue→HTTP   │   │  etc.        │        │
                                │  └──────┬───────┘   └──────────────┘        │
                                │         │                                   │
                                │         ▼                                   │
                                │   Grafana UI                                │
                                └─────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────────────────────┐
                    │ DIRECT INGESTION PATH (bypasses Event Bus)              │
                    │                                                         │
                    │  ┌───────────────────────────────────────────────────┐  │
                    │  │          SECURITY BOT (DIRECT PATH)               │  │
                    │  │          src/bot/state/stats.ts                   │  │
                    │  │                                                   │  │
                    │  │   Security Bot stats go DIRECTLY to Hub:          │  │
                    │  │   • recordSweep() ──────────┐                     │  │
                    │  │   • recordPermissionChange() ├──▶ Hub.ingest()    │  │
                    │  │   • recordAlert() ──────────┘                     │  │
                    │  │                                                   │  │
                    │  │   WHY BYPASS EVENT BUS?                           │  │
                    │  │   • Security metrics are OBSERVABILITY-SPECIFIC   │  │
                    │  │   • Reduces Event Bus noise                       │  │
                    │  │   • Tighter coupling to observability suite       │  │
                    │  └───────────────────────────────────────────────────┘  │
                    └────────────────────────┬────────────────────────────────┘
                                             │
                                             ▼
                                    ┌────────────────┐
                                    │ Observability  │
                                    │     Hub        │
                                    └────────────────┘
```

### 1.2 Data Flow Summary

**Path A: Event Bus Events (General Application Events)**
1. **Application code** emits events to Event Bus (battle.started, error.critical, etc.)
2. **Existing subscribers** process events as they always have (DB Logger, Console, etc.)
3. **Observability Hub** subscribes with `'**'` pattern to capture ALL events — **ONE TAP**
4. **Hub** normalizes events and fans out to all registered backends (Loki first)
5. **Loki Backend** queues, batches, and HTTP POSTs to Loki

**Path B: Direct Ingestion (Security Bot Metrics)**
1. **Security Bot** calls `observabilityHub.ingest()` directly — **BYPASSES EVENT BUS**
2. **Hub** normalizes events and fans out to all registered backends
3. **Loki Backend** queues, batches, and HTTP POSTs to Loki

**Why Two Paths?**
- Security Bot metrics are **OBSERVABILITY-SPECIFIC** — they don't need app-level subscribers
- Reduces Event Bus noise — no other component cares about security metrics
- Single responsibility: stats.ts owns its observability integration

### 1.3 Key Architectural Benefit

**Touch Event Bus ONCE.** When we add Prometheus, Datadog, or any future observability tool:
- ✅ Add new backend under `src/observability/backends/<name>/`
- ✅ Register it with the Hub at startup
- ❌ NO changes to Event Bus
- ❌ NO changes to existing backends
- ❌ NO changes to Observability Hub

---

## 2. Isolation Principles

### 2.1 Isolation Guarantees

| Failure Scenario | Impact on Existing Systems |
|------------------|---------------------------|
| Hub subscriber fails | **NONE** — isolated try-catch, main app unaffected |
| Loki endpoint unreachable | **NONE** — circuit breaker opens, events queued |
| LokiQueue overflow | **NONE** — events dropped silently within backend |
| Any backend crashes | **NONE** — isolated error handler, backend restarts |
| ngrok tunnel dies | **NONE** — health worker detects, circuit opens |
| `OBSERVABILITY_HUB_ENABLED=false` | **NONE** — Hub never starts |
| Backend HTTP 500 errors | **NONE** — logged internally, events re-queued |

### 2.2 Isolation Boundary Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│  MAIN APPLICATION                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Event Bus                                                            │  │
│  │  (shared, but handlers are isolated)                                  │  │
│  └─────────────────────────────┬────────────────────────────────────────┘  │
│                                │                                           │
│        ┌───────────────────────┼───────────────────────┐                   │
│        │                       │                       │                   │
│        ▼                       ▼                       ▼                   │
│  ┌─────────────┐  ┌────────────────────────────────────────────────────┐  │
│  │  Existing   │  │  ┌──────────────────────────────────────────────┐  │  │
│  │  Subscribers│  │  │       OBSERVABILITY HUB (centralized)        │  │  │
│  │  (DB, etc.) │  │  │                                              │  │  │
│  │             │  │  │  ┌────────────┐      ┌────────────┐          │  │  │
│  │  Continues  │  │  │  │ Loki Bknd  │      │ (Future)   │          │  │  │
│  │  unchanged  │  │  │  │ Queue→HTTP │      │ Prometheus │          │  │  │
│  └─────────────┘  │  │  └────────────┘      └────────────┘          │  │  │
│                   │  │  Own error handling, own lifecycle per bknd  │  │  │
│                   │  └──────────────────────────────────────────────┘  │  │
│                   └────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 What This Means

- **No changes to `forwardToLoki()`** — The existing direct Loki integration stays as-is
- **No changes to `IntelligentLogger`** — Continues to work exactly as before
- **No changes to console output** — Render logs unchanged
- **Additive only** — The suite is purely additional functionality
- **Single integration point** — Only `src/index.ts` and `src/bot/state/stats.ts` get minimal changes

---

## 3. Observability Hub

### 3.1 The Centralized Hub Concept

The Observability Hub is the **single subscriber** to the Event Bus for all observability purposes. It maintains a registry of backends and fans out events to each one. This design ensures:

- **Event Bus touched ONCE** — No matter how many backends we add
- **Backend isolation** — Each backend has its own queue, circuit breaker, workers
- **Easy extensibility** — New backend = new folder + registration call

```typescript
// src/observability/hub/observability-hub.ts

import { eventBus, BusEvent } from '../../shared/event-bus.js';
import type { IObservabilityBackend, ObservabilityEvent } from './observability-types.js';
import { OBSERVABILITY_CONFIG } from './observability-config.js';

/**
 * Central hub that:
 * 1. Subscribes to Event Bus ONCE and fans out to all backends
 * 2. Accepts DIRECT ingestion from Security Bot (bypasses Event Bus)
 * 
 * This is the ONLY integration point between the application and observability.
 */
export class ObservabilityHub {
  private readonly backends: Map<string, IObservabilityBackend> = new Map();
  private subscriptionId: string | null = null;
  private running = false;
  private eventCount = 0;
  private directIngestCount = 0;

  /**
   * Start the hub - subscribe to Event Bus.
   * Call from src/index.ts AFTER Event Bus is ready.
   */
  start(): void {
    if (!OBSERVABILITY_CONFIG.hubEnabled) {
      console.log('[ObservabilityHub] Disabled via OBSERVABILITY_HUB_ENABLED=false');
      return;
    }

    if (this.running) return;
    this.running = true;

    // Subscribe to ALL events via wildcard pattern
    this.subscriptionId = eventBus.subscribe('**', (event: BusEvent) => {
      try {
        this.eventCount++;
        const obsEvent = this.normalize(event);
        this.fanOut(obsEvent);
      } catch (error) {
        // Isolated error handling - never affects main app
        console.warn('[ObservabilityHub] Error processing event:', error);
      }
    }, { 
      priority: -100,  // Low priority: run after critical handlers
      async: true,     // Non-blocking
    });

    console.log('[ObservabilityHub] Started - subscribed to Event Bus');
  }

  /**
   * DIRECT INGESTION: Accept events that bypass Event Bus entirely.
   * Used by Security Bot stats module to send metrics directly to observability.
   * 
   * @param topic - Event topic (e.g., 'security.sweep.completed')
   * @param payload - Event data
   * @param source - Source identifier (default: 'direct')
   */
  ingest(topic: string, payload: Record<string, unknown>, source = 'direct'): void {
    if (!this.running) return;
    
    try {
      this.directIngestCount++;
      const event: ObservabilityEvent = {
        timestamp: new Date(),
        topic,
        level: this.extractLevel(topic),
        service: source,
        payload,
      };
      this.fanOut(event);
    } catch (error) {
      // Isolated error handling - never affects caller
      console.warn('[ObservabilityHub] Error in direct ingest:', error);
    }
  }

  /**
   * Stop the hub - unsubscribe from Event Bus.
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    // Unsubscribe from Event Bus
    if (this.subscriptionId) {
      eventBus.unsubscribe(this.subscriptionId);
      this.subscriptionId = null;
    }

    // Stop all backends gracefully
    for (const backend of this.backends.values()) {
      await backend.stop();
    }

    console.log('[ObservabilityHub] Stopped');
  }

  /**
   * Register a backend (e.g., Loki, Prometheus).
   */
  register(backend: IObservabilityBackend): void {
    this.backends.set(backend.name, backend);
    console.log(`[ObservabilityHub] Registered backend: ${backend.name}`);
  }

  /**
   * Unregister a backend.
   */
  unregister(name: string): void {
    this.backends.delete(name);
  }

  /**
   * Convert BusEvent to normalized ObservabilityEvent.
   */
  private normalize(event: BusEvent): ObservabilityEvent {
    return {
      timestamp: event.timestamp,
      topic: event.topic,
      level: this.extractLevel(event.topic),
      service: event.emitter ?? 'unknown',
      correlationId: event.correlationId,
      payload: event.payload as Record<string, unknown>,
    };
  }

  /**
   * Fan out event to all enabled backends.
   */
  private fanOut(event: ObservabilityEvent): void {
    for (const backend of this.backends.values()) {
      if (backend.enabled) {
        try {
          backend.receive(event);  // Fire-and-forget
        } catch (error) {
          // Individual backend failure doesn't affect others
          console.warn(`[ObservabilityHub] Backend ${backend.name} error:`, error);
        }
      }
    }
  }

  /**
   * Extract log level from event topic.
   */
  private extractLevel(topic: string): 'debug' | 'info' | 'warn' | 'error' {
    if (topic.startsWith('error.critical')) return 'error';
    if (topic.startsWith('error.')) return 'warn';
    if (topic.startsWith('threat.')) return 'warn';
    if (topic.startsWith('security.alert')) return 'warn';
    if (topic.startsWith('security.permission')) return 'warn';
    return 'info';
  }

  /**
   * Get hub status for /ops command.
   */
  getStatus(): HubStatus {
    return {
      enabled: OBSERVABILITY_CONFIG.hubEnabled,
      running: this.running,
      eventBusEvents: this.eventCount,
      directIngestEvents: this.directIngestCount,
      backends: Array.from(this.backends.values()).map(b => ({
        name: b.name,
        enabled: b.enabled,
        status: b.getStatus(),
      })),
    };
  }
}

// Singleton instance
export const observabilityHub = new ObservabilityHub();
```

### 3.2 Backend Interface

```typescript
// src/observability/hub/observability-types.ts

/**
 * Normalized event format passed to all backends.
 */
export interface ObservabilityEvent {
  timestamp: Date;
  topic: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  service: string;
  correlationId?: string;
  payload: Record<string, unknown>;
}

/**
 * Interface that all observability backends must implement.
 * Each backend handles its own queuing, batching, and delivery.
 */
export interface IObservabilityBackend {
  /** Backend identifier (e.g., 'loki', 'prometheus') */
  name: string;
  
  /** Whether backend is enabled */
  enabled: boolean;
  
  /** Receive an event (fire-and-forget, never throws) */
  receive(event: ObservabilityEvent): void;
  
  /** Start backend workers */
  start(): Promise<void>;
  
  /** Stop backend workers gracefully */
  stop(): Promise<void>;
  
  /** Get backend status for monitoring */
  getStatus(): BackendStatus;
}

export interface BackendStatus {
  healthy: boolean;
  queueDepth: number;
  lastFlushAt: Date | null;
  errorCount: number;
  [key: string]: unknown;  // Backend-specific fields
}

export interface HubStatus {
  enabled: boolean;
  running: boolean;
  eventBusEvents: number;      // Events received via Event Bus subscription
  directIngestEvents: number;  // Events received via direct ingest() calls
  backends: Array<{
    name: string;
    enabled: boolean;
    status: BackendStatus;
  }>;
}
```

### 3.3 Adding a New Backend (Future)

When we need to add Prometheus, Datadog, or any other backend:

```typescript
// Example: Adding Prometheus backend

// Step 1: Create backend folder
// src/observability/backends/prometheus/
// ├── index.ts
// ├── prometheus-backend.ts
// ├── prometheus-queue.ts
// └── prometheus-http-transport.ts

// Step 2: Implement IObservabilityBackend
import type { IObservabilityBackend, ObservabilityEvent } from '../../hub/observability-types.js';

export class PrometheusBackend implements IObservabilityBackend {
  name = 'prometheus';
  enabled = true;
  
  receive(event: ObservabilityEvent): void {
    // Convert to Prometheus metrics and queue
  }
  
  async start(): Promise<void> { /* ... */ }
  async stop(): Promise<void> { /* ... */ }
  getStatus(): BackendStatus { /* ... */ }
}

// Step 3: Register at startup (src/index.ts)
import { prometheusBackend } from './observability/backends/prometheus/index.js';
observabilityHub.register(prometheusBackend);
await prometheusBackend.start();
```

**No changes needed to:**
- ❌ Event Bus
- ❌ Observability Hub
- ❌ Loki Backend (or any other existing backend)

---

## 4. Event Bus Integration

### 4.1 The Single "Tap" Pattern

The Observability Hub subscribes to the Event Bus using the `'**'` wildcard pattern, which matches ALL events. This creates a single "tap" that captures everything flowing through the bus.

### 4.2 Events Captured (Via Event Bus)

| Event Topic | Example Payload | Level | Source |
|-------------|-----------------|-------|--------|
| `error.critical` | `{ code: 'DB_CONN', message: '...' }` | error | All services |
| `error.high` | `{ code: 'AUTH_FAIL', userId: '...' }` | warn | All services |
| `threat.detected` | `{ type: 'ROLE_SPAM', severity: 'HIGH' }` | warn | Security Bot |
| `battle.started` | `{ battleId: '...', players: [...] }` | info | Battle Engine |
| `battle.ended` | `{ battleId: '...', winner: '...' }` | info | Battle Engine |
| `homestead.created` | `{ channelId: '...', userId: '...' }` | info | Homestead |
| `worker.started` | `{ workerName: '...', timestamp: '...' }` | info | Workers |
| `metrics.snapshot` | `{ cpu: 45, memory: 350, uptime: 3600 }` | info | Resource Monitor |
| `cache.maintenance` | `{ cleaned: 15, remaining: 230 }` | info | Cache Manager |

> **Note:** Security Bot metrics (sweeps, permission changes, alerts) are NOT captured via Event Bus — they go DIRECTLY to the Hub via `observabilityHub.ingest()`. See [Section 5](#5-security-bot-integration).

### 4.3 Loki Labels (for Grafana Queries)

```
# Event Bus events
{job="infinity-gauntlet", service="battle-engine", level="info"}
{job="infinity-gauntlet", topic=~"error.*"}

# Security Bot events (direct ingestion)
{job="infinity-gauntlet", service="security-bot"}
{job="infinity-gauntlet", topic=~"security.*"}

# Combined view
{job="infinity-gauntlet"} | json | topic =~ "security.*|error.*"
```

---

## 5. Security Bot Integration

### 5.1 Overview

The Security Bot tracks sweeps, permission changes, and alerts via `src/bot/state/stats.ts`. These metrics are **OBSERVABILITY-SPECIFIC** — they exist purely for monitoring, not application logic. Therefore, they go **DIRECTLY** to the Observability Hub, bypassing the Event Bus entirely.

**Why bypass Event Bus?**
- ✅ Security metrics are pure telemetry, not app events
- ✅ Reduces Event Bus noise — no other app subscriber needs these
- ✅ Tighter coupling to observability, looser coupling to main app
- ✅ Single responsibility: Stats module owns its observability integration
- ✅ No pollution of `EventTopicMap` types with observability-only events

### 5.2 Required Changes to stats.ts

```typescript
// src/bot/state/stats.ts — DIRECT INGESTION to Observability Hub

import { observabilityHub } from '../../observability/hub/observability-hub.js';

/**
 * Record a completed role sweep.
 * SENDS DIRECTLY to Observability Hub (bypasses Event Bus).
 */
export function recordSweep(
  state: SecurityBotState,
  guildId: string,
  guildName: string,
  rolesChecked: number,
  changesDetected: number
): void {
  // ... existing state update code ...
  
  // DIRECT ingestion to Observability Hub (NOT Event Bus)
  observabilityHub.ingest('security.sweep.completed', {
    guildId,
    guildName,
    rolesChecked,
    changesDetected,
    timestamp: new Date().toISOString(),
  }, 'security-bot');
}

/**
 * Record a permission change (and potential revert).
 * SENDS DIRECTLY to Observability Hub (bypasses Event Bus).
 */
export function recordPermissionChange(
  state: SecurityBotState,
  guildId: string,
  userId: string,
  action: string,
  reverted: boolean,
  revertStatus?: string
): void {
  // ... existing state update code ...
  
  // DIRECT ingestion to Observability Hub (NOT Event Bus)
  observabilityHub.ingest('security.permission.changed', {
    guildId,
    userId,
    action,
    reverted,
    revertStatus,
    timestamp: new Date().toISOString(),
  }, 'security-bot');
}

/**
 * Record an alert sent to admin.
 * SENDS DIRECTLY to Observability Hub (bypasses Event Bus).
 */
export function recordAlert(
  state: SecurityBotState,
  guildId: string,
  recipient: string,
  reason: string,
  delivered: boolean
): void {
  // ... existing state update code ...
  
  // DIRECT ingestion to Observability Hub (NOT Event Bus)
  observabilityHub.ingest('security.alert.sent', {
    guildId,
    recipient,
    reason,
    delivered,
    timestamp: new Date().toISOString(),
  }, 'security-bot');
}

/**
 * Emit startup event when Security Bot is ready.
 * Call from ClientReady handler.
 */
export function emitStartup(guilds: number): void {
  observabilityHub.ingest('security.startup', {
    guilds,
    timestamp: new Date().toISOString(),
  }, 'security-bot');
}

/**
 * Emit shutdown event on graceful termination.
 * Call from SIGTERM/SIGINT handlers.
 */
export function emitShutdown(reason: string): void {
  observabilityHub.ingest('security.shutdown', {
    reason,
    timestamp: new Date().toISOString(),
  }, 'security-bot');
}
```

### 5.3 Event Topics (Direct Ingestion)

| Topic | Payload | Source |
|-------|---------|--------|
| `security.sweep.completed` | `{ guildId, guildName, rolesChecked, changesDetected, timestamp }` | `recordSweep()` |
| `security.permission.changed` | `{ guildId, userId, action, reverted, revertStatus, timestamp }` | `recordPermissionChange()` |
| `security.alert.sent` | `{ guildId, recipient, reason, delivered, timestamp }` | `recordAlert()` |
| `security.startup` | `{ guilds, timestamp }` | `emitStartup()` |
| `security.shutdown` | `{ reason, timestamp }` | `emitShutdown()` |

### 5.4 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     SECURITY BOT                                │
│                   src/bot/state/stats.ts                        │
│                                                                 │
│  recordSweep() ─────────────────────┐                          │
│  recordPermissionChange() ──────────┼──▶ observabilityHub      │
│  recordAlert() ─────────────────────┤     .ingest(topic, data) │
│  emitStartup() ─────────────────────┤                          │
│  emitShutdown() ────────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
                                      │
                    ╔═════════════════╪══════════════════════╗
                    ║  BYPASSES EVENT BUS ENTIRELY           ║
                    ║  (Security metrics are observability-  ║
                    ║   specific, not application events)    ║
                    ╚═════════════════╪══════════════════════╝
                                      │
                                      ▼
                    ┌─────────────────────────────────────────┐
                    │         OBSERVABILITY HUB               │
                    │   src/observability/hub/                │
                    │                                         │
                    │   ingest() method accepts direct events │
                    │   Fans out to all backends (Loki, etc.) │
                    └─────────────────────────────────────────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │ Loki Backend  │
                              │    Queue      │
                              │   HTTP Push   │
                              └───────────────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │   Grafana     │
                              │   Dashboard   │
                              └───────────────┘
```

### 5.4 Grafana Dashboard Queries for Security Bot

```logql
# Security sweeps per hour
sum by (guildName) (
  count_over_time({job="infinity-gauntlet", topic="security.sweep.completed"}[1h])
)

# Permission changes (potential security incidents)
{job="infinity-gauntlet", topic="security.permission.changed"}
  | json
  | reverted = "true"

# Alert delivery success rate
sum(count_over_time({topic="security.alert.sent"} | json | delivered="true" [24h]))
/
sum(count_over_time({topic="security.alert.sent"} [24h]))
```

---

## 6. Directory Structure

```
src/observability/
├── index.ts                          # Public API: startObservabilitySuite()
├── ROUTER.md                         # Module documentation
│
├── hub/                              # THE CENTRAL HUB
│   ├── observability-hub.ts          # Single Event Bus subscriber
│   ├── observability-types.ts        # ObservabilityEvent, IObservabilityBackend
│   ├── observability-config.ts       # Hub configuration (enabled, etc.)
│   └── backend-registry.ts           # Backend registration helpers
│
└── backends/                         # PLUGGABLE BACKENDS
    └── loki/                         # Loki backend (Phase 1)
        ├── index.ts                  # registerLokiBackend(), exports
        ├── loki-backend.ts           # IObservabilityBackend implementation
        ├── loki-types.ts             # LokiLogEntry, LokiQueueStats
        ├── loki-config.ts            # Loki-specific config
        ├── loki-queue.ts             # Bounded queue (10k)
        ├── loki-circuit-breaker.ts   # Hystrix-style circuit breaker
        ├── loki-http-transport.ts    # HTTP client for Loki API
        ├── loki-flush-worker.ts      # Queue → Loki HTTP push (5s)
        └── loki-health-worker.ts     # Circuit breaker probes (60s)
```

### 6.1 Why Under `src/observability/`?

The suite lives under `src/observability/` because:
1. It's a **cross-cutting concern** — observability spans all services
2. It's **not a worker itself** — the Hub orchestrates workers, but isn't one
3. It's **extensible** — backends can be added without touching other code
4. Clear **separation of concerns** — Hub logic vs Backend logic

---

## 7. Core Components

### 7.1 LokiLogEntry Type

```typescript
// src/observability/backends/loki/loki-types.ts

/**
 * Internal log entry format for the Loki backend.
 * Converted from ObservabilityEvent.
 */
export interface LokiLogEntry {
  /** Timestamp (converted to nanoseconds for Loki) */
  timestamp: Date;
  
  /** Log level */
  level: LokiLevel;
  
  /** Service identifier */
  service: string;
  
  /** Human-readable message */
  message: string;
  
  /** Correlation ID for tracing */
  correlationId?: string;
  
  /** Loki stream labels */
  labels: {
    topic: string;
    environment: string;
    [key: string]: string;
  };
  
  /** Structured data payload (JSON stringified in log line) */
  data?: Record<string, unknown>;
}

export type LokiLevel = 'debug' | 'info' | 'warn' | 'error';
```

### 7.2 LokiSuiteStatus Type

```typescript
/**
 * Status snapshot for /ops loki command and monitoring.
 */
export interface LokiSuiteStatus {
  enabled: boolean;
  running: boolean;
  
  queue: {
    depth: number;
    capacity: number;
    utilizationPercent: number;
    droppedTotal: number;
    backpressureLevel: 'NORMAL' | 'WARNING' | 'CRITICAL';
  };
  
  circuitBreaker: {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failureCount: number;
    lastFailure: Date | null;
  };
  
  workers: {
    flush: { running: boolean; lastTickAt: Date | null; tickCount: number };
    health: { running: boolean; lastTickAt: Date | null; tickCount: number };
  };
  
  transport: {
    endpoint: string;
    lastPushAt: Date | null;
    lastPushStatus: 'success' | 'failure' | null;
    totalPushes: number;
    totalErrors: number;
  };
}
```

### 7.3 LokiQueue

```typescript
// src/observability/backends/loki/loki-queue.ts

/**
 * Bounded queue ISOLATED from any other application queues.
 * Failures here do NOT affect the main Event Bus or other systems.
 */
export class LokiQueue {
  private readonly maxSize: number;
  private readonly queue: LokiLogEntry[] = [];
  private droppedCount: number = 0;
  
  constructor(maxSize: number = 10_000) {
    this.maxSize = maxSize;
  }
  
  /**
   * Push entry to queue. Returns immediately (never blocks).
   * Silently drops if queue is full (isolation guarantee).
   */
  push(entry: LokiLogEntry): PushResult {
    const utilization = this.queue.length / this.maxSize;
    
    if (utilization >= 1.0) {
      this.droppedCount++;
      return 'DROPPED';  // Silent drop - no impact on caller
    }
    
    if (utilization >= 0.95) {
      // Critical: 10% sampling
      if (Math.random() > 0.1) {
        this.droppedCount++;
        return 'SAMPLED';
      }
    }
    
    this.queue.push(entry);
    return utilization >= 0.75 ? 'WARNING' : 'ACCEPTED';
  }
  
  /**
   * Drain up to batchSize entries for flushing.
   */
  drain(batchSize: number): LokiLogEntry[] {
    return this.queue.splice(0, batchSize);
  }
  
  getStats(): LokiQueueStats {
    const utilization = (this.queue.length / this.maxSize) * 100;
    return {
      depth: this.queue.length,
      capacity: this.maxSize,
      utilizationPercent: Math.round(utilization),
      droppedTotal: this.droppedCount,
      backpressureLevel: 
        utilization >= 95 ? 'CRITICAL' :
        utilization >= 75 ? 'WARNING' : 'NORMAL',
    };
  }
}

export type PushResult = 'ACCEPTED' | 'WARNING' | 'SAMPLED' | 'DROPPED';
```

---

### 7.4 Circuit Breaker

```typescript
// src/observability/backends/loki/loki-circuit-breaker.ts

/**
 * Hystrix-style circuit breaker for Loki endpoint.
 * Prevents hammering a dead endpoint.
 */
export class LokiCircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount: number = 0;
  private lastFailureAt: Date | null = null;
  private readonly failureThreshold: number;
  private readonly resetTimeMs: number;
  
  constructor(failureThreshold = 3, resetTimeMs = 60_000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeMs = resetTimeMs;
  }
  
  isOpen(): boolean {
    if (this.state === 'OPEN') {
      // Check if reset time has passed
      if (this.lastFailureAt && 
          Date.now() - this.lastFailureAt.getTime() > this.resetTimeMs) {
        this.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
  }
  
  recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }
  
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureAt = new Date();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
  
  getState(): CircuitState {
    return this.state;
  }
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
```

---

### 7.5 HTTP Transport

```typescript
// src/observability/backends/loki/loki-http-transport.ts

/**
 * HTTP client for Loki push API.
 * Handles Loki-specific format requirements.
 */
export class LokiHttpTransport {
  private readonly endpoint: string;
  private readonly timeout: number;
  private readonly defaultLabels: Record<string, string>;
  
  constructor(config: LokiTransportConfig) {
    this.endpoint = config.endpoint;
    this.timeout = config.timeoutMs ?? 5000;
    this.defaultLabels = {
      job: 'infinity-gauntlet',
      environment: process.env.NODE_ENV ?? 'production',
    };
  }
  
  /**
   * Push batch of entries to Loki.
   */
  async push(entries: LokiLogEntry[]): Promise<void> {
    if (entries.length === 0) return;
    
    const payload = this.buildPayload(entries);
    
    const response = await fetch(`${this.endpoint}/loki/api/v1/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeout),
    });
    
    if (!response.ok) {
      throw new Error(`Loki push failed: ${response.status} ${response.statusText}`);
    }
  }
  
  /**
   * Health check via /ready endpoint.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/ready`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  
  /**
   * Build Loki push payload from entries.
   */
  private buildPayload(entries: LokiLogEntry[]): LokiPushPayload {
    // Group entries by label set
    const streams = new Map<string, LokiStream>();
    
    for (const entry of entries) {
      const labels = { ...this.defaultLabels, ...entry.labels, level: entry.level };
      const labelKey = this.labelsToString(labels);
      
      if (!streams.has(labelKey)) {
        streams.set(labelKey, { stream: labels, values: [] });
      }
      
      // Loki requires nanosecond timestamps as strings
      const nsTimestamp = (entry.timestamp.getTime() * 1_000_000).toString();
      const logLine = JSON.stringify({
        message: entry.message,
        service: entry.service,
        correlationId: entry.correlationId,
        ...entry.data,
      });
      
      streams.get(labelKey)!.values.push([nsTimestamp, logLine]);
    }
    
    return { streams: Array.from(streams.values()) };
  }
  
  private labelsToString(labels: Record<string, string>): string {
    return Object.entries(labels).sort().map(([k, v]) => `${k}="${v}"`).join(',');
  }
}

interface LokiPushPayload {
  streams: LokiStream[];
}

interface LokiStream {
  stream: Record<string, string>;
  values: [string, string][];  // [timestamp_ns, log_line]
}
```

---

## 8. Worker Architecture

### 8.1 LokiFlushWorker

```typescript
// src/observability/backends/loki/loki-flush-worker.ts

/**
 * Drains queue and pushes to Loki.
 * Interval: 5 seconds (configurable)
 * Batch size: 100 entries
 */
export class LokiFlushWorker {
  readonly name = 'loki-flush';
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;
  private tickCount = 0;
  private lastTickAt: Date | null = null;
  
  constructor(
    private readonly queue: LokiQueue,
    private readonly transport: LokiHttpTransport,
    private readonly circuitBreaker: LokiCircuitBreaker,
    private readonly intervalMs: number = 5000,
    private readonly batchSize: number = 100,
  ) {}
  
  start(): void {
    if (this.running) return;
    this.running = true;
    this.intervalId = setInterval(() => this.tick(), this.intervalMs);
  }
  
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
  }
  
  private async tick(): Promise<void> {
    this.tickCount++;
    this.lastTickAt = new Date();
    
    // Circuit breaker check
    if (this.circuitBreaker.isOpen()) {
      return;  // Skip flush, let health worker probe
    }
    
    const entries = this.queue.drain(this.batchSize);
    if (entries.length === 0) return;
    
    try {
      await this.transport.push(entries);
      this.circuitBreaker.recordSuccess();
    } catch (error) {
      this.circuitBreaker.recordFailure();
      // Entries are lost (isolation: no retry, no fallback)
      // This is intentional - suite failure doesn't affect main app
    }
  }
  
  getStatus() {
    return {
      running: this.running,
      lastTickAt: this.lastTickAt,
      tickCount: this.tickCount,
    };
  }
}
```

### 8.2 LokiHealthWorker

```typescript
// src/observability/backends/loki/loki-health-worker.ts

/**
 * Probes Loki endpoint for circuit breaker recovery.
 * Interval: 60 seconds
 */
export class LokiHealthWorker {
  readonly name = 'loki-health';
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;
  private tickCount = 0;
  private lastTickAt: Date | null = null;
  
  constructor(
    private readonly transport: LokiHttpTransport,
    private readonly circuitBreaker: LokiCircuitBreaker,
    private readonly intervalMs: number = 60_000,
  ) {}
  
  start(): void {
    if (this.running) return;
    this.running = true;
    this.intervalId = setInterval(() => this.tick(), this.intervalMs);
  }
  
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
  }
  
  private async tick(): Promise<void> {
    this.tickCount++;
    this.lastTickAt = new Date();
    
    // Only probe when circuit is OPEN or HALF_OPEN
    if (this.circuitBreaker.getState() === 'CLOSED') {
      return;
    }
    
    const healthy = await this.transport.healthCheck();
    if (healthy) {
      this.circuitBreaker.recordSuccess();
    }
  }
  
  getStatus() {
    return {
      running: this.running,
      lastTickAt: this.lastTickAt,
      tickCount: this.tickCount,
    };
  }
}
```

### 8.3 Loki Backend (Public API)

```typescript
// src/observability/backends/loki/loki-backend.ts

import { LOKI_CONFIG } from './loki-config.js';
import { LokiQueue } from './loki-queue.js';
import { LokiCircuitBreaker } from './loki-circuit-breaker.js';
import { LokiHttpTransport } from './loki-http-transport.js';
import { LokiFlushWorker } from './loki-flush-worker.js';
import { LokiHealthWorker } from './loki-health-worker.js';
import type { IObservabilityBackend, ObservabilityEvent, BackendStatus } from '../../hub/observability-types.js';

/**
 * Loki backend implementing IObservabilityBackend.
 * Converts ObservabilityEvent → LokiLogEntry and manages Loki-specific infrastructure.
 */
export class LokiBackend implements IObservabilityBackend {
  readonly name = 'loki';
  enabled = true;
  
  private queue: LokiQueue | null = null;
  private circuitBreaker: LokiCircuitBreaker | null = null;
  private transport: LokiHttpTransport | null = null;
  private flushWorker: LokiFlushWorker | null = null;
  private healthWorker: LokiHealthWorker | null = null;

  /**
   * Receive event from Hub (fire-and-forget).
   */
  receive(event: ObservabilityEvent): void {
    if (!this.queue || !this.enabled) return;
    
    // Convert to Loki format
    const lokiEntry: LokiLogEntry = {
      timestamp: event.timestamp,
      level: event.level,
      service: event.service,
      message: `[${event.topic}] ${JSON.stringify(event.payload)}`,
      correlationId: event.correlationId,
      labels: {
        topic: event.topic,
        environment: process.env.NODE_ENV ?? 'production',
      },
      data: event.payload,
    };
    
    // Fire-and-forget enqueue (never blocks)
    this.queue.push(lokiEntry);
  }

  /**
   * Start Loki backend workers.
   */
  async start(): Promise<void> {
    if (!LOKI_CONFIG.enabled) {
      console.log('[LokiBackend] Disabled via LOKI_ENABLED=false');
      this.enabled = false;
      return;
    }
    
    if (!LOKI_CONFIG.endpoint) {
      console.warn('[LokiBackend] No LOKI_ENDPOINT configured, disabling');
      this.enabled = false;
      return;
    }
    
    // Initialize components
    this.queue = new LokiQueue(LOKI_CONFIG.queueMaxSize);
    this.circuitBreaker = new LokiCircuitBreaker(
      LOKI_CONFIG.circuitBreaker.failureThreshold,
      LOKI_CONFIG.circuitBreaker.resetTimeMs,
    );
    this.transport = new LokiHttpTransport({ 
      endpoint: LOKI_CONFIG.endpoint,
      timeoutMs: LOKI_CONFIG.timeoutMs,
    });
    
    // Start workers
    this.flushWorker = new LokiFlushWorker(this.queue, this.transport, this.circuitBreaker);
    this.healthWorker = new LokiHealthWorker(this.transport, this.circuitBreaker);
    this.flushWorker.start();
    this.healthWorker.start();
    
    console.log('[LokiBackend] Started');
  }

  /**
   * Stop Loki backend gracefully.
   */
  async stop(): Promise<void> {
    // Stop workers
    this.flushWorker?.stop();
    this.healthWorker?.stop();
    
    // Final flush attempt
    if (this.queue && this.transport && this.queue.getStats().depth > 0) {
      const remaining = this.queue.drain(1000);
      try {
        await this.transport.push(remaining);
      } catch {
        // Best effort - don't block shutdown
      }
    }
    
    console.log('[LokiBackend] Stopped');
  }

  /**
   * Get backend status.
   */
  getStatus(): BackendStatus {
    return {
      healthy: this.circuitBreaker?.getState() !== 'OPEN' ?? false,
      queueDepth: this.queue?.getStats().depth ?? 0,
      lastFlushAt: this.flushWorker?.getStatus().lastTickAt ?? null,
      errorCount: this.queue?.getStats().droppedTotal ?? 0,
      circuitState: this.circuitBreaker?.getState() ?? 'UNKNOWN',
      endpoint: LOKI_CONFIG.endpoint,
    };
  }
}

// Singleton instance
export const lokiBackend = new LokiBackend();
```

---

## 9. Configuration

### 9.1 Hub Configuration

```typescript
// src/observability/hub/observability-config.ts

const env = (key: string, fallback: string) => process.env[key] ?? fallback;
const envBool = (key: string, fallback: boolean) => env(key, String(fallback)) === 'true';

/**
 * Observability Hub configuration.
 */
export const OBSERVABILITY_CONFIG = {
  hubEnabled: envBool('OBSERVABILITY_HUB_ENABLED', true),
};
```

### 9.2 Loki Backend Configuration

```typescript
// src/observability/backends/loki/loki-config.ts

const env = (key: string, fallback: string) => process.env[key] ?? fallback;
const envInt = (key: string, fallback: number) => parseInt(env(key, String(fallback)), 10);
const envBool = (key: string, fallback: boolean) => env(key, String(fallback)) === 'true';

/**
 * Loki backend configuration.
 * Isolated from Hub and other backends.
 */
export const LOKI_CONFIG = {
  // Master switch
  enabled: envBool('LOKI_ENABLED', true),
  
  // Endpoint
  endpoint: env('LOKI_ENDPOINT', ''),
  timeoutMs: envInt('LOKI_TIMEOUT_MS', 5000),
  
  // Queue
  queueMaxSize: envInt('LOKI_QUEUE_MAX_SIZE', 10_000),
  
  // Workers
  flushIntervalMs: envInt('LOKI_FLUSH_INTERVAL_MS', 5000),
  healthIntervalMs: envInt('LOKI_HEALTH_INTERVAL_MS', 60_000),
  batchSize: envInt('LOKI_BATCH_SIZE', 100),
  
  // Circuit breaker
  circuitBreaker: {
    failureThreshold: envInt('LOKI_CB_FAILURES', 3),
    resetTimeMs: envInt('LOKI_CB_RESET_MS', 60_000),
  },
  
  // Labels
  labels: {
    job: 'infinity-gauntlet',
    environment: env('NODE_ENV', 'production'),
  },
};
```

### 9.3 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OBSERVABILITY_HUB_ENABLED` | `true` | Master on/off for entire observability system |
| `LOKI_ENABLED` | `true` | Enable/disable Loki backend |
| `LOKI_ENDPOINT` | (required) | Loki push URL (e.g., ngrok tunnel) |
| `LOKI_TIMEOUT_MS` | `5000` | HTTP timeout for Loki requests |
| `LOKI_QUEUE_MAX_SIZE` | `10000` | Max queue depth before dropping |
| `LOKI_FLUSH_INTERVAL_MS` | `5000` | How often to flush queue (ms) |
| `LOKI_HEALTH_INTERVAL_MS` | `60000` | How often to probe health (ms) |
| `LOKI_BATCH_SIZE` | `100` | Entries per flush batch |
| `LOKI_CB_FAILURES` | `3` | Failures before circuit opens |
| `LOKI_CB_RESET_MS` | `60000` | Time before circuit re-probes |

---

## 10. Reliability Patterns

### 10.1 Circuit Breaker State Machine

```
                    3 consecutive failures
        ┌──────────────────────────────────────────┐
        │                                          │
        ▼                                          │
┌──────────────┐                          ┌──────────────┐
│    CLOSED    │                          │     OPEN     │
│   (normal)   │                          │   (bypass)   │
│              │                          │              │
│ Push to Loki │                          │ Skip pushes  │
│              │                          │ Queue grows  │
└──────────────┘                          └──────┬───────┘
        ▲                                        │
        │                                        │ 60s timeout
        │         1 successful probe             │
        │◄───────────────────────────────────────┤
        │                                        │
        │                                        ▼
        │                                ┌──────────────┐
        │                                │  HALF_OPEN   │
        │                                │   (probe)    │
        └────────────────────────────────│              │
                                         │ Try 1 push   │
                                         └──────────────┘
```

### 10.2 Backpressure Levels

| Queue Utilization | State | Behavior |
|-------------------|-------|----------|
| 0% - 75% | NORMAL | Accept all entries |
| 75% - 95% | WARNING | Accept with internal warning |
| 95% - 100% | CRITICAL | Sample at 10%, drop 90% |
| 100% | FULL | Drop all new entries silently |

### 10.3 Isolation Guarantees (Repeated for Emphasis)

**The Loki Suite CANNOT affect the main application because:**

1. **Own queue** — LokiQueue is completely separate from Event Bus buffers
2. **Own error handling** — Exceptions caught internally, never propagated
3. **Own lifecycle** — Can start/stop independently
4. **Fire-and-forget** — Event Bridge never awaits, never throws
5. **Silent failures** — Dropped events counted but not logged to main console

---

## 11. Implementation Phases

### Phase 0: Observability Hub Foundation [~250 lines, 2 hours]

**Files:**
- `src/observability/hub/observability-types.ts` — Core types
- `src/observability/hub/observability-config.ts` — Hub configuration
- `src/observability/hub/backend-registry.ts` — Backend registration helpers
- `src/observability/hub/observability-hub.ts` — Central hub implementation

**Deliverables:**
- [ ] `ObservabilityEvent`, `IObservabilityBackend`, `HubStatus` types
- [ ] `ObservabilityHub` class with `subscribe()`, `ingest()`, `fanOut()`, `register()`
- [ ] Direct `ingest()` method for bypassing Event Bus
- [ ] Hub config reading `OBSERVABILITY_HUB_ENABLED`
- [ ] Backend registry helpers

---

### Phase 1: Loki Backend Core [~400 lines, 3 hours]

**Files:**
- `src/observability/backends/loki/loki-types.ts` — Loki-specific types
- `src/observability/backends/loki/loki-config.ts` — Loki configuration
- `src/observability/backends/loki/loki-queue.ts` — Bounded queue
- `src/observability/backends/loki/loki-circuit-breaker.ts` — Circuit breaker

**Deliverables:**
- [ ] `LokiLogEntry`, `LokiQueueStats` types
- [ ] `LokiQueue` with push/drain/getStats/backpressure
- [ ] `LokiCircuitBreaker` with CLOSED/OPEN/HALF_OPEN
- [ ] Loki config reading all `LOKI_*` env vars

---

### Phase 2: Loki HTTP & Workers [~350 lines, 3 hours]

**Files:**
- `src/observability/backends/loki/loki-http-transport.ts` — HTTP client
- `src/observability/backends/loki/loki-flush-worker.ts` — Queue drainer
- `src/observability/backends/loki/loki-health-worker.ts` — Health checker

**Deliverables:**
- [ ] `LokiHttpTransport` with push/healthCheck
- [ ] `LokiFlushWorker` (5s interval, 100 batch)
- [ ] `LokiHealthWorker` (60s interval)
- [ ] Worker lifecycle (start/stop/getStatus)

---

### Phase 3: Loki Backend Integration [~150 lines, 1-2 hours]

**Files:**
- `src/observability/backends/loki/loki-backend.ts` — IObservabilityBackend impl
- `src/observability/backends/loki/index.ts` — Public exports

**Deliverables:**
- [ ] `LokiBackend` implementing `IObservabilityBackend`
- [ ] `receive()` converting `ObservabilityEvent` → `LokiLogEntry`
- [ ] `start()/stop()/getStatus()` lifecycle
- [ ] Singleton export `lokiBackend`

---

### Phase 4: Security Bot Direct Ingestion [~100 lines, 1 hour]

**Files:**
- `src/bot/state/stats.ts` — ADD observabilityHub.ingest() calls

**Deliverables:**
- [ ] Import `observabilityHub` from observability hub
- [ ] `observabilityHub.ingest('security.sweep.completed', {...})` in `recordSweep()`
- [ ] `observabilityHub.ingest('security.permission.changed', {...})` in `recordPermissionChange()`
- [ ] `observabilityHub.ingest('security.alert.sent', {...})` in `recordAlert()`
- [ ] `emitStartup()` and `emitShutdown()` helper functions

**NOTE:** Security Bot events bypass Event Bus entirely — they go directly to Hub via `ingest()`.

---

### Phase 5: Startup Integration [~100 lines, 1 hour]

**Files:**
- `src/observability/index.ts` — Public API
- `src/index.ts` — Startup/shutdown hooks (~20 lines)

**Deliverables:**
- [ ] `startObservabilitySuite()` / `stopObservabilitySuite()` exports
- [ ] Register Loki backend with Hub
- [ ] Startup hook after Event Bus ready
- [ ] Shutdown hook in cleanup

---

### Phase 6: Grafana Dashboard [~200 lines, 2 hours]

**Files:**
- `ops/grafana-observability-dashboard.json` — Comprehensive dashboard

**Deliverables:**
- [ ] Panels for: Error rates, Security Bot stats, Battle events
- [ ] LogQL queries for all event topics
- [ ] Alert rules for critical errors
- [ ] Time series for queue depth, circuit state

---

### Phase 7: Testing [~400 lines, 3 hours]

**Files:**
- `tests/observability/hub.spec.ts`
- `tests/observability/loki-queue.spec.ts`
- `tests/observability/loki-circuit-breaker.spec.ts`
- `tests/observability/loki-backend.spec.ts`

**Deliverables:**
- [ ] Hub tests: subscribe, fanOut, register/unregister, **direct ingest()**
- [ ] Queue tests: backpressure, drain, overflow
- [ ] Circuit breaker tests: state transitions
- [ ] Backend tests: event conversion, lifecycle

---

### Implementation Summary

| Phase | Description | Lines | Hours |
|-------|-------------|-------|-------|
| 0 | Hub Foundation | ~250 | 2 |
| 1 | Loki Backend Core | ~400 | 3 |
| 2 | Loki HTTP & Workers | ~350 | 3 |
| 3 | Loki Backend Integration | ~150 | 1-2 |
| 4 | Security Bot Events | ~100 | 1 |
| 5 | Startup Integration | ~100 | 1 |
| 6 | Grafana Dashboard | ~200 | 2 |
| 7 | Testing | ~400 | 3 |
| **TOTAL** | | **~1,950** | **16-18** |

---

## 12. Integration Points

### 12.1 Startup Integration (src/index.ts)

```typescript
// In src/index.ts — CHANGES TO EXISTING CODE

import { startObservabilitySuite, stopObservabilitySuite } from './observability/index.js';

// After Event Bus is initialized and ready...
// (around line ~1100, after other workers start)

// ─────────────────────────────────────────────────────────────────────────
// Observability Suite (isolated observability hub + backends)
// ─────────────────────────────────────────────────────────────────────────
try {
  await startObservabilitySuite();
} catch (error) {
  // Non-fatal: suite failure doesn't block bot startup
  console.warn('[Observability] Failed to start:', error);
}

// In shutdown handler (SIGTERM/SIGINT)...
await stopObservabilitySuite();
```

### 12.2 /ops observability Command

```typescript
// In src/bot/ops/admin.ts — ADD new subcommand

case 'observability': {
  const status = getObservabilitySuiteStatus();
  
  const embed = new EmbedBuilder()
    .setTitle('🔭 Observability Hub Status')
    .addFields(
      { name: 'Hub Enabled', value: status.hub.enabled ? '✅' : '❌', inline: true },
      { name: 'Hub Running', value: status.hub.running ? '✅' : '❌', inline: true },
      { name: 'Events Received', value: String(status.hub.eventsReceived), inline: true },
    );
  
  // Add Loki backend status if registered
  if (status.backends.loki) {
    embed.addFields(
      { name: '─── Loki Backend ───', value: '\u200B', inline: false },
      { name: 'Loki Enabled', value: status.backends.loki.enabled ? '✅' : '❌', inline: true },
      { name: 'Circuit', value: status.backends.loki.circuitBreaker.state, inline: true },
      { name: 'Queue Depth', value: `${status.backends.loki.queue.depth}/${status.backends.loki.queue.capacity}`, inline: true },
      { name: 'Dropped', value: String(status.backends.loki.queue.droppedTotal), inline: true },
      { name: 'Backpressure', value: status.backends.loki.queue.backpressureLevel, inline: true },
    );
  }
  
  return interaction.reply({ embeds: [embed], ephemeral: true });
}
```

---

## 13. Testing Strategy

### 13.1 Unit Tests

| Component | Test File | Key Test Cases |
|-----------|-----------|----------------|
| ObservabilityHub | `tests/observability/hub.spec.ts` | subscribe, fanOut, register/unregister backends |
| LokiQueue | `tests/observability/loki-queue.spec.ts` | Push/drain, backpressure levels, overflow |
| LokiCircuitBreaker | `tests/observability/loki-circuit-breaker.spec.ts` | State transitions, timeout recovery |
| LokiBackend | `tests/observability/loki-backend.spec.ts` | Event conversion, lifecycle, IObservabilityBackend |

### 13.2 Sample Test (Hub)

```typescript
// tests/observability/hub.spec.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ObservabilityHub } from '../../src/observability/hub/observability-hub.js';
import type { IObservabilityBackend, ObservabilityEvent } from '../../src/observability/hub/observability-types.js';

describe('ObservabilityHub', () => {
  let hub: ObservabilityHub;
  let mockBackend: IObservabilityBackend;
  let receivedEvents: ObservabilityEvent[];
  
  beforeEach(() => {
    hub = new ObservabilityHub();
    receivedEvents = [];
    mockBackend = {
      name: 'test-backend',
      receive: vi.fn((event) => { receivedEvents.push(event); }),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockReturnValue({ running: true }),
    };
  });
  
  afterEach(() => {
    hub.stop();
  });
  
  it('should register and unregister backends', () => {
    hub.register(mockBackend);
    expect(hub.getStatus().backendCount).toBe(1);
    
    hub.unregister('test-backend');
    expect(hub.getStatus().backendCount).toBe(0);
  });
  
  it('should fanOut events to all registered backends', () => {
    hub.register(mockBackend);
    hub.start();
    
    const event: ObservabilityEvent = {
      topic: 'test.event',
      payload: { data: 'test' },
      timestamp: Date.now(),
      correlationId: 'test-123',
    };
    
    hub['fanOut'](event);
    
    expect(mockBackend.receive).toHaveBeenCalledWith(event);
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0].topic).toBe('test.event');
  });
  
  it('should not fanOut when hub is stopped', () => {
    hub.register(mockBackend);
    // hub.start() NOT called
    
    const event: ObservabilityEvent = {
      topic: 'test.event',
      payload: {},
      timestamp: Date.now(),
    };
    
    hub['fanOut'](event);
    
    expect(mockBackend.receive).not.toHaveBeenCalled();
  });
});
```

### 13.3 Sample Test (LokiQueue)

```typescript
// tests/observability/loki-queue.spec.ts

import { describe, it, expect } from 'vitest';
import { LokiQueue } from '../../src/observability/backends/loki/loki-queue.js';

describe('LokiQueue', () => {
  it('should accept entries under 75% capacity', () => {
    const queue = new LokiQueue(100);
    
    for (let i = 0; i < 74; i++) {
      const result = queue.push(createEntry());
      expect(result).toBe('ACCEPTED');
    }
    
    expect(queue.getStats().backpressureLevel).toBe('NORMAL');
  });
  
  it('should warn at 75-95% capacity', () => {
    const queue = new LokiQueue(100);
    
    // Fill to 80%
    for (let i = 0; i < 80; i++) {
      queue.push(createEntry());
    }
    
    const result = queue.push(createEntry());
    expect(result).toBe('WARNING');
    expect(queue.getStats().backpressureLevel).toBe('WARNING');
  });
  
  it('should sample at 95-100% capacity', () => {
    const queue = new LokiQueue(100);
    
    // Fill to 96%
    for (let i = 0; i < 96; i++) {
      queue.push(createEntry());
    }
    
    // Some will be sampled (10%), some dropped (90%)
    const results = Array.from({ length: 100 }, () => queue.push(createEntry()));
    expect(results.filter(r => r === 'SAMPLED').length).toBeGreaterThan(0);
  });
  
  it('should drop at 100% capacity', () => {
    const queue = new LokiQueue(100);
    
    // Fill completely
    for (let i = 0; i < 100; i++) {
      queue.push(createEntry());
    }
    
    const result = queue.push(createEntry());
    expect(result).toBe('DROPPED');
    expect(queue.getStats().droppedTotal).toBe(1);
  });
});
```

---

## 14. Future Considerations

### 14.1 Adding New Backends (Hub Architecture)

With the Observability Hub in place, adding new backends is straightforward:

```typescript
// Example: Adding Prometheus Backend

// 1. Create backend implementing IObservabilityBackend
// src/observability/backends/prometheus/prometheus-backend.ts
export class PrometheusBackend implements IObservabilityBackend {
  name = 'prometheus';
  
  receive(event: ObservabilityEvent): void {
    // Convert event to Prometheus metrics
    this.recordMetric(event);
  }
  
  async start(): Promise<void> { /* ... */ }
  async stop(): Promise<void> { /* ... */ }
  getStatus(): PrometheusStatus { /* ... */ }
}

// 2. Register with Hub in src/observability/index.ts
import { prometheusBackend } from './backends/prometheus/prometheus-backend.js';

export async function startObservabilitySuite(): Promise<void> {
  if (config.hub.enabled) {
    observabilityHub.register(lokiBackend);      // Existing
    observabilityHub.register(prometheusBackend); // NEW
    // ...
  }
}
```

**Key Point:** Event Bus code (`src/shared/event-bus.ts`) NEVER needs modification — the Hub handles all backend registration.

### 14.2 Potential Enhancements (YAGNI for Now)

| Feature | Description | When to Add |
|---------|-------------|-------------|
| **Prometheus Backend** | Export events as Prometheus metrics | When we add Prometheus |
| **Datadog Backend** | Forward events to Datadog APM | When we add Datadog |
| **Adaptive Flush** | Dynamic flush interval based on queue depth | If batching becomes bottleneck |
| **Sampling Rules** | Per-topic sampling rates | If volume becomes issue |
| **Event Filtering** | Hub-level topic filtering per backend | If backends need different events |
| **Compression** | Gzip Loki payloads | If bandwidth becomes issue |

### 14.3 What We're NOT Building

To keep this simple and isolated:

- ❌ **NO** changes to existing `forwardToLoki()` calls — those stay independent
- ❌ **NO** shared TelemetryProvider — Hub IS the centralized point
- ❌ **NO** console fallback — if all backends fail, events are lost (by design)
- ❌ **NO** complex routing rules — all events go to all registered backends
- ❌ **NO** distributed tracing — correlation IDs are passthrough only

---

## Appendix A: Architecture Decision Records

### ADR-001: Observability Hub as Central Intermediary

**Decision:** Implement Observability Hub as single Event Bus subscriber that fans out to all backends.

**Context:** User requested a centralized buffer/forwarding point between Event Bus and ANY observability tool, to avoid editing Event Bus code when adding new backends.

**Consequences:**
- ✅ Event Bus touched ONCE (single `'**'` subscription)
- ✅ New backends added without touching Event Bus
- ✅ Single point for observability configuration
- ✅ Enables future backends (Prometheus, Datadog, etc.)
- ❌ One more hop (Event Bus → Hub → Backend)
- ❌ Hub becomes SPOF for observability (acceptable)

### ADR-002: Parallel Pipeline vs Replacement

**Decision:** Implement as parallel shadow pipeline, NOT as replacement for existing logging.

**Context:** Original design called for modifying existing loggers to use a shared TelemetryProvider. User clarified they want complete isolation.

**Consequences:**
- ✅ Zero risk to existing logging infrastructure
- ✅ Can be enabled/disabled without code changes
- ✅ Simpler implementation (~1,950 lines)
- ✅ No migration needed
- ❌ Some duplication (two ways to send to Loki)
- ❌ Events may be sent twice if both systems active

### ADR-003: Security Bot Direct Ingestion (Bypass Event Bus)

**Decision:** Security Bot stats go DIRECTLY to Observability Hub via `ingest()`, bypassing Event Bus entirely.

**Context:** Security Bot metrics (sweeps, permission changes, alerts) are OBSERVABILITY-SPECIFIC — they exist purely for monitoring, not application logic. Routing them through Event Bus would:
- Pollute Event Bus with observability-only noise
- Require adding `security.*` topics to `EventTopicMap`
- Create unnecessary coupling between Security Bot and general event system

**Consequences:**
- ✅ Security metrics don't pollute Event Bus
- ✅ Tighter coupling to observability (where they belong)
- ✅ Looser coupling to main application
- ✅ No changes to `EventTopicMap` types
- ✅ Single responsibility: stats.ts owns observability integration
- ❌ stats.ts gains Observability Hub dependency (acceptable — it's observability data)
- ❌ Two ingestion paths into Hub (Event Bus + direct) — acceptable complexity

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **Observability Hub** | Central intermediary that accepts events from Event Bus AND direct ingestion |
| **Direct Ingestion** | Hub's `ingest()` method for sources that bypass Event Bus |
| **Backend** | Any observability tool (Loki, Prometheus, Datadog, etc.) implementing `IObservabilityBackend` |
| **Loki Backend** | The Loki/Grafana implementation, first backend for the Hub |
| **LokiQueue** | Bounded queue specific to Loki backend (separate from Event Bus) |
| **Circuit Breaker** | Pattern to prevent hammering dead Loki endpoint |
| **Tap** | The `'**'` subscription pattern that captures all events |
| **Shadow Pipeline** | Parallel observability path that doesn't affect main systems |
| **Security Events** | Metrics from Security Bot sent via direct ingestion to Hub |

---

## Appendix C: Related Documentation

- [Architecture Bible: Event Bus](../architecture-bible/XX-event-bus.md)
- [Architecture Bible: Worker Architecture](../architecture-bible/03-worker-architecture.md)
- [Operations Bible: Grafana Setup](../operations-bible/XX-grafana-setup.md)
- [Security Bot State Persistence](../../Store/security-bot-state/schema.md)

---

## Appendix D: Security Bot Event Topics (Direct Ingestion)

These events bypass Event Bus and go DIRECTLY to Observability Hub via `ingest()`:

| Topic | Emitted From | Payload |
|-------|--------------|---------|
| `security.sweep.completed` | `recordSweep()` | `{ guildId, guildName, rolesChecked, changesDetected, timestamp }` |
| `security.permission.changed` | `recordPermissionChange()` | `{ guildId, userId, action, reverted, revertStatus, timestamp }` |
| `security.alert.sent` | `recordAlert()` | `{ guildId, recipient, reason, delivered, timestamp }` |
| `security.startup` | `emitStartup()` | `{ guilds, timestamp }` |
| `security.shutdown` | `emitShutdown()` | `{ reason, timestamp }` |

---

**Document Version:** 3.1.0  
**Created:** 2025-12-20  
**Revised:** 2025-12-20 (Security Bot DIRECT ingestion — bypasses Event Bus)  
**Authors:** DRIPTVDD + Sherman Bivens  
**Status:** PLANNING — Ready for implementation

**Key Changes from v3.0.0:**  
1. Security Bot stats now go DIRECTLY to Hub via `ingest()` — bypasses Event Bus entirely
2. Added Hub `ingest()` method for direct event submission
3. Added `HubStatus.directIngestEvents` counter
4. Updated ADR-003 to reflect direct ingestion decision
5. Updated architecture diagram to show Security Bot direct path
