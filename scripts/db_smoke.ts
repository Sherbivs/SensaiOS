import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as dotenv from "dotenv";
import { Client as PgClient } from "pg";

interface SmokeOptions {
  command?: string;
}

function parseArgs(argv: string[]): SmokeOptions {
  const options: SmokeOptions = {};
  options.command = argv[0];
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

function selectDatasource(): string {
  // 2-NODE CLUSTER: Only support direct PostgreSQL connections
  const directCandidates = [
    process.env.PROD_DATABASE_URL ?? "",
    process.env.DEV_DATABASE_URL ?? "",
    process.env.RENDER_DB_INTERNAL_URL ?? "",
    process.env.RENDER_DB_EXTERNAL_URL ?? "",
    process.env.DATABASE_LOCAL_URL ?? "",
    process.env.DATABASE_URL ?? "",
  ];
  
  const directUrl = directCandidates.find((candidate) => candidate.trim().length > 0);

  if (directUrl) {
    return directUrl;
  }

  throw new Error(
    "PROD_DATABASE_URL, DEV_DATABASE_URL, DATABASE_URL, RENDER_DB_INTERNAL_URL, RENDER_DB_EXTERNAL_URL, or DATABASE_LOCAL_URL must be set for db:smoke. Ensure the secrets file is loaded.",
  );
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//***@${parsed.host}`;
  } catch {
    return "(unavailable)";
  }
}

async function runDirect(url: string, command: string | undefined): Promise<void> {
  // 2-NODE CLUSTER: Always use library engine for direct PostgreSQL
  process.env.PRISMA_CLIENT_ENGINE_TYPE = "library";
  delete process.env.PRISMA_CLIENT_DATAPROXY;
  
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
  const { command } = parseArgs(process.argv.slice(2));
  const datasource = selectDatasource();

  console.log(`[db-smoke] Using direct PostgreSQL datasource ${maskUrl(datasource)}`);
  await runDirect(datasource, command);
}

main().catch((error) => {
  console.error("[db-smoke] Smoke check failed", error);
  process.exit(1);
});
