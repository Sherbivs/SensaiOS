# ROUTER
Title: Sync Worker Schemas
Purpose: JSON schema definitions that validate Discord sync payloads before workers commit state.
Owned Globs: sync-layer/worker/schema/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Schemas define the shape of envelopes emitted by Discord hooks so workers can reject malformed payloads early.
- Update these definitions in lockstep with hook changes and worker ingestion logic.

Key Files:
- index-schema.json — Canonical schema describing the worker ingest payload for the prototype.

Linked Routers:
- sync-layer/worker/ROUTER.md — Worker entrypoints that consume the schemas.
- sync-layer/discord/hooks/ROUTER.md — Hooks that must satisfy the schema.
