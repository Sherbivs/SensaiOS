# ROUTER
Title: Data Pipeline
Purpose: Builds and validates Pokemon reference datasets.
Owned Globs: src/data_pipeline/**
Last Updated (UTC): 2025-11-01T16:20:00Z

Notes:
- `index.ts` orchestrates ingestion and validation, feeding cache builders and Prisma seed helpers.
- Zod schemas under `schema/` now have a dedicated router describing dataset validators and manifest coordination.

Key Files:
- index.ts - Entry point invoked by `npm run data:build`.
- schema/index.ts - Bundles schema exports for consumers.
- schema/{abilities,moves,species,typechart}.ts - Zod definitions for respective datasets.
- schema/manifest.ts - Coordinates schema versions and dataset manifest metadata.
