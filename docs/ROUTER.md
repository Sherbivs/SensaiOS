# ROUTER
Title: Documentation Library — Bible System
Purpose: Comprehensive architecture, operations, and development guides in modular Bible format.
Owned Globs: docs/**
Last Updated (UTC): 2025-11-17T01:00:00Z

Notes:
- **PHASE 1 COMPLETE (2025-11-17)**: ALL documentation centralized into 3 modular Bible subdirectories.
- 454 → 30 files (93.4% reduction, 424 files deleted).
- Reference guides cross-linked from Patch/Prompt/Tasklist for contract updates and recovery playbooks.
- Keep new guides ASCII-only and reference them from masterroutetable.md or ops/ROUTER.yaml when added.
- **Bible System**: All operational knowledge consolidated into architecture-bible/, operations-bible/, development-bible/.

Directory Structure (FINAL):
- **architecture-bible/** - System architecture Bible (15 files: INDEX + 14 sections, ~3,500 lines)
- **operations-bible/** - Operations & deployment Bible (6 files: INDEX + 5 sections, ~1,800 lines)
- **development-bible/** - Development practices Bible (8 files: INDEX + 7 sections, ~1,538 lines)

**Total: 30 markdown files (29 Bible sections + 1 root ROUTER.md)**

## Bible Navigation

### Architecture Bible (architecture-bible/)
**15 files** — System architecture, infrastructure, and technical design.

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

### Operations Bible (operations-bible/)
**6 files** — Day-to-day operations, deployment, monitoring, and environment management.

| Section | File | Coverage |
|---------|------|----------|
| **INDEX** | INDEX.md | Navigation hub with operational quick links |
| **1. Service Matrix** | 01-service-matrix.md | Render services, workers, cron jobs, deployment targets, service IDs |
| **2. Database Operations** | 02-database-operations.md | URL selection [CRITICAL], connections, naming schema, cluster automation, on-premise setup, control suite, query optimization |
| **3. Deployment Procedures** | 03-deployment-procedures.md | Render path structure, service naming, API integration, SSH automation, disk resources, mount verification, one-off jobs, VS Code integration |
| **4. Environment Management** | 04-environment-management.md | AI environment setup, Render access configuration, credentials reference, secure loading |
| **5. Monitoring** | 05-monitoring.md | Resource standards, optimization, error dashboard, memory metrics, /ops commands |

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

---

## Quick Reference Index

### Critical Documents
- **Database URL Selection**: operations-bible/02-database-operations.md § 2.1 [ABSOLUTE - Violations cause production failures]
- **Worker Scaling Roadmap**: architecture-bible/03-worker-architecture.md § 3.3 (Phase 10+ cost optimization)
- **PBSL Manifesto**: architecture-bible/09-game-engine.md § 9.1 (Deterministic battle testing)
- **Render Path Mapping**: operations-bible/03-deployment-procedures.md § 3.2 (Expected nested structure)
- **Security Bot State**: architecture-bible/07-security-bot.md § 7.2 (7-day retention, cumulative stats)

### Operations Quick Refs
- **Service Matrix**: operations-bible/01-service-matrix.md (8 Render services, deployment targets)
- **Database CLI**: operations-bible/02-database-operations.md § 2.7 (npm run db:cli commands)
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
- ops/NEXT.yaml → operations-bible/01-service-matrix.md (Deployment context)

### From Code
- src/shared/prisma.ts → operations-bible/02-database-operations.md § 2.2 (Database clients)
- src/bot/main.js → architecture-bible/07-security-bot.md (Security bot entry)
- src/utils/logger.js → architecture-bible/05-logging-architecture.md (IntelligentLogger)
- scripts/render_deploy.ps1 → operations-bible/03-deployment-procedures.md § 3.1 (Deployment)

---

## Maintenance Notes

**Bible Updates:**
- When adding new architecture: Update architecture-bible/14-future-roadmap.md first
- When changing operations: Update operations-bible/ relevant section + this ROUTER
- When adding dev tooling: Update development-bible/ relevant section + quick ref

**File Naming:**
- Bible sections: `NN-kebab-case-title.md` (NN = 01-14)
- INDEX files: `INDEX.md` (all caps)
- ROUTER files: `ROUTER.md` (all caps)

**Cross-Linking:**
- Internal Bible links: Relative paths `[Section Title](NN-section-name.md)`
- External docs links: Absolute paths from repo root `docs/bible/section.md`
- Always update navigation in INDEX.md when adding sections

