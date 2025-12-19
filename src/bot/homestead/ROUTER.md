# ROUTER
Title: Homestead — Private Guild Channel Gameplay
Purpose: Manages private guild channel-based gameplay (replaces deprecated DM flows)
Owned Globs: src/bot/homestead/**
Last Updated (UTC): 2025-12-18T00:00:00Z

Notes:
- **MIGRATION STATUS:** ✅ COMPLETE (2025-06-15) — `src/bot/dm/` directory DELETED
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
- Commands: /home, /profile (use homestead channels)
- Battles: Battle notifications sent to homestead (not DMs)
- Wilds: Wild encounter notifications sent to homestead (not DMs)
- Service: HomesteadChannelManager handles channel creation, permissions, cleanup

Migration Progress (COMPLETE):
- [x] Database schema (HomesteadChannel model)
- [x] Service layer (HomesteadChannelManager)
- [x] Directory structure created
- [x] home.ts migration
- [x] heal.ts migration
- [x] starters.ts migration
- [x] All createDM() call sites removed
- [x] Test mocks updated
- [x] Manual testing complete
- [x] Deprecated dm/ directory DELETED

---

**Last Change:** Migration complete, all DM code removed (2025-06-15)
**Migration Docs:** See docs/architecture-bible/18-private-channel-architecture.md
