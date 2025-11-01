# ROUTER
Title: Sync Layer Discord Hooks
Purpose: Discord-side watchers that emit sync payloads for downstream workers.
Owned Globs: sync-layer/discord/**
Last Updated (UTC): 2025-11-01T15:23:00Z

Notes:
- `sync-client.js` boots the lightweight Discord client used by the prototype to subscribe to events.
- Hook modules translate raw Discord payloads into the JSON envelopes stored beneath `sync-layer/data/`.

Subdirectories:
- hooks/ — event-specific handlers (guild role updates, channel deltas) that call back into `sync-client.js`. Document new hooks inline and ensure they emit schema-compliant payloads.
