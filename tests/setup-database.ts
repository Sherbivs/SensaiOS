/**
 * Database Integration Test Setup
 * 
 * This setup file is used EXCLUSIVELY for database integration tests.
 * Unlike the global setup-env.ts which sets placeholder database URLs,
 * this setup loads actual database credentials and enables real connections.
 * 
 * Environment Detection:
 * - IG_ENVIRONMENT=local → Uses ONPREMISE-DEV-PRIMARY (workstation database)
 * - IG_ENVIRONMENT=cloud → Uses PROD_DATABASE_URL (cloud database)
 * - Not set → Auto-detects based on available environment variables
 * 
 * Usage: npm run test:database
 */

// Load .env file FIRST to get real database credentials
import 'dotenv/config';

// ===== ENVIRONMENT DETECTION =====

type TestEnvironment = 'local' | 'cloud' | 'auto';

function detectTestEnvironment(): TestEnvironment {
  // Explicit environment setting takes priority
  const explicitEnv = process.env.IG_ENVIRONMENT?.toLowerCase();
  if (explicitEnv === 'local' || explicitEnv === 'workstation' || explicitEnv === 'onpremise') {
    return 'local';
  }
  if (explicitEnv === 'cloud' || explicitEnv === 'render' || explicitEnv === 'production') {
    return 'cloud';
  }
  
  // Auto-detect based on available environment variables
  // Local workstation typically has ONPREMISE database configured
  if (process.env.DATABASE_ONPREMISE_DEV_PRIMARY) {
    return 'local';
  }
  
  // Cloud environment (Render) has RENDER_DB_* variables
  if (process.env.RENDER || process.env.RENDER_SERVICE_ID) {
    return 'cloud';
  }
  
  // Default to cloud if PROD_DATABASE_URL is available
  if (process.env.PROD_DATABASE_URL) {
    return 'cloud';
  }
  
  return 'auto';
}

function selectDatabaseUrl(env: TestEnvironment): { url: string; source: string } {
  switch (env) {
    case 'local': {
      // Use ONPREMISE-DEV-PRIMARY for local workstation testing
      const localUrl = process.env.DATABASE_ONPREMISE_DEV_PRIMARY;
      if (localUrl) {
        return { url: localUrl, source: 'ONPREMISE-DEV-PRIMARY' };
      }
      // Fallback to PROD if local not available
      console.warn('[database-test-setup] WARN: DATABASE_ONPREMISE_DEV_PRIMARY not set, falling back to PROD');
      break;
    }
    
    case 'cloud': {
      // Use PROD_DATABASE_URL for cloud testing
      const cloudUrl = process.env.PROD_DATABASE_URL;
      if (cloudUrl) {
        return { url: cloudUrl, source: 'CLOUD-PROD-MASTER' };
      }
      break;
    }
  }
  
  // Final fallback: try any available database URL
  const fallbackUrl = process.env.PROD_DATABASE_URL || 
                      process.env.DATABASE_URL || 
                      process.env.RENDER_DB_EXTERNAL_URL;
  
  if (fallbackUrl) {
    return { url: fallbackUrl, source: 'fallback' };
  }
  
  throw new Error(
    '[database-test-setup] ERROR: No database URL available.\n' +
    'For local testing: Set DATABASE_ONPREMISE_DEV_PRIMARY or IG_ENVIRONMENT=cloud\n' +
    'For cloud testing: Set PROD_DATABASE_URL or run on Render'
  );
}

// ===== SETUP EXECUTION =====

const testEnv = detectTestEnvironment();
const { url: rawDatabaseUrl, source: databaseSource } = selectDatabaseUrl(testEnv);

// Ensure SSL mode is set for cloud databases (Render PostgreSQL requires SSL)
function ensureSslMode(url: string): string {
  // Skip SSL for local databases
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return url;
  }
  
  // Check if SSL mode is already set
  if (url.includes('sslmode=')) {
    return url;
  }
  
  // Add SSL mode for cloud connections
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}sslmode=require`;
}

const databaseUrl = ensureSslMode(rawDatabaseUrl);

// Set the DATABASE_URL for Prisma to use
process.env.DATABASE_URL = databaseUrl;

// KEEP PRISMA_SKIP_INITIAL_CONNECT to prevent shared client from initializing
// The test files will create their own dedicated clients
process.env.PRISMA_SKIP_INITIAL_CONNECT = 'true';

// Set test environment
process.env.NODE_ENV = 'test';

// Mark this as a database integration test environment
process.env.IG_DATABASE_TEST = 'true';
process.env.IG_DATABASE_SOURCE = databaseSource;

// Log setup information
console.log('[database-test-setup] ════════════════════════════════════════════');
console.log(`[database-test-setup] Environment: ${testEnv.toUpperCase()}`);
console.log(`[database-test-setup] Database Source: ${databaseSource}`);
console.log(`[database-test-setup] Database URL: ${databaseUrl.replace(/:[^:@]+@/, ':***@')}`);
console.log('[database-test-setup] PRISMA_SKIP_INITIAL_CONNECT: kept (test creates own client)');
console.log('[database-test-setup] ════════════════════════════════════════════');
