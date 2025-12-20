# ROUTER — Unified Logging Facade

**Purpose:** Canonical import path for all logging operations  
**Owner:** Cleanup-Agent  
**Created:** 2025-12-20  
**Last Updated (UTC):** 2025-12-20T22:00:00Z

---

## Overview

This directory provides the unified logger facade for the Pokemon Infinity Gauntlet codebase. It consolidates multiple logger implementations under a single canonical import path, featuring the "Infinity Console" visual output system.

## Migration Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ COMPLETE | Facade created |
| Phase 2 | ✅ COMPLETE | 41 files migrated (Meeting #9) |
| Phase 3 | ✅ COMPLETE | Visual overhaul (Meeting #10) |
| Phase 4 | ✅ COMPLETE | intelligent-logger.ts DELETED (Meeting #11) |

## Architecture

```
src/shared/logging/
├── index.ts              ← Unified facade (exports)
├── console-renderer.ts   ← "Infinity Console" visual system
│
└── Delegates to:
    ├── ../logger.ts          ← DB-first logging (canonical)
    └── ../../utils/logger.ts ← Stats display + auto-refresh
```

## Infinity Console Design

Visual output system designed by Creative Specialist Zara Okonkwo (Meeting #10):

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  ∞  I N F I N I T Y   G A U N T L E T                              v2.5.0  ║
╚══════════════════════════════════════════════════════════════════════════════╝

┌─ 💾 DATABASE ────────────────────────────────────────────────────────────────┐
│  ● CLOUD-PROD    ✓ Online   │  23ms │ Direct PostgreSQL                     │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ 📊 RESOURCES ───────────────────────────────────────────────────────────────┐
│  RAM  ▓▓▓░░░░░░░░░░░░░  337 MB / 2 GB  (17%)                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Import Paths

### Canonical (Recommended for new code)
```typescript
import { log, report, getLogger, ConsoleRenderer } from '../shared/logging/index.js';
```

### Legacy (Being migrated)
```typescript
// DEPRECATED: Use shared/logging instead — ALL MIGRATED
import { log } from '../utils/logger.js';        // 0 files (MIGRATED!)
import { log } from '../shared/logger.js';       // 0 files (MIGRATED!)
```

## Files

| File | Lines | Purpose |
|------|-------|---------|
| `index.ts` | ~130 | Unified facade with re-exports |
| `console-renderer.ts` | ~400 | Infinity Console visual system |

## Exports

### From `shared/logger.ts` (DB-first)
- `log` — Legacy-compatible logging function
- `getLogger()` — Modern logger factory
- `resetLogger()` — Reset logger state
- `generateCorrelationId()` — Create correlation IDs
- `errorContext()` — Build error context objects
- `measureOperation()` — Measure async operations

### From `utils/logger.ts` (Stats)
- `report()` — Display stats once
- `startAutoRefresh()` — Start periodic updates
- `stopAutoRefresh()` — Stop periodic updates
- `getFormattedStats()` — Get stats as string
- `LOG_LABEL` — Log level labels

### From `console-renderer.ts` (Infinity Console)
- `ConsoleRenderer` — Full renderer object
- `renderDashboard()` — Full visual dashboard
- `renderStatusLine()` — Compact status line
- `progressBar()` — ASCII progress bar
- `formatLogEntry()` — Format log stream entry
- `success/info/warn/error()` — Quick log formatters

## Usage Examples

### Basic Logging
```typescript
import { log } from '../shared/logging/index.js';

log('info', 'Message here', { context: 'data' });
log.warn('Warning message');
log.error('Error message', { error: err });
```

### Modern Logger
```typescript
import { getLogger } from '../shared/logging/index.js';

const logger = getLogger();
logger.info('bot', 'start', 'Bot started', { version: '1.0' });
```

### Stats Display
```typescript
import { report, startAutoRefresh } from '../shared/logging/index.js';

report();  // Display stats once
startAutoRefresh();  // Start periodic updates (15s default)
```

### Infinity Console (Visual Output)
```typescript
import { 
  ConsoleRenderer, 
  renderDashboard, 
  progressBar,
  formatLogEntry 
} from '../shared/logging/index.js';

// Full dashboard
renderDashboard({
  databases: { prod: { status: 'online', latency: 23 }, ... },
  discord: { status: 'online', guilds: 1, users: 42 },
  resources: { ramUsedMB: 337, ramTotalMB: 2048 }
});

// Progress bar
console.log(`RAM ${progressBar(337, 2048)} 17%`);
// Output: RAM ▓▓▓░░░░░░░░░░░░░ 17%

// Formatted log entry
console.log(formatLogEntry({ 
  level: 'info', 
  message: 'Service ready',
  timestamp: new Date()
}));
// Output: [16:15:23] ℹ️ INFO — Service ready
```

## Migration Progress (Meeting #9)

| Batch | Files | Status |
|-------|-------|--------|
| Batch 1 | 12 files → `src/services/` | ✅ COMPLETE |
| Batch 2 | 15 files → `src/bot/` | ✅ COMPLETE |
| Batch 3 | 6 files → `src/commands/` + `src/lib/` | ✅ COMPLETE |
| Batch 4 | 4 files → `src/workers/` + `src/shared/` | ✅ COMPLETE |
| Batch 5 | 4 files → Entry points | ✅ COMPLETE |
| **Total** | **41 files** | **✅ ALL MIGRATED** |

## Cross-References

- **Meeting #9:** `docs/projects/cleanup/2025-12-20-consolidation-meeting-9-high-level-execution.md`
- **Meeting #10:** `docs/projects/cleanup/2025-12-20-consolidation-meeting-10-logger-visual-overhaul.md`
- **Meeting #11:** `docs/projects/cleanup/2025-12-20-consolidation-meeting-11-architecture-analysis.md`
- **Shared Logger:** `src/shared/logger.ts`
- **Utils Logger:** `src/utils/logger.ts`
- **Console Renderer:** `src/shared/logging/console-renderer.ts`

---

**Notes:**
- Facade uses re-exports to avoid code duplication
- All 41 legacy files migrated in Meeting #9
- Infinity Console visual system added in Meeting #10
- intelligent-logger.ts DELETED in Meeting #11 (986 lines removed)
- Build verified after each change
