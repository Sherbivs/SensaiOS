#!/usr/bin/env npx tsx
/**
 * Console Migration Scanner
 * 
 * Scans codebase for console.* calls and helps migrate them to envelope system.
 * 
 * Usage:
 *   npm run migrate:scan                    # Scan all files
 *   npm run migrate:scan -- --top 10        # Show top 10 files
 *   npm run migrate:scan -- --file src/foo  # Scan specific file
 *   npm run migrate:scan -- --generate      # Generate import statements
 * 
 * @module scripts/migrate-console
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import { 
  analyzeFile, 
  detectComponent, 
  generateImportStatement,
  type MigrationStats 
} from '../src/observability/envelope/migrate.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/*.d.ts',
  '**/archive/**',
  '**/envelope/**',  // Don't scan our own code
];

const SCAN_PATTERNS = [
  'src/**/*.ts',
  'scripts/**/*.ts',
];

// ═══════════════════════════════════════════════════════════════════════════
// SCANNER
// ═══════════════════════════════════════════════════════════════════════════

interface ScanResult {
  files: MigrationStats[];
  totalCalls: number;
  totalFiles: number;
  migratedFiles: number;
}

async function scanFiles(patterns: string[], ignore: string[]): Promise<ScanResult> {
  const files: MigrationStats[] = [];
  let totalCalls = 0;
  let migratedFiles = 0;

  for (const pattern of patterns) {
    const matches = await glob(pattern, { ignore, absolute: true });
    
    for (const filePath of matches) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const stats = analyzeFile(content, filePath);
      
      if (stats.consoleCalls > 0) {
        files.push(stats);
        totalCalls += stats.consoleCalls;
        if (stats.migrated) migratedFiles++;
      }
    }
  }

  // Sort by console calls descending
  files.sort((a, b) => b.consoleCalls - a.consoleCalls);

  return {
    files,
    totalCalls,
    totalFiles: files.length,
    migratedFiles,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT FORMATTERS
// ═══════════════════════════════════════════════════════════════════════════

function formatTable(files: MigrationStats[], limit?: number): string {
  const display = limit ? files.slice(0, limit) : files;
  
  const lines: string[] = [
    '',
    '┌─────────────────────────────────────────────────────────────────────────────────┐',
    '│ Console Migration Scanner                                                       │',
    '├──────┬────────────────────────────────────────────────────────┬─────────────────┤',
    '│ Calls│ File                                                   │ Component       │',
    '├──────┼────────────────────────────────────────────────────────┼─────────────────┤',
  ];

  for (const file of display) {
    const relativePath = path.relative(process.cwd(), file.filePath);
    const shortPath = relativePath.length > 54 ? '...' + relativePath.slice(-51) : relativePath.padEnd(54);
    const component = file.component.padEnd(15);
    const calls = String(file.consoleCalls).padStart(4);
    const status = file.migrated ? '✓' : ' ';
    
    lines.push(`│ ${calls} ${status}│ ${shortPath} │ ${component} │`);
  }

  lines.push('└──────┴────────────────────────────────────────────────────────┴─────────────────┘');
  
  return lines.join('\n');
}

function formatSummary(result: ScanResult): string {
  const migrationPercent = result.totalFiles > 0 
    ? ((result.migratedFiles / result.totalFiles) * 100).toFixed(1) 
    : '0.0';

  return `
╔═══════════════════════════════════════════════════════════════════════════════╗
║                           MIGRATION SUMMARY                                    ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  Total console.* calls:  ${String(result.totalCalls).padStart(6)}                                            ║
║  Files with calls:       ${String(result.totalFiles).padStart(6)}                                            ║
║  Already migrated:       ${String(result.migratedFiles).padStart(6)} (${migrationPercent.padStart(5)}%)                                   ║
║  Remaining to migrate:   ${String(result.totalFiles - result.migratedFiles).padStart(6)}                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`;
}

function formatGeneratedImport(file: MigrationStats): string {
  return `
// ═══════════════════════════════════════════════════════════════════════════
// File: ${path.relative(process.cwd(), file.filePath)}
// Console calls: ${file.consoleCalls}
// ═══════════════════════════════════════════════════════════════════════════

${generateImportStatement(file.component)}
// Now all console.log/warn/error calls will output structured envelopes
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let limit: number | undefined;
  let generateImports = false;
  let specificFile: string | undefined;
  let showHelp = false;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--top':
      case '-t':
        limit = parseInt(args[++i], 10);
        break;
      case '--generate':
      case '-g':
        generateImports = true;
        break;
      case '--file':
      case '-f':
        specificFile = args[++i];
        break;
      case '--json':
      case '-j':
        jsonOutput = true;
        break;
      case '--help':
      case '-h':
        showHelp = true;
        break;
    }
  }

  if (showHelp) {
    console.log(`
Console Migration Scanner

Scans for console.* calls and helps migrate to envelope system.

USAGE:
  npm run migrate:scan [options]

OPTIONS:
  --top, -t <n>     Show top N files (default: all)
  --file, -f <path> Scan specific file or directory
  --generate, -g    Generate import statements for migration
  --json, -j        Output as JSON
  --help, -h        Show this help

EXAMPLES:
  npm run migrate:scan                    # Scan all files
  npm run migrate:scan -- --top 10        # Top 10 offenders
  npm run migrate:scan -- -f src/bot      # Scan bot directory
  npm run migrate:scan -- -g -t 5         # Generate imports for top 5
`);
    return;
  }

  // Determine patterns to scan
  const patterns = specificFile 
    ? [specificFile.includes('*') ? specificFile : `${specificFile}/**/*.ts`]
    : SCAN_PATTERNS;

  console.log('🔍 Scanning for console.* calls...\n');

  const result = await scanFiles(patterns, IGNORE_PATTERNS);

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Display results
  console.log(formatSummary(result));
  console.log(formatTable(result.files, limit));

  // Generate imports if requested
  if (generateImports) {
    const filesToGenerate = limit ? result.files.slice(0, limit) : result.files.slice(0, 5);
    
    console.log('\n\n📝 Generated Import Statements:\n');
    console.log('Add these to the top of each file to migrate:\n');
    
    for (const file of filesToGenerate) {
      if (!file.migrated) {
        console.log(formatGeneratedImport(file));
      }
    }
  }

  // Recommendations
  if (result.totalFiles > 0 && !generateImports) {
    console.log(`
💡 RECOMMENDATIONS:

1. Start with the highest-count files above
2. Run with --generate to get import statements
3. Add the import, test, then commit

Quick migration for a file:
  npm run migrate:scan -- -f <path> -g

`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
