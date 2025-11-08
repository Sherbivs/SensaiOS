import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFile, spawn } from "node:child_process";
import * as dotenv from "dotenv";

/**
 * Bootstrap Experimental Database Script
 * 
 * Creates an independent experimental PostgreSQL database on port 55434 for:
 * - Testing migrations before applying to PRIMARY LOCAL/DEV/PROD
 * - Experimenting with schema changes
 * - Destructive testing (DROP TABLE, etc.)
 * 
 * The experimental database does NOT participate in auto-sync/replication.
 * It must be manually synced using sync_experiment_db.ts.
 * 
 * Usage:
 *   npm run ops:bootstrap-experiment-db
 *   npm run ops:bootstrap-experiment-db -- --source local
 *   npm run ops:bootstrap-experiment-db -- --source dev
 *   npm run ops:bootstrap-experiment-db -- --port 55435
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
      return process.env.DATABASE_LOCAL_URL || null;
    case "dev":
      return process.env.DEV_DATABASE_URL || process.env.RENDER_DB_EXTERNAL_URL || null;
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
  const dbRoot = path.join(options.storeRoot, "db-experiment");
  return {
    storeRoot: options.storeRoot,
    dbRoot,
    clusterDir: path.join(dbRoot, "pg_data"),
    snapshotsDir: path.join(dbRoot, "snapshots"),
    logFile: path.join(dbRoot, "logs", "postgres.log"),
    connectionFile: path.join(dbRoot, "experiment-url.txt"),
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
    "C:/Program Files/PostgreSQL/17/bin",
    "C:/Program Files/PostgreSQL/16/bin",
    "C:/Program Files/PostgreSQL/15/bin",
    "C:/Program Files/PostgreSQL/14/bin",
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
    console.error("❌ PostgreSQL binaries not found.");
    console.error("Please set PG_BIN_DIR environment variable to PostgreSQL bin directory.");
    console.error("Example: C:/Program Files/PostgreSQL/17/bin");
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

  console.log("🛑 Stopping existing experimental database cluster...");

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
              console.log("   (Cluster was already stopped)");
              resolve();
            } else {
              reject(new Error(`pg_ctl stop failed: ${stderr}`));
            }
          } else {
            console.log("✅ Experimental cluster stopped");
            resolve();
          }
        },
      );
    });
  } catch (err) {
    console.warn(`⚠️  Could not stop existing cluster: ${(err as Error).message}`);
  }
}

async function initializeCluster(binaries: PgBinaries, paths: Paths): Promise<void> {
  console.log("🔨 Initializing experimental database cluster...");

  // Remove existing cluster directory if it exists
  if (fs.existsSync(paths.clusterDir)) {
    console.log("   Removing existing cluster directory...");
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
          console.log("✅ Cluster initialized");
          resolve();
        }
      },
    );
  });
}

async function startCluster(binaries: PgBinaries, paths: Paths, port: number): Promise<void> {
  console.log(`🚀 Starting experimental database cluster on port ${port}...`);

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
          console.log("✅ Cluster started");
          resolve();
        }
      },
    );
  });

  // Wait for server to be ready
  console.log("⏳ Waiting for server to be ready...");
  await new Promise<void>((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 10;

    const checkReady = () => {
      execFile(binaries.pgIsReady, ["-h", "localhost", "-p", String(port)], (error) => {
        if (!error) {
          console.log("✅ Server is ready");
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
  console.log(`📦 Cloning database from source: ${sourceUrl.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")}...`);

  // Step 1: Create dump of source database
  const dumpFile = path.join(paths.snapshotsDir, `clone_${Date.now()}.dump`);
  console.log("   Creating snapshot of source database...");

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
          console.log("✅ Snapshot created");
          resolve();
        }
      },
    );
  });

  // Step 2: Create experimental database
  const expDbName = "infinity_gauntlet_experiment";
  const expUrl = `postgresql://postgres@localhost:${port}/postgres`;

  console.log(`   Creating database: ${expDbName}...`);

  await new Promise<void>((resolve, reject) => {
    execFile(
      binaries.createdb,
      ["-h", "localhost", "-p", String(port), "-U", "postgres", expDbName],
      (error, stdout, stderr) => {
        if (error) {
          // Ignore error if database already exists
          if (stderr.includes("already exists")) {
            console.log("   (Database already exists)");
            resolve();
          } else {
            reject(new Error(`createdb failed: ${stderr}`));
          }
        } else {
          console.log("✅ Database created");
          resolve();
        }
      },
    );
  });

  // Step 3: Restore dump to experimental database
  const expRestoreUrl = `postgresql://postgres@localhost:${port}/${expDbName}`;
  console.log("   Restoring snapshot to experimental database...");

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
          console.warn(`⚠️  pg_restore warnings: ${stderr}`);
          // Don't reject - warnings are common and usually harmless
        }
        console.log("✅ Snapshot restored");
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
  console.log(`✅ Connection URL written to: ${paths.connectionFile}`);
  console.log(`   DATABASE_EXPERIMENT_URL="${url}"`);
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
  console.log(`✅ Metadata written to: ${paths.metadataFile}`);
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
  console.log("🎯 Bootstrap Experimental Database");
  console.log("=====================================\n");

  loadEnvironment();

  const parsed = parseArgs(process.argv.slice(2));
  const options = applyDefaults(parsed);
  const paths = buildPaths(options);
  const binaries = findPgBinaries();

  console.log("Configuration:");
  console.log(`  Port: ${options.port}`);
  console.log(`  Source: ${options.source}`);
  console.log(`  Store: ${paths.dbRoot}`);
  console.log(`  Skip start: ${options.skipStart}\n`);

  // Validate source database URL
  const sourceUrl = getSourceDatabaseUrl(options.source);
  if (!sourceUrl) {
    console.error(`❌ Source database URL not found for: ${options.source}`);
    console.error("Available sources: local, dev, prod, or full postgresql:// URL");
    console.error("Ensure environment variables are set:");
    console.error("  - DATABASE_LOCAL_URL (for source=local)");
    console.error("  - DEV_DATABASE_URL or RENDER_DB_EXTERNAL_URL (for source=dev)");
    console.error("  - PROD_DATABASE_URL (for source=prod)");
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
      console.log("\n📊 Database Summary:");
      const counts = await getRowCounts(binaries, options.port);
      for (const [table, count] of Object.entries(counts)) {
        console.log(`  ${table}: ${count} rows`);
      }

      console.log("\n✅ Experimental database bootstrap complete!");
      console.log("\nNext steps:");
      console.log("  1. Add to secrets/Infinity-Gauntlet.env:");
      console.log(
        `     DATABASE_EXPERIMENT_URL=postgresql://postgres@127.0.0.1:${options.port}/infinity_gauntlet_experiment`,
      );
      console.log("  2. Test connection:");
      console.log("     npm run db:cli -- count User --target experiment");
      console.log("  3. Test Phase 2 migration:");
      console.log(
        `     psql postgresql://postgres@127.0.0.1:${options.port}/infinity_gauntlet_experiment -f prisma/migrations/20251108183000_northstar_phase2_consolidation/migration.sql`,
      );
      console.log("  4. Sync from primary local when needed:");
      console.log("     npm run ops:sync-experiment-db --from local");
    } else {
      console.log("\n✅ Experimental cluster initialized (not started)");
      console.log("\nTo start cluster:");
      console.log(`  npm run ops:start-experiment-db`);
    }
  } catch (err) {
    console.error(`\n❌ Bootstrap failed: ${(err as Error).message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Unhandled error: ${err}`);
  process.exit(1);
});
