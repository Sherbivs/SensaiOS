# Bible Integration Plan — Database-Centric Project

**Status:** Ready for Integration  
**Date:** 2025-12-04  
**Source Project:** Database-Centric Development Plan (COMPLETE)

---

## Overview

This document tracks which deliverables from the Database-Centric Development Plan should be integrated into the authoritative Bible documentation system.

**Integration Requirement:** All content must pass AI integrity validation before Bible merge (see `docs/projects/README.md` for workflow).

---

## Architecture Bible Integrations

### Target: `docs/architecture-bible/02-database-architecture.md`

| Deliverable | Section | Status |
|-------------|---------|--------|
| Connection Pool Configuration | New § Connection Pooling | ⏳ Pending |
| RLS Policies | New § Row-Level Security | ⏳ Pending |
| Session Context Management | New § Security Patterns | ⏳ Pending |
| Schema Health Audit | § Schema Overview (update) | ⏳ Pending |

**Source Files:**
- `src/config/database-pool-config.ts`
- `prisma/migrations/20251204040000_row_level_security/`
- `src/services/rls-context.ts`
- `docs/architecture-bible/schema-health-audit-2025-12-04.md`

---

### Target: `docs/architecture-bible/03-worker-architecture.md`

| Deliverable | Section | Status |
|-------------|---------|--------|
| Batch Processor | New § Batch Processing | ⏳ Pending |
| Write Coalescer | New § Write Patterns | ⏳ Pending |

**Source Files:**
- `src/services/batch-processor.ts`
- `src/services/write-coalescer.ts`

---

### Target: `docs/architecture-bible/13-performance.md`

| Deliverable | Section | Status |
|-------------|---------|--------|
| Query Cache | New § Caching Layers | ⏳ Pending |
| Query Profiler | New § Query Optimization | ⏳ Pending |
| Prepared Statement Guide | § Statement Caching | ⏳ Pending |

**Source Files:**
- `src/services/query-cache.ts`
- `src/services/query-profiler.ts`
- `docs/projects/database-centric/prepared-statement-guide.md`

---

## Operations Bible Integrations

### Target: `docs/operations-bible/database-operations-runbook-comprehensive.md`

| Deliverable | Section | Status |
|-------------|---------|--------|
| Connection Troubleshooting | New chapter or appendix | ⏳ Pending |
| Query Optimization Guide | New chapter or appendix | ⏳ Pending |

**Source Files:**
- `docs/operations-bible/connection-troubleshooting.md` (already in ops-bible folder)
- `docs/operations-bible/query-optimization-guide.md` (already in ops-bible folder)

**Note:** These may already be discoverable; verify INDEX.md references.

---

### Target: `docs/operations-bible/` (monitoring section)

| Deliverable | Section | Status |
|-------------|---------|--------|
| Database Metrics | New § Database Monitoring | ⏳ Pending |
| Connection Health Monitor | New § Pool Health | ⏳ Pending |

**Source Files:**
- `src/services/database-metrics.ts`
- `src/services/connection-health-monitor.ts`

---

## Development Bible Integrations

### Target: `docs/development-bible/` (new patterns section)

| Deliverable | Section | Status |
|-------------|---------|--------|
| Repository Pattern | New § Repository Pattern | ⏳ Pending |
| Domain Repositories | New § Domain Repositories | ⏳ Pending |
| Audit Service | New § Audit Logging | ⏳ Pending |
| RLS Context Usage | New § Security Patterns | ⏳ Pending |

**Source Files:**
- `src/services/base-repository.ts`
- `src/services/trainer-repository.ts`
- `src/services/pokemon-repository.ts`
- `src/services/battle-repository.ts`
- `src/services/audit-service.ts`
- `src/services/rls-context.ts`

---

### Target: `docs/development-bible/INDEX.md`

| Deliverable | Section | Status |
|-------------|---------|--------|
| Database Onboarding | § 9 (already added) | ✅ Complete |

**Source Files:**
- `docs/development-bible/09-database-onboarding.md` (already placed)

---

## ADR Cross-References

These ADRs should be referenced from relevant Bible sections:

| ADR | Reference From |
|-----|---------------|
| ADR-001 RLS Context | architecture-bible/02-database-architecture.md |
| ADR-002 Repository Pattern | development-bible/patterns section |
| ADR-003 Session-Aware Client | architecture-bible/02-database-architecture.md |

**Source Files:**
- `docs/projects/database-centric/adrs/ADR-001-rls-context-pattern.md`
- `docs/projects/database-centric/adrs/ADR-002-repository-pattern.md`
- `docs/projects/database-centric/adrs/ADR-003-session-aware-client.md`

---

## Integration Priority

### High Priority (Integrate First)

1. **Repository Pattern** → Development Bible
   - Core pattern for all database access
   - Required knowledge for all developers
   
2. **RLS Security** → Architecture Bible
   - Security-critical documentation
   - Must understand before modifying user data flows

3. **Database Onboarding** → Development Bible
   - ✅ Already placed (`09-database-onboarding.md`)
   - New developer first resource

### Medium Priority

4. **Query Cache/Profiler** → Architecture Bible Performance
5. **Connection Health** → Operations Bible
6. **Batch Processor** → Architecture Bible Workers

### Lower Priority (Reference)

7. **ADR Cross-references** → Various sections
8. **Prepared Statement Guide** → Keep in projects folder, link from Bible

---

## Integration Checklist

Before integrating any deliverable:

- [ ] Verify all code references exist in codebase
- [ ] Confirm no "will implement" or speculative content
- [ ] Check file paths are accurate
- [ ] Validate performance claims with actual measurements
- [ ] Ensure diagrams match current architecture
- [ ] Run AI integrity validation

---

## Integration Command Template

When ready to integrate, use this pattern:

```markdown
## § New Section Title

> **Source:** Database-Centric Development Plan (2025-12-04)
> **ADR:** [ADR-00X](../projects/database-centric/adrs/ADR-00X.md)

[Content from deliverable, verified for accuracy]

**Implementation:** `src/services/[service-name].ts`

**See Also:**
- [Related section](./other-section.md)
- [Project source](../projects/database-centric/DELIVERABLES.md)
```

---

## Status Tracking

| Bible | Sections to Update | Status |
|-------|-------------------|--------|
| Architecture | 3 sections | ⏳ Pending |
| Operations | 2 sections | ⏳ Pending |
| Development | 1 section (patterns) | ⏳ Pending |

**Overall Integration Status:** ⏳ Pending post-project validation

---

**Last Updated:** 2025-12-04T17:45:00Z
