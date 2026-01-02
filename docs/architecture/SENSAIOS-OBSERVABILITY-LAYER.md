# SensaiOS — Observability Layer Architecture

**Document Type:** Architecture Diagram  
**Status:** Current  
**Version:** 1.0.0  
**Last Updated:** 2025-12-30  
**Related:** [SENSAIOS-SYSTEM-OVERVIEW.md](./SENSAIOS-SYSTEM-OVERVIEW.md), [SENSAIOS-KERNEL-DETAIL.md](./SENSAIOS-KERNEL-DETAIL.md)

---

## Overview

The **Observability Layer** is **user-space monitoring systems** that load POST-OS (after SensaiOS initializes). It's a peer to the Application Layer — both are Layer 3 user-space systems consuming SensaiOS primitives.

**Architectural Position:**
- **Layer 3** (User Space) — Loads AFTER SensaiOS (Layer 2) is initialized
- Sits ABOVE SensaiOS (Operating System)
- Parallel to Application Layer (both user-space, neither is parent/child)
- Receives events from Kernel via SensaiOS context injection

**Key Principles:**
- **Gateway Pattern**: Central hub that fans out to multiple backends
- **Standardized Format**: All backends receive events in `ObservabilityEvent` format
- **Isolation**: Hub errors never propagate to kernel or application
- **Pluggable Backends**: Easy to add/remove backends without affecting system
- **Universal Envelope**: Superset format that can convert to/from any existing type

---

## Architecture Diagram

**Position in 3-Layer Model:** Layer 3B (User Space) — Monitoring backends that load POST-OS

```
┌───────────────────────────────────────────────────────────────┐
│        LAYER 3B: OBSERVABILITY LAYER (User Space)            │
│          Monitoring backends loading POST-OS                  │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                │ Access SensaiOS primitives
                                ↓
                    ┌───────────────────────┐
                    │  OBSERVABILITY HUB    │ ◀── Also accepts
                    │  (Central Router)     │     direct ingestion
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │ ObservabilityEvent    │
                    │ (Standardized Format) │
                    └───────────┬───────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
        ┌───────▼──────┐  ┌────▼────┐  ┌──────▼──────┐
        │ Loki Backend │  │ Future  │  │   Future    │
        │              │  │ Backend │  │   Backend   │
        └───────┬──────┘  └─────────┘  └─────────────┘
                │
    ┌───────────┼──────────┐
    │           │          │
┌───▼──┐  ┌────▼────┐  ┌──▼──┐
│Queue │  │Circuit  │  │HTTP │
│      │  │Breaker  │  │Trans│
└───┬──┘  └────┬────┘  └──┬──┘
    │          │          │
┌───▼──────────▼──────────▼───┐
│  Loki Workers (flush,health)│
└─────────────┬───────────────┘
              │
      ┌───────▼──────┐
      │ Loki Service │
      │ (External)   │
      └──────────────┘
                ▲
                │ Observations flow from Kernel via Hooks
    ┌───────────┴────────────────────────────────────────┐
    │  LAYER 2: SENSAIOS (OS) - Context injection        │
    └───────────┬────────────────────────────────────────┘
                │
    ┌───────────▼────────────────────────────────────────┐
    │  LAYER 1: KERNEL (Mainframe Substrate)            │
    │  Metrics, DB control, cross-layer parsing → DB     │
    │  • Ring buffers: 10,000 logs | 1,000 errors | 500  │
    │  • Hooks provide bridge from ALL layers            │
    └────────────────────────────────────────────────────┘

ENVELOPE SYSTEM (Conversion Layer)
┌────────────────────────────────────────┐
│  UniversalEnvelope (Superset Format)   │
│  ┌──────────────────────────────────┐  │
│  │ • LogObservation (kernel)        │  │
│  │ • ObservabilityEvent (hub)       │  │
│  │ • LogEntry (database)            │  │
│  │ → All convertible to/from        │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Factory → Create envelopes           │
│  Serializer → Output formats          │
│  Query → Filter & aggregate           │
└────────────────────────────────────────┘
```

---

## Components

### 1. Observability Hub (`observability-hub.ts`)

**Purpose**: Central intermediary between kernel and backends.

**Responsibilities:**
- Subscribe to Event Bus with `**` pattern (all events)
- Accept direct ingestion via `ingest()` method
- Convert events to standardized `ObservabilityEvent` format
- Fan out to all registered backends
- Isolate backend errors from main application

**Key Methods:**
```typescript
class ObservabilityHub {
  // Lifecycle
  async initialize(): Promise<void>;
  async start(): Promise<void>;
  async stop(): Promise<void>;
  
  // Backend Management
  registerBackend(backend: IObservabilityBackend): void;
  unregisterBackend(name: string): boolean;
  
  // Direct Ingestion
  ingest(event: ObservabilityEvent): void;
  
  // Status
  getStatus(): HubStatus;
  listBackends(): BackendInfo[];
}
```

**Ingestion Paths:**
1. **Event Bus Subscription**: Hub subscribes to `**` pattern
2. **Direct Ingestion**: Sources call `hub.ingest()` (e.g., Security Bot)

**Error Isolation:**
- Hub errors never propagate to Event Bus
- Each backend handles its own errors
- Failed backends don't affect other backends

---

### 2. Backend Interface (`observability-types.ts`)

**Purpose**: Contract for all observability backends.

```typescript
interface IObservabilityBackend {
  /** Unique backend name */
  readonly name: string;
  
  /** Whether backend is enabled */
  enabled: boolean;
  
  /** Receive event (fire-and-forget, MUST NOT throw) */
  receive(event: ObservabilityEvent): void;
  
  /** Start backend infrastructure */
  start(): Promise<void>;
  
  /** Stop backend gracefully */
  stop(): Promise<void>;
  
  /** Get backend health status */
  getStatus(): BackendStatus;
}
```

**ObservabilityEvent Format:**
```typescript
interface ObservabilityEvent {
  /** ISO timestamp */
  timestamp: Date;
  
  /** Event topic (e.g., 'battle.started') */
  topic: string;
  
  /** Log level */
  level: 'debug' | 'info' | 'warn' | 'error';
  
  /** Source service/module */
  service: string;
  
  /** Event-specific payload */
  payload: Record<string, unknown>;
  
  /** Correlation ID (optional) */
  correlationId?: string;
  
  /** Parent correlation ID (optional) */
  parentCorrelationId?: string;
}
```

---

### 3. Loki Backend (`loki-backend.ts`)

**Purpose**: Loki-specific observability backend.

**Infrastructure Components:**
- **Queue** (`loki-queue.ts`): Bounded queue for pending entries
- **Circuit Breaker** (`loki-circuit-breaker.ts`): Endpoint protection
- **HTTP Transport** (`loki-http-transport.ts`): Loki API communication
- **Flush Worker** (`loki-flush-worker.ts`): Drains queue periodically
- **Health Worker** (`loki-health-worker.ts`): Probes endpoint for recovery

**Data Flow:**
```
ObservabilityEvent
    ↓
Convert to LokiLogEntry
    ↓
Queue.push() (fire-and-forget)
    ↓
FlushWorker (periodic drain)
    ↓
CircuitBreaker (check state)
    ↓
HttpTransport (POST to Loki)
    ↓
Loki Service
```

**Circuit Breaker States:**
- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Too many failures, block all requests
- **HALF_OPEN**: Recovery attempt, allow probe requests

**Configuration:**
```typescript
const LOKI_CONFIG = {
  ENABLED: env.LOKI_ENABLED === 'true',
  ENDPOINT: env.LOKI_PUSH_ENDPOINT || 'http://localhost:3100/loki/api/v1/push',
  MAX_QUEUE_SIZE: 10000,
  FLUSH_INTERVAL_MS: 5000,
  BATCH_SIZE: 100,
  CIRCUIT_BREAKER_THRESHOLD: 5,
  CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
};
```

---

### 4. Universal Envelope System

**Purpose**: Superset format that unifies all observability types.

#### 4.1 Envelope Types (`envelope/types.ts`)

**UniversalEnvelope** — Superset format:
```typescript
interface UniversalEnvelope {
  // Metadata
  kind: 'log' | 'metric' | 'event' | 'trace' | 'alert' | 'output';
  timestamp: Date;
  id: string;
  
  // Source
  source: EnvelopeSource;  // { service, version, environment, host, pid }
  
  // Correlation
  correlation?: EnvelopeCorrelation;  // { id, parent, chain, trace }
  
  // Context
  context?: EnvelopeContext;  // { component, operation, user, session }
  
  // Error
  error?: EnvelopeError;  // { code, message, stack, cause }
  
  // Metrics
  metrics?: EnvelopeMetrics;  // { duration, memory, cpu }
  
  // Kind-specific data
  data: Record<string, unknown>;
}
```

**Specialized Envelopes:**
- `LogEnvelope`: Extends with `level`, `message`, `component`, `operation`
- `MetricEnvelope`: Extends with `name`, `value`, `unit`, `tags`
- `EventEnvelope`: Extends with `name`, `category`, `actor`, `resource`
- `TraceEnvelope`: Extends with `span`, `parent`, `service`, `operation`
- `AlertEnvelope`: Extends with `severity`, `title`, `details`, `actions`
- `OutputEnvelope`: Extends with `stream`, `exitCode`, `command`

**Benefits:**
- Parse ANY output with ONE parser
- Filter by any field (level, component, correlation)
- Aggregate across services
- Export to any format (JSON, CSV, NDJSON)
- **Backwards compatible** with existing systems

---

#### 4.2 Envelope Factory (`envelope/factory.ts`)

**Purpose**: Create properly structured envelopes easily.

**Usage:**
```typescript
import { createLog, createMetric, createAlert } from './factory.js';

// Simple log
const log = createLog('info', 'database', 'query', 'Query executed', { sql: '...' });

// Metric
const metric = createMetric('database', 'query', { durationMs: 12, rowCount: 100 });

// Alert
const alert = createAlert('critical', 'Database connection lost', { host: '...' });
```

**Key Functions:**
```typescript
// Logs
function createLog(
  level: LogLevelType,
  component: string,
  operation: string,
  message: string,
  data?: Record<string, unknown>
): LogEnvelope;

// Metrics
function createMetric(
  component: string,
  operation: string,
  metrics: Record<string, number>
): MetricEnvelope;

// Events
function createEvent(
  name: string,
  category: string,
  actor?: string,
  resource?: string,
  data?: Record<string, unknown>
): EventEnvelope;

// Alerts
function createAlert(
  severity: AlertSeverityType,
  title: string,
  details?: Record<string, unknown>
): AlertEnvelope;

// Traces
function createTrace(
  service: string,
  operation: string,
  spanId: string,
  parentId?: string,
  data?: Record<string, unknown>
): TraceEnvelope;
```

**Correlation Integration:**
- Uses kernel's correlation system via `getCurrentCorrelationId()`
- Auto-attaches parent correlation via `getParentCorrelationId()`
- No duplication of correlation logic

**Configuration:**
```typescript
interface FactoryConfig {
  service: string;      // Default: 'infinity-gauntlet'
  version?: string;     // Default: npm_package_version
  environment?: string; // Default: NODE_ENV
  host?: string;        // Default: RENDER_SERVICE_ID
  pid?: number;         // Default: process.pid
}

configureFactory({ service: 'my-service', environment: 'production' });
```

---

#### 4.3 Envelope Serializer (`envelope/serializer.ts`)

**Purpose**: Convert envelopes to various output formats.

**Output Formats:**
- `json`: Machine-readable, full fidelity
- `jsonl`: Newline-delimited JSON (log streaming)
- `compact`: Single-line human-readable summary
- `pretty`: Multi-line formatted output
- `structured`: Key-value pairs for CLI tools

**Usage:**
```typescript
import { serialize, serializeMany } from './serializer.js';

// Single envelope
const output = serialize(envelope, { format: 'pretty', colorize: true });

// Multiple envelopes
const lines = serializeMany(envelopes, { format: 'jsonl' });

// Custom options
const custom = serialize(envelope, {
  format: 'structured',
  timestampFormat: 'relative',
  maxDataLength: 500,
  excludeFields: ['source.pid'],
});
```

**Serialization Options:**
```typescript
interface SerializeOptions {
  format?: 'json' | 'jsonl' | 'compact' | 'pretty' | 'structured';
  indent?: number;              // Pretty-print JSON
  includeEmpty?: boolean;       // Include null/undefined
  colorize?: boolean;           // ANSI colors for terminal
  timestampFormat?: 'iso' | 'unix' | 'relative' | 'time-only';
  maxDataLength?: number;       // Truncate data payload
  excludeFields?: string[];     // Fields to omit
}
```

**Example Outputs:**

**Compact:**
```
[12:34:56] INFO database/query Query executed { durationMs: 12, rowCount: 100 }
```

**Pretty:**
```
╔══════════════════════════════════════════════════════════════╗
║ LOG — 2025-12-30T12:34:56.789Z                               ║
╠══════════════════════════════════════════════════════════════╣
║ Level:     INFO                                              ║
║ Component: database                                          ║
║ Operation: query                                             ║
║ Message:   Query executed                                    ║
║                                                              ║
║ Data:                                                        ║
║   durationMs: 12                                            ║
║   rowCount: 100                                             ║
╚══════════════════════════════════════════════════════════════╝
```

**JSONL:**
```json
{"kind":"log","timestamp":"2025-12-30T12:34:56.789Z","level":"info","component":"database","operation":"query","message":"Query executed","data":{"durationMs":12,"rowCount":100}}
```

---

#### 4.4 Envelope Query (`envelope/query.ts`)

**Purpose**: Query DSL for filtering and aggregating envelopes.

**Usage:**
```typescript
import { queryEnvelopes } from './query.js';

// Filter by level
const errors = queryEnvelopes(envelopes, { level: 'error' });

// Filter by component
const dbLogs = queryEnvelopes(envelopes, { component: 'database' });

// Filter by correlation
const trace = queryEnvelopes(envelopes, { correlationId: 'abc-123' });

// Time range
const recent = queryEnvelopes(envelopes, {
  after: new Date('2025-12-30T12:00:00Z'),
  before: new Date('2025-12-30T13:00:00Z'),
});

// Complex query
const criticalDbErrors = queryEnvelopes(envelopes, {
  kind: 'log',
  level: ['error', 'fatal'],
  component: 'database',
  after: new Date(Date.now() - 3600000), // Last hour
});
```

**Query Options:**
```typescript
interface QueryOptions {
  kind?: ObservationKindType | ObservationKindType[];
  level?: LogLevelType | LogLevelType[];
  component?: string | string[];
  operation?: string | string[];
  service?: string | string[];
  correlationId?: string;
  after?: Date;
  before?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'level' | 'component';
  sortOrder?: 'asc' | 'desc';
}
```

**Aggregation Functions:**
```typescript
// Count by field
const counts = countBy(envelopes, 'component');
// { database: 42, cache: 18, discord: 7 }

// Group by field
const groups = groupBy(envelopes, 'level');
// { error: [...], warn: [...], info: [...] }

// Statistics
const stats = getStats(envelopes);
// { total: 67, byLevel: {...}, byComponent: {...}, timeRange: {...} }
```

---

## Data Flow Examples

### 1. Log Flow (Event Bus → Hub → Loki)

```typescript
// 1. Application logs via kernel
import { useLoggerHook } from '../../kernel/kernel-hooks.js';

const log = useLoggerHook();
log.info('battle', 'Battle started', { battleId: '123', players: 2 });

// 2. Kernel emits LogObservation to Event Bus
// (Automatic — handled by kernel observer)

// 3. Hub receives via Event Bus subscription
// Converts to ObservabilityEvent:
{
  timestamp: new Date(),
  topic: 'log.info',
  level: 'info',
  service: 'infinity-gauntlet',
  payload: {
    component: 'battle',
    operation: 'started',
    message: 'Battle started',
    battleId: '123',
    players: 2,
  },
  correlationId: 'abc-123',
}

// 4. Hub fans out to all backends
// LokiBackend.receive() converts to LokiLogEntry

// 5. Queue.push() (fire-and-forget, never blocks)

// 6. FlushWorker drains queue every 5 seconds

// 7. HttpTransport POSTs batch to Loki
```

---

### 2. Direct Ingestion (Security Bot → Hub → Loki)

```typescript
// 1. Security Bot calls hub directly
import { observabilityHub } from '../../observability/layer/index.js';

observabilityHub.ingest({
  timestamp: new Date(),
  topic: 'security.sweep.completed',
  level: 'info',
  service: 'security-bot',
  payload: {
    guildId: '123',
    rolesChecked: 42,
    changesDetected: 0,
    durationMs: 1234,
  },
});

// 2. Hub fans out immediately
// (No Event Bus involved — direct path)

// 3-7. Same as log flow above
```

---

### 3. Envelope Creation & Serialization

```typescript
// 1. Create envelope via factory
import { createLog } from '../../observability/envelope/factory.js';

const envelope = createLog(
  'error',
  'database',
  'query',
  'Query failed',
  { sql: 'SELECT * FROM users', error: 'Connection timeout' }
);

// 2. Serialize for output
import { serialize } from '../../observability/envelope/serializer.js';

const compact = serialize(envelope, { format: 'compact', colorize: true });
console.log(compact);
// [12:34:56] ERROR database/query Query failed { sql: '...', error: '...' }

const pretty = serialize(envelope, { format: 'pretty' });
console.log(pretty);
// ╔══════════════════════════════════════════════════════════════╗
// ║ LOG — 2025-12-30T12:34:56.789Z                               ║
// ...

// 3. Export to JSONL for log streaming
const jsonl = serialize(envelope, { format: 'jsonl' });
fs.appendFileSync('logs/app.jsonl', jsonl + '\n');
```

---

### 4. Envelope Query & Analysis

```typescript
// 1. Load envelopes from JSONL
import { readEnvelopesFromJsonl } from '../../observability/envelope/serializer.js';

const envelopes = readEnvelopesFromJsonl('logs/app.jsonl');

// 2. Query for errors in last hour
import { queryEnvelopes } from '../../observability/envelope/query.js';

const recentErrors = queryEnvelopes(envelopes, {
  level: ['error', 'fatal'],
  after: new Date(Date.now() - 3600000),
});

// 3. Group by component
import { groupBy } from '../../observability/envelope/query.js';

const errorsByComponent = groupBy(recentErrors, 'component');

// 4. Generate report
for (const [component, errors] of Object.entries(errorsByComponent)) {
  console.log(`${component}: ${errors.length} errors`);
  errors.forEach(e => {
    console.log(`  - ${e.data.message}`);
  });
}
```

---

## Design Principles

### 1. Isolation
- Hub errors never affect kernel or application
- Backend failures don't cascade to other backends
- Each backend manages its own resources independently

### 2. Fire-and-Forget
- `receive()` method MUST NOT throw
- All backends handle errors internally
- Queue operations never block callers

### 3. Standardization
- All backends receive same `ObservabilityEvent` format
- Universal envelope unifies all observability types
- Conversions handled transparently

### 4. Pluggability
- Easy to add new backends (implement `IObservabilityBackend`)
- Easy to remove backends (unregister, no side effects)
- Backends discovered via registration pattern

### 5. Observability
- Hub reports status via kernel hooks
- Each backend exposes health via `getStatus()`
- Queue depth, circuit breaker state, worker health all observable

### 6. Performance
- Bounded queues prevent unbounded growth
- Circuit breaker protects endpoints
- Batch sending reduces HTTP overhead
- Fire-and-forget design ensures zero blocking

---

## Extension Points

### Adding a New Backend

```typescript
import type { IObservabilityBackend, ObservabilityEvent } from './types.js';

class MyBackend implements IObservabilityBackend {
  readonly name = 'my-backend';
  enabled = true;
  
  receive(event: ObservabilityEvent): void {
    // Convert event to backend-specific format
    // Queue for sending
    // MUST NOT throw
  }
  
  async start(): Promise<void> {
    // Initialize workers, connections, etc.
  }
  
  async stop(): Promise<void> {
    // Flush queues, close connections, etc.
  }
  
  getStatus(): BackendStatus {
    return {
      healthy: true,
      message: 'My backend is healthy',
      details: { queueSize: 0 },
    };
  }
}

// Register with hub
import { observabilityHub } from './layer/index.js';
observabilityHub.registerBackend(new MyBackend());
```

---

### Creating Custom Envelope Types

```typescript
// 1. Define specialized envelope type
interface GameEnvelope extends UniversalEnvelope {
  kind: 'game';
  data: {
    gameType: 'battle' | 'encounter' | 'trade';
    playerId: string;
    outcome: string;
    // ... game-specific fields
  };
}

// 2. Create factory function
function createGameEnvelope(
  gameType: string,
  playerId: string,
  outcome: string,
  data?: Record<string, unknown>
): GameEnvelope {
  return {
    kind: 'game',
    timestamp: new Date(),
    id: randomUUID(),
    source: {
      service: 'infinity-gauntlet',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      host: process.env.HOSTNAME || 'localhost',
      pid: process.pid,
    },
    data: {
      gameType,
      playerId,
      outcome,
      ...data,
    },
  };
}

// 3. Use like any other envelope
const gameEvent = createGameEnvelope('battle', 'user123', 'victory', {
  durationMs: 45000,
  turnCount: 12,
});
```

---

## Performance Characteristics

### Hub
- **Latency**: <1ms (fire-and-forget fan-out)
- **Memory**: ~5 MB (backend registry + event buffer)
- **Throughput**: 10k+ events/sec

### Loki Backend
- **Queue**: Bounded at 10k entries (~10 MB)
- **Flush**: Every 5 seconds (100 entries/batch)
- **Batch Send**: ~50ms HTTP roundtrip
- **Recovery**: Circuit breaker timeout 60s
- **Memory**: ~15 MB (queue + workers + transport)

### Envelope System
- **Factory**: <10μs per envelope
- **Serialization**: 
  - JSON: ~50μs
  - JSONL: ~30μs
  - Compact: ~20μs
  - Pretty: ~100μs
- **Query**: O(n) scan, ~1μs per envelope
- **Memory**: Negligible (stateless functions)

---

## Related Documentation

- **System Overview**: [SENSAIOS-SYSTEM-OVERVIEW.md](./SENSAIOS-SYSTEM-OVERVIEW.md)
- **Kernel Layer**: [SENSAIOS-KERNEL-DETAIL.md](./SENSAIOS-KERNEL-DETAIL.md)
- **Application Layer**: [SENSAIOS-APPLICATION-LAYER.md](./SENSAIOS-APPLICATION-LAYER.md)
- **Implementation**: 
  - `src/observability/hub/` — Hub and configuration
  - `src/observability/backends/loki/` — Loki backend implementation
  - `src/observability/envelope/` — Universal envelope system
  - `src/observability/layer/` — Layer entry point

---

**END OF DOCUMENT**
