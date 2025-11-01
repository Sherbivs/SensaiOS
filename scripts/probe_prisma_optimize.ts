const DEFAULT_ENV_FILE = "C:/Users/sherb/OneDrive/Documents/Key/Dev/.env";

if (!process.env.IG_ENV_FILE?.trim()) {
  process.env.IG_ENV_FILE = DEFAULT_ENV_FILE;
}

if (!process.env.__DEBUG_OPTIMIZE__) {
  process.env.__DEBUG_OPTIMIZE__ = "1";
}

async function main(): Promise<void> {
  try {
    const prismaModule = await import("../src/shared/prisma.js");
    const client = await prismaModule.ensurePrisma();
    console.log("transport", prismaModule.getPrismaTransport());
    await client.$queryRawUnsafe("SELECT 1");
    console.log("optimize probe ok");
    await client.$disconnect();
  } catch (error) {
    console.error("optimize probe failed", error);
    process.exitCode = 1;
  }
}

void main();