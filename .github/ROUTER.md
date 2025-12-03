# ROUTER
Title: GitHub Configuration & VS Code Copilot
Purpose: GitHub Actions guards, health checks, deployment support, and VS Code Copilot AI configuration.
Owned Globs: .github/**
Last Updated (UTC): 2025-12-02T23:00:00Z

Notes:
- Guard pipelines (`guard-meta.yml`, `guard-docs.yml`, `guard-router.yml`, `guard-routing.yml`, `guard-render.yml`) enforce contract invariants, router consistency, and Render configuration checks on every push/PR.
- Health jobs (`agent-health.yml`, `data-health.yml`, `runtime.yml`) exercise agent readiness, nightly data refreshes, and end-to-end runtime tests.
- Operational workflows (`pbsl-oracle.yml`, `refresh-cache.yml`) keep deterministic PBSL fixtures and production cache refresh runs aligned with repo state.
- 2025-11-02: Added `guard-dexpack.yml` to rebuild the committed dexpack asset in verification mode during CI.
- 2025-12-02: **Major restructure** — Added comprehensive VS Code Copilot configuration with 6 domain-specific instruction files.

## VS Code Copilot Configuration (ACTIVE)

The following directories contain **actively used** VS Code Copilot configuration:

### instructions/ — Context-Aware Instructions (6 files)
Files with `applyTo:` frontmatter that provide context when editing matching files:

| File | ApplyTo | Lines | Purpose |
|------|---------|-------|---------|
| `copilot-instructions.instructions.md` | `**` | ~220 | Core project context, architecture, workflows |
| `typescript.instructions.md` | `src/**/*.ts` | ~180 | TypeScript patterns, Discord.js, workers, PBSL |
| `database.instructions.md` | `prisma/**` | ~130 | Database architecture, Prisma patterns, migrations |
| `testing.instructions.md` | `tests/**` | ~170 | Vitest patterns, mocking, PBSL oracle |
| `scripts.instructions.md` | `scripts/**` | ~200 | PowerShell, Node.js scripts, Render ops |
| `documentation.instructions.md` | `docs/**,ops/**` | ~180 | Bible system, router discipline, terminology |

### prompts/ — Agent Mode Prompts
Files with `mode: agent` frontmatter for task-based AI agent work:
- **IG.prompt.md** (~180 lines) — Task execution protocol, hotfix protocol, stuckness detection, quality gates

### chatmodes/ — Chat Personalities
Custom chat mode configurations:
- **gpt.chatmode.md** (354 lines) — Pokemon game dev assistant persona, complete system context

### ⚠️ Legacy File (NOT USED by VS Code)
- **copilot-instructions.md** (root level) — DEPRECATED. VS Code reads from `instructions/` directory. Kept for reference only.

## Workflows (GitHub Actions)

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
