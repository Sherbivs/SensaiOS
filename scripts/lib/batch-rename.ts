#!/usr/bin/env npx tsx
/**
 * Batch Rename Utility
 * 
 * Renames snake_case files to kebab-case and updates all references
 * in package.json, imports, and documentation.
 * 
 * @usage npx tsx scripts/lib/batch-rename.ts [options]
 * @example
 *   npx tsx scripts/lib/batch-rename.ts --dry-run
 *   npx tsx scripts/lib/batch-rename.ts --execute
 *   npx tsx scripts/lib/batch-rename.ts --check
 * 
 * @module scripts/lib/batch-rename
 * @since 2025-12-23
 */

import {
  createCLI,
  c,
  printSection,
  printKeyValue,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  createSpinner,
  handleError,
  readText,
  writeText,
  exists,
  type CommandDef,
} from './index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface RenameCandidate {
  oldPath: string;
  newPath: string;
  oldName: string;
  newName: string;
}

interface ReferenceUpdate {
  file: string;
  oldRef: string;
  newRef: string;
  count: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert snake_case to kebab-case
 */
function toKebabCase(name: string): string {
  return name.replace(/_/g, '-');
}

/**
 * Check if filename uses snake_case
 */
function isSnakeCase(name: string): boolean {
  // Has underscore but not at start (private convention)
  return /_/.test(name) && !name.startsWith('_');
}

/**
 * Get all script files that use snake_case naming
 */
async function findSnakeCaseFiles(dir: string): Promise<RenameCandidate[]> {
  const candidates: RenameCandidate[] = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip archive and node_modules
        if (entry.name === 'archive' || entry.name === 'node_modules' || entry.name === 'lib') {
          continue;
        }
        // Recurse into subdirectories
        candidates.push(...await findSnakeCaseFiles(fullPath));
      } else if (entry.isFile() && isSnakeCase(entry.name)) {
        const newName = toKebabCase(entry.name);
        candidates.push({
          oldPath: fullPath,
          newPath: path.join(dir, newName),
          oldName: entry.name,
          newName: newName,
        });
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  
  return candidates;
}

/**
 * Find all references to a file in package.json
 */
async function findPackageJsonReferences(
  oldName: string, 
  newName: string
): Promise<ReferenceUpdate | null> {
  const pkgPath = 'package.json';
  
  if (!await exists(pkgPath)) {
    return null;
  }
  
  const content = await readText(pkgPath);
  const oldBaseName = path.basename(oldName, path.extname(oldName));
  const newBaseName = path.basename(newName, path.extname(newName));
  
  // Check for various reference patterns
  const patterns = [
    oldName,                    // Full filename
    oldBaseName,                // Without extension
    oldName.replace(/\\/g, '/'), // Unix-style paths
  ];
  
  let count = 0;
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = content.match(regex);
    if (matches) {
      count += matches.length;
    }
  }
  
  if (count === 0) {
    return null;
  }
  
  return {
    file: pkgPath,
    oldRef: oldName,
    newRef: newName,
    count,
  };
}

/**
 * Update references in package.json
 */
async function updatePackageJson(
  candidates: RenameCandidate[]
): Promise<number> {
  const pkgPath = 'package.json';
  
  if (!await exists(pkgPath)) {
    return 0;
  }
  
  let content = await readText(pkgPath);
  let totalUpdates = 0;
  
  for (const candidate of candidates) {
    // Replace various patterns
    const patterns = [
      [candidate.oldName, candidate.newName],
      [candidate.oldName.replace(/\\/g, '/'), candidate.newName.replace(/\\/g, '/')],
    ];
    
    for (const [oldPattern, newPattern] of patterns) {
      const regex = new RegExp(oldPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = content.match(regex);
      if (matches) {
        content = content.replace(regex, newPattern);
        totalUpdates += matches.length;
      }
    }
  }
  
  if (totalUpdates > 0) {
    await writeText(pkgPath, content);
  }
  
  return totalUpdates;
}

/**
 * Rename files
 */
async function renameFiles(candidates: RenameCandidate[]): Promise<number> {
  let renamed = 0;
  
  for (const candidate of candidates) {
    try {
      await fs.rename(candidate.oldPath, candidate.newPath);
      renamed++;
    } catch (error) {
      printError(`Failed to rename ${candidate.oldName}: ${error}`);
    }
  }
  
  return renamed;
}

// ============================================================================
// Commands
// ============================================================================

const checkCommand: CommandDef = {
  description: 'Check for snake_case files without making changes',
  run: async () => {
    printSection('Snake Case File Check');
    console.log();
    
    const spinner = createSpinner({ text: 'Scanning scripts directory...' });
    const candidates = await findSnakeCaseFiles('scripts');
    spinner.stop();
    
    if (candidates.length === 0) {
      printSuccess('No snake_case files found');
      return;
    }
    
    printWarning(`Found ${candidates.length} snake_case files:`);
    console.log();
    
    for (const candidate of candidates) {
      const relPath = path.relative('scripts', candidate.oldPath);
      console.log(`  ${c.red(candidate.oldName)} → ${c.green(candidate.newName)}`);
      console.log(`    ${c.gray(relPath)}`);
    }
    
    console.log();
    printKeyValue('Total files', candidates.length.toString());
    printInfo('Run with --execute to rename files');
  },
};

const dryRunCommand: CommandDef = {
  description: 'Show what would be renamed (no changes)',
  run: async () => {
    printSection('Dry Run - Batch Rename');
    console.log();
    
    const spinner = createSpinner({ text: 'Analyzing files...' });
    const candidates = await findSnakeCaseFiles('scripts');
    spinner.stop();
    
    if (candidates.length === 0) {
      printSuccess('No snake_case files found');
      return;
    }
    
    console.log(c.bold('Files to rename:'));
    console.log();
    
    for (const candidate of candidates) {
      console.log(`  ${c.red(candidate.oldName)}`);
      console.log(`  → ${c.green(candidate.newName)}`);
      console.log();
    }
    
    // Check package.json references
    console.log(c.bold('Package.json references to update:'));
    console.log();
    
    let totalRefs = 0;
    for (const candidate of candidates) {
      const ref = await findPackageJsonReferences(candidate.oldName, candidate.newName);
      if (ref) {
        console.log(`  ${candidate.oldName}: ${ref.count} reference(s)`);
        totalRefs += ref.count;
      }
    }
    
    if (totalRefs === 0) {
      console.log('  (no references found)');
    }
    
    console.log();
    printKeyValue('Files to rename', candidates.length.toString());
    printKeyValue('References to update', totalRefs.toString());
    console.log();
    printInfo('Run with --execute to apply changes');
  },
};

const executeCommand: CommandDef = {
  description: 'Execute the rename operation',
  flags: [
    { name: 'yes', short: 'y', description: 'Skip confirmation', type: 'boolean' },
  ],
  run: async ({ flags }) => {
    printSection('Batch Rename - Execute');
    console.log();
    
    const spinner = createSpinner({ text: 'Analyzing files...' });
    const candidates = await findSnakeCaseFiles('scripts');
    spinner.stop();
    
    if (candidates.length === 0) {
      printSuccess('No snake_case files found - nothing to do');
      return;
    }
    
    printWarning(`Will rename ${candidates.length} files`);
    console.log();
    
    for (const candidate of candidates) {
      console.log(`  ${c.red(candidate.oldName)} → ${c.green(candidate.newName)}`);
    }
    
    console.log();
    
    // Update package.json first
    printInfo('Updating package.json references...');
    const pkgUpdates = await updatePackageJson(candidates);
    printKeyValue('Package.json updates', pkgUpdates.toString());
    
    // Rename files
    printInfo('Renaming files...');
    const renamed = await renameFiles(candidates);
    printKeyValue('Files renamed', renamed.toString());
    
    console.log();
    if (renamed === candidates.length) {
      printSuccess('All files renamed successfully');
    } else {
      printWarning(`Renamed ${renamed}/${candidates.length} files`);
    }
  },
};

// ============================================================================
// CLI Setup
// ============================================================================

createCLI({
  name: 'batch-rename',
  description: 'Rename snake_case files to kebab-case',
  version: '1.0.0',
  commands: {
    check: checkCommand,
    'dry-run': dryRunCommand,
    execute: executeCommand,
  },
});
