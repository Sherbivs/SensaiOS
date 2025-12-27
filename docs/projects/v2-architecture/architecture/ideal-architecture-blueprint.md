# Ideal Architecture Blueprint — Pokemon Infinity Gauntlet

**Created:** 2025-12-23  
**Purpose:** North Star Reference Architecture for Future Development  
**Status:** PROPOSAL — Leadership Review Pending  
**Author:** Cleanup & Consolidation Specialist (Architecture Audit Meeting #6)  
**Evidence Base:** 121 files analyzed, 7,450+ lines audited across 6 meetings

---

## Executive Summary

This blueprint represents the **ideal repository architecture** for Pokemon Infinity Gauntlet, synthesized from comprehensive codebase archaeology conducted during Architecture Audit Meetings #1-6. It addresses 23 documented pain points discovered through evidence-based dead code analysis, phantom reference detection, and structural integrity verification.

### Key Findings from Audit

| Discovery | Impact | Blueprint Solution |
|-----------|--------|-------------------|
| **1,425 lines dead code** (src/errors/) | Maintenance burden | Inline types in shared/ |
| **30+ phantom references** | Documentation rot | Single-source routing |
| **5+ config locations** | Cognitive overhead | Centralized config/ |
| **JS/TS hybrid** (~40 .js files) | Type safety gaps | 100% TypeScript |
| **Scattered data flow** | Confusion | Clear pipeline stages |
| **Deep bot nesting** | Navigation complexity | Feature-first modules |

---

## Current Architecture Analysis

### Verified Directory Structure (from Integrity Audit)

Based on the complete path verification performed in Meeting #6:

```
Current Reality (14 top-level directories):
├── assets/          ✅ ROUTER.md exists — Generated dexpack assets
├── backups/         ❌ Git-ignored — Database backup archives
├── data/            ✅ ROUTER.md exists — Pokemon reference data (JSON)
├── docs/            ✅ ROUTER.md exists — Bible documentation system
├── ops/             ✅ ROUTER.md exists — Governance & operations
├── playbooks/       ✅ ROUTER.md exists — Escalation recipes
├── prisma/          ✅ ROUTER.md exists — Schema & migrations
├── router/          ✅ ROUTER.md exists — Meta-router implementation
├── scripts/         ✅ ROUTER.md exists — Automation tooling (47 files)
├── secrets/         ❌ Git-ignored — Local credentials
├── src/             ✅ ROUTER.md exists — Application source (18 subdirs)
├── Store/           ✅ ROUTER.md exists — Runtime cache & local DB
├── tests/           ✅ ROUTER.md exists — Test suites
└── tools/           ✅ ROUTER.md exists — Vendored binaries
```

### Source Tree Distribution (from Code Distribution Analysis)

| Directory | Files | Current Purpose | Health Status |
|-----------|-------|-----------------|---------------|
| src/bot/ | 84 | Discord bot layer | ⚠️ Deep nesting |
| src/generated/ | 54 | Prisma client | ✅ Auto-generated |
| src/services/ | 51 | Service layer | ✅ Well-structured |
| src/shared/ | 50 | Shared utilities | ⚠️ Mixed concerns |
| src/core/ | 18 | Game engines | ✅ Pure logic |
| src/workers/ | 17 | Background jobs | ⚠️ Flat structure |
| src/commands/ | 15 | Slash commands | ⚠️ Separated from features |
| src/utils/ | 12 | Utility helpers | ⚠️ Overlaps shared/ |
| src/engine/ | 10 | Battle primitives | ✅ Clean domain |
| src/lib/ | 8 | Legacy CommonJS | ❌ Should migrate |
| src/config/ | 6 | Configuration | ⚠️ Scattered |
| src/dex/ | 6 | DEX v2 runtime | ✅ Focused |
| src/data_pipeline/ | 5 | Data pipeline | ⚠️ Naming overlap |
| src/models/ | 4 | Prisma wrappers | ✅ Clean |
| src/observability/ | 4 | Observability | ✅ Well-isolated |
| src/data/ | 3 | Dexpack loader | ⚠️ Naming overlap |
| src/runtime/ | 2 | Supervisors | ✅ Focused |
| src/cli/ | 1 | CLI tools | ✅ NEW (Meeting #6) |
| src/types/ | 1 | Type declarations | ✅ Clean |

### Documented Pain Points

#### Pain Point 1: Configuration Scatter
```
Current locations requiring config knowledge:
├── src/config/env.ts                    # Environment variables
├── src/config/engine-db-config.ts       # Engine database config
├── src/shared/config.ts                 # Runtime config
├── prisma/schema.prisma                 # Database schema
├── render.yaml                          # Deployment config
└── package.json                         # Build config
```

#### Pain Point 2: Data Flow Confusion
```
Three "data" directories with overlapping names:
├── data/                     # Static reference JSON (pokemon.json)
├── src/data/                 # Dexpack loader runtime
└── src/data_pipeline/        # Pipeline schema definitions
```

#### Pain Point 3: Bot Layer Depth
```
Current navigation to reach homestead healing:
src/bot/homestead/heal.ts     # 3 levels deep
src/bot/battle/turn.ts        # 3 levels deep  
src/bot/wilds/encounter.ts    # 3 levels deep

Feature code separated from:
src/commands/battle.ts        # Command definitions elsewhere
src/services/battle/          # Service logic elsewhere
src/core/battle/              # Pure logic elsewhere
```

#### Pain Point 4: Legacy JavaScript Files
```
JavaScript files remaining in src/ (from grep analysis):
├── src/bot/main.js           # Security bot entry (legacy)
├── src/bot/dripAlerts.js     # Alert pipeline (legacy)
├── src/lib/*.js              # CommonJS utilities (8 files)
├── src/utils/logger.js       # Logger (should be .ts)
└── src/services/cache.js     # Cache service (legacy)
```

---

## Ideal Architecture

### Design Principles

Based on evidence gathered across 6 audit meetings:

| Principle | Rationale | Evidence |
|-----------|-----------|----------|
| **Feature-First** | Co-locate related code | Bot layer has 84 scattered files |
| **Pure Core** | Testable domain logic | PBSL requires determinism |
| **Explicit Dependencies** | Avoid phantom references | 30+ phantoms fixed in audit |
| **Single Config Source** | Reduce cognitive load | 5+ config locations found |
| **100% TypeScript** | Type safety everywhere | ~40 .js files cause gaps |
| **Router Discipline** | Maintain documentation | 60+ ROUTER.md files verified |

### Ideal Directory Structure

```
pokemon-infinity-gauntlet/
│
├── .github/                              # GitHub Configuration
│   ├── agents/                          # AI agent configurations
│   │   ├── cleanup-agent.agent.md      # Cleanup specialist
│   │   └── code-agent.agent.md         # Code specialist
│   ├── instructions/                    # Copilot instructions
│   │   ├── copilot-instructions.md     # Global instructions
│   │   ├── typescript.instructions.md  # TypeScript rules
│   │   ├── testing.instructions.md     # Testing rules
│   │   └── documentation.instructions.md
│   └── workflows/                       # CI/CD pipelines
│       ├── ci.yml                       # Continuous integration
│       ├── deploy.yml                   # Deployment pipeline
│       └── audit.yml                    # Automated audits
│
├── config/                               # ★ CENTRALIZED CONFIGURATION
│   ├── index.ts                         # Config barrel + validation
│   ├── env.ts                           # Environment variables
│   ├── database.ts                      # Database connections
│   ├── discord.ts                       # Discord client config
│   ├── workers.ts                       # Worker schedules
│   ├── observability.ts                 # Logging/metrics
│   ├── features.ts                      # Feature flags
│   ├── game.ts                          # Game constants
│   └── ROUTER.md                        # Config documentation
│
├── data/                                 # Static Reference Data
│   ├── pokemon.json                     # Base Pokemon data
│   ├── moves.json                       # Move definitions
│   ├── abilities.json                   # Ability definitions
│   ├── types.json                       # Type effectiveness chart
│   ├── effects.json                     # Status effects
│   ├── bootstrap/                       # Bootstrap utilities
│   ├── cache/                           # Cached transformations
│   └── ROUTER.md
│
├── assets/                               # Built/Generated Assets
│   ├── dexpack.v1.json                  # Pokemon data pack v1
│   ├── dexpack.v2.json                  # Pokemon data pack v2
│   ├── manifest.json                    # Asset manifest
│   └── ROUTER.md
│
├── docs/                                 # Documentation (Bible System)
│   ├── INDEX.md                         # Documentation index
│   ├── ROUTER.md                        # Docs router
│   ├── architecture-bible/              # System design (27 sections)
│   │   ├── INDEX.md
│   │   └── *.md
│   ├── operations-bible/                # Runbooks (13 sections + 9 guides)
│   │   ├── INDEX.md
│   │   └── *.md
│   ├── development-bible/               # Dev guides (10 sections)
│   │   ├── INDEX.md
│   │   └── *.md
│   └── projects/                        # Project documentation
│       ├── README.md
│       └── *.md
│
├── infrastructure/                       # ★ INFRASTRUCTURE AS CODE
│   ├── docker/                          # Docker configurations
│   │   ├── Dockerfile                   # Production image
│   │   ├── Dockerfile.dev               # Development image
│   │   └── docker-compose.yml           # Local development
│   ├── render/                          # Render.com deployment
│   │   ├── render.yaml                  # Service definitions
│   │   └── ROUTER.md
│   ├── observability/                   # Monitoring stack
│   │   ├── grafana/                     # Dashboards
│   │   ├── loki/                        # Log aggregation
│   │   └── prometheus/                  # Metrics
│   └── ROUTER.md
│
├── prisma/                               # Database Layer
│   ├── schema.prisma                    # Prisma schema
│   ├── prisma.config.ts                 # Prisma configuration
│   ├── migrations/                      # Migration history
│   │   └── ROUTER.md
│   ├── seeds/                           # Seed data
│   └── ROUTER.md
│
├── scripts/                              # Automation Scripts
│   ├── ROUTER.md                        # Scripts router
│   ├── build/                           # Build scripts
│   │   ├── build-data.ts               # Data pipeline builder
│   │   ├── build-dexpack.ts            # Dexpack generator
│   │   ├── build-assets.ts             # Asset compiler
│   │   └── ROUTER.md
│   ├── db/                              # Database utilities
│   │   ├── admin.ts                    # DB CLI tool
│   │   ├── backup.ts                   # Backup utilities
│   │   ├── sync.ts                     # Sync between environments
│   │   └── ROUTER.md
│   ├── deploy/                          # Deployment scripts
│   │   ├── render-deploy.ts            # Render deployment
│   │   ├── render-status.ts            # Status checks
│   │   └── ROUTER.md
│   ├── dev/                             # Development helpers
│   │   ├── setup-env.ts                # Environment setup
│   │   ├── register-commands.ts        # Discord registration
│   │   └── ROUTER.md
│   └── guard/                           # CI guard scripts
│       ├── guard-routing.ts            # Router validation
│       ├── guard-meta.ts               # Meta file validation
│       └── ROUTER.md
│
├── src/                                  # ★ APPLICATION SOURCE
│   │
│   ├── index.ts                         # Application entry point
│   ├── ROUTER.md                        # Source tree router
│   │
│   ├── core/                            # ★ PURE DOMAIN LOGIC (No I/O)
│   │   ├── ROUTER.md
│   │   ├── battle/                      # Battle System
│   │   │   ├── engine.ts               # Battle state machine
│   │   │   ├── damage.ts               # Damage calculations
│   │   │   ├── status.ts               # Status effect logic
│   │   │   ├── priority.ts             # Move priority rules
│   │   │   ├── types.ts                # Battle type definitions
│   │   │   └── ROUTER.md
│   │   ├── encounter/                   # Encounter System
│   │   │   ├── spawn.ts                # Wild spawn logic
│   │   │   ├── catch.ts                # Catch mechanics
│   │   │   ├── types.ts                # Encounter types
│   │   │   └── ROUTER.md
│   │   ├── pokemon/                     # Pokemon Domain
│   │   │   ├── stats.ts                # Stat calculations
│   │   │   ├── evolution.ts            # Evolution logic
│   │   │   ├── types.ts                # Pokemon types
│   │   │   └── ROUTER.md
│   │   ├── trainer/                     # Trainer Domain
│   │   │   ├── party.ts                # Party management
│   │   │   ├── storage.ts              # PC storage logic
│   │   │   ├── types.ts                # Trainer types
│   │   │   └── ROUTER.md
│   │   └── pbsl/                        # PBSL Deterministic Testing
│   │       ├── battle/                 # Battle fixtures
│   │       ├── encounter/              # Encounter fixtures
│   │       ├── data/                   # Data fixtures
│   │       └── ROUTER.md
│   │
│   ├── features/                        # ★ FEATURE MODULES (Co-located)
│   │   ├── ROUTER.md
│   │   ├── homestead/                   # Homestead Feature
│   │   │   ├── homestead.command.ts    # Slash command definition
│   │   │   ├── homestead.service.ts    # Business logic
│   │   │   ├── homestead.embeds.ts     # Discord embed builders
│   │   │   ├── homestead.buttons.ts    # Button handlers
│   │   │   ├── homestead.types.ts      # Feature types
│   │   │   └── ROUTER.md
│   │   ├── battle/                      # Battle Feature
│   │   │   ├── battle.command.ts
│   │   │   ├── battle.service.ts
│   │   │   ├── battle.embeds.ts
│   │   │   ├── battle.buttons.ts
│   │   │   ├── battle.types.ts
│   │   │   └── ROUTER.md
│   │   ├── wilds/                       # Wild Encounters Feature
│   │   │   ├── wilds.command.ts
│   │   │   ├── wilds.service.ts
│   │   │   ├── wilds.embeds.ts
│   │   │   ├── wilds.types.ts
│   │   │   └── ROUTER.md
│   │   ├── daily/                       # Daily Quests Feature
│   │   │   ├── daily.command.ts
│   │   │   ├── daily.service.ts
│   │   │   └── ROUTER.md
│   │   ├── dex/                         # Pokedex Feature
│   │   │   ├── dex.command.ts
│   │   │   ├── dex.service.ts
│   │   │   └── ROUTER.md
│   │   ├── arena/                       # Arena Feature
│   │   │   ├── arena.command.ts
│   │   │   ├── arena.service.ts
│   │   │   ├── arena.embeds.ts
│   │   │   └── ROUTER.md
│   │   └── ops/                         # Admin Operations
│   │       ├── ops.command.ts
│   │       ├── ops.service.ts
│   │       ├── ops.guards.ts
│   │       └── ROUTER.md
│   │
│   ├── discord/                         # ★ DISCORD INFRASTRUCTURE
│   │   ├── ROUTER.md
│   │   ├── client.ts                    # Discord client setup
│   │   ├── commands/                    # Command infrastructure
│   │   │   ├── loader.ts               # Command loader
│   │   │   ├── registry.ts             # Command registry
│   │   │   └── ROUTER.md
│   │   ├── events/                      # Event handlers
│   │   │   ├── ready.ts                # Ready event
│   │   │   ├── interaction.ts          # Interaction router
│   │   │   ├── error.ts                # Error handler
│   │   │   └── ROUTER.md
│   │   └── middleware/                  # Middleware chain
│   │       ├── rate-limit.ts           # Rate limiting
│   │       ├── permissions.ts          # Permission checks
│   │       ├── logging.ts              # Request logging
│   │       └── ROUTER.md
│   │
│   ├── services/                        # ★ APPLICATION SERVICES
│   │   ├── ROUTER.md
│   │   ├── database/                    # Database Service
│   │   │   ├── prisma.ts               # Prisma client singleton
│   │   │   ├── repositories/           # Data access layer
│   │   │   │   ├── trainer.repo.ts
│   │   │   │   ├── pokemon.repo.ts
│   │   │   │   ├── battle.repo.ts
│   │   │   │   └── ROUTER.md
│   │   │   ├── types.ts
│   │   │   └── ROUTER.md
│   │   ├── cache/                       # Cache Service
│   │   │   ├── facade.ts               # Cache facade
│   │   │   ├── memory.ts               # Memory backend
│   │   │   ├── file.ts                 # File backend
│   │   │   ├── types.ts
│   │   │   └── ROUTER.md
│   │   ├── dexpack/                     # Dexpack Service
│   │   │   ├── loader.ts               # Pack loader
│   │   │   ├── accessors.ts            # Data accessors
│   │   │   ├── types.ts
│   │   │   └── ROUTER.md
│   │   ├── events/                      # Event Bus Service
│   │   │   ├── bus.ts                  # Event bus core
│   │   │   ├── types.ts                # Event types
│   │   │   ├── handlers/               # Event handlers
│   │   │   └── ROUTER.md
│   │   └── observability/               # Observability Service
│   │       ├── logger.ts               # Structured logging
│   │       ├── metrics.ts              # Metrics collection
│   │       ├── tracing.ts              # Distributed tracing
│   │       ├── backends/               # Output backends
│   │       │   ├── loki.ts
│   │       │   └── ROUTER.md
│   │       └── ROUTER.md
│   │
│   ├── workers/                         # ★ BACKGROUND WORKERS
│   │   ├── ROUTER.md
│   │   ├── base.worker.ts               # Worker base class
│   │   ├── outbox/                      # Outbox Worker
│   │   │   ├── outbox.worker.ts
│   │   │   ├── outbox.types.ts
│   │   │   └── ROUTER.md
│   │   ├── cache/                       # Cache Worker
│   │   │   ├── cache.worker.ts
│   │   │   └── ROUTER.md
│   │   ├── data-pipeline/               # Data Pipeline Worker
│   │   │   ├── pipeline.worker.ts
│   │   │   └── ROUTER.md
│   │   └── security/                    # Security Worker
│   │       ├── security.worker.ts
│   │       ├── security.state.ts
│   │       ├── security.alerts.ts
│   │       └── ROUTER.md
│   │
│   ├── shared/                          # ★ SHARED UTILITIES
│   │   ├── ROUTER.md
│   │   ├── types/                       # Shared type definitions
│   │   │   ├── pokemon.ts
│   │   │   ├── battle.ts
│   │   │   ├── events.ts
│   │   │   ├── common.ts
│   │   │   └── ROUTER.md
│   │   ├── utils/                       # Utility functions
│   │   │   ├── math.ts
│   │   │   ├── rng.ts
│   │   │   ├── time.ts
│   │   │   ├── format.ts
│   │   │   └── ROUTER.md
│   │   ├── constants/                   # Application constants
│   │   │   ├── game.ts
│   │   │   ├── discord.ts
│   │   │   └── ROUTER.md
│   │   └── errors/                      # Error definitions
│   │       ├── types.ts                # Error types (inline)
│   │       └── ROUTER.md
│   │
│   └── generated/                       # Generated Code
│       └── prisma/                     # Prisma client (auto-generated)
│
├── tests/                                # ★ TEST SUITES
│   ├── ROUTER.md
│   ├── unit/                            # Unit tests (mirror src/)
│   │   ├── core/
│   │   │   ├── battle/
│   │   │   └── encounter/
│   │   ├── features/
│   │   │   ├── homestead/
│   │   │   └── battle/
│   │   └── services/
│   │       ├── cache/
│   │       └── database/
│   ├── integration/                     # Integration tests
│   │   ├── database/
│   │   └── discord/
│   ├── e2e/                             # End-to-end tests
│   ├── fixtures/                        # Test fixtures
│   │   ├── battle/
│   │   ├── pokemon/
│   │   └── pbsl/                       # PBSL deterministic fixtures
│   │       └── ROUTER.md
│   └── helpers/                         # Test utilities
│       ├── mocks/
│       └── factories/
│
├── tools/                                # Vendored Tools
│   ├── ROUTER.md
│   └── pgsql17/                         # PostgreSQL binaries
│       └── ROUTER.md
│
├── Store/                                # Runtime Storage (git-ignored)
│   ├── ROUTER.md
│   ├── cache/                           # Runtime cache files
│   ├── logs/                            # Log files
│   ├── database/                        # Local database files
│   └── security-bot-state/              # Security bot persistence
│
├── ops/                                  # Operations & Governance
│   ├── ROUTER.md
│   ├── ROUTER.yaml                      # Canonical route map
│   ├── ROUTER_INDEX.yaml                # Router index
│   ├── NEXT.yaml                        # Current task pointer
│   └── ARCHIVE/                         # Archived tasks
│
├── playbooks/                            # Escalation Recipes
│   ├── ROUTER.md
│   └── escalate.md
│
├── router/                               # Meta-Router Implementation
│   ├── ROUTER.md
│   └── metaRouter.ts
│
├── package.json                          # Dependencies
├── tsconfig.json                         # TypeScript config
├── vitest.config.ts                      # Test config
├── eslint.config.js                      # Linting config
├── .env.example                          # Environment template
├── README.md                             # Project overview
├── Patch.md                              # AI Project Manager Contract
├── Tasklist.md                           # Task ledger
├── Prompt.md                             # AI prompt context
└── masterroutetable.md                   # Router index (text-only)
```

---

## Key Design Principles (Evidence-Based)

### Principle 1: Feature-First Organization

**Problem Discovered:** Bot layer has 84 files scattered across 8+ subdirectories, making it difficult to understand a complete feature.

**Current State:**
```
To understand "homestead" feature, navigate:
├── src/bot/homestead/home.ts           # Entry point
├── src/bot/homestead/heal.ts           # Healing logic
├── src/bot/homestead/starters.ts       # Starter selection
├── src/commands/homestead.ts           # Command definition (separate!)
├── src/services/homestead/             # Service layer (separate!)
└── src/core/trainer/                   # Domain logic (separate!)
```

**Ideal State:**
```
features/homestead/
├── homestead.command.ts      # Command definition
├── homestead.service.ts      # Business logic
├── homestead.embeds.ts       # Discord embeds
├── homestead.buttons.ts      # Button handlers
└── homestead.types.ts        # Feature types

Everything for "homestead" in ONE directory.
```

**Benefits:**
- Feature deletion = delete directory
- Feature testing = test one module
- Feature onboarding = read one directory

### Principle 2: Pure Core Domain

**Problem Discovered:** PBSL (Pokemon Battle Simulation Language) requires 100% deterministic tests. Core logic with I/O is untestable.

**Current State:** Mixed purity in src/core/ — some files have database calls.

**Ideal State:**
```typescript
// core/battle/damage.ts — PURE FUNCTION (no I/O)
export function calculateDamage(
  attacker: PokemonState,
  defender: PokemonState,
  move: Move,
  modifiers: DamageModifiers
): DamageResult {
  // Pure math only
  const baseDamage = calculateBaseDamage(attacker, defender, move);
  const typeMultiplier = getTypeEffectiveness(move.type, defender.types);
  const critMultiplier = modifiers.isCritical ? 1.5 : 1.0;
  const stabBonus = attacker.types.includes(move.type) ? 1.5 : 1.0;
  
  return {
    damage: Math.floor(baseDamage * typeMultiplier * critMultiplier * stabBonus),
    effectiveness: typeMultiplier,
    isCritical: modifiers.isCritical,
  };
}
```

**Verification Method:** If function has `async` or `await`, it's not pure.

### Principle 3: Explicit Dependencies

**Problem Discovered:** 30+ phantom references caused by implicit dependencies and undocumented modules.

**Current Anti-Pattern:**
```typescript
// Implicit global access
import { cache } from '../shared/cache';  // Where is this initialized?
import { db } from '../shared/prisma';    // Same database everywhere?
```

**Ideal Pattern:**
```typescript
// Explicit dependency injection
class BattleService {
  constructor(
    private readonly db: DatabaseService,
    private readonly cache: CacheService,
    private readonly events: EventBusService
  ) {}
  
  async startBattle(challengerId: string, defenderId: string): Promise<Battle> {
    // Dependencies are explicit and mockable
  }
}
```

### Principle 4: Single Configuration Source

**Problem Discovered:** 5+ configuration locations causing confusion and inconsistency.

**Ideal Pattern:**
```typescript
// config/index.ts — Single source of truth
import { loadEnvConfig } from './env';
import { loadDatabaseConfig } from './database';
import { loadDiscordConfig } from './discord';
import { loadWorkersConfig } from './workers';
import { loadObservabilityConfig } from './observability';
import { loadFeatureFlags } from './features';
import { loadGameConstants } from './game';

// Validate all configuration at startup
const env = loadEnvConfig();
const database = loadDatabaseConfig(env);
const discord = loadDiscordConfig(env);
const workers = loadWorkersConfig(env);
const observability = loadObservabilityConfig(env);
const features = loadFeatureFlags(env);
const game = loadGameConstants();

export const config = Object.freeze({
  env,
  database,
  discord,
  workers,
  observability,
  features,
  game,
});

// Type-safe access everywhere
import { config } from '@/config';
const dbUrl = config.database.url;
const botToken = config.discord.token;
```

### Principle 5: 100% TypeScript

**Problem Discovered:** ~40 .js files in src/ cause type safety gaps and tooling friction.

**Migration Priority:**
1. **Critical:** src/bot/main.js, src/bot/dripAlerts.js → Already migrated to src/bot/security/
2. **High:** src/lib/*.js (8 files) → Migrate to src/shared/utils/
3. **Medium:** src/utils/logger.js → Migrate to src/services/observability/
4. **Low:** src/services/cache.js → Migrate to src/services/cache/

### Principle 6: Router Discipline

**Problem Discovered:** 60+ ROUTER.md files verified, but phantom references accumulate without discipline.

**Requirement:** Every directory MUST have ROUTER.md documenting:
```markdown
# ROUTER
Title: [Module Name]
Purpose: [What this module does]
Owned Globs: [directory]/**
Last Updated (UTC): YYYY-MM-DDTHH:MM:SSZ

Notes:
- [Key integration points]
- [Recent changes with dates]

Areas:
- [file.ts] — [Purpose]
- [subdirectory/] — [Purpose] → ROUTER.md
```

---

## Migration Strategy

### Phase 0: Foundation (Week 0)
**Goal:** Establish infrastructure without breaking existing code

```
Tasks:
□ Create config/ directory with index.ts
□ Create infrastructure/ directory structure
□ Move render.yaml → infrastructure/render/
□ Move Docker files → infrastructure/docker/
□ Move observability configs → infrastructure/observability/
□ Verify build passes
```

### Phase 1: Configuration Consolidation (Week 1-2)
**Goal:** Single source of truth for all configuration

```
Tasks:
□ Create config/env.ts from src/config/env.ts
□ Create config/database.ts from scattered DB configs
□ Create config/discord.ts from Discord-related configs
□ Create config/workers.ts from worker configs
□ Create config/observability.ts from logging configs
□ Create config/features.ts for feature flags
□ Create config/game.ts for game constants
□ Update all imports to use @/config
□ Delete old config files
□ Verify build passes
□ Update ROUTER.md files
```

### Phase 2: Pure Core Extraction (Week 3-4)
**Goal:** Extract all pure logic to core/

```
Tasks:
□ Audit src/core/ for I/O operations
□ Extract pure functions to new core/ structure
□ Create core/pokemon/ domain
□ Create core/trainer/ domain
□ Ensure all core/ functions are synchronous
□ Add PBSL-compatible test fixtures
□ Verify 100% test coverage on core/
□ Update ROUTER.md files
```

### Phase 3: Services Layer (Week 5-6)
**Goal:** Clean service abstractions

```
Tasks:
□ Create services/database/ with repository pattern
□ Create services/cache/ with facade pattern
□ Create services/dexpack/ for data access
□ Create services/events/ for event bus
□ Create services/observability/ for logging
□ Migrate all database access to repositories
□ Update ROUTER.md files
```

### Phase 4: Feature Migration (Week 7-10)
**Goal:** Co-located feature modules

```
Week 7: Migrate homestead feature
Week 8: Migrate battle feature
Week 9: Migrate wilds feature
Week 10: Migrate remaining features (daily, dex, arena, ops)

Per-feature tasks:
□ Create features/{name}/ directory
□ Move command definition
□ Move service logic
□ Move embed builders
□ Move button handlers
□ Create feature types
□ Update Discord infrastructure
□ Add feature-level tests
□ Update ROUTER.md files
```

### Phase 5: Worker Restructure (Week 11-12)
**Goal:** Isolated worker modules

```
Tasks:
□ Create workers/base.worker.ts base class
□ Create workers/outbox/ module
□ Create workers/cache/ module
□ Create workers/data-pipeline/ module
□ Create workers/security/ module
□ Update render.yaml service definitions
□ Verify all workers start correctly
□ Update ROUTER.md files
```

### Phase 6: Legacy Cleanup (Week 13-14)
**Goal:** 100% TypeScript, zero legacy

```
Tasks:
□ Migrate src/lib/*.js → src/shared/utils/
□ Migrate src/utils/logger.js → src/services/observability/
□ Migrate remaining .js files → .ts
□ Delete empty directories
□ Final ROUTER.md audit
□ Final build verification
□ Final test verification
□ Update masterroutetable.md
```

---

## Comparison Matrix

| Aspect | Current | Ideal | Improvement |
|--------|---------|-------|-------------|
| **Config locations** | 5+ files | 1 directory | 80% reduction |
| **JS files in src/** | ~40 files | 0 files | 100% TypeScript |
| **Feature co-location** | Scattered | Grouped | Navigation ↑ |
| **Core purity** | Mixed I/O | Pure functions | Testability ↑ |
| **Worker isolation** | Flat | Structured | Clarity ↑ |
| **Test structure** | Flat | Mirrors src/ | Discoverability ↑ |
| **ROUTER.md coverage** | 60+ files | Every directory | 100% coverage |
| **Phantom references** | 30+ fixed | 0 allowed | Integrity ↑ |
| **Documentation** | Bible system | Bible + feature docs | Completeness ↑ |

---

## Anti-Patterns Discovered

### Anti-Pattern 1: Circular Dependencies
```
❌ DETECTED in audit:
feature/battle → service/database → feature/battle

✅ IDEAL:
feature/battle → service/database → shared/types
```

### Anti-Pattern 2: God Modules
```
❌ DETECTED:
src/shared/prisma.ts (handles 3 database connections + heartbeat + stats)

✅ IDEAL:
services/database/prisma.ts (client only)
services/database/health.ts (heartbeat)
services/database/stats.ts (telemetry)
```

### Anti-Pattern 3: Implicit Initialization Order
```
❌ DETECTED (from copilot-instructions):
"Never call logger functions before Service Registry initializes"

✅ IDEAL:
Explicit initialization chain with dependency graph validation
```

### Anti-Pattern 4: Phantom Documentation
```
❌ DETECTED (13 phantom paths in Meeting #6):
- scripts/guards/ROUTER.md (typo: should be guard/)
- src/shared/storage/ (never existed)
- ops/INBOX/ (never existed)

✅ IDEAL:
Quarterly integrity audits with path verification
```

### Anti-Pattern 5: Data Directory Confusion
```
❌ CURRENT:
data/           # Static JSON
src/data/       # Runtime loader
src/data_pipeline/  # Schema definitions

✅ IDEAL:
data/           # Static JSON (unchanged)
services/dexpack/   # Runtime loader (clear purpose)
scripts/build/      # Pipeline scripts (clear stage)
```

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Breaking changes** | High | High | Incremental migration, feature flags |
| **Test regression** | Medium | High | Run tests after each phase |
| **Documentation drift** | Medium | Medium | ROUTER.md updates in same PR |
| **Developer friction** | Low | Medium | Clear migration guide |
| **Performance regression** | Low | High | Benchmark before/after |

---

## Success Metrics

After complete migration:

| Metric | Target | Verification |
|--------|--------|--------------|
| **TypeScript coverage** | 100% | `find src -name "*.js" | wc -l` = 0 |
| **Config locations** | 1 directory | Only `config/` imports env vars |
| **ROUTER.md coverage** | Every directory | `find . -type d -exec test -f {}/ROUTER.md \;` |
| **Phantom references** | 0 | Quarterly path verification |
| **Core purity** | 100% | No `async` in `core/**/*.ts` |
| **Feature isolation** | Complete | Each feature in `features/{name}/` |
| **Test coverage** | 80%+ | `vitest --coverage` |

---

## Conclusion

This blueprint represents a **significant architectural improvement** based on concrete evidence gathered during 6 audit meetings:

- **121 files analyzed** across the codebase
- **7,450+ lines** audited and cleaned
- **30+ phantom references** discovered and fixed
- **1,425 lines** of dead code removed
- **60+ ROUTER.md** files verified

The current architecture is **functional and stable**, but this blueprint provides a clear path toward:

1. **Better Developer Experience** — Clear navigation, consistent patterns
2. **Improved Testability** — Pure core, mockable services
3. **Faster Onboarding** — Feature-first organization
4. **Reduced Technical Debt** — 100% TypeScript, zero phantoms
5. **Scalable Structure** — Feature modules, worker isolation

This document serves as the **north star** for incremental improvements and new feature development.

---

**Document Version:** 2.0 (Enhanced by Cleanup & Consolidation Specialist)  
**Evidence Base:** Architecture Audit Meetings #1-6 (2025-12-20 to 2025-12-23)  
**Review Status:** PROPOSAL — Awaiting leadership approval  
**Next Review:** 2026-Q1 (post-migration checkpoint)
