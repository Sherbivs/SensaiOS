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
    const [key, ...rest] = line.split("=");
    if (!key) continue;
    vars[key.trim()] = rest.join("=").trim();
  }

  return vars;
}

function spawnCommand(
  label: string,
  envPath: string,
  command: string,
  args: string[],
  dryRun: boolean,
  extraEnv: Record<string, string | undefined> = {},
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
      env: {
        ...process.env,
        IG_ENV_FILE: envPath,
        ...extraEnv,
      },
    });

    child.on("error", (error) => {
      log("command.error", { label, error: error.message });
      reject(error);
    });

    child.on("exit", (code) => {
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

async function runPhase(
  name: "dev" | "prod",
  envPath: string,
  dryRun: boolean,
): Promise<void> {
  const extraEnv =
    name === "prod"
      ? {
          PRISMA_CLIENT_ENGINE_TYPE: "dataproxy",
        }
      : {
          PRISMA_CLIENT_ENGINE_TYPE: "",
        };

  await spawnCommand(`${name}:migrate`, envPath, "npx", ["prisma", "migrate", "deploy"], dryRun, extraEnv);
  await spawnCommand(`${name}:seed`, envPath, "npm", ["run", "db:seed:dex"], dryRun, extraEnv);
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

  await runPhase("dev", config.devEnvPath, config.dryRun);
  await runPhase("prod", config.prodEnvPath, config.dryRun);

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
