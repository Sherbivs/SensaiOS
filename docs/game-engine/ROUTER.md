# ROUTER
Title: Game Engine Documentation
Purpose: Battle engine, encounter system, PBSL, event tracking, and engine database.
Owned Globs: docs/game-engine/**
Last Updated (UTC): 2025-11-10T00:00:00Z

Notes:
- Core game engine documentation including battle system, encounter mechanics
- Engine database replication architecture (Phase 17-22)
- Deterministic battle fixtures and provenance tracking
- Event tracking for gameplay analytics

Key Documents:
- **engine-db-replication.md** - Bidirectional Engine DB architecture (Phase 17-22)
  * Read/write split: Engine Read-DB (static Pokemon data) vs Write-DB (gameplay outcomes)
  * 3-tier caching: L1 Cache (Map, <1μs) → Read-DB (SQLite, ~50ms) → PROD (PostgreSQL)
  * Write buffering: In-memory queues → Write-DB → Validator → PROD upload
  * Performance: 10-100x faster than remote PostgreSQL queries
- **engine-cache-safety.md** - Engine cache safety guarantees and defensive copies
  * LRU eviction (500 Pokemon, 200 Moves) for 60% memory reduction
  * Defensive copies prevent mutation of cached data
  * Automatic integrity checks and corruption detection
- **engine-db-persistence-opportunities.md** - Engine DB disk persistence migration
  * sql.js (in-memory) → better-sqlite3 (disk-backed) for 78% memory reduction
  * Persistent WAL for crash recovery
  * Migration strategy and compatibility considerations
- **battle-dm-flow.md** - Battle DM flow and interaction patterns
  * Turn-based battle system with button interactions
  * DM message flow and state management
  * Victory/forfeit/escape outcomes
- **PBSL.md** - Provenance and validation notes for deterministic battle fixtures
  * Pokemon Battle Simulation Library fixtures
  * Deterministic battle replay and validation
  * Test fixture generation and verification
- **event-tracking-schema.md** - Event tracking schema for gameplay analytics
  * Battle events, encounter events, trainer events
  * Analytics schema and data pipeline
  * Aggregation and reporting queries

Engine DB Components (Phase 17-22):
- **engine-cache.ts** (661 lines) - L1 in-memory cache with LRU eviction
- **engine-write-buffer.ts** (476 lines) - In-memory write queues with backpressure
- **engine-read-db.ts** (470 lines) - Read-only SQLite database for Pokemon data
- **engine-write-db.ts** (697 lines) - Append-only SQLite with WAL for battle logs
- **4 Background Workers** - Cache refresh, buffer flush, sync, validation

Cross-References:
- See src/services/engine-*.ts for engine service implementations
- See src/workers/engine-workers.ts for background workers
- See src/core/battle/ for battle engine implementation
- See src/core/encounter/ for encounter engine implementation
