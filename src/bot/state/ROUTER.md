# ROUTER — src/bot/state

**Title:** Security Bot State Management  
**Purpose:** State persistence, context restoration, and security metrics for the security monitoring bot  
**Owned Globs:** `src/bot/state/**`  
**Last Updated (UTC):** 2025-12-21T08:00:00Z

## Overview

This module handles security bot state persistence, operational context restoration after restarts, and threat detection systems. The security bot maintains 7-day state history in `Store/security-bot-state/`.

**Enhanced (2025-12-21):** Live memory capability with:
- **Atomic writes** — Write-to-temp-then-rename prevents corruption
- **SHA-256 checksums** — Integrity verification on load
- **Compact JSON** — 30% smaller files in production
- **Operation checkpointing** — Resume in-flight operations after crash

## Files

| File | Purpose |
|------|---------|
| `config.ts` | Centralized configuration with fail-fast HMAC validation, checkpoint settings |
| `context.ts` | Guild monitoring context restoration after restart |
| `persistence.ts` | State save/load with atomic writes, checksums, operation checkpointing |
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
  - `current.json` — Active runtime state (with checksum wrapper)
  - `previous.json` — Backup from last restart
  - `checkpoint.json` — In-flight operation checkpoint (crash recovery)
  - `snapshots/*.json` — Hourly backups (7-day retention)

## State Persistence (Live Memory)

**Auto-save:** Every 30 seconds (for live memory capability)  
**Checkpoint interval:** Every 10 seconds  
**Atomic writes:** Write to temp file, then rename (prevents corruption)  
**Checksum validation:** SHA-256 integrity check on load  
**Compact JSON:** No pretty-printing in production (30% smaller)  
**Operation tracking:** Up to 50 in-flight operations checkpointed  
**Crash recovery:** Resume operations on startup if checkpoint exists  
**Shutdown save:** SIGTERM/SIGINT triggers final state save + checkpoint clear  
**Snapshot retention:** 7 days of hourly snapshots  
**Cumulative stats:** Sweeps, alerts, permission changes survive restarts

## Key Functions

### Operation Checkpointing
```typescript
// Start tracking an operation
const opId = startOperation(state, 'sweep', { guildId: '123' }, guildId);

// Complete and remove from tracking
completeOperation(state, opId);

// Resume operations after crash
const checkpoint = await loadCheckpoint();
if (checkpoint) {
  const resumable = resumeFromCheckpoint(state, checkpoint);
  // Handle resumable operations...
}
```

## Notes

- State version: 2 (bumped for checkpoint support)
- Schema version: 1.2.0 (bumped for checksum wrapper)
- All files are JavaScript (not TypeScript) for security bot isolation
- State is guild-scoped with per-guild metrics
- Threat detection uses pattern matching against known attack signatures
- Role archive enables permission change auditing

## Cross-References

- **Security Documentation:** `docs/security/ROUTER.md`
- **Operations Bible:** `docs/operations-bible/` (security monitoring section)
- **Architecture Bible:** `docs/architecture-bible/` (security subsystem)
