# ROUTER
Title: Ops Command Surface
Purpose: Administrator slash command handlers for `/ops stats`, `/ops cache`, and related telemetry.
Owned Globs: src/bot/ops/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Aggregates battle history, cache summaries, and participant filters for staff reviews.
- Integrates with cache facade metrics and Prisma reporting models to keep admin dashboards consistent.
- Extend this module when introducing new `/ops` subcommands so audit logging remains centralized.

Key Files:
- admin.ts — Slash command implementation for `/ops` commands (stats, cache, filters).

Linked Routers:
- src/bot/ROUTER.md — Discord bot context and subrouter directory.
- src/services/cache/ROUTER.md — Cache metrics consumed by the admin dashboard.
- src/models/ROUTER.md — Prisma models sourced for reporting queries.
