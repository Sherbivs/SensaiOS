# ROUTER
Title: Battle Interaction Tests
Purpose: Vitest coverage for Discord battle interaction handlers and arena flows.
Owned Globs: tests/battle/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Exercises button interaction flows to ensure select menus and prompts remain stable.
- Uses mocked Discord collectors to simulate move/switch selections and timeout states.
- Keep specs deterministic; seed RNG and stub Prisma calls via shared fixtures.

Key Files:
- actions.interaction.spec.ts — Coverage for button prompts and action queue wiring.

Linked Routers:
- tests/ROUTER.md — Top-level test suite index.
- src/bot/battle/ROUTER.md — Interaction handlers under test.
- src/core/battle/ROUTER.md — Engine helpers mocked or asserted within the specs.
