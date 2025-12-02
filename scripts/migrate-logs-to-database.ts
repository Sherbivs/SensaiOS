/**
 * Log Migration Script — Filesystem to Database
 * 
 * Purpose:
 * - Migrate ALL logs/errors from /Store filesystem to database
 * - Consolidate error-reports/, emergency-error-logs/, logs/ directories
 * - Enable SQL-queryable logs with retention management
 * - Prepare for /Store cleanup (remove ~35+ log files)
 * 
 * Migration Targets:
 * 1. /Store/error-reports/*.md → ErrorLog table (fingerprint dedup)
 * 2. /Store/emergency-error-logs/*.json → ErrorLog table (JSON parse + dedup)
 * 3. /Store/logs/** → LogEntry hypertable (preserve timestamps)
 * 4. /Store/monitoring/*.log → LogEntry hypertable (monitoring category)
 * 
 * Usage:
 *   npm run migrate:logs [--dry-run] [--source <directory>]
 * 
 * Options:
 *   --dry-run    Show what would be migrated without writing to database
 *   --source     Override source directory (default: Store/)
 *   --cleanup    Delete source files after successful migration (DANGEROUS)
 * 
 * @module scripts/migrate-logs-to-database
 */

/* eslint-disable no-console */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getTimescaleDBWorker } from '../src/workers/database/index.js';
import type { LogEvent, ErrorReport } from '../src/workers/database/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

interface MigrationConfig {
  sourceDir: string;
  dryRun: boolean;
  cleanup: boolean;
  batchSize: number;
}

const DEFAULT_CONFIG: MigrationConfig = {
  sourceDir: path.join(__dirname, '..', 'Store'),
  dryRun: false,
  cleanup: false,
  batchSize: 100, // Process 100 files/entries per batch
};

// ============================================================================
// Markdown Error Report Parser
// ============================================================================

/**
 * Parse markdown error report from /Store/error-reports
 * 
 * Format:
 * ```markdown
 * # Error Report
 * **ErrorId:** uuid
 * **Category:** database
 * **Severity:** critical
 * ...
 * ## Stack Trace
 * ```
 */
async function parseMarkdownErrorReport(filePath: string): Promise<ErrorReport | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Extract metadata using regex
    const errorId = content.match(/\*\*ErrorId:\*\*\s+(.+)/)?.[1]?.trim();
    const category = content.match(/\*\*Category:\*\*\s+(.+)/)?.[1]?.trim() || 'unknown';
    const severity = content.match(/\*\*Severity:\*\*\s+(.+)/)?.[1]?.trim() || 'error';
    const errorName = content.match(/\*\*Error:\*\*\s+(.+)/)?.[1]?.trim() || 'UnknownError';
    const errorMessage = content.match(/\*\*Message:\*\*\s+(.+)/)?.[1]?.trim() || '';
    
    // Extract stack trace (after ## Stack Trace heading)
    const stackTraceMatch = content.match(/## Stack Trace\n```\n([\s\S]+?)\n```/);
    const stackTrace = stackTraceMatch?.[1]?.trim();
    
    // Extract timestamp from filename (error-{id}-{timestamp}.md)
    const timestampMatch = path.basename(filePath).match(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/);
    const timestamp = timestampMatch ? new Date(timestampMatch[0].replace(/-/g, ':').replace('T', 'T').slice(0, -1)) : new Date();
    
    // Generate fingerprint (hash of error name + message + first line of stack)
    const fingerprintInput = `${errorName}:${errorMessage}:${stackTrace?.split('\n')[0] || ''}`;
    const fingerprint = crypto.createHash('sha256').update(fingerprintInput).digest('hex').substring(0, 32);
    
    return {
      errorId,
      fingerprint,
      category,
      severity,
      errorName,
      errorMessage,
      stackTrace,
      occurrenceCount: 1,
      firstSeen: timestamp,
      lastSeen: timestamp,
      contextData: {
        source: 'markdown',
        originalFile: path.basename(filePath),
      },
    };
  } catch (error) {
    console.error(`Failed to parse markdown error report ${filePath}:`, error);
    return null;
  }
}

// ============================================================================
// JSON Error Log Parser
// ============================================================================

/**
 * Parse JSON error log from /Store/emergency-error-logs
 * 
 * Format:
 * ```json
 * {
 *   "error": {
 *     "name": "DatabaseConnectionError",
 *     "message": "Connection timeout",
 *     "stack": "..."
 *   },
 *   "timestamp": "2025-12-02T10:30:00.000Z"
 * }
 * ```
 */
async function parseJSONErrorLog(filePath: string): Promise<ErrorReport | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    const errorName = data.error?.name || data.name || 'UnknownError';
    const errorMessage = data.error?.message || data.message || '';
    const stackTrace = data.error?.stack || data.stack;
    const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();
    
    // Generate fingerprint
    const fingerprintInput = `${errorName}:${errorMessage}:${stackTrace?.split('\n')[0] || ''}`;
    const fingerprint = crypto.createHash('sha256').update(fingerprintInput).digest('hex').substring(0, 32);
    
    return {
      fingerprint,
      category: data.category || 'emergency',
      severity: data.severity || 'critical',
      errorName,
      errorMessage,
      stackTrace,
      occurrenceCount: 1,
      firstSeen: timestamp,
      lastSeen: timestamp,
      contextData: {
        source: 'json',
        originalFile: path.basename(filePath),
        ...data.context,
      },
    };
  } catch (error) {
    console.error(`Failed to parse JSON error log ${filePath}:`, error);
    return null;
  }
}

// ============================================================================
// Log File Parser
// ============================================================================

/**
 * Parse log file from /Store/logs or /Store/monitoring
 * 
 * Supports multiple formats:
 * - JSON lines: {"level":"error","message":"...","timestamp":"..."}
 * - Plain text: [2025-12-02 10:30:00] [ERROR] Message
 */
async function parseLogFile(filePath: string, category: string): Promise<LogEvent[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    const events: LogEvent[] = [];
    
    for (const line of lines) {
      try {
        // Try parsing as JSON first
        const json = JSON.parse(line);
        events.push({
          timestamp: json.timestamp || new Date(),
          level: json.level || 'info',
          category: json.category || category,
          message: json.message || line.substring(0, 500), // Truncate long messages
          metadata: json.metadata || { originalFile: path.basename(filePath) },
          serviceName: json.serviceName,
          userId: json.userId,
        });
      } catch {
        // Fall back to plain text parsing
        const timestampMatch = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
        const levelMatch = line.match(/\[(ERROR|WARN|INFO|DEBUG)\]/);
        
        events.push({
          timestamp: timestampMatch ? new Date(timestampMatch[1]) : new Date(),
          level: levelMatch?.[1]?.toLowerCase() || 'info',
          category,
          message: line.substring(0, 500), // Truncate long messages
          metadata: { originalFile: path.basename(filePath), format: 'plaintext' },
        });
      }
    }
    
    return events;
  } catch (error) {
    console.error(`Failed to parse log file ${filePath}:`, error);
    return [];
  }
}

// ============================================================================
// Directory Scanner
// ============================================================================

/**
 * Recursively scan directory for files matching pattern
 */
async function scanDirectory(dir: string, pattern: RegExp): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        files.push(...await scanDirectory(fullPath, pattern));
      } else if (pattern.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Failed to scan directory ${dir}:`, error);
  }
  
  return files;
}

// ============================================================================
// Migration Logic
// ============================================================================

/**
 * Migrate error reports to database
 */
async function migrateErrorReports(config: MigrationConfig): Promise<number> {
  console.log('🔍 Scanning for error reports...');
  
  const markdownFiles = await scanDirectory(
    path.join(config.sourceDir, 'error-reports'),
    /\.md$/
  );
  
  const jsonFiles = await scanDirectory(
    path.join(config.sourceDir, 'emergency-error-logs'),
    /\.json$/
  );
  
  console.log(`Found ${markdownFiles.length} markdown + ${jsonFiles.length} JSON error reports`);
  
  const errorReports: ErrorReport[] = [];
  
  // Parse markdown reports
  for (const file of markdownFiles) {
    const report = await parseMarkdownErrorReport(file);
    if (report) errorReports.push(report);
  }
  
  // Parse JSON reports
  for (const file of jsonFiles) {
    const report = await parseJSONErrorLog(file);
    if (report) errorReports.push(report);
  }
  
  console.log(`Parsed ${errorReports.length} error reports successfully`);
  
  if (config.dryRun) {
    console.log('[DRY RUN] Would migrate:', errorReports.length, 'error reports');
    return errorReports.length;
  }
  
  // Migrate to database in batches
  const worker = getTimescaleDBWorker();
  await worker.initialize();
  await worker.start();
  
  try {
    for (let i = 0; i < errorReports.length; i += config.batchSize) {
      const batch = errorReports.slice(i, i + config.batchSize);
      await worker.migrateErrorReports(batch);
      console.log(`✅ Migrated batch ${Math.floor(i / config.batchSize) + 1}/${Math.ceil(errorReports.length / config.batchSize)}`);
    }
    
    // Cleanup if requested
    if (config.cleanup) {
      console.log('🗑️  Cleaning up source files...');
      for (const file of [...markdownFiles, ...jsonFiles]) {
        await fs.unlink(file);
      }
      console.log('✅ Source files deleted');
    }
  } finally {
    await worker.stop();
  }
  
  return errorReports.length;
}

/**
 * Migrate log files to database
 */
async function migrateLogs(config: MigrationConfig): Promise<number> {
  console.log('🔍 Scanning for log files...');
  
  const logDirs = [
    { dir: path.join(config.sourceDir, 'logs'), category: 'system' },
    { dir: path.join(config.sourceDir, 'monitoring'), category: 'monitoring' },
  ];
  
  let totalEvents = 0;
  const worker = getTimescaleDBWorker();
  await worker.initialize();
  await worker.start();
  
  try {
    for (const { dir, category } of logDirs) {
      const logFiles = await scanDirectory(dir, /\.(log|txt)$/);
      console.log(`Found ${logFiles.length} log files in ${category}`);
      
      for (const file of logFiles) {
        const events = await parseLogFile(file, category);
        totalEvents += events.length;
        
        if (config.dryRun) {
          console.log(`[DRY RUN] Would migrate ${events.length} events from ${path.basename(file)}`);
          continue;
        }
        
        // Migrate events in batches
        for (let i = 0; i < events.length; i += config.batchSize) {
          const batch = events.slice(i, i + config.batchSize);
          await worker.ingestLogs(batch);
        }
        
        console.log(`✅ Migrated ${events.length} events from ${path.basename(file)}`);
        
        // Cleanup if requested
        if (config.cleanup) {
          await fs.unlink(file);
        }
      }
    }
  } finally {
    await worker.stop();
  }
  
  return totalEvents;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Log Migration Script — Filesystem → Database                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  // Parse CLI arguments
  const args = process.argv.slice(2);
  const config: MigrationConfig = { ...DEFAULT_CONFIG };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      config.dryRun = true;
    } else if (args[i] === '--cleanup') {
      config.cleanup = true;
    } else if (args[i] === '--source' && args[i + 1]) {
      config.sourceDir = args[++i];
    }
  }
  
  console.log('Configuration:');
  console.log(`  Source Directory: ${config.sourceDir}`);
  console.log(`  Dry Run: ${config.dryRun ? 'YES' : 'NO'}`);
  console.log(`  Cleanup After Migration: ${config.cleanup ? 'YES (DANGEROUS)' : 'NO'}`);
  console.log(`  Batch Size: ${config.batchSize}\n`);
  
  if (config.cleanup && !config.dryRun) {
    console.warn('⚠️  WARNING: Cleanup mode will DELETE source files after migration!');
    console.warn('⚠️  Press Ctrl+C within 5 seconds to abort...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  try {
    // Step 1: Migrate error reports
    console.log('\n📊 Step 1: Migrating Error Reports');
    console.log('─────────────────────────────────────');
    const errorCount = await migrateErrorReports(config);
    console.log(`✅ Migrated ${errorCount} error reports\n`);
    
    // Step 2: Migrate log files
    console.log('📊 Step 2: Migrating Log Files');
    console.log('─────────────────────────────────────');
    const logCount = await migrateLogs(config);
    console.log(`✅ Migrated ${logCount} log events\n`);
    
    // Summary
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  Migration Complete!                                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`Total Error Reports: ${errorCount}`);
    console.log(`Total Log Events: ${logCount}`);
    console.log(`\nNext Steps:`);
    console.log(`  1. Verify data in database:`);
    console.log(`     npm run db:cli -- query "SELECT COUNT(*) FROM \\"ErrorLog\\""`);
    console.log(`     npm run db:cli -- query "SELECT COUNT(*) FROM log_entries"`);
    console.log(`  2. Test /ops commands:`);
    console.log(`     /ops errors --filter critical`);
    console.log(`     /ops logs --since 24h`);
    if (!config.cleanup) {
      console.log(`  3. Run migration with --cleanup to delete source files (ONLY after verification!)`);
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // Ensure clean exit
    process.exit(0);
  }
}

// Run migration
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
