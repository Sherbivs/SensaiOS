import { config } from "./shared/config.js";
import { log } from "./shared/log.js";
import { prisma } from "./models/index.js";

export async function boot(): Promise<void> {
  // Placeholder entrypoint — ensures DB connectivity at startup in MVP.
  log.info("Infinity Gauntlet: toolchain online", { env: config.env });
  // Quick sanity check to validate DATABASE_URL and client init.
  await prisma.$queryRawUnsafe("SELECT 1;");
  log.info("Database connectivity OK");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  boot().catch((err) => {
    log.error("Fatal during boot", err);
    process.exit(1);
  });
}
