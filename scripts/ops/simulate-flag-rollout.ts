import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { config as loadEnv } from "dotenv";
import fetch from "node-fetch";
import { printInfo, printSuccess, printWarning, printError, formatKeyValueList } from '../../src/utils/output-formatter.js';

interface Options {
  envFile?: string;
  flag: string;
  percent?: number;
  cohort: string;
  windowDate?: string;
  effective?: string;
  note?: string;
  outputDir: string;
  dryRun: boolean;
  configUrl?: string;
  apply: boolean;
}

interface FlagPlan {
  flag: string;
  percent: number;
  cohort: string;
  requestedAt: string;
  requestedBy: string;
  windowDate?: string;
  effective?: string;
  note?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    flag: "DEX_V2_ENABLED",
    cohort: "global",
    outputDir: path.resolve("ops/flag-plans"),
    dryRun: false,
    apply: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--env-file":
        options.envFile = argv[++i];
        break;
      case "--flag":
        options.flag = argv[++i] || options.flag;
        break;
      case "--percent":
        options.percent = Number(argv[++i]);
        break;
      case "--cohort":
        options.cohort = argv[++i] || options.cohort;
        break;
      case "--window-date":
        options.windowDate = argv[++i];
        break;
      case "--effective":
        options.effective = argv[++i];
        break;
      case "--note":
        options.note = argv[++i];
        break;
      case "--output-dir":
        options.outputDir = path.resolve(argv[++i] || options.outputDir);
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--config-url":
        options.configUrl = argv[++i];
        break;
      case "--apply":
        options.apply = true;
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown argument: ${arg}`);
        }
        break;
    }
  }

  return options;
}

async function ensureEnvLoaded(envFile?: string) {
  if (envFile) {
    loadEnv({ path: envFile, override: true });
    return;
  }

  const fallback = process.env.IG_ENV_FILE;
  if (fallback) {
    loadEnv({ path: fallback, override: false });
  }
}

function validateOptions(options: Options) {
  if (typeof options.percent !== "number" || Number.isNaN(options.percent)) {
    throw new Error("--percent is required and must be a number (0-100). Use --dry-run to preview changes.");
  }
  if (options.percent < 0 || options.percent > 100) {
    throw new Error("--percent must be between 0 and 100.");
  }
}

function buildPlan(options: Options): FlagPlan {
  const requestedBy = process.env.USER || process.env.USERNAME || "unknown";
  return {
    flag: options.flag,
    percent: options.percent ?? 0,
    cohort: options.cohort,
    requestedAt: new Date().toISOString(),
    requestedBy,
    windowDate: options.windowDate,
    effective: options.effective,
    note: options.note,
    dryRun: options.dryRun,
  };
}

async function writePlan(plan: FlagPlan, outputDir: string) {
  await fs.mkdir(outputDir, { recursive: true });
  const timestamp = plan.requestedAt.replace(/[:]/g, "-");
  const safeFlag = plan.flag.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
  const suffix = plan.dryRun ? ".dry-run" : "";
  const fileName = `${safeFlag}-${plan.percent}-${timestamp}${suffix}.json`;
  const outputPath = path.join(outputDir, fileName);
  await fs.writeFile(outputPath, JSON.stringify(plan, null, 2), "utf8");
  return outputPath;
}

async function applyPlan(plan: FlagPlan, url: string) {
  if (plan.dryRun) {
    printInfo('[DRY-RUN] Skipping config service apply.');
    return;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Config service returned ${response.status}: ${text}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await ensureEnvLoaded(options.envFile);
  validateOptions(options);

  const plan = buildPlan(options);
  printInfo('Prepared feature flag plan:');
  console.log(formatKeyValueList([
    ['Flag', plan.flag],
    ['Percent', `${plan.percent}%`],
    ['Cohort', plan.cohort],
    ['Window', plan.windowDate ?? '(unspecified)'],
    ['Effective', plan.effective ?? '(unspecified)'],
    ['Dry Run', String(plan.dryRun)],
  ]));

  const outputPath = await writePlan(plan, options.outputDir);
  printSuccess(`Plan file written to ${outputPath}`);

  if (options.apply) {
    const target = options.configUrl || process.env.FLAG_CONFIG_URL;
    if (!target) {
      printWarning('--apply requested without a config service URL (FLAG_CONFIG_URL or --config-url). Holding plan for manual execution.');
      printWarning(`Manual apply reminder: upload ${outputPath} to the configuration console or run the approved request via the on-call procedure.`);
    } else {
      printInfo(`Sending plan to ${target}`);
      await applyPlan(plan, target);
      printSuccess('Config service acknowledged feature flag plan.');
    }
  }

}

main().catch((error) => {
  printError(error.message || String(error));
  process.exitCode = 1;
});
