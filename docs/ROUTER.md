# ROUTER
Title: Documentation Library
Purpose: Architecture, safety, and operational guides referenced across the meta-router.
Owned Globs: docs/**
Last Updated (UTC): 2025-11-09T00:15:00Z

Notes:
- Documents under this tree backstop agents and humans with architecture diagrams, safety guidance, and roadmap context.
- Reference guides are cross-linked from Patch/Prompt/Tasklist so contract updates and recovery playbooks stay discoverable.
- Keep new guides ASCII-only and reference them from masterroutetable.md or ops/ROUTER.yaml when added.
- 2025-11-09: Added console output standardization documentation for centralized CLI/script output formatting.

Key Documents:
- meta-router.md - Describes routing philosophy, recovery loop, and budget heuristics for agent runs.
- architecture.md & operations.md - High-level system overview plus day-to-day operational procedures.
- database-systems.md & db-control-suite.md - Canonical reference for 2-node direct PostgreSQL architecture (DEV master + PROD local node), workstation gameplay setup, and database tooling.
- db-replication-architecture.md - Master-replica cascade with version control (Phase 16), DEV → PROD → Local sync, integrity verification, and reversion detection.
- engine-db-replication.md - **NEW** - Bidirectional Engine DB architecture (Phase 17-22), read/write split, integrity scanner, PROD → Engine Read-DB → Write-DB → PROD cycle.
- WORKSTATION-GAMEPLAY-SETUP.md - Complete guide for configuring LOCAL PostgreSQL as PRIMARY database for live gameplay (<50ms latency).
- dex-v2-design.md - High-availability Pokédex upgrade blueprint paired with the day-one database plan and rollout playbook.
- perfect-system-roadmap.md - Long-range governance/automation roadmap feeding Phase 12 tasks.
- safety.md & ai-env-setup.md - Security posture, incident response, and environment setup for agents.
- PBSL.md - Provenance and validation notes for deterministic battle fixtures.
- console-output-standards.md - Comprehensive standards for consistent CLI/script output formatting using output-formatter utility.
- console-output-quick-reference.md - Quick reference guide for common output formatting patterns and functions.
- console-output-project.md - Project plan and migration strategy for console output standardization initiative.
- console-output-final-report.md - Final report documenting completion of console output standardization across 11 scripts.

