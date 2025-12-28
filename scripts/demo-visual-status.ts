#!/usr/bin/env tsx
/**
 * Visual Status Demo — Test visual-status.ts Module
 * 
 * Demonstrates color-coded health monitoring for operators
 */

import {
  formatSystemHealth,
  formatCompactStatus,
  formatServiceList,
  formatStatusLine,
  formatUptime,
  type HealthMetrics,
  type ServiceStatus
} from '../src/utils/visual-status.js';

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║  VISUAL STATUS MODULE — DEMO FOR OPERATORS                   ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

// ============================================================================
// Test 1: Healthy System
// ============================================================================

console.log('━━━ Test 1: HEALTHY SYSTEM ━━━\n');

const healthyMetrics: HealthMetrics = {
  memoryMB: 850,
  memoryLimitMB: 2048,
  diskPercent: 45.3,
  dbConnected: true,
  workersActive: 6,
  workersTotal: 6,
  errorsCount: 0,
  uptimeSeconds: 86400, // 1 day
  requestsPerSecond: 12.5
};

console.log(formatSystemHealth(healthyMetrics));
console.log('\nCompact Format:');
console.log(formatCompactStatus(healthyMetrics));

// ============================================================================
// Test 2: Warning System (Memory Elevated)
// ============================================================================

console.log('\n\n━━━ Test 2: WARNING SYSTEM (High Memory) ━━━\n');

const warningMetrics: HealthMetrics = {
  memoryMB: 1650,
  memoryLimitMB: 2048,
  diskPercent: 78.9,
  dbConnected: true,
  workersActive: 5,
  workersTotal: 6,
  errorsCount: 3,
  uptimeSeconds: 3665, // 1h 1m 5s
  requestsPerSecond: 8.2
};

console.log(formatSystemHealth(warningMetrics));
console.log('\nCompact Format:');
console.log(formatCompactStatus(warningMetrics));

// ============================================================================
// Test 3: Critical System (Multiple Issues)
// ============================================================================

console.log('\n\n━━━ Test 3: CRITICAL SYSTEM (Multiple Issues) ━━━\n');

const criticalMetrics: HealthMetrics = {
  memoryMB: 1890,
  memoryLimitMB: 2048,
  diskPercent: 92.5,
  dbConnected: false,
  workersActive: 2,
  workersTotal: 6,
  errorsCount: 47,
  uptimeSeconds: 125,
  requestsPerSecond: 0.5
};

console.log(formatSystemHealth(criticalMetrics));
console.log('\nCompact Format:');
console.log(formatCompactStatus(criticalMetrics));

// ============================================================================
// Test 4: Service Status List
// ============================================================================

console.log('\n\n━━━ Test 4: MULTI-SERVICE MONITORING ━━━\n');

const services: ServiceStatus[] = [
  { name: 'Bot', status: 'healthy', message: 'Running normally' },
  { name: 'Outbox Worker', status: 'healthy', message: '0 pending messages' },
  { name: 'Cache Worker', status: 'degraded', message: 'High latency (250ms)' },
  { name: 'Data Pipeline', status: 'healthy', message: 'Last sync: 2m ago' },
  { name: 'Security Bot', status: 'healthy', message: 'No alerts' },
  { name: 'Pokedex Cache', status: 'down', message: 'Connection timeout' }
];

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║  RENDER SERVICES STATUS                                      ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');
console.log(formatServiceList(services));

// ============================================================================
// Test 5: Individual Status Lines
// ============================================================================

console.log('\n\n━━━ Test 5: INDIVIDUAL STATUS LINES ━━━\n');

console.log(formatStatusLine('Database Connection', 'postgresql://render.com:5432/db', 'healthy'));
console.log(formatStatusLine('Memory Usage', '1234 MB / 2048 MB (60%)', 'warning'));
console.log(formatStatusLine('Disk Space', '950 MB / 1024 MB (93%)', 'critical'));
console.log(formatStatusLine('Error Count', '0 errors in last hour', 'healthy'));

// ============================================================================
// Test 6: Uptime Formatting
// ============================================================================

console.log('\n\n━━━ Test 6: UPTIME FORMATTING ━━━\n');

console.log(`Short:   ${formatUptime(45)} (45 seconds)`);
console.log(`Medium:  ${formatUptime(305)} (5 minutes 5 seconds)`);
console.log(`Long:    ${formatUptime(7384)} (2 hours 3 minutes 4 seconds)`);
console.log(`Days:    ${formatUptime(259200)} (3 days = 72 hours)`);

// ============================================================================
// Summary
// ============================================================================

console.log('\n\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║  DEMO COMPLETE                                               ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log('\nKey Features Demonstrated:');
console.log('✅ Color-coded health status (green/yellow/red)');
console.log('✅ Visual indicators (🟢 🟡 🔴 ✅ ❌)');
console.log('✅ Full dashboard format for detailed monitoring');
console.log('✅ Compact format for quick status checks');
console.log('✅ Multi-service monitoring with individual statuses');
console.log('✅ Human-readable uptime formatting');
console.log('✅ Operator-friendly plain English labels\n');

console.log('Next Steps:');
console.log('1. Convert db-admin.ts console calls to visual-status patterns');
console.log('2. Add health dashboard to /ops status command');
console.log('3. Integrate with Grafana unified dashboard\n');
