#!/usr/bin/env tsx
/**
 * Dependency Graph Generator
 * @module scripts/generate-dependency-graph
 * 
 * Uses madge to analyze the codebase and generate:
 * 1. Dependency graph visualization (SVG/PNG)
 * 2. Circular dependency report
 * 3. Orphan module detection
 * 
 * Usage:
 *   npm run deps:graph           # Generate SVG graph
 *   npm run deps:graph -- --json # Output JSON for further analysis
 *   npm run deps:circular        # Check for circular dependencies only
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

interface DependencyReport {
  timestamp: string;
  totalModules: number;
  circularDependencies: string[][];
  orphanModules: string[];
  hubModules: Array<{ module: string; dependents: number }>;
  graphPath?: string;
}

function log(message: string, color: string = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

function runMadge(args: string): string {
  try {
    return execSync(`npx madge ${args}`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large projects
    });
  } catch (error) {
    if (error instanceof Error && 'stdout' in error) {
      return (error as { stdout: string }).stdout || '';
    }
    throw error;
  }
}

function findCircularDependencies(): string[][] {
  log('\n🔍 Checking for circular dependencies...', colors.cyan);
  
  try {
    const output = runMadge('--circular --json src/');
    const circular = JSON.parse(output || '[]');
    return circular;
  } catch {
    log('  ⚠️  Could not parse circular dependency output', colors.yellow);
    return [];
  }
}

function findOrphanModules(): string[] {
  log('\n🔍 Finding orphan modules (no dependents)...', colors.cyan);
  
  try {
    const output = runMadge('--orphans --json src/');
    const orphans = JSON.parse(output || '[]');
    return orphans;
  } catch {
    log('  ⚠️  Could not parse orphan module output', colors.yellow);
    return [];
  }
}

function getDependencyTree(): Record<string, string[]> {
  log('\n🔍 Building dependency tree...', colors.cyan);
  
  try {
    const output = runMadge('--json src/');
    return JSON.parse(output || '{}');
  } catch {
    log('  ⚠️  Could not parse dependency tree', colors.yellow);
    return {};
  }
}

function findHubModules(tree: Record<string, string[]>, threshold: number = 10): Array<{ module: string; dependents: number }> {
  // Count how many modules depend on each module
  const dependentCount: Record<string, number> = {};
  
  for (const [, deps] of Object.entries(tree)) {
    for (const dep of deps) {
      dependentCount[dep] = (dependentCount[dep] || 0) + 1;
    }
  }
  
  // Find modules with many dependents (hub modules)
  return Object.entries(dependentCount)
    .filter(([, count]) => count >= threshold)
    .map(([module, dependents]) => ({ module, dependents }))
    .sort((a, b) => b.dependents - a.dependents);
}

async function generateGraph(outputPath: string): Promise<boolean> {
  log('\n📊 Generating dependency graph...', colors.cyan);
  
  const ext = path.extname(outputPath).toLowerCase();
  const format = ext === '.png' ? 'png' : 'svg';
  
  try {
    execSync(`npx madge --image ${outputPath} --${format === 'png' ? 'image' : 'image'} src/`, {
      stdio: 'pipe',
    });
    
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      log(`  ✅ Graph generated: ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`, colors.green);
      return true;
    }
  } catch (error) {
    log(`  ❌ Failed to generate graph: ${error instanceof Error ? error.message : 'Unknown error'}`, colors.red);
    log('  💡 Install graphviz for image generation: https://graphviz.org/download/', colors.yellow);
  }
  
  return false;
}

function printReport(report: DependencyReport): void {
  log('\n' + '='.repeat(60), colors.bold);
  log('📋 DEPENDENCY ANALYSIS REPORT', colors.bold + colors.cyan);
  log('='.repeat(60), colors.bold);
  
  log(`\n📅 Generated: ${report.timestamp}`);
  log(`📦 Total Modules: ${report.totalModules}`);
  
  // Circular dependencies
  if (report.circularDependencies.length > 0) {
    log(`\n🔄 Circular Dependencies: ${report.circularDependencies.length}`, colors.red);
    for (const cycle of report.circularDependencies.slice(0, 10)) {
      log(`   ${cycle.join(' → ')} → ${cycle[0]}`, colors.yellow);
    }
    if (report.circularDependencies.length > 10) {
      log(`   ... and ${report.circularDependencies.length - 10} more`, colors.yellow);
    }
  } else {
    log('\n✅ No circular dependencies found!', colors.green);
  }
  
  // Orphan modules
  if (report.orphanModules.length > 0) {
    log(`\n🏝️  Orphan Modules (no dependents): ${report.orphanModules.length}`, colors.yellow);
    for (const orphan of report.orphanModules.slice(0, 10)) {
      log(`   ${orphan}`);
    }
    if (report.orphanModules.length > 10) {
      log(`   ... and ${report.orphanModules.length - 10} more`);
    }
  } else {
    log('\n✅ No orphan modules found!', colors.green);
  }
  
  // Hub modules
  if (report.hubModules.length > 0) {
    log(`\n🌟 Hub Modules (most depended upon):`, colors.cyan);
    for (const { module, dependents } of report.hubModules.slice(0, 10)) {
      log(`   ${module}: ${dependents} dependents`);
    }
  }
  
  // Graph location
  if (report.graphPath) {
    log(`\n📊 Graph saved to: ${report.graphPath}`, colors.green);
  }
  
  log('\n' + '='.repeat(60), colors.bold);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const circularOnly = args.includes('--circular');
  const outputDir = 'docs/generated';
  
  log('🔬 Dependency Graph Generator', colors.bold + colors.cyan);
  log('   Analyzing src/ directory...', colors.cyan);
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const report: DependencyReport = {
    timestamp: new Date().toISOString(),
    totalModules: 0,
    circularDependencies: [],
    orphanModules: [],
    hubModules: [],
  };
  
  // Get dependency tree
  const tree = getDependencyTree();
  report.totalModules = Object.keys(tree).length;
  
  // Find circular dependencies
  report.circularDependencies = findCircularDependencies();
  
  if (!circularOnly) {
    // Find orphan modules
    report.orphanModules = findOrphanModules();
    
    // Find hub modules
    report.hubModules = findHubModules(tree);
    
    // Generate graph
    const graphPath = path.join(outputDir, 'dependency-graph.svg');
    const graphGenerated = await generateGraph(graphPath);
    if (graphGenerated) {
      report.graphPath = graphPath;
    }
  }
  
  // Output
  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
  
  // Save JSON report
  const reportPath = path.join(outputDir, 'dependency-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log(`\n💾 Report saved to: ${reportPath}`, colors.green);
  
  // Exit with error if circular dependencies found
  if (report.circularDependencies.length > 0) {
    log('\n⚠️  Circular dependencies detected!', colors.red);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
