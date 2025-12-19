# ROUTER
Title: Documentation Library — Bible System
Purpose: Comprehensive architecture, operations, and development guides in modular Bible format.
Owned Globs: docs/**
Last Updated (UTC): 2025-12-18T14:30:00Z

Notes:
- **DOCUMENTATION REMEDIATION (2025-12-18)**: Architecture Bible renumbered to 22 sequential sections, Operations Bible cleaned to 13 sections + 9 guides.
- **HOMESTEAD MIGRATION COMPLETE (2025-06-15)**: All DM-based gameplay migrated to private guild channels. `src/bot/dm/` DELETED.
- Reference guides cross-linked from Patch/Prompt/Tasklist for contract updates and recovery playbooks.
- Keep new guides ASCII-only and reference them from masterroutetable.md or ops/ROUTER.yaml when added.
- **Bible System**: All operational knowledge consolidated into architecture-bible/, operations-bible/, development-bible/.
- **Historical Archive**: Detailed reports, migration records, optimization analyses preserved in docs/archive/.

Directory Structure (CURRENT):
- **architecture-bible/** — System architecture Bible (22 sections + INDEX)
- **operations-bible/** — Operations & deployment Bible (13 sections + 9 comprehensive guides + INDEX)
- **development-bible/** — Development practices Bible (9 sections + INDEX)
- **archive/** — Obsolete technical documentation (Accelerate-era files)

## Bible Navigation

### Architecture Bible (architecture-bible/)
**22 sections** — System architecture, infrastructure, technical design, and project history.

| Section | File | Coverage |
|---------|------|----------|
| **INDEX** | INDEX.md | Navigation hub with quick reference links |
| **01** | 01-system-overview.md | High-level architecture, service matrix, technology stack |
| **02** | 02-database-architecture.md | Database systems, Prisma 7, URL selection [CRITICAL] |
| **03** | 03-worker-architecture.md | Worker scaling, state visibility, Phase 10+ roadmap |
| **04** | 04-event-bus.md | Event Bus design, correlation tracking, backpressure |
| **05** | 05-logging-architecture.md | Intelligent logging, buffering, AI integration |
| **06** | 06-error-system.md | Error detection, tracking, recovery workflows |
| **07** | 07-security-bot.md | State persistence, role guardrails, 7-day retention |
| **08** | 08-storage-system.md | Persistent storage design patterns |
| **09** | 09-game-engine.md | Battle engine, PBSL, dexpack v2, homestead integration |
| **10** | 10-discord-bot.md | Discord bot architecture, command suite |
| **11** | 11-data-pipeline.md | Data ingestion pipeline |
| **12** | 12-observability.md | Metrics, telemetry, monitoring dashboards |
| **13** | 13-performance.md | Optimization strategies, memory management |
| **14** | 14-future-roadmap.md | Long-range governance, Phase 10+ scaling |
| **15** | 15-project-history.md | Major refactorings, migration summaries |
| **16** | 16-boot-sequence.md | Startup lifecycle |
| **17** | 17-service-registry.md | Dependency injection system |
| **18** | 18-private-channel-architecture.md | **Homestead channels (✅ COMPLETE)** |
| **19** | 19-seamless-restart.md | Zero-downtime restart patterns |
| **20** | 20-resource-limits.md | Memory/disk resource management |
| **21** | 21-engine-cache.md | Engine cache layer |
| **22** | 22-starter-selection-flow.md | Starter Pokémon selection |

### Operations Bible (operations-bible/)
**13 sections + 9 comprehensive guides** — Day-to-day operations, deployment, monitoring.

| Section | File | Coverage |
|---------|------|----------|
| **INDEX** | INDEX.md | Navigation hub with operational quick links |
| **01** | 01-service-matrix.md | Render services, workers, cron jobs |
| **02** | 02-database-operations.md | URL selection [CRITICAL], Prisma 7, connections |
| **03** | 03-deployment-procedures.md | Render deployment, SSH automation |
| **04** | 04-environment-management.md | AI environment setup, credentials |
| **05** | 05-monitoring.md | Resource standards, /ops commands |
| **06** | 06-optimization-history.md | Repository modernization summaries |
| **07** | 07-scheduled-restart.md | Auto-restart behavior |
| **08** | 08-rollback-procedures.md | Rollback and recovery |
| **09** | 09-incident-response.md | Incident handling |
| **10** | 10-backup-procedures.md | Backup and restore |
| **11** | 11-scaling.md | Horizontal/vertical scaling |
| **12** | 12-cost-optimization.md | Resource cost management |
| **13** | 13-memory-management.md | Memory optimization strategies |

**Comprehensive Guides** (9 guides):
- worker-troubleshooting-comprehensive.md (22 pages)
- database-operations-runbook-comprehensive.md (25 pages)
- ops-commands-reference-comprehensive.md (28 pages)
- And 6 additional specialized guides

### Development Bible (development-bible/)
**9 sections** — Development workflows, testing, debugging, and implementation guides.

| Section | File | Coverage |
|---------|------|----------|
| **INDEX** | INDEX.md | Navigation hub with development workflow links |
| **01** | 01-local-setup.md | AI environment, workstation setup, VS Code |
| **02** | 02-testing-patterns.md | Vitest, PBSL oracle, integration tests |
| **03** | 03-debugging-guides.md | VS Code debugging, remote debugging |
| **04** | 04-performance.md | Memory analysis, profiling tools |
| **05** | 05-error-handling.md | Error boundaries, recovery workflows |
| **06** | 06-console-tooling.md | Output standards, formatting helpers |
| **07** | 07-utilities.md | DateTime helpers, admin patterns |
| **08** | 08-profiling.md | Heap snapshots, memory profiling |
| **09** | 09-database-onboarding.md | Repository pattern, transactions |

---

## Quick Reference Index

### Critical Documents
- **Resource Limits**: RESOURCE-LIMITS-RAM-VS-DISK.md [CRITICAL - RAM (2 GB) vs Disk (1 GB) distinction]
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

