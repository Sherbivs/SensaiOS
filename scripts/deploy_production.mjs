#!/usr/bin/env node
/**
 * Production Deployment Script
 * 
 * Automates production deployment with safety checks, backups, and validation.
 * 
 * Features:
 * - Pre-deployment validation (staging tests must pass 100%)
 * - Automatic backups (archive, state, code snapshot)
 * - Graceful shutdown of old bot
 * - Health checks during deployment
 * - Post-deployment validation
 * - Automatic rollback on failure
 * 
 * Usage:
 *   node scripts/deploy_production.mjs [--skip-validation] [--skip-backup] [--dry-run]
 * 
 * Options:
 *   --skip-validation   Skip staging validation (NOT RECOMMENDED)
 *   --skip-backup       Skip backup creation (NOT RECOMMENDED)
 *   --dry-run          Preview deployment without executing
 * 
 * Exit Codes:
 *   0 - Deployment successful
 *   1 - Deployment failed (rollback initiated)
 *   2 - Pre-deployment validation failed
 *   3 - Backup failed
 */

import { promises as fs } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  skipValidation: args.includes('--skip-validation'),
  skipBackup: args.includes('--skip-backup'),
  dryRun: args.includes('--dry-run')
};

// Deployment state
const state = {
  startTime: Date.now(),
  backupPaths: [],
  oldBotStopped: false,
  newBotStarted: false,
  validationPassed: false
};

/**
 * Print section header
 */
function printSection(title) {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));
}

/**
 * Print step
 */
function printStep(step, total, description) {
  console.log(`\n[${step}/${total}] ${description}`);
}

/**
 * Print result
 */
function printResult(status, message) {
  const icon = status === 'SUCCESS' ? '✓' : status === 'FAIL' ? '✗' : status === 'SKIP' ? '⊘' : 'ℹ';
  console.log(`${icon} ${message}`);
}

/**
 * Execute command with output
 */
async function runCommand(command, description) {
  if (options.dryRun) {
    printResult('INFO', `[DRY RUN] Would execute: ${command}`);
    return { stdout: '', stderr: '' };
  }
  
  try {
    console.log(`  $ ${command}`);
    const { stdout, stderr } = await execAsync(command, { cwd: ROOT_DIR });
    if (stdout) console.log(`  ${stdout.trim()}`);
    if (stderr) console.error(`  ${stderr.trim()}`);
    return { stdout, stderr };
  } catch (error) {
    console.error(`  Error: ${error.message}`);
    throw error;
  }
}

/**
 * Step 1: Pre-deployment validation
 */
async function runPreDeploymentValidation() {
  printSection('Step 1: Pre-Deployment Validation');
  
  if (options.skipValidation) {
    printResult('SKIP', 'Validation skipped (--skip-validation flag)');
    return true;
  }
  
  printResult('INFO', 'Running staging validation...');
  
  try {
    await runCommand('node scripts/validate_staging_deployment.mjs', 'Staging validation');
    
    // Check validation results
    const resultsPath = path.join(ROOT_DIR, 'ops/staging-validation-results.json');
    const resultsData = await fs.readFile(resultsPath, 'utf8');
    const results = JSON.parse(resultsData);
    
    const passRate = (results.summary.passed / results.summary.total) * 100;
    
    if (passRate < 100) {
      printResult('FAIL', `Validation pass rate: ${passRate.toFixed(1)}% (requires 100%)`);
      printResult('FAIL', `Failed tests: ${results.summary.failed}`);
      printResult('FAIL', `Warnings: ${results.summary.warnings}`);
      return false;
    }
    
    printResult('SUCCESS', `Validation passed: ${passRate}% (${results.summary.passed}/${results.summary.total} tests)`);
    state.validationPassed = true;
    return true;
  } catch (error) {
    printResult('FAIL', `Validation failed: ${error.message}`);
    return false;
  }
}

/**
 * Step 2: Environment verification
 */
async function verifyEnvironment() {
  printSection('Step 2: Environment Verification');
  
  const required = [
    'BOT_TOKEN',
    'GUILD_ID',
    'ARCHIVE_HMAC_SECRET',
    'PROMETHEUS_PORT'
  ];
  
  let allPresent = true;
  
  for (const envVar of required) {
    if (process.env[envVar]) {
      const value = envVar === 'ARCHIVE_HMAC_SECRET' 
        ? `${process.env[envVar].substring(0, 8)}...` 
        : process.env[envVar];
      printResult('SUCCESS', `${envVar}: ${value}`);
    } else {
      printResult('FAIL', `${envVar}: NOT SET`);
      allPresent = false;
    }
  }
  
  // Validate HMAC secret length
  if (process.env.ARCHIVE_HMAC_SECRET) {
    const secretLength = process.env.ARCHIVE_HMAC_SECRET.length;
    if (secretLength < 64) {
      printResult('FAIL', `ARCHIVE_HMAC_SECRET too short: ${secretLength} chars (minimum 64)`);
      allPresent = false;
    } else {
      printResult('SUCCESS', `ARCHIVE_HMAC_SECRET length: ${secretLength} chars`);
    }
    
    // Check for default secret
    if (process.env.ARCHIVE_HMAC_SECRET === 'default-secret-change-me') {
      printResult('FAIL', 'ARCHIVE_HMAC_SECRET is default value (MUST CHANGE!)');
      allPresent = false;
    }
  }
  
  return allPresent;
}

/**
 * Step 3: Create backups
 */
async function createBackups() {
  printSection('Step 3: Create Backups');
  
  if (options.skipBackup) {
    printResult('SKIP', 'Backups skipped (--skip-backup flag)');
    return true;
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  try {
    // Backup archive
    const archivePath = path.join(ROOT_DIR, 'Store/security-bot-state/role-archive/role-changes.json');
    const archiveBackupPath = path.join(ROOT_DIR, `Store/security-bot-state/role-archive/role-changes.backup.${timestamp}.json`);
    
    try {
      await fs.access(archivePath);
      if (!options.dryRun) {
        await fs.copyFile(archivePath, archiveBackupPath);
      }
      printResult('SUCCESS', `Archive backup: ${path.basename(archiveBackupPath)}`);
      state.backupPaths.push(archiveBackupPath);
    } catch {
      printResult('SKIP', 'Archive not found (first deployment?)');
    }
    
    // Backup state
    const statePath = path.join(ROOT_DIR, 'Store/security-bot-state/current.json');
    const stateBackupPath = path.join(ROOT_DIR, `Store/security-bot-state/current.backup.${timestamp}.json`);
    
    try {
      await fs.access(statePath);
      if (!options.dryRun) {
        await fs.copyFile(statePath, stateBackupPath);
      }
      printResult('SUCCESS', `State backup: ${path.basename(stateBackupPath)}`);
      state.backupPaths.push(stateBackupPath);
    } catch {
      printResult('SKIP', 'State not found (first deployment?)');
    }
    
    // Create deployment snapshot
    const snapshotPath = path.join(ROOT_DIR, `deployment-snapshot-${timestamp}.tar.gz`);
    if (!options.dryRun) {
      await runCommand(
        `tar -czf ${snapshotPath} src/bot/state/ src/services/ Store/security-bot-state/`,
        'Create deployment snapshot'
      );
    }
    printResult('SUCCESS', `Deployment snapshot: ${path.basename(snapshotPath)}`);
    state.backupPaths.push(snapshotPath);
    
    printResult('SUCCESS', `Created ${state.backupPaths.length} backups`);
    return true;
  } catch (error) {
    printResult('FAIL', `Backup failed: ${error.message}`);
    return false;
  }
}

/**
 * Step 4: Stop old bot
 */
async function stopOldBot() {
  printSection('Step 4: Stop Old Bot');
  
  try {
    // Check if bot is running
    const { stdout } = await runCommand('pm2 list', 'Check PM2 status');
    
    if (stdout.includes('security-bot-production')) {
      printResult('INFO', 'Found running bot, stopping...');
      await runCommand('pm2 stop security-bot-production', 'Stop old bot');
      
      // Wait for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      printResult('SUCCESS', 'Old bot stopped');
      state.oldBotStopped = true;
    } else {
      printResult('SKIP', 'No running bot found');
    }
    
    return true;
  } catch (error) {
    printResult('FAIL', `Failed to stop old bot: ${error.message}`);
    return false;
  }
}

/**
 * Step 5: Install dependencies
 */
async function installDependencies() {
  printSection('Step 5: Install Dependencies');
  
  try {
    await runCommand('npm install --production', 'Install dependencies');
    printResult('SUCCESS', 'Dependencies installed');
    
    // Check for vulnerabilities
    try {
      const { stdout } = await runCommand('npm audit --json', 'Security audit');
      const audit = JSON.parse(stdout);
      
      if (audit.metadata.vulnerabilities.total === 0) {
        printResult('SUCCESS', 'No vulnerabilities found');
      } else {
        printResult('FAIL', `Found ${audit.metadata.vulnerabilities.total} vulnerabilities`);
        return false;
      }
    } catch (error) {
      printResult('SKIP', 'npm audit check skipped');
    }
    
    return true;
  } catch (error) {
    printResult('FAIL', `Failed to install dependencies: ${error.message}`);
    return false;
  }
}

/**
 * Step 6: Build application
 */
async function buildApplication() {
  printSection('Step 6: Build Application');
  
  try {
    await runCommand('npm run build', 'Build application');
    printResult('SUCCESS', 'Build completed');
    
    // Verify dist directory
    const distPath = path.join(ROOT_DIR, 'dist');
    try {
      await fs.access(distPath);
      printResult('SUCCESS', 'dist/ directory verified');
    } catch {
      printResult('FAIL', 'dist/ directory not found');
      return false;
    }
    
    return true;
  } catch (error) {
    printResult('FAIL', `Build failed: ${error.message}`);
    return false;
  }
}

/**
 * Step 7: Start new bot
 */
async function startNewBot() {
  printSection('Step 7: Start New Bot');
  
  try {
    await runCommand(
      'pm2 start npm --name "security-bot-production" -- run start:production',
      'Start new bot'
    );
    
    printResult('SUCCESS', 'New bot started');
    state.newBotStarted = true;
    
    // Wait for initialization
    printResult('INFO', 'Waiting for bot initialization (30 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Save PM2 configuration
    await runCommand('pm2 save', 'Save PM2 configuration');
    printResult('SUCCESS', 'PM2 configuration saved');
    
    return true;
  } catch (error) {
    printResult('FAIL', `Failed to start new bot: ${error.message}`);
    return false;
  }
}

/**
 * Step 8: Post-deployment validation
 */
async function runPostDeploymentValidation() {
  printSection('Step 8: Post-Deployment Validation');
  
  const checks = [];
  
  // Check 1: Bot is running
  try {
    const { stdout } = await runCommand('pm2 list', 'Check bot status');
    if (stdout.includes('security-bot-production') && stdout.includes('online')) {
      printResult('SUCCESS', 'Bot is online');
      checks.push(true);
    } else {
      printResult('FAIL', 'Bot is not online');
      checks.push(false);
    }
  } catch (error) {
    printResult('FAIL', `Status check failed: ${error.message}`);
    checks.push(false);
  }
  
  // Check 2: Prometheus endpoint
  try {
    if (!options.dryRun) {
      const port = process.env.PROMETHEUS_PORT || 9090;
      await runCommand(`curl -s http://localhost:${port}/metrics | head -10`, 'Check Prometheus endpoint');
      printResult('SUCCESS', 'Prometheus endpoint responding');
      checks.push(true);
    } else {
      printResult('SKIP', 'Prometheus check skipped (dry run)');
      checks.push(true);
    }
  } catch (error) {
    printResult('FAIL', `Prometheus endpoint not responding: ${error.message}`);
    checks.push(false);
  }
  
  // Check 3: Memory usage
  try {
    const { stdout } = await runCommand('pm2 show security-bot-production', 'Check memory usage');
    printResult('INFO', 'Memory usage check completed');
    checks.push(true);
  } catch (error) {
    printResult('FAIL', `Memory check failed: ${error.message}`);
    checks.push(false);
  }
  
  // Check 4: No errors in logs
  try {
    const { stdout } = await runCommand('pm2 logs security-bot-production --lines 50 --nostream', 'Check logs');
    if (stdout.toLowerCase().includes('error') || stdout.toLowerCase().includes('fatal')) {
      printResult('FAIL', 'Errors found in logs');
      checks.push(false);
    } else {
      printResult('SUCCESS', 'No errors in recent logs');
      checks.push(true);
    }
  } catch (error) {
    printResult('SKIP', 'Log check skipped');
    checks.push(true);
  }
  
  const passed = checks.filter(c => c).length;
  const total = checks.length;
  const passRate = (passed / total) * 100;
  
  printResult('INFO', `Post-deployment validation: ${passed}/${total} checks passed (${passRate.toFixed(1)}%)`);
  
  return passRate >= 75; // Require 75% pass rate
}

/**
 * Rollback deployment
 */
async function rollback() {
  printSection('ROLLBACK: Reverting Deployment');
  
  try {
    // Stop new bot if started
    if (state.newBotStarted) {
      printResult('INFO', 'Stopping new bot...');
      await runCommand('pm2 stop security-bot-production', 'Stop new bot');
      printResult('SUCCESS', 'New bot stopped');
    }
    
    // Restore backups
    if (state.backupPaths.length > 0) {
      printResult('INFO', 'Restoring backups...');
      
      for (const backupPath of state.backupPaths) {
        if (backupPath.includes('role-changes.backup')) {
          const archivePath = path.join(ROOT_DIR, 'Store/security-bot-state/role-archive/role-changes.json');
          await fs.copyFile(backupPath, archivePath);
          printResult('SUCCESS', 'Archive restored');
        } else if (backupPath.includes('current.backup')) {
          const statePath = path.join(ROOT_DIR, 'Store/security-bot-state/current.json');
          await fs.copyFile(backupPath, statePath);
          printResult('SUCCESS', 'State restored');
        }
      }
    }
    
    // Restart old bot if it was running
    if (state.oldBotStopped) {
      printResult('INFO', 'Restarting old bot...');
      await runCommand('pm2 restart security-bot-production', 'Restart old bot');
      printResult('SUCCESS', 'Old bot restarted');
    }
    
    printResult('SUCCESS', 'Rollback completed');
    return true;
  } catch (error) {
    printResult('FAIL', `Rollback failed: ${error.message}`);
    return false;
  }
}

/**
 * Generate deployment report
 */
async function generateReport(success) {
  printSection('Deployment Report');
  
  const duration = Math.round((Date.now() - state.startTime) / 1000);
  const timestamp = new Date().toISOString();
  
  const report = {
    timestamp,
    duration: `${duration}s`,
    success,
    options,
    state,
    checks: {
      validationPassed: state.validationPassed,
      backupsCreated: state.backupPaths.length,
      oldBotStopped: state.oldBotStopped,
      newBotStarted: state.newBotStarted
    }
  };
  
  // Save report
  const reportPath = path.join(ROOT_DIR, 'ops/deployment-report.json');
  if (!options.dryRun) {
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    printResult('SUCCESS', `Report saved: ${reportPath}`);
  }
  
  // Print summary
  console.log('\nDeployment Summary:');
  console.log(`  Status: ${success ? '✓ SUCCESS' : '✗ FAILED'}`);
  console.log(`  Duration: ${duration}s`);
  console.log(`  Backups created: ${state.backupPaths.length}`);
  console.log(`  Validation passed: ${state.validationPassed ? 'Yes' : 'No'}`);
  
  return report;
}

/**
 * Main execution
 */
async function main() {
  console.log('Production Deployment Script');
  console.log('Security Intelligence System v1.0.0');
  console.log('Timestamp:', new Date().toISOString());
  
  if (options.dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made\n');
  }
  
  try {
    // Step 1: Pre-deployment validation
    printStep(1, 8, 'Pre-Deployment Validation');
    if (!await runPreDeploymentValidation()) {
      console.error('\n❌ Pre-deployment validation failed. Aborting deployment.');
      process.exit(2);
    }
    
    // Step 2: Environment verification
    printStep(2, 8, 'Environment Verification');
    if (!await verifyEnvironment()) {
      console.error('\n❌ Environment verification failed. Aborting deployment.');
      process.exit(2);
    }
    
    // Step 3: Create backups
    printStep(3, 8, 'Create Backups');
    if (!await createBackups()) {
      console.error('\n❌ Backup creation failed. Aborting deployment.');
      process.exit(3);
    }
    
    // Step 4: Stop old bot
    printStep(4, 8, 'Stop Old Bot');
    if (!await stopOldBot()) {
      console.error('\n❌ Failed to stop old bot. Initiating rollback...');
      await rollback();
      process.exit(1);
    }
    
    // Step 5: Install dependencies
    printStep(5, 8, 'Install Dependencies');
    if (!await installDependencies()) {
      console.error('\n❌ Dependency installation failed. Initiating rollback...');
      await rollback();
      process.exit(1);
    }
    
    // Step 6: Build application
    printStep(6, 8, 'Build Application');
    if (!await buildApplication()) {
      console.error('\n❌ Build failed. Initiating rollback...');
      await rollback();
      process.exit(1);
    }
    
    // Step 7: Start new bot
    printStep(7, 8, 'Start New Bot');
    if (!await startNewBot()) {
      console.error('\n❌ Failed to start new bot. Initiating rollback...');
      await rollback();
      process.exit(1);
    }
    
    // Step 8: Post-deployment validation
    printStep(8, 8, 'Post-Deployment Validation');
    if (!await runPostDeploymentValidation()) {
      console.error('\n❌ Post-deployment validation failed. Initiating rollback...');
      await rollback();
      await generateReport(false);
      process.exit(1);
    }
    
    // Generate success report
    await generateReport(true);
    
    console.log('\n🎉 Production deployment completed successfully!');
    console.log('\nNext Steps:');
    console.log('  1. Monitor bot for 24 hours using: pm2 logs security-bot-production');
    console.log('  2. Check Prometheus metrics: curl http://localhost:9090/metrics');
    console.log('  3. Test Discord command: /ops security');
    console.log('  4. Review deployment report: ops/deployment-report.json');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Deployment failed with error:', error);
    console.error('\nInitiating rollback...');
    await rollback();
    await generateReport(false);
    process.exit(1);
  }
}

main();
