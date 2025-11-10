# Error Dashboard Command (/ops errors)

**Phase:** Error Detection System (Task 8/13)  
**Status:** ✅ COMPLETE  
**Created:** 2025-11-09  
**Build:** PASSING (0 errors, 0 warnings)

## Overview

Implements the `/ops errors` command for interactive error analysis and dashboard visualization. Provides administrators with real-time insights into error patterns, recovery rates, trends, and learning-based predictions.

## Implementation

### Command Definition (`src/commands/ops.js`)

Added `errors` subcommand with three optional filters:

```javascript
.addSubcommand((sub) =>
  sub
    .setName('errors')
    .setDescription('View comprehensive error detection dashboard with learning insights')
    .addStringOption((opt) =>
      opt
        .setName('severity')
        .setDescription('Filter by severity level')
        .setRequired(false)
        .addChoices(
          { name: 'CRITICAL', value: 'CRITICAL' },
          { name: 'HIGH', value: 'HIGH' },
          { name: 'MEDIUM', value: 'MEDIUM' },
          { name: 'LOW', value: 'LOW' }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName('category')
        .setDescription('Filter by error category')
        .setRequired(false)
        .addChoices(
          { name: 'DATABASE', value: 'DATABASE' },
          { name: 'DISCORD', value: 'DISCORD' },
          { name: 'ENGINE', value: 'ENGINE' },
          { name: 'WORKER', value: 'WORKER' },
          { name: 'CACHE', value: 'CACHE' },
          { name: 'UNKNOWN', value: 'UNKNOWN' }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName('since')
        .setDescription('Time period (e.g., 1h, 6h, 24h, 7d, 30d)')
        .setRequired(false)
    )
)
```

### Handler Implementation (`src/bot/ops/admin.ts`)

Added `errors` subcommand handler (lines 830-1018) with 188 lines of logic:

**Features:**
- **Duration Parsing:** Supports `1h`, `6h`, `24h`, `7d`, `30d` formats
- **Error Collection:** Queries `errorTracker.getErrorStats()` and `errorTracker.getRecentErrors()`
- **Filtering:** Applies severity, category, and time-based filters
- **Trend Analysis:** Compares current period vs. previous period
- **Top Errors:** Ranks by frequency (top 10 most common)
- **Critical Errors:** Shows recent CRITICAL + HIGH severity (last 5)
- **Recovery Rates:** Calculates success percentage from recovery attempts
- **Learning Insights:** Displays time patterns, correlations, recovery strategies from `learningMetadata`

**Response Sections:**

1. **Summary Statistics:**
   - Total unique errors
   - Total occurrences
   - Error rate per hour
   - Trend vs. previous period (📈 +X%, 📉 -X%, ➡️ 0%)

2. **Severity Breakdown:**
   - CRITICAL, HIGH, MEDIUM, LOW counts

3. **Category Breakdown:**
   - DATABASE, DISCORD, ENGINE, WORKER, CACHE, UNKNOWN counts

4. **Top 10 Most Frequent Errors:**
   - Fingerprint (first 8 chars)
   - Error name
   - Occurrence count
   - Last seen (time ago)

5. **Recent Critical/High Errors:**
   - Last 5 CRITICAL or HIGH severity
   - Severity level
   - Error name
   - Message preview (60 chars)
   - Time since occurrence

6. **Recovery Success Rates:**
   - Overall percentage
   - Attempts vs. successes

7. **Learning Insights:**
   - Time patterns (peak hour detection)
   - Correlations (temporal relationships)
   - Best recovery strategies (effectiveness ranking)
   - Falls back to "Waiting for hourly analysis..." if no metadata

**Helper Function:**

```typescript
function formatTimeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

### Imports Added

```typescript
// Error Detection modules (Phase 9-12)
import { errorTracker } from "../../services/error-tracker.js";
import { errorLearning } from "../../services/error-learning.js";
import type { ErrorSeverity, ErrorCategory } from "../../services/error-tracker.js";
```

## Usage Examples

### Basic Usage

```bash
/ops errors
# Shows all errors from last 24h (default)
```

### Severity Filter

```bash
/ops errors severity:CRITICAL
# Shows only CRITICAL errors from last 24h
```

### Category Filter

```bash
/ops errors category:DATABASE
# Shows only DATABASE errors from last 24h
```

### Time Period

```bash
/ops errors since:7d
# Shows all errors from last 7 days
```

### Combined Filters

```bash
/ops errors severity:HIGH category:DISCORD since:1h
# Shows HIGH severity DISCORD errors from last hour
```

## Output Example

```
🚨 **Error Detection System Dashboard**
Period: Last 24h (since 2025-11-08T12:00:00Z)

**📊 Summary Statistics**
• Total unique errors: 12
• Total occurrences: 47
• Error rate: ~2/hour
• Trend: 📈 +15% vs previous 24h

**By Severity:**
• CRITICAL: 3
• HIGH: 8
• MEDIUM: 24
• LOW: 12

**By Category:**
• DATABASE: 15
• DISCORD: 10
• WORKER: 12
• CACHE: 8
• UNKNOWN: 2

**🔥 Top 10 Most Frequent Errors**
1. `a7b3c9d1` DatabaseConnectionError • Count: 8 • Last: 15m ago
2. `f2e4d6c8` DiscordAPIError[50013] • Count: 6 • Last: 1h ago
3. `c9a1b3e5` CacheCorruptionError • Count: 5 • Last: 3h ago
...

**⚠️ Recent Critical/High Errors**
1. [CRITICAL] `a7b3c9d1` DatabaseConnectionError • 15m ago
   └─ Connection timeout after 5000ms (pool exhausted)
2. [HIGH] `f2e4d6c8` DiscordAPIError[50013] • 1h ago
   └─ Missing permissions: SEND_MESSAGES
...

**🔧 Recovery Success Rates**
• Overall: 85% (17/20 attempts)

**🧠 Learning Insights**
• Time pattern detected: Peak at hour 14 (~5.2 errors/hour)
• Correlation found: `f2e4d6c8` follows within 300000ms
• Best recovery: "exponential-backoff-retry" (HIGH effectiveness)

*Use filters: `--severity critical`, `--category database`, `--since 7d`*
```

## Database Schema Integration

Uses `ErrorLog` table fields:

- `errorName` (not `name`) — Error class name
- `errorMessage` (not `message`) — Error message text
- `lastSeen` (not `timestamp`) — Most recent occurrence
- `severity` — CRITICAL, HIGH, MEDIUM, LOW
- `category` — DATABASE, DISCORD, ENGINE, WORKER, CACHE, UNKNOWN
- `fingerprint` — Unique error identifier (SHA-256)
- `occurrenceCount` — Total times seen
- `recoveryAttempted` — Number of recovery attempts
- `recoverySuccess` — Number of successful recoveries
- `learningMetadata` — JSONB with time patterns, correlations, strategies

## Performance

- **Deferred Reply:** Uses `interaction.deferReply()` for analysis time
- **Filtering:** Client-side filtering on 100 recent errors (fast)
- **Pagination:** Limits top errors to 10, critical errors to 5
- **Message Length:** Truncates to 2000 chars (Discord limit)

## Testing Checklist

- [ ] Command registration in Discord (`npm run register-commands`)
- [ ] Default behavior (`/ops errors` shows 24h data)
- [ ] Severity filter (`--severity CRITICAL`)
- [ ] Category filter (`--category DATABASE`)
- [ ] Time period parsing (`--since 7d`)
- [ ] Combined filters work together
- [ ] Empty state (no errors in period)
- [ ] Learning insights display when available
- [ ] Learning insights graceful fallback (no metadata yet)
- [ ] Message truncation (> 2000 chars)
- [ ] Admin-only access (non-admins rejected)

## Integration Points

- **ErrorTracker Service:** Queries statistics and recent errors
- **Error Learning Worker:** Provides `learningMetadata` insights
- **Logger Integration:** Errors displayed in ERROR MONITORING section
- **Discord Bot:** Routed via `handleOpsCommand()` in `src/bot/ops/admin.ts`

## Next Steps (Task 9: Codebase Integration)

After command is deployed and tested:

1. **Add errorTracker.captureError() to all catch blocks:**
   - Search: `grep -r "} catch" src/`
   - Priority files:
     - `src/bot/daily/*.ts`
     - `src/bot/wilds/*.ts`
     - `src/services/*.ts`
     - `src/core/*.ts`

2. **Replace console.error() with errorTracker:**
   - Current: `console.error("Failed:", err);`
   - After: `errorTracker.captureError(err, { category: "WORKER", context: { ... } });`

3. **Add Promise.catch() handlers:**
   - Unhandled promise rejections
   - Async function calls without try-catch

4. **Enrich context:**
   - Add userId, guildId, operation, input to context
   - Include relevant identifiers for debugging

## Files Modified

1. `src/commands/ops.js` (+42 lines) — Command definition
2. `src/bot/ops/admin.ts` (+191 lines) — Handler implementation
   - Lines 33-36: Imports
   - Lines 830-1018: Handler logic
   - Lines 1020-1028: Helper function

**Total:** 233 lines added

## Build Status

✅ **PASSING**
- TypeScript: 0 errors
- ESLint: 0 warnings
- Prisma: Client generated successfully

## Documentation Status

✅ **COMPLETE**
- This file: Comprehensive command documentation
- `docs/error-boundaries-implementation.md`: Global error handling (Task 5)
- `docs/error-monitoring-logger-integration.md`: Logger integration (Task 6)
- `docs/error-detection-system.md`: Overall architecture (Task 1)

---

**Related Tasks:**
- Task 7 (COMPLETE): Error learning and pattern detection
- Task 9 (NEXT): Integrate ErrorTracker throughout codebase
- Task 10 (PENDING): Error alerting and escalation
- Task 11 (PENDING): Error recovery automation
- Task 12 (PENDING): Error testing and validation
