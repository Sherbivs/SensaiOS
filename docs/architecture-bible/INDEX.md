# ARCHITECTURE BIBLE — INDEX

**Centralized System Architecture Documentation**  
**Created:** 2025-11-16 | **Last Updated:** 2025-12-27 | **Status:** PRODUCTION

## Purpose

Single source of truth for Infinity Gauntlet architectural design, component relationships, safety guarantees, and technical decisions. Originally consolidated from 37 source documents, now organized into 27 focused sections for maintainability.

---

## Architecture Sections

| Section | File | Topics |
|---------|------|--------|
| **1. System Overview** | [01-system-overview.md](01-system-overview.md) | Architecture snapshot, technology stack, service topology, quality metrics |
| **2. Database Architecture** | [02-database-architecture.md](02-database-architecture.md) | Prisma 7 configuration, multi-client runtime, URL selection, replication |
| **3. Worker Architecture** | [03-worker-architecture.md](03-worker-architecture.md) | Worker topology, scaling roadmap, cross-worker state management |
| **4. Event Bus** | [04-event-bus.md](04-event-bus.md) | Pub-sub system, correlation tracking, pattern matching, backpressure |
| **5. Logging Architecture** | [05-logging-architecture.md](05-logging-architecture.md) | Intelligent logging, buffer design, AI integration, scaling |
| **6. Error System** | [06-error-system.md](06-error-system.md) | Error detection, guarantees, tracker integration, logging pipeline |
| **7. Security Bot** | [07-security-bot.md](07-security-bot.md) | State persistence, 7-day history, restart DMs, monitoring |
| **8. Router System** | [08-router-system.md](08-router-system.md) | Meta-router design, routing discipline, navigation patterns |
| **9. Game Engine** | [09-game-engine.md](09-game-engine.md) | PBSL manifesto, battle flow, cache safety, DB replication, event tracking, Dex V2 |
| **10. Discord Bot** | [10-discord-bot.md](10-discord-bot.md) | Command suite, homestead channels, admin commands, documentation index |
| **11. Safety Guarantees** | [11-safety-guarantees.md](11-safety-guarantees.md) | Memory safety, error isolation, state persistence, disaster recovery |
| **12. Observability** | [12-observability.md](12-observability.md) | Metrics transparency, calculation methods, monitoring |
| **13. Performance** | [13-performance.md](13-performance.md) | Optimization roadmap, centralization, benchmarks |
| **14. Future Roadmap** | [14-future-roadmap.md](14-future-roadmap.md) | Vision, milestones, workstreams, dependencies |
| **15. Project History** | [15-project-history.md](15-project-history.md) | Major refactorings, Accelerate elimination, dead code cleanup |
| **16. Boot Sequence** | [16-boot-sequence.md](16-boot-sequence.md) | Startup phases, timing, memory progression, observability, recovery |
| **17. Service Registry** | [17-service-registry.md](17-service-registry.md) | Dependency injection, lifecycle management, health monitoring, graceful shutdown |
| **18. Private Channel Architecture** | [18-private-channel-architecture.md](18-private-channel-architecture.md) | Homestead channels, guild-based gameplay, service design, lifecycle management |
| **19. Seamless Restart** | [19-seamless-restart.md](19-seamless-restart.md) | Zero-downtime restarts, state preservation, recovery patterns |
| **20. Resource Limits** | [20-resource-limits.md](20-resource-limits.md) | RAM vs disk distinction, memory budgets, scaling thresholds |
| **21. Security Database** | [21-security-database.md](21-security-database.md) | Security event logging, permission tracking, audit trails |
| **22. Starter Selection Flow** | [22-starter-selection-flow.md](22-starter-selection-flow.md) | New player onboarding, starter Pokemon selection, homestead initialization |
| **23. Game Design Bible** | [23-game-design-bible.md](23-game-design-bible.md) | Button-first UI, living game model, engagement systems, psychology hooks |
| **24. Fishing System** | [24-fishing-system.md](24-fishing-system.md) | Fishing mini-game, rod progression, water-type encounters |
| **25. Trading System** | [25-trading-system.md](25-trading-system.md) | Player-to-player trading, scam prevention, trade evolution |
| **26. Leaderboards & Achievements** | [26-leaderboards-achievements.md](26-leaderboards-achievements.md) | Competitive rankings, achievement system, rewards |
| **27. /Store DB-Only Policy** | [27-store-db-only-policy.md](27-store-db-only-policy.md) | Persistent storage policy, heap migration, state consolidation |

### Supplementary Documents
| File | Purpose |
|------|---------|
| [complete-system-architecture.md](complete-system-architecture.md) | 30-page comprehensive system reference |
| [schema-health-audit-2025-12-04.md](schema-health-audit-2025-12-04.md) | Database schema health assessment |

---

## Key Architectural Changes (2025)

### Homestead Channel Migration (June 2025)
**COMPLETE:** All gameplay migrated from Discord DMs to private guild channels (homestead-{username}).

- `src/bot/dm/` directory **DELETED** — All DM code removed
- `src/bot/homestead/` is now the canonical gameplay entry point
- See Section 18 for complete architecture specification

### Prisma 7 Migration (December 2025)
**COMPLETE:** Upgraded from Prisma 6 to Prisma 7.1.0.

- `engineType = "library"` required in schema.prisma
- Database URL moved to `prisma.config.ts`
- `datasources` option removed from PrismaClient constructor
- See Section 2 and [Operations Bible § 2.7](../operations-bible/02-database-operations.md#27-prisma-7-configuration-updated-2025-12-18) for details

---

## Cross-References

### Operational Bibles
- **[OPERATIONS-BIBLE](../operations-bible/INDEX.md)** — Database operations, deployment procedures, service matrix
- **[DEVELOPMENT-BIBLE](../development-bible/INDEX.md)** — Local setup, testing, debugging, console tooling

### Primary Documentation
- **[Agents.md](../../Agents.md)** — Comprehensive operations guide
- **[README.md](../../README.md)** — Getting started, project overview

### Router Manifests
- **[ops/ROUTER.yaml](../../ops/ROUTER.yaml)** — Router-of-routers manifest
- **[masterroutetable.md](../../masterroutetable.md)** — Human-readable router index

---

## Document History

| Date | Event | Details |
|------|-------|---------|
| 2025-11-16 | Initial Creation | 14 sections consolidated from 37 source documents |
| 2025-11-21 | Architecture Pivot | Added Private Channel Architecture (DM → Guild Channels) |
| 2025-12-18 | Reorganization | Expanded to 22 sections, removed duplicates, updated for Prisma 7 |
| 2025-12-26 | Feature Expansion | Added Fishing (24), Trading (25), Leaderboards & Achievements (26) |
| 2025-12-27 | Storage Policy | Added /Store DB-Only Policy (27), **27 sections complete**, date standardization |

---

## Navigation Guidelines

1. **Start with INDEX.md** (this file) to locate sections
2. **Use section files** for deep dives into specific subsystems
3. **Cross-reference OPERATIONS-BIBLE** for operational procedures
4. **Cross-reference DEVELOPMENT-BIBLE** for development workflows
5. **Update both source file and INDEX.md** when modifying architecture

---

**Last Updated:** 2025-12-18  
**Maintained By:** Core Infrastructure Team  
**Review Cadence:** Monthly architectural reviews
