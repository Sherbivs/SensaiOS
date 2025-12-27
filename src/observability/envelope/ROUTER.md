# ROUTER — Observability Envelope Module

**Title:** Universal Envelope System  
**Purpose:** Unified, parseable logging/metrics/events for humans AND machines  
**Owned Globs:** `src/observability/envelope/**`  
**Last Updated (UTC):** 2025-12-27T17:00:00Z

---

## Overview

The envelope module provides a **universal format** that bridges all existing observation systems:
- Kernel Layer (`LogObservation`, `ErrorObservation`, `ServiceObservation`, `EventObservation`)
- ObservabilityHub (`ObservabilityEvent`, `ObservabilityLevel`)
- Console output (structured, parseable by Loki/grep/jq)

**Key Principle:** EXTENDS existing systems, does NOT replace them.

---

## Files

| File | Lines | Purpose |
|------|-------|---------|
| `types.ts` | ~616 | Universal envelope types + bidirectional converters |
| `factory.ts` | ~479 | Factory functions integrated with kernel correlation |
| `serializer.ts` | ~420 | 5 output formats: JSON, JSONL, Compact, Pretty, Structured |
| `console.ts` | ~290 | Drop-in console.* replacement with environment detection |
| `query.ts` | ~520 | Fluent query DSL for filtering/searching logs |
| `migrate.ts` | ~320 | Migration helper for incremental codebase migration |
| `index.ts` | ~250 | Clean module exports + kernel correlation re-exports |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     UNIVERSAL ENVELOPE LAYER                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Kernel Types ◄────┐       ┌────► ObservabilityHub                │
│   (existing)        │       │      (existing)                       │
│                     │       │                                       │
│                ┌────┴───────┴────┐                                  │
│                │ UniversalEnvelope│                                 │
│                │    (NEW)        │                                  │
│                └────────┬────────┘                                  │
│                         │                                           │
│         ┌───────────────┼───────────────┐                          │
│         ▼               ▼               ▼                          │
│   ┌─────────┐    ┌─────────────┐   ┌──────────┐                    │
│   │ Factory │    │ Serializer  │   │  Query   │                    │
│   │(create) │    │(json/pretty)│   │(filter)  │                    │
│   └─────────┘    └─────────────┘   └──────────┘                    │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────┐      │
│   │              Kernel Correlation System                   │      │
│   │    (REUSED: generateCorrelationId, withCorrelation)     │      │
│   └─────────────────────────────────────────────────────────┘      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Usage Patterns

### Factory Functions

```typescript
import { 
  createLog, debug, info, warn, error, fatal,
  createMetric, createAlert, createEvent, createTrace, createOutput
} from './observability/envelope/index.js';

// Full control
const env = createLog('info', 'database', 'query', 'Query executed', { sql, duration });

// Shorthand (uses 'app' component)
debug('Starting server');
info('Server ready');
warn('High memory usage');
error('Connection failed');
fatal('System crash');
```

### Console Bridge

```typescript
import { log, scopedLogger, loggers } from './observability/envelope/index.js';

// Direct calls
log.info('database', 'connect', 'Connected to PostgreSQL');

// Pre-configured scoped loggers
const dbLog = loggers.database;
dbLog.info('query', 'Query executed', { sql });

// Custom scoped logger
const myLog = scopedLogger('my-service');
myLog.error('init', 'Failed to start', { error });
```

### Serialization

```typescript
import { serialize, serializers } from './observability/envelope/index.js';

// Dynamic format
const output = serialize(envelope, 'jsonl');  // For Loki
const output = serialize(envelope, 'pretty'); // For developers
const output = serialize(envelope, 'structured'); // For grep

// Pre-configured serializers
serializers.json.serialize(envelope);      // Indented JSON
serializers.jsonl.serialize(envelope);     // Single-line JSON
serializers.compact.serialize(envelope);   // Minimal format
serializers.pretty.serialize(envelope);    // Colored console
serializers.structured.serialize(envelope); // key=value format
```

### Query DSL

```typescript
import { query, errors, recent, search, trace } from './observability/envelope/index.js';

// Fluent API
const results = query(logs)
  .level('ERROR', 'FATAL')
  .component('database')
  .since('1h')
  .limit(100)
  .toArray();

// Quick filters
const recentErrors = errors(logs);
const last5Minutes = recent(logs, '5m');
const searchResults = search(logs, 'timeout');
const correlatedLogs = trace(logs, 'abc123');

// Aggregation
const errorCount = query(logs).hasError().count();
const byComponent = query(logs).groupBy('source.component');
const uniqueLevels = query(logs).distinct('level');
```

---

## CLI Tool

The `logq` CLI tool queries JSONL logs from files or stdin:

```bash
# Query from file
npm run logq -- -f logs.jsonl --level error --since 1h

# Pipe from stdin
cat logs.jsonl | npm run logq -- --component database

# Multiple filters
npm run logq -- -f logs.jsonl --level error --component database --search "timeout"

# Aggregation
npm run logq -- -f logs.jsonl --count
npm run logq -- -f logs.jsonl --group-by source.component
npm run logq -- -f logs.jsonl --distinct level

# Output formats
npm run logq -- -f logs.jsonl --format pretty
npm run logq -- -f logs.jsonl --format json
npm run logq -- -f logs.jsonl --format compact
```

---

## Converters

### From Kernel Types

```typescript
import { 
  fromLogObservation, 
  fromErrorObservation,
  fromServiceObservation,
  fromEventObservation 
} from './observability/envelope/index.js';

// Convert existing kernel observations
const env = fromLogObservation(kernelLog);
const env = fromErrorObservation(kernelError);
```

### To/From ObservabilityHub

```typescript
import { toObservabilityEvent, fromObservabilityEvent } from './observability/envelope/index.js';

// Convert to Hub format (for Loki transport)
const hubEvent = toObservabilityEvent(envelope);

// Convert from Hub format
const envelope = fromObservabilityEvent(hubEvent);
```

### To Kernel Types

```typescript
import { toLogObservation } from './observability/envelope/index.js';

// Convert envelope back to kernel format
const kernelLog = toLogObservation(envelope);
```

---

## Testing

37 comprehensive tests covering:
- Factory functions (6 tests)
- Serializer formats (7 tests)
- Query DSL (13 tests)
- Quick filters (2 tests)
- Filter combinators (3 tests)
- Time parsing (2 tests)
- Console bridge (4 tests)

Run tests:
```bash
npx vitest run tests/observability/envelope.spec.ts
```

---

## Migration Tools

### Scanner CLI

Scan codebase for console.* calls:

```bash
# Show all files with console calls
npm run migrate:scan

# Top 10 offenders
npm run migrate:scan -- --top 10

# Specific directory
npm run migrate:scan -- -f src/bot

# Generate import statements for migration
npm run migrate:scan -- --generate --top 5
```

### Drop-in Console Migration

For incremental migration, add to any file:

```typescript
// Add this import at the top
import { createMigrationConsole } from '../../observability/envelope/migrate.js';
const console = createMigrationConsole({ component: 'my-component' });

// Now all console.log/warn/error calls output structured envelopes
console.log('Query executed', { sql, duration });
// → {"id":"...","kind":"log","level":"info","message":"Query executed",...}
```

### Pre-configured Migration Consoles

```typescript
import { migrationConsoles } from '../../observability/envelope/migrate.js';

// Use pre-configured consoles
const console = migrationConsoles.database;  // component: 'database'
const console = migrationConsoles.security;  // component: 'security'
const console = migrationConsoles.bot;       // component: 'bot'
const console = migrationConsoles.cli;       // component: 'cli'
```

---

## Integration Points

| System | Integration Method |
|--------|-------------------|
| Kernel | `fromLogObservation()`, `toLogObservation()`, kernel correlation reuse |
| ObservabilityHub | `toObservabilityEvent()`, `fromObservabilityEvent()` |
| Loki | JSONL serialization, structured labels |
| grep/jq | Structured format (`key=value`) or JSON |
| Testing | Buffer mode, `peekBuffer()`, `flushBuffer()` |

---

## Notes

- **No new dependencies** — Uses `node:crypto.randomUUID()` like kernel
- **Environment-aware** — Auto-detects TTY vs production for output format
- **Type-safe** — Full TypeScript generics for payload data
- **Correlation propagation** — Reuses kernel's AsyncLocalStorage system
- **Backpressure-ready** — Query DSL supports streaming patterns

---

**Created:** 2025-12-27  
**Author:** Observability Team  
**Related:** `src/kernel/ROUTER.md`, `src/observability/ROUTER.md`
