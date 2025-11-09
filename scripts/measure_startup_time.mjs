#!/usr/bin/env node
/**
 * Startup Time Measurement Script
 * 
 * Measures application startup time and reports detailed breakdown.
 * Run with: node scripts/measure_startup_time.mjs
 */

import { performance } from 'node:perf_hooks';

console.log('='.repeat(80));
console.log('STARTUP TIME MEASUREMENT');
console.log('='.repeat(80));
console.log('');

const startTime = performance.now();
const startHrtime = process.hrtime.bigint();

// Track phases
const phases = {
  import: { start: startTime },
  database: {},
  engineDb: {},
  bots: {},
  total: {}
};

console.log(`[${new Date().toISOString()}] Phase 1: Module Imports`);
phases.import.start = performance.now();

// Dynamic import to measure load time
const { boot } = await import('../src/index.js');

phases.import.end = performance.now();
phases.import.duration = phases.import.end - phases.import.start;

console.log(`✓ Module imports complete: ${phases.import.duration.toFixed(2)}ms`);
console.log('');

console.log(`[${new Date().toISOString()}] Phase 2-6: Application Boot`);
console.log('  - Database connection');
console.log('  - Engine DB initialization');
console.log('  - Security bot startup');
console.log('  - Discord bot startup');
console.log('');

phases.boot = { start: performance.now() };

try {
  await boot();
  
  phases.boot.end = performance.now();
  phases.boot.duration = phases.boot.end - phases.boot.start;
  
  const totalTime = performance.now() - startTime;
  const totalHrtime = Number(process.hrtime.bigint() - startHrtime) / 1_000_000;
  
  console.log('');
  console.log('='.repeat(80));
  console.log('STARTUP COMPLETE');
  console.log('='.repeat(80));
  console.log('');
  console.log('Phase Breakdown:');
  console.log(`  Module Imports:    ${phases.import.duration.toFixed(2).padStart(8)}ms`);
  console.log(`  Application Boot:  ${phases.boot.duration.toFixed(2).padStart(8)}ms`);
  console.log('  ' + '-'.repeat(28));
  console.log(`  Total (perf_hooks): ${totalTime.toFixed(2).padStart(7)}ms`);
  console.log(`  Total (hrtime):     ${totalHrtime.toFixed(2).padStart(7)}ms`);
  console.log('');
  
  // Target analysis
  const targetMs = 2000;
  const passed = totalTime < targetMs;
  const percentOfTarget = (totalTime / targetMs * 100).toFixed(1);
  
  console.log('Performance Analysis:');
  console.log(`  Target:             ${targetMs.toFixed(2).padStart(8)}ms (<2s)`);
  console.log(`  Actual:             ${totalTime.toFixed(2).padStart(8)}ms`);
  console.log(`  Percent of Target:  ${percentOfTarget.padStart(8)}%`);
  console.log(`  Status:             ${passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('');
  
  if (!passed) {
    const needsReduction = totalTime - targetMs;
    const percentReduction = (needsReduction / totalTime * 100).toFixed(1);
    console.log('Optimization Needed:');
    console.log(`  Must reduce by:     ${needsReduction.toFixed(2).padStart(8)}ms (${percentReduction}%)`);
    console.log('');
    console.log('Recommendations:');
    console.log('  - See docs/OPTIMIZATION-BIBLE.md Section 1 (Startup Optimization)');
    console.log('  - Implement lazy module loading (saves ~1100ms)');
    console.log('  - Parallelize bot initialization (saves ~500ms)');
    console.log('  - Use tiered cache loading (saves ~800ms)');
    console.log('');
  }
  
  // Memory snapshot
  const mem = process.memoryUsage();
  console.log('Memory Snapshot (Post-Boot):');
  console.log(`  RSS:                ${(mem.rss / 1024 / 1024).toFixed(2).padStart(8)} MB`);
  console.log(`  Heap Total:         ${(mem.heapTotal / 1024 / 1024).toFixed(2).padStart(8)} MB`);
  console.log(`  Heap Used:          ${(mem.heapUsed / 1024 / 1024).toFixed(2).padStart(8)} MB`);
  console.log(`  External:           ${(mem.external / 1024 / 1024).toFixed(2).padStart(8)} MB`);
  console.log('');
  
  console.log('='.repeat(80));
  console.log('');
  
  // Clean exit
  setTimeout(() => {
    console.log('Measurement complete. Exiting...');
    process.exit(0);
  }, 1000);
  
} catch (error) {
  console.error('');
  console.error('='.repeat(80));
  console.error('STARTUP FAILED');
  console.error('='.repeat(80));
  console.error('');
  console.error('Error:', error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    console.error('');
    console.error('Stack Trace:');
    console.error(error.stack);
  }
  console.error('');
  process.exit(1);
}
