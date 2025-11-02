# ROUTER
Title: CI/CD Workflows
Purpose: GitHub Actions definitions guarding docs, routers, database tooling, and runtime deployments.
Owned Globs: .github/workflows/**
Last Updated (UTC): 2025-11-02T14:05:00Z

Notes:
- Guard suites (guard-*.yml) enforce contract documents, router coverage, Render manifests, and database docs before merge.
- Runtime workflows (`runtime.yml`, `refresh-cache.yml`) build and deploy the production worker and cache refresh tasks.
- PBSL oracle and data-health checks keep deterministic fixtures and data sources in sync.
- Update this router whenever a workflow is added or ownership changes to keep CI responsibilities visible.
- 2025-11-02: Introduced `guard-dexpack.yml` to regenerate and verify committed dexpack assets in CI.
