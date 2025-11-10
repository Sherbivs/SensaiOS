# Console Output Quick Reference

**Version**: 1.0.0  
**For**: Developers working on Infinity Gauntlet  
**See Also**: `docs/console-output-standards.md` (comprehensive guide)

## Quick Start

```typescript
// Import formatter utilities
import {
  formatBorder,
  formatSectionHeader,
  formatKeyValueList,
  formatStatus,
} from '../src/utils/output-formatter.js';
```

## Common Patterns

### ✅ Clean Section Output

```typescript
// ❌ DON'T DO THIS
console.log('==========');
console.log('Database Status');
console.log('==========');

// ✅ DO THIS
console.log(formatBorder(75));
console.log('Database Status');
console.log(formatBorder(75));
```

### ✅ Aligned Key-Value Pairs

```typescript
// ❌ DON'T DO THIS
console.log('Status: HEALTHY');
console.log('Latency: 2.72ms');
console.log('Database: infinity_gauntlet');

// ✅ DO THIS
console.log(...formatKeyValueList([
  ['Status', 'HEALTHY'],
  ['Latency', '2.72ms'],
  ['Database', 'infinity_gauntlet'],
]));
```

### ✅ Status Messages

```typescript
// ❌ DON'T DO THIS
console.log('[SUCCESS] Database connected');
console.log('[ERROR] Connection failed');

// ✅ DO THIS
console.log(formatStatus('Database connected', 'success'));
console.log(formatStatus('Connection failed', 'error'));
```

### ✅ Section Headers

```typescript
// ❌ DON'T DO THIS
console.log('=== NODE ===');
console.log('*** DATABASE ***');

// ✅ DO THIS
console.log(formatSectionHeader('NODE'));
console.log(formatSectionHeader('DATABASE'));
```

### ✅ Complete Output Block

```typescript
// Multi-section display with borders
const output = formatOutputBlock({
  sections: [
    {
      header: 'NODE',
      content: formatKeyValueList([
        ['Uptime', '49s'],
        ['Memory', '188 MB'],
      ]),
    },
    {
      header: 'DATABASE',
      content: formatKeyValueList([
        ['Status', 'HEALTHY'],
        ['Latency', '2.72ms'],
      ]),
    },
  ],
  borders: true,
});

console.log(output);
```

**Output**:
```
─────────────────────────────────────────────────────────────────────────

[NODE]
  Uptime  : 49s
  Memory  : 188 MB

[DATABASE]
  Status  : HEALTHY
  Latency : 2.72ms

─────────────────────────────────────────────────────────────────────────
```

## Function Reference

| Function | Purpose | Example |
| --- | --- | --- |
| `formatBorder(width, style)` | Horizontal line | `formatBorder(75, 'light')` |
| `formatSectionHeader(title)` | Section header | `formatSectionHeader('NODE')` |
| `formatKeyValueList(pairs)` | Aligned key-values | `formatKeyValueList([['Key', 'Value']])` |
| `formatStatus(msg, status)` | Status with icon | `formatStatus('Done', 'success')` |
| `formatTable(headers, rows)` | Tabular data | `formatTable(['Name', 'Count'], rows)` |
| `formatList(items, options)` | Bulleted/numbered | `formatList(items, { numbered: true })` |

## Where to Use

### ✅ **ALWAYS USE** (Scripts & CLI Tools)

All files in `scripts/` **MUST** use output-formatter:

```typescript
// scripts/db_admin.ts
import { formatSectionHeader, formatKeyValueList } from '../src/utils/output-formatter.js';

console.log(formatSectionHeader('Database Tables'));
console.log(...formatKeyValueList([
  ['Tables', tableCount],
  ['Size', totalSize],
]));
```

### ✅ **RECOMMENDED** (Production Logging)

Production code should use centralized logger:

```typescript
// src/bot/commands/status.ts
import { log } from '../utils/logger.js';

log.info('Command executed', { userId, commandName });
```

### ❌ **NEVER USE** (Direct Console in Production)

**Forbidden** in `src/bot/`, `src/commands/`, `src/services/`:

```typescript
// ❌ BAD - Direct console in production code
console.log('User joined:', userId);

// ✅ GOOD - Use centralized logger
log.info('User joined', { userId });
```

## Status Icons

| Status | Icon | Use Case |
| --- | --- | --- |
| `success` | ✅ | Operation completed successfully |
| `warning` | ⚠️ | Non-critical issue or caution |
| `error` | ❌ | Operation failed |
| `info` | ℹ️ | Informational message |

```typescript
console.log(formatStatus('Database connected', 'success'));      // ✅
console.log(formatStatus('Cache nearly full', 'warning'));       // ⚠️
console.log(formatStatus('Connection timeout', 'error'));        // ❌
console.log(formatStatus('Starting sync...', 'info'));           // ℹ️
```

## Spacing Rules

### Vertical Spacing

```typescript
// ✅ CORRECT - Blank lines before/after borders
console.log('');  // Blank line before
console.log(formatBorder(75));
console.log('Content');
console.log(formatBorder(75));
console.log('');  // Blank line after

// ❌ WRONG - No spacing
console.log(formatBorder(75));
console.log('Content');
console.log(formatBorder(75));
```

### Horizontal Spacing

```typescript
// Indentation: 2 spaces per level
formatKeyValue('Key', 'Value', { indent: 0 });  // No indent
formatKeyValue('Key', 'Value', { indent: 1 });  //   2 spaces
formatKeyValue('Key', 'Value', { indent: 2 });  //     4 spaces
```

## Common Mistakes

### ❌ Mixing Border Styles

```typescript
// BAD
console.log('='.repeat(80));
console.log('*'.repeat(80));
console.log('-'.repeat(80));

// GOOD
console.log(formatBorder(80));
console.log(formatBorder(80));
console.log(formatBorder(80));
```

### ❌ Manual Alignment

```typescript
// BAD
console.log('Uptime: 49s');
console.log('Memory: 188 MB');
console.log('PID: 73');

// GOOD
console.log(...formatKeyValueList([
  ['Uptime', '49s'],
  ['Memory', '188 MB'],
  ['PID', '73'],
]));
```

### ❌ Inconsistent Indentation

```typescript
// BAD
console.log('  Line 1');
console.log('    Line 2');
console.log('   Line 3');

// GOOD
const lines = [
  '  Line 1',
  '  Line 2',
  '  Line 3',
];
lines.forEach(line => console.log(line));
```

## Migration Checklist

When updating existing code:

- [ ] Replace `console.log('='.repeat(N))` with `formatBorder(N)`
- [ ] Replace `[PREFIX]` messages with `formatStatus()`
- [ ] Replace manual alignment with `formatKeyValueList()`
- [ ] Replace section headers with `formatSectionHeader()`
- [ ] Add blank lines before/after borders
- [ ] Use consistent indentation (2 spaces)
- [ ] Test output appearance in terminal
- [ ] Run `npm run build` to verify no errors

## Testing Your Output

```typescript
// Create test script: scripts/test-output.ts
import { formatOutputBlock, formatKeyValueList } from '../src/utils/output-formatter.js';

const output = formatOutputBlock({
  sections: [
    {
      header: 'TEST SECTION',
      content: formatKeyValueList([
        ['Key1', 'Value1'],
        ['Key2', 'Value2'],
      ]),
    },
  ],
  borders: true,
});

console.log(output);
```

Run: `npx tsx scripts/test-output.ts`

## Getting Help

- **Standards**: See `docs/console-output-standards.md`
- **Examples**: See `scripts/db_replication.ts` (refactored)
- **API**: See `src/utils/output-formatter.ts` (source code)
- **Issues**: File issue with label `console-output`

## Version History

- **1.0.0** (2025-11-08) — Initial quick reference guide

---

**Maintained by**: Infinity Gauntlet Operations Team  
**Last Updated**: 2025-11-08
