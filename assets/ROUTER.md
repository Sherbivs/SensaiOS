# ROUTER
Title: Generated Assets
Purpose: Deterministic build artifacts committed for runtime bootstrapping.
Owned Globs: assets/**
Last Updated (UTC): 2025-11-02T16:55:00Z

Notes:
- Houses the committed dexpack bundle consumed by the bot, battle engine, and guards during startup.
- Artifacts update via `npm run data:dexpack`; verify freshness in CI with `npm run guard:dexpack` before merging changes.
- Keep outputs deterministic (sorted keys, consistent gzip/module, typed-array vectors) so guards can diff the bundle without flaky churn.

Key Files:
- dexpack.v1.json — Primary in-repo dexpack payload (minified JSON with newline terminator).
- dexpack.v1.json.gz — Gzip-compressed companion used by deployments preferring smaller assets.
- dexpack.gen.mjs — Zero-parse ES module exporting pack data plus typed-array vectors and perfect-hash tables for fast lookups.
