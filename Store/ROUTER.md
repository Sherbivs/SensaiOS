# ROUTER
Title: Runtime Cache Store
Purpose: On-disk caches persisted by workers and security bots between runs.
Owned Globs: Store/**
Last Updated (UTC): 2025-11-06T04:45:00Z

Notes:
- Contents are runtime-generated; purge entries via cache tooling rather than manual deletion to keep metrics consistent.
- Keep sensitive data out of the repository—only deterministic cache fixtures should ever be committed.
- When adding new cache namespaces, update eviction policies in `src/services/cache/facade.ts` and document rotation cadence here.

Subdirectories:
- discord-cache/ — Discord security bot cache namespace; include retention windows when structure changes.
- runtime-cache/ — General runtime cache namespace persisted by cache facade; describe eviction strategy alongside code changes.
- db/ — Local Postgres fallback cluster and snapshots (ignored from git); prefer `npm run ops:auto-bootstrap-local-db` for dependency install + refresh, or `npm run ops:bootstrap-local-db` if tooling already exists.

Linked Routers:
- src/services/cache/ROUTER.md — Cache recipes that hydrate and persist these stores.
- src/shared/cache/ROUTER.md — Backend implementations supplying the runtime facade.
