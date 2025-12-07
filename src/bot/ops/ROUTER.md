# ROUTER
Title: Ops Command Surface
Purpose: Administrator slash command handlers for `/ops stats`, `/ops cache`, `/ops player`, and related telemetry.
Owned Globs: src/bot/ops/**
Last Updated (UTC): 2025-12-07T00:00:00Z

Notes:
- Aggregates battle history, cache summaries, player profiles, and participant filters for staff reviews.
- Integrates with cache facade metrics, Prisma reporting models, and Identity Consolidation services.
- `/ops player` showcases new PlayerResolver + DiscordIdentityService integration (Phase 3).
- Extend this module when introducing new `/ops` subcommands so audit logging remains centralized.

Key Files:
- admin.ts — Slash command implementation for `/ops` commands (stats, cache, player, engine, workers, etc.).

Integration Points (Phase 3 - Identity Consolidation):
- `src/services/player-resolver.ts` — Unified player context resolution (game + identity + homestead).
- `src/services/discord-identity.ts` — Canonical Discord identity from security database.
- `/ops player <user>` — Comprehensive player profile using both services.

Linked Routers:
- src/bot/ROUTER.md — Discord bot context and subrouter directory.
- src/services/cache/ROUTER.md — Cache metrics consumed by the admin dashboard.
- src/services/ROUTER.md — PlayerResolver and DiscordIdentityService.
- src/models/ROUTER.md — Prisma models sourced for reporting queries.
