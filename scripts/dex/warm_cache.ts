// Refreshes SpeciesSheet and downstream caches after dex seeding.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function refreshSpeciesSheet() {
  console.log("Refreshing SpeciesSheet materialized view…");
  await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY "SpeciesSheet"');
}

async function refreshPokemonCache() {
  console.log("Refreshing Pokemon cache artifacts…");
  const cacheModule = await import("../refresh_cache.mjs");
  if (typeof cacheModule.refresh !== "function") {
    throw new Error("refresh_cache.mjs did not export a refresh() helper");
  }
  await cacheModule.refresh();
}

async function main() {
  try {
    await refreshSpeciesSheet();
    await refreshPokemonCache();
    console.log("✅ Species caches warmed.");
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Dex cache warm failed:", error);
    process.exitCode = 1;
  });
}
