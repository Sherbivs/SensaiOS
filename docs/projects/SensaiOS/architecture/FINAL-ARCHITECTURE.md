# SensaiOS Final Architecture

**Version:** 1.0  
**Status:** SPECIFICATION COMPLETE  
**Created:** 2025-12-28  
**Owner:** DRIPTVDD

---

## Executive Summary

SensaiOS is a **multi-tenant observability-first operating layer** for the Infinity Gauntlet Pokemon adventure. It extends the existing kernel architecture with:

1. **Mandatory Tenant Scoping** — Every envelope, log, and error has a TenantScope
2. **Guarded Execution** — All handlers run through `runGuarded()` for automatic observability
3. **First-Class Error Detection** — Errors are structured data with fingerprinting and routing
4. **Export-Ready Envelopes** — Data flows seamlessly to consoles, databases, and external tools

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              SensaiOS Architecture                                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │                            APPLICATION LAYER                                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │  │
│  │  │   Discord   │  │   Battle    │  │  Homestead  │  │   Workers/Jobs      │   │  │
│  │  │  Commands   │  │   Engine    │  │   System    │  │   (Cache, Data, etc)│   │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘   │  │
│  └─────────┼────────────────┼────────────────┼───────────────────┼───────────────┘  │
│            │                │                │                   │                  │
│            └────────────────┴────────────────┴───────────────────┘                  │
│                                      │                                              │
│  ┌───────────────────────────────────▼───────────────────────────────────────────┐  │
│  │                           SENSAIOS KERNEL LAYER                                │  │
│  │  ╔═══════════════════════════════════════════════════════════════════════════╗  │
│  │  ║                         runGuarded() Wrapper                              ║  │
│  │  ║  • Correlation ID injection         • Timeout enforcement                 ║  │
│  │  ║  • Tenant scope propagation         • Metrics collection                  ║  │
│  │  ║  • Automatic error capture          • Start/complete logging              ║  │
│  │  ╚═══════════════════════════════════════════════════════════════════════════╝  │
│  │                                      │                                          │
│  │  ┌─────────────────────┬─────────────┴─────────────┬─────────────────────────┐  │
│  │  │                     │                           │                         │  │
│  │  ▼                     ▼                           ▼                         │  │
│  │  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐   │  │
│  │  │ TenantScope │  │ ExportEnvelope  │  │     Error Detection Subsystem   │   │  │
│  │  │             │  │                 │  │                                 │   │  │
│  │  │ • tenant    │  │ • scope (req)   │  │ • CanonicalError shape          │   │  │
│  │  │ • env       │  │ • export meta   │  │ • Category detection            │   │  │
│  │  │ • service   │  │ • serialization │  │ • Severity inference            │   │  │
│  │  │ • component │  │ • batching      │  │ • Fingerprint deduplication     │   │  │
│  │  │             │  │                 │  │ • Recovery suggestions          │   │  │
│  │  │             │  │                 │  │ • Severity-based routing        │   │  │
│  │  └─────────────┘  └─────────────────┘  └─────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                              │
│  ┌───────────────────────────────────▼───────────────────────────────────────────┐  │
│  │                           OUTPUT PIPELINE                                      │  │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌─────────┐  ┌────────┐  │  │
│  │  │ Console │  │  Files  │  │ Database │  │  Loki  │  │ Discord │  │Webhooks│  │  │
│  │  │ (stdout)│  │  (.log) │  │ (Prisma) │  │(Grafana│  │ (Alerts)│  │        │  │  │
│  │  └─────────┘  └─────────┘  └──────────┘  └────────┘  └─────────┘  └────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. TenantScope

**Purpose:** Mandatory context for multi-tenant isolation.

```typescript
interface TenantScope {
  tenant: string;      // Guild ID, user ID, or "system"
  environment: 'production' | 'staging' | 'development';
  service: string;     // e.g., "infinity-gauntlet"
  component: string;   // e.g., "battle-engine"
  instance?: string;   // Worker instance ID
  region?: string;     // Deployment region
}
```

**Key Features:**
- Required on every envelope
- Propagates via AsyncLocalStorage
- Enables per-tenant log queries
- Supports environment-based routing

**Reference:** [01-tenant-scope.md](./01-tenant-scope.md)

---

### 2. ExportEnvelope

**Purpose:** Extended envelope with mandatory scope for export.

```typescript
interface ExportEnvelope<T = unknown> extends UniversalEnvelope<T> {
  scope: TenantScope;  // REQUIRED (not optional like context)
  export: {
    format: 'json' | 'jsonl' | 'pretty' | 'csv' | 'logfmt';
    destination: 'console' | 'file' | 'database' | 'loki' | 'discord' | 'webhook';
    exportedAt: string;
    batchId?: string;
    sequence?: number;
    ttlSeconds?: number;
  };
}
```

**Key Features:**
- Extends existing UniversalEnvelope
- Scope is mandatory (not optional)
- Export metadata for serialization
- Supports batching for efficiency

**Reference:** [02-export-envelope.md](./02-export-envelope.md)

---

### 3. Error Detection Subsystem

**Purpose:** First-class error handling with structure and routing.

```typescript
interface CanonicalError {
  id: string;
  timestamp: string;
  category: 'validation' | 'database' | 'network' | 'auth' | 'game' | 'discord' | 'worker' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  code: string;
  fingerprint: string;
  scope: TenantScope;
  correlationId?: string;
  name: string;
  stack?: string;
  context?: Record<string, unknown>;
  recovery?: RecoverySuggestion[];
  cause?: CanonicalError;
}
```

**Key Features:**
- Automatic category detection
- Severity-based routing
- Fingerprinting for deduplication
- Recovery suggestions
- Error tracking with trending

**Reference:** [03-error-detection.md](./03-error-detection.md)

---

### 4. runGuarded() Wrapper

**Purpose:** Kernel wrapper for all handler invocations.

```typescript
async function runGuarded<T>(
  handler: () => Promise<T>,
  context: GuardedContext
): Promise<T>;

interface GuardedContext {
  name: string;           // Handler name for logs
  scope: TenantScope;     // Required scope
  correlationId?: string; // Auto-generated if not provided
  parentCorrelationId?: string;
  metadata?: Record<string, unknown>;
  timeoutMs?: number;     // Default: 30000
  rethrow?: boolean;      // Default: true
  onError?: (error: CanonicalError) => void;
}
```

**Key Features:**
- Automatic correlation ID injection
- Scope propagation via context
- Timing and metrics collection
- Error capture and routing
- Timeout enforcement

**Reference:** [04-run-guarded.md](./04-run-guarded.md)

---

## Data Flow

### Happy Path

```
1. Request arrives (Discord interaction, job trigger)
                    │
2. runGuarded() wraps handler
   │  • Generate correlation ID
   │  • Set scope in context
   │  • Log start event
                    │
3. Handler executes
   │  • Access scope via getCurrentScope()
   │  • Access correlation via getCorrelationId()
   │  • Nested calls maintain context
                    │
4. Handler completes
   │  • Log complete event
   │  • Record duration metric
                    │
5. Result returned to caller
```

### Error Path

```
1. Handler throws error
                    │
2. runGuarded() catches
   │  • Convert to CanonicalError
   │  • Detect category
   │  • Infer severity
   │  • Generate fingerprint
                    │
3. Route error based on severity
   │  • LOW: Log only
   │  • MEDIUM: Log + track
   │  • HIGH: Log + track + Discord alert
   │  • CRITICAL: Log + track + Discord + pager
                    │
4. Log failure event
   │  • Include error ID
   │  • Include duration
                    │
5. Rethrow CanonicalError (if configured)
```

---

## Integration Points

### With Existing UniversalEnvelope

ExportEnvelope extends UniversalEnvelope — existing code continues to work:

```typescript
// Existing code (still works)
const envelope: UniversalEnvelope = createEnvelope({ ... });

// New code (with scope)
const exportEnvelope: ExportEnvelope = createExportEnvelope({
  scope: { tenant: 'guild-123', environment: 'production', ... },
  ...
});

// Convert existing to export
const exported = toExportEnvelope(envelope, scope);
```

### With Kernel Logger

runGuarded() automatically integrates with Kernel logging:

```typescript
// Inside runGuarded, these are scoped automatically
Kernel.log.info('operation', { data });  // Includes scope + correlationId
Kernel.log.error('failed', { error });   // Routes through error subsystem
```

### With Event Bus

Errors can be emitted as events for async processing:

```typescript
eventBus.emit('error.captured', {
  correlationId: canonical.correlationId,
  payload: canonical,
});
```

### With Loki/Grafana

ExportEnvelopes serialize to Loki format:

```typescript
const lokiPayload = toLoki(envelopes);
// { streams: [{ stream: { tenant, env, ... }, values: [...] }] }
```

---

## Multi-Tenancy Model

### Tenant Identifiers

| Context | Tenant Value | Example |
|---------|--------------|---------|
| Guild operation | Guild ID | `"123456789012345678"` |
| User homestead | `user:{userId}` | `"user:563220840708177927"` |
| System operation | `"system"` | `"system"` |
| Worker job | Service name | `"cache-worker"` |

### Tenant Isolation

1. **Query Isolation:** All Loki/DB queries filter by tenant
2. **Log Separation:** Different tenants don't see each other's logs
3. **Alert Routing:** Alerts route to tenant-specific channels
4. **Metrics Tagging:** All metrics tagged with tenant

---

## Error Routing Matrix

| Severity | Console | File | Database | Loki | Discord | Pager |
|----------|---------|------|----------|------|---------|-------|
| LOW      | ✅      | ✅   | ❌       | ✅   | ❌      | ❌    |
| MEDIUM   | ✅      | ✅   | ✅       | ✅   | ❌      | ❌    |
| HIGH     | ✅      | ✅   | ✅       | ✅   | ✅      | ❌    |
| CRITICAL | ✅      | ✅   | ✅       | ✅   | ✅      | ✅    |

---

## Implementation Checklist

### Phase 1: Core Types (Week 1)

- [ ] Implement `TenantScope` type and utilities
  - [ ] Type definition
  - [ ] Validation functions
  - [ ] AsyncLocalStorage integration
  - [ ] Discord context mappers
  - [ ] Unit tests

- [ ] Implement `ExportEnvelope` type and factories
  - [ ] Type definition extending UniversalEnvelope
  - [ ] Factory functions
  - [ ] Serializers (JSON, JSONL, pretty, Loki)
  - [ ] Batching utility
  - [ ] Unit tests

### Phase 2: Error Subsystem (Week 2)

- [ ] Implement `CanonicalError` and conversion
  - [ ] Type definition
  - [ ] `toCanonicalError()` converter
  - [ ] Category detection
  - [ ] Severity inference
  - [ ] Fingerprinting
  - [ ] Unit tests

- [ ] Implement error routing
  - [ ] `routeError()` function
  - [ ] Severity-based destination selection
  - [ ] Error tracker with deduplication
  - [ ] Integration tests

### Phase 3: runGuarded() (Week 3)

- [ ] Implement `runGuarded()` wrapper
  - [ ] Core function with context propagation
  - [ ] Timeout enforcement
  - [ ] Metrics collection
  - [ ] `runGuardedSafe()` variant
  - [ ] Decorator pattern (optional)
  - [ ] Unit tests

- [ ] Kernel integration
  - [ ] Connect to Kernel.log
  - [ ] Connect to Kernel.metrics
  - [ ] Event bus integration
  - [ ] Integration tests

### Phase 4: Migration (Week 4)

- [ ] Migrate Discord command handlers
  - [ ] Add `runGuarded()` to all commands
  - [ ] Add proper scoping
  - [ ] Update error handling

- [ ] Migrate workers
  - [ ] Add `runGuarded()` to all jobs
  - [ ] Add system scoping
  - [ ] Update error handling

- [ ] Documentation
  - [ ] Usage guide
  - [ ] Migration guide
  - [ ] API reference

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Handler coverage | 100% | All handlers use `runGuarded()` |
| Error capture rate | 100% | All errors become CanonicalError |
| Scope presence | 100% | All envelopes have TenantScope |
| Deduplication rate | >50% | Repeated errors grouped by fingerprint |
| Alert latency | <1s | Time from error to Discord alert |
| Query isolation | 100% | Tenant data never leaks |

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Performance overhead | MEDIUM | Async batching, sampling for debug logs |
| Breaking changes | HIGH | Gradual migration, backward compatible |
| Circular dependencies | MEDIUM | Lazy loading, careful import order |
| Memory leaks | LOW | Bounded queues, TTL on tracked errors |
| PII in logs | HIGH | Scrubbing pipeline before external output |

---

## File Structure

```
src/sensaios/
├── index.ts                  # Barrel exports
├── tenant-scope.ts           # TenantScope type and utilities
├── export-envelope.ts        # ExportEnvelope type and factories
├── error-detection.ts        # CanonicalError and routing
├── run-guarded.ts            # runGuarded() wrapper
├── serializers/
│   ├── json.ts               # JSON serializer
│   ├── jsonl.ts              # JSONL serializer
│   ├── pretty.ts             # Pretty print serializer
│   └── loki.ts               # Loki format serializer
├── outputs/
│   ├── console.ts            # Console output
│   ├── file.ts               # File output
│   ├── database.ts           # Prisma output
│   ├── loki.ts               # Loki output
│   └── discord.ts            # Discord alert output
└── testing/
    ├── mock-scope.ts         # Test utilities
    └── mock-guarded.ts       # Test utilities
```

---

## Appendix: Quick Reference

### Create Scoped Log

```typescript
import { createTenantLogger, scopeFromInteraction } from './sensaios';

const scope = scopeFromInteraction(interaction);
const log = createTenantLogger(scope);

log.info('operation', 'Message', { data });
```

### Wrap Handler

```typescript
import { runGuarded, scopeFromInteraction } from './sensaios';

await runGuarded(
  () => myHandler(),
  { name: 'my.handler', scope: scopeFromInteraction(interaction) }
);
```

### Convert Error

```typescript
import { toCanonicalError, systemScope } from './sensaios';

const canonical = toCanonicalError(error, systemScope('my-component'));
```

### Query by Tenant (Loki)

```
{tenant="123456789012345678", level="error"}
```

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-28  
**Status:** SPECIFICATION COMPLETE — Ready for Implementation
