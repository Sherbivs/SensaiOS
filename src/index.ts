import { config } from "./shared/config.js";
import { log } from "./shared/log.js";
import { Prisma } from "@prisma/client";
import { initPrisma, prisma } from "./models/index.js";
import { bootDiscord } from "./bot/index.js";

export async function boot(): Promise<void> {
  // Placeholder entrypoint — ensures DB connectivity at startup in MVP.
  log.info("Infinity Gauntlet: toolchain online", { env: config.env });
  try {
    await initPrisma();
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);
    log.info("Database connectivity OK");
  } catch (error) {
    log.error("Database connectivity failed", error, {
      remediation: [
        "On Render, ensure render.yaml sets envVars.DATABASE_URL fromDatabase.connectionString (internal).",
        "For workers, confirm service type is 'Background Worker' and it references the same DB.",
      ],
    });
    throw error;
  }
  // Start Discord bot (no Message Content intent; slash-only)
  await bootDiscord();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  boot().catch((err) => {
    log.error("Fatal during boot", err);
    process.exit(1);
  });
}
