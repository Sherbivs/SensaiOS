# ROUTER
Title: Observability Domain
Purpose: Log viewing, metrics, and monitoring tools for Loki queries and Grafana integration.
Owned Globs: scripts/observe/**
Last Updated (UTC): 2026-02-10T16:40:00Z

## Overview

CLI tools for production log observability via Loki and Grafana. Query logs, view errors, and monitor services without leaving the terminal.

## Architecture

```
Production (Render) → ngrok tunnel → localhost:3100 (Loki) → Grafana (localhost:3000)
```

See `LOKI-QUICKSTART.md` for setup instructions.

## Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `status` | Check Loki/Grafana health | `npx tsx scripts/observe/logs.ts status` |
| `services` | List known log services | `npx tsx scripts/observe/logs.ts services` |
| `query` | Query logs from Loki | `npx tsx scripts/observe/logs.ts query -s stats-logger` |
| `errors` | Show recent errors | `npx tsx scripts/observe/logs.ts errors -h 24` |
| `open` | Open Grafana in browser | `npx tsx scripts/observe/logs.ts open` |

## Files

- **logs.ts** — Main CLI for Loki log queries. Uses native fetch for Loki API, lib/cli.ts for framework.

## Known Services

| Service | Description |
|---------|-------------|
| `stats-logger` | Main application logger |
| `infinity-gauntlet` | Discord bot logs |
| `security-bot` | Security monitoring |
| `cache-worker` | Cache maintenance logs |
| `outbox-worker` | Event bus delivery |
| `data-pipeline` | Data update logs |

## Usage Examples

```bash
# Check observability stack
npx tsx scripts/observe/logs.ts status

# Query specific service logs
npx tsx scripts/observe/logs.ts query -s stats-logger -n 100

# Query errors only
npx tsx scripts/observe/logs.ts query -l error -h 6

# View all recent errors
npx tsx scripts/observe/logs.ts errors -n 50

# Show raw LogQL query
npx tsx scripts/observe/logs.ts query -s security-bot --raw

# Open Grafana explore
npx tsx scripts/observe/logs.ts open
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOKI_URL` | `http://localhost:3100` | Loki API endpoint |
| `GRAFANA_URL` | `http://localhost:3000` | Grafana UI endpoint |

## LogQL Reference

Basic queries used by this CLI:

```logql
# All logs from a service
{service="stats-logger"}

# Errors only
{level="error"}

# Combined filters
{service="infinity-gauntlet", level="error"}

# Pattern match
{service=~".*-worker"}
```

## Output Format

Logs are displayed in a consistent format:

```
TIMESTAMP           LEVEL SERVICE         MESSAGE
2025-12-21 10:30:45 INFO  stats-logger    Database connected
2025-12-21 10:30:46 ERROR security-bot    Permission check failed
```

Color coding:
- 🔴 `ERROR` — Red
- 🟡 `WARN` — Yellow  
- 🔵 `INFO` — Blue
- ⚪ `DEBUG` — Gray

## Cross-References

- **Parent:** [scripts/ROUTER.md](../ROUTER.md)
- **Library:** [scripts/lib/ROUTER.md](../lib/ROUTER.md)
- **Loki Setup:** [LOKI-QUICKSTART.md](../../LOKI-QUICKSTART.md)
- **Loki Config:** [ops/loki-config.yaml](../../ops/loki-config.yaml)
- **Grafana Dashboard:** [ops/grafana-dashboard.json](../../ops/grafana-dashboard.json)

## Notes

1. Requires Loki running locally (docker-compose.loki.yml)
2. Production logs flow via ngrok tunnel
3. Default time range is 3 hours
4. Grafana provides richer visualization than CLI

---

**Created:** 2025-12-21 | **Phase:** 2 Observe Domain (Scripts Overhaul)
