import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFile, spawn } from "node:child_process";
import * as dotenv from "dotenv";

interface ParsedOptions {
  port?: number;
  skipSync?: boolean;
  skipStart?: boolean;
  retention?: number;
  storeRoot?: string;
  sourceUrl?: string;
}

interface Options {
  port: number;
  skipSync: boolean;
  skipStart: boolean;
  retention: number;
  storeRoot: string;
  sourceUrl?: string;
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
      case "skip-sync":
      case "skipsync":
        options.skipSync = true;
        break;
      case "skip-start":
      case "skipstart":
        options.skipStart = true;
        break;
      case "retention":
      case "keep":
        if (value) {
          const parsedRetention = Number(value);
          if (Number.isFinite(parsedRetention) && parsedRetention >= 0) {
            options.retention = Math.trunc(parsedRetention);
          }
        }
        break;
      case "store":
      case "store-root":
      case "storeroot":
        if (value) {
          options.storeRoot = path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
        }
        break;
      case "source":
      case "source-url":
        if (value) {
          options.sourceUrl = value;
        }
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
    port: parsed.port ?? 55_433,
    skipSync: Boolean(parsed.skipSync),
    skipStart: Boolean(parsed.skipStart),
    retention: parsed.retention ?? 3,
    storeRoot,
    sourceUrl: parsed.sourceUrl,
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
      const result = dotenv.config();
      if (!result.error) {
        loaded = true;
      }
    }
  }

  if (!loaded) {
    console.warn("[local-db] No environment file loaded. Set IG_ENV_FILE or DOTENV_CONFIG_PATH before running this helper.");
  }
}

function resolvePaths(storeRoot: string): Paths {
  const dbRoot = path.join(storeRoot, "db");
  return {
    storeRoot,
    dbRoot,
    clusterDir: path.join(dbRoot, "local-cluster"),
    snapshotsDir: path.join(dbRoot, "snapshots"),
    logFile: path.join(dbRoot, "local-postgres.log"),
    connectionFile: path.join(dbRoot, "local-url.txt"),
    metadataFile: path.join(dbRoot, "local-metadata.json"),
  };
}

function resolvePgBinaries(): PgBinaries {
  const bundleRoot = process.env.PG_BIN_DIR?.trim() || path.join(process.cwd(), "tools", "pgsql17", "pgsql", "bin");
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
    initdb: resolveBinary("initdb"),
    pgDump: resolveBinary("pg_dump"),
    pgRestore: resolveBinary("pg_restore"),
    createdb: resolveBinary("createdb"),
    dropdb: resolveBinary("dropdb"),
  };
}

async function ensureDirectories(paths: Paths): Promise<void> {
  await fsPromises.mkdir(paths.storeRoot, { recursive: true });
  await fsPromises.mkdir(paths.dbRoot, { recursive: true });
  await fsPromises.mkdir(paths.clusterDir, { recursive: true });
  await fsPromises.mkdir(paths.snapshotsDir, { recursive: true });
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

function runCommand(command: string, args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[local-db] ${label}: ${command} ${args.join(" ")}`);
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

async function clusterExists(paths: Paths): Promise<boolean> {
  return fs.existsSync(path.join(paths.clusterDir, "PG_VERSION"));
}

async function initializeCluster(binaries: PgBinaries, paths: Paths): Promise<boolean> {
  if (await clusterExists(paths)) {
    return false;
  }

  await ensureDirectories(paths);
  await runCommand(binaries.initdb, ["-D", paths.clusterDir, "--username", "postgres", "--auth=trust"], "initdb");
  return true;
}

async function clusterRunning(binaries: PgBinaries, paths: Paths): Promise<boolean> {
  const result = await execFileAsync(binaries.pgCtl, ["-D", paths.clusterDir, "status"]);
  return result.code === 0;
}

async function startCluster(binaries: PgBinaries, paths: Paths, port: number): Promise<boolean> {
  if (await clusterRunning(binaries, paths)) {
    return false;
  }

  await runCommand(
    binaries.pgCtl,
    ["-D", paths.clusterDir, "-l", paths.logFile, "-w", "start", "-o", `-p ${port} -h 127.0.0.1`],
    "pg_ctl start",
  );
  return true;
}

async function waitForReady(binaries: PgBinaries, port: number): Promise<void> {
  await runCommand(
    binaries.pgIsReady,
    ["--host", "127.0.0.1", "--port", String(port), "--timeout=10"],
    "pg_isready",
  );
}

function resolveSourceUrl(options: Options): string {
  if (options.sourceUrl) {
    return options.sourceUrl;
  }

  const explicit = process.env.DATABASE_DIRECT_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const primary = process.env.DATABASE_URL?.trim();
  if (primary && /^postgres(?:ql)?:\/\//i.test(primary)) {
    return primary;
  }

  throw new Error(
    "No PostgreSQL source URL available. Set DATABASE_DIRECT_URL, provide --source=postgres://..., or populate DATABASE_URL with a direct connection string before running this script.",
  );
}

function extractDatabaseName(url: string): string {
  try {
    const parsed = new URL(url);
    const dbName = parsed.pathname.replace(/^\//, "").split("/")[0];
    if (!dbName) {
      throw new Error("Database name missing");
    }
    return dbName;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse database name from source URL: ${message}`);
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
  dbName: string,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotFile = path.join(paths.snapshotsDir, `${dbName}-${timestamp}.dump`);
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
  dbName: string,
  port: number,
  localUrl: string,
): Promise<void> {
  const connectionArgs = ["--host", "127.0.0.1", "--port", String(port), "--username", "postgres"];

  await runCommand(binaries.dropdb, [...connectionArgs, "--if-exists", dbName], "dropdb");
  await runCommand(binaries.createdb, [...connectionArgs, dbName], "createdb");
  await runCommand(
    binaries.pgRestore,
    ["--dbname", localUrl, "--clean", "--if-exists", "--no-owner", "--no-privileges", snapshotFile],
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
      .filter((entry) => entry.endsWith(".dump"))
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

async function writeMetadata(paths: Paths, localUrl: string, sourceUrl: string, snapshotFile: string): Promise<void> {
  const payload = {
    updatedAt: new Date().toISOString(),
    localUrl,
    source: maskConnectionString(sourceUrl),
    snapshot: path.basename(snapshotFile),
    connectionFile: path.relative(process.cwd(), paths.connectionFile),
  };

  await fsPromises.writeFile(paths.metadataFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fsPromises.writeFile(paths.connectionFile, `${localUrl}\n`, "utf8");
}

async function main(): Promise<void> {
  loadEnvironment();
  const options = applyDefaults(parseArgs(process.argv.slice(2)));
  const binaries = resolvePgBinaries();
  const paths = resolvePaths(options.storeRoot);

  await ensureDirectories(paths);
  const clusterInitialized = await initializeCluster(binaries, paths);
  if (clusterInitialized) {
    console.log(`[local-db] Initialized new Postgres cluster at ${paths.clusterDir}`);
  }

  if (!options.skipStart) {
    const started = await startCluster(binaries, paths, options.port);
    if (started) {
      console.log(`[local-db] Started local Postgres on port ${options.port}`);
    }
  } else if (!(await clusterRunning(binaries, paths))) {
    throw new Error("Local Postgres is not running. Remove --skip-start or start the cluster manually before syncing.");
  }

  await waitForReady(binaries, options.port);

  const sourceUrl = resolveSourceUrl(options);
  const dbName = extractDatabaseName(sourceUrl);
  const localUrl = `postgresql://127.0.0.1:${options.port}/${dbName}`;

  if (options.skipSync) {
    await writeMetadata(paths, localUrl, sourceUrl, "");
    console.log(`[local-db] Local fallback ready on ${localUrl} (sync skipped).`);
    console.log(`[local-db] Set DATABASE_LOCAL_URL=${localUrl} or DATABASE_LOCAL_URL_FILE=${paths.connectionFile}`);
    return;
  }

  const snapshotFile = await createSnapshot(binaries, sourceUrl, paths, dbName);
  await restoreSnapshot(binaries, snapshotFile, dbName, options.port, localUrl);
  await pruneSnapshots(paths, options.retention);
  await writeMetadata(paths, localUrl, sourceUrl, snapshotFile);

  console.log(`[local-db] Local fallback synchronized from ${maskConnectionString(sourceUrl)}.`);
  console.log(`[local-db] Connection string written to ${path.relative(process.cwd(), paths.connectionFile)}`);
  console.log(`[local-db] Set DATABASE_LOCAL_URL=${localUrl} or point DATABASE_LOCAL_URL_FILE to that path.`);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[local-db] bootstrap failed: ${message}`);
  process.exitCode = 1;
});
