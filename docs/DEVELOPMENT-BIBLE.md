# DEVELOPMENT BIBLE
**Centralized Development Guide** | **Created: 2025-11-16** | **Status: TEMPLATE (Phase 3 Week 7)**

## Purpose
Single source of truth for Infinity Gauntlet development workflows, local setup, testing patterns, debugging techniques, performance optimization, and developer utilities. Consolidates 12 source documents into unified guide.

---

## Table of Contents

### 1. Local Setup
- **1.1 AI Environment** — AI env configuration
- **1.2 Workstation Gameplay** — Local gameplay setup
- **1.3 VS Code Integration** — VS Code task configuration

### 2. Testing Patterns
- Unit testing with Vitest
- Integration testing
- PBSL oracle testing
- Test coverage requirements

### 3. Debugging Guides
- VS Code debugging
- Remote debugging (Render)
- Error reproduction
- Log analysis

### 4. Performance
- **4.1 Memory Analysis** — Memory profiling techniques
- **4.2 Profiling** — Performance profiling tools

### 5. Error Handling
- **5.1 Error Boundaries** — Error boundary implementation patterns

### 6. Console Tooling
- **6.1 Output Standards** — Console output standardization
- **6.2 Quick Reference** — Console output quick ref

### 7. Utilities
- **7.1 DateTime Helpers** — DateTime utility documentation
- **7.2 Timezone Standardization** — Timezone best practices
- **7.3 Implementation Guides** — Admin implementation patterns

---

## Navigation

### Referenced By
*(To be populated during Phase 3 consolidation)*

### Cross-References
- **ARCHITECTURE-BIBLE.md** § Game Engine — Engine architecture
- **ARCHITECTURE-BIBLE.md** § Error System — Error system design
- **OPERATIONS-BIBLE.md** § Database Operations — Database procedures
- **Agents.md** — Agent operations guide
- **README.md** — Getting started

---

## Section 1: Local Setup

### 1.1 AI Environment

*(Content to be consolidated from `environment/ai-env-setup.md` in Phase 3 Week 7)*

**Placeholder**: AI environment configuration, `IG_ENV_FILE` setup, secure loading order (`scripts/setup_ai_env.ps1`), environment variable management.

**Key Commands**:
```powershell
# Register environment file (persistent pointer)
pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env" -Persist

# Verify loading
echo $Env:IG_ENV_FILE

# Load for current session only
pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env"
```

**Safety**: Repo `.env` stays EMPTY. Local secrets always from external file. Production ignores repo `.env` unless `IG_ALLOW_REPO_ENV=1`.

### 1.2 Workstation Gameplay

*(Content to be consolidated from `environment/WORKSTATION-GAMEPLAY-SETUP.md` in Phase 3 Week 7)*

**Placeholder**: Local gameplay setup, on-premise database configuration, PostgreSQL installation, bootstrap procedures.

**Bootstrap Workflows**:
```powershell
# Auto-install PostgreSQL + bootstrap local DB
npm run ops:auto-bootstrap-onpremise-dev

# Manual bootstrap (requires PostgreSQL already installed)
npm run ops:bootstrap-onpremise-dev
```

**Database Ports**:
- **ONPREMISE-DEV-PRIMARY**: Port 55433 (local development mirror)
- **ONPREMISE-DEV-EXPERIMENT**: Port 55434 (migration testing)

### 1.3 VS Code Integration

*(Content to be consolidated from `deployment/vscode-render-integration.md` in Phase 3 Week 7)*

**Placeholder**: VS Code task integration, Render deployment tasks, SSH tasks, debugging configuration.

**Available Tasks**:
- **Render: Deploy Main Bot** — Deploy `Infinity-Gauntlet` service
- **Render: View Service Logs** — Tail logs in background
- **Render: Check Service Status** — Service health check
- **Render: Restart Service** — Restart worker
- **Render SSH: Connect** — Interactive SSH session
- **Render SSH: Check Disk Usage** — Remote disk check
- **Render SSH: View /Store Contents** — View persistent storage

---

## Section 2: Testing Patterns

**Placeholder**: Unit testing with Vitest (293/294 passing), integration testing patterns, PBSL oracle testing (deterministic fixtures), test coverage requirements (80%+ target).

*(To be created during Phase 3 consolidation — not in source file list)*

**Test Categories**:
- **Unit Tests**: `tests/*.spec.ts` (battle engine, DM flows, ops commands)
- **PBSL Oracle**: `tests/pbsl/**` (deterministic battle snapshots)
- **Integration**: `tests/battle/actions.interaction.spec.ts` (Discord button flows)

**Commands**:
```powershell
npm test              # Full test suite
npm run test:pbsl     # PBSL-specific tests
npm run bench:dex     # Dexpack benchmarks
```

---

## Section 3: Debugging Guides

**Placeholder**: VS Code debugging configuration, remote debugging (Render SSH), error reproduction workflows, log analysis techniques.

*(To be created during Phase 3 consolidation — not in source file list)*

**Debugging Tools**:
- **VS Code Debugger**: Attach to local Node.js process
- **Render SSH**: Remote debugging via SSH tunnel
- **Logger Buffer**: 10-second intervals, deduplicated output
- **Error Tracker**: Aggregated error reports (`/ops error`)

---

## Section 4: Performance

### 4.1 Memory Analysis

*(Content to be consolidated from `historical/memory-investigations/memory-analysis-summary.md` in Phase 3 Week 7)*

**Placeholder**: Memory profiling techniques, heap snapshots, leak detection, memory usage patterns.

**Key Metrics**:
- **Target**: <512 MB per service
- **Actual**: ~300-350 MB (58-68% of limit)
- **L1 Cache**: 20 MB max (lazy loading + feature flags)
- **Write Buffer**: 5 MB (queue size limits)
- **Logger Buffer**: 1 MB (200 entry cap)

### 4.2 Profiling

*(Content to be consolidated from `historical/memory-investigations/memory-profiling-report.md` in Phase 3 Week 7)*

**Placeholder**: Performance profiling tools, CPU profiling, flamegraphs, bottleneck identification.

**Profiling Tools**:
- **Node.js Inspector**: `--inspect` flag
- **Clinic.js**: Performance diagnostics
- **0x**: Flamegraph generation
- **Vitest Benchmarks**: Dexpack lookup performance

---

## Section 5: Error Handling

### 5.1 Error Boundaries

*(Content to be consolidated from `error-system/error-boundaries-implementation.md` in Phase 3 Week 7)*

**Placeholder**: Error boundary implementation patterns, domain-specific handlers, graceful degradation.

**Error Handler Layers**:
- `src/bot/bot-error-handler.ts` — Discord API errors, rate limits, timeouts
- `src/core/engine-error-handler.ts` — Battle/encounter engine errors
- `src/workers/worker-error-handler.ts` — Background job failures
- All integrate with `ErrorTracker` (`src/services/error-tracker.ts`)

**Stuckness Detection**:
- No artifact/state change in 3 consecutive steps
- Same error string ≥2 times in 10 minutes
- Budget exceeded (time > 15m or tokens > threshold)

**Recovery**: Shrink scope → Swap strategy → Reset context → Escalate via `playbooks/escalate.md`

---

## Section 6: Console Tooling

### 6.1 Output Standards

*(Content to be consolidated from `console-output/console-output-standards.md` in Phase 3 Week 7)*

**Placeholder**: Console output standardization, centralized `output-formatter.ts`, consistent formatting across 11+ scripts.

**API**:
```typescript
import { printSection, printKeyValue, printSuccess } from "../src/utils/output-formatter.js";

printSection("Database Migration");
printKeyValue("Status", "Complete");
printSuccess("Migration applied successfully");
```

**Benefits**:
- Consistent formatting across scripts
- ESLint enforcement (`scripts-prefer-output-formatter` rule)
- 61 comprehensive tests
- ASCII-safe (no Unicode box drawing in Windows terminals)

### 6.2 Quick Reference

*(Content to be consolidated from `console-output/console-output-quick-reference.md` in Phase 3 Week 7)*

**Placeholder**: Console output quick reference, common patterns, formatting examples.

---

## Section 7: Utilities

### 7.1 DateTime Helpers

*(Content to be consolidated from `datetime-utilities.md` in Phase 3 Week 7)*

**Placeholder**: DateTime utility documentation, timezone handling, formatting functions, parsing utilities.

### 7.2 Timezone Standardization

*(Content to be consolidated from `timezone-standardization-guide.md` in Phase 3 Week 7)*

**Placeholder**: Timezone standardization guide, UTC-first approach, conversion best practices, DST handling.

### 7.3 Implementation Guides

*(Content to be consolidated from `specs/DM-ADMIN-IMPLEMENTATION-GUIDE.md` in Phase 3 Week 7)*

**Placeholder**: Admin implementation patterns, command structure, access control, validation patterns.

---

**Estimated Size**: ~1500 lines (after Phase 3 consolidation)  
**Source Files**: 12 documents consolidated  
**Last Updated**: 2025-11-16 (template created)  
**Status**: Template ready for Phase 3 Week 7 consolidation
