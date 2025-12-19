import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  // Schema location
  schema: "prisma/schema.prisma",
  
  // Migration configuration
  migrations: {
    path: "prisma/migrations",
  },
  
  // Database connection for CLI operations (migrate, db push, studio)
  // Runtime uses @prisma/adapter-pg directly in src/shared/prisma.ts
  datasource: {
    url: env("PROD_DATABASE_URL"),
  },
});
