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
  /** @deprecated Always false - Accelerate removed 2025-11-07. Kept for backward compatibility. */
  isAccelerate: boolean;
  source: string;
  environment: string;
};

/**
 * Select database URL for Prisma Client query operations (seed, counts, CRUD)
 * 
 * PRODUCTION: Uses PROD_DATABASE_URL (direct PostgreSQL local node)
 * DEVELOPMENT: Uses DEV_DATABASE_URL (direct PostgreSQL master) or DATABASE_LOCAL_URL (local workstation)
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
    // Production uses local node for <50ms latency
    if (envVars.PROD_DATABASE_URL) {
      url = envVars.PROD_DATABASE_URL;
      source = "PROD_DATABASE_URL";
    }
  } else {
    // Development uses master or local node
    if (envVars.DEV_DATABASE_URL) {
      url = envVars.DEV_DATABASE_URL;
      source = "DEV_DATABASE_URL";
    } else if (envVars.RENDER_DB_EXTERNAL_URL) {
      url = envVars.RENDER_DB_EXTERNAL_URL;
      source = "RENDER_DB_EXTERNAL_URL";
    } else if (envVars.DATABASE_LOCAL_URL) {
      url = envVars.DATABASE_LOCAL_URL;
      source = "DATABASE_LOCAL_URL";
    }
  }
  
  if (!url) {
    throw new Error(
      `No database URL found for ${environment}. ` +
      `Expected: ${isProd ? "PROD_DATABASE_URL" : "DEV_DATABASE_URL or RENDER_DB_EXTERNAL_URL"}`
    );
  }
  
  const isAccelerate = false; // No longer using Accelerate
  
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
 * 
 * On Render Node: Use RENDER_DB_INTERNAL_URL (internal network access to DEV database)
 * From laptop: Use DEV_DATABASE_URL or RENDER_DB_EXTERNAL_URL (external network access to DEV database)
 * 
 * @param envVars - Environment variables object
 * @returns Selected URL with metadata
 * @throws Error if no valid direct URL found
 */
export function selectMigrationUrl(envVars: EnvVars): UrlSelectionResult {
  let url = "";
  let source = "";
  
  // ALWAYS use direct URLs for migrations (DEV master is source of truth)
  if (envVars.DEV_DATABASE_URL) {
    url = envVars.DEV_DATABASE_URL;
    source = "DEV_DATABASE_URL";
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
      "Expected: DEV_DATABASE_URL or RENDER_DB_EXTERNAL_URL"
    );
  }
  
  const isAccelerate = false; // No longer using Accelerate
  
  return {
    url,
    isAccelerate: false,
    source,
    environment: process.env.NODE_ENV || "development",
  };
}

/**
 * Check if a URL is an Accelerate URL (deprecated - always returns false)
 * 
 * @param url - Database URL to check
 * @returns Always false (Accelerate removed)
 */
 */
export function isAccelerateUrl(url: string): boolean {
  return false; // Accelerate removed - always return false
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
  // 2-NODE CLUSTER: Always use direct PostgreSQL connections
  const env: Record<string, string | undefined> = {
    DATABASE_URL: result.url,
    PRISMA_CLIENT_ENGINE_TYPE: undefined, // Always undefined for direct connections
  };
  
  return env;
}
