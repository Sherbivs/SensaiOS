# DEVELOPMENT BIBLE — INDEX

**Centralized Development Guide**  
**Created**: 2025-11-16 | **Last Updated**: 2026-01-05 | **Status**: Production Ready

---

## Purpose

Single source of truth for Infinity Gauntlet development workflows, local setup, testing patterns, debugging techniques, performance optimization, and developer utilities. Consolidates 13 source documents into unified guide.

---

## Sections (01-11)

1. **[Local Setup](01-local-setup.md)** — AI environment, workstation gameplay, VS Code integration
2. **[Testing Patterns](02-testing-patterns.md)** — Unit tests, integration tests, PBSL oracle, coverage requirements
3. **[Debugging Guides](03-debugging-guides.md)** — VS Code debugging, remote debugging, error reproduction
4. **[Performance](04-performance.md)** — Memory analysis, profiling tools, optimization techniques
5. **[Error Handling](05-error-handling.md)** — Error boundaries, domain-specific handlers, recovery workflows
6. **[Console Tooling](06-console-tooling.md)** — Output standards, quick reference, formatting helpers
7. **[Utilities](07-utilities.md)** — DateTime helpers, timezone standardization, admin implementation patterns
8. **[Profiling](08-profiling.md)** — Memory profiling, heap snapshots, `/ops snapshot` command, Chrome DevTools analysis
9. **[Database Onboarding](09-database-onboarding.md)** — Prisma patterns, RLS context, transaction management, query best practices
10. **[Dead Code Analysis](10-dead-code-analysis.md)** — AI-driven dead code detection, CFG/PDG analysis, clone detection, safe deletion methodology
11. **[SensaiOS Development](11-sensaios-development.md)** — App creation, capability requests, GameServerAPI usage, handler patterns

---

## Quick Navigation

**Common Tasks**:
- Local Setup: § 1.1 (AI Environment), § 1.2 (Workstation Gameplay)
- Testing: § 2 (Vitest patterns, PBSL oracle)
- Debugging: § 3 (VS Code, remote SSH)
- Performance: § 4.1 (Memory Analysis), § 4.2 (Profiling Tools)
- Profiling: § 8 (Heap snapshots, memory leak diagnosis)
- Database Work: § 9 (Prisma patterns, transactions)
- Code Cleanup: § 10 (Dead code detection, evidence tiers, safe deletion)
- SensaiOS Apps: § 11 (App creation, capabilities, GameServerAPI)

**Cross-References**:
- **[ARCHITECTURE-BIBLE](../architecture-bible/INDEX.md)** — System design, game engine, error system
- **[OPERATIONS-BIBLE](../operations-bible/INDEX.md)** — Database operations, deployment, monitoring
- **[Agents.md](../../Agents.md)** — Agent operations guide
- **[README.md](../../README.md)** — Getting started

---

## Estimated Reading Time

- **Full Read**: ~60 minutes
- **Local Setup Only** (§ 1): 5 minutes
- **Testing + Debugging** (§ 2-3): 8 minutes
- **Performance + Profiling** (§ 4, 8): 10 minutes
- **Database Onboarding** (§ 9): 10 minutes
- **Dead Code Analysis** (§ 10): 25 minutes
- **SensaiOS Development** (§ 11): 15 minutes

---

**Last Updated**: 2026-01-05  
**Revision**: 2.2 (Added SensaiOS Development Guide)  
**Total Sections**: 11  
**Estimated Size**: ~3,600 lines consolidated from 14 source documents