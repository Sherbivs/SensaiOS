# ROUTER
Title: Pokemon Reference Data
Purpose: Cached datasets and bootstrap payloads consumed by the bot, workers, and tests.
Owned Globs: data/**
Last Updated (UTC): 2025-10-30T00:46:00Z

Notes:
- JSON payloads mirror the PokeAPI publisher outputs so local runs and Render workers can hydrate caches without network flakiness.
- Bootstrap assets feed the dex maintenance scripts (`scripts/dex/*.ts`) and Prisma migrations that rely on stable species/move manifests.
- Directory layout is tracked even when files are regenerated so downstream automation can write snapshots deterministically.

Key Files:
- README.md - Describes how cache workers populate and consume this workspace.
- pokemon.json / effects.json - Primary runtime cache payloads for species metadata and move side effects.
- bootstrap/dex.min.json, moves.min.json, version.json - Minified bootstrap bundles used by dex seeding/backfill scripts.
