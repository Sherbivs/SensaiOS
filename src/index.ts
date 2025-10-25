import { config } from "./shared/config.js";
import { prisma } from "./models/index.js";

export async function boot(): Promise<void> {
  // Placeholder entrypoint — ensures DB connectivity at startup in MVP.
  // eslint-disable-next-line no-console
  console.log("Infinity Gauntlet: toolchain online. Env:", config.env);
  // Quick sanity check to validate DATABASE_URL and client init.
  await prisma.$queryRawUnsafe("SELECT 1;");
  // eslint-disable-next-line no-console
  console.log("Database connectivity OK.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  boot().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Fatal during boot:", err);
    process.exit(1);
  });
}
