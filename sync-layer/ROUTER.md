# ROUTER
Title: Sync Layer Prototype
Purpose: Worker and Discord sync utilities for legacy data synchronization.
Owned Globs: sync-layer/**
Last Updated (UTC): 2025-10-30T00:46:00Z

Notes:
- This tree hosts an experimental sync service that mirrors Discord/game data through JSON schemas.
- Keep changes isolated; production runtime relies on the TypeScript surfaces in `src/` while this layer evolves separately.

Subdirectories:
- data/ - JSON manifests (`index.json`, `meta.json`, `updates.json`) describing synced objects.
- discord/ - `sync-client.js` and hook implementations that watch Discord events and emit sync payloads.
- shared/ - Shared helpers (`io.js`, `logger.js`) consumed by the sync workers.
- worker/ - Worker entries (`api-server.js`, `commit-deltas.js`, `indexer.js`) plus schema definitions under `worker/schema/`.
