import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as dotenv from "dotenv";
import { Client } from "pg";

const TRAINER_PREFIX = "trainer_";

type StepResult = {
  key: string;
  description: string;
  rows?: number | null;
};

type BackfillOptions = {
  tenantId: string;
  packHash: string;
  packMetaJson: string;
  schemaVer: number;
  gen: number;
  dryRun: boolean;
  verbose: boolean;
  includeAudit: boolean;
};

type VerificationQuery = {
  key: string;
  description: string;
  sql: string;
  params?: unknown[];
};

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

  console.warn("[db-backfill] No environment file loaded; ensure IG_ENV_FILE or DOTENV_CONFIG_PATH points to a secrets file.");
}

function selectDirectDatasource(): string {
  // 2-NODE CLUSTER: All connections are direct PostgreSQL (no Accelerate)
  const directCandidates = [
    process.env.RENDER_DB_INTERNAL_URL ?? "",
    process.env.RENDER_DB_EXTERNAL_URL ?? "",
    process.env.DATABASE_URL ?? "",
    process.env.PRIMARY_DATABASE_URL ?? "",
  ];

  const directUrl = directCandidates.find(
    (candidate) => candidate.trim().length > 0 && candidate.startsWith("postgresql://"),
  );

  if (!directUrl) {
    throw new Error(
      "RENDER_DB_INTERNAL_URL, RENDER_DB_EXTERNAL_URL (or a postgres:// DATABASE_URL) must be set for db_bootstrap_backfill. Load IG_ENV_FILE first.",
    );
  }

  return directUrl;
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//***@${parsed.host}`;
  } catch {
    return "(unavailable)";
  }
}

function parsePackMetaFile(value: string): string {
  const resolved = path.isAbsolute(value) ? value : path.join(process.cwd(), value);
  const contents = fs.readFileSync(resolved, "utf8");
  JSON.parse(contents); // ensure valid JSON
  return contents;
}

function parseArgs(argv: string[]): BackfillOptions {
  const options: BackfillOptions = {
    tenantId: "default",
    packHash: "",
    packMetaJson: "{}",
    schemaVer: 1,
    gen: 9,
    dryRun: true,
    verbose: false,
    includeAudit: true,
  };

  for (const arg of argv) {
    if (arg === "--apply") {
      options.dryRun = false;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }

    if (arg === "--skip-audit") {
      options.includeAudit = false;
      continue;
    }

    if (arg.startsWith("--tenant-id=")) {
      options.tenantId = arg.slice("--tenant-id=".length);
      continue;
    }

    if (arg.startsWith("--pack-hash=")) {
      options.packHash = arg.slice("--pack-hash=".length);
      continue;
    }

    if (arg.startsWith("--schema-ver=")) {
      const parsed = Number.parseInt(arg.slice("--schema-ver=".length), 10);
      if (!Number.isNaN(parsed)) {
        options.schemaVer = parsed;
      }
      continue;
    }

    if (arg.startsWith("--gen=")) {
      const parsed = Number.parseInt(arg.slice("--gen=".length), 10);
      if (!Number.isNaN(parsed)) {
        options.gen = parsed;
      }
      continue;
    }

    if (arg.startsWith("--pack-meta=")) {
      const filePath = arg.slice("--pack-meta=".length);
      options.packMetaJson = parsePackMetaFile(filePath);
      continue;
    }

    if (arg.startsWith("--pack-meta-json=")) {
      const jsonValue = arg.slice("--pack-meta-json=".length);
      JSON.parse(jsonValue); // ensure valid JSON
      options.packMetaJson = jsonValue;
      continue;
    }

    console.warn(`[db-backfill] Ignoring unknown argument '${arg}'.`);
  }

  if (!options.packHash) {
    throw new Error("--pack-hash=<hash> is required so tenant-linked objects reference a canonical dex pack.");
  }

  return options;
}

async function runStep(
  client: Client,
  description: string,
  sql: string,
  params: unknown[],
  options: BackfillOptions,
): Promise<StepResult> {
  console.log(`\n[db-backfill] ${description}`);

  if (options.verbose || options.dryRun) {
    console.log("[db-backfill] SQL:\n" + sql.trim().split("\n").map((line) => `  ${line}`).join("\n"));
  }

  if (options.dryRun) {
    console.log("[db-backfill] dry-run mode: query not executed.");
    return { key: description, description, rows: null };
  }

  const result = await client.query(sql, params);
  console.log(`[db-backfill] rows affected: ${result.rowCount}`);
  return { key: description, description, rows: result.rowCount };
}

async function runVerification(
  client: Client,
  options: BackfillOptions,
  queries: VerificationQuery[],
): Promise<void> {
  console.log("\n[db-backfill] Verification");
  for (const query of queries) {
    const result = await client.query<{ count: string }>(query.sql, query.params ?? []);
    const count = result.rows[0]?.count ?? "0";
    console.log(`[verify] ${query.description}: ${count}`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  loadEnvironment();
  const datasource = selectDirectDatasource();
  console.log(`[db-backfill] Using direct datasource ${maskUrl(datasource)}`);

  const client = new Client({ connectionString: datasource, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const results: StepResult[] = [];

  try {
    if (!options.dryRun) {
      await client.query("BEGIN");
    }

    results.push(
      await runStep(
        client,
        "Seed tenant",
        'INSERT INTO "Tenant" ("id") VALUES ($1) ON CONFLICT ("id") DO NOTHING',
        [options.tenantId],
        options,
      ),
    );

    results.push(
      await runStep(
        client,
        "Upsert dex pack",
        'INSERT INTO "DexPack" ("packHash", "schemaVer", "gen", "signedAt", "metaJson")\nVALUES ($1, $2, $3, NOW(), $4::jsonb)\nON CONFLICT ("packHash") DO UPDATE\nSET "schemaVer" = excluded."schemaVer",\n    "gen" = excluded."gen",\n    "metaJson" = excluded."metaJson",\n    "signedAt" = NOW()',
        [options.packHash, options.schemaVer, options.gen, options.packMetaJson],
        options,
      ),
    );

    results.push(
      await runStep(
        client,
        "Create trainer rows for existing users",
        'INSERT INTO "Trainer" ("id", "tenantId", "userId", "createdAt")\nSELECT CONCAT($2, u."id"), $1, u."id", NOW()\nFROM "User" u\nLEFT JOIN "Trainer" t ON t."userId" = u."id" AND t."tenantId" = $1\nWHERE t."id" IS NULL\nON CONFLICT ("id") DO NOTHING',
        [options.tenantId, TRAINER_PREFIX],
        options,
      ),
    );

    results.push(
      await runStep(
        client,
        "Create missing trainer settings",
        `INSERT INTO "TrainerSettings" ("trainerId", "activePack", "prefsJson")
SELECT t."id", $1, COALESCE(s."prefsJson", '{}'::jsonb)
FROM "Trainer" t
LEFT JOIN "TrainerSettings" s ON s."trainerId" = t."id"
WHERE s."trainerId" IS NULL`,
        [options.packHash],
        options,
      ),
    );

    results.push(
      await runStep(
        client,
        "Update PokemonInstance tenant/trainer/pack references",
        'UPDATE "PokemonInstance" pi\nSET "trainerId" = COALESCE(pi."trainerId", CONCAT($2, pi."ownerId")),\n    "tenantId" = COALESCE(pi."tenantId", $1),\n    "packHash" = COALESCE(pi."packHash", $3)\nWHERE (pi."trainerId" IS NULL OR pi."tenantId" IS NULL OR pi."packHash" IS NULL)',
        [options.tenantId, TRAINER_PREFIX, options.packHash],
        options,
      ),
    );

    results.push(
      await runStep(
        client,
        "Update Party trainer references",
        'UPDATE "Party" p\nSET "trainerId" = COALESCE(p."trainerId", CONCAT($2, p."ownerId"))\nWHERE p."trainerId" IS NULL',
        [options.tenantId, TRAINER_PREFIX],
        options,
      ),
    );

    results.push(
      await runStep(
        client,
        "Update Encounter tenant/trainer/pack references",
        'UPDATE "Encounter" e\nSET "trainerId" = COALESCE(e."trainerId", CONCAT($2, e."ownerId")),\n    "tenantId" = COALESCE(e."tenantId", $1),\n    "packHash" = COALESCE(e."packHash", $3)\nWHERE (e."trainerId" IS NULL OR e."tenantId" IS NULL OR e."packHash" IS NULL)',
        [options.tenantId, TRAINER_PREFIX, options.packHash],
        options,
      ),
    );

    results.push(
      await runStep(
        client,
        "Update Battle tenant/trainer references",
        'UPDATE "Battle" b\nSET "tenantId" = COALESCE(b."tenantId", $1),\n    "packHash" = COALESCE(b."packHash", $2),\n    "trainer1Id" = COALESCE(b."trainer1Id", CONCAT($3, b."p1Id")),\n    "trainer2Id" = COALESCE(b."trainer2Id", CONCAT($3, b."p2Id"))\nWHERE (b."tenantId" IS NULL OR b."packHash" IS NULL OR b."trainer1Id" IS NULL OR b."trainer2Id" IS NULL)',
        [options.tenantId, options.packHash, TRAINER_PREFIX],
        options,
      ),
    );

    if (options.includeAudit) {
      results.push(
        await runStep(
          client,
          "Update AuditLog tenant references",
          'UPDATE "AuditLog" a\nSET "tenantId" = COALESCE(a."tenantId", $1)\nWHERE a."tenantId" IS NULL',
          [options.tenantId],
          options,
        ),
      );
    }

    if (!options.dryRun) {
      await client.query("COMMIT");
    }
  } catch (error) {
    if (!options.dryRun) {
      await client.query("ROLLBACK");
    }
    throw error;
  }

  await runVerification(client, options, [
    {
      key: "trainers_per_tenant",
      description: `Trainer rows for tenant ${options.tenantId}`,
      sql: 'SELECT COUNT(*)::bigint AS count FROM "Trainer" WHERE "tenantId" = $1',
      params: [options.tenantId],
    },
    {
      key: "pokemon_missing_trainer",
      description: "PokemonInstance rows still missing trainerId",
      sql: 'SELECT COUNT(*)::bigint AS count FROM "PokemonInstance" WHERE "trainerId" IS NULL',
    },
    {
      key: "encounter_missing_pack",
      description: "Encounter rows still missing packHash",
      sql: 'SELECT COUNT(*)::bigint AS count FROM "Encounter" WHERE "packHash" IS NULL',
    },
    {
      key: "battle_missing_tenant",
      description: "Battle rows still missing tenantId",
      sql: 'SELECT COUNT(*)::bigint AS count FROM "Battle" WHERE "tenantId" IS NULL',
    },
  ]);

  await client.end();

  console.log("\n[db-backfill] Completed. Summary:");
  for (const result of results) {
    const label = result.description;
    const value = result.rows ?? "(dry-run)";
    console.log(`  - ${label}: ${value}`);
  }

  if (options.dryRun) {
    console.log("\n[db-backfill] dry-run complete. Re-run with --apply to execute changes.");
  }
}

main().catch((error) => {
  console.error("[db-backfill] Backfill failed", error);
  process.exitCode = 1;
});
