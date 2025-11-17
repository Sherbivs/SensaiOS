# ROUTER
Title: Documentation Library
Purpose: Architecture, safety, and operational guides referenced across the meta-router.
Owned Globs: docs/**
Last Updated (UTC): 2025-11-17T00:00:00Z

Notes:
- Documents under this tree backstop agents and humans with architecture diagrams, safety guidance, and roadmap context.
- Reference guides are cross-linked from Patch/Prompt/Tasklist so contract updates and recovery playbooks stay discoverable.
- Keep new guides ASCII-only and reference them from masterroutetable.md or ops/ROUTER.yaml when added.
- 2025-11-17: **PHASE 1 COMPLETE** - Reorganized into 3 modular Bible subdirectories (architecture-bible/, operations-bible/, development-bible/) with 29 section files. Deleted consolidated source files and Phase 0 planning documents.

Directory Structure:
- **architecture-bible/** - System architecture Bible (15 files: INDEX + 14 sections, ~3,500 lines)
- **operations-bible/** - Operations & deployment Bible (6 files: INDEX + 5 sections, ~1,800 lines)
- **development-bible/** - Development practices Bible (8 files: INDEX + 7 sections, ~1,538 lines)
- **database/** - Database-specific operational guides (replication, clustering, migration)
- **deployment/** - Render deployment, workers, mount paths, SSH, resource management
- **environment/** - Environment setup, AI configuration, workstation gameplay
- **game-engine/** - Battle engine, PBSL, event tracking, engine database replication

Key Documents by Category:

**Architecture Bible** (architecture-bible/):
- INDEX.md - Navigation hub for 14 architecture sections
- 01-system-overview.md - High-level system architecture and service matrix
- 02-database-architecture.md - Database systems, replication, URL selection [CRITICAL]
- 03-worker-architecture.md - Worker scaling, state visibility, cost optimization
- 04-event-bus.md - Event Bus architecture, correlation tracking, backpressure
- 05-logging-architecture.md - Intelligent logging, buffering, AI integration
- 06-error-system.md - Error detection, tracking, boundaries, recovery
- 07-security-bot.md - Security bot state persistence, restart DMs, role guardrails
- 08-router-system.md - Meta-router design, routing manifests, navigation
- 09-game-engine.md - Battle engine, PBSL, dexpack v2, engine DB replication
- 10-discord-bot.md - Discord bot architecture, DM flows, command suite
- 11-safety-guarantees.md - Security posture, incident response, error boundaries
- 12-observability.md - Metrics transparency, telemetry, monitoring
- 13-performance.md - Optimization strategies, memory management, profiling
- 14-future-roadmap.md - Long-range governance, automation, evolution

**Operations Bible** (operations-bible/):
- INDEX.md - Navigation hub for 5 operations sections
- 01-service-matrix.md - Render services, workers, cron jobs, deployment targets
- 02-database-operations.md - URL selection [CRITICAL], connections, naming, cluster automation, on-premise setup, control suite
- 03-deployment-procedures.md - Render path structure, service naming, API integration, SSH automation, disk resources, one-off jobs
- 04-environment-management.md - AI environment setup, Render access configuration, credentials reference
- 05-monitoring.md - Resource standards, optimization, error dashboard, memory metrics

**Development Bible** (development-bible/):
- INDEX.md - Navigation hub for 7 development sections
- 01-local-setup.md - AI environment, workstation gameplay, VS Code integration
- 02-testing-patterns.md - Unit tests, PBSL oracle, integration tests, coverage
- 03-debugging-guides.md - VS Code debugging, remote debugging, error reproduction, log analysis
- 04-performance.md - Memory analysis, profiling tools, optimization techniques
- 05-error-handling.md - Error boundaries, stuckness detection, recovery workflows
- 06-console-tooling.md - Output standards, formatting helpers, quick reference
- 07-utilities.md - DateTime helpers, timezone standardization, admin patterns

**Database** (database/):
- database-systems.md & db-control-suite.md - Canonical reference for 2-node direct PostgreSQL architecture
- db-replication-architecture.md - Master-replica cascade with version control (Phase 16)
- dual-onpremise-database-guide.md - Dual on-premise database setup for migration testing
- 2-node-cluster-automation.md - Database cluster operations
- db-cluster-quick-start.md & db-cluster-standardization.md - Cluster setup and standards
- database-naming-schema.md - Database naming conventions
- database-url-selection.md - CRITICAL database URL selection logic
- database-connections-reference.md - Connection pooling and client management
- query-optimization-guide.md - Database query optimization strategies

**Game Engine** (game-engine/):
- engine-db-replication.md - Bidirectional Engine DB architecture (Phase 17-22), read/write split, integrity scanner
- engine-cache-safety.md - Engine cache safety guarantees and defensive copies
- engine-db-persistence-opportunities.md - Engine DB disk persistence migration opportunities
- battle-dm-flow.md - Battle DM flow and interaction patterns
- PBSL.md - Provenance and validation notes for deterministic battle fixtures
- event-tracking-schema.md - Event tracking schema for gameplay analytics

**Deployment** (deployment/):
- RENDER-PATH-MAPPING-2025-11-14.md - Render virtual service path mapping investigation
- workers.md - Worker architecture, scaling roadmap, and cost optimization
- render-disk-mount-fix.md - Render persistent disk mount configuration
- render-mount-verification.md - Mount path verification procedures
- comprehensive-mount-path-audit.md - Complete audit of mount paths across services
- render-api-logging-summary.md - Render API integration and logging
- render-one-off-jobs.md - Render one-off jobs feature documentation
- render-ssh-automation.md - Comprehensive SSH automation suite for Render services
- ssh-protocol.md - SSH protocol documentation (Ed25519, regions, operations)
- ssh-logging-playbook.md - SSH logging and troubleshooting
- vscode-render-integration.md - VS Code integration with Render services
- RENDER-SERVICE-NAMING.md - Service naming conventions
- DISK-RESOURCE-INTEGRATION.md - Disk resource integration guide
- DISK-RESOURCE-QUICK-REF.md - Disk resource quick reference
- RESOURCE-REQUEST-QUICK-REF.md - Resource request quick reference
- RESOURCE-MONITOR-STANDARDS.md - Resource monitoring standards
- RESOURCE-OPTIMIZATION-QUICK-REF.md - Resource optimization quick reference

**Environment** (environment/):
- ai-env-setup.md - Secure environment setup for AI agents
- WORKSTATION-GAMEPLAY-SETUP.md - Complete guide for configuring LOCAL PostgreSQL for live gameplay
- render-access-configuration.md - Render access configuration and credentials

