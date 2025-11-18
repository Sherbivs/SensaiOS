#!/usr/bin/env node
/* eslint-disable no-console, no-undef */
/**
 * Memory Snapshot Tool
 * 
 * Captures detailed memory breakdown of the running bot process.
 * Usage: node scripts/memory_snapshot.mjs
 */

import v8 from 'node:v8';
import fs from 'node:fs';
import path from 'node:path';

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function analyzeHeapStatistics() {
  const heapStats = v8.getHeapStatistics();
  const heapSpaces = v8.getHeapSpaceStatistics();
  
  console.log('\n📊 V8 Heap Statistics\n' + '='.repeat(60));
  console.log(`Total Heap Size:       ${formatBytes(heapStats.total_heap_size)}`);
  console.log(`Heap Size Limit:       ${formatBytes(heapStats.heap_size_limit)}`);
  console.log(`Used Heap Size:        ${formatBytes(heapStats.used_heap_size)}`);
  console.log(`Malloced Memory:       ${formatBytes(heapStats.malloced_memory)}`);
  console.log(`Peak Malloced Memory:  ${formatBytes(heapStats.peak_malloced_memory)}`);
  console.log(`External Memory:       ${formatBytes(heapStats.external_memory)}`);
  
  console.log(`\n🗺️  Heap Spaces Breakdown\n` + '='.repeat(60));
  for (const space of heapSpaces) {
    const utilization = ((space.space_used_size / space.space_size) * 100).toFixed(1);
    console.log(`${space.space_name.padEnd(25)} ${formatBytes(space.space_used_size).padStart(12)} / ${formatBytes(space.space_size).padEnd(12)} (${utilization}%)`);
  }
}

function analyzeProcessMemory() {
  const mem = process.memoryUsage();
  
  console.log('\n💾 Process Memory Usage\n' + '='.repeat(60));
  console.log(`RSS (Resident Set):    ${formatBytes(mem.rss)}`);
  console.log(`Heap Total:            ${formatBytes(mem.heapTotal)}`);
  console.log(`Heap Used:             ${formatBytes(mem.heapUsed)}`);
  console.log(`External:              ${formatBytes(mem.external)}`);
  console.log(`Array Buffers:         ${formatBytes(mem.arrayBuffers)}`);
  
  // Calculate "mystery" allocation (RSS - heap - external)
  const accountedFor = mem.heapTotal + mem.external;
  const mystery = mem.rss - accountedFor;
  console.log(`\nAccounted for:         ${formatBytes(accountedFor)}`);
  console.log(`Mystery allocation:    ${formatBytes(mystery)} (${((mystery / mem.rss) * 100).toFixed(1)}% of RSS)`);
}

function captureHeapSnapshot() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `heap-snapshot-${timestamp}.heapsnapshot`;
  const filepath = path.join(process.cwd(), 'Store', filename);
  
  console.log(`\n📸 Capturing heap snapshot..`);
  console.log(`Output: ${filepath}`);
  
  try {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    const snapshot = v8.writeHeapSnapshot(filepath);
    const size = fs.statSync(snapshot).size;
    console.log(`✅ Snapshot captured: ${formatBytes(size)}`);
    console.log(`\n💡 Analyze with Chrome DevTools:`);
    console.log(`   1. Open Chrome DevTools (F12)`);
    console.log(`   2. Go to Memory tab`);
    console.log(`   3. Click "Load" and select: ${path.basename(filepath)}`);
    return snapshot;
  } catch (error) {
    console.error(`❌ Failed to capture snapshot: ${error.message}`);
    return null;
  }
}

function analyzeGlobalObjects() {
  console.log(`\n🌐 Global Objects Inspection\n` + '='.repeat(60));
  
  const globals = [
    'securityBotState',
    'securityBotClient',
    'engineReady',
    'deliveredOpsErrorIds',
  ];
  
  for (const name of globals) {
    try {
      const obj = global[name];
      if (obj === undefined) {
        console.log(`${name.padEnd(30)} undefined`);
        continue;
      }
      
      if (obj === null) {
        console.log(`${name.padEnd(30)} null`);
        continue;
      }
      
      const type = typeof obj;
      if (type === 'object') {
        if (obj instanceof Map) {
          console.log(`${name.padEnd(30)} Map (${obj.size} entries)`);
        } else if (obj instanceof Set) {
          console.log(`${name.padEnd(30)} Set (${obj.size} entries)`);
        } else if (Array.isArray(obj)) {
          console.log(`${name.padEnd(30)} Array (${obj.length} entries)`);
        } else {
          const keys = Object.keys(obj).length;
          console.log(`${name.padEnd(30)} Object (${keys} keys)`);
        }
      } else {
        console.log(`${name.padEnd(30)} ${type}: ${obj}`);
      }
    } catch (error) {
      console.log(`${name.padEnd(30)} Error: ${error.message}`);
    }
  }
}

async function main() {
  console.log('\n🔍 Memory Snapshot Utility\n' + '='.repeat(60));
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Node Version: ${process.version}`);
  console.log(`Platform: ${process.platform} ${process.arch}`);
  console.log(`Uptime: ${Math.round(process.uptime())}s`);
  
  analyzeProcessMemory();
  analyzeHeapStatistics();
  analyzeGlobalObjects();
  
  const snapshot = captureHeapSnapshot();
  
  console.log(`\n✅ Analysis complete\n`);
  
  if (snapshot) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
