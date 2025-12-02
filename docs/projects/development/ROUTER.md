# ROUTER
Title: Development Projects Documentation
Purpose: Completed and active development projects (AI systems, Bible infrastructure, testing frameworks)
Owned Globs: docs/projects/development/**
Last Updated (UTC): 2025-12-02T00:00:00Z

Notes:
- **AI Specialist Team System (COMPLETE):** 3-phase implementation complete (design → integration → guidance)
  * AI-SPECIALIST-TEAM-SYSTEM.md (25.8 KB) — Complete design document covering team structure, detection rules, workflow protocols
  * 2025-12-02-ai-specialist-team-integration.md — Phase 2 completion report (Patch.md, ops/NEXT.yaml, Prompt.md integration)
  * 2025-12-02-ai-guidance-updates-complete.md — Phase 3 completion report (Agents.md, copilot-instructions.md updates)
- **Bible-Centric System (COMPLETE):** Documentation staging workflow with 100% accuracy requirement
  * 2025-12-02-bible-system-complete.md — Completion report covering Bible integrity system, staged workflow, automation plans
- **README.md:** Category folder purpose, active projects tracking, quality standards, cross-references

Areas:
- AI-SPECIALIST-TEAM-SYSTEM.md — AI team coordination design (25.8 KB, 5-phase workflow, detection rules, coordination patterns)
- 2025-12-02-ai-specialist-team-integration.md — Patch.md/NEXT.yaml/Prompt.md integration completion report
- 2025-12-02-ai-guidance-updates-complete.md — Agents.md/copilot-instructions.md updates completion report
- 2025-12-02-bible-system-complete.md — Bible-centric documentation system completion report
- README.md — Folder overview, active projects, guidelines

Integration Points:
- **Patch.md** § "Specialist Team Coordination" — 94 lines, complete workflow protocols
- **ops/NEXT.yaml** — Task metadata with specialists_required and specialist_signoffs fields
- **Prompt.md** § "Embedded PATCHSET Echo" — Enhanced format with specialist tracking
- **Agents.md** § "AI Specialist Team System" — Production guide with team structure, detection rules, workflow
- **.github/copilot-instructions.md** § "AI Specialist Team System" — Copilot integration guide

Purpose Rationale:
Captures development infrastructure projects (AI systems, documentation frameworks, testing utilities) that enhance development workflow but aren't core business logic. Provides reference for:
1. AI team coordination patterns (detection rules, workflow protocols)
2. Documentation system architecture (Bible-centric workflow, integrity requirements)
3. Development infrastructure evolution (completion reports show progress over time)
4. Cross-project learning (patterns discovered in one project inform others)

Workflow Summary:
1. **Project Start:** Create PROJECT-NAME.md with design/architecture
2. **Development:** Document findings as you build
3. **Completion:** Create YYYY-MM-DD-{project-name}-complete.md report
4. **Integration:** Update README.md with project entry, status, results
5. **Archive:** Move to docs/projects/archive/ after extended period (if needed)

Quality Gates:
- ✅ Every completion report follows timestamp naming (YYYY-MM-DD-{name}.md)
- ✅ README.md tracks all projects with status, results, impact
- ✅ Cross-references updated (Patch.md, Agents.md, etc.)
- ✅ Integration points documented for future reference

Success Criteria:
- ✅ Easy to find past development projects
- ✅ Clear documentation of what was built and why
- ✅ Completion reports provide historical context
- ✅ Future developers can learn from past patterns

Cross-References:
- **Projects System** → `docs/projects/README.md` (Bible-centric workflow)
- **Architecture Bible** → `docs/architecture-bible/INDEX.md`
- **Operations Bible** → `docs/operations-bible/INDEX.md`
- **Development Bible** → `docs/development-bible/INDEX.md`
- **Router System** → `ops/ROUTER.yaml` (documentation navigation)

---
Last Audit: 2025-12-02 | Status: 4 projects documented (2 complete, 0 active, 0 pending)
