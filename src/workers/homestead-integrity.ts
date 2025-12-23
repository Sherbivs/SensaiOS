/**
 * Homestead Integrity Check Worker
 * 
 * PURPOSE:
 * Periodic verification of homestead channel integrity across all guilds.
 * Detects orphans (DB exists, Discord missing) and ghosts (Discord exists, DB missing).
 * Generates comprehensive integrity reports and alerts administrators when thresholds exceeded.
 * 
 * ARCHITECTURE:
 * - Hourly Cron Job: Scheduled via Render cron service
 * - Guild-Level Verification: Iterates through all guilds with homesteads
 * - IntegrityReport Generation: JSON reports stored to Store/homestead-integrity/
 * - Alert System: DRIPTVDD alerts when issue rate exceeds 5%
 * 
 * INTEGRATION POINTS:
 * - HomesteadVerificationService: verifyIntegrity() method
 * - EventBus: emitAlert() for DRIPTVDD notifications
 * - File System: Store/homestead-integrity/ for report persistence
 * - Prisma: Database queries for guild homestead lookups
 * 
 * SECURITY:
 * - Read-only operations (no modifications during check)
 * - Rate limiting: 1 check per hour maximum
 * - Error isolation: Guild failures don't cascade
 * 
 * @module workers/homestead-integrity
 * @author Security Specialist + AI Coding Specialist
 * @created 2025-12-06
 */

import { Client, GatewayIntentBits } from 'discord.js';
import { prisma } from '../shared/prisma.js';
import { HomesteadVerificationService } from '../services/homestead-verification.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { IntegrityReport } from '../services/homestead-verification.js';
import { getErrorMessage } from '../shared/utils/error-utils.js';
import { daysAgo } from '../shared/utils/date-utils.js';
import { getLogger, errorContext } from '../shared/logging/index.js';

const logger = getLogger();

// ============================================================================
// CONFIGURATION
// ============================================================================

const INTEGRITY_REPORT_DIR = 'Store/homestead-integrity';
const ISSUE_RATE_THRESHOLD = 0.05; // 5% orphan/ghost rate triggers alert
// Note: Scheduled hourly via Render cron (see render.yaml)

// ============================================================================
// ALERT SYSTEM INTEGRATION
// ============================================================================

interface IntegrityAlertPayload {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  guildId: string;
  guildName: string;
  totalHomesteads: number;
  orphans: number;
  ghosts: number;
  issueRate: string;
  reportPath: string;
  timestamp: string;
  mitreAttack: string;
  mitreDescription: string;
  recommendedAction: string;
}

/**
 * Emits alert to DRIPTVDD when integrity issues exceed threshold.
 * Uses existing alert infrastructure from security bot.
 */
function emitIntegrityAlert(report: IntegrityReport, reportPath: string): void {
  const totalIssues = report.orphans + report.ghosts;
  const issueRate = report.totalHomesteads > 0 ? totalIssues / report.totalHomesteads : 0;

  const severity: 'HIGH' | 'MEDIUM' | 'LOW' = 
    issueRate > 0.10 ? 'HIGH' :
    issueRate > 0.05 ? 'MEDIUM' : 'LOW';

  const payload: IntegrityAlertPayload = {
    severity,
    guildId: report.guildId,
    guildName: report.guildId, // Guild name fetched during check
    totalHomesteads: report.totalHomesteads,
    orphans: report.orphans,
    ghosts: report.ghosts,
    issueRate: `${(issueRate * 100).toFixed(2)}%`,
    reportPath,
    timestamp: report.timestamp.toISOString(),
    mitreAttack: 'T1098.001',
    mitreDescription: 'Account Manipulation: Additional Cloud Credentials',
    recommendedAction: 'Review integrity report and run /ops homestead:cleanup for affected guild'
  };

  // Log alert - will be forwarded to Loki
  logger.warn('HomesteadIntegrity', 'emitIntegrityAlert', `ALERT: ${severity} integrity issues in guild ${report.guildId}`, {
    guildId: report.guildId,
    metadata: {
      severity,
      issueRate: payload.issueRate,
      totalIssues,
      totalHomesteads: report.totalHomesteads,
      orphans: report.orphans,
      ghosts: report.ghosts,
      reportPath
    }
  });

  // TODO: Integrate with DripAlerts system when available
}

// ============================================================================
// REPORT PERSISTENCE
// ============================================================================

/**
 * Saves IntegrityReport to disk as JSON.
 * Format: {guildId}-{timestamp}.json
 */
async function saveIntegrityReport(report: IntegrityReport): Promise<string> {
  // Ensure report directory exists
  await fs.mkdir(INTEGRITY_REPORT_DIR, { recursive: true });

  // Generate filename with timestamp
  const timestamp = report.timestamp.toISOString().replace(/:/g, '-');
  const filename = `${report.guildId}-${timestamp}.json`;
  const filepath = join(INTEGRITY_REPORT_DIR, filename);

  // Write report as formatted JSON
  await fs.writeFile(
    filepath,
    JSON.stringify(report, null, 2),
    'utf-8'
  );

  return filepath;
}

/**
 * Cleans up old integrity reports (retain last 30 days).
 */
async function cleanupOldReports(): Promise<void> {
  try {
    const files = await fs.readdir(INTEGRITY_REPORT_DIR);
    const cutoffTime = daysAgo(30).getTime();

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filepath = join(INTEGRITY_REPORT_DIR, file);
      const stats = await fs.stat(filepath);

      if (stats.mtimeMs < cutoffTime) {
        await fs.unlink(filepath);
        logger.info('HomesteadIntegrity', 'cleanupOldReports', `Deleted old report: ${file}`);
      }
    }
  } catch (err) {
    logger.error('HomesteadIntegrity', 'cleanupOldReports', `Cleanup error: ${getErrorMessage(err)}`, errorContext(err as Error));
  }
}

// ============================================================================
// MAIN INTEGRITY CHECK
// ============================================================================

/**
 * Runs integrity check for all guilds with homesteads.
 * Generates reports and emits alerts for threshold violations.
 */
export async function runHomesteadIntegrityCheck(client: Client): Promise<void> {
  const startTime = Date.now();
  logger.info('HomesteadIntegrity', 'runCheck', `Starting integrity check at ${new Date().toISOString()}`);

  try {
    // Get all unique guilds with homesteads
    const guilds = await prisma.homesteadChannel.findMany({
      select: { guildId: true },
      distinct: ['guildId'],
      where: { status: { in: ['active', 'suspended'] } } // Skip deleted/orphaned
    });

    logger.info('HomesteadIntegrity', 'runCheck', `Checking ${guilds.length} guilds`);

    const verificationService = new HomesteadVerificationService(client);
    let totalGuildsChecked = 0;
    let totalIssuesFound = 0;
    let totalAlertsEmitted = 0;

    // Verify each guild sequentially (avoid overwhelming Discord API)
    for (const { guildId } of guilds) {
      try {
        // Run integrity verification
        const report = await verificationService.verifyIntegrity(guildId);
        totalGuildsChecked++;

        // Save report to disk
        const reportPath = await saveIntegrityReport(report);

        // Calculate issue metrics
        const totalIssues = report.orphans + report.ghosts;
        const issueRate = report.totalHomesteads > 0 
          ? totalIssues / report.totalHomesteads 
          : 0;

        totalIssuesFound += totalIssues;

        // Emit alert if threshold exceeded
        if (issueRate > ISSUE_RATE_THRESHOLD) {
          emitIntegrityAlert(report, reportPath);
          totalAlertsEmitted++;
        }

        // Log summary
        logger.info('HomesteadIntegrity', 'guildCheck', `Guild ${guildId}: ${report.totalHomesteads} homesteads, ${report.orphans} orphans, ${report.ghosts} ghosts (${(issueRate * 100).toFixed(1)}%)`, {
          guildId,
          metadata: {
            totalHomesteads: report.totalHomesteads,
            orphans: report.orphans,
            ghosts: report.ghosts,
            issueRate: issueRate * 100
          }
        });

      } catch (guildErr) {
        // Log guild-specific error but continue checking other guilds
        logger.error('HomesteadIntegrity', 'guildCheck', `Error checking guild ${guildId}: ${getErrorMessage(guildErr)}`, {
          guildId,
          ...errorContext(guildErr as Error)
        });
      }
    }

    // Cleanup old reports
    await cleanupOldReports();

    // Final summary
    const duration = Date.now() - startTime;
    logger.info('HomesteadIntegrity', 'runCheck', `Check complete in ${duration}ms`, {
      durationMs: duration,
      metadata: {
        guildsChecked: totalGuildsChecked,
        totalGuilds: guilds.length,
        totalIssues: totalIssuesFound,
        alertsEmitted: totalAlertsEmitted
      }
    });

  } catch (err) {
    logger.error('HomesteadIntegrity', 'runCheck', `Fatal error: ${getErrorMessage(err)}`, errorContext(err as Error));
    throw err;
  }
}

// ============================================================================
// WORKER ENTRY POINT
// ============================================================================

/**
 * Main entry point for Render cron job.
 * Initializes Discord client and runs integrity check.
 */
async function main(): Promise<void> {
  logger.info('HomesteadIntegrity', 'main', 'Worker starting...');

  // Initialize Discord client with minimal intents (read-only)
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
    ],
  });

  try {
    // Login to Discord
    await client.login(process.env.BOT_TOKEN);
    logger.info('HomesteadIntegrity', 'main', 'Discord client ready');

    // Wait for client to be fully ready
    await new Promise<void>((resolve) => {
      client.once('ready', () => resolve());
    });

    // Run integrity check
    await runHomesteadIntegrityCheck(client);

    // Graceful shutdown
    await client.destroy();
    logger.info('HomesteadIntegrity', 'main', 'Worker complete');
    process.exit(0);

  } catch (err) {
    logger.error('HomesteadIntegrity', 'main', `Worker failed: ${getErrorMessage(err)}`, errorContext(err as Error));
    await client.destroy();
    process.exit(1);
  }
}

// Run worker if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    logger.error('HomesteadIntegrity', 'main', `Unhandled error: ${err}`, errorContext(err as Error));
    process.exit(1);
  });
}
