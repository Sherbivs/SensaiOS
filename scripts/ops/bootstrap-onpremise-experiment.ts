import { scopedLogger } from '../../src/observability/envelope/console.js';
import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFile, spawn } from "node:child_process";
import * as dotenv from "dotenv";
import {
  formatSectionHeader,
  formatKeyValueList,
  formatStatus,
  formatList,
  formatBorder,
  printSection,
  printKeyValue,
  printSuccess,
  printError,
  printWarning,
  printInfo,
} from "../../src/utils/output-formatter.js";

/** Scoped logger for ONPREMISE-DEV-EXPERIMENT bootstrap operations */
const log = scopedLogger('ops.bootstrap-experiment');

/**
 * Bootstrap ONPREMISE-DEV-EXPERIMENT Database Script
 * 
 * Creates an independent ONPREMISE-DEV-EXPERIMENT PostgreSQL database on port 55434 for:
 * - Testing migrations before applying to ONPREMISE-DEV-PRIMARY/CLOUD-DEV-MASTER/CLOUD-PROD-RUNTIME
 * - Experimenting with schema changes
 * - Destructive testing (DROP TABLE, etc.)
 * 
 * The ONPREMISE-DEV-EXPERIMENT database does NOT participate in auto-sync/replication.
 * It must be manually synced using sync_onpremise_experiment.ts.
 * 
 * Usage:
 *   npm run ops:bootstrap-onpremise-experiment
 *   npm run ops:bootstrap-onpremise-experiment -- --source onpremise-dev
 *   npm run ops:bootstrap-onpremise-experiment -- --source cloud-dev
 *   npm run ops:bootstrap-onpremise-experiment -- --port 55435
 */

interface ParsedOptions {
  port?: number;
  source?: string;
  storeRoot?: string;
  skipStart?: boolean;
}

interface Options {
  port: number;
  source: string;
  storeRoot: string;
  skipStart: boolean;
}

interface Paths {
  storeRoot: string;
  dbRoot: string;
  clusterDir: string;
  snapshotsDir: string;
  logFile: string;
  connectionFile: string;
  metadataFile: string;
}

interface PgBinaries {
  pgCtl: string;
  pgIsReady: string;
  initdb: string;
  pgDump: string;
  pgRestore: string;
  createdb: string;
  dropdb: string;
  psql: string;
}

function parseArgs(argv: string[]): ParsedOptions {
  const options: ParsedOptions = {};

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const [rawKey, rawValue] = arg.slice(2).split("=", 2);
    const key = rawKey.trim().toLowerCase();
    const value = rawValue?.trim();

    switch (key) {
      case "port":
        if (value) {
          const parsed = Number(value);
          if (Number.isFinite(parsed) && parsed > 0 && parsed < 65_535) {
            options.port = parsed;
          }
        }
        break;
      case "source":
        if (value) {
          options.source = value.toLowerCase();
        }
        break;
      case "store":
      case "store-root":
      case "storeroot":
        if (value) {
          options.storeRoot = path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
        }
        break;
      case "skip-start":
      case "skipstart":
        options.skipStart = true;
        break;
      default:
        break;
    }
  }

  return options;
}

function applyDefaults(parsed: ParsedOptions): Options {
  const storeHint = process.env.IG_STORE_ROOT?.trim();
  const storeRoot = parsed.storeRoot ?? (storeHint ? path.resolve(storeHint) : path.join(process.cwd(), "Store"));

  return {
    port: parsed.port ?? 55_434, // Experimental DB uses 55434 by default
    source: parsed.source ?? "local", // Default: clone from primary local DB
    storeRoot,
    skipStart: Boolean(parsed.skipStart),
  };
}

function loadEnvironment(): void {
  const overrideCandidates = [process.env.IG_ENV_FILE, process.env.DOTENV_CONFIG_PATH]
    .map((candidate) => (candidate ? candidate.trim() : ""))
    .filter(Boolean);

  let loaded = false;

  for (const candidate of overrideCandidates) {
    const candidatePath = path.isAbsolute(candidate) ? candidate : path.join(process.cwd(), candidate);
    if (!fs.existsSync(candidatePath)) {
      continue;
    }
    const result = dotenv.config({ path: candidatePath });
    if (!result.error) {
      loaded = true;
      break;
    }
  }

  if (!loaded) {
    const nodeEnv = (process.env.NODE_ENV ?? "").toLowerCase();
    const isProd = nodeEnv === "production" || nodeEnv === "prod";
    const allowRepoFallback = [process.env.IG_ALLOW_REPO_ENV, process.env.ALLOW_REPO_ENV]
      .map((value) => (value ? value.trim().toLowerCase() : ""))
      .some((value) => ["1", "true", "yes", "on"].includes(value));
    if (!isProd || allowRepoFallback) {
      dotenv.config();
    }
  }
}

function getSourceDatabaseUrl(source: string): string | null {
  switch (source) {
    case "local":
      return process.env.DATABASE_ONPREMISE_DEV_PRIMARY || null;
    case "dev":
      return process.env.PROD_DATABASE_URL || process.env.RENDER_DB_EXTERNAL_URL || null;
    case "prod":
      return process.env.PROD_DATABASE_URL || null;
    default:
      // Assume it's a full connection URL
      if (source.startsWith("postgresql://")) {
        return source;
      }
      return null;
  }
}

function buildPaths(options: Options): Paths {
  const dbRoot = path.join(options.storeRoot, "onpremise-dev-experiment");
  return {
    storeRoot: options.storeRoot,
    dbRoot,
    clusterDir: path.join(dbRoot, "pg_data"),
    snapshotsDir: path.join(dbRoot, "snapshots"),
    logFile: path.join(dbRoot, "logs", "postgres.log"),
    connectionFile: path.join(dbRoot, "onpremise-experiment-url.txt"),
    metadataFile: path.join(dbRoot, "metadata.json"),
  };
}

function findPgBinaries(): PgBinaries {
  const pgBinDir = process.env.PG_BIN_DIR?.trim();
  const candidates: string[] = [];

  if (pgBinDir) {
    candidates.push(pgBinDir);
  }

  // Common PostgreSQL installation paths on Windows
  candidates.push(
    "C:/Program Files/PostgreSQL/18/bin",
    "C:/Program Files/PostgreSQL/17/bin",
    "C:/Program Files/PostgreSQL/16/bin",
    "C:/Program Files/PostgreSQL/15/bin",
  );

  let binDir: string | null = null;
  for (const candidate of candidates) {
    const pgCtlPath = path.join(candidate, "pg_ctl.exe");
    if (fs.existsSync(pgCtlPath)) {
      binDir = candidate;
      break;
    }
  }

  if (!binDir) {
    printError("PostgreSQL binaries not found");
    console.log(formatKeyValueList([
      { key: "Required", value: "Set PG_BIN_DIR environment variable" },
      { key: "Example", value: "C:/Program Files/PostgreSQL/18/bin" },
    ]).join('\n'));
    process.exit(1);
  }

  return {
    pgCtl: path.join(binDir, "pg_ctl.exe"),
    pgIsReady: path.join(binDir, "pg_isready.exe"),
    initdb: path.join(binDir, "initdb.exe"),
    pgDump: path.join(binDir, "pg_dump.exe"),
    pgRestore: path.join(binDir, "pg_restore.exe"),
    createdb: path.join(binDir, "createdb.exe"),
    dropdb: path.join(binDir, "dropdb.exe"),
    psql: path.join(binDir, "psql.exe"),
  };
}

async function ensureDirectories(paths: Paths): Promise<void> {
  await fsPromises.mkdir(paths.dbRoot, { recursive: true });
  await fsPromises.mkdir(path.dirname(paths.logFile), { recursive: true });
  await fsPromises.mkdir(paths.snapshotsDir, { recursive: true });
}

async function stopExistingCluster(binaries: PgBinaries, paths: Paths): Promise<void> {
  if (!fs.existsSync(paths.clusterDir)) {
    return;
  }

  printInfo("Stopping existing experimental database cluster");

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        binaries.pgCtl,
        [
          "stop",
          "-D",
          paths.clusterDir,
          "-m",
          "fast",
          "-w", // Wait for shutdown
          "-t",
          "10", // Timeout 10 seconds
        ],
        (error, stdout, stderr) => {
          if (error) {
            // Ignore error if cluster was already stopped
            if (stderr.includes("PID file") || stderr.includes("not running")) {
              printInfo("Cluster was already stopped");
              resolve();
            } else {
              reject(new Error(`pg_ctl stop failed: ${stderr}`));
            }
          } else {
            printSuccess("Experimental cluster stopped");
            resolve();
          }
        },
      );
    });
  } catch (err) {
    printWarning(`Could not stop existing cluster: ${(err as Error).message}`);
  }
}

async function initializeCluster(binaries: PgBinaries, paths: Paths): Promise<void> {
  printInfo("Initializing experimental database cluster");

  // Remove existing cluster directory if it exists
  if (fs.existsSync(paths.clusterDir)) {
    printInfo("Removing existing cluster directory");
    await fsPromises.rm(paths.clusterDir, { recursive: true, force: true });
  }

  await new Promise<void>((resolve, reject) => {
    execFile(
      binaries.initdb,
      [
        "-D",
        paths.clusterDir,
        "-U",
        "postgres",
        "--auth=trust",
        "--encoding=UTF8",
        "--locale=en_US.UTF-8",
      ],
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`initdb failed: ${stderr}`));
        } else {
          printSuccess("Cluster initialized");
          resolve();
        }
      },
    );
  });
}

async function startCluster(binaries: PgBinaries, paths: Paths, port: number): Promise<void> {
  printInfo(`Starting experimental database cluster on port ${port}`);

  await new Promise<void>((resolve, reject) => {
    execFile(
      binaries.pgCtl,
      [
        "start",
        "-D",
        paths.clusterDir,
        "-l",
        paths.logFile,
        "-o",
        `-p ${port}`,
        "-w", // Wait for startup
        "-t",
        "30", // Timeout 30 seconds
      ],
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`pg_ctl start failed: ${stderr}`));
        } else {
          printSuccess("Cluster started");
          resolve();
        }
      },
    );
  });

  // Wait for server to be ready
  printInfo("Waiting for server to be ready");
  await new Promise<void>((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 10;

    const checkReady = () => {
      execFile(binaries.pgIsReady, ["-h", "localhost", "-p", String(port)], (error) => {
        if (!error) {
          printSuccess("Server is ready");
          resolve();
        } else {
          attempts++;
          if (attempts >= maxAttempts) {
            reject(new Error("Server failed to start after 10 attempts"));
          } else {
            setTimeout(checkReady, 1000);
          }
        }
      });
    };

    checkReady();
  });
}

async function cloneFromSource(
  binaries: PgBinaries,
  paths: Paths,
  sourceUrl: string,
  port: number,
): Promise<void> {
  const maskedUrl = sourceUrl.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
  printInfo(`Cloning database from source: ${maskedUrl}`);

  // Step 1: Create dump of source database
  const dumpFile = path.join(paths.snapshotsDir, `clone_${Date.now()}.dump`);
  printInfo("Creating snapshot of source database");

  await new Promise<void>((resolve, reject) => {
    execFile(
      binaries.pgDump,
      [
        sourceUrl,
        "-F",
        "c", // Custom format
        "-f",
        dumpFile,
        "-v", // Verbose
      ],
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`pg_dump failed: ${stderr}`));
        } else {
          printSuccess("Snapshot created");
          resolve();
        }
      },
    );
  });

  // Step 2: Create experimental database
  const expDbName = "infinity_gauntlet_experiment";
  const expUrl = `postgresql://postgres@localhost:${port}/postgres`;

  printInfo(`Creating database: ${expDbName}`);

  await new Promise<void>((resolve, reject) => {
    execFile(
      binaries.createdb,
      ["-h", "localhost", "-p", String(port), "-U", "postgres", expDbName],
      (error, stdout, stderr) => {
        if (error) {
          // Ignore error if database already exists
          if (stderr.includes("already exists")) {
            printInfo("Database already exists");
            resolve();
          } else {
            reject(new Error(`createdb failed: ${stderr}`));
          }
        } else {
          printSuccess("Database created");
          resolve();
        }
      },
    );
  });

  // Step 3: Restore dump to experimental database
  const expRestoreUrl = `postgresql://postgres@localhost:${port}/${expDbName}`;
  printInfo("Restoring snapshot to experimental database");

  await new Promise<void>((resolve, reject) => {
    execFile(
      binaries.pgRestore,
      [
        "-d",
        expRestoreUrl,
        "-v", // Verbose
        "--clean", // Drop objects before restoring
        "--if-exists", // Use IF EXISTS when dropping
        "--no-owner", // Don't restore ownership
        "--no-privileges", // Don't restore privileges
        dumpFile,
      ],
      (error, stdout, stderr) => {
        // pg_restore often outputs warnings to stderr even on success
        // Only reject if there's an actual error code
        if (error && error.code !== 0) {
          printWarning(`pg_restore warnings: ${stderr}`);
          // Don't reject - warnings are common and usually harmless
        }
        printSuccess("Snapshot restored");
        resolve();
      },
    );
  });

  // Step 4: Clean up dump file
  await fsPromises.unlink(dumpFile);
}

async function writeConnectionFile(paths: Paths, port: number): Promise<void> {
  const dbName = "infinity_gauntlet_experiment";
  const url = `postgresql://postgres@127.0.0.1:${port}/${dbName}`;

  await fsPromises.writeFile(paths.connectionFile, url, "utf8");
  printSuccess(`Connection URL written to: ${paths.connectionFile}`);
  printKeyValue("DATABASE_ONPREMISE_DEV_EXPERIMENT", url);
}

async function writeMetadata(paths: Paths, source: string): Promise<void> {
  const metadata = {
    createdAt: new Date().toISOString(),
    source,
    port: 55_434,
    autoSync: false,
    purpose: "experimental development and migration testing",
  };

  await fsPromises.writeFile(paths.metadataFile, JSON.stringify(metadata, null, 2), "utf8");
  printSuccess(`Metadata written to: ${paths.metadataFile}`);
}

async function getRowCounts(binaries: PgBinaries, port: number): Promise<Record<string, number>> {
  const dbName = "infinity_gauntlet_experiment";
  const url = `postgresql://postgres@localhost:${port}/${dbName}`;

  const tables = ["User", "Species", "PokemonInstance", "Battle", "UserEvent"];
  const counts: Record<string, number> = {};

  for (const table of tables) {
    try {
      const countQuery = `SELECT COUNT(*) FROM "${table}";`;
      const result = await new Promise<string>((resolve, reject) => {
        execFile(
          binaries.psql,
          [url, "-t", "-A", "-c", countQuery],
          (error, stdout, stderr) => {
            if (error) {
              reject(new Error(`psql failed for ${table}: ${stderr}`));
            } else {
              resolve(stdout.trim());
            }
          },
        );
      });
      counts[table] = parseInt(result, 10) || 0;
    } catch (err) {
      counts[table] = 0;
    }
  }

  return counts;
}

async function main(): Promise<void> {
  printSection("Bootstrap Experimental Database");

  loadEnvironment();

  const parsed = parseArgs(process.argv.slice(2));
  const options = applyDefaults(parsed);
  const paths = buildPaths(options);
  const binaries = findPgBinaries();

  log.info('bootstrap', 'Starting experimental database bootstrap', {
    port: options.port,
    source: options.source,
    storeRoot: options.storeRoot,
    skipStart: options.skipStart,
  });

  console.log(formatKeyValueList([
    { key: "Port", value: String(options.port) },
    { key: "Source", value: options.source },
    { key: "Store", value: paths.dbRoot },
    { key: "Skip Start", value: String(options.skipStart) },
  ]).join('\n'));
  console.log('');

  // Validate source database URL
  const sourceUrl = getSourceDatabaseUrl(options.source);
  if (!sourceUrl) {
    printError(`Source database URL not found for: ${options.source}`);
    console.log(formatKeyValueList([
      { key: "Available Sources", value: "local, dev, prod, or postgresql:// URL" },
    ]).join('\n'));
    console.log(formatList([
      "DATABASE_ONPREMISE_DEV_PRIMARY (for source=local)",
      "PROD_DATABASE_URL or RENDER_DB_EXTERNAL_URL (for source=dev)",
      "PROD_DATABASE_URL (for source=prod)",
    ], "Required Environment Variables"));
    process.exit(1);
  }

  try {
    // Step 1: Ensure directories exist
    await ensureDirectories(paths);

    // Step 2: Stop existing cluster if running
    await stopExistingCluster(binaries, paths);

    // Step 3: Initialize new cluster
    await initializeCluster(binaries, paths);

    // Step 4: Start cluster
    if (!options.skipStart) {
      await startCluster(binaries, paths, options.port);

      // Step 5: Clone from source database
      await cloneFromSource(binaries, paths, sourceUrl, options.port);

      // Step 6: Write connection file
      await writeConnectionFile(paths, options.port);

      // Step 7: Write metadata
      await writeMetadata(paths, options.source);

      // Step 8: Get row counts
      printSection("Database Summary");
      const counts = await getRowCounts(binaries, options.port);
      console.log(formatKeyValueList(
        Object.entries(counts).map(([table, count]) => ({
          key: table,
          value: `${count} rows`,
        }))
      ).join('\n'));

      printSuccess("Experimental database bootstrap complete!");
      log.info('complete', 'Experimental database bootstrap complete', {
        port: options.port,
        source: options.source,
      });
      
      printSection("Next Steps");
      console.log(formatList([
        `Add to secrets/Infinity-Gauntlet.env:\n     DATABASE_ONPREMISE_DEV_EXPERIMENT=postgresql://postgres@127.0.0.1:${options.port}/infinity_gauntlet_experiment`,
        "Test connection:\n     npm run db:cli -- count User --target experiment",
        `Test Phase 2 migration:\n     psql postgresql://postgres@127.0.0.1:${options.port}/infinity_gauntlet_experiment -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql`,
        "Sync from primary local when needed:\n     npm run ops:sync-onpremise-experiment --from local",
      ], ""));
    } else {
      log.info('complete', 'Experimental cluster initialized (not started)', { port: options.port });
      printSuccess("Experimental cluster initialized (not started)");
      console.log(formatKeyValueList([
        { key: "To start cluster", value: "npm run ops:start-onpremise-experiment" },
      ]).join('\n'));
    }
  } catch (err) {
    const message = (err as Error).message;
    log.error('bootstrap', 'Bootstrap failed', { error: message, source: options.source });
    printError(`Bootstrap failed: ${message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  log.error('bootstrap', 'Unhandled error', { error: String(err) });
  printError(`Unhandled error: ${err}`);
  process.exit(1);
});
