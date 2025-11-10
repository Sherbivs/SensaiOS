# Meta-Router Gap Report
Generated: 2025-11-01 (UTC)

## Current Coverage Snapshot
- ROUTER manifests detected in: data/, docs/, ops/, playbooks/, prisma/, router/, scripts/, secrets/, src/ (and key subtrees), sync-layer/, tests/, tools/, .db-state, .github.
- Coverage is strong for top-level product code and playbooks. The remaining gaps are concentrated in legacy service bundles, generated output, and archival buckets.
- 2025-11-01: Added routers for active code surfaces (`src/runtime`, `sync-layer/*`, `tests/*`), generated output (`dist/`), runtime caches (`Store/**`), ops archival/inbox buckets, Prisma migrations, scripts subdirectories, cache/storage services, and the vendored Postgres bundle.

## Directories Missing ROUTER.md
The table below lists every repository directory without a ROUTER.md after excluding node_modules. Suggested actions reflect whether each area should receive documentation, be folded under an existing router, or be marked as generated output.

| Path | Recommended Disposition | Notes |
| --- | --- | --- |
| _(none)_ | Covered | All directories previously flagged now have ROUTER manifests or are documented by their parent routers. Continue to rerun the scan after creating new directories.

## Recommended Next Steps
1. Triage legacy bundles (`scripts/*`, `data/bootstrap`) and add routers or plan deprecation.
2. Close remaining core gaps (`src/data_pipeline/schema`, `src/services/cache`, `src/shared/cache`, `src/shared/storage`, `tools/pgsql17`) with routers or parent coverage.
3. Keep prisma migration parents and sync-layer routers updated as new folders spawn (use fold-under guidance above).
4. After each wave of router additions run `pwsh -NoLogo -NoProfile -Command "Get-ChildItem -Recurse -Directory ..."` to verify coverage.
