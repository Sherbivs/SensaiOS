import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { Client as PgClient } from "pg";

const DEFAULT_COUNT_TARGETS = [
  { model: "species", label: "Species" },
  { model: "pokemonInstance", label: "Pokemon Instances" },
  { model: "user", label: "Users" },
  { model: "encounter", label: "Encounters" },
  { model: "battle", label: "Battles" },
];

type CountTargetModel = (typeof DEFAULT_COUNT_TARGETS)[number]["model"];

interface DatasourceConfig {
  url: string;
}

interface DbContext {
  datasource: DatasourceConfig;
  pg?: PgClient;
}

type Command =
  | "status"
  | "counts"
  | "count"
  | "query"
  | "help";

interface ParsedArgs {
  command: Command;
  options: Record<string, string | boolean>;
  rest: string[];
}

function envTruthy(value: string | undefined | null): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function readLocalFallbackUrl(): string {
  // CRITICAL: Prioritize PROD_DATABASE_URL for production operations
  // Fall back to DATABASE_LOCAL_URL for backwards compatibility
  const prodOverride = process.env.PROD_DATABASE_URL?.trim();
  if (prodOverride) {
    return prodOverride;
  }

  const envOverride = process.env.DATABASE_LOCAL_URL?.trim();
  if (envOverride) {
    return envOverride;
  }

  const prodFileOverride = process.env.PROD_DATABASE_URL_FILE?.trim();
  const fileOverride = process.env.DATABASE_LOCAL_URL_FILE?.trim();
  const storeRoot = process.env.IG_STORE_ROOT?.trim() || path.join(process.cwd(), "Store");
  const candidates = [prodFileOverride, fileOverride, path.join(storeRoot, "db", "local-url.txt"), path.join(storeRoot, "db", "local", "url.txt")]
    .filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      const value = fs.readFileSync(candidate, "utf8").trim();
      if (value) {
        return value;
      }
    } catch {
      // Ignore read issues; caller will fall back to remote datasources.
    }
  }

  return "";
}

function loadEnvironment(): void {
  const overrideCandidates = [process.env.IG_ENV_FILE, process.env.DOTENV_CONFIG_PATH]
    .map((candidate) => (candidate ? candidate.trim() : ""))
    .filter(Boolean);

  let loaded = false;

  for (const candidate of overrideCandidates) {
    const candidatePath = path.isAbsolute(candidate)
      ? candidate
      : path.join(process.cwd(), candidate);

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
    const allowRepoFallback = envTruthy(process.env.IG_ALLOW_REPO_ENV ?? process.env.ALLOW_REPO_ENV);
    if (!isProd || allowRepoFallback) {
      const result = dotenv.config();
      if (!result.error) {
        loaded = true;
      }
    } else {
      console.info(
        "[db-admin] Skipping repository .env fallback because NODE_ENV=production. Set IG_ALLOW_REPO_ENV=1 to override.",
      );
    }
  }

  if (!loaded) {
    console.warn(
      "[db-admin] No environment file loaded. Ensure IG_ENV_FILE or DOTENV_CONFIG_PATH points to a valid secrets file.",
    );
  }
}

function resolveDatasource(): DatasourceConfig {
  const primaryUrl = process.env.DATABASE_URL ?? "";
  const renderInternalUrl = process.env.RENDER_DB_INTERNAL_URL ?? "";
  const renderExternalUrl = process.env.RENDER_DB_EXTERNAL_URL ?? "";
  const localUrl = readLocalFallbackUrl();

  // 2-NODE CLUSTER: All connections use direct PostgreSQL (no Accelerate)
  const normalizedPrimary = primaryUrl.toLowerCase();
  const directCandidate =
    renderInternalUrl || renderExternalUrl || (normalizedPrimary.startsWith("postgres://") || normalizedPrimary.startsWith("postgresql://") ? primaryUrl : "");

  if (directCandidate) {
    return { url: directCandidate };
  }

  if (localUrl) {
    return { url: localUrl };
  }

  throw new Error(
    "PROD_DATABASE_URL, DEV_DATABASE_URL, DATABASE_URL, RENDER_DB_INTERNAL_URL, or RENDER_DB_EXTERNAL_URL must be set before running db:cli. Provide DATABASE_LOCAL_URL for offline fallback if remote datasources are unavailable.",
  );
}

function createDbContext(): DbContext {
  const datasource = resolveDatasource();

  // 2-NODE CLUSTER: Always use direct PostgreSQL connection
  process.env.PRISMA_CLIENT_ENGINE_TYPE = "library";
  process.env.PRISMA_CLIENT_DATAPROXY = "false";
  const pg = new PgClient({
    connectionString: datasource.url,
    ssl: { rejectUnauthorized: false },
  });
  return { datasource, pg };
}
function maskDatasource(url: string): string {
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

function parseArgs(argv: string[]): ParsedArgs {
  const [commandRaw, ...restArgs] = argv;
  const command = (commandRaw ?? "help").toLowerCase() as Command;

  const options: Record<string, string | boolean> = {};
  const rest: string[] = [];

  for (const arg of restArgs) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=", 2);
      options[key] = value ?? true;
      continue;
    }
    rest.push(arg);
  }

  return { command, options, rest };
}

async function showStatus(ctx: DbContext): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  const prodUrl = process.env.PROD_DATABASE_URL ?? "";
  const devUrl = process.env.DEV_DATABASE_URL ?? "";
  const renderInternalUrl = process.env.RENDER_DB_INTERNAL_URL ?? "";
  const renderExternalUrl = process.env.RENDER_DB_EXTERNAL_URL ?? "";
  const localUrl = readLocalFallbackUrl();
  
  // 2-NODE CLUSTER: Extract host from direct PostgreSQL URL
  const host = (() => {
    try {
      const parsed = new URL(url.startsWith("postgres") ? url : `https://${url}`);
      return parsed.host;
    } catch {
      return "unknown";
    }
  })();

  console.log("=== Database Status ===");
  console.log(`Active host      : ${host}`);
  console.log(`Engine           : Direct PostgreSQL (2-Node Cluster)`);
  console.log(`NODE_ENV         : ${process.env.NODE_ENV ?? "(not set)"}`);
  console.log(`IG_ENV_FILE      : ${process.env.IG_ENV_FILE ?? "(not set)"}`);
  console.log(`DOTENV_CONFIG_PATH: ${process.env.DOTENV_CONFIG_PATH ?? "(not set)"}`);
  console.log(`DATABASE_URL set : ${url ? "yes" : "no"}`);
  console.log(`PROD_DATABASE_URL set : ${prodUrl ? "yes" : "no"}`);
  console.log(`DEV_DATABASE_URL set : ${devUrl ? "yes" : "no"}`);
  console.log(`RENDER_DB_INTERNAL_URL set : ${renderInternalUrl ? "yes" : "no"}`);
  console.log(`RENDER_DB_EXTERNAL_URL set : ${renderExternalUrl ? "yes" : "no"}`);
  console.log(`DATABASE_LOCAL_URL set  : ${process.env.DATABASE_LOCAL_URL ? "yes" : "no"}`);
  console.log(`Local fallback file     : ${localUrl ? "yes" : "no"}`);
  console.log(`Resolved datasource     : direct ${maskDatasource(ctx.datasource.url)}`);

  try {
    if (ctx.pg) {
      const [speciesResult, userResult] = await Promise.all([
        ctx.pg.query<{ count: string }>('SELECT COUNT(*)::bigint AS count FROM "Species"'),
        ctx.pg.query<{ count: string }>('SELECT COUNT(*)::bigint AS count FROM "User"'),
      ]);
      const speciesCount = speciesResult.rows[0]?.count ?? "0";
      const userCount = userResult.rows[0]?.count ?? "0";
      console.log("--- Sample Counts ---");
      console.log(`Species records  : ${speciesCount}`);
      console.log(`User records     : ${userCount}`);
    }
  } catch (error) {
    console.warn("[db-admin] Failed to read sample counts", error);
  }
}

function toTableName(modelKey: string): string {
  return modelKey.charAt(0).toUpperCase() + modelKey.slice(1);
}

async function showCounts(ctx: DbContext): Promise<void> {
  console.log("=== Table Counts ===");
  for (const target of DEFAULT_COUNT_TARGETS) {
    // 2-NODE CLUSTER: Always use direct PostgreSQL connection
    if (ctx.pg) {
      const tableName = toTableName(target.model);
      const result = await ctx.pg.query<{ count: string }>(
        `SELECT COUNT(*)::bigint AS count FROM "${tableName}"`,
      );
      const count = result.rows[0]?.count ?? "0";
      console.log(`${target.label.padEnd(18)} : ${count}`);
    }
  }
}

async function showCount(ctx: DbContext, modelName: string): Promise<void> {
  // 2-NODE CLUSTER: Always use direct PostgreSQL connection
  if (ctx.pg) {
    const tableName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
    const result = await ctx.pg.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count FROM "${tableName}"`,
    );
    const count = result.rows[0]?.count ?? "0";
    console.log(`${modelName} count: ${count}`);
    return;
  }

  throw new Error("No database client available to run count command.");
}

async function runQuery(ctx: DbContext, sql: string, outputJson: boolean): Promise<void> {
  if (!sql) {
    throw new Error("Query requires SQL text. Example: db:cli query \"SELECT COUNT(*) FROM \"Species\";\"");
  }

  const trimmedSql = sql.trim();
  const isSelect = trimmedSql.toLowerCase().startsWith("select");

  // 2-NODE CLUSTER: Always use direct PostgreSQL connection
  if (ctx.pg) {
    const result = await ctx.pg.query(trimmedSql);

    if (outputJson) {
      console.log(JSON.stringify(result.rows, null, 2));
      return;
    }

    if (result.rows.length > 0) {
      console.table(result.rows);
      return;
    }

    console.log(
      isSelect
        ? "Query returned zero rows."
        : `Query executed successfully (${result.command}, ${result.rowCount ?? 0} rows affected).`,
    );
    return;
  }

  throw new Error("No database client available to run query command.");
}

function printHelp(): void {
  console.log(`Infinity Gauntlet DB Control Suite\n\n`);
  console.log(`Usage:`);
  console.log(`  npm run db:cli [command] [options]`);
  console.log(`\nCommands:`);
  console.log(`  status                Show active connection metadata and sample counts.`);
  console.log(`  counts                Print counts for common tables.`);
  console.log(`  count <Model>         Count records for a specific Prisma model (e.g., Species, User).`);
  console.log(`  query <SQL>           Execute a raw SQL query (read-only recommended).`);
  console.log(`  help                  Show this message.`);
  console.log(`\nOptions:`);
  console.log(`  --json                Output results as JSON (query command).`);
  console.log(`  --table=<Model>       Alias for 'count <Model>'.`);
  console.log(`  --sql="..."           Provide SQL for the query command without quoting.`);
  console.log(`\nEnvironment loading follows IG_ENV_FILE → DOTENV_CONFIG_PATH → repo .env (non-production).`);
}

async function main(): Promise<void> {
  loadEnvironment();

  const { command, options, rest } = parseArgs(process.argv.slice(2));
  const ctx = createDbContext();
  if (ctx.pg) {
    await ctx.pg.connect();
  }

  try {
    switch (command) {
      case "status": {
        await showStatus(ctx);
        break;
      }
      case "counts": {
        await showCounts(ctx);
        break;
      }
      case "count": {
        const model = rest[0] ?? (options["table"] as string | undefined);
        if (!model) {
          throw new Error("Specify a Prisma model name, e.g., 'npm run db:cli count Species'.");
        }
        await showCount(ctx, model);
        break;
      }
      case "query": {
        const sqlFromOption = typeof options["sql"] === "string" ? (options["sql"] as string) : undefined;
        const sql = sqlFromOption ?? rest.join(" ");
        await runQuery(ctx, sql, Boolean(options["json"]));
        break;
      }
      case "help":
      default: {
        printHelp();
        break;
      }
    }
  } finally {
    // 2-NODE CLUSTER: Always disconnect direct PostgreSQL client
    if (ctx.pg) {
      await ctx.pg.end();
    }
  }
}

main().catch((error) => {
  console.error("[db-admin]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
