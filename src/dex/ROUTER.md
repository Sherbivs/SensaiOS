# ROUTER
Title: Dex Runtime
Purpose: Binary runtime, loaders, and instrumentation backing the next-generation dexpack.
Owned Globs: src/dex/**
Last Updated (UTC): 2025-11-03T00:15:00Z

Notes:
- Houses the DEX v2 loader/compatibility layer plus generated manifest accessors.
- `metrics.js` emits structured load/lookup/fallback telemetry so operators can trace flag ramps and fallbacks.
- Runtime helpers are pure ESM; keep generated accessors under version control for deterministic deployments.
- Metrics feed the parity suite (`tests/dexpack.parity.spec.ts`) and optional bench harness (`tests/dexpack.microbench.ts`).
- 2025-11-03: Parity spec now iterates every v1 alias while guard_dexpack.sh checks both v1 JSON/module and v2 binary artifacts.

Key Files:
- v2/loader.js — Maps the dexpack.v2 binary, verifies hashes, and exposes fast-table handles.
- v2/accessors.js — Generated manifest hash + filenames resolved at build time.
- metrics.js — Lightweight logging helpers for load events, lookups, and fallback paths.
