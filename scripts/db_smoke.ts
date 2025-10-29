import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

async function main(): Promise<void> {
  const prisma = new PrismaClient().$extends(withAccelerate());
  try {
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
