# ROUTER
Title: SensaiOS Multi-Tenant Architecture
Purpose: Multi-tenant observability-first operating layer with ring security, scoped envelopes, and guarded execution
Owned Globs: docs/projects/SensaiOS/**
Last Updated (UTC): 2026-02-17T00:00:00Z

Notes:
- **START HERE:** INDEX.md for document hierarchy and reading order
- **CANONICAL:** SENSAI-FINAL-ARCHITECTURE.md (1,191 lines) defines all architecture
- Ring security model with capability-based access control (Phase 1 READY)
- Multi-tenant TenantScope required on all envelopes (v1.1.2)
- runGuarded() kernel wrapper mandatory for all handlers (v1.1.2)
- 15 documentation files (~7,000 lines total)

Document Tiers:
- TIER 1 (Canonical): SENSAI-FINAL-ARCHITECTURE.md
- TIER 2 (Specs): architecture/*.md (6 files)
- TIER 3 (Guides): COMPONENT-OS-BLUEPRINT, *-ADDENDUM.md files
- TIER 4 (Operational): README.md, ROUTER.md, IMPLEMENTATION-PLAN.md, INDEX.md

Areas:
- INDEX.md — Document hierarchy, version matrix, reading order (NEW)
- README.md — Project overview and quick start
- ROUTER.md — Navigation router (this file)
- IMPLEMENTATION-PLAN.md — Phased implementation guide
- SENSAI-FINAL-ARCHITECTURE.md — CANONICAL specification (all others derive from this)
- SENSAI-COMPONENT-OS-BLUEPRINT.md — Component model deep-dive (909 lines)
- SENSAI-ARCHITECTURE-ADDENDUM.md — Scalability and failure mode patterns (745 lines)
- SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md — v1.1.2 multi-tenant patterns (707 lines)
- SENSAI-QUICK-REFERENCE.md — Cheat sheet (260 lines)
- SENSAIOS-PERFECTED-VISION.md — Vision mapping: perfected end-state, gap analysis, industry comparison, adoption requirements (~710 lines, QA verified)
- architecture/ — Design specifications (6 files, ~3,400 lines)
- architecture/01-tenant-scope.md — TenantScope design (389 lines)
- architecture/02-export-envelope.md — ExportEnvelope spec (548 lines)
- architecture/03-error-detection.md — CanonicalError subsystem (724 lines)
- architecture/04-run-guarded.md — Kernel wrapper pattern (699 lines)
- architecture/05-host-runtime.md — Node container boot contract (~150 lines)
- architecture/06-os-security-model.md — Ring security, capabilities, installation API (892 lines)
- architecture/FINAL-ARCHITECTURE.md — ⚠️ DEPRECATED: Use SENSAI-FINAL-ARCHITECTURE.md (v1.1.2)

Implementation Status:
- Ring Security Phase 1: 5 tasks READY (22h estimated)
- Ring Security Phase 2-4: 13 tasks PROPOSED (6 weeks estimated)
- Existing codebase: src/kernel/ (14 files), src/sensaios/ (18 files)
