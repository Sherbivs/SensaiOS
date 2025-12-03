/**
 * Prisma Configuration File (Prisma 7+)
 *
 * This file configures the Prisma CLI for database operations including:
 * - Database URL configuration
 * - Schema file location
 * - Migration output path
 * - Seed script configuration
 *
 * @see https://www.prisma.io/docs/orm/reference/prisma-config-reference
 */
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  // Main schema file location
  schema: "prisma/schema.prisma",

  // Migration configuration
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },

  // Database connection configuration
  // Uses PROD_DATABASE_URL as primary (matches existing architecture)
  datasource: {
    url: env("PROD_DATABASE_URL"),
  },
});
