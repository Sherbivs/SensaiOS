# ROUTER
Title: Legacy Environment Config
Purpose: Historical env loader used before the shared TypeScript config module.
Owned Globs: src/config/**
Last Updated (UTC): 2025-10-30T00:47:00Z

Notes:
- Still referenced by CommonJS surfaces that have not migrated to `src/shared/config.ts`.
- Keep typings (`env.d.ts`) aligned with the real config loader to avoid drift.

Key Files:
- env.js - Legacy environment bootstrap for CommonJS modules.
- env.d.ts - Ambient type definitions consumed by remaining TypeScript callers.
