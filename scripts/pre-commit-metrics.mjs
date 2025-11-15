#!/usr/bin/env node
/**
 * Pre-commit hook for metric accuracy verification
 * 
 * Runs the metric accuracy analyzer on staged files before commit.
 * Prevents commits that introduce hardcoded estimates in metric code.
 * 
 * Installation:
 *   npm run setup-git-hooks
 * 
 * Manual installation:
 *   cp scripts/pre-commit-metrics.mjs .git/hooks/pre-commit
 *   chmod +x .git/hooks/pre-commit
 */

import { execSync } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKIP_HOOK = process.env.SKIP_METRICS_HOOK === '1';

if (SKIP_HOOK) {
  console.log('⏩ Skipping metric accuracy verification (SKIP_METRICS_HOOK=1)');
  process.exit(0);
}

console.log('🔍 Running metric accuracy verification on staged files...');

try {
  // Run the verification script on staged files
  execSync('node scripts/verify-metrics-accuracy.mjs --staged', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });
  
  console.log('✅ Metric accuracy verification passed!');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Pre-commit hook failed: Metric accuracy violations found.');
  console.error('\nTo skip this check (NOT RECOMMENDED), run:');
  console.error('  SKIP_METRICS_HOOK=1 git commit ...');
  console.error('\nOr fix the violations before committing.\n');
  process.exit(1);
}
