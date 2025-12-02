# Database Worker Communication Protocols

**Purpose:** Document how database workers communicate with each other, the Worker Manager, the Data API layer, and application code.

**Last Updated:** 2025-12-02  
**Status:** Foundation Design (Task 2)

---

## Table of Contents

1. [Overview](#overview)
2. [Worker ↔ Application Communication](#worker--application-communication)
3. [Worker ↔ Worker Manager Communication](#worker--worker-manager-communication)
4. [Worker ↔ Database Communication](#worker--database-communication)
5. [Worker ↔ Data API Layer Communication](#worker--data-api-layer-communication)
6. [Event Patterns](#event-patterns)
7. [Error Propagation](#error-propagation)
8. [Performance Considerations](#performance-considerations)

---

## Overview

The database worker architecture uses **three primary communication patterns**:

1. **Async/Await (Synchronous API, Asynchronous Execution)**
   - Application code calls worker methods and awaits results
   - Clean, TypeScript-idiomatic pattern
   - Used for: Query operations, write operations, health checks

2. **Event-Based (Push Notifications)**
   - Workers emit events to Worker Manager and monitoring systems
   - No blocking, fire-and-forget semantics
   - Used for: Lifecycle events, health updates, error notifications

3. **Message Queue (Future - Phase 10+)**
   - Background tasks communicate via message broker (Redis Pub/Sub, RabbitMQ, etc.)
   - Decoupled, fault-tolerant, horizontally scalable
   - Used for: Cross-worker coordination, distributed caching, background jobs

**Current Implementation (Phase 1-9):** Async/Await + Event-Based only. Message queue reserved for Phase 10+ scaling.

---

## Worker ↔ Application Communication

### Pattern: Async/Await API

Application code imports worker instances and calls methods directly. Workers return Promises that resolve with data or reject with errors.

### Example: Query Operation

```typescript
// Application code (battle engine)
import { prodPostgresWorker } from '../workers/database/index.js';

async function getBattleHistory(trainerId: string): Promise<Battle[]> {
  // Call worker method (async/await pattern)
  const battles = await prodPostgresWorker.query<Battle>(
    'SELECT * FROM battles WHERE trainer_id = $1 ORDER BY created_at DESC LIMIT 10',
    [trainerId]
  );
  
  return battles;
}
```

### Example: Write Operation

```typescript
// Application code (battle completion)
import { prodPostgresWorker } from '../workers/database/index.js';

async function saveBattleResult(battle: Battle): Promise<void> {
  // Insert buffered write (returns immediately, flushes asynchronously)
  await prodPostgresWorker.insert('battles', {
    id: battle.id,
    trainer_id: battle.trainerId,
    opponent_id: battle.opponentId,
    winner_id: battle.winnerId,
    created_at: new Date(),
  });
  
  // No need to await flush - happens automatically via background worker
}
```

### Contract Rules

1. **All worker methods return Promises**
   - Success: Promise resolves with data
   - Failure: Promise rejects with Error

2. **Workers handle retries internally**
   - Application code doesn't need retry logic
   - Circuit breaker protects against cascade failures

3. **Backpressure propagated via exceptions**
   - If write buffer full, `insert()` throws Error
   - Application can handle backpressure (retry, drop, queue)

4. **Type safety enforced at compile time**
   - TypeScript generics ensure query results match expected types
   - Example: `query<Battle>(sql)` returns `Promise<Battle[]>`

---

## Worker ↔ Worker Manager Communication

### Pattern: Event-Based Lifecycle

Worker Manager subscribes to worker events and responds to state changes. Workers emit events for lifecycle transitions, health checks, and errors.

### Lifecycle Events

```typescript
// Worker emits initialization event
this.emitEvent({
  type: 'initialized',
  workerId: 'prod-postgres',
  timestamp: new Date(),
});

// Worker Manager receives event and updates registry
workerManager.on((event) => {
  if (event.type === 'initialized') {
    registry.markReady(event.workerId);
  }
});
```

### Health Check Events

```typescript
// Worker emits health check results (every 15 seconds)
this.emitEvent({
  type: 'health-check',
  workerId: 'prod-postgres',
  health: {
    status: 'healthy',
    latencyMs: 45,
    errorCount: 0,
    lastError: null,
    uptimeMs: 3600000,
    lastOperationAt: new Date(),
    details: { cacheHitRate: 0.87, bufferUtilization: 0.34 },
  },
  timestamp: new Date(),
});

// Worker Manager receives event and updates dashboard
workerManager.on((event) => {
  if (event.type === 'health-check') {
    dashboard.updateWorkerHealth(event.workerId, event.health);
  }
});
```

### Error Events

```typescript
// Worker emits error event (on any failure)
this.emitEvent({
  type: 'error',
  workerId: 'prod-postgres',
  error: new Error('Connection timeout'),
  timestamp: new Date(),
});

// Worker Manager receives error and triggers recovery
workerManager.on((event) => {
  if (event.type === 'error') {
    alerting.sendCriticalAlert(`Worker ${event.workerId} error: ${event.error.message}`);
    recovery.attemptRestart(event.workerId);
  }
});
```

### Contract Rules

1. **Workers MUST emit lifecycle events**
   - `initialized`, `started`, `stopped` (graceful shutdown tracking)
   - Worker Manager uses these to determine readiness

2. **Workers SHOULD emit health check events periodically**
   - Interval: 15 seconds (configurable)
   - Allows Worker Manager to detect degraded state

3. **Workers MUST emit error events on failures**
   - All exceptions caught and emitted
   - Circuit breaker opens after N consecutive errors

4. **Event emission is fire-and-forget**
   - Workers don't wait for acknowledgment
   - No blocking, no backpressure

---

## Worker ↔ Database Communication

### Pattern: Connection Pooling + Query Batching

Workers maintain persistent database connections and batch queries/writes for efficiency.

### Connection Management

```typescript
// PROD PostgreSQL Worker (Prisma client)
class ProdPostgresWorker extends BaseDatabaseWorker {
  private prisma!: PrismaClient;
  
  protected async doInitialize(): Promise<void> {
    // Initialize Prisma client (connection pool)
    this.prisma = new PrismaClient({
      datasources: {
        db: { url: process.env.PROD_DATABASE_URL },
      },
      log: ['error', 'warn'],
    });
    
    // Test connection
    await this.prisma.$connect();
  }
  
  protected async doStop(): Promise<void> {
    // Close connections gracefully
    await this.prisma.$disconnect();
  }
}
```

### Query Execution

```typescript
// Execute query with caching
async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  // Check cache first
  const cacheKey = this.buildCacheKey(sql, params);
  const cached = this.cache.get(cacheKey);
  if (cached) {
    this.emitEvent({ type: 'cache-hit', workerId: this.id, key: cacheKey, timestamp: new Date() });
    return cached as T[];
  }
  
  // Cache miss - execute query
  this.emitEvent({ type: 'cache-miss', workerId: this.id, key: cacheKey, timestamp: new Date() });
  const result = await this.executeOperation('query', async () => {
    return await this.prisma.$queryRaw<T[]>`${sql}`;
  });
  
  // Cache result
  this.cache.set(cacheKey, result);
  
  return result;
}
```

### Write Buffering

```typescript
// Buffer write (returns immediately)
async insert(table: string, data: Record<string, unknown>): Promise<void> {
  this.writeBuffer.add({
    operation: 'insert',
    table,
    data,
    timestamp: new Date(),
  });
  
  // Check if flush needed
  if (this.writeBuffer.shouldFlush()) {
    // Trigger async flush (non-blocking)
    void this.flush();
  }
}

// Background flush worker (runs every 5s)
async flush(): Promise<number> {
  const writes = this.writeBuffer.getAll();
  if (writes.length === 0) return 0;
  
  // Execute all writes in single transaction
  await this.prisma.$transaction(async (tx) => {
    for (const write of writes) {
      if (write.operation === 'insert') {
        await tx[write.table].create({ data: write.data });
      }
      // ... handle update, delete
    }
  });
  
  // Clear buffer after successful flush
  this.writeBuffer.clear();
  
  return writes.length;
}
```

### Contract Rules

1. **Workers own database connections**
   - One connection pool per worker
   - No shared connections between workers

2. **Queries cached with TTL**
   - Default TTL: 5 minutes
   - Cache key: `SHA-256(sql + params)`

3. **Writes buffered and batched**
   - Default flush: 5 seconds OR 100 entries
   - Transactional flush (all-or-nothing)

4. **Connection errors trigger circuit breaker**
   - After 5 consecutive failures, stop attempting
   - Retry after 30 seconds (exponential backoff)

---

## Worker ↔ Data API Layer Communication

### Pattern: Dependency Injection

Data API layer receives worker instances via constructor injection. API methods delegate to workers and provide domain-specific abstractions.

### Example: PokemonDataAPI

```typescript
// Data API implementation
export class PokemonDataAPI {
  constructor(
    private prodWorker: ProdPostgresWorker,
    private engineReadWorker: EngineReadWorker
  ) {}
  
  async getPokemon(id: number): Promise<Pokemon> {
    // Try L1 cache first (Engine Read-DB worker)
    const cached = await this.engineReadWorker.query<Pokemon>(
      'SELECT * FROM pokemon WHERE id = $1',
      [id]
    );
    
    if (cached.length > 0) {
      return cached[0];
    }
    
    // Fallback to PROD database (with query cache)
    const result = await this.prodWorker.queryOne<Pokemon>(
      'SELECT * FROM "Species" WHERE id = $1',
      [id]
    );
    
    if (!result) {
      throw new Error(`Pokémon not found: ${id}`);
    }
    
    return result;
  }
  
  async saveBattle(battle: Battle): Promise<void> {
    // Buffer write (non-blocking)
    await this.prodWorker.insert('battles', {
      id: battle.id,
      trainer_id: battle.trainerId,
      opponent_id: battle.opponentId,
      winner_id: battle.winnerId,
      created_at: new Date(),
    });
  }
}
```

### Example: Application Usage

```typescript
// Application code imports API (NOT workers directly)
import { pokemonDataAPI } from '../api/pokemon.js';

async function loadPokemon(id: number): Promise<Pokemon> {
  // Call API method (workers abstracted away)
  return await pokemonDataAPI.getPokemon(id);
}
```

### Contract Rules

1. **Application code MUST use Data API layer**
   - No direct worker imports in application code
   - API provides domain-specific methods

2. **Data API layer MAY query multiple workers**
   - Example: Check Engine Read-DB cache → Fallback to PROD
   - Transparent to application

3. **Data API layer handles cache coordination**
   - Cache invalidation after writes
   - Prefetching for frequently accessed data

4. **Data API layer provides type-safe interfaces**
   - Domain models (Pokemon, Battle, Trainer) vs. raw DB rows
   - Validation and transformation logic

---

## Event Patterns

### Event Types

```typescript
type WorkerEvent =
  // Lifecycle events
  | { type: 'initialized'; workerId: string; timestamp: Date }
  | { type: 'started'; workerId: string; timestamp: Date }
  | { type: 'stopped'; workerId: string; timestamp: Date; reason: string }
  
  // Health events
  | { type: 'health-check'; workerId: string; health: WorkerHealth; timestamp: Date }
  
  // Error events
  | { type: 'error'; workerId: string; error: Error; timestamp: Date }
  | { type: 'recovery-success'; workerId: string; timestamp: Date }
  | { type: 'recovery-failure'; workerId: string; error: Error; timestamp: Date }
  
  // Cache events
  | { type: 'cache-hit'; workerId: string; key: string; timestamp: Date }
  | { type: 'cache-miss'; workerId: string; key: string; timestamp: Date }
  | { type: 'cache-eviction'; workerId: string; key: string; timestamp: Date }
  
  // Write buffer events
  | { type: 'buffer-flush'; workerId: string; entriesWritten: number; durationMs: number; timestamp: Date }
  | { type: 'backpressure-activated'; workerId: string; utilizationPercent: number; timestamp: Date }
  | { type: 'backpressure-deactivated'; workerId: string; utilizationPercent: number; timestamp: Date };
```

### Event Subscription

```typescript
// Worker Manager subscribes to all events
const unsubscribe = workerEventEmitter.on((event) => {
  // Log event
  logger.info(`Worker event: ${event.type} from ${event.workerId}`);
  
  // Update metrics
  metrics.recordEvent(event);
  
  // Trigger alerts
  if (event.type === 'error') {
    alerting.sendCriticalAlert(`Worker ${event.workerId} error: ${event.error.message}`);
  }
});

// Cleanup on shutdown
process.on('SIGTERM', () => {
  unsubscribe();
});
```

---

## Error Propagation

### Error Flow

```
Application Code
      ↓ (calls worker method)
Data API Layer
      ↓ (delegates to worker)
Database Worker
      ↓ (executeOperation with retry)
Error Recovery Strategy
      ↓ (circuit breaker, exponential backoff)
Database
      ↓ (query fails)
Error thrown back to Application Code
```

### Error Handling Example

```typescript
// Application code with error handling
async function getBattleHistory(trainerId: string): Promise<Battle[]> {
  try {
    return await prodPostgresWorker.query<Battle>(
      'SELECT * FROM battles WHERE trainer_id = $1',
      [trainerId]
    );
  } catch (error) {
    if (error.message === 'Circuit breaker OPEN') {
      // Worker temporarily unavailable
      return []; // Return empty array (graceful degradation)
    }
    
    // Unexpected error - propagate
    throw error;
  }
}
```

---

## Performance Considerations

### Latency Targets

| Operation | Target Latency | Notes |
|-----------|---------------|-------|
| Query (cached) | <1ms | L1 cache hit (in-memory Map) |
| Query (Engine Read-DB) | <50ms | SQLite read (local disk) |
| Query (PROD cached) | <10ms | Query cache hit (in-memory Map) |
| Query (PROD uncached) | 50-100ms | PostgreSQL query (Render) |
| Write (buffered) | <1ms | Add to buffer (non-blocking) |
| Write (flush) | 50-200ms | Transaction commit (Render) |

### Throughput Targets

| Worker | Target Throughput | Notes |
|--------|------------------|-------|
| PROD PostgreSQL | 1000+ reads/sec | With 85% cache hit rate |
| TimescaleDB | 1000+ writes/sec | Batched inserts (100 per flush) |
| Engine Read-DB | 10000+ reads/sec | L1 cache (in-memory) |
| Engine Write-DB | 1000+ writes/sec | Buffered writes (5s flush) |

### Optimization Strategies

1. **Cache First, Database Second**
   - Check L1 cache → Engine Read-DB → Query cache → PROD database
   - Target 85%+ cache hit rate

2. **Batch Writes**
   - Buffer writes for 5 seconds OR 100 entries
   - Single transaction per batch (reduces round trips)

3. **Prepared Statements**
   - SQLite workers use prepared statements (compile once, execute many)
   - PostgreSQL workers use parameterized queries (prevents SQL injection)

4. **Connection Pooling**
   - PROD PostgreSQL: Direct connection mode (no pooling, lower latency)
   - TimescaleDB: Shared connection with PROD (same database)

---

**End of Protocol Documentation**
