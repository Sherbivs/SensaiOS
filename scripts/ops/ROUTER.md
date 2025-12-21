# ROUTER.md — Ops Domain

**Title:** Operations CLI & Scripts  
**Purpose:** TypeScript CLI for project operations including migrations, hotfix management, task archival, and maintenance  
**Owned Globs:** `scripts/ops/**`  
**Last Updated (UTC):** 2025-12-21T00:00:00Z

---

## Overview

The ops domain provides a unified CLI for project operations including database migrations, hotfix workflows, task management, router documentation, and project cleanup. It integrates with Prisma and the Patch.md workflow.

## Files

| File | Purpose | Lines |
|------|---------|-------|
| `cli.ts` | **Ops CLI entry point** — migrations, hotfix, archive, routers, tasks, clean | ~520 |
| `run_dex_migrations.ps1` | Migration runner with IG_ENV_FILE | Legacy |
| `dex_v2_backup.ts` | pg_dump wrapper for backups | Legacy |
| `simulate_flag_rollout.ts` | Canary rollout simulation | Legacy |
| `bootstrap_local_fallback.ts` | Store-backed Postgres mirror | Legacy |
| `ensure_postgres_bundle.ps1` | Postgres CLI installer | Legacy |
| `auto_bootstrap_local_db.ps1` | Single-command local DB setup | Legacy |

## CLI Commands

### `migrations` — Database Migrations
```bash
npx tsx scripts/ops/cli.ts migrations status
npx tsx scripts/ops/cli.ts migrations create my_migration
npx tsx scripts/ops/cli.ts migrations deploy
npx tsx scripts/ops/cli.ts migrations reset --force
```

### `hotfix` — Hotfix Management
```bash
npx tsx scripts/ops/cli.ts hotfix start "Fix critical bug"
npx tsx scripts/ops/cli.ts hotfix status
npx tsx scripts/ops/cli.ts hotfix complete
```

### `archive` — Archive Operations
```bash
npx tsx scripts/ops/cli.ts archive tasks
npx tsx scripts/ops/cli.ts archive logs
npx tsx scripts/ops/cli.ts archive all
```

### `routers` — Router Documentation
```bash
npx tsx scripts/ops/cli.ts routers check
npx tsx scripts/ops/cli.ts routers update
npx tsx scripts/ops/cli.ts routers list
```

### `tasks` — Task Management
```bash
npx tsx scripts/ops/cli.ts tasks status
npx tsx scripts/ops/cli.ts tasks next
npx tsx scripts/ops/cli.ts tasks done
```

### `clean` — Project Cleanup
```bash
npx tsx scripts/ops/cli.ts clean dist
npx tsx scripts/ops/cli.ts clean cache
npx tsx scripts/ops/cli.ts clean all
```

## Legacy Scripts (Pending Migration)

- `run_dex_migrations.ps1` — Loads IG_ENV_FILE, runs migrations against direct PostgreSQL
- `dex_v2_backup.ts` — Wraps `pg_dump -Fc` with env-file loading and dry-run support
- `simulate_flag_rollout.ts` — Emits JSON payloads for canary ladder testing
- `dex_v2_alert_dry_run.ts` — Grafana-style webhook preview validation
- `bootstrap_local_fallback.ts` — Hydrates Store-backed Postgres mirror
- `ensure_postgres_bundle.ps1` — Installs Postgres CLI via winget
- `auto_bootstrap_local_db.ps1` — Single-command fallback refresh

## Linked Routers

- [scripts/ROUTER.md](../ROUTER.md) — Parent routing index
- [ops/ROUTER.md](../../ops/ROUTER.md) — Operational runbooks
- [ops/DB_BOOTSTRAP.md](../../ops/DB_BOOTSTRAP.md) — Migration runbook
- [scripts/lib/ROUTER.md](../lib/ROUTER.md) — Foundation library
