import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

const ACCELERATE_SCHEME = /^prisma\+/i;

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

function assertEnv(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Expected environment variable ${name} to be set.`);
  }
  return value.trim();
}

function createPrismaClient(url: string): PrismaClient {
  if (ACCELERATE_SCHEME.test(url)) {
    process.env.PRISMA_CLIENT_ENGINE_TYPE = "accelerate";
    const base = new PrismaClient({ datasourceUrl: url });
    return base.$extends(withAccelerate()) as unknown as PrismaClient;
  }

  delete process.env.PRISMA_CLIENT_ENGINE_TYPE;
  return new PrismaClient({
    datasources: {
      db: {
        url,
      },
    },
  });
}

async function gatherSnapshot(label: string, client: PrismaClient): Promise<DatabaseSnapshot> {
  const tablesResult = await client.$queryRaw<Array<{ tableName: string }>>`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;

  const digests = new Map<string, TableDigest>();
  let totalRows = BigInt(0);

  for (const row of tablesResult) {
    const tableName = row.tableName;
    const [stats] = await client.$queryRawUnsafe<Array<{ row_count: bigint; checksum: string }>>(
      `SELECT COUNT(*)::bigint AS row_count, COALESCE(SUM(hashtextextended(row_to_json(t)::text, 0))::text, '0') AS checksum FROM "${tableName}" AS t`
    );

    const digest: TableDigest = {
      tableName,
      rowCount: stats?.row_count ?? BigInt(0),
      checksum: stats?.checksum ?? "0",
    };

    digests.set(tableName, digest);
    totalRows += digest.rowCount;
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

function compareSnapshots(primary: DatabaseSnapshot, standby: DatabaseSnapshot) {
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

  console.info(`Primary tables: ${primary.totals.tables}, total rows: ${primaryRows}`);
  console.info(`Standby tables: ${standby.totals.tables}, total rows: ${standbyRows}`);

  if (mismatches.length === 0) {
    console.info("✅ All tables match between primary and standby (row counts and checksums).");
    return;
  }

  console.error(`❌ Detected ${mismatches.length} table mismatch(es):`);
  for (const mismatch of mismatches) {
    const primaryCount = formatBigInt(mismatch.primary.rowCount);
    const standbyCount = formatBigInt(mismatch.standby.rowCount);
    console.error(
      `  • ${mismatch.tableName}: primary rows=${primaryCount}, standby rows=${standbyCount}, primary checksum=${mismatch.primary.checksum}, standby checksum=${mismatch.standby.checksum}`
    );
  }

  process.exitCode = 1;
}

async function main(): Promise<void> {
  const primaryUrl = assertEnv("PRIMARY_DATABASE_URL", process.env.PRIMARY_DATABASE_URL ?? process.env.DATABASE_URL);
  const standbyUrl = assertEnv("STANDBY_DATABASE_URL", process.env.STANDBY_DATABASE_URL ?? process.env.DATABASE_DIRECT_URL);

  console.info("Running redundancy check...");
  console.info("Primary: %s", primaryUrl.replace(/:([^:@/]+)@/, ":<redacted>@"));
  console.info("Standby: %s", standbyUrl.replace(/:([^:@/]+)@/, ":<redacted>@"));

  const primaryClient = createPrismaClient(primaryUrl);
  const standbyClient = createPrismaClient(standbyUrl);

  try {
    const [primary, standby] = await Promise.all([
      gatherSnapshot("primary", primaryClient),
      gatherSnapshot("standby", standbyClient),
    ]);

    compareSnapshots(primary, standby);
  } finally {
    await Promise.allSettled([primaryClient.$disconnect(), standbyClient.$disconnect()]);
  }
}

main().catch((error) => {
  console.error("Redundancy check failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
