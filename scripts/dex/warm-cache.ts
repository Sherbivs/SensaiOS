// Refreshes SpeciesSheet and downstream caches after dex seeding.
import { Prisma, PrismaClient } from "../../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { printSuccess, printError, printInfo, printWarning } from "../lib/output.js";

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
  printInfo("Refreshing SpeciesSheet materialized view…");
  try {
    await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY "SpeciesSheet"');
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      throw error;
    }

    printWarning("REFRESH MATERIALIZED VIEW denied (42501); retrying via public.refresh_species_sheet() helper.");
    await prisma.$executeRawUnsafe("SELECT public.refresh_species_sheet();");
  }
}

async function refreshPokemonCache() {
  printInfo("Refreshing Pokemon cache artifacts…");
  try {
    const cacheModule = await import("../refresh-cache.mjs");
    if (typeof cacheModule.refresh !== "function") {
      throw new Error("refresh_cache.mjs did not export a refresh() helper");
    }
    await cacheModule.refresh();
  } catch (error) {
    const moduleError = error as Error & { code?: string };
    const message = moduleError?.message ?? String(error);
    const missingOctokit =
      moduleError instanceof Error &&
      moduleError.code === "ERR_MODULE_NOT_FOUND" &&
      message.includes("'octokit'");
    const missingGithubConfig =
      moduleError instanceof Error &&
      /GITHUB_(REPO|TOKEN)/.test(message) &&
      message.includes("not configured");

    if (!missingOctokit && !missingGithubConfig) throw error;

    if (missingGithubConfig) {
      printWarning("GitHub cache replication not configured; skipping replication step.");
      printInfo("Species data refreshed locally; GitHub mirror unchanged.");
      return;
    }

    printWarning("Octokit not available; running fetch_pokemon.mjs directly.");
    const fallback = await import("../fetch-pokemon.mjs");
    if (typeof fallback.main !== "function") {
      throw new Error("fetch_pokemon.mjs did not export main()");
    }
    await fallback.main();
    printInfo("Skipped GitHub replication because octokit is unavailable in this environment.");
  }
}

async function main() {
  try {
    await refreshSpeciesSheet();
    await refreshPokemonCache();
    printSuccess("Species caches warmed.");
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

const isDirectExecution = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;

if (isDirectExecution) {
  main().catch((error) => {
    printError(`Dex cache warm failed: ${error}`);
    process.exitCode = 1;
  });
}
