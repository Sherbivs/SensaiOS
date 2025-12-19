# DEVELOPMENT BIBLE — INDEX

**Centralized Development Guide**  
**Created**: 2025-11-16 | **Last Updated**: 2025-12-18 | **Status**: Production Ready

---

## Purpose

Single source of truth for Infinity Gauntlet development workflows, local setup, testing patterns, debugging techniques, performance optimization, and developer utilities. Consolidates 12 source documents into unified guide.

---

## Sections (01-09)

1. **[Local Setup](01-local-setup.md)** — AI environment, workstation gameplay, VS Code integration
2. **[Testing Patterns](02-testing-patterns.md)** — Unit tests, integration tests, PBSL oracle, coverage requirements
3. **[Debugging Guides](03-debugging-guides.md)** — VS Code debugging, remote debugging, error reproduction
4. **[Performance](04-performance.md)** — Memory analysis, profiling tools, optimization techniques
5. **[Error Handling](05-error-handling.md)** — Error boundaries, domain-specific handlers, recovery workflows
6. **[Console Tooling](06-console-tooling.md)** — Output standards, quick reference, formatting helpers
7. **[Utilities](07-utilities.md)** — DateTime helpers, timezone standardization, admin implementation patterns
8. **[Profiling](08-profiling.md)** — Memory profiling, heap snapshots, `/ops snapshot` command, Chrome DevTools analysis
9. **[Database Onboarding](09-database-onboarding.md)** — Repository pattern, RLS context, transaction management, query best practices

---

## Quick Navigation

**Common Tasks**:
- Local Setup: § 1.1 (AI Environment), § 1.2 (Workstation Gameplay)
- Testing: § 2 (Vitest patterns, PBSL oracle)
- Debugging: § 3 (VS Code, remote SSH)
- Performance: § 4.1 (Memory Analysis), § 4.2 (Profiling Tools)
- Profiling: § 8 (Heap snapshots, memory leak diagnosis)
- Database Work: § 9 (Repository pattern, transactions)

**Cross-References**:
- **[ARCHITECTURE-BIBLE](../architecture-bible/INDEX.md)** — System design, game engine, error system
- **[OPERATIONS-BIBLE](../operations-bible/INDEX.md)** — Database operations, deployment, monitoring
- **[Agents.md](../../Agents.md)** — Agent operations guide
- **[README.md](../../README.md)** — Getting started

---

## Estimated Reading Time

- **Full Read**: ~30 minutes
- **Local Setup Only** (§ 1): 5 minutes
- **Testing + Debugging** (§ 2-3): 8 minutes
- **Performance + Profiling** (§ 4, 8): 10 minutes
- **Database Onboarding** (§ 9): 15 minutes

---

**Last Updated**: 2025-12-18  
**Revision**: 2.0 (December 2025 Documentation Remediation)  
**Total Sections**: 9  
**Estimated Size**: ~2,500 lines consolidated from 12 source documents