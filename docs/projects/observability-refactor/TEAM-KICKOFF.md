# 🔭 Observability Team Kickoff — Console, CLI & Logs Modernization

**Date:** 2025-12-27  
**Sprint:** Observability Renaissance  
**Goal:** Universal, parseable, ergonomic data for humans AND machines

---

## ✅ PHASE 1 COMPLETE: Universal Envelope Foundation

### What We Built (EXTENDS, Doesn't Duplicate!)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    UNIFIED ENVELOPE LAYER                           │
│        src/observability/envelope/ (EXTENDS existing systems)       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │  Kernel Layer   │◄──►│ Universal        │◄──►│ Observability │  │
│  │  (existing)     │    │ Envelope         │    │ Hub (existing)│  │
│  │                 │    │ (NEW)            │    │               │  │
│  │ LogObservation  │    │ UniversalEnvelope│    │ ObservabilityE│  │
│  │ ErrorObservation│    │ LogEnvelope      │    │ vent          │  │
│  │ ServiceObserv.  │    │ MetricEnvelope   │    │               │  │
│  │ EventObservation│    │ AlertEnvelope    │    │               │  │
│  └────────┬────────┘    └────────┬─────────┘    └───────┬───────┘  │
│           │                      │                      │          │
│           │  fromLogObservation  │  toObservabilityEvent│          │
│           │  fromErrorObserv...  │  toLogObservation    │          │
│           │  ◄─── CONVERTERS ───►                       │          │
│           │                      │                      │          │
├───────────┴──────────────────────┴──────────────────────┴──────────┤
│                                                                     │
│                ┌─────────────────────────────────┐                  │
│                │   Kernel Correlation System    │                  │
│                │   (EXISTING - REUSED!)         │                  │
│                │                                 │                  │
│                │ • generateCorrelationId()       │                  │
│                │ • getCurrentCorrelationId()     │                  │
│                │ • getParentCorrelationId()      │                  │
│                │ • withCorrelation()             │                  │
│                │ • AsyncLocalStorage propagation │                  │
│                └─────────────────────────────────┘                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/observability/envelope/types.ts` | ~616 | Universal envelope types + converters |
| `src/observability/envelope/factory.ts` | ~479 | Factory functions using kernel correlation |
| `src/observability/envelope/serializer.ts` | ~420 | JSON/JSONL/Compact/Pretty/Structured output |
| `src/observability/envelope/console.ts` | ~290 | Drop-in console.* replacement |
| `src/observability/envelope/index.ts` | ~170 | Clean module exports + kernel re-exports |

### Key Design Decisions

1. **EXTENDS Kernel** — Uses `kernel/correlation.ts` for correlation IDs instead of reinventing
2. **EXTENDS ObservabilityHub** — Converters to/from `ObservabilityEvent` format  
3. **EXTENDS Kernel Types** — Converters from `LogObservation`, `ErrorObservation`
4. **No New Dependencies** — Uses `node:crypto.randomUUID()` like kernel does
5. **Environment-Aware** — Auto-detects JSONL for production, pretty for TTY

### Usage Example

```typescript
// OLD WAY (fragmented)
console.log('Query executed', { sql, duration });

// NEW WAY (structured, parseable, correlatable)
import { log, loggers } from './observability/envelope/index.js';

// Option 1: Direct call
log.info('database', 'query', 'Query executed', { sql, duration });

// Option 2: Scoped logger
const dbLog = loggers.database;
dbLog.info('query', 'Query executed', { sql, duration });

// Output adapts to environment:
// Dev TTY:   [14:32:05] INFO  database.query: Query executed {sql: "SELECT..."} (abc123)
// Prod/Loki: {"id":"...","timestamp":"...","kind":"log","level":"info",...}
```

---

## 👥 Team Roster

| Role | Specialist | Focus Area |
|------|------------|------------|
| **Tech Lead** | Alex Chen | Architecture, integration patterns |
| **CLI Engineer** | Jordan Rivera | Command-line interfaces, output formatting |
| **Log Systems** | Sam Patel | Structured logging, Loki, database persistence |
| **Data Engineer** | Taylor Kim | Schema design, query patterns, analytics |
| **DevEx Lead** | Casey Morgan | Developer experience, debugging tools |

---

## 📊 Current State Assessment (Updated)

### Migration Scanner Results (Updated)

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                           MIGRATION SUMMARY                                    ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  Total console.* calls:    1083                                               ║
║  Files with calls:           82                                               ║
║  Already migrated:            5 (  6.1%)                                      ║
║  Remaining to migrate:       77                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

**Migrated Files:**
| File | Calls | Status |
|------|-------|--------|
| `src/observability/hub/observability-hub.ts` | 20 | ✅ Migrated |
| `src/shared/event-bus.ts` | 9 | ✅ Migrated |
| `src/observability/backends/loki/loki-backend.ts` | 4 | ✅ Migrated |
| `src/observability/backends/loki/loki-flush-worker.ts` | 6 | ✅ Migrated |
| `src/observability/backends/loki/loki-health-worker.ts` | 5 | ✅ Migrated |

**Top Offenders:**
| Calls | File | Component |
|-------|------|-----------|
| 120 | scripts/db-admin.ts | database |
| 103 | src/cli/ai-log-query.ts | cli |
| 56 | scripts/ops/bootstrap-onpremise-experiment.ts | ops |
| 51 | scripts/security/migrate-security-state.ts | security |
| 45 | scripts/security/rollback-security-migration.ts | security |

### What We Found

**Good Foundations (Keep):**
- ✅ Kernel observation layer (`src/kernel/`) — excellent architecture
- ✅ Loki integration working (`src/observability/`)
- ✅ DB-first logging concept (`src/shared/logger.ts`)
- ✅ ConsoleRenderer visual system (`src/shared/logging/console-renderer.ts`)
- ✅ Output formatter for scripts (`src/utils/output-formatter.ts`)

**Fragmentation Issues (Being Fixed):**
- ⚠️ 82 files with 1,083 raw `console.*` calls — **Migration tools ready**
- ⚠️ Two logger files — Will consolidate via envelope adapters
- ⚠️ Inconsistent log schemas — **Universal envelope ready**
- ⚠️ No universal CLI output standard — **CLI tools created**
- ⚠️ Stats display mixed with logging — Separate via envelope kinds

**Technical Debt (Addressable):**
- Mixed levels: → Standardized to `debug`, `info`, `warn`, `error`, `fatal`
- No standard envelope: → **UniversalEnvelope created**
- Limited query capability: → **Query DSL + logq CLI created**
- Console output not structured: → **5 output formats available**

---

## 🎯 Target Architecture

### The Universal Log Envelope

Every log, metric, and output follows ONE schema:

```typescript
interface UniversalEnvelope<T = unknown> {
  // === IDENTITY ===
  id: string;                    // Unique ID (ULID preferred)
  timestamp: string;             // ISO-8601 with timezone
  
  // === CLASSIFICATION ===
  kind: 'log' | 'metric' | 'event' | 'trace' | 'alert';
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  
  // === SOURCE ===
  source: {
    service: string;             // infinity-gauntlet, security-bot, etc.
    component: string;           // battle-engine, homestead, etc.
    operation: string;           // spawn, catch, heal, etc.
    version?: string;            // Service version
  };
  
  // === CORRELATION ===
  correlation: {
    id: string;                  // Request/operation correlation
    parent?: string;             // Parent correlation (for traces)
    session?: string;            // User session
    trace?: string;              // Distributed trace ID
  };
  
  // === CONTEXT ===
  context?: {
    userId?: string;
    guildId?: string;
    channelId?: string;
    environment?: string;
    [key: string]: unknown;
  };
  
  // === PAYLOAD ===
  message: string;               // Human-readable message
  data?: T;                      // Structured data (type-safe)
  
  // === METRICS (optional) ===
  metrics?: {
    durationMs?: number;
    latencyMs?: number;
    count?: number;
    [key: string]: number | undefined;
  };
  
  // === ERROR (optional) ===
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
    fingerprint?: string;
  };
}
```

### CLI Output Standard

All CLI tools output in consistent format:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ COMMAND: db:status                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ Status      │ ● CONNECTED                                                  │
│ Database    │ infinity_gauntlet_db                                         │
│ Latency     │ 12ms                                                         │
│ Tables      │ 55                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Machine mode** (--json flag):
```json
{
  "command": "db:status",
  "success": true,
  "data": {
    "status": "connected",
    "database": "infinity_gauntlet_db",
    "latencyMs": 12,
    "tableCount": 55
  },
  "timestamp": "2025-12-27T14:30:00.000Z"
}
```

---

## 🏗️ Implementation Phases

### ✅ Phase 1: Universal Envelope (COMPLETE)
- [x] Define TypeScript types for UniversalEnvelope
- [x] Create envelope factory functions (integrated with kernel correlation)
- [x] Build envelope serializer (JSON, JSONL, Compact, Pretty, Structured)
- [x] Add converters to/from existing kernel types

### ✅ Phase 2: Console Bridge (COMPLETE)
- [x] Create drop-in console.* replacement (`log.debug/info/warn/error/fatal`)
- [x] Add scoped loggers for components (`loggers.database`, `loggers.bot`, etc.)
- [x] Environment-aware output (pretty for TTY, JSONL for production)
- [x] Buffer mode for testing

### ✅ Phase 3: Query DSL & CLI (COMPLETE)
- [x] Build fluent query builder for filtering logs
- [x] Add quick filters: `errors()`, `recent()`, `search()`, `trace()`
- [x] Create CLI tool: `npm run logq -- --level error --since 1h`
- [x] Support piping (stdin/stdout) and multiple output formats
- [x] Comprehensive test suite (37/37 tests passing)

### ✅ Phase 4: Migration Tools (COMPLETE)
- [x] Create migration scanner CLI (`npm run migrate:scan`)
- [x] Create migration console helper for drop-in replacement
- [x] **5 files migrated** (44 console calls converted)
- [x] Pattern established: `scopedLogger(component)` + `log.level(operation, message, data)`

### 🔄 Phase 5: Full Migration (IN PROGRESS)
- [x] `src/observability/hub/observability-hub.ts` (20 calls)
- [x] `src/shared/event-bus.ts` (9 calls) — Circular dependency resolved!
- [x] `src/observability/backends/loki/loki-backend.ts` (4 calls)
- [x] `src/observability/backends/loki/loki-flush-worker.ts` (6 calls)
- [x] `src/observability/backends/loki/loki-health-worker.ts` (5 calls)
- [ ] Remaining high-impact files (~77 files, ~1039 calls)

### 📋 Phase 6: Advanced Features (Future)
- [ ] Real-time log streaming
- [ ] Grafana dashboard updates
- [ ] Log aggregation analytics
- [ ] Export to CSV/JSON/NDJSON

---

## 📁 Files Created This Session

```
src/observability/envelope/          # ~2,500 lines total
├── types.ts         (~616 lines)    # Universal envelope types + converters
├── factory.ts       (~479 lines)    # Factory functions, kernel integration
├── serializer.ts    (~420 lines)    # 5 output formats
├── console.ts       (~290 lines)    # Drop-in console.* replacement
├── query.ts         (~520 lines)    # Query DSL with fluent API
├── migrate.ts       (~320 lines)    # Migration helpers for incremental adoption
└── index.ts         (~250 lines)    # Clean module exports

scripts/
├── logq.ts          (~290 lines)    # CLI log query tool
└── migrate-console.ts (~220 lines)  # Migration scanner CLI

tests/observability/
└── envelope.spec.ts (~430 lines)    # Comprehensive test suite (37 passing)
```

### CLI Tool Usage

```bash
# Query logs from file
npm run logq -- -f logs.jsonl --level error --since 1h

# Pipe from stdin
cat logs.jsonl | npm run logq -- --component database --format pretty

# Search and count
npm run logq -- -f logs.jsonl --search "timeout" --count

# Trace correlation
npm run logq -- -f logs.jsonl --trace abc123 --format json
```

---

## 🎬 First Deliverable: Universal Envelope Types

Let's start coding! First deliverable is the type definitions.

**Status:** ✅ COMPLETE — All phases 1-3 delivered with 37/37 tests passing!
