# ROUTER
Title: Project Documentation Staging Area
Purpose: Work-in-progress documentation before Bible integration (100% accuracy controlled experiment)
Owned Globs: docs/projects/**
Last Updated (UTC): 2025-12-02T00:00:00Z

Notes:
- **Bible-Centric System:** Projects/ is staging area, Bibles are TRUTH
- **100% Accuracy Requirement:** All Bible updates validated by AI integrity check
- **Never Edit Bible During Development:** Use projects/ staging, integrate after validation
- **Folder Structure:** {project-name}/{architecture,implementation,testing,bible-integration}
- **Templates:** .templates/ contains PROJECT-README.md template
- **Archive:** archive/ holds completed projects (post-Bible integration)
- **Cleanup:** cleanup/ holds documentation cleanup and organization projects (temp/ for utility)
- **Pending Validation:** pending-validation/ holds projects awaiting AI integrity check

Areas:
- README.md — Complete staged workflow documentation, Bible system overview, integrity requirements
- .templates/ — Project README template and scaffolding
- {project-name}/ — Active project documentation (work in progress)
- archive/ — Completed projects (documentation merged to Bible)
- cleanup/ — Documentation cleanup and organization projects (temp/ subfolder for utility)
- pending-validation/ — Projects awaiting AI integrity validation

Integration Points:
- **Architecture Bible** (`docs/architecture-bible/`) — 17 sections, 105+ pages authoritative system design
- **Operations Bible** (`docs/operations-bible/`) — 12+ sections, 75+ pages authoritative operations procedures
- **Development Bible** (`docs/development-bible/`) — 7 sections authoritative development workflows
- **Agents.md** § "Documentation System & Bible Integrity" — Workflow documentation
- **copilot-instructions.md** § "Documentation System" — AI assistant guidance

Purpose Rationale:
Ensures Bible remains 100% accurate representation of production reality by:
1. Preventing direct Bible edits during active development (reduces inaccuracy)
2. Capturing work-in-progress documentation without polluting authoritative sources
3. Enabling systematic AI-powered validation before Bible integration
4. Creating audit trail of project evolution (architecture → implementation → testing → Bible)
5. Enforcing integrity requirements (code accuracy, architecture accuracy, performance accuracy)

Workflow Summary:
1. **Project Init:** Create docs/projects/{name}/{architecture,implementation,testing,bible-integration}
2. **Development:** Document as you build (architecture decisions, gotchas, lessons learned)
3. **Completion:** Consolidate into bible-integration/proposed-changes.md
4. **Validation:** AI integrity check verifies 100% accuracy against codebase
5. **Integration:** Update Bible sections with validated information
6. **Archive:** Move project folder to archive/ after Bible integration

Quality Gates:
- ❌ REJECT: Bible update without AI integrity validation
- ❌ REJECT: Stale code references in Bible updates
- ❌ REJECT: Speculative "will implement" statements in Bible
- ❌ REJECT: Performance claims without actual measurements
- ⚠️ WARN: Large Bible updates without project documentation trail

Success Criteria:
- ✅ Bible is 100% accurate at all times
- ✅ Zero speculative features in Bible
- ✅ All code references resolve correctly
- ✅ All performance claims backed by metrics
- ✅ All architecture diagrams match actual topology
- ✅ Developers trust Bible as single source of truth

Cross-References:
- **Documentation Standards** → `docs/standards/documentation-standards.md`
- **Bible Indexes** → `docs/architecture-bible/INDEX.md`, `docs/operations-bible/INDEX.md`
- **Router System** → `ops/ROUTER.yaml` (documentation navigation)
- **Agents Guide** → `Agents.md` § "Documentation System & Bible Integrity"
- **Copilot Instructions** → `.github/copilot-instructions.md` § "Documentation System"

---
Last Audit: 2025-12-02 | Status: Production-ready (staging system established, automation pending)
