# ROUTER
Title: Dexpack Loader
Purpose: Runtime helpers for loading and querying the committed dexpack bundle.
Owned Globs: src/data/**
Last Updated (UTC): 2025-11-02T16:55:00Z

Notes:
- 2025-02-26: Dexpack guard expects this module to reflect committed assets rebuilt via `npm run data:dexpack`.
- `dexpack.js` now boots from the prebuilt ES module (`assets/dexpack.gen.mjs`) for zero-parse startup while retaining a JSON fallback for custom paths.
- `dexpack.d.ts` provides ambient typings so TypeScript consumers can use the CommonJS loader safely.
- Perfect-hash tables and typed-array stat/matchup vectors power the fast lookup helpers; JSON fallback rebuilds the same structures on demand.
- Keep helper APIs stable while the legacy CommonJS surfaces migrate toward TypeScript modules.

Key Files:
- dexpack.js — Loader/getter module with helpers (`getSpecies`, `getMove`, `getSpeciesBaseStats`, `suggestSpecies`, etc.).
- dexpack.d.ts — Type declarations for consumers importing the loader from TypeScript.
