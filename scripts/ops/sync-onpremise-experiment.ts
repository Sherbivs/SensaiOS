import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFile, spawn } from "node:child_process";
import * as dotenv from "dotenv";
import { scopedLogger } from '../../src/observability/envelope/console.js';
import { printSuccess, printError, printInfo, formatSectionHeader, formatKeyValueList } from '../../src/utils/output-formatter.js';

const log = scopedLogger('ops.sync-experiment');

/**
 * Sync Experimental Database Script
 * 
 * Refreshes the experimental database by cloning from a source database:
 * - --from local (default): Clone from PRIMARY LOCAL database (offline sync)
 * - --from dev: Clone from DEV master database (downloads from cloud)
 * - --from prod: Clone from PROD database (downloads from cloud)
 * 
 * Usage:
 *   npm run ops:sync-experiment-db
 *   npm run ops:sync-experiment-db -- --from local
 *   npm run ops:sync-experiment-db -- --from dev
 */

interface ParsedOptions {
  from?: string;
  storeRoot?: string;
  skipRestart?: boolean;
}

interface Options {
  from: string;
  storeRoot: string;
  skipRestart: boolean;
}

interface Paths {
  storeRoot: string;
  dbRoot: string;
  clusterDir: string;
  snapshotsDir: string;
  logFile: string;
  metadataFile: string;
}

interface PgBinaries {
  pgCtl: string;
  pgIsReady: string;
  pgDump: string;
  pgRestore: string;
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
      case "from":
      case "source":
        if (value) {
          options.from = value.toLowerCase();
        }
        break;
      case "store":
      case "store-root":
      case "storeroot":
        if (value) {
          options.storeRoot = path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
        }
        break;
      case "skip-restart":
      case "skiprestart":
        options.skipRestart = true;
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
    from: parsed.from ?? "local",
    storeRoot,
    skipRestart: Boolean(parsed.skipRestart),
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

function resolvePaths(storeRoot: string): Paths {
  const dbRoot = path.join(storeRoot, "onpremise-dev-experiment");
  return {
    storeRoot,
    dbRoot,
    clusterDir: path.join(dbRoot, "pg_data"),
    snapshotsDir: path.join(dbRoot, "snapshots"),
    logFile: path.join(dbRoot, "logs", "postgres.log"),
    metadataFile: path.join(dbRoot, "metadata.json"),
  };
}

function locatePgBinDirectory(): string | undefined {
  const candidates: string[] = [];

  const envCandidate = process.env.PG_BIN_DIR?.trim();
  if (envCandidate) {
    candidates.push(envCandidate);
  }

  const repoToolsCandidate = path.join(process.cwd(), "tools", "pgsql18", "pgsql", "bin");
  candidates.push(repoToolsCandidate);

  const programFiles = process.env.ProgramFiles || "C:/Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  const versions = ["17", "16", "15"];

  for (const version of versions) {
    candidates.push(path.join(programFiles, "PostgreSQL", version, "bin"));
    if (programFilesX86) {
      candidates.push(path.join(programFilesX86, "PostgreSQL", version, "bin"));
    }
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const normalized = path.resolve(candidate);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);

    if (!fs.existsSync(normalized)) {
      continue;
    }

    const shareCandidates = [
      path.join(path.dirname(normalized), "share"),
      path.join(path.dirname(path.dirname(normalized)), "share"),
    ];

    const shareFound = shareCandidates.some((sharePath) => fs.existsSync(sharePath) && fs.statSync(sharePath).isDirectory());

    if (!shareFound) {
      log.warn('pg-binaries', 'Skipping Postgres bin directory without share/', { path: normalized });
      continue;
    }

    return normalized;
  }

  return undefined;
}

function resolvePgBinaries(): PgBinaries {
  const bundleRoot = locatePgBinDirectory();
  if (!bundleRoot) {
    throw new Error(
      "Unable to locate Postgres binaries with a share directory. Set PG_BIN_DIR manually.",
    );
  }

  process.env.PG_BIN_DIR = bundleRoot;

  const suffix = process.platform === "win32" ? ".exe" : "";

  const resolveBinary = (name: string): string => {
    const fullPath = path.join(bundleRoot, `${name}${suffix}`);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Required Postgres binary not found: ${fullPath}`);
    }
    return fullPath;
  };

  return {
    pgCtl: resolveBinary("pg_ctl"),
    pgIsReady: resolveBinary("pg_isready"),
    pgDump: resolveBinary("pg_dump"),
    pgRestore: resolveBinary("pg_restore"),
    psql: resolveBinary("psql"),
  };
}

function runCommand(command: string, args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    log.debug('run-command', label, { command, args: args.join(' ') });
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} failed with exit code ${code}`));
      }
    });
  });
}

function execFileAsync(command: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        const errno = error as NodeJS.ErrnoException;
        const code = typeof errno.code === "number" ? errno.code : 1;
        resolve({ stdout, stderr, code });
        return;
      }
      resolve({ stdout, stderr, code: 0 });
    });
  });
}

async function clusterRunning(binaries: PgBinaries, paths: Paths): Promise<boolean> {
  const result = await execFileAsync(binaries.pgCtl, ["-D", paths.clusterDir, "status"]);
  return result.code === 0;
}

async function stopCluster(binaries: PgBinaries, paths: Paths): Promise<void> {
  if (!(await clusterRunning(binaries, paths))) {
    printInfo("Cluster is not running");
    return;
  }

  printInfo("Stopping experimental cluster...");
  await runCommand(
    binaries.pgCtl,
    ["-D", paths.clusterDir, "-m", "fast", "-w", "stop"],
    "pg_ctl stop",
  );
}

async function startCluster(binaries: PgBinaries, paths: Paths): Promise<void> {
  if (await clusterRunning(binaries, paths)) {
    printInfo("Cluster is already running");
    return;
  }

  printInfo("Starting experimental cluster...");
  await runCommand(
    binaries.pgCtl,
    ["-D", paths.clusterDir, "-l", paths.logFile, "-w", "start", "-o", "-p 55434"],
    "pg_ctl start",
  );
}

function resolveSourceUrl(source: string): string {
  const normalizedSource = source.toLowerCase();

  switch (normalizedSource) {
    case "local": {
      const localUrl = process.env.PROD_DATABASE_URL?.trim() || process.env.DATABASE_ONPREMISE_DEV_PRIMARY?.trim();
      if (!localUrl) {
        throw new Error(
          "DATABASE_ONPREMISE_DEV_PRIMARY or PROD_DATABASE_URL not configured. Bootstrap PRIMARY LOCAL DB first.",
        );
      }
      return localUrl;
    }
    case "dev": {
      const devUrl = process.env.PROD_DATABASE_URL?.trim() || process.env.RENDER_DB_EXTERNAL_URL?.trim();
      if (!devUrl) {
        throw new Error(
          "PROD_DATABASE_URL or RENDER_DB_EXTERNAL_URL not configured.",
        );
      }
      return devUrl;
    }
    case "prod": {
      const prodUrl = process.env.PROD_DATABASE_URL?.trim();
      if (!prodUrl) {
        throw new Error(
          "PROD_DATABASE_URL not configured.",
        );
      }
      return prodUrl;
    }
    default: {
      if (/^postgres(?:ql)?:\/\//i.test(normalizedSource)) {
        return normalizedSource;
      }
      throw new Error(
        `Invalid --from value: "${source}". Use: local, dev, prod, or postgres://...`,
      );
    }
  }
}

function maskConnectionString(url: string): string {
  if (!url) {
    return "(not set)";
  }
  try {
    const normalized = url.replace(/^prisma\+postgres:\/\//, "postgres://");
    const parsed = new URL(normalized);
    return `${parsed.protocol}//***@${parsed.host}`;
  } catch {
    return "(hidden)";
  }
}

async function createSnapshot(
  binaries: PgBinaries,
  sourceUrl: string,
  paths: Paths,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotFile = path.join(paths.snapshotsDir, `sync-${timestamp}.dump`);
  
  await fsPromises.mkdir(paths.snapshotsDir, { recursive: true });
  
  await runCommand(
    binaries.pgDump,
    ["--dbname", sourceUrl, "--format", "custom", "--blobs", "--no-owner", "--no-privileges", "--file", snapshotFile],
    "pg_dump",
  );
  return snapshotFile;
}

async function restoreSnapshot(
  binaries: PgBinaries,
  snapshotFile: string,
): Promise<void> {
  const experimentUrl = "postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment";
  
  await runCommand(
    binaries.pgRestore,
    ["--dbname", experimentUrl, "--clean", "--if-exists", "--no-owner", "--no-privileges", snapshotFile],
    "pg_restore",
  );
}

async function pruneSnapshots(paths: Paths, retention: number): Promise<void> {
  if (retention <= 0) {
    return;
  }
  const entries = await fsPromises.readdir(paths.snapshotsDir);
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.startsWith("sync-") && entry.endsWith(".dump"))
      .map(async (entry) => {
        const fullPath = path.join(paths.snapshotsDir, entry);
        const stats = await fsPromises.stat(fullPath);
        return { fullPath, mtime: stats.mtimeMs };
      }),
  );

  if (candidates.length <= retention) {
    return;
  }

  const sorted = candidates.sort((a, b) => b.mtime - a.mtime);
  const toRemove = sorted.slice(retention);
  await Promise.all(
    toRemove.map(async (item) => {
      await fsPromises.unlink(item.fullPath);
    }),
  );
}

async function writeMetadata(paths: Paths, source: string, sourceUrl: string): Promise<void> {
  const payload = {
    lastSync: new Date().toISOString(),
    source: source.toLowerCase(),
    sourceUrl: maskConnectionString(sourceUrl),
  };

  const existing = fs.existsSync(paths.metadataFile)
    ? JSON.parse(await fsPromises.readFile(paths.metadataFile, "utf8"))
    : {};

  await fsPromises.writeFile(
    paths.metadataFile,
    `${JSON.stringify({ ...existing, ...payload }, null, 2)}\n`,
    "utf8",
  );
}

async function getRowCounts(binaries: PgBinaries): Promise<Record<string, number>> {
  const url = "postgresql://postgres@127.0.0.1:55434/infinity_gauntlet_experiment";
  const tables = ["User", "Species", "PokemonInstance", "Battle"];
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
    } catch {
      counts[table] = 0;
    }
  }

  return counts;
}

async function main(): Promise<void> {
  console.log(formatSectionHeader("Sync Experimental Database"));

  loadEnvironment();

  const parsed = parseArgs(process.argv.slice(2));
  const options = applyDefaults(parsed);
  const binaries = resolvePgBinaries();
  const paths = resolvePaths(options.storeRoot);

  log.info('config', 'Starting sync', { source: options.from, store: paths.dbRoot });
  console.log(formatKeyValueList([["Source", options.from.toUpperCase()], ["Store", paths.dbRoot]]));
  console.log();

  // Validate experimental cluster exists
  if (!fs.existsSync(paths.clusterDir)) {
    log.error('validate', 'Experimental cluster not initialized', { clusterDir: paths.clusterDir });
    printError("Experimental cluster not initialized.");
    printInfo("Run: npm run ops:bootstrap-onpremise-experiment");
    process.exit(1);
  }

  try {
    const sourceUrl = resolveSourceUrl(options.from);
    const sourceName = options.from.toUpperCase();
    
    log.info('sync', 'Starting sync from source', { source: sourceName });
    printInfo(`Syncing from ${sourceName} (${maskConnectionString(sourceUrl)})...`);

    // Step 1: Stop cluster
    await stopCluster(binaries, paths);

    // Step 2: Create snapshot
    const snapshotFile = await createSnapshot(binaries, sourceUrl, paths);
    log.info('snapshot', 'Created snapshot', { source: sourceName, file: snapshotFile });
    printSuccess(`Created snapshot from ${sourceName}`);

    // Step 3: Start cluster
    if (!options.skipRestart) {
      await startCluster(binaries, paths);
    }

    // Step 4: Restore snapshot
    log.info('restore', 'Restoring snapshot to experimental database');
    printInfo("Restoring snapshot to experimental database...");
    await restoreSnapshot(binaries, snapshotFile);
    log.info('restore', 'Snapshot restored');
    printSuccess("Snapshot restored");

    // Step 5: Clean up old snapshots
    await pruneSnapshots(paths, 2);

    // Step 6: Update metadata
    await writeMetadata(paths, options.from, sourceUrl);

    // Step 7: Get row counts
    console.log(formatSectionHeader("Database Summary", 1));
    const counts = await getRowCounts(binaries);
    console.log(formatKeyValueList(Object.entries(counts).map(([table, count]) => [table, `${count} rows`])));

    log.info('complete', 'Sync complete', { source: sourceName });
    printSuccess("Sync complete!");
    printInfo(`Experimental database synchronized from ${sourceName}`);
    printInfo("Ready for migration testing");
  } catch (err) {
    log.error('sync', 'Sync failed', { error: (err as Error).message, stack: (err as Error).stack });
    printError(`Sync failed: ${(err as Error).message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  log.error('unhandled', 'Unhandled error', { error: String(err) });
  printError(`Unhandled error: ${err}`);
  process.exit(1);
});
