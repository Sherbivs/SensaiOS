# Logging Audit Results

**Audit Date:** 2025-12-26  
**Auditor:** AI Agent  
**Scope:** `src/**/*.ts`, `src/**/*.js`

---

## Summary Statistics

| Metric | Count | Status |
|--------|-------|--------|
| `console.log/warn/error/debug` calls | **221** | 🔴 Needs migration |
| Legacy logger imports | **27** | 🔴 Needs migration |
| `try/catch` blocks | **624** | 🟡 Need error capture audit |
| Entry points with Kernel-first | **1/3** | 🟡 Partial compliance |

---

## Entry Point Analysis

### ✅ src/index.ts (COMPLIANT)
```typescript
// KERNEL BOOTSTRAP — MUST BE FIRST
import BootKernel from './kernel/boot-kernel.js';
```
**Status:** Kernel is first import. ✅

### ❌ src/bot/index.ts (NON-COMPLIANT)
```typescript
// === CRITICAL: Logger & Error Handling MUST be first imports ===
import { getLogger } from "../shared/logging/index.js";
```
**Status:** Uses legacy logger, not Kernel. Needs migration.

### ⚠️ src/worker/*.ts (NOT AUDITED)
Worker entry points not found in expected location.

---

## Top Files by console.log Usage

| Count | File | Priority |
|-------|------|----------|
| 97 | `src/cli/ai-log-query.ts` | LOW (CLI tool, console expected) |
| 11 | `src/services/ai/ai-log-integrations.ts` | MEDIUM |
| 8 | `src/utils/logger.ts` | HIGH (logging utility) |
| 7 | `src/services/ai/ai-log-analyzer.ts` | MEDIUM |
| 4 | `src/services/player-resolver.ts` | HIGH |
| 4 | `src/shared/logging/loki-transport.ts` | HIGH (logging infra) |
| 3 | `src/services/discord-identity.ts` | HIGH |
| 3 | `src/shared/logging/log-sampler.ts` | HIGH (logging infra) |
| 3 | `src/shared/logger.ts` | HIGH (logging utility) |
| 2 | `src/shared/logging/index.ts` | HIGH (logging infra) |
| 2 | `src/shared/log.ts` | HIGH (logging utility) |
| 2 | `src/bot/security/services/immutable-audit-service.ts` | HIGH |
| 2 | `src/core/starter-validation.ts` | MEDIUM |
| 2 | `src/bot/main.ts` | HIGH (bot entry) |
| 2 | `src/services/ai/ai-log-writer.ts` | MEDIUM |

---

## Legacy Logging Systems Identified

### 1. `src/shared/logging/` (27 files use this)
- `index.ts` — Main export
- `loki-transport.ts` — Loki integration
- `log-sampler.ts` — Sampling logic

### 2. `src/utils/logger.ts`
- Standalone logger utility

### 3. `src/shared/logger.ts`
- Another logging utility

### 4. `src/shared/log.ts`
- Simple log wrapper

---

## Migration Priority

### Phase 1: High Priority (Core Infrastructure)
1. `src/bot/index.ts` — Make Kernel-first
2. `src/shared/logging/` — Integrate with Kernel or deprecate
3. `src/utils/logger.ts` — Migrate to Kernel
4. `src/shared/logger.ts` — Migrate to Kernel
5. `src/shared/log.ts` — Migrate to Kernel

### Phase 2: Medium Priority (Services)
1. `src/services/ai/` — AI logging services
2. `src/services/player-resolver.ts`
3. `src/services/discord-identity.ts`
4. `src/bot/main.ts`

### Phase 3: Low Priority (CLI/Tools)
1. `src/cli/ai-log-query.ts` — CLI tool, console is appropriate
2. Other CLI tools

---

## Recommended Actions

### Immediate (This Week)
1. ✅ Create Kernel-First Logging Initiative project doc
2. ⏳ Update `src/bot/index.ts` to use Kernel first
3. ⏳ Create migration wrapper for legacy loggers

### Short-Term (2 Weeks)
1. Add output plugin system to Kernel
2. Create Loki output for Kernel
3. Deprecate `src/shared/logging/` in favor of Kernel

### Medium-Term (1 Month)
1. Migrate all 221 console.log calls
2. Migrate all 27 legacy logger imports
3. Audit all 624 catch blocks for error capture

---

## Audit Commands (Re-run as needed)

```powershell
# Count console usage
Get-ChildItem -Recurse -Include *.ts,*.js src/ | Select-String "console\.(log|warn|error|debug)" | Measure-Object

# Find legacy logger imports
Get-ChildItem -Recurse -Include *.ts,*.js src/ | Select-String "from.*logger" | Measure-Object

# Find files by console.log count
Get-ChildItem -Recurse -Include *.ts,*.js src/ | Select-String "console\.log" | Group-Object Path | Sort-Object Count -Descending | Select-Object -First 20
```

---

**Next Step:** Schedule Meeting #1 to review this audit and assign migration tasks.
