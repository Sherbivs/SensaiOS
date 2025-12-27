# Markdown File Inventory & Bible System Audit — December 27, 2025

**Purpose**: Comprehensive inventory of all markdown files in the repository, identifying files outside /docs for potential consolidation, and auditing bible system dates for consistency.

**Scope**: 372 total markdown files scanned  
**Categories**: Root-level docs, /docs system, routers, test results, project staging

---

## Executive Summary

### Files Outside /docs System

**Total**: ~80 markdown files outside primary /docs hierarchy  
**Categories**:
1. **Root Control Documents** (9 files) — Patch.md, Agents.md, README.md, etc.
2. **Router Network** (~50 files) — ROUTER.md files throughout codebase
3. **Test Results** (4 files) — Worker test sessions in /tests/workers/
4. **Scripts Documentation** (3 files) — README-RENDER.md, scripts/*/ROUTER.md
5. **GitHub System** (8 files) — Agent configs, instructions, prompts
6. **Data Pipeline** (2 files) — data/README.md, data/ROUTER.md
7. **Store State** (1 file) — .db-state/ROUTER.md

### Bible System Status

| Bible | Last Updated | Status | Sections | Notes |
|-------|-------------|--------|----------|-------|
| **Architecture Bible** | 2025-12-26 | ✅ Current | 27 | Complete, well-organized |
| **Operations Bible** | No date in INDEX | ⚠️ Needs Update | 13 + 9 guides | Missing "Last Updated" |
| **Development Bible** | 2025-12-20 | ✅ Current | 10 | Recent update |
| **Prisma 7 Bible** | 2025-12-27 | ✅ Current | 8 sections | Just updated (SSL) |

---

## Category 1: Root Control Documents (Keep — Essential)

These are core project coordination files that MUST remain at repository root:

| File | Purpose | Last Updated | Status | Action |
|------|---------|--------------|--------|--------|
| `README.md` | Project overview, getting started | Recent | ✅ Essential | Keep |
| `Agents.md` | AI agent operations guide | 2025-11-17 | ✅ Essential | Keep, verify date |
| `Patch.md` | AI project manager contract | Recent | ✅ Essential | Keep |
| `Prompt.md` | Operational prompt | Recent | ✅ Essential | Keep |
| `Tasklist.md` | Task ledger | Active | ✅ Essential | Keep |
| `OPERATIONS.md` | Service matrix, observability | Recent | ✅ Essential | Keep |
| `RULESET.md` | Project rules | Unknown | ⚠️ Review | Verify relevance |
| `masterroutetable.md` | Router index | Recent | ✅ Essential | Keep |
| `.github/copilot-instructions.md` | Copilot config | 2025-12-20 | ✅ Essential | Keep |

**Recommendation**: All essential — Keep at root. Update dates where missing.

---

## Category 2: Router Network (~50 files) (Keep — Navigation)

ROUTER.md files provide essential navigation and documentation for each subsystem. These are part of the routing discipline (Patch.md Absolutes) and MUST be maintained.

**Structure**:
```
Repository Root
├── src/ROUTER.md
│   ├── bot/ROUTER.md
│   │   ├── homestead/ROUTER.md
│   │   ├── battle/ROUTER.md
│   │   ├── security/ROUTER.md
│   │   └── ...
│   ├── core/ROUTER.md
│   ├── services/ROUTER.md
│   └── ...
├── scripts/ROUTER.md
│   ├── db/ROUTER.md
│   ├── render/ROUTER.md
│   └── ...
├── tests/ROUTER.md
└── ...
```

**Total Count**: ~50 ROUTER.md files across codebase

**Recommendation**: Keep all ROUTER.md files — These are architectural documentation and navigation aids. Part of Patch.md contract.

---

## Category 3: Test Results (Archive Candidates)

Temporary test session documentation in /tests/workers/:

| File | Purpose | Date | Status | Action |
|------|---------|------|--------|--------|
| `tests/workers/TEST-RESULTS.md` | Worker test results | 2025-12-26 | ⚠️ Duplicate | Archive or delete |
| `tests/workers/TEST-RESULTS-UPDATED.md` | Updated test results | 2025-12-26 | ⚠️ Duplicate | Archive or delete |
| `tests/workers/TEST-RESULTS-FINAL.md` | Final test results | 2025-12-26 | ⚠️ Duplicate | Archive or delete |
| `tests/workers/TEST-SESSION-COMPLETE.md` | Test session summary | 2025-12-26 | ⚠️ Duplicate | Archive or delete |

**Recommendation**: These appear to be temporary test documentation from December 26 worker testing session. Consolidate into single comprehensive test report in `docs/operations-bible/worker-testing-session-2025-12-26.md`, then delete originals.

---

## Category 4: Scripts Documentation (Consolidate to /docs)

| File | Purpose | Status | Action |
|------|---------|--------|--------|
| `scripts/README-RENDER.md` | Render deployment guide | Duplicate | Move to docs/operations-bible/ |

**Recommendation**: Move to `docs/operations-bible/render-deployment-guide.md` (consolidate with existing § 3 Deployment Procedures).

---

## Category 5: GitHub System Files (Keep — Infrastructure)

GitHub-specific configuration and automation:

| File | Purpose | Status | Action |
|------|---------|--------|--------|
| `.github/ROUTER.md` | GitHub directory router | Essential | Keep |
| `.github/ROUTER-Sensai.md` | Sensai router variant | ⚠️ Review | Clarify purpose |
| `.github/copilot-instructions-Sensai.md` | Sensai copilot variant | ⚠️ Review | Clarify purpose |
| `.github/agents/research-gpt.agent.md` | Research agent config | Essential | Keep |
| `.github/agents/cleanup-agent.agent.md` | Cleanup agent config | Essential | Keep |
| `.github/prompts/IG.prompt.md` | IG prompt config | Essential | Keep |
| `.github/prompts/cleanup-meeting.prompt.md` | Cleanup prompt config | Essential | Keep |
| `.github/instructions/*.instructions.md` (6 files) | Instruction sets | Essential | Keep |

**Sensai Variants**: Need clarification on purpose:
- Is "Sensai" an alternate AI agent profile?
- Should these be consolidated with main configs?
- Are these deprecated/experimental?

**Recommendation**: Keep all except Sensai variants (pending clarification).

---

## Category 6: Data Pipeline Documentation (Keep — Domain)

| File | Purpose | Status | Action |
|------|---------|--------|--------|
| `data/README.md` | Data directory overview | Essential | Keep |
| `data/ROUTER.md` | Data subsystem router | Essential | Keep |
| `data/bootstrap/ROUTER.md` | Bootstrap data router | Essential | Keep |

**Recommendation**: Keep — These document the data pipeline subsystem.

---

## Category 7: Store State Documentation (Review)

| File | Purpose | Status | Action |
|------|---------|--------|--------|
| `.db-state/ROUTER.md` | Database state router | ⚠️ Review | Verify purpose |

**Question**: What is `.db-state/` directory? Is this related to:
- On-premise database state?
- Migration markers?
- Temporary state snapshots?

**Recommendation**: Review purpose and either document in operations bible or remove if obsolete.

---

## Category 8: Docs Outside Main Bibles (Consolidate Candidates)

These are markdown files in /docs but not part of the three main bibles:

### Security Documentation (docs/security/)

**Files**: 11 security-related documents  
**Status**: Large collection, some may be outdated

| File | Date | Status | Action |
|------|------|--------|--------|
| `AUDIT-CONSOLIDATION-REPORT.md` | Unknown | Review | Check relevance |
| `SECURITY-INTELLIGENCE-SYSTEM.md` | Unknown | Review | Consolidate to Architecture Bible § 7? |
| `SECURITY-IMPLEMENTATION-STATUS.md` | Unknown | Review | Consolidate to Architecture Bible § 7? |
| `SECURITY-HARDENING-PROJECT.md` | Unknown | Review | Project docs → consolidate to projects/? |
| `SECURITY-BOT-FRESH-FETCH-FIX.md` | Unknown | Review | Archive or consolidate |
| `SECURITY-PHASE-1-2-3-PROGRESS.md` | Unknown | Review | Archive (superseded by DB transformation?) |
| `SECURITY-ARCHIVE-INTELLIGENCE.md` | Unknown | Review | Archive or consolidate |
| `README.md` | Unknown | Essential | Keep as directory index |
| `PROJECT-COMPLETION-REPORT.md` | Unknown | Review | Archive to projects/? |
| `PHASE2-ALERT-DISPATCHER-COMPLETE.md` | Unknown | Review | Archive to projects/? |
| `eventbus-integration-design.md` | Unknown | Review | Consolidate to Architecture Bible § 4? |
| `DEPLOYMENT-CHECKLIST.md` | Unknown | Review | Consolidate to Operations Bible § 3? |
| `SECURITY-PHASE-1-2-COMPLETE.md` | Unknown | Review | Archive to projects/? |

**Recommendation**: Consolidate relevant content into Architecture Bible § 7 (Security Bot), move project reports to `docs/projects/security/`, archive outdated files.

### Meta Documentation (docs/meta/)

**Files**: 6 meta-analysis documents  
**Purpose**: Documentation audits, pipeline reviews, deprecated reference tracking

| File | Date | Status | Action |
|------|------|--------|--------|
| `README.md` | Unknown | Essential | Keep as directory index |
| `PIPELINE-AUDIT-2025-12-02.md` | 2025-12-02 | ⏳ 25 days old | Review for updates |
| `DOCUMENTATION-AUDIT-2025-12-02.md` | 2025-12-02 | ⏳ 25 days old | Review for updates |
| `DEPRECATED-REFS-VALIDATION-2025-12-02.md` | 2025-12-02 | ⏳ 25 days old | Review for updates |
| `deprecated-refs-report.md` | Unknown | ⚠️ Duplicate | Consolidate |
| `deprecated-refs-report-final.md` | Unknown | ⚠️ Duplicate | Consolidate |
| `deprecated-refs-report-current.md` | Unknown | ⚠️ Duplicate | Keep latest only |

**Recommendation**: Keep meta/ directory for audit reports. Consolidate duplicate deprecated-refs reports. Update December 2 audits if needed.

### Standards Documentation (docs/standards/)

**Files**: 3 standards documents  
**Purpose**: Logging standards and migration audits

| File | Date | Status | Action |
|------|------|--------|--------|
| `README.md` | Unknown | Essential | Keep as directory index |
| `LOGGING-STANDARD.md` | Unknown | Essential | Keep, consolidate reference in Architecture Bible § 5? |
| `LOGGING-MIGRATION-AUDIT.md` | Unknown | Review | Archive after validation |

**Recommendation**: Keep standards/ directory. Cross-reference from bibles.

### Troubleshooting Documentation (docs/troubleshooting/)

**Files**: 1 (newly created today)

| File | Date | Status | Action |
|------|------|--------|--------|
| `PRISMA7-SSL-RENDER.md` | 2025-12-27 | ✅ Current | Keep, cross-reference from Operations Bible |

**Recommendation**: Expand troubleshooting/ directory for future guides. Cross-reference from Operations Bible.

### Projects Documentation (docs/projects/)

**Files**: Multiple project-specific docs, including security DB transformation series

**Recommendation**: Keep projects/ directory for active project documentation. Archive completed projects periodically.

---

## Bible System Date Audit

### 1. Architecture Bible (docs/architecture-bible/)

**INDEX Last Updated**: 2025-12-26 ✅  
**Status**: Current

**Recent Updates**:
- 2025-12-26: Updates to system overview, performance
- 2025-12-20: Dead code cleanup meeting
- 2025-11-16: Original consolidation

**Individual Section Dates** (sample check):
- § 1 System Overview: 2025-12-26 ✅
- § 2 Database Architecture: 2025-12-18 (Prisma 7) ✅
- § 7 Security Bot: 2025-11-06 ⚠️ (2 months old — needs update with DB migration)
- § 18 Private Channel Architecture: 2025-11-21 ✅

**Recommendation**: Update § 7 Security Bot to reflect Phase 1 database migration completion (2025-12-27).

---

### 2. Operations Bible (docs/operations-bible/)

**INDEX Last Updated**: No "Last Updated" field ⚠️  
**Created**: 2025-11-16  
**Status**: Missing consolidated update date

**Recent Updates**:
- 2025-12-27: DATABASE-SPECIALIST-AUDIT-2025-12-27.md, STORE-DATA-PIPELINE-QA-AUDIT-2025-12-27.md, MAINTENANCE-SESSION-2025-12-27.md
- 2025-12-26: Various updates to comprehensive guides
- 2025-12-18: § 2 Database Operations (Prisma 7)

**Individual Section Dates** (sample check):
- § 1 Service Matrix: No date listed ⚠️
- § 2 Database Operations: 2025-12-18 (updated with SSL 2025-12-27) ✅
- § 3 Deployment Procedures: No date listed ⚠️
- § 5 Monitoring: No date listed ⚠️

**Recommendation**: 
1. Add "Last Updated: 2025-12-27" to INDEX.md
2. Add section-level "Last Updated" fields to all 13 core sections
3. Update comprehensive guides with dates

---

### 3. Development Bible (docs/development-bible/)

**INDEX Last Updated**: 2025-12-20 ✅  
**Status**: Current

**Recent Updates**:
- 2025-12-20: Dead code cleanup meeting, § 10 Dead Code Analysis
- 2025-11-16: Original consolidation

**Individual Section Dates** (sample check):
- § 1 Local Setup: No date listed ⚠️
- § 10 Dead Code Analysis: 2025-12-20 ✅

**Recommendation**: Add section-level "Last Updated" fields to all 10 sections.

---

### 4. Prisma 7 Bible (docs/prisma-7-bible.md)

**Last Updated**: 2025-12-27 ✅ (just updated today with SSL section)  
**Status**: Current

**Recent Updates**:
- 2025-12-27: § 6.5 SSL Configuration, Error A (P1017/ECONNRESET)
- 2025-12-19: Prisma 7.1.0 upgrade
- 2025-12-18: Initial Prisma 7 migration documentation

**Recommendation**: Excellent — This is the gold standard for date tracking.

---

## Consolidation Recommendations

### Priority 1: Bible Date Standardization (Immediate)

**Operations Bible INDEX**:
- Add "Last Updated: 2025-12-27" field
- Format: `**Created**: 2025-11-16 | **Last Updated**: 2025-12-27 | **Status**: Production Ready | **Prisma**: 7.1.0`

**All Bible Sections**:
- Add section-level "Last Updated" field to every numbered section
- Format: `**Last Updated**: 2025-MM-DD` at top of each section
- Update whenever content changes

**Standard Header Format**:
```markdown
# Section X: Title

**Last Updated**: 2025-12-27 | **Status**: Production  
**Related**: [Cross-references]

[Content]
```

---

### Priority 2: Test Results Consolidation (This Week)

**Action**: Consolidate 4 worker test result files into single comprehensive report

**Steps**:
1. Create `docs/operations-bible/worker-testing-session-2025-12-26.md`
2. Merge content from TEST-RESULTS*.md files
3. Add cross-reference from § 1 Service Matrix
4. Delete original 4 files from tests/workers/

**Estimated Time**: 30 minutes

---

### Priority 3: Security Documentation Cleanup (Next Sprint)

**Action**: Consolidate 13 security files

**Steps**:
1. Review each security file for current relevance
2. Consolidate system docs into Architecture Bible § 7
3. Move project reports to docs/projects/security/
4. Archive completed phase reports
5. Update cross-references

**Estimated Time**: 2-3 hours

---

### Priority 4: Duplicate Report Consolidation (Next Sprint)

**Meta Directory**:
- Keep most recent `deprecated-refs-report-current.md`
- Delete `deprecated-refs-report.md` and `deprecated-refs-report-final.md`

**Estimated Time**: 15 minutes

---

### Priority 5: Scripts Documentation (Next Sprint)

**Action**: Move `scripts/README-RENDER.md` to operations bible

**Steps**:
1. Review content overlap with § 3 Deployment Procedures
2. Consolidate into existing section or create § 3.X subsection
3. Delete original from scripts/
4. Update cross-references

**Estimated Time**: 30 minutes

---

## Date Update Priority Matrix

| File | Current Date | Priority | New Date | Reason |
|------|-------------|----------|----------|--------|
| **Operations Bible INDEX** | None | 🚨 Critical | 2025-12-27 | Missing "Last Updated" |
| **Architecture Bible § 7** | 2025-11-06 | ⚠️ High | 2025-12-27 | DB migration complete |
| **All Bible Sections** | Mixed | ⚠️ High | Individual | Standardize format |
| **Operations Bible § 1-13** | None | ⚠️ High | Individual | Add "Last Updated" |
| **Development Bible § 1-9** | None | ⚠️ High | Individual | Add "Last Updated" |
| **Agents.md** | 2025-11-17 | ✅ Medium | Verify | Check if current |
| **Security Docs** | Unknown | ✅ Medium | Review | Audit all dates |

---

## Recommended Bible Date Format (Standardize)

### INDEX Files
```markdown
# [BIBLE NAME] — INDEX

**Centralized [Purpose] Documentation**  
**Created**: 2025-11-16 | **Last Updated**: 2025-12-27 | **Status**: Production Ready

[Rest of content]
```

### Individual Sections
```markdown
# Section X: Title

**Last Updated**: 2025-12-27 | **Status**: Production  
**Related**: § Y (Cross-reference), § Z (Another reference)

## Overview

[Content]
```

### Benefits
- ✅ Consistent date tracking across all documentation
- ✅ Easy to identify outdated sections
- ✅ Audit trail for documentation maintenance
- ✅ Professional appearance
- ✅ Meets compliance requirements

---

## Files That Should NOT Be Moved

### Essential Root Files
1. `README.md` — Project entry point
2. `Agents.md` — Agent coordination
3. `Patch.md` — Contract rules
4. `Prompt.md` — Current state
5. `Tasklist.md` — Active work
6. `OPERATIONS.md` — Service overview
7. `masterroutetable.md` — Router index

### Essential Infrastructure
8. All `ROUTER.md` files — Navigation system
9. `.github/` system files — GitHub automation
10. `data/` documentation — Pipeline subsystem
11. `docs/*/INDEX.md` files — Bible navigation

---

## Implementation Plan

### Phase 1: Date Standardization (Today — 1 hour)
- [ ] Update Operations Bible INDEX with "Last Updated: 2025-12-27"
- [ ] Add section-level dates to Operations Bible § 1-13
- [ ] Add section-level dates to Development Bible § 1-10
- [ ] Update Architecture Bible § 7 with Phase 1 completion date
- [ ] Verify Agents.md date is current

### Phase 2: Test Results Consolidation (This Week — 30 min)
- [ ] Create consolidated worker testing report
- [ ] Move to docs/operations-bible/
- [ ] Delete 4 duplicate test files
- [ ] Update cross-references

### Phase 3: Security Documentation Review (Next Sprint — 2-3 hours)
- [ ] Audit all 13 security files for relevance
- [ ] Consolidate system docs into Architecture Bible
- [ ] Move project reports to docs/projects/security/
- [ ] Archive completed phases
- [ ] Update cross-references

### Phase 4: Duplicate Cleanup (Next Sprint — 15 min)
- [ ] Keep `deprecated-refs-report-current.md`
- [ ] Delete older duplicate reports
- [ ] Document in CHANGELOG

### Phase 5: Scripts Documentation (Next Sprint — 30 min)
- [ ] Review README-RENDER.md overlap
- [ ] Consolidate into Operations Bible § 3
- [ ] Delete original from scripts/
- [ ] Update cross-references

---

## Success Metrics

### Documentation Quality
- ✅ All bible INDEX files have "Last Updated" dates
- ✅ All bible sections have "Last Updated" dates
- ✅ No duplicate or outdated documentation
- ✅ Consistent date format across all docs
- ✅ Clear audit trail for changes

### Organization
- ✅ All project docs in docs/projects/
- ✅ All system docs in appropriate bibles
- ✅ All test results consolidated
- ✅ No orphaned markdown files
- ✅ Clear navigation paths

### Maintainability
- ✅ Easy to identify outdated sections
- ✅ Standard update procedures
- ✅ Clear ownership of sections
- ✅ Automated date validation possible
- ✅ Compliance-ready documentation

---

## Automation Opportunities

### Future Tooling

**1. Date Validator Script** (`scripts/validate-doc-dates.ts`):
- Scan all markdown files for "Last Updated" field
- Flag files older than 30 days with recent git changes
- Generate outdated documentation report

**2. Documentation Linker** (`scripts/validate-doc-links.ts`):
- Verify all cross-references are valid
- Check for broken links
- Suggest related documentation

**3. Duplicate Detector** (`scripts/detect-duplicate-docs.ts`):
- Find similar content across multiple files
- Suggest consolidation candidates
- Generate merge recommendations

---

## Conclusion

**Current State**:
- 372 markdown files in repository
- ~80 files outside /docs (mostly essential routers)
- Bible system mostly current (2025-12-26/27)
- Operations Bible missing consolidated "Last Updated"
- Some individual sections missing dates

**Recommended Actions**:
1. ✅ Immediate: Add "Last Updated" to Operations Bible INDEX
2. ✅ This Week: Add section-level dates to all bible sections
3. ⏳ Next Sprint: Consolidate test results, security docs, duplicate reports
4. ⏳ Future: Implement automated date validation

**Strategic Value**:
- Professional documentation maintenance
- Easy identification of outdated content
- Clear audit trail for compliance
- Consistent format across all docs
- Supports scaling to larger team

---

**Report Author**: AI Assistant (Claude Sonnet 4.5)  
**Report Date**: 2025-12-27  
**Next Review**: After Phase 1 date standardization complete

