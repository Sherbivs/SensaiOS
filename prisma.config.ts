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
import { defineConfig } from "prisma/config";

// Get database URL with fallback for build-time (when Render env vars may not be available)
// Priority: PROD_DATABASE_URL → DATABASE_URL → placeholder (for prisma generate only)
const databaseUrl = 
  process.env.PROD_DATABASE_URL || 
  process.env.DATABASE_URL || 
  process.env.RENDER_DB_EXTERNAL_URL ||
  // Placeholder for build-time generation (actual connection happens at runtime)
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

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
    url: databaseUrl,
  },
});
