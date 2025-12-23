#!/usr/bin/env node
/**
 * Startup Time Measurement Script
 * 
 * Measures application startup time by running tsx and monitoring output.
 * This is a simplified version that spawns the app and measures until ready signal.
 * Run with: npm run measure:startup
 * 
 * Note: For detailed profiling, use: node --prof src/index.ts (requires built output)
 */

import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

console.log('='.repeat(80));
console.log('STARTUP TIME MEASUREMENT (SIMPLIFIED)');
console.log('='.repeat(80));
console.log('');
console.log('Note: This measures end-to-end startup time by spawning the app.');
console.log('For detailed phase breakdown, add timing instrumentation to src/index.ts');
console.log('');

const startTime = performance.now();
const timeoutMs = 30000; // 30 second timeout

console.log(`[${new Date().toISOString()}] Starting application...`);
console.log('Command: npx tsx src/index.ts');
console.log('');

// Spawn tsx with environment variable to signal measurement mode
const child = spawn('npx', ['tsx', 'src/index.ts'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    MEASURE_STARTUP: '1', // Signal to app that we're measuring
    LOG_LEVEL: 'info',    // Reduce noise
  },
  shell: true // Required for npx on Windows
});

let captured = false;
let readyTime = null;

// Capture stdout
child.stdout.on('data', (data) => {
  const text = data.toString();
  
  // Look for "Ready" signal (Discord bot ready, or similar)
  if (!captured && (text.includes('Ready!') || text.includes('Logged in as') || text.includes('ClientReady'))) {
    readyTime = performance.now() - startTime;
    captured = true;
    
    console.log('');
    console.log('✓ Application ready signal detected');
    console.log('');
    
    // Kill after brief delay to allow cleanup
    setTimeout(() => {
      child.kill('SIGTERM');
    }, 500);
  }
});

// Capture stderr
child.stderr.on('data', (data) => {
  const text = data.toString();
  // Only show critical errors, suppress warnings
  if (text.includes('error') && !text.includes('warn')) {
    console.error('  [stderr]', text.trim());
  }
});

// Handle exit
child.on('close', (code) => {
  if (captured && readyTime !== null) {
    // Success - show results
    console.log('='.repeat(80));
    console.log('STARTUP MEASUREMENT COMPLETE');
    console.log('='.repeat(80));
    console.log('');
    console.log(`Total Startup Time: ${readyTime.toFixed(2)}ms (${(readyTime / 1000).toFixed(2)}s)`);
    console.log('');
    
    // Target analysis
    const targetMs = 2000;
    const passed = readyTime < targetMs;
    const percentOfTarget = (readyTime / targetMs * 100).toFixed(1);
    
    console.log('Performance Analysis:');
    console.log(`  Target:             ${targetMs.toFixed(2).padStart(8)}ms (<2s)`);
    console.log(`  Actual:             ${readyTime.toFixed(2).padStart(8)}ms`);
    console.log(`  Percent of Target:  ${percentOfTarget.padStart(8)}%`);
    console.log(`  Status:             ${passed ? '✅ PASSED' : '❌ NEEDS OPTIMIZATION'}`);
    console.log('');
    
    if (!passed) {
      const needsReduction = readyTime - targetMs;
      const percentReduction = (needsReduction / readyTime * 100).toFixed(1);
      console.log('Optimization Required:');
      console.log(`  Must reduce by:     ${needsReduction.toFixed(2).padStart(8)}ms (${percentReduction}%)`);
      console.log('');
      console.log('Recommendations:');
      console.log('  - See docs/OPTIMIZATION-BIBLE.md Section 1');
      console.log('  - Lazy module loading: ~1100ms savings');
      console.log('  - Parallel bot init: ~500ms savings');
      console.log('  - Tiered cache load: ~800ms savings');
      console.log('');
    }
    
    console.log('Next Steps:');
    console.log('  1. Document this baseline in docs/OPTIMIZATION-BIBLE.md');
    console.log('  2. Run: npm run measure:memory');
    console.log('  3. Begin Week 2: Startup optimization');
    console.log('');
    console.log('='.repeat(80));
    process.exit(0);
  } else {
    // Failed to capture ready signal
    const elapsed = performance.now() - startTime;
    console.error('');
    console.error('='.repeat(80));
    console.error('MEASUREMENT FAILED');
    console.error('='.repeat(80));
    console.error('');
    console.error(`Elapsed: ${elapsed.toFixed(2)}ms before exit`);
    console.error(`Exit code: ${code}`);
    console.error('');
    console.error('Possible causes:');
    console.error('  - Application crashed before "Ready" signal');
    console.error('  - Database connection failed');
    console.error('  - Missing environment variables');
    console.error('');
    console.error('To debug: Run `npm run dev` and check for errors');
    console.error('');
    process.exit(1);
  }
});

// Timeout handler
setTimeout(() => {
  if (!captured) {
    console.error('');
    console.error('='.repeat(80));
    console.error('MEASUREMENT TIMEOUT');
    console.error('='.repeat(80));
    console.error('');
    console.error(`Application did not reach ready state within ${timeoutMs}ms`);
    console.error('');
    child.kill('SIGKILL');
    process.exit(1);
  }
}, timeoutMs);
