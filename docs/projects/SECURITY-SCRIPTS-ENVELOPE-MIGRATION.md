# 🔐 Security Scripts Envelope Migration — Phase 2.2

**Prompt this to any AI agent to begin work:**

---

## Mission

Migrate debug and error logging in security migration scripts to the envelope logging system. These scripts handle sensitive state migration operations and require structured logging for audit trails and debugging.

## Context

- **Phase 1:** ✅ COMPLETE — All `src/` files migrated (~82 files, ~1,083 calls)
- **Phase 2.1:** ✅ COMPLETE — Quick-win scripts migrated (5 files, 16 calls)
- **Phase 2.2:** ✅ COMPLETE (2025-12-27) — Security migration scripts (2 files, ~96 calls)

---

## 🎯 Target Files

### File 1: `scripts/security/migrate-security-state.ts`
**Console Calls:** 51  
**Purpose:** Migrates security bot state from file-based storage to PostgreSQL  
**Last Modified:** 2025-12-27 (Database-first architecture migration)

**Why Migrate:**
- Migration steps need structured logging for audit trail
- Debug output helps troubleshoot migration failures
- Error context is critical for rollback decisions

### File 2: `scripts/security/rollback-security-migration.ts`
**Console Calls:** 45  
**Purpose:** Rollback tool for security state migration  
**Last Modified:** 2025-12-27

**Why Migrate:**
- Rollback operations are high-risk and need detailed logging
- Error tracking is essential for recovery procedures
- Step-by-step logging helps identify rollback failure points

---

## 🔍 Decision Framework for Security Scripts

### ⚠️ MIGRATE These Patterns:

```typescript
// 1. Migration step logging
console.log('[Migrate] Starting phase 1: Read file state');
console.log('[Migrate] Phase 1 complete, processed X entries');

// 2. Error/exception logging
console.error('[Migrate] Failed to read state file:', err);
console.error('[Migrate] Database write failed:', err.message);

// 3. Debug output with context
console.log('[Migrate] Loaded state:', JSON.stringify(state, null, 2));
console.log('[Migrate] Verifying checksums...');

// 4. Validation failures
console.warn('[Migrate] HMAC validation failed for entry:', entryId);
console.warn('[Migrate] Skipping corrupted entry:', entryId);
```

### ✅ KEEP AS CONSOLE (User-Facing):

```typescript
// 1. Progress indicators for operators
console.log('Migration progress: 45/100 entries...');
console.log('✅ Migration complete: 100 entries migrated');

// 2. Confirmation prompts
console.log('Ready to migrate state. Press Y to continue...');

// 3. Summary reports
console.log('Migration Summary:');
console.log('  - Migrated: 98 entries');
console.log('  - Skipped: 2 entries (corrupted)');
console.log('  - Duration: 2.3s');

// 4. Critical warnings to operators
console.error('⚠️  WARNING: Found corrupted entries. Manual review required.');
console.error('❌ FAILED: Database connection lost. Rollback recommended.');
```

---

## Migration Pattern

### Before:
```typescript
/* eslint-disable no-console */

function migrateState() {
  console.log('[Migrate] Starting migration...');
  
  try {
    const state = loadFileState();
    console.log('[Migrate] Loaded state:', state.version);
    
    writeToDatabase(state);
    console.log('[Migrate] Database write complete');
  } catch (err) {
    console.error('[Migrate] Migration failed:', err.message);
    throw err;
  }
}
```

### After:
```typescript
import { scopedLogger } from '../../src/observability/envelope/console.js';

const log = scopedLogger('security.migrate-state');

function migrateState() {
  log.info('migrate', 'Starting migration...');
  
  try {
    const state = loadFileState();
    log.info('migrate', 'Loaded state', { version: state.version });
    
    writeToDatabase(state);
    log.info('migrate', 'Database write complete');
  } catch (err) {
    log.error('migrate', 'Migration failed', { 
      error: err.message,
      stack: err.stack 
    });
    throw err;
  }
}

// Keep user-facing progress output
console.log('✅ Migration complete: 100 entries migrated');
```

---

## Import Path

```typescript
// Both files are in scripts/security/
import { scopedLogger } from '../../src/observability/envelope/console.js';

// Create scoped logger
const log = scopedLogger('security.migrate-state');
// OR
const log = scopedLogger('security.rollback-migration');
```

---

## Pre-Migration Checklist

### 1. Understand the Scripts
```powershell
# Read migrate-security-state.ts to understand flow
code scripts/security/migrate-security-state.ts

# Read rollback script
code scripts/security/rollback-security-migration.ts
```

### 2. Identify Console Call Types
For each `console.*` call, determine:
- **Internal logging** (migration steps, debug) → MIGRATE
- **User-facing output** (progress, summary) → KEEP

### 3. Verify Tests Exist
```powershell
# Check for security migration tests
Get-ChildItem tests -Recurse -Filter "*security*migration*.spec.ts"
```

---

## Migration Steps

### Step 1: Backup Current Scripts
```powershell
Copy-Item scripts/security/migrate-security-state.ts scripts/security/migrate-security-state.ts.backup
Copy-Item scripts/security/rollback-security-migration.ts scripts/security/rollback-security-migration.ts.backup
```

### Step 2: Migrate `migrate-security-state.ts`

1. Add import at top of file:
   ```typescript
   import { scopedLogger } from '../../src/observability/envelope/console.js';
   const log = scopedLogger('security.migrate-state');
   ```

2. Convert internal logging:
   ```typescript
   // BEFORE
   console.log('[Migrate] Step 1: Read file state');
   
   // AFTER
   log.info('migrate-step1', 'Read file state');
   ```

3. Convert error logging:
   ```typescript
   // BEFORE
   console.error('[Migrate] Failed:', err.message);
   
   // AFTER
   log.error('migrate', 'Failed', { error: err.message, stack: err.stack });
   ```

4. Keep user-facing output as console

5. Remove `/* eslint-disable no-console */` if all internal logging migrated

### Step 3: Migrate `rollback-security-migration.ts`

Repeat Step 2 pattern with:
```typescript
const log = scopedLogger('security.rollback-migration');
```

### Step 4: Verify Build
```powershell
npm run build
```

### Step 5: Test the Scripts

**Dry-run test (if available):**
```powershell
npx tsx scripts/security/migrate-security-state.ts --dry-run
npx tsx scripts/security/rollback-security-migration.ts --dry-run
```

**Check envelope output:**
- Internal steps should use envelope format
- User-facing messages should still be readable console output

---

## Special Considerations for Security Scripts

### 1. Sensitive Data Handling
**DO NOT** log sensitive data in envelope:
```typescript
// ❌ BAD - Logs sensitive keys
log.info('hmac', 'Key loaded', { key: hmacKey });

// ✅ GOOD - Logs existence only
log.info('hmac', 'Key loaded', { keyLength: hmacKey.length });
```

### 2. HMAC Validation Failures
Log validation failures for audit:
```typescript
log.warn('hmac-validation', 'HMAC mismatch', {
  entryId,
  expectedAlgorithm: 'sha256',
  // Don't log actual HMAC values
});
```

### 3. Database Operations
Include operation context:
```typescript
log.info('database', 'Writing to CacheEntry table', {
  namespace: 'security-bot-state',
  key: 'current',
  dataSize: JSON.stringify(state).length
});
```

### 4. File System Operations
Log file paths (relative only):
```typescript
log.info('filesystem', 'Reading state file', {
  relativePath: 'Store/security-bot-state/current.json',
  // Don't log absolute paths that might expose system structure
});
```

---

## Success Criteria

- [x] `migrate-security-state.ts` — Internal logging migrated
- [x] `rollback-security-migration.ts` — Internal logging migrated
- [x] User-facing progress output preserved as console
- [x] No sensitive data in envelope logs
- [ ] Build passes
- [ ] Scripts tested with dry-run (if available)
- [ ] HMAC validation failures logged with audit context (no HMAC validation in scripts today)
- [ ] `eslint-disable no-console` removed if no raw console needed

---

## Commands Reference

```powershell
# Count console calls per file
Select-String -Path scripts/security/*.ts -Pattern "console\."

# Find eslint-disable comments
findstr /s /c:"eslint-disable no-console" scripts\security\*.ts

# Build check
npm run build

# Test migration script (dry-run if supported)
npx tsx scripts/security/migrate-security-state.ts --dry-run

# Test rollback script
npx tsx scripts/security/rollback-security-migration.ts --help
```

---

## Expected Changes Summary

| File | Before | After |
|------|--------|-------|
| `migrate-security-state.ts` | 51 console calls | ~10-15 console (user-facing) + ~36-41 scopedLogger |
| `rollback-security-migration.ts` | 45 console calls | ~8-12 console (user-facing) + ~33-37 scopedLogger |

**Total Impact:** ~16-27 user-facing console calls preserved, ~69-78 internal logs migrated to envelope

---

## Audit Trail Benefits

After migration, envelope logs will provide:
- **Structured data** for querying migration failures
- **Correlation IDs** for tracking migration sessions
- **Timestamps** for performance analysis
- **Operation context** for debugging issues
- **Error stack traces** for root cause analysis

---

**Next:** Proceed to Phase 2.3 ops scripts in `docs/projects/SCRIPTS-ENVELOPE-MIGRATION.md`.
