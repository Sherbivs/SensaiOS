# ROUTER
Title: Sync Layer Worker Entries
Purpose: Background workers that consume Discord deltas and commit them to mirrored storage.
Owned Globs: sync-layer/worker/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- `api-server.js`, `commit-deltas.js`, and `indexer.js` implement the prototype ingest loop.
- Worker scripts expect the JSON envelopes declared under `sync-layer/data/` and shared helpers in `sync-layer/shared/`.

Subdirectories:
- schema/ — JSON schema references used to validate sync payloads before writing; see sync-layer/worker/schema/ROUTER.md for details and update alongside worker changes.
