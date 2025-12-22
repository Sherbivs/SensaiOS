#!/usr/bin/env npx ts-node
/**
 * Migration Script: Deprecated log → Modern getLogger
 * 
 * This script automates the migration from the deprecated log() function
 * to the modern getLogger() factory pattern.
 * 
 * Usage:
 *   npx ts-node scripts/migrate-log-to-getLogger.ts --dry-run
 *   npx ts-node scripts/migrate-log-to-getLogger.ts --file src/services/cache.ts
 *   npx ts-node scripts/migrate-log-to-getLogger.ts --all
 */

import * as fs from 'fs';
import * as path from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
const SINGLE_FILE = process.argv.includes('--file');
const ALL_FILES = process.argv.includes('--all');

// Files to migrate (excluding docs, tests, already migrated)
const TARGET_PATTERNS = [
  'src/**/*.ts',
];

const EXCLUDE_PATTERNS = [
  '**/error-brain/**',  // Already migrated
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/node_modules/**',
  '**/dist/**',
];

interface MigrationResult {
  file: string;
  success: boolean;
  changes: string[];
  error?: string;
}

/**
 * Derives component name from file path
 * e.g., src/services/cache.ts → 'cache'
 * e.g., src/bot/homestead/home.ts → 'homestead'
 */
function deriveComponent(filePath: string): string {
  const parsed = path.parse(filePath);
  const dir = path.dirname(filePath);
  
  // Extract meaningful component name
  if (dir.includes('services')) {
    return parsed.name.replace(/-/g, '-');
  }
  if (dir.includes('bot/homestead')) {
    return 'homestead';
  }
  if (dir.includes('bot/state')) {
    return 'security-state';
  }
  if (dir.includes('bot/daily')) {
    return 'daily';
  }
  if (dir.includes('bot/ops')) {
    return 'ops';
  }
  if (dir.includes('bot')) {
    return 'bot';
  }
  if (dir.includes('workers')) {
    return 'worker';
  }
  if (dir.includes('runtime')) {
    return 'runtime';
  }
  if (dir.includes('lib')) {
    return 'lib';
  }
  if (dir.includes('commands')) {
    return 'command';
  }
  if (dir.includes('data')) {
    return 'data';
  }
  if (dir.includes('shared')) {
    return 'shared';
  }
  if (dir.includes('dex')) {
    return 'dex';
  }
  
  return parsed.name.replace(/[-_]/g, '-');
}

/**
 * Parse log() call patterns from code
 */
function parseLogCalls(content: string): Array<{
  original: string;
  level: string;
  message: string;
  context: string | null;
  lineStart: number;
  lineEnd: number;
}> {
  const calls: ReturnType<typeof parseLogCalls> = [];
  
  // Pattern: log('level', 'message', { context }) or log('level', 'message')
  // Also handles: log.info('message', { context })
  const logCallRegex = /log\s*\(\s*['"](\w+)['"]\s*,\s*(['"`][^'"`]*['"`]|`[^`]*`)\s*(?:,\s*(\{[\s\S]*?\}))?\s*\)/gm;
  const logMethodRegex = /log\.(\w+)\s*\(\s*(['"`][^'"`]*['"`]|`[^`]*`)\s*(?:,\s*(\{[\s\S]*?\}))?\s*\)/gm;
  
  let match;
  
  // Match log('level', 'message', context) pattern
  while ((match = logCallRegex.exec(content)) !== null) {
    const lineStart = content.substring(0, match.index).split('\n').length;
    const lineEnd = content.substring(0, match.index + match[0].length).split('\n').length;
    
    calls.push({
      original: match[0],
      level: match[1],
      message: match[2],
      context: match[3] || null,
      lineStart,
      lineEnd,
    });
  }
  
  // Match log.info('message', context) pattern
  while ((match = logMethodRegex.exec(content)) !== null) {
    const lineStart = content.substring(0, match.index).split('\n').length;
    const lineEnd = content.substring(0, match.index + match[0].length).split('\n').length;
    
    calls.push({
      original: match[0],
      level: match[1],
      message: match[2],
      context: match[3] || null,
      lineStart,
      lineEnd,
    });
  }
  
  return calls;
}

/**
 * Convert context object properties to LogContext format
 * Custom properties must be wrapped in metadata: { ... }
 */
function convertContext(contextStr: string | null): string {
  if (!contextStr) {
    return '';
  }
  
  // Known LogContext fields (keep at top level)
  const knownFields = [
    'userId', 'guildId', 'channelId',
    'correlationId', 'parentCorrelationId',
    'durationMs', 'latencyMs',
    'error', 'metadata',
  ];
  
  // Parse the context object (simple approach - works for most cases)
  // This is a simplified parser - complex cases may need manual review
  try {
    // Remove outer braces
    let inner = contextStr.trim();
    if (inner.startsWith('{')) inner = inner.slice(1);
    if (inner.endsWith('}')) inner = inner.slice(0, -1);
    inner = inner.trim();
    
    if (!inner) return '';
    
    // Check if all fields are known
    const fieldPattern = /(\w+)\s*:/g;
    const fields: string[] = [];
    let fieldMatch;
    while ((fieldMatch = fieldPattern.exec(inner)) !== null) {
      fields.push(fieldMatch[1]);
    }
    
    const unknownFields = fields.filter(f => !knownFields.includes(f));
    
    if (unknownFields.length === 0) {
      // All fields are known, return as-is
      return contextStr;
    }
    
    // Wrap in metadata
    return `{ metadata: ${contextStr} }`;
  } catch {
    // If parsing fails, wrap everything in metadata to be safe
    return `{ metadata: ${contextStr} }`;
  }
}

/**
 * Derive operation from log message
 */
function deriveOperation(message: string, level: string): string {
  // Extract operation hints from message
  const msgLower = message.toLowerCase();
  
  // Common operations
  if (msgLower.includes('initializ')) return 'init';
  if (msgLower.includes('start')) return 'start';
  if (msgLower.includes('stop')) return 'stop';
  if (msgLower.includes('shutdown')) return 'shutdown';
  if (msgLower.includes('connect')) return 'connect';
  if (msgLower.includes('disconnect')) return 'disconnect';
  if (msgLower.includes('load')) return 'load';
  if (msgLower.includes('save')) return 'save';
  if (msgLower.includes('refresh')) return 'refresh';
  if (msgLower.includes('sync')) return 'sync';
  if (msgLower.includes('query')) return 'query';
  if (msgLower.includes('fetch')) return 'fetch';
  if (msgLower.includes('cache')) return 'cache-op';
  if (msgLower.includes('spawn')) return 'spawn';
  if (msgLower.includes('battle')) return 'battle-op';
  if (msgLower.includes('command')) return 'command';
  if (msgLower.includes('request')) return 'request';
  if (msgLower.includes('response')) return 'response';
  if (msgLower.includes('error') || level === 'error') return 'error';
  if (msgLower.includes('warn') || level === 'warn') return 'warning';
  
  // Default to log level as operation
  return level === 'error' ? 'error' : 'update';
}

/**
 * Migrate a single file from log() to getLogger()
 */
function migrateFile(filePath: string): MigrationResult {
  const result: MigrationResult = {
    file: filePath,
    success: false,
    changes: [],
  };
  
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    
    // Check if already using getLogger
    if (content.includes('getLogger()') && !content.includes('import { log }')) {
      result.success = true;
      result.changes.push('Already migrated');
      return result;
    }
    
    // Find import statement patterns
    const importPatterns = [
      /import\s*\{\s*log\s*\}\s*from\s*['"][^'"]*logging\/index\.js['"]\s*;?/g,
      /import\s*\{\s*log\s*\}\s*from\s*['"][^'"]*shared\/log\.js['"]\s*;?/g,
      /import\s*\{\s*log\s*\}\s*from\s*['"][^'"]*utils\/logger\.js['"]\s*;?/g,
      /import\s*\{\s*log\s*\}\s*from\s*['"][^'"]*shared\/logger\.js['"]\s*;?/g,
    ];
    
    let hasLogImport = false;
    for (const pattern of importPatterns) {
      if (pattern.test(content)) {
        hasLogImport = true;
        break;
      }
    }
    
    if (!hasLogImport) {
      result.success = true;
      result.changes.push('No deprecated log import found');
      return result;
    }
    
    const component = deriveComponent(filePath);
    
    // Step 1: Update import statement
    let importUpdated = false;
    for (const pattern of importPatterns) {
      if (pattern.test(content)) {
        // Calculate relative path to logging/index.js
        const fileDir = path.dirname(filePath);
        const loggingPath = 'src/shared/logging/index.js';
        let relativePath = path.relative(fileDir, loggingPath).replace(/\\/g, '/');
        if (!relativePath.startsWith('.')) relativePath = './' + relativePath;
        
        content = content.replace(pattern, `import { getLogger } from '${relativePath}';`);
        importUpdated = true;
        result.changes.push(`Updated import to getLogger from ${relativePath}`);
        break;
      }
    }
    
    if (!importUpdated) {
      result.error = 'Could not update import statement';
      return result;
    }
    
    // Step 2: Add logger const after imports
    const lastImportMatch = content.match(/^import\s+.*?;?\s*$/gm);
    if (lastImportMatch) {
      const lastImportIndex = content.lastIndexOf(lastImportMatch[lastImportMatch.length - 1]);
      const insertPoint = lastImportIndex + lastImportMatch[lastImportMatch.length - 1].length;
      
      // Check if logger const already exists
      if (!content.includes('const logger = getLogger();')) {
        content = content.slice(0, insertPoint) + 
          `\n\nconst logger = getLogger();` + 
          content.slice(insertPoint);
        result.changes.push('Added logger const');
      }
    }
    
    // Step 3: Convert log() calls to logger.level() calls
    const logCalls = parseLogCalls(content);
    
    for (const call of logCalls.reverse()) { // Process in reverse to maintain positions
      const operation = deriveOperation(call.message, call.level);
      const contextStr = convertContext(call.context);
      
      let replacement: string;
      if (contextStr) {
        replacement = `logger.${call.level}('${component}', '${operation}', ${call.message}, ${contextStr})`;
      } else {
        replacement = `logger.${call.level}('${component}', '${operation}', ${call.message})`;
      }
      
      content = content.replace(call.original, replacement);
      result.changes.push(`Line ${call.lineStart}: ${call.level}() → logger.${call.level}()`);
    }
    
    // Step 4: Handle log.level() method calls
    const logMethodPattern = /log\.(\w+)\s*\(/g;
    content = content.replace(logMethodPattern, 'logger.$1(');
    
    if (content !== originalContent) {
      if (DRY_RUN) {
        console.log(`\n[DRY RUN] Would update: ${filePath}`);
        console.log(result.changes.join('\n  '));
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
    return result;
  }
}

/**
 * Find all files matching patterns
 */
function findFiles(patterns: string[], exclude: string[]): string[] {
  const files: string[] = [];
  
  function walkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = fullPath.replace(/\\/g, '/');
      
      // Check excludes
      const shouldExclude = exclude.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
        return regex.test(relativePath);
      });
      
      if (shouldExclude) continue;
      
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }
  
  walkDir('src');
  return files;
}

/**
 * Main migration function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Log Migration Tool: log() → getLogger()');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);
  
  let filesToProcess: string[] = [];
  
  if (SINGLE_FILE) {
    const fileIndex = process.argv.indexOf('--file') + 1;
    if (fileIndex > 0 && process.argv[fileIndex]) {
      filesToProcess = [process.argv[fileIndex]];
    }
  } else if (ALL_FILES) {
    filesToProcess = findFiles(TARGET_PATTERNS, EXCLUDE_PATTERNS);
    
    // Filter to only files with deprecated log import
    filesToProcess = filesToProcess.filter(f => {
      const content = fs.readFileSync(f, 'utf-8');
      return content.includes('import { log }');
    });
  }
  
  if (filesToProcess.length === 0) {
    console.log('No files to process. Use --file <path> or --all');
    return;
  }
  
  console.log(`Processing ${filesToProcess.length} files...\n`);
  
  const results: MigrationResult[] = [];
  
  for (const file of filesToProcess) {
    const result = migrateFile(file);
    results.push(result);
  }
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Migration Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successful: ${successful.length}`);
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
