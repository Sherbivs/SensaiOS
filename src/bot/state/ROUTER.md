# ROUTER
Title: Security Bot State Management
Purpose: State persistence, context restoration, and security metrics for the security monitoring bot.
Owned Globs: src/bot/state/**
Last Updated (UTC): 2026-02-10T16:40:00Z

## Overview

This module handles security bot state persistence, operational context restoration after restarts, and threat detection systems. As of 2025-12-27, all state persistence uses PostgreSQL `CacheEntry` table (Database-First Architecture).

## Files

| File | Purpose |
|------|---------|
| `config.ts` | Centralized configuration with fail-fast HMAC validation (file paths @deprecated) |
| `context.ts` | Guild monitoring context restoration after restart |
| `persistence.ts` | State save/load with database-backed snapshots (7-day retention) |
| `roleArchive.ts` | Historical role configuration tracking (HMAC integrity, database storage) |
| `securityBaselines.ts` | Guild security baseline establishment and drift detection (database storage) |
| `securityMetrics.ts` | Security metric aggregation and reporting |
| `stats.ts` | Runtime statistics collection |
| `threatDetector.ts` | Threat pattern detection and classification |
| `timeline.ts` | Security event timeline reconstruction |
| `types.ts` | TypeScript type definitions for state module |

**Deleted (2025-12-21):** `threatResponse.ts` (721 lines) — Superseded by `src/bot/security/services/integrity-sweep-scheduler.ts`

## Integration Points

- **Security Bot:** `security-bot.ts` (root) — Main consumer
- **Workers:** `src/workers/security-worker.ts` — Background monitoring
- **Database:** PostgreSQL `CacheEntry` table — State persistence (Database-First Architecture)
  - `security-bot-state:current` — Active runtime state
  - `security-bot-state:previous` — Backup from last save
  - `security-bot-state:snapshot:{timestamp}` — Timestamped snapshots (7-day retention)
  - `security-bot-state:backup-{n}` — Rotating backups (0, 1, 2)
  - `security-bot-state:role-archive` — Role change archive with HMAC
  - `security-bot-state:baselines` — Security baselines with HMAC

## State Persistence (Database-First)

**Auto-save:** Every 5 minutes to `security-bot-state:current`
**Shutdown save:** SIGTERM/SIGINT triggers final state save  
**Snapshot retention:** 7 days of timestamped database snapshots  
**Cumulative stats:** Sweeps, alerts, permission changes survive restarts

**Migration Note (2025-12-27):** The previous file-based system (`Store/security-bot-state/*.json`) has been replaced with database storage. File path constants in `config.ts` are marked `@deprecated`. No /Store file writes occur for state persistence.

## Notes

- persistence.ts, roleArchive.ts, securityBaselines.ts use Prisma CacheEntry for storage
- State is guild-scoped with per-guild metrics
- Threat detection uses pattern matching against known attack signatures
- Role archive enables permission change auditing with HMAC integrity verification

## Cross-References

- **Security Documentation:** `docs/security/ROUTER.md`
- **Operations Bible:** `docs/operations-bible/` (security monitoring section)
- **Architecture Bible:** `docs/architecture-bible/` (security subsystem)
