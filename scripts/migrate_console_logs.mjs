#!/usr/bin/env node
/**
 * Console Log Migration Script
 * 
 * Automatically replaces console.log/warn/error/debug calls with centralized log() API.
 * Run with: node scripts/migrate_console_logs.mjs [--dry-run]
 */

import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const isDryRun = process.argv.includes('--dry-run');

console.log('='.repeat(80));
console.log('CONSOLE LOG MIGRATION');
console.log('='.repeat(80));
console.log('');
console.log(`Mode: ${isDryRun ? 'DRY RUN (no files modified)' : 'LIVE (files will be modified)'}`);
console.log('');

// Find all TypeScript and JavaScript files in src/
const files = globSync('src/**/*.{js,ts}', {
  ignore: [
    '**/node_modules/**',
    '**/dist/**',
    '**/*.test.{js,ts}',
    '**/*.spec.{js,ts}'
  ]
});

console.log(`Found ${files.length} files to scan`);
console.log('');

const stats = {
  filesScanned: 0,
  filesModified: 0,
  logReplaced: 0,
  warnReplaced: 0,
  errorReplaced: 0,
  debugReplaced: 0,
  importsAdded: 0
};

const modifications = [];

files.forEach(file => {
  stats.filesScanned++;
  
  // Skip logger files to avoid circular imports
  if (file.includes('utils/logger.js') || file.includes('utils\\logger.js') ||
      file.includes('shared/log.ts') || file.includes('shared\\log.ts')) {
    return;
  }
  
  let content = readFileSync(file, 'utf8');
  const original = content;
  
  // Track replacements
  let fileModified = false;
  
  // Replace console.log → log.info
  const logMatches = content.match(/console\.log\(/g);
  if (logMatches) {
    content = content.replace(/console\.log\(/g, 'log.info(');
    stats.logReplaced += logMatches.length;
    fileModified = true;
  }
  
  // Replace console.warn → log.warn
  const warnMatches = content.match(/console\.warn\(/g);
  if (warnMatches) {
    content = content.replace(/console\.warn\(/g, 'log.warn(');
    stats.warnReplaced += warnMatches.length;
    fileModified = true;
  }
  
  // Replace console.error → log.error
  const errorMatches = content.match(/console\.error\(/g);
  if (errorMatches) {
    content = content.replace(/console\.error\(/g, 'log.error(');
    stats.errorReplaced += errorMatches.length;
    fileModified = true;
  }
  
  // Replace console.debug → log.debug
  const debugMatches = content.match(/console\.debug\(/g);
  if (debugMatches) {
    content = content.replace(/console\.debug\(/g, 'log.debug(');
    stats.debugReplaced += debugMatches.length;
    fileModified = true;
  }
  
  // Add import if log.* detected but no import statement
  if (fileModified && !/import.*log.*from.*logger/.test(content)) {
    // Determine correct import path depth
    // file is like "src/bot/main.js" or "src\bot\main.js" (Windows)
    // Normalize to forward slashes for consistent splitting
    const normalizedFile = file.replace(/\\/g, '/');
    const pathParts = normalizedFile.split('/');
    const srcIndex = pathParts.indexOf('src');
    const depth = pathParts.length - srcIndex - 2; // -2 for src/ and filename
    const importPath = depth > 0 ? '../'.repeat(depth) + 'utils/logger.js' : './utils/logger.js';
    
    // Add import at top (after any existing imports)
    const importStatement = `import { log } from '${importPath}';\n`;
    
    // Find insertion point (after last import or at start)
    const lastImportMatch = content.match(/import .* from .*;\n/g);
    if (lastImportMatch) {
      const lastImport = lastImportMatch[lastImportMatch.length - 1];
      const insertIndex = content.lastIndexOf(lastImport) + lastImport.length;
      content = content.slice(0, insertIndex) + importStatement + content.slice(insertIndex);
    } else {
      // No imports found, add at top (after any comments/shebangs)
      const firstLineMatch = content.match(/^(#!.*\n|\/\*\*[\s\S]*?\*\/\n)?/);
      const insertIndex = firstLineMatch ? firstLineMatch[0].length : 0;
      content = content.slice(0, insertIndex) + importStatement + content.slice(insertIndex);
    }
    
    stats.importsAdded++;
  }
  
  if (fileModified) {
    stats.filesModified++;
    
    modifications.push({
      file,
      logReplaced: logMatches?.length || 0,
      warnReplaced: warnMatches?.length || 0,
      errorReplaced: errorMatches?.length || 0,
      debugReplaced: debugMatches?.length || 0,
      importAdded: /import.*log.*from.*logger/.test(content) && !/import.*log.*from.*logger/.test(original)
    });
    
    if (!isDryRun) {
      writeFileSync(file, content, 'utf8');
    }
  }
});

console.log('='.repeat(80));
console.log('MIGRATION SUMMARY');
console.log('='.repeat(80));
console.log('');
console.log(`Files Scanned:       ${stats.filesScanned.toString().padStart(5)}`);
console.log(`Files Modified:      ${stats.filesModified.toString().padStart(5)}`);
console.log('');
console.log('Replacements:');
console.log(`  console.log →      ${stats.logReplaced.toString().padStart(5)} log.info()`);
console.log(`  console.warn →     ${stats.warnReplaced.toString().padStart(5)} log.warn()`);
console.log(`  console.error →    ${stats.errorReplaced.toString().padStart(5)} log.error()`);
console.log(`  console.debug →    ${stats.debugReplaced.toString().padStart(5)} log.debug()`);
console.log(`  Total:             ${(stats.logReplaced + stats.warnReplaced + stats.errorReplaced + stats.debugReplaced).toString().padStart(5)}`);
console.log('');
console.log(`Imports Added:       ${stats.importsAdded.toString().padStart(5)}`);
console.log('');

if (modifications.length > 0) {
  console.log('Modified Files:');
  console.log('');
  modifications.forEach(mod => {
    const replacements = [];
    if (mod.logReplaced) replacements.push(`${mod.logReplaced} log`);
    if (mod.warnReplaced) replacements.push(`${mod.warnReplaced} warn`);
    if (mod.errorReplaced) replacements.push(`${mod.errorReplaced} error`);
    if (mod.debugReplaced) replacements.push(`${mod.debugReplaced} debug`);
    
    console.log(`  ${mod.file}`);
    console.log(`    Replaced: ${replacements.join(', ')}`);
    if (mod.importAdded) {
      console.log(`    Added: import { log } from 'utils/logger.js'`);
    }
  });
  console.log('');
}

if (isDryRun) {
  console.log('⚠️  DRY RUN: No files were modified.');
  console.log('   Run without --dry-run to apply changes.');
} else {
  console.log('✅ Migration complete. Files have been modified.');
  console.log('');
  console.log('Next Steps:');
  console.log('  1. Review changes: git diff src/');
  console.log('  2. Run tests: npm test');
  console.log('  3. Run linter: npm run lint');
  console.log('  4. Commit changes: git commit -am "refactor: migrate console.* to log() API"');
}

console.log('');
console.log('='.repeat(80));
console.log('');
