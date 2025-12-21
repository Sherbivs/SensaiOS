# ROUTER

**Title:** Database Operations Domain  
**Purpose:** Database management CLI — status, queries, health checks, schema diffing, migrations  
**Owned Globs:** `scripts/db/**`  
**Last Updated (UTC):** 2025-12-21T00:00:00Z

## Overview

Unified CLI for all database operations. Supports multiple database targets including production (Render-managed), development mirror, and experiment cluster.

## Database Targets

| Target | Env Variable | Description |
|--------|--------------|-------------|
| `cloud-prod` | `PROD_DATABASE_URL` | Production (Render-managed PostgreSQL) |
| `onpremise-dev` | `DATABASE_ONPREMISE_DEV_PRIMARY` | Workstation development mirror |
| `onpremise-experiment` | `DATABASE_ONPREMISE_DEV_EXPERIMENT` | Migration testing cluster |

## Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `status` | Connection status | `npx tsx scripts/db/cli.ts status` |
| `query` | Ad-hoc SQL query | `npx tsx scripts/db/cli.ts query "SELECT 1"` |
| `counts` | Table row counts | `npx tsx scripts/db/cli.ts counts` |
| `smoke` | Health checks | `npx tsx scripts/db/cli.ts smoke` |
| `diff` | Schema comparison | `npx tsx scripts/db/cli.ts diff cloud-prod onpremise-dev` |
| `migrations` | Migration history | `npx tsx scripts/db/cli.ts migrations` |

## Files

- **cli.ts** — Main CLI entry point with all commands. Uses psql for database operations.

## Usage Examples

```bash
# Check production status
npx tsx scripts/db/cli.ts status

# Check all databases
npx tsx scripts/db/cli.ts status --all

# Check specific database
npx tsx scripts/db/cli.ts status -t onpremise-dev

# Run ad-hoc query
npx tsx scripts/db/cli.ts query "SELECT COUNT(*) FROM \"User\""

# Query with target
npx tsx scripts/db/cli.ts query "SELECT * FROM \"User\" LIMIT 5" -t cloud-prod

# Get table counts
npx tsx scripts/db/cli.ts counts

# Count specific table
npx tsx scripts/db/cli.ts counts --table Pokemon

# Health check
npx tsx scripts/db/cli.ts smoke
npx tsx scripts/db/cli.ts smoke -v  # verbose

# Compare schemas
npx tsx scripts/db/cli.ts diff cloud-prod onpremise-dev

# View migration history
npx tsx scripts/db/cli.ts migrations -n 20
```

## Core Tables Monitored

| Table | Purpose |
|-------|---------|
| `User` | Player accounts |
| `TrainerProfile` | Trainer data |
| `Pokemon` | Pokemon instances |
| `Species` | Pokemon species definitions |
| `Move` | Move definitions |
| `Battle` | Battle records |
| `Encounter` | Wild encounter logs |
| `Item` | Inventory items |
| `BusMessage` | Event bus messages |

## Health Checks (Smoke Command)

| Check | Pass Criteria |
|-------|--------------|
| Connectivity | Can connect and query |
| Migrations | `_prisma_migrations` table exists |
| Core Tables | User, TrainerProfile, Pokemon accessible |
| Storage | Database size retrievable |
| Latency | < 100ms (warn at 500ms) |

## Migration from Legacy Scripts

| Old Script | New Command |
|------------|-------------|
| `db_admin.ts status` | `db status` |
| `db_admin.ts counts` | `db counts` |
| `db_admin.ts query` | `db query` |
| `db_smoke.ts` | `db smoke` |

## Prerequisites

- PostgreSQL `psql` client installed
- Environment variables configured (via `secrets/Infinity-Gauntlet.env`)

## Cross-References

- **Parent:** [scripts/ROUTER.md](../ROUTER.md)
- **Library:** [scripts/lib/ROUTER.md](../lib/ROUTER.md)
- **Database Docs:** [operations-bible/02-database-operations.md](../../docs/operations-bible/02-database-operations.md)
- **Prisma Bible:** [docs/prisma-7-bible.md](../../docs/prisma-7-bible.md)

## Notes

1. All queries use `psql` for direct PostgreSQL access
2. Default target is `cloud-prod` (production)
3. Escape table names with quotes: `"User"` not `User`
4. Health checks exit with code 1 on failure

---

**Created:** 2025-12-21 | **Phase:** 3 Database Domain (Scripts Overhaul)
