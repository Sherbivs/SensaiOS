# ROUTER
Title: AI Logging System Services
Purpose: AI agent logging, analysis, and integration for development workflow automation.
Owned Globs: src/services/ai/**
Last Updated (UTC): 2025-11-16T00:00:00Z

Notes:
- `ai-log-writer.js` (JavaScript) — Writes structured AI agent logs to filesystem (`logs/ai-agent/`). Captures agent actions, decisions, context, outcomes with timestamps. Integrates with GitHub Copilot and other AI tooling.
- `ai-log-analyzer.js` (JavaScript) — Analyzes AI agent log patterns: identifies frequent actions, decision trees, success/failure rates. Generates insights for workflow optimization.
- `ai-log-integrations.js` (JavaScript) — Integrations with external AI services and tooling. Handles authentication, API calls, data transformation for AI logging pipeline.
- `index.ts` (26 lines) — Barrel exports with namespace exports (AILogging) for clean integration with TypeScript codebase.
- **Note:** Core AI logging services are JavaScript (legacy), barrel export is TypeScript for consistency with rest of services/ layer.

Linked Routers:
- logs/ROUTER.md — AI agent logs stored in `logs/ai-agent/` directory.
- ops/KNOWLEDGE.yaml — AI agent learnings and workflow patterns captured from log analysis.

Areas:
- `ai-log-writer.js` — Structured AI logging: writes agent actions, decisions, context to filesystem. Timestamp-based log rotation, JSON format for machine parsing.
- `ai-log-analyzer.js` — Log pattern analysis: identifies frequent actions, decision trees, success/failure rates. Generates workflow optimization insights.
- `ai-log-integrations.js` — External AI service integrations: authentication, API calls, data transformation for logging pipeline.
- `index.ts` — Barrel export with namespace exports bridging JavaScript AI services to TypeScript codebase.
