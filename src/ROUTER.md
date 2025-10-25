# ROUTER
Title: Application Source
Purpose: Root app source tree; see sub-routers for domains.
Owned Globs: src/**
Last Updated (UTC): 2025-10-25T16:05:00Z

Notes:
- T7.2 persisted wild encounter captures and threads data through bot and tests.
- Updated shared config to fall back to Render-provided database env mappings.

Subdomains:
- src/bot — Discord client & interaction handlers
- src/core — game engines (battle, encounter, data)
