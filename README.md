# Infinity Gauntlet Pokémon Suite

**Discord-first Pokémon adventure for Dripcord.** Players live in DMs, explore the Wilds together, battle in public arenas, and progress through a live-service economy powered by workers and data pipelines.

---

## Quick Links

**For Developers:**
- 📚 **Complete Documentation:** `docs/` — Architecture, operations, development guides
- 🏗️ **Architecture Bible:** `docs/architecture-bible/INDEX.md` — System design, worker architecture, game engine
- 🔧 **Operations Bible:** `docs/operations-bible/INDEX.md` — Database operations, deployment, monitoring
- 💻 **Development Bible:** `docs/development-bible/INDEX.md` — Local setup, testing, debugging

**For AI Agents:**
- 🤖 **AI Operations Guide:** `Agents.md` — Orientation, database setup, critical safety rules
- 📋 **Task Management:** `tasklist.md` — Active backlog
- 🔄 **Current Status:** `Prompt.md` — Recent changes, PATCHSET echo

---

## Current Status

**Phase 9 Complete** (2025-11-08): Repository is production-ready, centralized, standardized, and scalable.

**Quality Metrics:**
- ✅ Zero linter warnings across TypeScript codebase
- ✅ Zero npm vulnerabilities, all dependencies current
- ✅ 293/294 tests passing (99.7% pass rate, 6.82s execution)
- ✅ Clean documentation: Architecture + Operations + Development Bibles
- ✅ Memory safety: ~300-350 MB peak RAM (58-68% of 512 MB limit)

**Recent Enhancements (November 2025):**
- ✅ **Phase 2.4.3**: IntelligentLogger Event Bus migration (unified pub-sub, correlation tracking)
- ✅ **Memory Safety Audit**: Fixed 3 critical unbounded growth bugs
- ✅ **State Persistence**: 7-day hourly metrics history for security bot
- ✅ **Documentation Consolidation**: 18 ops/ files → 4 files (Bible system integration)

**See:** `docs/operations-bible/06-optimization-history.md` for comprehensive Phase 9 achievements

---

## Architecture Overview

**For complete architecture documentation, see `docs/architecture-bible/INDEX.md` (15 sections)**

### Core Systems

**Discord Bot Layer** (`src/bot/**`)
- Slash commands, DM experiences, arena threads, ops tooling
- Security bot monitors guild permissions with 7-day state persistence

**Game Engine** (`src/core/**`)
- Deterministic battle and encounter logic (PBSL framework)
- Separate from Discord layer for testability

**Data & Persistence**
- Prisma schema (`prisma/schema.prisma`) — Trainers, parties, encounters, battles
- Unified Render-managed PostgreSQL (infinity-gauntlet-db)
- Worker scripts refresh cached reference data

**Event Bus** (`src/shared/event-bus.ts`)
- Unified pub-sub system for cross-service communication
- Correlation tracking, pattern matching, backpressure protection

**See:** `docs/architecture-bible/01-system-overview.md` for complete system design

---

## Key Capabilities

**DM-as-Home**
- `/home`, heal, starter selection, party/box management, player profile
- All originate in `src/bot/dm/**` with shared UI helpers

**Wild Encounters**
- `/walk` spawns public `#wilds` threads
- DM controls for throws, swaps, escapes via `src/bot/wilds/**`

**Arena Battles**
- `/battle challenge` coordinates arena threads
- Discord orchestration in `src/bot/battle/**`, resolution in `src/core/battle/**`

**Admin Operations**
- `/ops` exposes cooldown reset, stats filtering, cache metrics
- Staff validate health without direct DB access

**See:** `docs/architecture-bible/10-discord-bot.md` for complete command reference

---

## Getting Started

### Requirements
- Node.js 20+
- PostgreSQL 17 (local development) or Render managed database (production)
- Discord Bot Token

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

**Environment Setup:**
- Use `secrets/Infinity-Gauntlet.env` as single consolidated environment file
- Required keys: BOT_TOKEN, PROD_DATABASE_URL, DATABASE_ONPREMISE_DEV_PRIMARY
- See `docs/development-bible/01-local-setup.md` for complete setup guide

---

## Repository Structure

```
├─ docs/                     # Complete documentation (Architecture + Operations + Development Bibles)
│  ├─ architecture-bible/    # 15 sections: System design, database, workers, game engine, etc.
│  ├─ operations-bible/      # 6 sections: Service matrix, deployment, monitoring, etc.
│  ├─ development-bible/     # 7 sections: Local setup, testing, debugging, utilities
│  └─ historical-archive/    # Archived documentation from major refactorings
├─ src/                      # TypeScript source (bot, core engines, data pipeline)
│  ├─ bot/                   # Discord interactions (DM, wilds, arena, ops)
│  ├─ core/                  # Battle + encounter engines (deterministic, testable)
│  ├─ shared/                # Config, logging, Prisma helpers, event bus
│  └─ worker/                # Background workers (cache, outbox, data pipeline)
├─ tests/                    # Vitest suites (battle engine, PBSL oracle, integration)
├─ scripts/                  # Automation (data pipeline, guards, deployment)
├─ prisma/                   # Database schema + migrations
├─ ops/                      # Governance (NEXT.yaml, routing manifests)
├─ Agents.md                 # AI agent operations guide
├─ Patch.md                  # AI contract (workflow rules, Absolutes)
├─ tasklist.md               # Active backlog (PROPOSED/READY/IN_PROGRESS/DONE)
└─ Prompt.md                 # Current status (timestamp, recent changes)
```

---

## Production Deployment

**Service Matrix:** 6 Render workers + 1 cron job
- Main Discord bot (gameplay)
- Security bot (permission guardrails)
- Outbox worker (async message delivery)
- Cache worker (runtime cache maintenance)
- Data pipeline worker (reference data updates)
- Pokédex cache worker (GitHub sync)
- Failsafe cron (weekly fallback)

**See:** `docs/operations-bible/01-service-matrix.md` for complete service architecture

---

## Testing & Quality

**Test Suite:** 293/294 passing (99.7% pass rate, 6.82s execution)
- Unit tests: Battle engine, DM flows, ops commands
- PBSL oracle: Deterministic battle snapshots
- Integration tests: Discord button flows

**Quality Checks:**
- Zero TypeScript errors
- Zero ESLint warnings
- Zero npm vulnerabilities
- 100% test coverage for critical paths

**See:** `docs/development-bible/02-testing-patterns.md` for testing guide

---

## Documentation Navigation

**By Role:**
- **New Developers:** Start with this README → `docs/development-bible/01-local-setup.md`
- **Operations Team:** `docs/operations-bible/INDEX.md` → Service matrix, deployment, monitoring
- **Architects:** `docs/architecture-bible/INDEX.md` → Complete system design
- **AI Agents:** `Agents.md` → Orientation flow, critical safety rules, Bible navigation

**By Topic:**
- **Database:** `docs/operations-bible/02-database-operations.md` + `docs/architecture-bible/02-database-architecture.md`
- **Workers:** `docs/architecture-bible/03-worker-architecture.md`
- **Game Engine:** `docs/architecture-bible/09-game-engine.md`
- **Deployment:** `docs/operations-bible/03-deployment-procedures.md`

---

## Contributing

1. Read `Patch.md` for AI contract and workflow rules
2. Check `tasklist.md` for available tasks
3. Review `Prompt.md` for recent changes
4. Follow architecture patterns in `docs/architecture-bible/`
5. Update Bible documentation for architectural changes
6. Run `npm test` before submitting changes

---

## License & Credits

**Project:** Infinity Gauntlet — Discord Pokémon adventure for Dripcord  
**Maintainer:** Sherbivs  
**License:** Private (contact maintainer)  

**Pokémon data courtesy of PokéAPI** (https://pokeapi.co/)

---

**Last Updated:** 2025-11-17  
**Documentation:** 3 Bibles (Architecture + Operations + Development)  
**Status:** Production Ready (Phase 9 Complete)
