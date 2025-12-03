---
applyTo: 'prisma/**'
---
# Database & Prisma Instructions — Pokémon Infinity Gauntlet

## Database Architecture (CRITICAL)

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

### Canonical Database Naming (ABSOLUTE - Never Violate)

| Canonical Name | Environment Variable | Prisma Client | Purpose |
|----------------|---------------------|---------------|---------|
| **CLOUD-PROD-MASTER** | `PROD_DATABASE_URL` | `prisma` | Production database |
| **ONPREMISE-DEV-PRIMARY** | `DATABASE_ONPREMISE_DEV_PRIMARY` | `onPremiseDevPrisma` | Workstation development |
| **ONPREMISE-DEV-EXPERIMENT** | `DATABASE_ONPREMISE_DEV_EXPERIMENT` | `onPremiseExperimentPrisma` | Migration testing |

**🚫 BANNED identifiers:** "LOCAL", "PRIMARY LOCAL", "EXPERIMENTAL" (standalone), "DEV_DATABASE_URL"

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

## Common Mistakes to Avoid

1. **Hardcoding connection strings** — Always use environment variables
2. **Missing transactions** — Multi-table operations need atomic commits
3. **Forgetting indexes** — Check query plans for full table scans
4. **Not handling null** — Prisma returns `null` for missing records
5. **Leaking connections** — Always close clients in shutdown handlers

## Reference Documentation

- **Complete Guide:** `docs/operations-bible/database-operations-runbook-comprehensive.md` (25 pages)
- **Schema Reference:** `prisma/schema.prisma`
- **Migration History:** `prisma/migrations/`
- **CLI Tool:** `npm run db:cli -- help`
