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

## Archive Directory

Legacy and one-time scripts are preserved in `scripts/archive/`:

- `archive/render-api-deprecated/` — Deprecated Render API scripts (SSH-only policy)
- `archive/one-time-migrations/` — Completed migration scripts (9 files)
  - db_bootstrap_backfill.ts, migrate-logs-to-database.ts, migrate_console_logs.mjs
  - manual_prod_migrate.ps1, init-driptvdd-test.ts, force-create-homestead.ts
  - validate_staging_deployment.mjs, deploy_production.mjs, detect_deprecated_refs.ps1
- `archive/bootstrap/` — Staging/production bootstrap scripts (2 files)
  - bootstrap_prod_node.sh, bootstrap_staging_db.ps1
- `archive/loki-setup/` — One-time Loki integration scripts (2 files)
  - ngrok-watchdog.ps1, log-cli.sh

## Output Formatting

All CLIs use the shared lib/output.ts module:
- Consistent ANSI colors
- Formatted sections and key-value pairs
- Progress bars and spinners
- Proper exit codes for CI

## Changelog

- **2025-12-21:** Phase 2 Cleanup — 28 redundant scripts deleted (replaced by CLIs), 13 archived
  - **Deleted:** render_*.ps1 (11), docker-*.ps1 (3), loki-*.ps1 (4), db_smoke.ts, check_db_redundancy.ts, db_mirror_checks.ts, diagnose-homestead.ts, guard_*.sh (6)
  - **Archived:** bootstrap scripts (2), one-time migrations (9), loki setup (2)
  - **package.json:** Removed 15 dead npm scripts, cleaned RENDER-API section
- **2025-12-21:** Legacy Cleanup — 14 orphan scripts deleted, package.json reorganized
- **2025-12-21:** Scripts Overhaul Project complete — 8 domains with unified CLIs
- **2025-12-18:** TypeScript Migration Phase 1 — 6 CommonJS scripts converted
- **2025-11-09:** Console Output Standardization — 11 scripts using output-formatter
- **2025-11-06:** Bootstrap local database scripts added
- **2025-11-02:** Guard scripts for dexpack and auto-sync added

---

*For the complete project plan, see [scripts-overhaul-project.md](../docs/projects/scripts-overhaul-project.md)*
