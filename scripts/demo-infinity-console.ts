#!/usr/bin/env npx ts-node
/**
 * Infinity Console Demo — Visual Logger Showcase
 * 
 * Run with: npx ts-node scripts/demo-infinity-console.ts
 * 
 * This demonstrates the new "Infinity Console" visual logging system
 * designed in Meeting #10 by Creative Specialist Zara Okonkwo.
 */

import {
  ConsoleRenderer,
  renderDashboard,
  renderStatusLine,
  formatLogEntry,
  logStreamSeparator,
  progressBar,
  type DashboardConfig,
  type LogStreamEntry,
} from '../src/shared/logging/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Demo Data
// ═══════════════════════════════════════════════════════════════════════════

const demoDashboard: DashboardConfig = {
  version: '2.5.0',
  databases: [
    { name: 'CLOUD-PROD', status: 'online', latency: 23, details: 'Direct PostgreSQL' },
    { name: 'ENGINE-READ', status: 'online', latency: 1, details: '1,302 Pokémon loaded' },
    { name: 'ENGINE-WRITE', status: 'online', latency: 2, details: 'WAL healthy' },
    { name: 'ON-PREMISE', status: 'offline', details: 'Development only' },
  ],
  discord: {
    status: 'online',
    guilds: 1,
    latency: 45,
    uptime: 4980, // ~1h 23m in seconds
  },
  resources: {
    ram: { used: 337 * 1024 * 1024, total: 2048 * 1024 * 1024 }, // 337 MB / 2 GB
    disk: { used: 878 * 1024 * 1024, total: 1024 * 1024 * 1024 }, // 878 MB / 1 GB
    cpu: 12,
  },
};

const demoLogs: LogStreamEntry[] = [
  { timestamp: new Date(), level: 'success', message: 'Role permissions match', context: 'guild: Black Infinity Gauntlet' },
  { timestamp: new Date(), level: 'info', message: 'Engine saved to disk', context: 'size: 73KB' },
  { timestamp: new Date(), level: 'info', message: 'Cache sweep complete', context: 'freed: 0 B' },
  { timestamp: new Date(), level: 'warn', message: 'High memory usage', context: 'threshold: 80%' },
  { timestamp: new Date(), level: 'error', message: 'Database timeout', context: 'retry: 1/3' },
  { timestamp: new Date(), level: 'success', message: 'Reconnected to database', context: 'latency: 45ms' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Demo Execution
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n');
console.log('='.repeat(80));
console.log('  INFINITY CONSOLE DEMO — Visual Logger Showcase');
console.log('  Designed by Creative Specialist Zara Okonkwo (Meeting #10)');
console.log('='.repeat(80));
console.log('\n');

// Full Dashboard
console.log('▼ FULL DASHBOARD VIEW ▼\n');
console.log(renderDashboard(demoDashboard));

// Log Stream
console.log('\n▼ LOG STREAM FORMAT ▼\n');
for (const entry of demoLogs) {
  console.log(formatLogEntry(entry));
}
console.log(logStreamSeparator());

// Compact Status Line
console.log('\n▼ COMPACT STATUS LINE (for periodic updates) ▼\n');
console.log(renderStatusLine(
  { online: 3, total: 4 },
  { used: 337 * 1024 * 1024, total: 2048 * 1024 * 1024 },
  4980
));

// Progress Bar Showcase
console.log('\n▼ PROGRESS BAR VARIANTS ▼\n');
console.log(`  0%:   ${progressBar(0, 100)}`);
console.log(`  25%:  ${progressBar(25, 100)}`);
console.log(`  50%:  ${progressBar(50, 100)}`);
console.log(`  75%:  ${progressBar(75, 100)}`);
console.log(`  90%:  ${progressBar(90, 100)} ← Warning threshold`);
console.log(`  100%: ${progressBar(100, 100)} ← Critical`);

// Quick Log Functions
console.log('\n▼ QUICK LOG FUNCTIONS ▼\n');
console.log(ConsoleRenderer.success('Operation completed successfully', 'duration: 42ms'));
console.log(ConsoleRenderer.info('Processing batch', 'items: 150'));
console.log(ConsoleRenderer.warn('Rate limit approaching', 'remaining: 10'));
console.log(ConsoleRenderer.error('Connection failed', 'retry in 5s'));

console.log('\n');
console.log('='.repeat(80));
console.log('  END OF DEMO');
console.log('='.repeat(80));
console.log('\n');
