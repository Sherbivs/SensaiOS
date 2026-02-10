# ROUTER
Title: Observability Layer Entry Point
Purpose: Unified gateway for the Observability Layer parallel to the application layer.
Owned Globs: src/observability/layer/**
Last Updated (UTC): 2026-02-10T16:40:00Z



## Architecture Position

The Observability Layer is a **peer** to the Application Layer. Both sit above the kernel:

```
                    KERNEL LAYER
           ┌───────────────────────────────┐
           │  kernel-hooks, correlation,   │
           │  kernel-observer, boot-kernel │
           └───────────────────────────────┘
                    ↑           ↑
          ┌─────────┴───┐ ┌─────┴─────────┐
          │ APPLICATION │ │ OBSERVABILITY │
          │   LAYER     │ │    LAYER      │
          │  (src/app/) │ │ (layer/index) │
          └─────────────┘ └───────────────┘
```

## Why Parallel Layers?

1. **Separation of Concerns** — Business logic vs monitoring
2. **Independent Evolution** — Backends can change without affecting apps
3. **Direct Kernel Access** — Both layers need kernel primitives
4. **Service Installation** — Hub is where backends register

## Files

| File | Purpose |
|------|---------|
| [index.ts](index.ts) | Layer entry point with kernel re-exports and hub access |

## Exports

### Kernel Access (Direct)
- `createObservabilityHook` — Register monitoring systems with kernel
- `subscribeToLogs/Errors/Services/Events` — Real-time observation
- `queryKernel` — Read kernel state
- `kernelLog` — Quick kernel logging
- Correlation utilities — Distributed tracing

### Hub (Service Installation Point)
- `ObservabilityHub` — Central backend manager
- `observabilityHub` — Singleton instance
- `isHubEnabled` — Feature flag check

### Installable Backends
- `lokiBackend` — Loki log aggregation

### Envelope System
- Factory functions (`createLog`, `createMetric`, etc.)
- Serialization (`serialize`, `deserialize`)
- `scopedLogger` — Safe console logging

### Suite Lifecycle
- `startObservabilitySuite()` — Initialize all observability
- `stopObservabilitySuite()` — Graceful shutdown

## Usage

```typescript
// Application code imports from observability layer
import { 
  scopedLogger,
  observabilityHub,
  createLog,
} from '../observability/layer/index.js';

// Register a custom backend
observabilityHub.register(myCustomBackend);
```

## Integration Notes

- The Observability Layer imports from `../../kernel/` directly (peer layer)
- Application code should import from `../observability/layer/` for monitoring
- Application code should import from `../app/` for business logic kernel access
- Both layers are isolated — failure in one doesn't affect the other

---

**Parent Router:** [src/observability/ROUTER.md](../ROUTER.md)
