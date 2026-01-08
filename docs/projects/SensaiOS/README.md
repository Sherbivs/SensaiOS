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
│                       SensaiOS Architecture (v1.2.0)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         Application Layer                           │   │
│   │   (Discord Commands, Battle Engine, Homestead, Workers)             │   │
│   └───────────────────────────────┬─────────────────────────────────────┘   │
│                                   │                                         │
│   ┌───────────────────────────────▼─────────────────────────────────────┐   │
│   │                     runGuarded() Kernel Wrapper                     │   │
│   │   • Automatic error capture    • Timing/metrics collection          │   │
│   │   • Correlation ID injection   • Tenant scope enforcement           │   │
│   └───────────────────────────────┬─────────────────────────────────────┘   │
│                                   │                                         │
│   ┌───────────────────────────────▼─────────────────────────────────────┐   │
│   │                 v1.2.0 Advanced Subsystems (NEW)                    │   │
│   │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │   │
│   │  │  Storage    │ │ Concurrency │ │Visualization│ │ Capabilities│   │   │
│   │  │  SHA-256    │ │ Lock Mgr    │ │ Dep Graph   │ │ Delegation  │   │   │
│   │  │  CAS Blobs  │ │ Deadlock    │ │ ASCII/Mermaid│ │ Time-bound │   │   │
│   │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │   │
│   └───────────────────────────────┬─────────────────────────────────────┘   │
│                                   │                                         │
│   ┌───────────────────────────────▼─────────────────────────────────────┐   │
│   │                     ExportEnvelope (Scoped)                         │   │
│   │   • scope.tenantId (REQUIRED)  • scope.guildId (REQUIRED)           │   │
│   │   • correlationId               • idempotencyKey                    │   │
│   └───────────────────────────────┬─────────────────────────────────────┘   │
│                                   │                                         │
│   ┌───────────────────────────────▼─────────────────────────────────────┐   │
│   │                     Error Detection Subsystem                       │   │
│   │   • Canonical SensaiError shape (1xxx-6xxx codes)                   │   │
│   │   • Fingerprinting & deduplication                                  │   │
│   │   • Severity routing (low/medium/high/critical)                     │   │
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
├── INDEX.md                              # 📚 START HERE — Document navigation
├── README.md                             # This file (project overview)
├── ROUTER.md                             # Navigation router
├── IMPLEMENTATION-PLAN.md                # Phased implementation guide
├── SENSAI-FINAL-ARCHITECTURE.md          # ⭐ CANONICAL SPEC (v1.1.2)
├── SENSAI-COMPONENT-OS-BLUEPRINT.md      # Component model deep-dive
├── SENSAI-ARCHITECTURE-ADDENDUM.md       # Scalability patterns
├── SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md  # v1.1.2 patterns
├── SENSAI-QUICK-REFERENCE.md             # Cheat sheet
└── architecture/                         # Design specifications
    ├── 01-tenant-scope.md                # Multi-tenant scope design
    ├── 02-export-envelope.md             # Export envelope specification
    ├── 03-error-detection.md             # Canonical error subsystem
    ├── 04-run-guarded.md                 # Kernel wrapper pattern
    ├── 05-host-runtime.md                # Node container boot contract
    └── 06-os-security-model.md           # Ring security model (NEW)
```

> **Implementation:** TypeScript implementations live in `src/sensaios/` (18 files, ~2,000 lines)

---

## Key Components

### 1. TenantScope (v1.1.2 — Required on Every Envelope)

```typescript
/** v1.1.2 Simplified TenantScope */
interface TenantScope {
  /** Bot instance identifier (e.g., "prod", "staging", "dev") */
  tenantId: string;
  
  /** Discord guild ID (or "system" for non-guild operations) */
  guildId: string;
}
```

> **See:** [architecture/01-tenant-scope.md](architecture/01-tenant-scope.md) for complete specification.

### 2. ExportEnvelope (Extended from UniversalEnvelope)

```typescript
interface ExportEnvelope<T = unknown> extends UniversalEnvelope<T> {
  /** REQUIRED: Tenant scope for multi-tenancy (v1.1.2) */
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

| Component | Status | Document |
|-----------|--------|----------|
| Core Architecture | ✅ CANONICAL | `SENSAI-FINAL-ARCHITECTURE.md` (v1.1.2, 1,191 lines) |
| TenantScope | ✅ SPEC | `architecture/01-tenant-scope.md` (389 lines) |
| ExportEnvelope | ✅ SPEC | `architecture/02-export-envelope.md` (548 lines) |
| Error Detection | ✅ SPEC | `architecture/03-error-detection.md` (724 lines) |
| runGuarded() | ✅ SPEC | `architecture/04-run-guarded.md` (699 lines) |
| Host Runtime | ✅ SPEC | `architecture/05-host-runtime.md` (~150 lines) |
| Ring Security | ✅ SPEC | `architecture/06-os-security-model.md` (892 lines) |

**Implementation Phase:** Phase 1 Ring Security Foundation (5 tasks READY)

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

📚 **See [INDEX.md](INDEX.md)** for complete navigation and reading order.

**Current Priority:** Phase 1 Ring Security Foundation (18-task roadmap)

1. **SENSAI.RING_SECURITY.SCHEMA** — Add ring security database schema
2. **SENSAI.RING_SECURITY.CAPABILITIES** — Implement capability assertion system
3. **SENSAI.RING_SECURITY.ESLINT** — Add compile-time ring boundary enforcement
4. **SENSAI.RING_SECURITY.RUNTIME_IMPORTS** — Add runtime dynamic import checks
5. **SENSAI.RING_SECURITY.TESTS** — Add ring security test suite

---

**Document Version:** 1.1  
**Last Updated:** 2026-01-01  
**Entry Point:** Start with [INDEX.md](INDEX.md), then [SENSAI-FINAL-ARCHITECTURE.md](SENSAI-FINAL-ARCHITECTURE.md)
