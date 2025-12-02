# Logging Standard — Infinity Gauntlet

**Version:** 1.0  
**Last Updated:** 2025-12-02  
**Status:** CANONICAL (all code must follow)

## Overview

This document defines the **canonical logging language** for the Infinity Gauntlet application. All logging calls must use this standardized vocabulary for consistency, queryability, and observability.

---

## Log Levels (Severity)

**4-tier system** (aligned with industry standards):

| Level | Code | Use Case | Examples |
|-------|------|----------|----------|
| **error** | `E` | System failures, exceptions, critical issues | Database connection lost, API timeout, unhandled exception |
| **warn** | `W` | Degraded state, potential issues, fallbacks | Cache miss, retry attempt, deprecated API usage |
| **info** | `I` | Normal operations, state changes, milestones | Server started, user authenticated, battle completed |
| **debug** | `D` | Detailed diagnostics, development traces | Query parameters, cache keys, algorithm steps |

**Rules:**
- ❌ NO `fatal`, `trace`, `verbose` (consolidate into 4 levels)
- ✅ Use `error` for any exception or failure
- ✅ Use `warn` for degraded performance or fallback paths
- ✅ Use `info` for business events and state transitions
- ✅ Use `debug` for implementation details (disabled in production)

---

## Log Components (Subsystems)

**Top-level subsystems** (used in `component` field):

### Core Systems
- `bot` — Discord bot client, command routing, event handling
- `battle` — Battle engine, move execution, damage calculation
- `encounter` — Wild Pokémon spawning, catch mechanics
- `database` — All database workers (PROD, TimescaleDB, Engine Read/Write)
- `cache` — Caching layer (L1, L2, dex pack)
- `worker` — Background workers (outbox, security, data pipeline)

### Infrastructure
- `http` — HTTP server, health checks, webhooks
- `security` — Permission management, role sweeps, audit trails
- `event-bus` — Event Bus message routing, correlation tracking
- `logger` — Logging system itself (meta-logging)

### Integration
- `discord-api` — Discord API calls, rate limiting, retries
- `pokemon-api` — PokéAPI integration, data fetching
- `render` — Render platform integration, deployment hooks

**Subcomponents** (dot notation):
- `database.prod` — PROD PostgreSQL worker
- `database.timescale` — TimescaleDB worker
- `database.engine-read` — Engine Read-DB worker
- `database.engine-write` — Engine Write-DB worker
- `bot.commands` — Slash command handlers
- `bot.dm` — DM flow handlers (**DEPRECATED — use `bot.homestead`**)
- `bot.homestead` — Homestead channel handlers (**CURRENT**)
- `battle.damage` — Damage calculation
- `battle.status` — Status effect handling

---

## Log Operations (Actions)

**Standardized verbs** (used in `operation` field):

### Lifecycle
- `initialize` — Component initialization
- `start` — Start background task/service
- `stop` — Stop background task/service
- `shutdown` — Graceful shutdown
- `restart` — Restart after failure

### Data Operations
- `query` — Database SELECT query
- `insert` — Database INSERT operation
- `update` — Database UPDATE operation
- `delete` — Database DELETE operation
- `flush` — Flush write buffer to database
- `sync` — Synchronize data between systems

### Network Operations
- `request` — HTTP/API request sent
- `response` — HTTP/API response received
- `timeout` — Operation timed out
- `retry` — Retry after failure

### Cache Operations
- `cache-hit` — Cache lookup succeeded
- `cache-miss` — Cache lookup failed
- `cache-evict` — Cache entry evicted
- `cache-clear` — Cache cleared

### Game Operations
- `spawn` — Spawn wild Pokémon
- `catch` — Catch attempt
- `battle-start` — Battle initiated
- `battle-end` — Battle completed
- `move-execute` — Move execution
- `heal` — Healing operation

### Error Handling
- `error` — Error occurred
- `recovery` — Recovery attempt
- `fallback` — Fallback to alternative path
- `circuit-break` — Circuit breaker triggered

---

## Log Structure (Required Fields)

**All log entries MUST include:**

```typescript
interface LogEntry {
  // Core fields (REQUIRED)
  timestamp: Date;           // ISO 8601 timestamp
  level: 'error' | 'warn' | 'info' | 'debug';
  component: string;         // From Components list above
  operation: string;         // From Operations list above
  message: string;           // Human-readable description
  
  // Context fields (OPTIONAL but recommended)
  userId?: string;           // Discord user ID
  guildId?: string;          // Discord guild ID
  channelId?: string;        // Discord channel ID
  correlationId?: string;    // Request/operation correlation ID
  parentCorrelationId?: string; // Parent operation ID (for nested ops)
  
  // Performance fields (OPTIONAL)
  durationMs?: number;       // Operation duration
  latencyMs?: number;        // Network latency
  
  // Error fields (REQUIRED for level='error')
  error?: {
    name: string;            // Error class name
    message: string;         // Error message
    stack?: string;          // Stack trace
    code?: string;           // Error code (e.g., 'ECONNREFUSED')
  };
  
  // Metadata (OPTIONAL, arbitrary key-value pairs)
  metadata?: Record<string, unknown>;
}
```

---

## Usage Examples

### ✅ Good Examples

```typescript
// Example 1: Database query with correlation
logger.info('database.prod', 'query', 
  'Fetched user profile', {
    userId: '123456789',
    correlationId: 'req_abc123',
    durationMs: 45,
    metadata: { table: 'User', rowCount: 1 }
  }
);

// Example 2: Error with recovery
logger.error('database.timescale', 'insert', 
  'Failed to insert log entry', {
    correlationId: 'req_xyz789',
    error: {
      name: 'PostgresError',
      message: 'Connection pool exhausted',
      code: '08P01'
    },
    metadata: { retryAttempt: 1, maxRetries: 3 }
  }
);

// Example 3: Cache hit with performance
logger.debug('cache', 'cache-hit', 
  'L1 cache hit for Pokemon #25', {
    durationMs: 0.12,
    metadata: { cacheKey: 'pokemon:25', cacheSize: 150 }
  }
);

// Example 4: Battle operation with user context
logger.info('battle', 'move-execute', 
  'Pikachu used Thunderbolt', {
    userId: '123456789',
    correlationId: 'battle_abc123',
    metadata: { 
      moveId: 85, 
      effectiveness: 2.0, 
      damage: 67,
      critical: false 
    }
  }
);
```

### ❌ Bad Examples

```typescript
// ❌ BAD: Non-standard level
logger.fatal('...');  // Use 'error' instead

// ❌ BAD: Non-standard component
logger.info('pokemon-module', '...');  // Use 'battle' or 'encounter'

// ❌ BAD: Non-standard operation
logger.info('database', 'fetch-data');  // Use 'query'

// ❌ BAD: Missing required fields
logger.info('Battle started');  // Missing component, operation

// ❌ BAD: Inconsistent terminology
logger.info('db', 'select');  // Use 'database', 'query'
```

---

## Logger API

### Unified Logger Interface

```typescript
interface Logger {
  error(component: string, operation: string, message: string, context?: LogContext): void;
  warn(component: string, operation: string, message: string, context?: LogContext): void;
  info(component: string, operation: string, message: string, context?: LogContext): void;
  debug(component: string, operation: string, message: string, context?: LogContext): void;
}

interface LogContext {
  userId?: string;
  guildId?: string;
  channelId?: string;
  correlationId?: string;
  parentCorrelationId?: string;
  durationMs?: number;
  latencyMs?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  metadata?: Record<string, unknown>;
}
```

### Usage

```typescript
import { getLogger } from './shared/logger.js';

const logger = getLogger();

// Simple info log
logger.info('bot', 'initialize', 'Discord bot client ready');

// Log with user context
logger.info('bot.commands', 'request', 'User executed /starter command', {
  userId: interaction.user.id,
  guildId: interaction.guildId,
  correlationId: generateCorrelationId(),
});

// Error with stack trace
logger.error('database.prod', 'query', 'Database query failed', {
  correlationId: req.correlationId,
  error: {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: error.code,
  },
  metadata: { query: 'SELECT * FROM User WHERE id = $1', params: [userId] },
});
```

---

## Database Schema

### TimescaleDB `log_entries` Table

```sql
CREATE TABLE log_entries (
  id BIGSERIAL,
  timestamp TIMESTAMPTZ NOT NULL,
  level TEXT NOT NULL,              -- 'error' | 'warn' | 'info' | 'debug'
  component TEXT NOT NULL,          -- From Components list
  operation TEXT NOT NULL,          -- From Operations list
  message TEXT NOT NULL,
  
  -- Context fields
  user_id TEXT,
  guild_id TEXT,
  channel_id TEXT,
  correlation_id TEXT,
  parent_correlation_id TEXT,
  
  -- Performance fields
  duration_ms NUMERIC(10, 3),
  latency_ms NUMERIC(10, 3),
  
  -- Error fields
  error_name TEXT,
  error_message TEXT,
  error_stack TEXT,
  error_code TEXT,
  
  -- Metadata (JSONB for flexible querying)
  metadata JSONB,
  
  PRIMARY KEY (timestamp, id)
);

-- Convert to hypertable (time-series partitioning)
SELECT create_hypertable('log_entries', 'timestamp');

-- Create indexes for common queries
CREATE INDEX idx_log_entries_level ON log_entries(level, timestamp DESC);
CREATE INDEX idx_log_entries_component ON log_entries(component, timestamp DESC);
CREATE INDEX idx_log_entries_operation ON log_entries(operation, timestamp DESC);
CREATE INDEX idx_log_entries_correlation ON log_entries(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX idx_log_entries_user ON log_entries(user_id, timestamp DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_log_entries_metadata ON log_entries USING gin(metadata);

-- Retention policy (drop old partitions)
SELECT add_retention_policy('log_entries', INTERVAL '90 days');
```

---

## Migration Strategy

### Phase 1: Logger Wrapper (Immediate)
Create wrapper around existing logger that:
1. Validates component/operation against standard vocabulary
2. Formats entries according to schema
3. Sends to TimescaleDB worker in real-time
4. Maintains backward compatibility with console output

### Phase 2: Codebase Audit (1-2 days)
1. Find all logging calls: `grep -r "logger\." src/`
2. Categorize by component and operation
3. Identify non-standard terminology
4. Create migration checklist

### Phase 3: Incremental Migration (1 week)
1. Update high-traffic paths first (bot commands, battles, database ops)
2. Replace console.log with standardized logger calls
3. Add correlation IDs to request flows
4. Test query performance in TimescaleDB

### Phase 4: Deprecation (2 weeks)
1. Mark old logging patterns as deprecated
2. Add ESLint rules to enforce standard
3. Remove legacy file-based logging
4. Cleanup /Store/logs directory

---

## Query Examples

### Common Queries

```sql
-- All errors in last 24 hours
SELECT timestamp, component, operation, message, error_message
FROM log_entries
WHERE level = 'error' 
  AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- Database operation performance
SELECT operation, 
       COUNT(*) as count,
       AVG(duration_ms) as avg_duration,
       MAX(duration_ms) as max_duration
FROM log_entries
WHERE component LIKE 'database%'
  AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY operation
ORDER BY avg_duration DESC;

-- User activity timeline
SELECT timestamp, component, operation, message
FROM log_entries
WHERE user_id = '123456789'
  AND timestamp > NOW() - INTERVAL '1 day'
ORDER BY timestamp DESC;

-- Correlated request trace
WITH RECURSIVE trace AS (
  SELECT * FROM log_entries WHERE correlation_id = 'req_abc123'
  UNION
  SELECT l.* FROM log_entries l
  INNER JOIN trace t ON l.parent_correlation_id = t.correlation_id
)
SELECT timestamp, component, operation, message, duration_ms
FROM trace
ORDER BY timestamp;

-- Error rate by component (last hour)
SELECT component,
       COUNT(*) FILTER (WHERE level = 'error') as errors,
       COUNT(*) as total,
       ROUND(100.0 * COUNT(*) FILTER (WHERE level = 'error') / COUNT(*), 2) as error_rate_pct
FROM log_entries
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY component
ORDER BY error_rate_pct DESC;
```

---

## Enforcement

### ESLint Rules

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    // Require standardized logger import
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['**/logger', '!./shared/logger'],
        message: 'Use centralized logger from ./shared/logger.js'
      }]
    }],
    
    // Ban console.log in production code
    'no-console': ['error', { allow: ['warn', 'error'] }],
    
    // Require correlation IDs for async operations
    'require-correlation-id': 'warn',
  }
};
```

### TypeScript Enforcement

```typescript
// Restrict logger.level() signatures to require component/operation
type LogLevel = 'error' | 'warn' | 'info' | 'debug';
type Component = 'bot' | 'battle' | 'database' | 'cache' | ...; // Enum of valid components
type Operation = 'query' | 'insert' | 'initialize' | ...; // Enum of valid operations

interface Logger {
  error(component: Component, operation: Operation, message: string, context?: LogContext): void;
  // ... other levels
}
```

---

## Benefits

1. **Queryability** — Structured fields enable complex queries (errors by component, performance by operation)
2. **Correlation** — Trace entire request flow across workers via correlation IDs
3. **Consistency** — Standardized vocabulary eliminates ambiguity
4. **Observability** — Real-time dashboards, alerting, anomaly detection
5. **Debugging** — Filter logs by user, operation, time range
6. **Compliance** — Centralized audit trail for security events

---

## Maintenance

- **Vocabulary Updates:** Propose additions to standard via PR (docs team approval required)
- **Deprecations:** Mark deprecated terms, provide migration path, enforce via linter
- **Training:** Include logging standard in onboarding, code review checklist
- **Monitoring:** Dashboard showing adoption rate (% of logs following standard)

---

**CANONICAL STATUS:** This document is the single source of truth for logging. All deviations require explicit approval and documentation.
