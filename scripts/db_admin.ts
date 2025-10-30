import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

const DEFAULT_COUNT_TARGETS = [
  { model: "species", label: "Species" },
  { model: "pokemonInstance", label: "Pokemon Instances" },
  { model: "user", label: "Users" },
  { model: "encounter", label: "Encounters" },
  { model: "busMessage", label: "Bus Messages" },
  { model: "battle", label: "Battles" },
];

type CountTargetModel = (typeof DEFAULT_COUNT_TARGETS)[number]["model"];

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

async function showStatus(prisma: PrismaClient): Promise<void> {
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

  const [speciesRows, userRows] = await Promise.all([
    prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "Species"`,
    prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "User"`,
  ]);

  const speciesCount = speciesRows[0]?.count ?? 0n;
  const userCount = userRows[0]?.count ?? 0n;

  console.log("--- Sample Counts ---");
  console.log(`Species records  : ${speciesCount.toString()}`);
  console.log(`User records     : ${userCount.toString()}`);
}

async function showCounts(prisma: PrismaClient): Promise<void> {
  console.log("=== Table Counts ===");
  for (const target of DEFAULT_COUNT_TARGETS) {
    const delegate = (prisma as any)[target.model];
    if (!delegate?.count) {
      console.warn(`Skipping unknown model: ${target.model}`);
      continue;
    }
    const count = await delegate.count();
    console.log(`${target.label.padEnd(18)} : ${count}`);
  }
}

async function showCount(prisma: PrismaClient, modelName: string): Promise<void> {
  const modelKey = modelName.charAt(0).toLowerCase() + modelName.slice(1);
  const delegate = (prisma as any)[modelKey];
  if (!delegate?.count) {
    throw new Error(`Model '${modelName}' not found. Try the 'counts' command to see available models.`);
  }

  const count = await delegate.count();
  console.log(`${modelName} count: ${count}`);
}

async function runQuery(prisma: PrismaClient, sql: string, outputJson: boolean): Promise<void> {
  if (!sql) {
    throw new Error("Query requires SQL text. Example: db:cli query \"SELECT COUNT(*) FROM \"Species\";\"");
  }

  const trimmedSql = sql.trim();
  const isSelect = trimmedSql.toLowerCase().startsWith("select");

  const result = await prisma.$queryRawUnsafe(trimmedSql);

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
  const prisma = new PrismaClient();

  try {
    switch (command) {
      case "status": {
        await showStatus(prisma);
        break;
      }
      case "counts": {
        await showCounts(prisma);
        break;
      }
      case "count": {
        const model = rest[0] ?? (options["table"] as string | undefined);
        if (!model) {
          throw new Error("Specify a Prisma model name, e.g., 'npm run db:cli count Species'.");
        }
        await showCount(prisma, model);
        break;
      }
      case "query": {
        const sqlFromOption = typeof options["sql"] === "string" ? (options["sql"] as string) : undefined;
        const sql = sqlFromOption ?? rest.join(" ");
        await runQuery(prisma, sql, Boolean(options["json"]));
        break;
      }
      case "help":
      default: {
        printHelp();
        break;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[db-admin]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
