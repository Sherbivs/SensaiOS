import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
// @ts-ignore Runtime import resolves against pg/esm entry; types are provided via @types/pg.
import { Client as PgClient } from "pg";

type TableDigest = {
  tableName: string;
  rowCount: bigint;
  checksum: string;
};

type DatabaseSnapshot = {
  label: string;
  totals: {
    tables: number;
    rows: bigint;
  };
  digests: Map<string, TableDigest>;
};

type QueryRunner = (sql: string) => Promise<Array<Record<string, unknown>>>;

function assertEnv(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Expected environment variable ${name} to be set.`);
  }
  return value.trim();
}

function escapeIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return BigInt(value.trim());
  }
  return BigInt(0);
}

async function gatherSnapshotWithRunner(label: string, runQuery: QueryRunner): Promise<DatabaseSnapshot> {
  const tablesResultRaw = await runQuery(
    `SELECT table_name AS "tableName"
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );

  const tablesResult = tablesResultRaw as Array<{ tableName: string }>;

  const digests = new Map<string, TableDigest>();
  let totalRows = BigInt(0);

  for (const row of tablesResult) {
    const tableName = row.tableName;
    const safeIdentifier = escapeIdentifier(tableName);
    let statsRowsRaw: Array<Record<string, unknown>>;

    if (tableName === "_prisma_migrations") {
      statsRowsRaw = await runQuery(`
        SELECT COUNT(*)::bigint AS row_count,
               COALESCE(SUM(hashtextextended(row_to_json(t)::text, 0))::text, '0') AS checksum
        FROM (
          SELECT migration_name, checksum, applied_steps_count
          FROM ${safeIdentifier}
          ORDER BY migration_name
        ) AS t
      `);
    } else {
      statsRowsRaw = await runQuery(
        `SELECT COUNT(*)::bigint AS row_count,
                COALESCE(SUM(hashtextextended(row_to_json(t)::text, 0))::text, '0') AS checksum
         FROM ${safeIdentifier} AS t`
      );
    }
    const statsRows = statsRowsRaw as Array<{ row_count: unknown; checksum: string }>;
    const stats = statsRows[0];
    const rowCount = toBigInt(stats?.row_count);
    const checksum = typeof stats?.checksum === "string" && stats.checksum.length > 0 ? stats.checksum : "0";

    digests.set(tableName, {
      tableName,
      rowCount,
      checksum,
    });

    totalRows += rowCount;
  }

  return {
    label,
    totals: {
      tables: digests.size,
      rows: totalRows,
    },
    digests,
  };
}

function formatBigInt(value: bigint): string {
  return value.toLocaleString("en-US");
}

export function redactConnectionString(value: string): string {
  let redacted = value.replace(/:([^:@/]+)@/, ":<redacted>@");
  redacted = redacted.replace(/(api_key=)[^&]+/gi, "$1<redacted>");
  return redacted;
}

function compareSnapshots(primary: DatabaseSnapshot, standby: DatabaseSnapshot, label: string): boolean {
  const mismatches: Array<{
    tableName: string;
    primary: TableDigest;
    standby: TableDigest;
  }> = [];

  const tableNames = new Set<string>([...primary.digests.keys(), ...standby.digests.keys()]);

  for (const tableName of tableNames) {
    const primaryDigest = primary.digests.get(tableName);
    const standbyDigest = standby.digests.get(tableName);

    if (!primaryDigest || !standbyDigest) {
      mismatches.push({
        tableName,
        primary: primaryDigest ?? {
          tableName,
          rowCount: BigInt(-1),
          checksum: "<missing>",
        },
        standby: standbyDigest ?? {
          tableName,
          rowCount: BigInt(-1),
          checksum: "<missing>",
        },
      });
      continue;
    }

    if (primaryDigest.rowCount !== standbyDigest.rowCount || primaryDigest.checksum !== standbyDigest.checksum) {
      mismatches.push({ tableName, primary: primaryDigest, standby: standbyDigest });
    }
  }

  const primaryRows = formatBigInt(primary.totals.rows);
  const standbyRows = formatBigInt(standby.totals.rows);

  console.info(`[${label}] Primary tables: ${primary.totals.tables}, total rows: ${primaryRows}`);
  console.info(`[${label}] Standby tables: ${standby.totals.tables}, total rows: ${standbyRows}`);

  if (mismatches.length === 0) {
    console.info(`[${label}] ✅ All tables match between primary and standby (row counts and checksums).`);
    return true;
  }

  console.error(`[${label}] ❌ Detected ${mismatches.length} table mismatch(es):`);
  for (const mismatch of mismatches) {
    const primaryCount = formatBigInt(mismatch.primary.rowCount);
    const standbyCount = formatBigInt(mismatch.standby.rowCount);
    console.error(
      `  • ${mismatch.tableName}: primary rows=${primaryCount}, standby rows=${standbyCount}, primary checksum=${mismatch.primary.checksum}, standby checksum=${mismatch.standby.checksum}`
    );
  }

  return false;
}

async function gatherDirectSnapshot(label: string, url: string): Promise<DatabaseSnapshot> {
  const client = new PgClient({ connectionString: url });
  await client.connect();

  try {
    const runQuery: QueryRunner = async (sql) => {
      const result = await client.query(sql);
      return result.rows as Array<Record<string, unknown>>;
    };
    return await gatherSnapshotWithRunner(label, runQuery);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let primaryOverride: string | undefined;
  let standbyOverride: string | undefined;
  let label = "mirror";

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--primary":
        primaryOverride = args[i + 1];
        i += 1;
        break;
      case "--standby":
        standbyOverride = args[i + 1];
        i += 1;
        break;
      case "--label":
        label = args[i + 1] ?? label;
        i += 1;
        break;
      default:
        break;
    }
  }

  const primaryUrl = assertEnv(
    "PRIMARY_DATABASE_URL",
    primaryOverride ?? process.env.PRIMARY_DATABASE_URL ?? process.env.DATABASE_URL,
  );
  const standbyUrl = assertEnv(
    "STANDBY_DATABASE_URL",
    standbyOverride ?? process.env.STANDBY_DATABASE_URL ?? process.env.RENDER_DB_EXTERNAL_URL ?? process.env.RENDER_DB_INTERNAL_URL,
  );

  const ok = await checkMirrors(primaryUrl, standbyUrl, label);
  process.exitCode = ok ? 0 : 1;
}

const modulePath = pathToFileURL(process.argv[1] ?? "").href;

if (import.meta.url === modulePath) {
  main().catch((error) => {
    console.error("Redundancy check failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export async function checkMirrors(primaryUrl: string, standbyUrl: string, label = "mirror"): Promise<boolean> {
  console.info(`[${label}] Running redundancy check...`);
  console.info(`[${label}] Primary: %s`, redactConnectionString(primaryUrl));
  console.info(`[${label}] Standby: %s`, redactConnectionString(standbyUrl));

  // UNIFIED ARCHITECTURE: All connections use direct PostgreSQL (no Accelerate)
  const primarySnapshot = await gatherDirectSnapshot("primary", primaryUrl);
  const standbySnapshot = await gatherDirectSnapshot("standby", standbyUrl);

  return compareSnapshots(primarySnapshot, standbySnapshot, label);
}

