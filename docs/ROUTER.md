# ROUTER
Title: Documentation Library
Purpose: Architecture, safety, and operational guides referenced across the meta-router.
Owned Globs: docs/**
Last Updated (UTC): 2025-11-06T23:50:00Z

Notes:
- Documents under this tree backstop agents and humans with architecture diagrams, safety guidance, and roadmap context.
- Reference guides are cross-linked from Patch/Prompt/Tasklist so contract updates and recovery playbooks stay discoverable.
- Keep new guides ASCII-only and reference them from masterroutetable.md or ops/ROUTER.yaml when added.

Key Documents:
- meta-router.md - Describes routing philosophy, recovery loop, and budget heuristics for agent runs.
- architecture.md & operations.md - High-level system overview plus day-to-day operational procedures.
- database-configuration.md & db-control-suite.md - Canonical reference for triple-client architecture (PROD/DEV/LOCAL), workstation gameplay setup, and database tooling.
- DATABASE-CONFIG-REFERENCE.md - Quick reference card for production standard (Prisma Accelerate), environment variables, and workstation setup.
- WORKSTATION-GAMEPLAY-SETUP.md - Complete guide for configuring LOCAL PostgreSQL as PRIMARY database for live gameplay (<50ms latency).
- db-accelerate-workflow.md - Quick how-to for selecting IG_ENV_FILE secrets and running db:cli/db:smoke in direct vs. Accelerate modes.
- dex-v2-design.md - High-availability Pokédex upgrade blueprint paired with the day-one database plan and rollout playbook.
- perfect-system-roadmap.md - Long-range governance/automation roadmap feeding Phase 12 tasks.
- safety.md & ai-env-setup.md - Security posture, incident response, and environment setup for agents.
- PBSL.md - Provenance and validation notes for deterministic battle fixtures.
