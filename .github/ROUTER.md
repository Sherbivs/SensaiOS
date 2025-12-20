# ROUTER
Title: CI & Automation Workflows
Purpose: GitHub Actions guards, health checks, deployment support, and Copilot agent configurations.
Owned Globs: .github/**
Last Updated (UTC): 2025-12-20T00:00:00Z

Notes:
- Guard pipelines (`guard-meta.yml`, `guard-docs.yml`, `guard-router.yml`, `guard-routing.yml`, `guard-render.yml`) enforce contract invariants, router consistency, and Render configuration checks on every push/PR.
- Health jobs (`agent-health.yml`, `data-health.yml`, `runtime.yml`) exercise agent readiness, nightly data refreshes, and end-to-end runtime tests.
- Operational workflows (`pbsl-oracle.yml`, `refresh-cache.yml`) keep deterministic PBSL fixtures and production cache refresh runs aligned with repo state.
- 2025-11-02: Added `guard-dexpack.yml` to rebuild the committed dexpack asset in verification mode during CI.
- 2025-12-20: Added cleanup-agent.agent.md and cleanup.instructions.md for dead code cleanup sessions.

Agents:
- research-gpt.agent.md — Primary development assistant (Claude Sonnet 4.5)
- cleanup-agent.agent.md — Dead code cleanup and consolidation specialist

Instructions:
- copilot-instructions.instructions.md — Global project context (applyTo: **)
- typescript.instructions.md — TypeScript development patterns (applyTo: src/**/*.ts)
- database.instructions.md — Prisma and database patterns (applyTo: prisma/**)
- documentation.instructions.md — Documentation standards (applyTo: docs/**, ops/**)
- scripts.instructions.md — Script development patterns (applyTo: scripts/**)
- testing.instructions.md — Testing patterns (applyTo: tests/**)
- cleanup.instructions.md — Dead code cleanup procedures (applyTo: **)

Workflows:
- agent-health.yml - Runs guard_meta plus readiness probes so automation surfaces stay healthy.
- data-health.yml - Nightly schedule that installs dependencies and validates data pipeline integrity.
- guard-docs.yml - Ensures documentation diffs run through doc guard scripts.
- guard-meta.yml - Verifies Tasklist/NEXT/Patch invariants and the contract policy.
- guard-render.yml - Confirms Render deployment manifests and associated guards remain synchronized.
- guard-router.yml - Executes router doc regeneration guard to catch drift.
- guard-routing.yml - Validates router link integrity and canonical naming rules.
- guard-dexpack.yml - Runs the dexpack guard to ensure committed assets stay in sync with the build script.
- pbsl-oracle.yml - Replays PBSL oracle fixtures to detect deterministic engine drift.
- refresh-cache.yml - Triggers cache rebuild helpers for Render fallback/routines.
- runtime.yml - Main CI entry running lint/tests to gate releases.
