# ROUTER
Title: Database Worker Module
Purpose: Centralized database access layer with intelligent caching, write buffering, and comprehensive monitoring.
Owned Globs: src/workers/database/**
Last Updated (UTC): 2026-02-10T16:40:00Z

## Overview

This module provides specialized database workers for different persistence tiers (Engine Read-DB, Engine Write-DB, PROD PostgreSQL, TimescaleDB). Each worker implements caching strategies, write buffering, and health monitoring.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Module exports and public API |
| `types.ts` | TypeScript interfaces for workers, caches, buffers, metrics |
| `base-worker.ts` | Abstract base class with common worker functionality |
| `engine-read-worker.ts` | Read-optimized worker for game data queries |
| `engine-write-worker.ts` | Write-buffered worker for game state persistence |
| `prod-postgres-worker.ts` | Production PostgreSQL operations |
| `timescaledb-worker.ts` | Time-series data handling (metrics, analytics) |
| `strategies.ts` | Cache eviction (LRU), write buffer, circuit breaker strategies |
| `protocols.md` | Worker communication and coordination protocols |

## Worker Types

### Engine Read Worker
- **Purpose:** Fast reads for active game sessions
- **Cache:** LRU with 20 MB limit
- **SLA:** <1μs cache hits, <50μs cache misses

### Engine Write Worker
- **Purpose:** Buffered writes for game state changes
- **Buffer:** 10k entry cap with 75% backpressure threshold
- **Flush:** Periodic (5s) or on threshold

### PROD Postgres Worker
- **Purpose:** Production database operations
- **Target:** CLOUD-PROD-MASTER (PROD_DATABASE_URL)
- **Features:** Connection pooling, query optimization

### TimescaleDB Worker
- **Purpose:** Time-series metrics and analytics
- **Features:** Hypertable compression, retention policies

## Integration Points

- **Services:** `src/services/database/` — Higher-level database abstractions
- **Cache:** `src/services/cache/` — L1 cache coordination
- **Monitoring:** `src/services/monitoring/` — Health metrics, error tracking
- **Event Bus:** `src/shared/event-bus.ts` — Worker status events

## Configuration

Workers read configuration from:
- Environment variables (database URLs)
- `src/workers/database/types.ts` — Default configs
- Runtime overrides via worker constructors

## Notes

- All workers implement `DatabaseWorker` interface from `types.ts`
- Health checks emit via Event Bus with `correlationId`
- Circuit breaker prevents cascade failures
- Write buffer uses hybrid strategy (time + count triggers)

## Cross-References

- **Architecture Bible:** `docs/architecture-bible/03-worker-architecture.md`
- **Operations Bible:** `docs/operations-bible/database-operations-runbook-comprehensive.md`
- **Database Services:** `src/services/database/ROUTER.md`
