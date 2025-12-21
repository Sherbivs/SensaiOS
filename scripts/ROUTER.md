# ROUTER.md — Scripts Domain

**Title:** Scripts & Automation  
**Purpose:** Unified TypeScript CLI tooling organized by domain  
**Owned Globs:** `scripts/**`  
**Last Updated (UTC):** 2025-12-21T00:00:00Z

---

## Overview

The scripts directory has been reorganized into domain-specific subdirectories, each with a unified TypeScript CLI entry point. All CLIs share a common foundation library (`lib/`) for consistent output formatting, error handling, and command-line parsing.

## Domain Architecture

| Domain | Entry Point | Purpose | Commands |
|--------|-------------|---------|----------|
| **lib** | `lib/index.ts` | Foundation library | — (exported functions) |
| **render** | `render/cli.ts` | Render deployment operations | deploy, ssh, logs, status, restart |
| **observe** | `observe/logs.ts` | Loki log viewing | query, stream, tail, search |
| **db** | `db/cli.ts` | Database operations | status, query, counts, smoke, diff, migrations |
| **diagnose** | `diagnose/cli.ts` | Emergency diagnostics | all, env, memory, database, security, homestead, files |
| **guard** | `guard/cli.ts` | CI guards | all, meta, routing, secrets, schema, size |
| **docker** | `docker/cli.ts` | Container management | build, run, logs, ps, compose, clean, status |
| **data** | `data/cli.ts` | Data pipeline | dexpack, cache, fetch, validate, stats, build |
| **ops** | `ops/cli.ts` | Operations | migrations, hotfix, archive, routers, tasks, clean |

## Quick Reference

```bash
# Foundation (shared by all domains)
# No CLI — provides exported utilities

# Render Operations
npx tsx scripts/render/cli.ts deploy
npx tsx scripts/render/cli.ts ssh --interactive
npx tsx scripts/render/cli.ts logs --follow

# Log Observability  
npx tsx scripts/observe/logs.ts query "error"
npx tsx scripts/observe/logs.ts tail --service bot

# Database Operations
npx tsx scripts/db/cli.ts status
npx tsx scripts/db/cli.ts query "SELECT COUNT(*) FROM \"User\""
npx tsx scripts/db/cli.ts smoke

# Emergency Diagnostics
npx tsx scripts/diagnose/cli.ts all
npx tsx scripts/diagnose/cli.ts memory

# CI Guards
npx tsx scripts/guard/cli.ts all
npx tsx scripts/guard/cli.ts meta

# Docker Management
npx tsx scripts/docker/cli.ts build
npx tsx scripts/docker/cli.ts compose up --loki

# Data Pipeline
npx tsx scripts/data/cli.ts dexpack
npx tsx scripts/data/cli.ts validate

# Operations
npx tsx scripts/ops/cli.ts migrations status
npx tsx scripts/ops/cli.ts hotfix start "Fix bug"
```

## Domain Documentation

Each domain has its own ROUTER.md with detailed documentation:

- [lib/ROUTER.md](lib/ROUTER.md) — Foundation library (output, errors, exec, env, fs, ssh, cli, progress)
- [render/ROUTER.md](render/ROUTER.md) — Render deployment and SSH operations
- [observe/ROUTER.md](observe/ROUTER.md) — Loki log querying and streaming
- [db/ROUTER.md](db/ROUTER.md) — Database status, queries, migrations
- [diagnose/ROUTER.md](diagnose/ROUTER.md) — Emergency debugging diagnostics
- [guard/ROUTER.md](guard/ROUTER.md) — CI validation guards
- [docker/ROUTER.md](docker/ROUTER.md) — Container and compose management
- [data/ROUTER.md](data/ROUTER.md) — Dexpack building and data validation
- [ops/ROUTER.md](ops/ROUTER.md) — Migrations, hotfix, archival

## Legacy Scripts (Pending Migration)

The following root-level scripts will be migrated to domain CLIs:

### Guards (→ guard/)
- `guards/guard_meta.sh` → `guard/cli.ts meta`
- `guards/guard_routing.sh` → `guard/cli.ts routing`
- `guards/guard_dexpack.sh` → `guard/cli.ts` (planned)

### Database (→ db/)
- `db_admin.ts` → `db/cli.ts`
- `db_smoke.ts` → `db/cli.ts smoke`
- `db_mirror_checks.ts` → `db/cli.ts diff`

### Data (→ data/)
- `build_dexpack.ts` → `data/cli.ts dexpack`
- `build-data.ts` → `data/cli.ts build`
- `fetch_pokemon.mjs` → `data/cli.ts fetch`
- `cache_client.mjs` → `data/cli.ts cache`

### Operations (→ ops/)
- `archive_task_history.mjs` → `ops/cli.ts archive`
- `ops/*.ps1` → Various ops/cli.ts commands

## Output Formatting

All CLIs use the shared lib/output.ts module:
- Consistent ANSI colors
- Formatted sections and key-value pairs
- Progress bars and spinners
- Proper exit codes for CI

## Changelog

- **2025-12-21:** Scripts Overhaul Project complete — 11 domains with unified CLIs
- **2025-12-18:** TypeScript Migration Phase 1 — 6 CommonJS scripts converted
- **2025-11-09:** Console Output Standardization — 11 scripts using output-formatter
- **2025-11-06:** Bootstrap local database scripts added
- **2025-11-02:** Guard scripts for dexpack and auto-sync added

---

*For the complete project plan, see [scripts-overhaul-project.md](../docs/projects/scripts-overhaul-project.md)*
