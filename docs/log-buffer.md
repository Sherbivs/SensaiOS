# Log Buffer System

## Overview

The centralized log buffer reduces console noise by collecting logs in memory and flushing them at configurable intervals (default: every 10 seconds). This creates cleaner, more readable console output by:

- **Deduplicating** identical log messages (counts occurrences instead of repeating)
- **Aggregating** similar messages together
- **Prioritizing** critical logs (errors/warnings bypass buffering by default)
- **Batching** non-critical logs for periodic flushing

## Architecture

```
┌─────────────────┐
│   Application   │
│     Logging     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│   Log Router    │─────▶│  Immediate Out   │  (errors/warns)
│   (log.ts)      │      │  (console/JSON)  │
└────────┬────────┘      └──────────────────┘
         │
         ▼
┌─────────────────┐      Every 10s
│   Log Buffer    │──────────────────┐
│  (logBuffer.ts) │                  │
└─────────────────┘                  │
         │                           ▼
         │                  ┌──────────────────┐
         └─────────────────▶│  Batch Flush     │
                            │  (deduplicated)  │
                            └──────────────────┘
```

## Quick Start

### Automatic Initialization

The log buffer is automatically initialized at application startup in `src/index.ts`:

```typescript
import { setupLogBuffer } from "./shared/logBufferInit.js";

// Initialize with defaults (10-second intervals)
setupLogBuffer();
```

### Configuration via Environment Variables

```bash
# Enable/disable buffering (default: true, false in tests)
LOG_BUFFER_ENABLED=true

# Flush interval in milliseconds (default: 10000 = 10 seconds)
LOG_BUFFER_INTERVAL=10000

# Maximum buffer size before forced flush (default: 1000)
LOG_BUFFER_MAX_SIZE=1000

# Bypass buffering for error/warn logs (default: true)
LOG_BUFFER_BYPASS_CRITICAL=true
```

### Programmatic Configuration

```typescript
import { setupLogBuffer } from "./shared/logBufferInit.js";

// Custom configuration
setupLogBuffer({
  flushIntervalMs: 5000,      // Flush every 5 seconds
  maxBufferSize: 500,          // Force flush at 500 entries
  bypassCritical: true,        // Errors/warns bypass buffer
  enabled: true                // Enable buffering
});
```

## Usage Examples

### Standard Logging (Buffered)

```typescript
import { log } from "./shared/log.js";

// These will be buffered and flushed every 10 seconds
log.info("User action completed", { userId: 123, action: "login" });
log.debug("Cache hit", { key: "pokemon:25" });
```

### Critical Logging (Immediate)

```typescript
// Errors and warnings bypass the buffer by default
log.error("Database connection failed", error);
log.warn("High memory usage detected", { heapUsed: "512MB" });
```

### Deduplication Example

```typescript
// If this log is called 50 times within 10 seconds:
for (let i = 0; i < 50; i++) {
  log.info("Processing item", { count: i });
}

// Output after 10 seconds (single consolidated entry):
// {
//   "level": "info",
//   "msg": "Processing item",
//   "_buffered": {
//     "count": 50,
//     "firstSeen": "2025-11-09T12:00:00.000Z",
//     "lastSeen": "2025-11-09T12:00:09.500Z",
//     "durationMs": 9500
//   }
// }
```

## Advanced Usage

### Manual Flush

```typescript
import { getLogBuffer } from "./shared/logBuffer.js";

const buffer = getLogBuffer();
if (buffer) {
  buffer.flush(); // Flush immediately
}
```

### Pause/Resume Buffering

```typescript
import { getLogBuffer } from "./shared/logBuffer.js";

const buffer = getLogBuffer();

// Pause buffering (logs go through immediately)
buffer?.pause();

// ... do time-sensitive operations ...

// Resume buffering
buffer?.resume();
```

### Get Buffer Statistics

```typescript
import { getLogBuffer } from "./shared/logBuffer.js";

const buffer = getLogBuffer();
const stats = buffer?.getStats();
// { buffered: 42, totalMessages: 156 }
```

### Disable Buffering Temporarily

```typescript
import { disableLogBuffer, enableLogBuffer } from "./shared/logBufferInit.js";

// Disable for debugging
disableLogBuffer();

// ... immediate log output ...

// Re-enable
enableLogBuffer();
```

## Production Recommendations

### Render.com Deployment

Add to `render.yaml` for all services:

```yaml
envVars:
  - key: LOG_BUFFER_ENABLED
    value: "true"
  - key: LOG_BUFFER_INTERVAL
    value: "10000"  # 10 seconds
  - key: LOG_BUFFER_BYPASS_CRITICAL
    value: "true"   # Errors/warns always immediate
```

### Local Development

For debugging with immediate output:

```bash
LOG_BUFFER_ENABLED=false npm start
```

Or in your `.env` file:

```env
LOG_BUFFER_ENABLED=false
```

### CI/Test Environments

Buffering is automatically disabled in:
- `NODE_ENV=test`
- `CI=true`

## Output Format

### Buffered Log Entry

```json
{
  "t": "2025-11-09T12:22:32.000Z",
  "level": "info",
  "msg": "Database query completed",
  "env": "production",
  "userId": 123,
  "query": "SELECT * FROM users",
  "_buffered": {
    "count": 15,
    "firstSeen": "2025-11-09T12:22:22.000Z",
    "lastSeen": "2025-11-09T12:22:31.500Z",
    "durationMs": 9500
  }
}
```

### Flush Summary

```json
{
  "t": "2025-11-09T12:22:32.000Z",
  "level": "info",
  "msg": "📦 Log buffer flush: 12 unique messages, 87 total",
  "env": "production"
}
```

## Performance

- **Memory overhead**: ~200 bytes per unique log entry
- **CPU overhead**: Negligible (simple hashing + map operations)
- **Flush time**: <5ms for 1000 entries
- **Max memory**: Bounded by `maxBufferSize` (default: 1000 entries ≈ 200KB)

## Troubleshooting

### Logs not appearing

1. Check if buffering is enabled: `LOG_BUFFER_ENABLED=true`
2. Wait for flush interval (default 10 seconds)
3. Check log level: `LOG_LEVEL=debug`

### Immediate output needed

```bash
# Disable buffering
LOG_BUFFER_ENABLED=false npm start

# Or reduce interval to 1 second
LOG_BUFFER_INTERVAL=1000 npm start
```

### Memory concerns

```bash
# Reduce buffer size
LOG_BUFFER_MAX_SIZE=100

# Reduce flush interval
LOG_BUFFER_INTERVAL=5000
```

## API Reference

### `setupLogBuffer(config?)`

Initialize the global log buffer.

**Parameters:**
- `config` (optional): Partial configuration object

**Example:**
```typescript
setupLogBuffer({ flushIntervalMs: 5000 });
```

### `getLogBuffer()`

Get the global log buffer instance.

**Returns:** `LogBuffer | null`

### `destroyLogBuffer()`

Destroy and cleanup the global log buffer.

### `LogBuffer` Class Methods

- `add(level, message, context?)` - Add log to buffer
- `flush()` - Manually flush buffer
- `pause()` - Pause buffering (immediate output)
- `resume()` - Resume buffering
- `size()` - Get current buffer size
- `getStats()` - Get buffer statistics
- `configure(config)` - Update configuration
- `destroy()` - Cleanup and shutdown

## Migration Guide

### Before (Direct Logging)

```typescript
log.info("Processing started");
log.info("Step 1 complete");
log.info("Step 2 complete");
log.info("Processing finished");
```

**Console output (immediate):**
```
[INFO] Processing started
[INFO] Step 1 complete
[INFO] Step 2 complete
[INFO] Processing finished
```

### After (Buffered Logging)

Same code, but output is batched:

**Console output (after 10 seconds):**
```
📦 Log buffer flush: 4 unique messages, 4 total
[INFO] Processing started
[INFO] Step 1 complete
[INFO] Step 2 complete
[INFO] Processing finished
```

### With Deduplication

```typescript
for (let i = 0; i < 100; i++) {
  log.info("Heartbeat");
}
```

**Console output (after 10 seconds):**
```
📦 Log buffer flush: 1 unique messages, 100 total
[INFO] Heartbeat (_buffered: { count: 100, durationMs: 5000 })
```

## Best Practices

1. **Keep error/warn immediate**: Use default `bypassCritical: true`
2. **Tune interval for your workload**: 10s for low-frequency, 5s for high-frequency
3. **Monitor buffer size**: Check stats periodically to ensure buffer isn't growing unbounded
4. **Disable in debugging**: Use `LOG_BUFFER_ENABLED=false` when troubleshooting
5. **Flush on shutdown**: Automatically handled by `destroyLogBuffer()` in graceful shutdown

## License

Part of the Infinity Gauntlet project.
