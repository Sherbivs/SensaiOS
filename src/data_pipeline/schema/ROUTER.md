# ROUTER
Title: Data Pipeline Schemas
Purpose: Zod validators that define the shape of reference datasets emitted by the pipeline.
Owned Globs: src/data_pipeline/schema/**
Last Updated (UTC): 2025-11-01T16:20:00Z

Notes:
- `abilities.ts`, `moves.ts`, `species.ts`, and `typechart.ts` enforce dataset invariants before writing JSON outputs.
- `manifest.ts` records schema versions and ties datasets to the generated manifest; keep in sync with data/bootstrap payloads.
- Export ordering is coordinated through `index.ts`; update consumers when introducing breaking schema changes.
