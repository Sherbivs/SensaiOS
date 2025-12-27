# Section 6: Console Tooling

**Last Updated**: 2025-12-27 | **Status**: Production

[← Back to INDEX](INDEX.md) | [← Previous: Error Handling](05-error-handling.md) | [Next: Utilities →](07-utilities.md)

---

**Philosophy**: "Console output is the first UI—clear, consistent, and actionable."

**Purpose**: Output standards, quick reference, formatting helpers.

## 6.1 Output Standards

### Centralized Output Formatter (2025-11-09)

**Purpose:** Consistent formatting across 11+ scripts with ESLint enforcement.

**Module:** `src/utils/output-formatter.ts`

**Key Functions:**
```typescript
import { 
  printSection,     // Section headers
  printKeyValue,    // Key-value pairs
  printSuccess,     // Success messages
  printError,       // Error messages
  printWarning,     // Warning messages
  printInfo,        // Informational messages
  printTable        // Tabular data
} from "../src/utils/output-formatter.js";
```

### Usage Examples

**Section Headers:**
```typescript
printSection("Database Migration");
// Output:
// ═══════════════════════════════════════════════════════════
//    DATABASE MIGRATION
// ═══════════════════════════════════════════════════════════
```

**Key-Value Pairs:**
```typescript
printKeyValue("Status", "Complete");
printKeyValue("Duration", "2.3s");
printKeyValue("Rows Affected", "142");

// Output:
// Status: Complete
// Duration: 2.3s
// Rows Affected: 142
```

**Status Messages:**
```typescript
printSuccess("Migration applied successfully");
// Output: ✅ Migration applied successfully

printError("Connection failed");
// Output: ❌ Connection failed

printWarning("Database latency high");
// Output: ⚠️ Database latency high

printInfo("Starting migration...");
// Output: ℹ️ Starting migration...
```

**Tables:**
```typescript
printTable([
  { name: "Species", count: 493 },
  { name: "Move", count: 825 },
  { name: "TrainerProfile", count: 142 }
], ["name", "count"]);

// Output:
// ┌──────────────────┬───────┐
// │ name             │ count │
// ├──────────────────┼───────┤
// │ Species          │   493 │
// │ Move             │   825 │
// │ TrainerProfile   │   142 │
// └──────────────────┴───────┘
```

### Benefits

- ✅ Consistent formatting across 11+ scripts
- ✅ ESLint enforcement via `scripts-prefer-output-formatter` rule
- ✅ 61 comprehensive tests (100% coverage)
- ✅ ASCII-safe (no Unicode box drawing in Windows terminals)
- ✅ Color support with fallback to plain text

### ESLint Rule

**Enforces:** All scripts in `scripts/` directory must use `output-formatter.ts` instead of direct `console.log`.

**Configuration:** `.eslintrc.cjs`
```javascript
"scripts-prefer-output-formatter": ["error", {
  "allowedPaths": [
    "src/utils/logger.js",           // Logger implementation
    "src/utils/output-formatter.ts"  // Formatter itself
  ]
}]
```

**Violations Caught:**
```typescript
// ❌ BAD: Direct console.log in scripts
console.log("Migration complete");

// ✅ GOOD: Use output formatter
printSuccess("Migration complete");
```

## 6.2 Quick Reference

### Common Patterns

**Database Status Display:**
```typescript
printSection("Database Status");
printKeyValue("Connection", "healthy");
printKeyValue("Latency", "45ms");
printKeyValue("URL", maskConnectionString(databaseUrl));
printSuccess("Database operational");
```

**Progress Indicators:**
```typescript
// Simple progress
for (let i = 0; i < total; i++) {
  process.stdout.write(`\rProcessing: ${i + 1}/${total}`);
  // Do work
}
process.stdout.write('\n');

// Percentage progress
const progress = Math.round((current / total) * 100);
process.stdout.write(`\rProgress: [${progressBar(progress)}] ${progress}%`);
```

**Error Reporting:**
```typescript
try {
  await performMigration();
  printSuccess("Migration completed");
} catch (error) {
  printError("Migration failed");
  printKeyValue("Error", error.message);
  printKeyValue("Stack", error.stack.split('\n')[0]); // First line only
  process.exit(1);
}
```

### Masking Sensitive Data

```typescript
function maskConnectionString(url: string): string {
  return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
}

// Example:
// Input:  postgresql://user:password123@host/db
// Output: postgresql://user:***@host/db
```

### Color Support Detection

```typescript
import { supportsColor } from "chalk";

if (supportsColor) {
  // Use colors
  console.log(chalk.green("Success"));
} else {
  // Plain text fallback
  console.log("Success");
}
```

---

[← Back to INDEX](INDEX.md) | [← Previous: Error Handling](05-error-handling.md) | [Next: Utilities →](07-utilities.md)