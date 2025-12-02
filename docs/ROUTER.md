# ROUTER
Title: Documentation Library — Bible System
Purpose: Comprehensive architecture, operations, and development guides in modular Bible format.
Owned Globs: docs/**
Last Updated (UTC): 2025-12-02T00:00:00Z

Notes:
- **PHASE 1 COMPLETE (2025-11-17)**: ALL documentation centralized into 3 modular Bible subdirectories.
- **PHASE 2 COMPLETE (2025-11-17)**: ops/ historical reports archived to docs/historical-archive/ (13 files).
- **PROJECTS SYSTEM ESTABLISHED (2025-12-02)**: Bible-centric staged workflow system with AI integrity validation (docs/projects/).
- 454 → 31 current files (93.2% reduction) + 5 projects system files + 13 historical archive files = 49 total documentation files.
- Reference guides cross-linked from Patch/Prompt/Tasklist for contract updates and recovery playbooks.
- Keep new guides ASCII-only and reference them from masterroutetable.md or ops/ROUTER.yaml when added.
- **Bible System**: All operational knowledge consolidated into architecture-bible/, operations-bible/, development-bible/.
- **Projects System**: Work-in-progress documentation staged in projects/ with 100% accuracy validation before Bible integration.
- **Historical Archive**: Detailed reports, migration records, optimization analyses preserved in historical-archive/.

Directory Structure (FINAL):
- **architecture-bible/** - System architecture Bible (16 files: INDEX + 15 sections including project history, ~4,500 lines)
- **operations-bible/** - Operations & deployment Bible (7 files: INDEX + 6 sections including optimization history, ~3,500 lines)
- **development-bible/** - Development practices Bible (8 files: INDEX + 7 sections, ~1,538 lines)
- **projects/** - Work-in-progress documentation staging area (5 files: README + ROUTER + .templates + pending-validation + archive, ~750 lines) [NEW 2025-12-02]
- **historical-archive/** - Detailed historical reports (14 files: INDEX + 13 archived reports, ~170 KB)
- **ARCHIVE/** - Obsolete technical documentation (6 files from Accelerate-era)

**Total: 31 current + 5 projects system + 13 historical = 49 markdown files**

## Bible Navigation

### Architecture Bible (architecture-bible/)
**16 files** — System architecture, infrastructure, technical design, and project history.

| Section | File | Coverage |
|---------|------|----------|
| **INDEX** | INDEX.md | Navigation hub with quick reference links |
| **1. System Overview** | 01-system-overview.md | High-level architecture, service matrix, technology stack |
| **2. Database Architecture** | 02-database-architecture.md | Database systems, replication, URL selection [CRITICAL], connections |
| **3. Worker Architecture** | 03-worker-architecture.md | Worker scaling, state visibility, cost optimization, Phase 10+ roadmap |
| **4. Event Bus** | 04-event-bus.md | Event Bus design, correlation tracking, backpressure, pattern matching |
| **5. Logging Architecture** | 05-logging-architecture.md | Intelligent logging, buffering, AI integration, deduplication |
| **6. Error System** | 06-error-system.md | Error detection, tracking, boundaries, recovery workflows |
| **7. Security Bot** | 07-security-bot.md | State persistence, restart DMs, role guardrails, 7-day retention |
| **8. Router System** | 08-router-system.md | Meta-router design, routing manifests, navigation philosophy |
| **9. Game Engine** | 09-game-engine.md | Battle engine, PBSL manifesto, dexpack v2, engine DB replication (Phase 17-22), cache safety, event tracking |
| **10. Discord Bot** | 10-discord-bot.md | Discord bot architecture, DM flows, command suite, AI DM commands |
| **11. Safety Guarantees** | 11-safety-guarantees.md | Security posture, incident response, error boundaries, fail-safe mechanisms |
| **12. Observability** | 12-observability.md | Metrics transparency, telemetry, monitoring dashboards, /ops commands |
| **13. Performance** | 13-performance.md | Optimization strategies, memory management, profiling, bounded structures |
| **14. Future Roadmap** | 14-future-roadmap.md | Long-range governance, automation evolution, Phase 10+ scaling |
| **15. Project History** | 15-project-history.md | Major refactorings (Accelerate elimination, Phase 2/4), migration summaries |

### Operations Bible (operations-bible/)
**7 files** — Day-to-day operations, deployment, monitoring, environment management, and optimization history.

| Section | File | Coverage |
|---------|------|----------|
| **INDEX** | INDEX.md | Navigation hub with operational quick links |
| **1. Service Matrix** | 01-service-matrix.md | Render services, workers, cron jobs, deployment targets, service IDs |
| **2. Database Operations** | 02-database-operations.md | URL selection [CRITICAL], connections, naming schema, cluster automation, on-premise setup, control suite, query optimization |
| **3. Deployment Procedures** | 03-deployment-procedures.md | Render path structure, service naming, API integration, SSH automation, disk resources, mount verification, one-off jobs, VS Code integration |
| **4. Environment Management** | 04-environment-management.md | AI environment setup, Render access configuration, credentials reference, secure loading |
| **5. Monitoring** | 05-monitoring.md | Resource standards, optimization, error dashboard, memory metrics, /ops commands |
| **6. Optimization History** | 06-optimization-history.md | Repository modernization (Phase 9), database naming migration, Accelerate elimination summaries |

### Development Bible (development-bible/)
**8 files** — Development workflows, testing, debugging, and implementation guides.

| Section | File | Coverage |
|---------|------|----------|
| **INDEX** | INDEX.md | Navigation hub with development workflow links |
| **1. Local Setup** | 01-local-setup.md | AI environment (IG_ENV_FILE), workstation gameplay, VS Code integration (Render tasks, SSH) |
| **2. Testing Patterns** | 02-testing-patterns.md | Unit tests (Vitest), PBSL oracle (deterministic battles), integration tests, coverage (80%+ target) |
| **3. Debugging Guides** | 03-debugging-guides.md | VS Code debugging (launch config), remote debugging (Render SSH), error reproduction, log analysis |
| **4. Performance** | 04-performance.md | Memory analysis (profiling, heap snapshots), profiling tools (Node Inspector, Clinic.js, 0x), optimization techniques |
| **5. Error Handling** | 05-error-handling.md | Error boundaries (bot/engine/worker layers), stuckness detection, recovery workflows |
| **6. Console Tooling** | 06-console-tooling.md | Output standards (output-formatter.ts), formatting helpers, ESLint enforcement |
| **7. Utilities** | 07-utilities.md | DateTime helpers (UTC standardization), timezone best practices, admin implementation patterns |

### Projects Staging Area (projects/) [NEW 2025-12-02]
**Work-in-progress documentation** — Staged workflow for project documentation before Bible integration.

| Document | Purpose |
|----------|---------|
| **README.md** | Complete staged workflow system (400+ lines: philosophy, 4-stage workflow, AI integrity check, quality gates, success criteria) |
| **ROUTER.md** | Navigation and purpose documentation (100+ lines: integration points, workflow summary, quality gates) |
| **.templates/PROJECT-README.md** | Project documentation template (150+ lines: 10 sections, 7-item validation checklist) |
| **pending-validation/README.md** | Validation queue guide (30+ lines: 7 accuracy checks, 4-step process) |
| **archive/README.md** | Completed projects archive (40+ lines: archive format, 5 "why archive" reasons) |

**Workflow:** Document as you build → AI integrity validation (100% accuracy) → Bible integration → Archive

**Purpose:** Prevent Bible pollution during active development. All work-in-progress documentation stays in projects/ until accuracy validated.

**Integration:** After validation, updates flow to Architecture Bible, Operations Bible, or Development Bible. Project folder then archived.

**See:** docs/projects/README.md for complete staged workflow documentation (4 stages, integrity requirements, quality gates)

### Historical Archive (historical-archive/)
**14 files** — Detailed historical reports, migration records, optimization analyses preserved for institutional knowledge.

| Document | Description |
|----------|-------------|
| **INDEX.md** | Archive catalog with navigation, rationale for each archived document |
| **PHASE2-ACCELERATE-ELIMINATION-COMPLETE.md** | Phase 2 systematic Accelerate residue elimination (4 commits, prevention system) |
| **PHASE4-DEAD-CODE-ELIMINATION-COMPLETE.md** | Phase 4 unused code cleanup (-59 lines, @deprecated fields removed) |
| **ACCELERATE-PURGE-FINAL-REPORT.md** | Comprehensive 6-commit purge timeline (emergency fix, validation proof, metrics) |
| **NAMING-MIGRATION.md** | Systematic 20-task naming migration checklist with rollback procedures |
| **NAMING-MIGRATION-REPORT.md** | Complete migration report (35+ files, 200+ replacements, clean break philosophy) |
| **REPO-OPTIMIZATION-REPORT.md** | Phase 9 completion report (10 commits, 8 phases, before/after metrics) |
| **REPO-OPTIMIZATION-PLAN.md** | Initial 6-phase systematic optimization roadmap |
| **CODE-OPTIMIZATION-AUDIT.md** | Baseline audit (linter warnings, outdated packages, test performance) |
| **CODEBASE-OVERHAUL-PLAN.md** | Early multi-phase cleanup plan (Accelerate + optimization) |
| **PHASE9-CHECKLIST.md** | Phase 9 execution tracking checklist |
| **PHASE9.7-ANALYSIS.md** | Test suite optimization analysis (6.82s baseline, determined already optimal) |
| **DB_IMPORT_PRISMA_POSTGRES.md** | Prisma Postgres (Accelerate-backed) import workflow (obsolete after migration) |
| **NAMING-MIGRATION.md** | Database naming migration systematic checklist |
| **PATCH_POLICY_BACKUP.md** | Contract policy backup (superseded by Patch.md) |

**Purpose:** Preserve detailed historical context for institutional knowledge. For current practices, see Bible sections above.

---

## Quick Reference Index

### Critical Documents
- **Resource Limits**: RESOURCE-LIMITS-RAM-VS-DISK.md [CRITICAL - RAM (2 GB) vs Disk (1 GB) distinction]
- **Database URL Selection**: docs/operations-bible/database-operations-runbook-comprehensive.md § 2.1 (Database URL Selection) [ABSOLUTE - Violations cause production failures, 25 pages comprehensive guide]
- **Bible-Centric Workflow**: docs/projects/README.md [NEW - Staged documentation system preventing Bible pollution, 100% accuracy requirement]
- **Worker Scaling Roadmap**: architecture-bible/03-worker-architecture.md § 3.3 (Phase 10+ cost optimization)
- **PBSL Manifesto**: architecture-bible/09-game-engine.md § 9.1 (Deterministic battle testing)
- **Render Path Mapping**: operations-bible/03-deployment-procedures.md § 3.2 (Expected nested structure)
- **Security Bot State**: architecture-bible/07-security-bot.md § 7.2 (7-day retention, cumulative stats)

### Operations Quick Refs
- **Service Matrix**: docs/architecture-bible/complete-system-architecture.md § 2 (Service Topology) — 8 Render services, resource allocation, communication flow, health checks (30 pages comprehensive guide)
- **Database CLI**: docs/operations-bible/database-operations-runbook-comprehensive.md § 2.7 (Database CLI Commands) — npm run db:cli operations with complete examples
- **SSH Automation**: operations-bible/03-deployment-procedures.md § 3.4 (Render SSH suite)
- **Environment Setup**: operations-bible/04-environment-management.md § 4.1 (AI env configuration)
- **Monitoring Commands**: operations-bible/05-monitoring.md § 5.3 (/ops commands reference)

### Development Quick Refs
- **Local Setup**: development-bible/01-local-setup.md § 1.1 (IG_ENV_FILE loading)
- **Testing Suite**: development-bible/02-testing-patterns.md § 2.1 (420 tests, 293 passing)
- **VS Code Debugging**: development-bible/03-debugging-guides.md § 3.1 (Launch configs)
- **Memory Profiling**: development-bible/04-performance.md § 4.1 (Heap snapshots, Clinic.js)
- **Console Standards**: development-bible/06-console-tooling.md § 6.1 (output-formatter.ts)

---

## Cross-References

### From Meta-Router
- Patch.md → architecture-bible/11-safety-guarantees.md (Error boundaries)
- Prompt.md → architecture-bible/08-router-system.md (Meta-router design)
- Tasklist.md → architecture-bible/14-future-roadmap.md (Phase 10+ planning)
- ops/NEXT.yaml → docs/architecture-bible/complete-system-architecture.md § 2 (Service Topology) — Deployment context
- Agents.md → docs/projects/README.md (Bible-centric documentation system) [NEW]
- .github/copilot-instructions.md → docs/projects/README.md (AI workflow enforcement) [NEW]

### From Code
- src/shared/prisma.ts → docs/operations-bible/database-operations-runbook-comprehensive.md § 2.2 (Database Clients & Connection Management) — Prisma client initialization
- src/bot/main.js → architecture-bible/07-security-bot.md (Security bot entry)
- src/utils/logger.js → architecture-bible/05-logging-architecture.md (IntelligentLogger)
- scripts/render_deploy.ps1 → operations-bible/03-deployment-procedures.md § 3.1 (Deployment)

---

## Maintenance Notes

**Bible Updates:**
- When adding new architecture: Update architecture-bible/14-future-roadmap.md first
- When changing operations: Update operations-bible/ relevant section + this ROUTER
- When adding dev tooling: Update development-bible/ relevant section + quick ref
- **When documenting new projects: Create docs/projects/{name}/ → validate 100% accuracy → integrate to Bible → archive** [NEW]

**File Naming:**
- Bible sections: `NN-kebab-case-title.md` (NN = 01-14)
- INDEX files: `INDEX.md` (all caps)
- ROUTER files: `ROUTER.md` (all caps)

**Cross-Linking:**
- Internal Bible links: Relative paths `[Section Title](NN-section-name.md)`
- External docs links: Absolute paths from repo root `docs/bible/section.md`
- Always update navigation in INDEX.md when adding sections

