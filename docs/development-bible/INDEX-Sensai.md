# DEVELOPMENT BIBLE — INDEX

**Centralized Development Guide**  
**Created**: 2025-11-16 | **Updated**: 2025-12-04 | **Status**: Phase 2 Complete

---

## Purpose

Single source of truth for Infinity Gauntlet development workflows, local setup, testing patterns, debugging techniques, performance optimization, database layer patterns, and developer utilities. Consolidates source documents into unified guide.

---

## Sections

1. **[Local Setup](01-local-setup.md)** — AI environment, workstation gameplay, VS Code integration
2. **[Testing Patterns](02-testing-patterns.md)** — Unit tests, integration tests, PBSL oracle, coverage requirements
3. **[Debugging Guides](03-debugging-guides.md)** — VS Code debugging, remote debugging, error reproduction
4. **[Performance](04-performance.md)** — Memory analysis, profiling tools, optimization techniques
5. **[Error Handling](05-error-handling.md)** — Error boundaries, domain-specific handlers, recovery workflows
6. **[Console Tooling](06-console-tooling.md)** — Output standards, quick reference, formatting helpers
7. **[Utilities](07-utilities.md)** — DateTime helpers, timezone standardization, admin implementation patterns
8. **[Profiling](08-profiling.md)** — Performance profiling, memory analysis, bottleneck identification
9. **[Database Onboarding](09-database-onboarding.md)** — Repository pattern, RLS context, transactions, testing database code

---

## Quick Navigation

**Common Tasks**:
- Local Setup: § 1.1 (AI Environment), § 1.2 (Workstation Gameplay)
- Testing: § 2 (Vitest patterns, PBSL oracle)
- Debugging: § 3 (VS Code, remote SSH)
- Performance: § 4.1 (Memory Analysis), § 4.2 (Profiling)
- **Database Layer: § 9 (Repository pattern, RLS, transactions)**

**Cross-References**:
- **[ARCHITECTURE-BIBLE](../architecture-bible/INDEX.md)** — System design, game engine, error system
- **[OPERATIONS-BIBLE](../operations-bible/INDEX.md)** — Database operations, deployment, monitoring
- **[Database ADRs](../projects/database-centric/adrs/)** — Architecture decision records
- **[Agents.md](../../Agents.md)** — Agent operations guide
- **[README.md](../../README.md)** — Getting started

---

## Estimated Reading Time

- **Full Read**: ~35 minutes
- **Local Setup Only** (§ 1): 5 minutes
- **Testing + Debugging** (§ 2-3): 8 minutes
- **Performance + Utilities** (§ 4-7): 7 minutes
- **Database Layer** (§ 9): 15 minutes

---

**Last Updated**: 2025-12-04  
**Revision**: 2.0  
**Total Sections**: 9  
**Estimated Size**: ~2,000 lines