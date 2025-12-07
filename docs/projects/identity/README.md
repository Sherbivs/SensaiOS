# Identity Projects

Documentation for identity-related systems and migrations.

---

## Active Projects

*None currently active*

---

## Completed Projects

### Identity Consolidation System (2025-12-08)

**Status:** ✅ COMPLETE  
**Report:** [2025-12-08-identity-consolidation-complete.md](./2025-12-08-identity-consolidation-complete.md)

**Summary:** Created unified identity resolution system consolidating User table, discord_members, and homestead_channels into single cache-optimized API.

**Deliverables:**
- `discord-identity.ts` (687 lines) — SINGLE SOURCE OF TRUTH for Discord identity
- `player-resolver.ts` (420 lines) — RECOMMENDED ENTRY POINT for player lookups
- `/ops player` command — Admin command showcasing unified identity
- HomesteadManager integration — Enriched logging with identity context

**Commits:**
- `fefd142` — Discord Identity Service
- `74127f5` — Player Resolver  
- `46605dd` — Phase 2: HomesteadManager integration
- `35ca5ea` — Phase 3: /ops player command

---

## Related Documentation

- **Database ID Audit:** [`docs/projects/database/2025-12-07-id-standardization-audit.md`](../database/2025-12-07-id-standardization-audit.md)
- **Architecture Bible:** [`docs/architecture-bible/`](../../architecture-bible/) (Section 19 pending)
- **Services ROUTER:** [`src/services/ROUTER.md`](../../../src/services/ROUTER.md)

---

## Usage Quick Reference

```typescript
// RECOMMENDED: Use PlayerResolver for unified player context
import { resolvePlayer } from "../services/player-resolver.js";
const player = await resolvePlayer(discordId);

// For Discord identity only (no game state)
import { resolveDiscordUser } from "../services/discord-identity.js";
const identity = await resolveDiscordUser(discordId);
```

---

*Last Updated: 2025-12-08*
