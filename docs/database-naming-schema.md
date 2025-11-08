# Database Naming Schema — Canonical Reference

**Status:** Active (2025-11-08)  
**Authority:** This document is the single source of truth for all database terminology in the Infinity Gauntlet codebase.  
**Purpose:** Establish permanent, scalable naming conventions that clearly distinguish physical infrastructure (CLOUD vs ONPREMISE) and database roles (MASTER, RUNTIME, replica).

---

## Quick Reference

| Database Name | Physical Location | Role | Environment Variable | Prisma Client | CLI Target |
|---------------|-------------------|------|---------------------|---------------|------------|
| **CLOUD-DEV-MASTER** | Render (managed Postgres) | Schema source of truth, gameplay backup | `DEV_DATABASE_URL` | `devPrisma` | `cloud-dev` |
| **CLOUD-PROD-RUNTIME** | Render Worker Node (1GB disk) | Active production gameplay | `PROD_DATABASE_URL` | `prisma` | `cloud-prod` |
| **ONPREMISE-DEV-PRIMARY** | Workstation (port 55433) | Development database | `DATABASE_ONPREMISE_DEV_PRIMARY` | `onPremiseDevPrisma` | `onpremise-dev` |
| **ONPREMISE-DEV-EXPERIMENT** | Workstation (port 55434) | Migration testing | `DATABASE_ONPREMISE_DEV_EXPERIMENT` | `onPremiseExperimentPrisma` | `onpremise-experiment` |

---

## Naming Conventions

### Physical Infrastructure

**CLOUD** — Production infrastructure hosted on Render
- All Render-managed databases
- Persistent disks on Render workers
- Accessible via internet (with credentials)

**ONPREMISE** — Development infrastructure on local workstation
- Localhost PostgreSQL clusters (127.0.0.1)
- Development and testing only
- NOT accessible from cloud services

### Database Roles

**MASTER** — Source of truth for schema and migrations
- Authoritative for database structure
- Receives schema changes first
- Replicates structure to other nodes

**RUNTIME** — Active operational database
- Handles live gameplay operations (battles, encounters, trainer CRUD)
- Optimized for read/write performance
- PRIMARY database for application queries

**PRIMARY** — Main development database
- Used for day-to-day development work
- Mirrors production structure
- Safe for experimentation with backups

**EXPERIMENT** — Isolated testing database
- For destructive operations (DROP TABLE, etc.)
- Migration testing before deployment
- Can be reset without affecting other databases

---

## Database Specifications

### CLOUD-DEV-MASTER

**Purpose:** Schema source of truth and gameplay data backup  
**Physical Location:** Render managed PostgreSQL instance  
**Environment Variable:** `DEV_DATABASE_URL`  
**Prisma Client:** `devPrisma`  
**CLI Target:** `--target cloud-dev`  
**Connection:** Direct PostgreSQL (not pooled)  
**Role in Replication:**
- **Outbound:** Schema changes → CLOUD-PROD-RUNTIME
- **Inbound:** Gameplay data ← CLOUD-PROD-RUNTIME (continuous sync)
- **Outbound:** Full replica → ONPREMISE-DEV-PRIMARY (pull-only)

**Usage:**
- Apply migrations via `npx prisma migrate deploy`
- Backup gameplay data from CLOUD-PROD-RUNTIME
- Source for ONPREMISE development database refreshes

**Access Pattern:**
```typescript
import { devPrisma } from '../shared/prisma.js';

if (devPrisma) {
  const users = await devPrisma.user.findMany();
}
```

---

### CLOUD-PROD-RUNTIME

**Purpose:** Active production gameplay database  
**Physical Location:** Render Worker Node internal disk (1GB persistent storage)  
**Environment Variable:** `PROD_DATABASE_URL`  
**Prisma Client:** `prisma` (PRIMARY for gameplay)  
**CLI Target:** `--target cloud-prod` (default)  
**Connection:** Direct PostgreSQL (not pooled)  
**Role in Replication:**
- **Inbound:** Schema changes ← CLOUD-DEV-MASTER (migrations)
- **Outbound:** Gameplay data → CLOUD-DEV-MASTER (continuous backup every 5 minutes)

**Usage:**
- ALL live gameplay operations (battles, encounters, trainer CRUD)
- Optimized for <50ms latency via local disk
- PRIMARY database for bot runtime

**Access Pattern:**
```typescript
import { prisma } from '../shared/prisma.js';

// Primary client for all gameplay operations
const battle = await prisma.battle.create({
  data: { trainerId: userId, status: 'active' }
});
```

---

### ONPREMISE-DEV-PRIMARY

**Purpose:** Main development database on workstation  
**Physical Location:** Workstation PostgreSQL cluster (Store/onpremise-dev-primary/)  
**Port:** 55433  
**Database Name:** `infinity_gauntlet_dev`  
**Environment Variable:** `DATABASE_ONPREMISE_DEV_PRIMARY`  
**Prisma Client:** `onPremiseDevPrisma`  
**CLI Target:** `--target onpremise-dev`  
**Connection:** `postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_dev`  
**Role in Replication:**
- **Inbound:** Full replica ← CLOUD-DEV-MASTER (pull-only)
- **Outbound:** Manual clone → ONPREMISE-DEV-EXPERIMENT (offline sync)

**Usage:**
- Local development with production-like data
- Testing locally without cloud connectivity
- Source for ONPREMISE-DEV-EXPERIMENT clones

**Access Pattern:**
```typescript
import { onPremiseDevPrisma } from '../shared/prisma.js';

if (onPremiseDevPrisma) {
  const species = await onPremiseDevPrisma.species.findMany();
}
```

**Bootstrap:**
```bash
npm run ops:bootstrap-onpremise-dev
```

---

### ONPREMISE-DEV-EXPERIMENT

**Purpose:** Isolated migration testing database  
**Physical Location:** Workstation PostgreSQL cluster (Store/onpremise-dev-experiment/)  
**Port:** 55434  
**Database Name:** `infinity_gauntlet_experiment`  
**Environment Variable:** `DATABASE_ONPREMISE_DEV_EXPERIMENT`  
**Prisma Client:** `onPremiseExperimentPrisma`  
**CLI Target:** `--target onpremise-experiment`  
**Connection:** `postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment`  
**Role in Replication:**
- **Inbound:** Manual clone ← ONPREMISE-DEV-PRIMARY (default, offline)
- **Inbound:** Manual clone ← CLOUD-DEV-MASTER (optional, downloads from cloud)

**Usage:**
- Test migrations before applying to ONPREMISE-DEV-PRIMARY
- Destructive operations (DROP TABLE, schema experiments)
- Safe to reset/destroy without affecting other databases

**Access Pattern:**
```typescript
import { onPremiseExperimentPrisma } from '../shared/prisma.js';

if (onPremiseExperimentPrisma) {
  // Test migration effects
  const count = await onPremiseExperimentPrisma.user.count();
}
```

**Bootstrap:**
```bash
# Clone from ONPREMISE-DEV-PRIMARY (default, offline)
npm run ops:bootstrap-onpremise-experiment

# Clone from CLOUD-DEV-MASTER (downloads from cloud)
npm run ops:bootstrap-onpremise-experiment -- --source cloud-dev
```

---

## Replication Architecture

### Bidirectional Cloud Replication

**Schema Flow:** CLOUD-DEV-MASTER → CLOUD-PROD-RUNTIME
- Migrations applied to CLOUD-DEV-MASTER first
- Schema changes pulled to CLOUD-PROD-RUNTIME via `ops:pull-schema-to-prod`
- Preserves gameplay data on CLOUD-PROD-RUNTIME

**Gameplay Flow:** CLOUD-PROD-RUNTIME → CLOUD-DEV-MASTER
- Continuous sync every 5 minutes via `ops:sync-daemon-cloud-prod`
- Only syncs changed rows (User.updatedAt, PokemonInstance.updatedAt, Battle.createdAt)
- CLOUD-DEV-MASTER serves as gameplay data backup

### Development Mirror Flow

**Full Replica:** CLOUD-DEV-MASTER → ONPREMISE-DEV-PRIMARY
- Pull-only replication (ONPREMISE does NOT push to cloud)
- Manual refresh via `npm run ops:bootstrap-onpremise-dev`
- Downloads complete snapshot via pg_dump

**Offline Clone:** ONPREMISE-DEV-PRIMARY → ONPREMISE-DEV-EXPERIMENT
- Local-only replication (no cloud connectivity)
- Manual clone via `npm run ops:bootstrap-onpremise-experiment`
- 100% offline operation

---

## Environment Variables

### Production (Cloud)

```bash
# CLOUD-DEV-MASTER (Render managed Postgres)
DEV_DATABASE_URL=postgresql://user:pass@host:port/database

# CLOUD-PROD-RUNTIME (Worker Node 1GB disk)
PROD_DATABASE_URL=postgresql://user:pass@localhost:5432/infinity_gauntlet_prod
```

### Development (On-Premise)

```bash
# ONPREMISE-DEV-PRIMARY (workstation port 55433)
DATABASE_ONPREMISE_DEV_PRIMARY=postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_dev

# ONPREMISE-DEV-EXPERIMENT (workstation port 55434)
DATABASE_ONPREMISE_DEV_EXPERIMENT=postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment
```

### Legacy (Deprecated)

```bash
# DEPRECATED: Use DEV_DATABASE_URL instead
RENDER_DB_EXTERNAL_URL=...

# DEPRECATED: Use DATABASE_ONPREMISE_DEV_PRIMARY instead
DATABASE_LOCAL_URL=...
DATABASE_LOCAL_PRIMARY=...

# DEPRECATED: Use DATABASE_ONPREMISE_DEV_EXPERIMENT instead
DATABASE_EXPERIMENT_URL=...
```

---

## Prisma Client Naming

**File:** `src/shared/prisma.ts`

```typescript
import { PrismaClient } from '@prisma/client';

// CLOUD-DEV-MASTER (schema source of truth)
export const devPrisma: PrismaClient | null = new PrismaClient({
  datasources: { db: { url: process.env.DEV_DATABASE_URL } }
});

// CLOUD-PROD-RUNTIME (PRIMARY for gameplay operations)
export const prisma: PrismaClient = new PrismaClient({
  datasources: { db: { url: process.env.PROD_DATABASE_URL } }
});

// ONPREMISE-DEV-PRIMARY (development database)
export const onPremiseDevPrisma: PrismaClient | null = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_ONPREMISE_DEV_PRIMARY } }
});

// ONPREMISE-DEV-EXPERIMENT (migration testing)
export const onPremiseExperimentPrisma: PrismaClient | null = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_ONPREMISE_DEV_EXPERIMENT } }
});
```

---

## CLI Target Names

**File:** `scripts/db_admin.ts`

```bash
# CLOUD-DEV-MASTER
npm run db:cli -- status --target cloud-dev

# CLOUD-PROD-RUNTIME (default)
npm run db:cli -- status --target cloud-prod
npm run db:cli -- status  # same as cloud-prod

# ONPREMISE-DEV-PRIMARY
npm run db:cli -- status --target onpremise-dev

# ONPREMISE-DEV-EXPERIMENT
npm run db:cli -- status --target onpremise-experiment
```

---

## npm Scripts

### Cloud Operations

```bash
# Pull schema changes from CLOUD-DEV-MASTER to CLOUD-PROD-RUNTIME
npm run ops:pull-schema-to-prod

# Push gameplay data from CLOUD-PROD-RUNTIME to CLOUD-DEV-MASTER
npm run ops:push-gameplay-to-dev

# Start continuous sync daemon (PROD → DEV every 5 minutes)
npm run ops:sync-daemon-cloud-prod
```

### On-Premise Operations

```bash
# Bootstrap ONPREMISE-DEV-PRIMARY from CLOUD-DEV-MASTER
npm run ops:bootstrap-onpremise-dev

# Bootstrap ONPREMISE-DEV-EXPERIMENT from ONPREMISE-DEV-PRIMARY (default)
npm run ops:bootstrap-onpremise-experiment

# Bootstrap ONPREMISE-DEV-EXPERIMENT from CLOUD-DEV-MASTER (optional)
npm run ops:bootstrap-onpremise-experiment -- --source cloud-dev

# Sync ONPREMISE-DEV-EXPERIMENT from ONPREMISE-DEV-PRIMARY
npm run ops:sync-onpremise-experiment

# Start/Stop on-premise databases
npm run ops:start-onpremise-dev
npm run ops:stop-onpremise-dev
npm run ops:start-onpremise-experiment
npm run ops:stop-onpremise-experiment

# Status of all on-premise databases
npm run ops:status-onpremise-dbs
```

---

## Directory Structure

```
Store/
├── onpremise-dev-primary/          # ONPREMISE-DEV-PRIMARY data
│   ├── pg_hba.conf
│   ├── postgresql.conf
│   └── local-url.txt               # Connection string
├── onpremise-dev-experiment/       # ONPREMISE-DEV-EXPERIMENT data
│   ├── pg_hba.conf
│   ├── postgresql.conf
│   └── experiment-url.txt          # Connection string
└── sync-logs/                      # Bidirectional sync logs
    ├── schema-pull-YYYYMMDD-HHMMSS.log
    └── gameplay-push-YYYYMMDD-HHMMSS.log
```

---

## Migration Workflow

### Applying Schema Changes

```bash
# Step 1: Apply migration to CLOUD-DEV-MASTER
psql $DEV_DATABASE_URL -f prisma/migrations/XXXXXX_migration_name/migration.sql

# Step 2: Pull schema to CLOUD-PROD-RUNTIME
npm run ops:pull-schema-to-prod

# Step 3: Refresh ONPREMISE-DEV-PRIMARY (optional)
npm run ops:bootstrap-onpremise-dev
```

### Testing Migrations

```bash
# Step 1: Clone to ONPREMISE-DEV-EXPERIMENT
npm run ops:bootstrap-onpremise-experiment

# Step 2: Test migration on EXPERIMENT
psql $DATABASE_ONPREMISE_DEV_EXPERIMENT -f prisma/migrations/XXXXXX/migration.sql

# Step 3: Validate results
npm run db:cli -- count User --target onpremise-experiment

# Step 4: Test rollback if needed
psql $DATABASE_ONPREMISE_DEV_EXPERIMENT -f prisma/migrations/XXXXXX/rollback.sql

# Step 5: If successful, apply to CLOUD-DEV-MASTER (Step 1 above)
```

---

## Terminology Rules

### ✅ ALWAYS USE

- **CLOUD-DEV-MASTER** for Render managed Postgres (DEV_DATABASE_URL)
- **CLOUD-PROD-RUNTIME** for Worker Node gameplay database (PROD_DATABASE_URL)
- **ONPREMISE-DEV-PRIMARY** for workstation development database (port 55433)
- **ONPREMISE-DEV-EXPERIMENT** for workstation testing database (port 55434)
- **Prisma client names:** `devPrisma`, `prisma`, `onPremiseDevPrisma`, `onPremiseExperimentPrisma`
- **CLI targets:** `cloud-dev`, `cloud-prod`, `onpremise-dev`, `onpremise-experiment`

### ❌ NEVER USE

- "local database" (ambiguous — use ONPREMISE-DEV-PRIMARY or ONPREMISE-DEV-EXPERIMENT)
- "LOCAL" or "PRIMARY LOCAL" (use ONPREMISE-DEV-PRIMARY)
- "EXPERIMENTAL" without prefix (use ONPREMISE-DEV-EXPERIMENT)
- "DEV database" without prefix (use CLOUD-DEV-MASTER)
- "PROD database" without prefix (use CLOUD-PROD-RUNTIME)
- "local Prisma" or "localPrisma" (use onPremiseDevPrisma)
- "experiment Prisma" or "experimentPrisma" (use onPremiseExperimentPrisma)
- `DATABASE_LOCAL_URL` (use DATABASE_ONPREMISE_DEV_PRIMARY)
- `DATABASE_EXPERIMENT_URL` (use DATABASE_ONPREMISE_DEV_EXPERIMENT)

---

## Contract (Absolute)

**From Patch.md:**

> **Database Naming Schema:** ALL database references must use canonical names from `docs/database-naming-schema.md`: CLOUD-DEV-MASTER, CLOUD-PROD-RUNTIME, ONPREMISE-DEV-PRIMARY, ONPREMISE-DEV-EXPERIMENT. Never use: "local database", "LOCAL", "PRIMARY LOCAL", "EXPERIMENTAL" without prefix.

**Enforcement:**
- AI agents MUST consult this document before any database operation
- Pull requests with non-canonical names will be rejected
- Guard scripts check for deprecated terminology

---

## References

**Cross-References:**
- See `AGENTS.md` for database architecture overview and operational workflows
- See `docs/database-url-selection.md` for canonical URL selection logic
- See `docs/database-configuration.md` for dual-client architecture
- See `docs/db-replication-architecture.md` for replication flows
- See `docs/dual-onpremise-database-guide.md` for ONPREMISE setup guide
- See `ops/DB_BOOTSTRAP.md` for migration deployment procedures
- See `Patch.md` Absolutes section for contract enforcement

**Referenced By:**
- All database documentation files (`docs/database-*.md`)
- `src/shared/prisma.ts` (Prisma client definitions)
- `src/shared/config.ts` (environment variable mapping)
- `scripts/db_admin.ts` (CLI target resolution)
- `ops/NAMING-MIGRATION.md` (terminology migration checklist)

---

**Last Updated:** 2025-11-08  
**Revision:** 1.0  
**Status:** Active — This document is authoritative for all database naming decisions.
