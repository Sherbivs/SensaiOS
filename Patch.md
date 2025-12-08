# AI PROJECT MANAGER CONTRACT
Last Updated (UTC): 2025-12-02T18:45:00Z
Revision: 1.75

This repository uses **Patch.md** as the working agreement between humans and automation.
Read this file completely before beginning any task. Follow it literally. Before editing, confirm the READY queue, NEXT pointer, and meta docs (Patch/Prompt/Tasklist) are readable and synchronized.

**Cross-References**:
- See `Prompt.md` for current timestamp, recent changes, PATCHSET echo template
- See `Tasklist.md` for backlog (READY queue, dependencies, acceptance criteria)
- See `ops/NEXT.yaml` for task pointer discipline (must point to READY task)
- See `ops/TOUCHMAP.yaml` for file scope boundaries per task
- **📚 TASK 12 COMPREHENSIVE GUIDES (AUTHORITATIVE):**
  * `docs/operations-bible/worker-troubleshooting-comprehensive.md` (22 pages) → ALL worker failure scenarios, recovery procedures
  * `docs/operations-bible/database-operations-runbook-comprehensive.md` (25 pages) → Complete database ops, live game architecture, master-mirror-staging pipeline
  * `docs/operations-bible/ops-commands-reference-comprehensive.md` (28 pages) → ALL /ops commands documented
  * `docs/architecture-bible/complete-system-architecture.md` (30 pages) → Service topology, dependency graphs, data flows

**🔥 DOCUMENTATION MAINTENANCE:** When changing architecture/operations, UPDATE corresponding Bible sections in SAME commit. Documentation drift causes production failures.

**Referenced By**: AGENTS.md (Orientation Flow), Prompt.md (Contract Mode status), ops/PRODUCTION-DEPLOYMENT-CHECKLIST.md (validation requirements)

## Marker Switch

## Absolutes (apply in every mode)
- Never rename or delete canonical meta/routing files (`Patch.md`, `Tasklist.md`, `Prompt.md`, `ops/PATCH_POLICY_BACKUP.md`, `ops/ROUTER.yaml`, `ops/ROUTER_INDEX.yaml`, `masterroutetable.md`, and any `ROUTER.md`).
- Never delete or rename router manifests (`ROUTER.md`, `ROUTER.yaml`).
- Ensure `.gitignore` preserves meta documentation for AI navigation (ROUTER.md, README.md in all directories) while excluding sensitive files (secrets/*.env, Store/db/, tools/pgsql*/ binaries).
- **All database operations must use environment-aware URL selection** (see `docs/operations-bible/database-operations-runbook-comprehensive.md` § 2.1 Database URL Selection): All environments use `PROD_DATABASE_URL` (Render managed PostgreSQL); Migrations use `PROD_DATABASE_URL` or `RENDER_DB_EXTERNAL_URL` (direct PostgreSQL); Local development falls back to `DATABASE_ONPREMISE_DEV_PRIMARY` (workstation offline mode). Non-compliance causes production failures.
- **Database naming MUST use canonical terms:** CLOUD-PROD-MASTER (`PROD_DATABASE_URL`), ONPREMISE-DEV-PRIMARY (`DATABASE_ONPREMISE_DEV_PRIMARY`), ONPREMISE-DEV-EXPERIMENT (`DATABASE_ONPREMISE_DEV_EXPERIMENT`). **NEVER use as database identifiers:** "LOCAL", "PRIMARY LOCAL", "EXPERIMENTAL" (standalone), "DEV_DATABASE_URL" (deprecated env var). **Valid descriptive usage:** "local development", "local setup", "local testing" (adjective describing workstation/offline contexts is ALLOWED). **Distinction:** Database identifiers (names, targets, env vars) require canonical terms; descriptive English (section names, process descriptions) may use "local" naturally. Prisma clients: `prisma`, `onPremiseDevPrisma`, `onPremiseExperimentPrisma`. CLI targets: `cloud-prod`, `onpremise-dev`, `onpremise-experiment`. See `docs/operations-bible/database-operations-runbook-comprehensive.md` § 2.2 (Database Terminology) for complete specification.
- **Standardized Terminology Schema (STRICTLY ENFORCED):** ALL code, documentation, comments, and logs MUST use standardized terminology defined in `Agents.md` § "STANDARDIZED TERMINOLOGY SCHEMA". Includes database terms, service/worker terms, channel architecture terms, game engine terms, and documentation terms. Schema updates require synchronization across Patch.md, Agents.md, copilot-instructions.md, and gpt.chatmode.md.
- **Meta-System Quality Discipline (Anti-Stuck Rules):**
  - Code changes MUST update routers when adding/moving/changing file purposes (failure accumulates technical debt)
  - Architectural knowledge MUST flow into Bible system (architecture-bible/, operations-bible/, development-bible/) not scattered .md files
  - Transient notes belong in Tasklist.md or Prompt.md, NOT as standalone documents in ops/ or root
  - Router manifests MUST stay synchronized: run `npm run docs:update-routers` after structural changes
  - TOUCHMAP.yaml MUST reflect actual file ownership (stale entries cause scope confusion)
1. Read `ops/NEXT.yaml` (respect Marker Switch guidance) to learn the queued task and `files_hint`.
2. Read `Tasklist.md` and execute **only** tasks marked `status: READY` with dependencies satisfied.
3. Read `ops/TOUCHMAP.yaml` to scope edits to the listed paths.
4. Keep every change reversible and minimal.

## Specialist Team Coordination (Team-Based AI Workflow)

**PURPOSE:** Every prompt automatically assembles a team of specialized AI agents, each with domain expertise, ensuring comprehensive problem-solving from multiple perspectives.

**TEAM STRUCTURE:**
- **Dynamic Lead Assignment:** The lead specialist is assigned based on the PRIMARY work type (see detection rules below). The lead orchestrates team coordination, ensures quality gates pass, and provides final approval.
- **Core Specialists (Always Active):**
  * AI Coding Specialist — Code implementation, technical coordination, quality assurance
  * Documentation Specialist — Documentation structure, naming conventions, Bible accuracy
  * Architecture Specialist — Architectural changes, integration impacts, technical validation
- **Domain Specialists (Invoked as Needed):**
  * Database Specialist — Database operations, migrations, performance (triggered by `prisma/`, schema changes, SQL files)
  * Testing Specialist — Test coverage, quality assurance, validation (triggered by `tests/`, `.test.ts`, `.spec.ts`)
  * Security Specialist — Security review, vulnerability detection, best practices (triggered by "auth", "permission", "security")
  * Performance Specialist — Performance optimization, resource management (triggered by "optimize", "performance", "cache")
  * DevOps Specialist — Deployment, infrastructure, CI/CD (triggered by `render.yaml`, `Dockerfile`, `.github/workflows/`)

**AUTOMATIC DETECTION RULES (Including Dynamic Lead Assignment):**
| Work Type | Lead Specialist | Supporting Specialists | Trigger Patterns |
|-----------|-----------------|------------------------|------------------|
| Documentation | Documentation | Architecture, AI Coding | `docs/`, `README.md`, `.md` files, "document", "organize" |
| Database | Database | Architecture, AI Coding | `prisma/`, `schema.prisma`, "migration", "database", SQL files |
| Testing | Testing | AI Coding, Architecture | `tests/`, `.test.ts`, `.spec.ts`, "test", "coverage" |
| Security | Security | Architecture, AI Coding | "auth", "permission", "security", "credential", "secret" |
| Performance | Performance | Architecture, AI Coding | "optimize", "performance", "cache", "memory", "speed" |
| Deployment | DevOps | Architecture, AI Coding | `render.yaml`, `Dockerfile`, "deploy", "CI/CD", `.github/workflows/` |
| Architecture | Architecture | AI Coding, Documentation | "design", "architecture", "system", "integration", "API" |
| Cleanup | Documentation | AI Coding, Architecture | "cleanup", "organize", "refactor", "consolidate" |
| Code Implementation | AI Coding | Architecture, Testing | General coding, bug fixes, feature implementation |

**5-PHASE WORKFLOW PROTOCOL:**
1. **Analysis (AI Coding Specialist):** Receive prompt → Analyze work type → Identify required specialists → Assemble team → Brief objectives
2. **Planning (Team Collaboration):** Each specialist reviews from domain perspective → Identify concerns → Propose solutions → Coordinate approach → Document plan with team consensus
3. **Execution (Coordinated Implementation):** AI Coding implements changes → Specialists monitor for domain concerns → Real-time feedback → Adjustments as needed
4. **Verification (Multi-Perspective QA):** Each specialist validates deliverable from domain → Documentation Specialist checks docs/naming → Architecture Specialist validates design → Testing Specialist checks coverage → Security/Performance as needed
5. **Handoff (Knowledge Transfer):** Team consolidates lessons learned → Update Bible (Architecture/Operations/Development) → Capture patterns for future → Document in PATCHSET echo with specialist signoffs

**QUALITY GATES (Required for Task Completion):**
- ✅ Documentation Specialist signoff on all `.md` files, naming conventions, cross-references
- ✅ Architecture Specialist signoff on system design changes, integration points, API modifications
- ✅ Database Specialist signoff on schema changes, migrations, data integrity
- ✅ Testing Specialist signoff on test coverage, acceptance criteria validation
- ✅ Security Specialist signoff on auth/permission changes, credential handling
- ✅ Performance Specialist signoff on optimization claims, resource usage
- ✅ DevOps Specialist signoff on deployment changes, infrastructure updates
- ✅ Lead Specialist final approval after all domain signoffs (lead is dynamically assigned based on work type)

**TASK METADATA (ops/NEXT.yaml Enhancement):**
```yaml
main_tasks:
  - id: T15.1
    title: "Task title"
    lead_specialist: documentation  # Dynamically assigned based on work type
    specialists_required:
      - documentation (lead)
      - architecture
      - ai_coding
    specialist_signoffs:
      documentation: pending|approved|concerns
      architecture: pending|approved|concerns
      ai_coding: pending|approved|concerns
```

**PATCHSET ECHO ENHANCEMENT (Add to Prompt.md):**
- **Specialists Involved:** [List with roles, lead marked: "Documentation (Lead), Architecture, AI Coding"]
- **Coordination Notes:** [Key decisions from team discussion, concerns raised, solutions agreed]
- **Quality Gates Passed:** [Specialist signoffs: "Documentation ✅, Architecture ✅, AI Coding ✅"]

**COORDINATION PATTERNS:**
- **Sequential Review:** Independent domains (docs → architecture → testing) — Each specialist reviews in sequence, adds findings, passes to next
- **Parallel Review:** Independent concerns (security + performance) — Specialists review simultaneously, consolidate findings
- **Collaborative Resolution:** Conflicting requirements (performance vs maintainability) — Team discussion, trade-off analysis, consensus decision
- **Lead-Verify:** Rapid iteration (Lead implements → Specialist verifies) — Quick feedback loop, domain expertise on demand

**LEAD ASSIGNMENT LOGIC:**
1. Analyze the PRIMARY work type from prompt/task description
2. Match against detection rules table above
3. Assign lead specialist for that work type
4. Remaining specialists become supporting team
5. If work type is ambiguous or mixed, use Architecture as lead (most cross-cutting concerns)

**See:** `docs/projects/development/AI-SPECIALIST-TEAM-SYSTEM.md` for comprehensive team structure, detection rules, workflow protocols, and implementation plan.

## Preflight
- **Assemble Specialist Team:** Analyze prompt for work type → Apply detection rules → Identify required specialists → Brief team on objectives (see Specialist Team Coordination above)
- If Tasklist.md has no READY tasks (ignoring `META.UNBLOCK.READY_SEED`), promote the oldest eligible PROPOSED whose dependencies are DONE. If none exist, add `META.UNBLOCK.READY_SEED` as READY.
- Ensure `ops/NEXT.yaml:main_tasks` contains up to 3 active READY tasks with `specialists_required` and `specialist_signoffs` fields populated. Quick_task slot is available for hot work.
- Verify `files_hint` for each task only lists files you expect to touch.
- Confirm `Patch.md`, `Prompt.md`, and `Tasklist.md` are readable. If any are missing or corrupt, stop and request refreshed copies.
- Clear or overwrite any prior clipboard or NEXT context when beginning a new task; every run starts with a fresh plan so stale patchsets or pointers cannot stall progress.

## Operating Loop (Contract Mode with Specialist Coordination)
1. **Team Analysis & Planning (Multi-Perspective Design)**
   - **Analyze Work Type:** Examine prompt → Identify PRIMARY work type using detection rules → Assign lead specialist dynamically
   - **Team Assembly:** Lead specialist coordinates, supporting specialists assembled based on work type
   - **Team Planning:** Each specialist reviews from domain perspective → Identify concerns/risks → Propose solutions → Coordinate approach → Document plan with team consensus
   - Select up to 3 main tasks from READY queue (respect dependency order) for parallel work. Honor `ops/TOUCHMAP.yaml`.
   - Quick/hot tasks (bug fixes, docs, hotfixes < 30min) can be added as a 4th concurrent task.
2. **Coordinated Execution (Monitored Implementation)**
   - **Lead Specialist:** Drives implementation, coordinates team, uses PATCHSET from the clipboard (see "Legacy Layout Bridge")
   - **Supporting Specialists:** Monitor for domain concerns → Real-time feedback → Adjustments as needed
   - Run targeted tests whenever tooling is available; if not, state why in the echo and commit message.
3. **Multi-Perspective Verification (Quality Gates)**
   - **Each specialist validates deliverable from domain:**
     * Documentation Specialist: Checks `.md` files, naming conventions, cross-references, Bible accuracy
     * Architecture Specialist: Validates system design, integration points, technical approach consistency
     * Database Specialist: Reviews schema changes, migration safety, data integrity
     * Testing Specialist: Checks test coverage, acceptance criteria validation
     * Security Specialist: Reviews auth/permission changes, credential handling
     * Performance Specialist: Validates optimization claims, resource usage
     * DevOps Specialist: Reviews deployment changes, infrastructure updates
   - **Lead Specialist:** Final approval after all domain signoffs
   - Record specialist signoffs in `ops/NEXT.yaml` task metadata: `specialist_signoffs.{specialist}: approved|concerns`
4. **Update State (With Specialist Tracking)**
   - Mark completed tasks `DONE` in `Tasklist.md` with concise outcome notes including specialist signoffs
   - Update `ops/NEXT.yaml` main_tasks queue (add/remove/reorder) with `specialists_required` and `specialist_signoffs` fields
   - Extend `ops/TOUCHMAP.yaml` if you touched new paths
   - Refresh `Prompt.md` (Timestamp, Revision, "Last Repo Changes", PATCHSET Echo with specialist involvement)
5. **Meta-System Maintenance (Mandatory Quality Gates with Specialist Oversight)**
   - **Router Sync (Documentation Specialist review required):** If code changes touched new directories or modified file purposes → Update parent/child `ROUTER.md` + run `npm run docs:update-routers`
   - **Bible Integration (Architecture/Documentation Specialist review required):** If architectural decisions, operational procedures, or development patterns established → Document in appropriate Bible section (architecture-bible/, operations-bible/, development-bible/)
   - **Tasklist Cleanup:** If task completed with outcome notes → Consider archiving if >20 DONE tasks accumulate
   - **Prompt Compression:** If Prompt.md grows >500 lines → Archive historical logs, keep only recent 10 commits + current PATCHSET
   - **TOUCHMAP Accuracy:** If files edited outside existing entries → Extend `ops/TOUCHMAP.yaml` with new paths and ownership
   - Skipping meta-maintenance triggers Postflight anti-stuck enforcement (forces META.* tasks into queue)
6. **Knowledge Transfer (Team Handoff)**
   - Team consolidates lessons learned → Update Bible sections with patterns discovered
   - Capture coordination insights for future work → Document in PATCHSET echo
   - Record specialist signoffs and key decisions for audit trail

## Postflight (With Specialist Signoff Verification)
- **Verify Quality Gates:** Ensure all required specialists have signed off (approved or concerns documented). AI Coding Specialist cannot exit until domain specialists complete reviews.
- Refuse to exit if Tasklist.md lists no READY tasks besides the seed; auto-promote as needed.
- Refuse to exit if `ops/NEXT.yaml:main_tasks` is empty and `quick_task` is null; populate at least one task before finishing.
- Record the final active tasks (main + quick), contract state (Contracts ON/OFF), specialists involved, and quality gates passed inside the PATCHSET Echo.
- **Meta-System Health Check (Anti-Stuck Enforcement):**
  - If 5+ consecutive runs modified code WITHOUT updating routers → FORCE `META.ROUTER.SYNC` task into quick_task slot (Documentation Specialist escalation)
  - If Bible system not updated in 10+ code changes → FORCE `META.BIBLE.CONSOLIDATE` task into quick_task slot (Architecture/Documentation Specialist escalation)
  - If Tasklist.md has 20+ DONE tasks → FORCE `META.TASKLIST.ARCHIVE` task into quick_task slot
  - If Prompt.md >500 lines → FORCE `META.PROMPT.COMPRESS` task into quick_task slot
  - These checks prevent technical debt accumulation and ensure high-quality meta-system maintenance

## Prompt Echo Template (Enhanced with Specialist Tracking)
- Keep the PATCHSET Echo between the markers in `Prompt.md`.
- Include: HEAD (or `pending-local`), a concise summary sentence, `TasklistDiff true|false`, test results, `Contracts: ON|OFF (reason)`, and the READY pointer rationale.
- **NEW - Specialist Coordination Fields:**
  * **Specialists Involved:** [List with roles: "AI Coding (Lead), Documentation, Architecture"]
  * **Coordination Notes:** [Key decisions from team discussion, concerns raised, solutions agreed upon]
  * **Quality Gates Passed:** [Specialist signoffs: "Documentation ✅, Architecture ✅, AI Coding ✅" or "Documentation ⚠️ (concerns noted)"]
- Use plain sentences only (no code fences, tables, or embedded objects).

## Legacy Layout Bridge
- Follow the section order used by `Patch-Template.md`: header, FILE entries, TASKLIST UPDATE, Commit Message.
- Describe file edits with inline `-`/`+` markers or prose; do not embed fenced code or attach file objects.
- Keep the clipboard and emitted PATCHSET synchronized.

## Patchset Format (final reply)
- Emit exactly one PATCHSET block and one Commit Message block per run.
- New files must appear in full inside the PATCHSET description (plain text).
- Modified files must be summarized with inline context (no fenced diffs) and kept deterministic.
- Avoid binary/large assets unless explicitly required.

## Tasklist Discipline
- Update headers (`Last Updated`, `Revision`) whenever Tasklist.md changes.
- Add acceptance criteria for new tasks; include outcome notes when marking DONE.
- Never delete tasks with active dependencies. Archive long DONE history via `npm run tasks:archive` if needed.

## Prompt.md Requirements
- Bump Timestamp and Revision on every change.
- “Last Repo Changes” must summarize the effective modifications in plain text bullets.
- Maintain a populated PATCHSET Echo between the markers following the template above.
- Preserve the section titled **“AI Worker Prompt (copy/paste for Copilot/GPT)”** exactly.

## Tests & Evidence
- Run available tests relevant to the touched code. Capture command outputs for the final report.
- If tests cannot run (tooling unavailable, dependency missing), explain the limitation in both the PATCHSET Echo and Commit Message.

## Commit Message Guidelines
- Use the format `[Task <ID>] Concise summary` when closing a Tasklist item.
- Include a short “Why / Changes / Testing” body when additional context helps reviewers.
- Even for meta-only changes, state why the work matters.

## Hotfix Loop (no PATCHSET)
- Trigger with `ACTIVATE: HOTFIX ENGINE`, optionally appending `: <short note>` for human routing; the prefix before the second colon must match exactly.
- Hotfix ignores the marker switch unless the human also omits the marker; overrides stack only when explicitly invoked.
- Hotfixes can use the `quick_task` slot in `ops/NEXT.yaml` or run independently.
- Restrict edits to `ops/HOTFIX_PLAN.yaml`, `ops/NEXT.yaml`, `Tasklist.md`, and files listed in the hotfix request.
- Restore `ops/NEXT.yaml` main_tasks queue before exiting; leave a note documenting the state.

## CLEAR TASKS Trigger (cleanup mode)
- Trigger with the exact phrase `CLEAR TASKS` when humans want all pending patch plans reconciled.
- Upon trigger, process every `<<<PATCHSET START>>>` and `<<<PROPOSED PATCHSET START>>>` block:
   1. Execute or supersede the planned changes so that corresponding Tasklist items transition to `DONE` with outcome notes.
   2. Remove the processed patchset block(s) from Patch.md once Tasklist and Prompt.md reflect the completion.
   3. Sweep for orphaned tasks or clipboard entries; if a task has no remaining work, mark it `DONE` and clear its patchset plan.
- After cleanup, ensure `Tasklist.md` retains at least one READY task, `ops/NEXT.yaml` points at it, and Prompt.md records the reconciliation.
- If no outstanding patchsets exist, respond with a confirmation and leave the clipboard empty except for the idle marker.

Stay disciplined. The repository must always exit a run with a READY pointer, a clean PATCHSET echo, and accurate history.

## Patch Clipboard
# - Paste the exact patchset (matching `Patch-Template.md`) below this heading before you begin editing so humans can audit the plan.
# - After the run, clear or archive the clipboard if humans do not need the scratchpad.
# - Marker detection reads this section; keep this intact when Contract Mode is required.
# - When Tasklist.md contains one or more `PROPOSED` tasks, keep a `<<<PROPOSED PATCHSET START>>>` block that outlines the ready-to-run plan for those tasks; remove the block when no PROPOSED work remains.
# 
# _Patch Clipboard Scratch Area (leave empty when not in use)_
# 
<<<PATCHSET START>>>
TASK: HOTFIX.HOMESTEAD_BOOTSTRAP_TIMING
LEAD: Architecture Specialist
TEAM: Architecture (lead), Database, AI Coding
STATUS: Investigation phase - diagnostic logging implemented

OBJECTIVE:
Investigate why homestead channel bootstrap fails silently on startup despite correct code logic.
Add comprehensive diagnostic logging to identify race condition between bootDiscord() ClientReady event 
and initPrisma() database initialization completion.

HYPOTHESIS:
Race condition exists where bootDiscord() triggers ClientReady event → bootstrap runs BEFORE 
initPrisma() completes → Prisma queries fail silently with uninitialized connection pool.

FILES MODIFIED:

FILE: src/services/homestead-manager.ts
LOCATION: Line 754 (bootstrapAllHomesteads function entry)
CHANGE: Added synchronous diagnostic logging BEFORE any await
PURPOSE: Verify function is called and measure timing relative to database initialization
CODE:
- export async function bootstrapAllHomesteads(client: Client): Promise<BootstrapResult[]> {
-   const results: BootstrapResult[] = [];
+ export async function bootstrapAllHomesteads(client: Client): Promise<BootstrapResult[]> {
+   // DIAGNOSTIC: Immediate log BEFORE any await to verify function is called and timing
+   const bootstrapStartTime = Date.now();
+   const timestamp = new Date().toISOString();
+   
+   // Use error level to ensure visibility in all log configurations
+   log.error('[DIAGNOSTIC] bootstrapAllHomesteads ENTRY', {
+     timestamp,
+     epochMs: bootstrapStartTime,
+     note: 'Synchronous entry point - if you see this, function was called',
+   });
+   
+   const results: BootstrapResult[] = [];

FILE: src/bot/index.ts
LOCATION: Line 125 (ClientReady event handler)
CHANGE: Added ClientReady event fire time tracking
PURPOSE: Measure when Discord client becomes ready and bootstrap is triggered
CODE:
  client.once(Events.ClientReady, () => {
+   // DIAGNOSTIC: Track when ClientReady fires
+   const clientReadyTime = Date.now();
+   log.error('[DIAGNOSTIC] ClientReady event fired', {
+     timestamp: new Date().toISOString(),
+     epochMs: clientReadyTime,
+     user: client.user?.tag,
+     note: 'This fires during client.login(), check timing vs initPrisma()',
+   });
+   
    log.info("Discord bot is ready", {

FILE: src/bot/index.ts
LOCATION: Line 335 (bootDiscord completion point)
CHANGE: Added bootDiscord() completion time tracking
PURPOSE: Measure when bootDiscord() returns to index.ts Promise.all
CODE:
  await Promise.all([client.login(token), readyPromise]);
  
+ // DIAGNOSTIC: Track when bootDiscord() completes (after login + ClientReady)
+ const bootDiscordCompleteTime = Date.now();
+ log.error('[DIAGNOSTIC] bootDiscord() completing', {
+   timestamp: new Date().toISOString(),
+   epochMs: bootDiscordCompleteTime,
+   note: 'Function returns after login + ClientReady, but bootstrap runs async',
+ });

FILE: src/index.ts
LOCATION: Line 1338 (initPrisma call site)
CHANGE: Added initPrisma() start/complete timing
PURPOSE: Measure database initialization duration and confirm when queries can safely execute
CODE:
  try {
+   // DIAGNOSTIC: Track Prisma initialization timing
+   const initPrismaStart = Date.now();
+   log.error('[DIAGNOSTIC] initPrisma() starting', {
+     timestamp: new Date().toISOString(),
+     epochMs: initPrismaStart,
+     note: 'Database initialization begins - MUST complete before bootstrap queries',
+   });
+   
    await initPrisma();
+   
+   // DIAGNOSTIC: Track when Prisma is ready
+   const initPrismaComplete = Date.now();
+   log.error('[DIAGNOSTIC] initPrisma() complete', {
+     timestamp: new Date().toISOString(),
+     epochMs: initPrismaComplete,
+     durationMs: initPrismaComplete - initPrismaStart,
+     note: 'Database ready - safe to run queries now',
+   });

FILE: src/index.ts
LOCATION: Line 1618 (parallel initialization complete)
CHANGE: Added parallel initialization completion tracking
PURPOSE: Measure when all components ready and verify if bootstrap already ran
CODE:
  await Promise.all([
    engineInit(),
    ENABLE_SECURITY_BOT ? bootSecurityBot() : Promise.resolve(null),
    bootDiscord()
  ]);
  
+ // DIAGNOSTIC: Track when parallel initialization completes
+ const parallelInitComplete = Date.now();
+ log.error('[DIAGNOSTIC] Parallel initialization complete', {
+   timestamp: new Date().toISOString(),
+   epochMs: parallelInitComplete,
+   note: 'ALL components ready - but ClientReady/bootstrap may have run already',
+ });

FILE: ops/NEXT.yaml
CHANGE: Created quick_task investigation entry
PURPOSE: Document investigation in task queue
CODE:
- quick_task: null
+ quick_task:
+   task_id: HOTFIX.HOMESTEAD_BOOTSTRAP_TIMING
+   title: "Investigate homestead bootstrap race condition"
+   reason: "Bootstrap fails silently on startup - investigating race between bootDiscord() ClientReady and initPrisma()"
+   started_utc: 2025-12-08T00:00:00Z
+   lead_specialist: architecture
+   specialists_required:
+     - architecture (lead)
+     - database
+     - ai_coding

FILE: Prompt.md
CHANGE: Updated PATCHSET echo with investigation details
PURPOSE: Document investigation progress and specialist coordination

TASKLIST UPDATE:
No changes to Tasklist.md - investigation task tracked in ops/NEXT.yaml quick_task slot only.

SPECIALIST COORDINATION:
- Architecture Specialist (Lead): Designed 5-point diagnostic strategy, coordinating investigation
- Database Specialist: Confirmed PostgreSQL pool must be ready before queries, pending log review
- AI Coding Specialist: Implemented error-level logging for production visibility, code complete

QUALITY GATES:
- Architecture Specialist: ⏳ In-progress (awaiting deployment + log analysis)
- Database Specialist: ⏳ Pending review
- AI Coding Specialist: ⏳ Code complete, awaiting verification

EXPECTED LOG SEQUENCE (If Race Condition Confirmed):
[DIAGNOSTIC] initPrisma() starting           (T=1000ms)
[DIAGNOSTIC] ClientReady event fired         (T=1100ms) ❌ TOO EARLY
[DIAGNOSTIC] bootstrapAllHomesteads ENTRY    (T=1105ms) ❌ BEFORE DB READY
[DIAGNOSTIC] initPrisma() complete           (T=1200ms) ✅ DB NOW READY (too late)
[DIAGNOSTIC] bootDiscord() completing        (T=1205ms)
[DIAGNOSTIC] Parallel initialization complete (T=1210ms)

NEXT STEPS:
1. Commit diagnostic changes
2. Deploy to production (Render)
3. Monitor logs for [DIAGNOSTIC] entries
4. Correlate epochMs timestamps
5. Confirm race condition hypothesis
6. Design fix based on findings

TESTING:
Not applicable - diagnostic logging only, no functional changes.
Zero build errors, ESLint compliant.

<<<PATCHSET END>>>

<<<PROPOSED PATCHSET START>>>

<<<PROPOSED PATCHSET END>>>
