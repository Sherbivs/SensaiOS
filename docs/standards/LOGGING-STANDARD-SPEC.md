# Professional Logging Standard Specification

**Version:** 1.0.0  
**Last Updated:** 2025-12-30  
**Status:** IN PROGRESS — Phase 1 Complete (Visual Clutter Removed)  

---

## Executive Summary

This document defines the canonical logging standard for Infinity Gauntlet services deployed on Render.com. The specification prioritizes:

1. **Machine-parseable output** for Loki/Grafana ingestion
2. **Human-readable development** experience
3. **Correlation tracking** across distributed services
4. **Professional ops output** without decorative elements

---

## 1. Current State Analysis

### 1.1 Existing Infrastructure

| Component | Location | Purpose |
|-----------|----------|---------|
| **UniversalEnvelope** | `src/observability/envelope/types.ts` | Unified log structure |
| **Serializer** | `src/observability/envelope/serializer.ts` | JSON/JSONL/Compact formats |
| **Console Bridge** | `src/observability/envelope/console.ts` | Drop-in console.* replacement |
| **Loki Backend** | `src/observability/backends/loki/*.ts` | Grafana Loki integration |
| **Loki Transport** | `src/shared/logging/loki-transport.ts` | Batch log shipping |
| **Log Sampler** | `src/shared/logging/log-sampler.ts` | Volume control |
| **Correlation** | `src/kernel/correlation.ts` | Distributed tracing |

### 1.2 Identified Issues

1. **Emoji pollution** — Serializer uses emojis (`🔍📘⚠️❌💀`) in `getLevelEmoji()`
2. **Unicode box characters** — Console renderer uses `╔═║╗` in output
3. **Inconsistent LOG_FORMAT** — Services use `json`, `cli`, `both` inconsistently
4. **Timestamp format variance** — ISO8601, time-only, relative all in use
5. **Service identification** — `RENDER_SERVICE_NAME` vs `SERVICE_NAME` ambiguity

---

## 2. Log Format Specification

### 2.1 Production Format (JSONL)

All production logs MUST be single-line JSON (JSONL) for Loki ingestion:

```json
{"timestamp":"2025-12-29T14:32:05.123Z","level":"info","service":"discord-bot","component":"battle-engine","operation":"move","message":"Player executed attack","correlationId":"abc12345","data":{"playerId":"user123","move":"thunderbolt","damage":95}}
```

#### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `timestamp` | ISO8601 string | UTC timestamp with milliseconds | `2025-12-29T14:32:05.123Z` |
| `level` | enum | Log severity | `debug`, `info`, `warn`, `error`, `fatal` |
| `service` | string | Render service name | `discord-bot`, `security-bot`, `outbox-worker` |
| `component` | string | Subsystem identifier | `battle-engine`, `homestead`, `database` |
| `operation` | string | Specific action | `spawn`, `catch`, `query`, `heal` |
| `message` | string | Human-readable description | `Player executed attack` |
| `correlationId` | string | Request trace ID (8+ chars) | `abc12345-defg-6789` |

#### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `data` | object | Structured payload (max 1KB) |
| `parentCorrelationId` | string | Parent trace for nested operations |
| `error` | object | Error details (for `level: error|fatal`) |
| `duration` | number | Operation duration in milliseconds |
| `userId` | string | Discord user ID (when applicable) |
| `guildId` | string | Discord guild ID (when applicable) |

### 2.2 Development Format (Compact)

Local development uses colorized single-line format:

```
[14:32:05] INFO  battle-engine.move: Player executed attack {playerId:"user123"} (abc12345)
```

Structure: `[TIME] LEVEL COMPONENT.OPERATION: MESSAGE {data} (correlationId)`

#### ANSI Colors (Development Only)

| Level | Color | ANSI Code |
|-------|-------|-----------|
| DEBUG | Cyan | `\x1b[36m` |
| INFO | Green | `\x1b[32m` |
| WARN | Yellow | `\x1b[33m` |
| ERROR | Red | `\x1b[31m` |
| FATAL | Magenta | `\x1b[35m` |

### 2.3 Prohibited Elements

**DO NOT USE** in any log output:

| Element | Reason | Alternative |
|---------|--------|-------------|
| Emojis (`🔍📘⚠️❌💀`) | Non-ASCII, terminal issues | Level text |
| Box drawing (`╔═║╗`) | Unicode compatibility | ASCII dashes `---` |
| ASCII art | Visual clutter | Plain text |
| Colors in production | Loki ingestion issues | JSONL format |
| Decorative prefixes (`>>>`, `***`) | Noise | Clean format |

---

## 3. Log Levels

### 3.1 Level Definitions

| Level | Priority | When to Use | Loki Label |
|-------|----------|-------------|------------|
| **DEBUG** | 0 | Development details, verbose tracing | `level="debug"` |
| **INFO** | 1 | Normal operations, business events | `level="info"` |
| **WARN** | 2 | Recoverable issues, degraded state | `level="warn"` |
| **ERROR** | 3 | Failures requiring attention | `level="error"` |
| **FATAL** | 4 | Unrecoverable crashes | `level="fatal"` |

### 3.2 Level Selection Guidelines

```typescript
// DEBUG - Only in development, verbose details
log.debug('database', 'query', 'Preparing SQL', { sql, params });

// INFO - Normal operations, business milestones
log.info('battle', 'start', 'Battle initiated', { battleId, players });

// WARN - Recoverable issues, performance concerns
log.warn('cache', 'miss', 'Cache miss, falling back to database', { key });

// ERROR - Failures that need investigation
log.error('database', 'connection', 'Connection failed', { error: err });

// FATAL - System cannot continue
log.fatal('startup', 'init', 'Critical dependency unavailable', { service });
```

### 3.3 Environment-Based Defaults

| Environment | Default Level | `LOG_LEVEL` Override |
|-------------|---------------|----------------------|
| Production | `info` | `LOG_LEVEL=warn` (reduce volume) |
| Development | `debug` | `LOG_LEVEL=info` (reduce noise) |
| Test | `warn` | `LOG_LEVEL=error` (minimal output) |

---

## 4. Timestamp Format

### 4.1 Production: ISO8601

```
2025-12-29T14:32:05.123Z
```

- Always UTC (Z suffix)
- Millisecond precision
- Machine-parseable
- Loki-compatible

### 4.2 Development: Time-Only

```
14:32:05
```

- Local timezone
- Second precision
- Human-scannable

### 4.3 Loki Internal: Nanoseconds

```typescript
// Loki requires nanosecond timestamps for stream ordering
const nanoTimestamp = `${Date.now()}000000`;
```

---

## 5. Service Identification

### 5.1 Canonical Service Names

| Render Service | `SERVICE_NAME` Value | Component Prefix |
|----------------|----------------------|------------------|
| `infinity-gauntlet` | `discord-bot` | `bot.*` |
| `infinity-gauntlet-security` | `security-bot` | `security.*` |
| `infinity-gauntlet-outbox` | `outbox-worker` | `outbox.*` |
| `infinity-gauntlet-cache` | `cache-worker` | `cache.*` |
| `infinity-gauntlet-data-pipeline` | `data-worker` | `data.*` |

### 5.2 Environment Variables

```yaml
# render.yaml — required for all services
envVars:
  - key: SERVICE_NAME
    value: discord-bot  # Canonical service identifier
  - key: LOG_FORMAT
    value: json         # Production: json, Development: cli
  - key: LOG_LEVEL
    value: info         # debug | info | warn | error
```

### 5.3 Runtime Detection

```typescript
// Priority order for service name
const serviceName = 
  process.env.RENDER_SERVICE_NAME ||  // Render-injected
  process.env.SERVICE_NAME ||          // Explicit config
  'unknown-service';                   // Fallback
```

---

## 6. Correlation IDs

### 6.1 Format

```
abc12345-defg-6789-hijk-lmnop1234567
```

- UUID v4 format (36 characters)
- Shortened to 8 characters in compact display
- Full ID in JSONL `correlationId` field

### 6.2 Trace Propagation

```typescript
// Start trace at Discord command entry
const ctx = startTrace({ 
  source: 'discord', 
  metadata: { interactionId: interaction.id, userId: interaction.user.id }
});

// Child operations inherit correlation
await withCorrelation(ctx.correlationId, async () => {
  // All logs here get correlationId automatically
  log.info('battle', 'start', 'Initiating battle');
});
```

### 6.3 Loki Labels for Correlation

```typescript
// Loki stream labels for querying
{
  stream: {
    service: 'discord-bot',
    level: 'info',
    component: 'battle-engine'
  },
  values: [
    [nanoTimestamp, JSON.stringify({ ...logEntry, correlationId })]
  ]
}
```

#### Grafana Query Example

```logql
{service="discord-bot"} |= "abc12345" | json | correlationId != ""
```

---

## 7. Implementation Checklist

### 7.1 Remove Emoji Usage

**File:** `src/observability/envelope/serializer.ts`

```typescript
// BEFORE (lines 107-115)
function getLevelEmoji(level: string): string {
  switch (level) {
    case LogLevel.DEBUG: return '🔍';
    case LogLevel.INFO: return '📘';
    // ...
  }
}

// AFTER
function getLevelSymbol(level: string): string {
  switch (level) {
    case LogLevel.DEBUG: return '[DEBUG]';
    case LogLevel.INFO: return '[INFO]';
    case LogLevel.WARN: return '[WARN]';
    case LogLevel.ERROR: return '[ERROR]';
    case LogLevel.FATAL: return '[FATAL]';
    default: return '[LOG]';
  }
}
```

### 7.2 Remove Box Drawing Characters

**File:** `src/shared/logging/console-renderer.ts`

```typescript
// BEFORE (lines 23-50)
const BOX = {
  TOP_LEFT: '╔',
  HORIZONTAL: '═',
  // ...
};

// AFTER
const BOX = {
  TOP_LEFT: '+',
  HORIZONTAL: '-',
  VERTICAL: '|',
  // ... ASCII equivalents
};
```

### 7.3 Standardize LOG_FORMAT

**File:** `render.yaml` (all services)

```yaml
# Production services
- key: LOG_FORMAT
  value: json    # NOT 'cli' or 'both'
```

### 7.4 Update Console Bridge

**File:** `src/observability/envelope/console.ts`

```typescript
// Ensure production detection is correct
function detectFormat(): SerializeOptions {
  // Production (Render) → JSONL for Loki
  if (process.env.RENDER || process.env.NODE_ENV === 'production') {
    return { format: 'jsonl', colorize: false };
  }
  // ... rest unchanged
}
```

---

## 8. Loki Integration

### 8.1 Log Batching

```typescript
// src/shared/logging/loki-transport.ts
const BATCH_CONFIG = {
  maxSize: 100,           // Entries per batch
  maxAgeMs: 1000,         // Flush if batch older than 1s
  flushIntervalMs: 5000,  // Force flush every 5s
};
```

### 8.2 Priority Queue

```typescript
// High-priority logs (errors, warnings) bypass normal queue
if (entry.level === 'error' || entry.level === 'fatal') {
  priorityBatch.push(entry);
} else {
  normalBatch.push(entry);
}
```

### 8.3 Sampling (High-Volume Reduction)

```typescript
// src/shared/logging/log-sampler.ts
// Only sample INFO/DEBUG, never WARN/ERROR
const samplingRates = {
  debug: 0.1,   // 10% of debug logs
  info: 0.5,    // 50% of info logs
  warn: 1.0,    // 100% of warnings
  error: 1.0,   // 100% of errors
};
```

---

## 9. Grafana Dashboard Labels

### 9.1 Standard Loki Labels

| Label | Source | Example Values |
|-------|--------|----------------|
| `service` | `SERVICE_NAME` env | `discord-bot`, `security-bot` |
| `level` | Log level | `debug`, `info`, `warn`, `error` |
| `environment` | `NODE_ENV` | `production`, `development` |
| `component` | Log component | `battle-engine`, `database` |

### 9.2 LogQL Queries

```logql
# All errors from discord-bot
{service="discord-bot", level="error"}

# Battle engine logs with correlation
{service="discord-bot", component="battle-engine"} | json | correlationId != ""

# Rate of errors over time
rate({level="error"}[5m])
```

---

## 10. Migration Path

### Phase 1: Remove Visual Clutter (Immediate) ✅ COMPLETE
- [x] Replace emojis with text symbols in serializer (`getLevelSymbol`, `getKindSymbol`)
- [x] Replace box characters with ASCII in console-renderer (BOX, STATUS, ICONS constants)
- [x] Verify all services have `LOG_FORMAT=json` in render.yaml (7/7 services updated)

### Phase 2: Standardize Correlation (Week 1) ✅ COMPLETE
- [x] Ensure all entry points call `startTrace()` — Discord handler wrapped with `startDiscordTraceAsync`
- [x] Propagate correlationId through async operations — Added `startWorkerTraceAsync` + wrapped worker executes
- [x] Add correlationId to Loki labels — Updated `buildPayload()` in loki-transport.ts

### Phase 3: Optimize Volume (Week 2)
- [ ] Tune sampling rates for INFO logs
- [ ] Implement log deduplication for repeated messages
- [ ] Add rate limiting for noisy components

---

## 11. Validation

### 11.1 Log Format Test

```typescript
// tests/logging/format.spec.ts
describe('Production Log Format', () => {
  it('should output valid JSONL', () => {
    const line = serialize(envelope, { format: 'jsonl' });
    expect(() => JSON.parse(line)).not.toThrow();
    const parsed = JSON.parse(line);
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(parsed.level).toMatch(/^(debug|info|warn|error|fatal)$/);
    expect(parsed.service).toBeDefined();
    expect(parsed.correlationId).toBeDefined();
  });

  it('should not contain emojis', () => {
    const line = serialize(envelope, { format: 'compact' });
    expect(line).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });
});
```

### 11.2 Render Dashboard Verification

```bash
# Check production logs via Render CLI
render logs -s infinity-gauntlet -f | head -5

# Expected output (each line is valid JSON):
# {"timestamp":"2025-12-29T14:32:05.123Z","level":"info",...}
```

---

## Appendix A: Environment Variable Reference

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `LOG_LEVEL` | `debug\|info\|warn\|error` | `info` (prod) / `debug` (dev) | Minimum log level |
| `LOG_FORMAT` | `json\|cli\|both\|auto` | `auto` | Output format |
| `SERVICE_NAME` | string | — | Canonical service identifier |
| `LOG_BUFFER_ENABLED` | `true\|false` | `true` | Enable batch buffering |
| `LOG_BUFFER_INTERVAL` | milliseconds | `10000` | Buffer flush interval |
| `LOG_BUFFER_BYPASS_CRITICAL` | `true\|false` | `true` | Flush ERROR/FATAL immediately |

---

## Appendix B: Loki Stream Example

```json
{
  "streams": [
    {
      "stream": {
        "service": "discord-bot",
        "level": "info",
        "environment": "production"
      },
      "values": [
        ["1735481525123000000", "{\"timestamp\":\"2025-12-29T14:32:05.123Z\",\"level\":\"info\",\"service\":\"discord-bot\",\"component\":\"battle-engine\",\"operation\":\"move\",\"message\":\"Player executed attack\",\"correlationId\":\"abc12345\",\"data\":{\"damage\":95}}"]
      ]
    }
  ]
}
```

---

**Document Author:** GitHub Copilot (DevOps Logging Specialist)  
**Review Required:** Operations Team  
**Implementation Target:** v2.0.0
