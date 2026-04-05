# ROUTER
Title: Ops Command Surface
Purpose: Administrator slash command handlers for `/ops stats`, `/ops cache`, `/ops db`, and related telemetry.
Owned Globs: src/bot/ops/**
Last Updated (UTC): 2026-04-06T00:00:00Z

Notes:
- Aggregates battle history, cache summaries, database health, and participant filters for staff reviews.
- `/ops db` surfaces Database Resource Manager health reports, growth trends, anomalies, and adaptive retention status.
- Integrates with cache facade metrics, kernel database-resource-manager, and Prisma reporting models to keep admin dashboards consistent.
- Extend this module when introducing new `/ops` subcommands so audit logging remains centralized.

Key Files:
- admin.ts — Slash command implementation for `/ops` commands (stats, cache, db, engine, filters).

Linked Routers:
- src/bot/ROUTER.md — Discord bot context and subrouter directory.
- src/kernel/ROUTER.md — Kernel module including database-resource-manager.
- src/services/cache/ROUTER.md — Cache metrics consumed by the admin dashboard.
- src/models/ROUTER.md — Prisma models sourced for reporting queries.
