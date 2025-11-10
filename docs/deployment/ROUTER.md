# ROUTER
Title: Deployment Documentation
Purpose: Render deployment, workers, mount paths, and infrastructure.
Owned Globs: docs/deployment/**
Last Updated (UTC): 2025-11-10T00:00:00Z

Notes:
- Render infrastructure configuration and deployment procedures
- Worker architecture, scaling strategies, and cost optimization
- Persistent disk mount configuration and verification
- Infrastructure audit and troubleshooting

Key Documents:
- **workers.md** - Worker architecture, scaling roadmap, and cost optimization
  * 8 Render services: 1 web + 6 workers + 1 cron job
  * Worker types: bot, outbox, cache, data-pipeline, security, pokedex-cache
  * Scaling opportunities (Phase 10+): horizontal scaling, auto-scaling, cost optimization
  * Worker lifecycle: startup, health checks, graceful shutdown
- **render-disk-mount-fix.md** - Render persistent disk mount configuration
  * Persistent disk setup for security bot state (/Store)
  * 1GB disk allocation, mount path configuration
  * State files: current.json, previous.json, snapshots/
- **render-mount-verification.md** - Mount path verification procedures
  * Health check endpoints for mount verification
  * Startup validation and error handling
  * Recovery procedures for mount failures
- **comprehensive-mount-path-audit.md** - Complete audit of mount paths
  * All service mount paths documented
  * Disk usage analysis and optimization
  * Mount path standards and conventions

Render Services (render.yaml):
1. **infinity-gauntlet-bot** (web) - HTTP health checks & webhooks
2. **infinity-gauntlet-bots** (worker) - Main Discord bot + auto-sync
3. **infinity-gauntlet-outbox** (worker) - Async message delivery
4. **infinity-gauntlet-cache** (worker) - Runtime cache maintenance
5. **infinity-gauntlet-data-pipeline** (worker) - Reference data updates
6. **infinity-gauntlet-security** (worker) - Permission guardrails with persistent state
7. **pokedex-cache-worker** (worker) - External data sync to GitHub
8. **pokedex-cache-failsafe** (cron) - Weekly fallback refresh

Infrastructure Notes:
- Render Postgres: Unified managed database (infinity-gauntlet-db)
- Persistent disks: Security bot state (1GB), potential expansions
- Environment variables: Centralized in secrets/Infinity-Gauntlet.env (local)
- Health checks: HTTP endpoints, database connectivity, mount verification

Cross-References:
- See render.yaml for complete service configuration
- See docs/database/ for database infrastructure
- See docs/architecture/workers.md for detailed worker documentation
