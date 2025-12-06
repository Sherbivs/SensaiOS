# ROUTER
Title: Runtime Cache Store
Purpose: On-disk caches persisted by workers and security bots between runs.
Owned Globs: Store/**
Last Updated (UTC): 2025-12-06T05:00:00Z

Notes:
- Contents are runtime-generated; purge entries via cache tooling rather than manual deletion to keep metrics consistent.
- Keep sensitive data out of the repository—only deterministic cache fixtures should ever be committed.
- When adding new cache namespaces, update eviction policies in `src/services/cache/facade.ts` and document rotation cadence here.

Subdirectories:
- ai-logs/ — AI agent session logs (development only)
- discord-cache/ — Discord security bot cache namespace; include retention windows when structure changes.
- emergency-error-logs/ — Fallback error persistence when database unavailable
- error-reports/ — AI analysis error reports (markdown format)
- logs/ — Log archive with archive/, daily/, emergency/, hourly/, insights/ subdirectories
- monitoring/ — Prometheus/Grafana metric exports
- onpremise-dev-primary/ — On-premise PostgreSQL primary cluster and snapshots (ignored from git); prefer `npm run ops:auto-bootstrap-onpremise-dev` for dependency install + refresh, or `npm run ops:bootstrap-onpremise-dev` if tooling already exists.
- onpremise-dev-experiment/ — On-premise PostgreSQL experimental cluster for migration testing (ignored from git); use `npm run ops:bootstrap-onpremise-experiment` to initialize and `npm run ops:sync-onpremise-experiment` to sync from primary or DEV.
- runtime-cache/ — General runtime cache namespace persisted by cache facade (battle-state/, encounter-state/, quest-reward/)
- security-bot-state/ — Security bot persistent state (current.json, previous.json, baselines.json, snapshots/)
- test/ — Test fixtures and isolated test databases

Root Files:
- engine-write.db — SQLite write buffer for battle logs, move usage, anomalies (synced from Write Buffer every 30s)
- guild-member-timeout-config.json — Discord timeout configuration
- restart-metrics.json — Service restart tracking

Linked Routers:
- src/services/cache/ROUTER.md — Cache recipes that hydrate and persist these stores.
- src/shared/cache/ROUTER.md — Backend implementations supplying the runtime facade.
- src/config/engine-db-config.ts — Centralized paths for engine-read.db, engine-write.db, engine-write.wal
