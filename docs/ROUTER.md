# ROUTER
Title: Documentation Library
Purpose: Architecture, safety, and operational guides referenced across the meta-router.
Owned Globs: docs/**
Last Updated (UTC): 2025-11-10T00:00:00Z

Notes:
- Documents under this tree backstop agents and humans with architecture diagrams, safety guidance, and roadmap context.
- Reference guides are cross-linked from Patch/Prompt/Tasklist so contract updates and recovery playbooks stay discoverable.
- Keep new guides ASCII-only and reference them from masterroutetable.md or ops/ROUTER.yaml when added.
- 2025-11-10: Reorganized documentation into subject-based subdirectories aligned with meta-routing system schema.

Directory Structure:
- **architecture/** - System architecture, operations, roadmap, and meta-routing documentation
- **database/** - Database architecture, replication, clustering, migration, and optimization guides
- **error-system/** - Error detection, tracking, learning, alerting, and recovery documentation
- **console-output/** - Console output standardization, formatting standards, and implementation reports
- **game-engine/** - Battle engine, encounter system, PBSL, event tracking, and engine database docs
- **deployment/** - Render deployment, workers, mount paths, and infrastructure documentation
- **environment/** - Environment setup, AI configuration, and workstation gameplay setup
- **northstar/** - Northstar methodology, schema optimization, and consolidation phases
- **task-reports/** - Task completion summaries and phase reports
- **archive/** - Historical documentation (deprecated/superseded)
- **historical/** - Legacy documentation snapshots

Key Documents by Category:

**Architecture** (architecture/):
- meta-router.md - Routing philosophy, recovery loop, and budget heuristics for agent runs
- architecture.md & OPERATIONS.md - High-level system overview plus day-to-day operational procedures
- safety.md - Security posture and incident response
- dex-v2-design.md - High-availability Pokédex upgrade blueprint
- perfect-system-roadmap.md - Long-range governance/automation roadmap
- OPTIMIZATION-BIBLE.md - Comprehensive system optimization strategies
- log-buffer.md - Intelligent log buffering and deduplication
- security-bot-state.md - Security bot operational state persistence
- metrics-transparency.md - System metrics and observability
- restart-dm-format.md - Restart notification formatting
- cache-lru-optimization-summary.md - LRU cache optimization report

**Database** (database/):
- database-systems.md & db-control-suite.md - Canonical reference for 2-node direct PostgreSQL architecture
- db-replication-architecture.md - Master-replica cascade with version control (Phase 16)
- dual-onpremise-database-guide.md - Dual on-premise database setup for migration testing
- 2-node-cluster-automation.md & 2-node-cluster-migration.md - Database cluster operations
- db-cluster-quick-start.md & db-cluster-standardization.md - Cluster setup and standards
- database-naming-schema.md - Database naming conventions
- database-url-selection.md - CRITICAL database URL selection logic
- prisma-to-pg-migration.md - Prisma to PostgreSQL migration guide
- query-optimization-guide.md - Database query optimization strategies

**Error System** (error-system/):
- error-detection-system.md - Comprehensive error detection system guide (architecture, taxonomy, integration)
- error-system-implementation-summary.md - Complete implementation overview and statistics
- error-tracker-integration.md - Error tracker integration patterns
- error-boundaries-implementation.md - Error boundary implementation guide
- error-dashboard-command.md - /ops errors dashboard command documentation
- error-detection-guarantees.md - System guarantees and verification procedures
- error-monitoring-logger-integration.md - Logger integration for error monitoring
- error-system-progress-report.md - Implementation progress tracking

**Console Output** (console-output/):
- console-output-standards.md - Comprehensive standards for consistent CLI/script output formatting
- console-output-quick-reference.md - Quick reference guide for common output formatting patterns
- console-output-project.md - Project plan and migration strategy for standardization initiative
- console-output-final-report.md - Final report documenting completion across 11 scripts

**Game Engine** (game-engine/):
- engine-db-replication.md - Bidirectional Engine DB architecture (Phase 17-22), read/write split, integrity scanner
- engine-cache-safety.md - Engine cache safety guarantees and defensive copies
- engine-db-persistence-opportunities.md - Engine DB disk persistence migration opportunities
- battle-dm-flow.md - Battle DM flow and interaction patterns
- PBSL.md - Provenance and validation notes for deterministic battle fixtures
- event-tracking-schema.md - Event tracking schema for gameplay analytics

**Deployment** (deployment/):
- workers.md - Worker architecture, scaling roadmap, and cost optimization
- render-disk-mount-fix.md - Render persistent disk mount configuration
- render-mount-verification.md - Mount path verification procedures
- comprehensive-mount-path-audit.md - Complete audit of mount paths across services

**Environment** (environment/):
- ai-env-setup.md - Secure environment setup for AI agents
- WORKSTATION-GAMEPLAY-SETUP.md - Complete guide for configuring LOCAL PostgreSQL for live gameplay

**Northstar** (northstar/):
- northstar-methodology.md - Northstar schema consolidation methodology
- northstar-phase1-contract-verification.md - Phase 1 contract verification
- northstar-phase1-handoff.md - Phase 1 handoff documentation
- northstar-phase2-consolidation.md - Phase 2 consolidation guide
- northstar-qa-checklist.md - QA checklist for schema changes
- northstar-schema-state.md - Current schema state tracking
- northstar-solidification-summary.md - Solidification phase summary
- schema-northstar-optimization.md - Schema optimization strategies

**Task Reports** (task-reports/):
- task9-complete-summary.md - Task 9 completion summary
- task9-phase2-summary.md, task9-phase3-summary.md, task9-phase4-summary.md - Task 9 phase reports
- task10-error-alerting-complete.md - Task 10 (error alerting) completion
- task11-error-recovery-complete.md - Task 11 (error recovery) completion
- task12-error-testing-complete.md - Task 12 (error testing) completion
- task13-documentation-complete.md - Task 13 (documentation) completion

