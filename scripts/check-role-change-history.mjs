/**
 * Diagnostic Script: Role Change History Analysis
 * 
 * Analyzes Store/security-bot-state/role-changes.json to detect patterns:
 * - Frequency of role changes
 * - Loop detection (same member repeated changes)
 * - Unauthorized vs authorized change ratio
 * - Time gaps between changes
 * 
 * PURPOSE: Identify evidence of the role revert loop in historical data
 * 
 * USAGE: node scripts/check-role-change-history.mjs
 */

import { readFile, access } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('='.repeat(70));
console.log('ROLE CHANGE HISTORY DIAGNOSTIC');
console.log('='.repeat(70));
console.log();

// Read role-changes.json
const roleChangesPath = join(__dirname, '..', 'Store', 'security-bot-state', 'role-changes.json');

try {
  await access(roleChangesPath);
} catch {
  console.log('❌ role-changes.json NOT FOUND');
  console.log(`   Expected at: ${roleChangesPath}`);
  console.log();
  console.log('This suggests the security bot has not recorded any role changes yet.');
  process.exit(0);
}

const roleChangesContent = await readFile(roleChangesPath, 'utf-8');
const roleChanges = JSON.parse(roleChangesContent);

console.log('=== BASIC STATISTICS ===\n');
console.log(`Total role changes: ${roleChanges.length}`);
console.log();

if (roleChanges.length === 0) {
  console.log('No role changes recorded. Nothing to analyze.');
  process.exit(0);
}

// Analyze by date
const changesByDate = {};
for (const change of roleChanges) {
  const date = new Date(change.timestamp).toISOString().split('T')[0];
  changesByDate[date] = (changesByDate[date] || 0) + 1;
}

console.log('=== CHANGES BY DATE ===\n');
for (const [date, count] of Object.entries(changesByDate).sort()) {
  console.log(`${date}: ${count} changes`);
}
console.log();

// Detect potential loops (same member, rapid changes)
console.log('=== LOOP DETECTION ===\n');

const memberChangeSequences = {};
for (const change of roleChanges) {
  const memberId = change.member?.id;
  if (!memberId) continue;
  
  if (!memberChangeSequences[memberId]) {
    memberChangeSequences[memberId] = [];
  }
  
  memberChangeSequences[memberId].push({
    timestamp: new Date(change.timestamp),
    added: change.added || [],
    removed: change.removed || [],
    executor: change.executor?.tag || 'unknown',
  });
}

let loopsDetected = 0;
for (const [memberId, sequences] of Object.entries(memberChangeSequences)) {
  if (sequences.length < 2) continue;
  
  // Sort by timestamp
  sequences.sort((a, b) => a.timestamp - b.timestamp);
  
  // Check for rapid back-and-forth changes
  for (let i = 0; i < sequences.length - 1; i++) {
    const current = sequences[i];
    const next = sequences[i + 1];
    
    const timeDiff = (next.timestamp - current.timestamp) / 1000; // seconds
    
    // If same roles are added/removed within 60 seconds, potential loop
    if (timeDiff < 60) {
      const currentAdded = current.added.map(r => r.name).sort().join(',');
      const nextRemoved = next.removed.map(r => r.name).sort().join(',');
      
      const currentRemoved = current.removed.map(r => r.name).sort().join(',');
      const nextAdded = next.added.map(r => r.name).sort().join(',');
      
      if ((currentAdded === nextRemoved) || (currentRemoved === nextAdded)) {
        console.log(`🔴 LOOP DETECTED: Member ${memberId.slice(0, 8)}...`);
        console.log(`   Time gap: ${timeDiff.toFixed(1)}s`);
        console.log(`   Change 1: Added [${currentAdded}], Removed [${currentRemoved}]`);
        console.log(`   Change 2: Added [${nextAdded}], Removed [${nextRemoved}]`);
        console.log();
        loopsDetected++;
      }
    }
  }
}

if (loopsDetected === 0) {
  console.log('✅ No obvious loops detected in historical data');
} else {
  console.log(`⚠️  Found ${loopsDetected} potential loop(s)`);
}
console.log();

// Analyze executor patterns
console.log('=== EXECUTOR ANALYSIS ===\n');

const executorStats = {};
for (const change of roleChanges) {
  const executor = change.executor?.tag || 'unknown';
  executorStats[executor] = (executorStats[executor] || 0) + 1;
}

for (const [executor, count] of Object.entries(executorStats).sort((a, b) => b[1] - a[1])) {
  console.log(`${executor}: ${count} changes`);
}
console.log();

// Check for unauthorized changes
console.log('=== UNAUTHORIZED CHANGES ===\n');

const unauthorizedChanges = roleChanges.filter(c => c.unauthorized === true);
console.log(`Unauthorized changes: ${unauthorizedChanges.length} / ${roleChanges.length}`);
console.log();

if (unauthorizedChanges.length > 0) {
  console.log('Examples:');
  for (const change of unauthorizedChanges.slice(0, 3)) {
    console.log(`  - ${new Date(change.timestamp).toISOString()}`);
    console.log(`    Executor: ${change.executor?.tag || 'unknown'}`);
    console.log(`    Member: ${change.member?.tag || 'unknown'}`);
    console.log();
  }
}

// Summary
console.log('='.repeat(70));
console.log('DIAGNOSTIC SUMMARY');
console.log('='.repeat(70));
console.log();
console.log(`Total changes: ${roleChanges.length}`);
console.log(`Unique members: ${Object.keys(memberChangeSequences).length}`);
console.log(`Loops detected: ${loopsDetected}`);
console.log(`Unauthorized: ${unauthorizedChanges.length}`);
console.log();

if (loopsDetected > 0) {
  console.log('⚠️  WARNING: Loop patterns detected in historical data');
  console.log('   This confirms the race condition has occurred in production');
} else if (roleChanges.length < 10) {
  console.log('ℹ️  NOTE: Limited data available (< 10 changes)');
  console.log('   Loop patterns may not be visible yet');
} else {
  console.log('✅ No loop patterns in historical data');
  console.log('   Issue may be intermittent or not yet triggered');
}

process.exit(0);
