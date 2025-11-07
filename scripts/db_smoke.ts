import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { Client as PgClient } from "pg";

type ConnectionMode = "accelerate" | "direct";

interface SmokeOptions {
  modeOverride?: ConnectionMode;
  command?: string;
}

function parseArgs(argv: string[]): SmokeOptions {
  const options: SmokeOptions = {};
  const rest: string[] = [];

  for (const arg of argv) {
    if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length).toLowerCase();
      if (value === "accelerate" || value === "direct") {
        options.modeOverride = value;
      } else {
        console.warn(`[db-smoke] Ignoring unknown mode '${value}'. Expected 'direct' or 'accelerate'.`);
      }
      continue;
    }

    rest.push(arg);
  }

  options.command = rest[0];
  return options;
}

function envTruthy(value: string | undefined | null): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function loadEnvironment(): void {
  const overrideCandidates = [process.env.IG_ENV_FILE, process.env.DOTENV_CONFIG_PATH]
    .map((candidate) => (candidate ? candidate.trim() : ""))
    .filter(Boolean);

  for (const candidate of overrideCandidates) {
    const candidatePath = path.isAbsolute(candidate) ? candidate : path.join(process.cwd(), candidate);

    if (!fs.existsSync(candidatePath)) {
      continue;
    }

    const result = dotenv.config({ path: candidatePath, override: true });
    if (!result.error) {
      return;
    }
  }

  const nodeEnv = (process.env.NODE_ENV ?? "").toLowerCase();
  const isProd = nodeEnv === "production" || nodeEnv === "prod";
  const allowRepoFallback = envTruthy(process.env.IG_ALLOW_REPO_ENV ?? process.env.ALLOW_REPO_ENV);

  if (!isProd || allowRepoFallback) {
    const result = dotenv.config({ override: true });
    if (!result.error) {
      return;
    }
  }

  console.warn("[db-smoke] No environment file loaded; ensure IG_ENV_FILE or DOTENV_CONFIG_PATH points to a secrets file.");
}

function selectDatasource(preferredMode?: ConnectionMode): { url: string; mode: ConnectionMode } {
  const acceleratePrefixes = ["prisma://", "prisma+postgres://"];

  const directCandidates = [
    process.env.PROD_DATABASE_URL ?? "",
    process.env.DEV_DATABASE_URL ?? "",
    process.env.RENDER_DB_INTERNAL_URL ?? "",
    process.env.RENDER_DB_EXTERNAL_URL ?? "",
    process.env.DATABASE_LOCAL_URL ?? "",
    process.env.DATABASE_URL ?? "",
  ];
  const directUrl = directCandidates.find((candidate) =>
    candidate.trim().length > 0 && !acceleratePrefixes.some((prefix) => candidate.startsWith(prefix)),
  );

  const accelerateCandidates = [
    process.env.DATABASE_URL ?? "",
  ];
  const accelerateUrl = accelerateCandidates.find((candidate) =>
    acceleratePrefixes.some((prefix) => candidate.startsWith(prefix)),
  );

  if (preferredMode === "accelerate") {
    if (accelerateUrl) {
      return { url: accelerateUrl, mode: "accelerate" };
    }
    console.warn("[db-smoke] Accelerate mode requested but no prisma:// datasource found; falling back to direct, if available.");
  }

  if (preferredMode === "direct") {
    if (directUrl) {
      return { url: directUrl, mode: "direct" };
    }
    console.warn("[db-smoke] Direct mode requested but no postgres:// datasource found; falling back to accelerate, if available.");
  }

  if (directUrl) {
    return { url: directUrl, mode: "direct" };
  }

  if (accelerateUrl) {
    return { url: accelerateUrl, mode: "accelerate" };
  }

  throw new Error(
    "PROD_DATABASE_URL, DEV_DATABASE_URL, DATABASE_URL, RENDER_DB_INTERNAL_URL, RENDER_DB_EXTERNAL_URL, or DATABASE_LOCAL_URL must be set for db:smoke. Ensure the secrets file is loaded.",
  );
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url.replace(/^prisma\+postgres:\/\//, "postgres://"));
    return `${parsed.protocol}//***@${parsed.host}`;
  } catch {
    return "(unavailable)";
  }
}

async function runAccelerate(url: string, command: string | undefined): Promise<void> {
  process.env.PRISMA_CLIENT_ENGINE_TYPE = "dataproxy";
  process.env.PRISMA_CLIENT_DATAPROXY = "true";
  const prisma = new PrismaClient({ datasourceUrl: url })
    .$extends(withAccelerate()) as unknown as PrismaClient;

  try {
    if (command === "count-pokemon") {
      const count = await prisma.pokemonInstance.count();
      console.log(`cachedPokemonCount=${count}`);
      return;
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ ok: number }>>("SELECT 1 AS ok");
    console.log("Accelerate query result:", rows);
  } finally {
    await prisma.$disconnect();
  }
}

async function runDirect(url: string, command: string | undefined): Promise<void> {
  process.env.PRISMA_CLIENT_ENGINE_TYPE = "library";
  process.env.PRISMA_CLIENT_DATAPROXY = "false";
  const client = new PgClient({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    if (command === "count-pokemon") {
      const result = await client.query<{ count: string }>(
        'SELECT COUNT(*)::bigint AS count FROM "PokemonInstance"',
      );
      const count = result.rows[0]?.count ?? "0";
      console.log(`cachedPokemonCount=${count}`);
      return;
    }

    const result = await client.query("SELECT 1 AS ok");
    console.log("Direct query result:", result.rows);
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  loadEnvironment();
  const envMode = (process.env.DB_SMOKE_MODE ?? "").toLowerCase();
  const modeOverride = envMode === "direct" || envMode === "accelerate" ? (envMode as ConnectionMode) : undefined;
  const { modeOverride: cliModeOverride, command } = parseArgs(process.argv.slice(2));
  const datasource = selectDatasource(cliModeOverride ?? modeOverride);

  console.log(`[db-smoke] Using ${datasource.mode} datasource ${maskUrl(datasource.url)}`);

  if (datasource.mode === "accelerate") {
    await runAccelerate(datasource.url, command);
  } else {
    await runDirect(datasource.url, command);
  }
}

main().catch((error) => {
  console.error("[db-smoke] Smoke check failed", error);
  process.exit(1);
});
