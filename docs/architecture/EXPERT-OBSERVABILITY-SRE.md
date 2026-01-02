# Observability / SRE Lead — Expert Review
**Focus:** Metrics/Logs, Operational Clarity  
**Date:** December 30, 2025

---

## Core Recommendations

### 1. Standardize Event Taxonomy
"Great that you moved logs to envelopes. Next, standardize the event taxonomy: stable `source`, stable `operation`, stable `type`, and required fields (scope/correlation/idempotency)."

**Standard Envelope Schema:**
```typescript
interface StandardEnvelope {
  // REQUIRED: Stable identifiers
  source: string;          // e.g., "game.battles"
  operation: string;       // e.g., "execute-turn"
  type: string;            // e.g., "battle.turn.completed"
  
  // REQUIRED: Multi-tenant context
  scope: {
    tenantId: string;      // Bot instance
    guildId: string;       // Discord guild
  };
  
  // REQUIRED: Traceability
  correlationId: string;   // Request trace ID
  idempotencyKey: string;  // Deduplication
  
  // REQUIRED: Timing
  occurredAt: Date;        // Event timestamp
  
  // OPTIONAL: Data
  payload?: unknown;       // Type-specific data
}
```

**Taxonomy Rules:**
- `source` = component name (never changes)
- `operation` = method/handler name (stable)
- `type` = event type in dot-notation (semantic, queryable)
- All envelopes MUST include scope + correlation + idempotency

### 2. Define Sampling Strategy
"Decide what's sampled vs never-sampled. Errors should be near-100% retention; debug/info can be sampled."

**Sampling Rules:**

| Level | Retention | Reason |
|-------|-----------|--------|
| ERROR | 100% | Critical signals, never drop |
| WARN | 100% | Important signals |
| INFO | 10% | High-volume, sample sufficient |
| DEBUG | 1% | Very high-volume |
| TRACE | 0.1% | Extreme volume |

**Implementation:**
```typescript
function shouldSample(level: LogLevel, correlationId: string): boolean {
  if (level === 'ERROR' || level === 'WARN') return true; // Never drop
  
  // Hash-based sampling (consistent per correlation ID)
  const hash = hashString(correlationId);
  
  switch (level) {
    case 'INFO': return hash % 10 === 0;  // 10%
    case 'DEBUG': return hash % 100 === 0; // 1%
    case 'TRACE': return hash % 1000 === 0; // 0.1%
    default: return false;
  }
}
```

### 3. Define Backpressure Behavior
"Define backpressure behavior: when under load, what gets dropped first? Usually debug logs, then info metrics—never the outbox for user-visible effects."

**Drop Priority (high to low):**
```
1. TRACE logs        → Drop first (observability, high volume)
2. DEBUG logs        → Drop second
3. INFO logs         → Drop third
4. Metrics           → Drop fourth (can tolerate loss)
5. WARN logs         → Never drop (important signals)
6. ERROR logs        → Never drop (critical)
7. Exports/Jobs      → Never drop (correctness)
8. Outbox            → Never drop (user-visible effects)
```

**Backpressure Implementation:**
```typescript
class RingBuffer<T> {
  private buffer: T[] = [];
  private maxSize: number;
  
  append(item: T, priority: number): boolean {
    if (this.buffer.length >= this.maxSize) {
      // Check if new item has higher priority than oldest low-priority item
      const lowestPriority = this.findLowestPriorityItem();
      if (priority > lowestPriority.priority) {
        this.remove(lowestPriority.index);
        this.buffer.push(item);
        return true;
      }
      return false; // Buffer full, new item dropped
    }
    
    this.buffer.push(item);
    return true;
  }
}
```

### 4. Make "What Is Happening Now?" Easy
"Make it easy to answer: 'What is the bot doing right now?' Add a minimal health summary that doesn't depend on the rest of observability being healthy."

**Required Health Endpoint:**
```typescript
interface HealthSummary {
  // Core state
  status: 'INIT' | 'READY' | 'ENABLED' | 'DRAINING' | 'STOPPED';
  uptime: number;
  version: string;
  
  // Critical subsystems
  database: 'UP' | 'DOWN' | 'DEGRADED';
  discord: 'UP' | 'DOWN' | 'DEGRADED';
  workers: {
    total: number;
    active: number;
    idle: number;
  };
  
  // Current activity (last 60s)
  recentActivity: {
    commands: number;
    battles: number;
    encounters: number;
    errors: number;
  };
  
  // Resource usage
  memory: {
    rss: number;
    heapUsed: number;
    utilization: number; // percentage
  };
  
  // Observability health (meta)
  observabilityStatus: 'UP' | 'DOWN' | 'DEGRADED';
  lastFlush: Date;
}
```

**Design Rule:** Health endpoint must work even if Loki/Grafana/logging is broken.

---

## Validation Checklist

- [ ] Event taxonomy documented with stable source/operation/type fields
- [ ] All envelopes include scope + correlation + idempotency
- [ ] Sampling strategy defined and implemented
- [ ] Backpressure drop priority documented
- [ ] Ring buffers implement priority-based eviction
- [ ] Health endpoint implemented and independent of observability backends
- [ ] "What is happening now?" dashboard exists
- [ ] ERROR/WARN logs never sampled or dropped

---

## Operational Queries

**Required Queries (must be easy to run):**

1. **Active Battles:**
   ```
   { source="game.battles", type="battle.turn.completed" } | count by battleId | last 5m
   ```

2. **Error Rate:**
   ```
   { level="ERROR" } | count | rate(1m)
   ```

3. **Slowest Operations:**
   ```
   { operation=~".*" } | extract duration | quantile(0.99) by operation
   ```

4. **Per-Guild Activity:**
   ```
   { scope.guildId="12345" } | count by type | last 1h
   ```

5. **Correlation Trace:**
   ```
   { correlationId="abc-123" } | order by occurredAt
   ```

---

**Reference:** [SENSAIOS-SYSTEM-OVERVIEW.md](./SENSAIOS-SYSTEM-OVERVIEW.md)
