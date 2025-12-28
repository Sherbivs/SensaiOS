# ROUTER
Title: AI Logging System Services
Purpose: AI agent logging, analysis, and integration for development workflow automation.
Owned Globs: src/services/ai/**
Last Updated (UTC): 2025-11-16T00:00:00Z

Notes:
- `ai-log-writer.ts` — Writes structured AI agent logs to database (CacheEntry table). Captures agent actions, decisions, context, outcomes with timestamps.
- `ai-log-analyzer.ts` — Analyzes AI agent log patterns: identifies frequent actions, decision trees, success/failure rates. Self-learning system with pattern detection.
- `ai-log-integrations.ts` — Integrations with internal observability systems (ErrorTracker, Resource Monitor, Discord, Game Engine).
- `index.ts` — Barrel exports for all AI services.

Linked Routers:
- docs/observability/INDEX.md — Observability documentation
- src/services/error-brain/ROUTER.md — Local error intelligence

Areas:
- `ai-log-writer.ts` — Structured AI logging: writes agent actions, decisions, context to database. Database-first architecture.
- `ai-log-analyzer.ts` — Log pattern analysis: identifies frequent actions, decision trees, success/failure rates. Self-learning knowledge base.
- `ai-log-integrations.ts` — Internal service integrations: ErrorTracker, Resource Monitor, Discord Client, Game Engine, Security Bot.
- `index.ts` — Barrel export for all AI services.
