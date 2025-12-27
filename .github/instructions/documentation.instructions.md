---
applyTo: 'docs/**,ops/**'
---
# Documentation & Operations Instructions — Pokémon Infinity Gauntlet

## Project Leadership

**Creator & CEO:** DRIPTVDD | **Discord ID:** `563220840708177927` (anti-spoofing identifier)

## Documentation Hierarchy

### The Bible System (AUTHORITATIVE)
The Bibles are **100% accurate at all times** — they are the source of truth.

| Bible | Location | Scope |
|-------|----------|-------|
| **Architecture Bible** | `docs/architecture-bible/` | System design, 27 sections |
| **Operations Bible** | `docs/operations-bible/` | Deployment, monitoring, 13 sections + 9 guides |
| **Development Bible** | `docs/development-bible/` | Local setup, testing, 10 sections |

### Projects Staging Area (NOT Authoritative)
```
docs/projects/
├── {project-name}/
│   ├── architecture/     # Design docs during development
│   ├── implementation/   # Code documentation
│   ├── testing/          # Test plans and results
│   └── bible-integration/  # Validated content ready for Bible
```

**Workflow:**
1. Document in `projects/{name}/` during development
2. Run AI integrity validation (100% accuracy requirement)
3. ONLY after validation: integrate to Bible sections
4. Never edit Bible directly during active development

## File Naming Conventions

### Standard Files
- **Markdown:** `kebab-case.md` (e.g., `worker-troubleshooting.md`)
- **Router files:** `ROUTER.md` (uppercase, every directory)
- **Index files:** `INDEX.md` (uppercase, Bible directories)

### Completion Reports
**Format:** `YYYY-MM-DD-{descriptive-name}.md`

Examples:
- `2025-12-02-docs-root-cleanup.md`
- `2025-12-15-worker-scaling-implementation.md`

**Benefits:** Chronological sorting, clear context, git alignment

### Special Files (NEVER Rename)
- `Patch.md`, `Tasklist.md`, `Prompt.md` — Meta coordination
- `Agents.md` — Operations guide
- `ROUTER.md` — Subsystem documentation
- `ops/NEXT.yaml` — Task pointer

## Router Documentation

Every directory MUST have `ROUTER.md`:

```markdown
# ROUTER
Title: [Subsystem Name]
Purpose: [Brief description]
Owned Globs: [directory]/**
Last Updated (UTC): 2025-XX-XXT00:00:00Z

Notes:
- [Key integration points]
- [Recent changes with dates]

Areas:
- [File/directory] — [Purpose]
```

### Router Update Rules
1. Update parent router when adding/removing files
2. Update child router when creating subdirectory
3. Run `npm run docs:update-routers` to regenerate indexes
4. Router updates in SAME commit as code changes

## ops/ Directory Structure

```
ops/
├── NEXT.yaml              # Current task pointer (CRITICAL)
├── ROUTER.yaml            # Router-of-routers manifest
├── ROUTER_INDEX.yaml      # Generated router index
├── ROUTER.md              # ops/ documentation
├── ARCHIVE/               # Archived tasks
│   └── YYYY-MM/           # Monthly archive folders
├── grafana-dashboard.json # Monitoring dashboards
├── prometheus-alerts.yml  # Alert configurations
└── RENDER-CREDENTIALS.md  # Deployment credentials (SENSITIVE)
```

### NEXT.yaml Format
```yaml
current_task: T10.5
status: IN_PROGRESS
started: 2025-12-02T10:00:00Z
notes: "Working on cache optimization"
```

**Rule:** MUST point to a READY task in Tasklist.md

## Tasklist.md Format

```markdown
## Task T10.5: Feature Name
**Status:** READY | IN_PROGRESS | DONE | BLOCKED
**Priority:** P0 (critical) | P1 (high) | P2 (normal) | P3 (low)
**Dependencies:** T10.4
**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2

### Description
What needs to be done...

### Outcome Notes (when DONE)
What was accomplished, any follow-up needed...
```

### Status Flow
`PROPOSED` → `READY` → `IN_PROGRESS` → `DONE` → (archive)

With `BLOCKED` as alternate state when dependencies aren't met.

## Bible Writing Standards

### Section Structure
```markdown
# Section Title

## Overview
Brief introduction (2-3 sentences max)

## Key Concepts
### Concept 1
Details...

### Concept 2
Details...

## Implementation Details
Technical specifics with code examples

## Troubleshooting
Common issues and solutions

## Reference
Links to related documentation
```

### Code Examples in Docs
Always include:
- Language specifier in fenced blocks
- Comments explaining key lines
- Real file paths where code lives

```typescript
// File: src/shared/prisma.ts
// THREE Prisma clients for multi-environment support
export const prisma = new PrismaClient();  // CLOUD-PROD-MASTER
```

### Cross-References
Within same Bible folder, use relative paths:
- Format: `[Title]` + `(./sibling-file.md)` for sibling file links
- Format: `[Title]` + `(../other-bible/file.md)` for cross-bible links

Use absolute paths for external references:
```markdown
See `docs/operations-bible/database-operations-runbook.md`
```

## Terminology Enforcement

**ALL documentation MUST use canonical terminology:**

### Database Terms
- ✅ CLOUD-PROD-MASTER, ONPREMISE-DEV-PRIMARY, ONPREMISE-DEV-EXPERIMENT
- ❌ "LOCAL", "PRIMARY LOCAL", "DEV_DATABASE_URL"

### Channel Terms
- ✅ Homestead Channel, Public Field Channel, Arena Thread
- ❌ "DM gameplay" (deprecated)

### Service Terms
- ✅ Main Bot Worker, Outbox Worker, Cache Worker
- ❌ Generic "worker" without context

**Full Schema:** `Agents.md` § "STANDARDIZED TERMINOLOGY SCHEMA"

## Quality Checklist

Before committing documentation:

- [ ] **Accuracy:** All code references exist and are current
- [ ] **Terminology:** Uses canonical terms only
- [ ] **Links:** All cross-references work
- [ ] **Routers:** Updated in same commit
- [ ] **Timestamps:** `Last Updated` field current
- [ ] **Structure:** Follows section templates
- [ ] **Spelling:** No obvious typos

## Documentation Commands

```powershell
# Rebuild router indexes
npm run docs:update-routers

# Archive completed tasks
npm run tasks:archive

# Validate documentation links
npm run docs:validate

# Regenerate vision/recovery metadata
npm run refresh:vision
```

## Reference

- **Bible Indexes:** `docs/*/INDEX.md`
- **Projects Guide:** `docs/projects/README.md`
- **Router Script:** `scripts/update-routers.ts`
- **Archive Location:** `ops/ARCHIVE/`
