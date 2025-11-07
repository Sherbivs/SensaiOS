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
  isAccelerate: boolean;
  source: string;
  environment: string;
};

/**
 * Select database URL for Prisma Client query operations (seed, counts, CRUD)
 * 
 * PRODUCTION: Uses DATABASE_POOL_URL (Accelerate) to match generated Prisma Client mode
 * DEVELOPMENT: Uses DATABASE_DIRECT_URL (Direct PostgreSQL) for faster iteration
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
  
  if (isProd) {
    // Production MUST use Accelerate URLs
    if (envVars.DATABASE_POOL_URL) {
      url = envVars.DATABASE_POOL_URL;
      source = "DATABASE_POOL_URL";
    } else if (envVars.DATABASE_ACCELERATE_URL) {
      url = envVars.DATABASE_ACCELERATE_URL;
      source = "DATABASE_ACCELERATE_URL";
    } else if (envVars.DATABASE_URL) {
      url = envVars.DATABASE_URL;
      source = "DATABASE_URL";
    }
  } else {
    // Development SHOULD use direct URLs
    if (envVars.DATABASE_EXTERNAL_URL) {
      url = envVars.DATABASE_EXTERNAL_URL;
      source = "DATABASE_EXTERNAL_URL";
    } else if (envVars.DATABASE_DIRECT_URL) {
      url = envVars.DATABASE_DIRECT_URL;
      source = "DATABASE_DIRECT_URL";
    } else if (envVars.DATABASE_URL) {
      url = envVars.DATABASE_URL;
      source = "DATABASE_URL";
    }
  }
  
  if (!url) {
    throw new Error(
      `No database URL found for ${environment}. ` +
      `Expected: ${isProd ? "DATABASE_POOL_URL" : "DATABASE_DIRECT_URL"}`
    );
  }
  
  const isAccelerate = url.startsWith("prisma://") || url.startsWith("prisma+");
  
  return {
    url,
    isAccelerate,
    source,
    environment,
  };
}

/**
 * Select database URL for migration operations
 * 
 * ALL ENVIRONMENTS: MUST use direct PostgreSQL URLs
 * Accelerate does NOT support DDL operations (CREATE TABLE, ALTER TABLE, etc.)
 * 
 * @param envVars - Environment variables object
 * @returns Selected URL with metadata
 * @throws Error if no valid direct URL found
 */
export function selectMigrationUrl(envVars: EnvVars): UrlSelectionResult {
  let url = "";
  let source = "";
  
  // ALWAYS prefer direct URLs for migrations
  if (envVars.DATABASE_EXTERNAL_URL) {
    url = envVars.DATABASE_EXTERNAL_URL;
    source = "DATABASE_EXTERNAL_URL";
  } else if (envVars.DATABASE_DIRECT_URL) {
    url = envVars.DATABASE_DIRECT_URL;
    source = "DATABASE_DIRECT_URL";
  } else if (envVars.DATABASE_URL) {
    url = envVars.DATABASE_URL;
    source = "DATABASE_URL";
  }
  
  if (!url) {
    throw new Error(
      "No database URL found for migrations. " +
      "Expected: DATABASE_EXTERNAL_URL or DATABASE_DIRECT_URL"
    );
  }
  
  const isAccelerate = url.startsWith("prisma://") || url.startsWith("prisma+");
  
  if (isAccelerate) {
    throw new Error(
      `Migration URL from ${source} is an Accelerate URL (${url.substring(0, 30)}...). ` +
      "Migrations require direct PostgreSQL URLs. Accelerate does NOT support DDL operations."
    );
  }
  
  return {
    url,
    isAccelerate: false,
    source,
    environment: process.env.NODE_ENV || "development",
  };
}

/**
 * Check if a URL is an Accelerate URL
 * 
 * @param url - Database URL to check
 * @returns True if Accelerate URL
 */
export function isAccelerateUrl(url: string): boolean {
  return url.startsWith("prisma://") || url.startsWith("prisma+");
}

/**
 * Log database URL selection decision
 * 
 * @param result - URL selection result
 * @param operation - Operation type (seed, migration, query, etc.)
 */
export function logUrlSelection(result: UrlSelectionResult, operation: string): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      message: "database.url.selected",
      operation,
      environment: result.environment,
      source: result.source,
      isAccelerate: result.isAccelerate,
      urlPrefix: result.url.substring(0, 30) + "...",
    })
  );
}

/**
 * Build environment overrides for child processes
 * 
 * @param result - URL selection result
 * @returns Environment variable overrides
 */
export function buildDatabaseEnv(result: UrlSelectionResult): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    DATABASE_URL: result.url,
  };
  
  if (result.isAccelerate) {
    env.PRISMA_CLIENT_ENGINE_TYPE = "dataproxy";
  } else {
    env.PRISMA_CLIENT_ENGINE_TYPE = undefined;
  }
  
  return env;
}
