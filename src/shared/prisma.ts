import { PrismaClient } from "@prisma/client";
import { loadConfig } from "./config.js";

const globalPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaConnectPromise?: Promise<void>;
};

function createClient(): PrismaClient {
  if (globalPrisma.prisma) {
    return globalPrisma.prisma;
  }

  const config = loadConfig();
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL must be configured before Prisma initializes.");
  }

  try {
    // eslint-disable-next-line no-new
    new URL(config.databaseUrl);
  } catch (error) {
    throw new Error("DATABASE_URL is not a valid URL.");
  }

  const client = new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
    log: config.nodeEnv === "development" ? ["warn", "error"] : ["error"],
  });

  globalPrisma.prisma = client;
  return client;
}

const prismaClient = createClient();

if (!globalPrisma.prismaConnectPromise) {
  globalPrisma.prismaConnectPromise = prismaClient.$connect().catch((error) => {
    globalPrisma.prisma = undefined;
    throw error;
  });
}

export const prisma = prismaClient;

export async function ensurePrisma(): Promise<PrismaClient> {
  await globalPrisma.prismaConnectPromise;
  return prismaClient;
}
