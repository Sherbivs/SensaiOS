import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { checkMirrors, redactConnectionString } from "./check_db_redundancy.js";
import { stripQuotes } from "../src/shared/utils/format-utils.js";
import { getErrorMessage } from "../src/shared/utils/error-utils.js";

type EnvVars = Record<string, string>;

type RunnerConfig = {
  devEnvPath: string;
  prodEnvPath: string;
  dryRun: boolean;
};

type ConnectionSet = {
  direct?: string;
  pooled?: string;
};

type MirrorPair = {
  label: string;
  primary: string;
  standby: string;
};

const DEFAULT_DEV_ENV = "C:/Users/sherb/OneDrive/Documents/Key/Dev/.env";
const DEFAULT_PROD_ENV = "C:/Users/sherb/OneDrive/Documents/Key/Prod/.env";

function log(event: string, context: Record<string, unknown> = {}): void {
  // JSON logging keeps the automation output machine-readable.
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event, ...context }));
}

// Helper function stripQuotes removed - now imported from centralized format-utils.ts

async function loadEnvVars(envPath: string): Promise<EnvVars> {
}

function resolvePath(targetPath: string): string {
  return path.isAbsolute(targetPath) ? targetPath : path.join(process.cwd(), targetPath);
}

// Helper function stripQuotes removed - using centralized version from format-utils.ts

async function readEnvFile(filePath: string): Promise<EnvVars> {
  const absolutePath = resolvePath(filePath);
  const contents = await fs.readFile(absolutePath, "utf8");
  const vars: EnvVars = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    const rawVal = line.slice(idx + 1).trim();
    vars[key] = stripQuotes(rawVal);
  }

  return vars;
}

function parseArgs(): RunnerConfig {
  const args = process.argv.slice(2);
  const config: RunnerConfig = {
    devEnvPath: DEFAULT_DEV_ENV,
    prodEnvPath: DEFAULT_PROD_ENV,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--dev-env":
        config.devEnvPath = args[i + 1] ?? config.devEnvPath;
        i += 1;
        break;
      case "--prod-env":
        config.prodEnvPath = args[i + 1] ?? config.prodEnvPath;
        i += 1;
        break;
      case "--dry-run":
        config.dryRun = true;
        break;
      default:
        break;
    }
  }

  return config;
}

function looksLikeDirect(url: string | undefined): boolean {
  return !!url && url.startsWith("postgres");
}

function extractConnections(envVars: EnvVars): ConnectionSet {
  // UNIFIED ARCHITECTURE: Only direct PostgreSQL connections (no Accelerate)
  const direct = [
    envVars.PROD_DATABASE_URL,
    envVars.RENDER_DB_INTERNAL_URL,
    envVars.RENDER_DB_EXTERNAL_URL,
    envVars.DIRECT_URL,
    looksLikeDirect(envVars.DATABASE_URL) ? envVars.DATABASE_URL : undefined,
  ].find((candidate): candidate is string => !!candidate && looksLikeDirect(candidate));

  const pooled = [
    envVars.DATABASE_URL,
    looksLikeDirect(envVars.DATABASE_URL) ? envVars.DATABASE_URL : undefined,
  ].find((candidate): candidate is string => !!candidate && looksLikeDirect(candidate));

  return { direct, pooled };
}

async function main(): Promise<void> {
  const config = parseArgs();
  log("mirror.config", config);

  const [devVars, prodVars] = await Promise.all([
    readEnvFile(config.devEnvPath),
    readEnvFile(config.prodEnvPath),
  ]);

  const devConnections = extractConnections(devVars);
  const prodConnections = extractConnections(prodVars);

  const pairs: MirrorPair[] = [];
  const seen = new Set<string>();

  const registerPair = (label: string, primary?: string, standby?: string) => {
    if (!primary || !standby) {
      log("mirror.skip", { label, reason: "missing_connection" });
      return;
    }
    if (primary === standby) {
      log("mirror.skip", { label, reason: "identical_connections" });
      return;
    }
    const key = `${primary}::${standby}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ label, primary, standby });
  };

  // UNIFIED ARCHITECTURE: Only compare direct PostgreSQL connections
  registerPair("dev:pooled-vs-direct", devConnections.pooled, devConnections.direct);
  registerPair("prod:pooled-vs-direct", prodConnections.pooled, prodConnections.direct);
  registerPair("cross:dev-direct-vs-prod-direct", devConnections.direct, prodConnections.direct);

  if (pairs.length === 0) {
    log("mirror.none", { message: "No mirror pairs could be derived." });
    return;
  }

  log("mirror.plan", {
    pairs: pairs.map((pair) => ({
      label: pair.label,
      primary: redactConnectionString(pair.primary),
      standby: redactConnectionString(pair.standby),
    })),
    dryRun: config.dryRun,
  });

  if (config.dryRun) {
    log("mirror.dry_run", { message: "Dry run complete; no checks executed." });
    return;
  }

  let allOk = true;
  for (const pair of pairs) {
    try {
      const ok = await checkMirrors(pair.primary, pair.standby, pair.label);
      if (!ok) {
        allOk = false;
      }
    } catch (error) {
      const message = getErrorMessage(error);
      log("mirror.error", { label: pair.label, message });
      allOk = false;
    }
  }

  if (!allOk) {
    process.exitCode = 1;
  }
}

const modulePath = pathToFileURL(process.argv[1] ?? "").href;

if (import.meta.url === modulePath) {
  main().catch((error) => {
    log("mirror.error", { message: getErrorMessage(error) });
    process.exitCode = 1;
  });
}
