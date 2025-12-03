# ROUTER
Title: Homestead — Private Guild Channel Gameplay
Purpose: Manages private guild channel-based gameplay (replaces deprecated DM flows)
Owned Globs: src/bot/homestead/**
Last Updated (UTC): 2025-06-15T20:00:00Z

Notes:
- **MIGRATION STATUS:** ✅ COMPLETE (src/bot/dm/ deleted, all flows migrated)
- **Architecture:** Each user gets a private guild channel (homestead-{username})
- **Service Layer:** Uses HomesteadChannelManager (src/services/homestead-manager.ts)
- **Database:** HomesteadChannel model tracks user → channel mappings
- **Cross-References:**
  - See docs/architecture-bible/18-private-channel-architecture.md for complete specification
  - See src/services/homestead-manager.ts for channel management service

Areas:
- home.ts — Party/box/profile views in homestead channels
- heal.ts — Pokémon healing in homestead channels
- starters.ts — Starter selection in homestead channels
- ROUTER.md — This navigation document

Integration Points:
- Commands: /home, /profile use homestead channels
- Battles: Battle notifications sent to homestead (challenge.ts, actions.ts, conclude.ts)
- Wilds: Wild encounter notifications sent to homestead (controls.ts)
- Service: HomesteadChannelManager handles channel creation, permissions, cleanup

Migration Completed:
- [x] Database schema (HomesteadChannel model)
- [x] Service layer (HomesteadChannelManager)
- [x] Directory structure created
- [x] home.ts migrated
- [x] heal.ts migrated
- [x] starters.ts migrated
- [x] Updated all createDM() call sites (10 → 0)
- [x] Deprecated dm/ directory deleted
- [x] Tests updated

---

**Last Change:** Migration complete, dm/ directory removed (2025-06-15)
**Status:** Active and production-ready
