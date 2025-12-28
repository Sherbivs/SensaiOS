# CLI Visual Output Audit — Observability UX Project

**Date:** 2025-12-28  
**Project:** Observability Visual Simplification (Role 0 - HIGHEST PRIORITY)  
**Audit Scope:** All console output calls across src/ and scripts/  
**Goal:** Convert 1,058 raw console calls to operator-friendly formats

---

## 📊 Summary Statistics

| Metric | Count | Status |
|--------|-------|--------|
| **Total Raw Console Calls** | 1,058 | 🔴 Needs Conversion |
| **Files Using output-formatter** | 15 | ✅ Good Examples |
| **Conversion Progress** | 0% | 🟡 Starting |
| **Target Completion** | 95%+ | 🎯 Goal |

---

## 🎯 Priority Conversion Targets

### Tier 1: HIGH TRAFFIC (User-Facing Scripts)
These scripts are run by operators regularly and need immediate conversion:

| File | Console Calls | Priority | Notes |
|------|---------------|----------|-------|
| `scripts/db-admin.ts` | 120 | 🔴 CRITICAL | Main DB admin tool - highest visibility |
| `scripts/ops/bootstrap-onpremise-experiment.ts` | 56 | 🔴 CRITICAL | Database setup operations |
| `scripts/validate-database-urls.ts` | 32 | 🔴 CRITICAL | Connection validation |
| `scripts/seed-dex.ts` | 25 | 🟡 HIGH | Data pipeline operations |
| `scripts/db/cli.ts` | 23 | 🟢 DONE | Already uses output-formatter (47 calls) |

**Tier 1 Total:** ~256 calls (24% of total)

### Tier 2: MODERATE TRAFFIC (Operational Scripts)
Scripts used during maintenance and troubleshooting:

| File | Console Calls | Priority | Notes |
|------|---------------|----------|-------|
| `scripts/check-dead-code.ts` | 35 | 🟡 HIGH | Code quality operations |
| `scripts/demo-infinity-console.ts` | 30 | 🟡 HIGH | Demo/testing tool |
| `scripts/test-pool-behavior.ts` | 30 | 🟡 HIGH | Connection testing |
| `scripts/security/rollback-security-migration.ts` | 44 | 🟡 HIGH | Security operations |
| `scripts/security/migrate-security-state.ts` | 44 | 🟡 HIGH | Security migrations |

**Tier 2 Total:** ~183 calls (17% of total)

### Tier 3: ARCHIVE/LOW PRIORITY
One-time migration scripts and archived code:

| File | Console Calls | Priority | Notes |
|------|---------------|----------|-------|
| `scripts/archive/one-time-migrations/init-driptvdd-test.ts` | 69 | ⚪ LOW | Archive - ran once |
| `scripts/archive/one-time-migrations/migrate-logs-to-database.ts` | 46 | ⚪ LOW | Archive - completed |
| `scripts/archive/logging-migration/migrate-deprecated-log.ts` | 28 | ⚪ LOW | Archive - historical |
| `scripts/archive/one-time-migrations/force-create-homestead.ts` | 28 | ⚪ LOW | Archive - one-time |

**Tier 3 Total:** ~171 calls (16% of total) — SKIP UNLESS TIME PERMITS

### Tier 4: CORE APPLICATION (src/)
Runtime application code - requires careful conversion:

| File | Console Calls | Priority | Notes |
|------|---------------|----------|-------|
| `src/observability/envelope/migrate.ts` | 26 | 🟡 MEDIUM | Logging infrastructure |
| Other src/ files | ~448 | 🟡 MEDIUM | Requires case-by-case review |

**Tier 4 Total:** ~474 calls (45% of total)

---

## ✅ Already Converted (Examples to Follow)

These files demonstrate **CORRECT** usage of output-formatter patterns:

| File | Formatted Calls | Pattern Quality |
|------|-----------------|-----------------|
| `scripts/data/cli.ts` | 67 | ⭐⭐⭐⭐⭐ Excellent |
| `scripts/ops/cli.ts` | 58 | ⭐⭐⭐⭐⭐ Excellent |
| `scripts/docker/cli.ts` | 51 | ⭐⭐⭐⭐⭐ Excellent |
| `scripts/db/cli.ts` | 47 | ⭐⭐⭐⭐⭐ Excellent |
| `scripts/render/cli.ts` | 35 | ⭐⭐⭐⭐⭐ Excellent |
| `scripts/observe/logs.ts` | 25 | ⭐⭐⭐⭐⭐ Excellent |
| `scripts/diagnose/cli.ts` | 24 | ⭐⭐⭐⭐⭐ Excellent |

**Total Converted:** 15 files, ~307 formatted calls

---

## 🔄 Conversion Strategy

### Phase 1: Quick Wins (Tier 1 - 1-2 days)
Convert highest-traffic user-facing scripts:
- ✅ `scripts/db/cli.ts` — Already done (example)
- 🔄 `scripts/db-admin.ts` — 120 calls (NEXT TARGET)
- 🔄 `scripts/ops/bootstrap-onpremise-experiment.ts` — 56 calls
- 🔄 `scripts/validate-database-urls.ts` — 32 calls
- 🔄 `scripts/seed-dex.ts` — 25 calls

**Phase 1 Target:** Convert 256 calls (24% of total)

### Phase 2: Operational Scripts (Tier 2 - 2-3 days)
Convert maintenance and troubleshooting scripts:
- 🔄 `scripts/check-dead-code.ts` — 35 calls
- 🔄 `scripts/demo-infinity-console.ts` — 30 calls
- 🔄 `scripts/security/*` — 88 calls (2 files)

**Phase 2 Target:** Convert 183 calls (17% of total)  
**Cumulative:** 439 calls (41% of total)

### Phase 3: Core Application (Tier 4 - 3-5 days)
Carefully convert runtime application code:
- 🔄 `src/observability/envelope/migrate.ts` — 26 calls
- 🔄 Other src/ files — Case-by-case review

**Phase 3 Target:** Convert 474 calls (45% of total)  
**Cumulative:** 913 calls (86% of total)

### Phase 4: Archive Cleanup (Optional)
Only if time permits, low priority:
- ⚪ Archive scripts — 171 calls (16% of total)

---

## 📋 Conversion Checklist (Per File)

For each file being converted, follow this process:

### Pre-Conversion
- [ ] Read file to understand purpose and output patterns
- [ ] Identify console.log patterns (info, status, errors, data dumps)
- [ ] Note any color coding or formatting already present
- [ ] Check if file imports output-formatter (may be partial conversion)

### During Conversion
- [ ] Add import: `import { printSection, printKeyValue, printSuccess, printError, printWarning } from '../utils/output-formatter.js';`
- [ ] Convert section headers: `console.log('=== Title ===')` → `printSection('Title')`
- [ ] Convert key-value pairs: `console.log('Key:', value)` → `printKeyValue('Key', value)`
- [ ] Convert success messages: `console.log('✅ Success')` → `printSuccess('Success')`
- [ ] Convert errors: `console.error('Error:', err)` → `printError('Error: ' + err.message)`
- [ ] Convert warnings: `console.warn('Warning')` → `printWarning('Warning')`
- [ ] Remove raw JSON dumps: `JSON.stringify(obj)` → Format with printKeyValue
- [ ] Add units to numbers: `123456` → `123.5 MB`, `0.234` → `23.4%`

### Post-Conversion
- [ ] Run script to verify output looks clean
- [ ] Check for any remaining console calls (except debug logging)
- [ ] Verify ASCII characters only (no Unicode box drawing)
- [ ] Test in Windows PowerShell terminal
- [ ] Update audit document with completion status
- [ ] Git commit with message: `ux(cli): Convert [filename] to output-formatter patterns`

---

## 🎨 Pattern Examples

### ❌ BEFORE (Raw Console Output)
```typescript
console.log('Starting database migration...');
console.log('Connection string:', DATABASE_URL);
console.log('Memory usage:', process.memoryUsage().rss, 'bytes');
console.log('Migration completed successfully!');
console.error('Error:', error.message);
console.log(JSON.stringify(results, null, 2));
```

### ✅ AFTER (Formatted Output)
```typescript
import { printSection, printKeyValue, printSuccess, printError } from '../utils/output-formatter.js';

printSection('Database Migration');
printKeyValue('Connection', DATABASE_URL.split('@')[1]); // Hide credentials
printKeyValue('Memory Usage', `${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB`);
printSuccess('Migration completed successfully');

if (error) {
  printError(`Migration failed: ${error.message}`);
}

printKeyValue('Rows Migrated', results.count);
printKeyValue('Duration', `${results.durationMs}ms`);
```

---

## 📈 Progress Tracking

### Week 1 (Dec 28 - Jan 3)
- [x] Audit completed (1,058 calls identified)
- [ ] Phase 1: Convert Tier 1 scripts (256 calls)
- [ ] Create visual-status.ts module
- [ ] Update 5 dashboard panels with plain English

### Week 2 (Jan 4 - Jan 10)
- [ ] Phase 2: Convert Tier 2 scripts (183 calls)
- [ ] Translate all 25 dashboard panels
- [ ] Create operator reading guide

### Week 3 (Jan 11 - Jan 17)
- [ ] Phase 3: Convert Tier 4 core app (474 calls)
- [ ] Test all conversions in production
- [ ] Document remaining unconverted calls

### Week 4 (Jan 18 - Jan 24)
- [ ] Polish and bug fixes
- [ ] Operator training/documentation
- [ ] Final audit and completion report

---

## 🎯 Success Criteria

Visual simplification is **COMPLETE** when:

✅ **Quantitative Goals:**
- [ ] ≥95% of console calls converted (1,005+ / 1,058)
- [ ] All Tier 1 scripts use output-formatter (100%)
- [ ] All Tier 2 scripts use output-formatter (100%)
- [ ] ≥90% of Tier 4 core app converted
- [ ] Zero raw JSON dumps in user-facing scripts
- [ ] All dashboard panels use plain English labels

✅ **Qualitative Goals:**
- [ ] Operator can understand all CLI outputs without technical knowledge
- [ ] Color coding makes status obvious at a glance
- [ ] Scripts produce clean, professional-looking output
- [ ] No more "legacy jumble" or wall-of-text logs
- [ ] Operator guide explains what all outputs mean

✅ **Operator Feedback:**
- [ ] "I can tell if something is wrong without asking devs" ✅
- [ ] "The outputs are clean and easy to read" ✅
- [ ] "I know what to do when I see yellow/red status" ✅

---

## 📚 Related Documents

- **Specialist Team Plan:** `docs/projects/observability/specialist-team-plan.md`
- **UX Simplification Guide:** `docs/projects/observability/ux-visual-simplification-guide.md`
- **Output Formatter Source:** `src/utils/output-formatter.ts` (474 lines, 61 tests)
- **Output Formatter Tests:** `tests/utils/output-formatter.spec.ts`
- **Example Conversions:** `scripts/db/cli.ts`, `scripts/ops/cli.ts`, `scripts/data/cli.ts`

---

**Next Action:** Begin Phase 1 conversion with `scripts/db-admin.ts` (120 calls - highest priority target)
