# ROUTER
Title: Console System
Purpose: Console I/O handling - capture and rendering
Owned Globs: src/shared/console/**
Last Updated (UTC): 2025-06-15T00:00:00Z

Notes:
- Created during Phase 6 reorganization
- Bidirectional console pipeline: capture → DB → render
- Imports from ../../workers/database/ for TimescaleDB persistence
- Exports unified API via index.ts barrel

Areas:
- console-interceptor.ts — Captures console.log/warn/error, buffers, writes to TimescaleDB
- console-renderer.ts — Queries DB, formats beautifully for Render console output
- index.ts — Barrel export for all console system functionality

Data Flow:
```
CAPTURE:                         RENDER:
console.log()                    TimescaleDB
    ↓                               ↓
console-interceptor.ts           console-renderer.ts
    ↓                               ↓
Buffer → TimescaleDB             Query → Beautiful Console
```

Dependencies:
- ../../workers/database/index.js (TimescaleDBWorker for persistence)
- ../../generated/prisma/client.js (PrismaClient type)

Consumers:
- ../observability.ts (imports from ./console/index.js)
