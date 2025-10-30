# ROUTER
Title: Legacy Cache Builders
Purpose: Scripts that build and publish cached Pokemon data via git mirrors.
Owned Globs: src/cache/**
Last Updated (UTC): 2025-10-30T00:47:00Z

Notes:
- These CommonJS modules predate the TypeScript pipeline and still back the Git-based cache refresh jobs.
- Helpers clone the cache repository, run data builders, then push refreshed JSON artifacts.

Key Files:
- index.js - Orchestrates cache regeneration and publishing to the cache repo.
- pokemonCache.js - Builds minimal Pokemon payloads from upstream data sources.
- gitStore.js - Git utilities for cloning, committing, and pushing cache updates.
