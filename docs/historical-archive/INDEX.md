# Historical Archive INDEX

**Purpose:** Detailed historical reports, migration records, and optimization analyses preserved for institutional knowledge.

**Status:** ARCHIVED — These documents chronicle completed work. For current practices, see the Bible system (architecture-bible, operations-bible, development-bible).

---

## Archive Contents

### Accelerate Elimination (November 2025)

**Context:** Removed Prisma Accelerate dependency after P6003 account hold + DDL limitations discovery. Migrated to direct PostgreSQL (2-node cluster).

| Document | Size | Description |
|----------|------|-------------|
| `ACCELERATE-PURGE-FINAL-REPORT.md` | 18.9 KB | Comprehensive 6-commit purge timeline, validation proof, metrics |
| `PHASE2-ACCELERATE-ELIMINATION-COMPLETE.md` | 10.3 KB | Phase 2 systematic residue elimination (4 commits, prevention system) |
| `PHASE4-DEAD-CODE-ELIMINATION-COMPLETE.md` | 10.9 KB | Phase 4 unused code cleanup (-59 lines, @deprecated fields removed) |

**Current Reference:** See `architecture-bible/15-project-history.md` for summarized historical record.

---

### Database Naming Migration (November 2025)

**Context:** Migrated from ambiguous terminology (local/LOCAL/PRIMARY LOCAL) to canonical naming schema (CLOUD-DEV-MASTER, ONPREMISE-DEV-PRIMARY). Clean break, no backward compatibility.

| Document | Size | Description |
|----------|------|-------------|
| `NAMING-MIGRATION-REPORT.md` | 16.3 KB | Complete migration report (35+ files, 200+ replacements, validation results) |
| `NAMING-MIGRATION.md` | 19.2 KB | Systematic 20-task checklist with rollback procedures |

**Current Reference:** See `operations-bible/02-database-operations.md` for current canonical naming schema.

---

### Repository Optimization (November 2025)

**Context:** Phase 9 comprehensive optimization achieving production-ready state. Zero linter warnings, zero vulnerabilities, zero outdated packages.

| Document | Size | Description |
|----------|------|-------------|
| `REPO-OPTIMIZATION-REPORT.md` | 21.0 KB | Phase 9 completion report (10 commits, 8 phases, metrics before/after) |
| `REPO-OPTIMIZATION-PLAN.md` | 15.3 KB | Initial 6-phase systematic optimization roadmap |
| `CODE-OPTIMIZATION-AUDIT.md` | 21.5 KB | Baseline audit (linter warnings, outdated packages, test performance) |
| `CODEBASE-OVERHAUL-PLAN.md` | 12.1 KB | Early multi-phase cleanup plan (Accelerate + optimization) |
| `PHASE9-CHECKLIST.md` | 5.9 KB | Phase 9 execution tracking checklist |
| `PHASE9.7-ANALYSIS.md` | 6.5 KB | Test suite optimization analysis (6.82s baseline, no optimization needed) |

**Current Reference:** See `operations-bible/06-optimization-history.md` (TODO: to be created) for summarized achievements.

---

### Database Operations (Historical)

| Document | Size | Description |
|----------|------|-------------|
| `DB_IMPORT_PRISMA_POSTGRES.md` | 7.8 KB | Prisma Postgres (Accelerate-backed) import workflow (obsolete) |

**Current Reference:** See `operations-bible/02-database-operations.md` for current database workflows.

---

### Meta Documentation

| Document | Size | Description |
|----------|------|-------------|
| `PATCH_POLICY_BACKUP.md` | 0.4 KB | Contract policy backup (superseded by Patch.md) |

---

## When to Reference Archive

**Use Archive When:**
- Understanding **why** architectural decisions were made (Accelerate removal rationale)
- Troubleshooting **historical** issues (migration error patterns)
- Learning from **past** optimizations (what worked, what didn't)
- Onboarding new contributors (project evolution context)

**DO NOT Use Archive For:**
- Current development practices → See `development-bible/`
- Current operational procedures → See `operations-bible/`
- Current architecture → See `architecture-bible/`

---

## Archive Organization Principles

1. **Preservation:** All files moved (not deleted) — institutional knowledge retained
2. **Consolidation:** Summaries in Bible, details in archive — avoid duplication
3. **Discoverability:** This INDEX provides quick navigation — no git history diving required
4. **Rationale:** Each entry explains **why** archived and **where** to find current docs

---

## Related Documentation

**Bible System (Current):**
- → `architecture-bible/15-project-history.md` — Project history summaries
- → `operations-bible/02-database-operations.md` — Current database operations
- → `operations-bible/06-optimization-history.md` — Optimization achievements (TODO)
- → `development-bible/INDEX.md` — Development guide navigation

**Other Archives:**
- → `docs/ARCHIVE/` — Obsolete technical documentation (Accelerate-era guides)

---

**Last Updated:** 2025-11-17  
**Archive Created:** 2025-11-17  
**Maintainer:** Project documentation team  
**Status:** Historical record (content frozen, index may be updated)
