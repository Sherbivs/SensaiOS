# Infinity Gauntlet Roadmap

This roadmap is the canonical planning artifact for Infinity Gauntlet. It aligns the team on mission, sequencing, and success measures across the next three quarters. Update this document whenever milestones shift or new risks surface.

## Vision & Principles
- Deliver a resilient, self-healing Discord experience backed by reproducible data pipelines and guarded operational metadata.
- Favor observable, automatable workflows over ad-hoc manual fixes.
- Keep governance artifacts (`Patch`, `Prompt`, `Tasklist`, `NEXT`, routers) in lockstep with the actual system state.

## Timeline & Milestones
| Window | Milestone | Key Deliverables | Exit Criteria |
| --- | --- | --- | --- |
| **Immediate (Oct–Nov 2025)** | Stabilize Secrets & Schema | Restore DEV/Accelerate env files, re-run migrations, bring dex cache up-to-date | `prisma-dev.env` + `prisma-accelerate.env` validated, `npx prisma migrate deploy` green, `npm run db:cli -- counts` logged |
| **Near-Term (Dec 2025)** | Harden Runtime & Guards | Close ROUTER drift, refresh guard scripts, green Vitest/ESLint baselines | Guard suite green, Tasklist shows regression tests landed |
| **Mid-Term (Jan–Mar 2026)** | Automate Recovery & Telemetry | CI coverage for dex scripts, structured logging dashboards, revised recovery playbooks | CI catches dex regressions, Ops dashboards track cache refresh mode, recovery dry-run documented |
| **Long-Term (Apr–Jun 2026)** | Scale & Integrate | Shard cache pipeline, introduce analytics read models, formalize release cadence | Render services auto-scale, analytics dashboards online, release checklist institutionalized |

## Workstreams

### 1. Governance & Knowledge Flow
- **Goal:** Zero drift across contract artifacts and router inventory.
- **Scope 2025 Q4:**
  - Re-run guard scripts (`guard_meta`, `guard_router_docs`, `guard_doc_names`, `verify_router_links`).
  - Close Tasklist `META.ROADMAP.*` backlog items for router audits.
  - Keep `Prompt.md` / change ledger updates paired with real diffs.
- **Measures:** Guards green three runs in a row; NEXT pointer matches active task; router docs reference new env workflow.

### 2. Database Operations & Data Integrity
- **Goal:** Reproducible migrations and cache hydration across DEV, Render, and Accelerate.
- **Scope 2025 Q4:**
  - Load `prisma-dev.env` / `prisma-accelerate.env` via `scripts/setup_ai_env.ps1` before every DB change.
  - Execute `seed_reference`, `backfill_species`, and `warm_cache` with transcripts archived in Tasklist.
  - Extend `ops/DB_BOOTSTRAP.md` with dual-environment validation steps when helpers change.
- **Measures:** `_prisma_migrations` parity confirmed monthly; `SpeciesSheet` refresh logged in both environments; cache warm timestamp recorded after each deploy.

### 3. Runtime Quality & Testing
- **Goal:** Core flows covered by deterministic tests and linting, with helper fallbacks validated.
- **Scope 2025 Q4–Q1:**
  - Add Vitest specs for `refresh_species_sheet` fallback and dex cache warmers.
  - Integrate dependency audits into release cadence (`npm outdated`, `pnpm audit`).
  - Track flaky tests in Tasklist and resolve within the same iteration.
- **Measures:** CI pipeline green 5 consecutive runs; helper fallback test suite passes; dependency risks logged with owners.

### 4. Automation & Delivery
- **Goal:** Guards, CI, and Render deploys reflect the living blueprint.
- **Scope 2025 Q4–Q2:**
  - Add CI dry-run coverage for dex scripts and router guard outputs.
  - Ensure `render.yaml` matches the latest service matrix after every architectural change.
  - Capture Render deploy logs and link in Tasklist for traceability.
- **Measures:** CI jobs publish artifacts; Render deploy checklists stored under `ops/`; automation reruns succeed without manual patches.

### 5. Observability, Security & Recovery
- **Goal:** Actionable telemetry and rehearsed recovery steps spanning bot, workers, and scripts.
- **Scope 2025 Q4–Q2:**
  - Emit OTEL spans for cache refresh attempts (direct vs helper fallback).
  - Smoke-test security bot alerts quarterly; document results in Tasklist.
  - Update `ops/RECOVERY.yaml` and `playbooks/escalate.md` after each incident or tooling change.
- **Measures:** Telemetry dashboards show refresh mode distribution; DRIP alerts validated; recovery playbooks reference current scripts.

## Dependencies & Risks
- **Secrets Hygiene:** Loss of `prisma-dev.env` or `prisma-accelerate.env` blocks migrations. Mitigation: mirror files to secure backup and document refresh cadence.
- **GitHub Automation:** Dex replication requires `GITHUB_REPO` and `GITHUB_TOKEN`. Track token rotations in Tasklist.
- **Guard Drift:** Router or contract file drift forces manual recovery. Run guard suite after each structural change.

## Reporting & Cadence
- Review progress in weekly ops sync; capture decisions in `Tasklist.md` under `META.ROADMAP` items.
- At the end of each milestone window, update this document with status (On Track / At Risk / Blocked) and roll forward incomplete work.
- When a milestone completes, link the verifying logs or PRs in `docs/` or `ops/` and archive related tasks.

Maintain this roadmap as the single source of truth for planning. Any major change to scope, risk, or timeline should be reflected here before being communicated elsewhere.
