# ROUTER
Title: Shared Storage Integrations
Purpose: Storage adapters and sinks shared across workers and backup flows.
Owned Globs: src/shared/storage/**
Last Updated (UTC): 2025-11-01T16:20:00Z

Notes:
- `backup-sink.ts` streams processed payloads to the configured durable store (S3 or local fallback) and records telemetry for `/ops stats`.
- Extend this directory with new providers or helpers rather than embedding storage logic in command handlers.
