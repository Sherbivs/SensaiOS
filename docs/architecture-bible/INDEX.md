# ARCHITECTURE BIBLE — INDEX

**Centralized System Architecture Documentation**  
**Created:** 2025-11-16 | **Reorganized:** 2025-11-17 | **Status:** PRODUCTION

## Purpose

Single source of truth for Infinity Gauntlet architectural design, component relationships, safety guarantees, and technical decisions. Originally consolidated from 37 source documents, now organized into 14 focused sections for maintainability.

---

## Architecture Sections

| Section | File | Topics |
|---------|------|--------|
| **1. System Overview** | [01-system-overview.md](01-system-overview.md) | Architecture snapshot, technology stack, service topology, quality metrics |
| **2. Database Architecture** | [02-database-architecture.md](02-database-architecture.md) | Database systems, replication, URL selection, multi-client runtime |
| **3. Worker Architecture** | [03-worker-architecture.md](03-worker-architecture.md) | Worker topology, scaling roadmap, cross-worker state management |
| **4. Event Bus** | [04-event-bus.md](04-event-bus.md) | Pub-sub system, correlation tracking, pattern matching, backpressure |
| **5. Logging Architecture** | [05-logging-architecture.md](05-logging-architecture.md) | Intelligent logging, buffer design, AI integration, scaling |
| **6. Error System** | [06-error-system.md](06-error-system.md) | Error detection, guarantees, tracker integration, logging pipeline |
| **7. Security Bot** | [07-security-bot.md](07-security-bot.md) | State persistence, 7-day history, restart DMs, monitoring |
| **8. Router System** | [08-router-system.md](08-router-system.md) | Meta-router design, routing discipline, navigation patterns |
| **9. Game Engine** | [09-game-engine.md](09-game-engine.md) | PBSL manifesto, battle flow, cache safety, DB replication, event tracking, Dex V2 |
| **10. Discord Bot** | [10-discord-bot.md](10-discord-bot.md) | Command suite, DM commands, admin commands, documentation index |
| **11. Safety Guarantees** | [11-safety-guarantees.md](11-safety-guarantees.md) | Memory safety, error isolation, state persistence, disaster recovery |
| **12. Observability** | [12-observability.md](12-observability.md) | Metrics transparency, calculation methods, monitoring |
| **13. Performance** | [13-performance.md](13-performance.md) | Optimization roadmap, centralization, benchmarks |
| **14. Future Roadmap** | [14-future-roadmap.md](14-future-roadmap.md) | Vision, milestones, workstreams, dependencies |

---

## Cross-References

### Operational Bibles
- **OPERATIONS-BIBLE** — Database operations, deployment procedures, service matrix
- **DEVELOPMENT-BIBLE** — Local setup, testing, debugging, console tooling

### Primary Documentation
- **Agents.md** — Comprehensive operations guide
- **README.md** — Getting started, project overview
- **OPERATIONS.md** — Service matrix, deployment procedures

### Router Manifests
- **ops/ROUTER.yaml** — Router-of-routers manifest
- **masterroutetable.md** — Human-readable router index
- **docs/ROUTER.md** — Documentation routing

---

## Document History

| Date | Event | Details |
|------|-------|---------|
| 2025-11-16 | Template Created | Initial ARCHITECTURE-BIBLE.md template with 14 sections |
| 2025-11-16 | Phase 1 Start | Consolidation of 37 source documents into unified Bible |
| 2025-11-17 | Reorganization | Split monolithic Bible into 14 focused section files |

**Consolidation Summary:**
- Phase 0: 454 → 93 files (79% reduction, 361 files deleted)
- Phase 1: 93 → 66 files (88% reduction, 388 files deleted total)
- 28 files consolidated into ARCHITECTURE-BIBLE (Discord Bot, Security Bot, Router System, Game Engine, Error System, Logging, Event Bus, System Overview, Safety Guarantees, Future Roadmap, and 4 remaining sections)
- Final structure: 14 section files + 1 index = 15 architecture documents

---

## Navigation Guidelines

1. **Start with INDEX.md** (this file) to locate sections
2. **Use section files** for deep dives into specific subsystems
3. **Cross-reference OPERATIONS-BIBLE** for operational procedures
4. **Cross-reference DEVELOPMENT-BIBLE** for development workflows
5. **Update both source file and INDEX.md** when modifying architecture

---

**Last Updated:** 2025-11-17  
**Maintained By:** Database Systems, Core Infrastructure  
**Review Cadence:** Monthly architectural reviews, updates as needed
