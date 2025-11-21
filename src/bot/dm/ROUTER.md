# ROUTER — ⚠️ DEPRECATED: DM Home & Support Flows
Title: **DEPRECATED** — DM Home & Support Flows (Being Replaced by Private Channels)
Purpose: ~~Renders DM embeds for party/box/profile views and wires heal/starter interactions.~~ **MIGRATION IN PROGRESS:** All functionality being moved to homestead channels (src/bot/homestead/).
Owned Globs: src/bot/dm/** (DEPRECATED - Will be removed after Phase 18 migration)
Last Updated (UTC): 2025-11-21T12:30:00Z

**⚠️ DEPRECATION NOTICE (2025-11-21):**
This directory and all DM-based gameplay modules are being **replaced by private guild channel architecture** (homestead channels). 

**Migration Status:** Phase 18 in progress
- **Architecture Specification:** `docs/architecture-bible/14-private-channel-architecture.md` (900+ lines)
- **New Implementation:** `src/bot/homestead/**` (replacing this directory)
- **Call Sites Being Migrated:** 10 createDM() locations across 6 files
- **Timeline:** Foundation → DM Migration → Feature Integration → Lifecycle → Testing → Deployment
- **Removal:** This directory will be deleted after 7-day validation period post-deployment

**Why the Change:**
- ❌ **DM Delivery Failures:** Users with DMs disabled cannot play
- ❌ **No Moderation:** Guild admins cannot see or moderate gameplay
- ❌ **No Audit Trail:** Support requests have no context
- ✅ **Private Channels:** homestead-{username} channels provide all benefits + guild visibility

**Current DM Modules (TO BE REPLACED):**
- home.ts — Party/box/profile views → `src/bot/homestead/home.ts`
- starters.ts — Starter selection flow → `src/bot/homestead/starters.ts`
- heal.ts — Heal confirmations → `src/bot/homestead/heal.ts`

**DO NOT ADD NEW FEATURES TO THIS DIRECTORY.**

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
