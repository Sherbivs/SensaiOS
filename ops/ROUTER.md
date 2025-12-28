# ROUTER
Title: Ops & Governance
Purpose: Canonical operational control-plane (NEXT, CRITICAL, TOUCHMAP, router maps, inbox, observability dashboards).
Owned Globs: ops/**
Last Updated (UTC): 2025-12-28T00:00:00Z

Notes:
- 2025-12-28: **Observability Dashboard Consolidation** — Created unified system health dashboard (`grafana-unified-system-health.json`) consolidating 5 fragmented dashboards. Human-friendly panel descriptions, color-coded thresholds, comprehensive metric coverage (game, database, observability pipeline, resources). Import guide at `UNIFIED-DASHBOARD-IMPORT-GUIDE.md`, integration plan at `DASHBOARD-INTEGRATION-PLAN.md`.
- 2025-12-20: **Markdown Consolidation** — Moved 8 meeting/audit reports to docs/projects/cleanup/ with date-prefixed names. ops/ now contains only operational essentials (ROUTER, credentials, NEXT, YAML configs).
  - Moved: CLEANUP-MEETING-4-*, CONSOLIDATION-MEETING-3-REPORT, STRESS-REMEDIATION-MEETING, SINGULARITY-AUDIT, SINGULARITY-REMEDIATION-PLAN, DUPLICATION-REPORT
- 2025-02-26: Documented dexpack guard coverage; ops/ROUTER.yaml and touchmap now map assets build to T13.DEX.DEXPACK_ROLLOUT.
- 2025-11-06: Local Postgres fallback automation now lives under `scripts/ops/`; `npm run ops:auto-bootstrap-local-db` installs dependencies then refreshes the Store mirror. Docs (AGENTS, OPERATIONS, operations-bible) and ledger entries were updated to reflect the silent install flow.
- 2025-11-01: Added dedicated router for ops/INBOX so operator inbox notes have clear owners.
- 2025-10-26: guard_meta preflight/postflight make READY absence impossible at merge time; NEXT auto-promotion enabled. See scripts/guard_meta.sh and ops/NEXT.yaml.
- 2025-10-26: Patch contract adds marker switch, clipboard scratch space, and Markerless Mode guidance; guard_meta enforces Absolutes when contracts are OFF.
- 2025-10-26: Canonical meta docs (CRITICAL.md, HOTFIX.md) live under ops/ after cleanup; outdated duplicates were removed.
- 2025-11-16: Documentation centralized into Bible system (454 → 30 files, 93.4% reduction); all operational guides consolidated into architecture-bible, operations-bible, and development-bible subdirectories.
- 2025-10-30: Documented the DB doc drift guard (`scripts/guard_db_docs.mjs` + guard-db-docs workflow) so ops runbooks stay aligned on Key/Dev, Key/Prod, and Prisma regenerate instructions.
- 2025-10-30: Runtime cache facade instrumentation landed alongside `/ops cache` diagnostics; docs/tests refreshed to surface maintenance scheduler and cleanup triggers.

Key Files:
- ops/NEXT.yaml — execution pointer
- Agents.md — contract-first agent handbook
- ops/ROUTER.yaml — canonical path map
- ops/ROUTER_INDEX.yaml — router-of-routers (generated)
- OPERATIONS.md — operational runbook documenting worker matrix and rollouts
- operations-bible/02-database-operations.md — canonical database architecture, grants, and maintenance guide
- masterroutetable.md — text-first router map for hotfix navigation when automation is unavailable

Observability Dashboards (Grafana):
- grafana-unified-system-health.json — **PRIMARY** unified dashboard (replaces 5 fragmented dashboards)
- grafana-dashboard.json — Legacy security intelligence (use unified instead)
- grafana-infinity-gauntlet-main.json — Legacy main dashboard (use unified instead)
- grafana-battle-engine.json — Legacy battle performance (use unified instead)
- grafana-cache-performance.json — Legacy cache metrics (use unified instead)
- grafana-timescaledb-dashboard.json — Legacy database metrics (use unified instead)

Observability Documentation (moved to docs/operations-bible/):
- See operations-bible/14-observability-specialist-team-plan.md — Specialist roles and implementation plan
- See operations-bible/15-ux-visual-simplification-guide.md — CLI/log visual clarity transformation
- See operations-bible/16-observability-implementation-summary.md — Completion summary
- See operations-bible/17-dashboard-integration-plan.md — Dashboard consolidation strategy
- See operations-bible/18-unified-dashboard-import-guide.md — Import instructions
- See operations-bible/19-observability-delivery-summary.md — Initial delivery summary

Subrouters:
- ops/INBOX/ROUTER.md — Operator inbox staging area; sync with NEXT metadata before edits.

