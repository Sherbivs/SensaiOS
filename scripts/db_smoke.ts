import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

async function main(): Promise<void> {
  process.env.PRISMA_CLIENT_ENGINE_TYPE = "dataproxy";
  const datasourceUrl = process.env.DATABASE_URL ?? process.env.PRIMARY_DATABASE_URL;
  const prisma = new PrismaClient(
    datasourceUrl
      ? { datasourceUrl }
      : undefined,
  ).$extends(withAccelerate());
  try {
    const command = process.argv[2];

    if (command === "count-pokemon") {
      const count = await prisma.pokemonInstance.count();
      console.log(`cachedPokemonCount=${count}`);
      return;
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ ok: number }>>("SELECT 1 AS ok");
    console.log("Accelerate query result:", rows);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Accelerate smoke query failed", error);
  process.exit(1);
});
