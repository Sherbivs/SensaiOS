import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getVersion, compareVersions } from "../src/services/db-replication/version.js";
import { verifySchemaIntegrity, verifyDataIntegrity } from "../src/services/db-replication/integrity.js";
import { syncDevToProd, syncProdToLocal } from "../src/services/db-replication/sync.js";
import { getReplicationMetrics, formatMetrics, checkAlertThresholds } from "../src/services/db-replication/monitoring.js";

/**
 * Database Replication CLI
 * 
 * Commands:
 *   sync {target}         - Sync databases (dev-to-prod, prod-to-local, full-cascade)
 *   status                - Show current versions, lag, last sync for all cascades
 *   metrics               - Display full replication metrics with alerts
 *   diff {env1} {env2}    - Show schema differences between environments
 *   integrity {scope}     - Run integrity checks (dev-prod, prod-local, all)
 *   version {env}         - Show version fingerprint for environment (dev, prod, local)
 *   compare               - Compare versions across all environments
 *   block-prod            - Block downstream sync (emergency control)
 *   unblock-prod          - Unblock downstream sync
 *   reset-local           - Drop and rebuild Local from Prod (emergency)
 *   help                  - Show this help message
 * 
 * Examples:
 *   npm run db:replication sync dev-to-prod
 *   npm run db:replication status
 *   npm run db:replication metrics
 *   npm run db:replication diff dev prod
 *   npm run db:replication integrity all
 *   npm run db:replication version dev
 *   npm run db:replication compare
 *   npm run db:replication block-prod
 */

type Command =
  | "sync"
  | "status"
  | "metrics"
  | "diff"
  | "integrity"
  | "version"
  | "compare"
  | "block-prod"
  | "unblock-prod"
  | "reset-local"
  | "help";

interface ParsedArgs {
  command: Command;
  args: string[];
  options: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // Remove 'node' and script path
  const command = (args[0] || "help") as Command;
  const rest = args.slice(1);
  
  const options: Record<string, string | boolean> = {};
  const positionalArgs: string[] = [];
  
  for (const arg of rest) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      options[key] = value || true;
    } else {
      positionalArgs.push(arg);
    }
  }
  
  return { command, args: positionalArgs, options };
}

function loadEnvironment(): void {
  const overrideCandidates = [process.env.IG_ENV_FILE, process.env.DOTENV_CONFIG_PATH]
    .map((candidate) => (candidate ? candidate.trim() : ""))
    .filter(Boolean);

  let loaded = false;

  for (const candidate of overrideCandidates) {
    const candidatePath = path.isAbsolute(candidate)
      ? candidate
      : path.join(process.cwd(), candidate);

    if (!fs.existsSync(candidatePath)) {
      continue;
    }

    const result = dotenv.config({ path: candidatePath });
    if (!result.error) {
      console.log(`[INFO] Loaded environment from ${candidatePath}`);
      loaded = true;
      break;
    }
  }

  if (!loaded) {
    dotenv.config();
  }
}

async function getClients(): Promise<{ devPrisma: PrismaClient | null; prodPrisma: PrismaClient; localPrisma: PrismaClient | null }> {
  // 2-NODE CLUSTER: DEV (master), PROD (local)
  const devUrl = process.env.DEV_DATABASE_URL || 
                 process.env.RENDER_DB_EXTERNAL_URL || 
                 process.env.RENDER_DB_INTERNAL_URL;
  const prodUrl = process.env.PROD_DATABASE_URL || 
                  process.env.DATABASE_LOCAL_URL;
  const localUrl = process.env.DATABASE_LOCAL_URL;

  if (!prodUrl) {
    throw new Error("No production database URL configured (PROD_DATABASE_URL or DATABASE_LOCAL_URL required)");
  }

  const devPrisma = devUrl ? new PrismaClient({ datasources: { db: { url: devUrl } } }) : null;
  const prodPrisma = new PrismaClient({ datasources: { db: { url: prodUrl } } });
  const localPrisma = localUrl ? new PrismaClient({ datasources: { db: { url: localUrl } } }) : null;

  return { devPrisma, prodPrisma, localPrisma };
}

async function runSync(target: string, options: Record<string, string | boolean>): Promise<void> {
  const { devPrisma, prodPrisma, localPrisma } = await getClients();

  if (!devPrisma) {
    console.error("[ERROR] DEV database not configured (RENDER_DB_INTERNAL_URL or RENDER_DB_EXTERNAL_URL required)");
    process.exit(1);
  }

  const dryRun = Boolean(options["dry-run"]);
  const skipIntegrity = Boolean(options["skip-integrity"]);

  try {
    if (target === "dev-to-prod") {
      console.log(`[INFO] Starting DEV → Prod sync${dryRun ? " (DRY RUN)" : ""}...`);
      const result = await syncDevToProd(devPrisma, prodPrisma, { dryRun, skipIntegrity });
      
      if (result.success) {
        console.log("[SUCCESS] DEV → Prod sync completed");
        console.log(`  Stage: ${result.stage}`);
        if (result.metrics) {
          console.log(`  Migrations Applied: ${result.metrics.migrationsApplied}`);
          console.log(`  Version Before: ${result.metrics.versionBefore.slice(0, 16)}...`);
          console.log(`  Version After: ${result.metrics.versionAfter.slice(0, 16)}...`);
        }
      } else {
        console.error("[ERROR] DEV → Prod sync failed");
        console.error(`  Stage: ${result.stage}`);
        console.error(`  Errors: ${result.errors.join(", ")}`);
        process.exit(1);
      }
    } else if (target === "prod-to-local") {
      if (!localPrisma) {
        console.error("[ERROR] Local database not configured (DATABASE_LOCAL_URL required)");
        process.exit(1);
      }

      console.log(`[INFO] Starting Prod → Local sync${dryRun ? " (DRY RUN)" : ""}...`);
      const result = await syncProdToLocal(prodPrisma, localPrisma, { dryRun, skipIntegrity });
      
      if (result.success) {
        console.log("[SUCCESS] Prod → Local sync completed");
        console.log(`  Stage: ${result.stage}`);
      } else {
        console.error("[ERROR] Prod → Local sync failed");
        console.error(`  Stage: ${result.stage}`);
        console.error(`  Errors: ${result.errors.join(", ")}`);
        process.exit(1);
      }
    } else if (target === "full-cascade") {
      console.log(`[INFO] Starting full cascade sync (DEV → Prod → Local)${dryRun ? " (DRY RUN)" : ""}...`);
      
      // Step 1: DEV → Prod
      console.log("\n[STEP 1/2] DEV → Prod");
      const devToProdResult = await syncDevToProd(devPrisma, prodPrisma, { dryRun, skipIntegrity });
      
      if (!devToProdResult.success) {
        console.error("[ERROR] DEV → Prod sync failed, aborting cascade");
        console.error(`  Stage: ${devToProdResult.stage}`);
        console.error(`  Errors: ${devToProdResult.errors.join(", ")}`);
        process.exit(1);
      }
      
      console.log("[SUCCESS] DEV → Prod completed");
      
      // Step 2: Prod → Local
      if (!localPrisma) {
        console.log("[WARN] Local database not configured, skipping Prod → Local sync");
      } else {
        console.log("\n[STEP 2/2] Prod → Local");
        const prodToLocalResult = await syncProdToLocal(prodPrisma, localPrisma, { dryRun, skipIntegrity });
        
        if (!prodToLocalResult.success) {
          console.error("[ERROR] Prod → Local sync failed");
          console.error(`  Stage: ${prodToLocalResult.stage}`);
          console.error(`  Errors: ${prodToLocalResult.errors.join(", ")}`);
          process.exit(1);
        }
        
        console.log("[SUCCESS] Prod → Local completed");
      }
      
      console.log("\n[SUCCESS] Full cascade sync completed");
    } else {
      console.error(`[ERROR] Unknown sync target: ${target}`);
      console.error("Valid targets: dev-to-prod, prod-to-local, full-cascade");
      process.exit(1);
    }
  } finally {
    await devPrisma.$disconnect();
    await prodPrisma.$disconnect();
    if (localPrisma) await localPrisma.$disconnect();
  }
}

async function runStatus(): Promise<void> {
  const { devPrisma, prodPrisma, localPrisma } = await getClients();

  try {
    console.log("=".repeat(80));
    console.log("DATABASE REPLICATION STATUS");
    console.log("=".repeat(80));
    console.log();

    // Get versions
    const devVersion = devPrisma ? await getVersion(devPrisma, "DEV") : null;
    const prodVersion = await getVersion(prodPrisma, "PROD");
    const localVersion = localPrisma ? await getVersion(localPrisma, "LOCAL") : null;

    // DEV
    if (devVersion) {
      console.log("📦 DEV Database");
      console.log(`   Fingerprint: ${devVersion.fingerprint.slice(0, 16)}...`);
      console.log(`   Migrations:  ${devVersion.migrationCount}`);
      console.log(`   Last:        ${devVersion.lastMigrationName || "N/A"}`);
      console.log();
    } else {
      console.log("📦 DEV Database: Not configured");
      console.log();
    }

    // PROD
    console.log("🏭 PROD Database");
    console.log(`   Fingerprint: ${prodVersion.fingerprint.slice(0, 16)}...`);
    console.log(`   Migrations:  ${prodVersion.migrationCount}`);
    console.log(`   Last:        ${prodVersion.lastMigrationName || "N/A"}`);
    console.log();

    // LOCAL
    if (localVersion) {
      console.log("💻 LOCAL Database");
      console.log(`   Fingerprint: ${localVersion.fingerprint.slice(0, 16)}...`);
      console.log(`   Migrations:  ${localVersion.migrationCount}`);
      console.log(`   Last:        ${localVersion.lastMigrationName || "N/A"}`);
      console.log();
    } else {
      console.log("💻 LOCAL Database: Not configured");
      console.log();
    }

    // DEV → Prod cascade
    if (devVersion) {
      const devToProdComparison = await compareVersions(devVersion, prodVersion, devPrisma!, prodPrisma);
      console.log("🔄 DEV → Prod Cascade");
      console.log(`   Status:      ${devToProdComparison.status}`);
      console.log(`   Lag:         ${devVersion.migrationCount - prodVersion.migrationCount} migrations`);
      console.log();
    }

    // Prod → Local cascade
    if (localVersion) {
      const prodToLocalComparison = await compareVersions(prodVersion, localVersion, prodPrisma, localPrisma!);
      console.log("🔄 Prod → Local Cascade");
      console.log(`   Status:      ${prodToLocalComparison.status}`);
      console.log(`   Lag:         ${prodVersion.migrationCount - localVersion.migrationCount} migrations`);
      console.log();
    }

    console.log("=".repeat(80));
  } finally {
    if (devPrisma) await devPrisma.$disconnect();
    await prodPrisma.$disconnect();
    if (localPrisma) await localPrisma.$disconnect();
  }
}

async function runMetrics(): Promise<void> {
  const { devPrisma, prodPrisma, localPrisma } = await getClients();

  try {
    console.log("Fetching replication metrics...\n");
    
    if (!devPrisma) {
      console.error("[ERROR] DEV database not configured (RENDER_DB_INTERNAL_URL or RENDER_DB_EXTERNAL_URL required)");
      process.exit(1);
    }
    
    const metrics = await getReplicationMetrics(devPrisma, prodPrisma, localPrisma);
    const alerts = await checkAlertThresholds(metrics);
    
    // Display formatted metrics
    console.log(formatMetrics(metrics));
    
    // Display alerts
    if (alerts.length > 0) {
      console.log("\n⚠️  ALERTS (" + alerts.length + ")");
      console.log("━".repeat(80));
      
      for (const alert of alerts) {
        const icon = alert.severity === "CRITICAL" ? "🚨" : alert.severity === "ERROR" ? "❌" : "⚠️";
        const escalated = alert.escalate ? " [ESCALATED]" : "";
        console.log(`${icon} ${alert.severity}${escalated}: ${alert.title}`);
        console.log(`   ${alert.message}`);
        console.log(`   Source: ${alert.source}`);
        console.log(`   Time: ${alert.timestamp.toISOString()}`);
        console.log();
      }
    } else {
      console.log("\n✅ No alerts - all systems healthy");
    }
  } finally {
    if (devPrisma) await devPrisma.$disconnect();
    await prodPrisma.$disconnect();
    if (localPrisma) await localPrisma.$disconnect();
  }
}

async function runDiff(env1: string, env2: string): Promise<void> {
  const { devPrisma, prodPrisma, localPrisma } = await getClients();

  try {
    let client1: PrismaClient | null = null;
    let client2: PrismaClient | null = null;

    if (env1 === "dev") client1 = devPrisma;
    else if (env1 === "prod") client1 = prodPrisma;
    else if (env1 === "local") client1 = localPrisma;

    if (env2 === "dev") client2 = devPrisma;
    else if (env2 === "prod") client2 = prodPrisma;
    else if (env2 === "local") client2 = localPrisma;

    if (!client1 || !client2) {
      console.error("[ERROR] Invalid or unconfigured environments");
      console.error(`  env1: ${env1} (${client1 ? "OK" : "NOT CONFIGURED"})`);
      console.error(`  env2: ${env2} (${client2 ? "OK" : "NOT CONFIGURED"})`);
      process.exit(1);
    }

    console.log(`Comparing ${env1.toUpperCase()} vs ${env2.toUpperCase()} schema...\n`);

    const result = await verifySchemaIntegrity(client1, client2);

    if (result.passed) {
      console.log("✅ Schemas are identical - no differences found");
    } else {
      console.log(`❌ Schema differences detected (${result.diffs.length} issues)\n`);
      
      for (const diff of result.diffs) {
        console.log(`${diff.type.toUpperCase()}: ${diff.action}`);
        console.log(`  Path: ${diff.path}`);
        console.log(`  Details: ${JSON.stringify(diff.details, null, 2)}`);
        console.log();
      }
    }
  } finally {
    if (devPrisma) await devPrisma.$disconnect();
    await prodPrisma.$disconnect();
    if (localPrisma) await localPrisma.$disconnect();
  }
}

async function runIntegrity(scope: string): Promise<void> {
  const { devPrisma, prodPrisma, localPrisma } = await getClients();

  try {
    if (scope === "dev-prod" || scope === "all") {
      if (!devPrisma) {
        console.error("[ERROR] DEV database not configured (RENDER_DB_INTERNAL_URL or RENDER_DB_EXTERNAL_URL required)");
        process.exit(1);
      }

      console.log("🔍 Checking DEV ↔ Prod integrity...\n");
      
      const schemaResult = await verifySchemaIntegrity(devPrisma, prodPrisma);
      console.log(`Schema: ${schemaResult.passed ? "✅ PASS" : "❌ FAIL"}`);
      
      if (!schemaResult.passed) {
        console.log(`  Differences: ${schemaResult.diffs.length}`);
        for (const diff of schemaResult.diffs.slice(0, 5)) {
          console.log(`    - ${diff.type}: ${diff.action}`);
        }
        if (schemaResult.diffs.length > 5) {
          console.log(`    ... and ${schemaResult.diffs.length - 5} more`);
        }
      }

      const dataResult = await verifyDataIntegrity(devPrisma, prodPrisma);
      console.log(`Data: ${dataResult.passed ? "✅ PASS" : "❌ FAIL"}`);
      
      if (!dataResult.passed) {
        const failedChecks = dataResult.checks.filter(c => !c.passed);
        console.log(`  Failed checks: ${failedChecks.length}`);
        for (const check of failedChecks.slice(0, 5)) {
          console.log(`    - ${check.table}: ${check.difference}`);
        }
      }
      
      console.log();
    }

    if (scope === "prod-local" || scope === "all") {
      if (!localPrisma) {
        console.log("[WARN] Local database not configured, skipping Prod ↔ Local integrity check");
      } else {
        console.log("🔍 Checking Prod ↔ Local integrity...\n");
        
        const schemaResult = await verifySchemaIntegrity(prodPrisma, localPrisma);
        console.log(`Schema: ${schemaResult.passed ? "✅ PASS" : "❌ FAIL"}`);
        
        if (!schemaResult.passed) {
          console.log(`  Differences: ${schemaResult.diffs.length}`);
          for (const diff of schemaResult.diffs.slice(0, 5)) {
            console.log(`    - ${diff.type}: ${diff.action}`);
          }
          if (schemaResult.diffs.length > 5) {
            console.log(`    ... and ${schemaResult.diffs.length - 5} more`);
          }
        }

        const dataResult = await verifyDataIntegrity(prodPrisma, localPrisma);
        console.log(`Data: ${dataResult.passed ? "✅ PASS" : "❌ FAIL"}`);
        
        if (!dataResult.passed) {
          const failedChecks = dataResult.checks.filter(c => !c.passed);
          console.log(`  Failed checks: ${failedChecks.length}`);
          for (const check of failedChecks.slice(0, 5)) {
            console.log(`    - ${check.table}: ${check.difference}`);
          }
        }
        
        console.log();
      }
    }

    if (scope !== "dev-prod" && scope !== "prod-local" && scope !== "all") {
      console.error(`[ERROR] Unknown integrity scope: ${scope}`);
      console.error("Valid scopes: dev-prod, prod-local, all");
      process.exit(1);
    }
  } finally {
    if (devPrisma) await devPrisma.$disconnect();
    await prodPrisma.$disconnect();
    if (localPrisma) await localPrisma.$disconnect();
  }
}

async function runVersion(env: string): Promise<void> {
  const { devPrisma, prodPrisma, localPrisma } = await getClients();

  try {
    let client: PrismaClient | null = null;
    
    if (env === "dev") client = devPrisma;
    else if (env === "prod") client = prodPrisma;
    else if (env === "local") client = localPrisma;

    if (!client) {
      console.error(`[ERROR] ${env.toUpperCase()} database not configured`);
      process.exit(1);
    }

    const version = await getVersion(client, env.toUpperCase());
    
    console.log(`\n${env.toUpperCase()} Database Version`);
    console.log("━".repeat(80));
    console.log(`Fingerprint: ${version.fingerprint}`);
    console.log(`Migrations:  ${version.migrationCount}`);
    console.log(`Last:        ${version.lastMigrationName || "N/A"}`);
    console.log(`Applied:     ${version.lastMigrationAppliedAt?.toISOString() || "N/A"}`);
    console.log();
  } finally {
    if (devPrisma) await devPrisma.$disconnect();
    await prodPrisma.$disconnect();
    if (localPrisma) await localPrisma.$disconnect();
  }
}

async function runCompare(): Promise<void> {
  const { devPrisma, prodPrisma, localPrisma } = await getClients();

  try {
    console.log("\n" + "=".repeat(80));
    console.log("VERSION COMPARISON");
    console.log("=".repeat(80));
    console.log();

    // Get all versions
    const devVersion = devPrisma ? await getVersion(devPrisma, "DEV") : null;
    const prodVersion = await getVersion(prodPrisma, "PROD");
    const localVersion = localPrisma ? await getVersion(localPrisma, "LOCAL") : null;

    // Display versions
    console.log("📋 Version Fingerprints:");
    console.log();
    if (devVersion) {
      console.log(`  DEV:   ${devVersion.fingerprint} (${devVersion.migrationCount} migrations)`);
    } else {
      console.log(`  DEV:   Not configured`);
    }
    console.log(`  PROD:  ${prodVersion.fingerprint} (${prodVersion.migrationCount} migrations)`);
    if (localVersion) {
      console.log(`  LOCAL: ${localVersion.fingerprint} (${localVersion.migrationCount} migrations)`);
    } else {
      console.log(`  LOCAL: Not configured`);
    }
    console.log();

    // Compare DEV vs Prod
    if (devVersion) {
      const devToProdComparison = await compareVersions(devVersion, prodVersion, devPrisma!, prodPrisma);
      console.log("🔄 DEV → Prod:");
      console.log(`   Status:   ${devToProdComparison.status}`);
      console.log(`   Lag:      ${devVersion.migrationCount - prodVersion.migrationCount} migrations`);
      console.log(`   Synced:   ${devToProdComparison.status === "MATCH" ? "✅ Yes" : "❌ No"}`);
      console.log();
    }

    // Compare Prod vs Local
    if (localVersion) {
      const prodToLocalComparison = await compareVersions(prodVersion, localVersion, prodPrisma, localPrisma!);
      console.log("🔄 Prod → Local:");
      console.log(`   Status:   ${prodToLocalComparison.status}`);
      console.log(`   Lag:      ${prodVersion.migrationCount - localVersion.migrationCount} migrations`);
      console.log(`   Synced:   ${prodToLocalComparison.status === "MATCH" ? "✅ Yes" : "❌ No"}`);
      console.log();
    }

    console.log("=".repeat(80));
  } finally {
    if (devPrisma) await devPrisma.$disconnect();
    await prodPrisma.$disconnect();
    if (localPrisma) await localPrisma.$disconnect();
  }
}

async function runBlockProd(): Promise<void> {
  console.log("[WARN] block-prod: This command will be implemented after db_sync_state schema migration");
  console.log("[TODO] Update db_sync_state.status = 'BLOCKED' for DEV→PROD cascade");
  console.log("[TODO] Alert operators via sendAlert() with CRITICAL severity");
}

async function runUnblockProd(): Promise<void> {
  console.log("[WARN] unblock-prod: This command will be implemented after db_sync_state schema migration");
  console.log("[TODO] Update db_sync_state.status = 'READY' for DEV→PROD cascade");
  console.log("[TODO] Log unblock event");
}

async function runResetLocal(): Promise<void> {
  console.log("[WARN] reset-local: This command will be implemented after pg_dump/restore integration");
  console.log("[TODO] 1. Confirm with user (--confirm flag required)");
  console.log("[TODO] 2. Backup current Local database");
  console.log("[TODO] 3. Drop Local database");
  console.log("[TODO] 4. pg_dump from Prod");
  console.log("[TODO] 5. pg_restore to Local");
  console.log("[TODO] 6. Verify version fingerprints match");
}

function showHelp(): void {
  console.log(`
Database Replication CLI

USAGE:
  npm run db:replication <command> [options]

COMMANDS:
  sync <target>              Sync databases
    Targets: dev-to-prod, prod-to-local, full-cascade
    Options: --dry-run, --skip-integrity

  status                     Show current versions, lag, last sync

  metrics                    Display full replication metrics with alerts

  diff <env1> <env2>         Show schema differences between environments
    Environments: dev, prod, local

  integrity <scope>          Run integrity checks
    Scopes: dev-prod, prod-local, all

  version <env>              Show version fingerprint for environment
    Environments: dev, prod, local

  compare                    Compare versions across all environments

  block-prod                 Block downstream sync (emergency)

  unblock-prod               Unblock downstream sync

  reset-local                Drop and rebuild Local from Prod (emergency)

  help                       Show this help message

EXAMPLES:
  npm run db:replication sync dev-to-prod
  npm run db:replication sync full-cascade --dry-run
  npm run db:replication status
  npm run db:replication metrics
  npm run db:replication diff dev prod
  npm run db:replication integrity all
  npm run db:replication version dev
  npm run db:replication compare

ENVIRONMENT VARIABLES:
  DATABASE_URL               PROD database (Prisma Accelerate)
  RENDER_DB_INTERNAL_URL     DEV database (direct PostgreSQL, Render Node)
  RENDER_DB_EXTERNAL_URL     DEV database (direct PostgreSQL, laptop)
  DATABASE_LOCAL_URL         LOCAL database (Render Node disk mirror)
  IG_ENV_FILE                External env file path

DOCUMENTATION:
  See docs/db-replication-runbook.md for operational workflows
`);
}

async function main(): Promise<void> {
  loadEnvironment();

  const parsed = parseArgs(process.argv);

  try {
    switch (parsed.command) {
      case "sync":
        if (parsed.args.length === 0) {
          console.error("[ERROR] sync requires a target (dev-to-prod, prod-to-local, full-cascade)");
          process.exit(1);
        }
        await runSync(parsed.args[0], parsed.options);
        break;

      case "status":
        await runStatus();
        break;

      case "metrics":
        await runMetrics();
        break;

      case "diff":
        if (parsed.args.length < 2) {
          console.error("[ERROR] diff requires two environments (e.g., diff dev prod)");
          process.exit(1);
        }
        await runDiff(parsed.args[0], parsed.args[1]);
        break;

      case "integrity":
        if (parsed.args.length === 0) {
          console.error("[ERROR] integrity requires a scope (dev-prod, prod-local, all)");
          process.exit(1);
        }
        await runIntegrity(parsed.args[0]);
        break;

      case "version":
        if (parsed.args.length === 0) {
          console.error("[ERROR] version requires an environment (dev, prod, local)");
          process.exit(1);
        }
        await runVersion(parsed.args[0]);
        break;

      case "compare":
        await runCompare();
        break;

      case "block-prod":
        await runBlockProd();
        break;

      case "unblock-prod":
        await runUnblockProd();
        break;

      case "reset-local":
        await runResetLocal();
        break;

      case "help":
      default:
        showHelp();
        break;
    }
  } catch (error) {
    console.error("[ERROR] Command failed:");
    console.error(error);
    process.exit(1);
  }
}

main();
