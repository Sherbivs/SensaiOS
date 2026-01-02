# Task Archive — Pokémon Infinity Gauntlet

**Purpose:** Historical record of completed tasks, organized by project/phase for reference and audit trails.

**Location:** `docs/archive/tasks/`

**Policy:** Completed tasks are archived here when Tasklist.md exceeds maintainability thresholds. Each archive file is project/group-specific with a ~500 line limit.

---

## Archive Index

| Archive File | Phase/Project | Task Count | Date Range |
|--------------|---------------|------------|------------|
| [meta-repository-tooling.md](meta-repository-tooling.md) | META.* Repository Tooling | ~30 tasks | 2025-10 to 2025-11 |
| [phase-0-9-core-features.md](phase-0-9-core-features.md) | T0-T9 Core Features | ~25 tasks | 2025-10 to 2025-11 |
| [phase-10-scalability.md](phase-10-scalability.md) | T10 Scalability Foundations | 7 tasks | 2025-10 |
| [phase-11-12-meta-ai.md](phase-11-12-meta-ai.md) | Phase 11-12 Meta & AI | 4 tasks | 2025-10 |
| [phase-13-dex-backbone.md](phase-13-dex-backbone.md) | T13 Dex Data Backbone | 12 tasks | 2025-10 to 2025-11 |
| [phase-14-live-cache.md](phase-14-live-cache.md) | T14 Live Game Cache | 4 tasks | 2025-11 |
| [phase-15-db-bootstrap-northstar.md](phase-15-db-bootstrap-northstar.md) | Phase 15 DB Bootstrap & Northstar | 8 tasks | 2025-11 |
| [phase-16-db-replication.md](phase-16-db-replication.md) | Phase 16 DB Replication | 8 tasks | 2025-11 |
| [phase-17-18-northstar-homestead.md](phase-17-18-northstar-homestead.md) | Phase 17-18 Northstar & Homestead | 7 tasks | 2025-11 |
| [pbsl-kernel-logging.md](pbsl-kernel-logging.md) | PBSL & Kernel Logging | 5 tasks | 2025-10 to 2025-12 |
| [hotfix-system.md](hotfix-system.md) | HF.* Hotfix System | ~8 tasks | 2025-10 to 2025-11 |

---

## Archive Format

Each archive file follows this structure:

```markdown
# [Project Name] — Completed Tasks

**Archived:** YYYY-MM-DD
**Source:** Tasklist.md
**Task Count:** N tasks
**Line Count:** ~NNN lines

---

## Tasks

- id: TASK.ID
  title: Task title
  status: DONE
  depends_on: [dependencies]
  acceptance_criteria:
    - Criterion 1
    - Criterion 2
  notes: |
    Outcome notes...
```

---

## Cross-References

- **Active Tasks:** [Tasklist.md](../../../Tasklist.md)
- **Archive Policy (Detailed):** [AGENTS.md § Task Archive Policy](../../../AGENTS.md#task-archive-policy-enforced)
- **Archive Enforcement:** [Patch.md § Meta-System Maintenance](../../../Patch.md) (>20 DONE tasks trigger)
- **Copilot Instructions:** [.github/copilot-instructions.md § Task Archive Policy](../../../.github/copilot-instructions.md)
- **Instruction Files:** [.github/instructions/copilot-instructions.instructions.md](../../../.github/instructions/copilot-instructions.instructions.md)

---

## Enforcement Mechanism

The Task Archive system is **automatically enforced** via Patch.md Postflight:

1. **Trigger:** When Tasklist.md has 20+ DONE tasks
2. **Action:** Patch.md forces `META.TASKLIST.ARCHIVE` into the quick_task slot
3. **Validation:** Guard scripts ensure archive is completed before session end

This ensures the active tasklist remains maintainable and historical tasks are preserved for audit.

---

## Maintenance

**When to Archive:**
- Tasklist.md exceeds 2000 lines
- Completed tasks section exceeds 100 tasks
- Quarterly maintenance sweep

**How to Archive:**
1. Identify completed tasks by project/phase
2. Create/update appropriate archive file
3. Remove tasks from Tasklist.md
4. Update this README index
5. Update AI instructions (AGENTS.md, copilot-instructions.md)

---

**Created:** 2026-01-01
**Last Updated:** 2026-01-01
