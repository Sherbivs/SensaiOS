# Meta Documentation Index

**Purpose**: Central navigation hub for all meta documentation in the Infinity Gauntlet repository.  
**Last Updated**: 2025-11-07  
**Status**: Post-Phase 9 Final Cleanup  

---

## Quick Reference

### For AI Agents Starting a Task
1. **Read First**: `Patch.md` (contract rules, Absolutes, workflow)
2. **Check Context**: `Prompt.md` (recent changes, PATCHSET echo, current revision)
3. **Find Task**: `Tasklist.md` + `ops/NEXT.yaml` (READY tasks, dependencies)
4. **Understand Architecture**: `AGENTS.md` (operations guide, database setup, core concepts)
5. **Navigate Code**: `masterroutetable.md` + `ops/ROUTER.yaml` (routing manifests)

### For Human Developers
1. **Getting Started**: `README.md` (setup, requirements, key capabilities)
2. **Operations**: `OPERATIONS.md` (service matrix, deployment, monitoring)
3. **Deployment**: `ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md` (comprehensive deployment guide)
4. **Worker Architecture**: `docs/workers.md` (scaling roadmap, monitoring, cost optimization)
5. **Database Operations**: `ops/DB_BOOTSTRAP.md` + `docs/database-url-selection.md`

---

## Core Meta Documents

### Contract & Control Documents

#### Patch.md — AI Project Manager Contract
- **Purpose**: Defines operating rules, marker modes, workflow, Absolutes
- **When to Read**: ALWAYS before starting any task
- **Key Sections**:
  - Marker Switch (Contract Mode vs Markerless Mode)
  - Absolutes (apply in every mode)
  - Operating Loop (Plan & Execute, Update State)
  - Preflight/Postflight checks
  - Hotfix Loop (emergency overrides)
- **Cross-References**:
  - → `Prompt.md` (PATCHSET echo template, revision tracking)
  - → `Tasklist.md` (READY queue, dependency management)
  - → `ops/NEXT.yaml` (pointer discipline, task routing)
  - → `ops/TOUCHMAP.yaml` (file scope boundaries)
  - → `Patch-Template.md` (legacy layout bridge)
  - → `docs/database-url-selection.md` (Absolute: database URL selection)
- **Referenced By**:
  - `AGENTS.md` (Orientation Flow)
  - `Prompt.md` (Contract Mode status)
  - `ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md` (validation requirements)

#### Prompt.md — Operational Prompt
- **Purpose**: Current timestamp, recent changes, PATCHSET echo, task context
- **When to Read**: After `Patch.md`, before planning work
- **Key Sections**:
  - Timestamp & Revision (bumped on every change)
  - Last Repo Changes (summary of effective modifications)
  - PATCHSET Echo (current task status, test results, contract mode)
  - AI Worker Prompt (copy/paste template for GPT/Copilot)
- **Cross-References**:
  - ← `Patch.md` (echo template, update requirements)
  - → `Tasklist.md` (references completed tasks)
  - → `ops/NEXT.yaml` (READY pointer context)
  - → `ops/REPO-OPTIMIZATION-REPORT.md` (Phase 9 achievements)
  - → `docs/workers.md` (worker architecture)
- **Referenced By**:
  - `AGENTS.md` (Orientation Flow)
  - `Patch.md` (echo requirements)
  - `ops/NEXT.yaml` (sync check)

#### Tasklist.md — Task Ledger
- **Purpose**: Tracks backlog (PROPOSED/READY/IN_PROGRESS/DONE/BLOCKED)
- **When to Read**: Before selecting work, when updating task status
- **Key Sections**:
  - Status legend (workflow states)
  - Phase 0-16 tasks (meta, repo, tooling, database, features)
  - Acceptance criteria per task
  - Outcome notes when marked DONE
- **Cross-References**:
  - ← `Patch.md` (discipline requirements, header updates)
  - ← `Prompt.md` (references completed work)
  - → `ops/NEXT.yaml` (READY task pointer)
  - → `ops/TOUCHMAP.yaml` (file scope per task)
  - → `docs/*` (implementation references)
- **Referenced By**:
  - `AGENTS.md` (Core Control Documents)
  - `Patch.md` (Operating Loop)
  - `ops/NEXT.yaml` (task ID validation)

#### ops/NEXT.yaml — Task Pointer
- **Purpose**: Single-file pointer for next actionable task, file hints
- **When to Read**: After `Tasklist.md`, before executing work
- **Key Fields**:
  - `next_task_id`: Must point to READY task (validated by Postflight)
  - `reason`: Why this task is next
  - `files_hint`: Paths expected to change
  - `timestamp_utc`: Last update time
  - `note`: Context about task state
- **Cross-References**:
  - ← `Patch.md` (pointer discipline, Preflight/Postflight)
  - ← `Tasklist.md` (READY task validation)
  - ← `Prompt.md` (sync check)
  - → File paths listed in `files_hint`
- **Referenced By**:
  - `AGENTS.md` (Orientation Flow)
  - `Patch.md` (Preflight, Postflight)
  - `Prompt.md` (PATCHSET echo)

---

### Architecture & Operations

#### AGENTS.md — Agent Operations Guide
- **Purpose**: Comprehensive operations guide for AI agents and humans
- **When to Read**: For architecture overview, database setup, worker configuration
- **Key Sections**:
  - Mission (Phase 9 completion status)
  - Repo Map (directory structure, file counts)
  - Orientation Flow (startup checklist)
  - Core Control Documents (meta doc purposes)
  - How to Run Locally (install, dev, test, lint)
  - Database URL Selection (CRITICAL: 2-node cluster, URL logic)
  - Database Replication Architecture (Phase 16: master-replica cascade)
  - State Persistence (security bot operational state)
  - Worker Architecture (references `docs/workers.md`)
  - Capabilities & Routing Hints (planner, researcher, implementer, reviewer)
  - Contract Workflow Quickstart (clipboard, execute, update, archive)
  - Router Contract (mandatory routing updates)
  - Safety Invariants (never violate)
  - Stuckness Detection & Recovery (self-healing)
  - Observability (logging, metrics, cache)
  - Production & Render Notes (8 services, worker details → `docs/workers.md`)
  - Done Criteria (diff, tests, reviewer checklist)
  - Testing & Tooling (npm scripts, guard scripts)
  - Data & Cache Pipelines (bootstrap, facade, recipes)
  - Key Directories Snapshot (src/, scripts/, ops/, tests/)
  - Checklist Before Exit (clipboard, Prompt, NEXT, routers, commit)
- **Cross-References**:
  - ← `Patch.md` (contract rules)
  - ← `Prompt.md` (recent changes)
  - ← `Tasklist.md` (backlog)
  - → `README.md` (getting started, architecture)
  - → `OPERATIONS.md` (service matrix, deployment)
  - → `docs/workers.md` (worker architecture, scaling)
  - → `docs/database-url-selection.md` (database URL logic)
  - → `ops/DB_BOOTSTRAP.md` (migration workflow)
  - → `ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md` (deployment guide)
  - → `masterroutetable.md` (router index)
  - → `ops/ROUTER.yaml` (router-of-routers)
- **Referenced By**:
  - `README.md` (meta index)
  - `Patch.md` (Absolutes, database URL requirement)
  - `ops/NEXT.yaml` (guidance references)

#### README.md — Repository Overview
- **Purpose**: Human-facing getting started guide, architecture snapshot
- **When to Read**: For setup instructions, capability overview, repository layout
- **Key Sections**:
  - Current Status & Goals
  - Architecture Snapshot (bot layer, core engine, data & persistence)
  - PBSL (Pokémon Buddy System Logics)
  - Key Capabilities (DM-as-Home, Wild Encounters, Arena Battles, Admin Ops)
  - Repository Layout (directory structure)
  - Requirements (Node.js, npm, Postgres, Discord bot token)
  - Getting Started (Development)
  - Common Dev Commands
  - Local Test Instance Checklist
  - Data Pipeline & Workers
  - Deployment Notes
  - Deploying on Render
  - Render Runtime & Database Blueprint
  - Operational Guardrails & Meta Workflow
  - Router & Meta Index
  - Legacy Bots (Reference Only)
  - Roadmap Highlights
- **Cross-References**:
  - → `AGENTS.md` (AI operations guide)
  - → `OPERATIONS.md` (service matrix, rollout checklist)
  - → `docs/workers.md` (worker architecture)
  - → `docs/PBSL.md` (PBSL manifesto)
  - → `docs/ai-env-setup.md` (environment loading)
  - → `docs/db-control-suite.md` (database CLI)
  - → `ops/DB_BOOTSTRAP.md` (migration workflow)
  - → `Patch.md` (contract workflow)
  - → `Tasklist.md` (backlog)
  - → `Prompt.md` (change ledger)
  - → `masterroutetable.md` (router index)
  - → `ops/ROUTER.yaml` (routing metadata)
- **Referenced By**:
  - `AGENTS.md` (Core Control Documents)
  - `ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md` (deployment references)

#### OPERATIONS.md — Service Matrix & Deployment
- **Purpose**: Service definitions, rollout checklist, observability, incident recovery
- **When to Read**: For deployment, service configuration, monitoring setup
- **Key Sections**:
  - Service Matrix (8 services: purpose, entry command, env flags, health signals)
  - Rollout Checklist (deployment steps)
  - Incident & Recovery Notes
  - Observability (Live) - worker metrics, alert thresholds
  - Durable Event Bus Sink (backup storage configuration)
  - Database Connection Modes (auto/external/internal)
  - Load Test / Game-Night Dry Run
  - Secret Handling
  - Quick Commands
  - Dexpack Build & Guard Workflow
- **Cross-References**:
  - → `docs/workers.md` (comprehensive worker architecture)
  - → `docs/database-systems.md` (schema, role, helper context)
  - → `docs/query-optimization-guide.md` (alerting thresholds)
  - → `docs/event-tracking-schema.md` (event tracking)
  - → `AGENTS.md` (router navigation)
  - → `render.yaml` (service definitions)
- **Referenced By**:
  - `README.md` (operations reference)
  - `AGENTS.md` (Production & Render Notes)
  - `ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md` (service validation)

#### docs/workers.md — Worker Architecture Guide
- **Purpose**: Comprehensive worker architecture, scaling roadmap, monitoring, cost optimization
- **When to Read**: For worker configuration, scaling decisions, Phase 10+ planning
- **Key Sections**:
  - Overview (8 current workers + 1 cron job)
  - Current Worker Architecture (detailed per worker)
  - Worker Communication Patterns (database queues, scheduled, event-driven)
  - Future Worker Opportunities (Phase 10+ roadmap)
  - Worker Monitoring & Observability
  - Worker Deployment Best Practices
  - Worker Scaling Decision Matrix
  - Worker Cost Optimization
- **Cross-References**:
  - ← `AGENTS.md` (Production & Render Notes)
  - ← `OPERATIONS.md` (service matrix)
  - ← `README.md` (architecture snapshot)
  - → `render.yaml` (service definitions)
  - → `docs/query-optimization-guide.md` (performance metrics)
- **Referenced By**:
  - `AGENTS.md` (Production section)
  - `OPERATIONS.md` (service matrix)
  - `ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md` (architecture reference)

---

### Deployment & Database

#### ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md — Deployment Guide
- **Purpose**: Comprehensive deployment readiness checklist
- **When to Read**: Before deploying to production
- **Key Sections**:
  - Pre-Deployment Validation (code quality, repository hygiene, documentation)
  - Infrastructure Configuration (Render services, database, environment variables)
  - Deployment Workflow (build commands, start commands, health checks)
  - Post-Deployment Verification (immediate checks, functional tests, performance)
  - Rollback Plan (immediate rollback, database rollback, service-specific)
  - Monitoring & Alerts (structured logging, alert thresholds, Render dashboard)
  - Scaling Roadmap (Phase 10+: battle pool, encounter generator, cost optimization)
  - Success Criteria
- **Cross-References**:
  - → `docs/workers.md` (worker architecture)
  - → `OPERATIONS.md` (service matrix)
  - → `AGENTS.md` (validation requirements)
  - → `render.yaml` (service definitions)
  - → `docs/query-optimization-guide.md` (alert thresholds)
- **Referenced By**:
  - `AGENTS.md` (Core Control Documents)
  - `README.md` (deployment notes)

#### ops/DB_BOOTSTRAP.md — Database Bootstrap Runbook
- **Purpose**: Staging Postgres bootstrap covering migrate deploy vs. db push safety
- **When to Read**: Before running migrations, when setting up databases
- **Key Sections**:
  - CRITICAL section (migration safety, DEV vs PROD)
  - Migration workflow (DEV master, PROD local node)
  - Bootstrap steps
  - Rollback procedures
- **Cross-References**:
  - ← `AGENTS.md` (Core Control Documents, database access)
  - → `docs/database-url-selection.md` (URL selection logic)
  - → `scripts/bootstrap_staging_db.ps1` (automation script)
  - → `secrets/migrate.env` (migration environment file)
- **Referenced By**:
  - `AGENTS.md` (Local Database Access)
  - `README.md` (deployment notes)
  - `docs/database-url-selection.md` (migration workflow)

#### docs/database-url-selection.md — Database URL Selection Logic
- **Purpose**: Canonical database URL selection logic for 2-node cluster
- **Contract Status**: Absolute Requirement (see `Patch.md`)
- **When to Read**: BEFORE any database operation
- **Key Sections**:
  - The Architecture (DEV master, PROD local node)
  - Canonical URL Selection Logic (runtime queries, migrations)
  - Quick Reference table
  - Dual Database Connection Architecture (devPrisma, prisma, onPremiseDevPrisma)
  - Usage Patterns (when to use each client)
- **Cross-References**:
  - ← `Patch.md` (Absolute requirement)
  - ← `AGENTS.md` (Database URL Selection section)
  - → `ops/DB_BOOTSTRAP.md` (migration workflow)
  - → `src/shared/prisma.ts` (implementation)
  - → `docs/database-configuration.md` (comprehensive dual-client architecture)
- **Referenced By**:
  - `Patch.md` (Absolutes)
  - `AGENTS.md` (Database URL Selection)
  - `ops/DB_BOOTSTRAP.md` (bootstrap workflow)

---

### Routing & Navigation

#### masterroutetable.md — Router Index (Human-Readable)
- **Purpose**: Human-readable router index listing all ROUTER.md manifests
- **When to Read**: When navigating codebase, looking for domain routers
- **Key Sections**:
  - Meta-Router (ops/ROUTER.yaml)
  - Domain Routers (src/, scripts/, tests/, docs/, etc.)
  - Archived routers
- **Cross-References**:
  - → `ops/ROUTER.yaml` (machine-readable router-of-routers)
  - → `ops/ROUTER_INDEX.yaml` (canonical routing metadata)
  - → All `ROUTER.md` manifests across codebase
- **Referenced By**:
  - `AGENTS.md` (Orientation Flow, Router Navigation)
  - `README.md` (Router & Meta Index)
  - `Patch.md` (Absolutes - never rename/delete)

#### ops/ROUTER.yaml — Router-of-Routers
- **Purpose**: Machine-readable router metadata (canonical source)
- **When to Read**: When automation needs routing metadata
- **Key Sections**:
  - Router entries (domain, paths, sub_routers, docs_refs)
  - Metadata (version, last_updated)
- **Cross-References**:
  - ← `masterroutetable.md` (human-readable mirror)
  - → `ops/ROUTER_INDEX.yaml` (generated index)
  - → All `ROUTER.md` manifests
- **Referenced By**:
  - `AGENTS.md` (Orientation Flow, Router Navigation)
  - `Patch.md` (Absolutes - never rename/delete)
  - `scripts/update_router_index.sh` (automation)

#### ops/TOUCHMAP.yaml — File Ownership Map
- **Purpose**: Maps Tasklist IDs to paths they're allowed to modify
- **When to Read**: When scoping edits, validating file changes
- **Key Fields**:
  - Task ID → allowed paths
  - Escalation paths for conflicts
- **Cross-References**:
  - ← `Patch.md` (Operating Loop, scope enforcement)
  - ← `Tasklist.md` (task IDs)
  - → File paths across repository
- **Referenced By**:
  - `Patch.md` (Operating Loop)
  - `AGENTS.md` (Orientation Flow)

---

### Additional Meta Documents

#### ops/REPO-OPTIMIZATION-REPORT.md — Phase 9 Report
- **Purpose**: Comprehensive Phase 9 optimization achievements
- **When to Read**: For Phase 9 context, optimization metrics
- **Cross-References**:
  - ← `Prompt.md` (references achievements)
  - ← `AGENTS.md` (Mission: Phase 9 Complete)

#### ops/HOTFIX_PLAN.yaml — Hotfix Queue
- **Purpose**: Emergency hotfix queue and bootstrap template
- **When to Read**: During hotfix workflows
- **Cross-References**:
  - ← `Patch.md` (Hotfix Loop)
  - → `ops/RECOVERY.yaml` (recovery coordination)

#### ops/RECOVERY.yaml — Recovery Metadata
- **Purpose**: Recovery coordination, last emergency edit tracking
- **When to Read**: After incidents, when resuming after hotfix
- **Cross-References**:
  - ← `Patch.md` (Hotfix Loop)
  - → `ops/HOTFIX_PLAN.yaml` (hotfix queue)

#### Patch-Template.md — PATCHSET Template
- **Purpose**: Legacy layout bridge for PATCHSET formatting
- **When to Read**: When emitting PATCHSET blocks
- **Cross-References**:
  - ← `Patch.md` (Legacy Layout Bridge)
  - → `Prompt.md` (PATCHSET echo)

#### RULESET.md — Game Mechanics Versioning
- **Purpose**: Game rules and mechanics versioning
- **When to Read**: For gameplay mechanics, battle system rules
- **Key Sections**:
  - Scope (MVP)
  - Versioning
  - Status & Turn Order
  - Early Battle Item Pool

---

## Cross-Reference Patterns

### Standardized Reference Formats

**For Section References:**
- ✅ Correct: "See `AGENTS.md` (Database URL Selection)"
- ✅ Correct: "See AGENTS.md Database URL Selection section"
- ❌ Incorrect: "See AGENTS.md database stuff"
- ❌ Incorrect: "Check the agents doc"

**For File References:**
- ✅ Correct: "See `docs/workers.md` for comprehensive worker architecture"
- ✅ Correct: "Reference: `ops/DB_BOOTSTRAP.md` (migration workflow)"
- ❌ Incorrect: "See workers doc"
- ❌ Incorrect: "Check docs folder"

**For Multi-Document References:**
- ✅ Correct: "See `Patch.md` + `Tasklist.md` + `ops/NEXT.yaml` for workflow"
- ✅ Correct: "References: AGENTS.md (architecture), OPERATIONS.md (deployment)"
- ❌ Incorrect: "See meta docs for info"

### Cross-Reference Network

```
Patch.md (Contract)
  ├→ Prompt.md (echo template, updates)
  ├→ Tasklist.md (READY queue)
  ├→ ops/NEXT.yaml (pointer discipline)
  ├→ ops/TOUCHMAP.yaml (scope enforcement)
  └→ docs/database-url-selection.md (Absolute)

AGENTS.md (Operations Guide)
  ├→ Patch.md (contract rules)
  ├→ Prompt.md (recent changes)
  ├→ Tasklist.md (backlog)
  ├→ README.md (getting started)
  ├→ OPERATIONS.md (service matrix)
  ├→ docs/workers.md (architecture)
  ├→ docs/database-url-selection.md (database logic)
  ├→ ops/DB_BOOTSTRAP.md (migrations)
  ├→ ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md (deployment)
  └→ masterroutetable.md + ops/ROUTER.yaml (routing)

README.md (Getting Started)
  ├→ AGENTS.md (operations guide)
  ├→ OPERATIONS.md (deployment)
  ├→ docs/workers.md (architecture)
  ├→ docs/PBSL.md (game mechanics)
  ├→ ops/DB_BOOTSTRAP.md (database)
  └→ Patch.md + Tasklist.md + Prompt.md (contract)

OPERATIONS.md (Service Matrix)
  ├→ docs/workers.md (architecture)
  ├→ docs/database-systems.md (schema)
  ├→ AGENTS.md (routing)
  └→ render.yaml (service definitions)

docs/workers.md (Worker Architecture)
  ├→ OPERATIONS.md (service matrix)
  ├→ AGENTS.md (references from)
  ├→ README.md (architecture snapshot)
  └→ render.yaml (service definitions)

ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md (Deployment)
  ├→ docs/workers.md (architecture)
  ├→ OPERATIONS.md (service matrix)
  ├→ AGENTS.md (validation)
  └→ docs/query-optimization-guide.md (thresholds)
```

---

## Document Hierarchy

### Tier 1: Essential Contract Documents (Read First)
- `Patch.md` — Operating contract
- `Prompt.md` — Current context
- `Tasklist.md` — Work queue
- `ops/NEXT.yaml` — Task pointer

### Tier 2: Architecture & Operations (Read for Context)
- `AGENTS.md` — Comprehensive operations guide
- `README.md` — Getting started guide
- `OPERATIONS.md` — Service deployment
- `docs/workers.md` — Worker architecture

### Tier 3: Specialized Guides (Read as Needed)
- `ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md` — Deployment procedures
- `ops/DB_BOOTSTRAP.md` — Database migrations
- `docs/database-url-selection.md` — Database URL logic
- `masterroutetable.md` — Router navigation

### Tier 4: Supporting Documents (Reference)
- `ops/TOUCHMAP.yaml` — File ownership
- `ops/ROUTER.yaml` — Routing metadata
- `Patch-Template.md` — PATCHSET format
- `RULESET.md` — Game mechanics
- `ops/HOTFIX_PLAN.yaml` — Emergency workflows
- `ops/RECOVERY.yaml` — Recovery coordination

---

## When to Consult Each Document

| Scenario | Primary Document | Supporting Documents |
|----------|-----------------|---------------------|
| Starting a new task | `Patch.md`, `Prompt.md`, `Tasklist.md` | `ops/NEXT.yaml`, `ops/TOUCHMAP.yaml` |
| Understanding architecture | `AGENTS.md` | `README.md`, `docs/workers.md`, `OPERATIONS.md` |
| Setting up development | `README.md` | `AGENTS.md` (Local Database Access), `docs/ai-env-setup.md` |
| Database operations | `docs/database-url-selection.md` | `ops/DB_BOOTSTRAP.md`, `AGENTS.md` (Database section) |
| Deploying to production | `ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md` | `OPERATIONS.md`, `docs/workers.md`, `render.yaml` |
| Navigating codebase | `masterroutetable.md`, `ops/ROUTER.yaml` | Domain-specific `ROUTER.md` manifests |
| Emergency hotfix | `Patch.md` (Hotfix Loop) | `ops/HOTFIX_PLAN.yaml`, `ops/RECOVERY.yaml` |
| Worker configuration | `docs/workers.md` | `OPERATIONS.md`, `render.yaml` |
| Monitoring & alerts | `OPERATIONS.md` (Observability) | `docs/query-optimization-guide.md` |
| Scaling decisions | `docs/workers.md` (Scaling Roadmap) | `ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md` |

---

## Validation Checklist

### Cross-Reference Integrity
- [ ] All file paths use relative paths from repository root
- [ ] Section references include document name + section title
- [ ] Multi-document references use standardized format
- [ ] No broken links (all referenced files exist)
- [ ] No circular references that could cause confusion
- [ ] Forward and reverse references are symmetric

### Documentation Coverage
- [ ] Every meta document listed in this index
- [ ] Every cross-reference documented
- [ ] Every document's purpose clearly stated
- [ ] Every document's "when to read" guidance provided
- [ ] Tier hierarchy makes sense for navigation

### Standardization
- [ ] Reference format consistent across all documents
- [ ] Cross-reference network matches actual document state
- [ ] Document hierarchy reflects actual usage patterns
- [ ] Scenario matrix covers common use cases

---

## Maintenance Notes

**Update Triggers:**
- New meta document created → Add to index
- Document renamed/moved → Update all cross-references
- New cross-reference added → Update network diagram
- Document purpose changes → Update description
- New workflow added → Update scenario matrix

**Validation Commands:**
```bash
# Check for broken file references
grep -r "See \`[^/]*\.md\`" *.md ops/*.md | grep -v "META-DOC-INDEX"

# Check for section references
grep -r "See.*\.md.*section" *.md ops/*.md

# Verify all meta docs exist
ls -1 *.md ops/*.md | grep -E "(Patch|Prompt|Tasklist|AGENTS|README|OPERATIONS)"
```

---

**Status**: ✅ Complete  
**Coverage**: 100% of meta documentation  
**Cross-References**: Network validated  
**Last Validation**: 2025-11-07  
