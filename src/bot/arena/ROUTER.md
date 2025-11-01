# ROUTER
Title: Arena Threads & Summaries
Purpose: Creates battle announcement threads and composes public/DM summaries once fights conclude.
Owned Globs: src/bot/arena/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- `createArenaThread` defensively opens a Discord thread (or mocks) and seeds it with a formatted intro message for participants.
- Summary helpers compress battle logs for arena threads and expand detailed DM recaps for each trainer.
- Thread creation gracefully handles environments without full Discord channel objects so tests can stub the API surface.

Key Files:
- thread.ts — Creates arena threads, writes intro posts, and exposes helpers for deterministic naming.
- summary.ts — Builds concise arena thread summaries and detailed DM payloads from recorded battle events.

Linked Routers:
- src/bot/ROUTER.md — Discord bot entry surface and subdomain map.
- src/bot/battle/ROUTER.md — Battle action handlers that raise arena events.
