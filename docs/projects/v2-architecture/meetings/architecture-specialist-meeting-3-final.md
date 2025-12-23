# Architecture Blueprint — Specialist Panel Meeting #3 (FINAL)

**Date:** 2025-12-23  
**Format:** Final Implementation Planning Session  
**Chair:** Blake (Documentation Lead)  
**Status:** ✅ FINALIZED — GREENFIELD BUILD AUTHORIZED

---

## 🎯 MISSION: INFINITY GAUNTLET v2

**Objective:** Build Infinity Gauntlet from scratch using everything we've learned across 6 architecture audit meetings and 2 specialist panel sessions.

**Target Directory:** `Infinity-Gauntlet(v2)/`

---

## Final Architecture Declaration

### 🏗️ Aria (Backend Architect)

> After auditing 121 files, finding 30+ phantom references, and removing 1,425 lines of dead code, the path forward is clear. We don't patch the old codebase — we build what it should have been from day one.
>
> **My commitment:** Feature-first modules with pure core domain. Zero framework dependencies in business logic. Every function returns immutable data.

### ⚙️ Devon (DevOps Engineer)

> The production environment taught us painful lessons about health checks, graceful shutdowns, and observability. V2 will have these baked in from the start.
>
> **My commitment:** Health endpoints on day one. Structured logging from line one. Docker-ready, Render-optimized configuration.

### 🎮 Kai (Game Engine Developer)

> The battle engine works, but it's scattered across 8 directories. The RNG state is implicit. PBSL tests exist but the determinism is fragile.
>
> **My commitment:** Pure functional game engine. Explicit RNG threading. BattleContext everywhere. Every battle can be replayed from a seed.

### 🤖 Morgan (Discord Bot Specialist)

> Discord.js is powerful but we've fought against it instead of with it. V2 embraces the interaction model properly.
>
> **My commitment:** Versioned custom IDs. Paginated embeds as first-class citizens. Proper error boundaries for every interaction.

### 🗄️ River (Database Specialist)

> Prisma is excellent but we've wrapped it unnecessarily and created phantom dependencies. The schema is solid — the access patterns need cleanup.
>
> **My commitment:** Prisma extensions over repositories. Explicit transactions. Migration safety from day one.

### 🧪 Quinn (Testing Specialist)

> 420 tests but 137 skipped and 14 failing. Coverage exists but confidence is low. Property-based testing is barely used.
>
> **My commitment:** Test infrastructure as foundation, not afterthought. Factories, fixtures, and property tests from the start.

### 📚 Blake (Documentation Lead)

> ROUTER.md files everywhere but many outdated. Documentation drift caused real bugs.
>
> **My commitment:** Living documentation. ADRs for every decision. ROUTER.md validated by CI.

---

## Unanimous Resolutions

The specialist panel **unanimously resolves** to adopt:

### Resolution 1: Project Structure

```
Infinity-Gauntlet(v2)/
├── README.md                    # Project overview
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript config
├── vitest.config.ts             # Test configuration
├── Dockerfile                   # Container definition
├── docker-compose.yml           # Local development
├── render.yaml                  # Render deployment
├── .env.example                 # Environment template
├── ROUTER.md                    # Root navigation
│
├── docs/
│   ├── ROUTER.md
│   ├── adrs/                    # Architecture Decision Records
│   │   ├── INDEX.md
│   │   ├── 001-project-structure.md
│   │   └── ...
│   └── guides/
│       ├── getting-started.md
│       ├── deployment.md
│       └── testing.md
│
├── prisma/
│   ├── schema.prisma            # Database schema
│   ├── migrations/              # Migration history
│   ├── seed.ts                  # Seed data
│   └── ROUTER.md
│
├── src/
│   ├── ROUTER.md
│   │
│   ├── core/                    # Pure domain (NO external deps)
│   │   ├── ROUTER.md
│   │   ├── rng/                 # Deterministic RNG
│   │   │   ├── index.ts
│   │   │   ├── xorshift.ts
│   │   │   ├── helpers.ts
│   │   │   └── ROUTER.md
│   │   ├── battle/              # Battle engine
│   │   │   ├── index.ts
│   │   │   ├── context.ts       # BattleContext
│   │   │   ├── damage.ts
│   │   │   ├── accuracy.ts
│   │   │   ├── effects.ts
│   │   │   ├── types.ts
│   │   │   └── ROUTER.md
│   │   ├── pokemon/             # Pokemon domain
│   │   │   ├── index.ts
│   │   │   ├── stats.ts
│   │   │   ├── types.ts
│   │   │   ├── evolution.ts
│   │   │   └── ROUTER.md
│   │   └── encounter/           # Wild encounters
│   │       ├── index.ts
│   │       ├── spawn.ts
│   │       ├── rarity.ts
│   │       └── ROUTER.md
│   │
│   ├── features/                # Feature modules
│   │   ├── ROUTER.md
│   │   ├── homestead/           # Private channel hub
│   │   │   ├── index.ts
│   │   │   ├── homestead.command.ts
│   │   │   ├── homestead.service.ts
│   │   │   ├── homestead.embeds.ts
│   │   │   ├── homestead.buttons.ts
│   │   │   └── ROUTER.md
│   │   ├── battle/              # Battle feature
│   │   │   ├── index.ts
│   │   │   ├── battle.command.ts
│   │   │   ├── battle.service.ts
│   │   │   ├── battle.embeds.ts
│   │   │   ├── battle.buttons.ts
│   │   │   └── ROUTER.md
│   │   ├── wilds/               # Wild encounters
│   │   │   ├── index.ts
│   │   │   ├── wilds.command.ts
│   │   │   ├── wilds.service.ts
│   │   │   ├── wilds.embeds.ts
│   │   │   └── ROUTER.md
│   │   ├── pokedex/             # Pokedex feature
│   │   │   └── ...
│   │   └── party/               # Party management
│   │       └── ...
│   │
│   ├── discord/                 # Discord infrastructure
│   │   ├── ROUTER.md
│   │   ├── client.ts            # Client setup
│   │   ├── commands/            # Command registration
│   │   │   ├── index.ts
│   │   │   ├── registry.ts
│   │   │   └── ROUTER.md
│   │   ├── interactions/        # Interaction routing
│   │   │   ├── index.ts
│   │   │   ├── router.ts
│   │   │   ├── custom-ids.ts
│   │   │   └── ROUTER.md
│   │   └── components/          # Reusable components
│   │       ├── paginator.ts
│   │       ├── confirm.ts
│   │       └── ROUTER.md
│   │
│   ├── database/                # Database layer
│   │   ├── ROUTER.md
│   │   ├── client.ts            # Prisma client
│   │   ├── extensions/          # Prisma extensions
│   │   │   ├── softDelete.ts
│   │   │   ├── audit.ts
│   │   │   └── ROUTER.md
│   │   └── queries/             # Complex queries
│   │       ├── trainer.ts
│   │       ├── pokemon.ts
│   │       └── ROUTER.md
│   │
│   ├── infrastructure/          # Cross-cutting concerns
│   │   ├── ROUTER.md
│   │   ├── health/              # Health checks
│   │   │   ├── index.ts
│   │   │   ├── checks.ts
│   │   │   ├── routes.ts
│   │   │   └── ROUTER.md
│   │   ├── logging/             # Structured logging
│   │   │   ├── index.ts
│   │   │   ├── logger.ts
│   │   │   └── ROUTER.md
│   │   ├── config/              # Configuration
│   │   │   ├── index.ts
│   │   │   ├── env.ts
│   │   │   └── ROUTER.md
│   │   └── metrics/             # Prometheus metrics
│   │       └── ...
│   │
│   └── index.ts                 # Application entry
│
├── tests/
│   ├── ROUTER.md
│   ├── setup.ts                 # Test setup
│   ├── factories/               # Entity factories
│   │   ├── index.ts
│   │   ├── user.factory.ts
│   │   ├── pokemon.factory.ts
│   │   └── ROUTER.md
│   ├── fixtures/                # PBSL fixtures
│   │   ├── battles/
│   │   └── encounters/
│   ├── mocks/                   # Mock implementations
│   │   ├── discord.ts
│   │   ├── database.ts
│   │   └── ROUTER.md
│   ├── unit/                    # Unit tests
│   │   ├── core/
│   │   ├── features/
│   │   └── ROUTER.md
│   ├── integration/             # Integration tests
│   │   └── ROUTER.md
│   └── pbsl/                    # PBSL oracle tests
│       └── ROUTER.md
│
└── scripts/
    ├── ROUTER.md
    ├── build.ts
    ├── seed.ts
    └── migrate.ts
```

### Resolution 2: Core Principles

| Principle | Enforcement |
|-----------|-------------|
| **Pure Core** | `src/core/` has ZERO imports from `discord.js`, `prisma`, or external APIs |
| **Immutable State** | All core functions return new objects, never mutate |
| **Explicit RNG** | RNG state passed through and returned from every stochastic function |
| **Feature Isolation** | Features cannot import from other features directly |
| **ROUTER.md Everywhere** | Every directory has ROUTER.md, validated by CI |

### Resolution 3: Implementation Order

| Phase | Focus | Duration | Key Deliverables |
|-------|-------|----------|------------------|
| **Phase 1** | Foundation | Day 1 | Project scaffold, config, health, logging |
| **Phase 2** | Core Domain | Day 1-2 | RNG, battle math, Pokemon types |
| **Phase 3** | Database | Day 2 | Prisma schema, extensions, seed |
| **Phase 4** | Discord | Day 3 | Client, commands, interactions |
| **Phase 5** | First Feature | Day 3-4 | Homestead complete flow |
| **Phase 6** | Battle | Day 4-5 | Full battle system |
| **Phase 7** | Polish | Day 5+ | Wilds, Pokedex, testing |

---

## 🚀 PHASE 1: FOUNDATION

**Objective:** Create the project skeleton with all infrastructure in place.

### Files to Create

1. `package.json` — Dependencies and scripts
2. `tsconfig.json` — TypeScript configuration
3. `vitest.config.ts` — Test configuration
4. `.env.example` — Environment template
5. `README.md` — Project documentation
6. `ROUTER.md` — Root navigation
7. `src/index.ts` — Entry point
8. `src/infrastructure/config/env.ts` — Configuration
9. `src/infrastructure/logging/logger.ts` — Logging
10. `src/infrastructure/health/` — Health checks

---

## Authorization

**The specialist panel unanimously authorizes the greenfield build of Infinity Gauntlet v2.**

| Specialist | Signature |
|------------|-----------|
| 🏗️ Aria | ✅ Authorized |
| ⚙️ Devon | ✅ Authorized |
| 🎮 Kai | ✅ Authorized |
| 🤖 Morgan | ✅ Authorized |
| 🗄️ River | ✅ Authorized |
| 🧪 Quinn | ✅ Authorized |
| 📚 Blake | ✅ Authorized |

---

**BUILD COMMENCING...**
