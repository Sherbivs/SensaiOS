# ROUTER
Title: Observability Layer
Purpose: Centralized observability infrastructure — parallel layer to Application Layer
Owned Globs: src/observability/**
Last Updated (UTC): 2025-12-30T00:00:00Z

Notes:
- **ARCHITECTURE**: Observability Layer is a PEER to Application Layer (both import from kernel)
- Observability Hub is the "service manager" where backends install themselves
- Hub subscribes to Event Bus with '**' pattern for automatic event capture
- Security Bot uses direct ingestion via hub.ingest() (bypasses Event Bus)
- Loki backend is first implementation, more backends can be added
- Complete isolation: Hub/backend failures never affect main application

## Layer Architecture

```
                    KERNEL LAYER (Protected Core)
           ┌───────────────────────────────────────────┐
           │  kernel-hooks, correlation, boot-kernel,  │
           │  kernel-observer, kernel-error-detector   │
           └───────────────────────────────────────────┘
                    ↑                      ↑
          ┌─────────┴───────────┐ ┌────────┴────────────┐
          │  APPLICATION LAYER  │ │  OBSERVABILITY LAYER│
          │     (src/app/)      │ │  (src/observability)│
          │                     │ │                     │
          │ • Discord adapter   │ │ • Hub (services)    │
          │ • Worker adapter    │ │ • Loki backend      │
          │ • Infra adapter     │ │ • Envelope system   │
          └─────────────────────┘ └─────────────────────┘
                    ↑                      ↑
                    └──────────┬───────────┘
                               │
           ┌───────────────────┴───────────────────────┐
           │            APPLICATION SYSTEMS            │
           │  bot/, workers/, shared/, services/       │
           └───────────────────────────────────────────┘
```

## Directory Structure

```
src/observability/
├── index.ts                      # Suite lifecycle (start/stop/status)
├── ROUTER.md                     # This file
│
├── layer/                        # LAYER ENTRY POINT (parallel to src/app/)
│   ├── index.ts                  # Unified exports + kernel re-exports
│   └── ROUTER.md                 # Layer documentation
│
├── hub/                          # Central Service Manager
│   ├── index.ts                  # Hub exports
│   ├── observability-hub.ts      # Hub implementation (backend installation)
│   ├── observability-types.ts    # Core types (IObservabilityBackend)
│   └── observability-config.ts   # Hub configuration
│
├── backends/                     # Installable Services (Backends)
│   └── loki/                     # Loki/Grafana backend
│       ├── index.ts              # Loki exports
│       ├── loki-backend.ts       # IObservabilityBackend impl
│       ├── loki-types.ts         # Loki-specific types
│       ├── loki-config.ts        # Loki configuration
│       ├── loki-queue.ts         # Bounded queue with backpressure
│       ├── loki-circuit-breaker.ts # Hystrix-style circuit breaker
│       ├── loki-http-transport.ts  # HTTP client for Loki API
│       ├── loki-flush-worker.ts    # Queue drain worker (5s)
│       └── loki-health-worker.ts   # Health probe worker (60s)
│
└── envelope/                     # Universal Event Format
    ├── index.ts                  # Envelope exports
    ├── types.ts                  # Envelope type definitions
    ├── factory.ts                # Envelope creation helpers
    ├── console.ts                # Safe scoped logging
    └── serializer.ts             # JSON/JSONL serialization
```

## Data Flow

```
                    ┌─────────────────────┐
                    │     Event Bus       │
                    │  (existing system)  │
                    └──────────┬──────────┘
                               │ subscribe('**')
                               ▼
┌──────────────┐    ┌─────────────────────┐
│ Security Bot │───▶│  Observability Hub  │◀── register(backend)
│   (direct)   │    │  (Service Manager)  │
└──────────────┘    └──────────┬──────────┘
    ingest()                   │ fanOut()
                               ▼
                    ┌─────────────────────┐
                    │ Installed Backends  │
                    │  • Loki             │
                    │  • (Prometheus)     │
                    │  • (Datadog)        │
                    └─────────────────────┘
```

## Key Components

### Layer Entry Point (src/observability/layer/)

| File | Purpose |
|------|---------|
| index.ts | Unified gateway — kernel re-exports + hub + backends + envelope |

### Hub (src/observability/hub/)

| File | Lines | Purpose |
|------|-------|---------|
| observability-hub.ts | ~280 | Service manager with register/ingest/fanOut |
| observability-types.ts | ~120 | ObservabilityEvent, IObservabilityBackend |
| observability-config.ts | ~40 | OBSERVABILITY_HUB_ENABLED config |

### Loki Backend (src/observability/backends/loki/)

| File | Lines | Purpose |
|------|-------|---------|
| loki-backend.ts | ~190 | IObservabilityBackend implementation |
| loki-queue.ts | ~160 | Bounded queue with backpressure |
| loki-circuit-breaker.ts | ~150 | CLOSED/OPEN/HALF_OPEN state machine |
| loki-http-transport.ts | ~170 | HTTP client for Loki push API |
| loki-flush-worker.ts | ~140 | Queue drain (5s interval, 100 batch) |
| loki-health-worker.ts | ~100 | Health probe (60s interval) |

## Environment Variables

### Hub Configuration
- `OBSERVABILITY_HUB_ENABLED` — Master switch (default: true)

### Loki Configuration
- `LOKI_ENABLED` — Enable Loki backend (default: true)
- `LOKI_ENDPOINT` — Loki push URL (required)
- `LOKI_TIMEOUT_MS` — HTTP timeout (default: 5000)
- `LOKI_QUEUE_MAX_SIZE` — Max queue depth (default: 10000)
- `LOKI_FLUSH_INTERVAL_MS` — Flush interval (default: 5000)
- `LOKI_HEALTH_INTERVAL_MS` — Health interval (default: 60000)
- `LOKI_BATCH_SIZE` — Entries per batch (default: 100)
- `LOKI_CB_FAILURES` — Circuit breaker threshold (default: 3)
- `LOKI_CB_RESET_MS` — Circuit reset time (default: 60000)

## Usage

### Startup Integration (src/index.ts)

```typescript
import { startObservabilitySuite, stopObservabilitySuite } from './observability/index.js';

// After Event Bus ready...
await startObservabilitySuite();

// In shutdown handler...
await stopObservabilitySuite();
```

### Direct Ingestion (Security Bot)

```typescript
import { observabilityHub } from './observability/index.js';

// Bypass Event Bus entirely
observabilityHub.ingest('security.sweep.completed', {
  guildId: '...',
  rolesChecked: 5,
  changesDetected: 0,
}, 'security-bot');
```

## Related Documentation

### Core Contracts (AUTHORITATIVE)
- [Telemetry Contract](./TELEMETRY_CONTRACT.md) — ALL metrics, labels, log schemas, cardinality rules
- [Discord Observability](./DISCORD_OBSERVABILITY.md) — Discord-specific patterns, anti-patterns, bot metrics

### Architecture
- [Observability Bible](../../docs/projects/observability/bible-integration/observability-bible.md) — Complete architecture spec
- [Metrics Expansion Bible](../../docs/projects/observability/bible-integration/metrics-expansion-bible.md) — Metrics roadmap

### Operations
- [Loki Setup](../../docs/operations-bible/loki-setup.md) — Local Loki stack quickstart
- [Loki Query Suite](../../docs/operations-bible/loki-query-suite.md) — LogQL recipes
- [Monitoring](../../docs/operations-bible/05-monitoring.md) — Service health and alerts

### Integration
- [Event Bus](../shared/event-bus.ts) — Source of events via '**' subscription
- [Security Bot State](../bot/state/) — Direct ingestion source
- [Envelope System](./envelope/) — Structured logging primitives

---

**Created:** 2025-12-20 | **Updated:** 2025-12-28 | **Author:** Sherman Bivens
