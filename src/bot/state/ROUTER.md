# ROUTER — src/bot/state

**Title:** Security Bot State Management  
**Purpose:** State persistence, context restoration, and security metrics for the security monitoring bot  
**Owned Globs:** `src/bot/state/**`  
**Last Updated (UTC):** 2025-12-02T00:00:00Z

## Overview

This module handles security bot state persistence, operational context restoration after restarts, and threat detection/response systems. The security bot maintains 7-day state history in `Store/security-bot-state/`.

## Files

| File | Purpose |
|------|---------|
| `context.js` | Guild monitoring context restoration after restart |
| `persistence.js` | State save/load with snapshot management (7-day retention) |
| `roleArchive.js` | Historical role configuration tracking |
| `securityBaselines.js` | Guild security baseline establishment and drift detection |
| `securityMetrics.js` | Security metric aggregation and reporting |
| `stats.js` | Runtime statistics collection |
| `threatDetector.js` | Threat pattern detection and classification |
| `threatResponse.js` | Automated threat response actions |
| `timeline.js` | Security event timeline reconstruction |

## Integration Points

- **Security Bot:** `security-bot.js` (root) — Main consumer
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
