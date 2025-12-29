# SensaiOS — Multi-Tenant Observability-First Architecture

**Project ID:** SENSAIOS-001  
**Status:** IN_PROGRESS  
**Created:** 2025-12-28  
**Owner:** DRIPTVDD  
**Priority:** HIGH — Foundational Infrastructure

---

## Executive Summary

SensaiOS is a **multi-tenant observability-first operating layer** that extends the Infinity Gauntlet kernel architecture. It enforces tenant isolation, provides first-class error detection, and ensures complete observability from the first line of execution.

### Core Principles

1. **Multi-Tenancy First**: Every envelope, log, and error MUST have a tenant scope
2. **Observability by Default**: The kernel enforces logging — you can't escape it
3. **Error Detection as First-Class**: Errors are citizens, not afterthoughts
4. **Guarded Execution**: All handlers run through kernel wrappers

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SensaiOS Architecture                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         Application Layer                           │   │
│   │   (Discord Commands, Battle Engine, Homestead, Workers)             │   │
│   └───────────────────────────────┬─────────────────────────────────────┘   │
│                                   │                                         │
│   ┌───────────────────────────────▼─────────────────────────────────────┐   │
│   │                     runGuarded() Kernel Wrapper                     │   │
│   │   • Automatic error capture                                         │   │
│   │   • Correlation ID injection                                        │   │
│   │   • Tenant scope enforcement                                        │   │
│   │   • Timing/metrics collection                                       │   │
│   └───────────────────────────────┬─────────────────────────────────────┘   │
│                                   │                                         │
│   ┌───────────────────────────────▼─────────────────────────────────────┐   │
│   │                     ExportEnvelope (Scoped)                         │   │
│   │   • scope.tenant (REQUIRED)                                         │   │
│   │   • scope.environment                                               │   │
│   │   • scope.service                                                   │   │
│   │   • scope.component                                                 │   │
│   └───────────────────────────────┬─────────────────────────────────────┘   │
│                                   │                                         │
│   ┌───────────────────────────────▼─────────────────────────────────────┐   │
│   │                     Error Detection Subsystem                       │   │
│   │   • Canonical error shape                                           │   │
│   │   • Fingerprinting & deduplication                                  │   │
│   │   • Severity routing                                                │   │
│   │   • Recovery suggestions                                            │   │
│   └───────────────────────────────┬─────────────────────────────────────┘   │
│                                   │                                         │
│   ┌───────────────────────────────▼─────────────────────────────────────┐   │
│   │                     Output Pipeline                                 │   │
│   │   Console │ Files │ Database │ Loki │ Discord │ Webhooks            │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
docs/projects/SensaiOS/
├── README.md                    # This file
├── ROUTER.md                    # Navigation router
├── architecture/
│   ├── 01-tenant-scope.md       # Multi-tenant scope design
│   ├── 02-export-envelope.md    # Scoped envelope specification
│   ├── 03-error-detection.md    # Error subsystem design
│   ├── 04-run-guarded.md        # Kernel wrapper pattern
│   └── FINAL-ARCHITECTURE.md    # Complete architecture document
└── implementation/
    ├── tenant-scope.ts          # TenantScope type implementation
    ├── export-envelope.ts       # ExportEnvelope implementation
    ├── error-types.ts           # Canonical error types
    └── run-guarded.ts           # runGuarded() implementation
```

---

## Key Components

### 1. TenantScope (Required on Every Envelope)

```typescript
interface TenantScope {
  /** Tenant identifier (e.g., guild ID, user ID, "system") */
  tenant: string;
  
  /** Environment (production, staging, development) */
  environment: 'production' | 'staging' | 'development';
  
  /** Service name */
  service: string;
  
  /** Component within service */
  component: string;
}
```

### 2. ExportEnvelope (Extended from UniversalEnvelope)

```typescript
interface ExportEnvelope<T = unknown> extends UniversalEnvelope<T> {
  /** REQUIRED: Tenant scope for multi-tenancy */
  scope: TenantScope;
  
  /** Export metadata */
  export: {
    format: 'json' | 'jsonl' | 'pretty' | 'csv';
    destination: string;
    timestamp: string;
  };
}
```

### 3. Canonical Error Shape

```typescript
interface CanonicalError {
  /** Error identifier (ULID) */
  id: string;
  
  /** Error classification */
  category: 'validation' | 'database' | 'network' | 'auth' | 'game' | 'system';
  
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  /** Human-readable message */
  message: string;
  
  /** Machine-readable code */
  code: string;
  
  /** Fingerprint for deduplication */
  fingerprint: string;
  
  /** Recovery suggestions */
  recovery?: string[];
  
  /** Original error (if wrapped) */
  cause?: Error;
  
  /** Tenant scope */
  scope: TenantScope;
}
```

### 4. runGuarded() Kernel Wrapper

```typescript
async function runGuarded<T>(
  handler: () => Promise<T>,
  context: GuardedContext
): Promise<T> {
  const correlationId = generateCorrelationId();
  const startTime = performance.now();
  
  try {
    Kernel.log.info('handler.start', {
      scope: context.scope,
      correlationId,
      handler: context.name,
    });
    
    const result = await handler();
    
    Kernel.log.info('handler.complete', {
      scope: context.scope,
      correlationId,
      durationMs: performance.now() - startTime,
    });
    
    return result;
  } catch (error) {
    const canonical = toCanonicalError(error, context.scope);
    
    Kernel.error.capture(canonical);
    
    throw canonical;
  }
}
```

---

## Implementation Status

| Component | Status | File |
|-----------|--------|------|
| TenantScope | 🔄 In Progress | `architecture/01-tenant-scope.md` |
| ExportEnvelope | 🔄 In Progress | `architecture/02-export-envelope.md` |
| Error Detection | 🔄 In Progress | `architecture/03-error-detection.md` |
| runGuarded() | 🔄 In Progress | `architecture/04-run-guarded.md` |
| Final Architecture | ⏳ Pending | `architecture/FINAL-ARCHITECTURE.md` |

---

## Integration Points

### With Existing Systems

1. **UniversalEnvelope** (`src/observability/envelope/types.ts`)
   - ExportEnvelope extends UniversalEnvelope
   - Adds mandatory `scope` field

2. **Kernel Logger** (`src/kernel/kernel-logger.ts`)
   - runGuarded() uses Kernel.log for all operations
   - Automatic correlation ID injection

3. **Error Tracker** (`src/services/monitoring/error-tracker.ts`)
   - CanonicalError integrates with existing error tracking
   - Fingerprinting for deduplication

4. **Event Bus** (`src/shared/event-bus.ts`)
   - Errors can be emitted as events
   - Tenant-scoped event routing

---

## Success Criteria

| Metric | Target |
|--------|--------|
| All envelopes have scope | 100% |
| All handlers use runGuarded | 100% |
| Error capture rate | 100% |
| Tenant isolation verified | All tests pass |
| Documentation complete | All sections written |

---

## Next Steps

1. **Complete Architecture Documents** — Define all specifications
2. **Implement Core Types** — TenantScope, ExportEnvelope, CanonicalError
3. **Create runGuarded()** — Kernel wrapper implementation
4. **Integrate with Existing Systems** — Envelope, Logger, Error Tracker
5. **Migrate Handlers** — Wrap all Discord commands with runGuarded()

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-28  
**Entry Point:** Start with `architecture/01-tenant-scope.md`
