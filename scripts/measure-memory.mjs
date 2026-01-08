#!/usr/bin/env node
/**
 * Memory Footprint Measurement Script
 * 
 * Measures application memory usage at various stages and reports baseline metrics.
 * Run with: node scripts/measure_memory.mjs
 */

import { performance } from 'node:perf_hooks';

console.log('='.repeat(80));
console.log('MEMORY FOOTPRINT MEASUREMENT');
console.log('='.repeat(80));
console.log('');

function formatBytes(bytes) {
  return (bytes / 1024 / 1024).toFixed(2);
}

function captureMemorySnapshot(label) {
  const mem = process.memoryUsage();
  return {
    label,
    timestamp: Date.now(),
    rss: mem.rss,
    heapTotal: mem.heapTotal,
    heapUsed: mem.heapUsed,
    external: mem.external,
    arrayBuffers: mem.arrayBuffers || 0
  };
}

function printSnapshot(snapshot) {
  console.log(`${snapshot.label}:`);
  console.log(`  RSS:           ${formatBytes(snapshot.rss).padStart(10)} MB`);
  console.log(`  Heap Total:    ${formatBytes(snapshot.heapTotal).padStart(10)} MB`);
  console.log(`  Heap Used:     ${formatBytes(snapshot.heapUsed).padStart(10)} MB`);
  console.log(`  External:      ${formatBytes(snapshot.external).padStart(10)} MB`);
  if (snapshot.arrayBuffers) {
    console.log(`  Array Buffers: ${formatBytes(snapshot.arrayBuffers).padStart(10)} MB`);
  }
}

function printDelta(before, after) {
  const deltaRss = after.rss - before.rss;
  const deltaHeapTotal = after.heapTotal - before.heapTotal;
  const deltaHeapUsed = after.heapUsed - before.heapUsed;
  const deltaExternal = after.external - before.external;
  
  console.log('Memory Delta (After - Before):');
  console.log(`  RSS:           ${formatBytes(deltaRss).padStart(10)} MB  (${deltaRss >= 0 ? '+' : ''}${((deltaRss / before.rss) * 100).toFixed(1)}%)`);
  console.log(`  Heap Total:    ${formatBytes(deltaHeapTotal).padStart(10)} MB  (${deltaHeapTotal >= 0 ? '+' : ''}${((deltaHeapTotal / before.heapTotal) * 100).toFixed(1)}%)`);
  console.log(`  Heap Used:     ${formatBytes(deltaHeapUsed).padStart(10)} MB  (${deltaHeapUsed >= 0 ? '+' : ''}${((deltaHeapUsed / before.heapUsed) * 100).toFixed(1)}%)`);
  console.log(`  External:      ${formatBytes(deltaExternal).padStart(10)} MB  (${deltaExternal >= 0 ? '+' : ''}${((deltaExternal / before.external) * 100).toFixed(1)}%)`);
}

// Baseline snapshot (before imports)
console.log('[1/4] Capturing baseline (before imports)...');
const baseline = captureMemorySnapshot('Baseline (Before Imports)');
printSnapshot(baseline);
console.log('');

// Force garbage collection if available
if (global.gc) {
  console.log('[2/4] Running garbage collection...');
  global.gc();
  await new Promise(resolve => setTimeout(resolve, 100));
  console.log('✓ GC complete');
  console.log('');
}

// Import modules
console.log('[3/4] Importing modules...');
const importStart = performance.now();
const { boot } = await import('../src/index.js');
const importDuration = performance.now() - importStart;
console.log(`✓ Imports complete: ${importDuration.toFixed(2)}ms`);
console.log('');

const postImport = captureMemorySnapshot('Post-Import (Modules Loaded)');
printSnapshot(postImport);
console.log('');
printDelta(baseline, postImport);
console.log('');

// Boot application
console.log('[4/4] Booting application...');
const bootStart = performance.now();

try {
  await boot();
  
  const bootDuration = performance.now() - bootStart;
  console.log(`✓ Boot complete: ${bootDuration.toFixed(2)}ms`);
  console.log('');
  
  // Wait for workers to stabilize
  console.log('Waiting 3s for workers to stabilize...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const postBoot = captureMemorySnapshot('Post-Boot (Application Online)');
  printSnapshot(postBoot);
  console.log('');
  printDelta(postImport, postBoot);
  console.log('');
  
  console.log('='.repeat(80));
  console.log('MEMORY ANALYSIS SUMMARY');
  console.log('='.repeat(80));
  console.log('');
  
  printDelta(baseline, postBoot);
  console.log('');
  
  // Target analysis
  const targetReduction = 0.30; // 30% reduction goal
  const currentHeapUsed = postBoot.heapUsed;
  const targetHeapUsed = currentHeapUsed * (1 - targetReduction);
  const needsReduction = currentHeapUsed - targetHeapUsed;
  
  console.log('Optimization Target (30% Reduction):');
  console.log(`  Current Heap Used: ${formatBytes(currentHeapUsed).padStart(10)} MB`);
  console.log(`  Target Heap Used:  ${formatBytes(targetHeapUsed).padStart(10)} MB`);
  console.log(`  Must Reduce By:    ${formatBytes(needsReduction).padStart(10)} MB (${(targetReduction * 100).toFixed(0)}%)`);
  console.log('');
  
  console.log('Recommendations:');
  console.log('  - See docs/OPTIMIZATION-BIBLE.md Section 4 (Runtime Weight Reduction)');
  console.log('  - Implement L1 cache LRU eviction (saves ~12-14 MB)');
  console.log('  - Global state cleanup (saves ~1-2 MB)');
  console.log('  - Worker consolidation (saves ~2-3 MB)');
  console.log('  - ESM tree-shaking (saves ~5-10 MB)');
  console.log('');
  
  // Detailed breakdown
  console.log('Memory Breakdown:');
  console.log(`  Modules:           ${formatBytes(postImport.heapUsed - baseline.heapUsed).padStart(10)} MB`);
  console.log(`  Boot (runtime):    ${formatBytes(postBoot.heapUsed - postImport.heapUsed).padStart(10)} MB`);
  console.log(`  Total:             ${formatBytes(postBoot.heapUsed - baseline.heapUsed).padStart(10)} MB`);
  console.log('');
  
  console.log('='.repeat(80));
  console.log('');
  
  // Clean exit
  setTimeout(() => {
    console.log('Measurement complete. Exiting...');
    process.exit(0);
  }, 1000);
  
} catch (e) {
  console.log('');
  console.log('='.repeat(80));
  console.log('[HALT] BOOT DID NOT COMPLETE');
  console.log('='.repeat(80));
  console.log('');
  console.log('Cause:', e instanceof Error ? e.message : String(e));
  if (e instanceof Error && e.stack) {
    console.log('');
    console.log('Stack Trace:');
    console.log(e.stack);
  }
  console.log('');
  process.exit(1);
}
