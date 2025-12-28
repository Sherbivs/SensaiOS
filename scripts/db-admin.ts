/**
 * DB Admin CLI - Database administration tool for Infinity Gauntlet
 * 
 * This is a CLI script that outputs directly to console.
 * All output uses visual formatters from output-formatter.js
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as dotenv from "dotenv";
import { Client as PgClient } from "pg";
import {
  formatSectionHeader,
  formatKeyValueList,
  formatStatus,
  formatList,
} from "../src/utils/output-formatter.js";

const DEFAULT_COUNT_TARGETS = [
  { model: "species", label: "Species" },
  { model: "pokemonInstance", label: "Pokemon Instances" },
  { model: "user", label: "Users" },
  { model: "encounter", label: "Encounters" },
  { model: "battle", label: "Battles" },
];

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
  | "index_usage"
  | "table_bloat"
  | "slow_queries"
  | "cache_stats"
  | "databases"
  | "help";

interface ParsedArgs {
  command: Command;
  target: string;
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
  // Fall back to DATABASE_ONPREMISE_DEV_PRIMARY for workstation development
  const prodOverride = process.env.PROD_DATABASE_URL?.trim();
  if (prodOverride) {
    return prodOverride;
  }

  // CANONICAL: DATABASE_ONPREMISE_DEV_PRIMARY (workstation development database)
  const onPremiseDevOverride = process.env.DATABASE_ONPREMISE_DEV_PRIMARY?.trim();
  if (onPremiseDevOverride) {
    return onPremiseDevOverride;
  }

  const prodFileOverride = process.env.PROD_DATABASE_URL_FILE?.trim();
  const storeRoot = process.env.IG_STORE_ROOT?.trim() || path.join(process.cwd(), "Store");
  const candidates = [prodFileOverride, path.join(storeRoot, "onpremise-dev-primary", "local-url.txt"), path.join(storeRoot, "db", "local-url.txt"), path.join(storeRoot, "db", "local", "url.txt")]
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
      console.log(formatStatus(
        "Skipping repository .env fallback because NODE_ENV=production. Set IG_ALLOW_REPO_ENV=1 to override.",
        "info"
      ));
    }
  }

  if (!loaded) {
    console.log(formatStatus(
      "No environment file loaded. Ensure IG_ENV_FILE or DOTENV_CONFIG_PATH points to a valid secrets file.",
      "warning"
    ));
  }
}

function resolveDatasource(target: string): DatasourceConfig {
  // Handle explicit target selection (canonical names only)
  switch (target) {
    case "cloud-dev": {
      // UNIFIED ARCHITECTURE: cloud-dev now points to same database as cloud-prod
      const prodUrl = process.env.PROD_DATABASE_URL ?? process.env.RENDER_DB_EXTERNAL_URL ?? "";
      if (!prodUrl) {
        throw new Error(
          "CLOUD database target requires PROD_DATABASE_URL or RENDER_DB_EXTERNAL_URL. Set in secrets/Infinity-Gauntlet.env",
        );
      }
      return { url: prodUrl };
    }
    case "cloud-prod": {
      const prodUrl = process.env.PROD_DATABASE_URL ?? "";
      if (!prodUrl) {
        throw new Error(
          "CLOUD-PROD-RUNTIME target requires PROD_DATABASE_URL. Set in secrets/Infinity-Gauntlet.env",
        );
      }
      return { url: prodUrl };
    }
    case "onpremise-experiment": {
      const experimentUrl = process.env.DATABASE_ONPREMISE_DEV_EXPERIMENT ?? process.env.DATABASE_EXPERIMENT_URL ?? "";
      if (!experimentUrl) {
        throw new Error(
          "ONPREMISE-DEV-EXPERIMENT target requires DATABASE_ONPREMISE_DEV_EXPERIMENT. Bootstrap experimental database first: npm run ops:bootstrap-onpremise-experiment",
        );
      }
      return { url: experimentUrl };
    }
    case "onpremise-dev":
    default: {
      // Default behavior: try PRIMARY LOCAL, then cloud databases
      const primaryUrl = process.env.DATABASE_URL ?? "";
      const renderInternalUrl = process.env.RENDER_DB_INTERNAL_URL ?? "";
      const renderExternalUrl = process.env.RENDER_DB_EXTERNAL_URL ?? "";
      const localUrl = readLocalFallbackUrl();

      // UNIFIED ARCHITECTURE: All connections use direct PostgreSQL (no Accelerate)
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
        "PROD_DATABASE_URL, DATABASE_URL, RENDER_DB_INTERNAL_URL, or RENDER_DB_EXTERNAL_URL must be set before running db:cli. Provide DATABASE_ONPREMISE_DEV_PRIMARY for offline fallback if remote datasources are unavailable.",
      );
    }
  }
}

function createDbContext(target: string): DbContext {
  const datasource = resolveDatasource(target);

  // UNIFIED ARCHITECTURE: Always use direct PostgreSQL connection
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
  let target = "onpremise-dev"; // Default to ONPREMISE-DEV-PRIMARY (workstation development DB)

  for (const arg of restArgs) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=", 2);
      
      // Extract --target flag
      if (key === "target") {
        target = (value ?? "local").toLowerCase();
        continue;
      }
      
      options[key] = value ?? true;
      continue;
    }
    rest.push(arg);
  }

  return { command, target, options, rest };
}

async function showStatus(ctx: DbContext, target: string): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  const prodUrl = process.env.PROD_DATABASE_URL ?? "";
  const renderInternalUrl = process.env.RENDER_DB_INTERNAL_URL ?? "";
  const renderExternalUrl = process.env.RENDER_DB_EXTERNAL_URL ?? "";
  const localUrl = readLocalFallbackUrl();
  const onPremiseDevUrl = process.env.DATABASE_ONPREMISE_DEV_PRIMARY ?? "";
  const onPremiseExperimentUrl = process.env.DATABASE_ONPREMISE_DEV_EXPERIMENT ?? "";
  const legacyExperimentUrl = process.env.DATABASE_EXPERIMENT_URL ?? "";
  
  // UNIFIED ARCHITECTURE: Extract host from direct PostgreSQL URL
  const host = (() => {
    try {
      const parsed = new URL(url.startsWith("postgres") ? url : `https://${url}`);
      return parsed.host;
    } catch {
      return "unknown";
    }
  })();

  console.log(formatSectionHeader("Database Status"));
  console.log(formatKeyValueList([
    ["Target", target.toUpperCase()],
    ["Active host", host],
    ["Engine", "Direct PostgreSQL (Unified Architecture)"],
    ["NODE_ENV", process.env.NODE_ENV ?? "(not set)"],
    ["IG_ENV_FILE", process.env.IG_ENV_FILE ?? "(not set)"],
    ["DOTENV_CONFIG_PATH", process.env.DOTENV_CONFIG_PATH ?? "(not set)"],
    ["DATABASE_URL set", url ? "yes" : "no"],
    ["PROD_DATABASE_URL set", prodUrl ? "yes" : "no"],
    ["RENDER_DB_INTERNAL_URL set", renderInternalUrl ? "yes" : "no"],
    ["RENDER_DB_EXTERNAL_URL set", renderExternalUrl ? "yes" : "no"],
    ["DATABASE_ONPREMISE_DEV_PRIMARY set", onPremiseDevUrl ? "yes" : "no"],
    ["DATABASE_ONPREMISE_DEV_EXPERIMENT set", onPremiseExperimentUrl ? "yes" : "no"],
    ["DATABASE_EXPERIMENT_URL set", legacyExperimentUrl ? "yes" : "no"],
    ["Local fallback file", localUrl ? "yes" : "no"],
    ["Resolved datasource", `direct ${maskDatasource(ctx.datasource.url)}`],
  ]));

  try {
    if (ctx.pg) {
      const [speciesResult, userResult] = await Promise.all([
        ctx.pg.query<{ count: string }>('SELECT COUNT(*)::bigint AS count FROM "Species"'),
        ctx.pg.query<{ count: string }>('SELECT COUNT(*)::bigint AS count FROM "User"'),
      ]);
      const speciesCount = speciesResult.rows[0]?.count ?? "0";
      const userCount = userResult.rows[0]?.count ?? "0";
      console.log("\n" + formatSectionHeader("Sample Counts", 1));
      console.log(formatKeyValueList([
        ["Species records", speciesCount],
        ["User records", userCount],
      ], { indent: 1 }));
    }
  } catch (error) {
    console.log(formatStatus("Failed to read sample counts", "warning"));
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(formatKeyValueList([["Error", errorMsg]], { indent: 1 }));
  }
}

function toTableName(modelKey: string): string {
  return modelKey.charAt(0).toUpperCase() + modelKey.slice(1);
}

async function showCounts(ctx: DbContext): Promise<void> {
  console.log(formatSectionHeader("Table Counts"));
  const counts: Array<[string, string]> = [];
  
  for (const target of DEFAULT_COUNT_TARGETS) {
    // UNIFIED ARCHITECTURE: Always use direct PostgreSQL connection
    if (ctx.pg) {
      const tableName = toTableName(target.model);
      const result = await ctx.pg.query<{ count: string }>(
        `SELECT COUNT(*)::bigint AS count FROM "${tableName}"`,
      );
      const count = result.rows[0]?.count ?? "0";
      counts.push([target.label, count]);
    }
  }
  
  console.log(formatKeyValueList(counts));
}

async function showCount(ctx: DbContext, modelName: string): Promise<void> {
  // UNIFIED ARCHITECTURE: Always use direct PostgreSQL connection
  if (ctx.pg) {
    const tableName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
    const result = await ctx.pg.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count FROM "${tableName}"`,
    );
    const count = result.rows[0]?.count ?? "0";
    console.log(formatKeyValueList([[`${modelName} count`, count]]));
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

  // UNIFIED ARCHITECTURE: Always use direct PostgreSQL connection
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

    const message = isSelect
      ? "Query returned zero rows."
      : `Query executed successfully (${result.command}, ${result.rowCount ?? 0} rows affected).`;
    console.log(formatStatus(message, "info"));
    return;
  }

  throw new Error("No database client available to run query command.");
}

interface IndexUsageRow {
  schemaname: string;
  tablename: string;
  indexname: string;
  idx_scan: string;
  idx_tup_read: string;
  idx_tup_fetch: string;
  idx_size: string;
}

async function showIndexUsage(ctx: DbContext, outputJson: boolean): Promise<void> {
  if (!ctx.pg) {
    throw new Error("No database client available for index_usage command.");
  }

  const query = `
    SELECT
      schemaname,
      tablename,
      indexname,
      idx_scan,
      idx_tup_read,
      idx_tup_fetch,
      pg_size_pretty(pg_relation_size(indexrelid)) AS idx_size
    FROM pg_stat_user_indexes
    ORDER BY idx_scan ASC, tablename ASC, indexname ASC;
  `;

  const result = await ctx.pg.query<IndexUsageRow>(query);

  if (outputJson) {
    console.log(JSON.stringify(result.rows, null, 2));
    return;
  }

  if (result.rows.length === 0) {
    console.log(formatStatus("No user indexes found.", "info"));
    return;
  }

  console.log(formatSectionHeader("Index Usage Analysis"));

  // Group by table for better readability
  const byTable = new Map<string, IndexUsageRow[]>();
  for (const row of result.rows) {
    const key = `${row.schemaname}.${row.tablename}`;
    if (!byTable.has(key)) {
      byTable.set(key, []);
    }
    byTable.get(key)!.push(row);
  }

  let unusedCount = 0;
  const warnings: string[] = [];

  for (const [tableKey, indexes] of byTable) {
    console.log(formatSectionHeader(tableKey, 1));

    for (const idx of indexes) {
      const scans = parseInt(idx.idx_scan, 10);
      const status = scans === 0 ? "UNUSED" : scans < 10 ? "LOW" : "OK";
      const statusLevel = scans === 0 ? "error" : scans < 10 ? "warning" : "success";

      console.log(formatKeyValueList([
        ["Index", idx.indexname],
        ["Status", formatStatus(status, statusLevel as "error" | "warning" | "success" | "info")],
        ["Scans", idx.idx_scan],
        ["Tuples Read", idx.idx_tup_read],
        ["Tuples Fetched", idx.idx_tup_fetch],
        ["Size", idx.idx_size]
      ], { indent: 2 }));

      if (scans === 0) {
        unusedCount++;
        warnings.push(`UNUSED: ${tableKey}.${idx.indexname} (0 scans, size: ${idx.idx_size})`);
      }
    }
  }

  if (warnings.length > 0) {
    console.log(formatStatus("WARNINGS:", "warning"));
    console.log(formatList(warnings, { indent: 1 }));
    console.log(formatKeyValueList([
      ["Total unused indexes", String(unusedCount)]
    ]));
    console.log(formatStatus("Consider dropping unused indexes to reduce storage and maintenance overhead.", "info"));
  } else {
    console.log(formatStatus("All indexes are being used.", "success"));
  }
}

interface TableBloatRow {
  schemaname: string;
  tablename: string;
  n_live_tup: string;
  n_dead_tup: string;
  dead_pct: number;
  last_vacuum: Date | null;
  last_autovacuum: Date | null;
  last_analyze: Date | null;
  last_autoanalyze: Date | null;
}

async function showTableBloat(ctx: DbContext, outputJson: boolean): Promise<void> {
  if (!ctx.pg) {
    throw new Error("No database client available for table_bloat command.");
  }

  const query = `
    SELECT
      schemaname,
      relname AS tablename,
      n_live_tup,
      n_dead_tup,
      CASE 
        WHEN n_live_tup > 0 
        THEN ROUND((n_dead_tup::float / n_live_tup::float) * 100, 2)
        ELSE 0
      END AS dead_pct,
      last_vacuum,
      last_autovacuum,
      last_analyze,
      last_autoanalyze
    FROM pg_stat_user_tables
    ORDER BY dead_pct DESC, n_dead_tup DESC;
  `;

  const result = await ctx.pg.query<TableBloatRow>(query);

  if (outputJson) {
    console.log(JSON.stringify(result.rows, null, 2));
    return;
  }

  if (result.rows.length === 0) {
    console.log(formatStatus("No user tables found.", "info"));
    return;
  }

  console.log(formatSectionHeader("Table Bloat Analysis"));

  const warnings: string[] = [];
  const critical: string[] = [];

  for (const row of result.rows) {
    const tableKey = `${row.schemaname}.${row.tablename}`;
    const deadPct = row.dead_pct;
    const liveTup = parseInt(row.n_live_tup, 10);
    const deadTup = parseInt(row.n_dead_tup, 10);

    const statusLevel = deadPct >= 50 ? "error" : deadPct >= 20 ? "warning" : "success";
    const statusText = deadPct >= 50 ? "CRITICAL" : deadPct >= 20 ? "WARNING" : "HEALTHY";
    
    if (deadPct >= 50) {
      critical.push(`${tableKey}: ${deadPct}% dead rows (${deadTup}/${liveTup + deadTup})`);
    } else if (deadPct >= 20) {
      warnings.push(`${tableKey}: ${deadPct}% dead rows (${deadTup}/${liveTup + deadTup})`);
    }

    const lastVacuum = row.last_vacuum || row.last_autovacuum;
    const lastAnalyze = row.last_analyze || row.last_autoanalyze;

    console.log(formatSectionHeader(tableKey, 1));
    console.log(formatKeyValueList([
      ["Status", formatStatus(statusText, statusLevel as "error" | "warning" | "success")],
      ["Live Tuples", row.n_live_tup],
      ["Dead Tuples", row.n_dead_tup],
      ["Bloat", `${deadPct}%`],
      ["Last VACUUM", lastVacuum ? lastVacuum.toISOString() : "never"],
      ["Last ANALYZE", lastAnalyze ? lastAnalyze.toISOString() : "never"]
    ], { indent: 1 }));
  }

  if (critical.length > 0) {
    console.log(formatStatus("CRITICAL BLOAT (>50%):", "error"));
    console.log(formatList(critical, { indent: 1 }));
    console.log(formatStatus("Recommendation: Run VACUUM ANALYZE immediately on these tables.", "info"));
    console.log(formatKeyValueList([
      ["Example", 'VACUUM ANALYZE "User";']
    ], { indent: 1 }));
  }

  if (warnings.length > 0) {
    console.log(formatStatus("WARNING BLOAT (>20%):", "warning"));
    console.log(formatList(warnings, { indent: 1 }));
    console.log(formatStatus("Recommendation: Schedule VACUUM ANALYZE during low-traffic period.", "info"));
  }

  if (critical.length === 0 && warnings.length === 0) {
    console.log(formatStatus("All tables have healthy bloat levels (<20%).", "success"));
  }
}

interface SlowQueryRow {
  query: string;
  calls: string;
  mean_exec_time_ms: number;
  total_exec_time_ms: number;
  stddev_exec_time_ms: number;
}

async function showSlowQueries(ctx: DbContext, outputJson: boolean): Promise<void> {
  if (!ctx.pg) {
    throw new Error("No database client available for slow_queries command.");
  }

  // Check if pg_stat_statements extension is available
  const extensionCheck = await ctx.pg.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
    ) AS exists;`
  );

  if (!extensionCheck.rows[0]?.exists) {
    console.log(formatStatus("pg_stat_statements extension not installed.", "warning"));
    console.log(formatStatus("To enable slow query tracking, run:", "info"));
    console.log(formatKeyValueList([
      ["SQL", "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"]
    ], { indent: 1 }));
    console.log(formatStatus("Note: This requires superuser privileges and may require server restart.", "info"));
    return;
  }

  const query = `
    SELECT
      LEFT(query, 100) AS query,
      calls,
      ROUND(mean_exec_time::numeric, 2) AS mean_exec_time_ms,
      ROUND(total_exec_time::numeric, 2) AS total_exec_time_ms,
      ROUND(stddev_exec_time::numeric, 2) AS stddev_exec_time_ms
    FROM pg_stat_statements
    WHERE query NOT LIKE '%pg_stat_statements%'
      AND query NOT LIKE '%pg_catalog%'
    ORDER BY mean_exec_time DESC
    LIMIT 10;
  `;

  const result = await ctx.pg.query<SlowQueryRow>(query);

  if (outputJson) {
    console.log(JSON.stringify(result.rows, null, 2));
    return;
  }

  if (result.rows.length === 0) {
    console.log(formatStatus("No queries found in pg_stat_statements.", "info"));
    console.log(formatStatus("Note: Statistics may have been reset or no queries have been executed yet.", "info"));
    return;
  }

  console.log(formatSectionHeader("Slow Query Analysis (Top 10 by Mean Execution Time)"));

  const warnings: string[] = [];
  const critical: string[] = [];

  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows[i];
    const meanTime = row.mean_exec_time_ms;
    
    const statusLevel = meanTime >= 2000 ? "error" : meanTime >= 500 ? "warning" : "success";
    const statusText = meanTime >= 2000 ? "CRITICAL" : meanTime >= 500 ? "SLOW" : "OK";
    
    if (meanTime >= 2000) {
      critical.push(`Query #${i + 1}: ${meanTime}ms mean execution time`);
    } else if (meanTime >= 500) {
      warnings.push(`Query #${i + 1}: ${meanTime}ms mean execution time`);
    }

    console.log(formatSectionHeader(`Query #${i + 1}`, 1));
    console.log(formatKeyValueList([
      ["Status", formatStatus(statusText, statusLevel as "error" | "warning" | "success")],
      ["Query", `${row.query}...`],
      ["Calls", row.calls],
      ["Mean Time", `${meanTime}ms`],
      ["Total Time", `${row.total_exec_time_ms}ms`],
      ["StdDev", `${row.stddev_exec_time_ms}ms`]
    ], { indent: 1 }));
  }

  if (critical.length > 0) {
    console.log(formatStatus("CRITICAL QUERIES (>2s mean time):", "error"));
    console.log(formatList(critical, { indent: 1 }));
    console.log(formatStatus("Recommendation: Review these queries immediately. Consider:", "info"));
    console.log(formatList([
      "Adding missing indexes",
      "Optimizing JOIN conditions",
      "Breaking complex queries into smaller parts"
    ], { indent: 1 }));
  }

  if (warnings.length > 0) {
    console.log(formatStatus("SLOW QUERIES (>500ms mean time):", "warning"));
    console.log(formatList(warnings, { indent: 1 }));
    console.log(formatStatus("Recommendation: Investigate these queries for optimization opportunities.", "info"));
  }

  if (critical.length === 0 && warnings.length === 0) {
    console.log(formatStatus("All queries are performing well (<500ms mean time).", "success"));
  }
}

interface CacheStatsRow {
  schemaname: string;
  relname: string;
  heap_blks_read: string;
  heap_blks_hit: string;
  heap_hit_rate: number;
  idx_blks_read: string;
  idx_blks_hit: string;
  idx_hit_rate: number;
}

async function showCacheStats(ctx: DbContext, outputJson: boolean): Promise<void> {
  if (!ctx.pg) {
    throw new Error("No database client available for cache_stats command.");
  }

  const query = `
    SELECT
      schemaname,
      relname,
      heap_blks_read,
      heap_blks_hit,
      CASE 
        WHEN (heap_blks_read + heap_blks_hit) > 0 
        THEN ROUND((heap_blks_hit::float / (heap_blks_read + heap_blks_hit)::float) * 100, 2)
        ELSE 100.0
      END AS heap_hit_rate,
      idx_blks_read,
      idx_blks_hit,
      CASE 
        WHEN (idx_blks_read + idx_blks_hit) > 0 
        THEN ROUND((idx_blks_hit::float / (idx_blks_read + idx_blks_hit)::float) * 100, 2)
        ELSE 100.0
      END AS idx_hit_rate
    FROM pg_statio_user_tables
    ORDER BY heap_hit_rate ASC, idx_hit_rate ASC;
  `;

  const result = await ctx.pg.query<CacheStatsRow>(query);

  if (outputJson) {
    console.log(JSON.stringify(result.rows, null, 2));
    return;
  }

  if (result.rows.length === 0) {
    console.log(formatStatus("No user tables found.", "info"));
    return;
  }

  console.log(formatSectionHeader("Buffer Cache Hit Rate Analysis"));

  const warnings: string[] = [];
  const critical: string[] = [];

  let totalHeapRead = 0;
  let totalHeapHit = 0;
  let totalIdxRead = 0;
  let totalIdxHit = 0;

  for (const row of result.rows) {
    const tableKey = `${row.schemaname}.${row.relname}`;
    const heapRate = row.heap_hit_rate;
    const idxRate = row.idx_hit_rate;

    totalHeapRead += parseInt(row.heap_blks_read, 10);
    totalHeapHit += parseInt(row.heap_blks_hit, 10);
    totalIdxRead += parseInt(row.idx_blks_read, 10);
    totalIdxHit += parseInt(row.idx_blks_hit, 10);

    const statusLevel = (heapRate < 60 || idxRate < 60) ? "error" : (heapRate < 80 || idxRate < 80) ? "warning" : "success";
    const statusText = (heapRate < 60 || idxRate < 60) ? "CRITICAL" : (heapRate < 80 || idxRate < 80) ? "WARNING" : "HEALTHY";
    
    if (heapRate < 60 || idxRate < 60) {
      critical.push(`${tableKey}: Heap ${heapRate}%, Index ${idxRate}%`);
    } else if (heapRate < 80 || idxRate < 80) {
      warnings.push(`${tableKey}: Heap ${heapRate}%, Index ${idxRate}%`);
    }

    console.log(formatSectionHeader(tableKey, 1));
    console.log(formatKeyValueList([
      ["Status", formatStatus(statusText, statusLevel as "error" | "warning" | "success")],
      ["Heap Blocks Read", row.heap_blks_read],
      ["Heap Blocks Hit", row.heap_blks_hit],
      ["Heap Hit Rate", `${heapRate}%`],
      ["Index Blocks Read", row.idx_blks_read],
      ["Index Blocks Hit", row.idx_blks_hit],
      ["Index Hit Rate", `${idxRate}%`]
    ], { indent: 1 }));
  }

  // Calculate database-wide summary
  const totalHeapOps = totalHeapRead + totalHeapHit;
  const totalIdxOps = totalIdxRead + totalIdxHit;
  const overallHeapRate = totalHeapOps > 0 ? ((totalHeapHit / totalHeapOps) * 100).toFixed(2) : "100.00";
  const overallIdxRate = totalIdxOps > 0 ? ((totalIdxHit / totalIdxOps) * 100).toFixed(2) : "100.00";

  console.log(formatSectionHeader("DATABASE-WIDE SUMMARY"));
  console.log(formatKeyValueList([
    ["Overall Heap Cache Hit Rate", `${overallHeapRate}%`],
    ["Overall Index Cache Hit Rate", `${overallIdxRate}%`]
  ], { indent: 1 }));

  if (critical.length > 0) {
    console.log(formatStatus("CRITICAL CACHE PERFORMANCE (<60%):", "error"));
    console.log(formatList(critical, { indent: 1 }));
    console.log(formatStatus("Recommendation: Investigate immediately. Possible causes:", "info"));
    console.log(formatList([
      "Insufficient shared_buffers allocation",
      "Tables/indexes too large for available cache",
      "Sequential scans instead of index scans"
    ], { indent: 1 }));
  }

  if (warnings.length > 0) {
    console.log(formatStatus("LOW CACHE HIT RATE (<80%):", "warning"));
    console.log(formatList(warnings, { indent: 1 }));
    console.log(formatStatus("Recommendation: Consider increasing shared_buffers or optimizing queries.", "info"));
  }

  if (critical.length === 0 && warnings.length === 0) {
    console.log(formatStatus("All tables have healthy cache hit rates (>80%).", "success"));
  }
}

async function showDatabases(): Promise<void> {
  console.log(formatSectionHeader("Available Databases"));

  const databases = [
    { name: "CLOUD-PROD (Render Managed)", envVar: "PROD_DATABASE_URL", fallback: "RENDER_DB_EXTERNAL_URL", target: "cloud-prod" },
    { name: "ONPREMISE-DEV-PRIMARY (Workstation)", envVar: "DATABASE_ONPREMISE_DEV_PRIMARY", fallback: null, target: "onpremise-dev" },
    { name: "ONPREMISE-DEV-EXPERIMENT (Migration Testing)", envVar: "DATABASE_ONPREMISE_DEV_EXPERIMENT", fallback: "DATABASE_EXPERIMENT_URL", target: "onpremise-experiment" },
  ];

  for (const db of databases) {
    const url = process.env[db.envVar]?.trim() ?? (db.fallback ? process.env[db.fallback]?.trim() : null);
    const configured = Boolean(url);
    const statusIcon = configured ? "✅" : "❌";
    
    console.log(formatSectionHeader(`${statusIcon} ${db.name}`, 1));
    console.log(formatKeyValueList([
      ["Environment", db.envVar],
      ["Configured", configured ? "Yes" : "No"],
      ["Target", `--target=${db.target}`]
    ], { indent: 2 }));
    
    if (configured && url) {
      try {
        // Test connection
        const pg = new PgClient({
          connectionString: url,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 5000,
        });
        
        await pg.connect();
        const result = await pg.query<{ count: string }>('SELECT COUNT(*)::bigint AS count FROM "User"');
        const userCount = result.rows[0]?.count ?? "0";
        await pg.end();
        
        console.log(formatKeyValueList([
          ["Connection", formatStatus("Connected", "success")],
          ["Sample (User records)", userCount]
        ], { indent: 2 }));
      } catch (error) {
        console.log(formatKeyValueList([
          ["Connection", formatStatus("Failed", "error")],
          ["Error", error instanceof Error ? error.message : String(error)]
        ], { indent: 2 }));
      }
    } else {
      console.log(formatKeyValueList([
        ["Connection", formatStatus("Not configured", "info")]
      ], { indent: 2 }));
    }
  }
  
  console.log(formatSectionHeader("Usage Examples", 1));
  console.log(formatList([
    'npm run db:cli -- status --target=cloud-dev',
    'npm run db:cli -- count User --target=onpremise-experiment',
    'npm run db:cli -- query "SELECT * FROM \\"Species\\" LIMIT 5;" --target=cloud-prod'
  ], { indent: 1 }));
  console.log(formatStatus("Legacy aliases supported: dev (cloud-dev), prod (cloud-prod), local (onpremise-dev), experiment (onpremise-experiment)", "info"));
}

function printHelp(): void {
  console.log(formatSectionHeader("Infinity Gauntlet DB Control Suite"));
  console.log(formatKeyValueList([
    ["Usage", "npm run db:cli [command] [options]"]
  ]));
  
  console.log(formatSectionHeader("Commands", 1));
  console.log(formatKeyValueList([
    ["status", "Show active connection metadata and sample counts."],
    ["counts", "Print counts for common tables."],
    ["count <Model>", "Count records for a specific Prisma model (e.g., Species, User)."],
    ["query <SQL>", "Execute a raw SQL query (read-only recommended)."],
    ["index_usage", "Show index scan counts and identify unused indexes."],
    ["table_bloat", "Analyze dead row percentages and recommend VACUUM."],
    ["slow_queries", "Show top 10 slowest queries (requires pg_stat_statements)."],
    ["cache_stats", "Show buffer cache hit rates for tables and indexes."],
    ["databases", "List all configured databases with connection status."],
    ["help", "Show this message."]
  ], { indent: 1 }));
  
  console.log(formatSectionHeader("Options", 1));
  console.log(formatKeyValueList([
    ["--target=<db>", "Target database: 'cloud-dev', 'cloud-prod', 'onpremise-dev' (default), 'onpremise-experiment'. Legacy aliases: 'dev', 'prod', 'local', 'experiment'."],
    ["--json", "Output results as JSON (query, index_usage, table_bloat, slow_queries, cache_stats)."],
    ["--table=<Model>", "Alias for 'count <Model>'."],
    ["--sql=\"...\"", "Provide SQL for the query command without quoting."]
  ], { indent: 1 }));
  
  console.log(formatSectionHeader("Target Databases", 1));
  console.log(formatKeyValueList([
    ["cloud-prod", "CLOUD-PROD (PROD_DATABASE_URL) - Primary Render-managed database for all operations."],
    ["onpremise-dev", "ONPREMISE-DEV-PRIMARY (DATABASE_ONPREMISE_DEV_PRIMARY) - Workstation development (default)."],
    ["onpremise-experiment", "ONPREMISE-DEV-EXPERIMENT (DATABASE_ONPREMISE_DEV_EXPERIMENT) - Migration testing (offline)."]
  ], { indent: 1 }));
  
  console.log(formatSectionHeader("Performance Monitoring", 1));
  console.log(formatKeyValueList([
    ["index_usage", "Identifies unused indexes (0 scans) that waste storage."],
    ["table_bloat", "Warns if dead rows >20% (warning) or >50% (critical)."],
    ["slow_queries", "Warns if mean time >500ms (warning) or >2s (critical)."],
    ["cache_stats", "Warns if hit rate <80% (warning) or <60% (critical)."]
  ], { indent: 1 }));
  
  console.log(formatSectionHeader("Examples", 1));
  console.log(formatList([
    "npm run db:cli -- databases                                   # List all databases",
    "npm run db:cli -- status --target=cloud-prod                  # Check CLOUD-PROD status",
    "npm run db:cli -- count User --target=onpremise-experiment    # Count users in experiment DB",
    'npm run db:cli -- query "SELECT * FROM \\"Species\\" LIMIT 5;" --target=cloud-prod'
  ], { indent: 1 }));
  
  console.log(formatStatus("Environment loading follows IG_ENV_FILE → DOTENV_CONFIG_PATH → repo .env (non-production).", "info"));
}

async function main(): Promise<void> {
  loadEnvironment();

  const { command, target, options, rest } = parseArgs(process.argv.slice(2));
  const ctx = createDbContext(target);
  if (ctx.pg) {
    await ctx.pg.connect();
  }

  try {
    switch (command) {
      case "status": {
        await showStatus(ctx, target);
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
      case "index_usage": {
        await showIndexUsage(ctx, Boolean(options["json"]));
        break;
      }
      case "table_bloat": {
        await showTableBloat(ctx, Boolean(options["json"]));
        break;
      }
      case "slow_queries": {
        await showSlowQueries(ctx, Boolean(options["json"]));
        break;
      }
      case "cache_stats": {
        await showCacheStats(ctx, Boolean(options["json"]));
        break;
      }
      case "databases": {
        await showDatabases();
        break;
      }
      case "help":
      default: {
        printHelp();
        break;
      }
    }
  } finally {
    // UNIFIED ARCHITECTURE: Always disconnect direct PostgreSQL client
    if (ctx.pg) {
      await ctx.pg.end();
    }
  }
}

main().catch((error) => {
  console.log(formatStatus(
    error instanceof Error ? error.message : String(error),
    "error"
  ));
  console.error("[db-admin] Full error:", error);
  process.exitCode = 1;
});
