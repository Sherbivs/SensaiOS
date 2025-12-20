# ROUTER — Unified Logging Facade

**Purpose:** Canonical import path for all logging operations  
**Owner:** Cleanup-Agent  
**Created:** 2025-12-20  
**Last Updated (UTC):** 2025-12-20T18:00:00Z

---

## Overview

This directory provides the unified logger facade for the Pokemon Infinity Gauntlet codebase. It consolidates multiple logger implementations under a single canonical import path.

## Migration Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ COMPLETE | Facade created |
| Phase 2 | 🔄 PENDING | Batch migrations (5 batches) |
| Phase 3 | ⏸️ PENDING | Deprecation and cleanup |

## Architecture

```
src/shared/logging/
├── index.ts          ← Unified facade (THIS FILE)
│
├── Delegates to:
│   ├── ../logger.ts         ← DB-first logging (canonical)
│   └── ../../utils/logger.ts ← Stats display + auto-refresh
│
└── NOT included:
    └── ../../utils/intelligent-logger.ts ← AI analysis (specialized)
```

## Import Paths

### Canonical (Recommended for new code)
```typescript
import { log, report, getLogger } from '../shared/logging/index.js';
```

### Legacy (Being migrated)
```typescript
// DEPRECATED: Use shared/logging instead
import { log } from '../utils/logger.js';        // 18 files
import { log } from '../shared/logger.js';       // 23 files
```

### Specialized (Keep separate)
```typescript
// For AI-enhanced analysis only
import logger from '../utils/intelligent-logger.js';  // 4 files
```

## Files

| File | Lines | Purpose |
|------|-------|---------|
| `index.ts` | ~90 | Unified facade with re-exports |

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

## Migration Batches

| Batch | Files | Target | Status |
|-------|-------|--------|--------|
| 1 | 12 | `src/services/` | ⏸️ Pending |
| 2 | 15 | `src/bot/` | ⏸️ Pending |
| 3 | 6 | `src/commands/` + `src/lib/` | ⏸️ Pending |
| 4 | 4 | `src/workers/` + `src/shared/` | ⏸️ Pending |
| 5 | 3 | Entry points | ⏸️ Pending |

## Cross-References

- **Meeting #7:** `docs/projects/cleanup/2025-12-20-consolidation-meeting-7-high-level-strategy.md`
- **Meeting #9:** `docs/projects/cleanup/2025-12-20-consolidation-meeting-9-high-level-execution.md`
- **Shared Logger:** `src/shared/logger.ts`
- **Utils Logger:** `src/utils/logger.ts`
- **Intelligent Logger:** `src/utils/intelligent-logger.ts`

---

**Notes:**
- Facade uses re-exports to avoid code duplication
- Migration proceeds incrementally per batch
- Build verified after facade creation
