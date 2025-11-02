# ROUTER
Title: Dexpack Loader
Purpose: Runtime helpers for loading and querying the committed dexpack bundle.
Owned Globs: src/data/**
Last Updated (UTC): 2025-02-26T00:00:00Z

Notes:
- 2025-02-26: Dexpack guard expects this module to reflect committed assets rebuilt via `npm run data:dexpack`.
- `dexpack.js` lazily loads the committed assets (preferring gzip) and exposes in-memory lookup helpers for species, moves, and type data.
- `dexpack.d.ts` provides ambient typings so TypeScript consumers can use the CommonJS loader safely.
- Keep helper APIs stable while the legacy CommonJS surfaces migrate toward TypeScript modules.

Key Files:
- dexpack.js — Loader/getter module with helpers (`getSpecies`, `getMove`, `suggestSpecies`, etc.).
- dexpack.d.ts — Type declarations for consumers importing the loader from TypeScript.
