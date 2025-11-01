# ROUTER
Title: Battle Interaction Handlers
Purpose: Orchestrates player action prompts, challenge flows, and battle conclusion persistence.
Owned Globs: src/bot/battle/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Button handlers queue moves, switches, and forfeits while syncing state with the Prisma-backed battle cache.
- Challenge helpers validate eligibility, spawn arena threads, and register turn order in the battle engine.
- Conclusion helpers award coins, update streaks, and emit arena summaries for both public threads and DMs.

Key Files:
- actions.ts — Handles move/switch/forfeit button interactions and dispatches DM prompts for the next turn.
- challenge.ts — Validates challengers, opens arena threads, and seeds turn state.
- conclude.ts — Persists battle outcomes and coordinates DM/arena summary delivery.

Linked Routers:
- src/bot/ROUTER.md — Discord client bootstrap and domain index.
- src/core/battle/ROUTER.md — Core engine logic consumed by the interaction handlers.
- src/services/cache/ROUTER.md — Cache recipes invalidated when battle state changes.
