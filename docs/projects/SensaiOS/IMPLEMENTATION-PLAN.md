# SensaiOS Implementation Plan

**Project:** SensaiOS Multi-Tenant Observability Architecture  
**Status:** READY TO IMPLEMENT  
**Created:** 2025-12-28  
**Priority:** HIGH

---

## Executive Summary

After reviewing the blueprints and existing kernel infrastructure, SensaiOS can be implemented by **extending** existing systems rather than replacing them. The kernel already provides:

- ✅ **AsyncLocalStorage correlation** (`src/kernel/correlation.ts`)
- ✅ **Error fingerprinting** (`src/kernel/kernel-error-detector.ts`)
- ✅ **Kernel types** (`src/kernel/kernel-types.ts`)
- ✅ **UniversalEnvelope** (`src/observability/envelope/types.ts`)

SensaiOS adds:
- 🆕 **TenantScope** — Mandatory context for multi-tenancy
- 🆕 **ExportEnvelope** — UniversalEnvelope + required scope
- 🆕 **CanonicalError** — Structured error with recovery suggestions
- 🆕 **runGuarded()** — Kernel wrapper for all handlers

---

## Implementation Phases

### Phase 1: Core Types (Day 1-2)

**Files to Create:**
```
src/sensaios/
├── index.ts                 # Barrel exports
├── tenant-scope.ts          # TenantScope type + utilities
├── export-envelope.ts       # ExportEnvelope type + factories
└── types.ts                 # Shared type definitions
```

**Step 1.1: Create TenantScope** (`src/sensaios/tenant-scope.ts`)

```typescript
// Extend existing CorrelationContext pattern from kernel/correlation.ts
// Use AsyncLocalStorage for scope propagation (matches existing pattern)

export interface TenantScope {
  tenant: string;
  environment: 'production' | 'staging' | 'development';
  service: string;
  component: string;
  instance?: string;
  region?: string;
}

// Factory functions
export function scopeFromInteraction(interaction: Interaction): TenantScope;
export function scopeFromGuild(guildId: string, component: string): TenantScope;
export function systemScope(component: string): TenantScope;

// Context propagation (uses AsyncLocalStorage like kernel/correlation.ts)
export function withScope<T>(scope: TenantScope, fn: () => T): T;
export function getCurrentScope(): TenantScope | undefined;
export function requireScope(): TenantScope;
```

**Step 1.2: Create ExportEnvelope** (`src/sensaios/export-envelope.ts`)

```typescript
// Extends UniversalEnvelope from src/observability/envelope/types.ts
import type { UniversalEnvelope } from '../observability/envelope/types.js';
import type { TenantScope } from './tenant-scope.js';

export interface ExportEnvelope<T = unknown> extends UniversalEnvelope<T> {
  scope: TenantScope;  // REQUIRED
  export: ExportMeta;
}

// Factory functions
export function createExportEnvelope<T>(params: CreateParams<T>): ExportEnvelope<T>;
export function toExportEnvelope<T>(envelope: UniversalEnvelope<T>, scope: TenantScope): ExportEnvelope<T>;
```

---

### Phase 2: Error Subsystem (Day 3-4)

**Files to Create:**
```
src/sensaios/
├── canonical-error.ts       # CanonicalError type + conversion
├── error-routing.ts         # Severity-based routing
└── error-tracker.ts         # Deduplication + trending
```

**Step 2.1: Create CanonicalError** (`src/sensaios/canonical-error.ts`)

```typescript
// Extends existing error patterns from kernel/kernel-error-detector.ts
// Reuse: generateFingerprint(), classifySeverity()

export interface CanonicalError {
  id: string;
  timestamp: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  code: string;
  fingerprint: string;
  scope: TenantScope;
  correlationId?: string;
  recovery?: RecoverySuggestion[];
  cause?: CanonicalError;
}

// Conversion
export function toCanonicalError(error: unknown, scope: TenantScope): CanonicalError;

// Category detection (reuse from kernel-error-detector.ts)
export function detectCategory(error: Error): ErrorCategory;
export function inferSeverity(error: Error, category: ErrorCategory): ErrorSeverity;
```

**Step 2.2: Create Error Routing** (`src/sensaios/error-routing.ts`)

```typescript
// Integrates with existing output systems
// - Kernel logger (kernel/kernel-logger.ts)
// - Event bus (shared/event-bus.ts)
// - Loki backend (observability/backends/loki/)

export async function routeError(error: CanonicalError): Promise<void> {
  // Always log
  await logError(error);
  
  // Route by severity
  switch (error.severity) {
    case 'critical': await sendDiscordAlert(error); await sendPagerAlert(error); break;
    case 'high': await sendDiscordAlert(error); break;
    case 'medium': /* log + track */ break;
    case 'low': /* log only */ break;
  }
}
```

---

### Phase 3: runGuarded() Wrapper (Day 5-6)

**Files to Create:**
```
src/sensaios/
├── run-guarded.ts           # Core wrapper function
└── guarded-decorator.ts     # Optional decorator pattern
```

**Step 3.1: Create runGuarded()** (`src/sensaios/run-guarded.ts`)

```typescript
// Combines:
// - Scope propagation (tenant-scope.ts)
// - Correlation tracking (kernel/correlation.ts) 
// - Error capture (canonical-error.ts)
// - Metrics (kernel/kernel-metrics.ts)

export async function runGuarded<T>(
  handler: () => Promise<T>,
  context: GuardedContext
): Promise<T> {
  const correlationId = context.correlationId ?? generateCorrelationId();
  const startTime = performance.now();
  
  // Use existing kernel correlation for context propagation
  return startTraceAsync(
    { source: 'discord', correlationId },
    async () => {
      return withScope(context.scope, async () => {
        try {
          // Log start
          kernel.info(context.name, 'start', { scope: context.scope, correlationId });
          
          const result = await handler();
          
          // Log complete
          const durationMs = performance.now() - startTime;
          kernel.info(context.name, 'complete', { durationMs });
          
          return result;
        } catch (error) {
          // Convert + route
          const canonical = toCanonicalError(error, context.scope, { correlationId });
          await routeError(canonical);
          throw canonical;
        }
      });
    }
  );
}
```

---

### Phase 4: Integration (Day 7)

**Step 4.1: Export Barrel** (`src/sensaios/index.ts`)

```typescript
// Core types
export * from './types.js';
export * from './tenant-scope.js';
export * from './export-envelope.js';
export * from './canonical-error.js';

// Execution
export * from './run-guarded.js';

// Error handling
export * from './error-routing.js';
export * from './error-tracker.js';
```

**Step 4.2: Update Kernel Integration**

Add to `src/kernel/index.ts`:
```typescript
// SensaiOS extensions
export * from '../sensaios/index.js';
```

---

## Integration with Existing Systems

### Uses Existing Infrastructure:

| SensaiOS Component | Existing System | Integration |
|-------------------|-----------------|-------------|
| Scope propagation | `kernel/correlation.ts` | Uses `AsyncLocalStorage` pattern |
| Error fingerprinting | `kernel-error-detector.ts` | Reuses `generateFingerprint()` |
| Log output | `kernel/kernel-logger.ts` | Calls `klog()` |
| Event emission | `shared/event-bus.ts` | Emits error events |
| Loki export | `observability/backends/loki/` | Uses existing backend |
| Envelope types | `observability/envelope/types.ts` | Extends `UniversalEnvelope` |

### New Capabilities:

| Capability | Description |
|------------|-------------|
| **Tenant isolation** | All logs/errors tagged with tenant ID |
| **Recovery suggestions** | Errors include actionable fixes |
| **Severity routing** | Different outputs per severity |
| **Handler wrapping** | Automatic observability for all handlers |

---

## File Structure After Implementation

```
src/
├── kernel/                          # EXISTING (no changes needed)
│   ├── correlation.ts               # Use for context propagation
│   ├── kernel-error-detector.ts     # Reuse fingerprinting
│   └── kernel-logger.ts             # Use for logging
│
├── observability/
│   ├── envelope/
│   │   └── types.ts                 # EXISTING - ExportEnvelope extends this
│   └── backends/loki/               # EXISTING - routing target
│
├── sensaios/                        # NEW
│   ├── index.ts                     # Barrel exports
│   ├── types.ts                     # Shared types
│   ├── tenant-scope.ts              # TenantScope + propagation
│   ├── export-envelope.ts           # ExportEnvelope factories
│   ├── canonical-error.ts           # CanonicalError + conversion
│   ├── error-routing.ts             # Severity-based routing
│   ├── error-tracker.ts             # Deduplication
│   ├── run-guarded.ts               # Wrapper function
│   └── guarded-decorator.ts         # Optional decorator
│
└── shared/
    └── event-bus.ts                 # EXISTING - use for error events
```

---

## Testing Strategy

### Unit Tests (`tests/sensaios/`)

```
tests/sensaios/
├── tenant-scope.spec.ts      # Scope creation, validation, propagation
├── export-envelope.spec.ts   # Factory functions, serialization
├── canonical-error.spec.ts   # Error conversion, fingerprinting
├── error-routing.spec.ts     # Routing logic by severity
├── error-tracker.spec.ts     # Deduplication, trending
└── run-guarded.spec.ts       # Wrapper execution, timeout, error capture
```

### Integration Tests

```
tests/sensaios/
└── integration/
    ├── discord-handler.spec.ts   # runGuarded with Discord mock
    └── error-flow.spec.ts        # Error → routing → Loki
```

---

## Success Criteria

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Build passes | ✅ | `npm run build` |
| Tests pass | ✅ | `npm test` |
| No breaking changes | ✅ | Existing kernel tests still pass |
| Type safety | ✅ | No `any` types without justification |
| Scope on all envelopes | 100% | Grep for `ExportEnvelope` usage |

---

## Immediate Next Steps

1. **Create directory:** `src/sensaios/`
2. **Implement Phase 1:** `tenant-scope.ts`, `export-envelope.ts`
3. **Write tests:** Basic unit tests for scope propagation
4. **Build check:** Ensure no type errors

Ready to start? Say "implement phase 1" to begin.

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-28T23:46Z
