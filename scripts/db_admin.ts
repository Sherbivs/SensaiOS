import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { Client as PgClient } from "pg";

const DEFAULT_COUNT_TARGETS = [
  { model: "species", label: "Species" },
  { model: "pokemonInstance", label: "Pokemon Instances" },
  { model: "user", label: "Users" },
  { model: "encounter", label: "Encounters" },
  { model: "battle", label: "Battles" },
];

type CountTargetModel = (typeof DEFAULT_COUNT_TARGETS)[number]["model"];

type ConnectionMode = "accelerate" | "direct";

interface DatasourceConfig {
  url: string;
  mode: ConnectionMode;
}

interface DbContext {
  datasource: DatasourceConfig;
  mode: ConnectionMode;
  prisma?: PrismaClient;
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
  const directUrl = process.env.DATABASE_DIRECT_URL ?? "";
  const accelerate = primaryUrl.startsWith("prisma://") || primaryUrl.startsWith("prisma+postgres://");

  if (accelerate) {
    if (!primaryUrl) {
      throw new Error("DATABASE_URL must be set when using Prisma Accelerate.");
    }
    return { url: primaryUrl, mode: "accelerate" };
  }

  const resolved = directUrl || primaryUrl;
  if (!resolved) {
    throw new Error("DATABASE_URL or DATABASE_DIRECT_URL must be set before running db:cli.");
  }

  return { url: resolved, mode: "direct" };
}

function createDbContext(): DbContext {
  const datasource = resolveDatasource();

  if (datasource.mode === "accelerate") {
    process.env.PRISMA_CLIENT_ENGINE_TYPE = "dataproxy";
    process.env.PRISMA_CLIENT_DATAPROXY = "true";
    const prisma = new PrismaClient({ datasourceUrl: datasource.url })
      .$extends(withAccelerate()) as unknown as PrismaClient;
    return { datasource, mode: "accelerate", prisma };
  }

  process.env.PRISMA_CLIENT_ENGINE_TYPE = "library";
  process.env.PRISMA_CLIENT_DATAPROXY = "false";
  const pg = new PgClient({
    connectionString: datasource.url,
    ssl: { rejectUnauthorized: false },
  });
  return { datasource, mode: "direct", pg };
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
  const directUrl = process.env.DATABASE_DIRECT_URL ?? "";
  const poolUrl = process.env.DATABASE_POOL_URL ?? "";
  const accelerate = url.startsWith("prisma+postgres://accelerate");
  const host = (() => {
    try {
      const parsed = new URL(url.replace("prisma+postgres://", "https://"));
      return parsed.host;
    } catch {
      return "unknown";
    }
  })();

  console.log("=== Database Status ===");
  console.log(`Active host      : ${host}`);
  console.log(`Engine           : ${accelerate ? "Prisma Accelerate" : "Direct/Postgres"}`);
  console.log(`NODE_ENV         : ${process.env.NODE_ENV ?? "(not set)"}`);
  console.log(`IG_ENV_FILE      : ${process.env.IG_ENV_FILE ?? "(not set)"}`);
  console.log(`DOTENV_CONFIG_PATH: ${process.env.DOTENV_CONFIG_PATH ?? "(not set)"}`);
  console.log(`DATABASE_URL set : ${url ? "yes" : "no"}`);
  console.log(`DATABASE_DIRECT_URL set : ${directUrl ? "yes" : "no"}`);
  console.log(`DATABASE_POOL_URL set   : ${poolUrl ? "yes" : "no"}`);
  console.log(`Resolved datasource     : ${ctx.mode} ${maskDatasource(ctx.datasource.url)}`);

  try {
    if (ctx.mode === "accelerate" && ctx.prisma) {
      const [speciesCount, userCount] = await Promise.all([
        ctx.prisma.species.count(),
        ctx.prisma.user.count(),
      ]);
      console.log("--- Sample Counts ---");
      console.log(`Species records  : ${speciesCount}`);
      console.log(`User records     : ${userCount}`);
      return;
    }

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
    if (ctx.mode === "accelerate" && ctx.prisma) {
      const delegate = (ctx.prisma as any)[target.model];
      if (!delegate?.count) {
        console.warn(`Skipping unknown model: ${target.model}`);
        continue;
      }
      const count = await delegate.count();
      console.log(`${target.label.padEnd(18)} : ${count}`);
      continue;
    }

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
  const delegateKey = modelName.charAt(0).toLowerCase() + modelName.slice(1);

  if (ctx.mode === "accelerate" && ctx.prisma) {
    const delegate = (ctx.prisma as any)[delegateKey];
    if (!delegate?.count) {
      throw new Error(`Model '${modelName}' not found. Try the 'counts' command to see available models.`);
    }
    const count = await delegate.count();
    console.log(`${modelName} count: ${count}`);
    return;
  }

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

  if (ctx.mode === "accelerate" && ctx.prisma) {
    const result = await ctx.prisma.$queryRawUnsafe(trimmedSql);

    if (outputJson) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (Array.isArray(result)) {
      if (result.length === 0) {
        console.log("Query returned zero rows.");
        return;
      }
      console.table(result);
      return;
    }

    console.log(isSelect ? result : "Query executed successfully.");
    return;
  }

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
    if (ctx.prisma) {
      await ctx.prisma.$disconnect();
    }
    if (ctx.pg) {
      await ctx.pg.end();
    }
  }
}

main().catch((error) => {
  console.error("[db-admin]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
