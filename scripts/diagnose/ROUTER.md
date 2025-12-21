# ROUTER

**Title:** Diagnostic Tools Domain  
**Purpose:** Emergency debugging tools — environment, memory, database, security bot, homestead diagnostics  
**Owned Globs:** `scripts/diagnose/**`  
**Last Updated (UTC):** 2025-12-21T00:00:00Z

## Overview

Unified diagnostic CLI for emergency debugging and system health analysis. Consolidates all `check-*` and `diagnose-*` scripts into a single tool.

## Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `all` | Run all diagnostics | `npx tsx scripts/diagnose/cli.ts all` |
| `env` | Environment check | `npx tsx scripts/diagnose/cli.ts env` |
| `memory` | Memory analysis | `npx tsx scripts/diagnose/cli.ts memory` |
| `database` | Database connectivity | `npx tsx scripts/diagnose/cli.ts database` |
| `security` | Security bot state | `npx tsx scripts/diagnose/cli.ts security` |
| `homestead` | Homestead system | `npx tsx scripts/diagnose/cli.ts homestead` |
| `files` | Critical files | `npx tsx scripts/diagnose/cli.ts files` |

## Files

- **cli.ts** — Main CLI entry point with all diagnostic commands

## Diagnostic Categories

### Environment Diagnostics
Checks for required and optional environment variables:
- **Required:** `BOT_TOKEN`, `PROD_DATABASE_URL`, `DISCORD_CLIENT_ID`
- **Optional:** `DATABASE_ONPREMISE_DEV_PRIMARY`, `LOKI_URL`, `GRAFANA_URL`

### Memory Diagnostics
- Heap usage and RSS monitoring
- Heap dump detection
- Memory threshold warnings (500MB warn, 1500MB fail)

### Database Diagnostics
- URL configuration check
- Connectivity test
- Latency measurement

### Security Bot Diagnostics
- State file presence
- Sweeps completed count
- Last save timestamp

### Homestead Diagnostics
- Module file checks (home.ts, heal.ts, starters.ts)
- Architecture documentation verification

### File System Diagnostics
- Critical file presence (package.json, schema.prisma, etc.)
- JSON validity checks

## Usage Examples

```bash
# Run all diagnostics
npx tsx scripts/diagnose/cli.ts all

# Environment only
npx tsx scripts/diagnose/cli.ts env

# Memory analysis
npx tsx scripts/diagnose/cli.ts memory

# Database connectivity
npx tsx scripts/diagnose/cli.ts database

# Security bot state
npx tsx scripts/diagnose/cli.ts security

# Homestead system
npx tsx scripts/diagnose/cli.ts homestead
```

## Output Format

Each diagnostic result shows:
- ✓ (green) — Pass
- ⚠ (yellow) — Warning
- ✗ (red) — Fail
- ○ (gray) — Skipped

## Migration from Legacy Scripts

| Old Script | New Command |
|------------|-------------|
| `diagnose-homestead.ts` | `diagnose homestead` |
| `check-bot-permissions.mjs` | `diagnose env` |
| `check-guild-roles.mjs` | `diagnose security` |
| `check-security-bot-state.mjs` | `diagnose security` |
| `check-event-handler-flow.mjs` | `diagnose all` |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All diagnostics passed |
| 1 | One or more diagnostics failed |

## Cross-References

- **Parent:** [scripts/ROUTER.md](../ROUTER.md)
- **Library:** [scripts/lib/ROUTER.md](../lib/ROUTER.md)
- **Security Bot State:** [Store/security-bot-state/schema.md](../../Store/security-bot-state/schema.md)
- **Homestead Docs:** [docs/architecture-bible/18-private-channel-architecture.md](../../docs/architecture-bible/18-private-channel-architecture.md)

## Notes

1. Diagnostics are non-destructive (read-only)
2. Use `all` command for comprehensive health check
3. Exit code 1 indicates failure (useful for CI)
4. Memory thresholds are calibrated for Render Standard plan (2 GB)

---

**Created:** 2025-12-21 | **Phase:** 4 Diagnose Domain (Scripts Overhaul)
