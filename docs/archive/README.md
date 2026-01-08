# Documentation Archive

**Purpose:** Historical project documentation, legacy guides, and completed phase reports preserved for institutional knowledge.

**Last Updated:** 2026-01-08

---

## Contents

### Recent Archives (2026-01-08 Cleanup)

#### sensaios-architecture-2025-12/
7 outdated SensaiOS architecture documents superseded by `docs/projects/SensaiOS/`:
- SENSAIOS-SYSTEM-OVERVIEW.md
- SENSAIOS-KERNEL-DETAIL.md
- SENSAIOS-DATA-FLOW.md
- SENSAIOS-APPLICATION-LAYER.md
- SENSAIOS-OBSERVABILITY-LAYER.md
- SENSAIOS-HOOK-SYSTEM.md
- SENSAIOS-SENSAIOS-COMPONENTS.md

**Status:** ARCHIVED — Superseded by canonical `docs/projects/SensaiOS/` location (v1.2.0)

#### cleanup-meetings-2025-12/
23 cleanup meeting transcripts from December 2025:
- Bible integrity checks, docs consolidation reports
- Singularity audit and remediation
- Cleanup meetings #3-11 transcripts
- Stress remediation and duplication reports

**Status:** ARCHIVED — Historical reference only

---

### Historical Project Plans & Summaries

#### Database & Worker Consolidation
- **centralization-plan-database-workers.md** (53 KB) — Database and worker architecture consolidation plan
- **CONSOLIDATION-PLAN-2025-11-25.md** (9 KB) — November 2025 consolidation planning
- **DATA-CONSOLIDATION-PLAN.md** (12.6 KB) — Data consolidation strategy
- **DATA-CONSOLIDATION-SUMMARY.md** (9.9 KB) — Data consolidation completion summary

#### Phase 14 Android Project (Archived)
- **PHASE-14-COMPLETE-FINAL.md** (10.3 KB) — Phase 14 final completion report
- **PHASE-14-UNIT-SERVICE-COMPLETE.md** (10.3 KB) — Unit service implementation completion
- **PHASE-14-VIEWMODELS-COMPLETE.md** (8.9 KB) — ViewModels refactoring completion

#### Week 3 Integration Projects
- **WEEK3-DAY20-21-INTEGRATION-COMPLETE.md** (9.5 KB) — Day 20-21 integration completion
- **WEEK3-DAY20-21-PROMETHEUS-COMPLETE.md** (6.3 KB) — Prometheus monitoring integration

### Legacy Guides

#### Docker Setup (Superseded)
- **DOCKER-SETUP.md** (7.4 KB) — Legacy Docker setup guide
- **DOCKER-SUMMARY.md** (10.7 KB) — Docker integration summary
- **VSCODE-DOCKER-GUIDE.md** (9.5 KB) — VS Code Docker integration guide

**Note:** Docker guides archived after system moved to Render deployment. See `docs/operations-bible/03-deployment-procedures.md` for current deployment documentation.

#### PostgreSQL Upgrade (Historical)
- **POSTGRESQL-18-QUICK-REF.md** (4.5 KB) — PostgreSQL 18 quick reference
- **POSTGRESQL-18-UPGRADE-PLAN.md** (16.9 KB) — PostgreSQL 18 upgrade planning

### Subdirectories

#### 2025-11-consolidation/
Historical consolidation project artifacts from November 2025.

---

## Archive Guidelines

### What Gets Archived
- ✅ Completed project documentation (after Bible integration)
- ✅ Legacy setup guides (superseded by Bible sections)
- ✅ Historical phase completion reports
- ✅ Migration plans and summaries
- ✅ Upgrade planning documents

### What Stays Active
- ❌ Current operational documentation → Bible sections
- ❌ Work-in-progress projects → `docs/projects/`
- ❌ Active reference guides → Bible INDEX files

### Why Archive Instead of Delete
1. **Audit Trail** — Preserve decision history
2. **Lessons Learned** — Reference for future similar work
3. **Context** — Understanding how we got here
4. **Knowledge Transfer** — Help new team members understand evolution
5. **Recovery** — Ability to reference old approaches if needed

---

## Recent Additions (2026-01-08 Cleanup)

Added 2 new archive directories during documentation cleanup:

1. **sensaios-architecture-2025-12/** — 7 outdated SensaiOS docs from docs/architecture/
   - Superseded by canonical `docs/projects/SensaiOS/` location
   - Version 1.0 docs replaced by v1.2.0 specification
   
2. **cleanup-meetings-2025-12/** — 23 meeting transcripts from docs/projects/cleanup/
   - Historical cleanup meeting transcripts
   - Documents evolution to Bible system

**Also cleaned:**
- Moved `docs/sensaios/AUDIT-REPORT-2025-12-30.md` to `docs/projects/SensaiOS/`
- Removed empty `docs/sensaios/` directory
- Deleted 4 stale test result files from `tests/workers/`

---

## Previous Archive Additions (2025-12-02 Cleanup)

Moved 8 files from docs root to archive/ during documentation cleanup:

1. **centralization-plan-database-workers.md** — Historical consolidation plan
2. **DATA-CONSOLIDATION-PLAN.md** — Data consolidation strategy
3. **DATA-CONSOLIDATION-SUMMARY.md** — Data consolidation completion
4. **DOCKER-SETUP.md** — Legacy Docker guide
5. **DOCKER-SUMMARY.md** — Legacy Docker summary
6. **VSCODE-DOCKER-GUIDE.md** — Legacy VS Code Docker guide
7. **WEEK3-DAY20-21-INTEGRATION-COMPLETE.md** — Week 3 integration completion
8. **WEEK3-DAY20-21-PROMETHEUS-COMPLETE.md** — Prometheus integration completion

**Reason:** Organized historical documentation to clean docs root. Current deployment documentation now in `docs/operations-bible/`.

---

## File Count Summary

- **Total Files:** ~44 markdown files (14 root + 7 sensaios + 23 meetings)
- **Total Size:** ~450 KB (estimated)
- **Date Range:** 2025-11 to 2026-01
- **Categories:** 
  * Historical plans: 4 files
  * Phase completions: 6 files
  * Legacy guides: 3 files
  * Database docs: 2 files
  * SensaiOS v1.0 docs: 7 files (superseded)
  * Cleanup meeting transcripts: 23 files

---

## Cross-References

### Current Documentation
- **Operations Bible:** `docs/operations-bible/INDEX.md` — Current operational procedures
- **Architecture Bible:** `docs/architecture-bible/INDEX.md` — Current system architecture
- **Development Bible:** `docs/development-bible/INDEX.md` — Current development practices

### Related Archives
- **Historical Archive:** `docs/historical-archive/INDEX.md` — Detailed historical reports (Phase 9, migration records)
- **Projects Archive:** `docs/projects/archive/` — Completed project documentation (Bible-integrated)

---

**Purpose:** Preserve institutional knowledge while keeping current documentation clean and authoritative.

**Status:** Active archival system — files organized by project and purpose.
