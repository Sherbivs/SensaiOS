# Meta-Router System Audit & Repository Pruning — Task Proposal

**Date:** 2025-12-02  
**Specialists Required:** AI Coding (Lead), Documentation, Architecture  
**Estimated Effort:** 6-8 hours (can be split into 3 main tasks for parallel work)  
**Priority:** HIGH — Router drift accumulated since November 16, 2025  

---

## Executive Summary

The meta-router system (ops/ROUTER.yaml, ops/ROUTER_INDEX.yaml, masterroutetable.md, and 73+ ROUTER.md files) requires comprehensive audit and synchronization. Router timestamps range from October 30 to December 2, creating navigation confusion. Additionally, repository root contains 6 cleanup candidates (CONSOLIDATION-COMPLETE.md, DOCS-CONSOLIDATION-REPORT.md, console.sql, db_workflow_check.sql, test-backup.dump, pbsl-oracle-report.json) that should be archived.

**Key Issues Identified:**
1. **Router Timestamp Drift:** ops/ROUTER.yaml last updated 2025-11-06, masterroutetable.md updated 2025-11-09, but ops/ROUTER_INDEX.yaml regenerated 2025-11-16 — 10+ day gaps cause confusion
2. **Missing Routers:** New directories (src/bot/homestead/, docs/projects/, possibly others) lack ROUTER.md files
3. **Stale Root Files:** 6 files in repository root that should be in ops/ARCHIVE/ or docs/projects/archive/
4. **Bible Integration Incomplete:** docs/ has archive/, meta/, security/, specialists/, standards/ folders that may contain content belonging in Bible sections

---

## Problem Analysis

### Router System State (Detailed Findings)

**Core Router Files:**
- **ops/ROUTER.yaml** (Last Updated: 2025-11-06T04:45:00Z) — 10-day gap behind latest changes
  - Contains comprehensive category mapping
  - **Missing entries:** src/bot/homestead/, docs/projects/, potentially other new directories from November/December work
  - **Issue:** File ownership categories may be outdated (error_monitoring section references old structure)

- **ops/ROUTER_INDEX.yaml** (Generated: 2025-11-16T18:19:06Z) — Auto-generated, should be regenerated
  - Lists 73+ router files with paths, titles, purposes, timestamps
  - **Inconsistent timestamps:** Range from 2025-10-30 (oldest) to 2025-11-16 (newest)
  - **Missing entries:** Any routers created after November 16 won't be listed

- **masterroutetable.md** (Last Updated: 2025-11-09T00:00:00Z) — Human-readable router index
  - 7-day gap behind ROUTER_INDEX.yaml regeneration
  - **Purpose drift:** Document says "Last Updated 2025-11-09" but contains references to 2025-11-16 changes
  - **Missing:** Recent architectural changes (AI Specialist Team System, Bible-centric workflow, private channel architecture)

**Router Coverage Analysis:**
- ✅ **Well-Documented:** src/, tests/, scripts/, prisma/, tools/, data/, assets/
- ⚠️ **Potentially Missing:** src/bot/homestead/ (private channel architecture — 2025-11-21 change), docs/projects/ (new staging area — 2025-12-02), docs/projects/development/, docs/projects/cleanup/ (if they exist)
- ⏳ **Needs Verification:** All 73+ existing ROUTER.md files for accuracy and current timestamps

**Timestamp Analysis (Sample from ROUTER_INDEX.yaml):**
- **Oldest routers:** 2025-10-30 (.db-state/, playbooks/, router/, src/cache/, src/lib/)
- **Mid-range:** 2025-11-01 to 2025-11-08 (majority of routers — 40+ files)
- **Recent:** 2025-11-09 to 2025-11-16 (src/config/, src/workers/, tests/, src/services/, src/utils/, docs/)
- **Gap:** No routers updated after 2025-11-16, but significant work happened 2025-11-17 to 2025-12-02 (17 days of changes)

### Repository Root Cleanup Candidates

**Files Identified for Archival:**

1. **CONSOLIDATION-COMPLETE.md** (9,180 bytes, modified 12/2/2025)
   - **Type:** Completion report for documentation consolidation
   - **Destination:** `docs/projects/cleanup/2025-12-02-docs-consolidation-complete.md` (rename with timestamp)
   - **Reason:** Violates "completion reports in projects/ only" rule established 2025-12-02
   - **Action:** Move + rename + update docs/projects/cleanup/README.md

2. **DOCS-CONSOLIDATION-REPORT.md** (7,824 bytes, modified 12/2/2025)
   - **Type:** Consolidation summary/report
   - **Destination:** `docs/projects/cleanup/` (determine proper filename based on content)
   - **Reason:** Same as above — completion report in wrong location
   - **Action:** Review content, rename with timestamp, move, update README

3. **console.sql** (1,582 bytes, modified 11/8/2025)
   - **Type:** SQL query file (likely ad-hoc testing)
   - **Destination:** `ops/ARCHIVE/sql-queries/console-2025-11-08.sql` or delete if not needed
   - **Reason:** Ad-hoc SQL queries don't belong in repository root
   - **Action:** Review content, archive or delete, document decision

4. **db_workflow_check.sql** (2,439 bytes, modified 11/5/2025)
   - **Type:** SQL query file (database workflow validation)
   - **Destination:** `ops/ARCHIVE/sql-queries/db-workflow-check-2025-11-05.sql` or integrate into ops/DB_BOOTSTRAP.md if still relevant
   - **Reason:** Either archive as historical or integrate into runbook
   - **Action:** Review content, determine if still needed, archive or integrate

5. **test-backup.dump** (0 bytes, modified 12/1/2025)
   - **Type:** Empty database dump file
   - **Destination:** DELETE (zero bytes, no content)
   - **Reason:** Zero-byte file, no value
   - **Action:** Delete immediately

6. **pbsl-oracle-report.json** (6,086 bytes, modified 12/1/2025)
   - **Type:** PBSL test report output
   - **Destination:** `tests/pbsl/reports/pbsl-oracle-report-2025-12-01.json` or delete if generated artifact
   - **Reason:** Test reports belong in tests/ directory or are regenerated each run
   - **Action:** Review if this is a committed test fixture or generated artifact, move or delete accordingly

**Additional Candidates (Not in Root but Identified):**
- **render-cli.zip** (if exists) — Delete, tool can be re-downloaded if needed
- Any other `.dump`, `.sql`, `.bak` files in root — Archive or delete

### Documentation Structure Audit

**docs/ Current State:**
```
docs/
├── architecture-bible/     (22 files) — ✅ GOOD
├── operations-bible/       (17 files) — ✅ GOOD
├── development-bible/      (9 files) — ✅ GOOD
├── projects/               (5 files) — ✅ GOOD (new staging area)
│   ├── development/        — ✅ Has README.md + 3 completion reports
│   └── README.md           — ✅ Master projects index
├── archive/                — ⚠️ NEEDS REVIEW (what's in here?)
├── meta/                   — ⚠️ NEEDS REVIEW (potential Bible integration)
├── security/               — ⚠️ NEEDS REVIEW (should be in operations-bible or development-bible?)
├── specialists/            — ⚠️ NEEDS REVIEW (AI specialist docs? Already in Patch.md/Agents.md)
├── standards/              — ⚠️ NEEDS REVIEW (should be in development-bible?)
└── ROUTER.md               — ✅ GOOD (updated 2025-11-14 to include Bible structure)
```

**Potential Issues:**
1. **archive/** — Unknown contents, may contain outdated documentation that should be deleted or integrated into Bible
2. **meta/** — Meta-system documentation, may duplicate Patch.md/Agents.md/Prompt.md content
3. **security/** — Security-specific docs, should integrate into operations-bible/ or development-bible/
4. **specialists/** — AI specialist documentation, may duplicate recent AI Specialist Team System work (Patch.md § Specialist Team Coordination, Agents.md § AI Specialist Team System)
5. **standards/** — Coding standards, should integrate into development-bible/

**Recommendation:** Audit these 5 folders for:
- Duplicate content (already in Bible or meta-contract files)
- Outdated content (stale dates, superseded by recent work)
- Integration candidates (useful content that belongs in Bible)
- Deletion candidates (obsolete, redundant, or low-value content)

---

## Proposed Task Breakdown

### Task 1: META.ROUTER.SYNC (Main Task - 3 hours)

**Objective:** Refresh all router files, regenerate indexes, synchronize timestamps

**Acceptance Criteria:**
- ✅ ops/ROUTER.yaml updated to 2025-12-02 with all new directories (src/bot/homestead/, docs/projects/)
- ✅ All 73+ ROUTER.md files reviewed and timestamps updated where changes occurred
- ✅ Missing ROUTER.md files created for new directories (src/bot/homestead/, docs/projects/, docs/projects/development/, docs/projects/cleanup/ if exists)
- ✅ ops/ROUTER_INDEX.yaml regenerated via `npm run docs:update-routers`
- ✅ masterroutetable.md synchronized with ROUTER_INDEX.yaml
- ✅ Router guard scripts pass (`scripts/guard_routing.sh`, `scripts/guard_router_docs.sh`)

**Files to Touch:**
- `ops/ROUTER.yaml` (update categories, add missing directories)
- `masterroutetable.md` (sync with regenerated index)
- All ROUTER.md files with changes since their last update
- New ROUTER.md files for missing directories
- `ops/ROUTER_INDEX.yaml` (regenerated, not manually edited)

**Specialists:**
- Documentation Specialist (Lead) — Router structure, naming conventions, cross-references
- Architecture Specialist — Integration points, system topology changes
- AI Coding Specialist — Orchestration, execution, validation

**Sub-Tasks:**
1. **Audit Phase** (45 min)
   - Review all 73+ ROUTER.md files for accuracy
   - Identify missing routers for new directories
   - List all directories created since 2025-11-16
2. **Update Phase** (90 min)
   - Update ops/ROUTER.yaml with new categories/directories
   - Create missing ROUTER.md files
   - Update timestamps on changed ROUTER.md files
3. **Regeneration Phase** (30 min)
   - Run `npm run docs:update-routers` to regenerate ROUTER_INDEX.yaml
   - Sync masterroutetable.md with regenerated index
4. **Validation Phase** (15 min)
   - Run router guard scripts
   - Verify all cross-references resolve
   - Check for broken links in router manifests

### Task 2: META.REPO.PRUNE (Main Task - 2 hours)

**Objective:** Clean repository root, archive stale files, delete zero-byte artifacts

**Acceptance Criteria:**
- ✅ 6 identified files moved/archived/deleted from repository root
- ✅ docs/projects/cleanup/ folder exists with proper README.md
- ✅ Completion reports renamed with timestamp format (YYYY-MM-DD-{name}.md)
- ✅ SQL queries archived to ops/ARCHIVE/sql-queries/ or deleted
- ✅ Test reports moved to tests/pbsl/reports/ or deleted
- ✅ Zero-byte files deleted
- ✅ Repository root contains only canonical meta files + core config files

**Files to Touch:**
- Repository root: 6 files (move/archive/delete)
- `docs/projects/cleanup/README.md` (create if doesn't exist, update with archived reports)
- `ops/ARCHIVE/sql-queries/` (create folder, add archived SQL files)
- `tests/pbsl/reports/` (create if doesn't exist, move test reports)

**Specialists:**
- Documentation Specialist (Lead) — File organization, naming conventions, README updates
- AI Coding Specialist — File operations, validation

**Sub-Tasks:**
1. **Review Phase** (30 min)
   - Review content of each file to determine proper destination
   - Identify if files are still needed or obsolete
2. **Organization Phase** (60 min)
   - Create necessary folders (docs/projects/cleanup/, ops/ARCHIVE/sql-queries/, tests/pbsl/reports/)
   - Move/rename completion reports with timestamp format
   - Archive SQL queries or integrate into runbooks
   - Move test reports or delete if generated artifacts
   - Delete zero-byte files
3. **Documentation Phase** (30 min)
   - Update docs/projects/cleanup/README.md with archived reports
   - Update docs/projects/README.md if new category folders created
   - Document SQL query archival in ops/ARCHIVE/README.md (create if needed)

### Task 3: META.DOCS.AUDIT (Main Task - 3 hours)

**Objective:** Audit docs/ folders (archive/, meta/, security/, specialists/, standards/) for Bible integration or deletion

**Acceptance Criteria:**
- ✅ All 5 folders reviewed (archive/, meta/, security/, specialists/, standards/)
- ✅ Duplicate content identified (already in Bible or meta-contract files)
- ✅ Outdated content identified (stale dates, superseded work)
- ✅ Integration candidates documented (useful content for Bible)
- ✅ Deletion candidates documented (obsolete, redundant, low-value)
- ✅ Recommendations created for each folder (integrate, archive, delete)
- ✅ Bible sections updated with integrated content (if any)
- ✅ Folders archived or deleted per recommendations

**Files to Touch:**
- `docs/archive/` — Review all contents
- `docs/meta/` — Review all contents
- `docs/security/` — Review all contents
- `docs/specialists/` — Review all contents
- `docs/standards/` — Review all contents
- Bible sections (architecture-bible/, operations-bible/, development-bible/) — Integrate useful content
- `docs/ROUTER.md` — Update after folder changes

**Specialists:**
- Documentation Specialist (Lead) — Content review, duplication detection, Bible integration
- Architecture Specialist — Architectural content validation, integration points
- AI Coding Specialist — File operations, Bible updates

**Sub-Tasks:**
1. **Discovery Phase** (60 min)
   - List all files in 5 folders (archive/, meta/, security/, specialists/, standards/)
   - Review dates, sizes, content summaries
   - Identify duplication with existing Bible/meta-contract content
2. **Classification Phase** (60 min)
   - Categorize each file: INTEGRATE, ARCHIVE, DELETE
   - Document reasoning for each decision
   - Identify Bible destination for integration candidates
3. **Integration Phase** (45 min)
   - Integrate useful content into appropriate Bible sections
   - Update Bible section timestamps and revision numbers
   - Add cross-references from old locations to new Bible sections
4. **Cleanup Phase** (15 min)
   - Move archival candidates to docs/archive/ (if not already there)
   - Delete obsolete/redundant files
   - Update docs/ROUTER.md with final structure

---

## Specialist Team Analysis

### AI Coding Specialist (Team Lead)
**Responsibilities:**
- Orchestrate 3-task workflow (router sync, repo prune, docs audit)
- Coordinate file operations (move, rename, delete, create)
- Execute router regeneration (`npm run docs:update-routers`)
- Run validation scripts (router guards, build checks)
- Final approval after Documentation and Architecture specialist signoffs

**Key Concerns:**
- File operation safety (no accidental deletions of important files)
- Router consistency (all references valid, no broken links)
- Git commit strategy (atomic commits per task or combined?)
- Rollback plan if issues discovered

### Documentation Specialist
**Responsibilities:**
- Review all ROUTER.md files for accuracy and completeness
- Ensure naming conventions followed (timestamp format for completion reports)
- Verify cross-references resolve correctly
- Validate Bible integration doesn't create duplication
- Sign off on documentation structure changes

**Key Concerns:**
- Router drift causing navigation confusion
- Completion reports in wrong locations (docs root vs projects/)
- Duplication between docs/ folders and Bible sections
- Outdated content confusing AI agents
- Missing routers for new directories (AI can't navigate)

### Architecture Specialist
**Responsibilities:**
- Validate router categories match actual system topology
- Ensure integration points documented correctly
- Review architectural content in docs/ folders for Bible integration
- Verify system design consistency after router updates
- Sign off on architectural documentation changes

**Key Concerns:**
- ops/ROUTER.yaml categories may be outdated (error_monitoring section references old structure)
- Missing routers for new architectural components (src/bot/homestead/, private channel architecture)
- Architectural documentation scattered in docs/ folders instead of architecture-bible/
- Integration points not documented in routers (AI can't understand system boundaries)

---

## Coordination Notes

**Sequencing:**
- **Task 1 (Router Sync)** can start immediately — independent of other tasks
- **Task 2 (Repo Prune)** can start immediately — independent of other tasks
- **Task 3 (Docs Audit)** depends on Task 1 completion (need up-to-date routers to identify duplication)

**Parallel Execution:**
- Tasks 1 and 2 can run in parallel (no file conflicts)
- Task 3 should wait for Task 1 completion for accurate duplication detection

**Git Strategy:**
- **Option A:** 3 separate commits (one per task) — easier to review, rollback, and track
- **Option B:** 1 combined commit (all tasks together) — cleaner history but harder to rollback
- **Recommendation:** Option A (3 commits) with clear commit messages referencing task IDs

**Risk Mitigation:**
- Review all file operations in dry-run mode before execution
- Keep backups of deleted files (Git history provides this)
- Document all decisions in task completion reports
- Run full test suite after router changes (`npm test`)
- Verify build succeeds after documentation changes (`npm run build`)

---

## Success Metrics

**Router System:**
- ✅ 100% of ROUTER.md files have current timestamps (within 7 days)
- ✅ 100% of new directories have ROUTER.md files
- ✅ ops/ROUTER.yaml contains all directories created since 2025-11-06
- ✅ ops/ROUTER_INDEX.yaml regenerated successfully
- ✅ masterroutetable.md synchronized with ROUTER_INDEX.yaml
- ✅ Router guard scripts pass without errors

**Repository Root:**
- ✅ 0 completion reports in repository root
- ✅ 0 SQL query files in repository root
- ✅ 0 test report files in repository root
- ✅ 0 zero-byte files in repository root
- ✅ Repository root contains only: meta-contract files (Patch.md, Prompt.md, Tasklist.md, Agents.md, masterroutetable.md, OPERATIONS.md, RULESET.md, DATA-SCHEMA.md), config files (package.json, tsconfig.json, vitest.config.ts, eslint.config.js, render.yaml, docker-compose.yml, Dockerfile), README.md, LICENSE

**Documentation Structure:**
- ✅ docs/ contains only: Bible folders (architecture-bible/, operations-bible/, development-bible/), projects/ (staging area), ROUTER.md
- ✅ 0 duplication between docs/ folders and Bible sections
- ✅ All useful content from docs/archive/, docs/meta/, docs/security/, docs/specialists/, docs/standards/ integrated into Bible or archived
- ✅ docs/ROUTER.md updated with final structure

**Quality Gates:**
- ✅ Documentation Specialist approves all naming conventions and cross-references
- ✅ Architecture Specialist approves all integration points and system topology updates
- ✅ AI Coding Specialist confirms all files operations completed successfully
- ✅ Router guard scripts pass
- ✅ Build succeeds (`npm run build`)
- ✅ Tests pass (or same pass rate as before changes)

---

## Estimated Timeline

**Task 1 (META.ROUTER.SYNC):** 3 hours
- Audit: 45 min
- Update: 90 min
- Regeneration: 30 min
- Validation: 15 min

**Task 2 (META.REPO.PRUNE):** 2 hours
- Review: 30 min
- Organization: 60 min
- Documentation: 30 min

**Task 3 (META.DOCS.AUDIT):** 3 hours
- Discovery: 60 min
- Classification: 60 min
- Integration: 45 min
- Cleanup: 15 min

**Total:** 8 hours (can be split across multiple sessions)

**Parallel Execution:** Tasks 1 and 2 can run together, reducing total time to ~6 hours

---

## Next Steps

1. **Review this proposal** — Ensure all concerns addressed, specialists agree on approach
2. **Add to ops/NEXT.yaml** — Place META.ROUTER.SYNC and META.REPO.PRUNE in main_tasks queue (parallel work)
3. **Execute Task 1 and Task 2** — Complete router sync and repository pruning
4. **After Task 1 complete:** Add META.DOCS.AUDIT to queue (depends on Task 1)
5. **Create completion reports** — Document all changes, decisions, and outcomes
6. **Update Bible** — Integrate architectural/operational patterns discovered during audit

---

## References

- **Router System:** ops/ROUTER.yaml, ops/ROUTER_INDEX.yaml, masterroutetable.md
- **Documentation System:** docs/projects/README.md (Bible-centric workflow)
- **Project Organization:** .github/copilot-instructions.md (completion report guidelines)
- **Specialist Coordination:** Patch.md § "Specialist Team Coordination"
- **Quality Standards:** Agents.md § "AI Specialist Team System"

---

**Proposal Created:** 2025-12-02T20:00:00Z  
**Status:** READY FOR REVIEW  
**Next:** Add to Tasklist.md + ops/NEXT.yaml for execution
