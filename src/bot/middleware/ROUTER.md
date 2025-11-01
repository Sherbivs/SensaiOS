# ROUTER
Title: Discord Middleware Guards
Purpose: Shared middleware that enforces rate limits and safety checks before command execution.
Owned Globs: src/bot/middleware/**
Last Updated (UTC): 2025-11-01T19:30:00Z

Notes:
- Middleware helpers centralize cooldown logic so slash commands and button handlers share consistent guardrails.
- Rate-limit outcomes surface user-friendly Discord replies and structured logging for operators.
- Extend these helpers when introducing new command families to avoid duplicating guard logic.

Key Files:
- limits.ts — Implements rate-limiting utilities consumed by command handlers.

Linked Routers:
- src/bot/ROUTER.md — Discord layer overview and command entrypoints.
- src/shared/ROUTER.md — Shared logging/config utilities invoked by middleware.
