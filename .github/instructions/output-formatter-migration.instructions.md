---
applyTo: 'scripts/**'
---

# Output Formatter Migration — AI Agent Instruction Manual

**Mission:** Migrate all raw `console.*` calls in operational scripts to the unified `output-formatter` system for operator-friendly, standardized CLI output.

**Status:** Phase 2 COMPLETE (20+ files, ~200+ calls migrated) — Phase 3 (optional archive cleanup) available

**Priority:** UX/Visual Simplification (Role 0 - HIGHEST PRIORITY)

---

## 🎯 OBJECTIVE

Replace raw `console.log/info/warn/error` calls with `output-formatter` functions to provide:
- **Color-coded status messages** (green success, red errors, yellow warnings, cyan info)
- **Structured output** (consistent headers, key-value lists, formatted tables)
- **Operator-friendly UX** (clean, professional, scannable terminal output)
- **Maintainable patterns** (centralized formatting rules, easy to update styling)

---

## 📋 PRE-FLIGHT CHECKLIST

Before starting ANY migration work:

```powershell
# 1. Verify output-formatter system is intact
npm run build 2>&1 | Select-String -Pattern "error"

# 2. Check current status
grep -r "console\." --include="*.ts" scripts/ | wc -l  # Total remaining
grep -r "eslint-disable.*no-console" --include="*.ts" scripts/ | wc -l  # eslint comments

# 3. Review existing patterns
grep -r "formatSectionHeader\|formatKeyValueList\|printSuccess" --include="*.ts" scripts/ | wc -l
```

If build fails, STOP and investigate before proceeding.

---

## 🔄 THE CONVERSION PATTERN

### Core Functions (src/utils/output-formatter.ts)

| Function | Purpose | Example Output |
|----------|---------|----------------|
| `formatSectionHeader(text)` | Section dividers | `════════════════ Text ════════════════` |
| `formatKeyValueList(object, indent?)` | Key-value pairs | `  Key: Value` with alignment |
| `formatList(items, bullet?, indent?)` | Bulleted lists | `  • Item 1` |
| `printSuccess(message)` | Success messages | Green text with status |
| `printError(message, error?)` | Error messages | Red text with optional error details |
| `printWarning(message)` | Warning messages | Yellow text with status |
| `printInfo(message)` | Info messages | Cyan text with status |

### Conversion Patterns

#### Pattern 1: Simple Status Messages

```typescript
// ❌ BEFORE
console.log('✅ Operation completed successfully');
console.error('❌ Operation failed');
console.warn('⚠️  Warning: Check this');

// ✅ AFTER
printSuccess('Operation completed successfully');
printError('Operation failed');
printWarning('Warning: Check this');
```

#### Pattern 2: Section Headers

```typescript
// ❌ BEFORE
console.log('\n════════════════════════════════════════');
console.log('           Section Title                 ');
console.log('════════════════════════════════════════\n');

// ✅ AFTER
console.log(formatSectionHeader('Section Title'));
```

#### Pattern 3: Key-Value Output

```typescript
// ❌ BEFORE
console.log(`Status: ${status}`);
console.log(`Records: ${count}`);
console.log(`Duration: ${duration}ms`);

// ✅ AFTER
console.log(formatKeyValueList({
  Status: status,
  Records: count,
  Duration: `${duration}ms`
}));
```

#### Pattern 4: Lists

```typescript
// ❌ BEFORE
items.forEach(item => console.log(`  - ${item}`));

// ✅ AFTER
console.log(formatList(items, '•'));
```

#### Pattern 5: Error Handling

```typescript
// ❌ BEFORE
console.error('Error occurred:', error.message);
console.error(error.stack);

// ✅ AFTER
printError('Error occurred', error);  // Handles message + stack automatically
```

---

## 🚫 WHAT NOT TO CONVERT

### Intentional Raw Console Usage (Leave As-Is)

1. **Library Primitives** (`scripts/lib/*.ts`)
   ```typescript
   // These files ARE the low-level output layer
   // scripts/lib/output.ts
   // scripts/lib/progress.ts
   // scripts/lib/cli.ts
   ```
   **Reason:** These are building blocks that other scripts use. They must use raw `console.*` to provide the foundation.

2. **Envelope System** (`src/observability/envelope/**`)
   ```typescript
   // Must use globalThis.console.* directly
   globalThis.console.log(JSON.stringify(envelope));
   ```
   **Reason:** The envelope system IS the logging output layer. It must bypass all abstractions.

3. **Demo/Showcase Files**
   ```typescript
   // scripts/demo-visual-status.ts
   // scripts/demo-infinity-console.ts
   ```
   **Reason:** These files demonstrate console output patterns. They intentionally show raw usage.

4. **Archive Scripts** (`scripts/archive/**`)
   ```typescript
   // scripts/archive/*.ts
   ```
   **Reason:** Legacy one-time migration scripts. Not actively maintained. Low priority.

5. **Valid Formatted Patterns** (Already Using output-formatter)
   ```typescript
   // ✅ This pattern is CORRECT - do not change
   console.log(formatSectionHeader('Title'));
   console.log(formatKeyValueList({...}));
   ```
   **Reason:** Already using output-formatter through console.log wrapper. This is the target pattern.

6. **Documentation Examples** (Comments in src/)
   ```typescript
   // Example: console.log('Debug output');  // ← In comments only
   ```
   **Reason:** Documentation examples showing how to use console. Not actual code.

---

## 📁 FILE MIGRATION WORKFLOW

### Step 1: Select Target File

**Priority Order:**
1. ✅ **Phase 1 COMPLETE:** `scripts/db-admin.ts` (database admin CLI)
2. ✅ **Phase 2 COMPLETE:** Operational scripts (security, dex, ops, build)
3. ⏳ **Phase 3 (Optional):** Archive scripts (low priority)

**Selection Criteria:**
- File is actively used (not in `archive/`)
- File is not a library primitive (`lib/*.ts`)
- File is not a demo/showcase script
- File has 5+ console calls worth converting

### Step 2: Analyze Console Usage

```powershell
# Count console calls in file
grep -c "console\." scripts/path/to/file.ts

# Preview the calls
grep -n "console\." scripts/path/to/file.ts
```

### Step 3: Add Import (Top of File)

```typescript
import { 
  formatSectionHeader, 
  formatKeyValueList, 
  formatList,
  printSuccess, 
  printError, 
  printWarning, 
  printInfo 
} from '../utils/output-formatter.js';
```

**Path Calculation:**
- From `scripts/` → `../utils/output-formatter.js`
- From `scripts/security/` → `../../utils/output-formatter.js`
- From `scripts/dex/` → `../../utils/output-formatter.js`

### Step 4: Convert Each Console Call

Use the conversion patterns above. Common transformations:

| Old Pattern | New Pattern |
|-------------|-------------|
| `console.log('✅ ...')` | `printSuccess('...')` |
| `console.error('❌ ...')` | `printError('...')` |
| `console.warn('⚠️ ...')` | `printWarning('...')` |
| `console.log('ℹ️ ...')` | `printInfo('...')` |
| Box-drawing headers | `console.log(formatSectionHeader('...'))` |
| `console.log(\`Key: ${val}\`)` | `console.log(formatKeyValueList({ Key: val }))` |
| Manual list loops | `console.log(formatList(items))` |

### Step 5: Remove eslint-disable Comments

```typescript
// ❌ DELETE these after conversion:
/* eslint-disable no-console */
// eslint-disable-next-line no-console
```

**Reason:** Once using output-formatter, these comments are obsolete.

### Step 6: Verify Build

```powershell
npx tsc --noEmit 2>&1 | Select-String -Pattern "error"
```

If errors appear, fix them before committing.

### Step 7: Commit Changes

```powershell
git add scripts/path/to/file.ts
git commit -m "refactor(scripts): Convert file.ts to output-formatter patterns

- Replace X console.* calls with output-formatter functions
- Remove eslint-disable no-console comments
- Standardize section headers and status messages

Part of UX/Visual Simplification (Role 0)"

git push origin main
```

---

## 🔍 SPECIAL CASES

### Refactoring Custom Log Functions

Some files have custom logging wrappers:

```typescript
// ❌ BEFORE: Custom log function with emoji prefixes
function log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  const prefix = level === 'info' ? 'ℹ️' : level === 'warn' ? '⚠️' : '❌';
  console.log(`${prefix} ${message}`);
}

log('Starting operation', 'info');
log('Warning detected', 'warn');
log('Error occurred', 'error');

// ✅ AFTER: Delegate to output-formatter
function log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  if (level === 'info') printInfo(message);
  else if (level === 'warn') printWarning(message);
  else printError(message);
}

// Or better yet, replace all log() calls directly with print* functions
printInfo('Starting operation');
printWarning('Warning detected');
printError('Error occurred');
```

### console.table() Replacement

```typescript
// ❌ BEFORE
console.table(data);

// ✅ AFTER
console.log(formatKeyValueList(data));
// Or for arrays:
console.log(formatList(data.map(item => `${item.key}: ${item.value}`)));
```

### Conditional Logging

```typescript
// ❌ BEFORE
if (verbose) console.log('Debug details:', data);

// ✅ AFTER
if (verbose) printInfo(`Debug details: ${JSON.stringify(data, null, 2)}`);
```

### Multi-line Output

```typescript
// ❌ BEFORE
console.log('Line 1');
console.log('Line 2');
console.log('Line 3');

// ✅ AFTER (if related content)
printInfo('Line 1\nLine 2\nLine 3');

// ✅ AFTER (if separate messages)
printInfo('Line 1');
printInfo('Line 2');
printInfo('Line 3');
```

---

## ✅ VERIFICATION PROTOCOL

After EVERY file migration:

### 1. Build Check
```powershell
npm run build 2>&1 | Select-String -Pattern "error"
# Should return empty (no errors)
```

### 2. Manual Test (If Applicable)
```powershell
# Run the converted script to verify output looks good
node dist/scripts/converted-file.js
```

### 3. Diff Review
```powershell
git diff scripts/path/to/file.ts
```

**Verify:**
- ✅ Import added at top
- ✅ All console.* calls converted (except valid patterns)
- ✅ eslint-disable comments removed
- ✅ No accidental deletions
- ✅ Logic unchanged (only output format changed)

### 4. Metric Accuracy
```powershell
# Count conversions
git diff --cached | grep -c "printSuccess\|printError\|printWarning\|printInfo\|formatSection"

# Should match expected conversion count
```

---

## 📊 PROGRESS TRACKING

### Update After Each Session

Track progress in commit messages and session notes:

```markdown
## Session YYYY-MM-DD — Output Formatter Migration

**Files Converted:** X
**Console Calls Converted:** ~Y
**Commits:** Z

### Completed:
- ✅ `scripts/path/file1.ts` — N calls
- ✅ `scripts/path/file2.ts` — M calls

### Next Priority:
- ⏳ `scripts/path/file3.ts` — Estimated P calls

### Metrics:
- eslint-disable comments: Before → After
- Formatted patterns: Before → After
```

---

## 🚨 FAILURE RECOVERY

### Build Fails After Migration

**Common Issues:**

1. **Import Path Wrong**
   ```typescript
   // ❌ Wrong
   import { printSuccess } from '../output-formatter.js';
   
   // ✅ Correct
   import { printSuccess } from '../utils/output-formatter.js';
   ```

2. **Missing Import**
   ```typescript
   // Error: printSuccess is not defined
   // Solution: Add to import statement
   import { printSuccess } from '../utils/output-formatter.js';
   ```

3. **Function Call Typo**
   ```typescript
   // ❌ Typo
   printSucess('Done');  // Missing 'c'
   
   // ✅ Correct
   printSuccess('Done');
   ```

### Rollback Procedure

If migration introduces issues:

```powershell
# Revert changes
git checkout HEAD -- scripts/path/to/file.ts

# Verify build passes
npm run build

# Document issue in Tasklist.md for investigation
```

---

## 🎯 COMPLETION CRITERIA

Migration is COMPLETE when:

1. **Zero raw console.* in operational scripts** (excluding intentional usage)
2. **Zero eslint-disable no-console comments** in operational scripts
3. **All builds pass** with zero errors
4. **Visual testing** confirms operator-friendly output
5. **All changes committed** with clear commit messages

---

## 📁 FILE REFERENCE

### Already Converted (Phase 1 & 2) ✅

**Database Admin:**
- `scripts/db-admin.ts` — Main database CLI

**Security Scripts:**
- `scripts/security/migrate-security-state.ts`
- `scripts/security/rollback-security-migration.ts`
- `scripts/security/migrate-security-state-direct-pg.ts`
- `scripts/test-security-insert.ts`
- `scripts/check-security-counts.ts`

**Dex Scripts:**
- `scripts/dex/seed-reference.ts`
- `scripts/dex/backfill-species.ts`
- `scripts/dex/warm-cache.ts`
- `scripts/build-dexpack.ts`

**Ops Scripts:**
- `scripts/ops/simulate-flag-rollout.ts`
- `scripts/ops/dex-v2-backup.ts`

**Utility Scripts:**
- `scripts/generate-pg-types.ts`
- `scripts/check-prisma-findmany.ts`
- `scripts/register-commands.ts`

### Intentional Raw Console (Do Not Convert) 🔒

**Library Primitives:**
- `scripts/lib/output.ts` — Low-level output functions
- `scripts/lib/progress.ts` — Progress bars
- `scripts/lib/cli.ts` — CLI framework
- `scripts/lib/errors.ts` — Error handling
- `scripts/lib/exec.ts` — Command execution

**Envelope System:**
- `src/observability/envelope/**` — Logging output layer

**Demo/Showcase:**
- `scripts/demo-visual-status.ts`
- `scripts/demo-infinity-console.ts`

### Phase 3 (Optional) — Archive Scripts ⏳

Low priority, not actively maintained:
- `scripts/archive/*.ts` (multiple files)

---

## 📝 EXAMPLES OF COMPLETE MIGRATIONS

### Example 1: Simple Script (db-admin.ts excerpt)

**Before:**
```typescript
console.log('✅ Database connection successful');
console.error('❌ Connection failed:', error.message);
```

**After:**
```typescript
import { printSuccess, printError } from '../utils/output-formatter.js';

printSuccess('Database connection successful');
printError('Connection failed', error);
```

### Example 2: Script with Headers (migrate-security-state.ts excerpt)

**Before:**
```typescript
console.log('\n════════════════════════════════════════');
console.log('        Phase 1: Load File State        ');
console.log('════════════════════════════════════════\n');

console.log(`Files found: ${files.length}`);
console.log(`Total size: ${totalSize} bytes`);
```

**After:**
```typescript
import { formatSectionHeader, formatKeyValueList, printInfo } from '../../utils/output-formatter.js';

console.log(formatSectionHeader('Phase 1: Load File State'));

console.log(formatKeyValueList({
  'Files found': files.length,
  'Total size': `${totalSize} bytes`
}));
```

### Example 3: Custom Log Function (migrate-security-state-direct-pg.ts excerpt)

**Before:**
```typescript
function log(message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info') {
  const emoji = { info: 'ℹ️', warn: '⚠️', error: '❌', success: '✅' };
  console.log(`${emoji[level]} ${message}`);
}

log('Starting migration', 'info');
log('Warning detected', 'warn');
log('Migration complete', 'success');
```

**After:**
```typescript
import { printInfo, printWarning, printSuccess, printError } from '../../utils/output-formatter.js';

function log(message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info') {
  if (level === 'info') printInfo(message);
  else if (level === 'warn') printWarning(message);
  else if (level === 'success') printSuccess(message);
  else printError(message);
}

// Or better: replace all log() calls directly
printInfo('Starting migration');
printWarning('Warning detected');
printSuccess('Migration complete');
```

---

## 🎉 SUCCESS INDICATORS

You'll know the migration is working when:

1. **Terminal output is easier to scan** — Color-coded status messages jump out
2. **Operators report improved UX** — Professional, polished CLI experience
3. **Code is more maintainable** — Centralized formatting rules, no repeated ASCII art
4. **Build stays green** — No TypeScript or linting errors
5. **eslint-disable comments drop** — From 70+ to <10 (only intentional usage)

---

## 📞 TROUBLESHOOTING

### "Cannot find module 'output-formatter'"

**Solution:** Check import path relative to file location:
```typescript
// From scripts/file.ts
import { ... } from '../utils/output-formatter.js';

// From scripts/subfolder/file.ts  
import { ... } from '../../utils/output-formatter.js';
```

### "Build passes but output looks wrong"

**Solution:** Test the actual script:
```powershell
node dist/scripts/your-script.js
```

Check if formatters are being called correctly.

### "Git diff shows unexpected changes"

**Solution:** Review each change carefully:
```powershell
git diff scripts/path/to/file.ts | less
```

Ensure only console calls and eslint comments changed, no logic alterations.

---

**Document Version:** 1.0
**Created:** 2025-12-28
**Purpose:** AI Agent guidance for output-formatter migration project
**Related:** `.github/copilot-instructions.md` (UX/Visual Simplification Role 0)
