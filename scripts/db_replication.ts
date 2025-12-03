// @ts-nocheck - This script depends on unimplemented db-replication services (Phase 16+)
// TODO: Remove this directive when src/services/db-replication/* modules are implemented
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { getVersion, compareVersions } from "../src/services/db-replication/version.js";
import { verifySchemaIntegrity, verifyDataIntegrity } from "../src/services/db-replication/integrity.js";
import { syncDevToProd, syncProdToLocal } from "../src/services/db-replication/sync.js";
import { getReplicationMetrics, formatMetrics, checkAlertThresholds } from "../src/services/db-replication/monitoring.js";
import {
  formatBorder,
  formatSectionHeader,
  formatKeyValue,
  formatKeyValueList,
  formatStatus,
  formatOutputBlock,
} from "../src/utils/output-formatter.js";

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
  // UNIFIED ARCHITECTURE: Render managed database (PROD_DATABASE_URL for all operations)
  const prodUrl = process.env.PROD_DATABASE_URL || 
                  process.env.RENDER_DB_EXTERNAL_URL || 
                  process.env.RENDER_DB_INTERNAL_URL;
  const localUrl = process.env.DATABASE_ONPREMISE_DEV_PRIMARY;

  if (!prodUrl) {
    throw new Error("No production database URL configured (PROD_DATABASE_URL required)");
  }

  // Note: devPrisma maintained for backward compatibility but will be null in unified architecture
  const devPrisma = null;
  // Prisma 7: Create clients with driver adapters
  const prodAdapter = new PrismaPg({ connectionString: prodUrl });
  const prodPrisma = new PrismaClient({ adapter: prodAdapter });
  const localPrisma = localUrl 
    ? new PrismaClient({ adapter: new PrismaPg({ connectionString: localUrl }) }) 
    : null;

  return { devPrisma, prodPrisma, localPrisma };
}

async function runSync(target: string, options: Record<string, string | boolean>): Promise<void> {
  const { devPrisma, prodPrisma, localPrisma } = await getClients();

  if (!prodPrisma) {
    console.error(formatStatus("Production database not configured (PROD_DATABASE_URL required)", "error"));
    process.exit(1);
  }

  // UNIFIED ARCHITECTURE: devPrisma is null, sync operations not applicable
  if (!devPrisma) {
    console.log(formatStatus("Unified architecture detected - DEV/PROD sync not applicable (single database)", "info"));
    process.exit(0);
  }

  const dryRun = Boolean(options["dry-run"]);
  const skipIntegrity = Boolean(options["skip-integrity"]);

  try {
    if (target === "dev-to-prod") {
      console.log(formatStatus(`Starting DEV → Prod sync${dryRun ? " (DRY RUN)" : ""}`, "info"));
      const result = await syncDevToProd(devPrisma, prodPrisma, { dryRun, skipIntegrity });
      
      if (result.success) {
        console.log(formatStatus("DEV → Prod sync completed", "success"));
        console.log(...formatKeyValueList([
          ["Stage", result.stage],
          ["Migrations Applied", result.metrics?.migrationsApplied ?? 0],
          ["Version Before", result.metrics ? `${result.metrics.versionBefore.slice(0, 16)}...` : "N/A"],
          ["Version After", result.metrics ? `${result.metrics.versionAfter.slice(0, 16)}...` : "N/A"],
        ]));
      } else {
        console.error(formatStatus("DEV → Prod sync failed", "error"));
        console.error(...formatKeyValueList([
          ["Stage", result.stage],
          ["Errors", result.errors.join(", ")],
        ]));
        process.exit(1);
      }
    } else if (target === "prod-to-local") {
      if (!localPrisma) {
        console.error(formatStatus("Local database not configured (DATABASE_LOCAL_URL required)", "error"));
        process.exit(1);
      }

      console.log(formatStatus(`Starting Prod → Local sync${dryRun ? " (DRY RUN)" : ""}`, "info"));
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
    // Get versions
    const devVersion = devPrisma ? await getVersion(devPrisma, "DEV") : null;
    const prodVersion = await getVersion(prodPrisma, "PROD");
    const localVersion = localPrisma ? await getVersion(localPrisma, "LOCAL") : null;

    // Build output sections
    const sections: Array<{
      header: string;
      content: string[];
    }> = [];

    // DEV section
    if (devVersion) {
      sections.push({
        header: "📦 DEV Database",
        content: formatKeyValueList([
          ["Fingerprint", `${devVersion.fingerprint.slice(0, 16)}...`],
          ["Migrations", devVersion.migrationCount],
          ["Last", devVersion.lastMigrationName || "N/A"],
        ]),
      });
    } else {
      sections.push({
        header: "📦 DEV Database",
        content: ["  Not configured"],
      });
    }

    // PROD section
    sections.push({
      header: "🏭 PROD Database",
      content: formatKeyValueList([
        ["Fingerprint", `${prodVersion.fingerprint.slice(0, 16)}...`],
        ["Migrations", prodVersion.migrationCount],
        ["Last", prodVersion.lastMigrationName || "N/A"],
      ]),
    });

    // LOCAL section
    if (localVersion) {
      sections.push({
        header: "💻 LOCAL Database",
        content: formatKeyValueList([
          ["Fingerprint", `${localVersion.fingerprint.slice(0, 16)}...`],
          ["Migrations", localVersion.migrationCount],
          ["Last", localVersion.lastMigrationName || "N/A"],
        ]),
      });
    } else {
      sections.push({
        header: "💻 LOCAL Database",
        content: ["  Not configured"],
      });
    }

    // DEV → Prod cascade
    if (devVersion) {
      const devToProdComparison = await compareVersions(devVersion, prodVersion, devPrisma!, prodPrisma);
      const lagCount = devVersion.migrationCount - prodVersion.migrationCount;
      sections.push({
        header: "🔄 DEV → Prod Cascade",
        content: formatKeyValueList([
          ["Status", devToProdComparison.status],
          ["Lag", `${lagCount} migration${lagCount === 1 ? "" : "s"}`],
        ]),
      });
    }

    // Prod → Local cascade
    if (localVersion) {
      const prodToLocalComparison = await compareVersions(prodVersion, localVersion, prodPrisma, localPrisma!);
      const lagCount = prodVersion.migrationCount - localVersion.migrationCount;
      sections.push({
        header: "🔄 Prod → Local Cascade",
        content: formatKeyValueList([
          ["Status", prodToLocalComparison.status],
          ["Lag", `${lagCount} migration${lagCount === 1 ? "" : "s"}`],
        ]),
      });
    }

    // Print formatted output
    console.log("\n" + formatBorder(75));
    console.log("DATABASE REPLICATION STATUS");
    console.log(formatBorder(75) + "\n");

    sections.forEach((section, idx) => {
      console.log(formatSectionHeader(section.header));
      section.content.forEach(line => console.log(line));
      if (idx < sections.length - 1) {
        console.log();
      }
    });

    console.log("\n" + formatBorder(75) + "\n");
  } finally {
    if (devPrisma) await devPrisma.$disconnect();
    await prodPrisma.$disconnect();
    if (localPrisma) await localPrisma.$disconnect();
  }
}

async function runMetrics(): Promise<void> {
  const { devPrisma, prodPrisma, localPrisma } = await getClients();

  try {
    console.log(formatStatus("Fetching replication metrics...", "info"));
    console.log();
    
    if (!devPrisma) {
      console.error(formatStatus("DEV database not configured (RENDER_DB_INTERNAL_URL or RENDER_DB_EXTERNAL_URL required)", "error"));
      process.exit(1);
    }
    
    const metrics = await getReplicationMetrics(devPrisma, prodPrisma, localPrisma);
    const alerts = await checkAlertThresholds(metrics);
    
    // Display formatted metrics
    console.log(formatMetrics(metrics));
    
    // Display alerts
    if (alerts.length > 0) {
      console.log();
      console.log(formatSectionHeader(`⚠️  ALERTS (${alerts.length})`));
      console.log(formatBorder(80, 'heavy'));
      console.log();
      
      for (const alert of alerts) {
        const icon = alert.severity === "CRITICAL" ? "🚨" : alert.severity === "ERROR" ? "❌" : "⚠️";
        const escalated = alert.escalate ? " [ESCALATED]" : "";
        console.log(formatStatus(`${alert.severity}${escalated}: ${alert.title}`, 
          alert.severity === "CRITICAL" ? "error" : alert.severity === "ERROR" ? "error" : "warning"));
        console.log(...formatKeyValueList([
          ["Message", alert.message],
          ["Source", alert.source],
          ["Time", alert.timestamp.toISOString()],
        ]));
        console.log();
      }
    } else {
      console.log();
      console.log(formatStatus("No alerts - all systems healthy", "success"));
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
      console.error(formatStatus("Invalid or unconfigured environments", "error"));
      console.error(...formatKeyValueList([
        [`${env1}`, client1 ? "OK" : "NOT CONFIGURED"],
        [`${env2}`, client2 ? "OK" : "NOT CONFIGURED"],
      ]));
      process.exit(1);
    }

    console.log(formatStatus(`Comparing ${env1.toUpperCase()} vs ${env2.toUpperCase()} schema`, "info"));
    console.log();

    const result = await verifySchemaIntegrity(client1, client2);

    if (result.passed) {
      console.log(formatStatus("Schemas are identical - no differences found", "success"));
    } else {
      console.log(formatStatus(`Schema differences detected (${result.diffs.length} issues)`, "error"));
      console.log();
      
      for (const diff of result.diffs) {
        console.log(formatSectionHeader(`${diff.type.toUpperCase()}: ${diff.action}`));
        console.log(...formatKeyValueList([
          ["Path", diff.path],
          ["Details", JSON.stringify(diff.details, null, 2)],
        ]));
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
        console.error(formatStatus("DEV database not configured (RENDER_DB_INTERNAL_URL or RENDER_DB_EXTERNAL_URL required)", "error"));
        process.exit(1);
      }

      console.log(formatSectionHeader("🔍 Checking DEV ↔ Prod integrity"));
      console.log();
      
      const schemaResult = await verifySchemaIntegrity(devPrisma, prodPrisma);
      console.log(formatStatus(`Schema: ${schemaResult.passed ? "PASS" : "FAIL"}`, schemaResult.passed ? "success" : "error"));
      
      if (!schemaResult.passed) {
        const diffList = schemaResult.diffs.slice(0, 5).map(diff => `${diff.type}: ${diff.action}`);
        if (schemaResult.diffs.length > 5) {
          diffList.push(`... and ${schemaResult.diffs.length - 5} more`);
        }
        console.log(...formatList(diffList, { indent: 1 }));
      }

      const dataResult = await verifyDataIntegrity(devPrisma, prodPrisma);
      console.log(formatStatus(`Data: ${dataResult.passed ? "PASS" : "FAIL"}`, dataResult.passed ? "success" : "error"));
      
      if (!dataResult.passed) {
        const failedChecks = dataResult.checks.filter(c => !c.passed);
        const checkList = failedChecks.slice(0, 5).map(check => `${check.table}: ${check.difference}`);
        if (failedChecks.length > 5) {
          checkList.push(`... and ${failedChecks.length - 5} more`);
        }
        console.log(...formatList(checkList, { indent: 1 }));
      }
      
      console.log();
    }

    if (scope === "prod-local" || scope === "all") {
      if (!localPrisma) {
        console.log(formatStatus("Local database not configured, skipping Prod ↔ Local integrity check", "warning"));
      } else {
        console.log(formatSectionHeader("🔍 Checking Prod ↔ Local integrity"));
        console.log();
        
        const schemaResult = await verifySchemaIntegrity(prodPrisma, localPrisma);
        console.log(formatStatus(`Schema: ${schemaResult.passed ? "PASS" : "FAIL"}`, schemaResult.passed ? "success" : "error"));
        
        if (!schemaResult.passed) {
          const diffList = schemaResult.diffs.slice(0, 5).map(diff => `${diff.type}: ${diff.action}`);
          if (schemaResult.diffs.length > 5) {
            diffList.push(`... and ${schemaResult.diffs.length - 5} more`);
          }
          console.log(...formatList(diffList, { indent: 1 }));
        }

        const dataResult = await verifyDataIntegrity(prodPrisma, localPrisma);
        console.log(formatStatus(`Data: ${dataResult.passed ? "PASS" : "FAIL"}`, dataResult.passed ? "success" : "error"));
        
        if (!dataResult.passed) {
          const failedChecks = dataResult.checks.filter(c => !c.passed);
          const checkList = failedChecks.slice(0, 5).map(check => `${check.table}: ${check.difference}`);
          if (failedChecks.length > 5) {
            checkList.push(`... and ${failedChecks.length - 5} more`);
          }
          console.log(...formatList(checkList, { indent: 1 }));
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
      console.error(formatStatus(`${env.toUpperCase()} database not configured`, "error"));
      process.exit(1);
    }

    const version = await getVersion(client, env.toUpperCase());
    
    console.log();
    console.log(formatBorder(80, 'heavy'));
    console.log(`${env.toUpperCase()} Database Version`);
    console.log(formatBorder(80, 'heavy'));
    console.log(...formatKeyValueList([
      ["Fingerprint", version.fingerprint],
      ["Migrations", version.migrationCount],
      ["Last", version.lastMigrationName || "N/A"],
      ["Applied", version.lastMigrationAppliedAt?.toISOString() || "N/A"],
    ]));
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
    console.log();
    console.log(formatBorder(80));
    console.log("VERSION COMPARISON");
    console.log(formatBorder(80));
    console.log();

    // Get all versions
    const devVersion = devPrisma ? await getVersion(devPrisma, "DEV") : null;
    const prodVersion = await getVersion(prodPrisma, "PROD");
    const localVersion = localPrisma ? await getVersion(localPrisma, "LOCAL") : null;

    // Display versions
    console.log(formatSectionHeader("📋 Version Fingerprints"));
    console.log();
    
    const versionInfo: Array<[string, string]> = [];
    if (devVersion) {
      versionInfo.push(["DEV", `${devVersion.fingerprint} (${devVersion.migrationCount} migrations)`]);
    } else {
      versionInfo.push(["DEV", "Not configured"]);
    }
    versionInfo.push(["PROD", `${prodVersion.fingerprint} (${prodVersion.migrationCount} migrations)`]);
    if (localVersion) {
      versionInfo.push(["LOCAL", `${localVersion.fingerprint} (${localVersion.migrationCount} migrations)`]);
    } else {
      versionInfo.push(["LOCAL", "Not configured"]);
    }
    
    console.log(...formatKeyValueList(versionInfo, { indent: 1 }));
    console.log();

    // Compare DEV vs Prod
    if (devVersion) {
      const devToProdComparison = await compareVersions(devVersion, prodVersion, devPrisma!, prodPrisma);
      const lagCount = devVersion.migrationCount - prodVersion.migrationCount;
      const synced = devToProdComparison.status === "MATCH";
      
      console.log(formatSectionHeader("🔄 DEV → Prod"));
      console.log(...formatKeyValueList([
        ["Status", devToProdComparison.status],
        ["Lag", `${lagCount} migration${lagCount === 1 ? "" : "s"}`],
        ["Synced", synced ? "✅ Yes" : "❌ No"],
      ], { indent: 1 }));
      console.log();
    }

    // Compare Prod vs Local
    if (localVersion) {
      const prodToLocalComparison = await compareVersions(prodVersion, localVersion, prodPrisma, localPrisma!);
      const lagCount = prodVersion.migrationCount - localVersion.migrationCount;
      const synced = prodToLocalComparison.status === "MATCH";
      
      console.log(formatSectionHeader("🔄 Prod → Local"));
      console.log(...formatKeyValueList([
        ["Status", prodToLocalComparison.status],
        ["Lag", `${lagCount} migration${lagCount === 1 ? "" : "s"}`],
        ["Synced", synced ? "✅ Yes" : "❌ No"],
      ], { indent: 1 }));
      console.log();
    }

    console.log(formatBorder(80));
    console.log();
  } finally {
    if (devPrisma) await devPrisma.$disconnect();
    await prodPrisma.$disconnect();
    if (localPrisma) await localPrisma.$disconnect();
  }
}

async function runBlockProd(): Promise<void> {
  console.log(formatStatus("block-prod: This command will be implemented after db_sync_state schema migration", "warning"));
  console.log(...formatList([
    "Update db_sync_state.status = 'BLOCKED' for DEV→PROD cascade",
    "Alert operators via sendAlert() with CRITICAL severity",
  ], { indent: 1, bullet: "TODO:" }));
}

async function runUnblockProd(): Promise<void> {
  console.log(formatStatus("unblock-prod: This command will be implemented after db_sync_state schema migration", "warning"));
  console.log(...formatList([
    "Update db_sync_state.status = 'READY' for DEV→PROD cascade",
    "Log unblock event",
  ], { indent: 1, bullet: "TODO:" }));
}

async function runResetLocal(): Promise<void> {
  console.log(formatStatus("reset-local: This command will be implemented after pg_dump/restore integration", "warning"));
  console.log(...formatList([
    "Confirm with user (--confirm flag required)",
    "Backup current Local database",
    "Drop Local database",
    "pg_dump from Prod",
    "pg_restore to Local",
    "Verify version fingerprints match",
  ], { indent: 1, numbered: true }));
}

function showHelp(): void {
  const output = formatOutputBlock({
    sections: [
      {
        header: "Database Replication CLI",
        content: [
          "",
          "USAGE:",
          "  npm run db:replication <command> [options]",
          "",
        ],
      },
      {
        header: "COMMANDS",
        content: [
          ...formatKeyValueList([
            ["sync <target>", "Sync databases"],
            ["", "  Targets: dev-to-prod, prod-to-local, full-cascade"],
            ["", "  Options: --dry-run, --skip-integrity"],
            ["", ""],
            ["status", "Show current versions, lag, last sync"],
            ["", ""],
            ["metrics", "Display full replication metrics with alerts"],
            ["", ""],
            ["diff <env1> <env2>", "Show schema differences between environments"],
            ["", "  Environments: dev, prod, local"],
            ["", ""],
            ["integrity <scope>", "Run integrity checks"],
            ["", "  Scopes: dev-prod, prod-local, all"],
            ["", ""],
            ["version <env>", "Show version fingerprint for environment"],
            ["", "  Environments: dev, prod, local"],
            ["", ""],
            ["compare", "Compare versions across all environments"],
            ["", ""],
            ["block-prod", "Block downstream sync (emergency)"],
            ["", ""],
            ["unblock-prod", "Unblock downstream sync"],
            ["", ""],
            ["reset-local", "Drop and rebuild Local from Prod (emergency)"],
            ["", ""],
            ["help", "Show this help message"],
          ], { indent: 1, separator: "  " }),
        ],
      },
      {
        header: "EXAMPLES",
        content: formatList([
          "npm run db:replication sync dev-to-prod",
          "npm run db:replication sync full-cascade --dry-run",
          "npm run db:replication status",
          "npm run db:replication metrics",
          "npm run db:replication diff dev prod",
          "npm run db:replication integrity all",
          "npm run db:replication version dev",
          "npm run db:replication compare",
        ], { indent: 1 }),
      },
      {
        header: "ENVIRONMENT VARIABLES",
        content: formatKeyValueList([
          ["DATABASE_URL", "PROD database (direct PostgreSQL, local node)"],
          ["RENDER_DB_INTERNAL_URL", "DEV database (direct PostgreSQL, Render Node)"],
          ["RENDER_DB_EXTERNAL_URL", "DEV database (direct PostgreSQL, laptop)"],
          ["DATABASE_LOCAL_URL", "LOCAL database (Render Node disk mirror)"],
          ["IG_ENV_FILE", "External env file path"],
        ], { indent: 1 }),
      },
      {
        header: "DOCUMENTATION",
        content: [
          "  See docs/db-replication-runbook.md for operational workflows",
        ],
      },
    ],
    borders: false,
  });
  
  console.log(output);
}

async function main(): Promise<void> {
  loadEnvironment();

  const parsed = parseArgs(process.argv);

  try {
    switch (parsed.command) {
      case "sync":
        if (parsed.args.length === 0) {
          console.log(formatStatus("sync requires a target (dev-to-prod, prod-to-local, full-cascade)", "error"));
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
          console.log(formatStatus("diff requires two environments (e.g., diff dev prod)", "error"));
          process.exit(1);
        }
        await runDiff(parsed.args[0], parsed.args[1]);
        break;

      case "integrity":
        if (parsed.args.length === 0) {
          console.log(formatStatus("integrity requires a scope (dev-prod, prod-local, all)", "error"));
          process.exit(1);
        }
        await runIntegrity(parsed.args[0]);
        break;

      case "version":
        if (parsed.args.length === 0) {
          console.log(formatStatus("version requires an environment (dev, prod, local)", "error"));
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
    console.log(formatStatus("Command failed:", "error"));
    console.error(error);
    process.exit(1);
  }
}

main();
