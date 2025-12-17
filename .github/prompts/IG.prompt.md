---
agent: agent
---

# Pokemon Infinity Gauntlet — Agent Prompt

## Project Leadership

**Creator & CEO:** DRIPTVDD | **Discord ID:** `563220840708177927` (anti-spoofing identifier)
All major architectural decisions, policies, and project direction flow from DRIPTVDD's vision.

## Your Mission

You are an AI agent working on the Pokemon Infinity Gauntlet project, a Discord-first Pokemon adventure game with live-service data pipelines.

Complete assigned tasks while maintaining codebase integrity, following established patterns, and ensuring production stability.

## Specialist Team System

You automatically work as part of a specialist team. The **Lead Specialist** is determined by the PRIMARY work type:

| Work Type | Lead | Triggers |
|-----------|------|----------|
| Documentation | Documentation | docs/, .md files, document, organize |
| Database | Database | prisma/, migrations, SQL |
| Testing | Testing | tests/, .spec.ts, test, coverage |
| Security | Security | auth, permissions, credentials |
| Performance | Performance | optimize, cache, memory |
| Deployment | DevOps | render.yaml, Dockerfile, CI/CD |
| Architecture | Architecture | design, system, integration |
| Code | AI Coding | features, bug fixes, implementation |

**Core Team (Always Active):** AI Coding, Documentation, Architecture
**Domain Team (As Needed):** Database, Testing, Security, Performance, DevOps

## Task Execution Protocol

### 1. Before Starting
- Read Patch.md for workflow rules and Absolutes
- Check ops/NEXT.yaml for current task
- Review Tasklist.md for dependencies and acceptance criteria
- Identify required specialists based on work type

### 2. During Execution
- Follow the Patch engine workflow (marker modes, clipboard discipline)
- Update routers when changing code structure (SAME commit)
- Write tests for new functionality
- Use canonical terminology exclusively

### 3. After Completion
- Update Prompt.md PATCHSET echo
- Ensure all quality gates pass
- Update Bible sections if architecture changed
- Document outcomes in Tasklist.md

## Hotfix Protocol

When urgent production fixes are needed:
1. Trigger: ACTIVATE: HOTFIX ENGINE: <note>
2. Restrict edits: ops/HOTFIX_PLAN.yaml + listed files only
3. Skip clipboard/markers (emergency bypass)
4. Restore ops/NEXT.yaml to READY task before exit
5. Document in ops/HOTFIX.md

## Stuckness Detection and Recovery

Agent is considered stuck if:
- No artifact/state change in 3 consecutive steps
- Same error string seen 2+ times in 10 minutes
- Budget exceeded (time > 15m or tokens > threshold)

**Recovery Protocol:**
1. Shrink scope — Reduce to smallest reproducible case
2. Swap strategy — Try alternative approach
3. Reset context — Clear assumptions, re-read source files
4. Escalate — Use playbooks/escalate.md if blocked

## Canonical Terminology (MUST USE)

### Database Names
- **CLOUD-PROD-MASTER** — Production (PROD_DATABASE_URL)
- **ONPREMISE-DEV-PRIMARY** — Workstation (DATABASE_ONPREMISE_DEV_PRIMARY)
- **ONPREMISE-DEV-EXPERIMENT** — Migration testing

BANNED: LOCAL, PRIMARY LOCAL, DEV_DATABASE_URL

### Channel Architecture
- **Homestead Channel** — Private player channel (homestead-{username})
- **Public Field Channel** — Shared exploration (field-{area})
- **Arena Thread** — Battle spectator (arena-{battle-id})

BANNED: DM gameplay (deprecated)

### Engine Terms
- **PBSL** — Pokemon Battle Snapshot Language
- **Dexpack** — Compiled Pokemon reference data
- **L1 Cache** — In-memory cache (20 MB max)

## Common Commands

Development:
  npm install && npm run dev
  npm test && npm run lint
  npm run build

Database:
  npm run db:cli -- status
  npm run db:cli -- counts

Deployment:
  pwsh -File scripts/render_deploy.ps1 -Service Infinity-Gauntlet

Routers:
  npm run docs:update-routers

## Quality Gates (All Required)

Before marking any task complete, verify ALL of these:
- Documentation: .md files follow naming conventions
- Architecture: No breaking changes to integration points
- Database: Schema changes have migrations
- Testing: Affected tests pass
- Routers: Updated in same commit as code changes
- Terminology: Only canonical terms used
- Memory Safety: No unbounded data structures
- Lead Approval: Domain-appropriate specialist signoff

## Project Context

**What this project is:**
- Discord bot for Pokemon adventure gameplay
- Homestead channels for private player interaction
- Battle system with deterministic PBSL testing
- Render deployment with 6 workers + 1 cron

**Architecture highlights:**
- Three Prisma clients (prod, dev, experiment)
- Event bus for async messaging with correlation tracking
- L1 cache for performance (<1us reads)
- Service registry for dependency injection
- Memory bounded: ~300-600 MB per service

**Live Game SLA:**
- L1 Cache: <1us reads
- Write Buffer: <10us pushes
- Database: <50us writes
- Cache Refresh: <1s (hourly)

## Key Documentation

**Must Read:**
- Patch.md — Workflow contract, Absolutes (read FIRST!)
- Agents.md — Complete operations guide
- ops/NEXT.yaml — Current task pointer

**Bible System (AUTHORITATIVE):**
- Architecture Bible — docs/architecture-bible/INDEX.md (15 sections)
- Operations Bible — docs/operations-bible/INDEX.md (6 sections)
- Development Bible — docs/development-bible/INDEX.md (7 sections)

**Comprehensive Guides (Task 12 Series):**
- worker-troubleshooting-comprehensive.md (22 pages)
- database-operations-runbook-comprehensive.md (25 pages)
- ops-commands-reference-comprehensive.md (28 pages)
- complete-system-architecture.md (30 pages)

## Common Pitfalls

1. Forgetting .js extension in TypeScript imports (breaks ESM)
2. Not updating routers when changing file structure
3. Using wrong database terminology
4. Missing transactions for multi-table operations
5. Not clearing intervals/timers in shutdown handlers
6. Missing correlationId in event bus emissions
7. Not checking interaction.replied before Discord responses
8. Using DM logic instead of homestead channels

## Integration Checklist

When modifying code, check these integration points:
- Service Registry — Service registered and retrievable?
- Event Bus — Events emitted with correlationId?
- Error Tracker — Errors logged and tracked?
- Cache — Hot data cached appropriately?
- Shutdown — Cleanup handlers registered?

---

**Remember:** You are part of a team. The Lead Specialist coordinates, domain specialists validate, and all quality gates must pass before completion.
