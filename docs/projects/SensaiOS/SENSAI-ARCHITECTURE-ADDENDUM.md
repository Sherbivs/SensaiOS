# Sensai OS — Architecture Addendum v1.1

**Version:** 1.1.0  
**Status:** ADDENDUM — Future-Proofing Extensions  
**Authority:** Project Leadership (DRIPTVDD)  
**Created:** December 28, 2025

---

## 1. Purpose

This addendum extends the Sensai OS architecture with considerations for:
- Future scalability patterns
- Edge cases and failure modes
- Integration with external systems
- Migration paths for existing code

It does NOT replace the core architecture — it supplements it with practical guidance for edge cases.

---

## 2. Scalability Patterns

### 2.1 Horizontal Scaling Considerations

While Sensai is designed for single-process operation, the architecture supports future horizontal scaling:

**Current Model (Single Process):**
```
┌───────────────────────────────────────────────────┐
│          Sensai Process (v1.2.0)                  │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────────┐   │
│  │ Bot │ │Worker│ │Cron │ │ CLI │ │ Lock Mgr│   │
│  └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └────┬────┘   │
│     │       │       │       │         │         │
│     └───────┴───────┴───────┴─────────┘         │
│                 │                               │
│         ┌──────┴──────┐  ┌────────────────┐     │
│         │  PostgreSQL │  │ CAS Blob Store │     │
│         │   (shared)  │  │   (SHA-256)    │     │
│         └─────────────┘  └────────────────┘     │
└───────────────────────────────────────────────────┘
```

**Future Model (Multi-Process with v1.2.0):**
```
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│  Bot 1  │ │  Bot 2  │ │ Worker  │ │Lock Mgr │
└────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘
     │           │           │           │
     └───────────┼───────────┼───────────┘
                 │           │
         ┌──────┴──────┐  ┌──┴──────────┐
         │  PostgreSQL │  │ CAS Storage │
         │  (shared)   │  │  (SHA-256)  │
         └─────────────┘  └─────────────┘
```

**Why This Works:**
- Export log is append-only with monotonic seq
- Advisory locks prevent concurrent mutations (v1.2.0 Lock Manager)
- Content-addressable storage deduplicates blobs (v1.2.0)
- Outbox pattern ensures exactly-once delivery
- Component handlers are idempotent by design
- Capability delegation enables cross-ring access (v1.2.0)

### 2.2 Sharding Strategy

If scale requires sharding:

```typescript
interface ShardStrategy {
  // Shard by guild (most natural for Discord)
  getShardForGuild(guildId: string): number;
  
  // Shard by trainer (for cross-guild operations)
  getShardForTrainer(trainerId: string): number;
  
  // Route exports to correct shard
  routeExport(envelope: ExportEnvelope): number;
}

// Example: Simple modulo sharding
function getShardForGuild(guildId: string, shardCount: number): number {
  const hash = hashString(guildId);
  return hash % shardCount;
}
```

### 2.3 Read Scaling

For read-heavy workloads:

```
┌───────────────────────────────────────────────────────┐
│                 Sensai (v1.2.0)                        │
│                                                       │
│  ┌─────────────────┐    ┌───────────────────────────┐ │
│  │     Writes      │    │          Reads            │ │
│  │   (Primary)     │    │     (Read Replicas)       │ │
│  │      │          │    │    ┌───┐ ┌───┐ ┌───┐     │ │
│  │      ▼          │    │    │ R │ │ R │ │ R │     │ │
│  │  ┌───────┐      │    │    └───┘ └───┘ └───┘     │ │
│  │ │Primary│───┼────┼──►  (async replication) │ │
│  │ │  DB   │   │    │                         │ │
│  │ └───────┘   │    │                         │ │
│  └─────────────┘    └─────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Implementation:**
```typescript
interface DbPrimitive {
  // Writes go to primary
  prisma: PrismaClient;
  
  // Reads can go to replica (eventual consistency ok)
  readReplica?: PrismaClient;
  
  // Force read from primary (strong consistency required)
  primaryRead<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
}
```

---

## 3. Failure Modes & Recovery

### 3.1 Database Connection Failures

**Scenario:** PostgreSQL becomes unavailable

**Mitigation:**
```typescript
class DbPrimitive {
  private connectionRetries = 0;
  private maxRetries = 5;
  private backoffMs = [100, 500, 1000, 5000, 10000];
  
  async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      this.connectionRetries = 0; // Reset on success
      return result;
    } catch (err) {
      if (this.isConnectionError(err)) {
        if (this.connectionRetries < this.maxRetries) {
          const delay = this.backoffMs[this.connectionRetries];
          this.connectionRetries++;
          await sleep(delay);
          return this.withRetry(fn);
        }
      }
      throw err;
    }
  }
}
```

### 3.2 Export Processing Failures

**Scenario:** Export handler throws an error

**Mitigation:**
```typescript
interface ExportEnvelope {
  // ... existing fields ...
  
  // Retry metadata
  attempts?: number;
  lastAttemptAt?: Date;
  lastError?: string;
  
  // Dead letter after max attempts
  deadLetteredAt?: Date;
}

async function processExport(envelope: ExportEnvelope): Promise<void> {
  try {
    await handler(envelope);
    await markProcessed(envelope);
  } catch (err) {
    envelope.attempts = (envelope.attempts ?? 0) + 1;
    envelope.lastAttemptAt = new Date();
    envelope.lastError = err.message;
    
    if (envelope.attempts >= MAX_ATTEMPTS) {
      await deadLetter(envelope);
    } else {
      await scheduleRetry(envelope, exponentialBackoff(envelope.attempts));
    }
  }
}
```

### 3.3 Component Crash Recovery

**Scenario:** Component throws during handler execution

**Mitigation:**
```typescript
async function runGuarded<T>(
  ctx: ComponentContext,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // Log with full context
    ctx.obs.log.error(operation, 'Handler crashed', {
      component: ctx.component.name,
      correlationId: ctx.obs.correlationId,
      error: err.message,
      stack: err.stack,
    });
    
    // Emit crash event for monitoring
    await ctx.exports.append({
      source: 'kernel.supervisor',
      type: 'component.handler.crashed',
      payload: {
        component: ctx.component.name,
        operation,
        error: err.message,
      },
      // ...
    });
    
    throw err; // Re-throw for caller handling
  }
}
```

### 3.4 Discord API Failures

**Scenario:** Discord API returns 5xx errors

**Mitigation:**
```typescript
class OutboxDeliverer {
  async deliverToDiscord(envelope: OutboxEnvelope): Promise<void> {
    try {
      await discord.send(envelope.payload);
      await this.markDelivered(envelope);
    } catch (err) {
      if (this.isRetryable(err)) {
        // Rate limit or temporary failure
        await this.scheduleRetry(envelope, this.getRetryDelay(err));
      } else {
        // Permanent failure (e.g., channel deleted)
        await this.markFailed(envelope, err);
      }
    }
  }
  
  private getRetryDelay(err: DiscordError): number {
    if (err.code === 'RATE_LIMITED') {
      return err.retryAfter * 1000;
    }
    return DEFAULT_RETRY_DELAY;
  }
}
```

---

## 4. External System Integration

### 4.1 Webhook Ingestion

External systems can send webhooks to Sensai:

```typescript
const webhookComponent: SensaiComponent = {
  name: 'integrations.webhooks',
  hosts: ['bot'], // HTTP endpoint on bot
  capabilities: { network: ['http-ingress'] },
  
  handlers: {
    http: {
      'POST /webhooks/:source': async (ctx, req) => {
        // Validate webhook signature
        if (!validateSignature(req)) {
          return { status: 401, body: { error: 'Invalid signature' } };
        }
        
        // Convert to export
        await ctx.exports.append({
          source: 'integrations.webhooks',
          type: `webhook.${req.params.source}`,
          payload: req.body,
          idempotencyKey: req.headers['x-idempotency-key'],
          correlationId: req.headers['x-correlation-id'] ?? generateId(),
          scope: extractScope(req),
          occurredAt: new Date(),
        });
        
        return { status: 202, body: { accepted: true } };
      },
    },
  },
};
```

### 4.2 External API Calls

Components can call external APIs via the network primitive:

```typescript
interface NetworkPrimitive {
  fetch(url: string, options?: FetchOptions): Promise<Response>;
  
  // With circuit breaker
  fetchWithBreaker(
    name: string,
    url: string,
    options?: FetchOptions
  ): Promise<Response>;
}

// Usage
async function fetchPokemonData(ctx: ComponentContext, pokemonId: number) {
  const response = await ctx.network.fetchWithBreaker(
    'pokeapi',
    `https://pokeapi.co/api/v2/pokemon/${pokemonId}`,
    { timeout: 5000 }
  );
  
  if (!response.ok) {
    throw new SensaiError('EXTERNAL_API_ERROR', 'PokeAPI request failed', {
      status: response.status,
      pokemonId,
    });
  }
  
  return response.json();
}
```

### 4.3 Event Streaming

For real-time integrations, Sensai can stream events:

```typescript
interface StreamingPrimitive {
  // Subscribe to export types
  subscribe(
    types: string[],
    handler: (envelope: ExportEnvelope) => Promise<void>
  ): Subscription;
  
  // Publish to external stream (e.g., Kafka, Redis Streams)
  publishExternal(
    stream: string,
    envelope: ExportEnvelope
  ): Promise<void>;
}
```

---

## 5. Advanced Concurrency Patterns

### 5.1 Saga Pattern

For multi-step operations that need compensation:

```typescript
interface SagaStep<T> {
  name: string;
  execute: (ctx: ComponentContext, data: T) => Promise<T>;
  compensate: (ctx: ComponentContext, data: T) => Promise<void>;
}

class SagaOrchestrator {
  async execute<T>(
    ctx: ComponentContext,
    steps: SagaStep<T>[],
    initialData: T
  ): Promise<T> {
    const completed: SagaStep<T>[] = [];
    let data = initialData;
    
    try {
      for (const step of steps) {
        data = await step.execute(ctx, data);
        completed.push(step);
      }
      return data;
    } catch (err) {
      // Compensate in reverse order
      for (const step of completed.reverse()) {
        try {
          await step.compensate(ctx, data);
        } catch (compensateErr) {
          ctx.obs.log.error('saga', 'Compensation failed', {
            step: step.name,
            error: compensateErr.message,
          });
        }
      }
      throw err;
    }
  }
}

// Usage: Trade saga
const tradeSaga: SagaStep<TradeData>[] = [
  {
    name: 'reserveSourcePokemon',
    execute: async (ctx, data) => {
      await reservePokemon(ctx, data.sourcePokemon);
      return data;
    },
    compensate: async (ctx, data) => {
      await unreservePokemon(ctx, data.sourcePokemon);
    },
  },
  {
    name: 'reserveTargetPokemon',
    execute: async (ctx, data) => {
      await reservePokemon(ctx, data.targetPokemon);
      return data;
    },
    compensate: async (ctx, data) => {
      await unreservePokemon(ctx, data.targetPokemon);
    },
  },
  {
    name: 'swapOwnership',
    execute: async (ctx, data) => {
      await swapPokemonOwnership(ctx, data);
      return data;
    },
    compensate: async (ctx, data) => {
      await swapPokemonOwnership(ctx, reverseData(data));
    },
  },
];
```

### 5.2 Distributed Locking

For cross-process coordination (future scaling):

```typescript
interface DistributedLockPrimitive {
  // Acquire lock with timeout
  acquire(
    key: string,
    ttlMs: number
  ): Promise<LockHandle | null>;
  
  // Extend lock TTL
  extend(handle: LockHandle, ttlMs: number): Promise<boolean>;
  
  // Release lock
  release(handle: LockHandle): Promise<void>;
}

// Usage
async function withDistributedLock<T>(
  ctx: ComponentContext,
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const lock = await ctx.locks.acquire(key, 30000);
  if (!lock) {
    throw new SensaiError('LOCK_TIMEOUT', `Could not acquire lock: ${key}`);
  }
  
  try {
    return await fn();
  } finally {
    await ctx.locks.release(lock);
  }
}
```

---

## 6. Data Migration Patterns

### 6.1 Schema Migrations

Schema changes happen at deploy time:

```
1. Deploy new code (handlers support old + new schema)
2. Run migration
3. Verify migration
4. Remove old schema support in next deploy
```

**Migration Safety:**
```typescript
// migrations/20251228_add_trainer_level.ts
export async function up(prisma: PrismaClient): Promise<void> {
  // Add column with default (non-breaking)
  await prisma.$executeRaw`
    ALTER TABLE "Trainer" 
    ADD COLUMN IF NOT EXISTS "level" INTEGER DEFAULT 1
  `;
}

export async function down(prisma: PrismaClient): Promise<void> {
  // Drop column (use with caution)
  await prisma.$executeRaw`
    ALTER TABLE "Trainer" 
    DROP COLUMN IF EXISTS "level"
  `;
}
```

### 6.2 Data Backfills

Large data changes happen via exports:

```typescript
// Create backfill job
await ctx.jobs.enqueue({
  kind: 'data.backfill',
  payload: {
    type: 'calculate_trainer_levels',
    batchSize: 100,
    cursor: null,
  },
});

// Backfill handler (processes in batches)
handlers: {
  jobs: {
    'data.backfill': async (ctx, job) => {
      const { type, batchSize, cursor } = job.payload;
      
      const trainers = await ctx.db.prisma.trainer.findMany({
        take: batchSize,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { id: 'asc' },
      });
      
      for (const trainer of trainers) {
        await ctx.exports.append({
          source: 'backfill',
          type: 'trainer.level.calculate',
          payload: { trainerId: trainer.id },
          // ...
        });
      }
      
      // Schedule next batch if more data
      if (trainers.length === batchSize) {
        await ctx.jobs.enqueue({
          kind: 'data.backfill',
          payload: {
            type,
            batchSize,
            cursor: trainers[trainers.length - 1].id,
          },
        });
      }
      
      return { processed: trainers.length };
    },
  },
}
```

---

## 7. Observability Extensions

### 7.1 Distributed Tracing

For multi-process deployments:

```typescript
interface TracingPrimitive {
  // Start new trace
  startTrace(operation: string): TraceSpan;
  
  // Continue existing trace
  continueTrace(traceId: string, operation: string): TraceSpan;
  
  // Add span to current trace
  startSpan(operation: string): Span;
}

// Usage
async function handleBattle(ctx: ComponentContext, battleId: string) {
  const span = ctx.tracing.startSpan('battle.process');
  span.setTag('battleId', battleId);
  
  try {
    await processMove(ctx, battleId);
    span.setTag('status', 'success');
  } catch (err) {
    span.setTag('status', 'error');
    span.setTag('error', err.message);
    throw err;
  } finally {
    span.finish();
  }
}
```

### 7.2 Custom Metrics

Components can emit custom metrics:

```typescript
// Counter
ctx.obs.metrics.inc('battles.started', { region: 'kanto' });

// Gauge
ctx.obs.metrics.gauge('active_battles', activeBattleCount);

// Histogram
ctx.obs.metrics.timing('battle.duration_ms', battleDurationMs);

// Summary
ctx.obs.metrics.summary('move.damage', damageDealt, {
  moveType: 'fire',
  effectiveness: 'super_effective',
});
```

### 7.3 Health Checks

Components declare health checks:

```typescript
const component: SensaiComponent = {
  name: 'game.battles',
  // ...
  
  healthChecks: {
    'database': async (ctx) => {
      await ctx.db.prisma.$queryRaw`SELECT 1`;
      return { healthy: true };
    },
    'queue_depth': async (ctx) => {
      const depth = await getQueueDepth(ctx);
      return {
        healthy: depth < 1000,
        details: { queueDepth: depth },
      };
    },
  },
};
```

---

## 8. Security Extensions

### 8.1 Capability Enforcement

Runtime capability checking:

```typescript
async function enforceCapability(
  ctx: ComponentContext,
  required: Capability
): Promise<void> {
  const component = ctx.component;
  
  if (!hasCapability(component.capabilities, required)) {
    throw new SensaiError(
      'CAPABILITY_VIOLATION',
      `Component ${component.name} lacks capability: ${required}`,
      { component: component.name, required }
    );
  }
}

// Usage in primitives
class DbPrimitive {
  async write(ctx: ComponentContext, ...args: unknown[]): Promise<void> {
    await enforceCapability(ctx, 'db.write');
    // Proceed with write
  }
}
```

### 8.2 Rate Limiting

Per-component rate limits:

```typescript
interface RateLimitConfig {
  // Requests per window
  requests: number;
  // Window size in ms
  windowMs: number;
  // Key function (e.g., by user, by guild)
  keyFn: (ctx: ComponentContext) => string;
}

async function checkRateLimit(
  ctx: ComponentContext,
  config: RateLimitConfig
): Promise<void> {
  const key = `ratelimit:${ctx.component.name}:${config.keyFn(ctx)}`;
  const current = await ctx.db.prisma.rateLimit.findUnique({ where: { key } });
  
  if (current && current.count >= config.requests) {
    throw new SensaiError(
      'RATE_LIMITED',
      'Too many requests',
      { retryAfter: current.windowEnd.getTime() - Date.now() }
    );
  }
  
  // Increment counter
  await ctx.db.prisma.rateLimit.upsert({
    where: { key },
    create: { key, count: 1, windowEnd: new Date(Date.now() + config.windowMs) },
    update: { count: { increment: 1 } },
  });
}
```

---

## 9. Reference

### 9.1 Related Documents

- **Final Architecture:** `SENSAI-FINAL-ARCHITECTURE.md`
- **Component Blueprint:** `SENSAI-COMPONENT-OS-BLUEPRINT.md`
- **Multi-Tenant Addendum:** `SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md`
- **Quick Reference:** `SENSAI-QUICK-REFERENCE.md`

### 9.2 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-28 | Initial addendum |
| 1.1.0 | 2025-12-28 | Added saga pattern, health checks |

---

**Document Version:** 1.1.0  
**Created:** December 28, 2025  
**Purpose:** Future-proofing extensions for Sensai OS architecture
