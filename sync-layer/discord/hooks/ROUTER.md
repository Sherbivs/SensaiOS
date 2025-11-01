# ROUTER
Title: Sync Discord Event Hooks
Purpose: Event-specific Discord handlers that publish sync payloads for the prototype pipeline.
Owned Globs: sync-layer/discord/hooks/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Hooks receive raw Discord.js events from `sync-client.js` and normalize them into JSON envelopes stored under `sync-layer/data/`.
- Keep hook outputs aligned with the schemas defined in `sync-layer/worker/schema/` so workers accept the payloads without fallback.

Key Files:
- cache-hooks.js — Prototype hook that mirrors cache-relevant Discord updates for downstream processing.

Linked Routers:
- sync-layer/discord/ROUTER.md — Discord watcher overview.
- sync-layer/worker/schema/ROUTER.md — JSON schema definitions validated against hook output.
