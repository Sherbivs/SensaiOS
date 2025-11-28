import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFile, spawn } from "node:child_process";
import * as dotenv from "dotenv";
import { extractDatabaseName } from "../../src/shared/utils/url-utils.js";

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
    console.warn("[onpremise-dev] No environment file loaded. Set IG_ENV_FILE or DOTENV_CONFIG_PATH before running this helper.");
  }
}

function buildPaths(storeRoot: string): Paths {
  const dbRoot = path.join(storeRoot, "onpremise-dev-primary");
  return {
    storeRoot,
    dbRoot,
    clusterDir: path.join(dbRoot, "onpremise-cluster"),
    snapshotsDir: path.join(dbRoot, "snapshots"),
    logFile: path.join(dbRoot, "onpremise-postgres.log"),
    connectionFile: path.join(dbRoot, "onpremise-url.txt"),
    metadataFile: path.join(dbRoot, "onpremise-metadata.json"),
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
  const versions = ["18", "17", "16"];

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
      console.warn(
        `[onpremise-dev] Skipping Postgres bin directory without share/: ${normalized}. Run "npm run ops:auto-bootstrap-local-db" to install a complete toolchain.`,
      );
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
      "Unable to locate Postgres binaries with a share directory. Set PG_BIN_DIR manually or run \"npm run ops:auto-bootstrap-local-db\" to install dependencies.",
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
    console.log(`[onpremise-dev] ${label}: ${command} ${args.join(" ")}`);
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
  await runCommand(
    binaries.initdb,
    [
      "-D",
      paths.clusterDir,
      "--username",
      "postgres",
      "--auth=trust",
      "--encoding=UTF8",
      "--locale=C",
    ],
    "initdb",
  );
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

  const explicit = process.env.RENDER_DB_EXTERNAL_URL?.trim() || process.env.RENDER_DB_INTERNAL_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const primary = process.env.DATABASE_URL?.trim();
  if (primary && /^postgres(?:ql)?:\/\//i.test(primary)) {
    return primary;
  }

  throw new Error(
    "No PostgreSQL source URL available. Set RENDER_DB_EXTERNAL_URL, RENDER_DB_INTERNAL_URL, provide --source=postgres://..., or populate DATABASE_URL with a direct connection string before running this script.",
  );
}

// extractDatabaseName now imported from shared/utils/url-utils.ts (centralized)

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
  const paths = buildPaths(options.storeRoot);

  await ensureDirectories(paths);
  const clusterInitialized = await initializeCluster(binaries, paths);
  if (clusterInitialized) {
    console.log(`[onpremise-dev] Initialized new Postgres cluster at ${paths.clusterDir}`);
  }

  if (!options.skipStart) {
    const started = await startCluster(binaries, paths, options.port);
    if (started) {
      console.log(`[onpremise-dev] Started local Postgres on port ${options.port}`);
    }
  } else if (!(await clusterRunning(binaries, paths))) {
    throw new Error("Local Postgres is not running. Remove --skip-start or start the cluster manually before syncing.");
  }

  await waitForReady(binaries, options.port);

  const sourceUrl = resolveSourceUrl(options);
  const dbName = extractDatabaseName(sourceUrl);
  if (!dbName) {
    throw new Error(`Failed to extract database name from source URL: ${sourceUrl}`);
  }
  const localUrl = `postgresql://postgres@127.0.0.1:${options.port}/${dbName}`;

  if (options.skipSync) {
    await writeMetadata(paths, localUrl, sourceUrl, "");
    console.log(`[onpremise-dev] Local fallback ready on ${localUrl} (sync skipped).`);
    console.log(`[onpremise-dev] Set DATABASE_ONPREMISE_DEV_PRIMARY=${localUrl} or DATABASE_LOCAL_URL_FILE=${paths.connectionFile}`);
    console.log(`[onpremise-dev] (Legacy: DATABASE_LOCAL_URL is deprecated, use DATABASE_ONPREMISE_DEV_PRIMARY)`);
    return;
  }

  const snapshotFile = await createSnapshot(binaries, sourceUrl, paths, dbName);
  await restoreSnapshot(binaries, snapshotFile, dbName, options.port, localUrl);
  await pruneSnapshots(paths, options.retention);
  await writeMetadata(paths, localUrl, sourceUrl, snapshotFile);

  console.log(`[onpremise-dev] Local fallback synchronized from ${maskConnectionString(sourceUrl)}.`);
  console.log(`[onpremise-dev] Connection string written to ${path.relative(process.cwd(), paths.connectionFile)}`);
  console.log(`[onpremise-dev] Set DATABASE_ONPREMISE_DEV_PRIMARY=${localUrl} or point DATABASE_LOCAL_URL_FILE to that path.`);
  console.log(`[onpremise-dev] (Legacy: DATABASE_LOCAL_URL is deprecated, use DATABASE_ONPREMISE_DEV_PRIMARY)`);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[onpremise-dev] bootstrap failed: ${message}`);
  process.exitCode = 1;
});
