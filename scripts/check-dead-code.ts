#!/usr/bin/env npx ts-node

/**
 * Dead Code Checker Script
 * ========================
 *
 * Analyzes the codebase for unused exports and dependencies.
 * Run locally before committing to catch dead code early.
 *
 * Usage:
 *   npx ts-node scripts/check-dead-code.ts
 *   npm run check:dead-code
 *
 * @see docs/development-bible/10-dead-code-analysis.md
 * @since 2025-12-21
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { formatSectionHeader, formatKeyValueList, formatList, printSuccess, printError, printWarning, printInfo } from '../src/utils/output-formatter.js';

// ============================================================================
// Types
// ============================================================================

interface DeadCodeReport {
  unusedExports: UnusedExport[];
  unusedDependencies: string[];
  unusedDevDependencies: string[];
  timestamp: string;
  summary: {
    totalUnusedExports: number;
    totalUnusedDeps: number;
    totalUnusedDevDeps: number;
    healthScore: number; // 0-100, higher is better
  };
}

interface UnusedExport {
  file: string;
  export: string;
  line: number;
}

interface DepcheckResult {
  dependencies: string[];
  devDependencies: string[];
  missing: Record<string, string[]>;
  using: Record<string, string[]>;
}

// ============================================================================
// Main Function
// ============================================================================

async function checkDeadCode(): Promise<DeadCodeReport> {
  console.log(formatSectionHeader('Dead Code Analysis'));
  console.log();

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Check unused exports with ts-prune
  // ─────────────────────────────────────────────────────────────────────────
  printInfo('Checking unused exports (ts-prune)...');
  
  let unusedExports: UnusedExport[] = [];
  try {
    // ts-prune exits with error if it finds issues, so we catch that
    const output = execSync('npx ts-prune 2>&1', { 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    unusedExports = parseUnusedExports(output);
  } catch (error) {
    // ts-prune exits with error code when it finds unused exports
    if (error instanceof Error && 'stdout' in error) {
      const stdout = (error as { stdout: string }).stdout;
      unusedExports = parseUnusedExports(stdout);
    }
  }
  
  console.log(formatKeyValueList([['Unused exports found', String(unusedExports.length)]]));
  if (unusedExports.length > 0 && unusedExports.length <= 5) {
    console.log(formatList(unusedExports.map(e => `${e.file}:${e.line} → ${e.export}`), { indent: 1 }));
  } else if (unusedExports.length > 5) {
    console.log(formatList(unusedExports.slice(0, 5).map(e => `${e.file}:${e.line} → ${e.export}`), { indent: 1 }));
    printInfo(`... and ${unusedExports.length - 5} more`);
  }
  console.log();

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Check unused dependencies with depcheck
  // ─────────────────────────────────────────────────────────────────────────
  printInfo('Checking unused dependencies (depcheck)...');
  
  let unusedDependencies: string[] = [];
  let unusedDevDependencies: string[] = [];
  
  try {
    const output = execSync('npx depcheck --json 2>/dev/null', { 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const result: DepcheckResult = JSON.parse(output);
    unusedDependencies = result.dependencies || [];
    unusedDevDependencies = result.devDependencies || [];
  } catch (_error) {
    printWarning('depcheck failed, skipping dependency check');
  }
  
  console.log(formatKeyValueList([['Unused dependencies', String(unusedDependencies.length)]]));
  if (unusedDependencies.length > 0) {
    console.log(formatList(unusedDependencies, { indent: 1 }));
  }
  
  console.log(formatKeyValueList([['Unused devDependencies', String(unusedDevDependencies.length)]]));
  if (unusedDevDependencies.length > 0 && unusedDevDependencies.length <= 5) {
    console.log(formatList(unusedDevDependencies, { indent: 1 }));
  } else if (unusedDevDependencies.length > 5) {
    console.log(formatList(unusedDevDependencies.slice(0, 5), { indent: 1 }));
    printInfo(`... and ${unusedDevDependencies.length - 5} more`);
  }
  console.log();

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Calculate health score
  // ─────────────────────────────────────────────────────────────────────────
  const totalIssues = unusedExports.length + unusedDependencies.length + unusedDevDependencies.length;
  
  // Health score formula:
  // - Start at 100
  // - Deduct 2 points per unused export (max 50 deduction)
  // - Deduct 5 points per unused dependency (max 25 deduction)
  // - Deduct 1 point per unused devDependency (max 10 deduction)
  const exportPenalty = Math.min(unusedExports.length * 2, 50);
  const depPenalty = Math.min(unusedDependencies.length * 5, 25);
  const devDepPenalty = Math.min(unusedDevDependencies.length * 1, 10);
  const healthScore = Math.max(0, 100 - exportPenalty - depPenalty - devDepPenalty);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Build report
  // ─────────────────────────────────────────────────────────────────────────
  const report: DeadCodeReport = {
    unusedExports,
    unusedDependencies,
    unusedDevDependencies,
    timestamp: new Date().toISOString(),
    summary: {
      totalUnusedExports: unusedExports.length,
      totalUnusedDeps: unusedDependencies.length,
      totalUnusedDevDeps: unusedDevDependencies.length,
      healthScore,
    },
  };

  // Write report to file
  const reportPath = path.join(process.cwd(), 'dead-code-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Print summary
  // ─────────────────────────────────────────────────────────────────────────
  console.log(formatSectionHeader('SUMMARY'));
  console.log();
  console.log(formatKeyValueList([
    ['Unused Exports', String(unusedExports.length)],
    ['Unused Dependencies', String(unusedDependencies.length)],
    ['Unused DevDeps', String(unusedDevDependencies.length)],
    ['Total Issues', String(totalIssues)],
    ['Health Score', `${healthScore}/100 ${getHealthEmoji(healthScore)}`],
  ]));
  console.log();
  printInfo(`Full report: ${reportPath}`);
  console.log();

  // Exit with appropriate code
  if (healthScore < 70) {
    printError('Health score below threshold (70). Consider cleaning up dead code.');
    process.exitCode = 1;
  } else if (totalIssues === 0) {
    printSuccess('No dead code detected! Excellent!');
  } else {
    printWarning('Some dead code detected. Review the report for cleanup opportunities.');
  }

  return report;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse ts-prune output into structured format.
 */
function parseUnusedExports(output: string): UnusedExport[] {
  const results: UnusedExport[] = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    // ts-prune format: "src/file.ts:123 - exportName (used in module)"
    const match = line.match(/^(.+):(\d+)\s+-\s+(.+)\s+\(used in module\)$/);
    if (match) {
      results.push({
        file: match[1],
        line: parseInt(match[2], 10),
        export: match[3],
      });
    }
  }
  
  return results;
}

/**
 * Get emoji for health score.
 */
function getHealthEmoji(score: number): string {
  if (score >= 90) return '🟢';
  if (score >= 70) return '🟡';
  if (score >= 50) return '🟠';
  return '🔴';
}

// ============================================================================
// Entry Point
// ============================================================================

checkDeadCode().catch((error) => {
  printError(`Fatal error: ${error}`);
  process.exit(1);
});
