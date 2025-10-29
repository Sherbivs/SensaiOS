# Perfect System Roadmap

This roadmap captures the focus areas required to evolve Infinity Gauntlet toward a resilient, self-healing, and observable platform. Each pillar lists the desired steady state, the immediate actions to reach it, and the signals that confirm success. Use this document as the canonical reference when planning future PATCHSETs.

## 1. Governance & Knowledge Flow
- **Objective:** Keep Patch/Prompt/Tasklist/NEXT in automatic alignment, with every guard passing and no stale router metadata.
- **Immediate Actions:**
  - Re-run all meta guard scripts (`guard_meta`, `guard_router_docs`, `guard_doc_names`, `verify_router_links`).
  - Audit `ops/ROUTER.yaml`, `masterroutetable.md`, and `ops/TOUCHMAP.yaml` for missing entries tied to recent dex work.
  - Stamp Prompt/Tasklist revisions only when changes occur; document conclusions in the change ledger.
- **Signals:** Guard workflows green, no drift between router manifests, and current mission context present in Prompt.md.

## 2. Database Operations & Data Integrity
- **Objective:** Prisma Accelerate and Render stay in lockstep with reproducible migrations, helper-aware refresh scripts, and documented default privileges.
- **Immediate Actions:**
  - Run `npx prisma migrate deploy` against both environments, capture output, and append to ops logs.
  - Execute the dex maintenance scripts (`seed_reference`, `backfill_species`, `warm_cache`) on both environments and store their transcripts.
  - Expand `ops/DB_BOOTSTRAP.md` with a quick checklist for verifying helper fallbacks per environment.
- **Signals:** Matching `_prisma_migrations` history, SpeciesSheet refresh logs clean on both sides, and Tasklist notes referencing the latest verification timestamp.

## 3. Runtime & Code Quality
- **Objective:** All core flows (DM home, encounters, battles, dex) have deterministic tests, lint-clean sources, and shared helper usage.
- **Immediate Actions:**
  - Run focused Vitest suites (`npm run test -- --runInBand tests/dm_home`, `tests/ops`, `tests/core`) and address flakiness.
  - Add regression tests that assert the helper fallback is invoked when direct refresh is denied (mock Prisma error).
  - Perform a dependency audit (`npm outdated`, `pnpm audit`) and log follow-up actions.
- **Signals:** Vitest and ESLint green locally and in CI, helper fallback covered by tests, and dependency risk items tracked in Tasklist.

## 4. Automation & CI/CD
- **Objective:** Every guard and workflow runs deterministically with captured artifacts, and Render deployments reflect the latest blueprint.
- **Immediate Actions:**
  - Trigger GitHub Actions guard suite; investigate and resolve any warnings (especially router/doc guards).
  - Add CI coverage for the dex scripts (dry-run mode) to catch regressions before deploy.
  - Verify Render `render.yaml` matches current worker/service layout and environment expectations.
- **Signals:** CI dashboards free of flaky jobs, dex script regressions caught in pull requests, Render deploy logs referencing the documented connection matrix.

## 5. Observability, Security & Recovery
- **Objective:** Unified telemetry, actionable alerts, and well-rehearsed recovery paths across bot, workers, and scripts.
- **Immediate Actions:**
  - Confirm structured logging still includes database source/mode after helper enhancements.
  - Run security bot smoke tests and ensure DRIP alerts fire with current metadata.
  - Review `ops/RECOVERY.yaml` and `playbooks/escalate.md` to incorporate the latest helper workflows and fallback commands.
- **Signals:** Telemetry dashboards show helper usage, security alerts arrive in the expected channels, and recovery playbooks reference up-to-date commands.

---

**Next Steps:** Tasklist Phase 12 now carries `META.ROADMAP.*` backlog items for each pillar (governance audit, cross-environment DB checks, runtime QA, CI hardening, observability/security). Link future PATCHSETs back to this roadmap and update the document whenever a pillar reaches steady state or new gaps surface.
