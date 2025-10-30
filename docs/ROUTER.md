# ROUTER
Title: Documentation Library
Purpose: Architecture, safety, and operational guides referenced across the meta-router.
Owned Globs: docs/**
Last Updated (UTC): 2025-10-30T00:46:00Z

Notes:
- Documents under this tree backstop agents and humans with architecture diagrams, safety guidance, and roadmap context.
- Reference guides are cross-linked from Patch/Prompt/Tasklist so contract updates and recovery playbooks stay discoverable.
- Keep new guides ASCII-only and reference them from masterroutetable.md or ops/ROUTER.yaml when added.

Key Documents:
- meta-router.md - Describes routing philosophy, recovery loop, and budget heuristics for agent runs.
- architecture.md & operations.md - High-level system overview plus day-to-day operational procedures.
- database-systems.md & db-control-suite.md - Canonical reference for schema layout and database tooling.
- perfect-system-roadmap.md - Long-range governance/automation roadmap feeding Phase 12 tasks.
- safety.md & ai-env-setup.md - Security posture, incident response, and environment setup for agents.
- PBSL.md - Provenance and validation notes for deterministic battle fixtures.
