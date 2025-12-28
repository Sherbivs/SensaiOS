# ROUTER
Title: Project Documentation Staging Area
Purpose: Work-in-progress documentation before Bible integration (100% accuracy controlled experiment)
Owned Globs: docs/projects/**
Last Updated (UTC): 2025-12-28T18:00:00Z

Notes:
- **Bible-Centric System:** Projects/ is staging area, Bibles are TRUTH
- **100% Accuracy Requirement:** All Bible updates validated by AI integrity check
- **Never Edit Bible During Development:** Use projects/ staging, integrate after validation
- **Folder Structure:** {project-name}/{architecture,implementation,testing,bible-integration}
- **Templates:** .templates/ contains PROJECT-README.md template
- **Archive:** archive/ holds completed projects (post-Bible integration)
- **Cleanup:** cleanup/ holds documentation cleanup and organization projects (temp/ for utility)
- **Pending Validation:** pending-validation/ holds projects awaiting AI integrity check
- **REORGANIZED 2025-12-23:** All loose root files moved to organized project folders

Areas:
- README.md — Complete staged workflow documentation, Bible system overview, project index
- ROUTER.md — This navigation file
- .templates/ — Project README template and scaffolding

Active Projects:
- **Sensai OS Architecture** — 🚀 CANONICAL ARCHITECTURE v1.1.2:
  - SENSAI-FINAL-ARCHITECTURE.md — Master specification (2390+ lines, 18 sections)
  - SENSAI-COMPONENT-OS-BLUEPRINT.md — Component model design (14 sections)
  - SENSAI-ARCHITECTURE-ADDENDUM.md — v1.1 future-proofing extensions
  - SENSAI-MULTITENANT-OBS-FIRST-ADDENDUM.md — v1.1.2 multi-tenant + observability-first
  - SENSAI-QUICK-REFERENCE.md — Quick reference card
- v2-architecture/ — 🚀 ACTIVE: Greenfield rebuild architecture (meetings, blueprints, design)
- database-centric/ — Database-centric development plan (Sprint 1 complete)
- infrastructure/ — TypeScript migration, Discord testing, state persistence
- observability/ — Logging, metrics, alerting architecture and Bible proposals
- phase-6-consolidation/ — Phase 6 dependency/reorganization analysis
- scripts-overhaul/ — Scripts migration and modernization
- specialist-review/ — Expert reviews and implementation planning
- cleanup/ — Documentation cleanup (20+ timestamped reports)
- architect-gui/ — Visual GUI editor (DEFERRED)

Supporting Projects:
- database/ — Database projects and audits
- development/ — Development infrastructure projects
- identity/ — Identity resolution and consolidation
- operations/ — Operations projects
- error-database/ — Error tracking database
- homestead-security-integration/ — Homestead security integration
- prisma-import-standardization/ — Prisma import standards
- security-db-transformation/ — Security database transformation

Archive & Pending:
- archive/ — Completed projects (documentation merged to Bible)
- pending-validation/ — Projects awaiting AI integrity validation

Integration Points:
- **Architecture Bible** (`docs/architecture-bible/`) — 27 sections, 110+ pages authoritative system design
- **Operations Bible** (`docs/operations-bible/`) — 13 sections + 9 guides, 75+ pages authoritative operations procedures
- **Development Bible** (`docs/development-bible/`) — 10 sections authoritative development workflows
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
