# ROUTER
Title: Homestead — Private Guild Channel Gameplay
Purpose: Manages private guild channel-based gameplay (replaces deprecated DM flows)
Owned Globs: src/bot/homestead/**
Last Updated (UTC): 2025-11-28T18:00:00Z

Notes:
- **MIGRATION STATUS:** In Progress (from src/bot/dm/ → src/bot/homestead/)
- **Architecture:** Each user gets a private guild channel (homestead-{username})
- **Service Layer:** Uses HomesteadChannelManager (src/services/homestead-manager.ts)
- **Database:** HomesteadChannel model tracks user → channel mappings
- **Cross-References:**
  - See docs/architecture-bible/14-private-channel-architecture.md for complete specification
  - See src/services/homestead-manager.ts for channel management service
  - See src/bot/dm/ROUTER.md for deprecated DM-based implementation (to be removed)

Areas:
- home.ts — Party/box/profile views in homestead channels (migrated from dm/home.ts)
- heal.ts — Pokémon healing in homestead channels (migrated from dm/heal.ts)
- starters.ts — Starter selection in homestead channels (migrated from dm/starters.ts)
- ROUTER.md — This navigation document

Integration Points:
- Commands: /home, /profile (will use homestead channels)
- Battles: Battle notifications sent to homestead (not DMs)
- Wilds: Wild encounter notifications sent to homestead (not DMs)
- Service: HomesteadChannelManager handles channel creation, permissions, cleanup

Migration Progress:
- [x] Database schema (HomesteadChannel model)
- [x] Service layer (HomesteadChannelManager)
- [x] Directory structure created
- [ ] home.ts migration (Task 2)
- [ ] heal.ts migration (Task 3)
- [ ] starters.ts migration (Task 4)
- [ ] Update 10 createDM() call sites (Task 5)
- [ ] Update test mocks (Task 6)
- [ ] Manual testing (Task 7)
- [ ] Remove deprecated dm/ directory (Task 8)

---

**Last Change:** Directory created, ROUTER.md documentation added (2025-11-28)
**Next Steps:** Migrate home.ts from dm/ to homestead/ (Task 2)
