---
applyTo: 'prisma/**'
---
# Database & Prisma Instructions — Pokémon Infinity Gauntlet

## Project Leadership

**Creator & CEO:** DRIPTVDD | **Discord ID:** `563220840708177927` (anti-spoofing identifier)

## 📖 Comprehensive Reference

**Prisma 7 Bible:** `docs/prisma-7-bible.md` — Complete AI agent playbook (1000+ lines) covering:

### Emergency & Triage
- Emergency production triage playbook (stop-the-bleeding options)
- Common failure modes with exact fixes (7 documented errors)
- Rollback procedures and hotfix patterns

### Migration & Configuration
- Step-by-step migration guide (Prisma 6 → 7)
- Engine type selection (`library` vs `client`) — CRITICAL for direct PostgreSQL
- Golden configuration snippets (copy/paste ready)
- `prisma.config.ts` patterns and URL configuration

### Deployment & Operations
- Render deployment model with pre-deploy migrations
- PgBouncer integration and connection pooling
- Two-URL pattern (direct for migrations, pooled for runtime)

### Game Persistence
- Catalog vs Player State design patterns
- Transaction patterns for deterministic game mechanics
- RNG + audit trail patterns for anti-cheat
- Claude task templates for schema modifications

## Prisma 7 Architecture (CRITICAL - Updated 2025-12-18)

### Engine Type Configuration (Prisma 7 Breaking Change)

Prisma 7 introduced a breaking change to engine type selection. For direct PostgreSQL connections (our architecture), you MUST explicitly set `engineType = "library"` in the schema:

```prisma
// prisma/schema.prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
  // Prisma 7: Must explicitly set engineType for direct PostgreSQL connections
  // "library" uses the native query engine (default pre-Prisma 7)
  // "client" requires Accelerate or driver adapter - NOT for direct connections
  engineType    = "library"
}

// Prisma 7+: URL configured in prisma.config.ts (NOT in schema.prisma)
datasource db {
  provider = "postgresql"
}
```

**⚠️ CRITICAL:** Without `engineType = "library"`, Prisma 7 defaults to `"client"` which requires Accelerate or a driver adapter and will crash with:
```
PrismaClientConstructorValidationError: Using engine type "client" requires either "adapter" or "accelerateUrl" to be provided to PrismaClient constructor.
```

### Database URL Configuration (Prisma 7)

Prisma 7 removed URL configuration from `schema.prisma`. Use `prisma.config.ts`:

```typescript
// prisma.config.ts (root directory)
import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl = 
  process.env.PROD_DATABASE_URL || 
  process.env.DATABASE_URL || 
  process.env.RENDER_DB_EXTERNAL_URL ||
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
```

### PrismaClient Constructor (Prisma 7 Breaking Change)

Prisma 7 removed the `datasources` option from PrismaClient constructor:

```typescript
// ❌ WRONG (Prisma 6 pattern - WILL CRASH in Prisma 7)
const client = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});

// ✅ CORRECT (Prisma 7 pattern)
// URL configured via prisma.config.ts and process.env.DATABASE_URL
const client = new PrismaClient({
  log: [
    { emit: "stdout", level: "error" },
    { emit: "event", level: "query" }
  ]
});
```

### Three-Database System

```typescript
// THREE Prisma clients initialized on startup:
import { prisma, onPremiseDevPrisma, onPremiseExperimentPrisma } from "./shared/prisma.js";

// CLOUD-PROD-MASTER: All production operations
const prodUsers = await prisma.user.findMany();

// ONPREMISE-DEV-PRIMARY: Workstation offline development
if (onPremiseDevPrisma) {
  const localUsers = await onPremiseDevPrisma.user.findMany();
}

// ONPREMISE-DEV-EXPERIMENT: Migration testing (isolated)
if (onPremiseExperimentPrisma) {
  const experimentUsers = await onPremiseExperimentPrisma.user.findMany();
}
```

### Client Import Location

```typescript
// ✅ CORRECT: Import from @prisma/client (standard location)
import { PrismaClient, Prisma } from "@prisma/client";
import type { User, Pokemon, Battle } from "@prisma/client";
```

### JSON Type Handling (Prisma 7.x)

Prisma 7.x has strict `InputJsonValue` typing. Use our utility helpers for domain types:

```typescript
import { toJsonValue, fromJsonValue } from '../shared/json-types.js';

// ✅ Writing to JSON fields
const pokemon = await prisma.pokemonInstance.create({
  data: {
    ivsJson: toJsonValue(stats),     // StatSpread → InputJsonValue
    movesJson: toJsonValue(moves),   // MoveSlot[] → InputJsonValue
  }
});

// ✅ Reading from JSON fields  
const moves = fromJsonValue<MoveSlot[]>(pokemon.movesJson) ?? [];

// ✅ Nullable JSON with DbNull fallback
beforeJson: entry.beforeJson ? toJsonValue(entry.beforeJson) : Prisma.DbNull,

// ✅ Filtering non-null JSON (NOT { not: null })
where: { resultJson: { not: Prisma.JsonNull } }
```

**Domain Types That Need Conversion:**
- `StatSpread` → `ivsJson`, `evsJson`
- `MoveSlot[]` → `movesJson`
- `BattleResult` → `resultJson`
- `CompactLogEntry[]` → `logCompact`
- `Record<string, unknown>` → `beforeJson`, `afterJson`

### Canonical Database Naming (ABSOLUTE - Never Violate)

| Canonical Name | Environment Variable | Prisma Client | Purpose |
|----------------|---------------------|---------------|---------|
| **CLOUD-PROD-MASTER** | `PROD_DATABASE_URL` | `prisma` | Production database |
| **ONPREMISE-DEV-PRIMARY** | `DATABASE_ONPREMISE_DEV_PRIMARY` | `onPremiseDevPrisma` | Workstation development |
| **ONPREMISE-DEV-EXPERIMENT** | `DATABASE_ONPREMISE_DEV_EXPERIMENT` | `onPremiseExperimentPrisma` | Migration testing |

**🚫 BANNED identifiers:** "LOCAL", "PRIMARY LOCAL", "EXPERIMENTAL" (standalone), "DEV_DATABASE_URL"

## Prisma 7 Breaking Changes Summary

| Change | Prisma 6 | Prisma 7 | Fix |
|--------|----------|----------|-----|
| **Engine Type** | Auto-detected | Defaults to "client" | Add `engineType = "library"` |
| **URL Config** | In schema.prisma | In prisma.config.ts | Create config file |
| **datasources option** | Supported | REMOVED | Remove from constructor |
| **Generator output** | Optional | Required for non-default | Explicit if needed |

## Schema Change Workflow

### Migration Process
```powershell
# 1. Create migration (development)
npx prisma migrate dev --name descriptive-name

# 2. Test on ONPREMISE-DEV-EXPERIMENT first
psql $DATABASE_ONPREMISE_DEV_EXPERIMENT -f prisma/migrations/YYYYMMDD.../migration.sql

# 3. Validate on ONPREMISE-DEV-PRIMARY
npm run db:cli -- count User --target onpremise-dev

# 4. Deploy to CLOUD-PROD-MASTER (production)
npx prisma migrate deploy
```

### Schema Design Principles
1. **Always add `@default` values** for new non-nullable columns
2. **Create indexes** for frequently queried fields
3. **Use `@relation` explicitly** with `onDelete` and `onUpdate`
4. **Add `@map` and `@@map`** for snake_case database columns
5. **Include `createdAt` and `updatedAt`** on all models

### Example Model Pattern
```prisma
model User {
  id              String          @id @default(uuid())
  discordId       String          @unique @map("discord_id")
  username        String
  trainerProfile  TrainerProfile?
  party           Pokemon[]
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")

  @@map("users")
  @@index([discordId])
}
```

## Query Patterns

### Always Use Select/Include
```typescript
// ✅ GOOD: Explicit field selection
const user = await prisma.user.findUnique({
  where: { discordId },
  select: {
    id: true,
    username: true,
    trainerProfile: { select: { level: true, badges: true } }
  }
});

// ❌ BAD: Fetches all fields (performance issue)
const user = await prisma.user.findUnique({ where: { discordId } });
```

### Transaction Pattern
```typescript
// Use transactions for multi-table operations
const result = await prisma.$transaction(async (tx) => {
  const user = await tx.user.update({
    where: { discordId },
    data: { coins: { decrement: cost } }
  });
  
  const item = await tx.item.create({
    data: { userId: user.id, type: itemType }
  });
  
  return { user, item };
});
```

### Batch Operations
```typescript
// Use createMany for bulk inserts
await prisma.pokemon.createMany({
  data: pokemonArray,
  skipDuplicates: true
});

// Use updateMany for bulk updates
await prisma.pokemon.updateMany({
  where: { trainerId, isActive: false },
  data: { deletedAt: new Date() }
});
```

## Performance Guidelines

### Query Optimization
- **Avoid N+1:** Use `include` or `select` with nested relations
- **Pagination:** Always use `take` and `skip` for large datasets
- **Caching:** Check L1 cache before database queries
- **Indexing:** Ensure queries use indexed fields

### Connection Management
- **Connection limit:** PostgreSQL default 100 connections
- **Heartbeat:** 30s interval for connection health
- **Timeout:** 5s connection timeout, 10s query timeout

## Live Game Requirements (CRITICAL)

**Performance SLA for gameplay:**
- **L1 Cache reads:** <1μs (Pokemon data, moves, type chart)
- **Write Buffer pushes:** <10μs (battle logs, anomalies)
- **Database writes:** <50μs (game state, battles)
- **Cache refresh:** <1s (hourly background task)

## Common Prisma 7 Errors

### Error: "Using engine type 'client' requires adapter or accelerateUrl"
**Cause:** Missing `engineType = "library"` in generator block
**Fix:** Add to `prisma/schema.prisma`:
```prisma
generator client {
  provider   = "prisma-client-js"
  engineType = "library"
}
```

### Error: "Unknown property datasources provided to PrismaClient constructor"
**Cause:** Using deprecated Prisma 6 `datasources` option
**Fix:** Remove `datasources` from PrismaClient constructor. Configure URL via `prisma.config.ts`.

### Error: "Cannot find module '../generated/prisma/client.js'"
**Cause:** Custom output path configured but client not regenerated
**Fix:** Run `npx prisma generate` after schema changes.

## Common Mistakes to Avoid

1. **Hardcoding connection strings** — Always use environment variables
2. **Missing transactions** — Multi-table operations need atomic commits
3. **Forgetting indexes** — Check query plans for full table scans
4. **Not handling null** — Prisma returns `null` for missing records
5. **Leaking connections** — Always close clients in shutdown handlers
6. **Using Prisma 6 patterns** — Check breaking changes above

## Reference Documentation

- **Complete Guide:** `docs/operations-bible/database-operations-runbook-comprehensive.md` (25 pages)
- **Schema Reference:** `prisma/schema.prisma`
- **Migration History:** `prisma/migrations/`
- **CLI Tool:** `npm run db:cli -- help`
- **Prisma 7 Upgrade Guide:** https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7

