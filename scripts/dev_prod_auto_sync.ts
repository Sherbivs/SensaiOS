import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { PrismaClient } from "@prisma/client";

type EnvVars = Record<string, string>;

type SyncConfig = {
  devEnvPath: string;
  prodEnvPath: string;
  intervalMs: number;
  once: boolean;
  dryRun: boolean;
  skipStartup: boolean;
};

type CountSnapshot = {
  species: number;
  moves: number;
  abilities: number;
  learnsets: number;
  hash: string;
};

const DEFAULT_DEV_ENV = "C:/Users/sherb/OneDrive/Documents/Key/Dev/.env";
const DEFAULT_PROD_ENV = "C:/Users/sherb/OneDrive/Documents/Key/Prod/.env";
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function log(message: string, context: Record<string, unknown> = {}): void {
  const payload = {
    timestamp: new Date().toISOString(),
    message,
    ...context,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

function parseArgs(): SyncConfig {
  const args = process.argv.slice(2);
  const config: SyncConfig = {
    devEnvPath: DEFAULT_DEV_ENV,
    prodEnvPath: DEFAULT_PROD_ENV,
    intervalMs: DEFAULT_INTERVAL_MS,
    once: false,
    dryRun: false,
    skipStartup: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--dev-env":
        config.devEnvPath = args[++i] ?? config.devEnvPath;
        break;
      case "--prod-env":
        config.prodEnvPath = args[++i] ?? config.prodEnvPath;
        break;
      case "--interval":
        config.intervalMs = Number.parseInt(args[++i] ?? "", 10) || config.intervalMs;
        break;
      case "--once":
        config.once = true;
        break;
      case "--dry-run":
        config.dryRun = true;
        break;
      case "--skip-startup":
        config.skipStartup = true;
        break;
      default:
        break;
    }
  }

  return config;
}

function stripQuotes(value: string): string {
  if (!value) return value;
  const trimmed = value.trim();
  const first = trimmed.at(0);
  if ((first === '"' || first === "'") && trimmed.endsWith(first)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function readEnvFile(filePath: string): Promise<EnvVars> {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const exists = await fs
    .access(absolutePath)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    throw new Error(`Environment file not found: ${absolutePath}`);
  }

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

function buildChildEnv(
  envPath: string,
  fileVars: EnvVars,
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  const base: Record<string, string> = {};
  for (const [key, value] of Object.entries(fileVars)) {
    if (value !== undefined) {
      base[key] = value;
    }
  }

  base.IG_ENV_FILE = envPath;

  const flatOverrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      flatOverrides[key] = value;
    }
  }

  return {
    ...process.env,
    ...base,
    ...flatOverrides,
  };
}

const COMMAND_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function spawnCommand(
  label: string,
  command: string,
  args: string[],
  dryRun: boolean,
  env: NodeJS.ProcessEnv,
  timeoutMs: number = COMMAND_TIMEOUT_MS,
): Promise<void> {
  if (dryRun) {
    log("dry-run: skipping command", { label, command, args });
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    log("command.start", { label, command, args });
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env,
    });

    const timer = setTimeout(() => {
      log("command.timeout", { label, command, args, timeoutMs });
      try {
        child.kill("SIGTERM");
      } catch (error) {
        log("command.timeout.error", {
          label,
          command,
          args,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch (error) {
          log("command.timeout.kill_error", {
            label,
            command,
            args,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }, 2_000);
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      log("command.error", { label, error: error.message });
      reject(error);
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        log("command.success", { label, command, args });
        resolve();
      } else {
        const message = `Command "${command} ${args.join(" ")}" failed with code ${code}`;
        log("command.failure", { label, command, args, code });
        reject(new Error(message));
      }
    });
  });
}

function cliEnvForMigrate(fileVars: EnvVars): Record<string, string | undefined> {
  const direct =
    fileVars.DATABASE_DIRECT_URL || fileVars.DIRECT_URL || fileVars.DATABASE_URL || undefined;
  if (!direct) {
    log("migrate.env.missing_direct", {
      message: "DATABASE_DIRECT_URL (or DIRECT_URL/DATABASE_URL) missing; migrate may fail",
    });
  } else if (direct.startsWith("prisma+")) {
    log("migrate.env.dataproxy_warning", {
      message:
        "DATABASE_DIRECT_URL resolves to a Prisma Data Proxy URL; migrations require a direct Postgres connection.",
    });
  }
  return {
    DATABASE_URL: direct,
    PRISMA_CLIENT_ENGINE_TYPE: "",
  };
}

function cliEnvForSeed(fileVars: EnvVars): Record<string, string | undefined> {
  const runtimeUrl = fileVars.DATABASE_URL || "";
  const isDataProxy = runtimeUrl.startsWith("prisma+");
  return {
    PRISMA_CLIENT_ENGINE_TYPE: isDataProxy ? "dataproxy" : "",
  };
}

async function runPhase(
  name: "dev" | "prod",
  envPath: string,
  envVars: EnvVars,
  dryRun: boolean,
): Promise<void> {
  const migrateEnv = buildChildEnv(envPath, envVars, cliEnvForMigrate(envVars));
  const seedEnv = buildChildEnv(envPath, envVars, cliEnvForSeed(envVars));

  await spawnCommand(`${name}:migrate`, "npx", ["prisma", "migrate", "deploy"], dryRun, migrateEnv);
  await spawnCommand(`${name}:seed`, "npm", ["run", "db:seed:dex"], dryRun, seedEnv);
}

async function preflightOptimize(envVars: EnvVars): Promise<void> {
  const url = envVars.OPTIMIZE_DATABASE_URL || envVars.OPTIMIZE_DIRECT_URL;
  if (!url) return;

  const targetVars: EnvVars = {
    DATABASE_URL: url,
    DATABASE_DIRECT_URL: url,
  };

  await withPrismaClient("prod", targetVars, async (client) => {
    try {
      await client.$queryRawUnsafe('SELECT 1 FROM "SpeciesSheet" LIMIT 1');
      log("preflight.optimize.ok", { message: "Optimize DB SpeciesSheet readable." });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("preflight.optimize.fail", {
        message: "Optimize DB SpeciesSheet access failed.",
        error: message,
        remediation: [
          'GRANT USAGE ON SCHEMA public TO <app_user>;',
          'GRANT SELECT ON MATERIALIZED VIEW public."SpeciesSheet" TO <app_user>;',
        ],
      });
    }
  });
}

async function withPrismaClient<T>(
  label: "dev" | "prod",
  envVars: EnvVars,
  callback: (client: PrismaClient) => Promise<T>,
): Promise<T> {
  const url = envVars.DATABASE_DIRECT_URL ?? envVars.DATABASE_URL;
  if (!url) {
    throw new Error(`Missing DATABASE_URL/DATABASE_DIRECT_URL for ${label} environment`);
  }

  const originalEngine = process.env.PRISMA_CLIENT_ENGINE_TYPE;
  if (url.startsWith("prisma+postgres://")) {
    process.env.PRISMA_CLIENT_ENGINE_TYPE = "dataproxy";
  } else if (!originalEngine) {
    delete process.env.PRISMA_CLIENT_ENGINE_TYPE;
  }

  const client = new PrismaClient({
    datasources: {
      db: { url },
    },
  });

  try {
    return await callback(client);
  } finally {
    await client.$disconnect();
    if (originalEngine === undefined) {
      delete process.env.PRISMA_CLIENT_ENGINE_TYPE;
    } else {
      process.env.PRISMA_CLIENT_ENGINE_TYPE = originalEngine;
    }
  }
}

async function captureCounts(label: "dev" | "prod", envVars: EnvVars): Promise<CountSnapshot> {
  return withPrismaClient(label, envVars, async (client) => {
    const [species, moves, abilities, learnsets] = await Promise.all([
      client.species.count(),
      client.move.count(),
      client.ability.count(),
      client.speciesLearnset.count(),
    ]);

    return {
      species,
      moves,
      abilities,
      learnsets,
      hash: `${species}:${moves}:${abilities}:${learnsets}`,
    };
  });
}

function diffCounts(devCounts: CountSnapshot, prodCounts: CountSnapshot): Record<string, number> {
  return {
    species: prodCounts.species - devCounts.species,
    moves: prodCounts.moves - devCounts.moves,
    abilities: prodCounts.abilities - devCounts.abilities,
    learnsets: prodCounts.learnsets - devCounts.learnsets,
  };
}

async function runConsolidation(
  config: SyncConfig,
  reason: string,
  devVars: EnvVars,
  prodVars: EnvVars,
): Promise<{ devCounts: CountSnapshot; prodCounts: CountSnapshot }> {
  log("sync.consolidate.start", { dryRun: config.dryRun, reason });

  await runPhase("dev", config.devEnvPath, devVars, config.dryRun);
  await runPhase("prod", config.prodEnvPath, prodVars, config.dryRun);

  const [devCounts, prodCounts] = await Promise.all([
    captureCounts("dev", devVars),
    captureCounts("prod", prodVars),
  ]);

  const delta = diffCounts(devCounts, prodCounts);
  log("sync.consolidate.counts", { devCounts, prodCounts, delta, reason });

  if (delta.species !== 0 || delta.moves !== 0 || delta.abilities !== 0 || delta.learnsets !== 0) {
    log("sync.consolidate.warning", {
      message: "Detected count drift between environments after consolidation.",
      reason,
      delta,
    });
  } else {
    log("sync.consolidate.success", { message: "Dev and Prod counts aligned after sync.", reason });
  }

  return { devCounts, prodCounts };
}

async function main(): Promise<void> {
  const config = parseArgs();
  const devVars = await readEnvFile(config.devEnvPath);
  const prodVars = await readEnvFile(config.prodEnvPath);

  log("sync.config", {
    devEnv: config.devEnvPath,
    prodEnv: config.prodEnvPath,
    intervalMs: config.intervalMs,
    once: config.once,
    dryRun: config.dryRun,
    skipStartup: config.skipStartup,
  });

  try {
    await preflightOptimize(prodVars);
  } catch (error) {
    log("preflight.optimize.error", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const history: { dev: CountSnapshot | null; prod: CountSnapshot | null } = {
    dev: null,
    prod: null,
  };
  let baselineCaptured = false;

  if (!config.skipStartup) {
    try {
      const startupCounts = await runConsolidation(config, "startup", devVars, prodVars);
      history.dev = startupCounts.devCounts;
      history.prod = startupCounts.prodCounts;
      baselineCaptured = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("sync.consolidate.error", { reason: "startup", message });
    }
  }

  while (true) {
    const cycleStartedAt = Date.now();
    try {
      const [devCounts, prodCounts] = await Promise.all([
        captureCounts("dev", devVars),
        captureCounts("prod", prodVars),
      ]);

      log("integrity.check", { devCounts, prodCounts });

      const delta = diffCounts(devCounts, prodCounts);
      const driftDetected =
        delta.species !== 0 || delta.moves !== 0 || delta.abilities !== 0 || delta.learnsets !== 0;

      if (!baselineCaptured) {
        if (driftDetected) {
          const consolidated = await runConsolidation(config, "drift_detected", devVars, prodVars);
          history.dev = consolidated.devCounts;
          history.prod = consolidated.prodCounts;
        } else {
          history.dev = devCounts;
          history.prod = prodCounts;
          log("integrity.baseline", { message: "Baseline captured; monitoring for drift." });
        }
        baselineCaptured = true;
      } else {
        const devChanged =
          history.dev !== null && history.dev.hash !== devCounts.hash;
        const prodChanged =
          history.prod !== null && history.prod.hash !== prodCounts.hash;

        let latestDevCounts = devCounts;
        let latestProdCounts = prodCounts;

        if (driftDetected || devChanged || prodChanged) {
          log("integrity.trigger", {
            reason: driftDetected ? "drift_detected" : "state_changed",
            delta,
            devChanged,
            prodChanged,
          });
          const consolidated = await runConsolidation(
            config,
            driftDetected ? "drift_detected" : "state_changed",
            devVars,
            prodVars,
          );
          latestDevCounts = consolidated.devCounts;
          latestProdCounts = consolidated.prodCounts;
        } else {
          log("integrity.ok", { message: "No action required; counts aligned." });
        }

        history.dev = latestDevCounts;
        history.prod = latestProdCounts;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("integrity.error", { message });
    }

    if (config.once) {
      break;
    }

    const elapsedMs = Date.now() - cycleStartedAt;
    const waitMs = Math.max(config.intervalMs - elapsedMs, 5_000);
    log("integrity.sleep", { waitMs });
    await delay(waitMs);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  log("sync.fatal", { message });
  process.exitCode = 1;
});
