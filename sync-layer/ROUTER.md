# ROUTER
Title: Sync Layer Prototype
Purpose: Worker and Discord sync utilities for legacy data synchronization.
Owned Globs: sync-layer/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- This tree hosts an experimental sync service that mirrors Discord/game data through JSON schemas.
- Keep changes isolated; production runtime relies on the TypeScript surfaces in `src/` while this layer evolves separately.

Subdirectories:
- data/ - JSON manifests (`index.json`, `meta.json`, `updates.json`) describing synced objects; see `sync-layer/data/ROUTER.md`.
- discord/ - `sync-client.js` and hook implementations emitting sync payloads; see `sync-layer/discord/ROUTER.md`.
	- hooks/ - Event-specific Discord hooks; see `sync-layer/discord/hooks/ROUTER.md`.
- shared/ - Shared helpers (`io.js`, `logger.js`) consumed by the sync workers; see `sync-layer/shared/ROUTER.md`.
- worker/ - Worker entries (`api-server.js`, `commit-deltas.js`, `indexer.js`) plus schema definitions; see `sync-layer/worker/ROUTER.md`.
	- schema/ - JSON schema definitions validating payloads; see `sync-layer/worker/schema/ROUTER.md`.
