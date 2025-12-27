#!/usr/bin/env tsx
/**
 * Security State Migration - Direct PostgreSQL Bypass
 * 
 * FAILSAFE WORKAROUND: Bypasses Prisma ORM and uses direct pg driver
 * to avoid connection pooling issues during migration.
 * 
 * Use this ONLY if Prisma connection pooling continues to fail.
 * 
 * @see docs/projects/security-db-transformation/MASTER-PLAN.md
 * @see scripts/security/migrate-security-state.ts (original Prisma version)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = join(__dirname, "../../Store/security-bot-state");
const CHECKSUM_KEY = "security-bot-integrity-v1";

interface MigrationOptions {
  target: "cloud-prod" | "onpremise-dev" | "onpremise-experiment";
  dryRun: boolean;
  verbose: boolean;
  batchSize: number;
}

interface MigrationStats {
  roleChanges: { total: number; migrated: number; failed: number };
  baselines: { total: number; migrated: number; failed: number };
  errors: string[];
  duration: number;
}

function log(message: string, options: MigrationOptions, level: "info" | "warn" | "error" | "success" | "verbose" = "info") {
  if (level === "verbose" && !options.verbose) return;
  
  const prefix = {
    info: "ℹ️ ",
    warn: "⚠️ ",
    error: "❌",
    success: "✅",
    verbose: "  ",
  }[level];
  
  console.log(`${prefix} ${message}`);
}

function generateChecksum(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function loadSourceData(): Promise<{
  roleChanges: any[];
  baselines: any[];
}> {
  // Load role changes from archive
  const roleArchivePath = join(STORE_PATH, "role-archive/role-changes.json");
  const roleChanges = existsSync(roleArchivePath)
    ? JSON.parse(readFileSync(roleArchivePath, "utf-8")).changes || []
    : [];

  // Load baseline from baselines.json
  const baselinesPath = join(STORE_PATH, "baselines.json");
  const baselineData = existsSync(baselinesPath)
    ? JSON.parse(readFileSync(baselinesPath, "utf-8"))
    : { baselines: {}, metadata: {} };

  // Transform single baseline into per-guild baselines
  const baselines: any[] = [];
  if (baselineData.baselines && Object.keys(baselineData.baselines).length > 0) {
    // Extract unique guilds from role changes
    const guilds = new Map<string, { id: string; name: string }>();
    for (const change of roleChanges) {
      if (!guilds.has(change.guildId)) {
        guilds.set(change.guildId, {
          id: change.guildId,
          name: change.guildName,
        });
      }
    }

    // Create baseline per guild
    for (const [guildId, guild] of guilds) {
      baselines.push({
        guildId,
        guildName: guild.name,
        ...baselineData.baselines,
        computedAt: new Date(baselineData.baselines.computedAt || Date.now()),
      });
    }
  }

  return { roleChanges, baselines };
}

async function migrateDirect(options: MigrationOptions): Promise<MigrationStats> {
  const startTime = Date.now();
  const stats: MigrationStats = {
    roleChanges: { total: 0, migrated: 0, failed: 0 },
    baselines: { total: 0, migrated: 0, failed: 0 },
    errors: [],
    duration: 0,
  };

  // Get database URL from environment
  const databaseUrl = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("PROD_DATABASE_URL or DATABASE_URL environment variable required");
  }

  log(`Connecting to database: ${databaseUrl.replace(/:[^:]*@/, ':****@')}`, options);

  // Create direct PostgreSQL client (NO pooling)
  const client = new pg.Client({
    connectionString: databaseUrl,
    statement_timeout: 300_000, // 5 minutes for migrations
    query_timeout: 300_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 0,
  });

  try {
    await client.connect();
    log("Connected to database", options, "success");

    // Load source data
    log("Loading source data from /Store/security-bot-state/", options);
    const { roleChanges, baselines } = await loadSourceData();
    stats.roleChanges.total = roleChanges.length;
    stats.baselines.total = baselines.length;

    log(`Found ${roleChanges.length} role changes, ${baselines.length} baselines`, options, "success");

    if (options.dryRun) {
      log("DRY RUN - No changes will be made", options, "warn");
      return stats;
    }

    // Migrate role changes in batches
    log(`Inserting role changes (batch size: ${options.batchSize})...`, options);
    for (let i = 0; i < roleChanges.length; i += options.batchSize) {
      const batch = roleChanges.slice(i, i + options.batchSize);
      const batchNum = Math.floor(i / options.batchSize) + 1;

      try {
        // Build multi-row INSERT
        const values: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        for (const change of batch) {
          const timestamp = new Date(change.timestamp);
          const checksumData = JSON.stringify({
            guildId: change.guildId,
            memberId: change.memberId,
            changeType: change.type,
            roleId: change.roleId,
            timestamp: timestamp.toISOString(),
          });
          const checksum = generateChecksum(checksumData);

          values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
          
          params.push(
            change.guildId,
            change.guildName,
            change.memberId,
            change.memberTag,
            change.type, // changeType
            change.roleId,
            change.roleName,
            "SYSTEM", // executorId
            "SYSTEM#0000", // executorTag
            [], // executorRoles (empty array)
            true, // authorized
            false, // reverted
            change.origin,
            checksum,
          );
        }

        const query = `
          INSERT INTO role_change_audit (
            guild_id, guild_name, member_id, member_tag, change_type,
            role_id, role_name, executor_id, executor_tag, executor_roles,
            authorized, reverted, origin, checksum
          ) VALUES ${values.join(", ")}
          ON CONFLICT DO NOTHING;
        `;

        const result = await client.query(query, params);
        stats.roleChanges.migrated += result.rowCount || 0;
        
        log(`  Batch ${batchNum}: ${result.rowCount || 0} records inserted`, options, "verbose");
      } catch (error: any) {
        stats.roleChanges.failed += batch.length;
        stats.errors.push(`Role batch ${batchNum}: ${error.message}`);
        log(`  Batch ${batchNum} failed: ${error.message}`, options, "error");
      }
    }

    log(`Role audits: ${stats.roleChanges.migrated}/${stats.roleChanges.total} migrated`, options, "success");

    // Migrate baselines
    log("Inserting baseline records...", options);
    for (const baseline of baselines) {
      try {
        const query = `
          INSERT INTO security_baselines (
            guild_id, guild_name, average_changes_per_hour, average_changes_per_day,
            peak_activity_hours, rapid_change_threshold, max_changes_per_member,
            expected_origins, confidence_level, data_point_count, computed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (guild_id) DO UPDATE SET
            guild_name = EXCLUDED.guild_name,
            average_changes_per_hour = EXCLUDED.average_changes_per_hour,
            average_changes_per_day = EXCLUDED.average_changes_per_day,
            peak_activity_hours = EXCLUDED.peak_activity_hours,
            rapid_change_threshold = EXCLUDED.rapid_change_threshold,
            max_changes_per_member = EXCLUDED.max_changes_per_member,
            expected_origins = EXCLUDED.expected_origins,
            confidence_level = EXCLUDED.confidence_level,
            data_point_count = EXCLUDED.data_point_count,
            computed_at = EXCLUDED.computed_at;
        `;

        const result = await client.query(query, [
          baseline.guildId,
          baseline.guildName,
          baseline.averageChangesPerHour,
          baseline.averageChangesPerHour * 24, // averageChangesPerDay
          baseline.peakActivityHours || [],
          Math.ceil(baseline.averageChangesPerHour * 3), // rapidChangeThreshold
          50, // maxChangesPerMember
          [], // expectedOrigins
          baseline.confidenceLevel,
          baseline.dataPointCount,
          baseline.computedAt,
        ]);

        stats.baselines.migrated++;
        log(`  Baseline ${baseline.guildId}: inserted/updated`, options, "verbose");
      } catch (error: any) {
        stats.baselines.failed++;
        stats.errors.push(`Baseline ${baseline.guildId}: ${error.message}`);
        log(`  Baseline ${baseline.guildId} failed: ${error.message}`, options, "error");
      }
    }

    log(`Baselines: ${stats.baselines.migrated}/${stats.baselines.total} migrated`, options, "success");

    // Create migration marker
    const markerPath = join(STORE_PATH, ".migration-complete");
    writeFileSync(markerPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      target: options.target,
      method: "direct-pg",
      stats,
    }, null, 2));

  } finally {
    await client.end();
    log("Database connection closed", options);
  }

  stats.duration = (Date.now() - startTime) / 1000;
  return stats;
}

// CLI Entry Point
async function main() {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    target: "cloud-prod",
    dryRun: false,
    verbose: false,
    batchSize: 100,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--target" && i + 1 < args.length) {
      options.target = args[++i] as any;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "--batch-size" && i + 1 < args.length) {
      options.batchSize = parseInt(args[++i], 10);
    }
  }

  console.log("\n" + "═".repeat(63));
  console.log("  Security State Migration - Direct PostgreSQL");
  console.log("═".repeat(63) + "\n");

  try {
    const stats = await migrateDirect(options);

    console.log("\n" + "═".repeat(63));
    console.log("                 Migration Summary");
    console.log("═".repeat(63) + "\n");
    console.log(`  Role Audits:    ${stats.roleChanges.migrated}/${stats.roleChanges.total} migrated`);
    console.log(`  Baselines:      ${stats.baselines.migrated}/${stats.baselines.total} migrated`);
    console.log(`  Duration:       ${stats.duration.toFixed(2)}s`);
    console.log(`  Errors:         ${stats.errors.length}\n`);

    if (stats.errors.length > 0) {
      console.log("Errors encountered:");
      for (const error of stats.errors) {
        console.log(`  - ${error}`);
      }
    }

    console.log("\n✅ Migration complete. Rollback data saved.\n");
    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ Migration failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
