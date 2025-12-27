# ROUTER
Title: AI Services (Logging, Analysis, Gateway)
Purpose: AI logging, analysis, integrations, and ngrok AI Gateway for multi-provider LLM access.
Owned Globs: src/services/ai/**
Last Updated (UTC): 2025-12-27T00:00:00Z

Notes:
- `ai-log-writer.ts` — Writes structured AI agent logs to database (CacheEntry table). Captures agent actions, decisions, context, outcomes with timestamps.
- `ai-log-analyzer.ts` — Analyzes AI agent log patterns: identifies frequent actions, decision trees, success/failure rates. Self-learning system with pattern detection.
- `ai-log-integrations.ts` — Integrations with internal observability systems (ErrorTracker, Resource Monitor, Discord, Game Engine).
- `ai-gateway.ts` — **NEW** ngrok AI Gateway integration: multi-provider LLM routing (OpenAI, Anthropic, Google, DeepSeek) with automatic failover, PII redaction, cost tracking.
- `index.ts` — Barrel exports for all AI services.

## ngrok AI Gateway (NEW 2025-12-27)

Features:
- OpenAI-compatible API via ngrok AI Gateway
- Multi-provider failover (OpenAI → Anthropic → Google → DeepSeek)
- API key rotation for rate limit avoidance
- CEL-based model selection strategies
- PII redaction before requests
- Token usage and cost tracking

Configuration:
- `NGROK_AI_GATEWAY_URL` — Gateway endpoint (e.g., https://your-gateway.ngrok.app/v1)
- `NGROK_AI_GATEWAY_KEY` — API key for authentication
- `NGROK_AI_DEFAULT_MODEL` — Default model (default: gpt-4o-mini)

Usage:
```typescript
import { aiGateway } from '../services/ai';

// Error analysis
const analysis = await aiGateway.analyzeError({ message: 'Error...', stack: '...' });

// Log analysis
const insights = await aiGateway.analyzeLogs({ logs: [...], focus: 'errors' });

// Generic completion
const response = await aiGateway.complete('Analyze this...');

// Stats
const stats = aiGateway.getStats();
```

Linked Routers:
- ops/ngrok-ai-gateway-config.yml — Gateway YAML configuration for ngrok dashboard
- docs/observability/INDEX.md — Observability documentation
- src/services/error-brain/ROUTER.md — Local error intelligence (integrates with AI Gateway insights)

Areas:
- `ai-log-writer.ts` — Structured AI logging: writes agent actions, decisions, context to database. Database-first architecture (2025-12-27).
- `ai-log-analyzer.ts` — Log pattern analysis: identifies frequent actions, decision trees, success/failure rates. Self-learning knowledge base.
- `ai-log-integrations.ts` — Internal service integrations: ErrorTracker, Resource Monitor, Discord Client, Game Engine, Security Bot.
- `ai-gateway.ts` — ngrok AI Gateway: OpenAI SDK → ngrok gateway → multi-provider routing with failover, PII redaction, cost tracking.
- `index.ts` — Barrel export for all AI services.
