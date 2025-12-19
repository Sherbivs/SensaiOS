// Ensures PokemonInstance and Encounter rows reference seeded species entries.
import { Prisma, PrismaClient } from "../../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { seedDex } from "./seed_reference.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("PROD_DATABASE_URL or DATABASE_URL must be set");
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();
const __filename = fileURLToPath(import.meta.url);

type CliOptions = {
  dryRun: boolean;
  seedMissing: boolean;
};

function parseArgs(): CliOptions {
  const options: CliOptions = { dryRun: false, seedMissing: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--seed-missing") options.seedMissing = true;
  }
  return options;
}

async function collectMissingSpeciesIds(): Promise<Set<number>> {
  const rows = await prisma.$queryRaw<Array<{ speciesId: number | null }>>`
    SELECT DISTINCT "speciesId" FROM (
      SELECT pi."speciesId"
      FROM "PokemonInstance" pi
      LEFT JOIN "Species" s ON s.id = pi."speciesId"
      WHERE s.id IS NULL
      UNION
      SELECT e."speciesId"
      FROM "Encounter" e
      LEFT JOIN "Species" s2 ON s2.id = e."speciesId"
      WHERE s2.id IS NULL
    ) missing
    WHERE missing."speciesId" IS NOT NULL
  `;
  const result = new Set<number>();
  for (const row of rows) {
    if (row.speciesId !== null) {
      result.add(Number(row.speciesId));
    }
  }
  return result;
}

function isPermissionDeniedError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2010") {
    return false;
  }

  const meta = error.meta as { code?: string } | undefined;
  return meta?.code === "42501";
}

async function refreshSpeciesSheet() {
  try {
    await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY "SpeciesSheet"');
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      throw error;
    }

    console.warn("REFRESH MATERIALIZED VIEW denied (42501); retrying via public.refresh_species_sheet() helper.");
    await prisma.$executeRawUnsafe("SELECT public.refresh_species_sheet();");
  }
}

async function main() {
  const options = parseArgs();

  const [pokemonInstances, encounters] = await Promise.all([
    prisma.pokemonInstance.count(),
    prisma.encounter.count(),
  ]);

  console.log(`PokemonInstance rows: ${pokemonInstances}`);
  console.log(`Encounter rows: ${encounters}`);

  const missingBefore = await collectMissingSpeciesIds();
  if (missingBefore.size === 0) {
    console.log("All rows already reference seeded species. Nothing to backfill.");
    if (!options.dryRun) {
      await refreshSpeciesSheet();
      console.log("✅ Species references validated and materialized view refreshed.");
    }
    return;
  }

  console.log(`Found ${missingBefore.size} species IDs missing from the reference tables: ${[...missingBefore].join(", ")}`);

  if (options.dryRun) {
    console.log("Dry run enabled. Exiting without changes.");
    process.exitCode = 1;
    return;
  }

  if (!options.seedMissing) {
    throw new Error("Missing species detected. Re-run with --seed-missing to import canonical rows before enforcing FKs.");
  }

  console.log("Seeding missing species from bootstrap data…");
  await seedDex({ onlySpeciesIds: [...missingBefore] });

  const missingAfter = await collectMissingSpeciesIds();
  if (missingAfter.size > 0) {
    throw new Error(`Unable to resolve missing species IDs: ${[...missingAfter].join(", ")}`);
  }

  await refreshSpeciesSheet();
  console.log("✅ Species backfill complete. All references now point at seeded species.");
}

const isDirectExecution = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;

if (isDirectExecution) {
  main()
    .catch((error) => {
      console.error("Dex species backfill failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect().catch(() => undefined);
    });
}
