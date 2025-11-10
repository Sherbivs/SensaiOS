# Console Output Standards

**Version**: 1.0.0  
**Last Updated**: 2025-11-08  
**Purpose**: Unified formatting standards for all console output across the Infinity Gauntlet codebase.

## Overview

All console output must follow these standards to ensure consistent, professional, and readable terminal displays. This document defines formatting rules, provides examples, and explains when to use each pattern.

## Design Principles

1. **Consistency** — Same patterns everywhere (borders, spacing, alignment)
2. **Readability** — Easy to scan, clear hierarchy, proper whitespace
3. **Professional** — Clean aesthetics matching production-grade tools
4. **Maintainable** — Reusable utilities, DRY principles, centralized formatting

## Formatting Library

All formatting must use `src/utils/output-formatter.ts`:

```typescript
import {
  formatBorder,
  formatSectionHeader,
  formatKeyValue,
  formatTable,
  formatStatus,
  formatOutputBlock,
} from '../utils/output-formatter.js';
```

## Border Styles

### Standard Border (Light)

**When to use**: Stats displays, section dividers, clean separation

```
─────────────────────────────────────────────────────────────────────────
```

**Usage**:
```typescript
console.log(formatBorder(75, 'light'));
```

### Section Separator

**When to use**: Named sections, titled dividers

```
─────────────── Database Status ───────────────
```

**Usage**:
```typescript
console.log(formatSeparator('Database Status', 75));
```

## Section Headers

### Standard Section Header

**Format**: `[SECTION_NAME]` with consistent bracket style

```
[NODE]
[DATABASE]
[SECURITY BOT]
```

**Usage**:
```typescript
console.log(formatSectionHeader('NODE'));
console.log(formatSectionHeader('DATABASE', 1)); // Indented
```

## Key-Value Pairs

### Aligned Key-Value Format

**When to use**: Configuration display, stats output, status reports

```
  Uptime:    49s
  Process:   PID 73 | v22.10.0
  Memory:    188.86 MB
```

**Usage**:
```typescript
const lines = formatKeyValueList([
  ['Uptime', '49s'],
  ['Process', 'PID 73 | v22.10.0'],
  ['Memory', '188.86 MB'],
], { indent: 1 });

lines.forEach(line => console.log(line));
```

### Multi-Column Key-Value Format

**When to use**: Related data with multiple attributes

```
  PROD  = HEALTHY       Latency: 2.72ms      Database: infinity_gauntlet
  LOCAL = DISABLED      Latency: n/a         Database: unknown
```

**Usage**:
```typescript
console.log(formatKeyValue('PROD', 'HEALTHY', { indent: 1, keyWidth: 10 }));
```

## Tables

### Aligned Table Format

**When to use**: Structured data with multiple columns, query results

```
  Name           Type       Rows      Size
  ───────────────────────────────────────────
  Species        table      1025      2.4 MB
  Move           table      918       1.8 MB
  TrainerProfile table      156       0.3 MB
```

**Usage**:
```typescript
const headers = ['Name', 'Type', 'Rows', 'Size'];
const rows = [
  ['Species', 'table', '1025', '2.4 MB'],
  ['Move', 'table', '918', '1.8 MB'],
  ['TrainerProfile', 'table', '156', '0.3 MB'],
];

const tableLines = formatTable(headers, rows, { indent: 1 });
tableLines.forEach(line => console.log(line));
```

## Lists

### Bulleted Lists

**When to use**: Features, options, non-sequential items

```
  • Real-time permission monitoring
  • Automatic role reversion
  • DM alerts to administrators
```

**Usage**:
```typescript
const items = [
  'Real-time permission monitoring',
  'Automatic role reversion',
  'DM alerts to administrators',
];

formatList(items, { indent: 1 }).forEach(line => console.log(line));
```

### Numbered Lists

**When to use**: Steps, procedures, sequential items

```
  1. Initialize database connection
  2. Load configuration from environment
  3. Start Discord client
  4. Register slash commands
```

**Usage**:
```typescript
formatList(items, { indent: 1, numbered: true }).forEach(line => console.log(line));
```

## Status Messages

### Standard Status Format

**When to use**: Operation outcomes, system states

```
✅ Database connection established
⚠️  Cache size approaching limit (75% full)
❌ Failed to connect to Discord gateway
ℹ️  Starting auto-refresh worker...
```

**Usage**:
```typescript
console.log(formatStatus('Database connection established', 'success'));
console.log(formatStatus('Cache size approaching limit (75% full)', 'warning'));
console.log(formatStatus('Failed to connect to Discord gateway', 'error'));
console.log(formatStatus('Starting auto-refresh worker...', 'info'));
```

## Progress Messages

### Standard Progress Format

**When to use**: Long-running operations, batch processing

```
Processing migrations [15/42] (36%)
Syncing Pokémon data [843/1025] (82%)
```

**Usage**:
```typescript
console.log(formatProgress('Processing migrations', 15, 42));
console.log(formatProgress('Syncing Pokémon data', 843, 1025));
```

## Complete Output Blocks

### Multi-Section Stats Display

**When to use**: Comprehensive system status, startup summaries

```
─────────────────────────────────────────────────────────────────────────

[NODE]
  Uptime:    49s
  Process:   PID 73 | v22.10.0
  
  Memory:
    RSS:      188.86 MB   
    Heap:     31.54 MB / 94.64 MB
    External: 26.30 MB
  
  CPU:
    User:   2.70s
    System: 0.09s

[DATABASE]
  PROD  = HEALTHY       Latency: 2.72ms      Database: infinity_gauntlet
  LOCAL = DISABLED      Latency: n/a         Database: unknown

─────────────────────────────────────────────────────────────────────────
```

**Usage**:
```typescript
const output = formatOutputBlock({
  sections: [
    {
      header: 'NODE',
      content: [
        '  Uptime:    49s',
        '  Process:   PID 73 | v22.10.0',
        '  ',
        '  Memory:',
        '    RSS:      188.86 MB',
        '    Heap:     31.54 MB / 94.64 MB',
        '    External: 26.30 MB',
      ],
      type: 'lines',
    },
    {
      header: 'DATABASE',
      content: [
        ['PROD', 'HEALTHY       Latency: 2.72ms      Database: infinity_gauntlet'],
        ['LOCAL', 'DISABLED      Latency: n/a         Database: unknown'],
      ],
      type: 'keyvalue',
    },
  ],
  borders: true,
});

console.log(output);
```

## Spacing Rules

### Vertical Spacing

- **Empty line before borders**: Always add blank line before top border
- **Empty line after section headers**: Add spacing for readability
- **Empty line between sections**: Separate logical groups
- **Empty line after borders**: Always add blank line after bottom border

### Horizontal Spacing

- **Indentation**: 2 spaces per indent level
- **Key-value separation**: 2 spaces minimum after key
- **Column padding**: 2 spaces between table columns
- **Section padding**: 1 line between sections

## Indentation Levels

```
Level 0: Section headers           [NODE]
Level 1: Top-level properties        Uptime: 49s
Level 2: Nested properties             RSS: 188.86 MB
Level 3: Deep nesting                    Details: ...
```

## Color Usage (Future)

*Reserved for future implementation with chalk or similar*

- **Success**: Green (`formatStatus(..., 'success')`)
- **Warning**: Yellow (`formatStatus(..., 'warning')`)
- **Error**: Red (`formatStatus(..., 'error')`)
- **Info**: Blue (`formatStatus(..., 'info')`)
- **Highlight**: Cyan (emphasis)

## Allowed Console Usage

### Infrastructure (Always Allowed)

Files that may use direct `console.*` calls:

- `src/utils/logger.js` — Centralized logger infrastructure
- `src/utils/output-formatter.ts` — Formatting utilities (should use logger)
- `src/shared/log.ts` — Logger wrapper

### Tests (Conditionally Allowed)

Test files may use `console.log` for:
- Test status markers (`✓` checkmarks)
- Performance metrics display
- Test setup/teardown logging

**Recommendation**: Use Vitest's built-in output instead where possible.

### Scripts/CLI Tools (Conditionally Allowed)

CLI scripts (`scripts/*.ts`) may use direct console output ONLY with proper formatting:

```typescript
// ✅ Good - Uses formatter
console.log(formatSectionHeader('Database Status'));
console.log(...formatKeyValueList([['Tables', count]]));

// ❌ Bad - Direct console with inconsistent formatting
console.log('=== Database Status ===');
console.log('Tables:', count);
```

### Production Code (Forbidden)

All production code (`src/bot/`, `src/commands/`, `src/services/`) **must** use centralized logger:

```typescript
// ✅ Good - Uses logger
import { log } from '../utils/logger.js';
log.info('Database connection established');

// ❌ Bad - Direct console
console.log('Database connection established');
```

## Anti-Patterns to Avoid

### ❌ Inconsistent Borders

```typescript
// Bad
console.log('==========');
console.log('**********');
console.log('----------');
```

### ❌ Unaligned Key-Values

```typescript
// Bad
console.log('Uptime: 49s');
console.log('Memory: 188 MB');
console.log('PID: 73');
```

### ❌ Mixed Indentation

```typescript
// Bad
console.log('  Line 1');
console.log('    Line 2');
console.log('   Line 3');
```

### ❌ No Spacing Structure

```typescript
// Bad
console.log('[NODE]');
console.log('Uptime: 49s');
console.log('[DATABASE]');
console.log('Status: HEALTHY');
```

## Enforcement

### ESLint Rules (Planned)

Add rule to prevent direct console usage:

```javascript
{
  rules: {
    'no-console': ['error', {
      allow: ['warn', 'error'], // Only in specific files
    }],
  },
}
```

Override for allowed files:

```javascript
// src/utils/logger.js
/* eslint-disable no-console */
```

### Pre-Commit Hooks (Planned)

```bash
#!/bin/bash
# Check for console.log in production code
if git diff --cached --name-only | grep -E '^src/(bot|commands|services)/' | xargs grep -l 'console\.log'; then
  echo "Error: Direct console.log found in production code"
  exit 1
fi
```

## Migration Path

For existing code:

1. **Identify** — Use grep to find all `console.*` calls
2. **Categorize** — Determine appropriate replacement (logger vs formatter)
3. **Refactor** — Replace with proper utilities
4. **Test** — Verify output matches standards
5. **Document** — Update inline comments explaining formatting

Example migration:

```typescript
// Before
console.log('=== Database Status ===');
console.log('Status:', status);
console.log('Latency:', latency + 'ms');

// After
console.log(formatSectionHeader('Database Status'));
console.log(...formatKeyValueList([
  ['Status', status],
  ['Latency', `${latency}ms`],
]));
```

## Testing Standards

All formatting utilities must have:

- **Unit tests** — Test each formatter function
- **Snapshot tests** — Verify output appearance
- **Integration tests** — Test complete output blocks
- **Visual tests** — Manual verification of console appearance

Example test:

```typescript
import { formatKeyValue } from '../utils/output-formatter.js';

describe('formatKeyValue', () => {
  it('should align key-value pairs', () => {
    const result = formatKeyValue('Uptime', '49s', { keyWidth: 15 });
    expect(result).toBe('  Uptime         : 49s');
  });
});
```

## Examples from Codebase

### Startup Sequence (index.ts)

```typescript
import { formatOutputBlock } from './utils/output-formatter.js';

console.log(formatOutputBlock({
  sections: [
    {
      header: 'STARTUP',
      content: [
        ['Phase', 'Database initialization'],
        ['Duration', '1.23s'],
        ['Memory', '45.67 MB'],
      ],
      type: 'keyvalue',
    },
  ],
}));
```

### Error Messages (shared/log.ts)

```typescript
import { formatStatus } from './utils/output-formatter.js';

console.error(formatStatus('Database connection failed', 'error'));
console.error(formatStatus('Retrying in 5 seconds...', 'info'));
```

### CLI Tool Output (scripts/db_admin.ts)

```typescript
import { formatTable, formatSectionHeader } from '../src/utils/output-formatter.js';

console.log(formatSectionHeader('Database Tables'));
console.log(...formatTable(
  ['Name', 'Rows', 'Size'],
  tables.map(t => [t.name, t.rows, t.size])
));
```

## Related Documents

- `src/utils/output-formatter.ts` — Formatting utilities implementation
- `src/utils/logger.js` — Centralized logger with auto-stats
- `docs/architecture.md` — System architecture including logging layer
- `ops/ROUTER.yaml` — File ownership and routing for logging surfaces

## Version History

- **1.0.0** (2025-11-08) — Initial standards document covering borders, sections, tables, lists, status messages, and complete output blocks

---

**Maintained by**: Infinity Gauntlet Operations Team  
**Questions**: See `ops/TOUCHMAP.yaml` for ownership and escalation paths
