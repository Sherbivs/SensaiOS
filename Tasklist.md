# Tasklist
Last Updated (UTC): 2026-01-01T16:00:00Z
Revision: 2.128
<!-- # TASKLIST UPDATE -->

**Recent Activity (2026-01-01T16:00Z):**
- 📦 **Task Archive System Created** — Moved ~115 completed tasks (Phase 0-18) to `docs/archive/tasks/`. Archive organized by project/phase with ~500 line limit per file. Tasklist.md shortened from ~3,400 lines to ~1,200 lines. Archive index: [docs/archive/tasks/README.md](docs/archive/tasks/README.md). AI documentation updated (AGENTS.md, Prompt.md, copilot-instructions).

**Recent Activity (2026-01-01T15:30Z):**
- 🔍 **SensaiOS Roadmap Verification Complete** — Confirmed 16 tasks (not 18) across 4 phases. Distribution: Phase 1 (5 tasks), Phase 2 (4 tasks), Phase 3 (3 tasks), Phase 4 (4 tasks). All AI subagent checklists verified complete. Fixed count in headers and Prompt.md.

**Recent Activity (2026-01-01T15:00Z):**
- 📋 **SensaiOS Task Checklists Updated** — All 16 SensaiOS Ring Security tasks now have detailed AI subagent checklists with acceptance criteria from 06-os-security-model.md spec. Phase-level acceptance criteria added. Ready for AI subagent execution.

**Recent Activity (2026-01-01T14:20Z):**
- 📚 **SensaiOS Documentation Consolidation** — Created INDEX.md (~300 lines), updated ROUTER.md, verified 18-task plan against spec, deprecated outdated architecture/FINAL-ARCHITECTURE.md (v1.0 → use v1.1.2).

**Recent Activity (2026-01-01T13:25Z):**
- 🚀 **SensaiOS Ring Security Implementation Plan** — Created 18-task roadmap (4 phases, 8 weeks) with 5 Phase 1 tasks marked READY for immediate implementation.

**Recent Activity (2026-01-01T13:18Z):**
- 📘 **SensaiOS OS Security Model Spec** — Documented ring security architecture, capability system, installation API, and visibility enforcement for true OS-within-a-container model.

**Recent Activity (2025-12-28T12:46Z):**
- ✅ **Logger-First Import Policy** — Moved scopedLogger import to the top of onpremise experiment bootstrap and documented logger-first ordering.

**Recent Activity (2025-12-27T20:55Z):**
- ✅ **Scripts Envelope Migration Phase 2.4** — Evaluated remaining scripts, added audit logging to seed/register/build scripts, and documented skip list.

**Recent Activity (2025-12-27T18:23Z):**
- ✅ **Scripts Envelope Migration Phase 2.2** — Migrated security migration/rollback scripts to scopedLogger while preserving operator-facing console output; docs updated.

**Recent Activity (2025-12-27T18:06Z):**
- ✅ **Scripts Envelope Migration Phase 2.1** — Migrated quick-win scripts (build-data, build-assets-manifest, preflight, ensure-data, dev-prod-auto-sync) to scopedLogger and updated docs.

**Recent Activity (2025-12-27T17:25Z):**
- ✅ **Envelope Migration Fixup** — Restored dashboard/CLI/stdout output via process streams while preserving no-console policy and kernel dependency boundaries; build + envelope tests passing.

**Recent Activity (2025-12-27T17:12Z):**
- ✅ **Envelope Migration Complete** — Migrated remaining console output to the envelope logger, removed no-console disables, updated kernel/shared/utils/security/CLI outputs, build + envelope tests passing.

**Recent Activity (2025-12-27T03:35Z):**
- 📜 **NEW POLICY: /Store DB-Only Architecture** — All data in /Store must be in SQLite databases
  - Created `docs/architecture-bible/19-store-db-only-policy.md` (policy document)
  - Current violations: 83 files (163 MB heapsnapshots, 71 JSON, 3 logs)
  - Target: Only `.db` and `.db.bak` files allowed
  - 5 migration tasks created (STORE.HEAP_MIGRATION, STORE.SECURITY_STATE, etc.)

**Recent Activity (2025-12-27T00:05Z):**
- 🛠️ **DEX v2 Signature Export Fix** — Added missing `DEX_V2_SIGNATURE` export to generated accessors for dexpack v2 runtime boot.

**Recent Activity (2025-12-26T05:40Z):**
- ✅ **SPRINT 1 COMPLETE** — Kernel-First Logging Initiative foundation complete
  - KERNEL.LOGGING.PREBOOT_QUEUE: Pre-boot queue with MAX_PREBOOT_ENTRIES=1000, console fallback, automatic replay
  - KERNEL.LOGGING.TEST_UTILS: Created tests/kernel-test-utils.ts (~350 lines, 32 tests passing)
  - KERNEL.LOGGING.BOT_ENTRY: Migrated src/bot/index.ts to Kernel-first logging
  - TypeScript compiles cleanly, all kernel tests pass
  - Ready for Sprint 2: Output plugin architecture

**Recent Activity (2025-12-26T03:30Z):**
- 🧠 **EXPERT PANEL REVIEW COMPLETE** — 6 experts reviewed Kernel-First Logging Initiative
  - Added 8 new tasks from expert recommendations
  - Critical additions: PII scrubbing, correlation IDs, log sampling, GDPR deletion
  - Updated project doc with Expert Panel Findings section
  - 3 READY tasks now queued (PREBOOT_QUEUE, BOT_ENTRY, PREBOOT_LIMIT)
- 🚀 **KERNEL-FIRST LOGGING INITIATIVE LAUNCHED** — Major infrastructure project initiated
  - Created project document: `docs/projects/KERNEL-FIRST-LOGGING-INITIATIVE.md`
  - Completed initial audit: 221 console.log calls, 27 legacy logger imports, 624 catch blocks
  - Created audit report: `docs/audits/logging-audit-2025-12-26.md`
  - Kernel persistence layer complete (kernel-persistence.ts, Store/kernel-* directories)
  - Goal: Kernel logging/error systems first in every process, outputs to console + DB + external tools
- 📋 **Queue Status:** 3 READY tasks + 14 PROPOSED tasks

**Recent Activity (2025-12-14T00:00Z):**
- 🗑️ **ADMINISTRATIVE CLEANUP** — Archived stale tasks per admin directive (30+ days old)
  - DB.NORTHSTAR.ANALYTICS (READY → ARCHIVED, started 2025-11-13, 31 days stale)
  - DB.NORTHSTAR.SERVICES (IN_PROGRESS → ARCHIVED, started 2025-11-08, 36 days stale)
  - ARCHITECTURE.HOMESTEAD_CHANNELS.* (READY/PROPOSED → ARCHIVED, started 2025-11-21, 23 days stale)
  - META.STRESS_REMEDIATION.REVIEW (quick task → ARCHIVED, completed)
- ✅ **Schema Alignment Complete** — Prisma schema aligned with database (commit c8329208)
  - Added TimescaleDB models (LogEntry, BattleAnalytics, WorkerMetrics, SecurityEvent, etc.)
  - Fixed DiscordGuild/DiscordMember to match database columns
  - Updated bot imports to use homestead modules
  - TypeScript build passing (0 errors)

**Homestead Migration COMPLETE (2025-06-15):**
- ✅ **ARCHITECTURE.HOMESTEAD_CHANNELS — All 6 Phases Complete**
  - All DM-based gameplay migrated to private guild channels
  - 10 `createDM()` call sites replaced with `HomesteadChannelManager`
  - 4 DM modules migrated → `src/bot/homestead/`
  - `src/bot/dm/` directory **DELETED**
  - Documentation: `docs/architecture-bible/18-private-channel-architecture.md` (900+ lines)

**Recent Activity (2025-11-14T13:45Z):**
- ✅ **Render Production Investigation + Logger Startup Fix Complete** — 9-task plan completed (6-day ETA finished ahead of schedule)
  - Investigation: Render virtual service architecture documented (/opt/render/project/src/ structure, nested src/src/)
  - Root cause: Logger auto-starts on module load before Service Registry initializes, causing temporary "degraded" warnings
  - Fix: Delayed logger.startAutoRefresh() until after registry.initializeAll() + health check
  - Documentation: RENDER-PATH-MAPPING-2025-11-14.md (500+ lines), OPERATIONS.md Rev 1.6 (restart monitoring + disk procedures)
  - Code changes: src/utils/logger.js (removed auto-start), src/index.ts (explicit startAutoRefresh() call after services ready)
  - Build verified: ✅ npm run build (TypeScript 0 errors)
  - Ready for production deployment: Use Render: Deploy Main Bot task or render_deploy.ps1
- ✅ Ready for production validation (monitor 2-3 restarts for "healthy" status confirmation)

**Recent Activity (2025-11-13T00:00Z):**
- ✅ **Memory Leak Investigation Complete** — Comprehensive audit of 5 core memory systems
  - ErrorTracker: Stateless, PostgreSQL-backed (NO LEAK ✅)
  - LogBuffer: Bounded 200 entries, auto-flush 10s (NO LEAK ✅)
  - Prisma Clients: 3 singletons, proper disconnect (NO LEAK ✅)
  - Worker Intervals: 1 per worker, all cleared in shutdown (NO LEAK ✅)
  - Event Bus: shutdown() verified in gracefulShutdown() (VERIFIED FIXED ✅)
  - Documentation: docs/MEMORY-LEAK-INVESTIGATION-2025-11-13.md (463 lines)
  - All systems properly bounded with appropriate cleanup mechanisms
- ✅ Ready for DB.NORTHSTAR.ANALYTICS

**Recent Activity (2025-11-11T10:30Z):**
- ✅ **Resource Optimization Phase 2B Complete** — Alternative optimizations without native dependencies
  - L1 Cache LRU: 20 MB → 6 MB (-14 MB, 70% reduction via lazy loading + feature flag)
  - Cooldown Store: Unbounded → 1 hour TTL (-1 MB, prevents memory leaks)
  - Total Phase 2B savings: -15 MB (-13% reduction, 119 MB → 104 MB runtime)
  - better-sqlite3 migration DEFERRED: requires Python + Visual Studio Build Tools (native compilation blocker)
  - Dex API cache migration DEFERRED: synchronous API requirement, minimal footprint (~1-2 MB)
  - **Total Resource Optimization: -50 MB (-32% from 154 MB baseline to 104 MB)**
- ✅ Ready for DB.NORTHSTAR.ANALYTICS or Phase 3 miscellaneous cache optimizations

**Recent Activity (2025-11-11T09:00Z):**
- ✅ **Resource Optimization Phase 2A Complete** — Memory-to-disk migration via configuration changes
  - Runtime Cache: 16 MB → 5 MB (-11 MB, 69% reduction via facade.ts memory limits)
  - Write Buffer: 25 MB → 5 MB (-20 MB, 80% reduction via queue size + flush interval)
  - Logger Buffer: 5 MB → 1 MB (-4 MB, 80% reduction via buffer size limit)
  - Total immediate savings: -35 MB (-23% reduction, 154 MB → 119 MB runtime)
  - Phase 1 completed: Resource request validation gateway (9,346 insertions, 18 files)

**Recent Activity (2025-11-11T07:30Z):**
- ✅ **DB.NORTHSTAR.PHASE2 Complete** — TrainerProfile model removed from schema
  - Schema updates: Removed TrainerProfile model (15 lines), User.profile relation, Species.profileFavored relation
  - Database status: Migration 20251108183000_northstar_phase2_consolidation applied to ONPREMISE-DEV-PRIMARY (2025-11-08), TrainerProfile table dropped
  - Prisma client regenerated (v6.19.0), TypeScript build passing (1 warning, 0 errors)
  - Canonical naming applied per Patch.md Absolutes: ONPREMISE-DEV-PRIMARY (not PRIMARY LOCAL), ONPREMISE-DEV-EXPERIMENT (not EXPERIMENTAL)
  - Deployment status: Schema consolidated in local database, cloud deployment (CLOUD-DEV-MASTER → CLOUD-PROD-RUNTIME) pending manual push
- ✅ Ready for DB.NORTHSTAR.ANALYTICS (dependencies now met)

**Recent Activity (2025-11-09T06:00Z):**
- ✅ **Northstar Methodology Solidification Complete** (5 commits, 2,700+ lines documentation)
  - Bug fixes: Dex seeding DELETE safety (TRUNCATE), ON CONFLICT constraint (level column), logger timing (graceful degradation)
  - Documentation: northstar-methodology.md (832 lines), northstar-qa-checklist.md (572 lines), northstar-solidification-summary.md (594 lines), northstar-schema-state.md (424 lines)
  - Phase 2 validation: EXPERIMENTAL testing complete (migration + rollback, zero data loss, 100% offline isolation)
  - Schema clarification: Current (12 User columns) vs. Phase 1 target (+15 columns, +6 tables) vs. Phase 2 target (TrainerProfile removed)
  - Repository: TypeScript build passing, all commits pushed to origin/main (eac364e, d292493, 64da66f, 9a609f8, 41fe1f5)
- ✅ Ready for DB.NORTHSTAR.PHASE2 PRIMARY LOCAL validation before DEV deployment

Status legend: `PROPOSED` → `READY` → `IN_PROGRESS` → `DONE` → `BLOCKED`

Each task has:
- `id`: unique string
- `title`: terse description
- `status`: current state
- `depends_on`: array of task ids
- `acceptance_criteria`: bullet list
- `notes`: optional context

---

## 📚 Completed Tasks Archive

**Archive Location:** [`docs/archive/tasks/`](docs/archive/tasks/README.md)

Completed tasks have been moved to project-specific archive files to keep this file maintainable. Each archive is ~500 lines max with full task details and outcome notes.

| Archive | Tasks | Coverage |
|---------|-------|----------|
| [meta-repository-tooling.md](docs/archive/tasks/meta-repository-tooling.md) | ~30 | META.* guards, routers, contracts |
| [phase-0-9-core-features.md](docs/archive/tasks/phase-0-9-core-features.md) | ~25 | T0-T9 core feature development |
| [phase-10-scalability.md](docs/archive/tasks/phase-10-scalability.md) | 7 | T10.SCALE.* scalability foundations |
| [phase-11-12-meta-ai.md](docs/archive/tasks/phase-11-12-meta-ai.md) | 4 | Phase 11-12 governance & AI docs |
| [phase-13-dex-backbone.md](docs/archive/tasks/phase-13-dex-backbone.md) | 13 | T13.DEX.* dex data backbone |
| [phase-14-live-cache.md](docs/archive/tasks/phase-14-live-cache.md) | 4 | T14.CACHE.* + T14.SECURITY.* |
| [phase-15-db-bootstrap-northstar.md](docs/archive/tasks/phase-15-db-bootstrap-northstar.md) | 8 | DB.V0.* + DB.NORTHSTAR.* |
| [phase-16-db-replication.md](docs/archive/tasks/phase-16-db-replication.md) | 8 | DB.REPLICATION.* architecture |
| [phase-17-18-northstar-homestead.md](docs/archive/tasks/phase-17-18-northstar-homestead.md) | 7 | Phase 17-18 Northstar & Homestead |
| [pbsl-kernel-logging.md](docs/archive/tasks/pbsl-kernel-logging.md) | 5 | PBSL.* + KERNEL.LOGGING.* |
| [hotfix-system.md](docs/archive/tasks/hotfix-system.md) | 4 | HF.* hotfix infrastructure |

**Total Archived:** ~115 completed tasks  
**Archive Policy:** See [docs/archive/tasks/README.md](docs/archive/tasks/README.md)

---

## SensaiOS Ring Security Model (ACTIVE — AI SUBAGENT TASKS)

**Design Document:** `docs/projects/SensaiOS/architecture/06-os-security-model.md`  
**Spec Section:** § 7 Implementation Roadmap  
**Goal:** Transform SensaiOS into true OS with ring isolation, capability-based security, and installation primitives  
**Timeline:** 8 weeks (4 phases)  
**Assigned To:** AI Subagents (all 16 tasks have detailed checklists)

**Task Distribution:**
- Phase 1: 5 tasks (Ring Security Foundation) — **READY** ✅
- Phase 2: 4 tasks (Installation Primitives) — PROPOSED
- Phase 3: 3 tasks (Game Server Boundary) — PROPOSED
- Phase 4: 4 tasks (Visibility Enforcement) — PROPOSED

| Phase | Focus | Effort | Status |
|-------|-------|--------|--------|
| Phase 1 | Ring Security Foundation | 2 weeks | **READY** ✅ |
| Phase 2 | Installation Primitives | 2 weeks | PROPOSED |
| Phase 3 | Game Server Boundary | 2 weeks | PROPOSED |
| Phase 4 | Visibility Enforcement | 2 weeks | PROPOSED |

---

### Phase 1: Ring Security Foundation (Weeks 1-2)

**Phase 1 Acceptance Criteria (from 06-os-security-model.md § 7):**
- [ ] All components have ring level assigned
- [ ] Capability checks in db/exports/jobs/outbox primitives
- [ ] ESLint blocks invalid imports
- [ ] Tests verify capability denial

---

- id: SENSAI.RING_SECURITY.SCHEMA
  title: Add ring security database schema
  status: READY
  depends_on: []
  priority: P0-CRITICAL
  effort: 4h
  assigned_to: AI_SUBAGENT
  acceptance_criteria:
    ## AI Subagent Checklist:
    - [ ] Create `src/sensaios/schema/capability.prisma` with fields:
      - [ ] component: String (component name, e.g., "discord.bot")
      - [ ] type: String (capability type, e.g., "db.read", "discord.send")
      - [ ] scope: Json (TenantScope: { tenantId, guildId })
      - [ ] reason: String (justification for capability)
      - [ ] expiresAt: DateTime? (optional expiration)
      - [ ] revokedAt: DateTime? (null = active)
    - [ ] Create `installed_app` table with fields:
      - [ ] id: String @id (app identifier)
      - [ ] name: String (human-readable name)
      - [ ] version: String (semver)
      - [ ] manifest: Json (AppManifest)
      - [ ] installedAt: DateTime
      - [ ] status: String (enabled/disabled/failed)
    - [ ] Add `ring_level` field to component registry (0=kernel, 1=sensaios, 3=apps)
    - [ ] Create Prisma migration: `npx prisma migrate dev --name sensai_ring_security`
    - [ ] Update `ComponentContext` interface with `ctx.capabilities` primitive
    - [ ] Verify TypeScript compiles: `npm run build`
    - [ ] Document schema in `docs/projects/SensaiOS/architecture/06-os-security-model.md`
  notes: Foundation for all capability checks. Must be first. See spec § 2 Ring Architecture.

- id: SENSAI.RING_SECURITY.CAPABILITIES
  title: Implement capability assertion system
  status: READY
  depends_on: [SENSAI.RING_SECURITY.SCHEMA]
  priority: P0-CRITICAL
  effort: 6h
  assigned_to: AI_SUBAGENT
  acceptance_criteria:
    ## AI Subagent Checklist:
    - [ ] Create `src/sensaios/capabilities/assert-capability.ts`:
      - [ ] `assertCapability(component: string, capability: CapabilityType, scope: TenantScope): Promise<void>`
      - [ ] Throws `SecurityError` with code 4xxx on denial
      - [ ] Checks capability table for valid, non-revoked, non-expired grants
    - [ ] Add capability checks to DbPrimitive (`src/sensaios/kernel/primitives/db.ts`):
      - [ ] `db.read()` requires `db.read` capability
      - [ ] `db.write()` requires `db.write` capability
      - [ ] `db.migrate()` requires `db.migrate` capability (Ring 0 only)
    - [ ] Add capability checks to ExportsPrimitive:
      - [ ] `exports.append()` requires `exports.append` capability
    - [ ] Add capability checks to JobsPrimitive:
      - [ ] `jobs.enqueue()` requires `jobs.enqueue` capability
    - [ ] Add capability checks to OutboxPrimitive:
      - [ ] `outbox.send()` requires `outbox.send` capability
    - [ ] All checks emit audit event to exports log with:
      - [ ] `type: "security.capability.check"`
      - [ ] `payload: { component, capability, scope, granted: boolean }`
    - [ ] Verify TypeScript compiles: `npm run build`
    - [ ] Unit tests in `tests/sensaios/capabilities.spec.ts` (min 10 tests)
  notes: Enforces capability requirements at kernel boundary. See spec § 3 Capability System.

- id: SENSAI.RING_SECURITY.ESLINT
  title: Add compile-time ring boundary enforcement
  status: READY
  depends_on: []
  priority: P0-CRITICAL
  effort: 2h
  assigned_to: AI_SUBAGENT
  acceptance_criteria:
    ## AI Subagent Checklist:
    - [ ] Update `eslint.config.js` with ring boundary rules:
      - [ ] Rule: `no-restricted-imports` for apps importing from `src/kernel/**`
      - [ ] Rule: `no-restricted-imports` for apps importing from `src/sensaios/**`
      - [ ] Rule: `no-restricted-imports` for sensaios importing from `src/bot/**`
      - [ ] Rule: `no-restricted-imports` for kernel importing from upper layers
    - [ ] Create ring zone definitions:
      - [ ] Ring 0 (Kernel): `src/kernel/**`
      - [ ] Ring 1 (SensaiOS): `src/sensaios/**`
      - [ ] Ring 3 (Apps): `src/bot/**`, `src/core/**`, `src/services/**`
    - [ ] Add violation examples in `docs/projects/SensaiOS/architecture/06-os-security-model.md`:
      - [ ] Example: App importing kernel → blocked
      - [ ] Example: App importing sensaios → blocked
      - [ ] Example: Kernel importing app → blocked
    - [ ] Verify ESLint catches violations: `npm run lint`
    - [ ] Document rule configuration in `.github/instructions/sensai.instructions.md`
  notes: Catch visibility violations at compile-time. See spec § 4 Visibility Control.

- id: SENSAI.RING_SECURITY.RUNTIME_IMPORTS
  title: Add runtime dynamic import checks
  status: READY
  depends_on: [SENSAI.RING_SECURITY.CAPABILITIES]
  priority: P0-CRITICAL
  effort: 4h
  assigned_to: AI_SUBAGENT
  acceptance_criteria:
    ## AI Subagent Checklist:
    - [ ] Create `src/sensaios/security/secure-import.ts`:
      - [ ] `secureImport(modulePath: string, context: ImportContext): Promise<Module>`
      - [ ] Validates module path against ring boundaries
      - [ ] Throws `SecurityError` on cross-ring violations
    - [ ] Create `assertImportAllowed(from: RingLevel, to: string): void`:
      - [ ] Ring 0 → any (allowed)
      - [ ] Ring 1 → Ring 0, Ring 1 (allowed)
      - [ ] Ring 3 → Ring 3 only (apps cannot import kernel/sensaios)
    - [ ] Audit all dynamic imports to exports log:
      - [ ] `type: "security.import.audit"`
      - [ ] `payload: { from, to, allowed: boolean, timestamp }`
    - [ ] Block cross-ring imports at runtime with clear error messages
    - [ ] Tests verify denial for invalid imports (min 8 test cases):
      - [ ] App → Kernel import (blocked)
      - [ ] App → SensaiOS import (blocked)
      - [ ] SensaiOS → App import (blocked)
      - [ ] Kernel → Kernel import (allowed)
    - [ ] Verify TypeScript compiles: `npm run build`
  notes: Enforces visibility rules for dynamic imports. See spec § 4.2 Runtime Enforcement.

- id: SENSAI.RING_SECURITY.TESTS
  title: Add ring security test suite
  status: READY
  depends_on: [SENSAI.RING_SECURITY.CAPABILITIES, SENSAI.RING_SECURITY.ESLINT, SENSAI.RING_SECURITY.RUNTIME_IMPORTS]
  priority: P0-CRITICAL
  effort: 6h
  assigned_to: AI_SUBAGENT
  acceptance_criteria:
    ## AI Subagent Checklist:
    - [ ] Create `tests/sensaios/ring-security.spec.ts` with test suites:
    - [ ] **Capability Grant/Revoke Tests (10+ tests):**
      - [ ] Grant capability to component
      - [ ] Revoke capability from component
      - [ ] Expired capability denied
      - [ ] Scoped capability (guild-specific)
    - [ ] **Capability Denial Tests (10+ tests):**
      - [ ] Missing capability throws SecurityError
      - [ ] Wrong scope throws SecurityError
      - [ ] SecurityError has code 4xxx
      - [ ] Denial audit logged
    - [ ] **ESLint Rule Tests (10+ tests):**
      - [ ] Invalid import patterns detected
      - [ ] Valid imports allowed
      - [ ] Error messages clear
    - [ ] **Runtime Import Tests (10+ tests):**
      - [ ] Cross-ring import blocked
      - [ ] Same-ring import allowed
      - [ ] Audit events emitted
    - [ ] **Audit Logging Tests (10+ tests):**
      - [ ] All operations audited
      - [ ] Audit entries have correlationId
      - [ ] Audit entries have TenantScope
    - [ ] Minimum 50 tests total
    - [ ] 100% code coverage on `src/sensaios/security/**`
    - [ ] Run tests: `npm test -- tests/sensaios/`
    - [ ] All tests pass: green checkmarks
  notes: Verify all security boundaries work correctly. Gate for Phase 2.

### Phase 2: Installation Primitives (Weeks 3-4)

**Phase 2 Acceptance Criteria (from 06-os-security-model.md § 7):**
- [ ] Can install a test app via CLI
- [ ] Can uninstall without breaking system
- [ ] Dependency checks prevent invalid installs
- [ ] Approval workflow blocks dangerous capabilities

---

- id: SENSAI.INSTALL.MANIFEST
  title: Define AppManifest schema
  status: PROPOSED
  depends_on: [SENSAI.RING_SECURITY.CAPABILITIES]
  priority: P1-HIGH
  effort: 4h
  assigned_to: AI_SUBAGENT
  acceptance_criteria:
    ## AI Subagent Checklist:
    - [ ] Create `src/sensaios/install/app-manifest.ts` with TypeScript interface:
      ```typescript
      interface AppManifest {
        id: string;           // Unique app ID (e.g., "discord.bot")
        name: string;         // Human-readable name
        version: string;      // Semver (e.g., "1.0.0")
        capabilities: Capability[];  // Required capabilities
        owns?: { canonical?: string[]; projections?: string[]; };
        dependencies?: string[];     // Other required apps
        lifecycle?: { onLoad, onEnable, onDisable, onUnload };
        handlers?: { discord?, exports?, jobs?, http?, cli? };
        config?: Record<string, unknown>;
      }
      ```
    - [ ] Create Zod validation schema in `src/sensaios/install/manifest-schema.ts`
    - [ ] Add `validateManifest(manifest: unknown): AppManifest` function
    - [ ] Document manifest format in `docs/projects/SensaiOS/architecture/06-os-security-model.md`
    - [ ] Create example manifests for existing apps:
      - [ ] `manifests/discord-bot.manifest.json`
      - [ ] `manifests/battle-engine.manifest.json`
      - [ ] `manifests/encounter-system.manifest.json`
    - [ ] Verify TypeScript compiles: `npm run build`
  notes: Foundation for installation API. See spec § 5 Installation Primitives.

- id: SENSAI.INSTALL.API
  title: Implement installation API
  status: PROPOSED
  depends_on: [SENSAI.INSTALL.MANIFEST]
  priority: P1-HIGH
  effort: 8h
  assigned_to: AI_SUBAGENT
  acceptance_criteria:
    ## AI Subagent Checklist:
    - [ ] Create `src/sensaios/install/install-app.ts`:
      - [ ] `installApp(manifest: AppManifest, ctx: ComponentContext): Promise<InstallResult>`
      - [ ] Validates manifest with Zod schema
      - [ ] Resolves and checks dependencies
      - [ ] Requests capability approvals for dangerous capabilities
      - [ ] Stores manifest in `installed_app` table
      - [ ] Emits `app.installed` export event
    - [ ] Create `src/sensaios/install/uninstall-app.ts`:
      - [ ] `uninstallApp(appId: string, ctx: ComponentContext): Promise<UninstallResult>`
      - [ ] Checks for dependent apps (blocks if dependencies exist)
      - [ ] Calls `onUnload()` lifecycle hook
      - [ ] Revokes all capabilities
      - [ ] Updates `installed_app` status to "uninstalled"
      - [ ] Emits `app.uninstalled` export event
    - [ ] Create `src/sensaios/install/dependency-resolver.ts`:
      - [ ] `resolveDependencies(manifest: AppManifest): Promise<DependencyGraph>`
      - [ ] Detects circular dependencies
      - [ ] Validates all dependencies installed
    - [ ] Create capability approval workflow:
      - [ ] Dangerous capabilities: `db.migrate`, `kernel.observe`, `discord.moderate`
      - [ ] Prompt operator for approval via CLI
      - [ ] Log approval/denial to exports
    - [ ] Register apps with `ComponentSupervisor`
    - [ ] All operations emit audit events to exports
    - [ ] Verify TypeScript compiles: `npm run build`
    - [ ] Unit tests (min 15 tests)
  notes: Core installation/removal functionality. See spec § 5.1 Installation API.

- id: SENSAI.INSTALL.CLI
  title: Create sensaios CLI tool
  status: PROPOSED
  depends_on: [SENSAI.INSTALL.API]
  priority: P1-HIGH
  effort: 6h
  assigned_to: AI_SUBAGENT
  acceptance_criteria:
    ## AI Subagent Checklist:
    - [ ] Create `scripts/sensaios-cli.ts` with commands:
      - [ ] `sensaios install <path>` — Install app from manifest path
      - [ ] `sensaios list` — List all installed apps with status
      - [ ] `sensaios enable <appId>` — Enable disabled app
      - [ ] `sensaios disable <appId>` — Disable app without uninstalling
      - [ ] `sensaios uninstall <appId>` — Remove app completely
      - [ ] `sensaios grant <appId> <capability>` — Grant capability to app
      - [ ] `sensaios revoke <appId> <capability>` — Revoke capability from app
      - [ ] `sensaios status <appId>` — Show app details and capabilities
    - [ ] Add npm script: `"sensaios": "tsx scripts/sensaios-cli.ts"`
    - [ ] All commands use installation API (not direct DB access)
    - [ ] Add `--dry-run` flag for dangerous operations
    - [ ] Add `--force` flag for operator override (with audit)
    - [ ] Output in human-readable format with colors
    - [ ] Document CLI in `docs/projects/SensaiOS/architecture/06-os-security-model.md`
    - [ ] Verify commands work: `npm run sensaios list`
  notes: Operator interface for app management. See spec § 5.2 CLI Commands.

- id: SENSAI.INSTALL.MIGRATION
  title: Migrate existing apps to installation model
  status: PROPOSED
  depends_on: [SENSAI.INSTALL.API]
  priority: P1-HIGH
  effort: 8h
  assigned_to: AI_SUBAGENT
  acceptance_criteria:
    ## AI Subagent Checklist:
    - [ ] Create manifests for existing core apps:
      - [ ] `src/bot/manifest.json` (Discord bot)
      - [ ] `src/core/battle/manifest.json` (Battle engine)
      - [ ] `src/core/encounter/manifest.json` (Encounter system)
      - [ ] `src/services/cache/manifest.json` (Cache service)
    - [ ] Refactor app bootstrapping in `src/index.ts`:
      - [ ] Replace direct imports with `installApp()` calls
      - [ ] Load manifests from filesystem
      - [ ] Call `enableApp()` after installation
    - [ ] Update startup sequence:
      - [ ] 1. Initialize kernel
      - [ ] 2. Load installed apps from database
      - [ ] 3. Enable apps in dependency order
      - [ ] 4. Call lifecycle hooks
    - [ ] Preserve backward compatibility:
      - [ ] Old code paths still work during migration
      - [ ] Feature flag: `SENSAIOS_INSTALL_MODEL=true`
    - [ ] Test migration: `npm test -- tests/sensaios/install-migration.spec.ts`
    - [ ] Document migration steps in `docs/projects/SensaiOS/MIGRATION-GUIDE.md`
  notes: Converts current apps to new installation model. Gate for Phase 3.

### Phase 3: Game Server Boundary (Weeks 5-6)

**Phase 3 Acceptance Criteria (from 06-os-security-model.md § 7):**
- [ ] Apps use GameServerAPI, not raw primitives
- [ ] Sensitive data encrypted in payloads
- [ ] Rate limits prevent abuse
- [ ] All API calls audited in exports

---

- id: SENSAI.GAMESERVER.API
  title: Define GameServerAPI interface
  status: PROPOSED
  depends_on: [SENSAI.RING_SECURITY.CAPABILITIES]
  priority: P1-HIGH
  effort: 6h
  assigned_to: AI_SUBAGENT
  acceptance_criteria:
    ## AI Subagent Checklist:
    - [ ] Create `src/sensaios/gameserver/api.ts` with TypeScript interface:
      ```typescript
      interface GameServerAPI {
        battles: {
          create(params: BattleParams): Promise<EncryptedBattle>;
          get(battleId: string): Promise<EncryptedBattle>;
          submitMove(battleId: string, move: Move): Promise<TurnResult>;
          forfeit(battleId: string): Promise<BattleResult>;
        };
        encounters: {
          spawn(channelId: string, seed: string): Promise<EncryptedEncounter>;
          capture(encounterId: string, ballType: string): Promise<CaptureResult>;
          flee(encounterId: string): Promise<void>;
        };
        trainers: {
          get(discordId: string): Promise<EncryptedTrainer>;
          updateMoney(discordId: string, delta: number): Promise<void>;
        };
        logs: {
          info(message: string, data?: Record<string, unknown>): void;
          error(message: string, error: Error): void;
        };
      }
      ```
    - [ ] Document all methods with JSDoc examples
    - [ ] Add rate limiting specifications per method:
      - [ ] `battles.create`: 1/minute per user
      - [ ] `encounters.spawn`: 10/minute per channel
      - [ ] `trainers.updateMoney`: 100/minute per user
    - [ ] Define encryption requirements:
      - [ ] Discord IDs encrypted (apps see tokens only)
      - [ ] Guild IDs encrypted
      - [ ] Trainer sensitive data encrypted
    - [ ] Create type exports in `src/sensaios/gameserver/types.ts`
    - [ ] Document API in `docs/projects/SensaiOS/architecture/06-os-security-model.md`
  notes: Contract between SensaiOS and apps. See spec § 6 Game Server Boundary.

- id: SENSAI.GAMESERVER.CLIENT
  title: Implement encrypted API client
  status: PROPOSED
  depends_on: [SENSAI.GAMESERVER.API]
  priority: P1-HIGH
  effort: 8h
  assigned_to: AI_SUBAGENT
  acceptance_criteria:
    ## AI Subagent Checklist:
    - [ ] Create `src/sensaios/gameserver/client.ts`:
      - [ ] `createGameServerClient(appId: string, ctx: ComponentContext): GameServerAPI`
      - [ ] Client validates app capabilities before each call
      - [ ] Client encrypts sensitive fields before passing to app
    - [ ] Implement encryption layer:
      - [ ] `encryptForApp(data: Sensitive): EncryptedToken`
      - [ ] `decryptFromApp(token: EncryptedToken): Sensitive`
      - [ ] Use AES-256-GCM with per-app keys
    - [ ] Add capability checks on all methods:
      - [ ] `battles.*` requires `game.battle` capability
      - [ ] `encounters.*` requires `game.encounter` capability
      - [ ] `trainers.*` requires `game.trainer` capability
    - [ ] Add rate limiting middleware:
      - [ ] `RateLimiter` class with sliding window
      - [ ] Configurable limits per method
      - [ ] Throws `RateLimitError` on exceed
    - [ ] Audit all API calls to exports:
      - [ ] `type: "gameserver.api.call"`
      - [ ] `payload: { appId, method, success, durationMs }`
    - [ ] Verify TypeScript compiles: `npm run build`
    - [ ] Unit tests (min 20 tests)
  notes: Secure boundary for app access. See spec § 6.1 Encrypted Client.

- id: SENSAI.GAMESERVER.MIGRATION
  title: Refactor apps to use GameServerAPI
  status: PROPOSED
  depends_on: [SENSAI.GAMESERVER.CLIENT]
  priority: P1-HIGH
  effort: 12h
  assigned_to: AI_SUBAGENT
  acceptance_criteria:
    ## AI Subagent Checklist:
    - [ ] Refactor Discord bot (`src/bot/**`):
      - [ ] Replace direct `ctx.db.prisma` calls with `gameServer.trainers.*`
      - [ ] Replace direct battle engine calls with `gameServer.battles.*`
      - [ ] Replace direct encounter calls with `gameServer.encounters.*`
      - [ ] Remove all imports from `src/kernel/**`
      - [ ] Remove all imports from `src/sensaios/**` (except GameServerAPI)
    - [ ] Refactor battle engine (`src/core/battle/**`):
      - [ ] Expose through GameServerAPI only
      - [ ] Remove direct database access
      - [ ] All state changes via exports
    - [ ] Refactor encounter system (`src/core/encounter/**`):
      - [ ] Expose through GameServerAPI only
      - [ ] Remove direct database access
      - [ ] All state changes via exports
    - [ ] Remove direct kernel/db access from all Ring 3 apps:
      - [ ] No `import ... from '../kernel/'`
      - [ ] No `import ... from '../shared/prisma'`
      - [ ] No `ctx.db.prisma` calls
    - [ ] All tests pass after refactoring: `npm test`
    - [ ] ESLint passes (ring boundaries enforced): `npm run lint`
    - [ ] Document migration in `docs/projects/SensaiOS/APP-MIGRATION-GUIDE.md`
  notes: Locks down app isolation. Gate for Phase 4.

### Phase 4: Visibility Enforcement (Weeks 7-8)

**Phase 4 Acceptance Criteria (from 06-os-security-model.md § 7):**
- [ ] Apps cannot dynamically import kernel/sensai
- [ ] Security violations logged and alerted
- [ ] Dashboard shows capability usage
- [ ] 100+ tests verify boundaries

---

- id: SENSAI.VISIBILITY.LOADER
  title: Add import assertion to module loader
  status: PROPOSED
  depends_on: [SENSAI.RING_SECURITY.RUNTIME_IMPORTS]
  priority: P2-MEDIUM
  effort: 6h
  assigned_to: AI_SUBAGENT
  acceptance_criteria:
    ## AI Subagent Checklist:
    - [ ] Create `src/sensaios/loader/module-hook.ts`:
      - [ ] Hook Node.js module loader via `--loader` flag
      - [ ] Intercept all `import()` and `require()` calls
      - [ ] Add `assertImportAllowed()` check on every import
    - [ ] Create `src/sensaios/loader/ring-resolver.ts`:
      - [ ] `getRingLevel(modulePath: string): RingLevel`
      - [ ] Returns 0 for `src/kernel/**`
      - [ ] Returns 1 for `src/sensaios/**`
      - [ ] Returns 3 for all other paths
    - [ ] Block cross-ring imports at load time:
      - [ ] Ring 3 importing Ring 0/1 → throw `ImportSecurityError`
      - [ ] Ring 1 importing Ring 3 → throw `ImportSecurityError`
    - [ ] Performance impact measurement:
      - [ ] Benchmark import time with/without hook
      - [ ] Target: <5ms overhead per import
      - [ ] Document results in PR
    - [ ] Update `package.json` scripts to use loader:
      - [ ] `"start": "node --loader ./dist/sensaios/loader/module-hook.js ..."`
    - [ ] Verify TypeScript compiles: `npm run build`
    - [ ] Unit tests (min 10 tests)
  notes: Deepest enforcement layer. See spec § 4.3 Module Loader Hook.

- id: SENSAI.VISIBILITY.DASHBOARD
  title: Create security audit dashboard
  status: PROPOSED
  depends_on: [SENSAI.RING_SECURITY.CAPABILITIES]
  priority: P2-MEDIUM
  effort: 8h
  assigned_to: AI_SUBAGENT
  acceptance_criteria:
    ## AI Subagent Checklist:
    - [ ] Create `/ops security` Discord command:
      - [ ] Subcommand: `/ops security capabilities` — List all granted capabilities
      - [ ] Subcommand: `/ops security usage` — Show capability usage stats
      - [ ] Subcommand: `/ops security violations` — Show recent violations
      - [ ] Subcommand: `/ops security apps` — List installed apps with ring levels
    - [ ] Display capability usage statistics:
      - [ ] Total grants/revocations per day
      - [ ] Most used capabilities
      - [ ] Apps with most capabilities
    - [ ] Alert on security violations:
      - [ ] Emit `security.violation` event on any boundary breach
      - [ ] Send Discord alert to admin channel
      - [ ] Include: appId, violation type, timestamp, stack trace
    - [ ] Visualize ring boundaries:
      - [ ] ASCII diagram showing Ring 0/1/3 separation
      - [ ] List apps per ring
      - [ ] Show dependency arrows
    - [ ] Export audit reports:
      - [ ] `/ops security export` — Generate JSON report
      - [ ] Include: all capabilities, all violations, all apps
    - [ ] Add to `src/bot/ops/admin.ts`
    - [ ] Document in `docs/operations-bible/ops-commands-reference-comprehensive.md`
  notes: Observability for security model. See spec § 4.4 Audit Dashboard.

- id: SENSAI.VISIBILITY.TESTS
  title: Add automated security tests
  status: PROPOSED
  depends_on: [SENSAI.VISIBILITY.LOADER, SENSAI.GAMESERVER.MIGRATION]
  priority: P2-MEDIUM
  effort: 10h
  assigned_to: AI_SUBAGENT
  acceptance_criteria:
    ## AI Subagent Checklist:
    - [ ] Create comprehensive test suite in `tests/sensaios/security/`:
    - [ ] **Capability Denial Tests (25+ tests):**
      - [ ] Every capability type denial scenario
      - [ ] Expired capability denial
      - [ ] Revoked capability denial
      - [ ] Scope mismatch denial
      - [ ] Missing capability denial
    - [ ] **Visibility Violation Tests (25+ tests):**
      - [ ] App → Kernel import blocked
      - [ ] App → SensaiOS import blocked
      - [ ] SensaiOS → App import blocked
      - [ ] Dynamic import blocked
      - [ ] Require() blocked
    - [ ] **Installation Attack Tests (25+ tests):**
      - [ ] Malicious manifest rejected
      - [ ] Circular dependency rejected
      - [ ] Missing dependency rejected
      - [ ] Dangerous capability without approval rejected
      - [ ] Privilege escalation attempt rejected
    - [ ] **Boundary Tests (25+ tests):**
      - [ ] GameServerAPI encryption verified
      - [ ] Rate limiting enforced
      - [ ] Audit logging complete
      - [ ] No data leakage through errors
    - [ ] Minimum 100 total security tests
    - [ ] CI fails on any security regression:
      - [ ] Add to `.github/workflows/test.yml`
      - [ ] Security tests run on every PR
    - [ ] Run: `npm test -- tests/sensaios/security/`
    - [ ] Coverage report: 100% on security code
  notes: Comprehensive security verification. See spec § 7 Implementation Roadmap.

- id: SENSAI.VISIBILITY.DOCS
  title: Document security model in architecture-bible
  status: PROPOSED
  depends_on: [SENSAI.VISIBILITY.TESTS]
  priority: P2-MEDIUM
  effort: 6h
  assigned_to: AI_SUBAGENT
  acceptance_criteria:
    ## AI Subagent Checklist:
    - [ ] Move validated spec to architecture-bible:
      - [ ] Copy `docs/projects/SensaiOS/architecture/06-os-security-model.md`
      - [ ] To `docs/architecture-bible/28-sensaios-security-model.md`
      - [ ] Update status from PROPOSED to AUTHORITATIVE
    - [ ] Create implementation guide:
      - [ ] `docs/development-bible/11-sensaios-development.md`
      - [ ] How to create a new app
      - [ ] How to request capabilities
      - [ ] How to use GameServerAPI
    - [ ] Create operator runbook:
      - [ ] `docs/operations-bible/14-sensaios-operations.md`
      - [ ] How to install/uninstall apps
      - [ ] How to grant/revoke capabilities
      - [ ] How to respond to security alerts
    - [ ] Create security incident response playbook:
      - [ ] `playbooks/sensaios-security-incident.md`
      - [ ] Capability abuse response
      - [ ] Ring boundary breach response
      - [ ] Malicious app response
    - [ ] Update INDEX.md files:
      - [ ] `docs/architecture-bible/INDEX.md` — Add section 28
      - [ ] `docs/development-bible/INDEX.md` — Add section 11
      - [ ] `docs/operations-bible/INDEX.md` — Add section 14
    - [ ] Update `docs/projects/SensaiOS/INDEX.md` with completion status
    - [ ] All documentation passes review
  notes: Make security model authoritative. Final task of SensaiOS Ring Security.

---

## /Store DB-Only Migration (PAUSED)

> ⏸️ **PAUSED (2026-01-01):** SensaiOS Ring Security takes priority. Resume after Phase 1 complete.

**Policy Document:** `docs/architecture-bible/19-store-db-only-policy.md`  
**Goal:** All persistent data in SQLite databases, no loose files  
**Current Violations:** 83 files (~168 MB)

| Phase | Focus | Effort | Status |
|-------|-------|--------|--------|
| Phase 1 | Heap snapshot migration | 3h | PROPOSED |
| Phase 2 | Security bot state | 2h | PROPOSED |
| Phase 3 | Kernel logs | 1h | PROPOSED |
| Phase 4 | Config consolidation | 1h | PROPOSED |
| Phase 5 | Cleanup & enforcement | 30m | PROPOSED |

---

- id: STORE.HEAP_MIGRATION
  title: Migrate heap snapshots to engine-write.db
  status: PROPOSED
  depends_on: []
  priority: P1-HIGH
  effort: 3h
  acceptance_criteria:
    - Create heap_snapshots table in engine-write.db
    - Parse existing .heapsnapshot files on startup
    - Extract key metrics (heap size, top allocators)
    - Insert summary into DB, delete raw file
    - New snapshots: parse immediately, never write raw
  notes: Frees 163 MB disk space. Highest priority.

- id: STORE.SECURITY_STATE
  title: Migrate security bot state to engine-write.db
  status: PROPOSED
  depends_on: []
  priority: P1-HIGH
  effort: 2h
  acceptance_criteria:
    - Create security_bot_state table in engine-write.db
    - Migrate current.json, backup-*.json, snapshots/*.json
    - Update persistence.js to use SQLite
    - Delete JSON files after successful migration
  notes: 71 JSON files → single table.

- id: STORE.KERNEL_LOGS
  title: Migrate kernel logs to PostgreSQL
  status: PROPOSED
  depends_on: [KERNEL.LOGGING.DATABASE_OUTPUT]
  priority: P2-MEDIUM
  effort: 1h
  acceptance_criteria:
    - Redirect kernel file logs to log_entries table
    - Keep local file as emergency fallback only
    - Auto-cleanup file logs after DB insert confirmed
  notes: Uses existing log_entries table.

- id: STORE.CONFIG_CONSOLIDATE
  title: Consolidate JSON configs to runtime_config table
  status: PROPOSED
  depends_on: []
  priority: P2-MEDIUM
  effort: 1h
  acceptance_criteria:
    - Create runtime_config table in engine-write.db
    - Migrate cooldowns.json, restart-metrics.json, guild-member-timeout-config.json
    - Update config loaders to use SQLite
    - Delete JSON files after migration
  notes: Removes 3 loose JSON files.

- id: STORE.CLEANUP_ENFORCE
  title: Add /Store policy enforcement guard
  status: PROPOSED
  depends_on: [STORE.HEAP_MIGRATION, STORE.SECURITY_STATE, STORE.CONFIG_CONSOLIDATE]
  priority: P2-MEDIUM
  effort: 30m
  acceptance_criteria:
    - Create scripts/guard_store_policy.ts
    - Fail if non-.db files exist in /Store
    - Add to CI pipeline
    - Runtime warning on startup for violations
  notes: Final enforcement task.

---

## Kernel-First Logging Initiative (PAUSED)

> ⏸️ **PAUSED (2026-01-01):** SensaiOS Ring Security takes priority. Sprint 1 complete; resume Sprint 2 after SensaiOS Phase 1.

**Sprint Structure:** 4 sprints, ~2 weeks total  
**Current Sprint:** Sprint 2 — Output Plugin Architecture (PAUSED)

| Sprint | Focus | Effort | Status |
|--------|-------|--------|--------|
| Sprint 1 | Foundation (pre-boot queue, test utils, bot entry) | ~6h | ✅ DONE |
| Sprint 2 | Output plugins (architecture, PII scrubbing, correlation) | ~10h | PLANNED |
| Sprint 3 | External outputs (Loki, Discord, PostgreSQL, battles) | ~10h | PLANNED |
| Sprint 4 | Migration & hardening (codebase migration, GDPR, docs) | ~16h | PLANNED |

---

## 🔥 Quick/Hotfix Tasks (PAUSED — SensaiOS Priority)

> ⏸️ **PAUSED (2026-01-01):** Non-critical tasks paused while SensaiOS Ring Security is active.

- id: DOCS.BIBLE.ERROR_HANDLER_PATHS
  title: Fix error handler path references in Development Bible
  status: PAUSED
  depends_on: []
  priority: P2-MEDIUM
  effort: 15m
  acceptance_criteria:
    - Update docs/development-bible/05-error-handling.md
    - Fix paths: src/bot/bot-error-handler.ts → src/bot/error-handler.ts
    - Fix class names: DiscordBotErrorHandler → BotErrorHandler
    - Remove references to non-existent src/core/engine-error-handler.ts
    - Keep src/workers/worker-error-handler.ts (correct path)
  notes: Found during Bible validation session (33/50 sections validated, 98% accuracy). PAUSED for SensaiOS priority.

- id: DEX.V2.ACCESSORS.SIGNATURE
  title: Export DEX_V2_SIGNATURE in generated accessors
  status: DONE
  depends_on: []
  priority: P0-CRITICAL
  effort: 0.5h
  acceptance_criteria:
    - Add DEX_V2_SIGNATURE export to src/dex/v2/accessors.js
    - Keep dist/dex/v2/accessors.js aligned for runtime boot
    - Restore dexpack v2 loader import compatibility
  notes: Fixes Render boot crash: missing DEX_V2_SIGNATURE export.

---

### ✅ Sprint 1: Kernel Foundation (COMPLETE)
**Goal:** Pre-boot queue + test utilities + bot entry migration
**Completed:** 2025-12-26

- id: KERNEL.LOGGING.PREBOOT_QUEUE
  title: Add pre-boot log queue to Kernel
  status: DONE
  depends_on: [KERNEL.LOGGING.AUDIT]
  priority: P0-CRITICAL
  effort: 2h
  acceptance_criteria:
    - ✅ Create preBootQueue array in kernel-logger.ts
    - ✅ Queue logs before boot() is called with console echo
    - ✅ replayPreBootLogs() called automatically after boot (via markBooted())
    - ✅ getPreBootStats() for diagnostics
    - ✅ MAX_PREBOOT_ENTRIES=1000 with oldest-drop
    - ✅ No logs lost during initialization
  notes: Foundation task — enables true Kernel-first principle.

- id: KERNEL.LOGGING.TEST_UTILS
  title: Create kernel test utilities for mocking
  status: DONE
  depends_on: [KERNEL.LOGGING.PREBOOT_QUEUE]
  priority: P1-HIGH
  effort: 1.5h
  acceptance_criteria:
    - ✅ Create tests/kernel-test-utils.ts (~350 lines)
    - ✅ Implement mockKernel() function with vi.fn() mocks
    - ✅ Add assertLogged(), assertNotLogged(), assertLogCount() matchers
    - ✅ Add assertErrorCaptured(), assertNoErrors() matchers
    - ✅ Example tests demonstrating usage (32 tests passing)
  notes: Required for testing kernel-aware code. Sprint 1 gate.

- id: KERNEL.LOGGING.BOT_ENTRY
  title: Migrate src/bot/index.ts to Kernel-first
  status: DONE
  depends_on: [KERNEL.LOGGING.PREBOOT_QUEUE]
  priority: P1-HIGH
  effort: 1.5h
  acceptance_criteria:
    - ✅ Kernel import as FIRST import (before all others)
    - ✅ Legacy logger kept for compatibility (renamed to legacyLogger)
    - ✅ All startup logs flow through Kernel (kernel.info/warn/error)
    - ✅ TypeScript compiles cleanly
  notes: Critical entry point. Completes Sprint 1.

---

### 🏃 Sprint 2: Output Plugin Architecture (Days 3-5)
**Goal:** Multi-destination output system with security

- id: KERNEL.LOGGING.OUTPUT_PLUGINS
  title: Add output plugin system to Kernel
  status: PROPOSED
  depends_on: [KERNEL.LOGGING.PREBOOT_QUEUE]
  priority: P0-CRITICAL
  effort: 3h
  acceptance_criteria:
    - Create src/kernel/outputs/ directory structure
    - Define LogOutput interface (id, name, write, flush, minLevel)
    - OutputRegistry with add/remove/list
    - Migrate console to ConsoleOutput plugin
    - Migrate file to FileOutput plugin
  notes: Foundation for all external integrations.

- id: KERNEL.LOGGING.PII_SCRUBBING
  title: Add PII scrubbing pipeline to log outputs
  status: PROPOSED
  depends_on: [KERNEL.LOGGING.OUTPUT_PLUGINS]
  priority: P0-CRITICAL
  effort: 2h
  acceptance_criteria:
    - ScrubConfig interface (patterns, fields, replacement)
    - kernel-scrubber.ts with scrubEntry()
    - Default patterns: tokens, webhooks, emails, passwords
    - Scrubbing in OutputRegistry BEFORE write()
    - 100% test coverage on scrubbing logic
  notes: CRITICAL for security. Must complete before external outputs.

- id: KERNEL.LOGGING.CORRELATION_IDS
  title: Add correlation ID and request tracing support
  status: PROPOSED
  depends_on: [KERNEL.LOGGING.OUTPUT_PLUGINS]
  priority: P1-HIGH
  effort: 2h
  acceptance_criteria:
    - LogContext interface (correlationId, userId, guildId, commandName, workerId)
    - Kernel.context.create() for new context
    - AsyncLocalStorage for automatic propagation
    - workerId from RENDER_INSTANCE_ID
  notes: Essential for production debugging.

- id: KERNEL.LOGGING.SAMPLING
  title: Add log sampling for high-frequency events
  status: PROPOSED
  depends_on: [KERNEL.LOGGING.OUTPUT_PLUGINS]
  priority: P2-MEDIUM
  effort: 1.5h
  acceptance_criteria:
    - sampleRate field (0.0-1.0, default 1.0)
    - ERROR/CRITICAL always logged (no sampling)
    - Per-level default rates configurable
    - Track sampledCount vs actualCount
  notes: Battle engine can generate 1000+ logs/second.

---

### 🏃 Sprint 3: External Outputs (Days 6-8)
**Goal:** Loki, Discord, PostgreSQL integration

- id: KERNEL.LOGGING.LOKI_OUTPUT
  title: Integrate Loki output for Grafana observability
  status: PROPOSED
  depends_on: [KERNEL.LOGGING.PII_SCRUBBING]
  priority: P1-HIGH
  effort: 3h
  acceptance_criteria:
    - src/kernel/outputs/loki-output.ts
    - Push to Loki API (/loki/api/v1/push)
    - Labels: service, level, environment, workerId
    - Batch sending (5s or 100 entries)
    - Graceful degradation if unreachable
  notes: Enables Grafana dashboards.

- id: KERNEL.LOGGING.DISCORD_ALERTS
  title: Add Discord webhook output for critical alerts
  status: PROPOSED
  depends_on: [KERNEL.LOGGING.PII_SCRUBBING]
  priority: P1-HIGH
  effort: 2h
  acceptance_criteria:
    - src/kernel/outputs/discord-output.ts
    - ERROR and CRITICAL to admin webhook
    - Rich embed format with context
    - Rate limiting (max 5/minute)
  notes: Real-time alerting for production.

- id: KERNEL.LOGGING.DATABASE_OUTPUT
  title: Connect Prisma hook for long-term log storage
  status: PROPOSED
  depends_on: [KERNEL.LOGGING.PII_SCRUBBING]
  priority: P1-HIGH
  effort: 3h
  acceptance_criteria:
    - src/kernel/outputs/database-output.ts
    - Use createPrismaHook() from kernel-persistence.ts
    - KernelLog model in Prisma schema
    - Batch inserts every 30 seconds
  notes: Enables historical log analysis.

- id: KERNEL.LOGGING.BATTLE_STRUCTURED
  title: Add structured battle logging for PBSL
  status: PROPOSED
  depends_on: [KERNEL.LOGGING.OUTPUT_PLUGINS]
  priority: P2-MEDIUM
  effort: 2h
  acceptance_criteria:
    - Kernel.battle.log() API
    - BattleLogEntry type (battleId, turn, phase, action, state, seed)
    - Store/kernel-battles/{battleId}.jsonl
    - loadBattleLog(battleId) replay API
  notes: Enables battle replay and anti-cheat.

---

### 🏃 Sprint 4: Migration & Hardening (Days 9-14)
**Goal:** Full codebase migration + compliance

- id: KERNEL.LOGGING.MIGRATION
  title: Migrate all legacy logging to Kernel
  status: PROPOSED
  depends_on: [KERNEL.LOGGING.BOT_ENTRY, KERNEL.LOGGING.OUTPUT_PLUGINS]
  priority: P1-HIGH
  effort: 8h (incremental)
  acceptance_criteria:
    - Replace all 221 console.log calls with Kernel.log.*
    - Replace all 27 legacy logger imports
    - Add Kernel.error.capture() to catch blocks
    - ESLint rule to prevent new console.log
    - Zero console.log in src/ (except CLI)
  notes: Major migration, done incrementally by module.

- id: KERNEL.LOGGING.GDPR_DELETION
  title: Add GDPR-compliant log deletion API
  status: PROPOSED
  depends_on: [KERNEL.LOGGING.DATABASE_OUTPUT]
  priority: P2-MEDIUM
  effort: 2h
  acceptance_criteria:
    - deleteLogsByUserId() function
    - Delete from PostgreSQL and local files
    - Generate deletion certificate
    - Integration with user deletion workflow
  notes: Required for GDPR compliance.

- id: KERNEL.LOGGING.RUNTIME_TOGGLE
  title: Add runtime log level toggle via /ops
  status: PROPOSED
  depends_on: [KERNEL.LOGGING.MIGRATION]
  priority: P2-MEDIUM
  effort: 1.5h
  acceptance_criteria:
    - /ops kernel loglevel <level> command
    - DEBUG, INFO, WARN, ERROR levels
    - Temporary toggle (auto-revert 30 min)
    - Admin-only access
  notes: Debug production without restart.

- id: KERNEL.LOGGING.DOCUMENTATION
  title: Document Kernel-First Logging architecture
  status: PROPOSED
  depends_on: [KERNEL.LOGGING.MIGRATION]
  priority: P2-MEDIUM
  effort: 3h
  acceptance_criteria:
    - Architecture Bible section 23
    - Output plugin API docs
    - Migration guide for new code
    - Troubleshooting guide
  notes: Final task. Ensures future code follows principle.

---

### 📋 Completed Tasks

- id: KERNEL.LOGGING.AUDIT
  title: Complete codebase logging audit
  status: DONE
  depends_on: []
  acceptance_criteria:
    - Count all console.log/warn/error usage in src/
    - Identify legacy logger imports
    - Document entry point initialization order
    - Create audit report with migration priorities
  notes: |
    Outcome (2025-12-26): Audit completed.
    - 221 console.log/warn/error/debug calls
    - 27 legacy logger imports
    - 624 try/catch blocks
    - Entry points: src/index.ts uses Kernel (✅), src/bot/index.ts uses legacy logger (❌)
    - Report: docs/audits/logging-audit-2025-12-26.md
  depends_on: [KERNEL.LOGGING.PREBOOT_QUEUE]
  acceptance_criteria:
    - Create tests/kernel-test-utils.ts
    - Implement mockKernel() function
    - Add assertLogged() matcher
    - Add assertErrorCaptured() matcher
    - Document usage in testing guide
  notes: |
    Required for testing kernel-aware code. Enables verification 
    of logging behavior in unit tests.

- id: KERNEL.LOGGING.GDPR_DELETION
  title: Add GDPR-compliant log deletion API
  status: PROPOSED
  depends_on: [KERNEL.LOGGING.DATABASE_OUTPUT]
  acceptance_criteria:
    - Add deleteLogsByUserId() function
    - Delete from PostgreSQL and local files
    - Generate deletion certificate/audit log
    - Add to user data export/deletion workflow
    - Test with sample user data
  notes: |
    Required for GDPR compliance. Users can request deletion of 
    their data including logs containing their userId.


---

## Archived Phases (Phase 0-18)

**All completed tasks from Phase 0 through Phase 18 have been archived.**

See the **Completed Tasks Archive** section at the top of this file for links to individual archive files organized by project/phase.

**Summary of Archived Work:**
- **Phase 0-9:** Core feature development (repo setup, Render/DB, data pipeline, Discord, catching, battles, safety)
- **Phase 10:** Scalability foundations (data indexing, workers, observability)
- **Phase 11-12:** Meta governance & AI documentation enablement
- **Phase 13:** Dex Data Backbone (seeding, auto-sync, dexpack v1/v2)
- **Phase 14:** Live Game Cache (facade, recipes, observability, security bot state)
- **Phase 15:** Database Bootstrap & Northstar Optimization
- **Phase 16:** Database Replication Architecture (master-replica cascade)
- **Phase 17-18:** Northstar Schema & Private Channel Architecture (Homestead)

**Archive Location:** `docs/archive/tasks/`

**Task Archive Migration Date:** 2026-01-01
