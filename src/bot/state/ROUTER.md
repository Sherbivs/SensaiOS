# ROUTER — src/bot/state

**Title:** Security Bot State Management  
**Purpose:** State persistence, context restoration, and security metrics for the security monitoring bot  
**Owned Globs:** `src/bot/state/**`  
**Last Updated (UTC):** 2025-12-21T00:00:00Z

## Overview

This module handles security bot state persistence, operational context restoration after restarts, and threat detection systems. The security bot maintains 7-day state history in `Store/security-bot-state/`.

## Files

| File | Purpose |
|------|---------|
| `config.ts` | Centralized configuration with fail-fast HMAC validation |
| `context.ts` | Guild monitoring context restoration after restart |
| `persistence.ts` | State save/load with snapshot management (7-day retention) |
| `roleArchive.ts` | Historical role configuration tracking (HMAC integrity) |
| `securityBaselines.ts` | Guild security baseline establishment and drift detection |
| `securityMetrics.ts` | Security metric aggregation and reporting |
| `stats.ts` | Runtime statistics collection |
| `threatDetector.ts` | Threat pattern detection and classification |
| `timeline.ts` | Security event timeline reconstruction |
| `types.ts` | TypeScript type definitions for state module |

**Deleted (2025-12-21):** `threatResponse.ts` (721 lines) — Superseded by `src/bot/security/services/integrity-sweep-scheduler.ts`

## Integration Points

- **Security Bot:** `security-bot.ts` (root) — Main consumer
- **Workers:** `src/workers/security-worker.ts` — Background monitoring
- **Store:** `Store/security-bot-state/` — Persistence directory
  - `current.json` — Active runtime state
  - `previous.json` — Backup from last restart
  - `snapshots/*.json` — Hourly backups (7-day retention)

## State Persistence

**Auto-save:** Every 5 minutes  
**Shutdown save:** SIGTERM/SIGINT triggers final state save  
**Snapshot retention:** 7 days of hourly snapshots  
**Cumulative stats:** Sweeps, alerts, permission changes survive restarts

## Notes

- All files are JavaScript (not TypeScript) for security bot isolation
- State is guild-scoped with per-guild metrics
- Threat detection uses pattern matching against known attack signatures
- Role archive enables permission change auditing

## Cross-References

- **Security Documentation:** `docs/security/ROUTER.md`
- **Operations Bible:** `docs/operations-bible/` (security monitoring section)
- **Architecture Bible:** `docs/architecture-bible/` (security subsystem)
