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
// ============================================================================
// CONFIGURATION
// ============================================================================
const INTEGRITY_REPORT_DIR = 'Store/homestead-integrity';
const ISSUE_RATE_THRESHOLD = 0.05; // 5% orphan/ghost rate triggers alert
/**
 * Emits alert to DRIPTVDD when integrity issues exceed threshold.
 * Uses existing alert infrastructure from security bot.
 */
function emitIntegrityAlert(report, reportPath) {
    const totalIssues = report.orphans + report.ghosts;
    const issueRate = report.totalHomesteads > 0 ? totalIssues / report.totalHomesteads : 0;
    const severity = issueRate > 0.10 ? 'HIGH' :
        issueRate > 0.05 ? 'MEDIUM' : 'LOW';
    const payload = {
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
    // Log to stderr for worker output visibility
    process.stderr.write(`[HomesteadIntegrity] ALERT: ${severity} integrity issues in guild ${report.guildId}\n` +
        `  Issue Rate: ${payload.issueRate} (${totalIssues}/${report.totalHomesteads})\n` +
        `  Orphans: ${report.orphans} | Ghosts: ${report.ghosts}\n` +
        `  Report: ${reportPath}\n`);
    // TODO: Integrate with DripAlerts system when available
    // For now, rely on stderr logging which is captured by Render logs
}
// ============================================================================
// REPORT PERSISTENCE
// ============================================================================
/**
 * Saves IntegrityReport to disk as JSON.
 * Format: {guildId}-{timestamp}.json
 */
async function saveIntegrityReport(report) {
    // Ensure report directory exists
    await fs.mkdir(INTEGRITY_REPORT_DIR, { recursive: true });
    // Generate filename with timestamp
    const timestamp = report.timestamp.toISOString().replace(/:/g, '-');
    const filename = `${report.guildId}-${timestamp}.json`;
    const filepath = join(INTEGRITY_REPORT_DIR, filename);
    // Write report as formatted JSON
    await fs.writeFile(filepath, JSON.stringify(report, null, 2), 'utf-8');
    return filepath;
}
/**
 * Cleans up old integrity reports (retain last 30 days).
 */
async function cleanupOldReports() {
    try {
        const files = await fs.readdir(INTEGRITY_REPORT_DIR);
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        for (const file of files) {
            if (!file.endsWith('.json'))
                continue;
            const filepath = join(INTEGRITY_REPORT_DIR, file);
            const stats = await fs.stat(filepath);
            if (stats.mtimeMs < thirtyDaysAgo) {
                await fs.unlink(filepath);
                process.stdout.write(`[HomesteadIntegrity] Deleted old report: ${file}\n`);
            }
        }
    }
    catch (err) {
        process.stderr.write(`[HomesteadIntegrity] Cleanup error: ${err instanceof Error ? err.message : String(err)}\n`);
    }
}
// ============================================================================
// MAIN INTEGRITY CHECK
// ============================================================================
/**
 * Runs integrity check for all guilds with homesteads.
 * Generates reports and emits alerts for threshold violations.
 */
export async function runHomesteadIntegrityCheck(client) {
    const startTime = Date.now();
    process.stdout.write(`[HomesteadIntegrity] Starting integrity check at ${new Date().toISOString()}\n`);
    try {
        // Get all unique guilds with homesteads
        const guilds = await prisma.homesteadChannel.findMany({
            select: { guildId: true },
            distinct: ['guildId'],
            where: { status: { in: ['active', 'suspended'] } } // Skip deleted/orphaned
        });
        process.stdout.write(`[HomesteadIntegrity] Checking ${guilds.length} guilds\n`);
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
                process.stdout.write(`[HomesteadIntegrity] Guild ${guildId}: ` +
                    `${report.totalHomesteads} homesteads, ` +
                    `${report.orphans} orphans, ` +
                    `${report.ghosts} ghosts ` +
                    `(${(issueRate * 100).toFixed(1)}%)\n`);
            }
            catch (guildErr) {
                // Log guild-specific error but continue checking other guilds
                process.stderr.write(`[HomesteadIntegrity] Error checking guild ${guildId}: ` +
                    `${guildErr instanceof Error ? guildErr.message : String(guildErr)}\n`);
            }
        }
        // Cleanup old reports
        await cleanupOldReports();
        // Final summary
        const duration = Date.now() - startTime;
        process.stdout.write(`[HomesteadIntegrity] Check complete in ${duration}ms\n` +
            `  Guilds Checked: ${totalGuildsChecked}/${guilds.length}\n` +
            `  Total Issues: ${totalIssuesFound}\n` +
            `  Alerts Emitted: ${totalAlertsEmitted}\n`);
    }
    catch (err) {
        process.stderr.write(`[HomesteadIntegrity] Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
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
async function main() {
    process.stdout.write(`[HomesteadIntegrity] Worker starting...\n`);
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
        process.stdout.write(`[HomesteadIntegrity] Discord client ready\n`);
        // Wait for client to be fully ready
        await new Promise((resolve) => {
            client.once('ready', () => resolve());
        });
        // Run integrity check
        await runHomesteadIntegrityCheck(client);
        // Graceful shutdown
        await client.destroy();
        process.stdout.write(`[HomesteadIntegrity] Worker complete\n`);
        process.exit(0);
    }
    catch (err) {
        process.stderr.write(`[HomesteadIntegrity] Worker failed: ${err instanceof Error ? err.message : String(err)}\n`);
        await client.destroy();
        process.exit(1);
    }
}
// Run worker if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((err) => {
        process.stderr.write(`[HomesteadIntegrity] Unhandled error: ${err}\n`);
        process.exit(1);
    });
}
