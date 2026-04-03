/**
 * Shared database URL selection utilities for scripts
 * 
 * CRITICAL: All scripts creating PrismaClient instances MUST use these functions
 * to ensure environment-aware URL selection. See docs/database-url-selection.md
 * 
 * Last Updated: 2025-11-07
 * Contract Status: Absolute requirement (Patch.md)
 */

export type EnvVars = Record<string, string>;

export type UrlSelectionResult = {
  url: string;
  source: string;
  environment: string;
};

/**
 * Select database URL for Prisma Client query operations (seed, counts, CRUD)
 * 
 * UNIFIED ARCHITECTURE: All environments use PROD_DATABASE_URL (Render managed PostgreSQL)
 * LOCAL DEVELOPMENT: Falls back to DATABASE_ONPREMISE_DEV_PRIMARY (workstation offline mode)
 * 
 * @param envVars - Environment variables object
 * @returns Selected URL with metadata
 * @throws Error if no valid URL found
 */
export function selectQueryUrl(envVars: EnvVars): UrlSelectionResult {
  const isProd = process.env.NODE_ENV === "production";
  const environment = isProd ? "production" : "development";
  
  let url = "";
  let source = "";
  
  // Unified architecture: PROD_DATABASE_URL for all environments
  if (envVars.PROD_DATABASE_URL) {
    url = envVars.PROD_DATABASE_URL;
    source = "PROD_DATABASE_URL";
  } else if (envVars.RENDER_DB_EXTERNAL_URL) {
    url = envVars.RENDER_DB_EXTERNAL_URL;
    source = "RENDER_DB_EXTERNAL_URL";
  } else if (envVars.DATABASE_ONPREMISE_DEV_PRIMARY) {
    url = envVars.DATABASE_ONPREMISE_DEV_PRIMARY;
    source = "DATABASE_ONPREMISE_DEV_PRIMARY";
  }
  
  if (!url) {
    throw new Error(
      `No database URL found for ${environment}. ` +
      `Expected: PROD_DATABASE_URL or RENDER_DB_EXTERNAL_URL`
    );
  }
  
  return {
    url,
    source,
    environment,
  };
}

/**
 * Select database URL for migration operations
 * 
 * UNIFIED ARCHITECTURE: All migrations use PROD_DATABASE_URL (Render managed PostgreSQL)
 * 
 * On Render: PROD_DATABASE_URL or RENDER_DB_INTERNAL_URL (internal network)
 * From workstation: PROD_DATABASE_URL or RENDER_DB_EXTERNAL_URL (external network)
 * 
 * @param envVars - Environment variables object
 * @returns Selected URL with metadata
 * @throws Error if no valid direct URL found
 */
export function selectMigrationUrl(envVars: EnvVars): UrlSelectionResult {
  let url = "";
  let source = "";
  
  // Unified architecture: PROD_DATABASE_URL for migrations
  if (envVars.PROD_DATABASE_URL) {
    url = envVars.PROD_DATABASE_URL;
    source = "PROD_DATABASE_URL";
  } else if (envVars.RENDER_DB_EXTERNAL_URL) {
    url = envVars.RENDER_DB_EXTERNAL_URL;
    source = "RENDER_DB_EXTERNAL_URL";
  } else if (envVars.RENDER_DB_INTERNAL_URL) {
    url = envVars.RENDER_DB_INTERNAL_URL;
    source = "RENDER_DB_INTERNAL_URL";
  }
  
  if (!url) {
    throw new Error(
      "No database URL found for migrations. " +
      "Expected: PROD_DATABASE_URL or RENDER_DB_EXTERNAL_URL"
    );
  }
  
  return {
    url,
    source,
    environment: process.env.NODE_ENV || (process.env.RENDER ? "production" : "development"),
  };
}
