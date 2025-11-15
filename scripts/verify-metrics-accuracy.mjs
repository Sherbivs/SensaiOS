#!/usr/bin/env node
/**
 * Metric Accuracy Verification Tool
 * 
 * AST-based analyzer to detect hardcoded estimates in reporting code.
 * Prevents regression of accuracy improvements from Tasks 1-9.
 * 
 * Usage:
 *   node scripts/verify-metrics-accuracy.mjs [files...]
 *   node scripts/verify-metrics-accuracy.mjs --all
 *   node scripts/verify-metrics-accuracy.mjs --staged
 * 
 * Exit codes:
 *   0 - No violations found
 *   1 - Violations found
 *   2 - Error during analysis
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Magic numbers that indicate hardcoded estimates
const MAGIC_NUMBERS = [50, 100, 150, 200, 250, 500, 750, 1000, 5000, 10000];

// Keywords indicating approximation/estimation
const ESTIMATE_KEYWORDS = [
  'about', 'roughly', 'approximately', 'typical', 'usually',
  'around', 'estimate', 'guess', 'probably', 'maybe'
];

// Patterns indicating hardcoded estimates in comments/strings
const ESTIMATE_PATTERNS = [
  /~\s*\d+/,                    // ~50, ~100
  /≈\s*\d+/,                    // ≈50
  /approximately\s+\d+/i,       // approximately 50
  /about\s+\d+/i,               // about 50
  /roughly\s+\d+/i,             // roughly 50
  /around\s+\d+/i,              // around 50
];

// Files/directories to always skip
const SKIP_PATTERNS = [
  /node_modules/,
  /\.git\//,
  /dist\//,
  /build\//,
  /coverage\//,
  /\.test\.(ts|js|mjs)$/,       // Test files can have hardcoded values for fixtures
  /\.spec\.(ts|js|mjs)$/,
  /vitest\.config/,
  /eslint\.config/,
  /tsconfig/,
];

// Measurement API patterns (these are GOOD - exact measurements)
const MEASUREMENT_APIS = [
  'process.memoryUsage()',
  'process.hrtime.bigint()',
  'performance.now()',
  'Date.now()',
  'Buffer.byteLength(',
  'JSON.stringify(',
  'fs.stat(',
  'fs.statSync(',
  'prisma.$queryRaw',
  'prisma.$metrics',
  'Map.size',
  'Array.length',
  'successCount++',
  'increment: 1',
];

class MetricViolation {
  constructor(type, file, line, column, message, context) {
    this.type = type;           // 'magic-number', 'estimate-keyword', 'estimate-pattern'
    this.file = file;
    this.line = line;
    this.column = column;
    this.message = message;
    this.context = context;     // Surrounding code for context
    this.severity = 'error';
  }

  toString() {
    return `${this.file}:${this.line}:${this.column} - ${this.message}\n  ${this.context}`;
  }
}

/**
 * Check if a file should be skipped based on patterns
 */
function shouldSkipFile(filePath) {
  return SKIP_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Simple token-based analysis (no full AST parser needed for this use case)
 * Detects numeric literals and keywords in metric-related contexts
 */
function analyzeFile(filePath) {
  const violations = [];
  
  if (shouldSkipFile(filePath)) {
    return violations;
  }

  if (!fs.existsSync(filePath)) {
    return violations;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Check if file is in a metrics/reporting context
  const isMetricsFile = 
    filePath.includes('/services/') ||
    filePath.includes('/shared/') ||
    filePath.includes('/utils/logger') ||
    filePath.includes('/bot/ops/') ||
    filePath.includes('/workers/');

  if (!isMetricsFile) {
    // Skip files not related to metrics/reporting
    return violations;
  }

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // Skip comments (but check them for estimate keywords)
    const isComment = trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
    
    // Check for estimate keywords in strings and comments
    if (trimmed.length > 0) {
      ESTIMATE_KEYWORDS.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(trimmed)) {
          // Check if it's in a measurement context
          const hasMeasurementAPI = MEASUREMENT_APIS.some(api => trimmed.includes(api));
          if (!hasMeasurementAPI && !isComment) {
            violations.push(new MetricViolation(
              'estimate-keyword',
              filePath,
              lineNum,
              trimmed.indexOf(keyword) + 1,
              `Estimate keyword "${keyword}" found in metric code`,
              trimmed.substring(0, 80)
            ));
          }
        }
      });

      // Check for estimate patterns (e.g., ~50, ≈100)
      ESTIMATE_PATTERNS.forEach(pattern => {
        const match = trimmed.match(pattern);
        if (match) {
          violations.push(new MetricViolation(
            'estimate-pattern',
            filePath,
            lineNum,
            match.index + 1,
            `Estimate pattern "${match[0]}" found in metric code`,
            trimmed.substring(0, 80)
          ));
        }
      });
    }

    // Check for magic numbers (only in non-comment, non-string contexts)
    if (!isComment && !trimmed.includes('"') && !trimmed.includes("'") && !trimmed.includes('`')) {
      MAGIC_NUMBERS.forEach(num => {
        const regex = new RegExp(`\\b${num}\\b`);
        if (regex.test(trimmed)) {
          // Check if it's a configuration constant (acceptable)
          const isConfig = 
            trimmed.includes('const') && (
              trimmed.includes('INTERVAL') ||
              trimmed.includes('TIMEOUT') ||
              trimmed.includes('LIMIT') ||
              trimmed.includes('MAX') ||
              trimmed.includes('MIN') ||
              trimmed.includes('THRESHOLD')
            );

          // Check if it's near a measurement API (likely safe)
          const hasMeasurementAPI = MEASUREMENT_APIS.some(api => trimmed.includes(api));

          if (!isConfig && !hasMeasurementAPI) {
            violations.push(new MetricViolation(
              'magic-number',
              filePath,
              lineNum,
              trimmed.indexOf(String(num)) + 1,
              `Potential hardcoded estimate: ${num} (magic number in metric code)`,
              trimmed.substring(0, 80)
            ));
          }
        }
      });
    }
  });

  return violations;
}

/**
 * Get list of staged files from git
 */
function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', { 
      encoding: 'utf-8',
      cwd: path.join(__dirname, '..')
    });
    return output.trim().split('\n').filter(f => f.length > 0);
  } catch (error) {
    console.error('Error getting staged files:', error.message);
    return [];
  }
}

/**
 * Get all TypeScript/JavaScript files in the project
 */
function getAllSourceFiles() {
  const files = [];
  const extensions = ['.ts', '.js', '.mjs'];

  function walkDir(dir) {
    if (shouldSkipFile(dir)) return;
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  const rootDir = path.join(__dirname, '..');
  ['src', 'scripts'].forEach(dir => {
    walkDir(path.join(rootDir, dir));
  });

  return files;
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);
  let filesToCheck = [];

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Metric Accuracy Verification Tool

Usage:
  node scripts/verify-metrics-accuracy.mjs [files...]
  node scripts/verify-metrics-accuracy.mjs --all
  node scripts/verify-metrics-accuracy.mjs --staged

Options:
  --all       Check all source files
  --staged    Check only staged files (for pre-commit hook)
  --help, -h  Show this help message

Exit codes:
  0 - No violations found
  1 - Violations found
  2 - Error during analysis
`);
    process.exit(0);
  }

  if (args.includes('--all')) {
    filesToCheck = getAllSourceFiles();
    console.log(`Checking ${filesToCheck.length} source files...`);
  } else if (args.includes('--staged')) {
    const staged = getStagedFiles();
    filesToCheck = staged
      .filter(f => /\.(ts|js|mjs)$/.test(f))
      .map(f => path.join(__dirname, '..', f));
    console.log(`Checking ${filesToCheck.length} staged files...`);
  } else {
    filesToCheck = args.map(f => path.resolve(f));
  }

  if (filesToCheck.length === 0) {
    console.log('No files to check.');
    process.exit(0);
  }

  // Analyze all files
  let allViolations = [];
  let checkedCount = 0;

  for (const file of filesToCheck) {
    const violations = analyzeFile(file);
    if (violations.length > 0) {
      allViolations = allViolations.concat(violations);
    }
    checkedCount++;
  }

  // Report results
  console.log(`\nChecked ${checkedCount} files.`);

  if (allViolations.length === 0) {
    console.log('✅ No metric accuracy violations found!\n');
    process.exit(0);
  }

  console.error(`\n❌ Found ${allViolations.length} metric accuracy violations:\n`);
  
  // Group violations by file
  const violationsByFile = {};
  allViolations.forEach(v => {
    if (!violationsByFile[v.file]) {
      violationsByFile[v.file] = [];
    }
    violationsByFile[v.file].push(v);
  });

  // Print violations grouped by file
  Object.keys(violationsByFile).forEach(file => {
    const violations = violationsByFile[file];
    console.error(`\n${file}:`);
    violations.forEach(v => {
      console.error(`  Line ${v.line}:${v.column} - ${v.message}`);
      console.error(`    ${v.context}`);
    });
  });

  console.error(`\n❌ ${allViolations.length} violations found. Please fix before committing.\n`);
  console.error('Tip: Use measurement APIs instead of hardcoded estimates:');
  console.error('  - process.memoryUsage() for memory metrics');
  console.error('  - process.hrtime.bigint() for timing');
  console.error('  - prisma.$queryRaw() for database counts');
  console.error('  - fs.stat() for file sizes');
  console.error('');

  process.exit(1);
}

// Run if called directly
main();

export { analyzeFile, MetricViolation };
