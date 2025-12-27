# 📋 Phase 2.4: Scripts Envelope Migration — Evaluation & Completion

**Prompt this document to any AI agent to complete the scripts envelope migration.**

---

## 🎯 Mission

Evaluate remaining `scripts/` files and decide: **MIGRATE** (add envelope logging) or **SKIP** (user-facing output). Complete the envelope migration for all appropriate files.

## 📊 Context

| Phase | Status | Files | Envelope Calls Added |
|-------|--------|-------|---------------------|
| Phase 1 (src/) | ✅ COMPLETE | ~82 files | ~1,083 calls |
| Phase 2.1 Quick Wins | ✅ COMPLETE | 5 files | ~12 calls |
| Phase 2.2 Security | ✅ COMPLETE | 2 files | 18 calls |
| Phase 2.3 Ops | ✅ COMPLETE | 3 files | 15 calls |
| **Phase 2.4 Evaluation** | ✅ COMPLETE (2025-12-27) | 15 files | Audit points added (5 scripts) |

---

## 🔍 FILES REQUIRING EVALUATION

### Category A: Seed/Data Scripts (5 files)

| File | Console Calls | Likely Decision |
|------|---------------|-----------------|
| `scripts/seed-dex.ts` | 25 | 🔍 EVALUATE — seed progress output |
| `scripts/dex/seed-reference.ts` | 11 | 🔍 EVALUATE — data seeding |
| `scripts/dex/backfill-species.ts` | 10 | 🔍 EVALUATE — backfill operation |
| `scripts/dex/warm-cache.ts` | 9 | 🔍 EVALUATE — cache warming |
| `scripts/ops/dex-v2-backup.ts` | 6 | 🔍 EVALUATE — backup operation |

**Evaluation Questions:**
- Are console calls showing progress to user? → SKIP
- Are console calls debug/internal logging? → MIGRATE
- Is there error handling that should be audited? → MIGRATE errors only

### Category B: Build/Registration Scripts (3 files)

| File | Console Calls | Likely Decision |
|------|---------------|-----------------|
| `scripts/register-commands.ts` | 12 | 🔍 EVALUATE — Discord command registration |
| `scripts/build-dexpack.ts` | 6 | 🔍 EVALUATE — asset building |
| `scripts/generate-dependency-graph.ts` | 3 | ❌ SKIP — output is the feature |

### Category C: Analysis/Guard Scripts (4 files)

| File | Console Calls | Likely Decision |
|------|---------------|-----------------|
| `scripts/check-dead-code.ts` | 35 | 🔍 EVALUATE — analysis output |
| `scripts/guard-db-migrations.mjs` | 31 | 🔍 EVALUATE — guard output |
| `scripts/test-pool-behavior.ts` | 30 | ❌ SKIP — test output |
| `scripts/db-admin.ts` | 121 | 🔍 EVALUATE — uses output-formatter |

### Category D: Measurement Scripts (3 files)

| File | Console Calls | Likely Decision |
|------|---------------|-----------------|
| `scripts/measure-memory.mjs` | 66 | ❌ SKIP — metrics output is feature |
| `scripts/measure-startup-time.mjs` | 63 | ❌ SKIP — metrics output is feature |
| `scripts/memory-snapshot.mjs` | 41 | ❌ SKIP — diagnostic output |

---

## 🚦 DECISION FRAMEWORK

### ❌ DO NOT MIGRATE (Skip These Patterns)

```typescript
// 1. User-facing progress/status
console.log('✅ Seeding complete');
console.log(`Processing ${i}/${total}...`);

// 2. Data output (the console IS the output)
console.log(JSON.stringify(result, null, 2));
console.table(data);

// 3. Help/usage text
console.log('Usage: script [options]');

// 4. Validation results shown to user
console.log('✅ All checks passed');
console.error('❌ Validation failed');

// 5. Using scripts/lib/output.ts already
printSuccess('Done');
printTable(results);

// 6. Metrics/measurement output
console.log(`Memory: ${used} MB`);
console.log(`Time: ${elapsed}ms`);
```

### ⚠️ DO MIGRATE (Convert These Patterns)

```typescript
// 1. Tagged debug output
console.log('[ScriptName] Internal debug:', data);
console.log('[DEBUG]', info);

// 2. Internal error logging (not user-facing errors)
console.error('[ScriptName] Internal error:', err);

// 3. Audit-worthy events
console.log('[ScriptName] Starting operation...');
console.log('[ScriptName] Operation completed');

// 4. Verbose/debug mode output
if (options.verbose) console.log('Details:', info);
if (DEBUG) console.log('Debug:', data);
```

### 🎯 HYBRID APPROACH (Most Common)

For most scripts, apply the hybrid pattern:
1. **KEEP** user-facing console output (progress, results, errors shown to user)
2. **ADD** envelope logging for audit trail (start, complete, errors)

```typescript
// HYBRID EXAMPLE
import { scopedLogger } from '../src/observability/envelope/console.js';
const log = scopedLogger('seed-dex');

async function main() {
  log.info('seed', 'Starting dex seed', { targetCount: 1000 });
  
  for (const pokemon of data) {
    // Keep user-facing progress
    console.log(`Seeding ${pokemon.name}...`);
    await seed(pokemon);
  }
  
  log.info('complete', 'Dex seed complete', { seeded: count });
  console.log('✅ Seeding complete!');  // Keep user output
}

main().catch((err) => {
  log.error('seed', 'Seed failed', { error: err.message });
  console.error('❌ Seed failed:', err.message);  // Keep user error
  process.exit(1);
});
```

---

## 📦 IMPORT PATHS

```typescript
// From scripts/*.ts (root level)
import { scopedLogger } from '../src/observability/envelope/console.js';

// From scripts/dex/*.ts
import { scopedLogger } from '../../src/observability/envelope/console.js';

// From scripts/ops/*.ts
import { scopedLogger } from '../../src/observability/envelope/console.js';

// From scripts/security/*.ts
import { scopedLogger } from '../../src/observability/envelope/console.js';
```

---

## 🔧 MIGRATION PATTERN

### Step 1: Add Import + Logger
```typescript
import { scopedLogger } from '../src/observability/envelope/console.js';

/** Scoped logger for {script-purpose} */
const log = scopedLogger('script-name');
```

### Step 2: Add Audit Points (Minimum 3)
```typescript
// At start of main operation
log.info('operation', 'Starting {operation}', { key: value });

// At successful completion
log.info('complete', '{Operation} complete', { results: summary });

// At error handling
log.error('operation', '{Operation} failed', { error: err.message });
```

### Step 3: Preserve User Output
```typescript
// Keep these as-is (user-facing)
console.log('✅ Operation complete');
console.log(`Processed ${count} items`);
console.error('❌ Failed:', err.message);
```

### Step 4: Remove ESLint Disable (If Present)
```typescript
// DELETE this line if found
/* eslint-disable no-console */
```

---

## 📋 EVALUATION WORKFLOW

For each file in Categories A-C:

### 1. Scan the File
```powershell
# Count console calls
Select-String -Path "scripts/{file}.ts" -Pattern "console\." | Measure-Object

# Find tagged debug patterns
Select-String -Path "scripts/{file}.ts" -Pattern "console\..*\["

# Check for existing eslint-disable
Select-String -Path "scripts/{file}.ts" -Pattern "eslint-disable"
```

### 2. Make Decision
- **If >50% user-facing output** → Add minimal audit logging (start/complete/error)
- **If >50% debug/internal** → Full migration
- **If pure output tool** → SKIP entirely

### 3. Apply Migration (If Decided)
- Add import + logger
- Add 3-5 audit points (start, phases, complete, error)
- Keep ALL user-facing console output
- Remove eslint-disable if present

### 4. Verify
```powershell
# Build check
npm run build 2>&1 | Select-String -Pattern "error"

# Test script runs (if applicable)
npx tsx scripts/{file}.ts --help
```

---

## ✅ FINAL DECISIONS (COMPLETE)

### MIGRATED (Audit Logging Added)
| File | Reason |
|------|--------|
| `scripts/seed-dex.ts` | Database seeding needs audit trail |
| `scripts/dex/seed-reference.ts` | Reference seeding should be audited |
| `scripts/dex/backfill-species.ts` | Backfill operations need audit trail |
| `scripts/register-commands.ts` | Discord API registration should be audited |
| `scripts/build-dexpack.ts` | Build operations should be audited |

### SKIPPED (User-Facing Output Preserved)
| File | Reason |
|------|--------|
| `scripts/dex/warm-cache.ts` | Progress output is the feature |
| `scripts/ops/dex-v2-backup.ts` | Backup status output is operator-facing |
| `scripts/check-dead-code.ts` | Analysis output is the feature |
| `scripts/guard-db-migrations.mjs` | Guard output is the feature |
| `scripts/test-pool-behavior.ts` | Test output is the feature |
| `scripts/db-admin.ts` | Uses output-formatter for CLI output |
| `scripts/generate-dependency-graph.ts` | Graph output is the feature |
| `scripts/measure-memory.mjs` | Metrics output is the feature |
| `scripts/measure-startup-time.mjs` | Metrics output is the feature |
| `scripts/memory-snapshot.mjs` | Diagnostic output is the feature |

---

## 🎯 SUCCESS CRITERIA

- [x] All Category A-C files evaluated
- [x] ~5-8 files migrated with audit logging (5 migrated)
- [x] ~7-10 files confirmed as SKIP (10 skipped)
- [ ] Build passes after all changes
- [x] `docs/projects/SCRIPTS-ENVELOPE-MIGRATION.md` updated with final status
- [ ] No remaining `[TagName]` debug patterns in migrated files

---

## 📊 FINAL REPORT TEMPLATE

Phase 2.4 completion recorded in `docs/projects/SCRIPTS-ENVELOPE-MIGRATION.md`.

---

## 🔗 RELATED DOCUMENTS

- `docs/projects/SCRIPTS-ENVELOPE-MIGRATION.md` — Master tracking document
- `docs/projects/SECURITY-SCRIPTS-ENVELOPE-MIGRATION.md` — Phase 2.2 reference
- `docs/projects/ENVELOPE-MIGRATION-COMPLETE.md` — Phase 1 completion report
- `.github/instructions/envelope-migration.instructions.md` — Migration patterns

---

## 💡 QUICK START FOR AI AGENT

```powershell
# 1. Navigate to workspace
cd "c:\Users\sherb\OneDrive\Documents\GitHub\Infinity-Gauntlet"

# 2. Review a file
Get-Content scripts/seed-dex.ts | Select-Object -First 50

# 3. Count console patterns
Select-String -Path "scripts/seed-dex.ts" -Pattern "console\." | Measure-Object

# 4. After migration, verify build
npm run build 2>&1 | Select-String -Pattern "error"
```

**Start with:** `scripts/seed-dex.ts` (25 calls, clear audit value)

---

**Document Version:** 1.0
**Created:** 2025-12-27
**Purpose:** AI Agent guidance for Phase 2.4 scripts envelope migration completion
