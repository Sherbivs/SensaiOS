# ROUTER
Title: Environment Utilities
Purpose: Helpers that validate runtime configuration.
Owned Globs: src/env/**
Last Updated (UTC): 2025-10-30T00:47:00Z

Notes:
- Houses TypeScript utilities that confirm database URLs are present and safe to use before spins.

Key Files:
- ensure-db-url.ts - Raises descriptive errors when DATABASE_POOL_URL / DATABASE_DIRECT_URL are misconfigured; referenced by runtime entrypoints.
