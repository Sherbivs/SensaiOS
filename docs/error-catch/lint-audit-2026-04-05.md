# Lint Audit — 2026-04-05

**Total:** 38 problems (16 errors, 22 warnings)  
**Captured From:** `npm run lint` — ESLint across `{src,tests}/**/*.ts`  
**Build Status:** ✅ 0 TypeScript errors  
**Test Status:** ✅ 3183 passed, 0 failed  

> **For AI Agents:** This document contains the full code context, root cause analysis, and
> correct fix for every issue. Do NOT apply quick suppression hacks (`// eslint-disable`,
> `as any`, etc.) unless explicitly stated. Each fix preserves the original intent of the code.

---

## Table of Contents

1. [ERRORS: preserve-caught-error (9 errors)](#errors--preserve-caught-error-9-errors)
2. [ERRORS: no-useless-assignment (7 errors)](#errors--no-useless-assignment-7-errors)
3. [WARNINGS: no-unused-vars (22 warnings)](#warnings--typescript-eslintno-unused-vars-22-warnings)
4. [Summary by Area](#summary-by-area)
5. [Priority and Sequencing](#priority--sequencing)

---

## ERRORS — `preserve-caught-error` (9 errors)

### What This Rule Enforces

When catching an error and re-throwing a new one, the original error's stack trace and message
are lost unless you attach it as the `cause`. This rule enforces the `{ cause }` option on
the `Error` constructor so that `error.cause` preserves the full chain for debugging.

**Why it matters in production:** Without `cause`, Render logs show only the wrapper message
(e.g., "Failed to initialize plugin 'X'") with no stack pointing to the actual failure.
Attaching `cause` preserves the full chain for Loki/Grafana queries.

### Universal Fix Pattern

```typescript
// WRONG — Original error lost
catch (error) {
  throw new Error(`Operation failed: ${getErrorMessage(error)}`);
}

// CORRECT — Chain preserved via cause
catch (error) {
  throw new Error(
    `Operation failed: ${getErrorMessage(error)}`,
    { cause: error }
  );
}
```

> **Note:** `{ cause: error }` is standard ES2022. TypeScript types it via `ErrorOptions`.
> No polyfill needed — Node 18+ supports it natively.

---

### 1. `src/bot/security/plugins/registry.ts` — Line 195

**Context:** Plugin initialization failure during `register()`.

```typescript
// CURRENT (line 192-197):
try {
  await plugin.initialize(this.context);
} catch (error) {
  throw new Error(
    `Failed to initialize plugin '${id}': ${getErrorMessage(error)}`
  );
}

// FIX:
try {
  await plugin.initialize(this.context);
} catch (error) {
  throw new Error(
    `Failed to initialize plugin '${id}': ${getErrorMessage(error)}`,
    { cause: error }
  );
}
```

**Why this specific fix:** The plugin `initialize()` can throw anything (plugin code is
third-party). Preserving the cause lets operators see whether it was a missing dependency,
database error, or configuration issue — not just "failed to initialize."

---

### 2. `src/bot/security/plugins/registry.ts` — Line 388

**Context:** Dynamic plugin loading from file path via `import()`.

```typescript
// CURRENT (line 387-391):
} catch (error) {
  throw new Error(
    `Failed to load plugin from ${filePath}: ${getErrorMessage(error)}`
  );
}

// FIX:
} catch (error) {
  throw new Error(
    `Failed to load plugin from ${filePath}: ${getErrorMessage(error)}`,
    { cause: error }
  );
}
```

**Why this specific fix:** `import()` failures include module resolution errors, syntax
errors, and missing exports. The cause chain reveals the specific loader error.

---

### 3. `src/bot/security/services/column-encryption-service.ts` — Line 303

**Context:** Column-level field encryption failure (AES-256-GCM).

```typescript
// CURRENT (line 301-304):
} catch (error) {
  this.stats.encryptionErrors++;
  throw new Error(
    `Field encryption failed: ${getErrorMessage(error)}`
  );
}

// FIX:
} catch (error) {
  this.stats.encryptionErrors++;
  throw new Error(
    `Field encryption failed: ${getErrorMessage(error)}`,
    { cause: error }
  );
}
```

**Why this specific fix:** Encryption failures can be key-derived (wrong key version),
buffer-related (bad input encoding), or algorithm-level. The cause chain determines
whether this is a key rotation issue vs. a data corruption issue.

---

### 4. `src/bot/security/services/column-encryption-service.ts` — Line 371

**Context:** Column-level field decryption failure.

```typescript
// CURRENT (line 369-372):
} catch (error) {
  this.stats.decryptionErrors++;
  throw new Error(
    `Field decryption failed: ${getErrorMessage(error)}`
  );
}

// FIX:
} catch (error) {
  this.stats.decryptionErrors++;
  throw new Error(
    `Field decryption failed: ${getErrorMessage(error)}`,
    { cause: error }
  );
}
```

**Why this specific fix:** Same reasoning as #3 — decryption failures from wrong key
version, tampered ciphertext, or IV mismatch need the original crypto error preserved.

---

### 5. `src/config/engine-db-config.ts` — Line 525

**Context:** Engine DB config validation — storage directory creation at startup.

```typescript
// CURRENT (line 523-528):
try {
  await fs.mkdir(STORAGE_BASE_DIR, { recursive: true });
} catch (error) {
  throw new Error(
    `Engine DB config validation failed: Cannot create storage directory ${STORAGE_BASE_DIR}. ` +
    `Error: ${getErrorMessage(error)}`
  );
}

// FIX:
try {
  await fs.mkdir(STORAGE_BASE_DIR, { recursive: true });
} catch (error) {
  throw new Error(
    `Engine DB config validation failed: Cannot create storage directory ${STORAGE_BASE_DIR}. ` +
    `Error: ${getErrorMessage(error)}`,
    { cause: error }
  );
}
```

**Why this specific fix:** Directory creation failures on Render indicate permission
issues (`EACCES`) or disk-full (`ENOSPC`). The cause preserves the `errno` code that
operators need to diagnose which Render resource limit was hit.

---

### 6. `src/runtime/databaseRecovery.ts` — Line 173

**Context:** Database recovery sequence failure (critical path).

```typescript
// CURRENT (line 172-174):
} catch (error) {
  logger.error('databaseRecovery', 'recovery', 'Database recovery sequence failed', {
    error: { name: 'Error', message: String(error) }
  });
  throw new Error(`Database recovery failed: ${getErrorMessage(error)}`);
}

// FIX:
} catch (error) {
  logger.error('databaseRecovery', 'recovery', 'Database recovery sequence failed', {
    error: { name: 'Error', message: String(error) }
  });
  throw new Error(
    `Database recovery failed: ${getErrorMessage(error)}`,
    { cause: error }
  );
}
```

**Why this specific fix:** Recovery failures are already logged, but the thrown error
propagates up to the boot sequence. Without cause, the boot error handler sees only
"Database recovery failed" with no indication of which recovery step failed (reconnect,
WAL replay, connection pool reset, etc.).

---

### 7. `src/sensaios/install/manifest-schema.ts` — Line 188

**Context:** Manifest JSON parsing during component installation.

```typescript
// CURRENT (line 186-190):
try {
  parsed = JSON.parse(json);
} catch (error) {
  throw new Error(
    `Failed to parse manifest JSON: ${
      error instanceof Error ? error.message : 'Unknown error'
    }`
  );
}

// FIX:
try {
  parsed = JSON.parse(json);
} catch (error) {
  throw new Error(
    `Failed to parse manifest JSON: ${
      error instanceof Error ? error.message : 'Unknown error'
    }`,
    { cause: error }
  );
}
```

**Why this specific fix:** JSON parse errors include the exact position of the syntax
error (e.g., "Unexpected token } in JSON at position 142"). Losing the cause loses
the position, making it much harder to fix malformed manifests.

---

### 8. `src/shared/config.ts` — Line 286

**Context:** Production database URL validation — localhost rejection.

```typescript
// CURRENT (line 282-290):
try {
  // ... URL validation logic ...
  if (isLocalhost && !isUsingProdLocalDatabase) {
    throw new Error("Database URL cannot point to localhost in production ...");
  }
} catch (error) {
  if (error instanceof Error) {
    throw error;  // Re-throw known errors as-is
  }
  throw new Error("Database URL must be a valid URL in production.");
}

// FIX — only the fallback branch needs cause:
} catch (error) {
  if (error instanceof Error) {
    throw error;  // Re-throw known errors as-is (already has stack)
  }
  throw new Error("Database URL must be a valid URL in production.", { cause: error });
}
```

**Why this specific fix:** The `if (error instanceof Error)` branch already re-throws
correctly (original Error preserved). Only the fallback branch (for non-Error throws
like strings) needs `{ cause }`. This preserves whatever was thrown (e.g., a thrown
string from a dependency).

---

### 9. `src/shared/service-registry.ts` — Line 346

**Context:** Service initialization failure during bootstrap.

```typescript
// CURRENT (line 345-347):
} catch (error) {
  metadata.status = 'error';
  // ... error reporting ...
  throw new Error(
    `Failed to initialize service '${serviceName}': ${getErrorMessage(error)}`
  );
}

// FIX:
} catch (error) {
  metadata.status = 'error';
  // ... error reporting ...
  throw new Error(
    `Failed to initialize service '${serviceName}': ${getErrorMessage(error)}`,
    { cause: error }
  );
}
```

**Why this specific fix:** Service registry is the boot orchestrator. If the cache
service, security service, or any other critical service fails to init, the cause
chain tells operators exactly which downstream dependency or database query broke.

---

## ERRORS — `no-useless-assignment` (7 errors)

### What This Rule Enforces

A variable is assigned a value that is never read before being overwritten or before the
variable goes out of scope. This usually indicates dead code, incomplete refactoring, or
a variable that was meant to be used but wasn't wired up.

### Analysis Method

For each case below, the surrounding code was read to determine:
1. Is the variable **truly dead** (can be removed)?
2. Is it **scaffolding** that should be wired up?
3. Is it a **false positive** where ESLint can't see the usage?

---

### 1. `src/bot/security/services/immutable-audit-service.ts` — Line 442

**Variable:** `previousHashValid`  
**Verdict:** FALSE POSITIVE — variable IS used downstream

```typescript
// CURRENT (lines 442-451):
let previousHashValid = true;  // <-- ESLint flags this initial assignment
if (entry.sequence === 1n) {
  previousHashValid = entry.previousHash === null;
} else {
  previousHashValid = entry.previousHash === expectedPreviousHash;
}

const valid = contentHashValid && signatureValid && previousHashValid;
//                                                  ^^^^^^^^^^^^^^^^ USED HERE
```

**Root Cause:** ESLint flags the initial `= true` because every `if/else` branch
overwrites it. But the variable IS consumed on the line computing `valid`.

**Fix — remove the dead initial value:**
```typescript
let previousHashValid: boolean;
if (entry.sequence === 1n) {
  previousHashValid = entry.previousHash === null;
} else {
  previousHashValid = entry.previousHash === expectedPreviousHash;
}
```

**Alternative (cleaner, preferred):**
```typescript
const previousHashValid = entry.sequence === 1n
  ? entry.previousHash === null
  : entry.previousHash === expectedPreviousHash;
```

---

### 2. `src/bot/state/persistence.ts` — Line 559

**Variable:** `recoveryTier`  
**Verdict:** TRUE POSITIVE — dead code, never consumed

```typescript
// CURRENT (lines 559-621):
let recoveryTier: 'current' | 'previous' | 'snapshot' | 'fresh' = 'current';
// ... 60 lines of init logic ...
if (await loadStateFromDb(CURRENT_STATE_KEY)) {
  recoveryTier = 'current';
} else if (await loadStateFromDb(PREVIOUS_STATE_KEY)) {
  recoveryTier = 'previous';
} else if (previousState.cumulative.restartCount > 0) {
  recoveryTier = 'snapshot';
} else {
  recoveryTier = 'fresh';
}
// recoveryTier is NEVER READ after this point
```

**Root Cause:** `recoveryTier` was clearly intended for logging or telemetry
(tracking which recovery path was taken), but was never wired up. The information
is valuable for startup diagnostics.

**Fix — wire into existing startup logging:**
```typescript
// After the if/else chain, add a log line that consumes the variable:
logger.info('security-state', 'init',
  `[State] Recovery tier: ${recoveryTier}`,
  { metadata: { recoveryTier } }
);
```

This turns dead code into useful observability. The variable tracks a meaningful
concept (which fallback tier the state was recovered from) that operators need.

---

### 3. `src/bot/state/timeline.ts` — Line 237

**Variable:** `description`  
**Verdict:** FALSE POSITIVE — variable IS used in the return object

```typescript
// CURRENT (lines 237-270):
let description = '';  // <-- ESLint flags this initial assignment

switch (event.type) {
  case 'sweep': {
    description = `${event.guildName} - ${event.details.rolesChecked} roles...`;
    break;
  }
  case 'permission_change': { /* sets description */ break; }
  case 'alert': { /* sets description */ break; }
  case 'restart': { /* sets description */ break; }
  default:
    description = JSON.stringify(event.details).substring(0, 100);
}

return {
  name: `${icon} ${event.type} (${relativeTime})`,
  value: description,  // <-- USED HERE
  inline: false
};
```

**Root Cause:** Every switch branch (including `default`) assigns to `description`,
so the initial `= ''` is provably dead. But the variable IS consumed in the return.

**Fix — declare without initializing:**
```typescript
let description: string;

switch (event.type) {
  // ... all branches assign description ...
  default:
    description = JSON.stringify(event.details).substring(0, 100);
}
```

---

### 4. `src/services/health-server.ts` — Line 102

**Variable:** `status`  
**Verdict:** FALSE POSITIVE — initial value serves as catch-path fallback

```typescript
// CURRENT (lines 102-120):
let status: HealthResponse['status'] = 'initializing';
// <-- ESLint flags this because the try block always overwrites

try {
  const registry = ServiceRegistry.getInstance();
  const registryStatus = registry.getStatus();

  if (registryStatus.isShuttingDown) {
    status = 'shutting_down';
  } else if (!engineReady) {
    status = 'initializing';
  } else if (registryStatus.errorCount > 0 || registryStatus.degradedCount > 0) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }
  // ...
} catch (error) {
  // If ServiceRegistry.getInstance() throws, `status` retains 'initializing'
  // which is semantically correct for the error response
}
```

**Root Cause:** If the `try` block throws (e.g., `ServiceRegistry` not yet created),
the initial `= 'initializing'` is the correct fallback used in the catch response.
ESLint can't see that the catch branch reads the variable implicitly.

**Fix — targeted suppression (legitimate case):**
```typescript
// eslint-disable-next-line no-useless-assignment -- fallback for catch path
let status: HealthResponse['status'] = 'initializing';
```

This is a rare legitimate case for a single-line suppression because the initial
value is semantically the "error/unknown state" fallback. Verify by reading the
catch block — if it also sets `status`, then remove the initial assignment instead.

---

### 5 & 6. `src/services/monitoring/resource-manager.ts` — Lines 517, 810

**Variable:** `count` (both occurrences)  
**Verdict:** TRUE POSITIVE — initial `= 0` always overwritten

```typescript
// PATTERN AT BOTH LINES (517 and 810):
let count = 0;  // <-- dead assignment
const promises: Promise<boolean>[] = [];

for (const [id, resource] of this.resources.entries()) {
  if (/* condition */) {
    promises.push(this.unregisterXxx(id));
  }
}

const results = await Promise.all(promises);
count = results.filter(Boolean).length;  // always overwrites

return count;
```

**Root Cause:** The initial `let count = 0` is never read — it's always
overwritten by `count = results.filter(Boolean).length` before the return.

**Fix — use `const` with computed value:**
```typescript
const promises: Promise<boolean>[] = [];

for (const [id, resource] of this.resources.entries()) {
  if (/* condition */) {
    promises.push(this.unregisterXxx(id));
  }
}

const results = await Promise.all(promises);
const count = results.filter(Boolean).length;

return count;
```

This also upgrades `let` to `const`, which is better practice since the value
is never reassigned after the initial computation.

---

### 7. `src/shared/models/battle-queries-pg.ts` — Line 374

**Variable:** `paramIndex`  
**Verdict:** TRUE POSITIVE — final increment result is never read

```typescript
// CURRENT (lines 374-390):
let paramIndex = 1;

if (filters?.after) {
  sql += ` AND "endedAt" > $${paramIndex}`;
  values.push(filters.after);
  paramIndex++;
}

if (filters?.participant) {
  sql += ` AND (
    "p1Id" IN (SELECT id FROM "User" WHERE "discordId" = $${paramIndex})
    OR "p2Id" IN (SELECT id FROM "User" WHERE "discordId" = $${paramIndex})
  )`;
  values.push(filters.participant);
  paramIndex++;  // <-- USELESS: paramIndex is never read after this
}
```

**Root Cause:** The final `paramIndex++` increments the counter but it's
never used again — the function proceeds to query execution immediately after.

**Fix — remove the final increment:**
```typescript
if (filters?.participant) {
  sql += ` AND (
    "p1Id" IN (SELECT id FROM "User" WHERE "discordId" = $${paramIndex})
    OR "p2Id" IN (SELECT id FROM "User" WHERE "discordId" = $${paramIndex})
  )`;
  values.push(filters.participant);
  // No increment needed — no more filters after this
}
```

**Alternative (if extensibility is expected):** Keep the increment with a comment
explaining it's for future filter additions, and add a targeted suppression:
```typescript
  values.push(filters.participant);
  // eslint-disable-next-line no-useless-assignment -- extensibility for future filters
  paramIndex++;
```

---

## WARNINGS — `@typescript-eslint/no-unused-vars` (22 warnings)

### What This Rule Enforces

Imported symbols, destructured variables, or declared variables that are never
referenced in the file. In test files, these usually come from:
- **Speculative imports** — imported for future test cases not yet written
- **Scaffolding** — variables assigned for assertion setup but assertion removed
- **Copy-paste** — imports carried over from another test file

### Universal Fix Patterns

```typescript
// Pattern A: Remove unused import entirely
import { used, unused } from './module.js';  // Before
import { used } from './module.js';          // After

// Pattern B: Prefix with _ (keep for documentation / future use)
const _unused = compute(); // Explicitly marked as intentionally unused

// Pattern C: Remove unused variable assignment
const unused = compute();  // If compute() has no side effects → remove entirely
compute();                  // If compute() has side effects → keep call only

// Pattern D: Prefix destructured variable
const { used, _unused } = getValues();
```

> **For test files:** Prefer **Pattern A** (remove) unless the import documents
> an intentional future test case (then use Pattern B with `_` prefix).

---

### File: `tests/observability/envelope.spec.ts` — 5 warnings

| Line | Symbol | Kind | Fix |
|------|--------|------|-----|
| 12 | `LogEnvelope` | type import | **Remove** from import. Not used in any `as LogEnvelope` cast or type annotation. |
| 36 | `recent` | function import | **Remove** from import. Query helper imported but no test uses `recent()`. |
| 52 | `fromLogObservation` | function import | **Remove** from import. Converter imported but never called. |
| 53 | `toObservabilityEvent` | function import | **Remove** from import. Converter imported but never called. |
| 236 | `oldest` | variable | **Remove** the variable or the entire line. `oldest` is assigned from a query result but never asserted against — only `newest` is tested. |

---

### File: `tests/sensaios/capabilities.spec.ts` — 3 warnings

| Line | Symbol | Kind | Fix |
|------|--------|------|-----|
| 9 | `beforeEach` | vitest import | **Remove** from import destructuring. No `beforeEach()` block exists in this file. |
| 35 | `now` | variable | **Remove.** `const now = new Date()` is declared but never referenced — the test uses `grantedAt` instead. |
| 82 | `expiredDate` | variable | **Remove.** `const expiredDate = new Date(Date.now() - 1000)` is declared but the test relies on Prisma `where` clause to check expiry, so this date is never passed anywhere. |

---

### File: `tests/sensaios/gameserver/client.test.ts` — 1 warning

| Line | Symbol | Kind | Fix |
|------|--------|------|-----|
| 27 | `EncryptedToken` | type import | **Remove** from import. Type imported but no variable is typed with it and no `as EncryptedToken` cast exists. |

---

### File: `tests/sensaios/loader/module-hook.spec.ts` — 4 warnings

| Line | Symbol | Kind | Fix |
|------|--------|------|-----|
| 9 | `afterEach` | vitest import | **Remove** from import. No `afterEach()` block in file. |
| 9 | `vi` | vitest import | **Remove** from import. No `vi.mock()` / `vi.spyOn()` / `vi.stubEnv()` used. |
| 12 | `resolveModulePath` | function import | **Remove** from import. Imported but no test calls it. |
| 205 | `initialImports` | variable | **Remove.** `const initialImports = stats1.totalImports` is saved but never compared — test immediately calls `resetStats()` and checks the reset counts. The "before" snapshot is unused. |

---

### File: `tests/sensaios/ring-security.spec.ts` — 4 warnings

| Line | Symbol | Kind | Fix |
|------|--------|------|-----|
| 16 | `beforeEach` | vitest import | **Remove** from import. No `beforeEach()` block in file. |
| 16 | `afterEach` | vitest import | **Remove** from import. No `afterEach()` block in file. |
| 19 | `secureImport` | function import | **Remove** from import. Only `validateImport` and `assertImportAllowed` are called. |
| 823 | `error` | catch parameter | **Prefix with `_`:**  |

```typescript
// CURRENT (line 823):
} catch (error) {
  expect(true).toBe(true);
}

// FIX:
} catch (_error) {
  expect(true).toBe(true);
}
```

> **Note on line 823:** The pattern `try { await x; } catch (error) { expect(true).toBe(true); }`
> is an anti-pattern. The test should use `expect(fn).rejects.toThrow()` instead. However,
> this is a refactor beyond lint cleanup scope. The `_error` prefix is the correct minimal fix.

---

### File: `tests/sensaios/security/boundary-tests.spec.ts` — 3 warnings

| Line | Symbol | Kind | Fix |
|------|--------|------|-----|
| 14 | `RING` | const import | **Remove** from import. `RING` enum imported but all ring checks use inline numbers or other constants. |
| 552 | `sanitized` | variable | **Remove.** `const sanitized = sanitizeError(new Error(stack))` is called but the result is never asserted on. If `sanitizeError()` has no side effects being tested, remove the line entirely. If it does, keep the call but assign to `_sanitized`. |
| 602 | `componentBData` | variable | **Remove.** `const componentBData = new Map(...)` is scaffolding for a cross-access test that only tests the A-to-B direction; the B data is never read. |

---

### File: `tests/sensaios/security/installation-attack.spec.ts` — 2 warnings

| Line | Symbol | Kind | Fix |
|------|--------|------|-----|
| 14 | `SensaiError` | class import | **Remove** from import. Tests catch generic errors, not `SensaiError` specifically. |
| 23 | `testScope` | variable | **Remove or prefix `_`.** `testScope` is declared as a module-level fixture but never passed to any test function. Either tests are incomplete (should pass scope) or the scope was for planned tests. If keeping for future: prefix with `_testScope`. |

---

## Summary by Area

| Area | Errors | Warnings | Files | Primary Issue |
|------|--------|----------|-------|---------------|
| `src/bot/security/` | 5 | 0 | 3 | Missing `{ cause }`, 1 dead init |
| `src/bot/state/` | 2 | 0 | 2 | Dead `recoveryTier`, dead `description` init |
| `src/services/` | 3 | 0 | 2 | Dead `count` init, dead `status` init |
| `src/shared/` | 2 | 0 | 3 | Missing `{ cause }`, dead `paramIndex++` |
| `src/config/` | 1 | 0 | 1 | Missing `{ cause }` |
| `src/runtime/` | 1 | 0 | 1 | Missing `{ cause }` |
| `src/sensaios/` | 1 | 0 | 1 | Missing `{ cause }` |
| `tests/observability/` | 0 | 5 | 1 | Unused imports/vars |
| `tests/sensaios/` | 0 | 17 | 6 | Unused imports/vars |
| **Total** | **16** | **22** | **20 files** | |

---

## Priority & Sequencing

### Pass 1: `preserve-caught-error` (9 errors) — HIGHEST PRIORITY

**Effort:** ~15 minutes  
**Risk:** Zero — adding `{ cause: error }` to existing throws changes no behavior.  
**Impact:** Production debugging dramatically improved. Full error chains in Loki.  
**Test impact:** None — no tests assert on error `.cause`.

Batch approach: All 9 fixes are identical pattern additions. Can be done in one
`multi_replace_string_in_file` call touching 7 files.

### Pass 2: `no-useless-assignment` (7 errors) — MEDIUM PRIORITY

**Effort:** ~20 minutes  
**Risk:** Low — each requires reading 5-10 lines of context to confirm the fix.  
**Impact:** Cleaner code, prevents future confusion about intended usage.  
**Test impact:** One change (`persistence.ts` `recoveryTier`) adds a log line that
existing tests should not break on.

Approach: Handle individually since each fix is unique.

### Pass 3: Test unused vars (22 warnings) — LOW PRIORITY

**Effort:** ~10 minutes  
**Risk:** Zero — removing unused imports and prefixing unused vars.  
**Impact:** Clean lint output, easier to spot real issues in future runs.  
**Test impact:** None — removing unused imports doesn't change test behavior.

Batch approach: Group by file, remove imports first, then fix variables.

---

**Created:** 2026-04-05  
**Status:** Pending cleanup  
**Last lint run:** `npm run lint` — 38 problems (16 errors, 22 warnings)

| Area | Errors | Warnings | Files |
|------|--------|----------|-------|
| `src/bot/security/` | 5 | 0 | 3 |
| `src/bot/state/` | 2 | 0 | 2 |
| `src/services/` | 3 | 0 | 2 |
| `src/shared/` | 2 | 0 | 3 |
| `src/config/` | 1 | 0 | 1 |
| `src/runtime/` | 1 | 0 | 1 |
| `src/sensaios/` | 1 | 0 | 1 |
| `tests/` | 0 | 22 | 7 |
| **Total** | **16** | **22** | **20 files** |

---

## Priority Recommendation

1. **Quick wins (warnings):** The 22 test warnings are trivial — prefix unused with `_` or remove. Can batch-fix in one pass.
2. **Medium (dead assignments):** 7 `no-useless-assignment` errors need individual inspection — some may be intentional scaffolding, some are dead code.
3. **Important (`preserve-caught-error`):** 9 missing error causes hurt debugging in production. Each needs `{ cause: originalError }` added to the re-thrown `new Error()`.

---

**Created:** 2026-04-05 | **Status:** Pending cleanup
