# ROUTER
Title: Observability Suite
Purpose: Centralized observability infrastructure with pluggable backends
Owned Globs: src/observability/**
Last Updated (UTC): 2025-12-20T00:00:00Z

Notes:
- Observability Hub subscribes to Event Bus with '**' pattern
- Security Bot uses direct ingestion via hub.ingest() (bypasses Event Bus)
- Loki backend is first implementation, more backends can be added
- Complete isolation: Hub/backend failures never affect main application

## Directory Structure

```
src/observability/
├── index.ts                      # Suite public API (start/stop/status)
├── ROUTER.md                     # This file
│
├── hub/                          # Central Observability Hub
│   ├── index.ts                  # Hub exports
│   ├── observability-hub.ts      # Hub implementation
│   ├── observability-types.ts    # Core types
│   └── observability-config.ts   # Hub configuration
│
└── backends/                     # Pluggable backends
    └── loki/                     # Loki/Grafana backend
        ├── index.ts              # Loki exports
        ├── loki-backend.ts       # IObservabilityBackend impl
        ├── loki-types.ts         # Loki-specific types
        ├── loki-config.ts        # Loki configuration
        ├── loki-queue.ts         # Bounded queue with backpressure
        ├── loki-circuit-breaker.ts # Hystrix-style circuit breaker
        ├── loki-http-transport.ts  # HTTP client for Loki API
        ├── loki-flush-worker.ts    # Queue drain worker (5s)
        └── loki-health-worker.ts   # Health probe worker (60s)
```

## Architecture

```
                    ┌─────────────────────┐
                    │     Event Bus       │
                    │  (existing system)  │
                    └──────────┬──────────┘
                               │ subscribe('**')
                               ▼
┌──────────────┐    ┌─────────────────────┐
│ Security Bot │───▶│  Observability Hub  │
│   (direct)   │    │    (src/observ...)  │
└──────────────┘    └──────────┬──────────┘
    ingest()                   │ fanOut()
                               ▼
                    ┌─────────────────────┐
                    │   Loki Backend      │
                    │  (backends/loki/)   │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Local Loki        │
                    │  (via ngrok tunnel) │
                    └─────────────────────┘
```

## Key Components

### Hub (src/observability/hub/)

| File | Lines | Purpose |
|------|-------|---------|
| observability-hub.ts | ~280 | Central hub with subscribe/ingest/fanOut |
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
