import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { config as loadEnv } from "dotenv";

interface Options {
  envFile?: string;
  outputDir: string;
  label: string;
  dryRun: boolean;
  pgDumpPath: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    outputDir: "backups",
    label: "prod",
    dryRun: false,
    pgDumpPath: process.env.PG_DUMP_PATH || "pg_dump",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--env-file":
        options.envFile = argv[++i];
        break;
      case "--output-dir":
        options.outputDir = argv[++i] || options.outputDir;
        break;
      case "--label":
        options.label = (argv[++i] || options.label).toLowerCase();
        break;
      case "--pg-dump-path":
        options.pgDumpPath = argv[++i] || options.pgDumpPath;
        break;
      case "--dry-run":
        options.dryRun = true;
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

function maskConnectionString(connectionString: string): string {
  try {
    const parsed = new URL(connectionString);
    if (parsed.password) {
      parsed.password = "***";
    }
    if (parsed.username) {
      parsed.username = `${parsed.username.slice(0, 1) || "*"}***`;
    }
    return parsed.toString();
  } catch {
    return "<redacted>";
  }
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await ensureEnvLoaded(options.envFile);

  const directUrl = process.env.RENDER_DB_EXTERNAL_URL || process.env.RENDER_DB_INTERNAL_URL;
  if (!directUrl) {
    throw new Error(
      "RENDER_DB_EXTERNAL_URL or RENDER_DB_INTERNAL_URL is required. Provide an env file via --env-file or ensure IG_ENV_FILE is set."
    );
  }

  const timestamp = new Date().toISOString().replace(/[:]/g, "-");
  const fileName = `${options.label}-dex-${timestamp}.dump`;
  const outputDir = path.resolve(options.outputDir);
  const outputPath = path.join(outputDir, fileName);

  await fs.mkdir(outputDir, { recursive: true });

  const maskedUrl = maskConnectionString(directUrl);
  if (options.dryRun) {
    console.log("[DRY-RUN] Would execute pg_dump", {
      command: options.pgDumpPath,
      args: ["--format=custom", "--file", outputPath, "--dbname", maskedUrl],
    });
    return;
  }

  console.log(`Starting pg_dump to ${outputPath}`);
  const child = spawn(options.pgDumpPath, [
    "--format=custom",
    "--file",
    outputPath,
    "--dbname",
    directUrl,
  ], {
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error("Failed to spawn pg_dump:", error.message);
    process.exitCode = 1;
  });

  child.on("close", (code) => {
    if (code === 0) {
      console.log(`Backup complete: ${outputPath}`);
    } else {
      console.error(`pg_dump exited with code ${code}`);
      process.exitCode = code ?? 1;
    }
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
