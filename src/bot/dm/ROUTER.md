# ROUTER
Title: DM Home & Support Flows
Purpose: Renders DM embeds for party/box/profile views and wires heal/starter interactions.
Owned Globs: src/bot/dm/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- DM home renderer paginates storage boxes, highlights party status, and links to heal navigation buttons.
- Starter selection and heal flows rely on Prisma loaders under `src/models/` and emit deterministic embeds for tests.
- Utilities share sprite helpers with the legacy command layer to keep asset URLs aligned.

Key Files:
- home.ts — Builds DM home embeds, handles pagination, and routes navigation button presses.
- starters.ts — Onboards new trainers with starter selection flows and DM confirmation messaging.
- heal.ts — Runs heal confirmations and updates trainer party health via Prisma models.

Linked Routers:
- src/bot/ROUTER.md — Discord bot entrypoint and domain map.
- src/models/ROUTER.md — Prisma data access used by DM flows.
- src/lib/ROUTER.md — Shared asset helpers consumed by DM embeds.
