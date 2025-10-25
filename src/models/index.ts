// Prisma client singleton and simple repository helpers

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Example: lightweight repo helpers (expand later)
export const UserRepo = {
  upsertByDiscordId: async (discordId: string, client: PrismaClient = prisma) =>
    client.user.upsert({
      where: { discordId },
      update: {},
      create: { discordId, coins: 0 },
    }),
};
