#!/usr/bin/env npx ts-node
/**
 * Migrate Deprecated Log Pattern Script
 * 
 * Converts deprecated `import { log }` pattern to modern `getLogger()` pattern.
 * 
 * Usage:
 *   npx ts-node scripts/migrate-deprecated-log.ts --dir src/commands
 *   npx ts-node scripts/migrate-deprecated-log.ts --file src/index.ts
 *   npx ts-node scripts/migrate-deprecated-log.ts --dir src --dry-run
 *   npx ts-node scripts/migrate-deprecated-log.ts --all
 * 
 * Options:
 *   --dir <path>    Process all .ts files in directory recursively
 *   --file <path>   Process a single file
 *   --all           Process all src/ files with deprecated pattern
 *   --dry-run       Show what would change without writing files
 *   --verbose       Show detailed transformation info
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const dirIndex = args.indexOf('--dir');
const fileIndex = args.indexOf('--file');
const ALL_MODE = args.includes('--all');

// Files that define the logger - skip these
const SKIP_FILES = [
  'src/shared/logger.ts',
  'src/shared/logging/index.ts',
  'src/shared/log.ts',
];

// ============================================================================
// Component Name Derivation
// ============================================================================

function deriveComponent(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const fileName = path.basename(filePath, '.ts');
  
  // Map directory patterns to component names
  if (normalized.includes('/bot/homestead/')) return 'homestead';
  if (normalized.includes('/bot/state/')) return 'security-state';
  if (normalized.includes('/bot/daily/')) return 'daily';
  if (normalized.includes('/bot/ops/')) return 'ops';
  if (normalized.includes('/bot/')) return 'bot';
  if (normalized.includes('/workers/')) return 'worker';
  if (normalized.includes('/services/cache/')) return 'cache';
  if (normalized.includes('/services/database/')) return 'database';
  if (normalized.includes('/services/monitoring/')) return 'monitoring';
  if (normalized.includes('/services/')) return fileName.replace(/-/g, '-');
  if (normalized.includes('/commands/')) return 'command';
  if (normalized.includes('/runtime/')) return 'runtime';
  if (normalized.includes('/shared/')) return 'shared';
  if (normalized.includes('/lib/')) return 'lib';
  if (normalized.includes('/data/')) return 'data';
  if (normalized.includes('/dex/')) return 'dex';
  if (normalized.includes('/data_pipeline/')) return 'data-pipeline';
  if (normalized.includes('/utils/')) return 'utils';
  
  // Default to filename
  return fileName.replace(/[-_]/g, '-');
}

function deriveOperation(message: string, level: string): string {
  const msgLower = message.toLowerCase();
  
  if (msgLower.includes('initializ')) return 'init';
  if (msgLower.includes('start')) return 'start';
  if (msgLower.includes('stop') || msgLower.includes('shutdown')) return 'shutdown';
  if (msgLower.includes('connect')) return 'connect';
  if (msgLower.includes('disconnect')) return 'disconnect';
  if (msgLower.includes('load')) return 'load';
  if (msgLower.includes('save') || msgLower.includes('persist')) return 'save';
  if (msgLower.includes('refresh')) return 'refresh';
  if (msgLower.includes('sync')) return 'sync';
  if (msgLower.includes('query')) return 'query';
  if (msgLower.includes('fetch')) return 'fetch';
  if (msgLower.includes('cache')) return 'cache-op';
  if (msgLower.includes('spawn')) return 'spawn';
  if (msgLower.includes('battle')) return 'battle-op';
  if (msgLower.includes('command')) return 'command';
  if (msgLower.includes('register')) return 'register';
  if (msgLower.includes('cleanup') || msgLower.includes('prune')) return 'cleanup';
  if (level === 'error') return 'error';
  if (level === 'warn') return 'warning';
  
  return 'update';
}

// ============================================================================
// Import Pattern Detection and Replacement
// ============================================================================

// ONLY match deprecated imports from shared/logging/index.js
// Do NOT match src/shared/log.ts - that's the intentional low-level logger for database layer
const DEPRECATED_IMPORT_PATTERNS = [
  /import\s*\{\s*log\s*\}\s*from\s*['"]([^'"]*shared\/logging\/index\.js)['"]\s*;?/g,
  // Legacy patterns that may exist in old code
  /import\s*\{\s*log\s*\}\s*from\s*['"]([^'"]*utils\/logger\.js)['"]\s*;?/g,
  /import\s*\{\s*log\s*\}\s*from\s*['"]([^'"]*shared\/logger\.js)['"]\s*;?/g,
];

function hasDeprecatedImport(content: string): boolean {
  return DEPRECATED_IMPORT_PATTERNS.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(content);
  });
}

function calculateRelativePath(fromFile: string, toFile: string): string {
  const fromDir = path.dirname(fromFile);
  let relativePath = path.relative(fromDir, toFile).replace(/\\/g, '/');
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }
  return relativePath;
}

function replaceImport(content: string, filePath: string): string {
  // Calculate relative path to shared/logging/index.js
  const loggingModulePath = path.join(process.cwd(), 'src/shared/logging/index.js');
  const relativePath = calculateRelativePath(filePath, loggingModulePath);
  
  for (const pattern of DEPRECATED_IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      pattern.lastIndex = 0;
      content = content.replace(pattern, `import { getLogger } from '${relativePath}';`);
      break;
    }
  }
  
  return content;
}

function addLoggerConst(content: string): string {
  // Check if logger const already exists
  if (/const\s+logger\s*=\s*getLogger\s*\(\s*\)/.test(content)) {
    return content;
  }
  
  // Find the last import statement and add logger const after it
  const importMatches = [...content.matchAll(/^import\s+.*?;?\s*$/gm)];
  if (importMatches.length > 0) {
    const lastImport = importMatches[importMatches.length - 1];
    const insertPos = lastImport.index! + lastImport[0].length;
    
    content = content.slice(0, insertPos) + 
      '\n\nconst logger = getLogger();' + 
      content.slice(insertPos);
  }
  
  return content;
}

// ============================================================================
// Log Call Conversion
// ============================================================================

function convertLogCalls(content: string, component: string): string {
  // Pattern 1: log('level', 'message')
  // Pattern 2: log('level', 'message', { context })
  // Pattern 3: log('level', `template ${var}`)
  // Pattern 4: log('level', `template ${var}`, { context })
  // Pattern 5: log.warn('message')  - log as object with methods
  // Pattern 6: log.warn('message', { context })
  
  // Handle log.method('message') - no context (Pattern 5)
  content = content.replace(
    /\blog\.(warn|error|info|debug)\s*\(\s*(['"`].*?['"`])\s*\)/g,
    (match, level, message) => {
      const operation = deriveOperation(message, level);
      const mappedLevel = mapLogLevel(level);
      return `logger.${mappedLevel}('${component}', '${operation}', ${message})`;
    }
  );
  
  // Handle log.method('message', context) - with context (Pattern 6)
  content = content.replace(
    /\blog\.(warn|error|info|debug)\s*\(\s*(['"`][^'"`]*['"`]|`[^`]*`)\s*,\s*(\{[\s\S]*?\})\s*\)/g,
    (match, level, message, context) => {
      const operation = deriveOperation(message, level);
      const mappedLevel = mapLogLevel(level);
      const convertedContext = convertContext(context);
      return `logger.${mappedLevel}('${component}', '${operation}', ${message}, ${convertedContext})`;
    }
  );
  
  // Handle log.method('message', variable) - where context is a variable not object literal (Pattern 7)
  content = content.replace(
    /\blog\.(warn|error|info|debug)\s*\(\s*(['"`][^'"`]*['"`]|`[^`]*`)\s*,\s*(\w+)\s*\)/g,
    (match, level, message, contextVar) => {
      const operation = deriveOperation(message, level);
      const mappedLevel = mapLogLevel(level);
      // Wrap variable in metadata
      return `logger.${mappedLevel}('${component}', '${operation}', ${message}, { metadata: { data: ${contextVar} } })`;
    }
  );
  
  // Handle log('level', 'message') - no context
  content = content.replace(
    /\blog\s*\(\s*['"](\w+)['"]\s*,\s*(['"`].*?['"`])\s*\)/g,
    (match, level, message) => {
      const operation = deriveOperation(message, level);
      // Map deprecated levels to valid ones
      const mappedLevel = mapLogLevel(level);
      return `logger.${mappedLevel}('${component}', '${operation}', ${message})`;
    }
  );
  
  // Handle log('level', 'message', { context }) - with context
  // This is trickier - need to handle nested braces
  const logWithContextPattern = /\blog\s*\(\s*['"](\w+)['"]\s*,\s*(['"`][^'"`]*['"`]|`[^`]*`)\s*,\s*(\{[\s\S]*?\})\s*\)/g;
  
  content = content.replace(logWithContextPattern, (match, level, message, context) => {
    const operation = deriveOperation(message, level);
    const mappedLevel = mapLogLevel(level);
    const convertedContext = convertContext(context);
    return `logger.${mappedLevel}('${component}', '${operation}', ${message}, ${convertedContext})`;
  });
  
  return content;
}

function mapLogLevel(level: string): string {
  // Map any non-standard levels to valid Logger methods
  const levelMap: Record<string, string> = {
    'error': 'error',
    'warn': 'warn',
    'warning': 'warn',
    'info': 'info',
    'debug': 'debug',
    'detail': 'debug',
    'trace': 'debug',
    'success': 'info',
    'verbose': 'debug',
  };
  return levelMap[level.toLowerCase()] || 'info';
}

function convertContext(contextStr: string): string {
  // Known LogContext fields that can stay at top level
  const knownFields = [
    'userId', 'guildId', 'channelId',
    'correlationId', 'parentCorrelationId',
    'durationMs', 'latencyMs',
    'error', 'metadata',
  ];
  
  // Try to parse and check if we need to wrap in metadata
  try {
    // Simple heuristic: if context has unknown fields, wrap in metadata
    const fieldMatches = [...contextStr.matchAll(/(\w+)\s*:/g)];
    const fields = fieldMatches.map(m => m[1]);
    
    const hasUnknownFields = fields.some(f => !knownFields.includes(f));
    
    if (hasUnknownFields && !contextStr.includes('metadata:')) {
      // Check if it's just { error: something } - that needs special handling
      if (fields.length === 1 && fields[0] === 'error') {
        // Check if error is already an object or just a string
        if (contextStr.includes('error.message') && !contextStr.includes('error.name')) {
          // Wrap in metadata instead
          return contextStr.replace(/\{\s*error:\s*([^}]+)\}/, '{ metadata: { errorMsg: $1 } }');
        }
      }
      // Wrap the whole thing in metadata
      return `{ metadata: ${contextStr} }`;
    }
  } catch {
    // If parsing fails, wrap in metadata to be safe
    return `{ metadata: ${contextStr} }`;
  }
  
  return contextStr;
}

// ============================================================================
// File Processing
// ============================================================================

interface MigrationResult {
  file: string;
  success: boolean;
  skipped: boolean;
  changes: string[];
  error?: string;
}

function processFile(filePath: string): MigrationResult {
  const result: MigrationResult = {
    file: filePath,
    success: false,
    skipped: false,
    changes: [],
  };
  
  // Normalize path for comparison
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Skip logger definition files
  if (SKIP_FILES.some(skip => normalizedPath.endsWith(skip))) {
    result.skipped = true;
    result.success = true;
    result.changes.push('Skipped (logger definition file)');
    return result;
  }
  
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    
    // Check if file has deprecated import
    if (!hasDeprecatedImport(content)) {
      result.skipped = true;
      result.success = true;
      result.changes.push('No deprecated import found');
      return result;
    }
    
    const component = deriveComponent(filePath);
    result.changes.push(`Component: ${component}`);
    
    // Step 1: Replace import
    content = replaceImport(content, filePath);
    result.changes.push('Replaced import with getLogger');
    
    // Step 2: Add logger const
    content = addLoggerConst(content);
    result.changes.push('Added logger const');
    
    // Step 3: Convert log calls
    content = convertLogCalls(content, component);
    result.changes.push('Converted log() calls to logger.method()');
    
    if (content !== originalContent) {
      if (DRY_RUN) {
        console.log(`\n[DRY RUN] Would update: ${filePath}`);
        if (VERBOSE) {
          console.log('  ' + result.changes.join('\n  '));
        }
      } else {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`✅ Migrated: ${filePath}`);
      }
      result.success = true;
    } else {
      result.changes.push('No changes needed');
      result.success = true;
    }
    
    return result;
    
  } catch (error) {
    result.error = String(error);
    console.error(`❌ Error processing ${filePath}: ${error}`);
    return result;
  }
}

function findTsFiles(dir: string): string[] {
  const files: string[] = [];
  
  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      // Skip node_modules and dist
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Deprecated Log Migration Script');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('');
  
  let filesToProcess: string[] = [];
  
  if (fileIndex >= 0 && args[fileIndex + 1]) {
    filesToProcess = [args[fileIndex + 1]];
  } else if (dirIndex >= 0 && args[dirIndex + 1]) {
    const targetDir = args[dirIndex + 1];
    if (!fs.existsSync(targetDir)) {
      console.error(`Error: Directory not found: ${targetDir}`);
      process.exit(1);
    }
    filesToProcess = findTsFiles(targetDir);
  } else if (ALL_MODE) {
    filesToProcess = findTsFiles('src');
  } else {
    console.log('Usage:');
    console.log('  npx ts-node scripts/migrate-deprecated-log.ts --dir src/commands');
    console.log('  npx ts-node scripts/migrate-deprecated-log.ts --file src/index.ts');
    console.log('  npx ts-node scripts/migrate-deprecated-log.ts --all');
    console.log('  npx ts-node scripts/migrate-deprecated-log.ts --all --dry-run');
    process.exit(0);
  }
  
  // Filter to only files with deprecated pattern
  filesToProcess = filesToProcess.filter(f => {
    try {
      const content = fs.readFileSync(f, 'utf-8');
      return hasDeprecatedImport(content);
    } catch {
      return false;
    }
  });
  
  if (filesToProcess.length === 0) {
    console.log('✅ No files with deprecated log import found!');
    return;
  }
  
  console.log(`Found ${filesToProcess.length} files to process\n`);
  
  const results: MigrationResult[] = [];
  
  for (const file of filesToProcess) {
    const result = processFile(file);
    results.push(result);
  }
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Migration Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const migrated = results.filter(r => r.success && !r.skipped);
  const skipped = results.filter(r => r.skipped);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Migrated: ${migrated.length}`);
  console.log(`⏭️  Skipped: ${skipped.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  
  if (failed.length > 0) {
    console.log('\nFailed files:');
    for (const f of failed) {
      console.log(`  - ${f.file}: ${f.error}`);
    }
  }
  
  if (DRY_RUN) {
    console.log('\n⚠️  This was a DRY RUN. No files were modified.');
    console.log('   Run without --dry-run to apply changes.');
  }
}

main().catch(console.error);
